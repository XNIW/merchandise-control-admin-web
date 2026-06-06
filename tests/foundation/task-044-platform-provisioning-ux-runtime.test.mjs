import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-044 provisioning forms prevent double submit and keep results on provisioning", () => {
  const provisioningPage = readProjectFile("src/app/platform/provisioning/page.tsx");
  const operationActions = readProjectFile("src/app/platform/operations/actions.ts");

  assert.match(provisioningPage, /PendingSubmitButton/);
  assert.match(provisioningPage, /pendingLabel="Creating shop"/);
  assert.match(provisioningPage, /pendingLabel="Creating pending invite"/);
  assert.match(provisioningPage, /name="returnTo"\s+value="\/platform\/provisioning"/);
  assert.match(provisioningPage, /searchParams/);
  assert.match(provisioningPage, /ActionResultBanner/);
  assert.match(operationActions, /safeReturnTo/);
  assert.match(operationActions, /revalidatePath\("\/platform\/provisioning"\)/);
  assert.match(operationActions, /returnTo/);
});

test("TASK-044 loading and sidebar do not reset active navigation to Overview", () => {
  const loading = readProjectFile("src/app/platform/loading.tsx");

  assert.doesNotMatch(loading, /activeSection="overview"/);
  assert.doesNotMatch(loading, /Rendering\.\.\./);
  assert.equal(
    existsSync(join(root, "src/components/platform/PlatformSidebarNav.tsx")),
    true,
    "PlatformSidebarNav.tsx is missing",
  );

  const sidebarNav = readProjectFile("src/components/platform/PlatformSidebarNav.tsx");
  const appShell = readProjectFile("src/components/platform/AppShell.tsx");

  assert.match(sidebarNav, /"use client"/);
  assert.match(sidebarNav, /usePathname/);
  assert.match(sidebarNav, /setOptimisticActive/);
  assert.match(appShell, /PlatformSidebarNav/);
});

test("TASK-044 Operations is lifecycle and emergency focused", () => {
  const operationsPage = readProjectFile("src/app/platform/operations/page.tsx");
  const operationsWorkflow = readProjectFile(
    "src/components/platform/operations/ControlledOperationsWorkflow.tsx",
  );
  const platformData = readProjectFile("src/components/platform/platformData.ts");
  const operationsUi = `${operationsPage}\n${operationsWorkflow}`;

  assert.doesNotMatch(operationsUi, /createPlatformShopAction/);
  assert.doesNotMatch(operationsUi, /createPlatformPendingOwnerInviteAction/);
  assert.doesNotMatch(operationsUi, /grantPlatformAdminAction|revokePlatformAdminAction/);
  assert.doesNotMatch(operationsUi, /title="Create shop"/);
  assert.doesNotMatch(operationsUi, /title="Platform Admin grants"/);
  assert.doesNotMatch(operationsUi, /pending_owner_invite|admin_grant|admin_revoke/);
  assert.match(operationsUi, /title="Choose target shop"/);
  assert.match(operationsUi, /title="Choose action"/);
  assert.match(operationsUi, /Emergency revoke device/);
  assert.match(platformData, /Provisioning/);
  assert.doesNotMatch(platformData, /Use \/platform\/shops\/new or \/platform\/operations/);
});

test("TASK-044 POS manager provisioning exposes specific redacted failure causes", () => {
  const staffProvisioning = readProjectFile(
    "src/server/platform-admin/staff-manager-provisioning.ts",
  );
  const panel = readProjectFile(
    "src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx",
  );

  assert.doesNotMatch(staffProvisioning, /db_failure/);
  for (const code of [
    "shop_read_failed",
    "staff_read_failed",
    "permission_write_failed",
    "staff_write_failed",
    "audit_write_failed",
  ]) {
    assert.match(staffProvisioning, new RegExp(code));
  }
  assert.match(panel, /role={state\.ok \? "status" : "alert"}/);
  assert.match(panel, /aria-disabled/);
});

test("TASK-044 task, evidence and scanner artifacts are reconciled by TASK-045", () => {
  for (const relativePath of [
    "docs/TASKS/TASK-044-platform-provisioning-ux-runtime-fixes.md",
    "docs/TASKS/EVIDENCE/TASK-044/README.md",
    "docs/TASKS/TASK-045-platform-master-console-final-review-done-reconciliation.md",
    "docs/TASKS/EVIDENCE/TASK-045/README.md",
    "tests/e2e/task-044-platform-provisioning-ux-runtime.spec.ts",
  ]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile("docs/TASKS/TASK-044-platform-provisioning-ux-runtime-fixes.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-044/README.md");
  const securityChecks = readProjectFile("scripts/security-checks.mjs");

  assert.match(masterPlan, /Stato TASK-044: `DONE_RECONCILED`/);
  assert.match(masterPlan, /Fase TASK-044: `DONE_RECONCILED`/);
  assert.match(`${task}\n${evidence}`, /AUTO_RECONCILED_TASK045/);
  assert.match(`${task}\n${evidence}`, /CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST/);
  assert.match(securityChecks, /checkTask044PlatformProvisioningUxRuntime/);
});
