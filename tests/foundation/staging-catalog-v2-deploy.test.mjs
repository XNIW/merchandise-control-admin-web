import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const workflow = readFileSync(
  join(root, ".github/workflows/staging-catalog-v2-deploy.yml"),
  "utf8",
);

test("catalog-v2 staging workflow proves the exact delta before apply", () => {
  assert.match(workflow, /EXPECTED_MIGRATION_VERSION: "20260719170600"/);
  assert.match(workflow, /\(\\d\{8\}\|\\d\{14\}\)/);
  assert.match(workflow, /remoteOnly\.length/);
  assert.match(workflow, /nameMismatches\.length/);
  assert.match(
    workflow,
    /JSON\.stringify\(pending\) !== JSON\.stringify\(expected\)/,
  );
  assert.match(workflow, /db push[\s\S]*--dry-run[\s\S]*--db-url/);
  assert.match(workflow, /if: inputs\.mode == 'apply'/);
  assert.match(workflow, /APPLY_CATALOG_V2_STAGING/);
});

test("catalog-v2 staging workflow excludes destructive migration controls", () => {
  assert.doesNotMatch(workflow, /migration repair/);
  assert.doesNotMatch(workflow, /db reset/);
  assert.doesNotMatch(workflow, /--include-all/);
  assert.doesNotMatch(workflow, /--include-seed/);
  assert.doesNotMatch(workflow, /--include-roles/);
});

test("catalog-v2 staging workflow verifies least privilege and schema objects", () => {
  assert.match(workflow, /serviceRolePageExecute/);
  assert.match(workflow, /anonPageDenied/);
  assert.match(workflow, /authenticatedPageDenied/);
  assert.match(workflow, /shopPriceIndexPresent/);
  assert.match(workflow, /ownerPriceIndexPresent/);
  assert.match(workflow, /priceUpdatedAtNullCount/);
});
