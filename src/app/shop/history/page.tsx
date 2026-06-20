import { createHistoryEntryAction } from "@/app/shop/actions";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { HistoryDetailModalController } from "@/app/shop/_components/HistoryDetailModalController";
import { ProductDetailModalController } from "@/app/shop/_components/ProductDetailModalController";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import type { ShopSection } from "@/components/shop/shopSections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopHistoryListReadModel } from "@/server/shop-admin/history-read-model";
import { buildHistorySection } from "@/server/shop-admin/shop-section-data";
import { getI18n } from "@/i18n/get-locale";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { translateText } from "@/i18n/translate-sections";
import type { ReactNode } from "react";

export function generateMetadata() {
  return createLocalizedPageMetadata("Mobile History");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function buildHistoryDetailHref(entryId: string, requestedShopId?: string) {
  const query = requestedShopId
    ? `?${new URLSearchParams({ shop_id: requestedShopId }).toString()}`
    : "";

  return `/shop/history/${encodeURIComponent(entryId)}${query}`;
}

function HistoryRowActions({
  label,
  requestedShopId,
  row,
}: {
  label: string;
  requestedShopId?: string;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey?.startsWith("session:") && !row.rowKey?.startsWith("sync:")) {
    return null;
  }

  return (
    <a
      className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
      data-history-detail-id={row.rowKey}
      data-history-detail-trigger
      href={buildHistoryDetailHref(row.rowKey, requestedShopId)}
    >
      {label}
    </a>
  );
}

function rowString(row: AdminDataTableRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

function translateLabel(labels: Record<string, string> | undefined, value: string) {
  return labels?.[value] ?? value;
}

function splitSupplierCategory(
  value: string,
  labels?: Record<string, string>,
) {
  const [supplier, ...categoryParts] = value.split(" / ");
  const category = categoryParts.join(" / ");

  return {
    category: category || translateLabel(labels, "Category not set"),
    supplier: supplier || translateLabel(labels, "Supplier not set"),
  };
}

function HistoryStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const isIssue =
    normalized.includes("issue") ||
    normalized.includes("deleted") ||
    normalized.includes("legacy");

  return (
    <span
      className={[
        "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
        isIssue
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      ].join(" ")}
    >
      {status || "Active"}
    </span>
  );
}

function HistoryEntriesList({
  labels,
  liveData,
  rowActions,
}: {
  labels?: Record<string, string>;
  liveData: NonNullable<ShopSection["liveData"]>;
  rowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
  };
}) {
  if (liveData.rows.length === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">{liveData.emptyState.title}</p>
        <p className="mt-1 leading-6">{liveData.emptyState.description}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-history-entries-list role="list">
      {liveData.rows.map((row) => {
        const entryName = rowString(row, "entryName") || rowString(row, "event");
        const supplierCategory = splitSupplierCategory(
          rowString(row, "supplierCategory"),
          labels,
        );
        const status =
          rowString(row, "status") ||
          rowString(row, "state") ||
          "Active";
        const updated = rowString(row, "updated") || translateLabel(labels, "Not set");
        const rows = rowString(row, "rows");
        const missing =
          rowString(row, "missing") ||
          rowString(row, "missingRows");
        const syncState =
          rowString(row, "sync") ||
          rowString(row, "overlay") ||
          rowString(row, "payload");
        const detailFacts = [
          rows ? `${translateLabel(labels, "Rows")}: ${rows}` : null,
          missing ? `${translateLabel(labels, "Missing")}: ${missing}` : null,
          syncState ? `${translateLabel(labels, "Sync")}: ${syncState}` : null,
        ].filter((item): item is string => Boolean(item));

        return (
          <article
            className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-white p-3 shadow-sm [contain-intrinsic-size:150px] [content-visibility:auto] xl:grid-cols-[minmax(16rem,1.6fr)_minmax(12rem,1fr)_minmax(14rem,1fr)_minmax(9rem,auto)] xl:items-center"
            data-history-entry-row
            key={row.rowKey}
            role="listitem"
          >
            <section className="min-w-0">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p
                    className="line-clamp-2 break-words text-base font-semibold leading-6 text-zinc-950 [overflow-wrap:anywhere]"
                    title={entryName}
                  >
                    {entryName || translateLabel(labels, "History entry")}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-normal text-zinc-500">
                    {rowString(row, "type") || translateLabel(labels, "Mobile history entry")}
                  </p>
                </div>
                <HistoryStatusBadge status={status} />
              </div>
            </section>

            <section className="min-w-0">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {translateLabel(labels, "Supplier / Category")}
              </h3>
              <p
                className="line-clamp-2 break-words text-sm font-medium text-zinc-950 [overflow-wrap:anywhere]"
                title={supplierCategory.supplier}
              >
                {supplierCategory.supplier}
              </p>
              <p
                className="mt-1 line-clamp-2 break-words text-sm text-zinc-600 [overflow-wrap:anywhere]"
                title={supplierCategory.category}
              >
                {supplierCategory.category}
              </p>
            </section>

            <section className="min-w-0">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {translateLabel(labels, "Detail contents")}
              </h3>
              <p className="line-clamp-2 text-sm text-zinc-700 [overflow-wrap:anywhere]">
                {detailFacts.length > 0
                  ? detailFacts.join(" · ")
                  : translateLabel(labels, "Details load when opened.")}
              </p>
            </section>

            <section className="min-w-0">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
                {translateLabel(labels, "Updated / Actions")}
              </h3>
              <p className="mb-3 break-words text-sm text-zinc-700 [overflow-wrap:anywhere]">
                {updated}
              </p>
              {rowActions ? rowActions.render(row) : null}
            </section>
          </article>
        );
      })}
    </div>
  );
}

function HistoryEntryCreateForm({
  requestedShopId,
}: {
  requestedShopId?: string;
}) {
  return (
    <form
      action={createHistoryEntryAction}
      aria-label="Create mobile history entry"
      className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm`}
    >
      {requestedShopId ? (
        <input name="shop_id" type="hidden" value={requestedShopId} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          Entry name
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="displayName"
            required
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          Supplier
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="supplier"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          Category
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="category"
          />
        </label>
      </div>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
        Rows
        <textarea
          className="min-h-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
          name="rowsText"
          required
        />
      </label>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
          <input
            className="size-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
            name="completeRows"
            type="checkbox"
          />
          Complete rows
        </label>
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
          Create History Entry
        </button>
      </div>
    </form>
  );
}

export default async function ShopHistoryPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const [{ dictionary }, readModel, writeContext] = await Promise.all([
    getI18n(),
    getShopHistoryListReadModel({ requestedShopId }),
    resolveShopActionContext(requestedShopId, "history.write"),
  ]);
  const section = buildHistorySection(readModel);
  const canWriteHistory =
    writeContext.status === "ready" && readModel.status === "ready";

  return (
    <div className="grid gap-5">
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <HistoryDetailModalController
        labels={dictionary.exact}
        requestedShopId={requestedShopId}
      />
      <ProductDetailModalController
        canManageProducts={false}
        labels={dictionary.exact}
        requestedShopId={requestedShopId}
        selectedShopId={readModel.selectedShop?.shopId ?? requestedShopId}
      />
      {canWriteHistory ? (
        <HistoryEntryCreateForm requestedShopId={requestedShopId} />
      ) : null}
      <ShopSectionPage
        renderLiveData={({ liveData, rowActions }) => (
          <HistoryEntriesList
            labels={dictionary.exact}
            liveData={liveData}
            rowActions={rowActions}
          />
        )}
        section={section}
        rowActions={{
          label: translateText(dictionary, "Detail"),
          render: (row) => (
            <HistoryRowActions
              label={translateText(dictionary, "Detail")}
              requestedShopId={requestedShopId}
              row={row}
            />
          ),
        }}
      />
    </div>
  );
}
