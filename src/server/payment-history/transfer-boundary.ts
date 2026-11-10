import "server-only";
import type {Json} from "@/lib/supabase/database.types";
import {createSupabaseAdminClient} from "@/lib/supabase/admin";
import {demandHistoryAccess,historyRequest,HistoryRequestError} from "./request-boundary";
import {closedHistoryObject as closed,historyObject as record} from "./replica-contract";
import {demandDigest,demandUuid} from "./ledger-contract";
import {validateHistoryResult} from "./wire-contract";
export const TRANSFER_OPERATIONS={migration:["upload_create","upload_ready","upload_status","start","status","resume","cancel","mapping","review","apply","receipt"],cutover:["status","devices","inventory","freeze","activate_web","freeze_web"]} as const;
export type TransferLane=keyof typeof TRANSFER_OPERATIONS;
type Access=Awaited<ReturnType<typeof demandHistoryAccess>>;
const text=(v:unknown,max=2048,nullable=false)=>{if(nullable&&v===null)return;if(typeof v!=="string"||v.length>max)throw Error("history_response_invalid");};
const integer=(v:unknown)=>{if(typeof v!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(v)||BigInt(v)<BigInt("-9223372036854775808")||BigInt(v)>BigInt("9223372036854775807"))throw Error("history_response_invalid");};
const count=(v:unknown,max=400000)=>{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0||v>max)throw Error("history_response_invalid");};
const array=(v:unknown,max=10000)=>{if(!Array.isArray(v)||v.length>max)throw Error("history_response_invalid");return v;};
function sourceSummary(v:unknown){const s=closed(v,["movements","active","batches","originalOperations","activeGrossClp","knownActiveNetClp","knownActiveNetCount"]);for(const [k,v] of Object.entries(s)){if(k.endsWith("Clp"))integer(v);else count(v);}}
function migrationReceipt(v:unknown){
 const r=closed(v,["operation_id","kind","source_run_id","source_snapshot_id","dataset_id","revision","writer_epoch","new_active","new_inactive","duplicates","new_batches","original_evidence_level"]);
 for(const k of ["operation_id","source_run_id","source_snapshot_id","dataset_id"])demandUuid(String(r[k]));integer(r.revision);integer(r.writer_epoch);for(const k of ["new_active","new_inactive","duplicates","new_batches"])count(r[k]);
 if(r.kind!=="migrate"||r.original_evidence_level!=="legacy_attested")throw Error("history_response_invalid");return r;
}
function manifest(v:unknown){
 const m=closed(v,["schemaVersion","shopId","deviceId","localDatasetId","dataRevision","restoreEpoch","createdAtUtc","backupSha256","backupByteLength","evidenceLevel","entries"]);
 if(m.schemaVersion!=="history-local-export-v1"||m.evidenceLevel!=="legacy_attested")throw Error("history_response_invalid");demandUuid(String(m.shopId));demandUuid(String(m.deviceId));text(m.localDatasetId,256);integer(m.dataRevision);integer(m.restoreEpoch);integer(m.backupByteLength);text(m.createdAtUtc,40);demandDigest(String(m.backupSha256));
 for(const e of array(m.entries,7)){const p=closed(e,["name","rows","byteLength","sha256"]);text(p.name,40);integer(p.rows);integer(p.byteLength);demandDigest(String(p.sha256));}
}
export function validateTransferResult(lane:TransferLane,op:string,v:unknown,shop:string){
 if(lane==="migration"&&["upload_create","upload_ready","upload_status"].includes(op))return validateHistoryResult(op,v);
 let r:Record<string,unknown>;
 if(lane==="migration"){
  if(["start","resume","cancel"].includes(op)){r=closed(v,["run_id","state"]);demandUuid(String(r.run_id));text(r.state,30);}
  else if(op==="mapping"){r=closed(v,["merchant_id","evidence_id"]);demandUuid(String(r.merchant_id));demandUuid(String(r.evidence_id));}
  else if(op==="apply")r=migrationReceipt(v);
  else if(op==="receipt"){r=closed(v,["receipt"]);if(r.receipt!==null)migrationReceipt(r.receipt);}
  else if(op==="review"){
   r=closed(v,["run_id","dataset_id","revision","writer_epoch","source","summary","freeze_verified","can_apply","reasons","review_digest"]);demandUuid(String(r.run_id));demandUuid(String(r.dataset_id));integer(r.revision);integer(r.writer_epoch);sourceSummary(r.source);demandDigest(String(r.review_digest));
   const summary=closed(r.summary,["total","new_active","new_inactive","duplicates","conflicts","blocked","new_active_gross_clp","known_new_active_net_clp","known_new_active_net_count"]);Object.entries(summary).forEach(([k,v])=>k.endsWith("_clp")?integer(v):count(v));for(const k of ["freeze_verified","can_apply"])if(typeof r[k]!=="boolean")throw Error("history_response_invalid");for(const reason of array(r.reasons,20))if(typeof reason!=="string"||!/^history_[a-z_]+$/.test(reason))throw Error("history_response_invalid");
  }else if(op==="status"){
   r=closed(v,["run_id","state","processed_objects","processed_movements","summary","error_code","manifest","bindings","scopes"]);demandUuid(String(r.run_id));if(!["queued","analysing","review_ready","applied","cancelled","failed"].includes(String(r.state)))throw Error("history_response_invalid");count(r.processed_objects);count(r.processed_movements,100000);text(r.error_code,120,true);
   if(r.summary!==null)sourceSummary(r.summary);if(r.manifest!==null){manifest(r.manifest);if((r.manifest as Record<string,unknown>).shopId!==shop)throw Error("history_response_invalid");}
   for(const item of array(r.bindings)){const b=closed(item,["local_scope_id","merchant_id","evidence_id"]);text(b.local_scope_id,256);demandUuid(String(b.merchant_id));demandUuid(String(b.evidence_id));}
   for(const item of array(r.scopes)){const s=closed(item,["id","reference"]);text(s.id,256);text(s.reference);}
  }else throw Error("history_response_invalid");
 }else{
  if(op==="devices"){r=closed(v,["devices"]);for(const item of array(r.devices,1000)){const d=closed(item,["device_id","name","status","revoked"]);demandUuid(String(d.device_id));text(d.name,256);text(d.status,30);if(typeof d.revoked!=="boolean")throw Error("history_response_invalid");}}
  else if(op==="inventory"){r=closed(v,["inventory_id"]);demandUuid(String(r.inventory_id));}
  else if(["freeze","freeze_web","activate_web"].includes(op)){
   r=closed(v,op==="activate_web"?["writer_epoch","writer_authority"]:["writer_epoch","writer_authority","reconciliation_required"]);integer(r.writer_epoch);if(!["web","frozen"].includes(String(r.writer_authority))||op!=="activate_web"&&typeof r.reconciliation_required!=="boolean")throw Error("history_response_invalid");
  }else{
   r=closed(v,["dataset_id","revision","writer_epoch","writer_authority","inventory_verified","inventory_digest","gates","inventory","known_devices"]);demandUuid(String(r.dataset_id));integer(r.revision);integer(r.writer_epoch);demandDigest(String(r.inventory_digest));if(!["web","local","frozen"].includes(String(r.writer_authority))||typeof r.inventory_verified!=="boolean")throw Error("history_response_invalid");
   if(r.gates!==null){const g=closed(r.gates,["inventory_resolved","inventory_unchanged","grants_drained","sources_reconciled","replicas_current","native_overlap_clear","can_activate"]);if(Object.values(g).some(v=>typeof v!=="boolean"))throw Error("history_response_invalid");}
   for(const item of array(r.inventory,1000)){const i=closed(item,["id","device_id","hardware_reference_sha256","disposition","protocol_version","client_build_sha","reference"]);demandUuid(String(i.id));if(i.device_id!==null)demandUuid(String(i.device_id));demandDigest(String(i.hardware_reference_sha256));if(!["active","retired_verified","unresolved"].includes(String(i.disposition)))throw Error("history_response_invalid");count(i.protocol_version,100);if(i.client_build_sha!==null&&(typeof i.client_build_sha!=="string"||!/^[0-9a-f]{40}$/.test(i.client_build_sha)))throw Error("history_response_invalid");text(i.reference);}
   for(const item of array(r.known_devices,1000)){const d=closed(item,["device_id","status","revoked"]);demandUuid(String(d.device_id));text(d.status,30);if(typeof d.revoked!=="boolean")throw Error("history_response_invalid");}
  }
 }
 return r;
}
export async function transferRequest(access:Access,lane:TransferLane,operation:string,payload:Json){
 if(!Object.hasOwn(TRANSFER_OPERATIONS,lane)||!(TRANSFER_OPERATIONS[lane] as readonly string[]).includes(operation))throw new HistoryRequestError("history_operation_invalid",400);
 const fresh=await historyRequest(access,"capabilities");if(!record(fresh.capabilities)||fresh.capabilities.migrate!==true)throw new HistoryRequestError("history_access_denied",403);
 const staff=access.principalKind==="pos_staff_manager"?access.principal:null,session=staff?.staffWebSession;
 if(staff&&!session)throw new HistoryRequestError("history_session_expired",403);
 const db=access.principalKind==="personal_account"?access.supabase:createSupabaseAdminClient();if(!db)throw new HistoryRequestError("history_unavailable",503);
 const {data,error}=await db.rpc(lane==="migration"?"payment_history_migration_request_v1":operation==="devices"?"payment_history_transfer_details_v1":"payment_history_cutover_v1",{p_shop_id:access.selectedShop.shopId,p_operation:operation,p_payload:payload,...(staff&&session?{p_staff_id:staff.staff.staffId,p_staff_web_session_id:session.sessionId,p_session_token_hash:session.sessionTokenHash,p_credential_version:session.credentialVersion}:{})});
 if(error)throw new HistoryRequestError(error.code==="42501"?"history_access_denied":error.code==="23505"?"history_idempotency_conflict":error.code==="40001"?"history_review_changed":error.code==="55000"||error.code.startsWith("22")?"history_input_invalid":"history_unavailable",error.code==="42501"?403:409);
 const id=access.principalKind==="personal_account"?access.principal.userId:access.principal.staff.staffId;
 if(!record(data)||Object.keys(data).length!==4||data.ok!==true||data.shop_id!==access.selectedShop.shopId||!record(data.actor)||Object.keys(data.actor).some(k=>!["kind","id","session_id","credential_version"].includes(k))||data.actor.kind!==access.principalKind||data.actor.id!==id||typeof data.actor.session_id!=="string"||session&&(data.actor.session_id!==session.sessionId||data.actor.credential_version!==session.credentialVersion)||Buffer.byteLength(JSON.stringify(data))>4194304)throw new HistoryRequestError("history_response_invalid",503);
 let result:Record<string,unknown>;try{result=validateTransferResult(lane,operation,data.result,access.selectedShop.shopId);}catch{throw new HistoryRequestError("history_response_invalid",503);}
 const current=await historyRequest(access,"capabilities");if(!record(current.capabilities)||current.capabilities.migrate!==true)throw new HistoryRequestError("history_access_denied",403);return result;
}
