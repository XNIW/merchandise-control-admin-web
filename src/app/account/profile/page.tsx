import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/get-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordResetPanel } from "./PasswordResetPanel";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Account Profile");
}

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const { locale } = await getI18n();
  const supabase = await createSupabaseServerClient();
  const authResult = supabase ? await supabase.auth.getUser() : null;
  const user = authResult?.data.user;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-5">
        <PageHeader
          accent="emerald"
          description="Personal account session details for Admin Web. Staff web sessions remain separate under Shop Admin."
          eyebrow="Account"
          status={user ? "Signed in" : "No personal session"}
          title="Profile"
          titleId="account-profile-title"
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            description="Session status is read from Supabase SSR cookies on the server."
            title="Session status"
            titleId="session-status-title"
          >
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <dt className="font-medium text-zinc-700">Email</dt>
                <dd className="mt-1 text-zinc-950">{user?.email ?? "Not signed in"}</dd>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <dt className="font-medium text-zinc-700">User id</dt>
                <dd className="mt-1 break-all text-zinc-950">
                  {user?.id ?? "Not available"}
                </dd>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <dt className="font-medium text-zinc-700">Last sign in</dt>
                <dd className="mt-1 text-zinc-950">
                  {formatDateTime(locale, user?.last_sign_in_at)}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard
            description="Account changes stay inside Supabase Auth flows."
            title="Security"
            titleId="account-security-title"
          >
            <PasswordResetPanel />
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <Link className="font-medium text-zinc-700 underline" href="/">
                Admin home
              </Link>
              <Link className="font-medium text-zinc-700 underline" href="/auth/logout">
                Sign out
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
