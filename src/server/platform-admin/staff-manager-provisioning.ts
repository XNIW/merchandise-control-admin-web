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
  | "conflict"
  | "db_failure"
  | "invalid_state"
  | "not_configured"
  | "shop_not_found"
  | "unauthorized"
  | "validation_failed";

export type PlatformStaffManagerProvisionResult = {
  auditEventId?: string;
  code: PlatformStaffManagerProvisionCode;
  fieldErrors?: Record<string, string>;
  message: string;
  ok: boolean;
  oneTimeSignInValue?: string;
  shopId?: string;
  staffId?: string;
};

type ProvisionPlatformStaffManagerInput = {
  displayName: string;
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
  conflict: "A staff account with this code already exists for the shop.",
  db_failure: "Request could not be completed.",
  invalid_state: "The selected shop is not eligible for staff manager web access.",
  not_configured: "Platform Admin runtime is not configured.",
  shop_not_found: "The selected shop could not be found.",
  success: "Staff manager web access was provisioned.",
  unauthorized: "You are not authorized to perform this operation.",
  validation_failed: "Check the required fields and try again.",
};

const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const PLATFORM_STAFF_MANAGER_WEB_PERMISSION: typeof POS_STAFF_WEB_REQUIRED_PERMISSION =
  "shop_admin.full_access";
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
  const normalized = {
    displayName: input.displayName.trim().slice(0, 120),
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

  if (normalized.displayName.length < 2) {
    fieldErrors.displayName = "Display name is required.";
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
    displayNameLength: number;
    eventKey: string;
    reasonLength: number;
    result: "failure" | "success";
    shopId?: string;
    staffCodeLength: number;
    staffId?: string;
  },
) {
  const { data, error } = await adminClient
    .from("audit_logs")
    .insert({
      actor_profile_id: input.actorProfileId,
      event_key: input.eventKey,
      metadata_redacted: {
        code: input.code,
        display_name_length: input.displayNameLength,
        permission_key: PLATFORM_STAFF_MANAGER_WEB_PERMISSION,
        reason_length: input.reasonLength,
        role_key: POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY,
        source: "TASK-038",
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
    return undefined;
  }

  return data?.audit_log_id;
}

function isUniqueConflict(error: { code?: string } | null) {
  return error?.code === "23505";
}

export async function provisionPlatformStaffManager(
  input: ProvisionPlatformStaffManagerInput,
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
    .select("shop_id,shop_code,shop_status,archived_at")
    .eq("shop_id", normalized.shopId)
    .maybeSingle();

  if (shopResult.error) {
    return result("db_failure", { ok: false, shopId: normalized.shopId });
  }

  if (!shopResult.data) {
    return result("shop_not_found", { ok: false, shopId: normalized.shopId });
  }

  if (
    shopResult.data.shop_status !== "active" ||
    shopResult.data.archived_at !== null
  ) {
    const auditEventId = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "invalid_state",
      displayNameLength: normalized.displayName.length,
      eventKey: "platform.staff_manager_web.provision.failure",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCodeLength: normalized.staffCode.length,
    });

    return result("invalid_state", {
      auditEventId,
      ok: false,
      shopId: normalized.shopId,
    });
  }

  const existingStaff = await adminClient
    .from("staff_accounts")
    .select("staff_id")
    .eq("shop_id", normalized.shopId)
    .eq("staff_code", normalized.staffCode)
    .maybeSingle();

  if (existingStaff.error) {
    return result("db_failure", { ok: false, shopId: normalized.shopId });
  }

  if (existingStaff.data) {
    const auditEventId = await writePlatformStaffManagerAudit(adminClient, {
      actorProfileId,
      code: "conflict",
      displayNameLength: normalized.displayName.length,
      eventKey: "platform.staff_manager_web.provision.failure",
      reasonLength: normalized.reason.length,
      result: "failure",
      shopId: normalized.shopId,
      staffCodeLength: normalized.staffCode.length,
      staffId: existingStaff.data.staff_id,
    });

    return result("conflict", {
      auditEventId,
      ok: false,
      shopId: normalized.shopId,
      staffId: existingStaff.data.staff_id,
    });
  }

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
    return result("db_failure", { ok: false, shopId: normalized.shopId });
  }

  const oneTimeSignInValue = generateManagerCredential();
  const credentialHash = await hashStaffCredential(oneTimeSignInValue);
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
    return result(isUniqueConflict(staffResult.error) ? "conflict" : "db_failure", {
      ok: false,
      shopId: normalized.shopId,
    });
  }

  if (!staffResult.data) {
    return result("db_failure", { ok: false, shopId: normalized.shopId });
  }

  const auditEventId = await writePlatformStaffManagerAudit(adminClient, {
    actorProfileId,
    code: "success",
    displayNameLength: normalized.displayName.length,
    eventKey: "platform.staff_manager_web.provision.success",
    reasonLength: normalized.reason.length,
    result: "success",
    shopId: normalized.shopId,
    staffCodeLength: normalized.staffCode.length,
    staffId: staffResult.data.staff_id,
  });

  return result("success", {
    auditEventId,
    oneTimeSignInValue,
    shopId: staffResult.data.shop_id,
    staffId: staffResult.data.staff_id,
  });
}
