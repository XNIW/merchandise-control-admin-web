import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-015 import/export readiness declares Excel workbook contract and safety limits", () => {
  const modulePath = "src/server/shop-admin/import-export-readiness.ts";
  const workbookPath = "src/server/shop-admin/import-export-workbook.ts";
  const packageJson = JSON.parse(readProjectFile("package.json"));

  assert.equal(existsSync(join(root, modulePath)), true, `${modulePath} is missing`);
  assert.equal(existsSync(join(root, workbookPath)), true, `${workbookPath} is missing`);
  assert.equal(packageJson.dependencies["read-excel-file"], "^9.0.10");
  assert.equal(packageJson.dependencies["write-excel-file"], "^4.0.7");

  const moduleSource = readProjectFile(modulePath);
  const workbookSource = readProjectFile(workbookPath);

  assert.match(moduleSource, /import "server-only"/);
  assert.match(workbookSource, /import "server-only"/);
  assert.match(workbookSource, /read-excel-file/);
  assert.match(workbookSource, /write-excel-file/);
  assert.match(moduleSource, /EXCEL_WORKBOOK_SHEETS/);
  assert.match(moduleSource, /Products/);
  assert.match(moduleSource, /Suppliers/);
  assert.match(moduleSource, /Categories/);
  assert.match(moduleSource, /PriceHistory/);
  assert.match(moduleSource, /MAX_IMPORT_ROWS/);
  assert.match(moduleSource, /MAX_IMPORT_BYTES/);
  assert.match(moduleSource, /FORMULA_INJECTION_PREFIXES/);
  assert.match(moduleSource, /sanitizeSpreadsheetCell/);
  assert.match(moduleSource, /getImportExportReadiness/);
  assert.match(workbookSource, /parseCatalogWorkbookPreview/);
  assert.match(workbookSource, /applyCatalogWorkbookImport/);
  assert.match(workbookSource, /buildCatalogWorkbookExport/);
  assert.match(workbookSource, /buildCatalogImportTemplate/);
  assert.match(workbookSource, /previewDigest/);
  assert.match(workbookSource, /MAX_IMPORT_ROWS/);
  assert.match(workbookSource, /MAX_IMPORT_BYTES/);
  assert.match(workbookSource, /sanitizeSpreadsheetCell/);
  assert.match(workbookSource, /confirmApply/);
  assert.doesNotMatch(`${moduleSource}\n${workbookSource}`, /credential_hash|service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("TASK-015 import/export routes implement preview, confirmed apply, export and template", () => {
  const page = readProjectFile("src/app/shop/import-export/page.tsx");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const previewRoute = readProjectFile("src/app/shop/import-export/preview/route.ts");
  const applyRoute = readProjectFile("src/app/shop/import-export/apply/route.ts");
  const exportRoute = readProjectFile("src/app/shop/import-export/export/route.ts");
  const templateRoute = readProjectFile("src/app/shop/import-export/template/route.ts");
  const actionPanel = readProjectFile("src/app/shop/_components/ImportExportActionPanel.tsx");

  assert.match(page, /searchParams/);
  assert.match(page, /getShopSectionForRequest\(\s*"importExport"/);
  assert.match(page, /ImportExportActionPanel/);
  assert.doesNotMatch(page, /shopSections\.importExport/);
  assert.match(sectionData, /buildImportExportSection/);
  assert.match(sectionData, /getImportExportReadiness/);
  assert.match(sectionData, /Preview before apply/);
  assert.doesNotMatch(
    sectionData,
    /blocked_schema|template_contract_only|available_as_contract/,
  );

  for (const route of [previewRoute, applyRoute, exportRoute, templateRoute]) {
    assert.match(route, /export const dynamic = "force-dynamic"/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|service_role|credential_hash/i);
  }

  assert.match(previewRoute, /parseCatalogWorkbookPreview/);
  assert.doesNotMatch(previewRoute, /applyCatalogWorkbookImport/);
  assert.match(applyRoute, /applyCatalogWorkbookImport/);
  assert.match(applyRoute, /confirmApply/);
  assert.match(applyRoute, /previewDigest/);
  assert.match(exportRoute, /buildCatalogWorkbookExport/);
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(templateRoute, /buildCatalogImportTemplate/);
  assert.match(actionPanel, /encType="multipart\/form-data"/);
  assert.match(actionPanel, /Preview workbook/);
  assert.match(actionPanel, /Apply confirmed import/);
  assert.match(actionPanel, /Download export/);
  assert.match(actionPanel, /Download template/);
  assert.doesNotMatch(actionPanel, /coming soon|placeholder/i);
});
