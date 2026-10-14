import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");
function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
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
      Buffer,
      Date,
      Headers,
      JSON,
      Request,
      Response,
      TextDecoder,
      Uint8Array,
      URL,
      console,
      exports: cjsModule.exports,
      fetch,
      module: cjsModule,
      process,
      require(specifier) {
        if (Object.hasOwn(mockedRequires, specifier)) return mockedRequires[specifier];
        return require(specifier);
      },
      ...globals,
    },
    { filename: relativePath },
  );
  return cjsModule.exports;
}


const shopId = "10000000-0000-4000-8000-000000000009";
const input = { afterId: "0", authorization: "Bearer fixture", deviceId: "90000000-0000-4000-8000-000000000009", eventMaxId: "5", limit: 50, scopeKey: "a".repeat(64), shopId };
function setup(data, sessionOk = true) {
  const calls = [];
  const gateway = loadTypeScriptModule("src/server/wechat/sync-gateway.ts", {
    "server-only": {},
    "@/server/auth/wechat-config": { resolveWeChatRuntimeConfig: () => ({}) },
    "@/server/auth/wechat-mini-session": {
      resolveWeChatMiniSession: async () => sessionOk ? { ok: true, actorProfileId: "fixture-actor", proof: { p_token_hash: "d".repeat(64), p_device_hash: "e".repeat(64), p_allowed_profiles: [input.deviceId], p_allowed_shops: [shopId] } } : { ok: false, code: "session_expired" },
      callTrustedWeChatRpc: async (...args) => { calls.push(args); return data; },
    },
  });
  return { calls, get: gateway.getWeChatMiniSyncDelta };
}
function page() {
  return { schemaVersion: "wechat-mini-sync-delta-v1", shopId, rows: [], nextAfterId: "5", hasMore: false };
}
test("WECHAT-009 caps producer at five safe events, retains scope and cursors", async () => {
  const data = { ...page(), rows: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), entity_ids: { product_ids: Array.from({ length: 250 }, (_, j) => `20000000-0000-4000-8000-${String(j).padStart(12, "0")}`) } })) };
  const { calls, get } = setup(data);
  const result = await get(input);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].p_params.p_limit, 5);
  assert.equal(calls[0][1].p_params.p_shop_id, shopId);
  assert.equal(calls[0][1].p_params.p_expected_event_max_id, "5");
  assert.equal(calls[0][1].p_params.p_expected_scope_key, input.scopeKey);
  assert.equal(calls[0][3], 131072);
  assert.equal(result.data, data);
});
test("WECHAT-009 checks full envelope at 128 KiB and rejects byte over and 256 KiB without truncation", async () => {
  for (const size of [131072, 131073, 262144]) {
    const data = { ...page(), padding: "" };
    const overhead = Buffer.byteLength(JSON.stringify({ delta: data, ok: true }));
    const budget = size - overhead;
    data.padding = "中".repeat(Math.floor(budget / 3)) + "a".repeat(budget % 3);
    assert.equal(Buffer.byteLength(JSON.stringify({ delta: data, ok: true })), size);
    const result = await setup(data).get(input);
    assert.equal(result.ok, size === 131072);
  }
});
test("WECHAT-009 missing session and cross-shop/oversized row count fail closed", async () => {
  const denied = setup(page(), false);
  assert.equal((await denied.get(input)).status, 401);
  assert.equal(denied.calls.length, 0);
  assert.equal((await setup({ ...page(), shopId: "other" }).get(input)).ok, false);
  assert.equal((await setup({ ...page(), rows: Array(6).fill({}) }).get(input)).ok, false);
  assert.equal((await setup(null).get(input)).ok, false);
});
