import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function load(path, dependencies = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code, {module:loadedModule,exports:loadedModule.exports,require(name){
    if(name === "server-only")return {};
    assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name];
  }});
  return loadedModule.exports;
}
const SHOP="10000000-0000-4000-8000-000000000019", STAFF="20000000-0000-4000-8000-000000000019", SESSION="30000000-0000-4000-8000-000000000019";
function access(roleKey="pos_admin",permissions=["shop_admin.full_access"]){return {
  status:"ready",principalKind:"pos_staff_manager",selectedShop:{shopId:SHOP,role:"shop_manager"},
  principal:{kind:"pos_staff_manager",roleKey,permissions,staff:{staffId:STAFF,staffCode:"1001"},
    staffWebSession:{sessionId:SESSION,credentialVersion:7,sessionTokenHash:"synthetic-binding"}}
};}
function payload(operation="overview") {return {ok:true,code:"success",shop_id:SHOP,actor_staff_id:STAFF,
  staff_web_session_id:SESSION,credential_version:7,operation,members:[],
  shop:{shop_id:SHOP,shop_code:"SYNTHETIC019",shop_name:"Synthetic shop",shop_status:"active",
    company_rut:null,business_address:"",business_city:null,business_giro:null,legal_representative_rut:null,
    fiscal_identity_locked_by_platform:true,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",
    status_changed_at:null,suspended_at:null,archived_at:null}};}
function readerHarness(change=()=>{}, {error=null,refresh=true,view="overview"}={}) {
  const response=payload(view);change(response);const calls=[];
  const api=load("src/server/shop-admin/staff-profile-read-model.ts", {
    "./data-access":{async revalidateShopAdminDataAccessForPublish(a,p){calls.push({refresh:p});return refresh;}},
    "./staff-web-lease-bound-rpc":{async callStaffWebShopProfileRead(ctx,operation){calls.push({ctx,operation});return {data:response,error};}},
    "@/lib/account-identity":{createAccountIdentitySummary({profileId}){return {kind:"account_identity",profileId,email:null,displayName:null,origin:"unknown",originLabel:"Origin unavailable"};}},
  });return {api,response,calls,view};
}
for(const view of ["overview","settings","members"])test(`staff ${view} reads under exact session without a general query`,async()=>{
  const h=readerHarness(undefined,{view});const result=await h.api.readStaffShopProfile(access(),view);
  assert.equal(result.status,"ready");assert.equal(result.selectedShop.shopId,SHOP);
  assert.equal(result.readOnly,true);assert.equal(h.calls[0].ctx.staffWebSession.sessionId,SESSION);
  assert.equal(h.calls[1].refresh,view==="members"?"members.view":"settings.view");
});
for(const [name,change] of Object.entries({shop:p=>p.shop_id=STAFF,actor:p=>p.actor_staff_id=SHOP,
  session:p=>p.staff_web_session_id=SHOP,version:p=>p.credential_version=8,operation:p=>p.operation="members",
  nestedShop:p=>p.shop.shop_id=STAFF,secret:p=>p.shop.credential_hash="PRIVATE_SENTINEL",
  envelopeSecret:p=>p.session_token="PRIVATE_SENTINEL",date:p=>p.shop.updated_at="invalid",
  count:p=>p.members=Array(101).fill({}),unexpectedMembers:p=>p.members=[{}]})){
  test(`staff profile rejects ${name} payload`,async()=>{const h=readerHarness(change);
    const result=await h.api.readStaffShopProfile(access(),"overview");assert.equal(result.status,"error");
    assert.equal(result.selectedShop,null);assert.equal(result.members.length,0);
    assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));assert.equal(h.calls.length,1);
  });
}
test("staff permission loss before publication discards the loaded profile",async()=>{
  const h=readerHarness(undefined,{refresh:false});const result=await h.api.readStaffShopProfile(access(),"overview");
  assert.equal(result.status,"unauthorized");assert.equal(result.selectedShop,null);
});
test("only a missing RPC means unsupported; outage and denial stay different",async()=>{
  for(const [error,status] of [[{code:"PGRST202"},"staff_surface_unavailable"],[{code:"42883"},"staff_surface_unavailable"],
    [{code:"42501"},"unauthorized"],[{code:"XX000",message:"PRIVATE_SENTINEL"},"error"]]){
    const h=readerHarness(undefined,{error});const result=await h.api.readStaffShopProfile(access(),"overview");
    assert.equal(result.status,status);assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  }
});
test("authorized empty is different from an unavailable surface",async()=>{
  const h=readerHarness(p=>p.shop=null);const result=await h.api.readStaffShopProfile(access(),"overview");
  assert.equal(result.status,"empty");assert.equal(h.calls.length,2);
});
test("members returns real membership identity without an invented staff profile or email",async()=>{
  const h=readerHarness(p=>p.members=[{shop_member_id:SESSION,profile_id:SHOP,role_key:"shop_owner",membership_status:"active",created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z"}],{view:"members"});
  const result=await h.api.readStaffShopProfile(access(),"members");assert.equal(result.status,"ready");
  assert.equal(result.members[0].profileId,SHOP);assert.equal(result.members[0].accountIdentity.email,null);
});
const perms=load("src/server/shop-admin/permissions.ts");
const web=load("src/server/shop-admin/staff-web-permissions.ts");
const shell=load("src/server/shop-admin/shell-capabilities.ts",{"./permissions":perms,"./staff-web-permissions":web});
test("real role rather than staff code or generic shell role controls badge",()=>{
  assert.equal(shell.shopShellIdentity(access()).roleLabel,"Shop administrator");
  const admin=access();admin.principal.staff.staffCode="1003";
  assert.equal(shell.shopShellIdentity(admin).roleLabel,"Shop administrator");
  assert.equal(shell.shopShellIdentity(access("manager",["staff.read"])).roleLabel,"Shop Manager");
  assert.equal(shell.shopShellIdentity(admin).methodLabel,"Shop-code sign-in");
});
test("landing selects a usable authorized page and keeps courier separate",()=>{
  assert.equal(shell.staffShopLanding(access()),"/shop/products");
  assert.equal(shell.staffShopLanding(access("manager",["staff.read"])),"/shop/staff");
  assert.equal(shell.staffShopLanding(access("courier",["orders.delivery.track"])),"/shop/courier");
  assert.equal(shell.staffShopLanding(access("manager",[])),null);
});
test("menu requires effective capabilities and does not imply full write rights",()=>{
  const nav=[{key:"test",items:[{key:"products"},{key:"staff"},{key:"devices"},{key:"members"}]}];
  assert.deepEqual(Array.from(shell.visibleShopNavigation(access("manager",["staff.read"]),nav)[0].items,x=>x.key),["staff"]);
  assert.equal(shell.canOpenShopSection(access("manager",["staff.read"]),"members"),false);
  assert.equal(shell.visibleShopNavigation(access("courier",["orders.delivery.track"]),nav).length,0);
});
test("new shell identity copy is translated in IT ES ZH",()=>{
  const {dictionaries}=load("src/i18n/dictionaries.ts");
  for(const locale of ["it","es","zh-CN"])for(const key of ["Shop administrator","Personal account sign-in","Shop-code sign-in"]){assert.ok(dictionaries[locale].exact[key]);assert.notEqual(dictionaries[locale].exact[key],key);}
});
