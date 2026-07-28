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
  type PosPolicyPayload,
  type PosShopPayload,
} from "./shop-payload";
import {
  buildCatalogRevision,
  loadCatalogRevisionV2,
  normalizeCatalogRevision,
} from "./catalog-revision";
import { generatePosSecret, hashPosSecret, verifyPosSecret } from "./tokens";
import {
  commitPosFirstLogin,
  loadPosFirstLoginIdentity,
  loadPosRuntimeLease,
  markPosRuntimeSession,
  publishPosRuntimeLeaseSuccess,
  recordPosFirstLoginFailure,
  touchPosHeartbeat,
  writePosRuntimeAudit,
} from "./runtime-boundary";
import {
  POS_OFFLINE_AUTHORIZATION_MAX_AGE_SECONDS,
  POS_POLICY_CONTRACT_VERSION,
} from "./pos-contract";

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

type PosFailureCode =
  | "db_failure"
  | "denied"
  | "not_configured"
  | "offline_authorization_expired"
  | "offline_authorization_not_permitted"
  | "offline_authorization_persistence_failed"
  | "offline_authorization_policy_invalid"
  | "validation_failed";
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
  effectiveOfflineAuthorizationExpiresAt: string;
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
  catalogChangesAvailable?: boolean;
  catalogRevision?: string;
  catalogSyncStatus?: "integrity_blocked";
  code: "success";
  nextPollAfterSeconds?: number;
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
  catalogRevision: string | null;
  catalogRevisionPresent: boolean;
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
const CATALOG_POLL_AFTER_SECONDS = 30;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEVICE_TTL_SECONDS = 180 * 24 * 60 * 60;
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
        : code === "db_failure" ||
            code === "offline_authorization_persistence_failed" ||
            code === "offline_authorization_policy_invalid"
          ? "POS request failed."
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
  const catalogRevisionRaw = stringField(
    input,
    "catalogRevision",
    "catalog_revision",
  );
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
    catalogRevision: normalizeCatalogRevision(catalogRevisionRaw),
    catalogRevisionPresent: catalogRevisionRaw.length > 0,
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

  return writePosRuntimeAudit(supabase, {
    code: input.code,
    eventKey: input.eventKey,
    metadata,
    result: input.result,
    severity: input.severity,
    shopId: input.shopId,
    targetId: input.targetId,
    targetType: input.targetType,
  });
}

async function auditedDenied(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    eventKey: string;
    metadata?: JsonRecord;
    responseCode?: PosFailureCode;
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
    input.responseCode ??
      (input.status === 400
        ? "validation_failed"
        : input.status === 500
          ? "db_failure"
          : "denied"),
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

  const identity = await loadPosFirstLoginIdentity(supabase, {
    deviceIdentifier: parsed.deviceIdentifier,
    shopCode: parsed.shopCode,
    staffCode: parsed.staffCode,
  });

  if (identity.status === "db_failure") {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      status: 500,
    });
  }

  if (identity.status === "denied") {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.auth.first_login.failure",
      metadata: {
        ...requestMetadata(meta),
        shop_resolved: false,
      },
    });
  }

  const { device: existingDevice, shop, staff } = identity;

  if (shop.shop_status !== "active" || !staff || !isStaffUsable(staff) || !staff.credential_hash) {
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
    const failureRecorded = await recordPosFirstLoginFailure(supabase, {
      credentialVersion: staff.credential_version,
      shopId: shop.shop_id,
      staffId: staff.staff_id,
    });

    return auditedDenied(supabase, {
      code: failureRecorded ? "denied" : "db_failure",
      eventKey: "pos.auth.first_login.failure",
      metadata: requestMetadata(meta),
      shopId: shop.shop_id,
      status: failureRecorded ? 401 : 500,
      targetId: staff.staff_id,
      targetType: "staff",
    });
  }

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

  const trustedDeviceToken = generatePosSecret("device");
  const sessionToken = generatePosSecret("session");
  const committed = await commitPosFirstLogin(supabase, {
    appVersion: parsed.appVersion,
    credentialVersion: staff.credential_version,
    deviceDisplayName: parsed.displayName,
    deviceIdentifier: parsed.deviceIdentifier,
    deviceTokenHash: hashPosSecret(trustedDeviceToken),
    deviceTtlSeconds: DEVICE_TTL_SECONDS,
    metadata: {
      app_version_present: Boolean(parsed.appVersion),
      source: "TASK-144",
    },
    offlineAuthorizationMaxAgeSeconds:
      POS_OFFLINE_AUTHORIZATION_MAX_AGE_SECONDS,
    offlineAuthorizationPolicyVersion: POS_POLICY_CONTRACT_VERSION,
    sessionTokenHash: hashPosSecret(sessionToken),
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    shopId: shop.shop_id,
    staffId: staff.staff_id,
  });

  if (!committed.ok) {
    const responseCode: PosFailureCode =
      committed.code === "offline_authorization_not_permitted" ||
      committed.code === "offline_authorization_expired" ||
      committed.code === "offline_authorization_policy_invalid" ||
      committed.code === "offline_authorization_persistence_failed"
        ? committed.code
        : "offline_authorization_persistence_failed";
    const denied =
      responseCode === "offline_authorization_not_permitted" ||
      responseCode === "offline_authorization_expired";
    return auditedDenied(supabase, {
      code: responseCode,
      eventKey: "pos.auth.first_login.failure",
      metadata: {
        ...requestMetadata(meta),
        reason: responseCode,
      },
      responseCode,
      shopId: shop.shop_id,
      status: denied ? 401 : 500,
    });
  }

  const publication = await publishPosRuntimeLeaseSuccess(supabase, {
    posSessionId: committed.posSessionId,
    publicationKind: "first_login",
    shopDeviceId: committed.shopDeviceId,
    shopId: shop.shop_id,
    staffId: staff.staff_id,
  });

  if (publication.status !== "ok") {
    await markPosRuntimeSession(supabase, {
      posSessionId: committed.posSessionId,
      reason:
        publication.status === "denied"
          ? "lease_revoked_before_publication"
          : "publication_failed",
      status: "revoked",
    });

    return failure(
      publication.status === "denied" ? "denied" : "db_failure",
      publication.status === "denied" ? 401 : 500,
    );
  }

  return {
    body: {
      code: "success",
      device: {
        shopDeviceId: committed.shopDeviceId,
        status: "active",
        trusted: true,
      },
      effectiveOfflineAuthorizationExpiresAt:
        committed.effectiveOfflineAuthorizationExpiresAt,
      ok: true,
      policy: buildPosPolicyPayload(),
      serverTime: committed.serverTime,
      session: {
        expiresAt: committed.sessionExpiresAt,
        heartbeatAfterSeconds: HEARTBEAT_AFTER_SECONDS,
        posSessionId: committed.posSessionId,
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
  await markPosRuntimeSession(supabase, {
    posSessionId: session.pos_session_id,
    reason,
    status,
  });
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

  const lease = await loadPosRuntimeLease(supabase, {
    posSessionId: parsed.posSessionId,
    shopDeviceId: parsed.shopDeviceId,
  });

  if (lease.status === "db_failure") {
    return auditedDenied(supabase, {
      code: "db_failure",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
      status: 500,
    });
  }

  if (lease.status === "denied") {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.session.heartbeat.failure",
      metadata: requestMetadata(meta),
    });
  }

  const { credential, device, session, shop, staff } = lease;

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

  const deviceRevoked = device.status === "revoked" || credential.status === "revoked";

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

  const credentialExpired = !isFutureTimestamp(credential.expires_at);
  const credentialMatchesSession = Boolean(
    credential.pos_device_credential_id === session.pos_device_credential_id &&
      credential.shop_id === session.shop_id &&
      credential.shop_device_id === session.shop_device_id &&
      credential.staff_id === session.staff_id,
  );
  const deviceTokenValid = verifyPosSecret(parsed.deviceToken, credential.token_hash);
  const runtimeInvalid =
    !credentialMatchesSession ||
    shop.shop_status !== "active" ||
    device.status !== "active" ||
    credential.status !== "active" ||
    credentialExpired ||
    staff.status !== "active" ||
    staff.credential_status !== "active" ||
    staff.must_change_credential ||
    isFutureTimestamp(staff.locked_until) ||
    (staff.credential_expires_at !== null &&
      !isFutureTimestamp(staff.credential_expires_at)) ||
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
        device_resolved: true,
        shop_resolved: true,
        staff_resolved: true,
      },
      shopId: session.shop_id,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }

  const requestedExpiryMillis = Date.now() + SESSION_TTL_SECONDS * 1000;
  const credentialExpiryMillis = Date.parse(credential.expires_at);
  const staffExpiryMillis = staff.credential_expires_at
    ? Date.parse(staff.credential_expires_at)
    : Number.POSITIVE_INFINITY;
  const effectiveExpiryMillis = Math.min(
    requestedExpiryMillis,
    credentialExpiryMillis,
    staffExpiryMillis,
  );
  if (!Number.isFinite(effectiveExpiryMillis) || effectiveExpiryMillis <= Date.now()) {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.session.heartbeat.failure",
      metadata: {
        ...requestMetadata(meta),
        reason: "runtime_lease_expiry_unavailable",
      },
      shopId: session.shop_id,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }
  const expiresAt = new Date(effectiveExpiryMillis).toISOString();
  const heartbeatTouched = await touchPosHeartbeat(supabase, {
    appVersion: parsed.appVersion,
    expiresAt,
    posSessionId: session.pos_session_id,
    shopDeviceId: session.shop_device_id,
    shopId: session.shop_id,
    staffId: session.staff_id,
  });

  if (!heartbeatTouched) {
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

  // Catalog hints are optional by contract. A revision lookup failure must not
  // turn an otherwise valid authorization heartbeat into an outage.
  const revisionResult = await loadCatalogRevisionV2(
    supabase,
    session.shop_id,
    {
      posSessionId: session.pos_session_id,
      shopDeviceId: session.shop_device_id,
      staffId: session.staff_id,
    },
  );
  if (revisionResult.status === "denied") {
    return auditedDenied(supabase, {
      code: "denied",
      eventKey: "pos.session.heartbeat.failure",
      metadata: {
        ...requestMetadata(meta),
        reason: "runtime_lease_changed_after_touch",
      },
      shopId: session.shop_id,
      targetId: session.pos_session_id,
      targetType: "pos_session",
    });
  }
  const catalogRevision = revisionResult.status === "ok"
    ? buildCatalogRevision(session.shop_id, revisionResult)
    : null;
  const catalogChangesAvailable = catalogRevision
    ? parsed.catalogRevision !== catalogRevision
    : null;

  const successBody = {
    ...(catalogRevision && catalogChangesAvailable !== null
      ? {
          catalogChangesAvailable,
          catalogRevision,
          nextPollAfterSeconds: CATALOG_POLL_AFTER_SECONDS,
        }
      : {}),
    ...(revisionResult.status === "integrity_blocked"
      ? { catalogSyncStatus: "integrity_blocked" as const }
      : {}),
    code: "success" as const,
    ok: true as const,
    serverTime: nowIso(),
    session: {
      expiresAt,
      heartbeatAfterSeconds: HEARTBEAT_AFTER_SECONDS,
      posSessionId: session.pos_session_id,
    },
  };

  // This is the last await before a successful heartbeat can leave the
  // server.  It rechecks the canonical lease and writes the success audit in
  // the same transaction, so a revoked session cannot receive a fresh hint.
  const publication = await publishPosRuntimeLeaseSuccess(supabase, {
    posSessionId: session.pos_session_id,
    publicationKind: "heartbeat",
    shopDeviceId: session.shop_device_id,
    shopId: session.shop_id,
    staffId: session.staff_id,
  });
  if (publication.status === "denied") {
    return failure("denied", 401);
  }
  if (publication.status !== "ok") {
    return failure("db_failure", 500);
  }

  return { body: successBody, status: 200 };
}
