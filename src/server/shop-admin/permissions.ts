import "server-only";

import type { ShopScopedAdminRole } from "@/server/auth/admin-routing";

export type ShopAdminPermission =
  | "catalog.view"
  | "catalog.manage"
  | "catalog.import"
  | "catalog.export"
  | "products.read"
  | "products.write"
  | "categories.read"
  | "categories.write"
  | "suppliers.read"
  | "suppliers.write"
  | "history.view"
  | "history.read"
  | "history.write"
  | "members.view"
  | "members.manage"
  | "staff.view"
  | "staff.manage"
  | "devices.view_activity"
  | "devices.read"
  | "devices.manage"
  | "settings.view"
  | "settings.read"
  | "settings.manage"
  | "settings.write"
  | "audit.view"
  | "audit.read";

export type ShopStaffRole = "cashier" | "manager" | "viewer";

export type ShopStaffPermission =
  | "pos.sell"
  | "pos.pay"
  | "pos.refund"
  | "catalog.view"
  | "catalog.price_edit"
  | "register.view";

export const SHOP_ADMIN_PERMISSION_MATRIX: Record<
  ShopScopedAdminRole | "viewer",
  readonly ShopAdminPermission[]
> = {
  shop_owner: [
    "catalog.view",
    "catalog.manage",
    "catalog.import",
    "catalog.export",
    "products.read",
    "products.write",
    "categories.read",
    "categories.write",
    "suppliers.read",
    "suppliers.write",
    "history.view",
    "history.read",
    "history.write",
    "members.view",
    "members.manage",
    "staff.view",
    "staff.manage",
    "devices.view_activity",
    "devices.read",
    "devices.manage",
    "settings.view",
    "settings.read",
    "settings.manage",
    "settings.write",
    "audit.view",
    "audit.read",
  ],
  shop_manager: [
    "catalog.view",
    "catalog.manage",
    "catalog.import",
    "catalog.export",
    "products.read",
    "products.write",
    "categories.read",
    "categories.write",
    "suppliers.read",
    "suppliers.write",
    "history.view",
    "history.read",
    "history.write",
    "members.view",
    "staff.view",
    "staff.manage",
    "devices.view_activity",
    "devices.read",
    "settings.view",
    "settings.read",
    "audit.view",
    "audit.read",
  ],
  viewer: [
    "catalog.view",
    "products.read",
    "categories.read",
    "suppliers.read",
    "history.view",
    "history.read",
    "members.view",
    "staff.view",
    "devices.view_activity",
    "devices.read",
    "settings.view",
    "settings.read",
    "audit.view",
    "audit.read",
  ],
};

export const SHOP_STAFF_PERMISSION_MATRIX: Record<
  ShopStaffRole,
  readonly ShopStaffPermission[]
> = {
  cashier: ["pos.sell", "pos.pay", "catalog.view", "register.view"],
  manager: [
    "pos.sell",
    "pos.pay",
    "pos.refund",
    "catalog.view",
    "catalog.price_edit",
    "register.view",
  ],
  viewer: ["catalog.view", "register.view"],
};

export function canShopAdmin(
  role: ShopScopedAdminRole | "viewer",
  permission: ShopAdminPermission,
) {
  return SHOP_ADMIN_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

export function assertShopAdminPermission(
  role: ShopScopedAdminRole | "viewer",
  permission: ShopAdminPermission,
) {
  if (!canShopAdmin(role, permission)) {
    throw new Error("SHOP_ADMIN_PERMISSION_DENIED");
  }
}

export function canShopStaff(
  role: ShopStaffRole,
  permission: ShopStaffPermission,
) {
  return SHOP_STAFF_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

export function assertShopStaffHasNoWebAccess(role: ShopStaffRole) {
  if (SHOP_STAFF_PERMISSION_MATRIX[role]) {
    return true;
  }

  throw new Error("UNKNOWN_SHOP_STAFF_ROLE");
}
