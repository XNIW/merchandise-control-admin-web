import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const defaultWin7PosRoot = "/Users/minxiang/Projects/Win7POS";
const win7PosRoot =
  process.env.WIN7POS_REPO_PATH?.trim() || defaultWin7PosRoot;
const requireWin7PosRepo = process.env.REQUIRE_WIN7POS_REPO === "1";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWin7PosFile(relativePath) {
  return readFileSync(join(win7PosRoot, relativePath), "utf8");
}

function shouldSkipMissingWin7PosRepo() {
  return !existsSync(win7PosRoot) && !requireWin7PosRepo;
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
    "PASS_STAGING_POS_E2E_WITH_CLEANUP",
    "PASS_NEGATIVE_HARNESS_ONLY",
    "TASK032_POS_E2E_ENABLE_POSITIVE",
    "TASK032_POS_E2E_BASE_URL",
    "TASK032_POS_E2E_ALLOW_DATASET_SETUP",
    "TASK032_POS_E2E_ALLOW_CLEANUP",
    "TASK032_POS_E2E_TEST_RUN_ID",
    "TASK032_POS_E2E_SHOP_CODE",
    "TASK032_POS_E2E_STAFF_CODE",
    "TASK032_POS_E2E_PIN_OR_PASSWORD",
    "TASK032_POS_E2E_DEVICE_NAME",
    "TASK032_POS_E2E_ALLOW_STAGING",
    "TASK032_POS_E2E_STAGING_DRY_RUN",
    "TASK032_POS_E2E_STAGING_HOST_ALLOWLIST",
    "TASK032_POS_E2E_STAGING_PROJECT_REF",
    "TASK032_POS_E2E_REQUIRE_STAGING_TARGET",
    "TASK032_POS_E2E_REQUIRE_TEST_MARKER",
    "Staging POS E2E requires an allowlisted non-local staging Admin Web and Supabase target",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "/api/pos/sales/sync",
    "schemaVersion",
    "pos-sales-ledger-v2",
    "duplicateSaleCount",
    "stockQuantityAfterDuplicate",
  ]) {
    assert.match(script, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(packageJson, /"test:pos-local-harness": "node scripts\/pos-local-e2e-harness\.mjs"/);
  assert.doesNotMatch(
    script,
    /sb_secret_|mcpos_(device|session)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+|password\s*=\s*["'][^"']+["']/i,
  );
});

test("TASK-032 local POS harness keeps Win7POS malformed first-login handling in scope", (t) => {
  if (shouldSkipMissingWin7PosRepo()) {
    t.skip("SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE: Win7POS repo is not available");
    return;
  }

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

test("TASK-032 staging POS harness dry-run is allowlisted and data-safe", () => {
  const result = spawnSync("node", ["scripts/pos-local-e2e-harness.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      TASK032_POS_E2E_ALLOW_CLEANUP: "yes",
      TASK032_POS_E2E_ALLOW_DATASET_SETUP: "yes",
      TASK032_POS_E2E_ALLOW_STAGING: "yes",
      TASK032_POS_E2E_BASE_URL: "https://pos-staging.example.test",
      TASK032_POS_E2E_ENABLE_POSITIVE: "yes",
      TASK032_POS_E2E_REQUIRE_TEST_MARKER: "TASK032",
      TASK032_POS_E2E_STAGING_DRY_RUN: "yes",
      TASK032_POS_E2E_STAGING_HOST_ALLOWLIST: "pos-staging.example.test",
      TASK032_POS_E2E_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
      TASK032_POS_E2E_TEST_RUN_ID: "STAGE01",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.status, "PASS_STAGING_PRECHECK_DRY_RUN");
  assert.equal(parsed.stagingPrecheck.wouldCreateData, false);
  assert.equal(parsed.stagingPrecheck.wouldSendSales, false);
  assert.equal(parsed.stagingPrecheck.cleanup.truncate, false);
  assert.equal(parsed.stagingPrecheck.dataset.marker, "TASK032");
  assert.match(
    parsed.stagingPrecheck.dataset.shopCodePrefix,
    /^TASK032_TEST_SHOP_STAGE01/,
  );
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|mcpos_/);
});

test("TASK-032 staging POS harness fails closed without explicit staging allowlist", () => {
  const result = spawnSync("node", ["scripts/pos-local-e2e-harness.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      TASK032_POS_E2E_ALLOW_CLEANUP: "yes",
      TASK032_POS_E2E_ALLOW_DATASET_SETUP: "yes",
      TASK032_POS_E2E_BASE_URL: "https://pos-staging.example.test",
      TASK032_POS_E2E_ENABLE_POSITIVE: "yes",
      TASK032_POS_E2E_REQUIRE_TEST_MARKER: "TASK032",
      TASK032_POS_E2E_STAGING_DRY_RUN: "yes",
      TASK032_POS_E2E_STAGING_HOST_ALLOWLIST: "pos-staging.example.test",
      TASK032_POS_E2E_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
      TASK032_POS_E2E_TEST_RUN_ID: "STAGE01",
    },
  });

  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "BLOCKED_DATASET_SETUP");
  assert.match(
    parsed.stagingPrecheck.missing.join(","),
    /TASK032_POS_E2E_ALLOW_STAGING/,
  );
});

test("TASK-032 staging POS harness command requires explicit non-local staging target", () => {
  const packageJson = readProjectFile("package.json");
  const result = spawnSync("npm", ["run", "test:pos-staging-harness"], {
    cwd: root,
    encoding: "utf8",
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.match(
    packageJson,
    /TASK032_POS_E2E_REQUIRE_STAGING_TARGET=yes/,
  );
  assert.notEqual(result.status, 0);
  assert.match(output, /TASK032_POS_E2E_BASE_URL/);
  assert.match(output, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(output, /SUPABASE_SERVICE_ROLE_KEY=.*[A-Za-z0-9]/);
});

test("TASK-032 local POS harness evidence remains tied to the active mega-task", () => {
  const task = readProjectFile(
    "docs/TASKS/TASK-032-full-project-progression-mega-task.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-032/README.md");

  assert.match(task, /5 - Local POS E2E harness/);
  assert.match(evidence, /FASE_5_LOCAL_POS_E2E_HARNESS/);
});
