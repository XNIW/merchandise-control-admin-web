import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const catalogMigrationPath =
  "supabase/migrations/20260717235400_task_137_release_catalog_security_hardening.sql";
const posMigrationPath =
  "supabase/migrations/20260717235500_task_137_release_pos_financial_hardening.sql";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-137 release binds catalog writes to active actor, membership and shop", () => {
  const migration = readProjectFile(catalogMigrationPath);

  assert.match(
    migration,
    /create or replace function app_private\.is_active_shop_catalog_writer\(\s*target_shop_id uuid/i,
  );
  assert.match(migration, /profile\.profile_status = 'active'/i);
  assert.match(migration, /member\.membership_status = 'active'/i);
  assert.match(migration, /member\.role_key in \('shop_owner', 'shop_manager'\)/i);
  assert.match(migration, /shop\.shop_status = 'active'/i);
  assert.match(
    migration,
    /auth\.uid\(\) = target_owner_user_id[\s\S]*is_active_shop_catalog_writer\(target_shop_id\)/i,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function app_private\.is_active_shop_staff_admin_member/i,
  );
});

test("TASK-137 release replaces permissive catalog/history policies and hardens RPC scope", () => {
  const migration = readProjectFile(catalogMigrationPath);

  for (const policy of [
    "inventory_suppliers_insert_owner",
    "inventory_suppliers_update_owner",
    "inventory_categories_insert_owner",
    "inventory_categories_update_owner",
    "shared_sheet_sessions_insert_owner",
    "shared_sheet_sessions_update_owner",
    "shared_sheet_sessions_delete_owner",
    "inventory_products_insert_owner",
    "inventory_products_update_owner",
    "inventory_product_prices_insert_owner",
    "inventory_product_prices_update_owner",
  ]) {
    const escaped = policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(migration, new RegExp(`drop policy if exists ${escaped}`, "i"));
    assert.match(migration, new RegExp(`create policy ${escaped}`, "i"));
  }

  assert.match(
    migration,
    /create or replace function app_private\.resolve_shop_catalog_scope[\s\S]*is_active_shop_catalog_writer\(target_shop_id\)/i,
  );
  assert.match(
    migration,
    /create policy inventory_suppliers_update_owner[\s\S]*using \([\s\S]*is_shop_catalog_row_write_allowed[\s\S]*with check \([\s\S]*is_shop_catalog_row_write_allowed/i,
  );
});

test("TASK-137 release keeps privileged sync events tenant-bound and price history append-only", () => {
  const migration = readProjectFile(catalogMigrationPath);
  const priceGuard = migration.slice(
    migration.indexOf(
      "create or replace function app_private.guard_mobile_product_price_append_only",
    ),
  );

  assert.match(
    migration,
    /emit_mobile_row_sync_event[\s\S]*is_shop_catalog_row_write_allowed\(\s*v_owner_user_id,\s*v_shop_id\s*\)[\s\S]*errcode = '42501'/i,
  );
  assert.match(priceGuard, /if to_jsonb\(old\) = to_jsonb\(new\) then/i);
  assert.match(priceGuard, /raise exception 'price_idempotency_conflict'/i);
  assert.doesNotMatch(priceGuard, /mobile_sync_request_source\(\)/i);
});

test("TASK-137 release validates POS tender direction and independent payment authority", () => {
  const migration = readProjectFile(posMigrationPath);

  assert.match(
    migration,
    /v_business_kind = 'sale'[\s\S]*amountClp'\)::bigint < 0/i,
  );
  assert.match(
    migration,
    /v_business_kind in \('refund', 'void'\)[\s\S]*amountClp'\)::bigint > 0[\s\S]*changeClp'\)::bigint <> 0/i,
  );
  assert.equal(
    migration.match(/permission\.permission_key = 'pos\.pay'/g)?.length,
    2,
  );
  assert.match(
    migration,
    /cross join \(values \('cashier'\), \('manager'\), \('pos_admin'\)\)[\s\S]*on conflict \(shop_id, role_key, permission_key\) do nothing/i,
  );

  const preflightPay = migration.indexOf("permission.permission_key = 'pos.pay'");
  const batchLookup = migration.indexOf("from public.pos_sales_sync_batches batch_row");
  assert.ok(preflightPay >= 0);
  assert.ok(batchLookup > preflightPay);
});

test("TASK-137 release fast-fails invalid payment direction before the POS RPC", () => {
  const salesSync = readProjectFile("src/server/pos-auth/sales-sync.ts");

  assert.match(salesSync, /function paymentDirectionsAreConsistent\(/);
  assert.match(salesSync, /payment\.amountClp >= 0/);
  assert.match(
    salesSync,
    /payment\.amountClp <= 0 && payment\.changeClp === 0/,
  );
  assert.match(
    salesSync,
    /!paymentDirectionsAreConsistent\(businessKind, payments\)[\s\S]*!paymentTotalsAreConsistent/,
  );
});

test("TASK-137 release ships dynamic regressions for all seven validated findings", () => {
  const catalogPgTap = readProjectFile(
    "supabase/tests/task_137_release_catalog_security.sql",
  );
  const posPgTap = readProjectFile(
    "supabase/tests/dsc_093_094_134_pos_sales_security.sql",
  );

  for (const required of [
    "cross-shop supplier insert is denied",
    "cross-shop category insert is denied",
    "cross-shop history insert is denied",
    "trigger independently rejects a cross-shop row",
    "omitted headers cannot bypass append-only price history",
    "suspended shop rejects direct product insert",
    "catalog RPC remains fail-closed for an archived shop",
  ]) {
    assert.match(catalogPgTap, new RegExp(required, "i"));
  }

  for (const required of [
    "sale with mixed-sign tenders is denied before sinks",
    "refund cannot use positive tender and compensating change",
    "disabled pos.pay permission denies a valid sale",
    "missing pos.pay permission fails closed",
    "revoked pos.pay denies replay before idempotency lookup",
    "leave every sink unchanged",
  ]) {
    assert.match(posPgTap, new RegExp(required, "i"));
  }
});
