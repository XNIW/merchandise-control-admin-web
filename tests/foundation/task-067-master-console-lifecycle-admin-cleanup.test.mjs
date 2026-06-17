import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("TASK-067 adds audited Master Console membership RPCs without hard delete", () => {
  const migrationPath =
    "supabase/migrations/20260616120000_task_067_platform_shop_membership_management.sql";
  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = read(migrationPath);
  const databaseTypes = read("src/lib/supabase/database.types.ts");
  const shopActions = read("src/server/platform-admin/shop-actions.ts");
  const validation = read("src/server/platform-admin/shop-action-validation.ts");
  const serverActions = read("src/app/platform/operations/actions.ts");
  const securityChecks = read("scripts/security-checks.mjs");

  for (const rpc of [
    "platform_assign_shop_member",
    "platform_revoke_shop_member",
  ]) {
    assertContains(migration, `create or replace function public.${rpc}`);
    assertContains(migration, `grant execute on function public.${rpc}`);
    assertContains(databaseTypes, rpc);
    assertContains(shopActions, `.rpc("${rpc}"`);
    assertContains(securityChecks, rpc);
  }

  assertContains(migration, "app_private.is_platform_admin()");
  assertContains(migration, "app_private.write_platform_shop_audit");
  assertContains(migration, "platform.shop.member.assign.success");
  assertContains(migration, "platform.shop.member.revoke.success");
  assertContains(migration, "last_owner_blocked");
  assertContains(migration, "self_membership_revoke_blocked");
  assertContains(validation, "validateAssignShopMemberInput");
  assertContains(validation, "validateRevokeShopMemberInput");
  assertContains(validation, "shop_owner");
  assertContains(validation, "shop_manager");
  assertContains(serverActions, "assignPlatformShopMemberAction");
  assertContains(serverActions, "revokePlatformShopMemberAction");
  assertContains(serverActions, 'target.includes("?") ? "&" : "?"');

  assert.doesNotMatch(migration, /delete\s+from\s+public\.(shops|profiles|shop_members|audit_logs)/i);
  assert.doesNotMatch(
    migration,
    /grant\s+(insert|update|delete|all).*on table public\.(profiles|shops|shop_members|audit_logs).*authenticated/i,
  );
});

test("TASK-067 adds audited activate and guarded purge RPCs", () => {
  const migrationPath =
    "supabase/migrations/20260616230402_task_067_lifecycle_activate_safe_shop_purge.sql";
  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = read(migrationPath);
  const databaseTypes = read("src/lib/supabase/database.types.ts");
  const shopActions = read("src/server/platform-admin/shop-actions.ts");
  const validation = read("src/server/platform-admin/shop-action-validation.ts");
  const serverActions = read("src/app/platform/operations/actions.ts");
  const securityChecks = read("scripts/security-checks.mjs");

  for (const rpc of [
    "platform_activate_shop",
    "platform_preview_shop_purge",
    "platform_purge_shop",
  ]) {
    assertContains(migration, `create or replace function public.${rpc}`);
    assertContains(migration, `grant execute on function public.${rpc}`);
    assertContains(databaseTypes, rpc);
  }

  assertContains(migration, "app_private.is_platform_admin()");
  assertContains(migration, "platform.shop.activate.success");
  assertContains(migration, "platform.shop.purge.success");
  assertContains(migration, "DELETE ' || target_shop.shop_code");
  assertContains(migration, "target_shop.shop_status <> 'archived'");
  assertContains(migration, "unsafe_purge_target");
  assertContains(migration, "dependencies_blocked");
  assertContains(migration, "platform_shop_purge_dependency_summary");
  assertContains(migration, "actor_id, 'global', null");
  assertContains(validation, "validateActivateShopInput");
  assertContains(validation, "validatePurgeShopInput");
  assertContains(shopActions, `.rpc("platform_activate_shop"`);
  assertContains(shopActions, `.rpc("platform_purge_shop"`);
  assertContains(serverActions, "changePlatformShopStatusAction");
  assertContains(serverActions, "purgePlatformShopAction");
  assertContains(securityChecks, "platform_activate_shop");
  assertContains(securityChecks, "platform_purge_shop");
  assert.doesNotMatch(migration, /delete\s+from\s+public\.audit_logs/i);
});

test("TASK-067 follow-up adds safe force purge for synthetic test shops", () => {
  const migrationPath =
    "supabase/migrations/20260616235502_task_067_safe_force_purge_test_shop.sql";
  assert.equal(existsSync(join(root, migrationPath)), true);

  const migration = read(migrationPath);
  const databaseTypes = read("src/lib/supabase/database.types.ts");
  const shopActions = read("src/server/platform-admin/shop-actions.ts");
  const validation = read("src/server/platform-admin/shop-action-validation.ts");
  const serverActions = read("src/app/platform/operations/actions.ts");
  const securityChecks = read("scripts/security-checks.mjs");
  const danger = read("src/app/platform/shops/[shopId]/ShopDangerZoneActions.tsx");
  const sectionData = read("src/server/platform-admin/platform-section-data.ts");

  assertContains(migration, "platform_force_purge_test_shop");
  assertContains(migration, "platform.shop.purge.snapshot");
  assertContains(migration, "membership_revocation_mode");
  assertContains(migration, "audit_retention_mode");
  assertContains(migration, "audit_rows_to_snapshot");
  assertContains(migration, "app.platform_allow_test_audit_delete");
  assertContains(migration, "delete from public.audit_logs");
  assertContains(migration, "Purge is limited to synthetic test/local/staging shop codes.");
  assertContains(migration, "'DELETE ' || target_shop.shop_code");
  assertContains(migration, "'global'");
  assertContains(migration, "platform.shop.purge.success");
  assertContains(databaseTypes, "platform_force_purge_test_shop");
  assertContains(shopActions, `.rpc("platform_force_purge_test_shop"`);
  assertContains(validation, `input.mode === "force_test"`);
  assertContains(serverActions, "force_purge");
  assertContains(securityChecks, "platform_force_purge_test_shop");

  for (const required of [
    "Safe force purge test shop",
    "purgeMode",
    "force_test",
    "Force-managed for test shop purge",
    "Shop ID",
    "Shop code",
  ]) {
    assertContains(danger, required);
  }

  for (const required of [
    "loadPlatformShopPurgePreview",
    "platform_preview_shop_purge",
    "Membership records",
    "Products / catalog rows",
    "Price history",
    "Mobile mappings",
    "POS links",
    "Audit rows to snapshot",
    "managedByForcePurge",
  ]) {
    assertContains(sectionData, required);
  }
});

test("TASK-067 shop detail exposes lifecycle, ownership, and danger zone as separate professional panels", () => {
  const detailPage = read("src/app/platform/shops/[shopId]/page.tsx");
  const sectionData = read("src/server/platform-admin/platform-section-data.ts");
  const lifecycle = read("src/app/platform/shops/[shopId]/ShopLifecycleActions.tsx");
  const ownership = read("src/app/platform/shops/[shopId]/ShopAdminAccessActions.tsx");
  const danger = read("src/app/platform/shops/[shopId]/ShopDangerZoneActions.tsx");

  for (const required of [
    "ShopLifecycleActions",
    "ShopAdminAccessActions",
    "ShopDangerZoneActions",
    "getPlatformShopAccessForRequest",
    "profileQuery",
  ]) {
    assertContains(detailPage, required);
  }

  for (const required of [
    'title: "Shop lifecycle management"',
    'title: "Admin access / Ownership"',
    'title: "Danger Zone"',
    "Owners",
    "Managers",
    "Purge test shop",
    "Permanent delete production shop",
    "Products / catalog rows",
    "Server-side purge RPC recheck",
    "Normal when dependency-free; force mode",
  ]) {
    assertContains(sectionData, required);
  }

  for (const required of [
    "targetStatuses",
    '"active"',
    '"pending_setup"',
    '"suspended"',
    '"archived"',
    "activate",
    "This will activate a pending shop",
    "Change status to",
    "Reason",
    "Confirm shop code",
    "<select",
  ]) {
    assertContains(lifecycle, required);
  }

  for (const required of [
    "Search existing profile",
    "Email, display name, or profile ID",
    "assignPlatformShopMemberAction",
    "revokePlatformShopMemberAction",
    "Assign as",
    "shop_owner",
    "shop_manager",
    "Last active owner cannot be revoked",
    "<table",
  ]) {
    assertContains(ownership, required);
  }

  for (const required of [
    "Archive shop",
    "softDeletePlatformShopAction",
    "Safe force purge test shop",
    "Normal purge test shop",
    "purgePlatformShopAction",
    "DELETE ${shop.shop_code}",
    "purgeReady",
    "Dependency preview",
  ]) {
    assertContains(danger, required);
  }

  assert.doesNotMatch(`${lifecycle}\n${ownership}\n${danger}`, /RLS detail lookup|Record archiviato/i);
  assert.doesNotMatch(danger, /Purge unavailable|no audited purge RPC|delete\s+from/i);
});
