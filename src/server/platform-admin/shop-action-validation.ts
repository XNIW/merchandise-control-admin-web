import "server-only";

import type { ShopStatus } from "@/domain/platform-admin/types";
import type {
  CreateShopInput,
  CreatePosFirstShopInput,
  CreateShopWithOwnerBootstrapInput,
  EmergencyRevokeDeviceInput,
  FiscalIdentityInput,
  PendingOwnerInviteInput,
  PendingOwnerInviteWithFiscalInput,
  PlatformAdminGrantInput,
  PlatformAdminRevokeInput,
  RestoreShopInput,
  ShopStatusActionInput,
  SoftDeleteShopInput,
} from "./action-types";
import { INITIAL_MANAGER_DISPLAY_NAME as defaultInitialManagerDisplayName } from "./action-types";

const shopCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const ownerEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rutPattern = /^[0-9]{1,8}-[0-9K]$/;

export function normalizeShopCode(value: string) {
  return value.trim().toUpperCase();
}

export function validateRequiredReason(value: string) {
  return value.trim().length > 0;
}

export function normalizeOwnerContact(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeRut(value: string) {
  return value.trim().replaceAll(".", "").replace(/\s+/g, "").toUpperCase();
}

function normalizeBusinessField(value: string, maxLength = 160) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function isValidShopCode(value: string) {
  return shopCodePattern.test(normalizeShopCode(value));
}

function validateFiscalIdentityInput(input: FiscalIdentityInput) {
  const normalized = {
    businessAddress: normalizeBusinessField(input.businessAddress, 180),
    businessCity: normalizeBusinessField(input.businessCity, 120),
    businessGiro: normalizeBusinessField(input.businessGiro, 160),
    companyRut: normalizeRut(input.companyRut),
    legalRepresentativeRut: normalizeRut(input.legalRepresentativeRut),
  };
  const fieldErrors: Record<string, string> = {};

  if (!rutPattern.test(normalized.companyRut)) {
    fieldErrors.companyRut = "Use Chilean RUT format without dots, for example 76123456-7.";
  }

  if (!normalized.businessGiro) {
    fieldErrors.businessGiro = "Business giro is required.";
  }

  if (!normalized.businessAddress) {
    fieldErrors.businessAddress = "Business address is required.";
  }

  if (!normalized.businessCity) {
    fieldErrors.businessCity = "Business city is required.";
  }

  if (!rutPattern.test(normalized.legalRepresentativeRut)) {
    fieldErrors.legalRepresentativeRut =
      "Use Chilean RUT format without dots, for example 12345678-9.";
  }

  return {
    fieldErrors,
    normalized,
  };
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

export function validateCreateShopWithOwnerBootstrapInput(
  input: CreateShopWithOwnerBootstrapInput,
) {
  const base = validateCreateShopInput(input);
  const fiscal = validateFiscalIdentityInput(input);
  const fieldErrors: Record<string, string> = {
    ...base.fieldErrors,
    ...fiscal.fieldErrors,
  };

  return {
    fieldErrors,
    normalized: {
      ...base.normalized,
      ...fiscal.normalized,
      staffDisplayName: defaultInitialManagerDisplayName,
    },
  };
}

export function validateCreatePosFirstShopInput(input: CreatePosFirstShopInput) {
  const fiscal = validateFiscalIdentityInput(input);
  const shopCode = normalizeShopCode(input.shopCode);
  const shopName = normalizeBusinessField(input.shopName, 160);
  const reason = input.reason.trim();
  const fieldErrors: Record<string, string> = {
    ...fiscal.fieldErrors,
  };

  if (!shopName) {
    fieldErrors.shopName = "Shop name is required.";
  }

  if (!isValidShopCode(shopCode)) {
    fieldErrors.shopCode = "Shop code must be 3-32 uppercase letters, numbers, underscore, or dash.";
  }

  if (!validateRequiredReason(reason)) {
    fieldErrors.reason = "Reason is required.";
  }

  return {
    fieldErrors,
    normalized: {
      ...fiscal.normalized,
      reason,
      shopCode,
      shopName,
      staffDisplayName: defaultInitialManagerDisplayName,
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

export function validatePendingOwnerInviteWithFiscalInput(
  input: PendingOwnerInviteWithFiscalInput,
) {
  const base = validatePendingOwnerInviteInput(input);
  const fiscal = validateFiscalIdentityInput(input);

  return {
    fieldErrors: {
      ...base.fieldErrors,
      ...fiscal.fieldErrors,
    },
    normalized: {
      ...base.normalized,
      ...fiscal.normalized,
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
