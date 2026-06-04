import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type PosDeviceRow = Pick<
  Tables<"shop_devices">,
  | "app_version"
  | "created_at"
  | "device_identifier"
  | "device_type"
  | "display_name"
  | "last_seen_at"
  | "revoked_at"
  | "shop_device_id"
  | "shop_id"
  | "status"
  | "updated_at"
>;

type PosCredentialRow = Pick<
  Tables<"pos_device_credentials">,
  | "expires_at"
  | "issued_at"
  | "last_used_at"
  | "pos_device_credential_id"
  | "revoked_at"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
  | "updated_at"
>;

type PosSessionRow = Pick<
  Tables<"pos_sessions">,
  | "expires_at"
  | "heartbeat_count"
  | "issued_at"
  | "last_seen_at"
  | "pos_device_credential_id"
  | "pos_session_id"
  | "revoked_at"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
  | "updated_at"
>;

type StaffSafeRow = Pick<
  Database["public"]["Views"]["staff_accounts_safe"]["Row"],
  | "credential_status"
  | "display_name"
  | "locked_until"
  | "role_key"
  | "staff_code"
  | "staff_id"
  | "status"
>;

type PosAuditRow = Pick<
  Tables<"audit_logs">,
  | "audit_log_id"
  | "created_at"
  | "event_key"
  | "metadata_redacted"
  | "result"
  | "severity"
  | "target_id"
  | "target_type"
>;

export type ShopPosLiveDeviceRow = {
  appVersion: string | null;
  credentialExpiresAt: string | null;
  credentialLastUsedAt: string | null;
  credentialStatus: string;
  deviceIdentifier: string;
  deviceType: string;
  displayName: string;
  heartbeatCount: number;
  latestAuditAt: string | null;
  latestAuditEvent: string | null;
  latestAuditResult: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  sessionExpiresAt: string | null;
  sessionLastSeenAt: string | null;
  sessionStatus: string;
  shopDeviceId: string;
  staffCode: string | null;
  staffCredentialStatus: string | null;
  staffDisplayName: string | null;
  staffId: string | null;
  staffStatus: string | null;
  status: string;
  updatedAt: string;
};

export type ShopPosLiveSummary = {
  activeSessions: number;
  catalogSyncErrors: number;
  catalogSyncHasMore: boolean;
  expiredSessions: number;
  latestCatalogCursor: string | null;
  latestCatalogSyncAt: string | null;
  latestCatalogVersion: string | null;
  latestHeartbeatAt: string | null;
  linkedStaff: number;
  registeredDevices: number;
  revokedDevices: number;
  trustedActiveDevices: number;
};

export type ShopPosLiveReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  devices: readonly ShopPosLiveDeviceRow[];
  summary: ShopPosLiveSummary;
  readOnly: true;
  source: "supabase_admin_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopPosLiveReadModelOptions = {
  adminClient?: SupabaseAdminClient | null;
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
};

const emptySummary: ShopPosLiveSummary = {
  activeSessions: 0,
  catalogSyncErrors: 0,
  catalogSyncHasMore: false,
  expiredSessions: 0,
  latestCatalogCursor: null,
  latestCatalogSyncAt: null,
  latestCatalogVersion: null,
  latestHeartbeatAt: null,
  linkedStaff: 0,
  registeredDevices: 0,
  revokedDevices: 0,
  trustedActiveDevices: 0,
};

const emptyRows = {
  devices: [],
  selectedShop: null,
  summary: emptySummary,
} as const;

function redactPosLiveReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "pos_live_read_error";

  return {
    code,
    message: "POS live dashboard read model could not be loaded.",
  };
}

function isFutureTimestamp(value: string | null | undefined) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function latestByTimestamp<T>(
  rows: readonly T[],
  getTimestamp: (row: T) => string | null | undefined,
) {
  return rows.reduce<T | null>((latest, row) => {
    if (!latest) {
      return row;
    }

    const currentTime = Date.parse(getTimestamp(row) ?? "");
    const latestTime = Date.parse(getTimestamp(latest) ?? "");

    return currentTime > latestTime ? row : latest;
  }, null);
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function jsonRecord(value: Json): Record<string, Json> | null {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, Json>)
    : null;
}

function metadataString(row: PosAuditRow | null, key: string) {
  const metadata = row ? jsonRecord(row.metadata_redacted) : null;
  const value = metadata?.[key];

  return typeof value === "string" ? value : null;
}

function metadataBoolean(row: PosAuditRow | null, key: string) {
  const metadata = row ? jsonRecord(row.metadata_redacted) : null;

  return metadata?.[key] === true;
}

function groupByDevice<T extends { shop_device_id: string }>(rows: readonly T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const existing = grouped.get(row.shop_device_id) ?? [];
    existing.push(row);
    grouped.set(row.shop_device_id, existing);
  }

  return grouped;
}

function mapPosLiveRows(input: {
  auditRows: readonly PosAuditRow[];
  credentialRows: readonly PosCredentialRow[];
  deviceRows: readonly PosDeviceRow[];
  sessionRows: readonly PosSessionRow[];
  staffRows: readonly StaffSafeRow[];
}) {
  const credentialsByDevice = groupByDevice(input.credentialRows);
  const sessionsByDevice = groupByDevice(input.sessionRows);
  const staffById = new Map(input.staffRows.map((staff) => [staff.staff_id, staff]));
  const auditByTargetId = new Map<string, PosAuditRow>();

  for (const audit of input.auditRows) {
    if (!audit.target_id) {
      continue;
    }

    if (!auditByTargetId.has(audit.target_id)) {
      auditByTargetId.set(audit.target_id, audit);
    }
  }

  return input.deviceRows.map<ShopPosLiveDeviceRow>((device) => {
    const credential = latestByTimestamp(
      credentialsByDevice.get(device.shop_device_id) ?? [],
      (row) => row.updated_at ?? row.issued_at,
    );
    const session = latestByTimestamp(
      sessionsByDevice.get(device.shop_device_id) ?? [],
      (row) => row.last_seen_at ?? row.updated_at ?? row.issued_at,
    );
    const staff = staffById.get(session?.staff_id ?? credential?.staff_id ?? "") ?? null;
    const audit =
      auditByTargetId.get(device.shop_device_id) ??
      auditByTargetId.get(session?.pos_session_id ?? "") ??
      auditByTargetId.get(staff?.staff_id ?? "") ??
      null;

    return {
      appVersion: device.app_version,
      credentialExpiresAt: credential?.expires_at ?? null,
      credentialLastUsedAt: credential?.last_used_at ?? null,
      credentialStatus: credential?.status ?? "not_registered",
      deviceIdentifier: device.device_identifier,
      deviceType: device.device_type,
      displayName: device.display_name,
      heartbeatCount: session?.heartbeat_count ?? 0,
      latestAuditAt: audit?.created_at ?? null,
      latestAuditEvent: audit?.event_key ?? null,
      latestAuditResult: audit?.result ?? null,
      lastSeenAt: device.last_seen_at,
      revokedAt: device.revoked_at,
      sessionExpiresAt: session?.expires_at ?? null,
      sessionLastSeenAt: session?.last_seen_at ?? null,
      sessionStatus: session?.status ?? "not_started",
      shopDeviceId: device.shop_device_id,
      staffCode: staff?.staff_code ?? null,
      staffCredentialStatus: staff?.credential_status ?? null,
      staffDisplayName: staff?.display_name ?? null,
      staffId: staff?.staff_id ?? null,
      staffStatus: staff?.status ?? null,
      status: device.status,
      updatedAt: device.updated_at,
    };
  });
}

function summarize(
  rows: readonly ShopPosLiveDeviceRow[],
  auditRows: readonly PosAuditRow[],
): ShopPosLiveSummary {
  const linkedStaffIds = new Set(
    rows
      .map((row) => row.staffId)
      .filter((staffId): staffId is string => Boolean(staffId)),
  );
  const latestCatalogSuccess =
    auditRows.find(
      (row) =>
        row.event_key === "pos.catalog.pull.success" &&
        row.result === "success",
    ) ?? null;
  const catalogSyncErrors = auditRows.filter(
    (row) =>
      row.event_key === "pos.catalog.pull.failure" ||
      (row.event_key === "pos.catalog.pull.success" && row.result !== "success"),
  ).length;

  return {
    activeSessions: rows.filter(
      (row) => row.sessionStatus === "active" && isFutureTimestamp(row.sessionExpiresAt),
    ).length,
    catalogSyncErrors,
    catalogSyncHasMore: metadataBoolean(latestCatalogSuccess, "has_more"),
    expiredSessions: rows.filter(
      (row) =>
        row.sessionStatus === "expired" ||
        (row.sessionStatus === "active" && !isFutureTimestamp(row.sessionExpiresAt)),
    ).length,
    latestCatalogCursor: metadataString(latestCatalogSuccess, "sync_cursor_preview"),
    latestCatalogSyncAt: latestCatalogSuccess?.created_at ?? null,
    latestCatalogVersion: metadataString(latestCatalogSuccess, "catalog_version"),
    latestHeartbeatAt: latestTimestamp(rows.map((row) => row.sessionLastSeenAt ?? row.lastSeenAt)),
    linkedStaff: linkedStaffIds.size,
    registeredDevices: rows.length,
    revokedDevices: rows.filter((row) => row.status === "revoked").length,
    trustedActiveDevices: rows.filter(
      (row) =>
        row.status === "active" &&
        row.credentialStatus === "active" &&
        isFutureTimestamp(row.credentialExpiresAt),
    ).length,
  };
}

async function resolvePosLiveAccess(
  options: GetShopPosLiveReadModelOptions,
): Promise<
  | {
      selectedShop: ShopAdminShellShop;
    }
  | ShopPosLiveReadModel
> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_admin_server",
      reason: access.reason,
    };
  }

  return {
    selectedShop: access.selectedShop,
  };
}

export async function getShopPosLiveReadModel(
  options: GetShopPosLiveReadModelOptions = {},
): Promise<ShopPosLiveReadModel> {
  const access = await resolvePosLiveAccess(options);

  if ("status" in access) {
    return access;
  }

  const adminConfig = resolveSupabaseAdminConfig();

  if (adminConfig.status !== "configured") {
    return {
      status: "not_configured",
      selectedShop: access.selectedShop,
      devices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_admin_server",
      reason:
        "Supabase service-role runtime env is not configured for POS live reads.",
    };
  }

  const adminClient = options.adminClient ?? createSupabaseAdminClient(adminConfig);

  if (!adminClient) {
    return {
      status: "not_configured",
      selectedShop: access.selectedShop,
      devices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_admin_server",
      reason: "Supabase admin client is unavailable for POS live reads.",
    };
  }

  const selectedShop = access.selectedShop;
  const [
    devicesResult,
    credentialsResult,
    sessionsResult,
    staffResult,
    auditResult,
  ] = await Promise.all([
    adminClient
      .from("shop_devices")
      .select(
        "shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,revoked_at,created_at,updated_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .eq("device_type", "pos")
      .order("updated_at", { ascending: false })
      .limit(100),
    adminClient
      .from("pos_device_credentials")
      .select(
        "pos_device_credential_id,shop_id,shop_device_id,staff_id,status,staff_credential_version,issued_at,last_used_at,expires_at,revoked_at,updated_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .order("updated_at", { ascending: false })
      .limit(200),
    adminClient
      .from("pos_sessions")
      .select(
        "pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,status,staff_credential_version,issued_at,expires_at,last_seen_at,heartbeat_count,revoked_at,updated_at",
      )
      .eq("shop_id", selectedShop.shopId)
      .order("updated_at", { ascending: false })
      .limit(200),
    adminClient
      .from("staff_accounts_safe")
      .select(
        "staff_id,staff_code,display_name,role_key,status,credential_status,locked_until",
      )
      .eq("shop_id", selectedShop.shopId)
      .limit(200),
    adminClient
      .from("audit_logs")
      .select(
        "audit_log_id,event_key,severity,result,target_type,target_id,created_at,metadata_redacted",
      )
      .eq("scope", "shop")
      .eq("shop_id", selectedShop.shopId)
      .like("event_key", "pos.%")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (
    devicesResult.error ||
    credentialsResult.error ||
    sessionsResult.error ||
    staffResult.error ||
    auditResult.error
  ) {
    return {
      status: "error",
      selectedShop,
      devices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_admin_server",
      reason: "POS live rows could not be loaded through the server boundary.",
      error: redactPosLiveReadModelError(
        devicesResult.error ??
          credentialsResult.error ??
          sessionsResult.error ??
          staffResult.error ??
          auditResult.error,
      ),
    };
  }

  const devices = mapPosLiveRows({
    auditRows: auditResult.data ?? [],
    credentialRows: credentialsResult.data ?? [],
    deviceRows: devicesResult.data ?? [],
    sessionRows: sessionsResult.data ?? [],
    staffRows: staffResult.data ?? [],
  });

  return {
    status: "ready",
    selectedShop,
    devices,
    summary: summarize(devices, auditResult.data ?? []),
    readOnly: true,
    source: "supabase_admin_server",
    reason:
      "POS live rows are loaded server-side for the verified selected shop.",
  };
}
