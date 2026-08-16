import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { ShopAdminPermission } from "./permissions";

export const STAFF_WEB_FULL_ACCESS_PERMISSION = "shop_admin.full_access" as const;

export const SHOP_STAFF_WEB_PERMISSION_TREE = [
  {
    groupKey: "storefront",
    label: "Storefront",
    permissions: [
      { key: "storefront.view", label: "View Storefront" },
      { key: "storefront.edit", label: "Edit Storefront products" },
      { key: "storefront.publish", label: "Publish Storefront products" },
      { key: "storefront.bulk_publish", label: "Bulk publish Storefront products" },
      { key: "storefront.promotions.manage", label: "Manage Storefront promotions" },
      { key: "storefront.images.manage", label: "Manage Storefront images" },
      { key: "storefront.settings.manage", label: "Manage Storefront settings" },
      { key: "storefront.audit.view", label: "View Storefront audit" },
    ],
  },
  {
    groupKey: "orders",
    label: "Customer orders",
    permissions: [
      { key: "orders.view", label: "View customer orders" },
      { key: "orders.manage", label: "Manage customer orders" },
      { key: "orders.delivery.view", label: "View delivery tracking" },
      { key: "orders.delivery.manage", label: "Manage delivery tracking" },
      { key: "orders.delivery.track", label: "Publish assigned courier location" },
    ],
  },
  {
    groupKey: "shop_admin",
    label: "Shop Admin",
    permissions: [
      {
        key: STAFF_WEB_FULL_ACCESS_PERMISSION,
        label: "Full Shop Admin access",
      },
    ],
  },
  {
    groupKey: "catalog",
    label: "Catalog",
    permissions: [
      { key: "catalog.read", label: "Read catalog" },
      { key: "catalog.write", label: "Edit catalog" },
      { key: "catalog.import", label: "Import catalog" },
      { key: "catalog.export", label: "Export catalog" },
    ],
  },
  {
    groupKey: "staff",
    label: "Staff",
    permissions: [
      { key: "staff.read", label: "Read staff" },
      { key: "staff.write", label: "Manage staff" },
    ],
  },
  {
    groupKey: "devices",
    label: "Devices",
    permissions: [
      { key: "devices.read", label: "Read devices" },
      { key: "devices.write", label: "Manage devices" },
    ],
  },
  {
    groupKey: "audit_settings",
    label: "Audit and settings",
    permissions: [
      { key: "audit.read", label: "Read audit" },
      { key: "settings.read", label: "Read settings" },
      { key: "settings.write", label: "Manage settings" },
    ],
  },
  {
    groupKey: "operations",
    label: "Operations",
    permissions: [
      { key: "pos.dashboard.read", label: "Read POS dashboard" },
      { key: "sync.read", label: "Read sync status" },
      { key: "sync.write", label: "Manage sync recovery notes" },
      { key: "history.write", label: "Edit history entries" },
    ],
  },
] as const;

export type ShopStaffWebPermission =
  (typeof SHOP_STAFF_WEB_PERMISSION_TREE)[number]["permissions"][number]["key"];

export const OWNER_ONLY_STAFF_WEB_PERMISSIONS: ReadonlySet<ShopStaffWebPermission> =
  new Set([
    STAFF_WEB_FULL_ACCESS_PERMISSION,
    "devices.write",
    "settings.write",
  ]);

export type ShopStaffWebRoleKey =
  | "cashier"
  | "courier"
  | "manager"
  | "pos_admin"
  | "viewer";

export const SHOP_STAFF_WEB_ROLE_TEMPLATES = {
  shop_manager_full: [
    STAFF_WEB_FULL_ACCESS_PERMISSION,
    "catalog.read",
    "catalog.write",
    "catalog.import",
    "catalog.export",
    "staff.read",
    "staff.write",
    "devices.read",
    "devices.write",
    "audit.read",
    "settings.read",
    "settings.write",
    "pos.dashboard.read",
    "sync.read",
    "sync.write",
    "history.write",
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
  catalog_manager: [
    "catalog.read",
    "catalog.write",
    "catalog.import",
    "catalog.export",
    "sync.read",
    "storefront.view",
    "storefront.edit",
    "storefront.publish",
    "storefront.bulk_publish",
  ],
  staff_manager: ["staff.read", "staff.write", "audit.read"],
  viewer: [
    "catalog.read",
    "staff.read",
    "devices.read",
    "audit.read",
    "settings.read",
    "pos.dashboard.read",
    "sync.read",
    "storefront.view",
    "storefront.audit.view",
    "orders.view",
    "orders.delivery.view",
  ],
  courier_tracking: ["orders.delivery.track"],
} as const satisfies Record<string, readonly ShopStaffWebPermission[]>;

export type ShopStaffWebRoleTemplateKey =
  keyof typeof SHOP_STAFF_WEB_ROLE_TEMPLATES;

const permissionSet = new Set<string>(
  SHOP_STAFF_WEB_PERMISSION_TREE.flatMap((group) =>
    group.permissions.map((permission) => permission.key),
  ),
);

export function isShopStaffWebPermission(
  value: string,
): value is ShopStaffWebPermission {
  return permissionSet.has(value);
}

export async function getEnabledStaffRolePermissions(
  supabase: SupabaseAdminClient,
  input: {
    roleKey: string;
    shopId: string;
  },
) {
  const { data, error } = await supabase
    .from("staff_role_permissions")
    .select("permission_key")
    .eq("shop_id", input.shopId)
    .eq("role_key", input.roleKey)
    .eq("enabled", true)
    .limit(100);

  if (error) {
    return {
      permissions: [] as ShopStaffWebPermission[],
      status: "error" as const,
    };
  }

  const permissions = (data ?? [])
    .map((row) => row.permission_key)
    .filter(
      (permission): permission is ShopStaffWebPermission =>
        typeof permission === "string" &&
        isShopStaffWebPermission(permission),
    );

  return {
    permissions,
    status: "ready" as const,
  };
}

export function hasStaffFullShopAdminWebAccess(
  permissions: readonly string[],
) {
  return permissions.includes(STAFF_WEB_FULL_ACCESS_PERMISSION);
}

export function hasAnyStaffShopAdminWebAccess(permissions: readonly string[]) {
  return permissions.some((permission) => isShopStaffWebPermission(permission));
}

function staffPermissionForShopAdminPermission(
  permission: ShopAdminPermission,
): ShopStaffWebPermission | null {
  if (
    permission === "catalog.manage" ||
    permission === "products.write" ||
    permission === "categories.write" ||
    permission === "suppliers.write"
  ) {
    return "catalog.write";
  }

  if (
    permission === "catalog.view" ||
    permission === "products.read" ||
    permission === "categories.read" ||
    permission === "suppliers.read"
  ) {
    return "catalog.read";
  }

  if (permission === "catalog.import" || permission === "catalog.export") {
    return permission;
  }

  if (permission === "staff.manage") {
    return "staff.write";
  }

  if (permission === "staff.view") {
    return "staff.read";
  }

  if (permission === "devices.manage") {
    return "devices.write";
  }

  if (permission === "devices.read" || permission === "devices.view_activity") {
    return "devices.read";
  }

  if (permission === "settings.manage" || permission === "settings.write") {
    return "settings.write";
  }

  if (permission === "settings.view" || permission === "settings.read") {
    return "settings.read";
  }

  if (permission === "audit.view" || permission === "audit.read") {
    return "audit.read";
  }

  if (permission === "history.view" || permission === "history.read") {
    return "sync.read";
  }

  if (permission === "history.write") {
    return "history.write";
  }

  if (permission === "pos.dashboard.read") {
    return "pos.dashboard.read";
  }

  if (permission === "sync.manage") {
    return "sync.write";
  }

  if (permission === "orders.view" || permission === "orders.manage") {
    return permission;
  }

  if (
    permission === "orders.delivery.view" ||
    permission === "orders.delivery.manage" ||
    permission === "orders.delivery.track"
  ) {
    return permission;
  }

  if (
    permission === "storefront.view" ||
    permission === "storefront.edit" ||
    permission === "storefront.publish" ||
    permission === "storefront.bulk_publish" ||
    permission === "storefront.promotions.manage" ||
    permission === "storefront.images.manage" ||
    permission === "storefront.settings.manage" ||
    permission === "storefront.audit.view"
  ) {
    return permission;
  }

  return null;
}

export function canStaffWebPerformShopAdminAction(
  permissions: readonly string[],
  permission: ShopAdminPermission,
) {
  if (hasStaffFullShopAdminWebAccess(permissions)) {
    return true;
  }

  const staffPermission = staffPermissionForShopAdminPermission(permission);

  return staffPermission ? permissions.includes(staffPermission) : false;
}
