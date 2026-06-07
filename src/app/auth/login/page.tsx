import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { ShopCodeLoginForm } from "@/components/auth/ShopCodeLoginForm";

export const metadata: Metadata = {
  title: "Console Sign In | MerchandiseControl Admin Web",
  description:
    "Sign in to the requested MerchandiseControl console with the supported credential method.",
};

export const dynamic = "force-dynamic";

type LoginPageSearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

type LoginPageProps = {
  searchParams: LoginPageSearchParams;
};

function getSingleSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function tabClassName(isActive: boolean) {
  return [
    "inline-flex h-10 items-center justify-center rounded-md px-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
    isActive
      ? "bg-slate-950 text-white shadow-sm"
      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
  ].join(" ");
}

export default async function PlatformAdminLoginPage({
  searchParams,
}: LoginPageProps) {
  const query = await searchParams;
  const next = getSingleSearchParamValue(query.next);
  const mode = getSingleSearchParamValue(query.mode);
  const result = getSingleSearchParamValue(query.result);
  const isMasterConsole = next === "/platform";
  const activeLoginMode =
    !isMasterConsole && mode === "shop-code" ? "shop-code" : "admin-account";
  const content = isMasterConsole
    ? {
        brandSubtitle: "Master Console",
        eyebrow: "Master Console",
        heading: "Master Console sign in",
        description:
          "Use the platform owner account to open the Master Console. Platform authorization is verified server-side.",
        cardTitle: "Master Console credentials",
        cardDescription:
          "Only platform owner accounts can continue into the Master Console.",
        formLabel: "Master Console sign in",
      }
    : {
        brandSubtitle: "Admin Console",
        eyebrow: "Admin Console",
        heading: "Admin Console sign in",
        description:
          "Use an Admin account for shop-owner or manager access, or use Shop code and Staff code for a single-shop staff session.",
        cardTitle:
          activeLoginMode === "shop-code"
            ? "Shop code credentials"
            : "Admin account credentials",
        cardDescription:
          activeLoginMode === "shop-code"
            ? "Access is verified server-side and never creates a personal profile."
            : "The Supabase SSR session opens only the Admin Console authorized server-side for this account.",
        formLabel: "Admin account sign in",
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

          <div className="flex flex-wrap gap-2" aria-label="Auth safety status">
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              SSR session
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
              Server-side reads
            </span>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              No service key in browser
            </span>
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
              role="tablist"
              aria-label="Admin Console sign-in method"
              className="mb-5 grid grid-cols-2 gap-2"
            >
              <Link
                role="tab"
                aria-selected={activeLoginMode === "admin-account"}
                href="/auth/login?next=/shop&mode=admin-account"
                className={tabClassName(activeLoginMode === "admin-account")}
              >
                Admin account
              </Link>
              <Link
                role="tab"
                aria-selected={activeLoginMode === "shop-code"}
                href="/auth/login?next=/shop&mode=shop-code"
                className={tabClassName(activeLoginMode === "shop-code")}
              >
                Shop code
              </Link>
            </nav>
          ) : null}

          {rendersAccountForm ? (
            <AuthForm isConfigured={isConfigured} formLabel={content.formLabel} />
          ) : (
            <ShopCodeLoginForm result={result} />
          )}

          {rendersAccountForm && !isConfigured ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Supabase browser auth is not configured in this runtime.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
