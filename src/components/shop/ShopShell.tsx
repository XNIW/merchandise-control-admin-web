"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChangeEvent, ReactNode } from "react";
import { shopNavigationItems } from "./shopSections";

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

  return pathname === href;
}

export function ShopShell({
  availableShops,
  children,
  selectedShopId,
}: ShopShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedShopId = searchParams.get("shop_id");
  const selectedShop =
    availableShops.find((shop) => shop.shopId === requestedShopId) ??
    availableShops.find((shop) => shop.shopId === selectedShopId) ??
    availableShops[0];

  function buildShopHref(href: string) {
    if (!selectedShop) {
      return href;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());

    nextSearchParams.set("shop_id", selectedShop.shopId);
    return `${href}?${nextSearchParams.toString()}`;
  }

  function handleShopChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextShopId = event.target.value;
    const nextSearchParams = new URLSearchParams(searchParams.toString());

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
          className="border-b border-zinc-200 bg-white lg:border-b-0 lg:border-r"
        >
          <div className="flex h-full flex-col gap-6 px-4 py-5">
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

            <nav
              aria-label="Shop sections"
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0"
            >
              {shopNavigationItems.map((item) => {
                const isActive = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.key}
                    href={buildShopHref(item.href)}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium outline-none transition",
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
            </nav>

            <div className="mt-auto rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase text-emerald-900">
                Shop scope
              </p>
              <p className="mt-2 text-sm leading-6 text-emerald-950">
                Access is resolved server-side from active shop membership.
                Read-only rows stay limited to the selected shop.
              </p>
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
                  className="mt-1 text-sm font-semibold text-zinc-950"
                >
                  {selectedShop
                    ? `${selectedShop.shopName} · ${selectedShop.shopCode}`
                    : "No shop selected"}
                </p>
                <p className="mt-1 text-sm text-zinc-700">
                  Shop and role are resolved from server-verified memberships.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label
                  htmlFor="shop-switcher"
                  className="text-xs font-semibold uppercase text-zinc-500 sm:sr-only"
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
                <div className="flex flex-wrap gap-2" aria-label="Shop status">
                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    {selectedShop ? formatRole(selectedShop.role) : "Admin Console"}
                  </span>
                  <span className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                    Server verified
                  </span>
                  <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700">
                    Read-only
                  </span>
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
