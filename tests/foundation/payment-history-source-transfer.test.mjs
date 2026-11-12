import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {load} from './helpers/payment-history-harness.mjs';
const c=load('src/server/payment-history/baseline-source-transfer.ts');
const id=n=>`${n}0000000-0000-4000-8000-000000000019`;
const bytes=Buffer.from('synthetic transport bytes; archive validity remains a worker check');
const sha=createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const meta={upload_id:id(5),byte_length:String(bytes.length),sha256:sha,state:'pending'};
 const state={auth:0,sign:0,put:0,existing:false,denyFresh:false,freshMutation:null,targetHost:'synthetic.supabase.co',putOk:true,firstMutation:null};
 const path=`history/${id(1)}/${id(5)}`;
 const port={storageOrigin:'https://synthetic.supabase.co',
  request:async input=>{
   state.auth++;assert.equal(input.operation,'baseline_upload_status');assert.equal(input.payload.upload_id,id(5));
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
  'content-type':'application/zip','content-length':String(bytes.length),'x-history-upload-id':id(5),'x-history-device-id':id(2),'x-history-session-id':id(4),
  'x-history-device-token':'synthetic-device-token-019','x-history-session-token':'synthetic-session-token-019',...headers},body,signal});}
 return {port,state,request};
}
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
