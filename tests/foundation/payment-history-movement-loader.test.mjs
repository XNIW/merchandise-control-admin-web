import assert from "node:assert/strict";
import test from "node:test";
import {load} from "./helpers/payment-history-harness.mjs";
import {movementRead,movementQuery} from "./helpers/history-movement-fixture.mjs";
const {loadHistoryMovementPage}=load("src/lib/payment-history/movement-loader.ts");
test("movement loader validates one exact page without retry",async()=>{
 let calls=0;const result=await loadHistoryMovementPage(async()=>{calls++;return movementRead();},movementQuery(),new AbortController().signal);
 assert.equal(calls,1);assert.equal(result.result.totals.matched_count,"2");
});
test("a changed revision rebinds the same commercial anchor once",async()=>{
 const first=movementRead(),query={...movementQuery(),after:first.next},calls=[];
 const second={...first,revision:"5",rows:[],next:null};
 const result=await loadHistoryMovementPage(async(op,q)=>{calls.push(q);if(calls.length===1)throw Error("history_view_changed");return second;},query,new AbortController().signal);
 assert.equal(calls.length,3);assert.equal(calls[1].after,null);assert.equal(result.query.after.revision,"5");assert.equal(result.query.after.id,query.after.id);
});
test("dataset replacement returns its first page without a borrowed cursor",async()=>{
 const first=movementRead(),query={...movementQuery(),after:first.next};let calls=0;
 const result=await loadHistoryMovementPage(async()=>{if(++calls===1)throw Error("history_view_changed");return {...first,dataset_id:"10000000-0000-4000-8000-000000000099",next:null};},query,new AbortController().signal);
 assert.equal(calls,2);assert.equal(result.query.after,null);
});
test("a second concurrent revision change terminates the bounded recovery",async()=>{
 const query={...movementQuery(),after:movementRead().next};let calls=0;
 await assert.rejects(()=>loadHistoryMovementPage(async()=>{if(++calls!==2)throw Error("history_view_changed");return movementRead();},query,new AbortController().signal),/history_view_changed/);assert.equal(calls,3);
});
for(const code of ["history_access_denied","history_unavailable"])test(code+" never triggers snapshot recovery",async()=>{
 let calls=0;await assert.rejects(()=>loadHistoryMovementPage(async()=>{calls++;throw Error(code);},{...movementQuery(),after:movementRead().next},new AbortController().signal),new RegExp(code));assert.equal(calls,1);
});
test("cancelled recovery never issues an anchor request",async()=>{
 const c=new AbortController();let calls=0;await assert.rejects(()=>loadHistoryMovementPage(async()=>{calls++;c.abort();throw Error("history_view_changed");},{...movementQuery(),after:movementRead().next},c.signal));assert.equal(calls,1);
});
