import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260802010000_storefront_v1_admin_promotions.sql",
);
const page = read("src/app/shop/storefront/page.tsx");
const actions = read("src/app/shop/storefront/actions.ts");
const mutations = read("src/server/shop-admin/storefront-mutations.ts");
const readModel = read("src/server/shop-admin/storefront-read-model.ts");
const leaseBoundary = read(
  "src/server/shop-admin/staff-web-lease-bound-rpc.ts",
);
const types = read("src/lib/supabase/database.types.ts");
const stagingWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);
const stagingAcceptance = read(
  "tests/e2e/storefront-v1-admin-publications-local.spec.ts",
);

test("TASK-008 exposes promotion list, editor, scheduling and exclusions", () => {
  for (const required of [
    "Nome promozione",
    "Stato promozione",
    "Sconto percentuale",
    "Prezzo fisso CLP",
    "Prodotti e esclusioni",
    "Crea promozione",
    "Aggiorna promozione",
    "Regola conflitti deterministica",
    "Riconciliazione automatica ogni minuto",
  ]) assert.match(page, new RegExp(required));
  assert.match(actions, /saveStorefrontPromotionAction/);
  assert.match(mutations, /upsertStorefrontPromotion/);
  assert.match(readModel, /admin_storefront_promotions_read_v1/);
});

test("TASK-008 keeps every mutation behind promotions.manage and the lease boundary", () => {
  assert.match(mutations, /resolveShopActionContext[\s\S]*storefront\.promotions\.manage/);
  assert.match(leaseBoundary, /callStaffWebStorefrontPromotionMutation/);
  assert.match(leaseBoundary, /callStaffWebStorefrontPromotionsRead/);
  assert.match(migration, /storefront_admin_authorized_v1\([\s\S]*'storefront\.promotions\.manage'/);
  assert.doesNotMatch(mutations, /createSupabaseAdminClient|\.from\(/);
  assert.doesNotMatch(readModel, /SUPABASE_SERVICE_ROLE_KEY|\.from\(/);
});

test("TASK-008 validates CLP, percentage, windows, tenant and product sets server-side", () => {
  for (const required of [
    "fixed_price_clp",
    "percentage_bps",
    "v_starts_at >= v_ends_at",
    "v_discount_value not between 1 and 10000",
    "v_excluded_ids <@ v_publication_ids",
    "publication.shop_id = p_shop_id",
    "publication.retail_price_clp <= v_discount_value",
    "pg_advisory_xact_lock",
    "for update",
    "statement_timeout = '10s'",
  ]) assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("TASK-008 has deterministic conflict handling and automatic lifecycle reconciliation", () => {
  assert.match(migration, /lowest_effective_price_then_priority_then_uuid/g);
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /cron\.schedule\([\s\S]*\* \* \* \* \*/);
  assert.match(migration, /storefront_promotion_reconcile_v1/);
  assert.match(migration, /storefront_promotion_effective_status_v1/);
  assert.match(page, /prezzo effettivo più basso[\s\S]*priorità maggiore[\s\S]*UUID/);
});

test("TASK-008 RPC contracts are typed, audited and denied to anon", () => {
  for (const rpc of [
    "admin_storefront_promotions_read_v1",
    "admin_storefront_promotion_mutate_v1",
  ]) {
    assert.match(types, new RegExp(rpc));
    assert.match(migration, new RegExp(rpc));
  }
  assert.match(migration, /shop\.storefront\.promotion\.upsert\.success/);
  assert.match(migration, /'before'[\s\S]*'after'/);
  assert.match(migration, /revoke all on function public\.admin_storefront_promotion_mutate_v1[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.admin_storefront_promotion_mutate_v1[\s\S]*to authenticated, service_role/);
});

test("TASK-008 staging pipeline is exact-migration guarded and exercises live pricing", () => {
  assert.match(stagingWorkflow, /EXPECTED_MIGRATION_VERSION: "20260802010000"/);
  assert.match(stagingWorkflow, /EXPECTED_MIGRATION_NAME: storefront_v1_admin_promotions/);
  assert.match(stagingWorkflow, /adminPromotionRpcBoundary/);
  assert.match(stagingWorkflow, /promotionCronScheduled/);
  assert.match(stagingAcceptance, /CREATE_PROMOTION|PUBLIC_DETAIL_PROMOTION/);
  assert.match(stagingAcceptance, /shop\.storefront\.promotion\.upsert\.success/);
});
