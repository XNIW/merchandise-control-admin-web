import type { Metadata } from "next";
import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import {
  CatalogActionPanel,
  type CatalogCategoryOption,
  type CatalogProductOption,
  type CatalogSupplierOption,
} from "@/app/shop/_components/CatalogActionPanel";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import { getShopInventoryReadModel } from "@/server/shop-admin/inventory-read-model";
import { getShopSectionForRequest } from "@/server/shop-admin/shop-section-data";

export const metadata: Metadata = {
  title: "Products | MerchandiseControl Admin Web",
  description: "Shop Admin products shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  category_id?: string | string[];
  product_action?: string | string[];
  product_id?: string | string[];
  query?: string | string[];
  result?: string | string[];
  shop_id?: string | string[];
  state?: string | string[];
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

function mapProductOptions(
  rows: Awaited<ReturnType<typeof getShopInventoryReadModel>>["products"],
): CatalogProductOption[] {
  return rows.map((product) => ({
    barcode: product.barcode,
    categoryId: product.categoryId,
    itemNumber: product.itemNumber,
    productId: product.productId,
    productName: product.productName,
    purchasePrice: product.purchasePrice,
    retailPrice: product.retailPrice,
    secondProductName: product.secondProductName,
    stockQuantity: product.stockQuantity,
    supplierId: product.supplierId,
  }));
}

function mapCategoryOptions(
  rows: Awaited<ReturnType<typeof getShopInventoryReadModel>>["categories"],
): CatalogCategoryOption[] {
  return rows.map((category) => ({
    categoryId: category.categoryId,
    name: category.name,
  }));
}

function mapSupplierOptions(
  rows: Awaited<ReturnType<typeof getShopInventoryReadModel>>["suppliers"],
): CatalogSupplierOption[] {
  return rows.map((supplier) => ({
    name: supplier.name,
    supplierId: supplier.supplierId,
  }));
}

function getProductDialog(action?: string) {
  if (action === "edit") {
    return "editProduct" as const;
  }

  if (action === "archive") {
    return "archiveProduct" as const;
  }

  if (action === "restore") {
    return "restoreProduct" as const;
  }

  return null;
}

function buildProductActionHref(
  params: Record<string, string | string[] | undefined>,
  action: "archive" | "edit" | "restore",
  productId: string,
) {
  const nextParams = new URLSearchParams();

  for (const key of ["shop_id", "query", "category_id", "supplier_id", "state"]) {
    const value = getParam(params, key);

    if (value) {
      nextParams.set(key, value);
    }
  }

  nextParams.set("product_action", action);
  nextParams.set("product_id", productId);

  return `/shop/products?${nextParams.toString()}`;
}

function buildProductDetailHref(
  params: Record<string, string | string[] | undefined>,
  productId: string,
) {
  const nextParams = new URLSearchParams();

  for (const key of ["shop_id", "query", "category_id", "supplier_id", "state"]) {
    const value = getParam(params, key);

    if (value) {
      nextParams.set(key, value);
    }
  }

  const query = nextParams.toString();

  return `/shop/products/${encodeURIComponent(productId)}${query ? `?${query}` : ""}`;
}

function ProductRowActions({
  params,
  row,
}: {
  params: Record<string, string | string[] | undefined>;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey) {
    return null;
  }

  const productId = row.rowKey;
  const isArchived = row.state === "Archived";
  const actions = isArchived
    ? [{ action: "restore" as const, label: "Restore" }]
    : [
        { action: "edit" as const, label: "Edit" },
        { action: "archive" as const, label: "Archive" },
      ];

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <a
        className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
        href={buildProductDetailHref(params, productId)}
      >
        Detail
      </a>
      {actions.map((item) => (
        <a
          key={item.action}
          className="inline-flex h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
          href={buildProductActionHref(params, item.action, productId)}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

export default async function ShopProductsPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const selectedState = getParam(params, "state") ?? "active";
  const activeFilterCount = [
    getParam(params, "query"),
    getParam(params, "category_id"),
    getParam(params, "supplier_id"),
    selectedState === "active" ? undefined : selectedState,
  ].filter((value) => Boolean(value?.trim())).length;
  const [
    section,
    inventoryReadModel,
    productsContext,
    importContext,
    exportContext,
  ] = await Promise.all([
    getShopSectionForRequest("products", requestedShopId, {
      catalogFilters: {
        categoryId: getParam(params, "category_id"),
        query: getParam(params, "query"),
        state: selectedState,
        supplierId: getParam(params, "supplier_id"),
      },
    }),
    getShopInventoryReadModel({ requestedShopId }),
    resolveShopActionContext(requestedShopId, "products.write"),
    resolveShopActionContext(requestedShopId, "catalog.import"),
    resolveShopActionContext(requestedShopId, "catalog.export"),
  ]);
  const canManageProducts = productsContext.status === "ready";
  const canImport = importContext.status === "ready";
  const canExport = exportContext.status === "ready";
  const categoryOptions = mapCategoryOptions(inventoryReadModel.categories);
  const supplierOptions = mapSupplierOptions(inventoryReadModel.suppliers);
  const productCatalogOptions = mapProductOptions(inventoryReadModel.products);
  const archivedProductCatalogOptions = mapProductOptions(
    inventoryReadModel.archivedProducts,
  );
  const productDialog = getProductDialog(getParam(params, "product_action"));
  const productDialogId = getParam(params, "product_id") ?? "";
  const catalogToolbar =
    canManageProducts || canImport || canExport ? (
      <CatalogActionPanel
        archivedProducts={archivedProductCatalogOptions}
        canExport={canExport}
        canImport={canImport}
        canManage={canManageProducts}
        categories={categoryOptions}
        embedded
        initialDialog={productDialog}
        initialEntityId={productDialogId}
        products={productCatalogOptions}
        scope="products"
        selectedShopId={requestedShopId}
        suppliers={supplierOptions}
      />
    ) : null;

  return (
    <div className="grid gap-5">
      <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-1`}>
        <p className="text-xs font-semibold uppercase tracking-normal text-emerald-700">
          Catalog Workspace
        </p>
      </div>
      <form
        action="/shop/products"
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(14rem,1fr)_minmax(0,190px)_minmax(0,190px)_minmax(0,150px)_auto] md:items-end`}
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
          Category
          <select
            className={filterInputClassName}
            defaultValue={getParam(params, "category_id") ?? ""}
            name="category_id"
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category.categoryId} value={category.categoryId}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className={filterLabelClassName}>
          Supplier
          <select
            className={filterInputClassName}
            defaultValue={getParam(params, "supplier_id") ?? ""}
            name="supplier_id"
          >
            <option value="">All suppliers</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.supplierId} value={supplier.supplierId}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className={filterLabelClassName}>
          State
          <select
            className={filterInputClassName}
            defaultValue={selectedState}
            name="state"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All states</option>
          </select>
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
      <ActionResultBanner
        action={getParam(params, "action")}
        result={getParam(params, "result")}
      />
      <ShopSectionPage
        liveDataToolbar={catalogToolbar}
        rowActions={
          canManageProducts
            ? {
                label: "Actions",
                render: (row) => <ProductRowActions params={params} row={row} />,
              }
            : undefined
        }
        section={section}
      />
    </div>
  );
}
