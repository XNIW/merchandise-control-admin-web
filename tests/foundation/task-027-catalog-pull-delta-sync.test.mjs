import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const defaultWin7PosRoot = "/Users/minxiang/Projects/Win7POS";
const win7PosRoot =
  process.env.WIN7POS_REPO_PATH?.trim() || defaultWin7PosRoot;
const requireWin7PosRepo = process.env.REQUIRE_WIN7POS_REPO === "1";
const requireForTranspiledModule = createRequire(import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function shouldSkipMissingWin7PosRepo() {
  return !existsSync(win7PosRoot) && !requireWin7PosRepo;
}

function loadTypeScriptModule(relativePath) {
  const absolutePath = join(root, relativePath);
  const source = readFileSync(absolutePath, "utf8");
  const transpiled = ts.transpileModule(source, {
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

test("TASK-027 catalog sync helper validates updated_since, limits, cursors and page windows", () => {
  const helperPath = "src/server/pos-auth/catalog-sync-contract.ts";

  assert.equal(existsSync(join(root, helperPath)), true, `${helperPath} is missing`);

  const helper = loadTypeScriptModule(helperPath);
  const serverTime = "2026-06-01T12:00:00.000Z";
  const firstPull = helper.parseCatalogSyncOptions({}, serverTime);
  const deltaPull = helper.parseCatalogSyncOptions(
    { limit: 2, updated_since: "2026-06-01T10:00:00Z" },
    serverTime,
  );
  const invalidPull = helper.parseCatalogSyncOptions(
    { updated_since: "not-a-date" },
    serverTime,
  );
  const invalidCursor = `catalog-v1:${Buffer.from(
    JSON.stringify({
      lowerBound: "not-a-date",
      offsets: {
        categories: 0,
        prices: 0,
        products: 0,
        suppliers: 0,
      },
      upperBound: serverTime,
      version: 1,
    }),
  ).toString("base64url")}`;
  const invalidCursorPull = helper.parseCatalogSyncOptions(
    { syncCursor: invalidCursor },
    serverTime,
  );
  const futureOpaqueCursor = `catalog-v1:${Buffer.from(
    JSON.stringify({
      lowerBound: "2026-06-01T10:00:00.000Z",
      offsets: {
        categories: 0,
        prices: 0,
        products: 0,
        suppliers: 0,
      },
      upperBound: "2026-06-01T12:02:00.001Z",
      version: 1,
    }),
  ).toString("base64url")}`;
  const invertedOpaqueCursor = `catalog-v1:${Buffer.from(
    JSON.stringify({
      lowerBound: "2026-06-01T10:05:00.000Z",
      offsets: {
        categories: 0,
        prices: 0,
        products: 0,
        suppliers: 0,
      },
      upperBound: "2026-06-01T10:00:00.000Z",
      version: 1,
    }),
  ).toString("base64url")}`;
  const futureCursorPull = helper.parseCatalogSyncOptions(
    { syncCursor: futureOpaqueCursor },
    serverTime,
  );
  const invertedCursorPull = helper.parseCatalogSyncOptions(
    { syncCursor: invertedOpaqueCursor },
    serverTime,
  );

  assert.equal(firstPull.ok, true);
  assert.equal(firstPull.options.mode, "full_refresh");
  assert.equal(firstPull.options.lowerBound, null);
  assert.equal(firstPull.options.upperBound, serverTime);
  assert.equal(firstPull.options.limit, helper.DEFAULT_CATALOG_SYNC_LIMIT);

  assert.equal(deltaPull.ok, true);
  assert.equal(deltaPull.options.mode, "delta");
  assert.equal(deltaPull.options.lowerBound, "2026-06-01T10:00:00.000Z");
  const deltaRange = helper.catalogRangeFor(deltaPull.options, "products");
  assert.equal(deltaRange.from, 0);
  assert.equal(deltaRange.to, 2);

  assert.equal(invalidPull.ok, false);
  assert.equal(invalidPull.code, "validation_failed");
  assert.equal(invalidCursorPull.ok, false);
  assert.equal(invalidCursorPull.code, "validation_failed");
  assert.equal(futureCursorPull.ok, false);
  assert.equal(futureCursorPull.code, "validation_failed");
  assert.equal(invertedCursorPull.ok, false);
  assert.equal(invertedCursorPull.code, "validation_failed");

  const nextCursor = helper.buildNextCatalogSyncCursor(deltaPull.options, {
    categories: { hasMore: false, returned: 1 },
    prices: { hasMore: false, returned: 0 },
    products: { hasMore: true, returned: 2 },
    suppliers: { hasMore: false, returned: 0 },
  });
  const cursorPull = helper.parseCatalogSyncOptions(
    { syncCursor: nextCursor, limit: 2 },
    "2026-06-01T12:05:00.000Z",
  );

  assert.equal(cursorPull.ok, true);
  assert.equal(cursorPull.options.mode, "delta");
  assert.equal(cursorPull.options.upperBound, serverTime);
  assert.equal(cursorPull.options.offsets.products, 2);
});

test("TASK-027 catalog cursor guardrail covers modes, limit clamp, final cursor and paged offsets", () => {
  const helper = loadTypeScriptModule(
    "src/server/pos-auth/catalog-sync-contract.ts",
  );
  const serverTime = "2026-06-01T12:00:00.000Z";
  const fullPull = helper.parseCatalogSyncOptions({}, serverTime);
  const deltaPull = helper.parseCatalogSyncOptions(
    {
      limit: helper.MAX_CATALOG_SYNC_LIMIT + 50,
      updatedSince: "2026-06-01T10:00:00.000Z",
    },
    serverTime,
  );

  assert.equal(fullPull.ok, true);
  assert.equal(fullPull.options.mode, "full_refresh");
  assert.equal(fullPull.options.cursorSource, "none");
  assert.equal(fullPull.options.lowerBound, null);

  assert.equal(deltaPull.ok, true);
  assert.equal(deltaPull.options.mode, "delta");
  assert.equal(deltaPull.options.limit, helper.MAX_CATALOG_SYNC_LIMIT);
  assert.equal(deltaPull.options.lowerBound, "2026-06-01T10:00:00.000Z");

  const finalCursor = helper.buildNextCatalogSyncCursor(deltaPull.options, {
    categories: { hasMore: false, returned: 1 },
    prices: { hasMore: false, returned: 2 },
    products: { hasMore: false, returned: 3 },
    suppliers: { hasMore: false, returned: 4 },
  });

  assert.equal(finalCursor, deltaPull.options.upperBound);

  const pagedCursor = helper.buildNextCatalogSyncCursor(deltaPull.options, {
    categories: { hasMore: false, returned: 1 },
    prices: { hasMore: true, returned: 2 },
    products: { hasMore: true, returned: 3 },
    suppliers: { hasMore: false, returned: 4 },
  });
  const pagedPull = helper.parseCatalogSyncOptions(
    {
      limit: 25,
      syncCursor: pagedCursor,
    },
    "2026-06-01T12:05:00.000Z",
  );

  assert.equal(pagedPull.ok, true);
  assert.equal(pagedPull.options.mode, "delta");
  assert.equal(pagedPull.options.lowerBound, deltaPull.options.lowerBound);
  assert.equal(pagedPull.options.upperBound, deltaPull.options.upperBound);
  assert.equal(
    JSON.stringify(pagedPull.options.offsets),
    JSON.stringify({
      categories: 1,
      prices: 2,
      products: 3,
      suppliers: 4,
    }),
  );

  const invalidCursorPull = helper.parseCatalogSyncOptions(
    { syncCursor: "catalog-v1:not-json" },
    serverTime,
  );
  const wrongVersionCursor = `catalog-v1:${Buffer.from(
    JSON.stringify({
      lowerBound: "2026-06-01T10:00:00.000Z",
      offsets: {
        categories: 0,
        prices: 0,
        products: 0,
        suppliers: 0,
      },
      upperBound: serverTime,
      version: 2,
    }),
  ).toString("base64url")}`;
  const badOffsetCursor = `catalog-v1:${Buffer.from(
    JSON.stringify({
      lowerBound: "2026-06-01T10:00:00.000Z",
      offsets: {
        categories: 0,
        prices: -1,
        products: 0,
        suppliers: 0,
      },
      upperBound: serverTime,
      version: 1,
    }),
  ).toString("base64url")}`;
  const wrongVersionPull = helper.parseCatalogSyncOptions(
    { syncCursor: wrongVersionCursor },
    serverTime,
  );
  const badOffsetPull = helper.parseCatalogSyncOptions(
    { syncCursor: badOffsetCursor },
    serverTime,
  );
  const futureUpdatedSincePull = helper.parseCatalogSyncOptions(
    { updated_since: "2026-06-01T12:01:00.001Z" },
    serverTime,
  );

  assert.equal(invalidCursorPull.ok, false);
  assert.equal(invalidCursorPull.code, "validation_failed");
  assert.equal(wrongVersionPull.ok, false);
  assert.equal(wrongVersionPull.code, "validation_failed");
  assert.equal(badOffsetPull.ok, false);
  assert.equal(badOffsetPull.code, "validation_failed");
  assert.equal(futureUpdatedSincePull.ok, false);
  assert.equal(futureUpdatedSincePull.code, "validation_failed");
});

test("TASK-027 catalog sync helper maps active rows, tombstones and catalog version from representative data", () => {
  const helper = loadTypeScriptModule(
    "src/server/pos-auth/catalog-sync-contract.ts",
  );
  const rows = [
    {
      barcode: "A-100",
      deleted_at: null,
      id: "product-a",
      product_name: "Alpha",
      updated_at: "2026-06-01T10:15:00.000Z",
    },
    {
      barcode: "B-200",
      deleted_at: "2026-06-01T10:20:00.000Z",
      id: "product-b",
      product_name: "Archived",
      updated_at: "2026-06-01T10:20:00.000Z",
    },
  ];

  const split = helper.splitCatalogTombstones(rows);
  const version = helper.computeCatalogVersion({
    categories: [
      {
        deleted_at: null,
        id: "category-a",
        name: "Beverage",
        updated_at: "2026-06-01T10:10:00.000Z",
      },
    ],
    prices: [
      {
        created_at: "2026-06-01 10:30:00",
        id: "price-a",
        product_id: "product-a",
      },
    ],
    products: rows,
    suppliers: [
      {
        deleted_at: null,
        id: "supplier-a",
        name: "Supplier",
        updated_at: "2026-06-01T10:05:00.000Z",
      },
    ],
  });
  const changedVersion = helper.computeCatalogVersion({
    categories: [],
    prices: [],
    products: [
      {
        barcode: "A-100",
        deleted_at: null,
        id: "product-a",
        product_name: "Alpha changed",
        updated_at: "2026-06-01T10:45:00.000Z",
      },
    ],
    suppliers: [],
  });

  assert.equal(split.active.map((row) => row.id).join(","), "product-a");
  assert.equal(split.tombstones.map((row) => row.id).join(","), "product-b");
  assert.match(version, /^catalog:v1:/);
  assert.notEqual(version, changedVersion);
});

test("TASK-027 POS catalog pull service supports delta contract without destructive purge", () => {
  const servicePath = "src/server/pos-auth/catalog-pull.ts";
  const routePath = "src/app/api/pos/catalog/pull/route.ts";
  const routeSecurityPath = "src/app/api/pos/_shared/pos-route-security.ts";
  const service = readProjectFile(servicePath);
  const revision = readProjectFile("src/server/pos-auth/catalog-revision.ts");
  const route = readProjectFile(routePath);
  const routeSecurity = readProjectFile(routeSecurityPath);
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const combined = `${service}\n${revision}\n${route}\n${routeSecurity}`;

  for (const required of [
    "parseCatalogSyncRequest",
    "resolveCatalogSyncRequest",
    "loadCatalogPageV2",
    "buildCatalogV2Cursor",
    "syncCursor",
    "serverTime",
    "catalogRevision",
    "catalogVersion",
    "catalogSummary",
    "hasMore",
    "tombstones",
    "splitCatalogTombstones",
    "product_tombstones",
    "category_tombstones",
    "supplier_tombstones",
    "deletedAt",
    "syncMode: sync.mode",
    "snapshotAt",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(required)));
  }

  assert.match(service, /cursorFingerprint/);
  assert.doesNotMatch(service, /sync_cursor:\s*(syncCursor|parsed\.syncRequest\.syncCursor)/);

  for (const required of [
    'rpc("pos_catalog_pull_page_v2"',
    "expectedRevision",
    "expectedScopeKey",
    "expectedScopeKind",
    "deleted_at",
    "Cache-Control",
    "no-store",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(required)));
  }

  assert.doesNotMatch(service, /\.(delete|upsert)\s*\(/);
  assert.doesNotMatch(service, /\.range\s*\(/);
  assert.doesNotMatch(combined, /truncate|purge|replace_all|full\s+delete/i);
  assert.doesNotMatch(combined, /sale_lines|sales_sync|payment|cash_close|bidirectional/i);
  assert.match(scanner, /checkTask027CatalogPullDeltaSync/);
});

test("TASK-027 catalog delta performance indexes stay additive and aligned with cursor-v1", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260628180000_task_089_catalog_delta_indexes.sql",
  );
  const architecture = readProjectFile("docs/POS_SYNC_ARCHITECTURE.md");

  for (const required of [
    "inventory_products_shop_updated_id_idx",
    "inventory_categories_shop_updated_id_idx",
    "inventory_suppliers_shop_updated_id_idx",
    "inventory_product_prices_shop_created_id_idx",
    "inventory_products_legacy_owner_updated_id_idx",
    "inventory_categories_legacy_owner_updated_id_idx",
    "inventory_suppliers_legacy_owner_updated_id_idx",
    "inventory_product_prices_legacy_owner_created_id_idx",
    "create index if not exists",
    "where shop_id is null",
    "where shop_id is not null",
  ]) {
    assert.match(migration, new RegExp(escapeRegExp(required)));
  }

  assert.doesNotMatch(migration, /\b(drop|alter table|create table|policy)\b/i);
  assert.doesNotMatch(migration, /concurrently/i);
  assert.match(architecture, /TASK_SYNC_PERF_\*/);
  assert.match(architecture, /EXPLAIN \(ANALYZE, BUFFERS\)/);
  assert.match(architecture, /catalog-v1/);
  assert.match(architecture, /catalog-v2/);
});

test("TASK-027 Shop Admin diagnostics expose real catalog pull audit state", () => {
  const readModel = readProjectFile("src/server/shop-admin/pos-live-read-model.ts");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  for (const required of [
    "metadata_redacted",
    "latestCatalogSyncAt",
    "latestCatalogVersion",
    "latestCatalogCursor",
    "catalogSyncErrors",
    "pos.catalog.pull.success",
  ]) {
    assert.match(readModel, new RegExp(escapeRegExp(required)));
  }

  for (const required of [
    "Catalog sync",
    "Catalog errors",
    "Catalog cursor",
    "latestCatalogVersion",
    "latestCatalogCursor",
  ]) {
    assert.match(sectionData, new RegExp(escapeRegExp(required)));
  }
});

test("TASK-027 existing Win7POS catalog client uses saved cursor and light retry", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

  assert.equal(existsSync(win7PosRoot), true, "Win7POS repo is missing");

  const client = [
    readWin7PosFile("src/Win7POS.Data/Online/PosAdminWebClient.cs"),
    readWin7PosFile("src/Win7POS.Core/Online/PosOnlineTransportContracts.cs"),
  ].join("\n");
  const service = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs",
  );
  const scanner = readWin7PosFile("scripts/check-pos-catalog-pull.ps1");

  for (const required of [
    "pos.catalog.last_sync_cursor",
    "StoreCatalogDiagnosticsAsync(",
    "StoreLastSyncAsync(",
    "lastResponse.SyncCursor",
    "CatalogPullWithRetryAsync",
    "Task.Delay",
    "MaxCatalogPullAttempts",
    "EnsureAndLoadCursorAsync",
    "SyncCursor = requestCursor",
  ]) {
    assert.match(service, new RegExp(escapeRegExp(required)));
  }

  for (const required of [
    'DataMember(Name = "syncCursor"',
    'DataMember(Name = "updated_since"',
    'DataMember(Name = "catalogVersion"',
    'DataMember(Name = "serverTime"',
    'DataMember(Name = "hasMore"',
    'DataMember(Name = "tombstones"',
    "PosCatalogTombstonesResponse",
  ]) {
    assert.match(client, new RegExp(escapeRegExp(required)));
  }

  assert.match(scanner, /pos\.catalog\.last_sync_cursor/);
  assert.match(scanner, /CatalogPullWithRetryAsync/);
  assert.match(scanner, /syncCursor/);
});

test("TASK-027 governance artifacts document contract, evidence and DONE reconciliation", () => {
  const taskPath =
    "docs/TASKS/TASK-027-catalog-pull-delta-sync-and-pos-catalog-hardening.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-027/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  for (const required of [
    "updated_since",
    "syncCursor",
    "catalogVersion",
    "serverTime",
    "hasMore",
    "tombstones",
    "no purge distruttivo",
    "DONE_RECONCILED_WITH_NOTES",
  ]) {
    assert.match(`${task}\n${evidence}`, new RegExp(escapeRegExp(required), "i"));
  }

  assert.match(masterPlan, /TASK-027 - Catalog pull delta sync and POS catalog hardening/);
  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`|Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`|Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`|Task attivo: `TASK-032 - Full project progression mega-task`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`|Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`|Task attivo: `TASK-139 - POS Catalog v2 Pagination and Snapshot Correctness`/,
  );
  assert.match(
    masterPlan,
    /Fase: `DONE_RECONCILED`|Fase: `PLANNING`|Fase: `REVIEW`|Fase: `EXECUTION`|Fase: `REVIEW_WITH_BLOCKERS`|Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`/,
  );
});
