import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
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

function runtimeLease() {
  return {
    credential: {
      token_hash: "fixture-device-hash",
    },
    device: {
      shop_device_id: "30000000-0000-4000-8000-000000000145",
      status: "active",
    },
    session: {
      pos_session_id: "40000000-0000-4000-8000-000000000145",
      session_token_hash: "fixture-session-hash",
      shop_device_id: "30000000-0000-4000-8000-000000000145",
      shop_id: "10000000-0000-4000-8000-000000000145",
      staff_credential_version: 7,
      staff_id: "20000000-0000-4000-8000-000000000145",
    },
    staff: {
      credential_version: 7,
    },
    status: "ok",
  };
}

function loadService(rpcResult, rpcError = null) {
  const calls = [];
  const supabase = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: rpcResult, error: rpcError };
    },
  };
  const response = json("contracts/pos/article-mutation-v1.response.json");
  const service = transpileCommonJs(
    "src/server/pos-auth/article-mutations.ts",
    {
      "@/lib/catalog-text-policy": {
        CATALOG_TEXT_LIMITS: {
          barcode: 96,
          itemNumber: 120,
          productName: 240,
          secondProductName: 240,
        },
        canonicalizeCatalogDisplayText(value) {
          return { changes: [], status: "unchanged", value: value.trim() };
        },
        validateCatalogIdentityText(value) {
          return { changes: [], status: "unchanged", value: value.trim() };
        },
      },
      "@/lib/supabase/admin": {
        createSupabaseAdminClient: () => supabase,
        resolveSupabaseAdminConfig: () => ({
          serviceRoleKey: "redacted",
          status: "configured",
          url: "https://example.invalid",
        }),
      },
      "./pos-contract": {
        POS_ARTICLE_MUTATION_SCHEMA_VERSION: "pos-article-mutation-v1",
      },
      "./runtime-boundary": {
        loadPosRuntimeLease: async () => runtimeLease(),
        writePosRuntimeAudit: async () => true,
      },
      "./tokens": {
        verifyPosSecret: () => true,
      },
    },
  );

  return { calls, response, service };
}

function payloadHash(mutation) {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        baseRevision: mutation.baseRevision,
        changes: mutation.changes,
        clientProductId: mutation.clientProductId,
        createdAt: mutation.createdAt,
        fieldMask: [...mutation.fieldMask].sort(),
        idempotencyKey: mutation.idempotencyKey,
        localSequence: mutation.localSequence,
        mutationId: mutation.mutationId,
        mutationKind: mutation.mutationKind,
        occurredAt: mutation.occurredAt,
        remoteProductId: mutation.remoteProductId,
      }),
      "utf8",
    )
    .digest("hex")}`;
}

test("TASK-145 route exposes only the bounded POST JSON boundary", () => {
  const route = read("src/app/api/pos/catalog/article-mutations/route.ts");

  for (const marker of [
    'export const dynamic = "force-dynamic"',
    'export const runtime = "nodejs"',
    "MAX_POS_ARTICLE_MUTATION_JSON_BODY_BYTES",
    "handlePosArticleMutations",
    "readPosJsonBody",
    "posJsonResponse",
    "posMethodNotAllowedResponse",
    '"pos.catalog.article_mutations"',
    "methodNotAllowed as DELETE",
    "methodNotAllowed as GET",
    "methodNotAllowed as HEAD",
    "methodNotAllowed as OPTIONS",
    "methodNotAllowed as PATCH",
    "methodNotAllowed as PUT",
  ]) {
    assert.ok(route.includes(marker), marker);
  }
  assert.doesNotMatch(
    route,
    /createSupabaseAdminClient|service_role|SUPABASE_SERVICE_ROLE_KEY/i,
  );
});

test("TASK-145 valid fixture reaches the lease-bound RPC and preserves ACK", async () => {
  const response = json("contracts/pos/article-mutation-v1.response.json");
  const request = json("contracts/pos/article-mutation-v1.request.json");
  const rpcResult = {
    ack: response.results[0].ack,
    code: "applied",
    deliveryStatus: "applied",
    ok: true,
  };
  const { calls, service } = loadService(rpcResult);
  const result = await service.handlePosArticleMutations(request, {
    requestId: "posreq_task145",
    route: "pos.catalog.article_mutations",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.results.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.body.results[0])),
    response.results[0],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "pos_article_mutation_apply_v1");
  assert.equal(
    calls[0].args.p_payload_hash,
    request.mutations[0].payloadHash,
  );
  assert.equal(calls[0].args.p_shop_id, request.shopId);
  assert.equal(calls[0].args.p_staff_id, request.staffId);
  assert.equal(calls[0].args.p_expected_credential_version, 7);
});

test("TASK-145 payload hash excludes attempt token but binds immutable intent", async () => {
  const request = json("contracts/pos/article-mutation-v1.request.json");
  const response = json("contracts/pos/article-mutation-v1.response.json");
  const { calls, service } = loadService({
    ack: response.results[0].ack,
    code: "duplicate_replay",
    deliveryStatus: "duplicate_replay",
    ok: true,
  });

  request.mutations[0].attemptToken = "task145-attempt-fixture-create-2";
  const retry = await service.handlePosArticleMutations(request);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.results[0].deliveryStatus, "duplicate_replay");
  assert.equal(calls.length, 1);

  request.mutations[0].changes.primaryName = "Changed immutable intent";
  const mismatch = await service.handlePosArticleMutations(request);
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.code, "validation_failed");
  assert.equal(calls.length, 1);
});

test("TASK-145 rejects unknown fields and batches above the bounded maximum", async () => {
  const request = json("contracts/pos/article-mutation-v1.request.json");
  const response = json("contracts/pos/article-mutation-v1.response.json");
  const { calls, service } = loadService({
    ack: response.results[0].ack,
    code: "applied",
    deliveryStatus: "applied",
    ok: true,
  });

  const unknownTopLevel = structuredClone(request);
  unknownTopLevel.untrusted = true;
  assert.equal(
    (await service.handlePosArticleMutations(unknownTopLevel)).body.code,
    "validation_failed",
  );

  const unknownMutationField = structuredClone(request);
  unknownMutationField.mutations[0].untrusted = true;
  assert.equal(
    (await service.handlePosArticleMutations(unknownMutationField)).body.code,
    "validation_failed",
  );

  const oversizedBatch = structuredClone(request);
  oversizedBatch.mutations = Array.from(
    { length: 26 },
    () => oversizedBatch.mutations[0],
  );
  assert.equal(
    (await service.handlePosArticleMutations(oversizedBatch)).body.code,
    "validation_failed",
  );

  const invalidCreateMask = structuredClone(request);
  invalidCreateMask.mutations[0].fieldMask = ["barcode"];
  invalidCreateMask.mutations[0].payloadHash = payloadHash(
    invalidCreateMask.mutations[0],
  );
  assert.equal(
    (await service.handlePosArticleMutations(invalidCreateMask)).body.code,
    "validation_failed",
  );
  assert.equal(calls.length, 0);
});

test("TASK-145 preserves terminal DB codes and maps a final lease fence to auth", async () => {
  const request = json("contracts/pos/article-mutation-v1.request.json");
  const serverTimestamp = "2026-07-28T08:30:00.123456Z";
  const terminal = loadService({
    catalogRevision: "145",
    code: "failed_validation",
    ok: false,
    serverTimestamp,
  });
  const terminalResult = await terminal.service.handlePosArticleMutations(request);

  assert.equal(terminalResult.status, 200);
  assert.equal(
    terminalResult.body.results[0].deliveryStatus,
    "failed_validation",
  );
  assert.equal(terminalResult.body.results[0].ack.retryable, false);
  assert.equal(terminalResult.body.results[0].ack.serverTimestamp, serverTimestamp);
  assert.equal(terminalResult.body.results[0].ack.catalogRevision, "145");

  const finalFence = loadService(null, { code: "42501" });
  const authResult = await finalFence.service.handlePosArticleMutations(request);
  assert.equal(authResult.status, 401);
  assert.equal(authResult.body.code, "auth_denied");
});

test("TASK-145 implementation covers all operations and explicit field intent", () => {
  const service = read("src/server/pos-auth/article-mutations.ts");
  const migration = read(
    "supabase/migrations/20260728064500_task_145_pos_article_mutation_v1.sql",
  );

  for (const mutationKind of [
    "product_create",
    "product_duplicate",
    "product_update",
    "product_activate",
    "product_deactivate",
    "product_retail_price_change",
    "product_purchase_price_change",
    "product_manual_stock_adjustment",
  ]) {
    assert.ok(service.includes(mutationKind), mutationKind);
    assert.ok(migration.includes(mutationKind), mutationKind);
  }
  for (const field of [
    "barcode",
    "itemNumber",
    "primaryName",
    "secondaryName",
    "categoryId",
    "supplierId",
  ]) {
    assert.ok(service.includes(field), field);
  }
  assert.match(service, /fieldMask\.length === 0/);
  assert.match(service, /stableHash\(canonicalIdentity\)/);
  assert.doesNotMatch(service, /supplier_excel/);
});

test("TASK-145 migration is receipt/revision/history/stock/audit atomic", () => {
  const migration = read(
    "supabase/migrations/20260728064500_task_145_pos_article_mutation_v1.sql",
  );

  for (const marker of [
    "create table if not exists public.pos_article_mutation_conflict_receipts",
    "create table if not exists public.pos_article_mutation_receipts",
    "pos_article_mutation_conflict_receipts_no_update_delete",
    "pos_article_mutation_receipts_no_update_delete",
    "app_private.pos_article_mutation_conflict_fingerprint_v1",
    "app_private.pos_article_mutation_store_conflict_v1",
    "app_private.pos_runtime_lease_is_valid_v1",
    "public.staff_role_permissions",
    "for update",
    "idempotency_payload_mismatch",
    "duplicate_replay",
    "target_not_found",
    "identity_conflict",
    "public.inventory_product_prices",
    "public.pos_sale_stock_movements",
    "'manual_adjustment'",
    "pos_article_mutation_cleanup_synthetic_v1",
    "sync_legacy_timestamp_is_canonical_v1",
    "generate_series(0, 1023)",
    "public.inventory_products",
    "app_private.pos_catalog_revisions",
    "public.audit_logs",
    "'pos.catalog.article_mutation.failure'",
    "POS lease expired before conflict receipt replay",
    "POS lease expired before conflict receipt publication",
    "POS lease expired before mutation receipt replay",
    "POS lease expired before article mutation publication",
    "set search_path = ''",
    "from public, anon, authenticated",
    "to service_role",
  ]) {
    assert.ok(migration.includes(marker), marker);
  }
  assert.doesNotMatch(
    migration,
    /insert into public\.pos_(sales|sale_lines|revenue_ledger_entries)/i,
  );
  assert.doesNotMatch(
    migration,
    /metadata_redacted[\s\S]{0,160}(deviceToken|sessionToken|credential_hash)/,
  );
});
