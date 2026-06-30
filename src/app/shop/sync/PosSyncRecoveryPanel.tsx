import { SectionCard } from "@/components/admin/SectionCard";
import { formatDateTime as formatLocalizedDateTime } from "@/i18n/format";
import type { SupportedLocale } from "@/i18n/locales";
import type { ShopPosSyncRecoveryReadModel } from "@/server/shop-admin/pos-sync-recovery-read-model";
import { recordPosSyncRecoveryActionAction } from "@/app/shop/actions";

const recoveryTableClassName =
  "min-w-full divide-y divide-zinc-200 text-left text-sm";
const recoveryThClassName =
  "px-3 py-2 text-xs font-semibold uppercase tracking-normal text-zinc-500";
const recoveryTdClassName =
  "px-3 py-2 align-top text-zinc-800 [overflow-wrap:anywhere]";

function shortId(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

const intlLocaleBySupportedLocale: Record<SupportedLocale, string> = {
  en: "en-US",
  es: "es-CL",
  it: "it-IT",
  "zh-CN": "zh-CN",
};

function intlLocale(locale: SupportedLocale) {
  return intlLocaleBySupportedLocale[locale] ?? intlLocaleBySupportedLocale.en;
}

function formatTimestamp(
  locale: SupportedLocale,
  value: string | null | undefined,
  t: (value: string) => string,
) {
  if (!value) {
    return t("n/a");
  }

  return formatLocalizedDateTime(locale, value);
}

function formatClp(locale: SupportedLocale, value: number) {
  return new Intl.NumberFormat(intlLocale(locale), {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function statusCountText(counts: Record<string, number>, t: (value: string) => string) {
  const entries = Object.entries(counts);

  return entries.length > 0
    ? entries.map(([status, count]) => `${status}: ${count}`).join(" | ")
    : t("n/a");
}

function recoveryTargetOptions(
  model: ShopPosSyncRecoveryReadModel,
  t: (value: string) => string,
) {
  const options: Array<{ label: string; value: string }> = [];

  if (!model.selectedShop) {
    return options;
  }

  options.push({
    label: `${t("Shop")} ${model.selectedShop.shopCode} - ${t("general note")}`,
    value: `pos_shop|${model.selectedShop.shopId}`,
  });

  if (model.latestBatch) {
    options.push({
      label: `${t("Batch")} ${shortId(model.latestBatch.clientBatchId)} (${model.latestBatch.status})`,
      value: `pos_sales_sync_batch|${model.latestBatch.salesSyncBatchId}`,
    });
  }

  for (const sale of model.issueSales.slice(0, 20)) {
    options.push({
      label: `${t("Sale")} ${sale.saleNumber ?? shortId(sale.clientSaleId)} (${sale.status})`,
      value: `pos_sale|${sale.posSaleId}`,
    });
  }

  for (const warning of model.stockWarnings.slice(0, 20)) {
    options.push({
      label: `${t("Stock")} ${shortId(warning.movementKey)} (${warning.status})`,
      value: `pos_sale_stock_movement|${warning.posSaleStockMovementId}`,
    });
  }

  return options;
}

function recoveryContextText(model: ShopPosSyncRecoveryReadModel) {
  const lines = [
    "POS Sync Recovery context",
    `shop=${model.selectedShop?.shopCode ?? "n/a"}`,
    `latestBatch=${model.latestBatch?.clientBatchId ?? "n/a"}`,
    `latestBatchStatus=${model.latestBatch?.status ?? "n/a"}`,
    `issueSales=${model.issueSales.length}`,
    `stockWarnings=${model.stockWarnings.length}`,
    `recentFailures=${model.recentFailures.length}`,
    `recoveryActions=${model.recoveryActions.length}`,
    "recoveryActionsPolicy=audit-only; no sales/stock/outbox mutation",
  ];

  for (const sale of model.issueSales.slice(0, 5)) {
    lines.push(
      `sale ${sale.saleNumber ?? shortId(sale.clientSaleId)} status=${sale.status} stock=${sale.stockStatus}`,
    );
  }

  for (const warning of model.stockWarnings.slice(0, 5)) {
    lines.push(
      `stock ${shortId(warning.movementKey)} status=${warning.status} issue=${warning.issueCode ?? "n/a"}`,
    );
  }

  for (const failure of model.recentFailures.slice(0, 3)) {
    lines.push(
      `auditFailure ${shortId(failure.auditLogId)} event=${failure.eventKey} metadata=${failure.metadataPreview}`,
    );
  }

  for (const action of model.recoveryActions.slice(0, 3)) {
    lines.push(
      `recoveryAction ${shortId(action.auditLogId)} action=${action.actionType} metadata=${action.metadataPreview}`,
    );
  }

  return lines.join("\n");
}

export function PosSyncRecoveryPanel({
  labels = {},
  locale,
  model,
}: {
  labels?: Record<string, string>;
  locale: SupportedLocale;
  model: ShopPosSyncRecoveryReadModel;
}) {
  const t = (value: string) => labels[value] ?? value;
  const selectedShopId = model.selectedShop?.shopId;
  const posHref = selectedShopId
    ? `/shop/pos?${new URLSearchParams({ shop_id: selectedShopId }).toString()}`
    : "/shop/pos";
  const hasIssues =
    model.issueSales.length > 0 ||
    model.recentFailures.length > 0 ||
    model.stockWarnings.length > 0;
  const actionTargets = recoveryTargetOptions(model, t);

  return (
    <SectionCard
      actions={
        <a
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800"
          href={posHref}
        >
          {t("View details")}
        </a>
      }
      description={t(
        "Server shop-scoped view for POS batches, conflicts, stock warnings, audit failures, and append-only recovery actions.",
      )}
      title={t("POS Sync Recovery")}
      titleId="pos-sync-recovery-title"
    >
      {model.status !== "ready" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
          {t("Recovery unavailable")}: {model.error?.message ?? model.reason}
        </div>
      ) : (
        <div className="grid gap-5">
          <dl className="grid gap-0 overflow-hidden rounded-md border border-zinc-200 md:grid-cols-4">
            <div className="border-b border-zinc-200 px-3 py-2 md:border-b-0 md:border-r">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {t("Latest batch")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.latestBatch
                  ? shortId(model.latestBatch.clientBatchId)
                  : t("No batch")}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {model.latestBatch
                  ? formatTimestamp(locale, model.latestBatch.receivedAt, t)
                  : t("Server has no POS batch")}
              </dd>
            </div>
            <div className="border-b border-zinc-200 px-3 py-2 md:border-b-0 md:border-r">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {t("Batch status")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.latestBatch?.status ?? t("n/a")}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {statusCountText(model.batchStatusCounts, t)}
              </dd>
            </div>
            <div className="border-b border-zinc-200 px-3 py-2 md:border-b-0 md:border-r">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {t("Batch sales")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.latestBatch
                  ? `${model.latestBatch.saleCount} ${t("sales")} / ${model.latestBatch.lineCount} ${t("lines")}`
                  : t("n/a")}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {model.latestBatch
                  ? `${t("accepted")} ${model.latestBatch.acceptedSaleCount}, ${t("duplicate")} ${model.latestBatch.duplicateSaleCount}, ${t("conflict")} ${model.latestBatch.conflictCount}`
                  : t("No server ack")}
              </dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {t("To verify")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-zinc-950">
                {model.issueSales.length +
                  model.stockWarnings.length +
                  model.recentFailures.length}
              </dd>
              <dd className="text-xs leading-5 text-zinc-500">
                {hasIssues
                  ? t("Server-side rows need review")
                  : t("No recent server-side anomaly")}
              </dd>
            </div>
          </dl>

          {!hasIssues ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-950">
              {t(
                "No server-side sale in conflict, failed, or needs-attention state, and no recent stock warning for this shop.",
              )}
            </div>
          ) : null}

          <div className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-950">
                {t("Safe recovery actions")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                {t(
                  "Actions below write append-only audit entries only. They do not delete outbox records, modify sales, move stock, or force server ack.",
                )}
              </p>
            </div>
            <form
              action={recordPosSyncRecoveryActionAction}
              className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)]"
            >
              {selectedShopId ? (
                <input name="shop_id" type="hidden" value={selectedShopId} />
              ) : null}
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                {t("Target recovery")}
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
                  name="targetRef"
                  required
                >
                  {actionTargets.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                {t("Action")}
                <select
                  className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
                  name="actionType"
                  required
                >
                  <option value="mark_reviewed">{t("Mark as reviewed")}</option>
                  <option value="add_note">{t("Add internal note")}</option>
                  <option value="request_pos_retry">
                    {t("Request POS retry (audit only)")}
                  </option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-800 lg:col-span-2">
                {t("Redacted internal note")}
                <textarea
                  className="min-h-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950"
                  maxLength={600}
                  name="note"
                  placeholder={t(
                    "Operational context for manager/support. Do not enter tokens, PINs, or passwords.",
                  )}
                />
              </label>
              <div className="flex flex-wrap gap-2 lg:col-span-2">
                <button className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
                  {t("Record recovery action")}
                </button>
              </div>
            </form>
            <details className="rounded-md border border-zinc-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-800">
                {t("Copy/export technical context")}
              </summary>
              <textarea
                className="mt-3 min-h-32 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700"
                readOnly
                value={recoveryContextText(model)}
              />
            </details>
          </div>

          <div className="grid gap-4">
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">
                  {t("POS sales requiring review")}
                </caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>{t("Sale")}</th>
                    <th className={recoveryThClassName}>{t("Status")}</th>
                    <th className={recoveryThClassName}>{t("Stock")}</th>
                    <th className={recoveryThClassName}>{t("Total")}</th>
                    <th className={recoveryThClassName}>{t("Device / staff")}</th>
                    <th className={recoveryThClassName}>{t("Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.issueSales.length > 0 ? (
                    model.issueSales.map((sale) => (
                      <tr key={sale.posSaleId}>
                        <td className={recoveryTdClassName}>
                          <div className="font-medium text-zinc-950">
                            {sale.saleNumber ?? shortId(sale.clientSaleId)}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {shortId(sale.clientSaleId)} | {sale.saleKind}
                          </div>
                        </td>
                        <td className={recoveryTdClassName}>{sale.status}</td>
                        <td className={recoveryTdClassName}>
                          {sale.stockStatus} ({sale.stockWarningCount})
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatClp(locale, sale.netAmountClp)}
                        </td>
                        <td className={recoveryTdClassName}>
                          <div>{sale.device}</div>
                          <div className="text-xs text-zinc-500">{sale.staff}</div>
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(locale, sale.occurredAt, t)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={6}>
                        {t("No server-side sale with anomalous status.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">{t("Stock warnings POS")}</caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>{t("Movement")}</th>
                    <th className={recoveryThClassName}>{t("Status")}</th>
                    <th className={recoveryThClassName}>{t("Issue")}</th>
                    <th className={recoveryThClassName}>{t("Quantity")}</th>
                    <th className={recoveryThClassName}>{t("Stock")}</th>
                    <th className={recoveryThClassName}>{t("Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.stockWarnings.length > 0 ? (
                    model.stockWarnings.map((warning) => (
                      <tr key={warning.movementKey}>
                        <td className={recoveryTdClassName}>
                          <div className="font-medium text-zinc-950">
                            {warning.movementKind}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {t("Sale")} {shortId(warning.posSaleId)}
                          </div>
                        </td>
                        <td className={recoveryTdClassName}>{warning.status}</td>
                        <td className={recoveryTdClassName}>
                          {warning.issueCode ?? t("n/a")}
                        </td>
                        <td className={recoveryTdClassName}>
                          {warning.quantityDelta}
                        </td>
                        <td className={recoveryTdClassName}>
                          {warning.stockBefore ?? t("n/a")} - {warning.stockAfter ?? t("n/a")}
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(locale, warning.createdAt, t)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={6}>
                        {t("No recent unresolved_product, stock_conflict, or failed warning.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">{t("Recent POS audit failures")}</caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>{t("Event")}</th>
                    <th className={recoveryThClassName}>{t("Result")}</th>
                    <th className={recoveryThClassName}>{t("Target")}</th>
                    <th className={recoveryThClassName}>{t("Redacted metadata")}</th>
                    <th className={recoveryThClassName}>{t("Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.recentFailures.length > 0 ? (
                    model.recentFailures.map((event) => (
                      <tr key={event.auditLogId}>
                        <td className={recoveryTdClassName}>{event.eventKey}</td>
                        <td className={recoveryTdClassName}>
                          {event.result} / {event.severity}
                        </td>
                        <td className={recoveryTdClassName}>
                          {event.targetType ?? t("n/a")} {shortId(event.targetId)}
                        </td>
                        <td className={recoveryTdClassName}>
                          <code className="text-xs">{event.metadataPreview}</code>
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(locale, event.createdAt, t)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={5}>
                        {t("No recent POS sales sync audit failure.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <table className={recoveryTableClassName}>
                <caption className="sr-only">
                  {t("Recorded POS recovery actions")}
                </caption>
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={recoveryThClassName}>{t("Action")}</th>
                    <th className={recoveryThClassName}>{t("Target")}</th>
                    <th className={recoveryThClassName}>{t("Redacted metadata")}</th>
                    <th className={recoveryThClassName}>{t("Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {model.recoveryActions.length > 0 ? (
                    model.recoveryActions.map((action) => (
                      <tr key={action.auditLogId}>
                        <td className={recoveryTdClassName}>
                          <div className="font-medium text-zinc-950">
                            {action.actionType}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {action.result} / {action.severity}
                          </div>
                        </td>
                        <td className={recoveryTdClassName}>
                          {action.targetType ?? t("n/a")} {shortId(action.targetId)}
                        </td>
                        <td className={recoveryTdClassName}>
                          <code className="text-xs">{action.metadataPreview}</code>
                        </td>
                        <td className={recoveryTdClassName}>
                          {formatTimestamp(locale, action.createdAt, t)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={recoveryTdClassName} colSpan={4}>
                        {t("No recovery action recorded for this shop.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
            <p className="font-semibold text-zinc-700">
              {t("Information unavailable server-side")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {model.unavailableNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
