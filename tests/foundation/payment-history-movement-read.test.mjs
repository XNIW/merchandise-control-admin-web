import assert from "node:assert/strict";
import test from "node:test";
import {load} from "./helpers/payment-history-harness.mjs";
import {movementRead,movementRow,movementQuery,movementId} from "./helpers/history-movement-fixture.mjs";
const {validateHistoryMovementRead:read,validateHistoryMovementQuery:query}=load("src/lib/payment-history/movement-read-contract.ts");

test("movement totals describe the whole filtered result while the visible page has one row",()=>{
 const value=read(movementRead(),query(movementQuery()));assert.equal(value.rows.length,1);assert.equal(value.totals.matched_count,"2");assert.equal(value.rows[0].fee_vat_clp,null);assert.equal(value.totals.known_active_net_clp,null);
 assert.equal(value.rows[0].business_datetime,"2026-03-01T10:00:00.0000001");
});
test("aggregate CLP values above Int64 remain exact decimal strings",()=>{
 const value=movementRead();value.totals.signed_active_gross_clp="18446744073709551614";value.rows[0].gross_clp="9223372036854775807";
 assert.equal(read(value).totals.signed_active_gross_clp,"18446744073709551614");
});
test("known net zero differs from unknown net",()=>{
 const value=movementRead();value.totals.known_active_net_count="1";value.totals.known_active_net_clp="0";value.rows[0].net_clp="0";
 assert.equal(read(value).totals.known_active_net_clp,"0");
});
test("audit rows retain inactive state without adding their gross to active totals",()=>{
 const value=movementRead();value.include_inactive=true;value.totals.matched_count="3";value.totals.inactive_count="1";value.rows=[{...movementRow(3),active:false,batch_state:"cancelled"}];value.next={...value.next,id:value.rows[0].id,query_key:"*/*/all"};
 assert.equal(read(value).totals.signed_active_gross_clp,"2000");
});
for(const [label,mutate] of [
 ["numeric money",v=>v.rows[0].gross_clp=1000],
 ["unknown net replaced by zero",v=>v.totals.known_active_net_clp="0"],
 ["wrong subtotal counts",v=>v.totals.active_count="3"],
 ["credential field",v=>v.rows[0].credential_hash="PRIVATE_SENTINEL"],
 ["wrong commercial clock",v=>v.rows[0].business_ticks="1"],
 ["next dataset",v=>v.next.dataset_id=movementId(99)],
 ["next revision",v=>v.next.revision="3"],
 ["next filter",v=>v.next.query_key="*/*/all"],
 ["native namespace",v=>v.rows[0].external_namespace="pos-sale"],
 ["inactive row outside audit",v=>v.rows[0].active=false],
 ["future row",v=>v.rows[0].created_revision="5"],
 ["unconfigured rows",v=>v.configured=false],
])test("closed movement projection rejects "+label,()=>{const v=movementRead();mutate(v);assert.throws(()=>read(v),/history_response_invalid/);});
test("a page cannot repeat an ID or reverse its commercial keyset order",()=>{
 const v=movementRead();v.next=null;v.rows=[movementRow(1),movementRow(2)];assert.throws(()=>read(v));
 v.rows=[movementRow(2),movementRow(2)];assert.throws(()=>read(v));
});
for(const mutate of [q=>q.page_size=201,q=>q.from_date="2026-02-30",q=>{q.from_date="2026-04-01";q.to_date="2026-03-31";},q=>q.shop_id=movementId(99)])test("movement query rejects expansion, invalid range or capacity "+mutate,()=>{const q=movementQuery();mutate(q);assert.throws(()=>query(q),/history_view_input_invalid/);});
test("cursor belongs to its date/audit filter as well as its dataset and revision",()=>{
 const q=movementQuery();q.after=movementRead().next;assert.equal(query(q).after.revision,"4");
 q.include_inactive=true;assert.throws(()=>query(q),/history_view_input_invalid/);
});
test("a response cannot cross the requested date range or cursor snapshot",()=>{
 const q=movementQuery();q.from_date="2026-04-01";const v=movementRead();v.from_date=q.from_date;assert.throws(()=>read(v,q));
 q.from_date=null;q.after={...v.next,revision:"3"};v.from_date=null;assert.throws(()=>read(v,q));
});
