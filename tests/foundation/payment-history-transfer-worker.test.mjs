import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash,createHmac} from "node:crypto";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import {load} from "./helpers/payment-history-harness.mjs";
const require=createRequire(import.meta.url),clone=v=>JSON.parse(JSON.stringify(v));
const root="tests/fixtures/payment-history/local-export-v1/",bytes=readFileSync(root+"synthetic-local-history.w7history.zip"),fixture=JSON.parse(readFileSync(root+"sql-payload.json","utf8"));
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`,secret="synthetic-gateway-test-key-32-bytes-minimum",nonce=id(19);
const {runMigrationWorkerOnce}=load("src/server/payment-history/migration-worker.ts");
function setup(){
 const calls=[],run={run_id:id(2),shop_id:"10000000-0000-4000-8000-000000003019",lease_token:id(3),lease_fence:"1",upload:{upload_id:id(4),file_name:"synthetic.w7history.zip",object_key:`history/10000000-0000-4000-8000-000000003019/${id(4)}`,file_sha256:fixture.archiveSha256,byte_length:String(bytes.length)}};
 const port={memoryBytes:()=>1024,async rpc(op,payload){calls.push({op,payload:clone(payload)});return op==="claim"?{ok:true,run}:{ok:true};},async download(){return bytes;}};
 return {calls,run,port};
}
test("real CLR export streams all original lines before normalized movement staging",async()=>{
 const x=setup(),r=await runMigrationWorkerOnce(x.port);assert.equal(r.state,"analysed");assert.equal(r.objects,14);assert.equal(r.movements,5);
 assert.deepEqual(x.calls.find(c=>c.op==="stage_objects").payload.rows,fixture.objects);
 assert.deepEqual(x.calls.find(c=>c.op==="stage_movements").payload.rows,fixture.movements);
 assert.equal(x.calls.find(c=>c.op==="finish").payload.raw_manifest,fixture.rawManifest);
 assert.ok(x.calls.every(c=>!["apply","mapping","freeze_ack","commit"].includes(c.op)));
});
test("bad local archive checksum publishes no financial or provenance candidates",async()=>{const x=setup();x.run.upload.file_sha256="f".repeat(64);const r=await runMigrationWorkerOnce(x.port);assert.equal(r.code,"history_upload_checksum_mismatch");assert.deepEqual(x.calls.map(c=>c.op),["claim","fail"]);});
test("copied cross-shop object cannot be downloaded",async()=>{const x=setup();x.run.upload.object_key=`history/${id(99)}/${id(4)}`;let downloads=0;x.port.download=async()=>{downloads++;return bytes;};await assert.rejects(()=>runMigrationWorkerOnce(x.port),/response_invalid/);assert.equal(downloads,0);});
test("memory cap stops migration before reading any original data",async()=>{const x=setup();x.port.memoryBytes=()=>1024*1024*1024;const r=await runMigrationWorkerOnce(x.port);assert.equal(r.code,"history_worker_memory_limit");assert.equal(x.calls.some(c=>c.op==="stage_objects"),false);});
test("lost migration fence cannot be bypassed with a finish or second claim",async()=>{const x=setup(),rpc=x.port.rpc;x.port.rpc=async(op,payload)=>{if(op==="stage_objects"||op==="fail"){x.calls.push({op,payload});throw Error("private SQL detail");}return rpc(op,payload);};const r=await runMigrationWorkerOnce(x.port);assert.equal(r.state,"failed");assert.equal(x.calls.some(c=>c.op==="finish"),false);assert.equal(x.calls.filter(c=>c.op==="claim").length,1);assert.equal(r.code,"history_local_export_invalid");});
function module(path,imports,extra={}){const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Buffer,Request,Response,TextDecoder,Uint8Array,URL,Error,Date,process:{env:{PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret}},require(name){if(name==="server-only")return {};if(name in imports)return imports[name];if(name.startsWith("node:"))return require(name);if(name==="./ledger-contract")return load("src/server/payment-history/ledger-contract.ts");if(name==="./worker-signature")return load("src/server/payment-history/worker-signature.ts");throw Error("unexpected dependency "+name);},...extra});return m.exports;}
const signature=(time,body)=>createHmac("sha256",secret).update(`history-worker-v1\n${time}\n${nonce}\n${createHash("sha256").update(body).digest("hex")}`).digest("hex");
function gateway(){
 const calls=[];let answer={ok:true,job:null};
 const db={async rpc(name,args){calls.push({name,args});return {data:answer,error:null};},storage:{from(bucket){assert.equal(bucket,"payment-history-sources");return {async createSignedUrl(path){calls.push({signed:path});return {data:{signedUrl:"https://storage.example/synthetic"},error:null};}};}}};
 const server=module("src/server/payment-history/worker-gateway.ts",{"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db}});
 function request(input={lane:"import",operation:"claim",payload:{}},options={}){const body=JSON.stringify(input),time=String(options.time??Date.now());return new Request("https://admin.example/api/internal/payment-history/worker",{method:"POST",headers:{"content-type":"application/json","x-history-time":time,"x-history-nonce":nonce,"x-history-signature":options.signature??signature(time,body),...options.headers},body});}
 return {server,calls,request,setAnswer(value){answer=value;}};
}
test("signed worker request selects only the replay-safe dedicated SQL gateway",async()=>{const x=gateway(),reply=await x.server.handleWorkerGateway(x.request());assert.equal(reply.data.ok,true);assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,"payment_history_worker_gateway_v1");assert.equal(x.calls[0].args.p_request_id,nonce);});
for(const options of [{signature:"0".repeat(64)},{time:Date.now()-120000},{headers:{"x-history-nonce":"not-a-uuid"}}])test("invalid worker signature/clock/nonce is rejected before a privileged call "+JSON.stringify(options),async()=>{const x=gateway();await assert.rejects(()=>x.server.handleWorkerGateway(x.request(undefined,options)),e=>e.status===403);assert.equal(x.calls.length,0);});
for(const operation of ["commit","apply","mapping","permissions","freeze_ack","activate_web"])test("worker gateway rejects financial operation "+operation,async()=>{const x=gateway();await assert.rejects(()=>x.server.handleWorkerGateway(x.request({lane:"import",operation,payload:{}})),e=>e.status===400);assert.equal(x.calls.length,0);});
test("worker cannot ask gateway to sign an arbitrary source path",async()=>{const x=gateway();x.setAnswer({ok:true,job:{shop_id:id(1),uploads:[{upload_id:id(2),object_key:`history/${id(99)}/${id(2)}`}]}});await assert.rejects(()=>x.server.handleWorkerGateway(x.request()),e=>e.status===503);assert.equal(x.calls.some(c=>c.signed),false);});
test("claim signs only its scoped verified upload",async()=>{const x=gateway(),path=`history/${id(1)}/${id(2)}`;x.setAnswer({ok:true,job:{shop_id:id(1),uploads:[{upload_id:id(2),object_key:path}]}});const r=await x.server.handleWorkerGateway(x.request());assert.deepEqual(clone(r.downloads),[{object_key:path,signed_url:"https://storage.example/synthetic"}]);assert.equal(x.calls.filter(c=>c.signed).length,1);});
