import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Sync Center");
}

export const dynamic = "force-dynamic";

const SYNC_FILTER_MAX_LENGTH = 160;
const syncFilterFormClassName =
  "grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(14rem,1fr)_minmax(0,180px)_minmax(0,220px)_minmax(0,150px)_auto]";
const syncFilterLabelClassName =
  "grid min-w-0 gap-1 text-sm font-medium text-zinc-800";
const syncFilterInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const syncFilterSelectClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const syncFilterActionsClassName =
  "flex min-w-0 flex-col gap-2 self-end sm:flex-row md:justify-end";
const syncFilterButtonClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white md:w-auto";
const syncClearFiltersClassName =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 md:w-auto";

type ShopPageSearchParams = Promise<{
  domain?: string | string[];
  query?: string | string[];
  shop_id?: string | string[];
  source?: string | string[];
  status?: string | string[];
}>;

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function getBoundedFilterParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = getParam(searchParams, key)?.trim();

  return value ? value.slice(0, SYNC_FILTER_MAX_LENGTH) : undefined;
}

function getStatusFilterParam(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const value = getBoundedFilterParam(searchParams, "status")?.toLowerCase();

  return value === "pending" || value === "success" || value === "failed"
    ? value
    : undefined;
}

function buildClearFiltersHref(requestedShopId?: string) {
  if (!requestedShopId) {
    return "/shop/sync";
  }

  return `/shop/sync?${new URLSearchParams({
    shop_id: requestedShopId,
  }).toString()}`;
}

export default async function ShopSyncPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const { dictionary } = await getI18n();
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const queryFilter = getBoundedFilterParam(params, "query");
  const domainFilter = getBoundedFilterParam(params, "domain");
  const sourceFilter = getBoundedFilterParam(params, "source");
  const statusFilter = getStatusFilterParam(params);
  const activeFilterCount = [
    queryFilter,
    domainFilter,
    sourceFilter,
    statusFilter,
  ].filter(Boolean).length;
  const section = await getShopSectionForRequest(
    "sync",
    requestedShopId,
    {
      syncFilters: {
        domain: domainFilter,
        query: queryFilter,
        source: sourceFilter,
        status: statusFilter,
      },
    },
  );

  return (
    <div className="grid gap-5">
      <ShopSectionPage
        beforeLiveData={
          <form action="/shop/sync" className={syncFilterFormClassName}>
            {requestedShopId ? (
              <input name="shop_id" type="hidden" value={requestedShopId} />
            ) : null}
            <label className={syncFilterLabelClassName}>
              {dictionary.shopFilters.search}
              <input
                className={syncFilterInputClassName}
                defaultValue={queryFilter ?? ""}
                maxLength={SYNC_FILTER_MAX_LENGTH}
                name="query"
                placeholder={translateText(dictionary, "Search sync events")}
                type="search"
              />
            </label>
            <label className={syncFilterLabelClassName}>
              {translateText(dictionary, "Domain")}
              <input
                className={syncFilterInputClassName}
                defaultValue={domainFilter ?? ""}
                maxLength={SYNC_FILTER_MAX_LENGTH}
                name="domain"
                placeholder={translateText(dictionary, "Domain")}
                type="text"
              />
            </label>
            <label className={syncFilterLabelClassName}>
              {translateText(dictionary, "Source or device")}
              <input
                className={syncFilterInputClassName}
                defaultValue={sourceFilter ?? ""}
                maxLength={SYNC_FILTER_MAX_LENGTH}
                name="source"
                placeholder={translateText(dictionary, "Device or source")}
                type="text"
              />
            </label>
            <label className={syncFilterLabelClassName}>
              {translateText(dictionary, "Status")}
              <select
                className={syncFilterSelectClassName}
                defaultValue={statusFilter ?? ""}
                name="status"
              >
                <option value="">{translateText(dictionary, "Any")}</option>
                <option value="pending">
                  {translateText(dictionary, "Pending")}
                </option>
                <option value="success">
                  {translateText(dictionary, "Success")}
                </option>
                <option value="failed">
                  {translateText(dictionary, "Failed")}
                </option>
              </select>
            </label>
            <div className={syncFilterActionsClassName}>
              <button className={syncFilterButtonClassName}>
                {dictionary.common.applyFilters}
              </button>
              {activeFilterCount > 0 ? (
                <a
                  className={syncClearFiltersClassName}
                  href={buildClearFiltersHref(requestedShopId)}
                >
                  {dictionary.common.clearFilters}
                </a>
              ) : null}
            </div>
          </form>
        }
        section={section}
      />
    </div>
  );
}
