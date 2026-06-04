import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
}

test("TASK-034 governance artifacts record final reconciliation with notes", () => {
  const taskPath = "docs/TASKS/TASK-034-unified-project-progression.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-034/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task}\n${evidence}\n${masterPlan}`;

  for (const required of [
    "TASK-034",
    "Unified project progression",
    "DONE_RECONCILED_WITH_NOTES",
    "FINAL_RECONCILED_WITH_NOTES",
    "DONE_WITH_NOTES",
    "PAUSED_VM_SETUP_REQUIRED",
    "Review DONE-readiness",
    "PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION",
    "PHASE_1_RECONCILIATION_COMPLETE",
    "PHASE_5_SALES_SYNC_PLANNING_COMPLETE",
    "PHASE_6_RESUME_PLAN_READY",
    "SUPABASE_CHECK_PASS_WITH_NOTES",
    "NOT_RUN_NOT_IN_SCOPE",
    "BLOCKED_NO_AUTH_SESSION",
    "REVIEW",
    "TASK-029",
    "TASK-031",
    "TASK-032",
    "TASK-033",
    "Win7POS",
    "sales sync resta `PLANNING_ONLY`",
    "Resume Win7 live E2E gate",
    "shops",
    "POS/Staff",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`/,
  );
  assert.match(task, /Stato: `DONE_RECONCILED_WITH_NOTES`/);
  assert.match(task, /Fase attuale: `DONE_RECONCILED`/);
  assert.doesNotMatch(task, /Fase attuale: `DONE`/);
  assert.doesNotMatch(`${task}\n${evidence}`, /PRODUCTION_READY|production-ready|sales-sync-ready/i);
  assert.doesNotMatch(`${task}\n${evidence}`, /Verdict TASK-034: `PASS_WITH_NOTES_READY_FOR_REVIEW`/);
});

test("TASK-034 sales sync remains planning-only and does not introduce runtime endpoints", () => {
  const planPath = "docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md";

  assert.equal(existsSync(join(root, planPath)), true, `${planPath} is missing`);

  const plan = readProjectFile(planPath);
  const apiRuntimeExists = existsSync(join(root, "src/app/api/pos/sales"));

  for (const required of [
    "idempotency key",
    "offline queue",
    "retry",
    "conflict handling",
    "void/refund",
    "cash/card",
    "device/session binding",
    "staff binding",
    "shop suspension",
    "device revocation",
    "test matrix",
    "roll-out plan",
    "stop condition",
  ]) {
    assertContains(plan, required);
  }

  assert.equal(apiRuntimeExists, false, "TASK-034 must not introduce POS sales runtime routes");
  assert.doesNotMatch(plan, /create table .*pos_sales/i);
  assert.doesNotMatch(plan, /export async function POST/);
});
