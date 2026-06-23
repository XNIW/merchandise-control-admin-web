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

test("TASK-081 Admin Web sales sync stays strict, idempotent and ledger-backed", () => {
  const salesSync = readProjectFile("src/server/pos-auth/sales-sync.ts");
  const saleDetailRoute = readProjectFile(
    "src/app/api/shop/pos/revenue/sale-detail/route.ts",
  );
  const readModel = readProjectFile("src/server/shop-admin/pos-revenue-read-model.ts");
  const packageJson = readProjectFile("package.json");
  const e2eSpec = readProjectFile("tests/e2e/task-081-pos-revenue-e2e.spec.ts");
  const migration = readProjectFile(
    "supabase/migrations/20260622213000_task_081_pos_revenue_stock_sync.sql",
  );

  for (const required of [
    "enumValueOrNull",
    "function parseSchemaVersion(input: Record<string, unknown>): PosSalesSchemaVersion | null",
    "return value === \"pos-sales-ledger-v2\" ? \"pos-sales-ledger-v2\" : null",
    ".map((payment, index) => parsePayment(payment, index, strict))",
    "businessKind === \"void\" ? \"voided\" : parseFiscalStatus(fiscal, strict)",
    "duplicateSaleIdByClientId",
    "duplicateStockRepair",
    "code: \"success\"",
    "reason: \"stock_movement_rpc_failed\"",
    "reason: \"stock_sale_line_missing\"",
    "stockApplication.stockMovementSaleCount",
  ]) {
    assertContains(salesSync, required);
  }

  assert.doesNotMatch(salesSync, /code:\s*"duplicate"/);
  assert.doesNotMatch(salesSync, /posSaleId:\s*null/);
  assert.match(
    salesSync,
    /line\.lineType === "tax"[\s\S]*sale\.businessKind === "sale" \? Math\.abs\(amount\) : -Math\.abs\(amount\)/,
  );

  assertContains(saleDetailRoute, '.from("pos_revenue_ledger_entries")');
  assertContains(saleDetailRoute, "lineTotalClp = numberValue(line.amount_clp)");
  assert.doesNotMatch(saleDetailRoute, /\.from\("pos_sale_lines"\)/);

  assert.match(
    readModel,
    /\.from\("pos_sales"\)[\s\S]*\.eq\("shop_id", selectedShop\.shopId\)[\s\S]*\.eq\("status", "accepted"\)[\s\S]*\.order\("occurred_at"/,
  );
  assertContains(
    readModel,
    '.in("status", ["unresolved_product", "stock_conflict", "failed"])',
    "stock warning movements are filtered server-side",
  );

  assertContains(packageJson, '"test:task081:e2e"');
  assertContains(packageJson, "tests/e2e/task-081-pos-revenue-e2e.spec.ts");

  for (const required of [
    "firstLogin(request, dataset)",
    'request.post("/api/pos/sales/sync"',
    'expect(duplicate.batch.status).toBe("duplicate")',
    "conflictPayload",
    "postRawSales",
    "stock_conflict",
    "loginShopAdmin(page, dataset)",
    "verifyRevenueApi(page, dataset)",
    "verifyRevenueUi(page, dataset, \"mobile\")",
    "cleanupSyntheticDataset",
  ]) {
    assertContains(e2eSpec, required);
  }

  for (const required of [
    "begin;",
    "pos_sale_id uuid not null references public.pos_sales(pos_sale_id) on delete restrict",
    "pos_sales_sync_batch_id uuid not null references public.pos_sales_sync_batches(pos_sales_sync_batch_id) on delete restrict",
    "pos_revenue_ledger_entries_batch_idx",
    "pos_revenue_ledger_entries is append-only",
    "pos_sale_stock_movements is append-only",
    "pg_advisory_xact_lock(hashtextextended(p_movement_key, 0))",
    "source.owner_user_id = product.owner_user_id",
    "source.mapping_state = 'mapped'",
    "commit;",
  ]) {
    assertContains(migration, required);
  }

  assert.doesNotMatch(migration, /on delete cascade/i);
});

test(
  "TASK-081 Win7POS refund and void sync preserve product, redacted payload and failed_blocked retries",
  { skip: !existsSync(win7PosRoot) },
  () => {
    const saleKind = readWin7PosFile("src/Win7POS.Core/Models/SaleKind.cs");
    const refundModels = readWin7PosFile("src/Win7POS.Core/Models/RefundModels.cs");
    const saleRepository = readWin7PosFile(
      "src/Win7POS.Data/Repositories/SaleRepository.cs",
    );
    const productRepository = readWin7PosFile(
      "src/Win7POS.Data/Repositories/ProductRepository.cs",
    );
    const cliProgram = readWin7PosFile("src/Win7POS.Cli/Program.cs");
    const workflow = readWin7PosFile("src/Win7POS.Wpf/Pos/PosWorkflowService.cs");
    const syncService = readWin7PosFile(
      "src/Win7POS.Wpf/Pos/Online/PosSalesSyncService.cs",
    );
    const syncBuilder = readWin7PosFile(
      "src/Win7POS.Data/Online/PosSalesSyncRequestBuilder.cs",
    );

    assertContains(saleKind, "Void = 2");
    assertContains(refundModels, "public long? ProductId { get; set; }");
    assertContains(workflow, "Kind = req.IsFullVoid ? (int)SaleKind.Void : (int)SaleKind.Refund");
    assertContains(workflow, "ProductId = source.ProductId");
    assertContains(workflow, "ProductId = x.ProductId");
    assertContains(saleRepository, "sale.Kind == (int)SaleKind.Refund || sale.Kind == (int)SaleKind.Void");
    assertContains(saleRepository, "void_reverse");
    assertContains(saleRepository, "status = 'failed_blocked'");
    assertContains(productRepository, "JOIN local_stock_movements m ON m.sale_id = o.sale_id");
    assertContains(productRepository, "o.status IN ('pending', 'retry')");
    assertContains(productRepository, "stockQty = stockQtyToWrite");
    assertContains(cliProgram, "--task081-sales-sync-harness");
    assertContains(cliProgram, "--task081-sales-sync-http-harness");
    assertContains(cliProgram, "Catalog pull should preserve local stock while sales sync outbox is pending.");
    assertContains(cliProgram, "TASK-081 sales sync harness: PASS");
    assertContains(syncService, "PosSalesSyncRequestBuilder.BuildAsync");
    assertContains(syncService, "SerializeRedacted(request)");
    assertContains(syncBuilder, "sale.Kind == (int)SaleKind.Void");
    assertContains(syncBuilder, "saleKind =");
    assertContains(syncBuilder, "public static string SerializeRedacted");
    assertContains(syncBuilder, "DeviceToken = null");
    assertContains(syncBuilder, "SessionToken = null");
    assertContains(syncBuilder, "PaidClp = payments.Sum");
    assertContains(syncService, "MaxAttemptsBeforeBlocked = 12");

    assert.doesNotMatch(syncService, /payloadJson\s*=\s*Serialize\(request\)/);
    assert.doesNotMatch(syncBuilder, /payloadJson\s*=\s*Serialize\(request\)/);
    assert.doesNotMatch(saleRepository, /COALESCE\(pdf_printed,\s*0\)\s*=\s*0/);
  },
);
