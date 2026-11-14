import "server-only";
import {timingSafeEqual} from "node:crypto";
import type {Json} from "@/lib/supabase/database.types";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {demandUuid} from "./ledger-contract";
import {workerRequestSignature} from "./worker-signature";

const operations={import:["claim_upload","verify_upload","reject_upload","claim","heartbeat","stage","finish","fail"],migration:["claim","heartbeat","stage_objects","stage_movements","stage_vector_v2","finish","fail"]};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export class WorkerGatewayError extends Error{constructor(readonly status:number){super("history_worker_request_rejected");}}
async function requestBytes(stream:ReadableStream<Uint8Array>){
 const reader=stream.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8388608)throw new WorkerGatewayError(413);parts.push(r.value);}}
 finally{try{await reader.cancel();}catch{/* Retain the first read/limit failure. */}reader.releaseLock();}
 return Buffer.concat(parts,size);
}
export async function handleWorkerGateway(request:Request){
 const started=Date.now();
 const secret=process.env.PAYMENT_HISTORY_WORKER_GATEWAY_SECRET;
 if(!secret||Buffer.byteLength(secret)<32)throw new WorkerGatewayError(503);
 const time=request.headers.get("x-history-time")??"",nonce=request.headers.get("x-history-nonce")??"",signature=request.headers.get("x-history-signature")??"";
 if(!/^\d{13}$/.test(time)||Math.abs(Date.now()-Number(time))>60000||!/^[0-9a-f]{64}$/.test(signature)||!request.body||!request.headers.get("content-type")?.startsWith("application/json"))throw new WorkerGatewayError(403);
 try{demandUuid(nonce);}catch{throw new WorkerGatewayError(403);}
 const bytes=await requestBytes(request.body),expected=workerRequestSignature(secret,time,nonce,bytes);
 if(!timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex")))throw new WorkerGatewayError(403);
 // Authenticate the exact wire bytes before spending work on decompression.
 const encoding=(request.headers.get("content-encoding")??"identity").trim().toLowerCase();let decoded=bytes;
 if(encoding==="gzip"){
  try{decoded=await requestBytes(new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip")));}
  catch(error){if(error instanceof WorkerGatewayError)throw error;throw new WorkerGatewayError(400);}
 }else if(encoding!=="identity")throw new WorkerGatewayError(415);
 let input:unknown;try{input=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(decoded));}catch{throw new WorkerGatewayError(400);}
 if(!record(input)||Object.keys(input).length!==3||!Object.keys(input).every(k=>["lane","operation","payload"].includes(k))||!record(input.payload)||typeof input.lane!=="string"||!Object.hasOwn(operations,input.lane)||typeof input.operation!=="string"||!operations[input.lane as keyof typeof operations].includes(input.operation))throw new WorkerGatewayError(400);
 const db=createSupabaseAdminClient();if(!db)throw new WorkerGatewayError(503);
 const dbStarted=Date.now();
 const {data,error}=await db.rpc("payment_history_worker_gateway_v1",{p_request_id:nonce,p_lane:input.lane,p_operation:input.operation,p_payload:input.payload as Json});
 const dbRoundTripMs=Math.max(0,Date.now()-dbStarted);
 if(error||!record(data)||data.ok!==true)throw new WorkerGatewayError(error?.code==="42501"?403:409);
 const downloads:{object_key:string;signed_url:string}[]=[];
 // Only a source returned by a database claim can receive a download URL.
 // There is no arbitrary-path signing operation in the worker protocol.
 const claim=input.operation==="claim_upload"&&record(data.upload)?{shop:data.upload.shop_id,uploads:[data.upload]}:
  input.operation==="claim"&&input.lane==="import"&&record(data.job)?{shop:data.job.shop_id,uploads:data.job.uploads}:
  input.operation==="claim"&&input.lane==="migration"&&record(data.run)?{shop:data.run.shop_id,uploads:[data.run.upload]}:null;
 if(claim){
  try{demandUuid(String(claim.shop));}catch{throw new WorkerGatewayError(503);}
  if(!Array.isArray(claim.uploads)||claim.uploads.length>10)throw new WorkerGatewayError(503);
  for(const upload of claim.uploads){
   if(!record(upload))throw new WorkerGatewayError(503);
   try{demandUuid(String(upload.upload_id));}catch{throw new WorkerGatewayError(503);}
   const path=`history/${claim.shop}/${upload.upload_id}`;if(upload.object_key!==path)throw new WorkerGatewayError(503);
   const signed=await db.storage.from("payment-history-sources").createSignedUrl(path,120);
   if(signed.error||!signed.data)throw new WorkerGatewayError(503);
   downloads.push({object_key:path,signed_url:signed.data.signedUrl});
  }
 }
 return {data,downloads,metrics:{gateway_ms:Math.max(0,Date.now()-started),db_round_trip_ms:dbRoundTripMs}};
}
