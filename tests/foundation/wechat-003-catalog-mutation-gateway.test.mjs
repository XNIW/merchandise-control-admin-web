import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");

const SHOP_ID = "20000000-0000-4000-8000-000000000003";
const ACTOR_ID = "10000000-0000-4000-8000-000000000003";
const TARGET_ID = "30000000-0000-4000-8000-000000000003";
const REPLACEMENT_ID = "40000000-0000-4000-8000-000000000003";
const IDEMPOTENCY_KEY = "50000000-0000-4000-8000-000000000003";
const CORRELATION_ID = "60000000-0000-4000-8000-000000000003";
const UPDATED_AT = "2026-08-13T12:34:56.123Z";
const AUTHORIZATION = `Bearer ${"a".repeat(64)}`;
const SERVICE_ROLE_KEY = "service-role-test-key";

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadTypeScriptModule(
  relativePath,
  mockedRequires = {},
  globals = {},
) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  }).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(
    output,
    {
      AbortSignal,
      Headers,
      Request,
      Response,
      TextDecoder,
      Uint8Array,
      URL,
      exports: cjsModule.exports,
      module: cjsModule,
      process: { env: {} },
      require(specifier) {
        if (Object.hasOwn(mockedRequires, specifier)) {
          return mockedRequires[specifier];
        }
        return require(specifier);
      },
      ...globals,
    },
    { filename: relativePath },
  );

  return cjsModule.exports;
}

const catalogTextPolicy = loadTypeScriptModule(
  "src/lib/catalog-text-policy.ts",
);

function loadGateway({
  authGetUser,
  authResult = {
    data: { user: { id: ACTOR_ID } },
    error: null,
  },
  events = [],
  fetchImpl = globalThis.fetch,
  env = {},
} = {}) {
  return loadTypeScriptModule(
    "src/server/wechat/catalog-mutation-gateway.ts",
    {
      "@/lib/catalog-text-policy": catalogTextPolicy,
      "@/lib/supabase/admin": {
        resolveSupabaseAdminConfig() {
          return {
            serviceRoleKey: SERVICE_ROLE_KEY,
            status: "configured",
            url: "https://project.supabase.co",
          };
        },
      },
      "@/server/auth/wechat-mini-session": {
        async resolveWeChatMiniSession(input) {
          events.push({ input, type: "opaque_session" });
          if (authGetUser) return authGetUser({ events, input });
          return authResult.data.user?.id
            ? {
                accountFingerprint: "f".repeat(64),
                actorProfileId: authResult.data.user.id,
                expiresAt: 2_000_000_000,
                generation: 1,
                ok: true,
                sessionId: "70000000-0000-4000-8000-000000000003",
              }
            : { code: "session_expired", ok: false };
        },
      },
      "@/server/auth/wechat-config": {
        isWeChatSurfaceReady() {
          return true;
        },
        resolveWeChatRuntimeConfig() {
          return { activation: "ready", enabledSurfaces: { mini_program: true } };
        },
      },
      "server-only": {},
    },
    {
      fetch: (...args) => fetchImpl(...args),
      process: { env },
    },
  );
}

function requestFor(operation, payload, overrides = {}) {
  const create = operation.endsWith("_create");
  return {
    schemaVersion: 1,
    shopId: SHOP_ID,
    operation,
    ...(create
      ? {}
      : { expectedUpdatedAt: UPDATED_AT, targetId: TARGET_ID }),
    payload,
    ...overrides,
  };
}

const validPayloads = {
  category_archive: { reason: "Merge", replacementId: REPLACEMENT_ID },
  category_create: { name: "Food" },
  category_restore: { reason: "Reopen" },
  category_update: { name: "Fresh food" },
  product_archive: { reason: "Discontinued" },
  product_create: {
    barcode: "690000000001",
    productName: "Tea",
    purchasePrice: 1.125,
    retailPrice: 2.5,
  },
  product_price_update: { price: 3.125, priceType: "RETAIL" },
  product_restore: { reason: "Relisted" },
  product_update: {
    barcode: "690000000001",
    categoryId: null,
    productName: "Green tea",
    supplierId: REPLACEMENT_ID,
  },
  supplier_archive: { reason: "Merged", replacementId: null },
  supplier_create: { name: "Supplier A" },
  supplier_restore: { reason: "Reopen" },
  supplier_update: { name: "Supplier B" },
};

test("WECHAT-003 parser accepts only the 13 exact versioned operations", () => {
  const gateway = loadGateway();
  for (const [operation, payload] of Object.entries(validPayloads)) {
    assert.ok(
      gateway.parseWeChatCatalogMutationInput(requestFor(operation, payload)),
      operation,
    );
  }
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("product_update", {
        barcode: "690000000001",
        productName: "Tea",
        retailPrice: 2,
      }),
    ),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("product_update", { productName: "Missing barcode" }),
    ),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("product_price_update", { price: 1.2345, priceType: "RETAIL" }),
    ),
    null,
  );
  assert.ok(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("product_price_update", {
        price: 999_999_999_999.999,
        priceType: "RETAIL",
      }),
    ),
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("product_price_update", {
        price: 1_000_000_000_000,
        priceType: "RETAIL",
      }),
    ),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("category_update", { name: "unsafe\nname" }),
    ),
    null,
  );
});

test("WECHAT-003 parser rejects unknown keys and invalid CAS boundaries", () => {
  const gateway = loadGateway();
  assert.equal(
    gateway.parseWeChatCatalogMutationInput({
      ...requestFor("category_create", { name: "Food" }),
      unexpected: true,
    }),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("category_create", { name: "Food" }, { expectedUpdatedAt: UPDATED_AT }),
    ),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("category_create", { name: "Food" }, { targetId: "not-a-uuid" }),
    ),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("category_create", { name: "Food" }, { targetId: TARGET_ID }),
    )?.targetId,
    TARGET_ID,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("category_update", { name: "Food" }, { expectedUpdatedAt: null }),
    ),
    null,
  );
  assert.equal(
    gateway.parseWeChatCatalogMutationInput(
      requestFor("supplier_archive", {
        reason: "Self replacement",
        replacementId: TARGET_ID,
      }),
    ),
    null,
  );
});

test("WECHAT-003 requires UUID idempotency and correlation headers", () => {
  const gateway = loadGateway();
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        gateway.parseWeChatMutationHeaders(
          new Headers({
            "Idempotency-Key": IDEMPOTENCY_KEY,
            "X-Correlation-ID": CORRELATION_ID,
          }),
        ),
      ),
    ),
    { correlationId: CORRELATION_ID, idempotencyKey: IDEMPOTENCY_KEY },
  );
  assert.equal(gateway.parseWeChatMutationHeaders(new Headers()), null);
});

test("WECHAT-003 mutation flag is exact, shared, and defaults OFF", () => {
  const gateway = loadGateway();
  assert.equal(gateway.isMiniProgramCatalogMutationEnabled({}), false);
  assert.equal(
    gateway.isMiniProgramCatalogMutationEnabled({
      WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED: "true",
    }),
    true,
  );
  assert.equal(
    gateway.isMiniProgramCatalogMutationEnabled({
      WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED: " true ",
    }),
    false,
  );
});

test("WECHAT-003 gateway verifies the bearer before its trusted RPC", async () => {
  let captured;
  const events = [];
  const gateway = loadGateway({
    events,
    fetchImpl: async (url, init) => {
      events.push({ type: "rpc" });
      captured = { init, url: String(url) };
      return Response.json({
        code: "success",
        correlation_id: CORRELATION_ID,
        ok: true,
        payload: {},
        replayed: false,
        shop_id: SHOP_ID,
        target_id: TARGET_ID,
        updated_at: UPDATED_AT,
      });
    },
  });
  const mutation = gateway.parseWeChatCatalogMutationInput(
    requestFor("category_update", { name: "Fresh food" }),
  );
  const result = await gateway.callWeChatCatalogMutation({
    authorization: AUTHORIZATION,
    correlationId: CORRELATION_ID,
    deviceId: "80000000-0000-4000-8000-000000000003",
    idempotencyKey: IDEMPOTENCY_KEY,
    mutation,
  });

  assert.equal(
    captured.url,
    "https://project.supabase.co/rest/v1/rpc/wechat_catalog_mutate_v1",
  );
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.redirect, "error");
  assert.equal(captured.init.cache, "no-store");
  assert.equal(
    captured.init.headers.Authorization,
    `Bearer ${SERVICE_ROLE_KEY}`,
  );
  assert.equal(captured.init.headers.apikey, SERVICE_ROLE_KEY);
  assert.notEqual(captured.init.headers.Authorization, AUTHORIZATION);
  assert.deepEqual(JSON.parse(captured.init.body), {
    p_actor_profile_id: ACTOR_ID,
    p_correlation_id: CORRELATION_ID,
    p_expected_updated_at: UPDATED_AT,
    p_idempotency_key: IDEMPOTENCY_KEY,
    p_operation: "category_update",
    p_payload: { name: "Fresh food" },
    p_shop_id: SHOP_ID,
    p_target_id: TARGET_ID,
  });
  assert.deepEqual(
    events.map((event) => event.type),
    ["opaque_session", "rpc"],
  );
  assert.equal(events[0].input.authorization, AUTHORIZATION);
  assert.equal(
    events[0].input.deviceId,
    "80000000-0000-4000-8000-000000000003",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    body: {
      mutation: {
        code: "success",
        correlationId: CORRELATION_ID,
        replayed: false,
        shopId: SHOP_ID,
        targetId: TARGET_ID,
        updatedAt: UPDATED_AT,
      },
      ok: true,
    },
    status: 200,
  });
});

test("WECHAT-003 gateway rejects an invalid personal session before RPC", async () => {
  const events = [];
  const gateway = loadGateway({
    authResult: {
      data: { user: null },
      error: { status: 401 },
    },
    events,
    fetchImpl: async () => {
      events.push({ type: "unexpected_rpc" });
      throw new Error("Mutation RPC must not run");
    },
  });
  const mutation = gateway.parseWeChatCatalogMutationInput(
    requestFor("category_update", { name: "Fresh food" }),
  );
  const result = await gateway.callWeChatCatalogMutation({
    authorization: AUTHORIZATION,
    correlationId: CORRELATION_ID,
    deviceId: "80000000-0000-4000-8000-000000000003",
    idempotencyKey: IDEMPOTENCY_KEY,
    mutation,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    body: { code: "session_expired", ok: false },
    status: 401,
  });
  assert.deepEqual(
    events.map((event) => event.type),
    ["opaque_session"],
  );
});

test("WECHAT-004 blocks a transient opaque-session failure before trusted RPC", async () => {
  let rpcCalls = 0;
  const gateway = loadGateway({
    authGetUser: async () => ({ code: "backend_temporary", ok: false }),
    fetchImpl: async () => {
      rpcCalls += 1;
      throw new Error("Mutation RPC must not run");
    },
  });
  const mutation = gateway.parseWeChatCatalogMutationInput(
    requestFor("category_update", { name: "Fresh food" }),
  );
  const result = await gateway.callWeChatCatalogMutation({
    authorization: AUTHORIZATION,
    correlationId: CORRELATION_ID,
    deviceId: "80000000-0000-4000-8000-000000000003",
    idempotencyKey: IDEMPOTENCY_KEY,
    mutation,
  });

  assert.equal(rpcCalls, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    body: { code: "retryable_error", ok: false },
    status: 503,
  });
});

test("WECHAT-003 treats trusted RPC authorization failure as backend failure", async () => {
  const gateway = loadGateway({
    fetchImpl: async () =>
      Response.json({ message: "not exposed" }, { status: 403 }),
  });
  const mutation = gateway.parseWeChatCatalogMutationInput(
    requestFor("category_update", { name: "Fresh food" }),
  );
  const result = await gateway.callWeChatCatalogMutation({
    authorization: AUTHORIZATION,
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    mutation,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    body: { code: "retryable_error", ok: false },
    status: 503,
  });
});

test("WECHAT-003 gateway sanitizes unknown and cross-shop RPC results", async () => {
  for (const rpcResult of [
    {
      code: "future_secret_code",
      correlation_id: CORRELATION_ID,
      ok: false,
      payload: {},
      replayed: false,
      shop_id: SHOP_ID,
      target_id: TARGET_ID,
      updated_at: null,
    },
    {
      code: "success",
      correlation_id: CORRELATION_ID,
      ok: true,
      payload: {},
      replayed: false,
      shop_id: REPLACEMENT_ID,
      target_id: TARGET_ID,
      updated_at: UPDATED_AT,
    },
  ]) {
    const gateway = loadGateway({
      fetchImpl: async () => Response.json(rpcResult),
    });
    const mutation = gateway.parseWeChatCatalogMutationInput(
      requestFor("category_update", { name: "Food" }),
    );
    const result = await gateway.callWeChatCatalogMutation({
      authorization: AUTHORIZATION,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      mutation,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      body: { code: "retryable_error", ok: false },
      status: 503,
    });
  }
});

test("WECHAT-003 gateway maps the final SQL error taxonomy without leaking", async () => {
  const expected = {
    conflict: [409, "conflict"],
    duplicate_barcode: [409, "duplicate_barcode"],
    entity_not_found: [404, "entity_not_found"],
    idempotency_conflict: [409, "idempotency_conflict"],
    invalid_category: [400, "invalid_category"],
    invalid_price: [400, "invalid_price"],
    invalid_state: [409, "invalid_state"],
    invalid_supplier: [400, "invalid_supplier"],
    membership_missing: [403, "membership_missing"],
    permission_denied: [403, "permission_denied"],
    profile_suspended: [403, "profile_suspended"],
    rate_limited: [429, "rate_limited"],
    replacement_required: [409, "invalid_state"],
    retryable_error: [503, "retryable_error"],
    shop_suspended: [403, "shop_suspended"],
    stale_version: [409, "stale_version"],
    unauthenticated: [401, "unauthenticated"],
    validation_failed: [400, "validation_failed"],
  };

  for (const [sqlCode, [status, publicCode]] of Object.entries(expected)) {
    const gateway = loadGateway({
      fetchImpl: async () =>
        Response.json({
          code: sqlCode,
          correlation_id: CORRELATION_ID,
          ok: false,
          payload: {},
          replayed: false,
          shop_id: SHOP_ID,
          target_id: TARGET_ID,
          updated_at: null,
        }),
    });
    const mutation = gateway.parseWeChatCatalogMutationInput(
      requestFor("category_update", { name: "Food" }),
    );
    const result = await gateway.callWeChatCatalogMutation({
      authorization: AUTHORIZATION,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      mutation,
    });
    assert.equal(result.status, status, sqlCode);
    assert.equal(result.body.code, publicCode, sqlCode);
    assert.deepEqual(Object.keys(result.body).sort(), ["code", "ok"]);
  }
});

function loadRoute(gatewayOverrides) {
  return loadTypeScriptModule(
    "src/app/api/mini-program/v1/catalog/mutations/route.ts",
    { "@/server/wechat/catalog-mutation-gateway": gatewayOverrides },
  );
}

function routeRequest(body = "{}", headers = {}) {
  return new Request("https://admin.example.test/api/mini-program/v1/catalog/mutations", {
    body,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": IDEMPOTENCY_KEY,
      "X-Correlation-ID": CORRELATION_ID,
      ...headers,
    },
    method: "POST",
  });
}

test("WECHAT-003 route rejects default-OFF before parsing or RPC", async () => {
  let parserCalls = 0;
  let rpcCalls = 0;
  const route = loadRoute({
    WECHAT_CATALOG_MUTATION_BODY_LIMIT: 16 * 1024,
    async callWeChatCatalogMutation() {
      rpcCalls += 1;
    },
    isMiniProgramCatalogMutationReady() {
      return false;
    },
    parseWeChatCatalogMutationInput() {
      parserCalls += 1;
    },
    parseWeChatMutationHeaders() {
      return { correlationId: CORRELATION_ID, idempotencyKey: IDEMPOTENCY_KEY };
    },
  });
  const response = await route.POST(routeRequest());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-correlation-id"), CORRELATION_ID);
  assert.equal(parserCalls, 0);
  assert.equal(rpcCalls, 0);
});

test("WECHAT-003 route distinguishes unsupported and oversized bodies", async () => {
  const route = loadRoute({
    WECHAT_CATALOG_MUTATION_BODY_LIMIT: 16 * 1024,
    async callWeChatCatalogMutation() {
      throw new Error("RPC must not run");
    },
    isMiniProgramCatalogMutationReady() {
      return true;
    },
    parseWeChatCatalogMutationInput() {
      throw new Error("parser must not run");
    },
    parseWeChatMutationHeaders() {
      return { correlationId: CORRELATION_ID, idempotencyKey: IDEMPOTENCY_KEY };
    },
  });
  const unsupported = await route.POST(
    routeRequest("{}", { "Content-Type": "text/plain" }),
  );
  const oversized = await route.POST(
    routeRequest("{}", { "Content-Length": String(16 * 1024 + 1) }),
  );
  assert.equal(unsupported.status, 415);
  assert.equal(oversized.status, 413);
});

test("WECHAT-003 source pins the only PostgREST write lane and guardrail", () => {
  const gateway = read("src/server/wechat/catalog-mutation-gateway.ts");
  const route = read("src/app/api/mini-program/v1/catalog/mutations/route.ts");
  const security = read("scripts/security-checks.mjs");
  const envExample = read(".env.example");

  assert.match(gateway, /\/rest\/v1\/rpc\/wechat_catalog_mutate_v1/);
  assert.match(gateway, /resolveWeChatMiniSession\(\{/);
  assert.match(gateway, /resolveSupabaseAdminConfig\(\)/);
  assert.match(gateway, /p_actor_profile_id: actor\.actorProfileId/);
  assert.match(gateway, /const GATEWAY_TIMEOUT_MS = 8_000/);
  assert.match(gateway, /const RPC_TIMEOUT_MS = 6_000/);
  assert.match(gateway, /redirect: "error"/);
  assert.match(gateway, /apikey: adminConfig\.serviceRoleKey/);
  assert.match(
    gateway,
    /Authorization: `Bearer \$\{adminConfig\.serviceRoleKey\}`/,
  );
  assert.match(route, /isMiniProgramCatalogMutationReady\(\)/);
  assert.match(route, /status: 405/);
  assert.match(security, /\.\.\.listFiles\("src\/server\/wechat"\)/);
  assert.match(security, /allowedPostgrestRpcsByFile/);
  assert.match(security, /new Set\(\["wechat_catalog_mutate_v1"\]\)/);
  assert.match(
    envExample,
    /^WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED=$/m,
  );
});

test("WECHAT-003 schema removes the direct authenticated mutation grant", () => {
  const migration = read(
    "supabase/migrations/20260813035221_wechat_003_catalog_mutations.sql",
  ).replace(/\s+/g, " ");
  const pgTap = read(
    "supabase/tests/wechat_003_catalog_mutations.sql",
  ).replace(/\s+/g, " ");

  assert.match(
    migration,
    /drop function if exists public\.wechat_catalog_mutate_v1\( uuid, text, uuid, uuid, timestamptz, uuid, jsonb \)/,
  );
  assert.match(
    migration,
    /create or replace function public\.wechat_catalog_mutate_v1\( p_actor_profile_id uuid, p_shop_id uuid, p_operation text, p_idempotency_key uuid, p_correlation_id uuid, p_expected_updated_at timestamptz, p_target_id uuid, p_payload jsonb \)/,
  );
  assert.match(
    migration,
    /revoke all on function public\.wechat_catalog_mutate_v1\( uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb \) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.wechat_catalog_mutate_v1\( uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb \) to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.wechat_catalog_mutate_v1\([^;]+\) to authenticated;/,
  );
  assert.match(
    pgTap,
    /'authenticated', array\[\]::text\[\]/,
  );
  assert.match(
    pgTap,
    /'service_role', array\['EXECUTE'\]/,
  );
});
