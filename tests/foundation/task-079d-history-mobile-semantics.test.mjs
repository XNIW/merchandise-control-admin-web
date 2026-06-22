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
test("TASK-079D governance is archived under canonical TASK-079", () => {
  const masterPlan = read("docs/MASTER-PLAN.md");
  const task = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079D-history-entry-review-fix-mobile-semantics-counted-quantity-sale-price-ios-ui.md",
  );
  const canonicalTask = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const evidence = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079D/README.md",
  );

  assertContains(masterPlan, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assertContains(masterPlan, "Avvio TASK-079D 2026-06-21");
  assertContains(masterPlan, "Riconciliazione governance TASK-079 2026-06-21");
  assertContains(canonicalTask, "079.4 Mobile semantics");
  assertContains(task, "Source Excel quantity");
  assertContains(task, "Counted/user quantity");
  assertContains(task, "User sale/retail price");
  assertContains(task, "Complete row rule");
  assertContains(evidence, "realQuantity ->");
  assertContains(evidence, "RetailPrice ->");
});

test("TASK-079D supplier import emits mobile generated columns and missing overlay", () => {
  const contract = read(
    "src/server/shop-admin/supplier-import-history-entry-contract.ts",
  );
  const supplierImportTest = read(
    "tests/foundation/task-079b-supplier-import-canonical-history.test.mjs",
  );

  assertContains(contract, '"oldPurchasePrice"');
  assertContains(contract, '"oldRetailPrice"');
  assertContains(contract, '"realQuantity"');
  assertContains(contract, '"RetailPrice"');
  assertContains(contract, '"complete"');
  assertContains(contract, "complete: data.map(() => false)");
  assertContains(supplierImportTest, '"realQuantity"');
  assertContains(supplierImportTest, '"RetailPrice"');
  assertContains(supplierImportTest, "payload.sessionOverlay.complete.some(Boolean), false");
});

test("TASK-079D generated save writes generated fields, not source fields", () => {
  const mutations = read("src/server/shop-admin/history-mutations.ts");
  const route = read("src/app/shop/history/detail/route.ts");

  assertContains(mutations, "ensureHistoryGeneratedColumns");
  assertContains(mutations, 'ensureColumn("realQuantity")');
  assertContains(mutations, 'ensureColumn("RetailPrice")');
  assertContains(mutations, 'ensureColumn("complete")');
  assertContains(mutations, "data[rowIndex][columns.countedQuantity] = nextCountedQuantity.value");
  assertContains(mutations, "data[rowIndex][columns.salePrice] = nextSalePrice.value");
  assertContains(mutations, "data[rowIndex][columns.complete] = completeCellValue");
  assertContains(mutations, "editable[rowIndex][0] = nextCountedQuantity.value");
  assertContains(mutations, "editable[rowIndex][1] = nextSalePrice.value");
  assertContains(mutations, "complete[rowIndex] = patch.complete");
  assert.doesNotMatch(
    mutations,
    /data\[rowIndex\]\[columns\.quantity\]\s*=/,
    "generated save must not overwrite source quantity",
  );
  assert.doesNotMatch(
    mutations,
    /data\[rowIndex\]\[columns\.retailPrice\]\s*=/,
    "generated save must not overwrite source retailPrice",
  );
  assertContains(route, "countedQuantity: optionalString(record.countedQuantity)");
  assertContains(route, "salePrice: optionalString(record.salePrice)");
  assertContains(route, "complete: optionalBoolean(record.complete)");
});

test("TASK-079D UI exposes mobile business fields and status from complete", () => {
  const modal = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );
  const list = read("src/app/shop/_components/HistoryEntriesClientList.tsx");
  const readModel = read("src/server/shop-admin/history-read-model.ts");

  assertContains(modal, "Supplier Qty");
  assertContains(modal, "Counted Qty");
  assertContains(modal, "Sale Price");
  assertContains(modal, "Recognized from file");
  assertContains(modal, "Import values");
  assertContains(modal, "row.completion === \"Complete\"");
  assert.doesNotMatch(
    modal,
    /row\.productId \|\| row\.completion === "Complete"/,
    "product match must not mark a row complete",
  );
  assertContains(list, 'label: "Items"');
  assertContains(list, 'label: "Total quantity"');
  assertContains(list, 'label: "Order"');
  assertContains(list, 'label: "Paid"');
  assertContains(list, 'label: "Missing"');
  assert.doesNotMatch(
    list,
    /label: "Sync"/,
    "sync must not be a primary mobile metric chip",
  );
  assertContains(readModel, "historyBusinessMetrics");
  assertContains(readModel, "historyPreviewColumnValue(row, columns.countedQuantity)");
  assertContains(readModel, "historyPreviewColumnValue(row, columns.salePrice)");
});
