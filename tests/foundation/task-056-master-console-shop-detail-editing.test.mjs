import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("TASK-056 tracking is DONE_RECONCILED after final DONE gate", () => {
  const taskPath = "docs/TASKS/TASK-056-master-console-shop-detail-editing.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-056/README.md";

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );

  const masterPlan = read("docs/MASTER-PLAN.md");
  const task056 = read(taskPath);
  const task055 = read("docs/TASKS/TASK-055-shop-admin-console-ui-polish.md");
  const evidence = read(evidencePath);

  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
  assertContains(masterPlan, "Stato TASK-055: `DONE_RECONCILED`");
  assertContains(masterPlan, "Stato TASK-056: `DONE_RECONCILED`");
  assertContains(task056, "Stato: `DONE_RECONCILED`");
  assertContains(task056, "Fase attuale: `DONE_RECONCILED`");
  assertContains(task055, "Stato: `DONE_RECONCILED`");
  assertContains(evidence, "Verdict corrente: `DONE_RECONCILED`");
  assertContains(evidence, "`npm run verify`: PASS_WITH_WARNINGS");
  assertContains(evidence, "`npm run test:platform:local`: PASS");
  assertContains(evidence, "`npm run test:platform:local-login`: PASS");
  assertContains(evidence, "Review fix - Edit dialog");
  assertContains(task056, "Review fix dialog");
  assertContains(evidence, "Final review / DONE gate 2026-06-11");
});

test("TASK-056 Shops master-detail keeps single-click selection and adds double-click or Enter full-detail navigation", () => {
  const masterDetail = read("src/components/platform/PlatformMasterDetail.tsx");

  assertContains(masterDetail, "useRouter");
  assertContains(masterDetail, "openFullDetail");
  assertContains(masterDetail, "onDoubleClick");
  assertContains(masterDetail, "Double click to open full detail");
  assertContains(masterDetail, "event.key === \"Enter\"");
  assertContains(masterDetail, "router.push");
  assertContains(masterDetail, "selectRow(rowKey)");
  assertContains(masterDetail, "Open full detail");
  assertContains(masterDetail, "event.stopPropagation();");
  assertContains(masterDetail, "aria-label={`${labels.copyShopCode}");
});

test("TASK-056 shop detail renders complete read-only profile and fiscal identity before opening edit dialog", () => {
  const detailPage = read("src/app/platform/shops/[shopId]/page.tsx");
  const editForm = read("src/app/platform/shops/[shopId]/ShopProfileEditForm.tsx");
  const sectionData = read("src/server/platform-admin/platform-section-data.ts");
  const platformPage = read("src/components/platform/PlatformPage.tsx");
  const sectionCard = read("src/components/admin/SectionCard.tsx");

  assertContains(detailPage, "ShopProfileEditForm");
  assertContains(detailPage, "getPlatformShopProfileForRequest");
  assertContains(detailPage, "detailSectionActions");
  assertContains(detailPage, '"Shop profile & fiscal identity":');
  assertContains(platformPage, "detailSectionActions");
  assertContains(
    platformPage,
    "section.detailSections?.[index]?.title ?? detailSection.title",
  );
  assertContains(sectionCard, "actions?: ReactNode");
  assertContains(platformPage, 'localizedSection.rowsPresentation === "diagnostics"');
  assertContains(platformPage, "Diagnostics / boundary rows");
  assertContains(platformPage, 'actionPlacement === "body"');
  assertContains(sectionData, 'title: "Shop profile & fiscal identity"');
  assertContains(sectionData, 'title: "Shop lifecycle management"');
  assertContains(sectionData, 'title: "Admin access / Ownership"');
  assertContains(sectionData, 'title: "Danger Zone"');
  assertContains(sectionData, 'title: "Members"');
  assertContains(sectionData, 'title: "Devices / sync / audit"');
  assertContains(sectionData, 'actionPlacement: "body" as const');
  assertContains(sectionData, 'layout: "full" as const');
  assertContains(sectionData, 'rowsPresentation: "diagnostics"');
  assertContains(sectionData, "Not configured");
  assertContains(sectionData, "Fiscal identity not configured");
  assertContains(sectionData, "No lifecycle action available");

  for (const required of [
    "Shop code",
    "Shop ID",
    "Available transition",
    "Company RUT",
    "Giro",
    "Address",
    "City",
    "Legal representative RUT",
    "Created",
    "Updated",
  ]) {
    assertContains(sectionData, `label: "${required}"`);
  }

  for (const required of [
    "Membership records",
    "Operational members",
    "Owners",
    "Managers",
    "Devices visible",
    "Audit count",
    "Latest audit",
    "Latest sync",
  ]) {
    assertContains(sectionData, `label: "${required}"`);
  }

  assertContains(editForm, "Edit shop profile");
  assertContains(editForm, 'aria-label="Edit shop profile and fiscal identity"');
  assertContains(editForm, 'aria-haspopup="dialog"');
  assertContains(editForm, 'role="dialog"');
  assertContains(editForm, 'aria-modal="true"');
  assertContains(editForm, "setDialogOpen(true)");
  assertContains(editForm, "Cancel");
  assertContains(
    editForm,
    "Master Console controls shop identity and fiscal/boleta fields. Changes are audited.",
  );

  for (const required of [
    'name="shopName"',
    'name="companyRut"',
    'name="businessGiro"',
    'name="businessAddress"',
    'name="businessCity"',
    'name="legalRepresentativeRut"',
    'name="reason"',
    'name="confirmation"',
    "Type UPDATE SHOP PROFILE as confirmation",
    "Controlled Operations",
    "/platform/operations",
  ]) {
    assertContains(editForm, required);
  }

  assert.doesNotMatch(editForm, /name="shopCode"|name="shop_id"|ownerProfileId|staffCode|password|pin/i);
  assert.doesNotMatch(`${detailPage}\n${sectionData}`, /password|\bPIN\b|device_token|credential_hash|service_role/i);
  assert.doesNotMatch(
    editForm,
    /return\s*\(\s*<section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5"/,
  );
});

test("TASK-056 shop profile update route is platform-admin authorized, audited, and service-role free", () => {
  const route = read("src/app/platform/shops/[shopId]/profile/route.ts");
  const submit = read("src/app/platform/shops/[shopId]/profile/updateFormSubmit.ts");
  const service = read("src/server/platform-admin/shop-profile-actions.ts");
  const validation = read("src/server/platform-admin/shop-action-validation.ts");

  assertContains(route, "guardPlatformProvisioningPostRequest");
  assertContains(submit, "revalidatePath(`/platform/shops/${shopId}`)");
  assertContains(service, "resolvePlatformAdminForRequest");
  assertContains(service, "createPlatformProvisioningRpcClient");
  assertContains(service, "platform_update_shop_profile");
  assertContains(service, "UPDATE SHOP PROFILE");
  assertContains(validation, "validateUpdateShopProfileInput");
  assertContains(validation, "normalizeRut");
  assertContains(validation, "normalizeShopName");
  assert.doesNotMatch(`${route}\n${submit}\n${service}`, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY|shop_code\s*:/i);
});

test("TASK-056 migration adds an atomic profile update RPC without allowing shop_code changes", () => {
  const task056Migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => name.includes("task_056"))
    .sort();
  const migration = read(
    "supabase/migrations/20260611203000_task_056_shop_profile_update.sql",
  );
  const databaseTypes = read("src/lib/supabase/database.types.ts");

  assertContains(migration, "create or replace function public.platform_update_shop_profile");
  assertContains(migration, "set search_path = public, app_private, pg_temp");
  assertContains(migration, "app_private.task056_platform_audit");
  assertContains(migration, "platform.shop.profile_update");
  assertContains(migration, "UPDATE SHOP PROFILE");
  assertContains(migration, "changed_fields");
  assertContains(migration, "grant execute on function public.platform_update_shop_profile");
  assertContains(databaseTypes, "platform_update_shop_profile");
  assertContains(databaseTypes, "p_legal_representative_rut");
  assert.deepEqual(task056Migrations, [
    "20260611203000_task_056_shop_profile_update.sql",
  ]);
  assert.doesNotMatch(migration, /set\s+shop_code\s*=|p_shop_code|owner_profile|staff_code|credential|password|pin/i);
});
