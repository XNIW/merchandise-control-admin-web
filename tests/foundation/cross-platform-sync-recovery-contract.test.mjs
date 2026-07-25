import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath =
  "supabase/migrations/20260722013109_cross_platform_sync_event_completeness.sql";
const recoveryRuntimeLeaseMigrationPath =
  "supabase/migrations/20260722020000_task_139_recovery_runtime_lease.sql";
const posRuntimeLeaseClockMigrationPath =
  "supabase/migrations/20260722022000_task_139_pos_runtime_lease_clock.sql";
const staffWebLockoutRecoveryMigrationPath =
  "supabase/migrations/20260723050531_task_139_staff_web_lockout_recovery.sql";

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContainsAll(source, markers) {
  for (const marker of markers) {
    assert.ok(source.includes(marker), `missing invariant marker: ${marker}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("V6 rejects incomplete payloads without constraining legacy inserts", () => {
  const migration = readProjectFile(migrationPath);

  assertContainsAll(migration, [
    "app_private.sync_event_entity_ids_are_complete",
    "p_changed_count > 250",
    "v_primary_count = p_changed_count",
    "count(distinct lower(ids.value))",
    "raise exception 'sync_event_entity_ids_incomplete'",
    "to authenticated, service_role",
    "NOT VALID constraints still apply to new legacy rows",
  ]);
  assert.doesNotMatch(
    migration,
    /add constraint sync_events_(?:entity_ids_complete|sync_storage_bounded_v1|supported_operation|source_bounded|metadata_redacted|retention_envelope_v1)/i,
    "expand phase must not tighten the shared table for legacy writers",
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.sync_events\s+set\s+entity_ids\b/i,
    "historical sync event payloads must not be rewritten",
  );
  assert.doesNotMatch(
    migration,
    /validate\s+constraint\s+sync_events_entity_ids_complete/i,
    "legacy incomplete rows must remain readable for explicit recovery",
  );
});

test("manual sync-event writes hold an active profile/shop lease through replay publication", () => {
  const migration = readProjectFile(migrationPath);
  const recordSyncEvent = migration.slice(
    migration.indexOf("create or replace function public.record_sync_event_v6("),
  );

  assertContainsAll(migration, [
    "app_private.record_sync_event_writer_lease_v1",
    "profile.profile_status = 'active'",
    "member.role_key in ('shop_owner', 'shop_manager')",
    "for share;",
  ]);
  assertContainsAll(recordSyncEvent, [
    "returns jsonb",
    "to_jsonb(v_row) || jsonb_build_object('id', v_row.id::text)",
    "perform app_private.acquire_sync_event_scope_fence_v1(v_owner, p_shop_id);",
    "record_sync_event_writer_lease_v1(v_owner, p_shop_id)",
    "record_sync_event caller lease expired before idempotency replay",
  ]);
  assert.ok(
    recordSyncEvent.indexOf("perform app_private.acquire_sync_event_scope_fence_v1") <
      recordSyncEvent.indexOf("sync_event_entity_ids_belong_to_scope"),
    "the caller lease must be fenced before scope and idempotency reads",
  );
});

test("V6 sync-event expansion preserves legacy readers, Realtime and writer ABI", () => {
  const migration = readProjectFile(migrationPath);
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");

  assertContainsAll(migration, [
    "set local lock_timeout = '5s';",
    "grant select on table public.sync_events to authenticated;",
    "create or replace function public.record_sync_event_v6(",
    "grant execute on function public.record_sync_event_v6(",
    "create or replace trigger sync_events_database_atomic_scope_fence_v1",
    "when (new.source = 'database_atomic')",
    "create or replace trigger split_pos_catalog_import_sync_event",
    "auth.role() is distinct from 'service_role'",
  ]);
  assert.doesNotMatch(
    migration,
    /alter publication supabase_realtime drop table public\.sync_events/i,
  );
  assert.doesNotMatch(
    migration,
    /revoke select on table public\.sync_events/i,
  );
  assert.doesNotMatch(
    migration,
    /create trigger cross_platform_00_sync_event_scope_fence_guard/i,
  );
  assert.doesNotMatch(migration, /drop index if exists/i);
  assertContainsAll(databaseTypes, [
    "record_sync_event: {",
    "record_sync_event_v6: {",
  ]);
});

test("checkpoint and convergence marker share the writer fence before maxId and digests", () => {
  const migration = readProjectFile(migrationPath);
  const checkpointStart = migration.indexOf(
    "create or replace function public.shop_sync_recovery_checkpoint_v1(",
  );
  const checkpointEnd = migration.indexOf(
    "create or replace function public.shop_sync_convergence_marker_v1(",
    checkpointStart,
  );
  const checkpoint = migration.slice(checkpointStart, checkpointEnd);
  const fence = checkpoint.indexOf(
    "perform app_private.acquire_sync_event_scope_fence_v1(",
  );
  const maxId = checkpoint.indexOf(
    "v_event_max_id := app_private.shop_sync_scope_event_max_id_v1(",
  );

  assert.ok(fence >= 0 && maxId > fence);
  assert.match(
    migration.slice(checkpointEnd),
    /v_checkpoint := public\.shop_sync_recovery_checkpoint_v1\(/,
  );
});

test("V6 UUID validation accepts canonical nil and version 7 values", () => {
  const migration = readProjectFile(migrationPath);

  assert.ok(
    migration.includes(
      "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    ),
  );
  assert.doesNotMatch(
    migration,
    /\[1-5\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}/i,
  );
  for (const value of [
    "00000000-0000-0000-0000-000000000000",
    "018f3f5e-8b7a-7abc-8123-0123456789ab",
  ]) {
    assert.match(
      value,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  }
});

test("POS runtime lease preflight delegates revocation and expiry to the canonical locked lease", () => {
  const migration = readProjectFile(migrationPath);

  assertContainsAll(migration, [
    "create or replace function public.pos_runtime_lease_v1",
    "app_private.pos_runtime_lease_is_valid_v1(",
    "'revoked_at', session_row.revoked_at",
    "'revoked_at', credential.revoked_at",
    "'revoked_at', device.revoked_at",
  ]);
});

test("staff web lockout recovery is temporary, atomic and preserves the lock order", () => {
  const migration = readProjectFile(staffWebLockoutRecoveryMigrationPath);
  const staffAuth = readProjectFile("src/server/shop-admin/staff-web-auth.ts");

  assertContainsAll(migration, [
    "v_expired_temporary_lock boolean := false",
    "v_staff.credential_status = 'locked'",
    "v_staff.locked_until is not null",
    "v_staff.locked_until <= now()",
    "perform pg_advisory_xact_lock(hashtextextended('staff-web-attempt:' || p_attempt_key_hash, 0));",
    "for update;",
    "returning staff.* into v_staff;",
  ]);
  assert.match(
    migration,
    /v_attempt\.locked_until is not null[\s\S]*v_attempt\.locked_until > now\(\)[\s\S]*v_staff\.credential_status = 'active'[\s\S]*v_staff\.locked_until is null/,
    "only an explicit active staff state can supersede stale attempt telemetry",
  );
  const commitStart = migration.indexOf(
    "create or replace function public.staff_web_login_commit_v1",
  );
  const attemptGate = migration.indexOf(
    "if v_attempt.locked_until is not null",
    commitStart,
  );
  const normalizeAtSuccessBoundary = migration.indexOf(
    "A temporary lock becomes active only at this final success boundary.",
    commitStart,
  );
  assert.ok(
    commitStart >= 0 &&
      attemptGate > commitStart &&
      normalizeAtSuccessBoundary > attemptGate,
    "an expired lock must remain durable until all final eligibility and attempt gates pass",
  );
  assert.match(
    staffAuth,
    /staffStateOverridesAttemptLock[\s\S]*credentialStatus === "active"[\s\S]*lockedUntil === null/,
    "the client honors only the server-projected active/null override",
  );
});

test("final POS lease publication rechecks expiry after all runtime locks", () => {
  const migration = readProjectFile(posRuntimeLeaseClockMigrationPath);

  assertContainsAll(migration, [
    "v_checked_at timestamptz",
    "v_checked_at := clock_timestamp();",
    "Lock every mutable lease component first.",
    "credential.expires_at > v_checked_at",
    "session_row.expires_at > v_checked_at",
    "staff.credential_expires_at > v_checked_at",
    "staff.locked_until <= v_checked_at",
    "for share;",
  ]);
  assert.doesNotMatch(
    migration,
    /expires_at\s*>\s*now\(\)|locked_until\s*<=\s*now\(\)/i,
    "post-lock lease expiry must never use transaction-start now()",
  );
});

test("POS chunking is service-role-only and leaves legacy RPC writes unchanged", () => {
  const migration = readProjectFile(migrationPath);

  assertContainsAll(migration, [
    "app_private.split_pos_catalog_import_sync_event",
    "new.source is distinct from 'pos_catalog_import_sync'",
    "when 'prices' then 100 else 250",
    "v_chunk_count := ceil(v_primary_count / v_chunk_size::numeric)::integer",
    "price.owner_user_id = new.owner_user_id",
    "price.shop_id = new.shop_id",
    "'product_ids', v_reference_product_ids",
    "when unique_violation then",
    "sync_event_client_event_id_conflict",
    "return null;",
    "create or replace trigger split_pos_catalog_import_sync_event",
    "auth.role() is distinct from 'service_role'",
  ]);
});

test("every mutation is atomically paired with a complete statement-level event", () => {
  const migration = readProjectFile(migrationPath);

  assertContainsAll(migration, [
    "app_private.emit_atomic_sync_events_statement_v1",
    "referencing new table as new_rows for each statement",
    "v_chunk_end := least(v_chunk_start + 249",
    "'atomic_trigger', true",
    "'inventory_suppliers'",
    "'inventory_categories'",
    "'inventory_products'",
    "'inventory_product_prices'",
    "'shared_sheet_sessions'",
  ]);
});

test("Admin row writes publish bounded events in the database transaction", () => {
  const writer = readProjectFile(
    "src/server/shop-admin/sync-event-writer.ts",
  );
  const migration = readProjectFile(migrationPath);

  assertContainsAll(writer, [
    "Catalog, price and history row mutations are published by statement-level",
    "database triggers in the same transaction",
    "void input;",
    "return { ok: true };",
  ]);
  assertContainsAll(migration, [
    "app_private.emit_atomic_sync_events_statement_v1",
    "when v_domain='history' then 25",
    "when v_domain='prices' then 100",
    "else 250",
    "'inventory_product_prices'",
    "'shared_sheet_sessions'",
  ]);
  assert.doesNotMatch(
    writer,
    /\.from\(["']sync_events["']\)\s*\.insert/,
    "Admin must not depend on a direct service-role sync_events INSERT grant",
  );
  assert.doesNotMatch(writer, /record_shop_sync_event_service_v1/);
});

test("recovery readers share an authenticated shop/device scope and strong checkpoint", () => {
  const migration = readProjectFile(migrationPath);
  const recoveryRuntimeLeaseMigration = readProjectFile(
    recoveryRuntimeLeaseMigrationPath,
  );
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");

  assertContainsAll(migration, [
    "app_private.resolve_shop_sync_recovery_scope",
    "public.shop_sync_recovery_checkpoint_v1",
    "public.shop_sync_recovery_page_v1",
    "public.shop_sync_event_page_v1",
    "public.shop_sync_rows_by_ids_v1",
    "shop-sync-recovery-checkpoint-v1",
    "app_private.is_active_shop_catalog_writer(p_shop_id)",
    "shop sync recovery requires an active device lease",
    "shop_sync_recovery_scope_unresolved",
    "'shop_scoped'",
    "'legacy_owner_bridge'",
    "when v_has_shop_catalog_rows and v_has_legacy_catalog_rows",
    "when v_has_shop_catalog_rows or v_mapped_owner_id is null",
    "authorized_legacy_owner_id := v_mapped_owner_id",
    "history_scope_kind := case",
    "inventory_products_shop_recovery_id_idx",
    "shared_sheet_sessions_legacy_recovery_uuid_v2_idx",
    "sync_events_shop_recovery_id_idx",
    "legacyOwnerKey",
    "deviceKey",
    "maxId",
    "idSetDigest",
    "identityDigest",
    "versionDigest",
    "totalViolationCount",
    "checkpointDigest",
    "checkpoint_digest_matches",
    "to authenticated",
  ]);
  assertContainsAll(databaseTypes, [
    "shop_sync_recovery_checkpoint_v1: {",
    "p_device_identifier: string",
    "p_expected_baseline_scope_key?: string | null",
    "p_verified_baseline_id?: string",
    "shop_sync_recovery_page_v1: {",
    "shop_sync_event_page_v1: {",
    "shop_sync_rows_by_ids_v1: {",
    "p_expected_domain_event_max_id?: string | null",
    "p_expected_event_max_id?: string | null",
    "p_expected_scope_key?: string | null",
    "p_entity_ids: string[]",
    "Returns: Json",
  ]);
  assert.doesNotMatch(migration, /signed[_-]?url|access[_-]?token|refresh[_-]?token/i);
  assertContainsAll(recoveryRuntimeLeaseMigration, [
    "create or replace function app_private.resolve_shop_sync_recovery_scope",
    "language plpgsql\nvolatile",
    "Fixed lock order: shop -> profile -> membership -> device -> catalog",
    "from public.shops shop",
    "from public.profiles profile",
    "from public.shop_members member",
    "from public.shop_devices device",
    "perform app_private.lock_catalog_scope_pair_v1",
    "from public.shop_inventory_sources source",
    "for share;",
    "alter function public.shop_sync_recovery_checkpoint_v1(uuid, text, text, text)\n  volatile;",
    "alter function public.shop_sync_convergence_marker_v1(uuid, text, text, text)\n  volatile;",
    "alter function public.shop_sync_recovery_page_v1",
    "alter function public.shop_sync_rows_by_ids_v1",
    "alter function public.shop_sync_event_page_v1",
  ]);
});

test("image recovery digests bind a canonical product tombstone at activation", () => {
  const migration = readProjectFile(migrationPath);
  const pgtap = readProjectFile(
    "supabase/tests/cross_platform_sync_recovery_contract.sql",
  );

  assert.match(
    migration,
    /'versionDigest'[\s\S]*lower\(scoped_product_id::text\)[\s\S]*status \|\| E'\\x1f'[\s\S]*sync_checkpoint_timestamp\(product_deleted_at\)/,
    "the image version digest must change when the product image becomes a tombstone",
  );
  assertContainsAll(pgtap, [
    "image_tombstone_checkpoint",
    "an image tombstone preserves its scoped product identity set",
    "an image tombstone changes the canonical image version digest even when identity is unchanged",
    "image tombstone recovery rows expose a canonical product_deleted_at marker",
    "checkpointDigest",
  ]);
});

test("snapshot and targeted rows expose digest-relevant timestamps in canonical UTC6", () => {
  const migration = readProjectFile(migrationPath);

  assertContainsAll(migration, [
    "app_private.sync_checkpoint_json_timestamp",
    "'updated_at', app_private.sync_checkpoint_json_timestamp",
    "'deleted_at', app_private.sync_checkpoint_json_timestamp",
    "'primary_image_updated_at'",
    "'finalized_at'",
    "'created_at', p_created_at",
    `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`,
  ]);
});

test("cross-platform digest vectors use UTF-8, LF, unit separator and UTC microseconds", () => {
  const id = "20000000-0000-4000-8000-000000000001";
  const supplierVersion = [id, "2026-07-21T12:34:56.123456Z", "-"].join(
    "\u001f",
  );

  assert.equal(
    sha256(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    sha256(id),
    "95eb2692c90eaa3e066bb815cdc4e78da52fec0b7cdb3cfe3ddd4220b947a4dd",
  );
  assert.equal(
    sha256(supplierVersion),
    "920425d6c0dfbf5e957ca1c0a6d352b287c869755b958f86ffdd8abd0c17fad0",
  );
});

test("Admin mutation RPC completions are bound to the requested shop and target", () => {
  const catalog = readProjectFile("src/server/shop-admin/catalog-mutations.ts");
  const staffCatalog = readProjectFile(
    "src/server/shop-admin/staff-aware-mutations.ts",
  );
  const history = readProjectFile("src/server/shop-admin/history-mutations.ts");

  assertContainsAll(catalog, [
    "result.shopId === context.selectedShop.shopId",
    'result.ok === (result.code === "success")',
    "expectedTargetId === undefined || result.targetId === expectedTargetId",
  ]);
  assertContainsAll(staffCatalog, [
    "root.shop_id === context.selectedShop.shopId",
    "createRequiresTarget",
    "CANONICAL_UUID_PATTERN.test(result.targetId)",
  ]);
  assertContainsAll(history, [
    "staffHistoryResultIsBound",
    "result.shopId === context.selectedShop.shopId",
    "expectedTarget === undefined || result.targetId === expectedTarget",
  ]);
});

test("Admin service-role reads and recovery writes revalidate at publication", () => {
  const dataAccess = readProjectFile("src/server/shop-admin/data-access.ts");
  const live = readProjectFile("src/server/shop-admin/pos-live-read-model.ts");
  const revenue = readProjectFile(
    "src/server/shop-admin/pos-revenue-read-model.ts",
  );
  const recovery = readProjectFile(
    "src/server/shop-admin/pos-sync-recovery-read-model.ts",
  );
  const mutation = readProjectFile(
    "src/server/shop-admin/pos-sync-recovery-mutations.ts",
  );
  const mutationFence = readProjectFile(
    "supabase/migrations/20260723053000_task_139_pos_recovery_action_fence.sql",
  );

  assertContainsAll(dataAccess, [
    "revalidateShopAdminDataAccessForPublish",
    "resolveCurrentShopAdminPrincipal(access.supabase)",
    "resolveStaffWebSessionPrincipal()",
    "refreshedSession.sessionTokenHash === previousSession.sessionTokenHash",
  ]);
  for (const source of [live, revenue, recovery]) {
    assert.match(source, /await revalidateShopAdminDataAccessForPublish/);
  }
  assertContainsAll(mutation, [
    'adminClient.rpc(\n    "shop_pos_recovery_action_v1"',
    "p_actor_profile_id: context.actorProfileId",
    "p_shop_id: context.selectedShop.shopId",
    "p_target_id: target.id",
  ]);
  assert.doesNotMatch(
    mutation,
    /\.from\(["'](?:pos_sales|pos_sales_sync_batches|pos_sale_stock_movements|audit_logs)["']\)/,
  );
  assertContainsAll(mutationFence, [
    "create or replace function public.shop_pos_recovery_action_v1(",
    "for share;",
    "insert into public.audit_logs",
    "grant execute on function public.shop_pos_recovery_action_v1",
  ]);
});

test("staff lifecycle and device writes use one final lease-fenced RPC boundary", () => {
  const staffMutations = readProjectFile(
    "src/server/shop-admin/staff-aware-mutations.ts",
  );
  const lifecycleMigration = readProjectFile(
    "supabase/migrations/20260722023000_task_139_staff_web_lifecycle_lease.sql",
  );
  const leaseBoundRpc = readProjectFile(
    "src/server/shop-admin/staff-web-lease-bound-rpc.ts",
  );
  const lifecycleTail = staffMutations.slice(
    staffMutations.indexOf("export async function createStaffAsStaff"),
  );

  assertContainsAll(staffMutations, [
    "callStaffWebLifecycleMutation(context, operation, payload)",
    "result.shopId === context.selectedShop.shopId",
    "const targetIsBound",
    '"staff_role_permissions_replace"',
    '"device_status_set"',
  ]);
  assertContainsAll(leaseBoundRpc, [
    'supabase.rpc("staff_web_lifecycle_mutate_v1"',
    "p_expected_credential_version: context.staffWebSession.credentialVersion",
    "p_session_token_hash: context.staffWebSession.sessionTokenHash",
    "p_staff_web_session_id: context.staffWebSession.sessionId",
  ]);
  assert.doesNotMatch(
    lifecycleTail,
    /\.from\(["'](?:staff_accounts|staff_web_sessions|staff_role_permissions|shop_devices)["']\)/,
    "staff lifecycle tails must not race a service-role table mutation after an application preflight",
  );
  assertContainsAll(lifecycleMigration, [
    "app_private.personal_shop_admin_lifecycle_lease_is_valid_v1",
    "public.staff_web_lifecycle_mutate_v1",
    "app_private.staff_web_runtime_lease_is_valid_v1",
    "staff web lifecycle lease expired before publication",
    "personal lifecycle lease expired before publication",
    "staff_role_permissions_replace",
    "device_register",
    "grant execute on function public.staff_web_lifecycle_mutate_v1",
  ]);
});

test("staff audit and device compatibility endpoints retain exact lease and role boundaries", () => {
  const staffMutations = readProjectFile(
    "src/server/shop-admin/staff-aware-mutations.ts",
  );
  const importExport = readProjectFile(
    "src/server/shop-admin/import-export-workbook.ts",
  );
  const lifecycleMigration = readProjectFile(
    "supabase/migrations/20260722023000_task_139_staff_web_lifecycle_lease.sql",
  );
  const leaseBoundRpc = readProjectFile(
    "src/server/shop-admin/staff-web-lease-bound-rpc.ts",
  );
  const mobileRegistration = lifecycleMigration.slice(
    lifecycleMigration.lastIndexOf(
      "create or replace function public.shop_device_register_for_shop(",
    ),
  );

  assertContainsAll(staffMutations, [
    "callStaffWebAuditEvent(context, {",
    "result.targetId === (input.targetId ?? undefined)",
  ]);
  assertContainsAll(leaseBoundRpc, [
    'supabase.rpc("staff_web_audit_event_v1"',
    "p_expected_credential_version: context.staffWebSession.credentialVersion",
    "p_required_permission: input.requiredPermission",
  ]);
  assert.doesNotMatch(
    staffMutations,
    /\.from\(["']audit_logs["']\)\s*\.insert/,
    "staff audit writes must not escape the lease-bound RPC through a direct table insert",
  );
  assertContainsAll(importExport, [
    "requiredPermission: permission",
    '"catalog.import"',
    '"catalog.export"',
  ]);
  assertContainsAll(lifecycleMigration, [
    "create or replace function public.staff_web_audit_event_v1",
    "app_private.staff_web_runtime_lease_is_valid_v1(",
    "staff_web_runtime_lease_publishable_v1()",
    "create or replace function app_private.personal_shop_owner_lifecycle_lease_is_valid_v1",
    "v_personal_requires_owner := p_operation in",
    "create or replace function app_private.shop_device_mobile_enroll_v1",
    "p_require_current_owner_mapping boolean default false",
    "v_device_type <> 'mobile'",
    "app_private.device_metadata_is_persisted_v1",
    "app_private.enforce_shop_device_metadata_redacted_v1",
    "create trigger shop_devices_metadata_redacted_persisted_v1_trigger",
    "alter column metadata_redacted set storage external",
    "sync_jsonb_storage_is_bounded_v1(\n          v_metadata, 8192, 0\n        ) is not true",
    "from public, anon, authenticated, service_role;",
  ]);
  assertContainsAll(mobileRegistration, [
    "app_private.shop_device_mobile_enroll_v1(",
    "p_app_version, p_metadata, false",
  ]);
  assert.doesNotMatch(
    mobileRegistration,
    /return\s+public\.shop_device_register\s*\(/,
    "selected-shop mobile registration must not re-enter the owner-only Admin RPC",
  );

  const deviceRegistry = readProjectFile(
    "src/app/shop/_components/DeviceRegistryView.tsx",
  );
  assertContainsAll(deviceRegistry, [
    "function metadataString(value: unknown, key = \"\", depth = 0)",
    "if (depth >= 4)",
    "metadataString(childValue, childKey, depth + 1)",
    "JSON.stringify(metadataString(row.metadataRedacted))",
  ]);
});
