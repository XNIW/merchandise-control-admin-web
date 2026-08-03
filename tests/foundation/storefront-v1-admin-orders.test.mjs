import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260803053000_storefront_v1_admin_orders.sql",
);
const pgTap = read("supabase/tests/storefront_v1_admin_orders.sql");
const concurrency = read(
  "scripts/testing/storefront-v1-admin-order-concurrency.sh",
);
const page = read("src/app/shop/orders/page.tsx");
const loading = read("src/app/shop/orders/loading.tsx");
const panel = read("src/app/shop/orders/OrderTransitionPanel.tsx");
const actions = read("src/app/shop/orders/actions.ts");
const readModel = read("src/server/shop-admin/order-read-model.ts");
const mutations = read("src/server/shop-admin/order-mutations.ts");
const permissions = read("src/server/shop-admin/permissions.ts");
const staffPermissions = read(
  "src/server/shop-admin/staff-web-permissions.ts",
);
const leaseBoundary = read(
  "src/server/shop-admin/staff-web-lease-bound-rpc.ts",
);
const sections = read("src/components/shop/shopSections.ts");
const stagingWorkflow = read(
  ".github/workflows/task-029-admin-order-staging.yml",
);
const acceptanceWorkflow = read(
  ".github/workflows/final-staging-auth-performance.yml",
);

test("TASK-029 exposes a top-level Commerce order queue and responsive detail workspace", () => {
  for (const expected of [
    "/shop/orders",
    "Commerce",
    "Filtri persistenti",
    "Coda ordini",
    "Dettaglio operativo",
    "Timeline ordine",
    "Handoff",
    "Audit amministrativo",
    "Mostra successivi",
  ]) {
    assert.match(`${sections}\n${page}`, new RegExp(expected));
  }
  assert.match(page, /xl:grid-cols-\[minmax\(22rem,0\.85fr\)_minmax\(0,1\.25fr\)\]/);
  assert.match(page, /overflow-x-auto/);
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(page, /purchasePrice|stockQuantity|sourceProductId|ownerUserId/);
});

test("TASK-029 UI keeps filters, keyboard focus and double-submit recovery explicit", () => {
  for (const expected of [
    "type=\"search\"",
    "type=\"date\"",
    "aria-current",
    "focus-visible:ring-2",
    "required",
    "useFormStatus",
    "disabled={pending}",
    "idempotency_key",
    "expected_status_version",
    "correlation_id",
  ]) {
    assert.match(`${page}\n${panel}`, new RegExp(expected));
  }
  assert.match(actions, /safeReturnPath/);
  assert.match(actions, /parsed\.pathname !== "\/shop\/orders"/);
  assert.match(actions, /revalidatePath\("\/shop\/orders"\)/);
  assert.match(`${page}\n${panel}`, /(?:min-)?h-12/);
  assert.doesNotMatch(`${page}\n${panel}`, /(?:min-)?h-11/);
  assert.match(page, /date\.setUTCDate\(date\.getUTCDate\(\) \+ 1\)/);
});

test("TASK-029 uses granular Admin and staff permissions without a browser service-role client", () => {
  for (const permission of ["orders.view", "orders.manage"]) {
    for (const source of [permissions, staffPermissions, migration]) {
      assert.match(source, new RegExp(permission.replace(".", "\\.")));
    }
  }
  assert.match(leaseBoundary, /callStaffWebCustomerOrdersRead/);
  assert.match(leaseBoundary, /callStaffWebCustomerOrderTransition/);
  assert.match(readModel, /resolveShopAdminDataAccess/);
  assert.match(mutations, /resolveShopActionContext/);
  assert.doesNotMatch(readModel, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/);
  assert.doesNotMatch(mutations, /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient|\.from\(/);
});

test("TASK-029 SQL read boundary is shop-scoped, keyset-paginated and privacy allow-listed", () => {
  for (const expected of [
    "admin_customer_orders_read_v1",
    "customer_order_admin_authorized_v1",
    "orders.view",
    "placed_at desc, filtered.id desc",
    "afterPlacedAt",
    "afterId",
    "limit v_limit + 1",
    "totalMatching",
    "itemSummary",
    "push', jsonb_build_object('status', 'not_configured')",
  ]) {
    assert.match(
      migration,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  const detailRead = migration.match(
    /select jsonb_build_object\([\s\S]*?'orderId', customer_order\.id[\s\S]*?into v_order/,
  )?.[0];
  assert.ok(detailRead);
  assert.doesNotMatch(
    detailRead,
    /user_id|source_product_id|hold_id|quote_id|cart_id|addressId/,
  );
});

test("TASK-029 state machine is versioned, idempotent and atomic", () => {
  for (const expected of [
    "admin_customer_order_transition_v1",
    "pg_advisory_xact_lock",
    "customer_order_admin_mutations_key_unique",
    "p_expected_status_version",
    "idempotency_conflict",
    "version_conflict",
    "for update",
    "customer_order_status_events",
    "audit_logs",
    "customer_order_outbox",
    "customer_order_admin_mutations",
    "correlationId",
  ]) {
    assert.match(migration, new RegExp(expected));
  }
  assert.match(migration, /v_order\.status = 'ready'[\s\S]*v_order\.fulfillment_mode = 'delivery'/);
  assert.match(migration, /v_order\.status = 'out_for_delivery'[\s\S]*v_order\.fulfillment_mode = 'delivery'/);
  assert.match(migration, /v_order\.fulfillment_mode in \('pickup', 'reservation'\)/);
  assert.match(migration, /v_order\.status in \([\s\S]*'out_for_delivery'/);
});

test("TASK-029 order transition remains POS-neutral and PII-safe", () => {
  assert.match(migration, /'documentKind', 'customer_order'/);
  assert.match(migration, /'fiscalStatus', 'not_created'/);
  assert.doesNotMatch(migration, /insert into public\.pos_sales/);
  const auditInsert = migration.match(
    /insert into public\.audit_logs \([\s\S]*?returning audit_log_id into v_audit_id/,
  )?.[0];
  assert.ok(auditInsert);
  assert.doesNotMatch(auditInsert, /email|token|address|recipient|reasonText/);
  assert.match(auditInsert, /reasonCode/);
  assert.match(auditInsert, /requestId/);
  assert.match(auditInsert, /correlationId/);
});

test("TASK-029 native SQL tests cover RBAC, invalid arcs, rollback and fiscal separation", () => {
  for (const expected of [
    "account without shop membership cannot read",
    "cross-shop detail fails closed",
    "cross-shop mutation fails closed",
    "state machine rejects forward skips",
    "stale status version",
    "pickup order follows",
    "delivery order requires",
    "partial aggregate",
    "rolls order, event, audit",
    "create no fiscal sale",
    "select \\* from finish",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-029 two-session harness proves one winner, one stale loser and exact replay", () => {
  assert.match(concurrency, /refuses an unauthorized non-local database/);
  assert.match(concurrency, /admin_order_pid_a=\$!/);
  assert.match(concurrency, /admin_order_pid_b=\$!/);
  assert.match(concurrency, /wait "\$\{admin_order_pid_a\}"/);
  assert.match(concurrency, /wait "\$\{admin_order_pid_b\}"/);
  assert.match(concurrency, /success\\\|accepted\\\|2\\\|false/);
  assert.match(concurrency, /version_conflict\\\|none\\\|none\\\|none/);
  assert.match(concurrency, /success\|accepted\|2\|true/);
  assert.match(concurrency, /zero fiscal sale: PASS/);
});

test("TASK-029 staging gates freeze the migration and browser acceptance to one revision", () => {
  for (const expected of [
    'expected_head_sha: ${{ github.sha }}',
    'expected_migration_version: "20260803053000"',
    "20260803053000_storefront_v1_admin_orders.sql",
    "storefront_v1_admin_orders.sql",
    "storefront-v1-admin-order-concurrency.sh",
    "pgTapAssertions: (tap.match(/^ok \\d+ - /gm) || []).length === 34",
    "zero fiscal sale: PASS",
  ]) {
    assert.match(
      stagingWorkflow,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.match(
    acceptanceWorkflow,
    /tests\/e2e\/storefront-v1-admin-orders-local\.spec\.ts/,
  );
});
