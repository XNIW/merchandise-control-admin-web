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
    /Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`/,
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
  const salesMigration = readdirSync(join(root, "supabase/migrations")).find((file) =>
    /task_041_pos_sales_sync_foundation/i.test(file),
  );
  assert.ok(salesMigration, "TASK-041 Sales Sync migration is missing");
  const salesMigrationSource = readProjectFile(`supabase/migrations/${salesMigration}`);
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
    "cleanupPosSalesBatch",
    "quantity * unitPrice",
    "businessDateRaw.length > 0",
    "metadata_redacted",
    "duplicate",
    "conflict",
    "cleanup_ok",
    "source: \"TASK-041\"",
  ]) {
    assertContains(salesService, required);
  }

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
  assertContains(pkg.scripts?.["cf:build"] ?? "", "opennextjs-cloudflare build");
  assertContains(pkg.scripts?.["cf:preview"] ?? "", "opennextjs-cloudflare preview");
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /opennextjs-cloudflare deploy|wrangler deploy|--prod/);
  assertContains(wranglerConfig, "nodejs_compat");
  assertContains(wranglerConfig, "merchandise-control-admin-web-staging");
  assertContains(openNextConfig, "defineCloudflareConfig");
  assert.equal(existsSync(join(root, "src/proxy.ts")), false);
  assert.equal(existsSync(join(root, "src/middleware.ts")), true);

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
