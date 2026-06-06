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

test("TASK-035 artifacts define authenticated Shop Admin QA scope and DONE handoff", () => {
  const taskPath =
    "docs/TASKS/TASK-035-authenticated-admin-web-qa-shop-admin-smoke-harness.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-035/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task}\n${evidence}\n${masterPlan}`;

  for (const required of [
    "TASK-035",
    "Authenticated Admin Web QA + Shop Admin smoke harness",
    "DONE",
    "AUTHENTICATED_LOCAL_SMOKE_PASSED",
    "BLOCKED_NO_AUTH_SESSION",
    "DONE_READY",
    "TASK035_*",
    "test:shop-admin-auth-smoke",
    "browser-shop-devices-auth-required.png",
    "browser-shop-overview-authenticated.png",
    "cleanup verificabile",
    "Shop Admin access guard",
    "reason obbligatoria",
    "no cross-shop leak",
    "PASS_VERIFIED_ZERO_RESIDUALS",
    "PUSHED_BY_USER_REQUEST",
    "No secret/PIN/password/token/hash",
    "127.0.0.1:54321",
    "/shop/products",
    "/shop/import-export",
    "/shop/devices",
    "/shop/pos",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`|Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`|Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap`/,
  );
  assert.match(
    masterPlan,
    /Ultimo task completato: `TASK-035|Ultimo task completato: `TASK-036|Ultimo task completato: `TASK-037|Ultimo task completato: `TASK-038|Ultimo task completato: `TASK-039/,
  );
  assert.match(masterPlan, /Stato TASK-034: `DONE_RECONCILED_WITH_NOTES`/);
  assert.match(task, /Stato: `DONE`/);
  assert.match(task, /Fase attuale: `DONE`/);
  assert.match(evidence, /Stato task: `DONE`/);
  assert.match(evidence, /Verdict corrente: `DONE`/);
  assert.match(evidence, /Target Supabase \| `supabase_cloud`/);
  assert.doesNotMatch(`${task}\n${evidence}`, /create table|export async function POST|supabase\/migrations/i);
});

test("TASK-035 exposes a guarded Shop Admin authenticated smoke harness", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const harnessPath = "tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts";

  assert.equal(existsSync(join(root, harnessPath)), true, `${harnessPath} is missing`);
  assert.equal(
    packageJson.scripts["test:shop-admin-auth-smoke"],
    "PLAYWRIGHT_BASE_URL=http://127.0.0.1:3036 PLAYWRIGHT_WEB_SERVER_COMMAND=\"npm run start -- --hostname 127.0.0.1 --port 3036\" PLAYWRIGHT_REUSE_SERVER=0 playwright test tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts --project=chromium-desktop",
  );

  const harness = readProjectFile(harnessPath);

  for (const required of [
    "TASK035_",
    "BLOCKED_NO_AUTH_SESSION",
    "supabaseTargetKind",
    "isLocalSupabaseUrl",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "publishableKey",
    "cleanup",
    "cleanupErrors",
    "BLOCKED_TASK035_CLEANUP_FAILED",
    'credential_status: "active"',
    'status: "active"',
    "staff_web_sessions",
    "staff_role_permissions",
    "shop_admin.full_access",
    "mc_staff_web_session",
    "cashier denial",
    'device_type: "pos"',
    'url.pathname === "/shop"',
    "/shop",
    "/shop/products",
    "/shop/import-export",
    "/shop/devices",
    "/shop/pos",
    "access_token|refresh_token|service_role|credential_hash|password_hash|pin_hash",
    "eyJ[A-Za-z0-9_-]+",
    "body.includes(value)",
    "runtime.publishableKey",
    "runtime.serviceRoleKey",
  ]) {
    assertContains(harness, required);
  }

  assert.doesNotMatch(harness, /TASK014QA_|TASK032_TEST_|SUPABASE_SERVICE_ROLE_KEY\\s*=/i);
  assert.doesNotMatch(harness, /credential_status:\s*"pending_credential"/);
  assert.doesNotMatch(harness, /device_type:\s*"pos_terminal"/);
});
