import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-018 creates a minimal CI pipeline without deploy or secrets", () => {
  const workflowPath = ".github/workflows/ci.yml";

  assert.equal(existsSync(join(root, workflowPath)), true, `${workflowPath} is missing`);

  const workflow = readProjectFile(workflowPath);

  for (const required of [
    "pull_request:",
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
    assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(workflow, /deploy|vercel|netlify|SUPABASE_SERVICE_ROLE|service_role/i);
});

test("TASK-018 CI smoke script uses next start after build", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const smokeScript = packageJson.scripts["test:ui-smoke:ci"];

  assert.equal(typeof smokeScript, "string");
  assert.match(smokeScript, /PLAYWRIGHT_BASE_URL=http:\/\/127\.0\.0\.1:3003/);
  assert.match(smokeScript, /PLAYWRIGHT_WEB_SERVER_COMMAND=/);
  assert.match(smokeScript, /npm run start -- --hostname 127\.0\.0\.1 --port 3003/);
  assert.match(smokeScript, /PLAYWRIGHT_REUSE_SERVER=0/);
  assert.match(smokeScript, /--project=chromium-desktop/);
});

test("TASK-018 locks down legacy TASK-108 backup tables non-destructively", () => {
  const migrationPath =
    "supabase/migrations/20260531234500_task_018_backup_table_lockdown.sql";

  assert.equal(existsSync(join(root, migrationPath)), true, `${migrationPath} is missing`);

  const migration = readProjectFile(migrationPath);

  for (const backupTable of [
    "backup_task108_inventory_suppliers_20260514173049",
    "backup_task108_inventory_categories_20260514173049",
    "backup_task108_inventory_products_20260514173049",
    "backup_task108_inventory_product_prices_20260514173049",
    "backup_task108_shared_sheet_sessions_20260514173049",
    "backup_task108_sync_events_20260514173049",
  ]) {
    assert.match(migration, new RegExp(backupTable));
  }

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /revoke all on table/i);
  assert.match(migration, /from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

test("TASK-018 hardens legacy trigger search_path non-destructively", () => {
  const migrationPath =
    "supabase/migrations/20260531235000_task_018_trigger_search_path_hardening.sql";

  assert.equal(existsSync(join(root, migrationPath)), true, `${migrationPath} is missing`);

  const migration = readProjectFile(migrationPath);

  assert.match(migration, /create or replace function public\.set_shared_sheet_sessions_updated_at/);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

test("TASK-018 cleans the member invite lint warning without changing grants", () => {
  const migrationPath =
    "supabase/migrations/20260531235500_task_018_member_invite_lint_cleanup.sql";

  assert.equal(existsSync(join(root, migrationPath)), true, `${migrationPath} is missing`);

  const migration = readProjectFile(migrationPath);

  assert.match(migration, /create or replace function public\.shop_member_invite_profile/);
  assert.match(migration, /perform 1[\s\S]*from public\.profiles/i);
  assert.match(migration, /set search_path = public, app_private, pg_temp/i);
  assert.match(migration, /grant execute on function public\.shop_member_invite_profile/);
  assert.doesNotMatch(migration, /v_profile/i);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

test("TASK-018 documents mobile/POS enforcement and POS auth as design-only", () => {
  const enforcementPath = "docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md";
  const authPath = "docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md";
  const taskPath = "docs/TASKS/TASK-018-infrastructure-security-hardening-pos-foundation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-018/README.md";

  for (const path of [enforcementPath, authPath, taskPath, evidencePath]) {
    assert.equal(existsSync(join(root, path)), true, `${path} is missing`);
  }

  const enforcement = readProjectFile(enforcementPath);
  const auth = readProjectFile(authPath);
  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);

  for (const required of [
    "Device authorization",
    "Device revocation",
    "Staff suspension",
    "Shop suspension",
    "Emergency revoke",
    "shop_devices.status",
  ]) {
    assert.match(enforcement, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
    assert.match(auth, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(`${task}\n${evidence}`, /REVIEW|DONE_RECONCILED/);
  assert.match(`${task}\n${evidence}`, /PASS_WITH_NOTES|DONE/);
  assert.doesNotMatch(`${task}\n${evidence}`, /production-ready/);
});

test("TASK-018 is enforced by the security scanner and tracked in the master plan", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  assert.match(securityChecks, /checkTask018InfrastructureSecurityPosFoundation/);
  assert.match(securityChecks, /checkTask018InfrastructureSecurityPosFoundation\(\)/);
  assert.match(masterPlan, /TASK-018 - Infrastructure, Security Hardening and POS Foundation/);
  assert.match(
    masterPlan,
    /Task attivo: `TASK-018 - Infrastructure, Security Hardening and POS Foundation`|Task attivo: `TASK-019 - POS Auth Foundation Implementation`|Task attivo: `TASK-020 - Win7POS Integration Planning`|Task attivo: `TASK-021 - POS backend session\/device endpoints`|Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`|Task attivo: `TASK-026 - Shop Admin product catalog foundation`|Task attivo: `TASK-027 - Catalog pull delta sync and POS catalog hardening`|Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`|Task attivo: `(NONE|NESSUNO)`/,
  );
});
