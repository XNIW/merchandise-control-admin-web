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

test("TASK-078 product page mounts lazy detail modals without expanding first paint", () => {
  const productsPage = read("src/app/shop/products/page.tsx");

  assertContains(productsPage, "getShopInventoryProductsPage");
  assertContains(productsPage, "includeExactTotals: false");
  assertContains(productsPage, "ProductDetailModalController");
  assertContains(productsPage, "HistoryDetailModalController");
  assertContains(productsPage, "data-product-detail-trigger");
  assertContains(productsPage, "data-product-detail-id={productId}");
  assertContains(productsPage, "canManageProducts={canManageProducts}");
  assertContains(productsPage, "rowActions={{");
  assert.doesNotMatch(productsPage, /getShopInventoryProductDetailReadModel/);
  assert.doesNotMatch(productsPage, /getShopHistoryReadModel/);
});

test("TASK-078 modal route handlers are dynamic, no-store, and server-only backed", () => {
  const productRoute = read("src/app/shop/products/detail/route.ts");
  const historyRoute = read("src/app/shop/history/detail/route.ts");
  const modalReadModel = read("src/server/shop-admin/detail-modal-read-model.ts");

  for (const route of [productRoute, historyRoute]) {
    assertContains(route, 'export const dynamic = "force-dynamic"');
    assertContains(route, 'export const runtime = "nodejs"');
    assertContains(route, '"Cache-Control": "no-store"');
  }

  assertContains(productRoute, "getShopProductDetailModalReadModel");
  assertContains(historyRoute, "getShopHistoryDetailModalReadModel");
  assertContains(modalReadModel, 'import "server-only"');
  assertContains(modalReadModel, "getShopInventoryProductDetailReadModel");
  assertContains(modalReadModel, "getShopHistoryDetailReadModel");
  assertContains(modalReadModel, "getShopInventoryProductsPage");
  assertContains(modalReadModel, "includeExactTotals: false");
  assertContains(modalReadModel, ".slice(0, 12)");
  assert.doesNotMatch(modalReadModel, /\.from\("audit_logs"\)/);
  assert.doesNotMatch(modalReadModel, /service[_-]?role/i);
});

test("TASK-078 product detail modal supports view/edit/actions and tabbed lazy data", () => {
  const controller = read(
    "src/app/shop/_components/ProductDetailModalController.tsx",
  );
  const actions = read("src/app/shop/actions.ts");

  assertContains(controller, "fetch(`/shop/products/detail?");
  assertContains(controller, "updateProductInlineAction");
  assertContains(controller, "archiveProductInlineAction");
  assertContains(controller, "restoreProductInlineAction");
  assertContains(controller, 'label: "Overview"');
  assertContains(controller, 'label: "Prices"');
  assertContains(controller, 'label: "Inventory / Sync"');
  assertContains(controller, 'label: "History entries"');
  assertContains(controller, 'label: "Advanced"');
  assertContains(controller, 'productDetailMode === "edit"');
  assertContains(controller, 'form={editFormId}');
  assertContains(controller, "Danger area");
  assertContains(controller, "Current purchase price");
  assertContains(controller, "No previous price changes are recorded for this product.");
  assertContains(controller, "Save");
  assertContains(controller, "Cancel");
  assertContains(controller, "data-history-detail-trigger");
  assertContains(actions, "export async function updateProductInlineAction");
  assertContains(actions, "export async function archiveProductInlineAction");
  assertContains(actions, "export async function restoreProductInlineAction");
});

test("TASK-078 history page stays on the light list and opens detail lazily", () => {
  const historyPage = read("src/app/shop/history/page.tsx");

  assertContains(historyPage, "getShopHistoryListReadModel");
  assertContains(historyPage, "HistoryEntriesList");
  assertContains(historyPage, "data-history-entries-list");
  assertContains(historyPage, "data-history-detail-trigger");
  assertContains(historyPage, "Detail contents");
  assertContains(historyPage, "Details load when opened.");
  assertContains(historyPage, "ProductDetailModalController");
  assert.doesNotMatch(historyPage, /Open Detail/);
  assert.doesNotMatch(historyPage, /getShopHistoryReadModel/);
  assert.doesNotMatch(historyPage, /rawJsonPreview/);
  assert.doesNotMatch(historyPage, /payloadSummary/);
  assert.doesNotMatch(historyPage, /shared_sheet_session_diagnostics/);
  assert.doesNotMatch(historyPage, /secondaryRowActions/);
});

test("TASK-078 history detail modal exposes rows, missing, links and collapsed diagnostics", () => {
  const controller = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assertContains(controller, "fetch(`/shop/history/detail?");
  assertContains(controller, 'label: "Rows preview"');
  assertContains(controller, 'label: "Missing / errors"');
  assertContains(controller, 'label: "Linked products"');
  assertContains(controller, 'label: "Sync events"');
  assertContains(controller, "Redacted diagnostics");
  assertContains(controller, "Row filters");
  assertContains(controller, "Ignored header row");
  assertContains(controller, "No product match");
  assertContains(controller, "No.");
  assertContains(controller, "Item code");
  assertContains(controller, "Barcode");
  assertContains(controller, "Product name");
  assertContains(controller, "Quantity");
  assertContains(controller, "Purchase");
  assertContains(controller, "Retail");
  assertContains(controller, "Completed / Missing");
  assertContains(controller, "data-product-detail-trigger");
  assertContains(controller, "<details");
  assert.doesNotMatch(controller, /<details[^>]*open/);
  assert.doesNotMatch(controller, /label: "Raw diagnostics"/);
});
