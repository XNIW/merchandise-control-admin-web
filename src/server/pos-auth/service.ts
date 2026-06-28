import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { verifyStaffCredential } from "@/server/shop-admin/staff-credentials";
import {
  buildPosPolicyPayload,
  buildPosShopPayload,
  POS_SHOP_SELECT,
  type PosPolicyPayload,
  type PosShopPayload,
  type PosShopPayloadRow,
} from "./shop-payload";
import { generatePosSecret, hashPosSecret, verifyPosSecret } from "./tokens";

type ShopRow = PosShopPayloadRow;
type StaffAccountRow = Pick<
  Tables<"staff_accounts">,
  | "credential_hash"
  | "credential_status"
  | "credential_version"
  | "display_name"
  | "failed_attempts"
  | "locked_until"
  | "must_change_credential"
  | "role_key"
  | "session_invalidated_at"
  | "shop_id"
  | "staff_code"
  | "staff_id"
  | "status"
>;
type ShopDeviceRow = Pick<
  Tables<"shop_devices">,
  | "device_identifier"
  | "shop_device_id"
  | "shop_id"
  | "status"
>;
type PosDeviceCredentialRow = Pick<
  Tables<"pos_device_credentials">,
  | "expires_at"
  | "pos_device_credential_id"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
  | "token_hash"
>;
type PosSessionRow = Pick<
  Tables<"pos_sessions">,
  | "expires_at"
  | "heartbeat_count"
  | "issued_at"
  | "pos_device_credential_id"
  | "pos_session_id"
  | "session_token_hash"
  | "shop_device_id"
  | "shop_id"
  | "staff_credential_version"
  | "staff_id"
  | "status"
>;

type JsonRecord = { [key: string]: Json | undefined };

type PosFailureCode = "db_failure" | "denied" | "not_configured" | "validation_failed";
type PosFailureStatus = 400 | 401 | 500 | 503;

type PosFailureBody = {
  code: PosFailureCode;
  message: string;
  ok: false;
};

type PosFirstLoginSuccessBody = {
  code: "success";
  device: {
    shopDeviceId: string;
    status: "active";
    trusted: true;
  };
  ok: true;
  policy: PosPolicyPayload;
  serverTime: string;
  session: {
    expiresAt: string;
    heartbeatAfterSeconds: number;
    posSessionId: string;
    sessionToken: string;
  };
  shop: PosShopPayload;
  staff: {
    credentialVersion: number;
    displayName: string;
    roleKey: string;
    staffCode: string;
    staffId: string;
  };
  trustedDeviceToken: string;
};

type PosHeartbeatSuccessBody = {
  code: "success";
  ok: true;
  serverTime: string;
  session: {
    expiresAt: string;
    heartbeatAfterSeconds: number;
    posSessionId: string;
  };
};

export type PosEndpointResult =
  | {
      body: PosFailureBody;
      status: 400 | 401 | 500 | 503;
    }
  | {
      body: PosFirstLoginSuccessBody | PosHeartbeatSuccessBody;
      status: 200;
    };

export type PosRequestMeta = {
  clientRequestId?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

type ParsedFirstLoginInput = {
  appVersion?: string;
  credential: string;
  deviceIdentifier: string;
  displayName: string;
  staffCode: string;
  shopCode: string;
};

type ParsedHeartbeatInput = {
  appVersion?: string;
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
};

const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEARTBEAT_AFTER_SECONDS = 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEVICE_TTL_SECONDS = 180 * 24 * 60 * 60;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;
const MAX_CREDENTIAL_LENGTH = 256;
const MAX_POS_SECRET_LENGTH = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(record: Record<string, unknown>, ...keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function childRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return isRecord(value) ? value : {};
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeLabel(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function isFutureTimestamp(value: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function isAfterTimestamp(left: string | null, right: string) {
  return Boolean(left && Date.parse(left) > Date.parse(right));
}

function failure(code: PosFailureCode, status: PosFailureStatus): PosEndpointResult {
  const message =
    code === "not_configured"
      ? "POS backend is not configured."
      : code === "validation_failed"
        ? "Request payload is invalid."
        : "POS authentication was denied.";

  return {
    body: {
      code,
      message,
      ok: false,
    },
    status,
  };
}

function parseFirstLoginInput(input: unknown): ParsedFirstLoginInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const device = childRecord(input, "device");
  const shopCode = normalizeCode(stringField(input, "shopCode", "shop_code"));
  const staffCode = normalizeCode(stringField(input, "staffCode", "staff_code"));
  const credential = stringField(input, "credential", "pin", "password");
  const deviceIdentifier = normalizeLabel(
    stringField(device, "deviceIdentifier", "device_identifier", "fingerprint"),
    160,
  );
  const displayName =
    normalizeLabel(stringField(device, "displayName", "display_name"), 80) ||
    "POS device";
  const appVersion =
    normalizeLabel(stringField(device, "appVersion", "app_version"), 80) ||
    undefined;

  if (
    !SHOP_CODE_PATTERN.test(shopCode) ||
    !STAFF_CODE_PATTERN.test(staffCode) ||
    credential.length === 0 ||
    credential.length > MAX_CREDENTIAL_LENGTH ||
    deviceIdentifier.length === 0
  ) {
    return null;
  }

  return {
    appVersion,
    credential,
    deviceIdentifier,
    displayName,
    staffCode,
    shopCode,
  };
}

function parseHeartbeatInput(input: unknown): ParsedHeartbeatInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const appVersion =
    normalizeLabel(stringField(input, "appVersion", "app_version"), 80) ||
    undefined;
  const deviceToken = stringField(input, "deviceToken", "device_token");
  const posSessionId = stringField(input, "posSessionId", "pos_session_id");
  const sessionToken = stringField(input, "sessionToken", "session_token");
  const shopDeviceId = stringField(input, "shopDeviceId", "shop_device_id");

  if (
    !UUID_PATTERN.test(posSessionId) ||
    !UUID_PATTERN.test(shopDeviceId) ||
    deviceToken.length === 0 ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    sessionToken.length === 0 ||
    sessionToken.length > MAX_POS_SECRET_LENGTH
  ) {
    return null;
  }

  return {
    appVersion,
    deviceToken,
    posSessionId,
    sessionToken,
    shopDeviceId,
  };
}

function requestMetadata(meta: PosRequestMeta): JsonRecord {
  return {
    ...(meta.clientRequestId ? { client_request_id: meta.clientRequestId } : {}),
    ...(meta.requestId ? { request_id: meta.requestId } : {}),
    ...(meta.route ? { route: meta.route } : {}),
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

async function writePosAudit(
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
  const metadata: JsonRecord = {
    code: input.code,
    source: "TASK-021",
    ...(input.metadata ?? {}),
  };

  const { error } = await supabase.from("audit_logs").insert({
    actor_profile_id: null,
    event_key: input.eventKey,
    metadata_redacted: metadata,
    result: input.result,
    scope: input.shopId ? "shop" : "global",
    severity: input.severity,
    shop_id: input.shopId ?? null,
    target_id: input.targetId,
    target_type: input.targetType,
  });

  return !error;
}

async function auditedDenied(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    eventKey: string;
    metadata?: JsonRecord;
    shopId?: string;
    status?: 400 | 401 | 500;
    targetId?: string;
    targetType?: string;
  },
): Promise<PosEndpointResult> {
  const auditOk = await writePosAudit(supabase, {
    code: input.code,
    eventKey: input.eventKey,
    metadata: input.metadata,
    result: input.status === 500 ? "failure" : "blocked",
    severity: input.status === 500 ? "critical" : "warning",
    shopId: input.shopId,
    targetId: input.targetId,
    targetType: input.targetType,
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return failure(
    input.status === 400
      ? "validation_failed"
      : input.status === 500
        ? "db_failure"
        : "denied",
    input.status ?? 401,
  );
}

function isStaffLockoutActive(staff: StaffAccountRow) {
  return isFutureTimestamp(staff.locked_until);
}

function isStaffLockoutExpired(staff: StaffAccountRow) {
  return Boolean(staff.locked_until && !isStaffLockoutActive(staff));
}

function isStaffCredentialStatusUsable(staff: StaffAccountRow) {
  return (
    staff.credential_status === "active" ||
    (staff.credential_status === "locked" && isStaffLockoutExpired(staff))
  );
}

function isStaffUsable(staff: StaffAccountRow) {
  return (
    staff.status === "active" &&
    isStaffCredentialStatusUsable(staff) &&
    !staff.must_change_credential &&
    !isStaffLockoutActive(staff) &&
    Boolean(staff.credential_hash)
  );
}

async function updateFailedCredentialAttempt(
  supabase: SupabaseAdminClient,
  staff: StaffAccountRow,
) {
  const previousFailedAttempts = isStaffLockoutExpired(staff)
    ? 0
    : (staff.failed_attempts ?? 0);
  const failedAttempts = Math.min(previousFailedAttempts + 1, LOCKOUT_ATTEMPTS);
  const locked = failedAttempts >= LOCKOUT_ATTEMPTS;

  await supabase
    .from("staff_accounts")
    .update({
      credential_status: locked ? "locked" : "active",
      failed_attempts: failedAttempts,
      locked_until: locked ? addSeconds(LOCKOUT_SECONDS) : null,
      updated_at: nowIso(),
    })
    .eq("staff_id", staff.staff_id)
    .eq("shop_id", staff.shop_id);
}

async function clearSuccessfulCredentialAttempt(
  supabase: SupabaseAdminClient,
  staff: StaffAccountRow,
) {
  const { error } = await supabase
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

  return !error;
}

async function revokeActiveDeviceCredentials(
  supabase: SupabaseAdminClient,
  shopDeviceId: string,
) {
  const { error } = await supabase
    .from("pos_device_credentials")
    .update({
      revoked_at: nowIso(),
      revoked_reason: "rotated_by_first_login",
      status: "revoked",
      updated_at: nowIso(),
    })
    .eq("shop_device_id", shopDeviceId)
    .eq("status", "active")
    .is("revoked_at", null);

  return !error;
}

async function cleanupFailedFirstLogin(
  supabase: SupabaseAdminClient,
  input: {
    posDeviceCredentialId?: string;
    posSessionId?: string;
    reason: string;
  },
) {
  const timestamp = nowIso();

  if (input.posSessionId) {
    await supabase
      .from("pos_sessions")
      .update({
        revoked_at: timestamp,
        revoked_reason: input.reason,
        status: "revoked",
        updated_at: timestamp,
      })
      .eq("pos_session_id", input.posSessionId)
      .eq("status", "active");
  }

  if (input.posDeviceCredentialId) {
    await supabase
      .from("pos_device_credentials")
      .update({
        revoked_at: timestamp,
        revoked_reason: input.reason,
        status: "revoked",
        updated_at: timestamp,
      })
      .eq("pos_device_credential_id", input.posDeviceCredentialId)
      .eq("status", "active");
  }
}

async function getSupabaseForPos() {
  const config = resolveSupabaseAdminConfig();

  if (config.status !== "configured") {
    return null;
  }

  return createSupabaseAdminClient(config);
}

export async function handlePosFirstLogin(
  input: unknown,
  meta: PosRequestMeta = {},
): Promise<PosEndpointResult> {
  const supabase = await getSupabaseForPos();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const parsed = parseFirstLoginInput(input);

  if (!parsed) {
    return auditedDenied(supabase, {
      code: "validation_failed",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      status: 400,
    });
  }

  const shopResult = await supabase
    .from("shops")
    .select(POS_SHOP_SELECT)
    .eq("shop_code", parsed.shopCode)
    .maybeSingle<ShopRow>();

  if (shopResult.error) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      status: 500,
    });
  }

  const shop = shopResult.data;

  if (!shop || shop.shop_status !== "active") {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.auth.first_login.failure",
      metadata: {
        ...requestMetadata(meta),
        shop_resolved: Boolean(shop),
      },
      shopId: shop?.shop_id,
    });
  }

  const staffResult = await supabase
    .from("staff_accounts")
    .select(
      "staff_id,shop_id,staff_code,display_name,role_key,status,credential_hash,credential_version,credential_status,failed_attempts,locked_until,must_change_credential,session_invalidated_at",
    )
    .eq("shop_id", shop.shop_id)
    .eq("staff_code", parsed.staffCode)
    .maybeSingle<StaffAccountRow>();

  if (staffResult.error) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      status: 500,
    });
  }

  const staff = staffResult.data;

  if (!staff || !isStaffUsable(staff) || !staff.credential_hash) {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.auth.first_login.failure",
      metadata: {
        ...requestMetadata(meta),
        staff_resolved: Boolean(staff),
      },
      shopId: shop.shop_id,
      targetId: staff?.staff_id,
      targetType: staff ? "staff" : undefined,
    });
  }

  const credentialOk = await verifyStaffCredential(
    parsed.credential,
    staff.credential_hash,
  );

  if (!credentialOk) {
    await updateFailedCredentialAttempt(supabase, staff);

    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      targetId: staff.staff_id,
      targetType: "staff",
    });
  }

  const existingDeviceResult = await supabase
    .from("shop_devices")
    .select("shop_device_id,shop_id,device_identifier,status")
    .eq("shop_id", shop.shop_id)
    .eq("device_identifier", parsed.deviceIdentifier)
    .maybeSingle<ShopDeviceRow>();

  if (existingDeviceResult.error) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      status: 500,
    });
  }

  const existingDevice = existingDeviceResult.data;

  if (existingDevice?.status === "revoked" || existingDevice?.status === "suspicious") {
    const auditOk = await writePosAudit(supabase, {
      code: "device_not_valid",
      eventKey: "pos.device.revoked_enforced",
      metadata: requestMetadata(meta),
      result: "blocked",
      severity: "warning",
      shopId: shop.shop_id,
      targetId: existingDevice.shop_device_id,
      targetType: "device",
    });

    if (!auditOk) {
      return failure("db_failure", 500);
    }

    return failure("denied", 401);
  }

  const deviceResult = existingDevice
    ? await supabase
        .from("shop_devices")
        .update({
          app_version: parsed.appVersion,
          device_type: "pos",
          display_name: parsed.displayName,
          last_seen_at: nowIso(),
          last_seen_principal_kind: "pos_staff",
          last_seen_profile_id: null,
          last_seen_staff_id: staff.staff_id,
          status: "active",
          updated_at: nowIso(),
        })
        .eq("shop_device_id", existingDevice.shop_device_id)
        .eq("shop_id", shop.shop_id)
        .select("shop_device_id,shop_id,device_identifier,status")
        .maybeSingle<ShopDeviceRow>()
    : await supabase
        .from("shop_devices")
        .insert({
          app_version: parsed.appVersion,
          device_identifier: parsed.deviceIdentifier,
          device_type: "pos",
          display_name: parsed.displayName,
          last_seen_at: nowIso(),
          last_seen_principal_kind: "pos_staff",
          last_seen_staff_id: staff.staff_id,
          metadata_redacted: {
            app_version_present: Boolean(parsed.appVersion),
            source: "TASK-021",
          },
          shop_id: shop.shop_id,
          status: "active",
        })
        .select("shop_device_id,shop_id,device_identifier,status")
        .maybeSingle<ShopDeviceRow>();

  if (deviceResult.error || !deviceResult.data) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      status: 500,
    });
  }

  const device = deviceResult.data;
  const credentialAttemptClearOk = await clearSuccessfulCredentialAttempt(
    supabase,
    staff,
  );
  const priorDeviceCredentialsRevokedOk = await revokeActiveDeviceCredentials(
    supabase,
    device.shop_device_id,
  );

  if (!credentialAttemptClearOk || !priorDeviceCredentialsRevokedOk) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: {
        ...requestMetadata(meta),
        credential_attempt_clear_ok: credentialAttemptClearOk,
        prior_device_credentials_revoked_ok: priorDeviceCredentialsRevokedOk,
      },
      shopId: shop.shop_id,
      status: 500,
      targetId: device.shop_device_id,
      targetType: "device",
    });
  }

  const trustedDeviceToken = generatePosSecret("device");
  const sessionToken = generatePosSecret("session");
  const deviceCredentialResult = await supabase
    .from("pos_device_credentials")
    .insert({
      expires_at: addSeconds(DEVICE_TTL_SECONDS),
      last_used_at: nowIso(),
      metadata_redacted: {
        app_version_present: Boolean(parsed.appVersion),
        source: "TASK-021",
      },
      shop_device_id: device.shop_device_id,
      shop_id: shop.shop_id,
      staff_credential_version: staff.credential_version,
      staff_id: staff.staff_id,
      status: "active",
      token_hash: hashPosSecret(trustedDeviceToken),
    })
    .select("pos_device_credential_id")
    .maybeSingle<Pick<PosDeviceCredentialRow, "pos_device_credential_id">>();

  if (deviceCredentialResult.error || !deviceCredentialResult.data) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      status: 500,
      targetId: device.shop_device_id,
      targetType: "device",
    });
  }

  const sessionExpiresAt = addSeconds(SESSION_TTL_SECONDS);
  const sessionResult = await supabase
    .from("pos_sessions")
    .insert({
      expires_at: sessionExpiresAt,
      last_seen_at: nowIso(),
      metadata_redacted: {
        app_version_present: Boolean(parsed.appVersion),
        source: "TASK-021",
      },
      pos_device_credential_id:
        deviceCredentialResult.data.pos_device_credential_id,
      session_token_hash: hashPosSecret(sessionToken),
      shop_device_id: device.shop_device_id,
      shop_id: shop.shop_id,
      staff_credential_version: staff.credential_version,
      staff_id: staff.staff_id,
      status: "active",
    })
    .select("pos_session_id,expires_at")
    .maybeSingle<Pick<PosSessionRow, "expires_at" | "pos_session_id">>();

  if (sessionResult.error || !sessionResult.data) {
    await cleanupFailedFirstLogin(supabase, {
      posDeviceCredentialId:
        deviceCredentialResult.data.pos_device_credential_id,
      reason: "session_create_failed",
    });

    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      status: 500,
      targetId: device.shop_device_id,
      targetType: "device",
    });
  }

  const trustedAuditOk = await writePosAudit(supabase, {
    code: "success",
    eventKey: "pos.device.trusted",
    metadata: {
      app_version_present: Boolean(parsed.appVersion),
      device_type: "pos",
      ...requestMetadata(meta),
    },
    result: "success",
    severity: "info",
    shopId: shop.shop_id,
    targetId: device.shop_device_id,
    targetType: "device",
  });

  const firstLoginAuditOk = await writePosAudit(supabase, {
    code: "success",
    eventKey: "pos.auth.first_login.success",
    metadata: {
      credential_version: staff.credential_version,
      device_type: "pos",
      ...requestMetadata(meta),
    },
    result: "success",
    severity: "info",
    shopId: shop.shop_id,
    targetId: staff.staff_id,
    targetType: "staff",
  });

  if (!trustedAuditOk || !firstLoginAuditOk) {
    await cleanupFailedFirstLogin(supabase, {
      posDeviceCredentialId:
        deviceCredentialResult.data.pos_device_credential_id,
      posSessionId: sessionResult.data.pos_session_id,
      reason: "audit_failed",
    });

    return failure("db_failure", 500);
  }

  return {
    body: {
      code: "success",
      device: {
        shopDeviceId: device.shop_device_id,
        status: "active",
        trusted: true,
      },
      ok: true,
      policy: buildPosPolicyPayload(),
      serverTime: nowIso(),
      session: {
        expiresAt: sessionResult.data.expires_at,
        heartbeatAfterSeconds: HEARTBEAT_AFTER_SECONDS,
        posSessionId: sessionResult.data.pos_session_id,
        sessionToken,
      },
      shop: {
        ...buildPosShopPayload(shop),
      },
      staff: {
        credentialVersion: staff.credential_version,
        displayName: staff.display_name,
        roleKey: staff.role_key,
        staffCode: staff.staff_code,
        staffId: staff.staff_id,
      },
      trustedDeviceToken,
    },
    status: 200,
  };
}

async function markSessionDenied(
  supabase: SupabaseAdminClient,
  session: PosSessionRow,
  status: "blocked" | "expired" | "revoked",
  reason: string,
) {
  await supabase
    .from("pos_sessions")
    .update({
      revoked_at: status === "revoked" ? nowIso() : null,
      revoked_reason: reason,
      status,
      updated_at: nowIso(),
    })
    .eq("pos_session_id", session.pos_session_id);
}

export async function handlePosHeartbeat(
  input: unknown,
  meta: PosRequestMeta = {},
): Promise<PosEndpointResult> {
  const supabase = await getSupabaseForPos();

  if (!supabase) {
    return failure("not_configured", 503);
  }

  const parsed = parseHeartbeatInput(input);

  if (!parsed) {
    return auditedDenied(supabase, {
      code: "validation_failed",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
      status: 400,
    });
  }

  const sessionResult = await supabase
    .from("pos_sessions")
    .select(
      "pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,status,issued_at,expires_at,heartbeat_count",
    )
    .eq("pos_session_id", parsed.posSessionId)
    .eq("shop_device_id", parsed.shopDeviceId)
    .maybeSingle<PosSessionRow>();

  if (sessionResult.error) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
      status: 500,
    });
  }

  const session = sessionResult.data;

  if (!session) {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
    });
  }

  const sessionExpired = !isFutureTimestamp(session.expires_at);
  const sessionTokenValid = verifyPosSecret(
    parsed.sessionToken,
    session.session_token_hash,
  );

  if (session.status !== "active" || sessionExpired || !sessionTokenValid) {
    if (sessionExpired) {
      await markSessionDenied(supabase, session, "expired", "session_expired");
    }

    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const [credentialResult, shopResult, staffResult, deviceResult] =
    await Promise.all([
      supabase
        .from("pos_device_credentials")
        .select(
          "pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,status,expires_at",
        )
        .eq("pos_device_credential_id", session.pos_device_credential_id)
        .maybeSingle<PosDeviceCredentialRow>(),
      supabase
        .from("shops")
        .select(POS_SHOP_SELECT)
        .eq("shop_id", session.shop_id)
        .maybeSingle<ShopRow>(),
      supabase
        .from("staff_accounts")
        .select(
          "staff_id,shop_id,staff_code,display_name,role_key,status,credential_hash,credential_version,credential_status,failed_attempts,locked_until,must_change_credential,session_invalidated_at",
        )
        .eq("staff_id", session.staff_id)
        .eq("shop_id", session.shop_id)
        .maybeSingle<StaffAccountRow>(),
      supabase
        .from("shop_devices")
        .select("shop_device_id,shop_id,device_identifier,status")
        .eq("shop_device_id", session.shop_device_id)
        .eq("shop_id", session.shop_id)
        .maybeSingle<ShopDeviceRow>(),
    ]);

  if (
    credentialResult.error ||
    shopResult.error ||
    staffResult.error ||
    deviceResult.error
  ) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const credential = credentialResult.data;
  const shop = shopResult.data;
  const staff = staffResult.data;
  const device = deviceResult.data;
  const deviceRevoked = device?.status === "revoked" || credential?.status === "revoked";

  if (deviceRevoked) {
    await markSessionDenied(
      supabase,
      session,
      "revoked",
      "device_revoked_enforced",
    );
    const auditOk = await writePosAudit(supabase, {
      code: "device_revoked",
      eventKey: "pos.device.revoked_enforced",
      metadata: requestMetadata(meta),
      result: "blocked",
      severity: "warning",
      shopId: session.shop_id,
      targetId: session.shop_device_id,
      targetType: "device",
    });

    if (!auditOk) {
      return failure("db_failure", 500);
    }

    return failure("denied", 401);
  }

  const credentialExpired = Boolean(
    credential && !isFutureTimestamp(credential.expires_at),
  );
  const credentialMatchesSession = Boolean(
    credential &&
      credential.pos_device_credential_id === session.pos_device_credential_id &&
      credential.shop_id === session.shop_id &&
      credential.shop_device_id === session.shop_device_id &&
      credential.staff_id === session.staff_id,
  );
  const deviceTokenValid = credential
    ? verifyPosSecret(parsed.deviceToken, credential.token_hash)
    : false;
  const runtimeInvalid =
    !credential ||
    !credentialMatchesSession ||
    shop?.shop_status !== "active" ||
    !staff ||
    device?.status !== "active" ||
    credential.status !== "active" ||
    credentialExpired ||
    !isStaffUsable(staff) ||
    staff.credential_version !== credential.staff_credential_version ||
    session.staff_credential_version !== staff.credential_version ||
    isAfterTimestamp(staff.session_invalidated_at, session.issued_at);
  const valid = !runtimeInvalid && deviceTokenValid;

  if (!valid) {
    if (runtimeInvalid) {
      await markSessionDenied(
        supabase,
        session,
        credentialExpired ? "expired" : "blocked",
        credentialExpired ? "device_credential_expired" : "runtime_not_valid",
      );
    }

    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.session.heartbeat.failure",
      metadata: {
        ...requestMetadata(meta),
        device_resolved: Boolean(device),
        shop_resolved: Boolean(shop),
        staff_resolved: Boolean(staff),
      },
      shopId: session.shop_id,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const expiresAt = addSeconds(SESSION_TTL_SECONDS);
  const seenAt = nowIso();

  const [sessionUpdate, credentialUpdate, deviceUpdate] = await Promise.all([
    supabase
      .from("pos_sessions")
      .update({
        expires_at: expiresAt,
        heartbeat_count: session.heartbeat_count + 1,
        last_seen_at: seenAt,
        updated_at: seenAt,
      })
      .eq("pos_session_id", session.pos_session_id),
    supabase
      .from("pos_device_credentials")
      .update({
        last_used_at: seenAt,
        updated_at: seenAt,
      })
      .eq("pos_device_credential_id", credential.pos_device_credential_id),
    supabase
      .from("shop_devices")
      .update({
        app_version: parsed.appVersion,
        last_seen_at: seenAt,
        last_seen_principal_kind: "pos_staff",
        last_seen_profile_id: null,
        last_seen_staff_id: session.staff_id,
        updated_at: seenAt,
      })
      .eq("shop_device_id", session.shop_device_id)
      .eq("shop_id", session.shop_id),
  ]);

  if (sessionUpdate.error || credentialUpdate.error || deviceUpdate.error) {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
      shopId: session.shop_id,
      status: 500,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const auditOk = await writePosAudit(supabase, {
    code: "success",
    eventKey: "pos.session.heartbeat.success",
    metadata: {
      ...requestMetadata(meta),
      heartbeat_count: session.heartbeat_count + 1,
    },
    result: "success",
    severity: "info",
    shopId: session.shop_id,
    targetId: session.pos_session_id,
    targetType: "pos_session",
  });

  if (!auditOk) {
    return failure("db_failure", 500);
  }

  return {
    body: {
      code: "success",
      ok: true,
      serverTime: nowIso(),
      session: {
        expiresAt,
        heartbeatAfterSeconds: HEARTBEAT_AFTER_SECONDS,
        posSessionId: session.pos_session_id,
      },
    },
    status: 200,
  };
}
