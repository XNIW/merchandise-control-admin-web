import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const workflowPath =
  ".github/workflows/admin-live-product-revision-conflict-staging.yml";
const harnessPath =
  "tests/e2e/staging/admin-live-product-revision-conflict.spec.ts";

test("live revision workflow is manual, staging-only and exact-SHA guarded", () => {
  const workflow = read(workflowPath);
  const triggerBlock = workflow.slice(
    workflow.indexOf("on:"),
    workflow.indexOf("permissions:"),
  );

  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock, /\b(?:push|pull_request|schedule):/);
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /process\.env\.GITHUB_REF === "refs\/heads\/main"/);
  assert.match(workflow, /process\.env\.GITHUB_ACTOR === "XNIW"/);
  assert.match(workflow, /process\.env\.GITHUB_TRIGGERING_ACTOR === "XNIW"/);
  assert.match(workflow, /process\.env\.REQUESTED_COMMIT_SHA === process\.env\.GITHUB_SHA/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /RUN_ADMIN_REVISION_CONFLICT_STAGING/);
  assert.match(workflow, /jpgoimipbothfgkokyvm/);
  assert.match(
    workflow,
    /https:\/\/jpgoimipbothfgkokyvm\.supabase\.co/,
  );
  assert.match(
    workflow,
    /https:\/\/merchandise-control-admin-web-staging\.merchandise-control-admin-web\.workers\.dev/,
  );
  assert.match(workflow, /\$\{\{ vars\.ALLOWED_STAGING_SUPABASE_PROJECT_REFS \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /environment: cloudflare-production/);
  assert.doesNotMatch(workflow, /\b(?:supabase db push|migration up|wrangler deploy)\b/);
});

test("live revision workflow proves deployed commit and preserves redacted evidence", () => {
  const workflow = read(workflowPath);
  const deployWorkflow = read(".github/workflows/cloudflare.yml");

  assert.match(
    deployWorkflow,
    /wrangler deploy --env staging --keep-vars --minify[\s\\]*--tag "\$GITHUB_SHA"[\s\\]*--message "github-sha:\$GITHUB_SHA"/,
  );
  assert.match(workflow, /wrangler deployments status --env staging --json/);
  assert.match(workflow, /wrangler", "versions", "view"/);
  assert.match(workflow, /version\?\.annotations\?\.\["workers\/tag"\]/);
  assert.match(workflow, /tag !== process\.env\.GITHUB_SHA/);
  assert.match(workflow, /singleVersionAtFullTraffic: true/);
  assert.match(workflow, /deploymentUnchanged: exact/);
  assert.match(workflow, /schema_migrations/);
  assert.match(workflow, /20260812010000/);
  assert.match(workflow, /shop_catalog_update_product_if_revision_with_sync/);
  assert.match(workflow, /staff_web_catalog_update_product_if_revision_v1/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(
    workflow,
    /path: test-results\/admin-live-product-revision-conflict\/summary\.json/,
  );
  assert.doesNotMatch(workflow, /path:[^\n]*(?:playwright-report|\.admin-revision)/);
});

test("live harness exercises two deployed UI sessions for owner and staff", () => {
  const harness = read(harnessPath);

  assert.equal((harness.match(/input\.browser\.newContext\(/g) ?? []).length, 2);
  assert.match(harness, /signIn: signInOwner/);
  assert.match(harness, /signIn: signInStaff/);
  assert.match(harness, /mode=shop-code/);
  assert.match(harness, /getByLabel\("Product name"\)/);
  assert.match(harness, /input\[name="expectedUpdatedAt"\]/);
  assert.match(harness, /A newer product version is available/);
  assert.match(harness, /Reload server version/);
  assert.match(harness, /draftAPreservedAfterConflict = true/);
  assert.match(harness, /serverPreservedB = true/);
  assert.match(harness, /successfulSyncEvents = 1/);
  assert.match(harness, /duplicateSyncEvents = 0/);
  assert.match(harness, /staleRevisionAuditRows = 1/);
  assert.match(harness, /event\.entity_ids @> jsonb_build_object/);
  assert.match(harness, /shop\.catalog\.product\.update\.stale_revision/);
});

test("fixture cleanup is bounded, idempotent and retains an immutable audit snapshot", () => {
  const harness = read(harnessPath);

  assert.match(harness, /qa\.admin\.revision_conflict\.cleanup\.snapshot/);
  assert.match(harness, /'audit_snapshot'/);
  assert.match(
    harness,
    /set_config\('app\.platform_allow_test_audit_delete', 'on', true\)/,
  );
  assert.match(harness, /and not exists \(select 1 from public\.audit_logs snapshot/);
  assert.match(harness, /where shop_id = \$\{shopId\} and owner_user_id = \$\{ownerId\} and id in/);
  assert.match(harness, /where staff_id = \$\{staffId\} and shop_id = \$\{shopId\}/);
  assert.match(harness, /where shop_member_id = \$\{sqlUuid/);
  assert.match(harness, /mutableResidualRows !== 0/);
  assert.match(harness, /auditSnapshotRows !== 1/);
  assert.match(harness, /information_schema\.columns column_row/);
  assert.match(harness, /where shop_id = \$1/);
  assert.doesNotMatch(harness, /disable trigger|truncate\s+table/i);
  assert.doesNotMatch(harness, /\.(?:like|ilike)\(/);
  assert.doesNotMatch(harness, /delete from [^;]+\blike\b/i);
});

test("package exposes the single-worker canonical staging harness", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    packageJson.scripts["test:admin-revision-conflict:staging"],
    "node scripts/testing/run-playwright-target.mjs staging tests/e2e/staging/admin-live-product-revision-conflict.spec.ts --project=chromium-desktop --workers=1",
  );
});

test("SQL fixture values use stdin and process failures stay redacted", () => {
  const harness = read(harnessPath);
  const start = harness.indexOf("function runSql(");
  const end = harness.indexOf("\nfunction runJson<", start);
  assert.ok(start >= 0 && end > start);
  const source = harness
    .slice(start, end)
    .replace("label: string, sql: string", "label, sql");
  const fixtureSql = "select 'SYNTHETIC_CREDENTIAL_HASH_FIXTURE';";
  const calls = [];
  let fail = false;
  const runSql = runInNewContext(`(${source})`, {
    execFileSync(command, args, options) {
      calls.push({ command, args, options });
      if (fail) throw new Error(fixtureSql);
      return "  verified\n";
    },
    process: { env: {} },
  });

  assert.equal(runSql("FIXTURE", fixtureSql), "verified");
  assert.equal(calls[0].command, "psql");
  assert.equal(JSON.stringify(calls[0].args),
    JSON.stringify(["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"]));
  assert.ok(!calls[0].args.includes(fixtureSql));
  assert.equal(calls[0].options.input, fixtureSql);
  assert.equal(JSON.stringify(calls[0].options.stdio),
    JSON.stringify(["pipe", "pipe", "ignore"]));

  fail = true;
  assert.throws(() => runSql("FIXTURE", fixtureSql), {
    message: "ADMIN_REVISION_FIXTURE_FAILED",
  });
  assert.throws(() => runSql("EMPTY", "  "), {
    message: "ADMIN_REVISION_EMPTY_SQL_INVALID",
  });
  assert.equal(calls.length, 2);
});
