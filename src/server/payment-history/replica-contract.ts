import "server-only";
import {createHash} from "node:crypto";
import {demandDigest,demandUuid,windowsFieldHash} from "./ledger-contract";
export const DEVICE_HISTORY_OPERATIONS=["authority","local_write_grant","freeze_ack","snapshot_start","delta_start","page","replica_ack"] as const;
export type DeviceHistoryOperation=typeof DEVICE_HISTORY_OPERATIONS[number];
export const historyObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function closedHistoryObject(v:unknown,keys:readonly string[]){if(!historyObject(v)||Object.keys(v).length!==keys.length||keys.some(k=>!(k in v)))throw Error("history_response_invalid");return v;}
const integer=(v:unknown,positive=false)=>{if(typeof v!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(v)||BigInt(v)<BigInt(positive?"1":"-9223372036854775808")||BigInt(v)>BigInt("9223372036854775807"))throw Error("history_integer_invalid");return BigInt(v);};
const text=(v:unknown,max:number,nullable=false)=>{if(nullable&&v===null)return;if(typeof v!=="string"||v.length>max)throw Error("history_response_invalid");};
const count=(v:unknown,max:number)=>{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0||v>max)throw Error("history_response_invalid");};
const batchKeys=["id","origin","state","apply_operation_id","created_revision","cancelled_revision","created_utc_ms"];
const movementKeys=["id","merchant_id","batch_id","identity_key","economic_digest","active","business_ticks","gross_clp","fee_clp","fee_vat_clp","net_clp","movement_kind","transaction_state","external_namespace","external_id","source_sheet","source_row","timestamp_raw","offset_minutes","occurred_at_utc","time_interpretation","time_policy_version","time_evidence_reference","card_subtype","created_revision"];
export function validateReplicaEntity(value:unknown,shop:string,revision:string){
 const e=closedHistoryObject(value,["kind","id","digest","payload"]);demandUuid(String(e.id));demandDigest(String(e.digest));
 if(e.kind!=="batch"&&e.kind!=="movement")throw Error("history_response_invalid");const keys=e.kind==="batch"?batchKeys:movementKeys,p=closedHistoryObject(e.payload,keys);
 if(p.id!==e.id||integer(p.created_revision,true)>integer(revision))throw Error("history_response_invalid");
 const expected=windowsFieldHash(["history-replica-entity-v1",e.kind,...keys.map(k=>p[k]===null?"null":String(p[k]))]);if(expected!==e.digest)throw Error("history_response_invalid");
 if(e.kind==="batch"){
  demandUuid(String(p.apply_operation_id));if(!["local_migration","web_import"].includes(String(p.origin))||!["active","cancelled"].includes(String(p.state))||integer(p.created_utc_ms)<BigInt("0")||p.state==="active"&&p.cancelled_revision!==null||p.state==="cancelled"&&(integer(p.cancelled_revision)<integer(p.created_revision)||integer(p.cancelled_revision)>integer(revision)))throw Error("history_response_invalid");
 }else{
  demandUuid(String(p.merchant_id));demandUuid(String(p.batch_id));demandDigest(String(p.identity_key));demandDigest(String(p.economic_digest));
  if(typeof p.active!=="boolean"||integer(p.business_ticks)<BigInt("0")||integer(p.business_ticks)>BigInt("3155378975999999999")||!["ABONADO","CONFIRMADA"].includes(String(p.transaction_state))||!["getnet.legacy.transaction","getnet.financial.movement"].includes(String(p.external_namespace)))throw Error("history_response_invalid");
  const gross=integer(p.gross_clp);if(!(p.movement_kind==="Sale"&&gross>BigInt("0")||p.movement_kind==="Cancellation"&&gross<BigInt("0")))throw Error("history_response_invalid");for(const k of ["fee_clp","fee_vat_clp","net_clp"])if(p[k]!==null)integer(p[k]);
  text(p.external_id,256);text(p.source_sheet,256);text(p.timestamp_raw,128);text(p.occurred_at_utc,40,true);text(p.time_interpretation,30,true);text(p.time_policy_version,160,true);text(p.time_evidence_reference,2048,true);
  if(!p.external_id||/\p{Cc}/u.test(String(p.external_id))||integer(p.source_row,true)>BigInt("1048576")||p.offset_minutes!==null&&(integer(p.offset_minutes)<BigInt("-840")||integer(p.offset_minutes)>BigInt("840"))||!["Credit","Debit","Prepaid","Unknown"].includes(String(p.card_subtype)))throw Error("history_response_invalid");
  if(windowsFieldHash(["historical-economics-v1",String(p.business_ticks),String(p.gross_clp),p.fee_clp===null?"null":String(p.fee_clp),p.fee_vat_clp===null?"null":String(p.fee_vat_clp),p.net_clp===null?"null":String(p.net_clp),String(p.movement_kind),String(p.transaction_state)])!==p.economic_digest)throw Error("history_response_invalid");
  if(createHash("sha256").update([shop,"getnet",p.merchant_id,p.external_namespace,p.external_id].join("\u001f")).digest("hex")!==p.identity_key)throw Error("history_response_invalid");
 }
 return e;
}
export function validateDeviceHistoryRequest(operation:DeviceHistoryOperation,value:unknown){
 const fields={authority:[],local_write_grant:["operation_id","writer_epoch","kind"],freeze_ack:["writer_epoch","local_dataset_id","data_revision","restore_epoch","archive_sha256","manifest_sha256","backup_sha256","local_writes_drained","native_outbox_drained","protocol_version","client_build_sha"],snapshot_start:["request_key","page_size"],delta_start:["dataset_id","revision","writer_epoch","page_size"],page:["cursor"],replica_ack:["cursor","checksum","protocol_version","client_build_sha"]};
 const p=closedHistoryObject(value,fields[operation]);
 for(const [k,v] of Object.entries(p)){
  if(["operation_id","request_key","dataset_id","cursor"].includes(k))demandUuid(String(v));
  else if(["writer_epoch","revision","data_revision","restore_epoch"].includes(k)){if(integer(v)<BigInt(k==="writer_epoch"?"1":"0"))throw Error("history_input_invalid");}
  else if(k.endsWith("sha256")||k==="checksum")demandDigest(String(v));
  else if(k==="client_build_sha"){if(typeof v!=="string"||!/^[0-9a-f]{40}$/.test(v))throw Error("history_input_invalid");}
  else if(k==="protocol_version"){if(v!==1)throw Error("history_input_invalid");}
  else if(k==="kind"){if(v!=="Apply"&&v!=="Undo")throw Error("history_input_invalid");}
  else if(k==="page_size"){count(v,1000);if(v===0)throw Error("history_input_invalid");}
  else if(k.endsWith("drained")){if(v!==true)throw Error("history_input_invalid");}
  else if(k==="local_dataset_id"){text(v,256);if(!v)throw Error("history_input_invalid");}
 }
 return p;
}
export function validateDeviceHistoryResult(operation:DeviceHistoryOperation,value:unknown,shop:string){
 let r:Record<string,unknown>;
 if(operation==="authority"){
  r=closedHistoryObject(value,["dataset_id","revision","writer_epoch","writer_authority","inventory_verified","protocol_version"]);
  if(!["local","frozen","web"].includes(String(r.writer_authority))||typeof r.inventory_verified!=="boolean"||r.protocol_version!==1)throw Error("history_response_invalid");
 }else if(operation==="local_write_grant"){
  r=closedHistoryObject(value,["grant_id","operation_id","writer_epoch","remaining_milliseconds"]);demandUuid(String(r.grant_id));demandUuid(String(r.operation_id));count(r.remaining_milliseconds,60000);
 }else if(operation==="freeze_ack"||operation==="replica_ack"){
  r=closedHistoryObject(value,operation==="freeze_ack"?["acknowledged","writer_epoch"]:["acknowledged","revision","writer_epoch"]);if(r.acknowledged!==true)throw Error("history_response_invalid");
 }else{
  r=closedHistoryObject(value,operation==="page"?["cursor","next_cursor","done","dataset_id","revision","writer_epoch","checksum","movements","batches","entities"]:["cursor","dataset_id","revision","writer_epoch","checksum","movements","batches","mode"]);
  demandUuid(String(r.cursor));demandDigest(String(r.checksum));count(r.movements,1000000);count(r.batches,100000);
  if(operation==="page"){
   if(typeof r.done!=="boolean"||r.done!==(r.next_cursor===null)||!Array.isArray(r.entities)||r.entities.length>1000)throw Error("history_response_invalid");if(r.next_cursor!==null)demandUuid(String(r.next_cursor));
   for(const entity of r.entities)validateReplicaEntity(entity,shop,String(r.revision));
  }else if(r.mode!==(operation==="snapshot_start"?"snapshot":"delta"))throw Error("history_response_invalid");
 }
 if("dataset_id"in r)demandUuid(String(r.dataset_id));if("revision"in r&&integer(r.revision)<BigInt("0"))throw Error("history_response_invalid");if(integer(r.writer_epoch,true)<BigInt("1"))throw Error("history_response_invalid");return r;
}
