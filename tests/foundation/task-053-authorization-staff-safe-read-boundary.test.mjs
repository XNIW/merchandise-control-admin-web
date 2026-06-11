import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask053Migration() {
  const migrationName = readdirSync(join(root, "supabase/migrations")).find(
    (file) => file.endsWith("_task_053_staff_safe_read_boundary.sql"),
  );

  assert.ok(migrationName, "TASK-053 migration is missing");

  return readFileSync(join(root, "supabase/migrations", migrationName), "utf8");
}

test("TASK-053 documents the authorization architecture", () => {
  const architecturePath = "docs/ARCHITECTURE/AUTHORIZATION-MODEL.md";
  const taskPath = "docs/TASKS/TASK-053-authorization-architecture-staff-safe-read-boundary.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-053/README.md";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  for (const path of [architecturePath, taskPath, evidencePath, masterPlanPath]) {
    assert.equal(existsSync(join(root, path)), true, `${path} is missing`);
  }

  const architecture = read(architecturePath);
  const task = read(taskPath);
  const evidence = read(evidencePath);
  const masterPlan = read(masterPlanPath);

  for (const requiredSnippet of [
    "platform_admin",
    "personal_account",
    "pos_staff_manager",
    "staff POS non usa `auth.uid()`",
    "shop_id` query parameters are navigation hints only",
    "service-role key",
    "credential_hash",
    "Read blocked",
    "Unauthorized",
    "Empty",
    "Not configured",
  ]) {
    assert.match(architecture, new RegExp(requiredSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(task, /Soluzione A: `grants\/view`/);
  assert.match(evidence, /Scelta: Soluzione A, `grants\/view`/);
  assert.match(masterPlan, /Stato TASK-053: `DONE`/);
  assert.match(masterPlan, /Verdict TASK-053: `DONE`/);
  assert.doesNotMatch(
    masterPlan,
    /Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`/,
  );
  assert.match(masterPlan, /Task attivo: `(NONE|NESSUNO)`/);
  assert.match(masterPlan, /Stato TASK-054: `DONE`/);
  assert.match(masterPlan, /Verdict TASK-054: `DONE_WITH_NOTES`/);
});

test("TASK-053 migration fixes only the missing safe staff view grant", () => {
  const migration = readTask053Migration();

  assert.match(migration, /staff_accounts_safe[\s\S]*security_invoker=true/);
  assert.match(migration, /relrowsecurity/);
  assert.match(migration, /grant select \(web_access_revoked_at\)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i);
  assert.match(migration, /revoke all on table public\.staff_accounts_safe from anon/i);
  assert.match(migration, /grant select on table public\.staff_accounts_safe to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+select\s*\([\s\S]*credential_hash[\s\S]*\)\s*on table public\.staff_accounts\s*to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)[\s\S]*on table public\.staff_accounts[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+[\s\S]*on table public\.staff_accounts[\s\S]*to anon/i);
});

test("TASK-053 staff read model remains safe and shop scoped", () => {
  const readModel = read("src/server/shop-admin/staff-read-model.ts");
  const dataAccess = read("src/server/shop-admin/data-access.ts");
  const staffPermissions = read("src/server/shop-admin/staff-web-permissions.ts");

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /\.from\("staff_accounts_safe"\)/);
  assert.match(readModel, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(readModel, /web_access_revoked_at/);
  assert.doesNotMatch(readModel, /credential_hash|select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.match(dataAccess, /strictRequestedShop/);
  assert.match(dataAccess, /Requested shop is not authorized for this principal/);
  assert.match(staffPermissions, /staff\.read/);
  assert.match(staffPermissions, /shop_admin\.full_access/);
});
