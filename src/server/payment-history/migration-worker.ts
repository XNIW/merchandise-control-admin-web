import "server-only";
import {createHash} from "node:crypto";
import {demandDigest,demandUuid,historyRequestDigest} from "./ledger-contract";
import {readLocalHistoryExport,type LocalHistoryTable} from "./local-export-reader";

export type MigrationWorkerPort={
 rpc:(operation:string,payload:Record<string,unknown>)=>Promise<unknown>;
 download:(objectKey:string,signal:AbortSignal)=>Promise<Buffer>;
 memoryBytes:()=>number;
};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const fail=(code:string):never=>{throw Error(code);};
// The port exposes analysis operations only. Financial requests, mappings and
// freeze acknowledgements are deliberately absent from this worker contract.
export async function runMigrationWorkerOnce(port:MigrationWorkerPort){
 const reply=await port.rpc("claim",{});
 if(!record(reply)||reply.ok!==true||!(reply.run===null||record(reply.run)))return fail("history_worker_response_invalid");
 if(reply.run===null)return {state:"idle" as const};
 const run=reply.run;
 demandUuid(String(run.run_id));demandUuid(String(run.shop_id));demandUuid(String(run.lease_token));
 if(typeof run.lease_fence!=="string"||!/^\d+$/.test(run.lease_fence)||!record(run.upload))return fail("history_worker_response_invalid");
 const upload=run.upload;
 demandUuid(String(upload.upload_id));demandDigest(String(upload.file_sha256));
 if(upload.object_key!==`history/${run.shop_id}/${upload.upload_id}`||typeof upload.byte_length!=="string"||!/^\d+$/.test(upload.byte_length)||BigInt(upload.byte_length)>BigInt("20971520")||BigInt(upload.byte_length)<BigInt("1"))return fail("history_worker_response_invalid");
 const fence={run_id:run.run_id,lease_token:run.lease_token,lease_fence:run.lease_fence};
 const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),120000);
 let lastHeartbeat=Date.now();
 async function alive(){
  controller.signal.throwIfAborted();if(port.memoryBytes()>896*1024*1024)return fail("history_worker_memory_limit");
  if(Date.now()-lastHeartbeat>20000){await port.rpc("heartbeat",fence);lastHeartbeat=Date.now();}
 }
 try{
  await alive();const bytes=await port.download(String(upload.object_key),controller.signal);
  if(bytes.length.toString()!==upload.byte_length||createHash("sha256").update(bytes).digest("hex")!==upload.file_sha256)return fail("history_upload_checksum_mismatch");
  let objectOrdinal=0;const pending:{table:LocalHistoryTable;ordinal:number;sourceOrdinal:number;line:string}[]=[];
  let pendingBytes=0;
  async function flush(){if(!pending.length)return;await alive();await port.rpc("stage_objects",{...fence,rows:pending.splice(0)});pendingBytes=0;}
  const result=await readLocalHistoryExport(bytes,String(run.shop_id),controller.signal,async(table,sourceOrdinal,line)=>{
   // JSON escaping can expand a receipt line. Keep the whole RPC below8MiB.
   const size=Buffer.byteLength(JSON.stringify(line))+256;
   if(pending.length>=200||pendingBytes+size>6*1024*1024)await flush();
   pending.push({table,sourceOrdinal,ordinal:++objectOrdinal,line});pendingBytes+=size;
  });
  await flush();
  let movementOrdinal=0;
  for(let offset=0;offset<result.movements.length;offset+=200){await alive();await port.rpc("stage_movements",{...fence,rows:result.movements.slice(offset,offset+200).map(row=>({...row,ordinal:++movementOrdinal}))});}
  await alive();await port.rpc("finish",{...fence,raw_manifest:result.rawManifest,analysis_digest:historyRequestDigest({archive:result.archiveSha256,manifest:result.manifestSha256,summary:result.summary})});
  return {state:"analysed" as const,runId:String(run.run_id),objects:objectOrdinal,movements:movementOrdinal};
 }catch(error){
  const message=error instanceof Error?error.message:"";
  const code=/^(history|getnet)_[a-z_]{1,90}$/.test(message)?message:controller.signal.aborted?"history_worker_timeout":"history_local_export_invalid";
  // A stale fence can no longer publish even a failure. Do not restart a run.
  try{await port.rpc("fail",{...fence,code});}catch{}
  return {state:"failed" as const,runId:String(run.run_id),code};
 }finally{clearTimeout(deadline);}
}
