import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ACTOR = "00000000-0000-4000-8000-000000000010";
const SHOP = "10000000-0000-4000-8000-000000000010";
const OTHER = "10000000-0000-4000-8000-000000000011";
const DEVICE = "20000000-0000-4000-8000-000000000010";
const SESSION = "30000000-0000-4000-8000-000000000010";
const config = { hashSalt: "test-only-salt", miniAllowedProfileIds: [ACTOR], miniAllowedShopIds: [SHOP], miniCatalogMutationsEnabled: false };
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(file, mocks = {}, fetchImpl = async () => { throw new Error("unexpected fetch"); }) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports, process, URL, Buffer,
    Date, Response, AbortSignal, TextDecoder, Uint8Array,
    fetch: fetchImpl,
    require: (name) => name === "server-only" ? {} : Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  }, { filename: file });
  return mod.exports;
}

function sessions(overrides = {}) {
  const calls = [];
  const revoked = [];
  const subject = load("src/server/auth/wechat-mini-session.ts", {
    "@/lib/supabase/admin": {
      resolveSupabaseAdminConfig: () => ({ status: "configured", url: "https://project.supabase.co", serviceRoleKey: "server-only-test-key" }),
      createSupabaseAdminClient: () => ({ auth: { admin: { signOut: async (token) => { revoked.push(token); return { error: null }; } } } }),
    },
  }, async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({ ok: true, actor_profile_id: ACTOR, session_id: SESSION,
      account_fingerprint: "a".repeat(64), generation: 1,
      expires_at: new Date(Date.now() + 600_000).toISOString(), ...overrides });
  });
  return { ...subject, calls, revoked };
}

test("WECHAT-010 Mini activation requires complete bounded UUID allowlists, without blocking configured Web", () => {
  const subject = load("src/server/auth/wechat-config.ts", {
    "@/lib/supabase/admin": { resolveSupabaseAdminConfig: () => ({ status: "configured" }) },
    "@/lib/supabase/server": { resolveSupabaseServerConfig: () => ({ status: "configured", url: "https://project.supabase.co", publishableKey: "test-key" }) },
  });
  const env = { WECHAT_AUTH_WEB_ENABLED: "1", WECHAT_AUTH_MINI_PROGRAM_ENABLED: "1", WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL: "https://bridge.example.test/exchange", WECHAT_IDENTITY_BRIDGE_HOST_ALLOWLIST: "bridge.example.test", WECHAT_IDENTITY_BRIDGE_CLIENT_ID: "test", WECHAT_IDENTITY_BRIDGE_CLIENT_SECRET: "test", WECHAT_AUTH_TECHNICAL_HASH_SALT: "test", WECHAT_OIDC_PROVIDER: "custom:wechat" };
  for (const profileList of [undefined, "", "*", `${ACTOR},`, `${ACTOR},invalid`, Array(101).fill(ACTOR).join(",")]) {
    const resolved = subject.resolveWeChatRuntimeConfig({ ...env, WECHAT_MINI_PROGRAM_TESTER_PROFILE_ALLOWLIST: profileList, WECHAT_MINI_PROGRAM_SHOP_ALLOWLIST: SHOP });
    assert.equal(subject.isWeChatSurfaceReady("mini_program", resolved), false);
    assert.equal(subject.isWeChatSurfaceReady("web", resolved), true);
  }
  const good = subject.resolveWeChatRuntimeConfig({ ...env, WECHAT_MINI_PROGRAM_TESTER_PROFILE_ALLOWLIST: ACTOR, WECHAT_MINI_PROGRAM_SHOP_ALLOWLIST: SHOP });
  assert.equal(subject.isWeChatSurfaceReady("mini_program", good), true);
  assert.equal(JSON.stringify(subject.publicWeChatConfiguration(good)).includes(ACTOR), false);
  assert.equal(JSON.stringify(subject.publicWeChatConfiguration(good)).includes(SHOP), false);
  for (const value of ["1", "TRUE", " true ", "0", "false", "true"]) {
    assert.equal(subject.resolveWeChatRuntimeConfig({ ...env,
      WECHAT_MINI_PROGRAM_CATALOG_MUTATIONS_ENABLED: value,
    }).miniCatalogMutationsEnabled, value === "true");
  }
});

test("WECHAT-010 session admission denies unlisted shop before RPC and rechecks tester on every resolution", async () => {
  const subject = sessions();
  const input = { authorization: `Bearer ${"m".repeat(43)}`, deviceId: DEVICE, config };
  assert.equal((await subject.resolveWeChatMiniSession({ ...input, shopId: OTHER })).ok, false);
  assert.equal(subject.calls.length, 0);
  assert.equal((await subject.resolveWeChatMiniSession({ ...input, shopId: SHOP })).ok, true);
  assert.equal((await subject.resolveWeChatMiniSession({ ...input, config: { ...config, miniAllowedProfileIds: [OTHER] }, shopId: SHOP })).ok, false);
  assert.equal(subject.calls.length, 2);
  assert.equal((await subject.resolveWeChatMiniSession({ ...input, config: { ...config, miniAllowedShopIds: [] } })).ok, false);
  assert.equal(subject.calls.length, 2);
});

test("WECHAT-010 revoked, expired, invalid generation and excessive lifetime receipts fail closed", async () => {
  for (const row of [{ ok: false }, { expires_at: "invalid" },
    { expires_at: new Date(Date.now() - 1000).toISOString() },
    { expires_at: new Date(Date.now() + 3_600_000).toISOString() },
    { generation: 0 }, { generation: -1 }, { generation: 1.5 }]) {
    const subject = sessions(row);
    const result = await subject.resolveWeChatMiniSession({ authorization: `Bearer ${"m".repeat(43)}`, deviceId: DEVICE, config, shopId: SHOP });
    assert.equal(result.ok, false, JSON.stringify(row));
  }
});

test("WECHAT-010 rejected tester receives no opaque session and temporary Supabase session is revoked", async () => {
  const subject = sessions();
  assert.equal(await subject.issueWeChatMiniSession({ actorProfileId: OTHER, config,
    correlationId: SESSION, deviceId: DEVICE, supabaseAccessToken: "temporary-test-session" }), null);
  assert.equal(subject.calls.length, 0);
  assert.deepEqual(subject.revoked, ["temporary-test-session"]);
});

test("WECHAT-010 shops are the membership/allowlist intersection and mutation capabilities never exceed server grants", async () => {
  const capabilityKeys = ["can_write_products", "can_write_categories", "can_write_suppliers", "can_change_prices", "can_manage_images"];
  for (const mutations of [false, true]) {
    const member = { shop_id: SHOP, can_read_catalog: true, ...Object.fromEntries(capabilityKeys.map((key) => [key, true])), can_change_prices: false };
    const gateway = load("src/server/wechat/user-rpc.ts", {
      "@/server/auth/wechat-config": { resolveWeChatRuntimeConfig: () => ({ ...config, miniCatalogMutationsEnabled: mutations }) },
      "@/server/auth/wechat-mini-session": { resolveWeChatMiniSession: async () => ({ ok: true, actorProfileId: ACTOR }),
        callTrustedWeChatRpc: async () => [member, { ...member, shop_id: OTHER }] },
    });
    const result = await gateway.callWeChatUserRpc({ authorization: "test", deviceId: DEVICE, params: {}, rpc: "wechat_authorized_shops_v2" });
    assert.equal(result.ok, true);
    assert.deepEqual(plain(result.data).map((row) => row.shop_id), [SHOP]);
    for (const key of capabilityKeys) assert.equal(result.data[0][key], mutations && member[key]);
    assert.equal(result.data[0].can_read_catalog, true);
  }
});

test("WECHAT-010 read gateway passes explicit shop binding and cannot turn missing shop into an account request", async () => {
  const observed = [];
  const gateway = load("src/server/wechat/user-rpc.ts", {
    "@/server/auth/wechat-config": { resolveWeChatRuntimeConfig: () => config },
    "@/server/auth/wechat-mini-session": { resolveWeChatMiniSession: async (input) => { observed.push(input.shopId); return { code: "session_expired", ok: false }; },
      callTrustedWeChatRpc: async () => { throw new Error("business RPC must not run after denial"); } },
  });
  for (const params of [{ p_shop_id: SHOP }, {}]) {
    assert.equal((await gateway.callWeChatUserRpc({ authorization: "test", deviceId: DEVICE, params, rpc: "wechat_catalog_page_v1" })).ok, false);
  }
  assert.deepEqual(observed, [SHOP, null]);
});

test("WECHAT-010 public readiness distinguishes enabled flags from admitted surfaces", () => {
  const subject = load("src/server/auth/wechat-config.ts", {
    "@/lib/supabase/admin": { resolveSupabaseAdminConfig: () => ({ status: "configured" }) },
    "@/lib/supabase/server": { resolveSupabaseServerConfig: () => ({ status: "configured", url: "https://project.supabase.co", publishableKey: "test-key" }) },
  });
  const env = { WECHAT_AUTH_MINI_PROGRAM_ENABLED: "1", WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL: "https://bridge.example.test/exchange", WECHAT_IDENTITY_BRIDGE_HOST_ALLOWLIST: "bridge.example.test", WECHAT_IDENTITY_BRIDGE_CLIENT_ID: "test", WECHAT_IDENTITY_BRIDGE_CLIENT_SECRET: "test", WECHAT_AUTH_TECHNICAL_HASH_SALT: "test", WECHAT_OIDC_PROVIDER: "custom:wechat" };
  for (const list of [undefined, "", "*", `${ACTOR},invalid`]) {
    const config = subject.resolveWeChatRuntimeConfig({ ...env, WECHAT_MINI_PROGRAM_TESTER_PROFILE_ALLOWLIST: list, WECHAT_MINI_PROGRAM_SHOP_ALLOWLIST: SHOP });
    const status = subject.publicWeChatConfiguration(config);
    assert.equal(status.activation, "external_activation_required");
    assert.equal(status.readySurfaces.mini_program, false);
  }
  const web = subject.publicWeChatConfiguration(subject.resolveWeChatRuntimeConfig({ ...env, WECHAT_AUTH_WEB_ENABLED: "1" }));
  assert.equal(web.activation, "ready");
  assert.equal(web.readySurfaces.web, true);
  assert.equal(web.readySurfaces.mini_program, false);
  const mini = subject.publicWeChatConfiguration(subject.resolveWeChatRuntimeConfig({ ...env, WECHAT_MINI_PROGRAM_TESTER_PROFILE_ALLOWLIST: ACTOR, WECHAT_MINI_PROGRAM_SHOP_ALLOWLIST: SHOP }));
  assert.equal(mini.readySurfaces.mini_program, true);
  const off = subject.publicWeChatConfiguration(subject.resolveWeChatRuntimeConfig({}));
  assert.equal(off.activation, "disabled");
  assert.equal(Object.values(off.readySurfaces).some(Boolean), false);
});

test("WECHAT-010 uncertain receipt issue rolls back after disposing canonical session", async () => {
  for (const body of [null, false, {}, { ok: true, session_id: SESSION, account_fingerprint: "wrong", expires_at: "invalid" }]) {
    const events = [];
    const subject = load("src/server/auth/wechat-mini-session.ts", {
      "@/lib/supabase/admin": {
        resolveSupabaseAdminConfig: () => ({ status: "configured", url: "https://project.supabase.co", serviceRoleKey: "test-only-key" }),
        createSupabaseAdminClient: () => ({ auth: { admin: { signOut: async () => { events.push("signOut"); return { error: null }; } } } }),
      },
    }, async (url) => { events.push(new URL(url).pathname); return Response.json(body); });
    assert.equal(await subject.issueWeChatMiniSession({ actorProfileId: ACTOR, correlationId: SESSION, deviceId: DEVICE, supabaseAccessToken: "temporary-test-session", config }), null);
    assert.deepEqual(events, ["signOut", "/rest/v1/rpc/wechat_mini_session_issue_v1", "/rest/v1/rpc/wechat_mini_session_revoke_v1"]);
  }
});

test("WECHAT-010 failed canonical revocation cannot issue an opaque session", async () => {
  for (const throws of [false, true]) {
    const subject = load("src/server/auth/wechat-mini-session.ts", {
      "@/lib/supabase/admin": {
        resolveSupabaseAdminConfig: () => ({ status: "configured" }),
        createSupabaseAdminClient: () => ({ auth: { admin: { signOut: async () => { if (throws) throw new Error("test"); return { error: { message: "test" } }; } } } }),
      },
    });
    assert.equal(await subject.issueWeChatMiniSession({ actorProfileId: ACTOR, correlationId: SESSION, deviceId: DEVICE, supabaseAccessToken: "temporary-test-session", config }), null);
  }
});

test("WECHAT-010 logout reports only an actual SQL true as revoked", async () => {
  for (const body of [false, null, 0, {}, [], "true", true]) {
    const subject = load("src/server/auth/wechat-mini-session.ts", {
      "@/lib/supabase/admin": { resolveSupabaseAdminConfig: () => ({ status: "configured", url: "https://project.supabase.co", serviceRoleKey: "test-only-key" }) },
    }, async () => Response.json(body));
    assert.equal(await subject.revokeWeChatMiniSession({ authorization: `Bearer ${"m".repeat(43)}`, deviceId: DEVICE, config }), body === true);
  }
});
