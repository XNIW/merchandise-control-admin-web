import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(path, requires = {}) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", source)(exports, (name) => {
    assert.ok(Object.hasOwn(requires, name), `unexpected dependency ${name}`);
    return requires[name];
  });
  return exports;
}
const policy = load("src/lib/catalog-text-policy.ts");
const id = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const calls = [];
  const route = load("src/app/api/mini-program/v1/catalog/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/catalog-text-policy": policy,
    "@/server/auth/wechat-config": { isWeChatSurfaceReady: () => true, resolveWeChatRuntimeConfig: () => ({}) },
    "@/server/wechat/user-rpc": { callWeChatUserRpc: async (input) => {
      calls.push(input);
      return { ok: true, status: 200, data: [] };
    } },
  });
  const read = (text) => route.GET(new Request(`https://isolated.invalid/catalog?${new URLSearchParams({
    shop_id: id, cursor_id: id, sort: "name_asc", cursor_text: text,
  })}`, { headers: { authorization: "unchanged-auth", "x-wechat-device-id": id } }));
  return { calls, read };
}

test("catalog forwards exact returned cursors through the canonical 240 UTF-16 boundary", async () => {
  const { calls, read } = fixture();
  assert.equal(policy.CATALOG_TEXT_LIMITS.productName, 240);
  for (const text of ["", "a".repeat(201), "a".repeat(240), "中".repeat(240), "😀".repeat(120)]) {
    assert.equal((await read(text)).status, 200);
    assert.equal(calls.at(-1).params.p_cursor_text, text);
    assert.equal(calls.at(-1).params.p_cursor_id, id);
    assert.equal(calls.at(-1).params.p_shop_id, id);
    assert.equal(calls.at(-1).authorization, "unchanged-auth");
    assert.equal(calls.at(-1).deviceId, id);
  }
  assert.equal(calls.length, 5);
});

test("catalog rejects over-budget ASCII and astral cursors before any RPC", async () => {
  const { calls, read } = fixture();
  for (const text of ["a".repeat(241), "中".repeat(241), "😀".repeat(121)]) {
    const response = await read(text);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "validation_failed");
  }
  assert.equal(calls.length, 0);
});
