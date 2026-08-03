import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("Milestone 4 integrated SQL follows one rollback-safe customer order", () => {
  const sql = read("supabase/tests/storefront_v1_milestone4_e2e.sql");
  assert.match(sql, /^begin;/);
  assert.match(sql, /rollback;\s*$/);
  assert.equal((sql.match(/'M4-\d{2} /g) || []).length, 40);

  for (const marker of [
    "admin_storefront_publication_mutate_v1",
    "storefront_product_detail_v1",
    "customer_register_device_v1",
    "customer_reservation_hold_create_v1",
    "customer_cart_mutate_v1",
    "customer_checkout_quote_create_v1",
    "customer_checkout_quote_confirm_v1",
    "customer_order_create_v2",
    "admin_customer_order_transition_v1",
    "pos_customer_order_claim_v1",
    "pos_customer_order_ack_v1",
    "customer_notification_claim_v1",
    "customer_notification_ack_v1",
    "customer_notification_route_v1",
    "customer_order_detail_v1",
    "customer_order_list_v1",
    "service_customer_payment_transition_v1",
  ]) {
    assert.match(sql, new RegExp(marker));
  }

  assert.match(sql, /malicious online-payment request fails closed/);
  assert.match(
    sql,
    /accepts no malicious total, price, discount, stock or tenant input/,
  );
  assert.match(sql, /cross-user order read fails without existence disclosure/);
  assert.match(sql, /cross-shop POS claim is denied/);
  assert.match(sql, /zero sale/);
  assert.match(sql, /online payment remains fail-closed/);
});

test("Milestone 4 workflow runs and counts the exact 629-assertion staging matrix", () => {
  const workflow = read(
    ".github/workflows/storefront-v1-milestone-4-staging-e2e.yml",
  );
  const suites = [
    "storefront_v1_customer_profiles_addresses.sql",
    "storefront_v1_customer_devices.sql",
    "storefront_v1_customer_cart.sql",
    "storefront_v1_public_availability.sql",
    "storefront_v1_reservation_holds.sql",
    "storefront_v1_checkout_fulfillment.sql",
    "storefront_v1_customer_orders.sql",
    "storefront_v1_customer_order_history.sql",
    "storefront_v1_admin_orders.sql",
    "storefront_v1_pos_order_handoff.sql",
    "storefront_v1_order_notifications.sql",
    "storefront_v1_customer_payments.sql",
    "storefront_v1_milestone4_e2e.sql",
  ];
  for (const suite of suites) assert.match(workflow, new RegExp(suite));
  assert.match(workflow, /total: \{ passed, planned: 629 \}/);
  assert.match(workflow, /integratedSameOrderAssertions: 40/);
  assert.match(workflow, /productionWriteRequested: false/);
  assert.match(workflow, /group: storefront-v1-staging-order-payment/);
  assert.match(workflow, /expected_migration_version: "20260803143000"/);
  assert.match(workflow, /storefront_v1_default_address_transition/);
  assert.match(workflow, /integratedFixtureRolledBack/);
  assert.match(workflow, /onlineDefaultsOff/);
  assert.match(workflow, /Remove protected connection material/);
  assert.match(workflow, /steps\.sanitize\.outputs\.safe == 'true'/);
});

test("default-address hardening avoids partial-unique row-order races", () => {
  const migration = read(
    "supabase/migrations/20260803143000_storefront_v1_default_address_transition.sql",
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(
    migration,
    /set is_default = false[\s\S]*address\.id <> p_address_id[\s\S]*address\.is_default/,
  );
  assert.match(
    migration,
    /set is_default = true[\s\S]*address\.id = p_address_id[\s\S]*not address\.is_default/,
  );
  assert.doesNotMatch(
    migration,
    /set is_default = \(address\.id = p_address_id\)/,
  );
  assert.match(migration, /to authenticated/);
});

test("notification regression is fixture-scoped and staging writers serialize", () => {
  const notificationSql = read(
    "supabase/tests/storefront_v1_order_notifications.sql",
  );
  const notificationWorkflow = read(
    ".github/workflows/task-031-order-notifications-staging.yml",
  );
  const paymentWorkflow = read(
    ".github/workflows/task-032-customer-payments-staging.yml",
  );
  assert.match(
    notificationSql,
    /from public\.customer_notification_events\s+where order_id = '88000000-0000-4000-8000-000000031001'/,
  );
  assert.match(
    notificationWorkflow,
    /group: storefront-v1-staging-order-payment/,
  );
  assert.match(paymentWorkflow, /group: storefront-v1-staging-order-payment/);
});

test("POS handoff staging assertions are scoped to the fixture aggregate", () => {
  const sql = read("supabase/tests/storefront_v1_pos_order_handoff.sql");
  assert.equal(
    (
      sql.match(
        /from public\.customer_order_pos_receipts\s+where order_id = '90000000-0000-4000-8000-000000030001'/g,
      ) || []
    ).length,
    2,
  );
  assert.equal(
    (
      sql.match(
        /from public\.pos_sales\s+where shop_id = '10000000-0000-4000-8000-000000030001'/g,
      ) || []
    ).length,
    2,
  );
  assert.match(
    sql,
    /receipt\.order_id = '90000000-0000-4000-8000-000000030001'[\s\S]*receipt\.outcome <> 'completed'/,
  );
});
