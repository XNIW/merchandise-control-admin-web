import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

test("latest request identity deterministically rejects a late stale response", async () => {
  const { LatestAbortableRequest } = await import(
    "../../src/app/shop/_components/latest-abortable-request.ts"
  );
  const coordinator = new LatestAbortableRequest();
  const responseA = deferred();
  const responseB = deferred();
  let rendered = "idle";

  const requestA = coordinator.start();
  const runA = responseA.promise.then((value) => {
    if (requestA.isLatest()) rendered = value;
  });
  const requestB = coordinator.start();
  const runB = responseB.promise.then((value) => {
    if (requestB.isLatest()) rendered = value;
  });

  assert.equal(requestA.signal.aborted, true);
  responseB.resolve("response-b");
  await runB;
  responseA.resolve("response-a");
  await runA;

  assert.equal(rendered, "response-b");
  assert.equal(requestA.isLatest(), false);
  assert.equal(requestB.isLatest(), true);
});

test("request-driven views bind fetch state to the latest request", () => {
  for (const path of [
    "src/app/shop/_components/ProductDetailModalController.tsx",
    "src/app/shop/_components/HistoryDetailModalController.tsx",
    "src/app/shop/pos/PosRevenueDashboard.tsx",
  ]) {
    const controller = read(path);

    assert.match(controller, /new LatestAbortableRequest\(\)/);
    assert.match(controller, /signal: request\.signal/);
    assert.match(controller, /if \(!request\.isLatest\(\)\)/);
    assert.match(
      controller,
      /(?:detailRequestRef\.current|refreshRequest)\.cancel\(\)/,
    );
  }
});

test("product editor submits its loaded revision and exposes recoverable conflict UI", () => {
  const controller = read(
    "src/app/shop/_components/ProductDetailModalController.tsx",
  );
  const actions = read("src/app/shop/actions.ts");
  const mutations = read("src/server/shop-admin/catalog-mutations.ts");

  assert.match(controller, /name="expectedUpdatedAt"/);
  assert.match(controller, /value=\{product\.updatedAt\}/);
  assert.match(controller, /result\.code === "stale_revision"/);
  assert.match(controller, /rebaseDraftFrom: product/);
  assert.match(controller, /rebaseProductDraft\(rebaseDraftFrom, latestProduct/);
  assert.match(controller, /Reload server version/);
  assert.match(actions, /formString\(formData, "expectedUpdatedAt"\)/);
  assert.match(
    mutations,
    /shop_catalog_update_product_if_revision_with_sync/,
  );
  assert.match(mutations, /p_expected_updated_at: expectedUpdatedAt/);
});

test("product conflict rebase uses server-equivalent field canonicalization", async () => {
  const { productDraftFromProduct, rebaseProductDraft } = await import(
    "../../src/lib/product-draft-rebase.ts"
  );
  const base = {
    barcode: "BAR-1",
    categoryName: "Drinks",
    itemNumber: "ITEM-1",
    productName: "Caf\u00e9",
    purchasePrice: 1,
    retailPrice: 1.2,
    secondProductName: "Tea",
    stockQuantity: 1,
    supplierName: "Supplier One",
  };
  const latest = {
    ...base,
    categoryName: "Server category",
    itemNumber: "ITEM-2",
    productName: "Server name",
    retailPrice: 1.3,
    secondProductName: "Server secondary name",
    stockQuantity: 2,
    supplierName: "Server supplier",
  };
  const semanticNoOpDraft = {
    ...productDraftFromProduct(base),
    categoryName: " \uFEFFDRINKS\uFEFF ",
    itemNumber: "\uFEFFITEM-1\uFEFF",
    productName: "Cafe\u0301",
    retailPrice: "1.20",
    secondProductName: "\uFEFFTea\uFEFF",
    stockQuantity: "01",
    supplierName: " \uFEFFSupplier  One\uFEFF ",
  };

  assert.deepEqual(
    rebaseProductDraft(base, latest, semanticNoOpDraft),
    productDraftFromProduct(latest),
  );

  const locallyEdited = {
    ...semanticNoOpDraft,
    productName: "Local name",
  };
  assert.equal(
    rebaseProductDraft(base, latest, locallyEdited).productName,
    "Local name",
  );
  assert.equal(rebaseProductDraft(base, latest, locallyEdited).retailPrice, "1.3");
});

test("supplier apply is non-interruptible, visible and double-submit safe", () => {
  const catalog = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const wizard = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );

  assert.match(catalog, /closeDisabled=\{supplierImportBusy\}/);
  assert.match(catalog, /onBusyStateChange=\{setSupplierImportBusy\}/);
  assert.match(wizard, /if \(applyInFlightRef\.current\)/);
  assert.match(wizard, /window\.addEventListener\("beforeunload"/);
  assert.match(wizard, /Operation in progress — wait for completion/);
  assert.match(wizard, /Importing supplier workbook\.\.\./);
  assert.doesNotMatch(wizard, /Cancel import|Abort import/);
});

test("revision migration is additive, locked down and non-destructive", () => {
  const migration = read(
    "supabase/migrations/20260812010000_cross_platform_product_revision_guard.sql",
  );

  assert.match(
    migration,
    /shop_catalog_update_product_if_revision_with_sync/,
  );
  assert.match(
    migration,
    /staff_web_catalog_update_product_if_revision_v1/,
  );
  assert.match(migration, /for update;/i);
  assert.match(migration, /is distinct from p_expected_updated_at/);
  assert.match(migration, /'stale_revision'/);
  assert.match(migration, /grant execute[\s\S]*to authenticated, service_role/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.match(
    migration,
    /shop_catalog_set_product_archived_if_revision_with_sync/,
  );
  assert.match(
    migration,
    /staff_web_catalog_set_product_archived_if_revision_v1/,
  );
  assert.match(migration, /app_private\.catalog_import_receipts/);
  assert.match(migration, /admin_catalog_import_receipt_lookup_v1/);
  assert.match(migration, /admin_catalog_import_receipt_claim_v1/);
  assert.match(migration, /admin_catalog_import_receipt_complete_v1/);
  assert.match(
    migration,
    /unique \(shop_id, actor_kind, actor_id, request_key\)/,
  );
  assert.match(migration, /v_receipt\.claim_token <> p_claim_token/);
  assert.match(migration, /v_receipt\.request_fingerprint <> p_request_fingerprint/);
  assert.doesNotMatch(
    migration,
    /\b(?:drop\s+table|truncate\s+table|delete\s+from)\b/i,
  );
});

test("archive and restore submit the rendered product revision", () => {
  const catalog = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const detail = read(
    "src/app/shop/_components/ProductDetailModalController.tsx",
  );
  const actions = read("src/app/shop/actions.ts");
  const mutations = read("src/server/shop-admin/catalog-mutations.ts");
  const advancedArchiveForm = detail.slice(
    detail.indexOf("function ProductArchiveForm"),
    detail.indexOf("export function ProductDetailModalController"),
  );

  assert.match(catalog, /name="expectedUpdatedAt"/);
  assert.match(catalog, /value=\{selectedProduct\.updatedAt\}/);
  assert.match(
    advancedArchiveForm,
    /name="expectedUpdatedAt"[\s\S]*value=\{product\.updatedAt\}/,
  );
  assert.match(actions, /archiveProductAction[\s\S]*formString\(formData, "expectedUpdatedAt"\)/);
  assert.match(actions, /restoreProductAction[\s\S]*formString\(formData, "expectedUpdatedAt"\)/);
  assert.match(
    mutations,
    /shop_catalog_set_product_archived_if_revision_with_sync/,
  );
  assert.match(mutations, /p_expected_updated_at: expectedUpdatedAt/);
});

test("large imports keep existing products on revision-guarded updates", () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");

  assert.match(
    workbook,
    /const newProductRows = productsToApply\.filter\([\s\S]*!findProduct/,
  );
  assert.match(
    workbook,
    /const revisionGuardedProductRows = productsToApply\.filter\([\s\S]*findProduct/,
  );
  assert.match(
    workbook,
    /applyBulkProductImport\([\s\S]*newProductRows/,
  );
  assert.match(
    workbook,
    /revisionGuardedProductRows[\s\S]*updateProduct\(\{[\s\S]*expectedUpdatedAt: existing\.updatedAt/,
  );
});

test("supplier import claims and completes a durable receipt before replay", async () => {
  const workbook = read("src/server/shop-admin/import-export-workbook.ts");
  const fingerprintSource = read(
    "src/server/shop-admin/catalog-import-request-fingerprint.ts",
  );
  const rpc = read("src/server/shop-admin/staff-web-lease-bound-rpc.ts");
  const { canonicalCatalogImportRequestPayload } = await import(
    "../../src/server/shop-admin/catalog-import-request-fingerprint.ts"
  );

  const shared = {
    importMode: "supplier",
    previewDigest: "preview",
    syncPreviewDigest: "sync-preview",
  };
  const firstPayload = canonicalCatalogImportRequestPayload({
    ...shared,
    rowAdjustments: [
      { rowFingerprint: "row-8", rowNumber: 8, skip: true },
      {
        productName: "Tea",
        rawBarcode: "  BAR-7 ",
        rawItemNumber: " ITEM-7 ",
        rowFingerprint: "row-7",
        rowNumber: 7,
      },
    ],
  });
  const equivalentPayload = canonicalCatalogImportRequestPayload({
    ...shared,
    rowAdjustments: [
      {
        rowNumber: 7,
        rowFingerprint: "row-7",
        productName: "Tea",
        rawBarcode: "BAR-7",
        rawItemNumber: "ITEM-7",
      },
      { skip: true, rowNumber: 8, rowFingerprint: "row-8" },
    ],
  });

  assert.match(workbook, /catalogImportRequestFingerprint\(/);
  assert.match(
    workbook,
    /rowAdjustments: adjustmentValidation\.adjustments/,
  );
  assert.deepEqual(firstPayload, equivalentPayload);
  assert.doesNotMatch(fingerprintSource, /localeCompare|rawBarcode|rawItemNumber/);
  assert.notDeepEqual(
    firstPayload,
    canonicalCatalogImportRequestPayload({
      ...shared,
      rowAdjustments: [
        { rowFingerprint: "row-8", rowNumber: 8, skip: true },
        { productName: "Coffee", rowFingerprint: "row-7", rowNumber: 7 },
      ],
    }),
  );
  assert.match(workbook, /await callCatalogImportReceiptClaim\(/);
  assert.match(workbook, /await callCatalogImportReceiptLookup\(/);
  const applyImport = workbook.slice(
    workbook.indexOf("export async function applyCatalogWorkbookImport"),
    workbook.indexOf("function stringCell"),
  );
  assert.ok(
    applyImport.indexOf("await callCatalogImportReceiptLookup(") <
      applyImport.indexOf("const syncPreview = buildSupplierSyncPreview("),
    "receipt replay/indeterminate must resolve before state-dependent preview rebuild",
  );
  assert.ok(
    applyImport.indexOf("await callCatalogImportReceiptLookup(") <
      applyImport.indexOf("await getCatalogWorkbookReadModel(context)"),
    "receipt replay/indeterminate must resolve before current mapping lookup",
  );
  assert.match(
    applyImport,
    /previewDigest: requestPreviewDigest,[\s\S]*?await callCatalogImportReceiptLookup/,
  );
  const previewMismatchBranch = applyImport.slice(
    applyImport.indexOf("if (syncPreviewDigest !== syncPreview.fingerprint)"),
    applyImport.indexOf("if (!syncPreview.canApply)"),
  );
  assert.match(previewMismatchBranch, /shopAdminActionResult\("preview_mismatch"/);
  assert.doesNotMatch(previewMismatchBranch, /finalizeImportReceipt/);
  assert.ok(
    applyImport.indexOf("await callCatalogImportReceiptClaim(") >
      applyImport.indexOf("if (rowErrors.length > 0)"),
    "invalid previews must not create durable import receipts",
  );
  assert.ok(
    applyImport.indexOf("await callCatalogImportReceiptClaim(") <
      applyImport.indexOf("const supplierIdsByName = new Map("),
    "a validated request must claim atomically before its first mutation",
  );
  assert.match(workbook, /receiptClaimRoot\.state === "replay"/);
  assert.match(workbook, /receiptClaimRoot\.state !== "claimed"/);
  assert.match(workbook, /await callCatalogImportReceiptComplete\(/);
  assert.match(rpc, /admin_catalog_import_receipt_lookup_v1/);
  assert.match(rpc, /admin_catalog_import_receipt_claim_v1/);
  assert.match(rpc, /admin_catalog_import_receipt_complete_v1/);
});

test("guarded staging migration can validate an exact merged main revision", () => {
  const workflow = read(
    ".github/workflows/storefront-v1-staging-migrations.yml",
  );
  const revisionCaller = read(
    ".github/workflows/cross-platform-product-revision-staging.yml",
  );

  assert.match(workflow, /approvedBranch:/);
  assert.match(workflow, /refs\/heads\/integration\/storefront-v1/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /process\.env\.GITHUB_SHA === expectedHead/);
  assert.match(workflow, /APPLY_STOREFRONT_V1_STAGING/);
  assert.match(
    revisionCaller,
    /uses: \.\/\.github\/workflows\/storefront-v1-staging-migrations\.yml/,
  );
  assert.match(
    revisionCaller,
    /expected_migration_version: "20260812010000"/,
  );
  assert.match(
    revisionCaller,
    /expected_migration_name: cross_platform_product_revision_guard/,
  );
  assert.match(revisionCaller, /expected_head_sha: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(revisionCaller, /expected_predecessor_migration/);
  assert.match(revisionCaller, /run_performance_load: false/);
});

test("QA mutation fixture uses the same revision guards as the product UI", () => {
  const fixture = read("src/app/shop/qa-sync-fixture/route.ts");

  assert.match(fixture, /shop_catalog_update_product_if_revision_with_sync/);
  assert.match(
    fixture,
    /shop_catalog_set_product_archived_if_revision_with_sync/,
  );
  assert.match(fixture, /p_expected_updated_at: expectedUpdatedAt/);
  assert.doesNotMatch(
    fixture,
    /supabase\.rpc\("shop_catalog_(?:update|archive|restore)_product_with_sync"/,
  );
});

test("history saves have their own abortable request and cannot switch rows mid-save", () => {
  const history = read(
    "src/app/shop/_components/HistoryDetailModalController.tsx",
  );

  assert.match(history, /saveRequestRef = useRef\(new LatestAbortableRequest\(\)\)/);
  assert.match(history, /const request = saveRequestRef\.current\.start\(\)/);
  assert.match(history, /if \(!request\.isLatest\(\)\)/);
  assert.match(history, /saveRequestRef\.current\.cancel\(\)/);
});
