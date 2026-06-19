import "server-only";

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
  "id" | "name" | "shop_id" | "updated_at"
>;
type SupplierRow = Pick<
  Tables<"inventory_suppliers">,
  "id" | "name" | "shop_id" | "updated_at"
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
  categoryId: string;
  name: string;
  updatedAt: string;
};

export type ShopInventorySupplier = {
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
    page: number;
    pageSize: 50 | 100 | 200;
    rangeEnd: number;
    rangeStart: number;
    to: number;
    totalCount: number;
    totalPages: number;
  };
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopInventoryReadModelOptions = {
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
  rowLimit?: number | "all";
};

type GetShopInventoryProductsPageOptions = {
  client?: SupabaseServerClient | null;
  filters?: ShopInventoryProductsPageFilters;
  page?: number | string | null;
  pageSize?: number | string | null;
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

type ProductCountQuery = {
  eq: (column: string, value: string) => ProductCountQuery;
} & PromiseLike<CountResult>;

type ProductPageTable = {
  select: (
    columns: string,
    options: {
      count: "exact";
    },
  ) => ProductPageQuery;
};

const INVENTORY_READ_MODEL_PAGE_SIZE = 1_000;
const INVENTORY_PRODUCTS_PAGE_SIZES = [50, 100, 200] as const;

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

function mapCategory(row: CategoryRow): ShopInventoryCategory {
  return {
    categoryId: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function mapSupplier(row: SupplierRow): ShopInventorySupplier {
  return {
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
const categorySelect = "id,shop_id,name,updated_at";
const legacyCategorySelect = "id,name,updated_at";
const supplierSelect = "id,shop_id,name,updated_at";
const legacySupplierSelect = "id,name,updated_at";
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
): 50 | 100 | 200 {
  const numericValue = Number(value);

  return INVENTORY_PRODUCTS_PAGE_SIZES.includes(
    numericValue as (typeof INVENTORY_PRODUCTS_PAGE_SIZES)[number],
  )
    ? (numericValue as 50 | 100 | 200)
    : 100;
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
  return (await ((supabase
    .from("inventory_products")
    .select("id", {
      count: "exact",
      head: true,
    }) as unknown as ProductCountQuery)
    .eq("shop_id", shopId))) as CountResult;
}

type InventoryCountTableName =
  | "inventory_products"
  | "inventory_categories"
  | "inventory_suppliers"
  | "inventory_product_prices";

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

async function countInventoryRows(input: {
  deletedState?: "active" | "archived";
  scope: InventoryCountScope;
  supabase: SupabaseServerClient;
  table: InventoryCountTableName;
}): Promise<CountResult> {
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

  return (await query) as CountResult;
}

async function loadCatalogSummary(input: {
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
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
      scope,
      supabase: input.supabase,
      table: "inventory_products",
    }),
    countInventoryRows({
      deletedState: "archived",
      scope,
      supabase: input.supabase,
      table: "inventory_products",
    }),
    countInventoryRows({
      deletedState: "active",
      scope,
      supabase: input.supabase,
      table: "inventory_categories",
    }),
    countInventoryRows({
      deletedState: "active",
      scope,
      supabase: input.supabase,
      table: "inventory_suppliers",
    }),
    countInventoryRows({
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

async function fetchProductsPage(input: {
  filters: ShopInventoryProductsPage["filters"];
  from: number;
  legacyOwnerOnlySchema: boolean;
  legacyOwnerUserId: string | null;
  selectedShopId: string;
  source: "legacy_owner_bridge" | "shop_scoped";
  supabase: SupabaseServerClient;
  to: number;
}) {
  const select =
    input.source === "legacy_owner_bridge" && input.legacyOwnerOnlySchema
      ? legacyProductSelect
      : productSelect;
  const productsTable = input.supabase.from(
    "inventory_products",
  ) as unknown as ProductPageTable;
  let query = productsTable.select(select, {
    count: "exact",
  });

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

  return query
    .order("id", {
      ascending: true,
    })
    .range(input.from, input.to);
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
  const rowLimit = options.rowLimit ?? 100;

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

export async function getShopInventoryProductsPage(
  options: GetShopInventoryProductsPageOptions = {},
): Promise<ShopInventoryProductsPage> {
  const access = await resolveShopAdminDataAccess(options);
  const page = normalizeProductPage(options.page);
  const pageSize = normalizeProductPageSize(options.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const filters: ShopInventoryProductsPage["filters"] = {
    categoryId: normalizeProductFilterValue(options.filters?.categoryId),
    query: normalizeProductFilterValue(options.filters?.query),
    state: normalizeProductStateFilter(options.filters?.state),
    supplierId: normalizeProductFilterValue(options.filters?.supplierId),
  };
  const emptyPagination = {
    currentPageRows: 0,
    from,
    page,
    pageSize,
    rangeEnd: 0,
    rangeStart: 0,
    to,
    totalCount: 0,
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
  const catalogSummaryResult = await loadCatalogSummary({
    legacyOwnerOnlySchema,
    legacyOwnerUserId,
    selectedShopId: selectedShop.shopId,
    supabase,
    useLegacyOwnerBridge,
  });

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

  const productsResult = await fetchProductsPage({
    filters,
    from,
    legacyOwnerOnlySchema,
    legacyOwnerUserId,
    selectedShopId: selectedShop.shopId,
    source: catalogScope,
    supabase,
    to,
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

  const rows = productsResult.data ?? [];
  const totalCount = productsResult.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = rows.length === 0 ? 0 : from + 1;
  const rangeEnd = rows.length === 0 ? 0 : from + rows.length;

  return {
    status: "ready",
    catalogScope,
    legacyOwnerUserId,
    selectedShop,
    mapping,
    products: rows.map(mapProduct),
    filters,
    summary: catalogSummaryResult.summary,
    pagination: {
      currentPageRows: rows.length,
      from,
      page,
      pageSize,
      rangeEnd,
      rangeStart,
      to,
      totalCount,
      totalPages,
    },
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
        ? "Legacy mobile bridge product rows loaded through owner_user_id from shop_inventory_sources because shop_id rows are not available yet."
        : "Shop-scoped product rows loaded server-side with exact count and range for the verified selected shop.",
  };
}
