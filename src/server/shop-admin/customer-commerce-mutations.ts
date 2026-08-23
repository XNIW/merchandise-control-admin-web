import "server-only";

import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
} from "./action-context";
import {
  callStaffWebAfterSalesTransition,
  callStaffWebCustomerReviewModeration,
} from "./staff-web-lease-bound-rpc";

export const afterSalesTransitionTargets = [
  "reviewing",
  "approved",
  "rejected",
  "returnRequired",
  "received",
  "refundPending",
  "closed",
] as const;
export type AfterSalesTransitionTarget =
  (typeof afterSalesTransitionTargets)[number];

export async function transitionCustomerAfterSales(input: {
  caseId: string;
  expectedVersion: number;
  noteKey?: string;
  requestedShopId?: string;
  targetStatus: AfterSalesTransitionTarget;
}) {
  if (
    !input.caseId ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1 ||
    !afterSalesTransitionTargets.includes(input.targetStatus) ||
    (input.noteKey && !/^[a-z][a-zA-Z0-9_.]{1,119}$/.test(input.noteKey))
  ) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "orders.manage",
  );
  if (context.status !== "ready") return context.result;
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_customer_after_sales_transition_v1", {
        p_case_id: input.caseId,
        p_expected_version: input.expectedVersion,
        p_note_key: input.noteKey,
        p_shop_id: context.selectedShop.shopId,
        p_target_status: input.targetStatus,
      })
    : await callStaffWebAfterSalesTransition(
        {
          actorStaffId: context.actorStaffId,
          selectedShop: context.selectedShop,
          staffWebSession: context.staffWebSession,
        },
        input,
      );
  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  return mapShopAdminRpcResult(rpc.data);
}

export async function moderateCustomerReview(input: {
  expectedVersion: number;
  reason?: string;
  requestedShopId?: string;
  reviewId: string;
  targetStatus: "published" | "rejected";
}) {
  const reason = input.reason?.trim();
  if (
    !input.reviewId ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1 ||
    !["published", "rejected"].includes(input.targetStatus) ||
    (input.targetStatus === "published" && reason) ||
    (input.targetStatus === "rejected" && (!reason || reason.length > 240))
  ) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }
  const context = await resolveShopActionContext(
    input.requestedShopId,
    "storefront.publish",
  );
  if (context.status !== "ready") return context.result;
  const rpc = context.principalKind === "personal_account"
    ? await context.supabase.rpc("admin_customer_review_moderate_v1", {
        p_expected_version: input.expectedVersion,
        p_reason: reason,
        p_review_id: input.reviewId,
        p_shop_id: context.selectedShop.shopId,
        p_target_status: input.targetStatus,
      })
    : await callStaffWebCustomerReviewModeration(
        {
          actorStaffId: context.actorStaffId,
          selectedShop: context.selectedShop,
          staffWebSession: context.staffWebSession,
        },
        {
          expectedVersion: input.expectedVersion,
          reason,
          reviewId: input.reviewId,
          targetStatus: input.targetStatus,
        },
      );
  if (rpc.error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }
  return mapShopAdminRpcResult(rpc.data);
}
