import {randomUUID} from "node:crypto";
import {workerRequestSignature} from "../../src/server/payment-history/worker-signature";
// Only the pure signature helper is shared. The database gateway and its
// privileged Supabase dependency never enter the dedicated worker bundle.
export function createWorkerGatewayPort(endpoint:string,secret:string,allowLoopback=false){
 const url=new URL(endpoint);
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/api/internal/payment-history/worker"||url.protocol!=="https:"&&!(allowLoopback&&url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname))||Buffer.byteLength(secret)<32)throw Error("history_worker_configuration_missing");
 const sources=new Map<string,string>();
 return {
  memoryBytes:()=>process.memoryUsage().rss,
  async call(lane:"import"|"migration",operation:string,payload:Record<string,unknown>,signal?:AbortSignal){
   const bytes=Buffer.from(JSON.stringify({lane,operation,payload}));if(bytes.length>8388608)throw Error("history_worker_payload_limit");
   const nonce=randomUUID();
   // One retry of the same immutable request after a transport failure. The
   // gateway's database cache prevents a second claim or duplicate staging.
   let reply;
   for(let attempt=0;attempt<2;attempt++){
    const timestamp=String(Date.now()),deadline=AbortSignal.timeout(15000),requestSignal=signal?AbortSignal.any([signal,deadline]):deadline;
    try{
     const response=await fetch(url,{method:"POST",redirect:"error",signal:requestSignal,headers:{"content-type":"application/json","x-history-time":timestamp,"x-history-nonce":nonce,"x-history-signature":workerRequestSignature(secret,timestamp,nonce,bytes)},body:bytes});
     if(!response.ok){await response.body?.cancel();throw Error("history_worker_rpc_rejected");}
     if(!response.body)throw Error("history_worker_response_invalid");
     const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
     try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8388608)throw Error("history_worker_response_limit");parts.push(r.value);}}finally{await reader.cancel();reader.releaseLock();}
     reply=JSON.parse(Buffer.concat(parts,size).toString("utf8"));break;
    }
    catch(error){signal?.throwIfAborted();if(error instanceof Error&&["history_worker_rpc_rejected","history_worker_response_invalid","history_worker_response_limit"].includes(error.message))throw error;if(attempt===1)throw Error("history_worker_gateway_unavailable");}
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
