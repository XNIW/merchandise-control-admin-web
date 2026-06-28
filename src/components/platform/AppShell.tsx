import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary } from "@/i18n/dictionaries";
import { getI18n } from "@/i18n/get-locale";
import type { SupportedLocale } from "@/i18n/locales";
import { translatePlatformNavigationItems } from "@/i18n/translate-sections";
import {
  createSupabaseServerClient,
  resolveSupabaseServerConfig,
} from "@/lib/supabase/server";
import {
  navigationItems,
  primaryNavigationItems,
  type PlatformSectionKey,
} from "./platformData";
import {
  PlatformNavigationIcon,
  PlatformSidebarNav,
} from "./PlatformSidebarNav";

type AppShellProps = {
  activeSection: PlatformSectionKey;
  children: ReactNode;
  dictionary?: Dictionary;
  locale?: SupportedLocale;
  topbarDescription?: string;
  topbarEyebrow?: string;
  topbarTitle?: string;
};

async function getPlatformAccountLabel(fallback: string) {
  const config = resolveSupabaseServerConfig();

  if (config.status !== "configured") {
    return fallback;
  }

  const supabase = await createSupabaseServerClient(config);

  if (!supabase) {
    return fallback;
  }

  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.trim();

  return error || !email ? fallback : email;
}

export async function AppShell({
  activeSection,
  children,
  dictionary: providedDictionary,
  locale: providedLocale,
  topbarDescription,
  topbarEyebrow,
  topbarTitle,
}: AppShellProps) {
  const fallbackI18n =
    providedDictionary && providedLocale ? null : await getI18n();
  const dictionary = providedDictionary ?? fallbackI18n?.dictionary;
  const locale = providedLocale ?? fallbackI18n?.locale;

  if (!dictionary || !locale) {
    throw new Error("APP_SHELL_I18N_UNAVAILABLE");
  }

  const platformAccountLabel = await getPlatformAccountLabel(
    dictionary.platformShell.masterConsole,
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <a
        href="#platform-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-950 focus:shadow"
      >
        {dictionary.platformShell.skipLink}
      </a>
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[280px_1fr]">
        <Sidebar
          accountLabel={platformAccountLabel}
          activeSection={activeSection}
          dictionary={dictionary}
        />
        <div className="flex min-w-0 flex-col lg:min-h-0">
          <Topbar
            activeSection={activeSection}
            description={topbarDescription ?? dictionary.platformShell.description}
            dictionary={dictionary}
            eyebrow={topbarEyebrow ?? dictionary.platformShell.masterConsole}
            locale={locale}
            title={topbarTitle ?? dictionary.platformShell.masterConsole}
          />
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

function Sidebar({
  accountLabel,
  activeSection,
  dictionary,
}: {
  accountLabel: string;
  activeSection: PlatformSectionKey;
  dictionary: Dictionary;
}) {
  const localizedNavigationItems = translatePlatformNavigationItems(
    dictionary,
    navigationItems,
  );
  const localizedPrimaryNavigationItems = translatePlatformNavigationItems(
    dictionary,
    primaryNavigationItems,
  );

  return (
    <aside
      aria-label={dictionary.platformShell.navigationAria}
      className="min-w-0 border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      <div className="flex min-h-full min-w-0 flex-col gap-6 px-4 py-5 lg:min-h-0">
        <div className="flex items-center gap-3 px-2">
          <div
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white"
          >
            MC
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              {accountLabel}
            </p>
            {accountLabel === dictionary.platformShell.masterConsole ? null : (
              <p className="truncate text-xs text-slate-500">
                {dictionary.platformShell.masterConsole}
              </p>
            )}
          </div>
        </div>

        <PlatformSidebarNav
          activeSection={activeSection}
          navigationItems={localizedNavigationItems}
          navigationLabel={dictionary.platformShell.navigationAria}
          primaryNavigationItems={localizedPrimaryNavigationItems}
        />

        <div className="mt-auto rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {dictionary.platformShell.scope}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {dictionary.platformShell.scopeDescription}
          </p>
        </div>
      </div>
    </aside>
  );
}

function Topbar({
  activeSection,
  description,
  dictionary,
  eyebrow,
  locale,
  title,
}: {
  activeSection: PlatformSectionKey;
  description: string;
  dictionary: Dictionary;
  eyebrow: string;
  locale: SupportedLocale;
  title: string;
}) {
  return (
    <header className="min-w-0 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-700"
          >
            <PlatformNavigationIcon itemKey={activeSection} />
          </span>
          <div className="min-w-0" title={description}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-lg font-semibold leading-6 text-slate-950">
                {title}
              </h1>
              <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-normal text-slate-600">
                {eyebrow}
              </span>
            </div>
          </div>
        </div>
        <div
          className="flex flex-wrap gap-2"
          aria-label={dictionary.platformShell.statusAria}
        >
          <LanguageSwitcher
            label={dictionary.languageSwitcher.label}
            locale={locale}
            tone="slate"
          />
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
            {dictionary.platformShell.readOnly}
          </span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {dictionary.platformShell.serverBoundary}
          </span>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            {dictionary.platformShell.controlledActions}
          </span>
          <form action="/auth/logout?next=/platform" method="get">
            <button
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 md:min-h-0 md:px-2.5 md:py-1 md:text-xs"
              type="submit"
            >
              {dictionary.common.logout}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
