import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { verifyStaffCredential } from "@/server/shop-admin/staff-credentials";
import {
  buildPosPolicyPayload,
  buildPosShopPayload,
  type PosPolicyPayload,
  type PosShopPayload,
} from "./shop-payload";
import { generatePosSecret, hashPosSecret } from "./tokens";
import {
  commitPosFirstLogin,
  loadPosFirstLoginIdentity,
  markPosRuntimeSession,
  publishPosRuntimeLeaseSuccess,
  recordPosFirstLoginFailure,
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

export type PosFirstLoginEndpointResult =
  | {
      body: PosFailureBody;
      status: 400 | 401 | 500 | 503;
    }
  | {
      body: PosFirstLoginSuccessBody;
      status: 200;
    };

export type PosFirstLoginRequestMeta = {
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

const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const HEARTBEAT_AFTER_SECONDS = 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEVICE_TTL_SECONDS = 180 * 24 * 60 * 60;
const MAX_CREDENTIAL_LENGTH = 256;

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

function isFutureTimestamp(value: string | null) {
  return Boolean(value && Date.parse(value) > Date.now());
}

function failure(
  code: PosFailureCode,
  status: PosFailureStatus,
): PosFirstLoginEndpointResult {
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

function requestMetadata(meta: PosFirstLoginRequestMeta): JsonRecord {
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
): Promise<PosFirstLoginEndpointResult> {
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

export async function handlePosFirstLoginWithClient(
  supabase: SupabaseAdminClient | null,
  input: unknown,
  meta: PosFirstLoginRequestMeta = {},
): Promise<PosFirstLoginEndpointResult> {
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

  if (
    shop.shop_status !== "active" ||
    !staff ||
    !isStaffUsable(staff) ||
    !staff.credential_hash
  ) {
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

  if (
    existingDevice?.status === "revoked" ||
    existingDevice?.status === "suspicious"
  ) {
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
