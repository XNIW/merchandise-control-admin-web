import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function assertPathExists(relativePath) {
  assert.equal(
    existsSync(join(root, relativePath)),
    true,
    `${relativePath} must exist`,
  );
}

function functionBody(source, start, end) {
  const match = source.match(new RegExp(`${start}[\\s\\S]*?${end}`));

  assert.ok(match, `${start} body must be present`);
  return match[0];
}

test("TASK-079 is the only current root task for history and catalog pagination", () => {
  const rootTaskFiles = readdirSync(join(root, "docs/TASKS"))
    .filter((file) => /^TASK-(079|080)/.test(file))
    .sort();
  const masterPlan = read("docs/MASTER-PLAN.md");
  const currentBlockStart = masterPlan.indexOf("- Stato TASK-079:");
  const currentBlockEnd = masterPlan.indexOf(
    "- Branch previsto:",
    currentBlockStart,
  );
  const currentBlock = masterPlan.slice(currentBlockStart, currentBlockEnd);
  const canonicalTask = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const evidence = read("docs/TASKS/EVIDENCE/TASK-079/README.md");

  assert.deepEqual(rootTaskFiles, [
    "TASK-079-history-entry-catalog-pagination-unified.md",
  ]);
  assertContains(currentBlock, "Stato TASK-079: `DONE_RECONCILED`");
  assertContains(currentBlock, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assert.match(
    currentBlock,
    /File task corrente: `(NESSUNO|docs\/TASKS\/TASK-084-admin-web-workers-dev-staging-auth-logout-win7pos-public-connection\.md)`/,
  );
  assert.match(
    currentBlock,
    /Evidence task corrente: `(NESSUNO|docs\/TASKS\/EVIDENCE\/TASK-084\/README\.md)`/,
  );
  assert.match(
    currentBlock,
    /Task attivo: `(NESSUNO|TASK-084 - Admin Web workers\.dev staging, auth\/logout fixes, and Win7POS public connection)`/,
  );
  assert.doesNotMatch(currentBlock, /TASK-079[B-F]|TASK-080/);
  assertContains(canonicalTask, "079.1 History Entry read-only mobile parity");
  assertContains(canonicalTask, "079.10 Final QA and review");
  assertContains(evidence, "ex `TASK-079B`, `TASK-079C`, `TASK-079D`");

  for (const legacyFile of [
    "TASK-079-history-entry-read-only-mobile-parity.md",
    "TASK-079B-supplier-import-canonical-history-mobile-sync.md",
    "TASK-079C-history-entry-ux-detail-performance-editable-generated-screen.md",
    "TASK-079D-history-entry-review-fix-mobile-semantics-counted-quantity-sale-price-ios-ui.md",
    "TASK-079E-history-entry-compact-layout-no-horizontal-scroll-shared-sync-analysis.md",
    "TASK-079F-history-entry-row-state-colors-vertical-scroll-product-price-context.md",
    "TASK-080-categories-suppliers-pagination-search-ui-polish.md",
  ]) {
    assertPathExists(`docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/${legacyFile}`);
  }

  for (const legacyEvidence of [
    "TASK-079B",
    "TASK-079C",
    "TASK-079D",
    "TASK-079E",
    "TASK-079F",
    "TASK-080",
  ]) {
    assertPathExists(`docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/${legacyEvidence}/README.md`);
  }
});

test("TASK-079 history pagination keeps out-of-range and filtered pages readable", () => {
  const page = read("src/app/shop/history/page.tsx");
  const list = read("src/app/shop/_components/HistoryEntriesClientList.tsx");
  const readModel = read("src/server/shop-admin/history-read-model.ts");

  assertContains(page, "page?: string | string[]");
  assertContains(page, "pageSize?: string | string[]");
  assertContains(page, "q?: string | string[]");
  assertContains(page, "month?: string | string[]");
  assertContains(page, "status?: string | string[]");
  assertContains(page, "page: selectedPage");
  assertContains(page, "pageSize: selectedPageSize");
  assertContains(readModel, "hasActiveHistoryListFilters");
  assertContains(readModel, "isHistoryActiveIssuesAlias");
  assertContains(readModel, 'value === "active_issues" || value === "active_with_issues"');
  assertContains(readModel, "loadShopScopedHistoryPresence");
  assertContains(readModel, 'table: "shared_sheet_sessions"');
  assertContains(readModel, "isHistoryRangeNotSatisfiableError");
  assertContains(readModel, 'code?: unknown }).code === "PGRST103"');
  assertContains(readModel, "input.legacyOwnerUserId ? 0 : input.from");
  assertContains(readModel, ".slice(from, from + pageSize)");
  assertContains(readModel, "legacyDiagnosticsResult = await legacyDiagnosticsQuery.range(\n    0,\n    input.to,");
  assertContains(readModel, "Boolean(filters.month || filters.query || filters.status !== \"active_issues\")");
  assertContains(readModel, ".select(historyListSessionSelect, { count: \"exact\" })");
  assertContains(readModel, ".range(");
  assertContains(readModel, "page === 1");
  assertContains(readModel, "!hasActiveHistoryListFilters(filters)");
  assertContains(readModel, "!shopScopedHistoryPresence.hasRows");
  assert.doesNotMatch(
    readModel,
    /diagnosticsResult\.totalCount === 0 &&\s*diagnosticsResult\.diagnostics\.length === 0 &&\s*sessionResult\.sessions\.length === 0/,
    "unmapped must not depend on current page rows or filtered totals",
  );
  assertContains(list, "Search, status, month and pagination run server-side");
  assertContains(list, "HistoryPagination");
  assertContains(list, "href={buildHistoryHref({\n                requestedShopId,\n              })}");
});

test("TASK-079 row colors treat counted zero as neutral and positive shortage as amber", () => {
  const modal = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assertContains(modal, "deriveCompleteFromCountedQuantity");
  assertContains(modal, "if (counted === null || counted <= 0)");
  assertContains(modal, "return false;");
  assertContains(modal, 'return counted >= supplierQuantity ? "complete" : "partial";');
  assertContains(modal, 'return "border-emerald-200 bg-emerald-50/80 text-emerald-950"');
  assertContains(modal, 'return "border-amber-200 bg-amber-50/90 text-amber-950"');
  assertContains(modal, 'return "border-zinc-100 bg-white text-zinc-950"');
  assertContains(modal, "data-history-row-state={visualState}");
});

test("TASK-079 catalog pagination remains server-side while full options stay separate", () => {
  const readModel = read("src/server/shop-admin/inventory-read-model.ts");
  const categoriesPage = read("src/app/shop/categories/page.tsx");
  const suppliersPage = read("src/app/shop/suppliers/page.tsx");
  const productsPage = read("src/app/shop/products/page.tsx");
  const importPanel = read("src/app/shop/_components/ImportExportActionPanel.tsx");
  const entityPageBody = functionBody(
    readModel,
    "async function getShopCatalogEntityPageReadModel",
    "export async function getShopCategoriesPageReadModel",
  );
  const fetchBody = functionBody(
    readModel,
    "async function fetchCatalogEntityRows",
    "async function getShopCatalogEntityPageReadModel",
  );

  assertContains(readModel, "ShopCatalogEntityPageReadModel");
  assertContains(fetchBody, "query = query.ilike(\"name\", `%${searchQuery}%`)");
  assertContains(fetchBody, ".range(input.from, input.to)");
  assertContains(entityPageBody, "loadCatalogEntityActiveProductCounts");
  assertContains(categoriesPage, "getShopCategoriesPageReadModel({");
  assertContains(categoriesPage, "getShopCatalogOptionsReadModel({ requestedShopId })");
  assertContains(categoriesPage, "categoryOptions = mapCategoryOptions(catalogOptionsReadModel.categories)");
  assertContains(suppliersPage, "getShopSuppliersPageReadModel({");
  assertContains(suppliersPage, "getShopCatalogOptionsReadModel({ requestedShopId })");
  assertContains(suppliersPage, "supplierOptions = mapSupplierOptions(catalogOptionsReadModel.suppliers)");
  assertContains(productsPage, "getShopCatalogOptionsReadModel");
  assertContains(importPanel, "Import supplier");
  assert.doesNotMatch(categoriesPage, /getShopInventoryReadModel\(/);
  assert.doesNotMatch(suppliersPage, /getShopInventoryReadModel\(/);
});
