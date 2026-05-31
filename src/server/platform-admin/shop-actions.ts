import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorizeCurrentPlatformAdmin } from "./authz";
import {
  platformShopActionResult,
  type CreateShopInput,
  type EmergencyRevokeDeviceInput,
  type PendingOwnerInviteInput,
  type PlatformShopActionCode,
  type PlatformShopActionResult,
  type RestoreShopInput,
  type ShopStatusActionInput,
  type SoftDeleteShopInput,
} from "./action-types";
import {
  validateCreateShopInput,
  validateEmergencyRevokeDeviceInput,
  validatePendingOwnerInviteInput,
  validateRestoreShopInput,
  validateShopStatusActionInput,
  validateSoftDeleteShopInput,
} from "./shop-action-validation";

type RpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  ok?: unknown;
  shop_id?: unknown;
};

function mapRpcCode(value: unknown): PlatformShopActionCode {
  const code = typeof value === "string" ? value : "db_failure";

  if (
    [
      "success",
      "unauthorized",
      "not_configured",
      "validation_failed",
      "duplicate_shop_code",
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
