import "server-only";

import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import {
  getShopCatalogOptionsReadModel,
  getShopInventoryProductsPage,
} from "./inventory-read-model";
import {
  emitCatalogMutationSyncEvent,
  type CatalogSyncEntity,
  type CatalogSyncOperation,
} from "./sync-event-writer";
import {
  archiveCategoryAsStaff,
  archiveProductAsStaff,
  archiveSupplierAsStaff,
  createCategoryAsStaff,
  createProductAsStaff,
  createSupplierAsStaff,
  restoreProductAsStaff,
  runStaffAwareShopAdminMutation,
  updateCategoryAsStaff,
  updateProductAsStaff,
  updateSupplierAsStaff,
} from "./staff-aware-mutations";

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

export type CatalogEntityArchiveStrategy =
  | "clear_assignments"
  | "create_replacement"
  | "delete_if_unused"
  | "replace_existing";

type CatalogRelationArchiveInput = CatalogArchiveInput & {
  replacementId?: string;
  replacementName?: string;
  strategy: CatalogEntityArchiveStrategy;
};

type ReadyShopActionContext = Extract<
  Awaited<ReturnType<typeof resolveShopActionContext>>,
  { status: "ready" }
>;
type StaffReadyShopActionContext = Extract<
  ReadyShopActionContext,
  { principalKind: "pos_staff_manager" }
>;
type CatalogSyncDescriptor = {
  entity: CatalogSyncEntity;
  operation: CatalogSyncOperation;
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

function catalogReasonRequired(input: CatalogArchiveInput) {
  const reason = input.reason?.trim();

  if (!reason) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        reason: "A reason is required for catalog archive or restore actions.",
      },
      ok: false,
    });
  }

  return reason.slice(0, 240);
}

async function rpcResult(
  requestedShopId: string | undefined,
  permission: "products.write" | "categories.write" | "suppliers.write",
  staffCall: (context: StaffReadyShopActionContext) => Promise<ShopAdminActionResult>,
  call: (context: ReadyShopActionContext) => PromiseLike<{ data: unknown; error: unknown }>,
  syncDescriptor?: CatalogSyncDescriptor,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(requestedShopId, permission);

  if (context.status !== "ready") {
    return context.result;
  }

  const withSyncEvent = async (result: ShopAdminActionResult) => {
    if (!syncDescriptor) {
      return result;
    }

    const syncResult = await emitCatalogMutationSyncEvent({
      context,
      result,
      ...syncDescriptor,
    });

    if (syncResult.ok) {
      return result;
    }

    return shopAdminActionResult(syncResult.code, {
      auditEventId: result.auditEventId,
      ok: false,
      shopId: result.shopId ?? context.selectedShop.shopId,
      targetId: result.targetId,
    });
  };

  const staffResult = await runStaffAwareShopAdminMutation(context, staffCall);

  if (staffResult) {
    return withSyncEvent(staffResult);
  }

  const { data, error } = await call(context);

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return withSyncEvent(mapShopAdminRpcResult(data));
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

  return rpcResult(
    input.requestedShopId,
    "suppliers.write",
    (context) => createSupplierAsStaff(context, { name: input.name }),
    (context) =>
      context.supabase.rpc("shop_catalog_create_supplier", {
        p_name: input.name,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "supplier", operation: "create" },
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

  return rpcResult(
    input.requestedShopId,
    "suppliers.write",
    (context) => updateSupplierAsStaff(context, { id: input.id, name: input.name }),
    (context) =>
      context.supabase.rpc("shop_catalog_update_supplier", {
        p_name: input.name,
        p_shop_id: context.selectedShop.shopId,
        p_supplier_id: input.id,
      }),
    { entity: "supplier", operation: "update" },
  );
}

export async function archiveSupplier(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(input);

  if (typeof reason !== "string") {
    return reason;
  }

  return rpcResult(
    input.requestedShopId,
    "suppliers.write",
    (context) =>
      archiveSupplierAsStaff(context, { id: input.id, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_archive_supplier", {
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_supplier_id: input.id,
      }),
    { entity: "supplier", operation: "archive" },
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

  return rpcResult(
    input.requestedShopId,
    "categories.write",
    (context) => createCategoryAsStaff(context, { name: input.name }),
    (context) =>
      context.supabase.rpc("shop_catalog_create_category", {
        p_name: input.name,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "category", operation: "create" },
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

  return rpcResult(
    input.requestedShopId,
    "categories.write",
    (context) => updateCategoryAsStaff(context, { id: input.id, name: input.name }),
    (context) =>
      context.supabase.rpc("shop_catalog_update_category", {
        p_category_id: input.id,
        p_name: input.name,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "category", operation: "update" },
  );
}

export async function archiveCategory(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(input);

  if (typeof reason !== "string") {
    return reason;
  }

  return rpcResult(
    input.requestedShopId,
    "categories.write",
    (context) =>
      archiveCategoryAsStaff(context, { id: input.id, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_archive_category", {
        p_category_id: input.id,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "category", operation: "archive" },
  );
}

async function collectLinkedActiveProductIds(input: {
  entity: "category" | "supplier";
  id: string;
  requestedShopId?: string;
}): Promise<{ ids: string[] } | ShopAdminActionResult> {
  const ids: string[] = [];

  for (let page = 1; page <= 200; page += 1) {
    const productsPage = await getShopInventoryProductsPage({
      filters:
        input.entity === "supplier"
          ? {
              state: "active",
              supplierId: input.id,
            }
          : {
              categoryId: input.id,
              state: "active",
            },
      includeExactTotals: false,
      page,
      pageSize: 200,
      requestedShopId: input.requestedShopId,
    });

    if (productsPage.status !== "ready") {
      return shopAdminActionResult("unauthorized_or_unmapped", { ok: false });
    }

    ids.push(...productsPage.products.map((product) => product.productId));

    if (!productsPage.pagination.hasNextPage) {
      return { ids };
    }
  }

  return shopAdminActionResult("invalid_state", { ok: false });
}

async function validateReplacementEntity(input: {
  entity: "category" | "supplier";
  originalId: string;
  replacementId: string;
  requestedShopId?: string;
}): Promise<ShopAdminActionResult | null> {
  if (!input.replacementId || input.replacementId === input.originalId) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        replacementId:
          "Choose another active catalog row as the replacement.",
      },
      ok: false,
    });
  }

  const readModel = await getShopCatalogOptionsReadModel({
    requestedShopId: input.requestedShopId,
  });

  if (readModel.status !== "ready") {
    return shopAdminActionResult("unauthorized_or_unmapped", { ok: false });
  }

  const exists =
    input.entity === "supplier"
      ? readModel.suppliers.some(
          (supplier) => supplier.supplierId === input.replacementId,
        )
      : readModel.categories.some(
          (category) => category.categoryId === input.replacementId,
        );

  if (!exists) {
    return shopAdminActionResult(
      input.entity === "supplier" ? "invalid_supplier" : "invalid_category",
      { ok: false },
    );
  }

  return null;
}

async function createReplacementEntity(input: {
  entity: "category" | "supplier";
  name?: string;
  requestedShopId?: string;
}): Promise<string | ShopAdminActionResult> {
  const name = input.name?.trim();

  if (!name) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        replacementName: "Replacement name is required.",
      },
      ok: false,
    });
  }

  const result =
    input.entity === "supplier"
      ? await createSupplier({ name, requestedShopId: input.requestedShopId })
      : await createCategory({ name, requestedShopId: input.requestedShopId });

  if (!result.ok || !result.targetId) {
    return result.ok
      ? shopAdminActionResult("db_failure", { ok: false })
      : result;
  }

  return result.targetId;
}

async function updateLinkedProductAssignments(input: {
  context: ReadyShopActionContext;
  entity: "category" | "supplier";
  productIds: readonly string[];
  replacementId: string | null;
}): Promise<ShopAdminActionResult | null> {
  const now = new Date().toISOString();
  const payload =
    input.entity === "supplier"
      ? {
          supplier_id: input.replacementId,
          updated_at: now,
        }
      : {
          category_id: input.replacementId,
          updated_at: now,
        };

  for (let index = 0; index < input.productIds.length; index += 100) {
    const chunk = input.productIds.slice(index, index + 100);
    const { data, error } = await input.context.supabase
      .from("inventory_products")
      .update(payload)
      .in("id", chunk)
      .select("id");

    if (error) {
      return shopAdminActionResult("db_failure", {
        ok: false,
        shopId: input.context.selectedShop.shopId,
      });
    }

    if ((data?.length ?? 0) !== chunk.length) {
      return shopAdminActionResult("partial_failure", {
        ok: false,
        shopId: input.context.selectedShop.shopId,
      });
    }
  }

  return null;
}

async function archiveCatalogEntityWithStrategy(input: {
  archive: (archiveInput: CatalogArchiveInput) => Promise<ShopAdminActionResult>;
  entity: "category" | "supplier";
  permission: "categories.write" | "suppliers.write";
  relationInput: CatalogRelationArchiveInput;
}) {
  const { relationInput } = input;

  if (!relationInput.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(relationInput);

  if (typeof reason !== "string") {
    return reason;
  }

  const context = await resolveShopActionContext(
    relationInput.requestedShopId,
    input.permission,
  );

  if (context.status !== "ready") {
    return context.result;
  }

  const linkedProducts = await collectLinkedActiveProductIds({
    entity: input.entity,
    id: relationInput.id,
    requestedShopId: relationInput.requestedShopId,
  });

  if ("ok" in linkedProducts) {
    return linkedProducts;
  }

  if (
    relationInput.strategy === "delete_if_unused" &&
    linkedProducts.ids.length > 0
  ) {
    return shopAdminActionResult("invalid_state", {
      fieldErrors: {
        strategy:
          "This row is linked to active products. Choose a reassignment strategy before deleting it.",
      },
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  let replacementId: string | null = null;

  if (relationInput.strategy === "replace_existing") {
    replacementId = cleanUuid(relationInput.replacementId) ?? "";
    const replacementError = await validateReplacementEntity({
      entity: input.entity,
      originalId: relationInput.id,
      replacementId,
      requestedShopId: relationInput.requestedShopId,
    });

    if (replacementError) {
      return replacementError;
    }
  } else if (relationInput.strategy === "create_replacement") {
    const createdReplacement = await createReplacementEntity({
      entity: input.entity,
      name: relationInput.replacementName,
      requestedShopId: relationInput.requestedShopId,
    });

    if (typeof createdReplacement !== "string") {
      return createdReplacement;
    }

    replacementId = createdReplacement;
  } else if (relationInput.strategy === "clear_assignments") {
    replacementId = null;
  }

  if (
    linkedProducts.ids.length > 0 &&
    relationInput.strategy !== "delete_if_unused"
  ) {
    const updateError = await updateLinkedProductAssignments({
      context,
      entity: input.entity,
      productIds: linkedProducts.ids,
      replacementId,
    });

    if (updateError) {
      return updateError;
    }
  }

  return input.archive({
    id: relationInput.id,
    reason,
    requestedShopId: relationInput.requestedShopId,
  });
}

export async function archiveSupplierWithStrategy(
  input: CatalogRelationArchiveInput,
): Promise<ShopAdminActionResult> {
  return archiveCatalogEntityWithStrategy({
    archive: archiveSupplier,
    entity: "supplier",
    permission: "suppliers.write",
    relationInput: input,
  });
}

export async function archiveCategoryWithStrategy(
  input: CatalogRelationArchiveInput,
): Promise<ShopAdminActionResult> {
  return archiveCatalogEntityWithStrategy({
    archive: archiveCategory,
    entity: "category",
    permission: "categories.write",
    relationInput: input,
  });
}

export function validateCatalogProductInput(input: ProductMutationInput) {
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
  const fieldErrors = validateCatalogProductInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  return rpcResult(
    input.requestedShopId,
    "products.write",
    (context) =>
      createProductAsStaff(context, {
        ...input,
        categoryId: cleanUuid(input.categoryId),
        supplierId: cleanUuid(input.supplierId),
      }),
    (context) =>
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
    { entity: "product", operation: "create" },
  );
}

export async function updateProduct(
  input: ProductUpdateInput,
): Promise<ShopAdminActionResult> {
  const fieldErrors = validateCatalogProductInput(input);

  if (!input.productId) {
    fieldErrors.productId = "Product id is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  return rpcResult(
    input.requestedShopId,
    "products.write",
    (context) =>
      updateProductAsStaff(context, {
        ...input,
        categoryId: cleanUuid(input.categoryId),
        supplierId: cleanUuid(input.supplierId),
      }),
    (context) =>
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
    { entity: "product", operation: "update" },
  );
}

export async function archiveProduct(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(input);

  if (typeof reason !== "string") {
    return reason;
  }

  return rpcResult(
    input.requestedShopId,
    "products.write",
    (context) => archiveProductAsStaff(context, { id: input.id, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_archive_product", {
        p_product_id: input.id,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "product", operation: "archive" },
  );
}

export async function restoreProduct(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  if (!input.id) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(input);

  if (typeof reason !== "string") {
    return reason;
  }

  return rpcResult(
    input.requestedShopId,
    "products.write",
    (context) => restoreProductAsStaff(context, { id: input.id, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_restore_product", {
        p_product_id: input.id,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "product", operation: "restore" },
  );
}
