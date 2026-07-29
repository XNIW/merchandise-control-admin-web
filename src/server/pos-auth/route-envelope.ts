import "server-only";

export const MAX_POS_ARTICLE_MUTATION_JSON_BODY_BYTES = 256 * 1024;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasNonEmptyString(
  record: UnknownRecord,
  ...keys: readonly string[]
) {
  return keys.some((key) => {
    const value = record[key];

    return typeof value === "string" && value.length > 0;
  });
}

export function hasPosCatalogPullEnvelope(input: unknown) {
  return (
    isRecord(input) &&
    hasNonEmptyString(input, "deviceToken", "device_token") &&
    hasNonEmptyString(input, "posSessionId", "pos_session_id") &&
    hasNonEmptyString(input, "sessionToken", "session_token") &&
    hasNonEmptyString(input, "shopDeviceId", "shop_device_id")
  );
}

export function hasPosFirstLoginEnvelope(input: unknown) {
  if (!isRecord(input) || !isRecord(input.device)) {
    return false;
  }

  return (
    hasNonEmptyString(input, "shopCode", "shop_code") &&
    hasNonEmptyString(input, "staffCode", "staff_code") &&
    hasNonEmptyString(input, "credential", "pin", "password") &&
    hasNonEmptyString(
      input.device,
      "deviceIdentifier",
      "device_identifier",
      "fingerprint",
    )
  );
}

export function hasPosArticleMutationEnvelope(input: unknown) {
  return (
    isRecord(input) &&
    hasNonEmptyString(input, "schemaVersion") &&
    hasNonEmptyString(input, "deviceToken") &&
    hasNonEmptyString(input, "sessionToken") &&
    hasNonEmptyString(input, "shopId") &&
    hasNonEmptyString(input, "shopDeviceId") &&
    hasNonEmptyString(input, "staffId") &&
    hasNonEmptyString(input, "posSessionId") &&
    Array.isArray(input.mutations) &&
    input.mutations.length > 0
  );
}
