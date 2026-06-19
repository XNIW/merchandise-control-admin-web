import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertContains(source, snippet, message) {
  assert.ok(source.includes(snippet), message ?? `Missing snippet: ${snippet}`);
}

const migrationPath =
  "supabase/migrations/20260619010000_task_068i_recover_initial_manager_1001.sql";

test("TASK-068I migration reinstalls initial manager 1001 recovery as a self-contained boundary", () => {
  const migration = readProjectFile(migrationPath);

  assertContains(migration, "create or replace function public.platform_recover_initial_manager_1001");
  assertContains(migration, "create or replace function app_private.task068i_platform_recovery_audit");
  assertContains(migration, "not app_private.is_platform_admin()");
  assertContains(migration, "length(redacted_reason) < 8");
  assertContains(migration, "staff_code = '1001'");
  assertContains(migration, "staff_count > 1");
  assertContains(migration, "duplicate_initial_manager");
  assertContains(migration, "insert into public.staff_role_permissions");
  assertContains(migration, "'manager'");
  assertContains(migration, "'shop_admin.full_access'");
  assertContains(migration, "on conflict (shop_id, role_key, permission_key)");
  assertContains(migration, "insert into public.staff_accounts");
  assertContains(migration, "operation_result := 'recreated'");
  assertContains(migration, "operation_result := 'credential_reset'");
  assertContains(migration, "operation_result := 'reactivated_reset'");
  assertContains(migration, "credential_status = 'active'");
  assertContains(migration, "must_change_credential = false");
  assertContains(migration, "session_invalidated_at = now()");
  assertContains(migration, "credential_version = next_credential_version");
  assertContains(migration, "credential_expires_at = now() + interval '14 days'");
  assertContains(migration, "'credential_temporary_days', 14");
  assertContains(migration, "'session_invalidated', true");
  assertContains(migration, "notify pgrst, 'reload schema'");
  assertContains(migration, "grant execute on function public.platform_recover_initial_manager_1001");
  assert.doesNotMatch(
    migration,
    /task051_platform_audit|task051_insert_initial_manager|task051_validate_fiscal_identity/,
    "TASK-068I recovery RPC must not depend on unapplied TASK-051 helpers.",
  );
});

test("TASK-068J recovery keeps temporary credential and session invalidation semantics explicit", () => {
  const migration = readProjectFile(migrationPath);
  const provisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );

  assertContains(provisioning, 'credential_expires_at: "temporary_14_days"');
  assertContains(provisioning, "must_change_credential: false");
  assert.match(
    migration,
    /update public\.staff_accounts[\s\S]*credential_expires_at = now\(\) \+ interval '14 days'[\s\S]*session_invalidated_at = now\(\)/,
  );
  assert.match(
    migration,
    /insert into public\.staff_accounts[\s\S]*credential_expires_at[\s\S]*session_invalidated_at[\s\S]*now\(\) \+ interval '14 days'[\s\S]*now\(\)/,
  );
  assert.equal(
    (migration.match(/credential_hash = normalized_credential_hash/g) ?? [])
      .length,
    1,
    "Recovery update must assign credential_hash exactly once.",
  );
});

test("TASK-068J recovery requires reason and writes audited redacted success/failure events", () => {
  const migration = readProjectFile(migrationPath);
  const provisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );

  assertContains(migration, "length(redacted_reason) < 8");
  assertContains(provisioning, "normalized.reason.length < 8");
  assertContains(migration, "platform.staff_manager.initial_recovery.success");
  assertContains(migration, "platform.staff_manager.initial_recovery.failure");
  assertContains(migration, "metadata_redacted");
  assertContains(migration, "reason_redacted");
  assertContains(migration, "'credential_generated', true");
  assertContains(migration, "'credential_generated', false");
});

test("TASK-068I recovery audit and SQL never persist raw credentials", () => {
  const migration = readProjectFile(migrationPath);

  assertContains(migration, "credential_generated");
  assertContains(migration, "metadata_redacted");
  assertContains(migration, "reason_redacted");
  assertContains(migration, "normalized_credential_hash !~ '^\\$scrypt-v1\\$'");
  assert.doesNotMatch(
    migration,
    /temporaryCredential|oneTimeSignInValue|credential_value|raw_credential|plain_credential|pin_value|plain_pin|password_plain/i,
  );
  assert.doesNotMatch(
    migration,
    /jsonb_build_object\([\s\S]{0,900}(normalized_credential_hash|p_staff_credential_hash)/,
    "Credential hash must not be copied into audit metadata.",
  );
});

test("TASK-068I server maps missing recovery RPC to a safe user-facing code", () => {
  const provisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const labels = readProjectFile("src/app/platform/provisioning/provisioningLabels.ts");
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");

  assertContains(provisioning, '"recovery_rpc_not_configured"');
  assertContains(provisioning, 'error.code === "PGRST202"');
  assertContains(
    provisioning,
    "Initial manager recovery is not installed on this database target. Ask an operator to apply the recovery boundary migration, then retry.",
  );
  assertContains(
    labels,
    "Initial manager recovery is not installed on this database target. Ask an operator to apply the recovery boundary migration, then retry.",
  );
  assertContains(
    dictionaries,
    "Initial manager recovery is not installed on this database target. Ask an operator to apply the recovery boundary migration, then retry.",
  );
  assert.doesNotMatch(
    provisioning,
    /console\.(log|debug|info|warn|error)|error\.message|error\.details|error\.hint/,
    "Recovery RPC errors must stay redacted and must not be logged or echoed.",
  );
});

test("TASK-068I route and submit path keep manager recovery locked to staff code 1001", () => {
  const submit = readProjectFile("src/app/platform/provisioning/provisioningFormSubmit.ts");
  const route = readProjectFile(
    "src/app/platform/provisioning/recover-manager-1001/route.ts",
  );
  const panel = readProjectFile(
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
  );

  assertContains(route, "guardPlatformProvisioningPostRequest");
  assertContains(route, "submitInitialManager1001RecoveryForm");
  assertContains(submit, "recoverInitialManager1001");
  assertContains(submit, 'staffCode: "1001"');
  assert.doesNotMatch(
    submit,
    /submitInitialManager1001RecoveryForm[\s\S]{0,500}value\(formData,\s*"staffCode"\)/,
    "Recovery must ignore any client-provided staffCode field.",
  );
  assert.doesNotMatch(panel, /name="staffCode"|Recovery action|Advanced options/);
  assert.doesNotMatch(
    `${route}\n${submit}\n${panel}`,
    /credential_hash|session_token_hash|SUPABASE_SERVICE_ROLE_KEY|service_role/i,
  );
});

test("TASK-068J recovery rejects or ignores non-1001 client staff codes", () => {
  const provisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const submit = readProjectFile("src/app/platform/provisioning/provisioningFormSubmit.ts");

  assertContains(provisioning, 'INITIAL_MANAGER_RECOVERY_STAFF_CODE = "1001"');
  assertContains(
    provisioning,
    "Only manager 1001 can be recovered by this action.",
  );
  assert.match(
    provisioning,
    /recoverInitialManager1001[\s\S]*staffCode:\s*INITIAL_MANAGER_RECOVERY_STAFF_CODE/,
  );
  assertContains(submit, 'staffCode: "1001"');
  assert.doesNotMatch(
    submit,
    /submitInitialManager1001RecoveryForm[\s\S]{0,500}value\(formData,\s*"staffCode"\)/,
  );
});

test("TASK-068J recovery does not expose credential hashes through UI, DTOs, logs, or redacted errors", () => {
  const route = readProjectFile(
    "src/app/platform/provisioning/recover-manager-1001/route.ts",
  );
  const submit = readProjectFile("src/app/platform/provisioning/provisioningFormSubmit.ts");
  const panel = readProjectFile(
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
  );
  const forms = readProjectFile(
    "src/app/platform/provisioning/ShopProvisioningForms.tsx",
  );
  const provisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const labels = readProjectFile("src/app/platform/provisioning/provisioningLabels.ts");

  assert.doesNotMatch(
    `${route}\n${submit}\n${panel}\n${forms}\n${labels}`,
    /credential_hash|session_token_hash|SUPABASE_SERVICE_ROLE_KEY|service_role/i,
  );
  assert.doesNotMatch(
    provisioning,
    /console\.(log|debug|info|warn|error)|error\.message|error\.details|error\.hint/,
    "Recovery errors must stay redacted and must not be logged or echoed.",
  );
  assert.doesNotMatch(
    provisioning,
    /oneTimeSignInValue:[\s\S]{0,120}(message|diagnostics|fieldErrors)|diagnostics:[\s\S]{0,120}oneTimeSignInValue/,
    "One-time credential must not be copied into diagnostics or error DTOs.",
  );
});
