import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
function module(path,deps={}){
 const out={exports:{}};runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:out,exports:out.exports,crypto:webcrypto,TextEncoder,Uint8Array,require(name){assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});return out.exports;
}
const shop="10000000-0000-4000-8000-000000000019";
class HistoryRequestError extends Error{constructor(code,status){super(code);this.status=status;}}
const composer=module("src/server/payment-history/revision-marker.ts");
function harness({workspace="ready",principal="pos_staff_manager",selected=shop,general="ready",financial="ready"}={}){
 const calls=[];
 const access={status:workspace,principalKind:principal,principal:{roleKey:"manager"},selectedShop:{shopId:selected},supabase:{}};
 const route=module("src/app/shop/sync-event-marker/route.ts",{
  "next/server":{NextResponse:{json:(payload,options={})=>({payload,status:options.status??200,headers:options.headers})}},
  "@/server/shop-admin/data-access":{async resolveShopAdminDataAccess(options){calls.push({resolve:options});return access;}},
  "@/server/sync-events/read-boundary":{async readSafeSyncEvents(){calls.push({personal:true});if(general==="throw")throw Error("PRIVATE_FAILURE");return general==="ready"?{data:{eventMarker:"a".repeat(64)},error:null}:{data:null,error:"unavailable"};}},
  "@/server/shop-admin/staff-mobile-operations-read":{async readStaffMobileOperations(a,op){calls.push({staff:op});if(general==="throw")throw Error("PRIVATE_FAILURE");return {status:general==="ready"?"ready":general==="denied"?"unauthorized":"error",data:general==="ready"?{sync:{eventMarker:"a".repeat(64)}}:null};}},
  "@/server/payment-history/request-boundary":{HistoryRequestError,async historyRequest(a,op){calls.push({financial:op});if(financial!=="ready")throw new HistoryRequestError("PRIVATE_FAILURE",financial==="denied"?403:503);return {capabilities:{read:true,import:false,cancel:false,export:false,migrate:false},runtime:{dataset_id:"PRIVATE_DATASET_METADATA",revision:"9007199254740993"}};}},
  "@/server/payment-history/revision-marker":composer,
 });
 return {calls,get:()=>route.GET({nextUrl:new URL(`https://example.invalid/shop/sync-event-marker?shopId=${shop}`)})};
}
for(const workspace of ["error","not_configured"])test(workspace+" is unavailable rather than a false authentication revocation",async()=>{
 const h=harness({workspace}),r=await h.get();assert.equal(r.status,503);assert.equal(h.calls.length,1);assert.equal(r.payload.paymentHistoryStatus,undefined);
});
test("an expired workspace session is denied before either domain is read",async()=>{
 const h=harness({workspace:"session_expired"}),r=await h.get();assert.equal(r.status,401);assert.equal(h.calls.length,1);assert.equal(r.headers["Cache-Control"],"private, no-store");
});
test("staff marker discovery derives strict shop scope without requiring generic history permission",async()=>{
 const h=harness(),r=await h.get();assert.equal(r.status,200);assert.equal(h.calls[0].resolve.strictRequestedShop,true);assert.equal(h.calls[0].resolve.requiredPermission,undefined);assert.equal(h.calls[1].staff,"marker");assert.equal(r.payload.paymentHistoryStatus,"ready");assert.match(r.payload.paymentHistoryMarker,/^[0-9a-f]{64}$/);assert.ok(!JSON.stringify(r.payload).includes("PRIVATE"));
});
test("a catalog-only role does not acquire a financial marker",async()=>{
 const h=harness({financial:"denied"}),r=await h.get();assert.equal(r.status,200);assert.equal(r.payload.paymentHistoryStatus,"denied");assert.equal(r.payload.paymentHistoryMarker,null);
});
test("financial discovery continues when the generic event domain is unavailable",async()=>{
 const h=harness({general:"unavailable"}),r=await h.get();assert.equal(r.status,200);assert.equal(r.payload.paymentHistoryStatus,"ready");
});
test("a known financial revocation survives a simultaneous generic network failure",async()=>{
 const h=harness({general:"throw",financial:"denied"}),r=await h.get();assert.equal(r.status,503);assert.equal(r.payload.paymentHistoryStatus,"denied");assert.equal(r.payload.paymentHistoryMarker,null);assert.ok(!JSON.stringify(r).includes("PRIVATE_FAILURE"));
});
test("personal accounts retain the existing safe scoped event reader",async()=>{
 const h=harness({principal:"personal_account"}),r=await h.get();assert.equal(r.status,200);assert.ok(h.calls.some(c=>c.personal));assert.ok(!h.calls.some(c=>c.staff));
});
test("two unavailable domains preserve the last readable copy",async()=>{
 const h=harness({general:"unavailable",financial:"unavailable"}),r=await h.get();assert.equal(r.status,503);assert.equal(r.payload.paymentHistoryStatus,"unavailable");
});
test("a resolved shop differing from the request is rejected before projection",async()=>{
 const h=harness({selected:"10000000-0000-4000-8000-000000000099"}),r=await h.get();assert.equal(r.status,401);assert.equal(h.calls.length,1);
});
