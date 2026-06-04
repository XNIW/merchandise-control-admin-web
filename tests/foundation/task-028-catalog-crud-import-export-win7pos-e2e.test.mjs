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

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(escapeRegExp(required)), label);
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

test("TASK-028 governance artifacts close after explicit DONE reconciliation", () => {
  const taskPath =
    "docs/TASKS/TASK-028-catalog-crud-import-export-win7pos-e2e.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-028/README.md";

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
    "TASK-028 - Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E",
    "Baseline TASK-027",
    "Admin Web: `git status --short` -> clean",
    "Win7POS: `git status --short` -> clean",
    "Fase attuale: `DONE_RECONCILED`",
    "Verdict corrente: `DONE_RECONCILED_WITH_NOTES`",
    "conferma esplicita",
  ]) {
    assertContains(`${task}\n${evidence}`, required);
  }

  assertContains(masterPlan, "### TASK-028 - Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E");
  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`|Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`|Task attivo: `TASK-032 - Full project progression mega-task`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`/,
  );
  assert.match(
    masterPlan,
    /Stato task: `PLANNED`|Stato task: `REVIEW`|Stato task: `EXECUTION`|Stato task: `REVIEW_WITH_BLOCKERS`|Stato task: `REVIEW_WITH_EXTERNAL_BLOCKERS`|Stato task: `DONE`/,
  );
  assert.match(task, /Stato:\s*`DONE_RECONCILED_WITH_NOTES`/);
  assert.match(evidence, /Verdict corrente:\s*`DONE_RECONCILED_WITH_NOTES`/);
});

test("TASK-028 import contract validates duplicates, conflicts and non-destructive update merges", () => {
  const helperPath = "src/server/shop-admin/catalog-import-contract.ts";

  assert.equal(existsSync(join(root, helperPath)), true, `${helperPath} is missing`);

  const helper = loadTypeScriptModule(helperPath);
  const supplierHeaderDetection = helper.detectCatalogImportHeaderRow([
    ["", "订单ID", "716813", "销售单号"],
    ["", "客户 1832", "项敏77762015-0(5%全票)"],
    ["NO", "产品货号", "条码", "产品名1", "产品名2", "数量", "单价", "折扣", "售价", "总价"],
    [1, "10068", "8977677100680", "画框18*24", "BASTIDOR-18*24", 20, 750, 0.05, 713, 14260],
  ]);

  assert.equal(supplierHeaderDetection?.headerRowIndex, 2);
  assert.equal(supplierHeaderDetection?.headers.get("barcode"), 2);
  assert.equal(supplierHeaderDetection?.headers.get("itemNumber"), 1);
  assert.equal(supplierHeaderDetection?.headers.get("productName"), 3);
  assert.equal(supplierHeaderDetection?.headers.get("secondProductName"), 4);
  assert.equal(supplierHeaderDetection?.headers.get("stockQuantity"), 5);
  assert.equal(supplierHeaderDetection?.headers.get("purchasePrice"), 6);
  assert.equal(supplierHeaderDetection?.headers.get("retailPrice"), 8);

  const spanishHeaderDetection = helper.detectCatalogImportHeaderRow([
    ["Código Producto", "Nombre Producto", "Cantidad", "Precio", "Valor Total", "Código de Barra"],
  ]);

  assert.equal(spanishHeaderDetection?.headers.get("barcode"), 5);
  assert.equal(spanishHeaderDetection?.headers.get("itemNumber"), 0);
  assert.equal(spanishHeaderDetection?.headers.get("productName"), 1);
  assert.equal(spanishHeaderDetection?.headers.get("stockQuantity"), 2);
  assert.equal(spanishHeaderDetection?.headers.get("purchasePrice"), 3);

  const existingCatalog = {
    categories: [
      { categoryId: "category-a", name: "Beverage", updatedAt: "2026-06-01T10:00:00.000Z" },
    ],
    products: [
      {
        barcode: "A100",
        categoryId: "category-a",
        itemNumber: "ITEM-A",
        productId: "product-a",
        productName: "Alpha",
        purchasePrice: 7,
        retailPrice: 10,
        secondProductName: "Alpha alt",
        stockQuantity: 4,
        supplierId: "supplier-a",
        updatedAt: "2026-06-01T10:00:00.000Z",
      },
      {
        barcode: "B200",
        categoryId: null,
        itemNumber: null,
        productId: "product-b",
        productName: "Beta",
        purchasePrice: null,
        retailPrice: 20,
        secondProductName: null,
        stockQuantity: null,
        supplierId: null,
        updatedAt: "2026-06-01T10:05:00.000Z",
      },
    ],
    suppliers: [
      { supplierId: "supplier-a", name: "Known Supplier", updatedAt: "2026-06-01T10:00:00.000Z" },
    ],
  };
  const parsedWorkbook = {
    categories: [
      { name: "Fresh", rowNumber: 2 },
      { name: "fresh", rowNumber: 3 },
    ],
    products: [
      { barcode: "A100", productName: "Alpha changed", productId: "product-a", rowNumber: 2 },
      { barcode: "A100", productName: "Duplicate barcode", rowNumber: 3 },
      { barcode: "B200", productName: "Wrong id conflict", productId: "product-a", rowNumber: 4 },
      { barcode: "C300", productName: "Missing supplier", supplierName: "Missing Supplier", rowNumber: 5 },
    ],
    suppliers: [
      { name: "New Supplier", rowNumber: 2 },
      { name: "new supplier", rowNumber: 3 },
    ],
  };

  const validation = helper.validateCatalogImportRows(
    parsedWorkbook,
    existingCatalog,
  );
  const errorCodes = Array.from(validation.rowErrors, (error) => error.code).sort();

  assert.deepEqual(errorCodes, [
    "duplicate_category_name",
    "duplicate_product_barcode",
    "duplicate_supplier_name",
    "product_barcode_conflict",
    "unknown_supplier",
  ]);
  assert.equal(validation.summary.updatedProducts, 2);
  assert.equal(validation.summary.newProducts, 1);

  const merged = helper.mergeProductImportForApply(
    { barcode: "A100", productName: "Alpha changed", rowNumber: 2 },
    existingCatalog.products[0],
    { categoryIdsByName: new Map(), supplierIdsByName: new Map() },
  );

  assert.equal(merged.productName, "Alpha changed");
  assert.equal(merged.retailPrice, 10);
  assert.equal(merged.purchasePrice, 7);
  assert.equal(merged.stockQuantity, 4);
  assert.equal(merged.supplierId, "supplier-a");
  assert.equal(merged.categoryId, "category-a");
});

test("TASK-028 Admin Web catalog CRUD exposes archived products and controlled restore", () => {
  const mutationSource = readProjectFile("src/server/shop-admin/catalog-mutations.ts");
  const actionsSource = readProjectFile("src/app/shop/actions.ts");
  const panelSource = readProjectFile("src/app/shop/_components/CatalogActionPanel.tsx");
  const inventorySource = readProjectFile("src/server/shop-admin/inventory-read-model.ts");
  const sectionSource = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const dbTypes = readProjectFile("src/lib/supabase/database.types.ts");
  const migrationPath =
    "supabase/migrations/20260601160000_task_028_catalog_restore_product.sql";

  assert.equal(existsSync(join(root, migrationPath)), true, `${migrationPath} is missing`);

  const migration = readProjectFile(migrationPath);

  for (const required of [
    "restoreProduct",
    "shop_catalog_restore_product",
    "products.write",
  ]) {
    assertContains(mutationSource, required);
  }

  for (const required of ["restoreProductAction", "RESTORE", "/shop/products"]) {
    assertContains(actionsSource, required);
  }

  for (const required of [
    "Restore product",
    "Type RESTORE as confirmation",
    "Archived products",
  ]) {
    assertContains(panelSource, required);
  }

  for (const required of [
    "deletedAt",
    "archivedProducts",
    '.is("deleted_at", null)',
    '.not("deleted_at", "is", null)',
  ]) {
    assertContains(inventorySource, required);
  }

  for (const required of [
    "Archived products",
    "activeProducts",
    "archivedProducts",
    "filteredArchivedProducts",
    'state: product.deletedAt ? "Archived" : "Active"',
    "Product id",
    "State",
    "Archived at",
    "restore",
  ]) {
    assertContains(sectionSource, required);
  }

  for (const required of [
    "create or replace function public.shop_catalog_restore_product",
    "set_config('app.catalog_restore_allowed'",
    "deleted_at = null",
    "unique_violation",
    "grant execute on function public.shop_catalog_restore_product",
  ]) {
    assertContains(migration, required);
  }

  assertContains(dbTypes, "shop_catalog_restore_product");
});

test("TASK-028 Excel import/export stays preview-first, shop-scoped and non-purging", () => {
  const workbookSource = readProjectFile("src/server/shop-admin/import-export-workbook.ts");
  const readinessSource = readProjectFile("src/server/shop-admin/import-export-readiness.ts");
  const previewRoute = readProjectFile("src/app/shop/import-export/preview/route.ts");
  const applyRoute = readProjectFile("src/app/shop/import-export/apply/route.ts");
  const exportRoute = readProjectFile("src/app/shop/import-export/export/route.ts");

  for (const required of [
    "validateCatalogImportRows",
    "mergeProductImportForApply",
    "previewDigest",
    "confirmApply",
    'permission: "catalog.import" | "catalog.export"',
    'resolveShopActionContext(requestedShopId, permission)',
    '"catalog.import"',
    "auditResult",
    "if (!auditResult.ok)",
    "shop.catalog.import.preview",
    "shop.catalog.import.apply",
    "shop.catalog.export",
    "preview.valid",
    "no_purge",
  ]) {
    assertContains(workbookSource, required);
  }

  for (const required of [
    "MAX_IMPORT_ROWS",
    "MAX_IMPORT_BYTES",
    "FORMULA_INJECTION_PREFIXES",
    "sanitizeSpreadsheetCell",
  ]) {
    assertContains(readinessSource, required);
  }

  for (const route of [previewRoute, applyRoute, exportRoute]) {
    assertContains(route, 'export const dynamic = "force-dynamic"');
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|service_role|credential_hash/i);
  }

  for (const route of [previewRoute, applyRoute]) {
    assertContains(route, "MAX_IMPORT_BYTES");
    assertContains(route, "content-length");
  }

  assert.doesNotMatch(workbookSource, /\.(delete|upsert)\s*\(/);
  assert.doesNotMatch(workbookSource, /truncate|replace_all|full\s+delete/i);
});

test("TASK-028 Win7POS catalog pull persists cursor diagnostics and applies tombstones without purge", () => {
  assert.equal(existsSync(win7PosRoot), true, "Win7POS repo is missing");

  const client = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs",
  );
  const service = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs",
  );
  const repository = readWin7PosFile(
    "src/Win7POS.Data/Repositories/ProductRepository.cs",
  );
  const initializer = readWin7PosFile("src/Win7POS.Data/DbInitializer.cs");
  const scanner = readWin7PosFile("scripts/check-pos-catalog-pull.ps1");

  for (const required of [
    'DataMember(Name = "syncCursor"',
    'DataMember(Name = "hasMore"',
    'DataMember(Name = "catalogVersion"',
    'DataMember(Name = "tombstones"',
    "PosCatalogProductTombstoneResponse",
  ]) {
    assertContains(client, required);
  }

  for (const required of [
    "LastCatalogSyncCursorSettingKey",
    "LastCatalogErrorSettingKey",
    "LastCatalogUpdatedProductsSettingKey",
    "LastCatalogTombstonesReceivedSettingKey",
    "LastCatalogTombstonesAppliedSettingKey",
    "LastCatalogHasMoreSettingKey",
    "LastCatalogVersionSettingKey",
    "StoreCatalogFailureAsync",
    "ApplyRemoteProductTombstoneAsync",
    "StoreCatalogDiagnosticsAsync",
    "result.Value.HasMore",
    "result.Value.CatalogVersion",
  ]) {
    assertContains(service, required);
  }

  for (const required of [
    "remote_product_id",
    "remote_deleted_at",
    "is_active",
  ]) {
    assertContains(repository, required);
    assertContains(initializer, required);
  }

  assertContains(repository, "ApplyRemoteProductTombstoneAsync");
  assertContains(repository, "COALESCE(is_active, 1) = 1");
  assertContains(repository, "UPDATE products");
  assertContains(initializer, "COALESCE(is_active, 1) = 1");

  for (const required of [
    "remote_product_id",
    "remote_deleted_at",
    "pos.catalog.last_error",
    "pos.catalog.last_updated_products",
    "pos.catalog.last_tombstones_received",
    "pos.catalog.last_tombstones_applied",
    "pos.catalog.last_has_more",
    "pos.catalog.last_catalog_version",
    "ApplyRemoteProductTombstoneAsync",
  ]) {
    assertContains(scanner, required);
  }

  assert.doesNotMatch(service, /DeleteByBarcodeAsync|DELETE FROM products|DELETE FROM product_meta/i);
  assert.doesNotMatch(`${service}\n${repository}`, /truncate|replace_all|full\s+delete/i);
});

test("TASK-028 keeps TASK-027 delta sync and documented POS boundaries intact", () => {
  const pullService = readProjectFile("src/server/pos-auth/catalog-pull.ts");
  const syncContract = readProjectFile("src/server/pos-auth/catalog-sync-contract.ts");
  const policy = readProjectFile("docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md");
  const task = readProjectFile(
    "docs/TASKS/TASK-028-catalog-crud-import-export-win7pos-e2e.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-028/README.md");

  for (const required of [
    "syncCursor",
    "catalogVersion",
    "serverTime",
    "hasMore",
    "tombstones",
    "deletedAt",
    "computeCatalogVersion",
    "buildNextCatalogSyncCursor",
  ]) {
    assertContains(`${pullService}\n${syncContract}`, required);
  }

  for (const required of [
    "Admin Web/Supabase -> Win7POS",
    "Win7POS -> Supabase",
    "Editing catalogo da POS: `DEFERRED`",
    "nessun purge",
    "TASK-028",
  ]) {
    assertContains(policy, required);
  }

  assertContains(`${task}\n${evidence}`, "iOS: `NOT_TOUCHED / NOT_RUN`");
  assertContains(`${task}\n${evidence}`, "Android: `NOT_TOUCHED / NOT_RUN`");
  assert.doesNotMatch(`${pullService}\n${syncContract}\n${policy}`, /sales_sync|payment_sync|cash_close|bidirectional/i);
});
