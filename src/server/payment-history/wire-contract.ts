// A closed projection at the SQL/HTTP boundary. Unknown fields are rejected,
// including fields that could accidentally expose a worker lease or credential.
import {validateHistoryMovementRead,validateHistoryMovementQuery} from "../../lib/payment-history/movement-read-contract";
import {validateQualifiedConfigResult} from "./qualified-config-contract";
export {validateHistoryMovementQuery};
type RecordValue=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=/^[0-9a-f]{64}$/;
export function historyRecord(value:unknown):value is RecordValue{return !!value&&typeof value==="object"&&!Array.isArray(value);}
function object(value:unknown,keys:readonly string[]){if(!historyRecord(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!(k in value)))throw Error("history_response_invalid");return value;}
function id(value:unknown,nullable=false){if(nullable&&value===null)return;if(typeof value!=="string"||!uuid.test(value))throw Error("history_response_invalid");}
function number(value:unknown,max=100000){if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0||value>max)throw Error("history_response_invalid");}
function decimal(value:unknown,nullable=false){if(nullable&&value===null)return;if(typeof value!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(value)||BigInt(value)<BigInt("-9223372036854775808")||BigInt(value)>BigInt("9223372036854775807"))throw Error("history_response_invalid");}
function text(value:unknown,max=2048,nullable=false){if(nullable&&value===null)return;if(typeof value!=="string"||value.length>max)throw Error("history_response_invalid");}
function array(value:unknown,max:number){if(!Array.isArray(value)||value.length>max)throw Error("history_response_invalid");return value;}
function hash(value:unknown){if(typeof value!=="string"||!digest.test(value))throw Error("history_response_invalid");}
function bool(value:unknown){if(typeof value!=="boolean")throw Error("history_response_invalid");}
const reviewKeys=["total","new_count","duplicate_count","conflicts","blocked","new_gross_clp","known_new_net_clp","known_new_net_count"];
function reviewSummary(value:unknown){const r=object(value,reviewKeys);for(const key of reviewKeys){if(key.endsWith("_clp"))decimal(r[key]);else number(r[key]);}return r;}
function receipt(value:unknown){
 if(!historyRecord(value))throw Error("history_response_invalid");
 const r=object(value,["operation_id","batch_id","kind","dataset_id","revision","writer_epoch",value.kind==="apply"?"summary":"deactivated"]);
 if(!["apply","cancel"].includes(String(r.kind)))throw Error("history_response_invalid");for(const k of ["operation_id","batch_id","dataset_id"])id(r[k]);decimal(r.revision);decimal(r.writer_epoch);
 if(r.kind==="apply")reviewSummary(r.summary);else number(r.deactivated);return r;
}
export function validateHistoryResult(operation:string,value:unknown,request?:unknown):RecordValue{
 if(operation==="qualified_config")return validateQualifiedConfigResult(value,typeof (value as RecordValue)?.shop_id==="string"?String((value as RecordValue).shop_id):"");
 if(operation==="movements"||operation==="movements_export")return validateHistoryMovementRead(value,request===undefined?undefined:validateHistoryMovementQuery(request)) as unknown as RecordValue;
 let r:RecordValue;
 if(operation==="capabilities"){
  r=object(value,["capabilities","runtime"]);const caps=object(r.capabilities,["read","import","cancel","export","migrate"]);Object.values(caps).forEach(bool);
  if(r.runtime!==null){const runtime=object(r.runtime,["dataset_id","revision","writer_epoch","writer_authority","inventory_verified"]);id(runtime.dataset_id);decimal(runtime.revision);decimal(runtime.writer_epoch);bool(runtime.inventory_verified);if(!["local","frozen","web"].includes(String(runtime.writer_authority)))throw Error("history_response_invalid");}
 }else if(operation==="metadata"){
  r=object(value,["merchants","aliases","evidence"]);
  for(const item of array(r.merchants,201)){const m=object(item,["merchant_id","label","evidence_id"]);id(m.merchant_id);id(m.evidence_id);text(m.label,256);}
  for(const item of array(r.aliases,201)){const a=object(item,["alias_key","merchant_id","evidence_id"]);id(a.merchant_id);id(a.evidence_id);hash(a.alias_key);}
  for(const item of array(r.evidence,201)){const e=object(item,["evidence_id","kind","verification_level","policy_version","reference","scope"]);id(e.evidence_id);text(e.kind,40);text(e.verification_level,40);text(e.policy_version,160);text(e.reference,2048);if(!historyRecord(e.scope)||Object.keys(e.scope).some(k=>!["merchant_id","alias_key","file_sha256","from_ticks","to_ticks","native_start_ticks","interpretation","profile","parser_version"].includes(k))||JSON.stringify(e.scope).length>16384)throw Error("history_response_invalid");}
 }else if(operation==="upload_create"){
  r=object(value,["upload_id","object_key"]);id(r.upload_id);text(r.object_key,100);
 }else if(["upload_ready","upload_status"].includes(operation)){
  r=object(value,["upload_id","state","file_name","sha256","byte_length"]);id(r.upload_id);text(r.file_name,256);hash(r.sha256);decimal(r.byte_length);if(!["pending","uploaded","verifying","verified","rejected","expired"].includes(String(r.state)))throw Error("history_response_invalid");
 }else if(["start","configure","cancel_job","resume_job"].includes(operation)){
  r=object(value,["job_id","state"]);id(r.job_id);text(r.state,30);
 }else if(operation==="review"){
  r=object(value,["shop_id","dataset_id","revision","writer_epoch","writer_ready","summary","can_commit","reasons","review_digest"]);
  id(r.shop_id);id(r.dataset_id);decimal(r.revision);decimal(r.writer_epoch);bool(r.writer_ready);bool(r.can_commit);reviewSummary(r.summary);hash(r.review_digest);
  for(const reason of array(r.reasons,20))if(typeof reason!=="string"||!/^history_[a-z_]+$/.test(reason))throw Error("history_response_invalid");
 }else if(["commit","cancel_batch"].includes(operation)){r=receipt(value);
 }else if(operation==="receipt"){r=object(value,["receipt"]);if(r.receipt!==null)receipt(r.receipt);
 }else if(operation==="permissions"){r=object(value,["saved"]);bool(r.saved);
 }else if(operation==="evidence"){r=object(value,["evidence_id","status"]);id(r.evidence_id);if(!["verified","revoked"].includes(String(r.status)))throw Error("history_response_invalid");
 }else if(operation==="merchant"){r=object(value,["merchant_id","alias_key"]);id(r.merchant_id);hash(r.alias_key);
 }else if(operation==="status"){
  r=object(value,["job_id","state","processed_rows","summary","diagnostics","error_code","merchants"]);id(r.job_id);number(r.processed_rows);text(r.error_code,120,true);
  if(!["queued","analysing","review_ready","committing","committed","cancelled","failed"].includes(String(r.state)))throw Error("history_response_invalid");
  // Summary keys match the dedicated parser/worker; never return arbitrary JSON.
  if(r.summary!==null){
   const s=object(r.summary,["sourceRows","accepted","sales","cancellations","rejected","signedGrossClp","positiveGrossClp","cancellationGrossClp","knownNetClp","knownNetCount","rejectedRequestedClp","knownRejectedRequestedCount","fromBusinessDateTime","toBusinessDateTime","fromIsoCandidateDateTime","toIsoCandidateDateTime","fromExportedLocalCandidateDateTime","toExportedLocalCandidateDateTime","sourceAccepted","candidates","needsTimeDecision"]);
   for(const [key,v] of Object.entries(s)){if(key==="candidates"){const c=object(v,["isoFrom","isoTo","localFrom","localTo"]);Object.values(c).forEach(x=>text(x,40,true));}else if(key==="needsTimeDecision")bool(v);else if(key.endsWith("Clp"))decimal(v,true);else if(key.endsWith("DateTime"))text(v,40,true);else number(v);}
  }
  for(const diagnostic of array(r.diagnostics,500)){const d=object(diagnostic,["code","severity","source","field","column"]);text(d.code,120);text(d.field,256);if(!["Error","Warning"].includes(String(d.severity)))throw Error("history_response_invalid");if(d.column!==null)number(d.column,256);if(d.source!==null){const s=object(d.source,["fileId","fileSha256","sheetName","rowNumber"]);text(s.fileId,30);hash(s.fileSha256);text(s.sheetName,256);number(s.rowNumber,1000000);}}
  for(const merchant of array(r.merchants,201)){const m=object(merchant,["alias_key","source_identity"]);hash(m.alias_key);const source=object(m.source_identity,["local","seller","sellerId","localNumber","rut","hasEvidence"]);for(const [key,v] of Object.entries(source)){if(key==="hasEvidence")bool(v);else text(v,256);}}
 }else if(["read","export"].includes(operation)){
  r=object(value,["configured","coverage","dataset_id","revision","writer_epoch","writer_authority","rows","batches"]);bool(r.configured);if(r.coverage!=="observed_records_only")throw Error("history_response_invalid");
  id(r.dataset_id,true);decimal(r.revision,true);decimal(r.writer_epoch,true);if(r.writer_authority!==null&&!["local","frozen","web"].includes(String(r.writer_authority)))throw Error("history_response_invalid");
  for(const row of array(r.rows,200)){const v=object(row,["movement_version_id","merchant_id","owner_batch_id","active","business_ticks","gross_clp","commission_clp","commission_vat_clp","net_clp","movement_kind","transaction_state","created_revision"]);for(const k of ["movement_version_id","merchant_id","owner_batch_id"])id(v[k]);bool(v.active);for(const k of ["business_ticks","gross_clp","commission_clp","commission_vat_clp","net_clp","created_revision"])decimal(v[k],k.startsWith("commission")||k==="net_clp");text(v.movement_kind,20);text(v.transaction_state,20);}
  for(const batch of array(r.batches,50)){const b=object(batch,["batch_id","origin","state","created_revision","cancelled_revision","created_at"]);id(b.batch_id);decimal(b.created_revision);decimal(b.cancelled_revision,true);text(b.created_at,50);if(!["active","cancelled"].includes(String(b.state))||!["web_import","local_migration"].includes(String(b.origin)))throw Error("history_response_invalid");}
 }else throw Error("history_response_invalid");
 return r;
}
