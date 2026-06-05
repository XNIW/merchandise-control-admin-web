import type { Metadata } from "next";
import { AppShell } from "@/components/platform/AppShell";
import { PendingSubmitButton } from "@/components/platform/PendingSubmitButton";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import type { PlatformShopActionCode } from "@/server/platform-admin/action-types";
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

type PlatformProvisioningSearchParams = Promise<{
  operation?: string | string[];
  result?: string | string[];
}>;

type ProvisioningOperationKey = "create" | "pending_owner_invite";

const operationLabels: Record<ProvisioningOperationKey, string> = {
  create: "Create shop",
  pending_owner_invite: "Pending owner invite",
};

const resultMessages: Record<PlatformShopActionCode, string> = {
  admin_not_found: "The selected Platform Admin grant could not be found.",
  already_active: "The selected Platform Admin grant is already active.",
  conflict: "The action could not finish because the current state changed.",
  db_failure:
    "The controlled database action failed. Retry with a new code or review system health.",
  device_not_found: "The selected device could not be found.",
  duplicate_shop_code: "A shop with this code already exists.",
  invalid_state: "This action is not available for the current shop state.",
  last_admin_blocked: "At least one active Platform Admin must remain.",
  not_configured: "Platform Admin runtime is not configured.",
  owner_not_active: "The selected owner is not active.",
  owner_not_found: "The selected owner could not be found.",
  profile_not_active: "The selected profile is not active.",
  profile_not_found: "The selected profile could not be found.",
  self_lockout_blocked: "This action was blocked to prevent self-lockout.",
  shop_not_found: "The selected shop could not be found.",
  success: "Operation completed.",
  unauthorized: "You are not authorized to perform this action.",
  validation_failed: "Check the required fields and try again.",
};

function formatToken(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asOperationKey(value: string | undefined): ProvisioningOperationKey | null {
  return value === "create" || value === "pending_owner_invite" ? value : null;
}

function asResultCode(value: string | undefined): PlatformShopActionCode | null {
  return value && value in resultMessages ? (value as PlatformShopActionCode) : null;
}

function resultMessage(
  operation: ProvisioningOperationKey,
  result: PlatformShopActionCode,
) {
  if (result === "success" && operation === "create") {
    return "Shop created.";
  }

  if (result === "success" && operation === "pending_owner_invite") {
    return "Pending owner invite created.";
  }

  return resultMessages[result];
}

function ActionResultBanner({
  operation,
  result,
}: {
  operation: ProvisioningOperationKey;
  result: PlatformShopActionCode;
}) {
  const isSuccess = result === "success";

  return (
    <section
      aria-live="polite"
      role={isSuccess ? "status" : "alert"}
      className={[
        "rounded-md border p-4 text-sm",
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-rose-200 bg-rose-50 text-rose-900",
      ].join(" ")}
    >
      <p className="font-semibold">{operationLabels[operation]}</p>
      <p className="mt-1">{resultMessage(operation, result)}</p>
    </section>
  );
}

export default async function PlatformProvisioningPage({
  searchParams,
}: {
  searchParams?: PlatformProvisioningSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const operation = asOperationKey(firstParam(params.operation));
  const result = asResultCode(firstParam(params.result));
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

        {operation && result ? (
          <ActionResultBanner operation={operation} result={result} />
        ) : null}

        {!ready ? (
          <SectionCard
            title={`Provisioning ${formatToken(readModel.status)}`}
            description={readModel.reason}
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
                <input type="hidden" name="returnTo" value="/platform/provisioning" />
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
                  <PendingSubmitButton pendingLabel="Creating shop">
                    Create shop
                  </PendingSubmitButton>
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
                <input type="hidden" name="returnTo" value="/platform/provisioning" />
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
                  <PendingSubmitButton pendingLabel="Creating pending invite">
                    Create pending invite
                  </PendingSubmitButton>
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
