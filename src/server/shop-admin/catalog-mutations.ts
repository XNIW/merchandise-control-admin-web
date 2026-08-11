import "server-only";

import {
  CATALOG_TEXT_LIMITS,
  canonicalizeCatalogDisplayText,
  catalogTextReasonMessage,
  validateCatalogIdentityText,
} from "@/lib/catalog-text-policy";
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
  updateCatalogProductAssignments,
  updateCategoryAsStaff,
  updateProductAsStaff,
  updateSupplierAsStaff,
  type CatalogProductAssignmentScope,
} from "./staff-aware-mutations";

const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
type PersonalReadyShopActionContext = Extract<
  ReadyShopActionContext,
  { principalKind: "personal_account" }
>;
type CatalogSyncDescriptor = {
  entity: CatalogSyncEntity;
  operation: CatalogSyncOperation;
};
type LinkedActiveProducts = {
  ids: string[];
  scope: CatalogProductAssignmentScope;
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
  expectedUpdatedAt: string;
  productId: string;
};

function catalogDisplayValue(
  value: string | undefined,
  options: { maxLength: number; required: boolean },
) {
  return canonicalizeCatalogDisplayText(value ?? "", options);
}

function catalogIdentityValue(
  value: string | undefined,
  options: { maxLength: number; required: boolean },
) {
  return validateCatalogIdentityText(value ?? "", options);
}

function canonicalCatalogEntityName(
  value: string,
  maxLength: number,
): { error?: string; value?: string } {
  const result = catalogDisplayValue(value, {
    maxLength,
    required: true,
  });

  return result.status === "rejected"
    ? { error: catalogTextReasonMessage(result.reason) }
    : { value: result.value };
}

function canonicalCatalogProductInput(input: ProductMutationInput) {
  const fieldErrors: Record<string, string> = {};
  const barcode = catalogIdentityValue(input.barcode, {
    maxLength: CATALOG_TEXT_LIMITS.barcode,
    required: true,
  });
  const itemNumber = catalogIdentityValue(input.itemNumber, {
    maxLength: CATALOG_TEXT_LIMITS.itemNumber,
    required: false,
  });
  const productName = catalogDisplayValue(input.productName, {
    maxLength: CATALOG_TEXT_LIMITS.productName,
    required: false,
  });
  const secondProductName = catalogDisplayValue(input.secondProductName, {
    maxLength: CATALOG_TEXT_LIMITS.secondProductName,
    required: false,
  });

  for (const [field, result] of [
    ["barcode", barcode],
    ["itemNumber", itemNumber],
    ["productName", productName],
    ["secondProductName", secondProductName],
  ] as const) {
    if (result.status === "rejected") {
      fieldErrors[field] = catalogTextReasonMessage(result.reason);
    }
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

  if (
    barcode.status === "rejected" ||
    itemNumber.status === "rejected" ||
    productName.status === "rejected" ||
    secondProductName.status === "rejected"
  ) {
    return { fieldErrors };
  }

  const resolvedProductName =
    productName.value || secondProductName.value || itemNumber.value;

  if (!resolvedProductName) {
    return {
      fieldErrors: {
        ...fieldErrors,
        productName:
          "A required catalog text value is empty after normalization.",
      },
    };
  }

  return {
    fieldErrors,
    input: {
      ...input,
      barcode: barcode.value,
      itemNumber: itemNumber.value || undefined,
      productName: resolvedProductName,
      secondProductName: secondProductName.value || undefined,
    },
  };
}

function cleanUuid(value: string | undefined) {
  const result = validateCatalogIdentityText(value ?? "", {
    maxLength: 256,
    required: false,
  });

  return result.status !== "rejected" &&
    CANONICAL_UUID_PATTERN.test(result.value)
    ? result.value
    : undefined;
}

function cleanExpectedUpdatedAt(value: string | undefined) {
  const revision = value?.trim();

  return revision &&
    revision.length <= 64 &&
    /(?:z|[+-]\d{2}:\d{2})$/i.test(revision) &&
    Number.isFinite(Date.parse(revision))
    ? revision
    : undefined;
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
  call: (context: PersonalReadyShopActionContext) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>,
  syncDescriptor?: CatalogSyncDescriptor,
  expectedTargetId?: string,
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

  if (context.principalKind === "pos_staff_manager") {
    return withSyncEvent(await staffCall(context));
  }

  const { data, error } = await call(context);

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const result = mapShopAdminRpcResult(data);
  const resultIsBound =
    result.shopId === context.selectedShop.shopId &&
    result.ok === (result.code === "success") &&
    (!result.ok || (
      typeof result.targetId === "string" &&
      CANONICAL_UUID_PATTERN.test(result.targetId) &&
      (expectedTargetId === undefined || result.targetId === expectedTargetId)
    ));

  return resultIsBound
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export async function createSupplier(
  input: CatalogEntityInput,
): Promise<ShopAdminActionResult> {
  const name = canonicalCatalogEntityName(
    input.name,
    CATALOG_TEXT_LIMITS.supplierName,
  );

  if (!name.value) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { name: name.error ?? "Supplier name is required." },
      ok: false,
    });
  }

  return rpcResult(
    input.requestedShopId,
    "suppliers.write",
    (context) => createSupplierAsStaff(context, { name: name.value! }),
    (context) =>
      context.supabase.rpc("shop_catalog_create_supplier_with_sync", {
        p_actor_kind: context.principalKind,
        p_name: name.value!,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "supplier", operation: "create" },
  );
}

export async function updateSupplier(
  input: CatalogEntityUpdateInput,
): Promise<ShopAdminActionResult> {
  const name = canonicalCatalogEntityName(
    input.name,
    CATALOG_TEXT_LIMITS.supplierName,
  );
  const supplierId = cleanUuid(input.id);

  if (!supplierId || !name.value) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        name: name.error ?? "Supplier id and name are required.",
      },
      ok: false,
    });
  }

  return rpcResult(
    input.requestedShopId,
    "suppliers.write",
    (context) => updateSupplierAsStaff(context, { id: supplierId, name: name.value! }),
    (context) =>
      context.supabase.rpc("shop_catalog_update_supplier_with_sync", {
        p_actor_kind: context.principalKind,
        p_name: name.value!,
        p_shop_id: context.selectedShop.shopId,
        p_supplier_id: supplierId,
      }),
    { entity: "supplier", operation: "update" },
    supplierId,
  );
}

export async function archiveSupplier(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  const supplierId = cleanUuid(input.id);

  if (!supplierId) {
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
      archiveSupplierAsStaff(context, { id: supplierId, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_archive_supplier_with_sync", {
        p_actor_kind: context.principalKind,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
        p_supplier_id: supplierId,
      }),
    { entity: "supplier", operation: "archive" },
    supplierId,
  );
}

export async function createCategory(
  input: CatalogEntityInput,
): Promise<ShopAdminActionResult> {
  const name = canonicalCatalogEntityName(
    input.name,
    CATALOG_TEXT_LIMITS.categoryName,
  );

  if (!name.value) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: { name: name.error ?? "Category name is required." },
      ok: false,
    });
  }

  return rpcResult(
    input.requestedShopId,
    "categories.write",
    (context) => createCategoryAsStaff(context, { name: name.value! }),
    (context) =>
      context.supabase.rpc("shop_catalog_create_category_with_sync", {
        p_actor_kind: context.principalKind,
        p_name: name.value!,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "category", operation: "create" },
  );
}

export async function updateCategory(
  input: CatalogEntityUpdateInput,
): Promise<ShopAdminActionResult> {
  const name = canonicalCatalogEntityName(
    input.name,
    CATALOG_TEXT_LIMITS.categoryName,
  );
  const categoryId = cleanUuid(input.id);

  if (!categoryId || !name.value) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        name: name.error ?? "Category id and name are required.",
      },
      ok: false,
    });
  }

  return rpcResult(
    input.requestedShopId,
    "categories.write",
    (context) => updateCategoryAsStaff(context, { id: categoryId, name: name.value! }),
    (context) =>
      context.supabase.rpc("shop_catalog_update_category_with_sync", {
        p_actor_kind: context.principalKind,
        p_category_id: categoryId,
        p_name: name.value!,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "category", operation: "update" },
    categoryId,
  );
}

export async function archiveCategory(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  const categoryId = cleanUuid(input.id);

  if (!categoryId) {
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
      archiveCategoryAsStaff(context, { id: categoryId, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_archive_category_with_sync", {
        p_actor_kind: context.principalKind,
        p_category_id: categoryId,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "category", operation: "archive" },
    categoryId,
  );
}

async function collectLinkedActiveProductIds(input: {
  entity: "category" | "supplier";
  id: string;
  requestedShopId?: string;
}): Promise<LinkedActiveProducts | ShopAdminActionResult> {
  const ids: string[] = [];
  let scope: CatalogProductAssignmentScope | null = null;

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

    if (
      !productsPage.selectedShop ||
      (productsPage.catalogScope !== "legacy_owner_bridge" &&
        productsPage.catalogScope !== "shop_scoped")
    ) {
      return shopAdminActionResult("unauthorized_or_unmapped", { ok: false });
    }

    const pageScope: CatalogProductAssignmentScope = {
      catalogScope: productsPage.catalogScope,
      legacyOwnerUserId: productsPage.legacyOwnerUserId,
      selectedShopId: productsPage.selectedShop.shopId,
    };

    if (!scope) {
      scope = pageScope;
    } else if (
      scope.catalogScope !== pageScope.catalogScope ||
      scope.legacyOwnerUserId !== pageScope.legacyOwnerUserId ||
      scope.selectedShopId !== pageScope.selectedShopId
    ) {
      return shopAdminActionResult("invalid_state", { ok: false });
    }

    ids.push(...productsPage.products.map((product) => product.productId));

    if (!productsPage.pagination.hasNextPage) {
      return { ids, scope: scope ?? pageScope };
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
  scope: CatalogProductAssignmentScope;
}): Promise<ShopAdminActionResult | null> {
  return updateCatalogProductAssignments(input.context, {
    entity: input.entity,
    productIds: input.productIds,
    replacementId: input.replacementId,
    scope: input.scope,
  });
}

async function archiveCatalogEntityWithStrategy(input: {
  archive: (archiveInput: CatalogArchiveInput) => Promise<ShopAdminActionResult>;
  entity: "category" | "supplier";
  permission: "categories.write" | "suppliers.write";
  relationInput: CatalogRelationArchiveInput;
}) {
  const { relationInput } = input;
  const relationId = cleanUuid(relationInput.id);

  if (!relationId) {
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

  // The relation preflight is not represented by a lease-bound catalog read
  // operation yet. Keep the staff path fail-closed instead of reintroducing a
  // generic privileged reader between the staff lease check and mutation.
  if (context.principalKind === "pos_staff_manager") {
    return shopAdminActionResult("permission_denied", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  const linkedProducts = await collectLinkedActiveProductIds({
    entity: input.entity,
    id: relationId,
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
      originalId: relationId,
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
      scope: linkedProducts.scope,
    });

    if (updateError) {
      return updateError;
    }
  }

  return input.archive({
    id: relationId,
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
  return canonicalCatalogProductInput(input).fieldErrors;
}

export async function createProduct(
  input: ProductMutationInput,
): Promise<ShopAdminActionResult> {
  const canonical = canonicalCatalogProductInput(input);
  const { fieldErrors } = canonical;

  if (Object.keys(fieldErrors).length > 0 || !canonical.input) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const canonicalInput = canonical.input;

  return rpcResult(
    canonicalInput.requestedShopId,
    "products.write",
    (context) =>
      createProductAsStaff(context, {
        barcode: canonicalInput.barcode,
        categoryId: cleanUuid(canonicalInput.categoryId),
        itemNumber: canonicalInput.itemNumber,
        productName: canonicalInput.productName,
        purchasePrice: canonicalInput.purchasePrice,
        retailPrice: canonicalInput.retailPrice,
        secondProductName: canonicalInput.secondProductName,
        stockQuantity: canonicalInput.stockQuantity,
        supplierId: cleanUuid(canonicalInput.supplierId),
      }),
    (context) =>
      context.supabase.rpc("shop_catalog_create_product_with_sync", {
        p_actor_kind: context.principalKind,
        p_barcode: canonicalInput.barcode,
        p_category_id: cleanUuid(canonicalInput.categoryId),
        p_item_number: canonicalInput.itemNumber,
        p_product_name: canonicalInput.productName,
        p_purchase_price: canonicalInput.purchasePrice,
        p_retail_price: canonicalInput.retailPrice,
        p_second_product_name: canonicalInput.secondProductName,
        p_shop_id: context.selectedShop.shopId,
        p_stock_quantity: canonicalInput.stockQuantity,
        p_supplier_id: cleanUuid(canonicalInput.supplierId),
      }),
    { entity: "product", operation: "create" },
  );
}

export async function updateProduct(
  input: ProductUpdateInput,
): Promise<ShopAdminActionResult> {
  const canonical = canonicalCatalogProductInput(input);
  const { fieldErrors } = canonical;
  const productId = cleanUuid(input.productId);
  const expectedUpdatedAt = cleanExpectedUpdatedAt(input.expectedUpdatedAt);

  if (!productId) {
    fieldErrors.productId = "Product id is required.";
  }

  if (!expectedUpdatedAt) {
    fieldErrors.expectedUpdatedAt = "Reload this product before saving it.";
  }

  if (
    !productId ||
    !expectedUpdatedAt ||
    Object.keys(fieldErrors).length > 0 ||
    !canonical.input
  ) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const canonicalInput = canonical.input;

  return rpcResult(
    canonicalInput.requestedShopId,
    "products.write",
    (context) =>
      updateProductAsStaff(context, {
        barcode: canonicalInput.barcode,
        categoryId: cleanUuid(canonicalInput.categoryId),
        expectedUpdatedAt,
        itemNumber: canonicalInput.itemNumber,
        productId,
        productName: canonicalInput.productName,
        purchasePrice: canonicalInput.purchasePrice,
        retailPrice: canonicalInput.retailPrice,
        secondProductName: canonicalInput.secondProductName,
        stockQuantity: canonicalInput.stockQuantity,
        supplierId: cleanUuid(canonicalInput.supplierId),
      }),
    (context) =>
      context.supabase.rpc("shop_catalog_update_product_if_revision_with_sync", {
        p_actor_kind: context.principalKind,
        p_barcode: canonicalInput.barcode,
        p_category_id: cleanUuid(canonicalInput.categoryId),
        p_expected_updated_at: expectedUpdatedAt,
        p_item_number: canonicalInput.itemNumber,
        p_product_id: productId,
        p_product_name: canonicalInput.productName,
        p_purchase_price: canonicalInput.purchasePrice,
        p_retail_price: canonicalInput.retailPrice,
        p_second_product_name: canonicalInput.secondProductName,
        p_shop_id: context.selectedShop.shopId,
        p_stock_quantity: canonicalInput.stockQuantity,
        p_supplier_id: cleanUuid(canonicalInput.supplierId),
      }),
    { entity: "product", operation: "update" },
    productId,
  );
}

export async function archiveProduct(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  const productId = cleanUuid(input.id);

  if (!productId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(input);

  if (typeof reason !== "string") {
    return reason;
  }

  return rpcResult(
    input.requestedShopId,
    "products.write",
    (context) => archiveProductAsStaff(context, { id: productId, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_archive_product_with_sync", {
        p_actor_kind: context.principalKind,
        p_product_id: productId,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "product", operation: "archive" },
    productId,
  );
}

export async function restoreProduct(
  input: CatalogArchiveInput,
): Promise<ShopAdminActionResult> {
  const productId = cleanUuid(input.id);

  if (!productId) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const reason = catalogReasonRequired(input);

  if (typeof reason !== "string") {
    return reason;
  }

  return rpcResult(
    input.requestedShopId,
    "products.write",
    (context) => restoreProductAsStaff(context, { id: productId, reason }),
    (context) =>
      context.supabase.rpc("shop_catalog_restore_product_with_sync", {
        p_actor_kind: context.principalKind,
        p_product_id: productId,
        p_reason: reason,
        p_shop_id: context.selectedShop.shopId,
      }),
    { entity: "product", operation: "restore" },
    productId,
  );
}
