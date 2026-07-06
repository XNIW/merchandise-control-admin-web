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

test("TASK-100 Admin catalog mutations use atomic sync-event RPC wrappers", () => {
  const mutations = readProjectFile("src/server/shop-admin/catalog-mutations.ts");
  const dbTypes = readProjectFile("src/lib/supabase/database.types.ts");

  assertContainsAll(mutations, [
    "shop_catalog_create_supplier_with_sync",
    "shop_catalog_update_supplier_with_sync",
    "shop_catalog_archive_supplier_with_sync",
    "shop_catalog_create_category_with_sync",
    "shop_catalog_update_category_with_sync",
    "shop_catalog_archive_category_with_sync",
    "shop_catalog_create_product_with_sync",
    "shop_catalog_update_product_with_sync",
    "shop_catalog_archive_product_with_sync",
    "shop_catalog_restore_product_with_sync",
    "p_actor_kind: context.principalKind",
  ]);
  assert.doesNotMatch(
    mutations,
    /return withSyncEvent\(mapShopAdminRpcResult\(data\)\)/,
    "personal-account catalog RPCs must not rely on a post-commit sync_event write",
  );
  assertContainsAll(dbTypes, [
    "shop_catalog_create_supplier_with_sync: {",
    "shop_catalog_update_supplier_with_sync: {",
    "shop_catalog_archive_supplier_with_sync: {",
    "shop_catalog_create_category_with_sync: {",
    "shop_catalog_update_category_with_sync: {",
    "shop_catalog_archive_category_with_sync: {",
    "shop_catalog_create_product_with_sync: {",
    "shop_catalog_update_product_with_sync: {",
    "shop_catalog_archive_product_with_sync: {",
    "shop_catalog_restore_product_with_sync: {",
    "p_actor_kind?: string",
  ]);
});

test("TASK-100 migration is additive, atomic and locked down", () => {
  const migration = readProjectFile(
    "supabase/migrations/20260706160300_task_100_admin_sync_atomic_catalog.sql",
  );
  const docs = readProjectFile("docs/POS_SYNC_ARCHITECTURE.md");

  assertContainsAll(migration, [
    "TASK-100 - Admin catalog mutations emit sync_events atomically",
    "create or replace function app_private.shop_catalog_emit_sync_for_result",
    "insert into public.sync_events",
    "'atomic_rpc', true",
    "jsonb_build_object(v_entity_ids_key, jsonb_build_array(v_target_id))",
    "catalog_tombstone",
    "catalog_changed",
    "when unique_violation then",
    "shop_catalog_create_product_with_sync",
    "shop_catalog_update_product_with_sync",
    "shop_catalog_archive_product_with_sync",
    "shop_catalog_restore_product_with_sync",
    "revoke all on function public.shop_catalog_create_product_with_sync",
    "grant execute on function public.shop_catalog_create_product_with_sync",
    "to authenticated, service_role",
    "notify pgrst, 'reload schema'",
  ]);
  assert.doesNotMatch(
    migration,
    /\b(delete\s+from|truncate\s+table|drop\s+table)\b/i,
    "TASK-100 migration must not destructively delete production business data",
  );
  assertContainsAll(docs, [
    "TASK-100",
    "Admin Web personal-account catalog CRUD",
    "catalog row, audit result and `sync_events` write in one PostgreSQL transaction",
    "`*_with_sync` RPC wrappers",
  ]);
});
