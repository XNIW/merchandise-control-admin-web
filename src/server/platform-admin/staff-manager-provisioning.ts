import "server-only";

import { hashStaffCredential } from "@/server/shop-admin/staff-credentials";
import {
  resolvePlatformAdminForRequest,
  type PlatformProvisioningRequestAuthDiagnostics,
} from "./provisioning-request-auth";
import { createPlatformProvisioningRpcClient } from "./provisioning-rpc-client";
import { generateTemporaryManagerPin } from "./temporary-manager-pin";

export type PlatformStaffManagerProvisionCode =
  | "success"
  | "auth_mismatch"
  | "audit_database_error"
  | "audit_write_failed"
  | "conflict"
  | "credential_update_database_error"
  | "duplicate_initial_manager"
  | "invalid_state"
  | "not_configured"
  | "permission_write_failed"
  | "recovery_rpc_not_configured"
  | "server_admin_not_configured"
  | "shop_inactive"
  | "shop_lookup_database_error"
  | "shop_read_failed"
  | "shop_not_found"
  | "shop_not_selected"
  | "staff_lookup_database_error"
  | "staff_read_failed"
  | "staff_write_failed"
  | "unauthorized"
  | "validation_failed";

export type PlatformStaffManagerProvisionDiagnostics = {
  selectedShopCodePreview: string | null;
  shopCodePresent: boolean;
  shopIdPresent: boolean;
};

export type PlatformStaffManagerProvisionResult = {
  auditEventId?: string;
  code: PlatformStaffManagerProvisionCode;
  diagnostics?: PlatformStaffManagerProvisionDiagnostics;
  fieldErrors?: Record<string, string>;
  message: string;
  ok: boolean;
  oneTimeSignInValue?: string;
  operationResult?: "credential_reset" | "reactivated_reset" | "recreated";
  shopCode?: string;
  shopId?: string;
  shopName?: string;
  staffId?: string;
};

type ProvisionPlatformStaffManagerInput = {
  displayName?: string;
  reason: string;
  shopCode?: string;
  shopId?: string;
  staffCode: string;
};

type NormalizedProvisionInput = {
  displayName: string;
  reason: string;
  shopCode: string;
  shopId: string;
  staffCode: string;
};

type PlatformProvisionBoundary =
  | {
      rpcClient: NonNullable<ReturnType<typeof createPlatformProvisioningRpcClient>>;
      status: "ready";
    }
  | {
      result: PlatformStaffManagerProvisionResult;
      status: "blocked";
    };

type PlatformProvisionAuthContext = {
  authorizationHeader?: string | null;
  browserSupabaseHost?: string | null;
  diagnostics?: PlatformProvisioningRequestAuthDiagnostics;
  formMode?: string | null;
  requestContentType?: string | null;
};

type RecoveryRpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  ok?: unknown;
  operation_result?: unknown;
  shop_code?: unknown;
  shop_id?: unknown;
  shop_name?: unknown;
  staff_id?: unknown;
};

const messageByCode: Record<PlatformStaffManagerProvisionCode, string> = {
  auth_mismatch: "Master Console session changed. Refresh and sign in again.",
  audit_database_error:
    "Recovery could not complete because the database boundary failed. Check server diagnostics.",
  audit_write_failed: "Audit write failed for the manager provisioning action.",
  conflict: "A staff account with this code already exists for the shop.",
  credential_update_database_error:
    "Recovery could not complete because the database boundary failed. Check server diagnostics.",
  duplicate_initial_manager:
    "Initial manager recovery found duplicate manager 1001 rows. Manual review is required.",
  invalid_state: "The selected shop is not eligible for staff manager web access.",
  not_configured: "Platform Admin runtime is not configured.",
  permission_write_failed: "Manager permission write failed at the database boundary.",
  recovery_rpc_not_configured:
    "Initial manager recovery is not installed on this database target. Ask an operator to apply the recovery boundary migration, then retry.",
  server_admin_not_configured:
    "Server admin runtime is not configured. Recovery cannot update staff credentials in this runtime.",
  shop_inactive: "The selected shop is inactive or archived.",
  shop_lookup_database_error:
    "Recovery could not complete because the database boundary failed. Check server diagnostics.",
  shop_read_failed: "Shop lookup failed at the database boundary.",
  shop_not_found: "The selected shop could not be found.",
  shop_not_selected: "Select a target shop before running recovery.",
  staff_lookup_database_error:
    "Recovery could not complete because the database boundary failed. Check server diagnostics.",
  staff_read_failed: "Staff account lookup failed at the database boundary.",
  staff_write_failed: "Staff account write failed at the database boundary.",
  success: "Staff manager web access was provisioned.",
  unauthorized: "You are not authorized to perform this operation.",
  validation_failed: "Check the required fields and try again.",
};

const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const DEFAULT_MANAGER_DISPLAY_NAME = "manager" as const;
export const INITIAL_MANAGER_RECOVERY_STAFF_CODE = "1001" as const;
export const TASK051_INITIAL_MANAGER_RECOVERY_RPC_CONTRACT = {
  credential_expires_at: "temporary_14_days",
  credential_generated: true,
  locked_until: null,
  must_change_credential: false,
  operation_result: "rpc_controlled",
  permissionKey: "shop_admin.full_access",
  primarySuccessEventKey: "platform.staff_manager.initial_recovery.success",
  provisionFailureEventKey: "platform.staff_manager_web.provision.failure",
  provisionSuccessEventKey: "platform.staff_manager_web.provision.success",
  recoverySuccessEventKey: "platform.staff_manager_web.recovery.success",
  staffAccountsTable: "staff_accounts",
  staffRolePermissionsTable: "staff_role_permissions",
} as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result(
  code: PlatformStaffManagerProvisionCode,
  options: Omit<Partial<PlatformStaffManagerProvisionResult>, "code" | "message"> = {},
): PlatformStaffManagerProvisionResult {
  return {
    code,
    message: messageByCode[code],
    ok: options.ok ?? code === "success",
    ...options,
  };
}

function normalizeShopCode(value: string | undefined) {
  return (value ?? "").trim().toUpperCase().slice(0, 32);
}

function previewShopCode(value: string | undefined) {
  const normalized = normalizeShopCode(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length <= 4) {
    return `${"*".repeat(Math.max(0, normalized.length - 1))}${normalized.slice(-1)}`;
  }

  return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
}

function normalizeInput(
  input: ProvisionPlatformStaffManagerInput,
): {
  diagnostics: PlatformStaffManagerProvisionDiagnostics;
  fieldErrors: Record<string, string>;
  normalized: NormalizedProvisionInput;
} {
  const displayName = input.displayName?.trim() || DEFAULT_MANAGER_DISPLAY_NAME;
  const rawShopId = (input.shopId ?? "").trim();
  const rawShopCode = normalizeShopCode(input.shopCode);
  const normalized = {
    displayName: displayName.slice(0, 120),
    reason: input.reason.trim().slice(0, 500),
    shopCode: rawShopCode,
    shopId: rawShopId,
    staffCode: input.staffCode.trim().toUpperCase().slice(0, 32),
  };
  const diagnostics = {
    selectedShopCodePreview: previewShopCode(input.shopCode),
    shopCodePresent: Boolean(rawShopCode),
    shopIdPresent: Boolean(rawShopId),
  };
  const fieldErrors: Record<string, string> = {};
  const hasValidShopId = UUID_PATTERN.test(normalized.shopId);
  const hasValidShopCode = SHOP_CODE_PATTERN.test(normalized.shopCode);

  if (!hasValidShopId && !hasValidShopCode) {
    fieldErrors.shopId = "Select a valid shop.";
  }

  if (normalized.shopCode && !hasValidShopCode) {
    fieldErrors.shopCode = "Use 3-32 uppercase letters, numbers, dash or underscore.";
  }

  if (!STAFF_CODE_PATTERN.test(normalized.staffCode)) {
    fieldErrors.staffCode = "Use 2-32 uppercase letters, numbers, dash or underscore.";
  }

  if (normalized.staffCode !== INITIAL_MANAGER_RECOVERY_STAFF_CODE) {
    fieldErrors.staffCode = "Only manager 1001 can be recovered by this action.";
  }

  if (normalized.reason.length < 8) {
    fieldErrors.reason = "A provisioning reason is required.";
  }

  return { diagnostics, fieldErrors, normalized };
}

function mapRpcCode(value: unknown): PlatformStaffManagerProvisionCode {
  const code =
    typeof value === "string" ? value : "credential_update_database_error";

  if (
    [
      "success",
      "conflict",
      "credential_update_database_error",
      "duplicate_initial_manager",
      "not_configured",
      "recovery_rpc_not_configured",
      "shop_inactive",
      "shop_not_found",
      "unauthorized",
      "validation_failed",
    ].includes(code)
  ) {
    return code as PlatformStaffManagerProvisionCode;
  }

  return "credential_update_database_error";
}

function mapOperationResult(
  value: unknown,
): PlatformStaffManagerProvisionResult["operationResult"] | undefined {
  if (
    value === "credential_reset" ||
    value === "reactivated_reset" ||
    value === "recreated"
  ) {
    return value;
  }

  return undefined;
}

async function getProvisionBoundary(
  authContext: PlatformProvisionAuthContext = {},
): Promise<PlatformProvisionBoundary> {
  const auth = await resolvePlatformAdminForRequest(authContext);

  if (auth.status !== "authorized") {
    const code =
      auth.code === "not_configured"
        ? "not_configured"
        : auth.code === "auth_mismatch"
          ? "auth_mismatch"
          : "unauthorized";

    return {
      result: result(code, { ok: false }),
      status: "blocked",
    };
  }

  const rpcClient = createPlatformProvisioningRpcClient(auth.actorAccessToken);

  if (!rpcClient) {
    return {
      result: result("not_configured", { ok: false }),
      status: "blocked",
    };
  }

  return {
    rpcClient,
    status: "ready",
  };
}

async function provisionPlatformStaffManagerInternal(
  input: ProvisionPlatformStaffManagerInput,
  authContext: PlatformProvisionAuthContext = {},
): Promise<PlatformStaffManagerProvisionResult> {
  const { diagnostics, fieldErrors, normalized } = normalizeInput(input);
  const finish = (
    code: PlatformStaffManagerProvisionCode,
    options: Omit<Partial<PlatformStaffManagerProvisionResult>, "code" | "message"> = {},
  ) =>
    result(code, {
      diagnostics,
      ...options,
    });

  if (Object.keys(fieldErrors).length > 0) {
    const code =
      fieldErrors.shopId && !normalized.shopId && !normalized.shopCode
        ? "shop_not_selected"
        : "validation_failed";

    return finish(code, {
      fieldErrors,
      ok: false,
    });
  }

  const boundary = await getProvisionBoundary(authContext);

  if (boundary.status !== "ready") {
    return {
      ...boundary.result,
      diagnostics,
    };
  }

  const oneTimeSignInValue = generateTemporaryManagerPin();
  const credentialHash = await hashStaffCredential(oneTimeSignInValue, {
    allowTemporaryPin: true,
  });

  const { data, error } = await boundary.rpcClient.rpc(
    "platform_recover_initial_manager_1001",
    {
      p_reason: normalized.reason,
      p_shop_code: normalized.shopCode,
      p_shop_id: UUID_PATTERN.test(normalized.shopId)
        ? normalized.shopId
        : (null as unknown as string),
      p_staff_credential_hash: credentialHash,
      p_staff_display_name: normalized.displayName,
    },
  );

  if (error) {
    const errorCode =
      error.code === "PGRST202"
        ? "recovery_rpc_not_configured"
        : "credential_update_database_error";

    return finish(errorCode, {
      ok: false,
      shopCode: normalized.shopCode || undefined,
      shopId: normalized.shopId || undefined,
    });
  }

  const payload = data && typeof data === "object" ? (data as RecoveryRpcResult) : {};
  const code = mapRpcCode(payload.code);
  const ok = payload.ok === true && code === "success";

  return finish(code, {
    auditEventId:
      typeof payload.audit_event_id === "string"
        ? payload.audit_event_id
        : undefined,
    ok,
    oneTimeSignInValue: ok ? oneTimeSignInValue : undefined,
    operationResult: ok ? mapOperationResult(payload.operation_result) : undefined,
    shopCode:
      typeof payload.shop_code === "string"
        ? payload.shop_code
        : normalized.shopCode || undefined,
    shopId:
      typeof payload.shop_id === "string"
        ? payload.shop_id
        : normalized.shopId || undefined,
    shopName:
      typeof payload.shop_name === "string" ? payload.shop_name : undefined,
    staffId: typeof payload.staff_id === "string" ? payload.staff_id : undefined,
  });
}

export async function provisionPlatformStaffManager(
  input: ProvisionPlatformStaffManagerInput,
  authContext: PlatformProvisionAuthContext = {},
): Promise<PlatformStaffManagerProvisionResult> {
  return provisionPlatformStaffManagerInternal(input, authContext);
}

export async function recoverInitialManager1001(
  input: Omit<ProvisionPlatformStaffManagerInput, "staffCode"> & {
    staffCode?: string;
  },
  authContext: PlatformProvisionAuthContext = {},
): Promise<PlatformStaffManagerProvisionResult> {
  return provisionPlatformStaffManagerInternal(
    {
      ...input,
      staffCode: INITIAL_MANAGER_RECOVERY_STAFF_CODE,
    },
    authContext,
  );
}
