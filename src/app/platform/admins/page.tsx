import type { Metadata } from "next";
import { AppShell } from "@/components/platform/AppShell";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import type { Profile } from "@/domain/platform-admin/types";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import {
  grantPlatformAdminAction,
  revokePlatformAdminAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Platform Admins | MerchandiseControl Admin Web",
  description: "Platform Admin grant and revoke operations.",
};

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

function formatToken(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function profileNameById(profiles: readonly Profile[], profileId: string) {
  return (
    profiles.find((profile) => profile.profile_id === profileId)?.display_name ??
    "Platform User"
  );
}

function ReasonInput() {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>Reason</span>
      <textarea
        name="reason"
        required
        rows={3}
        className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
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
    <label className="grid gap-1.5 text-sm font-medium text-slate-800">
      <span>{label}</span>
      <input
        name={name}
        required
        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
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

export default async function PlatformAdminsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const result = asResultCode(firstParam(params.result));
  const readModel = await getPlatformAdminReadModel();
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

  return (
    <AppShell activeSection="admins">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <PageHeader
          eyebrow="Global security"
          title="Platform Admins"
          description="Grant and revoke Platform Admin access through server-side RPCs with anti self-lockout and audit."
          status={ready ? "Live actions" : formatToken(readModel.status)}
        />

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
            {resultMessages[result]}
          </section>
        ) : null}

        {!ready ? (
          <SectionCard
            title="Admin operations unavailable"
            description="A valid Platform Admin server session is required before grant or revoke operations can run."
          >
            <EmptyState title={formatToken(readModel.status)} description={readModel.reason} />
          </SectionCard>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <SectionCard
              title="Grant Platform Admin"
              description="Select an active profile, provide a reason, and type GRANT to confirm."
            >
              <form action={grantPlatformAdminAction} className="grid gap-4">
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
                <ConfirmationInput label="Type GRANT to confirm" />
                <SubmitButton disabled={grantableProfiles.length === 0}>
                  Grant admin
                </SubmitButton>
              </form>
            </SectionCard>

            <SectionCard
              title="Active Platform Admins"
              description="Revocation requires a reason and REVOKE confirmation. The server blocks self-lockout and last-admin removal."
            >
              {activeAdmins.length === 0 ? (
                <EmptyState
                  title="No active grants"
                  description="No active Platform Admin grants are visible through RLS."
                />
              ) : (
                <div className="grid gap-3">
                  {activeAdmins.map((admin) => (
                    <article
                      key={admin.platform_admin_id}
                      className="rounded-md border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div>
                          <h3 className="text-base font-semibold text-slate-950">
                            {profileNameById(readModel.profiles, admin.profile_id)}
                          </h3>
                          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                            <div>
                              <dt className="font-semibold text-slate-500">Status</dt>
                              <dd>{formatToken(admin.status)}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-slate-500">Granted</dt>
                              <dd>{admin.granted_at}</dd>
                            </div>
                          </dl>
                        </div>
                        <form action={revokePlatformAdminAction} className="grid gap-2">
                          <input type="hidden" name="profileId" value={admin.profile_id} />
                          <ReasonInput />
                          <ConfirmationInput label="Type REVOKE to confirm" />
                          <SubmitButton danger disabled={activeAdmins.length <= 1}>
                            Revoke admin
                          </SubmitButton>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
