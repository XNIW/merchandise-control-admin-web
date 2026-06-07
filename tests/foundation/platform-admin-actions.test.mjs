import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-006 action foundation files define redacted controlled actions", () => {
  const expectedFiles = [
    "src/server/platform-admin/action-types.ts",
    "src/server/platform-admin/audit-events.ts",
    "src/server/platform-admin/shop-action-validation.ts",
    "src/server/platform-admin/shop-actions.ts",
    "src/app/platform/operations/actions.ts",
  ];

  for (const relativePath of expectedFiles) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const actionTypes = readProjectFile("src/server/platform-admin/action-types.ts");
  const auditEvents = readProjectFile("src/server/platform-admin/audit-events.ts");
  const validation = readProjectFile("src/server/platform-admin/shop-action-validation.ts");
  const shopActions = readProjectFile("src/server/platform-admin/shop-actions.ts");
  const serverActions = readProjectFile("src/app/platform/operations/actions.ts");

  assert.match(actionTypes, /PlatformShopActionResult/);
  assert.match(actionTypes, /fieldErrors/);
  assert.match(actionTypes, /auditEventId/);
  assert.doesNotMatch(actionTypes, /email|password|token|secret/i);

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
    assert.match(auditEvents, new RegExp(eventKey.replaceAll(".", "\\.")));
  }

  assert.match(validation, /normalizeShopCode/);
  assert.match(validation, /\^\[A-Z0-9\]/);
  assert.match(validation, /validateRequiredReason/);
  assert.match(validation, /canTransitionShopStatus/);

  assert.match(shopActions, /import "server-only"/);
  assert.match(shopActions, /authorizeCurrentPlatformAdmin/);
  assert.match(shopActions, /\.rpc\("platform_create_shop"/);
  assert.match(shopActions, /\.rpc\("platform_suspend_shop"/);
  assert.match(shopActions, /\.rpc\("platform_reactivate_shop"/);
  assert.match(shopActions, /\.rpc\("platform_soft_delete_shop"/);
  assert.match(shopActions, /insertInitialManager/);
  assert.match(shopActions, /credential_hash: input\.credentialHash/);
  assert.doesNotMatch(shopActions, /console\.(log|debug|info|warn|error)/);

  assert.match(serverActions, /^"use server";/);
  assert.match(serverActions, /revalidatePath\("\/platform\/operations"\)/);
  assert.match(serverActions, /revalidatePath\("\/platform\/shops"\)/);
  assert.doesNotMatch(serverActions, /from\(["'][a-z_]+["']\)/);
});

test("TASK-006 migration defines safe RPC boundary and grants", () => {
  const migrationPath =
    "supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql";

  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = readProjectFile(migrationPath);

  for (const snippet of [
    "suspended_at",
    "suspended_by_profile_id",
    "status_reason_redacted",
    "status_changed_at",
    "status_changed_by_profile_id",
    "failure",
    "platform_create_shop",
    "platform_suspend_shop",
    "platform_reactivate_shop",
    "platform_soft_delete_shop",
    "security definer",
    "set search_path = public, app_private, pg_temp",
    "app_private.is_platform_admin()",
    "for update",
    "grant execute on function public.platform_create_shop",
    "revoke all on function public.platform_create_shop",
  ]) {
    assert.match(migration, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all).*on table public\.(profiles|shops|shop_members|platform_admins|shop_inventory_sources|audit_logs).*authenticated/i,
  );
  assert.doesNotMatch(migration, /grant\s+\w+.*\s+to\s+anon/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.shops/i);
  assert.doesNotMatch(migration, /shop_inventory_sources[\s\S]{0,80}(insert|update|delete)/i);
});

test("security scanner treats SQL migrations as text for secret checks", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(securityChecks, /"\.sql"/);
});
