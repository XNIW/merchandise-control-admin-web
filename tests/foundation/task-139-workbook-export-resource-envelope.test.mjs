import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  CATALOG_WORKBOOK_EXPORT_LIMITS,
  CatalogWorkbookExportResourceError,
  collectBoundedWorkbookBytes,
  collectBoundedWorkbookPages,
  createCatalogWorkbookExportResourceEnvelope,
  finalizeBoundedWorkbookExport,
} from "../../src/server/shop-admin/workbook-export-resource-envelope.ts";

const root = process.cwd();

test("workbook resource envelope enforces row/cell/byte caps and publishes metrics", () => {
  const resource = createCatalogWorkbookExportResourceEnvelope({
    deadlineMs: 10_000,
    limits: {
      categories: 2,
      estimatedBytes: 10 * 1024 * 1024,
      prices: 3,
      products: 4,
      suppliers: 2,
      totalCells: 100,
      totalRows: 11,
    },
  });
  try {
    resource.assertCounts({
      categories: 2,
      prices: 3,
      products: 4,
      suppliers: 2,
    });
    resource.recordFinalBytes(4_096);
    assert.deepEqual(
      {
        categories: resource.metrics().categories,
        finalBytes: resource.metrics().finalBytes,
        prices: resource.metrics().prices,
        products: resource.metrics().products,
        suppliers: resource.metrics().suppliers,
        totalRows: resource.metrics().totalRows,
      },
      {
        categories: 2,
        finalBytes: 4_096,
        prices: 3,
        products: 4,
        suppliers: 2,
        totalRows: 11,
      },
    );
  } finally {
    resource.dispose();
  }

  const overLimit = createCatalogWorkbookExportResourceEnvelope({
    limits: { products: 1 },
  });
  try {
    assert.throws(
      () =>
        overLimit.assertCounts({
          categories: 0,
          prices: 0,
          products: 2,
          suppliers: 0,
        }),
      (error) =>
        error instanceof CatalogWorkbookExportResourceError &&
        error.code === "resource_limit_exceeded",
    );
  } finally {
    overLimit.dispose();
  }
});

test("workbook preflight rejects authoritative text bytes above the hard cap before serialization", () => {
  const exact = createCatalogWorkbookExportResourceEnvelope({
    limits: { sourceTextBytes: 128 },
  });
  try {
    exact.assertPreflight({
      categories: 0,
      prices: 0,
      products: 1,
      sourceTextBytes: 128,
      suppliers: 0,
    });
    assert.equal(exact.metrics().sourceTextBytes, 128);
  } finally {
    exact.dispose();
  }

  const overflow = createCatalogWorkbookExportResourceEnvelope({
    limits: { sourceTextBytes: 128 },
  });
  try {
    assert.throws(
      () =>
        overflow.assertPreflight({
          categories: 0,
          prices: 0,
          products: 1,
          sourceTextBytes: 129,
          suppliers: 0,
        }),
      (error) =>
        error instanceof CatalogWorkbookExportResourceError &&
        error.code === "resource_limit_exceeded",
    );
  } finally {
    overflow.dispose();
  }
});

test("workbook resource matrix accepts empty, small and exact cap but rejects cap plus one", () => {
  for (const counts of [
    { categories: 0, prices: 0, products: 0, suppliers: 0 },
    { categories: 1, prices: 10, products: 5, suppliers: 1 },
    { categories: 0, prices: 2_500, products: 500, suppliers: 0 },
  ]) {
    const resource = createCatalogWorkbookExportResourceEnvelope();
    try {
      resource.assertCounts(counts);
      assert.equal(resource.metrics().totalRows <= 3_000, true);
    } finally {
      resource.dispose();
    }
  }

  for (const counts of [
    { categories: 0, prices: 0, products: 3_001, suppliers: 0 },
    { categories: 0, prices: 2_501, products: 0, suppliers: 0 },
    { categories: 0, prices: 2_500, products: 501, suppliers: 0 },
  ]) {
    const resource = createCatalogWorkbookExportResourceEnvelope();
    try {
      assert.throws(
        () => resource.assertCounts(counts),
        (error) =>
          error instanceof CatalogWorkbookExportResourceError &&
          error.code === "resource_limit_exceeded",
      );
    } finally {
      resource.dispose();
    }
  }
});

test("workbook resource envelope bounds real concurrency to two", async () => {
  const resource = createCatalogWorkbookExportResourceEnvelope({
    limits: { maxConcurrency: 2 },
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    const first = resource.run(async () => gate);
    const second = resource.run(async () => gate);
    await assert.rejects(
      resource.run(async () => "unexpected"),
      (error) =>
        error instanceof CatalogWorkbookExportResourceError &&
        error.code === "resource_limit_exceeded",
    );
    release();
    await Promise.allSettled([first, second]);
    assert.equal(resource.metrics().peakConcurrency, 2);
  } finally {
    resource.dispose();
  }
});

test("workbook resource envelope propagates request cancellation into active work", async () => {
  const controller = new AbortController();
  const resource = createCatalogWorkbookExportResourceEnvelope({
    signal: controller.signal,
  });
  try {
    const active = resource.run(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve("aborted"), {
            once: true,
          });
        }),
    );
    controller.abort();
    await assert.rejects(
      active,
      (error) =>
        error instanceof CatalogWorkbookExportResourceError &&
        error.code === "request_cancelled",
    );
  } finally {
    resource.dispose();
  }
});

test("workbook byte stream is cancelled on request abort and final-size overflow", async () => {
  const request = new AbortController();
  const abortedStream = new PassThrough();
  const aborted = collectBoundedWorkbookBytes({
    cancel(error) {
      abortedStream.destroy(error);
    },
    chunks: abortedStream,
    maxBytes: 10,
    signal: request.signal,
  });
  abortedStream.write(new Uint8Array([1]));
  request.abort();
  await assert.rejects(
    aborted,
    (error) =>
      error instanceof CatalogWorkbookExportResourceError &&
      error.code === "request_cancelled",
  );
  assert.equal(abortedStream.destroyed, true);

  const overflowStream = new PassThrough();
  const overflow = collectBoundedWorkbookBytes({
    cancel(error) {
      overflowStream.destroy(error);
    },
    chunks: overflowStream,
    maxBytes: 2,
    signal: new AbortController().signal,
  });
  overflowStream.end(new Uint8Array([1, 2, 3]));
  await assert.rejects(
    overflow,
    (error) =>
      error instanceof CatalogWorkbookExportResourceError &&
      error.code === "resource_limit_exceeded",
  );
  assert.equal(overflowStream.destroyed, true);
});

test("bounded page collector handles many price lookups and rejects a mid-page RPC error", async () => {
  const controller = new AbortController();
  let calls = 0;
  const rows = await collectBoundedWorkbookPages({
    expectedCount: 2_500,
    getId: (row) => row.id,
    loadPage: async ({ afterId, limit }) => {
      calls += 1;
      const start = afterId ? Number(afterId) + 1 : 1;
      const remaining = 2_500 - start + 1;
      const count = Math.min(limit, remaining);
      const pageRows = Array.from({ length: count }, (_, index) => ({
        id: String(start + index).padStart(8, "0"),
      }));
      return {
        hasMore: start + count - 1 < 2_500,
        nextAfterId: pageRows.at(-1)?.id ?? null,
        rows: pageRows,
      };
    },
    maxRows: 2_500,
    pageSize: 120,
    signal: controller.signal,
  });
  assert.equal(rows.length, 2_500);
  assert.equal(calls, 21);

  let failingCalls = 0;
  await assert.rejects(
    collectBoundedWorkbookPages({
      expectedCount: 300,
      getId: (row) => row.id,
      loadPage: async ({ afterId, limit }) => {
        failingCalls += 1;
        if (failingCalls === 2) throw new Error("rpc_failure");
        const start = afterId ? Number(afterId) + 1 : 1;
        const pageRows = Array.from({ length: limit }, (_, index) => ({
          id: String(start + index).padStart(8, "0"),
        }));
        return {
          hasMore: true,
          nextAfterId: pageRows.at(-1).id,
          rows: pageRows,
        };
      },
      maxRows: 500,
      pageSize: 120,
      signal: new AbortController().signal,
    }),
    /rpc_failure/,
  );
  assert.equal(failingCalls, 2);
});

test("bounded page collector cancels mid-page and rejects foreign-scope rows", async () => {
  const cancellation = new AbortController();
  const active = collectBoundedWorkbookPages({
    expectedCount: 2,
    getId: (row) => row.id,
    loadPage: async ({ signal }) =>
      await new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () =>
            resolve({
              hasMore: false,
              nextAfterId: null,
              rows: [],
            }),
          { once: true },
        );
      }),
    maxRows: 10,
    pageSize: 2,
    signal: cancellation.signal,
  });
  cancellation.abort("request_cancelled");
  await assert.rejects(
    active,
    (error) =>
      error instanceof CatalogWorkbookExportResourceError &&
      error.code === "request_cancelled",
  );

  await assert.rejects(
    collectBoundedWorkbookPages({
      expectedCount: 1,
      getId: (row) => (row.shopId === "expected-shop" ? row.id : null),
      loadPage: async () => ({
        hasMore: false,
        nextAfterId: "00000001",
        rows: [{ id: "00000001", shopId: "foreign-shop" }],
      }),
      maxRows: 1,
      pageSize: 1,
      signal: new AbortController().signal,
    }),
    /workbook_page_contract_invalid/,
  );
});

test("finalization never serializes or writes a success audit after cap, cancellation or writer error", async () => {
  for (const scenario of ["cap", "cancel", "writer"]) {
    const controller = new AbortController();
    const resource = createCatalogWorkbookExportResourceEnvelope({
      signal: controller.signal,
    });
    let audits = 0;
    let serializations = 0;
    try {
      if (scenario === "cancel") controller.abort();
      await assert.rejects(
        finalizeBoundedWorkbookExport({
          audit: () => {
            audits += 1;
            return { ok: true };
          },
          counts:
            scenario === "cap"
              ? { categories: 0, prices: 0, products: 3_001, suppliers: 0 }
              : { categories: 0, prices: 0, products: 1, suppliers: 0 },
          resource,
          serialize: async () => {
            serializations += 1;
            if (scenario === "writer") throw new Error("writer_failure");
            return new Uint8Array([1]);
          },
        }),
      );
      assert.equal(audits, 0);
      assert.equal(serializations, scenario === "writer" ? 1 : 0);
    } finally {
      resource.dispose();
    }
  }
});

test("workbook export route uses an authoritative preflight and the real buffered writer without a second price fetch", () => {
  const route = readFileSync(
    join(root, "src/app/shop/import-export/export/route.ts"),
    "utf8",
  );
  const workbook = readFileSync(
    join(root, "src/server/shop-admin/import-export-workbook.ts"),
    "utf8",
  );
  const inventory = readFileSync(
    join(root, "src/server/shop-admin/inventory-read-model.ts"),
    "utf8",
  );
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260722013109_cross_platform_sync_event_completeness.sql",
    ),
    "utf8",
  );
  const boundedExport = workbook.slice(
    workbook.indexOf("async function serializeBoundedCatalogWorkbook"),
    workbook.indexOf("export async function buildCatalogImportTemplate"),
  );

  assert.match(route, /deadlineMs:\s*requestedDeadlineMs\(request\)/);
  assert.match(route, /signal:\s*request\.signal/);
  assert.match(workbook, /createCatalogWorkbookExportResourceEnvelope/);
  assert.match(workbook, /finalizeBoundedWorkbookExport/);
  assert.match(workbook, /resource\.assertPreflight/);
  assert.match(workbook, /writeXlsxFile\(sheets\)\.toBuffer\(\)/);
  assert.doesNotMatch(boundedExport, /\.toStream/);
  assert.match(workbook, /resourcePeakConcurrency/);
  assert.match(workbook, /resourceSourceTextBytes/);
  assert.match(workbook, /readModel\.prices\.map/);
  assert.doesNotMatch(workbook, /fetchCatalogExportPriceRows/);
  assert.ok(
    workbook.indexOf(
      'resolveShopActionContext(requestedShopId, "catalog.export")',
    ) <
      workbook.indexOf(
        "createCatalogWorkbookExportResourceEnvelope(options)",
      ),
    "staff permission denial must return before allocating export resources",
  );
  assert.match(inventory, /query\.abortSignal\(signal\)/);
  assert.match(inventory, /runInventoryReadOperations\(\[/);
  assert.match(
    migration,
    /when p_operation = 'snapshot_page' then 'catalog\.export'/,
  );
  assert.match(migration, /shop_catalog_workbook_preflight_v1/);
  assert.match(migration, /'workbookTextBytes'/);
});

test("real four-sheet writer stays below the measured 128 MiB isolate headroom at exact cap", () => {
  const script = String.raw`
    import writeXlsxFile from "write-excel-file/node";
    const total = 3000;
    const products = 960;
    const prices = 1920;
    const dimensions = 60;
    const hostileNote = "<&".repeat(500);
    const id = (value) =>
      String(value).padStart(8, "0") + "-0000-7000-8000-" +
      String(value).padStart(12, "0");
    const productRows = [[
      "product_id", "barcode", "product_name", "second_product_name",
      "item_number", "supplier_id", "category_id", "retail_price",
      "purchase_price", "stock_quantity", "updated_at"
    ]];
    for (let index = 0; index < products; index += 1) {
      productRows.push([
        id(index), "BAR-" + index, "Product " + index + " realistic name",
        index % 3 ? "" : "Second " + index, "ITEM-" + index,
        id(900000 + index % dimensions), id(800000 + index % dimensions),
        12990, 7990, 42, "2026-07-23T12:34:56.123Z"
      ]);
    }
    const supplierRows = [["supplier_id", "name", "updated_at"]];
    const categoryRows = [["category_id", "name", "updated_at"]];
    for (let index = 0; index < dimensions; index += 1) {
      supplierRows.push([
        id(900000 + index), "Supplier " + index,
        "2026-07-23T12:34:56.123Z"
      ]);
      categoryRows.push([
        id(800000 + index), "Category " + index,
        "2026-07-23T12:34:56.123Z"
      ]);
    }
    const priceRows = [[
      "price_id", "product_id", "type", "price", "effective_at",
      "source", "note"
    ]];
    for (let index = 0; index < prices; index += 1) {
      priceRows.push([
        id(100000 + index), id(index % products),
        index % 2 ? "RETAIL" : "PURCHASE", index % 2 ? 12990 : 7990,
        "2026-07-23T12:34:56.123Z", "admin_web",
        hostileNote
      ]);
    }
    global.gc();
    const baseline = process.memoryUsage();
    let peakRss = baseline.rss;
    let peakArrayBuffers = baseline.arrayBuffers;
    const sample = setInterval(() => {
      const current = process.memoryUsage();
      peakRss = Math.max(peakRss, current.rss);
      peakArrayBuffers = Math.max(peakArrayBuffers, current.arrayBuffers);
    }, 1);
    const buffer = await writeXlsxFile([
      { data: productRows, sheet: "Products" },
      { data: supplierRows, sheet: "Suppliers" },
      { data: categoryRows, sheet: "Categories" },
      { data: priceRows, sheet: "PriceHistory" }
    ]).toBuffer();
    clearInterval(sample);
    const after = process.memoryUsage();
    peakRss = Math.max(peakRss, after.rss);
    peakArrayBuffers = Math.max(peakArrayBuffers, after.arrayBuffers);
    console.log(JSON.stringify({
      arrayBuffers: peakArrayBuffers,
      bufferBytes: buffer.byteLength,
      peakRss,
      total
    }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--expose-gc", "--input-type=module", "-e", script],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
    },
  );
  assert.equal(child.status, 0, child.stderr);
  const measurement = JSON.parse(child.stdout.trim());
  assert.equal(measurement.total, CATALOG_WORKBOOK_EXPORT_LIMITS.totalRows);
  assert.ok(
    measurement.peakRss <= 112 * 1024 * 1024,
    `peak RSS ${measurement.peakRss} leaves insufficient 128 MiB headroom`,
  );
  assert.ok(measurement.arrayBuffers <= 32 * 1024 * 1024);
  assert.ok(
    measurement.bufferBytes <= CATALOG_WORKBOOK_EXPORT_LIMITS.finalBytes,
  );
});
