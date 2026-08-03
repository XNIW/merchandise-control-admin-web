import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802194500_storefront_v1_customer_devices.sql",
  ),
  "utf8",
);
const pgTap = readFileSync(
  join(process.cwd(), "supabase/tests/storefront_v1_customer_devices.sql"),
  "utf8",
);
const stagingWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/storefront-v1-staging-migrations.yml"),
  "utf8",
);
const taskWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/task-022-customer-device-staging.yml"),
  "utf8",
);
const concurrencyHarness = readFileSync(
  join(
    process.cwd(),
    "scripts/testing/storefront-v1-customer-device-concurrency.sh",
  ),
  "utf8",
);

test("TASK-022 uses a random installation UUID and never hardware identity", () => {
  assert.match(migration, /installation_id uuid not null/);
  assert.match(
    migration,
    /app-generated random UUIDs; push tokens are server-only routing secrets/,
  );
  assert.doesNotMatch(
    migration.match(
      /create table public\.customer_devices[\s\S]*?\n\);/,
    )?.[0] ?? "",
    /imei|idfa|advertising|mac_address|device_fingerprint|email|oauth/i,
  );
});

test("TASK-022 keeps routing tokens server-only and outside every RPC payload", () => {
  assert.match(
    migration,
    /grant select, insert, update, delete on table public\.customer_devices\n  to service_role/,
  );
  assert.match(
    migration,
    /revoke all on table public\.customer_devices\n  from public, anon, authenticated/,
  );
  assert.match(migration, /'hasToken', p_device\.push_token is not null/);
  const payload =
    migration.match(
      /create or replace function app_private\.customer_device_public_payload_v1[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.doesNotMatch(
    payload,
    /'pushToken'|'push_token'|'pushTokenHash'|'push_token_hash'/,
  );
});

test("TASK-022 forces owner RLS and exposes only bounded authenticated RPCs", () => {
  assert.match(
    migration,
    /alter table public\.customer_devices force row level security/,
  );
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(migration, /auth\.jwt\(\) ->> 'is_anonymous'/);
  assert.doesNotMatch(
    migration,
    /raw_user_meta_data|user_metadata|auth\.role\(\)/,
  );
  assert.match(migration, /security definer\nset search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.customer_register_device_v1[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.customer_device_status_v1\(uuid\)\n    to authenticated/,
  );
});

test("TASK-022 separates app consent, OS permission and provider routing", () => {
  assert.match(
    migration,
    /consent_status in \('not_requested', 'granted', 'denied', 'revoked'\)/,
  );
  assert.match(
    migration,
    /permission_status in \([\s\S]*'not_determined',[\s\S]*'authorized',[\s\S]*'denied',[\s\S]*'provisional'/,
  );
  assert.match(migration, /push_token is null or consent_status = 'granted'/);
  assert.match(
    migration,
    /where consent_status = 'granted'\n    and permission_status in \('authorized', 'provisional'\)/,
  );
});

test("TASK-022 registration is bounded, idempotent and serialized for token dedupe", () => {
  assert.match(migration, /customer_devices_active_token_hash_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /last_idempotency_key = p_idempotency_key/);
  assert.match(migration, /'status', 'idempotency_conflict'/);
  assert.match(migration, /length\(v_token\) not between 16 and 4096/);
  assert.match(migration, /extensions\.digest\(v_token, 'sha256'\)/);
  assert.match(migration, /v_now \+ interval '90 days'/);
  assert.match(concurrencyHarness, /device_pid_a=\$!/);
  assert.match(concurrencyHarness, /device_pid_b=\$!/);
  assert.match(concurrencyHarness, /1 active token, 1 revoked route, PASS/);
  assert.match(concurrencyHarness, /refuses a non-local database/);
});

test("TASK-022 revocation and account deletion remove routing material", () => {
  assert.match(
    migration,
    /user_id uuid not null references auth\.users\(id\) on delete cascade/,
  );
  const revoke =
    migration.match(
      /create or replace function public\.customer_revoke_device_v1[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
  assert.match(revoke, /push_token = null/);
  assert.match(revoke, /push_token_hash = null/);
  assert.match(revoke, /expires_at = null/);
  assert.match(revoke, /last_operation = 'revoke'/);
});

test("TASK-022 pgTAP covers privacy, dedupe, revoke and account switching", () => {
  assert.match(pgTap, /select plan\(58\)/);
  for (const expected of [
    "no hardware or account identifier is stored",
    "token registration returns only a boolean and never echoes the secret",
    "same register idempotency key returns the prior result",
    "revoke clears routing material and expiry atomically",
    "exactly one active row owns a routing token after account switch",
    "Auth account deletion cascades customer device cleanup",
  ]) {
    assert.match(pgTap, new RegExp(expected));
  }
});

test("TASK-022 staging deploy is exact-SHA guarded and reruns native device tests", () => {
  for (const expected of [
    'expected_migration_version: "20260802194500"',
    "expected_migration_name: storefront_v1_customer_devices",
    "expected_migration_file: 20260802194500_storefront_v1_customer_devices.sql",
    "expected_head_sha: ${{ github.sha }}",
    "apply_confirmation: APPLY_STOREFRONT_V1_STAGING",
    "run_performance_load: false",
    "secrets: inherit",
  ]) {
    assert.ok(taskWorkflow.includes(expected), `missing ${expected}`);
  }
  assert.match(
    stagingWorkflow,
    /inputs\.expected_migration_version == '20260802194500'/,
  );
  assert.match(stagingWorkflow, /storefront_v1_customer_devices\.sql/);
  assert.match(stagingWorkflow, /pgTapAssertions:[\s\S]*=== 58/);
  assert.match(stagingWorkflow, /activeDeliveryPermissionFiltered/);
});
