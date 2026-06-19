import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  assert.match(shopActions, /\.rpc\("platform_map_shop_inventory_source"/);
  assert.match(shopActions, /\.rpc\("platform_suspend_shop"/);
  assert.match(shopActions, /\.rpc\("platform_reactivate_shop"/);
  assert.match(shopActions, /\.rpc\("platform_soft_delete_shop"/);
  assert.match(shopActions, /\.rpc\(\s*"platform_create_shop_with_owner_bootstrap"/);
  assert.match(shopActions, /\.rpc\(\s*"platform_create_pos_first_shop"/);
  assert.match(shopActions, /p_staff_credential_hash: credentialHash/);
  assert.doesNotMatch(shopActions, /console\.(log|debug|info|warn|error)/);

  assert.match(serverActions, /^"use server";/);
  assert.match(serverActions, /revalidatePath\("\/platform\/operations"\)/);
  assert.match(serverActions, /revalidatePath\("\/platform\/shops"\)/);
  assert.doesNotMatch(serverActions, /from\(["'][a-z_]+["']\)/);
});

test("TASK-068E inventory source mapping is audited behind Platform Admin RPC", () => {
  const migrationPath =
    "supabase/migrations/20260618230828_task_068e_inventory_source_mapping.sql";

  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = readProjectFile(migrationPath);
  const actionTypes = readProjectFile("src/server/platform-admin/action-types.ts");
  const validation = readProjectFile("src/server/platform-admin/shop-action-validation.ts");
  const shopActions = readProjectFile("src/server/platform-admin/shop-actions.ts");
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  for (const snippet of [
    "platform_map_shop_inventory_source",
    "security definer",
    "set search_path = public, app_private, pg_temp",
    "app_private.is_platform_admin()",
    "platform.shop.inventory_source.map.attempt",
    "platform.shop.inventory_source.map.success",
    "platform.shop.inventory_source.map.failure",
    "shop_inventory_source_id",
    "mapping_state = 'mapped'",
    "source_kind = 'mobile_owner'",
    "verified_at = now()",
    "verified_by_profile_id = actor_id",
    "created_by_profile_id",
    "role_key = 'shop_owner'",
    "membership_status = 'active'",
    "grant execute on function public.platform_map_shop_inventory_source",
  ]) {
    assertContains(migration, snippet, `migration must contain ${snippet}`);
  }

  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all).*on table public\.shop_inventory_sources.*authenticated/i,
  );
  assert.doesNotMatch(migration, /public\.inventory_(products|categories|suppliers|product_prices)[\s\S]{0,120}(insert|update|delete)/i);
  assert.doesNotMatch(migration, /staff_accounts|staff_credential|pin_hash|credential_hash/i);

  for (const snippet of [
    "MapShopInventorySourceInput",
    "PlatformShopInventorySourceMappingResult",
    "validateMapShopInventorySourceInput",
    "mapPlatformShopInventorySource",
    ".rpc(\"platform_map_shop_inventory_source\"",
    "p_owner_user_id: normalized.ownerProfileId",
    "p_shop_id: normalized.shopId",
    "platform_map_shop_inventory_source",
  ]) {
    assertContains(
      `${actionTypes}\n${validation}\n${shopActions}\n${databaseTypes}\n${securityChecks}`,
      snippet,
      `server mapping contract must contain ${snippet}`,
    );
  }
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
