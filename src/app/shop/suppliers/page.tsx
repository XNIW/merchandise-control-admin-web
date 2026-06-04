import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { CatalogActionPanel } from "@/app/shop/_components/CatalogActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Suppliers | MerchandiseControl Admin Web",
  description: "Shop Admin suppliers shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  query?: string | string[];
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

function buildClearFiltersHref(requestedShopId?: string) {
  if (!requestedShopId) {
    return "/shop/suppliers";
  }

  return `/shop/suppliers?${new URLSearchParams({
    shop_id: requestedShopId,
  }).toString()}`;
}

export default async function ShopSuppliersPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const activeFilterCount = [getParam(params, "query")].filter((value) =>
    Boolean(value?.trim()),
  ).length;
  const section = await getShopSectionForRequest(
    "suppliers",
    requestedShopId,
    {
      catalogFilters: {
        query: getParam(params, "query"),
      },
    },
  );
  const canManageSuppliers =
    (await resolveShopActionContext(requestedShopId, "suppliers.write"))
      .status === "ready";

  return (
    <div className="grid gap-5">
      <form
        action="/shop/suppliers"
        className="mx-auto grid w-full max-w-7xl gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto]"
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Search
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "query") ?? ""}
            name="query"
            type="search"
          />
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
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      {canManageSuppliers ? (
        <CatalogActionPanel scope="suppliers" selectedShopId={requestedShopId} />
      ) : null}
    </div>
  );
}
