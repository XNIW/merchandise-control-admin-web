"use server";

import { randomUUID } from "node:crypto";
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
  mutateStorefrontFulfillment,
  mutateStorefrontPayment,
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idempotencyKey(formData: FormData) {
  const value = optionalFormString(formData, "idempotencyKey");
  return value && uuidPattern.test(value) ? value : randomUUID();
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
  if (result.ok && result.targetId) params.set("target_id", result.targetId);
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
  const expectedVersion = finiteInteger(
    optionalFormNumber(formData, "expectedVersion"),
  );
  if (
    retailPriceClp === undefined ||
    sortRank === undefined ||
    expectedVersion === undefined ||
    expectedVersion < 0
  ) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
    );
  }

  const result = await upsertStorefrontPublication({
    compareAtPriceClp,
    deliveryEnabled: checked(formData, "deliveryEnabled"),
    expectedVersion,
    featured: checked(formData, "featured"),
    idempotencyKey: idempotencyKey(formData),
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
  operation: "bulk_hide" | "bulk_publish",
  formData: FormData,
) {
  const shopId = requestedShopId(formData);
  const items = formData.getAll("publicationItems").flatMap((value) => {
    if (typeof value !== "string") return [];
    const separator = value.lastIndexOf(":");
    const publicationId = value.slice(0, separator);
    const expectedVersion = Number(value.slice(separator + 1));
    return separator > 0 && uuidPattern.test(publicationId) &&
      Number.isSafeInteger(expectedVersion) && expectedVersion >= 0
      ? [{ expectedVersion, publicationId }]
      : [];
  });
  const result = await bulkSetStorefrontPublicationStatus({
    idempotencyKey: idempotencyKey(formData),
    items,
    operation,
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId);
}

export async function bulkPublishStorefrontAction(formData: FormData) {
  return bulkAction("bulk_publish", formData);
}

export async function bulkPauseStorefrontAction(formData: FormData) {
  return bulkAction("bulk_hide", formData);
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

export async function saveStorefrontFulfillmentSettingsAction(
  formData: FormData,
) {
  const shopId = requestedShopId(formData);
  const result = await mutateStorefrontFulfillment({
    operation: "settings_upsert",
    payload: {
      deliveryEnabled: formData.has("deliveryEnabled"),
      pickupEnabled: formData.has("pickupEnabled"),
      reservationEnabled: formData.has("reservationEnabled"),
    },
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId, "settings");
}

export async function saveStorefrontPaymentSettingsAction(
  formData: FormData,
) {
  const shopId = requestedShopId(formData);
  const expectedRevision = finiteInteger(
    optionalFormNumber(formData, "expectedRevision"),
  );
  if (expectedRevision === undefined || expectedRevision < 0) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
      "payments",
    );
  }
  const result = await mutateStorefrontPayment({
    payload: {
      cashOnDeliveryEnabled: formData.has("cashOnDeliveryEnabled"),
      expectedRevision,
      onlinePaymentEnabled: false,
      payAtPickupEnabled: formData.has("payAtPickupEnabled"),
    },
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId, "payments");
}

export async function saveStorefrontPickupPointAction(formData: FormData) {
  const shopId = requestedShopId(formData);
  const sortRank = finiteInteger(optionalFormNumber(formData, "sortRank"));
  if (sortRank === undefined) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
      "settings",
    );
  }
  const result = await mutateStorefrontFulfillment({
    operation: "pickup_upsert",
    payload: {
      addressLine1: formString(formData, "addressLine1"),
      addressLine2: optionalFormString(formData, "addressLine2"),
      commune: formString(formData, "commune"),
      enabled: checked(formData, "enabled"),
      id: optionalFormString(formData, "pickupPointId"),
      publicInstructions: optionalFormString(formData, "publicInstructions"),
      publicName: formString(formData, "publicName"),
      region: formString(formData, "region"),
      sortRank,
    },
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId, "settings");
}

export async function saveStorefrontDeliveryZoneAction(formData: FormData) {
  const shopId = requestedShopId(formData);
  const feeClp = finiteInteger(optionalFormNumber(formData, "feeClp"));
  const sortRank = finiteInteger(optionalFormNumber(formData, "sortRank"));
  const communes = formString(formData, "communes")
    .split(/[\n,]/)
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value, index, values) =>
      Boolean(value) &&
      values.findIndex(
        (candidate) => candidate.toLocaleLowerCase("es-CL") ===
          value.toLocaleLowerCase("es-CL"),
      ) === index
    );
  if (
    feeClp === undefined ||
    sortRank === undefined ||
    communes.length < 1 ||
    communes.length > 100
  ) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
      "settings",
    );
  }
  const result = await mutateStorefrontFulfillment({
    operation: "zone_upsert",
    payload: {
      communes,
      enabled: checked(formData, "enabled"),
      feeClp,
      id: optionalFormString(formData, "deliveryZoneId"),
      publicName: formString(formData, "publicName"),
      region: formString(formData, "region"),
      sortRank,
    },
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId, "settings");
}

export async function saveStorefrontFulfillmentSlotAction(formData: FormData) {
  const shopId = requestedShopId(formData);
  const mode = formString(formData, "mode");
  const timeZone = formString(formData, "timeZone");
  const capacity = finiteInteger(optionalFormNumber(formData, "capacity"));
  if (
    (mode !== "pickup" && mode !== "reservation" && mode !== "delivery") ||
    (timeZone !== "America/Santiago" && timeZone !== "UTC") ||
    capacity === undefined
  ) {
    resultRedirect(
      shopAdminActionResult("validation_failed", { ok: false }),
      shopId,
      "settings",
    );
  }
  const result = await mutateStorefrontFulfillment({
    operation: "slot_upsert",
    payload: {
      capacity,
      deliveryZoneId: mode === "delivery"
        ? formString(formData, "deliveryZoneId")
        : undefined,
      enabled: checked(formData, "enabled"),
      endsAt: formString(formData, "endsAt"),
      id: optionalFormString(formData, "slotId"),
      mode,
      pickupPointId: mode === "delivery"
        ? undefined
        : formString(formData, "pickupPointId"),
      publicLabel: formString(formData, "publicLabel"),
      startsAt: formString(formData, "startsAt"),
      timeZone,
    },
    requestedShopId: shopId,
  });
  resultRedirect(result, shopId, "settings");
}
