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
  assert.match(readModel, /actor_staff_id/);
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

test("TASK-068E inventory read model supports legacy owner-only mobile schema", () => {
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );

  for (const required of [
    "legacyProductSelect",
    "legacyCategorySelect",
    "legacySupplierSelect",
    "legacyPriceSelect",
    "isMissingShopIdColumnError",
    "legacyOwnerOnlySchema",
    ".eq(\"owner_user_id\", legacyOwnerUserId)",
    "catalogScope === \"legacy_owner_bridge\"",
    "Legacy owner rows loaded through shop_inventory_sources while shop_id migration is in progress.",
  ]) {
    assert.match(
      inventoryReadModel,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `inventory read model must contain ${required}`,
    );
  }

  assert.doesNotMatch(inventoryReadModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);
});

test("TASK-010 Shop Audit read models preserve personal and POS staff actor identity", () => {
  const readModel = readProjectFile("src/server/shop-admin/read-model.ts");
  const auditReadModel = readProjectFile("src/server/shop-admin/audit-read-model.ts");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  for (const source of [readModel, auditReadModel]) {
    assert.match(source, /actor_staff_id/);
    assert.match(source, /actorKind/);
    assert.match(source, /actorStaffId/);
  }

  assert.match(
    auditReadModel,
    /"audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,metadata_redacted,created_at"/,
  );
  assert.match(
    readModel,
    /"audit_log_id,actor_profile_id,actor_staff_id,scope,shop_id,event_key,severity,result,target_type,target_id,created_at"/,
  );
  assert.match(sectionData, /function auditActorLabel/);
  assert.match(sectionData, /POS staff \$\{shortId\(log\.actorStaffId\)\}/);
  assert.match(sectionData, /POS staff credential/);
});

test("TASK-068H products page uses server-side pagination count and range", () => {
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");

  for (const required of [
    "getShopInventoryProductsPage",
    "ShopInventoryProductsPage",
    "count: \"exact\"",
    ".range(input.from, input.to)",
    "totalCount",
    "currentPageRows",
    "Total products",
    "Results",
    "ProductsPagination",
    "Page size",
  ]) {
    assert.match(
      `${inventoryReadModel}\n${productsPage}`,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `products pagination contract must contain ${required}`,
    );
  }

  assert.match(productsPage, /getShopInventoryProductsPage/);
});

test("TASK-068H products filters and search stay server-side", () => {
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");

  for (const required of [
    "getFirstParam(params, [\"q\", \"search\", \"query\"])",
    "getFirstParam(params, [\"category\", \"category_id\"])",
    "getFirstParam(params, [\"supplier\", \"supplier_id\"])",
    "nextQuery.eq(\"category_id\", filters.categoryId)",
    "nextQuery.eq(\"supplier_id\", filters.supplierId)",
    "barcode.ilike",
    "item_number.ilike",
    "product_name.ilike",
  ]) {
    assert.match(
      `${inventoryReadModel}\n${productsPage}`,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `products server-side filter contract must contain ${required}`,
    );
  }

  assert.doesNotMatch(productsPage, /applyCatalogFilters/);
});

test("TASK-068H products page preserves legacy mobile bridge fallback", () => {
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");

  for (const required of [
    "countShopScopedProducts",
    "legacyOwnerOnlySchema",
    "useLegacyOwnerBridge",
    ".eq(\"owner_user_id\", input.legacyOwnerUserId ?? \"\")",
    "Legacy mobile bridge product rows loaded through owner_user_id",
    "Legacy mobile bridge",
  ]) {
    assert.match(
      `${inventoryReadModel}\n${productsPage}`,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `legacy mobile bridge contract must contain ${required}`,
    );
  }

  assert.doesNotMatch(inventoryReadModel, /\.(insert|update|delete|upsert|rpc)\s*\(/);
});

test("TASK-068J products page prefers mapped mobile owner bridge before shop_id count", () => {
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");

  for (const required of [
    "isMappedMobileOwnerSource",
    "mapping?.mappingState === \"mapped\"",
    "mapping.sourceKind === \"mobile_owner\"",
    "preferMappedMobileOwnerBridge",
    "? { count: null, error: null }",
    "preferMappedMobileOwnerBridge ||",
    ".eq(\"owner_user_id\", input.legacyOwnerUserId ?? \"\")",
    "Only current page rows are rendered",
  ]) {
    assert.match(
      `${inventoryReadModel}\n${productsPage}`,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `TASK-068J legacy bridge contract must contain ${required}`,
    );
  }

  assert.match(
    inventoryReadModel,
    /preferMappedMobileOwnerBridge[\s\S]{0,260}countShopScopedProducts/,
  );
  assert.doesNotMatch(productsPage, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/);
  assert.doesNotMatch(inventoryReadModel, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/);
});

test("TASK-068H Shop Admin overview uses exact catalog/history summaries", () => {
  const inventoryReadModel = readProjectFile(
    "src/server/shop-admin/inventory-read-model.ts",
  );
  const historyReadModel = readProjectFile(
    "src/server/shop-admin/history-read-model.ts",
  );
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const dashboardSection =
    sectionData.match(
      /export function buildShopDashboardSection[\s\S]*?(?=\nexport function buildMembersSection)/,
    )?.[0] ?? "";

  for (const required of [
    "loadCatalogSummary",
    "ShopInventoryCatalogSummary",
    "loadHistorySummary",
    "ShopHistorySummary",
    "inventoryReadModel.summary",
    "historyReadModel.summary",
    "Total products",
    "Price history rows",
    "Sales / revenue",
    "POS sales sync is not connected yet",
    "syncEventsTotal",
    "historySessionsTotal",
  ]) {
    assert.match(
      `${inventoryReadModel}\n${historyReadModel}\n${dashboardSection}`,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `Shop Admin overview summary contract must contain ${required}`,
    );
  }

  assert.doesNotMatch(dashboardSection, /inventoryReadModel\.products\.length/);
  assert.doesNotMatch(dashboardSection, /inventoryReadModel\.prices\.length/);
});

test("TASK-010 security scan locks read model and live page artifacts", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /function checkTask010ShopReadModelArtifacts/);
  assert.match(securityChecks, /src\/server\/shop-admin\/read-model\.ts/);
  assert.match(securityChecks, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(securityChecks, /checkTask010ShopReadModelArtifacts\(\)/);
});
