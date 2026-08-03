import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";
import {
  callStaffWebStorefrontFulfillmentMutation,
  callStaffWebStorefrontMutation,
  callStaffWebStorefrontPromotionMutation,
} from "./staff-web-lease-bound-rpc";

type StorefrontPublicationMutationInput = {
  compareAtPriceClp?: number;
  deliveryEnabled: boolean;
  featured: boolean;
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
    compareAtPriceClp: input.compareAtPriceClp,
    deliveryEnabled: input.deliveryEnabled,
    featured: input.featured,
    pickupEnabled: input.pickupEnabled,
    priceSourceMode: input.priceSourceMode,
    promotionEndsAt: input.promotionEndsAt,
    promotionStartsAt: input.promotionStartsAt,
    publicBrand: input.publicBrand,
    publicCategoryId: input.publicCategoryId,
    publicDescription: input.publicDescription,
    publicName: input.publicName,
    publicationStatus: input.publicationStatus,
    publishedImageVersionId: input.publishedImageVersionId,
    reservationEnabled: input.reservationEnabled,
    retailPriceClp: input.retailPriceClp,
    sortRank: input.sortRank,
    sourceProductId: input.sourceProductId,
  } satisfies Record<string, Json | undefined>;
}

async function callMutation(
  context: Extract<Awaited<ReturnType<typeof resolveShopActionContext>>, { status: "ready" }>,
  operation: "bulk_pause" | "bulk_publish" | "upsert",
  payload: Record<string, Json | undefined>,
): Promise<ShopAdminActionResult> {
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_storefront_publication_mutate_v1", {
        p_operation: operation,
        p_payload: payload,
        p_shop_id: context.selectedShop.shopId,
      })
    : await callStaffWebStorefrontMutation(context, operation, payload);

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
  const context = await resolveShopActionContext(
    input.requestedShopId,
    permissionForPublicationStatus(input.publicationStatus),
  );
  if (context.status !== "ready") return context.result;
  return callMutation(context, "upsert", toJsonPayload(input));
}

export async function bulkSetStorefrontPublicationStatus(input: {
  operation: "bulk_pause" | "bulk_publish";
  publicationIds: readonly string[];
  requestedShopId?: string;
}) {
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "storefront.bulk_publish",
  );
  if (context.status !== "ready") return context.result;
  if (input.publicationIds.length < 1 || input.publicationIds.length > 100) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }
  return callMutation(context, input.operation, {
    publicationIds: [...input.publicationIds],
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
