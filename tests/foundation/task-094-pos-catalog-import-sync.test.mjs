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
    "pos_catalog_import_batches",
    'source: "supplier_excel"',
    "schemaVersion",
    "clientImportId",
    "idempotencyKey",
    "payloadHash",
    "payload_hash",
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
    "inventory_products",
    "inventory_product_prices",
    "inventory_categories",
    "inventory_suppliers",
    'type: "PURCHASE"',
    'type: "RETAIL"',
    'source: "pos_supplier_excel"',
  ]);
  assert.doesNotMatch(service, /metadata_redacted:[\s\S]{0,120}(deviceToken|sessionToken|device_token|session_token)/);
});

test("TASK-094 migration stores import batches with RLS and service-role only access", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260705120000_task_094_pos_catalog_import_sync.sql",
  );
  const databaseTypes = readProjectFile("src/lib/supabase/database.types.ts");

  assertContainsAll(migration, [
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
  assertContainsAll(databaseTypes, [
    "pos_catalog_import_batches: {",
    "client_import_id: string",
    "idempotency_key: string",
    "payload_hash: string",
    "schema_version: string",
    "source: string",
    "status: string",
    "metadata_redacted: Json",
  ]);
});
