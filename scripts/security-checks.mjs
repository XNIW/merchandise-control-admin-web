#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
]);
const excludedDirectories = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

function addFailure(message) {
  failures.push(message);
}

function listFiles(start, includeEnvTemplates = false) {
  const absoluteStart = join(root, start);

  if (!existsSync(absoluteStart)) {
    return [];
  }

  const entries = readdirSync(absoluteStart);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(absoluteStart, entry);
    const stats = statSync(absolutePath);
    const relativePath = relative(root, absolutePath);

    if (stats.isDirectory()) {
      if (!excludedDirectories.has(entry)) {
        files.push(...listFiles(relativePath, includeEnvTemplates));
      }
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    if (!includeEnvTemplates && entry.startsWith(".env")) {
      continue;
    }

    const extension = entry.includes(".")
      ? entry.slice(entry.lastIndexOf("."))
      : "";

    if (textExtensions.has(extension) || includeEnvTemplates) {
      files.push(relativePath);
    }
  }

  return files;
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function checkEnvTemplate() {
  const envPath = ".env.example";

  if (!existsSync(join(root, envPath))) {
    addFailure(".env.example is missing");
    return;
  }

  const envTemplate = read(envPath);
  const requiredNames = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PROJECT_REF",
  ];

  for (const name of requiredNames) {
    if (!new RegExp(`^${name}=\\s*$`, "m").test(envTemplate)) {
      addFailure(`${envPath} must contain ${name}= without a value`);
    }
  }

  for (const line of envTemplate.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const [, value = ""] = line.split("=", 2);
    if (value.trim()) {
      addFailure(`${envPath} contains a non-empty value: ${line}`);
    }
  }
}

function checkClientBoundaries() {
  const appClientFiles = listFiles("src/app").filter((file) => {
    const contents = read(file);

    return /^["']use client["'];?/m.test(contents);
  });
  const clientFiles = [
    ...appClientFiles,
    ...listFiles("src/components"),
    ...listFiles("public"),
  ];
  const forbiddenPatterns = [
    /@supabase\//,
    /@\/lib\/supabase/,
    /src\/lib\/supabase/,
    /@\/server\//,
    /src\/server\//,
    /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i,
  ];

  for (const file of clientFiles) {
    const contents = read(file);
    const authClientBoundary = file.startsWith("src/components/auth/");

    for (const pattern of forbiddenPatterns) {
      if (
        authClientBoundary &&
        pattern.source === "@\\\/lib\\\/supabase" &&
        /@\/lib\/supabase\/client/.test(contents)
      ) {
        continue;
      }

      if (pattern.test(contents)) {
        addFailure(`${file} crosses the Supabase server-only boundary`);
      }
    }
  }
}

function checkReadOnlyContracts() {
  const serverFiles = [
    ...listFiles("src/server/platform-admin"),
    ...listFiles("src/lib/supabase"),
  ];
  const mutationPattern = /\.(insert|update|delete|upsert|rpc)\s*\(/;

  for (const file of serverFiles) {
    const contents = read(file);

    if (mutationPattern.test(contents)) {
      addFailure(`${file} contains a forbidden Supabase mutation-style call`);
    }

    if (/console\.(log|debug|info|warn|error)/.test(contents)) {
      addFailure(`${file} must not log potentially sensitive runtime errors`);
    }
  }
}

function checkAuthMetadataAndMockLabels() {
  const srcFiles = listFiles("src");

  for (const file of srcFiles) {
    const contents = read(file);

    if (/user_metadata|raw_user_meta_data/.test(contents)) {
      addFailure(`${file} must not authorize from user metadata`);
    }

    if (/mock[\s\S]{0,80}Live|Live[\s\S]{0,80}mock/.test(contents)) {
      addFailure(`${file} appears to label mock data as live data`);
    }
  }
}

function checkSecretLikeValues() {
  const projectFiles = listFiles(".");
  const jwtPattern =
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
  const nonTemplateServiceKeyPattern =
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[A-Za-z0-9_-]+/;

  for (const file of projectFiles) {
    if (file === "package-lock.json") {
      continue;
    }

    const contents = read(file);

    if (jwtPattern.test(contents)) {
      addFailure(`${file} contains a JWT-like literal`);
    }

    if (nonTemplateServiceKeyPattern.test(contents)) {
      addFailure(`${file} contains a service-role-like assignment`);
    }
  }
}

function checkRedactionHelper() {
  const authzPath = "src/server/platform-admin/authz.ts";

  if (!existsSync(join(root, authzPath))) {
    addFailure(`${authzPath} is missing`);
    return;
  }

  const contents = read(authzPath);

  if (!/redactPlatformAdminError/.test(contents)) {
    addFailure(`${authzPath} must expose an error redaction helper`);
  }

  if (/message:\s*error\./.test(contents)) {
    addFailure(`${authzPath} must not pass through raw error messages`);
  }
}

function checkOwnerMappingCardinality() {
  const taskPath = "docs/TASKS/TASK-005E-supabase-foundation-execution.md";
  const mapperPath = "src/server/platform-admin/mappers.ts";

  if (!existsSync(join(root, taskPath))) {
    addFailure(`${taskPath} is missing`);
    return;
  }

  if (!existsSync(join(root, mapperPath))) {
    addFailure(`${mapperPath} is missing`);
    return;
  }

  const taskContents = read(taskPath);
  const mapperContents = read(mapperPath);

  if (/owner_user_id -> shop_id`:\s*puo mappare piu shop/.test(taskContents)) {
    addFailure(`${taskPath} still allows multi-shop owner mappings`);
  }

  if (
    !/owner_user_id -> shop_id`:\s*inizialmente massimo 1 shop attivo/.test(
      taskContents,
    )
  ) {
    addFailure(`${taskPath} must document the initial 1:1 owner/shop mapping`);
  }

  if (
    !/validateInitialShopOwnerMappingCardinality/.test(mapperContents) ||
    !/duplicate_active_owner/.test(mapperContents) ||
    !/duplicate_active_shop/.test(mapperContents)
  ) {
    addFailure(`${mapperPath} must guard the initial 1:1 owner/shop mapping`);
  }
}

function checkSupabaseExecutionArtifacts() {
  const migrationPath =
    "supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql";
  const typesPath = "src/lib/supabase/database.types.ts";
  const readModelPath = "src/server/platform-admin/read-model.ts";
  const serverPath = "src/lib/supabase/server.ts";

  for (const requiredPath of [migrationPath, typesPath, readModelPath, serverPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const migration = read(migrationPath);
  const generatedTypes = read(typesPath);
  const readModel = read(readModelPath);
  const serverBoundary = read(serverPath);

  for (const tableName of [
    "profiles",
    "shops",
    "shop_members",
    "platform_admins",
    "shop_inventory_sources",
    "audit_logs",
  ]) {
    if (!new RegExp(`create table if not exists public\\.${tableName}`).test(migration)) {
      addFailure(`${migrationPath} must create public.${tableName}`);
    }

    if (!new RegExp(`alter table public\\.${tableName} enable row level security`).test(migration)) {
      addFailure(`${migrationPath} must enable RLS on public.${tableName}`);
    }

    if (!new RegExp(`${tableName}: \\{`).test(generatedTypes)) {
      addFailure(`${typesPath} must include ${tableName}`);
    }
  }

  if (/grant\s+\w+.*\s+to\s+anon/i.test(migration)) {
    addFailure(`${migrationPath} must not grant table access to anon`);
  }

  if (!/create schema if not exists app_private/.test(migration)) {
    addFailure(`${migrationPath} must keep privileged helpers in app_private`);
  }

  if (!/security definer/.test(migration)) {
    addFailure(`${migrationPath} must define controlled security definer helpers`);
  }

  if (!/@supabase\/ssr/.test(serverBoundary) || !/cookies/.test(serverBoundary)) {
    addFailure(`${serverPath} must use the Supabase SSR cookie boundary`);
  }

  if (/\.(insert|update|delete|upsert|rpc)\s*\(/.test(readModel)) {
    addFailure(`${readModelPath} must stay read-only`);
  }
}

function checkPlatformRoutesStayDynamic() {
  const routePaths = [
    "src/app/page.tsx",
    "src/app/platform/page.tsx",
    "src/app/platform/users/page.tsx",
    "src/app/platform/shops/page.tsx",
    "src/app/platform/audit/page.tsx",
    "src/app/platform/system/page.tsx",
    "src/app/platform/operations/page.tsx",
  ];

  for (const routePath of routePaths) {
    if (!existsSync(join(root, routePath))) {
      addFailure(`${routePath} is missing`);
      continue;
    }

    const contents = read(routePath);

    if (!/export const dynamic = ["']force-dynamic["']/.test(contents)) {
      addFailure(`${routePath} must force dynamic rendering for auth-scoped reads`);
    }
  }
}

function checkPlatformAdminBootstrapScript() {
  const bootstrapPath = "scripts/supabase/bootstrap-platform-admin.mjs";
  const packagePath = "package.json";

  if (!existsSync(join(root, bootstrapPath))) {
    addFailure(`${bootstrapPath} is missing`);
    return;
  }

  const bootstrap = read(bootstrapPath);
  const pkg = JSON.parse(read(packagePath));

  if (
    pkg.scripts["supabase:bootstrap-platform-admin"] !==
    "node scripts/supabase/bootstrap-platform-admin.mjs"
  ) {
    addFailure("package.json must expose supabase:bootstrap-platform-admin");
  }

  for (const envName of [
    "PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID",
    "PLATFORM_ADMIN_BOOTSTRAP_REASON",
    "CONFIRM_PLATFORM_ADMIN_BOOTSTRAP",
  ]) {
    if (!bootstrap.includes(envName)) {
      addFailure(`${bootstrapPath} must require ${envName}`);
    }
  }

  if (!/BLOCKED_INPUT_REQUIRED/.test(bootstrap)) {
    addFailure(`${bootstrapPath} must block when required input is absent`);
  }

  if (!/platform_admin\.bootstrap\.granted/.test(bootstrap)) {
    addFailure(`${bootstrapPath} must write a redacted bootstrap audit event`);
  }

  if (!/rollback/.test(bootstrap) || !/commit/.test(bootstrap)) {
    addFailure(`${bootstrapPath} must support rollback dry-run and confirmed apply`);
  }

  if (/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(bootstrap)) {
    addFailure(`${bootstrapPath} must not hardcode email addresses`);
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(bootstrap)) {
    addFailure(`${bootstrapPath} must not depend on service-role secrets`);
  }

  if (/password\s*=/i.test(bootstrap)) {
    addFailure(`${bootstrapPath} must not hardcode passwords`);
  }
}

function checkSupabaseProxyLifecycle() {
  const proxyEntryPath = "src/proxy.ts";
  const proxyHelperPath = "src/lib/supabase/proxy.ts";

  for (const requiredPath of [proxyEntryPath, proxyHelperPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const proxyEntry = read(proxyEntryPath);
  const proxyHelper = read(proxyHelperPath);

  if (!/export async function proxy/.test(proxyEntry)) {
    addFailure(`${proxyEntryPath} must export the Next.js 16 proxy function`);
  }

  if (!/matcher/.test(proxyEntry) || !/_next\/static/.test(proxyEntry) || !/_next\/image/.test(proxyEntry)) {
    addFailure(`${proxyEntryPath} must avoid static Next.js internals`);
  }

  if (!/favicon\.ico/.test(proxyEntry)) {
    addFailure(`${proxyEntryPath} must avoid favicon requests`);
  }

  if (!/createServerClient/.test(proxyHelper) || !/auth\.getClaims\(\)/.test(proxyHelper)) {
    addFailure(`${proxyHelperPath} must refresh Supabase SSR sessions through getClaims`);
  }

  if (!/request\.cookies\.set/.test(proxyHelper) || !/response\.cookies\.set/.test(proxyHelper)) {
    addFailure(`${proxyHelperPath} must sync refreshed cookies to request and response`);
  }

  if (/platform_admins|is_platform_admin/.test(proxyHelper)) {
    addFailure(`${proxyHelperPath} must not decide Platform Admin authorization`);
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i.test(proxyHelper)) {
    addFailure(`${proxyHelperPath} must not use service-role secrets`);
  }
}

function checkPlatformLiveAuthHarness() {
  const packagePath = "package.json";
  const configPath = "playwright.config.ts";
  const liveAuthTestPath = "tests/e2e/platform-admin-live-auth.spec.ts";

  for (const requiredPath of [packagePath, configPath, liveAuthTestPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const pkg = JSON.parse(read(packagePath));
  const config = read(configPath);
  const liveAuthTest = read(liveAuthTestPath);
  const liveScript = pkg.scripts["test:ui-live-auth"] ?? "";

  if (!/platform-admin-live-auth\.spec\.ts/.test(liveScript)) {
    addFailure("package.json must expose test:ui-live-auth for the live auth gate");
  }

  if (!/PLAYWRIGHT_REUSE_SERVER=0/.test(liveScript)) {
    addFailure("test:ui-live-auth must force a fresh dev server");
  }

  for (const envName of [
    "PLAYWRIGHT_BASE_URL",
    "PLAYWRIGHT_WEB_SERVER_COMMAND",
    "PLAYWRIGHT_REUSE_SERVER",
  ]) {
    if (!config.includes(envName)) {
      addFailure(`${configPath} must support ${envName}`);
    }
  }

  for (const requiredSnippet of [
    "CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST",
    "createUser",
    "deleteUser",
    "screenshot: \"off\"",
    "trace: \"off\"",
    "video: \"off\"",
  ]) {
    if (!liveAuthTest.includes(requiredSnippet)) {
      addFailure(`${liveAuthTestPath} must include ${requiredSnippet}`);
    }
  }

  if (/storageState/.test(liveAuthTest)) {
    addFailure(`${liveAuthTestPath} must not persist auth storageState`);
  }

  if (/console\.(log|debug|info|warn|error)/.test(liveAuthTest)) {
    addFailure(`${liveAuthTestPath} must not log live auth details`);
  }
}

function checkAuthRedirectSafety() {
  const authFormPath = "src/components/auth/AuthForm.tsx";
  const callbackPath = "src/app/auth/callback/route.ts";

  for (const requiredPath of [authFormPath, callbackPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  for (const file of [authFormPath, callbackPath]) {
    const contents = read(file);

    if (!/isSafeInternalNextPath/.test(contents)) {
      addFailure(`${file} must validate auth redirect next paths`);
    }

    if (!/startsWith\("\/\/"\)/.test(contents)) {
      addFailure(`${file} must reject protocol-relative auth redirects`);
    }
  }
}

checkEnvTemplate();
checkClientBoundaries();
checkReadOnlyContracts();
checkAuthMetadataAndMockLabels();
checkSecretLikeValues();
checkRedactionHelper();
checkOwnerMappingCardinality();
checkSupabaseExecutionArtifacts();
checkPlatformRoutesStayDynamic();
checkPlatformAdminBootstrapScript();
checkSupabaseProxyLifecycle();
checkPlatformLiveAuthHarness();
checkAuthRedirectSafety();

if (failures.length > 0) {
  console.error("Security scan failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Security scan passed.");
