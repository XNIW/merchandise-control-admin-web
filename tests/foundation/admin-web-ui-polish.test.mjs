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
  assert.match(
    masterPlan,
    /Task attivo: `(NONE|NESSUNO)`|Task attivo: `TASK-014 - Integrated Authenticated QA, Design System, POS Staff Foundation`|Task attivo: `TASK-015 - Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices`|Task attivo: `TASK-016 - Complete Platform Admin Console`|Task attivo: `TASK-017 - Shop Business Completion`|Task attivo: `TASK-018 - Infrastructure, Security Hardening and POS Foundation`|Task attivo: `TASK-019 - POS Auth Foundation Implementation`|Task attivo: `TASK-020 - Win7POS Integration Planning`|Task attivo: `TASK-021 - POS backend session\/device endpoints`|Task attivo: `TASK-022_023 - POS live dashboard \+ Win7POS first login trusted device`|Task attivo: `TASK-026 - Shop Admin product catalog foundation`|Task attivo: `TASK-027 - Catalog pull delta sync and POS catalog hardening`|Task attivo: `TASK-028 - Catalog CRUD, Excel import\/export, and Win7POS catalog pull E2E`|Task attivo: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`|Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`|Task attivo: `TASK-032 - Full project progression mega-task`/,
  );
  assert.match(
    masterPlan,
    /Fase: `IDLE`|Fase: `EXECUTION`|Fase: `REVIEW`|Fase: `REVIEW_READY_FOR_DONE_CONFIRMATION`|Fase: `DONE_RECONCILED`/,
  );
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
  const sharedTable = readProjectFile("src/components/admin/AdminDataTable.tsx");

  assert.match(shopSectionPage, /Planned state/);
  assert.match(`${shopSectionPage}\n${sharedTable}`, /break-words/);
  assert.match(platformTable, /break-words/);
  assert.match(platformOperations, /Use development-safe test shops only/);
  assert.doesNotMatch(platformOperations, /TASK006_TEST_/);
});
