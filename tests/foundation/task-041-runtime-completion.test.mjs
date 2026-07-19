import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("TASK-041 supersedes TASK-040 without declaring blocked runtime gates done", () => {
  const taskPath =
    "docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-041/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task}\n${evidence}\n${masterPlan}`;

  for (const required of [
    "TASK-041",
    "Runtime Completion: Supabase, Cloudflare/OpenNext Staging, Sales Sync and Win7POS E2E",
    "PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS",
    "REVIEW_WITH_EXTERNAL_BLOCKERS",
    "TASK-040_SHOULD_REMAIN_REVIEW_WITH_EXTERNAL_BLOCKERS",
    "TASK-040_SUPERSEDED_BY_TASK-041",
    "SUPERSEDED_BY_TASK-041",
    "PASS_SUPABASE_DEV_APPLIED",
    "PASS_CLOUDFLARE_OPENNEXT_PREVIEW",
    "PASS_SALES_SYNC_FOUNDATION",
    "PASS_WITH_MANUAL_WIN7_STEPS",
    "NOT_RUN_PRODUCTION_FORBIDDEN",
    "No dashboard vendite fake",
    "No modello `merchant -> stores`",
    "WIN7POS_REPO_PATH",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`|Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
  assert.match(masterPlan, /Stato TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`/);
  assert.match(masterPlan, /Verdict TASK-040: `PARTIAL_PASS_WITH_BLOCKERS`/);
  assert.doesNotMatch(
    combined,
    /TASK-040_CAN_BE_DONE|Stato TASK-040: `DONE`|Migration Supabase: `APPLIED`|Sales Sync: `DONE`|Win7POS E2E: `PASS_LIVE`/,
  );
});

test("TASK-041 opens only verified runtime implementation gates", () => {
  const task = readProjectFile(
    "docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-041/README.md");
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const devSupabaseCheck = readProjectFile("scripts/dev-supabase-check.mjs");
  const supabaseConfig = readProjectFile("supabase/config.toml");
  const salesRoute = readProjectFile("src/app/api/pos/sales/sync/route.ts");
  const salesService = readProjectFile("src/server/pos-auth/sales-sync.ts");
  const catalogPull = readProjectFile("src/server/pos-auth/catalog-pull.ts");
  const salesMigration = readdirSync(join(root, "supabase/migrations")).find((file) =>
    /task_041_pos_sales_sync_foundation/i.test(file),
  );
  assert.ok(salesMigration, "TASK-041 Sales Sync migration is missing");
  const salesMigrationSource = readProjectFile(`supabase/migrations/${salesMigration}`);
  const atomicSalesMigrationSource = readProjectFile(
    "supabase/migrations/20260717235500_task_137_release_pos_financial_hardening.sql",
  );
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");
  const wranglerConfig = readProjectFile("wrangler.jsonc");
  const openNextConfig = readProjectFile("open-next.config.ts");
  const pkg = JSON.parse(readProjectFile("package.json"));
  const combinedTask041 = `${task}\n${evidence}\n${readProjectFile(
    "tests/foundation/task-041-runtime-completion.test.mjs",
  )}`;

  assertContains(salesRoute, "export const runtime = \"nodejs\"");
  assertContains(salesRoute, "export async function POST");
  assertContains(salesRoute, "MAX_POS_SALES_SYNC_JSON_BODY_BYTES");
  assert.doesNotMatch(salesRoute, /export async function GET|service_role|SUPABASE_SERVICE_ROLE_KEY/i);

  for (const required of [
    "verifyPosSecret",
    "idempotencyKey",
    "payload_hash",
    "MAX_SYNC_SALES = 100",
    "MAX_SYNC_LINES = 1000",
    "hasDuplicateValues",
    "saleTotalsAreConsistent",
    "paymentDirectionsAreConsistent",
    "quantity * unitPrice",
    "businessDateRaw.length > 0",
    "metadata_redacted",
    "duplicate",
    "conflict",
    "atomicSalesRpcResponse",
    "atomicSalesFailureCode",
    "pos_sales_sync_apply_v1",
    "p_sales: parsed.sales as unknown as Json",
    "atomic_sales_rpc_failed",
    "atomic_sales_rpc_rejected",
    "source: \"TASK-088\"",
  ]) {
    assertContains(salesService, required);
  }

  assert.match(
    salesService,
    /const rpcResult = await supabase\.rpc\("pos_sales_sync_apply_v1"/,
  );
  assert.doesNotMatch(
    salesService,
    /\.from\("(?:pos_sales_sync_batches|pos_sales|pos_sale_lines|pos_revenue_ledger_entries)"\)[\s\S]{0,120}\.(?:insert|update|upsert|delete)\(/,
  );
  for (const required of [
    "and session_row.shop_id = p_shop_id",
    "where batch_row.shop_id = p_shop_id",
    "where existing.shop_id = p_shop_id",
    "product_scope_mismatch",
    "insert into public.pos_revenue_ledger_entries (",
    "from public.pos_apply_sale_stock_movement(",
    "exception",
    ") to service_role;",
  ]) {
    assertContains(atomicSalesMigrationSource, required);
  }
  for (const required of [
    "loadCatalogPageV2",
    "expectedRevision",
    "expectedScopeKey",
    "expectedScopeKind",
  ]) {
    assertContains(catalogPull, required);
  }
  const catalogRevision = readProjectFile(
    "src/server/pos-auth/catalog-revision.ts",
  );
  const catalogV2Migration = readProjectFile(
    "supabase/migrations/20260719170600_task_139_pos_catalog_v2_pagination_snapshot.sql",
  );
  assert.match(catalogRevision, /rpc\("pos_catalog_pull_page_v2"/);
  assert.match(
    catalogV2Migration,
    /from public\.inventory_product_prices row[\s\S]*product\.id = row\.product_id[\s\S]*product\.shop_id = p_shop_id[\s\S]*product\.owner_user_id = resolved\.scope_id/,
  );

  for (const required of [
    "create table if not exists public.pos_sales_sync_batches",
    "create table if not exists public.pos_sales",
    "create table if not exists public.pos_sale_lines",
    "force row level security",
    "revoke all on table public.pos_sales from authenticated",
    "pos_sales_idempotency_unique",
    "pos_sales_client_sale_unique",
  ]) {
    assertContains(salesMigrationSource, required);
  }

  assert.doesNotMatch(salesMigrationSource, /sale_payments|payment_methods|receipts/i);
  assertContains(databaseTypes, "pos_sales_sync_batches");
  assertContains(databaseTypes, "pos_sales");
  assertContains(databaseTypes, "pos_sale_lines");

  assert.equal(pkg.devDependencies?.["@opennextjs/cloudflare"], "^1.19.11");
  assert.ok(pkg.devDependencies?.wrangler);
  assertContains(pkg.scripts?.["cf:build"] ?? "", "scripts/cloudflare-build.mjs");
  assertContains(pkg.scripts?.["cf:preview"] ?? "", "opennextjs-cloudflare preview");
  const cloudflareBuildScript = readProjectFile("scripts/cloudflare-build.mjs");
  assertContains(cloudflareBuildScript, "opennextjs-cloudflare");
  assertContains(cloudflareBuildScript, "NextResponse\\.next");
  assertContains(cloudflareBuildScript, "refusing to omit it for Cloudflare build");
  const deployScripts = Object.entries(pkg.scripts ?? {}).filter(([, command]) =>
    /opennextjs-cloudflare deploy|wrangler deploy|--prod/.test(command),
  );
  assert.deepEqual(deployScripts, [
    [
      "cf:deploy:staging",
      "npm run cf:build && npx wrangler deploy --env staging --keep-vars --minify",
    ],
  ]);
  assertContains(wranglerConfig, "nodejs_compat");
  assertContains(wranglerConfig, "merchandise-control-admin-web-staging");
  assertContains(openNextConfig, "defineCloudflareConfig");
  assert.equal(existsSync(join(root, "src/proxy.ts")), true);
  assert.equal(existsSync(join(root, "src/middleware.ts")), false);

  assertContains(scanner, "checkTask041RuntimeCompletion");
  assertContains(devSupabaseCheck, "--mode=");
  assertContains(devSupabaseCheck, "production mode is intentionally unsupported");
  assertContains(devSupabaseCheck, "sb_(?:publishable|secret)");
  assertContains(devSupabaseCheck, "Publishable|Secret|Access Key|Secret Key|URL");
  assertContains(supabaseConfig, 'project_id = "MerchandiseControlSupabase"');

  const forbiddenWin7PosPath = ["/Users", "minxiang", "Projects", "Win7POS"].join("/");
  assert.equal(combinedTask041.includes(forbiddenWin7PosPath), false);
  assert.doesNotMatch(`${task}\n${evidence}`, /^SUPABASE_SERVICE_ROLE_KEY=.+\S/m);
});
