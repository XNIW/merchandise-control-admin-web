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
  "src/server/shop-admin/history-read-model.ts",
  "src/server/shop-admin/device-read-model.ts",
  "src/server/shop-admin/pos-live-read-model.ts",
  "src/server/shop-admin/read-model.ts",
  "src/server/shop-admin/staff-read-model.ts",
  "src/server/shop-admin/audit-read-model.ts",
  "src/server/shop-admin/inventory-read-model.ts",
  "src/components/platform/platformData.ts",
  "src/server/platform-admin/platform-section-data.ts",
  "src/components/platform/PlatformPage.tsx",
  "src/components/auth/AccessState.tsx",
  "src/server/auth/admin-routing.ts",
  "src/server/shop-admin/shop-access.ts",
  "src/components/shop/ShopSectionPage.tsx",
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
  "src/app/shop/import-export/page.tsx",
  "src/app/shop/_components/CatalogActionPanel.tsx",
  "src/app/shop/_components/ImportExportActionPanel.tsx",
  "src/app/shop/_components/DeviceActionPanel.tsx",
  "src/app/shop/_components/MemberActionPanel.tsx",
  "src/app/shop/_components/StaffActionPanel.tsx",
  "src/app/platform/admins/page.tsx",
  "src/app/platform/audit/page.tsx",
  "src/app/platform/data/page.tsx",
  "src/app/platform/devices/page.tsx",
  "src/app/platform/history/page.tsx",
  "src/app/platform/operations/page.tsx",
  "src/components/platform/operations/ControlledOperationsWorkflow.tsx",
  "src/app/platform/shops/page.tsx",
  "src/app/platform/shops/new/page.tsx",
  "src/app/platform/support/page.tsx",
  "src/app/platform/sync/page.tsx",
  "src/app/platform/system/page.tsx",
  "src/app/platform/users/page.tsx",
  "src/app/platform/layout.tsx",
  "src/app/platform/provisioning/page.tsx",
  "src/app/platform/provisioning/provisioningLabels.ts",
  "src/app/platform/provisioning/ShopProvisioningForms.tsx",
  "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
  "src/app/platform/provisioning/SearchableEntityPicker.tsx",
].filter((relativePath) => existsSync(join(root, relativePath)));

function extractQuotedLabelKeys(relativePath) {
  if (!existsSync(join(root, relativePath))) {
    return [];
  }

  return [...read(relativePath).matchAll(/^  "((?:[^"\\]|\\.)*)",$/gm)]
    .map((match) => JSON.parse(`"${match[1]}"`));
}

const provisioningCriticalUiPhrases = extractQuotedLabelKeys(
  "src/app/platform/provisioning/provisioningLabels.ts",
);

const baseCriticalUiPhrases = [
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
  "Master Console",
  "Sign in with a personal account to open the Admin Console.",
  "This account is authorized for Admin Console, not Master Console.",
];

const renderedRegressionUiPhrases = [
  "Overview shop",
  "Overview shop, Data status, Latest events and Latest shop audit are shown together for repeated operations.",
  "Active",
  "Active grants",
  "Active owner memberships",
  "Active shops",
  "Global Platform Admin overview loaded server-side through Supabase RLS.",
  "Provision Shop",
  "Shop onboarding",
  "Create shop with existing owner",
  "Create pending owner invite",
  "Owner email",
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
  "Inventory",
  "Ready",
  "Verified by active membership",
  "Shop-scoped catalog rows loaded server-side for the verified selected shop.",
  "Shop Staff read model loaded server-side through the credential-safe view.",
  "Server registry devices loaded for the verified selected shop, with read-only links to sync activity when available.",
  "No sync event",
  "Shop-scoped mobile history entries loaded with legacy owner fallback.",
  "Shop catalog products for the verified selected shop. Create, update, archive and restore use audited catalog RPCs.",
  "restore requires confirmation",
  "Read-only member list for the verified selected shop. Profile identifiers are shortened in the UI.",
  "Rows scoped by shop_id",
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
  "Baseline matrix",
  "Granular editing",
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
];

const criticalUiPhrases = [
  ...new Set([
    ...baseCriticalUiPhrases,
    ...renderedRegressionUiPhrases,
    ...provisioningCriticalUiPhrases,
  ]),
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
