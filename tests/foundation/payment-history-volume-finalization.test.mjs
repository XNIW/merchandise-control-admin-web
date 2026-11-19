import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {load} from './helpers/payment-history-harness.mjs';
import {verifyFinalizationSqlBudget,measuredDeviceRequest,finalizeVolumeBaseline,observeFinalizationCanonical} from '../../scripts/testing/asus019-history-volume-finalization.mjs';
const {projectBaselineSqlResult}=load('src/server/payment-history/local-baseline-contract.ts');
const {validateDeviceHistoryResult}=load('src/server/payment-history/replica-contract.ts');
const {isComposedHistoryV2}=load('src/server/payment-history/device-composed-contract.ts');
const {windowsFieldHash}=load('src/server/payment-history/ledger-contract.ts');
const sha=v=>createHash('sha256').update(v).digest('hex'),id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const shop=id(1),runId=id(2),device=id(3),dataset=id(4),batch=id(5),merchant=id(6),applyKey=id(7),snapshotKey=id(8),sourceSnapshot=id(9),operationId=id(10),lineage=id(11),clientSha='c4015dd1d7deac74c38bcb4532532ea511ba1880';
const manifest={deviceId:device,localDatasetId:'synthetic-volume',dataRevision:'25947',restoreEpoch:'1',restoreLineageId:lineage};
const context={dataset_id:dataset,writer_epoch:'1'},receipt={operation_id:operationId,kind:'migrate',source_run_id:runId,source_snapshot_id:sourceSnapshot,dataset_id:dataset,revision:'1',writer_epoch:'1',new_active:25947,new_inactive:0,duplicates:0,new_batches:1,original_evidence_level:'legacy_attested',baseline_context:{state:'baseline_verified',source_snapshot_id:sourceSnapshot,local_dataset_id:manifest.localDatasetId,local_revision:manifest.dataRevision,restore_epoch:'1',restore_lineage_id:lineage,writer_epoch:'1'}};
const entity=(kind,payload)=>({kind,id:payload.id,digest:windowsFieldHash(['history-replica-entity-v1',kind,...Object.values(payload).map(v=>v===null?'null':String(v))]),payload});
const batchEntity=entity('batch',{id:batch,origin:'local_migration',state:'active',apply_operation_id:operationId,created_revision:'1',cancelled_revision:null,created_utc_ms:'1'});
const entities=[batchEntity,...Array.from({length:25947},(_,i)=>entity('movement',{
 id:id(i+100),merchant_id:merchant,batch_id:batch,identity_key:sha([shop,'getnet',merchant,'getnet.legacy.transaction',String(i)].join('\u001f')),
 economic_digest:windowsFieldHash(['historical-economics-v1','1','1000','10','0','990','Sale','CONFIRMADA']),active:true,business_ticks:'1',gross_clp:'1000',fee_clp:'10',fee_vat_clp:'0',net_clp:'990',movement_kind:'Sale',transaction_state:'CONFIRMADA',external_namespace:'getnet.legacy.transaction',external_id:String(i),source_sheet:'Synthetic',source_row:'2',timestamp_raw:'synthetic',offset_minutes:null,occurred_at_utc:null,time_interpretation:null,time_policy_version:null,time_evidence_reference:null,card_subtype:'Debit',created_revision:'1'
}))];
const checksum=sha(['history-replica-snapshot-v1',shop,dataset,'1','1',''].join('\n')+entities.map(e=>e.kind+'|'+e.id+'|'+e.digest+'\n').join(''));
function fixture(change=()=>{},adaptRequest=request=>request){
 const calls=[],report={steps:[]};let ordinal=0;
 const request=async(operation,payload)=>{
  calls.push({operation,payload});let value;
  if(operation==='baseline_review')value={can_apply:true,review_digest:'a'.repeat(64)};
  else if(operation==='baseline_apply')value=structuredClone(receipt);
  else if(operation==='baseline_receipt')value={receipt:calls.some(c=>c.operation==='baseline_apply')?structuredClone(receipt):null};
  else if(operation==='snapshot_start')value={cursor:id(99),dataset_id:dataset,revision:'1',writer_epoch:'1',checksum,movements:25947,batches:1,mode:'snapshot'};
  else if(operation==='page'){
   const part=entities.slice(ordinal,ordinal+200);ordinal+=part.length;const done=ordinal===entities.length;
   value={cursor:payload.cursor,next_cursor:done?null:id(100000+ordinal),done,dataset_id:dataset,revision:'1',writer_epoch:'1',checksum,movements:25947,batches:1,entities:part};
  }else if(operation==='replica_ack')value={acknowledged:true,revision:'1',writer_epoch:'1'};
  else throw Error('Unexpected operation');change(operation,value,payload);return value;
 };
 return {calls,report,run:()=>finalizeVolumeBaseline({request:adaptRequest(request),manifest,shop,runId,context,applyKey,snapshotKey,clientSha,validateBaseline:projectBaselineSqlResult,validateReplica:validateDeviceHistoryResult,report})};
}
test('full-volume finalization matches c401 receipt-first order and130pages of200, validating contracts and checksum before ACK',async()=>{
 const f=fixture();await f.run();assert.equal(f.report.status,'PASS_FULL_VOLUME_FINALIZATION');assert.equal(f.report.applyAttempts,1);assert.equal(f.report.applyOutcome,'ACKNOWLEDGED');assert.equal(f.report.replica.movements,25947);assert.equal(f.report.replica.pages,130);assert.equal(f.report.replica.pageSize,200);assert.equal(f.report.receipt.sha256,f.report.receipt.readbackSha256);
 assert.deepEqual(f.calls.slice(0,4).map(c=>c.operation),['baseline_receipt','baseline_review','baseline_apply','baseline_receipt']);assert.equal(f.report.preflightReceipt.receiptAbsent,true);
 assert.deepEqual(f.calls.filter(c=>c.operation==='baseline_receipt').map(c=>c.payload.request_key),[applyKey,applyKey]);
 assert.equal(f.calls.find(c=>c.operation==='snapshot_start').payload.page_size,200);
 assert.deepEqual(f.calls.filter(c=>c.operation==='baseline_apply').map(c=>c.payload.request_key),[applyKey]);
 const ack=f.calls.at(-1);assert.equal(ack.operation,'replica_ack');assert.equal(ack.payload.checksum,checksum);assert.equal(ack.payload.client_build_sha,clientSha);
 assert.equal(JSON.stringify(f.report).includes('gross_clp'),false);
});

test('actual SDK uses the production selector for the complete receipt Apply snapshot page ACK chain',async t=>{
 const wire=[],timeouts=[],timeout=AbortSignal.timeout;
 t.mock.method(AbortSignal,'timeout',milliseconds=>{timeouts.push(milliseconds);return timeout(milliseconds);});
 const scope={p_shop_id:shop,p_shop_device_id:device,p_staff_id:id(20),p_pos_session_id:id(21),p_device_token_hash:'synthetic-device-hash',p_session_token_hash:'synthetic-session-hash',p_credential_version:1};
 const f=fixture(()=>{},request=>{
  const db=createClient('http://127.0.0.1:54321','synthetic-owned-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
   const body=JSON.parse(init.body);wire.push({path:new URL(url).pathname,method:init.method,body,signal:init.signal});
   const result=await request(body.p_operation,body.p_payload);
   return new Response(JSON.stringify({ok:true,shop_id:shop,device_id:device,result}),{status:200,headers:{'Content-Type':'application/json'}});
  }}});
  return (operation,payload)=>measuredDeviceRequest({db,scope,operation,payload,steps:f.report.steps,isComposedHistoryV2});
 });
 await f.run();
 assert.equal(f.report.status,'PASS_FULL_VOLUME_FINALIZATION');assert.equal(wire.length,136);assert.equal(f.report.steps.length,136);
 for(let i=0;i<wire.length;i++){
  const expected=isComposedHistoryV2(f.calls[i].operation)?'payment_history_device_http_v2':'payment_history_device_v1';
  assert.equal(wire[i].path,'/rest/v1/rpc/'+expected,f.calls[i].operation);
  assert.equal(wire[i].method,'POST');assert.deepEqual(wire[i].body,{...scope,p_operation:f.calls[i].operation,p_payload:f.calls[i].payload});
  assert.ok(wire[i].signal instanceof AbortSignal);assert.equal(wire[i].signal.aborted,false);
 }
 assert.deepEqual(timeouts,Array(136).fill(15000));assert.equal(wire.filter(w=>w.body.p_operation==='baseline_apply').length,1);
 assert.equal(wire.filter(w=>w.body.p_operation==='page').length,130);assert.equal(f.report.replica.pageSize,200);
 assert.equal(f.report.receipt.sha256,f.report.receipt.readbackSha256);assert.equal(f.report.replica.checksum,checksum);assert.equal(f.report.replica.acknowledged,true);
});

test('measured device requests require the explicit frozen selector before any RPC',async()=>{
 let calls=0;const steps=[];
 await assert.rejects(()=>measuredDeviceRequest({db:{rpc(){calls++;throw Error('unexpected RPC');}},scope:{},operation:'snapshot_start',payload:{},steps}),/finalization_rpc_selector/);
 assert.equal(calls,0);assert.deepEqual(steps,[]);
});
for(const [name,change,phase] of [
 ['preexisting receipt',(op,v)=>{if(op==='baseline_receipt'&&v.receipt===null)v.receipt=structuredClone(receipt);},'baseline_receipt_preflight'],
 ['blocked review',(op,v)=>{if(op==='baseline_review')v.can_apply=false;},'baseline_review'],
 ['foreign receipt',(op,v)=>{if(op==='baseline_apply')v.source_run_id=id(90);},'baseline_apply'],
 ['changed receipt readback',(op,v)=>{if(op==='baseline_receipt'&&v.receipt!==null)v.receipt.operation_id=id(90);},'baseline_receipt'],
 ['partial snapshot',(op,v)=>{if(op==='snapshot_start')v.movements--;},'snapshot_start'],
 ['repeated page entity',(op,v)=>{if(op==='page')v.entities=[v.entities[0],...v.entities];},'page'],
 ['changed entity digest',(op,v)=>{if(op==='page')v.entities=[{...v.entities[0],digest:'b'.repeat(64)},...v.entities.slice(1)];},'page'],
 ['wrong ACK revision',(op,v)=>{if(op==='replica_ack')v.revision='2';},'replica_ack']
])test('finalization rejects '+name+' without a second Apply',async()=>{
 const f=fixture(change);await assert.rejects(f.run);assert.equal(f.report.status,'FAIL');assert.equal(f.report.phase,phase);assert.ok(f.calls.filter(c=>c.operation==='baseline_apply').length<=1);
 if(phase!=='replica_ack')assert.equal(f.calls.some(c=>c.operation==='replica_ack'),false);
});
test('actual PostgREST client retains HTTP500/57014 and never retries the Apply',async()=>{
 let requests=0;const scope={p_shop_id:shop,p_shop_device_id:device},steps=[];
 const db=createClient('http://127.0.0.1:54321','synthetic-owned-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(_url,init)=>{requests++;assert.ok(init.signal);return new Response(JSON.stringify({code:'57014',message:'private-marker',details:'private-marker',hint:'private-marker'}),{status:500,headers:{'Content-Type':'application/json'}});}}});
 await assert.rejects(()=>measuredDeviceRequest({db,scope,operation:'baseline_apply',payload:{},steps,isComposedHistoryV2}),/finalization_rpc_failed/);
 assert.equal(requests,1);assert.equal(steps[0].httpStatus,500);assert.equal(steps[0].sqlState,'57014');assert.equal(steps[0].operation,'baseline_apply');assert.ok(steps[0].elapsedMs>=0);assert.equal(JSON.stringify(steps).includes('private-marker'),false);
});
test('failed Apply retains unknown outcome and phase without receipt/page requests',async()=>{
 const f=fixture(operation=>{if(operation==='baseline_apply')throw Error('history_volume_finalization_rpc_failed');});
 await assert.rejects(f.run,/finalization_rpc_failed/);assert.equal(f.report.status,'FAIL');assert.equal(f.report.phase,'baseline_apply');assert.equal(f.report.applyOutcome,'OUTCOME_UNKNOWN');
 assert.equal(f.report.applyAttempts,1);assert.deepEqual(f.calls.map(c=>c.operation),['baseline_receipt','baseline_review','baseline_apply']);assert.equal(f.report.receipt,'NOT_RUN');assert.equal(f.report.replica,'NOT_RUN');
});
test('RED preserves the original failure and one rollback metadata read, even if that read fails',()=>{
 for(const failRead of [false,true]){
  let reads=0;const originalError=Error('history_volume_finalization_rpc_failed'),report={phase:'baseline_apply',steps:[{operation:'baseline_apply',httpStatus:500,sqlState:'57014'}]};
  assert.throws(()=>observeFinalizationCanonical({originalError,report,read:()=>{reads++;if(failRead)throw Error('secondary-private-marker');return {state:'review_ready',applyKeyPresent:false,receiptPresent:false,runtimeRevision:'0',movements:0,batches:0,sourceSnapshots:0,replicaEvents:0,changeSets:0,acks:0,ackCount:0};}}),error=>error===originalError);
  assert.equal(reads,1);assert.equal(report.phase,'baseline_apply');assert.equal(report.steps[0].sqlState,'57014');assert.equal(report.canonical.status,failRead?'UNAVAILABLE':'OBSERVED');assert.equal(JSON.stringify(report).includes('private-marker'),false);
 }
});
test('missing rollback metadata is unavailable, never a fabricated successful read',()=>{
 const report={};assert.throws(()=>observeFinalizationCanonical({report,read:()=>null}),/readback_unavailable/);assert.equal(report.canonical.status,'UNAVAILABLE');
});
test('8s SQL metadata rejects role, database and function timeout overrides',()=>{
 const metadata={authenticator:'8s',authenticated:'8s',serviceRole:null,databaseOverrides:0,functionOverrides:0};assert.equal(verifyFinalizationSqlBudget(metadata).requestTimeoutMs,15000);
 for(const change of [{authenticator:'0'},{authenticated:'10s'},{serviceRole:'15s'},{databaseOverrides:1},{functionOverrides:1}])assert.throws(()=>verifyFinalizationSqlBudget({...metadata,...change}),/sql_budget/);
});
test('existing volume gate publishes artifacts only after finalization and keeps Worker budget plus exact checkout input',()=>{
 const source=readFileSync('scripts/testing/asus019-history-volume.mjs','utf8'),workflow=readFileSync('.github/workflows/ci.yml','utf8');
 assert.ok(source.indexOf('history_volume_published_without_apply')<source.indexOf('await finalizeVolumeBaseline'));
 assert.ok(source.indexOf('await finalizeVolumeBaseline')<source.indexOf("report.status='PASS_REAL_GATEWAY_SQL_FULL_VOLUME'"));
 assert.match(source,/measured.elapsedMs<120000/);assert.match(workflow,/node scripts\/testing\/asus019-history-volume\.mjs\s+--owned-workdir[^\n]+\s+--client-repo "\$GITHUB_WORKSPACE\/client"/);
});
