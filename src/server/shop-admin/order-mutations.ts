import "server-only";

import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
} from "./action-context";
import { callStaffWebCustomerOrderTransition } from "./staff-web-lease-bound-rpc";

export const adminOrderTransitionOperations = [
  "accept",
  "reject",
  "preparing",
  "ready",
  "out_for_delivery",
  "complete",
  "cancel",
] as const;

export type AdminOrderTransitionOperation =
  (typeof adminOrderTransitionOperations)[number];

export const adminOrderReasonCodes = [
  "customer_request",
  "item_unavailable",
  "shop_closed",
  "capacity_unavailable",
  "delivery_unavailable",
  "payment_unavailable",
  "operational_error",
  "other",
] as const;

export type AdminOrderReasonCode = (typeof adminOrderReasonCodes)[number];

export async function transitionAdminCustomerOrder(input: {
  correlationId: string;
  expectedStatusVersion: number;
  idempotencyKey: string;
  operation: AdminOrderTransitionOperation;
  orderId: string;
  reasonCode?: AdminOrderReasonCode;
  requestedShopId?: string;
}) {
  if (
    !Number.isSafeInteger(input.expectedStatusVersion) ||
    input.expectedStatusVersion < 1 ||
    !adminOrderTransitionOperations.includes(input.operation) ||
    ((input.operation === "reject" || input.operation === "cancel") &&
      !input.reasonCode) ||
    (input.operation !== "reject" &&
      input.operation !== "cancel" &&
      input.reasonCode !== undefined)
  ) {
    return shopAdminActionResult("validation_failed", { ok: false });
  }

  const context = await resolveShopActionContext(
    input.requestedShopId,
    "orders.manage",
  );
  if (context.status !== "ready") return context.result;

  const rpc =
    context.principalKind === "personal_account"
      ? await context.supabase.rpc("admin_customer_order_transition_v1", {
          p_correlation_id: input.correlationId,
          p_expected_status_version: input.expectedStatusVersion,
          p_idempotency_key: input.idempotencyKey,
          p_operation: input.operation,
          p_order_id: input.orderId,
          p_reason_code: input.reasonCode,
          p_shop_id: context.selectedShop.shopId,
        })
      : await callStaffWebCustomerOrderTransition(context, input);
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
