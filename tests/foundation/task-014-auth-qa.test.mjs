import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-014 authenticated QA harness is opt-in and non-persistent", () => {
  const specPath = "tests/e2e/platform-admin-live-auth.spec.ts";
  const packagePath = "package.json";

  for (const relativePath of [specPath, packagePath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const spec = readProjectFile(specPath);
  const pkg = JSON.parse(readProjectFile(packagePath));

  assert.match(pkg.scripts["test:ui-live-auth"], /platform-admin-live-auth\.spec\.ts/);
  assert.match(spec, /CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST/);
  assert.match(spec, /createTemporaryPlatformAdminCredentials/);
  assert.match(spec, /createTemporaryShopAdminFixture/);
  assert.match(spec, /deleteUser/);
  assert.match(spec, /cleanup/);
  assert.match(spec, /screenshot: "off"/);
  assert.match(spec, /trace: "off"/);
  assert.match(spec, /video: "off"/);
  assert.doesNotMatch(spec, /storageState/);
  assert.doesNotMatch(spec, /console\.(log|debug|info|warn|error)/);
});

test("TASK-014 authenticated QA covers Platform and Shop routes without exposing credentials", () => {
  const spec = readProjectFile("tests/e2e/platform-admin-live-auth.spec.ts");

  for (const route of [
    "/platform",
    "/platform/users",
    "/shop",
    "/shop/overview",
    "/shop/staff",
  ]) {
    assert.match(spec, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(spec, /browser-platform-authenticated\.png/);
  assert.match(spec, /browser-shop-overview-authenticated\.png/);
  assert.match(spec, /browser-shop-staff-authenticated\.png/);
  assert.doesNotMatch(spec, /page\.[a-zA-Z]+\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(spec, /magic link|access_token|refresh_token/i);
});

test("TASK-014 security scan has dedicated credential and auth QA gates", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask014PosStaffFoundation/);
  assert.match(securityChecks, /function checkTask014AuthenticatedQaHarness/);
  assert.match(securityChecks, /checkTask014PosStaffFoundation\(\)/);
  assert.match(securityChecks, /checkTask014AuthenticatedQaHarness\(\)/);
});
