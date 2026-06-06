import "server-only";

import { randomBytes } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  POS_STAFF_WEB_REQUIRED_PERMISSION,
  POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY,
} from "@/server/shop-admin/access-principal";
import { hashStaffCredential } from "@/server/shop-admin/staff-credentials";
import { authorizeCurrentPlatformAdmin } from "./authz";

export type PlatformStaffManagerProvisionCode =
  | "success"
  | "audit_write_failed"
  | "conflict"
  | "duplicate_initial_manager"
  | "invalid_state"
  | "not_configured"
  | "permission_write_failed"
  | "shop_read_failed"
  | "shop_not_found"
  | "staff_read_failed"
  | "staff_write_failed"
  | "unauthorized"
  | "validation_failed";

export type PlatformStaffManagerProvisionResult = {
  auditEventId?: string;
  code: PlatformStaffManagerProvisionCode;
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
  shopId: string;
  staffCode: string;
};

type NormalizedProvisionInput = {
  displayName: string;
  reason: string;
  shopId: string;
  staffCode: string;
};

type PlatformProvisionBoundary =
  | {
      actorProfileId: string;
      adminClient: SupabaseAdminClient;
      status: "ready";
    }
  | {
      result: PlatformStaffManagerProvisionResult;
      status: "blocked";
    };

const messageByCode: Record<PlatformStaffManagerProvisionCode, string> = {
  audit_write_failed: "Audit write failed for the manager provisioning action.",
  conflict: "A staff account with this code already exists for the shop.",
  duplicate_initial_manager:
    "Initial manager recovery found duplicate manager 1001 rows. Manual review is required.",
  invalid_state: "The selected shop is not eligible for staff manager web access.",
  not_configured: "Platform Admin runtime is not configured.",
  permission_write_failed: "Manager permission write failed at the database boundary.",
  shop_read_failed: "Shop lookup failed at the database boundary.",
  shop_not_found: "The selected shop could not be found.",
  staff_read_failed: "Staff account lookup failed at the database boundary.",
  staff_write_failed: "Staff account write failed at the database boundary.",
  success: "Staff manager web access was provisioned.",
  unauthorized: "You are not authorized to perform this operation.",
  validation_failed: "Check the required fields and try again.",
};

const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const PLATFORM_STAFF_MANAGER_WEB_PERMISSION: typeof POS_STAFF_WEB_REQUIRED_PERMISSION =
  "shop_admin.full_access";
export const DEFAULT_MANAGER_DISPLAY_NAME = "manager" as const;
export const INITIAL_MANAGER_RECOVERY_STAFF_CODE = "1001" as const;
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

function nowIso() {
  return new Date().toISOString();
}

function normalizeInput(
  input: ProvisionPlatformStaffManagerInput,
): {
  fieldErrors: Record<string, string>;
  normalized: NormalizedProvisionInput;
} {
  const displayName = input.displayName?.trim() || DEFAULT_MANAGER_DISPLAY_NAME;
  const normalized = {
    displayName: displayName.slice(0, 120),
    reason: input.reason.trim().slice(0, 500),
    shopId: input.shopId.trim(),
    staffCode: input.staffCode.trim().toUpperCase().slice(0, 32),
  };
  const fieldErrors: Record<string, string> = {};

  if (!UUID_PATTERN.test(normalized.shopId)) {
    fieldErrors.shopId = "Select a valid shop.";
  }

  if (!STAFF_CODE_PATTERN.test(normalized.staffCode)) {
    fieldErrors.staffCode = "Use 2-32 uppercase letters, numbers, dash or underscore.";
  }

  if (normalized.reason.length < 8) {
    fieldErrors.reason = "A provisioning reason is required.";
  }

  return { fieldErrors, normalized };
}

function generateManagerCredential() {
  return `mcstaff_mgr_${randomBytes(24).toString("base64url")}`;
}

async function getProvisionBoundary(): Promise<PlatformProvisionBoundary> {
  const serverClient = await createSupabaseServerClient();

  if (!serverClient) {
    return {
      result: result("not_configured", { ok: false }),
      status: "blocked",
    };
  }

  const authz = await authorizeCurrentPlatformAdmin(serverClient);

  if (authz.status !== "authorized") {
    return {
      result: result(
        authz.status === "not_configured" ? "not_configured" : "unauthorized",
        { ok: false },
      ),
      status: "blocked",
    };
  }

  const adminConfig = resolveSupabaseAdminConfig();

  if (adminConfig.status !== "configured") {
    return {
      result: result("not_configured", { ok: false }),
      status: "blocked",
    };
  }

  const adminClient = createSupabaseAdminClient(adminConfig);

  if (!adminClient) {
    return {
      result: result("not_configured", { ok: false }),
      status: "blocked",
    };
  }

  return {
    actorProfileId: authz.userId,
    adminClient,
    status: "ready",
  };
}

async function writePlatformStaffManagerAudit(
  adminClient: SupabaseAdminClient,
  input: {
    actorProfileId: string;
    code: PlatformStaffManagerProvisionCode;
    credentialGenerated?: boolean;
    displayNameLength: number;
    eventKey: string;
    operationResult?:
      | "credential_reset"
      | "duplicate_initial_manager"
      | "failure"
      | "reactivated_reset"
      | "recreated";
    reasonLength: number;
    result: "failure" | "success";
    shopId?: string;
    staffCode?: string;
    staffCodeLength: number;
    staffId?: string;
  },
): Promise<{ auditEventId?: string; ok: boolean }> {
  const { data, error } = await adminClient
    .from("audit_logs")
    .insert({
      actor_profile_id: input.actorProfileId,
      event_key: input.eventKey,
      metadata_redacted: {
        code: input.code,
        credential_generated: input.credentialGenerated ?? false,
        display_name_length: input.displayNameLength,
        operation_result: input.operationResult ?? input.result,
        permission_key: PLATFORM_STAFF_MANAGER_WEB_PERMISSION,
        reason_length: input.reasonLength,
        role_key: POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY,
        shop_id: input.shopId ?? null,
        source: "TASK-051",
        staff_code: input.staffCode ?? null,
        staff_code_length: input.staffCodeLength,
      },
      result: input.result,
      scope: input.shopId ? "shop" : "global",
      severity: input.result === "success" ? "info" : "warning",
      shop_id: input.shopId ?? null,
      target_id: input.staffId ?? input.shopId,
      target_type: input.staffId ? "staff_account" : "shop",
    })
    .select("audit_log_id")
    .maybeSingle();

  if (error) {
    return { ok: false };
  }

  return { auditEventId: data?.audit_log_id, ok: true };
}

function isUniqueConflict(error: { code?: string } | null) {
  return error?.code === "23505";
}

function isUsableInitialManager(staff: {
  credential_status: string;
  must_change_credential: boolean;
  status: string;
  web_access_revoked_at: string | null;
}) {
  return (
    staff.status === "active" &&
    staff.credential_status === "active" &&
    staff.must_change_credential !== true &&
    !staff.web_access_revoked_at
  );
}

type ProvisionPlatformStaffManagerMode = "initial_recovery" | "provision";

async function provisionPlatformStaffManagerInternal(
  input: ProvisionPlatformStaffManagerInput,
  mode: ProvisionPlatformStaffManagerMode,
): Promise<PlatformStaffManagerProvisionResult> {
  const { fieldErrors, normalized } = normalizeInput(input);

  if (Object.keys(fieldErrors).length > 0) {
    return result("validation_failed", {
      fieldErrors,
      ok: false,
    });
  }

  const boundary = await getProvisionBoundary();

  if (boundary.status !== "ready") {
    return boundary.result;
  }

  const { actorProfileId, adminClient } = boundary;
  const shopResult = await adminClient
    .from("shops")
    .select("shop_id,shop_code,shop_name,shop_status,archived_at")
    .eq("shop_id", normalized.shopId)
    .maybeSingle();

  if (shopResult.error) {
    return result("shop_read_failed", { ok: false, shopId: normalized.shopId });
  }

  if (!shopResult.data) {
    return result("shop_not_found", { ok: false, shopId: normalized.shopId });
  }

  if (
    shopResult.data.shop_status !== "active" ||
    shopResult.data.archived_at !== null
  ) {
    const audit = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "invalid_state",
      credentialGenerated: false,
      displayNameLength: normalized.displayName.length,
      eventKey:
        mode === "initial_recovery"
          ? "platform.staff_manager.initial_recovery.failure"
          : "platform.staff_manager_web.provision.failure",
      operationResult: "failure",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCode: normalized.staffCode,
      staffCodeLength: normalized.staffCode.length,
    });

    if (!audit.ok) {
      return result("audit_write_failed", {
        ok: false,
        shopId: normalized.shopId,
      });
    }

    return result("invalid_state", {
      auditEventId: audit.auditEventId,
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const existingStaffResult = await adminClient
    .from("staff_accounts")
    .select(
      "staff_id,shop_id,credential_version,status,credential_status,must_change_credential,web_access_revoked_at",
    )
    .eq("shop_id", normalized.shopId)
    .eq("staff_code", normalized.staffCode)
    .limit(2);

  if (existingStaffResult.error) {
    return result("staff_read_failed", { ok: false, shopId: normalized.shopId });
  }

  const existingStaffRows = existingStaffResult.data ?? [];

  if (existingStaffRows.length > 1) {
    const audit = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "duplicate_initial_manager",
      credentialGenerated: false,
      displayNameLength: normalized.displayName.length,
      eventKey:
        mode === "initial_recovery"
          ? "platform.staff_manager.initial_recovery.failure"
          : "platform.staff_manager_web.provision.failure",
      operationResult: "duplicate_initial_manager",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCode: normalized.staffCode,
      staffCodeLength: normalized.staffCode.length,
    });

    return result(audit.ok ? "duplicate_initial_manager" : "audit_write_failed", {
      auditEventId: audit.auditEventId,
      ok: false,
      shopCode: shopResult.data.shop_code,
      shopId: normalized.shopId,
      shopName: shopResult.data.shop_name,
    });
  }

  const existingStaff = existingStaffRows[0];

  const permissionResult = await adminClient.from("staff_role_permissions").upsert(
    {
      enabled: true,
      permission_key: PLATFORM_STAFF_MANAGER_WEB_PERMISSION,
      role_key: POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY,
      shop_id: normalized.shopId,
      updated_at: nowIso(),
      updated_by_profile_id: actorProfileId,
    },
    { onConflict: "shop_id,role_key,permission_key" },
  );

  if (permissionResult.error) {
    const audit = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "permission_write_failed",
      credentialGenerated: false,
      displayNameLength: normalized.displayName.length,
      eventKey:
        mode === "initial_recovery"
          ? "platform.staff_manager.initial_recovery.failure"
          : "platform.staff_manager_web.provision.failure",
      operationResult: "failure",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCode: normalized.staffCode,
      staffCodeLength: normalized.staffCode.length,
    });

    return result(audit.ok ? "permission_write_failed" : "audit_write_failed", {
      auditEventId: audit.auditEventId,
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const oneTimeSignInValue = generateManagerCredential();
  const credentialHash = await hashStaffCredential(oneTimeSignInValue);

  if (existingStaff) {
    const now = nowIso();
    const operationResult = isUsableInitialManager(existingStaff)
      ? "credential_reset"
      : "reactivated_reset";
    const nextCredentialVersion =
      typeof existingStaff.credential_version === "number"
        ? existingStaff.credential_version + 1
        : 1;
    const staffResult = await adminClient
      .from("staff_accounts")
      .update({
        credential_expires_at: null,
        credential_hash: credentialHash,
        credential_kind: "password",
        credential_status: "active",
        credential_updated_at: now,
        credential_version: nextCredentialVersion,
        failed_attempts: 0,
        locked_until: null,
        must_change_credential: false,
        session_invalidated_at: now,
        status: "active",
        updated_by_profile_id: actorProfileId,
        web_access_revoked_at: null,
        web_access_revoked_by_staff_id: null,
        web_access_revoked_reason: null,
      })
      .eq("staff_id", existingStaff.staff_id)
      .select("staff_id,shop_id")
      .maybeSingle();

    if (staffResult.error || !staffResult.data) {
      const audit = await writePlatformStaffManagerAudit(adminClient, {
        actorProfileId,
        code: "staff_write_failed",
        credentialGenerated: false,
        displayNameLength: normalized.displayName.length,
        eventKey:
          mode === "initial_recovery"
            ? "platform.staff_manager.initial_recovery.failure"
            : "platform.staff_manager_web.recovery.failure",
        operationResult: "failure",
        reasonLength: normalized.reason.length,
        result: "failure",
        shopId: normalized.shopId,
        staffCode: normalized.staffCode,
        staffCodeLength: normalized.staffCode.length,
        staffId: existingStaff.staff_id,
      });

      return result(audit.ok ? "staff_write_failed" : "audit_write_failed", {
        auditEventId: audit.auditEventId,
        ok: false,
        shopId: normalized.shopId,
        staffId: existingStaff.staff_id,
      });
    }

    const audit = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "success",
      credentialGenerated: true,
      displayNameLength: normalized.displayName.length,
      eventKey:
        mode === "initial_recovery"
          ? "platform.staff_manager.initial_recovery.success"
          : "platform.staff_manager_web.recovery.success",
      operationResult,
      reasonLength: normalized.reason.length,
      result: "success",
      shopId: normalized.shopId,
      staffCode: normalized.staffCode,
      staffCodeLength: normalized.staffCode.length,
      staffId: staffResult.data.staff_id,
    });

    if (!audit.ok) {
      return result("audit_write_failed", {
        ok: false,
        shopId: staffResult.data.shop_id,
        staffId: staffResult.data.staff_id,
      });
    }

    return result("success", {
      auditEventId: audit.auditEventId,
      oneTimeSignInValue,
      operationResult,
      shopCode: shopResult.data.shop_code,
      shopId: staffResult.data.shop_id,
      shopName: shopResult.data.shop_name,
      staffId: staffResult.data.staff_id,
    });
  }

  const staffResult = await adminClient
    .from("staff_accounts")
    .insert({
      created_by_profile_id: actorProfileId,
      credential_hash: credentialHash,
      credential_kind: "password",
      credential_status: "active",
      credential_updated_at: nowIso(),
      credential_version: 1,
      display_name: normalized.displayName,
      failed_attempts: 0,
      must_change_credential: false,
      role_key: POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY,
      shop_id: normalized.shopId,
      staff_code: normalized.staffCode,
      status: "active",
      updated_by_profile_id: actorProfileId,
    })
    .select("staff_id,shop_id")
    .maybeSingle();

  if (staffResult.error) {
    const code = isUniqueConflict(staffResult.error) ? "conflict" : "staff_write_failed";
    const audit = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code,
      credentialGenerated: false,
      displayNameLength: normalized.displayName.length,
      eventKey:
        mode === "initial_recovery"
          ? "platform.staff_manager.initial_recovery.failure"
          : "platform.staff_manager_web.provision.failure",
      operationResult: "failure",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCode: normalized.staffCode,
      staffCodeLength: normalized.staffCode.length,
    });

    return result(audit.ok ? code : "audit_write_failed", {
      auditEventId: audit.auditEventId,
      ok: false,
      shopId: normalized.shopId,
    });
  }

  if (!staffResult.data) {
    const audit = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "staff_write_failed",
      credentialGenerated: false,
      displayNameLength: normalized.displayName.length,
      eventKey:
        mode === "initial_recovery"
          ? "platform.staff_manager.initial_recovery.failure"
          : "platform.staff_manager_web.provision.failure",
      operationResult: "failure",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCode: normalized.staffCode,
      staffCodeLength: normalized.staffCode.length,
    });

    return result(audit.ok ? "staff_write_failed" : "audit_write_failed", {
      auditEventId: audit.auditEventId,
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const audit = await writePlatformStaffManagerAudit(adminClient, {
    actorProfileId,
    code: "success",
    credentialGenerated: true,
    displayNameLength: normalized.displayName.length,
    eventKey:
      mode === "initial_recovery"
        ? "platform.staff_manager.initial_recovery.success"
        : "platform.staff_manager_web.provision.success",
    operationResult: "recreated",
    reasonLength: normalized.reason.length,
    result: "success",
    shopId: normalized.shopId,
    staffCode: normalized.staffCode,
    staffCodeLength: normalized.staffCode.length,
    staffId: staffResult.data.staff_id,
  });

  if (!audit.ok) {
    return result("audit_write_failed", {
      ok: false,
      shopId: staffResult.data.shop_id,
      staffId: staffResult.data.staff_id,
    });
  }

  return result("success", {
    auditEventId: audit.auditEventId,
    oneTimeSignInValue,
    operationResult: "recreated",
    shopCode: shopResult.data.shop_code,
    shopId: staffResult.data.shop_id,
    shopName: shopResult.data.shop_name,
    staffId: staffResult.data.staff_id,
  });
}

export async function provisionPlatformStaffManager(
  input: ProvisionPlatformStaffManagerInput,
): Promise<PlatformStaffManagerProvisionResult> {
  return provisionPlatformStaffManagerInternal(input, "provision");
}

export async function recoverInitialManager1001(
  input: Omit<ProvisionPlatformStaffManagerInput, "staffCode"> & {
    staffCode?: string;
  },
): Promise<PlatformStaffManagerProvisionResult> {
  return provisionPlatformStaffManagerInternal(
    {
      ...input,
      staffCode: INITIAL_MANAGER_RECOVERY_STAFF_CODE,
    },
    "initial_recovery",
  );
}
