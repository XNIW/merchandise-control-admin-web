import "server-only";

import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";

type CatalogEntityInput = {
  name: string;
  requestedShopId?: string;
};

type CatalogEntityUpdateInput = CatalogEntityInput & {
  id: string;
};

type CatalogArchiveInput = {
  id: string;
  reason?: string;
  requestedShopId?: string;
};

export type ProductMutationInput = {
  barcode: string;
  categoryId?: string;
  itemNumber?: string;
  productName: string;
  purchasePrice?: number;
  requestedShopId?: string;
  retailPrice?: number;
  secondProductName?: string;
  stockQuantity?: number;
  supplierId?: string;
};

export type ProductUpdateInput = ProductMutationInput & {
  productId: string;
};

function cleanUuid(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function hasInvalidNumber(...values: Array<number | undefined>) {
  return values.some((value) => value !== undefined && !Number.isFinite(value));
}

function nonNegativeFields(input: ProductMutationInput) {
  return [
    input.purchasePrice,
    input.retailPrice,
    input.stockQuantity,
  ].every((value) => value === undefined || value >= 0);
}

async function rpcResult(
  requestedShopId: string | undefined,
  permission: "products.write" | "categories.write" | "suppliers.write",
  call: (
    context: Extract<
      Awaited<ReturnType<typeof resolveShopActionContext>>,
      { status: "ready" }
    >,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(requestedShopId, permission);

  if (context.status !== "ready") {
    return context.result;
  }

  const { data, error } = await call(context);

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return mapShopAdminRpcResult(data);
}

export async function createSupplier(
  input: CatalogEntityInput,
): Promise<ShopAdminActionResult> {
  if (!input.name.trim()) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { name: "Supplier name is required." },
      ok: false,
    });
  }

  return rpcResult(input.requestedShopId, "suppliers.write", (context) =>
    context.supabase.rpc("shop_catalog_create_supplier", {
      p_name: input.name,
      p_shop_id: context.selectedShop.shopId,
    }),
  );
}

export async function updateSupplier(
  input: CatalogEntityUpdateInput,
): Promise<ShopAdminActionResult> {
  if (!input.id || !input.name.trim()) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { name: "Supplier id and name are required." },
      ok: false,
    });
  }

  return rpcResult(input.requestedShopId, "suppliers.write", (context) =>
    context.supabase.rpc("shop_catalog_update_supplier", {
      p_name: input.name,
      p_shop_id: context.selectedShop.shopId,
      p_supplier_id: input.id,
    }),
  );
}

export async function archiveSupplier(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return rpcResult(input.requestedShopId, "suppliers.write", (context) =>
    context.supabase.rpc("shop_catalog_archive_supplier", {
      p_reason: input.reason,
      p_shop_id: context.selectedShop.shopId,
      p_supplier_id: input.id,
    }),
  );
}

export async function createCategory(
  input: CatalogEntityInput,
): Promise<ShopAdminActionResult> {
  if (!input.name.trim()) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { name: "Category name is required." },
      ok: false,
    });
  }

  return rpcResult(input.requestedShopId, "categories.write", (context) =>
    context.supabase.rpc("shop_catalog_create_category", {
      p_name: input.name,
      p_shop_id: context.selectedShop.shopId,
    }),
  );
}

export async function updateCategory(
  input: CatalogEntityUpdateInput,
): Promise<ShopAdminActionResult> {
  if (!input.id || !input.name.trim()) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { name: "Category id and name are required." },
      ok: false,
    });
  }

  return rpcResult(input.requestedShopId, "categories.write", (context) =>
    context.supabase.rpc("shop_catalog_update_category", {
      p_category_id: input.id,
      p_name: input.name,
      p_shop_id: context.selectedShop.shopId,
    }),
  );
}

export async function archiveCategory(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return rpcResult(input.requestedShopId, "categories.write", (context) =>
    context.supabase.rpc("shop_catalog_archive_category", {
      p_category_id: input.id,
      p_reason: input.reason,
      p_shop_id: context.selectedShop.shopId,
    }),
  );
}

function validateProductInput(input: ProductMutationInput) {
  const fieldErrors: Record<string, string> = {};

  if (!input.barcode.trim()) {
    fieldErrors.barcode = "Barcode is required.";
  }

  if (!input.productName.trim()) {
    fieldErrors.productName = "Product name is required.";
  }

  if (
    hasInvalidNumber(
      input.purchasePrice,
      input.retailPrice,
      input.stockQuantity,
    )
  ) {
    fieldErrors.number = "Prices and quantities must be valid numbers.";
  }

  if (!nonNegativeFields(input)) {
    fieldErrors.number = "Prices and quantities cannot be negative.";
  }

  return fieldErrors;
}

export async function createProduct(
  input: ProductMutationInput,
): Promise<ShopAdminActionResult> {
  const fieldErrors = validateProductInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  return rpcResult(input.requestedShopId, "products.write", (context) =>
    context.supabase.rpc("shop_catalog_create_product", {
      p_barcode: input.barcode,
      p_category_id: cleanUuid(input.categoryId),
      p_item_number: input.itemNumber,
      p_product_name: input.productName,
      p_purchase_price: input.purchasePrice,
      p_retail_price: input.retailPrice,
      p_second_product_name: input.secondProductName,
      p_shop_id: context.selectedShop.shopId,
      p_stock_quantity: input.stockQuantity,
      p_supplier_id: cleanUuid(input.supplierId),
    }),
  );
}

export async function updateProduct(
  input: ProductUpdateInput,
): Promise<ShopAdminActionResult> {
  const fieldErrors = validateProductInput(input);

  if (!input.productId) {
    fieldErrors.productId = "Product id is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  return rpcResult(input.requestedShopId, "products.write", (context) =>
    context.supabase.rpc("shop_catalog_update_product", {
      p_barcode: input.barcode,
      p_category_id: cleanUuid(input.categoryId),
      p_item_number: input.itemNumber,
      p_product_id: input.productId,
      p_product_name: input.productName,
      p_purchase_price: input.purchasePrice,
      p_retail_price: input.retailPrice,
      p_second_product_name: input.secondProductName,
      p_shop_id: context.selectedShop.shopId,
      p_stock_quantity: input.stockQuantity,
      p_supplier_id: cleanUuid(input.supplierId),
    }),
  );
}

export async function archiveProduct(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  return rpcResult(input.requestedShopId, "products.write", (context) =>
    context.supabase.rpc("shop_catalog_archive_product", {
      p_product_id: input.id,
      p_reason: input.reason,
      p_shop_id: context.selectedShop.shopId,
    }),
  );
}
