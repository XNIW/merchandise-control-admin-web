import {load} from "./payment-history-harness.mjs";
const {commercialDateTimeTicks}=load("src/lib/payment-history/time-rules.ts");
export const movementId=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export function movementQuery(){return {from_date:null,to_date:null,include_inactive:false,page_size:1,after:null};}
export function movementRow(n=2){return {
 id:movementId(n+10),merchant_id:movementId(2),merchant_label:"Synthetic merchant",batch_id:movementId(3),batch_origin:"local_migration",batch_state:"active",active:true,
 business_ticks:commercialDateTimeTicks("2026-03-01T10:00:00.0000001"),business_datetime:"2026-03-01T10:00:00.0000001",gross_clp:"1000",fee_clp:"100",fee_vat_clp:null,net_clp:null,
 movement_kind:"Sale",transaction_state:"ABONADO",external_namespace:"getnet.legacy.transaction",external_id:`synthetic-${n}`,source_sheet:"synthetic",source_row:"2",source_sha256:"a".repeat(64),
 timestamp_raw:"01/03/2026 10:00:00",offset_minutes:null,occurred_at_utc:null,time_interpretation:"Unresolved",time_policy_version:"synthetic-v1",time_evidence_reference:"synthetic-attested",created_revision:"1"};}
export function movementRead(){const row=movementRow();return {
 configured:true,coverage:"observed_records_only",dataset_id:movementId(4),revision:"4",writer_epoch:"2",writer_authority:"web",from_date:null,to_date:null,include_inactive:false,
 totals:{matched_count:"2",active_count:"2",inactive_count:"0",signed_active_gross_clp:"2000",known_active_net_clp:null,known_active_net_count:"0"},rows:[row],
 next:{dataset_id:movementId(4),revision:"4",business_ticks:row.business_ticks,id:row.id,query_key:"*/*/active"}};}
