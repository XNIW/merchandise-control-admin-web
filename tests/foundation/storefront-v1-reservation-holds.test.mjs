import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const engineMigration = read(
  "supabase/migrations/20260803000951_storefront_v1_reservation_holds.sql",
);
const eligibilityMigration = read(
  "supabase/migrations/20260803003855_storefront_v1_reservation_hold_eligibility.sql",
);
const migration = `${engineMigration}\n${eligibilityMigration}`;
const pgTap = read("supabase/tests/storefront_v1_reservation_holds.sql");
const concurrency = read(
  "scripts/testing/storefront-v1-reservation-hold-concurrency.sh",
);
const loadHarness = read(
  "scripts/testing/storefront-v1-reservation-hold-load.sh",
);
const loadSql = read(
  "scripts/testing/storefront-v1-reservation-hold-load.sql",
);
const stagingWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const taskWorkflow = read(
  ".github/workflows/task-025-reservation-hold-staging.yml",
);

test("TASK-025 keeps active reservation holds private and owner-scoped", () => {
  for (const table of [
    "customer_reservation_holds",
    "customer_reservation_hold_mutations",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`),
    );
  }
  assert.match(migration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.match(
    migration,
    /revoke all on table public\.customer_reservation_holds[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete\s+on table public\.customer_reservation_holds to service_role/,
  );
});

test("TASK-025 derives shop, product, expiry and capacity on the server", () => {
  const createSignature =
    migration.match(
      /create or replace function public\.customer_reservation_hold_create_v1\([\s\S]*?\n\)\nreturns jsonb/,
    )?.[0] ?? "";
  assert.notEqual(createSignature, "");
  assert.doesNotMatch(
    createSignature,
    /p_(shop_id|source_product_id|expires_at|price|stock|total)/i,
  );
  assert.match(migration, /v_now \+ interval '15 minutes'/);
  assert.match(migration, /for update of product/);
  assert.match(eligibilityMigration, /and setting\.reservation_enabled/);
  assert.match(eligibilityMigration, /and publication\.reservation_enabled/);
  assert.match(
    migration,
    /storefront_reservation_active_quantity_v1\([\s\S]*v_product\.stock_quantity - v_reserved/,
  );
});

test("TASK-025 serializes the last piece and prevents inventory undercut", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(
    migration,
    /create or replace function app_private\.storefront_reservation_inventory_floor_guard_v1/,
  );
  assert.match(
    migration,
    /active storefront reservation prevents stock reduction/,
  );
  assert.match(
    migration,
    /create trigger storefront_reservation_inventory_floor_guard[\s\S]*before update of stock_quantity, deleted_at/,
  );
  assert.match(migration, /status in \('active', 'released', 'expired', 'consumed'\)/);
});

test("TASK-025 stores bounded idempotent mutations and schedules expiry", () => {
  assert.match(migration, /customer_reservation_holds_create_key_unique/);
  assert.match(migration, /customer_reservation_hold_mutations_key_unique/);
  assert.match(migration, /'status', 'idempotency_conflict'/);
  assert.match(migration, /v_active_count >= 25/);
  assert.match(
    migration,
    /storefront_reservation_holds_expire_v1\(\s+p_batch_size integer/,
  );
  assert.match(migration, /'storefront-reservation-hold-expire-v1'/);
  assert.match(migration, /'\* \* \* \* \*'/);
});

test("TASK-025 public payload omits operational inventory and identity fields", () => {
  assert.match(migration, /'holdId', hold\.id/);
  assert.match(migration, /'shopSlug', setting\.public_slug/);
  assert.match(migration, /'publicationId', hold\.publication_id/);
  assert.match(migration, /'quantity', hold\.quantity/);
  const payloadHelper =
    migration.match(
      /create or replace function app_private\.customer_reservation_hold_payload_v1\([\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.notEqual(payloadHelper, "");
  assert.doesNotMatch(
    payloadHelper,
    /source_product_id|owner_user_id|stock_quantity|retail_price|email|token/,
  );
});

test("TASK-025 pgTAP covers privacy, idempotency, expiry and terminal states", () => {
  assert.match(pgTap, /select plan\(54\)/);
  for (const expected of [
    "anonymous Auth identities cannot create holds",
    "a publication without reservation fulfillment cannot create a hold",
    "a shop without reservation fulfillment cannot create a hold",
    "first customer reserves the last piece",
    "second customer cannot reserve the last piece",
    "same create key with a different payload is rejected",
    "operational stock cannot be reduced below active reserved capacity",
    "bounded cleanup expires one eligible hold",
    "release cannot resurrect or rewrite an expired hold",
    "release cannot rewrite a future order-consumed terminal hold",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-025 concurrency harness runs two real sessions and proves no oversell", () => {
  assert.match(concurrency, /refuses an unauthorized non-local database/);
  assert.match(
    concurrency,
    /APPLY_STOREFRONT_V1_STAGING_RESERVATION_HOLD/,
  );
  assert.match(concurrency, /hold_pid_a=\$!/);
  assert.match(concurrency, /hold_pid_b=\$!/);
  assert.match(concurrency, /wait "\$\{hold_pid_a\}"/);
  assert.match(concurrency, /wait "\$\{hold_pid_b\}"/);
  assert.match(
    concurrency,
    /one ok, one unavailable, one active hold, on-hand stock unchanged, PASS/,
  );
});

test("TASK-025 load harness measures bounded cleanup without persistent fixtures", () => {
  assert.match(
    loadHarness,
    /refuses an unauthorized non-local database/,
  );
  assert.match(
    loadHarness,
    /APPLY_STOREFRONT_V1_STAGING_RESERVATION_HOLD_LOAD/,
  );
  assert.match(loadHarness, /load rollback incomplete/);
  assert.match(loadSql, /generate_series\(1, 1200\)/);
  assert.match(loadSql, /expiredEligible', 1000/);
  assert.match(loadSql, /futureActive', 200/);
  assert.match(loadSql, /storefront_reservation_holds_expire_v1\(\s*400/);
  assert.match(loadSql, /p50Ms/);
  assert.match(loadSql, /p95Ms/);
  assert.match(loadSql, /p99Ms/);
  assert.match(loadSql, /load_p95_ms > 5000/);
  assert.match(loadSql, /bounded cleanup load verification failed/);
  assert.match(loadSql, /rollback;/);
});

test("TASK-025 staging apply is exact-SHA guarded and reruns native contracts", () => {
  for (const expected of [
    'expected_migration_version: "20260803003855"',
    "expected_migration_name: storefront_v1_reservation_hold_eligibility",
    "expected_migration_file: 20260803003855_storefront_v1_reservation_hold_eligibility.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260803003855'/,
  );
  assert.match(stagingWorkflow, /task-025-pgtap\.txt/);
  assert.match(stagingWorkflow, /task-025-load\.json/);
  assert.match(stagingWorkflow, /cleanupLoad/);
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 54/);
  assert.match(stagingWorkflow, /serverDerivedArguments/);
  assert.match(stagingWorkflow, /inventoryFloorTrigger/);
});
