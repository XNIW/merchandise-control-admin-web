import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

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

test("TASK-061 governance tracks Android database export handoff", () => {
  const taskPath =
    "docs/TASKS/TASK-061-android-database-export-transfer-compatibility.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-061/README.md";
  const specPath = "docs/specs/android-database-export-format.md";

  assert.equal(
    existsSync(join(root, taskPath)),
    true,
    `${taskPath} is missing`,
  );
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );
  assert.equal(
    existsSync(join(root, specPath)),
    true,
    `${specPath} is missing`,
  );

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read("docs/MASTER-PLAN.md");
  const spec = read(specPath);

  assertContains(task, "TASK-061 - Android database export compatibility");
  assertContains(task, "Stato: `DONE`");
  assertContains(task, "Fase attuale: `DONE_RECONCILED`");
  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
  assertContains(masterPlan, "Stato TASK-061: `DONE`");
  assertContains(masterPlan, "Fase TASK-061: `DONE_RECONCILED`");
  assertContains(evidence, "Verdict corrente: `DONE`");
  assertContains(evidence, "Android Export Auditor");
  assertContains(spec, "PriceHistory");
  assertContains(spec, "`oldPrice` e calcolato");
  assertContains(spec, "`newPrice` e il prezzo effettivo importabile");
});

test("TASK-061 parser exposes Android database detection and sheet summaries", () => {
  const workbookSource = read(
    "src/server/shop-admin/import-export-workbook.ts",
  );

  for (const required of [
    "type CatalogWorkbookDetectedFormatKind",
    '"android_database_export"',
    "ANDROID_DATABASE_EXPECTED_SHEETS",
    "ANDROID_PRODUCT_HEADER_SETS",
    "ANDROID_PRICE_HISTORY_HEADERS",
    "detectCatalogWorkbookFormat",
    "hasAndroidProductHeaders",
    "androidSheetHasSignature",
    "baseSheetSummaries",
    "decorateSheetSummaries",
    "sheetSummaries",
    "fallbackToFirstSheet:",
    'detectedFormat.kind !== "android_database_export"',
    "allowFlexibleBarcode",
    "MAX_PRODUCT_BARCODE_LENGTH",
    "safety_formula_escape",
    "safetyNotes",
    "safetySanitizations",
    "priceHistoryPurchase",
    "priceHistoryRetail",
    "normalizeWorkbookText",
    "PriceHistory product reference must match a product in this shop or workbook.",
    "byImportedProductId",
    "rememberAppliedProductReference",
    "shop_catalog_import_price_history",
    "oldPrice=${oldPrice}",
  ]) {
    assertContains(workbookSource, required);
  }

  assert.match(
    workbookSource,
    /maps\.byImportedProductId\.set\(row\.productId, productId\)/,
    "single product apply must remember workbook productId aliases",
  );
  assert.match(
    workbookSource,
    /const byImportedProductId = maps\.byImportedProductId\.get\(row\.productId\)/,
    "PriceHistory resolution must check workbook productId aliases",
  );
  assert.match(
    workbookSource,
    /maps\.byImportedProductId\.set\(sourceRow\.product_id, product\.productId\)/,
    "bulk product apply must remember source productId aliases",
  );

  assertContains(workbookSource, '"Código de barras"');
  assertContains(workbookSource, '"Compra (Antiguo)"');
  assertContains(workbookSource, '"productBarcode"');
  assertContains(workbookSource, '"newPrice"');
});

test("TASK-061 database transfer UI is multi-sheet and not product-only editable", () => {
  const importPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );
  const importPreviewBlock =
    importPanel.match(
      /data-import-step="import-preview"[\s\S]*?\{applyResult \? \(/,
    )?.[0] ?? "";
  const advancedMappingDetails =
    importPanel.match(
      /<details className="[^"]*">\s*<summary className="[^"]*">\s*\{t\("Advanced mapping"\)\}[\s\S]*?<\/details>/,
    )?.[0] ?? "";

  for (const required of [
    "type DetectedFormat",
    "type SheetSummary",
    "Android database export detected",
    "SheetSummaryGrid",
    "SheetSampleSections",
    "data-database-sheet-summary",
    "data-database-sheet-samples",
    "Check workbook",
    "Review import",
    "Sync Database",
    "Continue to Sync DB before apply.",
    'step !== "sync"',
    'formData.set("syncPreviewDigest", syncPreviewDigest)',
    "data-sync-review-tabs",
    "data-sync-review-search",
    "Android database columns were recognized automatically.",
    "Advanced mapping",
    "DatabaseReviewSummary",
    "data-database-review-summary",
    "No blocking rows detected.",
    "Safety sanitization",
    "Price history",
    "priceHistoryApplied",
    "hasPresentProductSheet",
    "isPreviewableValidationFailure",
    "showAdvancedProductMapping",
    'mode === "database"',
    "result.sheetSummaries?.length",
    "result.rowErrors?.length",
    "Workbook sheet details",
    "Android sheet samples",
    "Show detailed product rows",
    "data-database-detailed-product-rows",
    "displayedPreviewRows.slice(0, 20)",
    "full reviewed workbook digest",
    "overflow-y-auto overflow-x-auto",
    "min-w-max",
  ]) {
    assertContains(importPanel, required);
  }

  assert.doesNotMatch(importPanel, /Advanced database transfer/);
  assert.doesNotMatch(importPanel, /Advanced transfer options/);
  assert.notEqual(
    advancedMappingDetails,
    "",
    "Advanced mapping details not found",
  );
  assert.doesNotMatch(
    advancedMappingDetails,
    /\sopen(?:=|\s|>)/,
    "Android exact export Advanced mapping must be closed by default",
  );
  assert.match(
    importPanel,
    /collapsible[\s\S]*issues=\{preview\.rowWarnings\}[\s\S]*title=\{t\("Operational warnings"\)\}/,
    "Operational warnings must be rendered as a collapsible section",
  );
  assert.match(
    importPanel,
    /collapsible[\s\S]*issues=\{preview\.safetyNotes\}[\s\S]*title=\{t\("Safety sanitization"\)\}/,
    "Safety sanitization must be rendered as a collapsible section",
  );
  assert.match(
    importPanel,
    /data-database-detailed-product-rows[\s\S]*t\("Show detailed product rows"\)[\s\S]*<PreviewTable/,
    "database product rows must be hidden behind a detailed rows disclosure",
  );
  assert.doesNotMatch(
    importPreviewBlock,
    />\s*Back\s*<\/button>/,
    "database Step 3 footer must not render a redundant Back button",
  );
  assert.doesNotMatch(
    importPreviewBlock,
    /Showing \{displayedPreviewRows\.length\} of \{previewRows\.length\} preview rows/,
    "database Step 3 must not show the old full preview row count by default",
  );

  assert.doesNotMatch(
    importPanel,
    /value=\{edit\.retailPrice \?\? row\.retailPrice \?\? ""\}/,
    "database transfer preview must not keep the old editable retail price cell",
  );
  assert.doesNotMatch(
    importPanel,
    /value=\{edit\.stockQuantity \?\? row\.stockQuantity \?\? ""\}/,
    "database transfer preview must not keep the old editable stock quantity cell",
  );
});

test("TASK-061 database transfer modal uses wide supplier-style header controls", () => {
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");

  for (const required of [
    "DialogHeaderFileAccessory",
    "databaseTransferHeaderAccessory",
    "databaseTransferLeadingAction",
    'open={openDialog === "advancedTransfer"}',
    'size="wide"',
    "onHeaderBackStateChange={handleDatabaseTransferLeadingAction}",
    "onHeaderFileStateChange={handleDatabaseTransferHeaderFile}",
    "overflow-y-auto overflow-x-hidden",
    "max-h-[calc(100vh-64px)]",
    "sm:w-[min(1500px,calc(100vw-96px))]",
    "min-w-0 max-w-[min(30vw,22rem)] shrink",
    "min-w-0 flex-1 truncate",
  ]) {
    assertContains(catalogPanel, required);
  }
});

test("TASK-061 database apply retry keeps digest stable across catalog scope promotion", () => {
  const workbookSource = read(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const digestHelper =
    workbookSource.match(
      /function bindPreviewDigestToShop\([\s\S]*?\n\}/,
    )?.[0] ?? "";
  const previewBinding =
    workbookSource.match(
      /const boundPreviewDigest = bindPreviewDigestToShop\(\{[\s\S]*?\n\s*\}\);/,
    )?.[0] ?? "";

  assert.notEqual(digestHelper, "", "bindPreviewDigestToShop helper missing");
  assert.doesNotMatch(
    digestHelper,
    /catalogScope/,
    "preview digest binding must not depend on mutable catalogScope",
  );
  assert.doesNotMatch(
    previewBinding,
    /catalogScope:/,
    "preview binding must not include mutable catalogScope",
  );
});

test("TASK-061 database apply failure invalidates stale preview and shows busy feedback", () => {
  const importPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");

  for (const required of [
    "importErrorMessage(result, mode, labels)",
    'result.code === "preview_mismatch"',
    "Preview is stale. Re-run preview before importing.",
    'result.code === "db_failure"',
    "Database import failed before completion.",
    "setPreview(null)",
    "setStep(\"workbook\")",
    "Importing database...",
    'role="status"',
    'aria-live="polite"',
    "aria-busy={isApplying}",
    "disabled={isApplying}",
    "onBusyStateChange",
  ]) {
    assertContains(importPanel, required);
  }

  for (const required of [
    "closeDisabled",
    "disabled={closeDisabled}",
    "databaseTransferBusy",
    "onBusyStateChange={setDatabaseTransferBusy}",
  ]) {
    assertContains(catalogPanel, required);
  }
});

test("TASK-061 staff manager database apply uses server-side staff-aware bulk writes", () => {
  const workbookSource = read(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const staffAwareMutations = read(
    "src/server/shop-admin/staff-aware-mutations.ts",
  );
  const productImportBlock =
    workbookSource.match(
      /async function applyBulkProductImport\([\s\S]*?\n\}/,
    )?.[0] ?? "";

  assertContains(
    workbookSource,
    'context.principalKind === "pos_staff_manager"',
  );
  assertContains(workbookSource, "applyStaffAwareBulkProductImport");
  assertContains(workbookSource, "applyStaffAwareBulkPriceHistoryImport");
  assertContains(staffAwareMutations, 'from("inventory_products")');
  assertContains(staffAwareMutations, 'from("inventory_product_prices")');
  assertContains(staffAwareMutations, "resolveInventoryOwner(context)");
  assertContains(staffAwareMutations, "loadScopedInventoryRowIds");
  assertContains(staffAwareMutations, "scopedProductIds.ids.has");
  assertContains(staffAwareMutations, "randomUUID()");
  assert.doesNotMatch(
    staffAwareMutations,
    /id:\s*product\.product_id\s*\?\?\s*randomUUID\(\)/,
    "staff bulk import must not trust caller-provided product IDs for inserts",
  );
  assertContains(
    workbookSource,
    "product_id: existing?.productId ?? row.productId",
  );
  assertContains(workbookSource, "shop_catalog_import_products");
  assertContains(workbookSource, "shop_catalog_import_price_history");
  assert.match(
    productImportBlock,
    /context\.principalKind === "pos_staff_manager"[\s\S]*applyStaffAwareBulkProductImport/,
    "staff manager product bulk import must avoid RPC auth.uid() dependence",
  );
  assert.doesNotMatch(
    workbookSource,
    /failedRows > 0 \? "db_failure" : "success"/,
    "partial database failures must not be collapsed to generic db_failure",
  );
});

test("TASK-061 read model paginates full database exports with stable ordering", () => {
  const readModel = read("src/server/shop-admin/inventory-read-model.ts");

  assertContains(readModel, "INVENTORY_READ_MODEL_PAGE_SIZE");
  assert.match(
    readModel,
    /from\("inventory_products"\)[\s\S]*?order\("updated_at"[\s\S]*?order\("id"/,
    "product pagination must use a stable secondary id order",
  );
  assert.match(
    readModel,
    /from\("inventory_product_prices"\)[\s\S]*?order\("created_at"[\s\S]*?order\("id"/,
    "price pagination must use a stable secondary id order",
  );
  assert.match(
    readModel,
    /from\("inventory_suppliers"\)[\s\S]*?order\("name"[\s\S]*?order\("id"/,
    "supplier pagination must use a stable secondary id order",
  );
  assert.match(
    readModel,
    /from\("inventory_categories"\)[\s\S]*?order\("name"[\s\S]*?order\("id"/,
    "category pagination must use a stable secondary id order",
  );
});

test("TASK-061 duplicate Android item numbers stay non-blocking and do not reduce new product counts", () => {
  const contract = read("src/server/shop-admin/catalog-import-contract.ts");

  assertContains(contract, "duplicateProductsBySku");
  assertContains(contract, "const effectiveProducts = effectiveLastProductRows(parsed.products);");
  assertContains(contract, "const effectiveProductRows = effectiveProducts.length;");
  assert.doesNotMatch(
    contract,
    /duplicateProductRows = new Set\(\[[\s\S]*duplicateProductsBySku/,
    "duplicate SKU warnings must not be counted as dropped products",
  );
  assert.doesNotMatch(
    contract,
    /!duplicateProductsBySku\.has\(product\)/,
    "duplicate SKU warnings must not prevent existing product update classification",
  );
});
