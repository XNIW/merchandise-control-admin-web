import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-046 documents a repeatable local Platform Master Console login environment", () => {
  const runbookPath = "docs/RUNBOOKS/platform-master-console-local-login.md";

  assert.ok(existsSync(join(root, runbookPath)), `${runbookPath} is missing`);

  const runbook = readProjectFile(runbookPath);

  for (const requiredSnippet of [
    "Platform Master Console",
    "Supabase locale",
    "platform.local@example.test",
    "DEV_PLATFORM_ADMIN_PASSWORD",
    "npm run platform:local:seed",
    "npm run platform:local:dev",
    "http://127.0.0.1:3000/auth/login?next=/platform",
    "http://127.0.0.1:3000/platform",
    "Provisioning",
    "Users",
    "Audit",
    "System",
    "Data",
    "Devices",
    "Operations",
    "npm run platform:local:cleanup",
    "audit append-only",
    "staff POS",
    "Admin Console",
  ]) {
    assert.match(runbook, new RegExp(requiredSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(runbook, /non usare production/i);
  assert.match(runbook, /\.env\.local non decide/i);
  assert.match(runbook, /Non usare service-role key lato browser/i);
  assert.match(runbook, /Non hardcodare password nel codice/i);
});

test("TASK-046 local login scripts are local-only and do not depend on .env.local", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const setupPath = "scripts/platform/local-login-setup.mjs";
  const devPath = "scripts/platform/local-dev-server.mjs";
  const smokePath = "tests/e2e/task-046-platform-local-login.spec.ts";

  for (const requiredPath of [setupPath, devPath, smokePath]) {
    assert.ok(existsSync(join(root, requiredPath)), `${requiredPath} is missing`);
  }

  assert.equal(
    packageJson.scripts["platform:local:seed"],
    "node scripts/platform/local-login-setup.mjs seed",
  );
  assert.equal(
    packageJson.scripts["platform:local:cleanup"],
    "node scripts/platform/local-login-setup.mjs cleanup",
  );
  assert.equal(
    packageJson.scripts["platform:local:status"],
    "node scripts/platform/local-login-setup.mjs status",
  );
  assert.equal(
    packageJson.scripts["platform:local:dev"],
    "node scripts/platform/local-dev-server.mjs",
  );
  assert.equal(
    packageJson.scripts["test:platform:local-login"],
    "node scripts/testing/run-playwright-target.mjs local tests/e2e/task-046-platform-local-login.spec.ts --project=chromium-desktop",
  );

  const setup = readProjectFile(setupPath);
  const dev = readProjectFile(devPath);
  const smoke = readProjectFile(smokePath);

  for (const requiredSnippet of [
    "supabase",
    "status",
    "--output",
    "env",
    "assertLocalTargetEnv",
    "DEV_PLATFORM_ADMIN_PASSWORD",
    "platform.local@example.test",
    "TASK046_",
    "task046.platform_local_login.seed",
    "task046.platform_local_login.cleanup",
    "createUser",
    "updateUserById",
    "platform_admins",
    "audit_logs",
  ]) {
    assert.match(setup, new RegExp(requiredSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(dev, /assertLocalTargetEnv/);
  assert.match(dev, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(dev, /resolveAvailablePort/);
  assert.match(dev, /PLATFORM_LOCAL_DEV_PORT/);
  assert.match(dev, /already in use/);
  assert.match(dev, /3050/);
  assert.match(dev, /PLATFORM_LOCAL_DEV_BUNDLER/);
  assert.match(dev, /--webpack/);
  assert.match(dev, /--turbopack/);
  assert.doesNotMatch(dev, /SUPABASE_SERVICE_ROLE_KEY/);

  assert.match(smoke, /CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST/);
  assert.match(smoke, /DEV_PLATFORM_ADMIN_PASSWORD/);
  assert.match(smoke, /Admin account sign in/);
  assert.match(smoke, /Platform Overview/);

  assert.doesNotMatch(`${setup}\n${dev}\n${smoke}`, /\.env\.local|bypass|NODE_ENV\s*===\s*["']production["']/i);
  assert.doesNotMatch(`${setup}\n${dev}\n${smoke}`, /password\s*[:=]\s*["'][^"']+["']/i);
});
