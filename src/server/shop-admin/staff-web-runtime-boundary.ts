import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(value: JsonObject, key: string) {
  return typeof value[key] === "string" ? value[key] : null;
}

function nullableStringField(value: JsonObject, key: string) {
  return value[key] === null || typeof value[key] === "string"
    ? (value[key] as string | null)
    : undefined;
}

function integerField(value: JsonObject, key: string) {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isSafeInteger(candidate)
    ? candidate
    : null;
}

function booleanField(value: JsonObject, key: string) {
  return typeof value[key] === "boolean" ? value[key] : null;
}

function sameUuid(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function normalizedCode(value: string) {
  return value.trim().toUpperCase();
}

function timestampMillis(value: string | null) {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function sameTimestamp(left: string, right: string) {
  const leftMillis = timestampMillis(left);
  const rightMillis = timestampMillis(right);
  return leftMillis !== null && leftMillis === rightMillis;
}

function parsePermissions(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? Array.from(new Set(value))
    : null;
}

export type StaffWebRuntimeShop = {
  companyRut: string | null;
  shopCode: string;
  shopId: string;
  shopName: string;
  shopStatus: string;
};

export type StaffWebRuntimeStaff = {
  credentialExpiresAt: string | null;
  credentialHash: string | null;
  credentialStatus: string;
  credentialVersion: number;
  displayName: string;
  failedAttempts: number;
  lockedUntil: string | null;
  mustChangeCredential: boolean;
  roleKey: string;
  sessionInvalidatedAt: string | null;
  shopId: string;
  staffCode: string;
  staffId: string;
  status: string;
  webAccessRevokedAt: string | null;
};

function parseShop(value: unknown): StaffWebRuntimeShop | null {
  if (!isRecord(value)) return null;
  const shopId = stringField(value, "shop_id");
  const shopCode = stringField(value, "shop_code");
  const shopName = stringField(value, "shop_name");
  const shopStatus = stringField(value, "shop_status");
  const companyRut = nullableStringField(value, "company_rut");
  if (
    !shopId ||
    !UUID_PATTERN.test(shopId) ||
    !shopCode ||
    !shopName ||
    !shopStatus ||
    companyRut === undefined
  ) {
    return null;
  }
  return { companyRut, shopCode, shopId, shopName, shopStatus };
}

function parseStaff(
  value: unknown,
  includeCredentialHash: boolean,
): StaffWebRuntimeStaff | null {
  if (!isRecord(value)) return null;
  const staffId = stringField(value, "staff_id");
  const shopId = stringField(value, "shop_id");
  const staffCode = stringField(value, "staff_code");
  const displayName = stringField(value, "display_name");
  const roleKey = stringField(value, "role_key");
  const status = stringField(value, "status");
  const credentialStatus = stringField(value, "credential_status");
  const credentialVersion = integerField(value, "credential_version");
  const mustChangeCredential = booleanField(value, "must_change_credential");
  const credentialExpiresAt = nullableStringField(
    value,
    "credential_expires_at",
  );
  const credentialHash = includeCredentialHash
    ? nullableStringField(value, "credential_hash")
    : null;
  const failedAttempts = includeCredentialHash
    ? integerField(value, "failed_attempts")
    : 0;
  const lockedUntil = nullableStringField(value, "locked_until");
  const sessionInvalidatedAt = nullableStringField(
    value,
    "session_invalidated_at",
  );
  const webAccessRevokedAt = nullableStringField(value, "web_access_revoked_at");
  if (
    !staffId ||
    !UUID_PATTERN.test(staffId) ||
    !shopId ||
    !UUID_PATTERN.test(shopId) ||
    !staffCode ||
    !displayName ||
    !roleKey ||
    !status ||
    !credentialStatus ||
    credentialVersion === null ||
    mustChangeCredential === null ||
    credentialExpiresAt === undefined ||
    credentialHash === undefined ||
    failedAttempts === null ||
    lockedUntil === undefined ||
    sessionInvalidatedAt === undefined ||
    webAccessRevokedAt === undefined
  ) {
    return null;
  }
  return {
    credentialExpiresAt,
    credentialHash,
    credentialStatus,
    credentialVersion,
    displayName,
    failedAttempts,
    lockedUntil,
    mustChangeCredential,
    roleKey,
    sessionInvalidatedAt,
    shopId,
    staffCode,
    staffId,
    status,
    webAccessRevokedAt,
  };
}

export type StaffWebLoginLookup = {
  attempt: {
    attemptKeyHash: string;
    failedAttempts: number;
    lockedUntil: string | null;
  } | null;
  permissions: string[];
  shop: StaffWebRuntimeShop | null;
  staff: StaffWebRuntimeStaff | null;
};

export async function lookupStaffWebLogin(
  admin: SupabaseAdminClient,
  input: { attemptKeyHash: string; shopCode: string; staffCode: string },
): Promise<StaffWebLoginLookup | null> {
  const result = await admin.rpc("staff_web_login_lookup_v1", {
    p_attempt_key_hash: input.attemptKeyHash,
    p_shop_code: input.shopCode,
    p_staff_code: input.staffCode,
  });
  if (result.error || !isRecord(result.data) || result.data.status !== "ok") {
    return null;
  }
  const permissions = parsePermissions(result.data.permissions);
  const shop = result.data.shop === null ? null : parseShop(result.data.shop);
  const staff =
    result.data.staff === null ? null : parseStaff(result.data.staff, true);
  let attempt: StaffWebLoginLookup["attempt"] = null;
  if (result.data.attempt !== null) {
    if (!isRecord(result.data.attempt)) return null;
    const attemptKeyHash = stringField(result.data.attempt, "attempt_key_hash");
    const failedAttempts = integerField(result.data.attempt, "failed_attempts");
    const lockedUntil = nullableStringField(result.data.attempt, "locked_until");
    if (!attemptKeyHash || failedAttempts === null || lockedUntil === undefined) {
      return null;
    }
    attempt = { attemptKeyHash, failedAttempts, lockedUntil };
  }
  if (!permissions || (result.data.shop !== null && !shop) || (result.data.staff !== null && !staff)) {
    return null;
  }
  if (
    (attempt !== null && attempt.attemptKeyHash !== input.attemptKeyHash) ||
    (shop !== null &&
      normalizedCode(shop.shopCode) !== normalizedCode(input.shopCode)) ||
    (staff !== null &&
      (shop === null ||
        !sameUuid(staff.shopId, shop.shopId) ||
        normalizedCode(staff.staffCode) !== normalizedCode(input.staffCode)))
  ) {
    return null;
  }
  return { attempt, permissions, shop, staff };
}

export async function recordStaffWebLoginFailure(
  admin: SupabaseAdminClient,
  input: {
    affectStaff?: boolean;
    attemptKeyHash: string;
    code: string;
    expectedCredentialVersion?: number;
    metadata: Record<string, Json | undefined>;
    shopId?: string;
    staffId?: string;
  },
) {
  const result = await admin.rpc("staff_web_login_failure_v1", {
    p_affect_staff: input.affectStaff ?? false,
    p_attempt_key_hash: input.attemptKeyHash,
    p_code: input.code,
    p_expected_credential_version: input.expectedCredentialVersion ?? null,
    p_metadata_redacted: input.metadata,
    p_shop_id: input.shopId ?? null,
    p_staff_id: input.staffId ?? null,
  });
  return !result.error && isRecord(result.data) && result.data.ok === true;
}

export async function commitStaffWebLogin(
  admin: SupabaseAdminClient,
  input: {
    attemptKeyHash: string;
    expectedCredentialVersion: number;
    expiresAt: string;
    metadata: Record<string, Json | undefined>;
    sessionTokenHash: string;
    shopId: string;
    staffId: string;
  },
) {
  const result = await admin.rpc("staff_web_login_commit_v1", {
    p_attempt_key_hash: input.attemptKeyHash,
    p_expected_credential_version: input.expectedCredentialVersion,
    p_expires_at: input.expiresAt,
    p_metadata_redacted: input.metadata,
    p_session_token_hash: input.sessionTokenHash,
    p_shop_id: input.shopId,
    p_staff_id: input.staffId,
  });
  if (result.error || !isRecord(result.data)) return null;
  const code = stringField(result.data, "code") ?? "database_error";
  if (result.data.ok !== true) return { code, ok: false as const };
  const staffWebSessionId = stringField(result.data, "staffWebSessionId");
  const expiresAt = stringField(result.data, "expiresAt");
  const returnedAttemptKeyHash = stringField(result.data, "attemptKeyHash");
  const returnedShopId = stringField(result.data, "shopId");
  const returnedStaffId = stringField(result.data, "staffId");
  const returnedCredentialVersion = integerField(
    result.data,
    "credentialVersion",
  );
  return code === "success" &&
    staffWebSessionId &&
    UUID_PATTERN.test(staffWebSessionId) &&
    returnedAttemptKeyHash === input.attemptKeyHash &&
    returnedShopId !== null &&
    sameUuid(returnedShopId, input.shopId) &&
    returnedStaffId !== null &&
    sameUuid(returnedStaffId, input.staffId) &&
    returnedCredentialVersion === input.expectedCredentialVersion &&
    expiresAt &&
    sameTimestamp(expiresAt, input.expiresAt) &&
    (timestampMillis(expiresAt) ?? 0) > Date.now()
    ? { code: "success", expiresAt, ok: true as const, staffWebSessionId }
    : null;
}

export type StaffWebResolvedRuntime = {
  expiresAt: string;
  issuedAt: string;
  permissions: string[];
  sessionId: string;
  shop: StaffWebRuntimeShop;
  staff: StaffWebRuntimeStaff;
};

export type StaffWebRuntimeSessionResolution =
  | { kind: "denied" | "expired" | "failed" }
  | { kind: "ok"; runtime: StaffWebResolvedRuntime };

export async function resolveStaffWebRuntimeSession(
  admin: SupabaseAdminClient,
  sessionTokenHash: string,
): Promise<StaffWebRuntimeSessionResolution> {
  let result: Awaited<ReturnType<SupabaseAdminClient["rpc"]>>;

  try {
    result = await admin.rpc("staff_web_session_resolve_v1", {
      p_session_token_hash: sessionTokenHash,
    });
  } catch {
    return { kind: "failed" };
  }

  const data = result.data as unknown;

  if (result.error || !isRecord(data)) {
    return { kind: "failed" };
  }

  if (data.status === "expired") {
    return { kind: "expired" };
  }

  if (data.status !== "ok") {
    return data.status === "denied"
      ? { kind: "denied" }
      : { kind: "failed" };
  }

  const shop = parseShop(data.shop);
  const staff = parseStaff(data.staff, false);
  const permissions = parsePermissions(data.permissions);
  if (!shop || !staff || !permissions || !isRecord(data.session)) {
    return { kind: "failed" };
  }

  const sessionId = stringField(data.session, "staff_web_session_id");
  const sessionShopId = stringField(data.session, "shop_id");
  const sessionStaffId = stringField(data.session, "staff_id");
  const sessionCredentialVersion = integerField(
    data.session,
    "staff_credential_version",
  );
  const returnedTokenHash = stringField(
    data.session,
    "session_token_hash",
  );
  const sessionStatus = stringField(data.session, "status");
  const issuedAt = stringField(data.session, "issued_at");
  const expiresAt = stringField(data.session, "expires_at");
  const now = Date.now();
  const issuedAtMillis = timestampMillis(issuedAt);
  const expiresAtMillis = timestampMillis(expiresAt);
  const credentialExpiresAtMillis = timestampMillis(staff.credentialExpiresAt);
  const lockedUntilMillis = timestampMillis(staff.lockedUntil);
  const invalidatedAtMillis = timestampMillis(staff.sessionInvalidatedAt);
  if (
    !sessionId ||
    !UUID_PATTERN.test(sessionId) ||
    !sessionShopId ||
    !UUID_PATTERN.test(sessionShopId) ||
    !sessionStaffId ||
    !UUID_PATTERN.test(sessionStaffId) ||
    sessionCredentialVersion === null ||
    returnedTokenHash !== sessionTokenHash ||
    !issuedAt ||
    !expiresAt ||
    issuedAtMillis === null ||
    expiresAtMillis === null ||
    (staff.credentialExpiresAt !== null && credentialExpiresAtMillis === null) ||
    (staff.lockedUntil !== null && lockedUntilMillis === null) ||
    (staff.sessionInvalidatedAt !== null && invalidatedAtMillis === null)
  ) {
    return { kind: "failed" };
  }

  if (expiresAtMillis <= now) {
    return { kind: "expired" };
  }

  if (
    sessionStatus !== "active" ||
    issuedAtMillis > now ||
    !sameUuid(sessionShopId, shop.shopId) ||
    !sameUuid(sessionShopId, staff.shopId) ||
    !sameUuid(sessionStaffId, staff.staffId) ||
    sessionCredentialVersion !== staff.credentialVersion ||
    shop.shopStatus !== "active" ||
    staff.status !== "active" ||
    staff.roleKey !== "manager" ||
    staff.credentialStatus !== "active" ||
    staff.mustChangeCredential ||
    staff.webAccessRevokedAt !== null ||
    (staff.credentialExpiresAt !== null &&
      (credentialExpiresAtMillis! <= now ||
        expiresAtMillis > credentialExpiresAtMillis!)) ||
    (staff.lockedUntil !== null &&
      lockedUntilMillis! > now) ||
    (staff.sessionInvalidatedAt !== null &&
      invalidatedAtMillis! > issuedAtMillis)
  ) {
    return { kind: "denied" };
  }

  return {
    kind: "ok",
    runtime: { expiresAt, issuedAt, permissions, sessionId, shop, staff },
  };
}

export type StaffWebRuntimeSessionRevocation =
  | "failed"
  | "not_found"
  | "revoked";

export async function revokeStaffWebRuntimeSession(
  admin: SupabaseAdminClient,
  input: { reason: string; recordLogout?: boolean; sessionTokenHash: string },
): Promise<StaffWebRuntimeSessionRevocation> {
  try {
    const result = await admin.rpc("staff_web_session_revoke_v1", {
      p_reason: input.reason,
      p_record_logout: input.recordLogout ?? false,
      p_session_token_hash: input.sessionTokenHash,
    });

    if (result.error) {
      return "failed";
    }

    return result.data === true ? "revoked" : "not_found";
  } catch {
    return "failed";
  }
}
