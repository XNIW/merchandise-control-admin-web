"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { GuardrailNotice } from "@/components/admin/GuardrailNotice";
import {
  shopNavigationSections,
  shopNavigationItems,
  sharedShopGuardrails,
  type ShopNavigationSection,
  type ShopSectionKey,
} from "./shopSections";

type ShopRole = "shop_owner" | "shop_manager";

type ShopShellShop = {
  shopId: string;
  shopCode: string;
  shopName: string;
  shopStatus: string;
  role: ShopRole;
};

type ShopShellProps = {
  availableShops: readonly ShopShellShop[];
  children: ReactNode;
  principalKind: "personal_account" | "pos_staff_manager";
  selectedShopId: string;
};

function formatRole(role: ShopRole) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isActivePath(pathname: string, href: string) {
  if (href === "/shop/overview") {
    return pathname === "/shop" || pathname === "/shop/overview";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionFromPath(pathname: string): ShopSectionKey | null {
  const matchingItem = [...shopNavigationItems]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => isActivePath(pathname, item.href));

  return matchingItem?.key ?? null;
}

function ShopNavigation({
  buildShopHref,
  currentActive,
  onNavigate,
}: {
  buildShopHref: (href: string) => string;
  currentActive: ShopSectionKey | null;
  onNavigate: (key: ShopSectionKey) => void;
}) {
  return (
    <nav
      aria-label="Shop sections"
      className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
    >
      {shopNavigationSections.map((section: ShopNavigationSection) => (
        <section key={section.key} className="space-y-1.5">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
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
                    "shrink-0 rounded-md px-3 py-2 text-sm font-medium outline-none transition",
                    "whitespace-nowrap",
                    "focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2",
                    isActive
                      ? "bg-emerald-700 text-white"
                      : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-900",
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
  principalKind,
  selectedShopId,
}: ShopShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedShopId = searchParams.get("shop_id");
  const [optimisticActive, setOptimisticActive] = useState<{
    key: ShopSectionKey;
    originPathname: string;
  } | null>(null);
  const pathnameActive = useMemo(() => sectionFromPath(pathname), [pathname]);
  const currentActive =
    optimisticActive?.originPathname === pathname
      ? optimisticActive.key
      : pathnameActive ?? "overview";
  const hasMultipleShops = availableShops.length > 1;
  const selectedShop =
    availableShops.find((shop) => shop.shopId === requestedShopId) ??
    availableShops.find((shop) => shop.shopId === selectedShopId) ??
    availableShops[0];

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
        Skip to shop content
      </a>
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside
          aria-label="Shop navigation"
          className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div className="flex min-h-full flex-col gap-6 px-4 py-5 lg:min-h-0">
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
                <p className="text-xs text-zinc-500">Admin Console</p>
              </div>
            </div>

            <ShopNavigation
              buildShopHref={buildShopHref}
              currentActive={currentActive}
              onNavigate={(key) =>
                setOptimisticActive({
                  key,
                  originPathname: pathname,
                })
              }
            />

            <div className="mt-auto rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-normal text-emerald-900">
                Shop safety
              </p>
              <div className="mt-3">
                <GuardrailNotice
                  title="Shared guardrails"
                  items={sharedShopGuardrails}
                />
              </div>
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
                  Shop workspace
                </p>
                <p
                  id="selected-shop-summary"
                  className="mt-1 text-sm font-semibold leading-6 text-zinc-950"
                >
                  {selectedShop
                    ? `${selectedShop.shopName}`
                    : "No shop selected"}
                </p>
                <p className="text-sm leading-6 text-zinc-700">
                  {selectedShop ? selectedShop.shopCode : "Select a shop"}
                </p>
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <div
                  className="flex flex-wrap items-center gap-2"
                  aria-label="Shop selection"
                >
                  {hasMultipleShops ? (
                    <>
                      <label
                        htmlFor="shop-switcher"
                        className="text-xs font-semibold uppercase text-zinc-500"
                      >
                        Switch shop
                      </label>
                      <select
                        id="shop-switcher"
                        aria-label="Switch shop"
                        value={selectedShop?.shopId ?? ""}
                        onChange={handleShopChange}
                        className="h-10 min-w-56 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
                      >
                        {availableShops.map((shop) => (
                          <option key={shop.shopId} value={shop.shopId}>
                            {shop.shopName} ({shop.shopCode})
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

                  {!hasMultipleShops && selectedShop ? (
                    <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700">
                      Single shop workspace
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2" aria-label="Shop status">
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    {selectedShop
                      ? formatRole(selectedShop.role)
                      : "Admin Console"}
                  </span>
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                    Server verified
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
                      Logout
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
