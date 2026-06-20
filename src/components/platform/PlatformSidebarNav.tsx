"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
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

export function PlatformNavigationIcon({
  itemKey,
}: {
  itemKey: PlatformSectionKey;
}) {
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
  const paths: Record<PlatformSectionKey, ReactNode> = {
    admins: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
        <path d="M9.5 12.5 11 14l3.5-4" />
      </>
    ),
    audit: (
      <>
        <path d="M9 5h6" />
        <path d="M9 13l2 2 4-4" />
        <path d="M7 3h10v3H7z" />
        <path d="M6 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1" />
      </>
    ),
    data: (
      <>
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
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
    operations: (
      <>
        <path d="M14.5 4.5 19 9l-4 4-4.5-4.5" />
        <path d="M4 20l7-7" />
        <path d="M16 16h5" />
        <path d="M18.5 13.5V19" />
      </>
    ),
    overview: (
      <>
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    provisioning: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <path d="M4 5h4v4H4z" />
        <path d="M16 15h4v4h-4z" />
      </>
    ),
    shopAdmins: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
        <circle cx="12" cy="10" r="2" />
        <path d="M8.5 16a3.5 3.5 0 0 1 7 0" />
      </>
    ),
    shops: (
      <>
        <path d="M4 10h16" />
        <path d="M5 10l1-5h12l1 5" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-5h4v5" />
      </>
    ),
    support: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9.5 9a3 3 0 0 1 5 2.2c0 2-2.5 2.2-2.5 4" />
        <path d="M12 18h.01" />
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
    system: (
      <>
        <rect height="14" rx="2" width="16" x="4" y="5" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
        <path d="M9 19h6" />
      </>
    ),
    users: (
      <>
        <path d="M16 11a4 4 0 1 0-8 0" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[itemKey]}</svg>;
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
      className="-mx-1 flex min-w-0 max-w-full gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:min-h-0 lg:overflow-y-auto lg:px-0 lg:pb-0"
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
              "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border-l-2 px-2.5 py-1.5 text-sm font-medium outline-none transition",
              "focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
              isActive
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            ].join(" ")}
          >
            <PlatformNavigationIcon itemKey={item.key} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
