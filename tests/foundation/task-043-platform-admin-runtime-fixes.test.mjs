import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-043 keeps optional staff safe read failures from blocking Platform core pages", () => {
  const readModel = readProjectFile("src/server/platform-admin/read-model.ts");

  assert.match(readModel, /staff_accounts_safe/);
  assert.doesNotMatch(
    readModel,
    /const firstError = \[[\s\S]*staffResult\.error[\s\S]*\]\.find\(Boolean\)/,
  );
  assert.match(readModel, /readIssues|optionalIssues|diagnostics/i);
  assert.match(readModel, /staff_schema_status[\s\S]*BLOCKED|BLOCKED[\s\S]*staff_schema_status/);
});

test("TASK-043 Platform shell exposes a visible safe logout control", () => {
  const appShell = readProjectFile("src/components/platform/AppShell.tsx");
  const logoutRoute = readProjectFile("src/app/auth/logout/route.ts");

  assert.match(appShell, /action="\/auth\/logout"/);
  assert.match(appShell, /method="get"/);
  assert.match(appShell, /type="submit"/);
  assert.match(appShell, />\s*Logout\s*</);
  assert.match(logoutRoute, /signOut\(\)/);
  assert.match(logoutRoute, /NextResponse\.redirect/);
});

test("TASK-043 provisioning unavailable state stays specific and non-generic", () => {
  const provisioningPage = readProjectFile("src/app/platform/provisioning/page.tsx");

  assert.doesNotMatch(
    provisioningPage,
    /A valid Platform Admin server session is required before provisioning can run\./,
  );
  assert.match(provisioningPage, /readModel\.reason/);
});

test("TASK-043 runtime evidence and task tracking artifacts exist", () => {
  for (const relativePath of [
    "docs/TASKS/TASK-043-platform-admin-runtime-fixes.md",
    "docs/TASKS/EVIDENCE/TASK-043/README.md",
    "docs/TASKS/TASK-045-platform-master-console-final-review-done-reconciliation.md",
    "docs/TASKS/EVIDENCE/TASK-045/README.md",
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile("docs/TASKS/TASK-043-platform-admin-runtime-fixes.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-043/README.md");

  assert.match(masterPlan, /Stato TASK-043: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Fase TASK-043: `DONE_RECONCILED`/);
  assert.match(`${task}\n${evidence}`, /AUTO_RECONCILED_TASK045/);
  assert.match(`${task}\n${evidence}`, /CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST/);
});
