import "server-only";

export const MAX_POS_ARTICLE_MUTATION_JSON_BODY_BYTES = 256 * 1024;

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHOP_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const PAYLOAD_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PRODUCT_REVISION_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const POS_ARTICLE_MUTATION_SCHEMA_VERSION = "pos-article-mutation-v1";
const MAX_CATALOG_SECRET_LENGTH = 256;
const MAX_FIRST_LOGIN_CREDENTIAL_LENGTH = 256;
const MAX_MUTATION_SECRET_LENGTH = 512;
const MAX_MUTATIONS = 25;
const ARTICLE_MUTATION_REQUEST_FIELDS = [
  "appVersion",
  "deviceToken",
  "mutations",
  "posSessionId",
  "schemaVersion",
  "sessionToken",
  "shopDeviceId",
  "shopId",
  "staffCredentialVersion",
  "staffId",
] as const;
const ARTICLE_MUTATION_FIELDS = [
  "attemptToken",
  "baseRevision",
  "changes",
  "clientProductId",
  "createdAt",
  "fieldMask",
  "idempotencyKey",
  "localSequence",
  "mutationId",
  "mutationKind",
  "occurredAt",
  "payloadHash",
  "remoteProductId",
] as const;
const ARTICLE_MUTATION_KINDS = [
  "product_create",
  "product_duplicate",
  "product_update",
  "product_activate",
  "product_deactivate",
  "product_retail_price_change",
  "product_purchase_price_change",
  "product_manual_stock_adjustment",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(
  record: UnknownRecord,
  ...keys: readonly string[]
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function exactKeys(record: UnknownRecord, allowed: readonly string[]) {
  const keys = Object.keys(record);

  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function hasBoundedSecret(value: string, maxLength: number) {
  return value.length > 0 && value.length <= maxLength;
}

function hasUuid(record: UnknownRecord, ...keys: readonly string[]) {
  return UUID_PATTERN.test(stringField(record, ...keys));
}

function hasSafeId(value: unknown) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value.trim());
}

function hasTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function hasArticleMutationShape(input: unknown) {
  if (!isRecord(input) || !exactKeys(input, ARTICLE_MUTATION_FIELDS)) {
    return false;
  }

  const mutationKind = stringField(input, "mutationKind");
  const isCreate = mutationKind === "product_create";
  const remoteProductId =
    typeof input.remoteProductId === "string" &&
    UUID_PATTERN.test(input.remoteProductId.trim());
  const baseRevision =
    typeof input.baseRevision === "string" &&
    PRODUCT_REVISION_PATTERN.test(input.baseRevision);

  return (
    ARTICLE_MUTATION_KINDS.includes(
      mutationKind as (typeof ARTICLE_MUTATION_KINDS)[number],
    ) &&
    hasSafeId(input.mutationId) &&
    hasSafeId(input.idempotencyKey) &&
    hasSafeId(input.attemptToken) &&
    hasSafeId(input.clientProductId) &&
    typeof input.payloadHash === "string" &&
    PAYLOAD_HASH_PATTERN.test(input.payloadHash) &&
    Number.isSafeInteger(input.localSequence) &&
    Number(input.localSequence) >= 1 &&
    hasTimestamp(input.createdAt) &&
    hasTimestamp(input.occurredAt) &&
    Array.isArray(input.fieldMask) &&
    input.fieldMask.every((value) => typeof value === "string") &&
    isRecord(input.changes) &&
    (isCreate
      ? input.remoteProductId === null && input.baseRevision === null
      : remoteProductId && baseRevision)
  );
}

export function hasPosCatalogPullEnvelope(input: unknown) {
  if (!isRecord(input)) {
    return false;
  }

  const deviceToken = stringField(input, "deviceToken", "device_token");
  const sessionToken = stringField(input, "sessionToken", "session_token");

  return (
    hasBoundedSecret(deviceToken, MAX_CATALOG_SECRET_LENGTH) &&
    hasBoundedSecret(sessionToken, MAX_CATALOG_SECRET_LENGTH) &&
    hasUuid(input, "posSessionId", "pos_session_id") &&
    hasUuid(input, "shopDeviceId", "shop_device_id")
  );
}

export function hasPosFirstLoginEnvelope(input: unknown) {
  if (!isRecord(input) || !isRecord(input.device)) {
    return false;
  }

  const shopCode = stringField(input, "shopCode", "shop_code")
    .trim()
    .toUpperCase();
  const staffCode = stringField(input, "staffCode", "staff_code")
    .trim()
    .toUpperCase();
  const credential = stringField(input, "credential", "pin", "password");
  const deviceIdentifier = stringField(
    input.device,
    "deviceIdentifier",
    "device_identifier",
    "fingerprint",
  )
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);

  return (
    SHOP_CODE_PATTERN.test(shopCode) &&
    STAFF_CODE_PATTERN.test(staffCode) &&
    hasBoundedSecret(credential, MAX_FIRST_LOGIN_CREDENTIAL_LENGTH) &&
    deviceIdentifier.length > 0
  );
}

export function hasPosArticleMutationEnvelope(input: unknown) {
  if (
    !isRecord(input) ||
    !exactKeys(input, ARTICLE_MUTATION_REQUEST_FIELDS)
  ) {
    return false;
  }

  const appVersion = stringField(input, "appVersion").trim();
  const deviceToken = stringField(input, "deviceToken").trim();
  const sessionToken = stringField(input, "sessionToken").trim();

  return (
    stringField(input, "schemaVersion") ===
      POS_ARTICLE_MUTATION_SCHEMA_VERSION &&
    appVersion.length > 0 &&
    appVersion.length <= 80 &&
    hasBoundedSecret(deviceToken, MAX_MUTATION_SECRET_LENGTH) &&
    hasBoundedSecret(sessionToken, MAX_MUTATION_SECRET_LENGTH) &&
    hasUuid(input, "shopId") &&
    hasUuid(input, "shopDeviceId") &&
    hasUuid(input, "staffId") &&
    hasUuid(input, "posSessionId") &&
    Number.isSafeInteger(input.staffCredentialVersion) &&
    Number(input.staffCredentialVersion) >= 1 &&
    Array.isArray(input.mutations) &&
    input.mutations.length > 0 &&
    input.mutations.length <= MAX_MUTATIONS &&
    input.mutations.every(hasArticleMutationShape)
  );
}
