import "server-only";

import type { Json, Tables } from "@/lib/supabase/database.types";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { PosShopPayloadRow } from "./shop-payload";

export type PosRuntimeSession = Pick<
  Tables<"pos_sessions">,
  | "expires_at"
  | "heartbeat_count"
  | "issued_at"
  | "pos_device_credential_id"
  | "pos_session_id"
  | "revoked_at"
  | "session_token_hash"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
>;

export type PosRuntimeCredential = Pick<
  Tables<"pos_device_credentials">,
  | "expires_at"
  | "pos_device_credential_id"
  | "revoked_at"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
  | "token_hash"
>;

export type PosRuntimeStaff = Pick<
  Tables<"staff_accounts">,
  | "credential_expires_at"
  | "credential_status"
  | "credential_version"
  | "display_name"
  | "locked_until"
  | "must_change_credential"
  | "role_key"
  | "session_invalidated_at"
  | "shop_id"
  | "staff_code"
  | "staff_id"
  | "status"
>;

export type PosRuntimeDevice = Pick<
  Tables<"shop_devices">,
  | "device_identifier"
  | "revoked_at"
  | "shop_device_id"
  | "shop_id"
  | "status"
>;

export type PosFirstLoginStaff = PosRuntimeStaff &
  Pick<Tables<"staff_accounts">, "credential_hash" | "failed_attempts">;

type JsonObject = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POS_CATALOG_SCOPE_KEY_PATTERN = /^[0-9a-f]{32}$/;
const POS_CATALOG_REVISION_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const STRICT_UTC_FRACTIONAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredString(row: JsonObject, key: string) {
  return typeof row[key] === "string" ? row[key] : null;
}

function nullableString(row: JsonObject, key: string) {
  return row[key] === null || typeof row[key] === "string"
    ? (row[key] as string | null)
    : undefined;
}

function requiredInteger(row: JsonObject, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function requiredBoolean(row: JsonObject, key: string) {
  return typeof row[key] === "boolean" ? row[key] : null;
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

function parseShop(value: unknown): PosShopPayloadRow | null {
  if (!isRecord(value)) return null;

  const shopId = requiredString(value, "shop_id");
  const shopCode = requiredString(value, "shop_code");
  const shopName = requiredString(value, "shop_name");
  const shopStatus = requiredString(value, "shop_status");
  const fiscalLocked = requiredBoolean(value, "fiscal_identity_locked_by_platform");
  const businessAddress = nullableString(value, "business_address");
  const businessCity = nullableString(value, "business_city");
  const businessGiro = nullableString(value, "business_giro");
  const companyRut = nullableString(value, "company_rut");
  const legalRut = nullableString(value, "legal_representative_rut");
  const updatedAt = requiredString(value, "updated_at");

  if (
    !shopId ||
    !UUID_PATTERN.test(shopId) ||
    !shopCode ||
    !shopName ||
    !shopStatus ||
    fiscalLocked === null ||
    businessAddress === undefined ||
    businessCity === undefined ||
    businessGiro === undefined ||
    companyRut === undefined ||
    legalRut === undefined ||
    !updatedAt
  ) {
    return null;
  }

  return {
    business_address: businessAddress,
    business_city: businessCity,
    business_giro: businessGiro,
    company_rut: companyRut,
    fiscal_identity_locked_by_platform: fiscalLocked,
    legal_representative_rut: legalRut,
    shop_code: shopCode,
    shop_id: shopId,
    shop_name: shopName,
    shop_status: shopStatus,
    updated_at: updatedAt,
  };
}

function parseSession(value: unknown): PosRuntimeSession | null {
  if (!isRecord(value)) return null;
  const posSessionId = requiredString(value, "pos_session_id");
  const shopId = requiredString(value, "shop_id");
  const shopDeviceId = requiredString(value, "shop_device_id");
  const staffId = requiredString(value, "staff_id");
  const credentialId = requiredString(value, "pos_device_credential_id");
  const tokenHash = requiredString(value, "session_token_hash");
  const credentialVersion = requiredInteger(value, "staff_credential_version");
  const heartbeatCount = requiredInteger(value, "heartbeat_count");
  const status = requiredString(value, "status");
  const issuedAt = requiredString(value, "issued_at");
  const expiresAt = requiredString(value, "expires_at");
  const revokedAt = nullableString(value, "revoked_at");

  if (
    !posSessionId ||
    !shopId ||
    !shopDeviceId ||
    !staffId ||
    !credentialId ||
    !tokenHash ||
    credentialVersion === null ||
    heartbeatCount === null ||
    !status ||
    !issuedAt ||
    !expiresAt ||
    revokedAt === undefined ||
    ![posSessionId, shopId, shopDeviceId, staffId, credentialId].every((id) =>
      UUID_PATTERN.test(id),
    )
  ) return null;

  return {
    expires_at: expiresAt,
    heartbeat_count: heartbeatCount,
    issued_at: issuedAt,
    pos_device_credential_id: credentialId,
    pos_session_id: posSessionId,
    revoked_at: revokedAt,
    session_token_hash: tokenHash,
    shop_device_id: shopDeviceId,
    shop_id: shopId,
    staff_credential_version: credentialVersion,
    staff_id: staffId,
    status,
  };
}

function parseCredential(value: unknown): PosRuntimeCredential | null {
  if (!isRecord(value)) return null;
  const id = requiredString(value, "pos_device_credential_id");
  const shopId = requiredString(value, "shop_id");
  const deviceId = requiredString(value, "shop_device_id");
  const staffId = requiredString(value, "staff_id");
  const tokenHash = requiredString(value, "token_hash");
  const version = requiredInteger(value, "staff_credential_version");
  const status = requiredString(value, "status");
  const expiresAt = requiredString(value, "expires_at");
  const revokedAt = nullableString(value, "revoked_at");
  if (
    !id || !shopId || !deviceId || !staffId || !tokenHash ||
    version === null || !status || !expiresAt || revokedAt === undefined ||
    ![id, shopId, deviceId, staffId].every((candidate) => UUID_PATTERN.test(candidate))
  ) return null;

  return {
    expires_at: expiresAt,
    pos_device_credential_id: id,
    revoked_at: revokedAt,
    shop_device_id: deviceId,
    shop_id: shopId,
    staff_credential_version: version,
    staff_id: staffId,
    status,
    token_hash: tokenHash,
  };
}

function parseStaff(value: unknown, includeCredentialHash = false) {
  if (!isRecord(value)) return null;
  const staffId = requiredString(value, "staff_id");
  const shopId = requiredString(value, "shop_id");
  const staffCode = requiredString(value, "staff_code");
  const displayName = requiredString(value, "display_name");
  const roleKey = requiredString(value, "role_key");
  const status = requiredString(value, "status");
  const credentialStatus = requiredString(value, "credential_status");
  const credentialVersion = requiredInteger(value, "credential_version");
  const mustChange = requiredBoolean(value, "must_change_credential");
  const credentialExpires = nullableString(value, "credential_expires_at");
  const lockedUntil = nullableString(value, "locked_until");
  const invalidatedAt = nullableString(value, "session_invalidated_at");
  const credentialHash = includeCredentialHash
    ? nullableString(value, "credential_hash")
    : null;
  const failedAttempts = includeCredentialHash
    ? requiredInteger(value, "failed_attempts")
    : 0;

  if (
    !staffId || !shopId || !staffCode || !displayName || !roleKey || !status ||
    !credentialStatus || credentialVersion === null || mustChange === null ||
    credentialExpires === undefined || lockedUntil === undefined ||
    invalidatedAt === undefined || (includeCredentialHash && credentialHash === undefined) ||
    failedAttempts === null || !UUID_PATTERN.test(staffId) || !UUID_PATTERN.test(shopId)
  ) return null;

  const base: PosRuntimeStaff = {
    credential_expires_at: credentialExpires,
    credential_status: credentialStatus,
    credential_version: credentialVersion,
    display_name: displayName,
    locked_until: lockedUntil,
    must_change_credential: mustChange,
    role_key: roleKey,
    session_invalidated_at: invalidatedAt,
    shop_id: shopId,
    staff_code: staffCode,
    staff_id: staffId,
    status,
  };

  return includeCredentialHash
    ? {
        ...base,
        credential_hash: credentialHash ?? null,
        failed_attempts: failedAttempts,
      } satisfies PosFirstLoginStaff
    : base;
}

function parseDevice(value: unknown): PosRuntimeDevice | null {
  if (!isRecord(value)) return null;
  const id = requiredString(value, "shop_device_id");
  const shopId = requiredString(value, "shop_id");
  const identifier = requiredString(value, "device_identifier");
  const status = requiredString(value, "status");
  const revokedAt = nullableString(value, "revoked_at");
  return id && shopId && identifier && status && revokedAt !== undefined &&
      UUID_PATTERN.test(id) && UUID_PATTERN.test(shopId)
    ? {
        device_identifier: identifier,
        revoked_at: revokedAt,
        shop_device_id: id,
        shop_id: shopId,
        status,
      }
    : null;
}

export type PosRuntimeLeaseResult =
  | {
      credential: PosRuntimeCredential;
      device: PosRuntimeDevice;
      session: PosRuntimeSession;
      shop: PosShopPayloadRow;
      staff: PosRuntimeStaff;
      status: "ok";
    }
  | { status: "db_failure" }
  | { status: "denied" };

export async function loadPosRuntimeLease(
  supabase: SupabaseAdminClient,
  input: { posSessionId: string; shopDeviceId: string },
): Promise<PosRuntimeLeaseResult> {
  if (
    !UUID_PATTERN.test(input.posSessionId) ||
    !UUID_PATTERN.test(input.shopDeviceId)
  ) {
    return { status: "db_failure" };
  }

  const { data, error } = await supabase.rpc("pos_runtime_lease_v1", {
    p_pos_session_id: input.posSessionId,
    p_shop_device_id: input.shopDeviceId,
  });

  if (error || !isRecord(data)) return { status: "db_failure" };
  if (data.status === "denied") return { status: "denied" };
  if (data.status !== "ok") return { status: "db_failure" };

  const session = parseSession(data.session);
  const credential = parseCredential(data.credential);
  const staff = parseStaff(data.staff);
  const device = parseDevice(data.device);
  const shop = parseShop(data.shop);
  if (!session || !credential || !staff || !device || !shop) {
    return { status: "db_failure" };
  }

  const now = Date.now();
  const sessionIssuedAt = timestampMillis(session.issued_at);
  const sessionExpiresAt = timestampMillis(session.expires_at);
  const credentialExpiresAt = timestampMillis(credential.expires_at);
  const staffCredentialExpiresAt = timestampMillis(staff.credential_expires_at);
  const lockedUntil = timestampMillis(staff.locked_until);
  const sessionInvalidatedAt = timestampMillis(staff.session_invalidated_at);
  const sameShop = [
    credential.shop_id,
    staff.shop_id,
    device.shop_id,
    shop.shop_id,
  ].every((shopId) => sameUuid(shopId, session.shop_id));
  const graphValid =
    sameUuid(session.pos_session_id, input.posSessionId) &&
    sameUuid(session.shop_device_id, input.shopDeviceId) &&
    sameUuid(credential.pos_device_credential_id, session.pos_device_credential_id) &&
    sameUuid(credential.shop_device_id, session.shop_device_id) &&
    sameUuid(device.shop_device_id, session.shop_device_id) &&
    sameUuid(credential.staff_id, session.staff_id) &&
    sameUuid(staff.staff_id, session.staff_id) &&
    sameShop &&
    credential.staff_credential_version === session.staff_credential_version &&
    staff.credential_version === session.staff_credential_version;
  const leaseValid =
    session.status === "active" &&
    session.revoked_at === null &&
    credential.status === "active" &&
    credential.revoked_at === null &&
    device.status === "active" &&
    device.revoked_at === null &&
    shop.shop_status === "active" &&
    staff.status === "active" &&
    staff.credential_status === "active" &&
    staff.must_change_credential === false &&
    sessionIssuedAt !== null &&
    sessionIssuedAt <= now &&
    sessionExpiresAt !== null &&
    sessionExpiresAt > now &&
    credentialExpiresAt !== null &&
    credentialExpiresAt > now &&
    sessionExpiresAt <= credentialExpiresAt &&
    (staff.credential_expires_at === null ||
      (staffCredentialExpiresAt !== null &&
        staffCredentialExpiresAt > now &&
        sessionExpiresAt <= staffCredentialExpiresAt)) &&
    (staff.locked_until === null ||
      (lockedUntil !== null && lockedUntil <= now)) &&
    (staff.session_invalidated_at === null ||
      (sessionInvalidatedAt !== null && sessionInvalidatedAt <= sessionIssuedAt));

  if (!graphValid) {
    return { status: "db_failure" };
  }
  return leaseValid
    ? { credential, device, session, shop, staff, status: "ok" }
    : { status: "denied" };
}

export type PosFirstLoginLookupResult =
  | {
      device: PosRuntimeDevice | null;
      shop: PosShopPayloadRow;
      staff: PosFirstLoginStaff | null;
      status: "ok";
    }
  | { status: "db_failure" }
  | { status: "denied" };

export async function loadPosFirstLoginIdentity(
  supabase: SupabaseAdminClient,
  input: { deviceIdentifier: string; shopCode: string; staffCode: string },
): Promise<PosFirstLoginLookupResult> {
  const { data, error } = await supabase.rpc("pos_runtime_first_login_lookup_v1", {
    p_device_identifier: input.deviceIdentifier,
    p_shop_code: input.shopCode,
    p_staff_code: input.staffCode,
  });
  if (error || !isRecord(data)) return { status: "db_failure" };
  if (data.status === "denied") return { status: "denied" };
  if (data.status !== "ok") return { status: "db_failure" };
  const shop = parseShop(data.shop);
  const staff = data.staff === null ? null : parseStaff(data.staff, true);
  const device = data.device === null ? null : parseDevice(data.device);
  const identityValid = Boolean(
    shop &&
      normalizedCode(shop.shop_code) === normalizedCode(input.shopCode) &&
      (staff === null ||
        (sameUuid(staff.shop_id, shop.shop_id) &&
          normalizedCode(staff.staff_code) === normalizedCode(input.staffCode))) &&
      (device === null ||
        (sameUuid(device.shop_id, shop.shop_id) &&
          device.device_identifier === input.deviceIdentifier)),
  );
  if (
    !identityValid ||
    !shop ||
    (data.staff !== null && !staff) ||
    (data.device !== null && !device)
  ) {
    return { status: "db_failure" };
  }
  return {
    device,
    shop,
    staff: staff as PosFirstLoginStaff | null,
    status: "ok",
  };
}

export async function recordPosFirstLoginFailure(
  supabase: SupabaseAdminClient,
  input: { credentialVersion: number; shopId: string; staffId: string },
) {
  const { data, error } = await supabase.rpc("pos_runtime_first_login_failure_v1", {
    p_expected_credential_version: input.credentialVersion,
    p_lockout_attempts: 5,
    p_lockout_seconds: 15 * 60,
    p_shop_id: input.shopId,
    p_staff_id: input.staffId,
  });
  return !error && isRecord(data) && data.ok === true;
}

export async function commitPosFirstLogin(
  supabase: SupabaseAdminClient,
  input: {
    appVersion?: string;
    credentialVersion: number;
    deviceDisplayName: string;
    deviceIdentifier: string;
    deviceTokenHash: string;
    deviceTtlSeconds: number;
    metadata: Json;
    offlineAuthorizationMaxAgeSeconds: number;
    offlineAuthorizationPolicyVersion: string;
    sessionTokenHash: string;
    sessionTtlSeconds: number;
    shopId: string;
    staffId: string;
  },
) {
  const { data, error } = await supabase.rpc("pos_runtime_first_login_commit_v3", {
    p_app_version: input.appVersion ?? "",
    p_device_display_name: input.deviceDisplayName,
    p_device_identifier: input.deviceIdentifier,
    p_device_token_hash: input.deviceTokenHash,
    p_device_ttl_seconds: input.deviceTtlSeconds,
    p_expected_credential_version: input.credentialVersion,
    p_metadata_redacted: input.metadata,
    p_offline_authorization_max_age_seconds:
      input.offlineAuthorizationMaxAgeSeconds,
    p_offline_authorization_policy_version:
      input.offlineAuthorizationPolicyVersion,
    p_session_token_hash: input.sessionTokenHash,
    p_session_ttl_seconds: input.sessionTtlSeconds,
    p_shop_id: input.shopId,
    p_staff_id: input.staffId,
  });
  if (error || !isRecord(data)) {
    return {
      code: "db_failure",
      ok: false as const,
    };
  }
  const code = requiredString(data, "code");
  if (data.ok !== true) {
    return { code: code ?? "db_failure", ok: false as const };
  }
  const shopDeviceId = requiredString(data, "shopDeviceId");
  const credentialId = requiredString(data, "posDeviceCredentialId");
  const posSessionId = requiredString(data, "posSessionId");
  const sessionExpiresAt = requiredString(data, "sessionExpiresAt");
  const effectiveOfflineAuthorizationExpiresAt = requiredString(
    data,
    "effectiveOfflineAuthorizationExpiresAt",
  );
  const offlineAuthorizationPolicyVersion = requiredString(
    data,
    "offlineAuthorizationPolicyVersion",
  );
  const serverTime = requiredString(data, "serverTime");
  const returnedShopId = requiredString(data, "shopId");
  const returnedStaffId = requiredString(data, "staffId");
  const returnedDeviceIdentifier = requiredString(data, "deviceIdentifier");
  const returnedCredentialVersion = requiredInteger(data, "credentialVersion");
  const sessionExpiresAtMillis = timestampMillis(sessionExpiresAt);
  const offlineExpiresAtMillis = timestampMillis(
    effectiveOfflineAuthorizationExpiresAt,
  );
  const serverTimeMillis = timestampMillis(serverTime);
  return code === "success" &&
    shopDeviceId &&
    credentialId &&
    posSessionId &&
    UUID_PATTERN.test(shopDeviceId) &&
    UUID_PATTERN.test(credentialId) &&
    UUID_PATTERN.test(posSessionId) &&
    returnedShopId !== null &&
    sameUuid(returnedShopId, input.shopId) &&
    returnedStaffId !== null &&
    sameUuid(returnedStaffId, input.staffId) &&
    returnedDeviceIdentifier === input.deviceIdentifier &&
    returnedCredentialVersion === input.credentialVersion &&
    sessionExpiresAt &&
    sessionExpiresAtMillis !== null &&
    sessionExpiresAtMillis > Date.now() &&
    effectiveOfflineAuthorizationExpiresAt &&
    STRICT_UTC_FRACTIONAL_TIMESTAMP_PATTERN.test(
      effectiveOfflineAuthorizationExpiresAt,
    ) &&
    offlineExpiresAtMillis !== null &&
    serverTime &&
    STRICT_UTC_FRACTIONAL_TIMESTAMP_PATTERN.test(serverTime) &&
    serverTimeMillis !== null &&
    offlineExpiresAtMillis > serverTimeMillis &&
    offlineExpiresAtMillis <= sessionExpiresAtMillis &&
    offlineAuthorizationPolicyVersion ===
      input.offlineAuthorizationPolicyVersion
    ? {
        effectiveOfflineAuthorizationExpiresAt,
        ok: true as const,
        posSessionId,
        serverTime,
        sessionExpiresAt,
        shopDeviceId,
      }
    : { code: "db_failure", ok: false as const };
}

export async function markPosRuntimeSession(
  supabase: SupabaseAdminClient,
  input: {
    posSessionId: string;
    reason: string;
    status: "blocked" | "expired" | "revoked";
  },
) {
  const { data, error } = await supabase.rpc("pos_runtime_mark_session_v1", {
    p_pos_session_id: input.posSessionId,
    p_reason: input.reason,
    p_status: input.status,
  });
  return !error && data === true;
}

export async function touchPosHeartbeat(
  supabase: SupabaseAdminClient,
  input: {
    appVersion?: string;
    expiresAt: string;
    posSessionId: string;
    shopDeviceId: string;
    shopId: string;
    staffId: string;
  },
) {
  const { data, error } = await supabase.rpc("pos_runtime_heartbeat_touch_v1", {
    p_app_version: input.appVersion ?? "",
    p_expires_at: input.expiresAt,
    p_pos_session_id: input.posSessionId,
    p_shop_device_id: input.shopDeviceId,
    p_shop_id: input.shopId,
    p_staff_id: input.staffId,
  });
  return !error && isRecord(data) && data.ok === true;
}

export type PosRuntimeLeasePublicationResult =
  | { status: "ok" }
  | { status: "db_failure" }
  | { status: "denied" }
  | { status: "stale_catalog" };

export async function publishPosRuntimeLeaseSuccess(
  supabase: SupabaseAdminClient,
  input: {
    catalogPublication?: {
      expectedRevision: string;
      expectedScopeKey: string;
    };
    posSessionId: string;
    publicationKind: "catalog_pull" | "first_login" | "heartbeat";
    shopDeviceId: string;
    shopId: string;
    staffId: string;
  },
): Promise<PosRuntimeLeasePublicationResult> {
  if (
    !UUID_PATTERN.test(input.posSessionId) ||
    !UUID_PATTERN.test(input.shopDeviceId) ||
    !UUID_PATTERN.test(input.shopId) ||
    !UUID_PATTERN.test(input.staffId)
  ) {
    return { status: "db_failure" };
  }

  const catalogPublication = input.catalogPublication;
  if (
    (input.publicationKind === "catalog_pull" &&
      (!catalogPublication ||
        !POS_CATALOG_SCOPE_KEY_PATTERN.test(
          catalogPublication.expectedScopeKey,
        ) ||
        !POS_CATALOG_REVISION_PATTERN.test(
          catalogPublication.expectedRevision,
        ))) ||
    (input.publicationKind !== "catalog_pull" && catalogPublication)
  ) {
    return { status: "db_failure" };
  }

  const { data, error } = await supabase.rpc(
    "pos_runtime_lease_publish_success_v2",
    {
      p_expected_catalog_revision:
        catalogPublication?.expectedRevision ?? null,
      p_expected_catalog_scope_key:
        catalogPublication?.expectedScopeKey ?? null,
      p_pos_session_id: input.posSessionId,
      p_publication_kind: input.publicationKind,
      p_shop_device_id: input.shopDeviceId,
      p_shop_id: input.shopId,
      p_staff_id: input.staffId,
    },
  );

  if (error || !isRecord(data)) return { status: "db_failure" };
  if (data.status === "ok") return { status: "ok" };
  if (data.status === "denied") return { status: "denied" };
  if (data.status === "stale_catalog") return { status: "stale_catalog" };
  return { status: "db_failure" };
}

export async function writePosRuntimeAudit(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    eventKey: string;
    metadata?: Record<string, Json | undefined>;
    result: "blocked" | "failure" | "success";
    severity: "critical" | "info" | "warning";
    shopId?: string;
    staffId?: string;
    targetId?: string;
    targetType?: string;
  },
) {
  const { data, error } = await supabase.rpc("pos_runtime_audit_write_v1", {
    p_code: input.code,
    p_event_key: input.eventKey,
    p_metadata_redacted: (input.metadata ?? {}) as Json,
    p_result: input.result,
    p_severity: input.severity,
    p_shop_id: input.shopId ?? null,
    p_staff_id: input.staffId ?? null,
    p_target_id: input.targetId ?? null,
    p_target_type: input.targetType ?? null,
  });
  return !error && typeof data === "string" && UUID_PATTERN.test(data);
}
