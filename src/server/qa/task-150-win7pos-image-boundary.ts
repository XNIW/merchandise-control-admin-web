import "server-only";

import {
  createHmac,
  randomBytes,
} from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadPosRuntimeLease } from "@/server/pos-auth/runtime-boundary";
import { createPosRuntimeRpcClient } from "@/server/pos-auth/runtime-rpc-client";
import { verifyPosSecret } from "@/server/pos-auth/tokens";
import { hashStaffCredential } from "@/server/shop-admin/staff-credentials";

const FIXTURE_TEMPLATE = "asus-product-image-phase-b-fixture-v1";
const STAGING_SUPABASE_ORIGIN = "https://jpgoimipbothfgkokyvm.supabase.co";
const RUN_MARKER = /^ASUSPIB_[A-F0-9]{32}$/;
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,79}$/;
const CAPABILITY = /^task150_(provision|cleanup|result)_[A-Za-z0-9_-]{43}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const MAX_BODY_BYTES = 16 * 1024;

type UnknownRecord = Record<string, unknown>;
type BoundaryAction =
  | "begin"
  | "cleanup"
  | "prearm"
  | "provision"
  | "result"
  | "result_issue"
  | "rotation_ack"
  | "rotation_prepare";

const TRUSTED_ENVELOPE_KEYS = [
  "appVersion",
  "deviceToken",
  "posSessionId",
  "sessionToken",
  "shopDeviceId",
  "shopId",
  "staffCredentialVersion",
  "staffId",
] as const;

type CommonTrustedEnvelope = {
  appVersion: string;
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
  shopId: string;
  staffCredentialVersion: number;
  staffId: string;
};

type TrustedBootstrap = {
  shopId: string;
  staffId: string;
};

type RpcResult = {
  data: unknown;
  error: { code?: string } | null;
};

export type Task150BoundaryResult = {
  body: Record<string, unknown>;
  status: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value: UnknownRecord, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function safeResult(
  status: number,
  code: string,
  extras: Record<string, unknown> = {},
): Task150BoundaryResult {
  return {
    body: {
      ok: status >= 200 && status < 300,
      code,
      ...extras,
    },
    status,
  };
}

function safeRpcFailure(data: unknown, fallback = "boundary_unavailable") {
  const code = isRecord(data) && typeof data.code === "string" ? data.code : fallback;
  const allowed = new Set([
    "binding_conflict",
    "actor_run_active",
    "begin_expired",
    "bootstrap_actor_denied",
    "capability_consumed",
    "capability_denied",
    "capability_expired",
    "cleanup_capability_coverage_insufficient",
    "cleanup_fence_active",
    "cleanup_fence_lost",
    "cleanup_invariant_blocked",
    "cleanup_in_progress",
    "fixture_scope_conflict",
    "provision_in_progress",
    "rate_limited",
    "request_conflict",
    "rotation_pending",
    "rotation_target_unreachable",
    "storage_cleanup_incomplete",
    "validation_failed",
  ]);
  const safeCode = allowed.has(code) ? code : fallback;
  const status =
    safeCode === "capability_denied" || safeCode === "bootstrap_actor_denied"
      ? 403
      : safeCode === "cleanup_fence_active" ||
          safeCode === "cleanup_in_progress" ||
          safeCode === "provision_in_progress" ||
          safeCode === "request_conflict" ||
          safeCode === "binding_conflict" ||
          safeCode === "begin_expired" ||
          safeCode === "fixture_scope_conflict" ||
          safeCode === "capability_consumed" ||
          safeCode === "capability_expired" ||
          safeCode === "cleanup_capability_coverage_insufficient"
          || safeCode === "actor_run_active"
          || safeCode === "rotation_pending"
          || safeCode === "rotation_target_unreachable"
        ? 409
        : safeCode === "rate_limited"
          ? 429
        : safeCode === "validation_failed"
          ? 400
          : 503;
  const extras: Record<string, unknown> = {};
    if (
      isRecord(data) &&
      (safeCode === "cleanup_fence_active" ||
        safeCode === "provision_in_progress" ||
        safeCode === "rate_limited") &&
    typeof data.retryAfterAt === "string" &&
    CANONICAL_TIMESTAMP.test(data.retryAfterAt)
    ) {
      extras.retryAfterAt = data.retryAfterAt;
    }
    if (
      isRecord(data) &&
      safeCode === "cleanup_capability_coverage_insufficient" &&
      typeof data.requiredCoverageUntil === "string" &&
      CANONICAL_TIMESTAMP.test(data.requiredCoverageUntil)
    ) {
      extras.requiredCoverageUntil = data.requiredCoverageUntil;
    }
    return safeResult(status, safeCode, extras);
}

function hmacKey() {
  const raw = process.env.TASK150_QA_HMAC_KEY?.trim() ?? "";
  if (Buffer.byteLength(raw, "utf8") < 32) return null;
  return raw;
}

function hmac(key: string, domain: string, value: string) {
  return createHmac("sha256", key)
    .update("task-150-win7pos-image-qa-v1\0", "utf8")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function capability(
  key: string,
  kind: "cleanup" | "provision" | "result",
  scope: string,
) {
  const value = createHmac("sha256", key)
    .update("task-150-win7pos-image-qa-capability-v1\0", "utf8")
    .update(kind, "utf8")
    .update("\0", "utf8")
    .update(scope, "utf8")
    .digest("base64url");
  return `task150_${kind}_${value}`;
}

function requestHash(key: string, action: BoundaryAction, values: readonly string[]) {
  return hmac(key, `request:${action}`, values.join("\0"));
}

function parseCommonTrustedEnvelope(value: UnknownRecord): CommonTrustedEnvelope | null {
  const stringKeys = [
    "appVersion",
    "deviceToken",
    "posSessionId",
    "sessionToken",
    "shopDeviceId",
    "shopId",
    "staffId",
  ] as const;
  if (
    stringKeys.some((key) => typeof value[key] !== "string") ||
    !Number.isSafeInteger(value.staffCredentialVersion) ||
    (value.staffCredentialVersion as number) < 1 ||
    !UUID.test(value.posSessionId as string) ||
    !UUID.test(value.shopDeviceId as string) ||
    !UUID.test(value.shopId as string) ||
    !UUID.test(value.staffId as string)
  ) {
    return null;
  }
  return value as unknown as CommonTrustedEnvelope;
}

async function authorizeBootstrap(
  envelope: CommonTrustedEnvelope,
): Promise<TrustedBootstrap | null> {
  const rpcClient = createPosRuntimeRpcClient();
  if (!rpcClient) return null;
  const lease = await loadPosRuntimeLease(rpcClient, {
    posSessionId: envelope.posSessionId,
    shopDeviceId: envelope.shopDeviceId,
  });
  if (lease.status !== "ok") return null;
  const identityMatches =
    lease.shop.shop_id.toLowerCase() === envelope.shopId.toLowerCase() &&
    lease.device.shop_device_id.toLowerCase() === envelope.shopDeviceId.toLowerCase() &&
    lease.session.pos_session_id.toLowerCase() === envelope.posSessionId.toLowerCase() &&
    lease.staff.staff_id.toLowerCase() === envelope.staffId.toLowerCase() &&
    lease.session.staff_credential_version === envelope.staffCredentialVersion &&
    lease.credential.staff_credential_version === envelope.staffCredentialVersion &&
    lease.staff.credential_version === envelope.staffCredentialVersion;
  if (
    !identityMatches ||
    !verifyPosSecret(envelope.deviceToken, lease.credential.token_hash) ||
    !verifyPosSecret(envelope.sessionToken, lease.session.session_token_hash)
  ) {
    return null;
  }
  const result = await (rpcClient as unknown as {
    rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  }).rpc("pos_product_image_authorize_v1", {
    p_expected_staff_credential_version: envelope.staffCredentialVersion,
    p_permission: "catalog.write",
    p_pos_session_id: envelope.posSessionId,
    p_shop_device_id: envelope.shopDeviceId,
    p_shop_id: envelope.shopId,
    p_staff_id: envelope.staffId,
  });
  if (
    result.error ||
    !isRecord(result.data) ||
    result.data.ok !== true ||
    result.data.code !== "authorized"
  ) {
    return null;
  }
  return { shopId: envelope.shopId, staffId: envelope.staffId };
}

async function rpc(
  admin: SupabaseAdminClient,
  name: string,
  args: Record<string, unknown>,
) {
  return (admin as unknown as {
    rpc(functionName: string, parameters: Record<string, unknown>): Promise<RpcResult>;
  }).rpc(name, args);
}

function validSuccess(data: unknown, code: string) {
  return isRecord(data) && data.ok === true && data.code === code;
}

function parseCapabilityBody(
  value: UnknownRecord,
  action: "cleanup" | "provision" | "result",
  capabilityKey: "cleanupCapability" | "provisionCapability" | "resultCapability",
) {
  if (
    !exactKeys(value, [
      "action",
      capabilityKey,
      "manifestHmac",
      "requestId",
      "runHmac",
    ]) ||
    value.action !== action ||
    typeof value[capabilityKey] !== "string" ||
    !CAPABILITY.test(value[capabilityKey] as string) ||
    typeof value.runHmac !== "string" ||
    !LOWER_HEX_64.test(value.runHmac) ||
    typeof value.manifestHmac !== "string" ||
    !LOWER_HEX_64.test(value.manifestHmac) ||
    typeof value.requestId !== "string" ||
    !REQUEST_ID.test(value.requestId)
  ) {
    return null;
  }
  return value as Record<string, string>;
}

function parseTrustedRunAction(
  value: UnknownRecord,
  action: "prearm" | "result_issue" | "rotation_ack" | "rotation_prepare",
  actionKeys: readonly string[],
) {
  if (
    !exactKeys(value, [
      "action",
      "manifestHmac",
      "requestId",
      "runHmac",
      ...TRUSTED_ENVELOPE_KEYS,
      ...actionKeys,
    ]) ||
    value.action !== action ||
    typeof value.runHmac !== "string" ||
    !LOWER_HEX_64.test(value.runHmac) ||
    typeof value.manifestHmac !== "string" ||
    !LOWER_HEX_64.test(value.manifestHmac) ||
    typeof value.requestId !== "string" ||
    !REQUEST_ID.test(value.requestId)
  ) {
    return null;
  }
  const envelope = parseCommonTrustedEnvelope(value);
  return envelope ? { envelope, value } : null;
}

async function beginBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const beginKeys = [
    "action",
    "appVersion",
    "deviceToken",
    "posSessionId",
    "requestId",
    "runMarker",
    "sessionToken",
    "shopDeviceId",
    "shopId",
    "staffCredentialVersion",
    "staffId",
    "template",
  ] as const;
  if (
    !exactKeys(body, beginKeys) ||
    body.action !== "begin" ||
    body.template !== FIXTURE_TEMPLATE ||
    typeof body.requestId !== "string" ||
    !REQUEST_ID.test(body.requestId) ||
    typeof body.runMarker !== "string" ||
    !RUN_MARKER.test(body.runMarker)
  ) {
    return safeResult(400, "validation_failed");
  }
  const envelope = parseCommonTrustedEnvelope(body);
  if (!envelope) return safeResult(400, "validation_failed");
  const bootstrap = await authorizeBootstrap(envelope);
  if (!bootstrap) return safeResult(403, "bootstrap_actor_denied");

  const runHmac = hmac(key, "run", body.runMarker);
  const actorHmac = hmac(
    key,
    "bootstrap-actor",
    `${bootstrap.shopId.toLowerCase()}\0${bootstrap.staffId.toLowerCase()}`,
  );
  const beginHash = requestHash(key, "begin", [
    body.requestId,
    runHmac,
    FIXTURE_TEMPLATE,
    actorHmac,
  ]);
  const manifestHmac = hmac(key, "manifest", `${runHmac}\0${beginHash}`);
  const capabilityScope = `${runHmac}\0${beginHash}`;
  const provisionCapability = capability(key, "provision", capabilityScope);
  const cleanupCapability = capability(key, "cleanup", capabilityScope);
  const resultCapability = capability(key, "result", capabilityScope);
  const result = await rpc(admin, "task_150_win7pos_image_qa_begin_v1", {
    p_begin_request_hash: beginHash,
    p_bootstrap_actor_hmac: actorHmac,
    p_bootstrap_source_shop_id: bootstrap.shopId,
    p_bootstrap_staff_id: bootstrap.staffId,
    p_cleanup_capability_digest: hmac(key, "capability:cleanup", cleanupCapability),
    p_fixture_template: FIXTURE_TEMPLATE,
    p_manifest_hmac: manifestHmac,
    p_provision_capability_digest: hmac(key, "capability:provision", provisionCapability),
    p_result_capability_digest: hmac(key, "capability:result", resultCapability),
    p_run_hmac: runHmac,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  if (result.data.ok !== true) return safeRpcFailure(result.data);
  if (result.data.code !== "armed" && result.data.code !== "begin_replayed") {
    return safeResult(503, "boundary_contract_invalid");
  }
  return safeResult(200, result.data.code as string, {
    capabilitiesReissued: result.data.code === "begin_replayed",
    cleanupCapability,
    manifestHmac,
    provisionCapability,
    resultCapability,
    runHmac,
    template: FIXTURE_TEMPLATE,
  });
}

async function provisionBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
  baseUrl: string,
) {
  const parsed = parseCapabilityBody(body, "provision", "provisionCapability");
  if (!parsed) return safeResult(400, "validation_failed");
  const provisionHash = requestHash(key, "provision", [
    parsed.requestId,
    parsed.runHmac,
    parsed.manifestHmac,
    FIXTURE_TEMPLATE,
  ]);
  const provisionCapabilityDigest = hmac(
    key,
    "capability:provision",
    parsed.provisionCapability,
  );
  const admissionDigest = hmac(
    key,
    "provision-admission",
    `${parsed.runHmac}\0${provisionHash}`,
  );
  const admitted = await rpc(admin, "task_150_win7pos_image_qa_provision_admit_v1", {
    p_admission_digest: admissionDigest,
    p_manifest_hmac: parsed.manifestHmac,
    p_provision_capability_digest: provisionCapabilityDigest,
    p_request_hash: provisionHash,
    p_run_hmac: parsed.runHmac,
  });
  if (admitted.error || !isRecord(admitted.data)) {
    return safeResult(503, "boundary_unavailable");
  }
  if (validSuccess(admitted.data, "provision_replayed")) {
    return safeResult(200, "provision_replayed", {
      credentialsReissued: false,
      manifestHmac: parsed.manifestHmac,
      runHmac: parsed.runHmac,
    });
  }
  if (!validSuccess(admitted.data, "provision_admitted")) {
    return safeRpcFailure(admitted.data);
  }
  const credential = `Task150-POS-${randomBytes(24).toString("base64url")}`;
  const credentialHash = await hashStaffCredential(credential);
  const result = await rpc(admin, "task_150_win7pos_image_qa_provision_v1", {
    p_admission_digest: admissionDigest,
    p_credential_hash: credentialHash,
    p_manifest_hmac: parsed.manifestHmac,
    p_provision_capability_digest: provisionCapabilityDigest,
    p_request_hash: provisionHash,
    p_run_hmac: parsed.runHmac,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  const data = result.data;
  if (!validSuccess(data, "provisioned")) {
    if (validSuccess(data, "provision_replayed")) {
      return safeResult(200, "provision_replayed", {
        credentialsReissued: false,
        manifestHmac: parsed.manifestHmac,
        runHmac: parsed.runHmac,
      });
    }
    return safeRpcFailure(data);
  }
  const required = ["shopId", "staffId", "productId", "shopCode", "staffCode", "deviceIdentifier"];
  if (required.some((field) => typeof data[field] !== "string")) {
    return safeResult(503, "boundary_contract_invalid");
  }
  return safeResult(200, "provisioned", {
    bootstrapEnvelope: {
      baseUrl,
      deviceIdentifier: data.deviceIdentifier,
      shopCode: data.shopCode,
      staffCode: data.staffCode,
      staffCredential: credential,
    },
    credentialsReissued: true,
    manifestHmac: parsed.manifestHmac,
    productId: data.productId,
    runHmac: parsed.runHmac,
    shopId: data.shopId,
    staffId: data.staffId,
  });
}

async function prearmBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const parsed = parseTrustedRunAction(body, "prearm", [
    "authoritativeFenceUntil",
    "cleanupCapability",
  ]);
  if (!parsed) return safeResult(400, "validation_failed");
  if (
    typeof parsed.value.cleanupCapability !== "string" ||
    !CAPABILITY.test(parsed.value.cleanupCapability) ||
    typeof parsed.value.authoritativeFenceUntil !== "string" ||
    !CANONICAL_TIMESTAMP.test(parsed.value.authoritativeFenceUntil) ||
    !Number.isFinite(Date.parse(parsed.value.authoritativeFenceUntil))
  ) {
    return safeResult(400, "validation_failed");
  }
  const actor = await authorizeBootstrap(parsed.envelope);
  if (!actor) return safeResult(403, "bootstrap_actor_denied");
  const actorHmac = hmac(
    key,
    "bootstrap-actor",
    `${actor.shopId.toLowerCase()}\0${actor.staffId.toLowerCase()}`,
  );
  const prearmHash = requestHash(key, "prearm", [
    parsed.value.requestId as string,
    parsed.value.runHmac as string,
    parsed.value.manifestHmac as string,
    parsed.value.authoritativeFenceUntil as string,
  ]);
  const result = await rpc(admin, "task_150_win7pos_image_qa_prearm_v1", {
    p_actor_hmac: actorHmac,
    p_actor_shop_id: actor.shopId,
    p_actor_staff_id: actor.staffId,
    p_cleanup_capability_digest: hmac(
      key,
      "capability:cleanup",
      parsed.value.cleanupCapability,
    ),
    p_manifest_hmac: parsed.value.manifestHmac,
    p_pos_session_id: parsed.envelope.posSessionId,
    p_request_hash: prearmHash,
    p_requested_fence_until: parsed.value.authoritativeFenceUntil,
    p_run_hmac: parsed.value.runHmac,
    p_shop_device_id: parsed.envelope.shopDeviceId,
    p_staff_credential_version: parsed.envelope.staffCredentialVersion,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  if (
    !validSuccess(result.data, "prearmed") &&
    !validSuccess(result.data, "prearmed_rolling") &&
    !validSuccess(result.data, "prearm_replayed")
  ) {
    return safeRpcFailure(result.data);
  }
  return safeResult(200, result.data.code as string, {
    activeExpiresAt: result.data.activeExpiresAt,
    fenceUntil: result.data.fenceUntil,
    manifestHmac: parsed.value.manifestHmac,
    nextRotationBy: result.data.nextRotationBy ?? null,
    requiredCoverageUntil: result.data.requiredCoverageUntil,
    rotationRequired: result.data.code === "prearmed_rolling",
    runHmac: parsed.value.runHmac,
  });
}

async function rotationPrepareBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const parsed = parseTrustedRunAction(body, "rotation_prepare", [
    "cleanupCapability",
    "targetExpiresAt",
  ]);
  if (!parsed) return safeResult(400, "validation_failed");
  if (
    typeof parsed.value.cleanupCapability !== "string" ||
    !CAPABILITY.test(parsed.value.cleanupCapability) ||
    typeof parsed.value.targetExpiresAt !== "string" ||
    !CANONICAL_TIMESTAMP.test(parsed.value.targetExpiresAt) ||
    !Number.isFinite(Date.parse(parsed.value.targetExpiresAt))
  ) {
    return safeResult(400, "validation_failed");
  }
  const actor = await authorizeBootstrap(parsed.envelope);
  if (!actor) return safeResult(403, "bootstrap_actor_denied");
  const actorHmac = hmac(
    key,
    "bootstrap-actor",
    `${actor.shopId.toLowerCase()}\0${actor.staffId.toLowerCase()}`,
  );
  const rotationHash = requestHash(key, "rotation_prepare", [
    parsed.value.requestId as string,
    parsed.value.runHmac as string,
    parsed.value.manifestHmac as string,
    parsed.value.targetExpiresAt as string,
    hmac(key, "capability:cleanup", parsed.value.cleanupCapability),
  ]);
  const pendingCleanupCapability = capability(
    key,
    "cleanup",
    `${parsed.value.runHmac as string}\0${rotationHash}`,
  );
  const result = await rpc(admin, "task_150_win7pos_image_qa_rotation_prepare_v1", {
    p_actor_hmac: actorHmac,
    p_actor_shop_id: actor.shopId,
    p_actor_staff_id: actor.staffId,
    p_cleanup_capability_digest: hmac(
      key,
      "capability:cleanup",
      parsed.value.cleanupCapability,
    ),
    p_manifest_hmac: parsed.value.manifestHmac,
    p_pending_capability_digest: hmac(
      key,
      "capability:cleanup",
      pendingCleanupCapability,
    ),
    p_pos_session_id: parsed.envelope.posSessionId,
    p_request_hash: rotationHash,
    p_requested_target_expires_at: parsed.value.targetExpiresAt,
    p_run_hmac: parsed.value.runHmac,
    p_shop_device_id: parsed.envelope.shopDeviceId,
    p_staff_credential_version: parsed.envelope.staffCredentialVersion,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  if (!validSuccess(result.data, "rotation_prepared")) return safeRpcFailure(result.data);
  return safeResult(200, "rotation_prepared", {
    coverageComplete: result.data.coverageComplete === true,
    pendingCleanupCapability,
    pendingExpiresAt: result.data.pendingExpiresAt,
    requiredCoverageUntil: result.data.requiredCoverageUntil,
    targetExpiresAt: result.data.targetExpiresAt,
  });
}

async function rotationAckBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const parsed = parseTrustedRunAction(body, "rotation_ack", [
    "cleanupCapability",
    "pendingCleanupCapability",
  ]);
  if (!parsed) return safeResult(400, "validation_failed");
  if (
    typeof parsed.value.cleanupCapability !== "string" ||
    !CAPABILITY.test(parsed.value.cleanupCapability) ||
    typeof parsed.value.pendingCleanupCapability !== "string" ||
    !CAPABILITY.test(parsed.value.pendingCleanupCapability)
  ) {
    return safeResult(400, "validation_failed");
  }
  const actor = await authorizeBootstrap(parsed.envelope);
  if (!actor) return safeResult(403, "bootstrap_actor_denied");
  const actorHmac = hmac(
    key,
    "bootstrap-actor",
    `${actor.shopId.toLowerCase()}\0${actor.staffId.toLowerCase()}`,
  );
  const ackHash = requestHash(key, "rotation_ack", [
    parsed.value.requestId as string,
    parsed.value.runHmac as string,
    parsed.value.manifestHmac as string,
    hmac(key, "capability:cleanup", parsed.value.cleanupCapability),
    hmac(key, "capability:cleanup", parsed.value.pendingCleanupCapability),
  ]);
  const result = await rpc(admin, "task_150_win7pos_image_qa_rotation_ack_v1", {
    p_actor_hmac: actorHmac,
    p_actor_shop_id: actor.shopId,
    p_actor_staff_id: actor.staffId,
    p_current_capability_digest: hmac(
      key,
      "capability:cleanup",
      parsed.value.cleanupCapability,
    ),
    p_manifest_hmac: parsed.value.manifestHmac,
    p_pending_capability_digest: hmac(
      key,
      "capability:cleanup",
      parsed.value.pendingCleanupCapability,
    ),
    p_pos_session_id: parsed.envelope.posSessionId,
    p_request_hash: ackHash,
    p_run_hmac: parsed.value.runHmac,
    p_shop_device_id: parsed.envelope.shopDeviceId,
    p_staff_credential_version: parsed.envelope.staffCredentialVersion,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  if (
    !validSuccess(result.data, "rotation_acked") &&
    !validSuccess(result.data, "rotation_ack_replayed")
  ) {
    return safeRpcFailure(result.data);
  }
  return safeResult(200, result.data.code as string, {
    activeExpiresAt: result.data.activeExpiresAt,
    cleanupCapability: parsed.value.pendingCleanupCapability,
  });
}

async function resultIssueBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const parsed = parseTrustedRunAction(body, "result_issue", []);
  if (!parsed) return safeResult(400, "validation_failed");
  const actor = await authorizeBootstrap(parsed.envelope);
  if (!actor) return safeResult(403, "bootstrap_actor_denied");
  const actorHmac = hmac(
    key,
    "bootstrap-actor",
    `${actor.shopId.toLowerCase()}\0${actor.staffId.toLowerCase()}`,
  );
  const issueHash = requestHash(key, "result_issue", [
    parsed.value.requestId as string,
    parsed.value.runHmac as string,
    parsed.value.manifestHmac as string,
  ]);
  const resultCapability = capability(
    key,
    "result",
    `${parsed.value.runHmac as string}\0${issueHash}`,
  );
  const result = await rpc(admin, "task_150_win7pos_image_qa_result_issue_v1", {
    p_actor_hmac: actorHmac,
    p_actor_shop_id: actor.shopId,
    p_actor_staff_id: actor.staffId,
    p_manifest_hmac: parsed.value.manifestHmac,
    p_pos_session_id: parsed.envelope.posSessionId,
    p_request_hash: issueHash,
    p_result_capability_digest: hmac(key, "capability:result", resultCapability),
    p_run_hmac: parsed.value.runHmac,
    p_shop_device_id: parsed.envelope.shopDeviceId,
    p_staff_credential_version: parsed.envelope.staffCredentialVersion,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  if (!validSuccess(result.data, "result_issued")) return safeRpcFailure(result.data);
  return safeResult(200, "result_issued", {
    expiresAt: result.data.expiresAt,
    resultCapability,
  });
}

async function cleanupBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const parsed = parseCapabilityBody(body, "cleanup", "cleanupCapability");
  if (!parsed) return safeResult(400, "validation_failed");
  const cleanupHash = requestHash(key, "cleanup", [
    parsed.requestId,
    parsed.runHmac,
    parsed.manifestHmac,
  ]);
  const owner = randomBytes(32).toString("base64url");
  const ownerDigest = hmac(key, "cleanup-owner", owner);
  const cleanupDigest = hmac(key, "capability:cleanup", parsed.cleanupCapability);
  const acquired = await rpc(admin, "task_150_win7pos_image_qa_cleanup_acquire_v1", {
    p_cleanup_capability_digest: cleanupDigest,
    p_cleanup_request_hash: cleanupHash,
    p_manifest_hmac: parsed.manifestHmac,
    p_owner_digest: ownerDigest,
    p_run_hmac: parsed.runHmac,
  });
  if (acquired.error || !isRecord(acquired.data)) return safeResult(503, "boundary_unavailable");
  if (!validSuccess(acquired.data, "cleanup_acquired")) return safeRpcFailure(acquired.data);
  const generation = acquired.data.generation;
  if (
    !Array.isArray(acquired.data.paths) ||
    acquired.data.paths.length !== 0 ||
    !Number.isSafeInteger(generation) ||
    (generation as number) < 1
  ) {
    return safeResult(503, "boundary_contract_invalid");
  }
  // Storage bytes must already have been removed through the ordinary trusted
  // product-image runtime. The QA boundary performs no unfenced external I/O.
  const committed = await rpc(admin, "task_150_win7pos_image_qa_cleanup_commit_v1", {
    p_cleanup_capability_digest: cleanupDigest,
    p_cleanup_request_hash: cleanupHash,
    p_generation: generation,
    p_manifest_hmac: parsed.manifestHmac,
    p_owner_digest: ownerDigest,
    p_run_hmac: parsed.runHmac,
  });
  if (committed.error || !isRecord(committed.data)) return safeResult(503, "boundary_unavailable");
  if (!validSuccess(committed.data, "cleanup_complete")) return safeRpcFailure(committed.data);
  if (!isRecord(committed.data.receipt)) return safeResult(503, "boundary_contract_invalid");
  return safeResult(200, "cleanup_complete", { receipt: committed.data.receipt });
}

async function resultBoundary(
  admin: SupabaseAdminClient,
  key: string,
  body: UnknownRecord,
) {
  const parsed = parseCapabilityBody(body, "result", "resultCapability");
  if (!parsed) return safeResult(400, "validation_failed");
  const result = await rpc(admin, "task_150_win7pos_image_qa_result_v1", {
    p_manifest_hmac: parsed.manifestHmac,
    p_result_capability_digest: hmac(key, "capability:result", parsed.resultCapability),
    p_run_hmac: parsed.runHmac,
  });
  if (result.error || !isRecord(result.data)) return safeResult(503, "boundary_unavailable");
  if (result.data.ok !== true) return safeRpcFailure(result.data);
  if (result.data.code === "terminal" && isRecord(result.data.receipt)) {
    return safeResult(200, "terminal", { receipt: result.data.receipt, state: "terminal" });
  }
  const states = new Set(["not_started", "in_progress", "aborted_recoverable", "invariant_blocked"]);
  if (result.data.code !== "status" || !states.has(result.data.state as string)) {
    return safeResult(503, "boundary_contract_invalid");
  }
  return safeResult(200, "status", {
    capabilityActive: result.data.capabilityActive === true,
    retryAfterAt:
      typeof result.data.retryAfterAt === "string" ? result.data.retryAfterAt : null,
    state: result.data.state,
  });
}

export function task150QaHostAllowed(host: string) {
  const normalized = host.trim().toLowerCase();
  return (
    normalized ===
      "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev" ||
    /^localhost(?::\d{2,5})?$/.test(normalized) ||
    /^127\.0\.0\.1(?::\d{2,5})?$/.test(normalized)
  );
}

export function task150QaProjectAllowed(rawUrl: string | undefined) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl.trim());
    return (
      url.origin === STAGING_SUPABASE_ORIGIN &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export async function handleTask150BoundaryRequest(input: {
  body: unknown;
  bodyBytes: number;
  baseUrl: string;
  host: string;
}): Promise<Task150BoundaryResult> {
  if (!task150QaHostAllowed(input.host)) return safeResult(404, "not_found");
  if (!task150QaProjectAllowed(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return safeResult(503, "not_configured");
  }
  if (input.bodyBytes < 2 || input.bodyBytes > MAX_BODY_BYTES || !isRecord(input.body)) {
    return safeResult(input.bodyBytes > MAX_BODY_BYTES ? 413 : 400, "validation_failed");
  }
  const key = hmacKey();
  const admin = createSupabaseAdminClient();
  if (!key || !admin) return safeResult(503, "not_configured");
  const action = input.body.action;
  try {
    if (action === "begin") return beginBoundary(admin, key, input.body);
    if (action === "provision") return provisionBoundary(admin, key, input.body, input.baseUrl);
    if (action === "prearm") return prearmBoundary(admin, key, input.body);
    if (action === "cleanup") return cleanupBoundary(admin, key, input.body);
    if (action === "result") return resultBoundary(admin, key, input.body);
    if (action === "rotation_prepare") {
      return rotationPrepareBoundary(admin, key, input.body);
    }
    if (action === "rotation_ack") return rotationAckBoundary(admin, key, input.body);
    if (action === "result_issue") return resultIssueBoundary(admin, key, input.body);
    return safeResult(400, "validation_failed");
  } catch {
    return safeResult(503, "boundary_unavailable");
  }
}

export const task150BoundaryConstants = Object.freeze({
  fixtureTemplate: FIXTURE_TEMPLATE,
  maximumBodyBytes: MAX_BODY_BYTES,
  stagingSupabaseOrigin: STAGING_SUPABASE_ORIGIN,
});
