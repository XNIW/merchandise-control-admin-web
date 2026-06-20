import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask015Migrations() {
  return readdirSync(join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql") && file.includes("task_015"))
    .map((file) => readProjectFile(`supabase/migrations/${file}`))
    .join("\n");
}

test("TASK-015 inventory read model is server-only, mapped, and read-only", () => {
  const readModelPath = "src/server/shop-admin/inventory-read-model.ts";

  assert.equal(existsSync(join(root, readModelPath)), true, `${readModelPath} is missing`);

  const readModel = readProjectFile(readModelPath);

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /resolveShopAdminDataAccess/);
  assert.match(readModel, /\.from\("shop_inventory_sources"\)/);
  assert.match(readModel, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(readModel, /mapping_state === "mapped"/);
  assert.match(readModel, /\.from\("inventory_products"\)/);
  assert.match(readModel, /\.from\("inventory_categories"\)/);
  assert.match(readModel, /\.from\("inventory_suppliers"\)/);
  assert.match(readModel, /\.from\("inventory_product_prices"\)/);
  assert.match(readModel, /\.eq\("owner_user_id", legacyOwnerUserId\)/);
  assert.match(readModel, /\.is\("deleted_at", null\)/);
  assert.doesNotMatch(readModel, /select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.doesNotMatch(readModel, /\.eq\("shop_id",\s*(requestedShopId|selectedShopId)\)/);
});

test("TASK-015 catalog CRUD is implemented through audited shop-scoped RPCs", () => {
  const mutationPath = "src/server/shop-admin/catalog-mutations.ts";
  const actionsPath = "src/app/shop/actions.ts";

  assert.equal(existsSync(join(root, mutationPath)), true, `${mutationPath} is missing`);
  assert.equal(existsSync(join(root, actionsPath)), true, `${actionsPath} is missing`);

  const migration = readTask015Migrations();
  const mutations = readProjectFile(mutationPath);
  const actions = readProjectFile(actionsPath);

  for (const rpcName of [
    "shop_catalog_create_product",
    "shop_catalog_update_product",
    "shop_catalog_archive_product",
    "shop_catalog_create_category",
    "shop_catalog_update_category",
    "shop_catalog_archive_category",
    "shop_catalog_create_supplier",
    "shop_catalog_update_supplier",
    "shop_catalog_archive_supplier",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpcName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpcName}`));
    assert.match(mutations, new RegExp(`\\.rpc\\("${rpcName}"`));
  }

  for (const requiredSql of [
    "app_private.resolve_shop_inventory_owner",
    "app_private.write_shop_admin_audit",
    "deleted_at = now()",
    "coalesce(p_purchase_price, 0) < 0",
    "coalesce(p_retail_price, 0) < 0",
    "coalesce(p_stock_quantity, 0) < 0",
    "regexp_replace",
    "shop.catalog.",
    "set search_path = public, app_private, pg_temp",
  ]) {
    assert.match(migration, new RegExp(requiredSql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(mutations, /import "server-only"/);
  assert.match(mutations, /resolveShopActionContext/);
  assert.match(mutations, /products\.write/);
  assert.match(mutations, /categories\.write/);
  assert.match(mutations, /suppliers\.write/);
  assert.match(actions, /^"use server";/);
  assert.match(actions, /createProductAction/);
  assert.match(actions, /updateProductAction/);
  assert.match(actions, /archiveProductAction/);
  assert.match(actions, /createCategoryAction/);
  assert.match(actions, /updateCategoryAction/);
  assert.match(actions, /archiveCategoryAction/);
  assert.match(actions, /createSupplierAction/);
  assert.match(actions, /updateSupplierAction/);
  assert.match(actions, /archiveSupplierAction/);
  assert.doesNotMatch(mutations, /\.(insert|update|delete|upsert)\s*\(/);
  assert.doesNotMatch(actions, /SUPABASE_SERVICE_ROLE_KEY|service_role|credential_hash/i);
});

test("TASK-015 catalog pages expose real guarded forms through the mapped section builder", () => {
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const formPanel = readProjectFile("src/app/shop/_components/CatalogActionPanel.tsx");

  for (const [key, path] of [
    ["products", "src/app/shop/products/page.tsx"],
    ["categories", "src/app/shop/categories/page.tsx"],
    ["suppliers", "src/app/shop/suppliers/page.tsx"],
  ]) {
    const page = readProjectFile(path);

    assert.match(page, /searchParams/);
    if (key === "products") {
      assert.match(page, /getShopInventoryProductsPage/);
      assert.match(page, /getShopCatalogOptionsReadModel/);
      assert.match(page, /buildProductsPageSection/);
    } else {
      assert.match(page, new RegExp(`getShopSectionForRequest\\(\\s*"${key}"`));
    }
    assert.match(page, /CatalogActionPanel/);
    assert.doesNotMatch(page, new RegExp(`shopSections\\.${key}`));
  }

  for (const builder of [
    "buildProductsSection",
    "buildCategoriesSection",
    "buildSuppliersSection",
  ]) {
    assert.match(sectionData, new RegExp(builder));
  }

  assert.match(formPanel, /Create product/);
  assert.match(formPanel, /Update product/);
  assert.match(formPanel, /Archive product/);
  assert.match(formPanel, /Create category/);
  assert.match(formPanel, /Create supplier/);
  assert.match(formPanel, /confirmation/);
  assert.doesNotMatch(formPanel, /coming soon|placeholder/i);
});
