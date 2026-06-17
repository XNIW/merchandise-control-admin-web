import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import { createPlatformProvisioningLabels } from "./provisioningLabels";
import { ShopProvisioningForms } from "./ShopProvisioningForms";
import { StaffManagerProvisioningPanel } from "./StaffManagerProvisioningPanel";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Provisioning");
}

export const dynamic = "force-dynamic";

function formatToken(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function shortIdentifier(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export default async function PlatformProvisioningPage() {
  const { dictionary } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const labels = createPlatformProvisioningLabels(t);
  const readModel = await getPlatformAdminReadModel();
  const ready = readModel.status === "ready";
  const ownerProfileOptions = readModel.profiles
    .map((profile) => ({
      displayName: profile.display_name,
      profileId: profile.profile_id,
      shortProfileId: shortIdentifier(profile.profile_id),
      status: t(formatToken(profile.profile_status)),
    }));
  const shopOptions = readModel.shops
    .map((shop) => ({
      label: `${shop.shop_name} (${shop.shop_code})`,
      shopCode: shop.shop_code,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      status: t(formatToken(shop.shop_status)),
    }));

  return (
    <AppShell activeSection="provisioning">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <PageHeader
          eyebrow={t("Master Console")}
          title={t("Shop Provisioning")}
          description={t(
            "Create shops, fiscal identity, and initial manager access through audited Platform Admin boundaries.",
          )}
          status={ready ? t("Safe provisioning") : t(formatToken(readModel.status))}
        />

        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-5 text-slate-700">
          {t(
            "Use shops as the business root. Shop code remains a technical POS/Admin Console login code; company RUT is stored separately for fiscal/boleta identity.",
          )}
        </section>

        {!ready ? (
          <SectionCard
            title={`${t("Provisioning")} ${t(formatToken(readModel.status))}`}
            description={t(readModel.reason)}
          >
            <EmptyState
              title={t(formatToken(readModel.status))}
              description={t(readModel.reason)}
            />
          </SectionCard>
        ) : (
          <>
            <ShopProvisioningForms
              labels={labels}
              ownerProfiles={ownerProfileOptions}
            />

            <details className="rounded-md border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                {t("Emergency recovery: recover initial manager 1001")}
              </summary>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                {t(
                  "Use this only when an existing shop lost manager access. The server will restore or recreate manager 1001 and generate a new temporary PIN. The old PIN is never shown.",
                )}
              </p>
              <div className="mt-4 max-w-3xl">
                <StaffManagerProvisioningPanel
                  labels={labels}
                  shops={shopOptions}
                />
              </div>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}
