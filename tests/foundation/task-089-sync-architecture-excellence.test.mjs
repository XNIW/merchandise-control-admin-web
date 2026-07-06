import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const defaultWin7PosRoot = "/Users/minxiang/Projects/Win7POS";
const win7PosRoot =
  process.env.WIN7POS_REPO_PATH?.trim() || defaultWin7PosRoot;
const requireWin7PosRepo = process.env.REQUIRE_WIN7POS_REPO === "1";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function assertContainsAll(source, values) {
  for (const value of values) {
    assert.match(
      source,
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `missing invariant marker: ${value}`,
    );
  }
}

function shouldSkipMissingWin7PosRepo() {
  return !existsSync(win7PosRoot) && !requireWin7PosRepo;
}

test("TASK-089 POS API routes keep server-side no-store JSON boundaries", () => {
  const shared = readProjectFile("src/app/api/pos/_shared/pos-route-security.ts");
  const admin = readProjectFile("src/lib/supabase/admin.ts");

  assertContainsAll(shared, [
    'import "server-only"',
    "MAX_POS_JSON_BODY_BYTES = 16 * 1024",
    '"Cache-Control": "no-store"',
    'mediaType === "application/json"',
    "readLimitedBodyText",
    "Response.json",
    'code: "method_not_allowed"',
    "Method not allowed.",
    "SENSITIVE_REQUEST_ID_PATTERN",
    "X-Request-Id",
    "X-Client-Request-Id",
    "ok: false",
  ]);
  assertContainsAll(admin, [
    'import "server-only"',
    "SUPABASE_SERVICE_ROLE_KEY",
    "persistSession: false",
    "createClient<Database>",
  ]);

  for (const route of [
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
    "src/app/api/pos/catalog/import-sync/route.ts",
    "src/app/api/pos/catalog/pull/route.ts",
    "src/app/api/pos/sales/sync/route.ts",
  ]) {
    const source = readProjectFile(route);
    assertContainsAll(source, [
      'export const dynamic = "force-dynamic"',
      'export const runtime = "nodejs"',
      "readPosJsonBody",
      "posJsonResponse",
      "posMethodNotAllowedResponse",
      "createPosRouteRequestContext",
      "clientRequestId",
      "requestId",
      'code: "db_failure"',
      "POS request failed.",
      "methodNotAllowed as DELETE",
      "methodNotAllowed as GET",
      "methodNotAllowed as HEAD",
      "methodNotAllowed as OPTIONS",
      "methodNotAllowed as PATCH",
      "methodNotAllowed as PUT",
    ]);
  }

  assert.match(
    readProjectFile("src/app/api/pos/catalog/import-sync/route.ts"),
    /MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES/,
  );
  assert.match(
    readProjectFile("src/app/api/pos/sales/sync/route.ts"),
    /MAX_POS_SALES_SYNC_JSON_BODY_BYTES/,
  );
});

test("TASK-089 POS contracts expose explicit version, time and conservative policy", () => {
  const service = readProjectFile("src/server/pos-auth/service.ts");
  const posContract = readProjectFile("src/server/pos-auth/pos-contract.ts");
  const shopPayload = readProjectFile("src/server/pos-auth/shop-payload.ts");
  const catalog = readProjectFile("src/server/pos-auth/catalog-pull.ts");
  const catalogContract = readProjectFile("src/server/pos-auth/catalog-sync-contract.ts");
  const sales = readProjectFile("src/server/pos-auth/sales-sync.ts");

  assertContainsAll(service, [
    "PosFirstLoginSuccessBody",
    "PosHeartbeatSuccessBody",
    "serverTime: string",
    "serverTime: nowIso()",
    "buildPosPolicyPayload()",
  ]);
  assertContainsAll(shopPayload, [
    "contractVersion: POS_POLICY_CONTRACT_VERSION",
    "capabilities",
    "limitations",
    "offlinePolicy",
    "paymentPolicy",
    "staffPolicy",
    "taxPolicy",
    "unsupportedCapabilities",
  ]);
  assertContainsAll(posContract, [
    'POS_POLICY_CONTRACT_VERSION = "pos-policy-v1"',
    "POS_CATALOG_SCHEMA_VERSION = 2",
    'POS_CATALOG_IMPORT_SCHEMA_VERSION = "pos-catalog-import-v1"',
    'POS_SALES_SCHEMA_VERSION = "pos-sales-ledger-v2"',
    'POS_LEGACY_SALES_SCHEMA_VERSION = "pos-sales-v1"',
    'POS_SUPPORTED_PAYMENT_METHODS = ["cash", "card", "other"]',
    "credential_material_not_synced",
    "transfer_payments_not_enabled_in_win7pos",
    "tax_policy_not_configured_online",
    "POS_UNSUPPORTED_CAPABILITIES",
  ]);
  assertContainsAll(catalog, [
    "schemaVersion: POS_CATALOG_SCHEMA_VERSION",
    "serverTime",
    "syncCursor",
    "policy: buildPosPolicyPayload()",
    "tombstones",
  ]);
  assertContainsAll(catalogContract, [
    "decodeCatalogSyncCursor",
    "buildNextCatalogSyncCursor",
    "parseCatalogSyncOptions",
    "syncCursor",
    "updatedSince",
  ]);
  assertContainsAll(sales, [
    "type PosSalesSchemaVersion",
    "POS_SALES_SCHEMA_VERSION",
    "POS_LEGACY_SALES_SCHEMA_VERSION",
    "parseSchemaVersion",
    "serverTime",
    "clientBatchId",
    "clientSaleId",
  ]);
});

test("TASK-089 catalog and sales sync preserve shop scope, idempotency and stock invariants", () => {
  const catalog = readProjectFile("src/server/pos-auth/catalog-pull.ts");
  const sales = readProjectFile("src/server/pos-auth/sales-sync.ts");
  const recovery = readProjectFile(
    "src/server/shop-admin/pos-sync-recovery-read-model.ts",
  );
  const recoveryMutations = readProjectFile(
    "src/server/shop-admin/pos-sync-recovery-mutations.ts",
  );
  const recoveryPanel = readProjectFile(
    "src/app/shop/sync/PosSyncRecoveryPanel.tsx",
  );
  const shopActions = readProjectFile("src/app/shop/actions.ts");
  const permissions = readProjectFile("src/server/shop-admin/permissions.ts");
  const staffWebPermissions = readProjectFile(
    "src/server/shop-admin/staff-web-permissions.ts",
  );
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assertContainsAll(catalog, [
    '.eq("shop_id", session.shop_id)',
    '.order("updated_at", { ascending: true })',
    '.order("id", { ascending: true })',
    "splitCatalogTombstones",
    "buildNextCatalogSyncCursor",
    "hasMore",
  ]);
  assertContainsAll(sales, [
    ".eq(\"shop_id\", session.shop_id)",
    ".eq(\"shop_id\", shopId)",
    ".eq(\"idempotency_key\", parsed.idempotencyKey)",
    ".eq(\"client_batch_id\", parsed.clientBatchId)",
    "existing.payload_hash !== sale.payloadHash",
    'return failure("conflict", 409)',
    'status: "duplicate"',
    "pos_apply_sale_stock_movement",
    "p_movement_key",
    "unresolved_product",
    "pos.sales.sync.success",
    "pos.sales.sync.failure",
    "request_id",
    "client_request_id",
    "redactPosFreeText",
    "containsSensitiveText(clientBatchId)",
    "containsSensitiveText(idempotencyKey)",
  ]);
  assertContainsAll(recovery, [
    'import "server-only"',
    "resolveShopAdminDataAccess",
    ".eq(\"shop_id\", selectedShop.shopId)",
    "metadata_redacted",
    "accepted_sale_count",
    "duplicate_sale_count",
    "metadataCount(row.metadata_redacted",
    "metadataCount(row.metadata_redacted, \"accepted_sale_count\") ??",
    "metadataCount(row.metadata_redacted, \"duplicate_sale_count\") ??",
    "readOnly: true",
    "recoveryActionsAppendOnly: true",
    'source: "supabase_admin_server"',
    "stockWarnings",
    "recentFailures",
    "pos.auth.first_login",
    "pos.session.heartbeat",
    "pos.catalog.pull",
    "recoveryActions",
    "metadataPreview: stringifyRedactedJson",
  ]);
  assertContainsAll(recoveryMutations, [
    'import "server-only"',
    "resolveShopActionContext(",
    "input.requestedShopId",
    '"sync.manage"',
    ".from(\"audit_logs\")",
    ".insert({",
    "redactShopAdminJson",
    "behavior: \"append_only_audit_no_sales_stock_outbox_mutation\"",
    "request_pos_retry_effect",
    ".eq(\"shop_id\", shopId)",
    "pos.sync.recovery.",
  ]);
  assertContainsAll(readProjectFile("src/server/shop-admin/history-read-model.ts"), [
    "mcpos_(?:device|session)",
    "redactSensitiveText",
  ]);
  assert.doesNotMatch(recoveryMutations, /\.from\("pos_sales"\)\s*\.\s*(update|delete|upsert)/);
  assert.doesNotMatch(recoveryMutations, /\.from\("pos_sale_stock_movements"\)\s*\.\s*(update|delete|upsert)/);
  assert.doesNotMatch(recoveryMutations, /force.*ack|delete.*outbox|truncate/i);
  assertContainsAll(recoveryPanel, [
    "Safe recovery actions",
    "Record recovery action",
    "Copy/export technical context",
    "auditFailure",
    "recoveryAction",
    "audit-only",
    "sales/stock/outbox",
    "modify sales",
    "recoveryActions",
  ]);
  assertContainsAll(shopActions, ["recordPosSyncRecoveryActionAction"]);
  assertContainsAll(permissions, ['| "sync.manage"', '"sync.manage"']);
  assertContainsAll(staffWebPermissions, [
    '{ key: "sync.write", label: "Manage sync recovery notes" }',
    'permission === "sync.manage"',
  ]);
  assertContainsAll(securityChecks, [
    "src/server/shop-admin/pos-sync-recovery-mutations.ts",
  ]);
});

test("TASK-089 positive harness remains staging-allowlisted and cleanup-safe", () => {
  const script = readProjectFile("scripts/pos-local-e2e-harness.mjs");
  const stagingCheck = readProjectFile("scripts/staging-readiness-check.mjs");
  const supabaseCheck = readProjectFile("scripts/check-supabase-tooling.mjs");
  const packageJson = readProjectFile("package.json");

  assertContainsAll(script, [
    "TASK032_POS_E2E_ALLOW_STAGING",
    "TASK032_POS_E2E_STAGING_DRY_RUN",
    "TASK032_POS_E2E_STAGING_HOST_ALLOWLIST",
    "TASK032_POS_E2E_STAGING_PROJECT_REF",
    "TASK032_POS_E2E_REQUIRE_STAGING_TARGET",
    "TASK032_POS_E2E_REQUIRE_TEST_MARKER",
    "PASS_STAGING_PRECHECK_DRY_RUN",
    "validatePositiveTarget",
    "validateStagingDryRunConfig",
    "Test marker must be exactly TASK032",
    "Supabase URL does not match the allowlisted staging project ref",
    "Staging Admin Web host is not in TASK032_POS_E2E_STAGING_HOST_ALLOWLIST",
    "Vercel preview/production hosts are not allowed",
    "identifierRunId = requestedRunId || runId",
    "syntheticCode(SYNTHETIC_SHOP_CODE_PREFIX, identifierRunId)",
    "syntheticCode(SYNTHETIC_STAFF_CODE_PREFIX, identifierRunId)",
    "SYNTHETIC_DEVICE_PREFIX}${identifierRunId}",
    "applySyntheticStaffScope",
    "staffCodeLike",
    "cleanupSyntheticSalesRecords",
    "immutableSaleRowsRetained",
    "Synthetic price product lookup",
    '.eq("source", "TASK-032")',
    '.in("product_id", syntheticProductIds)',
    "verifyCleanup",
    "X-Client-Request-Id",
    "requestId",
  ]);
  assert.doesNotMatch(script, /\.truncate\(/);
  assert.doesNotMatch(script, /delete\(\)\s*\.neq|delete\(\)\s*\.not/);
  assertContainsAll(packageJson, [
    "cf:check:custom-domain",
    "cf:check:staging",
    "staging:check",
    "supabase:check",
    "test:pos-staging-harness:dry-run",
    "TASK032_POS_E2E_STAGING_DRY_RUN=yes",
    "test:pos-staging-harness",
    "TASK032_POS_E2E_REQUIRE_STAGING_TARGET=yes",
    "TASK032_POS_E2E_REQUIRE_TEST_MARKER=TASK032",
  ]);
  assertContainsAll(stagingCheck, [
    "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev",
    "STAGING_CUSTOM_DOMAIN",
    "READY_TO_CONFIGURE",
    "TASK032_POS_E2E_STAGING_HOST_ALLOWLIST",
    "TASK032_POS_E2E_STAGING_PROJECT_REF",
    "TASK032 cleanup active zero",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SENSITIVE_PATTERN",
  ]);
  assertContainsAll(supabaseCheck, [
    "MIN_VERSION",
    "TESTED_VERSION",
    "RECOMMENDED_VERSION",
    "supabase migration list --linked",
    "brew upgrade supabase",
  ]);
  assert.doesNotMatch(stagingCheck, /NODE_NO_WARNINGS|truncate\(/);
  assert.doesNotMatch(supabaseCheck, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("TASK-089 cross-platform docs keep data contract aligned without mobile runtime changes", () => {
  const architecture = readProjectFile("docs/POS_SYNC_ARCHITECTURE.md");
  const runbook = readProjectFile("docs/POS_SYNC_DEBUGGING_RUNBOOK.md");
  const migration = readProjectFile(
    "supabase/migrations/20260628180000_task_089_catalog_delta_indexes.sql",
  );
  const syncWriter = readProjectFile("src/server/shop-admin/sync-event-writer.ts");
  const workbookImport = readProjectFile(
    "src/server/shop-admin/import-export-workbook.ts",
  );

  assertContainsAll(architecture, [
    "Cross-platform Data Contract",
    "Android/iOS restano il riferimento di contratto dati",
    "Win7POS non copia il loro runtime",
    "Admin Web / Supabase",
    "Source of truth e server boundary",
    "Offline-first POS legacy",
    "shops` come root business",
    "`shop_id` / `shop_code`",
    "product/category/supplier",
    "stock/history/ledger",
    "sync status",
    "conflict",
    "offline pending",
    "Debugging E Observability",
    "POS_SYNC_DEBUGGING_RUNBOOK.md",
    "X-Request-Id",
    "TASK_SYNC_PERF_*",
    "EXPLAIN (ANALYZE, BUFFERS)",
    "Index Only Scan",
    "catalog-v1",
    "catalog-v2",
    "bulk import",
    "prodotti con un `catalog_changed` aggregato",
    "transazione atomica",
  ]);
  assertContainsAll(runbook, [
    "Observability Matrix",
    "clientRequestId",
    "syncAttemptId",
    "clientBatchId",
    "clientSaleId",
    "X-Request-Id",
    "audit_logs metadata_redacted",
    "Non cancellare `sales_sync_outbox`",
  ]);
  assertContainsAll(migration, [
    "inventory_products_shop_updated_id_idx",
    "inventory_product_prices_shop_created_id_idx",
    "inventory_products_legacy_owner_updated_id_idx",
    "inventory_product_prices_legacy_owner_created_id_idx",
  ]);
  assertContainsAll(syncWriter, [
    "emitCatalogBulkProductImportSyncEvent",
    "bulk_import",
    "product_ids",
    "catalog_changed",
    "changedCount: sortedProductIds.length",
  ]);
  assertContainsAll(workbookImport, [
    "emitBulkProductImportSyncEvents",
    "syncEventFailure",
    "bulkProductSyncEventError",
    "Products were applied, but the catalog sync event could not be recorded.",
  ]);
});

test("TASK-089 PriceHistory workbook emits prices_changed from real price ids", () => {
  const architecture = readProjectFile("docs/POS_SYNC_ARCHITECTURE.md");
  const migration = readProjectFile(
    "supabase/migrations/20260628183000_task_089_price_history_sync_event_ids.sql",
  );
  const syncWriter = readProjectFile("src/server/shop-admin/sync-event-writer.ts");
  const workbookImport = readProjectFile(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const staffAwareMutations = readProjectFile(
    "src/server/shop-admin/staff-aware-mutations.ts",
  );

  assertContainsAll(architecture, [
    "PriceHistory",
    "`prices_changed`",
    "`price_ids`",
    "`product_ids`",
    "fallisce",
    "response torna errore",
  ]);
  assertContainsAll(migration, [
    "shop_catalog_import_price_history",
    "v_price_ids",
    "v_actual_price_id",
    "returning id into v_actual_price_id",
    "'priceIds'",
    "'priceId'",
    "'productId'",
    "'shopId'",
    "'ownerUserId'",
    "grant execute on function public.shop_catalog_import_price_history",
  ]);
  assertContainsAll(syncWriter, [
    "emitPriceHistoryImportSyncEvent",
    "PRICE_SYNC_EVENT_CHUNK_SIZE = 100",
    ".from(\"inventory_product_prices\")",
    ".in(\"id\", priceIdChunk)",
    "domain: \"prices\"",
    "eventType: \"prices_changed\"",
    "price_ids: sortedPriceIds",
    "product_ids: sortedProductIds",
    "changedCount: sortedPriceIds.length",
  ]);
  assertContainsAll(workbookImport, [
    "priceIdsFromPayload",
    "payload.priceIds",
    "emitPriceHistoryImportSyncEvents",
    "priceHistorySyncEventError",
    "PriceHistory rows were applied, but the prices sync event could not be recorded.",
    "shopAdminActionResult(syncEventFailure",
  ]);
  assertContainsAll(staffAwareMutations, [
    "const priceIds: string[] = []",
    ".from(\"inventory_product_prices\")",
    ".select(\"id\")",
    "priceIds.push(...appliedRows.map((row) => row.id))",
    "priceIds,",
  ]);
  assert.doesNotMatch(workbookImport, /priceHistoryApplied[\s\S]{0,400}prices_changed/);
  assert.doesNotMatch(syncWriter, /eventType: "prices_changed"[\s\S]{0,500}product_ids: sortedProductIds[\s\S]{0,200}price_ids: sortedProductIds/);
});

test("TASK-089 Admin shell listens to shop-scoped sync_events for near-realtime refresh", () => {
  const shopShell = readProjectFile("src/components/shop/ShopShell.tsx");
  const browserClient = readProjectFile("src/lib/supabase/client.ts");

  assertContainsAll(shopShell, [
    "createSupabaseBrowserClient",
    "scheduleCurrentShopRouteRefresh",
    "shop-sync-events:",
    '"postgres_changes"',
    'table: "sync_events"',
    "filter: `shop_id=eq.${activeShopId}`",
    "supabase.removeChannel(channel)",
    "router.refresh()",
  ]);
  assertContainsAll(browserClient, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "createBrowserClient<Database>",
  ]);
  assert.doesNotMatch(shopShell, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(browserClient, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("TASK-089 Admin sync event writer has retry compensation without silent success", () => {
  const syncWriter = readProjectFile("src/server/shop-admin/sync-event-writer.ts");
  const catalogMutations = readProjectFile("src/server/shop-admin/catalog-mutations.ts");
  const historyMutations = readProjectFile("src/server/shop-admin/history-mutations.ts");

  assertContainsAll(syncWriter, [
    "SYNC_EVENT_WRITE_RETRY_DELAYS_MS",
    "isRetryableSyncEventWriteError",
    "insertSyncEventWithLegacyFallback",
    "waitForSyncEventRetry",
    "lastError = outcome.error",
    "if (!isRetryableSyncEventWriteError(outcome.error))",
    "return { code: \"db_failure\", ok: false }",
  ]);
  assertContainsAll(catalogMutations, [
    "const syncResult = await emitCatalogMutationSyncEvent",
    "if (syncResult.ok)",
    "shopAdminActionResult(syncResult.code",
  ]);
  assertContainsAll(historyMutations, [
    "writeAdminWebSyncEvent",
    "shopAdminActionResult(syncResult.code",
  ]);
  assert.doesNotMatch(syncWriter, /console\.error\([\s\S]{0,300}owner_user_id/);
  assert.doesNotMatch(syncWriter, /console\.(error|warn|log)/);
});

test("TASK-089 Win7POS outbox, parser and restore invariants stay aligned", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

  const client = readWin7PosFile("src/Win7POS.Core/Online/PosAdminWebClient.cs");
  const builder = readWin7PosFile(
    "src/Win7POS.Data/Online/PosSalesSyncRequestBuilder.cs",
  );
  const salesRepo = readWin7PosFile(
    "src/Win7POS.Data/Repositories/SaleRepository.cs",
  );
  const syncService = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosSalesSyncService.cs",
  );
  const statusReader = readWin7PosFile(
    "src/Win7POS.Wpf/Pos/Online/PosSyncStatusReader.cs",
  );
  const workflow = readWin7PosFile("src/Win7POS.Wpf/Pos/PosWorkflowService.cs");
  const logger = readWin7PosFile("src/Win7POS.Wpf/Infrastructure/FileLogger.cs");
  const debugCheck = readWin7PosFile("scripts/check-pos-debug-logging.ps1");

  assertContainsAll(client, [
    "/api/pos/auth/first-login",
    "/api/pos/session/heartbeat",
    "/api/pos/catalog/import-sync",
    "/api/pos/catalog/pull",
    "/api/pos/sales/sync",
    "TimeSpan.FromSeconds(10)",
    "X-Client-Request-Id",
    "X-Request-Id",
    "CF-Ray",
    "ClientRequestId",
    "ServerRequestId",
    "paymentPolicy",
  ]);
  assert.doesNotMatch(client, /supabase\.co|SUPABASE_SERVICE_ROLE_KEY/i);
  assertContainsAll(builder, [
    "private const string SchemaVersion = PosOnlineContract.SalesSchemaVersion",
    "ClientBatchId",
    "ClientSaleId",
    "SerializeRedacted",
    "Sha256Hex",
    "BusinessDate",
    "StockQuantityDelta",
    "Method = PosOnlineContract.PaymentCash",
    "Method = PosOnlineContract.PaymentCard",
  ]);
  assertContainsAll(salesRepo, [
    "PosOnlineContract.SalesSchemaVersion",
    "EnsureClientSaleIdAsync",
    "ApplyLocalStockMovementsAsync",
    "EnqueueSalesSyncOutboxAsync",
    "INSERT OR IGNORE INTO sales_sync_outbox",
    "payload_hash",
    "ORDER BY id ASC",
    "LIMIT @take",
    "failed_blocked",
  ]);
  assertContainsAll(syncService, [
    "Interlocked.CompareExchange",
    "SalesSyncInProgressSettingKey",
    "PrepareSalesSyncAttemptAsync",
    "MarkSalesSyncAckedAsync",
    "MarkSalesSyncRetryAsync",
    "MarkSalesSyncBlockedAsync",
    "validation_failed",
    "conflict",
    "syncAttemptId",
    "IsAcceptedAckStatus",
    "IsBlockedAckStatus",
    "serverRequestId",
    "category=sales.sync",
    "ConfigureAwait(false)",
  ]);
  assertContainsAll(statusReader, [
    'T("sync.inProgress")',
    "IsSyncing",
    'T("sync.blockedAttention")',
    'T("sync.callSupport")',
    'T("sync.restoreVerifyBeforeClose")',
    "pos.restore.needs_sync_review",
  ]);
  assertContainsAll(workflow, [
    "QueueSalesOutboxSyncNoThrow",
    "CreateDbBackupCopyNoLock",
    "pos_pre_restore_",
    "KeyRestoreNeedsSyncReview",
    "KeyRestoreLastPreBackupPath",
    "IntegrityCheckAsync",
    "HasUnresolvedSalesSyncOutboxAsync",
    "POS DB restore blocked",
    "POS DB pre-restore backup created",
  ]);
  assertContainsAll(logger, [
    "sessionToken",
    "deviceToken",
    "trustedDeviceToken",
    "Authorization",
    "mcpos_",
    "db_password",
    "database password",
    "password",
    "credential",
  ]);
  assertContainsAll(debugCheck, [
    "X-Client-Request-Id",
    "X-Request-Id",
    "category=sales\\.sync",
    "IsAcceptedAckStatus",
    "sensitive value may be logged directly",
  ]);
});
