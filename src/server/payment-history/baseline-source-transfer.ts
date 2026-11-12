import {createHash} from "node:crypto";
import {demandUuid} from "./ledger-contract";
import {historyObject} from "./replica-contract";
import {baselineUploadTarget,type BaselineSourceStorage} from "./baseline-upload-target";
import type {HistorySourcePhase} from "./baseline-source-diagnostic";

export class HistorySourceError extends Error{constructor(readonly code:string,readonly status:number){super(code);}}
type Reply={ok:boolean;shop_id:string;device_id:string;session_id:string;result:Record<string,unknown>};
export type HistorySourcePort={
 request(value:unknown):Promise<Reply>;storage:BaselineSourceStorage;storageOrigin:string;
 put(url:string,bytes:Uint8Array,signal:AbortSignal):Promise<{ok:boolean;status:number}>;
 observePhase?:(phase:HistorySourcePhase)=>void;
};
const fail=(code="history_baseline_upload_invalid",status=400):never=>{throw new HistorySourceError(code,status);};
// The client sends only to its configured Admin origin. Only this server-side
// port receives the bounded, owned Storage target; it is never sent to POS.
export async function transferHistorySource(request:Request,port:HistorySourcePort){
 const phase=(value:HistorySourcePhase)=>{try{port.observePhase?.(value);}catch{/* Observability has no authority over the transfer. */}};
 phase("validation");
 if(request.headers.get("content-type")!=="application/zip"||!request.body)return fail();
 const length=request.headers.get("content-length");if(!length||!(/^[1-9][0-9]{0,7}$/).test(length)||BigInt(length)>BigInt(20971520))return fail();
 const upload=request.headers.get("x-history-upload-id");if(!upload)return fail();demandUuid(upload);
 const input={deviceId:request.headers.get("x-history-device-id"),sessionId:request.headers.get("x-history-session-id"),
  deviceToken:request.headers.get("x-history-device-token"),sessionToken:request.headers.get("x-history-session-token"),operation:"baseline_upload_status",payload:{upload_id:upload}};
 phase("authorize_source");const first=await port.request(input),meta=first.result;
 if(meta.upload_id!==upload||meta.byte_length!==length||typeof meta.sha256!=="string"||
  !["pending","uploaded","verifying","verified"].includes(String(meta.state)))return fail("history_baseline_source_unavailable",409);
 phase("read_source");const signal=AbortSignal.any([request.signal,AbortSignal.timeout(15000)]),reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",abort,{once:true});
 try{
  while(true){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>Number(length))return fail();parts.push(next.value);}
 }finally{signal.removeEventListener("abort",abort);await reader.cancel();reader.releaseLock();}
 signal.throwIfAborted();const bytes=Buffer.concat(parts,size);
 phase("hash_source");if(size!==Number(length)||createHash("sha256").update(bytes).digest("hex")!==meta.sha256)return fail("history_baseline_source_changed",400);
 // Recheck the actual lease and immutable metadata after reading the body.
 phase("reauthorize_source");const fresh=await port.request(input);
 if(!fresh.ok||fresh.shop_id!==first.shop_id||fresh.device_id!==first.device_id||fresh.session_id!==first.session_id||
  !historyObject(fresh.result)||fresh.result.upload_id!==upload||fresh.result.sha256!==meta.sha256||fresh.result.byte_length!==length||
  !["pending","uploaded","verifying","verified"].includes(String(fresh.result.state)))return fail("history_baseline_source_changed",409);
 const owned={upload_id:upload,object_key:`history/${first.shop_id}/${upload}`};
 phase("prepare_storage_target");const target=await baselineUploadTarget(owned,{shopId:first.shop_id,deviceId:first.device_id},port.storage,port.storageOrigin);
 if(target.upload_required===false)return {status:409,body:{ok:true,upload_id:upload,already_present:true}};
 signal.throwIfAborted();phase("put_storage_source");const response=await port.put(String(target.signed_url),bytes,signal);
 if(!response.ok)return fail("history_baseline_upload_failed",503);
 return {status:200,body:{ok:true,upload_id:upload,already_present:false}};
}
