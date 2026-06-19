import { createHistoryEntryAction } from "@/app/shop/actions";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopHistoryReadModel } from "@/server/shop-admin/history-read-model";
import { buildHistorySection } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

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
  requestedShopId,
  row,
}: {
  requestedShopId?: string;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey?.startsWith("session:") && !row.rowKey?.startsWith("sync:")) {
    return null;
  }

  return (
    <a
      className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
      href={buildHistoryDetailHref(row.rowKey, requestedShopId)}
    >
      Detail
    </a>
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
  const [readModel, writeContext] = await Promise.all([
    getShopHistoryReadModel({ requestedShopId }),
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
      {canWriteHistory ? (
        <HistoryEntryCreateForm requestedShopId={requestedShopId} />
      ) : null}
      <ShopSectionPage
        section={section}
        rowActions={{
          label: "Detail",
          render: (row) => (
            <HistoryRowActions requestedShopId={requestedShopId} row={row} />
          ),
        }}
        secondaryRowActions={{
          label: "Detail",
          renderForTable: (table) => table.title === "Related history sync events",
          render: (row) => (
            <HistoryRowActions requestedShopId={requestedShopId} row={row} />
          ),
        }}
      />
    </div>
  );
}
