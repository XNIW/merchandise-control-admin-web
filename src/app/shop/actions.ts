"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveCategory,
  archiveCategoryWithStrategy,
  archiveProduct,
  archiveSupplier,
  archiveSupplierWithStrategy,
  createCategory,
  createProduct,
  createSupplier,
  restoreProduct,
  updateCategory,
  updateProduct,
  updateSupplier,
  validateCatalogProductInput,
  type CatalogEntityArchiveStrategy,
  type ProductMutationInput,
} from "@/server/shop-admin/catalog-mutations";
import {
  formString,
  optionalFormNumber,
  optionalFormString,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "@/server/shop-admin/action-context";
import {
  archiveStaff,
  clearStaffLockout,
  createStaff,
  forceStaffCredentialRotation,
  reactivateStaff,
  revokeStaffWebAccess,
  revokeStaffWebSessions,
  resetStaffCredential,
  suspendStaff,
  updateStaffRolePermissions,
  type StaffMutationResult,
} from "@/server/shop-admin/staff-mutations";
import {
  reactivateDevice,
  registerDevice,
  renameDevice,
  revokeDevice,
} from "@/server/shop-admin/device-mutations";
import {
  inviteShopMember,
  removeShopMember,
  updateShopMemberRole,
} from "@/server/shop-admin/member-mutations";
import { getShopInventoryReadModel } from "@/server/shop-admin/inventory-read-model";
import {
  createHistoryEntry,
  tombstoneHistoryEntry,
  updateHistoryEntry,
} from "@/server/shop-admin/history-mutations";
import { recordPosSyncRecoveryAction } from "@/server/shop-admin/pos-sync-recovery-mutations";

export type ShopAdminActionState = ShopAdminActionResult & {
  temporaryCredential?: string;
};

const initialActionState = shopAdminActionResult("success", {
  ok: true,
});

function requestedShopId(formData: FormData) {
  return optionalFormString(formData, "shop_id");
}

function resultRedirect(
  path: string,
  result: ShopAdminActionResult,
  requestedShopId?: string,
) {
  revalidatePath(path);

  const params = new URLSearchParams({
    action: result.code,
    result: result.ok ? "success" : "error",
  });
  const shopId = result.shopId ?? requestedShopId;

  if (shopId) {
    params.set("shop_id", shopId);
  }

  redirect(`${path}?${params.toString()}`);
}

function confirmed(formData: FormData, value: string) {
  return formString(formData, "confirmation").trim().toUpperCase() === value;
}

function catalogProductInput(formData: FormData) {
  return {
    barcode: formString(formData, "barcode"),
    categoryId: optionalFormString(formData, "categoryId"),
    itemNumber: optionalFormString(formData, "itemNumber"),
    productName: formString(formData, "productName"),
    purchasePrice: optionalFormNumber(formData, "purchasePrice"),
    requestedShopId: requestedShopId(formData),
    retailPrice: optionalFormNumber(formData, "retailPrice"),
    secondProductName: optionalFormString(formData, "secondProductName"),
    stockQuantity: optionalFormNumber(formData, "stockQuantity"),
    supplierId: optionalFormString(formData, "supplierId"),
  };
}

type CatalogRelationKind = "supplier" | "category";

function normalizeCatalogRelationName(value?: string) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function relationNameKey(value: string) {
  return value.trim().toLowerCase();
}

async function retryCatalogRelationLookup(
  kind: CatalogRelationKind,
  requestedShopId: string | undefined,
  name: string,
) {
  const readModel = await getShopInventoryReadModel({ requestedShopId });

  if (readModel.status !== "ready") {
    return undefined;
  }

  const key = relationNameKey(name);

  if (kind === "supplier") {
    return readModel.suppliers.find(
      (supplier) => relationNameKey(supplier.name) === key,
    )?.supplierId;
  }

  return readModel.categories.find(
    (category) => relationNameKey(category.name) === key,
  )?.categoryId;
}

async function lookupCatalogRelation(
  kind: CatalogRelationKind,
  formData: FormData,
  currentId: string | undefined,
  currentName: string | undefined,
): Promise<{ id?: string } | ShopAdminActionResult> {
  const requested = requestedShopId(formData);
  const name = normalizeCatalogRelationName(currentName);

  if (!currentId && !name) {
    return { id: undefined };
  }

  const readModel = await getShopInventoryReadModel({
    requestedShopId: requested,
  });

  if (readModel.status !== "ready") {
    return shopAdminActionResult("unauthorized_or_unmapped", {
      ok: false,
    });
  }

  const options =
    kind === "supplier"
      ? readModel.suppliers.map((supplier) => ({
          id: supplier.supplierId,
          name: supplier.name,
        }))
      : readModel.categories.map((category) => ({
          id: category.categoryId,
          name: category.name,
        }));
  const byId = currentId
    ? options.find((option) => option.id === currentId)
    : undefined;

  if (currentId && !byId) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        [`${kind}Id`]: `Selected ${kind} does not belong to this shop.`,
      },
      ok: false,
    });
  }

  if (byId && name && relationNameKey(byId.name) !== relationNameKey(name)) {
    const relationMismatchMessage =
      kind === "supplier"
        ? "supplier id and name do not match."
        : "category id and name do not match.";

    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        [`${kind}Name`]: relationMismatchMessage,
      },
      ok: false,
    });
  }

  if (byId) {
    return { id: byId.id };
  }

  const existingByName = options.find(
    (option) => relationNameKey(option.name) === relationNameKey(name),
  );

  if (existingByName) {
    return { id: existingByName.id };
  }

  const createResult =
    kind === "supplier"
      ? await createSupplier({ name, requestedShopId: requested })
      : await createCategory({ name, requestedShopId: requested });

  if (createResult.ok && createResult.targetId) {
    return { id: createResult.targetId };
  }

  if (createResult.code === "conflict" || createResult.ok) {
    const retryId = await retryCatalogRelationLookup(kind, requested, name);

    if (retryId) {
      return { id: retryId };
    }
  }

  return createResult;
}

async function resolveProductCatalogRelations(
  formData: FormData,
  input: ProductMutationInput,
): Promise<ProductMutationInput | ShopAdminActionResult> {
  const fieldErrors = validateCatalogProductInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const supplier = await lookupCatalogRelation(
    "supplier",
    formData,
    input.supplierId,
    optionalFormString(formData, "supplierName"),
  );

  if ("ok" in supplier) {
    return supplier;
  }

  const category = await lookupCatalogRelation(
    "category",
    formData,
    input.categoryId,
    optionalFormString(formData, "categoryName"),
  );

  if ("ok" in category) {
    return category;
  }

  return {
    ...input,
    categoryId: category.id,
    supplierId: supplier.id,
  };
}

async function catalogProductId(formData: FormData) {
  const productId = optionalFormString(formData, "productId");

  if (productId) {
    return productId;
  }

  const productLookup = optionalFormString(formData, "productLookup");

  if (!productLookup) {
    return "";
  }

  const readModel = await getShopInventoryReadModel({
    requestedShopId: requestedShopId(formData),
  });

  if (readModel.status !== "ready") {
    return productLookup;
  }

  const normalizedLookup = productLookup.trim().toLowerCase();
  const product = [...readModel.products, ...readModel.archivedProducts].find(
    (row) =>
      row.productId.toLowerCase() === normalizedLookup ||
      row.barcode.toLowerCase() === normalizedLookup ||
      row.itemNumber?.toLowerCase() === normalizedLookup,
  );

  return product?.productId ?? productLookup;
}

export async function createProductAction(formData: FormData) {
  const input = catalogProductInput(formData);
  const resolvedInput = await resolveProductCatalogRelations(formData, input);

  resultRedirect(
    "/shop/products",
    "ok" in resolvedInput
      ? resolvedInput
      : await createProduct({
          ...resolvedInput,
        }),
  );
}

export async function updateProductAction(formData: FormData) {
  const productId = await catalogProductId(formData);
  const input = catalogProductInput(formData);
  const resolvedInput = productId
    ? await resolveProductCatalogRelations(formData, input)
    : shopAdminActionResult("validation_failed", {
        fieldErrors: { productId: "Product id is required." },
        ok: false,
      });

  resultRedirect(
    "/shop/products",
    "ok" in resolvedInput
      ? resolvedInput
      : await updateProduct({
          ...resolvedInput,
          productId,
        }),
  );
}

export async function updateProductInlineAction(
  _previousState: ShopAdminActionState = initialActionState,
  formData: FormData,
): Promise<ShopAdminActionState> {
  void _previousState;

  const productId = await catalogProductId(formData);
  const input = catalogProductInput(formData);
  const resolvedInput = productId
    ? await resolveProductCatalogRelations(formData, input)
    : shopAdminActionResult("validation_failed", {
        fieldErrors: { productId: "Product id is required." },
        ok: false,
      });
  const result =
    "ok" in resolvedInput
      ? resolvedInput
      : await updateProduct({
          ...resolvedInput,
          productId,
        });

  revalidatePath("/shop/products");

  return result;
}

export async function archiveProductAction(formData: FormData) {
  if (!confirmed(formData, "ARCHIVE")) {
    resultRedirect(
      "/shop/products",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/products",
    await archiveProduct({
      id: await catalogProductId(formData),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function archiveProductInlineAction(
  _previousState: ShopAdminActionState = initialActionState,
  formData: FormData,
): Promise<ShopAdminActionState> {
  void _previousState;

  if (!confirmed(formData, "ARCHIVE")) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const result = await archiveProduct({
    id: await catalogProductId(formData),
    reason: optionalFormString(formData, "reason"),
    requestedShopId: requestedShopId(formData),
  });

  revalidatePath("/shop/products");

  return result;
}

export async function restoreProductAction(formData: FormData) {
  if (!confirmed(formData, "RESTORE")) {
    resultRedirect(
      "/shop/products",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/products",
    await restoreProduct({
      id: await catalogProductId(formData),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function restoreProductInlineAction(
  _previousState: ShopAdminActionState = initialActionState,
  formData: FormData,
): Promise<ShopAdminActionState> {
  void _previousState;

  if (!confirmed(formData, "RESTORE")) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const result = await restoreProduct({
    id: await catalogProductId(formData),
    reason: optionalFormString(formData, "reason"),
    requestedShopId: requestedShopId(formData),
  });

  revalidatePath("/shop/products");

  return result;
}

export async function createCategoryAction(formData: FormData) {
  resultRedirect(
    "/shop/categories",
    await createCategory({
      name: formString(formData, "name"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function updateCategoryAction(formData: FormData) {
  resultRedirect(
    "/shop/categories",
    await updateCategory({
      id: formString(formData, "categoryId"),
      name: formString(formData, "name"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function archiveCategoryAction(formData: FormData) {
  if (!confirmed(formData, "ARCHIVE")) {
    resultRedirect(
      "/shop/categories",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/categories",
    await archiveCategory({
      id: formString(formData, "categoryId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

function catalogArchiveStrategy(formData: FormData): CatalogEntityArchiveStrategy {
  const strategy = formString(formData, "strategy");

  if (
    strategy === "replace_existing" ||
    strategy === "create_replacement" ||
    strategy === "clear_assignments"
  ) {
    return strategy;
  }

  return "delete_if_unused";
}

export async function archiveCategoryWithStrategyAction(formData: FormData) {
  if (!confirmed(formData, "ARCHIVE")) {
    resultRedirect(
      "/shop/categories",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/categories",
    await archiveCategoryWithStrategy({
      id: formString(formData, "categoryId"),
      reason: optionalFormString(formData, "reason"),
      replacementId: optionalFormString(formData, "replacementId"),
      replacementName: optionalFormString(formData, "replacementName"),
      requestedShopId: requestedShopId(formData),
      strategy: catalogArchiveStrategy(formData),
    }),
  );
}

export async function createSupplierAction(formData: FormData) {
  resultRedirect(
    "/shop/suppliers",
    await createSupplier({
      name: formString(formData, "name"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function updateSupplierAction(formData: FormData) {
  resultRedirect(
    "/shop/suppliers",
    await updateSupplier({
      id: formString(formData, "supplierId"),
      name: formString(formData, "name"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function archiveSupplierAction(formData: FormData) {
  if (!confirmed(formData, "ARCHIVE")) {
    resultRedirect(
      "/shop/suppliers",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/suppliers",
    await archiveSupplier({
      id: formString(formData, "supplierId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function archiveSupplierWithStrategyAction(formData: FormData) {
  if (!confirmed(formData, "ARCHIVE")) {
    resultRedirect(
      "/shop/suppliers",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/suppliers",
    await archiveSupplierWithStrategy({
      id: formString(formData, "supplierId"),
      reason: optionalFormString(formData, "reason"),
      replacementId: optionalFormString(formData, "replacementId"),
      replacementName: optionalFormString(formData, "replacementName"),
      requestedShopId: requestedShopId(formData),
      strategy: catalogArchiveStrategy(formData),
    }),
  );
}

function historyEntryInput(formData: FormData) {
  return {
    category: optionalFormString(formData, "category"),
    completeRows: formString(formData, "completeRows") === "on",
    displayName: formString(formData, "displayName"),
    remoteId: optionalFormString(formData, "remoteId"),
    requestedShopId: requestedShopId(formData),
    rowsText: formString(formData, "rowsText"),
    supplier: optionalFormString(formData, "supplier"),
  };
}

export async function createHistoryEntryAction(formData: FormData) {
  resultRedirect(
    "/shop/history",
    await createHistoryEntry(historyEntryInput(formData)),
  );
}

export async function updateHistoryEntryAction(formData: FormData) {
  const remoteId = optionalFormString(formData, "remoteId") ?? "";

  resultRedirect(
    `/shop/history/session:${encodeURIComponent(remoteId)}`,
    await updateHistoryEntry(historyEntryInput(formData)),
  );
}

export async function tombstoneHistoryEntryAction(formData: FormData) {
  const remoteId = optionalFormString(formData, "remoteId") ?? "";

  if (!confirmed(formData, "TOMBSTONE")) {
    resultRedirect(
      `/shop/history/session:${encodeURIComponent(remoteId)}`,
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    `/shop/history/session:${encodeURIComponent(remoteId)}`,
    await tombstoneHistoryEntry({
      reason: optionalFormString(formData, "reason"),
      remoteId,
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function recordPosSyncRecoveryActionAction(formData: FormData) {
  const shopId = requestedShopId(formData);

  resultRedirect(
    "/shop/sync",
    await recordPosSyncRecoveryAction({
      actionType: formString(formData, "actionType"),
      note: optionalFormString(formData, "note"),
      requestedShopId: shopId,
      targetRef: formString(formData, "targetRef"),
    }),
    shopId,
  );
}

function normalizeStaffState(result: ShopAdminActionState) {
  revalidatePath("/shop/staff");

  return result;
}

export async function createStaffAction(
  _previousState: ShopAdminActionState = initialActionState,
  formData: FormData,
): Promise<ShopAdminActionState> {
  void _previousState;

  const result: StaffMutationResult = await createStaff({
    credentialKind: optionalFormString(formData, "credentialKind"),
    displayName: formString(formData, "displayName"),
    requestedShopId: requestedShopId(formData),
    roleKey: formString(formData, "roleKey"),
    staffCode: formString(formData, "staffCode"),
  });

  return normalizeStaffState(result);
}

export async function resetStaffCredentialAction(
  _previousState: ShopAdminActionState = initialActionState,
  formData: FormData,
): Promise<ShopAdminActionState> {
  void _previousState;

  if (!confirmed(formData, "RESET")) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const result = await resetStaffCredential({
    credentialKind: optionalFormString(formData, "credentialKind"),
    reason: optionalFormString(formData, "reason"),
    requestedShopId: requestedShopId(formData),
    staffId: formString(formData, "staffId"),
  });

  return normalizeStaffState(result);
}

export async function suspendStaffAction(formData: FormData) {
  if (!confirmed(formData, "SUSPEND")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await suspendStaff({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function reactivateStaffAction(formData: FormData) {
  if (!confirmed(formData, "REACTIVATE")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await reactivateStaff({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function archiveStaffAction(formData: FormData) {
  if (!confirmed(formData, "ARCHIVE")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await archiveStaff({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function forceStaffCredentialRotationAction(formData: FormData) {
  if (!confirmed(formData, "ROTATE")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await forceStaffCredentialRotation({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function clearStaffLockoutAction(formData: FormData) {
  if (!confirmed(formData, "CLEAR")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await clearStaffLockout({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function revokeStaffWebAccessAction(formData: FormData) {
  if (!confirmed(formData, "REVOKE")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await revokeStaffWebAccess({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function revokeStaffWebSessionsAction(formData: FormData) {
  if (!confirmed(formData, "SESSIONS")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await revokeStaffWebSessions({
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
      staffId: formString(formData, "staffId"),
    }),
  );
}

export async function updateStaffRolePermissionsAction(formData: FormData) {
  const permissions = formData
    .getAll("permissions")
    .filter((value): value is string => typeof value === "string");

  if (!confirmed(formData, "PERMISSIONS")) {
    resultRedirect(
      "/shop/staff",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/staff",
    await updateStaffRolePermissions({
      permissions,
      requestedShopId: requestedShopId(formData),
      roleKey: formString(formData, "roleKey"),
      templateKey: optionalFormString(formData, "templateKey"),
    }),
  );
}

export async function registerDeviceAction(formData: FormData) {
  const selectedShopId = requestedShopId(formData);

  resultRedirect(
    "/shop/devices",
    await registerDevice({
      appVersion: optionalFormString(formData, "appVersion"),
      deviceIdentifier: formString(formData, "deviceIdentifier"),
      deviceType: optionalFormString(formData, "deviceType"),
      displayName: optionalFormString(formData, "displayName"),
      requestedShopId: selectedShopId,
    }),
    selectedShopId,
  );
}

export async function renameDeviceAction(formData: FormData) {
  const selectedShopId = requestedShopId(formData);

  resultRedirect(
    "/shop/devices",
    await renameDevice({
      deviceId: formString(formData, "deviceId"),
      displayName: formString(formData, "displayName"),
      requestedShopId: selectedShopId,
    }),
    selectedShopId,
  );
}

export async function revokeDeviceAction(formData: FormData) {
  const selectedShopId = requestedShopId(formData);

  if (!confirmed(formData, "REVOKE")) {
    resultRedirect(
      "/shop/devices",
      shopAdminActionResult("validation_failed", { ok: false }),
      selectedShopId,
    );
  }

  resultRedirect(
    "/shop/devices",
    await revokeDevice({
      deviceId: formString(formData, "deviceId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: selectedShopId,
    }),
    selectedShopId,
  );
}

export async function reactivateDeviceAction(formData: FormData) {
  const selectedShopId = requestedShopId(formData);

  if (!confirmed(formData, "REACTIVATE")) {
    resultRedirect(
      "/shop/devices",
      shopAdminActionResult("validation_failed", { ok: false }),
      selectedShopId,
    );
  }

  resultRedirect(
    "/shop/devices",
    await reactivateDevice({
      deviceId: formString(formData, "deviceId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: selectedShopId,
    }),
    selectedShopId,
  );
}

export async function inviteShopMemberAction(formData: FormData) {
  const shopId = requestedShopId(formData);

  resultRedirect(
    "/shop/members",
    await inviteShopMember({
      profileId: formString(formData, "profileId"),
      requestedShopId: shopId,
      roleKey: formString(formData, "roleKey"),
    }),
    shopId,
  );
}

export async function updateShopMemberRoleAction(formData: FormData) {
  const shopId = requestedShopId(formData);

  if (!confirmed(formData, "ROLE")) {
    resultRedirect(
      "/shop/members",
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
    );
  }

  resultRedirect(
    "/shop/members",
    await updateShopMemberRole({
      memberId: formString(formData, "memberId"),
      requestedShopId: shopId,
      roleKey: formString(formData, "roleKey"),
    }),
    shopId,
  );
}

export async function removeShopMemberAction(formData: FormData) {
  const shopId = requestedShopId(formData);

  if (!confirmed(formData, "REMOVE")) {
    resultRedirect(
      "/shop/members",
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
    );
  }

  resultRedirect(
    "/shop/members",
    await removeShopMember({
      memberId: formString(formData, "memberId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: shopId,
    }),
    shopId,
  );
}
