import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-009 Shop Admin access resolver is server-only and membership scoped", () => {
  const resolverPath = "src/server/shop-admin/shop-access.ts";

  assert.equal(existsSync(join(root, resolverPath)), true, `${resolverPath} is missing`);

  const resolver = readProjectFile(resolverPath);

  assert.match(resolver, /import "server-only"/);
  assert.match(resolver, /auth\.getUser\(\)/);
  assert.match(resolver, /\.from\("shop_members"\)/);
  assert.match(resolver, /\.from\("shops"\)/);
  assert.match(resolver, /\.eq\("profile_id", userId\)/);
  assert.match(resolver, /\.eq\("membership_status", "active"\)/);
  assert.match(resolver, /shop_owner/);
  assert.match(resolver, /shop_manager/);
  assert.match(resolver, /availableShops/);
  assert.match(resolver, /selectedShop/);
  assert.doesNotMatch(resolver, /resolveCurrentAdminRouteAccess/);
  assert.doesNotMatch(resolver, /\.from\("platform_admins"\)/);
  assert.doesNotMatch(resolver, /user_metadata|raw_user_meta_data/);
  assert.doesNotMatch(resolver, /Promise\.all\s*\(/);
});

test("TASK-009 ShopShell renders switcher from server-provided shops only", () => {
  const layout = readProjectFile("src/app/shop/layout.tsx");
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");

  assert.match(layout, /resolveShopAdminDataAccess/);
  assert.match(layout, /availableShops=\{availableShops\}/);
  assert.match(layout, /selectedShopId=\{access\.selectedShop\.shopId\}/);
  assert.match(layout, /principal\.kind === "personal_account"/);

  assert.match(shell, /availableShops/);
  assert.match(shell, /selectedShopId/);
  assert.match(shell, /useSearchParams/);
  assert.match(shell, /useRouter/);
  assert.match(shell, /principalKind/);
  assert.match(shell, /principalKind === "personal_account"/);
  assert.match(shell, /aria-label=\{labels\.switchShop\}/);
  assert.match(dictionary, /switchShop: "Switch shop"/);
  assert.match(shell, /shop_id/);
  assert.doesNotMatch(shell, /@\/server|src\/server|@supabase\//);
});

test("TASK-062 corrective: staff manager shell remains single-shop", () => {
  const layout = readProjectFile("src/app/shop/layout.tsx");
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");

  assert.match(
    layout,
    /principal\.kind === "personal_account"\s*\?\s*principal\.availableShops\s*:\s*\[access\.selectedShop\]/,
  );
  assert.match(shell, /const canSwitchShops =/);
  assert.match(shell, /principalKind === "personal_account" && hasMultipleShops/);
  assert.match(shell, /\{canSwitchShops \? \(/);
  assert.doesNotMatch(shell, /\{hasMultipleShops \? \(/);
});

test("TASK-009 ShopShell preserves selected shop while navigating sections", () => {
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");

  assert.match(shell, /function buildShopHref/);
  assert.match(shell, /nextSearchParams\.set\("shop_id", selectedShop\.shopId\)/);
  assert.match(shell, /const href = buildShopHref\(item\.href\);/);
  assert.match(shell, /href=\{href\}/);
});

test("TASK-009 security scan locks shop switcher artifacts", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /listFiles\("src\/server\/shop-admin"\)/);
  assert.match(securityChecks, /function checkTask009ShopSwitcherArtifacts/);
  assert.match(securityChecks, /buildShopHref/);
  assert.match(securityChecks, /checkTask009ShopSwitcherArtifacts\(\)/);
});
