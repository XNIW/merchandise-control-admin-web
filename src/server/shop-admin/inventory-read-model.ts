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

const INVENTORY_READ_MODEL_PAGE_SIZE = 1_000;

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
const categorySelect = "id,shop_id,name,updated_at";
const supplierSelect = "id,shop_id,name,updated_at";
const priceSelect =
  "id,shop_id,product_id,type,price,effective_at,note,source,created_at";

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
    rows.some((row) => row.shop_id !== null),
  );
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

  if (directReadError) {
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
      readOnly: true,
      source: "supabase_server",
      reason: "Shop-scoped inventory rows could not be loaded through RLS.",
      error: redactInventoryReadModelError(directReadError),
    };
  }

  const shopProducts = shopProductsResult.data ?? [];
  const shopArchivedProducts = shopArchivedProductsResult.data ?? [];
  const shopCategories = shopCategoriesResult.data ?? [];
  const shopSuppliers = shopSuppliersResult.data ?? [];
  const shopPrices = shopPricesResult.data ?? [];
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
          supabase
            .from("inventory_products")
            .select(productSelect)
            .is("shop_id", null)
            .eq("owner_user_id", legacyOwnerUserId)
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
            .is("shop_id", null)
            .eq("owner_user_id", legacyOwnerUserId)
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
            .is("shop_id", null)
            .eq("owner_user_id", legacyOwnerUserId)
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
            .is("shop_id", null)
            .eq("owner_user_id", legacyOwnerUserId)
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
            .is("shop_id", null)
            .eq("owner_user_id", legacyOwnerUserId)
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
    readOnly: true,
    source: "supabase_server",
    reason:
      catalogScope === "legacy_owner_bridge"
        ? "Legacy owner rows loaded through shop_inventory_sources while shop_id migration is in progress."
        : "Shop-scoped catalog rows loaded server-side for the verified selected shop.",
  };
}
