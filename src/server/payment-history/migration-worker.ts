import "server-only";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {demandDigest,demandUuid,historyRequestDigest} from "./ledger-contract";
import {readLocalHistoryExport,LOCAL_EXPORT_VERSION,LOCAL_BASELINE_VERSION,type LocalHistoryTable} from "./local-export-reader";

export type MigrationWorkerPort={
 rpc:(operation:string,payload:Record<string,unknown>,signal?:AbortSignal)=>Promise<unknown>;
 download:(objectKey:string,signal:AbortSignal)=>Promise<Buffer>;
 memoryBytes:()=>number;
 diagnostic?:(event:MigrationWorkerDiagnostic)=>void;
};
type MigrationPhase="claim"|"download"|"read_validate"|"stage_objects"|"stage_movements"|"heartbeat"|"finish"|"fail";
export type MigrationWorkerDiagnostic={event:"history.migration.phase";phase:MigrationPhase;outcome:"ok"|"failed"|"cancelled";elapsed_ms:number;rows:number;bytes:number;rpc_count:number;rpc_wait_ms:number;last_object_ordinal:number;last_movement_ordinal:number;rss_bytes:number;peak_rss_bytes:number;cancel_cause:"none"|"deadline"|"process"|"memory"};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const fail=(code:string):never=>{throw Error(code);};
// The port exposes analysis operations only. Financial requests, mappings and
// freeze acknowledgements are deliberately absent from this worker contract.
export async function runMigrationWorkerOnce(port:MigrationWorkerPort,signal?:AbortSignal){
 signal?.throwIfAborted();
 let rpcCount=0,rpcWaitMs=0,lastObject=0,lastMovement=0,peakRss=0,cancelCause:MigrationWorkerDiagnostic["cancel_cause"]="none";
 function cancellation():MigrationWorkerDiagnostic["cancel_cause"]{return cancelCause;}
 const started=performance.now(),controller=new AbortController(),abort=()=>{if(!controller.signal.aborted){cancelCause="process";controller.abort(Error("history_worker_cancelled"));}};
 signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted)abort();
 const expire=()=>{if(!controller.signal.aborted){cancelCause="deadline";controller.abort(Error("history_worker_timeout"));}};
 let deadline=setTimeout(expire,120000);
 const numeric=(value:number)=>Number.isFinite(value)?Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(value))):0;
 function memory(){const rss=numeric(port.memoryBytes());peakRss=Math.max(peakRss,rss);return rss;}
 async function phase<T>(name:MigrationPhase,action:()=>Promise<T>,rows:number|(()=>number)=0,bytes:number|(()=>number)=0){
  const start=Date.now(),waitStart=rpcWaitMs;let outcome:MigrationWorkerDiagnostic["outcome"]="ok";
  try{return await action();}catch(error){outcome=cancelCause==="none"?"failed":"cancelled";throw error;}
  finally{try{port.diagnostic?.({event:"history.migration.phase",phase:name,outcome,elapsed_ms:numeric(Date.now()-start),rows:numeric(typeof rows==="function"?rows():rows),bytes:numeric(typeof bytes==="function"?bytes():bytes),rpc_count:rpcCount,rpc_wait_ms:numeric(rpcWaitMs-waitStart),last_object_ordinal:lastObject,last_movement_ordinal:lastMovement,rss_bytes:memory(),peak_rss_bytes:peakRss,cancel_cause:cancelCause});}catch{/* A diagnostic cannot replace the operation result. */}}
 }
 async function rpc(operation:string,payload:Record<string,unknown>,requestSignal?:AbortSignal){const start=Date.now();rpcCount++;try{return await port.rpc(operation,payload,requestSignal);}finally{rpcWaitMs+=numeric(Date.now()-start);}}
 try{
 const reply=await phase("claim",()=>rpc("claim",{},controller.signal));
 if(!record(reply)||reply.ok!==true||!(reply.run===null||record(reply.run)))return fail("history_worker_response_invalid");
 if(reply.run===null)return {state:"idle" as const};
 const run=reply.run;
 const exportVersion=run.export_version??LOCAL_EXPORT_VERSION;
 if(exportVersion!==LOCAL_EXPORT_VERSION&&exportVersion!==LOCAL_BASELINE_VERSION)return fail("history_worker_response_invalid");
 demandUuid(String(run.run_id));demandUuid(String(run.shop_id));demandUuid(String(run.lease_token));
 if(typeof run.lease_fence!=="string"||!/^\d+$/.test(run.lease_fence)||!record(run.upload))return fail("history_worker_response_invalid");
 const upload=run.upload;
 demandUuid(String(upload.upload_id));demandDigest(String(upload.file_sha256));
 if(upload.object_key!==`history/${run.shop_id}/${upload.upload_id}`||typeof upload.byte_length!=="string"||!/^\d+$/.test(upload.byte_length)||BigInt(upload.byte_length)>BigInt("20971520")||BigInt(upload.byte_length)<BigInt("1"))return fail("history_worker_response_invalid");
 const fence={run_id:run.run_id,lease_token:run.lease_token,lease_fence:run.lease_fence};
 // A replayed claim must not restart an older server attempt. The local clock
 // already began before the original claim; server metadata can only shorten it.
 if(run.attempt_started_at!==undefined){
  if(typeof run.attempt_started_at!=="string"||!Number.isFinite(Date.parse(run.attempt_started_at)))return fail("history_worker_response_invalid");
  const remaining=Math.min(120000-(performance.now()-started),120000-Math.max(0,Date.now()-Date.parse(run.attempt_started_at)));
  clearTimeout(deadline);if(remaining<=0)expire();else deadline=setTimeout(expire,remaining);
 }
 let lastHeartbeat=Date.now();
 async function alive(){
  controller.signal.throwIfAborted();if(memory()>896*1024*1024){cancelCause="memory";controller.abort(Error("history_worker_memory_limit"));return fail("history_worker_memory_limit");}
  if(Date.now()-lastHeartbeat>20000){await phase("heartbeat",()=>rpc("heartbeat",fence,controller.signal));controller.signal.throwIfAborted();lastHeartbeat=Date.now();}
 }
 try{
  await alive();const bytes=await phase("download",()=>port.download(String(upload.object_key),controller.signal),0,Number(upload.byte_length));controller.signal.throwIfAborted();
  if(bytes.length.toString()!==upload.byte_length||createHash("sha256").update(bytes).digest("hex")!==upload.file_sha256)return fail("history_upload_checksum_mismatch");
  let objectOrdinal=0,readRows=0,readBytes=0;const pending:{table:LocalHistoryTable;ordinal:number;sourceOrdinal:number;line:string}[]=[];
  let pendingBytes=0;
  let vectorPhase:"stage_objects"|"stage_movements"="stage_objects";const chunks:{rows:Record<string,unknown>[]}[]=[];
  async function flushVector(){
   if(!chunks.length)return;await alive();const batch=chunks.splice(0),payload={...fence,phase:vectorPhase,chunks:batch},last=Number(batch[batch.length-1].rows.at(-1)!.ordinal);
   await phase(vectorPhase,async()=>{
    const ack=await rpc("stage_vector_v2",payload,controller.signal);controller.signal.throwIfAborted();
    if(!record(ack)||ack.ok!==true||ack.phase!==vectorPhase||ack.accepted_chunks!==batch.length||ack.last_ordinal!==last)return fail("history_worker_response_invalid");
    if(vectorPhase==="stage_objects")lastObject=last;else lastMovement=last;
   },batch.reduce((n,chunk)=>n+chunk.rows.length,0),Buffer.byteLength(JSON.stringify(payload)));
  }
  async function stage(name:typeof vectorPhase,rows:Record<string,unknown>[]){
   if(name!==vectorPhase){await flushVector();vectorPhase=name;}
   if(Buffer.byteLength(JSON.stringify({...fence,phase:name,chunks:[...chunks,{rows}]}))>6*1024*1024)await flushVector();
   if(Buffer.byteLength(JSON.stringify({...fence,phase:name,chunks:[{rows}]}))>6*1024*1024)return fail("history_worker_payload_limit");
   chunks.push({rows});if(chunks.length===4)await flushVector();
  }
  async function flush(){if(!pending.length)return;await alive();await stage("stage_objects",pending.splice(0));pendingBytes=0;}
  const result=await phase("read_validate",()=>readLocalHistoryExport(bytes,String(run.shop_id),controller.signal,async(table,sourceOrdinal,line)=>{
   // JSON escaping can expand a receipt line. Keep the whole RPC below8MiB.
   const size=Buffer.byteLength(JSON.stringify(line))+256;
   if(pending.length>=200||pendingBytes+size>6*1024*1024)await flush();
   pending.push({table,sourceOrdinal,ordinal:++objectOrdinal,line});pendingBytes+=size;readRows++;readBytes+=Buffer.byteLength(line)+1;
  },exportVersion),()=>readRows,()=>readBytes);
  await flush();await flushVector();
  let movementOrdinal=0;
  for(let offset=0;offset<result.movements.length;offset+=200){await alive();await stage("stage_movements",result.movements.slice(offset,offset+200).map(row=>({...row,ordinal:++movementOrdinal})));}await flushVector();
  await alive();await phase("finish",async()=>{await rpc("finish",{...fence,raw_manifest:result.rawManifest,analysis_digest:historyRequestDigest({archive:result.archiveSha256,manifest:result.manifestSha256,summary:result.summary})},controller.signal);controller.signal.throwIfAborted();});
  return {state:"analysed" as const,runId:String(run.run_id),objects:objectOrdinal,movements:movementOrdinal};
 }catch(error){
  const message=error instanceof Error?error.message:"";
  const cause=cancellation(),code=cause==="deadline"?"history_worker_timeout":cause==="process"?"history_worker_cancelled":/^(history|getnet)_[a-z_]{1,90}$/.test(message)?message:"history_local_export_invalid";
  // A stale fence can no longer publish even a failure. Do not restart a run.
  // The analysis signal is already cancelled. A terminal failure uses only the
  // process signal, the original fence, and the transport's existing15s bound.
  try{await phase("fail",()=>rpc("fail",{...fence,code},signal));}catch{}
  return {state:"failed" as const,runId:String(run.run_id),code};
 }
 }finally{clearTimeout(deadline);signal?.removeEventListener("abort",abort);}
}
