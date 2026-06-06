import type { Metadata } from "next";
import { AppShell } from "@/components/platform/AppShell";
import { ControlledOperationsWorkflow } from "@/components/platform/operations/ControlledOperationsWorkflow";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";

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
  | "suspend"
  | "reactivate"
  | "restore"
  | "soft_delete"
  | "device_revoke";

type OperationResultCode =
  | "success"
  | "unauthorized"
  | "not_configured"
  | "validation_failed"
  | "invalid_state"
  | "shop_not_found"
  | "device_not_found"
  | "conflict"
  | "db_failure";

const resultMessages: Record<OperationResultCode, string> = {
  success: "Operation completed.",
  unauthorized: "You are not authorized to perform this operation.",
  not_configured: "Platform Admin runtime is not configured.",
  validation_failed: "Check the required fields and try again.",
  invalid_state: "This operation is not available for the current shop state.",
  shop_not_found: "The selected shop could not be found.",
  device_not_found: "The selected device could not be found.",
  conflict: "The operation could not be completed because of a conflict.",
  db_failure:
    "The controlled database action failed. Retry or review system health.",
};

const operationLabels: Record<OperationKey, string> = {
  suspend: "Suspend shop",
  reactivate: "Reactivate shop",
  restore: "Restore shop",
  soft_delete: "Archive shop",
  device_revoke: "Emergency revoke device",
};

const operationsWarning =
  "Every operation is checked on the server and written to the audit log. Use development-safe test shops only. Do not use customer data for testing.";

const formatToken = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asOperationKey(value: string | undefined): OperationKey | null {
  return value === "suspend" ||
    value === "reactivate" ||
    value === "restore" ||
    value === "soft_delete" ||
    value === "device_revoke"
    ? value
    : null;
}

function asResultCode(value: string | undefined): OperationResultCode | null {
  return value && value in resultMessages ? (value as OperationResultCode) : null;
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

  return (
    <AppShell activeSection="operations">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <PageHeader
          eyebrow="Controlled actions"
          title="Controlled Operations"
          description="Use this page only for audited lifecycle and emergency operations. Daily shop management belongs to Admin Console."
          status={ready ? "Live actions" : formatToken(readModel.status)}
        />

        {operation && result ? (
          <ActionResultBanner operation={operation} result={result} />
        ) : null}

        <section
          aria-live="polite"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {operationsWarning}
        </section>

        {!ready ? (
          <SectionCard
            title="Operations unavailable"
            description="A valid Platform Admin server session is required before controlled actions can run."
          >
            <EmptyState title={formatToken(readModel.status)} description={readModel.reason} />
          </SectionCard>
        ) : (
          <ControlledOperationsWorkflow
            auditLogs={readModel.auditLogs}
            devices={readModel.shopDevices.slice(0, 100)}
            members={readModel.shopMembers}
            profiles={readModel.profiles}
            shops={readModel.shops.slice(0, 100)}
          />
        )}
      </div>
    </AppShell>
  );
}
