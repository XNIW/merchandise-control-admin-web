import type { ShopStatus } from "@/domain/platform-admin/types";

export type PlatformShopActionCode =
  | "success"
  | "auth_mismatch"
  | "unauthorized"
  | "not_configured"
  | "validation_failed"
  | "audit_write_failed"
  | "duplicate_shop_code"
  | "duplicate_company_rut"
  | "owner_not_found"
  | "owner_not_active"
  | "profile_not_found"
  | "profile_not_active"
  | "member_not_found"
  | "admin_not_found"
  | "self_lockout_blocked"
  | "last_admin_blocked"
  | "already_active"
  | "invalid_state"
  | "not_archived"
  | "unsafe_purge_target"
  | "dependencies_blocked"
  | "shop_not_found"
  | "device_not_found"
  | "conflict"
  | "db_failure";

export type PlatformShopActionResult = {
  ok: boolean;
  code: PlatformShopActionCode;
  message: string;
  shopId?: string;
  auditEventId?: string;
  fieldErrors?: Record<string, string>;
  formError?: string;
};

export type PlatformShopProvisioningFormValues = {
  businessAddress: string;
  businessCity: string;
  businessGiro: string;
  companyRut: string;
  legalRepresentativeRut: string;
  ownerContact: string;
  ownerProfileId: string;
  ownerSetupMode: string;
  reason: string;
  shopCode: string;
  shopName: string;
  useCompanyRutAsShopCode: boolean;
};

export type PlatformShopProvisioningResult = PlatformShopActionResult & {
  companyRut?: string;
  credentialGenerated?: boolean;
  ownerMode?: string;
  ownerStatus?: string;
  shopCode?: string;
  shopName?: string;
  staffCode?: string;
  staffId?: string;
  temporaryCredential?: string;
  values?: PlatformShopProvisioningFormValues;
};

export type PlatformShopProfileFormValues = {
  businessAddress: string;
  businessCity: string;
  businessGiro: string;
  companyRut: string;
  confirmation: string;
  legalRepresentativeRut: string;
  reason: string;
  shopName: string;
};

export const INITIAL_MANAGER_DISPLAY_NAME = "manager" as const;

export type FiscalIdentityInput = {
  businessAddress: string;
  businessCity: string;
  businessGiro: string;
  companyRut: string;
  legalRepresentativeRut: string;
};

export type CreateShopInput = {
  shopName: string;
  shopCode: string;
  ownerProfileId: string;
  reason: string;
};

export type MapShopInventorySourceInput = {
  shopId: string;
  ownerProfileId: string;
  reason: string;
};

export type PlatformShopInventorySourceMappingResult =
  PlatformShopActionResult & {
    mappingState?: string;
    shopInventorySourceId?: string;
  };

export type CreateShopWithOwnerBootstrapInput = CreateShopInput &
  FiscalIdentityInput;

export type CreatePosFirstShopInput = FiscalIdentityInput & {
  reason: string;
  shopCode: string;
  shopName: string;
};

export type PendingOwnerInviteInput = {
  shopName: string;
  shopCode: string;
  ownerContact: string;
  reason: string;
};

export type PendingOwnerInviteWithFiscalInput = PendingOwnerInviteInput &
  FiscalIdentityInput;

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

export type RestoreShopInput = SoftDeleteShopInput;

export type ActivateShopInput = SoftDeleteShopInput;

export type PurgeShopInput = {
  confirmation: string;
  mode?: "force_test" | "normal";
  reason: string;
  shopId: string;
};

export type PlatformShopMemberRole = "shop_owner" | "shop_manager";

export type AssignShopMemberInput = {
  shopId: string;
  profileId: string;
  roleKey: string;
  shopCodeConfirmation: string;
  reason: string;
};

export type RevokeShopMemberInput = {
  shopId: string;
  shopMemberId: string;
  shopCodeConfirmation: string;
  reason: string;
};

export type EmergencyRevokeDeviceInput = {
  shopDeviceId: string;
  reason: string;
  confirmation: string;
};

export type UpdateShopProfileInput = PlatformShopProfileFormValues & {
  shopId: string;
};

export type PlatformAdminGrantInput = {
  profileId: string;
  reason: string;
  confirmation: string;
};

export type PlatformAdminRevokeInput = PlatformAdminGrantInput;

export type ShopStatusTransition = {
  from: ShopStatus;
  action: "activate" | "suspend" | "reactivate" | "soft_delete" | "restore";
};

const messageByCode: Record<PlatformShopActionCode, string> = {
  success: "Operation completed.",
  auth_mismatch: "Master Console session changed. Refresh and sign in again.",
  unauthorized: "You are not authorized to perform this operation.",
  not_configured: "Platform Admin runtime is not configured.",
  validation_failed: "Check the required fields and try again.",
  audit_write_failed: "Audit write failed for the controlled profile update.",
  duplicate_shop_code: "A shop with this code already exists.",
  duplicate_company_rut: "A shop with this company RUT already exists.",
  owner_not_found: "The selected owner could not be used.",
  owner_not_active: "The selected owner could not be used.",
  profile_not_found: "The selected profile could not be used.",
  profile_not_active: "The selected profile could not be used.",
  member_not_found: "The selected membership could not be found.",
  admin_not_found: "The selected Platform Admin grant could not be found.",
  self_lockout_blocked: "The operation was blocked to prevent self-lockout.",
  last_admin_blocked: "The operation was blocked because at least one Platform Admin must remain active.",
  already_active: "The selected Platform Admin grant is already active.",
  invalid_state: "This operation is not available for the current shop state.",
  not_archived: "The shop must be archived before it can be purged.",
  unsafe_purge_target: "Purge is limited to synthetic test/local/staging shops.",
  dependencies_blocked: "The shop still has dependencies that block physical delete.",
  shop_not_found: "The selected shop could not be found.",
  device_not_found: "The selected device could not be found.",
  conflict: "The operation could not be completed because of a conflict.",
  db_failure: "The controlled database action failed without exposing internal details.",
};

export function platformShopActionResult(
  code: PlatformShopActionCode,
  options: {
    auditEventId?: string;
    fieldErrors?: Record<string, string>;
    formError?: string;
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
    formError: options.formError,
  };
}
