import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function functionBody(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} not found`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `${end} not found`);
  return source.slice(startIndex, endIndex);
}

test("TASK-088 final Admin sync fixture keeps legacy prefixes and exact final prefix", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");

  assert.match(route, /prefix\.startsWith\("SYNC_TEST_"\)/);
  assert.match(route, /prefix\.startsWith\("SYNC_PERF_"\)/);
  assert.match(
    route,
    /\^TASK_SYNC_FINAL_20260714_\[A-Za-z0-9\]\[A-Za-z0-9-\]\{5,63\}_\$/,
  );
  assert.match(route, /FINAL_SYNC_PREFIX\.test\(prefix\)/);
  assert.match(route, /FINAL_SYNC_ID\.test\(correlationId\)/);
  assert.match(route, /FINAL_SYNC_ID\.test\(fixtureId\)/);
  assert.match(route, /value\.confirm !== "staging-sync-final"/);
  assert.doesNotMatch(
    route,
    /startsWith\("TASK_SYNC_FINAL_20260714_"\)/,
    "generic or nested final prefixes must not be admitted",
  );
});

test("TASK-088 final Admin sync fixture is authenticated, same-origin and shop-scoped", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");

  assert.match(route, /export async function POST\(request: NextRequest\)/);
  assert.doesNotMatch(route, /export async function GET\(/);
  assert.match(route, /function isSameOriginMutation\(request: NextRequest\)/);
  assert.match(route, /fetchSite !== "same-origin"/);
  assert.match(route, /parsedOrigin\.host === host/);
  assert.match(route, /resolveShopActionContext\(input\.shopId, "products\.write"\)/);
  assert.match(route, /requestedShopId: input\.shopId/g);
  assert.match(route, /\.eq\("shop_id", context\.selectedShop\.shopId\)/);
  assert.match(route, /shopId\.includes\("%"\)/);
  assert.match(route, /return 403/);
});

test("TASK-088 final Admin sync fixture exposes stable metrics and marker", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");

  for (const required of [
    'const FINAL_SYNC_MARKER = "TASK_SYNC_FINAL_ADMIN_V1"',
    'source: "admin_web_qa_sync_fixture"',
    "serverTimestamp: new Date().toISOString()",
    "checkpointBefore",
    "checkpointAfter",
    "pendingBefore",
    "pendingAfter",
    "queryCount",
    "pageCount",
    "recordCount",
    "payloadBytes",
    "retryCount",
    "fullPull: false",
    "beforeReadElapsedMs",
    "serverCommitElapsedMs",
    "afterReadElapsedMs",
    'status: result === "N/A_NOT_REQUIRED" ? result : "PASS"',
    '"Cache-Control": "no-store"',
  ]) {
    assert.match(route, new RegExp(required.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")));
  }
});

test("TASK-088 final mutations avoid redundant bounded read-model round trips", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");
  const finalRunner = functionBody(
    route,
    "async function runFinalSyncRequest",
    "export async function POST",
  );

  assert.match(finalRunner, /const needsPreMutationRead =/);
  assert.match(
    finalRunner,
    /input\.scenario === "duplicate" && Boolean\(input\.entityId\)/,
  );
  assert.match(finalRunner, /input\.operation !== "create" && !input\.entityId/);
  assert.match(finalRunner, /emptyFinalSyncObservation\(\)/);
  assert.match(finalRunner, /recordCount: observationInput\.entityId \? 1 : 0/);
  assert.match(finalRunner, /actionResult\.auditEventId \?\? after\.eventId \?\? before\.eventId/);
  assert.match(finalRunner, /checkpointAfter: after\.checkpoint \?\? before\.checkpoint/);
  assert.match(finalRunner, /result = "duplicate_replayed"/);
  assert.match(route, /create \? "NAME" : "NAME_UPDATED"/);
  assert.doesNotMatch(finalRunner, /: await observeFinalSync\(observationInput\)/);
});

test("TASK-088 final mode never writes History and treats ProductPrice tombstone as append-only N/A", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");
  const finalRunner = functionBody(
    route,
    "async function runFinalSyncRequest",
    "export async function POST",
  );
  const finalParser = functionBody(
    route,
    "function parseFinalSyncRequest",
    "function finalSyncBase",
  );
  const priceMutation = functionBody(
    route,
    "async function mutateFinalProductPrice",
    "function finalJson",
  );

  assert.match(finalParser, /historyReadOnly/);
  assert.match(finalParser, /finalOperation !== "observe"/);
  assert.match(finalParser, /finalOperation !== "noop"/);
  assert.match(finalParser, /finalOperation !== "residue"/);
  assert.doesNotMatch(finalRunner, /createHistoryEntry|updateHistoryEntry|tombstoneHistoryEntry/);
  assert.match(priceMutation, /operation === "archive" \? "tombstone"/);
  assert.match(finalRunner, /result = "N\/A_NOT_REQUIRED"/);
  assert.match(priceMutation, /emitPriceHistoryImportSyncEvent/);
  assert.match(priceMutation, /const appendVersion = operation === "update"/);
  assert.match(priceMutation, /\.select\("id,product_id,type"\)/);
  assert.match(priceMutation, /\.eq\("id", existingPriceId\)/);
  assert.match(priceMutation, /productId = targetPrice\.product_id/);
  assert.match(
    priceMutation,
    /finalSyncTimestamp\(input\.data\.effectiveAt, appendVersion\)/,
  );
  assert.match(priceMutation, /effectiveAt}:append/);
  assert.match(priceMutation, /onConflict: "owner_user_id,product_id,type,effective_at"/);
  assert.doesNotMatch(priceMutation, /\.update\(priceRow\)/);
  assert.doesNotMatch(priceMutation, /\.delete\(/);
});

test("TASK-088 final observation and residue checks use bounded Admin read models", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");
  const observe = functionBody(
    route,
    "async function observeFinalSync",
    "function existingRecordId",
  );

  assert.match(observe, /getShopInventoryProductsPage/);
  assert.match(route, /async function observeFinalProductExact/);
  assert.match(route, /async function observeFinalCheckpointExact/);
  assert.match(route, /\.eq\("shop_id", input\.shopId\)/);
  assert.match(route, /query\.eq\("barcode", input\.data\.barcode/);
  assert.match(route, /await query\.limit\(2\)/);
  assert.match(observe, /getShopCategoriesPageReadModel/);
  assert.match(observe, /getShopSuppliersPageReadModel/);
  assert.match(observe, /getShopInventoryReadModel/);
  assert.match(observe, /getShopHistoryListReadModel/);
  assert.match(observe, /getShopSyncReadModel/);
  assert.match(
    observe,
    /const needsSyncTelemetry = !\[[\s\S]*"noop",[\s\S]*"observe",[\s\S]*"residue",[\s\S]*\]\.includes\(input\.operation\)/,
  );
  assert.match(
    observe,
    /const syncModelPromise = needsSyncTelemetry[\s\S]*getShopSyncReadModel/,
  );
  assert.match(observe, /const syncModel = syncModelPromise \? await syncModelPromise : null/);
  assert.match(observe, /const checkpointPromise =[\s\S]*observeFinalCheckpointExact/);
  assert.match(observe, /exactCheckpoint\?\.checkpoint \?\? latestEvent\?\.eventId/);
  assert.match(observe, /input\.operation === "noop"[\s\S]*\? 0/);
  assert.match(observe, /input\.operation === "noop"[\s\S]*\? 2[\s\S]*: 1/);
  assert.match(observe, /pageSize: 100/);
  assert.match(observe, /rowLimit: 200/);
  assert.match(observe, /input\.scenario === "burst10"/);
  assert.match(observe, /`\$\{input\.prefix\}\$\{input\.fixtureId\}-B`/);
  assert.match(observe, /row\.barcode\.startsWith\(observationBase\)/);
  assert.match(observe, /row\.remoteId\.startsWith\(observationBase\)/);
  assert.match(observe, /row\.source\?\.startsWith\(observationBase\)/);
  assert.match(
    route,
    /if \(readOnlyOperation\) \{[\s\S]*resolveShopActionContext\([\s\S]*input\.shopId,[\s\S]*finalSyncReadPermission\(input\.entity\)[\s\S]*readContext\.status !== "ready"[\s\S]*result: "denied"/,
  );
  assert.match(
    route,
    /entity === "history_entry" \|\| entity === "history_rows"[\s\S]*"history\.view"[\s\S]*"catalog\.view"/,
  );
});

test("TASK-088 final Admin updates use the cross-platform NAME_UPDATED contract", () => {
  const route = read("src/app/shop/qa-sync-fixture/route.ts");
  const lookupMutation = functionBody(
    route,
    "async function mutateFinalLookup",
    "async function mutateFinalProductPrice",
  );

  assert.match(lookupMutation, /targetId \? "NAME_UPDATED" : "NAME"/);
});
