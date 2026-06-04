import type { ReactNode } from "react";
import { AccessState } from "@/components/auth/AccessState";
import { ShopShell } from "@/components/shop/ShopShell";
import { resolveCurrentShopAdminPrincipal } from "@/server/shop-admin/access-principal";
import { resolveStaffWebSessionPrincipal } from "@/server/shop-admin/staff-web-auth";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const personalResolution = await resolveCurrentShopAdminPrincipal();
  const staffResolution =
    personalResolution.status === "ready"
      ? personalResolution
      : await resolveStaffWebSessionPrincipal();
  const resolution =
    personalResolution.status === "ready" ? personalResolution : staffResolution;

  if (resolution.status !== "ready") {
    return (
      <AccessState
        area="Shop Admin"
        status={resolution.status}
        reason={resolution.reason}
        loginHref="/auth/login?next=/shop"
      />
    );
  }

  const principal = resolution.principal;
  const availableShops =
    principal.kind === "personal_account"
      ? principal.availableShops
      : [
          {
            role: "shop_manager" as const,
            shopCode: principal.shop.shopCode,
            shopId: principal.shop.shopId,
            shopName: principal.shop.shopCode,
            shopStatus: "active",
          },
        ];
  const selectedShopId =
    principal.kind === "personal_account"
      ? principal.selectedShop.shopId
      : principal.shop.shopId;

  return (
    <ShopShell
      availableShops={availableShops}
      selectedShopId={selectedShopId}
    >
      {children}
    </ShopShell>
  );
}
