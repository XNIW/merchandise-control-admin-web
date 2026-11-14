import {randomUUID} from "node:crypto";
import {gzipSync} from "node:zlib";
import {setTimeout as delay} from "node:timers/promises";
import {workerRequestSignature} from "../../src/server/payment-history/worker-signature";
// Only the pure signature helper is shared. The database gateway and its
// privileged Supabase dependency never enter the dedicated worker bundle.
export type WorkerTransportDiagnostic={event:"history.worker.transport";lane:"import"|"migration";operation:string;attempt:number;outcome:"received"|"failed"|"cancelled";will_retry:boolean;cancel_cause:"none"|"caller"|"attempt_deadline";elapsed_ms:number;encode_ms:number;wire_bytes:number;decoded_bytes:number;http_status:number;gateway_ms:number|null;db_round_trip_ms:number|null;sql_original_elapsed_ms:number|null;transport_outside_gateway_ms:number|null};
export type WorkerClaimRecoveryDiagnostic={event:"history.worker.claim_recovery";lane:"migration";operation:"claim";recovery:number;backoff_ms:number;maximum_recoveries:3};
export function createWorkerGatewayPort(endpoint:string,secret:string,allowLoopback=false,diagnostic?:(event:WorkerTransportDiagnostic|WorkerClaimRecoveryDiagnostic)=>void,recoverMigrationClaims=false){
 const url=new URL(endpoint);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/api/internal/payment-history/worker"||url.protocol!=="https:"&&!(allowLoopback&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname))||Buffer.byteLength(secret)<32)throw Error("history_worker_configuration_missing");
 const sources=new Map<string,string>();
 return {
  memoryBytes:()=>process.memoryUsage().rss,
  async call(lane:"import"|"migration",operation:string,payload:Record<string,unknown>,signal?:AbortSignal){
   signal?.throwIfAborted();
   const encodeStarted=Date.now();
   const raw=Buffer.from(JSON.stringify({lane,operation,payload}));if(raw.length>8388608)throw Error("history_worker_payload_limit");
   const compressed=raw.length>=1024?gzipSync(raw):raw;
   const bytes=compressed.length<raw.length?compressed:raw;
   const encodeMs=Math.max(0,Date.now()-encodeStarted);
   const nonce=randomUUID();
   // One retry of the same immutable request after a transport failure. The
   // gateway's database cache prevents a second claim or duplicate staging.
   let reply:{data?:Record<string,unknown>;downloads?:unknown;metrics?:Record<string,unknown>}|undefined,recoveries=0,totalAttempts=0;
   for(let attempt=0;attempt<2;attempt++){
    const timestamp=String(Date.now()),deadline=AbortSignal.timeout(15000),requestSignal=signal?AbortSignal.any([signal,deadline]):deadline;
    const started=Date.now();let httpStatus=0;totalAttempts++;
    const milliseconds=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?Math.round(value*1000)/1000:null;
    function audit(outcome:WorkerTransportDiagnostic["outcome"],willRetry=false){
     try{
      const gatewayMs=milliseconds(reply?.metrics?.gateway_ms),elapsed=Math.max(0,Date.now()-started);
      diagnostic?.({event:"history.worker.transport",lane,operation:["claim_upload","verify_upload","reject_upload","claim","heartbeat","stage","stage_objects","stage_movements","stage_vector_v2","finish","fail"].includes(operation)?operation:"unknown",attempt:totalAttempts,outcome,will_retry:willRetry,cancel_cause:signal?.aborted?"caller":deadline.aborted?"attempt_deadline":"none",elapsed_ms:elapsed,encode_ms:encodeMs,wire_bytes:bytes.length,decoded_bytes:raw.length,http_status:httpStatus,gateway_ms:gatewayMs,db_round_trip_ms:milliseconds(reply?.metrics?.db_round_trip_ms),sql_original_elapsed_ms:milliseconds(reply?.data?.sql_elapsed_ms),transport_outside_gateway_ms:gatewayMs===null?null:Math.max(0,elapsed-gatewayMs)});
     }catch{/* Diagnostic sinks must not change transport or leak raw errors. */}
    }
    try{
     const response=await fetch(url,{method:"POST",redirect:"error",signal:requestSignal,headers:{"content-type":"application/json",...(bytes===raw?{}:{"content-encoding":"gzip"}),"x-history-time":timestamp,"x-history-nonce":nonce,"x-history-signature":workerRequestSignature(secret,timestamp,nonce,bytes)},body:bytes});
     httpStatus=response.status;
     if(!response.ok){await response.body?.cancel();throw Error("history_worker_rpc_rejected");}
     if(!response.body)throw Error("history_worker_response_invalid");
     const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
     try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8388608)throw Error("history_worker_response_limit");parts.push(r.value);}}finally{await reader.cancel();reader.releaseLock();}
     try{reply=JSON.parse(Buffer.concat(parts,size).toString("utf8"));}catch{throw Error("history_worker_response_invalid");}audit("received");break;
    }
    catch(error){
     const terminal=error instanceof Error&&["history_worker_rpc_rejected","history_worker_response_invalid","history_worker_response_limit"].includes(error.message);
     const recover=recoverMigrationClaims&&lane==="migration"&&operation==="claim"&&!!signal&&!signal.aborted&&!terminal&&recoveries<3;
     audit(requestSignal.aborted?"cancelled":"failed",!signal?.aborted&&!terminal&&(attempt===0||recover));signal?.throwIfAborted();if(terminal)throw error;
     if(attempt===1){
      if(!recover)throw Error("history_worker_gateway_unavailable");
      const backoff=[2000,5000,15000][recoveries++];
      try{diagnostic?.({event:"history.worker.claim_recovery",lane:"migration",operation:"claim",recovery:recoveries,backoff_ms:backoff,maximum_recoveries:3});}catch{/* Closed metadata sink only. */}
      try{await delay(backoff,undefined,{signal});}catch(error){signal?.throwIfAborted();throw error;}signal?.throwIfAborted();attempt=-1;
     }
    }
   }
if(!reply||reply.data?.ok!==true||!Array.isArray(reply.downloads)||reply.downloads.length>10)throw Error("history_worker_response_invalid");
   for(const source of reply.downloads){if(typeof source.object_key!=="string"||!/^history\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(source.object_key)||typeof source.signed_url!=="string")throw Error("history_worker_response_invalid");const download=new URL(source.signed_url);if(download.protocol!=="https:"&&!(allowLoopback&&download.protocol==="http:"&&["localhost","127.0.0.1"].includes(download.hostname)))throw Error("history_worker_response_invalid");sources.set(source.object_key,source.signed_url);}
   return reply.data as Record<string,unknown>;
  },
  async download(path:string,limit:number,signal:AbortSignal){
   const signed=sources.get(path);if(!signed)throw Error("history_source_not_ready");sources.delete(path);
   const response=await fetch(signed,{signal,redirect:"error"});if(!response.ok||!response.body)throw Error("history_source_not_ready");
   const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
   try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit)throw Error("history_source_limit");parts.push(r.value);}}finally{await reader.cancel();reader.releaseLock();}
   return Buffer.concat(parts,size);
  }
 };
}
