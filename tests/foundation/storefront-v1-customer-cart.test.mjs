import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802210000_storefront_v1_customer_cart.sql",
  ),
  "utf8",
);
const pgTap = readFileSync(
  join(process.cwd(), "supabase/tests/storefront_v1_customer_cart.sql"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/storefront-v1-staging-migrations.yml"),
  "utf8",
);
const taskWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/task-023-customer-cart-staging.yml"),
  "utf8",
);
const concurrencyHarness = readFileSync(
  join(
    process.cwd(),
    "scripts/testing/storefront-v1-customer-cart-concurrency.sh",
  ),
  "utf8",
);

test("TASK-023 persists owner carts behind forced RLS and bounded RPCs", () => {
  for (const table of [
    "customer_carts",
    "customer_cart_items",
    "customer_cart_mutations",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`),
    );
  }
  assert.match(migration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.match(
    migration,
    /revoke all on table public\.customer_cart_items[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.customer_cart_items[\s\S]*to service_role/,
  );
});

test("TASK-023 accepts no client price, total, discount or stock authority", () => {
  for (const rpc of [
    "customer_cart_mutate_v1",
    "customer_cart_merge_guest_v1",
    "customer_cart_revalidate_v1",
  ]) {
    const signature =
      migration.match(
        new RegExp(
          `create or replace function public\\.${rpc}\\([\\s\\S]*?\\n\\)\\nreturns jsonb`,
        ),
      )?.[0] ?? "";
    assert.notEqual(signature, "", `${rpc} signature missing`);
    assert.doesNotMatch(signature, /p_(price|total|discount|stock)/i);
  }
  assert.match(migration, /storefront_catalog_source_v1/);
  assert.match(migration, /'quoteExpiresAt', p_quote_expires_at/);
  assert.match(migration, /v_now \+ interval '5 minutes'/);
});

test("TASK-023 serializes optimistic mutations and stores bounded idempotent replies", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /'status', 'idempotency_conflict'/);
  assert.match(migration, /'version_conflict'/);
  assert.match(migration, /octet_length\(request_hash\) = 32/);
  assert.match(migration, /pg_column_size\(response_payload\) <= 131072/);
  assert.match(migration, /expires_at <= created_at \+ interval '8 days'/);
});

test("TASK-023 merge uses max overlap policy and never exceeds 100 lines", () => {
  assert.match(
    migration,
    /quantity = greatest\(customer_cart_items\.quantity, excluded\.quantity\)/,
  );
  assert.match(
    migration,
    /candidate\.new_item_rank <= greatest\(100 - v_item_count, 0\)/,
  );
  assert.match(migration, /jsonb_array_length\(p_guest_items\) > 100/);
  assert.match(migration, /'rejectedPublicationIds', v_rejected/);
  assert.match(
    pgTap,
    /guest\/account merge never exceeds the 100-line cart bound/,
  );
});

test("TASK-023 pgTAP covers privacy, persistence, price drift and cleanup", () => {
  assert.match(pgTap, /select plan\(94\)/);
  for (const expected of [
    "mobile roles cannot bypass bounded cart RPCs",
    "subtotal is derived from server price",
    "ambiguous merge retry returns the prior ack",
    "price change reports old public snapshot and current server price",
    "active promotion is resolved server-side",
    "unpublished line is explicitly marked unavailable",
    "Auth account deletion cascades idempotency-ledger cleanup",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-023 concurrency harness distinguishes replay from version conflict", () => {
  assert.match(concurrencyHarness, /refuses a non-local database/);
  assert.match(concurrencyHarness, /cart_pid_a=\$!/);
  assert.match(concurrencyHarness, /cart_pid_b=\$!/);
  assert.match(concurrencyHarness, /wait "\$\{cart_pid_a\}"/);
  assert.match(concurrencyHarness, /wait "\$\{cart_pid_b\}"/);
  assert.match(
    concurrencyHarness,
    /duplicate replay 1x, optimistic winner 1x, conflict 1x, PASS/,
  );
});

test("TASK-023 staging deploy is exact-SHA guarded and reruns native cart tests", () => {
  for (const expected of [
    'expected_migration_version: "20260802210000"',
    "expected_migration_name: storefront_v1_customer_cart",
    "expected_migration_file: 20260802210000_storefront_v1_customer_cart.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260802210000'/,
  );
  assert.match(stagingWorkflow, /storefront_v1_customer_cart\.sql/);
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 94/);
  assert.match(stagingWorkflow, /serverAuthoritativeArguments/);
});
