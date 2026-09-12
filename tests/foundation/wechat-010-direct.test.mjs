import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import test from "node:test";
import vm from "node:vm";
const require=createRequire(import.meta.url); const ts=require("typescript");
function load(file,mocks={}) {
  const output=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(output,{module:mod,exports:mod.exports,process,URL,URLSearchParams,Buffer,Date,AbortSignal,TextDecoder,Uint8Array,Request,
    require:(name)=>name==="server-only"?{}:Object.hasOwn(mocks,name)?mocks[name]:require(name)});
  return mod.exports;
}
const protocol="wechat-mini-code2session-v1";
const actor="00000000-0000-4000-8000-000000001001";
const device="10000000-0000-4000-8000-000000001001";
const proof="20000000-0000-4000-8000-000000001001";
const config={configured:true,loginReady:true,enrollmentReady:true,appId:"wx0000000000000001",appSecret:"0".repeat(32),identityKey:"k".repeat(43),common:{hashSalt:"s".repeat(32),miniAllowedProfileIds:[actor],miniAllowedShopIds:[device]}};
const upstream={openid:"isolated_test_openid_123456",session_key:Buffer.alloc(16).toString("base64")};
const code=load("src/server/auth/wechat-code2session.ts");
test("code2Session accepts only bounded success and scopes its opaque identity by AppID and key",async()=>{
  let query;
  const hash=await code.verifyWeChatMiniCode("fresh_code",config,async(q)=>{query=q;return upstream;});
  assert.match(hash,/^v1:[0-9a-f]{64}$/);
  assert.equal(query.get("grant_type"),"authorization_code");
  assert.equal(query.get("appid"),config.appId);
  assert.equal(hash.includes(upstream.openid),false);
  assert.notEqual(hash,await code.verifyWeChatMiniCode("fresh_code",{...config,appId:"wx0000000000000002"},async()=>upstream));
  assert.notEqual(hash,await code.verifyWeChatMiniCode("fresh_code",{...config,identityKey:"j".repeat(43)},async()=>upstream));
  for(const value of [null,[],{}, {...upstream,errcode:40029},{...upstream,errcode:"0"},{...upstream,openid:""},{...upstream,session_key:"bad"},{...upstream,openid:"x".repeat(129)}])assert.equal(await code.verifyWeChatMiniCode("fresh_code",config,async()=>value),null);
  assert.equal(await code.verifyWeChatMiniCode("fresh_code",config,async()=>{throw new Error("secret-bearing upstream error");}),null);
  assert.equal(await code.verifyWeChatMiniCode("https://external.invalid/code",config,async()=>{throw new Error("must not call");}),null);
});
test("Admin uses validated personal session; origin and consent guard pairing, revocation survives enrollment OFF",async()=>{
  const calls=[];let getUsers=0;let authenticated=true;let enabled=false;let response=[];
  const coreModule=core().subject;
  const subject=load("src/server/auth/wechat-mini-admin.ts",{
    "./wechat-mini-direct-config":{resolveMiniDirectConfig:()=>({...config,enrollmentReady:enabled,common:{...config.common,miniAllowedProfileIds:enabled?[actor]:[]}})},
    "./wechat-mini-direct":coreModule,
    "@/lib/supabase/server":{createSupabaseServerClient:async()=>({auth:{getUser:async()=>{getUsers++;return{data:{user:authenticated?{id:actor}:null},error:null};}},rpc:async(name,params)=>{calls.push({name,params});return{data:response,error:null};}})},
  });
  const request=(origin="https://admin.example")=>new Request("https://admin.example/api/auth/wechat/mini/admin",{headers:{origin,"sec-fetch-site":"same-origin"}});
  assert.equal((await subject.miniAdminAction(request("https://relay.invalid"),{action:"list"})).ok,false);
  assert.equal(getUsers,0);
  authenticated=false;assert.equal((await subject.miniAdminAction(request(),{action:"list"})).ok,false);assert.equal(calls.length,0);
  authenticated=true;
  assert.equal((await subject.miniAdminAction(request(),{action:"list"})).ok,true);
  assert.equal((await subject.miniAdminAction(request(),{action:"start",consent:true})).code,"provider_not_configured");
  assert.equal((await subject.miniAdminAction(request(),{action:"unlink",mappingId:proof})).ok,false);
  response=true;
  assert.equal((await subject.miniAdminAction(request(),{action:"unlink",mappingId:proof,consent:true,profileId:"injected"})).ok,true);
  assert.equal(calls.at(-1).name,"wechat_mini_mapping_unlink_v1");
  assert.deepEqual(Object.keys(calls.at(-1).params),["p_mapping_id"]);
  enabled=true;response={ok:false,code:"pairing_expired"};
  assert.equal((await subject.miniAdminAction(request(),{action:"status",pairingId:proof,adminCapability:"c".repeat(43)})).code,"pairing_expired");
});
test("fixed HTTPS transport does not follow redirects, bounds bytes, and sanitizes network errors",async()=>{
  for(const scenario of ["ok","redirect","oversize","error"]){
    let observed;
    const subject=load("src/server/auth/wechat-code2session.ts",{"node:https":{request(options,callback){
      observed=options;const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
        if(scenario==="error"){req.emit("error",new Error("secret URL"));return;}
        const res=new EventEmitter();res.statusCode=scenario==="redirect"?302:200;res.destroy=()=>{};
        callback(res);res.emit("data",Buffer.from(scenario==="oversize"?"x".repeat(4097):JSON.stringify(upstream)));res.emit("end");
      });return req;
    }}});
    const value=await subject.verifyWeChatMiniCode("fresh_code",config);
    assert.equal(observed.hostname,"api.weixin.qq.com");assert.equal(observed.port,443);assert.equal(observed.method,"GET");
    assert.equal(value!==null,scenario==="ok");
  }
});
function core({claim=true,verified=true,issue}={}){
  const calls=[];let verifies=0;
  const subject=load("src/server/auth/wechat-mini-direct.ts",{
    "./wechat-mini-direct-config":{miniDirectProtocol:protocol,resolveMiniDirectConfig:()=>config},
    "./wechat-code2session":{verifyWeChatMiniCode:async()=>{verifies++;return verified?"v1:"+"a".repeat(64):null;}},
    "./wechat-mini-session":{callTrustedWeChatRpc:async(name,params)=>{calls.push({name,params});
      if(name==="wechat_mini_proof_create_v1")return{ok:true,proof_id:proof,expires_at:new Date(Date.now()+299000).toISOString()};
      if(name==="wechat_mini_proof_claim_v1")return claim;
      if(name==="wechat_mini_proof_verify_v1")return true;
      if(name==="wechat_mini_direct_issue_v1")return issue??{ok:true,protocol,actor_profile_id:actor,account_fingerprint:"a".repeat(64),session_id:device,generation:1,expires_at:new Date(Date.now()+899000).toISOString()};
      return true;
    }},
  });return{subject,calls,verifies:()=>verifies};
}
const body={protocol,deviceId:device,verifier:"v".repeat(43),challengeId:proof,code:"fresh_code"};
test("challenge binds pairing context and stores only digests",async()=>{
  const {subject,calls}=core();
  assert.equal((await subject.createMiniDirectChallenge({...body,purpose:"pair_claim"})).ok,false);
  assert.equal((await subject.createMiniDirectChallenge({...body,purpose:"pair_claim",transferCode:"t".repeat(43)})).ok,true);
  assert.match(calls[0].params.p_transfer_hash,/^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(calls).includes(body.verifier),false);
  assert.equal((await subject.createMiniDirectChallenge({...body,purpose:"login",pairingId:proof})).ok,false);
});
test("proof is atomically claimed before any upstream verification and replay cannot issue",async()=>{
  const denied=core({claim:false}); assert.equal((await denied.subject.exchangeMiniDirect(body)).ok,false);
  assert.equal(denied.verifies(),0);assert.equal(denied.calls.length,1);
  const failed=core({verified:false});assert.equal((await failed.subject.exchangeMiniDirect(body)).ok,false);assert.equal(failed.calls.length,1);
  const good=core();const result=await good.subject.exchangeMiniDirect({...body,profileId:"attacker-selected"});
  assert.equal(result.ok,true);assert.equal(result.session.user.provider,"wechat-mini");
  assert.deepEqual(good.calls.map(c=>c.name),["wechat_mini_proof_claim_v1","wechat_mini_proof_verify_v1","wechat_mini_direct_issue_v1"]);
  assert.equal(JSON.stringify(good.calls).includes("attacker-selected"),false);
  assert.equal("refreshToken" in result.session,false);
});
test("uncertain issuance revokes the candidate token and never exposes upstream details",async()=>{
  const {subject,calls}=core({issue:{ok:true,expires_at:"invalid",secret:"never expose"}});
  const result=await subject.exchangeMiniDirect(body);
  assert.equal(result.ok,false);assert.equal(calls.at(-1).name,"wechat_mini_session_revoke_v1");
  assert.equal(calls.at(-1).params.p_token_hash,calls.at(-2).params.p_token_hash);
  assert.equal(JSON.stringify(result).includes("never expose"),false);
});
test("enrollment OFF and absent Mini consent stop before code verification",async()=>{
  const {subject,calls}=core();
  assert.equal((await subject.confirmMiniPairing({...body,pairingId:proof,miniCapability:"c".repeat(43)})).ok,false);
  assert.equal((await subject.claimMiniPairing({...body,transferCode:"t".repeat(43)},{...config,enrollmentReady:false})).ok,false);
  assert.equal(calls.length,0);
});
