import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(escapeRegExp(required)), label);
}

test("TASK-068E Shop and Platform pages render summaries before controls and cards", () => {
  const sectionPage = read("src/components/shop/ShopSectionPage.tsx");
  const platformPage = read("src/components/platform/PlatformPage.tsx");

  assertContains(sectionPage, "beforeLiveData?: ReactNode");
  assertContains(sectionPage, "{beforeLiveData}");
  assertContains(sectionPage, "technicalMetricLabels");
  assertContains(sectionPage, "\"Loaded lower bound\"");
  assertContains(sectionPage, "\"Page\"");
  assertContains(sectionPage, "\"Range\"");
  assertContains(sectionPage, "primaryMetricPairs");
  assertContains(sectionPage, ").slice(0, 4)");
  assertContains(sectionPage, "<details");
  assertContains(sectionPage, "Technical details");
  assertContains(platformPage, "technicalStatLabels");
  assertContains(platformPage, "primaryStatPairs");
  assertContains(platformPage, "secondaryStatPairs");
  assertContains(platformPage, "<details");
  assert.ok(
    sectionPage.indexOf("localizedSection.metrics.map") <
      sectionPage.indexOf("{beforeLiveData}") &&
      sectionPage.indexOf("{beforeLiveData}") <
        sectionPage.indexOf("<SectionCard"),
    "Shop metrics must render before controls and live data cards",
  );
  assert.ok(
    platformPage.indexOf("localizedSection.stats.map") <
      platformPage.indexOf("localizedSection.purposeItems"),
    "Platform stats must render before purpose/controls content",
  );

  for (const pagePath of [
    "src/app/shop/products/page.tsx",
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/sync/page.tsx",
    "src/app/shop/audit/page.tsx",
    "src/app/shop/history/page.tsx",
  ]) {
    assertContains(read(pagePath), "beforeLiveData", pagePath);
  }
});

test("TASK-068E products search suggestions stay server-side and lightweight", () => {
  const page = read("src/app/shop/products/page.tsx");
  const combobox = read(
    "src/app/shop/products/_components/ProductSearchCombobox.tsx",
  );
  const route = read("src/app/api/shop/products/search-suggestions/route.ts");

  assertContains(page, "ProductSearchCombobox");
  assertContains(page, "defaultValue={selectedQuery}");
  assertContains(page, 'activeFilterCount > 0 || productDialog ? false : "count-only"');
  assertContains(page, "\"Total products\"");
  assertContains(page, "\"Results\"");
  assertContains(page, "\"Filters\"");
  assert.doesNotMatch(page, /Calculating\.\.\.|Loaded lower bound/);
  assertContains(page, "data-product-cell=\"identity\"");
  assertContains(page, "data-product-cell=\"codes\"");
  assertContains(page, "data-product-cell=\"classification\"");
  assertContains(page, "data-product-cell=\"pricing-stock\"");
  assertContains(page, "data-product-cell=\"status\"");
  assertContains(page, "data-product-cell=\"actions\"");
  assertContains(page, "ProductCodeBlock");
  assertContains(page, "ProductClassificationBlock");
  assertContains(page, "ProductPriceStockBlock");
  assertContains(page, "ProductStatusBlock");
  assertContains(page, "min-[1400px]:grid-cols-[minmax(11.5rem,0.85fr)_minmax(11.5rem,0.85fr)_minmax(17rem,1.2fr)]");
  assert.doesNotMatch(page, /lg:grid-cols-\[minmax\(16rem,1\.35fr\)_minmax\(10rem,0\.75fr\)_minmax\(12rem,0\.85fr\)_minmax\(14rem,0\.95fr\)_minmax\(9rem,0\.65fr\)_auto\]/);
  assert.doesNotMatch(page, /lg:sticky/);
  assertContains(combobox, "\"use client\"");
  assertContains(combobox, "AbortController");
  assertContains(combobox, "window.setTimeout(() => {");
  assertContains(combobox, "}, 200)");
  assertContains(combobox, "form?.requestSubmit()");
  assertContains(combobox, "role=\"combobox\"");
  assertContains(combobox, "role=\"listbox\"");
  assertContains(combobox, "event.key === \"Enter\"");
  assertContains(route, "getShopInventoryProductsPage");
  assertContains(route, "includeExactTotals: false");
  assertContains(route, "pageSize: 10");
  assertContains(route, "page.products.slice(0, 8)");
  assertContains(route, "return noStoreJson([])");
  assert.doesNotMatch(route, /createClient|\.from\(|service_role/i);
});

test("TASK-068E products catalog cards stay compact without visible technical section headings", () => {
  const page = read("src/app/shop/products/page.tsx");
  const loading = read("src/app/shop/products/loading.tsx");

  assertContains(page, "[contain-intrinsic-size:180px]");
  assertContains(page, "line-clamp-2 break-words text-base font-semibold");
  assertContains(page, "repeat(auto-fit,minmax(7.5rem,1fr))");
  assertContains(page, "line-clamp-1 min-w-0 break-words font-mono text-base font-semibold");
  assertContains(page, "compactMetricLabel(");
  assertContains(page, "return labels.purchase;");
  assertContains(page, "return labels.retail;");
  assertContains(page, "return labels.stock;");
  assertContains(page, "purchase: translateText(dictionary, \"Purchase\")");
  assertContains(page, "retail: translateText(dictionary, \"Retail\")");
  assertContains(page, "stock: translateText(dictionary, \"Stock\")");
  assertContains(page, "data-product-actions");
  assertContains(page, "<dt className=\"sr-only\">{item.label}</dt>");
  assertContains(page, "aria-label={`${item.label}: ${item.value}`}");
  assertContains(page, "aria-label={`${columnLabel(liveData, \"productId\")}: ${productId}`}");
  assertContains(page, "<h3 className=\"sr-only\">{labels.pricingStock}</h3>");
  assertContains(page, "<h3 className=\"sr-only\">{labels.statusUpdated}</h3>");
  assertContains(page, "<h3 className=\"sr-only\">{rowActions.label}</h3>");
  assertContains(page, "sm:grid-cols-[minmax(0,1fr)_auto]");
  assert.doesNotMatch(page, /grid min-w-0 grid-cols-3 gap-1\.5/);
  assert.doesNotMatch(page, /\{columnLabel\(liveData, "productId"\)\}: \{productId\}/);
  assert.doesNotMatch(page, /<span className="min-w-0 truncate">\{item\.label\}<\/span>/);
  assert.doesNotMatch(page, />\s*(PRICING|STOCK|STATUS|UPDATED|ACTIONS|CODES|CLASSIFICATION)\s*</i);
  assertContains(loading, "[contain-intrinsic-size:160px]");
  assertContains(loading, "h-9 w-full bg-zinc-100");
});

test("TASK-068E product detail overview is the single editable product form", () => {
  const controller = read(
    "src/app/shop/_components/ProductDetailModalController.tsx",
  );
  const productsPage = read("src/app/shop/products/page.tsx");
  const actions = read("src/app/shop/actions.ts");
  const mutations = read("src/server/shop-admin/catalog-mutations.ts");

  assertContains(controller, "function ProductOverviewForm");
  assertContains(controller, "data-product-overview-edit-form");
  assertContains(controller, "form={overviewFormId}");
  assertContains(controller, "isProductDraftDirty(product, draft)");
  assertContains(controller, "setDraft(productDraftFromProduct(product))");
  assertContains(controller, "translate(\"Reset changes\")");
  assertContains(controller, "disabled={!draftDirty || updatePending}");
  assertContains(controller, "CreatableCatalogCombobox");
  assertContains(controller, "name=\"stockQuantity\"");
  assertContains(controller, "name=\"purchasePrice\"");
  assertContains(controller, "name=\"retailPrice\"");
  assertContains(controller, "name=\"productName\"");
  assertContains(controller, "name=\"barcode\"");
  assertContains(controller, "name=\"itemNumber\"");
  assertContains(controller, "name=\"secondProductName\"");
  assertContains(controller, "value={draft.productName}");
  assertContains(controller, "value={draft.supplierName}");
  assertContains(controller, "value={draft.categoryName}");
  assertContains(productsPage, "aria-label={`${labels.detail}: ${productLabel}`}");
  assertContains(productsPage, "data-product-detail-trigger");
  assertContains(productsPage, "buildProductDetailHref(params, productId)");
  assertContains(productsPage, "nextParams.set(\"product_action\", \"detail\")");
  assertContains(productsPage, "nextParams.set(\"product_id\", productId)");
  assertContains(controller, "action !== \"detail\" && action !== \"edit\"");
  assertContains(actions, "updateProductInlineAction");
  assertContains(actions, "resolveProductCatalogRelations(formData, input)");
  assertContains(mutations, "rpcResult(");
  assertContains(mutations, "\"products.write\"");
  assertContains(mutations, "shop_catalog_update_product");
  assert.doesNotMatch(productsPage, /action: "edit"|labels\.edit|item\.action === "edit"|data-product-detail-mode/);
  assert.doesNotMatch(controller, /ProductQuickEditForm|data-product-quick-edit-form|quickEditFormId|translate\("Full edit"\)|ProductEditForm|mode === "edit"/);
  assert.doesNotMatch(controller, /createClient|SUPABASE|service[_-]?role/i);
});

test("TASK-068E supplier and category fields use keyboard creatable combobox suggestions", () => {
  const panel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const controller = read(
    "src/app/shop/_components/ProductDetailModalController.tsx",
  );
  const combobox = read("src/app/shop/_components/CreatableCatalogCombobox.tsx");

  assertContains(`${panel}\n${controller}`, "CreatableCatalogCombobox");
  assertContains(panel, "Create new supplier");
  assertContains(panel, "Create new category");
  assertContains(controller, "Create new supplier");
  assertContains(controller, "Create new category");
  assertContains(combobox, "\"use client\"");
  assertContains(combobox, "onNameChange?: (value: string) => void");
  assertContains(combobox, "value: controlledValue");
  assertContains(combobox, "onNameChange?.(nextValue)");
  assertContains(combobox, "role=\"combobox\"");
  assertContains(combobox, "role=\"listbox\"");
  assertContains(combobox, "aria-activedescendant");
  assertContains(combobox, "event.key === \"ArrowDown\"");
  assertContains(combobox, "event.key === \"ArrowUp\"");
  assertContains(combobox, "event.key === \"Enter\"");
  assertContains(combobox, "event.key === \"Escape\"");
  assertContains(combobox, "onMouseDown");
  assertContains(combobox, "{createLabel}: {value.trim()}");
  assertContains(combobox, "value={exactOption?.id ?? \"\"}");
  assert.doesNotMatch(`${panel}\n${controller}`, /<datalist|list="supplier-options"|list="category-options"/);
});

test("TASK-068E suppliers and categories use card lists with real linked counts", () => {
  const list = read("src/app/shop/_components/CatalogEntityList.tsx");
  const categoriesPage = read("src/app/shop/categories/page.tsx");
  const suppliersPage = read("src/app/shop/suppliers/page.tsx");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const readModel = read("src/server/shop-admin/inventory-read-model.ts");

  assertContains(list, "data-catalog-entity-card");
  assertContains(list, "activeProductsCount");
  assertContains(list, "linkedProducts");
  assertContains(list, "rowActions.render(row)");
  assertContains(categoriesPage, "CatalogEntityList");
  assertContains(categoriesPage, "icon=\"category\"");
  assertContains(categoriesPage, "Rename or delete");
  assertContains(suppliersPage, "CatalogEntityList");
  assertContains(suppliersPage, "icon=\"supplier\"");
  assertContains(suppliersPage, "Rename or delete");
  assertContains(sectionData, "{ key: \"activeProductsCount\", label: \"Linked active products\" }");
  assertContains(readModel, "loadCatalogEntityActiveProductCounts");
  assertContains(readModel, "table: \"inventory_products\"");
  assertContains(readModel, "relationColumn");
  assert.doesNotMatch(categoriesPage, />\s*Category id\s*</);
  assert.doesNotMatch(suppliersPage, />\s*Supplier id\s*</);
});

test("TASK-068E in-use catalog delete is guided and never blindly archives", () => {
  const panel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const actions = read("src/app/shop/actions.ts");
  const mutations = read("src/server/shop-admin/catalog-mutations.ts");

  for (const required of [
    "Replace with existing",
    "Create new and replace",
    "Remove assignment",
    "archiveSupplierWithStrategyAction",
    "archiveCategoryWithStrategyAction",
    "delete_if_unused",
    "replace_existing",
    "create_replacement",
    "clear_assignments",
  ]) {
    assertContains(`${panel}\n${actions}\n${mutations}`, required);
  }

  assertContains(mutations, "collectLinkedActiveProductIds");
  assertContains(mutations, "updateLinkedProductAssignments");
  assertContains(mutations, "strategy:");
  assertContains(mutations, "This row is linked to active products");
  assertContains(mutations, "replacementId");
  assertContains(mutations, "replacementName");
  assert.doesNotMatch(panel, /action=\{archiveSupplierAction\}/);
  assert.doesNotMatch(panel, /action=\{archiveCategoryAction\}/);
});
