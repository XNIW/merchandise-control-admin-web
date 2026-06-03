import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Sync Center | MerchandiseControl Admin Web",
  description: "Shop Admin sync center for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

const SYNC_FILTER_MAX_LENGTH = 160;

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
      <form
        action="/shop/sync"
        className="mx-auto grid w-full max-w-7xl gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_220px_180px_auto]"
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Search
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={queryFilter ?? ""}
            maxLength={SYNC_FILTER_MAX_LENGTH}
            name="query"
            type="search"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Domain
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={domainFilter ?? ""}
            maxLength={SYNC_FILTER_MAX_LENGTH}
            name="domain"
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Source or device
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={sourceFilter ?? ""}
            maxLength={SYNC_FILTER_MAX_LENGTH}
            name="source"
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Status
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={statusFilter ?? ""}
            name="status"
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 self-end">
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Apply filters
          </button>
          {activeFilterCount > 0 ? (
            <a
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800"
              href={buildClearFiltersHref(requestedShopId)}
            >
              Clear filters
            </a>
          ) : null}
        </div>
      </form>
      <ShopSectionPage section={section} />
    </div>
  );
}
