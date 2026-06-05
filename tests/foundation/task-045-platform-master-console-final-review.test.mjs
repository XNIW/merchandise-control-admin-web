import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-045 final review artifacts reconcile Platform tasks without external PASS inflation", () => {
  for (const relativePath of [
    "docs/TASKS/TASK-045-platform-master-console-final-review-done-reconciliation.md",
    "docs/TASKS/EVIDENCE/TASK-045/README.md",
    "tests/e2e/task-045-platform-master-console-final-review.spec.ts",
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(
    "docs/TASKS/TASK-045-platform-master-console-final-review-done-reconciliation.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-045/README.md");
  const e2e = readProjectFile(
    "tests/e2e/task-045-platform-master-console-final-review.spec.ts",
  );
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(`${task}\n${evidence}`, /AUTO_RECONCILED_TASK045/);
  assert.match(`${task}\n${evidence}`, /CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST/);
  assert.match(e2e, /archiveShopThroughOperations/);
  assert.match(e2e, /auditLogsRetained/);
  assert.match(e2e, /BLOCKED_TASK045_REQUIRES_LOCAL_SUPABASE_URL/);
  assert.match(securityChecks, /checkTask045PlatformMasterConsoleFinalReview/);

  assert.match(masterPlan, /Stato TASK-043: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Fase TASK-043: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Stato TASK-044: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Fase TASK-044: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Stato TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`/);
  assert.match(masterPlan, /Stato TASK-042: `READY_FOR_WIN7_MANUAL_TEST`/);

  assert.doesNotMatch(
    `${task}\n${evidence}\n${masterPlan}`,
    /Win7POS live E2E:\s*`PASS`|Sales Sync live:\s*`PASS`|Win7POS E2E:\s*`PASS_LIVE`|Sales Sync:\s*`DONE`/,
  );
});
