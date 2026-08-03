import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { createContext, Script } from "node:vm";
import ts from "typescript";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);
const SHOP_ID = "10000000-0000-4000-8000-000000030001";
const STAFF_ID = "20000000-0000-4000-8000-000000030001";
const DEVICE_ID = "30000000-0000-4000-8000-000000030001";
const SESSION_ID = "40000000-0000-4000-8000-000000030001";
const HANDOFF_ID = "50000000-0000-4000-8000-000000030001";
const LEASE_TOKEN = "60000000-0000-4000-8000-000000030001";
const ORDER_ID = "70000000-0000-4000-8000-000000030001";
const EVENT_KEY = "80000000-0000-4000-8000-000000030001";
const ACK_KEY = "90000000-0000-4000-8000-000000030001";

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function transpileCommonJs(relativePath, stubs) {
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };
  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    createContext({
      Buffer,
      Date,
      Request,
      Response,
      console,
      exports: cjsModule.exports,
      module: cjsModule,
      require(specifier) {
        if (specifier === "server-only") return {};
        if (specifier in stubs) return stubs[specifier];
        return requireForTest(specifier);
      },
    }),
  );
  return cjsModule.exports;
}

function runtimeLease(status = "ok") {
  if (status !== "ok") return { status };
  return {
    credential: {
      token_hash: "fixture-device-hash",
    },
    device: {
      shop_device_id: DEVICE_ID,
      status: "active",
    },
    session: {
      pos_session_id: SESSION_ID,
      session_token_hash: "fixture-session-hash",
      shop_device_id: DEVICE_ID,
      shop_id: SHOP_ID,
      staff_id: STAFF_ID,
    },
    shop: {
      shop_id: SHOP_ID,
      shop_code: "TASK030QA",
      shop_status: "active",
    },
    staff: {
      staff_id: STAFF_ID,
    },
    status: "ok",
  };
}

function claimRpcResponse(overrides = {}) {
  return {
    code: "success",
    handoffs: [
      {
        attemptCount: 1,
        correlationId: EVENT_KEY,
        eventIdempotencyKey: EVENT_KEY,
        eventType: "customer_order.accepted.v1",
        handoffId: HANDOFF_ID,
        leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(),
        leaseToken: LEASE_TOKEN,
        order: {
          currencyCode: "CLP",
          currentStatusVersion: 2,
          deliveryFeeClp: 0,
          documentKind: "customer_order",
          fiscalStatus: "not_created",
          fulfillment: {
            mode: "pickup",
            pickupPoint: {
              commune: "Ñuñoa",
              publicName: "Retiro TASK-030",
              region: "Metropolitana",
            },
            slot: {
              endsAt: "2026-08-03T13:00:00.000Z",
              label: "Retiro TASK-030",
              startsAt: "2026-08-03T11:00:00.000Z",
            },
          },
          fulfillmentMode: "pickup",
          items: [
            {
              linePosition: 1,
              lineTotalClp: 1900,
              publicName: "Producto público TASK-030",
              quantity: 1,
              unitPriceClp: 1900,
            },
          ],
          orderCode: "MC-00000000000000003001",
          orderId: ORDER_ID,
          placedAt: "2026-08-03T10:00:00.000Z",
          shopId: SHOP_ID,
          status: "accepted",
          statusVersion: 2,
          subtotalClp: 1900,
          totalClp: 1900,
          updatedAt: "2026-08-03T10:01:00.000Z",
        },
        schemaVersion: "pos-customer-order-handoff-v1",
      },
    ],
    ok: true,
    schemaVersion: "pos-customer-order-handoff-v1",
    serverTime: "2026-08-03T10:01:00.000Z",
    ...overrides,
  };
}

function ackRpcResponse(overrides = {}) {
  return {
    code: "success",
    fiscalStatus: "not_created",
    handoffId: HANDOFF_ID,
    idempotent: false,
    ok: true,
    orderId: ORDER_ID,
    orderStatus: "accepted",
    orderStatusVersion: 2,
    outcome: "accepted",
    schemaVersion: "pos-customer-order-ack-v1",
    serverTime: "2026-08-03T10:01:02.000Z",
    ...overrides,
  };
}

function claimRequest(overrides = {}) {
  return {
    deviceToken: "mcpos_device_fixture",
    limit: 10,
    posSessionId: SESSION_ID,
    schemaVersion: "pos-customer-order-handoff-v1",
    sessionToken: "mcpos_session_fixture",
    shopDeviceId: DEVICE_ID,
    ...overrides,
  };
}

function ackRequest(overrides = {}) {
  return {
    deviceToken: "mcpos_device_fixture",
    expectedStatusVersion: 2,
    handoffId: HANDOFF_ID,
    idempotencyKey: ACK_KEY,
    leaseToken: LEASE_TOKEN,
    outcome: "accepted",
    posSessionId: SESSION_ID,
    schemaVersion: "pos-customer-order-ack-v1",
    sessionToken: "mcpos_session_fixture",
    shopDeviceId: DEVICE_ID,
    ...overrides,
  };
}

function loadService({ lease = runtimeLease(), rpcData = claimRpcResponse(), rpcError = null } = {}) {
  const calls = [];
  const audits = [];
  const supabase = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: rpcData, error: rpcError };
    },
  };
  const service = transpileCommonJs(
    "src/server/pos-auth/customer-order-handoff.ts",
    {
      "@/lib/supabase/admin": {
        createSupabaseAdminClient: () => supabase,
        resolveSupabaseAdminConfig: () => ({
          serviceRoleKey: "redacted",
          status: "configured",
          url: "https://example.invalid",
        }),
      },
      "./runtime-boundary": {
        loadPosRuntimeLease: async () => lease,
        writePosRuntimeAudit: async (_client, input) => {
          audits.push(input);
          return true;
        },
      },
      "./tokens": {
        verifyPosSecret: () => true,
      },
    },
  );
  return { audits, calls, service };
}

test("TASK-030 exposes bounded POST-only claim and ack routes", () => {
  for (const path of [
    "src/app/api/pos/orders/claim/route.ts",
    "src/app/api/pos/orders/ack/route.ts",
  ]) {
    const route = read(path);
    for (const marker of [
      'export const dynamic = "force-dynamic"',
      'export const runtime = "nodejs"',
      "MAX_POS_CUSTOMER_ORDER_JSON_BODY_BYTES",
      "readPosJsonBody",
      "posJsonResponse",
      "posMethodNotAllowedResponse",
      "methodNotAllowed as DELETE",
      "methodNotAllowed as GET",
      "methodNotAllowed as PATCH",
      "methodNotAllowed as PUT",
    ]) {
      assert.ok(route.includes(marker), `${path}: ${marker}`);
    }
    assert.doesNotMatch(
      route,
      /createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|service_role/i,
    );
  }
});

test("TASK-030 valid claim derives the tenant from the runtime lease", async () => {
  const { audits, calls, service } = loadService();
  const result = await service.handlePosCustomerOrderClaim(claimRequest(), {
    route: "pos.orders.claim",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.handoffs.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "pos_customer_order_claim_v1");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), {
    p_limit: 10,
    p_pos_session_id: SESSION_ID,
    p_shop_device_id: DEVICE_ID,
    p_shop_id: SHOP_ID,
    p_staff_id: STAFF_ID,
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].metadata.handoff_count, 1);
});

test("TASK-030 valid ack sends only server-derived runtime identity", async () => {
  const { audits, calls, service } = loadService({ rpcData: ackRpcResponse() });
  const result = await service.handlePosCustomerOrderAck(ackRequest(), {
    route: "pos.orders.ack",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, "accepted");
  assert.equal(calls[0].name, "pos_customer_order_ack_v1");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)), {
    p_ack_idempotency_key: ACK_KEY,
    p_expected_status_version: 2,
    p_handoff_id: HANDOFF_ID,
    p_lease_token: LEASE_TOKEN,
    p_outcome: "accepted",
    p_pos_sale_id: null,
    p_pos_session_id: SESSION_ID,
    p_shop_device_id: DEVICE_ID,
    p_shop_id: SHOP_ID,
    p_staff_id: STAFF_ID,
  });
  assert.equal(audits[0].metadata.outcome, "accepted");
});

test("TASK-030 rejects unknown request fields, unbounded batches and fiscal misuse", async () => {
  const fixture = loadService();

  assert.equal(
    (await fixture.service.handlePosCustomerOrderClaim(claimRequest({ shopId: SHOP_ID }))).body.code,
    "validation_failed",
  );
  assert.equal(
    (await fixture.service.handlePosCustomerOrderClaim(claimRequest({ limit: 26 }))).body.code,
    "validation_failed",
  );
  assert.equal(
    (
      await fixture.service.handlePosCustomerOrderAck(
        ackRequest({ posSaleId: "a0000000-0000-4000-8000-000000030001" }),
      )
    ).body.code,
    "validation_failed",
  );
  assert.equal(fixture.calls.length, 0);
});

test("TASK-030 rejects leaked internal fields even if the DB response is otherwise valid", async () => {
  const leaked = claimRpcResponse();
  leaked.handoffs[0].order.items[0].sourceProductId =
    "a0000000-0000-4000-8000-000000030001";
  const { service } = loadService({ rpcData: leaked });
  const result = await service.handlePosCustomerOrderClaim(claimRequest());

  assert.equal(result.status, 500);
  assert.equal(result.body.code, "db_failure");
});

test("TASK-030 preserves auth denial and terminal ack conflicts", async () => {
  const denied = loadService({ lease: runtimeLease("denied") });
  const deniedResult = await denied.service.handlePosCustomerOrderClaim(claimRequest());
  assert.equal(deniedResult.status, 401);
  assert.equal(deniedResult.body.code, "denied");
  assert.equal(denied.calls.length, 0);

  const conflict = loadService({
    rpcData: {
      code: "version_conflict",
      currentStatus: "ready",
      currentStatusVersion: 4,
      ok: false,
      schemaVersion: "pos-customer-order-ack-v1",
    },
  });
  const conflictResult = await conflict.service.handlePosCustomerOrderAck(ackRequest());
  assert.equal(conflictResult.status, 409);
  assert.equal(conflictResult.body.code, "version_conflict");
});

test("TASK-030 migration keeps handoff, order and fiscal sale distinct", () => {
  const migration = read(
    "supabase/migrations/20260803060000_storefront_v1_pos_order_handoff.sql",
  );
  for (const marker of [
    "create table public.customer_order_pos_receipts",
    "customer_order_pos_receipts_guard_append_only",
    "app_private.pos_runtime_lease_is_valid_v1",
    "for update of outbox skip locked",
    "lease_expires_at > v_now",
    "customer_order.accepted.v1",
    "actor_kind = 'pos'",
    "sale.business_kind = 'sale'",
    "sale.total = v_order.total_clp::numeric",
    "to service_role",
    "from public, anon, authenticated",
  ]) {
    assert.ok(migration.includes(marker), marker);
  }
  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.pos_(sales|sale_lines|revenue_ledger_entries)/i,
  );
});
