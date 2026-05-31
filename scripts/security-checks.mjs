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
  ".sql",
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
    ...listFiles("src/server/auth"),
    ...listFiles("src/server/shop-admin"),
    ...listFiles("src/server/platform-admin"),
    ...listFiles("src/lib/supabase"),
  ];
  const directMutationPattern = /\.(insert|update|delete|upsert)\s*\(/;
  const rpcPattern = /\.rpc\s*\(\s*["']([^"']+)["']/g;
  const allowedRpcsByFile = new Map([
    [
      "src/server/platform-admin/shop-actions.ts",
      new Set([
        "platform_create_shop",
        "platform_create_shop_with_pending_owner_invite",
        "platform_suspend_shop",
        "platform_reactivate_shop",
        "platform_restore_shop",
        "platform_soft_delete_shop",
        "platform_emergency_revoke_device",
      ]),
    ],
    [
      "src/server/platform-admin/admin-actions.ts",
      new Set([
        "platform_grant_platform_admin",
        "platform_revoke_platform_admin",
      ]),
    ],
    [
      "src/server/shop-admin/catalog-mutations.ts",
      new Set([
        "shop_catalog_create_product",
        "shop_catalog_update_product",
        "shop_catalog_archive_product",
        "shop_catalog_create_category",
        "shop_catalog_update_category",
        "shop_catalog_archive_category",
        "shop_catalog_create_supplier",
        "shop_catalog_update_supplier",
        "shop_catalog_archive_supplier",
      ]),
    ],
    [
      "src/server/shop-admin/staff-mutations.ts",
      new Set([
        "shop_staff_create",
        "shop_staff_reset_credential",
        "shop_staff_suspend",
        "shop_staff_reactivate",
        "shop_staff_archive",
      ]),
    ],
    [
      "src/server/shop-admin/device-mutations.ts",
      new Set([
        "shop_device_register",
        "shop_device_rename",
        "shop_device_revoke",
        "shop_device_reactivate",
      ]),
    ],
    [
      "src/server/shop-admin/member-mutations.ts",
      new Set([
        "shop_member_invite_profile",
        "shop_member_update_role",
        "shop_member_remove",
      ]),
    ],
    [
      "src/server/shop-admin/import-export-workbook.ts",
      new Set(["shop_admin_audit_event"]),
    ],
  ]);
  const allowedDirectMutationPatternFiles = new Set([
    "src/server/shop-admin/import-export-workbook.ts",
  ]);

  for (const file of serverFiles) {
    const contents = read(file);

    if (
      directMutationPattern.test(contents) &&
      !allowedDirectMutationPatternFiles.has(file)
    ) {
      addFailure(`${file} contains a forbidden direct Supabase mutation call`);
    }

    for (const match of contents.matchAll(rpcPattern)) {
      const rpcName = match[1];
      const isAllowedActionRpc = allowedRpcsByFile.get(file)?.has(rpcName);

      if (!isAllowedActionRpc) {
        addFailure(`${file} contains an unapproved Supabase RPC call: ${rpcName}`);
      }
    }

    if (/console\.(log|debug|info|warn|error)/.test(contents)) {
      addFailure(`${file} must not log potentially sensitive runtime errors`);
    }
  }
}

function checkTask006ControlledActionArtifacts() {
  const migrationPath =
    "supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql";
  const operationsPagePath = "src/app/platform/operations/page.tsx";
  const serverActionsPath = "src/app/platform/operations/actions.ts";
  const shopActionsPath = "src/server/platform-admin/shop-actions.ts";
  const auditEventsPath = "src/server/platform-admin/audit-events.ts";
  const platformDataPath = "src/components/platform/platformData.ts";

  for (const requiredPath of [
    migrationPath,
    operationsPagePath,
    serverActionsPath,
    shopActionsPath,
    auditEventsPath,
    platformDataPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const migration = read(migrationPath);
  const operationsPage = read(operationsPagePath);
  const serverActions = read(serverActionsPath);
  const shopActions = read(shopActionsPath);
  const auditEvents = read(auditEventsPath);
  const platformData = read(platformDataPath);

  for (const rpcName of [
    "platform_create_shop",
    "platform_suspend_shop",
    "platform_reactivate_shop",
    "platform_soft_delete_shop",
  ]) {
    if (!new RegExp(`create or replace function public\\.${rpcName}`).test(migration)) {
      addFailure(`${migrationPath} must create ${rpcName}`);
    }

    if (!new RegExp(`grant execute on function public\\.${rpcName}`).test(migration)) {
      addFailure(`${migrationPath} must grant execute on ${rpcName}`);
    }

    if (!shopActions.includes(`.rpc("${rpcName}"`)) {
      addFailure(`${shopActionsPath} must call approved RPC ${rpcName}`);
    }
  }

  if (!/set search_path = public, app_private, pg_temp/i.test(migration)) {
    addFailure(`${migrationPath} must control RPC search_path`);
  }

  if (!/app_private\.is_platform_admin\(\)/.test(migration)) {
    addFailure(`${migrationPath} must authorize through app_private.is_platform_admin()`);
  }

  if (
    /grant\s+(insert|update|delete|all).*on table public\.(profiles|shops|shop_members|platform_admins|shop_inventory_sources|audit_logs).*authenticated/i.test(
      migration,
    )
  ) {
    addFailure(`${migrationPath} must not grant direct table mutations to authenticated`);
  }

  if (/grant\s+\w+.*\s+to\s+anon/i.test(migration)) {
    addFailure(`${migrationPath} must not grant TASK-006 access to anon`);
  }

  if (!/^["']use server["'];?/m.test(serverActions)) {
    addFailure(`${serverActionsPath} must be a Server Actions module`);
  }

  if (!/revalidatePath\("\/platform\/operations"\)/.test(serverActions)) {
    addFailure(`${serverActionsPath} must revalidate /platform/operations`);
  }

  if (!/redirect\(\s*`\/platform\/operations\?operation=\$\{operation\}&result=\$\{result\.code\}`/.test(serverActions)) {
    addFailure(`${serverActionsPath} must redirect with a redacted action result`);
  }

  if (!/authorizeCurrentPlatformAdmin/.test(shopActions)) {
    addFailure(`${shopActionsPath} must authorize the current Platform Admin`);
  }

  if (/console\.(log|debug|info|warn|error)/.test(`${serverActions}\n${shopActions}`)) {
    addFailure("TASK-006 action files must not log runtime details");
  }

  for (const eventKey of [
    "platform.shop.create.attempt",
    "platform.shop.create.success",
    "platform.shop.create.failure",
    "platform.shop.owner.assign.attempt",
    "platform.shop.owner.assign.success",
    "platform.shop.owner.assign.failure",
    "platform.shop.suspend.attempt",
    "platform.shop.suspend.success",
    "platform.shop.suspend.failure",
    "platform.shop.reactivate.attempt",
    "platform.shop.reactivate.success",
    "platform.shop.reactivate.failure",
    "platform.shop.soft_delete.attempt",
    "platform.shop.soft_delete.success",
    "platform.shop.soft_delete.failure",
  ]) {
    if (!auditEvents.includes(eventKey)) {
      addFailure(`${auditEventsPath} must declare ${eventKey}`);
    }
  }

  if (/Safe Operations/.test(`${operationsPage}\n${platformData}`)) {
    addFailure("TASK-006 active UI must not label mutative controls as Safe Operations");
  }

  for (const requiredSnippet of [
    "ActionResultBanner",
    'aria-live="polite"',
    "Type shop code to suspend",
    "Type shop code to reactivate",
    "Type shop code to archive",
  ]) {
    if (!operationsPage.includes(requiredSnippet)) {
      addFailure(`${operationsPagePath} must include ${requiredSnippet}`);
    }
  }
}

function checkTask007AuthRoutingArtifacts() {
  const resolverPath = "src/server/auth/admin-routing.ts";
  const rootPagePath = "src/app/page.tsx";
  const platformLayoutPath = "src/app/platform/layout.tsx";
  const shopLayoutPath = "src/app/shop/layout.tsx";
  const shopPagePath = "src/app/shop/page.tsx";
  const accessStatePath = "src/components/auth/AccessState.tsx";
  const authFormPath = "src/components/auth/AuthForm.tsx";
  const callbackPath = "src/app/auth/callback/route.ts";

  for (const requiredPath of [
    resolverPath,
    rootPagePath,
    platformLayoutPath,
    shopLayoutPath,
    shopPagePath,
    accessStatePath,
    authFormPath,
    callbackPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const resolver = read(resolverPath);
  const rootPage = read(rootPagePath);
  const platformLayout = read(platformLayoutPath);
  const shopLayout = read(shopLayoutPath);
  const shopPage = read(shopPagePath);
  const accessState = read(accessStatePath);
  const authForm = read(authFormPath);
  const callback = read(callbackPath);

  if (!/import "server-only"/.test(resolver)) {
    addFailure(`${resolverPath} must be server-only`);
  }

  for (const requiredSnippet of [
    "auth.getUser()",
    '.from("platform_admins")',
    '.from("shop_members")',
    "shop_owner",
    "shop_manager",
    "viewer",
    "revoked",
  ]) {
    if (!resolver.includes(requiredSnippet)) {
      addFailure(`${resolverPath} must include ${requiredSnippet}`);
    }
  }

  if (/user_metadata|raw_user_meta_data/.test(resolver)) {
    addFailure(`${resolverPath} must not authorize from auth metadata`);
  }

  if (!/getAdminRouteDestination/.test(rootPage) || !/redirect\(destination\)/.test(rootPage)) {
    addFailure(`${rootPagePath} must route valid admin roles server-side`);
  }

  if (!/status !== "platform_admin"/.test(platformLayout) || !/AccessState/.test(platformLayout)) {
    addFailure(`${platformLayoutPath} must block non-Platform Admin access server-side`);
  }

  if (!/status !== "shop_admin"/.test(shopLayout) || !/AccessState/.test(shopLayout)) {
    addFailure(`${shopLayoutPath} must block non-Shop Admin access server-side`);
  }

  if (!/ShopSectionPage/.test(shopPage)) {
    addFailure(`${shopPagePath} must render the protected Shop Admin shell page`);
  }

  for (const statusName of [
    "not_configured",
    "no_session",
    "revoked",
    "viewer_only",
    "no_shop",
    "error",
  ]) {
    if (!accessState.includes(statusName)) {
      addFailure(`${accessStatePath} must render ${statusName}`);
    }
  }

  if (!authForm.includes('? requested : "/"')) {
    addFailure(`${authFormPath} must default post-login routing to /`);
  }

  if (!callback.includes('? value : "/"')) {
    addFailure(`${callbackPath} must default callback routing to /`);
  }
}

function checkTask008ShopShellArtifacts() {
  const shopLayoutPath = "src/app/shop/layout.tsx";
  const shopShellPath = "src/components/shop/ShopShell.tsx";
  const shopSectionPagePath = "src/components/shop/ShopSectionPage.tsx";
  const shopSectionsPath = "src/components/shop/shopSections.ts";
  const shopRoutePaths = [
    "src/app/shop/page.tsx",
    "src/app/shop/overview/page.tsx",
    "src/app/shop/products/page.tsx",
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/import-export/page.tsx",
    "src/app/shop/members/page.tsx",
    "src/app/shop/roles/page.tsx",
    "src/app/shop/staff/page.tsx",
    "src/app/shop/devices/page.tsx",
    "src/app/shop/settings/page.tsx",
    "src/app/shop/history/page.tsx",
    "src/app/shop/audit/page.tsx",
  ];
  const requiredPaths = [
    shopLayoutPath,
    shopShellPath,
    shopSectionPagePath,
    shopSectionsPath,
    ...shopRoutePaths,
  ];
  const shopComponentFiles = listFiles("src/components/shop");

  for (const requiredPath of requiredPaths) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const layout = read(shopLayoutPath);
  const shell = read(shopShellPath);
  const sectionPage = read(shopSectionPagePath);
  const sections = read(shopSectionsPath);

  if (!/resolveCurrentShopAdminShellAccess/.test(layout) || !/status !== "shop_admin"/.test(layout)) {
    addFailure(`${shopLayoutPath} must protect Shop Admin routes server-side`);
  }

  if (!/<ShopShell/.test(layout) || !/export const dynamic = ["']force-dynamic["']/.test(layout)) {
    addFailure(`${shopLayoutPath} must render the ShopShell dynamically after authorization`);
  }

  if (!/^["']use client["'];?/m.test(shell) || !/usePathname/.test(shell)) {
    addFailure(`${shopShellPath} must keep pathname-aware navigation in a client boundary`);
  }

  if (!/aria-label="Shop sections"/.test(shell) || !/Skip to shop content/.test(shell)) {
    addFailure(`${shopShellPath} must expose accessible Shop Admin navigation`);
  }

  for (const file of shopComponentFiles) {
    const contents = read(file);

    if (/@\/server|src\/server|@supabase\//.test(contents)) {
      addFailure(`${file} must not import server-only or Supabase modules into the Shop UI boundary`);
    }
  }

  if (!/No live shop rows are available in this section yet/.test(sectionPage)) {
    addFailure(`${shopSectionPagePath} must label placeholders as non-live`);
  }

  for (const routePath of shopRoutePaths) {
    const page = read(routePath);

    if (!/export const dynamic = ["']force-dynamic["']/.test(page)) {
      addFailure(`${routePath} must force dynamic rendering for auth-scoped Shop Admin UI`);
    }
  }

  for (const href of [
    "/shop/overview",
    "/shop/products",
    "/shop/categories",
    "/shop/suppliers",
    "/shop/import-export",
    "/shop/members",
    "/shop/roles",
    "/shop/staff",
    "/shop/devices",
    "/shop/settings",
    "/shop/history",
    "/shop/audit",
  ]) {
    if (!sections.includes(`href: "${href}"`)) {
      addFailure(`${shopSectionsPath} must include ${href}`);
    }
  }
}

function checkTask009ShopSwitcherArtifacts() {
  const resolverPath = "src/server/shop-admin/shop-access.ts";
  const shopLayoutPath = "src/app/shop/layout.tsx";
  const shopShellPath = "src/components/shop/ShopShell.tsx";

  for (const requiredPath of [resolverPath, shopLayoutPath, shopShellPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const resolver = read(resolverPath);
  const layout = read(shopLayoutPath);
  const shell = read(shopShellPath);

  if (!/import "server-only"/.test(resolver)) {
    addFailure(`${resolverPath} must be server-only`);
  }

  for (const requiredSnippet of [
    "auth.getUser()",
    '.from("shop_members")',
    '.from("shops")',
    '.eq("profile_id", userId)',
    '.eq("membership_status", "active")',
    "shop_owner",
    "shop_manager",
    "availableShops",
    "selectedShop",
  ]) {
    if (!resolver.includes(requiredSnippet)) {
      addFailure(`${resolverPath} must include ${requiredSnippet}`);
    }
  }

  if (/user_metadata|raw_user_meta_data/.test(resolver)) {
    addFailure(`${resolverPath} must not authorize from auth metadata`);
  }

  if (/resolveCurrentAdminRouteAccess|\.from\("platform_admins"\)/.test(resolver)) {
    addFailure(`${resolverPath} must resolve Shop Admin membership independently from Platform Admin routing`);
  }

  if (/Promise\.all\s*\(/.test(resolver)) {
    addFailure(`${resolverPath} must avoid parallel remote Supabase reads`);
  }

  if (!/resolveCurrentShopAdminShellAccess/.test(layout)) {
    addFailure(`${shopLayoutPath} must use the Shop Admin shell access resolver`);
  }

  if (!/availableShops=\{access\.availableShops\}/.test(layout)) {
    addFailure(`${shopLayoutPath} must pass only server-authorized shops to ShopShell`);
  }

  for (const requiredSnippet of [
    "availableShops",
    "selectedShopId",
    "buildShopHref",
    "useSearchParams",
    "useRouter",
    'aria-label="Switch shop"',
    "shop_id",
  ]) {
    if (!shell.includes(requiredSnippet)) {
      addFailure(`${shopShellPath} must include ${requiredSnippet}`);
    }
  }

  if (!/href=\{buildShopHref\(item\.href\)\}/.test(shell)) {
    addFailure(`${shopShellPath} must preserve selected shop_id across section links`);
  }

  if (/@\/server|src\/server|@supabase\//.test(shell)) {
    addFailure(`${shopShellPath} must not import server-only or Supabase modules`);
  }
}

function checkTask010ShopReadModelArtifacts() {
  const readModelPath = "src/server/shop-admin/read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const sectionPagePath = "src/components/shop/ShopSectionPage.tsx";
  const shopPagePath = "src/app/shop/page.tsx";
  const overviewPagePath = "src/app/shop/overview/page.tsx";
  const membersPagePath = "src/app/shop/members/page.tsx";
  const auditPagePath = "src/app/shop/audit/page.tsx";
  const shellPath = "src/components/shop/ShopShell.tsx";

  for (const requiredPath of [
    readModelPath,
    sectionDataPath,
    sectionPagePath,
    shopPagePath,
    overviewPagePath,
    membersPagePath,
    auditPagePath,
    shellPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const readModel = read(readModelPath);
  const sectionData = read(sectionDataPath);
  const sectionPage = read(sectionPagePath);
  const shopPage = read(shopPagePath);
  const overviewPage = read(overviewPagePath);
  const membersPage = read(membersPagePath);
  const auditPage = read(auditPagePath);
  const shell = read(shellPath);

  for (const requiredSnippet of [
    'import "server-only"',
    "createSupabaseServerClient",
    "resolveCurrentShopAdminShellAccess",
    'status: "not_configured"',
    'status: "unauthorized"',
    'status: "empty"',
    'status: "error"',
    '.from("shops")',
    '.from("shop_members")',
    '.from("audit_logs")',
    '.eq("shop_id", selectedShop.shopId)',
    '.eq("scope", "shop")',
  ]) {
    if (!readModel.includes(requiredSnippet)) {
      addFailure(`${readModelPath} must include ${requiredSnippet}`);
    }
  }

  if (/user_metadata|raw_user_meta_data/.test(readModel)) {
    addFailure(`${readModelPath} must not authorize from auth metadata`);
  }

  if (/Promise\.all\s*\(/.test(readModel)) {
    addFailure(`${readModelPath} must avoid parallel remote Supabase reads`);
  }

  if (/\.(insert|update|delete|upsert|rpc)\s*\(/.test(readModel)) {
    addFailure(`${readModelPath} must stay read-only`);
  }

  if (/\.eq\("shop_id",\s*(requestedShopId|selectedShopId)\)/.test(readModel)) {
    addFailure(`${readModelPath} must not authorize directly from shop_id query params`);
  }

  if (!/availableShops\.find/.test(readModel) || !/access\.selectedShop/.test(readModel)) {
    addFailure(`${readModelPath} must select shops from server-authorized memberships`);
  }

  for (const requiredSnippet of [
    "getShopAdminReadModel",
    "buildOverviewSection",
    "buildMembersSection",
    "buildAuditSection",
    "No live shop rows are visible",
  ]) {
    if (!sectionData.includes(requiredSnippet)) {
      addFailure(`${sectionDataPath} must include ${requiredSnippet}`);
    }
  }

  if (
    !/Live shop data/.test(`${sectionData}\n${sectionPage}`) ||
    !/Live rows for the selected shop/.test(`${sectionData}\n${sectionPage}`)
  ) {
    addFailure(`${sectionDataPath} and ${sectionPagePath} must render live data or declared empty states`);
  }

  if (/TASK-010|TASK-008/.test(`${sectionData}\n${sectionPage}`)) {
    addFailure(`${sectionDataPath} and ${sectionPagePath} must not render task IDs in Shop Admin UI copy`);
  }

  for (const [pagePath, contents, sectionKey] of [
    [shopPagePath, shopPage, "overview"],
    [overviewPagePath, overviewPage, "overview"],
    [membersPagePath, membersPage, "members"],
    [auditPagePath, auditPage, "audit"],
  ]) {
    if (!contents.includes("searchParams")) {
      addFailure(`${pagePath} must accept searchParams as navigation state only`);
    }

    if (!contents.includes(`getShopSectionForRequest(\n    "${sectionKey}"`)) {
      addFailure(`${pagePath} must load the ${sectionKey} section through the server read model`);
    }
  }

  if (/@\/server|src\/server|@supabase\//.test(shell)) {
    addFailure(`${shellPath} must not import server-only or Supabase modules`);
  }

  if (/mock|fake|demo/i.test(`${readModel}\n${sectionData}\n${sectionPage}`)) {
    addFailure("TASK-010 read surfaces must not present fake data as live data");
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
    "src/app/platform/layout.tsx",
    "src/app/platform/page.tsx",
    "src/app/platform/users/page.tsx",
    "src/app/platform/shops/page.tsx",
    "src/app/platform/audit/page.tsx",
    "src/app/platform/system/page.tsx",
    "src/app/platform/operations/page.tsx",
    "src/app/platform/overview/page.tsx",
    "src/app/platform/users/[profileId]/page.tsx",
    "src/app/platform/shops/[shopId]/page.tsx",
    "src/app/platform/shops/new/page.tsx",
    "src/app/platform/provisioning/page.tsx",
    "src/app/platform/admins/page.tsx",
    "src/app/platform/audit/[eventId]/page.tsx",
    "src/app/platform/data/page.tsx",
    "src/app/platform/devices/page.tsx",
    "src/app/platform/sync/page.tsx",
    "src/app/platform/history/page.tsx",
    "src/app/platform/support/page.tsx",
    "src/app/shop/layout.tsx",
    "src/app/shop/page.tsx",
    "src/app/shop/overview/page.tsx",
    "src/app/shop/products/page.tsx",
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/import-export/page.tsx",
    "src/app/shop/members/page.tsx",
    "src/app/shop/roles/page.tsx",
    "src/app/shop/staff/page.tsx",
    "src/app/shop/devices/page.tsx",
    "src/app/shop/settings/page.tsx",
    "src/app/shop/history/page.tsx",
    "src/app/shop/audit/page.tsx",
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
    addFailure("test:ui-live-auth must force a fresh web server");
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

function checkTask012PosStaffCredentialPlanning() {
  const taskPath = "docs/TASKS/TASK-012-pos-staff-credential-planning.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-012/README.md";
  const masterPlanPath = "docs/MASTER-PLAN.md";
  const staffPagePath = "src/app/shop/staff/page.tsx";
  const typesPath = "src/lib/supabase/database.types.ts";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    masterPlanPath,
    staffPagePath,
    typesPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read(masterPlanPath);
  const staffPage = read(staffPagePath);
  const generatedTypes = read(typesPath);
  const taskAndEvidence = `${task}\n${evidence}`;
  const migrations = listFiles("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .map((file) => read(file))
    .join("\n");
  const serverShopAdmin = listFiles("src/server/shop-admin")
    .map((file) => read(file))
    .join("\n");
  const clientStaffUi = `${staffPage}\n${read("src/components/shop/shopSections.ts")}`;
  const task014FoundationPresent = existsSync(
    join(root, "docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md"),
  );
  const task015CompletionPresent = existsSync(
    join(root, "docs/TASKS/TASK-015-complete-shop-admin-console.md"),
  );

  for (const requiredSnippet of [
    "Stato: `DONE`",
    "Fase attuale: `DONE_RECONCILED`",
    "Nessun login POS reale",
    "Nessun PIN/password reale",
    "Nessuna migration esecutiva",
    "Argon2id",
    "scrypt",
    "pgcrypto",
    "unique (shop_id, staff_code)",
    "credential_hash non deve essere selezionabile",
    "<TEMP_CREDENTIAL_SHOWN_ONCE>",
    "<NOT_STORED>",
    "<REDACTED>",
    "Account personale web e staff POS restano identita separate",
    "modulo interno della Shop Admin Console",
    "must_change_credential",
    "failed_attempts",
    "locked_until",
  ]) {
    if (!task.includes(requiredSnippet)) {
      addFailure(`${taskPath} must document ${requiredSnippet}`);
    }
  }

  if (!/DONE_RECONCILED/.test(evidence)) {
    addFailure(`${evidencePath} must record the TASK-012 DONE reconciliation`);
  }

  if (!/TASK-012 - POS Staff Credential Planning \/ Schema Discovery[\s\S]*Stato: `DONE`/.test(masterPlan)) {
    addFailure(`${masterPlanPath} must keep TASK-012 reconciled as DONE`);
  }

  const weakCredentialAlternation = [
    "12" + "34",
    "00" + "00",
    "pass" + "word",
    "ad" + "min",
  ].join("|");
  const unsafeCredentialExamplePatterns = [
    new RegExp(
      `(?:pin|password|credential|credenziale)\\s*(?:=|:|is|e|è)\\s*["'\`]?(?:${weakCredentialAlternation})["'\`]?`,
      "i",
    ),
    new RegExp(
      `["'\`](?:${weakCredentialAlternation})["'\`]\\s*(?:as|come)\\s*(?:pin|password|credential|credenziale)`,
      "i",
    ),
    new RegExp(
      `(?:pin|password|credential|credenziale)\\s+di\\s+esempio\\s+["'\`]?(?:${weakCredentialAlternation})["'\`]?`,
      "i",
    ),
  ];

  for (const pattern of unsafeCredentialExamplePatterns) {
    if (pattern.test(taskAndEvidence)) {
      addFailure(`${taskPath} and ${evidencePath} must use redacted placeholders instead of dangerous credential examples`);
    }
  }

  const hardcodedStaffCredentialPatterns = [
    new RegExp(
      `(?:pin|staffPin|staff_pin|password|credential|staffCredential|staff_credential)\\s*[:=]\\s*["'\`](?:${weakCredentialAlternation})["'\`]`,
      "i",
    ),
    /formData\.get\(["'](?:pin|staff_pin|staffPassword|staffCredential|credential)["']\)/i,
  ];

  for (const sourcePath of listFiles("src")) {
    const source = read(sourcePath);

    for (const pattern of hardcodedStaffCredentialPatterns) {
      if (pattern.test(source)) {
        addFailure(`${sourcePath} appears to introduce staff credential runtime handling during TASK-012 planning`);
      }
    }
  }

  if (
    !task015CompletionPresent &&
    /action=|formAction|createStaff|resetCredential/i.test(staffPage)
  ) {
    addFailure(`${staffPagePath} must remain non-mutative after TASK-012/TASK-014`);
  }

  if (!task014FoundationPresent) {
    if (/staff_accounts:\s*\{/.test(generatedTypes)) {
      addFailure(`${typesPath} must not include staff_accounts during TASK-012 planning`);
    }

    if (/create\s+table\s+(if\s+not\s+exists\s+)?public\.staff_accounts/i.test(migrations)) {
      addFailure("TASK-012 must not create public.staff_accounts");
    }

    if (/credential_hash/i.test(migrations)) {
      addFailure("TASK-012 must not introduce credential_hash in migrations");
    }

    if (/staff_accounts|staff_code|credential_hash|pin_hash|password_hash|shop_staff_/i.test(serverShopAdmin)) {
      addFailure("TASK-012 must not introduce staff credential runtime code under src/server/shop-admin");
    }
  }

  if (/credential_hash|pin_hash|password_hash/i.test(clientStaffUi)) {
    addFailure("Shop Admin UI must not expose credential hash fields");
  }
}

function checkTask013UiPolishArtifacts() {
  const taskPath = "docs/TASKS/TASK-013-admin-web-ui-ux-professional-polish.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-013/README.md";
  const masterPlanPath = "docs/MASTER-PLAN.md";
  const shopShellPath = "src/components/shop/ShopShell.tsx";
  const shopSectionPagePath = "src/components/shop/ShopSectionPage.tsx";
  const platformOperationsPath = "src/app/platform/operations/page.tsx";
  const platformTablePath = "src/components/platform/components/DataTable.tsx";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    masterPlanPath,
    shopShellPath,
    shopSectionPagePath,
    platformOperationsPath,
    platformTablePath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read(masterPlanPath);
  const shopShell = read(shopShellPath);
  const shopSectionPage = read(shopSectionPagePath);
  const platformOperations = read(platformOperationsPath);
  const platformTable = read(platformTablePath);

  for (const requiredSnippet of [
    "UI/UX audit matrix",
    "Stato: `DONE`",
    "Fase attuale: `DONE_RECONCILED`",
    "Nessun commit",
    "Nessun push",
  ]) {
    if (!task.includes(requiredSnippet)) {
      addFailure(`${taskPath} must include ${requiredSnippet}`);
    }
  }

  if (!/https:\/\/www\.figma\.com\/design\/nw9wx6Q7jutwLGPHatGlWq/.test(evidence)) {
    addFailure(`${evidencePath} must include the TASK-013 Figma file link`);
  }

  if (!/TASK-013 - Admin Web UI\/UX Professional Audit & Polish[\s\S]*Stato: `DONE`/.test(masterPlan)) {
    addFailure(`${masterPlanPath} must keep TASK-013 reconciled as DONE`);
  }

  if (
    !/Stato globale attuale: `IDLE`/.test(masterPlan) &&
    !/Task attivo: `TASK-014 - Integrated Authenticated QA, Design System, POS Staff Foundation`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-015 - Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-016 - Complete Platform Admin Console`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-017 - Shop Business Completion`/.test(
      masterPlan,
    )
  ) {
    addFailure(`${masterPlanPath} must either be IDLE after TASK-013 or track a later active task`);
  }

  for (const requiredSnippet of [
    'role="group"',
    'aria-labelledby="selected-shop-context-label selected-shop-summary"',
    'id="selected-shop-summary"',
    "selectedShop.shopName",
    "selectedShop.shopCode",
    "overflow-x-auto",
    "lg:grid",
    "whitespace-nowrap",
  ]) {
    if (!shopShell.includes(requiredSnippet)) {
      addFailure(`${shopShellPath} must include ${requiredSnippet}`);
    }
  }

  if (
    !/Planned state/.test(shopSectionPage) ||
    !/break-words/.test(`${shopSectionPage}\n${platformTable}\n${read("src/components/admin/AdminDataTable.tsx")}`)
  ) {
    addFailure(`${shopSectionPagePath} must make placeholder state and long table values clearer`);
  }

  if (!/break-words/.test(platformTable)) {
    addFailure(`${platformTablePath} must wrap long table values`);
  }

  if (!/Use development-safe test shops only/.test(platformOperations)) {
    addFailure(`${platformOperationsPath} must keep operation warning copy clear`);
  }

  if (/TASK006_TEST_/.test(platformOperations)) {
    addFailure(`${platformOperationsPath} must not expose task-internal test prefixes in UI copy`);
  }
}

function findTask014MigrationPath() {
  return listFiles("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .find((file) => file.endsWith("_task_014_pos_staff_foundation.sql"));
}

function checkTask014DesignSystem() {
  const componentPaths = [
    "src/components/admin/PageHeader.tsx",
    "src/components/admin/SectionCard.tsx",
    "src/components/admin/EmptyState.tsx",
    "src/components/admin/StatusBadge.tsx",
    "src/components/admin/AdminDataTable.tsx",
    "src/components/admin/GuardrailNotice.tsx",
  ];
  const platformPagePath = "src/components/platform/PlatformPage.tsx";
  const shopPagePath = "src/components/shop/ShopSectionPage.tsx";

  for (const requiredPath of [
    ...componentPaths,
    platformPagePath,
    shopPagePath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const sharedUi = componentPaths.map((file) => read(file)).join("\n");
  const platformPage = read(platformPagePath);
  const shopPage = read(shopPagePath);

  for (const requiredSnippet of [
    "caption",
    "break-words",
    "emptyState",
    "aria-labelledby",
    "StatusBadge",
    "GuardrailNotice",
  ]) {
    if (!sharedUi.includes(requiredSnippet)) {
      addFailure(`TASK-014 shared Admin components must include ${requiredSnippet}`);
    }
  }

  for (const requiredImport of [
    "@/components/admin/PageHeader",
    "@/components/admin/SectionCard",
    "@/components/admin/AdminDataTable",
  ]) {
    if (!platformPage.includes(requiredImport)) {
      addFailure(`${platformPagePath} must use ${requiredImport}`);
    }

    if (!shopPage.includes(requiredImport)) {
      addFailure(`${shopPagePath} must use ${requiredImport}`);
    }
  }

  if (/^["']use client["'];?/m.test(sharedUi)) {
    addFailure("TASK-014 shared Admin components must stay server-safe");
  }

  if (/@supabase\/|@\/server\/|src\/server\//.test(sharedUi)) {
    addFailure("TASK-014 shared Admin components must not import Supabase or server modules");
  }
}

function checkTask014PosStaffFoundation() {
  const taskPath =
    "docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-014/README.md";
  const credentialModulePath = "src/server/shop-admin/staff-credentials.ts";
  const readModelPath = "src/server/shop-admin/staff-read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const staffPagePath = "src/app/shop/staff/page.tsx";
  const typesPath = "src/lib/supabase/database.types.ts";
  const migrationPath = findTask014MigrationPath();

  for (const requiredPath of [
    taskPath,
    evidencePath,
    credentialModulePath,
    readModelPath,
    sectionDataPath,
    staffPagePath,
    typesPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  if (!migrationPath) {
    addFailure("TASK-014 staff foundation migration is missing");
    return;
  }

  const task = read(taskPath);
  const migration = read(migrationPath);
  const credentialModule = read(credentialModulePath);
  const readModel = read(readModelPath);
  const sectionData = read(sectionDataPath);
  const staffPage = read(staffPagePath);
  const types = read(typesPath);
  const clientStaffUi = [
    staffPagePath,
    "src/components/shop/ShopSectionPage.tsx",
    "src/components/shop/shopSections.ts",
  ]
    .map((file) => read(file))
    .join("\n");

  for (const requiredSnippet of [
    "Nessun login POS reale",
    "Nessuno staff account reale creato",
    "Nessuna esposizione di `credential_hash`",
    "Node `crypto.scrypt`",
  ]) {
    if (!task.includes(requiredSnippet)) {
      addFailure(`${taskPath} must document ${requiredSnippet}`);
    }
  }

  for (const requiredSql of [
    "create table if not exists public.staff_accounts",
    "alter table public.staff_accounts enable row level security",
    "create view public.staff_accounts_safe",
    "with (security_invoker = true)",
    "app_private.is_active_shop_staff_admin_member",
    "role_key in ('cashier', 'manager', 'viewer')",
    "status in ('pending_credential', 'active', 'suspended', 'archived')",
  ]) {
    if (!migration.includes(requiredSql)) {
      addFailure(`${migrationPath} must include ${requiredSql}`);
    }
  }

  const safeViewDefinition = migration.split("create view public.staff_accounts_safe")[1] ?? "";

  if (/credential_hash/i.test(safeViewDefinition)) {
    addFailure(`${migrationPath} must not expose credential_hash through staff_accounts_safe`);
  }

  if (/grant\s+(insert|update|delete|all)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i.test(migration)) {
    addFailure(`${migrationPath} must not grant direct staff mutations to authenticated`);
  }

  if (/grant\s+.*on (table )?public\.staff_accounts[\s\S]*to anon/i.test(migration)) {
    addFailure(`${migrationPath} must not grant staff table access to anon`);
  }

  for (const requiredSnippet of [
    'import "server-only"',
    "scrypt",
    "timingSafeEqual",
    "hashStaffCredential",
    "verifyStaffCredential",
    "needsStaffCredentialRehash",
    "STAFF_CREDENTIAL_SCHEME",
  ]) {
    if (!credentialModule.includes(requiredSnippet)) {
      addFailure(`${credentialModulePath} must include ${requiredSnippet}`);
    }
  }

  if (/console\.(log|debug|info|warn|error)/.test(credentialModule)) {
    addFailure(`${credentialModulePath} must not log credential details`);
  }

  if (/["'`](?:1234|0000|password|test123|admin)["'`]/i.test(credentialModule)) {
    addFailure(`${credentialModulePath} must not hardcode dangerous credential examples`);
  }

  for (const requiredSnippet of [
    'import "server-only"',
    '.from("staff_accounts_safe")',
    '.eq("shop_id", selectedShop.shopId)',
  ]) {
    if (!readModel.includes(requiredSnippet)) {
      addFailure(`${readModelPath} must include ${requiredSnippet}`);
    }
  }

  if (/credential_hash|select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/.test(readModel)) {
    addFailure(`${readModelPath} must read only safe staff fields`);
  }

  if (!sectionData.includes("buildStaffSection") || !sectionData.includes("getShopStaffReadModel")) {
    addFailure(`${sectionDataPath} must build staff UI from the safe read model`);
  }

  if (!/getShopSectionForRequest\(\s*"staff"/.test(staffPage)) {
    addFailure(`${staffPagePath} must load staff through getShopSectionForRequest`);
  }

  if (!/staff_accounts:\s*\{/.test(types) || !/staff_accounts_safe:\s*\{/.test(types)) {
    addFailure(`${typesPath} must include staff_accounts and staff_accounts_safe`);
  }

  if (/credential_hash|pin_hash|password_hash|hashStaffCredential|verifyStaffCredential/.test(clientStaffUi)) {
    addFailure("Shop Staff UI must not expose credential hashes or hashing functions");
  }

  if (/pos.*login|login.*pos/i.test(read("src/app/shop/staff/page.tsx"))) {
    addFailure("TASK-014 must not implement POS login UI");
  }
}

function checkTask014AuthenticatedQaHarness() {
  const specPath = "tests/e2e/platform-admin-live-auth.spec.ts";
  const packagePath = "package.json";

  for (const requiredPath of [specPath, packagePath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const spec = read(specPath);
  const pkg = JSON.parse(read(packagePath));

  if (!/platform-admin-live-auth\.spec\.ts/.test(pkg.scripts["test:ui-live-auth"] ?? "")) {
    addFailure("package.json must keep test:ui-live-auth wired to platform-admin-live-auth.spec.ts");
  }

  for (const requiredSnippet of [
    "CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST",
    "createTemporaryPlatformAdminCredentials",
    "createTemporaryShopAdminFixture",
    "deleteUser",
    "cleanup",
    'screenshot: "off"',
    'trace: "off"',
    'video: "off"',
    "/platform/users",
    "/shop/overview",
    "/shop/staff",
    "browser-platform-authenticated.png",
    "browser-shop-overview-authenticated.png",
    "browser-shop-staff-authenticated.png",
  ]) {
    if (!spec.includes(requiredSnippet)) {
      addFailure(`${specPath} must include ${requiredSnippet}`);
    }
  }

  if (/storageState/.test(spec)) {
    addFailure(`${specPath} must not persist auth storageState`);
  }

  if (/console\.(log|debug|info|warn|error)/.test(spec)) {
    addFailure(`${specPath} must not log live auth details`);
  }

  if (/magic link|access_token|refresh_token/i.test(spec)) {
    addFailure(`${specPath} must not print or store auth tokens or magic links`);
  }
}

function checkTask015ShopAdminConsole() {
  const taskPath = "docs/TASKS/TASK-015-complete-shop-admin-console.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-015/README.md";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const sectionsPath = "src/components/shop/shopSections.ts";
  const historyDetailRoutePath = "src/app/shop/history/[entryId]/page.tsx";
  const serverModulePaths = [
    "src/server/shop-admin/inventory-read-model.ts",
    "src/server/shop-admin/history-read-model.ts",
    "src/server/shop-admin/device-read-model.ts",
    "src/server/shop-admin/import-export-readiness.ts",
    "src/server/shop-admin/permissions.ts",
  ];
  const mutationModulePaths = [
    "src/server/shop-admin/catalog-mutations.ts",
    "src/server/shop-admin/staff-mutations.ts",
    "src/server/shop-admin/device-mutations.ts",
    "src/server/shop-admin/import-export-workbook.ts",
    "src/app/shop/actions.ts",
  ];
  const panelPaths = [
    "src/app/shop/_components/CatalogActionPanel.tsx",
    "src/app/shop/_components/ImportExportActionPanel.tsx",
    "src/app/shop/_components/StaffActionPanel.tsx",
    "src/app/shop/_components/DeviceActionPanel.tsx",
  ];
  const importExportRoutePaths = [
    "src/app/shop/import-export/preview/route.ts",
    "src/app/shop/import-export/apply/route.ts",
    "src/app/shop/import-export/export/route.ts",
    "src/app/shop/import-export/template/route.ts",
  ];
  const routeChecks = [
    ["products", "src/app/shop/products/page.tsx"],
    ["categories", "src/app/shop/categories/page.tsx"],
    ["suppliers", "src/app/shop/suppliers/page.tsx"],
    ["importExport", "src/app/shop/import-export/page.tsx"],
    ["roles", "src/app/shop/roles/page.tsx"],
    ["devices", "src/app/shop/devices/page.tsx"],
    ["settings", "src/app/shop/settings/page.tsx"],
    ["history", "src/app/shop/history/page.tsx"],
  ];

  for (const requiredPath of [
    taskPath,
    evidencePath,
    sectionDataPath,
    sectionsPath,
    historyDetailRoutePath,
    ...serverModulePaths,
    ...mutationModulePaths,
    ...panelPaths,
    ...importExportRoutePaths,
    ...routeChecks.map(([, routePath]) => routePath),
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const sectionData = read(sectionDataPath);
  const sections = read(sectionsPath);
  const serverModules = Object.fromEntries(
    serverModulePaths.map((modulePath) => [modulePath, read(modulePath)]),
  );
  const mutationModules = Object.fromEntries(
    mutationModulePaths.map((modulePath) => [modulePath, read(modulePath)]),
  );
  const task015ServerSurface = [
    sectionData,
    ...Object.values(serverModules),
    ...Object.values(mutationModules),
  ].join("\n");
  const task015ReadSurface = [
    sectionData,
    ...Object.values(serverModules),
  ].join("\n");
  const task015ClientSurface = [
    sectionsPath,
    "src/components/shop/ShopSectionPage.tsx",
    historyDetailRoutePath,
    ...panelPaths,
    ...routeChecks.map(([, routePath]) => routePath),
  ]
    .map((file) => read(file))
    .join("\n");

  if (!/TASK-015/.test(task) || !/Complete Shop Admin Console/.test(task)) {
    addFailure(`${taskPath} must describe TASK-015`);
  }

  if (!/TASK-015/.test(evidence) || !/Branch execution/.test(evidence)) {
    addFailure(`${evidencePath} must record TASK-015 execution evidence`);
  }

  for (const [modulePath, contents] of Object.entries(serverModules)) {
    if (!/import "server-only"/.test(contents)) {
      addFailure(`${modulePath} must be server-only`);
    }

    if (/select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/.test(contents)) {
      addFailure(`${modulePath} must stay read-only and avoid select-star`);
    }
  }

  for (const [modulePath, contents] of Object.entries(mutationModules)) {
    if (
      modulePath.startsWith("src/server/") &&
      !/import "server-only"/.test(contents)
    ) {
      addFailure(`${modulePath} must be server-only`);
    }

    if (/select\("\*"\)|\.from\([^)]+\)[\s\S]*\.(insert|update|delete|upsert)\s*\(/.test(contents)) {
      addFailure(`${modulePath} must avoid direct table mutations and select-star`);
    }
  }

  const inventoryReadModel = serverModules["src/server/shop-admin/inventory-read-model.ts"];
  const historyReadModel = serverModules["src/server/shop-admin/history-read-model.ts"];
  const deviceReadModel = serverModules["src/server/shop-admin/device-read-model.ts"];
  const importExportReadiness =
    serverModules["src/server/shop-admin/import-export-readiness.ts"];
  const permissions = serverModules["src/server/shop-admin/permissions.ts"];
  const catalogMutations =
    mutationModules["src/server/shop-admin/catalog-mutations.ts"];
  const staffMutations =
    mutationModules["src/server/shop-admin/staff-mutations.ts"];
  const deviceMutations =
    mutationModules["src/server/shop-admin/device-mutations.ts"];
  const importExportWorkbook =
    mutationModules["src/server/shop-admin/import-export-workbook.ts"];
  const shopActions = mutationModules["src/app/shop/actions.ts"];

  for (const requiredSnippet of [
    '.from("shop_inventory_sources")',
    '.eq("shop_id", selectedShop.shopId)',
    '.eq("mapping_state", "mapped")',
    '.from("inventory_products")',
    '.from("inventory_categories")',
    '.from("inventory_suppliers")',
    '.eq("owner_user_id", mapping.ownerUserId)',
  ]) {
    if (!inventoryReadModel.includes(requiredSnippet)) {
      addFailure(`inventory-read-model.ts must include ${requiredSnippet}`);
    }
  }

  if (/\.eq\("shop_id",\s*(requestedShopId|selectedShopId)\)/.test(inventoryReadModel)) {
    addFailure("TASK-015 inventory reads must not authorize from query params");
  }

  for (const requiredSnippet of [
    '.from("sync_events")',
    '.from("shared_sheet_sessions")',
    "redactShopAdminJson",
    "getShopHistoryDetailReadModel",
    "parseHistoryEntryId",
    "stringifyRedactedJson",
    '.in("domain", ["history", "catalog", "prices"])',
  ]) {
    if (!historyReadModel.includes(requiredSnippet)) {
      addFailure(`history-read-model.ts must include ${requiredSnippet}`);
    }
  }

  if (
    !/try\s*{[\s\S]*decodeURIComponent\(entryId\)[\s\S]*catch\s*{[\s\S]*kind: "invalid"/.test(
      historyReadModel,
    )
  ) {
    addFailure("TASK-015 history detail must treat malformed encoded entry ids as invalid");
  }

  if (
    !/parsedEntry\.kind === "sync_event"[\s\S]*\.eq\("id", parsedEntry\.value\)[\s\S]*\.in\("domain", \["history", "catalog", "prices"\]\)/.test(
      historyReadModel,
    )
  ) {
    addFailure("TASK-015 history detail must keep the mapped sync-event domain allowlist");
  }

  if (/\.from\("audit_logs"\)|credential_hash|access_token|refresh_token|magic_link/i.test(historyReadModel)) {
    addFailure("TASK-015 history reads must stay distinct from audit logs and redact sensitive payloads");
  }

  for (const requiredSnippet of [
    '.from("shop_devices")',
    '.eq("shop_id", selectedShop.shopId)',
    '.from("sync_events")',
    "deviceDetailHref",
    "revokedAt",
    "lastSeenAt",
  ]) {
    if (!deviceReadModel.includes(requiredSnippet)) {
      addFailure(`device-read-model.ts must include ${requiredSnippet}`);
    }
  }

  if (/activity_only|revocationBlockedReason|device_secret|device_token/i.test(deviceReadModel)) {
    addFailure("TASK-015 devices must use the safe shop_devices registry without device secrets");
  }

  for (const requiredSnippet of [
    "EXCEL_WORKBOOK_SHEETS",
    "MAX_IMPORT_ROWS",
    "MAX_IMPORT_BYTES",
    "FORMULA_INJECTION_PREFIXES",
    "sanitizeSpreadsheetCell",
  ]) {
    if (!importExportReadiness.includes(requiredSnippet)) {
      addFailure(`import-export-readiness.ts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "shop_catalog_create_product",
    "shop_catalog_update_product",
    "shop_catalog_archive_product",
    "shop_catalog_create_category",
    "shop_catalog_update_category",
    "shop_catalog_archive_category",
    "shop_catalog_create_supplier",
    "shop_catalog_update_supplier",
    "shop_catalog_archive_supplier",
    "resolveShopActionContext",
  ]) {
    if (!catalogMutations.includes(requiredSnippet)) {
      addFailure(`catalog-mutations.ts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "shop_staff_create",
    "shop_staff_reset_credential",
    "shop_staff_suspend",
    "shop_staff_reactivate",
    "shop_staff_archive",
    "hashStaffCredential",
    "temporaryCredential",
    "staff.manage",
  ]) {
    if (!staffMutations.includes(requiredSnippet)) {
      addFailure(`staff-mutations.ts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "shop_device_register",
    "shop_device_rename",
    "shop_device_revoke",
    "shop_device_reactivate",
    "devices.manage",
  ]) {
    if (!deviceMutations.includes(requiredSnippet)) {
      addFailure(`device-mutations.ts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "read-excel-file",
    "write-excel-file",
    "parseCatalogWorkbookPreview",
    "applyCatalogWorkbookImport",
    "buildCatalogWorkbookExport",
    "buildCatalogImportTemplate",
    "previewDigest",
    "confirmApply",
    "sanitizeSpreadsheetCell",
    "shop_admin_audit_event",
  ]) {
    if (!importExportWorkbook.includes(requiredSnippet)) {
      addFailure(`import-export-workbook.ts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "createProductAction",
    "archiveProductAction",
    "createStaffAction",
    "resetStaffCredentialAction",
    "revokeDeviceAction",
    "reactivateDeviceAction",
  ]) {
    if (!shopActions.includes(requiredSnippet)) {
      addFailure(`src/app/shop/actions.ts must include ${requiredSnippet}`);
    }
  }

  if (
    !/SHOP_ADMIN_PERMISSION_MATRIX/.test(permissions) ||
    !/SHOP_STAFF_PERMISSION_MATRIX/.test(permissions) ||
    !/canShopAdmin/.test(permissions) ||
    !/canShopStaff/.test(permissions)
  ) {
    addFailure("TASK-015 permissions must define separate web admin and POS staff matrices");
  }

  for (const [key, routePath] of routeChecks) {
    const route = read(routePath);

    if (!/export const dynamic = ["']force-dynamic["']/.test(route)) {
      addFailure(`${routePath} must force dynamic rendering`);
    }

    if (!route.includes("searchParams") || !new RegExp(`getShopSectionForRequest\\(\\s*"${key}"`).test(route)) {
      addFailure(`${routePath} must load ${key} through the server section builder`);
    }
  }

  const historyDetailRoute = read(historyDetailRoutePath);

  if (!/export const dynamic = ["']force-dynamic["']/.test(historyDetailRoute)) {
    addFailure(`${historyDetailRoutePath} must force dynamic rendering`);
  }

  if (
    !/params/.test(historyDetailRoute) ||
    !/searchParams/.test(historyDetailRoute) ||
    !/getShopHistoryDetailSectionForRequest/.test(historyDetailRoute)
  ) {
    addFailure(`${historyDetailRoutePath} must load detail through the server section builder`);
  }

  if (
    !/buildHistoryDetailSection/.test(sectionData) ||
    !/getShopHistoryDetailSectionForRequest/.test(sectionData)
  ) {
    addFailure("TASK-015 history detail must be built from a server read model");
  }

  if (!/key: "history"/.test(sections) || !/href: "\/shop\/history"/.test(sections)) {
    addFailure(`${sectionsPath} must include the Shop Admin history section`);
  }

  if (/credential_hash|pin_hash|password_hash|hashStaffCredential|verifyStaffCredential/.test(task015ClientSurface)) {
    addFailure("TASK-015 client surfaces must not expose staff credential hashes or hashing functions");
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i.test(task015ClientSurface)) {
    addFailure("TASK-015 client surfaces must not expose service-role material");
  }

  if (/credential_hash|pin_hash|password_hash/i.test(task015ReadSurface)) {
    addFailure("TASK-015 server DTO/read surfaces must not expose credential hashes or auth token names");
  }

  if (/access_token|refresh_token|magic_link/i.test(task015ServerSurface)) {
    addFailure("TASK-015 server surfaces must not expose auth token names");
  }
}

function checkTask016PlatformAdminConsole() {
  const scannerContract = [
    "no service-role client/browser",
    "no secret evidence",
    "no token/magic link",
    "no credential hash",
    "no platform client-only auth",
    "no unsafe platform operations",
    "no raw .env",
    "no unredacted audit metadata",
    "no emergency operation senza audit",
    "no platform admin grant/revoke senza self-lockout guard",
    "no auth provisioning che stampa magic link/token/password",
  ];
  const routePaths = [
    "src/app/platform/overview/page.tsx",
    "src/app/platform/users/[profileId]/page.tsx",
    "src/app/platform/shops/[shopId]/page.tsx",
    "src/app/platform/shops/new/page.tsx",
    "src/app/platform/provisioning/page.tsx",
    "src/app/platform/admins/page.tsx",
    "src/app/platform/audit/[eventId]/page.tsx",
    "src/app/platform/data/page.tsx",
    "src/app/platform/devices/page.tsx",
    "src/app/platform/sync/page.tsx",
    "src/app/platform/history/page.tsx",
    "src/app/platform/support/page.tsx",
  ];
  const readModelPath = "src/server/platform-admin/read-model.ts";
  const sectionDataPath = "src/server/platform-admin/platform-section-data.ts";
  const operationActionsPath = "src/app/platform/operations/actions.ts";
  const shopActionsPath = "src/server/platform-admin/shop-actions.ts";
  const adminActionsPath = "src/server/platform-admin/admin-actions.ts";
  const platformLayoutPath = "src/app/platform/layout.tsx";
  const migrationPath =
    "supabase/migrations/20260531190000_task_016_platform_admin_console.sql";
  const completionMigrationPath =
    "supabase/migrations/20260531210000_task_016_platform_completion.sql";

  void scannerContract;

  for (const routePath of routePaths) {
    if (!existsSync(join(root, routePath))) {
      addFailure(`${routePath} is missing`);
      continue;
    }

    if (!/export const dynamic = ["']force-dynamic["']/.test(read(routePath))) {
      addFailure(`${routePath} must force dynamic rendering`);
    }
  }

  for (const requiredPath of [
    readModelPath,
    sectionDataPath,
    operationActionsPath,
    shopActionsPath,
    adminActionsPath,
    platformLayoutPath,
    migrationPath,
    completionMigrationPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const readModel = read(readModelPath);
  const sectionData = read(sectionDataPath);
  const operationActions = read(operationActionsPath);
  const shopActions = read(shopActionsPath);
  const adminActions = read(adminActionsPath);
  const platformLayout = read(platformLayoutPath);
  const migration = read(migrationPath);
  const completionMigration = read(completionMigrationPath);
  const platformSource = [
    readModel,
    sectionData,
    operationActions,
    shopActions,
    adminActions,
    platformLayout,
    ...routePaths.map(read),
  ].join("\n");

  if (!/resolveCurrentAdminRouteAccess/.test(platformLayout)) {
    addFailure("TASK-016 Platform layout must use server-side auth routing");
  }

  if (/^["']use client["'];?/m.test(platformLayout)) {
    addFailure("TASK-016 Platform layout must not be client-only auth");
  }

  if (/select\(["']\*["']\)/.test(readModel)) {
    addFailure("TASK-016 Platform read model must not use select star");
  }

  if (!/\.from\("shop_devices"\)/.test(readModel)) {
    addFailure("TASK-016 read model must include global shop_devices overview");
  }

  if (!/\.from\("sync_events"\)/.test(readModel)) {
    addFailure("TASK-016 read model must include global sync_events overview");
  }

  if (!/metadata_redacted/.test(readModel) || !/redactPlatformMetadata/.test(readModel)) {
    addFailure("TASK-016 audit reads must use redacted metadata summaries");
  }

  if (
    /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role|\.env\.local|process\.env/i.test(
      platformSource,
    )
  ) {
    addFailure("TASK-016 Platform source must not expose raw env or privileged key material");
  }

  if (
    /credential_hash|pin_hash|password_hash|magic_link|access_token|refresh_token/i.test(
      platformSource,
    )
  ) {
    addFailure("TASK-016 Platform source must not expose auth secret field names");
  }

  if (/console\.(log|debug|info|warn|error)/.test(platformSource)) {
    addFailure("TASK-016 Platform source must not log runtime details");
  }

  if (
    !/shop_devices_select_platform_admin/.test(migration) ||
    !/sync_events_select_platform_admin/.test(migration) ||
    !/platform_emergency_revoke_device/.test(migration) ||
    !/app_private\.is_platform_admin\(\)/.test(migration)
  ) {
    addFailure("TASK-016 migration must add platform-admin device and sync policies");
  }

  if (
    !/platform_owner_invites/.test(completionMigration) ||
    !/platform_create_shop_with_pending_owner_invite/.test(completionMigration) ||
    !/owner_contact_redacted/.test(completionMigration) ||
    !/owner_contact_digest/.test(completionMigration) ||
    !/platform\.shop\.pending_owner_invite\.success/.test(completionMigration)
  ) {
    addFailure("TASK-016 auth provisioning must use redacted pending owner invite state");
  }

  if (
    /magic_link|access_token|refresh_token|credential_hash|pin_hash|password_hash/i.test(
      completionMigration,
    )
  ) {
    addFailure("TASK-016 auth provisioning must not persist delivery artifacts or secret fields");
  }

  if (
    !/platform_grant_platform_admin/.test(completionMigration) ||
    !/platform_revoke_platform_admin/.test(completionMigration) ||
    !/self_lockout_blocked/.test(completionMigration) ||
    !/last_admin_blocked/.test(completionMigration) ||
    !/platform\.admin\.grant\.success/.test(completionMigration) ||
    !/platform\.admin\.revoke\.success/.test(completionMigration)
  ) {
    addFailure("TASK-016 Platform Admin grant/revoke must be audited and anti-lockout guarded");
  }

  if (
    !/grantPlatformAdminAction/.test(read("src/app/platform/admins/actions.ts")) ||
    !/revokePlatformAdminAction/.test(read("src/app/platform/admins/actions.ts")) ||
    !/\.rpc\("platform_grant_platform_admin"/.test(adminActions) ||
    !/\.rpc\("platform_revoke_platform_admin"/.test(adminActions)
  ) {
    addFailure("TASK-016 Platform Admin grant/revoke must stay server-side");
  }

  if (
    !/platform\.device\.emergency_revoke\.success/.test(migration) ||
    !/p_reason/.test(migration)
  ) {
    addFailure("TASK-016 emergency operation must be reasoned and audited");
  }

  if (
    !/emergencyRevokePlatformDeviceAction/.test(operationActions) ||
    !/emergencyRevokePlatformDevice/.test(shopActions) ||
    !/\.rpc\("platform_emergency_revoke_device"/.test(shopActions)
  ) {
    addFailure("TASK-016 emergency device action must stay server-side");
  }

  if (/\.(insert|update|delete|upsert)\s*\(/.test(`${shopActions}\n${adminActions}`)) {
    addFailure("TASK-016 Platform server actions must not direct-mutate tables");
  }

  if (
    !/platform_restore_shop/.test(completionMigration) ||
    !/platform\.shop\.restore\.success/.test(completionMigration) ||
    !/restorePlatformShopAction/.test(operationActions)
  ) {
    addFailure("TASK-016 restore shop must use an audited RPC and Server Action");
  }

  if (/source_device_id[\s\S]{0,120}revoke/i.test(sectionData)) {
    addFailure("TASK-016 must not confuse source_device_id with device authorization");
  }

  if (/impersonat/i.test(read("src/app/platform/support/page.tsx"))) {
    addFailure("TASK-016 support page must not implement impersonation");
  }
}

function checkTask017ShopBusinessCompletionArtifacts() {
  const routePaths = [
    "src/app/shop/products/[productId]/page.tsx",
    "src/app/shop/categories/[categoryId]/page.tsx",
    "src/app/shop/suppliers/[supplierId]/page.tsx",
    "src/app/shop/members/[memberId]/page.tsx",
    "src/app/shop/staff/[staffId]/page.tsx",
    "src/app/shop/devices/[deviceId]/page.tsx",
    "src/app/shop/audit/[eventId]/page.tsx",
    "src/app/shop/sync/page.tsx",
  ];
  const migrationPath =
    "supabase/migrations/20260531230000_task_017_shop_business_completion.sql";
  const ownerEnforcementMigrationPath =
    "supabase/migrations/20260531233000_task_017_member_owner_enforcement.sql";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const auditReadModelPath = "src/server/shop-admin/audit-read-model.ts";
  const memberMutationsPath = "src/server/shop-admin/member-mutations.ts";
  const memberPanelPath = "src/app/shop/_components/MemberActionPanel.tsx";
  const actionsPath = "src/app/shop/actions.ts";
  const sectionsPath = "src/components/shop/shopSections.ts";

  for (const routePath of routePaths) {
    if (!existsSync(join(root, routePath))) {
      addFailure(`${routePath} is missing`);
      continue;
    }

    const route = read(routePath);

    if (!/export const dynamic = ["']force-dynamic["']/.test(route)) {
      addFailure(`${routePath} must force dynamic rendering`);
    }

    if (/@supabase|service_role|credential_hash|password_hash|pin_hash/i.test(route)) {
      addFailure(`${routePath} must not expose privileged or credential fields`);
    }
  }

  for (const requiredPath of [
    migrationPath,
    ownerEnforcementMigrationPath,
    sectionDataPath,
    auditReadModelPath,
    memberMutationsPath,
    memberPanelPath,
    actionsPath,
    sectionsPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const migration = read(migrationPath);
  const ownerEnforcementMigration = read(ownerEnforcementMigrationPath);
  const sectionData = read(sectionDataPath);
  const auditReadModel = read(auditReadModelPath);
  const memberMutations = read(memberMutationsPath);
  const memberPanel = read(memberPanelPath);
  const actions = read(actionsPath);
  const sections = read(sectionsPath);

  for (const rpcName of [
    "shop_member_invite_profile",
    "shop_member_update_role",
    "shop_member_remove",
  ]) {
    if (!new RegExp(`create or replace function public\\.${rpcName}`).test(migration)) {
      addFailure(`${migrationPath} must create ${rpcName}`);
    }

    if (!new RegExp(`grant execute on function public\\.${rpcName}`).test(migration)) {
      addFailure(`${migrationPath} must grant execute on ${rpcName}`);
    }

    if (!memberMutations.includes(`.rpc("${rpcName}"`)) {
      addFailure(`${memberMutationsPath} must call approved RPC ${rpcName}`);
    }
  }

  if (!/set search_path = public, app_private, pg_temp/i.test(migration)) {
    addFailure(`${migrationPath} must control RPC search_path`);
  }

  if (
    !/create or replace function app_private\.is_active_shop_owner_member/.test(
      ownerEnforcementMigration,
    ) ||
    !/not app_private\.is_active_shop_owner_member\(p_shop_id\)/.test(
      ownerEnforcementMigration,
    )
  ) {
    addFailure("TASK-017 member RPCs must enforce owner-only authorization in Supabase");
  }

  if (
    !/nullif\(btrim\(coalesce\(p_reason, ''\)\), ''\) is null/.test(
      ownerEnforcementMigration,
    ) ||
    !/reason_length/.test(ownerEnforcementMigration)
  ) {
    addFailure("TASK-017 member removal must require a reason without storing raw reason text");
  }

  if (
    /grant\s+(insert|update|delete|all).*on table public\.(shop_members|profiles|audit_logs).*authenticated/i.test(
      migration,
    )
  ) {
    addFailure(`${migrationPath} must not grant direct member/audit table mutations`);
  }

  if (/grant\s+\w+.*\s+to\s+anon/i.test(migration)) {
    addFailure(`${migrationPath} must not grant TASK-017 access to anon`);
  }

  if (
    !/buildShopDashboardSection/.test(sectionData) ||
    !/buildSyncSection/.test(sectionData) ||
    !/buildProductDetailSection/.test(sectionData) ||
    !/buildStaffDetailSection/.test(sectionData) ||
    !/buildDeviceDetailSection/.test(sectionData) ||
    !/buildAuditDetailSection/.test(sectionData)
  ) {
    addFailure("TASK-017 section builders must cover dashboard, sync, catalog, staff, devices and audit detail");
  }

  if (!/metadata_redacted/.test(auditReadModel) || !/redact/.test(auditReadModel)) {
    addFailure("TASK-017 audit read model must use redacted metadata");
  }

  if (!/\.eq\("shop_id", selectedShop\.shopId\)/.test(auditReadModel)) {
    addFailure("TASK-017 audit read model must filter by the verified selected shop");
  }

  if (!/key: "sync"/.test(sections) || !/href: "\/shop\/sync"/.test(sections)) {
    addFailure("TASK-017 Sync Center must be part of Shop Admin navigation");
  }

  if (
    !/inviteShopMemberAction/.test(actions) ||
    !/updateShopMemberRoleAction/.test(actions) ||
    !/removeShopMemberAction/.test(actions) ||
    !/Invite member/.test(memberPanel) ||
    !/Update role/.test(memberPanel) ||
    !/Remove member/.test(memberPanel) ||
    !/label="Reason" name="reason" required/.test(memberPanel) ||
    !/Reason is required/.test(memberMutations)
  ) {
    addFailure("TASK-017 member actions must stay in audited Shop Admin Server Actions");
  }

  if (
    /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role|credential_hash|pin_hash|password_hash|magic_link|access_token|refresh_token/i.test(
      `${sectionData}\n${auditReadModel}\n${memberMutations}\n${memberPanel}\n${actions}`,
    )
  ) {
    addFailure("TASK-017 Shop Admin source must not expose secrets or credential hashes");
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
checkTask006ControlledActionArtifacts();
checkTask007AuthRoutingArtifacts();
checkTask008ShopShellArtifacts();
checkTask009ShopSwitcherArtifacts();
checkTask010ShopReadModelArtifacts();
checkTask012PosStaffCredentialPlanning();
checkTask013UiPolishArtifacts();
checkTask014DesignSystem();
checkTask014PosStaffFoundation();
checkTask014AuthenticatedQaHarness();
checkTask015ShopAdminConsole();
checkTask016PlatformAdminConsole();
checkTask017ShopBusinessCompletionArtifacts();

if (failures.length > 0) {
  console.error("Security scan failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Security scan passed.");
