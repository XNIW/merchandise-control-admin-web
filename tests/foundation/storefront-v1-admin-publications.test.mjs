import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read(
  "supabase/migrations/20260802001000_storefront_v1_admin_publications.sql",
);
const page = read("src/app/shop/storefront/page.tsx");
const actions = read("src/app/shop/storefront/actions.ts");
const mutations = read("src/server/shop-admin/storefront-mutations.ts");
const readModel = read("src/server/shop-admin/storefront-read-model.ts");
const permissions = read("src/server/shop-admin/permissions.ts");
const staffPermissions = read(
  "src/server/shop-admin/staff-web-permissions.ts",
);
const leaseBoundary = read(
  "src/server/shop-admin/staff-web-lease-bound-rpc.ts",
);
const stagingWorkflow = read(
  ".github/workflows/storefront-v1-staging-migrations.yml",
);

test("TASK-007 exposes the complete Storefront navigation and authoring controls", () => {
  for (const required of [
    "/shop/storefront",
    "Catalogo",
    "Categorie pubbliche",
    "Promozioni",
    "Immagini pubbliche",
    "Anteprima",
    "Impostazioni",
    "Audit",
    "Pubblica selezionati",
    "Metti in pausa",
    "Nome pubblico",
    "Descrizione pubblica",
    "Prezzo cliente CLP",
    "Segue prezzo operativo",
    "Ritiro",
    "Consegna",
    "Prenotazione",
    "In evidenza",
  ]) {
    assert.match(page, new RegExp(required));
  }
  assert.match(page, /getStorefrontPublicationsReadModel/);
  assert.match(page, /storefront_home_v1/);
  assert.doesNotMatch(page, /purchasePrice|supplierName|ownerUserId/);
});

test("TASK-007 Server Actions reauthorize and never use a generic service-role table client", () => {
  assert.match(actions, /saveStorefrontPublicationAction/);
  assert.match(actions, /bulkPublishStorefrontAction/);
  assert.match(actions, /bulkPauseStorefrontAction/);
  assert.match(mutations, /resolveShopActionContext/);
  assert.match(mutations, /storefront\.bulk_publish/);
  assert.match(mutations, /admin_storefront_publication_mutate_v1/);
  assert.match(leaseBoundary, /callStaffWebStorefrontMutation/);
  assert.match(leaseBoundary, /callStaffWebStorefrontRead/);
  assert.doesNotMatch(mutations, /createSupabaseAdminClient|\.from\(/);
  assert.doesNotMatch(readModel, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("TASK-007 installs the exact granular RBAC permission set", () => {
  const requiredPermissions = [
    "storefront.view",
    "storefront.edit",
    "storefront.publish",
    "storefront.bulk_publish",
    "storefront.promotions.manage",
    "storefront.images.manage",
    "storefront.settings.manage",
    "storefront.audit.view",
  ];
  for (const permission of requiredPermissions) {
    assert.match(permissions, new RegExp(permission.replace(".", "\\.")));
    assert.match(staffPermissions, new RegExp(permission.replace(".", "\\.")));
    assert.match(migration, new RegExp(permission.replace(".", "\\.")));
  }
  assert.match(staffPermissions, /SHOP_STAFF_WEB_PERMISSION_TREE/);
  assert.match(staffPermissions, /canStaffWebPerformShopAdminAction/);
  assert.doesNotMatch(page, /admin\s*===?\s*true|admin=true/i);
});

test("TASK-007 SQL boundary is tenant-scoped, audited and lease-bound", () => {
  for (const required of [
    "admin_storefront_publications_read_v1",
    "admin_storefront_publication_mutate_v1",
    "storefront_admin_authorized_v1",
    "storefront_admin_personal_allowed_v1",
    "staff_web_runtime_lease_is_valid_v1",
    "resolve_shop_catalog_scope_service_v1",
    "storefront_product_matches_shop_v1",
    "metadata_redacted",
    "'before'",
    "'after'",
    "for update",
    "statement_timeout = '5s'",
  ]) {
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(migration, /revoke all on function public\.admin_storefront_publication_mutate_v1[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.admin_storefront_publication_mutate_v1[\s\S]*to authenticated, service_role/);
  assert.match(migration, /v_price_source_mode = 'operational'[\s\S]*v_product\.retail_price/);
  assert.match(migration, /publication\.shop_id = p_shop_id/);
});

test("TASK-007 preview consumes the public versioned contract", () => {
  assert.match(migration, /v_preview := public\.storefront_home_v1\(v_public_slug\)/);
  assert.match(page, /payload restituito da storefront_home_v1/);
  assert.doesNotMatch(page, /storefront_catalog_items|storefront_product_publications/);
});

test("TASK-007 staging workflow is pinned to the admin migration and post-verifies its boundary", () => {
  assert.match(stagingWorkflow, /EXPECTED_MIGRATION_VERSION: "20260802001000"/);
  assert.match(stagingWorkflow, /EXPECTED_MIGRATION_NAME: storefront_v1_admin_publications/);
  assert.match(stagingWorkflow, /publicApiPlannerLedgerRetained/);
  assert.match(stagingWorkflow, /adminRpcBoundary/);
  assert.match(stagingWorkflow, /adminAuthoringDirectDenied/);
  assert.match(stagingWorkflow, /storefrontPermissionMatrix/);
});
