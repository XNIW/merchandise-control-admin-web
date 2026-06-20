import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import test from "node:test";
import * as XLSX from "@e965/xlsx";
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

test("TASK-060 governance is DONE after explicit confirmation", () => {
  const taskPath =
    "docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-060/README.md";

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

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read("docs/MASTER-PLAN.md");

  assertContains(
    task,
    "TASK-060 - Supplier Excel Android-style preview/import",
  );
  assertContains(task, "Stato: `DONE`");
  assertContains(task, "Fase attuale: `DONE`");
  assertContains(evidence, "Verdict corrente: `DONE`");
  assertContains(masterPlan, "Stato TASK-060: `DONE`");
  assertContains(masterPlan, "Task attivo: `NESSUNO`");
  assertContains(task, "workbook reale");
  assertContains(evidence, "Nessun secret/raw workbook");
  assertContains(evidence, "conferma esplicita utente ricevuta");
});

test("TASK-060 supplier modal has Android-style drop zone and empty mutating inputs", () => {
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const importPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );

  assertContains(catalogPanel, 'size?: "default" | "wide"');
  assertContains(catalogPanel, 'size="wide"');
  assertContains(catalogPanel, 'title="Supplier workbook preview"');
  assertContains(catalogPanel, "overflow-y-auto overflow-x-hidden");
  assertContains(catalogPanel, "max-h-[calc(100vh-64px)]");
  assertContains(catalogPanel, "sm:w-[min(1500px,calc(100vw-96px))]");
  assertContains(catalogPanel, "min-w-0 max-w-[min(30vw,22rem)] shrink");
  assertContains(catalogPanel, "categories={categories}");
  assertContains(catalogPanel, "suppliers={suppliers}");
  assertContains(catalogPanel, "leadingAction?: DialogLeadingAction | null");
  assertContains(catalogPanel, "headerAccessory?: React.ReactNode");
  assertContains(catalogPanel, "aria-label={leadingAction.label}");
  assertContains(catalogPanel, "title={leadingAction.label}");
  assertContains(catalogPanel, "type HeaderFileState");
  assertContains(catalogPanel, "supplierImportHeaderFile");
  assertContains(catalogPanel, "supplierImportHeaderAccessory");
  assertContains(
    catalogPanel,
    "onHeaderFileStateChange={handleSupplierImportHeaderFile}",
  );
  assertContains(
    catalogPanel,
    "onHeaderBackStateChange={handleSupplierImportLeadingAction}",
  );

  for (const required of [
    "useId",
    "useRef",
    "fileInputRef",
    'const importExportFileInputClassName = "sr-only"',
    "className={importExportFileInputClassName}",
    "onDragOver",
    "onDragLeave",
    "onDrop",
    "onKeyDown",
    "fileInputRef.current?.click()",
    'role="button"',
    "tabIndex={0}",
    "focus-visible:outline-emerald-600",
    "onDropFile(event.dataTransfer.files.item(0))",
    "Drop a supplier .xlsx or .xls workbook here or choose a file.",
    "Remove file",
    "Replace file",
    "Upload a .xlsx or .xls workbook.",
    "supportedWorkbookAccept",
    "application/vnd.ms-excel",
    'data-import-step="workbook-file"',
    "Check columns",
    "Verify detected product columns",
    "Confirm which workbook columns should be used before opening the",
    'data-import-step="check-columns"',
    "Product row sample",
    "Show raw workbook context",
    "Column mapping",
    "Use enabled columns are included in the digest and product preview.",
    "Optional references start off until you turn them on.",
    "Use",
    "Requirement",
    "Detected Excel column",
    "Sample values",
    "Ignored columns",
    "Re-run preview with mapping",
    "Continue to import preview",
    'data-import-step="import-preview"',
    "Back to check columns",
    "Back to workbook file",
    "onHeaderBackStateChange?: (state: HeaderBackState | null) => void",
    "Default supplier",
    "Default category",
    "Show warnings/errors",
    "Show edited rows",
    "supplier rows",
    "Recognized",
    "Recognized from file",
    "Current catalog values",
    "New product",
    "Discount",
    "Discounted price",
    "Total price",
    "Import values",
    "data-preview-table-scroll",
    "Quantity to import",
    "Retail price to import",
    "Review product rows. Recognized values are read-only; only typed",
    "Mapping changed. Re-run preview with mapping before continuing.",
    "Continue to import preview before apply.",
    "Session expired. Please sign in again.",
    "Sign in again",
    "You do not have permission to import catalog data for this shop.",
    "For security, the browser will ask you to select the workbook again",
    "authLoginHref(authPrincipalKind)",
    'authPrincipalKind === "pos_staff_manager"',
    '"/shop/staff-login"',
    '"/auth/login"',
    "isSessionAuthCode",
    "Boolean(authPrompt)",
    "type HeaderFileState",
    "onHeaderFileStateChange?: (state: HeaderFileState | null) => void",
    "onHeaderFileStateChange({",
    "extension: fileExtension(file.name)",
    "sizeLabel: formatBytes(file.size)",
    "setPreview(null);",
    "return;",
  ]) {
    assertContains(importPanel, required);
  }

  assert.doesNotMatch(
    importPanel,
    /Supplier for row|Category for row/,
    "supplier/category per-row override inputs must not be in the main supplier preview table",
  );

  assertContains(importPanel, "rowAdjustments(previewRows, edits, mode)");
  assertContains(importPanel, 'mode === "supplier"');
  assertContains(importPanel, 'step === "workbook" ? (');
  assertContains(importPanel, "{isDatabase ? (");
  assertContains(
    importPanel,
    "Optional references start off until you turn them on.",
  );
  assertContains(importPanel, "<DefaultImportSettings");
  assertContains(importPanel, "visibleSupplierMappingFields");
  assertContains(importPanel, "supplierHiddenMappingFields");
  assertContains(importPanel, "optionalDefaultOffFields");
  assertContains(importPanel, "numericMappingFields");
  assertContains(importPanel, "isNumericColumnCompatible");
  assertContains(importPanel, "numericMappingIssues");
  assertContains(importPanel, "Column mapping needs review");
  assertContains(importPanel, "Fix column mapping before continuing.");
  assertContains(importPanel, "Choose a numeric column before continuing.");
  assertContains(importPanel, "isMappingFieldEnabled");
  assertContains(importPanel, 'aria-label={`${t("Use")} ${t(label)}`}');
  assertContains(importPanel, "columnDisplayLabel(column)");
  assertContains(
    importPanel,
    "const displayedRows = rawRows.filter((row) => !row.isHeader).slice(0, 5);",
  );
  assertContains(
    importPanel,
    "Shows the first five product rows using the detected header labels.",
  );
  assertContains(importPanel, "data-product-row-sample");
  assertContains(importPanel, "data-product-row-sample-table");
  assertContains(importPanel, '<th className="w-14 px-3 py-2">{t("No.")}</th>');
  assertContains(importPanel, "rawWorkbookContextRows");
  assertContains(importPanel, "onHeaderBackStateChange(headerBackState)");
  assertContains(importPanel, "onHeaderFileStateChange(null)");
  assert.match(
    importPanel,
    /data-import-step="check-columns"[\s\S]*<RawPreviewTable[\s\S]*<ColumnMappingEditor[\s\S]*Default values for imported rows[\s\S]*<DefaultImportSettings/,
    "Step 2 must prioritize product sample, then mapping, then default supplier/category",
  );
  assert.match(
    importPanel,
    /\{isDatabase && !hasExternalHeader \? \([\s\S]*<WizardHeader[\s\S]*onBack=\{goBackFromStep\}/,
    "supplier wizard must render the body header/back only for standalone database transfer",
  );
  assert.doesNotMatch(
    importPanel.match(
      /data-import-step="import-preview"[\s\S]*?<SummaryGrid/,
    )?.[0] ?? "",
    /DefaultImportSettings|Default supplier|Workbook file/,
    "Step 3 must not repeat workbook file or default supplier/category settings",
  );
  assertContains(importPanel, "!edit.categoryName?.trim()");
  assertContains(importPanel, "!edit.retailPrice?.trim()");
  assertContains(importPanel, "!edit.stockQuantity?.trim()");
  assertContains(importPanel, "!edit.supplierName?.trim()");
  assertContains(importPanel, 'value={edit.stockQuantity ?? ""}');
  assertContains(importPanel, 'value={edit.retailPrice ?? ""}');
  assertContains(importPanel, 'value={edit.retailPrice ?? ""}');
  assertContains(importPanel, 'value={edit.stockQuantity ?? ""}');
  assertContains(importPanel, 'list="supplier-import-supplier-options"');
  assertContains(importPanel, 'list="supplier-import-category-options"');
  assertContains(
    importPanel,
    'formData.set("defaultSupplierName", defaultSupplierName)',
  );
  assertContains(
    importPanel,
    'formData.set("defaultCategoryName", defaultCategoryName)',
  );
  assertContains(
    importPanel,
    'formData.set("mappingOverride", mappingOverride)',
  );
  assertContains(importPanel, "recognizedPurchasePrice");
  assertContains(importPanel, "recognizedQuantity");
  assertContains(importPanel, "recognizedRetailPrice");
  assertContains(importPanel, "recognizedDiscount");
  assertContains(importPanel, "recognizedDiscountedPrice");
  assertContains(importPanel, "recognizedLineTotal");
  assertContains(importPanel, "currentPurchasePrice");
  assertContains(importPanel, "currentRetailPrice");
  assertContains(importPanel, "currentStockQuantity");
  assertContains(importPanel, "secondProductName");
  assert.match(
    importPanel,
    /if \(!result\.ok\) \{[\s\S]*handleImportFailure\(result\);[\s\S]*setPreview\(null\);[\s\S]*return;[\s\S]*\}[\s\S]*setPreview\(result\);/,
    "failed preview responses must not render a fake preview state",
  );
  assert.doesNotMatch(
    importPanel,
    /filledAdjustmentCount|Enter at least one quantity or retail price to import/,
    "supplier apply should allow creating products even when quantity/retail inputs are left empty",
  );
});

test("TASK-060 import auth separates expired session from permission denied UX", () => {
  const actionContext = read("src/server/shop-admin/action-context.ts");
  const staffAuth = read("src/server/shop-admin/staff-web-auth.ts");
  const dataAccess = read("src/server/shop-admin/data-access.ts");
  const previewRoute = read("src/app/shop/import-export/preview/route.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");
  const importPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const productsPage = read("src/app/shop/products/page.tsx");
  const importExportPage = read("src/app/shop/import-export/page.tsx");
  const staffLoginPage = read("src/app/(staff-auth)/shop/staff-login/page.tsx");
  const staffLoginActions = read(
    "src/app/(staff-auth)/shop/staff-login/actions.ts",
  );
  const shopCodeForm = read("src/components/auth/ShopCodeLoginForm.tsx");
  const loginPage = read("src/app/auth/login/page.tsx");

  for (const required of [
    '"session_expired"',
    '"no_active_session"',
    '"permission_denied"',
    "Session expired. Please sign in again.",
    "You do not have permission for this shop action.",
    'access.status === "session_expired"',
    'access.status === "no_active_session" || access.status === "no_session"',
    'shopAdminActionResult("permission_denied"',
  ]) {
    assertContains(actionContext, required);
  }

  assertContains(staffAuth, 'status: "session_expired"');
  assertContains(staffAuth, 'status: "no_active_session"');
  assertContains(dataAccess, '"session_expired"');
  assertContains(dataAccess, '"no_active_session"');

  for (const route of [previewRoute, applyRoute]) {
    assertContains(
      route,
      'resolveShopActionContext(requestedShopId, "catalog.import")',
    );
    assertContains(route, "statusForImportResult");
    assertContains(
      route,
      'code === "session_expired" || code === "no_active_session"',
    );
    assertContains(route, "return 401;");
    assertContains(
      route,
      'code === "permission_denied" || code === "unauthorized"',
    );
    assertContains(route, "return 403;");
    assert.ok(
      route.indexOf(
        'resolveShopActionContext(requestedShopId, "catalog.import")',
      ) < route.indexOf("request.formData()"),
      "import auth must run before parsing multipart form data",
    );
    assert.ok(
      route.indexOf(
        'resolveShopActionContext(requestedShopId, "catalog.import")',
      ) < route.indexOf("file.arrayBuffer()"),
      "import auth must run before reading workbook bytes",
    );
  }

  for (const required of [
    'type AuthPrincipalKind = "personal_account" | "pos_staff_manager"',
    "type AuthPrompt",
    "isSessionAuthCode",
    "importErrorMessage",
    "authLoginHref",
    "setAuthPrompt({",
    "href: authLoginHref(authPrincipalKind)",
    "setPreview(null);",
    "You do not have permission to import catalog data for this shop.",
    "Session expired. Please sign in again.",
    "For security, the browser will ask you to select the workbook again",
    "Sign in again",
    "disabled={isPreviewing || !file || Boolean(authPrompt)}",
    "!authPrompt &&",
  ]) {
    assertContains(importPanel, required);
  }

  assertContains(
    catalogPanel,
    'authPrincipalKind?: "personal_account" | "pos_staff_manager"',
  );
  assertContains(catalogPanel, "authPrincipalKind={authPrincipalKind}");
  assertContains(productsPage, 'pageAccess.status === "ready"');
  assertContains(productsPage, "pageAccess.principalKind");
  assertContains(importExportPage, "Moved to Products");
  assert.doesNotMatch(importExportPage, /ImportExportActionPanel/);
  assertContains(staffLoginPage, "next: safeNextPath(firstParam(params.next))");
  assertContains(staffLoginActions, "redirect(nextPath, RedirectType.replace)");
  assertContains(staffLoginActions, "resultPath(publicStaffWebLoginCode(result.code), nextPath)");
  assertContains(
    shopCodeForm,
    '<input name="next" type="hidden" value={nextPath} />',
  );
  assertContains(loginPage, 'loginHref(nextPath, "shop-code")');
  assertContains(loginPage, "<ShopCodeLoginForm");
  assertContains(loginPage, "nextPath={nextPath}");
  assertContains(loginPage, "result={result}");
  assert.doesNotMatch(
    importPanel,
    /Sheet:\s*\{preview\.selectedProductSheet \?\? "Unknown"\}[\s\S]{0,600}role="alert"[\s\S]{0,100}Session expired/,
    "auth errors must be rendered as auth prompts, not as Sheet Unknown previews",
  );
});

test("TASK-060 header detection accepts shifted multilingual Android-style aliases", () => {
  const {
    CATALOG_IMPORT_COLUMN_ALIASES: aliases,
    detectCatalogImportHeaderRow,
  } = loadTypeScriptModule("src/server/shop-admin/catalog-import-contract.ts");

  assert.ok(aliases.barcode.includes("条码"));
  assert.ok(aliases.barcode.includes("条形码"));
  assert.ok(aliases.itemNumber.includes("codice articolo"));
  assert.ok(aliases.itemNumber.includes("产品货号"));
  assert.ok(aliases.productName.includes("中文名"));
  assert.ok(aliases.productName.includes("产品名1"));
  assert.ok(aliases.secondProductName.includes("产品名2"));
  assert.ok(aliases.purchasePrice.includes("v. unit. bruto"));
  assert.ok(aliases.purchasePrice.includes("单价"));
  assert.equal(aliases.retailPrice.includes("售价"), false);
  assert.ok(aliases.discount.includes("折扣"));
  assert.ok(aliases.discountedPrice.includes("售价"));
  assert.ok(aliases.lineTotal.includes("总价"));
  assert.ok(aliases.stockQuantity.includes("unds."));
  assert.ok(aliases.stockQuantity.includes("数量"));
  assert.ok(aliases.supplierName.includes("empresa proveedora"));

  const detection = detectCatalogImportHeaderRow([
    ["Supplier workbook generated by vendor"],
    [],
    [
      "co.barra",
      "codice articolo",
      "中文名",
      "外文名",
      "unds.",
      "v. unit. bruto",
      "零售价",
      "empresa proveedora",
    ],
    [
      "8437001234567",
      "ART-001",
      "Cafe tostado",
      "Roasted coffee",
      12,
      1.25,
      2.5,
      "TASK060 Supplier",
    ],
  ]);

  assert.ok(detection, "shifted header row was not detected");
  assert.equal(detection.headerRowIndex, 2);
  assert.equal(detection.dataStartRowIndex, 3);
  assert.equal(detection.headers.get("barcode"), 0);
  assert.equal(detection.headers.get("itemNumber"), 1);
  assert.equal(detection.headers.get("productName"), 2);
  assert.equal(detection.headers.get("secondProductName"), 3);
  assert.equal(detection.headers.get("stockQuantity"), 4);
  assert.equal(detection.headers.get("purchasePrice"), 5);
  assert.equal(detection.headers.get("retailPrice"), 6);
  assert.equal(detection.headers.get("supplierName"), 7);
  assert.equal(detection.recognizedColumnSources.barcode.source, "alias");
  assert.equal(
    detection.recognizedColumnSources.barcode.columnLabel,
    "co.barra",
  );
});

test("TASK-060 Dingli-like supplier header is detected from shifted Chinese order sheet", () => {
  const { detectCatalogImportHeaderRow } = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );

  const detection = detectCatalogImportHeaderRow([
    ["订单ID", "716813", "销售单号", "Vs20260519-456 By vendor"],
    ["客户 1832", "redacted customer", "公司名称", "redacted supplier"],
    [],
    ["订单日期", "2026-05-19 16:20:26", "备注"],
    [],
    [
      "NO",
      "产品货号",
      "条码",
      "产品名1",
      "产品名2",
      "数量",
      "单价",
      "折扣",
      "售价",
      "总价",
    ],
    [
      1,
      "TASK060-DINGLI-1",
      "9060600000104",
      "TASK060 Dingli Cafe",
      "TASK060 Cafe ES",
      12,
      1.25,
      0,
      2.5,
      15,
    ],
  ]);

  assert.ok(detection, "Dingli-like shifted header row was not detected");
  assert.equal(detection.headerRowIndex, 5);
  assert.equal(detection.dataStartRowIndex, 6);
  assert.equal(detection.headers.get("itemNumber"), 1);
  assert.equal(detection.headers.get("barcode"), 2);
  assert.equal(detection.headers.get("productName"), 3);
  assert.equal(detection.headers.get("secondProductName"), 4);
  assert.equal(detection.headers.get("stockQuantity"), 5);
  assert.equal(detection.headers.get("purchasePrice"), 6);
  assert.equal(detection.headers.get("discount"), 7);
  assert.equal(detection.headers.get("discountedPrice"), 8);
  assert.equal(detection.headers.get("lineTotal"), 9);
  assert.equal(detection.headers.has("retailPrice"), false);
});

test("TASK-060 Belina-like supplier header maps aliases without IMP(CLP) retail leakage", () => {
  const {
    CATALOG_IMPORT_COLUMN_ALIASES: aliases,
    detectCatalogImportHeaderRow,
  } = loadTypeScriptModule("src/server/shop-admin/catalog-import-contract.ts");

  assert.ok(aliases.itemNumber.includes("ref"));
  assert.ok(aliases.stockQuantity.includes("cnt"));
  assert.ok(aliases.secondProductName.includes("local descripcion"));

  const detection = detectCatalogImportHeaderRow([
    ["Documento", "2604137549", "Proveedor", "Belina synthetic"],
    [],
    [
      "Ref",
      "Código Barras",
      "Descripción",
      "Local Descripción",
      "CNT",
      "Precio",
      "IMP(CLP)",
    ],
    [
      "BEL-001",
      "9060600000203",
      "TASK060 Belina Cafe",
      "TASK060 Cafe Local",
      6,
      1234,
      7404,
    ],
  ]);

  assert.ok(detection, "Belina-like header row was not detected");
  assert.equal(detection.headerRowIndex, 2);
  assert.equal(detection.headers.get("itemNumber"), 0);
  assert.equal(detection.headers.get("barcode"), 1);
  assert.equal(detection.headers.get("productName"), 2);
  assert.equal(detection.headers.get("secondProductName"), 3);
  assert.equal(detection.headers.get("stockQuantity"), 4);
  assert.equal(detection.headers.get("purchasePrice"), 5);
  assert.equal(detection.headers.has("retailPrice"), false);
  assert.equal(detection.headers.has("categoryName"), false);
});

test("TASK-060 pattern fallback maps stable supplier sheets without a header row", () => {
  const { detectCatalogImportHeaderRow } = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );

  const detection = detectCatalogImportHeaderRow([
    ["8437001234501", "ART-001", "咖啡豆", 12, 1.25],
    ["8437001234502", "ART-002", "马黛茶", 8, 2.1],
    ["8437001234503", "ART-003", "橄榄油", 30, 5.5],
    ["8437001234504", "ART-004", "干意面", 42, 0.75],
  ]);

  assert.ok(detection, "pattern fallback did not detect product-like rows");
  assert.equal(detection.headerRowIndex, null);
  assert.equal(detection.dataStartRowIndex, 0);
  assert.equal(detection.headers.get("barcode"), 0);
  assert.equal(detection.headers.get("productName"), 2);
  assert.equal(detection.headers.get("stockQuantity"), 3);
  assert.equal(detection.headers.get("purchasePrice"), 4);
  assert.equal(detection.recognizedColumnSources.barcode.source, "pattern");
  assert.equal(detection.recognizedColumnSources.productName.source, "pattern");
});

test("TASK-060 generated metadata records missing required identity columns conservatively", () => {
  const { detectCatalogImportHeaderRow } = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );

  const detection = detectCatalogImportHeaderRow([
    ["codice articolo", "中文名", "quantità", "pre/u"],
    ["ART-001", "Cafe tostado", 12, 1.25],
    ["ART-002", "Yerba mate", 8, 2.1],
  ]);

  assert.ok(detection, "generated-barcode candidate was not detected");
  assert.equal(detection.headerRowIndex, 0);
  assert.equal(detection.headers.has("barcode"), false);
  assert.equal(detection.recognizedColumnSources.barcode.source, "generated");
  assert.equal(detection.recognizedColumnSources.barcode.columnIndex, null);
  assert.equal(detection.recognizedColumnSources.productName.source, "alias");
});

test("TASK-060 supplier apply creates products and binds digests to shop context", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");

  for (const required of [
    "write_staff_shop_admin_audit",
    'context.principalKind === "pos_staff_manager"',
    "recognizedColumnSources",
    "recognizedPurchasePrice: product.purchasePrice",
    "recognizedQuantity: product.stockQuantity",
    "recognizedRetailPrice: product.retailPrice",
    "recognizedDiscount: product.discount",
    "recognizedDiscountedPrice: product.discountedPrice",
    "recognizedLineTotal: product.lineTotal",
    "currentPurchasePrice",
    "currentRetailPrice",
    "currentStockQuantity",
    "SUPPLIER_DEFAULT_EXCLUDED_MAPPING_FIELDS",
    "SUPPLIER_ALWAYS_EXCLUDED_MAPPING_FIELDS",
    "NUMERIC_COMPATIBLE_MAPPING_FIELDS",
    "applySupplierDefaultFieldSelection",
    "numericMappingCompatibilityErrors",
    "mapping_incompatible_type",
    "Mapped column must contain numeric values. Choose a numeric source column before import preview.",
    "productReferenceNumberValue",
    "rawPreviewColumns",
    "rawPreviewRows",
    "rawWorkbookContextRows",
    "productPreviewRows",
    "MAX_PRODUCT_SAMPLE_ROWS",
    "bindPreviewDigestToShop",
    "mappingId: readModel.mapping?.mappingId ?? null",
    "parsedDigest: parsed.digest",
    "shopId: context.selectedShop.shopId",
    "mappingConfirmed: true",
    "input.previewDigest !== boundPreviewDigest",
    "const requiredConfirmation =",
    'importMode === "database" ? "IMPORT DATABASE" : "APPLY"',
    "normalizedConfirmation !== requiredConfirmation",
    "applySupplierWorkbookRows",
    "const products = parsed.products.map((product)",
    "const existing = findProduct(readModel.products, product)",
    "manualSupplierName",
    "manualCategoryName",
    "defaultSupplierName",
    "defaultCategoryName",
    'barcode: product.barcode || existing?.barcode || ""',
    "productId: existing?.productId ?? product.productId",
    'productName: product.productName || existing?.productName || ""',
    "categories: []",
    "priceHistory: []",
    "suppliers: []",
    'parsed.importMode === "supplier"',
    "supplierName.value !== undefined",
    "categoryName.value !== undefined",
    "hasPlausibleProductIdentity",
    "numericCells >= 2",
    "!isValidProductBarcode(barcode) && !hasProductNameText",
    "Barcode must contain 8 to 14 digits.",
  ]) {
    assertContains(workbook, required);
  }

  assert.doesNotMatch(
    workbook.match(
      /function bindPreviewDigestToShop\([\s\S]*?\n\}/,
    )?.[0] ?? "",
    /catalogScope/,
    "preview digest must not include mutable catalogScope",
  );

  assert.match(
    workbook,
    /parsed\.importMode === "supplier"[\s\S]*applySupplierWorkbookRows[\s\S]*applyRowAdjustments/,
    "supplier mode must use the supplier product import path",
  );
  assert.doesNotMatch(
    workbook.match(
      /function applySupplierWorkbookRows[\s\S]*?function buildProductIdMaps/,
    )?.[0] ?? "",
    /Supplier import can update quantity or retail price only|flatMap/,
    "supplier path must not fail closed on new product rows",
  );
  assert.doesNotMatch(
    workbook,
    /At least one quantity or retail price must be filled before applying supplier import/,
    "supplier apply must allow new products with empty quantity and retail inputs",
  );
  assert.match(
    workbook,
    /rawPreviewRows: productPreviewRows\([\s\S]*rawWorkbookContextRows: rawPreviewRows\(/,
    "product sample rows must be separated from raw workbook context rows",
  );
  assert.match(
    workbook,
    /function productPreviewRows[\s\S]*dataStartIndex = headerRowIndex === null \? 0 : headerRowIndex \+ 1[\s\S]*isHeader: true[\s\S]*\.\.\.sampleRows/,
    "product sample must start at the detected header row and then show product rows",
  );
  assert.match(
    workbook,
    /function rawPreviewColumns[\s\S]*columnIndex: index[\s\S]*label: normalizeLabel\(headerRow\[index\]\)/,
    "preview DTO must expose real detected header labels with their source column indexes",
  );
  assert.match(
    workbook,
    /const MAX_PRODUCT_SAMPLE_ROWS = 5;/,
    "product row sample must be bounded to five product rows",
  );
  assert.match(
    workbook,
    /SUPPLIER_ALWAYS_EXCLUDED_MAPPING_FIELDS[\s\S]*"retailPrice"/,
    "supplier mapping must never use retailPrice from workbook columns",
  );
  assert.match(
    workbook,
    /NUMERIC_COMPATIBLE_MAPPING_FIELDS[\s\S]*"discount"[\s\S]*"discountedPrice"[\s\S]*"lineTotal"[\s\S]*"purchasePrice"[\s\S]*"stockQuantity"/,
    "numeric supplier fields must be guarded by sample compatibility checks",
  );
});

test("TASK-060 workbook parser accepts XLSX, legacy XLS and HTML-Excel safely", () => {
  const workbookSource = read(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const routeSource = read("src/app/shop/import-export/preview/route.ts");

  for (const required of [
    'import * as SheetJS from "@e965/xlsx"',
    'const XLS_CONTENT_TYPE = "application/vnd.ms-excel"',
    "text/html",
    "application/xhtml+xml",
    "isLegacyWorkbookName",
    "readSheetJsWorkbook",
    "readWorkbookSheets",
    "SheetJS.utils.sheet_to_json",
    "mappingOverride?: string",
    "MAX_MAPPING_OVERRIDE_JSON_BYTES",
    "validateMappingOverride",
    "applyMappingOverride",
    "mappingOverride,",
  ]) {
    assertContains(workbookSource, required);
  }

  assertContains(
    routeSource,
    'mappingOverride: formString(formData, "mappingOverride") || undefined',
  );

  const xlsWorkbook = XLSX.utils.book_new();
  const xlsSheet = XLSX.utils.aoa_to_sheet([
    ["barcode", "product_name", "stock_quantity"],
    ["9060600000098", "TASK060 XLS Product", 3],
  ]);

  XLSX.utils.book_append_sheet(xlsWorkbook, xlsSheet, "Products");
  const xlsBuffer = XLSX.write(xlsWorkbook, {
    bookType: "xls",
    type: "buffer",
  });
  const parsedXls = XLSX.read(xlsBuffer, { type: "buffer" });
  const parsedXlsRows = XLSX.utils.sheet_to_json(parsedXls.Sheets.Products, {
    header: 1,
  });

  assert.equal(parsedXls.SheetNames[0], "Products");
  assert.deepEqual(parsedXlsRows[1], [
    "9060600000098",
    "TASK060 XLS Product",
    3,
  ]);

  const htmlExcel = Buffer.from(
    "<html><body><table><tr><td>barcode</td><td>product_name</td></tr><tr><td>9060600000104</td><td>TASK060 HTML XLS Product</td></tr></table></body></html>",
    "utf8",
  );
  const parsedHtml = XLSX.read(htmlExcel, { type: "buffer" });
  const parsedHtmlRows = XLSX.utils.sheet_to_json(
    parsedHtml.Sheets[parsedHtml.SheetNames[0]],
    { header: 1 },
  );

  assert.equal(String(parsedHtmlRows[1][0]), "9060600000104");
  assert.equal(parsedHtmlRows[1][1], "TASK060 HTML XLS Product");
});

test("TASK-060 supplier mode ignores database-transfer side sheets", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");

  assert.match(
    workbook,
    /const supplierRows = importMode === "database"[\s\S]*getSheetRows\(sheets, "Suppliers"\)[\s\S]*: \[\];/,
    "supplier preview/apply must not parse Suppliers sheet mutations",
  );
  assert.match(
    workbook,
    /const categoryRows = importMode === "database"[\s\S]*getSheetRows\(sheets, "Categories"\)[\s\S]*: \[\];/,
    "supplier preview/apply must not parse Categories sheet mutations",
  );
  assert.match(
    workbook,
    /const priceHistoryRows = importMode === "database"[\s\S]*getSheetRows\(sheets, "PriceHistory"\)[\s\S]*: \[\];/,
    "supplier preview/apply must not parse PriceHistory sheet mutations",
  );
});

test("TASK-060 supplier validation treats supplier/category references as preview-only", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");

  for (const required of [
    "isSupplierReferenceOnlyIssue",
    'issue.code === "unknown_supplier"',
    'issue.code === "unknown_category"',
    "supplierVisibleRowErrors",
    'parsed.importMode === "supplier"',
    'adjustedParsed.importMode === "supplier"',
  ]) {
    assertContains(workbook, required);
  }
});

test("TASK-060 import routes keep no-store node runtime and guard files before reading bytes", () => {
  const previewRoute = read("src/app/shop/import-export/preview/route.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");

  for (const route of [previewRoute, applyRoute]) {
    assertContains(route, 'export const dynamic = "force-dynamic"');
    assertContains(route, 'export const runtime = "nodejs"');
    assertContains(route, '"Cache-Control": "no-store"');
    assertContains(route, "requestedShopIdFromUrl(request)");
    assert.ok(
      route.indexOf("guardCatalogImportExportPostRequest(request)") <
        route.indexOf("request.formData()"),
      "request guard must run before request.formData()",
    );
    assert.ok(
      route.indexOf(
        'resolveShopActionContext(requestedShopId, "catalog.import")',
      ) < route.indexOf("request.formData()"),
      "auth must run before multipart parsing",
    );
    assert.ok(
      route.indexOf("guardCatalogImportWorkbookFile(file)") <
        route.indexOf("file.arrayBuffer()"),
      "file guard must run before file.arrayBuffer()",
    );
    assert.doesNotMatch(
      route,
      /SUPABASE_SERVICE_ROLE_KEY|service_role|credential_hash/i,
    );
  }
});
