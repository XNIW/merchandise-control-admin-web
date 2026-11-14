import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {load} from './helpers/payment-history-harness.mjs';
const c=load('src/server/payment-history/baseline-source-transfer.ts');
const diagnostic=load('src/server/payment-history/baseline-source-diagnostic.ts');
const id=n=>`${n}0000000-0000-4000-8000-000000000019`;
const bytes=Buffer.from('synthetic transport bytes; archive validity remains a worker check');
const sha=createHash('sha256').update(bytes).digest('hex');
function fixture(sourceKind='baseline'){
 const meta={upload_id:id(5),byte_length:String(bytes.length),sha256:sha,state:'pending',file_name:sourceKind==='getnet'?'synthetic.xlsx':'synthetic.w7history.zip'};
 const state={auth:0,sign:0,put:0,existing:false,denyFresh:false,freshMutation:null,targetHost:'synthetic.supabase.co',putOk:true,firstMutation:null};
 const path=`history/${id(1)}/${id(5)}`;
 const port={storageOrigin:'https://synthetic.supabase.co',
  request:async input=>{
   state.auth++;assert.equal(input.operation,sourceKind==='getnet'?'web_upload_status':'baseline_upload_status');assert.equal(input.payload.upload_id,id(5));
   assert.equal(input.deviceToken,'synthetic-device-token-019');assert.equal(input.sessionToken,'synthetic-session-token-019');
   if(state.auth===2&&state.denyFresh)throw Object.assign(Error('auth_denied'),{code:'auth_denied',status:403});
   const reply={ok:true,shop_id:id(1),device_id:id(2),session_id:id(4),result:{...meta}};
   if(state.auth===1&&state.firstMutation)state.firstMutation(reply);
   if(state.auth===2&&state.freshMutation)state.freshMutation(reply);
   return reply;
  },
  storage:{info:async key=>{assert.equal(key,path);return state.existing?{data:{id:'synthetic'},error:null}:{data:null,error:{status:404}};},
   createSignedUploadUrl:async(key,options)=>{state.sign++;assert.equal(key,path);assert.equal(options.upsert,false);return {data:{signedUrl:`https://${state.targetHost}/storage/v1/object/upload/sign/payment-history-sources/${path}?token=synthetic-server-only-token`},error:null};}},
  put:async(url,body,signal)=>{state.put++;assert.equal(new URL(url).hostname,'synthetic.supabase.co');assert.equal(signal.aborted,false);assert.deepEqual(Buffer.from(body),bytes);return {ok:state.putOk,status:state.putOk?200:500};}
 };
 function request({body=bytes,headers={},signal}={}){return new Request('https://admin.invalid/api/pos/payment-history/source',{method:'POST',headers:{
  'content-type':sourceKind==='getnet'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/zip','content-length':String(bytes.length),'x-history-upload-id':id(5),'x-history-device-id':id(2),'x-history-session-id':id(4),
  'x-history-device-token':'synthetic-device-token-019','x-history-session-token':'synthetic-session-token-019',...headers},body,signal});}
 return {port,state,request};
}
test('POS web source reuses the exact authorized transport for XLSX only',async()=>{const x=fixture('getnet');const result=await c.transferHistorySource(x.request(),x.port,'getnet');assert.equal(result.status,200);assert.equal(x.state.auth,2);assert.equal(x.state.put,1);});
test('a baseline archive cannot select the web XLSX source lane',async()=>{const x=fixture('getnet');x.state.firstMutation=r=>r.result.file_name='synthetic.w7history.zip';await assert.rejects(()=>c.transferHistorySource(x.request(),x.port,'getnet'),e=>e.code==='history_baseline_source_unavailable');assert.equal(x.state.put,0);});
test('web source metadata remains bound after reading its bytes',async()=>{const x=fixture('getnet');x.state.freshMutation=r=>r.result.file_name='other.xlsx';await assert.rejects(()=>c.transferHistorySource(x.request(),x.port,'getnet'),e=>e.code==='history_baseline_source_changed');assert.equal(x.state.put,0);});
test('the BFF authenticates twice, hashes exact source bytes and sends only the owned server target to Storage',async()=>{
 const f=fixture(),result=await c.transferHistorySource(f.request(),f.port);
 assert.equal(result.status,200);assert.equal(result.body.upload_id,id(5));assert.equal(result.body.already_present,false);
 assert.equal(f.state.auth,2);assert.equal(f.state.put,1);assert.equal(f.state.sign,1);
 assert.equal(JSON.stringify(result).includes('token'),false);assert.equal(JSON.stringify(result).includes('supabase'),false);
});
test('size, media type and upload identity are rejected before authentication or Storage work',async()=>{
 for(const headers of [{'content-type':'application/json'},{'content-length':'20971521'},{'content-length':'0'},{'x-history-upload-id':'not-a-uuid'}]){
  const f=fixture();await assert.rejects(()=>c.transferHistorySource(f.request({headers}),f.port));assert.equal(f.state.auth,0);assert.equal(f.state.put,0);
 }
});
test('an initial rejected, mismatched or unavailable source cannot be uploaded',async()=>{
 for(const change of [r=>r.result.state='rejected',r=>r.result.upload_id=id(9),r=>r.result.byte_length='100']){
  const f=fixture();f.state.firstMutation=change;await assert.rejects(()=>c.transferHistorySource(f.request(),f.port));assert.equal(f.state.sign,0);assert.equal(f.state.put,0);
 }
});
test('body length and digest mismatch cannot reach Storage',async()=>{
 for(const body of [Buffer.from(bytes.toString().replace('bytes','BYTES')),Buffer.from('short'),Buffer.concat([bytes,Buffer.from('extra')])]){
  const f=fixture();await assert.rejects(()=>c.transferHistorySource(f.request({body}),f.port));assert.equal(f.state.put,0);assert.equal(f.state.sign,0);
 }
});
test('current revocation after body transfer denies the original source without publishing it',async()=>{
 const f=fixture();f.state.denyFresh=true;
 await assert.rejects(()=>c.transferHistorySource(f.request(),f.port),e=>e.code==='auth_denied');assert.equal(f.state.auth,2);assert.equal(f.state.put,0);
});
test('fresh scope or immutable metadata substitution is rejected before Storage',async()=>{
 for(const change of [r=>r.device_id=id(9),r=>r.shop_id=id(9),r=>r.session_id=id(9),r=>r.result.sha256='b'.repeat(64),r=>r.result.state='expired']){
  const f=fixture();f.state.freshMutation=change;await assert.rejects(()=>c.transferHistorySource(f.request(),f.port));assert.equal(f.state.put,0);assert.equal(f.state.sign,0);
 }
});
test('an existing owned object recovers a lost upload ACK without overwrite or a new signed URL',async()=>{
 const f=fixture();f.state.existing=true;const result=await c.transferHistorySource(f.request(),f.port);
 assert.equal(result.status,409);assert.equal(result.body.already_present,true);assert.equal(result.body.upload_id,id(5));assert.equal(f.state.put,0);assert.equal(f.state.sign,0);
});
test('a foreign storage target is rejected server-side and never reaches POS',async()=>{
 const f=fixture();f.state.targetHost='other.invalid';await assert.rejects(()=>c.transferHistorySource(f.request(),f.port));assert.equal(f.state.put,0);
});
test('a failed server PUT is not an upload acknowledgement',async()=>{
 const f=fixture();f.state.putOk=false;await assert.rejects(()=>c.transferHistorySource(f.request(),f.port),e=>e.code==='history_baseline_upload_failed'&&e.status===503);
});
test('a cancelled incoming transfer cannot send its source to Storage',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(()=>c.transferHistorySource(f.request({signal:controller.signal}),f.port));assert.equal(f.state.put,0);
});

test('phase observation preserves the same authenticated transfer and cannot fail it',async()=>{
 const f=fixture(),phases=[];f.port.observePhase=value=>phases.push(value);
 const result=await c.transferHistorySource(f.request(),f.port);
 assert.equal(result.status,200);assert.equal(f.state.auth,2);assert.equal(f.state.put,1);
 assert.deepEqual(phases,['validation','authorize_source','read_source','hash_source','reauthorize_source','prepare_storage_target','put_storage_source']);
 const broken=fixture();broken.port.observePhase=()=>{throw Error('synthetic diagnostic sink failure');};
 assert.equal((await c.transferHistorySource(broken.request(),broken.port)).status,200);assert.equal(broken.state.put,1);
});
test('a target refusal identifies its phase without leaking a signed URL or replacing the refusal',async()=>{
 const f=fixture();let phase;f.port.observePhase=value=>{phase=value;};f.state.targetHost='other.invalid';
 await assert.rejects(()=>c.transferHistorySource(f.request(),f.port),error=>{
  assert.equal(error.message,'history_baseline_upload_target_invalid');
  assert.deepEqual({...diagnostic.historySourceFailureAudit(error,phase,123.9)},{event:'history.source.failure',phase:'prepare_storage_target',code:'history_baseline_upload_target_invalid',elapsed_ms:123});return true;
 });assert.equal(f.state.put,0);
});
test('failure metadata retains only closed codes and phases, never arbitrary exception or credential content',()=>{
 for(const error of [Error('synthetic-secret-019 https://other.invalid/?token=synthetic'),Object.assign(Error('synthetic-secret-019'),{code:'auth_denied'}),{message:'auth_denied',token:'synthetic-secret-019'}]){
  const result=diagnostic.historySourceFailureAudit(error,'put_storage_source',Number.NaN);
  assert.deepEqual({...result},{event:'history.source.failure',phase:'put_storage_source',code:'history_source_unexpected_failure',elapsed_ms:0});
  assert.equal(JSON.stringify(result).includes('synthetic'),false);
 }
 assert.equal(diagnostic.historySourceFailureAudit(Error('auth_denied'),'authorize_source',0).code,'auth_denied');
 assert.equal(diagnostic.historySourceFailureAudit(new DOMException('synthetic-secret-019','AbortError'),'read_source',2).code,'history_source_aborted');
 assert.equal(diagnostic.historySourceFailureAudit(new DOMException('synthetic-secret-019','TimeoutError'),'prepare_storage_target',2).code,'history_source_timeout');
 assert.equal(diagnostic.historySourceFailureAudit(new TypeError('synthetic-secret-019'),'put_storage_source',2).code,'history_source_network_or_runtime');
 assert.equal(diagnostic.historySourceFailureAudit(Error('auth_denied'),'synthetic-secret-019',2).phase,'unknown');
});
test('the existing audit stage contains only closed phase/code and elapsed time, without arbitrary details',()=>{
 assert.equal(diagnostic.historySourceFailureStage(Error('history_baseline_upload_target_invalid'),'prepare_storage_target',123.9),'history_source.prepare_storage_target.history_baseline_upload_target_invalid.123ms');
 const stage=diagnostic.historySourceFailureStage(Error('synthetic-secret-019'),'synthetic-secret-019',Number.NaN);
 assert.equal(stage,'history_source.unknown.history_source_unexpected_failure.0ms');assert.equal(stage.includes('synthetic'),false);
});
