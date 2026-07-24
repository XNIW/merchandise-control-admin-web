import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(escapeRegExp(required)), label);
}

function task038MigrationName() {
  return readdirSync(join(root, "supabase/migrations")).find((file) =>
    /task_038_pos_manager_web_login/i.test(file),
  );
}

test("TASK-038 governance records DONE scope without opening sales sync", () => {
  const requiredPaths = [
    "docs/TASKS/TASK-038-pos-manager-web-login-platform-provisioning-permissions-revenue-gate.md",
    "docs/TASKS/EVIDENCE/TASK-038/README.md",
    "docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const combined = [
    ...requiredPaths.map(readProjectFile),
    readProjectFile("docs/MASTER-PLAN.md"),
  ].join("\n");

  for (const required of [
    "TASK-038",
    "TASK-037",
    "DONE",
    "pos_staff_manager",
    "personal_account",
    "staff_web_sessions",
    "shop_admin.full_access",
    "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA",
    "No Sales Sync",
    "No dashboard vendite placeholder",
    "No Win7POS/Android/iOS",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    readProjectFile("docs/MASTER-PLAN.md"),
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`|Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
  assert.match(readProjectFile("docs/MASTER-PLAN.md"), /Stato TASK-038: `DONE`/);
  assert.match(readProjectFile("docs/MASTER-PLAN.md"), /Fase TASK-038: `DONE`/);
});

test("TASK-038 migration separates staff web sessions, login attempts and role permissions", () => {
  const migrationName = task038MigrationName();

  assert.ok(migrationName, "TASK-038 migration is missing");

  const migration = readProjectFile(`supabase/migrations/${migrationName}`);

  for (const required of [
    "create table if not exists public.staff_web_sessions",
    "create table if not exists public.staff_web_login_attempts",
    "create table if not exists public.staff_role_permissions",
    "session_token_hash text not null",
    "attempt_key_hash text primary key",
    "permission_key text not null",
    "shop_admin.full_access",
    "alter table public.staff_web_sessions enable row level security",
    "alter table public.staff_web_login_attempts enable row level security",
    "alter table public.staff_role_permissions enable row level security",
    "revoke all on table public.staff_web_sessions from anon",
    "revoke all on table public.staff_web_login_attempts from anon",
    "revoke all on table public.staff_role_permissions from anon",
  ]) {
    assertContains(migration, required);
  }

  assert.doesNotMatch(migration, /\b(session_token|raw_token|credential|password|pin)\s+text\b/i);
  assert.doesNotMatch(migration, /pos_sales|sales_sync|sale_payments|receipts/i);
});

test("TASK-038 staff web auth runtime is server-only and cookie based", () => {
  const requiredPaths = [
    "src/server/shop-admin/staff-web-auth.ts",
    "src/server/shop-admin/staff-web-runtime-boundary.ts",
    "src/server/shop-admin/staff-web-permissions.ts",
    "src/components/auth/ShopCodeLoginForm.tsx",
    "src/app/(staff-auth)/shop/staff-login/page.tsx",
    "src/app/(staff-auth)/shop/staff-login/actions.ts",
    "src/app/shop/staff-logout/route.ts",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const auth = readProjectFile("src/server/shop-admin/staff-web-auth.ts");
  const runtimeBoundary = readProjectFile(
    "src/server/shop-admin/staff-web-runtime-boundary.ts",
  );
  const permissions = readProjectFile("src/server/shop-admin/staff-web-permissions.ts");
  const shopCodeLoginForm = readProjectFile("src/components/auth/ShopCodeLoginForm.tsx");
  const loginPage = readProjectFile("src/app/(staff-auth)/shop/staff-login/page.tsx");
  const loginActions = readProjectFile("src/app/(staff-auth)/shop/staff-login/actions.ts");
  const logoutRoute = readProjectFile("src/app/shop/staff-logout/route.ts");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");

  for (const required of [
    'import "server-only"',
    "STAFF_WEB_SESSION_COOKIE",
    "httpOnly: true",
    "sameSite: \"lax\"",
    "resolveStaffWebCookieSecure",
    "hashStaffWebSecret",
    "verifyStaffCredential",
    "lookupStaffWebLogin",
    "recordStaffWebLoginFailure",
    "commitStaffWebLogin",
    "resolveStaffWebRuntimeSession",
    "revokeStaffWebRuntimeSession",
    "resolvePosStaffManagerWebPrincipal",
    "staff_web_logout",
  ]) {
    assertContains(auth, required);
  }

  for (const required of [
    'import "server-only"',
    "staff_web_login_lookup_v1",
    "staff_web_login_failure_v1",
    "staff_web_login_commit_v1",
    "staff_web_session_resolve_v1",
    "staff_web_session_revoke_v1",
    "p_session_token_hash",
    "p_expected_credential_version",
  ]) {
    assertContains(runtimeBoundary, required);
  }

  assert.match(
    auth,
    /const committed = await commitStaffWebLogin[\s\S]*if \(!committed\)[\s\S]*return staffWebLoginResult\("database_error"\)[\s\S]*if \(!committed\.ok\)[\s\S]*await setStaffWebCookie\(sessionToken, committed\.expiresAt, meta\)/,
    "staff web login must not set a valid cookie until the lease-bound login commit succeeds",
  );
  assert.doesNotMatch(
    auth,
    /await setStaffWebCookie\(sessionToken, [^)]+\)[\s\S]{0,260}commitStaffWebLogin/,
    "staff web login must not set the cookie before the lease-bound login commit",
  );
  assert.doesNotMatch(
    auth,
    /\.from\(["'](?:staff_web_sessions|staff_web_login_attempts|staff_role_permissions)["']\)/,
    "staff web auth must delegate table persistence to the RPC boundary",
  );
  assert.match(
    auth,
    /staffStateOverridesAttemptLock[\s\S]*credentialStatus === "active"[\s\S]*lockedUntil === null/,
    "only an explicit active staff state may override stale login-attempt telemetry",
  );

  assertContains(permissions, "SHOP_STAFF_WEB_PERMISSION_TREE");
  assertContains(permissions, "shop_admin.full_access");
  assertContains(shopCodeLoginForm, "shopCode");
  assertContains(shopCodeLoginForm, "staffCode");
  assertContains(shopCodeLoginForm, "credential");
  assertContains(shopCodeLoginForm, "staffManagerWebLoginFormAction");
  assertContains(loginPage, "safeNextPath(firstParam(params.next))");
  assertContains(loginPage, 'mode: "shop-code"');
  assertContains(loginActions, "\"use server\"");
  assertContains(loginActions, "nextPathFromForm");
  assertContains(loginActions, 'safeShopAdminNextPath(requested, "/shop")');
  assertContains(loginActions, "redirect(nextPath, RedirectType.replace)");
  assert.doesNotMatch(loginActions, /function isSafeInternalNextPath/);
  assertContains(logoutRoute, "logoutStaffWebSession");
  assertContains(logoutRoute, "export async function POST");
  assertContains(logoutRoute, "isSameOriginPostRequest");
  assertContains(logoutRoute, "NextResponse.redirect(loginUrl, 303)");
  assertContains(logoutRoute, '"Clear-Site-Data", \'"cache", "storage"\'');
  assertContains(logoutRoute, "response.cookies.set");
  assertContains(logoutRoute, "STAFF_WEB_SESSION_COOKIE");
  assertContains(logoutRoute, "isSecureStaffWebCookie");
  assert.doesNotMatch(logoutRoute, /export async function GET/);
  assertContains(shopLayout, "resolveShopAdminDataAccess");
  assertContains(shopLayout, "principal.kind");
  assert.doesNotMatch(`${auth}\n${shopCodeLoginForm}\n${loginPage}\n${loginActions}\n${logoutRoute}`, /localStorage|sessionStorage|console\.(log|debug|info|warn|error)/);
  assert.doesNotMatch(`${shopCodeLoginForm}\n${loginPage}\n${loginActions}\n${logoutRoute}`, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash/i);
  assert.doesNotMatch(auth, /shop_resolved|staff_resolved/);
});

test("TASK-038 Platform provisioning creates staff manager web access server-side", () => {
  const requiredPaths = [
    "src/server/platform-admin/staff-manager-provisioning.ts",
    "src/app/platform/provisioning/provisioningFormSubmit.ts",
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
    "src/app/platform/provisioning/page.tsx",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const provisioning = readProjectFile("src/server/platform-admin/staff-manager-provisioning.ts");
  const provisioningFormSubmit = readProjectFile(
    "src/app/platform/provisioning/provisioningFormSubmit.ts",
  );
  const panel = readProjectFile("src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx");
  const page = readProjectFile("src/app/platform/provisioning/page.tsx");

  for (const required of [
    'import "server-only"',
    "resolvePlatformAdminForRequest",
    "hashStaffCredential",
    "staff_accounts",
    "staff_role_permissions",
    "shop_admin.full_access",
    "platform.staff_manager_web.provision.success",
    "platform.staff_manager_web.provision.failure",
    "oneTimeSignInValue",
  ]) {
    assertContains(provisioning, required);
  }

  assertContains(provisioningFormSubmit, "server-only");
  assertContains(provisioningFormSubmit, "submitInitialManager1001RecoveryForm");
  assertContains(provisioningFormSubmit, "recoverInitialManager1001");
  assertContains(panel, "submitPlatformProvisioningForm");
  assertContains(panel, "shopId");
  assertContains(panel, "Recover initial manager 1001");
  assertContains(panel, "Recover manager 1001");
  assertContains(panel, "New manager display name: manager");
  assertContains(panel, "Manager state");
  assertContains(panel, "reason");
  assertContains(panel, "pending");
  assertContains(panel, "Shown once in this response");
  assert.doesNotMatch(panel, /name="staffCode"|Recovery action|Advanced options/);
  assert.doesNotMatch(panel, /name="displayName"/);
  assertContains(page, "StaffManagerProvisioningPanel");
  assert.doesNotMatch(
    provisioningFormSubmit,
    /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash|hashStaffCredential/i,
  );
  assert.doesNotMatch(`${panel}\n${page}`, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash|hashStaffCredential/i);
  assert.doesNotMatch(panel, /@\/server\//);
});

test("TASK-038 keeps revenue dashboard gated without fake sales data", () => {
  const task = readProjectFile(
    "docs/TASKS/TASK-038-pos-manager-web-login-platform-provisioning-permissions-revenue-gate.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-038/README.md");
  const shopSections = readProjectFile("src/components/shop/shopSections.ts");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const source = `${task}\n${evidence}\n${shopSections}\n${sectionData}`;

  assertContains(source, "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA");
  assertContains(source, "Revenue dashboard requires real sales sync data");
  assert.doesNotMatch(source, /mockRevenue|fakeRevenue|sampleSales|demoSales|pos_sales_sync/i);
});

test("TASK-038 updates the security scanner guardrail", () => {
  const scanner = readProjectFile("scripts/security-checks.mjs");

  assert.match(scanner, /checkTask038PosManagerWebLogin/);
  assert.match(scanner, /checkTask038PosManagerWebLogin\(\)/);
});
