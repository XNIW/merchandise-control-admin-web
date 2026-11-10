import "server-only";
import {createHash} from "node:crypto";
import {analyzeGetnetFiles} from "./getnet-analyzer";
import {GETNET_WEB_LIMITS as L} from "./getnet-limits";
import type {GetnetImportOptions} from "./getnet-contract";
import {demandDigest,demandUuid,historyRequestDigest,merchantAliasKey} from "./ledger-contract";

type Upload={upload_id:string;shop_id?:string;object_key:string;file_name:string;file_sha256:string;byte_length:string};
type UploadLease=Upload&{verification_token:string;verification_fence:string};
type Job={job_id:string;shop_id:string;lease_token:string;lease_fence:string;configuration:GetnetImportOptions;uploads:Upload[]};
export type HistoryWorkerPort={rpc:(operation:string,payload:Record<string,unknown>,signal?:AbortSignal)=>Promise<Record<string,unknown>>;
 download:(objectKey:string,limit:number,signal:AbortSignal)=>Promise<Buffer>;memoryBytes:()=>number};
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
function validateUpload(upload:Upload,shop:string){
 demandUuid(shop);demandUuid(upload.upload_id);demandDigest(upload.file_sha256);
 if(upload.object_key!==`history/${shop}/${upload.upload_id}`||!/^\d+$/.test(upload.byte_length)||!Number.isSafeInteger(Number(upload.byte_length))||Number(upload.byte_length)<1||Number(upload.byte_length)>L.fileBytes||upload.file_name.length>256)throw Error("history_upload_invalid");
}
// One claim at a time. A deployment must enforce a 1GiB process/container limit.
// This module is never imported by the HTTP application.
export async function runHistoryWorkerOnce(port:HistoryWorkerPort,signal:AbortSignal){
 signal.throwIfAborted();
 const upload=(await port.rpc("claim_upload",{},signal)).upload as UploadLease|null;
 if(upload){
  const lease={upload_id:upload.upload_id,verification_token:upload.verification_token,verification_fence:upload.verification_fence};
  try{
   validateUpload(upload,upload.shop_id??"");demandUuid(upload.verification_token);
   const bytes=await port.download(upload.object_key,L.fileBytes,signal);
   if(bytes.length!==Number(upload.byte_length)||sha(bytes)!==upload.file_sha256)throw Error("history_upload_hash_mismatch");
   await port.rpc("verify_upload",{...lease,object_key:upload.object_key,sha256:upload.file_sha256,byte_length:String(bytes.length)},signal);
   return {kind:"upload_verified" as const};
  }catch(error){
   if(signal.aborted)throw error;
   await port.rpc("reject_upload",{...lease,retry:error instanceof Error&&error.message==="history_source_not_ready"},signal);
   return {kind:"upload_rejected" as const};
  }
 }
 const job=(await port.rpc("claim",{},signal)).job as Job|null;
 if(!job)return {kind:"idle" as const};
 demandUuid(job.job_id);demandUuid(job.shop_id);demandUuid(job.lease_token);
 const lease={job_id:job.job_id,lease_token:job.lease_token,lease_fence:job.lease_fence};
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal.addEventListener("abort",abort,{once:true});
 const deadline=setTimeout(()=>controller.abort(Error("history_analysis_timeout")),120000);
 // Do not overlap heartbeat calls or publish after one fails.
 let heartbeat:Promise<void>|null=null;
 const interval=setInterval(()=>{if(!heartbeat){heartbeat=port.rpc("heartbeat",lease,controller.signal).then(()=>{},()=>{controller.abort(Error("history_worker_lease_lost"));}).finally(()=>{heartbeat=null;});}},20000);
 const memory=()=>{if(port.memoryBytes()>896*1024*1024)throw Error("history_worker_memory_limit");};
 try{
  memory();
  if(!Array.isArray(job.uploads)||job.uploads.length<1||job.uploads.length>L.files||new Set(job.uploads.map(u=>u.upload_id)).size!==job.uploads.length)throw Error("history_sources_invalid");
  let bytesTotal=0;const inputs:{fileName:string;bytes:Buffer}[]=[];
  for(const file of job.uploads){
   validateUpload(file,job.shop_id);bytesTotal+=Number(file.byte_length);if(bytesTotal>L.selectionBytes)throw Error("history_source_limit");
   const bytes=await port.download(file.object_key,L.fileBytes,controller.signal);
   if(bytes.length!==Number(file.byte_length)||sha(bytes)!==file.file_sha256)throw Error("history_upload_hash_mismatch");
   inputs.push({fileName:file.file_name,bytes});memory();
  }
  const analysis=await analyzeGetnetFiles(inputs,job.configuration,controller.signal);memory();
  if(analysis.hasErrors)throw Error("getnet_analysis_rejected");
  const rows=analysis.files.flatMap(file=>file.transactions);
  const merchants=[...new Map(rows.map(row=>{const alias_key=merchantAliasKey(row.merchant);return [alias_key,{alias_key,source_identity:row.merchant}] as const;})).values()];
  if(merchants.length>200||Buffer.byteLength(JSON.stringify(merchants))>262144)throw Error("history_merchant_limit");
  // Unresolved modern rows remain visible in analysis; they cannot be staged as
  // financial candidates. Reanalysis under an evidenced policy uses a new job.
  const unresolved=rows.some(row=>!row.timestamp.businessDateTime);
  if(!unresolved){
   for(let offset=0;offset<rows.length;offset+=200){
    controller.signal.throwIfAborted();memory();
    const chunk=rows.slice(offset,offset+200).map((transaction,index)=>({ordinal:offset+index+1,upload_id:job.uploads[Number(transaction.source.fileId.slice(5))-1].upload_id,transaction}));
    await port.rpc("stage",{...lease,rows:chunk},controller.signal);
   }
  }
  controller.signal.throwIfAborted();
  const summary={...analysis.summary,accepted:unresolved?0:analysis.summary.accepted,sourceAccepted:analysis.summary.accepted,
   candidates:{isoFrom:analysis.summary.fromIsoCandidateDateTime,isoTo:analysis.summary.toIsoCandidateDateTime,localFrom:analysis.summary.fromExportedLocalCandidateDateTime,localTo:analysis.summary.toExportedLocalCandidateDateTime},needsTimeDecision:unresolved};
  await port.rpc("finish",{...lease,analysis_digest:historyRequestDigest({parserVersion:analysis.parserVersion,files:analysis.files.map(f=>({sha256:f.sha256,rows:f.sourceRows})),summary,configuration:job.configuration}),summary,
   merchants,diagnostics:analysis.diagnostics.map(d=>({code:d.code,severity:d.severity,source:d.source,field:d.field,column:d.column}))},controller.signal);
  return {kind:"job_review_ready" as const,rows:rows.length,unresolved};
 }catch(error){
  if(signal.aborted)throw error;
  const reason=controller.signal.aborted?controller.signal.reason:error;
  const code=reason instanceof Error&&/^(getnet|history)_[a-z_]{1,90}$/.test(reason.message)?reason.message:"history_worker_failed";
  // A stale fence must never be bypassed to record a secondary failure.
  try{await port.rpc("fail",{...lease,code},signal);}catch{}
  return {kind:"job_failed" as const,code};
 }finally{clearTimeout(deadline);clearInterval(interval);signal.removeEventListener("abort",abort);if(heartbeat)await heartbeat;}
}
