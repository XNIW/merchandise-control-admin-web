import {createHash} from "node:crypto";
import {demandDigest,demandUuid} from "./ledger-contract";
import {parseReceiptJson,ReceiptNumber,type ReceiptJson} from "./lossless-receipt-json";

// Typed, bounded evidence of an already completed conforming-POS transaction.
// This is not a mutation capability. Current authentication, original grant,
// registered nonce, restore context and economic decisions stay server checks.
export const LOCAL_OUTCOME_MAX_BYTES=16384;
const keys=["schema_version","outcome","operation_kind","local_nonce","grant_id","operation_id","shop_id","device_id",
 "local_dataset_id","server_dataset_id","restore_epoch","restore_lineage_id","writer_epoch","content_digest","request_fingerprint",
 "base_revision","local_revision","local_sequence","local_receipt_sha256","proof_sha256","admission_id","remaining_milliseconds",
 "request_elapsed_milliseconds","elapsed_milliseconds","minimum_remaining_milliseconds"] as const;
type WitnessObject={[key:string]:ReceiptJson};
export type LocalOutcomeScope=Partial<Record<typeof keys[number],string>>;
const fail=():never=>{throw Error("history_local_witness_invalid");};
function object(value:ReceiptJson):WitnessObject{
 if(!value||typeof value!=="object"||Array.isArray(value)||value instanceof ReceiptNumber||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))return fail();
 return value;
}
function uuid(value:ReceiptJson){
 if(typeof value!=="string"||value==="00000000-0000-0000-0000-000000000000")return fail();
 return demandUuid(value);
}
function digest(value:ReceiptJson){if(typeof value!=="string")return fail();return demandDigest(value);}
function revision(value:ReceiptJson,minimum=BigInt("0")){
 if(typeof value!=="string"||!/^(0|[1-9][0-9]{0,18})$/.test(value))return fail();
 const n=BigInt(value);if(n<minimum||n>BigInt("9223372036854775807"))return fail();return n;
}
function integer(value:ReceiptJson,minimum:bigint,maximum:bigint){
 if(!(value instanceof ReceiptNumber)||!/^(0|[1-9][0-9]*)$/.test(value.raw))return fail();
 const n=BigInt(value.raw);if(n<minimum||n>maximum)return fail();return n;
}
export function localOutcomeSha256(raw:string){return createHash("sha256").update(raw,"utf8").digest("hex");}
export function validateLocalOutcomeWitness(raw:unknown,scope:LocalOutcomeScope={}){
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")<1||Buffer.byteLength(raw,"utf8")>LOCAL_OUTCOME_MAX_BYTES)throw Error("history_local_witness_limit");
 const w=object(parseReceiptJson(raw));integer(w.schema_version,BigInt("1"),BigInt("1"));
 if(!["committed","aborted"].includes(String(w.outcome))||!["Apply","Undo"].includes(String(w.operation_kind)))return fail();
 if(typeof w.local_dataset_id!=="string"||w.local_dataset_id.length<1||w.local_dataset_id.length>256||w.local_dataset_id.includes("\0"))return fail();
 for(const k of ["local_nonce","operation_id","shop_id","device_id","server_dataset_id","restore_lineage_id"])uuid(w[k]);
 for(const k of ["content_digest","request_fingerprint"])digest(w[k]);
 for(const k of ["restore_epoch","base_revision","local_revision","local_sequence"])revision(w[k]);
 revision(w.writer_epoch,BigInt("1"));
 if(w.outcome==="aborted"){
  for(const k of ["local_receipt_sha256","admission_id","remaining_milliseconds","request_elapsed_milliseconds","elapsed_milliseconds","minimum_remaining_milliseconds"])if(w[k]!==null)return fail();
  if((w.grant_id===null)!==(w.proof_sha256===null)||w.local_revision!==w.base_revision)return fail();
 }else{
  uuid(w.grant_id);uuid(w.admission_id);digest(w.local_receipt_sha256);digest(w.proof_sha256);revision(w.local_sequence,BigInt("1"));
  const remaining=integer(w.remaining_milliseconds,BigInt("1"),BigInt("60000"));
  const request=integer(w.request_elapsed_milliseconds,BigInt("0"),BigInt("60000"));
  const elapsed=integer(w.elapsed_milliseconds,BigInt("0"),BigInt("60000"));
  const reserve=integer(w.minimum_remaining_milliseconds,BigInt("10000"),BigInt("60000"));
  if(remaining-request-elapsed-BigInt("10000")<reserve)return fail();
 }
 if(w.grant_id!==null){uuid(w.grant_id);digest(w.proof_sha256);}
 for(const [key,expected] of Object.entries(scope))if(w[key]!==expected)return fail();
 // Do not reserialize this object. Hash/forward the caller's original raw text.
 return w;
}
