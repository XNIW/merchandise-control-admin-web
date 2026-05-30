import "server-only";

import { getSupabaseServerBoundaryStatus } from "@/lib/supabase/server";
import {
  createSupabaseServerClient,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import type {
  AuditLog,
  Profile,
  Shop,
  ShopMember,
} from "@/domain/platform-admin/types";
import {
  authorizePlatformAdmin,
  authorizeCurrentPlatformAdmin,
  redactPlatformAdminError,
  type PlatformAdminAuthzDecision,
  type PlatformAdminSafetyGate,
  type RedactedPlatformAdminError,
} from "./authz";
import {
  getInventorySourceBoundaryStatus,
  type InventorySourceBoundaryStatus,
} from "./inventory-sources";
import {
  mapAuditLogRow,
  mapProfileRow,
  mapShopMemberRow,
  mapShopOwnerMappingRow,
  mapShopRow,
  type ShopOwnerMapping,
} from "./mappers";

export type PlatformAdminReadModelStatus =
  | "not_configured"
  | "blocked"
  | "ready_for_read_only_execution";

export type PlatformAdminReadModel = {
  status: PlatformAdminReadModelStatus;
  authz: PlatformAdminAuthzDecision;
  inventorySources: InventorySourceBoundaryStatus;
  safetyGates: readonly PlatformAdminSafetyGate[];
  readOnly: true;
  reason: string;
};

export type PlatformAdminLiveReadModelStatus =
  | "not_configured"
  | "unauthorized"
  | "error"
  | "ready";

export type PlatformAdminLiveReadModel = {
  status: PlatformAdminLiveReadModelStatus;
  authz: PlatformAdminAuthzDecision;
  profiles: readonly Profile[];
  shops: readonly Shop[];
  shopMembers: readonly ShopMember[];
  auditLogs: readonly AuditLog[];
  shopOwnerMappings: readonly ShopOwnerMapping[];
  platformAdminProfileIds: readonly string[];
  readOnly: true;
  reason: string;
  error?: RedactedPlatformAdminError;
};

export function getPlatformAdminReadModelFoundation(): PlatformAdminReadModel {
  const boundary = getSupabaseServerBoundaryStatus();
  const authz = authorizePlatformAdmin();
  const inventorySources = getInventorySourceBoundaryStatus();

  if (boundary.status !== "configured" || authz.status === "not_configured") {
    return {
      status: "not_configured",
      authz,
      inventorySources,
      safetyGates: authz.safetyGates,
      readOnly: true,
      reason:
        "Admin Web Supabase foundation is present, but runtime execution remains disabled.",
    };
  }

  if (authz.status !== "authorized") {
    return {
      status: "blocked",
      authz,
      inventorySources,
      safetyGates: authz.safetyGates,
      readOnly: true,
      reason:
        "Platform admin authorization did not pass; no read-only data access is allowed.",
    };
  }

  return {
    status: "ready_for_read_only_execution",
    authz,
    inventorySources,
    safetyGates: authz.safetyGates,
    readOnly: true,
    reason:
      "Boundary, schema, RLS, and generated types are present; live reads still require TASK-005G review, platform_admin bootstrap, and a valid server session.",
  };
}

export async function getPlatformAdminReadModel(
  client?: SupabaseServerClient | null,
): Promise<PlatformAdminLiveReadModel> {
  const supabase = client ?? (await createSupabaseServerClient());
  const emptyRows = {
    profiles: [],
    shops: [],
    shopMembers: [],
    auditLogs: [],
    shopOwnerMappings: [],
    platformAdminProfileIds: [],
  } as const;

  if (!supabase) {
    return {
      status: "not_configured",
      authz: authorizePlatformAdmin(),
      ...emptyRows,
      readOnly: true,
      reason:
        "Supabase runtime env is not configured for Admin Web read-only access.",
    };
  }

  const authz = await authorizeCurrentPlatformAdmin(supabase);

  if (authz.status !== "authorized") {
    return {
      status: authz.status === "not_configured" ? "not_configured" : "unauthorized",
      authz,
      ...emptyRows,
      readOnly: true,
      reason: authz.reason,
    };
  }

  const profilesResult = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const shopsResult = await supabase
    .from("shops")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const membersResult = await supabase
    .from("shop_members")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);
  const platformAdminsResult = await supabase
    .from("platform_admins")
    .select("*")
    .eq("status", "active")
    .is("revoked_at", null)
    .limit(100);
  const inventorySourcesResult = await supabase
    .from("shop_inventory_sources")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);
  const auditLogsResult = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const failedResult = [
    profilesResult,
    shopsResult,
    membersResult,
    platformAdminsResult,
    inventorySourcesResult,
    auditLogsResult,
  ].find((result) => result.error);

  if (failedResult?.error) {
    return {
      status: "error",
      authz,
      ...emptyRows,
      readOnly: true,
      reason: "Platform Admin read model could not be loaded.",
      error: redactPlatformAdminError(failedResult.error),
    };
  }

  return {
    status: "ready",
    authz,
    profiles: (profilesResult.data ?? []).map(mapProfileRow),
    shops: (shopsResult.data ?? []).map(mapShopRow),
    shopMembers: (membersResult.data ?? []).map(mapShopMemberRow),
    auditLogs: (auditLogsResult.data ?? []).map(mapAuditLogRow),
    shopOwnerMappings: (inventorySourcesResult.data ?? []).map(
      mapShopOwnerMappingRow,
    ),
    platformAdminProfileIds: (platformAdminsResult.data ?? []).map(
      (row) => row.profile_id,
    ),
    readOnly: true,
    reason: "Platform Admin read model loaded through Supabase RLS.",
  };
}
