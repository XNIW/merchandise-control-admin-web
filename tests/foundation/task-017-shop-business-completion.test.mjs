import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readTask017Migrations() {
  const migrationsPath = join(root, "supabase/migrations");

  if (!existsSync(migrationsPath)) {
    return "";
  }

  return readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".sql") && file.includes("task_017"))
    .map((file) => readProjectFile(`supabase/migrations/${file}`))
    .join("\n");
}

test("TASK-017 Shop dashboard aggregates operational modules without mock rows", () => {
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const overviewPage = readProjectFile("src/app/shop/overview/page.tsx");

  assert.match(overviewPage, /getShopSectionForRequest\(\s*"overview"/);
  assert.match(sectionData, /buildShopDashboardSection/);
  assert.match(sectionData, /getShopInventoryReadModel/);
  assert.match(sectionData, /getShopStaffReadModel/);
  assert.match(sectionData, /getShopDeviceReadModel/);
  assert.match(sectionData, /getShopHistoryReadModel/);
  assert.match(sectionData, /getShopAuditReadModel/);
  assert.match(sectionData, /Operational cards/);
  assert.match(sectionData, /Data status/);
  assert.match(sectionData, /Latest events/);
  assert.match(sectionData, /Latest shop audit/);
  assert.doesNotMatch(sectionData, /mock|fake|sample/i);
});

test("TASK-017 catalog detail routes and product filters are shop-scoped server reads", () => {
  const detailRoutes = [
    "src/app/shop/products/[productId]/page.tsx",
    "src/app/shop/categories/[categoryId]/page.tsx",
    "src/app/shop/suppliers/[supplierId]/page.tsx",
  ];

  for (const route of detailRoutes) {
    assert.equal(existsSync(join(root, route)), true, `${route} is missing`);
    const source = readProjectFile(route);

    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /params/);
    assert.match(source, /searchParams/);
    assert.match(source, /getShopCatalogDetailSectionForRequest/);
    assert.doesNotMatch(source, /shopSections\.|@supabase|service_role/i);
  }

  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const inventoryReadModel = readProjectFile("src/server/shop-admin/inventory-read-model.ts");
  const productsPage = readProjectFile("src/app/shop/products/page.tsx");

  assert.match(sectionData, /buildProductDetailSection/);
  assert.match(sectionData, /buildCategoryDetailSection/);
  assert.match(sectionData, /buildSupplierDetailSection/);
  assert.match(sectionData, /getShopCatalogDetailSectionForRequest/);
  assert.match(sectionData, /applyCatalogFilters/);
  assert.match(productsPage, /query/);
  assert.match(productsPage, /category_id/);
  assert.match(productsPage, /supplier_id/);
  assert.match(inventoryReadModel, /\.eq\("owner_user_id", legacyOwnerUserId\)/);
  assert.doesNotMatch(inventoryReadModel, /\.eq\("shop_id",\s*(requestedShopId|selectedShopId)\)/);
});

test("TASK-017 shop members support invite, role update, removal and detail through audited RPCs", () => {
  const migration = readTask017Migrations();
  const memberMutationsPath = "src/server/shop-admin/member-mutations.ts";
  const membersPanelPath = "src/app/shop/_components/MemberActionPanel.tsx";
  const actions = readProjectFile("src/app/shop/actions.ts");
  const membersPage = readProjectFile("src/app/shop/members/page.tsx");
  const memberDetailPath = "src/app/shop/members/[memberId]/page.tsx";

  assert.equal(existsSync(join(root, memberMutationsPath)), true, `${memberMutationsPath} is missing`);
  assert.equal(existsSync(join(root, membersPanelPath)), true, `${membersPanelPath} is missing`);
  assert.equal(existsSync(join(root, memberDetailPath)), true, `${memberDetailPath} is missing`);

  const memberMutations = readProjectFile(memberMutationsPath);
  const membersPanel = readProjectFile(membersPanelPath);
  const memberDetail = readProjectFile(memberDetailPath);

  for (const rpcName of [
    "shop_member_invite_profile",
    "shop_member_update_role",
    "shop_member_remove",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpcName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpcName}`));
    assert.match(memberMutations, new RegExp(`\\.rpc\\("${rpcName}"`));
  }

  assert.match(migration, /shop\.member\./);
  assert.match(migration, /create or replace function app_private\.is_active_shop_owner_member/);
  assert.match(migration, /not app_private\.is_active_shop_owner_member\(p_shop_id\)/);
  assert.match(migration, /nullif\(btrim\(coalesce\(p_reason, ''\)\), ''\) is null/);
  assert.match(migration, /shop_owner/);
  assert.match(migration, /shop_manager/);
  assert.match(migration, /viewer/);
  assert.match(memberMutations, /import "server-only"/);
  assert.match(memberMutations, /resolveShopActionContext/);
  assert.match(memberMutations, /members\.manage/);
  assert.match(actions, /inviteShopMemberAction/);
  assert.match(actions, /updateShopMemberRoleAction/);
  assert.match(actions, /removeShopMemberAction/);
  assert.match(membersPage, /MemberActionPanel/);
  assert.match(memberDetail, /getShopMemberDetailSectionForRequest/);
  assert.match(membersPanel, /Invite member/);
  assert.match(membersPanel, /Update role/);
  assert.match(membersPanel, /Remove member/);
  assert.match(membersPanel, /label="Reason" name="reason" required/);
  assert.match(memberMutations, /Reason is required/);
  assert.doesNotMatch(`${memberMutations}\n${membersPanel}`, /password|token|service_role|credential_hash/i);
});

test("TASK-017 POS staff, devices and audit expose detail routes with redacted data", () => {
  const routes = [
    ["src/app/shop/staff/[staffId]/page.tsx", "getShopStaffDetailSectionForRequest"],
    ["src/app/shop/devices/[deviceId]/page.tsx", "getShopDeviceDetailSectionForRequest"],
    ["src/app/shop/audit/[eventId]/page.tsx", "getShopAuditDetailSectionForRequest"],
  ];

  for (const [route, builder] of routes) {
    assert.equal(existsSync(join(root, route)), true, `${route} is missing`);
    const source = readProjectFile(route);

    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /params/);
    assert.match(source, /searchParams/);
    assert.match(source, new RegExp(builder));
    assert.doesNotMatch(source, /@supabase|service_role|credential_hash/i);
  }

  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const auditReadModel = readProjectFile("src/server/shop-admin/audit-read-model.ts");

  assert.match(sectionData, /buildStaffDetailSection/);
  assert.match(sectionData, /buildDeviceDetailSection/);
  assert.match(sectionData, /buildAuditDetailSection/);
  assert.match(auditReadModel, /import "server-only"/);
  assert.match(auditReadModel, /\.from\("audit_logs"\)/);
  assert.match(auditReadModel, /\.eq\("shop_id", selectedShop\.shopId\)/);
  assert.match(auditReadModel, /metadata_redacted/);
  assert.match(auditReadModel, /redact/);
  assert.doesNotMatch(auditReadModel, /select\("\*"\)|\.(insert|update|delete|upsert|rpc)\s*\(/);
});

test("TASK-017 sync center is a dedicated read-only Shop Admin module", () => {
  const syncPagePath = "src/app/shop/sync/page.tsx";

  assert.equal(existsSync(join(root, syncPagePath)), true, `${syncPagePath} is missing`);

  const syncPage = readProjectFile(syncPagePath);
  const sections = readProjectFile("src/components/shop/shopSections.ts");
  const sectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");

  assert.match(syncPage, /export const dynamic = "force-dynamic"/);
  assert.match(syncPage, /getShopSectionForRequest\(\s*"sync"/);
  assert.match(sections, /key: "sync"/);
  assert.match(sections, /href: "\/shop\/sync"/);
  assert.match(sectionData, /buildSyncSection/);
  assert.match(sectionData, /pending/);
  assert.match(sectionData, /success/);
  assert.match(sectionData, /failed/);
  assert.match(sectionData, /syncEvents/);
  assert.doesNotMatch(sectionData, /\.from\("audit_logs"\)[\s\S]*buildSyncSection/);
});

test("TASK-017 security scanner and task docs lock the new business completion scope", () => {
  const securityChecks = readProjectFile("scripts/security-checks.mjs");
  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");

  assert.match(securityChecks, /checkTask017ShopBusinessCompletionArtifacts/);
  assert.match(securityChecks, /checkTask017ShopBusinessCompletionArtifacts\(\)/);
  assert.match(securityChecks, /shop_member_invite_profile/);
  assert.match(securityChecks, /src\/app\/shop\/sync\/page\.tsx/);
  assert.match(masterPlan, /TASK-017 - Shop Business Completion/);
  assert.equal(
    existsSync(join(root, "docs/TASKS/TASK-017-shop-business-completion.md")),
    true,
    "TASK-017 task file is missing",
  );
  assert.equal(
    existsSync(join(root, "docs/TASKS/EVIDENCE/TASK-017/README.md")),
    true,
    "TASK-017 evidence file is missing",
  );
});
