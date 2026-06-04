import type { Metadata } from "next";
import Link from "next/link";
import { staffManagerWebLoginAction } from "./actions";

export const metadata: Metadata = {
  title: "Staff Manager Sign In | MerchandiseControl Admin Web",
  description: "Sign in to Shop Admin with POS manager staff credentials.",
};

export const dynamic = "force-dynamic";

type StaffLoginSearchParams = Promise<{
  result?: string | string[];
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusMessage(result: string | undefined) {
  if (!result) {
    return null;
  }

  if (result === "not_configured") {
    return "Staff manager access is not configured in this runtime.";
  }

  if (result === "locked") {
    return "Sign-in is temporarily blocked. Try again later or ask an admin to reset access.";
  }

  return "Sign-in was blocked. Check the credentials and try again.";
}

export default async function StaffManagerWebLoginPage({
  searchParams,
}: {
  searchParams: StaffLoginSearchParams;
}) {
  const params = await searchParams;
  const message = statusMessage(firstParam(params.result));

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="grid gap-5">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-md bg-emerald-700 text-sm font-semibold text-white"
            >
              MC
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-950">
                MerchandiseControl
              </p>
              <p className="text-sm text-zinc-600">Shop Admin Console</p>
            </div>
          </div>

          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase text-zinc-500">
              Staff manager access
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950 sm:text-4xl">
              POS manager sign in
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-700">
              Use the shop code, staff code and assigned credential for one
              shop. Personal admin accounts continue to use the regular sign in.
            </p>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Staff login safety status">
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              HTTP-only cookie
            </span>
            <span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
              Single shop
            </span>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Manager only
            </span>
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-zinc-950">
              Staff credentials
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Access is verified server-side and never creates a personal profile.
            </p>
          </div>

          <form action={staffManagerWebLoginAction} className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="shopCode" className="text-sm font-medium text-zinc-800">
                Shop code
              </label>
              <input
                id="shopCode"
                name="shopCode"
                autoComplete="organization"
                required
                className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="staffCode" className="text-sm font-medium text-zinc-800">
                Staff code
              </label>
              <input
                id="staffCode"
                name="staffCode"
                autoComplete="username"
                required
                className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="credential" className="text-sm font-medium text-zinc-800">
                Credential
              </label>
              <input
                id="credential"
                name="credential"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white outline-none transition hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              Sign in
            </button>
          </form>

          {message ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              {message}
            </p>
          ) : null}

          <Link
            href="/auth/login?next=/shop"
            className="mt-5 inline-flex text-sm font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
          >
            Use personal account sign in
          </Link>
        </section>
      </div>
    </main>
  );
}
