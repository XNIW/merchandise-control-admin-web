import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

function loadContract() {
  const source = read("src/lib/auth/wechat-contract.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(output, { exports: cjsModule.exports, module: cjsModule });
  return cjsModule.exports;
}

test("WECHAT-001 shared surface, mode, error and session contracts are typed", () => {
  const contract = loadContract();
  assert.deepEqual([...contract.weChatSurfaces], [
    "web",
    "android",
    "ios",
    "mini_program",
  ]);
  assert.equal(contract.isWeChatNativeSurface("mini_program"), true);
  assert.equal(contract.isWeChatNativeSurface("web"), false);
  assert.equal(contract.isWeChatNativeSurface("other"), false);
  assert.equal(contract.isWeChatLinkMode("login"), true);
  assert.equal(contract.isWeChatLinkMode("link"), true);
  assert.equal(contract.isWeChatLinkMode("merge"), false);
  assert.ok(contract.weChatErrorCodes.includes("identity_conflict"));
  assert.ok(contract.weChatErrorCodes.includes("state_replayed"));
  assert.ok(contract.weChatAuditEvents.includes("auth.wechat.link_conflict"));
});

test("WECHAT-001 environment is default-off and keeps every secret server-only", () => {
  const config = read("src/server/auth/wechat-config.ts");
  const env = read(".env.example");

  for (const name of [
    "WECHAT_AUTH_WEB_ENABLED",
    "WECHAT_AUTH_ANDROID_ENABLED",
    "WECHAT_AUTH_IOS_ENABLED",
    "WECHAT_AUTH_MINI_PROGRAM_ENABLED",
    "WECHAT_AUTH_LINKING_ENABLED",
    "WECHAT_OIDC_PROVIDER",
    "WECHAT_IDENTITY_BRIDGE_EXCHANGE_URL",
    "WECHAT_IDENTITY_BRIDGE_HOST_ALLOWLIST",
    "WECHAT_IDENTITY_BRIDGE_CLIENT_ID",
    "WECHAT_IDENTITY_BRIDGE_CLIENT_SECRET",
    "WECHAT_AUTH_TECHNICAL_HASH_SALT",
  ]) {
    assert.match(env, new RegExp(`^${name}=$`, "m"));
  }
  assert.doesNotMatch(env, /NEXT_PUBLIC_WECHAT/);
  assert.match(config, /activation === "ready" && config\.enabledSurfaces\[surface\]/);
  assert.match(config, /parsed\.protocol !== "https:"/);
  assert.match(config, /allowedHosts\.has/);
  assert.match(config, /providerValid = oidcProvider === "custom:wechat"/);
});

test("WECHAT-001 server exchange is bounded, one-time and uses official Supabase id_token grant", () => {
  const exchange = read("src/server/auth/wechat-exchange.ts");
  const challengeRoute = read("src/app/api/auth/wechat/challenge/route.ts");
  const exchangeRoute = read("src/app/api/auth/wechat/exchange/route.ts");

  assert.match(exchange, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(exchange, /wechat_auth_challenge_issue_v1/);
  assert.match(exchange, /wechat_auth_challenge_consume_v1/);
  assert.match(exchange, /AbortSignal\.timeout\(outboundTimeoutMs\)/);
  assert.match(exchange, /redirect: "error"/);
  assert.match(exchange, /grant_type", "id_token"/);
  assert.match(exchange, /provider: config\.oidcProvider/);
  assert.match(exchange, /link_identity: input\.mode === "link"/);
  assert.match(exchange, /apikey: config\.supabasePublishableKey/);
  assert.doesNotMatch(exchange, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(exchange, /console\.(log|warn|error)/);
  assert.match(challengeRoute, /4_096/);
  assert.match(exchangeRoute, /4_096/);
  assert.doesNotMatch(challengeRoute, /request\.text\(\)/);
  assert.doesNotMatch(exchangeRoute, /request\.text\(\)/);
  assert.match(challengeRoute, /request\.body\.getReader\(\)/);
  assert.match(exchangeRoute, /request\.body\.getReader\(\)/);
  assert.match(exchange, /outboundResponseLimit/);
  assert.match(exchange, /response\.body\.getReader\(\)/);
  assert.doesNotMatch(exchange, /Response\.json\(|Response\)\.json\(|bridgeResponse\.json\(|tokenResponse\.json\(/);
  assert.match(exchangeRoute, /codePattern/);
  assert.match(exchangeRoute, /base64UrlPattern/);
  assert.match(exchangeRoute, /Cache-Control.*no-store/);
});

test("WECHAT-001 sales RPCs remain authenticated, bounded and shop-scoped", () => {
  const migrationPath =
    "supabase/migrations/20260813002817_wechat_auth_sales_read_contract.sql";
  const sqlTestPath = "supabase/tests/wechat_auth_sales_read_contract.sql";
  assert.equal(existsSync(join(root, migrationPath)), true);
  assert.equal(existsSync(join(root, sqlTestPath)), true);
  const migration = read(migrationPath);
  const sqlTest = read(sqlTestPath);

  assert.match(migration, /set search_path = ''/g);
  assert.match(migration, /auth\.uid\(\) is not null/);
  assert.match(migration, /profile\.profile_status = 'active'/);
  assert.match(migration, /member\.membership_status = 'active'/);
  assert.match(migration, /shop\.shop_status = 'active'/);
  assert.match(migration, /p_limit not between 1 and 100/);
  assert.match(migration, /revoke all on function public\.wechat_daily_sales_page_v1/);
  assert.doesNotMatch(migration, /grant select on (table )?public\.pos_(sales|sale_lines|revenue)/i);
  assert.match(sqlTest, /shop A user cannot read shop B summary/);
  assert.match(sqlTest, /anonymous caller sees no sales summary/);
  assert.match(sqlTest, /challenge replay is rejected/);
});

test("WECHAT-001 web UI is personal-account-only and preserves Google/password/staff paths", () => {
  const page = read("src/app/auth/login/page.tsx");
  const form = read("src/components/auth/AuthForm.tsx");
  const wechatRoute = read("src/app/auth/oauth/wechat/route.ts");
  const wechatLinkRoute = read("src/app/auth/oauth/wechat/link/route.ts");
  const accountProfile = read("src/app/account/profile/page.tsx");

  assert.match(page, /rendersAccountForm \?/);
  assert.match(page, /isWeChatConfigured=/);
  assert.match(page, /<ShopCodeLoginForm/);
  assert.match(form, /action="\/auth\/oauth\/google"/);
  assert.match(form, /action="\/auth\/oauth\/wechat"/);
  assert.match(form, /action=\{formAction\}/);
  assert.match(form, /isWeChatConfigured \?/);
  assert.match(wechatRoute, /provider: config\.oidcProvider/);
  assert.match(wechatRoute, /buildOAuthCallbackUrl\(origin, nextPath\)/);
  assert.match(wechatRoute, /hasMisconfiguredOAuthRedirectUrl/);
  assert.doesNotMatch(wechatRoute, /serviceRole|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(wechatLinkRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(wechatLinkRoute, /supabase\.auth\.linkIdentity\(/);
  assert.match(wechatLinkRoute, /isWeChatLinkingReady/);
  assert.match(accountProfile, /weChatLinkingReady \?/);
  assert.doesNotMatch(wechatLinkRoute, /unlinkIdentity|serviceRole|SUPABASE_SERVICE_ROLE_KEY/);
});

test("WECHAT-001 ADR selects one architecture and records external gates", () => {
  const adr = read("docs/DECISIONS/ADR-002-wechat-custom-oidc-bridge.md");
  const threat = read("docs/AUDITS/WECHAT-001-THREAT-MODEL.md");
  const runbook = read("docs/RUNBOOKS/WECHAT-001-ACTIVATION.md");

  assert.match(adr, /Retain path \*\*C\*\*/);
  assert.match(adr, /Direct Supabase custom OAuth2 to WeChat: not approved/);
  assert.match(adr, /Direct WeChat OIDC: not approved/);
  assert.match(adr, /bridge is a code\/runtime blocker/);
  assert.match(adr, /adaptive three-to-thirty-second polling/);
  assert.match(adr, /APP_REVIEW_DECISION_REQUIRED/);
  assert.match(threat, /Cross-shop leak/);
  assert.match(runbook, /Do not run production migration/);
});

test("WECHAT-002 read parity remains bounded, authenticated and server-owned", () => {
  const migration = read(
    "supabase/migrations/20260813022833_wechat_002_mini_program_read_parity.sql",
  );
  const rpcGateway = read("src/server/wechat/user-rpc.ts");
  const contract = read("docs/contracts/WECHAT-001-identity-api-contract.md");

  for (const rpc of [
    "wechat_sales_period_summary_v1",
    "wechat_sales_page_v2",
    "wechat_sale_detail_v2",
    "wechat_catalog_page_v1",
    "wechat_product_detail_v1",
    "wechat_price_history_page_v1",
    "wechat_categories_page_v1",
    "wechat_suppliers_page_v1",
    "wechat_sync_history_page_v1",
  ]) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
    assert.match(rpcGateway, new RegExp(`"${rpc}"`));
  }
  assert.match(migration, /app_private\.wechat_can_read_shop\(p_shop_id\)/g);
  assert.match(migration, /set search_path = ''/g);
  assert.match(migration, /p_limit not between 1 and 100/g);
  assert.match(migration, /p_to_date - p_from_date > 365/g);
  assert.doesNotMatch(migration, /grant select on .*inventory_|grant select on .*pos_/i);
  assert.match(contract, /five-minute signed thumbnail\/main URLs/);
});
