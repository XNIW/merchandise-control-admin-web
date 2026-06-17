import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { hashStaffCredential } from "@/server/shop-admin/staff-credentials";
import {
  resolvePlatformAdminForRequest,
  type PlatformProvisioningRequestAuthDiagnostics,
} from "./provisioning-request-auth";
import { createPlatformProvisioningRpcClient } from "./provisioning-rpc-client";
import { authorizeCurrentPlatformAdmin } from "./authz";
import {
  INITIAL_MANAGER_DISPLAY_NAME,
  platformShopActionResult,
  type AssignShopMemberInput,
  type ActivateShopInput,
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
  type RevokeShopMemberInput,
  type PurgeShopInput,
  type ShopStatusActionInput,
  type SoftDeleteShopInput,
} from "./action-types";
import {
  validateCreateShopInput,
  validateCreatePosFirstShopInput,
  validateCreateShopWithOwnerBootstrapInput,
  validateActivateShopInput,
  validateAssignShopMemberInput,
  validateEmergencyRevokeDeviceInput,
  validatePendingOwnerInviteInput,
  validatePendingOwnerInviteWithFiscalInput,
  validateRestoreShopInput,
  validateRevokeShopMemberInput,
  validatePurgeShopInput,
  validateShopStatusActionInput,
  validateSoftDeleteShopInput,
} from "./shop-action-validation";
import { generateTemporaryManagerPin } from "./temporary-manager-pin";

type RpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  company_rut?: unknown;
  ok?: unknown;
  shop_id?: unknown;
  shop_code?: unknown;
  shop_name?: unknown;
  staff_code?: unknown;
  staff_id?: unknown;
};

type AuthorizedSupabaseServerClient = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

export const INITIAL_MANAGER_STAFF_CODE = "1001" as const;

type PlatformProvisioningBoundary =
  | {
      rpcClient: NonNullable<ReturnType<typeof createPlatformProvisioningRpcClient>>;
      status: "ready";
    }
  | {
      result: PlatformShopProvisioningResult;
      status: "blocked";
    };

type PlatformProvisioningAuthContext = {
  authorizationHeader?: string | null;
  browserSupabaseHost?: string | null;
  diagnostics?: PlatformProvisioningRequestAuthDiagnostics;
  formMode?: string | null;
  requestContentType?: string | null;
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
      "duplicate_company_rut",
      "owner_not_found",
      "owner_not_active",
      "profile_not_found",
      "profile_not_active",
      "member_not_found",
      "admin_not_found",
      "self_lockout_blocked",
      "last_admin_blocked",
      "already_active",
      "invalid_state",
      "not_archived",
      "unsafe_purge_target",
      "dependencies_blocked",
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
    ownerMode?: PlatformShopProvisioningResult["ownerMode"];
    ownerStatus?: PlatformShopProvisioningResult["ownerStatus"];
    shopName?: string;
    temporaryCredential?: string;
    values?: PlatformShopProvisioningResult["values"];
  } = {},
): PlatformShopProvisioningResult {
  const payload = data && typeof data === "object" ? (data as RpcResult) : {};
  const code = mapRpcCode(payload.code);
  const ok = payload.ok === true && code === "success";

  return provisioningActionResult(code, {
    auditEventId:
      typeof payload.audit_event_id === "string"
        ? payload.audit_event_id
        : undefined,
    companyRut:
      typeof payload.company_rut === "string" ? payload.company_rut : undefined,
    credentialGenerated: ok && Boolean(options.temporaryCredential),
    ok,
    ownerMode: options.ownerMode,
    ownerStatus: options.ownerStatus,
    shopCode:
      typeof payload.shop_code === "string" ? payload.shop_code : undefined,
    shopId: typeof payload.shop_id === "string" ? payload.shop_id : undefined,
    shopName:
      typeof payload.shop_name === "string"
        ? payload.shop_name
        : options.shopName,
    staffCode:
      typeof payload.staff_code === "string" ? payload.staff_code : undefined,
    staffId:
      typeof payload.staff_id === "string" ? payload.staff_id : undefined,
    temporaryCredential: ok ? options.temporaryCredential : undefined,
    values: options.values,
  });
}

function provisioningActionResult(
  code: PlatformShopActionCode,
  options: Omit<Partial<PlatformShopProvisioningResult>, "code" | "message"> = {},
): PlatformShopProvisioningResult {
  return {
    ...platformShopActionResult(code, {
      auditEventId: options.auditEventId,
      fieldErrors: options.fieldErrors,
      formError: options.formError,
      ok: options.ok,
      shopId: options.shopId,
    }),
    companyRut: options.companyRut,
    credentialGenerated: options.credentialGenerated ?? false,
    ownerMode: options.ownerMode,
    ownerStatus: options.ownerStatus,
    shopCode: options.shopCode,
    shopName: options.shopName,
    staffCode: options.staffCode,
    staffId: options.staffId,
    temporaryCredential: options.temporaryCredential,
    values: options.values,
  };
}

async function createServerActionRpcClient(
  supabase: AuthorizedSupabaseServerClient,
) {
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;

  if (!accessToken) {
    return null;
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "",
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Client-Info":
            "merchandise-control-admin-web/server-action-rpc",
        },
      },
    },
  );
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

  const rpcSupabase = await createServerActionRpcClient(supabase);

  if (!rpcSupabase) {
    return {
      result: platformShopActionResult("unauthorized", { ok: false }),
      supabase: null,
    };
  }

  return { result: null, supabase: rpcSupabase };
}

async function getProvisioningBoundary(
  authContext: PlatformProvisioningAuthContext = {},
): Promise<PlatformProvisioningBoundary> {
  const auth = await resolvePlatformAdminForRequest(authContext);

  if (auth.status !== "authorized") {
    return {
      result: provisioningActionResult(auth.code, { ok: false }),
      status: "blocked",
    };
  }

  const rpcClient = createPlatformProvisioningRpcClient(auth.actorAccessToken);

  if (!rpcClient) {
    return {
      result: provisioningActionResult("not_configured", { ok: false }),
      status: "blocked",
    };
  }

  return {
    rpcClient,
    status: "ready",
  };
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
  authContext: PlatformProvisioningAuthContext = {},
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

  const boundary = await getProvisioningBoundary(authContext);

  if (boundary.status !== "ready") {
    return boundary.result;
  }

  const temporaryCredential = generateTemporaryManagerPin();
  const credentialHash = await hashStaffCredential(temporaryCredential, {
    allowTemporaryPin: true,
  });

  const { data, error } = await boundary.rpcClient.rpc(
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
    return provisioningActionResult("db_failure", {
      credentialGenerated: false,
      ok: false,
    });
  }

  return mapProvisioningRpcResult(data, {
    ownerMode: "existing_owner",
    ownerStatus: "active",
    shopName: normalized.shopName,
    temporaryCredential,
  });
}

export async function createPlatformPosFirstShop(
  input: CreatePosFirstShopInput,
  authContext: PlatformProvisioningAuthContext = {},
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

  const boundary = await getProvisioningBoundary(authContext);

  if (boundary.status !== "ready") {
    return boundary.result;
  }

  const temporaryCredential = generateTemporaryManagerPin();
  const credentialHash = await hashStaffCredential(temporaryCredential, {
    allowTemporaryPin: true,
  });

  const { data, error } = await boundary.rpcClient.rpc(
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
    return provisioningActionResult("db_failure", {
      credentialGenerated: false,
      ok: false,
    });
  }

  return mapProvisioningRpcResult(data, {
    ownerMode: "pos_first",
    ownerStatus: "pending",
    shopName: normalized.shopName,
    temporaryCredential,
  });
}

export async function createPlatformPendingOwnerInviteWithFiscal(
  input: PendingOwnerInviteWithFiscalInput,
  authContext: PlatformProvisioningAuthContext = {},
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

  const boundary = await getProvisioningBoundary(authContext);

  if (boundary.status !== "ready") {
    return boundary.result;
  }

  const temporaryCredential = generateTemporaryManagerPin();
  const credentialHash = await hashStaffCredential(temporaryCredential, {
    allowTemporaryPin: true,
  });

  const { data, error } = await boundary.rpcClient.rpc(
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
      p_staff_credential_hash: credentialHash,
      p_staff_display_name: INITIAL_MANAGER_DISPLAY_NAME,
    },
  );

  if (error) {
    return provisioningActionResult("db_failure", {
      credentialGenerated: false,
      ok: false,
    });
  }

  return mapProvisioningRpcResult(data, {
    ownerMode: "pending_owner_invite",
    ownerStatus: "pending_external_delivery",
    shopName: normalized.shopName,
    temporaryCredential,
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

export async function activatePlatformShop(
  input: ActivateShopInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateActivateShopInput(input);

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

  const { data, error } = await supabase.rpc("platform_activate_shop", {
    p_reason: normalized.reason,
    p_shop_code_confirmation: normalized.shopCodeConfirmation,
    p_shop_id: normalized.shopId,
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

export async function purgePlatformShop(
  input: PurgeShopInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validatePurgeShopInput(input);

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

  const { data, error } =
    normalized.mode === "force_test"
      ? await supabase.rpc("platform_force_purge_test_shop", {
          p_confirmation: normalized.confirmation,
          p_reason: normalized.reason,
          p_shop_id: normalized.shopId,
        })
      : await supabase.rpc("platform_purge_shop", {
          p_confirmation: normalized.confirmation,
          p_reason: normalized.reason,
          p_shop_id: normalized.shopId,
        });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function assignPlatformShopMember(
  input: AssignShopMemberInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateAssignShopMemberInput(input);

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

  const { data, error } = await supabase.rpc("platform_assign_shop_member", {
    p_profile_id: normalized.profileId,
    p_reason: normalized.reason,
    p_role_key: normalized.roleKey,
    p_shop_code_confirmation: normalized.shopCodeConfirmation,
    p_shop_id: normalized.shopId,
  });

  if (error) {
    return platformShopActionResult("db_failure", { ok: false });
  }

  return mapRpcResult(data);
}

export async function revokePlatformShopMember(
  input: RevokeShopMemberInput,
): Promise<PlatformShopActionResult> {
  const { fieldErrors, normalized } = validateRevokeShopMemberInput(input);

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

  const { data, error } = await supabase.rpc("platform_revoke_shop_member", {
    p_reason: normalized.reason,
    p_shop_code_confirmation: normalized.shopCodeConfirmation,
    p_shop_id: normalized.shopId,
    p_shop_member_id: normalized.shopMemberId,
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
