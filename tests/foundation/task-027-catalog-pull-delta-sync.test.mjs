import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const win7PosRoot = "/Users/minxiang/Projects/Win7POS";
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
  const route = readProjectFile(routePath);
  const routeSecurity = readProjectFile(routeSecurityPath);
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const combined = `${service}\n${route}\n${routeSecurity}`;

  for (const required of [
    "parseCatalogSyncOptions",
    "updated_since",
    "syncCursor",
    "serverTime",
    "catalogVersion",
    "hasMore",
    "tombstones",
    "deletedAt",
    "syncMode: syncOptions.mode",
    "buildNextCatalogSyncCursor",
    "computeCatalogVersion",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(required)));
  }

  assert.match(service, /sync_cursor_preview/);
  assert.doesNotMatch(service, /sync_cursor:\s*syncCursor/);

  for (const required of [
    '.eq("owner_user_id", ownerUserId)',
    '.gte("updated_at", syncOptions.lowerBound)',
    '.lte("updated_at", syncOptions.upperBound)',
    ".range(",
    "deleted_at",
    "Cache-Control",
    "no-store",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(required)));
  }

  assert.doesNotMatch(combined, /\.(delete|upsert)\s*\(/);
  assert.doesNotMatch(combined, /truncate|purge|replace_all|full\s+delete/i);
  assert.doesNotMatch(combined, /sale_lines|sales_sync|payment|cash_close|bidirectional/i);
  assert.match(scanner, /checkTask027CatalogPullDeltaSync/);
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

test("TASK-027 existing Win7POS catalog client uses saved cursor and light retry", () => {
  assert.equal(existsSync(win7PosRoot), true, "Win7POS repo is missing");

  const client = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs",
  );
  const service = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs",
  );
  const scanner = readWin7PosFile("scripts/check-pos-catalog-pull.ps1");

  for (const required of [
    "pos.catalog.last_sync_cursor",
    "LoadLastCursorAsync",
    "StoreCatalogDiagnosticsAsync(result.Value",
    "StoreLastSyncAsync(response.SyncCursor",
    "CatalogPullWithRetryAsync",
    "Task.Delay",
    "MaxCatalogPullAttempts",
    "SyncCursor = await LoadLastCursorAsync",
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
    /Task attivo: `NESSUNO`|Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`|Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`|Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`|Task attivo: `TASK-032 - Full project progression mega-task`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`/,
  );
  assert.match(
    masterPlan,
    /Fase: `DONE_RECONCILED`|Fase: `PLANNING`|Fase: `REVIEW`|Fase: `EXECUTION`|Fase: `REVIEW_WITH_BLOCKERS`/,
  );
});
