import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";

test("historical concurrency driver preserves primary results and publishes evidence once",()=>{
 const result=spawnSync(process.platform==="win32"?"python":"python3",["tests/ci/test_history_concurrency_driver.py"],{encoding:"utf8",timeout:10000});
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout.trim(),"history-concurrency-driver 4 cases PASS; SQL NOT_RUN");
});
