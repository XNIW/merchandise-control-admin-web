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

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
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
    Date,
    exports: cjsModule.exports,
    module: cjsModule,
    require: requireForTranspiledModule,
  });

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    context,
  );

  return cjsModule.exports;
}

// Legacy test name; canonical tracking is TASK-079.
test("TASK-079B governance is archived under canonical TASK-079", () => {
  const masterPlan = read("docs/MASTER-PLAN.md");
  const task079 = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const task079b = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079B-supplier-import-canonical-history-mobile-sync.md",
  );

  assertContains(masterPlan, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assertContains(masterPlan, "Riconciliazione governance TASK-079 2026-06-21");
  assertContains(masterPlan, "Avvio TASK-079B 2026-06-21");
  assertContains(task079, "079.2 Supplier Import to canonical History Entry");
  assertContains(task079, "Stato: `DONE_RECONCILED`");
  assertContains(task079b, "Stato: `REVIEW`");
  assertContains(task079b, "Fase attuale: `REVIEW`");
  assertContains(task079b, "Nessuna scrittura durante preview.");
});

test("TASK-079B mapper builds deterministic mobile-compatible payload v2", () => {
  const contract = loadTypeScriptModule(
    "src/server/shop-admin/supplier-import-history-entry-contract.ts",
  );
  const firstRemoteId =
    contract.buildDeterministicSupplierImportHistoryRemoteId("shop:digest");
  const secondRemoteId =
    contract.buildDeterministicSupplierImportHistoryRemoteId("shop:digest");
  const otherRemoteId =
    contract.buildDeterministicSupplierImportHistoryRemoteId("shop:other");

  assert.equal(firstRemoteId, secondRemoteId);
  assert.notEqual(firstRemoteId, otherRemoteId);
  assert.match(
    firstRemoteId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    contract.formatMobileHistoryTimestamp("2026-06-21T15:04:05.000Z"),
    "2026-06-21 15:04:05",
  );

  const payload = contract.buildSupplierImportHistoryEntryPayload({
    appliedAt: "2026-06-21T15:04:05.000Z",
    fileName: "Dingli June.xlsx",
    previewDigest: "preview-digest",
    rows: [
      {
        barcode: "ABC123",
        categoryName: "Tools",
        itemNumber: "IT-1",
        productName: "Widget",
        purchasePrice: 10.5,
        retailPrice: 14.25,
        rowNumber: 4,
        stockQuantity: 2,
        supplierName: "Dingli",
      },
      {
        barcode: "XYZ789",
        categoryName: "Tools",
        productName: "Second widget",
        purchasePrice: 8,
        retailPrice: 12,
        rowNumber: 5,
        stockQuantity: 1,
        supplierName: "Dingli",
      },
    ],
    shopId: "00000000-0000-0000-0000-000000000001",
  });

  assert.equal(payload.payloadVersion, 2);
  assert.equal(payload.isManualEntry, false);
  assert.equal(payload.timestamp, "2026-06-21 15:04:05");
  assert.equal(payload.supplier, "Dingli");
  assert.equal(payload.category, "Tools");
  assert.equal(payload.displayName, "Supplier import - Dingli - 2026-06-21");
  assert.deepEqual(Array.from(payload.data[0]), [
    "sourceRow",
    "barcode",
    "itemNumber",
    "productName",
    "quantity",
    "purchasePrice",
    "retailPrice",
    "supplier",
    "category",
    "oldPurchasePrice",
    "oldRetailPrice",
    "realQuantity",
    "RetailPrice",
    "complete",
  ]);
  assert.deepEqual(Array.from(payload.data[1]), [
    "4",
    "ABC123",
    "IT-1",
    "Widget",
    "2",
    "10.5",
    "14.25",
    "Dingli",
    "Tools",
    "10.5",
    "14.25",
    "",
    "",
    "",
  ]);
  assert.equal(payload.sessionOverlay.overlay_schema, 1);
  assert.equal(payload.sessionOverlay.editable.length, payload.data.length);
  assert.equal(payload.sessionOverlay.complete.length, payload.data.length);
  assert.deepEqual(Array.from(payload.sessionOverlay.editable[0]), ["", ""]);
  assert.equal(payload.sessionOverlay.complete.some(Boolean), false);
  assert.match(payload.payloadHash, /^[0-9a-f]{64}$/);
});

test("TASK-079B apply writes canonical history but preview remains side-effect free", () => {
  const previewRoute = read("src/app/shop/import-export/preview/route.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const historyMutations = read("src/server/shop-admin/history-mutations.ts");
  const ui = read("src/app/shop/_components/ImportExportActionPanel.tsx");
  const productsPage = read("src/app/shop/products/page.tsx");
  const mobileContract = read(
    "docs/TASKS/EVIDENCE/history-sync-cross-platform-contract.md",
  );

  assertContains(previewRoute, "parseCatalogWorkbookPreview");
  assert.doesNotMatch(previewRoute, /upsertSupplierImportHistoryEntry|shared_sheet_sessions|sync_events/);
  assertContains(applyRoute, "applyCatalogWorkbookImport");
  assertContains(workbook, "upsertSupplierImportHistoryEntry");
  assertContains(workbook, 'adjustedParsed.importMode === "supplier"');
  assertContains(workbook, "failedRows === 0");
  assertContains(workbook, "effectiveProductRowsLastWins(adjustedParsed.products)");
  assertContains(workbook, "supplierImportHistoryRows(productsToApply, readModel)");
  assertContains(workbook, "historyEntry");
  assertContains(historyMutations, "buildSupplierImportHistoryEntryPayload");
  assertContains(historyMutations, "insertSupplierImportHistorySession");
  assertContains(historyMutations, "updateSupplierImportHistorySession");
  assertContains(historyMutations, "deleted_at: null");
  assertContains(historyMutations, "is_manual_entry: input.payload.isManualEntry");
  assertContains(historyMutations, "payload_version: input.payload.payloadVersion");
  assertContains(historyMutations, 'eventType: "history_changed"');
  assertContains(historyMutations, "session_ids: [input.remoteId]");
  assertContains(historyMutations, 'source_workflow: "supplier_import"');
  assertContains(historyMutations, 'writeResult.error.code === "23505"');
  const supplierUpdateBlock = historyMutations.slice(
    historyMutations.indexOf("async function updateSupplierImportHistorySession"),
    historyMutations.indexOf("async function tombstoneHistorySessionForWrite"),
  );
  assert.match(
    supplierUpdateBlock,
    /\.eq\("remote_id", input\.payload\.remoteId\)[\s\S]{0,140}\.eq\("owner_user_id", input\.ownerUserId\)/,
  );
  assert.match(
    supplierUpdateBlock,
    /\.update\(legacyRow\)[\s\S]{0,180}\.eq\("remote_id", input\.payload\.remoteId\)[\s\S]{0,140}\.eq\("owner_user_id", input\.ownerUserId\)/,
  );
  assertContains(ui, "Applying this supplier import will create or update");
  assertContains(ui, "historyEntry?:");
  assertContains(ui, "setApplyResult(result)");
  assertContains(productsPage, 'includeExactTotals: "count-only"');
  assertContains(mobileContract, "remote_id` must be a lowercase UUID string");
  assertContains(mobileContract, "`payload_version = 2`");
  assertContains(mobileContract, "`overlay_schema = 1`");
});
