import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

function task039MigrationName() {
  return readdirSync(join(root, "supabase/migrations")).find((file) =>
    /task_039_staff_aware_shop_admin/i.test(file),
  );
}

test("TASK-039 closes code scope with repo-grounded audit and explicit DONE reconciliation", () => {
  const taskPath =
    "docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-039/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const combined = `${task}\n${evidence}\n${masterPlan}`;

  for (const required of [
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
    assertContains(combined, required);
  }

  assertContains(
    readProjectFile("scripts/security-checks.mjs"),
    "checkTask039StaffAwareShopAdminCompletion",
  );

  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`|Task attivo: `TASK-041 - Runtime Completion: Supabase, Cloudflare\/OpenNext Staging, Sales Sync and Win7POS E2E`|Task attivo: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`|Task attivo: `TASK-043 - Platform Admin runtime fixes`|Task attivo: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`|Task attivo: `TASK-046 - Test target separation: local vs staging`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`|Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`/,
  );
  assert.match(task, /Stato: `DONE`/);
  assert.match(task, /Fase attuale: `DONE_RECONCILED`/);
  assert.match(task, /Verdict corrente: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Stato TASK-039: `DONE`/);
  assert.match(masterPlan, /Fase TASK-039: `DONE_RECONCILED`/);
  assert.match(task, /SPLIT_TO_TASK-043_NOT_BLOCKING_TASK_039_CODE_SCOPE/);
  assert.match(task, /SPLIT_TO_TASK-044_NOT_BLOCKING_TASK_039_CODE_SCOPE/);
  assert.match(task, /SPLIT_TO_TASK-045_NOT_BLOCKING_TASK_039_CODE_SCOPE/);
  assert.doesNotMatch(
    `${task}\n${evidence}`,
    /PRODUCTION_READY|production-ready|sales-sync-ready/i,
  );
});

test("TASK-039 implements staff-aware mutation audit without bypassing auth", () => {
  const task = readProjectFile(
    "docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-039/README.md");
  const actionContext = readProjectFile("src/server/shop-admin/action-context.ts");
  const auditTypes = readProjectFile("src/lib/supabase/database.types.ts");
  const scanner = readProjectFile("scripts/security-checks.mjs");
  const combined = `${task}\n${evidence}`;
  const migrationName = task039MigrationName();

  assert.ok(migrationName, "TASK-039 staff-aware migration is missing");
  const migration = readProjectFile(`supabase/migrations/${migrationName}`);

  assertContains(actionContext, "actorStaffId");
  assertContains(actionContext, "canStaffWebPerformShopAdminAction");
  assert.doesNotMatch(
    actionContext,
    /principalKind !== "personal_account"[\s\S]{0,240}unauthorized/,
  );
  assertContains(auditTypes, "actor_profile_id");
  assertContains(auditTypes, "actor_staff_id");
  assertContains(migration, "alter table public.audit_logs");
  assertContains(migration, "add column if not exists actor_staff_id");
  assertContains(migration, "write_staff_shop_admin_audit");
  assertContains(migration, "p_actor_staff_id");
  assertContains(migration, "metadata_redacted");
  assertContains(scanner, "actor_staff_id");

  for (const required of [
    "mutazioni staff web implementate",
    "staff-aware mutation foundation",
    "no bypass client-side",
    "service-role solo server-side",
    "actor_staff_id",
  ]) {
    assertContains(combined, required);
  }
});

test("TASK-039 server mutations use staff granular permissions and server-only audit helpers", () => {
  const requiredPaths = [
    "src/server/shop-admin/staff-aware-mutations.ts",
    "src/server/shop-admin/staff-web-permissions.ts",
    "src/server/shop-admin/catalog-mutations.ts",
    "src/server/shop-admin/staff-mutations.ts",
    "src/server/shop-admin/device-mutations.ts",
    "src/server/shop-admin/import-export-workbook.ts",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const staffAware = readProjectFile("src/server/shop-admin/staff-aware-mutations.ts");
  const accessPrincipal = readProjectFile("src/server/shop-admin/access-principal.ts");
  const permissions = readProjectFile("src/server/shop-admin/staff-web-permissions.ts");
  const catalog = readProjectFile("src/server/shop-admin/catalog-mutations.ts");
  const staff = readProjectFile("src/server/shop-admin/staff-mutations.ts");
  const devices = readProjectFile("src/server/shop-admin/device-mutations.ts");
  const settings = readProjectFile("src/server/shop-admin/settings-mutations.ts");
  const importExport = readProjectFile("src/server/shop-admin/import-export-workbook.ts");
  const combinedMutations = `${catalog}\n${staff}\n${devices}\n${importExport}\n${staffAware}`;

  for (const required of [
    'import "server-only"',
    "runStaffAwareShopAdminMutation",
    "write_staff_shop_admin_audit",
    "actorStaffId",
    "inventory_suppliers",
    "inventory_categories",
    "inventory_products",
    "staff_accounts",
    "staff_web_sessions",
    "staff_role_permissions",
    "shop_devices",
    "metadata_redacted",
    "replaceStaffRolePermissions",
    "staleStaffWebPermissions",
    "upsert",
    "onConflict: \"shop_id,role_key,permission_key\"",
    "hasStaffFullShopAdminWebAccess(context.staffPermissions)",
    "code: \"unauthorized\"",
  ]) {
    assertContains(staffAware, required);
  }

  assertContains(staffAware, ".in(\"permission_key\", stalePermissions)");
  assert.doesNotMatch(
    staffAware,
    /\.from\("staff_role_permissions"\)[\s\S]{0,240}\.delete\(\)[\s\S]{0,240}\.insert\(/,
  );
  assertContains(settings, "SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE");
  assertContains(settings, "shop_settings_managed_by_master_console");
  assert.doesNotMatch(
    settings,
    /\.from\("shops"\)[\s\S]{0,360}\.update\(/,
    "settings mutations must not update shop profile rows from Admin Console",
  );

  for (const required of [
    "hasRecognizedWebPermission",
    "isShopStaffWebPermission(permission)",
  ]) {
    assertContains(accessPrincipal, required);
  }

  for (const required of [
    "catalog.write",
    "staff.write",
    "devices.write",
    "settings.write",
    "catalog.import",
    "catalog.export",
    "pos.dashboard.read",
    "sync.read",
    "canStaffWebPerformShopAdminAction",
    "SHOP_STAFF_WEB_ROLE_TEMPLATES",
  ]) {
    assertContains(permissions, required);
  }

  for (const required of [
    "runStaffAwareShopAdminMutation",
    "principalKind === \"pos_staff_manager\"",
  ]) {
    assertContains(combinedMutations, required);
  }

  assert.doesNotMatch(staffAware, /SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage|console\./);
  assert.doesNotMatch(combinedMutations, /SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage/);
});

test("TASK-039 exposes staff lifecycle, permission template and account profile UX without fake sales", () => {
  const staffPanel = readProjectFile("src/app/shop/_components/StaffActionPanel.tsx");
  const staffPage = readProjectFile("src/app/shop/staff/page.tsx");
  const shopActions = readProjectFile("src/app/shop/actions.ts");
  const settingsPage = readProjectFile("src/app/shop/settings/page.tsx");
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");
  const categoriesPage = readProjectFile("src/app/shop/categories/page.tsx");
  const suppliersPage = readProjectFile("src/app/shop/suppliers/page.tsx");
  const devicesPage = readProjectFile("src/app/shop/devices/page.tsx");
  const importExportPage = readProjectFile("src/app/shop/import-export/page.tsx");
  const importExportPanel = readProjectFile(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );
  const membersPage = readProjectFile("src/app/shop/members/page.tsx");
  const profilePagePath = "src/app/account/profile/page.tsx";
  const profileActionsPath = "src/app/account/profile/actions.ts";
  const syncPage = readProjectFile("src/app/shop/sync/page.tsx");
  const posDashboard = readProjectFile("src/server/shop-admin/pos-live-read-model.ts");

  assert.equal(existsSync(join(root, profilePagePath)), true, `${profilePagePath} is missing`);
  assert.equal(existsSync(join(root, profileActionsPath)), true, `${profileActionsPath} is missing`);

  const profilePage = readProjectFile(profilePagePath);
  const profileActions = readProjectFile(profileActionsPath);
  const source = `${staffPanel}\n${shopActions}\n${settingsPage}\n${profilePage}\n${profileActions}`;
  const gatedPages = [
    staffPage,
    settingsPage,
    productsPage,
    categoriesPage,
    suppliersPage,
    devicesPage,
    importExportPage,
    membersPage,
  ].join("\n");
  const revenueGateSource = [
    readProjectFile("src/server/shop-admin/pos-live-read-model.ts"),
    readProjectFile("src/server/shop-admin/shop-section-data.ts"),
    readProjectFile("docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md"),
  ].join("\n");

  for (const required of [
    "revokeStaffWebAccessAction",
    "revokeStaffWebSessionsAction",
    "updateStaffRolePermissionsAction",
    "SHOP_STAFF_WEB_ROLE_TEMPLATES",
    "Staff web access",
    "Session status",
    "Password reset email",
    "resetPasswordForEmail",
    "canManageRolePermissions",
  ]) {
    assertContains(source, required);
  }

  for (const required of [
    "resolveShopActionContext",
    "staff.manage",
    "products.write",
    "categories.write",
    "suppliers.write",
    "devices.manage",
    "catalog.import",
    "catalog.export",
    "members.manage",
  ]) {
    assertContains(gatedPages, required);
  }

  for (const required of ["canImport", "canExport"]) {
    assertContains(importExportPanel, required);
  }

  assertContains(revenueGateSource, "REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA");
  assert.doesNotMatch(
    `${syncPage}\n${posDashboard}\n${revenueGateSource}`,
    /mockRevenue|fakeRevenue|sampleSales|demoSales|pos_sales_sync/i,
  );
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|credential_hash|session_token_hash/i);
});
