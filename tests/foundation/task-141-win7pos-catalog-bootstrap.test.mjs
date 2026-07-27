import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-141 migration keeps the catalog preflight bounded and fail-closed", () => {
  const migration = read(
    "supabase/migrations/20260727002052_task_141_win7pos_catalog_bootstrap_integrity_preflight.sql",
  );

  assert.match(
    migration,
    /create or replace function app_private\.pos_catalog_integrity_violation_count_v2/,
  );
  assert.match(migration, /stable\s+security definer/);
  assert.match(
    migration,
    /set search_path = public, app_private, pg_temp/,
  );
  assert.match(migration, /exception when others then\s+return 1/);
  assert.match(migration, /limit 125001/);
  assert.match(migration, /limit 175001/);
  assert.match(migration, /6::bigint \*/);
  assert.match(migration, /sync_product_recovery_row_fits_v1/);
  assert.match(migration, /sync_price_recovery_row_fits_v1/);
  assert.match(migration, /v_total_bytes > 536870912/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /alter role[\s\S]*statement_timeout/i);
});

test("TASK-141 retains historical deleted-product prices but still verifies scope ownership", () => {
  const migration = read(
    "supabase/migrations/20260727002052_task_141_win7pos_catalog_bootstrap_integrity_preflight.sql",
  );
  const historicalPriceCheck = migration.slice(
    migration.indexOf("-- Historical prices for a product soft-deleted"),
  );

  assert.match(historicalPriceCheck, /product\.id=price\.product_id/);
  assert.match(historicalPriceCheck, /product\.shop_id=p_shop_id/);
  assert.match(
    historicalPriceCheck,
    /product\.owner_user_id=p_scope_id/,
  );
  assert.doesNotMatch(
    historicalPriceCheck,
    /product\.deleted_at is null/,
  );
});

test("TASK-141 server diagnostics are bounded to reason, stage and lane", () => {
  const boundary = read("src/server/pos-auth/catalog-revision.ts");
  const endpoint = read("src/server/pos-auth/catalog-pull.ts");

  assert.match(boundary, /catalog_rpc_statement_timeout/);
  assert.match(boundary, /code === "57014"/);
  assert.match(boundary, /catalog_rpc_response_invalid/);
  assert.match(endpoint, /source: "TASK-(141|143)"/);
  assert.match(endpoint, /manifest_requested: !continuation/);
  assert.match(endpoint, /stage: page\.stage/);
  assert.match(endpoint, /row_count: page\.rows\.length/);
  assert.doesNotMatch(endpoint, /error\.message/);
  assert.doesNotMatch(endpoint, /error\.details/);
});
