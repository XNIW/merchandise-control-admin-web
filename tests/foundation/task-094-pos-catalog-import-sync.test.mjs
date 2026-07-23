import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContainsAll(source, values) {
  for (const value of values) {
    assert.match(
      source,
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `missing invariant marker: ${value}`,
    );
  }
}

test("TASK-094 POS catalog import sync route keeps server-only POS JSON boundary", () => {
  const route = readProjectFile("src/app/api/pos/catalog/import-sync/route.ts");

  assertContainsAll(route, [
    'export const dynamic = "force-dynamic"',
    'export const runtime = "nodejs"',
    "MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES",
    "handlePosCatalogImportSync",
    "readPosJsonBody",
    "posJsonResponse",
    "posMethodNotAllowedResponse",
    "createPosRouteRequestContext",
    'createPosRouteRequestContext(request, "pos.catalog.import_sync")',
    "clientRequestId",
    "requestId",
    'code: "db_failure"',
    "POS request failed.",
    "methodNotAllowed as DELETE",
    "methodNotAllowed as GET",
    "methodNotAllowed as HEAD",
    "methodNotAllowed as OPTIONS",
    "methodNotAllowed as PATCH",
    "methodNotAllowed as PUT",
  ]);
  assert.doesNotMatch(
    route,
    /createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|credential_hash|service_role/i,
  );
});

test("TASK-094 catalog import service validates POS auth, idempotency and catalog writes", () => {
  const service = readProjectFile("src/server/pos-auth/catalog-import-sync.ts");
  const contract = readProjectFile("src/server/pos-auth/pos-contract.ts");

  assertContainsAll(contract, [
    'POS_CATALOG_IMPORT_SCHEMA_VERSION = "pos-catalog-import-v1"',
  ]);
  assertContainsAll(service, [
    'import "server-only"',
    "MAX_POS_CATALOG_IMPORT_JSON_BODY_BYTES = 512 * 1024",
    "POS_CATALOG_IMPORT_SCHEMA_VERSION",
    "verifyPosSecret",
    'source: "supplier_excel"',
    "schemaVersion",
    "clientImportId",
    "idempotencyKey",
    "attemptCount",
    "payloadHash",
    "payload_hash",
    "declaredPayloadHash",
    "pos_catalog_import_apply_v2",
    "conflict",
    "sourceFileNameIsSafe",
    "SENSITIVE_TEXT_PATTERN",
    'cf_ray_present: true',
    'event_key:',
    'pos.catalog.import_sync.success',
    'pos.catalog.import_sync.failure',
    "shop_inventory_sources",
    ".eq(\"shop_id\", session.shop_id)",
    ".eq(\"shop_device_id\", session.shop_device_id)",
    "buildPosShopPayload(input.shop)",
    "remoteProductIds",
    "remotePriceIds",
    "serverImportId",
    "serverRequestId",
    "input.parsed.attemptCount",
    "input.parsed.declaredPayloadHash ?? input.parsed.payloadHash",
    "pullRequired",
    'nextAction: "catalog_pull"',
  ]);
  assert.doesNotMatch(
    service,
    /\.from\("inventory_(products|product_prices|categories|suppliers)"\)[\s\S]{0,200}\.(insert|update|upsert|delete)/,
    "catalog writes must stay inside the transactional RPC",
  );
  assert.doesNotMatch(service, /metadata_redacted:[\s\S]{0,120}(deviceToken|sessionToken|device_token|session_token)/);
});

test("TASK-094 migrations store import batches and apply them transactionally", () => {
  const ledgerMigration = readProjectFile(
    "supabase/migrations/20260705120000_task_094_pos_catalog_import_sync.sql",
  );
  const applyMigration = readProjectFile(
    "supabase/migrations/20260706120000_task_094_pos_catalog_import_apply_rpc.sql",
  );
  const ackReplayMigration = readProjectFile(
    "supabase/migrations/20260706143000_task_094_pos_catalog_import_ack_replay.sql",
  );
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");

  assertContainsAll(ledgerMigration, [
    "create table if not exists public.pos_catalog_import_batches",
    "client_import_id",
    "idempotency_key",
    "payload_hash",
    "schema_version text not null default 'pos-catalog-import-v1'",
    "source text not null default 'supplier_excel'",
    "status text not null default 'accepted'",
    "unique (shop_id, shop_device_id, client_import_id)",
    "unique (shop_id, shop_device_id, idempotency_key)",
    "alter table public.pos_catalog_import_batches enable row level security",
    "alter table public.pos_catalog_import_batches force row level security",
    "revoke all on table public.pos_catalog_import_batches from anon",
    "revoke all on table public.pos_catalog_import_batches from authenticated",
    "grant all on table public.pos_catalog_import_batches to service_role",
    "commit;",
  ]);
  assertContainsAll(applyMigration, [
    "create or replace function public.pos_catalog_import_apply_v1",
    "pg_advisory_xact_lock",
    "for update",
    "public.pos_catalog_import_batches",
    "public.inventory_products",
    "public.inventory_product_prices",
    "public.inventory_categories",
    "public.inventory_suppliers",
    "on conflict on constraint inventory_product_prices_owner_product_type_effective_uniq",
    "insert into public.sync_events",
    "insert into public.audit_logs",
    "'remoteProductIds'",
    "'remotePriceIds'",
    "revoke all on function public.pos_catalog_import_apply_v1",
    "grant execute on function public.pos_catalog_import_apply_v1",
    "to service_role",
    "commit;",
  ]);
  assertContainsAll(ackReplayMigration, [
    "add column if not exists ack_response jsonb not null default '{}'::jsonb",
    "create or replace function public.pos_catalog_import_apply_v2",
    "pg_advisory_xact_lock",
    "hashtext(p_client_import_id)",
    "hashtext(p_idempotency_key)",
    "ack_response",
    "public.pos_catalog_import_apply_v1",
    "set ack_response = v_result",
    "grant execute on function public.pos_catalog_import_apply_v2",
    "to service_role",
    "commit;",
  ]);
  assert.match(
    ackReplayMigration,
    /if v_existing\.status in \('accepted', 'duplicate', 'idempotent'\)[\s\S]*ack_response[\s\S]*return jsonb_set/,
    "duplicate ACKs must replay the persisted ACK response instead of reconstructing from mutable catalog rows",
  );
  assert.doesNotMatch(
    applyMigration,
    /insert into public\.sync_events[\s\S]{0,800}values\s*\([\s\r\n]*p_client_import_id,/,
    "sync_events.batch_id must use the server UUID batch id, not the non-UUID POS clientImportId",
  );
  assertContainsAll(databaseTypes, [
    "pos_catalog_import_batches: {",
    "pos_catalog_import_apply_v1: {",
    "client_import_id: string",
    "idempotency_key: string",
    "payload_hash: string",
    "schema_version: string",
    "source: string",
    "status: string",
    "metadata_redacted: Json",
    "ack_response: Json",
    "pos_catalog_import_apply_v2: {",
  ]);
});

test("TASK-094 staging E2E harness proves positive catalog import without leaking secrets", () => {
  const packageJson = readProjectFile("package.json");
  const ciWorkflow = readProjectFile(".github/workflows/ci.yml");
  const harness = readProjectFile("scripts/pos-catalog-import-staging-e2e.mjs");
  const workflow = readProjectFile(".github/workflows/task-094-staging-e2e.yml");

  assertContainsAll(packageJson, [
    "test:pos-catalog-import-staging-e2e",
    "scripts/run-with-env.mjs",
    "TASK094_POS_E2E_ALLOW_STAGING=yes",
    "scripts/pos-catalog-import-staging-e2e.mjs",
  ]);
  assertContainsAll(harness, [
    "TASK094_POS_E2E_ALLOW_STAGING",
    "TASK094_POS_E2E_STAGING_HOST_ALLOWLIST",
    "TASK094_POS_E2E_STAGING_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "POST",
    "/api/pos/catalog/import-sync",
    "/api/pos/catalog/pull",
    "method_not_allowed",
    "validation_failed",
    "auth_denied",
    "accepted",
    "duplicate",
    "conflict",
    "pos_catalog_import_batches",
    "ackResponseStored",
    "syncEventDomains",
    "cleanupTask094",
    "verifyTask094Cleanup",
    "platform_create_shop",
    "platform_soft_delete_shop",
    "shop_staff_create",
  ]);
  assertContainsAll(workflow, [
    "TASK-094 Staging E2E",
    "workflow_dispatch",
    "cloudflare-staging",
    "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    "Verify TASK-094 migration files before live E2E",
    "20260705120000_task_094_pos_catalog_import_sync.sql",
    "20260706120000_task_094_pos_catalog_import_apply_rpc.sql",
    "20260706143000_task_094_pos_catalog_import_ack_replay.sql",
    "npm run test:pos-catalog-import-staging-e2e",
  ]);
  assertContainsAll(ciWorkflow, [
    "TASK-094 staging E2E",
    "github.event_name == 'workflow_dispatch'",
    "environment: cloudflare-staging",
    "TASK-094 catalog import staging E2E",
    "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    "Verify TASK-094 migration files before live E2E",
    "20260705120000_task_094_pos_catalog_import_sync.sql",
    "20260706120000_task_094_pos_catalog_import_apply_rpc.sql",
    "20260706143000_task_094_pos_catalog_import_ack_replay.sql",
    "npm run test:pos-catalog-import-staging-e2e",
  ]);
  assert.doesNotMatch(
    harness,
    /\.delete\(|deleteUser|console\.log\([^)]*(SUPABASE_SERVICE_ROLE_KEY|sessionToken|deviceToken|trustedDeviceToken|mcpos_)/,
    "TASK-094 staging harness must use soft cleanup and must not print secrets",
  );
  assert.doesNotMatch(
    harness,
    /\.from\("shops"\)\s*\.insert|\.from\("shops"\)\s*\.update|\.from\("staff_accounts"\)\s*\.insert/,
    "TASK-094 must use audited authenticated RPCs across TASK-140 boundaries",
  );
  assert.doesNotMatch(
    workflow,
    /SUPABASE_DB_PASSWORD|echo\s+\$SUPABASE_SERVICE_ROLE_KEY|console\.log\(process\.env\.SUPABASE_SERVICE_ROLE_KEY\)/,
    "TASK-094 workflow must not print service-role secrets",
  );
  assert.doesNotMatch(
    ciWorkflow,
    /SUPABASE_DB_PASSWORD|echo\s+\$SUPABASE_SERVICE_ROLE_KEY|console\.log\(process\.env\.SUPABASE_SERVICE_ROLE_KEY\)/,
    "CI workflow must not print Supabase secrets",
  );
});
