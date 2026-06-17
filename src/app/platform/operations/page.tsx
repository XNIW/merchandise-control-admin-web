import { AppShell } from "@/components/platform/AppShell";
import {
  ControlledOperationsWorkflow,
  type ControlledOperationsWorkflowLabels,
} from "@/components/platform/operations/ControlledOperationsWorkflow";
import { EmptyState } from "@/components/platform/components/EmptyState";
import { PageHeader } from "@/components/platform/components/PageHeader";
import { SectionCard } from "@/components/platform/components/SectionCard";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { getPlatformAdminReadModel } from "@/server/platform-admin/read-model";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Controlled Operations");
}

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
  labels,
  operation,
  result,
}: {
  labels: {
    operationLabels: Record<OperationKey, string>;
    resultMessages: Record<OperationResultCode, string>;
  };
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
      <p className="font-semibold">{labels.operationLabels[operation]}</p>
      <p className="mt-1">{labels.resultMessages[result]}</p>
    </section>
  );
}

function operationPageLabels(t: (value: string) => string) {
  return {
    operationLabels: {
      device_revoke: t("Emergency revoke device"),
      reactivate: t("Reactivate shop"),
      restore: t("Restore shop"),
      soft_delete: t("Archive shop"),
      suspend: t("Suspend shop"),
    } satisfies Record<OperationKey, string>,
    resultMessages: {
      conflict: t("The operation could not be completed because of a conflict."),
      db_failure: t(
        "The controlled database action failed. Retry or review system health.",
      ),
      device_not_found: t("The selected device could not be found."),
      invalid_state: t(
        "This operation is not available for the current shop state.",
      ),
      not_configured: t("Platform Admin runtime is not configured."),
      shop_not_found: t("The selected shop could not be found."),
      success: t("Operation completed."),
      unauthorized: t("You are not authorized to perform this operation."),
      validation_failed: t("Check the required fields and try again."),
    } satisfies Record<OperationResultCode, string>,
    workflow: {
      actionLabels: {
        archive: t("Archive shop"),
        device_revoke: t("Emergency revoke device"),
        reactivate: t("Reactivate shop"),
        restore: t("Restore shop"),
        suspend: t("Suspend shop"),
      },
      alreadyArchived: t("Already archived"),
      alreadyRevoked: t("Already revoked"),
      archiveRequiresReason: t("Requires reason and shop code confirmation."),
      chooseAction: t("Choose action"),
      chooseActionDescription: t(
        "Operations are dangerous, audited, and not daily shop management. Daily shop management belongs to Admin Console. Device emergency operations are global exceptions. Daily device management belongs to Admin Console.",
      ),
      chooseTargetShop: t("Choose target shop"),
      controlledOperationsWorkflow: t("Controlled operations workflow"),
      device: t("Device"),
      noAuditRows: t("No audit rows visible for this shop."),
      noDeviceSelected: t("No device selected"),
      noShopsMatch: t("No shops match this search."),
      noShopsVisible: t("No shops visible"),
      operationsNeedVisibleShop: t(
        "Operations need a visible shop from the server read model.",
      ),
      owner: t("Owner"),
      pickShopBeforeAction: t(
        "Pick one shop before selecting the audited action.",
      ),
      platformUser: t("Platform User"),
      readModelUnavailable: t("Read model unavailable"),
      readModelUnavailableOrNoShops: t(
        "Read model unavailable or no shops are visible for this Platform Admin session.",
      ),
      reason: t("Reason"),
      recentAuditForSelectedShop: t("Recent audit for selected shop"),
      requiresActiveShop: t("Requires active shop"),
      requiresArchivedShop: t("Requires archived shop"),
      requiresReasonAndShopCode: t(
        "Requires reason and shop code confirmation.",
      ),
      requiresSelectedDeviceReasonAndShopCode: t(
        "Requires selected device, reason, and shop code confirmation.",
      ),
      requiresSuspendedShop: t("Requires suspended shop"),
      searchPlaceholder: t("Name, code, or status"),
      searchTargetShops: t("Search target shops"),
      selectedTarget: t("Selected target"),
      shopStatus: {
        active: t("Active"),
        archived: t("Archived"),
        pending_setup: t("Pending setup"),
        suspended: t("Suspended"),
      },
      system: t("System"),
      typeShopCodeToConfirm: t("Type shop code to confirm"),
      unassigned: t("Unassigned"),
    } satisfies ControlledOperationsWorkflowLabels,
  };
}

export default async function PlatformOperationsPage({
  searchParams,
}: {
  searchParams?: PlatformOperationsSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const { dictionary } = await getI18n();
  const t = (value: string) => translateText(dictionary, value);
  const labels = operationPageLabels(t);
  const operation = asOperationKey(firstParam(params.operation));
  const result = asResultCode(firstParam(params.result));
  const readModel = await getPlatformAdminReadModel();
  const ready = readModel.status === "ready";

  return (
    <AppShell activeSection="operations">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <PageHeader
          eyebrow={t("Controlled actions")}
          title={t("Controlled Operations")}
          description={t(
            "Use this page only for audited lifecycle and emergency operations. Daily shop management belongs to Admin Console.",
          )}
          status={ready ? t("Live actions") : t(formatToken(readModel.status))}
        />

        {operation && result ? (
          <ActionResultBanner
            labels={labels}
            operation={operation}
            result={result}
          />
        ) : null}

        <section
          aria-live="polite"
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {t(operationsWarning)}
        </section>

        {!ready ? (
          <SectionCard
            title={t("Operations unavailable")}
            description={t(
              "A valid Platform Admin server session is required before controlled actions can run.",
            )}
          >
            <EmptyState
              title={t(formatToken(readModel.status))}
              description={t(readModel.reason)}
            />
          </SectionCard>
        ) : (
          <ControlledOperationsWorkflow
            auditLogs={readModel.auditLogs}
            devices={readModel.shopDevices.slice(0, 100)}
            labels={labels.workflow}
            members={readModel.shopMembers}
            profiles={readModel.profiles}
            shops={readModel.shops.slice(0, 100)}
          />
        )}
      </div>
    </AppShell>
  );
}
