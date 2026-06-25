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
  assertContains(productsPage, 'includeExactTotals: "count-only"');
  assertContains(productsPage, "ProductDetailModalController");
  assertContains(productsPage, "HistoryDetailModalController");
  assertContains(productsPage, "data-product-detail-trigger");
  assertContains(productsPage, "data-product-detail-id={productId}");
  assertContains(productsPage, "canManageProducts={canManageProducts}");
  assertContains(productsPage, "rowActions={{");
  assert.doesNotMatch(productsPage, /getShopInventoryProductDetailReadModel/);
  assert.doesNotMatch(productsPage, /getShopProductDetailModalReadModel/);
  assert.doesNotMatch(productsPage, /getShopHistoryDetailModalReadModel/);
  assert.doesNotMatch(productsPage, /getShopHistoryReadModel/);
});

test("TASK-078 modal route handlers are dynamic, no-store, and server-only backed", () => {
  const productRoute = read("src/app/shop/products/detail/route.ts");
  const historyRoute = read("src/app/shop/history/detail/route.ts");
  const modalReadModel = read("src/server/shop-admin/detail-modal-read-model.ts");
  const historyReadModel = read("src/server/shop-admin/history-read-model.ts");

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
  assertContains(modalReadModel, "getShopInventoryProductsByCodes");
  assertContains(historyReadModel, "stringifyRedactedJson");
  assertContains(historyReadModel, "redactShopAdminJson");
  assertContains(modalReadModel, ".slice(0, 25)");
  assertContains(modalReadModel, ".slice(0, 200)");
  assert.doesNotMatch(modalReadModel, /codes\.map\(async/);
  assert.doesNotMatch(modalReadModel, /getShopInventoryProductsPage/);
  assert.doesNotMatch(modalReadModel, /\.rpc\(/);
  assert.doesNotMatch(modalReadModel, /createSupabaseAdminClient/);
  assert.doesNotMatch(modalReadModel, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(modalReadModel, /process\.env/);
  assert.doesNotMatch(modalReadModel, /\.from\("audit_logs"\)/);
  assert.doesNotMatch(modalReadModel, /service[_-]?role/i);
});

test("TASK-078 product detail modal supports editable overview/actions and tabbed lazy data", () => {
  const controller = read(
    "src/app/shop/_components/ProductDetailModalController.tsx",
  );
  const focusTrap = read("src/app/shop/_components/useModalFocusTrap.ts");
  const actions = read("src/app/shop/actions.ts");

  assertContains(controller, "fetch(`/shop/products/detail?");
  assertContains(controller, "updateProductInlineAction");
  assertContains(controller, "archiveProductInlineAction");
  assertContains(controller, "restoreProductInlineAction");
  assertContains(controller, "ProductDetailIcon");
  assertContains(controller, "CopyChip");
  assertContains(controller, 'label: "Overview"');
  assertContains(controller, 'label: "Prices"');
  assertContains(controller, 'label: "Inventory / Sync"');
  assertContains(controller, 'label: "History entries"');
  assertContains(controller, 'label: "Advanced"');
  assertContains(controller, "ProductOverviewForm");
  assertContains(controller, "data-product-overview-edit-form");
  assertContains(controller, "overviewFormId");
  assertContains(controller, "draftDirty");
  assertContains(controller, "isProductDraftDirty(product, draft)");
  assertContains(controller, 'form={overviewFormId}');
  assertContains(controller, "Product identity");
  assertContains(controller, "Mobile sync");
  assertContains(controller, "Reset changes");
  assertContains(controller, "Mapped to mobile inventory");
  assertContains(controller, "Danger area");
  assertContains(controller, "Current purchase price");
  assertContains(controller, "No previous price changes are recorded for this product.");
  assertContains(controller, "Save");
  assertContains(controller, "Close");
  assertContains(controller, "const closeDisabled = updatePending || archivePending || restorePending");
  assertContains(controller, "onClose={closeDisabled ? undefined : requestCloseModal}");
  assertContains(controller, "disabled={closeDisabled}");
  assertContains(controller, "data-history-detail-trigger");
  assertContains(focusTrap, "modalFocusTrapStack");
  assertContains(focusTrap, "modalFocusTrapStack[modalFocusTrapStack.length - 1] !== trapId");
  assert.doesNotMatch(controller, /document\.addEventListener\("keydown"/);
  assert.doesNotMatch(controller, /ProductQuickEditForm|data-product-quick-edit-form|quickEditFormId|translate\("Full edit"\)|mode === "edit"|Editing product/);
  assertContains(actions, "export async function updateProductInlineAction");
  assertContains(actions, "export async function archiveProductInlineAction");
  assertContains(actions, "export async function restoreProductInlineAction");
});

test("TASK-078 history page stays on the light list and opens detail lazily", () => {
  const historyPage = read("src/app/shop/history/page.tsx");
  const historyList = read(
    "src/app/shop/_components/HistoryEntriesClientList.tsx",
  );

  assertContains(historyPage, "getShopHistoryListReadModel");
  assertContains(historyPage, "HistoryEntriesClientList");
  assertContains(historyPage, "rawRows={section.liveData?.rows ?? []}");
  assertContains(historyPage, "ProductDetailModalController");
  assertContains(historyList, "data-history-entries-list");
  assertContains(historyList, "data-history-detail-trigger");
  assertContains(historyList, "Search, status, month and pagination run server-side before rows are rendered.");
  assertContains(historyList, "All time");
  assertContains(historyList, "This month");
  assertContains(historyList, "Active + issues");
  assertContains(historyList, "Deleted");
  assertContains(historyList, "monthTitle");
  assertContains(historyList, "buildHistoryDetailHref");
  assert.doesNotMatch(historyPage, /Open Detail/);
  assert.doesNotMatch(historyPage, /getShopHistoryReadModel/);
  assert.doesNotMatch(historyPage, /getShopHistoryDetailReadModel/);
  assert.doesNotMatch(historyPage, /getShopHistoryDetailModalReadModel/);
  assert.doesNotMatch(historyPage, /rawJsonPreview/);
  assert.doesNotMatch(historyPage, /payloadSummary/);
  assert.doesNotMatch(historyPage, /shared_sheet_session_diagnostics/);
  assert.doesNotMatch(historyPage, /secondaryRowActions/);
  assert.doesNotMatch(historyList, /fetch\(/);
  assert.doesNotMatch(historyList, /Details load when opened\./);
});

test("TASK-078 history detail modal exposes rows, missing, links and collapsed diagnostics", () => {
  const controller = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assertContains(controller, "fetch(`/shop/history/detail?");
  assertContains(controller, 'cache: "no-store"');
  assertContains(controller, 'credentials: "same-origin"');
  assertContains(controller, 'label: "Rows preview"');
  assertContains(controller, 'label: "Missing / errors"');
  assertContains(controller, 'label: "Linked products"');
  assertContains(controller, 'label: "Sync events"');
  assertContains(controller, "HistoryDetailIcon");
  assertContains(controller, "Redacted diagnostics");
  assertContains(controller, "Row filters");
  assertContains(controller, "Ignored header row");
  assertContains(controller, "No match");
  assertContains(controller, "Product not resolved from barcode or item code");
  assertContains(controller, "No.");
  assertContains(controller, "Item code");
  assertContains(controller, "Barcode");
  assertContains(controller, "Product");
  assertContains(controller, "Quantity");
  assertContains(controller, "Purchase");
  assertContains(controller, "Retail");
  assertContains(controller, "Status");
  assertContains(controller, "data-product-detail-trigger");
  assertContains(controller, "<details");
  assertContains(controller, "const closeDisabled = saving");
  assertContains(controller, "closeDisabled ? undefined : requestCloseModal");
  assertContains(controller, "disabled={closeDisabled}");
  assertContains(controller, 'return isUnresolvedValue(value) ? "—" : String(value);');
  assert.doesNotMatch(controller, /document\.addEventListener\("keydown"/);
  assert.doesNotMatch(controller, /Authorization|process\.env|SUPABASE|service[_-]?role/i);
  assert.doesNotMatch(controller, /JSON\.stringify\(readModel\)/);
  assert.doesNotMatch(controller, /<details[^>]*open/);
  assert.doesNotMatch(controller, /label: "Raw diagnostics"/);
});
