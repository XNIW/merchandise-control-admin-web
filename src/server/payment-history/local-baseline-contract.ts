import {demandDigest,demandUuid} from "./ledger-contract";
import {closedHistoryObject as closed,historyObject} from "./replica-contract";
import {parseReceiptJson,ReceiptNumber} from "./lossless-receipt-json";

// Private composition contract; these names are not admitted by device-boundary
// until the full client/worker/SQL path is integrated and qualified together.
export const BASELINE_OPERATIONS=["baseline_context","baseline_upload_create","baseline_upload_ready","baseline_upload_status","baseline_start",
 "baseline_status","baseline_review","baseline_apply","baseline_receipt","baseline_recover"] as const;
export type BaselineOperation=typeof BASELINE_OPERATIONS[number];
type Scope={shopId:string;deviceId:string;runId?:string;localDatasetId?:string;restoreLineageId?:string;restoreEpoch?:string;localRevision?:string;writerEpoch?:string;datasetId?:string;
 staffId?:string;sessionId?:string;credentialVersion?:number;recoveryRequestKey?:string;applyRequestKey?:string;previousReviewDigest?:string|null};
const fail=():never=>{throw Error("history_baseline_invalid");};
const id=(v:unknown)=>{if(typeof v!=="string"||v==="00000000-0000-0000-0000-000000000000")return fail();demandUuid(v);return v;};
const text=(v:unknown,max=256)=>{if(typeof v!=="string"||v.length<1||v.length>max||v.includes("\0"))return fail();return v;};
const integer=(v:unknown,min=BigInt(0),max=BigInt("9223372036854775807"))=>{if(typeof v!=="string"||!/^(0|[1-9][0-9]{0,18})$/.test(v)||BigInt(v)<min||BigInt(v)>max)return fail();return v;};
const hash=(v:unknown)=>{if(typeof v!=="string")return fail();demandDigest(v);return v;};
const counts=(v:unknown,max=100000)=>{if(!(v instanceof ReceiptNumber)||!/^(0|[1-9][0-9]{0,5})$/.test(v.raw)||BigInt(v.raw)>BigInt(max))return fail();};
const fields={
 baseline_context:["local_dataset_id","data_revision","restore_epoch","restore_lineage_id"],
 baseline_upload_create:["request_key","file_name","sha256","byte_length"],baseline_upload_ready:["upload_id"],baseline_upload_status:["upload_id"],
 baseline_start:["request_key","upload_id","local_dataset_id","data_revision","restore_epoch","restore_lineage_id","writer_epoch"],
 baseline_status:["run_id"],baseline_review:["run_id"],
 baseline_apply:["run_id","request_key","review_digest"],baseline_receipt:["request_key"],baseline_recover:["recovery_request_key","run_id","apply_request_key"]} as const;
export function validateBaselineRequest(op:BaselineOperation,value:unknown){
 const optional=op==="baseline_recover"&&historyObject(value)?["previous_review_digest","retry_failed","previous_recovery_request_key"].filter(k=>Object.hasOwn(value,k)):[];
 const p=closed(value,[...fields[op],...optional]);
 if(Object.hasOwn(p,"previous_recovery_request_key")&&p.retry_failed!==true)fail();
 for(const [k,v] of Object.entries(p)){
  if(["request_key","upload_id","run_id","restore_lineage_id","recovery_request_key","apply_request_key","previous_recovery_request_key"].includes(k))id(v);
  else if(k==="retry_failed"){if(v!==true)fail();}
  else if(["data_revision","restore_epoch","writer_epoch","byte_length"].includes(k))integer(v,BigInt(k==="writer_epoch"||k==="byte_length"?1:0),BigInt(k==="byte_length"?20971520:"9223372036854775807"));
  else if(k==="sha256"||k==="review_digest"||k==="previous_review_digest")hash(v);
  else if(k==="file_name"){text(v);if(!/^[^/\\]+\.w7history\.zip$/.test(v as string))fail();}
  else text(v);
 }
 return p;
}
export function validateBaselineContext(value:unknown){
 const c=closed(value,["state","dataset_id","writer_epoch","writer_authority","source_snapshot_id","baseline_revision","canonical_revision","can_prepare"]);
 id(c.dataset_id);integer(c.writer_epoch,BigInt(1));
 if(!["local","frozen","web"].includes(String(c.writer_authority))||typeof c.can_prepare!=="boolean"||c.can_prepare&&c.writer_authority!=="local")fail();
 if(c.state==="missing"){if(c.source_snapshot_id!==null||c.baseline_revision!==null||c.canonical_revision!==null)fail();}
 else if(c.state==="verified"){id(c.source_snapshot_id);integer(c.baseline_revision);integer(c.canonical_revision,BigInt(1));}
 else fail();
 return c;
}
export function validateBaselineReceipt(raw:unknown,scope:Scope){
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")<1||Buffer.byteLength(raw,"utf8")>65536)fail();
 const r=closed(parseReceiptJson(raw as string),["operation_id","kind","source_run_id","source_snapshot_id","dataset_id","revision","writer_epoch",
  "new_active","new_inactive","duplicates","new_batches","original_evidence_level","baseline_context"]);
 for(const k of ["operation_id","source_run_id","source_snapshot_id","dataset_id"])id(r[k]);
 integer(r.revision,BigInt(1));integer(r.writer_epoch,BigInt(1));
 for(const k of ["new_active","new_inactive","duplicates","new_batches"])counts(r[k],k==="new_batches"?10000:100000);
 if(r.kind!=="migrate"||r.original_evidence_level!=="legacy_attested"||scope.runId!==undefined&&r.source_run_id!==scope.runId||scope.datasetId!==undefined&&r.dataset_id!==scope.datasetId)fail();
 const c=closed(r.baseline_context,["state","source_snapshot_id","local_dataset_id","local_revision","restore_epoch","restore_lineage_id","writer_epoch"]);
 text(c.local_dataset_id);integer(c.local_revision);integer(c.restore_epoch);id(c.restore_lineage_id);integer(c.writer_epoch,BigInt(1));
 if(c.state!=="baseline_verified"||c.source_snapshot_id!==r.source_snapshot_id||c.writer_epoch!==r.writer_epoch)fail();
 for(const [key,expected] of [["local_dataset_id",scope.localDatasetId],["local_revision",scope.localRevision],["restore_epoch",scope.restoreEpoch],
  ["restore_lineage_id",scope.restoreLineageId],["writer_epoch",scope.writerEpoch]] as const)if(expected!==undefined&&c[key]!==expected)fail();
 return r;
}
// Projection intentionally keeps status polling small; manifests, source rows,
// error text and signed URLs never become durable client metadata.
export function projectBaselineSqlResult(op:BaselineOperation,value:unknown,scope:Scope){
 if(!historyObject(value))return fail();
 if(op==="baseline_recover")return validateBaselineRecovery(value,scope);
 if(op==="baseline_context")return {baseline:validateBaselineContext(value)};
 if(op==="baseline_upload_create"){
  const r=closed(value,["upload_id","object_key"]);const upload=id(r.upload_id);
  if(r.object_key!==`history/${scope.shopId}/${upload}`)fail();return r;
 }
 if(op==="baseline_upload_ready"||op==="baseline_upload_status"){
  const r=closed(value,["upload_id","state","file_name","sha256","byte_length"]);id(r.upload_id);text(r.file_name);hash(r.sha256);integer(r.byte_length,BigInt(1),BigInt(20971520));
  if(!["pending","uploaded","verifying","verified","rejected","expired"].includes(String(r.state)))fail();return r;
 }
 if(op==="baseline_apply"||op==="baseline_receipt"){
  const receipt=op==="baseline_receipt"?closed(value,["receipt"]).receipt:value;
  if(receipt===null){if(op!=="baseline_receipt")fail();return {receipt_json:null};}
  const raw=JSON.stringify(receipt);validateBaselineReceipt(raw,scope);return {receipt_json:raw};
 }
 if(op==="baseline_review"){
  if(typeof value.can_apply!=="boolean")fail();hash(value.review_digest);
  return {run_id:id(scope.runId),can_apply:value.can_apply,review_digest:value.review_digest};
 }
 const run=id(value.run_id);if(scope.runId!==undefined&&run!==scope.runId)fail();
 if(!["queued","analysing","review_ready","applied","failed","cancelled"].includes(String(value.state)))fail();
 return {run_id:run,state:value.state};
}
export function validateBaselineRecovery(value:unknown,scope:Scope){
 const result=closed(value,["recovery_ack_json","receipt_json"]),raw=result.recovery_ack_json;
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")<1||Buffer.byteLength(raw,"utf8")>16384)fail();
 const a=closed(parseReceiptJson(raw as string),["schema_version","state","shop_id","device_id","staff_id","session_id","credential_version",
  "recovery_request_key","run_id","apply_request_key","previous_review_digest"]);
 const version=scope.credentialVersion;
 if(!(a.schema_version instanceof ReceiptNumber)||a.schema_version.raw!=="1"||!(a.credential_version instanceof ReceiptNumber)||
  typeof version!=="number"||!Number.isInteger(version)||version<1||version>2147483647||a.credential_version.raw!==String(version))fail();
 for(const [key,expected] of [["shop_id",scope.shopId],["device_id",scope.deviceId],["staff_id",scope.staffId],["session_id",scope.sessionId],
  ["recovery_request_key",scope.recoveryRequestKey],["run_id",scope.runId],["apply_request_key",scope.applyRequestKey]] as const){id(a[key]);if(a[key]!==expected)fail();}
 if(a.previous_review_digest!==null)hash(a.previous_review_digest);
 if(a.previous_review_digest!==(scope.previousReviewDigest??null))fail();
 if(a.state==="committed")validateBaselineReceipt(result.receipt_json,scope);
 else if(a.state!=="uncommitted"||result.receipt_json!==null)fail();
 return result;
}
