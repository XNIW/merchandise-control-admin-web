import "server-only";

import {
  POS_PRODUCT_IMAGE_MAIN_MAX_BYTES,
  POS_PRODUCT_IMAGE_MAIN_MAX_SIDE,
  POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION,
  POS_PRODUCT_IMAGE_READ_BATCH_LIMIT,
  POS_PRODUCT_IMAGE_SCHEMA_VERSION,
  POS_PRODUCT_IMAGE_THUMB_MAX_BYTES,
  POS_PRODUCT_IMAGE_THUMB_MAX_SIDE,
} from "./pos-contract";

export const MAX_POS_PRODUCT_IMAGE_JSON_BODY_BYTES = 16 * 1024;

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const SENSITIVE_ID_PATTERN =
  /(^|[._:-])(mcpos_(device|session)_|eyJ|bearer($|[._:-])|token($|[._:-])|secret($|[._:-])|password($|[._:-])|credential($|[._:-])|pin($|[._:-])|access[_-]?token($|[._:-])|refresh[_-]?token($|[._:-]))/i;
const PAYLOAD_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_SECRET_LENGTH = 512;
const AUTH_FIELDS = [
  "appVersion",
  "deviceToken",
  "posSessionId",
  "schemaVersion",
  "sessionToken",
  "shopDeviceId",
  "shopId",
  "staffCredentialVersion",
  "staffId",
] as const;
const INTENT_FIELDS = [
  ...AUTH_FIELDS,
  "expectedCurrentVersionId",
  "idempotencyKey",
  "main",
  "operation",
  "operationId",
  "payloadHash",
  "productId",
  "thumb",
] as const;
const FINALIZE_FIELDS = [
  ...AUTH_FIELDS,
  "expectedCurrentVersionId",
  "idempotencyKey",
  "operation",
  "operationId",
  "payloadHash",
  "productId",
  "versionId",
] as const;
const REMOVE_FIELDS = [
  ...AUTH_FIELDS,
  "expectedCurrentVersionId",
  "idempotencyKey",
  "operation",
  "operationId",
  "payloadHash",
  "productId",
] as const;
const READ_URLS_FIELDS = [...AUTH_FIELDS, "refs"] as const;
const UPLOAD_METADATA_FIELDS = [
  "bytes",
  "height",
  "mimeType",
  "sha256",
  "width",
] as const;
const READ_REF_FIELDS = ["productId", "variant", "versionId"] as const;

export type PosProductImageUploadMetadata = {
  bytes: number;
  height: number;
  mimeType: "image/jpeg";
  sha256: string;
  width: number;
};

export type PosProductImageRuntimeRequest = {
  appVersion: string;
  deviceToken: string;
  posSessionId: string;
  schemaVersion: typeof POS_PRODUCT_IMAGE_SCHEMA_VERSION;
  sessionToken: string;
  shopDeviceId: string;
  shopId: string;
  staffCredentialVersion: number;
  staffId: string;
};

type PosProductImageMutationRequest = PosProductImageRuntimeRequest & {
  expectedCurrentVersionId: string | null;
  idempotencyKey: string;
  operationId: string;
  payloadHash: string;
  productId: string;
};

export type PosProductImageIntentRequest = PosProductImageMutationRequest & {
  main: PosProductImageUploadMetadata;
  operation: "intent";
  thumb: PosProductImageUploadMetadata;
};

export type PosProductImageFinalizeRequest = PosProductImageMutationRequest & {
  operation: "finalize";
  versionId: string;
};

export type PosProductImageRemoveRequest = Omit<
  PosProductImageMutationRequest,
  "expectedCurrentVersionId"
> & {
  expectedCurrentVersionId: string;
  operation: "remove";
};

export type PosProductImageReadRef = {
  productId: string;
  variant: "main" | "thumb";
  versionId: string;
};

export type PosProductImageReadUrlsRequest = PosProductImageRuntimeRequest & {
  refs: PosProductImageReadRef[];
};

export type PosProductImageOperation =
  "finalize" | "intent" | "read-urls" | "remove";

export type PosProductImageRequest =
  | PosProductImageFinalizeRequest
  | PosProductImageIntentRequest
  | PosProductImageReadUrlsRequest
  | PosProductImageRemoveRequest;

export type PosProductImageWriteRequest =
  | PosProductImageFinalizeRequest
  | PosProductImageIntentRequest
  | PosProductImageRemoveRequest;

export type PosProductImageCanonicalWriteRequest =
  | Omit<PosProductImageFinalizeRequest, "deviceToken" | "sessionToken">
  | Omit<PosProductImageIntentRequest, "deviceToken" | "sessionToken">
  | Omit<PosProductImageRemoveRequest, "deviceToken" | "sessionToken">;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(record: UnknownRecord, allowed: readonly string[]) {
  const keys = Object.keys(record);

  return (
    keys.length === allowed.length && keys.every((key) => allowed.includes(key))
  );
}

function hasExactSafeId(value: unknown) {
  return (
    typeof value === "string" &&
    !CONTROL_PATTERN.test(value) &&
    SAFE_ID_PATTERN.test(value) &&
    !SENSITIVE_ID_PATTERN.test(value)
  );
}

function containsCredentialMaterial(value: unknown, input: UnknownRecord) {
  if (typeof value !== "string") {
    return true;
  }

  return [input.deviceToken, input.sessionToken].some(
    (credential) =>
      typeof credential !== "string" ||
      credential.length === 0 ||
      value.includes(credential),
  );
}

function hasUuid(value: unknown): value is string {
  return (
    typeof value === "string" && value.length === 36 && UUID_PATTERN.test(value)
  );
}

function hasNullableUuid(value: unknown): value is string | null {
  return value === null || hasUuid(value);
}

function hasPositiveSafeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function hasBoundedOpaque(value: unknown, maxCodePoints: number) {
  if (typeof value !== "string" || CONTROL_PATTERN.test(value)) {
    return false;
  }

  const codePointLength = Array.from(value).length;

  return codePointLength > 0 && codePointLength <= maxCodePoints;
}

function hasRuntimeShape(input: UnknownRecord) {
  return (
    input.schemaVersion === POS_PRODUCT_IMAGE_SCHEMA_VERSION &&
    hasBoundedOpaque(input.appVersion, 80) &&
    hasBoundedOpaque(input.deviceToken, MAX_SECRET_LENGTH) &&
    hasBoundedOpaque(input.sessionToken, MAX_SECRET_LENGTH) &&
    hasUuid(input.shopId) &&
    hasUuid(input.shopDeviceId) &&
    hasUuid(input.staffId) &&
    hasUuid(input.posSessionId) &&
    hasPositiveSafeInteger(input.staffCredentialVersion) &&
    Number(input.staffCredentialVersion) <=
      POS_PRODUCT_IMAGE_MAX_CREDENTIAL_VERSION
  );
}

function hasMutationShape(input: UnknownRecord) {
  return (
    hasRuntimeShape(input) &&
    hasExactSafeId(input.operationId) &&
    hasExactSafeId(input.idempotencyKey) &&
    !containsCredentialMaterial(input.operationId, input) &&
    !containsCredentialMaterial(input.idempotencyKey, input) &&
    typeof input.payloadHash === "string" &&
    input.payloadHash.length === 71 &&
    PAYLOAD_HASH_PATTERN.test(input.payloadHash) &&
    hasUuid(input.productId) &&
    hasNullableUuid(input.expectedCurrentVersionId)
  );
}

function hasUploadMetadataShape(
  input: unknown,
  limits: { maxBytes: number; maxSide: number },
): input is PosProductImageUploadMetadata {
  return (
    isRecord(input) &&
    exactKeys(input, UPLOAD_METADATA_FIELDS) &&
    hasPositiveSafeInteger(input.bytes) &&
    Number(input.bytes) <= limits.maxBytes &&
    hasPositiveSafeInteger(input.height) &&
    Number(input.height) <= limits.maxSide &&
    input.mimeType === "image/jpeg" &&
    typeof input.sha256 === "string" &&
    input.sha256.length === 64 &&
    /^[0-9a-f]{64}$/.test(input.sha256) &&
    hasPositiveSafeInteger(input.width) &&
    Number(input.width) <= limits.maxSide
  );
}

function parseReadRefs(input: unknown) {
  if (
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > POS_PRODUCT_IMAGE_READ_BATCH_LIMIT
  ) {
    return false;
  }

  const uniqueRefs = new Set<string>();

  for (const ref of input) {
    if (
      !isRecord(ref) ||
      !exactKeys(ref, READ_REF_FIELDS) ||
      !hasUuid(ref.productId) ||
      !hasUuid(ref.versionId) ||
      (ref.variant !== "main" && ref.variant !== "thumb")
    ) {
      return false;
    }

    const key = `${ref.productId.toLowerCase()}:${ref.versionId.toLowerCase()}:${ref.variant}`;

    if (uniqueRefs.has(key)) {
      return false;
    }

    uniqueRefs.add(key);
  }

  return true;
}

export function hasPosProductImageIntentEnvelope(
  input: unknown,
): input is PosProductImageIntentRequest {
  return (
    isRecord(input) &&
    exactKeys(input, INTENT_FIELDS) &&
    input.operation === "intent" &&
    hasMutationShape(input) &&
    hasUploadMetadataShape(input.main, {
      maxBytes: POS_PRODUCT_IMAGE_MAIN_MAX_BYTES,
      maxSide: POS_PRODUCT_IMAGE_MAIN_MAX_SIDE,
    }) &&
    hasUploadMetadataShape(input.thumb, {
      maxBytes: POS_PRODUCT_IMAGE_THUMB_MAX_BYTES,
      maxSide: POS_PRODUCT_IMAGE_THUMB_MAX_SIDE,
    })
  );
}

export function hasPosProductImageFinalizeEnvelope(
  input: unknown,
): input is PosProductImageFinalizeRequest {
  return (
    isRecord(input) &&
    exactKeys(input, FINALIZE_FIELDS) &&
    input.operation === "finalize" &&
    hasMutationShape(input) &&
    hasUuid(input.versionId)
  );
}

export function hasPosProductImageRemoveEnvelope(
  input: unknown,
): input is PosProductImageRemoveRequest {
  return (
    isRecord(input) &&
    exactKeys(input, REMOVE_FIELDS) &&
    input.operation === "remove" &&
    hasMutationShape(input) &&
    hasUuid(input.expectedCurrentVersionId)
  );
}

export function hasPosProductImageReadUrlsEnvelope(
  input: unknown,
): input is PosProductImageReadUrlsRequest {
  return (
    isRecord(input) &&
    exactKeys(input, READ_URLS_FIELDS) &&
    hasRuntimeShape(input) &&
    parseReadRefs(input.refs)
  );
}

function canonicalUploadMetadata(metadata: PosProductImageUploadMetadata) {
  return {
    bytes: metadata.bytes,
    height: metadata.height,
    mimeType: metadata.mimeType,
    sha256: metadata.sha256,
    width: metadata.width,
  };
}

export function canonicalPosProductImagePayloadJson(
  request: PosProductImageCanonicalWriteRequest,
) {
  const common = {
    schemaVersion: request.schemaVersion,
    operation: request.operation,
    shopId: request.shopId.toLowerCase(),
    productId: request.productId.toLowerCase(),
    expectedCurrentVersionId:
      request.expectedCurrentVersionId?.toLowerCase() ?? null,
  };

  if (request.operation === "intent") {
    return JSON.stringify({
      ...common,
      main: canonicalUploadMetadata(request.main),
      thumb: canonicalUploadMetadata(request.thumb),
    });
  }

  if (request.operation === "finalize") {
    return JSON.stringify({
      ...common,
      versionId: request.versionId.toLowerCase(),
    });
  }

  return JSON.stringify(common);
}

export function createPosProductImageErrorBody(input: {
  clientRequestId?: string;
  code: string;
  idempotencyKey?: string;
  message: string;
  operation: PosProductImageOperation;
  operationId?: string;
  payloadHash?: string;
  requestId?: string;
  retryable: boolean;
  serverTime?: string;
  terminal?: boolean;
}) {
  return {
    schemaVersion: POS_PRODUCT_IMAGE_SCHEMA_VERSION,
    operation: input.operation,
    ...(input.operationId === undefined
      ? {}
      : { operationId: input.operationId }),
    ...(input.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: input.idempotencyKey }),
    ...(input.payloadHash === undefined
      ? {}
      : { payloadHash: input.payloadHash }),
    ok: false as const,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    serverTime:
      input.serverTime ?? new Date().toISOString().replace("Z", "000Z"),
    requestId: input.requestId,
    clientRequestId: input.clientRequestId,
    ...(input.terminal === undefined ? {} : { terminal: input.terminal }),
  };
}
