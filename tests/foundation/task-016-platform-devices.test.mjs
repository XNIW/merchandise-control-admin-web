import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-016 global devices overview uses device authorization registry and sync activity separately", () => {
  const pagePath = "src/app/platform/devices/page.tsx";
  const readModelPath = "src/server/platform-admin/read-model.ts";
  const sectionDataPath = "src/server/platform-admin/platform-section-data.ts";
  const migrationPath = "supabase/migrations/20260531190000_task_016_platform_admin_console.sql";

  for (const relativePath of [pagePath, readModelPath, sectionDataPath, migrationPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const page = readProjectFile(pagePath);
  const readModel = readProjectFile(readModelPath);
  const sectionData = readProjectFile(sectionDataPath);
  const migration = readProjectFile(migrationPath);

  assert.match(page, /getPlatformSectionForRequest\("devices"/);
  assert.match(readModel, /\.from\("shop_devices"\)/);
  assert.match(readModel, /\.from\("sync_events"\)/);
  assert.match(sectionData, /source_device_id/);
  assert.match(sectionData, /device authorization/i);
  assert.match(migration, /shop_devices_select_platform_admin/);
  assert.match(migration, /sync_events_select_platform_admin/);
  assert.match(migration, /platform_emergency_revoke_device/);
  assert.match(migration, /app_private\.is_platform_admin\(\)/);
  assert.doesNotMatch(sectionData, /source_device_id[\s\S]{0,120}revoke/i);
  assert.doesNotMatch(`${page}\n${readModel}\n${sectionData}`, /device_secret|device_token|credential_hash/i);
});

test("TASK-016 emergency device revoke is server-side, reasoned, and audited", () => {
  const actionTypesPath = "src/server/platform-admin/action-types.ts";
  const shopActionsPath = "src/server/platform-admin/shop-actions.ts";
  const serverActionsPath = "src/app/platform/operations/actions.ts";
  const migrationPath = "supabase/migrations/20260531190000_task_016_platform_admin_console.sql";

  for (const relativePath of [actionTypesPath, shopActionsPath, serverActionsPath, migrationPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const actionTypes = readProjectFile(actionTypesPath);
  const shopActions = readProjectFile(shopActionsPath);
  const serverActions = readProjectFile(serverActionsPath);
  const migration = readProjectFile(migrationPath);

  assert.match(actionTypes, /EmergencyRevokeDeviceInput/);
  assert.match(shopActions, /emergencyRevokePlatformDevice/);
  assert.match(shopActions, /\.rpc\("platform_emergency_revoke_device"/);
  assert.match(serverActions, /emergencyRevokePlatformDeviceAction/);
  assert.match(migration, /platform\.device\.emergency_revoke\.success/);
  assert.match(migration, /p_reason/);
  assert.doesNotMatch(shopActions, /\.(insert|update|delete|upsert)\s*\(/);
});
