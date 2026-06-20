import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-014 shared Admin components exist", () => {
  const componentPaths = [
    "src/components/admin/PageHeader.tsx",
    "src/components/admin/SectionCard.tsx",
    "src/components/admin/EmptyState.tsx",
    "src/components/admin/StatusBadge.tsx",
    "src/components/admin/AdminDataTable.tsx",
    "src/components/admin/GuardrailNotice.tsx",
  ];

  for (const relativePath of componentPaths) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const dataTable = readProjectFile("src/components/admin/AdminDataTable.tsx");
  const pageHeader = readProjectFile("src/components/admin/PageHeader.tsx");
  const guardrail = readProjectFile("src/components/admin/GuardrailNotice.tsx");

  assert.match(dataTable, /caption/);
  assert.match(dataTable, /break-words/);
  assert.match(dataTable, /emptyState/);
  assert.match(pageHeader, /aria-labelledby/);
  assert.match(pageHeader, /StatusBadge/);
  assert.match(guardrail, /GuardrailNotice/);
});

test("TASK-014 applies shared components to Platform and Shop surfaces", () => {
  const platformPage = readProjectFile("src/components/platform/PlatformPage.tsx");
  const shopPage = readProjectFile("src/components/shop/ShopSectionPage.tsx");
  const shopShell = readProjectFile("src/components/shop/ShopShell.tsx");
  const shopSections = readProjectFile("src/components/shop/shopSections.ts");
  const dictionary = readProjectFile("src/i18n/dictionaries.ts");

  assert.match(platformPage, /topbarTitle=\{localizedSection\.title\}/);
  assert.match(platformPage, /@\/components\/admin\/SectionCard/);
  assert.match(platformPage, /@\/components\/admin\/AdminDataTable/);
  assert.match(platformPage, /@\/components\/admin\/EmptyState/);

  assert.match(shopPage, /@\/components\/admin\/SectionCard/);
  assert.match(shopPage, /@\/components\/admin\/AdminDataTable/);
  assert.doesNotMatch(shopPage, /PageHeader/);
  assert.match(shopShell, /sharedGuardrails/);
  assert.match(shopShell, /\{labels\.shopSafety\}/);
  assert.match(shopSections, /sharedShopGuardrails/);
  assert.match(dictionary, /shopSafety: "Shop safety"/);
});

test("TASK-014 keeps shared components server-safe", () => {
  const sharedUi = [
    "src/components/admin/PageHeader.tsx",
    "src/components/admin/SectionCard.tsx",
    "src/components/admin/EmptyState.tsx",
    "src/components/admin/StatusBadge.tsx",
    "src/components/admin/AdminDataTable.tsx",
    "src/components/admin/GuardrailNotice.tsx",
  ]
    .map(readProjectFile)
    .join("\n");

  assert.doesNotMatch(sharedUi, /^["']use client["'];?/m);
  assert.doesNotMatch(sharedUi, /@supabase\/|@\/server\/|src\/server\//);
});
