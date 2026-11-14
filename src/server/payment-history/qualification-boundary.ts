import "server-only";
import type {Json} from "@/lib/supabase/database.types";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {HistoryRequestError,type HistoryAccess} from "./request-boundary";
import {closedHistoryObject as closed} from "./replica-contract";
import {demandUuid} from "./ledger-contract";
import {validateTechnicalAccess,validateQualificationRequest,validateQualificationResult} from "./qualified-config-contract";

export async function technicalHistoryRequest(access:HistoryAccess,operation:"access"|"read"|"qualify"|"revoke",payload:Json={}){
 let input:Record<string,unknown>;try{input=operation==="access"?closed(payload,[]):validateQualificationRequest(operation,payload);}catch{throw new HistoryRequestError("history_input_invalid",400);}
 const staff=access.principalKind==="pos_staff_manager"?access.principal:null,session=staff?.staffWebSession;
 if(staff&&!session)throw new HistoryRequestError("history_session_expired",403);
 const db=access.principalKind==="personal_account"?access.supabase:createSupabaseAdminClient();if(!db)throw new HistoryRequestError("history_unavailable",503);
 const scope={p_shop_id:access.selectedShop.shopId,...(staff&&session?{p_staff_id:staff.staff.staffId,p_staff_web_session_id:session.sessionId,p_session_token_hash:session.sessionTokenHash,p_credential_version:session.credentialVersion}:{})};
 const {data,error}=operation==="access"?await db.rpc("payment_history_technical_access_v1",scope):await db.rpc("payment_history_qualification_request_v1",{...scope,p_operation:operation,p_payload:input as Json});
 if(error)throw new HistoryRequestError(error.code==="42501"?"history_access_denied":error.code==="23505"?"history_idempotency_conflict":error.code==="54000"?"history_capacity":error.code?.startsWith("22")?"history_input_invalid":"history_unavailable",error.code==="42501"?403:409);
 let result:Record<string,unknown>;
 try{
  const envelope=closed(data,["ok","shop_id","actor","result"]),actor=closed(envelope.actor,["kind","id","session_id","credential_version"]);
  const id=staff?staff.staff.staffId:access.principalKind==="personal_account"?access.principal.userId:null;
  if(envelope.ok!==true||envelope.shop_id!==scope.p_shop_id||actor.kind!==access.principalKind||actor.id!==id||typeof actor.session_id!=="string"||access.principalKind==="personal_account"&&actor.credential_version!==null||session&&(actor.session_id!==session.sessionId||actor.credential_version!==session.credentialVersion))throw Error();demandUuid(actor.session_id);
  result=operation==="access"?validateTechnicalAccess(envelope.result):validateQualificationResult(operation,envelope.result,scope.p_shop_id);
 }catch{throw new HistoryRequestError("history_response_invalid",503);}
 if(operation!=="access")await technicalHistoryRequest(access,"access");
 return result;
}
