import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 Platform Admin grant and revoke use audited anti-lockout RPCs", () => {
  const migrationPath =
    "supabase/migrations/20260531210000_task_016_platform_completion.sql";
  const pagePath = "src/app/platform/admins/page.tsx";
  const actionsPath = "src/app/platform/admins/actions.ts";
  const adminActionsPath = "src/server/platform-admin/admin-actions.ts";
  const sectionDataPath = "src/server/platform-admin/platform-section-data.ts";
  const validationPath = "src/server/platform-admin/shop-action-validation.ts";

  for (const relativePath of [
    migrationPath,
    pagePath,
    actionsPath,
    adminActionsPath,
    sectionDataPath,
    validationPath,
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const migration = readProjectFile(migrationPath);
  const page = readProjectFile(pagePath);
  const actions = readProjectFile(actionsPath);
  const adminActions = readProjectFile(adminActionsPath);
  const sectionData = readProjectFile(sectionDataPath);
  const validation = readProjectFile(validationPath);

  for (const rpcName of [
    "platform_grant_platform_admin",
    "platform_revoke_platform_admin",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpcName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpcName}`));
    assert.match(adminActions, new RegExp(`\\.rpc\\("${rpcName}"`));
  }

  for (const requiredSnippet of [
    "app_private.is_platform_admin()",
    "self_lockout_blocked",
    "last_admin_blocked",
    "platform.admin.grant.success",
    "platform.admin.revoke.success",
  ]) {
    assert.match(migration, new RegExp(requiredSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(actions, /^"use server";/);
  assert.match(actions, /grantPlatformAdminAction/);
  assert.match(actions, /revokePlatformAdminAction/);
  assert.match(page, /Grant admin/);
  assert.match(page, /Revoke admin/);
  assert.match(page, /Type REVOKE to confirm/);
  assert.doesNotMatch(`${page}\n${sectionData}`, /BLOCKED_SCHEMA|read-only until reviewed|grant\/revoke remains blocked|Reviewed schema required/i);
  assert.match(sectionData, /Anti self-lockout RPCs/);
  assert.match(validation, /validatePlatformAdminGrantInput/);
  assert.match(validation, /validatePlatformAdminRevokeInput/);
  assert.doesNotMatch(`${actions}\n${adminActions}`, /\.(insert|update|delete|upsert)\s*\(/);
});

test("TASK-016 restore shop uses audited lifecycle RPC when archived shops are safe", () => {
  const migrationPath =
    "supabase/migrations/20260531210000_task_016_platform_completion.sql";
  const operationPagePath = "src/app/platform/operations/page.tsx";
  const operationActionsPath = "src/app/platform/operations/actions.ts";
  const shopActionsPath = "src/server/platform-admin/shop-actions.ts";

  for (const relativePath of [
    migrationPath,
    operationPagePath,
    operationActionsPath,
    shopActionsPath,
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const migration = readProjectFile(migrationPath);
  const operationPage = readProjectFile(operationPagePath);
  const operationActions = readProjectFile(operationActionsPath);
  const shopActions = readProjectFile(shopActionsPath);

  assert.match(migration, /create or replace function public\.platform_restore_shop/);
  assert.match(migration, /platform\.shop\.restore\.success/);
  assert.match(migration, /shop_status = 'archived'/);
  assert.match(operationActions, /restorePlatformShopAction/);
  assert.match(shopActions, /\.rpc\("platform_restore_shop"/);
  assert.match(operationPage, /Restore shop/);
  assert.match(operationPage, /Type shop code to restore/);
});
