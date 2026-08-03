import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const checkoutMigration = read(
  "supabase/migrations/20260803020000_storefront_v1_checkout_fulfillment.sql",
);
const adminMigration = read(
  "supabase/migrations/20260803021500_storefront_v1_checkout_admin.sql",
);
const pgTap = read("supabase/tests/storefront_v1_checkout_fulfillment.sql");
const concurrency = read(
  "scripts/testing/storefront-v1-checkout-slot-concurrency.sh",
);
const stagingWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const taskWorkflow = read(
  ".github/workflows/task-026-checkout-staging.yml",
);
const adminPage = read("src/app/shop/storefront/page.tsx");
const adminActions = read("src/app/shop/storefront/actions.ts");
const adminReadModel = read(
  "src/server/shop-admin/storefront-read-model.ts",
);
const adminMutations = read(
  "src/server/shop-admin/storefront-mutations.ts",
);
const adminE2e = read(
  "tests/e2e/storefront-v1-admin-publications-local.spec.ts",
);

test("TASK-026 keeps fulfillment capacity and checkout state behind forced RLS", () => {
  for (const table of [
    "storefront_pickup_points",
    "storefront_delivery_zones",
    "storefront_delivery_zone_communes",
    "storefront_fulfillment_slots",
    "customer_checkout_quotes",
    "customer_checkout_mutations",
  ]) {
    assert.match(
      checkoutMigration,
      new RegExp(`alter table public\\.${table} force row level security`),
    );
  }
  assert.match(checkoutMigration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.match(
    checkoutMigration,
    /revoke all on table public\.storefront_fulfillment_slots[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    checkoutMigration,
    /grant select, insert, update, delete on table public\.customer_checkout_quotes[\s\S]*to service_role/,
  );
});

test("TASK-026 derives address, fee, prices, promotion, stock and total on the server", () => {
  const createSignature =
    checkoutMigration.match(
      /create or replace function public\.customer_checkout_quote_create_v1\([\s\S]*?\n\)\nreturns jsonb/,
    )?.[0] ?? "";
  const confirmSignature =
    checkoutMigration.match(
      /create or replace function public\.customer_checkout_quote_confirm_v1\([\s\S]*?\n\)\nreturns jsonb/,
    )?.[0] ?? "";
  assert.notEqual(createSignature, "");
  assert.notEqual(confirmSignature, "");
  assert.doesNotMatch(
    `${createSignature}\n${confirmSignature}`,
    /p_(user_id|shop_id|price|total|discount|fee|stock)/i,
  );
  assert.match(checkoutMigration, /storefront_catalog_source_v1/);
  assert.match(checkoutMigration, /v_zone\.fee_clp/);
  assert.match(checkoutMigration, /v_address_snapshot := jsonb_build_object/);
  assert.match(checkoutMigration, /for update of product/);
  assert.match(checkoutMigration, /total_clp = subtotal_clp \+ delivery_fee_clp/);
});

test("TASK-026 serializes slot capacity and stores bounded idempotent replies", () => {
  assert.match(checkoutMigration, /for update;[\s\S]*v_slot_uses/);
  assert.match(checkoutMigration, /v_slot_uses >= v_slot\.capacity/);
  assert.match(checkoutMigration, /pg_advisory_xact_lock/);
  assert.match(checkoutMigration, /customer_checkout_mutations_owner_key_unique/);
  assert.match(checkoutMigration, /'idempotency_conflict'/);
  assert.match(checkoutMigration, /pg_column_size\(response_payload\) <= 393216/);
  assert.match(checkoutMigration, /v_now \+ interval '5 minutes'/);
  assert.match(checkoutMigration, /quoted_at \+ interval '10 minutes'/);
});

test("TASK-026 public discovery omits private capacity and inventory fields", () => {
  const publicOptions =
    checkoutMigration.match(
      /create or replace function public\.storefront_fulfillment_options_v1\([\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.notEqual(publicOptions, "");
  assert.match(publicOptions, /'status', 'available'/);
  assert.match(publicOptions, /slot\.capacity > \(/);
  assert.doesNotMatch(
    publicOptions.match(/return jsonb_build_object\([\s\S]*?\n  \);\nend;/)?.[0] ?? "",
    /'capacity'|'activeQuoteCount'|'shopId'|'sourceProductId'|'stockQuantity'/,
  );
  assert.match(checkoutMigration, /'currencyCode', 'CLP'/);
});

test("TASK-026 creates a quote only and leaves order creation to TASK-027", () => {
  assert.match(
    checkoutMigration,
    /TASK-027 consumes a confirmed quote to create an order/,
  );
  assert.doesNotMatch(
    checkoutMigration,
    /insert into public\.(customer_)?orders\b/i,
  );
  assert.doesNotMatch(checkoutMigration, /'orderId'/);
  assert.match(checkoutMigration, /status = 'confirmed'/);
});

test("TASK-026 Admin mutations are permission checked, audited and conflict safe", () => {
  assert.match(adminMigration, /'storefront\.settings\.manage'/);
  assert.match(adminMigration, /storefront_admin_authorized_v1/);
  assert.match(adminMigration, /'active_checkout_conflict'/);
  assert.match(adminMigration, /'pickup_configuration_required'/);
  assert.match(adminMigration, /'delivery_configuration_required'/);
  assert.match(adminMigration, /v_starts_at_text::timestamp at time zone v_time_zone/);
  assert.match(adminMigration, /v_time_zone not in \('America\/Santiago', 'UTC'\)/);
  assert.match(
    adminMigration,
    /'shop\.storefront\.fulfillment\.' \|\| p_operation \|\| '\.success'/,
  );
  assert.match(adminMigration, /'before', coalesce\(v_before/);
  assert.match(adminMigration, /'after', coalesce\(v_after/);
  assert.doesNotMatch(adminMigration, /service_role.*bypass/is);
});

test("TASK-026 Admin Console uses lease-bound fulfillment RPCs for both principals", () => {
  assert.match(
    adminReadModel,
    /admin_storefront_fulfillment_read_v1/,
  );
  assert.match(adminReadModel, /callStaffWebStorefrontFulfillmentRead/);
  assert.match(adminReadModel, /canManageFulfillment/);
  assert.match(adminMutations, /"storefront\.settings\.manage"/);
  assert.match(adminMutations, /callStaffWebStorefrontFulfillmentMutation/);
  for (const operation of [
    "settings_upsert",
    "pickup_upsert",
    "zone_upsert",
    "slot_upsert",
  ]) {
    assert.match(adminActions, new RegExp(`operation: "${operation}"`));
  }
});

test("TASK-026 Admin UI exposes responsive, labeled fulfillment controls", () => {
  for (const label of [
    "Ritiro e consegna",
    "Modalità cliente",
    "Punti di ritiro",
    "Zone di consegna",
    "Fasce di fulfillment",
    "Inizio · America/Santiago",
    "Fine · America/Santiago",
    "Capacità",
  ]) {
    assert.match(adminPage, new RegExp(label));
  }
  assert.match(adminPage, /min-h-12 items-center/);
  assert.match(adminPage, /sm:grid-cols-3/);
  assert.match(adminPage, /xl:grid-cols-2/);
  assert.match(adminPage, /lg:grid-cols-3/);
  assert.match(adminPage, /disabled=\{!canManage/);
  assert.match(adminPage, /type="datetime-local"/);
  assert.doesNotMatch(adminPage, /<svg|dangerouslySetInnerHTML/);
});

test("TASK-026 browser regression proves persistence and public-capacity redaction", () => {
  assert.match(adminE2e, /documentElement\.scrollWidth <= window\.innerWidth/);
  assert.match(adminE2e, /Object\.fromEntries\(new FormData/);
  assert.match(adminE2e, /persistedSlots/);
  assert.match(adminE2e, /persistedSettings/);
  assert.match(adminE2e, /storefront_fulfillment_options_v1/);
  assert.match(
    adminE2e,
    /capacity\|activeQuoteCount\|shopId\|stock_quantity/,
  );
  assert.match(
    adminE2e,
    /shop\.storefront\.fulfillment\.settings_upsert\.success/,
  );
});

test("TASK-026 pgTAP covers modes, repricing, ownership, capacity and cleanup", () => {
  assert.match(pgTap, /select no_plan\(\)/);
  for (const expected of [
    "customer checkout accepts no authoritative price, total, fee, stock, owner or shop input",
    "Admin cannot enable pickup before a usable public configuration exists",
    "public discovery reveals no capacity, tenant, actor or inventory internals",
    "anonymous Auth identities cannot create checkout quotes",
    "identical quote retry returns the original result idempotently",
    "second customer cannot exceed the final delivery slot capacity",
    "reservation checkout requires a live owner hold",
    "server revalidation surfaces expired promotion and fee changes for customer review",
    "bounded cleanup processes at most the requested expired quote batch",
    "cross-shop authenticated account cannot mutate fulfillment configuration",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-026 concurrency harness proves one winner for the final slot", () => {
  assert.match(concurrency, /refuses an unauthorized non-local database/);
  assert.match(concurrency, /checkout_pid_a=\$!/);
  assert.match(concurrency, /checkout_pid_b=\$!/);
  assert.match(concurrency, /wait "\$\{checkout_pid_a\}"/);
  assert.match(concurrency, /wait "\$\{checkout_pid_b\}"/);
  assert.match(
    concurrency,
    /one quoted, one slot_unavailable, one active quote, stock unchanged, public slot closed, PASS/,
  );
});

test("TASK-026 staging apply is exact-SHA guarded and reruns native contracts", () => {
  for (const expected of [
    'expected_migration_version: "20260803021500"',
    "expected_migration_name: storefront_v1_checkout_admin",
    "expected_migration_file: 20260803021500_storefront_v1_checkout_admin.sql",
    'expected_predecessor_migration_version: "20260803020000"',
    "expected_predecessor_migration_name: storefront_v1_checkout_fulfillment",
    "expected_predecessor_migration_file: 20260803020000_storefront_v1_checkout_fulfillment.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260803021500'/,
  );
  assert.match(stagingWorkflow, /task-026-pgtap\.txt/);
  assert.match(stagingWorkflow, /task-026-concurrency\.txt/);
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 56/);
  assert.match(stagingWorkflow, /serverAuthoritativeArguments/);
  assert.match(stagingWorkflow, /authenticatedCheckoutAllowed/);
});
