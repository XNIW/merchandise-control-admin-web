import type { Metadata } from "next";
import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import {
  createPlatformPendingOwnerInviteAction,
  createPlatformShopAction,
} from "../operations/actions";
import { StaffManagerProvisioningPanel } from "./StaffManagerProvisioningPanel";

export const metadata: Metadata = {
  title: "Provisioning | MerchandiseControl Admin Web",
  description: "Safe Platform Admin provisioning.",
};

export const dynamic = "force-dynamic";

function formatToken(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PlatformProvisioningPage() {
  const readModel = await getPlatformAdminReadModel();
  const ready = readModel.status === "ready";
  const activeProfiles = readModel.profiles.filter(
    (profile) => profile.profile_status === "active",
  );
  const activeShopOptions = readModel.shops
    .filter((shop) => shop.shop_status === "active")
    .map((shop) => ({
      label: `${shop.shop_name} (${shop.shop_code})`,
      shopId: shop.shop_id,
    }));

  return (
    <AppShell activeSection="provisioning">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <PageHeader
          eyebrow="Shop onboarding"
          title="Provisioning"
          description="Create a shop with an existing owner or a pending owner invite through audited Platform Admin boundaries."
          status={ready ? "Safe provisioning" : formatToken(readModel.status)}
        />

        {!ready ? (
          <SectionCard
            title="Provisioning unavailable"
            description="A valid Platform Admin server session is required before provisioning can run."
          >
            <EmptyState title={formatToken(readModel.status)} description={readModel.reason} />
          </SectionCard>
        ) : (
          <div className="grid gap-5">
            <SectionCard
              title="Create shop with existing owner"
              description="Owner assignment uses an existing active profile and writes audit in the create-shop RPC."
            >
              <form action={createPlatformShopAction} className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>Shop name</span>
                  <input
                    name="shopName"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>Shop code</span>
                  <input
                    name="shopCode"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>Initial owner</span>
                  <select
                    name="ownerProfileId"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  >
                    <option value="">Select active profile</option>
                    {activeProfiles.map((profile) => (
                      <option key={profile.profile_id} value={profile.profile_id}>
                        {profile.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>Reason</span>
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
                    Create shop
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              title="Create pending owner invite"
              description="Creates a pending setup shop and stores only redacted owner contact state. Email delivery pending is tracked as PASS_WITH_NOTES_EMAIL_DELIVERY."
            >
              <form
                action={createPlatformPendingOwnerInviteAction}
                className="grid gap-4 lg:grid-cols-2"
              >
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>Shop name</span>
                  <input
                    name="shopName"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                  <span>Shop code</span>
                  <input
                    name="shopCode"
                    required
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>Owner email</span>
                  <input
                    name="ownerEmail"
                    required
                    type="email"
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800 lg:col-span-2">
                  <span>Reason</span>
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
                    Create pending invite
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              title="Provision POS manager web access"
              description="Creates a shop-scoped manager staff account and enables shop_admin.full_access for the manager role through a server-only Platform Admin boundary."
            >
              <StaffManagerProvisioningPanel shops={activeShopOptions} />
            </SectionCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
