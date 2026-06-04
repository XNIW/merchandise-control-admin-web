import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  resolvePosStaffManagerWebPrincipal,
  type ShopAdminPrincipalResolution,
} from "./access-principal";
import { verifyStaffCredential } from "./staff-credentials";
import {
  getEnabledStaffRolePermissions,
  hasAnyStaffShopAdminWebAccess,
  hasStaffFullShopAdminWebAccess,
} from "./staff-web-permissions";

export const STAFF_WEB_SESSION_COOKIE = "mc_staff_web_session";

type ShopRow = Pick<
  Tables<"shops">,
  "shop_code" | "shop_id" | "shop_name" | "shop_status"
>;
type StaffAccountRow = Pick<
  Tables<"staff_accounts">,
  | "credential_hash"
  | "credential_status"
  | "credential_version"
  | "display_name"
  | "failed_attempts"
  | "last_login_at"
  | "locked_until"
  | "must_change_credential"
  | "role_key"
  | "session_invalidated_at"
  | "shop_id"
  | "staff_code"
  | "staff_id"
  | "status"
  | "web_access_revoked_at"
>;
type StaffWebSessionRow = Pick<
  Tables<"staff_web_sessions">,
  | "expires_at"
  | "issued_at"
  | "session_token_hash"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "staff_web_session_id"
  | "status"
>;
type StaffWebLoginAttemptRow = Pick<
  Tables<"staff_web_login_attempts">,
  "attempt_key_hash" | "failed_attempts" | "locked_until"
>;

type JsonRecord = { [key: string]: Json | undefined };

export type StaffWebLoginInput = {
  credential: string;
  staffCode: string;
  shopCode: string;
};

export type StaffWebRequestMeta = {
  userAgent?: string | null;
};

export type StaffWebLoginCode =
  | "success"
  | "denied"
  | "locked"
  | "not_configured"
  | "validation_failed"
  | "db_failure";

export type StaffWebLoginResult = {
  code: StaffWebLoginCode;
  ok: boolean;
};

const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const MAX_CREDENTIAL_LENGTH = 256;
const STAFF_WEB_SESSION_TTL_SECONDS = 12 * 60 * 60;
const STAFF_WEB_LOCKOUT_ATTEMPTS = 5;
const STAFF_WEB_LOCKOUT_SECONDS = 15 * 60;
const STAFF_WEB_SECRET_LENGTH = 32;

function nowIso() {
  return new Date().toISOString();
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isFutureTimestamp(value: string | null | undefined) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function isAfterTimestamp(left: string | null, right: string) {
  return Boolean(left && Date.parse(left) > Date.parse(right));
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function requestMetadata(meta: StaffWebRequestMeta): JsonRecord {
  return {
    source: "TASK-038",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

function staffWebLoginResult(code: StaffWebLoginCode): StaffWebLoginResult {
  return {
    code,
    ok: code === "success",
  };
}

function parseStaffWebLoginInput(input: StaffWebLoginInput) {
  const shopCode = normalizeCode(input.shopCode);
  const staffCode = normalizeCode(input.staffCode);
  const credential = input.credential;

  if (
    !SHOP_CODE_PATTERN.test(shopCode) ||
    !STAFF_CODE_PATTERN.test(staffCode) ||
    credential.length === 0 ||
    credential.length > MAX_CREDENTIAL_LENGTH
  ) {
    return null;
  }

  return {
    attemptKeyHash: hashStaffWebSecret(`${shopCode}:${staffCode}`),
    credential,
    staffCode,
    shopCode,
  };
}

export function generateStaffWebSecret() {
  return `mcstaff_web_${randomBytes(STAFF_WEB_SECRET_LENGTH).toString("base64url")}`;
}

export function hashStaffWebSecret(secret: string) {
  return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

export function verifyStaffWebSecret(secret: string, expectedHash: string) {
  if (!secret || !expectedHash) {
    return false;
  }

  const candidate = Buffer.from(hashStaffWebSecret(secret), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");

  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function isSecureStaffWebCookie() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://") === true
  );
}

async function getSupabaseForStaffWeb() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

async function writeStaffWebAudit(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    eventKey: string;
    metadata?: JsonRecord;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    shopId?: string;
    targetId?: string;
    targetType?: string;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    event_key: input.eventKey,
    metadata_redacted: {
      code: input.code,
      source: "TASK-038",
      ...(input.metadata ?? {}),
    },
    result: input.result,
    scope: input.shopId ? "shop" : "global",
    severity: input.severity,
    shop_id: input.shopId ?? null,
    target_id: input.targetId,
    target_type: input.targetType,
  });

  return !error;
}

async function getLoginAttempt(
  supabase: SupabaseAdminClient,
  attemptKeyHash: string,
) {
  const { data, error } = await supabase
    .from("staff_web_login_attempts")
    .select("attempt_key_hash,failed_attempts,locked_until")
    .eq("attempt_key_hash", attemptKeyHash)
    .maybeSingle<StaffWebLoginAttemptRow>();

  if (error) {
    return null;
  }

  return data;
}

async function updateFailedLoginAttempt(
  supabase: SupabaseAdminClient,
  attempt: StaffWebLoginAttemptRow | null,
  attemptKeyHash: string,
  metadata: JsonRecord,
) {
  const previousFailedAttempts =
    attempt?.locked_until && !isFutureTimestamp(attempt.locked_until)
      ? 0
      : (attempt?.failed_attempts ?? 0);
  const failedAttempts = Math.min(
    previousFailedAttempts + 1,
    STAFF_WEB_LOCKOUT_ATTEMPTS,
  );
  const locked = failedAttempts >= STAFF_WEB_LOCKOUT_ATTEMPTS;

  await supabase.from("staff_web_login_attempts").upsert(
    {
      attempt_key_hash: attemptKeyHash,
      failed_attempts: failedAttempts,
      last_failed_at: nowIso(),
      locked_until: locked ? addSeconds(STAFF_WEB_LOCKOUT_SECONDS) : null,
      metadata_redacted: metadata,
      updated_at: nowIso(),
    },
    { onConflict: "attempt_key_hash" },
  );
}

async function clearLoginAttempt(
  supabase: SupabaseAdminClient,
  attemptKeyHash: string,
  metadata: JsonRecord,
) {
  await supabase.from("staff_web_login_attempts").upsert(
    {
      attempt_key_hash: attemptKeyHash,
      failed_attempts: 0,
      last_success_at: nowIso(),
      locked_until: null,
      metadata_redacted: metadata,
      updated_at: nowIso(),
    },
    { onConflict: "attempt_key_hash" },
  );
}

async function updateFailedCredentialAttempt(
  supabase: SupabaseAdminClient,
  staff: StaffAccountRow,
) {
  const previousFailedAttempts =
    staff.locked_until && !isFutureTimestamp(staff.locked_until)
      ? 0
      : (staff.failed_attempts ?? 0);
  const failedAttempts = Math.min(
    previousFailedAttempts + 1,
    STAFF_WEB_LOCKOUT_ATTEMPTS,
  );
  const locked = failedAttempts >= STAFF_WEB_LOCKOUT_ATTEMPTS;

  await supabase
    .from("staff_accounts")
    .update({
      credential_status: locked ? "locked" : "active",
      failed_attempts: failedAttempts,
      locked_until: locked ? addSeconds(STAFF_WEB_LOCKOUT_SECONDS) : null,
      updated_at: nowIso(),
    })
    .eq("staff_id", staff.staff_id)
    .eq("shop_id", staff.shop_id);
}

async function clearSuccessfulCredentialAttempt(
  supabase: SupabaseAdminClient,
  staff: StaffAccountRow,
) {
  await supabase
    .from("staff_accounts")
    .update({
      credential_status: "active",
      failed_attempts: 0,
      last_login_at: nowIso(),
      locked_until: null,
      updated_at: nowIso(),
    })
    .eq("staff_id", staff.staff_id)
    .eq("shop_id", staff.shop_id);
}

function isStaffWebCredentialUsable(staff: StaffAccountRow) {
  return (
    staff.status === "active" &&
    staff.credential_status === "active" &&
    staff.must_change_credential !== true &&
    !staff.web_access_revoked_at &&
    !isFutureTimestamp(staff.locked_until) &&
    Boolean(staff.credential_hash)
  );
}

function isStaffEligibleForWebLogin(
  staff: StaffAccountRow,
  permissions: readonly string[],
) {
  if (staff.role_key !== "manager") {
    return false;
  }

  return (
    isStaffWebCredentialUsable(staff) &&
    (hasStaffFullShopAdminWebAccess(permissions) ||
      hasAnyStaffShopAdminWebAccess(permissions))
  );
}

async function setStaffWebCookie(sessionToken: string, expiresAt: string) {
  const cookieStore = await cookies();

  cookieStore.set(STAFF_WEB_SESSION_COOKIE, sessionToken, {
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureStaffWebCookie(),
  });
}

async function clearStaffWebCookie() {
  const cookieStore = await cookies();

  try {
    cookieStore.set(STAFF_WEB_SESSION_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: isSecureStaffWebCookie(),
    });
  } catch {
    // Server Components cannot always mutate cookies; authorization still fails closed.
  }
}

export async function authenticateStaffManagerWebLogin(
  input: StaffWebLoginInput,
  meta: StaffWebRequestMeta = {},
): Promise<StaffWebLoginResult> {
  const supabase = await getSupabaseForStaffWeb();

  if (!supabase) {
    return staffWebLoginResult("not_configured");
  }

  const metadata = requestMetadata(meta);
  const parsed = parseStaffWebLoginInput(input);

  if (!parsed) {
    await writeStaffWebAudit(supabase, {
      code: "validation_failed",
      eventKey: "staff.web.login.failure",
      metadata,
      result: "blocked",
      severity: "warning",
    });

    return staffWebLoginResult("validation_failed");
  }

  const attempt = await getLoginAttempt(supabase, parsed.attemptKeyHash);

  if (isFutureTimestamp(attempt?.locked_until)) {
    await writeStaffWebAudit(supabase, {
      code: "locked",
      eventKey: "staff.web.login.failure",
      metadata,
      result: "blocked",
      severity: "warning",
    });

    return staffWebLoginResult("locked");
  }

  const shopResult = await supabase
    .from("shops")
    .select("shop_id,shop_code,shop_name,shop_status")
    .eq("shop_code", parsed.shopCode)
    .maybeSingle<ShopRow>();

  if (shopResult.error) {
    return staffWebLoginResult("db_failure");
  }

  const shop = shopResult.data;

  if (!shop || shop.shop_status !== "active") {
    await updateFailedLoginAttempt(supabase, attempt, parsed.attemptKeyHash, metadata);
    await writeStaffWebAudit(supabase, {
      code: "denied",
      eventKey: "staff.web.login.failure",
      metadata,
      shopId: shop?.shop_id,
      result: "blocked",
      severity: "warning",
    });

    return staffWebLoginResult("denied");
  }

  const staffResult = await supabase
    .from("staff_accounts")
    .select(
      "staff_id,shop_id,staff_code,display_name,role_key,status,credential_hash,credential_version,credential_status,failed_attempts,locked_until,must_change_credential,last_login_at,session_invalidated_at,web_access_revoked_at",
    )
    .eq("shop_id", shop.shop_id)
    .eq("staff_code", parsed.staffCode)
    .maybeSingle<StaffAccountRow>();

  if (staffResult.error) {
    return staffWebLoginResult("db_failure");
  }

  const staff = staffResult.data;
  const rolePermissions = staff
    ? await getEnabledStaffRolePermissions(supabase, {
        roleKey: staff.role_key,
        shopId: shop.shop_id,
      })
    : { permissions: [], status: "ready" as const };

  if (rolePermissions.status === "error") {
    return staffWebLoginResult("db_failure");
  }

  if (!staff || !isStaffEligibleForWebLogin(staff, rolePermissions.permissions)) {
    await updateFailedLoginAttempt(supabase, attempt, parsed.attemptKeyHash, metadata);
    await writeStaffWebAudit(supabase, {
      code: "denied",
      eventKey: "staff.web.login.failure",
      metadata,
      result: "blocked",
      severity: "warning",
      shopId: shop.shop_id,
      targetId: staff?.staff_id,
      targetType: staff ? "staff" : undefined,
    });

    return staffWebLoginResult("denied");
  }

  if (!staff.credential_hash) {
    return staffWebLoginResult("denied");
  }

  const credentialOk = await verifyStaffCredential(
    parsed.credential,
    staff.credential_hash,
  );

  if (!credentialOk) {
    await updateFailedCredentialAttempt(supabase, staff);
    await updateFailedLoginAttempt(supabase, attempt, parsed.attemptKeyHash, metadata);
    await writeStaffWebAudit(supabase, {
      code: "denied",
      eventKey: "staff.web.login.failure",
      metadata,
      result: "blocked",
      severity: "warning",
      shopId: shop.shop_id,
      targetId: staff.staff_id,
      targetType: "staff",
    });

    return staffWebLoginResult("denied");
  }

  await clearSuccessfulCredentialAttempt(supabase, staff);
  await clearLoginAttempt(supabase, parsed.attemptKeyHash, metadata);

  const sessionToken = generateStaffWebSecret();
  const expiresAt = addSeconds(STAFF_WEB_SESSION_TTL_SECONDS);
  const sessionResult = await supabase
    .from("staff_web_sessions")
    .insert({
      expires_at: expiresAt,
      last_seen_at: nowIso(),
      metadata_redacted: metadata,
      session_token_hash: hashStaffWebSecret(sessionToken),
      shop_id: shop.shop_id,
      staff_credential_version: staff.credential_version,
      staff_id: staff.staff_id,
      status: "active",
    })
    .select("staff_web_session_id")
    .maybeSingle<Pick<StaffWebSessionRow, "staff_web_session_id">>();

  if (sessionResult.error || !sessionResult.data) {
    await writeStaffWebAudit(supabase, {
      code: "db_failure",
      eventKey: "staff.web.login.failure",
      metadata,
      result: "failure",
      severity: "critical",
      shopId: shop.shop_id,
      targetId: staff.staff_id,
      targetType: "staff",
    });

    return staffWebLoginResult("db_failure");
  }

  await setStaffWebCookie(sessionToken, expiresAt);
  await writeStaffWebAudit(supabase, {
    code: "success",
    eventKey: "staff.web.login.success",
    metadata,
    result: "success",
    severity: "info",
    shopId: shop.shop_id,
    targetId: staff.staff_id,
    targetType: "staff",
  });

  return staffWebLoginResult("success");
}

export async function resolveStaffWebSessionPrincipal(): Promise<ShopAdminPrincipalResolution> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(STAFF_WEB_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return {
      reason: "No staff web session cookie is present.",
      status: "no_session",
    };
  }

  const supabase = await getSupabaseForStaffWeb();

  if (!supabase) {
    return {
      reason: "Supabase admin runtime is not configured for staff web sessions.",
      status: "not_configured",
    };
  }

  const sessionTokenHash = hashStaffWebSecret(sessionToken);
  const sessionResult = await supabase
    .from("staff_web_sessions")
    .select(
      "staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at",
    )
    .eq("session_token_hash", sessionTokenHash)
    .eq("status", "active")
    .maybeSingle<StaffWebSessionRow>();

  if (sessionResult.error || !sessionResult.data) {
    await clearStaffWebCookie();

    return {
      reason: "Staff web session is not valid.",
      status: "unauthorized",
    };
  }

  const session = sessionResult.data;

  if (!verifyStaffWebSecret(sessionToken, session.session_token_hash)) {
    await clearStaffWebCookie();

    return {
      reason: "Staff web session token is not valid.",
      status: "unauthorized",
    };
  }

  if (Date.parse(session.expires_at) <= Date.now()) {
    await supabase
      .from("staff_web_sessions")
      .update({
        status: "expired",
        updated_at: nowIso(),
      })
      .eq("staff_web_session_id", session.staff_web_session_id);
    await clearStaffWebCookie();

    return {
      reason: "Staff web session expired.",
      status: "no_session",
    };
  }

  const [shopResult, staffResult] = await Promise.all([
    supabase
      .from("shops")
      .select("shop_id,shop_code,shop_name,shop_status")
      .eq("shop_id", session.shop_id)
      .maybeSingle<ShopRow>(),
    supabase
      .from("staff_accounts")
      .select(
        "staff_id,shop_id,staff_code,display_name,role_key,status,credential_hash,credential_version,credential_status,failed_attempts,locked_until,must_change_credential,last_login_at,session_invalidated_at,web_access_revoked_at",
      )
      .eq("staff_id", session.staff_id)
      .eq("shop_id", session.shop_id)
      .maybeSingle<StaffAccountRow>(),
  ]);

  if (shopResult.error || staffResult.error || !shopResult.data || !staffResult.data) {
    return {
      reason: "Staff web session could not resolve one shop and one staff account.",
      status: "unauthorized",
    };
  }

  const shop = shopResult.data;
  const staff = staffResult.data;
  const rolePermissions = await getEnabledStaffRolePermissions(supabase, {
    roleKey: staff.role_key,
    shopId: shop.shop_id,
  });

  if (
    rolePermissions.status === "error" ||
    shop.shop_status !== "active" ||
    Boolean(staff.web_access_revoked_at) ||
    staff.credential_version !== session.staff_credential_version ||
    isAfterTimestamp(staff.session_invalidated_at, session.issued_at)
  ) {
    return {
      reason: "Staff web session is no longer eligible.",
      status: "unauthorized",
    };
  }

  const principal = resolvePosStaffManagerWebPrincipal({
    credentialStatus: staff.credential_status,
    lockedUntil: staff.locked_until,
    mustChangeCredential: staff.must_change_credential,
    permissions: rolePermissions.permissions,
    roleKey: staff.role_key,
    shopCode: shop.shop_code,
    shopId: shop.shop_id,
    staffCode: staff.staff_code,
    staffId: staff.staff_id,
    status: staff.status,
  });

  if (principal.status !== "ready") {
    return principal;
  }

  await supabase
    .from("staff_web_sessions")
    .update({
      last_seen_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("staff_web_session_id", session.staff_web_session_id);

  return principal;
}

export async function logoutStaffWebSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(STAFF_WEB_SESSION_COOKIE)?.value;
  const supabase = await getSupabaseForStaffWeb();

  if (sessionToken && supabase) {
    const sessionTokenHash = hashStaffWebSecret(sessionToken);
    const sessionResult = await supabase
      .from("staff_web_sessions")
      .select("staff_web_session_id,shop_id,staff_id")
      .eq("session_token_hash", sessionTokenHash)
      .eq("status", "active")
      .maybeSingle<
        Pick<StaffWebSessionRow, "shop_id" | "staff_id" | "staff_web_session_id">
      >();

    if (sessionResult.data) {
      await supabase
        .from("staff_web_sessions")
        .update({
          revoked_at: nowIso(),
          revoked_reason: "staff_web_logout",
          status: "revoked",
          updated_at: nowIso(),
        })
        .eq("staff_web_session_id", sessionResult.data.staff_web_session_id);
      await writeStaffWebAudit(supabase, {
        code: "success",
        eventKey: "staff.web.logout",
        metadata: {
          source: "TASK-038",
        },
        result: "success",
        severity: "info",
        shopId: sessionResult.data.shop_id,
        targetId: sessionResult.data.staff_id,
        targetType: "staff",
      });
    }
  }

  await clearStaffWebCookie();
}
