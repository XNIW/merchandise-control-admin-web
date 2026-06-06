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

test("TASK-048 secondary Master Console sections explain purpose, empty state, diagnostics, and next action", () => {
  const platformData = readProjectFile("src/components/platform/platformData.ts");
  const platformSidebar = readProjectFile(
    "src/components/platform/PlatformSidebarNav.tsx",
  );
  const platformPage = readProjectFile("src/components/platform/PlatformPage.tsx");
  const sectionData = readProjectFile(
    "src/server/platform-admin/platform-section-data.ts",
  );
  const devicesPage = readProjectFile("src/app/platform/devices/page.tsx");
  const syncPage = readProjectFile("src/app/platform/sync/page.tsx");

  for (const required of [
    "type PlatformPurposeItem",
    "type PlatformNextLink",
    "purposeItems?: PlatformPurposeItem[]",
    "nextLinks?: PlatformNextLink[]",
    "diagnosticsPriority?:",
    "showInPrimaryNav?: boolean",
    "primaryNavigationItems",
    '{ key: "devices", label: "Devices", href: "/platform/devices", showInPrimaryNav: false }',
    '{ key: "sync", label: "Sync", href: "/platform/sync", showInPrimaryNav: false }',
  ]) {
    assertContains(platformData, required, `platformData must define ${required}`);
  }

  for (const required of [
    "primaryNavigationItems",
    "primaryNavigationItems.map",
    "sectionFromPath",
    "navigationItems",
  ]) {
    assertContains(platformSidebar, required, `sidebar must use ${required}`);
  }
  assert.doesNotMatch(
    platformSidebar,
    /navigationItems\.map\(\(item\)/,
    "Sidebar must not render hidden diagnostic deep links as primary nav items",
  );

  assertContains(
    devicesPage,
    "Device Signals | MerchandiseControl Admin Web",
    "devices route metadata must use diagnostic title",
  );
  assertContains(
    syncPage,
    "Sync Signals | MerchandiseControl Admin Web",
    "sync route metadata must use diagnostic title",
  );

  for (const required of [
    "Use this page to",
    "section.purposeItems",
    "section.nextLinks",
    "diagnosticsPriority",
    "Next action",
  ]) {
    assertContains(platformPage, required, `PlatformPage must render ${required}`);
  }

  for (const required of [
    "Device Signals",
    "Read-only diagnostic view for global device coverage and support signals. Daily device management belongs to Admin Console.",
    "Internal diagnostic",
    "No device signals visible",
    "Device authorization comes from shop_devices.",
    "source_device_id is sync/history attribution only.",
    "Daily device management belongs to Admin Console.",
    "/platform/shops",
    "/platform/support",
    "/platform/operations",
    "Sync Signals",
    "Read-only diagnostic view for global sync signals. Shop-level sync troubleshooting belongs to Admin Console.",
    "No sync signals visible",
    "Sales Sync foundation exists, but live Win7POS sales sync is not verified yet.",
    "/platform/data",
    "Read-only history view for mobile/inventory history and high-level sync history.",
    "No history events visible",
    "History rows appear only when the server read model exposes safe history DTOs.",
    "For technical sync events use Global Sync. For admin actions use Audit.",
    "/platform/sync",
    "/platform/audit",
    "Read-only diagnostic view for access, membership, shop setup, devices, sync, and recent audit signals.",
    '{ key: "subject", label: "Subject" }',
    '{ key: "suggestedNextStep", label: "Suggested next step" }',
    "Access issues",
    "Impersonation: Out of scope",
    "Check profile membership",
    "Use Provisioning",
    "Open Data",
    "Device and sync values are support signals, not daily device management.",
    "Open Admin Console for shop-level device management.",
    "Device/sync data health",
    "Device signals are aggregated for support.",
    "Sync signals are diagnostic; live Win7POS Sales Sync remains separately verified.",
  ]) {
    assertContains(sectionData, required, `section data must contain ${required}`);
  }

  assert.doesNotMatch(
    sectionData,
    /readModel\.syncEvents\.slice\(0, 12\)\.map/,
    "Devices must not populate device rows from sync events",
  );
  assert.doesNotMatch(
    `${platformPage}\n${sectionData}`,
    /No rows returned through the server boundary/,
    "Polished sections must not show technical empty-state copy",
  );
});

test("TASK-048 Operations uses one selected target/action workflow without repeated forms", () => {
  const operationsPage = readProjectFile("src/app/platform/operations/page.tsx");
  const actions = readProjectFile("src/app/platform/operations/actions.ts");
  const workflowPath = "src/components/platform/operations/ControlledOperationsWorkflow.tsx";
  assertPathExists(workflowPath);
  const workflow = readProjectFile(workflowPath);

  for (const required of [
    "ControlledOperationsWorkflow",
    "Use this page only for audited lifecycle and emergency operations. Daily shop management belongs to Admin Console.",
    "Use development-safe test shops only. Do not use customer data for testing.",
  ]) {
    assertContains(operationsPage, required, `operations page must contain ${required}`);
  }

  for (const required of [
    '"use client"',
    "Choose target shop",
    "Choose action",
    "Reason",
    "Type shop code to confirm",
    "Suspend shop",
    "Reactivate shop",
    "Archive shop",
    "Restore shop",
    "Emergency revoke device",
    "Already archived",
    "Requires active shop",
    "Requires archived shop",
    "No device selected",
    "Read model unavailable",
    "Daily shop management belongs to Admin Console.",
    "Device emergency operations are global exceptions. Daily device management belongs to Admin Console.",
    "PendingSubmitButton",
  ]) {
    assertContains(workflow, required, `workflow must contain ${required}`);
  }

  assert.equal(
    (workflow.match(/name="reason"/g) ?? []).length,
    1,
    "workflow should render one reason field",
  );
  assert.equal(
    (workflow.match(/Type shop code to confirm/g) ?? []).length,
    1,
    "workflow should render one confirmation prompt",
  );
  assert.doesNotMatch(
    operationsPage,
    /visibleShops\.map[\s\S]*visibleDevices\.map/,
    "Operations page should delegate repeated target/action UI to the workflow",
  );
  assert.match(actions, /suspendPlatformShopAction/);
  assert.match(actions, /restorePlatformShopAction/);
  assert.match(actions, /emergencyRevokePlatformDeviceAction/);
});

test("TASK-048 docs and evidence keep the task in REVIEW without commit, push, or stage", () => {
  const taskPath = "docs/TASKS/TASK-048-master-console-secondary-sections-ux-polish.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-048/README.md";
  assertPathExists(taskPath);
  assertPathExists(evidencePath);

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const docs = `${masterPlan}\n${task}\n${evidence}`;

  for (const required of [
    "TASK-048 - Master Console secondary sections clarity and UX polish",
    "Stato TASK-048: `REVIEW`",
    "Fase TASK-048: `REVIEW`",
    "Task attivo: `TASK-049 - Master Console Admins UI/UX polish`",
    "Devices and Sync are not top-level Master Console sidebar entries.",
    "`/platform/devices` and `/platform/sync` remain internal read-only diagnostics/deep links.",
    "TASK-047 remains in REVIEW and is a dependency, not automatically DONE.",
    "No schema changes",
    "No mock rows",
    "No Sales Sync live claim",
    "No Win7POS live E2E claim",
    "No commit",
    "No push",
    "No final stage",
  ]) {
    assertContains(docs, required, `docs must contain ${required}`);
  }

  assert.doesNotMatch(docs, /Stato TASK-047: `DONE`/);
});
