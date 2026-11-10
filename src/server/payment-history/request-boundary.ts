import "server-only";
import type {Json} from "@/lib/supabase/database.types";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {resolveShopAdminDataAccess,type ShopAdminDataAccess} from "@/server/shop-admin/data-access";
import {demandUuid} from "./ledger-contract";
import {validateHistoryResult} from "./wire-contract";

export const HISTORY_OPERATIONS=["capabilities","read","export","metadata","upload_create","upload_ready","upload_status","start","status","configure","review","commit","cancel_job","resume_job","cancel_batch","receipt","evidence","merchant","permissions"] as const;
export type HistoryOperation=typeof HISTORY_OPERATIONS[number];
type Ready=Extract<ShopAdminDataAccess,{status:"ready"}>;
export class HistoryRequestError extends Error {constructor(readonly code:string,readonly status:number){super(code);}}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value);}
export async function demandHistoryAccess(shopId:string){
 demandUuid(shopId);
 const access=await resolveShopAdminDataAccess({requestedShopId:shopId,strictRequestedShop:true});
 if(access.status!=="ready"||access.selectedShop.shopId!==shopId||access.principalKind==="pos_staff_manager"&&access.principal.roleKey==="courier")throw new HistoryRequestError("history_access_denied",403);
 return access;
}
// The service client is contained here. No table adapter or arbitrary RPC name
// can be selected by the browser. SQL acquires the actual historical capability.
export async function historyRequest(access:Ready,operation:HistoryOperation,payload:Json={}){
 if(!HISTORY_OPERATIONS.includes(operation))throw new HistoryRequestError("history_operation_invalid",400);
 const staff=access.principalKind==="pos_staff_manager"?access.principal:null;
 const session=staff?.staffWebSession;
 if(staff&&!session)throw new HistoryRequestError("history_session_expired",403);
 const db=access.principalKind==="personal_account"?access.supabase:createSupabaseAdminClient();
 if(!db)throw new HistoryRequestError("history_unavailable",503);
 const {data,error}=await db.rpc("payment_history_request_v1",{p_shop_id:access.selectedShop.shopId,p_operation:operation,p_payload:payload,
  ...(staff&&session?{p_staff_id:staff.staff.staffId,p_staff_web_session_id:session.sessionId,p_session_token_hash:session.sessionTokenHash,p_credential_version:session.credentialVersion}:{})});
 if(error){
  const code=error.code==="42501"?"history_access_denied":error.code==="23505"?"history_idempotency_conflict":error.code==="40001"?"history_review_changed":error.code==="PGRST202"||error.code==="42883"?"history_unavailable":error.code==="54000"?"history_capacity":error.code==="55000"||error.code?.startsWith("22")?"history_input_invalid":"history_unavailable";
  throw new HistoryRequestError(code,code==="history_access_denied"?403:code==="history_unavailable"?503:409);
 }
 const actorId=access.principalKind==="personal_account"?access.principal.userId:access.principal.staff.staffId;
 if(!record(data)||Object.keys(data).some(k=>!["ok","shop_id","actor","result"].includes(k))||data.ok!==true||data.shop_id!==access.selectedShop.shopId||
  !record(data.actor)||Object.keys(data.actor).some(key=>!["kind","id","session_id","credential_version"].includes(key))||data.actor.id!==actorId||data.actor.kind!==access.principalKind||typeof data.actor.session_id!=="string"||
  staff&&session&&(data.actor.session_id!==session.sessionId||data.actor.credential_version!==session.credentialVersion)||!record(data.result)||JSON.stringify(data).length>4194304){
  throw new HistoryRequestError("history_response_invalid",503);
 }
 // Acquire a second, fresh SQL lease immediately before publishing the DTO.
 // This avoids substituting a generic catalog permission for a financial grant.
 if(operation!=="capabilities"){
  const fresh=await historyRequest(access,"capabilities");
  const required=["commit","review","configure","start","upload_create","upload_ready","cancel_job","resume_job","evidence","merchant"].includes(operation)?"import":operation==="cancel_batch"?"cancel":operation==="export"?"export":operation==="permissions"?"migrate":"read";
  if(!record(fresh.capabilities)||fresh.capabilities[required]!==true)throw new HistoryRequestError("history_access_denied",403);
 }
 try{return validateHistoryResult(operation,data.result);}catch{throw new HistoryRequestError("history_response_invalid",503);}
}
export async function historyUploadUrl(access:Ready,result:Record<string,unknown>){
 const id=typeof result.upload_id==="string"?demandUuid(result.upload_id):null;
 const path=id?`history/${access.selectedShop.shopId}/${id}`:null;
 if(!path||result.object_key!==path)throw new HistoryRequestError("history_response_invalid",503);
 const db=createSupabaseAdminClient();if(!db)throw new HistoryRequestError("history_unavailable",503);
 const {data,error}=await db.storage.from("payment-history-sources").createSignedUploadUrl(path,{upsert:false});
 if(error||!data)throw new HistoryRequestError("history_unavailable",503);
 return {upload_id:id,signed_url:data.signedUrl};
}
