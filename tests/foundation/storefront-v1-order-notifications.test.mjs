import assert from "node:assert/strict";
import test from "node:test";

import {
  CustomerNotificationContractError,
  CustomerOrderNotificationDispatcher,
  createSupabaseCustomerNotificationQueuePort,
  parseCustomerNotificationPayload,
} from "../../src/server/notifications/customer-order-notification-dispatcher.mjs";

const orderPayload = Object.freeze({
  apiVersion: "customer-notification.v1",
  event: "ready",
  title: "Actualización de pedido",
  body: "Tu pedido está listo.",
  orderCode: "…89ABCD",
  deepLink:
    "com.xniw.clientmerchandisecontrol://storefront/notification-fixture/notification/" +
    "f1000000-0000-4000-8000-000000031001",
});

function delivery(id, platform, token, payload = orderPayload) {
  return {
    deliveryId: `a1000000-0000-4000-8000-00000003100${id}`,
    leaseToken: `b1000000-0000-4000-8000-00000003100${id}`,
    destinationGeneration: 2,
    attempt: 1,
    platform,
    pushToken: token,
    payload,
  };
}

test("strict payload parser accepts canonical localized order and reservation hints", () => {
  assert.deepEqual(parseCustomerNotificationPayload(orderPayload), orderPayload);
  const reservation = {
    apiVersion: "customer-notification.v1",
    event: "reservation_expiring",
    title: "Reservation expiring",
    body: "Your reservation expires soon.",
    deepLink:
      "com.xniw.clientmerchandisecontrol://storefront/notification-fixture/notification/" +
      "f1000000-0000-4000-8000-000000031002",
  };
  assert.deepEqual(parseCustomerNotificationPayload(reservation), reservation);
});

test("strict payload parser rejects internal identifiers, query strings and oversized copy", () => {
  for (const patch of [
    { orderId: "88000000-0000-4000-8000-000000031001" },
    { userId: "00000000-0000-4000-8000-000000031001" },
    { pushToken: "server-routing-secret" },
    { total: 1200 },
  ]) {
    assert.throws(
      () => parseCustomerNotificationPayload({ ...orderPayload, ...patch }),
      CustomerNotificationContractError,
    );
  }
  assert.throws(
    () =>
      parseCustomerNotificationPayload({
        ...orderPayload,
        deepLink: `${orderPayload.deepLink}?orderId=internal`,
      }),
    /invalid_deep_link/,
  );
  assert.throws(
    () => parseCustomerNotificationPayload({ ...orderPayload, body: "x".repeat(241) }),
    /invalid_body/,
  );
});

test("dispatcher maps provider outcomes to idempotent acks without returning tokens", async () => {
  const tokens = [
    "task031-runtime-token-android-0001",
    "task031-runtime-token-ios-0000002",
    "task031-runtime-token-ios-0000003",
  ];
  const acks = [];
  const queue = {
    async claim() {
      return {
        apiVersion: "customer-notification-dispatch.v1",
        status: "ok",
        dispatcherId: "d1000000-0000-4000-8000-000000031001",
        claimedAt: "2026-08-03T12:00:00.000Z",
        deliveries: [
          delivery(1, "android", tokens[0]),
          delivery(2, "ios", tokens[1]),
          delivery(3, "ios", tokens[2]),
        ],
      };
    },
    async ack(input) {
      acks.push(input);
      return {
        apiVersion: "customer-notification-ack.v1",
        status: input.outcome === "delivered" ? "success" : "retry_scheduled",
        deliveryStatus: input.outcome === "delivered" ? "delivered" : "pending",
        idempotent: false,
      };
    },
  };
  let sends = 0;
  const provider = {
    async send(message) {
      assert.equal(message.token, tokens[sends]);
      assert.equal(message.payload.orderCode, "…89ABCD");
      sends += 1;
      if (sends === 1) {
        return { kind: "delivered", providerMessageId: "provider-message-1" };
      }
      if (sends === 2) {
        return { kind: "retryable", errorCode: "provider_timeout" };
      }
      throw new Error("synthetic provider outage containing sensitive context");
    },
  };
  let nextUuid = 1;
  const dispatcher = new CustomerOrderNotificationDispatcher({
    queue,
    provider,
    uuidFactory: () => `c1000000-0000-4000-8000-00000003100${nextUuid++}`,
  });

  const summary = await dispatcher.drain({
    dispatcherId: "d1000000-0000-4000-8000-000000031001",
  });
  assert.deepEqual(summary, {
    dispatcherId: "d1000000-0000-4000-8000-000000031001",
    claimed: 3,
    delivered: 1,
    retryScheduled: 2,
    suppressed: 0,
    deadLetter: 0,
    ackFailed: 0,
  });
  assert.equal(acks.length, 3);
  assert.equal(acks[0].providerMessageId, "provider-message-1");
  assert.equal(acks[1].errorCode, "provider_timeout");
  assert.equal(acks[2].errorCode, "provider_exception");
  assert.ok(!JSON.stringify(summary).includes("task031-runtime-token"));
  assert.ok(!JSON.stringify(acks).includes("task031-runtime-token"));
  assert.ok(!JSON.stringify(acks).includes("sensitive context"));
});

test("dispatcher coalesces concurrent drains and validates bounded inputs", async () => {
  let releaseClaim;
  let claimCount = 0;
  const queue = {
    claim(input) {
      claimCount += 1;
      return new Promise((resolve) => {
        releaseClaim = () =>
          resolve({
            apiVersion: "customer-notification-dispatch.v1",
            status: "ok",
            dispatcherId: input.dispatcherId,
            claimedAt: "2026-08-03T12:00:00.000Z",
            deliveries: [],
          });
      });
    },
    async ack() {
      throw new Error("no delivery should be acked");
    },
  };
  const dispatcher = new CustomerOrderNotificationDispatcher({
    queue,
    provider: { async send() {} },
    uuidFactory: () => "c1000000-0000-4000-8000-000000031001",
  });
  const first = dispatcher.drain({
    dispatcherId: "d1000000-0000-4000-8000-000000031001",
  });
  const second = dispatcher.drain({
    dispatcherId: "d1000000-0000-4000-8000-000000031002",
  });
  assert.strictEqual(first, second);
  assert.equal(claimCount, 1);
  releaseClaim();
  assert.deepEqual(await first, {
    dispatcherId: "d1000000-0000-4000-8000-000000031001",
    claimed: 0,
    delivered: 0,
    retryScheduled: 0,
    suppressed: 0,
    deadLetter: 0,
    ackFailed: 0,
  });
  assert.throws(
    () =>
      dispatcher.drain({
        limit: 101,
        dispatcherId: "d1000000-0000-4000-8000-000000031003",
      }),
    /invalid_limit/,
  );
});

test("dispatcher bounds provider hangs and replays an ambiguous ack with one request id", async () => {
  const ackInputs = [];
  let uuidCalls = 0;
  let ackAttempts = 0;
  const queue = {
    async claim(input) {
      return {
        apiVersion: "customer-notification-dispatch.v1",
        status: "ok",
        dispatcherId: input.dispatcherId,
        claimedAt: "2026-08-03T12:00:00.000Z",
        deliveries: [
          delivery(4, "android", "task031-runtime-token-timeout-0004"),
        ],
      };
    },
    async ack(input) {
      ackInputs.push(input);
      ackAttempts += 1;
      if (ackAttempts === 1) throw new Error("ambiguous network timeout");
      return {
        apiVersion: "customer-notification-ack.v1",
        status: "retry_scheduled",
        deliveryStatus: "pending",
        idempotent: true,
      };
    },
  };
  const dispatcher = new CustomerOrderNotificationDispatcher({
    queue,
    provider: { send: () => new Promise(() => {}) },
    uuidFactory: () => {
      uuidCalls += 1;
      return "c1000000-0000-4000-8000-000000031004";
    },
    providerTimeoutMs: 100,
  });

  assert.deepEqual(
    await dispatcher.drain({
      dispatcherId: "d1000000-0000-4000-8000-000000031004",
    }),
    {
      dispatcherId: "d1000000-0000-4000-8000-000000031004",
      claimed: 1,
      delivered: 0,
      retryScheduled: 1,
      suppressed: 0,
      deadLetter: 0,
      ackFailed: 0,
    },
  );
  assert.equal(ackAttempts, 2);
  assert.equal(uuidCalls, 1);
  assert.equal(ackInputs[0].ackIdempotencyKey, ackInputs[1].ackIdempotencyKey);
  assert.equal(ackInputs[0].outcome, "retryable");
  assert.equal(ackInputs[0].errorCode, "provider_timeout");
});

test("Supabase queue port sends only the strict claim and ack RPC parameters", async () => {
  const calls = [];
  const port = createSupabaseCustomerNotificationQueuePort({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return name === "customer_notification_claim_v1"
        ? {
            data: {
              apiVersion: "customer-notification-dispatch.v1",
              status: "ok",
              deliveries: [],
            },
            error: null,
          }
        : {
            data: {
              apiVersion: "customer-notification-ack.v1",
              status: "success",
              deliveryStatus: "delivered",
              idempotent: false,
            },
            error: null,
          };
    },
  });
  await port.claim({
    limit: 10,
    leaseSeconds: 60,
    dispatcherId: "d1000000-0000-4000-8000-000000031001",
  });
  await port.ack({
    deliveryId: "a1000000-0000-4000-8000-000000031001",
    leaseToken: "b1000000-0000-4000-8000-000000031001",
    destinationGeneration: 1,
    outcome: "delivered",
    ackIdempotencyKey: "c1000000-0000-4000-8000-000000031001",
    providerMessageId: "provider-message-1",
    errorCode: null,
  });
  assert.deepEqual(calls.map(({ name }) => name), [
    "customer_notification_claim_v1",
    "customer_notification_ack_v1",
  ]);
  assert.deepEqual(Object.keys(calls[0].parameters).sort(), [
    "p_dispatcher_id",
    "p_lease_seconds",
    "p_limit",
  ]);
  assert.deepEqual(Object.keys(calls[1].parameters).sort(), [
    "p_ack_idempotency_key",
    "p_delivery_id",
    "p_destination_generation",
    "p_error_code",
    "p_lease_token",
    "p_outcome",
    "p_provider_message_id",
  ]);
});
