import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-010 Shop Admin read model is server-only and shop-scoped", () => {
  const readModelPath = "src/server/shop-admin/read-model.ts";

  assert.equal(existsSync(join(root, readModelPath)), true, `${readModelPath} is missing`);

  const readModel = readProjectFile(readModelPath);
  const dataAccess = readProjectFile("src/server/shop-admin/data-access.ts");

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /resolveShopAdminDataAccess/);
  assert.match(dataAccess, /createSupabaseServerClient/);
  assert.match(dataAccess, /resolveCurrentShopAdminPrincipal/);
  assert.match(dataAccess, /resolveStaffWebSessionPrincipal/);
  assert.match(readModel, /"not_configured"/);
  assert.match(readModel, /"unauthorized"/);
  assert.match(readModel, /status: "empty"/);
  assert.match(readModel, /status: "error"/);
  assert.match(readModel, /\.from\("shops"\)/);
  assert.match(readModel, /\.from\("shop_members"\)/);
  assert.match(readModel, /\.from\("audit_logs"\)/);
  assert.match(readModel, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(readModel, /\.eq\("scope", "shop"\)/);
  assert.doesNotMatch(readModel, /user_metadata|raw_user_meta_data/);
  assert.doesNotMatch(readModel, /Promise\.all\s*\(/);
  assert.doesNotMatch(readModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);
});

test("TASK-010 selected shop query param is never an authorization source", () => {
  const readModel = readProjectFile("src/server/shop-admin/read-model.ts");
  const dataAccess = readProjectFile("src/server/shop-admin/data-access.ts");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const overviewPage = readProjectFile("src/app/shop/overview/page.tsx");
  const rootShopPage = readProjectFile("src/app/shop/page.tsx");

  assert.match(readModel, /requestedShopId/);
  assert.match(dataAccess, /availableShops\.find/);
  assert.match(dataAccess, /principal\.selectedShop/);
  assert.match(dataAccess, /strictRequestedShop/);
  assert.doesNotMatch(readModel, /\.eq\("shop_id", requestedShopId\)/);
  assert.doesNotMatch(readModel, /\.eq\("shop_id", selectedShopId\)/);
  assert.match(sectionData, /getShopAdminReadModel/);
  assert.match(overviewPage, /searchParams/);
  assert.match(rootShopPage, /searchParams/);
});

test("TASK-010 live Shop Admin pages render real rows or declared empty states", () => {
  const sectionPage = readProjectFile("src/components/shop/ShopSectionPage.tsx");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const membersPage = readProjectFile("src/app/shop/members/page.tsx");
  const auditPage = readProjectFile("src/app/shop/audit/page.tsx");

  assert.match(`${sectionPage}\n${sectionData}`, /Live shop data/);
  assert.match(`${sectionPage}\n${sectionData}`, /Live rows for the selected shop/);
  assert.match(sectionData, /buildOverviewSection/);
  assert.match(sectionData, /buildMembersSection/);
  assert.match(sectionData, /buildAuditSection/);
  assert.match(sectionData, /No live shop rows are visible/);
  assert.match(membersPage, /getShopSectionForRequest\(\s*"members"/);
  assert.match(auditPage, /getShopSectionForRequest\(\s*"audit"/);
  assert.doesNotMatch(`${sectionPage}\n${sectionData}`, /mock|fake|demo/i);
  assert.doesNotMatch(`${sectionPage}\n${sectionData}`, /TASK-010|TASK-008/);
});

test("TASK-010 security scan locks read model and live page artifacts", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask010ShopReadModelArtifacts/);
  assert.match(securityChecks, /src\/server\/shop-admin\/read-model\.ts/);
  assert.match(securityChecks, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(securityChecks, /checkTask010ShopReadModelArtifacts\(\)/);
});
