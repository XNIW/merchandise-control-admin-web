import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const win7PosRoot = resolve(
  process.env.WIN7POS_REPO_PATH || join(root, "..", "Win7POS"),
);

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("TASK-087 database types include TASK-081 ledger, stock and RPC contract", () => {
  const types = readProjectFile("src/lib/supabase/database.types.ts");
  const salesSync = readProjectFile("src/server/pos-auth/sales-sync.ts");
  const atomicSalesMigration = readProjectFile(
    "supabase/migrations/20260717235500_task_137_release_pos_financial_hardening.sql",
  );

  for (const required of [
    "pos_revenue_ledger_entries",
    "pos_sale_stock_movements",
    "pos_revenue_daily_summary_v",
    "pos_revenue_monthly_summary_v",
    "pos_apply_sale_stock_movement",
    "business_kind: string",
    "source_schema_version: string",
    "stock_sync_status: string",
    "stock_warning_count: number",
    "amount_clp: number | null",
    "local_product_id: string | null",
    "stock_quantity_delta: number",
  ]) {
    assertContains(types, required);
  }

  assert.doesNotMatch(
    salesSync,
    /Array<TablesInsert<"pos_sales"> & Record<string, unknown>>/,
  );
  assert.doesNotMatch(
    salesSync,
    /Array<TablesInsert<"pos_sale_lines"> & Record<string, unknown>>/,
  );
  assert.doesNotMatch(salesSync, /untypedSupabase/);
  assert.match(salesSync, /\.rpc\(\s*"pos_sales_sync_apply_v1"/);
  assertContains(atomicSalesMigration, "from public.pos_apply_sale_stock_movement(");
  assertContains(atomicSalesMigration, "insert into public.pos_revenue_ledger_entries (");
});

test("TASK-087 Admin Web exposes read-only POS Sync Recovery and explicit POS policy", () => {
  const shopPayload = readProjectFile("src/server/pos-auth/shop-payload.ts");
  const posContract = readProjectFile("src/server/pos-auth/pos-contract.ts");
  const firstLogin = readProjectFile("src/server/pos-auth/service.ts");
  const catalogPull = readProjectFile("src/server/pos-auth/catalog-pull.ts");
  const recoveryModel = readProjectFile(
    "src/server/shop-admin/pos-sync-recovery-read-model.ts",
  );
  const recoveryPanel = readProjectFile(
    "src/app/shop/sync/PosSyncRecoveryPanel.tsx",
  );
  const syncPage = readProjectFile("src/app/shop/sync/page.tsx");

  for (const required of [
    "buildPosPolicyPayload",
    "contractVersion: POS_POLICY_CONTRACT_VERSION",
    "offline_first_after_activation",
    "current_staff_only",
    "pendingSalesRetention: \"local_outbox_until_server_ack\"",
    "supportedMethods: POS_SUPPORTED_PAYMENT_METHODS",
  ]) {
    assertContains(shopPayload, required);
  }

  for (const required of [
    'POS_POLICY_CONTRACT_VERSION = "pos-policy-v1"',
    'POS_SALES_SCHEMA_VERSION = "pos-sales-ledger-v2"',
    'POS_CATALOG_SCHEMA_VERSION = 2',
    'POS_SUPPORTED_PAYMENT_METHODS = ["cash", "card", "other"]',
    "credential_material_not_synced",
    "tax_policy_not_configured_online",
  ]) {
    assertContains(posContract, required);
  }

  assertContains(firstLogin, "policy: buildPosPolicyPayload()");
  assertContains(catalogPull, "policy: buildPosPolicyPayload()");

  for (const required of [
    "getShopPosSyncRecoveryReadModel",
    ".from(\"pos_sales_sync_batches\")",
    ".from(\"pos_sales\")",
    ".from(\"pos_sale_stock_movements\")",
    ".from(\"audit_logs\")",
    ".eq(\"shop_id\", selectedShop.shopId)",
    "stringifyRedactedJson",
    "readOnly: true",
  ]) {
    assertContains(recoveryModel, required);
  }

  assertContains(syncPage, "PosSyncRecoveryPanel");
  assertContains(recoveryPanel, "POS Sync Recovery");
  assertContains(recoveryPanel, "View details");
  assertContains(recoveryPanel, "Information unavailable server-side");
  assert.doesNotMatch(recoveryPanel, /Forza sync|Risolvi stock|Cancella errore/);
  assert.doesNotMatch(recoveryModel, /\.(insert|update|delete|upsert|rpc)\(/);
});

test(
  "TASK-087 Win7POS handles policy, blocked sync UX, restore pre-backup and log rotation",
  { skip: !existsSync(win7PosRoot) },
  () => {
    const client = readWin7PosFile("src/Win7POS.Data/Online/PosAdminWebClient.cs");
    const transportContracts = readWin7PosFile(
      "src/Win7POS.Core/Online/PosOnlineTransportContracts.cs",
    );
    const policySnapshot = readWin7PosFile(
      "src/Win7POS.Wpf/Pos/Online/PosOnlinePolicySnapshot.cs",
    );
    const bootstrap = readWin7PosFile(
      "src/Win7POS.Wpf/Pos/Online/PosOnlineBootstrapService.cs",
    );
    const catalog = readWin7PosFile(
      "src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs",
    );
    const syncStatus = readWin7PosFile(
      "src/Win7POS.Wpf/Pos/Online/PosSyncStatusReader.cs",
    );
    const workflow = readWin7PosFile("src/Win7POS.Wpf/Pos/PosWorkflowService.cs");
    const maintenance = readWin7PosFile(
      "src/Win7POS.Wpf/Pos/Dialogs/DbMaintenanceViewModel.cs",
    );
    const logger = readWin7PosFile("src/Win7POS.Wpf/Infrastructure/FileLogger.cs");
    const readme = readWin7PosFile("README.md");
    const checklist = readWin7PosFile("docs/WIN7_PRODUCTION_SMOKE_CHECKLIST.md");

    for (const required of [
      "public sealed class PosPolicyResponse",
      'DataMember(Name = "policy", EmitDefaultValue = false)',
      "PosPaymentPolicyResponse",
      "PosTaxPolicyResponse",
      "PosStaffPolicyResponse",
    ]) {
      assertContains(transportContracts, required);
    }

    assertContains(policySnapshot, "pos.policy.contract_version");
    assertContains(policySnapshot, "transfer_payment_not_supported_by_win7pos");
    assertContains(bootstrap, "PosOnlinePolicySnapshot.SaveAsync(_factory, response.Policy)");
    assertContains(catalog, "PosOnlinePolicySnapshot.SaveAsync(_factory, response?.Policy)");
    assertContains(syncStatus, "T(\"sync.requiresAttention\")");
    assertContains(syncStatus, "T(\"sync.blockedSales\")");
    assertContains(syncStatus, "pos.restore.needs_sync_review");
    assertContains(syncStatus, "T(\"sync.policyPos\")");

    for (const required of [
      "public async Task<DbRestoreResult> RestoreDbAsync",
      "CreateDbBackupNoLockAsync(\"pos_pre_restore_\")",
      "KeyRestoreNeedsSyncReview",
      "IntegrityCheckAsync",
      "syncReview",
    ]) {
      assertContains(workflow, required);
    }

    assertContains(maintenance, "PosLocalization.F(\"dbMaintenance.preRestoreBackup\"");
    assertContains(maintenance, "PosLocalization.T(\"dbMaintenance.restoreSyncReview\")");
    assertContains(workflow, "HasUnresolvedSalesSyncOutboxAsync");
    assertContains(workflow, "PosLocalization.T(\"dbMaintenance.restoreBlockedUnresolvedSales\")");
    assertContains(logger, "MaxLogBytes");
    assertContains(logger, "RotateIfNeeded");
    assertContains(logger, "RetainedLogFiles = 5");
    assertContains(readme, "Admin Web invia anche una `policy` POS versionata");
    assertContains(readme, "pre-backup `pos_pre_restore_yyyyMMdd_HHmmss.db`");
    assertContains(checklist, "Hardware verification remains `EXTERNAL_NOT_RUN`");

    assert.doesNotMatch(`${client}\n${transportContracts}`, /pinHash|passwordHash|credentialHash/);
    assert.doesNotMatch(policySnapshot, /PIN|password|token/i);
  },
);
