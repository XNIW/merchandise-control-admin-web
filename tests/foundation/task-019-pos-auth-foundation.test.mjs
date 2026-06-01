import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask019Migrations() {
  const migrationFiles = readdirSync(join(root, "supabase/migrations")).filter(
    (file) => file.includes("_task_019_"),
  );
  const baseMigrationFile = migrationFiles.find(
    (file) => file.endsWith("_task_019_pos_auth_foundation.sql"),
  );

  assert.ok(baseMigrationFile, "TASK-019 POS auth foundation migration is missing");
  assert.ok(migrationFiles.length > 0, "TASK-019 migrations are missing");

  return migrationFiles
    .sort()
    .map((file) => readProjectFile(`supabase/migrations/${file}`))
    .join("\n");
}

test("TASK-019 tracks POS Auth foundation review/reconciliation state", () => {
  const taskPath = "docs/TASKS/TASK-019-pos-auth-foundation-implementation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-019/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(existsSync(join(root, evidencePath)), true, `${evidencePath} is missing`);

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  assert.match(task, /Stato: `(IN_PROGRESS|REVIEW|DONE)`/);
  assert.match(task, /Fase: `(EXECUTION|REVIEW|DONE_RECONCILED)`/);
  assert.match(evidence, /Stato task: `(IN_PROGRESS|REVIEW|DONE)`/);
  assert.match(masterPlan, /TASK-019 - POS Auth Foundation Implementation/);
});

test("TASK-019 adds only credential/session foundation fields and keeps safe view redacted", () => {
  const migration = readTask019Migrations();

  for (const required of [
    "credential_version",
    "credential_status",
    "session_invalidated_at",
    "staff_accounts_credential_version_positive",
    "staff_accounts_credential_status_check",
    "staff_accounts_safe",
  ]) {
    assert.match(migration, new RegExp(required));
  }

  const safeViewDefinition =
    migration.match(
      /create or replace view public\.staff_accounts_safe[\s\S]*?from public\.staff_accounts;/,
    )?.[0] ?? "";

  assert.match(safeViewDefinition, /credential_version/);
  assert.match(safeViewDefinition, /credential_status/);
  assert.match(safeViewDefinition, /session_invalidated_at/);
  assert.doesNotMatch(safeViewDefinition, /credential_hash|pin_hash|password_hash/i);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i,
  );
  assert.match(
    migration,
    /grant select\s*\([\s\S]*credential_version[\s\S]*credential_status[\s\S]*session_invalidated_at[\s\S]*\)\s*on table public\.staff_accounts to authenticated/i,
  );
});

test("TASK-019 staff credential RPCs are DB-authorized, reasoned and audit-redacted", () => {
  const migration = readTask019Migrations();

  for (const rpcName of [
    "shop_staff_reset_credential",
    "shop_staff_suspend",
    "shop_staff_reactivate",
    "shop_staff_archive",
    "shop_staff_force_credential_rotation",
    "shop_staff_clear_lockout",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpcName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpcName}`));
  }

  assert.match(migration, /set search_path = public, app_private, pg_temp/i);
  assert.match(migration, /app_private\.is_active_shop_staff_admin_member/);
  assert.match(migration, /p_reason text/);
  assert.match(migration, /reason_required/);
  assert.match(migration, /reason_provided/);
  assert.match(migration, /reason_length/);
  assert.match(migration, /session_invalidated_at = now\(\)/);
  assert.match(migration, /locked_until is not null and locked_until > now\(\) then 'locked'/);
  assert.doesNotMatch(migration, /reason_redacted/i);
  assert.doesNotMatch(migration, /pin_plain|password_plain|plain_pin|plain_password/i);
});

test("TASK-019 Shop Admin staff actions expose foundation controls without hashes or POS login", () => {
  const mutationPath = "src/server/shop-admin/staff-mutations.ts";
  const readModelPath = "src/server/shop-admin/staff-read-model.ts";
  const actionsPath = "src/app/shop/actions.ts";
  const panelPath = "src/app/shop/_components/StaffActionPanel.tsx";
  const sectionDataPath = "src/server/shop-admin/shop-section-data.ts";
  const scannerPath = "scripts/security-checks.mjs";

  const mutations = readProjectFile(mutationPath);
  const readModel = readProjectFile(readModelPath);
  const actions = readProjectFile(actionsPath);
  const panel = readProjectFile(panelPath);
  const sectionData = readProjectFile(sectionDataPath);
  const scanner = readProjectFile(scannerPath);
  const clientSurface = [
    panelPath,
    "src/app/shop/staff/page.tsx",
    "src/app/shop/staff/[staffId]/page.tsx",
    "src/components/shop/ShopSectionPage.tsx",
    "src/components/shop/shopSections.ts",
  ]
    .map(readProjectFile)
    .join("\n");

  for (const required of [
    "shop_staff_reset_credential",
    "shop_staff_force_credential_rotation",
    "shop_staff_clear_lockout",
    "reasonRequired",
    "staff.manage",
  ]) {
    assert.match(mutations, new RegExp(required));
  }

  for (const required of [
    "credentialVersion",
    "credentialStatus",
    "sessionInvalidatedAt",
    "credential_version",
    "credential_status",
    "session_invalidated_at",
  ]) {
    assert.match(readModel, new RegExp(required));
  }

  for (const required of [
    "credentialVersion",
    "credentialStatus",
    "sessionInvalidatedAt",
  ]) {
    assert.match(sectionData, new RegExp(required));
  }

  assert.match(actions, /forceStaffCredentialRotationAction/);
  assert.match(actions, /clearStaffLockoutAction/);
  assert.match(panel, /Force credential rotation/);
  assert.match(panel, /Clear lockout/);
  assert.match(panel, /Reason/);
  assert.match(scanner, /checkTask019PosAuthFoundationImplementation/);
  assert.doesNotMatch(clientSurface, /credential_hash|pin_hash|password_hash|hashStaffCredential|verifyStaffCredential/);
  assert.match(scanner, /\^src\\\/app\\\/\(\?:api\\\/\)\?pos\\\//);
  assert.doesNotMatch(clientSurface, /\/api\/pos|pos\/login|login POS pubblico/i);
});
