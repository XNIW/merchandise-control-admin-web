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

function functionBody(source, start, end) {
  const match = source.match(new RegExp(`${start}[\\s\\S]*?${end}`));

  assert.ok(match, `${start} body must be present`);
  return match[0];
}

// Legacy test name; canonical tracking is TASK-079.
test("TASK-080 governance is archived under canonical TASK-079", () => {
  const masterPlan = read("docs/MASTER-PLAN.md");
  const task = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-080-categories-suppliers-pagination-search-ui-polish.md",
  );
  const canonicalTask = read(
    "docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md",
  );
  const canonicalEvidence = read("docs/TASKS/EVIDENCE/TASK-079/README.md");
  const evidence = read(
    "docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-080/README.md",
  );

  assertContains(masterPlan, "Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`");
  assertContains(masterPlan, "Riconciliazione governance TASK-079 2026-06-21");
  assert.doesNotMatch(masterPlan, /\n- Task TASK-080:/);
  assertContains(canonicalTask, "079.8 Categories server-side pagination/search/UI polish");
  assertContains(canonicalTask, "079.9 Suppliers server-side pagination/search/UI polish");
  assertContains(canonicalEvidence, "079.8 Categories pagination");
  assertContains(canonicalEvidence, "079.9 Suppliers pagination");
  assertContains(task, "Nessun caricamento completo di categorie/fornitori per la lista paginata.");
  assertContains(task, "Stato:");
  assert.doesNotMatch(task, /Stato: `DONE`/);
  assertContains(evidence, "TASK-080");
});

test("TASK-080 catalog entity read model paginates and searches server-side", () => {
  const readModel = read("src/server/shop-admin/inventory-read-model.ts");
  const entityPageBody = functionBody(
    readModel,
    "async function getShopCatalogEntityPageReadModel",
    "export async function getShopCategoriesPageReadModel",
  );
  const fetchBody = functionBody(
    readModel,
    "async function fetchCatalogEntityRows",
    "async function getShopCatalogEntityPageReadModel",
  );
  const productCountsBody = functionBody(
    readModel,
    "async function loadCatalogEntityActiveProductCounts",
    "async function fetchProductsPage",
  );

  assertContains(readModel, "ShopCatalogEntityPageReadModel");
  assertContains(readModel, "const INVENTORY_CATALOG_ENTITY_PAGE_SIZES = [10, 25, 50, 100, 200] as const");
  assertContains(readModel, "normalizeCatalogEntityPage");
  assertContains(readModel, "normalizeCatalogEntityPageSize");
  assertContains(fetchBody, "input.includeExactCount ? { count: \"exact\" } : undefined");
  assertContains(fetchBody, "query = query.ilike(\"name\", `%${searchQuery}%`)");
  assertContains(fetchBody, ".range(input.from, input.to)");
  assertContains(entityPageBody, "filters: ShopCatalogEntityPageReadModel[\"filters\"]");
  assertContains(entityPageBody, "pagination: {");
  assertContains(entityPageBody, "loadCatalogEntityActiveProductCounts");
  assertContains(productCountsBody, 'const aggregateCountSelect = `${relationColumn},${["c", "ount()"].join("")}`');
  assertContains(productCountsBody, ".select(aggregateCountSelect)");
  assertContains(productCountsBody, ".in(relationColumn, entityIds)");
  assertContains(productCountsBody, "inventory_products.${input.entity}.linkedCounts");
  assert.doesNotMatch(productCountsBody, /countInventoryRows/);
  assert.doesNotMatch(productCountsBody, /Promise\.all/);
  assert.doesNotMatch(fetchBody, /fetchInventoryRows[\s\S]*"all"/);
});

test("TASK-080 categories and suppliers pages preserve URL state and dialog options", () => {
  for (const [pagePath, readCall, optionName, actionParam] of [
    [
      "src/app/shop/categories/page.tsx",
      "getShopCategoriesPageReadModel({",
      "categoryOptions = mapCategoryOptions(catalogOptionsReadModel.categories)",
      "category_action",
    ],
    [
      "src/app/shop/suppliers/page.tsx",
      "getShopSuppliersPageReadModel({",
      "supplierOptions = mapSupplierOptions(catalogOptionsReadModel.suppliers)",
      "supplier_action",
    ],
  ]) {
    const page = read(pagePath);

    assertContains(page, "page?: string | string[]");
    assertContains(page, "pageSize?: string | string[]");
    assertContains(page, "q?: string | string[]");
    assertContains(page, "state?: string | string[]");
    assertContains(page, "getFirstParam(params, [\"q\", \"query\"])");
    assertContains(page, readCall);
    assertContains(page, "filters: {");
    assertContains(page, "page: selectedPage");
    assertContains(page, "pageSize: selectedPageSize");
    assertContains(page, "getShopCatalogOptionsReadModel({ requestedShopId })");
    assertContains(page, optionName);
    assertContains(page, "CatalogEntityPagination");
    assertContains(page, "filters={catalogReadModel.filters}");
    assertContains(page, "pagination={catalogReadModel.pagination}");
    assertContains(page, "name=\"pageSize\"");
    assertContains(page, "name=\"q\"");
    assertContains(page, "selectedState !== \"active\" ? (");
    assertContains(page, "<input name=\"state\" type=\"hidden\" value={selectedState} />");
    assertContains(page, "nextParams.set(\"q\", searchQuery)");
    assertContains(page, "nextParams.set(\"page\", page)");
    assertContains(page, "nextParams.set(\"pageSize\", pageSize)");
    assertContains(page, `nextParams.set("${actionParam}", action)`);
    assert.doesNotMatch(page, /getShopInventoryReadModel\(/);
  }
});

test("TASK-080 catalog entity UI stays compact and exposes pagination controls", () => {
  const list = read("src/app/shop/_components/CatalogEntityList.tsx");

  assertContains(list, "CatalogEntityPagination");
  assertContains(list, "data-catalog-entity-pagination");
  assertContains(list, "CatalogEntityPaginationState");
  assertContains(list, "buildCatalogEntityHref");
  assertContains(list, "rangeStart");
  assertContains(list, "rangeEnd");
  assertContains(list, "rowText(row, \"state\") || \"Active\"");
  assertContains(list, "border-emerald-200 bg-emerald-50");
  assertContains(list, "border-amber-200 bg-amber-50");
  assertContains(list, "data-catalog-entity-card");
});

test("TASK-080 products and import supplier keep complete catalog options", () => {
  const productsPage = read("src/app/shop/products/page.tsx");
  const importPanel = read("src/app/shop/_components/ImportExportActionPanel.tsx");

  assertContains(productsPage, "getShopCatalogOptionsReadModel");
  assertContains(productsPage, "categoryOptions: mapCategoryOptions(catalogOptions.categories)");
  assertContains(productsPage, "supplierOptions: mapSupplierOptions(catalogOptions.suppliers)");
  assertContains(productsPage, "scope=\"products\"");
  assertContains(importPanel, "categories");
  assertContains(importPanel, "suppliers");
  assertContains(importPanel, "Import supplier");
});
