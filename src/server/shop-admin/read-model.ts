import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import {
  createAccountIdentitySummary,
  type AccountIdentitySummary,
} from "@/lib/account-identity";
import {
  loadAuthIdentitySummariesByIds,
  type PlatformAuthIdentitySummary,
} from "@/server/platform-admin/auth-identities";
import { resolveShopAdminDataAccess } from "./data-access";

type ShopRow = Tables<"shops">;
type ShopMemberRow = Tables<"shop_members">;
type AuditLogRow = Tables<"audit_logs">;
type ShopReadRow = Pick<
  ShopRow,
  | "shop_id"
  | "shop_code"
  | "shop_name"
  | "shop_status"
  | "created_at"
  | "updated_at"
  | "status_changed_at"
  | "suspended_at"
  | "archived_at"
> & {
  business_address?: string | null;
  business_city?: string | null;
  business_giro?: string | null;
  company_rut?: string | null;
  fiscal_identity_locked_by_platform?: boolean | null;
  legal_representative_rut?: string | null;
};
type ShopMemberReadRow = Pick<
  ShopMemberRow,
  | "shop_member_id"
  | "profile_id"
  | "role_key"
  | "membership_status"
  | "created_at"
  | "updated_at"
>;
type AuditLogReadRow = Pick<
  AuditLogRow,
  | "audit_log_id"
  | "actor_profile_id"
  | "actor_staff_id"
  | "event_key"
  | "severity"
  | "result"
  | "target_type"
  | "target_id"
  | "created_at"
>;

export type ShopAdminReadModelStatus =
  | "not_configured"
  | "unauthorized"
  | "empty"
  | "error"
  | "ready";

export type ShopAdminReadModelError = {
  code: string;
  message: string;
};

export type ShopAdminReadModelShop = {
  businessAddress?: string;
  businessCity?: string;
  businessGiro?: string;
  companyRut?: string;
  fiscalIdentityLockedByPlatform?: boolean;
  legalRepresentativeRut?: string;
  shopId: string;
  shopCode: string;
  shopName: string;
  shopStatus: string;
  role: "shop_owner" | "shop_manager";
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string | null;
  suspendedAt: string | null;
  archivedAt: string | null;
};

export type ShopAdminReadModelMember = {
  accountIdentity: AccountIdentitySummary;
  shopMemberId: string;
  profileId: string;
  roleKey: string;
  membershipStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopAdminReadModelAuditLog = {
  actorIdentity: AccountIdentitySummary | null;
  actorKind: "personal_account" | "pos_staff" | "system";
  auditLogId: string;
  actorProfileId: string | null;
  actorStaffId: string | null;
  eventKey: string;
  severity: string;
  result: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

export type ShopAdminReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminReadModelShop | null;
  members: readonly ShopAdminReadModelMember[];
  auditLogs: readonly ShopAdminReadModelAuditLog[];
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopAdminReadModelOptions = {
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
};

const emptyRows = {
  selectedShop: null,
  members: [],
  auditLogs: [],
} as const;

function redactShopAdminReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "shop_admin_read_error";

  return {
    code,
    message: "Shop Admin read model could not be loaded.",
  };
}

function mapShopRow(
  row: ShopReadRow,
  role: ShopAdminReadModelShop["role"],
): ShopAdminReadModelShop {
  return {
    businessAddress: row.business_address ?? undefined,
    businessCity: row.business_city ?? undefined,
    businessGiro: row.business_giro ?? undefined,
    companyRut: row.company_rut ?? undefined,
    fiscalIdentityLockedByPlatform:
      row.fiscal_identity_locked_by_platform ?? undefined,
    legalRepresentativeRut: row.legal_representative_rut ?? undefined,
    shopId: row.shop_id,
    shopCode: row.shop_code,
    shopName: row.shop_name,
    shopStatus: row.shop_status,
    role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusChangedAt: row.status_changed_at,
    suspendedAt: row.suspended_at,
    archivedAt: row.archived_at,
  };
}

async function loadSelectedShop(
  supabase: SupabaseServerClient,
  shopId: string,
) {
  const fiscalSelect =
    "shop_id,shop_code,shop_name,shop_status,company_rut,business_giro,business_address,business_city,legal_representative_rut,fiscal_identity_locked_by_platform,created_at,updated_at,status_changed_at,suspended_at,archived_at";
  const baseSelect =
    "shop_id,shop_code,shop_name,shop_status,created_at,updated_at,status_changed_at,suspended_at,archived_at";
  const result = await supabase
    .from("shops")
    .select(fiscalSelect)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!result.error) {
    return result;
  }

  return supabase
    .from("shops")
    .select(baseSelect)
    .eq("shop_id", shopId)
    .maybeSingle();
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

function mapMemberRow(
  row: ShopMemberReadRow,
  identitiesByProfileId: ReadonlyMap<string, PlatformAuthIdentitySummary> = new Map(),
): ShopAdminReadModelMember {
  return {
    accountIdentity: identityFromAuthSummary(
      row.profile_id,
      identitiesByProfileId.get(row.profile_id),
    ),
    shopMemberId: row.shop_member_id,
    profileId: row.profile_id,
    roleKey: row.role_key,
    membershipStatus: row.membership_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditLogRow(
  row: AuditLogReadRow,
  identitiesByProfileId: ReadonlyMap<string, PlatformAuthIdentitySummary> = new Map(),
): ShopAdminReadModelAuditLog {
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
    auditLogId: row.audit_log_id,
    actorProfileId: row.actor_profile_id,
    actorStaffId: row.actor_staff_id,
    eventKey: row.event_key,
    severity: row.severity,
    result: row.result,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at,
  };
}

export async function getShopAdminReadModel(
  options: GetShopAdminReadModelOptions = {},
): Promise<ShopAdminReadModel> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;

  const shopResult = await loadSelectedShop(supabase, selectedShop.shopId);

  if (shopResult.error) {
    return {
      status: "error",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: "Selected shop could not be loaded through the server boundary.",
      error: redactShopAdminReadModelError(shopResult.error),
    };
  }

  if (!shopResult.data) {
    return {
      status: "empty",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason:
      "No live shop rows are visible for the server-verified selected shop.",
    };
  }

  const selectedShopRow = shopResult.data as ShopReadRow;

  const membersResult = await supabase
    .from("shop_members")
    .select(
      "shop_member_id,profile_id,shop_id,role_key,membership_status,created_at,updated_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (membersResult.error) {
    return {
      status: "error",
      selectedShop: mapShopRow(selectedShopRow, selectedShop.role),
      members: [],
      auditLogs: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop members could not be loaded through the server boundary.",
      error: redactShopAdminReadModelError(membersResult.error),
    };
  }

  const auditLogsResult = await supabase
    .from("audit_logs")
    .select(
      "audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,created_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .eq("scope", "shop")
    .order("created_at", { ascending: false })
    .limit(25);

  if (auditLogsResult.error) {
    return {
      status: "error",
      selectedShop: mapShopRow(selectedShopRow, selectedShop.role),
      members: ((membersResult.data ?? []) as ShopMemberReadRow[]).map((row) =>
        mapMemberRow(row),
      ),
      auditLogs: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop audit logs could not be loaded through the server boundary.",
      error: redactShopAdminReadModelError(auditLogsResult.error),
    };
  }

  const memberRows = (membersResult.data ?? []) as ShopMemberReadRow[];
  const auditRows = (auditLogsResult.data ?? []) as AuditLogReadRow[];
  const scopedProfileIds = Array.from(
    new Set(
      [
        ...memberRows.map((row) => row.profile_id),
        ...auditRows
          .map((row) => row.actor_profile_id)
          .filter((value): value is string => Boolean(value)),
      ].filter(Boolean),
    ),
  );
  const identitiesByProfileId =
    await loadScopedAccountIdentityMap(scopedProfileIds);

  return {
    status: "ready",
    selectedShop: mapShopRow(selectedShopRow, selectedShop.role),
    members: memberRows.map((row) => mapMemberRow(row, identitiesByProfileId)),
    auditLogs: auditRows.map((row) => mapAuditLogRow(row, identitiesByProfileId)),
    readOnly: true,
    source: "supabase_server",
    reason:
      "Shop Admin read model loaded server-side for the verified selected shop.",
  };
}
