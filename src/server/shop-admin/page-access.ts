import "server-only";

import { resolveShopAdminDataAccess } from "./data-access";
import type {
  ShopAdminDataAccess,
  ShopAdminDataClient,
} from "./data-access";
import { canShopAdmin } from "./permissions";
import type { ShopAdminShellShop } from "./shop-access";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";

export type ShopPageAccessBundle =
  | {
      canExport: boolean;
      canImport: boolean;
      canManageProducts: boolean;
      principalKind: "personal_account" | "pos_staff_manager";
      selectedShop: ShopAdminShellShop;
      status: "ready";
      supabase: ShopAdminDataClient;
    }
  | {
      reason: string;
      status: Exclude<ShopAdminDataAccess["status"], "ready">;
    };

export async function resolveShopPageAccessBundle(
  requestedShopId?: string | null,
): Promise<ShopPageAccessBundle> {
  const access = await resolveShopAdminDataAccess({
    requestedShopId,
    strictRequestedShop: true,
  });

  if (access.status !== "ready") {
    return {
      reason: access.reason,
      status: access.status,
    };
  }

  if (access.principalKind === "personal_account") {
    return {
      canExport: canShopAdmin(access.selectedShop.role, "catalog.export"),
      canImport: canShopAdmin(access.selectedShop.role, "catalog.import"),
      canManageProducts: canShopAdmin(access.selectedShop.role, "products.write"),
      principalKind: "personal_account",
      selectedShop: access.selectedShop,
      status: "ready",
      supabase: access.supabase,
    };
  }

  return {
    canExport: canStaffWebPerformShopAdminAction(
      access.principal.permissions,
      "catalog.export",
    ),
    canImport: canStaffWebPerformShopAdminAction(
      access.principal.permissions,
      "catalog.import",
    ),
    canManageProducts: canStaffWebPerformShopAdminAction(
      access.principal.permissions,
      "products.write",
    ),
    principalKind: "pos_staff_manager",
    selectedShop: access.selectedShop,
    status: "ready",
    supabase: access.supabase,
  };
}
