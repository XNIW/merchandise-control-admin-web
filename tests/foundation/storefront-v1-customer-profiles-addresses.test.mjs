import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802181823_storefront_v1_customer_profiles_addresses.sql",
  ),
  "utf8",
);
const pgTap = readFileSync(
  join(
    process.cwd(),
    "supabase/tests/storefront_v1_customer_profiles_addresses.sql",
  ),
  "utf8",
);
const stagingWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/storefront-v1-staging-migrations.yml"),
  "utf8",
);
const taskWorkflow = readFileSync(
  join(
    process.cwd(),
    ".github/workflows/task-021-customer-profile-staging.yml",
  ),
  "utf8",
);

test("TASK-021 separates customer identity from Admin profiles and email", () => {
  for (const table of [
    "customer_profiles",
    "customer_addresses",
    "customer_account_deletion_requests",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }
  assert.match(
    migration,
    /user_id uuid primary key default auth\.uid\(\)[\s\S]*references auth\.users\(id\)/,
  );
  assert.doesNotMatch(
    migration.match(
      /create table public\.customer_profiles[\s\S]*?\n\);/,
    )?.[0] ?? "",
    /email|oauth|password|token|credential|secret/i,
  );
});

test("TASK-021 forces owner-only RLS and denies anonymous Auth identities", () => {
  for (const table of [
    "customer_profiles",
    "customer_addresses",
    "customer_account_deletion_requests",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`),
    );
  }
  assert.match(
    migration,
    /to authenticated[\s\S]*\(select auth\.uid\(\)\) = user_id/,
  );
  assert.match(migration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/);
});

test("TASK-021 keeps server-owned identity, consent time and default selection immutable", () => {
  assert.match(
    migration,
    /grant insert \([\s\S]*display_name,[\s\S]*locale[\s\S]*\) on table public\.customer_profiles/,
  );
  assert.doesNotMatch(
    migration.match(
      /grant insert \([\s\S]*?\) on table public\.customer_profiles/,
    )?.[0] ?? "",
    /user_id|privacy_consented_at/,
  );
  assert.doesNotMatch(
    migration.match(
      /grant update \([\s\S]*?\) on table public\.customer_addresses/,
    )?.[0] ?? "",
    /user_id|is_default/,
  );
  assert.match(migration, /customer_record_privacy_consent_v1/);
  assert.match(migration, /customer_addresses_one_default_per_user_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("TASK-021 hardens privileged functions and exposes only authenticated RPC grants", () => {
  for (const rpc of [
    "customer_record_privacy_consent_v1",
    "customer_set_default_address_v1",
    "customer_request_account_deletion_v1",
    "customer_cancel_account_deletion_v1",
    "customer_data_export_v1",
  ]) {
    assert.match(migration, new RegExp(rpc));
  }
  assert.match(migration, /security definer\nset search_path = ''/);
  assert.match(migration, /security invoker\nset search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.customer_[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.customer_[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /to authenticated, service_role/);
});

test("TASK-021 export and deletion contracts are allow-listed and idempotent", () => {
  assert.match(migration, /'apiVersion', 'customer\.v1'/);
  assert.match(migration, /customer_account_deletion_idempotency_unique/);
  assert.match(migration, /customer_account_deletion_one_active_idx/);
  assert.match(migration, /'accountDeletionRequests'/);
  assert.doesNotMatch(
    migration.match(
      /create or replace function public\.customer_data_export_v1\([\s\S]*?\n\$\$;/,
    )?.[0] ?? "",
    /auth\.users|email|raw_app_meta_data|raw_user_meta_data|idempotency_key/i,
  );
});

test("TASK-021 pgTAP covers owner, cross-user, invalid, anonymous and privacy flows", () => {
  assert.match(pgTap, /select plan\(64\)/);
  for (const expected of [
    "second owner cannot read the first profile",
    "cross-user update left the first profile unchanged",
    "cross-user delete left both first-owner addresses intact",
    "anonymous Auth identity is denied by owner RLS",
    "same idempotency key returns the same deletion request",
    "owner can revoke privacy consent explicitly",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-021 staging deploy is exact-SHA guarded and reruns native ownership tests", () => {
  for (const expected of [
    'expected_migration_version: "20260802181823"',
    "expected_migration_name: storefront_v1_customer_profiles_addresses",
    "expected_migration_file: 20260802181823_storefront_v1_customer_profiles_addresses.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260802181823'/,
  );
  assert.match(
    stagingWorkflow,
    /storefront_v1_customer_profiles_addresses\.sql/,
  );
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 64/);
  assert.match(stagingWorkflow, /pgTapNoFailures:[\s\S]*!\/\^not ok \/m/);
  assert.match(stagingWorkflow, /migrationLedgerExact/);
  assert.match(
    stagingWorkflow,
    /if: inputs\.mode == 'apply' && inputs\.run_performance_load/,
  );
});
