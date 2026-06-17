import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function loadOAuthRedirectHelper() {
  const source = readProjectFile("src/lib/auth/oauth-redirect.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    module: cjsModule,
    URL,
    URLSearchParams,
  });

  return cjsModule.exports;
}

test("TASK-065 OAuth redirect helper exists and blocks stale Vercel redirects", () => {
  const helperPath = "src/lib/auth/oauth-redirect.ts";

  assert.equal(existsSync(join(root, helperPath)), true, `${helperPath} is missing`);

  const helper = readProjectFile(helperPath);

  assert.match(helper, /buildOAuthCallbackUrl/);
  assert.match(helper, /requestOriginFromHeaders/);
  assert.match(helper, /isGoogleOAuthAccountsLocation/);
  assert.match(helper, /hasInvalidGoogleOAuthClientIdLocation/);
  assert.match(helper, /hasMisconfiguredOAuthRedirectUrl/);
  assert.match(helper, /isOAuthProviderNotEnabledBody/);
  assert.match(helper, /isVercelHost/);
  assert.match(helper, /vercel\.app/);
  assert.match(helper, /redirect_to/);
  assert.match(helper, /parsedRedirectTo\.origin !== currentOriginUrl\.origin/);
  assert.match(helper, /Unsupported provider\|provider is not enabled/);
  assert.match(helper, /startsWith\("\/\/"\)/);
  assert.equal(helper.includes('!value.includes("\\\\")'), true);
  assert.match(helper, /\[\\u0000-\\u001F\\u007F\]/);
});

test("TASK-065 OAuth redirect helper behavior rejects unsafe paths and stale redirects", () => {
  const helper = loadOAuthRedirectHelper();
  const currentOrigin = "http://127.0.0.1:3050";
  const authorizeUrl = new URL("http://127.0.0.1:54321/auth/v1/authorize");

  authorizeUrl.searchParams.set(
    "redirect_to",
    "http://127.0.0.1:3050/auth/callback?next=%2Fplatform",
  );

  assert.equal(helper.safeInternalNextPath("/platform"), "/platform");
  assert.equal(helper.safeInternalNextPath("//evil.example/path"), "/");
  assert.equal(helper.safeInternalNextPath("/\\evil.example/path"), "/");
  assert.equal(helper.safeInternalNextPath("/\u0000evil"), "/");
  assert.equal(helper.safeInternalNextPath("https://evil.example/path"), "/");
  assert.equal(
    helper.buildOAuthCallbackUrl(currentOrigin, "//evil"),
    "http://127.0.0.1:3050/auth/callback?next=%2F",
  );
  assert.equal(
    helper.hasMisconfiguredOAuthRedirectUrl(authorizeUrl.toString(), currentOrigin),
    false,
  );

  authorizeUrl.searchParams.set(
    "redirect_to",
    "http://localhost:3050/auth/callback?next=%2Fplatform",
  );
  assert.equal(
    helper.hasMisconfiguredOAuthRedirectUrl(authorizeUrl.toString(), currentOrigin),
    true,
  );

  authorizeUrl.searchParams.set(
    "redirect_to",
    "https://old-deployment.vercel.app/auth/callback?next=%2Fplatform",
  );
  assert.equal(
    helper.hasMisconfiguredOAuthRedirectUrl(authorizeUrl.toString(), currentOrigin),
    true,
  );
  assert.equal(
    helper.hasMisconfiguredOAuthRedirectUrl(
      "https://stale-deployment.vercel.app/auth/v1/authorize",
      "https://stale-deployment.vercel.app",
    ),
    true,
  );
});

test("TASK-065 OAuth helper behavior classifies provider and Google client-id failures", () => {
  const helper = loadOAuthRedirectHelper();
  const validGoogle = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  validGoogle.searchParams.set("client_id", "real-client.apps.googleusercontent.com");
  const placeholderGoogle = new URL(validGoogle);
  placeholderGoogle.searchParams.set(
    "client_id",
    "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)",
  );

  assert.equal(
    helper.isOAuthProviderNotEnabledBody(
      '{"msg":"Unsupported provider: provider is not enabled"}',
    ),
    true,
  );
  assert.equal(helper.isGoogleOAuthAccountsLocation(validGoogle.toString()), true);
  assert.equal(
    helper.hasInvalidGoogleOAuthClientIdLocation(validGoogle.toString()),
    false,
  );
  assert.equal(
    helper.hasInvalidGoogleOAuthClientIdLocation(placeholderGoogle.toString()),
    true,
  );
  assert.equal(
    helper.isGoogleOAuthAccountsLocation("https://example.com/oauth"),
    false,
  );
});

test("TASK-065 Google OAuth action uses current origin callback and guarded provider URL", () => {
  const action = readProjectFile("src/app/auth/login/actions.ts");

  assert.match(action, /buildOAuthCallbackUrl\(origin, nextPath\)/);
  assert.match(action, /redirectTo:\s*buildOAuthCallbackUrl\(origin, nextPath\)/);
  assert.match(action, /hasMisconfiguredOAuthRedirectUrl\(data\.url, origin\)/);
  assert.match(action, /probeOAuthAuthorizeUrl\(data\.url\)/);
  assert.match(action, /oauthAuthorizeProbeTimeoutMs = 3_000/);
  assert.match(action, /new AbortController\(\)/);
  assert.match(action, /signal: controller\.signal/);
  assert.match(action, /clearTimeout\(timeout\)/);
  assert.match(action, /isGoogleOAuthAccountsLocation\(location\)/);
  assert.match(action, /hasInvalidGoogleOAuthClientIdLocation\(location\)/);
  assert.match(action, /redirect:\s*"manual"/);
  assert.match(action, /oauth_google_client_id_invalid/);
  assert.match(action, /oauth_provider_not_enabled/);
  assert.match(action, /oauth_redirect_misconfigured/);
  assert.doesNotMatch(action, /NEXT_PUBLIC_VERCEL_URL|VERCEL_URL|vercel\.app/);
});

test("TASK-065 callback preserves safe next on handled OAuth errors", () => {
  const callback = readProjectFile("src/app/auth/callback/route.ts");

  assert.match(callback, /safeInternalNextPath/);
  assert.match(callback, /loginErrorUrl\(requestUrl\.origin, nextPath, "callback_missing_code"\)/);
  assert.match(callback, /loginErrorUrl\(requestUrl\.origin, nextPath, "auth_not_configured"\)/);
  assert.match(callback, /loginErrorUrl\(requestUrl\.origin, nextPath, "callback_blocked"\)/);
  assert.match(callback, /NextResponse\.redirect\(new URL\(nextPath, requestUrl\.origin\)\)/);
});

test("TASK-065 login UI displays OAuth and callback failures for account login", () => {
  const loginPage = readProjectFile("src/app/auth/login/page.tsx");
  const authForm = readProjectFile("src/components/auth/AuthForm.tsx");
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");

  assert.match(loginPage, /const error = getSingleSearchParamValue\(query\.error\)/);
  assert.match(loginPage, /resultMessage=/);
  assert.match(loginPage, /authLoginMessage/);
  assert.match(loginPage, /isMasterConsole \|\| activeLoginMode === "admin-account"/);
  assert.match(loginPage, /mode === "shop-code" \? "shop-code" : "admin-account"/);
  assert.match(loginPage, /<ShopCodeLoginForm/);
  assert.match(authForm, /resultMessage/);
  assert.match(authForm, /role="alert"/);
  assert.match(authForm, /function GoogleIcon/);
  assert.match(authForm, /aria-hidden="true"/);
  assert.match(authForm, /viewBox="0 0 18 18"/);
  assert.match(authForm, /<GoogleIcon \/>/);
  assert.match(authForm, /<span>\{labels\.googleSubmit\}<\/span>/);
  assert.doesNotMatch(authForm, /<img|cdn|gstatic|googleusercontent/i);
  assert.match(dictionaries, /oauth_redirect_misconfigured/);
  assert.match(dictionaries, /oauth_google_client_id_invalid/);
  assert.match(dictionaries, /oauth_provider_not_enabled/);
  assert.match(dictionaries, /not enabled in the local Supabase Auth configuration/);
  assert.match(dictionaries, /old Vercel redirect/);
});

test("TASK-065 Google account auth keeps Master and Shop authorization separated", () => {
  const platformLayout = readProjectFile("src/app/platform/layout.tsx");
  const platformAuthz = readProjectFile("src/server/platform-admin/authz.ts");
  const platformActions = readProjectFile("src/server/platform-admin/shop-actions.ts");
  const adminRouting = readProjectFile("src/server/auth/admin-routing.ts");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");
  const shopAccess = readProjectFile("src/server/shop-admin/shop-access.ts");
  const accessPrincipal = readProjectFile("src/server/shop-admin/access-principal.ts");
  const dataAccess = readProjectFile("src/server/shop-admin/data-access.ts");
  const actionContext = readProjectFile("src/server/shop-admin/action-context.ts");
  const shopCodeForm = readProjectFile("src/components/auth/ShopCodeLoginForm.tsx");

  assert.match(platformLayout, /resolveCurrentAdminRouteAccess\(\)/);
  assert.match(platformLayout, /access\.status !== "platform_admin"/);
  assert.match(platformLayout, /access\.status === "shop_admin"/);
  assert.match(platformLayout, /authorized for Admin Console, not Master Console/);
  assert.match(platformAuthz, /\.from\("platform_admins"\)/);
  assert.match(platformAuthz, /\.eq\("status", "active"\)/);
  assert.match(platformAuthz, /\.is\("revoked_at", null\)/);
  assert.match(platformActions, /authorizeCurrentPlatformAdmin\(supabase\)/);

  assert.match(adminRouting, /\.from\("platform_admins"\)/);
  assert.match(adminRouting, /\.from\("shop_members"\)/);
  assert.match(adminRouting, /status: "platform_admin"/);
  assert.match(adminRouting, /status: "shop_admin"/);

  assert.match(shopLayout, /resolveShopAdminDataAccess\(\)/);
  assert.match(shopLayout, /access\.status !== "ready"/);
  assert.match(shopLayout, /principal\.kind === "personal_account"/);
  assert.match(shopAccess, /\.from\("shop_members"\)/);
  assert.match(shopAccess, /\.eq\("membership_status", "active"\)/);
  assert.match(shopAccess, /shop_owner/);
  assert.match(shopAccess, /shop_manager/);
  assert.match(accessPrincipal, /source: "supabase_auth_shop_members"/);
  assert.match(dataAccess, /resolveCurrentShopAdminPrincipal\(serverClient\)/);
  assert.match(dataAccess, /principalKind: "personal_account"/);
  assert.match(dataAccess, /strictRequestedShop/);
  assert.match(actionContext, /resolveShopAdminDataAccess\(\{/);
  assert.match(actionContext, /strictRequestedShop: true/);
  assert.match(actionContext, /canShopAdmin\(selectedShop\.role, permission\)/);

  assert.doesNotMatch(shopLayout, /resolveCurrentAdminRouteAccess/);
  assert.doesNotMatch(shopAccess, /platform_admins|platform_admin/);
  assert.doesNotMatch(accessPrincipal, /platform_admins|platform_admin/);
  assert.doesNotMatch(dataAccess, /platform_admins|platform_admin/);
  assert.doesNotMatch(actionContext, /platform_admins|platform_admin/);
  assert.doesNotMatch(shopCodeForm, /googleSignInAction|Continue with Google/i);
});

test("TASK-065 local Supabase Auth redirect URLs match local dev and Cloudflare staging", () => {
  const config = readProjectFile("supabase/config.toml");

  assert.match(config, /site_url = "http:\/\/127\.0\.0\.1:3000"/);
  assert.match(config, /"http:\/\/127\.0\.0\.1:3000\/\*\*"/);
  assert.match(config, /"http:\/\/localhost:3000\/\*\*"/);
  assert.match(config, /"http:\/\/127\.0\.0\.1:3050\/\*\*"/);
  assert.match(config, /"http:\/\/127\.0\.0\.1:3055\/\*\*"/);
  assert.match(config, /"http:\/\/localhost:3055\/\*\*"/);
  assert.match(config, /merchandise-control-admin-web-staging\.merchandise-control-admin-web\.workers\.dev\/\*\*/);
  assert.doesNotMatch(config, /"https:\/\/127\.0\.0\.1:3000"/);
});

test("TASK-065 local Supabase Google provider is configured with env placeholders", () => {
  const config = readProjectFile("supabase/config.toml");
  const envExample = readProjectFile(".env.example");

  assert.match(config, /\[auth\.external\.google\]/);
  assert.match(config, /enabled = true/);
  assert.match(
    config,
    /client_id = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID\)"/,
  );
  assert.match(
    config,
    /secret = "env\(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET\)"/,
  );
  assert.match(config, /skip_nonce_check = false/);
  assert.match(envExample, /^SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=\s*$/m);
  assert.match(envExample, /^SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=\s*$/m);
});

test("TASK-065 local OAuth smoke checks provider-enabled redirect to Google", () => {
  const packageJson = readProjectFile("package.json");
  const smoke = readProjectFile(
    "scripts/testing/task-065-oauth-local-provider-smoke.mjs",
  );

  assert.match(packageJson, /"smoke:oauth:local"/);
  assert.match(smoke, /\/auth\/v1\/authorize/);
  assert.match(smoke, /provider", "google"/);
  assert.match(smoke, /redirect:\s*"manual"/);
  assert.match(smoke, /BLOCKED_EXTERNAL_CONFIG/);
  assert.match(smoke, /FAIL_CODE_REGRESSION/);
  assert.match(smoke, /signal: controller\.signal/);
  assert.match(smoke, /verifyGoogleOAuthLocation/);
  assert.match(smoke, /GOOGLE_OAUTH_ERROR_PAGE/);
  assert.match(smoke, /response\.status >= 400/);
  assert.match(smoke, /invalid_client\|redirect_uri_mismatch\|error 400/);
  assert.match(smoke, /\/platform/);
  assert.match(smoke, /\/shop/);
  assert.match(smoke, /accounts\.google\.com/);
  assert.match(smoke, /GOOGLE_CLIENT_ID_PLACEHOLDER/);
  assert.match(smoke, /\.apps\.googleusercontent\.com/);
  assert.match(smoke, /GOOGLE_PROVIDER_NOT_ENABLED/);
  assert.match(smoke, /Unsupported provider\|provider is not enabled/);
  assert.doesNotMatch(smoke, /client_secret|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/);
});
