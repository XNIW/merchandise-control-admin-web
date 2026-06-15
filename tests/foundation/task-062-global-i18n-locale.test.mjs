import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-062 defines a global locale contract with cookie fallback", () => {
  const locales = readProjectFile("src/i18n/locales.ts");
  const serverLocale = readProjectFile("src/i18n/get-locale.ts");
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");

  assert.match(locales, /LOCALE_COOKIE_NAME = "mc_admin_locale"/);
  assert.match(locales, /DEFAULT_LOCALE = "en"/);

  for (const locale of ['"it"', '"en"', '"es"', '"zh-CN"']) {
    assert.match(locales, new RegExp(locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const label of ["Italiano", "English", "Español", "简体中文"]) {
    assert.match(locales, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(serverLocale, /import "server-only"/);
  assert.match(serverLocale, /await cookies\(\)/);
  assert.match(serverLocale, /normalizeLocale/);

  for (const localeKey of ["en", "it", "es", "zh-CN"]) {
    const escapedKey = localeKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(dictionaries, new RegExp(`(?:${escapedKey}|${JSON.stringify(localeKey)}):`));
  }
});

test("TASK-062 connects locale to global layouts and client refresh switcher", () => {
  const rootLayout = readProjectFile("src/app/layout.tsx");
  const shopLayout = readProjectFile("src/app/shop/layout.tsx");
  const platformProvisioningPage = readProjectFile(
    "src/app/platform/provisioning/page.tsx",
  );
  const appShell = readProjectFile("src/components/platform/AppShell.tsx");
  const shopShell = readProjectFile("src/components/shop/ShopShell.tsx");
  const switcher = readProjectFile("src/components/language-switcher.tsx");

  assert.match(rootLayout, /const locale = await getLocale\(\)/);
  assert.match(rootLayout, /lang=\{locale\}/);

  assert.match(shopLayout, /getI18n/);
  assert.match(shopLayout, /translateShopNavigationSections/);
  assert.match(shopLayout, /languageSwitcherLabel/);

  assert.match(appShell, /LanguageSwitcher/);
  assert.match(appShell, /translatePlatformNavigationItems/);
  assert.match(appShell, /getI18n/);

  assert.match(shopShell, /LanguageSwitcher/);
  assert.match(shopShell, /navigationSections/);
  assert.match(shopShell, /sharedGuardrails/);

  assert.match(platformProvisioningPage, /getI18n/);
  assert.match(platformProvisioningPage, /createPlatformProvisioningLabels/);
  assert.match(platformProvisioningPage, /labels=\{labels\}/);

  assert.match(switcher, /document\.cookie/);
  assert.match(switcher, /LOCALE_COOKIE_NAME/);
  assert.match(switcher, /router\.refresh\(\)/);
  assert.doesNotMatch(switcher, /localStorage|sessionStorage/);
});

test("TASK-062 guards critical UI copy against untranslated non-English locales", () => {
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");
  const platformProvisioningLabels = readProjectFile(
    "src/app/platform/provisioning/provisioningLabels.ts",
  );

  for (const phrase of [
    "Legacy mobile bridge",
    "Ready via legacy bridge",
    "Filtered catalog rows",
    "Products loaded",
    "Live shop data",
    "Operational cards",
    "No operational rows are visible",
    "Price history",
    "Invite member",
    "Register device",
    "Create staff",
    "Reset credential",
    "Staff role permissions",
    "Type REVOKE as confirmation",
    "Type PERMISSIONS as confirmation",
    "Grant Platform Admin",
    "Controlled operations workflow",
    "Emergency revoke device",
    "Type shop code to confirm",
    "Moved to Products",
    "Open Products",
    "Import and export actions now live in the Products Catalog Workspace. This compatibility page keeps existing import/export links available.",
    "Workbook",
    "Workbook file",
    "Check workbook",
    "Review import",
    "Database transfer",
    "Import supplier Excel",
    "Advanced mapping",
    "Review summary",
    "Safety notes",
    "Operational warnings",
    "Safety sanitization",
    "Sheet samples",
    "Show detailed product rows",
    "Importing database...",
    "Import database workbook",
    "Preview database workbook",
    "Upload an Android database export workbook before previewing.",
    "Android database export detected",
    "Android database columns were recognized automatically.",
    "Download catalog export",
    "Download template",
    "Rows come from the server read model when available; empty states explain the current boundary.",
    "Active",
    "Active grants",
    "Active owner memberships",
    "Active shops",
    "Company RUT",
    "Global Platform Admin overview loaded server-side through Supabase RLS.",
    "Provision Shop",
    "Shop onboarding",
    "Create shop with existing owner",
    "Create pending owner invite",
    "Owner email",
    "Overview shop",
    "Data status",
    "Device signals",
    "Device signals appear after POS or mobile registration.",
    "Device signals appear after POS or mobile registration. Sync source ids alone do not authorize a device.",
    "Device warnings",
    "Device/sync data health",
    "Global registry",
    "Historical shops",
    "Needs provisioning review",
    "Operational shops",
    "Profiles",
    "Profiles checked",
    "Profiles, shops, audit, devices, sync",
    "Read-only diagnostics",
    "Recent sync on suspended shop",
    "Requires review",
    "Membership, owner, or read warnings",
    "RLS/grants summary",
    "Selects pass through authenticated RLS only",
    "Server-side directory",
    "Shop owners",
    "Shops without owner",
    "Sync signals",
    "Sync signals are diagnostic; live Win7POS Sales Sync remains separately verified.",
    "Total shops",
    "Use it when checking device authorization, revoked devices, or suspicious device state for support triage.",
    "Visible through Platform Admin",
    "Visible through RLS",
    "Shop-scoped catalog rows loaded server-side for the verified selected shop.",
    "Shop Staff read model loaded server-side through the credential-safe view.",
    "Server registry devices loaded for the verified selected shop, with read-only links to sync activity when available.",
    "No sync event",
    "Shop-scoped mobile history entries loaded with legacy owner fallback.",
    "Shop catalog products for the verified selected shop. Create, update, archive and restore use audited catalog RPCs.",
    "restore requires confirmation",
    "Read-only member list for the verified selected shop. Profile identifiers are shortened in the UI.",
    "Rows scoped by shop_id",
    "revoked",
    "revoked or suspicious",
    "visible devices",
    "failed technical events",
    "latest events",
    "latest sync/history events",
    "platform admins",
    "orphaned memberships",
    "profiles without membership",
    "shops without owner",
    "suspended shops with recent activity",
    "active",
    "archived",
    "good",
    "muted",
    "neutral",
    "suspended",
    "total",
    "warning",
    "Not available yet",
    "Permissions matrix",
    "Staff credential-safe read model",
    "Trusted POS devices, sessions and staff links for the verified selected shop. This view is read-only and does not include sales synchronization.",
    "Device registry",
    "Sync events",
    "History entries are loaded from shared_sheet_sessions. Sync events are technical synchronization logs linked to those entries. Admin audit events are shown separately in Audit.",
    "Shop audit log",
    "Shop profile and fiscal identity",
    "Drop a catalog database .xlsx or .xls workbook here or choose a file.",
  ]) {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const translationCount = [...dictionaries.matchAll(new RegExp(`"${escapedPhrase}"\\s*:`, "g"))]
      .length;

    assert.equal(
      translationCount,
      3,
      `${phrase} must be covered in it/es/zh-CN exact dictionaries`,
    );
  }

  const provisioningLabelKeys = [
    ...platformProvisioningLabels.matchAll(/^  "((?:[^"\\]|\\.)*)",$/gm),
  ].map((match) => JSON.parse(`"${match[1]}"`));

  assert.ok(
    provisioningLabelKeys.length > 100,
    "Platform provisioning i18n labels should cover the full form/recovery UI",
  );

  for (const phrase of provisioningLabelKeys) {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const translationCount = [
      ...dictionaries.matchAll(new RegExp(`"${escapedPhrase}"\\s*:`, "g")),
    ].length;

    assert.equal(
      translationCount,
      3,
      `${phrase} must be covered in it/es/zh-CN exact dictionaries`,
    );
  }

  execFileSync(process.execPath, ["scripts/i18n-hardcoded-ui-scan.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
});

test("TASK-062 wires rendered i18n corrections into runtime translators and scans read models", () => {
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");
  const sectionTranslator = readProjectFile("src/i18n/translate-sections.ts");
  const staticScanner = readProjectFile("scripts/i18n-hardcoded-ui-scan.mjs");
  const renderedScanner = readProjectFile("scripts/i18n-rendered-text-scan.mjs");

  assert.match(
    dictionaries,
    /exact:\s*\{\s*\.{3}itExact,\s*\.{3}itRenderedCorrectiveExact\s*\}/,
  );
  assert.match(
    dictionaries,
    /exact:\s*\{\s*\.{3}esExact,\s*\.{3}esRenderedCorrectiveExact\s*\}/,
  );
  assert.match(
    dictionaries,
    /exact:\s*\{\s*\.{3}zhExact,\s*\.{3}zhRenderedCorrectiveExact\s*\}/,
  );
  assert.match(dictionaries, /companyRutPrefix: "RUT azienda"/);
  assert.match(dictionaries, /companyRutPrefix: "RUT empresa"/);
  assert.match(dictionaries, /companyRutPrefix: "公司 RUT"/);

  assert.match(sectionTranslator, /"group"/);
  assert.match(sectionTranslator, /"label"/);
  assert.match(sectionTranslator, /"summary"/);
  assert.match(sectionTranslator, /function translateRowValue/);
  assert.match(sectionTranslator, /function shouldTranslateWholeRowValue/);
  assert.match(sectionTranslator, /normalized === "detail"/);
  assert.doesNotMatch(sectionTranslator, /normalized === "value"/);
  assert.doesNotMatch(sectionTranslator, /normalized\.endsWith\("value"\)/);

  for (const sourceFile of [
    "src/server/shop-admin/history-read-model.ts",
    "src/server/shop-admin/device-read-model.ts",
    "src/server/shop-admin/pos-live-read-model.ts",
    "src/server/shop-admin/read-model.ts",
    "src/server/shop-admin/staff-read-model.ts",
    "src/server/shop-admin/audit-read-model.ts",
    "src/server/shop-admin/inventory-read-model.ts",
    "src/app/shop/products/page.tsx",
    "src/app/shop/categories/page.tsx",
    "src/app/shop/suppliers/page.tsx",
    "src/app/shop/members/page.tsx",
    "src/app/shop/roles/page.tsx",
    "src/app/shop/staff/page.tsx",
    "src/app/shop/pos/page.tsx",
    "src/app/shop/devices/page.tsx",
    "src/app/shop/sync/page.tsx",
    "src/app/shop/history/page.tsx",
    "src/app/shop/audit/page.tsx",
    "src/app/shop/settings/page.tsx",
    "src/app/platform/audit/page.tsx",
    "src/app/platform/data/page.tsx",
    "src/app/platform/devices/page.tsx",
    "src/app/platform/history/page.tsx",
    "src/app/platform/shops/page.tsx",
    "src/app/platform/shops/new/page.tsx",
    "src/app/platform/support/page.tsx",
    "src/app/platform/sync/page.tsx",
    "src/app/platform/system/page.tsx",
    "src/app/platform/users/page.tsx",
  ]) {
    assert.match(staticScanner, new RegExp(sourceFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const phrase of [
    "Active",
    "Active grants",
    "Active owner memberships",
    "Active shops",
    "Company RUT",
    "Device signals",
    "Device signals appear after POS or mobile registration.",
    "Device signals appear after POS or mobile registration. Sync source ids alone do not authorize a device.",
    "Device warnings",
    "Device/sync data health",
    "Global Platform Admin overview loaded server-side through Supabase RLS.",
    "Provision Shop",
    "Shop onboarding",
    "Create shop with existing owner",
    "Create pending owner invite",
    "Owner email",
    "Global registry",
    "Historical shops",
    "Needs provisioning review",
    "Operational shops",
    "Profiles",
    "Profiles checked",
    "Profiles, shops, audit, devices, sync",
    "Read-only diagnostics",
    "Recent sync on suspended shop",
    "Requires review",
    "Membership, owner, or read warnings",
    "RLS/grants summary",
    "Selects pass through authenticated RLS only",
    "Server-side directory",
    "Shop owners",
    "Shops without owner",
    "Sync signals",
    "Sync signals are diagnostic; live Win7POS Sales Sync remains separately verified.",
    "Total shops",
    "Use it when checking device authorization, revoked devices, or suspicious device state for support triage.",
    "Visible through Platform Admin",
    "Visible through RLS",
    "Overview shop",
    "Shop catalog products for the verified selected shop. Create, update, archive and restore use audited catalog RPCs.",
    "Read-only member list for the verified selected shop. Profile identifiers are shortened in the UI.",
    "Permissions matrix",
    "Staff credential-safe read model",
    "Trusted POS devices, sessions and staff links for the verified selected shop. This view is read-only and does not include sales synchronization.",
    "Device registry",
    "Sync events",
    "History entries are loaded from shared_sheet_sessions. Sync events are technical synchronization logs linked to those entries. Admin audit events are shown separately in Audit.",
    "Shop audit log",
    "Shop profile and fiscal identity",
    "Shop Staff",
    "legacy owner fallback",
    "revoked",
    "revoked or suspicious",
    "visible devices",
    "latest events",
    "latest sync/history events",
    "platform admins",
    "orphaned memberships",
    "profiles without membership",
    "shops without owner",
    "suspended shops with recent activity",
    "active",
    "archived",
    "good",
    "muted",
    "neutral",
    "suspended",
    "total",
    "warning",
  ]) {
    if (
      !["Company RUT", "Shop Staff", "legacy owner fallback", "revoked"].includes(
        phrase,
      )
    ) {
      assert.match(staticScanner, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(renderedScanner, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(renderedScanner, /requires --input <snapshot\.json>/);
  assert.match(renderedScanner, /requiredRoutes/);
  assert.doesNotMatch(
    dictionaries,
    /"Ready"\s*:\s*"Ready"/,
    "zh-CN and other non-English exact dictionaries must not keep Ready as English",
  );
  assert.match(dictionaries, /"Ready"\s*:\s*"就绪"/);
});
