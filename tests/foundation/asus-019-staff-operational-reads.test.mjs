import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
function load(path,deps={}) {
  const loaded={exports:{}};
  const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{module:loaded,exports:loaded.exports,require(name){if(name==="server-only")return {};assert.ok(Object.hasOwn(deps,name),name);return deps[name];}});
  return loaded.exports;
}
const SHOP="10000000-0000-4000-8000-000000000019",STAFF="20000000-0000-4000-8000-000000000019",SESSION="30000000-0000-4000-8000-000000000019",EVENT="40000000-0000-4000-8000-000000000019";
const at="2026-11-09T12:00:00Z";
const access={status:"ready",principalKind:"pos_staff_manager",selectedShop:{shopId:SHOP,role:"shop_manager"},principal:{staff:{staffId:STAFF},staffWebSession:{sessionId:SESSION,credentialVersion:7,sessionTokenHash:"synthetic-binding"}}};
const schema=load("src/server/shop-admin/staff-operations-schema.ts");
function empty(operation){return Object.fromEntries(Object.keys(schema.staffOperationsSchemas[operation]).map(key=>[key,[]]));}
function auditRow(){return {audit_log_id:EVENT,actor_profile_id:null,actor_staff_id:STAFF,scope:"shop",shop_id:SHOP,event_key:"synthetic.fixture",severity:"info",result:"success",target_type:"shop",target_id:SHOP,metadata_redacted:{},created_at:at};}
function harness({operation="audit_list",rows=empty(operation),refresh=true,error=null,change=()=>{}}={}) {
 const calls=[];const data={ok:true,code:"success",shop_id:SHOP,actor_staff_id:STAFF,staff_web_session_id:SESSION,credential_version:7,operation,rows};change(data);
 const api=load("src/server/shop-admin/staff-operations-read.ts",{
  "./staff-operations-schema":schema,"./data-access":{async revalidateShopAdminDataAccessForPublish(a,p){calls.push({refresh:p});return refresh;}},
  "./staff-web-lease-bound-rpc":{async callStaffWebOperationsRead(ctx,op,payload){calls.push({ctx,op,payload});return {data,error};}},
 });return {api,calls,data};
}
for(const operation of ["audit_list","audit_detail","pos_live","pos_revenue"])test(`${operation}: authorized empty remains distinguishable from missing capability`,async()=>{
 const h=harness({operation});const r=await h.api.readStaffOperations(access,operation);
 assert.equal(r.status,"ready");assert.equal(h.calls[0].ctx.staffWebSession.sessionId,SESSION);assert.equal(h.calls[1].refresh,operation.startsWith("audit_")?"audit.read":"pos.dashboard.read");
});
for(const [name,change] of Object.entries({shop:r=>r.shop_id=STAFF,actor:r=>r.actor_staff_id=SHOP,session:r=>r.staff_web_session_id=SHOP,version:r=>r.credential_version=8,operation:r=>r.operation="pos_live",secret:r=>r.token="PRIVATE_SENTINEL",rowScope:r=>r.rows.events[0].shop_id=STAFF,rowSecret:r=>r.rows.events[0].session_token="PRIVATE_SENTINEL",date:r=>r.rows.events[0].created_at="bad",count:r=>r.rows.events=Array(101).fill(auditRow())}))test(`operational reader rejects ${name}`,async()=>{
 const h=harness({rows:{events:[auditRow()]},change});const r=await h.api.readStaffOperations(access,"audit_list");assert.equal(r.status,"error");assert.equal(r.rows,null);assert.equal(h.calls.length,1);assert.ok(!JSON.stringify(r).includes("PRIVATE_SENTINEL"));
});
test("current-session revocation discards data before publication",async()=>{
 const h=harness({rows:{events:[auditRow()]},refresh:false});const r=await h.api.readStaffOperations(access,"audit_list");assert.equal(r.status,"unauthorized");assert.equal(r.rows,null);
});
test("RPC deployment gap, database failure and permission denial are distinct",async()=>{
 for(const [code,status] of [["PGRST202","staff_surface_unavailable"],["42883","staff_surface_unavailable"],["42501","unauthorized"],["XX000","error"]]){const h=harness({error:{code}});assert.equal((await h.api.readStaffOperations(access,"audit_list")).status,status);}
});
function readerDeps(h){return {"./staff-operations-read":h.api,"./data-access":{async resolveShopAdminDataAccess(){return access;},async revalidateShopAdminDataAccessForPublish(){return true;}},"@/lib/supabase/admin":{resolveSupabaseAdminConfig(){throw Error("staff must not create a table-query client");}},"@/lib/account-identity":{createAccountIdentitySummary(x){return x;}},"@/server/platform-admin/auth-identities":{loadAuthIdentitySummariesByIds(){throw Error("staff must not enumerate auth identities");}},"./history-read-model":{redactShopAdminJson:x=>x,stringifyRedactedJson:JSON.stringify}};}
test("actual audit list and detail map staff rows without personal-account queries",async()=>{
 const h=harness({rows:{events:[auditRow()]}});const reader=load("src/server/shop-admin/audit-read-model.ts",readerDeps(h));
 const list=await reader.getShopAuditReadModel({eventQuery:"synthetic",severity:"info"});assert.equal(list.status,"ready");assert.equal(list.events[0].actorKind,"pos_staff");assert.equal(h.calls[0].payload.eventQuery,"synthetic");
 const d=harness({operation:"audit_detail",rows:{events:[auditRow()]}});const detail=await load("src/server/shop-admin/audit-read-model.ts",readerDeps(d)).getShopAuditDetailReadModel(EVENT);assert.equal(detail.status,"ready");assert.equal(detail.event.auditLogId,EVENT);
});
test("actual POS live staff route returns a usable empty registry without admin-query fallback",async()=>{
 const h=harness({operation:"pos_live"});const r=await load("src/server/shop-admin/pos-live-read-model.ts",readerDeps(h)).getShopPosLiveReadModel();assert.equal(r.status,"ready");assert.equal(r.devices.length,0);
});
test("actual POS revenue staff route uses the existing signed-ledger presentation",async()=>{
 const rows=empty("pos_revenue");rows.month=[{shop_id:SHOP,business_date:"2026-11-02",card_received_clp:"270",cash_received_clp:"30",change_given_clp:"0",documented_revenue_clp:"300",latest_ledger_at:at,net_revenue_clp:"300",other_received_clp:"0",refund_count:0,sale_count:2,stock_warning_count:0,transaction_count:2,transfer_received_clp:"0",verification_revenue_clp:"0",void_count:0}];
 const h=harness({operation:"pos_revenue",rows});const r=await load("src/server/shop-admin/pos-revenue-read-model.ts",readerDeps(h)).getShopPosRevenueReadModel({month:"2026-11",year:"2026"});assert.equal(r.status,"ready");assert.equal(r.month.summary.netRevenueClp,300);assert.equal(r.month.summary.ticketAverageClp,150);assert.equal(r.month.days.length,1);
});
