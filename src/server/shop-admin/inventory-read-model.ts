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
  | "stock_quantity"
  | "supplier_id"
  | "category_id"
  | "deleted_at"
  | "updated_at"
>;
type CategoryRow = Pick<Tables<"inventory_categories">, "id" | "name" | "updated_at">;
type SupplierRow = Pick<Tables<"inventory_suppliers">, "id" | "name" | "updated_at">;
type PriceRow = Pick<
  Tables<"inventory_product_prices">,
  "id" | "product_id" | "type" | "price" | "effective_at" | "source" | "created_at"
>;

export type ShopInventoryReadModelStatus =
  | ShopAdminReadModelStatus
  | "unmapped";

export type ShopInventoryMapping = {
  mappingId: string;
  ownerUserId: string;
  sourceKind: string;
  verifiedAt: string | null;
};

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
  source: string | null;
  createdAt: string;
};

export type ShopInventoryReadModel = {
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
};

const emptyRows = {
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
    source: row.source,
    createdAt: row.created_at,
  };
}

const productSelect =
  "id,barcode,item_number,product_name,second_product_name,purchase_price,retail_price,stock_quantity,supplier_id,category_id,deleted_at,updated_at";

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

  const mappingResult = await supabase
    .from("shop_inventory_sources")
    .select(
      "shop_inventory_source_id,shop_id,owner_user_id,mapping_state,source_kind,verified_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .eq("mapping_state", "mapped")
    .is("disabled_at", null)
    .maybeSingle();

  if (mappingResult.error) {
    return {
      status: "error",
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

  const mapping = mappingResult.data ? mapMapping(mappingResult.data) : null;

  if (!mapping) {
    return {
      status: "unmapped",
      selectedShop,
      mapping: null,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      readOnly: true,
      source: "supabase_server",
      reason:
        "No mapped mobile owner inventory source is configured for this shop.",
    };
  }

  const productsResult = await supabase
    .from("inventory_products")
    .select(productSelect)
    .eq("owner_user_id", mapping.ownerUserId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (productsResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      products: [],
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Mapped inventory products could not be loaded through RLS.",
      error: redactInventoryReadModelError(productsResult.error),
    };
  }

  const archivedProductsResult = await supabase
    .from("inventory_products")
    .select(productSelect)
    .eq("owner_user_id", mapping.ownerUserId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(100);

  if (archivedProductsResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      products: (productsResult.data ?? []).map(mapProduct),
      archivedProducts: [],
      categories: [],
      suppliers: [],
      prices: [],
      readOnly: true,
      source: "supabase_server",
      reason:
        "Mapped archived inventory products could not be loaded through RLS.",
      error: redactInventoryReadModelError(archivedProductsResult.error),
    };
  }

  const categoriesResult = await supabase
    .from("inventory_categories")
    .select("id,name,updated_at")
    .eq("owner_user_id", mapping.ownerUserId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(100);

  if (categoriesResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      products: (productsResult.data ?? []).map(mapProduct),
      archivedProducts: (archivedProductsResult.data ?? []).map(mapProduct),
      categories: [],
      suppliers: [],
      prices: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Mapped inventory categories could not be loaded through RLS.",
      error: redactInventoryReadModelError(categoriesResult.error),
    };
  }

  const suppliersResult = await supabase
    .from("inventory_suppliers")
    .select("id,name,updated_at")
    .eq("owner_user_id", mapping.ownerUserId)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(100);

  if (suppliersResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      products: (productsResult.data ?? []).map(mapProduct),
      archivedProducts: (archivedProductsResult.data ?? []).map(mapProduct),
      categories: (categoriesResult.data ?? []).map(mapCategory),
      suppliers: [],
      prices: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Mapped inventory suppliers could not be loaded through RLS.",
      error: redactInventoryReadModelError(suppliersResult.error),
    };
  }

  const pricesResult = await supabase
    .from("inventory_product_prices")
    .select("id,product_id,type,price,effective_at,source,created_at")
    .eq("owner_user_id", mapping.ownerUserId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (pricesResult.error) {
    return {
      status: "error",
      selectedShop,
      mapping,
      products: (productsResult.data ?? []).map(mapProduct),
      archivedProducts: (archivedProductsResult.data ?? []).map(mapProduct),
      categories: (categoriesResult.data ?? []).map(mapCategory),
      suppliers: (suppliersResult.data ?? []).map(mapSupplier),
      prices: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Mapped inventory price history could not be loaded through RLS.",
      error: redactInventoryReadModelError(pricesResult.error),
    };
  }

  return {
    status: "ready",
    selectedShop,
    mapping,
    products: (productsResult.data ?? []).map(mapProduct),
    archivedProducts: (archivedProductsResult.data ?? []).map(mapProduct),
    categories: (categoriesResult.data ?? []).map(mapCategory),
    suppliers: (suppliersResult.data ?? []).map(mapSupplier),
    prices: (pricesResult.data ?? []).map(mapPrice),
    readOnly: true,
    source: "supabase_server",
    reason:
      "Mapped inventory rows loaded server-side for the verified selected shop.",
  };
}
