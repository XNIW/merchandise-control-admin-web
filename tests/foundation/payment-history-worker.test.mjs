import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {load,inputs,options} from "./helpers/payment-history-harness.mjs";
const {runHistoryWorkerOnce}=load("src/server/payment-history/job-worker.ts"),wire=load("src/server/payment-history/wire-contract.ts");
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const hash=b=>createHash("sha256").update(b).digest("hex"),clone=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const uploads=inputs.map((file,index)=>({upload_id:id(index+10),object_key:`history/${id(1)}/${id(index+10)}`,file_name:file.fileName,file_sha256:hash(file.bytes),byte_length:String(file.bytes.length)}));
 const job={job_id:id(2),shop_id:id(1),lease_token:id(3),lease_fence:"1",configuration:{...options},uploads},calls=[];
 const port={memoryBytes:()=>100000000,async download(path,limit,signal){signal.throwIfAborted();const index=uploads.findIndex(u=>u.object_key===path);assert.ok(index>=0);assert.ok(limit>=inputs[index].bytes.length);return inputs[index].bytes;},async rpc(op,payload){calls.push({op,payload:clone(payload)});return op==="claim_upload"?{upload:null}:op==="claim"?{job}: {ok:true};}};
 return {job,calls,port};
}
test("actual parser to fenced staging reconciles all five rows and literal totals",async()=>{
 const {port,calls}=setup(),r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.kind,"job_review_ready");assert.equal(r.rows,5);
 const stages=calls.filter(c=>c.op==="stage");assert.equal(stages.length,1);assert.equal(stages[0].payload.rows.length,5);assert.deepEqual(stages[0].payload.rows.map(r=>r.ordinal),[1,2,3,4,5]);
 const finish=calls.find(c=>c.op==="finish");assert.equal(finish.payload.summary.signedGrossClp,"3380");assert.equal(finish.payload.summary.knownNetClp,"3320");assert.equal(finish.payload.merchants.length,2);
 const status={job_id:id(2),state:"review_ready",processed_rows:5,summary:finish.payload.summary,diagnostics:finish.payload.diagnostics,error_code:null,merchants:finish.payload.merchants};
 assert.doesNotThrow(()=>wire.validateHistoryResult("status",status));assert.ok(calls.every(c=>!["commit","cancel_batch"].includes(c.op)));
});
test("unresolved modern times preserve both candidates without staging financial rows",async()=>{
 const {port,calls,job}=setup();job.configuration.modernTimeInterpretation="Unresolved";job.configuration.temporalEvidenceReference="";
 const r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.kind,"job_review_ready");assert.equal(r.unresolved,true);assert.equal(calls.some(c=>c.op==="stage"),false);
 const finish=calls.find(c=>c.op==="finish");assert.equal(finish.payload.summary.accepted,0);assert.equal(finish.payload.summary.sourceAccepted,5);assert.equal(finish.payload.summary.candidates.isoFrom,"2024-01-31T16:12:13.4567000");assert.equal(finish.payload.merchants.length,2);
});
test("mutated source is rejected before any financial staging",async()=>{const {port,calls,job}=setup();job.uploads[0].file_sha256="b".repeat(64);const r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.kind,"job_failed");assert.equal(r.code,"history_upload_hash_mismatch");assert.equal(calls.some(c=>c.op==="stage"),false);assert.equal(calls.at(-1).op,"fail");});
test("cross-shop source path cannot be downloaded",async()=>{const {port,calls,job}=setup();job.uploads[0].object_key=`history/${id(99)}/${id(10)}`;let downloads=0;port.download=async()=>{downloads++;return inputs[0].bytes;};await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(downloads,0);assert.equal(calls.at(-1).payload.code,"history_upload_invalid");});
test("memory guard fails before download and retains a closed diagnostic",async()=>{const {port,calls}=setup();port.memoryBytes=()=>1024*1024*1024;const r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.code,"history_worker_memory_limit");assert.equal(calls.some(c=>c.op==="stage"),false);});
test("cancelled process never claims work",async()=>{const {port,calls}=setup(),controller=new AbortController();controller.abort();await assert.rejects(()=>runHistoryWorkerOnce(port,controller.signal));assert.equal(calls.length,0);});
test("stale staging failure cannot be worked around by another commit or lease",async()=>{const {port,calls}=setup(),original=port.rpc;port.rpc=async(op,payload)=>{if(op==="stage"||op==="fail"){calls.push({op,payload});throw Error("database private sentinel");}return original(op,payload);};const r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.kind,"job_failed");assert.equal(r.code,"history_worker_failed");assert.equal(calls.some(c=>c.op==="finish"),false);assert.equal(calls.filter(c=>c.op==="claim").length,1);});
test("upload verification hashes actual bytes and does not create a job",async()=>{const {port,calls,job}=setup(),upload={...job.uploads[0],shop_id:id(1),verification_token:id(4),verification_fence:"2"};port.rpc=async(op,payload)=>{calls.push({op,payload:clone(payload)});return op==="claim_upload"?{upload}:{ok:true};};const r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.kind,"upload_verified");assert.deepEqual(calls.map(c=>c.op),["claim_upload","verify_upload"]);assert.equal(calls[1].payload.sha256,hash(inputs[0].bytes));});
test("upload length mismatch is rejected and cannot become verified",async()=>{const {port,calls,job}=setup(),upload={...job.uploads[0],byte_length:"1",shop_id:id(1),verification_token:id(4),verification_fence:"2"};port.rpc=async(op,payload)=>{calls.push({op,payload});return op==="claim_upload"?{upload}:{ok:true};};const r=await runHistoryWorkerOnce(port,new AbortController().signal);assert.equal(r.kind,"upload_rejected");assert.equal(calls.at(-1).op,"reject_upload");assert.equal(calls.at(-1).payload.retry,false);});
test("SQL wire contract rejects lease/credential fields, unsafe amounts and mixed scopes",()=>{
 const caps={capabilities:{read:true,import:true,cancel:true,export:true,migrate:true},runtime:null};assert.doesNotThrow(()=>wire.validateHistoryResult("capabilities",caps));
 for(const result of [{...caps,lease_token:id(9)},{...caps,capabilities:{...caps.capabilities,credential_hash:"secret"}},{...caps,runtime:{dataset_id:id(1),revision:9007199254740992,writer_epoch:"1",writer_authority:"web",inventory_verified:true}}])assert.throws(()=>wire.validateHistoryResult("capabilities",result),/response_invalid/);
 const receipt={operation_id:id(1),batch_id:id(2),kind:"cancel",dataset_id:id(3),revision:"2",writer_epoch:"1",deactivated:1};assert.doesNotThrow(()=>wire.validateHistoryResult("cancel_batch",receipt));assert.throws(()=>wire.validateHistoryResult("commit",{...receipt,gross_clp:"1"}),/response_invalid/);
});
