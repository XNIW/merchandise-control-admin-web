import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const SHOP = "10000000-0000-4000-8000-000000000019";
const STAFF = "20000000-0000-4000-8000-000000000019";
const SESSION = "30000000-0000-4000-8000-000000000019";
function load(file, dependencies) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require(name) {
    if (name === "server-only") return {};
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  } });
  return loadedModule.exports;
}
function row() {
  return {staff_id:STAFF,shop_id:SHOP,staff_code:"0019",display_name:"Synthetic manager",
    role_key:"manager",status:"active",credential_kind:"pin",credential_status:"active",
    credential_updated_at:null,credential_expires_at:null,credential_version:7,
    must_change_credential:false,failed_attempts:0,locked_until:null,last_login_at:null,
    session_invalidated_at:null,web_access_revoked_at:null,
    created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-02T00:00:00Z"};
}
function harness(change = () => {}, {error = null, throws = false, missingSession = false} = {}) {
  const payload = {ok:true,code:"success",shop_id:SHOP,actor_staff_id:STAFF,
    staff_web_session_id:SESSION,credential_version:7,staff_accounts:[row()],
    owner_only_role_keys:["pos_admin","courier","manager"]};
  change(payload);
  const calls = [];
  const access = {status:"ready",principalKind:"pos_staff_manager",selectedShop:{shopId:SHOP},
    principal:{staff:{staffId:STAFF},permissions:[],staffWebSession:missingSession ? null :
      {sessionId:SESSION,credentialVersion:7,sessionTokenHash:"synthetic-session-binding"}}};
  const api = load("src/server/shop-admin/staff-read-model.ts", {
    "./data-access":{async resolveShopAdminDataAccess(input) {
      assert.equal(input.requiredPermission,"staff.view");return access;
    }},
    "./staff-web-lease-bound-rpc":{async callStaffWebStaffRead(context) {
      calls.push(context);if(throws)throw Error("PRIVATE_SENTINEL");return {data:payload,error};
    }},
    "./permissions":{canShopAdmin:()=>false},
    "./staff-web-permissions":{canStaffWebPerformShopAdminAction:()=>false,
      hasStaffFullShopAdminWebAccess:()=>false,OWNER_ONLY_STAFF_WEB_PERMISSIONS:new Set()},
  });
  return {api,calls,payload};
}
test("ASUS019 preserves the served TASK140F staff read and owner-only role metadata", async () => {
  const h=harness();const result=await h.api.resolveStaffPageBundle(SHOP);
  assert.equal(result.readModel.status,"ready");assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].actorStaffId,STAFF);
  assert.equal(h.calls[0].staffWebSession.sessionId,SESSION);
  assert.equal(result.readModel.staffAccounts[0].staffCode,"0019");
  assert.deepEqual(Array.from(result.ownerOnlyRoleKeys),["pos_admin","courier","manager"]);
  assert.equal(result.canManagePosAdminRole,false);
});
for (const [name,change] of Object.entries({
  shop:p=>{p.shop_id=STAFF;},actor:p=>{p.actor_staff_id=SHOP;},
  session:p=>{p.staff_web_session_id=SHOP;},version:p=>{p.credential_version=8;},
  crossShop:p=>{p.staff_accounts[0].shop_id=STAFF;},
  duplicate:p=>{p.staff_accounts.push({...p.staff_accounts[0]});},
  secretColumn:p=>{p.staff_accounts[0].credential_hash="PRIVATE_SENTINEL";},
  invalidDate:p=>{p.staff_accounts[0].created_at="invalid";},
  invalidRole:p=>{p.staff_accounts[0].role_key="unrecognized";},
  invalidCount:p=>{p.staff_accounts[0].failed_attempts=-1;},
  limit:p=>{p.staff_accounts=Array.from({length:101},row);},
  missingOwnerRole:p=>{p.owner_only_role_keys=["pos_admin"];},
  unexpectedOwnerRole:p=>{p.owner_only_role_keys.push("unrecognized");},
})) {
  test("ASUS019 rejects staff RPC payload: "+name, async () => {
    const h=harness(change);const result=await h.api.resolveStaffPageBundle(SHOP);
    assert.equal(result.readModel.status,"error");assert.equal(result.readModel.staffAccounts.length,0);
    assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  });
}
test("ASUS019 respects denial and absence of the current staff session", async () => {
  const denied=harness(p=>{p.ok=false;p.code="permission_denied";});
  assert.equal((await denied.api.getShopStaffReadModel()).status,"unauthorized");
  const absent=harness(undefined,{missingSession:true});
  assert.equal((await absent.api.getShopStaffReadModel()).status,"error");assert.equal(absent.calls.length,0);
});
test("ASUS019 contains staff RPC errors without exposing native messages", async () => {
  for(const options of [{error:Error("PRIVATE_SENTINEL")},{throws:true}]) {
    const h=harness(undefined,options);const result=await h.api.resolveStaffPageBundle(SHOP);
    assert.equal(result.readModel.status,"error");assert.ok(!JSON.stringify(result).includes("PRIVATE_SENTINEL"));
  }
});
test("ASUS019 staff adapter uses only the pinned lease-bound RPC", async () => {
  const calls=[];
  const api=load("src/server/shop-admin/staff-web-lease-bound-rpc.ts",{
    "@/lib/supabase/admin":{resolveSupabaseAdminConfig:()=>({status:"configured"}),
      createSupabaseAdminClient:()=>({rpc(name,args){calls.push({name,args});return {data:null,error:null};}})},
  });
  await api.callStaffWebStaffRead({actorStaffId:STAFF,selectedShop:{shopId:SHOP},
    staffWebSession:{sessionId:SESSION,credentialVersion:7,sessionTokenHash:"synthetic-session-binding"}});
  assert.equal(calls.length,1);assert.equal(calls[0].name,"staff_web_staff_read_v1");
  assert.deepEqual(Object.keys(calls[0].args).sort(),["p_expected_credential_version",
    "p_session_token_hash","p_shop_id","p_staff_id","p_staff_web_session_id"]);
});
