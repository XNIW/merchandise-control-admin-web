import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertPathExists(relativePath) {
  assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

test("TASK-049 preserves TASK-048 diagnostic navigation decisions", () => {
  const platformData = readProjectFile("src/components/platform/platformData.ts");
  const sidebar = readProjectFile("src/components/platform/PlatformSidebarNav.tsx");
  const devicesPage = readProjectFile("src/app/platform/devices/page.tsx");
  const syncPage = readProjectFile("src/app/platform/sync/page.tsx");

  for (const required of [
    '{ key: "devices", label: "Devices", href: "/platform/devices", showInPrimaryNav: false }',
    '{ key: "sync", label: "Sync", href: "/platform/sync", showInPrimaryNav: false }',
    "primaryNavigationItems",
  ]) {
    assertContains(platformData, required, `platformData must preserve ${required}`);
  }

  assertContains(sidebar, "primaryNavigationItems.map");
  assert.doesNotMatch(
    sidebar,
    /navigationItems\.map\(\(item\)/,
    "Devices and Sync must not return to the primary sidebar renderer",
  );
  assertContains(devicesPage, "Device Signals | MerchandiseControl Admin Web");
  assertContains(syncPage, "Sync Signals | MerchandiseControl Admin Web");
  assert.doesNotMatch(devicesPage, /Global Devices \| MerchandiseControl Admin Web/);
  assert.doesNotMatch(syncPage, /Global Sync \| MerchandiseControl Admin Web/);
});

test("TASK-049 Admins page is compact and keeps destructive revoke controls collapsed", () => {
  const adminsPage = readProjectFile("src/app/platform/admins/page.tsx");

  for (const required of [
    "@/components/platform/displayFormat",
    "Active admins",
    "Server-side audit boundary",
    "Self-lockout protection",
    "Metadata/redaction boundary",
    "Server blocks self-lockout and last-admin removal.",
    "<details",
    "<summary",
    "Show revoke controls",
    "Revoke controls are collapsed by default",
    "title={admin.profile_id}",
    "title={admin.platform_admin_id}",
    "formatDateTime(locale, admin.granted_at)",
    "shortIdentifier(admin.profile_id)",
    "shortIdentifier(admin.platform_admin_id)",
    "break-all",
    "whitespace-nowrap",
  ]) {
    assertContains(adminsPage, required, `admins page must contain ${required}`);
  }

  assert.doesNotMatch(
    adminsPage,
    /Danger zone: Show revoke controls/,
    "closed admin revoke summary should be sober, not danger-led",
  );
  assert.match(adminsPage, /grid gap-5 xl:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.4fr\)\]/);
  assert.match(adminsPage, /className="grid max-w-2xl gap-4"/);
  assert.match(adminsPage, /<details[\s\S]*<form action=\{revokePlatformAdminAction\}/);
  assert.doesNotMatch(
    adminsPage,
    /lg:grid-cols-\[minmax\(0,1fr\)_280px\][\s\S]*<form action=\{revokePlatformAdminAction\}/,
    "revoke forms must not be rendered as an always-open side column per admin",
  );
});

test("TASK-049 Audit, Provisioning, Operations, and topbar use compact safe layout", () => {
  const appShell = readProjectFile("src/components/platform/AppShell.tsx");
  const adminDataTable = readProjectFile("src/components/admin/AdminDataTable.tsx");
  const provisioningPage = `${readProjectFile("src/app/platform/provisioning/page.tsx")}\n${readProjectFile("src/app/platform/provisioning/ShopProvisioningForms.tsx")}`;
  const platformMasterDetail = readProjectFile("src/components/platform/PlatformMasterDetail.tsx");
  const platformPage = readProjectFile("src/components/platform/PlatformPage.tsx");
  const sectionData = readProjectFile("src/server/platform-admin/platform-section-data.ts");
  const displayFormat = readProjectFile("src/components/platform/displayFormat.ts");
  const statusSources = `${sectionData}\n${displayFormat}`;
  const operationsWorkflow = readProjectFile(
    "src/components/platform/operations/ControlledOperationsWorkflow.tsx",
  );

  assert.match(
    appShell,
    /platformShell\.readOnly[\s\S]*platformShell\.serverBoundary[\s\S]*platformShell\.controlledActions[\s\S]*common\.logout/,
    "topbar chips must stay in the requested order",
  );
  assert.doesNotMatch(appShell, /isControlledActions/);

  for (const required of [
    "min-w-[64rem]",
    "nowrapColumns",
    "whitespace-nowrap",
    "break-words",
    "formatTimestampUtc",
    "isIsoTimestamp",
    "title={rawValue}",
  ]) {
    assertContains(adminDataTable, required, `AdminDataTable must contain ${required}`);
  }

  for (const required of [
    "formatDisplayValue",
    "formatTimestampUtc",
    "shortIdentifier",
    "title={fullValue}",
  ]) {
    assertContains(platformMasterDetail, required, `PlatformMasterDetail must contain ${required}`);
  }

  for (const required of [
    'localizedSection.diagnosticsPriority !== "primary"',
    "dictionary.common.boundaryDetails",
    "px-3 py-2",
  ]) {
    assertContains(platformPage, required, `PlatformPage must contain ${required}`);
  }

  for (const required of [
    "readableBoundaryStatus",
    "Blocked by grants",
    "Permission boundary",
    "Not checked",
    "Needs review",
    "Code: ${staffIssue.code}",
  ]) {
    assertContains(statusSources, required, `status formatting must contain ${required}`);
  }

  for (const required of [
    "Shop Provisioning",
    "Fiscal / Boleta identity",
    "placeholder=\"Acme Santiago\"",
    "placeholder=\"761234567\"",
    "Use Company RUT as Shop code",
    'placeholder={t("Why this provisioning action is approved")}',
    "Create POS-first shop",
    "Record pending owner email",
    "Temporary PIN. It is shown once after creation and should be changed after first access.",
    "max-w-5xl",
  ]) {
    assertContains(provisioningPage, required, `provisioning page must contain ${required}`);
  }

  for (const required of [
    "shopSearchTerm",
    "filteredShops",
    "Search target shops",
    "No shops match this search",
    "title={shop.shop_code}",
    "break-all",
    "min-w-0",
    "statusToneClassForShop",
    "Active",
    "Suspended",
    "Archived",
    "Device emergency operations are global exceptions. Daily device management belongs to Admin Console.",
  ]) {
    assertContains(operationsWorkflow, required, `operations workflow must contain ${required}`);
  }
});

test("TASK-049 Users, Shops, System, and Data keep technical values readable", () => {
  const sectionData = readProjectFile("src/server/platform-admin/platform-section-data.ts");
  const platformMasterDetail = readProjectFile("src/components/platform/PlatformMasterDetail.tsx");

  for (const required of [
    "Profile ID ${shortId(account.profileId)}",
    "Shop code ${shop.shop_code}",
    "Code ${shop.shop_code}",
    "devices[0].updated_at",
    "latestSync.created_at",
  ]) {
    assertContains(sectionData, required, `section data must contain ${required}`);
  }

  assert.match(
    platformMasterDetail,
    /isLikelyIdentifier[\s\S]*font-mono[\s\S]*break-all/,
    "detail/table ID rendering should use monospace and robust wrapping",
  );
  assert.doesNotMatch(
    sectionData,
    /state: staffIssue \? staffIssue\.code : "PASS_WITH_NOTES"/,
    "System/Data primary state should not expose raw technical codes",
  );
});

test("TASK-049 docs and evidence record DONE reconciliation without external PASS inflation", () => {
  const taskPath = "docs/TASKS/TASK-049-master-console-admins-ui-ux-polish.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-049/README.md";
  assertPathExists(taskPath);
  assertPathExists(evidencePath);

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const docs = `${masterPlan}\n${task}\n${evidence}`;

  for (const required of [
    "TASK-049 - Master Console Admins UI/UX polish",
    "Stato TASK-049: `DONE_RECONCILED`",
    "Fase TASK-049: `DONE_RECONCILED`",
    "Devices and Sync remain outside the primary Master Console sidebar.",
    "No schema changes",
    "No RPC changes",
    "Commit/push finale su `main` autorizzati",
  ]) {
    assertContains(docs, required, `TASK-049 docs must contain ${required}`);
  }

  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`/,
  );
  assert.match(docs, /Stato TASK-049: `DONE_RECONCILED`/);
});
