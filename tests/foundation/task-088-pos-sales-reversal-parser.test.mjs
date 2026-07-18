import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const nativeRequire = createRequire(import.meta.url);
const servicePath = "src/server/pos-auth/sales-sync.ts";

function queryResult(data) {
  const query = {
    eq() {
      return query;
    },
    maybeSingle() {
      return Promise.resolve({ data, error: null });
    },
    select() {
      return query;
    },
  };

  return query;
}

function loadSalesSyncService(rpcData) {
  const source = readFileSync(join(root, servicePath), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: servicePath,
  });
  const rpcCalls = [];
  const session = {
    expires_at: "2099-01-01T00:00:00.000Z",
    issued_at: "2026-07-15T00:00:00.000Z",
    pos_device_credential_id: "credential-001",
    pos_session_id: "11111111-1111-4111-8111-111111111111",
    session_token_hash: "stubbed",
    shop_device_id: "22222222-2222-4222-8222-222222222222",
    shop_id: "33333333-3333-4333-8333-333333333333",
    staff_credential_version: 1,
    staff_id: "44444444-4444-4444-8444-444444444444",
    status: "active",
  };
  const credential = {
    expires_at: "2099-01-01T00:00:00.000Z",
    pos_device_credential_id: session.pos_device_credential_id,
    shop_device_id: session.shop_device_id,
    shop_id: session.shop_id,
    staff_credential_version: 1,
    staff_id: session.staff_id,
    status: "active",
    token_hash: "stubbed",
  };
  const shop = {
    business_address: null,
    business_city: null,
    business_giro: null,
    company_rut: null,
    fiscal_identity_locked_by_platform: true,
    legal_representative_rut: null,
    shop_code: "TASK088",
    shop_id: session.shop_id,
    shop_name: "TASK-088 test shop",
    shop_status: "active",
    updated_at: "2026-07-15T00:00:00.000Z",
  };
  const staff = {
    credential_expires_at: "2099-01-01T00:00:00.000Z",
    credential_status: "active",
    credential_version: 1,
    locked_until: null,
    must_change_credential: false,
    session_invalidated_at: null,
    shop_id: session.shop_id,
    staff_id: session.staff_id,
    status: "active",
  };
  const device = {
    shop_device_id: session.shop_device_id,
    shop_id: session.shop_id,
    status: "active",
  };
  const supabase = {
    from(table) {
      if (table === "audit_logs") {
        return {
          insert() {
            return Promise.resolve({ error: null });
          },
        };
      }

      return queryResult(
        table === "pos_sessions"
          ? session
          : table === "pos_device_credentials"
            ? credential
            : table === "shops"
              ? shop
              : table === "staff_accounts"
                ? staff
                : table === "shop_devices"
                  ? device
                  : null,
      );
    },
    rpc(name, args) {
      rpcCalls.push({ args, name });
      return Promise.resolve({ data: rpcData, error: null });
    },
  };
  const cjsModule = { exports: {} };
  const localRequire = (id) => {
    if (id === "server-only") {
      return {};
    }

    if (id === "@/lib/supabase/admin") {
      return {
        createSupabaseAdminClient: () => supabase,
        resolveSupabaseAdminConfig: () => ({ status: "configured" }),
      };
    }

    if (id === "./shop-payload") {
      return {
        buildPosShopPayload: (value) => ({
          shopCode: value.shop_code,
          shopId: value.shop_id,
          shopName: value.shop_name,
          shopStatus: value.shop_status,
          source: "supabase_admin_server",
        }),
        POS_SHOP_SELECT: "shop_id,shop_code,shop_name,shop_status",
      };
    }

    if (id === "./pos-contract") {
      return {
        POS_LEGACY_SALES_SCHEMA_VERSION: "pos-sales-v1",
        POS_SALES_SCHEMA_VERSION: "pos-sales-ledger-v2",
      };
    }

    if (id === "./tokens") {
      return { verifyPosSecret: () => true };
    }

    return nativeRequire(id);
  };
  const context = createContext({
    Buffer,
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
  });

  new Script(transpiled.outputText, { filename: servicePath }).runInContext(context);

  return { rpcCalls, service: cjsModule.exports };
}

function reversalPayload({ discountClp, netClp, taxClp }) {
  return {
    batch: {
      clientBatchId: `batch-${Math.abs(netClp)}`,
      idempotencyKey: `batch-key-${Math.abs(netClp)}`,
    },
    deviceToken: "device-secret-value",
    posSessionId: "11111111-1111-4111-8111-111111111111",
    sales: [
      {
        amounts: {
          changeClp: 0,
          discountClp,
          grossClp: 100,
          netClp,
          paidClp: netClp,
          taxClp,
        },
        businessDate: "2026-07-15",
        clientOriginalSaleId: "original-sale-001",
        clientSaleId: `refund-${Math.abs(netClp)}`,
        currency: "CLP",
        discountTotal: discountClp,
        fiscal: { status: "not_required" },
        idempotencyKey: `refund-key-${Math.abs(netClp)}`,
        kind: "refund",
        lines: [
          {
            amountClp: -100,
            clientLineId: `refund-line-${Math.abs(netClp)}`,
            clientOriginalLineId: "original-line-001",
            linePosition: 1,
            lineTotal: 100,
            lineType: "item",
            productId: "55555555-5555-4555-8555-555555555555",
            quantity: 1,
            stockQuantityDelta: 1,
            unitAmountClp: 100,
            unitPrice: 100,
          },
        ],
        occurredAt: "2026-07-15T12:00:00.000Z",
        payments: [
          {
            amountClp: netClp,
            changeClp: 0,
            clientPaymentId: `refund-payment-${Math.abs(netClp)}`,
            method: "cash",
          },
        ],
        subtotal: 100,
        taxTotal: taxClp,
        total: Math.abs(netClp),
      },
    ],
    schemaVersion: "pos-sales-ledger-v2",
    sessionToken: "session-secret-value",
    shopCode: "TASK088",
    shopDeviceId: "22222222-2222-4222-8222-222222222222",
  };
}

function acceptedRpcResponse() {
  return {
    batch: {
      acceptedSaleCount: 1,
      clientBatchId: "batch-95",
      conflictCount: 0,
      duplicateSaleCount: 0,
      lineCount: 1,
      posSalesSyncBatchId: "66666666-6666-4666-8666-666666666666",
      saleCount: 1,
      status: "accepted",
    },
    code: "success",
    ok: true,
    sales: [
      {
        clientSaleId: "refund-95",
        posSaleId: "77777777-7777-4777-8777-777777777777",
        status: "accepted",
      },
    ],
  };
}

function zeroDiscountSalePayload() {
  const payload = reversalPayload({ discountClp: 0, netClp: 100, taxClp: 0 });
  const sale = payload.sales[0];

  payload.batch.clientBatchId = "batch-sale-100";
  payload.batch.idempotencyKey = "batch-key-sale-100";
  delete sale.clientOriginalSaleId;
  sale.clientSaleId = "sale-100";
  sale.idempotencyKey = "sale-key-100";
  sale.kind = "sale";
  sale.lines[0].amountClp = 100;
  sale.lines[0].clientLineId = "sale-line-100";
  delete sale.lines[0].clientOriginalLineId;
  sale.lines[0].stockQuantityDelta = -1;
  sale.payments[0].clientPaymentId = "sale-payment-100";

  return payload;
}

test("TASK-088 Win item-only reversal 100/10/5/-95 reaches the atomic RPC", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const result = await harness.service.handlePosSalesSync(
    reversalPayload({ discountClp: 10, netClp: -95, taxClp: 5 }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(harness.rpcCalls.length, 1);
  assert.equal(harness.rpcCalls[0].name, "pos_sales_sync_apply_v1");
  assert.equal(harness.rpcCalls[0].args.p_sales[0].netAmountClp, -95);
  assert.equal(harness.rpcCalls[0].args.p_sales[0].lines[0].amountClp, -100);
});

test("TASK-088 self-consistent legacy gross-only reversal reaches RPC for authoritative rejection", async () => {
  const harness = loadSalesSyncService({
    code: "validation_failed",
    ok: false,
  });
  const result = await harness.service.handlePosSalesSync(
    reversalPayload({ discountClp: 0, netClp: -100, taxClp: 0 }),
  );

  assert.equal(harness.rpcCalls.length, 1);
  assert.equal(harness.rpcCalls[0].args.p_sales[0].netAmountClp, -100);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "validation_failed");
});

test("TASK-088 zero-discount sale keeps the strict positive line-net contract", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const result = await harness.service.handlePosSalesSync(zeroDiscountSalePayload());

  assert.equal(result.status, 200);
  assert.equal(harness.rpcCalls.length, 1);
  assert.equal(harness.rpcCalls[0].args.p_sales[0].businessKind, "sale");
  assert.equal(harness.rpcCalls[0].args.p_sales[0].netAmountClp, 100);
  assert.equal(harness.rpcCalls[0].args.p_sales[0].lines[0].amountClp, 100);
});

test("TASK-088 payment/header change mismatch is rejected before the RPC", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const payload = reversalPayload({ discountClp: 10, netClp: -95, taxClp: 5 });
  payload.sales[0].amounts.changeClp = 7;

  const result = await harness.service.handlePosSalesSync(payload);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "validation_failed");
  assert.equal(harness.rpcCalls.length, 0);
});

test("TASK-137 mixed-sign sale tenders are rejected before the RPC", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const payload = zeroDiscountSalePayload();
  payload.sales[0].payments = [
    {
      amountClp: -900,
      changeClp: 0,
      clientPaymentId: "task137-negative-cash",
      method: "cash",
    },
    {
      amountClp: 1000,
      changeClp: 0,
      clientPaymentId: "task137-positive-card",
      method: "card",
    },
  ];

  const result = await harness.service.handlePosSalesSync(payload);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "validation_failed");
  assert.equal(harness.rpcCalls.length, 0);
});

test("TASK-137 refund cannot hide a positive tender behind change", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const payload = reversalPayload({ discountClp: 10, netClp: -95, taxClp: 5 });
  payload.sales[0].amounts.paidClp = 100;
  payload.sales[0].amounts.changeClp = 195;
  payload.sales[0].payments = [
    {
      amountClp: 100,
      changeClp: 195,
      clientPaymentId: "task137-positive-refund-cash",
      method: "cash",
    },
  ];

  const result = await harness.service.handlePosSalesSync(payload);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "validation_failed");
  assert.equal(harness.rpcCalls.length, 0);
});

test("TASK-137 void with a positive tender component is rejected before the RPC", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const payload = reversalPayload({ discountClp: 10, netClp: -95, taxClp: 5 });
  payload.sales[0].kind = "void";
  payload.sales[0].payments = [
    {
      amountClp: -100,
      changeClp: 0,
      clientPaymentId: "task137-negative-void-cash",
      method: "cash",
    },
    {
      amountClp: 5,
      changeClp: 0,
      clientPaymentId: "task137-positive-void-card",
      method: "card",
    },
  ];

  const result = await harness.service.handlePosSalesSync(payload);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "validation_failed");
  assert.equal(harness.rpcCalls.length, 0);
});

test("TASK-137 valid nonnegative split tender still reaches the RPC", async () => {
  const harness = loadSalesSyncService(acceptedRpcResponse());
  const payload = zeroDiscountSalePayload();
  payload.sales[0].payments = [
    {
      amountClp: 40,
      changeClp: 0,
      clientPaymentId: "task137-split-cash",
      method: "cash",
    },
    {
      amountClp: 60,
      changeClp: 0,
      clientPaymentId: "task137-split-card",
      method: "card",
    },
  ];

  const result = await harness.service.handlePosSalesSync(payload);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(harness.rpcCalls.length, 1);
});
