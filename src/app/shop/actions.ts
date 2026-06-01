"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveCategory,
  archiveProduct,
  archiveSupplier,
  createCategory,
  createProduct,
  createSupplier,
  restoreProduct,
  updateCategory,
  updateProduct,
  updateSupplier,
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
  resetStaffCredential,
  suspendStaff,
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

export async function createProductAction(formData: FormData) {
  resultRedirect("/shop/products", await createProduct(catalogProductInput(formData)));
}

export async function updateProductAction(formData: FormData) {
  resultRedirect(
    "/shop/products",
    await updateProduct({
      ...catalogProductInput(formData),
      productId: formString(formData, "productId"),
    }),
  );
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
      id: formString(formData, "productId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
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
      id: formString(formData, "productId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
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

export async function registerDeviceAction(formData: FormData) {
  resultRedirect(
    "/shop/devices",
    await registerDevice({
      appVersion: optionalFormString(formData, "appVersion"),
      deviceIdentifier: formString(formData, "deviceIdentifier"),
      deviceType: optionalFormString(formData, "deviceType"),
      displayName: optionalFormString(formData, "displayName"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function renameDeviceAction(formData: FormData) {
  resultRedirect(
    "/shop/devices",
    await renameDevice({
      deviceId: formString(formData, "deviceId"),
      displayName: formString(formData, "displayName"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function revokeDeviceAction(formData: FormData) {
  if (!confirmed(formData, "REVOKE")) {
    resultRedirect(
      "/shop/devices",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/devices",
    await revokeDevice({
      deviceId: formString(formData, "deviceId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
  );
}

export async function reactivateDeviceAction(formData: FormData) {
  if (!confirmed(formData, "REACTIVATE")) {
    resultRedirect(
      "/shop/devices",
      shopAdminActionResult("validation_failed", { ok: false }),
    );
  }

  resultRedirect(
    "/shop/devices",
    await reactivateDevice({
      deviceId: formString(formData, "deviceId"),
      reason: optionalFormString(formData, "reason"),
      requestedShopId: requestedShopId(formData),
    }),
    requestedShopId(formData),
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
