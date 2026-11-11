import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import {load} from "./helpers/payment-history-harness.mjs";
const require=createRequire(import.meta.url),id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function module(path,imports){const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Buffer,TextDecoder,Uint8Array,URL,Response,Error,require(name){if(name==="server-only")return {};if(name in imports)return imports[name];if(name.startsWith("node:"))return require(name);if(name.startsWith("./"))return load("src/server/payment-history/"+name.slice(2)+".ts");throw Error("unexpected dependency "+name);}});return m.exports;}
const token="synthetic-device-token-long",sessionToken="synthetic-session-token-long",hash=t=>"sha256:"+createHash("sha256").update(t).digest("hex");
const authority={dataset_id:id(5),revision:"0",writer_epoch:"1",writer_authority:"local",inventory_verified:false,protocol_version:1};
function device(){
 const calls=[],lease={status:"ok",shop:{shop_id:id(1)},device:{shop_device_id:id(2)},staff:{staff_id:id(3)},session:{pos_session_id:id(4),session_token_hash:hash(sessionToken),staff_credential_version:7},credential:{token_hash:hash(token)}};
 let answer={data:{ok:true,shop_id:id(1),device_id:id(2),session_id:id(4),result:structuredClone(authority)},error:null},leases=[];
 const db={async rpc(name,args){calls.push({name,args});return answer;}};
 const boundary=module("src/server/payment-history/device-boundary.ts",{"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},"@/server/pos-auth/runtime-boundary":{async loadPosRuntimeLease(_db,input){calls.push({lease:input});return leases.shift()??lease;}},"@/server/pos-auth/tokens":load("src/server/pos-auth/tokens.ts")});
 const input={deviceId:id(2),sessionId:id(4),deviceToken:token,sessionToken,operation:"authority",payload:{}};
 return {calls,lease,input,boundary,setAnswer(v){answer=v;},setLeases(...v){leases=v;}};
}
test("device endpoint derives shop and staff from the actual lease and forwards hashes only",async()=>{const x=device(),reply=await x.boundary.deviceHistoryRequest(x.input);assert.equal(reply.result.writer_authority,"local");const request=x.calls.find(c=>c.name);assert.equal(request.name,"payment_history_device_v1");assert.equal(request.args.p_shop_id,id(1));assert.equal(request.args.p_staff_id,id(3));assert.equal(request.args.p_credential_version,7);assert.equal(request.args.p_device_token_hash,hash(token));assert.equal(JSON.stringify(request.args).includes(token),false);});
for(const sqlCode of ["40001","PT409"])test("complete v2 HTTP boundary preserves deterministic conflict "+sqlCode,async()=>{
 const x=device();x.input.operation="local_review";x.input.payload={operation_id:id(6),content_digest:"a".repeat(64),ordinal:1};x.setAnswer({data:null,error:{code:sqlCode,message:"payment_history_canonical_economic_conflict"}});
 await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code==="history_cloud_writer_closed"&&e.status===409);
 assert.equal(x.calls.find(c=>c.name).name,"payment_history_device_http_v2");assert.equal(x.calls.filter(c=>c.name).length,1);
});
for(const sqlCode of ["57014","08006","XX000"])test("database failure never becomes a deterministic conflict "+sqlCode,async()=>{
 const x=device();x.input.operation="local_review";x.input.payload={operation_id:id(6),content_digest:"a".repeat(64),ordinal:1};x.setAnswer({data:null,error:{code:sqlCode,message:"PRIVATE_SENTINEL"}});
 await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code==="history_cloud_unavailable"&&e.status===503&&!e.message.includes("PRIVATE"));
});
for(const key of ["deviceToken","sessionToken"])test("invalid "+key+" stops shared authentication before an authority or replica",async()=>{const x=device();x.input[key]+="changed";await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code==="auth_denied"&&e.status===403);assert.equal(x.calls.some(c=>c.name),false);});

for(const [status,code,http] of [["denied","auth_denied",403],["db_failure","history_cloud_unavailable",503]])test("runtime "+status+" is distinct from a history-only permission denial",async()=>{const x=device();x.setLeases({status});await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code===code&&e.status===http);assert.equal(x.calls.some(c=>c.name),false);});
test("history permission denial with a current valid lease stays scoped",async()=>{const x=device();x.setAnswer({data:null,error:{code:"42501",message:"PRIVATE_SENTINEL"}});await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code==="history_cloud_access_denied"&&e.status===403&&!e.message.includes("PRIVATE"));assert.equal(x.calls.filter(c=>c.lease).length,2);assert.equal(x.calls.filter(c=>c.name).length,1);});
for(const [status,code,http] of [["denied","auth_denied",403],["db_failure","history_cloud_unavailable",503]])test("SQL denial rechecks a runtime that becomes "+status,async()=>{const x=device();x.setLeases(x.lease,{status});x.setAnswer({data:null,error:{code:"42501"}});await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code===code&&e.status===http);assert.equal(x.calls.filter(c=>c.lease).length,2);assert.equal(x.calls.filter(c=>c.name).length,1);});
for(const [part,key] of [["credential","token_hash"],["session","session_token_hash"]])test("SQL denial after "+part+" rotation stops shared authentication",async()=>{const x=device(),rotated=structuredClone(x.lease);rotated[part][key]=hash("different-current-secret");x.setLeases(x.lease,rotated);x.setAnswer({data:null,error:{code:"42501"}});await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code==="auth_denied"&&e.status===403);assert.equal(x.calls.filter(c=>c.name).length,1);});
test("browser shop or actor overrides are rejected before the runtime lookup",async()=>{const x=device();await assert.rejects(()=>x.boundary.deviceHistoryRequest({...x.input,shop_id:id(99)}),/response_invalid/);assert.equal(x.calls.length,0);});
for(const operation of ["commit","apply","cancel_batch","permissions","inventory","activate_web"])test("device contract cannot select administrative financial operation "+operation,async()=>{const x=device();await assert.rejects(()=>x.boundary.deviceHistoryRequest({...x.input,operation}),e=>e.code==="history_input_invalid");assert.equal(x.calls.length,0);});
for(const mutate of [d=>d.shop_id=id(99),d=>d.device_id=id(99),d=>d.session_id=id(99),d=>d.lease_token=id(99),d=>d.result.credential_hash="PRIVATE_SENTINEL"])
 test("device projection rejects expanded or mismatched backend data "+mutate.toString(),async()=>{const x=device(),data={ok:true,shop_id:id(1),device_id:id(2),session_id:id(4),result:structuredClone(authority)};mutate(data);x.setAnswer({data,error:null});await assert.rejects(()=>x.boundary.deviceHistoryRequest(x.input),e=>e.code==="history_response_invalid");});
test("replica gap has a closed resnapshot result, without SQL error text",async()=>{const x=device();x.setAnswer({data:null,error:{code:"40001",message:"PRIVATE_SENTINEL"}});await assert.rejects(()=>x.boundary.deviceHistoryRequest({...x.input,operation:"page",payload:{cursor:id(9)}}),e=>e.code==="history_resnapshot_required"&&!e.message.includes("PRIVATE"));});
function transfer(){
 const calls=[],access={status:"ready",principalKind:"pos_staff_manager",selectedShop:{shopId:id(1)},principal:{staff:{staffId:id(3)},staffWebSession:{sessionId:id(4),sessionTokenHash:hash(sessionToken),credentialVersion:7}}};let rpcError=null,grants=[true,true],data={ok:true,shop_id:id(1),actor:{kind:"pos_staff_manager",id:id(3),session_id:id(4),credential_version:7},result:{run_id:id(8),state:"queued"}};
 class RequestError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}
 const db={async rpc(name,args){calls.push({name,args});return {data,error:rpcError};}};
 const boundary=module("src/server/payment-history/transfer-boundary.ts",{"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},"./request-boundary":{HistoryRequestError:RequestError,async historyRequest(_access,op){calls.push({capability:op});return {capabilities:{migrate:grants.shift()??true}};}}});
 return {calls,access,boundary,RequestError,setRpcError(v){rpcError=v;},setGrants(v){grants=v;},setData(v){data=v;}};
}
test("transfer calls only the named migration RPC with the current staff session",async()=>{const x=transfer();await x.boundary.transferRequest(x.access,"migration","start",{upload_id:id(7),request_key:id(9)});const request=x.calls.find(c=>c.name);assert.equal(request.name,"payment_history_migration_request_v1");assert.equal(request.args.p_staff_web_session_id,id(4));assert.equal(x.calls.filter(c=>c.capability).length,2);});
test("migration capability denied before a privileged call",async()=>{const x=transfer();x.setGrants([false]);await assert.rejects(()=>x.boundary.transferRequest(x.access,"migration","start",{}),e=>e.code==="history_access_denied");assert.equal(x.calls.some(c=>c.name),false);});
test("revocation before transfer publication closes the response",async()=>{const x=transfer();x.setGrants([true,false]);await assert.rejects(()=>x.boundary.transferRequest(x.access,"migration","start",{}),e=>e.code==="history_access_denied");});
test("unknown transfer lane never becomes an arbitrary privileged RPC",async()=>{const x=transfer();await assert.rejects(()=>x.boundary.transferRequest(x.access,"worker","apply",{}),e=>e.code==="history_operation_invalid");assert.equal(x.calls.length,0);});
test("device labels use the named reader and reject secret fields",async()=>{const x=transfer(),data={ok:true,shop_id:id(1),actor:{kind:"pos_staff_manager",id:id(3),session_id:id(4),credential_version:7},result:{devices:[{device_id:id(2),name:"Synthetic POS",status:"active",revoked:false}]}};x.setData(data);await x.boundary.transferRequest(x.access,"cutover","devices",{});assert.equal(x.calls.find(c=>c.name).name,"payment_history_transfer_details_v1");data.result.devices[0].token_hash="PRIVATE_SENTINEL";await assert.rejects(()=>x.boundary.transferRequest(x.access,"cutover","devices",{}),e=>e.code==="history_response_invalid");});
test("review DTO preserves exact Int64 money and distinguishes known net from total rows",()=>{const x=transfer(),review={run_id:id(8),dataset_id:id(5),revision:"0",writer_epoch:"2",source:{movements:2,active:2,batches:1,originalOperations:1,activeGrossClp:"9007199254740993",knownActiveNetClp:"1",knownActiveNetCount:1},summary:{total:2,new_active:2,new_inactive:0,duplicates:0,conflicts:0,blocked:0,new_active_gross_clp:"9007199254740993",known_new_active_net_clp:"1",known_new_active_net_count:1},freeze_verified:true,can_apply:true,reasons:[],review_digest:"a".repeat(64)};const result=x.boundary.validateTransferResult("migration","review",review,id(1));assert.equal(result.summary.new_active_gross_clp,"9007199254740993");review.summary.new_active_gross_clp=9007199254740992;assert.throws(()=>x.boundary.validateTransferResult("migration","review",review,id(1)),/response_invalid/);});

test("only an Apply RPC review rejection is a definitive rollback outcome",async()=>{const x=transfer();x.setRpcError({code:"40001"});await assert.rejects(()=>x.boundary.transferRequest(x.access,"migration","apply",{}),e=>e instanceof x.boundary.TransferApplyRejectedError);});
for(const operation of ["start","review"])test("a stale "+operation+" is not classified as an Apply rollback",async()=>{const x=transfer();x.setRpcError({code:"40001"});await assert.rejects(()=>x.boundary.transferRequest(x.access,"migration",operation,{}),e=>!(e instanceof x.boundary.TransferApplyRejectedError));});
test("permission failure does not assert that financial commit rolled back",async()=>{const x=transfer();x.setRpcError({code:"42501"});await assert.rejects(()=>x.boundary.transferRequest(x.access,"migration","apply",{}),e=>e.code==="history_access_denied"&&!(e instanceof x.boundary.TransferApplyRejectedError));});

for(const code of ["40001","42501"])test("transfer HTTP envelope distinguishes definitive rollback from "+code,async()=>{
 const x=transfer();x.setRpcError({code});
 const route=module("src/app/api/shop/payment-history/transfer/route.ts",{
  "@/server/payment-history/request-boundary":{HistoryRequestError:x.RequestError,demandHistoryAccess:async()=>x.access},
  "@/server/payment-history/transfer-boundary":x.boundary,
 });
 const reply=await route.POST(new Request("https://synthetic.invalid/api/shop/payment-history/transfer",{method:"POST",headers:{origin:"https://synthetic.invalid","content-type":"application/json","x-history-request":"1"},body:JSON.stringify({shop_id:id(1),lane:"migration",operation:"apply",payload:{}})}));
 const body=await reply.json();assert.equal(body.ok,false);assert.equal(reply.headers.get("cache-control"),"no-store");
 assert.equal(reply.status,code==="40001"?409:403);assert.equal(body.outcome,code==="40001"?"rejected":undefined);
});
test("revocation after a successful Apply RPC cannot claim rollback",async()=>{
 const x=transfer();x.setGrants([true,false]);x.setData({ok:true,shop_id:id(1),actor:{kind:"pos_staff_manager",id:id(3),session_id:id(4),credential_version:7},result:{operation_id:id(6),kind:"migrate",source_run_id:id(8),source_snapshot_id:id(9),dataset_id:id(5),revision:"1",writer_epoch:"2",new_active:5,new_inactive:0,duplicates:0,new_batches:1,original_evidence_level:"legacy_attested"}});
 await assert.rejects(()=>x.boundary.transferRequest(x.access,"migration","apply",{}),e=>e.code==="history_access_denied"&&!(e instanceof x.boundary.TransferApplyRejectedError));
 assert.equal(x.calls.filter(c=>c.name).length,1);
});
