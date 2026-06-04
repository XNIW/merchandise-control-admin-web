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

function extractFunction(source, name) {
  const start = source.indexOf(`export function ${name}`);

  assert.notEqual(start, -1, `${name} export is missing`);

  const nextExport = source.indexOf("\nexport ", start + 1);

  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

test("TASK-037 records the Shop Admin dual access product decision", () => {
  const requiredPaths = [
    "docs/TASKS/TASK-037-shop-admin-dual-access-model.md",
    "docs/TASKS/EVIDENCE/TASK-037/README.md",
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
  ]) {
    assertContains(combined, required);
  }
});

test("TASK-037 server foundation defines explicit principals without implementing staff web login", () => {
  const principalPath = "src/server/shop-admin/access-principal.ts";

  assert.equal(existsSync(join(root, principalPath)), true, `${principalPath} is missing`);

  const principal = readProjectFile(principalPath);
  const shopAccess = readProjectFile("src/server/shop-admin/shop-access.ts");
  const authLogin = readProjectFile("src/app/auth/login/page.tsx");

  for (const required of [
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
    assertContains(principal, required);
  }

  const eligibilityBody = extractFunction(
    principal,
    "isPosStaffEligibleForShopAdminWeb",
  );

  assert.match(
    eligibilityBody,
    /input\.roleKey === POS_STAFF_WEB_CURRENT_SCHEMA_ROLE_KEY/,
  );
  assert.match(eligibilityBody, /input\.status === "active"/);
  assert.match(eligibilityBody, /input\.credentialStatus === "active"/);
  assert.match(eligibilityBody, /input\.mustChangeCredential !== true/);
  assert.match(eligibilityBody, /!isFutureTimestamp\(input\.lockedUntil\)/);
  assert.match(eligibilityBody, /hasFullWebPermission\(input\)/);
  assert.doesNotMatch(principal, /new Set\(\["manager", "admin"\]\)/);
  assert.doesNotMatch(principal, /posStaffWebRoleKeys\.has/);
  assert.doesNotMatch(principal, /principalCanSelectShop|principalShopRole/);

  assertContains(shopAccess, "resolveCurrentShopAdminShellAccess");
  assertContains(shopAccess, ".from(\"shop_members\")");
  assertContains(shopAccess, "shop_owner");
  assertContains(shopAccess, "shop_manager");
  assertContains(authLogin, "Use a personal admin account.");

  assert.doesNotMatch(principal, /createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|cookies\(\)\.set|NextResponse/);
  assert.doesNotMatch(principal, /credential_hash|pin_plain|password_plain|plain_pin|plain_password/i);
});

test("TASK-037 keeps schema facts explicit and does not add staff web login routes or migrations", () => {
  const migrations = readdirSync(join(root, "supabase/migrations"));
  const appFiles = readdirSync(join(root, "src/app"), { recursive: true })
    .filter((entry) => typeof entry === "string")
    .map((entry) => `src/app/${entry}`);
  const migrationText = [
    "supabase/migrations/20260531050837_task_014_pos_staff_foundation.sql",
    "supabase/migrations/20260531235900_task_019_pos_auth_foundation.sql",
    "supabase/migrations/20260601120000_task_021_pos_sessions_devices.sql",
  ]
    .map(readProjectFile)
    .join("\n");
  const docs = [
    readProjectFile("docs/TASKS/TASK-037-shop-admin-dual-access-model.md"),
    readProjectFile("docs/TASKS/EVIDENCE/TASK-037/README.md"),
    readProjectFile("docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md"),
  ].join("\n");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task038Opened = /TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate/.test(
    masterPlan,
  );

  assert.match(migrationText, /role_key in \('cashier', 'manager', 'viewer'\)/);
  assert.match(migrationText, /credential_status in \('pending_setup', 'active', 'rotation_required', 'locked'\)/);
  assert.match(migrationText, /create view public\.staff_accounts_safe/);
  assert.match(migrationText, /create table if not exists public\.pos_sessions/);
  assert.match(migrationText, /create table if not exists public\.pos_device_credentials/);
  assert.match(docs, /`admin` role_key: `NOT_PRESENT_IN_SCHEMA`/);
  assert.match(docs, /Current schema staff web role: `manager` only/);
  assert.match(docs, /staff manager web login completo: `PLANNED_NOT_IMPLEMENTED`/);

  assert.equal(migrations.some((file) => /task_037|task-037/i.test(file)), false);
  assert.equal(
    appFiles.some((file) => /staff.*login|login.*staff|pos.*manager.*login/i.test(file)) &&
      !task038Opened,
    false,
  );
});

test("TASK-037 updates the security scanner guardrail", () => {
  const scanner = readProjectFile("scripts/security-checks.mjs");

  assert.match(scanner, /checkTask037ShopAdminDualAccessModel/);
  assert.match(scanner, /checkTask037ShopAdminDualAccessModel\(\)/);
});
