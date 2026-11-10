import {createHash} from "node:crypto";
import {demandDigest,demandUuid,windowsFieldHash} from "./ledger-contract";
import {closedHistoryObject,historyObject} from "./replica-contract";

// Incremental facts, not the frozen ZIP migration protocol. These operations
// become reachable only with the corresponding device SQL boundary installed.
export const LOCAL_COMMIT_PROTOCOL_VERSION=2;
export const LOCAL_COMMIT_PAGE_BYTES=256*1024;
export const LOCAL_COMMIT_RECORD_BYTES=16384;
export const LOCAL_COMMIT_MAX_PAGES=20000;
export const LOCAL_COMMIT_OPERATIONS=["local_prepare","local_stage","local_authorize","local_deliver","local_receipt"] as const;
export type LocalCommitOperation=typeof LOCAL_COMMIT_OPERATIONS[number];
export type LocalCommitRecord={kind:string;fields:Record<string,string|null>};
const columns={
 operation:["protocol_version","operation_id","operation_kind","shop_id","device_id","local_dataset_id","restore_epoch","restore_lineage_id","base_revision","request_fingerprint"],
 overlap:["native_start_ticks","evidence_reference"],
 file:["id","sha256","profile","source_rows"],
 binding:["alias_key","local_scope_id","local_binding_id","evidence_reference"],
 movement:["source_file_id","source_sheet","source_row","external_namespace","external_id","business_ticks","profile","alias_key","merchant_local","merchant_seller","merchant_seller_id","merchant_local_number","merchant_rut","movement_kind","transaction_state","settlement_state","gross_clp","fee_clp","fee_vat_clp","net_clp","timestamp_raw","offset_raw","offset_minutes","occurred_at_utc_ms","time_interpretation","time_policy_version","time_evidence_reference","card_subtype","payment_id","authorization_code","original_card_type","original_prepaid","terminal","settlement_date_raw"],
 rejected:["source_file_id","source_sheet","source_row","transaction_state","requested_clp"],
 correction:["source_file_id","source_sheet","source_row","previous_transaction_id","previous_economic_digest","proposed_economic_digest","context_fingerprint","evidence_reference","approval_fingerprint"],
 undo:["batch_id","batch_revision","apply_operation_id"]
} as const;
const fail=():never=>{throw Error("history_local_commit_invalid");};
const hash=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
function integer(value:unknown,min=BigInt("0")){
 if(typeof value!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(value)||BigInt(value)<min||BigInt(value)>BigInt("9223372036854775807"))return fail();
 return value;
}
function bounded(value:unknown,maximum:number){if(typeof value!=="string"||!value||value.length>maximum||value.includes("\0"))return fail();return value;}
export function validateLocalCommitPage(raw:unknown,sha:unknown):LocalCommitRecord[]{
 if(typeof raw!=="string"||Buffer.byteLength(raw)>LOCAL_COMMIT_PAGE_BYTES||typeof sha!=="string"||hash(raw)!==demandDigest(sha))return fail();
 const parsed:unknown=JSON.parse(raw);
 if(!Array.isArray(parsed)||parsed.length<1||parsed.length>200)return fail();
 return parsed.map(value=>{
  const record=closedHistoryObject(value,["kind","fields"]);
  if(typeof record.kind!=="string"||!Object.hasOwn(columns,record.kind)||!historyObject(record.fields)||Buffer.byteLength(JSON.stringify(record))>LOCAL_COMMIT_RECORD_BYTES)return fail();
  const fields=closedHistoryObject(record.fields,columns[record.kind as keyof typeof columns]);
  if(Object.values(fields).some(v=>v!==null&&(typeof v!=="string"||v.length>2048||v.includes("\0"))))return fail();
  if(record.kind==="operation"){
   if(fields.protocol_version!=="2"||!["Apply","Undo"].includes(String(fields.operation_kind)))return fail();
   for(const key of ["shop_id","device_id","restore_lineage_id"])demandUuid(String(fields[key]));
   // Local operation IDs remain byte-exact provenance. The authenticated RPC
   // additionally binds their canonical UUID to the reserved operation identity.
   if(typeof fields.operation_id!=="string"||!/^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(fields.operation_id))return fail();
   bounded(fields.local_dataset_id,256);integer(fields.restore_epoch);integer(fields.base_revision);demandDigest(String(fields.request_fingerprint));
  }
  if(record.kind==="correction"){
   integer(fields.previous_transaction_id,BigInt("1"));integer(fields.source_row,BigInt("1"));
   for(const key of ["previous_economic_digest","proposed_economic_digest","context_fingerprint","approval_fingerprint"])demandDigest(String(fields[key]));
   bounded(fields.evidence_reference,2048);
   if(windowsFieldHash([fields.previous_transaction_id,fields.previous_economic_digest,fields.proposed_economic_digest,
     fields.source_file_id,fields.source_sheet,fields.source_row,fields.context_fingerprint,fields.evidence_reference] as string[])!==fields.approval_fingerprint)return fail();
  }
  return {kind:record.kind,fields:fields as Record<string,string|null>};
 });
}
export function localCommitContentDigest(pageDigests:readonly string[]){
 if(!pageDigests.length||pageDigests.length>LOCAL_COMMIT_MAX_PAGES)return fail();
 const digest=createHash("sha256");for(const sha of pageDigests)digest.update(demandDigest(sha)+"\n","ascii");return digest.digest("hex");
}
export function validateLocalCommitRequest(operation:LocalCommitOperation,value:unknown){
 const fields={
  local_prepare:["operation_id","kind","local_dataset_id","restore_epoch","restore_lineage_id","base_revision","writer_epoch","request_fingerprint","content_digest","page_count","protocol_version"],
  local_stage:["operation_id","content_digest","ordinal","page_json","page_sha256"],
  local_authorize:["operation_id","content_digest"],
  local_deliver:["operation_id","grant_id","content_digest","local_revision","local_sequence","local_receipt_json"],
  local_receipt:["operation_id","content_digest"]
 };
 const p=closedHistoryObject(value,fields[operation]);demandUuid(String(p.operation_id));demandDigest(String(p.content_digest));
 if(operation==="local_prepare"){
  if(p.protocol_version!==2||!["Apply","Undo"].includes(String(p.kind))||!Number.isSafeInteger(p.page_count)||Number(p.page_count)<1||Number(p.page_count)>LOCAL_COMMIT_MAX_PAGES)return fail();
  bounded(p.local_dataset_id,256);integer(p.restore_epoch);demandUuid(String(p.restore_lineage_id));integer(p.base_revision);integer(p.writer_epoch,BigInt("1"));demandDigest(String(p.request_fingerprint));
 }else if(operation==="local_stage"){
  if(!Number.isSafeInteger(p.ordinal)||Number(p.ordinal)<1||Number(p.ordinal)>LOCAL_COMMIT_MAX_PAGES)return fail();
  validateLocalCommitPage(p.page_json,p.page_sha256);
 }else if(operation==="local_deliver"){
  demandUuid(String(p.grant_id));integer(p.local_revision);integer(p.local_sequence,BigInt("1"));
  bounded(p.local_receipt_json,65536);
  // Receipt numeric values need the existing lossless parser before economic
  // comparison. Never coerce Int64 amounts through JavaScript Number.
 }
 return p;
}

export type LocalCommitScope={shopId:string;deviceId:string;operationId:string;contentDigest:string};
const receiptKeys=["operation_id","grant_id","shop_id","device_id","dataset_id","local_dataset_id","restore_epoch","restore_lineage_id","writer_epoch","revision","content_digest","local_receipt_sha256","batch_id","kind","inserted","duplicates","deactivated","signed_gross_clp"];
const proofKeys=["grant_id","operation_id","shop_id","device_id","local_dataset_id","restore_epoch","writer_epoch","content_digest","request_fingerprint","decision","server_dataset_id","restore_lineage_id"];
function scopedIdentity(value:Record<string,unknown>,scope:LocalCommitScope){
 if(value.operation_id!==scope.operationId||value.shop_id!==scope.shopId||value.device_id!==scope.deviceId||value.content_digest!==scope.contentDigest)return fail();
}
function validateReceipt(value:unknown,scope:LocalCommitScope){
 const receipt=closedHistoryObject(value,receiptKeys);scopedIdentity(receipt,scope);
 for(const key of ["operation_id","grant_id","shop_id","device_id","dataset_id","restore_lineage_id","batch_id"])demandUuid(String(receipt[key]));
 for(const key of ["content_digest","local_receipt_sha256"])demandDigest(String(receipt[key]));
 bounded(receipt.local_dataset_id,256);integer(receipt.restore_epoch);integer(receipt.writer_epoch,BigInt("1"));integer(receipt.revision);
 integer(receipt.signed_gross_clp,BigInt("-9223372036854775808"));
 if(!["Apply","Undo"].includes(String(receipt.kind)))return fail();
 for(const key of ["inserted","duplicates","deactivated"])
  if(!Number.isSafeInteger(receipt[key])||Number(receipt[key])<0||Number(receipt[key])>100000)return fail();
 return receipt;
}
export function validateLocalCommitResult(operation:LocalCommitOperation,value:unknown,scope:LocalCommitScope){
 const keys={
  local_prepare:["state","operation_id","content_digest","next_ordinal","page_count"],
  local_stage:["state","operation_id","content_digest","next_ordinal"],
  local_authorize:["state","operation_id","content_digest","grant_id","writer_epoch","remaining_milliseconds","proof"],
  local_deliver:["state","operation_id","content_digest","receipt"],
  local_receipt:["state","operation_id","content_digest","receipt"]
 };
 const result=closedHistoryObject(value,keys[operation]);
 if(result.operation_id!==scope.operationId||result.content_digest!==scope.contentDigest)return fail();
 if(operation==="local_prepare"||operation==="local_stage"){
  if(result.state!=="preparing"||!Number.isSafeInteger(result.next_ordinal)||Number(result.next_ordinal)<1||Number(result.next_ordinal)>LOCAL_COMMIT_MAX_PAGES+1)return fail();
  if(operation==="local_prepare"&&(!Number.isSafeInteger(result.page_count)||Number(result.page_count)<1||Number(result.page_count)>LOCAL_COMMIT_MAX_PAGES||Number(result.next_ordinal)>Number(result.page_count)+1))return fail();
 }else if(operation==="local_authorize"){
  if(result.state!=="authorized"||!Number.isSafeInteger(result.remaining_milliseconds)||Number(result.remaining_milliseconds)<0||Number(result.remaining_milliseconds)>60000)return fail();
  demandUuid(String(result.grant_id));integer(result.writer_epoch,BigInt("1"));
  const proof=closedHistoryObject(result.proof,proofKeys);scopedIdentity(proof,scope);
  for(const key of ["grant_id","server_dataset_id","restore_lineage_id"])demandUuid(String(proof[key]));
  bounded(proof.local_dataset_id,256);integer(proof.restore_epoch);integer(proof.writer_epoch,BigInt("1"));demandDigest(String(proof.request_fingerprint));
  if(proof.grant_id!==result.grant_id||proof.writer_epoch!==result.writer_epoch||proof.decision!=="content_authorized_v2")return fail();
 }else{
  if(!["authorized","committed","reconcile_required"].includes(String(result.state))||operation==="local_deliver"&&result.state!=="committed")return fail();
  if(result.state==="committed")validateReceipt(result.receipt,scope);
  else if(result.receipt!==null)return fail();
 }
 return result;
}
