import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  tombstoneHistoryEntryAction,
  updateHistoryEntryAction,
} from "@/app/shop/actions";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopHistoryDetailReadModel } from "@/server/shop-admin/history-read-model";
import { getShopHistoryDetailSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { getI18n } from "@/i18n/get-locale";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import { translateText } from "@/i18n/translate-sections";

export function generateMetadata() {
  return createLocalizedPageMetadata("History Detail");
}

export const dynamic = "force-dynamic";

type ShopHistoryDetailPageParams = Promise<{
  entryId: string;
}>;

type ShopHistoryDetailPageSearchParams = Promise<{
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

function detailFieldValue(
  detail: NonNullable<
    Awaited<ReturnType<typeof getShopHistoryDetailReadModel>>["detail"]
  >,
  key: string,
) {
  const value = detail.fields.find((field) => field.key === key)?.value ?? "";

  return value === "Not set" ? "" : value;
}

function HistoryEntryDetailForms({
  detail,
  labels,
  requestedShopId,
}: {
  detail: NonNullable<
    Awaited<ReturnType<typeof getShopHistoryDetailReadModel>>["detail"]
  >;
  labels: {
    category: string;
    completeRows: string;
    entryName: string;
    leaveRowsEmpty: string;
    reason: string;
    rowsOptional: string;
    supplier: string;
    tombstoneAria: string;
    tombstoneButton: string;
    tombstoneConfirmation: string;
    updateAria: string;
    updateButton: string;
  };
  requestedShopId?: string;
}) {
  if (detail.kind !== "shared_sheet_session" || !detail.sessionAnalysis) {
    return null;
  }

  const remoteId = detail.sessionAnalysis.remoteId;
  const isActive = detail.sessionAnalysis.state === "active";

  if (!isActive) {
    return null;
  }

  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]`}>
      <form
        action={updateHistoryEntryAction}
        aria-label={labels.updateAria}
        className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <input name="remoteId" type="hidden" value={remoteId} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            {labels.entryName}
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={detailFieldValue(detail, "display")}
              name="displayName"
              required
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            {labels.supplier}
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={detailFieldValue(detail, "supplier")}
              name="supplier"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
            {labels.category}
            <input
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
              defaultValue={detailFieldValue(detail, "category")}
              name="category"
            />
          </label>
        </div>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          {labels.rowsOptional}
          <textarea
            className="min-h-32 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="rowsText"
            placeholder={labels.leaveRowsEmpty}
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
            <input
              className="size-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
              name="completeRows"
              type="checkbox"
            />
            {labels.completeRows}
          </label>
          <button className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
            {labels.updateButton}
          </button>
        </div>
      </form>

      <form
        action={tombstoneHistoryEntryAction}
        aria-label={labels.tombstoneAria}
        className="grid content-start gap-4 rounded-md border border-amber-200 bg-amber-50 p-4 shadow-sm"
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <input name="remoteId" type="hidden" value={remoteId} />
        <label className="grid min-w-0 gap-1 text-sm font-medium text-amber-950">
          {labels.reason}
          <input
            className="h-10 rounded-md border border-amber-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-amber-600 focus:outline-none"
            name="reason"
            required
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-amber-950">
          {labels.tombstoneConfirmation}
          <input
            className="h-10 rounded-md border border-amber-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-amber-600 focus:outline-none"
            name="confirmation"
            placeholder="TOMBSTONE"
            required
          />
        </label>
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-amber-900 px-4 text-sm font-medium text-white">
          {labels.tombstoneButton}
        </button>
      </form>
    </div>
  );
}

export default async function ShopHistoryDetailPage({
  params,
  searchParams,
}: {
  params: ShopHistoryDetailPageParams;
  searchParams: ShopHistoryDetailPageSearchParams;
}) {
  const routeParams = await params;
  const query = await searchParams;
  const { dictionary } = await getI18n();
  const t = (text: string) => translateText(dictionary, text);
  const requestedShopId = getParam(query, "shop_id");
  const [section, readModel, writeContext] = await Promise.all([
    getShopHistoryDetailSectionForRequest(routeParams.entryId, requestedShopId),
    getShopHistoryDetailReadModel(routeParams.entryId, {
      requestedShopId,
    }),
    resolveShopActionContext(requestedShopId, "history.write"),
  ]);
  const canWriteHistory = writeContext.status === "ready";

  return (
    <div className="grid gap-5">
      <ActionResultBanner
        action={getParam(query, "action")}
        result={getParam(query, "result")}
      />
      {canWriteHistory && readModel.detail ? (
        <HistoryEntryDetailForms
          detail={readModel.detail}
          labels={{
            category: t("Category"),
            completeRows: t("Complete rows"),
            entryName: t("Entry name"),
            leaveRowsEmpty: t("Leave empty to keep current rows"),
            reason: t("Reason"),
            rowsOptional: t("Rows (optional on update)"),
            supplier: t("Supplier"),
            tombstoneAria: t("Tombstone mobile history entry"),
            tombstoneButton: t("Tombstone History Entry"),
            tombstoneConfirmation: t("Type TOMBSTONE to confirm"),
            updateAria: t("Update mobile history entry"),
            updateButton: t("Update History Entry"),
          }}
          requestedShopId={requestedShopId}
        />
      ) : null}
      <ShopSectionPage section={section} />
    </div>
  );
}
