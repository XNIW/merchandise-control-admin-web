import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from "miniflare";
import { patchOpenNextRequestUrlSource, withOpenNextRequestUrlPatch } from "../../scripts/cloudflare-query-compat.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const handlerSource = readFileSync("node_modules/@opennextjs/aws/dist/core/requestHandler.js", "utf8");
const httpSource = readFileSync("node_modules/@opennextjs/aws/dist/http/util.js", "utf8");
const routingSource = readFileSync("node_modules/@opennextjs/aws/dist/core/routing/util.js", "utf8");
const converterSource = readFileSync("node_modules/@opennextjs/aws/dist/overrides/converters/utils.js", "utf8");

// Extract executable declarations from the installed adapter, not a rewritten
// model of its URL handling. The caller supplies only the downstream handler.
function declaration(source, name) {
  const ast = ts.createSourceFile("adapter.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const node = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `installed adapter declaration ${name}`);
  return node.getText(ast).replace(/^export /, "");
}
const queryDeclarations = [
  declaration(httpSource, "getQueryFromIterator"),
  declaration(converterSource, "getQueryFromSearchParams"),
  declaration(routingSource, "convertToQuery"),
  declaration(routingSource, "convertToQueryString"),
].join("\n");
const frameworkStubs = `
const INTERNAL_HEADER_INITIAL_URL = "x-open-next-initial-url";
const NextConfig = {};
function setNextjsPrebundledReact() {}
function error(_message, error) { throw error; }
function handleNoFallbackError() { throw new Error("unexpected fallback"); }
function tryRenderError() { throw new Error("unexpected adapter error"); }
`;
function adapter(source, downstream) {
  return new Function("requestHandler", `${queryDeclarations}\n${frameworkStubs}
    ${declaration(source, "processRequest")}
    return async (url, queryOverride) => {
      const query = queryOverride ?? getQueryFromSearchParams(new URL(url).searchParams);
      const req = { url, headers: { authorization: "unchanged-header" }, body: undefined };
      await processRequest(req, {}, { initialURL: url, locale: "es",
        internalEvent: { rawPath: new URL(url).pathname, query, headers: {} } });
      return req;
    };`)(downstream);
}
const values = [
  ["cursor_at", "2026-07-27T08:42:28.893668+00:00"],
  ["search", "A+B&C=100% 中文"], ["a&b=c+%", "#fragment?=+ %26"],
  ["repeat", "one+two"], ["repeat", "three&four"], ["empty", ""],
];

test("installed OpenNext reproduces decoded plus/ampersand query corruption", async () => {
  const run = adapter(handlerSource, () => async () => {});
  const req = await run(`https://worker.invalid/catalog?${new URLSearchParams(values)}`);
  const params = new URL(req.url, "https://worker.invalid").searchParams;
  assert.equal(params.get("cursor_at"), "2026-07-27T08:42:28.893668 00:00");
  assert.equal(params.get("search"), "A B");
  assert.equal(params.get("C"), "100% 中文");
});

test("query compatibility preserves exact decoded values, repeated keys and request metadata", async () => {
  let metadata;
  const run = adapter(patchOpenNextRequestUrlSource(handlerSource), (value) => {
    metadata = value;
    return async () => {};
  });
  const req = await run(`https://worker.invalid/catalog?${new URLSearchParams(values)}`);
  assert.deepEqual([...new URL(req.url, "https://worker.invalid").searchParams], values);
  assert.equal(metadata.invokeQuery.cursor_at, values[0][1]);
  assert.equal(metadata.initQuery.search, values[1][1]);
  assert.deepEqual(metadata.invokeQuery.repeat, ["one+two", "three&four"]);
  assert.equal(metadata.locale, "es");
  assert.equal(metadata.invokePath, "/catalog");
  assert.equal(metadata.middlewareInvoke, false);
  assert.equal(req.headers.authorization, "unchanged-header");
  const query = { search: "rewritten+A&B", repeat: ["1+2", "3&4"] };
  const snapshot = structuredClone(query);
  const rewritten = await run("https://worker.invalid/catalog?search=old", query);
  assert.deepEqual(query, snapshot);
  assert.equal(new URL(rewritten.url, "https://worker.invalid").searchParams.get("search"), query.search);
  assert.equal((await run("https://worker.invalid/catalog")).url, "/catalog");
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "opennext-query-"));
  const aws = join(root, "node_modules", "@opennextjs", "aws");
  const cloudflare = join(root, "node_modules", "@opennextjs", "cloudflare");
  mkdirSync(join(aws, "dist", "core"), { recursive: true });
  mkdirSync(cloudflare, { recursive: true });
  writeFileSync(join(aws, "package.json"), '{"version":"4.1.0"}');
  writeFileSync(join(cloudflare, "package.json"), '{"version":"1.20.2"}');
  const path = join(aws, "dist", "core", "requestHandler.js");
  writeFileSync(path, handlerSource);
  return { root, aws, cloudflare, path, backup: `${path}.merchandise-control-query-backup` };
}

test("build compatibility restores original bytes on success and child failure", () => {
  const f = fixture();
  try {
    assert.equal(withOpenNextRequestUrlPatch(f.root, () => {
      assert.equal(readFileSync(f.path, "utf8"), patchOpenNextRequestUrlSource(handlerSource));
      assert.equal(readFileSync(f.backup, "utf8"), handlerSource);
      return 19;
    }), 19);
    assert.equal(readFileSync(f.path, "utf8"), handlerSource);
    assert.equal(existsSync(f.backup), false);
    assert.throws(() => withOpenNextRequestUrlPatch(f.root, () => { throw new Error("child failed"); }), /child failed/);
    assert.equal(readFileSync(f.path, "utf8"), handlerSource);
    assert.equal(existsSync(f.backup), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("build rejects version/source drift, previous patch and interrupted/concurrent build", () => {
  const f = fixture();
  const never = () => assert.fail("build must not start");
  try {
    writeFileSync(join(f.aws, "package.json"), '{"version":"4.1.6"}');
    assert.throws(() => withOpenNextRequestUrlPatch(f.root, never), /version drift/);
    writeFileSync(join(f.aws, "package.json"), '{"version":"4.1.0"}');
    writeFileSync(f.path, handlerSource + "\n");
    assert.throws(() => withOpenNextRequestUrlPatch(f.root, never), /source drift/);
    assert.equal(readFileSync(f.path, "utf8"), handlerSource + "\n");
    assert.throws(() => patchOpenNextRequestUrlSource(patchOpenNextRequestUrlSource(handlerSource)), /source drift/);
    writeFileSync(f.path, handlerSource);
    withOpenNextRequestUrlPatch(f.root, () => {
      assert.throws(() => withOpenNextRequestUrlPatch(f.root, never), /backup already exists/);
    });
    writeFileSync(f.backup, "prior interrupted build");
    assert.throws(() => withOpenNextRequestUrlPatch(f.root, never), /backup already exists/);
    assert.equal(readFileSync(f.backup, "utf8"), "prior interrupted build");
    assert.equal(readFileSync(f.path, "utf8"), handlerSource);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function compiled(path, name) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `const ${name} = (() => { const exports = {}; ${code}; return exports; })();`;
}

test("Workers runs the actual unauthenticated catalog route: offset/Z 401, invalid input 400, no outbound", async () => {
  let outbound = 0;
  const id = "00000000-0000-4000-8000-000000000001";
  // Actual adapter processRequest, route, user-RPC and session code. Only the
  // local readiness configuration/framework response constructor are isolated.
  const script = `
    import * as crypto from "node:crypto";
    const config = { resolveWeChatRuntimeConfig: () => ({}), isWeChatSurfaceReady: () => true };
    const require = (name) => {
      if (name === "node:crypto") return crypto;
      if (name === "next/server") return { NextResponse: Response };
      if (name === "@/lib/catalog-text-policy") return policy;
      if (name === "@/server/auth/wechat-config") return config;
      if (name === "@/server/auth/wechat-mini-session") return session;
      if (name === "@/server/wechat/user-rpc") return rpc;
      if (name === "server-only" || name === "@/lib/supabase/admin") return {};
      throw new Error("Unexpected isolated import");
    };
    ${compiled("src/lib/catalog-text-policy.ts", "policy")}
    ${compiled("src/server/auth/wechat-mini-session.ts", "session")}
    ${compiled("src/server/wechat/user-rpc.ts", "rpc")}
    ${compiled("src/app/api/mini-program/v1/catalog/route.ts", "route")}
    ${queryDeclarations}
    ${frameworkStubs}
    ${declaration(patchOpenNextRequestUrlSource(handlerSource), "processRequest")}
    const requestHandler = () => async (req, res) => {
      res.response = await route.GET(new Request(new URL(req.url, "https://worker.invalid")));
    };
    export default { async fetch(request) {
      const req = { url: request.url }; const res = {};
      await processRequest(req, res, { initialURL: request.url,
        internalEvent: { rawPath: new URL(request.url).pathname, headers: {},
          query: getQueryFromSearchParams(new URL(request.url).searchParams) } });
      return res.response;
    }};
  `;
  const mf = new Miniflare(convertV4MiniflareOptions({
    log: new Log(LogLevel.NONE), modules: true, script,
    compatibilityDate: "2026-06-10", compatibilityFlags: ["nodejs_compat"],
    outboundService: () => { outbound++; throw new Error("unauthenticated route must not use the network"); },
  }));
  try {
    for (const timestamp of ["2026-07-27T08:42:28.893668+00:00", "2026-07-27T08:42:28.893668Z"]) {
      const params = new URLSearchParams({ shop_id: id, cursor_id: id, cursor_at: timestamp, search: values[1][1] });
      for (const extra of [false, true]) {
        if (extra) params.set("unknown_parameter", "A+B&C");
        const response = await mf.dispatchFetch(`https://worker.invalid/api/mini-program/v1/catalog?${params}`);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).code, "session_expired");
      }
    }
    for (const invalid of [{ limit: "101" }, { cursor_id: id, cursor_at: "2026-07-27T08:42:28.893668 00:00" }]) {
      const params = new URLSearchParams({ shop_id: id, ...invalid });
      const response = await mf.dispatchFetch(`https://worker.invalid/api/mini-program/v1/catalog?${params}`);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, "validation_failed");
    }
    assert.equal(outbound, 0);
  } finally { await mf.dispose(); }
});
