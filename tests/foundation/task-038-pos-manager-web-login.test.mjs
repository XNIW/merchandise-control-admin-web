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
    "No dashboard vendite fake",
    "No Win7POS/Android/iOS",
  ]) {
    assertContains(combined, required);
  }

  assert.match(
    readProjectFile("docs/MASTER-PLAN.md"),
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`/,
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
    "src/server/shop-admin/staff-web-permissions.ts",
    "src/app/(staff-auth)/shop/staff-login/page.tsx",
    "src/app/(staff-auth)/shop/staff-login/actions.ts",
    "src/app/shop/staff-logout/route.ts",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const auth = readProjectFile("src/server/shop-admin/staff-web-auth.ts");
  const permissions = readProjectFile("src/server/shop-admin/staff-web-permissions.ts");
  const loginPage = readProjectFile("src/app/(staff-auth)/shop/staff-login/page.tsx");
  const loginActions = readProjectFile("src/app/(staff-auth)/shop/staff-login/actions.ts");
  const logoutRoute = readProjectFile("src/app/shop/staff-logout/route.ts");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");

  for (const required of [
    'import "server-only"',
    "STAFF_WEB_SESSION_COOKIE",
    "httpOnly: true",
    "sameSite: \"lax\"",
    "secure: isSecureStaffWebCookie",
    "hashStaffWebSecret",
    "verifyStaffCredential",
    "staff_web_sessions",
    "staff_web_login_attempts",
    "staff.role_key !== \"manager\"",
    "hasStaffFullShopAdminWebAccess",
    "staff.web.login.success",
    "staff.web.login.failure",
    "staff.web.logout",
  ]) {
    assertContains(auth, required);
  }

  assertContains(permissions, "SHOP_STAFF_WEB_PERMISSION_TREE");
  assertContains(permissions, "shop_admin.full_access");
  assertContains(loginPage, "shopCode");
  assertContains(loginPage, "staffCode");
  assertContains(loginPage, "credential");
  assertContains(loginActions, "\"use server\"");
  assertContains(logoutRoute, "logoutStaffWebSession");
  assertContains(shopLayout, "resolveCurrentShopAdminPrincipal");
  assertContains(shopLayout, "principal.kind");
  assert.doesNotMatch(`${auth}\n${loginPage}\n${loginActions}\n${logoutRoute}`, /localStorage|sessionStorage|console\.(log|debug|info|warn|error)/);
  assert.doesNotMatch(`${loginPage}\n${loginActions}\n${logoutRoute}`, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash/i);
  assert.doesNotMatch(auth, /shop_resolved|staff_resolved/);
});

test("TASK-038 Platform provisioning creates staff manager web access server-side", () => {
  const requiredPaths = [
    "src/server/platform-admin/staff-manager-provisioning.ts",
    "src/app/platform/provisioning/actions.ts",
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
    "src/app/platform/provisioning/page.tsx",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const provisioning = readProjectFile("src/server/platform-admin/staff-manager-provisioning.ts");
  const actions = readProjectFile("src/app/platform/provisioning/actions.ts");
  const panel = readProjectFile("src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx");
  const page = readProjectFile("src/app/platform/provisioning/page.tsx");

  for (const required of [
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
    assertContains(provisioning, required);
  }

  assertContains(actions, "\"use server\"");
  assertContains(actions, "provisionPlatformStaffManagerAction");
  assertContains(panel, "useActionState");
  assertContains(panel, "shopId");
  assertContains(panel, "staffCode");
  assertContains(panel, "displayName");
  assertContains(panel, "reason");
  assertContains(panel, "pending");
  assertContains(panel, "Shown once in this response");
  assertContains(page, "StaffManagerProvisioningPanel");
  assert.doesNotMatch(actions, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash|hashStaffCredential/i);
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
