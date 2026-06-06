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

test("TASK-040 opens one runtime readiness umbrella and folds former follow-ups", () => {
  const taskPath =
    "docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-040/README.md";

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
    "TASK-040",
    "Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation",
    "PARTIAL_PASS_WITH_BLOCKERS",
    "REVIEW_WITH_EXTERNAL_BLOCKERS",
    "FOLDED_INTO_TASK-040",
    "ex TASK-043",
    "ex TASK-044",
    "ex TASK-045",
    "ex TASK-046",
    "TASK-029",
    "TASK-031",
    "TASK-032",
    "TASK-033",
    "TASK-022_023",
    "BLOCKED_LOCAL_SUPABASE_ENV",
    "BLOCKED_SUPABASE_CONTAINER_MISMATCH",
    "BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION",
    "BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE",
    "BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA",
    "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA",
    "No commit eseguito",
    "No push eseguito",
    "No stage finale",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    masterPlan,
    /Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/,
  );
  assert.match(masterPlan, /SUPERSEDED_BY_TASK-041/);
  assert.match(masterPlan, /Stato TASK-039: `DONE`/);
  assert.match(masterPlan, /Fase TASK-039: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Stato TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`/);
  assert.match(masterPlan, /Verdict TASK-040: `PARTIAL_PASS_WITH_BLOCKERS`/);
});

test("TASK-040 records real runtime gates without fake Sales Sync or production staging", () => {
  const task = readProjectFile(
    "docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-040/README.md");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const combined = `${task}\n${evidence}`;

  for (const required of [
    "supabase migration list --local",
    "20260604120000",
    "supabase db lint --local --schema public,app_private --fail-on error",
    "MIGRATION_PENDING_NOT_APPLIED",
    "APPLY_NOT_RUN_BLOCKED_ENV_MISMATCH",
    "Vercel CLI 54.7.1",
    "No deployments found",
    "Win7POS.Wpf ->",
    "Avvisi: 0",
    "Errori: 0",
    "Darwin",
    "wine",
    "mono",
    "qemu-system-x86_64",
    "src/app/api/pos/sales",
    "NOT_FOUND",
    "checkTask040RuntimeReadiness",
  ]) {
    assertContains(combined, required);
  }

  assertContains(scanner, "checkTask040RuntimeReadiness");
  assert.doesNotMatch(
    combined,
    /Sales Sync: `DONE`|Staging: `DONE`|Win7POS E2E: `PASS_LIVE`|Migration Supabase: `APPLIED`/,
  );
  if (
    /Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    )
  ) {
    assert.equal(existsSync(join(root, "src/app/api/pos/sales")), true);
    assert.match(masterPlan, /SUPERSEDED_BY_TASK-041/);
    assert.match(masterPlan, /PASS_SALES_SYNC_FOUNDATION/);
  } else {
    assert.equal(existsSync(join(root, "src/app/api/pos/sales")), false);
  }
});
