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

test("TASK-073 account identity model renders provider without email-domain inference", () => {
  assertPathExists("src/lib/account-identity.ts");
  assertPathExists("src/components/account/AccountIdentity.tsx");

  const model = readProjectFile("src/lib/account-identity.ts");
  const component = readProjectFile("src/components/account/AccountIdentity.tsx");
  const authIdentities = readProjectFile("src/server/platform-admin/auth-identities.ts");

  for (const required of [
    'export type AccountOrigin = "google" | "email" | "apple" | "wechat" | "unknown";',
    "createAccountIdentitySummary",
    "normalizeAccountOrigin",
    'token === "google"',
    'token === "email"',
    'token === "apple"',
    'token === "apple_id"',
    'token === "wechat"',
    'token === "weixin"',
    'return "unknown";',
    "accountIdentityPrimaryText",
    "shortAccountProfileId",
  ]) {
    assertContains(model, required);
  }

  for (const required of [
    "export function AccountIdentity",
    "function ProviderIcon",
    "accountOriginLabel(identity.origin, locale)",
    "accountProfileLabel(locale)",
    "shortAccountProfileId(identity.profileId)",
    "displayNameSecondary",
    "ProviderIcon origin={identity.origin}",
  ]) {
    assertContains(component, required);
  }

  assert.doesNotMatch(model, /gmail|googlemail|icloud|hotmail|outlook|qq\.com|wechat\.com/i);
  assert.doesNotMatch(authIdentities, /providers\.add\("email"\)|providers\.add\("phone"\)/);
});

test("TASK-073 account identities stay server-scoped and table-safe", () => {
  const authIdentities = readProjectFile("src/server/platform-admin/auth-identities.ts");
  const platformData = readProjectFile("src/components/platform/platformData.ts");
  const shopSections = readProjectFile("src/components/shop/shopSections.ts");
  const translateSections = readProjectFile("src/i18n/translate-sections.ts");
  const adminTable = readProjectFile("src/components/admin/AdminDataTable.tsx");
  const masterDetail = readProjectFile("src/components/platform/PlatformMasterDetail.tsx");
  const dataTable = readProjectFile("src/components/platform/components/DataTable.tsx");

  for (const required of [
    'import "server-only"',
    "loadAuthIdentitySummariesByIds",
    "admin.auth.admin.getUserById(profileId)",
    "PlatformAuthIdentityLoadResult",
  ]) {
    assertContains(authIdentities, required);
  }

  for (const required of [
    "AccountIdentitySummary",
    "string | AccountIdentitySummary",
  ]) {
    assertContains(platformData, required);
    assertContains(shopSections, required);
  }

  for (const source of [translateSections, adminTable, masterDetail, dataTable]) {
    assertContains(source, "isAccountIdentitySummary");
  }

  assertContains(adminTable, "AccountIdentity identity={rawValue} locale={locale}");
  assertContains(masterDetail, "AccountIdentity identity={value} locale={locale}");
  assertContains(dataTable, "AccountIdentity identity={cellValue}");
  assertContains(translateSections, 'key === "rowKey" || isAccountIdentitySummary(value)');
});

test("TASK-073 Shop Admin and Master Console use account identities without Staff POS mixing", () => {
  const shopReadModel = readProjectFile("src/server/shop-admin/read-model.ts");
  const shopAuditReadModel = readProjectFile("src/server/shop-admin/audit-read-model.ts");
  const shopSectionData = readProjectFile("src/server/shop-admin/shop-section-data.ts");
  const platformSectionData = readProjectFile(
    "src/server/platform-admin/platform-section-data.ts",
  );
  const platformAdminsPage = readProjectFile("src/app/platform/admins/page.tsx");

  for (const source of [shopReadModel, shopAuditReadModel]) {
    assertContains(source, "loadAuthIdentitySummariesByIds");
    assertContains(source, "loadScopedAccountIdentityMap");
    assertContains(source, "createAccountIdentitySummary");
    assert.doesNotMatch(source, /auth\.admin\.listUsers/);
  }

  for (const required of [
    "account: member.accountIdentity",
    '{ key: "account", label: "Account" }',
    "event.actorIdentity?.email",
    "Actor provider",
  ]) {
    assertContains(shopSectionData, required);
  }

  assert.match(
    shopSectionData,
    /function staffRow\([\s\S]*?return \{[\s\S]*?\};\n\}/,
    "staffRow must remain a distinct POS/staff row builder",
  );
  assert.doesNotMatch(
    shopSectionData.match(/function staffRow\([\s\S]*?return \{[\s\S]*?\};\n\}/)?.[0] ?? "",
    /accountIdentity|member\.accountIdentity/,
  );

  for (const required of [
    "accountIdentityCell(account)",
    "accountIdentityForProfileId",
    "profile: accountIdentityCell(account)",
  ]) {
    assertContains(platformSectionData, required);
  }
  assert.match(platformSectionData, /actor:\s+accountIdentityForProfileId/);

  assertContains(platformAdminsPage, "AccountIdentity");
  assertContains(platformAdminsPage, "createAccountIdentitySummary");
});
