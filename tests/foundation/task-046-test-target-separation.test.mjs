import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-046 separates safe checks, local E2E and staging E2E by explicit TEST_TARGET", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const scripts = packageJson.scripts;

  for (const scriptName of [
    "db:local:status",
    "db:staging:status",
    "test:e2e:local",
    "test:e2e:staging",
    "test:platform:local",
    "test:platform:staging",
    "test:shop:local",
    "smoke:staging",
  ]) {
    assert.equal(typeof scripts[scriptName], "string", `${scriptName} is missing`);
    assert.doesNotMatch(scripts[scriptName], /cross-env/);
  }

  for (const alwaysSafeScript of [
    "security:scan",
    "test:foundation",
    "typecheck",
    "lint",
    "build",
    "verify",
  ]) {
    assert.equal(typeof scripts[alwaysSafeScript], "string", `${alwaysSafeScript} is missing`);
    assert.doesNotMatch(scripts[alwaysSafeScript], /TEST_TARGET|playwright|supabase status/);
  }

  assert.match(scripts["test:e2e:local"], /run-playwright-target\.mjs local tests\/e2e/);
  assert.match(scripts["test:e2e:staging"], /run-playwright-target\.mjs staging tests\/e2e\/staging/);
  assert.match(
    scripts["test:platform:local"],
    /run-playwright-target\.mjs local tests\/e2e\/task-045-platform-master-console-final-review\.spec\.ts/,
  );
  assert.match(
    scripts["test:platform:staging"],
    /run-playwright-target\.mjs staging tests\/e2e\/staging\/platform-staging-smoke\.spec\.ts/,
  );
});

test("TASK-046 wrappers enforce local and staging target guardrails", () => {
  for (const relativePath of [
    "scripts/db/local-status.mjs",
    "scripts/db/staging-status.mjs",
    "scripts/testing/target-guardrails.mjs",
    "scripts/testing/run-playwright-target.mjs",
    "tests/e2e/staging/platform-staging-smoke.spec.ts",
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const guardrails = readProjectFile("scripts/testing/target-guardrails.mjs");
  const runner = readProjectFile("scripts/testing/run-playwright-target.mjs");
  const securityChecks = readProjectFile("scripts/security-checks.mjs");
  const stagingSpec = readProjectFile("tests/e2e/staging/platform-staging-smoke.spec.ts");

  for (const required of [
    "TEST_TARGET",
    "local",
    "staging",
    "ALLOW_STAGING_E2E",
    "CONFIRM_STAGING_E2E",
    "ALLOWED_STAGING_SUPABASE_PROJECT_REFS",
    "SUPABASE_PRODUCTION_PROJECT_REF",
    "PRODUCTION_SUPABASE_PROJECT_REFS",
    "127.0.0.1",
    "localhost",
    ".supabase.co",
    "BLOCKED_TEST_TARGET_REQUIRED",
    "BLOCKED_LOCAL_SUPABASE_URL_REQUIRED",
    "BLOCKED_STAGING_CONFIRMATION_REQUIRED",
    "BLOCKED_STAGING_PROJECT_REF_NOT_ALLOWLISTED",
    "BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN",
  ]) {
    assert.match(guardrails, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(runner, /supabase status --output env/);
  assert.match(runner, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(runner, /PLAYWRIGHT_WEB_SERVER_COMMAND/);
  assert.match(runner, /CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST/);
  assert.match(runner, /CONFIRM_TASK044_PLATFORM_RUNTIME_TEST/);
  assert.match(runner, /CONFIRM_TASK043_PLATFORM_RUNTIME_TEST/);
  assert.match(securityChecks, /checkTask046TestTargetSeparation/);

  assert.match(stagingSpec, /STAGING_TASK045_/);
  assert.match(stagingSpec, /TEST_TARGET/);
  assert.match(stagingSpec, /staging/);
  assert.doesNotMatch(stagingSpec, /delete\(\)|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
