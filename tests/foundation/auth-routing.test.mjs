import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-007 resolver is server-only and uses database-backed roles", () => {
  const resolverPath = "src/server/auth/admin-routing.ts";

  assert.equal(existsSync(join(root, resolverPath)), true, `${resolverPath} is missing`);

  const resolver = readProjectFile(resolverPath);

  assert.match(resolver, /import "server-only"/);
  assert.match(resolver, /auth\.getUser\(\)/);
  assert.match(resolver, /\.from\("platform_admins"\)/);
  assert.match(resolver, /\.from\("shop_members"\)/);
  assert.match(resolver, /shop_owner/);
  assert.match(resolver, /shop_manager/);
  assert.match(resolver, /viewer/);
  assert.match(resolver, /revoked/);
  assert.doesNotMatch(resolver, /user_metadata|raw_user_meta_data/);
});

test("TASK-007 routes are protected server-side", () => {
  const rootPage = readProjectFile("src/app/page.tsx");
  const authForm = readProjectFile("src/components/auth/AuthForm.tsx");
  const authCallback = readProjectFile("src/app/auth/callback/route.ts");

  assert.equal(existsSync(join(root, "src/app/platform/layout.tsx")), true);
  assert.equal(existsSync(join(root, "src/app/shop/layout.tsx")), true);
  assert.equal(existsSync(join(root, "src/app/shop/page.tsx")), true);
  assert.equal(existsSync(join(root, "src/components/auth/AccessState.tsx")), true);

  const platformLayout = readProjectFile("src/app/platform/layout.tsx");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");
  const shopPage = readProjectFile("src/app/shop/page.tsx");
  const accessState = readProjectFile("src/components/auth/AccessState.tsx");

  assert.match(rootPage, /redirect\("\/auth\/login\?next=\/shop&mode=admin-account"\)/);
  assert.doesNotMatch(rootPage, /resolveCurrentAdminRouteAccess/);
  assert.doesNotMatch(rootPage, /getAdminRouteDestination/);
  assert.doesNotMatch(rootPage, /\/auth\/login\?next=\/platform/);
  assert.match(platformLayout, /resolveCurrentAdminRouteAccess/);
  assert.match(platformLayout, /status !== "platform_admin"/);
  assert.match(shopLayout, /resolveCurrentShopAdminPrincipal/);
  assert.match(shopLayout, /resolveStaffWebSessionPrincipal/);
  assert.match(shopLayout, /resolution\.status !== "ready"/);
  assert.match(shopPage, /ShopSectionPage/);
  assert.match(accessState, /no_session/);
  assert.match(accessState, /not_configured/);
  assert.match(accessState, /no_shop/);
  assert.ok(authForm.includes('? requested : "/"'));
  assert.ok(authCallback.includes('? value : "/"'));
});

test("TASK-007 security scan includes server auth modules", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /listFiles\("src\/server\/auth"\)/);
});

test("TASK-007 security scan locks auth routing artifacts", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask007AuthRoutingArtifacts/);
  assert.match(securityChecks, /checkTask007AuthRoutingArtifacts\(\)/);
  assert.match(securityChecks, /src\/app\/platform\/layout\.tsx/);
  assert.match(securityChecks, /src\/app\/shop\/page\.tsx/);
});
