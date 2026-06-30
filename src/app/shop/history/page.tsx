import { createHistoryEntryAction } from "@/app/shop/actions";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { HistoryEntriesClientList } from "@/app/shop/_components/HistoryEntriesClientList";
import { HistoryDetailModalController } from "@/app/shop/_components/HistoryDetailModalController";
import { ProductDetailModalController } from "@/app/shop/_components/ProductDetailModalController";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopHistoryListReadModel } from "@/server/shop-admin/history-read-model";
import { buildHistorySection } from "@/server/shop-admin/shop-section-data";
import { getI18n } from "@/i18n/get-locale";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import type { Dictionary } from "@/i18n/dictionaries";
import { translateText } from "@/i18n/translate-sections";

export function generateMetadata() {
  return createLocalizedPageMetadata("Mobile History");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  month?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  q?: string | string[];
  query?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
  status?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function getFirstParam(
  searchParams: Record<string, string | string[] | undefined>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = getParam(searchParams, key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function HistoryEntryCreateForm({
  dictionary,
  requestedShopId,
}: {
  dictionary: Dictionary;
  requestedShopId?: string;
}) {
  const t = (value: string) => translateText(dictionary, value);

  return (
    <form
      action={createHistoryEntryAction}
      aria-label={t("Create mobile history entry")}
      className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
    >
      {requestedShopId ? (
        <input name="shop_id" type="hidden" value={requestedShopId} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          {t("Entry name")}
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="displayName"
            required
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          {t("Supplier")}
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="supplier"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
          {t("Category")}
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            name="category"
          />
        </label>
      </div>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
        {t("Rows")}
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
          {t("Complete rows")}
        </label>
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white">
          {t("Create History Entry")}
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
  const selectedQuery = getFirstParam(params, ["q", "query"]) ?? "";
  const selectedMonth = getParam(params, "month") ?? "";
  const selectedStatus = getParam(params, "status") ?? "active_issues";
  const selectedPage = getParam(params, "page") ?? "1";
  const selectedPageSize = getParam(params, "pageSize") ?? "10";
  const [{ dictionary, locale }, readModel, writeContext] = await Promise.all([
    getI18n(),
    getShopHistoryListReadModel({
      filters: {
        month: selectedMonth,
        query: selectedQuery,
        status: selectedStatus,
      },
      page: selectedPage,
      pageSize: selectedPageSize,
      requestedShopId,
    }),
    resolveShopActionContext(requestedShopId, "history.write"),
  ]);
  const section = buildHistorySection(readModel);
  const canWriteHistory =
    writeContext.status === "ready" && readModel.status === "ready";

  return (
    <div className="grid gap-5">
      <ShopSectionPage
        beforeLiveData={
          <>
            <ActionResultBanner
              action={getParam(params, "action")}
              result={getParam(params, "result")}
            />
            <HistoryDetailModalController
              labels={dictionary.exact}
              locale={locale}
              requestedShopId={requestedShopId}
            />
            <ProductDetailModalController
              canManageProducts={false}
              labels={dictionary.exact}
              locale={locale}
              requestedShopId={requestedShopId}
              selectedShopId={readModel.selectedShop?.shopId ?? requestedShopId}
            />
            {canWriteHistory ? (
              <HistoryEntryCreateForm
                dictionary={dictionary}
                requestedShopId={requestedShopId}
              />
            ) : null}
          </>
        }
        renderLiveData={({ liveData }) => (
          <HistoryEntriesClientList
            detailLabel={translateText(dictionary, "Detail")}
            labels={dictionary.exact}
            liveData={liveData}
            locale={locale}
            pagination={readModel.pagination}
            rawRows={section.liveData?.rows ?? []}
            requestedShopId={requestedShopId}
            selectedFilters={readModel.filters}
          />
        )}
        section={section}
      />
    </div>
  );
}
