import "server-only";

import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";

export type ShopScopedAdminRole = "shop_owner" | "shop_manager";
export type ShopScopedRouteRole = ShopScopedAdminRole | "viewer";

export type AdminRouteAccess =
  | {
      status: "platform_admin";
      userId: string;
      destination: "/platform";
    }
  | {
      status: "shop_admin";
      userId: string;
      role: ShopScopedAdminRole;
      primaryShopId: string;
      destination: "/shop";
    }
  | {
      status:
        | "not_configured"
        | "no_session"
        | "revoked"
        | "viewer_only"
        | "no_shop"
        | "error";
      reason: string;
      userId?: string;
    };

const shopRouteRoles = ["shop_owner", "shop_manager", "viewer"] as const;
const shopAdminRoles = new Set<ShopScopedRouteRole>([
  "shop_owner",
  "shop_manager",
]);

function isShopRouteRole(value: string | null | undefined): value is ShopScopedRouteRole {
  return shopRouteRoles.some((role) => role === value);
}

function toShopRouteRole(value: string | null | undefined) {
  return isShopRouteRole(value) ? value : null;
}

export function getAdminRouteDestination(access: AdminRouteAccess) {
  if (access.status === "platform_admin" || access.status === "shop_admin") {
    return access.destination;
  }

  return null;
}

export async function resolveCurrentAdminRouteAccess(
  client?: SupabaseServerClient | null,
): Promise<AdminRouteAccess> {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return {
      status: "not_configured",
      reason:
        "Supabase runtime env is not configured for console route authorization.",
    };
  }

  const supabase = client ?? (await createSupabaseServerClient(config));

  if (!supabase) {
    return {
      status: "not_configured",
      reason: "Supabase server client is unavailable for route authorization.",
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (userError || !userId) {
    return {
      status: "no_session",
      reason: "Sign in with a personal account to open an admin console.",
    };
  }

  const platformResult = await supabase
    .from("platform_admins")
    .select("status,revoked_at")
    .eq("profile_id", userId)
    .order("granted_at", { ascending: false })
    .limit(5);

  if (platformResult.error) {
    return {
      status: "error",
      reason: "Master Console authorization could not be resolved.",
      userId,
    };
  }

  const platformRows = platformResult.data ?? [];
  const activePlatformAdmin = platformRows.some(
    (row) => row.status === "active" && row.revoked_at === null,
  );

  if (activePlatformAdmin) {
    return {
      status: "platform_admin",
      userId,
      destination: "/platform",
    };
  }

  const membershipsResult = await supabase
    .from("shop_members")
    .select("shop_id,role_key,membership_status")
    .eq("profile_id", userId)
    .eq("membership_status", "active")
    .order("created_at", { ascending: true })
    .limit(20);

  if (membershipsResult.error) {
    return {
      status: "error",
      reason: "Shop membership authorization could not be resolved.",
      userId,
    };
  }

  const memberships = (membershipsResult.data ?? [])
    .map((membership) => ({
      role: toShopRouteRole(membership.role_key),
      shopId: membership.shop_id,
    }))
    .filter((membership) => membership.role && membership.shopId);
  const shopIds = Array.from(
    new Set(memberships.map((membership) => membership.shopId)),
  );
  const activeShopsResult =
    shopIds.length > 0
      ? await supabase
          .from("shops")
          .select("shop_id,shop_status")
          .in("shop_id", shopIds)
          .eq("shop_status", "active")
          .limit(20)
      : { data: [], error: null };

  if (activeShopsResult.error) {
    return {
      status: "error",
      reason: "Operational shop authorization could not be resolved.",
      userId,
    };
  }

  const operationalShopIds = new Set(
    (activeShopsResult.data ?? []).map((shop) => shop.shop_id),
  );
  const operationalMemberships = memberships.filter((membership) =>
    operationalShopIds.has(membership.shopId),
  );
  const primaryShopAdmin = memberships.find(
    (membership): membership is { role: ShopScopedAdminRole; shopId: string } =>
      Boolean(
        membership.role &&
          shopAdminRoles.has(membership.role) &&
          operationalShopIds.has(membership.shopId),
      ),
  );

  if (primaryShopAdmin) {
    return {
      status: "shop_admin",
      userId,
      role: primaryShopAdmin.role,
      primaryShopId: primaryShopAdmin.shopId,
      destination: "/shop",
    };
  }

  const hasRevokedPlatformAdmin = platformRows.some(
    (row) => row.status === "revoked" || row.revoked_at !== null,
  );

  if (hasRevokedPlatformAdmin) {
    return {
      status: "revoked",
      reason: "Master Console access has been revoked for this account.",
      userId,
    };
  }

  const hasViewerMembership = operationalMemberships.some(
    (membership) => membership.role === "viewer",
  );

  if (hasViewerMembership) {
    return {
      status: "viewer_only",
      reason:
        "This account has viewer access only and cannot open an admin console.",
      userId,
    };
  }

  return {
    status: "no_shop",
    reason:
      "No operational active shop owner or manager membership is available.",
    userId,
  };
}
