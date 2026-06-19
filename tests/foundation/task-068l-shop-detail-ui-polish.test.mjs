import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} is missing`);

  const next = source.indexOf("\nfunction ", start + 1);

  return source.slice(start, next === -1 ? undefined : next);
}

test("TASK-068L shop full detail uses email-first owner identity and Platform Admin as secondary overlap", () => {
  const sectionData = read(
    "src/server/platform-admin/platform-section-data.ts",
  );
  const adminAccessActions = read(
    "src/app/platform/shops/[shopId]/ShopAdminAccessActions.tsx",
  );
  const linkedInventoryFields = functionBody(
    sectionData,
    "linkedMobileInventorySourceFields",
  );
  const shopProfileFiscalFields = functionBody(
    sectionData,
    "shopProfileFiscalFields",
  );
  const shopDetailSections = functionBody(sectionData, "shopDetailSections");

  assertContains(sectionData, "accountSafeEmail(account)");
  assertContains(sectionData, "isGenericAccountDisplayName(displayName)");

  for (const required of [
    "accountPrimaryLabelForProfile(",
    "primaryOwnerProfileId,",
    "primaryOwnerProfileIdForShop(",
    "members,",
    'title: "Header shop"',
    'title: "Key status cards"',
    'label: "Owner account"',
    'label: "Role"',
    'label: "Owner status"',
    'label: "Operational access"',
    'label: "Platform Admin overlap"',
    "Platform Admin overlap is shown as global context, not as the owner account name.",
  ]) {
    assertContains(shopDetailSections, required);
  }

  assertContains(sectionData, "includeAuthIdentities: true");
  assertContains(sectionData, "mobileInventoryShopIds: [shopId]");
  assertContains(adminAccessActions, "primaryAccountLabel(member)");
  assertContains(adminAccessActions, "Profile label");
  assertContains(adminAccessActions, "!isUnavailableIdentity(member.email)");

  for (const required of [
    'label: "Owner account"',
    'label: "Platform Admin overlap"',
    'label: "Products"',
    'label: "Suppliers"',
    'label: "Categories"',
    'label: "Price history rows"',
    'label: "History sessions"',
    'label: "Sync events"',
    'label: "Mapping state"',
  ]) {
    assertContains(linkedInventoryFields, required);
  }

  assert.doesNotMatch(linkedInventoryFields, /Profile display name|Badges/);

  for (const required of [
    'label: "Shop name"',
    'label: "Shop code"',
    'label: "Shop ID"',
    'label: "Status"',
    'label: "Created"',
    'label: "Updated"',
    'label: "Fiscal identity"',
  ]) {
    assertContains(shopProfileFiscalFields, required);
  }
});

test("TASK-068L mobile inventory count loading is scoped to visible or requested owners", () => {
  const readModel = read("src/server/platform-admin/read-model.ts");

  assertContains(readModel, "mobileInventoryShopIds?: readonly string[]");
  assertContains(readModel, "requestedMobileInventoryOwnerIds");
  assertContains(readModel, "mappedVisibleAccountOwnerIds");
  assert.doesNotMatch(
    readModel,
    /const mobileInventoryOwnerIds = Array\.from\(\s*new Set\(\[\s*\.\.\.shopOwnerMappings[\s\S]*?loadMobileInventoryDataSummaries/,
    "mobile inventory count loading must not fan out over every mapping row",
  );
});

test("TASK-068L shop detail renderer supports aligned badges and long owner email values", () => {
  const platformPage = read("src/components/platform/PlatformPage.tsx");
  const statCard = read("src/components/platform/components/StatCard.tsx");

  for (const required of [
    "badgeLikeFieldLabels",
    '"Platform Admin overlap"',
    '"Inventory source"',
    '"Operational access"',
    '"Owner status"',
    "const badgeClass = badgeClassForValue(",
    "sourceField?.label",
    "sourceField:",
    "section.detailSections?.[index]?.fields",
    "bg-emerald-50",
    "bg-amber-50",
    "bg-sky-50",
  ]) {
    assertContains(platformPage, required);
  }

  assertContains(statCard, "[overflow-wrap:anywhere]");
});
