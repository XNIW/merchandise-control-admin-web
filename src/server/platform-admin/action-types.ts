import type { ShopStatus } from "@/domain/platform-admin/types";

export type PlatformShopActionCode =
  | "success"
  | "unauthorized"
  | "not_configured"
  | "validation_failed"
  | "duplicate_shop_code"
  | "owner_not_found"
  | "owner_not_active"
  | "invalid_state"
  | "shop_not_found"
  | "conflict"
  | "db_failure";

export type PlatformShopActionResult = {
  ok: boolean;
  code: PlatformShopActionCode;
  message: string;
  shopId?: string;
  auditEventId?: string;
  fieldErrors?: Record<string, string>;
};

export type CreateShopInput = {
  shopName: string;
  shopCode: string;
  ownerProfileId: string;
  reason: string;
};

export type ShopStatusActionInput = {
  shopId: string;
  reason: string;
  confirmation: string;
};

export type SoftDeleteShopInput = {
  shopId: string;
  shopCodeConfirmation: string;
  reason: string;
};

export type ShopStatusTransition = {
  from: ShopStatus;
  action: "suspend" | "reactivate" | "soft_delete";
};

const messageByCode: Record<PlatformShopActionCode, string> = {
  success: "Operation completed.",
  unauthorized: "You are not authorized to perform this operation.",
  not_configured: "Platform Admin runtime is not configured.",
  validation_failed: "Check the required fields and try again.",
  duplicate_shop_code: "A shop with this code already exists.",
  owner_not_found: "The selected owner could not be used.",
  owner_not_active: "The selected owner could not be used.",
  invalid_state: "This operation is not available for the current shop state.",
  shop_not_found: "The selected shop could not be found.",
  conflict: "The operation could not be completed because of a conflict.",
  db_failure: "Request could not be completed.",
};

export function platformShopActionResult(
  code: PlatformShopActionCode,
  options: {
    auditEventId?: string;
    fieldErrors?: Record<string, string>;
    ok?: boolean;
    shopId?: string;
  } = {},
): PlatformShopActionResult {
  return {
    ok: options.ok ?? code === "success",
    code,
    message: messageByCode[code],
    shopId: options.shopId,
    auditEventId: options.auditEventId,
    fieldErrors: options.fieldErrors,
  };
}
