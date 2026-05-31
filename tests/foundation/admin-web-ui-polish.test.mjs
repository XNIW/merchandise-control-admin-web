import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("TASK-013 UI/UX polish is reconciled to DONE", () => {
  const taskPath = "docs/TASKS/TASK-013-admin-web-ui-ux-professional-polish.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-013/README.md";
  const masterPlanPath = "docs/MASTER-PLAN.md";

  for (const relativePath of [taskPath, evidencePath, masterPlanPath]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const masterPlan = readProjectFile(masterPlanPath);

  assert.match(task, /Stato: `DONE`/);
  assert.match(task, /Fase attuale: `DONE_RECONCILED`/);
  assert.match(task, /UI\/UX audit matrix/);
  assert.match(evidence, /Figma/);
  assert.match(evidence, /DONE_RECONCILED/);
  assert.match(evidence, /https:\/\/www\.figma\.com\/design\/nw9wx6Q7jutwLGPHatGlWq/);
  assert.match(masterPlan, /### TASK-013 - Admin Web UI\/UX Professional Audit & Polish/);
  assert.match(masterPlan, /TASK-013 - Admin Web UI\/UX Professional Audit & Polish[\s\S]*Stato: `DONE`/);
  assert.match(masterPlan, /Task attivo: `NONE`/);
  assert.match(masterPlan, /Fase: `IDLE`/);
});

test("TASK-013 Shop Admin shell makes selected shop context explicit", () => {
  const shell = readProjectFile("src/components/shop/ShopShell.tsx");

  assert.match(shell, /role="group"/);
  assert.match(shell, /aria-labelledby="selected-shop-context-label selected-shop-summary"/);
  assert.match(shell, /id="selected-shop-summary"/);
  assert.match(shell, /selectedShop\.shopName/);
  assert.match(shell, /selectedShop\.shopCode/);
  assert.match(shell, /overflow-x-auto/);
  assert.match(shell, /lg:grid/);
  assert.match(shell, /whitespace-nowrap/);
});

test("TASK-013 placeholders, tables, and operation copy are polished", () => {
  const shopSectionPage = readProjectFile("src/components/shop/ShopSectionPage.tsx");
  const platformOperations = readProjectFile("src/app/platform/operations/page.tsx");
  const platformTable = readProjectFile("src/components/platform/components/DataTable.tsx");

  assert.match(shopSectionPage, /Planned state/);
  assert.match(shopSectionPage, /break-words/);
  assert.match(platformTable, /break-words/);
  assert.match(platformOperations, /Use development-safe test shops only/);
  assert.doesNotMatch(platformOperations, /TASK006_TEST_/);
});
