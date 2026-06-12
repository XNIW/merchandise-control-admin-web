import type { ReactNode } from "react";
import { AccessState } from "@/components/auth/AccessState";
import { ShopShell } from "@/components/shop/ShopShell";
import { resolveShopAdminDataAccess } from "@/server/shop-admin/data-access";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const access = await resolveShopAdminDataAccess();

  if (access.status !== "ready") {
    return (
      <AccessState
        area="Admin Console"
        status={access.status}
        reason={access.reason}
        loginHref="/auth/login?next=/shop"
      />
    );
  }

  const principal = access.principal;
  const availableShops =
    principal.kind === "personal_account"
      ? principal.availableShops
      : [access.selectedShop];

  return (
    <ShopShell
      availableShops={availableShops}
      principalKind={principal.kind}
      selectedShopId={access.selectedShop.shopId}
    >
      {children}
    </ShopShell>
  );
}
