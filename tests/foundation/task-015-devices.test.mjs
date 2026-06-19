import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask015Migrations() {
  return readdirSync(join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql") && file.includes("task_015"))
    .map((file) => readProjectFile(`supabase/migrations/${file}`))
    .join("\n");
}

test("TASK-015 devices use a shop-scoped authorization registry with audited mutations", () => {
  const readModelPath = "src/server/shop-admin/device-read-model.ts";
  const mutationPath = "src/server/shop-admin/device-mutations.ts";
  const actionsPath = "src/app/shop/actions.ts";

  assert.equal(
    existsSync(join(root, readModelPath)),
    true,
    `${readModelPath} is missing`,
  );
  assert.equal(
    existsSync(join(root, mutationPath)),
    true,
    `${mutationPath} is missing`,
  );
  assert.equal(
    existsSync(join(root, actionsPath)),
    true,
    `${actionsPath} is missing`,
  );

  const migration = readTask015Migrations();
  const readModel = readProjectFile(readModelPath);
  const mutations = readProjectFile(mutationPath);
  const actions = readProjectFile(actionsPath);

  assert.match(migration, /create table if not exists public\.shop_devices/);
  assert.match(
    migration,
    /alter table public\.shop_devices enable row level security/,
  );
  assert.match(
    migration,
    /status in \('pending', 'active', 'revoked', 'suspicious'\)/,
  );
  assert.match(migration, /metadata_redacted/);

  for (const rpcName of [
    "shop_device_register",
    "shop_device_rename",
    "shop_device_revoke",
    "shop_device_reactivate",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${rpcName}`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${rpcName}`),
    );
    assert.match(mutations, new RegExp(`\\.rpc\\("${rpcName}"`));
  }

  assert.match(readModel, /import "server-only"/);
  assert.match(readModel, /\.from\("shop_devices"\)/);
  assert.match(readModel, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(readModel, /\.from\("sync_events"\)/);
  assert.match(readModel, /source_device_id/);
  assert.match(readModel, /lastSeenAt/);
  assert.match(readModel, /revokedAt/);
  assert.match(mutations, /devices\.manage/);
  assert.match(actions, /registerDeviceAction/);
  assert.match(actions, /renameDeviceAction/);
  assert.match(actions, /revokeDeviceAction/);
  assert.match(actions, /reactivateDeviceAction/);
  assert.doesNotMatch(readModel, /activity_only|revocationBlockedReason/);
  assert.doesNotMatch(
    `${readModel}\n${mutations}`,
    /device_secret|device_token|credential_hash/i,
  );
});

test("TASK-015 devices page exposes guarded register, rename, revoke and reactivate controls", () => {
  const page = readProjectFile("src/app/shop/devices/page.tsx");
  const sectionData = readProjectFile(
    "src/server/shop-admin/shop-section-data.ts",
  );
  const panel = readProjectFile(
    "src/app/shop/_components/DeviceActionPanel.tsx",
  );

  assert.match(page, /searchParams/);
  assert.match(page, /getShopDeviceReadModel/);
  assert.match(page, /DeviceRegistryView/);
  assert.match(page, /DeviceActionPanel/);
  assert.doesNotMatch(page, /shopSections\.devices/);
  assert.match(sectionData, /buildDevicesSection/);
  assert.match(sectionData, /getShopDeviceReadModel/);
  assert.match(sectionData, /Revocation enforced/);
  assert.match(panel, /Register device/);
  assert.match(panel, /Rename device/);
  assert.match(panel, /Revoke device/);
  assert.match(panel, /Reactivate device/);
  assert.match(panel, /confirmation/);
  assert.match(panel, /Advanced manual actions/);
  assert.doesNotMatch(panel, /coming soon|placeholder/i);
});
