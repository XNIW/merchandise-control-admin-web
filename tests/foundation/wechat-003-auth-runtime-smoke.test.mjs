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

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadTypeScriptModule(relativePath, options = {}) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  }).outputText;
  const cjsModule = { exports: {} };
  const mockedRequires = {
    "./wechat-link-saga": {
      async beginWeChatLinkAttempt(input) {
        return {
          attemptId: "90000000-0000-4000-8000-000000000001",
          correlationId: input.correlationId,
          nonce: input.nonce,
        };
      },
      async failWeChatLinkAttempt() {
        return true;
      },
      async finalizeWeChatLinkAttempt() {
        return true;
      },
      async reconcileWeChatLinkAttempts() {
        return true;
      },
    },
    "./wechat-mini-session": {
      async issueWeChatMiniSession() {
        return {
          accountFingerprint: "f".repeat(64),
          expiresAt: 2_000_000_000,
          expiresIn: 900,
          sessionToken: "m".repeat(43),
          tokenType: "bearer",
          user: { provider: "custom:wechat" },
        };
      },
      async revokeWeChatMiniSession() {
        return true;
      },
    },
    ...(options.requires ?? {}),
  };
  const context = {
    AbortSignal,
    Buffer,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    clearTimeout,
    console,
    exports: cjsModule.exports,
    fetch: globalThis.fetch,
    module: cjsModule,
    process,
    require(specifier) {
      if (Object.hasOwn(mockedRequires, specifier)) {
        return mockedRequires[specifier];
      }
      return require(specifier);
    },
    setTimeout,
    ...options.globals,
  };

  vm.runInNewContext(output, context, { filename: relativePath });
  return cjsModule.exports;
}

function supabaseServerConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey
    ? { publishableKey, status: "configured", url }
    : { missing: [], reason: "not configured", status: "not_configured" };
}

function supabaseAdminConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceRoleKey
    ? { serviceRoleKey, status: "configured", url }
    : { missing: [], reason: "not configured", status: "not_configured" };
}

function loadWeChatConfig() {
  return loadTypeScriptModule("src/server/auth/wechat-config.ts", {
    requires: {
      "@/lib/supabase/admin": {
        resolveSupabaseAdminConfig: supabaseAdminConfig,
      },
      "@/lib/supabase/server": {
        resolveSupabaseServerConfig: supabaseServerConfig,
      },
      "server-only": {},
    },
  });
}

function completeWeChatEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    WECHAT_AUTH_LINKING_ENABLED: "true",
    WECHAT_AUTH_TECHNICAL_HASH_SALT: "technical-test-salt",
    WECHAT_AUTH_WEB_ENABLED: "true",
    WECHAT_IDENTITY_BRIDGE_CLIENT_ID: "bridge-client",
    WECHAT_IDENTITY_BRIDGE_CLIENT_SECRET: "bridge-secret",
    WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL:
      "https://bridge.example.test/v1/wechat/exchange",
    WECHAT_IDENTITY_BRIDGE_HOST_ALLOWLIST: "bridge.example.test",
    WECHAT_OIDC_PROVIDER: "custom:wechat",
  };
}

function runtimeConfig(overrides = {}) {
  const config = loadWeChatConfig().resolveWeChatRuntimeConfig({
    ...completeWeChatEnv(),
    ...overrides,
  });
  assert.equal(config.activation, "ready");
  return config;
}

function nextResponseStub() {
  return {
    json(body, init = {}) {
      return {
        body,
        headers: new Headers(init.headers),
        kind: "json",
        status: init.status ?? 200,
      };
    },
    redirect(location) {
      return {
        headers: new Headers(),
        kind: "redirect",
        location: String(location),
        status: 307,
      };
    },
  };
}

function oauthRedirectStubs() {
  return {
    buildOAuthCallbackUrl(origin, nextPath) {
      const url = new URL("/auth/callback", origin);
      url.searchParams.set("next", nextPath);
      return url.toString();
    },
    hasMisconfiguredOAuthRedirectUrl() {
      return false;
    },
    hasUnsafeInternalNextPath(value) {
      return typeof value === "string" && value.startsWith("//");
    },
    loginErrorUrl(origin, nextPath, error) {
      const url = new URL("/auth/login", origin);
      url.searchParams.set("next", nextPath);
      url.searchParams.set("error", error);
      return url;
    },
    loginResultUrl(nextPath, result) {
      const params = new URLSearchParams({ next: nextPath, result });
      return `/auth/login?${params.toString()}`;
    },
    requestOriginFromRequest() {
      return "";
    },
    safeInternalNextPath(value, fallback = "/shop") {
      return typeof value === "string" && value.startsWith("/")
        ? value
        : fallback;
    },
  };
}

test("WECHAT-003 canonical runtime readiness is default-off and rejects the former partial login-page env subset", () => {
  const configModule = loadWeChatConfig();
  const disabled = configModule.resolveWeChatRuntimeConfig({});

  assert.equal(disabled.activation, "disabled");
  assert.equal(disabled.enabledSurfaces.web, false);
  assert.equal(configModule.isWeChatSurfaceReady("web", disabled), false);

  const formerPartialSubset = configModule.resolveWeChatRuntimeConfig({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    WECHAT_AUTH_WEB_ENABLED: "true",
    WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL:
      "https://bridge.example.test/v1/wechat/exchange",
    WECHAT_OIDC_PROVIDER: "custom:wechat",
  });

  assert.equal(formerPartialSubset.activation, "external_activation_required");
  assert.equal(
    configModule.isWeChatSurfaceReady("web", formerPartialSubset),
    false,
  );

  const ready = configModule.resolveWeChatRuntimeConfig(completeWeChatEnv());
  assert.equal(ready.activation, "ready");
  assert.equal(configModule.isWeChatSurfaceReady("web", ready), true);
});

test("WECHAT-003 personal login consumes canonical readiness while shop-code login has no WeChat surface", () => {
  const page = read("src/app/auth/login/page.tsx");
  const shopCodeForm = read("src/components/auth/ShopCodeLoginForm.tsx");
  const shopCodeBranch = page.match(
    /\{rendersAccountForm \? \([\s\S]+?\) : \(([\s\S]+?)\)\}/,
  )?.[1];

  assert.match(page, /resolveWeChatRuntimeConfig\(\)/);
  assert.match(page, /isWeChatSurfaceReady\(\s*"web",/);
  assert.doesNotMatch(page, /process\.env\.WECHAT_AUTH_WEB_ENABLED/);
  assert.ok(shopCodeBranch);
  assert.match(shopCodeBranch, /<ShopCodeLoginForm/);
  assert.doesNotMatch(shopCodeBranch, /AuthForm|isWeChatConfigured|WeChat/i);
  assert.doesNotMatch(shopCodeForm, /wechat/i);
});

test("WECHAT-003 native challenge issuance hashes technical identifiers and never needs bridge credentials", async () => {
  const rpcCalls = [];
  const admin = {
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return { data: null, error: null };
    },
  };
  const exchangeModule = loadTypeScriptModule(
    "src/server/auth/wechat-exchange.ts",
    {
      requires: {
        "@/lib/supabase/admin": {
          createSupabaseAdminClient: () => admin,
        },
        "server-only": {},
      },
    },
  );
  const config = { hashSalt: "technical-test-salt" };
  const deviceId = "11111111-1111-4111-8111-111111111111";
  const ipAddress = "203.0.113.10";
  const outcome = await exchangeModule.issueWeChatChallenge({
    config,
    deviceId,
    ipAddress,
    mode: "login",
    surface: "mini_program",
  });

  assert.equal(outcome.ok, true);
  assert.match(outcome.challenge.correlationId, /^[0-9a-f-]{36}$/i);
  assert.match(outcome.challenge.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(outcome.challenge.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(outcome.challenge.expiresInSeconds, 300);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "wechat_auth_challenge_issue_v1");
  assert.equal(rpcCalls[0].params.p_ttl_seconds, 300);
  assert.equal(rpcCalls[0].params.p_device_hash.includes(deviceId), false);
  assert.equal(rpcCalls[0].params.p_ip_hash.includes(ipAddress), false);
  assert.equal(
    rpcCalls[0].params.p_device_hash,
    createHash("sha256")
      .update(`${config.hashSalt}:${deviceId}`)
      .digest("hex"),
  );
});

test("WECHAT-003 native exchange consumes one-time state and performs the bridge plus Supabase ID-token grant", async () => {
  const rpcCalls = [];
  const fetchCalls = [];
  const admin = {
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return name === "wechat_auth_challenge_consume_v1"
        ? { data: true, error: null }
        : { data: null, error: null };
    },
  };
  const exchangeModule = loadTypeScriptModule(
    "src/server/auth/wechat-exchange.ts",
    {
      globals: {
        async fetch(url, init) {
          fetchCalls.push({ init, url: String(url) });
          return fetchCalls.length === 1
            ? new Response(JSON.stringify({ id_token: "i".repeat(64) }), {
                headers: { "Content-Type": "application/json" },
                status: 200,
              })
            : new Response(
                JSON.stringify({
                  access_token: "a".repeat(64),
                  expires_at: 2_000_000_000,
                  expires_in: 3_600,
                  refresh_token: "r".repeat(64),
                  token_type: "bearer",
                  user: { id: "00000000-0000-4000-8000-000000000001" },
                }),
                {
                  headers: { "Content-Type": "application/json" },
                  status: 200,
                },
              );
        },
      },
      requires: {
        "@/lib/supabase/admin": {
          createSupabaseAdminClient: () => admin,
        },
        "server-only": {},
      },
    },
  );
  const config = runtimeConfig();
  const outcome = await exchangeModule.exchangeWeChatCode(
    {
      authorization: null,
      code: "wechat-code",
      correlationId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      ipAddress: "203.0.113.10",
      mode: "login",
      nonce: "n".repeat(43),
      state: "s".repeat(43),
      surface: "mini_program",
    },
    config,
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.session.user.provider, "custom:wechat");
  assert.equal(outcome.session.sessionToken, "m".repeat(43));
  assert.equal(outcome.session.accountFingerprint, "f".repeat(64));
  assert.equal("accessToken" in outcome.session, false);
  assert.equal("refreshToken" in outcome.session, false);
  assert.equal("id" in outcome.session.user, false);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, config.bridgeExchangeUrl.toString());
  assert.equal(fetchCalls[0].init.redirect, "error");
  assert.equal(
    fetchCalls[0].init.headers.Authorization,
    `Basic ${Buffer.from("bridge-client:bridge-secret").toString("base64")}`,
  );
  assert.equal(
    fetchCalls[1].url,
    "https://project.supabase.co/auth/v1/token?grant_type=id_token",
  );
  const tokenBody = JSON.parse(fetchCalls[1].init.body);
  assert.equal(tokenBody.provider, "custom:wechat");
  assert.equal(tokenBody.link_identity, false);
  assert.equal(
    rpcCalls.filter(
      ({ name }) => name === "wechat_auth_challenge_consume_v1",
    ).length,
    1,
  );
  assert.equal(
    rpcCalls.some(
      ({ name, params }) =>
        name === "wechat_auth_audit_v1" &&
        params.p_event_key === "auth.wechat.exchange_succeeded",
    ),
    true,
  );
});

test("WECHAT-003 replay is rejected before any outbound exchange", async () => {
  const rpcCalls = [];
  let outboundCalls = 0;
  const exchangeModule = loadTypeScriptModule(
    "src/server/auth/wechat-exchange.ts",
    {
      globals: {
        async fetch() {
          outboundCalls += 1;
          throw new Error("outbound exchange must not run for replay");
        },
      },
      requires: {
        "@/lib/supabase/admin": {
          createSupabaseAdminClient: () => ({
            async rpc(name, params) {
              rpcCalls.push({ name, params });
              return name === "wechat_auth_challenge_consume_v1"
                ? { data: false, error: null }
                : { data: null, error: null };
            },
          }),
        },
        "server-only": {},
      },
    },
  );
  const outcome = await exchangeModule.exchangeWeChatCode(
    {
      authorization: null,
      code: "replayed-code",
      correlationId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      ipAddress: "203.0.113.10",
      mode: "login",
      nonce: "n".repeat(43),
      state: "s".repeat(43),
      surface: "mini_program",
    },
    runtimeConfig(),
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "state_invalid");
  assert.equal(outcome.status, 401);
  assert.equal(outboundCalls, 0);
  assert.equal(
    rpcCalls.filter(({ name }) => name === "wechat_auth_audit_v1").length,
    0,
  );
});

test("WECHAT-003 never returns a native session when the required success audit fails", async () => {
  const admin = {
    async rpc(name) {
      if (name === "wechat_auth_challenge_consume_v1") {
        return { data: true, error: null };
      }
      return { data: null, error: { message: "audit unavailable" } };
    },
  };
  let fetchCalls = 0;
  const exchangeModule = loadTypeScriptModule(
    "src/server/auth/wechat-exchange.ts",
    {
      globals: {
        async fetch() {
          fetchCalls += 1;
          return fetchCalls === 1
            ? new Response(JSON.stringify({ id_token: "i".repeat(64) }))
            : new Response(
                JSON.stringify({
                  access_token: "a".repeat(64),
                  expires_at: 2_000_000_000,
                  expires_in: 3_600,
                  refresh_token: "r".repeat(64),
                  token_type: "bearer",
                  user: { id: "00000000-0000-4000-8000-000000000001" },
                }),
              );
        },
      },
      requires: {
        "@/lib/supabase/admin": { createSupabaseAdminClient: () => admin },
        "server-only": {},
      },
    },
  );
  const outcome = await exchangeModule.exchangeWeChatCode(
    {
      authorization: null,
      code: "wechat-code",
      correlationId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      ipAddress: "203.0.113.10",
      mode: "login",
      nonce: "n".repeat(43),
      state: "s".repeat(43),
      surface: "mini_program",
    },
    runtimeConfig(),
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "backend_temporary");
  assert.equal(outcome.status, 503);
});

test("WECHAT-003 challenge route fails closed while the provider is OFF", async () => {
  let issueCalls = 0;
  const route = loadTypeScriptModule(
    "src/app/api/auth/wechat/challenge/route.ts",
    {
      requires: {
        "@/lib/auth/wechat-contract": {
          isWeChatLinkMode: (value) => value === "login" || value === "link",
          isWeChatNativeSurface: (value) =>
            value === "android" || value === "ios" || value === "mini_program",
        },
        "@/server/auth/wechat-config": {
          isWeChatSurfaceReady: () => false,
          resolveWeChatRuntimeConfig: () => ({ activation: "disabled" }),
        },
        "@/server/auth/wechat-exchange": {
          async issueWeChatChallenge() {
            issueCalls += 1;
            return { code: "unexpected", ok: false, status: 500 };
          },
        },
        "next/server": { NextResponse: nextResponseStub() },
      },
    },
  );
  const response = await route.POST(
    new Request("https://admin.example.test/api/auth/wechat/challenge", {
      body: JSON.stringify({
        deviceId: "11111111-1111-4111-8111-111111111111",
        mode: "login",
        surface: "mini_program",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(response.body.code, "provider_not_configured");
  assert.equal(issueCalls, 0);
});

test("WECHAT-004 native linking obeys the independent linking kill switch", async () => {
  let issueCalls = 0;
  const route = loadTypeScriptModule(
    "src/app/api/auth/wechat/challenge/route.ts",
    {
      requires: {
        "@/lib/auth/wechat-contract": {
          isWeChatLinkMode: (value) => value === "login" || value === "link",
          isWeChatNativeSurface: (value) =>
            value === "android" || value === "ios" || value === "mini_program",
        },
        "@/server/auth/wechat-config": {
          isWeChatLinkingReady: () => false,
          isWeChatSurfaceReady: () => true,
          resolveWeChatRuntimeConfig: () => ({ linkingEnabled: false }),
        },
        "@/server/auth/wechat-exchange": {
          async issueWeChatChallenge() {
            issueCalls += 1;
            return { code: "unexpected", ok: false, status: 500 };
          },
        },
        "next/server": { NextResponse: nextResponseStub() },
      },
    },
  );
  const response = await route.POST(
    new Request("https://admin.example.test/api/auth/wechat/challenge", {
      body: JSON.stringify({
        deviceId: "11111111-1111-4111-8111-111111111111",
        mode: "link",
        nonce: "n".repeat(43),
        state: "s".repeat(43),
        surface: "android",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(response.body.code, "provider_not_configured");
  assert.equal(issueCalls, 0);

  let rpcCalls = 0;
  const exchange = loadTypeScriptModule(
    "src/server/auth/wechat-exchange.ts",
    {
      requires: {
        "@/lib/supabase/admin": {
          createSupabaseAdminClient() {
            return {
              async rpc() {
                rpcCalls += 1;
                return { data: true, error: null };
              },
            };
          },
        },
        "server-only": {},
      },
    },
  );
  const outcome = await exchange.exchangeWeChatCode(
    {
      authorization: "Bearer victim-session",
      code: "wechat-code",
      correlationId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      ipAddress: "untrusted_ingress",
      mode: "link",
      nonce: "n".repeat(43),
      state: "s".repeat(43),
      surface: "android",
    },
    runtimeConfig({ WECHAT_AUTH_LINKING_ENABLED: "" }),
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "provider_not_configured");
  assert.equal(rpcCalls, 0);
});

test("WECHAT-003 challenge IP bucketing trusts Cloudflare only after explicit deployment opt-in", async () => {
  const observedIpAddresses = [];
  const route = loadTypeScriptModule(
    "src/app/api/auth/wechat/challenge/route.ts",
    {
      requires: {
        "@/lib/auth/wechat-contract": {
          isWeChatLinkMode: (value) => value === "login" || value === "link",
          isWeChatNativeSurface: (value) =>
            value === "android" || value === "ios" || value === "mini_program",
        },
        "@/server/auth/wechat-config": {
          isWeChatSurfaceReady: () => true,
          resolveWeChatRuntimeConfig: () => ({ activation: "ready" }),
        },
        "@/server/auth/wechat-exchange": {
          async issueWeChatChallenge(input) {
            observedIpAddresses.push(input.ipAddress);
            return {
              challenge: {
                correlationId: "11111111-1111-4111-8111-111111111111",
                expiresInSeconds: 300,
                nonce: "n".repeat(43),
                state: "s".repeat(43),
              },
              ok: true,
            };
          },
        },
        "next/server": { NextResponse: nextResponseStub() },
      },
    },
  );
  const previous = process.env.WECHAT_TRUST_CLOUDFLARE_CONNECTING_IP;
  const request = () =>
    new Request("https://admin.example.test/api/auth/wechat/challenge", {
      body: JSON.stringify({
        deviceId: "11111111-1111-4111-8111-111111111111",
        mode: "login",
        surface: "mini_program",
      }),
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

  try {
    delete process.env.WECHAT_TRUST_CLOUDFLARE_CONNECTING_IP;
    assert.equal((await route.POST(request())).status, 200);
    process.env.WECHAT_TRUST_CLOUDFLARE_CONNECTING_IP = "true";
    assert.equal((await route.POST(request())).status, 200);
  } finally {
    if (previous === undefined) {
      delete process.env.WECHAT_TRUST_CLOUDFLARE_CONNECTING_IP;
    } else {
      process.env.WECHAT_TRUST_CLOUDFLARE_CONNECTING_IP = previous;
    }
  }

  assert.deepEqual(observedIpAddresses, ["untrusted_ingress", "203.0.113.10"]);
});

test("WECHAT-003 callback exchanges the authorization code and fails closed when it is absent", async () => {
  const exchangedCodes = [];
  let clientCreations = 0;
  const route = loadTypeScriptModule("src/app/auth/callback/route.ts", {
    requires: {
      "@/lib/auth/oauth-redirect": oauthRedirectStubs(),
      "@/lib/supabase/server": {
        async createSupabaseServerClient() {
          clientCreations += 1;
          return {
            auth: {
              async exchangeCodeForSession(code) {
                exchangedCodes.push(code);
                return { error: null };
              },
            },
          };
        },
      },
      "@/server/auth/wechat-config": {
        isWeChatLinkingReady: () => false,
        resolveWeChatRuntimeConfig: () => ({ hashSalt: "test-salt" }),
      },
      "@/server/auth/wechat-link-saga": {
        async finalizeWeChatLinkAttempt() {
          return true;
        },
        async reconcileCurrentWeChatLink() {
          return true;
        },
      },
      "next/server": { NextResponse: nextResponseStub() },
    },
  });
  const success = await route.GET(
    new Request(
      "https://admin.example.test/auth/callback?code=oauth-code&next=%2Fshop",
    ),
  );
  const missing = await route.GET(
    new Request("https://admin.example.test/auth/callback?next=%2Fshop"),
  );

  assert.equal(success.location, "https://admin.example.test/shop");
  assert.equal(exchangedCodes.length, 1);
  assert.equal(exchangedCodes[0], "oauth-code");
  assert.equal(clientCreations, 1);
  assert.match(missing.location, /callback_missing_code/);
});

test("WECHAT-004 callback rejects partial link markers before consuming the PKCE code", async () => {
  let exchangeCalls = 0;
  let clientCreations = 0;
  const route = loadTypeScriptModule("src/app/auth/callback/route.ts", {
    requires: {
      "@/lib/auth/oauth-redirect": oauthRedirectStubs(),
      "@/lib/supabase/server": {
        async createSupabaseServerClient() {
          clientCreations += 1;
          return {
            auth: {
              async exchangeCodeForSession() {
                exchangeCalls += 1;
                return { error: null };
              },
            },
          };
        },
      },
      "@/server/auth/wechat-config": {
        isWeChatLinkingReady: () => true,
        resolveWeChatRuntimeConfig: () => ({ linkingEnabled: true }),
      },
      "@/server/auth/wechat-link-saga": {
        async finalizeWeChatLinkAttempt() {
          return true;
        },
        async reconcileCurrentWeChatLink() {
          return true;
        },
      },
      "next/server": { NextResponse: nextResponseStub() },
    },
  });

  const response = await route.GET(
    new Request(
      "https://admin.example.test/auth/callback?code=oauth-code&wechat_link_attempt=90000000-0000-4000-8000-000000000001",
    ),
  );

  assert.match(response.location, /wechat_state_invalid/);
  assert.equal(clientCreations, 0);
  assert.equal(exchangeCalls, 0);
});

test("WECHAT-004 callback reconciles a completed link when provider markers are lost", async () => {
  let reconcileCalls = 0;
  const actorId = "90000000-0000-4000-8000-000000000001";
  const route = loadTypeScriptModule("src/app/auth/callback/route.ts", {
    requires: {
      "@/lib/auth/oauth-redirect": oauthRedirectStubs(),
      "@/lib/supabase/server": {
        async createSupabaseServerClient() {
          return {
            auth: {
              async exchangeCodeForSession() {
                return { error: null };
              },
              async getUser() {
                return { data: { user: { id: actorId } }, error: null };
              },
            },
          };
        },
      },
      "@/server/auth/wechat-config": {
        isWeChatLinkingReady: () => true,
        resolveWeChatRuntimeConfig: () => ({ linkingEnabled: true }),
      },
      "@/server/auth/wechat-link-saga": {
        async finalizeWeChatLinkAttempt() {
          return true;
        },
        async reconcileCurrentWeChatLink(receivedActorId) {
          reconcileCalls += 1;
          assert.equal(receivedActorId, actorId);
          return true;
        },
      },
      "next/server": { NextResponse: nextResponseStub() },
    },
  });

  const response = await route.GET(
    new Request("https://admin.example.test/auth/callback?code=oauth-code"),
  );

  assert.equal(response.location, "https://admin.example.test/shop");
  assert.equal(reconcileCalls, 1);
});

test("WECHAT-003 linking requires an authenticated personal account before invoking linkIdentity", async () => {
  let authenticated = false;
  let linkCalls = 0;
  const route = loadTypeScriptModule(
    "src/app/auth/oauth/wechat/link/route.ts",
    {
      requires: {
        "@/lib/auth/oauth-redirect": oauthRedirectStubs(),
        "@/lib/supabase/server": {
          async createSupabaseServerClient() {
            return {
              auth: {
                async getUser() {
                  return authenticated
                    ? { data: { user: { id: "user-1" } }, error: null }
                    : { data: { user: null }, error: null };
                },
                async linkIdentity(input) {
                  linkCalls += 1;
                  assert.equal(input.provider, "custom:wechat");
                  return {
                    data: { url: "https://project.supabase.co/auth/v1/authorize" },
                    error: null,
                  };
                },
              },
            };
          },
        },
        "@/server/auth/wechat-config": {
          isWeChatLinkingReady: () => true,
          resolveWeChatRuntimeConfig: () => ({
            oidcProvider: "custom:wechat",
          }),
        },
        "@/server/auth/wechat-link-saga": {
          async beginWeChatLinkAttempt() {
            return {
              attemptId: "90000000-0000-4000-8000-000000000001",
              nonce: "n".repeat(43),
            };
          },
          async failWeChatLinkAttempt() {
            return true;
          },
          async reconcileWeChatLinkAttempts() {
            return true;
          },
        },
        "next/server": { NextResponse: nextResponseStub() },
      },
    },
  );

  const blocked = await route.GET(
    new Request(
      "https://admin.example.test/auth/oauth/wechat/link?next=%2Faccount%2Fprofile",
    ),
  );
  assert.match(blocked.location, /oauth_blocked/);
  assert.equal(linkCalls, 0);

  authenticated = true;
  const linked = await route.GET(
    new Request(
      "https://admin.example.test/auth/oauth/wechat/link?next=%2Faccount%2Fprofile",
    ),
  );
  assert.equal(
    linked.location,
    "https://project.supabase.co/auth/v1/authorize",
  );
  assert.equal(linkCalls, 1);
  assert.equal(linked.headers.get("Cache-Control"), "no-store, max-age=0");
});
