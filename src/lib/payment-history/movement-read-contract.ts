import {commercialDateTimeTicks} from "./time-rules";

export type HistoryMovementCursor={dataset_id:string;revision:string;business_ticks:string;id:string;query_key:string};
export type HistoryMovementQuery={from_date:string|null;to_date:string|null;include_inactive:boolean;page_size:number;after:HistoryMovementCursor|null};
export type HistoryMovementRow={
 id:string;merchant_id:string;merchant_label:string;batch_id:string;batch_origin:"local_migration"|"web_import";batch_state:"active"|"cancelled";
 active:boolean;business_ticks:string;business_datetime:string;gross_clp:string;fee_clp:string|null;fee_vat_clp:string|null;net_clp:string|null;
 movement_kind:"Sale"|"Cancellation";transaction_state:"ABONADO"|"CONFIRMADA";external_namespace:string;external_id:string;
 source_sheet:string|null;source_row:string|null;source_sha256:string|null;timestamp_raw:string|null;offset_minutes:string|null;occurred_at_utc:string|null;
 time_interpretation:string|null;time_policy_version:string|null;time_evidence_reference:string|null;created_revision:string;
};
export type HistoryMovementTotals={matched_count:string;active_count:string;inactive_count:string;signed_active_gross_clp:string|null;known_active_net_clp:string|null;known_active_net_count:string};
export type HistoryMovementRead={configured:boolean;coverage:"observed_records_only";dataset_id:string|null;revision:string|null;writer_epoch:string|null;writer_authority:"local"|"frozen"|"web"|null;
 from_date:string|null;to_date:string|null;include_inactive:boolean;totals:HistoryMovementTotals;rows:HistoryMovementRow[];next:HistoryMovementCursor|null};

type RecordValue=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail=():never=>{throw Error("history_response_invalid");};
function object(value:unknown,keys:readonly string[]):RecordValue{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return fail();
 return value as RecordValue;
}
function integer(value:unknown,min=BigInt("0"),max=BigInt("9223372036854775807")){
 if(typeof value!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(value)||BigInt(value)<min||BigInt(value)>max)return fail();return BigInt(value);
}
function text(value:unknown,max:number,nullable=false){if(nullable&&value===null)return;if(typeof value!=="string"||value.length>max||value.includes("\0"))return fail();}
function id(value:unknown){if(typeof value!=="string"||!uuid.test(value))return fail();}
function date(value:unknown){
 if(value===null)return;
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return fail();
 try{commercialDateTimeTicks(value+"T00:00:00");}catch{return fail();}
}
function cursor(value:unknown):HistoryMovementCursor{
 const c=object(value,["dataset_id","revision","business_ticks","id","query_key"]);id(c.dataset_id);id(c.id);integer(c.revision);integer(c.business_ticks,BigInt("0"),BigInt("3155378975999999999"));text(c.query_key,40);
 return c as HistoryMovementCursor;
}
export function historyMovementQueryKey(q:Pick<HistoryMovementQuery,"from_date"|"to_date"|"include_inactive">){
 return `${q.from_date??"*"}/${q.to_date??"*"}/${q.include_inactive?"all":"active"}`;
}
export function validateHistoryMovementQuery(value:unknown):HistoryMovementQuery{
 try{
  const q=object(value,["from_date","to_date","include_inactive","page_size","after"]);date(q.from_date);date(q.to_date);
  if(q.from_date!==null&&q.to_date!==null&&String(q.from_date)>String(q.to_date)||typeof q.include_inactive!=="boolean"||
   typeof q.page_size!=="number"||!Number.isSafeInteger(q.page_size)||q.page_size<1||q.page_size>200)return fail();
  if(q.after!==null&&cursor(q.after).query_key!==historyMovementQueryKey(q as HistoryMovementQuery))return fail();
  return q as HistoryMovementQuery;
 }catch{throw Error("history_view_input_invalid");}
}

export function validateHistoryMovementRead(value:unknown,query?:HistoryMovementQuery):HistoryMovementRead{
 const r=object(value,["configured","coverage","dataset_id","revision","writer_epoch","writer_authority","from_date","to_date","include_inactive","totals","rows","next"]);
 if(typeof r.configured!=="boolean"||r.coverage!=="observed_records_only"||typeof r.include_inactive!=="boolean")return fail();
 date(r.from_date);date(r.to_date);
 if(r.from_date!==null&&r.to_date!==null&&String(r.from_date)>String(r.to_date))return fail();
 if(r.configured){id(r.dataset_id);integer(r.revision);integer(r.writer_epoch,BigInt("1"));if(!["local","frozen","web"].includes(String(r.writer_authority)))return fail();}
 else if([r.dataset_id,r.revision,r.writer_epoch,r.writer_authority].some(v=>v!==null))return fail();
 const total=object(r.totals,["matched_count","active_count","inactive_count","signed_active_gross_clp","known_active_net_clp","known_active_net_count"]);
 const count=integer(total.matched_count),active=integer(total.active_count),inactive=integer(total.inactive_count),known=integer(total.known_active_net_count);
 if(active+inactive!==count||known>active||!r.include_inactive&&inactive!==BigInt("0"))return fail();
 // A sum over many exact Int64 rows can exceed Int64; keep its decimal string.
 const sumLimit=BigInt("9999999999999999999999999999999999999999");
 if(total.signed_active_gross_clp!==null)integer(total.signed_active_gross_clp,-sumLimit,sumLimit);
 if(total.known_active_net_clp!==null)integer(total.known_active_net_clp,-sumLimit,sumLimit);
 if((active===BigInt("0"))!==(total.signed_active_gross_clp===null)||(known===BigInt("0"))!==(total.known_active_net_clp===null))return fail();
 if(!Array.isArray(r.rows)||r.rows.length>200||BigInt(r.rows.length)>count)return fail();
 let previous:HistoryMovementRow|null=null;const ids=new Set<string>();
 for(const value of r.rows){
  const row=object(value,["id","merchant_id","merchant_label","batch_id","batch_origin","batch_state","active","business_ticks","business_datetime","gross_clp","fee_clp","fee_vat_clp","net_clp","movement_kind","transaction_state","external_namespace","external_id","source_sheet","source_row","source_sha256","timestamp_raw","offset_minutes","occurred_at_utc","time_interpretation","time_policy_version","time_evidence_reference","created_revision"]);
  for(const key of ["id","merchant_id","batch_id"])id(row[key]);
  if(ids.has(String(row.id)))return fail();ids.add(String(row.id));
  text(row.merchant_label,256);text(row.business_datetime,27);
  const ticks=integer(row.business_ticks,BigInt("0"),BigInt("3155378975999999999"));
  try{if(commercialDateTimeTicks(String(row.business_datetime))!==row.business_ticks)return fail();}catch{return fail();}
  const day=String(row.business_datetime).slice(0,10);
  if(r.from_date!==null&&day<String(r.from_date)||r.to_date!==null&&day>String(r.to_date))return fail();
  const gross=integer(row.gross_clp,BigInt("-9223372036854775808"));
  for(const key of ["fee_clp","fee_vat_clp","net_clp"])if(row[key]!==null)integer(row[key],BigInt("-9223372036854775808"));
  if(typeof row.active!=="boolean"||!r.include_inactive&&!row.active||!["local_migration","web_import"].includes(String(row.batch_origin))||
   !["active","cancelled"].includes(String(row.batch_state))||row.active&&row.batch_state!=="active"||
   !["ABONADO","CONFIRMADA"].includes(String(row.transaction_state))||!(row.movement_kind==="Sale"&&gross>BigInt("0")||row.movement_kind==="Cancellation"&&gross<BigInt("0")))return fail();
  if(!["getnet.legacy.transaction","getnet.financial.movement"].includes(String(row.external_namespace)))return fail();
  text(row.external_id,256);if(!row.external_id||/\p{Cc}/u.test(String(row.external_id)))return fail();
  text(row.source_sheet,256,true);text(row.timestamp_raw,128,true);text(row.time_policy_version,160,true);text(row.time_evidence_reference,2048,true);
  if(row.source_row!==null)integer(row.source_row,BigInt("1"),BigInt("1048576"));
  if(row.source_sha256!==null&&(typeof row.source_sha256!=="string"||!/^[0-9a-f]{64}$/.test(row.source_sha256)))return fail();
  if(row.offset_minutes!==null)integer(row.offset_minutes,BigInt("-840"),BigInt("840"));
  text(row.occurred_at_utc,40,true);if(row.occurred_at_utc!==null&&(!String(row.occurred_at_utc).endsWith("Z")||!Number.isFinite(Date.parse(String(row.occurred_at_utc)))))return fail();
  if(row.time_interpretation!==null&&!["Unresolved","IsoUtc","ExportedLocal"].includes(String(row.time_interpretation)))return fail();
  if(integer(row.created_revision,BigInt("1"))>integer(r.revision))return fail();
  if(previous&&(ticks>BigInt(previous.business_ticks)||ticks===BigInt(previous.business_ticks)&&String(row.id)>=previous.id))return fail();
  previous=row as HistoryMovementRow;
 }
 if(r.next!==null){const next=cursor(r.next);if(!previous||next.dataset_id!==r.dataset_id||next.revision!==r.revision||next.id!==previous.id||next.business_ticks!==previous.business_ticks||next.query_key!==historyMovementQueryKey(r as HistoryMovementRead))return fail();}
 if(!r.configured&&(count!==BigInt("0")||r.rows.length||r.next!==null))return fail();
 if(query){
  if(r.from_date!==query.from_date||r.to_date!==query.to_date||r.include_inactive!==query.include_inactive||r.rows.length>query.page_size)return fail();
  if(query.after&&(r.dataset_id!==query.after.dataset_id||r.revision!==query.after.revision))return fail();
  if(query.after&&r.rows.some(row=>BigInt(row.business_ticks)>BigInt(query.after!.business_ticks)||row.business_ticks===query.after!.business_ticks&&row.id>=query.after!.id))return fail();
 }
 return r as HistoryMovementRead;
}
