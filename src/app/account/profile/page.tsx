import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionCard } from "@/components/admin/SectionCard";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/get-locale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordResetPanel, type PasswordResetPanelLabels } from "./PasswordResetPanel";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Account Profile");
}

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const { dictionary, locale } = await getI18n();
  const labels = dictionary.accountProfile;
  const supabase = await createSupabaseServerClient();
  const authResult = supabase ? await supabase.auth.getUser() : null;
  const user = authResult?.data.user;
  const resetLabels = {
    description: labels.passwordReset.description,
    messages: labels.passwordReset.messages,
    pending: labels.passwordReset.pending,
    submit: labels.passwordReset.submit,
    title: labels.passwordReset.title,
  } satisfies PasswordResetPanelLabels;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-5">
        <PageHeader
          accent="emerald"
          description={labels.description}
          eyebrow={labels.eyebrow}
          status={user ? labels.signedIn : labels.noPersonalSession}
          title={labels.title}
          titleId="account-profile-title"
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            description={labels.sessionDescription}
            title={labels.sessionTitle}
            titleId="session-status-title"
          >
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <dt className="font-medium text-zinc-700">{labels.email}</dt>
                <dd className="mt-1 text-zinc-950">
                  {user?.email ?? labels.notSignedIn}
                </dd>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <dt className="font-medium text-zinc-700">{labels.userId}</dt>
                <dd className="mt-1 break-all text-zinc-950">
                  {user?.id ?? labels.notAvailable}
                </dd>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <dt className="font-medium text-zinc-700">
                  {labels.lastSignIn}
                </dt>
                <dd className="mt-1 text-zinc-950">
                  {formatDateTime(locale, user?.last_sign_in_at)}
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard
            description={labels.securityDescription}
            title={labels.securityTitle}
            titleId="account-security-title"
          >
            <PasswordResetPanel labels={resetLabels} />
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <Link className="font-medium text-zinc-700 underline" href="/">
                {labels.adminHome}
              </Link>
              <Link className="font-medium text-zinc-700 underline" href="/auth/logout">
                {labels.signOut}
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
