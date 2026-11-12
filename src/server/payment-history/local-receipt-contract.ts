import {parseReceiptJson,ReceiptNumber,type ReceiptJson} from "./lossless-receipt-json";
import {demandDigest,demandUuid} from "./ledger-contract";

export const LOCAL_RECEIPT_MAX_BYTES=1024*1024;
const fail=():never=>{throw Error("history_local_receipt_invalid");};
type ReceiptObject={[key:string]:ReceiptJson};
function object(value:ReceiptJson,keys:readonly string[]):ReceiptObject{
 if(!value||typeof value!=="object"||Array.isArray(value)||value instanceof ReceiptNumber||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))return fail();
 return value;
}
function integer(value:ReceiptJson,minimum=BigInt("-9223372036854775808"),maximum=BigInt("9223372036854775807")){
 if(!(value instanceof ReceiptNumber)||!/^(0|-?[1-9][0-9]*)$/.test(value.raw))return fail();
 const n=BigInt(value.raw);if(n<minimum||n>maximum)return fail();return n;
}
function text(value:ReceiptJson,maximum:number){
 if(typeof value!=="string"||!value.trim()||value.length>maximum||value.includes("\0"))return fail();return value;
}
function operation(value:ReceiptJson){
 const raw=text(value,36);
 if(!/^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(raw))return fail();
 const n=raw.replaceAll("-","");const id=`${n.slice(0,8)}-${n.slice(8,12)}-${n.slice(12,16)}-${n.slice(16,20)}-${n.slice(20)}`;
 demandUuid(id);return id;
}
function economics(value:ReceiptJson){
 const e=object(value,["BusinessTicks","GrossClp","FeeClp","FeeVatClp","NetClp","MovementKind","TransactionState"]);
 integer(e.BusinessTicks,BigInt("0"),BigInt("3155378975999999999"));integer(e.GrossClp);
 for(const k of ["FeeClp","FeeVatClp","NetClp"])if(e[k]!==null)integer(e[k]);
 if(!["Sale","Cancellation"].includes(String(e.MovementKind))||!["ABONADO","CONFIRMADA"].includes(String(e.TransactionState)))return fail();
 return e;
}
// Typed validation only. The SQL transaction compares these original values
// against the content-authorized local decision and immutable correction facts.
// Keep the caller's raw bytes; never serialize ReceiptNumber as a replacement.
export function validateLocalReceipt(raw:string,expectedOperation?:string){
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>LOCAL_RECEIPT_MAX_BYTES)throw Error("history_local_receipt_limit");
 const r=object(parseReceiptJson(raw),["OperationId","OperationKind","BatchId","InsertedCount","DuplicateCount","RejectedCount","SignedAmountClp","CorrectionCount","CorrectionApprovals"]);
 const id=operation(r.OperationId);if(expectedOperation!==undefined&&id!==demandUuid(expectedOperation))return fail();
 if(r.OperationKind!=="Apply"&&r.OperationKind!=="Undo")return fail();if(/\p{Cc}/u.test(text(r.BatchId,256)))return fail();
 const inserted=integer(r.InsertedCount,BigInt("0"),BigInt("100000")),duplicates=integer(r.DuplicateCount,BigInt("0"),BigInt("100000"));
 integer(r.RejectedCount,BigInt("0"),BigInt("2147483647"));integer(r.SignedAmountClp);
 const corrections=integer(r.CorrectionCount,BigInt("0"),BigInt("200"));
 if(inserted+duplicates>BigInt("100000")||corrections>inserted||!Array.isArray(r.CorrectionApprovals)||BigInt(r.CorrectionApprovals.length)!==corrections)return fail();
 const seen=new Set<string>();
 for(const row of r.CorrectionApprovals){
  const a=object(row,["PreviousTransactionId","Previous","Proposed","SourceFileId","SourceSheet","SourceRow","ContextFingerprint","EvidenceReference"]);
  integer(a.PreviousTransactionId,BigInt("1"));economics(a.Previous);economics(a.Proposed);
  text(a.SourceFileId,256);text(a.SourceSheet,256);integer(a.SourceRow,BigInt("1"),BigInt("1048576"));
  demandDigest(text(a.ContextFingerprint,64));text(a.EvidenceReference,2048);
  const key=JSON.stringify([a.SourceFileId,a.SourceSheet,(a.SourceRow as ReceiptNumber).raw]);if(seen.has(key))return fail();seen.add(key);
 }
 if(r.OperationKind==="Undo"&&(duplicates!==BigInt("0")||integer(r.RejectedCount)!==BigInt("0")||corrections!==BigInt("0")))return fail();
 return r;
}
