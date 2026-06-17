import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import {
  createPlatformPendingOwnerInviteAction,
  createPlatformShopAction,
} from "../../operations/actions";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Provision Shop");
}

export const dynamic = "force-dynamic";

function formatToken(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PlatformNewShopPage() {
  const { dictionary, locale } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const readModel = await getPlatformAdminReadModel();
  const ready = readModel.status === "ready";
  const activeProfiles = readModel.profiles.filter(
    (profile) => profile.profile_status === "active",
  );

  return (
    <AppShell activeSection="provisioning" dictionary={dictionary} locale={locale}>
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <PageHeader
          eyebrow={t("Shop onboarding")}
          title={t("Provision Shop")}
          description={t(
            "Create a shop with an existing owner or a pending owner invite through audited Master Console boundaries.",
          )}
          status={ready ? t("Safe provisioning") : t(formatToken(readModel.status))}
        />

        {!ready ? (
          <SectionCard
            title={t("Provisioning unavailable")}
            description={t(
              "A valid Master Console server session is required before provisioning can run.",
            )}
          >
            <EmptyState
              title={t(formatToken(readModel.status))}
              description={t(readModel.reason)}
            />
          </SectionCard>
        ) : (
          <div className="grid gap-5">
            <SectionCard
              title={t("Create shop with existing owner")}
              description={t(
                "Owner assignment uses an existing active profile and writes audit in the create-shop RPC.",
              )}
            >
              <form action={createPlatformShopAction} className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>{t("Shop name")}</span>
                  <input
                    name="shopName"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>{t("Shop code")}</span>
                  <input
                    name="shopCode"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>{t("Initial owner")}</span>
                  <select
                    name="ownerProfileId"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  >
                    <option value="">{t("Select active profile")}</option>
                    {activeProfiles.map((profile) => (
                      <option key={profile.profile_id} value={profile.profile_id}>
                        {profile.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>{t("Reason")}</span>
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="min-h-10 rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                  >
                    {t("Create shop")}
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              title={t("Create pending owner invite")}
              description={t(
                "Creates a pending setup shop and stores only redacted owner contact state. Email delivery pending is tracked as PASS_WITH_NOTES_EMAIL_DELIVERY.",
              )}
            >
              <form
                action={createPlatformPendingOwnerInviteAction}
                className="grid gap-4 lg:grid-cols-2"
              >
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>{t("Shop name")}</span>
                  <input
                    name="shopName"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>{t("Shop code")}</span>
                  <input
                    name="shopCode"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>{t("Owner email")}</span>
                  <input
                    name="ownerEmail"
                    required
                    type="email"
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>{t("Reason")}</span>
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="min-h-10 rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                  >
                    {t("Create pending invite")}
                  </button>
                </div>
              </form>
            </SectionCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
