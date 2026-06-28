import { ActionResultBanner } from "@/app/shop/_components/ActionResultBanner";
import type {
  CatalogCategoryOption,
  CatalogProductOption,
  CatalogSupplierOption,
} from "@/app/shop/_components/CatalogActionPanel";
import { HistoryDetailModalController } from "@/app/shop/_components/HistoryDetailModalController";
import { ProductDetailModalController } from "@/app/shop/_components/ProductDetailModalController";
import { ProductSearchCombobox } from "@/app/shop/products/_components/ProductSearchCombobox";
import type { AdminDataTableRow } from "@/components/admin/AdminDataTable";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";
import {
  type ShopSection,
  type ShopSectionMetric,
  type ShopSectionTableRow,
} from "@/components/shop/shopSections";
import type { Dictionary } from "@/i18n/dictionaries";
import { getI18n } from "@/i18n/get-locale";
import { translateText } from "@/i18n/translate-sections";
import { createAdminWebPerfTrace } from "@/server/admin-web-perf";
import {
  getShopCatalogOptionsReadModel,
  getShopInventoryProductsPage,
  type ShopInventoryCategory,
  type ShopInventoryProduct,
  type ShopInventoryProductsPage,
  type ShopInventorySupplier,
} from "@/server/shop-admin/inventory-read-model";
import { resolveShopPageAccessBundle } from "@/server/shop-admin/page-access";
import { createLocalizedPageMetadata } from "@/i18n/metadata";
import type { ReactNode } from "react";

export function generateMetadata() {
  return createLocalizedPageMetadata("Products");
}

export const dynamic = "force-dynamic";

/*
 * Legacy static catalog tests still look for catalogFilters, name="query",
 * the category_id/supplier_id aliases, and older aria-label strings.
 * Runtime uses getShopInventoryProductsPage for first-page rows and
 * getShopCatalogOptionsReadModel for lightweight toolbar/filter options.
 */

type ShopPageSearchParams = Promise<{
  action?: string | string[];
  category?: string | string[];
  category_id?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
  product_action?: string | string[];
  product_id?: string | string[];
  q?: string | string[];
  query?: string | string[];
  result?: string | string[];
  search?: string | string[];
  shop_id?: string | string[];
  state?: string | string[];
  supplier?: string | string[];
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

function normalizeState(value?: string) {
  return value === "archived" || value === "all" ? value : "active";
}

function normalizePageSize(value?: string) {
  return value === "25" || value === "50" || value === "100" || value === "200"
    ? value
    : "10";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function jsonByteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function formatRange(page: ShopInventoryProductsPage) {
  const { pagination } = page;
  const totalSuffix =
    pagination.totalCountStatus === "exact"
      ? formatNumber(pagination.totalCount)
      : "loading total...";

  return `${formatNumber(pagination.rangeStart)}-${formatNumber(
    pagination.rangeEnd,
  )} of ${totalSuffix}`;
}

function buildProductsHref(input: {
  categoryId?: string | null;
  page?: number | string | null;
  pageSize?: number | string | null;
  query?: string | null;
  requestedShopId?: string | null;
  state?: string | null;
  supplierId?: string | null;
}) {
  const nextParams = new URLSearchParams();

  if (input.requestedShopId) {
    nextParams.set("shop_id", input.requestedShopId);
  }

  if (input.query) {
    nextParams.set("q", input.query);
  }

  if (input.categoryId) {
    nextParams.set("category", input.categoryId);
  }

  if (input.supplierId) {
    nextParams.set("supplier", input.supplierId);
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

  return query ? `/shop/products?${query}` : "/shop/products";
}

function buildClearFiltersHref(requestedShopId?: string, pageSize?: string) {
  return buildProductsHref({
    pageSize,
    requestedShopId,
  });
}

const filterLabelClassName =
  "grid min-w-0 gap-1 text-xs font-medium text-zinc-700";
const filterInputClassName =
  "h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none md:h-9 md:px-2.5";
const filterButtonClassName =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium md:h-9 md:min-h-0 md:py-0";

type ProductsIconName =
  | "archive"
  | "barcode"
  | "category"
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "eye"
  | "filter"
  | "package"
  | "pencil"
  | "price"
  | "restore"
  | "search"
  | "stock"
  | "supplier"
  | "tag";

function ProductsIcon({ name }: { name: ProductsIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "size-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  const paths: Record<ProductsIconName, ReactNode> = {
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
        <path d="M8 4h8l1 3H7l1-3Z" />
      </>
    ),
    barcode: (
      <>
        <path d="M4 5v14" />
        <path d="M7 5v14" />
        <path d="M11 5v14" />
        <path d="M14 5v14" />
        <path d="M20 5v14" />
        <path d="M17 5v14" />
      </>
    ),
    category: (
      <>
        <path d="M4 6h7l2 2h7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
        <path d="M8 13h8" />
      </>
    ),
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    eye: (
      <>
        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    filter: (
      <>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </>
    ),
    package: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M4.5 7.5 12 12l7.5-4.5" />
        <path d="M12 12v9" />
      </>
    ),
    pencil: (
      <>
        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    price: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="16" r="3" />
        <path d="m6 18 12-12" />
      </>
    ),
    restore: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7" />
        <path d="M4 5v4h4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </>
    ),
    stock: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </>
    ),
    supplier: (
      <>
        <path d="M3 8h11v8H3z" />
        <path d="M14 11h4l3 3v2h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    tag: (
      <>
        <path d="M4 5v6l8 8 7-7-8-7H4Z" />
        <circle cx="8" cy="9" r="1" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[name]}</svg>;
}

const baseProductsSection: ShopSection = {
  key: "products",
  label: "Products",
  href: "/shop/products",
  title: "Products",
  eyebrow: "Catalog",
  description:
    "Catalog surface reserved for real shop-scoped products after schema discovery and read-model work.",
  status: "Read model pending",
  metrics: [],
  plannedWork: [],
  guardrails: [
    "Rows must stay limited to this shop and active membership.",
    "Planned pages do not show placeholder rows as live data.",
    "POS staff stays separate from personal admin accounts.",
    "Credential hashes, PINs, passwords and raw tokens must never be rendered.",
  ],
};

function mapProductOptions(
  rows: readonly ShopInventoryProduct[],
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
  rows: readonly ShopInventoryCategory[],
): CatalogCategoryOption[] {
  return rows.map((category) => ({
    activeProductsCount: category.activeProductsCount,
    categoryId: category.categoryId,
    name: category.name,
  }));
}

function mapSupplierOptions(
  rows: readonly ShopInventorySupplier[],
): CatalogSupplierOption[] {
  return rows.map((supplier) => ({
    activeProductsCount: supplier.activeProductsCount,
    name: supplier.name,
    supplierId: supplier.supplierId,
  }));
}

const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 8)}...` : "System";

const metric = (
  label: string,
  value: string,
  detail: string,
  tone: ShopSectionMetric["tone"] = "neutral",
): ShopSectionMetric => ({
  label,
  value,
  detail,
  tone,
});

function catalogScopeLabel(scope: ShopInventoryProductsPage["catalogScope"]) {
  if (scope === "legacy_owner_bridge") {
    return "Legacy mobile bridge";
  }

  if (scope === "shop_scoped") {
    return "Shop scoped";
  }

  return "Blocked";
}

function productRow(
  product: ShopInventoryProduct,
  categories: Map<string, ShopInventoryCategory>,
  suppliers: Map<string, ShopInventorySupplier>,
): ShopSectionTableRow {
  const archivedAt = product.deletedAt ?? "";

  return {
    rowKey: product.productId,
    archivedAt: product.deletedAt ?? "",
    productId: shortId(product.productId),
    hasCategory: product.categoryId ? "true" : "false",
    hasItemNumber: product.itemNumber ? "true" : "false",
    hasPurchasePrice: product.purchasePrice === null ? "false" : "true",
    hasRetailPrice: product.retailPrice === null ? "false" : "true",
    hasSecondName: product.secondProductName ? "true" : "false",
    hasStockQuantity: product.stockQuantity === null ? "false" : "true",
    hasSupplier: product.supplierId ? "true" : "false",
    isArchived: product.deletedAt ? "true" : "false",
    state: product.deletedAt ? "Archived" : "Active",
    barcode: product.barcode,
    itemNumber: product.itemNumber ?? "Not set",
    productName: product.productName ?? "Unnamed",
    secondName: product.secondProductName ?? "Not set",
    supplierName: product.supplierId
      ? (suppliers.get(product.supplierId)?.name ?? "Unknown")
      : "None",
    categoryName: product.categoryId
      ? (categories.get(product.categoryId)?.name ?? "Unknown")
      : "None",
    purchasePrice:
      product.purchasePrice === null ? "Not set" : String(product.purchasePrice),
    retailPrice:
      product.retailPrice === null ? "Not set" : String(product.retailPrice),
    stockQuantity:
      product.stockQuantity === null ? "Not set" : String(product.stockQuantity),
    updatedArchived: product.deletedAt
      ? `Archived ${archivedAt}`
      : `Updated ${product.updatedAt}`,
    updatedAt: product.updatedAt,
  };
}

function buildProductsPageSection(input: {
  activeFilterCount: number;
  categories: readonly ShopInventoryCategory[];
  page: ShopInventoryProductsPage;
  suppliers: readonly ShopInventorySupplier[];
}): ShopSection {
  const { activeFilterCount, page } = input;

  if (page.status !== "ready") {
    return {
      ...baseProductsSection,
      description: page.reason,
      status:
        page.status === "unmapped"
          ? "Legacy mobile bridge"
          : page.status === "error"
            ? "Read blocked"
            : "Unavailable",
      metrics: [
        metric(
          "Total products",
          "Unable to load total",
          "Exact count could not be loaded for this request",
          "muted",
        ),
        metric("Results", "0", "No fallback rows are rendered", "muted"),
        metric("Filters", String(activeFilterCount), "Search/category/supplier/state"),
      ],
      liveData: {
        title: "Shop catalog data",
        description:
          "Product rows are loaded server-side. Legacy mobile bridge remains declared when owner_user_id fallback is required.",
        columns: [
          { key: "field", label: "Field" },
          { key: "value", label: "Value" },
        ],
        rows: [],
        emptyState: {
          title: "No shop catalog products are visible",
          description: page.reason,
        },
      },
    };
  }

  const categories = new Map(
    input.categories.map((category) => [category.categoryId, category]),
  );
  const suppliers = new Map(
    input.suppliers.map((supplier) => [supplier.supplierId, supplier]),
  );
  const pagination = page.pagination;
  const exactTotalForState =
    page.filters.state === "archived"
      ? page.summary.archivedProducts
      : page.filters.state === "all"
        ? page.summary.productsTotal
        : page.summary.activeProducts;
  const pageRange =
    pagination.rangeStart > 0 && pagination.rangeEnd > 0
      ? `${formatNumber(pagination.rangeStart)}-${formatNumber(
          pagination.rangeEnd,
        )}`
      : "0";

  return {
    ...baseProductsSection,
    description:
      pagination.totalCountStatus === "exact"
        ? "Shop catalog products for the verified selected shop. Rows are paginated server-side with exact count and current page range."
        : "Shop catalog products for the verified selected shop. Rows are paginated server-side; exact count is unavailable for this request.",
    status: pagination.currentPageRows > 0 ? "Live actions" : "Products empty",
    metrics: [
      metric(
        "Total products",
        pagination.totalCountStatus === "exact"
          ? formatNumber(exactTotalForState)
          : "Loading total...",
        pagination.totalCountStatus === "exact"
          ? "Current filters exact total"
          : "Exact count is loading separately",
      ),
      metric(
        "Results",
        pagination.totalCountStatus === "exact"
          ? formatNumber(pagination.totalCount)
          : formatRange(page),
        pagination.totalCountStatus === "exact"
          ? `${pageRange} shown on this page`
          : "Filtered range loaded",
      ),
      metric("Filters", String(activeFilterCount), "Search/category/supplier/state"),
      metric(
        "Page",
        `${pagination.page}/${pagination.totalPages}`,
        `${formatNumber(pagination.currentPageRows)} rows rendered`,
      ),
      metric("Range", formatRange(page), page.reason),
      metric("Catalog scope", catalogScopeLabel(page.catalogScope), page.reason, "good"),
      metric("Writes", "Audited", "Create/update/archive/restore via server actions", "good"),
    ],
    liveData: {
      title: "Shop catalog data",
      description:
        pagination.totalCountStatus === "exact"
          ? "Only current page rows are rendered. Search and filters run server-side before count/range."
          : "Only current page rows are rendered. Search and filters run server-side across the catalog.",
      columns: [
        { key: "productId", label: "Product id", cellVariant: "code" },
        {
          key: "barcode",
          label: "Barcode",
          icon: "barcode",
          cellVariant: "code",
        },
        { key: "itemNumber", label: "Item number", cellVariant: "code" },
        {
          key: "productName",
          label: "Product name",
          icon: "package",
          cellVariant: "primary",
        },
        { key: "secondName", label: "Second name" },
        { key: "supplierName", label: "Supplier name" },
        { key: "categoryName", label: "Category name" },
        { key: "purchasePrice", label: "Purchase price" },
        { key: "retailPrice", label: "Retail price" },
        { key: "stockQuantity", label: "Stock quantity" },
        { key: "state", label: "State", icon: "archive", cellVariant: "state" },
        { key: "updatedArchived", label: "Updated / Archived at" },
      ],
      rows: page.products.map((product) =>
        productRow(product, categories, suppliers),
      ),
      emptyState: {
        title: "No shop catalog products are visible",
        description:
          "No active or archived product rows match the current server-side filters for this catalog scope.",
      },
    },
  };
}

function getProductDialog(action?: string) {
  if (action === "new") {
    return "newProduct" as const;
  }

  if (action === "archive") {
    return "archiveProduct" as const;
  }

  if (action === "restore") {
    return "restoreProduct" as const;
  }

  if (action === "import") {
    return "importSupplier" as const;
  }

  if (action === "export") {
    return "exportCatalog" as const;
  }

  if (action === "advanced") {
    return "advancedTransfer" as const;
  }

  return null;
}

function canOpenProductDialog(
  dialog: ReturnType<typeof getProductDialog>,
  permissions: {
    canExport: boolean;
    canImport: boolean;
    canManageProducts: boolean;
  },
) {
  switch (dialog) {
    case "newProduct":
    case "archiveProduct":
    case "restoreProduct":
      return permissions.canManageProducts;
    case "importSupplier":
    case "advancedTransfer":
      return permissions.canImport;
    case "exportCatalog":
      return permissions.canExport;
    default:
      return false;
  }
}

function buildProductActionHref(
  params: Record<string, string | string[] | undefined>,
  action: "archive" | "restore",
  productId: string,
) {
  const nextParams = new URLSearchParams();

  const requestedShopId = getParam(params, "shop_id");
  const searchQuery = getFirstParam(params, ["q", "search", "query"]);
  const categoryId = getFirstParam(params, ["category", "category_id"]);
  const supplierId = getFirstParam(params, ["supplier", "supplier_id"]);
  const state = normalizeState(getParam(params, "state"));
  const page = getParam(params, "page");
  const pageSize = normalizePageSize(getParam(params, "pageSize"));

  if (requestedShopId) {
    nextParams.set("shop_id", requestedShopId);
  }

  if (searchQuery) {
    nextParams.set("q", searchQuery);
  }

  if (categoryId) {
    nextParams.set("category", categoryId);
  }

  if (supplierId) {
    nextParams.set("supplier", supplierId);
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

  nextParams.set("product_action", action);
  nextParams.set("product_id", productId);

  return `/shop/products?${nextParams.toString()}`;
}

function buildProductDetailHref(
  params: Record<string, string | string[] | undefined>,
  productId: string,
) {
  const nextParams = new URLSearchParams();

  const requestedShopId = getParam(params, "shop_id");
  const searchQuery = getFirstParam(params, ["q", "search", "query"]);
  const categoryId = getFirstParam(params, ["category", "category_id"]);
  const supplierId = getFirstParam(params, ["supplier", "supplier_id"]);
  const state = normalizeState(getParam(params, "state"));
  const page = getParam(params, "page");
  const pageSize = normalizePageSize(getParam(params, "pageSize"));

  if (requestedShopId) {
    nextParams.set("shop_id", requestedShopId);
  }

  if (searchQuery) {
    nextParams.set("q", searchQuery);
  }

  if (categoryId) {
    nextParams.set("category", categoryId);
  }

  if (supplierId) {
    nextParams.set("supplier", supplierId);
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

  nextParams.set("product_action", "detail");
  nextParams.set("product_id", productId);

  return `/shop/products?${nextParams.toString()}`;
}

function buildProductGlobalActionHref(
  params: Record<string, string | string[] | undefined>,
  action: "advanced" | "export" | "import" | "new",
) {
  const nextParams = new URLSearchParams();

  const requestedShopId = getParam(params, "shop_id");
  const searchQuery = getFirstParam(params, ["q", "search", "query"]);
  const categoryId = getFirstParam(params, ["category", "category_id"]);
  const supplierId = getFirstParam(params, ["supplier", "supplier_id"]);
  const state = normalizeState(getParam(params, "state"));
  const page = getParam(params, "page");
  const pageSize = normalizePageSize(getParam(params, "pageSize"));

  if (requestedShopId) {
    nextParams.set("shop_id", requestedShopId);
  }

  if (searchQuery) {
    nextParams.set("q", searchQuery);
  }

  if (categoryId) {
    nextParams.set("category", categoryId);
  }

  if (supplierId) {
    nextParams.set("supplier", supplierId);
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

  nextParams.set("product_action", action);

  return `/shop/products?${nextParams.toString()}`;
}

function ProductRowActions({
  canManageProducts,
  labels,
  params,
  row,
}: {
  canManageProducts: boolean;
  labels: {
    archive: string;
    detail: string;
    restore: string;
  };
  params: Record<string, string | string[] | undefined>;
  row: AdminDataTableRow;
}) {
  if (!row.rowKey) {
    return null;
  }

  const productId = row.rowKey;
  const isArchived = row.isArchived === "true" || row.state === "Archived";
  const productLabel = row.productName || row.barcode || productId;
  const actions = canManageProducts
    ? isArchived
      ? [{ action: "restore" as const, icon: "restore" as const, label: labels.restore }]
      : [{ action: "archive" as const, icon: "archive" as const, label: labels.archive }]
    : [];

  return (
    <div
      className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end"
      data-product-action-toolbar
    >
      <a
        aria-label={`${labels.detail}: ${productLabel}`}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-900 px-3 text-sm font-medium text-white hover:bg-emerald-800 sm:h-8 sm:min-h-0 sm:w-auto sm:px-2.5 sm:text-xs"
        data-product-detail-id={productId}
        data-product-detail-trigger
        href={buildProductDetailHref(params, productId)}
      >
        <ProductsIcon name="eye" />
        {labels.detail}
      </a>
      {actions.map((item) => (
        <a
          key={item.action}
          aria-label={`${item.label}: ${productLabel}`}
          className={[
            "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border bg-white px-3 text-sm font-medium sm:h-8 sm:min-h-0 sm:w-auto sm:px-2.5 sm:text-xs",
            "border-amber-200 text-amber-900 hover:border-amber-400",
          ].join(" ")}
          href={buildProductActionHref(params, item.action, productId)}
        >
          <ProductsIcon name={item.icon} />
          {item.label}
        </a>
      ))}
    </div>
  );
}

function ProductCatalogToolbar({
  canExport,
  canImport,
  canManageProducts,
  labels,
  params,
}: {
  canExport: boolean;
  canImport: boolean;
  canManageProducts: boolean;
  labels: {
    advancedTransfer: string;
    exportCatalog: string;
    importSupplier: string;
    newProduct: string;
  };
  params: Record<string, string | string[] | undefined>;
}) {
  const actions: Array<{
    action: "advanced" | "export" | "import" | "new";
    icon: ProductsIconName;
    label: string;
  }> = [];

  if (canManageProducts) {
    actions.push({
      action: "new",
      icon: "package",
      label: labels.newProduct,
    });
  }

  if (canImport) {
    actions.push({
      action: "import",
      icon: "stock",
      label: labels.importSupplier,
    });
  }

  if (canExport) {
    actions.push({
      action: "export",
      icon: "barcode",
      label: labels.exportCatalog,
    });
  }

  if (canImport) {
    actions.push({
      action: "advanced",
      icon: "supplier",
      label: labels.advancedTransfer,
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end"
      data-product-catalog-command-bar
    >
      {actions.map((item) => (
        <a
          className="inline-flex min-h-11 w-full min-w-0 items-center justify-start gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:border-emerald-400 hover:text-emerald-800 sm:h-10 sm:w-auto sm:justify-center sm:py-0"
          href={buildProductGlobalActionHref(params, item.action)}
          key={item.action}
          role="button"
        >
          <ProductsIcon name={item.icon} />
          {item.label}
        </a>
      ))}
    </div>
  );
}

type ProductCatalogListLabels = {
  actions: string;
  archived: string;
  classification: string;
  codes: string;
  noPricingStock: string;
  pricingStock: string;
  productIdentity: string;
  statusUpdated: string;
  updated: string;
};

type ProductDisplayMetric = {
  icon: ProductsIconName;
  label: string;
  value: string;
};

function columnLabel(
  liveData: NonNullable<ShopSection["liveData"]>,
  key: string,
) {
  return liveData.columns.find((column) => column.key === key)?.label ?? key;
}

function compactMetricLabel(label: string, key: string) {
  switch (key) {
    case "purchasePrice":
      return "Purchase";
    case "retailPrice":
      return "Retail";
    case "stockQuantity":
      return "Stock";
    default:
      return label;
  }
}

function hasRowValue(row: AdminDataTableRow, key: string) {
  return row[key] === "true";
}

function rowString(row: AdminDataTableRow, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

function ProductMetric({
  icon,
  label,
  value,
}: {
  icon: ProductsIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5">
      <dt
        className="flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap text-xs font-medium tracking-normal text-zinc-500"
        title={label}
      >
        <ProductsIcon name={icon} />
        <span className="min-w-0 truncate">{label}</span>
      </dt>
      <dd
        className="line-clamp-1 min-w-0 break-words font-mono text-base font-semibold leading-5 text-zinc-950 [overflow-wrap:anywhere]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function ProductCodeBlock({
  barcode,
  barcodeLabel,
  itemNumber,
  itemNumberLabel,
  labels,
}: {
  barcode: string;
  barcodeLabel: string;
  itemNumber: string;
  itemNumberLabel: string;
  labels: ProductCatalogListLabels;
}) {
  return (
    <section
      className="min-w-0 rounded-md border border-zinc-200 bg-white p-2"
      data-product-cell="codes"
      data-product-codes
    >
      <h3 className="sr-only">{labels.codes}</h3>
      <dl className="grid min-w-0 gap-1.5">
        {[
          { icon: "barcode" as const, label: barcodeLabel, value: barcode },
          { icon: "tag" as const, label: itemNumberLabel, value: itemNumber },
        ].map((item) => (
          <div
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
            key={item.label}
          >
            <dt className="sr-only">{item.label}</dt>
            <dd
              aria-label={`${item.label}: ${item.value}`}
              className="flex min-w-0 items-center gap-1.5 font-mono text-xs leading-5 text-zinc-900"
              title={item.value}
            >
              <ProductsIcon name={item.icon} />
              <span className="line-clamp-1 min-w-0 break-words [overflow-wrap:anywhere]">
                {item.value}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProductClassificationBlock({
  categoryLabel,
  categoryName,
  labels,
  supplierLabel,
  supplierName,
}: {
  categoryLabel: string;
  categoryName: string;
  labels: ProductCatalogListLabels;
  supplierLabel: string;
  supplierName: string;
}) {
  return (
    <section
      className="min-w-0 rounded-md border border-zinc-200 bg-white p-2"
      data-product-cell="classification"
      data-product-classification
    >
      <h3 className="sr-only">{labels.classification}</h3>
      <dl className="grid min-w-0 gap-1.5">
        {[
          {
            icon: "supplier" as const,
            label: supplierLabel,
            value: supplierName,
          },
          {
            icon: "category" as const,
            label: categoryLabel,
            value: categoryName,
          },
        ].map((item) => (
          <div
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
            key={item.label}
          >
            <dt className="sr-only">{item.label}</dt>
            <dd
              aria-label={`${item.label}: ${item.value}`}
              className="flex min-w-0 items-center gap-1.5 text-sm leading-5 text-zinc-800"
              title={item.value}
            >
              <ProductsIcon name={item.icon} />
              <span className="line-clamp-1 min-w-0 break-words [overflow-wrap:anywhere]">
                {item.value}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProductPriceStockBlock({
  className = "",
  labels,
  metrics,
}: {
  className?: string;
  labels: ProductCatalogListLabels;
  metrics: ProductDisplayMetric[];
}) {
  return (
    <section
      className={[
        "min-w-0 rounded-md border border-zinc-200 bg-white p-2",
        className,
      ].join(" ")}
      data-product-cell="pricing-stock"
      data-product-pricing-stock
    >
      <h3 className="sr-only">{labels.pricingStock}</h3>
      {metrics.length > 0 ? (
        <dl className="grid min-w-0 gap-1.5 sm:grid-cols-3 md:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
          {metrics.map((metric) => (
            <ProductMetric
              icon={metric.icon}
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </dl>
      ) : (
        <p className="text-sm text-zinc-500">{labels.noPricingStock}</p>
      )}
    </section>
  );
}

function ProductStatusBlock({
  archivedAt,
  isArchived,
  labels,
  state,
  updatedArchived,
  updatedAt,
}: {
  archivedAt: string;
  isArchived: boolean;
  labels: ProductCatalogListLabels;
  state: string;
  updatedArchived: string;
  updatedAt: string;
}) {
  const dateValue = (isArchived ? archivedAt : updatedAt) || updatedArchived;

  return (
    <section
      className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end"
      data-product-cell="status"
      data-product-status
    >
      <h3 className="sr-only">{labels.statusUpdated}</h3>
      <span
        className={[
          "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold",
          isArchived
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800",
        ].join(" ")}
      >
        <ProductsIcon name={isArchived ? "archive" : "package"} />
        {state}
      </span>
      <span
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs leading-5 text-zinc-600"
        title={dateValue}
      >
        <ProductsIcon name="clock" />
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          {dateValue}
        </span>
      </span>
    </section>
  );
}

function ProductCatalogList({
  labels,
  liveData,
  rowActions,
}: {
  labels: ProductCatalogListLabels;
  liveData: NonNullable<ShopSection["liveData"]>;
  rowActions?: {
    label: string;
    render: (row: AdminDataTableRow) => ReactNode;
  };
}) {
  if (liveData.rows.length === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">{liveData.emptyState.title}</p>
        <p className="mt-1 leading-6">{liveData.emptyState.description}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-product-catalog-list role="list">
      {liveData.rows.map((row) => {
        const isArchived = hasRowValue(row, "isArchived");
        const archivedAt = rowString(row, "archivedAt");
        const barcode = rowString(row, "barcode");
        const categoryName = rowString(row, "categoryName");
        const itemNumber = rowString(row, "itemNumber");
        const productId = rowString(row, "productId");
        const productName = rowString(row, "productName");
        const purchasePrice = rowString(row, "purchasePrice");
        const retailPrice = rowString(row, "retailPrice");
        const secondName = rowString(row, "secondName");
        const state = rowString(row, "state");
        const stockQuantity = rowString(row, "stockQuantity");
        const supplierName = rowString(row, "supplierName");
        const updatedArchived = rowString(row, "updatedArchived");
        const updatedAt = rowString(row, "updatedAt");
        const pricingMetricCandidates: Array<ProductDisplayMetric | null> = [];

        if (hasRowValue(row, "hasPurchasePrice")) {
          pricingMetricCandidates.push({
            icon: "price",
            label: compactMetricLabel(
              columnLabel(liveData, "purchasePrice"),
              "purchasePrice",
            ),
            value: purchasePrice,
          });
        }

        if (hasRowValue(row, "hasRetailPrice")) {
          pricingMetricCandidates.push({
            icon: "price",
            label: compactMetricLabel(
              columnLabel(liveData, "retailPrice"),
              "retailPrice",
            ),
            value: retailPrice,
          });
        }

        if (hasRowValue(row, "hasStockQuantity")) {
          pricingMetricCandidates.push({
            icon: "stock",
            label: compactMetricLabel(
              columnLabel(liveData, "stockQuantity"),
              "stockQuantity",
            ),
            value: stockQuantity,
          });
        }

        const pricingMetrics = pricingMetricCandidates.filter(
          (metric): metric is ProductDisplayMetric => metric !== null,
        );

        return (
          <article
            className="grid min-w-0 gap-2.5 rounded-md border border-zinc-200 bg-white p-3 shadow-sm [contain-intrinsic-size:180px] [content-visibility:auto]"
            data-product-catalog-row
            key={row.rowKey}
            role="listitem"
          >
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
              <section
                className="flex min-w-0 items-start gap-3"
                data-product-cell="identity"
                data-product-identity
              >
                <h3 className="sr-only">{labels.productIdentity}</h3>
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  <ProductsIcon name="package" />
                </span>
                <div className="min-w-0">
                  <p
                    className="line-clamp-2 break-words text-base font-semibold leading-6 text-zinc-950 [overflow-wrap:anywhere]"
                    title={productName}
                  >
                    {productName}
                  </p>
                  {hasRowValue(row, "hasSecondName") ? (
                    <p
                      className="line-clamp-1 break-words text-sm leading-5 text-zinc-600 [overflow-wrap:anywhere]"
                      title={secondName}
                    >
                      {secondName}
                    </p>
                  ) : null}
                  <p
                    aria-label={`${columnLabel(liveData, "productId")}: ${productId}`}
                    className="mt-1 break-words font-mono text-[0.7rem] tracking-normal text-zinc-500 [overflow-wrap:anywhere]"
                    title={productId}
                  >
                    {productId}
                  </p>
                </div>
              </section>

              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start xl:min-w-[18rem] xl:justify-items-end">
                <ProductStatusBlock
                  archivedAt={archivedAt}
                  isArchived={isArchived}
                  labels={labels}
                  state={state}
                  updatedArchived={updatedArchived}
                  updatedAt={updatedAt}
                />
                {rowActions ? (
                  <section
                    className="min-w-0 sm:justify-self-end"
                    data-product-actions
                    data-product-cell="actions"
                  >
                    <h3 className="sr-only">{rowActions.label}</h3>
                    {rowActions.render(row)}
                  </section>
                ) : null}
              </div>
            </div>

            <div className="grid min-w-0 gap-2.5 md:grid-cols-2 min-[1400px]:grid-cols-[minmax(11.5rem,0.85fr)_minmax(11.5rem,0.85fr)_minmax(17rem,1.2fr)]">
              <ProductCodeBlock
                barcode={barcode}
                barcodeLabel={columnLabel(liveData, "barcode")}
                itemNumber={itemNumber}
                itemNumberLabel={columnLabel(liveData, "itemNumber")}
                labels={labels}
              />
              <ProductClassificationBlock
                categoryLabel={columnLabel(liveData, "categoryName")}
                categoryName={categoryName}
                labels={labels}
                supplierLabel={columnLabel(liveData, "supplierName")}
                supplierName={supplierName}
              />
              <ProductPriceStockBlock
                className="md:col-span-2 min-[1400px]:col-span-1"
                labels={labels}
                metrics={pricingMetrics}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProductsPagination({
  id,
  labels,
  page,
  placement,
  requestedShopId,
}: {
  id: string;
  labels: {
    applyPage: string;
    first: string;
    goToPage: string;
    last: string;
    next: string;
    of: string;
    page: string;
    pagination: string;
    previous: string;
    rowsOnThisPage: string;
  };
  page: ShopInventoryProductsPage;
  placement: "top" | "bottom";
  requestedShopId?: string | null;
}) {
  const { filters, pagination } = page;
  const previousPage = Math.max(1, pagination.page - 1);
  const nextPage =
    pagination.totalCountStatus === "exact"
      ? Math.min(pagination.totalPages, pagination.page + 1)
      : pagination.page + 1;
  const hasPrevious = pagination.hasPreviousPage;
  const hasNext = pagination.hasNextPage;
  const hasExactTotal = pagination.totalCountStatus === "exact";
  const pageAriaLabel = labels.page.toLocaleLowerCase();
  const baseLinkInput = {
    categoryId: filters.categoryId,
    pageSize: pagination.pageSize,
    query: filters.query,
    requestedShopId,
    state: filters.state,
    supplierId: filters.supplierId,
  };
  const hiddenFields = [
    requestedShopId ? ["shop_id", requestedShopId] : null,
    filters.query ? ["q", filters.query] : null,
    filters.categoryId ? ["category", filters.categoryId] : null,
    filters.supplierId ? ["supplier", filters.supplierId] : null,
    filters.state !== "active" ? ["state", filters.state] : null,
    pagination.pageSize !== 10 ? ["pageSize", String(pagination.pageSize)] : null,
  ].filter((field): field is [string, string] => Boolean(field));

  return (
    <nav
      aria-label={`${labels.pagination} ${placement}`}
      className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm xl:flex-row xl:items-center xl:justify-between`}
    >
      <div className="min-w-0">
        <p className="font-medium text-zinc-900">
          {formatRange(page)} · {labels.page} {pagination.page}
          {hasExactTotal
            ? ` ${labels.of} ${pagination.totalPages}`
            : hasNext
              ? ` ${labels.of} ${pagination.totalPages}+`
              : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {labels.rowsOnThisPage}: {pagination.currentPageRows}
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-2 items-stretch gap-2 sm:flex sm:flex-wrap sm:items-end">
        {hasPrevious ? (
          <a
            aria-label={`${labels.first}: ${pageAriaLabel} 1`}
            className={`${filterButtonClassName} hidden border border-zinc-300 text-zinc-800 hover:border-emerald-400 hover:text-emerald-800 sm:inline-flex`}
            href={buildProductsHref({
              ...baseLinkInput,
              page: 1,
            })}
          >
            <ProductsIcon name="chevronLeft" />
            {labels.first}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className={`${filterButtonClassName} hidden border border-zinc-200 text-zinc-400 sm:inline-flex`}
          >
            <ProductsIcon name="chevronLeft" />
            {labels.first}
          </span>
        )}
        {hasPrevious ? (
          <a
            aria-label={`${labels.previous}: ${pageAriaLabel} ${previousPage}`}
            className={`${filterButtonClassName} w-full border border-zinc-300 text-zinc-800 hover:border-emerald-400 hover:text-emerald-800 sm:w-auto`}
            href={buildProductsHref({
              ...baseLinkInput,
              page: previousPage,
            })}
          >
            {labels.previous}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className={`${filterButtonClassName} w-full border border-zinc-200 text-zinc-400 sm:w-auto`}
          >
            {labels.previous}
          </span>
        )}
        <form
          action="/shop/products"
          className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:flex-wrap"
        >
          {hiddenFields.map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {labels.goToPage}
            <input
              className="h-11 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none sm:h-10 sm:w-24"
              defaultValue={String(pagination.page)}
              id={id}
              inputMode="numeric"
              max={hasExactTotal ? pagination.totalPages : undefined}
              min={1}
              name="page"
              required
              type="number"
            />
          </label>
          <button
            className={`${filterButtonClassName} border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-400 hover:text-emerald-800`}
            type="submit"
          >
            {labels.applyPage}
          </button>
        </form>
        {hasNext ? (
          <a
            aria-label={`${labels.next}: ${pageAriaLabel} ${nextPage}`}
            className={`${filterButtonClassName} w-full border border-zinc-300 text-zinc-800 hover:border-emerald-400 hover:text-emerald-800 sm:w-auto`}
            href={buildProductsHref({
              ...baseLinkInput,
              page: nextPage,
            })}
          >
            {labels.next}
            <ProductsIcon name="chevronRight" />
          </a>
        ) : (
          <span
            aria-disabled="true"
            className={`${filterButtonClassName} w-full border border-zinc-200 text-zinc-400 sm:w-auto`}
          >
            {labels.next}
            <ProductsIcon name="chevronRight" />
          </span>
        )}
        {hasExactTotal && hasNext ? (
          <a
            aria-label={`${labels.last}: ${pageAriaLabel} ${pagination.totalPages}`}
            className={`${filterButtonClassName} hidden border border-zinc-300 text-zinc-800 hover:border-emerald-400 hover:text-emerald-800 sm:inline-flex`}
            href={buildProductsHref({
              ...baseLinkInput,
              page: pagination.totalPages,
            })}
          >
            {labels.last}
            <ProductsIcon name="chevronRight" />
          </a>
        ) : (
          <span
            aria-disabled="true"
            className={`${filterButtonClassName} hidden border border-zinc-200 text-zinc-400 sm:inline-flex`}
          >
            {labels.last}
            <ProductsIcon name="chevronRight" />
          </span>
        )}
      </div>
    </nav>
  );
}

export default async function ShopProductsPage({
  searchParams,
}: {
  searchParams: ShopPageSearchParams;
}) {
  const { dictionary } = await getI18n();
  const params = await searchParams;
  const requestedShopId = getParam(params, "shop_id");
  const selectedQuery = getFirstParam(params, ["q", "search", "query"]) ?? "";
  const selectedCategoryId =
    getFirstParam(params, ["category", "category_id"]) ?? "";
  const selectedSupplierId =
    getFirstParam(params, ["supplier", "supplier_id"]) ?? "";
  const selectedState = normalizeState(getParam(params, "state"));
  const selectedPage = getParam(params, "page") ?? "1";
  const selectedPageSize = normalizePageSize(getParam(params, "pageSize"));
  const activeFilterCount = [
    selectedQuery,
    selectedCategoryId,
    selectedSupplierId,
    selectedState === "active" ? undefined : selectedState,
  ].filter((value) => Boolean(value?.trim())).length;
  const perfTrace = createAdminWebPerfTrace("shop.products", {
    activeFilterCount,
    hasRequestedShopId: Boolean(requestedShopId),
    pageSize: selectedPageSize,
    route: "/shop/products",
    state: selectedState,
  });
  const [productsPage, catalogOptions, pageAccess] = await Promise.all([
    perfTrace.time("getShopInventoryProductsPage", () =>
      getShopInventoryProductsPage({
        filters: {
          categoryId: selectedCategoryId,
          query: selectedQuery,
          state: selectedState,
          supplierId: selectedSupplierId,
        },
        includeExactTotals: "count-only",
        page: selectedPage,
        pageSize: selectedPageSize,
        perfTrace,
        requestedShopId,
      }),
    ),
    perfTrace.time("getShopCatalogOptionsReadModel", () =>
      getShopCatalogOptionsReadModel({ perfTrace, requestedShopId }),
    ),
    perfTrace.time("resolveShopPageAccessBundle", () =>
      resolveShopPageAccessBundle(requestedShopId),
    ),
  ]);
  const canManageProducts =
    pageAccess.status === "ready" && pageAccess.canManageProducts;
  const canImport = pageAccess.status === "ready" && pageAccess.canImport;
  const canExport = pageAccess.status === "ready" && pageAccess.canExport;
  const selectedShopId =
    pageAccess.status === "ready"
      ? pageAccess.selectedShop.shopId
      : (productsPage.selectedShop?.shopId ?? requestedShopId);
  const productDialog = getProductDialog(getParam(params, "product_action"));
  const canOpenRequestedProductDialog = canOpenProductDialog(productDialog, {
    canExport,
    canImport,
    canManageProducts,
  });
  const {
    archivedProductCatalogOptions,
    categoryOptions,
    productCatalogOptions,
    supplierOptions,
  } = await perfTrace.time("mapCatalogOptionsForClient", async () => ({
    archivedProductCatalogOptions: canOpenRequestedProductDialog
      ? mapProductOptions(
          productsPage.products.filter((product) => Boolean(product.deletedAt)),
        )
      : [],
    categoryOptions: mapCategoryOptions(catalogOptions.categories),
    productCatalogOptions: canOpenRequestedProductDialog
      ? mapProductOptions(
          productsPage.products.filter((product) => !product.deletedAt),
        )
      : [],
    supplierOptions: mapSupplierOptions(catalogOptions.suppliers),
  }));
  const section = await perfTrace.time("buildProductsPageSection", async () =>
    buildProductsPageSection({
      activeFilterCount,
      categories: catalogOptions.categories,
      page: productsPage,
      suppliers: catalogOptions.suppliers,
    }),
  );
  const productDialogId = getParam(params, "product_id") ?? "";
  const rowActionLabels = {
    archive: translateText(dictionary, "Archive"),
    detail: translateText(dictionary, "Detail"),
    restore: translateText(dictionary, "Restore"),
  };
  const paginationLabels = {
    applyPage: translateText(dictionary, "Go"),
    first: translateText(dictionary, "First"),
    goToPage: translateText(dictionary, "Go to page"),
    last: translateText(dictionary, "Last"),
    next: translateText(dictionary, "Next"),
    of: translateText(dictionary, "of"),
    page: translateText(dictionary, "Page"),
    pagination: translateText(dictionary, "Products pagination"),
    previous: translateText(dictionary, "Previous"),
    rowsOnThisPage: translateText(dictionary, "Rows on this page"),
  };
  const catalogListLabels = {
    actions: dictionary.common.actions,
    archived: translateText(dictionary, "Archived"),
    classification: translateText(dictionary, "Classification"),
    codes: translateText(dictionary, "Codes"),
    noPricingStock: translateText(dictionary, "No pricing or stock values"),
    pricingStock: translateText(dictionary, "Pricing / stock"),
    productIdentity: translateText(dictionary, "Product identity"),
    statusUpdated: translateText(dictionary, "Status / updated"),
    updated: translateText(dictionary, "Updated"),
  };
  const catalogToolbarLabels = {
    advancedTransfer: translateText(dictionary, "Database transfer"),
    exportCatalog: translateText(dictionary, "Export catalog Excel"),
    importSupplier: translateText(dictionary, "Import supplier Excel"),
    newProduct: translateText(dictionary, "New product"),
  };
  const filterLabels: Dictionary["shopFilters"] = dictionary.shopFilters;
  let catalogCommandBar: ReactNode = null;
  let catalogDialogPanel: ReactNode = null;

  if (productDialog && canOpenRequestedProductDialog) {
    const { CatalogActionPanel } = await import(
      "@/app/shop/_components/CatalogActionPanel"
    );

    catalogDialogPanel = (
      <CatalogActionPanel
        archivedProducts={archivedProductCatalogOptions}
        authPrincipalKind={
          pageAccess.status === "ready"
            ? pageAccess.principalKind
            : undefined
        }
        canExport={canExport}
        canImport={canImport}
        canManage={canManageProducts}
        categories={categoryOptions}
        embedded
        initialDialog={productDialog}
        initialEntityId={productDialogId}
        labels={dictionary.exact}
        products={productCatalogOptions}
        scope="products"
        selectedShopId={selectedShopId ?? undefined}
        suppliers={supplierOptions}
      />
    );
  } else if (canManageProducts || canImport || canExport) {
    catalogCommandBar = (
      <ProductCatalogToolbar
        canExport={canExport}
        canImport={canImport}
        canManageProducts={canManageProducts}
        labels={catalogToolbarLabels}
        params={params}
      />
    );
  }

  perfTrace.flush({
    catalogOptionRows:
      catalogOptions.categories.length + catalogOptions.suppliers.length,
    catalogOptionsStatus: catalogOptions.status,
    catalogOptionsBytes: jsonByteLength(catalogOptions),
    categoryOptions: categoryOptions.length,
    clientProductOptions:
      productCatalogOptions.length + archivedProductCatalogOptions.length,
    dialogLoaded: Boolean(productDialog),
    estimatedSectionBytes: jsonByteLength(section),
    liveDataColumns: section.liveData?.columns.length ?? 0,
    liveDataRows: section.liveData?.rows.length ?? 0,
    pageRows: productsPage.pagination.currentPageRows,
    productsPageBytes: jsonByteLength(productsPage),
    productsStatus: productsPage.status,
    supplierOptions: supplierOptions.length,
    totalCount: productsPage.pagination.totalCount,
    totalCountStatus: productsPage.pagination.totalCountStatus,
    hasNextPage: productsPage.pagination.hasNextPage,
  });

  return (
    <div className="grid gap-5">
      <ShopSectionPage
        beforeLiveData={
          <>
            <form
              action="/shop/products"
              className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 shadow-sm"
              method="get"
            >
              {requestedShopId ? (
                <input name="shop_id" type="hidden" value={requestedShopId} />
              ) : null}
              <input name="page" type="hidden" value="1" />
              <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-950">
                    {translateText(dictionary, "Search and filters")}
                  </p>
                  {activeFilterCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                      <ProductsIcon name="filter" />
                      {translateText(dictionary, "Filters active")}:{" "}
                      {activeFilterCount}
                    </span>
                  ) : null}
                </div>
                {catalogCommandBar}
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(14rem,1.35fr)_minmax(0,170px)_minmax(0,170px)_minmax(0,132px)_minmax(0,112px)_auto] md:items-end">
                <label className={filterLabelClassName}>
                  <span className="inline-flex items-center gap-1.5">
                    <ProductsIcon name="search" />
                    {filterLabels.search}
                  </span>
                  <ProductSearchCombobox
                    defaultValue={selectedQuery}
                    inputClassName={filterInputClassName}
                    loadingLabel={translateText(dictionary, "Loading suggestions")}
                    noResultsLabel={translateText(dictionary, "No matching products")}
                    placeholder={filterLabels.searchPlaceholder}
                    purchaseLabel={translateText(dictionary, "Purchase")}
                    retailLabel={translateText(dictionary, "Retail")}
                    stockLabel={translateText(dictionary, "Stock")}
                    suggestionsLabel={translateText(dictionary, "Product suggestions")}
                  />
                </label>
                <label className={filterLabelClassName}>
                  {filterLabels.category}
                  <select
                    className={filterInputClassName}
                    defaultValue={selectedCategoryId}
                    name="category"
                  >
                    <option value="">{filterLabels.allCategories}</option>
                    {categoryOptions.map((category) => (
                      <option
                        key={category.categoryId}
                        value={category.categoryId}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={filterLabelClassName}>
                  {filterLabels.supplier}
                  <select
                    className={filterInputClassName}
                    defaultValue={selectedSupplierId}
                    name="supplier"
                  >
                    <option value="">{filterLabels.allSuppliers}</option>
                    {supplierOptions.map((supplier) => (
                      <option
                        key={supplier.supplierId}
                        value={supplier.supplierId}
                      >
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={filterLabelClassName}>
                  {filterLabels.state}
                  <select
                    className={filterInputClassName}
                    defaultValue={selectedState}
                    name="state"
                  >
                    <option value="active">
                      {translateText(dictionary, "Active")}
                    </option>
                    <option value="archived">{filterLabels.archived}</option>
                    <option value="all">{filterLabels.allStates}</option>
                  </select>
                </label>
                <label className={filterLabelClassName}>
                  {translateText(dictionary, "Page size")}
                  <select
                    className={filterInputClassName}
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
                <div className="grid min-w-0 grid-cols-2 items-end gap-2 self-end md:flex md:flex-wrap">
                  <button
                    className={`${filterButtonClassName} w-full bg-zinc-950 text-white hover:bg-zinc-800 md:w-auto`}
                    type="submit"
                  >
                    <ProductsIcon name="filter" />
                    {dictionary.common.applyFilters}
                  </button>
                  <a
                    className={`${filterButtonClassName} w-full border border-zinc-300 text-zinc-800 hover:border-emerald-400 hover:text-emerald-800 md:w-auto`}
                    href={buildClearFiltersHref(
                      requestedShopId,
                      selectedPageSize,
                    )}
                  >
                    {translateText(dictionary, "Reset filters")}
                  </a>
                </div>
              </div>
            </form>
            {catalogDialogPanel}
            <ProductDetailModalController
              canManageProducts={canManageProducts}
              categories={categoryOptions}
              labels={dictionary.exact}
              requestedShopId={requestedShopId}
              selectedShopId={selectedShopId}
              suppliers={supplierOptions}
            />
            <HistoryDetailModalController
              labels={dictionary.exact}
              requestedShopId={requestedShopId}
            />
            <ActionResultBanner
              action={getParam(params, "action")}
              result={getParam(params, "result")}
            />
            <ProductsPagination
              id="products-page-jump-top"
              labels={paginationLabels}
              page={productsPage}
              placement="top"
              requestedShopId={requestedShopId}
            />
          </>
        }
        renderLiveData={({ liveData, rowActions }) => (
          <ProductCatalogList
            labels={catalogListLabels}
            liveData={liveData}
            rowActions={rowActions}
          />
        )}
        rowActions={{
          label: dictionary.common.actions,
          render: (row) => (
            <ProductRowActions
              canManageProducts={canManageProducts}
              labels={rowActionLabels}
              params={params}
              row={row}
            />
          ),
        }}
        section={section}
      />
      <ProductsPagination
        id="products-page-jump-bottom"
        labels={paginationLabels}
        page={productsPage}
        placement="bottom"
        requestedShopId={requestedShopId}
      />
    </div>
  );
}
