import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("TASK-076 cloud performance command is guarded and evidence-backed", () => {
  const packageJson = JSON.parse(read("package.json"));
  const wrapper = read("scripts/testing/task-076-shop-cloud-performance.mjs");
  const spec = read("tests/e2e/staging/task-076-shop-admin-cloud-performance.spec.ts");

  assert.equal(
    packageJson.scripts["test:shop:cloud-performance"],
    "node scripts/testing/task-076-shop-cloud-performance.mjs",
  );
  assertContains(wrapper, "CONFIRM_TASK076_CLOUD_PERFORMANCE");
  assertContains(wrapper, "assertNoProductionProjectRef");
  assertContains(wrapper, "assertTargetEnv(\"staging\"");
  assertContains(spec, "const taskPrefix = \"TASK076_\"");
  assertContains(spec, "SUPABASE_SERVICE_ROLE_KEY");
  assertContains(spec, "cleanupSummary.residualRows");
  assertContains(spec, "task-076-cloud-performance-${input.phase}.json");
  assertContains(spec, "TASK076_ENFORCE_THRESHOLDS");
});

test("TASK-076 ShopShell exposes immediate pending navigation state", () => {
  const shell = read("src/components/shop/ShopShell.tsx");
  const sections = read("src/components/shop/shopSections.ts");

  assertContains(shell, "data-shop-navigation-pending");
  assertContains(shell, "data-shop-navigation-target");
  assertContains(shell, "data-shop-route-loading");
  assertContains(shell, "data-shop-route-loading-target");
  assertContains(shell, "data-shop-nav-item");
  assertContains(shell, "ShopPendingNavigationSkeleton");
  assertContains(shell, ") : (");
  assertContains(shell, "children");
  assertContains(sections, "importExport");
  assertContains(sections, "/shop/import-export");
});

test("TASK-076 route-level loading states cover the measured Shop sections", () => {
  const requiredLoadingFiles = [
    "src/app/shop/categories/loading.tsx",
    "src/app/shop/devices/loading.tsx",
    "src/app/shop/history/loading.tsx",
    "src/app/shop/import-export/loading.tsx",
    "src/app/shop/members/loading.tsx",
    "src/app/shop/overview/loading.tsx",
    "src/app/shop/roles/loading.tsx",
    "src/app/shop/settings/loading.tsx",
    "src/app/shop/staff/loading.tsx",
    "src/app/shop/suppliers/loading.tsx",
    "src/app/shop/sync/loading.tsx",
  ];
  const skeleton = read("src/app/shop/_components/ShopRouteLoading.tsx");

  for (const file of requiredLoadingFiles) {
    assert.ok(existsSync(join(root, file)), `${file} must exist`);
    assertContains(read(file), "ShopRouteLoading");
  }

  assertContains(skeleton, "data-shop-route-loading");
  assertContains(skeleton, "aria-busy=\"true\"");
});

test("TASK-076 Staff and Members pages avoid serialized read/action context", () => {
  const staffPage = read("src/app/shop/staff/page.tsx");
  const staffReadModel = read("src/server/shop-admin/staff-read-model.ts");
  const membersPage = read("src/app/shop/members/page.tsx");

  assertContains(staffPage, "resolveStaffPageBundle(requestedShopId)");
  assertContains(staffPage, "buildStaffSection(bundle.readModel)");
  assertContains(staffReadModel, "export async function resolveStaffPageBundle");
  assertContains(staffReadModel, "staffReadModelFromAccess(access)");
  assert.doesNotMatch(staffPage, /resolveShopActionContext/);
  assertContains(membersPage, "Promise.all([");
  assertContains(membersPage, "getShopSectionForRequest(\"members\", requestedShopId)");
  assertContains(membersPage, "resolveShopActionContext(requestedShopId, \"members.manage\")");
});
