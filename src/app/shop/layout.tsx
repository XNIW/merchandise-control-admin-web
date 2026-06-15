import type { ReactNode } from "react";
import { AccessState } from "@/components/auth/AccessState";
import { ShopShell } from "@/components/shop/ShopShell";
import {
  sharedShopGuardrails,
  shopNavigationSections,
} from "@/components/shop/shopSections";
import { getI18n } from "@/i18n/get-locale";
import {
  translateShopNavigationSections,
  translateText,
} from "@/i18n/translate-sections";
import { resolveShopAdminDataAccess } from "@/server/shop-admin/data-access";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const [{ dictionary, locale }, access] = await Promise.all([
    getI18n(),
    resolveShopAdminDataAccess(),
  ]);

  if (access.status !== "ready") {
    const loginHref =
      access.status === "session_expired" || access.status === "no_active_session"
        ? "/shop/staff-login?next=/shop"
        : "/auth/login?next=/shop";

    return (
      <AccessState
        area={dictionary.shopShell.adminConsole}
        status={access.status}
        reason={access.reason}
        loginHref={loginHref}
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
      labels={dictionary.shopShell}
      languageSwitcherLabel={dictionary.languageSwitcher.label}
      locale={locale}
      logoutLabel={dictionary.common.logout}
      navigationSections={translateShopNavigationSections(
        dictionary,
        shopNavigationSections,
      )}
      principalKind={principal.kind}
      selectedShopId={access.selectedShop.shopId}
      sharedGuardrails={sharedShopGuardrails.map((item) =>
        translateText(dictionary, item),
      )}
    >
      {children}
    </ShopShell>
  );
}
