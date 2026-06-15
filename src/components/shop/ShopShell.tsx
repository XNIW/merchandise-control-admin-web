"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import type { ShopNavigationSection, ShopSectionKey } from "./shopSections";

type ShopRole = "shop_owner" | "shop_manager";

type ShopShellShop = {
  companyRut?: string;
  shopId: string;
  shopCode: string;
  shopName: string;
  shopStatus: string;
  role: ShopRole;
};

type ShopShellProps = {
  availableShops: readonly ShopShellShop[];
  children: ReactNode;
  labels: Dictionary["shopShell"];
  languageSwitcherLabel: string;
  locale: SupportedLocale;
  logoutLabel: string;
  navigationSections: readonly ShopNavigationSection[];
  principalKind: "personal_account" | "pos_staff_manager";
  selectedShopId: string;
  sharedGuardrails: readonly string[];
};

function formatRole(role: ShopRole, labels: Dictionary["shopShell"]) {
  return labels.roles[role];
}

function formatCompanyRut(value: string | undefined, labels: Dictionary["shopShell"]) {
  const compact = (value ?? "").trim().replace(/[^0-9kK]/g, "").toUpperCase();

  if (compact.length < 2) {
    return labels.notConfigured;
  }

  const body = compact.slice(0, -1);
  const dv = compact.slice(-1);
  const groups: string[] = [];

  for (let index = body.length; index > 0; index -= 3) {
    groups.unshift(body.slice(Math.max(0, index - 3), index));
  }

  return `${groups.join(".")}-${dv}`;
}

function shopDisplayName(
  shop: ShopShellShop | undefined,
  labels: Dictionary["shopShell"],
) {
  if (!shop) {
    return labels.noShopSelected;
  }

  const shopName = shop.shopName.trim();

  if (shopName && shopName !== shop.shopCode) {
    return shopName;
  }

  return labels.shopNameNotConfigured;
}

function shopIdentityLine(
  shop: ShopShellShop | undefined,
  labels: Dictionary["shopShell"],
) {
  if (!shop) {
    return `${labels.companyRutPrefix}: ${labels.notConfigured}`;
  }

  return `${labels.companyRutPrefix}: ${formatCompanyRut(shop.companyRut, labels)}`;
}

function isActivePath(pathname: string, href: string) {
  if (href === "/shop/overview") {
    return pathname === "/shop" || pathname === "/shop/overview";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionFromPath(
  pathname: string,
  navigationSections: readonly ShopNavigationSection[],
): ShopSectionKey | null {
  const navigationItems = navigationSections.flatMap((section) => section.items);
  const matchingItem = [...navigationItems]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => isActivePath(pathname, item.href));

  return matchingItem?.key ?? null;
}

function ShopNavigation({
  buildShopHref,
  currentActive,
  labels,
  navigationSections,
  onNavigate,
}: {
  buildShopHref: (href: string) => string;
  currentActive: ShopSectionKey | null;
  labels: Dictionary["shopShell"];
  navigationSections: readonly ShopNavigationSection[];
  onNavigate: (key: ShopSectionKey) => void;
}) {
  return (
    <nav
      aria-label={labels.navigationAria}
      className="space-y-2 lg:max-h-[calc(100vh-15rem)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
    >
      {navigationSections.map((section: ShopNavigationSection) => (
        <section key={section.key} className="space-y-1">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-normal text-zinc-500">
            {section.label}
          </p>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:gap-1 lg:px-0 lg:pb-0">
            {section.items.map((item) => {
              const isActive = item.key === currentActive;

              return (
                <Link
                  key={item.key}
                  href={buildShopHref(item.href)}
                  prefetch={false}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(item.key)}
                  className={[
                    "shrink-0 rounded-md border-l-2 px-2.5 py-1.5 text-sm font-medium outline-none transition",
                    "whitespace-nowrap",
                    "focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2",
                    isActive
                      ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                      : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

export function ShopShell({
  availableShops,
  children,
  labels,
  languageSwitcherLabel,
  locale,
  logoutLabel,
  navigationSections,
  principalKind,
  selectedShopId,
  sharedGuardrails,
}: ShopShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedShopId = searchParams.get("shop_id");
  const [optimisticActive, setOptimisticActive] = useState<{
    key: ShopSectionKey;
    originPathname: string;
  } | null>(null);
  const pathnameActive = useMemo(
    () => sectionFromPath(pathname, navigationSections),
    [navigationSections, pathname],
  );
  const currentActive =
    optimisticActive?.originPathname === pathname
      ? optimisticActive.key
      : pathnameActive ?? "overview";
  const hasMultipleShops = availableShops.length > 1;
  const canSwitchShops = principalKind === "personal_account" && hasMultipleShops;
  const selectedShop =
    availableShops.find((shop) => shop.shopId === requestedShopId) ??
    availableShops.find((shop) => shop.shopId === selectedShopId) ??
    availableShops[0];
  const selectedShopName = shopDisplayName(selectedShop, labels);
  const selectedShopIdentity = shopIdentityLine(selectedShop, labels);

  function buildShopHref(href: string) {
    if (!selectedShop) {
      return href;
    }

    const nextSearchParams = new URLSearchParams();

    nextSearchParams.set("shop_id", selectedShop.shopId);
    return `${href}?${nextSearchParams.toString()}`;
  }

  function handleShopChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextShopId = event.target.value;
    const nextSearchParams = new URLSearchParams();

    nextSearchParams.set("shop_id", nextShopId);
    router.push(`${pathname}?${nextSearchParams.toString()}`);
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <a
        href="#shop-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:shadow"
      >
        {labels.skipLink}
      </a>
      <div className="grid min-h-screen lg:grid-cols-[264px_1fr]">
        <aside
          aria-label={labels.navigationAria}
          className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div className="flex min-h-full flex-col gap-5 px-4 py-5 lg:min-h-0">
            <div className="flex items-center gap-3 px-2">
              <div
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-md bg-emerald-700 text-sm font-semibold text-white"
              >
                MC
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-950">
                  MerchandiseControl
                </p>
                <p className="text-xs text-zinc-500">{labels.adminConsole}</p>
              </div>
            </div>

            <ShopNavigation
              buildShopHref={buildShopHref}
              currentActive={currentActive}
              labels={labels}
              navigationSections={navigationSections}
              onNavigate={(key) =>
                setOptimisticActive({
                  key,
                  originPathname: pathname,
                })
              }
            />

            <div className="mt-auto rounded-md border border-emerald-200 bg-emerald-50/70 p-2.5">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-900">
                {labels.shopSafety}
              </p>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-emerald-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2">
                  {labels.sharedGuardrails}
                </summary>
                <ul className="mt-2 space-y-1 border-t border-emerald-200 pt-2 text-xs leading-5 text-emerald-950">
                  {sharedGuardrails.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div
                role="group"
                aria-labelledby="selected-shop-context-label selected-shop-summary"
              >
                <p
                  id="selected-shop-context-label"
                  className="text-xs font-semibold uppercase text-zinc-500"
                >
                  {labels.selectedShopContext}
                </p>
                <p
                  id="selected-shop-summary"
                  className="mt-1 text-lg font-semibold leading-6 text-zinc-950"
                >
                  {selectedShopName}
                </p>
                <p className="text-sm leading-6 text-zinc-700">
                  {selectedShopIdentity}
                </p>
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <div
                  className="flex flex-wrap items-center gap-2"
                  aria-label={labels.shopSelectionAria}
                >
                  {canSwitchShops ? (
                    <>
                      <label
                        htmlFor="shop-switcher"
                        className="text-xs font-semibold uppercase text-zinc-500"
                      >
                        {labels.switchShop}
                      </label>
                      <select
                        id="shop-switcher"
                        aria-label={labels.switchShop}
                        value={selectedShop?.shopId ?? ""}
                        onChange={handleShopChange}
                        className="h-10 min-w-56 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                      >
                        {availableShops.map((shop) => (
                          <option key={shop.shopId} value={shop.shopId}>
                            {shopDisplayName(shop, labels)} ({shop.shopCode})
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

                  {!canSwitchShops && selectedShop ? (
                    <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700">
                      {labels.singleShopWorkspace}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2" aria-label={labels.shopStatusAria}>
                  <LanguageSwitcher
                    label={languageSwitcherLabel}
                    locale={locale}
                    tone="emerald"
                  />
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    {selectedShop
                      ? formatRole(selectedShop.role, labels)
                      : labels.adminConsole}
                  </span>
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                    {labels.serverVerified}
                  </span>
                  <form
                    action={
                      principalKind === "pos_staff_manager"
                        ? "/shop/staff-logout"
                        : "/auth/logout"
                    }
                    method="get"
                  >
                    <button
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 outline-none transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
                      type="submit"
                    >
                      {logoutLabel}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </header>
          <main
            id="shop-content"
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 py-5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-800 sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
