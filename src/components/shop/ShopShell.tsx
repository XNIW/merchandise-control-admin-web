"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "./shopLayout";
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
  sectionDescriptions: Readonly<Partial<Record<ShopSectionKey, string>>>;
  sectionEyebrows: Readonly<Partial<Record<ShopSectionKey, string>>>;
  sectionTitles: Readonly<Partial<Record<ShopSectionKey, string>>>;
  selectedShopId: string;
  sharedGuardrails: readonly string[];
};

type ShopNavigationItem = ShopNavigationSection["items"][number];

function formatRole(role: ShopRole, labels: Dictionary["shopShell"]) {
  return labels.roles[role];
}

function formatCompanyRut(value: string | undefined) {
  const compact = (value ?? "").trim().replace(/[^0-9kK]/g, "").toUpperCase();

  if (compact.length < 2) {
    return null;
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
    return null;
  }

  const companyRut = formatCompanyRut(shop.companyRut);

  if (companyRut) {
    return `${labels.companyRutPrefix}: ${companyRut}`;
  }

  return null;
}

function isActivePath(pathname: string, href: string) {
  if (href === "/shop/overview") {
    return pathname === "/shop" || pathname === "/shop/overview";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function navigationItemFromPath(
  pathname: string,
  navigationSections: readonly ShopNavigationSection[],
): ShopNavigationItem | null {
  const navigationItems = navigationSections.flatMap((section) => section.items);
  const matchingItem = [...navigationItems]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => isActivePath(pathname, item.href));

  return matchingItem ?? null;
}

function sectionFromPath(
  pathname: string,
  navigationSections: readonly ShopNavigationSection[],
): ShopSectionKey | null {
  return navigationItemFromPath(pathname, navigationSections)?.key ?? null;
}

function ShopNavigationIcon({ itemKey }: { itemKey: ShopSectionKey }) {
  const commonProps = {
    "aria-hidden": true,
    className: "size-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };
  const paths: Record<ShopSectionKey, ReactNode> = {
    audit: (
      <>
        <path d="M9 5h6" />
        <path d="M9 13l2 2 4-4" />
        <path d="M7 3h10v3H7z" />
        <path d="M6 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1" />
      </>
    ),
    categories: (
      <>
        <path d="M4 6h7l2 2h7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
        <path d="M8 13h8" />
      </>
    ),
    devices: (
      <>
        <rect height="14" rx="2" width="10" x="7" y="4" />
        <path d="M11 18h2" />
      </>
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 5v4h4" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    importExport: (
      <>
        <path d="M12 3v12" />
        <path d="m8 11 4 4 4-4" />
        <path d="M5 19h14" />
      </>
    ),
    members: (
      <>
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </>
    ),
    overview: (
      <>
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    pos: (
      <>
        <rect height="12" rx="2" width="16" x="4" y="5" />
        <path d="M8 19h8" />
        <path d="M9 10h6" />
      </>
    ),
    products: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M4.5 7.5 12 12l7.5-4.5" />
        <path d="M12 12v9" />
      </>
    ),
    roles: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
        <path d="M9.5 12.5 11 14l3.5-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m5.6 5.6 2.1 2.1" />
        <path d="m16.3 16.3 2.1 2.1" />
        <path d="m18.4 5.6-2.1 2.1" />
        <path d="m7.7 16.3-2.1 2.1" />
      </>
    ),
    staff: (
      <>
        <rect height="16" rx="2" width="14" x="5" y="4" />
        <circle cx="12" cy="10" r="2" />
        <path d="M8.5 17a3.5 3.5 0 0 1 7 0" />
      </>
    ),
    suppliers: (
      <>
        <path d="M3 8h11v8H3z" />
        <path d="M14 11h4l3 3v2h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    sync: (
      <>
        <path d="M17 3v5h-5" />
        <path d="M7 21v-5h5" />
        <path d="M17 8a6 6 0 0 0-10-2" />
        <path d="M7 16a6 6 0 0 0 10 2" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[itemKey]}</svg>;
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-zinc-200 ${className}`}
    />
  );
}

function ShopPendingNavigationSkeleton({
  itemKey,
  label,
}: {
  itemKey: ShopSectionKey;
  label: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={`${label} loading`}
      className="grid gap-5"
      data-shop-route-loading
      data-shop-route-loading-section={itemKey}
      data-shop-route-loading-target
      role="status"
      aria-live="polite"
    >
      <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-2`}>
        <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
          Loading
        </p>
        <p className="flex min-w-0 items-center gap-3 text-2xl font-semibold leading-8 text-zinc-950">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-emerald-600"
          />
          <span className="min-w-0 truncate">Loading {label}</span>
        </p>
        <SkeletonBlock className="h-4 w-full max-w-2xl" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="min-h-24 rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
            key={index}
          >
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-4 h-7 w-20 bg-zinc-300" />
            <SkeletonBlock className="mt-3 h-3 w-32" />
          </div>
        ))}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <SkeletonBlock className="h-5 w-52 bg-zinc-300" />
        <div className="mt-5 grid gap-3">
          {Array.from({ length: itemKey === "overview" ? 5 : 4 }, (_, index) => (
            <SkeletonBlock className="h-12 w-full" key={index} />
          ))}
        </div>
      </section>
    </div>
  );
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
  onNavigate: (input: {
    event: MouseEvent<HTMLAnchorElement>;
    href: string;
    key: ShopSectionKey;
    label: string;
  }) => void;
}) {
  const router = useRouter();
  const [prefetchedItems, setPrefetchedItems] = useState<
    ReadonlySet<ShopSectionKey>
  >(() => new Set());

  function handleNavigationIntent(item: { href: string; key: ShopSectionKey }) {
    const href = buildShopHref(item.href);

    setPrefetchedItems((currentItems) => {
      if (currentItems.has(item.key)) {
        return currentItems;
      }

      return new Set(currentItems).add(item.key);
    });
    router.prefetch(href);
  }

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
            {section.items
              .filter((item) => !item.hiddenFromPrimaryNav)
              .map((item) => {
                const isActive = item.key === currentActive;
                const href = buildShopHref(item.href);

                return (
                  <Link
                    key={item.key}
                    href={href}
                    prefetch={false}
                    aria-current={isActive ? "page" : undefined}
                    onClick={(event) =>
                      onNavigate({
                        event,
                        href,
                        key: item.key,
                        label: item.label,
                      })
                    }
                    onFocus={() => handleNavigationIntent(item)}
                    onMouseEnter={() => handleNavigationIntent(item)}
                    onTouchStart={() => handleNavigationIntent(item)}
                    data-prefetch-ready={prefetchedItems.has(item.key)}
                    data-shop-nav-item={item.key}
                    className={[
                      "inline-flex shrink-0 items-center gap-2 rounded-md border-l-2 px-2.5 py-1.5 text-sm font-medium outline-none transition",
                      "whitespace-nowrap",
                      "focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2",
                      isActive
                        ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                        : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950",
                    ].join(" ")}
                  >
                    <ShopNavigationIcon itemKey={item.key} />
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
  sectionDescriptions,
  sectionEyebrows,
  sectionTitles,
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
  const [pendingNavigation, setPendingNavigation] = useState<{
    key: ShopSectionKey;
    label: string;
    targetPathname: string;
    targetShopId: string | null;
  } | null>(null);
  const pathnameActive = useMemo(
    () => sectionFromPath(pathname, navigationSections),
    [navigationSections, pathname],
  );
  const pathnameItem = useMemo(
    () => navigationItemFromPath(pathname, navigationSections),
    [navigationSections, pathname],
  );
  const currentShopId = searchParams.get("shop_id");
  const pendingNavigationTargetReached =
    pendingNavigation !== null &&
    pathname === pendingNavigation.targetPathname &&
    currentShopId === pendingNavigation.targetShopId;
  const visiblePendingNavigation = pendingNavigationTargetReached
    ? null
    : pendingNavigation;
  const currentActive =
    visiblePendingNavigation?.key ??
    (optimisticActive?.originPathname === pathname
      ? optimisticActive.key
      : pathnameActive ?? "overview");
  const hasMultipleShops = availableShops.length > 1;
  const canSwitchShops = principalKind === "personal_account" && hasMultipleShops;
  const selectedShop =
    availableShops.find((shop) => shop.shopId === requestedShopId) ??
    availableShops.find((shop) => shop.shopId === selectedShopId) ??
    availableShops[0];
  const selectedShopName = shopDisplayName(selectedShop, labels);
  const selectedShopIdentity = shopIdentityLine(selectedShop, labels);
  const currentPageKey = visiblePendingNavigation?.key ?? pathnameItem?.key ?? null;
  const currentPageTitle =
    (visiblePendingNavigation
      ? sectionTitles[visiblePendingNavigation.key] ?? visiblePendingNavigation.label
      : null) ??
    (pathnameItem ? sectionTitles[pathnameItem.key] ?? pathnameItem.label : null) ??
    labels.adminConsole;
  const currentPageEyebrow =
    currentPageKey !== null
      ? sectionEyebrows[currentPageKey] ?? labels.adminConsole
      : labels.adminConsole;
  const currentPageDescription =
    currentPageKey !== null ? sectionDescriptions[currentPageKey] : null;

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

  useEffect(() => {
    if (!pendingNavigation || pendingNavigationTargetReached) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPendingNavigation(null);
      setOptimisticActive(null);
    }, 15_000);

    return () => window.clearTimeout(timeout);
  }, [pendingNavigation, pendingNavigationTargetReached]);

  function handleNavigation(input: {
    event: MouseEvent<HTMLAnchorElement>;
    href: string;
    key: ShopSectionKey;
    label: string;
  }) {
    const { event, href, key, label } = input;

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = new URL(href, window.location.origin);
    const targetShopId = target.searchParams.get("shop_id");
    const alreadyCurrent =
      target.pathname === pathname &&
      target.searchParams.toString() === searchParams.toString();

    if (alreadyCurrent) {
      return;
    }

    setOptimisticActive({
      key,
      originPathname: pathname,
    });
    setPendingNavigation({
      key,
      label,
      targetPathname: target.pathname,
      targetShopId,
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <a
        href="#shop-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:shadow"
      >
        {labels.skipLink}
      </a>
      <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)]">
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
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-950">
                  {selectedShop ? selectedShopName : labels.adminConsole}
                </p>
                {selectedShopIdentity ? (
                  <p className="truncate text-xs text-zinc-500">
                    {selectedShopIdentity}
                  </p>
                ) : null}
              </div>
            </div>

            <ShopNavigation
              buildShopHref={buildShopHref}
              currentActive={currentActive}
              labels={labels}
              navigationSections={navigationSections}
              onNavigate={handleNavigation}
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
          <header className="border-b border-zinc-200 bg-white px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  {currentPageKey ? (
                    <ShopNavigationIcon itemKey={currentPageKey} />
                  ) : (
                    <span className="size-2 rounded-full bg-emerald-700" />
                  )}
                </span>
                <div className="min-w-0" title={currentPageDescription ?? undefined}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h1
                      id="shop-shell-page-title"
                      className="min-w-0 truncate text-lg font-semibold leading-6 text-zinc-950"
                    >
                      {currentPageTitle}
                    </h1>
                    <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-normal text-emerald-800">
                      {currentPageEyebrow}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="flex min-w-0 flex-wrap items-center justify-start gap-2 md:justify-end"
                aria-label={labels.shopStatusAria}
              >
                {canSwitchShops ? (
                  <>
                    <label
                      htmlFor="shop-switcher"
                      className="sr-only"
                    >
                      {labels.switchShop}
                    </label>
                    <select
                      id="shop-switcher"
                      aria-label={labels.switchShop}
                      value={selectedShop?.shopId ?? ""}
                      onChange={handleShopChange}
                      className="h-9 min-w-52 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
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
          </header>
          <main
            id="shop-content"
            tabIndex={-1}
            aria-busy={visiblePendingNavigation ? true : undefined}
            className="min-w-0 flex-1 px-4 py-5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-800 sm:px-6 lg:px-8"
            data-shop-navigation-pending={visiblePendingNavigation ? "true" : "false"}
            data-shop-navigation-target={visiblePendingNavigation?.key}
          >
            {visiblePendingNavigation ? (
              <ShopPendingNavigationSkeleton
                itemKey={visiblePendingNavigation.key}
                label={visiblePendingNavigation.label}
              />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
