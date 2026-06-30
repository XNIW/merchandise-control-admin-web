import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AuthForm } from "@/components/auth/AuthForm";
import { ShopCodeLoginForm } from "@/components/auth/ShopCodeLoginForm";
import {
  safeInternalNextPath,
  safeShopAdminNextPath,
} from "@/lib/auth/oauth-redirect";
import type { Dictionary } from "@/i18n/dictionaries";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Console Sign In");
}

export const dynamic = "force-dynamic";

type LoginPageSearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

type LoginPageProps = {
  searchParams: LoginPageSearchParams;
};

type AuthLoginMessages = Dictionary["authLogin"]["messages"];

function getSingleSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function authLoginMessage(
  messages: AuthLoginMessages,
  value: string | undefined,
) {
  return value && value in messages
    ? messages[value as keyof AuthLoginMessages]
    : "";
}

function loginHref(nextPath: string, mode: "admin-account" | "shop-code") {
  const params = new URLSearchParams({
    mode,
    next: nextPath,
  });

  return `/auth/login?${params.toString()}`;
}

function loginModeLinkClassName(isActive: boolean) {
  return [
    "inline-flex h-11 items-center justify-center rounded-md px-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 sm:h-10",
    isActive
      ? "bg-slate-950 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
  ].join(" ");
}

export default async function PlatformAdminLoginPage({
  searchParams,
}: LoginPageProps) {
  const { dictionary, locale } = await getI18n();
  const query = await searchParams;
  const next = getSingleSearchParamValue(query.next);
  const mode = getSingleSearchParamValue(query.mode);
  const result = getSingleSearchParamValue(query.result);
  const error = getSingleSearchParamValue(query.error);
  const safeNextPath = safeInternalNextPath(next, "/shop");
  const isMasterConsole =
    safeNextPath === "/platform" || safeNextPath.startsWith("/platform/");
  const activeLoginMode =
    !isMasterConsole && mode === "shop-code" ? "shop-code" : "admin-account";
  const nextPath =
    activeLoginMode === "shop-code"
      ? safeShopAdminNextPath(next, "/shop")
      : safeNextPath;
  const content = isMasterConsole
    ? dictionary.authLogin.master
    : {
        ...dictionary.authLogin.admin,
        cardTitle:
          activeLoginMode === "shop-code"
            ? translateText(dictionary, "Shop code credentials")
            : dictionary.authLogin.admin.cardTitle,
        cardDescription:
          activeLoginMode === "shop-code"
            ? translateText(
                dictionary,
                "Access is verified server-side and never creates a personal profile.",
              )
            : dictionary.authLogin.admin.cardDescription,
      };
  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
  const rendersAccountForm =
    isMasterConsole || activeLoginMode === "admin-account";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white"
              >
                MC
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  MerchandiseControl
                </p>
                <p className="text-sm text-slate-600">{content.brandSubtitle}</p>
              </div>
            </div>
            <LanguageSwitcher
              label={dictionary.languageSwitcher.label}
              locale={locale}
              tone="slate"
            />
          </div>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase text-slate-500">
              {content.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              {content.heading}
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-700">
              {content.description}
            </p>
          </div>

          <div
            className="flex flex-wrap gap-2"
            aria-label={translateText(dictionary, "Auth safety status")}
          >
            {dictionary.authLogin.safetyBadges.map((badge, index) => (
              <span
                key={badge}
                className={[
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  index === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : index === 1
                      ? "border-slate-200 bg-white text-slate-700"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                ].join(" ")}
              >
                {badge}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-950">
              {content.cardTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {content.cardDescription}
            </p>
          </div>

          {!isMasterConsole ? (
            <nav
              aria-label={dictionary.authLogin.tabAriaLabel}
              className="mb-5 grid grid-cols-2 gap-2"
            >
              <Link
                aria-current={
                  activeLoginMode === "admin-account" ? "page" : undefined
                }
                href={loginHref(nextPath, "admin-account")}
                className={loginModeLinkClassName(
                  activeLoginMode === "admin-account",
                )}
              >
                {dictionary.authLogin.adminAccountTab}
              </Link>
              <Link
                aria-current={
                  activeLoginMode === "shop-code" ? "page" : undefined
                }
                href={loginHref(nextPath, "shop-code")}
                className={loginModeLinkClassName(
                  activeLoginMode === "shop-code",
                )}
              >
                {dictionary.authLogin.shopCodeTab}
              </Link>
            </nav>
          ) : null}

          {rendersAccountForm ? (
            <AuthForm
              isConfigured={isConfigured}
              formLabel={content.formLabel}
              labels={dictionary.authForm}
              messages={dictionary.authLogin.messages}
              resultMessage={
                authLoginMessage(
                  dictionary.authLogin.messages,
                  result ?? error ?? "idle",
                )
              }
            />
          ) : (
            <ShopCodeLoginForm
              labels={dictionary.shopCodeLogin}
              nextPath={nextPath}
              result={result}
            />
          )}

          {rendersAccountForm && !isConfigured ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {dictionary.authLogin.configMissing}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
