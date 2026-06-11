import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("TASK-042 opens the TASK-041 review and Win7POS physical bridge without DONE claims", () => {
  const taskPath =
    "docs/TASKS/TASK-042-task-041-review-ci-retry-win7pos-physical-e2e-bridge.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-042/README.md";
  const parityReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-parity-diagnosis.md";
  const compareSummaryPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-summary.md";
  const compareCsvPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-files.csv";
  const missingReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/missing-from-codex.md";
  const extraReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/extra-in-codex.md";
  const differentReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/different-hashes.md";
  const compareScriptPath = "scripts/win7pos/compare-build-folders.sh";
  const fetchScriptPath =
    "scripts/win7pos/fetch-github-release-pack-to-bridge.sh";
  const adminWebRunbookPath =
    "docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    adminWebRunbookPath,
    parityReportPath,
    compareSummaryPath,
    compareCsvPath,
    missingReportPath,
    extraReportPath,
    differentReportPath,
    compareScriptPath,
    fetchScriptPath,
  ]) {
    assert.equal(
      existsSync(join(root, requiredPath)),
      true,
      `${requiredPath} is missing`,
    );
  }

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const parityReport = readProjectFile(parityReportPath);
  const compareSummary = readProjectFile(compareSummaryPath);
  const compareCsv = readProjectFile(compareCsvPath);
  const compareScript = readProjectFile(compareScriptPath);
  const fetchScript = readProjectFile(fetchScriptPath);
  const adminWebRunbook = readProjectFile(adminWebRunbookPath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task}\n${evidence}\n${adminWebRunbook}\n${parityReport}\n${compareSummary}\n${compareCsv}\n${masterPlan}`;

  for (const required of [
    "TASK-042",
    "TASK-041 Review, CI retry and Win7POS physical E2E bridge",
    "READY_FOR_WIN7_MANUAL_TEST",
    "TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS",
    "TASK-040_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS_SUPERSEDED_BY_TASK-041",
    "CI_GITHUB_ACTIONS_GREEN",
    "26983953492",
    "WIN7POS_REPO_PATH",
    "REQUIRE_WIN7POS_REPO",
    "SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE",
    "Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038",
    "RUNBOOK-WIN7POS-PHYSICAL-SMOKE.md",
    "EXPECTED-RESULTS.md",
    "MANUAL-RESULT-TEMPLATE.md",
    "TROUBLESHOOTING-WIN7.md",
    "No commit eseguito",
    "No push eseguito",
    "No stage finale",
    "TASK-042B",
    "Win7POS Build Parity Diagnosis",
    "TASK-042B-build-compare",
    "Win7POS-ReleasePack-x86",
    "26795001032",
    "e_sqlite3.dll",
    "TASK-042B-github-release-pack-20260604-223656",
    "fetch-github-release-pack-to-bridge.sh",
    "compare-build-folders.sh",
    "containsESqlite3Dll",
    "TASK-042C",
    "ADMIN-WEB-MANUAL-TEST-RUNBOOK.md",
    "PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES",
    "WIN7POS_PRODUCT_DIALOG_FIX_READY_FOR_PHYSICAL_RETEST",
    "PASS_LAUNCHES_ON_WIN7",
    "PASS_LOCAL_OPERATOR_LOGIN",
    "PASS_MENU_UI",
    "PASS_LOCAL_CART_BASIC",
    "PASS_LOCAL_PRODUCT_CREATE",
    "PASS_LOCAL_DISCOUNT",
    "PASS_LOCAL_QTY_EDIT",
    "PASS_LOCAL_PAYMENT_SCREEN_OPEN",
    "PASS_LOCAL_REGISTER_OPEN",
    "NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING",
    "NOT_RUN_POS_ONLINE_CONNECTION_PENDING",
    "NOT_RUN_SALES_SYNC_LIVE_PENDING",
    "ProductEditDialog",
    "ProductEditViewModel",
    "ProductRepository",
    "check-product-dialog-free-text.ps1",
    "PHYSICAL_TEST_REQUIRES_GITHUB_RELEASE_ARTIFACT_AFTER_COMMIT",
    "Win7POSBridge\\outbox\\TASK-042B-github-release-pack-20260604-223656\\app",
  ]) {
    assertContains(combined, required);
  }

  for (const required of [
    "npm run dev -- --hostname 127.0.0.1 --port 3000",
    "npm run dev:tunnel",
    "npm run dev:db:check",
    "npm run supabase:bootstrap-platform-admin",
    "/platform/provisioning",
    "/shop/staff",
    "/shop/pos",
    "TASK042_*",
    "shop_code",
    "staff_code",
    "credential one-time",
    "Win7POSBridge\\outbox\\TASK-042B-github-release-pack-20260604-223656\\app",
  ]) {
    assertContains(adminWebRunbook, required);
  }

  for (const required of [
    "--bad <path>",
    "--good <path>",
    "--out <path>",
    "build-compare-files.csv",
  ]) {
    assertContains(compareScript, required);
  }

  for (const required of [
    "gh auth status",
    "gh run list",
    "gh run download",
    "Win7POS-ReleasePack-x86",
    "TASK-042B-github-release-pack",
    "containsESqlite3Dll",
  ]) {
    assertContains(fetchScript, required);
  }

  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`/,
  );
  assert.match(masterPlan, /Stato TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`/);
  assert.match(masterPlan, /Stato TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`/);
  assert.doesNotMatch(
    `${task}\n${evidence}`,
    /Stato:\s*`DONE`|Verdict finale:\s*`DONE`|Win7POS live E2E:\s*`PASS`|Sales Sync live:\s*`PASS`/,
  );
  assert.doesNotMatch(
    `${compareScript}\n${fetchScript}`,
    /GH_TOKEN|GITHUB_TOKEN|ghp_|github_pat_/,
  );
});

test("TASK-042 security scanner locks the review bridge gate", () => {
  const scanner = readProjectFile("scripts/security-checks.mjs");

  assert.match(scanner, /checkTask042ReviewCiWin7PosBridge/);
  assert.match(scanner, /checkTask042ReviewCiWin7PosBridge\(\)/);
  assert.match(scanner, /TASK-042/);
  assert.match(scanner, /READY_FOR_WIN7_MANUAL_TEST/);
  assert.match(scanner, /NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING/);
  assert.match(scanner, /NOT_RUN_POS_ONLINE_CONNECTION_PENDING/);
  assert.match(scanner, /NOT_RUN_SALES_SYNC_LIVE_PENDING/);
});
