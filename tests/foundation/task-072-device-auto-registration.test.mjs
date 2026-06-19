import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const androidRoot =
  process.env.ANDROID_MERCHANDISE_CONTROL_ROOT?.trim() ||
  "/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView";
const iosRoot =
  process.env.IOS_MERCHANDISE_CONTROL_ROOT?.trim() ||
  "/Users/minxiang/Desktop/iOSMerchandiseControl";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readExternalFile(basePath, relativePath) {
  return readFileSync(join(basePath, relativePath), "utf8");
}

function functionBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} not found`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${endMarker} not found`);
  return source.slice(start, end);
}

test("TASK-072 device auto-registration schema is additive, shop-scoped and redacted", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260619123000_task_072_device_auto_registration.sql",
  );
  const statusMigration = readProjectFile(
    "supabase/migrations/20260619173000_task_072_device_authorization_status.sql",
  );
  const types = readProjectFile("src/lib/supabase/database.types.ts");

  assert.match(migration, /alter table public\.shop_devices/);
  assert.match(migration, /add column if not exists last_seen_profile_id/);
  assert.match(migration, /add column if not exists last_seen_staff_id/);
  assert.match(migration, /add column if not exists last_seen_principal_kind/);
  assert.match(migration, /shop_devices_last_seen_principal_kind_check/);
  assert.match(migration, /jsonb_has_sensitive_device_metadata_key/);
  assert.match(migration, /jsonb_each/);
  assert.match(migration, /jsonb_array_elements/);
  assert.match(migration, /token\|secret\|password\|pin\|hash\|credential/);

  assert.match(
    migration,
    /create or replace function public\.shop_device_register\(/,
  );
  assert.match(
    migration,
    /when public\.shop_devices\.status in \('revoked', 'suspicious'\) then public\.shop_devices\.status/,
  );
  assert.match(migration, /last_seen_profile_id = actor_id/);
  assert.match(migration, /last_seen_principal_kind = 'personal_account'/);

  assert.match(
    migration,
    /create or replace function public\.shop_device_register_current_owner\(\s*p_device_identifier text/,
  );
  assert.match(migration, /sis\.owner_user_id = actor_id/);
  assert.match(migration, /sis\.mapping_state = 'mapped'/);
  assert.match(migration, /sis\.disabled_at is null/);
  assert.match(migration, /s\.shop_status = 'active'/);
  assert.match(
    migration,
    /grant execute on function public\.shop_device_register_current_owner/,
  );
  assert.doesNotMatch(
    migration.match(
      /create or replace function public\.shop_device_register_current_owner[\s\S]*?returns jsonb/,
    )?.[0] ?? "",
    /p_shop_id/,
  );

  assert.match(types, /last_seen_profile_id/);
  assert.match(types, /last_seen_staff_id/);
  assert.match(types, /last_seen_principal_kind/);
  assert.match(types, /shop_device_register_current_owner/);
  assert.match(types, /shop_device_status_current_owner/);

  assert.match(
    statusMigration,
    /create or replace function public\.shop_device_status_current_owner\(\s*p_device_identifier text/,
  );
  assert.match(statusMigration, /sis\.owner_user_id = actor_id/);
  assert.match(statusMigration, /sis\.mapping_state = 'mapped'/);
  assert.match(statusMigration, /s\.shop_status = 'active'/);
  assert.match(statusMigration, /'can_write', v_device_status = 'active'/);
  assert.match(statusMigration, /'status', 'not_found'/);
  assert.match(statusMigration, /'status', 'unmapped'/);
  assert.match(statusMigration, /'recommended_action'/);
  assert.doesNotMatch(statusMigration, /p_shop_id/);
  assert.doesNotMatch(statusMigration, /write_shop_admin_audit/);
  assert.doesNotMatch(statusMigration, /update public\.shop_devices/);
  assert.match(
    statusMigration,
    /grant execute on function public\.shop_device_status_current_owner/,
  );
});

test("TASK-072 devices read model shows registered devices and sync-only hints separately", () => {
  const readModel = readProjectFile(
    "src/server/shop-admin/device-read-model.ts",
  );
  const sectionData = readProjectFile(
    "src/server/shop-admin/shop-section-data.ts",
  );
  const page = readProjectFile("src/app/shop/devices/page.tsx");
  const view = readProjectFile(
    "src/app/shop/_components/DeviceRegistryView.tsx",
  );
  const panel = readProjectFile(
    "src/app/shop/_components/DeviceActionPanel.tsx",
  );

  assert.match(readModel, /detectedSyncClients/);
  assert.match(readModel, /registeredIdentifiers/);
  assert.match(readModel, /authorizationStatus: "activity_hint_only"/);
  assert.match(readModel, /\.from\("profiles"\)/);
  assert.match(readModel, /\.from\("staff_accounts_safe"\)/);
  assert.match(readModel, /lastSeenAccount/);
  assert.match(readModel, /lastSeenStaff/);
  assert.match(readModel, /lastSeenPrincipalKind/);
  assert.match(readModel, /!mappingResult\.error/);
  assert.match(readModel, /if \(!activityResult\.error\)/);
  assert.doesNotMatch(readModel, /Device sync mapping could not be loaded/);
  assert.doesNotMatch(
    readModel,
    /Mapped device activity could not be loaded through RLS/,
  );

  assert.match(sectionData, /Account personale usato/);
  assert.match(sectionData, /Staff POS usato/);
  assert.match(sectionData, /Last access\/sync/);
  assert.match(sectionData, /Sync activity hints/);
  assert.match(sectionData, /Activity hint only/);
  assert.match(
    sectionData,
    /not authorized devices and cannot be revoked here/,
  );
  assert.match(sectionData, /No registered devices yet/);
  assert.match(
    sectionData,
    /Devices will appear after login or sync from updated clients/,
  );
  assert.match(
    sectionData,
    /Android\/iOS\/POS clients appear here after authentication or sync/,
  );

  assert.match(page, /getShopDeviceReadModel/);
  assert.match(page, /DeviceRegistryView/);
  assert.match(page, /shop_id/);
  assert.match(view, /Sync activity hints/);
  assert.match(view, /Activity hint only/);
  assert.match(view, /shop_device_register/);
  assert.match(
    view,
    /\/shop\/devices\/\$\{encodeURIComponent\(row\.deviceId\)\}/,
  );
  assert.match(view, /Account personale usato/);
  assert.match(view, /Staff POS usato/);
  assert.match(panel, /manualFallback/);
  assert.match(panel, /Advanced manual actions/);
});

test("TASK-072 revoked devices are not reactivated by register or heartbeat paths", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260619123000_task_072_device_auto_registration.sql",
  );
  const staffAware = readProjectFile(
    "src/server/shop-admin/staff-aware-mutations.ts",
  );
  const posAuth = readProjectFile("src/server/pos-auth/service.ts");
  const catalogPull = readProjectFile("src/server/pos-auth/catalog-pull.ts");
  const salesSync = readProjectFile("src/server/pos-auth/sales-sync.ts");

  assert.match(
    migration,
    /when public\.shop_devices\.status in \('revoked', 'suspicious'\) then public\.shop_devices\.status/,
  );

  const staffRegister = functionBody(
    staffAware,
    "export async function registerDeviceAsStaff",
    "export async function renameDeviceAsStaff",
  );
  assert.doesNotMatch(staffRegister, /\.upsert\(/);
  assert.match(staffRegister, /existing\.data\?\.status === "revoked"/);
  assert.match(staffRegister, /existing\.data\?\.status === "suspicious"/);
  assert.match(staffRegister, /last_seen_staff_id: context\.actorStaffId/);

  assert.match(posAuth, /existingDevice\?\.status === "revoked"/);
  assert.match(posAuth, /existingDevice\?\.status === "suspicious"/);
  assert.match(posAuth, /pos\.device\.revoked_enforced/);
  assert.match(posAuth, /device\?\.status !== "active"/);
  assert.match(posAuth, /last_seen_staff_id: staff\.staff_id/);
  assert.match(posAuth, /last_seen_staff_id: session\.staff_id/);
  assert.match(catalogPull, /device\?\.status === "active"/);
  assert.match(salesSync, /device\?\.status === "active"/);
});

test("TASK-072 Android and iOS use stable install IDs with redacted metadata", () => {
  if (!existsSync(androidRoot) || !existsSync(iosRoot)) {
    return;
  }

  const androidRegistration = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/ShopDeviceRegistrationRemoteDataSource.kt",
  );
  const androidGuards = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/DeviceAuthorizationRemoteGuards.kt",
  );
  const androidApp = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/MerchandiseControlApplication.kt",
  );
  const androidCatalogCoordinator = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/CatalogAutoSyncCoordinator.kt",
  );
  const androidHistoryCoordinator = readExternalFile(
    androidRoot,
    "app/src/main/java/com/example/merchandisecontrolsplitview/data/HistorySessionPushCoordinator.kt",
  );
  const iosRegistration = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/ShopDeviceRegistrationService.swift",
  );
  const iosRuntime = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Automatic/Core/AutomaticSyncRuntimeFacade.swift",
  );
  const iosFactory = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Manual/SupabaseManualSyncReleaseFactory.swift",
  );
  const iosOrchestrator = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/SyncOrchestrator.swift",
  );
  const iosAuthViewModel = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/SupabaseAuthViewModel.swift",
  );
  const iosContentView = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/ContentView.swift",
  );
  const iosAutomaticWriter = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Automatic/Outbox/AutomaticSyncEventOutboxWriter.swift",
  );
  const iosHistoryFactory = readExternalFile(
    iosRoot,
    "iOSMerchandiseControl/Sync/Manual/SupabaseManualSyncReleaseFactory.swift",
  );

  assert.match(androidRegistration, /class DeviceInstallIdProvider/);
  assert.match(androidRegistration, /SyncEventDeviceStateDao/);
  assert.match(androidRegistration, /shop_device_register_current_owner/);
  assert.match(androidRegistration, /shop_device_status_current_owner/);
  assert.match(androidRegistration, /ShopDeviceAuthorizationRepository/);
  assert.match(androidRegistration, /network_error/);
  assert.match(androidRegistration, /ensureActiveForCloudWrite/);
  assert.match(androidRegistration, /BuildConfig\.VERSION_NAME/);
  assert.match(androidRegistration, /platform.*android/s);
  assert.match(androidRegistration, /simulator/);
  assert.doesNotMatch(
    androidRegistration,
    /getImei|Build\.SERIAL|ANDROID_ID|MAC_ADDRESS|access_token|refresh_token|password|credential_hash/i,
  );
  assert.match(androidApp, /registerShopDeviceBestEffort\(state, "auth"\)/);
  assert.match(
    androidApp,
    /registerShopDeviceBestEffort\(authManager\.state\.value, "foreground"\)/,
  );
  assert.match(
    androidApp,
    /registerShopDeviceBestEffort\(authManager\.state\.value, "network"\)/,
  );
  assert.match(androidApp, /startShopDeviceStatusPolling/);
  assert.match(androidApp, /DeviceGuardedCatalogRemoteDataSource/);
  assert.match(androidApp, /DeviceGuardedSessionBackupRemoteDataSource/);
  assert.match(androidGuards, /guardedCloudWrite/);
  assert.match(androidGuards, /recordSyncEvent/);
  assert.match(androidGuards, /upsertSessions/);
  assert.match(androidCatalogCoordinator, /blocked_by_device_status/);
  assert.match(androidHistoryCoordinator, /blocked_by_device_status/);

  assert.match(iosRegistration, /final class DeviceInstallIDStore/);
  assert.match(iosRegistration, /UUID\(\)\.uuidString\.lowercased\(\)/);
  assert.match(iosRegistration, /shop_device_register_current_owner/);
  assert.match(iosRegistration, /shop_device_status_current_owner/);
  assert.match(iosRegistration, /ensureActiveForCloudWrite/);
  assert.match(iosRegistration, /network_error/);
  assert.match(iosRegistration, /platform: "ios"/);
  assert.match(iosRegistration, /targetEnvironment\(simulator\)/);
  assert.doesNotMatch(
    iosRegistration,
    /identifierForVendor|serialNumber|macAddress|accessToken|refreshToken|password|credentialHash/i,
  );
  assert.match(iosAuthViewModel, /registerShopDeviceIfReady/);
  assert.match(
    iosContentView,
    /registerHeartbeatAndCheck\(reason: "app_sync_bootstrap"\)/,
  );
  assert.match(
    iosContentView,
    /currentOwnerDeviceStatus\(\s*reason: "automatic_sync",\s*force: true/s,
  );
  assert.match(iosRuntime, /ensureActiveForCloudWrite/);
  assert.match(iosRuntime, /\.blocked\(\.deviceNotActive\)/);
  assert.match(iosFactory, /DeviceGuardedManualCatalogPushProvider/);
  assert.match(iosFactory, /DeviceGuardedManualHistorySessionProvider/);
  assert.match(iosOrchestrator, /deviceBlocked/);
  assert.match(
    iosAutomaticWriter,
    /sourceDeviceID: DeviceInstallIDStore\(\)\.deviceInstallID/,
  );
  assert.match(
    iosHistoryFactory,
    /sourceDeviceID: DeviceInstallIDStore\(\)\.deviceInstallID/,
  );
});
