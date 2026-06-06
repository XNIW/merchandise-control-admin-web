#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const skips = [];
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

function addSkip(message) {
  skips.push(message);
}

function resolveExternalRepoPath(envName, fallbackPath) {
  return process.env[envName]?.trim() || fallbackPath;
}

function isRequiredExternalRepo(envName) {
  return process.env[envName] === "1";
}

function skipOrFailMissingExternalRepo({
  envName,
  label,
  path,
  requiredEnvName,
}) {
  if (existsSync(path)) {
    return false;
  }

  if (isRequiredExternalRepo(requiredEnvName)) {
    addFailure(`${label} repo is missing at ${path}`);
  } else {
    addSkip(
      `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE ${label}: repo is missing at ${path}; set ${envName} to override or ${requiredEnvName}=1 to require it.`,
    );
  }

  return true;
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

function isTask041RuntimeCompletionActive(
  masterPlan = existsSync(join(root, "docs/MASTER-PLAN.md"))
    ? read("docs/MASTER-PLAN.md")
    : "",
) {
  return /Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
    masterPlan,
  );
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
    "SUPABASE_SERVICE_ROLE_KEY",
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
        "shop_catalog_restore_product",
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
        "shop_staff_force_credential_rotation",
        "shop_staff_clear_lockout",
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
    "src/server/shop-admin/staff-web-auth.ts",
    "src/server/shop-admin/settings-mutations.ts",
    "src/server/shop-admin/staff-aware-mutations.ts",
    "src/server/platform-admin/staff-manager-provisioning.ts",
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
  const operationsWorkflowPath =
    "src/components/platform/operations/ControlledOperationsWorkflow.tsx";
  const serverActionsPath = "src/app/platform/operations/actions.ts";
  const shopActionsPath = "src/server/platform-admin/shop-actions.ts";
  const auditEventsPath = "src/server/platform-admin/audit-events.ts";
  const platformDataPath = "src/components/platform/platformData.ts";

  for (const requiredPath of [
    migrationPath,
    operationsPagePath,
    operationsWorkflowPath,
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
  const operationsWorkflow = read(operationsWorkflowPath);
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

  if (
    !/redirect\(\s*`\$\{safeReturnTo\(formData\)\}\?operation=\$\{operation\}&result=\$\{result\.code\}`/.test(
      serverActions,
    )
  ) {
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
    "Type shop code to confirm",
    "Suspend shop",
    "Reactivate shop",
    "Archive shop",
  ]) {
    if (!`${operationsPage}\n${operationsWorkflow}`.includes(requiredSnippet)) {
      addFailure(`Operations UI must include ${requiredSnippet}`);
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

  if (
    !/resolveCurrentShopAdminPrincipal/.test(shopLayout) ||
    !/resolveStaffWebSessionPrincipal/.test(shopLayout) ||
    !/resolution\.status !== "ready"/.test(shopLayout) ||
    !/AccessState/.test(shopLayout)
  ) {
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
    "src/app/shop/pos/page.tsx",
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

  if (
    !/resolveCurrentShopAdminPrincipal/.test(layout) ||
    !/resolveStaffWebSessionPrincipal/.test(layout) ||
    !/resolution\.status !== "ready"/.test(layout) ||
    !/principal\.kind/.test(layout)
  ) {
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
    "/shop/pos",
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

  if (!/resolveCurrentShopAdminPrincipal/.test(layout) || !/principal\.kind/.test(layout)) {
    addFailure(`${shopLayoutPath} must use the Shop Admin principal resolver`);
  }

  if (!/availableShops=\{availableShops\}/.test(layout)) {
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
  const dataAccess = read("src/server/shop-admin/data-access.ts");
  const sectionData = read(sectionDataPath);
  const sectionPage = read(sectionPagePath);
  const shopPage = read(shopPagePath);
  const overviewPage = read(overviewPagePath);
  const membersPage = read(membersPagePath);
  const auditPage = read(auditPagePath);
  const shell = read(shellPath);

  for (const requiredSnippet of [
    'import "server-only"',
    "resolveShopAdminDataAccess",
    '"not_configured"',
    '"unauthorized"',
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

  for (const requiredSnippet of [
    'import "server-only"',
    "createSupabaseServerClient",
    "resolveCurrentShopAdminPrincipal",
    "resolveStaffWebSessionPrincipal",
    "strictRequestedShop",
    "availableShops.find",
    "principal.selectedShop",
  ]) {
    if (!dataAccess.includes(requiredSnippet)) {
      addFailure(`src/server/shop-admin/data-access.ts must include ${requiredSnippet}`);
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

  if (!/availableShops\.find/.test(dataAccess) || !/principal\.selectedShop/.test(dataAccess)) {
    addFailure("src/server/shop-admin/data-access.ts must select shops from server-authorized memberships");
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
    "src/app/shop/pos/page.tsx",
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
  const proxyEntryPath = isTask041RuntimeCompletionActive()
    ? "src/middleware.ts"
    : "src/proxy.ts";
  const proxyHelperPath = "src/lib/supabase/proxy.ts";

  for (const requiredPath of [proxyEntryPath, proxyHelperPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const proxyEntry = read(proxyEntryPath);
  const proxyHelper = read(proxyHelperPath);

  if (
    proxyEntryPath === "src/middleware.ts"
      ? !/export async function middleware/.test(proxyEntry)
      : !/export async function proxy/.test(proxyEntry)
  ) {
    addFailure(`${proxyEntryPath} must export the Supabase SSR request lifecycle function`);
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
    ) &&
    !/Task attivo: `TASK-018 - Infrastructure, Security Hardening and POS Foundation`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-019 - POS Auth Foundation Implementation`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-020 - Win7POS Integration Planning`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-021 - POS backend session\/device endpoints`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-026 - Shop Admin product catalog foundation`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-027 - Catalog pull delta sync and POS catalog hardening`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-032 - Full project progression mega-task`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-037 - Shop Admin dual access model: personal account and POS manager login`/.test(
      masterPlan,
    ) &&
    !/Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
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
    "shop_staff_force_credential_rotation",
    "shop_staff_clear_lockout",
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

function checkTask018InfrastructureSecurityPosFoundation() {
  const workflowPath = ".github/workflows/ci.yml";
  const taskPath =
    "docs/TASKS/TASK-018-infrastructure-security-hardening-pos-foundation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-018/README.md";
  const enforcementPath =
    "docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md";
  const posAuthPath = "docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md";
  const migrationPath =
    "supabase/migrations/20260531234500_task_018_backup_table_lockdown.sql";
  const triggerHardeningMigrationPath =
    "supabase/migrations/20260531235000_task_018_trigger_search_path_hardening.sql";
  const memberInviteLintCleanupMigrationPath =
    "supabase/migrations/20260531235500_task_018_member_invite_lint_cleanup.sql";
  const foundationTestPath =
    "tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs";

  for (const requiredPath of [
    workflowPath,
    taskPath,
    evidencePath,
    enforcementPath,
    posAuthPath,
    migrationPath,
    triggerHardeningMigrationPath,
    memberInviteLintCleanupMigrationPath,
    foundationTestPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const workflow = read(workflowPath);
  const packageJson = JSON.parse(read("package.json"));
  const migration = read(migrationPath);
  const triggerHardeningMigration = read(triggerHardeningMigrationPath);
  const memberInviteLintCleanupMigration = read(memberInviteLintCleanupMigrationPath);
  const task = read(taskPath);
  const evidence = read(evidencePath);
  const enforcement = read(enforcementPath);
  const posAuth = read(posAuthPath);
  const foundationTest = read(foundationTestPath);
  const masterPlan = read("docs/MASTER-PLAN.md");

  for (const required of [
    "pull_request:",
    "push:",
    "workflow_dispatch:",
    "permissions:",
    "contents: read",
    "npm ci",
    "npm run security:scan",
    "npm run test:foundation",
    "npm run typecheck",
    "npm run lint",
    "npm run build",
    "npm run test:ui-smoke:ci",
    "git diff --check",
  ]) {
    if (!workflow.includes(required)) {
      addFailure(`${workflowPath} must include ${required}`);
    }
  }

  if (/SUPABASE_SERVICE_ROLE|service_role|vercel|netlify/i.test(workflow)) {
    addFailure(`${workflowPath} must not configure service-role secrets or deploy providers`);
  }

  const smokeScript = packageJson.scripts?.["test:ui-smoke:ci"] ?? "";

  if (
    !/PLAYWRIGHT_BASE_URL=http:\/\/127\.0\.0\.1:3003/.test(smokeScript) ||
    !/PLAYWRIGHT_WEB_SERVER_COMMAND=/.test(smokeScript) ||
    !/npm run start -- --hostname 127\.0\.0\.1 --port 3003/.test(smokeScript) ||
    !/PLAYWRIGHT_REUSE_SERVER=0/.test(smokeScript) ||
    !/--project=chromium-desktop/.test(smokeScript)
  ) {
    addFailure("TASK-018 CI smoke script must run the built app through next start");
  }

  for (const backupTable of [
    "backup_task108_inventory_suppliers_20260514173049",
    "backup_task108_inventory_categories_20260514173049",
    "backup_task108_inventory_products_20260514173049",
    "backup_task108_inventory_product_prices_20260514173049",
    "backup_task108_shared_sheet_sessions_20260514173049",
    "backup_task108_sync_events_20260514173049",
  ]) {
    if (!migration.includes(backupTable)) {
      addFailure(`${migrationPath} must lock down ${backupTable}`);
    }
  }

  for (const requiredPattern of [
    /enable row level security/i,
    /force row level security/i,
    /revoke all on table/i,
    /from public/i,
    /from anon/i,
    /from authenticated/i,
  ]) {
    if (!requiredPattern.test(migration)) {
      addFailure(`${migrationPath} is missing ${requiredPattern}`);
    }
  }

  if (/drop table|delete from|truncate/i.test(migration)) {
    addFailure(`${migrationPath} must stay non-destructive`);
  }

  if (
    !/create or replace function public\.set_shared_sheet_sessions_updated_at/.test(
      triggerHardeningMigration,
    ) ||
    !/set search_path = public, pg_temp/i.test(triggerHardeningMigration)
  ) {
    addFailure(`${triggerHardeningMigrationPath} must harden trigger function search_path`);
  }

  if (/drop table|delete from|truncate/i.test(triggerHardeningMigration)) {
    addFailure(`${triggerHardeningMigrationPath} must stay non-destructive`);
  }

  if (
    !/create or replace function public\.shop_member_invite_profile/.test(
      memberInviteLintCleanupMigration,
    ) ||
    !/perform 1[\s\S]*from public\.profiles/i.test(memberInviteLintCleanupMigration) ||
    /v_profile/i.test(memberInviteLintCleanupMigration) ||
    !/grant execute on function public\.shop_member_invite_profile/.test(
      memberInviteLintCleanupMigration,
    )
  ) {
    addFailure(`${memberInviteLintCleanupMigrationPath} must clean the member invite lint warning without changing grants`);
  }

  if (/drop table|delete from|truncate/i.test(memberInviteLintCleanupMigration)) {
    addFailure(`${memberInviteLintCleanupMigrationPath} must stay non-destructive`);
  }

  for (const required of [
    "Device authorization",
    "Device revocation",
    "Staff suspension",
    "Shop suspension",
    "Emergency revoke",
    "shop_devices.status",
    "staff_accounts.status",
  ]) {
    if (!enforcement.includes(required)) {
      addFailure(`${enforcementPath} must document ${required}`);
    }
  }

  for (const required of [
    "shop_code",
    "staff_code",
    "PIN/password",
    "credential_hash",
    "Lockout",
    "Rate limit",
    "Device binding",
    "Device revoke",
    "Fuori scope",
  ]) {
    if (!posAuth.includes(required)) {
      addFailure(`${posAuthPath} must document ${required}`);
    }
  }

  if (
    /endpoint[\s\S]{0,80}implementat|JWT[\s\S]{0,80}implementat|sessione POS[\s\S]{0,80}implementat/i.test(
      posAuth,
    )
  ) {
    addFailure(`${posAuthPath} must remain design-only and must not implement POS auth`);
  }

  if (!/TASK-018 - Infrastructure, Security Hardening and POS Foundation/.test(masterPlan)) {
    addFailure("MASTER-PLAN must track TASK-018");
  }

  if (
    !/Stato: `(REVIEW|DONE)`/.test(task) ||
    !/Fase: `(REVIEW|DONE_RECONCILED)`/.test(task) ||
    !/(Verdict handoff Codex: `PASS_WITH_NOTES`|Verdict finale: `DONE`|Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`)/.test(task) ||
    !/(Verdict Codex: `PASS_WITH_NOTES`|Verdict finale: `DONE`|Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`)/.test(evidence)
  ) {
    addFailure("TASK-018 docs must be either in REVIEW handoff or DONE reconciliation state");
  }

  if (!/checkTask018InfrastructureSecurityPosFoundation/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-018 security scanner gate`);
  }
}

function checkTask019PosAuthFoundationImplementation() {
  const taskPath = "docs/TASKS/TASK-019-pos-auth-foundation-implementation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-019/README.md";
  const migrationPaths = listFiles("supabase/migrations").filter((file) =>
    file.includes("_task_019_"),
  );
  const baseMigrationPath = migrationPaths.find((file) =>
    file.endsWith("_task_019_pos_auth_foundation.sql"),
  );
  const readModelPath = "src/server/shop-admin/staff-read-model.ts";
  const mutationsPath = "src/server/shop-admin/staff-mutations.ts";
  const actionsPath = "src/app/shop/actions.ts";
  const panelPath = "src/app/shop/_components/StaffActionPanel.tsx";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const foundationTestPath =
    "tests/foundation/task-019-pos-auth-foundation.test.mjs";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    readModelPath,
    mutationsPath,
    actionsPath,
    panelPath,
    sectionDataPath,
    foundationTestPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  if (!baseMigrationPath || migrationPaths.length === 0) {
    addFailure("TASK-019 POS auth foundation migration is missing");
    return;
  }

  const task = read(taskPath);
  const masterPlan = read("docs/MASTER-PLAN.md");
  const migration = migrationPaths.sort().map((file) => read(file)).join("\n");
  const readModel = read(readModelPath);
  const mutations = read(mutationsPath);
  const actions = read(actionsPath);
  const panel = read(panelPath);
  const sectionData = read(sectionDataPath);
  const foundationTest = read(foundationTestPath);
  const clientSurface = [
    panelPath,
    "src/app/shop/staff/page.tsx",
    "src/app/shop/staff/[staffId]/page.tsx",
    "src/components/shop/ShopSectionPage.tsx",
    "src/components/shop/shopSections.ts",
  ]
    .map((file) => read(file))
    .join("\n");
  const appRoutes = listFiles("src/app");

  if (!/Stato: `(IN_PROGRESS|REVIEW|DONE)`/.test(task)) {
    addFailure(`${taskPath} must stay IN_PROGRESS, REVIEW or DONE after reconciliation`);
  }

  if (!/Fase: `(EXECUTION|REVIEW|DONE_RECONCILED)`/.test(task)) {
    addFailure(`${taskPath} must track a valid TASK-019 phase`);
  }

  if (!/TASK-019 - POS Auth Foundation Implementation/.test(masterPlan)) {
    addFailure("MASTER-PLAN must track TASK-019");
  }

  for (const requiredSnippet of [
    "credential_version",
    "credential_status",
    "session_invalidated_at",
    "staff_accounts_safe",
    "staff_accounts_credential_version_positive",
    "staff_accounts_credential_status_check",
  ]) {
    if (!migration.includes(requiredSnippet)) {
      addFailure(`TASK-019 migrations must include ${requiredSnippet}`);
    }
  }

  const safeViewDefinition =
    migration.match(
      /create or replace view public\.staff_accounts_safe[\s\S]*?from public\.staff_accounts;/,
    )?.[0] ?? "";

  if (/credential_hash|pin_hash|password_hash/i.test(safeViewDefinition)) {
    addFailure("TASK-019 migrations must not expose credential hashes in staff_accounts_safe");
  }

  if (/drop table|delete from|truncate/i.test(migration)) {
    addFailure("TASK-019 migrations must stay non-destructive for data tables");
  }

  if (
    /grant\s+(insert|update|delete|all)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i.test(
      migration,
    )
  ) {
    addFailure("TASK-019 migrations must not grant direct staff table mutations");
  }

  if (
    !/grant select\s*\([\s\S]*credential_version[\s\S]*credential_status[\s\S]*session_invalidated_at[\s\S]*\)\s*on table public\.staff_accounts to authenticated/i.test(
      migration,
    )
  ) {
    addFailure("TASK-019 must grant authenticated SELECT on safe new staff columns for the security_invoker view");
  }

  for (const rpcName of [
    "shop_staff_reset_credential",
    "shop_staff_suspend",
    "shop_staff_reactivate",
    "shop_staff_archive",
    "shop_staff_force_credential_rotation",
    "shop_staff_clear_lockout",
  ]) {
    if (!new RegExp(`create or replace function public\\.${rpcName}`).test(migration)) {
      addFailure(`TASK-019 migrations must create ${rpcName}`);
    }

    if (!new RegExp(`grant execute on function public\\.${rpcName}`).test(migration)) {
      addFailure(`TASK-019 migrations must grant execute on ${rpcName}`);
    }

    if (!mutations.includes(`.rpc("${rpcName}"`)) {
      addFailure(`${mutationsPath} must call ${rpcName}`);
    }
  }

  for (const requiredSnippet of [
    "app_private.is_active_shop_staff_admin_member",
    "set search_path = public, app_private, pg_temp",
    "reason_required",
    "reason_provided",
    "reason_length",
    "session_invalidated_at = now()",
    "locked_until is not null and locked_until > now() then 'locked'",
  ]) {
    if (!migration.includes(requiredSnippet)) {
      addFailure(`TASK-019 migrations must include ${requiredSnippet}`);
    }
  }

  if (/reason_redacted/i.test(migration)) {
    addFailure("TASK-019 migrations must not persist raw reason text");
  }

  for (const requiredSnippet of [
    "credentialVersion",
    "credentialStatus",
    "sessionInvalidatedAt",
    "credential_version",
    "credential_status",
    "session_invalidated_at",
  ]) {
    if (!readModel.includes(requiredSnippet)) {
      addFailure(`${readModelPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "reasonRequired",
    "shop_staff_force_credential_rotation",
    "shop_staff_clear_lockout",
  ]) {
    if (!mutations.includes(requiredSnippet)) {
      addFailure(`${mutationsPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "forceStaffCredentialRotationAction",
    "clearStaffLockoutAction",
  ]) {
    if (!actions.includes(requiredSnippet)) {
      addFailure(`${actionsPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "Force credential rotation",
    "Clear lockout",
    'name="reason"',
    "required",
  ]) {
    if (!panel.includes(requiredSnippet)) {
      addFailure(`${panelPath} must include ${requiredSnippet}`);
    }
  }

  if (!/credentialStatus|credentialVersion|sessionInvalidatedAt/.test(sectionData)) {
    addFailure(`${sectionDataPath} must render credential-safe status metadata`);
  }

  if (/credential_hash|pin_hash|password_hash|hashStaffCredential|verifyStaffCredential/.test(clientSurface)) {
    addFailure("TASK-019 client surfaces must not expose credential hashes or hashing functions");
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service_role/i.test(clientSurface)) {
    addFailure("TASK-019 client surfaces must not expose service-role material");
  }

  const task021Exists = existsSync(
    join(root, "docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md"),
  );
  const allowedTask021PosRoutes = new Set([
    "src/app/api/pos/_shared/pos-route-security.ts",
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/catalog/pull/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
  ]);
  if (isTask041RuntimeCompletionActive()) {
    allowedTask021PosRoutes.add("src/app/api/pos/sales/sync/route.ts");
  }
  const unexpectedPosRoutes = appRoutes.filter(
    (file) =>
      /^src\/app\/(?:api\/)?pos(?:\/|$)/i.test(file) &&
      !allowedTask021PosRoutes.has(file),
  );

  if (!task021Exists && appRoutes.some((file) => /^src\/app\/(?:api\/)?pos\//i.test(file))) {
    addFailure("TASK-019 must not create a public POS login endpoint or separate POS console");
  }

  if (task021Exists && unexpectedPosRoutes.length > 0) {
    addFailure(
      `TASK-019/TASK-021/TASK-026/TASK-027 allow only scoped POS backend endpoints, found: ${unexpectedPosRoutes.join(", ")}`,
    );
  }

  if (!/checkTask019PosAuthFoundationImplementation/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-019 security scanner gate`);
  }
}

function checkTask020Win7PosIntegrationPlanning() {
  const taskPath = "docs/TASKS/TASK-020-win7pos-integration-planning.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-020/README.md";
  const foundationTestPath =
    "tests/foundation/task-020-win7pos-integration-planning.test.mjs";

  for (const requiredPath of [taskPath, evidencePath, foundationTestPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read("docs/MASTER-PLAN.md");
  const foundationTest = read(foundationTestPath);
  const migrations = listFiles("supabase/migrations");
  const appRoutes = listFiles("src/app");

  for (const requiredSnippet of [
    "Stato: `DONE`",
    "Fase: `DONE_RECONCILED`",
    "Verdict finale: `DONE`",
    "/Users/minxiang/Projects/Win7POS",
    "aa545fc",
    "Non implementare login POS reale",
    "Nessuna migration TASK-020 creata o applicata",
    "Nessun endpoint pubblico POS creato",
    "Nessuna modifica Win7POS, Android o iOS",
  ]) {
    if (!task.includes(requiredSnippet)) {
      addFailure(`${taskPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "Stato task: `DONE`",
    "Fase: `DONE_RECONCILED`",
    "Verdict finale: `DONE`",
    "Nessun login POS reale: `CONFIRMED`",
    "Nessun endpoint pubblico POS: `CONFIRMED`",
    "Nessuna modifica Win7POS: `CONFIRMED`",
    "Nessuna migration TASK-020 applicata: `CONFIRMED`",
  ]) {
    if (!evidence.includes(requiredSnippet)) {
      addFailure(`${evidencePath} must include ${requiredSnippet}`);
    }
  }

  if (!/TASK-020 - Win7POS Integration Planning/.test(masterPlan)) {
    addFailure("MASTER-PLAN must track TASK-020");
  }

  if (!/Stato TASK-020: `DONE`/.test(masterPlan) || !/Fase TASK-020: `DONE_RECONCILED`/.test(masterPlan)) {
    addFailure("MASTER-PLAN must reconcile TASK-020 to DONE");
  }

  if (
    !/Task attivo: `(NONE|NESSUNO)`/.test(masterPlan) &&
    !/Task attivo: `TASK-021 - POS backend session\/device endpoints`/.test(masterPlan) &&
    !/Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`/.test(masterPlan) &&
    !/Task attivo: `TASK-026 - Shop Admin product catalog foundation`/.test(masterPlan) &&
    !/Task attivo: `TASK-027 - Catalog pull delta sync and POS catalog hardening`/.test(masterPlan) &&
    !/Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`/.test(masterPlan) &&
    !/Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`/.test(masterPlan) &&
    !/Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`/.test(masterPlan) &&
    !/Task attivo: `TASK-032 - Full project progression mega-task`/.test(masterPlan) &&
    !/Task attivo: `TASK-033 - Controlled TASK-032 review \+ HTTPS non-production \+ Win7POS live E2E \+ POS reconciliation \+ sales sync foundation`|Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`/.test(masterPlan) &&
    !/Task attivo: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`/.test(masterPlan) &&
    !/Task attivo: `TASK-035 - Authenticated Admin Web QA \+ Shop Admin smoke harness`/.test(masterPlan) &&
    !/Task attivo: `TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening`/.test(masterPlan) &&
    !/Task attivo: `TASK-037 - Shop Admin dual access model: personal account and POS manager login`/.test(masterPlan) &&
    !/Task attivo: `TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(masterPlan)
  ) {
    addFailure("MASTER-PLAN must return to no active task after reconciliation or track an active POS/catalog task");
  }

  if (migrations.some((file) => /task_020|task-020/i.test(file))) {
    addFailure("TASK-020 must not create a migration");
  }

  const task021Exists = existsSync(
    join(root, "docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md"),
  );
  const allowedTask021PosRoutes = new Set([
    "src/app/api/pos/_shared/pos-route-security.ts",
    "src/app/api/pos/auth/first-login/route.ts",
    "src/app/api/pos/catalog/pull/route.ts",
    "src/app/api/pos/session/heartbeat/route.ts",
  ]);
  if (isTask041RuntimeCompletionActive()) {
    allowedTask021PosRoutes.add("src/app/api/pos/sales/sync/route.ts");
  }
  const unexpectedPosRoutes = appRoutes.filter(
    (file) =>
      /^src\/app\/(?:api\/)?pos(?:\/|$)/i.test(file) &&
      !allowedTask021PosRoutes.has(file),
  );

  if (!task021Exists && appRoutes.some((file) => /^src\/app\/(?:api\/)?pos(?:\/|$)/i.test(file))) {
    addFailure("TASK-020 must not create a public POS endpoint or POS route");
  }

  if (task021Exists && unexpectedPosRoutes.length > 0) {
    addFailure(
      `TASK-020/TASK-021/TASK-026/TASK-027 allow only scoped POS backend endpoints, found: ${unexpectedPosRoutes.join(", ")}`,
    );
  }

  if (existsSync(join(root, "Win7POS")) || existsSync(join(root, "src/Win7POS"))) {
    addFailure("TASK-020 must not vendor or modify Win7POS inside Admin Web");
  }

  if (!/checkTask020Win7PosIntegrationPlanning/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-020 security scanner gate`);
  }
}

function checkTask021PosBackendSessionDeviceEndpoints() {
  const taskPath = "docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-021/README.md";
  const foundationTestPath =
    "tests/foundation/task-021-pos-backend-session-device.test.mjs";
  const migrationPath =
    "supabase/migrations/20260601120000_task_021_pos_sessions_devices.sql";
  const adminClientPath = "src/lib/supabase/admin.ts";
  const tokenPath = "src/server/pos-auth/tokens.ts";
  const servicePath = "src/server/pos-auth/service.ts";
  const catalogPullServicePath = "src/server/pos-auth/catalog-pull.ts";
  const posRouteSecurityPath = "src/app/api/pos/_shared/pos-route-security.ts";
  const firstLoginRoutePath = "src/app/api/pos/auth/first-login/route.ts";
  const catalogPullRoutePath = "src/app/api/pos/catalog/pull/route.ts";
  const heartbeatRoutePath = "src/app/api/pos/session/heartbeat/route.ts";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    migrationPath,
    adminClientPath,
    tokenPath,
    servicePath,
    posRouteSecurityPath,
    firstLoginRoutePath,
    heartbeatRoutePath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const migration = read(migrationPath);
  const adminClient = read(adminClientPath);
  const tokens = read(tokenPath);
  const service = read(servicePath);
  const catalogPullService = existsSync(join(root, catalogPullServicePath))
    ? read(catalogPullServicePath)
    : "";
  const posRouteSecurity = read(posRouteSecurityPath);
  const foundationTest = read(foundationTestPath);
  const firstLoginRoute = read(firstLoginRoutePath);
  const catalogPullRoute = existsSync(join(root, catalogPullRoutePath))
    ? read(catalogPullRoutePath)
    : "";
  const heartbeatRoute = read(heartbeatRoutePath);
  const clientSurface = [
    ...listFiles("src/components"),
    ...listFiles("public"),
    "src/lib/supabase/client.ts",
  ]
    .filter((file) => existsSync(join(root, file)))
    .map(read)
    .join("\n");
  const appRoutes = listFiles("src/app");
  const allowedPosRoutes = new Set([
    posRouteSecurityPath,
    firstLoginRoutePath,
    catalogPullRoutePath,
    heartbeatRoutePath,
  ]);
  if (isTask041RuntimeCompletionActive()) {
    allowedPosRoutes.add("src/app/api/pos/sales/sync/route.ts");
  }
  const unexpectedPosRoutes = appRoutes.filter(
    (file) =>
      /^src\/app\/(?:api\/)?pos(?:\/|$)/i.test(file) &&
      !allowedPosRoutes.has(file),
  );
  const runtimeSource = [
    migration,
    adminClient,
    tokens,
    service,
    catalogPullService,
    posRouteSecurity,
    firstLoginRoute,
    catalogPullRoute,
    heartbeatRoute,
  ].join("\n");

  for (const requiredSnippet of [
    "Route Handler Next.js",
    "server-only",
    "service-role solo server-side",
    "trusted device token hash",
    "heartbeat",
    "revoca device",
    "No sales sync",
  ]) {
    if (!task.includes(requiredSnippet) && !evidence.includes(requiredSnippet)) {
      addFailure(`TASK-021 docs must include ${requiredSnippet}`);
    }
  }

  if (/Stato: `DONE`/.test(task) || /Stato task: `DONE`/.test(evidence)) {
    if (!/Fase: `DONE_RECONCILED`/.test(task) || !/Fase: `DONE_RECONCILED`/.test(evidence)) {
      addFailure("TASK-021 DONE state must be reconciled with explicit review evidence");
    }

    if (!/Review\/reconciliation finale/.test(task) || !/Review\/reconciliation finale/.test(evidence)) {
      addFailure("TASK-021 DONE state must document final review/reconciliation");
    }
  }

  for (const requiredSnippet of [
    "create table if not exists public.pos_device_credentials",
    "create table if not exists public.pos_sessions",
    "token_hash text not null",
    "session_token_hash text not null",
    "alter table public.pos_device_credentials enable row level security",
    "alter table public.pos_sessions enable row level security",
    "app_private.revoke_pos_auth_on_shop_device_revoked",
  ]) {
    if (!migration.includes(requiredSnippet)) {
      addFailure(`${migrationPath} must include ${requiredSnippet}`);
    }
  }

  if (
    /grant\s+(select|insert|update|delete|all)[\s\S]*on table public\.pos_(device_credentials|sessions)[\s\S]*to\s+(anon|authenticated)/i.test(
      migration,
    )
  ) {
    addFailure(`${migrationPath} must not grant POS runtime tables to anon/authenticated`);
  }

  if (/\b(device_token|trusted_token|session_token|refresh_token)\s+text\b/i.test(migration)) {
    addFailure(`${migrationPath} must not store raw POS token columns`);
  }

  if (!/import "server-only"/.test(adminClient) || !/SUPABASE_SERVICE_ROLE_KEY/.test(adminClient)) {
    addFailure(`${adminClientPath} must be server-only and resolve the service-role env name`);
  }

  if (!/hashPosSecret/.test(tokens) || !/timingSafeEqual/.test(tokens)) {
    addFailure(`${tokenPath} must hash and compare POS secrets safely`);
  }

  for (const requiredSnippet of [
    "verifyStaffCredential",
    "hashPosSecret",
    "MAX_CREDENTIAL_LENGTH",
    "MAX_POS_SECRET_LENGTH",
    "isStaffLockoutActive",
    "cleanupFailedFirstLogin",
    "sessionTokenValid",
    "deviceTokenValid",
    "pos.auth.first_login.success",
    "pos.auth.first_login.failure",
    "pos.device.trusted",
    "pos.session.heartbeat.success",
    "pos.session.heartbeat.failure",
    "pos.device.revoked_enforced",
  ]) {
    if (!service.includes(requiredSnippet)) {
      addFailure(`${servicePath} must include ${requiredSnippet}`);
    }
  }

  if (!/credential_status: "active"/.test(service)) {
    addFailure(`${servicePath} must reactivate expired lockout state after successful credential verification`);
  }

  if (!/const auditOk = await writePosAudit/.test(service) || !/if \(!auditOk\) \{/.test(service)) {
    addFailure(`${servicePath} must fail closed when required audit writes fail`);
  }

  if (!/const trustedAuditOk = await writePosAudit/.test(service) || !/const firstLoginAuditOk = await writePosAudit/.test(service)) {
    addFailure(`${servicePath} must require both trusted-device and first-login success audits`);
  }

  if (/!verifyPosSecret\(parsed\.sessionToken[\s\S]{0,260}markSessionDenied/.test(service)) {
    addFailure(`${servicePath} must not permanently block a session solely because a heartbeat token is wrong`);
  }

  for (const requiredSnippet of [
    "const credentialMatchesSession =",
    "credential.pos_device_credential_id === session.pos_device_credential_id",
    "credential.shop_id === session.shop_id",
    "credential.shop_device_id === session.shop_device_id",
    "credential.staff_id === session.staff_id",
    "!credentialMatchesSession",
  ]) {
    if (!service.includes(requiredSnippet)) {
      addFailure(`${servicePath} must bind heartbeat credentials to the same session/shop/device/staff`);
    }
  }

  if (/select\(["']\*["']\)/.test(service)) {
    addFailure(`${servicePath} must not use select("*")`);
  }

  if (/console\.(log|debug|info|warn|error)/.test(runtimeSource)) {
    addFailure("TASK-021 runtime source must not log sensitive details");
  }

  for (const requiredSnippet of [
    "MAX_POS_JSON_BODY_BYTES",
    "application/json",
    "content-length",
    "getReader",
    "JSON.parse",
    "Cache-Control",
    "no-store",
  ]) {
    if (!posRouteSecurity.includes(requiredSnippet)) {
      addFailure(`${posRouteSecurityPath} must include ${requiredSnippet}`);
    }
  }

  if (/pin_plain|password_plain|plain_pin|plain_password/i.test(runtimeSource)) {
    addFailure("TASK-021 runtime source must not name plaintext credential storage");
  }

  if (
    !isTask041RuntimeCompletionActive() &&
    /pos_sales_sync|pos_sync_batches|src\/app\/api\/pos\/sales/i.test(runtimeSource)
  ) {
    addFailure("TASK-021 must not implement sales sync");
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(clientSurface)) {
    addFailure("TASK-021 client/browser surface must not expose service-role material");
  }

  for (const route of [firstLoginRoute, catalogPullRoute, heartbeatRoute].filter(Boolean)) {
    if (!/export const dynamic = "force-dynamic"/.test(route)) {
      addFailure("TASK-021 POS routes must be dynamic");
    }

    if (!/export const runtime = "nodejs"/.test(route)) {
      addFailure("TASK-021 POS routes must run on nodejs runtime");
    }

    if (!/export async function POST/.test(route) || /export async function GET/.test(route)) {
      addFailure("TASK-021 POS routes must expose POST only");
    }

    if (/SUPABASE_SERVICE_ROLE_KEY|credential_hash|service_role/i.test(route)) {
      addFailure("TASK-021 POS routes must delegate privileged logic to server-only modules");
    }

    if (!/readPosJsonBody/.test(route) || !/posJsonResponse/.test(route)) {
      addFailure("TASK-021 POS routes must use shared POS JSON hardening helper");
    }
  }

  if (unexpectedPosRoutes.length > 0) {
    addFailure(
      `TASK-021/TASK-026/TASK-027 allow only scoped POS routes, found: ${unexpectedPosRoutes.join(", ")}`,
    );
  }

  if (!/checkTask021PosBackendSessionDeviceEndpoints/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-021 security scanner gate`);
  }
}

function listExternalFiles(start, extensions) {
  if (!existsSync(start)) {
    return [];
  }

  const entries = readdirSync(start);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(start, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (!excludedDirectories.has(entry) && entry !== "bin" && entry !== "obj") {
        files.push(...listExternalFiles(absolutePath, extensions));
      }
      continue;
    }

    if (stats.isFile() && extensions.some((extension) => entry.endsWith(extension))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function checkTask022023PosDashboardWin7PosClient() {
  const win7PosRoot = resolveExternalRepoPath(
    "WIN7POS_REPO_PATH",
    "/Users/minxiang/Projects/Win7POS",
  );
  const win7ConfigFileName = "pos-admin-web.config";
  const taskPath = "docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-022-023/README.md";
  const dashboardRoutePath = "src/app/shop/pos/page.tsx";
  const readModelPath = "src/server/shop-admin/pos-live-read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const sectionsPath = "src/components/shop/shopSections.ts";
  const foundationTestPath =
    "tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs";
  const win7RequiredPaths = [
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs",
    "src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs",
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs",
    "src/Win7POS.Wpf/Pos/Online/PosDeviceIdentity.cs",
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs",
    "scripts/check-pos-online-client.ps1",
  ];

  for (const requiredPath of [
    taskPath,
    evidencePath,
    dashboardRoutePath,
    readModelPath,
    sectionDataPath,
    sectionsPath,
    foundationTestPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  if (
    skipOrFailMissingExternalRepo({
      envName: "WIN7POS_REPO_PATH",
      label: "Win7POS",
      path: win7PosRoot,
      requiredEnvName: "REQUIRE_WIN7POS_REPO",
    })
  ) {
    return;
  }

  for (const relativePath of win7RequiredPaths) {
    if (!existsSync(join(win7PosRoot, relativePath))) {
      addFailure(`Win7POS ${relativePath} is missing`);
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const route = read(dashboardRoutePath);
  const readModel = read(readModelPath);
  const sectionData = read(sectionDataPath);
  const sections = read(sectionsPath);
  const foundationTest = read(foundationTestPath);
  const dashboardSource = `${route}\n${readModel}\n${sectionData}\n${sections}`;
  const clientSurface = [
    ...listFiles("src/components"),
    dashboardRoutePath,
    sectionsPath,
  ]
    .map((file) => read(file))
    .join("\n");
  const win7Source = listExternalFiles(join(win7PosRoot, "src"), [
    ".cs",
    ".xaml",
    ".csproj",
  ])
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const win7Client = readFileSync(
    join(win7PosRoot, "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs"),
    "utf8",
  );
  const win7Store = readFileSync(
    join(win7PosRoot, "src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs"),
    "utf8",
  );
  const win7Options = readFileSync(
    join(win7PosRoot, "src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs"),
    "utf8",
  );
  const win7OperatorDialog = readFileSync(
    join(win7PosRoot, "src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs"),
    "utf8",
  );
  const win7MainWindow = readFileSync(
    join(win7PosRoot, "src/Win7POS.Wpf/MainWindow.xaml.cs"),
    "utf8",
  );
  const win7IntegrationSource = [
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs",
    "src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs",
    "src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs",
    "src/Win7POS.Wpf/Pos/Online/PosDeviceIdentity.cs",
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs",
    "src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml",
    "src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs",
    "src/Win7POS.Wpf/MainWindow.xaml.cs",
  ]
    .map((relativePath) => readFileSync(join(win7PosRoot, relativePath), "utf8"))
    .join("\n");

  for (const required of [
    "TASK-022",
    "TASK-023",
    "Win7POS",
    "No sales sync",
    "trusted device",
    "heartbeat",
  ]) {
    if (!new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(`${task}\n${evidence}`)) {
      addFailure(`${taskPath} and evidence must mention ${required}`);
    }
  }

  if (!/Stato: `(IN_PROGRESS|REVIEW)`/.test(task) || /DONE_RECONCILED/.test(task)) {
    addFailure(`${taskPath} must stay IN_PROGRESS or REVIEW until user confirmation`);
  }

  if (!/export const dynamic = "force-dynamic"/.test(route) || !/getShopSectionForRequest\(\s*"pos"/.test(route)) {
    addFailure(`${dashboardRoutePath} must render the POS section dynamically`);
  }

  for (const requiredSnippet of [
    'import "server-only"',
    "createSupabaseAdminClient",
    "resolveShopAdminDataAccess",
    '.from("shop_devices")',
    '.from("pos_device_credentials")',
    '.from("pos_sessions")',
    '.from("staff_accounts_safe")',
    '.from("audit_logs")',
    '.eq("shop_id", selectedShop.shopId)',
  ]) {
    if (!readModel.includes(requiredSnippet)) {
      addFailure(`${readModelPath} must include ${requiredSnippet}`);
    }
  }

  if (/select\(["']\*["']\)/.test(readModel)) {
    addFailure(`${readModelPath} must not use select("*")`);
  }

  if (/\.(insert|update|delete|upsert|rpc)\s*\(/.test(readModel)) {
    addFailure(`${readModelPath} must stay read-only`);
  }

  if (/token_hash|session_token_hash|trustedDeviceToken|deviceToken|sessionToken/.test(readModel)) {
    addFailure(`${readModelPath} must not select or expose POS secret fields`);
  }

  if (!/key: "pos"/.test(sections) || !/href: "\/shop\/pos"/.test(sections)) {
    addFailure(`${sectionsPath} must register the POS Live Shop Admin section`);
  }

  if (!/buildPosLiveSection/.test(sectionData) || !/getShopPosLiveReadModel/.test(sectionData)) {
    addFailure(`${sectionDataPath} must build the POS live section from the POS read model`);
  }

  if (/sales today|revenue|orders|pos_sales|sales_sync|sync_batch/i.test(dashboardSource)) {
    addFailure("TASK-022 dashboard must not render sales/sync metrics outside scope");
  }

  if (/mock|fake|demo/i.test(dashboardSource)) {
    addFailure("TASK-022 dashboard must not label fake data as live data");
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(clientSurface)) {
    addFailure("TASK-022 client/browser surface must not expose service-role material");
  }

  for (const requiredSnippet of [
    "HttpClient",
    "SecurityProtocolType.Tls12",
    "Timeout =",
    "/api/pos/auth/first-login",
    "/api/pos/session/heartbeat",
  ]) {
    if (!win7Client.includes(requiredSnippet)) {
      addFailure(`Win7POS PosAdminWebClient.cs must include ${requiredSnippet}`);
    }
  }

  if (!/ProtectedData\.Protect/.test(win7Store) || !/ProtectedData\.Unprotect/.test(win7Store)) {
    addFailure("Win7POS trusted device store must use DPAPI ProtectedData");
  }

  if (!/WIN7POS_ADMIN_WEB_BASE_URL/.test(win7Options) || !new RegExp(win7ConfigFileName.replace(".", "\\.")).test(win7Options)) {
    addFailure("Win7POS Admin Web base URL must come from env/config file");
  }

  if (!/PosOnlineFirstLoginDialog/.test(win7OperatorDialog) || !/TryRefreshTrustedPosSessionAsync/.test(win7MainWindow)) {
    addFailure("Win7POS must expose first login UI and startup heartbeat");
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(win7Source)) {
    addFailure("Win7POS must not reference service-role material");
  }

  if (/mcpos_(device|session)_[A-Za-z0-9_-]+/.test(win7Source)) {
    addFailure("Win7POS must not hardcode POS tokens");
  }

  if (/https:\/\/(?!localhost|127\.0\.0\.1)/i.test(win7IntegrationSource)) {
    addFailure("Win7POS must not hardcode production HTTPS URLs");
  }

  if (
    !isTask041RuntimeCompletionActive() &&
    /pos_sales|sales_sync|sync_batch|api\/pos\/sales/i.test(win7Source)
  ) {
    addFailure("TASK-023 must not implement sales sync");
  }

  if (!/checkTask022023PosDashboardWin7PosClient/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-022_023 security scanner gate`);
  }
}

function checkTask027CatalogPullDeltaSync() {
  const win7PosRoot = resolveExternalRepoPath(
    "WIN7POS_REPO_PATH",
    "/Users/minxiang/Projects/Win7POS",
  );
  const taskPath =
    "docs/TASKS/TASK-027-catalog-pull-delta-sync-and-pos-catalog-hardening.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-027/README.md";
  const helperPath = "src/server/pos-auth/catalog-sync-contract.ts";
  const servicePath = "src/server/pos-auth/catalog-pull.ts";
  const readModelPath = "src/server/shop-admin/pos-live-read-model.ts";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const foundationTestPath =
    "tests/foundation/task-027-catalog-pull-delta-sync.test.mjs";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    helperPath,
    servicePath,
    readModelPath,
    sectionDataPath,
    foundationTestPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const helper = read(helperPath);
  const service = read(servicePath);
  const readModel = read(readModelPath);
  const sectionData = read(sectionDataPath);
  const foundationTest = read(foundationTestPath);
  const combined = `${task}\n${evidence}\n${helper}\n${service}\n${readModel}\n${sectionData}`;

  for (const requiredSnippet of [
    "updated_since",
    "syncCursor",
    "catalogVersion",
    "serverTime",
    "hasMore",
    "tombstones",
    "no purge distruttivo",
    "DONE_RECONCILED_WITH_NOTES",
  ]) {
    if (!combined.includes(requiredSnippet)) {
      addFailure(`TASK-027 artifacts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "parseCatalogSyncOptions",
    "buildNextCatalogSyncCursor",
    "splitCatalogTombstones",
    "computeCatalogVersion",
    "CatalogPullWithRetryAsync",
  ]) {
    if (!`${combined}\n${foundationTest}`.includes(requiredSnippet)) {
      addFailure(`TASK-027 code/tests must include ${requiredSnippet}`);
    }
  }

  if (!/\.eq\("owner_user_id", ownerUserId\)/.test(service)) {
    addFailure("TASK-027 catalog pull must remain owner/shop scoped");
  }

  if (!/\.gte\("updated_at", syncOptions\.lowerBound\)/.test(service) || !/\.range\(/.test(service)) {
    addFailure("TASK-027 catalog pull must use updated_at lower bound and pagination");
  }

  if (/\.(delete|upsert)\s*\(/.test(service) || /truncate|purge|replace_all/i.test(service)) {
    addFailure("TASK-027 catalog pull must not perform destructive purge/write behavior");
  }

  if (/sale_lines|sales_sync|payment|cash_close|bidirectional/i.test(`${helper}\n${service}`)) {
    addFailure("TASK-027 must not introduce sales sync or bidirectional catalog sync");
  }

  if (!/metadata_redacted/.test(readModel) || !/Catalog sync/.test(sectionData)) {
    addFailure("TASK-027 must expose real catalog pull diagnostics from audit metadata");
  }

  if (!/sync_cursor_preview/.test(`${service}\n${readModel}`) || /sync_cursor:\s*syncCursor/.test(service)) {
    addFailure("TASK-027 audit metadata must redact catalog cursors before diagnostics");
  }

  if (existsSync(win7PosRoot)) {
    const win7Client = readFileSync(
      join(win7PosRoot, "src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs"),
      "utf8",
    );
    const win7Service = readFileSync(
      join(win7PosRoot, "src/Win7POS.Wpf/Pos/Online/PosCatalogPullService.cs"),
      "utf8",
    );

    for (const requiredSnippet of [
      "pos.catalog.last_sync_cursor",
      "CatalogPullWithRetryAsync",
      "Task.Delay",
      "SyncCursor = await LoadLastCursorAsync",
      'DataMember(Name = "syncCursor"',
      'DataMember(Name = "updated_since"',
      'DataMember(Name = "tombstones"',
    ]) {
      if (!`${win7Client}\n${win7Service}`.includes(requiredSnippet)) {
        addFailure(`Win7POS TASK-027 catalog pull must include ${requiredSnippet}`);
      }
    }

    if (/pos_sales|sales_sync|sync_batch|api\/pos\/sales/i.test(`${win7Client}\n${win7Service}`)) {
      addFailure("TASK-027 Win7POS changes must not introduce sales sync");
    }
  }

  if (!/checkTask027CatalogPullDeltaSync/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-027 security scanner gate`);
  }
}

function checkTask037ShopAdminDualAccessModel() {
  const taskPath = "docs/TASKS/TASK-037-shop-admin-dual-access-model.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-037/README.md";
  const architecturePath = "docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md";
  const principalPath = "src/server/shop-admin/access-principal.ts";
  const foundationTestPath = "tests/foundation/task-037-dual-access-model.test.mjs";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    architecturePath,
    principalPath,
    foundationTestPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-037`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const architecture = read(architecturePath);
  const principal = read(principalPath);
  const foundationTest = read(foundationTestPath);
  const masterPlan = read("docs/MASTER-PLAN.md");
  const combinedDocs = `${task}\n${evidence}\n${architecture}\n${masterPlan}`;
  const migrationNames = listFiles("supabase/migrations").map((file) =>
    file.split("/").pop() ?? file,
  );
  const appRouteFiles = listFiles("src/app");

  for (const requiredSnippet of [
    "personal_account",
    "pos_staff_manager",
    "shop_members",
    "staff_accounts",
    "staff_accounts_safe",
    "credential_status",
    "single-shop",
    "multi-shop",
    "cashier/operator",
    "No Sales Sync",
    "No Google/Apple/WeChat",
    "No email invite",
    "No Win7POS/Android/iOS changes",
    "DONE",
    "`admin` role_key: `NOT_PRESENT_IN_SCHEMA`",
    "Current schema staff web role: `manager` only",
    "staff manager web login completo: `PLANNED_NOT_IMPLEMENTED`",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-037 docs must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    'import "server-only"',
    "ShopAdminPersonalAccountPrincipal",
    "ShopAdminPosStaffManagerPrincipal",
    "resolveCurrentShopAdminPrincipal",
    "resolvePosStaffManagerWebPrincipal",
    "isPosStaffEligibleForShopAdminWeb",
    "POS_STAFF_WEB_REQUIRED_PERMISSION",
    "POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY",
    "POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY",
    "shop_admin.full_access",
    "pos_staff_web_session_planned",
    "staff_web_login_not_implemented",
  ]) {
    if (!principal.includes(requiredSnippet)) {
      addFailure(`${principalPath} must include ${requiredSnippet}`);
    }
  }

  if (/createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|credential_hash|pin_plain|password_plain|plain_pin|plain_password/i.test(principal)) {
    addFailure(`${principalPath} must not handle service-role or raw staff credentials`);
  }

  if (!/input\.roleKey === POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY/.test(principal)) {
    addFailure(`${principalPath} must restrict current staff web eligibility to the verified manager role`);
  }

  if (/new Set\(\["manager", "admin"\]\)|posStaffWebRoleKeys\.has|principalCanSelectShop|principalShopRole/.test(principal)) {
    addFailure(`${principalPath} must not accept future admin role or expose unused authorization helpers`);
  }

  if (migrationNames.some((file) => /task_037|task-037/i.test(file))) {
    addFailure("TASK-037 must not create a Supabase migration");
  }

  const unexpectedStaffLoginRoutes = appRouteFiles.filter((file) =>
    /staff.*login|login.*staff|pos.*manager.*login/i.test(file),
  );

  const task038Opened = /TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate/.test(
    masterPlan,
  );

  if (unexpectedStaffLoginRoutes.length > 0 && !task038Opened) {
    addFailure(
      `TASK-037 must not add staff web login routes: ${unexpectedStaffLoginRoutes.join(", ")}`,
    );
  }

  if (!/checkTask037ShopAdminDualAccessModel/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-037 security scanner gate`);
  }
}

function checkTask038PosManagerWebLogin() {
  const taskPath =
    "docs/TASKS/TASK-038-pos-manager-web-login-platform-provisioning-permissions-revenue-gate.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-038/README.md";
  const architecturePath = "docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md";
  const authPath = "src/server/shop-admin/staff-web-auth.ts";
  const permissionsPath = "src/server/shop-admin/staff-web-permissions.ts";
  const loginPagePath = "src/app/(staff-auth)/shop/staff-login/page.tsx";
  const loginActionsPath = "src/app/(staff-auth)/shop/staff-login/actions.ts";
  const logoutRoutePath = "src/app/shop/staff-logout/route.ts";
  const platformProvisioningPath =
    "src/server/platform-admin/staff-manager-provisioning.ts";
  const platformProvisioningActionsPath =
    "src/app/platform/provisioning/actions.ts";
  const platformProvisioningPanelPath =
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx";
  const platformProvisioningPagePath = "src/app/platform/provisioning/page.tsx";
  const foundationTestPath = "tests/foundation/task-038-pos-manager-web-login.test.mjs";
  const migrationName = listFiles("supabase/migrations")
    .map((file) => file.split("/").pop() ?? file)
    .find((file) => /task_038_pos_manager_web_login/i.test(file));

  for (const requiredPath of [
    taskPath,
    evidencePath,
    architecturePath,
    authPath,
    permissionsPath,
    loginPagePath,
    loginActionsPath,
    logoutRoutePath,
    platformProvisioningPath,
    platformProvisioningActionsPath,
    platformProvisioningPanelPath,
    platformProvisioningPagePath,
    foundationTestPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-038`);
      return;
    }
  }

  if (!migrationName) {
    addFailure("TASK-038 migration is missing");
    return;
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const architecture = read(architecturePath);
  const migration = read(`supabase/migrations/${migrationName}`);
  const auth = read(authPath);
  const permissions = read(permissionsPath);
  const loginPage = read(loginPagePath);
  const loginActions = read(loginActionsPath);
  const logoutRoute = read(logoutRoutePath);
  const platformProvisioning = read(platformProvisioningPath);
  const platformProvisioningActions = read(platformProvisioningActionsPath);
  const platformProvisioningPanel = read(platformProvisioningPanelPath);
  const platformProvisioningPage = read(platformProvisioningPagePath);
  const shopLayout = read("src/app/shop/layout.tsx");
  const foundationTest = read(foundationTestPath);
  const combinedDocs = `${task}\n${evidence}\n${architecture}\n${read("docs/MASTER-PLAN.md")}`;

  for (const requiredSnippet of [
    "TASK-038",
    "personal_account",
    "pos_staff_manager",
    "staff_web_sessions",
    "staff_web_login_attempts",
    "staff_role_permissions",
    "shop_admin.full_access",
    "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA",
    "Revenue dashboard requires real sales sync data",
    "No Sales Sync",
    "No dashboard vendite fake",
    "No Win7POS/Android/iOS",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-038 docs must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "create table if not exists public.staff_web_sessions",
    "create table if not exists public.staff_web_login_attempts",
    "create table if not exists public.staff_role_permissions",
    "session_token_hash text not null",
    "attempt_key_hash text primary key",
    "permission_key text not null",
    "shop_admin.full_access",
    "enable row level security",
    "revoke all on table public.staff_web_sessions from anon",
    "revoke all on table public.staff_web_login_attempts from anon",
    "revoke all on table public.staff_role_permissions from anon",
  ]) {
    if (!migration.includes(requiredSnippet)) {
      addFailure(`TASK-038 migration must include ${requiredSnippet}`);
    }
  }

  if (/\b(session_token|raw_token|credential|password|pin)\s+text\b/i.test(migration)) {
    addFailure("TASK-038 migration must store only hashed staff web secrets");
  }

  if (/pos_sales|sales_sync|sale_payments|receipts/i.test(migration)) {
    addFailure("TASK-038 migration must not introduce Sales Sync or revenue tables");
  }

  for (const requiredSnippet of [
    'import "server-only"',
    "STAFF_WEB_SESSION_COOKIE",
    "httpOnly: true",
    'sameSite: "lax"',
    "secure: isSecureStaffWebCookie",
    "hashStaffWebSecret",
    "verifyStaffCredential",
    "staff_web_sessions",
    "staff_web_login_attempts",
    'staff.role_key !== "manager"',
    "hasStaffFullShopAdminWebAccess",
    "staff.web.login.success",
    "staff.web.login.failure",
    "staff.web.logout",
  ]) {
    if (!auth.includes(requiredSnippet)) {
      addFailure(`${authPath} must include ${requiredSnippet}`);
    }
  }

  if (
    /localStorage|sessionStorage|console\.(log|debug|info|warn|error)/.test(
      `${auth}\n${loginPage}\n${loginActions}\n${logoutRoute}`,
    )
  ) {
    addFailure("TASK-038 staff web runtime must not use browser storage or runtime logging");
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash/i.test(`${loginPage}\n${loginActions}\n${logoutRoute}`)) {
    addFailure("TASK-038 staff web routes must not expose service-role, credential hashes or token hashes");
  }

  for (const requiredSnippet of [
    "SHOP_STAFF_WEB_PERMISSION_TREE",
    "STAFF_WEB_FULL_ACCESS_PERMISSION",
    "shop_admin.full_access",
    "getEnabledStaffRolePermissions",
  ]) {
    if (!permissions.includes(requiredSnippet)) {
      addFailure(`${permissionsPath} must include ${requiredSnippet}`);
    }
  }

  if (!/"use server"/.test(loginActions)) {
    addFailure(`${loginActionsPath} must be a Server Actions module`);
  }

  for (const requiredSnippet of ["shopCode", "staffCode", "credential"]) {
    if (!loginPage.includes(requiredSnippet)) {
      addFailure(`${loginPagePath} must include ${requiredSnippet}`);
    }
  }

  if (!/logoutStaffWebSession/.test(logoutRoute)) {
    addFailure(`${logoutRoutePath} must call logoutStaffWebSession`);
  }

  for (const requiredSnippet of [
    'import "server-only"',
    "authorizeCurrentPlatformAdmin",
    "createSupabaseAdminClient",
    "hashStaffCredential",
    "staff_accounts",
    "staff_role_permissions",
    "shop_admin.full_access",
    "platform.staff_manager_web.provision.success",
    "platform.staff_manager_web.provision.failure",
    "oneTimeSignInValue",
  ]) {
    if (!platformProvisioning.includes(requiredSnippet)) {
      addFailure(`${platformProvisioningPath} must include ${requiredSnippet}`);
    }
  }

  if (!/"use server"/.test(platformProvisioningActions)) {
    addFailure(`${platformProvisioningActionsPath} must be a Server Actions module`);
  }

  for (const requiredSnippet of [
    "provisionPlatformStaffManagerAction",
    "StaffManagerProvisioningPanel",
    "shopId",
    "staffCode",
    "displayName",
    "reason",
  ]) {
    if (!`${platformProvisioningActions}\n${platformProvisioningPanel}\n${platformProvisioningPage}`.includes(requiredSnippet)) {
      addFailure(`Platform staff manager provisioning UI must include ${requiredSnippet}`);
    }
  }

  if (
    /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash|hashStaffCredential/i.test(
      platformProvisioningActions,
    )
  ) {
    addFailure(`${platformProvisioningActionsPath} must not expose stored secret fields`);
  }

  if (
    /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash|hashStaffCredential/i.test(
      `${platformProvisioningPanel}\n${platformProvisioningPage}`,
    )
  ) {
    addFailure("Platform provisioning page surface must not expose stored secret fields");
  }

  if (/@\/server\//.test(platformProvisioningPanel)) {
    addFailure(`${platformProvisioningPanelPath} must not import server modules`);
  }

  if (!/resolveCurrentShopAdminPrincipal/.test(shopLayout) || !/principal\.kind/.test(shopLayout)) {
    addFailure("Shop Admin layout must resolve explicit TASK-038 principal kinds");
  }

  if (!/checkTask038PosManagerWebLogin/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-038 security scanner gate`);
  }
}

function checkTask039StaffAwareShopAdminCompletion() {
  const taskPath = "docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-039/README.md";
  const foundationTestPath =
    "tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs";
  const actionContextPath = "src/server/shop-admin/action-context.ts";
  const dataAccessPath = "src/server/shop-admin/data-access.ts";
  const accessPrincipalPath = "src/server/shop-admin/access-principal.ts";
  const staffWebPermissionsPath =
    "src/server/shop-admin/staff-web-permissions.ts";
  const staffAwareMutationsPath = "src/server/shop-admin/staff-aware-mutations.ts";
  const settingsMutationsPath = "src/server/shop-admin/settings-mutations.ts";
  const databaseTypesPath = "src/lib/supabase/database.types.ts";
  const gatedPagePaths = [
    "src/app/shop/staff/page.tsx",
    "src/app/shop/settings/page.tsx",
    "src/app/shop/products/page.tsx",
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/devices/page.tsx",
    "src/app/shop/import-export/page.tsx",
    "src/app/shop/members/page.tsx",
  ];

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    actionContextPath,
    dataAccessPath,
    accessPrincipalPath,
    staffWebPermissionsPath,
    staffAwareMutationsPath,
    settingsMutationsPath,
    databaseTypesPath,
    ...gatedPagePaths,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-039`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read("docs/MASTER-PLAN.md");
  const actionContext = read(actionContextPath);
  const dataAccess = read(dataAccessPath);
  const accessPrincipal = read(accessPrincipalPath);
  const staffWebPermissions = read(staffWebPermissionsPath);
  const staffAwareMutations = read(staffAwareMutationsPath);
  const settingsMutations = read(settingsMutationsPath);
  const databaseTypes = read(databaseTypesPath);
  const foundationTest = read(foundationTestPath);
  const gatedPages = gatedPagePaths.map((pagePath) => read(pagePath)).join("\n");
  const combinedDocs = `${task}\n${evidence}\n${masterPlan}`;

  for (const requiredSnippet of [
    "TASK-039",
    "Staff-aware Shop Admin completion",
    "DONE_RECONCILED",
    "READY_FOR_DONE_CONFIRMATION",
    "resolveShopActionContext",
    "resolveShopAdminDataAccess",
    "pos_staff_manager",
    "personal_account",
    "staff_role_permissions",
    "shop_admin.full_access",
    "actor_staff_id",
    "auth.uid()",
    "shop_members",
    "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA",
    "PARKED_E2E_PENDING",
    "BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION",
    "BLOCKED_LOCAL_SUPABASE_ENV",
    "FOLDED_INTO_TASK-040",
    "TASK-043",
    "TASK-044",
    "TASK-045",
    "TASK-046",
    "No commit eseguito",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-039 docs must include ${requiredSnippet}`);
    }
  }

  if (
    !/Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    )
  ) {
    addFailure("MASTER-PLAN must track TASK-040 or its TASK-041 superseding runtime task after TASK-039 closure");
  }

  if (!/canStaffWebPerformShopAdminAction/.test(actionContext)) {
    addFailure(`${actionContextPath} must authorize staff web mutators through granular permissions`);
  }

  if (!/resolveShopAdminDataAccess/.test(dataAccess) || !/pos_staff_manager/.test(dataAccess)) {
    addFailure(`${dataAccessPath} must retain dual read-model actor resolution`);
  }

  if (
    !/hasRecognizedWebPermission/.test(accessPrincipal) ||
    !/isShopStaffWebPermission\(permission\)/.test(accessPrincipal)
  ) {
    addFailure(`${accessPrincipalPath} must whitelist recognized staff web permissions during principal eligibility`);
  }

  if (
    !/SHOP_STAFF_WEB_PERMISSION_TREE/.test(staffWebPermissions) ||
    !/SHOP_STAFF_WEB_ROLE_TEMPLATES/.test(staffWebPermissions) ||
    !/canStaffWebPerformShopAdminAction/.test(staffWebPermissions) ||
    !/catalog\.write/.test(staffWebPermissions) ||
    !/sync\.read/.test(staffWebPermissions)
  ) {
    addFailure(`${staffWebPermissionsPath} must keep the granular staff web permission tree`);
  }

  if (!/actor_profile_id/.test(databaseTypes) || !/actor_staff_id/.test(databaseTypes)) {
    addFailure(`${databaseTypesPath} must expose personal and staff audit actors`);
  }

  if (
    !/runStaffAwareShopAdminMutation/.test(staffAwareMutations) ||
    !/write_staff_shop_admin_audit/.test(staffAwareMutations) ||
    !/actorStaffId/.test(staffAwareMutations) ||
    !/replaceStaffRolePermissions/.test(staffAwareMutations) ||
    !/staleStaffWebPermissions/.test(staffAwareMutations) ||
    !/\.upsert\(/.test(staffAwareMutations) ||
    !/onConflict: "shop_id,role_key,permission_key"/.test(staffAwareMutations) ||
    !/hasStaffFullShopAdminWebAccess\(context\.staffPermissions\)/.test(staffAwareMutations) ||
    !/code: "unauthorized"/.test(staffAwareMutations)
  ) {
    addFailure(`${staffAwareMutationsPath} must implement the staff-aware mutation/audit boundary`);
  }

  if (
    /\.from\("staff_role_permissions"\)[\s\S]{0,240}\.delete\(\)[\s\S]{0,240}\.insert\(/.test(
      staffAwareMutations,
    )
  ) {
    addFailure(`${staffAwareMutationsPath} must not delete all role permissions before insert`);
  }

  if (
    !/adminConfig\.status !== "configured"/.test(settingsMutations) ||
    !/adminConfig\.status !== "configured"[\s\S]{0,260}shopAdminActionResult\("not_configured"/.test(
      settingsMutations,
    ) ||
    !/writeSettingsAudit\(adminClient, context/.test(settingsMutations)
  ) {
    addFailure(`${settingsMutationsPath} must fail closed before using admin client and write settings audit with the server-side admin client`);
  }

  for (const requiredPermission of [
    "staff.manage",
    "settings.write",
    "products.write",
    "categories.write",
    "suppliers.write",
    "devices.manage",
    "catalog.import",
    "catalog.export",
    "members.manage",
  ]) {
    if (
      !gatedPages.includes("resolveShopActionContext") ||
      !gatedPages.includes(requiredPermission)
    ) {
      addFailure(`TASK-039 Shop Admin UI pages must preflight ${requiredPermission}`);
    }
  }

  if (
    !listFiles("supabase/migrations").some((file) =>
      /task_039_staff_aware_shop_admin/i.test(file),
    )
  ) {
    addFailure("TASK-039 must include the staff-aware audit migration");
  }

  if (
    !isTask041RuntimeCompletionActive() &&
    existsSync(join(root, "src/app/api/pos/sales"))
  ) {
    addFailure("TASK-039 audit phase must not introduce POS sales runtime routes");
  }

  if (!/checkTask039StaffAwareShopAdminCompletion/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-039 security scanner gate`);
  }
}

function checkTask040RuntimeReadiness() {
  const taskPath =
    "docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-040/README.md";
  const foundationTestPath = "tests/foundation/task-040-runtime-readiness.test.mjs";
  const masterPlan = read("docs/MASTER-PLAN.md");

  for (const requiredPath of [taskPath, evidencePath, foundationTestPath]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-040`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const combinedDocs = `${task}\n${evidence}\n${masterPlan}`;

  for (const requiredSnippet of [
    "TASK-040",
    "Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation",
    "PARTIAL_PASS_WITH_BLOCKERS",
    "REVIEW_WITH_EXTERNAL_BLOCKERS",
    "FOLDED_INTO_TASK-040",
    "ex TASK-043",
    "ex TASK-044",
    "ex TASK-045",
    "ex TASK-046",
    "TASK-029",
    "TASK-031",
    "TASK-032",
    "TASK-033",
    "TASK-022_023",
    "BLOCKED_LOCAL_SUPABASE_ENV",
    "BLOCKED_SUPABASE_CONTAINER_MISMATCH",
    "BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION",
    "BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE",
    "BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA",
    "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA",
    "MIGRATION_PENDING_NOT_APPLIED",
    "APPLY_NOT_RUN_BLOCKED_ENV_MISMATCH",
    "No commit eseguito",
    "No push eseguito",
    "No stage finale",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-040 docs must include ${requiredSnippet}`);
    }
  }

  if (
    !/Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    )
  ) {
    addFailure("MASTER-PLAN must track TASK-040 or its TASK-041 superseding runtime task");
  }

  if (
    /Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    ) &&
    !/SUPERSEDED_BY_TASK-041/.test(combinedDocs)
  ) {
    addFailure("TASK-040 must be explicitly marked SUPERSEDED_BY_TASK-041 when TASK-041 is active");
  }

  if (!/Stato TASK-039: `DONE`/.test(masterPlan) || !/Fase TASK-039: `DONE_RECONCILED`/.test(masterPlan)) {
    addFailure("MASTER-PLAN must close TASK-039 after explicit confirmation");
  }

  if (
    /Sales Sync: `DONE`|Staging: `DONE`|Win7POS E2E: `PASS_LIVE`|Migration Supabase: `APPLIED`/.test(
      combinedDocs,
    )
  ) {
    addFailure("TASK-040 must not declare blocked runtime gates as DONE/PASS");
  }

  if (
    !isTask041RuntimeCompletionActive() &&
    existsSync(join(root, "src/app/api/pos/sales"))
  ) {
    addFailure("TASK-040 must not add POS sales runtime routes while gates are blocked");
  }

  if (!/checkTask040RuntimeReadiness/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-040 security scanner gate`);
  }
}

function checkTask041RuntimeCompletion() {
  const taskPath =
    "docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-041/README.md";
  const foundationTestPath = "tests/foundation/task-041-runtime-completion.test.mjs";
  const salesRoutePath = "src/app/api/pos/sales/sync/route.ts";
  const salesServicePath = "src/server/pos-auth/sales-sync.ts";
  const posRouteSecurityPath = "src/app/api/pos/_shared/pos-route-security.ts";
  const databaseTypesPath = "src/lib/supabase/database.types.ts";
  const masterPlan = read("docs/MASTER-PLAN.md");

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    salesRoutePath,
    salesServicePath,
    posRouteSecurityPath,
    databaseTypesPath,
    "wrangler.jsonc",
    "open-next.config.ts",
    "src/middleware.ts",
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-041`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const devSupabaseCheck = read("scripts/dev-supabase-check.mjs");
  const salesRoute = read(salesRoutePath);
  const salesService = read(salesServicePath);
  const posRouteSecurity = read(posRouteSecurityPath);
  const databaseTypes = read(databaseTypesPath);
  const wranglerConfig = read("wrangler.jsonc");
  const openNextConfig = read("open-next.config.ts");
  const packageJson = JSON.parse(read("package.json"));
  const salesMigration = listFiles("supabase/migrations").find((file) =>
    /task_041_pos_sales_sync_foundation/i.test(file),
  );

  if (!salesMigration) {
    addFailure("TASK-041 Sales Sync migration is missing");
    return;
  }

  const salesMigrationSource = read(salesMigration);
  const combinedDocs = `${task}\n${evidence}\n${masterPlan}`;
  const combinedTask041Artifacts = `${task}\n${evidence}\n${foundationTest}`;

  for (const requiredSnippet of [
    "TASK-041",
    "Runtime Completion: Supabase, Cloudflare/OpenNext Staging, Sales Sync and Win7POS E2E",
    "PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS",
    "REVIEW_WITH_EXTERNAL_BLOCKERS",
    "TASK-040_SHOULD_REMAIN_REVIEW_WITH_EXTERNAL_BLOCKERS",
    "TASK-040_SUPERSEDED_BY_TASK-041",
    "SUPERSEDED_BY_TASK-041",
    "PASS_SUPABASE_DEV_APPLIED",
    "PASS_CLOUDFLARE_OPENNEXT_PREVIEW",
    "PASS_SALES_SYNC_FOUNDATION",
    "PASS_WITH_MANUAL_WIN7_STEPS",
    "NOT_RUN_PRODUCTION_FORBIDDEN",
    "WIN7POS_REPO_PATH",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-041 docs must include ${requiredSnippet}`);
    }
  }

  if (
    !/Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    )
  ) {
    addFailure("MASTER-PLAN must track TASK-041, TASK-042, or TASK-043 as the active runtime completion task");
  }

  if (!/Stato TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`/.test(masterPlan)) {
    addFailure("MASTER-PLAN must keep TASK-040 in REVIEW_WITH_EXTERNAL_BLOCKERS");
  }

  if (
    /TASK-040_CAN_BE_DONE|Stato TASK-040: `DONE`|Migration Supabase: `APPLIED`|Sales Sync: `DONE`|Win7POS E2E: `PASS_LIVE`/.test(
      combinedDocs,
    )
  ) {
    addFailure("TASK-041 must not declare TASK-040 or blocked runtime gates done");
  }

  for (const requiredSnippet of [
    "export const dynamic = \"force-dynamic\"",
    "export const runtime = \"nodejs\"",
    "export async function POST",
    "readPosJsonBody",
    "MAX_POS_SALES_SYNC_JSON_BODY_BYTES",
    "handlePosSalesSync",
  ]) {
    if (!salesRoute.includes(requiredSnippet)) {
      addFailure(`${salesRoutePath} must include ${requiredSnippet}`);
    }
  }

  if (/export async function GET/.test(salesRoute)) {
    addFailure(`${salesRoutePath} must expose POST only`);
  }

  for (const requiredSnippet of [
    "MAX_POS_SALES_SYNC_JSON_BODY_BYTES = 256 * 1024",
    "MAX_SYNC_SALES = 100",
    "MAX_SYNC_LINES = 1000",
    "verifyPosSecret",
    "idempotencyKey",
    "payload_hash",
    "hasDuplicateValues",
    "saleTotalsAreConsistent",
    "cleanupPosSalesBatch",
    "quantity * unitPrice",
    "businessDateRaw.length > 0",
    "pos_sales_sync_batches",
    "pos_sales",
    "pos_sale_lines",
    "metadata_redacted",
    "actor_staff_id",
    "duplicate",
    "conflict",
    "cleanup_ok",
    "source: \"TASK-041\"",
  ]) {
    if (!salesService.includes(requiredSnippet)) {
      addFailure(`${salesServicePath} must include ${requiredSnippet}`);
    }
  }

  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(salesRoute)) {
    addFailure(`${salesRoutePath} must not reference service-role material`);
  }

  if (/fakeRevenue|sampleSales|demoSales|mockRevenue/i.test(`${salesRoute}\n${salesService}`)) {
    addFailure("TASK-041 Sales Sync must not introduce fake revenue or demo sales data");
  }

  for (const requiredSnippet of [
    "create table if not exists public.pos_sales_sync_batches",
    "create table if not exists public.pos_sales",
    "create table if not exists public.pos_sale_lines",
    "enable row level security",
    "force row level security",
    "revoke all on table public.pos_sales_sync_batches from anon",
    "revoke all on table public.pos_sales from authenticated",
    "revoke all on table public.pos_sale_lines from authenticated",
    "pos_sales_idempotency_unique",
    "pos_sales_client_sale_unique",
    "pos_sales_sync_batches_idempotency_unique",
    "pos_sales_shop_created_idx",
    "pos_sale_lines_shop_idx",
    "metadata_redacted",
  ]) {
    if (!salesMigrationSource.includes(requiredSnippet)) {
      addFailure(`${salesMigration} must include ${requiredSnippet}`);
    }
  }

  if (/sale_payments|payment_methods|receipts/i.test(salesMigrationSource)) {
    addFailure(`${salesMigration} must keep payments/receipts out of Sales Sync v1`);
  }

  for (const requiredSnippet of [
    "pos_sales_sync_batches",
    "pos_sales",
    "pos_sale_lines",
  ]) {
    if (!databaseTypes.includes(requiredSnippet)) {
      addFailure(`${databaseTypesPath} must include ${requiredSnippet}`);
    }
  }

  if (
    packageJson.devDependencies?.["@opennextjs/cloudflare"] !== "^1.19.11" ||
    !packageJson.devDependencies?.wrangler ||
    !packageJson.scripts?.["cf:build"] ||
    !packageJson.scripts?.["cf:preview"]
  ) {
    addFailure("TASK-041 must include Cloudflare/OpenNext dev deps and non-production build/preview scripts");
  }

  if (/opennextjs-cloudflare deploy|wrangler deploy|--prod/.test(JSON.stringify(packageJson.scripts))) {
    addFailure("TASK-041 package scripts must not add production deploy commands");
  }

  for (const requiredSnippet of [
    "nodejs_compat",
    "global_fetch_strictly_public",
    ".open-next/worker.js",
    ".open-next/assets",
    "merchandise-control-admin-web-staging",
  ]) {
    if (!wranglerConfig.includes(requiredSnippet)) {
      addFailure(`wrangler.jsonc must include ${requiredSnippet}`);
    }
  }

  if (!/defineCloudflareConfig/.test(openNextConfig)) {
    addFailure("open-next.config.ts must define the Cloudflare adapter config");
  }

  if (existsSync(join(root, "src/proxy.ts"))) {
    addFailure("TASK-041 Cloudflare build must avoid Next 16 Node-only src/proxy.ts");
  }

  if (!/maxBytes/.test(posRouteSecurity) || !/MAX_POS_JSON_BODY_BYTES/.test(posRouteSecurity)) {
    addFailure(`${posRouteSecurityPath} must preserve default body limit and support bounded overrides`);
  }

  if (!/--mode=/.test(devSupabaseCheck) || !/production mode is intentionally unsupported/.test(devSupabaseCheck)) {
    addFailure("scripts/dev-supabase-check.mjs must expose redacted modes and fail closed for production");
  }

  if (/\/Users\/minxiang\/Projects\/Win7POS/.test(combinedTask041Artifacts)) {
    addFailure("TASK-041 artifacts must use WIN7POS_REPO_PATH instead of hardcoded local Win7POS paths");
  }

  if (!/checkTask041RuntimeCompletion/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-041 security scanner gate`);
  }
}

function checkTask042ReviewCiWin7PosBridge() {
  const taskPath =
    "docs/TASKS/TASK-042-task-041-review-ci-retry-win7pos-physical-e2e-bridge.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-042/README.md";
  const foundationTestPath =
    "tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs";
  const parityReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-parity-diagnosis.md";
  const compareSummaryPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-summary.md";
  const compareCsvPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-files.csv";
  const missingReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/missing-from-codex.md";
  const extraReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/extra-in-codex.md";
  const differentReportPath =
    "docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/different-hashes.md";
  const compareScriptPath = "scripts/win7pos/compare-build-folders.sh";
  const fetchScriptPath =
    "scripts/win7pos/fetch-github-release-pack-to-bridge.sh";
  const adminWebRunbookPath =
    "docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md";
  const masterPlan = read("docs/MASTER-PLAN.md");

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    adminWebRunbookPath,
    parityReportPath,
    compareSummaryPath,
    compareCsvPath,
    missingReportPath,
    extraReportPath,
    differentReportPath,
    compareScriptPath,
    fetchScriptPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-042`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const parityReport = read(parityReportPath);
  const compareSummary = read(compareSummaryPath);
  const compareCsv = read(compareCsvPath);
  const compareScript = read(compareScriptPath);
  const fetchScript = read(fetchScriptPath);
  const adminWebRunbook = read(adminWebRunbookPath);
  const combined = `${task}\n${evidence}\n${adminWebRunbook}\n${parityReport}\n${compareSummary}\n${compareCsv}\n${masterPlan}`;

  for (const requiredSnippet of [
    "TASK-042",
    "TASK-041 Review, CI retry and Win7POS physical E2E bridge",
    "READY_FOR_WIN7_MANUAL_TEST",
    "TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS",
    "TASK-040_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS_SUPERSEDED_BY_TASK-041",
    "CI_GITHUB_ACTIONS_GREEN",
    "26983953492",
    "WIN7POS_REPO_PATH",
    "REQUIRE_WIN7POS_REPO",
    "SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE",
    "Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038",
    "RUNBOOK-WIN7POS-PHYSICAL-SMOKE.md",
    "MANUAL-RESULT-TEMPLATE.md",
    "No commit eseguito",
    "No push eseguito",
    "No stage finale",
    "TASK-042B",
    "Win7POS Build Parity Diagnosis",
    "TASK-042B-build-compare",
    "build-compare-files.csv",
    "missing-from-codex.md",
    "extra-in-codex.md",
    "different-hashes.md",
    "Win7POS-ReleasePack-x86",
    "26795001032",
    "e_sqlite3.dll",
    "TASK-042B-github-release-pack-20260604-223656",
    "fetch-github-release-pack-to-bridge.sh",
    "compare-build-folders.sh",
    "containsESqlite3Dll",
    "Different SHA-256: `0`",
    "TASK-042C",
    "ADMIN-WEB-MANUAL-TEST-RUNBOOK.md",
    "PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES",
    "WIN7POS_PRODUCT_DIALOG_FIX_READY_FOR_PHYSICAL_RETEST",
    "PASS_LAUNCHES_ON_WIN7",
    "PASS_LOCAL_OPERATOR_LOGIN",
    "PASS_MENU_UI",
    "PASS_LOCAL_CART_BASIC",
    "PASS_LOCAL_PRODUCT_CREATE",
    "PASS_LOCAL_DISCOUNT",
    "PASS_LOCAL_QTY_EDIT",
    "PASS_LOCAL_PAYMENT_SCREEN_OPEN",
    "PASS_LOCAL_REGISTER_OPEN",
    "NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING",
    "NOT_RUN_POS_ONLINE_CONNECTION_PENDING",
    "NOT_RUN_SALES_SYNC_LIVE_PENDING",
    "ProductEditDialog",
    "ProductEditViewModel",
    "ProductRepository",
    "check-product-dialog-free-text.ps1",
    "PHYSICAL_TEST_REQUIRES_GITHUB_RELEASE_ARTIFACT_AFTER_COMMIT",
    "Win7POSBridge\\outbox\\TASK-042B-github-release-pack-20260604-223656\\app",
  ]) {
    if (!combined.includes(requiredSnippet)) {
      addFailure(`TASK-042 docs must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "npm run dev -- --hostname 127.0.0.1 --port 3000",
    "npm run dev:tunnel",
    "npm run dev:db:check",
    "npm run supabase:bootstrap-platform-admin",
    "/platform/provisioning",
    "/shop/staff",
    "/shop/pos",
    "TASK042_*",
    "shop_code",
    "staff_code",
    "credential one-time",
  ]) {
    if (!adminWebRunbook.includes(requiredSnippet)) {
      addFailure(`${adminWebRunbookPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "--bad <path>",
    "--good <path>",
    "--out <path>",
    "build-compare-summary.md",
    "build-compare-files.csv",
  ]) {
    if (!compareScript.includes(requiredSnippet)) {
      addFailure(`${compareScriptPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "gh auth status",
    "gh run list",
    "gh run download",
    "Win7POS-ReleasePack-x86",
    "TASK-042B-github-release-pack",
    "containsESqlite3Dll",
  ]) {
    if (!fetchScript.includes(requiredSnippet)) {
      addFailure(`${fetchScriptPath} must include ${requiredSnippet}`);
    }
  }

  if (/GH_TOKEN|GITHUB_TOKEN|ghp_|github_pat_/.test(`${compareScript}\n${fetchScript}`)) {
    addFailure("TASK-042B scripts must not hardcode GitHub tokens");
  }

  if (
    !/Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    )
  ) {
    addFailure("MASTER-PLAN must track TASK-042 or TASK-043 as the active review/runtime task");
  }

  if (!/Stato TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`/.test(masterPlan)) {
    addFailure("MASTER-PLAN must keep TASK-041 in REVIEW_WITH_EXTERNAL_BLOCKERS");
  }

  if (
    /Stato:\s*`DONE`|Verdict finale:\s*`DONE`|Win7POS live E2E:\s*`PASS`|Sales Sync live:\s*`PASS`/.test(
      `${task}\n${evidence}`,
    )
  ) {
    addFailure("TASK-042 must not declare DONE or live Win7POS/Sales Sync PASS before manual evidence");
  }

  if (!/checkTask042ReviewCiWin7PosBridge/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert the TASK-042 security scanner gate`);
  }
}

function checkTask043PlatformAdminRuntimeFixes() {
  const taskPath = "docs/TASKS/TASK-043-platform-admin-runtime-fixes.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-043/README.md";
  const foundationTestPath =
    "tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs";
  const e2eTestPath = "tests/e2e/task-043-platform-admin-runtime.spec.ts";
  const readModelPath = "src/server/platform-admin/read-model.ts";
  const sectionDataPath = "src/server/platform-admin/platform-section-data.ts";
  const appShellPath = "src/components/platform/AppShell.tsx";
  const provisioningPagePath = "src/app/platform/provisioning/page.tsx";
  const loadingPath = "src/app/platform/loading.tsx";
  const logoutRoutePath = "src/app/auth/logout/route.ts";
  const masterPlan = read("docs/MASTER-PLAN.md");

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    e2eTestPath,
    readModelPath,
    sectionDataPath,
    appShellPath,
    provisioningPagePath,
    loadingPath,
    logoutRoutePath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-043`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const e2eTest = read(e2eTestPath);
  const readModel = read(readModelPath);
  const sectionData = read(sectionDataPath);
  const appShell = read(appShellPath);
  const provisioningPage = read(provisioningPagePath);
  const loading = read(loadingPath);
  const logoutRoute = read(logoutRoutePath);
  const combinedDocs = `${task}\n${evidence}\n${masterPlan}`;

  for (const requiredSnippet of [
    "TASK-043",
    "Platform Admin runtime fixes",
    "DONE_RECONCILED",
    "TASK-045",
    "CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST",
    "AUTO_RECONCILED_TASK045",
    "staff_accounts_safe",
    "42501",
    "Read blocked",
    "Provisioning",
    "Logout",
    "No commit",
    "No push",
    "NOT_STAGED",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-043 docs must include ${requiredSnippet}`);
    }
  }

  if (
    !/Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(masterPlan) ||
    !/Stato TASK-043: `DONE_RECONCILED`/.test(masterPlan) ||
    !/Fase TASK-043: `DONE_RECONCILED`/.test(masterPlan)
  ) {
    addFailure("MASTER-PLAN must reconcile TASK-043 as DONE_RECONCILED through TASK-045 evidence");
  }

  if (
    /Stato TASK-043:\s*`DONE`(?!_RECONCILED)|Fase TASK-043:\s*`DONE`(?!_RECONCILED)/.test(
      masterPlan,
    ) ||
    /Stato:\s*`DONE`(?!_RECONCILED)|Stato task:\s*`DONE`(?!_RECONCILED)|Fase attuale:\s*`DONE`(?!_RECONCILED)|Verdict finale:\s*`DONE`(?!_RECONCILED)/.test(
      `${task}\n${evidence}`,
    )
  ) {
    addFailure("TASK-043 must use DONE_RECONCILED, not plain DONE");
  }

  if (
    /const firstError = \[[\s\S]*staffResult\.error[\s\S]*\]\.find\(Boolean\)/.test(
      readModel,
    )
  ) {
    addFailure(`${readModelPath} must not treat staff_accounts_safe as a fatal core read error`);
  }

  for (const requiredSnippet of [
    "Promise.all",
    "readIssues",
    "staff_accounts_safe",
    "staff_schema_status",
    "BLOCKED",
    "Server-side Platform Admin read model loaded through RLS",
  ]) {
    if (!readModel.includes(requiredSnippet)) {
      addFailure(`${readModelPath} must include ${requiredSnippet}`);
    }
  }

  if (!/staffSafeReadIssue/.test(sectionData) || !/Staff safe read model/.test(sectionData)) {
    addFailure(`${sectionDataPath} must surface non-fatal staff safe read diagnostics`);
  }

  if (!/href="\/auth\/logout"/.test(appShell) || !/>\s*Logout\s*</.test(appShell)) {
    addFailure(`${appShellPath} must expose visible Logout to /auth/logout`);
  }

  if (!/signOut\(\)/.test(logoutRoute) || !/NextResponse\.redirect/.test(logoutRoute)) {
    addFailure(`${logoutRoutePath} must sign out server-side and redirect`);
  }

  if (
    /A valid Platform Admin server session is required before provisioning can run\./.test(
      provisioningPage,
    ) ||
    !/readModel\.reason/.test(provisioningPage)
  ) {
    addFailure(`${provisioningPagePath} must use readModel.reason instead of the generic provisioning blocker`);
  }

  if (!/aria-busy="true"/.test(loading) || /activeSection="overview"/.test(loading)) {
    addFailure(`${loadingPath} must provide a neutral Platform loading state without forcing Overview active`);
  }

  for (const requiredSnippet of [
    "CONFIRM_TASK043_PLATFORM_RUNTIME_TEST",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "createTemporaryPlatformAdmin",
    "cleanup",
    "TASK043_NAV_LATENCY",
    "task043_nav_marker",
    "Logout",
  ]) {
    if (!e2eTest.includes(requiredSnippet)) {
      addFailure(`${e2eTestPath} must include ${requiredSnippet}`);
    }
  }

  if (!/checkTask043|TASK-043 runtime evidence/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert TASK-043 artifacts`);
  }
}

function checkTask044PlatformProvisioningUxRuntime() {
  const taskPath = "docs/TASKS/TASK-044-platform-provisioning-ux-runtime-fixes.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-044/README.md";
  const foundationTestPath =
    "tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs";
  const e2eTestPath =
    "tests/e2e/task-044-platform-provisioning-ux-runtime.spec.ts";
  const pendingButtonPath = "src/components/platform/PendingSubmitButton.tsx";
  const sidebarNavPath = "src/components/platform/PlatformSidebarNav.tsx";
  const appShellPath = "src/components/platform/AppShell.tsx";
  const loadingPath = "src/app/platform/loading.tsx";
  const provisioningPagePath = "src/app/platform/provisioning/page.tsx";
  const operationsPagePath = "src/app/platform/operations/page.tsx";
  const operationsActionsPath = "src/app/platform/operations/actions.ts";
  const staffProvisioningPath =
    "src/server/platform-admin/staff-manager-provisioning.ts";
  const staffPanelPath =
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx";
  const platformDataPath = "src/components/platform/platformData.ts";
  const masterPlan = read("docs/MASTER-PLAN.md");

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    e2eTestPath,
    pendingButtonPath,
    sidebarNavPath,
    appShellPath,
    loadingPath,
    provisioningPagePath,
    operationsPagePath,
    operationsActionsPath,
    staffProvisioningPath,
    staffPanelPath,
    platformDataPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-044`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const e2eTest = read(e2eTestPath);
  const pendingButton = read(pendingButtonPath);
  const sidebarNav = read(sidebarNavPath);
  const appShell = read(appShellPath);
  const loading = read(loadingPath);
  const provisioningPage = read(provisioningPagePath);
  const operationsPage = read(operationsPagePath);
  const operationsActions = read(operationsActionsPath);
  const staffProvisioning = read(staffProvisioningPath);
  const staffPanel = read(staffPanelPath);
  const platformData = read(platformDataPath);
  const combinedDocs = `${task}\n${evidence}\n${masterPlan}`;

  for (const requiredSnippet of [
    "TASK-044",
    "Platform provisioning UX, runtime and Operations cleanup",
    "DONE_RECONCILED",
    "TASK-045",
    "CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST",
    "AUTO_RECONCILED_TASK045",
    "No commit",
    "No push",
    "NOT_STAGED",
    "CONFIRM_TASK044_PLATFORM_RUNTIME_TEST",
    "security:scan",
    "test:foundation",
    "git diff --check",
  ]) {
    if (!combinedDocs.includes(requiredSnippet)) {
      addFailure(`TASK-044 docs must include ${requiredSnippet}`);
    }
  }

  if (
    !/Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`/.test(
      masterPlan,
    ) ||
    !/Stato TASK-044: `DONE_RECONCILED`/.test(masterPlan) ||
    !/Fase TASK-044: `DONE_RECONCILED`/.test(masterPlan)
  ) {
    addFailure("MASTER-PLAN must reconcile TASK-044 as DONE_RECONCILED through TASK-045 evidence");
  }

  if (
    /Stato TASK-044:\s*`DONE`(?!_RECONCILED)|Fase TASK-044:\s*`DONE`(?!_RECONCILED)|Verdict finale TASK-044:\s*`DONE`(?!_RECONCILED)/.test(
      masterPlan,
    ) ||
    /Stato:\s*`DONE`(?!_RECONCILED)|Stato task:\s*`DONE`(?!_RECONCILED)|Fase attuale:\s*`DONE`(?!_RECONCILED)|Verdict finale:\s*`DONE`(?!_RECONCILED)/.test(
      `${task}\n${evidence}`,
    )
  ) {
    addFailure("TASK-044 must use DONE_RECONCILED, not plain DONE");
  }

  if (!/useFormStatus/.test(pendingButton) || !/disabled={isDisabled}/.test(pendingButton)) {
    addFailure(`${pendingButtonPath} must use useFormStatus to disable pending submits`);
  }

  if (!/usePathname/.test(sidebarNav) || !/setOptimisticActive/.test(sidebarNav)) {
    addFailure(`${sidebarNavPath} must keep Platform navigation active state client-aware`);
  }

  if (!/PlatformSidebarNav/.test(appShell)) {
    addFailure(`${appShellPath} must render PlatformSidebarNav`);
  }

  if (/activeSection="overview"/.test(loading) || /Rendering\.\.\./.test(loading)) {
    addFailure(`${loadingPath} must not force Overview active or render a stuck Rendering label`);
  }

  for (const requiredSnippet of [
    "PendingSubmitButton",
    "pendingLabel=\"Creating shop\"",
    "pendingLabel=\"Creating pending invite\"",
    "name=\"returnTo\" value=\"/platform/provisioning\"",
    "ActionResultBanner",
    "Shop created.",
    "Pending owner invite created.",
  ]) {
    if (!provisioningPage.includes(requiredSnippet)) {
      addFailure(`${provisioningPagePath} must include ${requiredSnippet}`);
    }
  }

  if (!/safeReturnTo/.test(operationsActions) || !/revalidatePath\("\/platform\/provisioning"\)/.test(operationsActions)) {
    addFailure(`${operationsActionsPath} must allow provisioning actions to redirect back to provisioning`);
  }

  for (const forbiddenSnippet of [
    "createPlatformShopAction",
    "createPlatformPendingOwnerInviteAction",
    "grantPlatformAdminAction",
    "revokePlatformAdminAction",
    "title=\"Create shop\"",
    "title=\"Platform Admin grants\"",
    "pending_owner_invite",
    "admin_grant",
    "admin_revoke",
  ]) {
    if (operationsPage.includes(forbiddenSnippet)) {
      addFailure(`${operationsPagePath} must not include duplicated ${forbiddenSnippet}`);
    }
  }

  if (!/Lifecycle operations/.test(platformData)) {
    addFailure(`${platformDataPath} must describe Operations as lifecycle-focused`);
  }

  if (/db_failure/.test(staffProvisioning)) {
    addFailure(`${staffProvisioningPath} must not collapse manager failures into db_failure`);
  }

  for (const requiredSnippet of [
    "shop_read_failed",
    "staff_read_failed",
    "permission_write_failed",
    "staff_write_failed",
    "audit_write_failed",
  ]) {
    if (!staffProvisioning.includes(requiredSnippet)) {
      addFailure(`${staffProvisioningPath} must include ${requiredSnippet}`);
    }
  }

  if (!/role={state\.ok \? "status" : "alert"}/.test(staffPanel) || !/aria-disabled/.test(staffPanel)) {
    addFailure(`${staffPanelPath} must expose clear success/error status and disabled state`);
  }

  for (const requiredSnippet of [
    "CONFIRM_TASK044_PLATFORM_RUNTIME_TEST",
    "createTemporaryPlatformAdmin",
    "cleanupCreatedShops",
    "Provision manager access",
    "Rendering...",
    "mcstaff_mgr_",
    "manager",
    "shop_admin.full_access",
  ]) {
    if (!e2eTest.includes(requiredSnippet)) {
      addFailure(`${e2eTestPath} must include ${requiredSnippet}`);
    }
  }

  if (!/TASK-044 provisioning forms prevent double submit/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert TASK-044 provisioning UX`);
  }
}

function checkTask045PlatformMasterConsoleFinalReview() {
  const taskPath = "docs/TASKS/TASK-045-platform-master-console-final-review-done-reconciliation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-045/README.md";
  const foundationTestPath =
    "tests/foundation/task-045-platform-master-console-final-review.test.mjs";
  const e2eTestPath =
    "tests/e2e/task-045-platform-master-console-final-review.spec.ts";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    e2eTestPath,
    masterPlanPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-045 final review`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const e2eTest = read(e2eTestPath);
  const masterPlan = read(masterPlanPath);
  const combinedDocs = `${task}\n${evidence}\n${masterPlan}`;

  for (const requiredSnippet of [
    "TASK-045",
    "Platform Master Console final automated review",
    "DONE_RECONCILED",
    "AUTO_RECONCILED_TASK045",
    "CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST",
    "tests/e2e/task-045-platform-master-console-final-review.spec.ts",
    "archiveShopThroughOperations",
    "auditLogsRetained",
    "No commit",
    "No push",
    "NOT_STAGED",
  ]) {
    if (!`${combinedDocs}\n${e2eTest}`.includes(requiredSnippet)) {
      addFailure(`TASK-045 artifacts must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "createTemporaryPlatformAdmin",
    "runtimeEnv",
    "BLOCKED_TASK045_REQUIRES_LOCAL_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "platform.shop.pending_owner_invite.success",
    "platform.staff_manager_web.provision.success",
    "shop_admin.full_access",
    "Master Console access required",
  ]) {
    if (!e2eTest.includes(requiredSnippet)) {
      addFailure(`${e2eTestPath} must include ${requiredSnippet}`);
    }
  }

  if (
    !/Stato TASK-043: `DONE_RECONCILED`/.test(masterPlan) ||
    !/Fase TASK-043: `DONE_RECONCILED`/.test(masterPlan) ||
    !/Stato TASK-044: `DONE_RECONCILED`/.test(masterPlan) ||
    !/Fase TASK-044: `DONE_RECONCILED`/.test(masterPlan)
  ) {
    addFailure("MASTER-PLAN must reconcile TASK-043 and TASK-044 via TASK-045");
  }

  if (!/Stato TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`/.test(masterPlan)) {
    addFailure("TASK-045 must keep TASK-041 external blockers explicit");
  }

  if (!/Stato TASK-042: `READY_FOR_WIN7_MANUAL_TEST`/.test(masterPlan)) {
    addFailure("TASK-045 must keep TASK-042 ready for Win7 manual test");
  }

  if (
    /Win7POS live E2E:\s*`PASS`|Sales Sync live:\s*`PASS`|Win7POS E2E:\s*`PASS_LIVE`|Sales Sync:\s*`DONE`/.test(
      combinedDocs,
    )
  ) {
    addFailure("TASK-045 must not declare Win7POS live or Sales Sync live PASS/DONE");
  }

  if (!/TASK-045 final review artifacts/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert TASK-045 final review artifacts`);
  }
}

function checkTask046TestTargetSeparation() {
  const taskPath = "docs/TASKS/TASK-046-test-target-separation-local-vs-staging.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-046/README.md";
  const foundationTestPath =
    "tests/foundation/task-046-test-target-separation.test.mjs";
  const packagePath = "package.json";
  const localStatusPath = "scripts/db/local-status.mjs";
  const stagingStatusPath = "scripts/db/staging-status.mjs";
  const guardrailsPath = "scripts/testing/target-guardrails.mjs";
  const runnerPath = "scripts/testing/run-playwright-target.mjs";
  const stagingSpecPath = "tests/e2e/staging/platform-staging-smoke.spec.ts";
  const playwrightConfigPath = "playwright.config.ts";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  for (const requiredPath of [
    taskPath,
    evidencePath,
    foundationTestPath,
    packagePath,
    localStatusPath,
    stagingStatusPath,
    guardrailsPath,
    runnerPath,
    stagingSpecPath,
    playwrightConfigPath,
    masterPlanPath,
  ]) {
    if (!existsSync(join(root, requiredPath))) {
      addFailure(`${requiredPath} is missing for TASK-046`);
      return;
    }
  }

  const task = read(taskPath);
  const evidence = read(evidencePath);
  const foundationTest = read(foundationTestPath);
  const packageJson = JSON.parse(read(packagePath));
  const guardrails = read(guardrailsPath);
  const runner = read(runnerPath);
  const stagingSpec = read(stagingSpecPath);
  const playwrightConfig = read(playwrightConfigPath);
  const masterPlan = read(masterPlanPath);

  for (const scriptName of [
    "db:local:status",
    "db:staging:status",
    "test:e2e:local",
    "test:e2e:staging",
    "test:platform:local",
    "test:platform:staging",
    "test:shop:local",
    "smoke:staging",
  ]) {
    const script = packageJson.scripts?.[scriptName] ?? "";

    if (!script) {
      addFailure(`package.json must define ${scriptName}`);
    }

    if (/cross-env/.test(script)) {
      addFailure(`${scriptName} must use the Node wrapper instead of cross-env`);
    }
  }

  for (const safeScriptName of [
    "security:scan",
    "test:foundation",
    "typecheck",
    "lint",
    "build",
    "verify",
  ]) {
    const script = packageJson.scripts?.[safeScriptName] ?? "";

    if (/TEST_TARGET|playwright|supabase status/.test(script)) {
      addFailure(`${safeScriptName} must remain target-independent`);
    }
  }

  for (const requiredSnippet of [
    "TEST_TARGET",
    "BLOCKED_TEST_TARGET_REQUIRED",
    "BLOCKED_LOCAL_SUPABASE_URL_REQUIRED",
    "BLOCKED_STAGING_CONFIRMATION_REQUIRED",
    "BLOCKED_STAGING_PROJECT_REF_NOT_ALLOWLISTED",
    "BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN",
    "ALLOW_STAGING_E2E",
    "CONFIRM_STAGING_E2E",
    "ALLOWED_STAGING_SUPABASE_PROJECT_REFS",
    "SUPABASE_PRODUCTION_PROJECT_REF",
    "PRODUCTION_SUPABASE_PROJECT_REFS",
  ]) {
    if (!guardrails.includes(requiredSnippet)) {
      addFailure(`${guardrailsPath} must include ${requiredSnippet}`);
    }
  }

  for (const requiredSnippet of [
    "supabase",
    "status",
    "--output",
    "env",
    "CONFIRM_TASK043_PLATFORM_RUNTIME_TEST",
    "CONFIRM_TASK044_PLATFORM_RUNTIME_TEST",
    "CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST",
    "PLAYWRIGHT_DISABLE_WEB_SERVER",
  ]) {
    if (!runner.includes(requiredSnippet)) {
      addFailure(`${runnerPath} must include ${requiredSnippet}`);
    }
  }

  if (!/PLAYWRIGHT_DISABLE_WEB_SERVER/.test(playwrightConfig) || !/useWebServer/.test(playwrightConfig)) {
    addFailure(`${playwrightConfigPath} must allow staging to disable the local web server`);
  }

  if (!/STAGING_TASK045_/.test(stagingSpec) || /delete\(\)|service_role|SUPABASE_SERVICE_ROLE_KEY/.test(stagingSpec)) {
    addFailure(`${stagingSpecPath} must be staging-safe and non-destructive`);
  }

  for (const requiredSnippet of [
    "TASK-046",
    "Test target separation: local vs staging",
    "DONE_RECONCILED",
    "TEST_TARGET=local",
    "TEST_TARGET=staging",
    "Commit/push finale su `main` autorizzati",
    "No commit/push/stage durante l'execution originaria",
  ]) {
    if (!`${task}\n${evidence}\n${masterPlan}`.includes(requiredSnippet)) {
      addFailure(`TASK-046 docs must include ${requiredSnippet}`);
    }
  }

  if (!/TASK-046 wrappers enforce local and staging target guardrails/.test(foundationTest)) {
    addFailure(`${foundationTestPath} must assert TASK-046 guardrails`);
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
checkTask018InfrastructureSecurityPosFoundation();
checkTask019PosAuthFoundationImplementation();
checkTask020Win7PosIntegrationPlanning();
checkTask021PosBackendSessionDeviceEndpoints();
checkTask022023PosDashboardWin7PosClient();
checkTask027CatalogPullDeltaSync();
checkTask037ShopAdminDualAccessModel();
checkTask038PosManagerWebLogin();
checkTask039StaffAwareShopAdminCompletion();
checkTask040RuntimeReadiness();
checkTask041RuntimeCompletion();
checkTask042ReviewCiWin7PosBridge();
checkTask043PlatformAdminRuntimeFixes();
checkTask044PlatformProvisioningUxRuntime();
checkTask045PlatformMasterConsoleFinalReview();
checkTask046TestTargetSeparation();

if (failures.length > 0) {
  console.error("Security scan failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (skips.length > 0) {
  console.log("Security scan skipped external checks:");
  for (const skip of skips) {
    console.log(`- ${skip}`);
  }
}

console.log("Security scan passed.");
