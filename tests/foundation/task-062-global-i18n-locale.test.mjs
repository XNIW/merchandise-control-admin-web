import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(
    source,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    label,
  );
}

const renderedRequiredRoutes = [
  "/shop",
  "/shop/products",
  "/shop/categories",
  "/shop/suppliers",
  "/shop/members",
  "/shop/roles",
  "/shop/staff",
  "/shop/pos",
  "/shop/devices",
  "/shop/sync",
  "/shop/history",
  "/shop/audit",
  "/shop/settings",
  "/shop/import-export",
  "/platform",
  "/platform/users",
  "/platform/shops",
  "/platform/shops/new",
  "/platform/admins",
  "/platform/audit",
  "/platform/system",
  "/platform/data",
  "/platform/devices",
  "/platform/sync",
  "/platform/history",
  "/platform/operations",
  "/platform/support",
  "/platform/provisioning",
];

function writeRenderedSnapshot(locale, textByRoute = {}) {
  const directory = mkdtempSync(join(tmpdir(), "task062-rendered-"));
  const path = join(directory, "snapshot.json");
  const records = renderedRequiredRoutes.map((route) => ({
    lang: locale,
    locale,
    route,
    text:
      textByRoute[route] ??
      "供应商ID 商品ID 更新时间 2026年6月14日 21:16 Amanda 123e4567-e89b-12d3-a456-426614174000",
  }));

  writeFileSync(path, JSON.stringify({ records }), "utf8");

  return { directory, path };
}

function runRenderedScanner(path) {
  return execFileSync(
    process.execPath,
    ["scripts/i18n-rendered-text-scan.mjs", "--input", path],
    {
      cwd: root,
      stdio: "pipe",
    },
  );
}

function assertRenderedScannerFails(path, expectedMessage) {
  assert.throws(
    () => runRenderedScanner(path),
    (error) => {
      const output = `${error.stdout?.toString() ?? ""}\n${
        error.stderr?.toString() ?? ""
      }`;

      assert.match(output, expectedMessage);

      return true;
    },
  );
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

test("TASK-062 formats visible date/time values through a central locale helper", () => {
  const formatter = readProjectFile("src/i18n/format.ts");
  const displayFormat = readProjectFile("src/components/platform/displayFormat.ts");
  const shopSectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const platformSectionData = readProjectFile(
    "src/server/platform-admin/platform-section-data.ts",
  );
  const translator = readProjectFile("src/i18n/translate-sections.ts");

  assert.match(formatter, /export function formatDateTime/);
  assert.match(formatter, /export function formatDate\(/);
  assert.match(formatter, /export function formatTime/);
  assert.match(formatter, /es:\s*"es-CL"/);
  assert.match(formatter, /"zh-CN":\s*"zh-CN"/);
  assert.match(formatter, /hour12:\s*false/);
  assert.match(formatter, /hour12:\s*locale === "en"/);
  assert.match(formatter, /formatToParts/);
  assert.match(formatter, /年\$\{parts\.month\}月\$\{parts\.day\}日/);
  assert.match(formatter, /"Sin configurar"/);
  assert.match(formatter, /"未设置"/);
  assert.match(formatter, /Intl\.DateTimeFormat/);

  assert.match(displayFormat, /formatDateTime\(locale, value\)/);
  assert.match(translator, /formatEmbeddedDateTimes/);
  assert.match(translator, /isoDateTimePattern/);
  assert.match(translator, /translateShopSection\([^)]*locale/s);
  assert.match(translator, /translatePlatformSection\([^)]*locale/s);
  assert.doesNotMatch(shopSectionData, /Intl\.DateTimeFormat\("en"/);
  assert.doesNotMatch(platformSectionData, /formatTimestampUtc/);
});

test("TASK-062 localizes technical table and field labels without translating values", () => {
  const dictionaries = readProjectFile("src/i18n/dictionaries.ts");

  for (const [source, zh] of [
    ["Supplier id", "供应商ID"],
    ["Product id", "商品ID"],
    ["Category id", "分类ID"],
    ["Shop ID", "店铺ID"],
    ["Staff id", "员工ID"],
    ["Member id", "成员ID"],
    ["Profile ID", "资料ID"],
    ["Device id", "设备ID"],
    ["Identifier", "标识符"],
    ["Session id", "会话ID"],
    ["Updated at", "更新时间"],
    ["Created at", "创建时间"],
    ["Lockout", "锁定状态"],
    ["Latest sync", "最近同步"],
    ["Latest POS audit", "最近POS审计"],
    ["Metadata", "元数据"],
    ["Target", "目标"],
    ["Payload", "数据载荷"],
    ["Overlay", "覆盖层"],
    ["Entry name", "条目名称"],
    ["Supplier / Category", "供应商 / 分类"],
    ["Device / trust", "设备 / 信任"],
    ["Session", "会话"],
    ["Count", "数量"],
    ["Namespace", "命名空间"],
    ["Permissions", "权限"],
    ["Field", "字段"],
    ["Value", "值"],
    ["Detail", "详情"],
    ["Group", "组"],
    ["Action", "操作"],
  ]) {
    assertContains(dictionaries, `"${source}"`);
    assertContains(dictionaries, `"${source}": "${zh}"`);
  }

  assert.doesNotMatch(
    dictionaries,
    /"Amanda"\s*:/,
    "business supplier names must not become dictionary keys",
  );
  assert.doesNotMatch(
    dictionaries,
    /123e4567-e89b-12d3-a456-426614174000/,
    "UUID values must not become dictionary keys",
  );
});

test("TASK-062 rendered scanner accepts localized zh-CN timestamps and business values", () => {
  const { directory, path } = writeRenderedSnapshot("zh-CN");

  try {
    const output = JSON.parse(runRenderedScanner(path).toString());

    assert.equal(output.status, "pass");
    assert.equal(output.nonEnglishRecords, renderedRequiredRoutes.length);
    assert.ok(output.checkedZhTechnicalHeaders >= 30);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("TASK-062 rendered scanner rejects English timestamps and zh-CN technical headers", () => {
  const englishDate = writeRenderedSnapshot("zh-CN", {
    "/shop/suppliers": "供应商ID Jun 14, 2026, 9:16 PM Amanda",
  });
  const slashDate = writeRenderedSnapshot("zh-CN", {
    "/shop/suppliers": "供应商ID 2026/6/14 21:16 Amanda",
  });
  const englishHeader = writeRenderedSnapshot("zh-CN", {
    "/shop/products": "SUPPLIER ID\t更新时间\t2026年6月14日 21:16",
  });
  const italianEnglishDate = writeRenderedSnapshot("it", {
    "/platform/shops": "ID shop Jun 14, 2026 Amanda",
  });

  try {
    assertRenderedScannerFails(englishDate.path, /English month date format/);
    assertRenderedScannerFails(englishDate.path, /English AM\/PM time marker/);
    assertRenderedScannerFails(slashDate.path, /slash date format/);
    assertRenderedScannerFails(
      englishHeader.path,
      /untranslated technical header "SUPPLIER ID"/,
    );
    assertRenderedScannerFails(
      italianEnglishDate.path,
      /it \/platform\/shops: English month date format/,
    );
  } finally {
    rmSync(englishDate.directory, { force: true, recursive: true });
    rmSync(slashDate.directory, { force: true, recursive: true });
    rmSync(englishHeader.directory, { force: true, recursive: true });
    rmSync(italianEnglishDate.directory, { force: true, recursive: true });
  }
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
    "Import and export actions now live on the Products page. This compatibility page keeps existing import/export links available.",
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
    "Device signals are aggregated for support.",
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
    "Shop scoped",
    "Shop scoped or legacy bridge",
    "Audited create/update/archive",
    "Audited create/update/archive/restore",
    "No client-side shop trust",
    "No cross-shop event lookup",
    "Mapped owner source",
    "File changes are never applied directly",
    "Server-only workbook parser/writer",
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
  assert.match(dictionaries, /shopCodePrefix: "Codice shop"/);
  assert.match(dictionaries, /shopCodePrefix: "Codigo shop"/);
  assert.match(dictionaries, /shopCodePrefix: "店铺代码"/);

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
    "Device signals are aggregated for support.",
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
    "Shop scoped",
    "Shop scoped or legacy bridge",
    "Audited create/update/archive",
    "Audited create/update/archive/restore",
    "No client-side shop trust",
    "No cross-shop event lookup",
    "Mapped owner source",
    "File changes are never applied directly",
    "Server-only workbook parser/writer",
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
