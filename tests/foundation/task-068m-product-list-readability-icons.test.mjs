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

test("TASK-068M products page renders catalog rows instead of a wide technical table", () => {
  const page = read("src/app/shop/products/page.tsx");

  assertContains(page, "ProductCatalogList");
  assertContains(page, "renderLiveData={({ liveData, rowActions })");
  assertContains(page, "data-product-catalog-list");
  assertContains(page, "data-product-catalog-row");
  assertContains(page, "lg:grid-cols-[minmax(15rem,1.5fr)_minmax(12rem,1fr)_minmax(10rem,0.9fr)_minmax(10rem,0.9fr)_minmax(10rem,0.85fr)_minmax(9rem,auto)]");
  assert.doesNotMatch(page, /<AdminDataTable/);
});

test("TASK-068M product identity and codes are primary grouped content", () => {
  const page = read("src/app/shop/products/page.tsx");

  assertContains(page, "data-product-identity");
  assertContains(page, "Product identity");
  assertContains(page, "line-clamp-2 break-words text-base font-semibold");
  assertContains(page, "data-product-codes");
  assertContains(page, "Codes");
  assertContains(page, "label={columnLabel(liveData, \"barcode\")}");
  assertContains(page, "label={columnLabel(liveData, \"itemNumber\")}");
  assertContains(page, "icon=\"barcode\"");
  assertContains(page, "icon=\"tag\"");
  assertContains(page, "overflow-x-auto whitespace-nowrap");
});

test("TASK-068M product row actions and catalog toolbar use decorative inline icons", () => {
  const page = read("src/app/shop/products/page.tsx");
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const packageJson = read("package.json");

  assertContains(page, "data-product-action-toolbar");
  assertContains(page, "<ProductsIcon name=\"eye\" />");
  assertContains(page, "icon: \"pencil\"");
  assertContains(page, "icon: \"archive\"");
  assertContains(page, "icon: \"restore\"");
  assertContains(page, "aria-label={`${labels.detail}: ${productLabel}`}");
  assertContains(page, "aria-label={`${item.label}: ${productLabel}`}");

  assertContains(catalogPanel, "CatalogActionIcon");
  assertContains(catalogPanel, "aria-hidden\": true");
  assertContains(catalogPanel, "icon=\"newProduct\"");
  assertContains(catalogPanel, "icon=\"uploadSpreadsheet\"");
  assertContains(catalogPanel, "icon=\"downloadSpreadsheet\"");
  assertContains(catalogPanel, "icon=\"databaseTransfer\"");
  assertContains(catalogPanel, "gap-1.5 rounded-md border border-zinc-300");
  assert.doesNotMatch(packageJson, /lucide|heroicons|react-icons/);
});

test("TASK-068M Master Console sidebar has no-dependency decorative icons", () => {
  const platformNav = read("src/components/platform/PlatformSidebarNav.tsx");

  assertContains(platformNav, "PlatformNavigationIcon");
  assertContains(platformNav, "aria-hidden\": true");
  assertContains(platformNav, "<PlatformNavigationIcon itemKey={item.key} />");
  assertContains(platformNav, "inline-flex shrink-0 items-center gap-2");

  for (const key of [
    "overview",
    "users",
    "shopAdmins",
    "shops",
    "provisioning",
    "admins",
    "audit",
    "system",
    "data",
    "history",
    "operations",
    "support",
  ]) {
    assertContains(platformNav, `${key}: (`);
  }
});

test("TASK-068M polish stays out of products read model and Supabase schema", () => {
  const page = read("src/app/shop/products/page.tsx");
  const packageJson = read("package.json");

  assertContains(page, "getShopInventoryProductsPage");
  assertContains(page, "getShopCatalogOptionsReadModel");
  assertContains(page, "resolveShopPageAccessBundle");
  assert.doesNotMatch(page, /getShopInventoryReadModel\(/);
  assert.doesNotMatch(page, /resolveShopActionContext\(/);
  assert.doesNotMatch(page, /\.from\(|\.select\(|\.rpc\(|createClient/);
  assert.doesNotMatch(packageJson, /lucide|heroicons|react-icons/);
});

test("TASK-068M catalog category and supplier pages reuse the loaded inventory read model", () => {
  for (const pagePath of [
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
  ]) {
    const page = read(pagePath);

    assertContains(page, "getShopInventoryReadModel({ requestedShopId })");
    assertContains(page, "inventoryReadModel,");
    assert.doesNotMatch(
      page,
      /getShopSectionForRequest\([^)]*\)\s*,\s*\n\s*getShopInventoryReadModel/s,
      `${pagePath} must not load the inventory read model twice`,
    );
  }

  const sectionData = read("src/server/shop-admin/shop-section-data.ts");

  assertContains(sectionData, "inventoryReadModel?: ShopInventoryReadModel");
  assertContains(sectionData, "options.inventoryReadModel ??");
});
