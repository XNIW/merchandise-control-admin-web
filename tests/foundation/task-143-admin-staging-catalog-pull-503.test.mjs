import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();
const requireForTest = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadRouteEnvelope() {
  return transpileCommonJs(
    "src/server/pos-auth/route-envelope.ts",
    (specifier) => {
      if (specifier === "server-only") {
        return {};
      }
      if (specifier === "./pos-contract") {
        return { POS_PRODUCT_IMAGE_SCHEMA_VERSION: "pos-product-image-v1" };
      }
      return requireForTest(specifier);
    },
  );
}

function transpileCommonJs(relativePath, requireFromTest, globals = {}) {
  const source = read(relativePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const cjsModule = { exports: {} };

  new Script(transpiled.outputText, { filename: relativePath }).runInContext(
    createContext({
      AbortController,
      AbortSignal,
      Buffer,
      Date,
      Request,
      Response,
      TextDecoder,
      Uint8Array,
      console,
      exports: cjsModule.exports,
      module: cjsModule,
      require: requireFromTest,
      ...globals,
    }),
  );

  return cjsModule.exports;
}

async function transpileEsModule(relativePath) {
  const source = read(relativePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });

  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
  );
}

function inputFor(testCase) {
  if (typeof testCase.input === "string") {
    return testCase.input;
  }

  assert.equal(testCase.inputGenerator?.kind, "repeat");
  return testCase.inputGenerator.value.repeat(testCase.inputGenerator.count);
}

function defaultLease() {
  const credentialId = "10000000-0000-4000-8000-000000000001";
  const sessionId = "20000000-0000-4000-8000-000000000001";
  const deviceId = "30000000-0000-4000-8000-000000000001";
  const shopId = "40000000-0000-4000-8000-000000000001";
  const staffId = "50000000-0000-4000-8000-000000000001";

  return {
    credential: {
      expires_at: "2099-01-01T00:00:00.000Z",
      pos_device_credential_id: credentialId,
      shop_device_id: deviceId,
      shop_id: shopId,
      staff_credential_version: 1,
      staff_id: staffId,
      status: "active",
      token_hash: "redacted-hash",
    },
    device: { status: "active" },
    session: {
      expires_at: "2099-01-01T00:00:00.000Z",
      issued_at: "2026-01-01T00:00:00.000Z",
      pos_device_credential_id: credentialId,
      pos_session_id: sessionId,
      session_token_hash: "redacted-hash",
      shop_device_id: deviceId,
      shop_id: shopId,
      staff_credential_version: 1,
      staff_id: staffId,
      status: "active",
    },
    shop: { shop_status: "active" },
    staff: {
      credential_status: "active",
      credential_version: 1,
      locked_until: null,
      must_change_credential: false,
      session_invalidated_at: null,
      shop_id: shopId,
      staff_id: staffId,
      status: "active",
    },
    status: "ok",
  };
}

function defaultPage() {
  return {
    entity: "categories",
    entityHasMore: false,
    manifest: {
      catalogSummary: {
        activeProducts: 0,
        categories: 1,
        prices: 0,
        products: 0,
        suppliers: 0,
      },
      windowCounts: {
        categories: 1,
        prices: 0,
        products: 0,
        suppliers: 0,
      },
    },
    pageLimit: 60,
    revision: "1",
    rows: [
      {
        deleted_at: null,
        id: "60000000-0000-4000-8000-000000000001",
        name: "Beverages",
        updated_at: "2026-07-27T12:00:00.000Z",
      },
    ],
    scopeKey: "a".repeat(32),
    scopeKind: "shop_scoped",
    scopeOwnerId: null,
    snapshotAt: "2026-07-27T20:00:00.000Z",
    status: "ok",
  };
}

function loadCatalogPull(options = {}) {
  const auditCalls = [];
  const cursorStates = new Map();
  const failureLogs = [];
  const publicationCalls = [];
  const lease = options.lease ?? defaultLease();
  const page = options.page ?? defaultPage();
  const supabase = {};
  const revisionTimestamp = transpileCommonJs(
    "src/server/pos-auth/pos-revision-timestamp.ts",
    (specifier) =>
      specifier === "server-only" ? {} : requireForTest(specifier),
  );
  let cursorSequence = 0;
  const stubs = {
    "@/lib/supabase/admin": {
      createSupabaseAdminClient: () => supabase,
      resolveSupabaseAdminConfig: () =>
        options.configured === false
          ? { status: "missing" }
          : {
              serviceRoleKey: "test-only-signing-key",
              status: "configured",
              url: "https://example.invalid",
            },
    },
    "./staff-credential-lock-state": {
      isStaffCredentialLockStateUsable: () => true,
    },
    "./catalog-revision": {
      buildCatalogRevision: () => `catalog:v2:${"b".repeat(32)}`,
      loadCatalogPageV2: async (_client, input) =>
        options.loadPage ? options.loadPage(input) : page,
    },
    "./catalog-sync-contract": {
      buildCatalogV2Cursor: (state) => {
        if (options.buildCursor) {
          return options.buildCursor(state);
        }

        cursorSequence += 1;
        const token = `catalog-v2:test-cursor-${cursorSequence}`;
        cursorStates.set(token, state);
        return token;
      },
      catalogV2TimestampsEqual: (left, right) => left === right,
      nextCatalogV2Lane: options.nextLane ?? (() => null),
      parseCatalogSyncRequest: (input) =>
        options.parseSyncRequest
          ? options.parseSyncRequest(input)
          : {
              limit: 60,
              syncCursor:
                input &&
                typeof input === "object" &&
                typeof input.syncCursor === "string"
                  ? input.syncCursor
                  : "",
              updatedSince: "",
            },
      resolveCatalogSyncRequest: (request) => {
        if (options.resolveSyncRequest) {
          return options.resolveSyncRequest(request);
        }

        const continuation = request.syncCursor
          ? cursorStates.get(request.syncCursor)
          : null;

        return continuation || !request.syncCursor
          ? {
              ok: true,
              request: {
                continuation,
                limit: continuation?.pageSize ?? request.limit,
                lowerBound: continuation?.lowerBound ?? null,
                mode: continuation?.mode ?? "full_refresh",
                snapshotAt: continuation?.snapshotAt ?? null,
              },
            }
          : { code: "catalog_cursor_rejected", ok: false };
      },
      splitCatalogTombstones: (rows) => ({
        active: rows.filter((row) => row.deleted_at === null),
        tombstones: rows.filter((row) => row.deleted_at !== null),
      }),
    },
    "./catalog-text-read-validation": {
      POS_CATALOG_TEXT_LIMITS: {
        barcode: 96,
        categoryName: 160,
        itemNumber: 120,
        productName: 240,
        secondProductName: 240,
        supplierName: 160,
      },
      isCanonicalCatalogDisplayText: () => true,
      isCanonicalCatalogIdentityText: () => true,
    },
    "./pos-contract": {
      POS_CATALOG_SCHEMA_VERSION: "pos-catalog-v2",
    },
    "./pos-revision-timestamp": revisionTimestamp,
    "./runtime-boundary": {
      loadPosRuntimeLease: async () => lease,
      publishPosRuntimeLeaseSuccess: async (_client, input) => {
        publicationCalls.push(input);
        return { status: "ok" };
      },
      writePosRuntimeAudit: async (_client, input) => {
        auditCalls.push(input);
        return options.auditOk !== false;
      },
    },
    "./shop-payload": {
      buildPosPolicyPayload: () => ({ version: "test" }),
      buildPosShopPayload: () => ({ shopId: lease.session?.shop_id }),
    },
    "./tokens": {
      verifyPosSecret: () => true,
    },
  };
  const catalogPull = transpileCommonJs(
    "src/server/pos-auth/catalog-pull.ts",
    (specifier) => {
      if (specifier === "server-only") {
        return {};
      }
      if (specifier in stubs) {
        return stubs[specifier];
      }
      return requireForTest(specifier);
    },
    {
      console: {
        error(value) {
          failureLogs.push(value);
        },
      },
    },
  );

  return {
    auditCalls,
    catalogPull,
    cursorStates,
    failureLogs,
    publicationCalls,
  };
}

function validPullInput() {
  const lease = defaultLease();

  return {
    deviceToken: "test-device-token",
    posSessionId: lease.session.pos_session_id,
    sessionToken: "test-session-token",
    shopDeviceId: lease.session.shop_device_id,
  };
}

test("TASK-143 compact read validation is equivalent to the TASK-142 golden policy", async () => {
  const fixture = JSON.parse(
    read("tests/fixtures/catalog-text-policy-v1.json"),
  );
  const compact = await transpileEsModule(
    "src/server/pos-auth/catalog-text-read-validation.ts",
  );
  const policy = await transpileEsModule("src/lib/catalog-text-policy.ts");

  for (const testCase of fixture.displayCases) {
    const input = inputFor(testCase);
    const canonical = policy.canonicalizeCatalogDisplayText(input, {
      maxLength: testCase.maxLength,
      required: testCase.required,
    });
    assert.equal(
      compact.isCanonicalCatalogDisplayText(
        input,
        testCase.maxLength,
        testCase.required,
      ),
      canonical.status === "unchanged" && canonical.value === input,
      testCase.id,
    );
  }

  for (const testCase of fixture.strictCases) {
    const input = inputFor(testCase);
    const canonical = policy.validateCatalogIdentityText(input, {
      maxLength: testCase.maxLength,
      required: testCase.required,
    });
    assert.equal(
      compact.isCanonicalCatalogIdentityText(
        input,
        testCase.maxLength,
        testCase.required,
      ),
      canonical.status === "unchanged" && canonical.value === input,
      testCase.id,
    );
  }
});

test("TASK-143 first page succeeds with an exact non-empty manifest and one publication fence", async () => {
  const harness = loadCatalogPull();
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput(), {
    requestId: "posreq_task143",
    route: "pos.catalog.pull",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.catalog.categories.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.body.catalogSummary)),
    defaultPage().manifest.catalogSummary,
  );
  assert.equal(harness.publicationCalls.length, 1);
  assert.equal(harness.auditCalls.length, 0);
});

test("TASK-149 catalog keeps image state additive across full, delta, replacement and remove", async () => {
  const productId = "60000000-0000-4000-8000-000000000149";
  const initialVersionId = "70000000-0000-4000-8000-000000000149";
  const replacementVersionId = "70000000-0000-4000-8000-000000000150";
  const cases = [
    {
      id: "full-never-had-image",
      mode: "full_refresh",
      primaryImageUpdatedAt: null,
      primaryImageVersionId: null,
      rawImageUpdatedAt: null,
    },
    {
      id: "full-current-image",
      mode: "full_refresh",
      primaryImageUpdatedAt: "2026-07-30T14:01:02.123456Z",
      primaryImageVersionId: initialVersionId,
      rawImageUpdatedAt: "2026-07-30T14:01:02.123456+00:00",
    },
    {
      id: "delta-replacement",
      mode: "delta",
      primaryImageUpdatedAt: "2026-07-30T14:02:03.654321Z",
      primaryImageVersionId: replacementVersionId,
      rawImageUpdatedAt: "2026-07-30T14:02:03.654321+00:00",
    },
    {
      id: "delta-remove",
      mode: "delta",
      primaryImageUpdatedAt: "2026-07-30T14:03:04.000001Z",
      primaryImageVersionId: null,
      rawImageUpdatedAt: "2026-07-30T14:03:04.000001+00:00",
    },
  ];

  for (const scenario of cases) {
    const rawProductUpdatedAt =
      scenario.rawImageUpdatedAt ?? "2026-07-30T14:00:00.000001+00:00";
    const harness = loadCatalogPull({
      page: {
        ...defaultPage(),
        entity: "products",
        manifest: {
          catalogSummary: {
            activeProducts: 1,
            categories: 0,
            prices: 0,
            products: 1,
            suppliers: 0,
          },
          windowCounts: {
            categories: 0,
            prices: 0,
            products: 1,
            suppliers: 0,
          },
        },
        rows: [
          {
            barcode: "TASK149-IMAGE",
            category_id: null,
            deleted_at: null,
            id: productId,
            item_number: "TASK149",
            owner_user_id: "60000000-0000-4000-8000-000000000001",
            primary_image_updated_at: scenario.rawImageUpdatedAt,
            primary_image_version_id: scenario.primaryImageVersionId,
            product_name: "TASK-149 synthetic image product",
            purchase_price: 10.25,
            retail_price: 15.75,
            second_product_name: null,
            shop_id: "40000000-0000-4000-8000-000000000001",
            stock_quantity: 8,
            supplier_id: null,
            updated_at: rawProductUpdatedAt,
          },
        ],
      },
      resolveSyncRequest: () => ({
        ok: true,
        request: {
          continuation: null,
          limit: 60,
          lowerBound:
            scenario.mode === "delta"
              ? "2026-07-30T13:00:00.000000Z"
              : null,
          mode: scenario.mode,
          snapshotAt: null,
        },
      }),
    });
    const result = await harness.catalogPull.handlePosCatalogPull(
      validPullInput(),
    );

    assert.equal(result.status, 200, scenario.id);
    assert.equal(result.body.syncMode, scenario.mode, scenario.id);
    assert.equal(result.body.catalog.products.length, 1, scenario.id);

    const product = JSON.parse(
      JSON.stringify(result.body.catalog.products[0]),
    );
    const {
      primaryImageUpdatedAt,
      primaryImageVersionId,
      ...legacyProduct
    } = product;
    assert.equal(
      primaryImageVersionId,
      scenario.primaryImageVersionId,
      scenario.id,
    );
    assert.equal(
      primaryImageUpdatedAt,
      scenario.primaryImageUpdatedAt,
      scenario.id,
    );
    assert.deepEqual(
      legacyProduct,
      {
        barcode: "TASK149-IMAGE",
        categoryId: null,
        itemNumber: "TASK149",
        productId,
        productName: "TASK-149 synthetic image product",
        purchasePrice: 10.25,
        retailPrice: 15.75,
        secondProductName: null,
        stockQuantity: 8,
        supplierId: null,
        updatedAt: rawProductUpdatedAt.replace("+00:00", "Z"),
      },
      `${scenario.id}: legacy projection`,
    );
    assert.equal(
      Object.keys(product).some((key) =>
        /url|path|sha|mime|bytes|width|height|metadata/i.test(key),
      ),
      false,
      `${scenario.id}: private image metadata`,
    );
    assert.equal(harness.publicationCalls.length, 1, scenario.id);
    assert.equal(harness.auditCalls.length, 0, scenario.id);
  }
});

test("TASK-149 catalog rejects an image UUID without a publication timestamp", async () => {
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "products",
      manifest: {
        catalogSummary: {
          activeProducts: 1,
          categories: 0,
          prices: 0,
          products: 1,
          suppliers: 0,
        },
        windowCounts: {
          categories: 0,
          prices: 0,
          products: 1,
          suppliers: 0,
        },
      },
      rows: [
        {
          barcode: "TASK149-INVALID-IMAGE-STATE",
          category_id: null,
          deleted_at: null,
          id: "60000000-0000-4000-8000-000000000150",
          item_number: null,
          primary_image_updated_at: null,
          primary_image_version_id:
            "70000000-0000-4000-8000-000000000151",
          product_name: "TASK-149 invalid image state",
          purchase_price: null,
          retail_price: null,
          second_product_name: null,
          stock_quantity: null,
          supplier_id: null,
          updated_at: "2026-07-30T14:04:05.000001+00:00",
        },
      ],
    },
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput());

  assert.equal(result.status, 500);
  assert.equal(result.body.root, "catalog_response_invalid");
  assert.equal("catalog" in result.body, false);
  assert.equal(harness.publicationCalls.length, 0);
  assert.equal(harness.auditCalls.length, 1);
});

test("TASK-143 an empty manifest fails closed and never publishes catalog success", async () => {
  const emptyManifest = {
    catalogSummary: {
      activeProducts: 0,
      categories: 0,
      prices: 0,
      products: 0,
      suppliers: 0,
    },
    windowCounts: {
      categories: 0,
      prices: 0,
      products: 0,
      suppliers: 0,
    },
  };
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "done",
      manifest: emptyManifest,
      rows: [],
    },
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput(), {
    requestId: "posreq_empty_manifest",
    route: "pos.catalog.pull",
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.root, "catalog_response_invalid");
  assert.equal(result.body.stage, "manifest");
  assert.equal("catalog" in result.body, false);
  assert.equal(harness.publicationCalls.length, 0);
  assert.equal(harness.auditCalls.length, 1);
  assert.equal(
    harness.auditCalls[0].metadata.reason,
    "catalog_v2_empty_manifest",
  );
});

test("TASK-143 an empty delta window remains a valid idempotent catalog success", async () => {
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "done",
      manifest: {
        catalogSummary: {
          activeProducts: 19_763,
          categories: 71,
          prices: 41_228,
          products: 19_763,
          suppliers: 102,
        },
        windowCounts: {
          categories: 0,
          prices: 0,
          products: 0,
          suppliers: 0,
        },
      },
      rows: [],
    },
    resolveSyncRequest: () => ({
      ok: true,
      request: {
        continuation: null,
        limit: 60,
        lowerBound: "2026-07-27T19:00:00.000Z",
        mode: "delta",
        snapshotAt: null,
      },
    }),
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput(), {
    requestId: "posreq_empty_delta",
    route: "pos.catalog.pull",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.syncMode, "delta");
  assert.equal(result.body.hasMore, false);
  assert.equal(result.body.catalog.products.length, 0);
  assert.equal(result.body.catalogSummary.products, 19_763);
  assert.equal(harness.publicationCalls.length, 1);
  assert.equal(harness.auditCalls.length, 0);
});

test("TASK-143 a tombstone-only delta can converge the catalog to empty", async () => {
  const deletedProductId = "60000000-0000-4000-8000-000000000001";
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "products",
      manifest: {
        catalogSummary: {
          activeProducts: 0,
          categories: 0,
          prices: 0,
          products: 0,
          suppliers: 0,
        },
        windowCounts: {
          categories: 0,
          prices: 0,
          products: 1,
          suppliers: 0,
        },
      },
      rows: [
        {
          barcode: "TASK143-DELETED",
          category_id: null,
          deleted_at: "2026-07-27T19:30:00.000Z",
          id: deletedProductId,
          item_number: null,
          primary_image_updated_at: null,
          primary_image_version_id: null,
          product_name: "Deleted product",
          purchase_price: null,
          retail_price: null,
          second_product_name: null,
          stock_quantity: null,
          supplier_id: null,
          updated_at: "2026-07-27T19:30:00.000Z",
        },
      ],
    },
    resolveSyncRequest: () => ({
      ok: true,
      request: {
        continuation: null,
        limit: 60,
        lowerBound: "2026-07-27T19:00:00.000Z",
        mode: "delta",
        snapshotAt: null,
      },
    }),
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput(), {
    requestId: "posreq_tombstone_delta",
    route: "pos.catalog.pull",
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.syncMode, "delta");
  assert.equal(result.body.catalog.products.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.body.catalog.tombstones.products)),
    [
      {
        deletedAt: "2026-07-27T19:30:00.000000Z",
        productId: deletedProductId,
        updatedAt: "2026-07-27T19:30:00.000000Z",
      },
    ],
  );
  assert.equal(result.body.catalogSummary.products, 0);
  assert.equal(harness.publicationCalls.length, 1);
  assert.equal(harness.auditCalls.length, 0);
});

test("TASK-143 a delta with empty catalog and empty window still fails closed", async () => {
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "done",
      manifest: {
        catalogSummary: {
          activeProducts: 0,
          categories: 0,
          prices: 0,
          products: 0,
          suppliers: 0,
        },
        windowCounts: {
          categories: 0,
          prices: 0,
          products: 0,
          suppliers: 0,
        },
      },
      rows: [],
    },
    resolveSyncRequest: () => ({
      ok: true,
      request: {
        continuation: null,
        limit: 60,
        lowerBound: "2026-07-27T19:00:00.000Z",
        mode: "delta",
        snapshotAt: null,
      },
    }),
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput(), {
    requestId: "posreq_empty_delta_catalog",
    route: "pos.catalog.pull",
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.root, "catalog_response_invalid");
  assert.equal(result.body.stage, "manifest");
  assert.equal(harness.publicationCalls.length, 0);
  assert.equal(harness.auditCalls.length, 1);
});

test("TASK-143 expected catalog failures stay typed and never become empty success", async () => {
  for (const scenario of [
    {
      expectedRoot: "statement_timeout",
      expectedStatus: 500,
      page: {
        reason: "catalog_rpc_statement_timeout",
        stage: "manifest",
        status: "db_failure",
      },
    },
    {
      expectedRoot: "upstream_unavailable",
      expectedStatus: 503,
      page: {
        reason: "catalog_rpc_upstream_unavailable",
        stage: "products",
        status: "db_failure",
      },
    },
    {
      expectedRoot: "catalog_response_invalid",
      expectedStatus: 500,
      page: {
        reason: "catalog_rpc_response_invalid",
        stage: "manifest",
        status: "db_failure",
      },
    },
  ]) {
    const harness = loadCatalogPull({ page: scenario.page });
    const result = await harness.catalogPull.handlePosCatalogPull(validPullInput(), {
      requestId: "posreq_task143",
      route: "pos.catalog.pull",
    });

    assert.equal(result.status, scenario.expectedStatus);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.root, scenario.expectedRoot);
    assert.equal(result.body.stage, scenario.page.stage);
    assert.equal("catalog" in result.body, false);
    assert.equal(harness.auditCalls.length, 1);
    assert.equal(harness.publicationCalls.length, 0);
  }
});

test("TASK-143 RPC error codes are classified at the real catalog boundary", async () => {
  const revision = transpileCommonJs(
    "src/server/pos-auth/catalog-revision.ts",
    (specifier) => {
      if (specifier === "server-only") {
        return {};
      }
      if (specifier === "../shared/postgres-uuid.ts") {
        return { isCanonicalPostgresUuid: () => true };
      }
      return requireForTest(specifier);
    },
  );
  const input = {
    afterId: null,
    afterUpdatedAt: null,
    entity: "products",
    expectedRevision: null,
    expectedScopeKey: null,
    expectedScopeKind: null,
    includeManifest: false,
    limit: 60,
    lowerBound: null,
    mode: "full_refresh",
    posSessionId: "20000000-0000-4000-8000-000000000001",
    shopDeviceId: "30000000-0000-4000-8000-000000000001",
    shopId: "40000000-0000-4000-8000-000000000001",
    snapshotAt: null,
    staffId: "50000000-0000-4000-8000-000000000001",
  };

  for (const [code, expectedReason] of [
    ["57014", "catalog_rpc_statement_timeout"],
    ["08006", "catalog_rpc_upstream_unavailable"],
    ["PGRST003", "catalog_rpc_upstream_unavailable"],
    ["XX000", "catalog_rpc_error"],
  ]) {
    const result = await revision.loadCatalogPageV2(
      {
        rpc: async () => ({
          data: null,
          error: { code, details: "secret", message: "secret" },
        }),
      },
      input,
    );

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      reason: expectedReason,
      stage: "products",
      status: "db_failure",
    });
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("TASK-143 missing binding and audit outage emit bounded typed failures", async () => {
  const missing = loadCatalogPull({ configured: false });
  const missingResult = await missing.catalogPull.handlePosCatalogRouteFailure({
    edgeCorrelationHash: "sha256:123456789abc",
    requestId: "posreq_missing",
    route: "pos.catalog.pull",
    userAgent: "secret-user-agent",
  });
  const missingLog = JSON.parse(missing.failureLogs[0]);

  assert.equal(missingResult.status, 503);
  assert.deepEqual(JSON.parse(JSON.stringify(missingResult.body)), {
    code: "not_configured",
    message: "POS catalog backend is not configured.",
    ok: false,
    root: "worker_binding_unavailable",
    stage: "catalog_pull",
  });
  assert.deepEqual(missingLog, {
    code: "not_configured",
    edgeCorrelationHash: "sha256:123456789abc",
    event: "pos.catalog.pull.failure",
    requestId: "posreq_missing",
    root: "worker_binding_unavailable",
    route: "pos.catalog.pull",
    stage: "catalog_pull",
  });
  assert.equal(missing.failureLogs[0].includes("secret-user-agent"), false);

  const auditOutage = loadCatalogPull({ auditOk: false });
  const auditResult = await auditOutage.catalogPull.handlePosCatalogRouteFailure({
    clientRequestId: "CLIENT-BOUNDED",
    edgeCorrelationHash: "sha256:abcdef123456",
    requestId: "posreq_audit",
    route: "pos.catalog.pull",
    userAgent: "secret-user-agent",
  });
  const auditLog = JSON.parse(auditOutage.failureLogs[0]);

  assert.equal(auditResult.status, 500);
  assert.equal(auditResult.body.root, "audit_unavailable");
  assert.equal(auditResult.body.stage, "audit");
  assert.equal(auditOutage.auditCalls.length, 1);
  assert.equal(auditLog.edgeCorrelationHash, "sha256:abcdef123456");
  assert.equal(auditOutage.failureLogs[0].includes("CLIENT-BOUNDED"), false);
  assert.equal(auditOutage.failureLogs[0].includes("secret-user-agent"), false);
});

test("TASK-143 route exception is audited without leaking exception or request data", async () => {
  const harness = loadCatalogPull();
  const result = await harness.catalogPull.handlePosCatalogRouteFailure({
    clientRequestId: "CLIENT-BOUNDED",
    edgeCorrelationHash: "sha256:abcdef123456",
    requestId: "posreq_exception",
    route: "pos.catalog.pull",
    userAgent: "secret-user-agent",
  });
  const audit = harness.auditCalls[0];

  assert.equal(result.status, 500);
  assert.equal(result.body.root, "unhandled_exception");
  assert.equal(result.body.stage, "catalog_pull");
  assert.equal(harness.auditCalls.length, 1);
  assert.equal(audit.metadata.client_request_id, "CLIENT-BOUNDED");
  assert.equal(audit.metadata.edge_correlation_hash, "sha256:abcdef123456");
  assert.equal(audit.metadata.request_id, "posreq_exception");
  assert.equal(audit.metadata.user_agent_present, true);
  assert.equal(JSON.stringify(audit).includes("secret-user-agent"), false);
  assert.equal(JSON.stringify(result).includes("CLIENT-BOUNDED"), false);
});

test("TASK-143 POST catches a Worker exception and returns the audited typed boundary", async () => {
  const helper = transpileCommonJs(
    "src/app/api/pos/_shared/pos-route-security.ts",
    (specifier) =>
      specifier === "server-only" ? {} : requireForTest(specifier),
  );
  let failureMeta = null;
  const route = transpileCommonJs(
    "src/app/api/pos/catalog/pull/route.ts",
    (specifier) => {
      if (specifier === "@/server/pos-auth/catalog-pull") {
        return {
          handlePosCatalogPull: async () => {
            throw new Error("secret-worker-exception");
          },
          handlePosCatalogRouteFailure: async (meta) => {
            failureMeta = meta;
            return {
              body: {
                code: "db_failure",
                message: "POS catalog pull failed.",
                ok: false,
                root: "unhandled_exception",
                stage: "catalog_pull",
              },
              status: 500,
            };
          },
        };
      }
      if (specifier === "@/server/pos-auth/route-envelope") {
        return loadRouteEnvelope();
      }
      if (specifier === "../../_shared/pos-route-security") {
        return helper;
      }
      return requireForTest(specifier);
    },
  );
  const response = await route.POST(
    new Request("https://example.invalid/api/pos/catalog/pull", {
      body: JSON.stringify(validPullInput()),
      headers: {
        "cf-ray": "74a61c7f3e3b1234-SCL",
        "content-type": "application/json",
        "x-client-request-id": "TASK143-POST",
      },
      method: "POST",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.root, "unhandled_exception");
  assert.equal(body.stage, "catalog_pull");
  assert.equal(body.requestId, failureMeta.requestId);
  assert.equal(failureMeta.clientRequestId, "TASK143-POST");
  assert.match(failureMeta.edgeCorrelationHash, /^sha256:[0-9a-f]{12}$/);
  assert.equal(JSON.stringify(body).includes("secret-worker-exception"), false);
});

test("TASK-143 POST keeps a typed fallback if the audit boundary itself throws", async () => {
  const helper = transpileCommonJs(
    "src/app/api/pos/_shared/pos-route-security.ts",
    (specifier) =>
      specifier === "server-only" ? {} : requireForTest(specifier),
  );
  const route = transpileCommonJs(
    "src/app/api/pos/catalog/pull/route.ts",
    (specifier) => {
      if (specifier === "@/server/pos-auth/catalog-pull") {
        return {
          handlePosCatalogPull: async () => {
            throw new Error("secret-worker-exception");
          },
          handlePosCatalogRouteFailure: async () => {
            throw new Error("secret-audit-exception");
          },
        };
      }
      if (specifier === "@/server/pos-auth/route-envelope") {
        return loadRouteEnvelope();
      }
      if (specifier === "../../_shared/pos-route-security") {
        return helper;
      }
      return requireForTest(specifier);
    },
  );
  const response = await route.POST(
    new Request("https://example.invalid/api/pos/catalog/pull", {
      body: JSON.stringify(validPullInput()),
      headers: {
        "content-type": "application/json",
        "x-client-request-id": "TASK143-FALLBACK",
      },
      method: "POST",
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.code, "db_failure");
  assert.equal(body.message, "POS request failed.");
  assert.equal(body.root, "unhandled_exception");
  assert.equal(body.stage, "catalog_pull");
  assert.match(body.requestId, /^posreq_[0-9a-f-]{36}$/);
  assert.equal(JSON.stringify(body).includes("secret-worker-exception"), false);
  assert.equal(JSON.stringify(body).includes("secret-audit-exception"), false);
});

test("TASK-143 correlation headers are hashed and every failed response gets a server request ID", async () => {
  const helper = transpileCommonJs(
    "src/app/api/pos/_shared/pos-route-security.ts",
    (specifier) =>
      specifier === "server-only" ? {} : requireForTest(specifier),
  );
  const rawEdgeId = "74a61c7f3e3b1234-SCL";
  const context = helper.createPosRouteRequestContext(
    new Request("https://example.invalid/api/pos/catalog/pull", {
      headers: {
        "cf-ray": rawEdgeId,
        "x-client-request-id": "TASK143-CLIENT",
      },
    }),
    "pos.catalog.pull",
  );
  const response = helper.posJsonResponse(
    {
      code: "db_failure",
      message: "POS catalog pull failed.",
      ok: false,
      root: "rpc_failure",
      stage: "manifest",
    },
    500,
    context,
  );
  const body = await response.json();

  assert.match(context.edgeCorrelationHash, /^sha256:[0-9a-f]{12}$/);
  assert.equal(context.edgeCorrelationHash.includes(rawEdgeId), false);
  assert.match(response.headers.get("x-request-id"), /^posreq_[0-9a-f-]{36}$/);
  assert.equal(body.requestId, context.serverRequestId);
  assert.equal(body.root, "rpc_failure");
  assert.equal(body.stage, "manifest");
});

test("TASK-143 full handler drain matches its first-page real-volume manifest", async () => {
  const snapshotAt = "2026-07-27T20:00:00.123456+00:00";
  const manifest = {
    catalogSummary: {
      activeProducts: 19_763,
      categories: 71,
      prices: 41_228,
      products: 19_763,
      suppliers: 102,
    },
    windowCounts: {
      categories: 71,
      prices: 41_228,
      products: 19_763,
      suppliers: 102,
    },
  };
  const lanes = ["categories", "suppliers", "products", "prices"];
  const lanePageLimits = {
    categories: 240,
    prices: 120,
    products: 60,
    suppliers: 240,
  };
  const pageCalls = [];
  const uuidFor = (lane, index) => {
    const prefix = {
      categories: "10000000",
      prices: "40000000",
      products: "30000000",
      suppliers: "20000000",
    }[lane];

    return `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
  };
  const rowFor = (lane, index) => {
    const common = {
      id: uuidFor(lane, index),
      updated_at: snapshotAt,
    };

    if (lane === "categories" || lane === "suppliers") {
      return {
        ...common,
        deleted_at: null,
        name: `${lane}-${index}`,
      };
    }

    if (lane === "products") {
      return {
        ...common,
        barcode: `TASK143-${index}`,
        category_id: null,
        deleted_at: null,
        item_number: null,
        primary_image_updated_at: null,
        primary_image_version_id: null,
        product_name: `Product ${index}`,
        purchase_price: null,
        retail_price: null,
        second_product_name: null,
        stock_quantity: null,
        supplier_id: null,
      };
    }

    return {
      ...common,
      created_at: snapshotAt,
      effective_at: snapshotAt,
      price: index + 0.5,
      product_id: uuidFor("products", index % manifest.windowCounts.products),
      source: "task-143-test",
      type: "retail",
    };
  };
  const nextLane = (lane, counts) => {
    const current = lanes.indexOf(lane);

    return (
      lanes
        .slice(current + 1)
        .find((candidate) => counts[candidate] > 0) ?? null
    );
  };
  const harness = loadCatalogPull({
    loadPage(input) {
      const lane =
        input.entity ??
        lanes.find((candidate) => manifest.windowCounts[candidate] > 0) ??
        "done";
      const afterIndex = input.afterId
        ? Number(input.afterId.slice(-12)) + 1
        : 0;
      const count = lane === "done" ? 0 : manifest.windowCounts[lane];
      const pageLimit =
        lane === "done"
          ? input.limit
          : Math.min(input.limit, lanePageLimits[lane]);
      const returned = Math.min(pageLimit, Math.max(0, count - afterIndex));
      const rows = Array.from({ length: returned }, (_, offset) =>
        rowFor(lane, afterIndex + offset),
      );

      pageCalls.push({
        afterIdPresent: Boolean(input.afterId),
        includeManifest: input.includeManifest,
        lane,
        returned,
      });

      return {
        entity: lane,
        entityHasMore: afterIndex + returned < count,
        manifest: input.includeManifest ? manifest : null,
        pageLimit,
        revision: "1",
        rows,
        scopeKey: "a".repeat(32),
        scopeKind: "shop_scoped",
        scopeOwnerId: null,
        snapshotAt,
        status: "ok",
      };
    },
    nextLane,
    parseSyncRequest(input) {
      return {
        limit: 1_000,
        syncCursor:
          input &&
          typeof input === "object" &&
          typeof input.syncCursor === "string"
            ? input.syncCursor
            : "",
        updatedSince: "",
      };
    },
  });
  const seen = {
    categories: new Set(),
    prices: new Set(),
    products: new Set(),
    suppliers: new Set(),
  };
  let firstPageSummary = null;
  let pageCount = 0;
  let syncCursor = "";

  do {
    pageCount += 1;
    assert.ok(pageCount < 800, "full drain must remain bounded");
    const result = await harness.catalogPull.handlePosCatalogPull(
      {
        ...validPullInput(),
        limit: 1_000,
        ...(syncCursor ? { syncCursor } : {}),
      },
      {
        requestId: `posreq_full_drain_${pageCount}`,
        route: "pos.catalog.pull",
      },
    );

    assert.equal(result.status, 200, `page ${pageCount}`);
    assert.equal(result.body.ok, true, `page ${pageCount}`);
    firstPageSummary ??= JSON.parse(
      JSON.stringify(result.body.catalogSummary),
    );

    for (const lane of lanes) {
      for (const row of result.body.catalog[lane]) {
        const id =
          lane === "categories"
            ? row.categoryId
            : lane === "suppliers"
              ? row.supplierId
              : lane === "products"
                ? row.productId
                : row.priceId;
        assert.equal(seen[lane].has(id), false, `${lane}:${id}`);
        seen[lane].add(id);
      }
    }

    syncCursor = result.body.hasMore ? result.body.syncCursor : "";
  } while (syncCursor);

  const expectedPageCount = lanes.reduce(
    (total, lane) =>
      total +
      Math.ceil(manifest.windowCounts[lane] / lanePageLimits[lane]),
    0,
  );
  assert.equal(
    expectedPageCount,
    676,
    "the additive image fields must not change the 19,763-product drain",
  );
  assert.deepEqual(firstPageSummary, manifest.catalogSummary);
  assert.equal(pageCount, expectedPageCount);
  for (const lane of lanes) {
    assert.equal(
      seen[lane].size,
      firstPageSummary[lane],
      `${lane} must equal the first-page manifest`,
    );
    assert.ok(
      pageCalls.some((call) => call.lane === lane),
      `${lane} must be requested`,
    );
    assert.equal(
      Math.max(
        ...pageCalls
          .filter((call) => call.lane === lane)
          .map((call) => call.returned),
      ),
      Math.min(manifest.windowCounts[lane], lanePageLimits[lane]),
      `${lane} must honor its RPC page clamp`,
    );
  }
  assert.equal(
    seen.products.size,
    firstPageSummary.activeProducts,
    "active product count must match the first-page manifest",
  );
  assert.equal(harness.publicationCalls.length, pageCount);
  assert.equal(harness.auditCalls.length, 0);
  assert.equal(pageCalls[0].includeManifest, true);
  assert.equal(
    pageCalls.slice(1).every((call) => call.includeManifest === false),
    true,
  );
  assert.equal(
    pageCalls.some((call) => call.afterIdPresent),
    true,
    "the drain must exercise continuation keysets",
  );
});

test("TASK-146 public revisions are canonical while cursor keysets retain raw microseconds", async () => {
  const rawTimestamp = "2026-07-28T21:31:00.123456+00:00";
  const productId = "60000000-0000-4000-8000-000000000146";
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "products",
      entityHasMore: true,
      manifest: {
        catalogSummary: {
          activeProducts: 1,
          categories: 0,
          prices: 0,
          products: 1,
          suppliers: 0,
        },
        windowCounts: {
          categories: 0,
          prices: 0,
          products: 1,
          suppliers: 0,
        },
      },
      pageLimit: 1,
      rows: [
        {
          barcode: "TASK146-SYNTHETIC",
          category_id: null,
          deleted_at: null,
          id: productId,
          item_number: null,
          primary_image_updated_at: null,
          primary_image_version_id: null,
          product_name: "TASK-146 synthetic product",
          purchase_price: null,
          retail_price: null,
          second_product_name: null,
          stock_quantity: null,
          supplier_id: null,
          updated_at: rawTimestamp,
        },
      ],
      snapshotAt: "2026-07-28T21:32:00.000000+00:00",
    },
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput());

  assert.equal(result.status, 200);
  assert.equal(
    result.body.catalog.products[0].updatedAt,
    "2026-07-28T21:31:00.123456Z",
  );
  const cursor = harness.cursorStates.get(result.body.syncCursor);
  assert.equal(cursor.afterUpdatedAt, rawTimestamp);
  assert.equal(harness.publicationCalls.length, 1);
});

test("TASK-146 invalid public revision timestamps fail closed with bounded audit", async () => {
  const rawTimestamp = "2026-07-28T21:31:00.123456+01:00";
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      rows: [
        {
          ...defaultPage().rows[0],
          updated_at: rawTimestamp,
        },
      ],
    },
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput());

  assert.equal(result.status, 500);
  assert.equal(result.body.code, "catalog_revision_timestamp_invalid");
  assert.equal(result.body.root, "catalog_response_invalid");
  assert.equal(result.body.stage, "categories");
  assert.equal(harness.publicationCalls.length, 0);
  assert.equal(harness.auditCalls.length, 1);
  assert.equal(
    harness.auditCalls[0].metadata.reason,
    "catalog_revision_timestamp_invalid",
  );
  assert.equal(JSON.stringify(harness.auditCalls[0]).includes(rawTimestamp), false);
  assert.equal(JSON.stringify(result).includes(rawTimestamp), false);
});

test("TASK-146 category, supplier and product tombstones share one canonical format", async () => {
  const rawUpdatedAt = "2026-07-28T21:31:00.1+00:00";
  const rawDeletedAt = "2026-07-28T21:31:00.12+0000";
  const scenarios = [
    {
      entity: "categories",
      expected: {
        categoryId: "60000000-0000-4000-8000-000000000146",
        deletedAt: "2026-07-28T21:31:00.120000Z",
        updatedAt: "2026-07-28T21:31:00.100000Z",
      },
      row: {
        deleted_at: rawDeletedAt,
        id: "60000000-0000-4000-8000-000000000146",
        name: "TASK-146 synthetic category",
        updated_at: rawUpdatedAt,
      },
    },
    {
      entity: "suppliers",
      expected: {
        deletedAt: "2026-07-28T21:31:00.120000Z",
        supplierId: "70000000-0000-4000-8000-000000000146",
        updatedAt: "2026-07-28T21:31:00.100000Z",
      },
      row: {
        deleted_at: rawDeletedAt,
        id: "70000000-0000-4000-8000-000000000146",
        name: "TASK-146 synthetic supplier",
        updated_at: rawUpdatedAt,
      },
    },
    {
      entity: "products",
      expected: {
        deletedAt: "2026-07-28T21:31:00.120000Z",
        productId: "80000000-0000-4000-8000-000000000146",
        updatedAt: "2026-07-28T21:31:00.100000Z",
      },
      row: {
        barcode: "TASK146-TOMBSTONE",
        category_id: null,
        deleted_at: rawDeletedAt,
        id: "80000000-0000-4000-8000-000000000146",
        item_number: null,
        primary_image_updated_at: null,
        primary_image_version_id: null,
        product_name: "TASK-146 synthetic product",
        purchase_price: null,
        retail_price: null,
        second_product_name: null,
        stock_quantity: null,
        supplier_id: null,
        updated_at: rawUpdatedAt,
      },
    },
  ];

  for (const scenario of scenarios) {
    const counts = {
      categories: 0,
      prices: 0,
      products: 0,
      suppliers: 0,
      [scenario.entity]: 1,
    };
    const harness = loadCatalogPull({
      page: {
        ...defaultPage(),
        entity: scenario.entity,
        manifest: {
          catalogSummary: {
            activeProducts: 0,
            categories: counts.categories,
            prices: counts.prices,
            products: counts.products,
            suppliers: counts.suppliers,
          },
          windowCounts: counts,
        },
        rows: [scenario.row],
      },
    });
    const result = await harness.catalogPull.handlePosCatalogPull(validPullInput());

    assert.equal(result.status, 200, scenario.entity);
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(result.body.catalog.tombstones[scenario.entity][0]),
      ),
      scenario.expected,
      scenario.entity,
    );
  }
});

test("TASK-146 legacy price timestamps remain byte-unchanged", async () => {
  const legacyTimestamp = "2026-07-28 21:31:00.123456";
  const harness = loadCatalogPull({
    page: {
      ...defaultPage(),
      entity: "prices",
      manifest: {
        catalogSummary: {
          activeProducts: 1,
          categories: 0,
          prices: 1,
          products: 1,
          suppliers: 0,
        },
        windowCounts: {
          categories: 0,
          prices: 1,
          products: 0,
          suppliers: 0,
        },
      },
      rows: [
        {
          created_at: legacyTimestamp,
          effective_at: legacyTimestamp,
          id: "90000000-0000-4000-8000-000000000146",
          price: 2,
          product_id: "80000000-0000-4000-8000-000000000146",
          source: "task-146-test",
          type: "RETAIL",
          updated_at: "2026-07-28T21:31:00.123456+00:00",
        },
      ],
    },
  });
  const result = await harness.catalogPull.handlePosCatalogPull(validPullInput());

  assert.equal(result.status, 200);
  assert.equal(result.body.catalog.prices[0].effectiveAt, legacyTimestamp);
});

test("TASK-143 runtime fix removes the heavy write policy and preserves bounded paging", () => {
  const endpoint = read("src/server/pos-auth/catalog-pull.ts");
  const revision = read("src/server/pos-auth/catalog-revision.ts");
  const route = read("src/app/api/pos/catalog/pull/route.ts");
  const wrangler = read("wrangler.jsonc");

  assert.doesNotMatch(endpoint, /@\/lib\/catalog-text-policy/);
  assert.match(endpoint, /catalog-text-read-validation/);
  assert.match(endpoint, /catalog_rpc_upstream_unavailable/);
  assert.match(revision, /PGRST00\[0-3\]/);
  assert.match(route, /handlePosCatalogRouteFailure/);
  assert.match(route, /edgeCorrelationHash/);
  assert.doesNotMatch(wrangler, /cpu_ms/);
  assert.doesNotMatch(endpoint, /error\.(?:message|details|hint)/);
  assert.match(endpoint, /console\.error\(\s*JSON\.stringify\(\{/);
  assert.doesNotMatch(endpoint, /console\.error\((?:input|meta|error)/);
});
