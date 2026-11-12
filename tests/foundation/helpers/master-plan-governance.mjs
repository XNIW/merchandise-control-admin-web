import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Historical closure tests must validate current tracking without freezing it
// forever on the task that happened to be active when that closure was tested.
export function assertCurrentRootTracked(masterPlan) {
  const field = label => {
    const values=Array.from(masterPlan.matchAll(new RegExp(`^- ${label}: \\x60([^\\x60]+)\\x60$`,"gm")),m=>m[1]);
    assert.equal(values.length,1,`exactly one current ${label}`);return values[0];
  };
  const global=field("Stato globale attuale"), active=field("Task attivo");
  const file=field("File task corrente"), evidence=field("Evidence task corrente");
  if(active === "NESSUNO") {
    assert.equal(global,"IDLE");assert.equal(file,"NESSUNO");return;
  }
  assert.ok(["EXECUTION","PLANNING","REVIEW"].includes(global),"active work has a defined phase");
  for(const path of [file,evidence]) {
    assert.match(path,/^docs\/(?:TASKS|ARCHITECTURE)\/[A-Za-z0-9_./-]+\.md$/);
    assert.ok(!path.includes(".."));assert.ok(existsSync(path),`current tracking file exists: ${path}`);
  }
  if(active.startsWith("ASUS-W7POS-019")) {
    assert.equal(global,"EXECUTION");
    assert.match(readFileSync(evidence,"utf8"),/Stato: EXECUTION \/ ACTIVE/);
    for(const task of ["139-pos-catalog-v2-pagination-snapshot","140-staff-pin-reset-login"]) {
      assert.match(readFileSync(`docs/TASKS/TASK-${task}.md`,"utf8"),/^- Stato: `DONE`/m,"closed foundation task is not reopened");
    }
  } else {
    const current=readFileSync(file,"utf8");
    assert.doesNotMatch(current,/^- Stato: `DONE`/m,"a closed task cannot be the active root");
  }
}
