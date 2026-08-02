"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  formString,
  optionalFormNumber,
  optionalFormString,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "@/server/shop-admin/action-context";
import {
  bulkSetStorefrontPublicationStatus,
  upsertStorefrontPromotion,
  upsertStorefrontPublication,
} from "@/server/shop-admin/storefront-mutations";

function requestedShopId(formData: FormData) {
  return optionalFormString(formData, "shop_id");
}

function checked(formData: FormData, key: string) {
  return formString(formData, key) === "on";
}

function finiteInteger(value: number | undefined) {
  return value !== undefined && Number.isSafeInteger(value) ? value : undefined;
}

function resultRedirect(
  result: ShopAdminActionResult,
  shopId?: string,
  area?: string,
): never {
  revalidatePath("/shop/storefront");
  const params = new URLSearchParams({
    action: result.code,
    result: result.ok ? "success" : "error",
  });
  const selectedShopId = result.shopId ?? shopId;
  if (selectedShopId) params.set("shop_id", selectedShopId);
  if (area) params.set("area", area);
  redirect(`/shop/storefront?${params.toString()}`);
}

export async function saveStorefrontPublicationAction(formData: FormData) {
  const shopId = requestedShopId(formData);
  const retailPriceClp = finiteInteger(
    optionalFormNumber(formData, "retailPriceClp"),
  );
  const compareAtPriceClp = finiteInteger(
    optionalFormNumber(formData, "compareAtPriceClp"),
  );
  const sortRank = finiteInteger(optionalFormNumber(formData, "sortRank"));
  if (retailPriceClp === undefined || sortRank === undefined) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
    );
  }

  const result = await upsertStorefrontPublication({
    compareAtPriceClp,
    deliveryEnabled: checked(formData, "deliveryEnabled"),
    featured: checked(formData, "featured"),
    pickupEnabled: checked(formData, "pickupEnabled"),
    priceSourceMode: formString(formData, "priceSourceMode"),
    promotionEndsAt: optionalFormString(formData, "promotionEndsAt"),
    promotionStartsAt: optionalFormString(formData, "promotionStartsAt"),
    publicBrand: optionalFormString(formData, "publicBrand"),
    publicCategoryId: optionalFormString(formData, "publicCategoryId"),
    publicDescription: optionalFormString(formData, "publicDescription"),
    publicName: formString(formData, "publicName"),
    publicationStatus: formString(formData, "publicationStatus"),
    publishedImageVersionId: optionalFormString(
      formData,
      "publishedImageVersionId",
    ),
    requestedShopId: shopId,
    reservationEnabled: checked(formData, "reservationEnabled"),
    retailPriceClp,
    sortRank,
    sourceProductId: formString(formData, "sourceProductId"),
  });
  resultRedirect(result, shopId);
}

async function bulkAction(
  operation: "bulk_pause" | "bulk_publish",
  formData: FormData,
) {
  const shopId = requestedShopId(formData);
  const publicationIds = formData
    .getAll("publicationIds")
    .filter((value): value is string => typeof value === "string");
  const result = await bulkSetStorefrontPublicationStatus({
    operation,
    publicationIds,
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId);
}

export async function bulkPublishStorefrontAction(formData: FormData) {
  return bulkAction("bulk_publish", formData);
}

export async function bulkPauseStorefrontAction(formData: FormData) {
  return bulkAction("bulk_pause", formData);
}

export async function saveStorefrontPromotionAction(formData: FormData) {
  const shopId = requestedShopId(formData);
  const discountType = formString(formData, "discountType");
  const timeZone = formString(formData, "timeZone");
  const priority = finiteInteger(optionalFormNumber(formData, "priority"));
  const fixedPriceClp = finiteInteger(
    optionalFormNumber(formData, "fixedPriceClp"),
  );
  const percentage = finiteInteger(
    optionalFormNumber(formData, "discountPercentage"),
  );
  const discountValue = discountType === "percentage_bps"
    ? percentage === undefined ? undefined : percentage * 100
    : fixedPriceClp;
  if (
    (discountType !== "fixed_price_clp" &&
      discountType !== "percentage_bps") ||
    (timeZone !== "America/Santiago" && timeZone !== "UTC") ||
    priority === undefined ||
    discountValue === undefined
  ) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
      "promotions",
    );
  }

  const result = await upsertStorefrontPromotion({
    discountType,
    discountValue,
    endsAt: formString(formData, "endsAt"),
    excludedPublicationIds: formData
      .getAll("excludedPublicationIds")
      .filter((value): value is string => typeof value === "string"),
    priority,
    promotionId: optionalFormString(formData, "promotionId"),
    publicDescription: optionalFormString(formData, "publicDescription"),
    publicName: formString(formData, "publicName"),
    publicationIds: formData
      .getAll("publicationIds")
      .filter((value): value is string => typeof value === "string"),
    publicationStatus: formString(formData, "publicationStatus"),
    requestedShopId: shopId,
    startsAt: formString(formData, "startsAt"),
    timeZone,
  });
  resultRedirect(result, shopId, "promotions");
}
