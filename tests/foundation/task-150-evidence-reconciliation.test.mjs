import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const masterPlan = readFileSync("docs/MASTER-PLAN.md", "utf8");
const task = readFileSync(
  "docs/TASKS/TASK-150-win7pos-product-image-phase-b-physical-acceptance.md",
  "utf8",
);
const evidence = readFileSync("docs/TASKS/EVIDENCE/TASK-150/README.md", "utf8");
const reconciliation = readFileSync(
  "docs/TASKS/EVIDENCE/TASK-150/2026-08-08-REMOTE-RESIDUAL-RECONCILIATION.md",
  "utf8",
);

test("TASK-150 resta incompleto e viene messo in pausa per l'handoff WECHAT-006", () => {
  assert.match(
    masterPlan,
    /- Stato TASK-150: `PAUSED_FOR_WECHAT_006_STAGING_HANDOFF`/,
  );
  assert.match(masterPlan, /- Fase TASK-150: `EXECUTION \/ PAUSED`/);
  assert.match(masterPlan, /- Stato TASK-151: `REVIEW_READY`/);
  assert.match(
    masterPlan,
    /- Fase TASK-151: `REVIEW \/ EXTERNAL_ACTIVATION_PENDING`/,
  );
  assert.match(task, /- Stato: `PAUSED_FOR_WECHAT_006_STAGING_HANDOFF`/);
  assert.match(task, /- Fase attuale: `EXECUTION \/ PAUSED`/);
  assert.match(task, /Stato precedente preservato: `ACTIVE \/ EXECUTION`/);
  assert.match(task, /La ripresa TASK-150 richiede una decisione successiva esplicita/);
  assert.match(
    evidence,
    /Runtime\/staging\/physical run TASK-150:\n  `BLOCKED \/ NOT_ACCEPTED`/,
  );
  assert.match(
    task,
    /TASK-150 resta `ACTIVE \/ EXECUTION`, non\n`REVIEW_READY` e non `DONE`/,
  );
});

test("la riconciliazione vincola PR, merge e workflow realmente osservati", () => {
  for (const token of [
    "dfb6e8c179ad50b6e2b103742ee4accf641c43ac",
    "9986c676b23753381c63c99b363a7d253e356eeb",
    "30673642803",
    "30702026325",
    "30731931483",
    "30732082208",
  ]) {
    assert.match(reconciliation, new RegExp(token));
  }

  assert.match(reconciliation, /PR da `#73` a `#83`/);
  assert.match(reconciliation, /job production sono rimasti skipped/);
  assert.match(reconciliation, /Nessun workflow è stato rieseguito/);
});

test("la matrice mantiene non verdi i gate senza evidence terminale", () => {
  assert.match(evidence, /Staging acceptance exact-ID \| `FAIL`/);
  assert.match(evidence, /Fence `2 h 05 min` \| `BLOCKED`/);
  assert.match(evidence, /Cleanup\/residui run-scoped \| `BLOCKED`/);
  assert.match(evidence, /Installer\/package \| `NOT_RUN`/);
  assert.match(evidence, /Windows 7 fisico \| `NOT_RUN`/);
  assert.match(evidence, /Production\/Android\/iOS \| `NOT_MODIFIED`/);
  assert.match(reconciliation, /Run 5 non autorizzata e non avviata/);
  assert.match(reconciliation, /cleanup commit, quindi non prova receipt/);
  assert.match(reconciliation, /budget run resta\nfail-closed/);
});
