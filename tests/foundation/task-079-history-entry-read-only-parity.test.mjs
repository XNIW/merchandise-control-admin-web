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

test("TASK-079 history session presentation centralizes title and primary date", () => {
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const historyList = read(
    "src/app/shop/_components/HistoryEntriesClientList.tsx",
  );

  assertContains(historyReadModel, "export function buildHistorySessionDisplayTitle");
  assertContains(historyReadModel, "export function resolveHistorySessionEntryDate");
  assertContains(historyReadModel, "Manual inventory -");
  assertContains(historyReadModel, "compactRemoteId(remoteId)");
  assertContains(historyReadModel, "displayName.toLowerCase() !== remoteId.toLowerCase()");
  assertContains(historyReadModel, "resolveHistorySessionEntryDate(row)");
  assertContains(historyReadModel, 'displayTitle,');
  assertContains(historyReadModel, 'entryDate,');
  assertContains(sectionData, "entryName: session.displayTitle");
  assertContains(sectionData, "entryDate: formatDateTime(session.entryDate)");
  assertContains(sectionData, '{ key: "entryDate", label: "Entry date" }');
  assert.match(
    historyList,
    /rowString\(rawRow, "entryDate"\)[\s\S]*rowString\(rawRow, "updated"\)/,
    "History list must prefer entryDate before updated for month grouping",
  );
});

test("TASK-079 history list uses diagnostics and honest sync state fallbacks", () => {
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const historyList = read(
    "src/app/shop/_components/HistoryEntriesClientList.tsx",
  );

  assertContains(historyReadModel, "loadHistoryListDiagnostics");
  assertContains(historyReadModel, ".from(\"shared_sheet_session_diagnostics\")");
  assertContains(historyReadModel, ".order(\"timestamp\"");
  assertContains(historyReadModel, "mapSessionDiagnostics(session, syncEvents)");
  assertContains(historyReadModel, "fallbackToSessions");
  assertContains(historyReadModel, "diagnosticsAvailable: true");
  assertContains(historyReadModel, "diagnosticsAvailable: false");
  assertContains(historyReadModel, "export function deriveHistorySessionSyncState");
  assertContains(historyReadModel, 'syncState: "not_available" as const');
  assertContains(historyReadModel, 'syncStateLabel: "Sync state not available"');
  assertContains(sectionData, "historyDiagnosticsValue");
  assertContains(sectionData, '"Diagnostics not available"');
  assertContains(sectionData, "syncState: session.syncStateLabel");
  assertContains(historyList, 'label: "Items"');
  assertContains(historyList, 'label: "Total quantity"');
  assertContains(historyList, 'label: "Order"');
  assertContains(historyList, 'label: "Paid"');
  assertContains(historyList, "historyMetricChips");
  assert.doesNotMatch(historyList, /label: "Sync"/);
  assert.doesNotMatch(historyReadModel, /exported_at|synced_at/);
  assert.doesNotMatch(sectionData, /exported_at|synced_at/);
});

test("TASK-079 history detail preserves source quantity and generated editable parity", () => {
  const modalReadModel = read("src/server/shop-admin/detail-modal-read-model.ts");
  const controller = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );
  const historySectionData = read("src/server/shop-admin/shop-section-data.ts");
  const historyRoute = read("src/app/shop/history/detail/route.ts");

  assertContains(modalReadModel, "export function mapHistoryDetailModalRow");
  assertContains(modalReadModel, "usableHistoryCell(row.purchasePrice)");
  assertContains(modalReadModel, "usableHistoryCell(row.sourceQuantity)");
  assertContains(modalReadModel, "usableHistoryCell(row.countedQuantity)");
  assertContains(modalReadModel, "usableHistoryCell(row.salePrice)");
  assertContains(modalReadModel, "purchasePrice: usableHistoryCell(row.purchasePrice)");
  assertContains(modalReadModel, "sourceQuantity: usableHistoryCell(row.sourceQuantity)");
  assertContains(modalReadModel, "countedQuantity: usableHistoryCell(row.countedQuantity)");
  assertContains(modalReadModel, "salePrice: usableHistoryCell(row.salePrice)");
  assertContains(controller, "Entry date");
  assertContains(controller, "Total quantity");
  assertContains(controller, "Redacted diagnostics");
  assertContains(controller, "detail?.sessionAnalysis?.entryDate");
  assertContains(controller, "detail?.sessionAnalysis?.totalQuantity");
  assertContains(historySectionData, '{ key: "sourceQuantity", label: "Supplier Qty" }');
  assertContains(historySectionData, '{ key: "purchasePrice", label: "Purchase" }');
  assertContains(historySectionData, '{ key: "countedQuantity", label: "Counted Qty" }');
  assertContains(historySectionData, '{ key: "salePrice", label: "Sale Price" }');
  assertContains(historyRoute, '"Cache-Control": "no-store"');
  assertContains(controller, 'aria-label={`${translate("Counted Qty")} ${row.rowNumber}`}');
  assertContains(controller, 'aria-label={`${translate("Sale Price")} ${row.rowNumber}`}');
  assert.doesNotMatch(
    controller,
    /aria-label=\{`\$\{translate\("Purchase"\)\}/,
    "Purchase price must remain read-only when TASK-079C enables quantity and retail edits",
  );
  assertContains(historyRoute, "export async function PATCH");
  assert.doesNotMatch(historyRoute, /POST|PUT|DELETE|\.insert|\.upsert/);
});
