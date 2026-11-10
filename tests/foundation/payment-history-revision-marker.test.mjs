import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
const loaded={exports:{}};
runInNewContext(ts.transpileModule(readFileSync("src/server/payment-history/revision-marker.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,crypto:webcrypto,TextEncoder,Uint8Array});
const compose=loaded.exports.composeShopRevisionMarker;
const ready=value=>({status:"ready",value});
test("revision discovery is deterministic, bounded and contains no financial projection",async()=>{
 const a=await compose("shop-a",ready("catalog-1"),ready("private-metadata-1")),b=await compose("shop-a",ready("catalog-1"),ready("private-metadata-1"));
 assert.equal(a.eventMarker,b.eventMarker);assert.match(a.paymentHistoryMarker,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify(a).includes("private-metadata"),false);
});
test("financial revision and tenant affect both discovery and the financial marker",async()=>{
 const a=await compose("a",ready("1"),ready("1")),b=await compose("a",ready("1"),ready("2")),c=await compose("b",ready("1"),ready("1"));
 for(const x of [b,c]){assert.notEqual(x.eventMarker,a.eventMarker);assert.notEqual(x.paymentHistoryMarker,a.paymentHistoryMarker);}
});
test("a catalog-only revision does not ask the financial view to reload",async()=>{
 const a=await compose("a",ready("1"),ready("1")),b=await compose("a",ready("2"),ready("1"));assert.notEqual(a.eventMarker,b.eventMarker);assert.equal(a.paymentHistoryMarker,b.paymentHistoryMarker);
});
for(const status of ["denied","unavailable"])test(status+" does not borrow catalog permission for financial metadata",async()=>{
 const result=await compose("a",ready("catalog"),{status});assert.equal(result.paymentHistoryStatus,status);assert.equal(result.paymentHistoryMarker,null);
});
