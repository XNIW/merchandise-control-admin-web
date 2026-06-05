import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAdminRouteDestination,
  resolveCurrentAdminRouteAccess,
} from "@/server/auth/admin-routing";

export const metadata: Metadata = {
  title: "Console Access | MerchandiseControl Admin Web",
  description:
    "Choose Master Console or Admin Console access for MerchandiseControl.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const access = await resolveCurrentAdminRouteAccess();
  const destination = getAdminRouteDestination(access);

  if (destination) {
    redirect(destination);
  }

  if (access.status === "platform_admin" || access.status === "shop_admin") {
    redirect(access.destination);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <section
        aria-labelledby="console-access-title"
        className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-8"
      >
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            MerchandiseControl
          </p>
          <h1
            id="console-access-title"
            className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl"
          >
            Console access
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-700">
            Choose the console that matches the credential in hand. Master
            Console is for platform owner accounts. Admin Console is for shop
            operations through an Admin account or a Shop code and Staff code.
          </p>
          {access.status !== "no_session" ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {access.reason}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Platform owner
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Master Console
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Global ecosystem, users, shops, provisioning, audit, system
              status and controlled operations.
            </p>
            <Link
              href="/auth/login?next=/platform"
              className="mt-5 inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
            >
              Open Master Console
            </Link>
          </article>

          <article className="rounded-md border border-emerald-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Shop operations
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Admin Console
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Shop owners and managers use an Admin account for multi-shop
              access. Staff managers use Shop code and Staff code for a
              single-shop session.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/auth/login?next=/shop"
                className="inline-flex h-10 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white outline-none transition hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              >
                Use Admin account
              </Link>
              <Link
                href="/shop/staff-login"
                className="inline-flex h-10 items-center rounded-md border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900 outline-none transition hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              >
                Use Shop code
              </Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
