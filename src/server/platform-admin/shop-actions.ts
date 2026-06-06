import "server-only";

import { randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashStaffCredential } from "@/server/shop-admin/staff-credentials";
import { authorizeCurrentPlatformAdmin } from "./authz";
import {
  INITIAL_MANAGER_DISPLAY_NAME,
  platformShopActionResult,
  type CreatePosFirstShopInput,
  type CreateShopInput,
  type CreateShopWithOwnerBootstrapInput,
  type EmergencyRevokeDeviceInput,
  type PendingOwnerInviteInput,
  type PendingOwnerInviteWithFiscalInput,
  type PlatformShopActionCode,
  type PlatformShopProvisioningResult,
  type PlatformShopActionResult,
  type RestoreShopInput,
  type ShopStatusActionInput,
  type SoftDeleteShopInput,
} from "./action-types";
import {
  validateCreateShopInput,
  validateCreatePosFirstShopInput,
  validateCreateShopWithOwnerBootstrapInput,
  validateEmergencyRevokeDeviceInput,
  validatePendingOwnerInviteInput,
  validatePendingOwnerInviteWithFiscalInput,
  validateRestoreShopInput,
  validateShopStatusActionInput,
  validateSoftDeleteShopInput,
} from "./shop-action-validation";

type RpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  company_rut?: unknown;
  ok?: unknown;
  shop_id?: unknown;
  shop_code?: unknown;
  staff_code?: unknown;
  staff_id?: unknown;
};

type UntypedRpcCaller = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

export const INITIAL_MANAGER_STAFF_CODE = "1001" as const;

function mapRpcCode(value: unknown): PlatformShopActionCode {
  const code = typeof value === "string" ? value : "db_failure";

  if (
    [
      "success",
      "unauthorized",
      "not_configured",
      "validation_failed",
      "duplicate_shop_code",
      "duplicate_company_rut",
      "owner_not_found",
      "owner_not_active",
      "profile_not_found",
      "profile_not_active",
      "admin_not_found",
      "self_lockout_blocked",
      "last_admin_blocked",
      "already_active",
      "invalid_state",
      "shop_not_found",
      "device_not_found",
      "conflict",
      "db_failure",
    ].includes(code)
  ) {
    return code as PlatformShopActionCode;
  }

  return "db_failure";
}

function mapRpcResult(data: unknown): PlatformShopActionResult {
  const result = data && typeof data === "object" ? (data as RpcResult) : {};
  const code = mapRpcCode(result.code);

  return platformShopActionResult(code, {
    auditEventId:
      typeof result.audit_event_id === "string" ? result.audit_event_id : undefined,
    ok: result.ok === true,
    shopId: typeof result.shop_id === "string" ? result.shop_id : undefined,
  });
}

function mapProvisioningRpcResult(
  data: unknown,
  options: {
    credentialGenerated?: boolean;
    temporaryCredential?: string;
  } = {},
): PlatformShopProvisioningResult {
  const result = data && typeof data === "object" ? (data as RpcResult) : {};
  const base = mapRpcResult(data);

  return {
    ...base,
    companyRut:
      typeof result.company_rut === "string" ? result.company_rut : undefined,
    credentialGenerated: options.credentialGenerated,
    shopCode: typeof result.shop_code === "string" ? result.shop_code : undefined,
    staffCode:
      typeof result.staff_code === "string" ? result.staff_code : undefined,
    staffId: typeof result.staff_id === "string" ? result.staff_id : undefined,
    temporaryCredential: base.ok ? options.temporaryCredential : undefined,
  };
}

async function callUntypedRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  fn: string,
  args: Record<string, unknown>,
) {
  if (!supabase) {
    return { data: null, error: { message: "Supabase client unavailable" } };
  }

  return (supabase.rpc as unknown as UntypedRpcCaller)(fn, args);
}

export function generateTemporaryStaffCredential() {
  return `mcstaff_mgr_${randomBytes(24).toString("base64url")}`;
}

async function getAuthorizedSupabase() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      result: platformShopActionResult("not_configured", { ok: false }),
      supabase: null,
    };
  }

  const authz = await authorizeCurrentPlatformAdmin(supabase);

  if (authz.status !== "authorized") {
    return {
      result: platformShopActionResult("unauthorized", { ok: false }),
      supabase: null,
    };
  }

  return { result: null, supabase };
}

export async function createPlatformShop(
  input: CreateShopInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateCreateShopInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_create_shop", {
    p_owner_profile_id: normalized.ownerProfileId,
    p_reason: normalized.reason,
    p_shop_code: normalized.shopCode,
    p_shop_name: normalized.shopName,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function createPlatformShopWithOwnerBootstrap(
  input: CreateShopWithOwnerBootstrapInput,
): Promise<PlatformShopProvisioningResult> {
  const { fieldErrors, normalized } =
    validateCreateShopWithOwnerBootstrapInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ...platformShopActionResult("validation_failed", {
        fieldErrors,
        ok: false,
      }),
      credentialGenerated: false,
    };
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return {
      ...result,
      credentialGenerated: false,
    };
  }

  const temporaryCredential = generateTemporaryStaffCredential();
  const credentialHash = await hashStaffCredential(temporaryCredential);
  const { data, error } = await callUntypedRpc(
    supabase,
    "platform_create_shop_with_owner_bootstrap",
    {
      p_business_address: normalized.businessAddress,
      p_business_city: normalized.businessCity,
      p_business_giro: normalized.businessGiro,
      p_company_rut: normalized.companyRut,
      p_legal_representative_rut: normalized.legalRepresentativeRut,
      p_owner_profile_id: normalized.ownerProfileId,
      p_reason: normalized.reason,
      p_shop_code: normalized.shopCode,
      p_shop_name: normalized.shopName,
      p_staff_credential_hash: credentialHash,
      p_staff_display_name:
        normalized.staffDisplayName ?? INITIAL_MANAGER_DISPLAY_NAME,
    },
  );

  if (error) {
    return {
      ...platformShopActionResult("db_failure", { ok: false }),
      credentialGenerated: false,
    };
  }

  return mapProvisioningRpcResult(data, {
    credentialGenerated: true,
    temporaryCredential,
  });
}

export async function createPlatformPosFirstShop(
  input: CreatePosFirstShopInput,
): Promise<PlatformShopProvisioningResult> {
  const { fieldErrors, normalized } = validateCreatePosFirstShopInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ...platformShopActionResult("validation_failed", {
        fieldErrors,
        ok: false,
      }),
      credentialGenerated: false,
    };
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return {
      ...result,
      credentialGenerated: false,
    };
  }

  const temporaryCredential = generateTemporaryStaffCredential();
  const credentialHash = await hashStaffCredential(temporaryCredential);
  const { data, error } = await callUntypedRpc(
    supabase,
    "platform_create_pos_first_shop",
    {
      p_business_address: normalized.businessAddress,
      p_business_city: normalized.businessCity,
      p_business_giro: normalized.businessGiro,
      p_company_rut: normalized.companyRut,
      p_legal_representative_rut: normalized.legalRepresentativeRut,
      p_reason: normalized.reason,
      p_shop_code: normalized.shopCode,
      p_shop_name: normalized.shopName,
      p_staff_credential_hash: credentialHash,
      p_staff_display_name:
        normalized.staffDisplayName ?? INITIAL_MANAGER_DISPLAY_NAME,
    },
  );

  if (error) {
    return {
      ...platformShopActionResult("db_failure", { ok: false }),
      credentialGenerated: false,
    };
  }

  return mapProvisioningRpcResult(data, {
    credentialGenerated: true,
    temporaryCredential,
  });
}

export async function createPlatformPendingOwnerInviteWithFiscal(
  input: PendingOwnerInviteWithFiscalInput,
): Promise<PlatformShopProvisioningResult> {
  const { fieldErrors, normalized } =
    validatePendingOwnerInviteWithFiscalInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ...platformShopActionResult("validation_failed", {
        fieldErrors,
        ok: false,
      }),
      credentialGenerated: false,
    };
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return {
      ...result,
      credentialGenerated: false,
    };
  }

  const { data, error } = await callUntypedRpc(
    supabase,
    "platform_create_shop_with_pending_owner_invite",
    {
      p_business_address: normalized.businessAddress,
      p_business_city: normalized.businessCity,
      p_business_giro: normalized.businessGiro,
      p_company_rut: normalized.companyRut,
      p_legal_representative_rut: normalized.legalRepresentativeRut,
      p_owner_email: normalized.ownerContact,
      p_reason: normalized.reason,
      p_shop_code: normalized.shopCode,
      p_shop_name: normalized.shopName,
    },
  );

  if (error) {
    return {
      ...platformShopActionResult("db_failure", { ok: false }),
      credentialGenerated: false,
    };
  }

  return mapProvisioningRpcResult(data, {
    credentialGenerated: false,
  });
}

export async function createPlatformPendingOwnerInvite(
  input: PendingOwnerInviteInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validatePendingOwnerInviteInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_create_shop_with_pending_owner_invite", {
    p_owner_email: normalized.ownerContact,
    p_reason: normalized.reason,
    p_shop_code: normalized.shopCode,
    p_shop_name: normalized.shopName,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function suspendPlatformShop(
  input: ShopStatusActionInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateShopStatusActionInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_suspend_shop", {
    p_confirmation: normalized.confirmation,
    p_reason: normalized.reason,
    p_shop_id: normalized.shopId,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function reactivatePlatformShop(
  input: ShopStatusActionInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateShopStatusActionInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_reactivate_shop", {
    p_confirmation: normalized.confirmation,
    p_reason: normalized.reason,
    p_shop_id: normalized.shopId,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function softDeletePlatformShop(
  input: SoftDeleteShopInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateSoftDeleteShopInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_soft_delete_shop", {
    p_reason: normalized.reason,
    p_shop_code_confirmation: normalized.shopCodeConfirmation,
    p_shop_id: normalized.shopId,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function restorePlatformShop(
  input: RestoreShopInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateRestoreShopInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_restore_shop", {
    p_reason: normalized.reason,
    p_shop_code_confirmation: normalized.shopCodeConfirmation,
    p_shop_id: normalized.shopId,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function emergencyRevokePlatformDevice(
  input: EmergencyRevokeDeviceInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateEmergencyRevokeDeviceInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return platformShopActionResult("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const { result, supabase } = await getAuthorizedSupabase();

  if (!supabase) {
    return result;
  }

  const { data, error } = await supabase.rpc("platform_emergency_revoke_device", {
    p_confirmation: normalized.confirmation,
    p_reason: normalized.reason,
    p_shop_device_id: normalized.shopDeviceId,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}
