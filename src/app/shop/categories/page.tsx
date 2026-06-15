import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  CatalogActionPanel,
  type CatalogCategoryOption,
} from "@/app/shop/_components/CatalogActionPanel";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopInventoryReadModel } from "@/server/shop-admin/inventory-read-model";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Categories | MerchandiseControl Admin Web",
  description: "Shop Admin categories shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  category_action?: string | string[];
  category_id?: string | string[];
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
    return "/shop/categories";
  }

  return `/shop/categories?${new URLSearchParams({
    shop_id: requestedShopId,
  }).toString()}`;
}

function mapCategoryOptions(
  rows: Awaited<ReturnType<typeof getShopInventoryReadModel>>["categories"],
): CatalogCategoryOption[] {
  return rows.map((category) => ({
    categoryId: category.categoryId,
    name: category.name,
  }));
}

function getCategoryDialog(action?: string) {
  if (action === "edit") {
    return "editCategory" as const;
  }

  if (action === "archive") {
    return "archiveCategory" as const;
  }

  return null;
}

function buildCategoryActionHref(
  params: Record<string, string | string[] | undefined>,
  action: "archive" | "edit",
  categoryId: string,
) {
  const nextParams = new URLSearchParams();

  for (const key of ["shop_id", "query"]) {
    const value = getParam(params, key);

    if (value) {
      nextParams.set(key, value);
    }
  }

  nextParams.set("category_action", action);
  nextParams.set("category_id", categoryId);

  return `/shop/categories?${nextParams.toString()}`;
}

function CategoryRowActions({
  labels,
  params,
  row,
}: {
  labels: {
    archive: string;
    update: string;
  };
  params: Record<string, string | string[] | undefined>;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey) {
    return null;
  }

  const categoryId = row.rowKey;

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {[
        { action: "edit" as const, label: labels.update },
        { action: "archive" as const, label: labels.archive },
      ].map((item) => (
        <a
          key={item.action}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
          href={buildCategoryActionHref(params, item.action, categoryId)}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

export default async function ShopCategoriesPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const { dictionary } = await getI18n();
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const activeFilterCount = [getParam(params, "query")].filter((value) =>
    Boolean(value?.trim()),
  ).length;
  const [section, inventoryReadModel, categoriesContext] = await Promise.all([
    getShopSectionForRequest("categories", requestedShopId, {
      catalogFilters: {
        query: getParam(params, "query"),
      },
    }),
    getShopInventoryReadModel({ requestedShopId }),
    resolveShopActionContext(requestedShopId, "categories.write"),
  ]);
  const canManageCategories = categoriesContext.status === "ready";
  const categoryOptions = mapCategoryOptions(inventoryReadModel.categories);
  const categoryDialog = getCategoryDialog(getParam(params, "category_action"));
  const categoryDialogId = getParam(params, "category_id") ?? "";
  const rowActionLabels = {
    archive: translateText(dictionary, "Archive"),
    update: translateText(dictionary, "Update"),
  };
  const catalogToolbar = canManageCategories ? (
    <CatalogActionPanel
      categories={categoryOptions}
      embedded
      initialDialog={categoryDialog}
      initialEntityId={categoryDialogId}
      labels={dictionary.exact}
      scope="categories"
      selectedShopId={requestedShopId}
    />
  ) : null;

  return (
    <div className="grid gap-5">
      <form
        action="/shop/categories"
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto]`}
      >
        {requestedShopId ? (
          <input name="shop_id" type="hidden" value={requestedShopId} />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          {dictionary.shopFilters.search}
          <input
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
            defaultValue={getParam(params, "query") ?? ""}
            name="query"
            type="search"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2 self-end">
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            {dictionary.common.applyFilters}
          </button>
          {activeFilterCount > 0 ? (
            <a
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800"
              href={buildClearFiltersHref(requestedShopId)}
            >
              {dictionary.common.clearFilters}
            </a>
          ) : null}
        </div>
      </form>
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <ShopSectionPage
        liveDataToolbar={catalogToolbar}
        rowActions={
          canManageCategories
            ? {
                label: dictionary.common.actions,
                render: (row) => (
                  <CategoryRowActions
                    labels={rowActionLabels}
                    params={params}
                    row={row}
                  />
                ),
              }
            : undefined
        }
        section={section}
      />
    </div>
  );
}
