import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import {
  callStaffWebStorefrontBulkMutation,
  callStaffWebStorefrontFulfillmentMutation,
  callStaffWebStorefrontPaymentMutation,
  callStaffWebStorefrontMutation,
  callStaffWebStorefrontPromotionMutation,
} from "./staff-web-lease-bound-rpc";

type StorefrontPublicationMutationInput = {
  compareAtPriceClp?: number;
  deliveryEnabled: boolean;
  expectedVersion: number;
  featured: boolean;
  idempotencyKey: string;
  pickupEnabled: boolean;
  priceSourceMode: string;
  promotionEndsAt?: string;
  promotionStartsAt?: string;
  publicBrand?: string;
  publicCategoryId?: string;
  publicDescription?: string;
  publicName: string;
  publicationStatus: string;
  publishedImageVersionId?: string;
  requestedShopId?: string;
  reservationEnabled: boolean;
  retailPriceClp: number;
  sortRank: number;
  sourceProductId: string;
};

function permissionForPublicationStatus(status: string) {
  return status === "draft" ? "storefront.edit" as const : "storefront.publish" as const;
}

function toJsonPayload(input: StorefrontPublicationMutationInput) {
  return {
    compareAtPrice: input.compareAtPriceClp,
    deliveryEnabled: input.deliveryEnabled,
    featured: input.featured,
    pickupEnabled: input.pickupEnabled,
    priceSourceMode: input.priceSourceMode,
    homeOrder: input.sortRank,
    promotionEndsAt: input.promotionEndsAt,
    promotionStartsAt: input.promotionStartsAt,
    publicBrand: input.publicBrand,
    storefrontCategoryId: input.publicCategoryId,
    publicDescription: input.publicDescription,
    publicName: input.publicName,
    publicImageId: input.publishedImageVersionId,
    reservationEnabled: input.reservationEnabled,
    publicPrice: input.retailPriceClp,
    sourceProductId: input.sourceProductId,
  } satisfies Record<string, Json | undefined>;
}

async function callMutation(
  context: Extract<Awaited<ReturnType<typeof resolveShopActionContext>>, { status: "ready" }>,
  operation: "archive" | "hide" | "publish" | "save_draft" | "schedule",
  payload: Record<string, Json | undefined>,
  idempotencyKey: string,
  expectedVersion: number,
): Promise<ShopAdminActionResult> {
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("storefront_publication_authoring_mutate_v1", {
        p_expected_version: expectedVersion,
        p_idempotency_key: idempotencyKey,
        p_operation: operation,
        p_payload: payload,
        p_shop_id: context.selectedShop.shopId,
      })
    : await callStaffWebStorefrontMutation(
        context,
        operation,
        payload,
        idempotencyKey,
        expectedVersion,
      );

  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const result = mapShopAdminRpcResult(rpc.data);
  return result.shopId === context.selectedShop.shopId
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export async function upsertStorefrontPublication(
  input: StorefrontPublicationMutationInput,
) {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }
  const context = await resolveShopActionContext(
    input.requestedShopId,
    permissionForPublicationStatus(input.publicationStatus),
  );
  if (context.status !== "ready") return context.result;
  const operation =
    input.publicationStatus === "draft"
      ? "save_draft"
      : input.publicationStatus === "scheduled"
        ? "schedule"
        : input.publicationStatus === "published"
          ? "publish"
          : input.publicationStatus === "paused"
            ? "hide"
            : "archive";
  const payload =
    operation === "hide" || operation === "archive"
      ? { sourceProductId: input.sourceProductId }
      : toJsonPayload(input);
  return callMutation(
    context,
    operation,
    payload,
    input.idempotencyKey,
    input.expectedVersion,
  );
}

export async function bulkSetStorefrontPublicationStatus(input: {
  idempotencyKey: string;
  items: readonly { expectedVersion: number; publicationId: string }[];
  operation: "bulk_hide" | "bulk_publish";
  requestedShopId?: string;
}) {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "storefront.bulk_publish",
  );
  if (context.status !== "ready") return context.result;
  if (
    input.items.length < 1 ||
    input.items.length > 100 ||
    input.items.some(
      (item) => !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 0,
    )
  ) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_storefront_publication_bulk_mutate_v2", {
        p_idempotency_key: input.idempotencyKey,
        p_items: [...input.items],
        p_operation: input.operation,
        p_shop_id: context.selectedShop.shopId,
      })
    : await callStaffWebStorefrontBulkMutation(
        context,
        input.operation,
        [...input.items],
        input.idempotencyKey,
      );
  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const result = mapShopAdminRpcResult(rpc.data);
  return result.shopId === context.selectedShop.shopId
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export type StorefrontPromotionMutationInput = {
  discountType: "fixed_price_clp" | "percentage_bps";
  discountValue: number;
  endsAt: string;
  excludedPublicationIds: readonly string[];
  priority: number;
  promotionId?: string;
  publicDescription?: string;
  publicName: string;
  publicationIds: readonly string[];
  publicationStatus: string;
  requestedShopId?: string;
  startsAt: string;
  timeZone: "America/Santiago" | "UTC";
};

export async function upsertStorefrontPromotion(
  input: StorefrontPromotionMutationInput,
) {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "storefront.promotions.manage",
  );
  if (context.status !== "ready") return context.result;
  if (
    !Number.isSafeInteger(input.discountValue) ||
    !Number.isSafeInteger(input.priority) ||
    input.publicationIds.length > 500 ||
    input.excludedPublicationIds.length > input.publicationIds.length
  ) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }
  const payload = {
    discountType: input.discountType,
    discountValue: input.discountValue,
    endsAt: input.endsAt,
    excludedPublicationIds: [...input.excludedPublicationIds],
    priority: input.priority,
    promotionId: input.promotionId,
    publicDescription: input.publicDescription,
    publicName: input.publicName,
    publicationIds: [...input.publicationIds],
    publicationStatus: input.publicationStatus,
    startsAt: input.startsAt,
    timeZone: input.timeZone,
  } satisfies Record<string, Json | undefined>;
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_storefront_promotion_mutate_v1", {
        p_operation: "upsert",
        p_payload: payload,
        p_shop_id: context.selectedShop.shopId,
      })
    : await callStaffWebStorefrontPromotionMutation(context, payload);
  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const result = mapShopAdminRpcResult(rpc.data);
  return result.shopId === context.selectedShop.shopId
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export type StorefrontFulfillmentOperation =
  | "pickup_upsert"
  | "settings_upsert"
  | "slot_upsert"
  | "zone_upsert";

export async function mutateStorefrontFulfillment(input: {
  operation: StorefrontFulfillmentOperation;
  payload: Record<string, Json | undefined>;
  requestedShopId?: string;
}) {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "storefront.settings.manage",
  );
  if (context.status !== "ready") return context.result;
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_storefront_fulfillment_mutate_v1", {
        p_operation: input.operation,
        p_payload: input.payload,
        p_shop_id: context.selectedShop.shopId,
      })
    : await callStaffWebStorefrontFulfillmentMutation(
        context,
        input.operation,
        input.payload,
      );
  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const result = mapShopAdminRpcResult(rpc.data);
  return result.shopId === context.selectedShop.shopId
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}

export async function mutateStorefrontPayment(input: {
  payload: Record<string, Json | undefined>;
  requestedShopId?: string;
}) {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "storefront.settings.manage",
  );
  if (context.status !== "ready") return context.result;
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_storefront_payment_mutate_v1", {
        p_payload: input.payload,
        p_shop_id: context.selectedShop.shopId,
      })
    : await callStaffWebStorefrontPaymentMutation(context, input.payload);
  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  const result = mapShopAdminRpcResult(rpc.data);
  return result.shopId === context.selectedShop.shopId
    ? result
    : shopAdminActionResult("db_failure", {
        ok: false,
        shopId: context.selectedShop.shopId,
      });
}
