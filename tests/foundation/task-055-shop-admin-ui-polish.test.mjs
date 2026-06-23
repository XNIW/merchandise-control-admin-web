import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("TASK-055 tracking is DONE_RECONCILED after final DONE gate", () => {
  const taskPath = "docs/TASKS/TASK-055-shop-admin-console-ui-polish.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-055/README.md";
  const masterPlan = read("docs/MASTER-PLAN.md");

  assert.equal(existsSync(join(root, taskPath)), true, `${taskPath} is missing`);
  assert.equal(
    existsSync(join(root, evidencePath)),
    true,
    `${evidencePath} is missing`,
  );

  const task = read(taskPath);
  const evidence = read(evidencePath);

  assertContains(task, "Stato: `DONE_RECONCILED`");
  assertContains(task, "Fase attuale: `DONE_RECONCILED`");
  assertContains(task, "Shop Admin Console UI polish");
  assertContains(evidence, "Verdict corrente: `DONE_RECONCILED`");
  assert.match(masterPlan, /Stato globale attuale: `(IDLE|REVIEW|EXECUTION|REVIEW_WITH_EXTERNAL_BLOCKERS)`/);
  assertContains(masterPlan, "Stato TASK-055: `DONE_RECONCILED`");
  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-057 - Shop Catalog Workspace: prodotti, categorie, fornitori e import Excel intelligente`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
  assertContains(evidence, "Final review / DONE gate 2026-06-11");
});

test("TASK-055 Shop shell header shows real shop context and compact sidebar guardrails", () => {
  const shell = read("src/components/shop/ShopShell.tsx");
  const dictionary = read("src/i18n/dictionaries.ts");

  assertContains(shell, "companyRut?: string");
  assertContains(shell, "function formatCompanyRut");
  assertContains(shell, "replace(/[^0-9kK]/g, \"\")");
  assertContains(shell, "groups.join(\".\")");
  assertContains(shell, "function shopDisplayName");
  assertContains(shell, "shop.companyRut");
  assertContains(shell, "labels.companyRutPrefix");
  assertContains(dictionary, "Company RUT");
  assertContains(shell, "shop-shell-page-title");
  assertContains(shell, "currentPageEyebrow");
  assertContains(shell, "currentPageDescription");
  assertContains(shell, "sectionDescriptions");
  assertContains(shell, "sectionEyebrows");
  assertContains(shell, "title={currentPageDescription ?? undefined}");
  assertContains(shell, "<ShopNavigationIcon itemKey={currentPageKey} />");
  assertContains(shell, "<details");
  assertContains(shell, "summary");
  assertContains(shell, "lg:grid-cols-[264px_minmax(0,1fr)]");
  assertContains(shell, "border-l-2");
  assertContains(shell, "max-h-[calc(100vh-");
  assert.doesNotMatch(
    shell,
    /currentPageDescription \? \([\s\S]*<p className="[^"]*line-clamp-2/,
  );
  assert.doesNotMatch(shell, /GuardrailNotice/);
  assert.doesNotMatch(shell, /Shop \$\{shop\.shopCode\}/);
  assert.doesNotMatch(shell, /labels\.shopCodePrefix/);
  assert.doesNotMatch(shell, /labels\.notConfigured/);
});

test("TASK-055 Shop shell access keeps RUT/name enrichment server-side", () => {
  const shopAccess = read("src/server/shop-admin/shop-access.ts");
  const dataAccess = read("src/server/shop-admin/data-access.ts");
  const shopLayout = read("src/app/shop/layout.tsx");

  assertContains(shopAccess, "companyRut?: string");
  assertContains(shopAccess, "company_rut");
  assertContains(shopAccess, "companyRut: shop.company_rut");
  assertContains(dataAccess, "async function loadStaffShellShop");
  assertContains(dataAccess, ".from(\"shops\")");
  assertContains(dataAccess, "company_rut");
  assertContains(dataAccess, "shopName: shop.shop_name");
  assertContains(dataAccess, "companyRut: shop.company_rut");
  assertContains(shopLayout, "access.selectedShop");
  assert.doesNotMatch(shopLayout, /shopName: principal\.shop\.shopCode/);
  assert.doesNotMatch(`${shopAccess}\n${dataAccess}`, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("TASK-055 products filter bar aligns fields and keeps server query params", () => {
  const page = read("src/app/shop/products/page.tsx");
  const dictionary = read("src/i18n/dictionaries.ts");

  assertContains(page, "filterLabels.searchPlaceholder");
  assertContains(dictionary, "Search barcode, item number, product name");
  assertContains(page, "filterInputClassName");
  assertContains(page, "filterButtonClassName");
  assertContains(page, "h-9 w-full min-w-0");
  assertContains(page, "md:grid-cols-[minmax(14rem,1.35fr)_minmax(0,170px)_minmax(0,170px)_minmax(0,132px)_minmax(0,112px)_auto]");
  assertContains(page, "category_id");
  assertContains(page, "supplier_id");
  assertContains(page, "name=\"state\"");
  assertContains(page, "getShopInventoryProductsPage");
  assertContains(page, "getShopCatalogOptionsReadModel");
});

test("TASK-068K products polish adds bottom pagination, reset, and decorative sidebar icons", () => {
  const page = read("src/app/shop/products/page.tsx");
  const table = read("src/components/admin/AdminDataTable.tsx");
  const shell = read("src/components/shop/ShopShell.tsx");
  const dictionary = read("src/i18n/dictionaries.ts");
  const packageJson = read("package.json");

  assertContains(page, "ProductsPagination");
  assertContains(page, "id=\"products-page-jump-top\"");
  assertContains(page, "id=\"products-page-jump-bottom\"");
  assertContains(page, "aria-label={`${labels.pagination} ${placement}`}");
  assertContains(page, "placement=\"top\"");
  assertContains(page, "placement=\"bottom\"");
  assertContains(page, "labels.first");
  assertContains(page, "labels.last");
  assertContains(page, "name=\"page\"");
  assertContains(page, "inputMode=\"numeric\"");
  assertContains(page, "required");
  assertContains(page, "hiddenFields.map");
  assertContains(page, "Reset filters");
  assertContains(page, "Filters active");
  assertContains(page, "Rows on this page");
  assertContains(page, "Search and filters");
  assertContains(page, "data-product-catalog-command-bar");
  assert.doesNotMatch(page, /Catalog Workspace/);
  assert.doesNotMatch(
    page,
    /Use search or filters to find products across the full mapped catalog\./,
  );
  assertContains(page, "ProductsIcon");
  assertContains(page, "icon: \"barcode\"");
  assertContains(page, "icon: \"package\"");
  assertContains(page, "cellVariant: \"primary\"");
  assertContains(page, "aria-label={`${labels.next}: ${pageAriaLabel} ${nextPage}`}");
  assertContains(table, "TableColumnIcon");
  assertContains(table, "cellVariant === \"code\"");
  assertContains(table, "cellVariant === \"state\"");
  assertContains(shell, "ShopNavigationIcon");
  assertContains(shell, "aria-hidden\": true");
  assertContains(shell, "<ShopNavigationIcon itemKey={item.key} />");
  assertContains(dictionary, "Reset filters");
  assertContains(dictionary, "Go to page");
  assertContains(dictionary, "Rows on this page");
  assert.doesNotMatch(packageJson, /lucide|heroicons|react-icons/);
});

test("TASK-055 catalog action cards and import/export cards avoid uneven overflow", () => {
  const catalogPanel = read("src/app/shop/_components/CatalogActionPanel.tsx");
  const importExportPanel = read(
    "src/app/shop/_components/ImportExportActionPanel.tsx",
  );

  assertContains(catalogPanel, "catalogActionCardClassName");
  assertContains(catalogPanel, "catalogInputClassName");
  assertContains(catalogPanel, "catalogButtonClassName");
  assertContains(catalogPanel, "min-h-[");
  assertContains(catalogPanel, "mt-auto");
  assertContains(catalogPanel, "h-10 w-full min-w-0");

  assertContains(importExportPanel, "importExportCardClassName");
  assertContains(importExportPanel, "importExportInputClassName");
  assertContains(importExportPanel, "importExportFileInputClassName");
  assertContains(importExportPanel, "lg:grid-cols-2");
  assertContains(importExportPanel, "h-10 w-full min-w-0");
  assertContains(importExportPanel, "break-words");
  assert.doesNotMatch(importExportPanel, /lg:grid-cols-4/);
});

test("TASK-055 review fix 2 aligns Sync filters without changing server filters", () => {
  const syncPage = read("src/app/shop/sync/page.tsx");

  assertContains(syncPage, "syncFilterFormClassName");
  assertContains(syncPage, "syncFilterInputClassName");
  assertContains(syncPage, "syncFilterSelectClassName");
  assertContains(syncPage, "syncFilterButtonClassName");
  assertContains(syncPage, "h-10 w-full min-w-0");
  assertContains(syncPage, "Search sync events");
  assertContains(syncPage, "Device or source");
  assertContains(syncPage, "md:grid-cols-[minmax(14rem,1fr)_minmax(0,180px)_minmax(0,220px)_minmax(0,150px)_auto]");
  assertContains(syncPage, "syncFilters");
  assertContains(syncPage, "domain: domainFilter");
  assertContains(syncPage, "source: sourceFilter");
  assertContains(syncPage, "status: statusFilter");
});

test("TASK-055 review fix 2 aligns Devices action cards like catalog cards", () => {
  const devicePanel = read("src/app/shop/_components/DeviceActionPanel.tsx");

  assertContains(devicePanel, "deviceActionCardClassName");
  assertContains(devicePanel, "deviceFormClassName");
  assertContains(devicePanel, "deviceInputClassName");
  assertContains(devicePanel, "deviceButtonClassName");
  assertContains(devicePanel, "deviceWarningButtonClassName");
  assertContains(devicePanel, "deviceSuccessButtonClassName");
  assertContains(devicePanel, "min-h-[");
  assertContains(devicePanel, "min-w-0 flex-col");
  assertContains(devicePanel, "h-10 w-full min-w-0");
  assertContains(devicePanel, "mt-auto");
  assertContains(devicePanel, "md:grid-cols-2");
  assertContains(devicePanel, "xl:grid-cols-4");

  for (const required of [
    "Register device",
    "Rename device",
    "Revoke device",
    "Reactivate device",
    "deviceIdentifier",
    "deviceId",
    "reason",
    "confirmation",
  ]) {
    assertContains(devicePanel, required);
  }
});

test("TASK-055 review fix 2 aligns Members action cards like catalog cards", () => {
  const memberPanel = read("src/app/shop/_components/MemberActionPanel.tsx");

  assertContains(memberPanel, "memberActionCardClassName");
  assertContains(memberPanel, "memberFormClassName");
  assertContains(memberPanel, "memberInputClassName");
  assertContains(memberPanel, "memberSelectClassName");
  assertContains(memberPanel, "memberButtonClassName");
  assertContains(memberPanel, "memberWarningButtonClassName");
  assertContains(memberPanel, "min-h-[");
  assertContains(memberPanel, "min-w-0 flex-col");
  assertContains(memberPanel, "h-10 w-full min-w-0");
  assertContains(memberPanel, "mt-auto");
  assertContains(memberPanel, "lg:grid-cols-3");

  for (const required of [
    "Invite member",
    "Update role",
    "Remove member",
    "profileId",
    "roleKey",
    "memberId",
    "reason",
    "confirmation",
  ]) {
    assertContains(memberPanel, required);
  }
});

test("TASK-055 review fix 3 keeps Shop Admin surfaces on one shared content frame", () => {
  const sharedLayout = read("src/components/shop/shopLayout.ts");
  const sectionPage = read("src/components/shop/ShopSectionPage.tsx");

  assertContains(sharedLayout, "SHOP_ADMIN_CONTENT_FRAME_CLASS");
  assertContains(sharedLayout, "mx-auto w-full max-w-7xl");
  assertContains(sectionPage, "SHOP_ADMIN_CONTENT_FRAME_CLASS");
  assertContains(sectionPage, "metricGridClassName");
  assertContains(sectionPage, "metricCount >= 4");
  assertContains(sectionPage, "xl:grid-cols-4");
  assertContains(sectionPage, "md:grid-cols-3");

  for (const relativePath of [
    "src/app/shop/products/page.tsx",
    "src/app/shop/settings/page.tsx",
    "src/app/shop/_components/ActionResultBanner.tsx",
    "src/app/shop/_components/CatalogActionPanel.tsx",
    "src/app/shop/_components/ImportExportActionPanel.tsx",
    "src/app/shop/_components/DeviceActionPanel.tsx",
    "src/app/shop/_components/MemberActionPanel.tsx",
    "src/app/shop/_components/StaffActionPanel.tsx",
  ]) {
    assertContains(read(relativePath), "SHOP_ADMIN_CONTENT_FRAME_CLASS", relativePath);
  }

  for (const relativePath of [
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/sync/page.tsx",
    "src/app/shop/audit/page.tsx",
    "src/app/shop/history/page.tsx",
  ]) {
    assertContains(read(relativePath), "beforeLiveData", relativePath);
  }

  const localFrameSources = [
    sectionPage,
    read("src/app/shop/products/page.tsx"),
    read("src/app/shop/settings/page.tsx"),
    read("src/app/shop/_components/CatalogActionPanel.tsx"),
    read("src/app/shop/_components/ImportExportActionPanel.tsx"),
    read("src/app/shop/_components/DeviceActionPanel.tsx"),
    read("src/app/shop/_components/MemberActionPanel.tsx"),
    read("src/app/shop/_components/StaffActionPanel.tsx"),
  ].join("\n");

  assert.doesNotMatch(localFrameSources, /mx-auto\s+(?:grid|flex|w-full)[^"]*max-w-7xl/);
});

test("TASK-055 roles copy names read-only baseline without implying a blocked editor", () => {
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");

  assertContains(sectionData, "Granular editing");
  assertContains(sectionData, "Not available yet");
  assertContains(sectionData, "Baseline matrix only. No granular roles schema yet.");
  assert.doesNotMatch(sectionData, /Role editing/);
  assert.doesNotMatch(sectionData, /No granular roles schema", "warning"/);
});

test("TASK-055 review fix keeps Settings read-only and fail-closed to Master Console", () => {
  const settingsPage = read("src/app/shop/settings/page.tsx");
  const actions = read("src/app/shop/actions.ts");
  const settingsMutations = read("src/server/shop-admin/settings-mutations.ts");
  const sectionData = read("src/server/shop-admin/shop-section-data.ts");
  const shopSections = read("src/components/shop/shopSections.ts");
  const dictionary = read("src/i18n/dictionaries.ts");

  assertContains(
    `${settingsPage}\n${dictionary}`,
    "Shop profile and fiscal identity are managed by Master Console. Admin Console can view these fields but cannot edit them.",
  );
  assertContains(`${settingsPage}\n${dictionary}`, "Master Console only");
  assert.doesNotMatch(settingsPage, /updateShopSettingsAction/);
  assert.doesNotMatch(settingsPage, /resolveShopActionContext/);
  assert.doesNotMatch(settingsPage, /Type SETTINGS as confirmation/);
  assert.doesNotMatch(settingsPage, /Update settings/);
  assert.doesNotMatch(settingsPage, /name="shopName"/);
  assert.doesNotMatch(settingsPage, /name="reason"/);

  assert.doesNotMatch(actions, /updateShopSettingsAction/);
  assert.doesNotMatch(actions, /updateShopSettings/);
  assertContains(settingsMutations, "SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE");
  assertContains(settingsMutations, "shop_settings_managed_by_master_console");
  assert.doesNotMatch(settingsMutations, /\.from\("shops"\)[\s\S]{0,360}\.update\(/);

  assertContains(sectionData, "Profile updates");
  assertContains(sectionData, "Master Console only");
  assertContains(
    sectionData,
    "Shop profile and fiscal identity are read-only in Admin Console",
  );
  assertContains(
    sectionData,
    "Shop profile and fiscal identity are managed by Master Console",
  );
  assertContains(shopSections, "Master Console");
  assert.doesNotMatch(sectionData, /metric\("Writes", "Guarded"/);
});
