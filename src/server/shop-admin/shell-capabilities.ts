import "server-only";

import type { ShopAdminDataAccess } from "./data-access";
import type { ShopSectionKey, ShopNavigationSection } from "@/components/shop/shopSections";
import { canShopAdmin, type ShopAdminPermission } from "./permissions";
import { canStaffWebPerformShopAdminAction } from "./staff-web-permissions";

type ReadyAccess = Extract<ShopAdminDataAccess, { status: "ready" }>;

const pagePermissions: Record<ShopSectionKey, readonly ShopAdminPermission[]> = {
  overview: ["settings.view"], products: ["products.read"], categories: ["categories.read"],
  suppliers: ["suppliers.read"], storefront: ["storefront.view"], orders: ["orders.view"],
  afterSales: ["orders.manage"], reviews: ["storefront.audit.view"], courier: ["orders.delivery.track"],
  importExport: ["catalog.import", "catalog.export"], sync: ["history.read", "sync.manage"],
  history: ["history.read"], paymentHistory: [], members: ["members.view"], roles: ["staff.view"],
  staff: ["staff.view"], pos: ["pos.dashboard.read"], devices: ["devices.read"],
  settings: ["settings.read"], audit: ["audit.read"],
};

export function canOpenShopSection(access: ReadyAccess, key: ShopSectionKey) {
  if (access.principalKind === "pos_staff_manager" && access.principal.roleKey === "courier") {
    return key === "courier" && canStaffWebPerformShopAdminAction(access.principal.permissions, "orders.delivery.track");
  }
  return pagePermissions[key].some(permission => access.principalKind === "personal_account"
    ? canShopAdmin(access.selectedShop.role, permission)
    : canStaffWebPerformShopAdminAction(access.principal.permissions, permission));
}

export function shopShellIdentity(access: ReadyAccess) {
  return {
    roleLabel: access.principalKind === "personal_account"
      ? (access.selectedShop.role === "shop_owner" ? "Shop Owner" : "Shop Manager")
      : ({ pos_admin: "Shop administrator", manager: "Shop Manager", courier: "Courier Mode" } as const)[access.principal.roleKey],
    methodLabel: access.principalKind === "personal_account" ? "Personal account sign-in" : "Shop-code sign-in",
  };
}

export function visibleShopNavigation(access: ReadyAccess, sections: readonly ShopNavigationSection[]) {
  return sections.map(section => ({ ...section, items: section.items.filter(item => canOpenShopSection(access, item.key)) }))
    .filter(section => section.items.length > 0);
}

export function staffShopLanding(access: ReadyAccess) {
  if (access.principalKind !== "pos_staff_manager") return null;
  if (access.principal.roleKey === "courier") return canOpenShopSection(access, "courier") ? "/shop/courier" : null;
  // Prefer an implemented operational surface even before the new profile RPC is deployed.
  const order: readonly [ShopSectionKey, string][] = [
    ["products", "/shop/products"], ["staff", "/shop/staff"], ["orders", "/shop/orders"],
    ["storefront", "/shop/storefront"], ["overview", "/shop/overview"]];
  return order.find(([key]) => canOpenShopSection(access, key))?.[1] ?? null;
}
