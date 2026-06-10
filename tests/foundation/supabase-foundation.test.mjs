import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

const requiredFiles = [
  ".env.example",
  "src/lib/supabase/server.ts",
  "src/server/platform-admin/authz.ts",
  "src/server/platform-admin/read-model.ts",
  "src/server/platform-admin/mappers.ts",
  "src/server/platform-admin/inventory-sources.ts",
  "scripts/security-checks.mjs",
  "docs/TASKS/TASK-005E-supabase-foundation-execution.md",
  "docs/TASKS/EVIDENCE/TASK-005E/README.md",
];

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-005E foundation files exist", () => {
  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }
});

test(".env.example declares only empty future Supabase variables", () => {
  const envTemplate = readProjectFile(".env.example");
  const requiredNames = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PROJECT_REF",
  ];

  for (const name of requiredNames) {
    assert.match(envTemplate, new RegExp(`^${name}=\\s*$`, "m"), `${name} must be present without a value`);
  }

  for (const line of envTemplate.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [, value = ""] = line.split("=", 2);
    assert.equal(value.trim(), "", `env template value must stay empty: ${line}`);
  }
});

test("package scripts wire the static security harness into verify", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));

  assert.equal(pkg.scripts["security:scan"], "node scripts/security-checks.mjs");
  assert.match(pkg.scripts.verify, /security:scan/);
});

test("typecheck regenerates Next route types before TypeScript validation", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  const tsconfig = JSON.parse(readProjectFile("tsconfig.json"));

  assert.match(pkg.scripts.typecheck, /next typegen/);
  assert.match(pkg.scripts.typecheck, /tsc --noEmit/);
  assert.ok(tsconfig.include.includes(".next/types/**/*.ts"));
  assert.ok(tsconfig.include.includes(".next/dev/types/**/*.ts"));
});

test("server Supabase boundary remains server-side and service-role free", () => {
  const serverBoundary = readProjectFile("src/lib/supabase/server.ts");

  assert.match(serverBoundary, /not_configured/);
  assert.doesNotMatch(serverBoundary, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i);
});

test("owner source mapping keeps the TASK-005D initial 1:1 cardinality", () => {
  const taskDoc = readProjectFile("docs/TASKS/TASK-005E-supabase-foundation-execution.md");
  const mapper = readProjectFile("src/server/platform-admin/mappers.ts");

  assert.doesNotMatch(taskDoc, /owner_user_id -> shop_id`:\s*puo mappare piu shop/);
  assert.match(taskDoc, /owner_user_id -> shop_id`:\s*inizialmente massimo 1 shop attivo/);
  assert.match(mapper, /validateInitialShopOwnerMappingCardinality/);
  assert.match(mapper, /duplicate_active_owner/);
  assert.match(mapper, /duplicate_active_shop/);
});

test("TASK-005H bootstrap script is CLI-only, explicit, and redacted", () => {
  const bootstrapPath = "scripts/supabase/bootstrap-platform-admin.mjs";

  assert.equal(existsSync(join(root, bootstrapPath)), true);

  const script = readProjectFile(bootstrapPath);

  assert.match(script, /PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID/);
  assert.match(script, /PLATFORM_ADMIN_BOOTSTRAP_REASON/);
  assert.match(script, /CONFIRM_PLATFORM_ADMIN_BOOTSTRAP/);
  assert.match(script, /BLOCKED_INPUT_REQUIRED/);
  assert.match(script, /platform_admin\.bootstrap\.granted/);
  assert.match(script, /rollback/);
  assert.match(script, /commit/);
  assert.doesNotMatch(script, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(script, /password\s*=/i);
});

test("TASK-005J bootstrap can resolve the only auth user without printing identity", () => {
  const bootstrapPath = "scripts/supabase/bootstrap-platform-admin.mjs";
  const script = readProjectFile(bootstrapPath);

  assert.match(script, /PLATFORM_ADMIN_BOOTSTRAP_EMAIL/);
  assert.match(script, /PLATFORM_ADMIN_TEST_EMAIL/);
  assert.match(script, /Initial platform admin bootstrap approved by project owner/);
  assert.match(script, /count\(\*\).*from auth\.users/s);
  assert.match(script, /exactly one auth user/);
  assert.match(script, /PROFILE_ID_SHA256_12/);
  assert.doesNotMatch(script, /select\s+[^;]*(email|id::text)[^;]*from auth\.users[^;]*;/i);
});

test("TASK-043 live read model batches independent Supabase reads for navigation latency", () => {
  const readModel = readProjectFile("src/server/platform-admin/read-model.ts");

  assert.match(readModel, /Promise\.all\s*\(/);
  assert.match(readModel, /\.from\("profiles"\)[\s\S]*\.limit\(200\)/);
  assert.match(readModel, /\.from\("shops"\)[\s\S]*\.limit\(200\)/);
  assert.match(readModel, /\.from\("staff_accounts_safe"\)[\s\S]*\.limit\(200\)/);
});

test("TASK-005J auth UI keeps Supabase sign-in scoped to auth boundaries", () => {
  const clientPath = "src/lib/supabase/client.ts";
  const loginActionPath = "src/app/auth/login/actions.ts";
  const loginPagePath = "src/app/auth/login/page.tsx";
  const authFormPath = "src/components/auth/AuthForm.tsx";
  const callbackPath = "src/app/auth/callback/route.ts";
  const logoutPath = "src/app/auth/logout/route.ts";

  for (const relativePath of [
    clientPath,
    loginActionPath,
    loginPagePath,
    authFormPath,
    callbackPath,
    logoutPath,
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const browserClient = readProjectFile(clientPath);
  const loginAction = readProjectFile(loginActionPath);
  const authForm = readProjectFile(authFormPath);
  const callbackRoute = readProjectFile(callbackPath);
  const logoutRoute = readProjectFile(logoutPath);

  assert.match(browserClient, /createBrowserClient/);
  assert.match(browserClient, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(browserClient, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(browserClient, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.match(loginAction, /"use server"/);
  assert.match(loginAction, /createSupabaseServerClient/);
  assert.match(loginAction, /signInWithPassword/);
  assert.match(loginAction, /isSafeInternalNextPath/);
  assert.match(loginAction, /startsWith\("\/\/"\)/);
  assert.match(loginAction, /redirect\(nextPath, RedirectType\.replace\)/);
  assert.doesNotMatch(loginAction, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.match(authForm, /accountSignInAction/);
  assert.match(authForm, /useActionState/);
  assert.match(authForm, /name="next"/);
  assert.doesNotMatch(authForm, /method="post"/);
  assert.doesNotMatch(authForm, /createSupabaseBrowserClient|signInWithPassword|router\.replace/);
  assert.doesNotMatch(authForm, /from\(["'][a-z_]+["']\)/);
  assert.match(callbackRoute, /exchangeCodeForSession/);
  assert.match(logoutRoute, /signOut/);
  assert.doesNotMatch(`${loginAction}\n${authForm}\n${callbackRoute}\n${logoutRoute}`, /console\.(log|debug|info|warn|error)/);
});

test("TASK-005L auth redirects reject protocol-relative next paths", () => {
  const authForm = readProjectFile("src/components/auth/AuthForm.tsx");
  const loginAction = readProjectFile("src/app/auth/login/actions.ts");
  const callbackRoute = readProjectFile("src/app/auth/callback/route.ts");

  for (const source of [authForm, loginAction, callbackRoute]) {
    assert.match(source, /isSafeInternalNextPath/);
    assert.match(source, /startsWith\("\/\/"\)/);
  }
});

test("TASK-005K live auth browser gate is opt-in and non-persistent", () => {
  const pkg = JSON.parse(readProjectFile("package.json"));
  const playwrightConfig = readProjectFile("playwright.config.ts");
  const liveAuthTestPath = "tests/e2e/platform-admin-live-auth.spec.ts";

  assert.equal(existsSync(join(root, liveAuthTestPath)), true);
  assert.match(pkg.scripts["test:ui-live-auth"], /platform-admin-live-auth\.spec\.ts/);
  assert.match(pkg.scripts["test:ui-live-auth"], /PLAYWRIGHT_REUSE_SERVER=0/);
  assert.match(playwrightConfig, /PLAYWRIGHT_BASE_URL/);
  assert.match(playwrightConfig, /PLAYWRIGHT_WEB_SERVER_COMMAND/);
  assert.match(playwrightConfig, /PLAYWRIGHT_REUSE_SERVER/);

  const liveAuthTest = readProjectFile(liveAuthTestPath);

  assert.match(liveAuthTest, /CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST/);
  assert.match(liveAuthTest, /createUser/);
  assert.match(liveAuthTest, /deleteUser/);
  assert.match(liveAuthTest, /screenshot: "off"/);
  assert.match(liveAuthTest, /trace: "off"/);
  assert.match(liveAuthTest, /video: "off"/);
  assert.doesNotMatch(liveAuthTest, /storageState/);
  assert.doesNotMatch(liveAuthTest, /console\.(log|debug|info|warn|error)/);
});

test("TASK-005H Supabase SSR proxy refreshes sessions without authz decisions", () => {
  const proxyEntryPath = existsSync(join(root, "src/proxy.ts"))
    ? "src/proxy.ts"
    : "src/middleware.ts";
  const proxyHelperPath = "src/lib/supabase/proxy.ts";

  assert.equal(existsSync(join(root, proxyEntryPath)), true);
  assert.equal(existsSync(join(root, proxyHelperPath)), true);

  const proxyEntry = readProjectFile(proxyEntryPath);
  const proxyHelper = readProjectFile(proxyHelperPath);

  assert.match(proxyEntry, /export async function (proxy|middleware)/);
  assert.match(proxyEntry, /updateSupabaseSession/);
  assert.match(proxyEntry, /matcher/);
  assert.match(proxyEntry, /_next\/static/);
  assert.match(proxyEntry, /_next\/image/);
  assert.match(proxyEntry, /favicon\.ico/);

  assert.match(proxyHelper, /createServerClient/);
  assert.match(proxyHelper, /NextResponse\.next/);
  assert.match(proxyHelper, /request:\s*\{\s*headers:\s*new Headers\(request\.headers\)/);
  assert.match(proxyHelper, /auth\.getSession\(\)/);
  assert.match(proxyHelper, /request\.cookies\.set/);
  assert.match(proxyHelper, /response\.cookies\.set/);
  assert.doesNotMatch(proxyHelper, /platform_admins|is_platform_admin/);
  assert.doesNotMatch(proxyHelper, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});
