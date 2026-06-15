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
