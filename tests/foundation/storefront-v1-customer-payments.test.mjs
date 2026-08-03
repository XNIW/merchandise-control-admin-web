import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DisabledPaymentProvider,
  PaymentProviderContractError,
  PaymentWebhookProcessor,
  RecordingPaymentProvider,
} from "../../src/server/payments/storefront-payment-provider.mjs";

const paymentId = "32000000-0000-4000-8000-000000032001";
const now = "2026-08-03T12:30:00.000Z";

function body(overrides = {}) {
  return Buffer.from(
    JSON.stringify({
      eventId: "evt-task032-1",
      occurredAt: now,
      paymentId,
      paymentReference: "provider-payment-opaque-1",
      sequence: 2,
      targetStatus: "collected",
      ...overrides,
    }),
  );
}

function harness({ reserveStatus = "accepted", transitionStatus = "applied" } = {}) {
  const calls = { complete: [], reserve: [], transition: [] };
  const provider = new RecordingPaymentProvider({
    signatureVerifier: async (rawBody, signature) =>
      rawBody.length > 0 && signature === "valid-recording-signature",
  });
  const processor = new PaymentWebhookProcessor({
    clock: () => Date.parse(now),
    paymentPort: {
      async applyProviderEvent(input) {
        calls.transition.push(input);
        return { status: transitionStatus };
      },
    },
    provider,
    receiptStore: {
      async complete(input) {
        calls.complete.push(input);
      },
      async reserve(input) {
        calls.reserve.push(input);
        return reserveStatus === "duplicate"
          ? { status: "duplicate" }
          : {
              receiptId: "42000000-0000-4000-8000-000000032001",
              status: reserveStatus,
            };
      },
    },
  });
  return { calls, processor, provider };
}

test("payment provider boundary keeps online payments fail-closed by default", async () => {
  const provider = new DisabledPaymentProvider();
  await assert.rejects(
    provider.createIntent({}),
    (error) =>
      error instanceof PaymentProviderContractError &&
      error.code === "online_payment_disabled",
  );
  await assert.rejects(
    provider.verifyAndParseWebhook({}),
    /online_payment_disabled/,
  );
});

test("recording adapter accepts only a server-derived CLP intent allow-list", async () => {
  const { provider } = harness();
  await provider.createIntent({
    amountClp: 12990,
    currencyCode: "CLP",
    idempotencyKey: "52000000-0000-4000-8000-000000032001",
    paymentId,
    returnUrl: "https://example.invalid/payment-return",
  });
  assert.equal(provider.intentRequests.length, 1);
  await assert.rejects(
    provider.createIntent({
      amountClp: 1,
      currencyCode: "CLP",
      idempotencyKey: "52000000-0000-4000-8000-000000032001",
      paymentId,
      status: "collected",
    }),
    /invalid_intent_request/,
  );
});

test("webhook processor requires raw bytes and a valid signature", async () => {
  const { calls, processor } = harness();
  await assert.rejects(
    processor.handle({
      headers: { "x-recording-signature": "invalid" },
      rawBody: body(),
    }),
    /invalid_signature/,
  );
  await assert.rejects(
    processor.handle({
      headers: { "x-recording-signature": "valid-recording-signature" },
      rawBody: JSON.parse(body().toString("utf8")),
    }),
    /raw_body_required/,
  );
  assert.equal(calls.reserve.length, 0);
  assert.equal(calls.transition.length, 0);
});

test("valid webhook hashes references, strips unknown headers and applies once", async () => {
  const { calls, processor } = harness();
  assert.deepEqual(
    await processor.handle({
      headers: {
        authorization: "must-not-cross-boundary",
        "x-recording-signature": "valid-recording-signature",
      },
      rawBody: body(),
    }),
    { idempotent: false, status: "applied" },
  );
  assert.equal(calls.reserve.length, 1);
  assert.match(calls.reserve[0].eventIdSha256, /^[0-9a-f]{64}$/);
  assert.match(calls.reserve[0].payloadSha256, /^[0-9a-f]{64}$/);
  assert.equal(calls.transition.length, 1);
  assert.match(calls.transition[0].providerReferenceSha256, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(calls).includes("provider-payment-opaque-1"));
  assert.ok(!JSON.stringify(calls).includes("must-not-cross-boundary"));
  assert.deepEqual(calls.complete, [
    {
      outcome: "applied",
      receiptId: "42000000-0000-4000-8000-000000032001",
    },
  ]);
});

test("duplicate and stale provider events never double-apply", async () => {
  const duplicate = harness({ reserveStatus: "duplicate" });
  assert.deepEqual(
    await duplicate.processor.handle({
      headers: { "x-recording-signature": "valid-recording-signature" },
      rawBody: body(),
    }),
    { idempotent: true, status: "duplicate" },
  );
  assert.equal(duplicate.calls.transition.length, 0);

  const stale = harness({ transitionStatus: "stale" });
  assert.deepEqual(
    await stale.processor.handle({
      headers: { "x-recording-signature": "valid-recording-signature" },
      rawBody: body({ sequence: 1 }),
    }),
    { idempotent: true, status: "stale" },
  );
  assert.equal(stale.calls.transition.length, 1);
});

test("invalid time, state and oversized payload are rejected before persistence", async () => {
  const { calls, processor } = harness();
  for (const rawBody of [
    body({ occurredAt: "2026-08-03T12:00:00.000Z" }),
    body({ targetStatus: "paid_from_client" }),
    Buffer.alloc(262_145, "x"),
  ]) {
    await assert.rejects(
      processor.handle({
        headers: { "x-recording-signature": "valid-recording-signature" },
        rawBody,
      }),
      PaymentProviderContractError,
    );
  }
  assert.equal(calls.reserve.length, 0);
});

test("migration enforces private RLS, offline methods and no fiscal-sale coupling", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260803122644_storefront_v1_customer_payments.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const table of [
    "storefront_payment_settings",
    "customer_order_payments",
    "customer_payment_attempts",
    "customer_payment_events",
    "customer_payment_mutations",
    "customer_payment_webhook_receipts",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration, /customer_order_create_v2/);
  assert.match(migration, /pay_at_pickup/);
  assert.match(migration, /cash_on_delivery/);
  assert.match(migration, /online_provider = 'none'[\s\S]*not online_payment_enabled/);
  assert.match(migration, /'fiscalSaleCreated', false/);
  assert.doesNotMatch(migration, /insert into public\.pos_sales/i);
  assert.doesNotMatch(migration, /(pan|cvc|card_number|merchant_secret)/i);
});

test("Admin Storefront exposes revision-bound offline settings and an explicit online OFF state", () => {
  const page = readFileSync(
    new URL("../../src/app/shop/storefront/page.tsx", import.meta.url),
    "utf8",
  );
  const actions = readFileSync(
    new URL("../../src/app/shop/storefront/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /\["payments", "Pagamenti"\]/);
  assert.match(page, /name="payAtPickupEnabled"/);
  assert.match(page, /name="cashOnDeliveryEnabled"/);
  assert.match(page, /name="expectedRevision"/);
  assert.match(page, /Provider e credenziali merchant non configurati/);
  assert.match(page, />\s*OFF\s*</);
  assert.match(page, /min-h-14/);
  assert.match(actions, /onlinePaymentEnabled: false/);
  assert.match(actions, /mutateStorefrontPayment/);
  assert.doesNotMatch(page, /name="onlinePaymentEnabled"/);
});

test("Admin read and staff lease paths use named payment RPCs without table access", () => {
  const readModel = readFileSync(
    new URL(
      "../../src/server/shop-admin/storefront-read-model.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const leaseBoundary = readFileSync(
    new URL(
      "../../src/server/shop-admin/staff-web-lease-bound-rpc.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(readModel, /admin_storefront_payment_read_v1/);
  assert.match(readModel, /onlinePaymentEnabled: false/);
  assert.match(readModel, /provider !== "none"/);
  assert.match(leaseBoundary, /callStaffWebStorefrontPaymentRead/);
  assert.match(leaseBoundary, /callStaffWebStorefrontPaymentMutation/);
  assert.doesNotMatch(leaseBoundary, /from\("customer_order_payments"\)/);
});

test("staging workflow applies the exact migration and runs rollback-safe pickup/COD plus concurrency", () => {
  const workflow = readFileSync(
    new URL(
      "../../.github/workflows/task-032-customer-payments-staging.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const posOrderWorkflow = readFileSync(
    new URL(
      "../../.github/workflows/task-030-pos-order-handoff-e2e.yml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(workflow, /expected_head_sha: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /expected_migration_version: "20260803122644"/);
  assert.match(workflow, /storefront_v1_customer_payments\.sql/);
  assert.match(workflow, /test:storefront:customer-payment-concurrency/);
  assert.match(workflow, /productionWriteRequested', false/);
  assert.match(workflow, /group: storefront-v1-staging-order-payment/);
  assert.match(posOrderWorkflow, /group: storefront-v1-staging-order-payment/);
  assert.match(workflow, /Remove protected connection material/);
});
