import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { CatalogActionPanel } from "@/app/shop/_components/CatalogActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Products | MerchandiseControl Admin Web",
  description: "Shop Admin products shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  category_id?: string | string[];
  query?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
  supplier_id?: string | string[];
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
    return "/shop/products";
  }

  return `/shop/products?${new URLSearchParams({
    shop_id: requestedShopId,
  }).toString()}`;
}

const filterLabelClassName =
  "grid min-w-0 gap-1 text-sm font-medium text-zinc-800";
const filterInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const filterButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium";

export default async function ShopProductsPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const activeFilterCount = [
    getParam(params, "query"),
    getParam(params, "category_id"),
    getParam(params, "supplier_id"),
  ].filter((value) => Boolean(value?.trim())).length;
  const section = await getShopSectionForRequest(
    "products",
    requestedShopId,
    {
      catalogFilters: {
        categoryId: getParam(params, "category_id"),
        query: getParam(params, "query"),
        supplierId: getParam(params, "supplier_id"),
      },
    },
  );
  const canManageProducts =
    (await resolveShopActionContext(requestedShopId, "products.write"))
      .status === "ready";

  return (
    <div className="grid gap-5">
      <form
        action="/shop/products"
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(14rem,1fr)_minmax(0,220px)_minmax(0,220px)_auto] md:items-end`}
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <label className={filterLabelClassName}>
          Search
          <input
            className={filterInputClassName}
            defaultValue={getParam(params, "query") ?? ""}
            name="query"
            placeholder="Search by barcode, name, item number"
            type="search"
          />
        </label>
        <label className={filterLabelClassName}>
          Category id
          <input
            aria-describedby="products-category-filter-help"
            className={filterInputClassName}
            defaultValue={getParam(params, "category_id") ?? ""}
            name="category_id"
            type="text"
          />
          <span
            className="sr-only"
            id="products-category-filter-help"
          >
            Use an id from Categories.
          </span>
        </label>
        <label className={filterLabelClassName}>
          Supplier id
          <input
            aria-describedby="products-supplier-filter-help"
            className={filterInputClassName}
            defaultValue={getParam(params, "supplier_id") ?? ""}
            name="supplier_id"
            type="text"
          />
          <span
            className="sr-only"
            id="products-supplier-filter-help"
          >
            Use an id from Suppliers.
          </span>
        </label>
        <div className="flex min-w-0 flex-wrap items-end gap-2 self-end">
          <button className={`${filterButtonClassName} bg-zinc-950 text-white`}>
            Apply filters
          </button>
          {activeFilterCount > 0 ? (
            <a
              className={`${filterButtonClassName} border border-zinc-300 text-zinc-800`}
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
      {canManageProducts ? (
        <CatalogActionPanel scope="products" selectedShopId={requestedShopId} />
      ) : null}
    </div>
  );
}
