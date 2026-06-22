import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

function functionBody(source, functionName, nextExportName) {
  const match = source.match(
    new RegExp(
      `export async function ${functionName}[\\s\\S]*?\\n}\\n\\nexport async function ${nextExportName}`,
    ),
  );

  assert.ok(match, `${functionName} body must be present`);
  return match[0];
}

test("TASK-077 pending navigation replaces the old page with a target skeleton", () => {
  const shell = read("src/components/shop/ShopShell.tsx");

  assertContains(shell, "ShopPendingNavigationSkeleton");
  assertContains(shell, "data-shop-route-loading-target");
  assertContains(shell, "data-shop-route-loading-section={itemKey}");
  assertContains(shell, "aria-busy=\"true\"");
  assert.match(
    shell,
    /visiblePendingNavigation \? \([\s\S]*<ShopPendingNavigationSkeleton[\s\S]*\) : \(\s*children\s*\)/,
  );
});

test("TASK-077 Categories and Suppliers use lightweight catalog entity read models", () => {
  const categoriesPage = read("src/app/shop/categories/page.tsx");
  const suppliersPage = read("src/app/shop/suppliers/page.tsx");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const inventoryReadModel = read("src/server/shop-admin/inventory-read-model.ts");

  assertContains(categoriesPage, "getShopCategoriesPageReadModel");
  assertContains(categoriesPage, "catalogOptionsReadModel: catalogReadModel");
  assert.doesNotMatch(categoriesPage, /getShopInventoryReadModel/);
  assertContains(suppliersPage, "getShopSuppliersPageReadModel");
  assertContains(suppliersPage, "catalogOptionsReadModel: catalogReadModel");
  assert.doesNotMatch(suppliersPage, /getShopInventoryReadModel/);
  assertContains(sectionData, "getShopCategoriesPageReadModel");
  assertContains(sectionData, "getShopSuppliersPageReadModel");
  assertContains(inventoryReadModel, "getShopCatalogEntityPageReadModel");
  assertContains(inventoryReadModel, "fetchCatalogEntityRows");
});

test("TASK-077 Staff resolves rows and permissions in one server-only bundle", () => {
  const staffPage = read("src/app/shop/staff/page.tsx");
  const staffReadModel = read("src/server/shop-admin/staff-read-model.ts");

  assertContains(staffPage, "resolveStaffPageBundle(requestedShopId)");
  assertContains(staffPage, "buildStaffSection(bundle.readModel)");
  assert.doesNotMatch(staffPage, /resolveShopActionContext/);
  assertContains(staffReadModel, "export async function resolveStaffPageBundle");
  assertContains(staffReadModel, "canManageStaffFromAccess");
  assertContains(staffReadModel, "canManageRolePermissionsFromAccess");
});

test("TASK-077 History list avoids count exact and legacy-heavy first paint", () => {
  const historyPage = read("src/app/shop/history/page.tsx");
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const listBody = functionBody(
    historyReadModel,
    "getShopHistoryListReadModel",
    "getShopHistoryReadModel",
  );

  assertContains(historyPage, "getShopHistoryListReadModel");
  assert.doesNotMatch(historyPage, /secondaryRowActions/);
  assert.doesNotMatch(historyPage, /getShopHistoryReadModel/);
  assert.doesNotMatch(listBody, /loadHistorySummary/);
  assert.doesNotMatch(listBody, /count:\s*"exact"/);
  assertContains(listBody, "loadHistoryListDiagnostics");
  assertContains(listBody, "shared_sheet_session_diagnostics");
  assertContains(listBody, "loadHistoryListSessions");
  assertContains(sectionData, "readModel.listMode === \"light\"");
  assertContains(sectionData, "Diagnostics");
  assertContains(sectionData, "Deferred");
});

test("TASK-077 Overview first render uses the light shop read model", () => {
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const overviewCase = sectionData.match(/case "overview": \{[\s\S]*?\n    \}/)?.[0] ?? "";

  assert.ok(overviewCase, "overview switch case must be present");
  assert.match(
    overviewCase,
    /return buildOverviewSection\(readModel\);/,
  );
  assert.doesNotMatch(overviewCase, /getShopInventoryReadModel/);
  assert.doesNotMatch(overviewCase, /Promise\.all/);
});

test("TASK-077 Products first paint keeps the default page size light", () => {
  const productsPage = read("src/app/shop/products/page.tsx");
  const inventoryReadModel = read("src/server/shop-admin/inventory-read-model.ts");

  assertContains(
    inventoryReadModel,
    "const INVENTORY_PRODUCTS_PAGE_SIZES = [10, 25, 50, 100, 200] as const",
  );
  assertContains(productsPage, ': "10";');
  assertContains(productsPage, '<option value="10">10</option>');
  assertContains(productsPage, '<option value="25">25</option>');
  assert.doesNotMatch(productsPage, /String\(input\.pageSize\) !== "100"/);
  assert.doesNotMatch(productsPage, /pagination\.pageSize !== 100/);
});

test("TASK-077 Sync first render uses a lightweight sync event read model", () => {
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const syncBody = functionBody(
    historyReadModel,
    "getShopSyncReadModel",
    "getShopHistoryReadModel",
  );
  const syncCase =
    sectionData.match(/if \(key === "sync"\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assertContains(historyReadModel, "export async function getShopSyncReadModel");
  assertContains(syncCase, "getShopSyncReadModel({ requestedShopId })");
  assert.doesNotMatch(syncCase, /getShopHistoryReadModel/);
  assert.doesNotMatch(syncBody, /loadHistorySummary/);
  assert.doesNotMatch(syncBody, /count:\s*"exact"/);
  assert.doesNotMatch(syncBody, /shared_sheet_session_diagnostics/);
  assertContains(syncBody, ".limit(25)");
});

test("TASK-077 cloud performance harness covers real-shop and fixture datasets", () => {
  const packageJson = JSON.parse(read("package.json"));
  const wrapper = read("scripts/testing/task-077-shop-cloud-performance.mjs");
  const spec = read("tests/e2e/staging/task-077-shop-admin-real-cloud-performance.spec.ts");

  assert.equal(
    packageJson.scripts["test:shop:cloud-performance:task077"],
    "node scripts/testing/task-077-shop-cloud-performance.mjs",
  );
  assertContains(wrapper, "TASK077_PERF_DATASET");
  assertContains(wrapper, "fixture");
  assertContains(wrapper, "real-shop");
  assertContains(wrapper, "CONFIRM_TASK077_REAL_SHOP_READONLY");
  assertContains(wrapper, "CONFIRM_TASK077_FIXTURE_CLOUD_PERFORMANCE");
  assertContains(wrapper, "assertNoProductionProjectRef");
  assertContains(wrapper, "task-077-cloud-performance-fixture-${phase}.json");
  assertContains(spec, "real-shop-readonly");
  for (const path of [
    "/shop/overview",
    "/shop/products",
    "/shop/categories",
    "/shop/suppliers",
    "/shop/staff",
    "/shop/history",
    "/shop/sync",
    "/shop/devices",
    "/shop/settings",
  ]) {
    assertContains(spec, path);
  }
  assertContains(spec, "visualReplacementMs");
  assertContains(spec, "?.finalStatus");
});
