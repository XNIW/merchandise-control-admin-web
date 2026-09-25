import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions, Log, LogLevel } from "miniflare";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const id = "00000000-0000-4000-8000-000000000001";
const rpcBody = {
  ok: true, code: "success", shop_id: id, target_id: id,
  correlation_id: id, updated_at: "2026-09-25T12:00:00.000Z",
  replayed: false, payload: {},
};

function compiled(path, name) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `const ${name} = (() => { const exports = {}; ${output}; return exports; })();`;
}

// Actual production helpers run under the pinned Workers engine. Only identity,
// configuration and outbound HTTP are isolated; no staging or credentials used.
test("Workers executes Mini RPCs and rejects every redirect without forwarding credentials", async () => {
  let status = 200;
  const requests = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    log: new Log(LogLevel.NONE),
    modules: true,
    compatibilityDate: "2026-06-10",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    outboundService: async (request) => {
      requests.push({ url: request.url, method: request.method });
      return new Response(JSON.stringify(rpcBody), {
        status,
        headers: { "Content-Type": "application/json", Location: "https://redirect.invalid/never" },
      });
    },
    script: `
      import * as crypto from "node:crypto";
      const require = (name) => {
        if (name === "node:crypto") return crypto;
        if (name === "@/lib/supabase/admin") return {
          resolveSupabaseAdminConfig: () => ({ status: "configured", url: "https://rpc.invalid", serviceRoleKey: "isolated-test-key" }),
        };
        if (name === "@/server/auth/wechat-mini-session") return {
          resolveWeChatMiniSession: async () => ({ ok: true, proof: {} }),
        };
        if (name === "@/server/auth/wechat-config") return { resolveWeChatRuntimeConfig: () => ({}) };
        if (name === "server-only" || name === "@/lib/catalog-text-policy") return {};
        throw new Error("Unexpected isolated import");
      };
      ${compiled("src/server/auth/wechat-mini-session.ts", "session")}
      ${compiled("src/server/wechat/catalog-mutation-gateway.ts", "catalog")}
      export default { async fetch(request) {
        const result = new URL(request.url).pathname === "/challenge"
          ? await session.callTrustedWeChatRpc("wechat_mini_proof_create_v1", {})
          : await catalog.callWeChatCatalogMutation({
              authorization: null, deviceId: null, correlationId: "${id}", idempotencyKey: "${id}",
              mutation: { shopId: "${id}", targetId: "${id}", operation: "category_update", payload: {}, expectedUpdatedAt: null },
            });
        return Response.json(result);
      }};
    `,
  }));
  try {
    for (const route of ["challenge", "mutation"]) {
      for (status of [200, 301, 302, 303, 307, 308]) {
        const before = requests.length;
        const response = await mf.dispatchFetch(`https://worker.invalid/${route}`);
        const result = await response.json();
        assert.equal(requests.length, before + 1, `${route}/${status} must reach the RPC once`);
        assert.equal(requests.at(-1).method, "POST");
        assert.equal(new URL(requests.at(-1).url).hostname, "rpc.invalid");
        if (route === "challenge") assert.deepEqual(result, status === 200 ? rpcBody : null);
        else assert.equal(result.status, status === 200 ? 200 : 503);
      }
    }
    assert.equal(requests.some((request) => request.url.includes("redirect.invalid")), false);
  } finally {
    await mf.dispose();
  }
});
