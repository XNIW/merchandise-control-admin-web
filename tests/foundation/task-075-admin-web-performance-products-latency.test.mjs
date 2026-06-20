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

function functionBody(source, functionName) {
  const match = source.match(
    new RegExp(
      `export async function ${functionName}[\\s\\S]*?\\n}\\n\\nexport async function `,
    ),
  );

  assert.ok(match, `${functionName} body must be present`);
  return match[0];
}

test("TASK-075 Shop and Products routes expose non-technical loading states", () => {
  const shopLoading = read("src/app/shop/loading.tsx");
  const productsLoading = read("src/app/shop/products/loading.tsx");

  assertContains(shopLoading, "data-shop-loading");
  assertContains(shopLoading, "aria-busy=\"true\"");
  assertContains(productsLoading, "data-products-loading");
  assertContains(productsLoading, "data-products-loading-filters");
  assertContains(productsLoading, "data-products-loading-rows");
  assertContains(productsLoading, "Catalog Workspace");
  assertContains(productsLoading, "Products");
  assert.doesNotMatch(`${shopLoading}\n${productsLoading}`, /Rendering|Suspense|Loading\.\.\./i);
});

test("TASK-075 Shop sidebar prefetches protected links on user intent only", () => {
  const shell = read("src/components/shop/ShopShell.tsx");

  assertContains(shell, "router.prefetch(href)");
  assertContains(shell, "handleNavigationIntent(item)");
  assertContains(shell, "onMouseEnter={() => handleNavigationIntent(item)}");
  assertContains(shell, "onFocus={() => handleNavigationIntent(item)}");
  assertContains(shell, "onTouchStart={() => handleNavigationIntent(item)}");
  assertContains(shell, "prefetch={false}");
});

test("TASK-075 Products first render avoids the full inventory read model", () => {
  const page = read("src/app/shop/products/page.tsx");
  const readModel = read("src/server/shop-admin/inventory-read-model.ts");
  const catalogOptionsBody = functionBody(
    readModel,
    "getShopCatalogOptionsReadModel",
  );

  assertContains(page, "getShopInventoryProductsPage");
  assertContains(page, "getShopCatalogOptionsReadModel");
  assertContains(page, "resolveShopPageAccessBundle");
  assertContains(page, "Promise.all([");
  assert.doesNotMatch(page, /getShopInventoryReadModel\(/);
  assert.doesNotMatch(page, /resolveShopActionContext\(/);
  assertContains(catalogOptionsBody, "inventory_categories");
  assertContains(catalogOptionsBody, "inventory_suppliers");
  assert.doesNotMatch(catalogOptionsBody, /inventory_product_prices/);
  assert.doesNotMatch(catalogOptionsBody, /shopArchivedProducts|archivedProducts/);
});

test("TASK-075 performance trace is opt-in and metadata-safe", () => {
  const perf = read("src/server/admin-web-perf.ts");
  const page = read("src/app/shop/products/page.tsx");

  assertContains(perf, 'process.env.ADMIN_WEB_PERF_DEBUG === "1"');
  assertContains(perf, "value.slice(0, 80)");
  assertContains(perf, "[admin-web-perf]");
  assertContains(page, "createAdminWebPerfTrace(\"shop.products\"");
  assertContains(page, "hasRequestedShopId: Boolean(requestedShopId)");
  assert.doesNotMatch(page, /\n\s*requestedShopId:/);
  assert.doesNotMatch(perf, /password|secret|token|authorization/i);
});
