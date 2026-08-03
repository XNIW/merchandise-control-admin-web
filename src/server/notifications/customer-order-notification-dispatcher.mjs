const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHOP_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const EVENT_KEYS = new Set([
  "confirmed",
  "rejected",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
  "reservation_expiring",
]);
const PLATFORMS = new Set(["android", "ios"]);
const PROVIDER_ERROR_CODE_PATTERN = /^[a-z0-9_]{1,80}$/;
const CLAIM_KEYS = new Set([
  "apiVersion",
  "status",
  "dispatcherId",
  "claimedAt",
  "deliveries",
]);
const ACK_KEYS = new Set([
  "apiVersion",
  "status",
  "deliveryStatus",
  "idempotent",
]);
const PAYLOAD_KEYS = new Set([
  "apiVersion",
  "event",
  "title",
  "body",
  "orderCode",
  "deepLink",
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "pushToken",
  "deviceId",
  "userId",
  "shopId",
  "orderId",
  "reservationHoldId",
  "email",
  "address",
  "notes",
  "items",
  "total",
]);

export class CustomerNotificationContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "CustomerNotificationContractError";
    this.code = code;
  }
}

function contract(condition, code) {
  if (!condition) {
    throw new CustomerNotificationContractError(code);
  }
}

function asObject(value, code) {
  contract(value !== null && typeof value === "object" && !Array.isArray(value), code);
  return value;
}

function asString(value, code, { min = 1, max = 4096 } = {}) {
  contract(typeof value === "string", code);
  contract(value === value.trim(), code);
  contract(value.length >= min && value.length <= max, code);
  contract(!/[\u0000-\u001f\u007f-\u009f]/u.test(value), code);
  return value;
}

function asUuid(value, code) {
  const parsed = asString(value, code, { min: 36, max: 36 });
  contract(UUID_PATTERN.test(parsed), code);
  return parsed;
}

function asPositiveInteger(value, code, max = Number.MAX_SAFE_INTEGER) {
  contract(Number.isSafeInteger(value) && value > 0 && value <= max, code);
  return value;
}

function exactKeys(value, allowed, code) {
  contract(Object.keys(value).every((key) => allowed.has(key)), code);
}

function parseDeepLink(value) {
  const deepLink = asString(value, "invalid_deep_link", { min: 40, max: 220 });
  let uri;
  try {
    uri = new URL(deepLink);
  } catch {
    throw new CustomerNotificationContractError("invalid_deep_link");
  }
  contract(uri.protocol === "com.xniw.clientmerchandisecontrol:", "invalid_deep_link");
  contract(uri.hostname === "storefront", "invalid_deep_link");
  contract(uri.username === "" && uri.password === "" && uri.port === "", "invalid_deep_link");
  contract(uri.search === "" && uri.hash === "", "invalid_deep_link");
  const segments = uri.pathname.split("/").filter(Boolean);
  contract(segments.length === 3, "invalid_deep_link");
  contract(SHOP_SLUG_PATTERN.test(segments[0]), "invalid_deep_link");
  contract(segments[1] === "notification", "invalid_deep_link");
  contract(UUID_PATTERN.test(segments[2]), "invalid_deep_link");
  contract(uri.toString() === deepLink, "non_canonical_deep_link");
  return deepLink;
}

export function parseCustomerNotificationPayload(value) {
  const payload = asObject(value, "invalid_payload");
  for (const key of Object.keys(payload)) {
    contract(PAYLOAD_KEYS.has(key), "unexpected_payload_key");
    contract(!FORBIDDEN_PAYLOAD_KEYS.has(key), "forbidden_payload_key");
  }
  for (const forbidden of FORBIDDEN_PAYLOAD_KEYS) {
    contract(!Object.hasOwn(payload, forbidden), "forbidden_payload_key");
  }
  contract(payload.apiVersion === "customer-notification.v1", "invalid_payload_version");
  const event = asString(payload.event, "invalid_event", { min: 3, max: 40 });
  contract(EVENT_KEYS.has(event), "invalid_event");
  const title = asString(payload.title, "invalid_title", { min: 1, max: 100 });
  const body = asString(payload.body, "invalid_body", { min: 1, max: 240 });
  const deepLink = parseDeepLink(payload.deepLink);
  let orderCode;
  if (payload.orderCode !== undefined) {
    orderCode = asString(payload.orderCode, "invalid_order_code", {
      min: 7,
      max: 7,
    });
    contract(/^…[0-9A-F]{6}$/u.test(orderCode), "invalid_order_code");
  }
  contract(
    event === "reservation_expiring" ? orderCode === undefined : orderCode !== undefined,
    "invalid_order_code",
  );
  const normalized = {
    apiVersion: "customer-notification.v1",
    event,
    title,
    body,
    ...(orderCode === undefined ? {} : { orderCode }),
    deepLink,
  };
  contract(Buffer.byteLength(JSON.stringify(normalized), "utf8") < 2048, "payload_too_large");
  return Object.freeze(normalized);
}

function parseDelivery(value) {
  const delivery = asObject(value, "invalid_delivery");
  const platform = asString(delivery.platform, "invalid_platform", {
    min: 3,
    max: 7,
  });
  contract(PLATFORMS.has(platform), "invalid_platform");
  const pushToken = asString(delivery.pushToken, "invalid_push_token", {
    min: 16,
    max: 4096,
  });
  contract(!/\s/u.test(pushToken), "invalid_push_token");
  return Object.freeze({
    deliveryId: asUuid(delivery.deliveryId, "invalid_delivery_id"),
    leaseToken: asUuid(delivery.leaseToken, "invalid_lease_token"),
    destinationGeneration: asPositiveInteger(
      delivery.destinationGeneration,
      "invalid_destination_generation",
    ),
    attempt: asPositiveInteger(delivery.attempt, "invalid_attempt", 8),
    platform,
    pushToken,
    payload: parseCustomerNotificationPayload(delivery.payload),
  });
}

function parseClaim(value, expectedDispatcherId) {
  const claim = asObject(value, "invalid_claim");
  exactKeys(claim, CLAIM_KEYS, "unexpected_claim_key");
  contract(claim.apiVersion === "customer-notification-dispatch.v1", "invalid_claim_version");
  contract(claim.status === "ok", "claim_failed");
  contract(
    asUuid(claim.dispatcherId, "invalid_claim_dispatcher_id") === expectedDispatcherId,
    "claim_dispatcher_mismatch",
  );
  contract(
    typeof claim.claimedAt === "string" && Number.isFinite(Date.parse(claim.claimedAt)),
    "invalid_claim_timestamp",
  );
  contract(Array.isArray(claim.deliveries), "invalid_claim_deliveries");
  contract(claim.deliveries.length <= 100, "claim_too_large");
  return claim.deliveries.map(parseDelivery);
}

function normalizeProviderOutcome(value) {
  const outcome = asObject(value, "invalid_provider_outcome");
  switch (outcome.kind) {
    case "delivered":
      return {
        outcome: "delivered",
        providerMessageId: asString(
          outcome.providerMessageId,
          "invalid_provider_message_id",
          { min: 1, max: 512 },
        ),
        errorCode: null,
      };
    case "retryable":
    case "invalid_token":
    case "permanent_failure": {
      const errorCode = asString(outcome.errorCode, "invalid_provider_error_code", {
        min: 1,
        max: 80,
      });
      contract(PROVIDER_ERROR_CODE_PATTERN.test(errorCode), "invalid_provider_error_code");
      return {
        outcome: outcome.kind,
        providerMessageId: null,
        errorCode,
      };
    }
    default:
      throw new CustomerNotificationContractError("invalid_provider_outcome");
  }
}

function parseAck(value) {
  const ack = asObject(value, "invalid_ack");
  exactKeys(ack, ACK_KEYS, "unexpected_ack_key");
  contract(ack.apiVersion === "customer-notification-ack.v1", "invalid_ack_version");
  contract(
    [
      "destination_revoked",
      "permanent_failure",
      "retry_scheduled",
      "retry_budget_exhausted",
      "stale_destination",
      "success",
    ].includes(ack.status),
    "invalid_ack_status",
  );
  contract(
    ["dead_letter", "delivered", "pending", "suppressed"].includes(
      ack.deliveryStatus,
    ),
    "invalid_ack_delivery_status",
  );
  contract(typeof ack.idempotent === "boolean", "invalid_ack_idempotency");
  return ack;
}

function withTimeout(operation, timeoutMs) {
  let timeout;
  return Promise.race([
    Promise.resolve(operation),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new CustomerNotificationContractError("provider_timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
}

export function createSupabaseCustomerNotificationQueuePort(client) {
  contract(client && typeof client.rpc === "function", "invalid_supabase_client");
  return Object.freeze({
    async claim({ limit, leaseSeconds, dispatcherId }) {
      const response = await client.rpc("customer_notification_claim_v1", {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
        p_dispatcher_id: dispatcherId,
      });
      if (response.error) {
        throw new CustomerNotificationContractError("claim_rpc_failed");
      }
      return response.data;
    },
    async ack(input) {
      const response = await client.rpc("customer_notification_ack_v1", {
        p_delivery_id: input.deliveryId,
        p_lease_token: input.leaseToken,
        p_destination_generation: input.destinationGeneration,
        p_outcome: input.outcome,
        p_ack_idempotency_key: input.ackIdempotencyKey,
        p_provider_message_id: input.providerMessageId,
        p_error_code: input.errorCode,
      });
      if (response.error) {
        throw new CustomerNotificationContractError("ack_rpc_failed");
      }
      return response.data;
    },
  });
}

export class CustomerOrderNotificationDispatcher {
  #active = null;

  constructor({ queue, provider, uuidFactory, providerTimeoutMs = 10_000 }) {
    contract(queue && typeof queue.claim === "function" && typeof queue.ack === "function", "invalid_queue");
    contract(provider && typeof provider.send === "function", "invalid_provider");
    contract(typeof uuidFactory === "function", "invalid_uuid_factory");
    contract(
      Number.isSafeInteger(providerTimeoutMs) &&
        providerTimeoutMs >= 100 &&
        providerTimeoutMs <= 30_000,
      "invalid_provider_timeout",
    );
    this.queue = queue;
    this.provider = provider;
    this.uuidFactory = uuidFactory;
    this.providerTimeoutMs = providerTimeoutMs;
  }

  drain({ limit = 25, leaseSeconds = 60, dispatcherId }) {
    if (this.#active) {
      return this.#active;
    }
    contract(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, "invalid_limit");
    contract(
      Number.isSafeInteger(leaseSeconds) && leaseSeconds >= 5 && leaseSeconds <= 300,
      "invalid_lease_seconds",
    );
    const safeDispatcherId = asUuid(dispatcherId, "invalid_dispatcher_id");
    const operation = this.#drain({ limit, leaseSeconds, dispatcherId: safeDispatcherId });
    const active = operation.finally(() => {
      if (this.#active === active) {
        this.#active = null;
      }
    });
    this.#active = active;
    return active;
  }

  async #drain(input) {
    const deliveries = parseClaim(await this.queue.claim(input), input.dispatcherId);
    const summary = {
      dispatcherId: input.dispatcherId,
      claimed: deliveries.length,
      delivered: 0,
      retryScheduled: 0,
      suppressed: 0,
      deadLetter: 0,
      ackFailed: 0,
    };
    for (const delivery of deliveries) {
      let providerOutcome;
      try {
        providerOutcome = normalizeProviderOutcome(
          await withTimeout(
            this.provider.send({
              platform: delivery.platform,
              token: delivery.pushToken,
              payload: delivery.payload,
            }),
            this.providerTimeoutMs,
          ),
        );
      } catch (error) {
        providerOutcome = {
          outcome: "retryable",
          providerMessageId: null,
          errorCode:
            error instanceof CustomerNotificationContractError &&
            error.code === "provider_timeout"
              ? "provider_timeout"
              : "provider_exception",
        };
      }
      const ackInput = {
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
        destinationGeneration: delivery.destinationGeneration,
        outcome: providerOutcome.outcome,
        ackIdempotencyKey: asUuid(
          this.uuidFactory(),
          "invalid_ack_idempotency_key",
        ),
        providerMessageId: providerOutcome.providerMessageId,
        errorCode: providerOutcome.errorCode,
      };
      let ack;
      try {
        ack = parseAck(await this.queue.ack(ackInput));
      } catch {
        try {
          ack = parseAck(await this.queue.ack(ackInput));
        } catch {
          summary.ackFailed += 1;
          continue;
        }
      }
      switch (ack.deliveryStatus) {
        case "delivered":
          summary.delivered += 1;
          break;
        case "pending":
          summary.retryScheduled += 1;
          break;
        case "suppressed":
          summary.suppressed += 1;
          break;
        case "dead_letter":
          summary.deadLetter += 1;
          break;
        default:
          summary.ackFailed += 1;
      }
    }
    return Object.freeze(summary);
  }
}
