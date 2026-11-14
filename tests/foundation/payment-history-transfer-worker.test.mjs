import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash,createHmac} from "node:crypto";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import {gunzipSync} from "node:zlib";
import {load} from "./helpers/payment-history-harness.mjs";
import {syntheticBaselineVolume} from "./helpers/payment-history-volume-fixture.mjs";
const require=createRequire(import.meta.url),clone=v=>JSON.parse(JSON.stringify(v));
const root="tests/fixtures/payment-history/local-export-v1/",bytes=readFileSync(root+"synthetic-local-history.w7history.zip"),fixture=JSON.parse(readFileSync(root+"sql-payload.json","utf8"));
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`,secret="synthetic-gateway-test-key-32-bytes-minimum",nonce=id(19);
const {runMigrationWorkerOnce}=load("src/server/payment-history/migration-worker.ts");
function setup(){
 const calls=[],run={run_id:id(2),shop_id:"10000000-0000-4000-8000-000000003019",lease_token:id(3),lease_fence:"1",upload:{upload_id:id(4),file_name:"synthetic.w7history.zip",object_key:`history/10000000-0000-4000-8000-000000003019/${id(4)}`,file_sha256:fixture.archiveSha256,byte_length:String(bytes.length)}};
 const port={memoryBytes:()=>1024,async rpc(op,payload,signal){calls.push({op,payload:clone(payload),signal});return op==="claim"?{ok:true,run}:op==="stage_vector_v2"?{ok:true,phase:payload.phase,accepted_chunks:payload.chunks.length,last_ordinal:payload.chunks.at(-1).rows.at(-1).ordinal,sql_elapsed_ms:0}:{ok:true};},async download(){return bytes;}};
 return {calls,run,port};
}
test("real CLR export streams all original lines before normalized movement staging",async()=>{
 const x=setup(),r=await runMigrationWorkerOnce(x.port);assert.equal(r.state,"analysed");assert.equal(r.objects,14);assert.equal(r.movements,5);
 assert.deepEqual(x.calls.find(c=>c.op==="stage_vector_v2"&&c.payload.phase==="stage_objects").payload.chunks.flatMap(c=>c.rows),fixture.objects);
 assert.deepEqual(x.calls.find(c=>c.op==="stage_vector_v2"&&c.payload.phase==="stage_movements").payload.chunks.flatMap(c=>c.rows),fixture.movements);
 assert.ok(x.calls.every(c=>!["stage_objects","stage_movements"].includes(c.op)),"No silent fallback to the old RPC contract");
 assert.equal(x.calls.find(c=>c.op==="finish").payload.raw_manifest,fixture.rawManifest);
 assert.ok(x.calls.every(c=>!["apply","mapping","freeze_ack","commit"].includes(c.op)));
});

test("server-admitted v2 baseline streams the real CLR lineage without a financial command",async()=>{
 const path="tests/fixtures/payment-history/local-export-v2/",source=readFileSync(path+"synthetic-local-baseline.w7history.zip"),proof=JSON.parse(readFileSync(path+"provenance.json","utf8"));
 const x=setup();x.run.export_version="history-local-export-v2";x.run.upload.file_sha256=proof.archiveSha256;x.run.upload.byte_length=String(source.length);x.port.download=async()=>source;
 const result=await runMigrationWorkerOnce(x.port);assert.equal(result.state,"analysed");assert.equal(result.objects,14);assert.equal(result.movements,5);
 const raw=x.calls.find(c=>c.op==="finish").payload.raw_manifest;
 assert.equal(createHash("sha256").update(raw).digest("hex"),proof.manifestSha256);assert.equal(JSON.parse(raw).restoreLineageId,proof.restoreLineageId);
 assert.ok(x.calls.every(c=>!["apply","mapping","freeze_ack","commit"].includes(c.op)));
});
test("versioned vectors preserve every canonical 200-row chunk and phase boundary",async()=>{
 const shopId=id(77),input=await syntheticBaselineVolume({rows:1001,movementBytes:820820,shopId}),x=setup();x.run.shop_id=shopId;x.run.upload.object_key=`history/${shopId}/${x.run.upload.upload_id}`;
 Object.assign(x.run.upload,{file_sha256:input.metadata.archiveSha256,byte_length:String(input.archive.length)});x.run.export_version="history-local-export-v2";x.port.download=async()=>input.archive;
 const result=await runMigrationWorkerOnce(x.port),vectors=x.calls.filter(c=>c.op==="stage_vector_v2");
 assert.equal(result.state,"analysed");assert.equal(result.objects,1009);assert.equal(result.movements,1001);assert.equal(vectors.length,4);
 for(const vector of vectors){assert.ok(vector.payload.chunks.length<=4);assert.ok(Buffer.byteLength(JSON.stringify(vector.payload))<=6*1024*1024);assert.ok(vector.payload.chunks.every(c=>c.rows.length>0&&c.rows.length<=200));}
 for(const phase of ["stage_objects","stage_movements"]){const rows=vectors.filter(c=>c.payload.phase===phase).flatMap(c=>c.payload.chunks.flatMap(c=>c.rows));assert.deepEqual(rows.map(r=>r.ordinal),Array.from({length:rows.length},(_,i)=>i+1));}
 assert.deepEqual(vectors.map(c=>c.payload.phase),["stage_objects","stage_objects","stage_movements","stage_movements"]);assert.equal(x.calls.at(-1).op,"finish");
});
test("a manifest cannot upgrade a frozen migration into a v2 baseline",async()=>{
 const source=readFileSync("tests/fixtures/payment-history/local-export-v2/synthetic-local-baseline.w7history.zip"),x=setup();
 x.run.upload.file_sha256=createHash("sha256").update(source).digest("hex");x.run.upload.byte_length=String(source.length);x.port.download=async()=>source;
 const result=await runMigrationWorkerOnce(x.port);assert.equal(result.state,"failed");
 assert.equal(x.calls.some(c=>["stage_vector_v2","finish"].includes(c.op)),false);
});
test("an unknown admitted export version is rejected before download",async()=>{
 const x=setup();x.run.export_version="future-unknown";let downloads=0;x.port.download=async()=>{downloads++;return bytes;};
 await assert.rejects(()=>runMigrationWorkerOnce(x.port),/response_invalid/);assert.equal(downloads,0);
});
test("bad local archive checksum publishes no financial or provenance candidates",async()=>{const x=setup();x.run.upload.file_sha256="f".repeat(64);const r=await runMigrationWorkerOnce(x.port);assert.equal(r.code,"history_upload_checksum_mismatch");assert.deepEqual(x.calls.map(c=>c.op),["claim","fail"]);});
test("copied cross-shop object cannot be downloaded",async()=>{const x=setup();x.run.upload.object_key=`history/${id(99)}/${id(4)}`;let downloads=0;x.port.download=async()=>{downloads++;return bytes;};await assert.rejects(()=>runMigrationWorkerOnce(x.port),/response_invalid/);assert.equal(downloads,0);});
test("memory cap stops migration before reading any original data",async()=>{const x=setup();x.port.memoryBytes=()=>1024*1024*1024;const r=await runMigrationWorkerOnce(x.port);assert.equal(r.code,"history_worker_memory_limit");assert.equal(x.calls.some(c=>c.op==="stage_vector_v2"),false);});
test("lost migration fence cannot be bypassed with a finish or second claim",async()=>{const x=setup(),rpc=x.port.rpc;x.port.rpc=async(op,payload,signal)=>{if(op==="stage_vector_v2"||op==="fail"){x.calls.push({op,payload});throw Error("private SQL detail");}return rpc(op,payload,signal);};const r=await runMigrationWorkerOnce(x.port);assert.equal(r.state,"failed");assert.equal(x.calls.some(c=>c.op==="finish"),false);assert.equal(x.calls.filter(c=>c.op==="claim").length,1);assert.equal(r.code,"history_local_export_invalid");});
function module(path,imports,extra={}){const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Buffer,Request,Response,TextDecoder,Uint8Array,URL,Error,Date,AbortController,AbortSignal,setTimeout,clearTimeout,process:{env:{PAYMENT_HISTORY_WORKER_GATEWAY_SECRET:secret}},require(name){if(name==="server-only")return {};if(name in imports)return imports[name];if(name.startsWith("node:"))return require(name);if(name==="./ledger-contract")return load("src/server/payment-history/ledger-contract.ts");if(name==="./worker-signature")return load("src/server/payment-history/worker-signature.ts");if(name==="./local-export-reader")return load("src/server/payment-history/local-export-reader.ts");throw Error("unexpected dependency "+name);},...extra});return m.exports;}
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

function transport(fetch,extra={}){return module("tools/PaymentHistoryWorker/gateway-port.ts",{"../../src/server/payment-history/worker-signature":load("src/server/payment-history/worker-signature.ts")},{fetch,AbortSignal,...extra}).createWorkerGatewayPort("http://127.0.0.1/api/internal/payment-history/worker",secret,true);}
const idleReply=()=>new Response(JSON.stringify({data:{ok:true,job:null},downloads:[]}));
function recoveringTransport(fetch,backoff,events=[]){return module("tools/PaymentHistoryWorker/gateway-port.ts",{"../../src/server/payment-history/worker-signature":load("src/server/payment-history/worker-signature.ts"),"node:timers/promises":{setTimeout:backoff}},{fetch,AbortSignal}).createWorkerGatewayPort("http://127.0.0.1/api/internal/payment-history/worker",secret,true,event=>events.push(event),true);}
function controlledDeadline(){let expire;const delays=[];const run=module("src/server/payment-history/migration-worker.ts",{},{setTimeout(callback,ms){delays.push(ms);expire=callback;return 1;},clearTimeout(){}}).runMigrationWorkerOnce;return {run,delays,expire(){assert.equal(typeof expire,"function");expire();}};}
test("daemon claim recovery retains the uncertain request identity and one pre-claim deadline",async()=>{
 const x=setup(),clock=controlledDeadline(),claims=[],delays=[];let attempts=0;
 const p=recoveringTransport(async(_url,request)=>{
  const input=JSON.parse(request.headers['content-encoding']==='gzip'?gunzipSync(request.body):request.body);
  if(input.operation==='claim'){claims.push(request);if(++attempts<=2)throw Error('Synthetic ACK lost after owned claim');return Response.json({data:{ok:true,run:x.run},downloads:[]});}
  const data=input.operation==='stage_vector_v2'?{ok:true,phase:input.payload.phase,accepted_chunks:input.payload.chunks.length,last_ordinal:input.payload.chunks.at(-1).rows.at(-1).ordinal}:{ok:true};
  return Response.json({data,downloads:[]});
 },async(ms,_value,{signal})=>{signal.throwIfAborted();delays.push(ms);});
 x.port.rpc=(op,payload,signal)=>p.call('migration',op,payload,signal);const result=await clock.run(x.port);
 assert.equal(result.state,'analysed');assert.equal(result.objects,14);assert.deepEqual(delays,[2000]);assert.deepEqual(clock.delays,[120000]);assert.equal(claims.length,3);
 assert.equal(new Set(claims.map(c=>c.headers['x-history-nonce'])).size,1);assert.ok(claims.every(c=>c.body.equals(claims[0].body)));
});
test("daemon claim recovery remains bounded and never recovers owned stage or authorization denial",async()=>{
 const delays=[],events=[];let attempts=0;const controller=new AbortController();
 const p=recoveringTransport(async()=>{attempts++;throw Error('Synthetic network failure');},async(ms)=>delays.push(ms),events);
 await assert.rejects(()=>p.call('migration','claim',{},controller.signal),/history_worker_gateway_unavailable/);assert.equal(attempts,8);assert.deepEqual(delays,[2000,5000,15000]);assert.equal(events.filter(e=>e.event==='history.worker.claim_recovery').length,3);
 attempts=0;delays.length=0;await assert.rejects(()=>p.call('migration','stage_vector_v2',{},controller.signal),/history_worker_gateway_unavailable/);assert.equal(attempts,2);assert.equal(delays.length,0);
 let denied=0;const auth=recoveringTransport(async()=>{denied++;return new Response('',{status:403});},async()=>{throw Error('Auth must not back off');});await assert.rejects(()=>auth.call('migration','claim',{},controller.signal),/history_worker_rpc_rejected/);assert.equal(denied,1);
 let malformed=0;const contract=recoveringTransport(async()=>{malformed++;return new Response('{invalid JSON');},async()=>{throw Error('Contract failure must not back off');});await assert.rejects(()=>contract.call('migration','claim',{},controller.signal),/history_worker_response_invalid/);assert.equal(malformed,1);
});
test("the original deadline interrupts claim recovery backoff before any new claim",async()=>{
 const x=setup(),clock=controlledDeadline();let attempts=0;
 const p=recoveringTransport(async()=>{attempts++;throw Error('Synthetic ACK lost');},async(_ms,_value,{signal})=>{clock.expire();signal.throwIfAborted();});
 x.port.rpc=(op,payload,signal)=>p.call('migration',op,payload,signal);
 await assert.rejects(()=>clock.run(x.port),/history_worker_timeout/);assert.equal(attempts,2);assert.deepEqual(clock.delays,[120000]);
});
test("a replayed server attempt can only shorten the pre-claim analysis deadline",async()=>{
 const x=setup(),clock=controlledDeadline();x.run.attempt_started_at=new Date(Date.now()-121000).toISOString();const result=await clock.run(x.port);
 assert.equal(result.code,'history_worker_timeout');assert.deepEqual(x.calls.map(c=>c.op),['claim','fail']);assert.deepEqual(clock.delays,[120000]);
 const y=setup(),future=controlledDeadline();y.run.attempt_started_at=new Date(Date.now()+60000).toISOString();assert.equal((await future.run(y.port)).state,'analysed');assert.ok(future.delays.every(ms=>ms<=120000));
});
for(const stalled of ["headers","body","late_ack"])test("analysis deadline reaches blocked RPC "+stalled+" without retry or finish",async()=>{
 const x=setup(),clock=controlledDeadline(),original=x.port.rpc,events=[];let attempts=0;
 x.port.diagnostic=e=>events.push(e);
 const p=transport(async(_url,input)=>{
  attempts++;queueMicrotask(()=>clock.expire());
  if(stalled==="headers")return new Promise((_resolve,reject)=>input.signal.addEventListener("abort",()=>reject(input.signal.reason),{once:true}));
  return new Response(new ReadableStream({start(controller){input.signal.addEventListener("abort",()=>controller.error(input.signal.reason),{once:true});}}));
 });
 x.port.rpc=async(op,payload,signal)=>{
  if(op!=="stage_vector_v2")return original(op,payload,signal);
  x.calls.push({op,payload,signal});assert.ok(signal);
  if(stalled==="late_ack"){clock.expire();return {ok:true,phase:payload.phase,accepted_chunks:payload.chunks.length,last_ordinal:payload.chunks.at(-1).rows.at(-1).ordinal};}
  return p.call("migration",op,payload,signal);
 };
 const processController=new AbortController(),result=await clock.run(x.port,processController.signal);
 assert.equal(result.code,"history_worker_timeout");assert.deepEqual(clock.delays,[120000]);assert.equal(attempts,stalled==="late_ack"?0:1);
 assert.equal(x.calls.some(c=>c.op==="finish"),false);assert.equal(x.calls.filter(c=>c.op==="claim").length,1);
 const terminal=x.calls.find(c=>c.op==="fail");assert.equal(terminal.signal,processController.signal);assert.equal(terminal.signal.aborted,false);assert.equal(terminal.payload.lease_token,x.run.lease_token);
 assert.equal(events.find(e=>e.phase==="stage_objects").cancel_cause,"deadline");assert.equal(events.find(e=>e.phase==="stage_objects").last_object_ordinal,0);
});
test("process cancellation propagates to migration staging and never starts another claim",async()=>{
 const x=setup(),original=x.port.rpc,controller=new AbortController();x.port.rpc=async(op,payload,signal)=>{if(op==="stage_vector_v2"){controller.abort(Error("private operator context"));signal.throwIfAborted();}return original(op,payload,signal);};
 const r=await runMigrationWorkerOnce(x.port,controller.signal);assert.equal(r.code,"history_worker_cancelled");assert.equal(x.calls.some(c=>c.op==="finish"),false);assert.equal(x.calls.filter(c=>c.op==="claim").length,1);
});
test("migration diagnostics are closed metadata, remain redacted on failure, and cannot change success",async()=>{
 const x=setup(),events=[];x.port.diagnostic=e=>events.push(e);await runMigrationWorkerOnce(x.port);
 assert.deepEqual(events.map(e=>e.phase),["claim","download","read_validate","stage_objects","stage_movements","finish"]);
 const finish=events.at(-1);assert.equal(finish.last_object_ordinal,14);assert.equal(finish.last_movement_ordinal,5);assert.equal(finish.rpc_count,4);assert.ok(events.find(e=>e.phase==="read_validate").bytes>0);
 const text=JSON.stringify(events);for(const privateValue of [x.run.shop_id,x.run.lease_token,fixture.objects[0].line,"1200"])assert.equal(text.includes(privateValue),false);
 assert.ok(events.every(e=>Object.keys(e).sort().join(',')==="bytes,cancel_cause,elapsed_ms,event,last_movement_ordinal,last_object_ordinal,outcome,peak_rss_bytes,phase,rows,rpc_count,rpc_wait_ms,rss_bytes"));
 const y=setup();y.port.diagnostic=()=>{throw Error("private sink detail");};assert.equal((await runMigrationWorkerOnce(y.port)).state,"analysed");
});
for(const changed of ["phase","accepted_chunks","last_ordinal"])test("wrong vector ACK "+changed+" fails closed without a v1 fallback",async()=>{
 const x=setup(),original=x.port.rpc;x.port.rpc=async(op,payload,signal)=>{const ack=await original(op,payload,signal);if(op==="stage_vector_v2")ack[changed]=changed==="phase"?"stage_movements":-1;return ack;};
 const result=await runMigrationWorkerOnce(x.port);assert.equal(result.code,"history_worker_response_invalid");assert.equal(x.calls.some(c=>["stage_objects","stage_movements","finish"].includes(c.op)),false);
});
test("gateway transport retry keeps the same request identity after a lost reply",async()=>{const calls=[];const p=transport(async(_url,input)=>{calls.push(input);if(calls.length===1)throw Error("connection reset after commit");return idleReply();});assert.equal((await p.call("import","claim",{})).ok,true);assert.equal(calls.length,2);assert.equal(calls[0].headers["x-history-nonce"],calls[1].headers["x-history-nonce"]);assert.equal(calls[0].body.toString(),calls[1].body.toString());});
for(const stalled of ["headers","body"])test("gateway bounds stalled "+stalled+" and stops after two attempts",async()=>{
 const deadlines=[],calls=[];const timer={timeout(ms){deadlines.push(ms);const controller=new AbortController();setTimeout(()=>controller.abort(Error("synthetic deadline")),3);return controller.signal;},any:AbortSignal.any.bind(AbortSignal)};
 const p=transport(async(_url,input)=>{calls.push(input);if(stalled==="headers")return new Promise((_resolve,reject)=>input.signal.addEventListener("abort",()=>reject(input.signal.reason),{once:true}));return new Response(new ReadableStream({start(c){input.signal.addEventListener("abort",()=>c.error(input.signal.reason),{once:true});}}));},{AbortSignal:timer});
 await assert.rejects(()=>p.call("migration","claim",{}),/history_worker_gateway_unavailable/);assert.deepEqual(deadlines,[15000,15000]);assert.equal(calls.length,2);assert.equal(calls[0].headers["x-history-nonce"],calls[1].headers["x-history-nonce"]);
});
test("caller cancellation never retries a claim",async()=>{const controller=new AbortController();let calls=0;const p=transport(async()=>{calls++;controller.abort(Error("operator stopped"));throw Error("cancelled");});await assert.rejects(()=>p.call("import","claim",{},controller.signal),/operator stopped/);assert.equal(calls,1);});
test("oversized gateway reply is cancelled without another claim",async()=>{let calls=0,cancelled=false;const p=transport(async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8388609));},cancel(){cancelled=true;}}));});await assert.rejects(()=>p.call("migration","claim",{}),/history_worker_response_limit/);assert.equal(calls,1);assert.equal(cancelled,true);});
