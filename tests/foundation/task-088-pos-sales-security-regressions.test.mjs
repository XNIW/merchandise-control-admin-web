import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath =
  "supabase/migrations/20260715130000_dsc_093_094_134_pos_sales_security.sql";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-088 DSC-093 derives POS sale gross and discount authority server-side", () => {
  const migration = readProjectFile(migrationPath);

  assert.match(migration, /jsonb_array_length\(p_sales\)\s+between 1 and 100/i);
  assert.match(migration, /v_line_count\s*>\s*1000/i);
  assert.match(migration, /inventory_products[\s\S]*retail_price[\s\S]*for update/i);
  assert.match(migration, /authoritative_gross/i);
  assert.match(migration, /pos\.discount/i);
  assert.match(migration, /discount_cap_percent/i);
  assert.match(migration, /discount_amount_clp[\s\S]*authoritative_gross/i);
  assert.match(migration, /max_discount_percent/i);
  assert.match(migration, /staff_role_permissions/i);
  assert.match(migration, /pos\.discount_over_limit/i);
  assert.match(
    migration,
    /v_stock_quantity_delta\s*<>\s*\(case[\s\S]*?end\)\s*then/i,
  );
  assert.doesNotMatch(migration, /v_stock_quantity_delta\s*<>\s*case\b/i);
  assert.doesNotMatch(migration, /when 'pos_admin' then 20\.00/i);
});

test("TASK-088 DSC-094/134 binds reversal lines and caps cumulative residuals under lock", () => {
  const migration = readProjectFile(migrationPath);

  assert.match(migration, /original_pos_sale_line_id/i);
  assert.match(migration, /references public\.pos_sale_lines\(pos_sale_line_id\)/i);
  assert.match(migration, /clientOriginalLineId/i);
  assert.match(migration, /original_line_candidate_count\s*<>\s*1/i);
  assert.match(migration, /order by[\s\S]*for update/i);
  assert.match(migration, /already_reversed_quantity/i);
  assert.match(migration, /already_reversed_value_clp/i);
  assert.match(migration, /reversal_quantity_exceeds_residual/i);
  assert.match(migration, /reversal_value_exceeds_residual/i);
  assert.match(migration, /original_sale_value_exceeds_residual/i);
  assert.match(migration, /pending_reversal_quantity/i);
  assert.match(migration, /historical_unbound/i);
  assert.match(migration, /historical_reversal_ambiguous/i);
  assert.match(migration, /reversal_non_item_line_not_allowed/i);
  assert.match(migration, /derived_reversal_discount/i);
  assert.match(migration, /derived_reversal_tax/i);
  assert.match(migration, /payment_amount_total/i);
  assert.match(migration, /payment_change_total/i);
  assert.match(migration, /payment_totals_mismatch/i);
  assert.match(
    migration,
    /v_payment_amount_total\s*-\s*v_payment_change_total\s*<>\s*v_client_net/i,
  );
});

test("TASK-088 RPC revalidates every mutable POS auth edge under lock", () => {
  const migration = readProjectFile(migrationPath);

  for (const required of [
    "public.shop_devices",
    "public.pos_device_credentials",
    "device.status = 'active'",
    "credential.status = 'active'",
    "credential.expires_at > now()",
    "staff.session_invalidated_at",
    "session_row.issued_at",
    "for update of session_row, staff, device, credential, shop",
  ]) {
    assert.match(
      migration,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );
  }
});

test("TASK-088 ships behavioral pgTAP coverage for the P1 exploit cluster", () => {
  const pgTap = readProjectFile(
    "supabase/tests/dsc_093_094_134_pos_sales_security.sql",
  );

  for (const required of [
    "cashier discount denied",
    "disabled role permission denied",
    "discount within cap accepted",
    "discount over cap denied",
    "over-limit permission accepted",
    "catalog price mismatch denied",
    "duplicate lines same original denied",
    "historical unbound reversal consumes residual",
    "historical unbound ambiguity denied",
    "cumulative second refund denied",
    "legacy Win gross-only reversal payload rejected",
    "corrected Win item-only proportional reversal accepted",
    "corrected Win reversal persists one bound item and proportional headers",
    "corrected Win reversal ledger matches proportional net",
    "payment header and ledger change mismatch denied before sinks",
    "revoked device denied",
    "revoked credential denied",
    "session invalidation denied",
    "failed batch rolls back every sink",
    "idempotent retry is duplicate",
  ]) {
    assert.match(pgTap, new RegExp(required, "i"));
  }

  assert.match(
    pgTap,
    /credential_kind, credential_hash, credential_updated_at/i,
  );
  assert.match(pgTap, /pgTAP-fixture-not-a-real-credential/i);
});

test("TASK-088 HTTP parser binds header change to payment ledger change", () => {
  const salesSync = readProjectFile("src/server/pos-auth/sales-sync.ts");

  assert.match(salesSync, /change === input\.changeAmountClp/);
  assert.match(salesSync, /tendered - change === input\.netAmountClp/);
});

test("TASK-088 classifies the single-session lock-order check as structural", () => {
  const migration = readProjectFile(migrationPath).toLowerCase();
  const pgTap = readProjectFile(
    "supabase/tests/dsc_093_094_134_pos_sales_security.sql",
  );
  const authRowLock = migration.indexOf(
    "for update of session_row, staff, device, credential, shop",
  );
  const advisoryLock = migration.indexOf("perform pg_advisory_xact_lock(");

  assert.ok(authRowLock >= 0);
  assert.ok(advisoryLock > authRowLock);
  assert.match(
    pgTap,
    /Structural only: a single pgTAP connection cannot prove concurrent blocking/i,
  );
  assert.match(
    pgTap,
    /structural source contract auth row locks precede advisory lock/i,
  );
  assert.doesNotMatch(pgTap, /concurrent lock contract serializes/i);
});

test("TASK-088 Sales Sync delegates every new batch to one service-only atomic RPC", () => {
  const migration = readProjectFile(migrationPath);
  const salesSync = readProjectFile("src/server/pos-auth/sales-sync.ts");
  const handler = salesSync.slice(
    salesSync.indexOf("export async function handlePosSalesSync"),
  );

  assert.match(migration, /create or replace function public\.pos_sales_sync_apply_v1/i);
  assert.match(migration, /language plpgsql[\s\S]*security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.doesNotMatch(migration, /v_stock_(?:before|after)\b/i);
  for (const requiredWrite of [
    "insert into public.pos_sales_sync_batches",
    "insert into public.pos_sales (",
    "insert into public.pos_sale_lines (",
    "insert into public.pos_revenue_ledger_entries (",
    "from public.pos_apply_sale_stock_movement(",
  ]) {
    assert.match(migration, new RegExp(requiredWrite.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(migration, /exception[\s\S]*when sqlstate 'P8801'/i);
  assert.match(migration, /when sqlstate 'P8803' or unique_violation/i);
  assert.match(
    migration,
    /revoke all on function public\.pos_sales_sync_apply_v1\([\s\S]*from authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.pos_sales_sync_apply_v1\([\s\S]*to service_role/i,
  );
  assert.match(handler, /\.rpc\(\s*"pos_sales_sync_apply_v1"/);
  assert.doesNotMatch(handler, /\.from\("pos_sales_sync_batches"\)\s*\.insert/);
  assert.doesNotMatch(handler, /\.from\("pos_sales"\)\s*\.insert/);
  assert.doesNotMatch(handler, /\.from\("pos_sale_lines"\)\s*\.insert/);
  assert.doesNotMatch(handler, /\.from\("pos_revenue_ledger_entries"\)\s*\.insert/);
  assert.match(salesSync, /clientOriginalLineId/);
});
