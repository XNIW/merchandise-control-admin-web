import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  platformShopActionResult,
  type PlatformAdminGrantInput,
  type PlatformAdminRevokeInput,
  type PlatformShopActionCode,
  type PlatformShopActionResult,
} from "./action-types";
import { authorizeCurrentPlatformAdmin } from "./authz";
import {
  validatePlatformAdminGrantInput,
  validatePlatformAdminRevokeInput,
} from "./shop-action-validation";

type RpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  ok?: unknown;
};

function mapRpcCode(value: unknown): PlatformShopActionCode {
  const code = typeof value === "string" ? value : "db_failure";

  if (
    [
      "success",
      "unauthorized",
      "not_configured",
      "validation_failed",
      "profile_not_found",
      "profile_not_active",
      "admin_not_found",
      "self_lockout_blocked",
      "last_admin_blocked",
      "already_active",
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

export async function grantPlatformAdmin(
  input: PlatformAdminGrantInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validatePlatformAdminGrantInput(input);

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

  const { data, error } = await supabase.rpc("platform_grant_platform_admin", {
    p_confirmation: normalized.confirmation,
    p_profile_id: normalized.profileId,
    p_reason: normalized.reason,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function revokePlatformAdmin(
  input: PlatformAdminRevokeInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validatePlatformAdminRevokeInput(input);

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

  const { data, error } = await supabase.rpc("platform_revoke_platform_admin", {
    p_confirmation: normalized.confirmation,
    p_profile_id: normalized.profileId,
    p_reason: normalized.reason,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}
