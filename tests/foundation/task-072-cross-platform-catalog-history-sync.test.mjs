import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const androidRoot =
  process.env.ANDROID_MERCHANDISE_CONTROL_ROOT?.trim() ||
  "/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView";
const iosRoot =
  process.env.IOS_MERCHANDISE_CONTROL_ROOT?.trim() ||
  "/Users/minxiang/Desktop/iOSMerchandiseControl";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readExternalFile(basePath, relativePath) {
  return readFileSync(join(basePath, relativePath), "utf8");
}

test("TASK-072 Admin Web catalog mutations emit redacted technical sync_events", () => {
  const writer = readProjectFile("src/server/shop-admin/sync-event-writer.ts");
  const catalogMutations = readProjectFile(
    "src/server/shop-admin/catalog-mutations.ts",
  );
  const syncSection = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  assert.match(writer, /import "server-only"/);
  assert.match(writer, /\.from\("sync_events"\)\.insert/);
  assert.match(writer, /source: "admin_web"/);
  assert.match(writer, /buildAdminWebClientEventId/);
  assert.match(writer, /createHash\("sha256"\)/);
  assert.match(writer, /owner_user_id: input\.ownerUserId/);
  assert.match(writer, /shop_id: input\.shopId/);
  assert.match(writer, /"supplier_ids"/);
  assert.match(writer, /"category_ids"/);
  assert.match(writer, /"product_ids"/);
  assert.match(writer, /catalog_tombstone/);
  assert.doesNotMatch(writer, /product_name|barcode|supplier_name|category_name/);

  for (const required of [
    '{ entity: "supplier", operation: "create" }',
    '{ entity: "supplier", operation: "update" }',
    '{ entity: "supplier", operation: "archive" }',
    '{ entity: "category", operation: "create" }',
    '{ entity: "category", operation: "update" }',
    '{ entity: "category", operation: "archive" }',
    '{ entity: "product", operation: "create" }',
    '{ entity: "product", operation: "update" }',
    '{ entity: "product", operation: "archive" }',
    '{ entity: "product", operation: "restore" }',
  ]) {
    assert.match(
      catalogMutations,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  assert.match(syncSection, /Admin Web records technical sync_events/);
  assert.match(syncSection, /Admin Web events/);
  assert.match(syncSection, /Latest cursor/);
  assert.match(syncSection, /Cursor \/ Client event/);
});

test("TASK-072 Admin Web writes History Entry payload v2 with tombstones, audit, and sync signal", () => {
  const historyMutations = readProjectFile(
    "src/server/shop-admin/history-mutations.ts",
  );
  const actions = readProjectFile("src/app/shop/actions.ts");
  const historyPage = readProjectFile("src/app/shop/history/page.tsx");
  const historyDetailPage = readProjectFile(
    "src/app/shop/history/[entryId]/page.tsx",
  );
  const permissions = readProjectFile("src/server/shop-admin/permissions.ts");

  assert.match(historyMutations, /import "server-only"/);
  assert.match(historyMutations, /SESSION_PAYLOAD_VERSION = 2/);
  assert.match(historyMutations, /SESSION_OVERLAY_SCHEMA = 1/);
  assert.match(historyMutations, /randomUUID\(\)\.toLowerCase\(\)/);
  assert.match(historyMutations, /editable: data\.map\(\(\) => \["", ""\]\)/);
  assert.match(historyMutations, /\.from\("shared_sheet_sessions"\)\.insert/);
  assert.match(historyMutations, /\.from\("shared_sheet_sessions"\)/);
  assert.match(historyMutations, /payload_version: SESSION_PAYLOAD_VERSION/);
  assert.match(historyMutations, /session_overlay: input\.overlay/);
  assert.match(historyMutations, /deleted_at: input\.deletedAt/);
  assert.match(historyMutations, /\.from\("audit_logs"\)[\s\S]*?\.insert/);
  assert.match(historyMutations, /target_type: "history_session"/);
  assert.match(historyMutations, /eventType: "history_changed"/);
  assert.match(historyMutations, /eventType: "history_tombstone"/);
  assert.match(historyMutations, /session_ids: \[\s*input\.remoteId\s*\]/);
  assert.match(historyMutations, /ownerUserId: input\.owner\.ownerUserId/);
  assert.match(historyMutations, /shopId: input\.context\.selectedShop\.shopId/);
  assert.match(historyMutations, /isLegacyHistorySchemaError/);
  assert.match(historyMutations, /\.select\("remote_id,updated_at,deleted_at"\)/);
  assert.match(historyMutations, /const seedTimestamp = updateResult\.data\.updated_at/);
  assert.match(historyMutations, /seedTimestamp: tombstoneResult\.data\.deleted_at \?\? deletedAt/);
  assert.doesNotMatch(historyMutations, /\.delete\(/);

  assert.match(permissions, /"history\.write"/);
  assert.match(actions, /createHistoryEntryAction/);
  assert.match(actions, /updateHistoryEntryAction/);
  assert.match(actions, /tombstoneHistoryEntryAction/);
  assert.match(historyPage, /resolveShopActionContext\(requestedShopId, "history\.write"\)/);
  assert.match(historyDetailPage, /resolveShopActionContext\(requestedShopId, "history\.write"\)/);
  assert.match(historyDetailPage, /detail\.kind !== "shared_sheet_session"/);
});

test("TASK-072 mobile clients already consume owner-scoped sync_events and History v2 rows", () => {
  if (!existsSync(androidRoot) || !existsSync(iosRoot)) {
    return;
  }

  const androidSyncModels = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/SyncEventModels.kt",
  );
  const androidRepository = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/InventoryRepository.kt",
  );
  const androidRemote = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/SupabaseSyncEventRemoteDataSource.kt",
  );
  const androidSession = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/SharedSheetSessionRecord.kt",
  );
  const iosSyncDTOs = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Remote/SupabaseSyncEventDTOs.swift",
  );
  const iosDomainApply = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Automatic/Pull/SyncEventIncrementalDomainApplyService.swift",
  );
  const iosHistoryApply = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Automatic/Pull/HistoryIncrementalApplyService.swift",
  );
  const iosEntityIds = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Automatic/Pull/SyncEventIncrementalApplyHelpers.swift",
  );

  assert.match(androidSyncModels, /@SerialName\("supplier_ids"\)/);
  assert.match(androidSyncModels, /@SerialName\("category_ids"\)/);
  assert.match(androidSyncModels, /@SerialName\("product_ids"\)/);
  assert.match(androidSyncModels, /@SerialName\("session_ids"\)/);
  assert.match(androidRemote, /eq\("owner_user_id", ownerUserId\)/);
  assert.match(androidRepository, /applyCatalogEventByIds/);
  assert.match(androidRepository, /applyHistoryEventByIds/);
  assert.match(androidSession, /payloadVersion: Int/);
  assert.match(androidSession, /sessionOverlay: SessionOverlay/);
  assert.match(androidSession, /deletedAt: String\? = null/);

  assert.match(iosSyncDTOs, /ownerUserID = "owner_user_id"/);
  assert.match(iosSyncDTOs, /clientEventID = "client_event_id"/);
  assert.match(iosEntityIds, /object\["supplier_ids"\]/);
  assert.match(iosEntityIds, /object\["category_ids"\]/);
  assert.match(iosEntityIds, /object\["product_ids"\]/);
  assert.match(iosEntityIds, /object\["session_ids"\]/);
  assert.match(iosDomainApply, /fetchSyncEventsAfter/);
  assert.match(iosDomainApply, /HistoryIncrementalApplyService/);
  assert.match(iosHistoryApply, /fetchSharedSheetSessionsByIDs/);
});

test("TASK-072C Admin Web exposes a read-only TASK072C runtime harness", () => {
  const harness = readProjectFile(
    "scripts/platform/task-072c-admin-runtime-harness.mjs",
  );

  assert.match(harness, /defaultPrefix = "TASK072C_"/);
  assert.match(harness, /allowedCommands = new Set\(\["cleanup-counts", "status", "verify"\]\)/);
  assert.match(harness, /assertLocalTargetEnv/);
  assert.match(harness, /assertStagingTargetEnv\(env, \{ requireConfirmation: true \}\)/);
  assert.match(harness, /assertNoProductionProjectRef/);
  assert.match(harness, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(harness, /serviceRoleBoundary: "node_cli_only"/);
  assert.match(harness, /mutations: "none"/);
  assert.match(harness, /createAdminOrigin:[\s\S]*not_implemented/);
  assert.match(harness, /\.from\(table\)/);
  assert.match(harness, /table: "inventory_products"/);
  assert.match(harness, /table: "inventory_categories"/);
  assert.match(harness, /table: "inventory_suppliers"/);
  assert.match(harness, /\.from\("shared_sheet_sessions"\)/);
  assert.match(harness, /\.from\("sync_events"\)/);
  assert.match(harness, /overlayStatus: "ok"/);
  assert.match(harness, /overlayStatus: "invalid_shape"/);
  assert.match(harness, /countsByOrigin: summarizeOrigins/);
  assert.match(harness, /admin_web/);
  assert.match(harness, /mobile_like/);
  assert.match(harness, /redactJson/);
  assert.match(harness, /redactId/);
  assert.doesNotMatch(harness, /\.from\("[^"]+"\)[\s\S]{0,240}\.delete\s*\(/);
  assert.doesNotMatch(harness, /\.from\("[^"]+"\)[\s\S]{0,240}\.insert\s*\(/);
  assert.doesNotMatch(harness, /\.from\("[^"]+"\)[\s\S]{0,240}\.update\s*\(/);
  assert.doesNotMatch(harness, /\.from\("[^"]+"\)[\s\S]{0,240}\.upsert\s*\(/);
  assert.doesNotMatch(harness, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test("TASK-072D Admin Web exposes a guarded synthetic TASK072D runtime harness", () => {
  const harness = readProjectFile(
    "scripts/platform/task-072d-admin-runtime-harness.mjs",
  );

  assert.match(harness, /defaultPrefix = "TASK072D_"/);
  assert.match(harness, /allowedCommands = new Set\(\[/);
  for (const command of [
    '"cleanup-tombstone"',
    '"idempotency"',
    '"negative-rls"',
    '"run"',
    '"seed"',
    '"status"',
    '"verify"',
  ]) {
    assert.match(harness, new RegExp(command));
  }

  assert.match(harness, /mutatingCommands = new Set\(\[/);
  assert.match(harness, /ALLOW_TASK072D_MUTATIONS/);
  assert.match(harness, /CONFIRM_TASK072D_MUTATIONS/);
  assert.match(harness, /assertLocalTargetEnv/);
  assert.match(harness, /assertStagingTargetEnv\(env, \{ requireConfirmation: true \}\)/);
  assert.match(harness, /assertNoProductionProjectRef/);
  assert.match(harness, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(harness, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(harness, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(harness, /serviceRoleBoundary: "node_cli_only"/);
  assert.match(harness, /hardDelete: "forbidden"/);

  assert.match(harness, /"inventory_products"/);
  assert.match(harness, /"inventory_categories"/);
  assert.match(harness, /"inventory_suppliers"/);
  assert.match(harness, /\.from\("sync_events"\)/);
  assert.match(harness, /\.from\("shared_sheet_sessions"\)/);
  assert.match(harness, /\.insert\(/);
  assert.match(harness, /\.update\(/);
  assert.match(harness, /eventType: "catalog_tombstone"/);
  assert.match(harness, /eventType: "history_tombstone"/);
  assert.match(harness, /payload_version: 2/);
  assert.match(harness, /overlay_schema: 1/);
  assert.match(harness, /source: "admin_web"/);
  assert.match(harness, /source: "admin_web_test_harness"/);
  assert.match(harness, /buildAdminWebClientEventId/);
  assert.match(harness, /isDuplicateSyncEventError/);
  assert.match(harness, /code === "23505"/);
  assert.match(harness, /countClientEventRows/);

  assert.match(harness, /createAnonClient/);
  assert.match(harness, /verifyNegativeRlsAndCrossShop/);
  assert.match(harness, /blocked_or_empty/);
  assert.match(harness, /crossShopCounts/);
  assert.match(harness, /redactJson/);
  assert.match(harness, /redactId/);
  assert.match(harness, /stringifyRedactedJson/);
  assert.doesNotMatch(harness, /\.from\("[^"]+"\)[\s\S]{0,240}\.delete\s*\(/);
  assert.doesNotMatch(harness, /\.from\("[^"]+"\)[\s\S]{0,240}\.upsert\s*\(/);
  assert.doesNotMatch(harness, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});
