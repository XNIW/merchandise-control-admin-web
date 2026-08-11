import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import { loadPosRuntimeLease, writePosRuntimeAudit } from "./runtime-boundary";
import { verifyPosSecret } from "./tokens";

export const POS_CUSTOMER_ORDER_HANDOFF_SCHEMA_VERSION =
  "pos-customer-order-handoff-v1" as const;
export const POS_CUSTOMER_ORDER_ACK_SCHEMA_VERSION =
  "pos-customer-order-ack-v1" as const;
export const MAX_POS_CUSTOMER_ORDER_JSON_BODY_BYTES = 16 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "addressLine1",
  "customerAddress",
  "customerEmail",
  "deviceToken",
  "ownerUserId",
  "sessionToken",
  "sourceProductId",
  "storagePath",
]);
const HANDOFF_KEYS = new Set([
  "attemptCount",
  "correlationId",
  "eventIdempotencyKey",
  "eventType",
  "handoffId",
  "leaseExpiresAt",
  "leaseToken",
  "order",
  "schemaVersion",
]);
const ORDER_KEYS = new Set([
  "currencyCode",
  "currentStatusVersion",
  "deliveryFeeClp",
  "documentKind",
  "fiscalStatus",
  "fulfillment",
  "fulfillmentMode",
  "items",
  "orderCode",
  "orderId",
  "placedAt",
  "shopId",
  "status",
  "statusVersion",
  "subtotalClp",
  "totalClp",
  "updatedAt",
]);
const ITEM_KEYS = new Set([
  "linePosition",
  "lineTotalClp",
  "publicName",
  "quantity",
  "unitPriceClp",
]);
const FULFILLMENT_KEYS = new Set([
  "deliveryZone",
  "mode",
  "pickupPoint",
  "slot",
]);
const PICKUP_KEYS = new Set(["commune", "publicName", "region"]);
const DELIVERY_ZONE_KEYS = new Set(["feeClp", "name", "region"]);
const SLOT_KEYS = new Set(["endsAt", "label", "startsAt"]);
const ORDER_STATUSES = new Set([
  "accepted",
  "cancelled",
  "completed",
  "out_for_delivery",
  "preparing",
  "ready",
  "rejected",
]);
const FULFILLMENT_MODES = new Set(["delivery", "pickup", "reservation"]);
const EVENT_TYPES = new Set(
  [...ORDER_STATUSES].map((status) => `customer_order.${status}.v1`),
);
const ACK_OUTCOMES = new Set(["accepted", "completed", "prepared", "rejected"]);

type JsonRecord = Record<string, unknown>;

type ParsedRuntimeRequest = {
  appVersion?: string;
  deviceToken: string;
  posSessionId: string;
  sessionToken: string;
  shopDeviceId: string;
};

type ParsedClaimRequest = ParsedRuntimeRequest & {
  limit: number;
  schemaVersion: typeof POS_CUSTOMER_ORDER_HANDOFF_SCHEMA_VERSION;
};

type ParsedAckRequest = ParsedRuntimeRequest & {
  expectedStatusVersion: number;
  handoffId: string;
  idempotencyKey: string;
  leaseToken: string;
  outcome: "accepted" | "completed" | "prepared" | "rejected";
  posSaleId: string | null;
  schemaVersion: typeof POS_CUSTOMER_ORDER_ACK_SCHEMA_VERSION;
};

type PosOrderFailureCode =
  | "conflict"
  | "db_failure"
  | "denied"
  | "idempotency_conflict"
  | "invalid_state"
  | "lease_conflict"
  | "not_configured"
  | "not_found"
  | "validation_failed"
  | "version_conflict";

type PosOrderEndpointResult = {
  body: unknown;
  status: 200 | 400 | 401 | 404 | 409 | 500 | 503;
};

export type PosCustomerOrderRequestMeta = {
  clientRequestId?: string;
  requestId?: string;
  route?: string;
  userAgent?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(record: JsonRecord, allowed: ReadonlySet<string>) {
  return Object.keys(record).every((key) => allowed.has(key));
}

function requiredString(record: JsonRecord, key: string) {
  return typeof record[key] === "string" ? record[key] : "";
}

function requiredInteger(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function validUuid(value: string) {
  return UUID_PATTERN.test(value) && value === value.toLowerCase();
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function futureTimestamp(value: string) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds > Date.now();
}

function validBoundedString(value: unknown, maxLength: number) {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001F\u007F]/u.test(value)
  );
}

function parseRuntimeFields(input: JsonRecord): ParsedRuntimeRequest | null {
  const appVersion = input.appVersion;
  const deviceToken = requiredString(input, "deviceToken");
  const posSessionId = requiredString(input, "posSessionId").toLowerCase();
  const sessionToken = requiredString(input, "sessionToken");
  const shopDeviceId = requiredString(input, "shopDeviceId").toLowerCase();

  if (
    !validUuid(posSessionId) ||
    !validUuid(shopDeviceId) ||
    !deviceToken ||
    deviceToken.length > 256 ||
    !sessionToken ||
    sessionToken.length > 256 ||
    (appVersion !== undefined &&
      (typeof appVersion !== "string" || !SAFE_VERSION_PATTERN.test(appVersion)))
  ) {
    return null;
  }

  return {
    ...(typeof appVersion === "string" ? { appVersion } : {}),
    deviceToken,
    posSessionId,
    sessionToken,
    shopDeviceId,
  };
}

function parseClaimRequest(input: unknown): ParsedClaimRequest | null {
  if (!isRecord(input)) return null;
  const allowedKeys = new Set([
    "appVersion",
    "deviceToken",
    "limit",
    "posSessionId",
    "schemaVersion",
    "sessionToken",
    "shopDeviceId",
  ]);
  const runtime = parseRuntimeFields(input);
  const limit = input.limit === undefined ? 10 : requiredInteger(input, "limit");

  if (
    !exactKeys(input, allowedKeys) ||
    !runtime ||
    input.schemaVersion !== POS_CUSTOMER_ORDER_HANDOFF_SCHEMA_VERSION ||
    limit === null ||
    limit < 1 ||
    limit > 25
  ) {
    return null;
  }

  return {
    ...runtime,
    limit,
    schemaVersion: POS_CUSTOMER_ORDER_HANDOFF_SCHEMA_VERSION,
  };
}

function parseAckRequest(input: unknown): ParsedAckRequest | null {
  if (!isRecord(input)) return null;
  const allowedKeys = new Set([
    "appVersion",
    "deviceToken",
    "expectedStatusVersion",
    "handoffId",
    "idempotencyKey",
    "leaseToken",
    "outcome",
    "posSaleId",
    "posSessionId",
    "schemaVersion",
    "sessionToken",
    "shopDeviceId",
  ]);
  const runtime = parseRuntimeFields(input);
  const expectedStatusVersion = requiredInteger(input, "expectedStatusVersion");
  const handoffId = requiredString(input, "handoffId").toLowerCase();
  const idempotencyKey = requiredString(input, "idempotencyKey").toLowerCase();
  const leaseToken = requiredString(input, "leaseToken").toLowerCase();
  const outcome = requiredString(input, "outcome");
  const posSaleId = input.posSaleId;

  if (
    !exactKeys(input, allowedKeys) ||
    !runtime ||
    input.schemaVersion !== POS_CUSTOMER_ORDER_ACK_SCHEMA_VERSION ||
    expectedStatusVersion === null ||
    expectedStatusVersion < 1 ||
    !validUuid(handoffId) ||
    !validUuid(idempotencyKey) ||
    !validUuid(leaseToken) ||
    !ACK_OUTCOMES.has(outcome) ||
    (posSaleId !== undefined &&
      posSaleId !== null &&
      (typeof posSaleId !== "string" || !validUuid(posSaleId.toLowerCase()))) ||
    (outcome !== "completed" && posSaleId !== undefined && posSaleId !== null)
  ) {
    return null;
  }

  return {
    ...runtime,
    expectedStatusVersion,
    handoffId,
    idempotencyKey,
    leaseToken,
    outcome: outcome as ParsedAckRequest["outcome"],
    posSaleId: typeof posSaleId === "string" ? posSaleId.toLowerCase() : null,
    schemaVersion: POS_CUSTOMER_ORDER_ACK_SCHEMA_VERSION,
  };
}

function validOptionalObject(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  requiredStringKeys: readonly string[],
) {
  if (value === undefined) return true;
  if (!isRecord(value) || !exactKeys(value, allowedKeys)) return false;
  return requiredStringKeys.every(
    (key) => value[key] === undefined || validBoundedString(value[key], 200),
  );
}

function validFulfillment(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, FULFILLMENT_KEYS)) return false;
  if (!FULFILLMENT_MODES.has(requiredString(value, "mode"))) return false;
  if (
    !validOptionalObject(value.pickupPoint, PICKUP_KEYS, [
      "commune",
      "publicName",
      "region",
    ]) ||
    !validOptionalObject(value.deliveryZone, DELIVERY_ZONE_KEYS, ["name", "region"]) ||
    !validOptionalObject(value.slot, SLOT_KEYS, ["label", "startsAt", "endsAt"])
  ) {
    return false;
  }
  if (isRecord(value.deliveryZone)) {
    const fee = value.deliveryZone.feeClp;
    if (
      fee !== undefined &&
      (typeof fee !== "number" || !Number.isSafeInteger(fee) || fee < 0)
    ) {
      return false;
    }
  }
  return true;
}

function validItem(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ITEM_KEYS)) return false;
  const linePosition = requiredInteger(value, "linePosition");
  const quantity = requiredInteger(value, "quantity");
  const unitPrice = requiredInteger(value, "unitPriceClp");
  const lineTotal = requiredInteger(value, "lineTotalClp");
  return Boolean(
    linePosition !== null &&
      linePosition >= 1 &&
      linePosition <= 100 &&
      quantity !== null &&
      quantity >= 1 &&
      quantity <= 99 &&
      unitPrice !== null &&
      unitPrice >= 0 &&
      lineTotal !== null &&
      lineTotal === unitPrice * quantity &&
      validBoundedString(value.publicName, 200),
  );
}

function validOrder(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, ORDER_KEYS)) return false;
  const statusVersion = requiredInteger(value, "statusVersion");
  const currentStatusVersion = requiredInteger(value, "currentStatusVersion");
  const subtotal = requiredInteger(value, "subtotalClp");
  const fee = requiredInteger(value, "deliveryFeeClp");
  const total = requiredInteger(value, "totalClp");
  return Boolean(
    value.documentKind === "customer_order" &&
      value.fiscalStatus === "not_created" &&
      validUuid(requiredString(value, "orderId")) &&
      validUuid(requiredString(value, "shopId")) &&
      /^MC-[0-9A-F]{20}$/.test(requiredString(value, "orderCode")) &&
      ORDER_STATUSES.has(requiredString(value, "status")) &&
      FULFILLMENT_MODES.has(requiredString(value, "fulfillmentMode")) &&
      value.currencyCode === "CLP" &&
      statusVersion !== null &&
      statusVersion >= 1 &&
      currentStatusVersion !== null &&
      currentStatusVersion >= statusVersion &&
      subtotal !== null &&
      subtotal >= 0 &&
      fee !== null &&
      fee >= 0 &&
      total !== null &&
      total === subtotal + fee &&
      Array.isArray(value.items) &&
      value.items.length >= 1 &&
      value.items.length <= 100 &&
      value.items.every(validItem) &&
      validFulfillment(value.fulfillment) &&
      validTimestamp(value.placedAt) &&
      validTimestamp(value.updatedAt),
  );
}

function validHandoff(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, HANDOFF_KEYS)) return false;
  const attemptCount = requiredInteger(value, "attemptCount");
  return Boolean(
    value.schemaVersion === POS_CUSTOMER_ORDER_HANDOFF_SCHEMA_VERSION &&
      validUuid(requiredString(value, "handoffId")) &&
      validUuid(requiredString(value, "leaseToken")) &&
      validTimestamp(value.leaseExpiresAt) &&
      futureTimestamp(requiredString(value, "leaseExpiresAt")) &&
      attemptCount !== null &&
      attemptCount >= 1 &&
      attemptCount <= 1000 &&
      EVENT_TYPES.has(requiredString(value, "eventType")) &&
      validUuid(requiredString(value, "eventIdempotencyKey")) &&
      validBoundedString(value.correlationId, 160) &&
      validOrder(value.order),
  );
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => FORBIDDEN_PAYLOAD_KEYS.has(key) || containsForbiddenKey(child),
  );
}

function parseClaimRpcResponse(input: unknown, limit: number) {
  if (
    !isRecord(input) ||
    input.ok !== true ||
    input.code !== "success" ||
    input.schemaVersion !== POS_CUSTOMER_ORDER_HANDOFF_SCHEMA_VERSION ||
    !validTimestamp(input.serverTime) ||
    !Array.isArray(input.handoffs) ||
    input.handoffs.length > limit ||
    !input.handoffs.every(validHandoff) ||
    containsForbiddenKey(input)
  ) {
    return null;
  }
  return input;
}

function parseAckRpcResponse(input: unknown, expected: ParsedAckRequest) {
  if (
    !isRecord(input) ||
    input.ok !== true ||
    input.code !== "success" ||
    input.schemaVersion !== POS_CUSTOMER_ORDER_ACK_SCHEMA_VERSION ||
    input.handoffId !== expected.handoffId ||
    input.outcome !== expected.outcome ||
    !validUuid(requiredString(input, "orderId")) ||
    !ORDER_STATUSES.has(requiredString(input, "orderStatus")) ||
    !Number.isSafeInteger(input.orderStatusVersion) ||
    (input.orderStatusVersion as number) < expected.expectedStatusVersion ||
    (input.fiscalStatus !== "not_created" && input.fiscalStatus !== "linked") ||
    (input.fiscalStatus === "linked" && input.posSaleId !== expected.posSaleId) ||
    (input.posSaleId !== undefined &&
      input.posSaleId !== null &&
      (typeof input.posSaleId !== "string" || !validUuid(input.posSaleId))) ||
    typeof input.idempotent !== "boolean" ||
    !validTimestamp(input.serverTime) ||
    containsForbiddenKey(input)
  ) {
    return null;
  }
  return input;
}

function failure(code: PosOrderFailureCode, status: PosOrderEndpointResult["status"]) {
  return {
    body: {
      code,
      message: "POS customer-order request was not accepted.",
      ok: false,
    },
    status,
  } satisfies PosOrderEndpointResult;
}

function failureStatus(code: string): PosOrderEndpointResult["status"] {
  if (code === "denied") return 401;
  if (code === "not_found") return 404;
  if (
    code === "conflict" ||
    code === "fiscal_sale_mismatch" ||
    code === "idempotency_conflict" ||
    code === "invalid_state" ||
    code === "lease_conflict" ||
    code === "version_conflict"
  ) {
    return 409;
  }
  if (code === "validation_failed") return 400;
  return 500;
}

function rpcFailure(input: unknown): PosOrderEndpointResult {
  const code =
    isRecord(input) && typeof input.code === "string"
      ? input.code
      : "db_failure";
  const status = failureStatus(code);
  return failure(
    status === 500 ? "db_failure" : (code as PosOrderFailureCode),
    status,
  );
}

async function configuredClient() {
  const config = resolveSupabaseAdminConfig();
  return config.status === "configured" ? createSupabaseAdminClient(config) : null;
}

async function validateRuntime(
  supabase: SupabaseAdminClient,
  parsed: ParsedRuntimeRequest,
) {
  const lease = await loadPosRuntimeLease(supabase, {
    posSessionId: parsed.posSessionId,
    shopDeviceId: parsed.shopDeviceId,
  });
  if (lease.status !== "ok") return lease.status;
  if (
    !verifyPosSecret(parsed.sessionToken, lease.session.session_token_hash) ||
    !verifyPosSecret(parsed.deviceToken, lease.credential.token_hash)
  ) {
    return "denied" as const;
  }
  return lease;
}

async function writeAudit(
  supabase: SupabaseAdminClient,
  input: {
    code: string;
    count?: number;
    appVersionPresent: boolean;
    meta: PosCustomerOrderRequestMeta;
    operation: "ack" | "claim";
    outcome?: string;
    result: "blocked" | "failure" | "success";
    shopId?: string;
    staffId?: string;
    targetId?: string;
  },
) {
  return writePosRuntimeAudit(supabase, {
    code: input.code,
    eventKey: `pos.customer_order.${input.operation}.${input.result}`,
    metadata: {
      app_version_present: input.appVersionPresent,
      client_request_id_present: Boolean(input.meta.clientRequestId),
      handoff_count: input.count ?? null,
      outcome: input.outcome ?? null,
      route: input.meta.route ?? null,
    },
    result: input.result,
    severity: input.result === "failure" ? "critical" : input.result === "blocked" ? "warning" : "info",
    shopId: input.shopId,
    staffId: input.staffId,
    targetId: input.targetId,
    targetType: input.operation === "claim" ? "pos_session" : "customer_order_handoff",
  });
}

export async function handlePosCustomerOrderClaim(
  input: unknown,
  meta: PosCustomerOrderRequestMeta = {},
): Promise<PosOrderEndpointResult> {
  const parsed = parseClaimRequest(input);
  const supabase = await configuredClient();
  if (!supabase) return failure("not_configured", 503);
  if (!parsed) return failure("validation_failed", 400);

  const runtime = await validateRuntime(supabase, parsed);
  if (runtime === "db_failure") return failure("db_failure", 500);
  if (runtime === "denied") return failure("denied", 401);

  const rpc = await supabase.rpc("pos_customer_order_claim_v1", {
    p_limit: parsed.limit,
    p_pos_session_id: runtime.session.pos_session_id,
    p_shop_device_id: runtime.session.shop_device_id,
    p_shop_id: runtime.shop.shop_id,
    p_staff_id: runtime.staff.staff_id,
  });
  if (rpc.error) return failure("db_failure", 500);
  const response = parseClaimRpcResponse(rpc.data, parsed.limit);
  if (!response) return rpcFailure(rpc.data);

  const audited = await writeAudit(supabase, {
    appVersionPresent: Boolean(parsed.appVersion),
    code: "success",
    count: (response.handoffs as unknown[]).length,
    meta,
    operation: "claim",
    result: "success",
    shopId: runtime.shop.shop_id,
    staffId: runtime.staff.staff_id,
    targetId: runtime.session.pos_session_id,
  });
  return audited ? { body: response, status: 200 } : failure("db_failure", 500);
}

export async function handlePosCustomerOrderAck(
  input: unknown,
  meta: PosCustomerOrderRequestMeta = {},
): Promise<PosOrderEndpointResult> {
  const parsed = parseAckRequest(input);
  const supabase = await configuredClient();
  if (!supabase) return failure("not_configured", 503);
  if (!parsed) return failure("validation_failed", 400);

  const runtime = await validateRuntime(supabase, parsed);
  if (runtime === "db_failure") return failure("db_failure", 500);
  if (runtime === "denied") return failure("denied", 401);

  const rpc = await supabase.rpc("pos_customer_order_ack_v1", {
    p_ack_idempotency_key: parsed.idempotencyKey,
    p_expected_status_version: parsed.expectedStatusVersion,
    p_handoff_id: parsed.handoffId,
    p_lease_token: parsed.leaseToken,
    p_outcome: parsed.outcome,
    p_pos_sale_id: parsed.posSaleId,
    p_pos_session_id: runtime.session.pos_session_id,
    p_shop_device_id: runtime.session.shop_device_id,
    p_shop_id: runtime.shop.shop_id,
    p_staff_id: runtime.staff.staff_id,
  });
  if (rpc.error) return failure("db_failure", 500);
  const response = parseAckRpcResponse(rpc.data, parsed);
  if (!response) return rpcFailure(rpc.data);

  const audited = await writeAudit(supabase, {
    appVersionPresent: Boolean(parsed.appVersion),
    code: "success",
    meta,
    operation: "ack",
    outcome: parsed.outcome,
    result: "success",
    shopId: runtime.shop.shop_id,
    staffId: runtime.staff.staff_id,
    targetId: parsed.handoffId,
  });
  return audited ? { body: response, status: 200 } : failure("db_failure", 500);
}
