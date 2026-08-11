import { createHash } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const PROVIDER_EVENT_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const FAILURE_CODE_PATTERN = /^[a-z0-9_]{1,80}$/;
const TARGET_STATUSES = new Set([
  "pending_provider",
  "processing",
  "authorized",
  "collected",
  "failed",
  "cancelled",
  "refund_pending",
  "refund_failed",
  "refunded",
]);

export class PaymentProviderContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "PaymentProviderContractError";
    this.code = code;
  }
}

function fail(code) {
  throw new PaymentProviderContractError(code);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rawBodyBytes(rawBody, maxBodyBytes) {
  const bytes = Buffer.isBuffer(rawBody)
    ? rawBody
    : rawBody instanceof Uint8Array
      ? Buffer.from(rawBody)
      : null;
  if (!bytes) fail("raw_body_required");
  if (bytes.byteLength === 0 || bytes.byteLength > maxBodyBytes) {
    fail("invalid_body_size");
  }
  return bytes;
}

function normalizeHeaders(headers, allowedNames) {
  const source = headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : objectValue(headers);
  if (!source) fail("invalid_headers");
  const allowed = new Set(allowedNames.map((name) => name.toLowerCase()));
  const result = Object.create(null);
  for (const [name, value] of Object.entries(source)) {
    const normalizedName = name.toLowerCase();
    if (!allowed.has(normalizedName)) continue;
    if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
      fail("invalid_signature_header");
    }
    result[normalizedName] = value;
  }
  return Object.freeze(result);
}

function canonicalEvent(value, nowMs, toleranceMs) {
  const event = objectValue(value);
  if (!event) fail("invalid_provider_event");
  const occurredAt = Date.parse(event.occurredAt);
  if (
    !PROVIDER_EVENT_PATTERN.test(event.eventId ?? "") ||
    !UUID_PATTERN.test(event.paymentId ?? "") ||
    !Number.isInteger(event.sequence) ||
    event.sequence < 1 ||
    event.sequence > Number.MAX_SAFE_INTEGER ||
    !TARGET_STATUSES.has(event.targetStatus) ||
    !Number.isFinite(occurredAt) ||
    Math.abs(nowMs - occurredAt) > toleranceMs ||
    (event.failureCode != null &&
      !FAILURE_CODE_PATTERN.test(event.failureCode)) ||
    (event.paymentReference != null &&
      !PROVIDER_EVENT_PATTERN.test(event.paymentReference))
  ) {
    fail("invalid_provider_event");
  }
  return Object.freeze({
    eventId: event.eventId,
    failureCode: event.failureCode ?? null,
    occurredAt: new Date(occurredAt).toISOString(),
    paymentId: event.paymentId,
    paymentReference: event.paymentReference ?? null,
    sequence: event.sequence,
    targetStatus: event.targetStatus,
  });
}

export class PaymentProvider {
  constructor({ key, signatureHeaderNames = [] }) {
    if (
      !PROVIDER_KEY_PATTERN.test(key ?? "") ||
      !Array.isArray(signatureHeaderNames) ||
      signatureHeaderNames.length === 0 ||
      signatureHeaderNames.some(
        (name) => typeof name !== "string" || !/^[a-z0-9-]{1,80}$/.test(name),
      )
    ) {
      fail("invalid_provider_contract");
    }
    this.key = key;
    this.signatureHeaderNames = Object.freeze([...signatureHeaderNames]);
  }

  async createIntent() {
    fail("provider_not_implemented");
  }

  async verifyAndParseWebhook() {
    fail("provider_not_implemented");
  }
}

export class DisabledPaymentProvider {
  constructor() {
    this.key = "none";
    this.signatureHeaderNames = Object.freeze([]);
  }

  async createIntent() {
    fail("online_payment_disabled");
  }

  async verifyAndParseWebhook() {
    fail("online_payment_disabled");
  }
}

// Deterministic contract adapter for tests. It never represents a real processor.
export class RecordingPaymentProvider extends PaymentProvider {
  constructor({ signatureVerifier, createIntentResult = null }) {
    super({ key: "recording", signatureHeaderNames: ["x-recording-signature"] });
    if (typeof signatureVerifier !== "function") {
      fail("signature_verifier_required");
    }
    this.signatureVerifier = signatureVerifier;
    this.createIntentResult = createIntentResult;
    this.intentRequests = [];
  }

  async createIntent(request) {
    const input = objectValue(request);
    if (
      !input ||
      !UUID_PATTERN.test(input.paymentId ?? "") ||
      !UUID_PATTERN.test(input.idempotencyKey ?? "") ||
      !Number.isInteger(input.amountClp) ||
      input.amountClp < 0 ||
      input.currencyCode !== "CLP" ||
      Object.keys(input).some(
        (key) =>
          ![
            "amountClp",
            "currencyCode",
            "idempotencyKey",
            "paymentId",
            "returnUrl",
          ].includes(key),
      )
    ) {
      fail("invalid_intent_request");
    }
    this.intentRequests.push(Object.freeze({ ...input }));
    return this.createIntentResult;
  }

  async verifyAndParseWebhook({ rawBody, headers, nowMs, toleranceMs }) {
    const signature = headers["x-recording-signature"];
    if (!signature || !(await this.signatureVerifier(rawBody, signature))) {
      fail("invalid_signature");
    }
    let parsed;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      fail("invalid_json");
    }
    return canonicalEvent(parsed, nowMs, toleranceMs);
  }
}

export class PaymentWebhookProcessor {
  constructor({
    provider,
    receiptStore,
    paymentPort,
    clock = () => Date.now(),
    maxBodyBytes = 262_144,
    toleranceMs = 300_000,
  }) {
    if (
      !provider ||
      provider.key === "none" ||
      typeof provider.verifyAndParseWebhook !== "function" ||
      typeof receiptStore?.reserve !== "function" ||
      typeof receiptStore?.complete !== "function" ||
      typeof paymentPort?.applyProviderEvent !== "function" ||
      typeof clock !== "function" ||
      !Number.isInteger(maxBodyBytes) ||
      maxBodyBytes < 1024 ||
      maxBodyBytes > 1_048_576 ||
      !Number.isInteger(toleranceMs) ||
      toleranceMs < 1_000 ||
      toleranceMs > 900_000
    ) {
      fail("invalid_processor_contract");
    }
    this.provider = provider;
    this.receiptStore = receiptStore;
    this.paymentPort = paymentPort;
    this.clock = clock;
    this.maxBodyBytes = maxBodyBytes;
    this.toleranceMs = toleranceMs;
  }

  async handle({ rawBody, headers }) {
    const bytes = rawBodyBytes(rawBody, this.maxBodyBytes);
    const safeHeaders = normalizeHeaders(
      headers,
      this.provider.signatureHeaderNames,
    );
    const nowMs = this.clock();
    const event = await this.provider.verifyAndParseWebhook({
      headers: safeHeaders,
      nowMs,
      rawBody: bytes,
      toleranceMs: this.toleranceMs,
    });
    const eventIdSha256 = sha256(event.eventId);
    const payloadSha256 = sha256(bytes);
    const reservation = await this.receiptStore.reserve({
      eventIdSha256,
      occurredAt: event.occurredAt,
      payloadSha256,
      providerKey: this.provider.key,
    });
    if (reservation?.status === "duplicate") {
      return Object.freeze({ idempotent: true, status: "duplicate" });
    }
    if (reservation?.status !== "accepted" || !reservation.receiptId) {
      fail("receipt_reservation_failed");
    }
    const outcome = await this.paymentPort.applyProviderEvent({
      eventIdSha256,
      failureCode: event.failureCode,
      occurredAt: event.occurredAt,
      paymentId: event.paymentId,
      providerKey: this.provider.key,
      providerReferenceSha256: event.paymentReference
        ? sha256(event.paymentReference)
        : null,
      sequence: event.sequence,
      targetStatus: event.targetStatus,
    });
    if (!["applied", "idempotent", "stale"].includes(outcome?.status)) {
      fail("payment_transition_failed");
    }
    await this.receiptStore.complete({
      outcome: outcome.status,
      receiptId: reservation.receiptId,
    });
    return Object.freeze({
      idempotent: outcome.status !== "applied",
      status: outcome.status,
    });
  }
}
