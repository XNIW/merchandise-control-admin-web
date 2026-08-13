import "server-only";

import {
  CATALOG_TEXT_LIMITS,
  canonicalizeCatalogDisplayText,
  validateCatalogIdentityText,
} from "@/lib/catalog-text-policy";
import { resolveSupabaseAdminConfig } from "@/lib/supabase/admin";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import { resolveWeChatMiniSession } from "@/server/auth/wechat-mini-session";

export const WECHAT_CATALOG_MUTATION_BODY_LIMIT = 16 * 1024;
const GATEWAY_TIMEOUT_MS = 8_000;
const RPC_RESPONSE_LIMIT = 64 * 1024;
const RPC_TIMEOUT_MS = 6_000;
const MAX_CATALOG_NUMBER = 1_000_000_000_000;
const MAX_CATALOG_PRICE = 999_999_999_999.999;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DISPLAY_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export const WECHAT_CATALOG_MUTATION_OPERATIONS = [
  "product_create",
  "product_update",
  "product_archive",
  "product_restore",
  "product_price_update",
  "category_create",
  "category_update",
  "category_archive",
  "category_restore",
  "supplier_create",
  "supplier_update",
  "supplier_archive",
  "supplier_restore",
] as const;

export type WeChatCatalogMutationOperation =
  (typeof WECHAT_CATALOG_MUTATION_OPERATIONS)[number];

export type WeChatCatalogMutationInput = {
  expectedUpdatedAt: string | null;
  operation: WeChatCatalogMutationOperation;
  payload: Record<string, unknown>;
  schemaVersion: 1;
  shopId: string;
  targetId: string | null;
};

export type WeChatCatalogMutationGatewayResult = {
  body: Record<string, unknown>;
  status: number;
};

type RpcResult = {
  code: string;
  correlationId: string;
  ok: boolean;
  replayed: boolean;
  shopId: string;
  targetId?: string;
  updatedAt?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function decimalPlaces(value: number) {
  const [coefficient = "", exponentText] = value.toString().toLowerCase().split("e");
  const decimalIndex = coefficient.indexOf(".");
  const coefficientPlaces =
    decimalIndex < 0 ? 0 : coefficient.length - decimalIndex - 1;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  return Math.max(0, coefficientPlaces - exponent);
}

function isCatalogNumber(value: unknown, enforceScale = false): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= (enforceScale ? MAX_CATALOG_PRICE : MAX_CATALOG_NUMBER) &&
    (!enforceScale || decimalPlaces(value) <= 3)
  );
}

function strictText(value: unknown, maxLength: number, required: boolean) {
  if (typeof value !== "string") return null;
  const result = validateCatalogIdentityText(value, { maxLength, required });
  return result.status === "rejected" ? null : result.value;
}

function displayText(value: unknown, maxLength: number, required: boolean) {
  if (typeof value !== "string" || DISPLAY_CONTROL_PATTERN.test(value)) {
    return null;
  }
  const result = canonicalizeCatalogDisplayText(value, { maxLength, required });
  return result.status === "rejected" ? null : result.value;
}

function optionalNullableText(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
  kind: "display" | "strict",
) {
  if (!Object.hasOwn(payload, key)) return true;
  if (payload[key] === null) return true;
  const parsed =
    kind === "display"
      ? displayText(payload[key], maxLength, false)
      : strictText(payload[key], maxLength, false);
  return parsed !== null;
}

function optionalNullableUuid(payload: Record<string, unknown>, key: string) {
  return (
    !Object.hasOwn(payload, key) ||
    payload[key] === null ||
    isUuid(payload[key])
  );
}

function optionalNullableNumber(
  payload: Record<string, unknown>,
  key: string,
  enforceScale = false,
) {
  return (
    !Object.hasOwn(payload, key) ||
    payload[key] === null ||
    isCatalogNumber(payload[key], enforceScale)
  );
}

const PRODUCT_CREATE_KEYS = [
  "barcode",
  "itemNumber",
  "productName",
  "secondProductName",
  "purchasePrice",
  "retailPrice",
  "stockQuantity",
  "categoryId",
  "supplierId",
] as const;

const PRODUCT_UPDATE_KEYS = PRODUCT_CREATE_KEYS.filter(
  (key) => key !== "purchasePrice" && key !== "retailPrice",
);

function validProductPayload(
  payload: Record<string, unknown>,
  operation: "product_create" | "product_update",
) {
  const allowedKeys =
    operation === "product_create" ? PRODUCT_CREATE_KEYS : PRODUCT_UPDATE_KEYS;
  if (!hasExactKeys(payload, ["barcode", "productName"], allowedKeys)) {
    return false;
  }
  if (
    strictText(payload.barcode, CATALOG_TEXT_LIMITS.barcode, true) === null
  ) {
    return false;
  }
  if (
    displayText(payload.productName, CATALOG_TEXT_LIMITS.productName, true) === null
  ) {
    return false;
  }
  return (
    optionalNullableText(
      payload,
      "itemNumber",
      CATALOG_TEXT_LIMITS.itemNumber,
      "strict",
    ) &&
    optionalNullableText(
      payload,
      "secondProductName",
      CATALOG_TEXT_LIMITS.secondProductName,
      "display",
    ) &&
    optionalNullableNumber(payload, "purchasePrice", true) &&
    optionalNullableNumber(payload, "retailPrice", true) &&
    optionalNullableNumber(payload, "stockQuantity") &&
    optionalNullableUuid(payload, "categoryId") &&
    optionalNullableUuid(payload, "supplierId")
  );
}

function validPayload(
  operation: WeChatCatalogMutationOperation,
  payload: Record<string, unknown>,
) {
  if (operation === "product_create" || operation === "product_update") {
    return validProductPayload(payload, operation);
  }
  if (operation === "product_price_update") {
    return (
      hasExactKeys(payload, ["priceType", "price"]) &&
      (payload.priceType === "PURCHASE" || payload.priceType === "RETAIL") &&
      isCatalogNumber(payload.price, true)
    );
  }
  if (
    operation === "category_create" ||
    operation === "category_update" ||
    operation === "supplier_create" ||
    operation === "supplier_update"
  ) {
    const maxLength = operation.startsWith("category_")
      ? CATALOG_TEXT_LIMITS.categoryName
      : CATALOG_TEXT_LIMITS.supplierName;
    return (
      hasExactKeys(payload, ["name"]) &&
      displayText(payload.name, maxLength, true) !== null
    );
  }
  if (operation === "category_archive" || operation === "supplier_archive") {
    return (
      hasExactKeys(payload, ["reason"], ["replacementId"]) &&
      displayText(payload.reason, 240, true) !== null &&
      optionalNullableUuid(payload, "replacementId")
    );
  }
  return (
    hasExactKeys(payload, ["reason"]) &&
    displayText(payload.reason, 240, true) !== null
  );
}

function isCreateOperation(operation: WeChatCatalogMutationOperation) {
  return (
    operation === "product_create" ||
    operation === "category_create" ||
    operation === "supplier_create"
  );
}

export function parseWeChatCatalogMutationInput(
  value: unknown,
): WeChatCatalogMutationInput | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null;
  if (
    !hasExactKeys(
      value,
      ["schemaVersion", "shopId", "operation", "payload"],
      ["targetId", "expectedUpdatedAt"],
    ) ||
    !isUuid(value.shopId) ||
    typeof value.operation !== "string" ||
    !WECHAT_CATALOG_MUTATION_OPERATIONS.includes(
      value.operation as WeChatCatalogMutationOperation,
    ) ||
    !isObject(value.payload)
  ) {
    return null;
  }

  const operation = value.operation as WeChatCatalogMutationOperation;
  const create = isCreateOperation(operation);
  if (
    (create &&
      (Object.hasOwn(value, "expectedUpdatedAt") ||
        (Object.hasOwn(value, "targetId") && !isUuid(value.targetId)))) ||
    (!create && (!isUuid(value.targetId) || !isTimestamp(value.expectedUpdatedAt))) ||
    !validPayload(operation, value.payload)
  ) {
    return null;
  }
  if (
    (operation === "category_archive" || operation === "supplier_archive") &&
    value.payload.replacementId === value.targetId
  ) {
    return null;
  }

  return {
    expectedUpdatedAt: create ? null : (value.expectedUpdatedAt as string),
    operation,
    payload: value.payload,
    schemaVersion: 1,
    shopId: value.shopId,
    targetId: create
      ? Object.hasOwn(value, "targetId")
        ? (value.targetId as string)
        : null
      : (value.targetId as string),
  };
}

export function parseWeChatMutationHeaders(headers: Headers) {
  const idempotencyKey = headers.get("idempotency-key")?.trim();
  const correlationId = headers.get("x-correlation-id")?.trim();
  return isUuid(idempotencyKey) && isUuid(correlationId)
    ? { correlationId, idempotencyKey }
    : null;
}

export function isMiniProgramCatalogMutationEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED === "true";
}

export function isMiniProgramCatalogMutationReady(
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    isMiniProgramCatalogMutationEnabled(env) &&
    isWeChatSurfaceReady("mini_program", resolveWeChatRuntimeConfig(env))
  );
}

async function readBoundedResponse(response: Response) {
  const bytes = await readBoundedBytes(response, RPC_RESPONSE_LIMIT);
  if (!bytes) return null;
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return null;
  }
}

async function readBoundedBytes(response: Response, limit: number) {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > limit
    ) {
      await response.body?.cancel();
      return null;
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const FAILURE_CODE_MAP: Record<string, { code: string; status: number }> = {
  conflict: { code: "conflict", status: 409 },
  db_failure: { code: "retryable_error", status: 503 },
  duplicate_barcode: { code: "duplicate_barcode", status: 409 },
  entity_not_found: { code: "entity_not_found", status: 404 },
  idempotency_conflict: { code: "idempotency_conflict", status: 409 },
  invalid_category: { code: "invalid_category", status: 400 },
  invalid_operation: { code: "invalid_operation", status: 400 },
  invalid_price: { code: "invalid_price", status: 400 },
  invalid_state: { code: "invalid_state", status: 409 },
  invalid_state_or_not_found: { code: "invalid_state", status: 409 },
  invalid_supplier: { code: "invalid_supplier", status: 400 },
  membership_missing: { code: "membership_missing", status: 403 },
  not_found: { code: "entity_not_found", status: 404 },
  permission_denied: { code: "permission_denied", status: 403 },
  profile_suspended: { code: "profile_suspended", status: 403 },
  price_update_required: { code: "invalid_price", status: 409 },
  rate_limited: { code: "rate_limited", status: 429 },
  replacement_required: { code: "invalid_state", status: 409 },
  retryable_error: { code: "retryable_error", status: 503 },
  shop_suspended: { code: "shop_suspended", status: 403 },
  stale_revision: { code: "stale_version", status: 409 },
  stale_version: { code: "stale_version", status: 409 },
  unauthenticated: { code: "unauthenticated", status: 401 },
  unauthorized_or_unmapped: { code: "permission_denied", status: 403 },
  validation_failed: { code: "validation_failed", status: 400 },
};

function parseRpcResult(
  value: unknown,
  input: WeChatCatalogMutationInput,
  correlationId: string,
): RpcResult | null {
  if (!isObject(value)) return null;
  if (
    !hasExactKeys(
      value,
      [
        "ok",
        "code",
        "shop_id",
        "target_id",
        "updated_at",
        "correlation_id",
        "replayed",
        "payload",
      ],
      ["audit_event_id", "retry_after_seconds"],
    )
  ) {
    return null;
  }
  if (
    typeof value.ok !== "boolean" ||
    typeof value.code !== "string" ||
    value.shop_id !== input.shopId ||
    value.correlation_id !== correlationId ||
    typeof value.replayed !== "boolean" ||
    !isObject(value.payload)
  ) {
    return null;
  }
  if (
    value.target_id !== undefined &&
    value.target_id !== null &&
    !isUuid(value.target_id)
  ) {
    return null;
  }
  if (
    input.targetId !== null &&
    value.target_id !== undefined &&
    value.target_id !== input.targetId
  ) {
    return null;
  }
  if (
    value.updated_at !== undefined &&
    value.updated_at !== null &&
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }
  if (
    value.audit_event_id !== undefined &&
    value.audit_event_id !== null &&
    !isUuid(value.audit_event_id)
  ) {
    return null;
  }
  if (
    value.retry_after_seconds !== undefined &&
    (!Number.isSafeInteger(value.retry_after_seconds) ||
      (value.retry_after_seconds as number) < 1 ||
      (value.retry_after_seconds as number) > 86_400)
  ) {
    return null;
  }
  return {
    code: value.code,
    correlationId,
    ok: value.ok,
    replayed: value.replayed,
    shopId: value.shop_id,
    targetId: value.target_id ?? undefined,
    updatedAt: value.updated_at ?? undefined,
  };
}

function failure(code: string, status: number): WeChatCatalogMutationGatewayResult {
  return { body: { code, ok: false }, status };
}

function remainingTimeout(startedAt: number, cap: number) {
  return Math.min(cap, GATEWAY_TIMEOUT_MS - (Date.now() - startedAt));
}

export async function callWeChatCatalogMutation(input: {
  authorization: string | null;
  correlationId: string;
  deviceId: string | null;
  idempotencyKey: string;
  mutation: WeChatCatalogMutationInput;
}): Promise<WeChatCatalogMutationGatewayResult> {
  const startedAt = Date.now();
  const adminConfig = resolveSupabaseAdminConfig();
  if (adminConfig.status !== "configured") {
    return failure("retryable_error", 503);
  }
  const actor = await resolveWeChatMiniSession({
    authorization: input.authorization,
    config: resolveWeChatRuntimeConfig(),
    deviceId: input.deviceId,
  });
  if (!actor.ok) {
    return failure(
      actor.code === "session_expired" ? "session_expired" : "retryable_error",
      actor.code === "session_expired" ? 401 : 503,
    );
  }

  const rpcTimeout = remainingTimeout(startedAt, RPC_TIMEOUT_MS);
  if (rpcTimeout <= 0) return failure("retryable_error", 503);

  let response: Response;
  try {
    response = await fetch(
      new URL("/rest/v1/rpc/wechat_catalog_mutate_v1", adminConfig.url),
      {
        body: JSON.stringify({
          p_actor_profile_id: actor.actorProfileId,
          p_correlation_id: input.correlationId,
          p_expected_updated_at: input.mutation.expectedUpdatedAt,
          p_idempotency_key: input.idempotencyKey,
          p_operation: input.mutation.operation,
          p_payload: input.mutation.payload,
          p_shop_id: input.mutation.shopId,
          p_target_id: input.mutation.targetId,
        }),
        cache: "no-store",
        headers: {
          Accept: "application/json",
          apikey: adminConfig.serviceRoleKey,
          Authorization: `Bearer ${adminConfig.serviceRoleKey}`,
          "Content-Type": "application/json",
          "X-Client-Info": "merchandise-control/wechat-catalog-mutation-v1",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(rpcTimeout),
      },
    );
  } catch {
    return failure("retryable_error", 503);
  }

  if (!response.ok) return failure("retryable_error", 503);

  const rpc = parseRpcResult(
    await readBoundedResponse(response),
    input.mutation,
    input.correlationId,
  );
  if (!rpc) return failure("retryable_error", 503);
  if (!rpc.ok) {
    const mapped = FAILURE_CODE_MAP[rpc.code];
    return mapped
      ? failure(mapped.code, mapped.status)
      : failure("retryable_error", 503);
  }
  if (
    rpc.code !== "success" ||
    !rpc.targetId ||
    !rpc.updatedAt ||
    (input.mutation.targetId !== null && rpc.targetId !== input.mutation.targetId)
  ) {
    return failure("retryable_error", 503);
  }

  return {
    body: {
      mutation: {
        code: "success",
        correlationId: rpc.correlationId,
        replayed: rpc.replayed,
        shopId: rpc.shopId,
        targetId: rpc.targetId,
        updatedAt: rpc.updatedAt,
      },
      ok: true,
    },
    status: 200,
  };
}
