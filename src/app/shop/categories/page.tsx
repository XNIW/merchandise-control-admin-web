import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  CatalogActionPanel,
  type CatalogCategoryOption,
} from "@/app/shop/_components/CatalogActionPanel";
import {
  CatalogEntityList,
  CatalogEntityPagination,
} from "@/app/shop/_components/CatalogEntityList";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import {
  getShopCatalogOptionsReadModel,
  getShopCategoriesPageReadModel,
  type ShopCatalogOptionsReadModel,
} from "@/server/shop-admin/inventory-read-model";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Categories");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  category_action?: string | string[];
  category_id?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  q?: string | string[];
  query?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
  state?: string | string[];
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

function normalizeCatalogEntityState(value?: string) {
  return value === "archived" || value === "all" ? value : "active";
}

function normalizePageSize(value?: string) {
  return value === "25" || value === "50" || value === "100" || value === "200"
    ? value
    : "10";
}

function buildCategoriesHref(input: {
  page?: number | string | null;
  pageSize?: number | string | null;
  query?: string | null;
  requestedShopId?: string | null;
  state?: string | null;
}) {
  const nextParams = new URLSearchParams();

  if (input.requestedShopId) {
    nextParams.set("shop_id", input.requestedShopId);
  }

  if (input.query) {
    nextParams.set("q", input.query);
  }

  if (input.state && input.state !== "active") {
    nextParams.set("state", input.state);
  }

  if (input.page && String(input.page) !== "1") {
    nextParams.set("page", String(input.page));
  }

  if (input.pageSize && String(input.pageSize) !== "10") {
    nextParams.set("pageSize", String(input.pageSize));
  }

  const query = nextParams.toString();

  return query ? `/shop/categories?${query}` : "/shop/categories";
}

function buildClearFiltersHref(requestedShopId?: string) {
  return buildCategoriesHref({ requestedShopId });
}

function mapCategoryOptions(
  rows: ShopCatalogOptionsReadModel["categories"],
): CatalogCategoryOption[] {
  return rows.map((category) => ({
    activeProductsCount: category.activeProductsCount,
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
  const requestedShopId = getParam(params, "shop_id");
  const searchQuery = getFirstParam(params, ["q", "query"]);
  const page = getParam(params, "page");
  const pageSize = normalizePageSize(getParam(params, "pageSize"));
  const state = normalizeCatalogEntityState(getParam(params, "state"));

  if (requestedShopId) {
    nextParams.set("shop_id", requestedShopId);
  }

  if (searchQuery) {
    nextParams.set("q", searchQuery);
  }

  if (state !== "active") {
    nextParams.set("state", state);
  }

  if (page && page !== "1") {
    nextParams.set("page", page);
  }

  if (pageSize !== "10") {
    nextParams.set("pageSize", pageSize);
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
    delete: string;
    rename: string;
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
        { action: "edit" as const, label: labels.rename },
        { action: "archive" as const, label: labels.delete },
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
  const { dictionary, locale } = await getI18n();
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const selectedQuery = getFirstParam(params, ["q", "query"]) ?? "";
  const selectedState = normalizeCatalogEntityState(getParam(params, "state"));
  const selectedPage = getParam(params, "page") ?? "1";
  const selectedPageSize = normalizePageSize(getParam(params, "pageSize"));
  const activeFilterCount = [
    selectedQuery,
    selectedState === "active" ? undefined : selectedState,
  ].filter((value) =>
    Boolean(value?.trim()),
  ).length;
  const [catalogReadModel, categoriesContext] = await Promise.all([
    getShopCategoriesPageReadModel({
      filters: {
        query: selectedQuery,
        state: selectedState,
      },
      page: selectedPage,
      pageSize: selectedPageSize,
      requestedShopId,
    }),
    resolveShopActionContext(requestedShopId, "categories.write"),
  ]);
  const catalogOptionsReadModel = categoriesContext.status === "ready"
    ? await getShopCatalogOptionsReadModel({ requestedShopId })
    : catalogReadModel;
  const section = await getShopSectionForRequest("categories", requestedShopId, {
    catalogOptionsReadModel: catalogReadModel,
    catalogFilters: {
      query: selectedQuery,
      state: selectedState,
    },
  });
  const canManageCategories = categoriesContext.status === "ready";
  const categoryOptions = mapCategoryOptions(catalogOptionsReadModel.categories);
  const categoryDialog = getCategoryDialog(getParam(params, "category_action"));
  const categoryDialogId = getParam(params, "category_id") ?? "";
  const rowActionLabels = {
    delete: translateText(dictionary, "Delete"),
    rename: translateText(dictionary, "Rename"),
  };
  const listLabels = {
    actions: translateText(dictionary, "Rename or delete"),
    linkedProducts: translateText(dictionary, "linked products"),
    updated: translateText(dictionary, "Updated"),
  };
  const paginationLabels = {
    applyPage: translateText(dictionary, "Go"),
    atLeast: translateText(dictionary, "at least"),
    goToPage: translateText(dictionary, "Go to page"),
    next: translateText(dictionary, "Next"),
    of: translateText(dictionary, "of"),
    page: translateText(dictionary, "Page"),
    pagination: translateText(dictionary, "Categories pagination"),
    previous: translateText(dictionary, "Previous"),
    rowsOnThisPage: translateText(dictionary, "Rows on this page"),
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
      <ShopSectionPage
        beforeLiveData={
          <>
            <form
              action="/shop/categories"
              className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_auto]"
              method="get"
            >
              {requestedShopId ? (
                <input name="shop_id" type="hidden" value={requestedShopId} />
              ) : null}
              {selectedState !== "active" ? (
                <input name="state" type="hidden" value={selectedState} />
              ) : null}
              <input name="page" type="hidden" value="1" />
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                {dictionary.shopFilters.search}
                <input
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
                  defaultValue={selectedQuery}
                  name="q"
                  type="search"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-zinc-800">
                {translateText(dictionary, "Page size")}
                <select
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
                  defaultValue={selectedPageSize}
                  name="pageSize"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
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
            {catalogToolbar}
            <ActionResultBanner
              action={getParam(params, "action")}
              result={getParam(params, "result")}
            />
            <CatalogEntityPagination
              basePath="/shop/categories"
              filters={catalogReadModel.filters}
              labels={paginationLabels}
              locale={locale}
              pagination={catalogReadModel.pagination}
              placement="top"
              requestedShopId={requestedShopId}
            />
          </>
        }
        renderLiveData={({ liveData, rowActions }) => (
          <CatalogEntityList
            icon="category"
            labels={listLabels}
            liveData={liveData}
            rowActions={rowActions}
          />
        )}
        rowActions={
          canManageCategories
            ? {
                label: listLabels.actions,
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
      <CatalogEntityPagination
        basePath="/shop/categories"
        filters={catalogReadModel.filters}
        labels={paginationLabels}
        locale={locale}
        pagination={catalogReadModel.pagination}
        placement="bottom"
        requestedShopId={requestedShopId}
      />
    </div>
  );
}
