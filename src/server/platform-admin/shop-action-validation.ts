import "server-only";

import type { ShopStatus } from "@/domain/platform-admin/types";
import type {
  CreateShopInput,
  EmergencyRevokeDeviceInput,
  PendingOwnerInviteInput,
  PlatformAdminGrantInput,
  PlatformAdminRevokeInput,
  RestoreShopInput,
  ShopStatusActionInput,
  SoftDeleteShopInput,
} from "./action-types";

const shopCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const ownerEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeShopCode(value: string) {
  return value.trim().toUpperCase();
}

export function validateRequiredReason(value: string) {
  return value.trim().length > 0;
}

export function normalizeOwnerContact(value: string) {
  return value.trim().toLowerCase();
}

export function isValidShopCode(value: string) {
  return shopCodePattern.test(normalizeShopCode(value));
}

export function canTransitionShopStatus(
  status: ShopStatus,
  action: "suspend" | "reactivate" | "soft_delete" | "restore",
) {
  if (action === "suspend") {
    return status === "active" || status === "pending_setup";
  }

  if (action === "reactivate") {
    return status === "suspended";
  }

  if (action === "restore") {
    return status === "archived";
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

export function validatePendingOwnerInviteInput(input: PendingOwnerInviteInput) {
  const fieldErrors: Record<string, string> = {};
  const shopCode = normalizeShopCode(input.shopCode);
  const ownerContact = normalizeOwnerContact(input.ownerContact);

  if (!input.shopName.trim()) {
    fieldErrors.shopName = "Shop name is required.";
  }

  if (!isValidShopCode(shopCode)) {
    fieldErrors.shopCode = "Shop code must be 3-32 uppercase letters, numbers, underscore, or dash.";
  }

  if (!ownerEmailPattern.test(ownerContact)) {
    fieldErrors.ownerContact = "Owner email is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      ownerContact,
      reason: input.reason.trim(),
      shopCode,
      shopName: input.shopName.trim(),
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

export function validateRestoreShopInput(input: RestoreShopInput) {
  return validateSoftDeleteShopInput(input);
}

export function validateEmergencyRevokeDeviceInput(
  input: EmergencyRevokeDeviceInput,
) {
  const fieldErrors: Record<string, string> = {};

  if (!input.shopDeviceId.trim()) {
    fieldErrors.shopDeviceId = "Device is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  if (!input.confirmation.trim()) {
    fieldErrors.confirmation = "Shop code confirmation is required.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      confirmation: normalizeShopCode(input.confirmation),
      reason: input.reason.trim(),
      shopDeviceId: input.shopDeviceId.trim(),
    },
  };
}

export function validatePlatformAdminGrantInput(input: PlatformAdminGrantInput) {
  const fieldErrors: Record<string, string> = {};

  if (!input.profileId.trim()) {
    fieldErrors.profileId = "Profile is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  if (input.confirmation.trim().toUpperCase() !== "GRANT") {
    fieldErrors.confirmation = "Type GRANT to confirm.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      confirmation: input.confirmation.trim().toUpperCase(),
      profileId: input.profileId.trim(),
      reason: input.reason.trim(),
    },
  };
}

export function validatePlatformAdminRevokeInput(input: PlatformAdminRevokeInput) {
  const fieldErrors: Record<string, string> = {};

  if (!input.profileId.trim()) {
    fieldErrors.profileId = "Profile is required.";
  }

  if (!validateRequiredReason(input.reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  if (input.confirmation.trim().toUpperCase() !== "REVOKE") {
    fieldErrors.confirmation = "Type REVOKE to confirm.";
  }

  return {
    fieldErrors,
    normalized: {
      ...input,
      confirmation: input.confirmation.trim().toUpperCase(),
      profileId: input.profileId.trim(),
      reason: input.reason.trim(),
    },
  };
}
