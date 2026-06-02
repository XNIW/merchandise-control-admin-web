import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readProjectFile(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertContains(source, required, label = required) {
  assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
}

test("TASK-030 documents Vercel auto-deploy neutralization", () => {
  const taskPath =
    "docs/TASKS/TASK-030-vercel-deployment-configuration-diagnosis-main-reconciliation.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-030/README.md";
  const stagingPath = "docs/DEPLOYMENT/STAGING.md";

  for (const relativePath of [taskPath, evidencePath, stagingPath, "vercel.json"]) {
    assert.equal(existsSync(join(root, relativePath)), true, `${relativePath} is missing`);
  }

  const config = JSON.parse(readProjectFile("vercel.json"));
  assert.equal(config.git?.deploymentEnabled, false);

  const taskDocs = [
    readProjectFile(taskPath),
    readProjectFile(evidencePath),
    readProjectFile(stagingPath),
  ].join("\n");
  const combined = [
    taskDocs,
    readProjectFile("docs/MASTER-PLAN.md"),
  ].join("\n");

  for (const required of [
    "vercel git disconnect --scope xniw97-9857s-projects",
    "link=null",
    "hasDeployments=false",
    "deployment attivi: nessuno",
    "alias attivi: nessuno",
    "git.deploymentEnabled=false",
    "nessun valore letto o salvato",
    "TASK-029 resta bloccato",
    "TASK-022_023",
    "PARKED_E2E_PENDING",
    "TASK-024",
    "DEFERRED",
    "Non usare `vercel --prod`",
  ]) {
    assertContains(combined, required);
  }

  assert.doesNotMatch(taskDocs, /production-ready/i);
});
