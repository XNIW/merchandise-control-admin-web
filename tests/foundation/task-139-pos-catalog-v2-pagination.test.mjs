import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTranspiledModule = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadContract() {
  const relativePath = "src/server/pos-auth/catalog-sync-contract.ts";
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };
  const context = createContext({
    Buffer,
    exports: cjsModule.exports,
    module: cjsModule,
    require: requireForTranspiledModule,
  });

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    context,
  );
  return cjsModule.exports;
}

function rowsFor(count, timestamp = "2026-07-19T17:06:00.123456+00:00") {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${String(index).padStart(6, "0")}`,
    updated_at: timestamp,
  }));
}

function drain(helper, rows, limit) {
  const seen = new Set();
  let after = null;
  let pages = 0;

  while (true) {
    const page = helper.pageCatalogRowsByKeyset(rows, after, limit);
    pages += 1;

    for (const row of page.rows) {
      assert.equal(seen.has(row.id), false, `duplicate row ${row.id}`);
      seen.add(row.id);
    }

    if (!page.hasMore) {
      break;
    }

    const last = page.rows.at(-1);
    assert.ok(last, "a continuation page must have a key");
    after = { id: last.id, updatedAt: last.updated_at };
    assert.ok(pages <= Math.ceil(rows.length / limit) + 1, "pagination loop");
  }

  return { pages, seen };
}

test("TASK-139 keyset drains exact boundary datasets without gaps or duplicates", () => {
  const helper = loadContract();

  for (const count of [0, 1, 999, 1000, 1001, 19_763, 100_000]) {
    const result = drain(helper, rowsFor(count), 1000);
    assert.equal(result.seen.size, count, `dataset ${count}`);
    assert.equal(result.pages, Math.max(1, Math.ceil(count / 1000)));
  }
});

test("TASK-139 keyset preserves PostgreSQL microseconds inside one millisecond", () => {
  const helper = loadContract();
  const rows = [
    { id: "z", updated_at: "2026-07-19T17:06:00.123456+00:00" },
    { id: "a", updated_at: "2026-07-19T17:06:00.123457+00:00" },
  ];
  const first = helper.pageCatalogRowsByKeyset(rows, null, 1);
  const second = helper.pageCatalogRowsByKeyset(
    rows,
    { id: first.rows[0].id, updatedAt: first.rows[0].updated_at },
    1,
  );

  assert.equal(first.rows[0].id, "z");
  assert.equal(second.rows[0].id, "a");
  assert.equal(second.hasMore, false);
});

test("TASK-139 signed cursor is compact, bound, expiring and precision-safe", () => {
  const helper = loadContract();
  const serverTime = "2026-07-19T17:06:30.000Z";
  const context = {
    posSessionId: "11111111-1111-4111-8111-111111111111",
    shopDeviceId: "22222222-2222-4222-8222-222222222222",
    shopId: "33333333-3333-4333-8333-333333333333",
    signingKey: "test-only-signing-key-with-enough-entropy",
  };
  const state = {
    afterId: "44444444-4444-4444-8444-444444444444",
    afterUpdatedAt: "2026-07-19T17:06:00.123456+00:00",
    expiresAtUnixSeconds: Math.floor(Date.parse(serverTime) / 1000) + 3600,
    lane: "products",
    lowerBound: "2026-07-18T00:00:00.000Z",
    manifest: {
      catalogSummary: {
        activeProducts: 100000,
        categories: 999,
        prices: 100000,
        products: 100000,
        suppliers: 1000,
      },
      windowCounts: {
        categories: 999,
        prices: 100000,
        products: 100000,
        suppliers: 1000,
      },
    },
    mode: "delta",
    pageSize: 1000,
    revision: "19763",
    scopeKey: "0123456789abcdef0123456789abcdef",
    scopeKind: "shop_scoped",
    snapshotAt: "2026-07-19T17:06:00.654321+00:00",
  };
  const cursor = helper.buildCatalogV2Cursor(state, context);
  const decoded = helper.decodeCatalogV2Cursor(cursor, serverTime, context);

  assert.ok(cursor.length <= helper.MAX_CATALOG_V2_CURSOR_LENGTH);
  assert.equal(decoded.ok, true);
  assert.equal(
    helper.catalogV2TimestampsEqual(
      decoded.state.afterUpdatedAt,
      state.afterUpdatedAt,
    ),
    true,
  );
  assert.equal(
    helper.catalogV2TimestampsEqual(decoded.state.snapshotAt, state.snapshotAt),
    true,
  );
  assert.equal(decoded.state.manifest.catalogSummary.products, 100000);

  const encodedPayload = cursor
    .slice("catalog-v2:".length, cursor.lastIndexOf("."));
  const plaintextPayload = Buffer.from(encodedPayload, "base64url").toString(
    "utf8",
  );
  assert.equal(plaintextPayload.includes(context.shopId), false);
  assert.equal(plaintextPayload.includes(state.afterId), false);

  const maximumSafeCount = Number.MAX_SAFE_INTEGER;
  const maximumDomainCursor = helper.buildCatalogV2Cursor(
    {
      ...state,
      expiresAtUnixSeconds: Number.MAX_SAFE_INTEGER,
      manifest: {
        catalogSummary: {
          activeProducts: maximumSafeCount,
          categories: maximumSafeCount,
          prices: maximumSafeCount,
          products: maximumSafeCount,
          suppliers: maximumSafeCount,
        },
        windowCounts: {
          categories: maximumSafeCount,
          prices: maximumSafeCount,
          products: maximumSafeCount,
          suppliers: maximumSafeCount,
        },
      },
      revision: "9223372036854775807",
    },
    context,
  );
  const maximumDomainDecoded = helper.decodeCatalogV2Cursor(
    maximumDomainCursor,
    serverTime,
    context,
  );

  assert.ok(maximumDomainCursor.length <= helper.MAX_CATALOG_V2_CURSOR_LENGTH);
  assert.equal(maximumDomainDecoded.ok, true);
  assert.equal(
    maximumDomainDecoded.state.manifest.catalogSummary.products,
    maximumSafeCount,
  );
  assert.equal(maximumDomainDecoded.state.revision, "9223372036854775807");

  for (const postgresUuid of [
    "01890f92-e4f8-7cc0-98c4-dc0c0c07398f",
    "00000000-0000-0000-0000-000000000000",
  ]) {
    const postgresUuidCursor = helper.buildCatalogV2Cursor(
      { ...state, afterId: postgresUuid },
      context,
    );
    const postgresUuidDecoded = helper.decodeCatalogV2Cursor(
      postgresUuidCursor,
      serverTime,
      context,
    );

    assert.equal(postgresUuidDecoded.ok, true);
    assert.equal(postgresUuidDecoded.state.afterId, postgresUuid);
  }

  const altered = `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`;
  assert.equal(
    helper.decodeCatalogV2Cursor(altered, serverTime, context).code,
    "catalog_cursor_rejected",
  );
  for (const foreignContext of [
    {
      ...context,
      posSessionId: "55555555-5555-4555-8555-555555555555",
    },
    {
      ...context,
      shopDeviceId: "66666666-6666-4666-8666-666666666666",
    },
    {
      ...context,
      shopId: "77777777-7777-4777-8777-777777777777",
    },
  ]) {
    assert.equal(
      helper.decodeCatalogV2Cursor(cursor, serverTime, foreignContext).code,
      "catalog_cursor_rejected",
    );
  }

  assert.equal(
    helper.resolveCatalogSyncRequest(
      { limit: 999, syncCursor: cursor, updatedSince: "" },
      serverTime,
      context,
    ).code,
    "catalog_cursor_rejected",
  );
  assert.equal(
    helper.resolveCatalogSyncRequest(
      { limit: 1000, syncCursor: "catalog-v1:e30", updatedSince: "" },
      serverTime,
      context,
    ).code,
    "catalog_cursor_rejected",
  );

  const expired = helper.buildCatalogV2Cursor(
    {
      ...state,
      expiresAtUnixSeconds: Math.floor(Date.parse(serverTime) / 1000) - 1,
    },
    context,
  );
  assert.equal(
    helper.decodeCatalogV2Cursor(expired, serverTime, context).code,
    "catalog_cursor_expired",
  );
});

test("TASK-139 migration and heartbeat expose only the additive v2 contract", () => {
  const migration = read(
    "supabase/migrations/20260719170600_task_139_pos_catalog_v2_pagination_snapshot.sql",
  );
  const service = read("src/server/pos-auth/service.ts");
  const config = read("supabase/config.toml");

  assert.match(migration, /limit p_limit \+ 1/);
  assert.match(migration, /returns jsonb/);
  assert.match(migration, /language plpgsql\s+stable/);
  assert.match(migration, /on conflict \(shop_id\) do update/);
  assert.match(migration, /for each statement/);
  assert.match(migration, /p_expected_revision/);
  assert.match(migration, /p_expected_scope_key/);
  assert.match(migration, /'scopeKey', current_scope_key/);
  assert.doesNotMatch(migration, /'scopeId', resolved\.scope_id/);
  assert.match(migration, /p_include_manifest is null/);
  assert.match(migration, /p_mode = 'full_refresh' and p_lower_bound is not null/);
  assert.match(migration, /snapshot_changed/);
  assert.match(migration, /product\.id = row\.product_id/);
  assert.match(migration, /product\.deleted_at is null/);
  assert.match(
    migration,
    /disable trigger task088_mobile_price_append_only;[\s\S]*disable trigger task088_mobile_sync_event;[\s\S]*update public\.inventory_product_prices[\s\S]*enable trigger task088_mobile_sync_event;[\s\S]*enable trigger task088_mobile_price_append_only;/,
  );
  assert.match(migration, /created_at::timestamp without time zone at time zone 'UTC'/);
  assert.match(migration, /created_at::timestamptz/);
  assert.match(migration, /to service_role/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.doesNotMatch(
    migration,
    /pos_catalog_revisions[\s\S]{0,200}references public\.shops/,
  );
  assert.match(config, /max_rows\s*=\s*1000/);

  for (const field of [
    "catalogRevision",
    "catalogChangesAvailable",
    "nextPollAfterSeconds",
  ]) {
    assert.match(service, new RegExp(field));
  }
  assert.match(service, /revision lookup failure must not/);
  assert.doesNotMatch(service, /catalog_revision:\s*parsed\.catalogRevision/);
});
