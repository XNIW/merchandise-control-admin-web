import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  createAccountIdentitySummary,
  type AccountIdentitySummary,
} from "@/lib/account-identity";
import {
  loadAuthIdentitySummariesByIds,
  type PlatformAuthIdentitySummary,
} from "@/server/platform-admin/auth-identities";
import { redactShopAdminJson, stringifyRedactedJson } from "./history-read-model";
import { resolveShopAdminDataAccess, type ShopAdminDataClient } from "./data-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";
import type { ShopAdminShellShop } from "./shop-access";

type AuditLogRow = Pick<
  Tables<"audit_logs">,
  | "audit_log_id"
  | "actor_profile_id"
  | "actor_staff_id"
  | "event_key"
  | "severity"
  | "result"
  | "target_type"
  | "target_id"
  | "metadata_redacted"
  | "created_at"
>;

export type ShopAuditReadModelStatus = ShopAdminReadModelStatus;

export type ShopAuditEvent = {
  actorIdentity: AccountIdentitySummary | null;
  actorKind: "personal_account" | "pos_staff" | "system";
  actorProfileId: string | null;
  actorStaffId: string | null;
  auditLogId: string;
  createdAt: string;
  eventKey: string;
  metadataPreview: string;
  metadataSummary: string;
  result: string;
  severity: string;
  targetId: string | null;
  targetType: string | null;
};

export type ShopAuditReadModel = {
  status: ShopAuditReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  events: readonly ShopAuditEvent[];
  filters: {
    eventQuery?: string;
    result?: string;
    severity?: string;
    targetId?: string;
  };
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

export type ShopAuditDetailReadModel = {
  status: ShopAuditReadModelStatus | "not_found" | "invalid_entry";
  selectedShop: ShopAdminShellShop | null;
  event: ShopAuditEvent | null;
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopAuditReadModelOptions = {
  client?: SupabaseServerClient | null;
  eventQuery?: string | null;
  requestedShopId?: string | null;
  result?: string | null;
  severity?: string | null;
  targetId?: string | null;
};

const emptyRows = {
  selectedShop: null,
  events: [],
} as const;

function redactAuditReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "shop_audit_read_error";

  return {
    code,
    message: "Shop audit read model could not be loaded.",
  };
}

function metadataSummary(value: Json) {
  const redacted = redactShopAdminJson(value);

  if (Array.isArray(redacted)) {
    return `${redacted.length} array items`;
  }

  if (redacted && typeof redacted === "object") {
    return `${Object.keys(redacted).length} metadata keys`;
  }

  return String(redacted ?? "None");
}

function availableAuthValue(value: string | undefined) {
  return value &&
    value !== "Auth identity unavailable" &&
    value !== "Email unavailable"
    ? value
    : null;
}

function identityFromAuthSummary(
  profileId: string,
  authIdentity: PlatformAuthIdentitySummary | undefined,
) {
  return createAccountIdentitySummary({
    displayName: availableAuthValue(authIdentity?.displayName),
    email: availableAuthValue(authIdentity?.email),
    profileId,
    rawProvider:
      authIdentity?.provider && authIdentity.provider !== "unknown"
        ? authIdentity.provider
        : null,
  });
}

async function loadScopedAccountIdentityMap(profileIds: readonly string[]) {
  const result = await loadAuthIdentitySummariesByIds(profileIds);

  return new Map(
    result.identities.map((identity) => [identity.authUserId, identity]),
  );
}

function mapAuditEvent(
  row: AuditLogRow,
  identitiesByProfileId: ReadonlyMap<string, PlatformAuthIdentitySummary> = new Map(),
): ShopAuditEvent {
  const actorKind = row.actor_profile_id
    ? "personal_account"
    : row.actor_staff_id
      ? "pos_staff"
      : "system";

  return {
    actorIdentity: row.actor_profile_id
      ? identityFromAuthSummary(
          row.actor_profile_id,
          identitiesByProfileId.get(row.actor_profile_id),
        )
      : null,
    actorKind,
    actorProfileId: row.actor_profile_id,
    actorStaffId: row.actor_staff_id,
    auditLogId: row.audit_log_id,
    createdAt: row.created_at,
    eventKey: row.event_key,
    metadataPreview: stringifyRedactedJson(row.metadata_redacted, 700),
    metadataSummary: metadataSummary(row.metadata_redacted),
    result: row.result,
    severity: row.severity,
    targetId: row.target_id,
    targetType: row.target_type,
  };
}

function supportedValue(value: string | null | undefined, allowed: string[]) {
  const normalized = value?.trim();

  return normalized && allowed.includes(normalized) ? normalized : undefined;
}

async function resolveAuditAccess(
  options: GetShopAuditReadModelOptions,
): Promise<
  | {
      selectedShop: ShopAdminShellShop;
      supabase: ShopAdminDataClient;
    }
  | ShopAuditReadModel
> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      filters: {},
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  return {
    selectedShop: access.selectedShop,
    supabase: access.supabase,
  };
}

export async function getShopAuditReadModel(
  options: GetShopAuditReadModelOptions = {},
): Promise<ShopAuditReadModel> {
  const access = await resolveAuditAccess(options);

  if ("status" in access) {
    return access;
  }

  const selectedShop = access.selectedShop;
  const filters = {
    eventQuery: options.eventQuery?.trim() || undefined,
    result: supportedValue(options.result, [
      "success",
      "blocked",
      "failure",
      "simulated",
    ]),
    severity: supportedValue(options.severity, [
      "info",
      "warning",
      "critical",
    ]),
    targetId: options.targetId?.trim() || undefined,
  };
  let query = access.supabase
    .from("audit_logs")
    .select(
      "audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at",
    )
    .eq("scope", "shop")
    .eq("shop_id", selectedShop.shopId);

  if (filters.eventQuery) {
    query = query.ilike("event_key", `%${filters.eventQuery}%`);
  }

  if (filters.result) {
    query = query.eq("result", filters.result);
  }

  if (filters.severity) {
    query = query.eq("severity", filters.severity);
  }

  if (filters.targetId) {
    query = query.eq("target_id", filters.targetId);
  }

  const auditResult = await query
    .order("created_at", { ascending: false })
    .limit(100);

  if (auditResult.error) {
    return {
      status: "error",
      selectedShop,
      events: [],
      filters,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop audit rows could not be loaded through RLS.",
      error: redactAuditReadModelError(auditResult.error),
    };
  }

  const auditRows = (auditResult.data ?? []) as AuditLogRow[];
  const actorProfileIds = Array.from(
    new Set(
      auditRows
        .map((row) => row.actor_profile_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const identitiesByProfileId =
    await loadScopedAccountIdentityMap(actorProfileIds);

  return {
    status: "ready",
    selectedShop,
    events: auditRows.map((row) => mapAuditEvent(row, identitiesByProfileId)),
    filters,
    readOnly: true,
    source: "supabase_server",
    reason:
      "Shop audit events loaded server-side for the verified selected shop.",
  };
}

export async function getShopAuditDetailReadModel(
  eventId: string,
  options: GetShopAuditReadModelOptions = {},
): Promise<ShopAuditDetailReadModel> {
  const normalizedEventId = eventId.trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedEventId,
    )
  ) {
    return {
      status: "invalid_entry",
      selectedShop: null,
      event: null,
      readOnly: true,
      source: "supabase_server",
      reason: "The requested audit event id is not a supported UUID.",
    };
  }

  const access = await resolveAuditAccess(options);

  if ("status" in access) {
    return {
      status: access.status,
      selectedShop: access.selectedShop,
      event: null,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
      error: access.error,
    };
  }

  const selectedShop = access.selectedShop;
  const auditResult = await access.supabase
    .from("audit_logs")
    .select(
      "audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at",
    )
    .eq("scope", "shop")
    .eq("shop_id", selectedShop.shopId)
    .eq("audit_log_id", normalizedEventId)
    .maybeSingle();

  if (auditResult.error) {
    return {
      status: "error",
      selectedShop,
      event: null,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop audit event detail could not be loaded through RLS.",
      error: redactAuditReadModelError(auditResult.error),
    };
  }

  const identitiesByProfileId = auditResult.data?.actor_profile_id
    ? await loadScopedAccountIdentityMap([auditResult.data.actor_profile_id])
    : new Map<string, PlatformAuthIdentitySummary>();

  return {
    status: auditResult.data ? "ready" : "not_found",
    selectedShop,
    event: auditResult.data
      ? mapAuditEvent(auditResult.data, identitiesByProfileId)
      : null,
    readOnly: true,
    source: "supabase_server",
    reason: auditResult.data
      ? "Shop audit event detail loaded server-side with redacted metadata."
      : "No audit event is visible for the verified selected shop.",
  };
}
