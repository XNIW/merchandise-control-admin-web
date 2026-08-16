import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FakeForegroundGeolocationAdapter,
  ForegroundTrackingLifecycle,
  shouldPublishForegroundLocation,
} from "../../src/app/shop/courier/foreground-geolocation.ts";
import {
  isCourierLocationInput,
  validatedExternalTrackingUrl,
} from "../../src/server/shop-admin/delivery-tracking-validation.ts";

const migrationPath = new URL(
  "../../supabase/migrations/20260816072836_storefront_delivery_tracking_v1.sql",
  import.meta.url,
);
const courierClientPath = new URL(
  "../../src/app/shop/courier/CourierModeClient.tsx",
  import.meta.url,
);
const permissionPath = new URL(
  "../../src/server/shop-admin/permissions.ts",
  import.meta.url,
);
const shopShellPath = new URL(
  "../../src/components/shop/ShopShell.tsx",
  import.meta.url,
);

test("foreground adapter starts only on demand and disposes deterministically", () => {
  const adapter = new FakeForegroundGeolocationAdapter();
  const samples = [];
  assert.equal(adapter.activeWatchCount, 0);
  const watchId = adapter.start({
    onError: () => assert.fail("unexpected fake error"),
    onLocation: (sample) => samples.push(sample),
  });
  adapter.emit({
    horizontalAccuracyMeters: 12,
    latitude: -33.45,
    longitude: -70.66,
    observedAt: "2026-08-16T12:00:00.000Z",
  });
  assert.equal(samples.length, 1);
  assert.equal(adapter.activeWatchCount, 1);
  adapter.stop(watchId);
  assert.equal(adapter.activeWatchCount, 0);
});

test("client coalescing accepts elapsed time or meaningful distance", () => {
  const previous = {
    horizontalAccuracyMeters: 10,
    latitude: -33.45,
    longitude: -70.66,
    observedAt: "2026-08-16T12:00:00.000Z",
  };
  assert.equal(
    shouldPublishForegroundLocation(
      previous,
      { ...previous, observedAt: "2026-08-16T12:00:05.000Z" },
      { minDistanceMeters: 25, minIntervalMilliseconds: 10_000 },
    ),
    false,
  );
  assert.equal(
    shouldPublishForegroundLocation(
      previous,
      { ...previous, observedAt: "2026-08-16T12:00:10.000Z" },
      { minDistanceMeters: 25, minIntervalMilliseconds: 10_000 },
    ),
    true,
  );
  assert.equal(
    shouldPublishForegroundLocation(
      previous,
      {
        ...previous,
        latitude: -33.449,
        observedAt: "2026-08-16T12:00:05.000Z",
      },
      { minDistanceMeters: 25, minIntervalMilliseconds: 10_000 },
    ),
    true,
  );
});

test("foreground lifecycle rejects a delayed Start after unmount", () => {
  const lifecycle = new ForegroundTrackingLifecycle();
  lifecycle.activate();
  const delayedStart = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(delayedStart), true);
  lifecycle.dispose();
  assert.equal(lifecycle.isCurrent(delayedStart), false);

  lifecycle.activate();
  const resumedStart = lifecycle.begin();
  assert.equal(lifecycle.isCurrent(resumedStart), true);
  assert.equal(lifecycle.isCurrent(delayedStart), false);
});

test("external carrier URL validation blocks injection and private targets", () => {
  assert.equal(
    validatedExternalTrackingUrl("https://carrier.example/track/123"),
    "https://carrier.example/track/123",
  );
  for (const value of [
    "javascript:alert(1)",
    "http://carrier.example/track",
    "https://user:secret@carrier.example/track",
    "https://127.0.0.1/track",
    "https://2130706433/track",
    "https://0x7f000001/track",
    "https://0177.0.0.1/track",
    "https://10.0.0.1/track",
    "https://carrier.local/track",
    "https://carrier.example/track#token",
  ]) {
    assert.equal(validatedExternalTrackingUrl(value), null, value);
  }
});

test("location validation rejects non-finite, stale and future samples", () => {
  const observedAt = new Date().toISOString();
  assert.equal(
    isCourierLocationInput({
      horizontalAccuracyMeters: 10,
      latitude: -33.45,
      longitude: -70.66,
      observedAt,
    }),
    true,
  );
  assert.equal(
    isCourierLocationInput({
      horizontalAccuracyMeters: 10,
      latitude: Number.NaN,
      longitude: -70.66,
      observedAt,
    }),
    false,
  );
  assert.equal(
    isCourierLocationInput({
      horizontalAccuracyMeters: -1,
      latitude: -33.45,
      longitude: -70.66,
      observedAt,
    }),
    false,
  );
  assert.equal(
    isCourierLocationInput({
      horizontalAccuracyMeters: 10,
      latitude: -33.45,
      longitude: -70.66,
      observedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    }),
    false,
  );
});

test("migration keeps precise location latest-only and removes it at terminal states", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /create table public\.delivery_courier_latest_locations/);
  assert.doesNotMatch(migration, /create table public\.delivery_courier_location_history/);
  assert.match(
    migration,
    /new\.status in \('completed', 'cancelled', 'rejected'\)[\s\S]*delete from public\.delivery_courier_latest_locations location/,
  );
  assert.match(migration, /delivery_tracking_mutations_guard_immutable/);
  assert.match(migration, /storefront-delivery-tracking-cleanup-v1/);
  assert.match(migration, /alter publication supabase_realtime/);
  assert.match(migration, /freshness = 'unavailable'/);
  assert.match(migration, /v_elapsed_seconds < greatest\(1, v_min_interval\)/);
});

test("courier role has only the delivery tracking publish capability", async () => {
  const permissions = await readFile(permissionPath, "utf8");
  assert.match(permissions, /courier: \["orders\.delivery\.track"\]/);
  assert.doesNotMatch(
    permissions,
    /courier: \[[^\]]*(?:shop_admin|catalog|orders\.manage)/,
  );
});

test("Courier Mode discloses foreground limits and does not log coordinates", async () => {
  const source = await readFile(courierClientPath, "utf8");
  assert.match(source, /capability foreground/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /stopLocalWatch/);
  assert.match(source, /lifecycleRef\.current\.isCurrent\(generation\)/);
  assert.match(source, /lifecycle\.dispose\(\)/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(source, /latitude.*role="status"/);
});

test("courier-only shell suppresses direct routes and unauthorized sync polling", async () => {
  const source = await readFile(shopShellPath, "utf8");
  assert.match(source, /courierOnly && !courierRouteAllowed/);
  assert.match(source, /router\.replace\(`\/shop\/courier/);
  assert.match(source, /if \(!activeShopId \|\| courierOnly\)/);
  assert.match(source, /principalRoleLabel \?\?/);
});
