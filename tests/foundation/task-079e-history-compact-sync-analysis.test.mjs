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
test("TASK-079E governance is archived under canonical TASK-079", () => {
  const masterPlan = read("docs/MASTER-PLAN.md");
  const task = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079E-history-entry-compact-layout-no-horizontal-scroll-shared-sync-analysis.md",
  );
  const canonicalTask = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const evidence = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079E/README.md",
  );

  assertContains(masterPlan, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assertContains(masterPlan, "Avvio TASK-079E 2026-06-21");
  assertContains(masterPlan, "Riconciliazione governance TASK-079 2026-06-21");
  assertContains(canonicalTask, "079.5 Compact layout, no horizontal scroll, sync analysis");
  assertContains(task, "Non cambiare il contratto mobile");
  assertContains(task, "Rimuovere lo scroll orizzontale dal Detail desktop");
  assertContains(task, "Sync/Import Analysis");
  assertContains(evidence, "TASK-079E");
});

test("TASK-079E shared SyncAnalysisPanel is reused and stays client-bounded", () => {
  const panel = read("src/app/shop/_components/SyncAnalysisPanel.tsx");
  const modal = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );
  const importPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );

  assertContains(panel, "export function SyncAnalysisPanel");
  assertContains(panel, "buildHistoryDetailSyncAnalysisModel");
  assertContains(panel, "buildImportApplySyncAnalysisModel");
  assertContains(panel, "Not available");
  assertContains(panel, "Latest sync event");
  assertContains(panel, "Warnings / problems");
  assertContains(panel, "history_changed");
  assertContains(panel, "Open History Entry");
  assert.doesNotMatch(panel, /fetch\(|\.from\(|createClient|getShop/i);

  assertContains(modal, "buildHistoryDetailSyncAnalysisModel");
  assertContains(modal, "SyncAnalysisPanel");
  assertContains(modal, '{ icon: "sync", key: "analysis", label: "Sync analysis" }');
  assertContains(modal, "unresolvedProductRowCount");

  assertContains(importPanel, "buildImportApplySyncAnalysisModel");
  assertContains(importPanel, "SyncAnalysisPanel");
});

test("TASK-079E history detail table is compact and does not force horizontal scroll", () => {
  const modal = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assertContains(modal, "data-history-detail-rows-frame");
  assertContains(modal, "overflow-y-auto overflow-x-hidden");
  assertContains(modal, "table-fixed");
  assertContains(modal, "<colgroup>");
  assert.doesNotMatch(modal, /min-w-\[82rem\]/);
  assertContains(modal, "Recognized from file");
  assertContains(modal, "Import values");
  assertContains(modal, "Supplier Qty");
  assertContains(modal, "Purchase");
  assertContains(modal, "Counted Qty");
  assertContains(modal, "Sale Price");
  assertContains(modal, 'aria-label={`${translate("Counted Qty")} ${row.rowNumber}`}');
  assertContains(modal, 'aria-label={`${translate("Sale Price")} ${row.rowNumber}`}');
  assert.doesNotMatch(
    modal,
    /aria-label=\{`\$\{translate\("Purchase"\)\}/,
    "Purchase must remain read-only",
  );
});

test("TASK-079E history list uses compact mobile-like metric tiles", () => {
  const list = read("src/app/shop/_components/HistoryEntriesClientList.tsx");

  assertContains(list, "contain-intrinsic-size:140px");
  assertContains(list, "sm:grid-cols-3 xl:grid-cols-5");
  assertContains(list, "rounded-md px-2.5 py-1.5");
  assertContains(list, "bg-zinc-50 text-zinc-700");
  assertContains(list, 'label: "Items"');
  assertContains(list, 'label: "Total quantity"');
  assertContains(list, 'label: "Order"');
  assertContains(list, 'label: "Paid"');
  assertContains(list, 'label: "Missing"');
  assert.doesNotMatch(list, /label: "Sync"/);
  assert.doesNotMatch(list, /max-w-3xl gap-x-8 gap-y-1\.5 sm:grid-cols-2/);
});
