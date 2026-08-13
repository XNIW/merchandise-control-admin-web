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
const ENTITY_ID = "30000000-0000-4000-8000-000000000003";
const CURSOR_ID = "40000000-0000-4000-8000-000000000003";
const ACCESS_TOKEN = `Bearer ${"a".repeat(32)}`;

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadTypeScriptModule(relativePath, mockedRequires = {}, globals = {}) {
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
      Date,
      Headers,
      Number,
      Request,
      Response,
      Set,
      TextDecoder,
      URL,
      exports: cjsModule.exports,
      fetch,
      module: cjsModule,
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

function loadRoute(relativePath, rpcResult) {
  const calls = [];
  const route = loadTypeScriptModule(relativePath, {
    "@/server/auth/wechat-config": {
      isWeChatSurfaceReady(surface) {
        return surface === "mini_program";
      },
      resolveWeChatRuntimeConfig() {
        return { activation: "ready" };
      },
    },
    "@/server/wechat/user-rpc": {
      async callWeChatUserRpc(input) {
        calls.push(plain(input));
        return typeof rpcResult === "function" ? rpcResult(input) : rpcResult;
      },
    },
    "next/server": {
      NextResponse: {
        json(body, init) {
          return Response.json(body, init);
        },
      },
    },
  });
  return { calls, route };
}

test("WECHAT-003 authorizes shops through the capability-bearing v2 projection", () => {
  const route = read("src/app/api/mini-program/v1/shops/route.ts");
  const gateway = read("src/server/wechat/user-rpc.ts");

  assert.match(route, /rpc: "wechat_authorized_shops_v2"/);
  assert.doesNotMatch(route, /wechat_authorized_shops_v1/);
  assert.match(gateway, /"wechat_authorized_shops_v2"/);
  assert.match(gateway, /"wechat_catalog_lifecycle_page_v2"/);
  assert.match(gateway, /"wechat_catalog_history_page_v1"/);
  assert.doesNotMatch(gateway, /"wechat_authorized_shops_v1"/);
});

test("WECHAT-003 lifecycle route bounds input and forwards the exact shop-scoped cursor", async () => {
  const path = "src/app/api/mini-program/v1/catalog/lifecycle/route.ts";
  const { calls, route } = loadRoute(path, {
    data: [{ entity_id: ENTITY_ID, state: "archived" }],
    ok: true,
    status: 200,
  });
  const invalidQueries = [
    "shop_id=not-a-uuid",
    `shop_id=${SHOP_ID}&limit=0`,
    `shop_id=${SHOP_ID}&limit=101`,
    `shop_id=${SHOP_ID}&limit=1e2`,
    `shop_id=${SHOP_ID}&entity_type=staff`,
    `shop_id=${SHOP_ID}&state=deleted`,
    `shop_id=${SHOP_ID}&before_id=${CURSOR_ID}`,
    `shop_id=${SHOP_ID}&before_updated_at=not-a-date&before_id=${CURSOR_ID}`,
    `shop_id=${SHOP_ID}&before_updated_at=2026-08-13T00%3A00%3A00Z&before_id=bad`,
  ];

  for (const query of invalidQueries) {
    const response = await route.GET(
      new Request(`https://admin.example.test/catalog/lifecycle?${query}`),
    );
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.deepEqual(await response.json(), {
      code: "validation_failed",
      ok: false,
    });
  }
  assert.equal(calls.length, 0);

  const response = await route.GET(
    new Request(
      `https://admin.example.test/catalog/lifecycle?shop_id=${SHOP_ID}` +
        `&entity_type=category&state=archived&limit=25` +
        `&before_updated_at=2026-08-13T00%3A00%3A00Z&before_id=${CURSOR_ID}`,
      { headers: { Authorization: ACCESS_TOKEN } },
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(calls, [
    {
      authorization: ACCESS_TOKEN,
      deviceId: null,
      params: {
        p_before_id: CURSOR_ID,
        p_before_updated_at: "2026-08-13T00:00:00Z",
        p_entity_type: "category",
        p_limit: 25,
        p_shop_id: SHOP_ID,
        p_state: "archived",
      },
      rpc: "wechat_catalog_lifecycle_page_v2",
    },
  ]);
  assert.deepEqual(await response.json(), {
    entities: [{ entity_id: ENTITY_ID, state: "archived" }],
    ok: true,
  });

  const source = read(path);
  assert.doesNotMatch(source, /service.?role|\.from\(|insert\(|update\(|delete\(/i);
});

test("WECHAT-003 catalog-history route bounds filters and preserves tenant/cursor binding", async () => {
  const path = "src/app/api/mini-program/v1/catalog/history/route.ts";
  const { calls, route } = loadRoute(path, {
    data: [{ history_id: CURSOR_ID, operation: "updated" }],
    ok: true,
    status: 200,
  });
  const invalidQueries = [
    "shop_id=not-a-uuid",
    `shop_id=${SHOP_ID}&limit=101`,
    `shop_id=${SHOP_ID}&entity_type=staff`,
    `shop_id=${SHOP_ID}&operation=hard_deleted`,
    `shop_id=${SHOP_ID}&entity_id=bad`,
    `shop_id=${SHOP_ID}&from_at=not-a-date`,
    `shop_id=${SHOP_ID}&from_at=2026-08-14T00%3A00%3A00Z&to_at=2026-08-13T00%3A00%3A00Z`,
    `shop_id=${SHOP_ID}&from_at=2024-01-01T00%3A00%3A00Z&to_at=2026-01-02T00%3A00%3A00Z`,
    `shop_id=${SHOP_ID}&before_created_at=2026-08-13T00%3A00%3A00Z`,
    `shop_id=${SHOP_ID}&before_created_at=2026-08-13T00%3A00%3A00Z&before_audit_log_id=bad`,
  ];

  for (const query of invalidQueries) {
    const response = await route.GET(
      new Request(`https://admin.example.test/catalog/history?${query}`),
    );
    assert.equal(response.status, 400, query);
    assert.deepEqual(await response.json(), {
      code: "validation_failed",
      ok: false,
    });
  }
  assert.equal(calls.length, 0);

  const response = await route.GET(
    new Request(
      `https://admin.example.test/catalog/history?shop_id=${SHOP_ID}` +
        `&limit=40&entity_type=product&operation=updated&entity_id=${ENTITY_ID}` +
        `&from_at=2026-08-01T00%3A00%3A00Z&to_at=2026-08-13T00%3A00%3A00Z` +
        `&before_created_at=2026-08-12T00%3A00%3A00Z&before_audit_log_id=${CURSOR_ID}`,
      { headers: { Authorization: ACCESS_TOKEN } },
    ),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      authorization: ACCESS_TOKEN,
      deviceId: null,
      params: {
        p_before_audit_log_id: CURSOR_ID,
        p_before_created_at: "2026-08-12T00:00:00Z",
        p_entity_id: ENTITY_ID,
        p_entity_type: "product",
        p_from_at: "2026-08-01T00:00:00Z",
        p_limit: 40,
        p_operation: "updated",
        p_shop_id: SHOP_ID,
        p_to_at: "2026-08-13T00:00:00Z",
      },
      rpc: "wechat_catalog_history_page_v1",
    },
  ]);
  assert.deepEqual(await response.json(), {
    events: [{ history_id: CURSOR_ID, operation: "updated" }],
    ok: true,
  });

  const source = read(path);
  assert.doesNotMatch(source, /service.?role|\.from\(|insert\(|update\(|delete\(/i);
});

test("WECHAT-003 safe read helper forwards only allowlisted bearer RPCs and sanitizes failures", async () => {
  const requests = [];
  const gateway = loadTypeScriptModule(
    "src/server/wechat/user-rpc.ts",
    {
      "@/server/auth/wechat-config": {
        resolveWeChatRuntimeConfig() {
          return { hashSalt: "test-salt" };
        },
      },
      "@/server/auth/wechat-mini-session": {
        async resolveWeChatMiniSession(input) {
          requests.push({ input, type: "session" });
          return {
            accountFingerprint: "f".repeat(64),
            actorProfileId: ENTITY_ID,
            expiresAt: 2_000_000_000,
            generation: 1,
            ok: true,
            sessionId: CURSOR_ID,
          };
        },
        async callTrustedWeChatRpc(rpc, params, timeout, limit) {
          requests.push({ limit, params, rpc, timeout, type: "rpc" });
          return [{ history_id: CURSOR_ID }];
        },
      },
      "server-only": {},
    },
  );

  const allowed = await gateway.callWeChatUserRpc({
    authorization: ACCESS_TOKEN,
    deviceId: "50000000-0000-4000-8000-000000000003",
    params: { p_shop_id: SHOP_ID },
    rpc: "wechat_catalog_history_page_v1",
  });
  assert.deepEqual(plain(allowed), {
    data: [{ history_id: CURSOR_ID }],
    ok: true,
    status: 200,
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].input.authorization, ACCESS_TOKEN);
  assert.equal(requests[0].input.deviceId, "50000000-0000-4000-8000-000000000003");
  assert.equal(requests[1].rpc, "wechat_mini_read_v1");
  assert.equal(requests[1].timeout, 5_000);
  assert.equal(requests[1].limit, 131_072);
  assert.deepEqual(plain(requests[1].params), {
    p_actor_profile_id: ENTITY_ID,
    p_params: { p_shop_id: SHOP_ID },
    p_rpc: "wechat_catalog_history_page_v1",
  });

  const legacy = await gateway.callWeChatUserRpc({
    authorization: ACCESS_TOKEN,
    params: {},
    rpc: "wechat_authorized_shops_v1",
  });
  assert.deepEqual(plain(legacy), {
    code: "backend_temporary",
    ok: false,
    status: 503,
  });
  assert.equal(requests.length, 2);

  const failingGateway = loadTypeScriptModule(
    "src/server/wechat/user-rpc.ts",
    {
      "@/server/auth/wechat-config": {
        resolveWeChatRuntimeConfig: () => ({ hashSalt: "test-salt" }),
      },
      "@/server/auth/wechat-mini-session": {
        async resolveWeChatMiniSession() {
          return {
            accountFingerprint: "f".repeat(64),
            actorProfileId: ENTITY_ID,
            expiresAt: 2_000_000_000,
            generation: 1,
            ok: true,
            sessionId: CURSOR_ID,
          };
        },
        async callTrustedWeChatRpc() {
          return null;
        },
      },
      "server-only": {},
    },
  );
  const sanitized = await failingGateway.callWeChatUserRpc({
    authorization: ACCESS_TOKEN,
    params: { p_shop_id: SHOP_ID },
    rpc: "wechat_catalog_lifecycle_page_v2",
  });
  assert.deepEqual(plain(sanitized), {
    code: "backend_temporary",
    ok: false,
    status: 503,
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /database detail/);
});

function loadTrustedRpcWithResponse(responseFactory) {
  return loadTypeScriptModule(
    "src/server/auth/wechat-mini-session.ts",
    {
      "@/lib/supabase/admin": {
        createSupabaseAdminClient() {
          return null;
        },
        resolveSupabaseAdminConfig() {
          return {
            serviceRoleKey: "service-role-test-key",
            status: "configured",
            url: "https://project.supabase.co",
          };
        },
      },
      "server-only": {},
    },
    {
      async fetch(_url, init) {
        assert.equal(init.redirect, "error");
        assert.ok(init.signal instanceof AbortSignal);
        return responseFactory();
      },
    },
  );
}

async function callHistoryRpc(gateway) {
  return gateway.callTrustedWeChatRpc(
    "wechat_mini_read_v1",
    { p_actor_profile_id: ENTITY_ID, p_params: { p_shop_id: SHOP_ID } },
    5_000,
    131_072,
  );
}

test("WECHAT-003 safe read helper rejects oversized declared response bodies", async () => {
  const gateway = loadTrustedRpcWithResponse(
    () =>
      new Response("[]", {
        headers: { "Content-Length": String(128 * 1_024 + 1) },
        status: 200,
      }),
  );

  assert.equal(await callHistoryRpc(gateway), null);
});

test("WECHAT-003 safe read helper stops oversized streamed response bodies", async () => {
  const gateway = loadTrustedRpcWithResponse(
    () => new Response(new Uint8Array(128 * 1_024 + 1), { status: 200 }),
  );

  assert.equal(await callHistoryRpc(gateway), null);
});

test("WECHAT-003 safe read helper rejects invalid JSON without leaking upstream content", async () => {
  const gateway = loadTrustedRpcWithResponse(
    () =>
      new Response('{"message":"sensitive upstream detail"', {
        status: 200,
      }),
  );

  const result = await callHistoryRpc(gateway);
  assert.equal(result, null);
  assert.doesNotMatch(JSON.stringify(result), /sensitive upstream detail/);
  const source = read("src/server/auth/wechat-mini-session.ts");
  assert.match(source, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(source, /redirect: "error"/);
  assert.doesNotMatch(source, /response\.json\(\)/);
});
