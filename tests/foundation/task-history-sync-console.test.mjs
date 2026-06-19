import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("Mobile History read model analyzes sessions, overlays, and related events server-side", () => {
  const readModelPath = "src/server/shop-admin/history-read-model.ts";

  assert.equal(existsSync(join(root, readModelPath)), true);

  const readModel = readProjectFile(readModelPath);

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /export type ShopHistorySessionAnalysis/);
  assert.match(readModel, /sourceScope: ShopHistorySourceScope/);
  assert.match(readModel, /overlayStatus: ShopHistoryOverlayStatus/);
  assert.match(readModel, /const SESSION_PAYLOAD_VERSION = 2/);
  assert.match(readModel, /const SESSION_OVERLAY_SCHEMA = 1/);
  assert.match(readModel, /const SESSION_OVERLAY_MAX_BYTES = 512 \* 1024/);
  assert.match(readModel, /export function analyzeSessionOverlay/);
  assert.match(readModel, /export function summarizeSessionDataGrid/);
  assert.match(readModel, /export function normalizeSessionIdsFromSyncEvent/);
  assert.match(readModel, /export function mapRelatedHistorySyncEvents/);
  assert.match(readModel, /export function safeHistoryTablePreview/);
  assert.match(readModel, /export function redactShopAdminJson/);
  assert.match(readModel, /"token"/);
  assert.match(readModel, /"password"/);
  assert.match(readModel, /"email"/);
  assert.match(readModel, /"path"/);
  assert.match(readModel, /rawJsonPreview = stringifyRedactedJson/);
  assert.match(readModel, /overlayStatus\?: ShopHistoryOverlayStatus/);
  assert.match(readModel, /const canUseOverlay = overlayStatus === "ok"/);
  assert.match(readModel, /Overlay unavailable/);
  assert.match(readModel, /export function safeJsonByteSize/);
  assert.match(readModel, /history_session_ids/);
  assert.match(readModel, /historySessionIds/);
  assert.match(readModel, /session_ids/);
  assert.match(readModel, /sessionIds/);
  assert.match(readModel, /batch_id,client_event_id/);
  assert.match(readModel, /clientEventId: row\.client_event_id/);
  assert.match(readModel, /mapSessionDiagnostics/);
  assert.match(readModel, /shared_sheet_session_diagnostics/);
  assert.match(readModel, /data_rows,item_rows,column_count/);
  assert.match(readModel, /payload_version,data,session_overlay,is_manual_entry/);
  assert.match(readModel, /grid\.slice\(1\)\.filter/);
  assert.match(readModel, /complete\.slice\(1\)\.filter/);
  assert.match(readModel, /dataSummary\.itemRowCount - completeCount/);
  assert.match(readModel, /sourceScope: "shop_scoped"/);
  assert.match(readModel, /sourceScope: "legacy_owner_bridge"/);
  assert.match(readModel, /\.eq\("domain", "history"\)/);
  assert.match(readModel, /\.eq\("mapping_state", "mapped"\)/);
  assert.match(readModel, /\.neq\("mapping_state", "mapped"\)/);
  assert.match(readModel, /\.eq\("owner_user_id", legacyOwnerUserId\)/);
  assert.match(readModel, /\.limit\(1\)/);
  assert.doesNotMatch(readModel, /\.from\("audit_logs"\)/);
  assert.doesNotMatch(readModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);

  const listReadModel = readModel.slice(
    readModel.indexOf("export async function getShopHistoryReadModel"),
    readModel.indexOf("export async function getShopHistoryDetailReadModel"),
  );

  assert.match(listReadModel, /\.from\("shared_sheet_session_diagnostics"\)/);
  assert.doesNotMatch(listReadModel, /\.from\("shared_sheet_sessions"\)/);
  assert.doesNotMatch(listReadModel, /data,session_overlay/);
});

test("Mobile History does not treat invalid overlays as trusted completion state", () => {
  const readModel = readProjectFile("src/server/shop-admin/history-read-model.ts");

  assert.match(
    readModel,
    /completeCount: 0[\s\S]*completeRows: 0[\s\S]*editableRows: 0[\s\S]*overlayStatus: "invalid_shape"/,
  );
  assert.match(
    readModel,
    /completeCount: 0[\s\S]*completeRows: 0[\s\S]*editableRows: 0[\s\S]*overlayStatus: "schema_unsupported"/,
  );
  assert.match(
    readModel,
    /completeCount: 0[\s\S]*completeRows: 0[\s\S]*editableRows: 0[\s\S]*overlayStatus: "too_large"/,
  );
});

test("History summary counts guard unsupported tables and keep overview renderable", () => {
  const readModel = readProjectFile("src/server/shop-admin/history-read-model.ts");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const overviewPage = readProjectFile("src/app/shop/overview/page.tsx");
  const dashboardSection =
    sectionData.match(
      /export function buildShopDashboardSection[\s\S]*?(?=\nexport function buildMembersSection)/,
    )?.[0] ?? "";
  const countHistoryRows =
    readModel.match(
      /async function countHistoryRows[\s\S]*?(?=\nasync function loadHistorySummary)/,
    )?.[0] ?? "";
  const loadHistorySummary =
    readModel.match(
      /async function loadHistorySummary[\s\S]*?(?=\nasync function resolveHistorySourceState)/,
    )?.[0] ?? "";

  for (const required of [
    "type SupportedHistoryCountTable",
    "const SUPPORTED_HISTORY_TOTAL_TABLES",
    "\"shared_sheet_session_diagnostics\"",
    "\"sync_events\"",
    "function isSupportedHistoryCountTable",
    "function isHistoryCountTable",
    "function historyCountUnavailableError",
    "history_read_unavailable",
  ]) {
    assert.match(
      readModel,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `history read model must keep ${required}`,
    );
  }

  for (const required of [
    "if (!isSupportedHistoryCountTable(input.table))",
    "historyCountUnavailableError(input.table, \"unsupported_table\")",
    "input.supabase.from.bind(input.supabase)",
    "historyCountUnavailableError(input.table, \"table_builder_failed\")",
    "if (!isHistoryCountTable(table))",
    "historyCountUnavailableError(input.table, \"table_builder_missing\")",
    "count: 0",
    "table.select(\"*\"",
    "count: \"exact\"",
    "head: true",
  ]) {
    assert.match(
      countHistoryRows,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `countHistoryRows must guard and preserve valid count path: ${required}`,
    );
  }

  assert.match(loadHistorySummary, /table: "sync_events"/);
  assert.match(loadHistorySummary, /table: "shared_sheet_session_diagnostics"/);
  assert.match(readModel, /status: "error"[\s\S]*Mobile history totals could not be loaded through RLS\./);
  assert.match(readModel, /summary: emptyRows\.summary/);

  assert.match(overviewPage, /getShopSectionForRequest\(\s*"overview"/);
  assert.match(dashboardSection, /const historySummary = historyReadModel\.summary/);
  assert.match(dashboardSection, /historyReadModel\.reason/);
  assert.doesNotMatch(dashboardSection, /historyReadModel\.summary\./);
  assert.doesNotMatch(dashboardSection, /historyReadModel\.status !== "ready"/);
});

test("History page renders mobile entries first, then sync events and diagnostics", () => {
  const sectionsPath = "src/components/shop/shopSections.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const pagePath = "src/app/shop/history/page.tsx";

  const sections = readProjectFile(sectionsPath);
  const sectionData = readProjectFile(sectionDataPath);
  const page = readProjectFile(pagePath);

  assert.match(sections, /title: "Mobile History"/);
  assert.match(sections, /History entries loaded from shared_sheet_sessions/);

  assert.match(sectionData, /title: "Android \/ iOS History Entries"/);
  assert.match(sectionData, /rows: readModel\.sessions\.map\(historySessionRow\)/);
  assert.doesNotMatch(
    sectionData,
    /title: "Android \/ iOS History Entries"[\s\S]{0,1200}rows: historyEvents\.map/,
  );
  assert.doesNotMatch(
    sectionData,
    /title: "Android \/ iOS History Entries"[\s\S]{0,1200}"Sync event"/,
  );
  assert.match(sectionData, /type: historyEntryType\(session\)/);
  assert.match(sectionData, /"Active history entry"/);
  assert.match(sectionData, /"Deleted history entry"/);
  assert.match(sectionData, /"Overlay OK"/);
  assert.match(sectionData, /`Legacy v\$\{session\.payloadVersion\}`/);
  assert.match(sectionData, /Overlay issue: \$\{overlayStatusLabel\(session\.overlayStatus\)\}/);
  assert.match(sectionData, /title: "Related history sync events"/);
  assert.match(sectionData, /rows: historyEvents\.map\(historySyncEventRow\)/);
  assert.match(
    sectionData,
    /These are technical synchronization logs\. They are not the inventory history entries themselves\./,
  );
  assert.match(sectionData, /label: "Client event"/);
  assert.match(sectionData, /label: "Batch"/);
  assert.match(sectionData, /title: "Payload and overlay diagnostics"/);
  assert.match(sectionData, /rows: readModel\.sessions\.map\(historyDiagnosticsRow\)/);
  assert.match(
    sectionData,
    /History entries are loaded from shared_sheet_sessions\. Sync events are technical synchronization logs linked to those entries\. Admin audit events are shown separately in Audit\./,
  );
  assert.match(sectionData, /technical sync_events/);
  assert.match(sectionData, /admin audit_logs/);
  assert.match(sectionData, /title: "Payload table preview"/);
  assert.match(sectionData, /title: "Related history sync events"/);
  assert.match(sectionData, /title: analysis \? "Mobile History Entry Detail" : "History Sync Event Detail"/);
  assert.match(sectionData, /title: analysis \? "shared_sheet_sessions record" : "sync_events record"/);
  assert.match(sectionData, /remote_id is the cross-platform identity/);
  assert.match(sectionData, /deleted_at marks tombstone\/deleted sessions/);
  assert.match(sectionData, /Invalid overlays are diagnostic only/);
  assert.match(sectionData, /title: "Redacted JSON preview"/);

  const readModel = readProjectFile("src/server/shop-admin/history-read-model.ts");
  assert.match(readModel, /const SESSION_OVERLAY_SCHEMA = 1/);
  assert.match(readModel, /const SESSION_OVERLAY_MAX_BYTES = 512 \* 1024/);
  assert.match(readModel, /detailField\("record", "Source table", "shared_sheet_sessions"\)/);
  assert.match(readModel, /detailField\("record", "Source table", "sync_events"\)/);
  assert.match(readModel, /"remote_id is the Android\/iOS identity for this shared_sheet_sessions record\."/);
  assert.match(readModel, /"deleted_at means this shared_sheet_sessions record is a tombstone\/deleted session\."/);
  assert.match(readModel, /"Diagnostic only; do not trust completed or editable counts for this overlay\."/);
  assert.match(
    readModel,
    /"Technical synchronization event linked to mobile history entries; it is not the History Entry itself\."/,
  );

  assert.match(page, /buildHistoryDetailHref/);
  assert.match(page, /encodeURIComponent\(entryId\)/);
  assert.match(page, /new URLSearchParams\(\{ shop_id: requestedShopId \}\)/);
  assert.match(page, /rowActions=\{\{/);
  assert.match(page, /secondaryRowActions=\{\{/);
  assert.match(page, /renderForTable: \(table\) => table\.title === "Related history sync events"/);
  assert.doesNotMatch(page, /renderForTable: \(table\) => table\.title === "Payload and overlay diagnostics"/);
});

test("Mobile History has a local-only demo seed and cleanup harness", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const scriptPath = "scripts/platform/seed-history-sync-demo.mjs";

  assert.ok(existsSync(join(root, scriptPath)), `${scriptPath} is missing`);
  assert.equal(
    packageJson.scripts["platform:local:seed:history-demo"],
    "node scripts/platform/seed-history-sync-demo.mjs seed",
  );
  assert.equal(
    packageJson.scripts["platform:local:cleanup:history-demo"],
    "node scripts/platform/seed-history-sync-demo.mjs cleanup",
  );

  const script = readProjectFile(scriptPath);

  for (const requiredSnippet of [
    "BLOCKED_REMOTE_TARGET",
    "assertLocalTargetEnv",
    "isLocalSupabaseUrl",
    "supabase",
    "status",
    "--output",
    "env",
    "SUPABASE_SERVICE_ROLE_KEY",
    "COMERCIALIZADORA TEST 1",
    "TASK_HISTORY_DEMO_",
    "task_history_demo_",
    "TASK_HISTORY_DEMO_VALID_Qiaoxiang_Inventory",
    "TASK_HISTORY_DEMO_MANUAL_May_23_2026",
    "TASK_HISTORY_DEMO_TOMBSTONE_DELETED_SESSION",
    "TASK_HISTORY_DEMO_INVALID_OVERLAY_SHAPE",
    "TASK_HISTORY_DEMO_LEGACY_V1_NO_OVERLAY",
    "shared_sheet_sessions",
    "sync_events",
    "shop_inventory_sources",
    "shop_members",
    "history_session_ids",
    "session_ids",
    "sessionIds",
    "session_id",
    "sessionId",
    "history_changed",
    "history_tombstone",
    "invalid_overlay_shape",
    "pending",
    "failed",
    "success",
  ]) {
    assert.match(script, new RegExp(requiredSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const sessionKey of ["valid", "manual", "tombstone", "invalid", "legacy"]) {
    const expectedRemotePrefix =
      `${sessionKey}: uuidFromHash(` + "`" + "${demoPrefix}remote-";

    assert.ok(
      script.includes(expectedRemotePrefix),
      `${sessionKey} demo remote_id must be a deterministic UUID`,
    );
  }

  assert.match(script, /history\.demo\.mobile-owner@example\.test/);
  assert.match(script, /history\.demo\.diagnostic-owner@example\.test/);
  assert.match(script, /supabase\.auth\.admin\.createUser/);
  assert.match(script, /email_confirm:\s*true/);
  assert.match(script, /BLOCKED_DEMO_OWNER_ALREADY_MAPPED/);
  assert.match(script, /display_name: sessionDisplayNames\.invalid[\s\S]{0,260}owner_user_id: diagnosticOwnerUserId/);
  assert.match(
    script,
    /client_event_id: `\$\{demoPrefix\}EVENT_FAILED_INVALID_OVERLAY`[\s\S]{0,760}owner_user_id: diagnosticOwnerUserId/,
  );
  assert.match(script, /remote_id:\s*sessionRemoteIds\.valid/);
  assert.match(script, /history_session_ids:\s*\[sessionRemoteIds\.valid\]/);
  assert.match(script, /payload_version:\s*1/);
  assert.match(script, /session_overlay:\s*null/);
  assert.match(script, /deleted_at:\s*offsetIso/);
  assert.match(script, /source_kind:\s*"mobile_owner"/);
  assert.match(
    script,
    /\.delete\(\)[\s\S]{0,120}\.in\("remote_id", Object\.values\(sessionRemoteIds\)\)/,
  );
  assert.match(script, /SESSIONS_CLEANUP_BY_DISPLAY_NAME_FAILED/);
  assert.match(script, /\.like\("display_name", `\$\{demoPrefix\}%`\)/);
  assert.doesNotMatch(script, /legacyNonUuidRemotePrefix/);
  assert.doesNotMatch(script, /\.like\("remote_id",/);
  assert.doesNotMatch(script, /\$\{demoPrefix\.toLowerCase\(\)\}/);
  assert.doesNotMatch(script, /\.eq\("shop_status", "active"\)[\s\S]{0,220}\.limit\(1\)/);
  assert.doesNotMatch(script, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(script, /service[_-]?role.*browser/i);
});

test("History diagnostics view and legacy fallback RLS stay server-side and bounded", () => {
  const viewMigration = readProjectFile(
    "supabase/migrations/20260615093000_history_session_diagnostics_view.sql",
  );
  const legacyRlsMigration = readProjectFile(
    "supabase/migrations/20260615094000_history_legacy_mapped_member_rls.sql",
  );
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");
  const contractDoc = readProjectFile(
    "docs/TASKS/EVIDENCE/history-sync-cross-platform-contract.md",
  );

  assert.match(
    viewMigration,
    /create or replace view public\.shared_sheet_session_diagnostics/,
  );
  assert.match(viewMigration, /with \(security_invoker = true\)/);
  assert.match(viewMigration, /grant select on public\.shared_sheet_session_diagnostics to authenticated/);
  assert.match(viewMigration, /flags\.position > 1/);
  assert.match(viewMigration, /greatest\(item_rows - raw_complete_count, 0\)/);
  assert.doesNotMatch(viewMigration, /security definer/i);

  assert.match(legacyRlsMigration, /shared_sheet_sessions_select_mapped_shop_member_legacy/);
  assert.match(legacyRlsMigration, /sync_events_select_mapped_shop_member_legacy/);
  assert.match(legacyRlsMigration, /shop_id is null/);
  assert.match(legacyRlsMigration, /source\.mapping_state = 'mapped'/);
  assert.match(legacyRlsMigration, /app_private\.is_active_shop_member\(source\.shop_id\)/);

  assert.match(databaseTypes, /shared_sheet_session_diagnostics/);
  assert.match(databaseTypes, /overlay_status: string/);
  assert.match(databaseTypes, /data_summary: string/);
  assert.match(databaseTypes, /overlay_summary: string/);

  assert.match(contractDoc, /shared_sheet_sessions/);
  assert.match(contractDoc, /sync_events/);
  assert.match(contractDoc, /remote_id/);
  assert.match(contractDoc, /UUID/i);
  assert.match(contractDoc, /history_session_ids/);
  assert.match(contractDoc, /read-only/i);
});
