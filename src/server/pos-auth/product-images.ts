import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_MAIN_MAX_BYTES,
  PRODUCT_IMAGE_MAIN_MAX_SIDE,
  PRODUCT_IMAGE_READ_BATCH_LIMIT,
  PRODUCT_IMAGE_READ_RESPONSE_LIMIT,
  PRODUCT_IMAGE_READ_URL_TTL_SECONDS,
  PRODUCT_IMAGE_THUMB_MAX_BYTES,
  PRODUCT_IMAGE_THUMB_MAX_SIDE,
  type ProductImageUploadMetadata,
} from "@/server/shop-admin/product-images/contract";
import {
  isCanonicalProductImagePath,
  isProductImageStorageObjectMissingError,
  resolveProductImageAdminClient,
  verifyDownloadedProductImageJpeg,
} from "@/server/shop-admin/product-images/runtime-core";
import type {
  TrustedPosProductImageFinalizeRequest,
  TrustedPosProductImageIntentRequest,
  TrustedPosProductImageReadUrlsRequest,
  TrustedPosProductImageRemoveRequest,
} from "./product-image-auth";
import { POS_PRODUCT_IMAGE_SCHEMA_VERSION } from "./pos-contract";
import {
  canonicalPosProductImagePayloadJson,
  createPosProductImageErrorBody,
  type PosProductImageCanonicalWriteRequest,
  type PosProductImageReadRef,
} from "./product-image-envelope";
import { writePosRuntimeAudit } from "./runtime-boundary";

const CANONICAL_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SIGNED_URL_LENGTH = 4096;
const SIGNED_UPLOAD_CAPABILITY_MAX_SECONDS = 2 * 60 * 60;
const LOCAL_URL_HOSTNAMES = new Set(["127.0.0.1", "[::1]", "localhost"]);

const SAFE_RPC_FAILURE_CODES = new Set([
  "auth_denied",
  "backend_unavailable",
  "expected_version_conflict",
  "idempotency_conflict",
  "idempotency_payload_mismatch",
  "intent_expired",
  "invalid_state",
  "jpeg_aspect_ratio_mismatch",
  "jpeg_byte_count_mismatch",
  "jpeg_checksum_mismatch",
  "jpeg_dimensions_invalid",
  "jpeg_magic_invalid",
  "jpeg_metadata_forbidden",
  "jpeg_mime_invalid",
  "jpeg_structure_invalid",
  "jpeg_truncated",
  "not_found",
  "payload_hash_mismatch",
  "permission_denied",
  "product_not_found",
  "rate_limited",
  "receipt_conflict",
  "stale_conflict",
  "storage_object_missing",
  "validation_failed",
  "version_not_found",
]);

type UnknownRecord = Record<string, unknown>;
type RpcError = { code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type ProductImageOperation = "finalize" | "intent" | "read-urls" | "remove";
type TrustedWriteRequest =
  | TrustedPosProductImageFinalizeRequest
  | TrustedPosProductImageIntentRequest
  | TrustedPosProductImageRemoveRequest;
type TrustedRequest =
  | TrustedPosProductImageFinalizeRequest
  | TrustedPosProductImageIntentRequest
  | TrustedPosProductImageReadUrlsRequest
  | TrustedPosProductImageRemoveRequest;

export type PosProductImageRequestMeta = {
  clientRequestId?: string;
  edgeCorrelationHash?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

export type PosProductImageEndpointResult = {
  body: Record<string, unknown>;
  status: number;
};

type ExpectedImageMetadata = {
  bytes: number;
  height: number;
  mimeType: "image/jpeg";
  sha256: string;
  width: number;
};

type ResolvedReadItem = {
  code: "not_found" | "success";
  metadata?: ProductImageUploadMetadata;
  objectPath?: string;
  productId: string;
  variant: "main" | "thumb";
  versionId: string;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textField(record: UnknownRecord, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

function nullableTextField(record: UnknownRecord, key: string) {
  return record[key] === null || typeof record[key] === "string"
    ? (record[key] as string | null)
    : undefined;
}

function booleanField(record: UnknownRecord, key: string) {
  return typeof record[key] === "boolean" ? (record[key] as boolean) : null;
}

function integerField(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function canonicalTimestamp(value: unknown) {
  return typeof value === "string" &&
    CANONICAL_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function currentCanonicalTimestamp() {
  return new Date().toISOString().replace("Z", "000Z");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function sameUuid(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function computePosProductImagePayloadHash(
  request: PosProductImageCanonicalWriteRequest,
) {
  return `sha256:${digest(canonicalPosProductImagePayloadJson(request))}`;
}

function hashedCacheScope(request: TrustedRequest) {
  return `pos-product-image:${digest(
    JSON.stringify({
      schemaVersion: request.schemaVersion,
      shopId: request.shopId.toLowerCase(),
      shopDeviceId: request.shopDeviceId.toLowerCase(),
      staffId: request.staffId.toLowerCase(),
      staffCredentialVersion: request.staffCredentialVersion,
    }),
  )}`;
}

function operationFor(request: TrustedRequest): ProductImageOperation {
  return "refs" in request ? "read-urls" : request.operation;
}

function result(
  status: number,
  body: Record<string, unknown>,
): PosProductImageEndpointResult {
  return { body, status };
}

function failureStatus(code: string) {
  if (code === "auth_denied") return 401;
  if (code === "permission_denied") return 403;
  if (
    code === "not_found" ||
    code === "product_not_found" ||
    code === "version_not_found"
  ) {
    return 404;
  }
  if (
    code === "expected_version_conflict" ||
    code === "idempotency_conflict" ||
    code === "idempotency_payload_mismatch" ||
    code === "intent_expired" ||
    code === "invalid_state" ||
    code === "receipt_conflict" ||
    code === "stale_conflict" ||
    code === "storage_object_missing"
  ) {
    return 409;
  }
  if (code === "rate_limited") return 429;
  if (
    code === "jpeg_aspect_ratio_mismatch" ||
    code === "jpeg_byte_count_mismatch" ||
    code === "jpeg_checksum_mismatch" ||
    code === "jpeg_dimensions_invalid" ||
    code === "jpeg_magic_invalid" ||
    code === "jpeg_metadata_forbidden" ||
    code === "jpeg_mime_invalid" ||
    code === "jpeg_structure_invalid" ||
    code === "jpeg_truncated"
  ) {
    return 422;
  }
  if (code === "payload_hash_mismatch" || code === "validation_failed") {
    return 400;
  }
  return 503;
}

function failureIsRetryable(code: string) {
  return (
    code === "backend_contract_invalid" ||
    code === "backend_unavailable" ||
    code === "not_configured" ||
    code === "rate_limited" ||
    code === "storage_unavailable"
  );
}

function safeFailure(
  request: TrustedRequest,
  code: string,
  options: {
    serverTime?: string;
    status?: number;
  } = {},
) {
  const operation = operationFor(request);
  const retryable = failureIsRetryable(code);
  const body = createPosProductImageErrorBody({
    code,
    ...(!("refs" in request)
      ? {
          idempotencyKey: request.idempotencyKey,
          operationId: request.operationId,
          payloadHash: request.payloadHash,
        }
      : {}),
    message: "POS product image operation could not be completed.",
    operation,
    retryable,
    serverTime: options.serverTime ?? currentCanonicalTimestamp(),
    terminal: !retryable,
  });

  return result(options.status ?? failureStatus(code), body);
}

function rpcFailure(
  request: TrustedRequest,
  value: unknown,
): PosProductImageEndpointResult {
  if (!isRecord(value) || value.ok !== false) {
    return safeFailure(request, "backend_contract_invalid");
  }

  const candidateCode = textField(value, "code");
  const code =
    candidateCode &&
    SAFE_CODE_PATTERN.test(candidateCode) &&
    SAFE_RPC_FAILURE_CODES.has(candidateCode)
      ? candidateCode
      : "backend_contract_invalid";

  return safeFailure(request, code, {
    serverTime: canonicalTimestamp(value.server_time) ?? undefined,
  });
}

async function callRpc(
  admin: SupabaseAdminClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const client = admin as unknown as {
    rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>;
  };
  return client.rpc(functionName, args);
}

function runtimeRpcArgs(request: TrustedRequest) {
  return {
    p_app_version: request.appVersion,
    p_expected_staff_credential_version: request.staffCredentialVersion,
    p_pos_session_id: request.posSessionId,
    p_schema_version: request.schemaVersion,
    p_shop_device_id: request.shopDeviceId,
    p_shop_id: request.shopId,
    p_staff_id: request.staffId,
  };
}

function writeRpcArgs(request: TrustedWriteRequest) {
  return {
    ...runtimeRpcArgs(request),
    p_expected_current_version_id: request.expectedCurrentVersionId,
    p_idempotency_key: request.idempotencyKey,
    p_operation_id: request.operationId,
    p_payload_hash: request.payloadHash,
    p_product_id: request.productId,
  };
}

function supportIdentityHash(meta: PosProductImageRequestMeta) {
  const values = [
    meta.clientRequestId,
    meta.edgeCorrelationHash,
    meta.requestId,
  ].filter((value): value is string => Boolean(value));
  return values.length > 0 ? `sha256:${digest(values.join("\u0000"))}` : null;
}

function operationIdentityHash(request: TrustedRequest) {
  const identity =
    "refs" in request
      ? JSON.stringify({
          operation: "read-urls",
          refs: request.refs.map((ref) => ({
            productId: ref.productId.toLowerCase(),
            variant: ref.variant,
            versionId: ref.versionId.toLowerCase(),
          })),
          shopId: request.shopId.toLowerCase(),
        })
      : JSON.stringify({
          idempotencyKey: request.idempotencyKey,
          operation: request.operation,
          operationId: request.operationId,
          shopId: request.shopId.toLowerCase(),
        });
  return `sha256:${digest(identity)}`;
}

async function auditNodeFailure(
  admin: SupabaseAdminClient,
  request: TrustedRequest,
  meta: PosProductImageRequestMeta,
  code: string,
  numericMetadata: Record<string, number> = {},
) {
  try {
    const { data, error } = await callRpc(
      admin,
      "pos_product_image_node_audit_admit_v1",
      {
        p_expected_staff_credential_version: request.staffCredentialVersion,
        p_permission: request.permission,
        p_pos_session_id: request.posSessionId,
        p_shop_device_id: request.shopDeviceId,
        p_shop_id: request.shopId,
        p_staff_id: request.staffId,
      },
    );

    if (
      error ||
      !isRecord(data) ||
      data.ok !== true ||
      data.admitted !== true ||
      !canonicalTimestamp(data.server_time)
    ) {
      return;
    }

    const supportHash = supportIdentityHash(meta);
    const metadata: Record<string, Json | undefined> = {
      code,
      operation: operationFor(request),
      operation_identity_hash: operationIdentityHash(request),
      support_identity_hash: supportHash ?? undefined,
      ...numericMetadata,
    };

    await writePosRuntimeAudit(admin, {
      code,
      eventKey: "pos.catalog.product_image.node_failure",
      metadata,
      result: "failure",
      severity: "warning",
      shopId: request.shopId,
      staffId: request.staffId,
      targetType: "product_image_operation",
    });
  } catch {
    // Node-side failure audit is best-effort and must not alter the endpoint response.
  }
}

function validEphemeralUrl(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_SIGNED_URL_LENGTH
  ) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.username ||
      parsed.password ||
      (parsed.protocol !== "https:" &&
        !(
          parsed.protocol === "http:" &&
          LOCAL_URL_HOSTNAMES.has(parsed.hostname)
        ))
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function metadataIsWithinLimits(
  metadata: ExpectedImageMetadata,
  limits: { maxBytes: number; maxSide: number },
) {
  return (
    metadata.mimeType === "image/jpeg" &&
    SHA256_PATTERN.test(metadata.sha256) &&
    Number.isSafeInteger(metadata.bytes) &&
    metadata.bytes >= 1 &&
    metadata.bytes <= limits.maxBytes &&
    Number.isSafeInteger(metadata.width) &&
    metadata.width >= 1 &&
    metadata.width <= limits.maxSide &&
    Number.isSafeInteger(metadata.height) &&
    metadata.height >= 1 &&
    metadata.height <= limits.maxSide
  );
}

function parseExpectedMetadata(
  value: unknown,
  limits: { maxBytes: number; maxSide: number },
): ExpectedImageMetadata | null {
  if (!isRecord(value)) return null;

  const metadata: ExpectedImageMetadata = {
    bytes: integerField(value, "bytes") ?? 0,
    height: integerField(value, "height") ?? 0,
    mimeType: value.mimeType === "image/jpeg" ? "image/jpeg" : "image/jpeg",
    sha256: textField(value, "sha256") ?? "",
    width: integerField(value, "width") ?? 0,
  };

  return value.mimeType === "image/jpeg" &&
    metadataIsWithinLimits(metadata, limits)
    ? metadata
    : null;
}

function validIntentMetadata(request: TrustedPosProductImageIntentRequest) {
  return (
    metadataIsWithinLimits(request.main, {
      maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
      maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
    }) &&
    metadataIsWithinLimits(request.thumb, {
      maxBytes: PRODUCT_IMAGE_THUMB_MAX_BYTES,
      maxSide: PRODUCT_IMAGE_THUMB_MAX_SIDE,
    }) &&
    Math.abs(
      request.main.width / request.main.height -
        request.thumb.width / request.thumb.height,
    ) <= 0.02
  );
}

async function authorizationFence(
  admin: SupabaseAdminClient,
  request:
    TrustedPosProductImageIntentRequest | TrustedPosProductImageReadUrlsRequest,
  functionName:
    "pos_product_image_authorize_v1" | "pos_product_image_read_authorize_v1",
) {
  const parameters =
    functionName === "pos_product_image_authorize_v1"
      ? {
          p_expected_staff_credential_version: request.staffCredentialVersion,
          p_permission: "catalog.write",
          p_pos_session_id: request.posSessionId,
          p_shop_device_id: request.shopDeviceId,
          p_shop_id: request.shopId,
          p_staff_id: request.staffId,
        }
      : runtimeRpcArgs(request);
  const { data, error } = await callRpc(admin, functionName, parameters);

  if (error) return "backend_unavailable" as const;
  if (!isRecord(data)) return "backend_contract_invalid" as const;
  if (data.ok === true && data.code === "authorized") {
    return "authorized" as const;
  }
  if (
    data.ok === false &&
    (data.code === "auth_denied" || data.code === "permission_denied")
  ) {
    return data.code;
  }
  return "backend_contract_invalid" as const;
}

async function finalIntentFence(
  admin: SupabaseAdminClient,
  request: TrustedPosProductImageIntentRequest,
) {
  return authorizationFence(admin, request, "pos_product_image_authorize_v1");
}

function fenceFailure(
  request:
    TrustedPosProductImageIntentRequest | TrustedPosProductImageReadUrlsRequest,
  code:
    | Exclude<Awaited<ReturnType<typeof authorizationFence>>, "authorized">
    | "stale_conflict",
  serverTime: string,
) {
  return safeFailure(request, code, {
    serverTime,
    status:
      code === "auth_denied"
        ? 401
        : code === "permission_denied"
          ? 403
          : undefined,
  });
}

function parseIntentSuccess(
  request: TrustedPosProductImageIntentRequest,
  value: unknown,
) {
  if (!isRecord(value) || value.ok !== true || value.code !== "success") {
    return null;
  }

  const status = textField(value, "status");
  const versionId = textField(value, "version_id");
  const replayed = booleanField(value, "replayed");
  const serverTime = canonicalTimestamp(value.server_time);

  if (
    (status !== "noop" && status !== "upload_required") ||
    !versionId ||
    !isUuid(versionId) ||
    replayed === null ||
    !serverTime
  ) {
    return null;
  }

  if (status === "noop") {
    if (
      !request.expectedCurrentVersionId ||
      !sameUuid(versionId, request.expectedCurrentVersionId)
    ) {
      return null;
    }
    return {
      replayed,
      serverTime,
      status,
      versionId,
    } as const;
  }

  const mainPath = textField(value, "main_path");
  const thumbPath = textField(value, "thumb_path");
  const expiresAt = canonicalTimestamp(value.expires_at);
  const now = Date.now();
  const expiryMillis = expiresAt ? Date.parse(expiresAt) : Number.NaN;

  if (!expiresAt || !Number.isFinite(expiryMillis)) {
    return null;
  }

  if (expiryMillis <= now) {
    return {
      replayed,
      serverTime,
      status: "expired" as const,
      versionId,
    };
  }

  if (
    expiryMillis >
    now + SIGNED_UPLOAD_CAPABILITY_MAX_SECONDS * 1000 + 5_000
  ) {
    return null;
  }

  if (
    !mainPath ||
    !thumbPath ||
    !isCanonicalProductImagePath({
      path: mainPath,
      productId: request.productId,
      shopId: request.shopId,
      variant: "main",
      versionId,
    }) ||
    !isCanonicalProductImagePath({
      path: thumbPath,
      productId: request.productId,
      shopId: request.shopId,
      variant: "thumb",
      versionId,
    })
  ) {
    return null;
  }

  return {
    expiresAt,
    mainPath,
    replayed,
    serverTime,
    status,
    thumbPath,
    versionId,
  } as const;
}

function sameUploadIntent(
  initial: {
    expiresAt: string;
    mainPath: string;
    status: "upload_required";
    thumbPath: string;
    versionId: string;
  },
  replay: NonNullable<ReturnType<typeof parseIntentSuccess>>,
) {
  return (
    replay.status === "upload_required" &&
    replay.replayed === true &&
    replay.expiresAt === initial.expiresAt &&
    replay.mainPath === initial.mainPath &&
    replay.thumbPath === initial.thumbPath &&
    sameUuid(replay.versionId, initial.versionId)
  );
}

export async function handlePosProductImageIntent(
  request: TrustedPosProductImageIntentRequest,
  meta: PosProductImageRequestMeta = {},
): Promise<PosProductImageEndpointResult> {
  const admin = resolveProductImageAdminClient();
  if (!admin) return safeFailure(request, "not_configured");
  if (request.permission !== "catalog.write") {
    return safeFailure(request, "permission_denied", { status: 403 });
  }

  if (!validIntentMetadata(request)) {
    return safeFailure(request, "validation_failed", { status: 400 });
  }

  if (computePosProductImagePayloadHash(request) !== request.payloadHash) {
    await auditNodeFailure(admin, request, meta, "payload_hash_mismatch", {
      image_count: 2,
    });
    return safeFailure(request, "payload_hash_mismatch", { status: 400 });
  }

  const { data, error } = await callRpc(admin, "pos_product_image_intent_v1", {
    ...writeRpcArgs(request),
    p_main_metadata: request.main,
    p_thumb_metadata: request.thumb,
  });

  if (error) {
    return safeFailure(
      request,
      error.code === "42501" ? "permission_denied" : "backend_unavailable",
    );
  }
  if (isRecord(data) && data.ok === false) return rpcFailure(request, data);

  const intent = parseIntentSuccess(request, data);
  if (!intent) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid");
  }

  if (intent.status === "expired") {
    return safeFailure(request, "intent_expired", {
      serverTime: intent.serverTime,
      status: 409,
    });
  }

  if (intent.status === "noop") {
    const fence = await finalIntentFence(admin, request);
    if (fence !== "authorized") {
      return fenceFailure(request, fence, intent.serverTime);
    }
    return result(200, {
      schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
      operation: "intent",
      operationId: request.operationId,
      idempotencyKey: request.idempotencyKey,
      payloadHash: request.payloadHash,
      ok: true,
      code: "success",
      replayed: intent.replayed,
      serverTime: intent.serverTime,
      cacheScope: hashedCacheScope(request),
      status: "noop",
      versionId: intent.versionId,
    });
  }

  const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
  const [mainSigned, thumbSigned] = await Promise.all([
    bucket.createSignedUploadUrl(intent.mainPath),
    bucket.createSignedUploadUrl(intent.thumbPath),
  ]);
  const mainUploadUrl = validEphemeralUrl(mainSigned.data?.signedUrl);
  const thumbUploadUrl = validEphemeralUrl(thumbSigned.data?.signedUrl);

  if (
    mainSigned.error ||
    thumbSigned.error ||
    !mainUploadUrl ||
    !thumbUploadUrl
  ) {
    await auditNodeFailure(admin, request, meta, "storage_unavailable", {
      image_count: 2,
    });
    return safeFailure(request, "storage_unavailable", {
      serverTime: intent.serverTime,
    });
  }

  const replayResult = await callRpc(admin, "pos_product_image_intent_v1", {
    ...writeRpcArgs(request),
    p_main_metadata: request.main,
    p_thumb_metadata: request.thumb,
  });
  if (replayResult.error) {
    return safeFailure(
      request,
      replayResult.error.code === "42501"
        ? "permission_denied"
        : "backend_unavailable",
      { serverTime: intent.serverTime },
    );
  }
  if (isRecord(replayResult.data) && replayResult.data.ok === false) {
    const replayCode = textField(replayResult.data, "code");
    if (
      replayCode === "expected_version_conflict" ||
      replayCode === "invalid_state" ||
      replayCode === "product_not_found" ||
      replayCode === "stale_conflict" ||
      replayCode === "version_not_found"
    ) {
      return safeFailure(request, "stale_conflict", {
        serverTime:
          canonicalTimestamp(replayResult.data.server_time) ??
          intent.serverTime,
        status: 409,
      });
    }
    return rpcFailure(request, replayResult.data);
  }

  const replayIntent = parseIntentSuccess(request, replayResult.data);
  if (!replayIntent) {
    if (
      isRecord(replayResult.data) &&
      replayResult.data.ok === true &&
      replayResult.data.code === "success" &&
      canonicalTimestamp(replayResult.data.server_time) &&
      (replayResult.data.status === "noop" ||
        replayResult.data.status === "upload_required")
    ) {
      return safeFailure(request, "stale_conflict", {
        serverTime:
          canonicalTimestamp(replayResult.data.server_time) ??
          intent.serverTime,
        status: 409,
      });
    }
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid", {
      serverTime: intent.serverTime,
    });
  }
  if (replayIntent.status === "expired") {
    return safeFailure(request, "intent_expired", {
      serverTime: replayIntent.serverTime,
      status: 409,
    });
  }
  if (!sameUploadIntent(intent, replayIntent)) {
    return safeFailure(request, "stale_conflict", {
      serverTime: replayIntent.serverTime,
      status: 409,
    });
  }

  const fence = await finalIntentFence(admin, request);
  if (fence !== "authorized") {
    return fenceFailure(request, fence, replayIntent.serverTime);
  }

  return result(intent.replayed ? 200 : 201, {
    schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
    operation: "intent",
    operationId: request.operationId,
    idempotencyKey: request.idempotencyKey,
    payloadHash: request.payloadHash,
    ok: true,
    code: "success",
    replayed: intent.replayed,
    serverTime: intent.serverTime,
    cacheScope: hashedCacheScope(request),
    status: "upload_required",
    versionId: intent.versionId,
    expiresAt: intent.expiresAt,
    mainUploadUrl,
    thumbUploadUrl,
  });
}

function parseFinalizePrepare(
  request: TrustedPosProductImageFinalizeRequest,
  value: unknown,
) {
  if (!isRecord(value)) return null;
  if (value.ok === false) {
    const status = textField(value, "status");
    const replayed = booleanField(value, "replayed");
    const versionId = textField(value, "version_id");
    const validationCode = textField(value, "validation_code");
    const serverTime = canonicalTimestamp(value.server_time);
    const cleanupRequired = booleanField(value, "cleanup_required");
    const rawMainPath = nullableTextField(value, "main_path");
    const rawThumbPath = nullableTextField(value, "thumb_path");
    const mainPath = rawMainPath ?? null;
    const thumbPath = rawThumbPath ?? null;
    if (
      status === "validation_failed" &&
      replayed === true &&
      versionId &&
      sameUuid(versionId, request.versionId) &&
      validationCode &&
      SAFE_RPC_FAILURE_CODES.has(validationCode) &&
      serverTime &&
      cleanupRequired !== null &&
      ((!cleanupRequired && mainPath === null && thumbPath === null) ||
        (rawMainPath !== undefined &&
          rawThumbPath !== undefined &&
          typeof mainPath === "string" &&
          typeof thumbPath === "string" &&
          isCanonicalProductImagePath({
            path: mainPath,
            productId: request.productId,
            shopId: request.shopId,
            variant: "main",
            versionId: request.versionId,
          }) &&
          isCanonicalProductImagePath({
            path: thumbPath,
            productId: request.productId,
            shopId: request.shopId,
            variant: "thumb",
            versionId: request.versionId,
          })))
    ) {
      return {
        cleanupRequired,
        kind: "validation_failed" as const,
        mainPath,
        replayed,
        serverTime,
        thumbPath,
        validationCode,
      };
    }
    return null;
  }

  if (value.ok !== true || value.code !== "success") return null;
  const status = textField(value, "status");
  const replayed = booleanField(value, "replayed");
  const versionId = textField(value, "version_id");
  const serverTime = canonicalTimestamp(value.server_time);

  if (
    replayed === null ||
    !versionId ||
    !sameUuid(versionId, request.versionId) ||
    !serverTime
  ) {
    return null;
  }

  if (status === "finalized" || status === "already_finalized") {
    const imageUpdatedAt = canonicalTimestamp(value.image_updated_at);
    return imageUpdatedAt
      ? {
          imageUpdatedAt,
          kind: "finalized" as const,
          replayed,
          serverTime,
          status,
        }
      : null;
  }

  if (status !== "validation_required" || replayed) return null;

  const mainPath = textField(value, "main_path");
  const thumbPath = textField(value, "thumb_path");
  const expiresAt = canonicalTimestamp(value.expires_at);
  const expectedMain = parseExpectedMetadata(value.expected_main, {
    maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
  });
  const expectedThumb = parseExpectedMetadata(value.expected_thumb, {
    maxBytes: PRODUCT_IMAGE_THUMB_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_THUMB_MAX_SIDE,
  });

  if (
    !mainPath ||
    !thumbPath ||
    !expiresAt ||
    Date.parse(expiresAt) <= Date.now() ||
    !expectedMain ||
    !expectedThumb ||
    !isCanonicalProductImagePath({
      path: mainPath,
      productId: request.productId,
      shopId: request.shopId,
      variant: "main",
      versionId: request.versionId,
    }) ||
    !isCanonicalProductImagePath({
      path: thumbPath,
      productId: request.productId,
      shopId: request.shopId,
      variant: "thumb",
      versionId: request.versionId,
    })
  ) {
    return null;
  }

  return {
    expectedMain,
    expectedThumb,
    kind: "validation_required" as const,
    mainPath,
    serverTime,
    thumbPath,
  };
}

function verifiedMetadata(
  inspection: {
    height: number;
    sha256: string;
    width: number;
  },
  bytes: Uint8Array,
) {
  return {
    bytes: bytes.byteLength,
    height: inspection.height,
    mimeType: "image/jpeg",
    sha256: inspection.sha256,
    width: inspection.width,
  };
}

function parseFinalizeCommit(
  request: TrustedPosProductImageFinalizeRequest,
  value: unknown,
) {
  if (!isRecord(value)) return null;
  const replayed = booleanField(value, "replayed");
  const status = textField(value, "status");
  const versionId = textField(value, "version_id");
  const serverTime = canonicalTimestamp(value.server_time);

  if (
    replayed === null ||
    !versionId ||
    !sameUuid(versionId, request.versionId) ||
    !serverTime
  ) {
    return null;
  }

  if (value.ok === true && value.code === "success") {
    const imageUpdatedAt = canonicalTimestamp(value.image_updated_at);
    return (status === "finalized" || status === "already_finalized") &&
      imageUpdatedAt
      ? {
          imageUpdatedAt,
          kind: "finalized" as const,
          replayed,
          serverTime,
          status,
        }
      : null;
  }

  if (value.ok !== false || status !== "validation_failed") return null;
  const validationCode = textField(value, "validation_code");
  const cleanupRequired = booleanField(value, "cleanup_required");
  const rawMainPath = nullableTextField(value, "main_path");
  const rawThumbPath = nullableTextField(value, "thumb_path");
  const mainPath = rawMainPath ?? null;
  const thumbPath = rawThumbPath ?? null;

  if (
    !validationCode ||
    !SAFE_RPC_FAILURE_CODES.has(validationCode) ||
    cleanupRequired === null ||
    (cleanupRequired &&
      (rawMainPath === undefined ||
        rawThumbPath === undefined ||
        !mainPath ||
        !thumbPath ||
        !isCanonicalProductImagePath({
          path: mainPath,
          productId: request.productId,
          shopId: request.shopId,
          variant: "main",
          versionId: request.versionId,
        }) ||
        !isCanonicalProductImagePath({
          path: thumbPath,
          productId: request.productId,
          shopId: request.shopId,
          variant: "thumb",
          versionId: request.versionId,
        }))) ||
    (!cleanupRequired && (mainPath !== null || thumbPath !== null))
  ) {
    return null;
  }

  return {
    cleanupRequired,
    kind: "validation_failed" as const,
    mainPath,
    replayed,
    serverTime,
    thumbPath,
    validationCode,
  };
}

async function recordCleanupResult(
  admin: SupabaseAdminClient,
  request:
    TrustedPosProductImageFinalizeRequest | TrustedPosProductImageRemoveRequest,
  input: {
    errorCode: string | null;
    success: boolean;
    versionId: string;
  },
) {
  const { data, error } = await callRpc(
    admin,
    "pos_product_image_cleanup_result_v1",
    {
      ...runtimeRpcArgs(request),
      p_error_code: input.errorCode,
      p_idempotency_key: request.idempotencyKey,
      p_operation: request.operation,
      p_operation_id: request.operationId,
      p_payload_hash: request.payloadHash,
      p_product_id: request.productId,
      p_success: input.success,
      p_version_id: input.versionId,
    },
  );

  if (
    error ||
    !isRecord(data) ||
    data.ok !== true ||
    data.code !== "cleanup_recorded" ||
    (data.cleanup_status !== "complete" && data.cleanup_status !== "pending")
  ) {
    return "pending" as const;
  }

  return data.cleanup_status;
}

async function deleteCanonicalObjects(
  admin: SupabaseAdminClient,
  request:
    TrustedPosProductImageFinalizeRequest | TrustedPosProductImageRemoveRequest,
  input: {
    mainPath: string;
    thumbPath: string;
    versionId: string;
  },
) {
  const storageResult = await admin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .remove([input.mainPath, input.thumbPath]);
  const success = !storageResult.error;

  return recordCleanupResult(admin, request, {
    errorCode: success ? null : "storage_delete_failed",
    success,
    versionId: input.versionId,
  });
}

export async function handlePosProductImageFinalize(
  request: TrustedPosProductImageFinalizeRequest,
  meta: PosProductImageRequestMeta = {},
): Promise<PosProductImageEndpointResult> {
  const admin = resolveProductImageAdminClient();
  if (!admin) return safeFailure(request, "not_configured");
  if (request.permission !== "catalog.write") {
    return safeFailure(request, "permission_denied", { status: 403 });
  }

  if (computePosProductImagePayloadHash(request) !== request.payloadHash) {
    await auditNodeFailure(admin, request, meta, "payload_hash_mismatch", {
      image_count: 2,
    });
    return safeFailure(request, "payload_hash_mismatch", { status: 400 });
  }

  const prepareResult = await callRpc(
    admin,
    "pos_product_image_finalize_prepare_v1",
    {
      ...writeRpcArgs(request),
      p_version_id: request.versionId,
    },
  );

  if (prepareResult.error) {
    return safeFailure(
      request,
      prepareResult.error.code === "42501"
        ? "permission_denied"
        : "backend_unavailable",
    );
  }
  if (isRecord(prepareResult.data) && prepareResult.data.ok === false) {
    const terminalReplay = parseFinalizePrepare(request, prepareResult.data);
    if (terminalReplay?.kind === "validation_failed") {
      if (
        terminalReplay.cleanupRequired &&
        terminalReplay.mainPath &&
        terminalReplay.thumbPath
      ) {
        await deleteCanonicalObjects(admin, request, {
          mainPath: terminalReplay.mainPath,
          thumbPath: terminalReplay.thumbPath,
          versionId: request.versionId,
        });
      }
      return safeFailure(request, terminalReplay.validationCode, {
        serverTime: terminalReplay.serverTime,
      });
    }
    return rpcFailure(request, prepareResult.data);
  }

  const prepared = parseFinalizePrepare(request, prepareResult.data);
  if (!prepared) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid");
  }

  if (prepared.kind === "finalized") {
    return result(200, {
      schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
      operation: "finalize",
      operationId: request.operationId,
      idempotencyKey: request.idempotencyKey,
      payloadHash: request.payloadHash,
      ok: true,
      code: "success",
      replayed: prepared.replayed,
      serverTime: prepared.serverTime,
      status: prepared.status,
      versionId: request.versionId,
      imageUpdatedAt: prepared.imageUpdatedAt,
    });
  }

  if (prepared.kind === "validation_failed") {
    return safeFailure(request, prepared.validationCode, {
      serverTime: prepared.serverTime,
    });
  }

  const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
  const [mainDownload, thumbDownload] = await Promise.all([
    bucket.download(prepared.mainPath),
    bucket.download(prepared.thumbPath),
  ]);

  let validationCode: string | null = null;
  let verifiedMain: ReturnType<typeof verifiedMetadata> | null = null;
  let verifiedThumb: ReturnType<typeof verifiedMetadata> | null = null;
  const downloads = [mainDownload, thumbDownload];

  if (
    mainDownload.error ||
    thumbDownload.error ||
    !mainDownload.data ||
    !thumbDownload.data
  ) {
    const hasTransientOrMalformedResult = downloads.some((download) =>
      download.error
        ? !isProductImageStorageObjectMissingError(download.error)
        : !download.data,
    );
    if (hasTransientOrMalformedResult) {
      await auditNodeFailure(admin, request, meta, "storage_unavailable", {
        image_count: 2,
      });
      return safeFailure(request, "storage_unavailable");
    }
    validationCode = "storage_object_missing";
  } else {
    const [mainBuffer, thumbBuffer] = await Promise.all([
      mainDownload.data.arrayBuffer(),
      thumbDownload.data.arrayBuffer(),
    ]);
    const mainBytes = new Uint8Array(mainBuffer);
    const thumbBytes = new Uint8Array(thumbBuffer);
    const mainInspection = verifyDownloadedProductImageJpeg({
      blobMimeType: mainDownload.data.type,
      bytes: mainBytes,
      expectedBytes: prepared.expectedMain.bytes,
      expectedHeight: prepared.expectedMain.height,
      expectedSha256: prepared.expectedMain.sha256,
      expectedWidth: prepared.expectedMain.width,
      maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
      maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
    });
    const thumbInspection = verifyDownloadedProductImageJpeg({
      blobMimeType: thumbDownload.data.type,
      bytes: thumbBytes,
      expectedBytes: prepared.expectedThumb.bytes,
      expectedHeight: prepared.expectedThumb.height,
      expectedSha256: prepared.expectedThumb.sha256,
      expectedWidth: prepared.expectedThumb.width,
      maxBytes: PRODUCT_IMAGE_THUMB_MAX_BYTES,
      maxSide: PRODUCT_IMAGE_THUMB_MAX_SIDE,
    });

    if (!mainInspection.ok || !thumbInspection.ok) {
      validationCode = !mainInspection.ok
        ? mainInspection.code
        : !thumbInspection.ok
          ? thumbInspection.code
          : "validation_failed";
    } else if (
      Math.abs(
        mainInspection.width / mainInspection.height -
          thumbInspection.width / thumbInspection.height,
      ) > 0.02
    ) {
      validationCode = "jpeg_aspect_ratio_mismatch";
    } else {
      verifiedMain = verifiedMetadata(mainInspection, mainBytes);
      verifiedThumb = verifiedMetadata(thumbInspection, thumbBytes);
    }
  }

  const commitResult = await callRpc(
    admin,
    "pos_product_image_finalize_commit_v1",
    {
      ...writeRpcArgs(request),
      p_validation_code: validationCode,
      p_validation_ok: validationCode === null,
      p_verified_main: verifiedMain,
      p_verified_thumb: verifiedThumb,
      p_version_id: request.versionId,
    },
  );

  if (commitResult.error) {
    return safeFailure(
      request,
      commitResult.error.code === "42501"
        ? "permission_denied"
        : "backend_unavailable",
    );
  }

  const committed = parseFinalizeCommit(request, commitResult.data);
  if (!committed) {
    if (isRecord(commitResult.data) && commitResult.data.ok === false) {
      return rpcFailure(request, commitResult.data);
    }
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid");
  }

  if (committed.kind === "validation_failed") {
    if (
      committed.cleanupRequired &&
      committed.mainPath &&
      committed.thumbPath
    ) {
      await deleteCanonicalObjects(admin, request, {
        mainPath: committed.mainPath,
        thumbPath: committed.thumbPath,
        versionId: request.versionId,
      });
    }

    return safeFailure(request, committed.validationCode, {
      serverTime: committed.serverTime,
    });
  }

  return result(200, {
    schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
    operation: "finalize",
    operationId: request.operationId,
    idempotencyKey: request.idempotencyKey,
    payloadHash: request.payloadHash,
    ok: true,
    code: "success",
    replayed: committed.replayed,
    serverTime: committed.serverTime,
    status: committed.status,
    versionId: request.versionId,
    imageUpdatedAt: committed.imageUpdatedAt,
  });
}

function parseResolvedReadItems(
  value: unknown,
  request: TrustedPosProductImageReadUrlsRequest,
): ResolvedReadItem[] | null {
  if (!Array.isArray(value) || value.length !== request.refs.length)
    return null;

  const items: ResolvedReadItem[] = [];
  for (const [index, valueItem] of value.entries()) {
    if (!isRecord(valueItem)) return null;

    const expected = request.refs[index];
    const code = textField(valueItem, "code");
    const productId = textField(valueItem, "product_id");
    const versionId = textField(valueItem, "version_id");
    const variant = textField(valueItem, "variant");
    const objectPath = nullableTextField(valueItem, "object_path");

    if (
      !expected ||
      (code !== "success" && code !== "not_found") ||
      !productId ||
      !sameUuid(productId, expected.productId) ||
      !versionId ||
      !sameUuid(versionId, expected.versionId) ||
      (variant !== "main" && variant !== "thumb") ||
      variant !== expected.variant ||
      objectPath === undefined
    ) {
      return null;
    }

    if (code === "not_found") {
      if (objectPath !== null) return null;
      items.push({ code, productId, variant, versionId });
      continue;
    }

    const metadata = parseExpectedMetadata(
      {
        bytes: valueItem.verified_bytes,
        height: valueItem.verified_height,
        mimeType: valueItem.verified_mime_type,
        sha256: valueItem.verified_sha256,
        width: valueItem.verified_width,
      },
      variant === "main"
        ? {
            maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
            maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
          }
        : {
            maxBytes: PRODUCT_IMAGE_THUMB_MAX_BYTES,
            maxSide: PRODUCT_IMAGE_THUMB_MAX_SIDE,
          },
    );

    if (
      !objectPath ||
      !metadata ||
      !isCanonicalProductImagePath({
        path: objectPath,
        productId,
        shopId: request.shopId,
        variant,
        versionId,
      })
    ) {
      return null;
    }

    items.push({
      code,
      metadata,
      objectPath,
      productId,
      variant,
      versionId,
    });
  }

  return items;
}

function sameResolvedReadItems(
  initial: readonly ResolvedReadItem[],
  replay: readonly ResolvedReadItem[],
) {
  if (initial.length !== replay.length) return false;

  return initial.every((item, index) => {
    const replayItem = replay[index];
    if (
      !replayItem ||
      item.code !== replayItem.code ||
      item.objectPath !== replayItem.objectPath ||
      item.productId !== replayItem.productId ||
      item.variant !== replayItem.variant ||
      item.versionId !== replayItem.versionId
    ) {
      return false;
    }

    if (!item.metadata || !replayItem.metadata) {
      return item.metadata === replayItem.metadata;
    }

    return (
      item.metadata.bytes === replayItem.metadata.bytes &&
      item.metadata.height === replayItem.metadata.height &&
      item.metadata.mimeType === replayItem.metadata.mimeType &&
      item.metadata.sha256 === replayItem.metadata.sha256 &&
      item.metadata.width === replayItem.metadata.width
    );
  });
}

async function finalReadFence(
  admin: SupabaseAdminClient,
  request: TrustedPosProductImageReadUrlsRequest,
  initial: readonly ResolvedReadItem[],
) {
  const authorization = await authorizationFence(
    admin,
    request,
    "pos_product_image_read_authorize_v1",
  );
  if (authorization !== "authorized") return authorization;

  const { data, error } = await callRpc(
    admin,
    "pos_product_image_read_resolve_v1",
    {
      ...runtimeRpcArgs(request),
      p_refs: refsAsJson(request.refs),
    },
  );
  if (error) {
    return error.code === "42501"
      ? ("permission_denied" as const)
      : ("backend_unavailable" as const);
  }
  if (isRecord(data) && data.ok === false) {
    const code = textField(data, "code");
    if (code === "auth_denied" || code === "permission_denied") return code;
    return "backend_contract_invalid" as const;
  }
  if (!isRecord(data) || data.ok !== true || data.code !== "success") {
    return "backend_contract_invalid" as const;
  }

  const replay = parseResolvedReadItems(data.items, request);
  if (!canonicalTimestamp(data.server_time) || !replay) {
    return "backend_contract_invalid" as const;
  }

  return sameResolvedReadItems(initial, replay)
    ? ("authorized" as const)
    : ("stale_conflict" as const);
}

function refsAsJson(refs: readonly PosProductImageReadRef[]) {
  return refs.map((ref) => ({
    productId: ref.productId,
    variant: ref.variant,
    versionId: ref.versionId,
  }));
}

export async function handlePosProductImageReadUrls(
  request: TrustedPosProductImageReadUrlsRequest,
  meta: PosProductImageRequestMeta = {},
): Promise<PosProductImageEndpointResult> {
  const admin = resolveProductImageAdminClient();
  if (!admin) return safeFailure(request, "not_configured");
  if (request.permission !== "catalog.read") {
    return safeFailure(request, "permission_denied", { status: 403 });
  }
  if (
    request.refs.length < 1 ||
    request.refs.length > PRODUCT_IMAGE_READ_BATCH_LIMIT
  ) {
    return safeFailure(request, "validation_failed", { status: 400 });
  }

  const resolvedResult = await callRpc(
    admin,
    "pos_product_image_read_resolve_v1",
    {
      ...runtimeRpcArgs(request),
      p_refs: refsAsJson(request.refs),
    },
  );

  if (resolvedResult.error) {
    return safeFailure(
      request,
      resolvedResult.error.code === "42501"
        ? "permission_denied"
        : "backend_unavailable",
    );
  }
  if (isRecord(resolvedResult.data) && resolvedResult.data.ok === false) {
    return rpcFailure(request, resolvedResult.data);
  }
  if (
    !isRecord(resolvedResult.data) ||
    resolvedResult.data.ok !== true ||
    resolvedResult.data.code !== "success"
  ) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid");
  }

  const serverTime = canonicalTimestamp(resolvedResult.data.server_time);
  const resolved = parseResolvedReadItems(resolvedResult.data.items, request);
  if (!serverTime || !resolved) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid");
  }

  const paths = resolved.flatMap((item) =>
    item.code === "success" && item.objectPath ? [item.objectPath] : [],
  );
  const signedByPath = new Map<string, string>();
  const signedAt = Date.now();

  if (paths.length > 0) {
    const signedResult = await admin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .createSignedUrls(paths, PRODUCT_IMAGE_READ_URL_TTL_SECONDS);

    if (
      signedResult.error ||
      !signedResult.data ||
      signedResult.data.length !== paths.length
    ) {
      await auditNodeFailure(admin, request, meta, "storage_unavailable", {
        image_count: paths.length,
      });
      return safeFailure(request, "storage_unavailable", { serverTime });
    }

    for (const [index, signed] of signedResult.data.entries()) {
      const expectedPath = paths[index];
      const signedUrl = validEphemeralUrl(signed.signedUrl);
      if (!expectedPath || signed.path !== expectedPath || !signedUrl) {
        await auditNodeFailure(admin, request, meta, "storage_unavailable", {
          image_count: paths.length,
        });
        return safeFailure(request, "storage_unavailable", { serverTime });
      }
      signedByPath.set(expectedPath, signedUrl);
    }
  }

  const expiryBase = Math.min(signedAt, Date.parse(serverTime));
  const expiresAt = new Date(
    expiryBase + PRODUCT_IMAGE_READ_URL_TTL_SECONDS * 1000,
  )
    .toISOString()
    .replace("Z", "000Z");
  const items = resolved.map((item) => {
    if (item.code === "not_found") {
      return {
        productId: item.productId,
        status: "not_found",
        variant: item.variant,
        versionId: item.versionId,
      };
    }

    const signedUrl = item.objectPath
      ? signedByPath.get(item.objectPath)
      : undefined;
    return signedUrl && item.metadata
      ? {
          expiresAt,
          metadata: item.metadata,
          productId: item.productId,
          signedUrl,
          status: "ready",
          variant: item.variant,
          versionId: item.versionId,
        }
      : null;
  });

  if (items.some((item) => item === null)) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid", { serverTime });
  }

  const body = {
    schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
    operation: "read-urls",
    ok: true,
    code: "success",
    serverTime,
    cacheScope: hashedCacheScope(request),
    items,
  };
  if (
    new TextEncoder().encode(JSON.stringify(body)).byteLength >
    PRODUCT_IMAGE_READ_RESPONSE_LIMIT
  ) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid", { serverTime });
  }

  const fence = await finalReadFence(admin, request, resolved);
  if (fence !== "authorized") {
    return fenceFailure(request, fence, serverTime);
  }

  return result(200, body);
}

function parseRemoveSuccess(
  request: TrustedPosProductImageRemoveRequest,
  value: unknown,
) {
  if (!isRecord(value) || value.ok !== true || value.code !== "success") {
    return null;
  }

  const status = textField(value, "status");
  const replayed = booleanField(value, "replayed");
  const versionId = textField(value, "version_id");
  const serverTime = canonicalTimestamp(value.server_time);
  if (
    (status !== "removed" && status !== "already_removed") ||
    replayed === null ||
    !versionId ||
    !sameUuid(versionId, request.expectedCurrentVersionId) ||
    !serverTime
  ) {
    return null;
  }

  if (status === "already_removed") {
    return {
      cleanupRequired: false,
      cleanupStatus: null,
      imageUpdatedAt: null,
      mainPath: null,
      replayed,
      serverTime,
      status,
      thumbPath: null,
      versionId,
    } as const;
  }

  const cleanupRequired = booleanField(value, "cleanup_required");
  const cleanupStatus = textField(value, "cleanup_status");
  const imageUpdatedAt = canonicalTimestamp(value.image_updated_at);
  const rawMainPath = nullableTextField(value, "main_path");
  const rawThumbPath = nullableTextField(value, "thumb_path");
  const mainPath = rawMainPath ?? null;
  const thumbPath = rawThumbPath ?? null;

  if (
    cleanupRequired === null ||
    (cleanupStatus !== "complete" && cleanupStatus !== "pending") ||
    !imageUpdatedAt ||
    (cleanupRequired &&
      (rawMainPath === undefined ||
        rawThumbPath === undefined ||
        !mainPath ||
        !thumbPath ||
        !isCanonicalProductImagePath({
          path: mainPath,
          productId: request.productId,
          shopId: request.shopId,
          variant: "main",
          versionId,
        }) ||
        !isCanonicalProductImagePath({
          path: thumbPath,
          productId: request.productId,
          shopId: request.shopId,
          variant: "thumb",
          versionId,
        }))) ||
    (!cleanupRequired && (mainPath !== null || thumbPath !== null))
  ) {
    return null;
  }

  return {
    cleanupRequired,
    cleanupStatus,
    imageUpdatedAt,
    mainPath,
    replayed,
    serverTime,
    status,
    thumbPath,
    versionId,
  } as const;
}

export async function handlePosProductImageRemove(
  request: TrustedPosProductImageRemoveRequest,
  meta: PosProductImageRequestMeta = {},
): Promise<PosProductImageEndpointResult> {
  const admin = resolveProductImageAdminClient();
  if (!admin) return safeFailure(request, "not_configured");
  if (request.permission !== "catalog.write") {
    return safeFailure(request, "permission_denied", { status: 403 });
  }

  if (computePosProductImagePayloadHash(request) !== request.payloadHash) {
    await auditNodeFailure(admin, request, meta, "payload_hash_mismatch", {
      image_count: 1,
    });
    return safeFailure(request, "payload_hash_mismatch", { status: 400 });
  }

  const removeResult = await callRpc(
    admin,
    "pos_product_image_remove_v1",
    writeRpcArgs(request),
  );
  if (removeResult.error) {
    return safeFailure(
      request,
      removeResult.error.code === "42501"
        ? "permission_denied"
        : "backend_unavailable",
    );
  }
  if (isRecord(removeResult.data) && removeResult.data.ok === false) {
    return rpcFailure(request, removeResult.data);
  }

  const removed = parseRemoveSuccess(request, removeResult.data);
  if (!removed) {
    await auditNodeFailure(admin, request, meta, "backend_contract_invalid");
    return safeFailure(request, "backend_contract_invalid");
  }

  if (removed.status === "already_removed") {
    return result(200, {
      schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
      operation: "remove",
      operationId: request.operationId,
      idempotencyKey: request.idempotencyKey,
      payloadHash: request.payloadHash,
      ok: true,
      code: "success",
      replayed: removed.replayed,
      serverTime: removed.serverTime,
      shopId: request.shopId,
      productId: request.productId,
      versionId: removed.versionId,
      currentImageVersionId: null,
      status: "already_removed",
    });
  }

  let cleanupStatus = removed.cleanupStatus;
  if (removed.cleanupRequired && removed.mainPath && removed.thumbPath) {
    cleanupStatus = await deleteCanonicalObjects(admin, request, {
      mainPath: removed.mainPath,
      thumbPath: removed.thumbPath,
      versionId: removed.versionId,
    });
  }

  return result(200, {
    schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
    operation: "remove",
    operationId: request.operationId,
    idempotencyKey: request.idempotencyKey,
    payloadHash: request.payloadHash,
    ok: true,
    code: "success",
    replayed: removed.replayed,
    serverTime: removed.serverTime,
    shopId: request.shopId,
    productId: request.productId,
    versionId: removed.versionId,
    currentImageVersionId: null,
    status: "removed",
    cleanupStatus,
    imageUpdatedAt: removed.imageUpdatedAt,
  });
}
