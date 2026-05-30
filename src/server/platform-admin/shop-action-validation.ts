import "server-only";

import type { ShopStatus } from "@/domain/platform-admin/types";
import type {
  CreateShopInput,
  ShopStatusActionInput,
  SoftDeleteShopInput,
} from "./action-types";

const shopCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export function normalizeShopCode(value: string) {
  return value.trim().toUpperCase();
}

export function validateRequiredReason(value: string) {
  return value.trim().length > 0;
}

export function isValidShopCode(value: string) {
  return shopCodePattern.test(normalizeShopCode(value));
}

export function canTransitionShopStatus(
  status: ShopStatus,
  action: "suspend" | "reactivate" | "soft_delete",
) {
  if (action === "suspend") {
    return status === "active" || status === "pending_setup";
  }

  if (action === "reactivate") {
    return status === "suspended";
  }

  return status === "active" || status === "pending_setup" || status === "suspended";
}

export function validateCreateShopInput(input: CreateShopInput) {
  const fieldErrors: Record<string, string> = {};
  const shopCode = normalizeShopCode(input.shopCode);

  if (!input.shopName.trim()) {
    fieldErrors.shopName = "Shop name is required.";
  }

  if (!isValidShopCode(shopCode)) {
    fieldErrors.shopCode = "Shop code must be 3-32 uppercase letters, numbers, underscore, or dash.";
  }

  if (!input.ownerProfileId.trim()) {
    fieldErrors.ownerProfileId = "Initial owner is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      shopCode,
      shopName: input.shopName.trim(),
      reason: input.reason.trim(),
    },
  };
}

export function validateShopStatusActionInput(input: ShopStatusActionInput) {
  const fieldErrors: Record<string, string> = {};

  if (!input.shopId.trim()) {
    fieldErrors.shopId = "Shop is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  if (!input.confirmation.trim()) {
    fieldErrors.confirmation = "Confirmation is required.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      reason: input.reason.trim(),
      confirmation: input.confirmation.trim().toUpperCase(),
    },
  };
}

export function validateSoftDeleteShopInput(input: SoftDeleteShopInput) {
  const fieldErrors: Record<string, string> = {};

  if (!input.shopId.trim()) {
    fieldErrors.shopId = "Shop is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  if (!input.shopCodeConfirmation.trim()) {
    fieldErrors.shopCodeConfirmation = "Shop code confirmation is required.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      reason: input.reason.trim(),
      shopCodeConfirmation: normalizeShopCode(input.shopCodeConfirmation),
    },
  };
}
