import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
test('v2 package qualification rejects altered source, artifact, SQL gate and representative-volume limits',()=>{
 const result=execFileSync('pwsh',['-NoProfile','-File','scripts/testing/history-worker-qualification-contract-tests.ps1'],{encoding:'utf8'});
 assert.match(result,/HISTORY_WORKER_QUALIFICATION_CONTRACT_CASES=22/);
});
