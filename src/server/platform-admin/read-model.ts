import "server-only";

import type {
  AuditLog,
  PlatformAdminRecord,
  PlatformDataHealth,
  PlatformDeviceOverview,
  PlatformSyncOverview,
  Profile,
  Shop,
  ShopMember,
} from "@/domain/platform-admin/types";
import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { authorizeCurrentPlatformAdmin } from "./authz";
import {
  mapProfileRow,
  mapShopMemberRow,
  mapShopOwnerMappingRow,
  mapShopRow,
  type AuditLogRowCandidate,
  type ProfileRowCandidate,
  type ShopMemberRowCandidate,
  type ShopOwnerMapping,
  type ShopOwnerMappingRowCandidate,
  type ShopRowCandidate,
} from "./mappers";

type Tables = Database["public"]["Tables"];

type PlatformReadStatus = "ready" | "not_configured" | "unauthorized" | "error";

type PlatformReadIssue = {
  area: "staff_accounts_safe";
  code: string;
  message: string;
  severity: "warning";
};

type StaffSafeSummary = {
  last_login_at: string | null;
  role_key: string | null;
  shop_id: string | null;
  staff_id: string | null;
  status: string | null;
  updated_at: string | null;
};

export type PlatformAdminReadModelFoundation = {
  boundary: "server_only";
  readOnly: true;
  safety: "platform_admin_rls";
  status: PlatformReadStatus;
  reason: string;
};

export type PlatformAdminLiveReadModel = PlatformAdminReadModelFoundation & {
  profiles: readonly Profile[];
  shops: readonly Shop[];
  shopMembers: readonly ShopMember[];
  auditLogs: readonly AuditLog[];
  shopOwnerMappings: readonly ShopOwnerMapping[];
  platformAdmins: readonly PlatformAdminRecord[];
  platformAdminProfileIds: readonly string[];
  shopDevices: readonly PlatformDeviceOverview[];
  syncEvents: readonly PlatformSyncOverview[];
  staffSafeRows: readonly StaffSafeSummary[];
  readIssues: readonly PlatformReadIssue[];
  dataHealth: PlatformDataHealth;
};

const emptyHealth: PlatformDataHealth = {
  shops_without_owner: 0,
  profiles_without_membership: 0,
  orphaned_memberships: 0,
  suspended_shops_with_recent_activity: 0,
  audit_coverage: "NOT_RUN",
  inventory_mapping_status: "NOT_RUN",
  sync_history_mapping_status: "NOT_RUN",
  device_schema_status: "NOT_RUN",
  staff_schema_status: "NOT_RUN",
  migration_drift_status: "NOT_RUN",
};

function foundation(
  status: PlatformReadStatus,
  reason: string,
): PlatformAdminReadModelFoundation {
  return {
    boundary: "server_only",
    readOnly: true,
    reason,
    safety: "platform_admin_rls",
    status,
  };
}

function emptyModel(
  status: Exclude<PlatformReadStatus, "ready">,
  reason: string,
): PlatformAdminLiveReadModel {
  return {
    ...foundation(status, reason),
    auditLogs: [],
    dataHealth: emptyHealth,
    platformAdminProfileIds: [],
    platformAdmins: [],
    profiles: [],
    readIssues: [],
    shopDevices: [],
    shopMembers: [],
    shopOwnerMappings: [],
    shops: [],
    staffSafeRows: [],
    syncEvents: [],
  };
}

function limitText(value: string, max = 180) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function redactPlatformMetadata(value: unknown): string {
  if (!value) {
    return "metadata_redacted: empty";
  }

  if (Array.isArray(value)) {
    return `metadata_redacted: array(${Math.min(value.length, 25)})`;
  }

  if (typeof value === "object") {
    return `metadata_redacted: object(${Object.keys(value).length} keys)`;
  }

  return "metadata_redacted: scalar";
}

function normalizeResult(value: string): AuditLog["result"] {
  if (
    value === "success" ||
    value === "blocked" ||
    value === "simulated" ||
    value === "failure"
  ) {
    return value;
  }

  return "blocked";
}

function normalizeScope(value: string): AuditLog["scope"] {
  return value === "shop" ? "shop" : "global";
}

function normalizeSeverity(value: string): AuditLog["severity"] {
  if (value === "info" || value === "warning" || value === "critical") {
    return value;
  }

  return "warning";
}

function mapAuditRow(row: AuditLogRowCandidate): AuditLog {
  return {
    actor_profile_id: row.actor_profile_id ?? undefined,
    audit_log_id: row.audit_log_id,
    created_at: row.created_at,
    event: row.event ?? row.event_key,
    metadata_summary: redactPlatformMetadata(row.metadata_redacted),
    result: normalizeResult(row.result),
    scope: normalizeScope(row.scope),
    severity: normalizeSeverity(row.severity),
    shop_id: row.shop_id ?? undefined,
    target_id: row.target_id ?? undefined,
    target_type: row.target_type ?? undefined,
  };
}

function mapPlatformAdminRow(
  row: Tables["platform_admins"]["Row"],
): PlatformAdminRecord {
  return {
    granted_at: row.granted_at,
    last_reviewed_at: row.last_reviewed_at ?? undefined,
    platform_admin_id: row.platform_admin_id,
    profile_id: row.profile_id,
    reason_redacted: row.reason_redacted ?? undefined,
    revoked_at: row.revoked_at ?? undefined,
    status: row.status === "active" ? "active" : "revoked",
  };
}

function mapDeviceRow(row: Tables["shop_devices"]["Row"]): PlatformDeviceOverview {
  return {
    app_version: row.app_version ?? undefined,
    device_identifier: row.device_identifier,
    device_type: row.device_type,
    display_name: row.display_name,
    last_seen_at: row.last_seen_at ?? undefined,
    shop_device_id: row.shop_device_id,
    shop_id: row.shop_id,
    status: row.status,
    updated_at: row.updated_at,
  };
}

function mapSyncRow(row: Tables["sync_events"]["Row"]): PlatformSyncOverview {
  return {
    changed_count: row.changed_count,
    created_at: row.created_at,
    domain: row.domain,
    event_type: row.event_type,
    metadata_summary: limitText(redactPlatformMetadata(row.metadata)),
    owner_user_id: row.owner_user_id,
    source: row.source ?? undefined,
    source_device_id: row.source_device_id ?? undefined,
    store_id: row.store_id ?? undefined,
    sync_event_id: String(row.id),
  };
}

function buildDataHealth(input: {
  auditLogs: readonly AuditLog[];
  platformAdmins: readonly PlatformAdminRecord[];
  profiles: readonly Profile[];
  shopDevices: readonly PlatformDeviceOverview[];
  shopMembers: readonly ShopMember[];
  shopOwnerMappings: readonly ShopOwnerMapping[];
  shops: readonly Shop[];
  staffSafeRows: readonly StaffSafeSummary[];
  syncEvents: readonly PlatformSyncOverview[];
  readIssues: readonly PlatformReadIssue[];
}): PlatformDataHealth {
  const activeOwnerShopIds = new Set(
    input.shopMembers
      .filter(
        (member) =>
          member.membership_status === "active" && member.role_id === "shop_owner",
      )
      .map((member) => member.shop_id),
  );
  const memberProfileIds = new Set(
    input.shopMembers
      .filter((member) => member.membership_status === "active")
      .map((member) => member.profile_id),
  );
  const profileIds = new Set(input.profiles.map((profile) => profile.profile_id));
  const shopIds = new Set(input.shops.map((shop) => shop.shop_id));
  const shopByOwner = new Map(
    input.shopOwnerMappings
      .filter((mapping) => mapping.mappingState === "mapped" && mapping.ownerUserId)
      .map((mapping) => [mapping.ownerUserId as string, mapping.shopId]),
  );
  const recentSyncShopIds = new Set(
    input.syncEvents
      .map((event) => shopByOwner.get(event.owner_user_id))
      .filter((shopId): shopId is string => Boolean(shopId)),
  );

  const platformAdminProfileIds = new Set(
    input.platformAdmins
      .filter((admin) => admin.status === "active")
      .map((admin) => admin.profile_id),
  );

  return {
    audit_coverage: input.auditLogs.length > 0 ? "PASS" : "PASS_WITH_NOTES",
    device_schema_status:
      input.shopDevices.length > 0 ? "PASS" : "PASS_WITH_NOTES",
    inventory_mapping_status: input.shopOwnerMappings.some(
      (mapping) => mapping.mappingState === "mapped",
    )
      ? "PASS"
      : "PASS_WITH_NOTES",
    migration_drift_status: "NOT_RUN",
    orphaned_memberships: input.shopMembers.filter(
      (member) => !profileIds.has(member.profile_id) || !shopIds.has(member.shop_id),
    ).length,
    profiles_without_membership: input.profiles.filter(
      (profile) =>
        !memberProfileIds.has(profile.profile_id) &&
        !platformAdminProfileIds.has(profile.profile_id),
    ).length,
    shops_without_owner: input.shops.filter(
      (shop) =>
        shop.shop_status !== "archived" &&
        shop.shop_status !== "pending_setup" &&
        !activeOwnerShopIds.has(shop.shop_id),
    ).length,
    staff_schema_status: input.readIssues.some(
      (issue) => issue.area === "staff_accounts_safe",
    )
      ? "BLOCKED"
      : input.staffSafeRows.length > 0
        ? "PASS"
        : "PASS_WITH_NOTES",
    suspended_shops_with_recent_activity: input.shops.filter(
      (shop) =>
        shop.shop_status === "suspended" && recentSyncShopIds.has(shop.shop_id),
    ).length,
    sync_history_mapping_status:
      input.syncEvents.length > 0 ? "PASS" : "PASS_WITH_NOTES",
  };
}

async function loadRows(supabase: SupabaseServerClient) {
  const [
    profilesResult,
    shopsResult,
    membersResult,
    platformAdminsResult,
    mappingsResult,
    auditResult,
    devicesResult,
    syncResult,
    staffResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "profile_id,display_name,profile_status,created_at,updated_at,disabled_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("shops")
      .select(
        "shop_id,shop_code,shop_name,shop_status,created_at,updated_at,archived_at,suspended_at,status_changed_at,status_reason_redacted",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("shop_members")
      .select(
        "shop_member_id,profile_id,shop_id,role_key,membership_status,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("platform_admins")
      .select(
        "platform_admin_id,profile_id,status,granted_at,revoked_at,last_reviewed_at,reason_redacted",
      )
      .order("granted_at", { ascending: false })
      .limit(100),
    supabase
      .from("shop_inventory_sources")
      .select(
        "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,created_at,verified_at,disabled_at",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("audit_logs")
      .select(
        "audit_log_id,actor_profile_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("shop_devices")
      .select(
        "shop_device_id,shop_id,device_identifier,display_name,device_type,status,app_version,last_seen_at,updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("sync_events")
      .select(
        "id,owner_user_id,store_id,source,source_device_id,domain,event_type,changed_count,metadata,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("staff_accounts_safe")
      .select("staff_id,shop_id,status,role_key,updated_at,last_login_at")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const firstError = [
    profilesResult.error,
    shopsResult.error,
    membersResult.error,
    platformAdminsResult.error,
    mappingsResult.error,
    auditResult.error,
    devicesResult.error,
    syncResult.error,
  ].find(Boolean);

  if (firstError) {
    return { error: firstError };
  }

  const readIssues: PlatformReadIssue[] = [];

  if (staffResult.error) {
    readIssues.push({
      area: "staff_accounts_safe",
      code:
        typeof staffResult.error.code === "string"
          ? staffResult.error.code
          : "staff_accounts_safe_read_blocked",
      message:
        "Staff safe read model is unavailable through the current RLS/grant boundary.",
      severity: "warning",
    });
  }

  const profiles = (profilesResult.data ?? []).map((row) =>
    mapProfileRow(row as ProfileRowCandidate),
  );
  const shops = (shopsResult.data ?? []).map((row) =>
    mapShopRow(row as ShopRowCandidate),
  );
  const shopMembers = (membersResult.data ?? []).map((row) =>
    mapShopMemberRow(row as ShopMemberRowCandidate),
  );
  const platformAdmins = (platformAdminsResult.data ?? []).map((row) =>
    mapPlatformAdminRow(row as Tables["platform_admins"]["Row"]),
  );
  const shopOwnerMappings = (mappingsResult.data ?? []).map((row) =>
    mapShopOwnerMappingRow(row as ShopOwnerMappingRowCandidate),
  );
  const auditLogs = (auditResult.data ?? []).map((row) =>
    mapAuditRow(row as AuditLogRowCandidate),
  );
  const shopDevices = (devicesResult.data ?? []).map((row) =>
    mapDeviceRow(row as Tables["shop_devices"]["Row"]),
  );
  const syncEvents = (syncResult.data ?? []).map((row) =>
    mapSyncRow(row as Tables["sync_events"]["Row"]),
  );
  const staffSafeRows = staffResult.error
    ? []
    : ((staffResult.data ?? []) as StaffSafeSummary[]);

  return {
    data: {
      auditLogs,
      dataHealth: buildDataHealth({
        auditLogs,
        platformAdmins,
        profiles,
        shopDevices,
        shopMembers,
        shopOwnerMappings,
        shops,
        staffSafeRows,
        syncEvents,
        readIssues,
      }),
      platformAdminProfileIds: platformAdmins
        .filter((admin) => admin.status === "active")
        .map((admin) => admin.profile_id),
      platformAdmins,
      profiles,
      readIssues,
      shopDevices,
      shopMembers,
      shopOwnerMappings,
      shops,
      staffSafeRows,
      syncEvents,
    },
  };
}

export function getPlatformAdminReadModelFoundation(): PlatformAdminReadModelFoundation {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return foundation(
      "not_configured",
      "Supabase runtime is not configured for the server Platform Admin boundary.",
    );
  }

  return foundation(
    "ready",
    "Server-side Platform Admin read model uses RLS and explicit column selection.",
  );
}

export async function getPlatformAdminReadModel(): Promise<PlatformAdminLiveReadModel> {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return emptyModel(
      "not_configured",
      "Supabase runtime is not configured for the server Platform Admin boundary.",
    );
  }

  const supabase = await createSupabaseServerClient(config);

  if (!supabase) {
    return emptyModel(
      "not_configured",
      "Supabase server client is unavailable for this request.",
    );
  }

  const authz = await authorizeCurrentPlatformAdmin(supabase);

  if (authz.status !== "authorized") {
    return emptyModel(authz.status, authz.reason);
  }

  const loaded = await loadRows(supabase);

  if ("error" in loaded) {
    return emptyModel(
      "error",
      "The Platform Admin read model could not be loaded through RLS.",
    );
  }

  return {
    ...foundation(
      "ready",
      "Server-side Platform Admin read model loaded through RLS.",
    ),
    ...loaded.data,
  };
}
