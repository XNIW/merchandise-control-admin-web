import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-026 catalog lists expose search/filter controls for products, categories and suppliers", () => {
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  for (const [key, path] of [
    ["products", "src/app/shop/products/page.tsx"],
    ["categories", "src/app/shop/categories/page.tsx"],
    ["suppliers", "src/app/shop/suppliers/page.tsx"],
  ]) {
    const page = readProjectFile(path);

    assert.match(page, /name="query"/, `${path} must expose a query filter`);
    if (key === "products") {
      assert.match(page, /getShopInventoryProductsPage/);
      assert.match(page, /getShopCatalogOptionsReadModel/);
    } else {
      assert.match(page, new RegExp(`getShopSectionForRequest\\(\\s*"${key}"`));
    }
    assert.match(page, /catalogFilters/);
  }

  assert.match(sectionData, /applyCatalogFilters/);
  assert.match(sectionData, /applyNamedCatalogFilter/);
  assert.match(sectionData, /buildCategoriesSection\([\s\S]*filters: CatalogFilters/);
  assert.match(sectionData, /buildSuppliersSection\([\s\S]*filters: CatalogFilters/);
});

test("TASK-026 Admin Web exposes a trusted POS catalog pull endpoint without sales sync", () => {
  const routePath = "src/app/api/pos/catalog/pull/route.ts";
  const servicePath = "src/server/pos-auth/catalog-pull.ts";
  const routeSecurityPath = "src/app/api/pos/_shared/pos-route-security.ts";

  assert.equal(existsSync(join(root, routePath)), true, `${routePath} is missing`);
  assert.equal(existsSync(join(root, servicePath)), true, `${servicePath} is missing`);
  assert.equal(existsSync(join(root, routeSecurityPath)), true, `${routeSecurityPath} is missing`);

  const route = readProjectFile(routePath);
  const service = readProjectFile(servicePath);
  const routeSecurity = readProjectFile(routeSecurityPath);
  const combined = `${route}\n${service}\n${routeSecurity}`;

  assert.match(route, /handlePosCatalogPull/);
  assert.match(combined, /Cache-Control/);
  assert.match(combined, /no-store/);
  assert.match(service, /import "server-only"/);
  assert.match(service, /verifyPosSecret/);
  assert.match(service, /\.from\("pos_sessions"\)/);
  assert.match(service, /\.from\("pos_device_credentials"\)/);
  assert.match(service, /\.from\("shop_devices"\)/);
  assert.match(service, /\.from\("shop_inventory_sources"\)/);
  assert.match(service, /\.from\("inventory_products"\)/);
  assert.match(service, /\.from\("inventory_categories"\)/);
  assert.match(service, /\.from\("inventory_suppliers"\)/);
  assert.match(service, /syncMode: syncOptions\.mode|syncMode: "full_refresh"/);
  assert.match(service, /pos\.catalog\.pull/);
  assert.doesNotMatch(combined, /sale_lines|sales_sync|payment|cash_close|bidirectional/i);
  assert.doesNotMatch(combined, /trustedDeviceToken/i);
});

test("TASK-026 sync policy and evidence document the catalog/POS boundary", () => {
  const policyPath = "docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md";
  const taskPath = "docs/TASKS/TASK-026-shop-admin-product-catalog-foundation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-026/README.md";

  assert.equal(existsSync(join(root, policyPath)), true, `${policyPath} is missing`);

  const policy = readProjectFile(policyPath);
  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);

  for (const required of [
    "Admin Web/Supabase -> Win7POS",
    "Win7POS -> Supabase",
    "Editing catalogo da POS",
    "idempotency key",
    "sync cursor",
    "soft delete",
    "schema_version",
    "TASK-024 sales sync resta deferred",
  ]) {
    assert.match(policy, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(task, /Fase attuale: `EXECUTION`|Fase attuale: `REVIEW`|Fase attuale: `DONE_WITH_NOTES`/);
  assert.match(evidence, /TASK-026/);
  assert.match(evidence, /Schema\/RPC\/tabelle reali verificate/);
});
