import {validateLocalCommitRequest,validateLocalCommitResult,type LocalCommitScope} from "./local-commit-contract";
import {validateLocalOutcomeWitness,localOutcomeSha256,LOCAL_OUTCOME_MAX_BYTES} from "./local-outcome-contract";
import {parseReceiptJson,ReceiptNumber,type ReceiptJson} from "./lossless-receipt-json";
import {validateLocalReceipt} from "./local-receipt-contract";
import {closedHistoryObject,historyObject} from "./replica-contract";

export const LOCAL_OUTCOME_OPERATIONS=["local_reconcile","local_abort"] as const;
const fail=():never=>{throw Error("history_local_witness_invalid");};
// Proof numeric fields are bounded counts, never monetary Int64. Reject lexical
// changes before conversion, while preserving the original raw proof for SQL.
function proofValue(value:ReceiptJson):unknown{
 if(value instanceof ReceiptNumber){
  if(!/^(0|-?[1-9][0-9]*)$/.test(value.raw)||BigInt(value.raw)<BigInt(Number.MIN_SAFE_INTEGER)||BigInt(value.raw)>BigInt(Number.MAX_SAFE_INTEGER))return fail();
  return Number(value.raw);
 }
 if(Array.isArray(value))return value.map(proofValue);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,proofValue(v)]));
 return value;
}
function originalProof(raw:unknown,w:ReturnType<typeof validateLocalOutcomeWitness>,scope:LocalCommitScope){
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>LOCAL_OUTCOME_MAX_BYTES||localOutcomeSha256(raw)!==w.proof_sha256)return fail();
 const proof=proofValue(parseReceiptJson(raw));if(!historyObject(proof))return fail();
 validateLocalCommitResult("local_authorize",{state:"authorized",operation_id:scope.operationId,content_digest:scope.contentDigest,
  grant_id:w.grant_id,writer_epoch:w.writer_epoch,remaining_milliseconds:0,proof},scope);
 for(const key of ["grant_id","local_dataset_id","restore_epoch","restore_lineage_id","writer_epoch","server_dataset_id","request_fingerprint"])if(proof[key]!==w[key])return fail();
 return proof;
}
export function validateLocalOutcomeDelivery(value:unknown,scope:LocalCommitScope){
 const p=closedHistoryObject(value,["operation_id","grant_id","content_digest","local_revision","local_sequence","local_receipt_json","witness_json","local_proof_json"]);
 const {witness_json:raw,local_proof_json:rawProof,...delivery}=p;
 validateLocalCommitRequest("local_deliver",delivery);
 const w=validateLocalOutcomeWitness(raw,{outcome:"committed",shop_id:scope.shopId,device_id:scope.deviceId,operation_id:scope.operationId,
  content_digest:scope.contentDigest,grant_id:String(p.grant_id),local_revision:String(p.local_revision),local_sequence:String(p.local_sequence)});
 if(localOutcomeSha256(p.local_receipt_json as string)!==w.local_receipt_sha256)return fail();
 const proof=originalProof(rawProof,w,scope),receipt=validateLocalReceipt(p.local_receipt_json as string,scope.operationId);
 if(receipt.OperationKind!==w.operation_kind||!historyObject(proof.local_decision)||
  BigInt(w.local_revision as string)-BigInt(w.base_revision as string)!==BigInt(proof.local_decision.revision_delta as string))return fail();
 return p;
}
export function validateLocalOutcomeAbort(value:unknown,scope:LocalCommitScope){
 const p=closedHistoryObject(value,["operation_id","content_digest","witness_json",...(historyObject(value)&&Object.hasOwn(value,"local_proof_json")?["local_proof_json"]:[])]);
 if(p.operation_id!==scope.operationId||p.content_digest!==scope.contentDigest)return fail();
 const w=validateLocalOutcomeWitness(p.witness_json,{outcome:"aborted",shop_id:scope.shopId,device_id:scope.deviceId,operation_id:scope.operationId,content_digest:scope.contentDigest});
 if(w.grant_id===null){if(p.local_proof_json!==undefined&&p.local_proof_json!==null)return fail();}
 else originalProof(p.local_proof_json,w,scope);
 return p;
}
export function validateLocalOutcomeAbortResult(value:unknown,scope:LocalCommitScope,rawWitness:string){
 const r=closedHistoryObject(value,["state","operation_id","content_digest","witness_sha256"]);
 if(r.state!=="aborted"||r.operation_id!==scope.operationId||r.content_digest!==scope.contentDigest||r.witness_sha256!==localOutcomeSha256(rawWitness))return fail();
 return r;
}
