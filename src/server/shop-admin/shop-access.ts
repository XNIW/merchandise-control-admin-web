import "server-only";

import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
  type SupabaseServerClient,
} from "@/lib/supabase/server";
import {
  resolveCurrentAdminRouteAccess,
  type AdminRouteAccess,
  type ShopScopedAdminRole,
} from "@/server/auth/admin-routing";

export type ShopAdminShellShop = {
  shopId: string;
  shopCode: string;
  shopName: string;
  shopStatus: string;
  role: ShopScopedAdminRole;
};

export type ShopAdminShellAccess =
  | {
      status: "shop_admin";
      userId: string;
      availableShops: ShopAdminShellShop[];
      selectedShop: ShopAdminShellShop;
    }
  | Exclude<AdminRouteAccess, { status: "shop_admin" }>;

const shopAdminRoles = new Set<string>(["shop_owner", "shop_manager"]);

function toShopAdminRole(value: string | null | undefined) {
  return value && shopAdminRoles.has(value)
    ? (value as ShopScopedAdminRole)
    : null;
}

export async function resolveCurrentShopAdminShellAccess(
  client?: SupabaseServerClient | null,
): Promise<ShopAdminShellAccess> {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return {
      status: "not_configured",
      reason:
        "Supabase runtime env is not configured for Shop Admin authorization.",
    };
  }

  const supabase = client ?? (await createSupabaseServerClient(config));

  if (!supabase) {
    return {
      status: "not_configured",
      reason: "Supabase server client is unavailable for Shop Admin authorization.",
    };
  }

  const routeAccess = await resolveCurrentAdminRouteAccess(supabase);

  if (routeAccess.status !== "shop_admin") {
    return routeAccess;
  }

  const membershipsResult = await supabase
    .from("shop_members")
    .select("shop_id,role_key,membership_status")
    .eq("profile_id", routeAccess.userId)
    .eq("membership_status", "active")
    .order("created_at", { ascending: true })
    .limit(50);

  if (membershipsResult.error) {
    return {
      status: "error",
      reason: "Shop membership list could not be resolved.",
      userId: routeAccess.userId,
    };
  }

  const memberships = (membershipsResult.data ?? [])
    .map((membership) => ({
      role: toShopAdminRole(membership.role_key),
      shopId: membership.shop_id,
    }))
    .filter(
      (membership): membership is { role: ShopScopedAdminRole; shopId: string } =>
        Boolean(membership.role && membership.shopId),
    );
  const shopIds = Array.from(
    new Set(memberships.map((membership) => membership.shopId)),
  );

  if (shopIds.length === 0) {
    return {
      status: "no_shop",
      reason: "No active shop owner or manager membership is available.",
      userId: routeAccess.userId,
    };
  }

  const shopsResult = await supabase
    .from("shops")
    .select("shop_id,shop_code,shop_name,shop_status")
    .in("shop_id", shopIds)
    .order("shop_name", { ascending: true })
    .limit(50);

  if (shopsResult.error) {
    return {
      status: "error",
      reason: "Authorized shop list could not be resolved.",
      userId: routeAccess.userId,
    };
  }

  const membershipByShopId = new Map(
    memberships.map((membership) => [membership.shopId, membership]),
  );
  const availableShops = (shopsResult.data ?? [])
    .map((shop) => {
      const membership = membershipByShopId.get(shop.shop_id);

      if (!membership) {
        return null;
      }

      return {
        shopId: shop.shop_id,
        shopCode: shop.shop_code,
        shopName: shop.shop_name,
        shopStatus: shop.shop_status,
        role: membership.role,
      };
    })
    .filter((shop): shop is ShopAdminShellShop => Boolean(shop))
    .filter((shop) => shop.shopStatus !== "archived");
  const selectedShop =
    availableShops.find((shop) => shop.shopId === routeAccess.primaryShopId) ??
    availableShops[0];

  if (!selectedShop) {
    return {
      status: "no_shop",
      reason: "No active shop owner or manager membership is available.",
      userId: routeAccess.userId,
    };
  }

  return {
    status: "shop_admin",
    userId: routeAccess.userId,
    availableShops,
    selectedShop,
  };
}
