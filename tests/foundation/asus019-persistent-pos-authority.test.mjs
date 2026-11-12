import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createContext,Script} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const requireForTest=createRequire(import.meta.url);
const POLICY='persistent-pos-v1';
const FOREVER='9999-12-31T23:59:59.999999Z';
const SHOP='10000000-0000-4000-8000-000000000019';
const STAFF='20000000-0000-4000-8000-000000000019';
const DEVICE='30000000-0000-4000-8000-000000000019';
const CREDENTIAL='40000000-0000-4000-8000-000000000019';
const SESSION='50000000-0000-4000-8000-000000000019';
const at=ms=>new Date(Date.now()+ms).toISOString();

function load(path,stubs={}){
 const module={exports:{}};
 const js=ts.transpileModule(readFileSync(join(process.cwd(),path),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},fileName:path}).outputText;
 new Script(js,{filename:path}).runInContext(createContext({module,exports:module.exports,Buffer,Date,Request,Response,console,
  require(name){if(name==='server-only')return {};if(name in stubs)return stubs[name];
   if(name==='./pos-contract')return load('src/server/pos-auth/pos-contract.ts');return requireForTest(name);}}));
 return module.exports;
}
function input(policy){return {shopId:SHOP,staffId:STAFF,credentialVersion:7,deviceIdentifier:'qa-persistent-device',
 deviceDisplayName:'QA',deviceTokenHash:'sha256:'+'a'.repeat(64),sessionTokenHash:'sha256:'+'b'.repeat(64),
 deviceTtlSeconds:15552000,sessionTtlSeconds:43200,offlineAuthorizationMaxAgeSeconds:43200,
 offlineAuthorizationPolicyVersion:policy||'pos-policy-v1',metadata:{},...(policy?{localAuthorizationPolicy:policy}:{})};}
function committed(policy){const expiry=policy?FOREVER:at(43200000);return {ok:true,code:'success',shopId:SHOP,staffId:STAFF,
 credentialVersion:7,deviceIdentifier:'qa-persistent-device',posDeviceCredentialId:CREDENTIAL,posSessionId:SESSION,
 shopDeviceId:DEVICE,serverTime:at(-1000),sessionExpiresAt:expiry,effectiveOfflineAuthorizationExpiresAt:expiry,
 offlineAuthorizationPolicyVersion:policy||'pos-policy-v1',...(policy?{localAuthorizationPolicy:policy}:{})};}

test('Persistent POS selects negotiated V4 while legacy clients retain bounded V3',async()=>{
 const boundary=load('src/server/pos-auth/runtime-boundary.ts');
 for(const policy of [undefined,POLICY]){
  const calls=[];const client={async rpc(name,args){calls.push({name,args});return {data:committed(policy),error:null};}};
  const result=await boundary.commitPosFirstLogin(client,input(policy));
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,policy?'pos_runtime_first_login_commit_v4':'pos_runtime_first_login_commit_v3');
  assert.equal(calls[0].args.p_offline_authorization_policy_version,policy||'pos-policy-v1');
  assert.equal(result.localAuthorizationPolicy,policy);
  assert.equal(result.sessionExpiresAt,policy?FOREVER:result.effectiveOfflineAuthorizationExpiresAt);
 }
});

test('Persistent POS rejects missing negotiation echo, malformed expiry and a different actor',async()=>{
 const boundary=load('src/server/pos-auth/runtime-boundary.ts');
 const changed=[{localAuthorizationPolicy:undefined},{sessionExpiresAt:'invalid'},{staffId:SHOP},
  {effectiveOfflineAuthorizationExpiresAt:'invalid'},{localAuthorizationPolicy:'unknown'}];
 for(const change of changed){
  const result=await boundary.commitPosFirstLogin({async rpc(){return {data:{...committed(POLICY),...change},error:null};}},input(POLICY));
  assert.equal(result.ok,false);
 }
 const unexpected=await boundary.commitPosFirstLogin({async rpc(){return {data:committed(POLICY),error:null};}},input());
 assert.equal(unexpected.ok,false);
});

test('Heartbeat preserves the actual persistent expiry returned by the database',async()=>{
 const boundary=load('src/server/pos-auth/runtime-boundary.ts');
 const heartbeat={shopId:SHOP,shopDeviceId:DEVICE,staffId:STAFF,posSessionId:SESSION,expiresAt:at(43200000)};
 const result=await boundary.touchPosHeartbeat({async rpc(){return {data:{ok:true,expiresAt:FOREVER},error:null};}},heartbeat);
 assert.equal(result.expiresAt,FOREVER);
 for(const data of [{ok:true},{ok:true,expiresAt:'invalid'},{ok:true,expiresAt:at(-1000)},{ok:false,expiresAt:FOREVER}]){
  assert.equal(await boundary.touchPosHeartbeat({async rpc(){return {data,error:null};}},heartbeat),null);
 }
});

test('First login publishes persistent authority only after the committed policy is accepted',async()=>{
 const calls=[];
 const runtime={loadPosFirstLoginIdentity:async()=>({status:'ok',device:null,
  shop:{shop_id:SHOP,shop_code:'SHOP019',shop_name:'QA shop',shop_status:'active'},
  staff:{staff_id:STAFF,shop_id:SHOP,staff_code:'STAFF019',role_key:'cashier',display_name:'QA',
   credential_version:7,credential_status:'active',credential_hash:'fixture',credential_expires_at:null,
   status:'active',must_change_credential:false,failed_attempts:0,locked_until:null,session_invalidated_at:null}}),
  commitPosFirstLogin:async(_client,args)=>{calls.push(args);return committed(args.localAuthorizationPolicy);},
  publishPosRuntimeLeaseSuccess:async()=>({status:'ok'}),markPosRuntimeSession:async()=>true,
  recordPosFirstLoginFailure:async()=>true,writePosRuntimeAudit:async()=>true};
 const core=load('src/server/pos-auth/first-login-core.ts',{
  './runtime-boundary':runtime,'@/server/shop-admin/staff-credentials':{verifyStaffCredential:async()=>true},
  './tokens':{generatePosSecret:k=>'qa-'+k,hashPosSecret:()=> 'sha256:'+'a'.repeat(64)},
  './shop-payload':{buildPosPolicyPayload:()=>({}),buildPosShopPayload:s=>({shopId:s.shop_id,shopCode:s.shop_code,shopName:s.shop_name})}});
 const request={shopCode:'SHOP019',staffCode:'STAFF019',credential:'qa-only',
  device:{deviceIdentifier:'qa-persistent-device',displayName:'QA'}};
 const persistent=await core.handlePosFirstLoginWithClient({}, {...request,localAuthorizationPolicy:POLICY});
 assert.equal(persistent.status,200);assert.equal(persistent.body.localAuthorizationPolicy,POLICY);
 assert.equal(persistent.body.session.expiresAt,FOREVER);
 const legacy=await core.handlePosFirstLoginWithClient({},request);
 assert.equal(legacy.status,200);assert.equal(legacy.body.localAuthorizationPolicy,undefined);
 const unknown=await core.handlePosFirstLoginWithClient({}, {...request,localAuthorizationPolicy:'license-unknown'});
 assert.equal(unknown.status,400);assert.equal(calls.length,2);
});
