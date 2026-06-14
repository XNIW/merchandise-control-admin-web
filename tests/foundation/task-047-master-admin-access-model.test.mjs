import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(escapeRegExp(required)), label);
}

function assertPathExists(relativePath) {
  assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
}

test("TASK-047 access entrypoints use Master Console and Admin Console terminology", () => {
  const home = readProjectFile("src/app/page.tsx");
  const loginPage = readProjectFile("src/app/auth/login/page.tsx");
  const loginAction = readProjectFile("src/app/auth/login/actions.ts");
  const authForm = readProjectFile("src/components/auth/AuthForm.tsx");
  const staffLoginPage = readProjectFile(
    "src/app/(staff-auth)/shop/staff-login/page.tsx",
  );
  assertPathExists("src/components/auth/ShopCodeLoginForm.tsx");
  const shopCodeLoginForm = readProjectFile(
    "src/components/auth/ShopCodeLoginForm.tsx",
  );
  const platformLayout = readProjectFile("src/app/platform/layout.tsx");
  const platformShell = readProjectFile("src/components/platform/AppShell.tsx");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");
  const shopShell = readProjectFile("src/components/shop/ShopShell.tsx");

  for (const required of ["/auth/login?next=/shop&mode=admin-account", "redirect"]) {
    assertContains(home, required, `home must contain ${required}`);
  }

  assert.doesNotMatch(home, /Master Console/);
  assert.doesNotMatch(home, /\/auth\/login\?next=\/platform/);
  assert.doesNotMatch(home, /Admin Console access/);
  assert.doesNotMatch(home, /\/shop\/staff-login/);

  for (const required of [
    "Master Console",
    "Admin Console",
    "Admin account",
    "Shop code",
    "loginHref(nextPath, \"admin-account\")",
    "loginHref(nextPath, \"shop-code\")",
    "isSafeInternalNextPath",
  ]) {
    assertContains(loginPage, required, `account login must contain ${required}`);
  }

  assertContains(authForm, "accountSignInAction");
  assertContains(loginAction, "redirect(nextPath, RedirectType.replace)");
  assertContains(loginAction, "signInWithPassword");
  assertContains(staffLoginPage, "safeNextPath(firstParam(params.next))");
  assertContains(staffLoginPage, 'mode: "shop-code"');
  assertContains(`${loginPage}\n${shopCodeLoginForm}`, "Admin Console");
  assertContains(shopCodeLoginForm, "Shop code");
  assertContains(shopCodeLoginForm, "Staff code");
  assertContains(`${loginPage}\n${shopCodeLoginForm}`, "single-shop");
  assertContains(platformLayout, 'area="Master Console"');
  assertContains(platformShell, "Master Console");
  assertContains(shopLayout, 'area="Admin Console"');
  assertContains(shopShell, "Admin Console");

  assert.doesNotMatch(
    `${home}\n${loginPage}\n${authForm}\n${loginAction}`,
    /Return to Admin Web|Opening Admin Web|area="Admin Web"/,
  );
  assert.doesNotMatch(
    `${platformLayout}\n${platformShell}`,
    /Platform Admin Console|area="Platform Admin"|not Platform Admin/,
  );
  assert.doesNotMatch(
    `${shopLayout}\n${shopShell}\n${shopCodeLoginForm}`,
    /Shop Admin Console|area="Shop Admin"/,
  );
});

test("TASK-047 keeps route guards technical while documenting equivalent shop access", () => {
  const platformLayout = readProjectFile("src/app/platform/layout.tsx");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");
  const accessPrincipal = readProjectFile("src/server/shop-admin/access-principal.ts");
  const dataAccess = readProjectFile("src/server/shop-admin/data-access.ts");

  assertContains(platformLayout, 'access.status !== "platform_admin"');
  assertContains(platformLayout, 'loginHref="/auth/login?next=/platform"');
  assertContains(shopLayout, "resolveShopAdminDataAccess");
  assertContains(shopLayout, 'principal.kind === "personal_account"');
  assertContains(accessPrincipal, '"personal_account"');
  assertContains(accessPrincipal, '"pos_staff_manager"');
  assertContains(dataAccess, "resolveCurrentShopAdminPrincipal");
  assertContains(dataAccess, "resolveStaffWebSessionPrincipal");
  assertContains(dataAccess, 'principal.kind === "personal_account"');
  assertContains(dataAccess, 'principalKind: "pos_staff_manager"');
  assertContains(dataAccess, "adminClient");
});

test("TASK-047 governance docs record product decision and access matrix", () => {
  for (const relativePath of [
    "docs/TASKS/TASK-047-align-master-console-admin-console-access-model.md",
    "docs/TASKS/EVIDENCE/TASK-047/README.md",
    "docs/RUNBOOKS/admin-console-personal-account-login.md",
    "docs/RUNBOOKS/admin-console-shop-code-login.md",
    "docs/RUNBOOKS/platform-master-console-local-login.md",
    "docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md",
  ]) {
    assertPathExists(relativePath);
  }

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(
    "docs/TASKS/TASK-047-align-master-console-admin-console-access-model.md",
  );
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-047/README.md");
  const architecture = readProjectFile(
    "docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md",
  );
  const masterRunbook = readProjectFile(
    "docs/RUNBOOKS/platform-master-console-local-login.md",
  );
  const personalRunbook = readProjectFile(
    "docs/RUNBOOKS/admin-console-personal-account-login.md",
  );
  const shopCodeRunbook = readProjectFile(
    "docs/RUNBOOKS/admin-console-shop-code-login.md",
  );
  const docs = [
    masterPlan,
    task,
    evidence,
    architecture,
    masterRunbook,
    personalRunbook,
    shopCodeRunbook,
  ].join("\n");

  for (const required of [
    "TASK-047",
    "Master Console",
    "Admin Console",
    "`/platform`",
    "`/shop`",
    "personal_account",
    "shop-code/staff-code",
    "staff_accounts",
    "staff_web_sessions",
    "permission-equivalent",
    "Win7POS",
    "Android/iOS",
    "POS-first shop",
    "no production",
  ]) {
    assertContains(docs, required, `docs must contain ${required}`);
  }

  assert.match(masterPlan, /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-047 - Align Master Console and Admin Console access model`|Task attivo: `TASK-048 - Master Console secondary sections clarity and UX polish`|Task attivo: `TASK-049 - Master Console Admins UI\/UX polish`|Task attivo: `TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049`|Task attivo: `TASK-053 - Authorization architecture and staff safe read boundary fix`|Task attivo: `TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar\/diagnostics`/);
  assert.match(masterPlan, /Stato TASK-047: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Fase TASK-047: `DONE_RECONCILED`/);
  assert.doesNotMatch(
    `${task}\n${evidence}`,
    /production PASS|fake data|dati reali.*PASS/,
  );
});

test("TASK-047 Master Console users and shops expose row details without auth secrets", () => {
  const platformData = readProjectFile("src/components/platform/platformData.ts");
  const platformShell = readProjectFile("src/components/platform/AppShell.tsx");
  const platformSidebarNav = readProjectFile(
    "src/components/platform/PlatformSidebarNav.tsx",
  );
  const platformPage = readProjectFile("src/components/platform/PlatformPage.tsx");
  const masterDetail = readProjectFile(
    "src/components/platform/PlatformMasterDetail.tsx",
  );
  const userListPage = readProjectFile("src/app/platform/users/page.tsx");
  const shopListPage = readProjectFile("src/app/platform/shops/page.tsx");
  const userDetailPage = readProjectFile(
    "src/app/platform/users/[profileId]/page.tsx",
  );
  const shopDetailPage = readProjectFile(
    "src/app/platform/shops/[shopId]/page.tsx",
  );
  const sectionData = readProjectFile(
    "src/server/platform-admin/platform-section-data.ts",
  );

  for (const required of [
    'type RowDetailPanel',
    "type RowDetailGroup",
    "type PlatformFilter",
    "type PlatformDetailSection",
    '{ key: "origin", label: "Origin" }',
    '{ key: "access", label: "Access" }',
    '{ key: "shops", label: "Shops" }',
    '{ key: "owners", label: "Owners" }',
    '{ key: "members", label: "Members" }',
    '{ key: "devices", label: "Devices" }',
    "backHref?: string",
    "backLabel?: string",
    "filters?: PlatformFilter[]",
    "detailSections?: PlatformDetailSection[]",
    "rowDetails?: RowDetailPanel[]",
  ]) {
    assertContains(platformData, required, `platform data must contain ${required}`);
  }

  for (const required of [
    "lg:sticky",
    "lg:top-0",
    "lg:h-screen",
    "lg:overflow-y-auto",
    "lg:min-h-0",
  ]) {
    assertContains(platformShell, required, `platform shell must contain ${required}`);
  }

  for (const required of ["lg:min-h-0", "lg:overflow-y-auto"]) {
    assertContains(
      platformSidebarNav,
      required,
      `platform sidebar nav must contain ${required}`,
    );
  }

  for (const required of [
    '"use client"',
    "useState",
    "usePathname",
    "searchTerm",
    "activeFilters",
    "filteredRows",
    "navigator.clipboard.writeText",
    "statusToneClassForSegment",
    "bg-emerald-50",
    "bg-rose-50",
    "bg-amber-50",
    "role={hasDetail ? \"button\" : undefined}",
    "border-l-4",
    "border-l-slate-950",
    "selected row",
    "window.history.replaceState",
    "scrollIntoView",
    "selectedRowKey",
    "renderDetailGroups",
    "sticky bottom-0",
    "2xl:sticky",
    "self-start",
    "Open full detail",
    "Inspector",
  ]) {
    assertContains(masterDetail, required, `master detail must contain ${required}`);
  }
  assert.doesNotMatch(masterDetail, /scroll={false}/);

  assertContains(platformPage, "PlatformMasterDetail");
  assertContains(platformPage, "section.rowDetails !== undefined && section.rowDetails.length > 0");
  assertContains(platformPage, "selectedRowKey");
  assertContains(platformPage, "section.filters");
  assertContains(platformPage, "section.detailSections");
  assertContains(platformPage, "section.backHref");
  assertContains(platformPage, "Diagnostics");
  assert.doesNotMatch(platformPage, /title="Read state"/);

  for (const required of [
    "searchParams",
    "selected?: string | string[]",
    "selectedRowKey={firstParam(params.selected)}",
  ]) {
    assertContains(`${userListPage}\n${shopListPage}`, required);
  }

  for (const required of [
    "returnTo?: string | string[]",
    "safeReturnTo",
    "Back to Users",
    "/platform/users?selected=",
  ]) {
    assertContains(userDetailPage, required, `user detail must contain ${required}`);
  }

  for (const required of [
    "returnTo?: string | string[]",
    "safeReturnTo",
    "Back to Shops",
    "/platform/shops?selected=",
  ]) {
    assertContains(shopDetailPage, required, `shop detail must contain ${required}`);
  }

  for (const required of [
    "function accountOriginForProfile",
    'return "Not captured"',
    "function accessSummaryForProfile",
    "function shopCodesForProfile",
    "function profileDiagnostics",
    "function shopDeviceSummary",
    "function shopHealthSummary",
    "function userRowDetail",
    "function shopRowDetail",
    "shopAccessSummaryForProfile",
    "ownerSummaryForShop",
    "memberSummaryForShop",
    "Identity",
    "Account origin",
    "Shop memberships",
    "Recent audit",
    "Diagnostics",
    "Overview",
    "Owners & members",
    "Sync & audit",
    "Operations boundary",
    "Related data limited by current boundary",
    "Search users by name or profile ID",
    "Search shops by name, code, or ID",
    'label: "State"',
    'label: "Access"',
    'label: "Owner status"',
    "No devices visible",
    "No sync visible",
    "No roles visible",
    "rowDetails: readModel.profiles.map",
    "rowDetails: readModel.shops.map",
    "detailSections:",
    "`/platform/users/${profile.profile_id}`",
    "`/platform/shops/${shop.shop_id}`",
    "Provider origin is not captured in the current safe profile DTO.",
    "No auth secret fields are queried or rendered.",
  ]) {
    assertContains(sectionData, required, `section data must contain ${required}`);
  }

  assert.doesNotMatch(sectionData, /No device rows visible/);
  assert.doesNotMatch(sectionData, /No sync rows visible/);
  assert.doesNotMatch(sectionData, /No member roles visible/);
  assert.doesNotMatch(sectionData, /Master admin No shop access/);
});
