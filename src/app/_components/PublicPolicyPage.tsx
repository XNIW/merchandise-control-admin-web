import Link from "next/link";
import type { ReactNode } from "react";

type PublicPolicyPageProps = Readonly<{
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}>;

export function PublicPolicyPage({
  children,
  description,
  eyebrow,
  title,
}: PublicPolicyPageProps) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-950 px-5 py-8 text-white sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            {description}
          </p>
        </header>

        <div className="space-y-8 px-5 py-7 text-sm leading-7 text-slate-700 sm:px-8 sm:py-10 sm:text-base">
          <aside className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>Staging notice:</strong> this factual technical summary is
            subject to owner and legal review. It is not a final legal policy.
          </aside>
          {children}
        </div>

        <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 bg-slate-50 px-5 py-5 text-sm sm:px-8">
          <Link className="font-medium text-emerald-800 underline" href="/privacy">
            Privacy
          </Link>
          <Link
            className="font-medium text-emerald-800 underline"
            href="/account-deletion"
          >
            Account deletion
          </Link>
          <Link
            className="font-medium text-emerald-800 underline"
            href="/account/profile"
          >
            Account profile
          </Link>
        </footer>
      </article>
    </main>
  );
}

export function PolicySection({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
