import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-032 catalog filters expose operator copy and a clear path", () => {
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");
  const categoriesPage = readProjectFile("src/app/shop/categories/page.tsx");
  const suppliersPage = readProjectFile("src/app/shop/suppliers/page.tsx");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");
  const localizedSources = `${productsPage}\n${categoriesPage}\n${suppliersPage}\n${dictionary}`;

  assert.match(productsPage, /dictionary\.common\.applyFilters/);
  assert.match(productsPage, /Reset filters/);
  assert.match(productsPage, /filterLabels\.allCategories/);
  assert.match(productsPage, /filterLabels\.allSuppliers/);
  assert.match(localizedSources, /Apply filters/);
  assert.match(localizedSources, /Reset filters/);
  assert.match(localizedSources, /Clear filters/);
  assert.match(localizedSources, /All categories/);
  assert.match(localizedSources, /All suppliers/);
  assert.match(productsPage, /name="state"/);
  assert.match(categoriesPage, /dictionary\.common\.applyFilters/);
  assert.match(categoriesPage, /dictionary\.common\.clearFilters/);
  assert.match(suppliersPage, /dictionary\.common\.applyFilters/);
  assert.match(suppliersPage, /dictionary\.common\.clearFilters/);
});

test("TASK-032 category and supplier lists expose ids required by action forms", () => {
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  assert.match(sectionData, /\{ key: "categoryId", label: "Category id" \}/);
  assert.match(sectionData, /categoryId: category\.categoryId/);
  assert.match(sectionData, /\{ key: "supplierId", label: "Supplier id" \}/);
  assert.match(sectionData, /supplierId: supplier\.supplierId/);
});

test("TASK-032 evidence tracks Shop Admin polish decisions", () => {
  const task = readProjectFile("docs/TASKS/TASK-032-full-project-progression-mega-task.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-032/README.md");

  assert.match(task, /2 - Shop Admin polish[\s\S]*`PASS_WITH_NOTES`/);
  assert.match(
    evidence,
    /FASE_(2_SHOP_ADMIN_AUDIT|3_EXCEL_HARDENING|4_PERMISSIONS_HARDENING|5_LOCAL_POS_E2E_HARNESS|6_HTTPS_NON_PRODUCTION)/,
  );
  assert.match(evidence, /Shop Admin polish/);
  assert.match(evidence, /BLOCKED_NO_AUTH_SESSION/);
});
