import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(
  new URL(
    "../../.github/workflows/task-034-delivery-tracking-staging.yml",
    import.meta.url,
  ),
  "utf8",
);

test("TASK-034 remote tracking smoke is exact-SHA staging-only and rollback-clean", () => {
  assert.match(workflow, /environment: cloudflare-staging/);
  assert.match(workflow, /mainBranch: process\.env\.GITHUB_REF === "refs\/heads\/main"/);
  assert.match(workflow, /process\.env\.GITHUB_SHA === process\.env\.EXPECTED_HEAD_SHA/);
  assert.match(workflow, /allowedProject: allowed\.includes\(ref\)/);
  assert.match(workflow, /urlMatchesProject/);
  assert.match(workflow, /RUN_TASK034_DELIVERY_TRACKING_STAGING/);
  assert.match(workflow, /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.SUPABASE_DB_PASSWORD \}\}/);
  assert.match(
    workflow,
    /test db[\s\S]*--db-url "\$SOURCE_DB_URL"[\s\S]*storefront_delivery_tracking_v1\.sql/,
  );
  assert.match(workflow, /'migrationApplied'/);
  assert.match(workflow, /'fixtureRowsClean'/);
  assert.match(workflow, /rm -f _task034-staging\/source-db-url/);
  assert.doesNotMatch(workflow, /service[_-]?role/i);
});
