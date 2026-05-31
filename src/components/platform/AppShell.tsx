import Link from "next/link";
import type { ReactNode } from "react";
import type { PlatformSectionKey } from "./platformData";
import { navigationItems } from "./platformData";

type AppShellProps = {
  activeSection: PlatformSectionKey;
  children: ReactNode;
};

export function AppShell({ activeSection, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <a
        href="#platform-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950 focus:shadow"
      >
        Skip to platform content
      </a>
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <Sidebar activeSection={activeSection} />
        <div className="flex min-w-0 flex-col">
          <Topbar activeSection={activeSection} />
          <main
            id="platform-content"
            tabIndex={-1}
            className="min-w-0 flex-1 px-4 py-5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-950 sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ activeSection }: { activeSection: PlatformSectionKey }) {
  return (
    <aside
      aria-label="Platform navigation"
      className="border-b border-slate-200 bg-white lg:border-b-0 lg:border-r"
    >
      <div className="flex h-full flex-col gap-6 px-4 py-5">
        <div className="flex items-center gap-3 px-2">
          <div
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white"
          >
            MC
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">
              MerchandiseControl
            </p>
            <p className="text-xs text-slate-500">Platform Admin Console</p>
          </div>
        </div>

        <nav
          aria-label="Platform sections"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {navigationItems.map((item) => {
            const isActive = item.key === activeSection;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
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

        <div className="mt-auto rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Scope
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Server-side Supabase boundary for read-only Platform Admin views.
            Controlled operations require server-side authorization and audit.
          </p>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ activeSection }: { activeSection: PlatformSectionKey }) {
  const isControlledActions = activeSection === "operations";

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Master console
          </p>
          <p className="text-sm text-slate-700">
            Global ecosystem, users, shops, audit, system status
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Platform status">
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
            {isControlledActions ? "Controlled actions" : "Read-only"}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            Server boundary
          </span>
          {!isControlledActions ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Controlled actions
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
