import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Admin Account Sign In | MerchandiseControl Admin Web",
  description:
    "Sign in with a personal account for Master Console or Admin Console.",
};

export const dynamic = "force-dynamic";

export default function PlatformAdminLoginPage() {
  const isConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );

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
              <p className="text-sm text-slate-600">
                Master Console / Admin Console
              </p>
            </div>
          </div>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Admin account
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Admin account sign in
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-700">
              Use a personal account for Master Console platform ownership or
              Admin Console shop membership. Shop-code staff managers use the
              Shop code sign-in path instead.
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
              Admin account credentials
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              The Supabase SSR session opens only the console authorized
              server-side for this account.
            </p>
          </div>

          <AuthForm isConfigured={isConfigured} />

          {!isConfigured ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Supabase browser auth is not configured in this runtime.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
            >
              Back to console selection
            </Link>
            <Link
              href="/shop/staff-login"
              className="inline-flex text-sm font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
            >
              Use Shop code sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
