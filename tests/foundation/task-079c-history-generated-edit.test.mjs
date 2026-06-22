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
test("TASK-079C governance is archived under canonical TASK-079", () => {
  const masterPlan = read("docs/MASTER-PLAN.md");
  const task = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079C-history-entry-ux-detail-performance-editable-generated-screen.md",
  );
  const canonicalTask = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const evidence = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079C/README.md",
  );
  const canonicalEvidence = read("docs/TASKS/EVIDENCE/TASK-079/README.md");

  assertContains(masterPlan, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assertContains(masterPlan, "Riconciliazione governance TASK-079 2026-06-21");
  assertContains(masterPlan, "Avvio TASK-079C 2026-06-21");
  assertContains(masterPlan, "Handoff TASK-079C 2026-06-21");
  assertContains(masterPlan, "Review blocker TASK-079C 2026-06-21");
  assertContains(canonicalTask, "079.3 Editable generated Detail");
  assertContains(canonicalEvidence, "079.3 Editable generated Detail");
  assertContains(task, "Stato: `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`");
  assertContains(task, "Fase attuale: `REVIEW`");
  assertContains(task, "Nessuna nuova dependency.");
  assertContains(evidence, "Verdict operativo: `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`");
});

test("TASK-079C detail performance uses bounded batch product resolving", () => {
  const inventoryReadModel = read(
    "src/server/shop-admin/inventory-read-model.ts",
  );
  const detailModalReadModel = read(
    "src/server/shop-admin/detail-modal-read-model.ts",
  );
  const task078Guardrail = read(
    "tests/foundation/task-078-product-history-detail-modals.test.mjs",
  );

  assertContains(inventoryReadModel, "getShopInventoryProductsByCodes");
  assertContains(inventoryReadModel, "ProductCodeLookupQuery");
  assertContains(inventoryReadModel, "fetchProductsByCodeColumn");
  assertContains(inventoryReadModel, 'column: "barcode"');
  assertContains(inventoryReadModel, 'column: "item_number"');
  assertContains(inventoryReadModel, ".in(input.column, input.codes)");
  assertContains(detailModalReadModel, "getShopInventoryProductsByCodes");
  assertContains(detailModalReadModel, ".slice(0, 200)");
  assert.doesNotMatch(detailModalReadModel, /resolveLinkedProduct/);
  assert.doesNotMatch(detailModalReadModel, /getShopInventoryProductsPage/);
  assertContains(task078Guardrail, "getShopInventoryProductsByCodes");
  assert.doesNotMatch(task078Guardrail, /assertContains\(modalReadModel, "getShopInventoryProductsPage"\)/);
});

test("TASK-079C generated row edit route remains server-side while TASK-079D owns semantics", () => {
  const historyMutations = read("src/server/shop-admin/history-mutations.ts");
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const detailRoute = read("src/app/shop/history/detail/route.ts");
  const controller = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assertContains(historyReadModel, ".replace(/([a-z0-9])([A-Z])/g");
  assertContains(historyReadModel, "source row");
  assertContains(historyReadModel, "product name");
  assertContains(historyReadModel, "purchase price");
  assertContains(historyReadModel, "retail price");
  assertContains(historyMutations, "updateHistoryEntryGeneratedRows");
  assertContains(historyMutations, "parseLocalizedNumberText");
  assertContains(historyMutations, "ensureHistoryGeneratedColumns");
  assertContains(historyMutations, "realQuantity");
  assertContains(historyMutations, "RetailPrice");
  assertContains(historyMutations, "complete");
  assertContains(historyMutations, "existingResult.data.payload_version !== SESSION_PAYLOAD_VERSION");
  assertContains(historyMutations, "editable[rowIndex][0] = nextCountedQuantity.value");
  assertContains(historyMutations, "editable[rowIndex][1] = nextSalePrice.value");
  assertContains(historyMutations, "payload_version: SESSION_PAYLOAD_VERSION");
  assertContains(historyMutations, 'eventType: "history_changed"');
  assertContains(historyMutations, 'operation_detail: "generated_row_edit"');
  assertContains(historyMutations, 'source_workflow: "history_detail_generated_screen"');
  assertContains(historyMutations, "expectedUpdatedAt && expectedUpdatedAt !== existingResult.data.updated_at");
  assertContains(historyMutations, "Promise.all([");
  assertContains(detailRoute, "export async function PATCH");
  assertContains(detailRoute, "updateHistoryEntryGeneratedRows");
  assertContains(detailRoute, "countedQuantity: optionalString(record.countedQuantity)");
  assertContains(detailRoute, "salePrice: optionalString(record.salePrice)");
  assertContains(detailRoute, "complete: optionalBoolean(record.complete)");
  assertContains(controller, "canEditRows");
  assertContains(controller, "Save changes");
  assertContains(controller, "inputMode=\"decimal\"");
  assertContains(controller, "expectedUpdatedAt: detail.sessionAnalysis?.updatedAt");
  assertContains(controller, 'method: "PATCH"');
});

test("TASK-079C history list removes technical fact strings from primary card", () => {
  const historyList = read(
    "src/app/shop/_components/HistoryEntriesClientList.tsx",
  );
  const dictionaries = read("src/i18n/dictionaries.ts");

  assertContains(historyList, "historyMetricChips");
  assertContains(historyList, "Selected month");
  assertContains(historyList, "MobileMetricLine");
  assertContains(historyList, "metricValue(metrics, \"Total quantity\")");
  assertContains(historyList, "metrics.diagnostic");
  assert.doesNotMatch(historyList, /function compactFacts/);
  assertContains(dictionaries, '"Selected month"');
  assertContains(dictionaries, '"Save changes"');
  assertContains(dictionaries, '"Save failed"');
});
