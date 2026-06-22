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
  assertContains(page, "[content-visibility:auto]");
  assertContains(page, "[contain-intrinsic-size:180px]");
  assertContains(page, "p-3 shadow-sm");
  assertContains(page, "data-product-cell=\"identity\"");
  assertContains(page, "data-product-cell=\"codes\"");
  assertContains(page, "data-product-cell=\"classification\"");
  assertContains(page, "data-product-cell=\"pricing-stock\"");
  assertContains(page, "data-product-cell=\"status\"");
  assertContains(page, "data-product-cell=\"actions\"");
  assertContains(page, "grid min-w-0 gap-2.5 md:grid-cols-2 min-[1400px]:grid-cols-[minmax(11.5rem,0.85fr)_minmax(11.5rem,0.85fr)_minmax(17rem,1.2fr)]");
  assert.doesNotMatch(page, /lg:grid-cols-\[minmax\(16rem,1\.35fr\)_minmax\(10rem,0\.75fr\)_minmax\(12rem,0\.85fr\)_minmax\(14rem,0\.95fr\)_minmax\(9rem,0\.65fr\)_auto\]/);
  assert.doesNotMatch(page, /<AdminDataTable/);
});

test("TASK-068M product identity and codes are primary grouped content", () => {
  const page = read("src/app/shop/products/page.tsx");

  assertContains(page, "data-product-identity");
  assertContains(page, "Product identity");
  assertContains(page, "line-clamp-2 break-words text-base font-semibold");
  assertContains(page, "data-product-codes");
  assertContains(page, "data-product-classification");
  assertContains(page, "data-product-pricing-stock");
  assertContains(page, "data-product-status");
  assertContains(page, "data-product-actions");
  assertContains(page, "barcodeLabel={columnLabel(liveData, \"barcode\")}");
  assertContains(page, "itemNumberLabel={columnLabel(liveData, \"itemNumber\")}");
  assertContains(page, "icon: \"barcode\" as const");
  assertContains(page, "icon: \"tag\" as const");
  assertContains(page, "ProductCodeBlock");
  assertContains(page, "ProductClassificationBlock");
  assertContains(page, "ProductPriceStockBlock");
  assertContains(page, "<dt className=\"sr-only\">{item.label}</dt>");
  assertContains(page, "aria-label={`${item.label}: ${item.value}`}");
  assertContains(page, "aria-label={`${columnLabel(liveData, \"productId\")}: ${productId}`}");
  assertContains(page, "compactMetricLabel(");
  assertContains(page, "[overflow-wrap:anywhere]");
  assertContains(page, "<h3 className=\"sr-only\">{labels.productIdentity}</h3>");
  assertContains(page, "<h3 className=\"sr-only\">{labels.codes}</h3>");
  assertContains(page, "<h3 className=\"sr-only\">{labels.classification}</h3>");
  assertContains(page, "<h3 className=\"sr-only\">{labels.pricingStock}</h3>");
  assertContains(page, "<h3 className=\"sr-only\">{labels.statusUpdated}</h3>");
  assert.doesNotMatch(page, /\{columnLabel\(liveData, "productId"\)\}: \{productId\}/);
  assert.doesNotMatch(page, /<span className="min-w-0 truncate">\{item\.label\}<\/span>/);
});

test("TASK-068M product row actions and catalog toolbar use decorative inline icons", () => {
  const page = read("src/app/shop/products/page.tsx");
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const packageJson = read("package.json");

  assertContains(page, "data-product-action-toolbar");
  assertContains(page, "<ProductsIcon name=\"eye\" />");
  assertContains(page, "icon: \"archive\"");
  assertContains(page, "icon: \"restore\"");
  assertContains(page, "aria-label={`${labels.detail}: ${productLabel}`}");
  assertContains(page, "aria-label={`${item.label}: ${productLabel}`}");
  assert.doesNotMatch(page, /action: "edit"/);
  assert.doesNotMatch(page, /labels\.edit/);
  assert.doesNotMatch(page, /item\.action === "edit"/);

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

test("TASK-068M catalog category and supplier pages reuse loaded lightweight read models", () => {
  for (const [pagePath, readModelCall] of [
    [
      "src/app/shop/categories/page.tsx",
      "getShopCategoriesPageReadModel({",
    ],
    [
      "src/app/shop/suppliers/page.tsx",
      "getShopSuppliersPageReadModel({",
    ],
  ]) {
    const page = read(pagePath);

    assertContains(page, readModelCall);
    assertContains(page, "catalogOptionsReadModel: catalogReadModel");
    assert.doesNotMatch(page, /getShopInventoryReadModel\(/);
    assert.doesNotMatch(
      page,
      /getShopSectionForRequest\([^)]*\)\s*,\s*\n\s*getShop.*ReadModel/s,
      `${pagePath} must not load its catalog read model twice`,
    );
  }

  const sectionData = read("src/server/shop-admin/shop-section-data.ts");

  assertContains(sectionData, "inventoryReadModel?: ShopInventoryReadModel");
  assertContains(sectionData, "catalogOptionsReadModel?: ShopCatalogOptionsReadModel");
  assertContains(sectionData, "options.inventoryReadModel ??");
  assertContains(sectionData, "options.catalogOptionsReadModel ??");
});
