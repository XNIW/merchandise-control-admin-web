import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("TASK-057 governance is DONE_RECONCILED after TASK-058 confirmation", () => {
  const taskPath =
    "docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-057/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read("docs/MASTER-PLAN.md");

  assertContains(task, "Stato: `DONE_RECONCILED`");
  assertContains(task, "Fase attuale: `DONE_RECONCILED`");
  assertContains(evidence, "Verdict corrente: `DONE_RECONCILED`");
  assertContains(masterPlan, "Stato TASK-057: `DONE_RECONCILED`");
  assertContains(masterPlan, "Verdict TASK-057: `DONE_RECONCILED`");
  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`/,
  );
});

test("TASK-057 keeps Import Export route compatible but hidden from primary nav", () => {
  const sections = read("src/components/shop/shopSections.ts");
  const navBlock = sections.match(
    /export const shopNavigationSections[\s\S]*?export const shopNavigationItems/,
  )?.[0];

  assert.ok(navBlock, "shopNavigationSections block not found");
  assert.match(navBlock, /href:\s*"\/shop\/import-export"/);
  assert.match(navBlock, /label:\s*"Import \/ Export"/);
  assert.match(navBlock, /hiddenFromPrimaryNav:\s*true/);

  assertContains(sections, "importExport");
  assertContains(sections, "href: \"/shop/import-export\"");
});

test("TASK-057 Products filters start the page and keep full catalog columns", () => {
  const page = read("src/app/shop/products/page.tsx");
  const loading = read("src/app/shop/products/loading.tsx");
  const data = read("src/server/shop-admin/shop-section-data.ts");
  const dictionary = read("src/i18n/dictionaries.ts");
  const pageI18nSource = `${page}\n${dictionary}`;

  for (const required of [
    "Search and filters",
    "data-product-catalog-command-bar",
    "name=\"state\"",
    "<select",
    "All categories",
    "All suppliers",
    "categoryOptions",
    "supplierOptions",
  ]) {
    assertContains(pageI18nSource, required);
  }

  assert.doesNotMatch(page, /Catalog Workspace/);
  assert.doesNotMatch(loading, /Catalog Workspace/);
  assert.doesNotMatch(
    page,
    /Use search or filters to find products across the full mapped catalog\./,
  );
  assert.doesNotMatch(page, />\s*Category id\s*</);
  assert.doesNotMatch(page, />\s*Supplier id\s*</);

  for (const required of [
    "Item number",
    "Product name",
    "Second name",
    "Supplier name",
    "Category name",
    "Purchase price",
    "Retail price",
    "Stock quantity",
    "Updated / Archived",
    "state?:",
  ]) {
    assertContains(data, required);
  }
});

test("TASK-057 catalog actions are toolbar buttons with accessible dialogs", () => {
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const productsPage = read("src/app/shop/products/page.tsx");
  const importExportPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );
  const categoriesPage = read("src/app/shop/categories/page.tsx");
  const suppliersPage = read("src/app/shop/suppliers/page.tsx");
  const sectionPage = read("src/components/shop/ShopSectionPage.tsx");

  assertContains(catalogPanel, "\"use client\"");
  assertContains(catalogPanel, "role=\"dialog\"");
  assertContains(catalogPanel, "aria-modal=\"true\"");
  assertContains(catalogPanel, "catalogToolbarButtonClassName");
  assertContains(catalogPanel, "ProductPicker");
  assertContains(catalogPanel, "CreatableCategoryField");
  assertContains(catalogPanel, "CreatableSupplierField");
  assertContains(catalogPanel, "initialEntityId");
  assertContains(catalogPanel, "SelectedEntitySummary");

  for (const required of [
    "New product",
    "Import supplier Excel",
    "Export catalog Excel",
    "Database transfer",
  ]) {
    assertContains(catalogPanel, required);
  }

  for (const required of [
    "Archive product",
    "Restore product",
    "Rename category",
    "Delete category",
    "Rename supplier",
    "Delete supplier",
  ]) {
    assertContains(catalogPanel, required);
  }

  assert.doesNotMatch(catalogPanel, /Edit product|Update product|editProduct/);

  for (const forbidden of [
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("editProduct"\)\}/,
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("archiveProduct"\)\}/,
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("restoreProduct"\)\}/,
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("editCategory"\)\}/,
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("archiveCategory"\)\}/,
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("editSupplier"\)\}/,
    /ToolbarButton onClick=\{\(\) => setOpenDialog\("archiveSupplier"\)\}/,
  ]) {
    assert.doesNotMatch(catalogPanel, forbidden);
  }

  assertContains(productsPage, "canImport={canImport}");
  assertContains(productsPage, "canExport={canExport}");
  assertContains(catalogPanel, "SupplierExcelImportWizard");
  assertContains(catalogPanel, "CatalogExportPanel");
  assertContains(catalogPanel, "DatabaseTransferPanel");
  assertContains(importExportPanel, "data-catalog-flow");
  assertContains(importExportPanel, "supplier-excel-wizard");
  assertContains(importExportPanel, "catalog-export");
  assertContains(importExportPanel, "database-transfer");
  assertContains(importExportPanel, "<details");
  assertContains(importExportPanel, "Download catalog export");
  assertContains(importExportPanel, "selected shop only");
  assertContains(importExportPanel, '{t("Confirm")} {confirmationWord}');
  assertContains(importExportPanel, "APPLY");
  assertContains(importExportPanel, "IMPORT DATABASE");
  assert.match(
    importExportPanel,
    /<SupplierExcelImportWizard[\s\S]*<CatalogExportPanel[\s\S]*data-catalog-flow="database-transfer-panel"[\s\S]*<DatabaseTransferPanel/,
    "supplier import, export and database transfer must render in that order",
  );
  assertContains(productsPage, "ProductRowActions");
  assertContains(productsPage, "product_action");
  assertContains(productsPage, "product_id");
  assertContains(productsPage, "data-product-catalog-command-bar");
  assertContains(productsPage, "{catalogDialogPanel}");
  assert.doesNotMatch(productsPage, /liveDataToolbar=\{catalogToolbar\}/);
  assertContains(categoriesPage, "CategoryRowActions");
  assertContains(categoriesPage, "category_action");
  assertContains(categoriesPage, "beforeLiveData");
  assertContains(categoriesPage, "{catalogToolbar}");
  assertContains(suppliersPage, "SupplierRowActions");
  assertContains(suppliersPage, "supplier_action");
  assertContains(suppliersPage, "beforeLiveData");
  assertContains(suppliersPage, "{catalogToolbar}");
  assertContains(sectionPage, "beforeLiveData");
  assertContains(sectionPage, "liveDataToolbar");
  assertContains(sectionPage, "rowActions");
  assert.ok(
    sectionPage.indexOf("{beforeLiveData}") <
      sectionPage.indexOf("<SectionCard"),
    "beforeLiveData content must render before the live data table card",
  );
  assert.doesNotMatch(catalogPanel, /lg:grid-cols-3/);
  assert.doesNotMatch(
    catalogPanel,
    /importExportPanel=\{children\}[\s\S]*title="Export catalog Excel"[\s\S]*\{importExportPanel\}/,
    "Export catalog must not reuse the supplier import modal body",
  );
});

test("TASK-057 supplier Excel wizard uses fetch, bounded preview metadata and no raw JSON navigation", () => {
  const productsPage = read("src/app/shop/products/page.tsx");
  const importExportPage = read("src/app/shop/import-export/page.tsx");
  const exportRoute = read("src/app/shop/import-export/export/route.ts");
  const previewRoute = read("src/app/shop/import-export/preview/route.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const importExportPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );

  assertContains(productsPage, "CatalogActionPanel");
  assert.match(importExportPage, /Moved to Products|redirect\(/);
  assertContains(importExportPanel, "Import supplier Excel");
  assertContains(importExportPanel, "Preview supplier workbook");
  assertContains(importExportPanel, "Database transfer");
  assertContains(importExportPanel, "IMPORT DATABASE");
  assertContains(importExportPanel, "full price history");
  assertContains(importExportPanel, "\"use client\"");
  assertContains(importExportPanel, "fetch(");
  assertContains(importExportPanel, "credentials: \"same-origin\"");
  assertContains(importExportPanel, "readJsonResponse");
  assertContains(importExportPanel, "response.headers.get(\"content-type\")");
  assertContains(importExportPanel, "rowAdjustments");
  assertContains(importExportPanel, "previewRows");
  assertContains(importExportPanel, "rowFingerprint");
  assertContains(importExportPanel, "Retail price");
  assertContains(importExportPanel, "Stock quantity");
  assertContains(importExportPanel, "Ready");
  assertContains(importExportPanel, "Blocked");
  assertContains(importExportPanel, "Duplicate");
  assertContains(importExportPanel, "Update");
  assertContains(importExportPanel, "New");
  assertContains(importExportPanel, "selected shop only");
  assertContains(previewRoute, "importMode");
  assertContains(applyRoute, "rowAdjustments");
  assertContains(workbook, "MAX_PREVIEW_ROWS");
  assertContains(workbook, "workbookMetadata");
  assertContains(workbook, "originalColumns");
  assertContains(workbook, "unmappedColumns");
  assertContains(workbook, "parsedRows");
  assertContains(workbook, "previewRowsLimit");
  assertContains(workbook, "totalRows");
  assertContains(workbook, "previewRowsTruncated");
  assertContains(workbook, "CatalogWorkbookPreviewRow");
  assert.doesNotMatch(importExportPanel, /recent prices/i);
  assert.doesNotMatch(
    importExportPanel,
    /action="\/shop\/import-export\/(?:preview|apply)"/,
    "JSON routes must be called with fetch, not native navigation forms",
  );
  assertContains(exportRoute, "\"Cache-Control\": \"no-store\"");
});

test("TASK-057 product creation resolves creatable supplier and category server-side", () => {
  const actions = read("src/app/shop/actions.ts");
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");

  for (const required of [
    "resolveProductCatalogRelations",
    "supplierName",
    "categoryName",
    "lookupCatalogRelation",
    "createSupplier",
    "createCategory",
    "getShopInventoryReadModel",
    "supplier id and name do not match",
    "category id and name do not match",
    "retryCatalogRelationLookup",
    "createProductAction",
    "await createProduct({",
  ]) {
    assertContains(actions, required);
  }

  for (const required of [
    "CreatableSupplierField",
    "CreatableCategoryField",
    "CreatableCatalogCombobox",
    "createLabel=\"Create new supplier\"",
    "createLabel=\"Create new category\"",
    "name=\"supplierName\"",
    "name=\"categoryName\"",
    "type=\"hidden\"",
    "Existing supplier or new supplier name",
    "Existing category or new category name",
  ]) {
    assertContains(catalogPanel, required);
  }

  assert.ok(
    actions.indexOf("validateCatalogProductInput") <
      actions.indexOf("resolveProductCatalogRelations"),
    "product input must be validated before creating supplier/category rows",
  );
  assert.ok(
    actions.indexOf("resolveProductCatalogRelations") <
      actions.indexOf("await createProduct({"),
    "product must be created only after supplier/category resolution",
  );
});

test("TASK-057 apply validates digest token and row adjustments server-side", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");

  for (const required of [
    "CatalogWorkbookRowAdjustment",
    "catalogImportRowFingerprint",
    "buildPreviewDigest",
    "fileDigest",
    "selectedProductSheet",
    "detectedHeaderRow",
    "detectedMapping",
    "validateRowAdjustments",
    "applyRowAdjustments",
    "duplicate rowNumber",
    "rowFingerprint",
    "preview_mismatch",
    "Number.isFinite",
    "MAX_ROW_ADJUSTMENTS",
    "MAX_ROW_ADJUSTMENTS_JSON_BYTES",
    "rowAdjustments",
  ]) {
    assertContains(`${workbook}\n${applyRoute}`, required);
  }

  assert.match(
    workbook,
    /validateRowAdjustments\(\s*parsed,[\s\S]*applyRowAdjustments\([\s\S]*validateCatalogImportRows\(\s*adjustedParsed,/,
    "adjustments must be validated and applied before import row validation",
  );
  assert.doesNotMatch(workbook, /console\.(log|debug|warn)\(.*workbook/i);
});

test("TASK-057 import routes fail closed on cross-site or unbounded upload requests", () => {
  const guardPath = "src/server/shop-admin/import-export-route-guard.ts";
  const previewRoute = read("src/app/shop/import-export/preview/route.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");

  assert.equal(existsSync(join(root, guardPath)), true, `${guardPath} is missing`);

  const guard = read(guardPath);

  for (const route of [previewRoute, applyRoute]) {
    assertContains(route, "guardCatalogImportExportPostRequest");
    assertContains(route, "guardCatalogImportWorkbookFile");
    assert.ok(
      route.indexOf("guardCatalogImportExportPostRequest(request)") <
        route.indexOf("request.formData()"),
      "request guard must run before parsing multipart form data",
    );
    assert.ok(
      route.indexOf("guardCatalogImportWorkbookFile(file)") <
        route.indexOf("file.arrayBuffer()"),
      "file size guard must run before reading the workbook into memory",
    );
  }

  for (const required of [
    "import \"server-only\"",
    "MAX_IMPORT_BYTES",
    "multipart/form-data",
    "sec-fetch-site",
    "cross-site",
    "origin",
    "x-forwarded-host",
    "content-length",
    "invalid_origin",
    "invalid_content_type",
    "invalid_request_body",
    "file_too_large",
    "file.size",
    "Cache-Control",
    "no-store",
  ]) {
    assertContains(guard, required);
  }
});

test("TASK-057 Excel import contract recognizes supplier and database aliases", () => {
  const helper = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );

  const detection = helper.detectCatalogImportHeaderRow([
    ["订单ID", "716813", "销售单号", "Vs20260519-456 By 2049"],
    ["客户 1832", "metadata"],
    [
      "Cod. Art.",
      "EAN",
      "Nombre del producto",
      "Segundo nombre del producto",
      "Existencias",
      "Precio de compra",
      "Precio de venta",
      "Proveedor",
      "Categoría",
    ],
    [
      "10068",
      "8977677100680",
      "画框18*24",
      "BASTIDOR-18*24",
      "20",
      "750",
      "713",
      "Dingli",
      "Stationery",
    ],
  ]);

  assert.equal(detection?.headerRowIndex, 2);
  assert.equal(detection?.headers.get("itemNumber"), 0);
  assert.equal(detection?.headers.get("barcode"), 1);
  assert.equal(detection?.headers.get("productName"), 2);
  assert.equal(detection?.headers.get("secondProductName"), 3);
  assert.equal(detection?.headers.get("stockQuantity"), 4);
  assert.equal(detection?.headers.get("purchasePrice"), 5);
  assert.equal(detection?.headers.get("retailPrice"), 6);
  assert.equal(detection?.headers.get("supplierName"), 7);
  assert.equal(detection?.headers.get("categoryName"), 8);
});

test("TASK-057 import validation treats duplicate optional item numbers as warnings", () => {
  const helper = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );

  const validation = helper.validateCatalogImportRows(
    {
      categories: [],
      products: [
        {
          barcode: "TASK057-DUPSKU-001",
          itemNumber: "DUP-SKU",
          productName: "First duplicate SKU product",
          rowNumber: 2,
        },
        {
          barcode: "TASK057-DUPSKU-002",
          itemNumber: "DUP-SKU",
          productName: "Second duplicate SKU product",
          rowNumber: 3,
        },
      ],
      suppliers: [],
    },
    { categories: [], products: [], suppliers: [] },
  );

  assert.equal(validation.rowErrors.length, 0);
  assert.equal(validation.rowWarnings.length, 1);
  assert.equal(validation.rowWarnings[0].code, "duplicate_product_sku");
});

test("TASK-057 parser surfaces detection metadata and escapes formula fields", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const readiness = read("src/server/shop-admin/import-export-readiness.ts");

  for (const required of [
    "selectedProductSheet",
    "detectedHeaderRow",
    "detectedMapping",
    "droppedRows",
    "validRows",
    "selectProductSheet",
    "confidence",
    "readOoxmlWorkbookFallback",
    "unzipper.Open.buffer",
    "DOMParser",
  ]) {
    assertContains(workbook, required);
  }

  for (const required of [
    "\"barcode\"",
    "\"itemNumber\"",
    "\"productName\"",
    "\"secondProductName\"",
    "\"supplierName\"",
    "\"categoryName\"",
  ]) {
    assertContains(workbook, required);
  }

  assertContains(readiness, "sanitizeSpreadsheetCell");
  assertContains(readiness, "^[=+\\-@\\t\\r]");
});

test("TASK-057 full database import treats PriceHistory as first-class shop catalog data", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const readiness = read("src/server/shop-admin/import-export-readiness.ts");

  for (const required of [
    "importableRowCount",
    "selectedProductSheet.rows",
    "getSheetRows(sheets, \"Suppliers\")",
    "getSheetRows(sheets, \"Categories\")",
    "getSheetRows(sheets, \"PriceHistory\")",
    "\"proveedor\"",
    "\"nombre\"",
    "\"categoría\"",
    "ParsedPriceHistoryRow",
    "parsePriceHistory",
    "priceHistoryRows",
    "priceHistoryApplied",
    "shop_catalog_import_price_history",
    "fetchCatalogExportPriceRows",
    "mergeCatalogExportPriceRows",
    "BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE",
    'rowLimit: "all"',
  ]) {
    assertContains(workbook, required);
  }

  assertContains(readiness, "MAX_IMPORT_ROWS = 80_000");
  assert.match(
    workbook,
    /export async function buildCatalogWorkbookExport[\s\S]*rowLimit: "all"/,
  );
  assert.doesNotMatch(
    workbook,
    /buildCatalogWorkbookExport[\s\S]*readModel\.prices\.map/,
  );
  assert.doesNotMatch(workbook, /PriceHistory rows are ignored/i);
  assert.doesNotMatch(
    workbook,
    /const totalRows = sheets\.reduce[\s\S]*row_limit_exceeded/,
  );
});

test("TASK-057 database apply uses audited bulk product import for large workbooks", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const staffAwareMutations = read("src/server/shop-admin/staff-aware-mutations.ts");
  const migrationPath =
    "supabase/migrations/20260612021252_task_057_bulk_product_import.sql";

  assert.equal(
    existsSync(join(root, migrationPath)),
    true,
    `${migrationPath} is missing`,
  );

  const migration = read(migrationPath);

  for (const required of [
    "BULK_PRODUCT_IMPORT_THRESHOLD",
    "BULK_PRODUCT_IMPORT_CHUNK_SIZE",
    "BULK_PRICE_HISTORY_IMPORT_CHUNK_SIZE",
    "applyBulkProductImport",
    "chunkRows",
    "applyStaffAwareBulkProductImport",
    "applyStaffAwareBulkPriceHistoryImport",
    "for (const [chunkIndex, productChunk] of Array.from(chunkRows",
    "for (const priceChunk of chunkRows",
    "shop_catalog_import_products",
    "productsApplied",
    "productIds",
    "shop.catalog.product.import.bulk",
    "app_private.resolve_shop_catalog_scope",
    "catalog_scope",
    "source",
    "admin_web",
    "resolveInventoryOwner",
    ".from(\"inventory_products\")",
    ".from(\"inventory_product_prices\")",
  ]) {
    assertContains(`${workbook}\n${staffAwareMutations}\n${migration}`, required);
  }

  assert.doesNotMatch(workbook, /TASK057_DEBUG_BULK/);
  assert.doesNotMatch(
    workbook,
    /context\.principalKind === "pos_staff_manager"[\s\S]*\.from\("inventory_products"\)/,
  );
  assert.doesNotMatch(
    workbook,
    /context\.principalKind === "pos_staff_manager"[\s\S]*\.from\("inventory_product_prices"\)/,
  );
  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+anon/i);
});

test("TASK-057 product detail exposes Price History and related mobile history entries", () => {
  const sections = read("src/components/shop/shopSections.ts");
  const sectionPage = read("src/components/shop/ShopSectionPage.tsx");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const productsPage = read("src/app/shop/products/page.tsx");

  for (const required of [
    "secondaryLiveData?: ShopSectionLiveData[]",
    "localizedSection.secondaryLiveData",
    "Price history",
    "History entries",
    "buildProductPriceHistoryRows",
    "buildProductHistoryEntryRows",
    "getShopHistoryReadModel",
    "historyReadModel",
    "note",
    "Detail",
    "/shop/products/",
  ]) {
    assertContains(`${sections}\n${sectionPage}\n${sectionData}\n${productsPage}`, required);
  }

  assert.ok(
    sectionData.indexOf("Price history") < sectionData.indexOf("History entries"),
    "Product detail should show Price history before related mobile history entries",
  );
});

test("TASK-057 product detail supports archived product rows opened from the catalog table", () => {
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");

  assert.match(
    sectionData,
    /buildProductDetailSection[\s\S]*readModel\.archivedProducts/,
    "Product detail must search archived products as well as active products",
  );
  assert.match(
    sectionData,
    /buildProductDetailSection[\s\S]*field: "State"/,
    "Product detail should disclose whether the row is active or archived",
  );
});

test("TASK-057 mobile history read model is shop_id-first with legacy owner fallback", () => {
  const migrationPath =
    "supabase/migrations/20260612015644_task_057_shop_scoped_mobile_history.sql";

  assert.equal(
    existsSync(join(root, migrationPath)),
    true,
    `${migrationPath} is missing`,
  );

  const migration = read(migrationPath);
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");

  for (const required of [
    "alter table public.shared_sheet_sessions",
    "alter table public.sync_events",
    "add column if not exists shop_id uuid",
    "references public.shops(shop_id)",
    "update public.shared_sheet_sessions",
    "update public.sync_events",
    "shared_sheet_sessions_select_shop_member",
    "sync_events_select_shop_member",
    ".eq(\"shop_id\", selectedShop.shopId)",
    ".is(\"shop_id\", null)",
    "legacyOwnerUserId",
    "Mobile history entries",
    "shared_sheet_sessions",
    "sync_events",
  ]) {
    assertContains(`${migration}\n${historyReadModel}\n${sectionData}`, required);
  }

  assert.doesNotMatch(migration, /alter column shop_id set not null/i);
  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+anon/i);
  assert.doesNotMatch(
    historyReadModel,
    /No mapped mobile owner source is configured for this shop history view\./,
  );
});

test("TASK-057 keeps catalog writes server-side without service role in browser code", () => {
  const clientSurface = [
    "src/app/shop/products/page.tsx",
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/_components/CatalogActionPanel.tsx",
    "src/app/shop/_components/ImportExportActionPanel.tsx",
    "src/components/shop/shopSections.ts",
  ]
    .map((relativePath) => read(relativePath))
    .join("\n");

  assert.doesNotMatch(
    clientSurface,
    /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|service_role|createAdminClient/i,
  );

  const actionContext = read("src/server/shop-admin/action-context.ts");
  const mutations = read("src/server/shop-admin/catalog-mutations.ts");

  assertContains(actionContext, "resolveShopActionContext");
  assertContains(actionContext, "canShopAdmin");
  assertContains(mutations, "shop_catalog_create_product");
  assertContains(mutations, "shop_catalog_update_product");
  assertContains(mutations, "shop_catalog_archive_product");
  assertContains(mutations, "shop_catalog_restore_product");
});

test("TASK-057 introduces an additive shop-scoped catalog migration with legacy bridge", () => {
  const migrationPath =
    "supabase/migrations/20260612010000_task_057_shop_scoped_catalog.sql";

  assert.equal(
    existsSync(join(root, migrationPath)),
    true,
    `${migrationPath} is missing`,
  );

  const migration = read(migrationPath);

  for (const required of [
    "alter table public.inventory_products",
    "add column if not exists shop_id uuid",
    "alter table public.inventory_categories",
    "alter table public.inventory_suppliers",
    "alter table public.inventory_product_prices",
    "references public.shops(shop_id)",
    "update public.inventory_products",
    "from public.shop_inventory_sources",
    "mapping_state = 'mapped'",
    "shop_scoped",
    "legacy_owner_bridge",
    "app_private.resolve_shop_catalog_scope",
    "app_private.resolve_shop_inventory_owner",
    "shop_catalog_create_product",
    "shop_catalog_restore_product",
    "catalog_scope",
    "source",
    "admin_web",
  ]) {
    assertContains(migration, required);
  }

  assert.doesNotMatch(migration, /alter column shop_id set not null/i);
  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+anon/i);
});

test("TASK-057 read model prefers shop_id and keeps legacy owner bridge as fallback", () => {
  const readModel = read("src/server/shop-admin/inventory-read-model.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");

  for (const required of [
    "catalogScope",
    "shop_scoped",
    "legacy_owner_bridge",
    "legacyOwnerUserId",
    ".eq(\"shop_id\", selectedShop.shopId)",
    ".eq(\"owner_user_id\", legacyOwnerUserId)",
    "Catalog scope",
    "Shop scoped",
    "Legacy mobile bridge",
    "Ready via legacy bridge",
  ]) {
    assertContains(`${readModel}\n${sectionData}`, required);
  }

  assert.doesNotMatch(
    readModel,
    /No mapped mobile owner inventory source is configured for this shop\./,
  );
});

test("TASK-057 POS catalog pull uses shop_id catalog rows before legacy mapping", () => {
  const catalogPull = read("src/server/pos-auth/catalog-pull.ts");

  for (const required of [
    "catalogScope",
    "shop_scoped",
    "legacy_owner_bridge",
    ".eq(\"shop_id\", session.shop_id)",
    ".eq(\"owner_user_id\", ownerUserId)",
  ]) {
    assertContains(catalogPull, required);
  }

  assert.doesNotMatch(
    catalogPull,
    /if \(!ownerUserId\) \{\s*return auditedFailure[\s\S]*code: "unmapped"/,
  );
});

test("TASK-057 staff-aware catalog writes use shop_id and catalog scope", () => {
  const mutations = read("src/server/shop-admin/staff-aware-mutations.ts");

  for (const required of [
    "catalogAuditMetadata",
    "catalog_scope",
    'source: "admin_web"',
    "shop_id: context.selectedShop.shopId",
    "shop_scoped",
    "legacy_owner_bridge",
    "assertInventoryRelation",
  ]) {
    assertContains(mutations, required);
  }

  assert.doesNotMatch(
    mutations,
    /\.eq\("owner_user_id", owner\.ownerUserId\)/,
  );
  assert.doesNotMatch(
    mutations,
    /\.eq\("owner_user_id", input\.scope\.legacyOwnerUserId/,
  );
});
