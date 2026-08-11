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
  adminOrderReasonCodes,
  adminOrderTransitionOperations,
  transitionAdminCustomerOrder,
  type AdminOrderReasonCode,
  type AdminOrderTransitionOperation,
} from "@/server/shop-admin/order-mutations";

function safeReturnPath(formData: FormData) {
  const raw = optionalFormString(formData, "return_to");
  if (!raw || raw.length > 2048) return "/shop/orders";
  try {
    const parsed = new URL(raw, "https://admin.invalid");
    if (parsed.origin !== "https://admin.invalid" || parsed.pathname !== "/shop/orders") {
      return "/shop/orders";
    }
    parsed.searchParams.delete("action");
    parsed.searchParams.delete("result");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/shop/orders";
  }
}

function resultRedirect(result: ShopAdminActionResult, returnPath: string): never {
  revalidatePath("/shop/orders");
  const parsed = new URL(returnPath, "https://admin.invalid");
  parsed.searchParams.set("action", result.code);
  parsed.searchParams.set("result", result.ok ? "success" : "error");
  redirect(`${parsed.pathname}?${parsed.searchParams.toString()}`);
}

export async function transitionAdminOrderAction(formData: FormData) {
  const returnPath = safeReturnPath(formData);
  const requestedShopId = optionalFormString(formData, "shop_id");
  const orderId = formString(formData, "order_id");
  const idempotencyKey = formString(formData, "idempotency_key");
  const correlationId = formString(formData, "correlation_id");
  const rawOperation = formString(formData, "operation");
  const rawReason = optionalFormString(formData, "reason_code");
  const expectedStatusVersion = optionalFormNumber(
    formData,
    "expected_status_version",
  );
  const confirmed = formString(formData, "confirmed") === "yes";
  const operation = adminOrderTransitionOperations.includes(
    rawOperation as AdminOrderTransitionOperation,
  )
    ? (rawOperation as AdminOrderTransitionOperation)
    : null;
  const reasonCode = rawReason && adminOrderReasonCodes.includes(
    rawReason as AdminOrderReasonCode,
  )
    ? (rawReason as AdminOrderReasonCode)
    : undefined;

  if (
    !confirmed ||
    !operation ||
    expectedStatusVersion === undefined ||
    !Number.isSafeInteger(expectedStatusVersion)
  ) {
    resultRedirect(
      shopAdminActionResult("validation_failed", {
        ok: false,
        shopId: requestedShopId,
        targetId: orderId,
      }),
      returnPath,
    );
  }

  const result = await transitionAdminCustomerOrder({
    correlationId,
    expectedStatusVersion,
    idempotencyKey,
    operation,
    orderId,
    reasonCode,
    requestedShopId,
  });
  resultRedirect(result, returnPath);
}
