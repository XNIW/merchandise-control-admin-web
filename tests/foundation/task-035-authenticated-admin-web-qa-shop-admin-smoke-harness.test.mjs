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

test("TASK-035 artifacts define authenticated Shop Admin QA scope and blocked-session handoff", () => {
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
    "REVIEW",
    "AUTH_HARNESS_ADDED_BLOCKED_NO_AUTH_SESSION",
    "BLOCKED_NO_AUTH_SESSION",
    "TASK035_*",
    "test:shop-admin-auth-smoke",
    "browser-shop-devices-auth-required.png",
    "cleanup verificabile",
    "Shop Admin access guard",
    "reason obbligatoria",
    "no cross-shop leak",
    "No secret/PIN/password/token/hash",
    "/shop/products",
    "/shop/import-export",
    "/shop/devices",
    "/shop/pos",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    masterPlan,
    /Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`/,
  );
  assert.match(masterPlan, /Ultimo task completato: `TASK-034/);
  assert.match(masterPlan, /Stato TASK-034: `DONE_RECONCILED_WITH_NOTES`/);
  assert.match(task, /Stato: `REVIEW`/);
  assert.match(task, /Fase attuale: `REVIEW`/);
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
    "/shop",
    "/shop/products",
    "/shop/import-export",
    "/shop/devices",
    "/shop/pos",
    "access[_ -]?token",
    "credential[_ -]?hash",
  ]) {
    assertContains(harness, required);
  }

  assert.doesNotMatch(harness, /TASK014QA_|TASK032_TEST_|SUPABASE_SERVICE_ROLE_KEY\\s*=|access_token|refresh_token/i);
});
