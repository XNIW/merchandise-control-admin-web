#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const sourceFiles = [
  "src/components/shop/shopSections.ts",
  "src/server/shop-admin/shop-section-data.ts",
  "src/components/platform/platformData.ts",
  "src/server/platform-admin/platform-section-data.ts",
  "src/components/platform/PlatformPage.tsx",
  "src/components/shop/ShopSectionPage.tsx",
  "src/app/shop/import-export/page.tsx",
  "src/app/shop/_components/CatalogActionPanel.tsx",
  "src/app/shop/_components/ImportExportActionPanel.tsx",
  "src/app/shop/_components/DeviceActionPanel.tsx",
  "src/app/shop/_components/MemberActionPanel.tsx",
  "src/app/shop/_components/StaffActionPanel.tsx",
  "src/app/platform/admins/page.tsx",
  "src/app/platform/operations/page.tsx",
  "src/components/platform/operations/ControlledOperationsWorkflow.tsx",
].filter((relativePath) => existsSync(join(root, relativePath)));

const criticalUiPhrases = [
  "Legacy mobile bridge",
  "Ready via legacy bridge",
  "Filtered catalog rows",
  "Products loaded",
  "Live shop data",
  "Operational cards",
  "No operational rows are visible",
  "No shop catalog products are visible",
  "No shop catalog categories are visible",
  "No shop catalog suppliers are visible",
  "Price history",
  "No price history rows are visible",
  "Rows come from the server read model when available; empty states explain the current boundary.",
  "Platform Admin read-only table rendered from server-provided rows.",
  "The server boundary did not return rows for this view.",
  "Audited controls are available only through the dedicated operations page.",
  "Move to the page that owns the next operational step.",
  "Waiting for a verified shop schema",
  "Read model pending",
  "Planning placeholder",
  "Read-only pending",
  "Catalog taxonomy",
  "Catalog transfer",
  "Mobile sync",
  "Authorized hardware",
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
];

const dictionaries = read("src/i18n/dictionaries.ts");
const failures = [];
const report = [];

for (const phrase of criticalUiPhrases) {
  const sourceOccurrences = sourceFiles.filter((relativePath) =>
    read(relativePath).includes(phrase),
  );

  if (sourceOccurrences.length === 0) {
    continue;
  }

  const keyPattern = new RegExp(`"${escapeRegExp(phrase)}"\\s*:`, "g");
  const translationCount = [...dictionaries.matchAll(keyPattern)].length;

  report.push({
    phrase,
    sourceOccurrences,
    translationCount,
  });

  if (translationCount < 3) {
    failures.push(
      `${phrase} is rendered by ${sourceOccurrences.join(", ")} but is not covered by it/es/zh-CN exact dictionaries`,
    );
  }
}

if (failures.length > 0) {
  console.error("i18n hardcoded UI scan failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      checkedPhrases: report.length,
      sourceFiles,
      status: "pass",
    },
    null,
    2,
  ),
);
