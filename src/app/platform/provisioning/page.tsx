import type { Metadata } from "next";
import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import { ShopProvisioningForms } from "./ShopProvisioningForms";
import { StaffManagerProvisioningPanel } from "./StaffManagerProvisioningPanel";

export const metadata: Metadata = {
  title: "Provisioning | MerchandiseControl Admin Web",
  description: "Safe Platform Admin shop provisioning.",
};

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
  const readModel = await getPlatformAdminReadModel();
  const ready = readModel.status === "ready";
  const ownerProfileOptions = readModel.profiles
    .map((profile) => ({
      displayName: profile.display_name,
      profileId: profile.profile_id,
      shortProfileId: shortIdentifier(profile.profile_id),
      status: formatToken(profile.profile_status),
    }));
  const shopOptions = readModel.shops
    .map((shop) => ({
      label: `${shop.shop_name} (${shop.shop_code})`,
      shopCode: shop.shop_code,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      status: formatToken(shop.shop_status),
    }));

  return (
    <AppShell activeSection="provisioning">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <PageHeader
          eyebrow="Master Console"
          title="Shop Provisioning"
          description="Create shops, fiscal identity, and initial manager access through audited Platform Admin boundaries."
          status={ready ? "Safe provisioning" : formatToken(readModel.status)}
        />

        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-5 text-slate-700">
          Use shops as the business root. Shop code remains a technical POS/Admin Console login code;
          company RUT is stored separately for fiscal/boleta identity.
        </section>

        {!ready ? (
          <SectionCard
            title={`Provisioning ${formatToken(readModel.status)}`}
            description={readModel.reason}
          >
            <EmptyState title={formatToken(readModel.status)} description={readModel.reason} />
          </SectionCard>
        ) : (
          <>
            <ShopProvisioningForms ownerProfiles={ownerProfileOptions} />

            <details className="rounded-md border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                Emergency recovery: recover initial manager 1001
              </summary>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                Use this only when an existing shop lost manager access. The server will restore or recreate manager 1001 and generate a new temporary credential. The old credential is never shown.
              </p>
              <div className="mt-4 max-w-3xl">
                <StaffManagerProvisioningPanel shops={shopOptions} />
              </div>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}
