import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260802220000_storefront_v1_public_availability.sql",
);
const pgTap = read("supabase/tests/storefront_v1_public_availability.sql");
const concurrency = read(
  "scripts/testing/storefront-v1-availability-concurrency.sh",
);
const loadSql = read("scripts/testing/storefront-v1-contract-load.sql");
const page = read("src/app/shop/storefront/page.tsx");
const actions = read("src/app/shop/storefront/actions.ts");
const mutations = read("src/server/shop-admin/storefront-mutations.ts");
const stagingWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const taskWorkflow = read(
  ".github/workflows/task-024-public-availability-staging.yml",
);

test("TASK-024 stores only an abstract private stock signal", () => {
  assert.match(
    migration,
    /create table app_private\.storefront_product_availability_signals/,
  );
  assert.match(
    migration,
    /signal_state in \('available', 'low_stock', 'unavailable'\)/,
  );
  const signalTable =
    migration.match(
      /create table app_private\.storefront_product_availability_signals \([\s\S]*?\n\);/,
    )?.[0] ?? "";
  assert.notEqual(signalTable, "");
  assert.doesNotMatch(
    signalTable,
    /stock_quantity|purchase_price|supplier_id|owner_user_id/,
  );
});

test("TASK-024 derives all six public states with fail-closed precedence", () => {
  for (const state of [
    "available",
    "low_stock",
    "unavailable",
    "reservation_only",
    "pickup_only",
    "delivery_only",
  ]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /p_expires_at <= p_at[\s\S]*then 'unavailable'/);
  assert.match(
    migration,
    /p_source_observed_at > p_at \+ interval '5 minutes'/,
  );
  assert.match(migration, /p_stock_quantity is null[\s\S]*then 'unavailable'/);
});

test("TASK-024 ingest is service-only, monotonic and idempotent", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(
    migration,
    /from public\.inventory_products product[\s\S]*for update;[\s\S]*if not found then/,
  );
  assert.match(
    migration,
    /where excluded\.source_observed_at >= signal\.source_observed_at/,
  );
  assert.match(migration, /v_effective_version < v_existing\.source_version/);
  assert.match(migration, /'status', 'stale_ignored'/);
  assert.match(migration, /'status', 'duplicate'/);
  assert.match(migration, /'status', 'version_conflict'/);
  assert.match(migration, /'status', 'idempotency_conflict'/);
  assert.match(
    migration,
    /grant execute on function public\.storefront_availability_ingest_v1[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /revoke all on table app_private\.storefront_product_availability_signals[\s\S]*authenticated, service_role/,
  );
});

test("TASK-024 applies the same availability resolver to catalog, detail and cart", () => {
  const resolverCalls = migration.match(
    /app_private\.storefront_effective_availability_v1\(/g,
  );
  assert.ok((resolverCalls?.length ?? 0) >= 8);
  assert.match(
    migration,
    /create or replace function app_private\.storefront_catalog_source_v1/,
  );
  assert.match(
    migration,
    /create or replace function app_private\.storefront_public_catalog_rows_scoped_v1/,
  );
  assert.match(migration, /'availability', row\.current_availability_mode/);
});

test("TASK-024 batches inventory and publication projection maintenance", () => {
  assert.match(
    migration,
    /referencing old table as storefront_availability_inventory_old_rows[\s\S]*new table as storefront_availability_inventory_new_rows[\s\S]*for each statement execute function[\s\S]*storefront_inventory_availability_sync_v1/,
  );
  assert.match(
    migration,
    /referencing new table as storefront_availability_publication_inserted_rows[\s\S]*for each statement execute function[\s\S]*storefront_publication_availability_seed_v1/,
  );
  assert.doesNotMatch(
    migration,
    /storefront_inventory_availability_update[\s\S]{0,240}for each row/,
  );
  assert.doesNotMatch(
    migration,
    /storefront_publication_availability_seed[\s\S]{0,240}for each row/,
  );
  assert.match(loadSql, /'availabilitySignals'/);
  assert.match(loadSql, /'availabilityStateCounts'/);
});

test("TASK-024 Admin presents availability as derived read-only status", () => {
  assert.match(page, /Derivata server-side dallo stato operativo/);
  assert.match(page, /La quantità resta privata/);
  assert.match(page, /value \?\? "unavailable"/);
  assert.match(page, /role="status"/);
  assert.doesNotMatch(page, /name="availabilityMode"/);
  assert.doesNotMatch(actions, /formString\(formData, "availabilityMode"\)/);
  assert.doesNotMatch(mutations, /availabilityMode: input\.availabilityMode/);
});

test("TASK-024 pgTAP covers privacy, six states, freshness and cross-shop denial", () => {
  assert.match(pgTap, /select plan\(44\)/);
  for (const expected of [
    "all six and only six commercial availability states",
    "manual input cannot override the server-derived stock state",
    "a missing signal fails closed in the cart source contract",
    "an identical source-version replay is idempotent",
    "a higher version with an older observation is ignored",
    "an older inventory observation cannot overwrite a newer external signal",
    "cross-shop availability ingest is denied",
    "expired availability fails closed in public detail",
    "inventory depletion immediately updates the public contract",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-024 concurrency harness is remote-guarded and proves one apply plus one duplicate", () => {
  assert.match(concurrency, /refuses an unauthorized non-local database/);
  assert.match(concurrency, /APPLY_STOREFRONT_V1_STAGING_AVAILABILITY/);
  assert.match(concurrency, /availability_pid_a=\$!/);
  assert.match(concurrency, /availability_pid_b=\$!/);
  assert.match(concurrency, /wait "\$\{availability_pid_a\}"/);
  assert.match(concurrency, /wait "\$\{availability_pid_b\}"/);
  assert.match(concurrency, /one apply, one duplicate, final version 2, PASS/);
});

test("TASK-024 staging apply is exact-SHA guarded and reruns contract tests", () => {
  for (const expected of [
    'expected_migration_version: "20260802220000"',
    "expected_migration_name: storefront_v1_public_availability",
    "expected_migration_file: 20260802220000_storefront_v1_public_availability.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260802220000'/,
  );
  assert.match(stagingWorkflow, /task-024-pgtap\.txt/);
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 44/);
  assert.match(stagingWorkflow, /serviceRoleBoundary/);
  assert.match(stagingWorkflow, /signalColumnsNoLeak/);
});
