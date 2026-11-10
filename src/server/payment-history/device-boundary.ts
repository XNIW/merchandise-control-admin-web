import "server-only";
import type {Json} from "@/lib/supabase/database.types";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {loadPosRuntimeLease} from "@/server/pos-auth/runtime-boundary";
import {verifyPosSecret} from "@/server/pos-auth/tokens";
import {demandUuid} from "./ledger-contract";
import {closedHistoryObject,DEVICE_HISTORY_OPERATIONS,type DeviceHistoryOperation,historyObject,validateDeviceHistoryRequest,validateDeviceHistoryResult} from "./replica-contract";
export class PosHistoryError extends Error{constructor(readonly code:string,readonly status:number){super(code);}}
export async function deviceHistoryRequest(value:unknown){
 const input=closedHistoryObject(value,["deviceId","sessionId","deviceToken","sessionToken","operation","payload"]);
 demandUuid(String(input.deviceId));demandUuid(String(input.sessionId));
 if(typeof input.operation!=="string"||!DEVICE_HISTORY_OPERATIONS.includes(input.operation as DeviceHistoryOperation)||[input.deviceToken,input.sessionToken].some(v=>typeof v!=="string"||v.length<20||v.length>256))throw new PosHistoryError("history_input_invalid",400);
 const op=input.operation as DeviceHistoryOperation,payload=validateDeviceHistoryRequest(op,input.payload);
 const db=createSupabaseAdminClient();if(!db)throw new PosHistoryError("history_cloud_unavailable",503);
 const authenticatedLease=async()=>{
  const current=await loadPosRuntimeLease(db,{posSessionId:String(input.sessionId),shopDeviceId:String(input.deviceId)});
  if(current.status==="db_failure")throw new PosHistoryError("history_cloud_unavailable",503);
  if(current.status!=="ok"||!verifyPosSecret(String(input.deviceToken),current.credential.token_hash)||!verifyPosSecret(String(input.sessionToken),current.session.session_token_hash))throw new PosHistoryError("auth_denied",403);
  return current;
 };
 const lease=await authenticatedLease();
 const {data,error}=await db.rpc("payment_history_device_v1",{p_shop_id:lease.shop.shop_id,p_shop_device_id:lease.device.shop_device_id,p_staff_id:lease.staff.staff_id,p_pos_session_id:lease.session.pos_session_id,p_device_token_hash:lease.credential.token_hash,p_session_token_hash:lease.session.session_token_hash,p_credential_version:lease.session.staff_credential_version,p_operation:op,p_payload:payload as Json});
 if(error){
  // SQL rechecks the lease. A revoked session racing the initial lookup must
  // stop shared authentication, while a history-only denial stays scoped.
  if(error.code==="42501"){
   await authenticatedLease();
   throw new PosHistoryError("history_cloud_access_denied",403);
  }
  throw new PosHistoryError(error.code==="40001"&&["snapshot_start","delta_start","page","replica_ack"].includes(op)?"history_resnapshot_required":error.code==="40001"?"history_cloud_writer_closed":"history_cloud_unavailable",error.code==="40001"?409:503);
 }
 if(!historyObject(data)||Object.keys(data).length!==5||data.ok!==true||data.shop_id!==lease.shop.shop_id||data.device_id!==lease.device.shop_device_id||data.session_id!==lease.session.pos_session_id||Buffer.byteLength(JSON.stringify(data))>4194304)throw new PosHistoryError("history_response_invalid",503);
 let result:Record<string,unknown>;try{result=validateDeviceHistoryResult(op,data.result,lease.shop.shop_id);}catch{throw new PosHistoryError("history_response_invalid",503);}
 return {ok:true,shop_id:data.shop_id,device_id:data.device_id,session_id:data.session_id,result};
}
