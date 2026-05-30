import type { ReactNode } from "react";
import { AccessState } from "@/components/auth/AccessState";
import { ShopShell } from "@/components/shop/ShopShell";
import { resolveCurrentShopAdminShellAccess } from "@/server/shop-admin/shop-access";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const access = await resolveCurrentShopAdminShellAccess();

  if (access.status !== "shop_admin") {
    const blockedStatus =
      access.status === "platform_admin" ? "no_shop" : access.status;
    const reason =
      access.status === "platform_admin"
        ? "This account is authorized for Platform Admin, not Shop Admin."
        : access.reason;

    return (
      <AccessState
        area="Shop Admin"
        status={blockedStatus}
        reason={reason}
        loginHref="/auth/login?next=/shop"
      />
    );
  }

  return (
    <ShopShell
      availableShops={access.availableShops}
      selectedShopId={access.selectedShop.shopId}
    >
      {children}
    </ShopShell>
  );
}
