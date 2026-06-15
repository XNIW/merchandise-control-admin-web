"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { PlatformNavigationItem, PlatformSectionKey } from "./platformData";

type PlatformSidebarNavProps = {
  activeSection: PlatformSectionKey;
  navigationItems: readonly PlatformNavigationItem[];
  navigationLabel: string;
  primaryNavigationItems: readonly PlatformNavigationItem[];
};

function sectionFromPath(
  pathname: string,
  navigationItems: readonly PlatformNavigationItem[],
): PlatformSectionKey | null {
  const matchingItem = [...navigationItems]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => {
      if (item.href === "/platform") {
        return pathname === "/platform" || pathname === "/platform/overview";
      }

      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    });

  return matchingItem?.key ?? null;
}

export function PlatformSidebarNav({
  activeSection,
  navigationItems,
  navigationLabel,
  primaryNavigationItems,
}: PlatformSidebarNavProps) {
  const pathname = usePathname();
  const [optimisticActive, setOptimisticActive] = useState<{
    key: PlatformSectionKey;
    originPathname: string;
  } | null>(null);
  const pathnameActive = useMemo(
    () => sectionFromPath(pathname, navigationItems),
    [navigationItems, pathname],
  );
  const currentActive =
    optimisticActive?.originPathname === pathname
      ? optimisticActive.key
      : pathnameActive ?? activeSection;

  return (
    <nav
      aria-label={navigationLabel}
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:min-h-0 lg:overflow-y-auto lg:px-0 lg:pb-0"
    >
      {primaryNavigationItems.map((item) => {
        const isActive = item.key === currentActive;

        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            onClick={() =>
              setOptimisticActive({
                key: item.key,
                originPathname: pathname,
              })
            }
            className={[
              "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
              isActive
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
