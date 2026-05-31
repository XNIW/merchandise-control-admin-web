import "server-only";

import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { resolveCurrentShopAdminShellAccess } from "./shop-access";

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
>;
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
  shopMemberId: string;
  profileId: string;
  roleKey: string;
  membershipStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopAdminReadModelAuditLog = {
  auditLogId: string;
  actorProfileId: string | null;
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

function mapMemberRow(row: ShopMemberReadRow): ShopAdminReadModelMember {
  return {
    shopMemberId: row.shop_member_id,
    profileId: row.profile_id,
    roleKey: row.role_key,
    membershipStatus: row.membership_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditLogRow(row: AuditLogReadRow): ShopAdminReadModelAuditLog {
  return {
    auditLogId: row.audit_log_id,
    actorProfileId: row.actor_profile_id,
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
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return {
      status: "not_configured",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason:
        "Supabase runtime env is not configured for Shop Admin read-only access.",
    };
  }

  const supabase = options.client ?? (await createSupabaseServerClient(config));

  if (!supabase) {
    return {
      status: "not_configured",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: "Supabase server client is unavailable for Shop Admin reads.",
    };
  }

  const access = await resolveCurrentShopAdminShellAccess(supabase);

  if (access.status !== "shop_admin") {
    if (access.status === "not_configured" || access.status === "error") {
      return {
        status: access.status,
        ...emptyRows,
        readOnly: true,
        source: "supabase_server",
        reason: access.reason,
      };
    }

    return {
      status: "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason:
        access.status === "platform_admin"
          ? "This account is authorized for Platform Admin, not Shop Admin."
          : access.reason,
    };
  }

  const selectedShop =
    access.availableShops.find(
      (shop) => shop.shopId === options.requestedShopId,
    ) ?? access.selectedShop;

  const shopResult = await supabase
    .from("shops")
    .select(
      "shop_id,shop_code,shop_name,shop_status,created_at,updated_at,status_changed_at,suspended_at,archived_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .maybeSingle();

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
      selectedShop: mapShopRow(shopResult.data, selectedShop.role),
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
      "audit_log_id,actor_profile_id,scope,shop_id,event_key,severity,result,target_type,target_id,created_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .eq("scope", "shop")
    .order("created_at", { ascending: false })
    .limit(25);

  if (auditLogsResult.error) {
    return {
      status: "error",
      selectedShop: mapShopRow(shopResult.data, selectedShop.role),
      members: (membersResult.data ?? []).map(mapMemberRow),
      auditLogs: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop audit logs could not be loaded through the server boundary.",
      error: redactShopAdminReadModelError(auditLogsResult.error),
    };
  }

  return {
    status: "ready",
    selectedShop: mapShopRow(shopResult.data, selectedShop.role),
    members: (membersResult.data ?? []).map(mapMemberRow),
    auditLogs: (auditLogsResult.data ?? []).map(mapAuditLogRow),
    readOnly: true,
    source: "supabase_server",
    reason:
      "Shop Admin read model loaded server-side for the verified selected shop.",
  };
}
