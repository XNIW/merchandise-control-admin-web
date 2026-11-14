import {existsSync,lstatSync,openSync,closeSync,readSync,writeFileSync,renameSync} from "node:fs";
import {dirname,isAbsolute,resolve} from "node:path";

const maximumBytes=512*1024;
const codes=new Set(["history_worker_failed","history_worker_cancelled","history_worker_timeout","history_worker_memory_limit","history_worker_configuration_missing","history_worker_gateway_unavailable","history_worker_rpc_rejected","history_worker_response_invalid","history_worker_response_limit","history_worker_payload_limit","history_worker_diagnostics_unavailable","history_worker_unexpected_stop","history_upload_checksum_mismatch","history_local_export_invalid","history_local_export_limit","history_local_scope_mismatch","history_local_receipt_mismatch","history_local_entry_checksum_mismatch","history_local_duplicate_id","history_local_ambiguous_binding","history_local_cashier_unverified","history_local_timestamp_mismatch","history_local_economics_mismatch","history_local_duplicate_active_identity","history_local_source_changed","history_analysis_timeout","history_worker_lease_lost","getnet_analysis_rejected"]);
const phases=["claim","download","read_validate","stage_objects","stage_movements","heartbeat","finish","fail"];
const operations=["claim_upload","verify_upload","reject_upload","claim","heartbeat","stage","stage_objects","stage_movements","stage_vector_v2","finish","fail","unknown"];
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;
const choice=(value:unknown,options:string[])=>typeof value==="string"&&options.includes(value);

/** Reconstruct from closed fields; never serialize arbitrary errors or extras. */
export function redactedWorkerEvent(value:unknown):Record<string,unknown>|null{
 if(!record(value)||typeof value.event!=="string")return null;
 const result:Record<string,unknown>={event:value.event};
 if(value.event==="history.migration.phase"){
  if(!choice(value.phase,phases)||!choice(value.outcome,["ok","failed","cancelled"])||!choice(value.cancel_cause,["none","deadline","process","memory"]))return null;
  for(const field of ["elapsed_ms","rows","bytes","rpc_count","rpc_wait_ms","last_object_ordinal","last_movement_ordinal","rss_bytes","peak_rss_bytes"]){if(!number(value[field]))return null;result[field]=value[field];}
  result.phase=value.phase;result.outcome=value.outcome;result.cancel_cause=value.cancel_cause;
 }else if(value.event==="history.worker.transport"){
  if(!choice(value.lane,["import","migration"])||!choice(value.operation,operations)||!choice(value.outcome,["received","failed","cancelled"])||!choice(value.cancel_cause,["none","caller","attempt_deadline"])||typeof value.will_retry!=="boolean")return null;
  for(const field of ["attempt","elapsed_ms","encode_ms","wire_bytes","decoded_bytes","http_status"]){if(!number(value[field]))return null;result[field]=value[field];}
  for(const field of ["gateway_ms","db_round_trip_ms","sql_original_elapsed_ms","transport_outside_gateway_ms"]){if(value[field]!==null&&!number(value[field]))return null;result[field]=value[field];}
  result.lane=value.lane;result.operation=value.operation;result.outcome=value.outcome;result.will_retry=value.will_retry;result.cancel_cause=value.cancel_cause;
 }else if(value.event==="history.worker.claim_recovery"){
  if(value.lane!=="migration"||value.operation!=="claim"||!Number.isInteger(value.recovery)||!number(value.recovery)||Number(value.recovery)<1||Number(value.recovery)>3||value.maximum_recoveries!==3||value.backoff_ms!==[2000,5000,15000][Number(value.recovery)-1])return null;
  result.lane=value.lane;result.operation=value.operation;result.recovery=value.recovery;result.backoff_ms=value.backoff_ms;result.maximum_recoveries=3;
 }else if(value.event==="history_worker_exit"||value.event==="history_worker_stopped"){
  if(!choice(value.cause,["once","sigint","sigterm","unexpected"])||![0,1].includes(Number(value.exit_code))||typeof value.exit_code!=="number")return null;
  result.cause=value.cause;result.exit_code=value.exit_code;
  if(value.event==="history_worker_stopped")result.code=typeof value.code==="string"&&codes.has(value.code)?value.code:"history_worker_unexpected_stop";
 }else if(["idle","upload_verified","upload_rejected","job_review_ready","job_failed","migration_idle","migration_analysed","migration_failed"].includes(String(value.event))){
  if(value.code!==undefined)result.code=typeof value.code==="string"&&codes.has(value.code)?value.code:"history_worker_failed";
 }else return null;
 return result;
}

function demandPath(path:string){
 if(!isAbsolute(path)||resolve(path)!==path||path.startsWith("\\\\")||path.includes("\0"))throw Error("history_worker_diagnostics_unavailable");
 for(let current=path;;current=dirname(current)){if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error("history_worker_diagnostics_unavailable");if(dirname(current)===current)break;}
}

/** One process owns this bounded metadata ring under the existing status ACL. */
export function createWorkerDiagnosticSink(path?:string):(event:unknown)=>void{
 if(!path)return ()=>{};
 try{
  demandPath(path);demandPath(path+".tmp");if(!lstatSync(dirname(path)).isDirectory())throw Error();
  const lines:string[]=[];let size=0;
  if(existsSync(path)){
   const info=lstatSync(path);if(!info.isFile())throw Error();
   const count=Math.min(info.size,maximumBytes),bytes=Buffer.alloc(count),file=openSync(path,"r");
   try{readSync(file,bytes,0,count,info.size-count);}finally{closeSync(file);}
   // A truncated first/last record is ignored; existing arbitrary file content
   // cannot enter the new log through the rotation path.
   for(const line of bytes.toString("utf8").split("\n")){try{const prior=JSON.parse(line),safe=redactedWorkerEvent(prior);if(safe&&typeof prior.utc==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(prior.utc)){const kept=JSON.stringify({...safe,utc:prior.utc})+"\n";lines.push(kept);size+=Buffer.byteLength(kept);}}catch{/* Invalid/partial historical records are not copied. */}}
  }
  return event=>{
   const safe=redactedWorkerEvent(event);if(!safe)return;
   const line=JSON.stringify({...safe,utc:new Date().toISOString()})+"\n";lines.push(line);size+=Buffer.byteLength(line);
   while(size>maximumBytes&&lines.length>1)size-=Buffer.byteLength(lines.shift()!);
   try{demandPath(path);demandPath(path+".tmp");writeFileSync(path+".tmp",lines.join(""),{encoding:"utf8",mode:0o600});renameSync(path+".tmp",path);}
   catch{throw Error("history_worker_diagnostics_unavailable");}
  };
 }catch{throw Error("history_worker_diagnostics_unavailable");}
}
