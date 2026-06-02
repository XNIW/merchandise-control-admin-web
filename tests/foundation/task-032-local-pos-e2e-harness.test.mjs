import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const win7PosRoot = "/Users/minxiang/Projects/Win7POS";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

test("TASK-032 local POS harness is scriptable, negative-safe and dataset-gated", () => {
  const scriptPath = "scripts/pos-local-e2e-harness.mjs";

  assert.equal(existsSync(join(root, scriptPath)), true, `${scriptPath} is missing`);

  const script = readProjectFile(scriptPath);
  const packageJson = readProjectFile("package.json");

  for (const required of [
    "/api/pos/auth/first-login",
    "/api/pos/session/heartbeat",
    "/api/pos/catalog/pull",
    "setupSyntheticDataset",
    "runPositiveE2E",
    "cleanupSyntheticDataset",
    "verifyCleanup",
    "redactPositiveResult",
    "text/plain",
    "malformed JSON",
    "oversized body",
    "Cache-Control",
    "no-store",
    "BLOCKED_DATASET_NOT_CONFIGURED",
    "BLOCKED_DATASET_SETUP",
    "PASS_LOCAL_POS_E2E_WITH_CLEANUP",
    "PASS_NEGATIVE_HARNESS_ONLY",
    "TASK032_POS_E2E_ENABLE_POSITIVE",
    "TASK032_POS_E2E_BASE_URL",
    "TASK032_POS_E2E_SHOP_CODE",
    "TASK032_POS_E2E_STAFF_CODE",
    "TASK032_POS_E2E_PIN_OR_PASSWORD",
    "TASK032_POS_E2E_DEVICE_NAME",
    "TASK032_POS_E2E_CLEANUP_CONFIRMED",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assert.match(script, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(packageJson, /"test:pos-local-harness": "node scripts\/pos-local-e2e-harness\.mjs"/);
  assert.doesNotMatch(
    script,
    /sb_secret_|mcpos_(device|session)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+|password\s*=\s*["'][^"']+["']/i,
  );
});

test("TASK-032 local POS harness keeps Win7POS malformed first-login handling in scope", () => {
  assert.equal(existsSync(win7PosRoot), true, "Win7POS repo is missing");

  const bootstrapScanner = readWin7PosFile("scripts/check-pos-online-bootstrap.ps1");

  assert.match(
    bootstrapScanner,
    /bootstrap validates trusted\/session payload before local staff mirror/,
  );
  assert.match(
    bootstrapScanner,
    /bootstrap first-login validation covers required fields/,
  );
});

test("TASK-032 local POS harness redacts URL credentials even on startup failures", () => {
  const result = spawnSync("node", ["scripts/pos-local-e2e-harness.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TASK032_POS_E2E_BASE_URL: "http://operator:redacted-test-credential@127.0.0.1:9",
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(output, /operator:redacted-test-credential/);
  assert.doesNotMatch(output, /redacted-test-credential/);
  assert.match(output, /127\.0\.0\.1/);
});

test("TASK-032 local POS harness evidence remains tied to the active mega-task", () => {
  const task = readProjectFile(
    "docs/TASKS/TASK-032-full-project-progression-mega-task.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-032/README.md");

  assert.match(task, /5 - Local POS E2E harness/);
  assert.match(evidence, /FASE_5_LOCAL_POS_E2E_HARNESS/);
});
