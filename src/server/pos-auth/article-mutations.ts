import "server-only";

import { createHash } from "node:crypto";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  CATALOG_TEXT_LIMITS,
  canonicalizeCatalogDisplayText,
  validateCatalogIdentityText,
} from "@/lib/catalog-text-policy";
import { POS_ARTICLE_MUTATION_SCHEMA_VERSION } from "./pos-contract";
import { loadPosRuntimeLease, writePosRuntimeAudit } from "./runtime-boundary";
import { verifyPosSecret } from "./tokens";

export { MAX_POS_ARTICLE_MUTATION_JSON_BODY_BYTES } from "./route-envelope";
const MAX_MUTATIONS = 25;
const MAX_POS_SECRET_LENGTH = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const PAYLOAD_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PRODUCT_REVISION_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const MAX_NUMERIC_VALUE = 1_000_000_000_000;

const MUTATION_KINDS = [
  "product_create",
  "product_duplicate",
  "product_update",
  "product_activate",
  "product_deactivate",
  "product_retail_price_change",
  "product_purchase_price_change",
  "product_manual_stock_adjustment",
] as const;
const UPDATE_FIELDS = [
  "barcode",
  "categoryId",
  "itemNumber",
  "primaryName",
  "secondaryName",
  "supplierId",
] as const;
const STOCK_REASONS = [
  "count_correction",
  "damage",
  "found",
  "loss",
  "other",
  "return_to_stock",
  "transfer",
] as const;
const REQUEST_FIELDS = [
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
const MUTATION_FIELDS = [
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

type MutationKind = (typeof MUTATION_KINDS)[number];
type MutationCode =
  | "applied"
  | "duplicate_replay"
  | "failed_auth"
  | "failed_conflict"
  | "failed_validation"
  | "idempotency_payload_mismatch"
  | "identity_conflict"
  | "retryable_upstream"
  | "target_not_found";
type JsonRecord = Record<string, Json | undefined>;
type UnknownRecord = Record<string, unknown>;

type ParsedMutation = {
  attemptToken: string;
  baseRevision: string | null;
  changes: Record<string, Json>;
  clientProductId: string;
  createdAt: string;
  fieldMask: string[];
  idempotencyKey: string;
  localSequence: number;
  mutationId: string;
  mutationKind: MutationKind;
  occurredAt: string;
  payloadHash: string;
  remoteProductId: string | null;
};

type ParsedRequest = {
  appVersion: string;
  deviceToken: string;
  mutations: ParsedMutation[];
  posSessionId: string;
  schemaVersion: typeof POS_ARTICLE_MUTATION_SCHEMA_VERSION;
  sessionToken: string;
  shopDeviceId: string;
  shopId: string;
  staffCredentialVersion: number;
  staffId: string;
};

export type PosArticleMutationAck = {
  attemptToken: string;
  authoritativeRevision: string | null;
  catalogRevision: string;
  code: Exclude<MutationCode, "duplicate_replay">;
  idempotencyKey: string;
  mutationId: string;
  payloadHash: string;
  priceHistoryId: string | null;
  remoteProductId: string | null;
  retryable: boolean;
  schemaVersion: typeof POS_ARTICLE_MUTATION_SCHEMA_VERSION;
  serverTimestamp: string;
  status: Exclude<MutationCode, "duplicate_replay">;
  stockMovementId: string | null;
  terminal: boolean;
};

export type PosArticleMutationRequestMeta = {
  cfRay?: string;
  clientRequestId?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

export type PosArticleMutationEndpointResult =
  | {
      body: {
        code: "auth_denied" | "db_failure" | "not_configured" | "validation_failed";
        message: string;
        ok: false;
      };
      status: 400 | 401 | 500 | 503;
    }
  | {
      body: {
        code: "success";
        ok: boolean;
        results: Array<{
          ack: PosArticleMutationAck;
          deliveryStatus: MutationCode;
        }>;
        schemaVersion: typeof POS_ARTICLE_MUTATION_SCHEMA_VERSION;
        serverTime: string;
      };
      status: 200;
    };

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(record: UnknownRecord, key: string) {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function canonicalUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function safeId(value: unknown) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value.trim())
    ? value.trim()
    : null;
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function finiteNumber(value: unknown, options: { positive?: boolean } = {}) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_NUMERIC_VALUE ||
    (options.positive && value < 0)
  ) {
    return null;
  }

  return Number(value.toFixed(3));
}

function displayText(value: unknown, maxLength: number, required: boolean) {
  if (typeof value !== "string") return required ? null : "";
  const result = canonicalizeCatalogDisplayText(value, { maxLength, required });
  return result.status === "rejected" ? null : result.value;
}

function identityText(value: unknown, maxLength: number, required: boolean) {
  if (typeof value !== "string") return required ? null : "";
  const result = validateCatalogIdentityText(value, { maxLength, required });
  return result.status === "rejected" ? null : result.value;
}

function exactKeys(record: UnknownRecord, allowed: readonly string[]) {
  const keys = Object.keys(record);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function stableHash(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")}`;
}

function normalizeOptionalUuidChange(changes: UnknownRecord, key: string) {
  if (!(key in changes)) return { present: false as const, value: null };
  if (changes[key] === null || changes[key] === "") {
    return { present: true as const, value: null };
  }
  const value = canonicalUuid(changes[key]);
  return value
    ? { present: true as const, value }
    : { present: true as const, value: undefined };
}

function normalizeCommonProductChanges(
  input: UnknownRecord,
  allowedFields: readonly string[],
) {
  if (!Object.keys(input).every((key) => allowedFields.includes(key))) {
    return null;
  }

  const output: Record<string, Json> = {};

  if ("barcode" in input) {
    const value = identityText(input.barcode, CATALOG_TEXT_LIMITS.barcode, true);
    if (!value) return null;
    output.barcode = value;
  }
  if ("itemNumber" in input) {
    if (input.itemNumber === null || input.itemNumber === "") {
      output.itemNumber = null;
    } else {
      if (typeof input.itemNumber !== "string") return null;
      const value = identityText(
        input.itemNumber,
        CATALOG_TEXT_LIMITS.itemNumber,
        false,
      );
      if (value === null) return null;
      output.itemNumber = value || null;
    }
  }
  if ("primaryName" in input) {
    const value = displayText(
      input.primaryName,
      CATALOG_TEXT_LIMITS.productName,
      true,
    );
    if (!value) return null;
    output.primaryName = value;
  }
  if ("secondaryName" in input) {
    if (input.secondaryName === null || input.secondaryName === "") {
      output.secondaryName = null;
    } else {
      if (typeof input.secondaryName !== "string") return null;
      const value = displayText(
        input.secondaryName,
        CATALOG_TEXT_LIMITS.secondProductName,
        false,
      );
      if (value === null) return null;
      output.secondaryName = value || null;
    }
  }

  for (const key of ["categoryId", "supplierId"] as const) {
    const normalized = normalizeOptionalUuidChange(input, key);
    if (normalized.present) {
      if (normalized.value === undefined) return null;
      output[key] = normalized.value;
    }
  }

  return output;
}

function normalizeChanges(
  mutationKind: MutationKind,
  input: unknown,
  fieldMask: readonly string[],
) {
  if (!isRecord(input)) return null;

  if (mutationKind === "product_create") {
    const allowed = [
      ...UPDATE_FIELDS,
      "purchasePrice",
      "retailPrice",
      "stockQuantity",
    ];
    const output = normalizeCommonProductChanges(input, allowed);
    if (!output || !("barcode" in output) || !("primaryName" in output)) {
      return null;
    }
    for (const key of ["purchasePrice", "retailPrice", "stockQuantity"] as const) {
      if (key in input) {
        const value = finiteNumber(input[key], { positive: true });
        if (value === null) return null;
        output[key] = value;
      }
    }
    return output;
  }

  if (mutationKind === "product_duplicate") {
    const output = normalizeCommonProductChanges(input, UPDATE_FIELDS);
    return output && "barcode" in output ? output : null;
  }

  if (mutationKind === "product_update") {
    if (
      fieldMask.length === 0 ||
      Object.keys(input).length !== fieldMask.length ||
      !Object.keys(input).every((key) => fieldMask.includes(key))
    ) {
      return null;
    }
    return normalizeCommonProductChanges(input, UPDATE_FIELDS);
  }

  if (mutationKind === "product_activate" || mutationKind === "product_deactivate") {
    return Object.keys(input).length === 0 && fieldMask.length === 0 ? {} : null;
  }

  if (
    mutationKind === "product_retail_price_change" ||
    mutationKind === "product_purchase_price_change"
  ) {
    const price = finiteNumber(input.price, { positive: true });
    return exactKeys(input, ["price"]) && price !== null ? { price } : null;
  }

  const delta = finiteNumber(input.quantityDelta);
  const reason = stringField(input, "reason");
  return exactKeys(input, ["quantityDelta", "reason"]) &&
    delta !== null &&
    delta !== 0 &&
    STOCK_REASONS.includes(reason as (typeof STOCK_REASONS)[number])
    ? { quantityDelta: delta, reason }
    : null;
}

function parseMutation(input: unknown): ParsedMutation | null {
  if (!isRecord(input) || !exactKeys(input, MUTATION_FIELDS)) return null;

  const mutationKind = stringField(input, "mutationKind") as MutationKind;
  const mutationId = safeId(input.mutationId);
  const idempotencyKey = safeId(input.idempotencyKey);
  const attemptToken = safeId(input.attemptToken);
  const clientProductId = safeId(input.clientProductId);
  const payloadHash =
    typeof input.payloadHash === "string" &&
    PAYLOAD_HASH_PATTERN.test(input.payloadHash)
      ? input.payloadHash
      : null;
  const remoteProductId =
    input.remoteProductId === null || input.remoteProductId === undefined
      ? null
      : canonicalUuid(input.remoteProductId);
  const baseRevision =
    input.baseRevision === null || input.baseRevision === undefined
      ? null
      : typeof input.baseRevision === "string" &&
          PRODUCT_REVISION_PATTERN.test(input.baseRevision)
        ? input.baseRevision
        : undefined;
  const localSequence = input.localSequence;
  const createdAt = canonicalTimestamp(input.createdAt);
  const occurredAt = canonicalTimestamp(input.occurredAt);
  const rawFieldMask = input.fieldMask ?? [];
  const rawFieldMaskLength = Array.isArray(rawFieldMask)
    ? rawFieldMask.length
    : -1;
  const fieldMask =
    Array.isArray(rawFieldMask) &&
    rawFieldMask.every(
      (value): value is string =>
        typeof value === "string" &&
        UPDATE_FIELDS.includes(value as (typeof UPDATE_FIELDS)[number]),
    )
      ? [...new Set(rawFieldMask)].sort()
      : null;

  if (
    !MUTATION_KINDS.includes(mutationKind) ||
    !mutationId ||
    !idempotencyKey ||
    !attemptToken ||
    !clientProductId ||
    !payloadHash ||
    baseRevision === undefined ||
    !Number.isSafeInteger(localSequence) ||
    Number(localSequence) < 1 ||
    !createdAt ||
    !occurredAt ||
    !fieldMask ||
    fieldMask.length !== rawFieldMaskLength ||
    (mutationKind !== "product_update" && fieldMask.length !== 0) ||
    (mutationKind === "product_create"
      ? remoteProductId !== null || baseRevision !== null
      : !remoteProductId || !baseRevision)
  ) {
    return null;
  }

  const changes = normalizeChanges(mutationKind, input.changes, fieldMask);
  if (!changes) return null;

  const canonicalIdentity = {
    baseRevision,
    changes,
    clientProductId,
    createdAt,
    fieldMask,
    idempotencyKey,
    localSequence: Number(localSequence),
    mutationId,
    mutationKind,
    occurredAt,
    remoteProductId,
  };
  if (stableHash(canonicalIdentity) !== payloadHash) {
    return null;
  }

  return {
    attemptToken,
    ...canonicalIdentity,
    payloadHash,
  };
}

function parseRequest(input: unknown): ParsedRequest | null {
  if (!isRecord(input) || !exactKeys(input, REQUEST_FIELDS)) return null;

  const schemaVersion = stringField(input, "schemaVersion");
  const appVersion = identityText(input.appVersion, 80, true);
  const shopId = canonicalUuid(input.shopId);
  const shopDeviceId = canonicalUuid(input.shopDeviceId);
  const staffId = canonicalUuid(input.staffId);
  const posSessionId = canonicalUuid(input.posSessionId);
  const staffCredentialVersion = input.staffCredentialVersion;
  const deviceToken = stringField(input, "deviceToken");
  const sessionToken = stringField(input, "sessionToken");
  const rawMutations = input.mutations;

  if (
    schemaVersion !== POS_ARTICLE_MUTATION_SCHEMA_VERSION ||
    !appVersion ||
    !shopId ||
    !shopDeviceId ||
    !staffId ||
    !posSessionId ||
    !Number.isSafeInteger(staffCredentialVersion) ||
    Number(staffCredentialVersion) < 1 ||
    !deviceToken ||
    deviceToken.length > MAX_POS_SECRET_LENGTH ||
    !sessionToken ||
    sessionToken.length > MAX_POS_SECRET_LENGTH ||
    !Array.isArray(rawMutations) ||
    rawMutations.length < 1 ||
    rawMutations.length > MAX_MUTATIONS
  ) {
    return null;
  }

  const mutations = rawMutations.map(parseMutation);
  if (mutations.some((mutation) => !mutation)) return null;
  const parsedMutations = mutations as ParsedMutation[];
  const unique = (values: string[]) => new Set(values).size === values.length;

  if (
    !unique(parsedMutations.map((mutation) => mutation.mutationId)) ||
    !unique(parsedMutations.map((mutation) => mutation.idempotencyKey)) ||
    !unique(parsedMutations.map((mutation) => mutation.attemptToken)) ||
    !unique(
      parsedMutations.map(
        (mutation) => `${mutation.clientProductId}:${mutation.localSequence}`,
      ),
    )
  ) {
    return null;
  }

  return {
    appVersion,
    deviceToken,
    mutations: parsedMutations,
    posSessionId,
    schemaVersion: POS_ARTICLE_MUTATION_SCHEMA_VERSION,
    sessionToken,
    shopDeviceId,
    shopId,
    staffCredentialVersion: Number(staffCredentialVersion),
    staffId,
  };
}

function failure(
  code: "auth_denied" | "db_failure" | "not_configured" | "validation_failed",
  status: 400 | 401 | 500 | 503,
): PosArticleMutationEndpointResult {
  return {
    body: {
      code,
      message:
        code === "auth_denied"
          ? "POS article mutation authentication was denied."
          : code === "not_configured"
            ? "POS article mutation backend is not configured."
            : code === "validation_failed"
              ? "Request payload is invalid."
              : "POS article mutation request failed.",
      ok: false,
    },
    status,
  };
}

function requestMetadata(meta: PosArticleMutationRequestMeta): JsonRecord {
  return {
    ...(meta.cfRay ? { cf_ray_present: true } : {}),
    ...(meta.clientRequestId ? { client_request_id: meta.clientRequestId } : {}),
    ...(meta.requestId ? { request_id: meta.requestId } : {}),
    ...(meta.route ? { route: meta.route } : {}),
    source: "pos_article_mutation_v1",
    user_agent_length: meta.userAgent?.length ?? 0,
    user_agent_present: Boolean(meta.userAgent),
  };
}

async function auditedAuthFailure(
  supabase: SupabaseAdminClient,
  meta: PosArticleMutationRequestMeta,
  input: { shopId?: string; staffId?: string; targetId?: string },
) {
  const written = await writePosRuntimeAudit(supabase, {
    code: "failed_auth",
    eventKey: "pos.catalog.article_mutation.failure",
    metadata: requestMetadata(meta),
    result: "blocked",
    severity: "warning",
    shopId: input.shopId,
    staffId: input.staffId,
    targetId: input.targetId,
    targetType: "pos_session",
  });
  return written ? failure("auth_denied", 401) : failure("db_failure", 500);
}

function nullableUuid(value: unknown) {
  if (value === null) return null;
  return canonicalUuid(value) ?? undefined;
}

function parseAck(value: unknown): PosArticleMutationAck | null {
  if (!isRecord(value)) return null;
  const code = stringField(value, "code") as PosArticleMutationAck["code"];
  const status = stringField(value, "status") as PosArticleMutationAck["status"];
  const remoteProductId = nullableUuid(value.remoteProductId);
  const priceHistoryId = nullableUuid(value.priceHistoryId);
  const stockMovementId = nullableUuid(value.stockMovementId);
  const authoritativeRevision =
    value.authoritativeRevision === null
      ? null
      : typeof value.authoritativeRevision === "string" &&
          PRODUCT_REVISION_PATTERN.test(value.authoritativeRevision)
        ? value.authoritativeRevision
        : undefined;
  const serverTimestamp =
    typeof value.serverTimestamp === "string" &&
    PRODUCT_REVISION_PATTERN.test(value.serverTimestamp)
      ? value.serverTimestamp
      : null;
  const allowedCodes: PosArticleMutationAck["code"][] = [
    "applied",
    "failed_auth",
    "failed_conflict",
    "failed_validation",
    "idempotency_payload_mismatch",
    "identity_conflict",
    "retryable_upstream",
    "target_not_found",
  ];

  if (
    value.schemaVersion !== POS_ARTICLE_MUTATION_SCHEMA_VERSION ||
    !safeId(value.mutationId) ||
    !safeId(value.idempotencyKey) ||
    !safeId(value.attemptToken) ||
    typeof value.payloadHash !== "string" ||
    !PAYLOAD_HASH_PATTERN.test(value.payloadHash) ||
    !allowedCodes.includes(code) ||
    code !== status ||
    typeof value.terminal !== "boolean" ||
    typeof value.retryable !== "boolean" ||
    remoteProductId === undefined ||
    priceHistoryId === undefined ||
    stockMovementId === undefined ||
    authoritativeRevision === undefined ||
    typeof value.catalogRevision !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/.test(value.catalogRevision) ||
    !serverTimestamp
  ) {
    return null;
  }

  return {
    attemptToken: String(value.attemptToken),
    authoritativeRevision,
    catalogRevision: value.catalogRevision,
    code,
    idempotencyKey: String(value.idempotencyKey),
    mutationId: String(value.mutationId),
    payloadHash: value.payloadHash,
    priceHistoryId,
    remoteProductId,
    retryable: value.retryable,
    schemaVersion: POS_ARTICLE_MUTATION_SCHEMA_VERSION,
    serverTimestamp,
    status,
    stockMovementId,
    terminal: value.terminal,
  };
}

function transientAck(
  mutation: ParsedMutation,
  code: Exclude<MutationCode, "applied" | "duplicate_replay">,
  metadata: {
    catalogRevision?: unknown;
    serverTimestamp?: unknown;
  } = {},
): PosArticleMutationAck {
  const catalogRevision =
    typeof metadata.catalogRevision === "string" &&
    /^(0|[1-9][0-9]{0,18})$/.test(metadata.catalogRevision)
      ? metadata.catalogRevision
      : "0";
  const serverTimestamp =
    typeof metadata.serverTimestamp === "string" &&
    PRODUCT_REVISION_PATTERN.test(metadata.serverTimestamp)
      ? metadata.serverTimestamp
      : new Date().toISOString().replace("Z", "000Z");

  return {
    attemptToken: mutation.attemptToken,
    authoritativeRevision: null,
    catalogRevision,
    code,
    idempotencyKey: mutation.idempotencyKey,
    mutationId: mutation.mutationId,
    payloadHash: mutation.payloadHash,
    priceHistoryId: null,
    remoteProductId: mutation.remoteProductId,
    retryable: code === "retryable_upstream",
    schemaVersion: POS_ARTICLE_MUTATION_SCHEMA_VERSION,
    serverTimestamp,
    status: code,
    stockMovementId: null,
    terminal: code !== "retryable_upstream",
  };
}

export async function handlePosArticleMutations(
  input: unknown,
  meta: PosArticleMutationRequestMeta = {},
): Promise<PosArticleMutationEndpointResult> {
  const parsed = parseRequest(input);
  if (!parsed) return failure("validation_failed", 400);

  const config = resolveSupabaseAdminConfig();
  if (config.status !== "configured") return failure("not_configured", 503);
  const supabase = createSupabaseAdminClient(config);
  if (!supabase) return failure("not_configured", 503);
  const lease = await loadPosRuntimeLease(supabase, {
    posSessionId: parsed.posSessionId,
    shopDeviceId: parsed.shopDeviceId,
  });

  if (lease.status === "db_failure") return failure("db_failure", 500);
  if (lease.status === "denied") {
    return auditedAuthFailure(supabase, meta, {
      shopId: parsed.shopId,
      staffId: parsed.staffId,
      targetId: parsed.posSessionId,
    });
  }

  const { credential, session, staff } = lease;
  const authValid =
    session.shop_id.toLowerCase() === parsed.shopId &&
    session.shop_device_id.toLowerCase() === parsed.shopDeviceId &&
    session.staff_id.toLowerCase() === parsed.staffId &&
    session.staff_credential_version === parsed.staffCredentialVersion &&
    staff.credential_version === parsed.staffCredentialVersion &&
    verifyPosSecret(parsed.sessionToken, session.session_token_hash) &&
    verifyPosSecret(parsed.deviceToken, credential.token_hash);

  if (!authValid) {
    return auditedAuthFailure(supabase, meta, {
      shopId: session.shop_id,
      staffId: session.staff_id,
      targetId: session.pos_session_id,
    });
  }

  const results: Array<{
    ack: PosArticleMutationAck;
    deliveryStatus: MutationCode;
  }> = [];

  for (const mutation of parsed.mutations) {
    const { data, error } = await supabase.rpc("pos_article_mutation_apply_v1", {
      p_app_version: parsed.appVersion,
      p_expected_credential_version: parsed.staffCredentialVersion,
      p_mutation: mutation as unknown as Json,
      p_payload_hash: mutation.payloadHash,
      p_pos_session_id: parsed.posSessionId,
      p_schema_version: parsed.schemaVersion,
      p_shop_device_id: parsed.shopDeviceId,
      p_shop_id: parsed.shopId,
      p_staff_id: parsed.staffId,
    });

    if (error?.code === "42501") {
      return auditedAuthFailure(supabase, meta, {
        shopId: parsed.shopId,
        staffId: parsed.staffId,
        targetId: parsed.posSessionId,
      });
    }

    if (error || !isRecord(data)) {
      results.push({
        ack: transientAck(mutation, "retryable_upstream"),
        deliveryStatus: "retryable_upstream",
      });
      continue;
    }

    const code = stringField(data, "code") as MutationCode;
    if (code === "failed_auth") {
      return auditedAuthFailure(supabase, meta, {
        shopId: parsed.shopId,
        staffId: parsed.staffId,
        targetId: parsed.posSessionId,
      });
    }

    const ack = parseAck(data.ack);
    if (ack) {
      results.push({
        ack,
        deliveryStatus:
          code === "duplicate_replay" ? "duplicate_replay" : ack.code,
      });
      continue;
    }

    if (
      code === "failed_validation" ||
      code === "failed_conflict" ||
      code === "target_not_found" ||
      code === "idempotency_payload_mismatch" ||
      code === "identity_conflict"
    ) {
      results.push({
        ack: transientAck(mutation, code, {
          catalogRevision: data.catalogRevision,
          serverTimestamp: data.serverTimestamp,
        }),
        deliveryStatus: code,
      });
      continue;
    }

    results.push({
      ack: transientAck(mutation, "retryable_upstream"),
      deliveryStatus: "retryable_upstream",
    });
  }

  return {
    body: {
      code: "success",
      ok: results.every(
        (result) =>
          result.deliveryStatus === "applied" ||
          result.deliveryStatus === "duplicate_replay",
      ),
      results,
      schemaVersion: POS_ARTICLE_MUTATION_SCHEMA_VERSION,
      serverTime: new Date().toISOString(),
    },
    status: 200,
  };
}
