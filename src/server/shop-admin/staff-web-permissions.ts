import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";

export const STAFF_WEB_FULL_ACCESS_PERMISSION = "shop_admin.full_access" as const;

export const SHOP_STAFF_WEB_PERMISSION_TREE = [
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
    ],
  },
] as const;

export type ShopStaffWebPermission =
  (typeof SHOP_STAFF_WEB_PERMISSION_TREE)[number]["permissions"][number]["key"];

export type ShopStaffWebRoleKey = "cashier" | "manager" | "viewer";

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
