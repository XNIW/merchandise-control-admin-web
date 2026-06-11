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

test("TASK-033 governance artifacts exist and gate the mega-task without DONE claims", () => {
  const taskPath =
    "docs/TASKS/TASK-033-controlled-task-032-review-https-pos-sales.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-033/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task}\n${evidence}\n${masterPlan}`;

  for (const required of [
    "TASK-033",
    "codex/task-033-https-pos-sales-mega-task",
    "Controlled TASK-032 review",
    "HTTPS non-production",
    "Win7POS live E2E",
    "POS reconciliation",
    "sales sync planning",
    "sales sync foundation",
    "TASK-029",
    "TASK-031",
    "TASK-022_023",
    "TASK-024",
    "Win7POS deve comunicare solo con Admin Web POS API",
    "Vercel resta parcheggiato",
    "git.deploymentEnabled=false",
    "shops",
    "shop_id",
    "shop_code",
    "REVIEW_WITH_BLOCKERS",
    "BLOCKED_",
  ]) {
    assertContains(combined, required);
  }

  assert.match(masterPlan, /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`|Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`/);
  assert.match(task, /Stato: `(EXECUTION|REVIEW|REVIEW_WITH_BLOCKERS|REVIEW_WITH_EXTERNAL_BLOCKERS|BLOCKED_[A-Z0-9_]+)`/);
  assert.match(task, /Fase attuale: `(EXECUTION|REVIEW|REVIEW_WITH_BLOCKERS|REVIEW_WITH_EXTERNAL_BLOCKERS|BLOCKED_[A-Z0-9_]+)`/);
  assert.match(task, /DONE` resta decisione dell'utente/);
  assert.doesNotMatch(task, /Stato: `DONE`/);
  assert.doesNotMatch(task, /Fase attuale: `DONE`/);
});

test("TASK-033 evidence records real gates or explicit blockers for HTTPS, POS and sales sync", () => {
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-033/README.md");

  for (const required of [
    "Baseline Admin Web",
    "TASK-032 merge/review",
    "Endpoint HTTPS non-production reale",
    "Admin Web POS API smoke HTTPS",
    "Win7POS live E2E",
    "Dashboard POS Shop Admin",
    "TASK-029 reconciliation",
    "TASK-022_023 reconciliation",
    "Sales sync planning",
    "Sales sync foundation",
    "Dashboard vendite Shop Admin",
  ]) {
    assertContains(evidence, required);
  }

  assert.match(evidence, /`(PASS|PASS_WITH_NOTES|BLOCKED_[A-Z0-9_]+|NOT_RUN_[A-Z0-9_]+|DEFERRED_[A-Z0-9_]+)`/);
  assert.doesNotMatch(evidence, /PASS_INVENTED|E2E passed|sales-sync-ready|staging-ready|production-ready/i);
});

test("TASK-033 security scanner permits only the explicit active task and keeps POS/catalog gates recognized", () => {
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  assert.match(scanner, /TASK-033 - Controlled TASK-032 review/);
  assert.match(scanner, /TASK-033/);
  assert.match(masterPlan, /Verdict TASK-033:/);
  assert.match(masterPlan, /Prossima azione consigliata:/);
});

test("TASK-033 POS harness can opt into approved HTTPS non-production tunnels without Vercel", () => {
  const harness = readProjectFile("scripts/pos-local-e2e-harness.mjs");

  for (const required of [
    "TASK033_POS_E2E_ALLOW_HTTPS_NON_PRODUCTION",
    "isHttpsNonProductionUrl",
    "loca.lt",
    "trycloudflare.com",
    "ngrok",
    "localhost.run",
    "vercel.app",
  ]) {
    assertContains(harness, required);
  }

  assert.match(harness, /Admin Web base URL must be localhost or 127\.0\.0\.1 unless TASK033/);
  assert.match(harness, /protocol !== "https:"/);
  assert.match(harness, /hostname\.endsWith\("vercel\.app"\)/);
});

test("TASK-033 sales sync planning is complete but blocks foundation until live Win7POS is executable", () => {
  const planPath = "docs/TASKS/EVIDENCE/TASK-033/sales-sync-planning.md";

  assert.equal(existsSync(join(root, planPath)), true, `${planPath} is missing`);

  const plan = readProjectFile(planPath);
  const task = readProjectFile(
    "docs/TASKS/TASK-033-controlled-task-032-review-https-pos-sales.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-033/README.md");

  for (const required of [
    "pos_sales",
    "pos_sale_lines",
    "pos_sale_payments",
    "pos_sales_sync_batches",
    "POST /api/pos/sales/sync",
    "idempotencyKey",
    "clientSaleId",
    "offline queue",
    "at-least-once",
    "exactly-once persistence",
    "Win7POS net48 WPF",
    "BLOCKED_WIN7POS_RUNTIME_UNAVAILABLE",
    "SALES_SYNC_PLANNED_ONLY",
  ]) {
    assertContains(`${plan}\n${task}\n${evidence}`, required);
  }

  assert.doesNotMatch(plan, /create table .*pos_sales/i);
  assert.doesNotMatch(plan, /export async function POST/);
});
