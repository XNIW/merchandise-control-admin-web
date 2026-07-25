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

    assert.match(page, /name="(?:q|query)"/, `${path} must expose a query filter`);
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
  const revision = readProjectFile("src/server/pos-auth/catalog-revision.ts");
  const runtimeBoundary = readProjectFile(
    "src/server/pos-auth/runtime-boundary.ts",
  );
  const migration = readProjectFile(
    "supabase/migrations/20260719170600_task_139_pos_catalog_v2_pagination_snapshot.sql",
  );
  const currentMigration = readProjectFile(
    "supabase/migrations/20260722013109_cross_platform_sync_event_completeness.sql",
  );
  const routeSecurity = readProjectFile(routeSecurityPath);
  const runtimeSurface = `${route}\n${service}\n${revision}\n${runtimeBoundary}\n${migration}\n${routeSecurity}`;
  const contractSurface = `${runtimeSurface}\n${currentMigration}`;

  assert.match(route, /handlePosCatalogPull/);
  assert.match(runtimeSurface, /Cache-Control/);
  assert.match(runtimeSurface, /no-store/);
  assert.match(service, /import "server-only"/);
  assert.match(service, /verifyPosSecret/);
  assert.match(service, /loadPosRuntimeLease/);
  assert.match(runtimeBoundary, /pos_runtime_lease_v1/);
  assert.match(revision, /rpc\("pos_catalog_pull_page_for_lease_v3"/);
  assert.match(revision, /p_expected_revision/);
  assert.match(revision, /p_expected_scope_key/);
  assert.match(revision, /p_expected_scope_kind/);
  assert.match(currentMigration, /pos_catalog_pull_page_for_lease_v3/);
  assert.match(migration, /from public\.shop_inventory_sources/);
  assert.match(migration, /from public\.inventory_products/);
  assert.match(migration, /from public\.inventory_categories/);
  assert.match(migration, /from public\.inventory_suppliers/);
  assert.match(service, /syncMode: sync\.mode/);
  assert.match(service, /pos\.catalog\.pull/);
  assert.match(contractSurface, /pos_catalog_pull_page_for_lease_v3/);
  assert.doesNotMatch(runtimeSurface, /sale_lines|sales_sync|payment|cash_close|bidirectional/i);
  assert.doesNotMatch(runtimeSurface, /trustedDeviceToken/i);
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
