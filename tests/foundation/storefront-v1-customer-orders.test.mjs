import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const orderMigration = read(
  "supabase/migrations/20260803033000_storefront_v1_customer_orders.sql",
);
const capacityMigration = read(
  "supabase/migrations/20260803034500_storefront_v1_customer_order_capacity.sql",
);
const posSalesMigration = read(
  "supabase/migrations/20260604214112_task_041_pos_sales_sync_foundation.sql",
);
const pgTap = read("supabase/tests/storefront_v1_customer_orders.sql");
const concurrency = read(
  "scripts/testing/storefront-v1-customer-order-concurrency.sh",
);
const stagingWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const taskWorkflow = read(
  ".github/workflows/task-027-customer-order-staging.yml",
);

test("TASK-027 keeps order aggregate and delivery outbox behind forced RLS", () => {
  for (const table of [
    "customer_orders",
    "customer_order_items",
    "customer_order_status_events",
    "customer_order_outbox",
    "customer_order_mutations",
  ]) {
    assert.match(
      orderMigration,
      new RegExp(`alter table public\\.${table} force row level security`),
    );
  }
  assert.match(
    orderMigration,
    /revoke all on table public\.customer_orders[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    orderMigration,
    /revoke all on table public\.customer_order_outbox[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    orderMigration,
    /grant select, insert, update, delete on table public\.customer_order_outbox[\s\S]*to service_role/,
  );
});

test("TASK-027 accepts only confirmed quote identity, version and idempotency key", () => {
  const signature =
    capacityMigration.match(
      /create or replace function public\.customer_order_create_v1\([\s\S]*?\n\)\nreturns jsonb/,
    )?.[0] ?? "";
  assert.notEqual(signature, "");
  assert.doesNotMatch(
    signature,
    /p_(user_id|shop_id|price|total|discount|fee|stock|promotion)/i,
  );
  assert.match(capacityMigration, /v_quote\.status <> 'confirmed'/);
  assert.match(capacityMigration, /v_quote\.quote_version <> p_expected_quote_version/);
  assert.match(capacityMigration, /customer_checkout_validate_v1/);
  assert.match(capacityMigration, /for update of product/);
});

test("TASK-027 commits one order aggregate or no partial aggregate", () => {
  assert.match(capacityMigration, /pg_advisory_xact_lock/);
  assert.match(orderMigration, /customer_orders_quote_unique unique \(quote_id\)/);
  assert.match(
    orderMigration,
    /customer_order_mutations_owner_key_unique unique \([\s\S]*user_id,[\s\S]*shop_id,[\s\S]*idempotency_key/,
  );
  for (const insert of [
    "customer_orders",
    "customer_order_items",
    "customer_order_status_events",
    "customer_order_outbox",
    "customer_order_mutations",
  ]) {
    assert.match(capacityMigration, new RegExp(`insert into public\\.${insert}`));
  }
  assert.match(capacityMigration, /set status = 'consumed', consumed_at = v_now/);
  assert.match(capacityMigration, /delete from public\.customer_cart_items/);
  assert.match(capacityMigration, /cart_version = cart\.cart_version \+ 1/);
  assert.match(capacityMigration, /'idempotency_conflict'/);
});

test("TASK-027 customer receipt is immutable and omits private source identifiers", () => {
  const customerPayload =
    orderMigration.match(
      /create or replace function app_private\.customer_order_payload_v1\([\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.notEqual(customerPayload, "");
  assert.match(customerPayload, /'orderCode'/);
  assert.match(customerPayload, /'fulfillment'/);
  assert.match(customerPayload, /'subtotalClp'/);
  assert.match(customerPayload, /'items'/);
  assert.doesNotMatch(
    customerPayload,
    /'sourceProductId'|'holdId'|'quoteId'|'cartId'|'shopId'|'userId'/,
  );
  assert.match(orderMigration, /line_total_clp = unit_price_clp \* quantity/);
  assert.match(orderMigration, /total_clp = subtotal_clp \+ delivery_fee_clp/);
  assert.match(orderMigration, /customer_order_snapshot_immutable/);
  assert.match(orderMigration, /customer_order_item_snapshot_immutable/);
  assert.match(orderMigration, /customer_order_status_event_append_only/);
  assert.match(orderMigration, /customer_order_outbox_envelope_immutable/);
});

test("TASK-027 preserves ATP and slot capacity after a quote and hold are consumed", () => {
  assert.match(
    capacityMigration,
    /storefront_fulfillment_slot_active_uses_v1[\s\S]*customer_checkout_quotes[\s\S]*customer_orders/,
  );
  assert.match(
    capacityMigration,
    /storefront_reservation_active_quantity_v1[\s\S]*customer_reservation_holds[\s\S]*customer_order_items/,
  );
  assert.match(
    capacityMigration,
    /customer_order\.status in \([\s\S]*'confirmed'[\s\S]*'out_for_delivery'/,
  );
  assert.match(
    capacityMigration,
    /perform app_private\.storefront_reservation_refresh_availability_v1/,
  );
});

test("TASK-027 customer order remains distinct from a POS fiscal sale", () => {
  assert.match(posSalesMigration, /create table if not exists public\.pos_sales/);
  assert.match(orderMigration, /Customer commerce order[\s\S]*not a fiscal sale/);
  assert.match(capacityMigration, /'documentKind', 'customer_order'/);
  assert.match(capacityMigration, /'fiscalStatus', 'not_created'/);
  assert.match(capacityMigration, /'customer_order\.confirmed\.v1'/);
  assert.doesNotMatch(capacityMigration, /insert into public\.pos_sales/);
});

test("TASK-027 pgTAP proves ownership, immutable snapshots and atomic replay", () => {
  assert.match(pgTap, /select no_plan\(\)/);
  for (const expected of [
    "anonymous Auth identities cannot create customer orders",
    "atomic order response returns the server-owned confirmed economic snapshot",
    "item snapshot, first status event and outbox record commit with the order",
    "outbox contract keeps customer order explicitly separate from fiscal sale",
    "quote consumption and cart clearing are atomic with order creation",
    "identical retry returns the same order without duplicate writes",
    "later catalog changes cannot rewrite the customer order item snapshot",
    "economic and fulfillment order snapshots reject post-confirmation mutation",
    "order item snapshots reject post-confirmation mutation",
    "status events are append-only",
    "outbox identity and payload envelope reject post-confirmation mutation",
    "cross-user order reads fail closed without existence disclosure",
    "negative requests leave the atomic order aggregate unchanged",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-027 concurrency harness proves one commit and one replay", () => {
  assert.match(concurrency, /refuses an unauthorized non-local database/);
  assert.match(concurrency, /order_pid_a=\$!/);
  assert.match(concurrency, /order_pid_b=\$!/);
  assert.match(concurrency, /wait "\$\{order_pid_a\}"/);
  assert.match(concurrency, /wait "\$\{order_pid_b\}"/);
  assert.match(
    concurrency,
    /two simultaneous retries, one order\/item\/event\/outbox\/mutation, one idempotent replay, stock unchanged, fiscal sale not created, PASS/,
  );
});

test("TASK-027 staging apply is exact-SHA guarded and reruns native contracts", () => {
  for (const expected of [
    'expected_migration_version: "20260803034500"',
    "expected_migration_name: storefront_v1_customer_order_capacity",
    "expected_migration_file: 20260803034500_storefront_v1_customer_order_capacity.sql",
    'expected_predecessor_migration_version: "20260803033000"',
    "expected_predecessor_migration_name: storefront_v1_customer_orders",
    "expected_predecessor_migration_file: 20260803033000_storefront_v1_customer_orders.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260803034500'/,
  );
  assert.match(stagingWorkflow, /task-027-pgtap\.txt/);
  assert.match(stagingWorkflow, /task-027-concurrency\.txt/);
  assert.ok(
    stagingWorkflow.includes("pgTapPlan: /^1\\.\\.35$/m.test(tap),"),
  );
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 35/);
  assert.match(stagingWorkflow, /serverAuthoritativeArguments/);
  assert.match(stagingWorkflow, /posNeutralOutbox/);
});
