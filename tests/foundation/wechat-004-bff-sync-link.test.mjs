import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");
const ACTOR_ID = "00000000-0000-4000-8000-000000000404";
const SHOP_ID = "10000000-0000-4000-8000-000000000404";
const DEVICE_ID = "90000000-0000-4000-8000-000000000404";
const CORRELATION_ID = "40000000-0000-4000-8000-000000000404";
const SESSION_ID = "50000000-0000-4000-8000-000000000404";
const HASH_SALT = "wechat-004-test-salt";
const SERVICE_KEY = "service-role-test-key";

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

function digest(namespace, value) {
  return createHash("sha256")
    .update(`${HASH_SALT}:${namespace}:${value}`)
    .digest("hex");
}

test("WECHAT-004 Mini exchange replaces the temporary Supabase session with a hashed opaque receipt", async () => {
  const fetchCalls = [];
  const signOutCalls = [];
  const sessionModule = loadTypeScriptModule(
    "src/server/auth/wechat-mini-session.ts",
    {
      "@/lib/supabase/admin": {
        createSupabaseAdminClient() {
          return {
            auth: {
              admin: {
                async signOut(token, scope) {
                  signOutCalls.push({ scope, token });
                  return { error: null };
                },
              },
            },
          };
        },
        resolveSupabaseAdminConfig() {
          return {
            serviceRoleKey: SERVICE_KEY,
            status: "configured",
            url: "https://project.supabase.co",
          };
        },
      },
      "server-only": {},
    },
    {
      async fetch(url, init) {
        fetchCalls.push({ body: JSON.parse(init.body), headers: init.headers, url: String(url) });
        return Response.json({
          account_fingerprint: digest("account", ACTOR_ID),
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          generation: 1,
          ok: true,
          session_id: SESSION_ID,
        });
      },
    },
  );

  const session = await sessionModule.issueWeChatMiniSession({
    actorProfileId: ACTOR_ID,
    config: { hashSalt: HASH_SALT },
    correlationId: CORRELATION_ID,
    deviceId: DEVICE_ID,
    supabaseAccessToken: "temporary-supabase-access-token",
  });

  assert.ok(session);
  assert.match(session.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(session.accountFingerprint, digest("account", ACTOR_ID));
  assert.equal("accessToken" in session, false);
  assert.equal("refreshToken" in session, false);
  assert.equal("id" in session.user, false);
  assert.deepEqual(signOutCalls, [
    { scope: "local", token: "temporary-supabase-access-token" },
  ]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://project.supabase.co/rest/v1/rpc/wechat_mini_session_issue_v1",
  );
  assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(fetchCalls[0].body.p_token_hash, digest("session", session.sessionToken));
  assert.equal(fetchCalls[0].body.p_device_hash, digest("device", DEVICE_ID));
  const wire = JSON.stringify(fetchCalls[0].body);
  assert.equal(wire.includes(session.sessionToken), false);
  assert.equal(wire.includes("temporary-supabase-access-token"), false);
});

test("WECHAT-004 opaque session resolution is device-bound and never forwards it as a Supabase bearer", async () => {
  const fetchCalls = [];
  const token = "o".repeat(43);
  const sessionModule = loadTypeScriptModule(
    "src/server/auth/wechat-mini-session.ts",
    {
      "@/lib/supabase/admin": {
        createSupabaseAdminClient: () => null,
        resolveSupabaseAdminConfig: () => ({
          serviceRoleKey: SERVICE_KEY,
          status: "configured",
          url: "https://project.supabase.co",
        }),
      },
      "server-only": {},
    },
    {
      async fetch(url, init) {
        fetchCalls.push({ body: JSON.parse(init.body), headers: init.headers, url: String(url) });
        return Response.json({
          account_fingerprint: "a".repeat(64),
          actor_profile_id: ACTOR_ID,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          generation: 2,
          ok: true,
          session_id: SESSION_ID,
        });
      },
    },
  );
  const resolved = await sessionModule.resolveWeChatMiniSession({
    authorization: `Bearer ${token}`,
    config: { hashSalt: HASH_SALT },
    deviceId: DEVICE_ID,
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.actorProfileId, ACTOR_ID);
  assert.equal(fetchCalls[0].body.p_token_hash, digest("session", token));
  assert.equal(fetchCalls[0].body.p_device_hash, digest("device", DEVICE_ID));
  assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.notEqual(fetchCalls[0].headers.Authorization, `Bearer ${token}`);
});

test("WECHAT-004 sync gateway binds opaque actor, device, shop, snapshot and response budget", async () => {
  const calls = [];
  const gateway = loadTypeScriptModule(
    "src/server/wechat/sync-gateway.ts",
    {
      "@/server/auth/wechat-config": {
        resolveWeChatRuntimeConfig: () => ({ hashSalt: HASH_SALT }),
      },
      "@/server/auth/wechat-mini-session": {
        async resolveWeChatMiniSession(input) {
          calls.push({ input, kind: "session" });
          return {
            accountFingerprint: "a".repeat(64),
            actorProfileId: ACTOR_ID,
            expiresAt: 2_000_000_000,
            generation: 1,
            ok: true,
            sessionId: SESSION_ID,
          };
        },
        async callTrustedWeChatRpc(rpc, params, timeout, responseLimit) {
          calls.push({ kind: "rpc", params, responseLimit, rpc, timeout });
          return rpc.endsWith("checkpoint_v1")
            ? {
                eventMaxId: "7",
                requiresReconcile: false,
                schemaVersion: "wechat-mini-sync-checkpoint-v1",
                scopeKey: "b".repeat(64),
                shopId: SHOP_ID,
              }
            : {
                asOfEventMaxId: "7",
                hasMore: false,
                nextAfterId: null,
                rows: [],
                schemaVersion: "wechat-mini-sync-delta-v1",
                shopId: SHOP_ID,
              };
        },
      },
      "server-only": {},
    },
  );
  const checkpoint = await gateway.getWeChatMiniSyncCheckpoint({
    afterId: "6",
    authorization: `Bearer ${"p".repeat(43)}`,
    deviceId: DEVICE_ID,
    expectedScopeKey: "b".repeat(64),
    lastReconciledAt: "2026-08-13T12:00:00Z",
    shopId: SHOP_ID,
  });
  const delta = await gateway.getWeChatMiniSyncDelta({
    afterId: "6",
    authorization: `Bearer ${"p".repeat(43)}`,
    deviceId: DEVICE_ID,
    eventMaxId: "7",
    limit: 50,
    scopeKey: "b".repeat(64),
    shopId: SHOP_ID,
  });
  assert.equal(checkpoint.ok, true);
  assert.equal(delta.ok, true);
  assert.equal(calls[1].rpc, "wechat_mini_sync_checkpoint_v1");
  assert.equal(calls[1].params.p_actor_profile_id, ACTOR_ID);
  assert.equal(calls[1].params.p_device_identifier, DEVICE_ID);
  assert.equal(calls[3].rpc, "wechat_mini_sync_delta_v1");
  assert.equal(calls[3].params.p_expected_event_max_id, "7");
  assert.equal(calls[3].timeout, 6_000);
  assert.equal(calls[3].responseLimit, 262_144);
});

test("WECHAT-004 link saga sends only hashes and stable identifiers to the trusted ledger", async () => {
  const calls = [];
  const saga = loadTypeScriptModule(
    "src/server/auth/wechat-link-saga.ts",
    {
      "./wechat-mini-session": {
        async callTrustedWeChatRpc(rpc, params) {
          calls.push({ params, rpc });
          if (rpc === "wechat_link_attempt_begin_v1") {
            return {
              attempt_id: "60000000-0000-4000-8000-000000000404",
              ok: true,
            };
          }
          if (rpc === "wechat_link_attempt_finalize_v1") {
            return { ok: true, status: "audit_finalized" };
          }
          return { completed: 1, expired: 0, ok: true };
        },
      },
      "server-only": {},
    },
  );
  const nonce = "n".repeat(43);
  const attempt = await saga.beginWeChatLinkAttempt({
    actorProfileId: ACTOR_ID,
    config: { hashSalt: HASH_SALT, oidcProvider: "custom:wechat" },
    correlationId: CORRELATION_ID,
    nonce,
    surface: "android",
  });
  assert.ok(attempt);
  assert.equal(calls[0].params.p_nonce_hash,
    createHash("sha256").update(`${HASH_SALT}:link:${nonce}`).digest("hex"));
  assert.equal(JSON.stringify(calls[0].params).includes(nonce), false);
  assert.equal("code" in calls[0].params, false);
  assert.equal("token" in calls[0].params, false);
  assert.equal(
    await saga.finalizeWeChatLinkAttempt({
      actorProfileId: ACTOR_ID,
      attemptId: attempt.attemptId,
      config: { hashSalt: HASH_SALT },
      nonce,
    }),
    true,
  );
  assert.equal(await saga.reconcileWeChatLinkAttempts(ACTOR_ID), true);
});

test("WECHAT-004 source closes Mini legacy bypass and leaves activation default OFF", () => {
  const contract = read("src/lib/auth/wechat-contract.ts");
  const exchange = read("src/server/auth/wechat-exchange.ts");
  const readGateway = read("src/server/wechat/user-rpc.ts");
  const mutationGateway = read("src/server/wechat/catalog-mutation-gateway.ts");
  const migration = read(
    "supabase/migrations/20260813160232_wechat_004_mini_bff_session_sync.sql",
  ).replace(/\s+/g, " ");
  const env = read(".env.example");

  assert.match(contract, /type WeChatMiniSessionResult/);
  assert.doesNotMatch(
    contract.match(/type WeChatMiniSessionResult[\s\S]+?\n};/)?.[0] ?? "",
    /accessToken|refreshToken|user:\s*\{\s*id/,
  );
  assert.match(exchange, /issueWeChatMiniSession\(/);
  assert.match(readGateway, /wechat_mini_read_v1/);
  assert.doesNotMatch(readGateway, /apikey:\s*config\.publishableKey|Authorization:\s*input\.authorization/);
  assert.match(mutationGateway, /resolveWeChatMiniSession/);
  assert.match(
    migration,
    /revoke all on function public\.wechat_mini_read_v1\(uuid, text, jsonb\) from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.wechat_mini_read_v1\(uuid, text, jsonb\) to service_role;/,
  );
  assert.match(env, /^WECHAT_AUTH_MINI_PROGRAM_ENABLED=$/m);
  assert.match(env, /^WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED=$/m);
});

test("WECHAT-004 sync routes are GET-only, no-store, gated, and contain no mutation surface", () => {
  for (const path of ["checkpoint", "delta"]) {
    const source = read(`src/app/api/mini-program/v1/sync/${path}/route.ts`);
    assert.match(source, /export async function GET/);
    assert.match(source, /isWeChatSurfaceReady\("mini_program"/);
    assert.match(source, /"Cache-Control": "no-store, max-age=0"/);
    assert.match(source, /x-wechat-device-id/);
    assert.doesNotMatch(source, /export async function POST|\.from\(|insert\(|update\(|delete\(/);
  }
});
