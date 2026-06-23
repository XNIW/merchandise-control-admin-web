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

test("TASK-050 records the active review reconciliation task and preserves blocker states", () => {
  const taskPath = "docs/TASKS/TASK-050-review-done-reconciliation-task-040-049.md";
  const evidencePath = "docs/TASKS/EVIDENCE/TASK-050/README.md";
  assertPathExists(taskPath);
  assertPathExists(evidencePath);

  const masterPlan = readProjectFile("docs/MASTER-PLAN.md");
  const task = readProjectFile(taskPath);
  const evidence = readProjectFile(evidencePath);
  const docs = `${masterPlan}\n${task}\n${evidence}`;

  for (const required of [
    "TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049",
    "Stato TASK-050: `DONE_RECONCILED`",
    "Fase TASK-050: `DONE_RECONCILED`",
    "TASK-040",
    "TASK-041",
    "TASK-042",
    "TASK-043",
    "TASK-044",
    "TASK-045",
    "TASK-046",
    "TASK-047",
    "TASK-048",
    "TASK-049",
    "TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`",
    "TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`",
    "TASK-042: `READY_FOR_WIN7_MANUAL_TEST`",
    "TASK-043: `DONE_RECONCILED`",
    "TASK-044: `DONE_RECONCILED`",
    "TASK-045: `DONE_RECONCILED`",
    "TASK-046: `DONE_RECONCILED`",
    "TASK-047: `DONE_RECONCILED`",
    "TASK-048: `DONE_RECONCILED`",
    "TASK-049: `DONE_RECONCILED`",
    "Win7POS live E2E: `NOT_RUN`",
    "POS online connection/catalog pull: `NOT_RUN`",
    "Sales Sync live Win7POS -> Admin Web: `NOT_RUN`",
    "stable non-production staging: `NOT_RUN`",
    "Commit/push finale su `main` autorizzati",
  ]) {
    assertContains(docs, required, `TASK-050 docs must contain ${required}`);
  }

  assert.match(
    masterPlan,
    /Task attivo: `NESSUNO`|Task attivo: `TASK-058 - Cloudflare\/OpenNext Staging Hardening and Deployment Governance`|Task attivo: `TASK-081 - Win7POS Sales Sync, Daily\/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`/,
  );
  assert.doesNotMatch(docs, /TASK-040: `DONE/);
  assert.doesNotMatch(docs, /TASK-041: `DONE/);
  assert.doesNotMatch(docs, /TASK-042: `DONE/);
  assert.doesNotMatch(
    docs,
    /Sales Sync live Win7POS -> Admin Web: `PASS`/,
    "TASK-050 must not invent Sales Sync live evidence",
  );
});

test("TASK-050 keeps Devices and Sync as diagnostic deep links, not primary Master Console nav", () => {
  const task = readProjectFile("docs/TASKS/TASK-050-review-done-reconciliation-task-040-049.md");
  const evidence = readProjectFile("docs/TASKS/EVIDENCE/TASK-050/README.md");
  const docs = `${task}\n${evidence}`;

  for (const required of [
    "Devices and Sync remain outside the primary Master Console sidebar.",
    "`/platform/devices` and `/platform/sync` remain diagnostic deep links.",
    "Device Signals",
    "Sync Signals",
  ]) {
    assertContains(docs, required, `TASK-050 docs must preserve ${required}`);
  }

  assert.doesNotMatch(docs, /Devices\/Sync primary sidebar restored/);
});
