import "server-only";

import type { AdminWebPerfTrace } from "@/server/admin-web-perf";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type InventorySourceRow = Pick<
  Tables<"shop_inventory_sources">,
  | "shop_inventory_source_id"
  | "shop_id"
  | "owner_user_id"
  | "mapping_state"
  | "source_kind"
  | "verified_at"
>;
type ProductRow = Pick<
  Tables<"inventory_products">,
  | "id"
  | "barcode"
  | "item_number"
  | "product_name"
  | "second_product_name"
  | "purchase_price"
  | "retail_price"
  | "shop_id"
  | "stock_quantity"
  | "supplier_id"
  | "category_id"
  | "deleted_at"
  | "updated_at"
>;
type CategoryRow = Pick<
  Tables<"inventory_categories">,
  "deleted_at" | "id" | "name" | "shop_id" | "updated_at"
>;
type SupplierRow = Pick<
  Tables<"inventory_suppliers">,
  "deleted_at" | "id" | "name" | "shop_id" | "updated_at"
>;
type PriceRow = Pick<
  Tables<"inventory_product_prices">,
  | "id"
  | "product_id"
  | "type"
  | "price"
  | "effective_at"
  | "note"
  | "source"
  | "created_at"
  | "shop_id"
>;

export type ShopInventoryReadModelStatus =
  | ShopAdminReadModelStatus
  | "unmapped";

export type ShopInventoryMapping = {
  mappingState: string;
  mappingId: string;
  ownerUserId: string;
  sourceKind: string;
  verifiedAt: string | null;
};

export type ShopInventoryCatalogScope =
  | "blocked"
  | "legacy_owner_bridge"
  | "shop_scoped";

export type ShopInventoryProduct = {
  productId: string;
  barcode: string;
  itemNumber: string | null;
  productName: string | null;
  secondProductName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  stockQuantity: number | null;
  supplierId: string | null;
  categoryId: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

export type ShopInventoryCategory = {
  activeProductsCount: number;
  categoryId: string;
  deletedAt: string | null;
  name: string;
  updatedAt: string;
};

export type ShopInventorySupplier = {
  activeProductsCount: number;
  deletedAt: string | null;
  supplierId: string;
  name: string;
  updatedAt: string;
};

export type ShopInventoryPrice = {
  priceId: string;
  productId: string;
  type: string;
  price: number;
  effectiveAt: string;
  note: string | null;
  source: string | null;
  createdAt: string;
};

export type ShopInventoryCatalogSummary = {
  activeProducts: number;
  archivedProducts: number;
  categories: number;
  priceRows: number;
  productsTotal: number;
  suppliers: number;
};

export type ShopInventoryReadModel = {
  catalogScope: ShopInventoryCatalogScope;
  legacyOwnerUserId: string | null;
  status: ShopInventoryReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopInventoryMapping | null;
  products: readonly ShopInventoryProduct[];
  archivedProducts: readonly ShopInventoryProduct[];
  categories: readonly ShopInventoryCategory[];
  suppliers: readonly ShopInventorySupplier[];
  prices: readonly ShopInventoryPrice[];
  summary: ShopInventoryCatalogSummary;
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

export type ShopInventoryProductStateFilter = "active" | "archived" | "all";

export type ShopInventoryProductsPageFilters = {
  categoryId?: string | null;
  query?: string | null;
  state?: ShopInventoryProductStateFilter | string | null;
  supplierId?: string | null;
};

export type ShopInventoryProductsPage = {
  catalogScope: ShopInventoryCatalogScope;
  legacyOwnerUserId: string | null;
  status: ShopInventoryReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopInventoryMapping | null;
  products: readonly ShopInventoryProduct[];
  filters: {
    categoryId: string | null;
    query: string | null;
    state: ShopInventoryProductStateFilter;
    supplierId: string | null;
  };
  summary: ShopInventoryCatalogSummary;
  pagination: {
    currentPageRows: number;
    from: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: 10 | 25 | 50 | 100 | 200;
    rangeEnd: number;
    rangeStart: number;
    to: number;
    totalCount: number;
    totalCountStatus: "deferred" | "exact";
    totalPages: number;
  };
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

export type ShopCatalogOptionsReadModel = {
  catalogScope: ShopInventoryCatalogScope;
  legacyOwnerUserId: string | null;
  status: ShopInventoryReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  mapping: ShopInventoryMapping | null;
  categories: readonly ShopInventoryCategory[];
  suppliers: readonly ShopInventorySupplier[];
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

export type ShopInventoryCatalogEntityStateFilter =
  | "active"
  | "archived"
  | "all";

export type ShopInventoryCatalogEntityPageFilters = {
  query?: string | null;
  state?: ShopInventoryCatalogEntityStateFilter | string | null;
};

export type ShopCatalogEntityPageReadModel = ShopCatalogOptionsReadModel & {
  filters: {
    query: string | null;
    state: ShopInventoryCatalogEntityStateFilter;
  };
  pagination: {
    currentPageRows: number;
    from: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: 10 | 25 | 50 | 100 | 200;
    rangeEnd: number;
    rangeStart: number;
    to: number;
    totalCount: number;
    totalCountStatus: "deferred" | "exact";
    totalPages: number;
  };
};

export type ShopInventoryProductsByCodesReadModel = {
  catalogScope: ShopInventoryCatalogScope;
  legacyOwnerUserId: string | null;
  mapping: ShopInventoryMapping | null;
  products: readonly ShopInventoryProduct[];
  readOnly: true;
  reason: string;
  selectedShop: ShopAdminShellShop | null;
  source: "supabase_server";
  status: ShopInventoryReadModelStatus;
};

type GetShopInventoryReadModelOptions = {
  client?: SupabaseServerClient | null;
  perfTrace?: AdminWebPerfTrace;
  requestedShopId?: string | null;
  rowLimit?: number | "all";
};

type GetShopInventoryProductsPageOptions = {
  client?: SupabaseServerClient | null;
  filters?: ShopInventoryProductsPageFilters;
  includeExactTotals?: boolean;
  page?: number | string | null;
  pageSize?: number | string | null;
  perfTrace?: AdminWebPerfTrace;
  requestedShopId?: string | null;
};

type GetShopCatalogOptionsReadModelOptions = {
  client?: SupabaseServerClient | null;
  perfTrace?: AdminWebPerfTrace;
  requestedShopId?: string | null;
};

type GetShopCatalogEntityPageReadModelOptions =
  GetShopCatalogOptionsReadModelOptions & {
    filters?: ShopInventoryCatalogEntityPageFilters;
    includeExactTotals?: boolean;
    page?: number | string | null;
    pageSize?: number | string | null;
  };

type CatalogEntityKind = "categories" | "suppliers";

type GetShopInventoryProductDetailOptions = {
  client?: SupabaseServerClient | null;
  productId: string;
  requestedShopId?: string | null;
};

type GetShopInventoryProductsByCodesOptions = {
  client?: SupabaseServerClient | null;
  codes: readonly string[];
  requestedShopId?: string | null;
};

type InventoryRowsResult<Row> = {
  data: Row[];
  error: unknown | null;
};

type PagedInventoryQuery<Row> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: unknown | null;
  }>;
};

type CountResult = {
  count: number | null;
  error: unknown | null;
};

type InventoryCountQuery = {
  eq: (column: string, value: string) => InventoryCountQuery;
  is: (column: string, value: null) => InventoryCountQuery;
  not: (column: string, operator: string, value: null) => InventoryCountQuery;
} & PromiseLike<CountResult>;

type InventoryCountTable = {
  select: (
    columns: string,
    options: {
      count: "exact";
      head: true;
    },
  ) => InventoryCountQuery;
};

type ProductPageQuery = {
  eq: (column: string, value: string) => ProductPageQuery;
  in: (column: string, values: string[]) => ProductPageQuery;
  is: (column: string, value: null) => ProductPageQuery;
  not: (column: string, operator: string, value: null) => ProductPageQuery;
  or: (filters: string) => ProductPageQuery;
  order: (
    column: string,
    options: {
      ascending: boolean;
    },
  ) => ProductPageQuery;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    count: number | null;
    data: ProductRow[] | null;
    error: unknown | null;
  }>;
};

type ProductPageTable = {
  select: (
    columns: string,
    options?: {
      count: "exact";
    },
  ) => ProductPageQuery;
};

type CatalogEntityProductCountRow = {
  category_id?: string | null;
  supplier_id?: string | null;
  count?: number | string | null;
};

type CatalogEntityProductCountQuery = PromiseLike<{
  data: CatalogEntityProductCountRow[] | null;
  error: unknown | null;
}> & {
  eq: (
    column: string,
    value: string,
  ) => CatalogEntityProductCountQuery;
  in: (
    column: string,
    values: string[],
  ) => CatalogEntityProductCountQuery;
  is: (
    column: string,
    value: null,
  ) => CatalogEntityProductCountQuery;
};

type CatalogEntityProductCountTable = {
  select: (columns: string) => CatalogEntityProductCountQuery;
};

type CatalogEntityPageQuery<Row> = {
  eq: (column: string, value: string) => CatalogEntityPageQuery<Row>;
  ilike: (column: string, pattern: string) => CatalogEntityPageQuery<Row>;
  is: (column: string, value: null) => CatalogEntityPageQuery<Row>;
  not: (
    column: string,
    operator: string,
    value: null,
  ) => CatalogEntityPageQuery<Row>;
  order: (
    column: string,
    options: {
      ascending: boolean;
    },
  ) => CatalogEntityPageQuery<Row>;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    count: number | null;
    data: Row[] | null;
    error: unknown | null;
  }>;
};

type CatalogEntityPageTable<Row> = {
  select: (
    columns: string,
    options?: {
      count: "exact";
    },
  ) => CatalogEntityPageQuery<Row>;
};

type ProductCodeLookupQuery = {
  eq: (column: string, value: string) => ProductCodeLookupQuery;
  in: (column: string, values: readonly string[]) => ProductCodeLookupQuery;
  is: (column: string, value: null) => ProductCodeLookupQuery;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: ProductRow[] | null;
    error: unknown | null;
  }>;
};

type ProductCodeLookupTable = {
  select: (columns: string) => ProductCodeLookupQuery;
};

type InventoryDetailQuery<Row> = {
  eq: (column: string, value: string) => InventoryDetailQuery<Row>;
  is: (column: string, value: null) => InventoryDetailQuery<Row>;
  order: (
    column: string,
    options: {
      ascending: boolean;
    },
  ) => InventoryDetailQuery<Row>;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: unknown | null;
  }>;
};

type InventoryDetailTable<Row> = {
  select: (columns: string) => InventoryDetailQuery<Row>;
};

const INVENTORY_READ_MODEL_PAGE_SIZE = 1_000;
const INVENTORY_PRODUCTS_PAGE_SIZES = [10, 25, 50, 100, 200] as const;
const INVENTORY_CATALOG_ENTITY_PAGE_SIZES = [10, 25, 50, 100, 200] as const;
const INVENTORY_PRODUCTS_CODE_LOOKUP_LIMIT = 40;
const CATALOG_ENTITY_PRODUCT_METRIC_SCAN_PAGE_SIZE = 1_000;
const CATALOG_ENTITY_PRODUCT_METRIC_SCAN_MAX_ROWS = 200_000;

const emptySummary: ShopInventoryCatalogSummary = {
  activeProducts: 0,
  archivedProducts: 0,
  categories: 0,
  priceRows: 0,
  productsTotal: 0,
  suppliers: 0,
};

const emptyRows = {
  catalogScope: "blocked" as ShopInventoryCatalogScope,
  legacyOwnerUserId: null,
  selectedShop: null,
  mapping: null,
  products: [],
  archivedProducts: [],
  categories: [],
  suppliers: [],
  prices: [],
  summary: emptySummary,
} as const;

function redactInventoryReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "inventory_read_error";

  return {
    code,
    message: "Shop inventory read model could not be loaded.",
  };
}

function mapMapping(row: InventorySourceRow): ShopInventoryMapping | null {
  if (!row.owner_user_id) {
    return null;
  }

  return {
    mappingState: row.mapping_state,
    mappingId: row.shop_inventory_source_id,
    ownerUserId: row.owner_user_id,
    sourceKind: row.source_kind,
    verifiedAt: row.verified_at,
  };
}

function isMappedMobileOwnerSource(mapping: ShopInventoryMapping | null) {
  return (
    mapping?.mappingState === "mapped" &&
    mapping.sourceKind === "mobile_owner" &&
    Boolean(mapping.ownerUserId)
  );
}

function mapProduct(row: ProductRow): ShopInventoryProduct {
  return {
    productId: row.id,
    barcode: row.barcode,
    itemNumber: row.item_number,
    productName: row.product_name,
    secondProductName: row.second_product_name,
    purchasePrice: row.purchase_price,
    retailPrice: row.retail_price,
    stockQuantity: row.stock_quantity,
    supplierId: row.supplier_id,
    categoryId: row.category_id,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at,
  };
}

function mapCategory(
  row: CategoryRow,
  activeProductsCount = 0,
): ShopInventoryCategory {
  return {
    activeProductsCount,
    categoryId: row.id,
    deletedAt: row.deleted_at,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function mapSupplier(
  row: SupplierRow,
  activeProductsCount = 0,
): ShopInventorySupplier {
  return {
    activeProductsCount,
    deletedAt: row.deleted_at,
    supplierId: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function mapPrice(row: PriceRow): ShopInventoryPrice {
  return {
    priceId: row.id,
    productId: row.product_id,
    type: row.type,
    price: row.price,
    effectiveAt: row.effective_at,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
  };
}

const productSelect =
  "id,shop_id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id,deleted_at,updated_at";
const legacyProductSelect =
  "id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id,deleted_at,updated_at";
const categorySelect = "id,shop_id,name,updated_at,deleted_at";
const legacyCategorySelect = "id,name,updated_at,deleted_at";
const supplierSelect = "id,shop_id,name,updated_at,deleted_at";
const legacySupplierSelect = "id,name,updated_at,deleted_at";
const priceSelect =
  "id,shop_id,product_id,type,price,effective_at,note,source,created_at";
const legacyPriceSelect =
  "id,product_id,type,price,effective_at,note,source,created_at";

function mergeRowsById<Row extends { id: string }>(
  shopRows: readonly Row[],
  legacyRows: readonly Row[],
) {
  const rows = [...shopRows];
  const seen = new Set(shopRows.map((row) => row.id));

  for (const row of legacyRows) {
    if (!seen.has(row.id)) {
      rows.push(row);
    }
  }

  return rows;
}

function hasAnyShopRows(
  ...rowGroups: ReadonlyArray<readonly { shop_id: string | null }[]>
) {
  return rowGroups.some((rows) =>
    rows.some((row) => row.shop_id != null),
  );
}

function isMissingShopIdColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    candidate.code === "42703" &&
    /column .*\.shop_id does not exist/i.test(message)
  );
}

function normalizeProductPageSize(
  value: GetShopInventoryProductsPageOptions["pageSize"],
): 10 | 25 | 50 | 100 | 200 {
  const numericValue = Number(value);

  return INVENTORY_PRODUCTS_PAGE_SIZES.includes(
    numericValue as (typeof INVENTORY_PRODUCTS_PAGE_SIZES)[number],
  )
    ? (numericValue as 10 | 25 | 50 | 100 | 200)
    : 10;
}

function normalizeProductPage(
  value: GetShopInventoryProductsPageOptions["page"],
) {
  const numericValue = Math.floor(Number(value));

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
}

function normalizeProductStateFilter(
  value: ShopInventoryProductsPageFilters["state"],
): ShopInventoryProductStateFilter {
  return value === "archived" || value === "all" ? value : "active";
}

function normalizeProductFilterValue(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeCatalogEntityPage(
  value: GetShopCatalogEntityPageReadModelOptions["page"],
) {
  const numericValue = Math.floor(Number(value));

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
}

function normalizeCatalogEntityPageSize(
  value: GetShopCatalogEntityPageReadModelOptions["pageSize"],
): 10 | 25 | 50 | 100 | 200 {
  const numericValue = Number(value);

  return INVENTORY_CATALOG_ENTITY_PAGE_SIZES.includes(
    numericValue as (typeof INVENTORY_CATALOG_ENTITY_PAGE_SIZES)[number],
  )
    ? (numericValue as 10 | 25 | 50 | 100 | 200)
    : 10;
}

function normalizeCatalogEntityStateFilter(
  value: ShopInventoryCatalogEntityPageFilters["state"],
): ShopInventoryCatalogEntityStateFilter {
  return value === "archived" || value === "all" ? value : "active";
}

function normalizeCatalogEntityFilterValue(
  value: string | null | undefined,
) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 120) : null;
}

function sanitizeCatalogEntitySearchQuery(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[,%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return normalized || null;
}

function sanitizeProductSearchQuery(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[,%*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return normalized || null;
}

function applyProductsPageFilters(
  query: ProductPageQuery,
  filters: ShopInventoryProductsPage["filters"],
) {
  let nextQuery = query;

  if (filters.state === "active") {
    nextQuery = nextQuery.is("deleted_at", null);
  } else if (filters.state === "archived") {
    nextQuery = nextQuery.not("deleted_at", "is", null);
  }

  if (filters.categoryId) {
    nextQuery = nextQuery.eq("category_id", filters.categoryId);
  }

  if (filters.supplierId) {
    nextQuery = nextQuery.eq("supplier_id", filters.supplierId);
  }

  const searchQuery = sanitizeProductSearchQuery(filters.query);

  if (searchQuery) {
    nextQuery = nextQuery.or(
      [
        `barcode.ilike.*${searchQuery}*`,
        `item_number.ilike.*${searchQuery}*`,
        `product_name.ilike.*${searchQuery}*`,
      ].join(","),
    );
  }

  return nextQuery;
}

async function countShopScopedProducts(
  supabase: SupabaseServerClient,
  shopId: string,
) {
  const result = await supabase
    .from("inventory_products")
    .select("id")
    .eq("shop_id", shopId)
    .limit(1);

  return {
    count: result.error ? null : (result.data?.length ?? 0),
    error: result.error,
  } satisfies CountResult;
}

type InventoryCountTableName =
  | "inventory_products"
  | "inventory_categories"
  | "inventory_suppliers"
  | "inventory_product_prices";

type InventoryDetailTableName = InventoryCountTableName;

type InventoryCountScope =
  | {
      kind: "shop_scoped";
      shopId: string;
    }
  | {
      kind: "legacy_owner_bridge";
      legacyOwnerOnlySchema: boolean;
      ownerUserId: string;
    };

type InventoryCountFilter = {
  column: string;
  value: string;
};

async function countInventoryRows(input: {
  deletedState?: "active" | "archived";
  filters?: readonly InventoryCountFilter[];
  perfTrace?: AdminWebPerfTrace;
  scope: InventoryCountScope;
  supabase: SupabaseServerClient;
  table: InventoryCountTableName;
}): Promise<CountResult> {
  input.perfTrace?.query(`${input.table}.count`);

  const table = input.supabase.from(
    input.table,
  ) as unknown as InventoryCountTable;
  let query = table.select("id", {
    count: "exact",
    head: true,
  });

  if (input.scope.kind === "shop_scoped") {
    query = query.eq("shop_id", input.scope.shopId);
  } else {
    if (!input.scope.legacyOwnerOnlySchema) {
      query = query.is("shop_id", null);
    }

    query = query.eq("owner_user_id", input.scope.ownerUserId);
  }

  if (input.deletedState === "active") {
    query = query.is("deleted_at", null);
  } else if (input.deletedState === "archived") {
    query = query.not("deleted_at", "is", null);
  }

  for (const filter of input.filters ?? []) {
    query = query.eq(filter.column, filter.value);
  }

  return input.perfTrace
    ? await input.perfTrace.time(`${input.table}.count.query`, async () =>
        ((await query) as CountResult),
      )
    : ((await query) as CountResult);
}

async function loadCatalogSummary(input: {
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  perfTrace?: AdminWebPerfTrace;
  selectedShopId: string;
  useLegacyOwnerBridge: boolean;
  supabase: SupabaseServerClient;
}): Promise<{
  error: unknown | null;
  summary: ShopInventoryCatalogSummary;
}> {
  if (input.useLegacyOwnerBridge && !input.legacyOwnerUserId) {
    return {
      error: null,
      summary: emptySummary,
    };
  }

  const scope: InventoryCountScope = input.useLegacyOwnerBridge
    ? {
        kind: "legacy_owner_bridge",
        legacyOwnerOnlySchema: input.legacyOwnerOnlySchema,
        ownerUserId: input.legacyOwnerUserId ?? "",
      }
    : {
        kind: "shop_scoped",
        shopId: input.selectedShopId,
      };
  const [
    activeProductsResult,
    archivedProductsResult,
    categoriesResult,
    suppliersResult,
    priceRowsResult,
  ] = await Promise.all([
    countInventoryRows({
      deletedState: "active",
      perfTrace: input.perfTrace,
      scope,
      supabase: input.supabase,
      table: "inventory_products",
    }),
    countInventoryRows({
      deletedState: "archived",
      perfTrace: input.perfTrace,
      scope,
      supabase: input.supabase,
      table: "inventory_products",
    }),
    countInventoryRows({
      deletedState: "active",
      perfTrace: input.perfTrace,
      scope,
      supabase: input.supabase,
      table: "inventory_categories",
    }),
    countInventoryRows({
      deletedState: "active",
      perfTrace: input.perfTrace,
      scope,
      supabase: input.supabase,
      table: "inventory_suppliers",
    }),
    countInventoryRows({
      perfTrace: input.perfTrace,
      scope,
      supabase: input.supabase,
      table: "inventory_product_prices",
    }),
  ]);
  const error =
    activeProductsResult.error ??
    archivedProductsResult.error ??
    categoriesResult.error ??
    suppliersResult.error ??
    priceRowsResult.error;
  const activeProducts = activeProductsResult.count ?? 0;
  const archivedProducts = archivedProductsResult.count ?? 0;

  return {
    error,
    summary: {
      activeProducts,
      archivedProducts,
      categories: categoriesResult.count ?? 0,
      priceRows: priceRowsResult.count ?? 0,
      productsTotal: activeProducts + archivedProducts,
      suppliers: suppliersResult.count ?? 0,
    },
  };
}

async function loadCatalogEntityActiveProductCounts(input: {
  entity: CatalogEntityKind;
  entityIds: readonly string[];
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  perfTrace?: AdminWebPerfTrace;
  selectedShopId: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
}): Promise<{ counts: Map<string, number>; error: unknown | null }> {
  const counts = new Map<string, number>();
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));

  if (entityIds.length === 0) {
    return { counts, error: null };
  }

  if (input.source === "legacy_owner_bridge" && !input.legacyOwnerUserId) {
    return { counts, error: null };
  }

  const relationColumn =
    input.entity === "categories" ? "category_id" : "supplier_id";
  const productTable = input.supabase.from(
    "inventory_products",
  ) as unknown as CatalogEntityProductCountTable;
  const aggregateCountSelect = `${relationColumn},${["c", "ount()"].join("")}`;
  input.perfTrace?.query(`inventory_products.${input.entity}.linkedCounts`);

  let query = productTable
    .select(aggregateCountSelect)
    .is("deleted_at", null)
    .in(relationColumn, entityIds);

  if (input.source === "shop_scoped") {
    query = query.eq("shop_id", input.selectedShopId);
  } else {
    if (!input.legacyOwnerOnlySchema) {
      query = query.is("shop_id", null);
    }

    query = query.eq("owner_user_id", input.legacyOwnerUserId ?? "");
  }

  const result = await query;

  if (!result.error) {
    for (const row of result.data ?? []) {
      const relationId = row[relationColumn];
      const count =
        typeof row.count === "number" ? row.count : Number(row.count ?? 0);

      if (relationId && Number.isFinite(count)) {
        counts.set(relationId, count);
      }
    }

    return { counts, error: null };
  }

  const fallbackCounts = new Map<string, number>();
  const fallbackTable = input.supabase.from(
    "inventory_products",
  ) as unknown as ProductPageTable;
  input.perfTrace?.query(`inventory_products.${input.entity}.linkedCountRows`);

  for (
    let from = 0;
    from < CATALOG_ENTITY_PRODUCT_METRIC_SCAN_MAX_ROWS;
    from += CATALOG_ENTITY_PRODUCT_METRIC_SCAN_PAGE_SIZE
  ) {
    let fallbackQuery = fallbackTable
      .select(relationColumn)
      .is("deleted_at", null)
      .in(relationColumn, entityIds);

    if (input.source === "shop_scoped") {
      fallbackQuery = fallbackQuery.eq("shop_id", input.selectedShopId);
    } else {
      if (!input.legacyOwnerOnlySchema) {
        fallbackQuery = fallbackQuery.is("shop_id", null);
      }

      fallbackQuery = fallbackQuery.eq("owner_user_id", input.legacyOwnerUserId ?? "");
    }

    const fallbackResult = await fallbackQuery.range(
      from,
      from + CATALOG_ENTITY_PRODUCT_METRIC_SCAN_PAGE_SIZE - 1,
    );

    if (fallbackResult.error) {
      return { counts, error: fallbackResult.error };
    }

    const rows = fallbackResult.data ?? [];

    for (const row of rows) {
      const relationId = row[relationColumn];

      if (relationId) {
        fallbackCounts.set(relationId, (fallbackCounts.get(relationId) ?? 0) + 1);
      }
    }

    if (rows.length < CATALOG_ENTITY_PRODUCT_METRIC_SCAN_PAGE_SIZE) {
      return { counts: fallbackCounts, error: null };
    }
  }

  return {
    counts,
    error: {
      message: "Linked product count fallback exceeded the bounded row scan.",
    },
  };
}

async function fetchProductsPage(input: {
  filters: ShopInventoryProductsPage["filters"];
  from: number;
  includeExactCount: boolean;
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  perfTrace?: AdminWebPerfTrace;
  selectedShopId: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
  to: number;
}) {
  input.perfTrace?.query("inventory_products.page");

  const select =
    input.source === "legacy_owner_bridge" && input.legacyOwnerOnlySchema
      ? legacyProductSelect
      : productSelect;
  const productsTable = input.supabase.from(
    "inventory_products",
  ) as unknown as ProductPageTable;
  let query = productsTable.select(
    select,
    input.includeExactCount ? { count: "exact" } : undefined,
  );

  if (input.source === "shop_scoped") {
    query = query.eq("shop_id", input.selectedShopId);
  } else if (input.legacyOwnerOnlySchema) {
    query = query.eq("owner_user_id", input.legacyOwnerUserId ?? "");
  } else {
    query = query
      .is("shop_id", null)
      .eq("owner_user_id", input.legacyOwnerUserId ?? "");
  }

  query = applyProductsPageFilters(query, input.filters);

  if (input.filters.state === "archived") {
    query = query.order("deleted_at", {
      ascending: false,
    });
  } else {
    query = query.order("updated_at", {
      ascending: false,
    });
  }

  const pageQuery = query
    .order("id", {
      ascending: true,
    })
    .range(input.from, input.to);

  return input.perfTrace
    ? input.perfTrace.time("inventory_products.page.query", async () =>
        pageQuery,
      )
    : pageQuery;
}

function normalizeLookupCodes(values: readonly string[]) {
  const seen = new Set<string>();
  const codes: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();

    if (normalized.length < 3) {
      continue;
    }

    const key = normalized.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      codes.push(normalized);
    }

    if (codes.length >= INVENTORY_PRODUCTS_CODE_LOOKUP_LIMIT) {
      break;
    }
  }

  return codes;
}

function applyProductCodeLookupScope(
  query: ProductCodeLookupQuery,
  input: {
    legacyOwnerOnlySchema: boolean;
    legacyOwnerUserId: string | null;
    selectedShopId: string;
    source: "legacy_owner_bridge" | "shop_scoped";
  },
) {
  if (input.source === "shop_scoped") {
    return query.eq("shop_id", input.selectedShopId);
  }

  if (input.legacyOwnerOnlySchema) {
    return query.eq("owner_user_id", input.legacyOwnerUserId ?? "");
  }

  return query
    .is("shop_id", null)
    .eq("owner_user_id", input.legacyOwnerUserId ?? "");
}

async function fetchProductsByCodeColumn(input: {
  codes: readonly string[];
  column: "barcode" | "item_number";
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  selectedShopId: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
}) {
  if (input.codes.length === 0) {
    return { data: [], error: null };
  }

  const select =
    input.source === "legacy_owner_bridge" && input.legacyOwnerOnlySchema
      ? legacyProductSelect
      : productSelect;
  const table = input.supabase.from(
    "inventory_products",
  ) as unknown as ProductCodeLookupTable;
  const query = applyProductCodeLookupScope(
    table.select(select).in(input.column, input.codes),
    input,
  );

  return query.range(0, Math.max(0, input.codes.length - 1));
}

function applyInventoryCatalogScope<Row>(
  query: InventoryDetailQuery<Row>,
  input: {
    legacyOwnerOnlySchema: boolean;
    legacyOwnerUserId: string | null;
    selectedShopId: string;
    source: "legacy_owner_bridge" | "shop_scoped";
  },
) {
  if (input.source === "shop_scoped") {
    return query.eq("shop_id", input.selectedShopId);
  }

  if (input.legacyOwnerOnlySchema) {
    return query.eq("owner_user_id", input.legacyOwnerUserId ?? "");
  }

  return query
    .is("shop_id", null)
    .eq("owner_user_id", input.legacyOwnerUserId ?? "");
}

async function fetchCatalogDetailRows<Row>(input: {
  idColumn: string;
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  rowId: string;
  selectedShopId: string;
  select: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
  table: InventoryDetailTableName;
}) {
  const table = input.supabase.from(
    input.table,
  ) as unknown as InventoryDetailTable<Row>;
  const query = applyInventoryCatalogScope(
    table.select(input.select).eq(input.idColumn, input.rowId),
    input,
  );

  return query.range(0, 0);
}

async function fetchProductPriceRows(input: {
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  productId: string;
  selectedShopId: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
}) {
  const select =
    input.source === "legacy_owner_bridge" && input.legacyOwnerOnlySchema
      ? legacyPriceSelect
      : priceSelect;
  const table = input.supabase.from(
    "inventory_product_prices",
  ) as unknown as InventoryDetailTable<PriceRow>;
  const query = applyInventoryCatalogScope(
    table.select(select).eq("product_id", input.productId),
    input,
  );

  return query
    .order("created_at", {
      ascending: false,
    })
    .order("id", {
      ascending: true,
    })
    .range(0, 99);
}

async function fetchInventoryRows<Row>(
  queryFactory: () => PagedInventoryQuery<Row>,
  rowLimit: number | "all",
): Promise<InventoryRowsResult<Row>> {
  if (rowLimit !== "all") {
    const result = await queryFactory().range(0, Math.max(0, rowLimit - 1));

    return {
      data: result.data ?? [],
      error: result.error,
    };
  }

  const data: Row[] = [];

  for (
    let from = 0;
    ;
    from += INVENTORY_READ_MODEL_PAGE_SIZE
  ) {
    const result = await queryFactory().range(
      from,
      from + INVENTORY_READ_MODEL_PAGE_SIZE - 1,
    );

    if (result.error) {
      return {
        data,
        error: result.error,
      };
    }

    const rows = result.data ?? [];
    data.push(...rows);

    if (rows.length < INVENTORY_READ_MODEL_PAGE_SIZE) {
      return {
        data,
        error: null,
      };
    }
  }
}

export async function getShopInventoryReadModel(
  options: GetShopInventoryReadModelOptions = {},
): Promise<ShopInventoryReadModel> {
  const { perfTrace } = options;
  const access = perfTrace
    ? await perfTrace.time("resolveShopAdminDataAccess.inventoryReadModel", () =>
        resolveShopAdminDataAccess(options),
      )
    : await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;
  const rowLimit = options.rowLimit ?? 100;

  const mappingQuery = supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);
  const mappingResult = perfTrace
    ? await perfTrace.time(
        "shop_inventory_sources.mapping.options.query",
        async () => mappingQuery,
      )
    : await mappingQuery;

  if (mappingResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop inventory mapping could not be loaded.",
      error: redactInventoryReadModelError(mappingResult.error),
    };
  }

  const mappingRows = mappingResult.data ?? [];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const mapping = mappedSource ? mapMapping(mappedSource) : null;
  const legacyOwnerUserId = mapping?.ownerUserId ?? null;

  const [
    shopProductsResult,
    shopArchivedProductsResult,
    shopCategoriesResult,
    shopSuppliersResult,
    shopPricesResult,
  ] = await Promise.all([
    fetchInventoryRows<ProductRow>(
      () =>
        supabase
          .from("inventory_products")
          .select(productSelect)
          .eq("shop_id", selectedShop.shopId)
          .is("deleted_at", null)
          .order("updated_at", {
            ascending: false,
          })
          .order("id", {
            ascending: true,
          }) as unknown as PagedInventoryQuery<ProductRow>,
      rowLimit,
    ),
    fetchInventoryRows<ProductRow>(
      () =>
        supabase
          .from("inventory_products")
          .select(productSelect)
          .eq("shop_id", selectedShop.shopId)
          .not("deleted_at", "is", null)
          .order("deleted_at", {
            ascending: false,
          })
          .order("id", {
            ascending: true,
          }) as unknown as PagedInventoryQuery<ProductRow>,
      rowLimit,
    ),
    fetchInventoryRows<CategoryRow>(
      () =>
        supabase
          .from("inventory_categories")
          .select(categorySelect)
          .eq("shop_id", selectedShop.shopId)
          .is("deleted_at", null)
          .order("name", {
            ascending: true,
          })
          .order("id", {
            ascending: true,
          }) as unknown as PagedInventoryQuery<CategoryRow>,
      rowLimit,
    ),
    fetchInventoryRows<SupplierRow>(
      () =>
        supabase
          .from("inventory_suppliers")
          .select(supplierSelect)
          .eq("shop_id", selectedShop.shopId)
          .is("deleted_at", null)
          .order("name", {
            ascending: true,
          })
          .order("id", {
            ascending: true,
          }) as unknown as PagedInventoryQuery<SupplierRow>,
      rowLimit,
    ),
    fetchInventoryRows<PriceRow>(
      () =>
        supabase
          .from("inventory_product_prices")
          .select(priceSelect)
          .eq("shop_id", selectedShop.shopId)
          .order("created_at", {
            ascending: false,
          })
          .order("id", {
            ascending: true,
          }) as unknown as PagedInventoryQuery<PriceRow>,
      rowLimit,
    ),
  ]);

  const directReadError =
    shopProductsResult.error ??
    shopArchivedProductsResult.error ??
    shopCategoriesResult.error ??
    shopSuppliersResult.error ??
    shopPricesResult.error;
  const legacyOwnerOnlySchema = isMissingShopIdColumnError(directReadError);

  if (directReadError && !legacyOwnerOnlySchema) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped inventory rows could not be loaded through RLS.",
      error: redactInventoryReadModelError(directReadError),
    };
  }

  const shopProducts = legacyOwnerOnlySchema
    ? []
    : (shopProductsResult.data ?? []);
  const shopArchivedProducts = legacyOwnerOnlySchema
    ? []
    : (shopArchivedProductsResult.data ?? []);
  const shopCategories = legacyOwnerOnlySchema
    ? []
    : (shopCategoriesResult.data ?? []);
  const shopSuppliers = legacyOwnerOnlySchema
    ? []
    : (shopSuppliersResult.data ?? []);
  const shopPrices = legacyOwnerOnlySchema ? [] : (shopPricesResult.data ?? []);
  const shopScopedRowsPresent = hasAnyShopRows(
    shopProducts,
    shopArchivedProducts,
    shopCategories,
    shopSuppliers,
    shopPrices,
  );

  let legacyProducts: ProductRow[] = [];
  let legacyArchivedProducts: ProductRow[] = [];
  let legacyCategories: CategoryRow[] = [];
  let legacySuppliers: SupplierRow[] = [];
  let legacyPrices: PriceRow[] = [];

  if (legacyOwnerUserId) {
    const [
      legacyProductsResult,
      legacyArchivedProductsResult,
      legacyCategoriesResult,
      legacySuppliersResult,
      legacyPricesResult,
    ] = await Promise.all([
      fetchInventoryRows<ProductRow>(
        () =>
          (legacyOwnerOnlySchema
            ? supabase
                .from("inventory_products")
                .select(legacyProductSelect)
                .eq("owner_user_id", legacyOwnerUserId)
            : supabase
            .from("inventory_products")
            .select(productSelect)
            .is("shop_id", null)
                .eq("owner_user_id", legacyOwnerUserId))
            .is("deleted_at", null)
            .order("updated_at", {
              ascending: false,
            })
            .order("id", {
              ascending: true,
            }) as unknown as PagedInventoryQuery<ProductRow>,
        rowLimit,
      ),
      fetchInventoryRows<ProductRow>(
        () =>
          (legacyOwnerOnlySchema
            ? supabase
                .from("inventory_products")
                .select(legacyProductSelect)
                .eq("owner_user_id", legacyOwnerUserId)
            : supabase
            .from("inventory_products")
            .select(productSelect)
            .is("shop_id", null)
                .eq("owner_user_id", legacyOwnerUserId))
            .not("deleted_at", "is", null)
            .order("deleted_at", {
              ascending: false,
            })
            .order("id", {
              ascending: true,
            }) as unknown as PagedInventoryQuery<ProductRow>,
        rowLimit,
      ),
      fetchInventoryRows<CategoryRow>(
        () =>
          (legacyOwnerOnlySchema
            ? supabase
                .from("inventory_categories")
                .select(legacyCategorySelect)
                .eq("owner_user_id", legacyOwnerUserId)
            : supabase
            .from("inventory_categories")
            .select(categorySelect)
            .is("shop_id", null)
                .eq("owner_user_id", legacyOwnerUserId))
            .is("deleted_at", null)
            .order("name", {
              ascending: true,
            })
            .order("id", {
              ascending: true,
            }) as unknown as PagedInventoryQuery<CategoryRow>,
        rowLimit,
      ),
      fetchInventoryRows<SupplierRow>(
        () =>
          (legacyOwnerOnlySchema
            ? supabase
                .from("inventory_suppliers")
                .select(legacySupplierSelect)
                .eq("owner_user_id", legacyOwnerUserId)
            : supabase
            .from("inventory_suppliers")
            .select(supplierSelect)
            .is("shop_id", null)
                .eq("owner_user_id", legacyOwnerUserId))
            .is("deleted_at", null)
            .order("name", {
              ascending: true,
            })
            .order("id", {
              ascending: true,
            }) as unknown as PagedInventoryQuery<SupplierRow>,
        rowLimit,
      ),
      fetchInventoryRows<PriceRow>(
        () =>
          (legacyOwnerOnlySchema
            ? supabase
                .from("inventory_product_prices")
                .select(legacyPriceSelect)
                .eq("owner_user_id", legacyOwnerUserId)
            : supabase
            .from("inventory_product_prices")
            .select(priceSelect)
            .is("shop_id", null)
                .eq("owner_user_id", legacyOwnerUserId))
            .order("created_at", {
              ascending: false,
            })
            .order("id", {
              ascending: true,
            }) as unknown as PagedInventoryQuery<PriceRow>,
        rowLimit,
      ),
    ]);

    const legacyReadError =
      legacyProductsResult.error ??
      legacyArchivedProductsResult.error ??
      legacyCategoriesResult.error ??
      legacySuppliersResult.error ??
      legacyPricesResult.error;

    if (legacyReadError) {
      return {
        status: "error",
        catalogScope: "blocked",
        legacyOwnerUserId,
        selectedShop,
        mapping,
        products: shopProducts.map(mapProduct),
        archivedProducts: shopArchivedProducts.map(mapProduct),
        categories: shopCategories.map(mapCategory),
        suppliers: shopSuppliers.map(mapSupplier),
        prices: shopPrices.map(mapPrice),
        summary: emptySummary,
        readOnly: true,
        source: "supabase_server",
        reason:
          "Legacy owner bridge inventory rows could not be loaded through RLS.",
        error: redactInventoryReadModelError(legacyReadError),
      };
    }

    legacyProducts = legacyProductsResult.data ?? [];
    legacyArchivedProducts = legacyArchivedProductsResult.data ?? [];
    legacyCategories = legacyCategoriesResult.data ?? [];
    legacySuppliers = legacySuppliersResult.data ?? [];
    legacyPrices = legacyPricesResult.data ?? [];
  }

  if (!mapping && blockingSource && !shopScopedRowsPresent) {
    return {
      status: "unmapped",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Legacy mobile bridge is configured but not mapped for this shop.",
    };
  }

  const products = mergeRowsById(shopProducts, legacyProducts);
  const archivedProducts = mergeRowsById(
    shopArchivedProducts,
    legacyArchivedProducts,
  );
  const categories = mergeRowsById(shopCategories, legacyCategories);
  const suppliers = mergeRowsById(shopSuppliers, legacySuppliers);
  const prices = mergeRowsById(shopPrices, legacyPrices);
  const catalogScope: ShopInventoryCatalogScope =
    shopScopedRowsPresent || !legacyOwnerUserId
      ? "shop_scoped"
      : "legacy_owner_bridge";
  const catalogSummaryResult = await loadCatalogSummary({
    legacyOwnerOnlySchema,
    legacyOwnerUserId,
    selectedShopId: selectedShop.shopId,
    supabase,
    useLegacyOwnerBridge: catalogScope === "legacy_owner_bridge",
  });

  if (catalogSummaryResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: products.map(mapProduct),
      archivedProducts: archivedProducts.map(mapProduct),
      categories: categories.map(mapCategory),
      suppliers: suppliers.map(mapSupplier),
      prices: prices.map(mapPrice),
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Mapped catalog totals could not be loaded through RLS.",
      error: redactInventoryReadModelError(catalogSummaryResult.error),
    };
  }

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    selectedShop,
    mapping,
    products: products.map(mapProduct),
    archivedProducts: archivedProducts.map(mapProduct),
    categories: categories.map(mapCategory),
    suppliers: suppliers.map(mapSupplier),
    prices: prices.map(mapPrice),
    summary: catalogSummaryResult.summary,
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
      ? "Legacy owner rows loaded through shop_inventory_sources while shop_id migration is in progress."
      : "Shop-scoped catalog rows loaded server-side for the verified selected shop.",
  };
}

export async function getShopCatalogOptionsReadModel(
  options: GetShopCatalogOptionsReadModelOptions = {},
): Promise<ShopCatalogOptionsReadModel> {
  const accessOptions = {
    client: options.client,
    requestedShopId: options.requestedShopId,
  };
  const { perfTrace } = options;
  const access = perfTrace
    ? await perfTrace.time("resolveShopAdminDataAccess.catalogOptions", () =>
        resolveShopAdminDataAccess(accessOptions),
      )
    : await resolveShopAdminDataAccess(accessOptions);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop: null,
      mapping: null,
      categories: [],
      suppliers: [],
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;

  perfTrace?.query("shop_inventory_sources.mapping.options");
  const mappingQuery = supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);
  const mappingResult = perfTrace
    ? await perfTrace.time("shop_inventory_sources.mapping.query", async () =>
        mappingQuery,
      )
    : await mappingQuery;

  if (mappingResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      categories: [],
      suppliers: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop inventory mapping could not be loaded.",
      error: redactInventoryReadModelError(mappingResult.error),
    };
  }

  const mappingRows = mappingResult.data ?? [];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const mapping = mappedSource ? mapMapping(mappedSource) : null;
  const legacyOwnerUserId = mapping?.ownerUserId ?? null;
  const preferMappedMobileOwnerBridge = isMappedMobileOwnerSource(mapping);
  const shopScopedCount = preferMappedMobileOwnerBridge
    ? { count: null, error: null }
    : await (async () => {
        perfTrace?.query("inventory_products.shopScopedPresence.options");

        return perfTrace
          ? perfTrace.time(
              "inventory_products.shopScopedPresence.options.query",
              () => countShopScopedProducts(supabase, selectedShop.shopId),
            )
          : countShopScopedProducts(supabase, selectedShop.shopId);
      })();
  const legacyOwnerOnlySchema =
    preferMappedMobileOwnerBridge ||
    isMissingShopIdColumnError(shopScopedCount.error);

  if (shopScopedCount.error && !legacyOwnerOnlySchema) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      categories: [],
      suppliers: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped product count could not be loaded through RLS.",
      error: redactInventoryReadModelError(shopScopedCount.error),
    };
  }

  const shopScopedRowsPresent =
    !preferMappedMobileOwnerBridge &&
    !legacyOwnerOnlySchema &&
    (shopScopedCount.count ?? 0) > 0;
  const useLegacyOwnerBridge =
    preferMappedMobileOwnerBridge ||
    legacyOwnerOnlySchema ||
    (!shopScopedRowsPresent && Boolean(legacyOwnerUserId));

  if (!mapping && blockingSource && !shopScopedRowsPresent) {
    return {
      status: "unmapped",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      categories: [],
      suppliers: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Legacy mobile bridge is configured but not mapped for this shop.",
    };
  }

  const catalogScope: ShopInventoryCatalogScope = useLegacyOwnerBridge
    ? "legacy_owner_bridge"
    : "shop_scoped";
  const categorySelectForScope =
    catalogScope === "legacy_owner_bridge" && legacyOwnerOnlySchema
      ? legacyCategorySelect
      : categorySelect;
  const supplierSelectForScope =
    catalogScope === "legacy_owner_bridge" && legacyOwnerOnlySchema
      ? legacySupplierSelect
      : supplierSelect;

  perfTrace?.query("inventory_categories.options");
  perfTrace?.query("inventory_suppliers.options");
  const categoriesTask = () =>
    fetchInventoryRows<CategoryRow>(
      () =>
        applyInventoryCatalogScope(
          (supabase
            .from("inventory_categories")
            .select(categorySelectForScope)
            .is("deleted_at", null)
            .order("name", {
              ascending: true,
            })
            .order("id", {
              ascending: true,
            }) as unknown as InventoryDetailQuery<CategoryRow>),
          {
            legacyOwnerOnlySchema,
            legacyOwnerUserId,
            selectedShopId: selectedShop.shopId,
            source: catalogScope,
          },
        ) as unknown as PagedInventoryQuery<CategoryRow>,
      "all",
    );
  const suppliersTask = () =>
    fetchInventoryRows<SupplierRow>(
      () =>
        applyInventoryCatalogScope(
          (supabase
            .from("inventory_suppliers")
            .select(supplierSelectForScope)
            .is("deleted_at", null)
            .order("name", {
              ascending: true,
            })
            .order("id", {
              ascending: true,
            }) as unknown as InventoryDetailQuery<SupplierRow>),
          {
            legacyOwnerOnlySchema,
            legacyOwnerUserId,
            selectedShopId: selectedShop.shopId,
            source: catalogScope,
          },
        ) as unknown as PagedInventoryQuery<SupplierRow>,
      "all",
    );
  const [categoriesResult, suppliersResult] = await Promise.all([
    perfTrace
      ? perfTrace.time("inventory_categories.options.query", categoriesTask)
      : categoriesTask(),
    perfTrace
      ? perfTrace.time("inventory_suppliers.options.query", suppliersTask)
      : suppliersTask(),
  ]);
  const optionsError = categoriesResult.error ?? suppliersResult.error;

  if (optionsError) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      categories: [],
      suppliers: [],
      readOnly: true,
      source: "supabase_server",
      reason:
        catalogScope === "legacy_owner_bridge"
          ? "Legacy mobile bridge catalog options could not be loaded through RLS."
          : "Shop-scoped catalog options could not be loaded through RLS.",
      error: redactInventoryReadModelError(optionsError),
    };
  }

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    selectedShop,
    mapping,
    categories: (categoriesResult.data ?? []).map(mapCategory),
    suppliers: (suppliersResult.data ?? []).map(mapSupplier),
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
        ? "Legacy owner catalog options loaded through shop_inventory_sources while shop_id migration is in progress."
        : "Shop-scoped catalog options loaded server-side for the verified selected shop.",
  };
}

async function fetchCatalogEntityRows(input: {
  entity: CatalogEntityKind;
  filters: ShopCatalogEntityPageReadModel["filters"];
  from: number;
  includeExactCount: boolean;
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  selectedShopId: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
  to: number;
}) {
  const isCategory = input.entity === "categories";
  const table = isCategory ? "inventory_categories" : "inventory_suppliers";
  const select = isCategory
    ? input.source === "legacy_owner_bridge" && input.legacyOwnerOnlySchema
      ? legacyCategorySelect
      : categorySelect
    : input.source === "legacy_owner_bridge" && input.legacyOwnerOnlySchema
      ? legacySupplierSelect
      : supplierSelect;
  const entityTable = input.supabase.from(
    table,
  ) as unknown as CatalogEntityPageTable<CategoryRow | SupplierRow>;
  let query = applyInventoryCatalogScope(
    entityTable.select(
      select,
      input.includeExactCount ? { count: "exact" } : undefined,
    ) as unknown as InventoryDetailQuery<CategoryRow | SupplierRow>,
    input,
  ) as unknown as CatalogEntityPageQuery<CategoryRow | SupplierRow>;

  if (input.filters.state === "active") {
    query = query.is("deleted_at", null);
  } else if (input.filters.state === "archived") {
    query = query.not("deleted_at", "is", null);
  }

  const searchQuery = sanitizeCatalogEntitySearchQuery(input.filters.query);

  if (searchQuery) {
    query = query.ilike("name", `%${searchQuery}%`);
  }

  return query
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(input.from, input.to);
}

async function getShopCatalogEntityPageReadModel(
  entity: CatalogEntityKind,
  options: GetShopCatalogEntityPageReadModelOptions = {},
): Promise<ShopCatalogEntityPageReadModel> {
  const accessOptions = {
    client: options.client,
    requestedShopId: options.requestedShopId,
  };
  const { perfTrace } = options;
  const page = normalizeCatalogEntityPage(options.page);
  const pageSize = normalizeCatalogEntityPageSize(options.pageSize);
  const includeExactTotals = options.includeExactTotals !== false;
  const requestedFrom = (page - 1) * pageSize;
  const requestedTo = requestedFrom + pageSize - 1;
  const filters: ShopCatalogEntityPageReadModel["filters"] = {
    query: normalizeCatalogEntityFilterValue(options.filters?.query),
    state: normalizeCatalogEntityStateFilter(options.filters?.state),
  };
  const emptyPagination: ShopCatalogEntityPageReadModel["pagination"] = {
    currentPageRows: 0,
    from: requestedFrom,
    hasNextPage: false,
    hasPreviousPage: page > 1,
    page,
    pageSize,
    rangeEnd: 0,
    rangeStart: 0,
    to: requestedTo,
    totalCount: 0,
    totalCountStatus: includeExactTotals ? "exact" : "deferred",
    totalPages: 1,
  };
  const access = perfTrace
    ? await perfTrace.time(`resolveShopAdminDataAccess.${entity}Page`, () =>
        resolveShopAdminDataAccess(accessOptions),
      )
    : await resolveShopAdminDataAccess(accessOptions);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop: null,
      mapping: null,
      categories: [],
      suppliers: [],
      filters,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;

  perfTrace?.query(`shop_inventory_sources.mapping.${entity}Page`);
  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);

  if (mappingResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      categories: [],
      suppliers: [],
      filters,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop inventory mapping could not be loaded.",
      error: redactInventoryReadModelError(mappingResult.error),
    };
  }

  const mappingRows = mappingResult.data ?? [];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const mapping = mappedSource ? mapMapping(mappedSource) : null;
  const legacyOwnerUserId = mapping?.ownerUserId ?? null;
  const preferMappedMobileOwnerBridge = isMappedMobileOwnerSource(mapping);
  let legacyOwnerOnlySchema = preferMappedMobileOwnerBridge;
  let catalogScope: ShopInventoryCatalogScope = preferMappedMobileOwnerBridge
    ? "legacy_owner_bridge"
    : "shop_scoped";

  perfTrace?.query(`inventory_${entity}.page`);
  let entityResult = await fetchCatalogEntityRows({
    entity,
    filters,
    from: requestedFrom,
    includeExactCount: includeExactTotals,
    legacyOwnerOnlySchema,
    legacyOwnerUserId,
    selectedShopId: selectedShop.shopId,
    source: catalogScope,
    supabase,
    to: requestedTo,
  });

  if (
    entityResult.error &&
    !preferMappedMobileOwnerBridge &&
    isMissingShopIdColumnError(entityResult.error)
  ) {
    legacyOwnerOnlySchema = true;
    catalogScope = "legacy_owner_bridge";
    entityResult = legacyOwnerUserId
      ? await fetchCatalogEntityRows({
          entity,
          filters,
          from: requestedFrom,
          includeExactCount: includeExactTotals,
          legacyOwnerOnlySchema,
          legacyOwnerUserId,
          selectedShopId: selectedShop.shopId,
          source: catalogScope,
          supabase,
          to: requestedTo,
        })
      : { count: 0, data: [], error: null };
  }

  if (
    !entityResult.error &&
    catalogScope === "shop_scoped" &&
    (entityResult.data ?? []).length === 0 &&
    legacyOwnerUserId &&
    page === 1 &&
    filters.state === "active" &&
    !filters.query
  ) {
    catalogScope = "legacy_owner_bridge";
    entityResult = await fetchCatalogEntityRows({
      entity,
      filters,
      from: requestedFrom,
      includeExactCount: includeExactTotals,
      legacyOwnerOnlySchema,
      legacyOwnerUserId,
      selectedShopId: selectedShop.shopId,
      source: catalogScope,
      supabase,
      to: requestedTo,
    });
  }

  if (entityResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      categories: [],
      suppliers: [],
      filters,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason:
        catalogScope === "legacy_owner_bridge"
          ? "Legacy mobile bridge catalog rows could not be loaded through RLS."
          : "Shop-scoped catalog rows could not be loaded through RLS.",
      error: redactInventoryReadModelError(entityResult.error),
    };
  }

  if (
    !mapping &&
    blockingSource &&
    catalogScope !== "shop_scoped" &&
    (entityResult.data ?? []).length === 0
  ) {
    return {
      status: "unmapped",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      categories: [],
      suppliers: [],
      filters,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: "Legacy mobile bridge is configured but not mapped for this shop.",
    };
  }

  const rows = entityResult.data ?? [];
  const totalCount = includeExactTotals
    ? (entityResult.count ?? rows.length)
    : requestedFrom + rows.length;
  const totalPages = includeExactTotals
    ? Math.max(1, Math.ceil(totalCount / pageSize))
    : Math.max(1, page + (rows.length >= pageSize ? 1 : 0));
  const rangeStart = rows.length === 0 ? 0 : requestedFrom + 1;
  const rangeEnd = rows.length === 0 ? 0 : requestedFrom + rows.length;
  const productCountResult = await loadCatalogEntityActiveProductCounts({
    entity,
    entityIds: rows.map((row) => row.id),
    legacyOwnerOnlySchema,
    legacyOwnerUserId,
    perfTrace,
    selectedShopId: selectedShop.shopId,
    source: catalogScope,
    supabase,
  });

  if (productCountResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      categories: [],
      suppliers: [],
      filters,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason:
        catalogScope === "legacy_owner_bridge"
          ? "Legacy mobile bridge linked product counts could not be loaded through RLS."
          : "Shop-scoped linked product counts could not be loaded through RLS.",
      error: redactInventoryReadModelError(productCountResult.error),
    };
  }

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    selectedShop,
    mapping,
    categories:
      entity === "categories"
        ? (rows as CategoryRow[]).map((row) =>
            mapCategory(row, productCountResult.counts.get(row.id) ?? 0),
          )
        : [],
    suppliers:
      entity === "suppliers"
        ? (rows as SupplierRow[]).map((row) =>
            mapSupplier(row, productCountResult.counts.get(row.id) ?? 0),
          )
        : [],
    filters,
    pagination: {
      currentPageRows: rows.length,
      from: requestedFrom,
      hasNextPage: includeExactTotals ? page < totalPages : rows.length >= pageSize,
      hasPreviousPage: page > 1,
      page,
      pageSize,
      rangeEnd,
      rangeStart,
      to: requestedTo,
      totalCount,
      totalCountStatus: includeExactTotals ? "exact" : "deferred",
      totalPages,
    },
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
        ? "Legacy owner catalog rows loaded through shop_inventory_sources while shop_id migration is in progress."
        : "Shop-scoped catalog rows loaded server-side for the verified selected shop.",
  };
}

export async function getShopCategoriesPageReadModel(
  options: GetShopCatalogEntityPageReadModelOptions = {},
): Promise<ShopCatalogEntityPageReadModel> {
  return getShopCatalogEntityPageReadModel("categories", options);
}

export async function getShopSuppliersPageReadModel(
  options: GetShopCatalogEntityPageReadModelOptions = {},
): Promise<ShopCatalogEntityPageReadModel> {
  return getShopCatalogEntityPageReadModel("suppliers", options);
}

export async function getShopInventoryProductDetailReadModel(
  options: GetShopInventoryProductDetailOptions,
): Promise<ShopInventoryReadModel> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;
  const productId = options.productId.trim();
  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);

  if (mappingResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop inventory mapping could not be loaded.",
      error: redactInventoryReadModelError(mappingResult.error),
    };
  }

  const mappingRows = mappingResult.data ?? [];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const mapping = mappedSource ? mapMapping(mappedSource) : null;
  const legacyOwnerUserId = mapping?.ownerUserId ?? null;
  const preferMappedMobileOwnerBridge = isMappedMobileOwnerSource(mapping);
  const shopScopedCount = preferMappedMobileOwnerBridge
    ? { count: null, error: null }
    : await countShopScopedProducts(supabase, selectedShop.shopId);
  const legacyOwnerOnlySchema =
    preferMappedMobileOwnerBridge ||
    isMissingShopIdColumnError(shopScopedCount.error);

  if (shopScopedCount.error && !legacyOwnerOnlySchema) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped product count could not be loaded through RLS.",
      error: redactInventoryReadModelError(shopScopedCount.error),
    };
  }

  const shopScopedRowsPresent =
    !preferMappedMobileOwnerBridge &&
    !legacyOwnerOnlySchema &&
    (shopScopedCount.count ?? 0) > 0;
  const useLegacyOwnerBridge =
    preferMappedMobileOwnerBridge ||
    legacyOwnerOnlySchema ||
    (!shopScopedRowsPresent && Boolean(legacyOwnerUserId));

  if (!mapping && blockingSource && !shopScopedRowsPresent) {
    return {
      status: "unmapped",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason: "Legacy mobile bridge is configured but not mapped for this shop.",
    };
  }

  const catalogScope: ShopInventoryCatalogScope = useLegacyOwnerBridge
    ? "legacy_owner_bridge"
    : "shop_scoped";

  const productSelectForScope =
    catalogScope === "legacy_owner_bridge" && legacyOwnerOnlySchema
      ? legacyProductSelect
      : productSelect;
  const productResult = productId
    ? await fetchCatalogDetailRows<ProductRow>({
        idColumn: "id",
        legacyOwnerOnlySchema,
        legacyOwnerUserId,
        rowId: productId,
        selectedShopId: selectedShop.shopId,
        select: productSelectForScope,
        source: catalogScope,
        supabase,
        table: "inventory_products",
      })
    : { data: [], error: null };

  if (productResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason:
        catalogScope === "legacy_owner_bridge"
          ? "Legacy mobile bridge product detail could not be loaded through RLS."
          : "Shop-scoped product detail could not be loaded through RLS.",
      error: redactInventoryReadModelError(productResult.error),
    };
  }

  const product = productResult.data?.[0] ?? null;
  const categorySelectForScope =
    catalogScope === "legacy_owner_bridge" && legacyOwnerOnlySchema
      ? legacyCategorySelect
      : categorySelect;
  const supplierSelectForScope =
    catalogScope === "legacy_owner_bridge" && legacyOwnerOnlySchema
      ? legacySupplierSelect
      : supplierSelect;
  const [categoryResult, supplierResult, pricesResult] = await Promise.all([
    product?.category_id
      ? fetchCatalogDetailRows<CategoryRow>({
          idColumn: "id",
          legacyOwnerOnlySchema,
          legacyOwnerUserId,
          rowId: product.category_id,
          selectedShopId: selectedShop.shopId,
          select: categorySelectForScope,
          source: catalogScope,
          supabase,
          table: "inventory_categories",
        })
      : Promise.resolve({ data: [], error: null }),
    product?.supplier_id
      ? fetchCatalogDetailRows<SupplierRow>({
          idColumn: "id",
          legacyOwnerOnlySchema,
          legacyOwnerUserId,
          rowId: product.supplier_id,
          selectedShopId: selectedShop.shopId,
          select: supplierSelectForScope,
          source: catalogScope,
          supabase,
          table: "inventory_suppliers",
        })
      : Promise.resolve({ data: [], error: null }),
    product
      ? fetchProductPriceRows({
          legacyOwnerOnlySchema,
          legacyOwnerUserId,
          productId: product.id,
          selectedShopId: selectedShop.shopId,
          source: catalogScope,
          supabase,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const detailError =
    categoryResult.error ?? supplierResult.error ?? pricesResult.error;

  if (detailError) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      summary: emptySummary,
      readOnly: true,
      source: "supabase_server",
      reason:
        catalogScope === "legacy_owner_bridge"
          ? "Legacy mobile bridge product detail relations could not be loaded through RLS."
          : "Shop-scoped product detail relations could not be loaded through RLS.",
      error: redactInventoryReadModelError(detailError),
    };
  }

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    selectedShop,
    mapping,
    products: product && !product.deleted_at ? [mapProduct(product)] : [],
    archivedProducts: product?.deleted_at ? [mapProduct(product)] : [],
    categories: (categoryResult.data ?? []).map(mapCategory),
    suppliers: (supplierResult.data ?? []).map(mapSupplier),
    prices: (pricesResult.data ?? []).map(mapPrice),
    summary: emptySummary,
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
        ? "Legacy mobile bridge product detail loaded by exact product id through shop_inventory_sources."
      : "Shop-scoped product detail loaded by exact product id for the verified selected shop.",
  };
}

export async function getShopInventoryProductsByCodes(
  options: GetShopInventoryProductsByCodesOptions,
): Promise<ShopInventoryProductsByCodesReadModel> {
  const codes = normalizeLookupCodes(options.codes);
  const access = await resolveShopAdminDataAccess({
    client: options.client,
    requestedShopId: options.requestedShopId,
  });

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      mapping: null,
      products: [],
      readOnly: true,
      reason: access.reason,
      selectedShop: null,
      source: "supabase_server",
    };
  }

  const { selectedShop, supabase } = access;

  if (codes.length === 0) {
    return {
      status: "ready",
      catalogScope: "shop_scoped",
      legacyOwnerUserId: null,
      mapping: null,
      products: [],
      readOnly: true,
      reason: "No product codes were available for batch lookup.",
      selectedShop,
      source: "supabase_server",
    };
  }

  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);

  if (mappingResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      mapping: null,
      products: [],
      readOnly: true,
      reason: "Shop inventory mapping could not be loaded.",
      selectedShop,
      source: "supabase_server",
    };
  }

  const mappingRows = mappingResult.data ?? [];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const mapping = mappedSource ? mapMapping(mappedSource) : null;
  const legacyOwnerUserId = mapping?.ownerUserId ?? null;
  const preferMappedMobileOwnerBridge = isMappedMobileOwnerSource(mapping);
  const shopScopedCount = preferMappedMobileOwnerBridge
    ? { count: null, error: null }
    : await countShopScopedProducts(supabase, selectedShop.shopId);
  const legacyOwnerOnlySchema =
    preferMappedMobileOwnerBridge ||
    isMissingShopIdColumnError(shopScopedCount.error);

  if (shopScopedCount.error && !legacyOwnerOnlySchema) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      mapping,
      products: [],
      readOnly: true,
      reason: "Shop-scoped product lookup could not be loaded through RLS.",
      selectedShop,
      source: "supabase_server",
    };
  }

  const shopScopedRowsPresent =
    !preferMappedMobileOwnerBridge &&
    !legacyOwnerOnlySchema &&
    (shopScopedCount.count ?? 0) > 0;
  const useLegacyOwnerBridge =
    preferMappedMobileOwnerBridge ||
    legacyOwnerOnlySchema ||
    (!shopScopedRowsPresent && Boolean(legacyOwnerUserId));

  if (!mapping && blockingSource && !shopScopedRowsPresent) {
    return {
      status: "unmapped",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      mapping: null,
      products: [],
      readOnly: true,
      reason: "Legacy mobile bridge is configured but not mapped for this shop.",
      selectedShop,
      source: "supabase_server",
    };
  }

  const catalogScope: ShopInventoryCatalogScope = useLegacyOwnerBridge
    ? "legacy_owner_bridge"
    : "shop_scoped";
  const [barcodeResult, itemNumberResult] = await Promise.all([
    fetchProductsByCodeColumn({
      codes,
      column: "barcode",
      legacyOwnerOnlySchema,
      legacyOwnerUserId,
      selectedShopId: selectedShop.shopId,
      source: catalogScope,
      supabase,
    }),
    fetchProductsByCodeColumn({
      codes,
      column: "item_number",
      legacyOwnerOnlySchema,
      legacyOwnerUserId,
      selectedShopId: selectedShop.shopId,
      source: catalogScope,
      supabase,
    }),
  ]);

  if (barcodeResult.error || itemNumberResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      mapping,
      products: [],
      readOnly: true,
      reason: "Batch product lookup by barcode/item number could not be loaded.",
      selectedShop,
      source: "supabase_server",
    };
  }

  const productsById = new Map<string, ProductRow>();

  for (const row of [
    ...(barcodeResult.data ?? []),
    ...(itemNumberResult.data ?? []),
  ]) {
    productsById.set(row.id, row);
  }

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    mapping,
    products: Array.from(productsById.values()).map(mapProduct),
    readOnly: true,
    reason:
      catalogScope === "legacy_owner_bridge"
        ? "Legacy mobile bridge products resolved by barcode/item number in a bounded batch."
        : "Shop-scoped products resolved by barcode/item number in a bounded batch.",
    selectedShop,
    source: "supabase_server",
  };
}

export async function getShopInventoryProductsPage(
  options: GetShopInventoryProductsPageOptions = {},
): Promise<ShopInventoryProductsPage> {
  const accessOptions = {
    client: options.client,
    requestedShopId: options.requestedShopId,
  };
  const { perfTrace } = options;
  const access = perfTrace
    ? await perfTrace.time("resolveShopAdminDataAccess.productsPage", () =>
        resolveShopAdminDataAccess(accessOptions),
      )
    : await resolveShopAdminDataAccess(accessOptions);
  const page = normalizeProductPage(options.page);
  const pageSize = normalizeProductPageSize(options.pageSize);
  const includeExactTotals = options.includeExactTotals !== false;
  const requestedFrom = (page - 1) * pageSize;
  const requestedTo = requestedFrom + pageSize - 1;
  const filters: ShopInventoryProductsPage["filters"] = {
    categoryId: normalizeProductFilterValue(options.filters?.categoryId),
    query: normalizeProductFilterValue(options.filters?.query),
    state: normalizeProductStateFilter(options.filters?.state),
    supplierId: normalizeProductFilterValue(options.filters?.supplierId),
  };
  const emptyPagination = {
    currentPageRows: 0,
    from: requestedFrom,
    hasNextPage: false,
    hasPreviousPage: page > 1,
    page,
    pageSize,
    rangeEnd: 0,
    rangeStart: 0,
    to: requestedTo,
    totalCount: 0,
    totalCountStatus: includeExactTotals ? "exact" : "deferred",
    totalPages: 1,
  } as const;

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop: null,
      mapping: null,
      products: [],
      filters,
      summary: emptySummary,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;

  perfTrace?.query("shop_inventory_sources.mapping");
  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .is("disabled_at", null)
    .limit(10);

  if (mappingResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      products: [],
      filters,
      summary: emptySummary,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop inventory mapping could not be loaded.",
      error: redactInventoryReadModelError(mappingResult.error),
    };
  }

  const mappingRows = mappingResult.data ?? [];
  const mappedSource = mappingRows.find(
    (row) => row.mapping_state === "mapped" && row.owner_user_id,
  );
  const blockingSource = mappingRows.find(
    (row) => row.mapping_state !== "mapped",
  );
  const mapping = mappedSource ? mapMapping(mappedSource) : null;
  const legacyOwnerUserId = mapping?.ownerUserId ?? null;
  const preferMappedMobileOwnerBridge = isMappedMobileOwnerSource(mapping);
  const shopScopedCount = preferMappedMobileOwnerBridge
    ? { count: null, error: null }
    : await (async () => {
        perfTrace?.query("inventory_products.shopScopedPresence");

        return perfTrace
          ? perfTrace.time(
              "inventory_products.shopScopedPresence.query",
              () => countShopScopedProducts(supabase, selectedShop.shopId),
            )
          : countShopScopedProducts(supabase, selectedShop.shopId);
      })();
  const legacyOwnerOnlySchema =
    preferMappedMobileOwnerBridge ||
    isMissingShopIdColumnError(shopScopedCount.error);

  if (shopScopedCount.error && !legacyOwnerOnlySchema) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      filters,
      summary: emptySummary,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped product count could not be loaded through RLS.",
      error: redactInventoryReadModelError(shopScopedCount.error),
    };
  }

  const shopScopedRowsPresent =
    !preferMappedMobileOwnerBridge &&
    !legacyOwnerOnlySchema &&
    (shopScopedCount.count ?? 0) > 0;
  const useLegacyOwnerBridge =
    preferMappedMobileOwnerBridge ||
    legacyOwnerOnlySchema ||
    (!shopScopedRowsPresent && Boolean(legacyOwnerUserId));

  if (!mapping && blockingSource && !shopScopedRowsPresent) {
    return {
      status: "unmapped",
      catalogScope: "blocked",
      legacyOwnerUserId: null,
      selectedShop,
      mapping: null,
      products: [],
      filters,
      summary: emptySummary,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: "Legacy mobile bridge is configured but not mapped for this shop.",
    };
  }

  const catalogScope: ShopInventoryCatalogScope = useLegacyOwnerBridge
    ? "legacy_owner_bridge"
    : "shop_scoped";
  const catalogSummaryResult = includeExactTotals
    ? await loadCatalogSummary({
        legacyOwnerOnlySchema,
        legacyOwnerUserId,
        perfTrace,
        selectedShopId: selectedShop.shopId,
        supabase,
        useLegacyOwnerBridge,
      })
    : {
        error: null,
        summary: emptySummary,
      };

  if (catalogSummaryResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      filters,
      summary: emptySummary,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason: "Mapped catalog totals could not be loaded through RLS.",
      error: redactInventoryReadModelError(catalogSummaryResult.error),
    };
  }

  let productsResult = await fetchProductsPage({
    filters,
    from: requestedFrom,
    includeExactCount: includeExactTotals,
    legacyOwnerOnlySchema,
    legacyOwnerUserId,
    perfTrace,
    selectedShopId: selectedShop.shopId,
    source: catalogScope,
    supabase,
    to: includeExactTotals ? requestedTo : requestedTo + 1,
  });

  if (productsResult.error) {
    return {
      status: "error",
      catalogScope: "blocked",
      legacyOwnerUserId,
      selectedShop,
      mapping,
      products: [],
      filters,
      summary: emptySummary,
      pagination: emptyPagination,
      readOnly: true,
      source: "supabase_server",
      reason:
        catalogScope === "legacy_owner_bridge"
          ? "Legacy mobile bridge product page could not be loaded through RLS."
          : "Shop-scoped product page could not be loaded through RLS.",
      error: redactInventoryReadModelError(productsResult.error),
    };
  }

  let fetchedRows = productsResult.data ?? [];
  let rows = includeExactTotals ? fetchedRows : fetchedRows.slice(0, pageSize);
  let hasNextPage = includeExactTotals ? false : fetchedRows.length > pageSize;
  const exactTotalCount = productsResult.count ?? rows.length;
  const totalCount = includeExactTotals
    ? exactTotalCount
    : requestedFrom + rows.length + (hasNextPage ? 1 : 0);
  const totalPages = includeExactTotals
    ? Math.max(1, Math.ceil(totalCount / pageSize))
    : Math.max(1, page + (hasNextPage ? 1 : 0));
  const clampedPage = includeExactTotals && totalCount > 0
    ? Math.min(page, totalPages)
    : page;
  const from = (clampedPage - 1) * pageSize;
  const to = from + pageSize - 1;

  if (clampedPage !== page) {
    productsResult = await fetchProductsPage({
      filters,
      from,
      includeExactCount: includeExactTotals,
      legacyOwnerOnlySchema,
      legacyOwnerUserId,
      perfTrace,
      selectedShopId: selectedShop.shopId,
      source: catalogScope,
      supabase,
      to: includeExactTotals ? to : to + 1,
    });

    if (productsResult.error) {
      return {
        status: "error",
        catalogScope: "blocked",
        legacyOwnerUserId,
        selectedShop,
        mapping,
        products: [],
        filters,
        summary: emptySummary,
        pagination: emptyPagination,
        readOnly: true,
        source: "supabase_server",
        reason:
          catalogScope === "legacy_owner_bridge"
            ? "Legacy mobile bridge product page could not be loaded through RLS."
            : "Shop-scoped product page could not be loaded through RLS.",
        error: redactInventoryReadModelError(productsResult.error),
      };
    }

    fetchedRows = productsResult.data ?? [];
    rows = includeExactTotals ? fetchedRows : fetchedRows.slice(0, pageSize);
    hasNextPage = includeExactTotals ? false : fetchedRows.length > pageSize;
  }

  const rangeStart = rows.length === 0 ? 0 : from + 1;
  const rangeEnd = rows.length === 0 ? 0 : from + rows.length;
  const resolvedHasNextPage = includeExactTotals
    ? clampedPage < totalPages
    : hasNextPage;
  const summary = includeExactTotals
    ? catalogSummaryResult.summary
    : {
        ...emptySummary,
        activeProducts: filters.state === "archived" ? 0 : totalCount,
        archivedProducts: filters.state === "archived" ? totalCount : 0,
        productsTotal: totalCount,
      };

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    selectedShop,
    mapping,
    products: rows.map(mapProduct),
    filters,
    summary,
    pagination: {
      currentPageRows: rows.length,
      from,
      hasNextPage: resolvedHasNextPage,
      hasPreviousPage: clampedPage > 1,
      page: clampedPage,
      pageSize,
      rangeEnd,
      rangeStart,
      to,
      totalCount,
      totalCountStatus: includeExactTotals ? "exact" : "deferred",
      totalPages,
    },
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
        ? includeExactTotals
          ? "Legacy mobile bridge product rows loaded through owner_user_id from shop_inventory_sources with exact count."
          : "Legacy mobile bridge product rows loaded through owner_user_id from shop_inventory_sources with exact totals deferred from first paint."
        : includeExactTotals
          ? "Shop-scoped product rows loaded server-side with exact count and range for the verified selected shop."
          : "Shop-scoped product rows loaded server-side with exact totals deferred from first paint.",
  };
}
