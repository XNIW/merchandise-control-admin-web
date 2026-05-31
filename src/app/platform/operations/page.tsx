import type { Metadata } from "next";
import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import type { AuditLog, Profile, Shop, ShopMember } from "@/domain/platform-admin/types";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import {
  createPlatformPendingOwnerInviteAction,
  createPlatformShopAction,
  emergencyRevokePlatformDeviceAction,
  reactivatePlatformShopAction,
  restorePlatformShopAction,
  softDeletePlatformShopAction,
  suspendPlatformShopAction,
} from "./actions";
import {
  grantPlatformAdminAction,
  revokePlatformAdminAction,
} from "../admins/actions";

export const metadata: Metadata = {
  title: "Controlled Operations | MerchandiseControl Admin Web",
  description:
    "Controlled Platform Admin operations for shops with server-side authorization and audit.",
};

export const dynamic = "force-dynamic";

type PlatformOperationsSearchParams = Promise<{
  operation?: string | string[];
  result?: string | string[];
}>;

type OperationKey =
  | "create"
  | "pending_owner_invite"
  | "suspend"
  | "reactivate"
  | "restore"
  | "soft_delete"
  | "device_revoke"
  | "admin_grant"
  | "admin_revoke";

type OperationResultCode =
  | "success"
  | "unauthorized"
  | "not_configured"
  | "validation_failed"
  | "duplicate_shop_code"
  | "owner_not_found"
  | "owner_not_active"
  | "profile_not_found"
  | "profile_not_active"
  | "admin_not_found"
  | "self_lockout_blocked"
  | "last_admin_blocked"
  | "already_active"
  | "invalid_state"
  | "shop_not_found"
  | "device_not_found"
  | "conflict"
  | "db_failure";

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const resultMessages: Record<OperationResultCode, string> = {
  success: "Operation completed.",
  unauthorized: "You are not authorized to perform this operation.",
  not_configured: "Platform Admin runtime is not configured.",
  validation_failed: "Check the required fields and try again.",
  duplicate_shop_code: "A shop with this code already exists.",
  owner_not_found: "The selected owner could not be used.",
  owner_not_active: "The selected owner could not be used.",
  profile_not_found: "The selected profile could not be used.",
  profile_not_active: "The selected profile could not be used.",
  admin_not_found: "The selected Platform Admin grant could not be found.",
  self_lockout_blocked: "The operation was blocked to prevent self-lockout.",
  last_admin_blocked: "At least one active Platform Admin must remain.",
  already_active: "The selected Platform Admin grant is already active.",
  invalid_state: "This operation is not available for the current shop state.",
  shop_not_found: "The selected shop could not be found.",
  device_not_found: "The selected device could not be found.",
  conflict: "The operation could not be completed because of a conflict.",
  db_failure: "Request could not be completed.",
};

const operationLabels: Record<OperationKey, string> = {
  create: "Create shop",
  pending_owner_invite: "Pending owner invite",
  suspend: "Suspend shop",
  reactivate: "Reactivate shop",
  restore: "Restore shop",
  soft_delete: "Soft delete shop",
  device_revoke: "Emergency device action",
  admin_grant: "Grant Platform Admin",
  admin_revoke: "Revoke Platform Admin",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asOperationKey(value: string | undefined): OperationKey | null {
  return value === "create" ||
    value === "pending_owner_invite" ||
    value === "suspend" ||
    value === "reactivate" ||
    value === "restore" ||
    value === "soft_delete" ||
    value === "device_revoke" ||
    value === "admin_grant" ||
    value === "admin_revoke"
    ? value
    : null;
}

function asResultCode(value: string | undefined): OperationResultCode | null {
  return value && value in resultMessages ? (value as OperationResultCode) : null;
}

function profileNameById(profiles: readonly Profile[], profileId?: string) {
  if (!profileId) {
    return "System";
  }

  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    "Platform User"
  );
}

function ownerNameForShop(
  shop: Shop,
  profiles: readonly Profile[],
  members: readonly ShopMember[],
) {
  const owner = members.find(
    (member) => member.shop_id === shop.shop_id && member.role_id === "shop_owner",
  );

  return owner ? profileNameById(profiles, owner.profile_id) : "Unassigned";
}

function recentAuditForShop(logs: readonly AuditLog[], shopId: string) {
  return logs.filter((log) => log.shop_id === shopId).slice(0, 3);
}

function TextInput({
  label,
  name,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        required={required}
        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      />
    </label>
  );
}

function ReasonInput({ id }: { id?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>Reason</span>
      <textarea
        id={id}
        name="reason"
        required
        rows={3}
        className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      />
    </label>
  );
}

function SubmitButton({
  children,
  danger = false,
  disabled = false,
}: {
  children: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={[
        "min-h-10 rounded-md px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        disabled
          ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
          : danger
            ? "border border-rose-700 bg-rose-700 text-white focus-visible:ring-rose-700"
            : "border border-slate-950 bg-slate-950 text-white focus-visible:ring-slate-950",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ActionResultBanner({
  operation,
  result,
}: {
  operation: OperationKey;
  result: OperationResultCode;
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
      <p className="mt-1">{resultMessages[result]}</p>
    </section>
  );
}

export default async function PlatformOperationsPage({
  searchParams,
}: {
  searchParams?: PlatformOperationsSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const operation = asOperationKey(firstParam(params.operation));
  const result = asResultCode(firstParam(params.result));
  const readModel = await getPlatformAdminReadModel();
  const ready = readModel.status === "ready";
  const activeProfiles = readModel.profiles.filter(
    (profile) => profile.profile_status === "active",
  );
  const visibleShops = readModel.shops.slice(0, 100);
  const visibleDevices = readModel.shopDevices.slice(0, 100);
  const activeAdminIds = new Set(readModel.platformAdminProfileIds);
  const activeAdminProfiles = readModel.profiles.filter((profile) =>
    activeAdminIds.has(profile.profile_id),
  );
  const grantableProfiles = activeProfiles.filter(
    (profile) => !activeAdminIds.has(profile.profile_id),
  );

  return (
    <AppShell activeSection="operations">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <PageHeader
          eyebrow="Controlled actions"
          title="Controlled Operations"
          description="Create shops, assign owners, control lifecycle, manage Platform Admin grants, and run emergency actions through server-side authorization and audit."
          status={ready ? "Live actions" : formatToken(readModel.status)}
        />

        {operation && result ? (
          <ActionResultBanner operation={operation} result={result} />
        ) : null}

        <section
          aria-live="polite"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Every operation is checked on the server and written to the audit log.
          Use development-safe test shops only; do not use customer data for
          testing.
        </section>

        {!ready ? (
          <SectionCard
            title="Operations unavailable"
            description="A valid Platform Admin server session is required before controlled actions can run."
          >
            <EmptyState title={formatToken(readModel.status)} description={readModel.reason} />
          </SectionCard>
        ) : (
          <>
            <SectionCard
              title="Create shop"
              description="Creates a shop with either an existing active owner or a pending owner invite without exposing auth delivery artifacts."
            >
              <form action={createPlatformShopAction} className="grid gap-4 lg:grid-cols-2">
                <TextInput label="Shop name" name="shopName" placeholder="Development Test Shop" />
                <TextInput label="Shop code" name="shopCode" placeholder="DEV_TEST_001" />
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
                <div className="lg:col-span-2">
                  <ReasonInput />
                </div>
                <div className="lg:col-span-2">
                  <SubmitButton>Create shop</SubmitButton>
                </div>
              </form>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Pending owner invite
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Creates a pending setup shop and tracks the owner invite without
                  storing delivery artifacts. Email delivery is a documented
                  PASS_WITH_NOTES_EMAIL_DELIVERY follow-up.
                </p>
                <form
                  action={createPlatformPendingOwnerInviteAction}
                  className="mt-4 grid gap-4 lg:grid-cols-2"
                >
                  <TextInput label="Shop name" name="shopName" placeholder="Development Test Shop" />
                  <TextInput label="Shop code" name="shopCode" placeholder="DEV_TEST_002" />
                  <TextInput
                    label="Owner email"
                    name="ownerEmail"
                    placeholder="owner@example.invalid"
                  />
                  <div className="lg:col-span-2">
                    <ReasonInput />
                  </div>
                  <div className="lg:col-span-2">
                    <SubmitButton>Create pending invite</SubmitButton>
                  </div>
                </form>
              </div>
            </SectionCard>

            <SectionCard
              title="Shop actions"
              description="Lifecycle controls are enabled only when the current shop state allows the transition."
            >
              {visibleShops.length === 0 ? (
                <EmptyState
                  title="No shops visible"
                  description="RLS returned no shops for this Platform Admin session."
                />
              ) : (
                <div className="grid gap-4">
                  {visibleShops.map((shop) => {
                    const canSuspend =
                      shop.shop_status === "active" ||
                      shop.shop_status === "pending_setup";
                    const canReactivate = shop.shop_status === "suspended";
                    const canArchive = shop.shop_status !== "archived";
                    const canRestore = shop.shop_status === "archived";
                    const shopAudit = recentAuditForShop(readModel.auditLogs, shop.shop_id);

                    return (
                      <article
                        key={shop.shop_id}
                        className="rounded-md border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                          <div>
                            <h3 className="text-base font-semibold text-slate-950">
                              {shop.shop_name}
                            </h3>
                            <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                              <div>
                                <dt className="font-semibold text-slate-500">Shop code</dt>
                                <dd>{shop.shop_code}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">State</dt>
                                <dd>{formatToken(shop.shop_status)}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">Owner</dt>
                                <dd>
                                  {ownerNameForShop(
                                    shop,
                                    readModel.profiles,
                                    readModel.shopMembers,
                                  )}
                                </dd>
                              </div>
                            </dl>
                            <div className="mt-3 text-xs text-slate-600">
                              <p className="font-semibold text-slate-500">Recent audit</p>
                              {shopAudit.length > 0 ? (
                                <ul className="mt-1 grid gap-1">
                                  {shopAudit.map((log) => (
                                    <li key={log.audit_log_id}>
                                      {log.event} - {formatToken(log.result)}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p>No audit rows visible for this shop.</p>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-3">
                            <form action={suspendPlatformShopAction} className="grid gap-2">
                              <input type="hidden" name="shopId" value={shop.shop_id} />
                              <ReasonInput />
                              <TextInput
                                label="Type shop code to suspend"
                                name="confirmation"
                                placeholder={shop.shop_code}
                              />
                              <SubmitButton disabled={!canSuspend}>Suspend shop</SubmitButton>
                            </form>

                            <form action={reactivatePlatformShopAction} className="grid gap-2">
                              <input type="hidden" name="shopId" value={shop.shop_id} />
                              <ReasonInput />
                              <TextInput
                                label="Type shop code to reactivate"
                                name="confirmation"
                                placeholder={shop.shop_code}
                              />
                              <SubmitButton disabled={!canReactivate}>
                                Reactivate shop
                              </SubmitButton>
                            </form>

                            <form action={softDeletePlatformShopAction} className="grid gap-2">
                              <input type="hidden" name="shopId" value={shop.shop_id} />
                              <ReasonInput />
                              <TextInput
                                label="Type shop code to archive"
                                name="shopCodeConfirmation"
                                placeholder={shop.shop_code}
                              />
                              <SubmitButton danger disabled={!canArchive}>
                                Soft delete shop
                              </SubmitButton>
                            </form>

                            <form action={restorePlatformShopAction} className="grid gap-2">
                              <input type="hidden" name="shopId" value={shop.shop_id} />
                              <ReasonInput />
                              <TextInput
                                label="Type shop code to restore"
                                name="shopCodeConfirmation"
                                placeholder={shop.shop_code}
                              />
                              <SubmitButton disabled={!canRestore}>Restore shop</SubmitButton>
                            </form>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Platform Admin grants"
              description="Grant and revoke global admin access through anti self-lockout RPCs with reason and confirmation."
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <form action={grantPlatformAdminAction} className="grid gap-3">
                  <label className="grid gap-1.5 text-sm font-medium text-slate-800">
                    <span>Profile</span>
                    <select
                      name="profileId"
                      required
                      className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                    >
                      <option value="">Select active profile</option>
                      {grantableProfiles.map((profile) => (
                        <option key={profile.profile_id} value={profile.profile_id}>
                          {profile.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ReasonInput />
                  <TextInput label="Type GRANT to confirm" name="confirmation" />
                  <SubmitButton disabled={grantableProfiles.length === 0}>
                    Grant admin
                  </SubmitButton>
                </form>

                <div className="grid gap-3">
                  {activeAdminProfiles.length === 0 ? (
                    <EmptyState
                      title="No active admin rows"
                      description="No active Platform Admin grants are visible through RLS."
                    />
                  ) : (
                    activeAdminProfiles.map((profile) => (
                      <form
                        key={profile.profile_id}
                        action={revokePlatformAdminAction}
                        className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3"
                      >
                        <input type="hidden" name="profileId" value={profile.profile_id} />
                        <p className="text-sm font-semibold text-slate-950">
                          {profile.display_name}
                        </p>
                        <ReasonInput />
                        <TextInput label="Type REVOKE to confirm" name="confirmation" />
                        <SubmitButton danger disabled={activeAdminProfiles.length <= 1}>
                          Revoke admin
                        </SubmitButton>
                      </form>
                    ))
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Emergency devices"
              description="Revokes an authorized device through a Platform Admin RPC with shop code confirmation and audit."
            >
              {visibleDevices.length === 0 ? (
                <EmptyState
                  title="No devices visible"
                  description="RLS returned no device rows for this Platform Admin session."
                />
              ) : (
                <div className="grid gap-4">
                  {visibleDevices.map((device) => {
                    const shop = readModel.shops.find(
                      (item) => item.shop_id === device.shop_id,
                    );
                    const disabled = device.status === "revoked" || !shop;

                    return (
                      <article
                        key={device.shop_device_id}
                        className="rounded-md border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                          <div>
                            <h3 className="text-base font-semibold text-slate-950">
                              {device.display_name}
                            </h3>
                            <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                              <div>
                                <dt className="font-semibold text-slate-500">Shop</dt>
                                <dd>{shop?.shop_name ?? "Unknown shop"}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">State</dt>
                                <dd>{formatToken(device.status)}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">Last seen</dt>
                                <dd>{device.last_seen_at ?? "Never"}</dd>
                              </div>
                            </dl>
                          </div>
                          <form
                            action={emergencyRevokePlatformDeviceAction}
                            className="grid gap-2"
                          >
                            <input
                              type="hidden"
                              name="shopDeviceId"
                              value={device.shop_device_id}
                            />
                            <ReasonInput />
                            <TextInput
                              label="Type shop code to confirm"
                              name="confirmation"
                              placeholder={shop?.shop_code ?? ""}
                            />
                            <SubmitButton danger disabled={disabled}>
                              Emergency revoke
                            </SubmitButton>
                          </form>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Audit preview"
              description="Latest audit rows returned through the server boundary."
            >
              {readModel.auditLogs.length === 0 ? (
                <EmptyState
                  title="Audit empty"
                  description="No audit rows are visible for this session."
                />
              ) : (
                <ul className="grid gap-2 text-sm text-slate-700">
                  {readModel.auditLogs.slice(0, 12).map((log) => (
                    <li
                      key={log.audit_log_id}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <span className="font-semibold text-slate-950">{log.event}</span>
                      <span className="ml-2 text-slate-500">
                        {formatToken(log.result)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
