import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  CatalogActionPanel,
  type CatalogSupplierOption,
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
  getShopSuppliersPageReadModel,
  type ShopCatalogOptionsReadModel,
} from "@/server/shop-admin/inventory-read-model";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Suppliers");
}

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  q?: string | string[];
  query?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
  state?: string | string[];
  supplier_action?: string | string[];
  supplier_id?: string | string[];
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

function buildSuppliersHref(input: {
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

  return query ? `/shop/suppliers?${query}` : "/shop/suppliers";
}

function buildClearFiltersHref(requestedShopId?: string) {
  return buildSuppliersHref({ requestedShopId });
}

function mapSupplierOptions(
  rows: ShopCatalogOptionsReadModel["suppliers"],
): CatalogSupplierOption[] {
  return rows.map((supplier) => ({
    activeProductsCount: supplier.activeProductsCount,
    name: supplier.name,
    supplierId: supplier.supplierId,
  }));
}

function getSupplierDialog(action?: string) {
  if (action === "edit") {
    return "editSupplier" as const;
  }

  if (action === "archive") {
    return "archiveSupplier" as const;
  }

  return null;
}

function buildSupplierActionHref(
  params: Record<string, string | string[] | undefined>,
  action: "archive" | "edit",
  supplierId: string,
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

  nextParams.set("supplier_action", action);
  nextParams.set("supplier_id", supplierId);

  return `/shop/suppliers?${nextParams.toString()}`;
}

function SupplierRowActions({
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

  const supplierId = row.rowKey;

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {[
        { action: "edit" as const, label: labels.rename },
        { action: "archive" as const, label: labels.delete },
      ].map((item) => (
        <a
          key={item.action}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
          href={buildSupplierActionHref(params, item.action, supplierId)}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

export default async function ShopSuppliersPage({
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
  const [catalogReadModel, suppliersContext] = await Promise.all([
    getShopSuppliersPageReadModel({
      filters: {
        query: selectedQuery,
        state: selectedState,
      },
      includeExactTotals:
        activeFilterCount > 0 || Boolean(getParam(params, "supplier_action"))
          ? false
          : true,
      page: selectedPage,
      pageSize: selectedPageSize,
      requestedShopId,
    }),
    resolveShopActionContext(requestedShopId, "suppliers.write"),
  ]);
  const catalogOptionsReadModel = suppliersContext.status === "ready"
    ? await getShopCatalogOptionsReadModel({ requestedShopId })
    : catalogReadModel;
  const section = await getShopSectionForRequest("suppliers", requestedShopId, {
    catalogOptionsReadModel: catalogReadModel,
    catalogFilters: {
      query: selectedQuery,
      state: selectedState,
    },
  });
  const canManageSuppliers = suppliersContext.status === "ready";
  const supplierOptions = mapSupplierOptions(catalogOptionsReadModel.suppliers);
  const supplierDialog = getSupplierDialog(getParam(params, "supplier_action"));
  const supplierDialogId = getParam(params, "supplier_id") ?? "";
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
    pagination: translateText(dictionary, "Suppliers pagination"),
    previous: translateText(dictionary, "Previous"),
    rowsOnThisPage: translateText(dictionary, "Rows on this page"),
  };
  const catalogToolbar = canManageSuppliers ? (
    <CatalogActionPanel
      embedded
      initialDialog={supplierDialog}
      initialEntityId={supplierDialogId}
      labels={dictionary.exact}
      scope="suppliers"
      selectedShopId={requestedShopId}
      suppliers={supplierOptions}
    />
  ) : null;

  return (
    <div className="grid gap-5">
      <ShopSectionPage
        beforeLiveData={
          <>
            <form
              action="/shop/suppliers"
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
              basePath="/shop/suppliers"
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
            icon="supplier"
            labels={listLabels}
            liveData={liveData}
            rowActions={rowActions}
          />
        )}
        rowActions={
          canManageSuppliers
            ? {
                label: listLabels.actions,
                render: (row) => (
                  <SupplierRowActions
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
        basePath="/shop/suppliers"
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
