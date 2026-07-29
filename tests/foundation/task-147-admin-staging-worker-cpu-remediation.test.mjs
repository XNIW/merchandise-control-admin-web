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

function transpileCommonJs(relativePath, stubs = {}, globals = {}) {
  const transpiled = ts.transpileModule(read(relativePath), {
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
      Buffer,
      Date,
      Request,
      Response,
      TextDecoder,
      Uint8Array,
      URL,
      console: globals.console ?? console,
      exports: cjsModule.exports,
      fetch: globals.fetch ?? fetch,
      module: cjsModule,
      process: globals.process ?? process,
      require(specifier) {
        if (specifier === "server-only") return {};
        if (specifier in stubs) return stubs[specifier];
        return requireForTest(specifier);
      },
    }),
  );

  return cjsModule.exports;
}

function loadRoute(relativePath, heavySpecifier, heavyModule) {
  const rejectionAudits = [];
  const security = transpileCommonJs(
    "src/app/api/pos/_shared/pos-route-security.ts",
    {},
    {
      console: {
        warn(value) {
          rejectionAudits.push(String(value));
        },
      },
    },
  );
  const envelope = transpileCommonJs(
    "src/server/pos-auth/route-envelope.ts",
  );
  let heavyLoads = 0;
  const route = transpileCommonJs(relativePath, {
    "../../_shared/pos-route-security": security,
    "@/server/pos-auth/route-envelope": envelope,
    [heavySpecifier]: new Proxy(heavyModule, {
      get(target, property, receiver) {
        heavyLoads += property === "__esModule" ? 0 : 1;
        return Reflect.get(target, property, receiver);
      },
    }),
  });

  return {
    heavyLoads: () => heavyLoads,
    rejectionAudits: () => rejectionAudits,
    route,
  };
}

function jsonRequest(path, body, headers = {}) {
  return new Request(`https://example.invalid${path}`, {
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

test("TASK-147 catalog guard returns typed 400 without loading catalog domain", async () => {
  const harness = loadRoute(
    "src/app/api/pos/catalog/pull/route.ts",
    "@/server/pos-auth/catalog-pull",
    {
      handlePosCatalogPull: async () => {
        throw new Error("catalog domain must remain unloaded");
      },
      handlePosCatalogRouteFailure: async () => {
        throw new Error("catalog failure domain must remain unloaded");
      },
    },
  );
  const response = await harness.route.POST(
    jsonRequest("/api/pos/catalog/pull", ""),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "validation_failed");
  assert.equal(body.root, "validation");
  assert.equal(body.stage, "catalog_pull");
  assert.match(body.requestId, /^posreq_[0-9a-f-]{36}$/);
  assert.equal(harness.heavyLoads(), 0);
  assert.deepEqual(
    JSON.parse(harness.rejectionAudits()[0]),
    {
      code: "validation_failed",
      event: "pos.route.rejection",
      requestId: body.requestId,
      route: "pos.catalog.pull",
      stage: "catalog_pull",
    },
  );
});

test("TASK-147 obviously malformed non-empty envelopes remain on the light path", async () => {
  const catalog = loadRoute(
    "src/app/api/pos/catalog/pull/route.ts",
    "@/server/pos-auth/catalog-pull",
    {},
  );
  const firstLogin = loadRoute(
    "src/app/api/pos/auth/first-login/route.ts",
    "@/server/pos-auth/first-login-service",
    {},
  );
  const mutation = loadRoute(
    "src/app/api/pos/catalog/article-mutations/route.ts",
    "@/server/pos-auth/article-mutations",
    {},
  );
  const responses = await Promise.all([
    catalog.route.POST(
      jsonRequest(
        "/api/pos/catalog/pull",
        JSON.stringify({
          deviceToken: "x",
          posSessionId: "x",
          sessionToken: "x",
          shopDeviceId: "x",
        }),
      ),
    ),
    firstLogin.route.POST(
      jsonRequest(
        "/api/pos/auth/first-login",
        JSON.stringify({
          credential: "x",
          device: { deviceIdentifier: "x" },
          shopCode: "x",
          staffCode: "x",
        }),
      ),
    ),
    mutation.route.POST(
      jsonRequest(
        "/api/pos/catalog/article-mutations",
        JSON.stringify({
          appVersion: "x",
          deviceToken: "x",
          mutations: [{}],
          posSessionId: "x",
          schemaVersion: "x",
          sessionToken: "x",
          shopDeviceId: "x",
          shopId: "x",
          staffCredentialVersion: 1,
          staffId: "x",
        }),
      ),
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [400, 400, 400],
  );
  assert.equal(catalog.heavyLoads(), 0);
  assert.equal(firstLogin.heavyLoads(), 0);
  assert.equal(mutation.heavyLoads(), 0);
  assert.equal(catalog.rejectionAudits().length, 1);
  assert.equal(firstLogin.rejectionAudits().length, 1);
  assert.equal(mutation.rejectionAudits().length, 1);
});

test("TASK-147 unsupported catalog method returns 405 without loading catalog domain", async () => {
  const harness = loadRoute(
    "src/app/api/pos/catalog/pull/route.ts",
    "@/server/pos-auth/catalog-pull",
    {},
  );
  const response = await harness.route.GET(
    new Request("https://example.invalid/api/pos/catalog/pull"),
  );
  const body = await response.json();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  assert.equal(body.code, "method_not_allowed");
  assert.equal(harness.heavyLoads(), 0);
});

test("TASK-147 structurally valid catalog request preserves typed auth denial", async () => {
  const harness = loadRoute(
    "src/app/api/pos/catalog/pull/route.ts",
    "@/server/pos-auth/catalog-pull",
    {
      handlePosCatalogPull: async () => ({
        body: {
          code: "denied",
          message: "POS catalog pull was denied.",
          ok: false,
          root: "denied",
          stage: "lease",
        },
        status: 401,
      }),
      handlePosCatalogRouteFailure: async () => {
        throw new Error("unexpected failure boundary");
      },
    },
  );
  const response = await harness.route.POST(
    jsonRequest(
      "/api/pos/catalog/pull",
      JSON.stringify({
        deviceToken: "invalid-device-token",
        posSessionId: "20000000-0000-4000-8000-000000000147",
        sessionToken: "invalid-session-token",
        shopDeviceId: "30000000-0000-4000-8000-000000000147",
      }),
    ),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.code, "denied");
  assert.equal(body.root, "denied");
  assert.ok(harness.heavyLoads() > 0);
});

test("TASK-147 lightweight first-login RPC client preserves the bounded PostgREST contract", async () => {
  const serviceRoleKey = "task147-service-role-test-only";
  const observed = [];
  const runtimeRpcClient = transpileCommonJs(
    "src/server/pos-auth/runtime-rpc-client.ts",
    {},
    {
      fetch: async (url, init) => {
        observed.push({ init, url: String(url) });
        return Response.json([{ ok: true }]);
      },
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://task147.invalid",
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        },
      },
    },
  );
  const client = runtimeRpcClient.createPosRuntimeRpcClient();
  const result = await client.rpc("pos_task147_probe", {
    p_marker: "safe-test-only",
  });

  assert.equal(result.error, null);
  assert.equal(result.data[0].ok, true);
  assert.equal(observed.length, 1);
  assert.equal(
    observed[0].url,
    "https://task147.invalid/rest/v1/rpc/pos_task147_probe",
  );
  assert.equal(observed[0].init.method, "POST");
  assert.equal(observed[0].init.redirect, "manual");
  assert.equal(observed[0].init.headers.apikey, serviceRoleKey);
  assert.equal(
    observed[0].init.headers.authorization,
    `Bearer ${serviceRoleKey}`,
  );
  assert.equal(
    observed[0].init.body,
    JSON.stringify({ p_marker: "safe-test-only" }),
  );
});

test("TASK-147 lightweight RPC client rejects invalid names and oversized responses", async () => {
  let fetchCalls = 0;
  const runtimeRpcClient = transpileCommonJs(
    "src/server/pos-auth/runtime-rpc-client.ts",
    {},
    {
      fetch: async () => {
        fetchCalls += 1;
        return new Response("x".repeat(64 * 1024 + 1), { status: 200 });
      },
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://task147.invalid",
          SUPABASE_SERVICE_ROLE_KEY: "task147-service-role-test-only",
        },
      },
    },
  );
  const client = runtimeRpcClient.createPosRuntimeRpcClient();
  const invalidName = await client.rpc("../not-allowed", {});
  const oversized = await client.rpc("pos_task147_probe", {});

  assert.equal(invalidName.error.code, "invalid_rpc_name");
  assert.equal(fetchCalls, 1);
  assert.equal(oversized.data, null);
  assert.equal(oversized.error.code, "http_200");
});

test("TASK-147 lightweight RPC client refuses redirects and non-local HTTP origins", async () => {
  let bodyCancelCalls = 0;
  let fetchCalls = 0;
  let observedRedirectMode;
  const runtimeRpcClient = transpileCommonJs(
    "src/server/pos-auth/runtime-rpc-client.ts",
    {},
    {
      fetch: async (_url, init) => {
        fetchCalls += 1;
        observedRedirectMode = init.redirect;
        return new Response(
          new ReadableStream({
            cancel() {
              bodyCancelCalls += 1;
            },
            start(controller) {
              controller.enqueue(new TextEncoder().encode("redirect-body"));
            },
          }),
          {
          headers: { location: "https://redirect-target.invalid" },
          status: 302,
          },
        );
      },
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "https://task147.invalid",
          SUPABASE_SERVICE_ROLE_KEY: "task147-service-role-test-only",
        },
      },
    },
  );
  const client = runtimeRpcClient.createPosRuntimeRpcClient();
  const redirected = await client.rpc("pos_task147_probe", {});

  assert.equal(fetchCalls, 1);
  assert.equal(bodyCancelCalls, 1);
  assert.equal(observedRedirectMode, "manual");
  assert.equal(redirected.data, null);
  assert.equal(redirected.error.code, "http_302");

  const insecureClient = transpileCommonJs(
    "src/server/pos-auth/runtime-rpc-client.ts",
    {},
    {
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "http://remote-task147.invalid",
          SUPABASE_SERVICE_ROLE_KEY: "task147-service-role-test-only",
        },
      },
    },
  ).createPosRuntimeRpcClient();
  const localClient = transpileCommonJs(
    "src/server/pos-auth/runtime-rpc-client.ts",
    {},
    {
      process: {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          SUPABASE_SERVICE_ROLE_KEY: "task147-service-role-test-only",
        },
      },
    },
  ).createPosRuntimeRpcClient();

  assert.equal(insecureClient, null);
  assert.ok(localClient);
});

test("TASK-147 first-login guard stays light and valid envelope reaches its service", async () => {
  const malformed = loadRoute(
    "src/app/api/pos/auth/first-login/route.ts",
    "@/server/pos-auth/first-login-service",
    {},
  );
  const malformedResponse = await malformed.route.POST(
    jsonRequest("/api/pos/auth/first-login", "{}"),
  );

  assert.equal(malformedResponse.status, 400);
  assert.equal((await malformedResponse.json()).code, "validation_failed");
  assert.equal(malformed.heavyLoads(), 0);

  const valid = loadRoute(
    "src/app/api/pos/auth/first-login/route.ts",
    "@/server/pos-auth/first-login-service",
    {
      handlePosFirstLogin: async () => ({
        body: { ok: true },
        status: 200,
      }),
    },
  );
  const validResponse = await valid.route.POST(
    jsonRequest(
      "/api/pos/auth/first-login",
      JSON.stringify({
        credential: "test-only",
        device: { deviceIdentifier: "task-147-device" },
        shopCode: "QA147",
        staffCode: "QA147",
      }),
    ),
  );

  assert.equal(validResponse.status, 200);
  assert.ok(valid.heavyLoads() > 0);
});

test("TASK-147 article mutation rejects malformed and oversized envelopes before domain load", async () => {
  const harness = loadRoute(
    "src/app/api/pos/catalog/article-mutations/route.ts",
    "@/server/pos-auth/article-mutations",
    {},
  );
  const malformedResponse = await harness.route.POST(
    jsonRequest("/api/pos/catalog/article-mutations", "{}"),
  );
  const oversizedResponse = await harness.route.POST(
    jsonRequest("/api/pos/catalog/article-mutations", "{}", {
      "content-length": String(256 * 1024 + 1),
    }),
  );

  assert.equal(malformedResponse.status, 400);
  assert.equal(oversizedResponse.status, 400);
  assert.equal((await malformedResponse.json()).code, "validation_failed");
  assert.equal((await oversizedResponse.json()).code, "validation_failed");
  assert.equal(harness.heavyLoads(), 0);
});

test("TASK-147 valid article mutation envelope reaches only the mutation service", async () => {
  const harness = loadRoute(
    "src/app/api/pos/catalog/article-mutations/route.ts",
    "@/server/pos-auth/article-mutations",
    {
      handlePosArticleMutations: async () => ({
        body: { ok: true, results: [] },
        status: 200,
      }),
    },
  );
  const response = await harness.route.POST(
    jsonRequest(
      "/api/pos/catalog/article-mutations",
      JSON.stringify({
        appVersion: "task-147",
        deviceToken: "test-device-token",
        mutations: [
          {
            attemptToken: "task147-attempt",
            baseRevision: null,
            changes: {
              barcode: "TASK147",
              primaryName: "Task 147",
            },
            clientProductId: "task147-product",
            createdAt: "2026-07-29T00:00:00.000Z",
            fieldMask: [],
            idempotencyKey: "task147-idempotency",
            localSequence: 1,
            mutationId: "task147-mutation",
            mutationKind: "product_create",
            occurredAt: "2026-07-29T00:00:00.000Z",
            payloadHash: `sha256:${"a".repeat(64)}`,
            remoteProductId: null,
          },
        ],
        posSessionId: "40000000-0000-4000-8000-000000000147",
        schemaVersion: "pos-article-mutation-v1",
        sessionToken: "test-session-token",
        shopDeviceId: "30000000-0000-4000-8000-000000000147",
        shopId: "10000000-0000-4000-8000-000000000147",
        staffCredentialVersion: 1,
        staffId: "20000000-0000-4000-8000-000000000147",
      }),
    ),
  );

  assert.equal(response.status, 200);
  assert.ok(harness.heavyLoads() > 0);
});

test("TASK-147 source graph keeps read, write and Admin domains isolated", () => {
  const catalogRoute = read("src/app/api/pos/catalog/pull/route.ts");
  const mutationRoute = read(
    "src/app/api/pos/catalog/article-mutations/route.ts",
  );
  const firstLoginRoute = read("src/app/api/pos/auth/first-login/route.ts");
  const firstLoginService = read(
    "src/server/pos-auth/first-login-service.ts",
  );
  const firstLoginCore = read(
    "src/server/pos-auth/first-login-core.ts",
  );
  const legacyPosService = read("src/server/pos-auth/service.ts");
  const runtimeRpcClient = read(
    "src/server/pos-auth/runtime-rpc-client.ts",
  );
  const catalog = read("src/server/pos-auth/catalog-pull.ts");
  const envelope = read("src/server/pos-auth/route-envelope.ts");

  assert.match(
    catalogRoute,
    /await import\("@\/server\/pos-auth\/catalog-pull"\)/,
  );
  assert.match(
    mutationRoute,
    /await import\(\s*"@\/server\/pos-auth\/article-mutations"\s*\)/,
  );
  assert.match(
    firstLoginRoute,
    /await import\(\s*"@\/server\/pos-auth\/first-login-service"\s*\)/,
  );
  assert.doesNotMatch(
    catalogRoute,
    /from "@\/server\/pos-auth\/catalog-pull"/,
  );
  assert.doesNotMatch(
    mutationRoute,
    /from "@\/server\/pos-auth\/article-mutations"/,
  );
  assert.doesNotMatch(
    firstLoginRoute,
    /from "@\/server\/pos-auth\/first-login-service"/,
  );
  assert.doesNotMatch(
    firstLoginService,
    /createSupabaseAdminClient|resolveSupabaseAdminConfig/,
  );
  assert.match(
    firstLoginService,
    /handlePosFirstLoginWithClient\(\s*createPosRuntimeRpcClient\(\)/,
  );
  assert.match(firstLoginCore, /commitPosFirstLogin/);
  assert.match(firstLoginCore, /publishPosRuntimeLeaseSuccess/);
  assert.match(firstLoginCore, /writePosRuntimeAudit/);
  assert.match(
    legacyPosService,
    /handlePosFirstLoginWithClient\(supabase, input, meta\)/,
  );
  assert.doesNotMatch(
    legacyPosService,
    /commitPosFirstLogin|loadPosFirstLoginIdentity|recordPosFirstLoginFailure/,
  );
  assert.doesNotMatch(runtimeRpcClient, /@supabase\/supabase-js/);
  assert.match(runtimeRpcClient, /MAX_RPC_JSON_RESPONSE_BYTES/);
  assert.match(runtimeRpcClient, /redirect: "manual"/);
  assert.doesNotMatch(catalog, /@\/lib\/catalog-text-policy/);
  assert.doesNotMatch(catalog, /@\/server\/shop-admin\/access-principal/);
  assert.doesNotMatch(
    envelope,
    /article-mutations|catalog-pull|supabase|platform|shop-admin|ui\//i,
  );
});

test("TASK-147 bounded audit allowlist permits exactly one secret-free console sink", () => {
  const scanner = read("scripts/security-checks.mjs");
  const routeSecurity = read(
    "src/app/api/pos/_shared/pos-route-security.ts",
  );
  const auditLogger = routeSecurity.match(
    /export function emitPosRouteRejectionAudit\([\s\S]*?\n}\n(?=\nexport function posMethodNotAllowedResponse)/,
  )?.[0];

  assert.ok(auditLogger);
  assert.equal(
    (
      auditLogger.match(
        /console\.(?:log|debug|info|warn|error)\s*\(/g,
      ) ?? []
    ).length,
    1,
  );
  assert.match(
    scanner,
    /routeRejectionLogger !== expectedRouteRejectionLogger/,
  );
  assert.match(scanner, /routeRejectionConsoleCalls\.length !== 1/);
  assert.match(
    scanner,
    /routeRejectionConsoleCalls\[0\] !== "console\.warn\("/,
  );
  assert.doesNotMatch(
    auditLogger.replace(/console\.warn/i, ""),
    /\b(userAgent|clientRequestId|authorization|cookie|token|body|error)\b/i,
  );
  assert.doesNotMatch(auditLogger, /\.\.\.context/);
});

test("TASK-147 failures never echo raw request bodies or secrets", async () => {
  const harness = loadRoute(
    "src/app/api/pos/catalog/pull/route.ts",
    "@/server/pos-auth/catalog-pull",
    {},
  );
  const secretMarker = "TASK147_SECRET_BODY_MARKER";
  const response = await harness.route.POST(
    jsonRequest(
      "/api/pos/catalog/pull",
      JSON.stringify({ credential: secretMarker }),
      { "x-request-id": secretMarker },
    ),
  );
  const serialized = JSON.stringify(await response.json());

  assert.equal(response.status, 400);
  assert.equal(serialized.includes(secretMarker), false);
  assert.equal(
    harness.rejectionAudits().some((entry) => entry.includes(secretMarker)),
    false,
  );
});
