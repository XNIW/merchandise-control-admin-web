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
  | "pos.dashboard.read"
  | "staff.view"
  | "staff.manage"
  | "devices.view_activity"
  | "devices.read"
  | "devices.manage"
  | "settings.view"
  | "settings.read"
  | "settings.manage"
  | "settings.write"
  | "sync.manage"
  | "audit.view"
  | "audit.read"
  | "storefront.view"
  | "storefront.edit"
  | "storefront.publish"
  | "storefront.bulk_publish"
  | "storefront.promotions.manage"
  | "storefront.images.manage"
  | "storefront.settings.manage"
  | "storefront.audit.view"
  | "orders.view"
  | "orders.manage"
  | "orders.delivery.view"
  | "orders.delivery.manage"
  | "orders.delivery.track";

export type ShopStaffRole = "cashier" | "courier" | "manager" | "viewer";

export type ShopStaffPermission =
  | "shop_admin.full_access"
  | "pos.sell"
  | "pos.pay"
  | "pos.refund"
  | "pos.void"
  | "pos.discount"
  | "pos.discount_over_limit"
  | "catalog.view"
  | "catalog.manage"
  | "catalog.price_edit"
  | "catalog.import"
  | "catalog.export"
  | "catalog.read"
  | "catalog.write"
  | "register.view"
  | "register.manage"
  | "users.view"
  | "users.manage"
  | "staff.read"
  | "staff.write"
  | "devices.read"
  | "devices.write"
  | "db.maintenance"
  | "settings.view"
  | "settings.write"
  | "settings.manage"
  | "settings.read"
  | "printer.manage"
  | "sync.manage"
  | "sync.read"
  | "sync.write"
  | "pos.dashboard.read"
  | "audit.view"
  | "audit.read"
  | "storefront.view"
  | "storefront.edit"
  | "storefront.publish"
  | "storefront.bulk_publish"
  | "storefront.promotions.manage"
  | "storefront.images.manage"
  | "storefront.settings.manage"
  | "storefront.audit.view"
  | "orders.view"
  | "orders.manage"
  | "orders.delivery.view"
  | "orders.delivery.manage"
  | "orders.delivery.track";

export const POS_ADMIN_STAFF_PERMISSION_KEYS = [
  "shop_admin.full_access",
  "pos.sell",
  "pos.pay",
  "pos.refund",
  "pos.void",
  "pos.discount",
  "catalog.view",
  "catalog.manage",
  "catalog.price_edit",
  "catalog.import",
  "catalog.export",
  "catalog.read",
  "catalog.write",
  "register.view",
  "register.manage",
  "users.view",
  "users.manage",
  "staff.read",
  "staff.write",
  "devices.read",
  "devices.write",
  "db.maintenance",
  "settings.view",
  "settings.write",
  "settings.manage",
  "settings.read",
  "printer.manage",
  "sync.manage",
  "sync.read",
  "sync.write",
  "pos.dashboard.read",
  "audit.view",
  "audit.read",
  "storefront.view",
  "storefront.edit",
  "storefront.publish",
  "storefront.bulk_publish",
  "storefront.promotions.manage",
  "storefront.images.manage",
  "storefront.settings.manage",
  "storefront.audit.view",
  "orders.view",
  "orders.manage",
  "orders.delivery.view",
  "orders.delivery.manage",
] as const satisfies readonly ShopStaffPermission[];

export type BuiltInShopStaffRole = ShopStaffRole | "pos_admin";

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
    "pos.dashboard.read",
    "staff.view",
    "staff.manage",
    "devices.view_activity",
    "devices.read",
    "devices.manage",
    "settings.view",
    "settings.read",
    "settings.manage",
    "settings.write",
    "sync.manage",
    "audit.view",
    "audit.read",
    "storefront.view",
    "storefront.edit",
    "storefront.publish",
    "storefront.bulk_publish",
    "storefront.promotions.manage",
    "storefront.images.manage",
    "storefront.settings.manage",
    "storefront.audit.view",
    "orders.view",
    "orders.manage",
    "orders.delivery.view",
    "orders.delivery.manage",
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
    "pos.dashboard.read",
    "staff.view",
    "staff.manage",
    "devices.view_activity",
    "devices.read",
    "settings.view",
    "settings.read",
    "sync.manage",
    "audit.view",
    "audit.read",
    "storefront.view",
    "storefront.edit",
    "storefront.publish",
    "storefront.bulk_publish",
    "storefront.promotions.manage",
    "storefront.images.manage",
    "storefront.settings.manage",
    "storefront.audit.view",
    "orders.view",
    "orders.manage",
    "orders.delivery.view",
    "orders.delivery.manage",
  ],
  viewer: [
    "catalog.view",
    "products.read",
    "categories.read",
    "suppliers.read",
    "history.view",
    "history.read",
    "members.view",
    "pos.dashboard.read",
    "staff.view",
    "devices.view_activity",
    "devices.read",
    "settings.view",
    "settings.read",
    "audit.view",
    "audit.read",
    "storefront.view",
    "storefront.audit.view",
    "orders.view",
    "orders.delivery.view",
  ],
};

export const SHOP_STAFF_PERMISSION_MATRIX: Record<
  BuiltInShopStaffRole,
  readonly ShopStaffPermission[]
> = {
  cashier: ["pos.sell", "pos.pay", "catalog.view", "register.view"],
  courier: ["orders.delivery.track"],
  manager: [
    "pos.sell",
    "pos.pay",
    "pos.refund",
    "catalog.view",
    "catalog.price_edit",
    "register.view",
  ],
  pos_admin: POS_ADMIN_STAFF_PERMISSION_KEYS,
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
  role: BuiltInShopStaffRole,
  permission: ShopStaffPermission,
) {
  return SHOP_STAFF_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

export function assertShopStaffHasNoWebAccess(role: BuiltInShopStaffRole) {
  if (SHOP_STAFF_PERMISSION_MATRIX[role]) {
    return true;
  }

  throw new Error("UNKNOWN_SHOP_STAFF_ROLE");
}
