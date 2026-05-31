import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import { CatalogActionPanel } from "@/app/shop/_components/CatalogActionPanel";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
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

export default async function ShopProductsPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
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

  return (
    <div className="grid gap-5">
      <form className="mx-auto grid max-w-7xl gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
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
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Category id
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "category_id") ?? ""}
            name="category_id"
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          Supplier id
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "supplier_id") ?? ""}
            name="supplier_id"
            type="text"
          />
        </label>
        <button className="self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
          Filter
        </button>
      </form>
      <ShopSectionPage section={section} />
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <CatalogActionPanel scope="products" selectedShopId={requestedShopId} />
    </div>
  );
}
