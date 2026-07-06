import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

// Legacy test name; canonical tracking is TASK-079.
test("TASK-079F governance is archived under canonical TASK-079", () => {
  const masterPlan = read("docs/MASTER-PLAN.md");
  const task = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079F-history-entry-row-state-colors-vertical-scroll-product-price-context.md",
  );
  const canonicalTask = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const evidence = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079F/README.md",
  );

  assertContains(masterPlan, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assertContains(masterPlan, "Avvio TASK-079F 2026-06-21");
  assertContains(masterPlan, "Riconciliazione governance TASK-079 2026-06-21");
  assertContains(canonicalTask, "079.6 Row colors, vertical scroll, product price context");
  assertContains(task, "Counted Qty >= Supplier Qty");
  assertContains(task, "vecchi prezzi solo se diversi");
  assertContains(evidence, "Complete row");
  assertContains(evidence, "Counted qty lower than supplier qty");
});

test("TASK-079F detail read model exposes bounded 200-row preview and product context", () => {
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const detailReadModel = read("src/server/shop-admin/detail-modal-read-model.ts");

  assertContains(historyReadModel, "const HISTORY_PREVIEW_ROW_LIMIT = 200");
  assertContains(historyReadModel, "| \"oldPurchasePrice\"");
  assertContains(historyReadModel, "| \"oldRetailPrice\"");
  assertContains(historyReadModel, "oldPurchasePrice: safeHistoryCell");
  assertContains(historyReadModel, "oldRetailPrice: safeHistoryCell");

  assertContains(detailReadModel, ").slice(0, 200)");
  assertContains(detailReadModel, 'productState: "active" | "archived" | "unresolved"');
  assertContains(detailReadModel, "oldPurchasePrice: string | null");
  assertContains(detailReadModel, "oldRetailPrice: string | null");
  assertContains(detailReadModel, "stockQuantity: string | null");
  assertContains(detailReadModel, "historyOrCatalogValue");
  assertContains(detailReadModel, "product.deletedAt ? \"archived\" : \"active\"");
});

test("TASK-079F detail table has row-state colors, vertical scroll and live autocomplete", () => {
  const modal = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assertContains(modal, "data-history-detail-rows-frame");
  assertContains(modal, "h-[min(64dvh,44rem)] min-h-80 overflow-y-auto overflow-x-hidden");
  assertContains(modal, "data-history-detail-row");
  assertContains(modal, "data-history-row-state={visualState}");
  assertContains(modal, 'return "border-emerald-200 bg-emerald-50/80 text-emerald-950"');
  assertContains(modal, 'return "border-amber-200 bg-amber-50/90 text-amber-950"');
  assertContains(modal, 'return "border-zinc-100 bg-white text-zinc-950"');
  assertContains(modal, "deriveCompleteFromCountedQuantity");
  assertContains(modal, "if (counted === null || counted <= 0)");
  assertContains(modal, "return counted >= supplierQuantity");
  assertContains(modal, 'return counted >= supplierQuantity ? "complete" : "partial";');
  assertContains(modal, "return draft.countedQuantity ?? editableCell(row.countedQuantity);");
  assertContains(modal, "return draft.salePrice ?? editableCell(row.salePrice);");
  assert.doesNotMatch(modal, /draft\.countedQuantity \|\| editableCell/);
  assert.doesNotMatch(modal, /draft\.salePrice \|\| editableCell/);
  assertContains(modal, "shouldShowOldPrice");
  assertContains(modal, "Row total");
  assertContains(modal, "paymentTotalFromRows");
  assert.doesNotMatch(modal, /aria-label=\{`\$\{translate\("Purchase"\)\}/);
  assert.doesNotMatch(modal, /min-w-\[82rem\]/);
});

test("TASK-079F history list missing metric colors label and value red only when positive", () => {
  const list = read("src/app/shop/_components/HistoryEntriesClientList.tsx");

  assertContains(list, "const isDanger = tone === \"danger\"");
  assertContains(list, "bg-rose-50 text-rose-700");
  assertContains(list, "text-rose-600");
  assertContains(list, "text-rose-700");
  assertContains(list, "tone={hasMissingRows ? \"danger\" : \"default\"}");
  assertContains(list, "hasMissingRows ? \"border-rose-100\" : \"border-zinc-200\"");
});

test("TASK-079F history list pagination and filters are URL-driven server-side", () => {
  const page = read("src/app/shop/history/page.tsx");
  const list = read("src/app/shop/_components/HistoryEntriesClientList.tsx");
  const readModel = read("src/server/shop-admin/history-read-model.ts");

  assertContains(page, "page?: string | string[]");
  assertContains(page, "pageSize?: string | string[]");
  assertContains(page, "q?: string | string[]");
  assertContains(page, "month?: string | string[]");
  assertContains(page, "status?: string | string[]");
  assertContains(page, "getShopHistoryListReadModel({");
  assertContains(page, "filters: {");
  assertContains(page, "page: selectedPage");
  assertContains(page, "pageSize: selectedPageSize");
  assertContains(page, "pagination={readModel.pagination}");
  assertContains(page, "selectedFilters={readModel.filters}");

  assertContains(readModel, "normalizeHistoryPage");
  assertContains(readModel, "normalizeHistoryPageSize");
  assertContains(readModel, "applyHistoryListFilters");
  assertContains(readModel, "hasActiveHistoryListFilters");
  assertContains(readModel, "page === 1");
  assertContains(readModel, "!hasActiveHistoryListFilters(filters)");
  assertContains(readModel, "loadShopScopedHistoryPresence");
  assertContains(readModel, "!shopScopedHistoryPresence.hasRows");
  assertContains(readModel, "isHistoryRangeNotSatisfiableError");
  assertContains(readModel, 'code?: unknown }).code === "PGRST103"');
  assertContains(readModel, "input.legacyOwnerUserId ? 0 : input.from");
  assertContains(readModel, ".slice(from, from + pageSize)");
  assertContains(readModel, "legacyOwnerSessionsResult = await legacyOwnerSessionsQuery.range(\n      0,\n      rangeTo,");
  assertContains(readModel, ".select(historyDiagnosticsSessionSelect, historyListSelectOptions(input.filters))");
  assertContains(readModel, ".select(historyListSessionSelect, historyListSelectOptions(input.filters))");
  assertContains(readModel, ".range(");
  assertContains(readModel, "pagination: {");
  assert.doesNotMatch(readModel, /\.limit\(HISTORY_LIGHT_LIST_LIMIT\)/);

  assertContains(list, "Search, status, month and pagination run server-side");
  assertContains(list, "HistoryPagination");
  assertContains(list, "action=\"/shop/history\"");
  assertContains(list, "method=\"get\"");
  assertContains(list, "name=\"pageSize\"");
  assertContains(list, "data-history-pagination");
  assertContains(list, "buildHistoryDetailHref(entryId, {");
});
