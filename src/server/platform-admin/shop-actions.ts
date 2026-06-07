import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { hashStaffCredential } from "@/server/shop-admin/staff-credentials";
import {
  resolvePlatformAdminForRequest,
  type PlatformProvisioningRequestAuthDiagnostics,
} from "./provisioning-request-auth";
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
import { generateTemporaryManagerPin } from "./temporary-manager-pin";

type RpcResult = {
  audit_event_id?: unknown;
  code?: unknown;
  ok?: unknown;
  shop_id?: unknown;
};

type AuthorizedSupabaseServerClient = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

type FiscalShopWriteInput = {
  businessAddress: string;
  businessCity: string;
  businessGiro: string;
  companyRut: string;
  legalRepresentativeRut: string;
  reason: string;
  shopCode: string;
  shopName: string;
};

type CreatedFiscalShop = {
  company_rut: string | null;
  shop_code: string;
  shop_id: string;
  shop_name: string;
};

export const INITIAL_MANAGER_STAFF_CODE = "1001" as const;

type PlatformProvisioningBoundary =
  | {
      actorProfileId: string;
      adminClient: SupabaseAdminClient;
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

  return {
    actorProfileId: auth.actorProfileId,
    adminClient: auth.adminClient,
    status: "ready",
  };
}

function isUniqueConflict(error: { code?: string } | null) {
  return error?.code === "23505";
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pendingOwnerContactDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function redactedOwnerContact(value: string) {
  const [localPart, domain = ""] = value.split("@", 2);
  const first = localPart?.slice(0, 1) || "*";

  return `${first}***@${domain}`;
}

async function writeTask051Audit(
  adminClient: SupabaseAdminClient,
  input: {
    actorProfileId: string;
    code: PlatformShopActionCode | "attempt";
    eventKey: string;
    metadata?: Record<string, unknown>;
    reason: string;
    result: "blocked" | "failure" | "success";
    scope: "global" | "shop";
    severity: "critical" | "info" | "warning";
    shopId?: string;
    targetId?: string;
    targetType: string;
  },
) {
  const { data, error } = await adminClient
    .from("audit_logs")
    .insert({
      actor_profile_id: input.actorProfileId,
      event_key: input.eventKey,
      metadata_redacted: {
        code: input.code,
        reason_redacted: input.reason.trim().slice(0, 240) || null,
        source: "TASK-051",
        ...(input.metadata ?? {}),
      },
      result: input.result,
      scope: input.scope,
      severity: input.severity,
      shop_id: input.shopId ?? null,
      target_id: input.targetId,
      target_type: input.targetType,
    })
    .select("audit_log_id")
    .maybeSingle();

  if (error) {
    return { auditEventId: undefined, ok: false };
  }

  return { auditEventId: data?.audit_log_id, ok: true };
}

async function duplicateShopCodeOrRut(
  adminClient: SupabaseAdminClient,
  input: {
    companyRut: string;
    shopCode: string;
  },
) {
  const [shopCodeResult, companyRutResult] = await Promise.all([
    adminClient
      .from("shops")
      .select("shop_id")
      .eq("shop_code", input.shopCode)
      .limit(1),
    adminClient
      .from("shops")
      .select("shop_id")
      .eq("company_rut", input.companyRut)
      .limit(1),
  ]);

  if (shopCodeResult.error || companyRutResult.error) {
    return { code: "db_failure" as const, status: "error" as const };
  }

  if ((shopCodeResult.data?.length ?? 0) > 0) {
    return { code: "duplicate_shop_code" as const, status: "duplicate" as const };
  }

  if ((companyRutResult.data?.length ?? 0) > 0) {
    return { code: "duplicate_company_rut" as const, status: "duplicate" as const };
  }

  return { status: "none" as const };
}

async function insertInitialManager(
  adminClient: SupabaseAdminClient,
  input: {
    actorProfileId: string;
    credentialHash: string;
    displayName: string;
    shopId: string;
  },
) {
  const now = new Date().toISOString();
  const permission = await adminClient.from("staff_role_permissions").upsert(
    {
      enabled: true,
      permission_key: "shop_admin.full_access",
      role_key: "manager",
      shop_id: input.shopId,
      updated_at: now,
      updated_by_profile_id: input.actorProfileId,
    },
    { onConflict: "shop_id,role_key,permission_key" },
  );

  if (permission.error) {
    return { ok: false, staffId: undefined };
  }

  const staff = await adminClient
    .from("staff_accounts")
    .insert({
      created_by_profile_id: input.actorProfileId,
      credential_expires_at: addDays(14),
      credential_hash: input.credentialHash,
      credential_kind: "password",
      credential_status: "active",
      credential_updated_at: now,
      credential_version: 1,
      display_name: input.displayName,
      failed_attempts: 0,
      must_change_credential: false,
      role_key: "manager",
      shop_id: input.shopId,
      staff_code: INITIAL_MANAGER_STAFF_CODE,
      status: "active",
      updated_at: now,
      updated_by_profile_id: input.actorProfileId,
    })
    .select("staff_id")
    .maybeSingle();

  if (staff.error || !staff.data) {
    return { ok: false, staffId: undefined };
  }

  return { ok: true, staffId: staff.data.staff_id };
}

async function archiveIncompleteShop(
  adminClient: SupabaseAdminClient,
  input: {
    actorProfileId: string;
    shopId: string;
  },
) {
  const now = new Date().toISOString();

  await adminClient
    .from("staff_role_permissions")
    .delete()
    .eq("shop_id", input.shopId);
  await adminClient.from("staff_accounts").delete().eq("shop_id", input.shopId);
  await adminClient
    .from("shop_members")
    .delete()
    .eq("shop_id", input.shopId);
  await adminClient
    .from("platform_owner_invites")
    .delete()
    .eq("shop_id", input.shopId);
  await adminClient
    .from("shops")
    .update({
      archived_at: now,
      archived_by_profile_id: input.actorProfileId,
      shop_status: "archived",
      status_changed_at: now,
      status_changed_by_profile_id: input.actorProfileId,
      status_reason_redacted:
        "TASK-051 rollback archived incomplete provisioning attempt.",
      updated_at: now,
    })
    .eq("shop_id", input.shopId);
}

async function insertFiscalShop(
  adminClient: SupabaseAdminClient,
  input: {
    actorProfileId: string;
    fiscalShop: FiscalShopWriteInput;
    shopStatus: "active" | "pending_setup";
  },
) {
  const now = new Date().toISOString();
  const { fiscalShop } = input;

  return adminClient
    .from("shops")
    .insert({
      business_address: fiscalShop.businessAddress,
      business_city: fiscalShop.businessCity,
      business_giro: fiscalShop.businessGiro,
      company_rut: fiscalShop.companyRut,
      created_by_profile_id: input.actorProfileId,
      fiscal_identity_locked_by_platform: true,
      fiscal_identity_updated_at: now,
      fiscal_identity_updated_by_profile_id: input.actorProfileId,
      legal_representative_rut: fiscalShop.legalRepresentativeRut,
      shop_code: fiscalShop.shopCode,
      shop_name: fiscalShop.shopName,
      shop_status: input.shopStatus,
      status_changed_at: now,
      status_changed_by_profile_id: input.actorProfileId,
      status_reason_redacted: fiscalShop.reason.slice(0, 240),
    })
    .select("shop_id,shop_code,shop_name,company_rut")
    .maybeSingle<CreatedFiscalShop>();
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

  const { actorProfileId, adminClient } = boundary;
  const duplicate = await duplicateShopCodeOrRut(adminClient, normalized);

  if (duplicate.status === "error") {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.owner_bootstrap.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetType: "shop",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  if (duplicate.status === "duplicate") {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: duplicate.code,
      eventKey: "platform.shop.owner_bootstrap.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "blocked",
      scope: "global",
      severity: "warning",
      targetType: "shop",
    });

    return provisioningActionResult(duplicate.code, {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const ownerResult = await adminClient
    .from("profiles")
    .select("profile_id,profile_status")
    .eq("profile_id", normalized.ownerProfileId)
    .eq("profile_status", "active")
    .maybeSingle();

  if (ownerResult.error || !ownerResult.data) {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "owner_not_active",
      eventKey: "platform.shop.owner_bootstrap.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "blocked",
      scope: "global",
      severity: "warning",
      targetId: normalized.ownerProfileId,
      targetType: "profile",
    });

    return provisioningActionResult("owner_not_active", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const temporaryCredential = generateTemporaryManagerPin();
  const credentialHash = await hashStaffCredential(temporaryCredential, {
    allowTemporaryPin: true,
  });

  const shopResult = await insertFiscalShop(adminClient, {
    actorProfileId,
    fiscalShop: normalized,
    shopStatus: "active",
  });

  if (shopResult.error || !shopResult.data) {
    const code = isUniqueConflict(shopResult.error) ? "conflict" : "db_failure";
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code,
      eventKey: "platform.shop.owner_bootstrap.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: code === "conflict" ? "blocked" : "failure",
      scope: "global",
      severity: code === "conflict" ? "warning" : "critical",
      targetType: "shop",
    });

    return provisioningActionResult(code, {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const shop = shopResult.data;
  const memberResult = await adminClient.from("shop_members").insert({
    invited_by_profile_id: actorProfileId,
    membership_status: "active",
    profile_id: normalized.ownerProfileId,
    role_key: "shop_owner",
    shop_id: shop.shop_id,
  });

  if (memberResult.error) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.owner_bootstrap.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetId: shop.shop_id,
      targetType: "shop",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const staffResult = await insertInitialManager(adminClient, {
    actorProfileId,
    credentialHash,
    displayName: normalized.staffDisplayName ?? INITIAL_MANAGER_DISPLAY_NAME,
    shopId: shop.shop_id,
  });

  if (!staffResult.ok || !staffResult.staffId) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.owner_bootstrap.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetId: shop.shop_id,
      targetType: "shop",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const audit = await writeTask051Audit(adminClient, {
    actorProfileId,
    code: "success",
    eventKey: "platform.shop.owner_bootstrap.success",
    metadata: {
      company_rut_present: true,
      credential_generated: true,
      permission_key: "shop_admin.full_access",
      staff_code: INITIAL_MANAGER_STAFF_CODE,
      staff_id: staffResult.staffId,
    },
    reason: normalized.reason,
    result: "success",
    scope: "shop",
    severity: "info",
    shopId: shop.shop_id,
    targetId: shop.shop_id,
    targetType: "shop",
  });

  if (!audit.ok) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    return provisioningActionResult("db_failure", {
      credentialGenerated: false,
      ok: false,
      shopId: shop.shop_id,
    });
  }

  return provisioningActionResult("success", {
    auditEventId: audit.auditEventId,
    companyRut: shop.company_rut ?? normalized.companyRut,
    credentialGenerated: true,
    ok: true,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    shopName: normalized.shopName,
    staffCode: INITIAL_MANAGER_STAFF_CODE,
    staffId: staffResult.staffId,
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

  const { actorProfileId, adminClient } = boundary;
  const duplicate = await duplicateShopCodeOrRut(adminClient, normalized);

  if (duplicate.status === "error") {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.pos_first.create.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetType: "shop",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  if (duplicate.status === "duplicate") {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: duplicate.code,
      eventKey: "platform.shop.pos_first.create.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "blocked",
      scope: "global",
      severity: "warning",
      targetType: "shop",
    });

    return provisioningActionResult(duplicate.code, {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const temporaryCredential = generateTemporaryManagerPin();
  const credentialHash = await hashStaffCredential(temporaryCredential, {
    allowTemporaryPin: true,
  });
  const shopResult = await insertFiscalShop(adminClient, {
    actorProfileId,
    fiscalShop: normalized,
    shopStatus: "active",
  });

  if (shopResult.error || !shopResult.data) {
    const code = isUniqueConflict(shopResult.error) ? "conflict" : "db_failure";
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code,
      eventKey: "platform.shop.pos_first.create.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: code === "conflict" ? "blocked" : "failure",
      scope: "global",
      severity: code === "conflict" ? "warning" : "critical",
      targetType: "shop",
    });

    return provisioningActionResult(code, {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const shop = shopResult.data;
  const staffResult = await insertInitialManager(adminClient, {
    actorProfileId,
    credentialHash,
    displayName: normalized.staffDisplayName ?? INITIAL_MANAGER_DISPLAY_NAME,
    shopId: shop.shop_id,
  });

  if (!staffResult.ok || !staffResult.staffId) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.pos_first.create.failure",
      metadata: { credential_generated: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetId: shop.shop_id,
      targetType: "shop",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const audit = await writeTask051Audit(adminClient, {
    actorProfileId,
    code: "success",
    eventKey: "platform.shop.pos_first.create.success",
    metadata: {
      company_rut_present: true,
      credential_generated: true,
      permission_key: "shop_admin.full_access",
      staff_code: INITIAL_MANAGER_STAFF_CODE,
      staff_id: staffResult.staffId,
    },
    reason: normalized.reason,
    result: "success",
    scope: "shop",
    severity: "info",
    shopId: shop.shop_id,
    targetId: shop.shop_id,
    targetType: "shop",
  });

  if (!audit.ok) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    return provisioningActionResult("db_failure", {
      credentialGenerated: false,
      ok: false,
      shopId: shop.shop_id,
    });
  }

  return provisioningActionResult("success", {
    auditEventId: audit.auditEventId,
    companyRut: shop.company_rut ?? normalized.companyRut,
    credentialGenerated: true,
    ok: true,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    shopName: normalized.shopName,
    staffCode: INITIAL_MANAGER_STAFF_CODE,
    staffId: staffResult.staffId,
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

  const { actorProfileId, adminClient } = boundary;
  const duplicate = await duplicateShopCodeOrRut(adminClient, normalized);

  if (duplicate.status === "error") {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.pending_owner_invite.failure",
      metadata: { email_delivery_active: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetType: "owner_invite",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  if (duplicate.status === "duplicate") {
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: duplicate.code,
      eventKey: "platform.shop.pending_owner_invite.failure",
      metadata: { email_delivery_active: false },
      reason: normalized.reason,
      result: "blocked",
      scope: "global",
      severity: "warning",
      targetType: "shop",
    });

    return provisioningActionResult(duplicate.code, {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const shopResult = await insertFiscalShop(adminClient, {
    actorProfileId,
    fiscalShop: normalized,
    shopStatus: "pending_setup",
  });

  if (shopResult.error || !shopResult.data) {
    const code = isUniqueConflict(shopResult.error) ? "conflict" : "db_failure";
    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code,
      eventKey: "platform.shop.pending_owner_invite.failure",
      metadata: { email_delivery_active: false },
      reason: normalized.reason,
      result: code === "conflict" ? "blocked" : "failure",
      scope: "global",
      severity: code === "conflict" ? "warning" : "critical",
      targetType: "owner_invite",
    });

    return provisioningActionResult(code, {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const shop = shopResult.data;
  const inviteResult = await adminClient
    .from("platform_owner_invites")
    .insert({
      owner_contact_digest: pendingOwnerContactDigest(normalized.ownerContact),
      owner_contact_redacted: redactedOwnerContact(normalized.ownerContact),
      requested_by_profile_id: actorProfileId,
      shop_id: shop.shop_id,
    })
    .select("platform_owner_invite_id")
    .maybeSingle();

  if (inviteResult.error || !inviteResult.data) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    const audit = await writeTask051Audit(adminClient, {
      actorProfileId,
      code: "db_failure",
      eventKey: "platform.shop.pending_owner_invite.failure",
      metadata: { email_delivery_active: false },
      reason: normalized.reason,
      result: "failure",
      scope: "global",
      severity: "critical",
      targetId: shop.shop_id,
      targetType: "owner_invite",
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
    });
  }

  const inviteId = inviteResult.data.platform_owner_invite_id;
  const audit = await writeTask051Audit(adminClient, {
    actorProfileId,
    code: "success",
    eventKey: "platform.shop.pending_owner_invite.success",
    metadata: {
      company_rut_present: true,
      email_delivery_active: false,
    },
    reason: normalized.reason,
    result: "success",
    scope: "shop",
    severity: "info",
    shopId: shop.shop_id,
    targetId: inviteId,
    targetType: "owner_invite",
  });

  if (!audit.ok) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    return provisioningActionResult("db_failure", {
      credentialGenerated: false,
      ok: false,
      shopId: shop.shop_id,
    });
  }

  const inviteAuditResult = await adminClient
    .from("platform_owner_invites")
    .update({
      audit_log_id: audit.auditEventId,
      updated_at: new Date().toISOString(),
    })
    .eq("platform_owner_invite_id", inviteId);

  if (inviteAuditResult.error) {
    await archiveIncompleteShop(adminClient, {
      actorProfileId,
      shopId: shop.shop_id,
    });

    return provisioningActionResult("db_failure", {
      auditEventId: audit.auditEventId,
      credentialGenerated: false,
      ok: false,
      shopId: shop.shop_id,
    });
  }

  return provisioningActionResult("success", {
    auditEventId: audit.auditEventId,
    companyRut: shop.company_rut ?? normalized.companyRut,
    credentialGenerated: false,
    ok: true,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    shopName: normalized.shopName,
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
