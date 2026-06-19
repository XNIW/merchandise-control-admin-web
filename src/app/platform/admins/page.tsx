import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import {
  formatToken,
  shortIdentifier,
} from "@/components/platform/displayFormat";
import { AccountIdentity } from "@/components/account/AccountIdentity";
import type { Profile } from "@/domain/platform-admin/types";
import { formatDateTime } from "@/i18n/format";
import { getI18n } from "@/i18n/get-locale";
import { createAccountIdentitySummary } from "@/lib/account-identity";
import { translateText } from "@/i18n/translate-sections";
import {
  getPlatformAdminReadModel,
  type PlatformAdminLiveReadModel,
  type PlatformUserAccountSummary,
} from "@/server/platform-admin/read-model";
import {
  grantPlatformAdminAction,
  revokePlatformAdminAction,
} from "./actions";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Platform Admins");
}

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  operation?: string | string[];
  result?: string | string[];
}>;

type ResultCode =
  | "success"
  | "unauthorized"
  | "not_configured"
  | "validation_failed"
  | "profile_not_found"
  | "profile_not_active"
  | "admin_not_found"
  | "self_lockout_blocked"
  | "last_admin_blocked"
  | "already_active"
  | "conflict"
  | "db_failure";

const resultMessages: Record<ResultCode, string> = {
  success: "Operation completed.",
  unauthorized: "You are not authorized to perform this operation.",
  not_configured: "Platform Admin runtime is not configured.",
  validation_failed: "Check the required fields and try again.",
  profile_not_found: "The selected profile could not be used.",
  profile_not_active: "The selected profile could not be used.",
  admin_not_found: "The selected Platform Admin grant could not be found.",
  self_lockout_blocked: "The operation was blocked to prevent self-lockout.",
  last_admin_blocked: "At least one active Platform Admin must remain.",
  already_active: "The selected Platform Admin grant is already active.",
  conflict: "The operation could not be completed because of a conflict.",
  db_failure: "The controlled database action failed without exposing internal details.",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asResultCode(value: string | undefined): ResultCode | null {
  return value && value in resultMessages ? (value as ResultCode) : null;
}

function profileNameById(
  profiles: readonly Profile[],
  profileId: string,
  fallback: string,
) {
  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    fallback
  );
}

function accountForProfile(
  readModel: PlatformAdminLiveReadModel,
  profileId: string,
) {
  return readModel.userAccounts.find((account) => account.profileId === profileId);
}

function accountEmail(account: PlatformUserAccountSummary | undefined) {
  return account?.email ?? "Auth identity unavailable";
}

function accountOrigin(account: PlatformUserAccountSummary | undefined) {
  if (!account) {
    return "Auth identity unavailable";
  }

  return `${account.provider} / ${formatToken(account.providerType)}`;
}

function isUnavailableIdentityValue(value: string | undefined) {
  return (
    !value ||
    value === "Auth identity unavailable" ||
    value === "Email unavailable"
  );
}

function accountIdentityForProfile(
  readModel: PlatformAdminLiveReadModel,
  profileId: string,
  fallback: string,
) {
  const account = accountForProfile(readModel, profileId);

  return createAccountIdentitySummary({
    displayName:
      account?.displayName ?? profileNameById(readModel.profiles, profileId, fallback),
    email: isUnavailableIdentityValue(account?.email) ? null : account?.email,
    profileId,
    rawProvider: isUnavailableIdentityValue(account?.provider)
      ? null
      : account?.provider,
  });
}

function shopAdminOverlap(account: PlatformUserAccountSummary | undefined) {
  if (!account || account.shopAdminMembershipCount === 0) {
    return "No shop admin membership";
  }

  if (account.currentShopAdminMembershipCount > 0) {
    return `${account.currentShopAdminMembershipCount} current shop admin membership${account.currentShopAdminMembershipCount === 1 ? "" : "s"}`;
  }

  if (account.historicalShopAdminMembershipCount > 0) {
    return `${account.historicalShopAdminMembershipCount} historical shop admin membership${account.historicalShopAdminMembershipCount === 1 ? "" : "s"}`;
  }

  return `${account.disabledShopAdminMembershipCount} disabled shop admin membership${account.disabledShopAdminMembershipCount === 1 ? "" : "s"}`;
}

function profileOptionLabel(
  profile: Profile,
  account: PlatformUserAccountSummary | undefined,
) {
  return `${profile.display_name} / ${accountEmail(account)} / Profile ${shortIdentifier(profile.profile_id)}`;
}

function ReasonInput({ label }: { label: string }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <textarea
        name="reason"
        required
        rows={3}
        className="min-h-20 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      />
    </label>
  );
}

function ConfirmationInput({
  label,
  name = "confirmation",
}: {
  label: string;
  name?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input
        name={name}
        required
        className="min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
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
        "min-h-10 w-full min-w-0 rounded-md px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
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

export default async function PlatformAdminsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const { dictionary, locale } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const result = asResultCode(firstParam(params.result));
  const readModel = await getPlatformAdminReadModel({
    includeAuthIdentities: true,
  });
  const ready = readModel.status === "ready";
  const activeAdminIds = new Set(readModel.platformAdminProfileIds);
  const activeProfiles = readModel.profiles.filter(
    (profile) => profile.profile_status === "active",
  );
  const grantableProfiles = activeProfiles.filter(
    (profile) => !activeAdminIds.has(profile.profile_id),
  );
  const activeAdmins = readModel.platformAdmins.filter(
    (admin) => admin.status === "active",
  );
  const currentAccount = ready && readModel.currentProfileId
    ? accountForProfile(readModel, readModel.currentProfileId)
    : undefined;

  return (
    <AppShell activeSection="admins">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <PageHeader
          eyebrow={t("Global security")}
          title={t("Platform Admins")}
          description={t(
            "Manage only global Master Console access. Shop owners and managers belong to shop_members, not platform_admins.",
          )}
          status={ready ? t("Live actions") : t(formatToken(readModel.status))}
        />

        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-950">
          <p className="font-semibold">{t("Global access only")}</p>
          <dl className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t("Master Console"),
                detail: t("This page controls only global Master Console access."),
              },
              {
                label: t("Shop admins"),
                detail: t(
                  "Shop owners and managers are personal accounts linked to shops through shop_members.",
                ),
              },
              {
                label: t("Shop code claim"),
                detail: t(
                  "Connecting or claiming a shop code must create shop_owner or shop_manager membership, not platform_admin.",
                ),
              },
              {
                label: t("POS staff"),
                detail: t(
                  "Staff code, manager 1001, and credential access stay in the separate POS/staff model.",
                ),
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs font-semibold uppercase tracking-normal text-amber-800">
                  {item.label}
                </dt>
                <dd className="mt-1 text-amber-950">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        {result ? (
          <section
            aria-live="polite"
            role={result === "success" ? "status" : "alert"}
            className={[
              "rounded-md border p-4 text-sm",
              result === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900",
            ].join(" ")}
          >
            {t(resultMessages[result])}
          </section>
        ) : null}

        {ready ? (
          <section
            aria-label={t("Current Platform Admin account")}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  {t("Current Platform Admin account")}
                </p>
                {readModel.currentProfileId ? (
                  <div className="mt-2">
                    <AccountIdentity
                      identity={accountIdentityForProfile(
                        readModel,
                        readModel.currentProfileId,
                        t("Platform User"),
                      )}
                      locale={locale}
                    />
                  </div>
                ) : (
                  <h2 className="mt-1 break-words text-lg font-semibold text-slate-950">
                    {t("Platform User")}
                  </h2>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                  {t("Current session")}
                </span>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                  {t("Platform Admin (Master Console)")}
                </span>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-500">
                  {t("Profile ID")}
                </dt>
                <dd
                  title={readModel.currentProfileId ?? undefined}
                  className="break-all font-mono text-slate-800"
                >
                  {readModel.currentProfileId
                    ? shortIdentifier(readModel.currentProfileId)
                    : t("Not captured")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">
                  {t("Provider")}
                </dt>
                <dd className="break-words text-slate-800">
                  {accountOrigin(currentAccount)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">
                  {t("Shop access")}
                </dt>
                <dd className="break-words text-slate-800">
                  {shopAdminOverlap(currentAccount)}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {!ready ? (
          <SectionCard
            title={t("Admin operations unavailable")}
            description={t(
              "A valid Platform Admin server session is required before grant or revoke operations can run.",
            )}
          >
            <EmptyState
              title={t(formatToken(readModel.status))}
              description={t(readModel.reason)}
            />
          </SectionCard>
        ) : (
          <div className="grid gap-5">
            <section
              aria-label={t("Platform Admin safeguards")}
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
            >
              {[
                {
                  label: t("Active admins"),
                  value: String(activeAdmins.length),
                  detail: t("Visible active grants"),
                },
                {
                  label: t("Server-side audit boundary"),
                  value: t("Required"),
                  detail: t("Grant/revoke actions use audited RPCs"),
                },
                {
                  label: t("Self-lockout protection"),
                  value: t("Server enforced"),
                  detail: t("Server blocks self-lockout and last-admin removal."),
                },
                {
                  label: t("Metadata/redaction boundary"),
                  value: t("Redacted"),
                  detail: t("No raw sensitive metadata is rendered"),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-slate-200 bg-white p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    {item.detail}
                  </p>
                </div>
              ))}
            </section>

            <div className="grid gap-5">
              <SectionCard
                title={t("Active Platform Admins")}
                description={t(
                  "Global Master Console grants. Server blocks self-lockout and last-admin removal. Revoke controls are collapsed by default.",
                )}
              >
                {activeAdmins.length === 0 ? (
                  <EmptyState
                    title={t("No active grants")}
                    description={t(
                      "No active Platform Admin grants are visible through RLS.",
                    )}
                  />
                ) : (
                  <div className="grid gap-3">
                    {activeAdmins.map((admin) => {
                      const account = accountForProfile(readModel, admin.profile_id);
                      const isCurrentAccount =
                        admin.profile_id === readModel.currentProfileId;

                      return (
                        <article
                          key={admin.platform_admin_id}
                          className="rounded-md border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0" title={admin.profile_id}>
                                <AccountIdentity
                                  identity={accountIdentityForProfile(
                                    readModel,
                                    admin.profile_id,
                                    t("Platform User"),
                                  )}
                                  locale={locale}
                                />
                              </div>
                              <div className="flex flex-wrap gap-2 sm:justify-end">
                                <span className="w-fit rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                  {t(formatToken(admin.status))}
                                </span>
                                <span className="w-fit rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                                  {t("Platform Admin (Master Console)")}
                                </span>
                                {isCurrentAccount ? (
                                  <span className="w-fit rounded-md border border-slate-950 bg-slate-950 px-2 py-1 text-xs font-semibold text-white">
                                    {t("Current account")}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <dt className="font-semibold text-slate-500">
                                  {t("Provider")}
                                </dt>
                                <dd className="break-words text-slate-800">
                                  {accountOrigin(account)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">
                                  {t("Shop access")}
                                </dt>
                                <dd className="break-words text-slate-800">
                                  {shopAdminOverlap(account)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">
                                  {t("Profile ID")}
                                </dt>
                                <dd
                                  title={admin.profile_id}
                                  className="break-all font-mono text-slate-800"
                                >
                                  {shortIdentifier(admin.profile_id)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">
                                  {t("Grant ID")}
                                </dt>
                                <dd
                                  title={admin.platform_admin_id}
                                  className="break-all font-mono text-slate-800"
                                >
                                  {shortIdentifier(admin.platform_admin_id)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-slate-500">
                                  {t("Granted")}
                                </dt>
                                <dd
                                  title={admin.granted_at}
                                  className="whitespace-nowrap text-slate-800"
                                >
                                  {formatDateTime(locale, admin.granted_at)}
                                </dd>
                              </div>
                            </dl>
                          </div>

                          <details className="mt-4 rounded-md border border-rose-100 bg-white">
                            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-rose-700">
                              {t("Show revoke controls")}
                            </summary>
                            <div className="border-t border-rose-100 bg-rose-50 p-3">
                              <p className="text-sm leading-5 text-rose-950">
                                {t(
                                  "Revoke controls are collapsed by default. Server blocks self-lockout and last-admin removal.",
                                )}
                              </p>
                              <form
                                action={revokePlatformAdminAction}
                                className="mt-3 grid gap-3"
                              >
                                <input
                                  type="hidden"
                                  name="profileId"
                                  value={admin.profile_id}
                                />
                                <ReasonInput label={t("Reason")} />
                                <ConfirmationInput label={t("Type REVOKE to confirm")} />
                                <SubmitButton
                                  danger
                                  disabled={activeAdmins.length <= 1}
                                >
                                  {t("Revoke Platform Admin")}
                                </SubmitButton>
                              </form>
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              <details className="rounded-md border border-amber-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-950">
                  {t("Advanced global access")}
                  <span className="mt-1 block text-sm font-normal leading-5 text-slate-600">
                    {t(
                      "Grant controls are collapsed by default because Platform Admin is global Master Console access.",
                    )}
                  </span>
                </summary>
                <div className="border-t border-amber-100 bg-amber-50/60 p-4">
                  <p className="text-sm leading-5 text-amber-950">
                    {t(
                      "Grant Platform Admin is a sensitive global operation. It does not create shop owners, shop managers, shop-code access, or POS staff.",
                    )}
                  </p>
                  <form
                    action={grantPlatformAdminAction}
                    className="mt-4 grid w-full max-w-2xl min-w-0 gap-4 rounded-md border border-amber-200 bg-white p-4"
                  >
                    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-800">
                      <span>{t("Profile")}</span>
                      <select
                        name="profileId"
                        required
                        className="min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                      >
                        <option value="">{t("Select active profile")}</option>
                        {grantableProfiles.map((profile) => {
                          const account = accountForProfile(
                            readModel,
                            profile.profile_id,
                          );

                          return (
                            <option
                              key={profile.profile_id}
                              value={profile.profile_id}
                            >
                              {profileOptionLabel(profile, account)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <ReasonInput label={t("Reason")} />
                    <ConfirmationInput label={t("Type GRANT to confirm")} />
                    <SubmitButton disabled={grantableProfiles.length === 0}>
                      {t("Grant Platform Admin")}
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
