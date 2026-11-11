import "server-only";
import type {Json} from "@/lib/supabase/database.types";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {loadPosRuntimeLease} from "@/server/pos-auth/runtime-boundary";
import {verifyPosSecret} from "@/server/pos-auth/tokens";
import {demandUuid} from "./ledger-contract";
import {closedHistoryObject,historyObject} from "./replica-contract";
import {COMPOSED_DEVICE_OPERATIONS,isComposedHistoryV2,validateComposedDeviceRequest,projectComposedDeviceResult} from "./device-composed-contract";
import {baselineSourceExists} from "./baseline-upload-target";
import {URL} from "node:url";
export class PosHistoryError extends Error{constructor(readonly code:string,readonly status:number){super(code);}}
export async function deviceHistoryRequest(value:unknown,sourceUploadUrl?:string){
 const input=closedHistoryObject(value,["deviceId","sessionId","deviceToken","sessionToken","operation","payload"]);
 demandUuid(String(input.deviceId));demandUuid(String(input.sessionId));
 if(typeof input.operation!=="string"||!COMPOSED_DEVICE_OPERATIONS.includes(input.operation)||[input.deviceToken,input.sessionToken].some(v=>typeof v!=="string"||v.length<20||v.length>256))throw new PosHistoryError("history_input_invalid",400);
 const op=input.operation;
 const db=createSupabaseAdminClient();if(!db)throw new PosHistoryError("history_cloud_unavailable",503);
 const authenticatedLease=async()=>{
  const current=await loadPosRuntimeLease(db,{posSessionId:String(input.sessionId),shopDeviceId:String(input.deviceId)});
  if(current.status==="db_failure")throw new PosHistoryError("history_cloud_unavailable",503);
  if(current.status!=="ok"||!verifyPosSecret(String(input.deviceToken),current.credential.token_hash)||!verifyPosSecret(String(input.sessionToken),current.session.session_token_hash))throw new PosHistoryError("auth_denied",403);
  return current;
 };
 const lease=await authenticatedLease();
 const scope={shopId:lease.shop.shop_id,deviceId:lease.device.shop_device_id,staffId:lease.staff.staff_id,sessionId:lease.session.pos_session_id,credentialVersion:lease.session.staff_credential_version};
 let payload:Record<string,unknown>;
 try{payload=validateComposedDeviceRequest(op,input.payload,scope);}catch{throw new PosHistoryError("history_input_invalid",400);}
 const {data,error}=await db.rpc(isComposedHistoryV2(op)?"payment_history_device_v2":"payment_history_device_v1",{p_shop_id:scope.shopId,p_shop_device_id:scope.deviceId,p_staff_id:scope.staffId,p_pos_session_id:scope.sessionId,p_device_token_hash:lease.credential.token_hash,p_session_token_hash:lease.session.session_token_hash,p_credential_version:scope.credentialVersion,p_operation:op,p_payload:payload as Json});
 if(error){
  // SQL rechecks the lease. A revoked session racing the initial lookup must
  // stop shared authentication, while a history-only denial stays scoped.
  if(error.code==="42501"){
   await authenticatedLease();
   if(op.startsWith("baseline_")&&error.message==="payment_history_job_actor_mismatch")throw new PosHistoryError("history_baseline_session_changed",409);
   throw new PosHistoryError("history_cloud_access_denied",403);
  }
  if(op==="baseline_apply"&&error.code==="40001"&&error.message==="payment_history_review_stale_or_blocked")throw new PosHistoryError("history_baseline_review_stale",409);
  throw new PosHistoryError(error.code==="40001"&&["snapshot_start","delta_start","page","replica_ack"].includes(op)?"history_resnapshot_required":error.code==="40001"?"history_cloud_writer_closed":"history_cloud_unavailable",error.code==="40001"?409:503);
 }
 if(!historyObject(data)||Object.keys(data).length!==5||data.ok!==true||data.shop_id!==lease.shop.shop_id||data.device_id!==lease.device.shop_device_id||data.session_id!==lease.session.pos_session_id||Buffer.byteLength(JSON.stringify(data))>4194304)throw new PosHistoryError("history_response_invalid",503);
 let result:Record<string,unknown>;try{
  result=projectComposedDeviceResult(op,data.result,payload,scope);
  if(op==="baseline_upload_create"){
   if(!sourceUploadUrl)throw Error("history_cloud_unavailable");const target=new URL(sourceUploadUrl);
   if(target.username||target.password||target.search||target.hash||target.pathname!=="/api/pos/payment-history/source"||
    !(target.protocol==="https:"||target.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(target.hostname)))throw Error("history_upload_target_invalid");
   const exists=await baselineSourceExists(result,scope,db.storage.from("payment-history-sources"));
   result={...result,upload_required:!exists,signed_url:exists?null:target.href};
  }
 }catch{throw new PosHistoryError("history_response_invalid",503);}
 return {ok:true,shop_id:data.shop_id,device_id:data.device_id,session_id:data.session_id,result};
}
