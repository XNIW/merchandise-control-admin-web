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

function exportedTypeBlock(source, typeName) {
  const match = source.match(
    new RegExp(`export type ${escapeRegExp(typeName)} = \\{[\\s\\S]*?\\n\\};`),
  );
  assert.ok(match, `${typeName} type block was not found`);
  return match[0];
}

function loadTypeScriptModule(relativePath) {
  return loadTypeScriptModuleWithPrivateExports(relativePath);
}

function loadTypeScriptModuleWithPrivateExports(relativePath, exportNames = []) {
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
  function requireFromTest(id) {
    if (id === "server-only") {
      return {};
    }

    if (id === "./import-export-readiness") {
      return {
        EXCEL_WORKBOOK_SHEETS: ["Products", "Suppliers", "Categories"],
        FORMULA_INJECTION_PATTERN: /^[=+\-@\t\r]/,
        MAX_IMPORT_BYTES: 5 * 1024 * 1024,
        MAX_IMPORT_ROWS: 5000,
        sanitizeSpreadsheetCell(value) {
          const text = String(value ?? "");
          return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        },
      };
    }

    if (id === "./catalog-import-contract") {
      return loadTypeScriptModule(
        "src/server/shop-admin/catalog-import-contract.ts",
      );
    }

    if (id.startsWith("./") || id.startsWith("@/")) {
      return new Proxy(
        {},
        {
          get() {
            return () => {
              throw new Error(`Stubbed dependency ${id} was invoked`);
            };
          },
        },
      );
    }

    return requireForTranspiledModule(id);
  }

  const context = createContext({
    Buffer,
    exports: cjsModule.exports,
    module: cjsModule,
    require: requireFromTest,
  });

  const privateExports = exportNames
    .map((name) => `module.exports.${name} = ${name};`)
    .join("\n");

  new Script(`${transpiled.outputText}\n${privateExports}`, {
    filename: relativePath,
  }).runInContext(context);

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
  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
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
  assertContains(catalogPanel, 'title={t("Supplier workbook preview")}');
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
    "Detected canonical columns start enabled and can be ignored manually.",
    "Use",
    "Requirement",
    "Detected Excel column",
    "Sample values",
    "Ignored columns",
    "Re-run preview with mapping",
    "Continue to import preview",
    'data-import-step="import-preview"',
    'data-import-step="sync-db-review"',
    'type ImportWizardStep = "workbook" | "mapping" | "preview" | "sync"',
    "SupplierSyncPreviewPanel",
    "requestSyncPreview",
    "syncPreviewDigest",
    'formData.set("syncPreviewDigest", syncPreviewDigest)',
    "syncPreviewStale",
    "invalidateSyncPreview",
    "setSyncPreviewStale(true)",
    'step === "sync"',
    "Ricalcola Sync DB",
    "Continua a Sync DB",
    "Back to row correction",
    "Resolve Sync DB errors before apply.",
    "Sync DB preview is stale. Recalculate Sync DB before apply.",
    "Review DB inserts, updates, no-change rows, skipped rows, warnings and blockers before final apply.",
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
    "Continue to Sync DB before apply.",
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

  assertContains(importPanel, "Supplier to import for row");
  assertContains(importPanel, "Category to import for row");

  assertContains(importPanel, "rowAdjustments(previewRows, edits, mode)");
  assertContains(importPanel, 'mode === "supplier"');
  assertContains(importPanel, 'step === "workbook" ? (');
  assertContains(importPanel, "{isDatabase ? (");
  assertContains(
    importPanel,
    "Detected canonical columns start enabled and can be ignored manually.",
  );
  assertContains(importPanel, "<DefaultImportSettings");
  assertContains(importPanel, "visibleSupplierMappingFields");
  assertContains(importPanel, "supplierHiddenMappingFields");
  assertContains(importPanel, "optionalDefaultOffFields");
  assertContains(
    importPanel,
    "const supplierHiddenMappingFields = new Set<CatalogImportField>();",
  );
  assertContains(
    importPanel,
    "const optionalDefaultOffFields = new Set<CatalogImportField>();",
  );
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
  assertContains(importPanel, "!edit.category?.trim()");
  assertContains(importPanel, "edit.skip !== true");
  assertContains(importPanel, "!edit.barcode?.trim()");
  assertContains(importPanel, "!edit.purchasePrice?.trim()");
  assertContains(importPanel, "!edit.retailPrice?.trim()");
  assertContains(importPanel, "!edit.quantity?.trim()");
  assertContains(importPanel, "!edit.supplier?.trim()");
  assertContains(importPanel, 'value={edit.barcode ?? ""}');
  assertContains(importPanel, 'value={edit.purchasePrice ?? ""}');
  assertContains(importPanel, 'value={edit.quantity ?? ""}');
  assertContains(importPanel, 'value={edit.retailPrice ?? ""}');
  assertContains(importPanel, 'value={edit.supplier ?? ""}');
  assertContains(importPanel, 'value={edit.category ?? ""}');
  assertContains(importPanel, "Skip supplier import row");
  assertContains(importPanel, "Skip row");
  assertContains(importPanel, "unresolvedSupplierBlockedRows(preview, edits, mode)");
  assertContains(importPanel, "Calculate retail price from purchase price");
  assertContains(importPanel, "setBulkMarkupPercent");
  assertContains(importPanel, "setBulkRoundTo");
  assertContains(importPanel, "setBulkOnlyEmptyRetailPrice");
  assertContains(importPanel, "Apply only where retailPrice is empty");
  assertContains(importPanel, "Purchase price is never copied into retail price automatically.");
  assertContains(importPanel, 'value={edit.retailPrice ?? ""}');
  assertContains(importPanel, 'value={edit.quantity ?? ""}');
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
  assertContains(importPanel, "recognizedTotalPrice");
  assertContains(importPanel, "currentPurchasePrice");
  assertContains(importPanel, "currentRetailPrice");
  assertContains(importPanel, "currentQuantity");
  assertContains(importPanel, "secondProductName");
  assertContains(importPanel, "Nuovi");
  assertContains(importPanel, "Aggiornamenti");
  assertContains(importPanel, "Senza modifiche");
  assertContains(importPanel, "Skippati");
  assertContains(importPanel, "Errori");
  assertContains(importPanel, "type SyncReviewTab");
  assertContains(importPanel, 'role="tablist"');
  assertContains(importPanel, "data-sync-review-tabs");
  assertContains(importPanel, "data-sync-review-tab={tab.key}");
  assertContains(importPanel, "data-sync-review-search");
  assertContains(importPanel, "Search barcode, name, item number, supplier or category");
  assertContains(importPanel, "syncProductMatches");
  assertContains(importPanel, "syncUpdateMatches");
  assertContains(importPanel, "syncIssueMatches");
  assert.match(
    importPanel,
    /step !== "sync"/,
    "apply must be available only from Sync Database Step 4",
  );
  assertContains(importPanel, "Continue to Sync DB before apply.");
  assertContains(importPanel, "{ key: \"sync\", label: \"Sync Database\" }");
  assert.match(
    importPanel,
    /if \(!result\.ok\) \{[\s\S]*handleImportFailure\(result\);[\s\S]*setPreview\(null\);[\s\S]*return;[\s\S]*\}[\s\S]*setPreview\(result\);/,
    "failed preview responses must not render a fake preview state",
  );
  const contract = read("src/server/shop-admin/catalog-import-contract.ts");
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  assertContains(contract, '"missing_required_retail_price"');
  assertContains(
    contract,
    "New product requires retailPrice before supplier import apply.",
  );
  assertContains(workbook, "workbookKindFromBytes");
  assertContains(workbook, 'workbookKindFromBytes(input.bytes) === "xls"');
  assertContains(workbook, "skip?: boolean");
  assertContains(workbook, "parseAdjustmentBarcode");
  assertContains(workbook, "adjustment.skip === true");
  assertContains(workbook, "correctedBarcodeRows");
  assertContains(workbook, 'issue.field === "barcode"');
  assertContains(workbook, "buildSupplierSyncPreview");
  assertContains(workbook, "CatalogWorkbookSyncPreview");
  assertContains(workbook, "effectiveProductRowsLastWins");
  assert.doesNotMatch(
    workbook,
    /duplicate_final_barcode/,
    "duplicate barcodes must remain warning-only and use last occurrence in sync preview",
  );
  assertContains(workbook, "supplierSyncPreviewFingerprint");
  assertContains(workbook, "input.syncPreviewDigest");
  assertContains(workbook, "input.syncPreviewDigest !== syncPreview.fingerprint");
  assertContains(workbook, "!syncPreview.canApply");
  assertContains(workbook, "newProducts");
  assertContains(workbook, "updatedProducts");
  assertContains(workbook, "noChangeRows");
  assertContains(workbook, "skippedRows");
  assertContains(workbook, "changedSupplierRows");
  const previewRoute = read("src/app/shop/import-export/preview/route.ts");
  const applyRoute = read("src/app/shop/import-export/apply/route.ts");
  assertContains(
    previewRoute,
    'rowAdjustments: formString(formData, "rowAdjustments") || undefined',
  );
  assertContains(
    applyRoute,
    'syncPreviewDigest: formString(formData, "syncPreviewDigest") || undefined',
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
    "The workbook is over the 5 MB Admin import limit. Use Win7POS supplier Excel import for large supplier files, or split the workbook and retry here.",
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
  assert.ok(aliases.totalPrice.includes("总价"));
  assert.ok(aliases.quantity.includes("unds."));
  assert.ok(aliases.quantity.includes("数量"));
  assert.ok(aliases.supplier.includes("empresa proveedora"));

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
  assert.equal(detection.headers.get("quantity"), 4);
  assert.equal(detection.headers.get("purchasePrice"), 5);
  assert.equal(detection.headers.get("retailPrice"), 6);
  assert.equal(detection.headers.get("supplier"), 7);
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
  assert.equal(detection.headers.get("quantity"), 5);
  assert.equal(detection.headers.get("purchasePrice"), 6);
  assert.equal(detection.headers.get("discount"), 7);
  assert.equal(detection.headers.get("discountedPrice"), 8);
  assert.equal(detection.headers.get("totalPrice"), 9);
  assert.equal(detection.headers.has("retailPrice"), false);
});

test("TASK-060 Belina-like supplier header maps aliases without IMP(CLP) retail leakage", () => {
  const {
    CATALOG_IMPORT_COLUMN_ALIASES: aliases,
    detectCatalogImportHeaderRow,
  } = loadTypeScriptModule("src/server/shop-admin/catalog-import-contract.ts");

  assert.ok(aliases.itemNumber.includes("ref"));
  assert.ok(aliases.quantity.includes("cnt"));
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
  assert.equal(detection.headers.get("quantity"), 4);
  assert.equal(detection.headers.get("purchasePrice"), 5);
  assert.equal(detection.headers.has("retailPrice"), false);
  assert.equal(detection.headers.has("category"), false);
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
  assert.equal(detection.headers.get("quantity"), 3);
  assert.equal(detection.headers.get("purchasePrice"), 4);
  assert.equal(detection.recognizedColumnSources.barcode.source, "pattern");
  assert.equal(detection.recognizedColumnSources.productName.source, "pattern");
});

test("TASK-060 generated metadata records missing required identity columns conservatively", () => {
  const { detectCatalogImportHeaderRow } = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );

  const detection = detectCatalogImportHeaderRow([
    ["codice articolo", "中文名", "quantità", "pre/u", "totale"],
    ["ART-001", "Cafe tostado", 12, 1.25, 15],
    ["ART-002", "Yerba mate", 8, 2.1, 16.8],
  ]);

  assert.ok(detection, "generated-barcode candidate was not detected");
  assert.equal(detection.headerRowIndex, 0);
  assert.equal(detection.headers.has("barcode"), false);
  assert.equal(detection.recognizedColumnSources.barcode.source, "generated");
  assert.equal(detection.recognizedColumnSources.barcode.columnIndex, null);
  assert.equal(detection.recognizedColumnSources.productName.source, "alias");
});

test("TASK-060 Android parseNumber supplier cases stay exact", () => {
  const { parseWorkbookNumber } = loadTypeScriptModuleWithPrivateExports(
    "src/server/shop-admin/import-export-workbook.ts",
    ["parseWorkbookNumber"],
  );
  const fixture = JSON.parse(
    read("tests/fixtures/supplier-import/android-canonical-sample.json"),
  );

  for (const [raw, expected] of Object.entries(fixture.parseNumberResults)) {
    assert.equal(parseWorkbookNumber(raw), expected);
  }
});

test("TASK-060 canonical Android supplier fixture drives preview validation summary", () => {
  const {
    CATALOG_IMPORT_FIELDS: catalogImportFields,
    detectCatalogImportHeaderRow,
    effectiveLastProductRows,
    validateCatalogImportRows,
  } = loadTypeScriptModuleWithPrivateExports(
    "src/server/shop-admin/catalog-import-contract.ts",
    ["effectiveLastProductRows"],
  );
  const fixture = JSON.parse(
    read("tests/fixtures/supplier-import/android-canonical-sample.json"),
  );

  const detection = detectCatalogImportHeaderRow(fixture.sampleRows);
  assert.ok(detection, "canonical supplier fixture header was not detected");
  assert.equal(detection.headerRowIndex, 0);

  const sheetDetection = detectCatalogImportHeaderRow(fixture.sheetRows);
  assert.ok(sheetDetection, "fixture with metadata rows was not detected");
  assert.equal(
    sheetDetection.headerRowIndex,
    fixture.metadataRowsBeforeHeader.length,
  );

  for (const rows of Object.values(fixture.aliasSamples)) {
    const aliasDetection = detectCatalogImportHeaderRow(rows);
    assert.ok(aliasDetection, "alias sample header was not detected");
    assert.deepEqual(
      [...aliasDetection.headers]
        .sort((a, b) => a[1] - b[1])
        .map(([field]) => field),
      fixture.normalizedHeader,
    );
  }

  const headerlessDetection = detectCatalogImportHeaderRow(
    fixture.headerlessSample.rows,
  );
  assert.ok(headerlessDetection, "headerless fixture sample was not detected");
  assert.equal(headerlessDetection.headerRowIndex, null);
  assert.deepEqual(
    [...headerlessDetection.headers]
      .sort((a, b) => a[1] - b[1])
      .map(([field]) => field),
    fixture.headerlessSample.normalizedHeader,
  );

  const normalizedHeaderByColumn = [];
  for (const [field, columnIndex] of detection.headers) {
    normalizedHeaderByColumn[columnIndex] = field;
  }
  assert.deepEqual(
    normalizedHeaderByColumn.filter(Boolean),
    fixture.normalizedHeader,
  );

  const headerSource = Object.fromEntries(
    Object.keys(fixture.headerSource).map((field) => [
      field,
      detection.recognizedColumnSources[field]?.source,
    ]),
  );
  assert.deepEqual(headerSource, fixture.headerSource);
  assert.deepEqual(
    [...catalogImportFields].sort(),
    [...fixture.publicKeysAudit.allowed].sort(),
  );

  const canonicalProducts = [
    {
      barcode: "9999999900001",
      category: "Categoria A",
      itemNumber: "EX-001",
      productName: "Existing rename",
      purchasePrice: 100,
      quantity: 3,
      retailPrice: 150,
      rowNumber: 2,
      supplier: "Fornitore A",
    },
    {
      barcode: "8888888800008",
      category: "Categoria A",
      productName: "Duplicate first",
      purchasePrice: 200,
      quantity: 1,
      retailPrice: 250,
      rowNumber: 3,
      supplier: "Fornitore A",
    },
    {
      barcode: "8888888800008",
      category: "Categoria A",
      productName: "Duplicate last",
      purchasePrice: 220,
      quantity: 2,
      retailPrice: 270,
      rowNumber: 4,
      supplier: "Fornitore A",
    },
    {
      barcode: "7777777700007",
      category: "Categoria B",
      itemNumber: "ART-777",
      productName: "",
      purchasePrice: 100,
      quantity: 1,
      retailPrice: 160,
      rowNumber: 5,
      supplier: "Fornitore B",
    },
  ];
  const effectiveProducts = effectiveLastProductRows(canonicalProducts);
  const duplicateLast = effectiveProducts.find(
    (product) => product.barcode === "8888888800008",
  );
  assert.equal(duplicateLast.productName, "Duplicate last");
  assert.equal(duplicateLast.quantity, 2);
  assert.equal(
    effectiveProducts.filter((product) => product.barcode === "8888888800008")
      .length,
    1,
  );

  const validation = validateCatalogImportRows(
    {
      categories: [],
      products: canonicalProducts,
      suppliers: [],
    },
    {
      categories: [
        { categoryId: "cat-a", name: "Categoria A" },
        { categoryId: "cat-b", name: "Categoria B" },
      ],
      products: [
        {
          barcode: "9999999900001",
          categoryId: "cat-a",
          itemNumber: "EX-001",
          productId: "prod-existing",
          productName: "Existing old",
          purchasePrice: 90,
          retailPrice: 140,
          secondProductName: null,
          supplierId: "sup-a",
        },
      ],
      suppliers: [
        { name: "Fornitore A", supplierId: "sup-a" },
        { name: "Fornitore B", supplierId: "sup-b" },
      ],
    },
  );

  assert.equal(validation.summary.products, fixture.dataRowsCount);
  assert.equal(validation.summary.newProducts, fixture.newProducts);
  assert.equal(validation.summary.updatedProducts, fixture.updatedProducts);
  assert.equal(validation.summary.errors, fixture.errors.length);
  assert.equal(validation.summary.errors === 0, fixture.canApply);
  const duplicateWarningRows = validation.rowWarnings
    .filter((warning) => warning.code === "duplicate_product_barcode")
    .map((warning) => warning.row);
  assert.equal(duplicateWarningRows.length > 0 ? 1 : 0, fixture.warnings);
  assert.equal(
    JSON.stringify(duplicateWarningRows),
    JSON.stringify(fixture.duplicateWarning.rows),
  );

  const missingRetailValidation = validateCatalogImportRows(
    {
      categories: [],
      products: [
        {
          barcode: fixture.retailMissingNewProduct.barcode,
          itemNumber: "ART-NO-RETAIL",
          productName: "",
          purchasePrice: 100,
          quantity: 1,
          rowNumber: 10,
        },
      ],
      suppliers: [],
    },
    {
      categories: [],
      products: [],
      suppliers: [],
    },
  );
  assert.equal(
    JSON.stringify(missingRetailValidation.rowErrors.map((issue) => issue.code)),
    JSON.stringify(["missing_required_retail_price"]),
  );

  for (const key of fixture.publicKeysAudit.forbidden) {
    assert.equal(
      fixture.previewRows.some((row) => Object.hasOwn(row, key)),
      false,
      `${key} leaked into fixture previewRows`,
    );
  }
});

test("TASK-060 supplier apply creates products and binds digests to shop context", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const contract = read("src/server/shop-admin/catalog-import-contract.ts");

  for (const required of [
    "write_staff_shop_admin_audit",
    'context.principalKind === "pos_staff_manager"',
    "recognizedColumnSources",
    "recognizedPurchasePrice: product.purchasePrice",
    "recognizedQuantity: product.quantity",
    "recognizedRetailPrice: product.retailPrice",
    "recognizedDiscount: product.discount",
    "recognizedDiscountedPrice: product.discountedPrice",
    "recognizedTotalPrice: product.totalPrice",
    "currentPurchasePrice",
    "currentRetailPrice",
    "currentQuantity",
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
    "effectiveProductRowsLastWins",
    "const effectiveProductsToApply = effectiveProductRowsLastWins(adjustedParsed.products);",
    "const productsToApply = effectiveProductsToApply.filter((row)",
    "productsToApply.length >= BULK_PRODUCT_IMPORT_THRESHOLD",
    "for (const row of productsToApply)",
    "supplierImportHistoryRows(productsToApply, readModel)",
    "applySupplierWorkbookRows",
    "const products = parsed.products.flatMap((product)",
    "if (adjustment?.skip === true)",
    "const adjustedBarcode = maybeText(adjustment?.barcode)",
    "const productForLookup = adjustedBarcode",
    "const existing = findProduct(readModel.products, productForLookup)",
    "manualSupplierName",
    "manualCategoryName",
    "defaultSupplierName",
    "defaultCategoryName",
    'barcode: adjustedBarcode ?? (product.barcode || existing?.barcode || "")',
    "rowErrors = parsed.rowErrors.filter",
    "productId: existing?.productId ?? product.productId",
    'productName: product.productName || existing?.productName || ""',
    "product.retailPrice ??",
    "product.quantity ??",
    "categories: []",
    "priceHistory: []",
    "suppliers: []",
    'parsed.importMode === "supplier"',
    "supplier.value !== undefined",
    "category.value !== undefined",
    "hasPlausibleProductIdentity",
    "numericCells >= 2",
    "!isValidProductBarcode(barcode) && !hasProductNameText",
    "Barcode must contain 8, 12, or 13 digits.",
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
    /Supplier import can update quantity or retail price only/,
    "supplier path must not fail closed on new product rows",
  );
  assertContains(contract, '"missing_required_retail_price"');
  assertContains(contract, "product.retailPrice === undefined");
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
  assertContains(
    workbook,
    "const SUPPLIER_ALWAYS_EXCLUDED_MAPPING_FIELDS = new Set<CatalogImportField>();",
    "supplier mapping must allow canonical retailPrice when the workbook exposes it",
  );
  assertContains(
    workbook,
    "const SUPPLIER_DEFAULT_EXCLUDED_MAPPING_FIELDS = new Set<CatalogImportField>();",
    "supplier mapping must keep detected canonical supplemental fields unless the user disables them",
  );
  const previewRowType = exportedTypeBlock(
    workbook,
    "CatalogWorkbookPreviewRow",
  );
  const rowAdjustmentType = exportedTypeBlock(
    workbook,
    "CatalogWorkbookRowAdjustment",
  );
  assert.doesNotMatch(
    previewRowType,
    /stockQuantity|supplierName|categoryName/,
    "supplier preview row DTO must not expose forbidden public import keys",
  );
  assert.doesNotMatch(
    rowAdjustmentType,
    /stockQuantity|supplierName|categoryName/,
    "supplier row adjustments must use canonical quantity/supplier/category",
  );
  assert.match(
    workbook,
    /NUMERIC_COMPATIBLE_MAPPING_FIELDS[\s\S]*"discount"[\s\S]*"discountedPrice"[\s\S]*"oldPurchasePrice"[\s\S]*"oldRetailPrice"[\s\S]*"realQuantity"[\s\S]*"totalPrice"[\s\S]*"purchasePrice"[\s\S]*"quantity"/,
    "numeric supplier fields must be guarded by sample compatibility checks",
  );
});

test("TASK-060 supplier row adjustments can correct or skip missing barcode rows", () => {
  const {
    applySupplierWorkbookRows,
    catalogImportRowFingerprint,
    validateRowAdjustments,
  } = loadTypeScriptModuleWithPrivateExports(
    "src/server/shop-admin/import-export-workbook.ts",
    [
      "applySupplierWorkbookRows",
      "catalogImportRowFingerprint",
      "validateRowAdjustments",
    ],
  );
  const parsed = {
    categories: [],
    confidence: 1,
    detectedFormat: {
      confidence: "high",
      ignoredSheets: [],
      isPartial: false,
      kind: "generic_product_import",
      label: "Supplier import",
      missingSheets: [],
      presentSheets: [],
    },
    detectedHeaderRow: 1,
    detectedMapping: {},
    digest: "digest",
    droppedRows: 0,
    fileDigest: "file",
    importMode: "supplier",
    mappingOverride: {},
    originalColumns: [],
    priceHistory: [],
    products: [
      {
        barcode: "",
        itemNumber: "CORRECT-ME",
        productName: "Correct barcode row",
        purchasePrice: 100,
        quantity: 1,
        retailPrice: 150,
        rowNumber: 2,
      },
      {
        barcode: "",
        itemNumber: "SKIP-ME",
        productName: "Skip barcode row",
        purchasePrice: 100,
        quantity: 1,
        retailPrice: 150,
        rowNumber: 3,
      },
    ],
    previewRows: [],
    previewRowsTruncated: false,
    rawPreviewColumns: [],
    rawPreviewRows: [],
    rawWorkbookContextRows: [],
    recognizedColumnSources: {},
    rowErrors: [
      {
        field: "barcode",
        message: "Barcode is required.",
        row: 2,
        sheet: "Products",
      },
      {
        field: "barcode",
        message: "Barcode is required.",
        row: 3,
        sheet: "Products",
      },
    ],
    rowWarnings: [],
    selectedProductSheet: "Products",
    sheetSummaries: [],
    suppliers: [],
    unmappedColumns: [],
    validRows: 2,
    workbookMetadata: {
      fileName: "fixture.xlsx",
      headerRow: 1,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      parsedRows: 2,
      previewRowsLimit: 50,
      previewRowsTruncated: false,
      selectedSheet: "Products",
      sheetNames: ["Products"],
      sizeBytes: 1,
      totalRows: 3,
    },
  };
  const adjustments = validateRowAdjustments(
    parsed,
    JSON.stringify([
      {
        barcode: "1234567890123",
        rowFingerprint: catalogImportRowFingerprint(parsed.products[0]),
        rowNumber: 2,
      },
      {
        rowFingerprint: catalogImportRowFingerprint(parsed.products[1]),
        rowNumber: 3,
        skip: true,
      },
    ]),
  );

  assert.equal(adjustments.valid, true);
  assert.equal(adjustments.adjustments.length, 2);

  const adjusted = applySupplierWorkbookRows(
    parsed,
    adjustments.adjustments,
    { categories: [], products: [], suppliers: [] },
  );

  assert.equal(adjusted.products.length, 1);
  assert.equal(adjusted.products[0].barcode, "1234567890123");
  assert.equal(adjusted.products[0].itemNumber, "CORRECT-ME");
  assert.equal(adjusted.rowErrors.length, 0);
});

test("TASK-090 supplier sync preview treats duplicate final barcodes as warning-only last-wins rows", () => {
  const { buildSupplierSyncPreview } = loadTypeScriptModuleWithPrivateExports(
    "src/server/shop-admin/import-export-workbook.ts",
    ["buildSupplierSyncPreview"],
  );
  const products = [
    {
      barcode: "0900000000001",
      itemNumber: "DUP-FIRST",
      productName: "Duplicate first",
      purchasePrice: 10,
      quantity: 1,
      retailPrice: 20,
      rowNumber: 2,
    },
    {
      barcode: "0900000000001",
      itemNumber: "DUP-LAST",
      productName: "Duplicate winner",
      purchasePrice: 11,
      quantity: 2,
      retailPrice: 22,
      rowNumber: 3,
    },
  ];
  const parsed = {
    categories: [],
    confidence: 1,
    detectedFormat: {
      confidence: "high",
      ignoredSheets: [],
      isPartial: false,
      kind: "generic_product_import",
      label: "Supplier import",
      missingSheets: [],
      presentSheets: [],
    },
    detectedHeaderRow: 1,
    detectedMapping: {},
    digest: "digest",
    droppedRows: 0,
    fileDigest: "file",
    importMode: "supplier",
    mappingOverride: {},
    originalColumns: [],
    priceHistory: [],
    products,
    previewRows: [],
    previewRowsTruncated: false,
    rawPreviewColumns: [],
    rawPreviewRows: [],
    rawWorkbookContextRows: [],
    recognizedColumnSources: {},
    rowErrors: [],
    rowWarnings: [],
    selectedProductSheet: "Products",
    sheetSummaries: [],
    suppliers: [],
    unmappedColumns: [],
    validRows: products.length,
    workbookMetadata: {
      fileName: "fixture.xlsx",
      headerRow: 1,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      parsedRows: products.length,
      previewRowsLimit: 50,
      previewRowsTruncated: false,
      selectedSheet: "Products",
      sheetNames: ["Products"],
      sizeBytes: 1,
      totalRows: 3,
    },
  };
  const rowWarnings = products.map((product) => ({
    code: "duplicate_product_barcode",
    field: "barcode",
    message:
      "Product barcode appears more than once in the workbook; the last occurrence is used.",
    row: product.rowNumber,
    sheet: "Products",
  }));

  const preview = buildSupplierSyncPreview({
    adjustedParsed: parsed,
    adjustments: [],
    boundPreviewDigest: "digest",
    readModel: { categories: [], products: [], suppliers: [] },
    rowErrors: [],
    rowWarnings,
    sourceParsed: parsed,
  });

  assert.equal(preview.canApply, true);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.warnings.length, 2);
  assert.equal(preview.newProducts.length, 1);
  assert.equal(preview.newProducts[0].barcode, "0900000000001");
  assert.equal(preview.newProducts[0].itemNumber, "DUP-LAST");
  assert.equal(preview.newProducts[0].productName, "Duplicate winner");
  assert.equal(preview.newProducts[0].quantity, 2);
  assert.equal(preview.newProducts[0].rowNumber, 3);
  assert.equal(preview.summary.nonSkippedRows, 1);
  assert.equal(preview.summary.errors, 0);
  assert.equal(preview.summary.warnings, 2);
});

test("TASK-090 supplier sync preview accepts Android secondProductName identity fallback", () => {
  const { buildSupplierSyncPreview } = loadTypeScriptModuleWithPrivateExports(
    "src/server/shop-admin/import-export-workbook.ts",
    ["buildSupplierSyncPreview"],
  );
  const { validateCatalogImportRows } = loadTypeScriptModule(
    "src/server/shop-admin/catalog-import-contract.ts",
  );
  const products = [
    {
      barcode: "0900000000002",
      itemNumber: "",
      productName: "",
      secondProductName: "Only secondary name",
      purchasePrice: 10,
      quantity: 1,
      retailPrice: 20,
      rowNumber: 2,
    },
  ];
  const parsed = {
    categories: [],
    confidence: 1,
    detectedFormat: {
      confidence: "high",
      ignoredSheets: [],
      isPartial: false,
      kind: "generic_product_import",
      label: "Supplier import",
      missingSheets: [],
      presentSheets: [],
    },
    detectedHeaderRow: 1,
    detectedMapping: {},
    digest: "digest",
    droppedRows: 0,
    fileDigest: "file",
    importMode: "supplier",
    mappingOverride: {},
    originalColumns: [],
    priceHistory: [],
    products,
    previewRows: [],
    previewRowsTruncated: false,
    rawPreviewColumns: [],
    rawPreviewRows: [],
    rawWorkbookContextRows: [],
    recognizedColumnSources: {},
    rowErrors: [],
    rowWarnings: [],
    selectedProductSheet: "Products",
    sheetSummaries: [],
    suppliers: [],
    unmappedColumns: [],
    validRows: products.length,
    workbookMetadata: {
      fileName: "fixture.xlsx",
      headerRow: 1,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      parsedRows: products.length,
      previewRowsLimit: 50,
      previewRowsTruncated: false,
      selectedSheet: "Products",
      sheetNames: ["Products"],
      sizeBytes: 1,
      totalRows: 2,
    },
  };
  const validation = validateCatalogImportRows(parsed, {
    categories: [],
    products: [],
    suppliers: [],
  });

  assert.equal(validation.rowErrors.length, 0);

  const preview = buildSupplierSyncPreview({
    adjustedParsed: parsed,
    adjustments: [],
    boundPreviewDigest: "digest",
    readModel: { categories: [], products: [], suppliers: [] },
    rowErrors: validation.rowErrors,
    rowWarnings: validation.rowWarnings,
    sourceParsed: parsed,
  });

  assert.equal(preview.canApply, true);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.newProducts.length, 1);
  assert.equal(preview.newProducts[0].productName, "Only secondary name");
  assert.equal(preview.newProducts[0].secondProductName, "Only secondary name");
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
