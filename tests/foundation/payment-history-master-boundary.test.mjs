import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {load} from "./helpers/payment-history-harness.mjs";
import {qualifiedConfig,qualifiedId as id} from "./helpers/history-qualified-fixture.mjs";
function module(path,imports){const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Buffer,Error,require(name){if(name==="server-only")return {};if(name in imports)return imports[name];if(name.startsWith("./"))return load("src/server/payment-history/"+name.slice(2)+".ts");throw Error("unexpected dependency "+name);}});return m.exports;}
function setup(){
 const calls=[],actor={kind:"personal_account",id:id(2),session_id:id(3),credential_version:null};let authorized=true,reply={ok:true,shop_id:id(1),actor,result:{can_manage:true,issuer:"PlatformMaster"}};
 const db={async rpc(name,args){calls.push({name,args});return {data:reply,error:null};}};
 const b=module("src/server/payment-history/request-boundary.ts",{"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},"@/lib/supabase/server":{createSupabaseServerClient:async()=>db},"@/server/platform-admin/authz":{authorizeCurrentPlatformAdmin:async()=>({status:authorized?"authorized":"unauthorized",userId:id(2)})},"@/server/shop-admin/data-access":{resolveShopAdminDataAccess:async()=>({status:"no_shop"})}});
 return {b,calls,actor,setAuthorized(v){authorized=v;},setReply(v){reply=v;}};
}
test("Master access requires the current platform authorizer and the scoped SQL lease",async()=>{const x=setup(),access=await x.b.demandMasterHistoryAccess(id(1));assert.equal(access.principalKind,"personal_account");assert.equal(x.calls[0].name,"payment_history_technical_access_v1");assert.equal(x.calls[0].args.p_shop_id,id(1));});
test("a missing shop membership may resolve only through an actual platform Master",async()=>{const x=setup();assert.equal((await x.b.demandHistoryAccess(id(1))).principal.userId,id(2));x.setAuthorized(false);await assert.rejects(()=>x.b.demandHistoryAccess(id(1)),e=>e.code==="history_access_denied");});
for(const mutate of [d=>d.result.issuer="ShopAdmin",d=>d.shop_id=id(9),d=>d.actor.id=id(9),d=>d.actor.kind="pos_staff_manager",d=>d.actor.token_hash="PRIVATE_SENTINEL",d=>d.session_token="PRIVATE_SENTINEL",d=>d.actor.credential_version=7])test("display roles and expanded Master envelopes are denied "+mutate,async()=>{const x=setup(),reply={ok:true,shop_id:id(1),actor:structuredClone(x.actor),result:{can_manage:true,issuer:"PlatformMaster"}};mutate(reply);x.setReply(reply);await assert.rejects(()=>x.b.demandMasterHistoryAccess(id(1)));});
test("qualification publication rechecks its explicit authority and does not leak SQL text",async()=>{
 const x=setup(),access=await x.b.demandMasterHistoryAccess(id(1)),calls=[];
 access.supabase={async rpc(name,args){calls.push({name,args});return name==="payment_history_qualification_request_v1"?{data:{ok:true,shop_id:id(1),actor:x.actor,result:qualifiedConfig()},error:null}:{data:null,error:{code:"42501",message:"PRIVATE_SENTINEL"}};}};
 const b=module("src/server/payment-history/qualification-boundary.ts",{"@/lib/supabase/admin":{createSupabaseAdminClient:()=>null},"./request-boundary":{HistoryRequestError:x.b.HistoryRequestError}});
 await assert.rejects(()=>b.technicalHistoryRequest(access,"read"),e=>e.code==="history_access_denied"&&!e.message.includes("PRIVATE"));assert.deepEqual(calls.map(x=>x.name),["payment_history_qualification_request_v1","payment_history_technical_access_v1"]);
 await assert.rejects(()=>b.technicalHistoryRequest(access,"qualify",{reference:"free text proof"}),e=>e.code==="history_input_invalid");assert.equal(calls.length,2);
});
