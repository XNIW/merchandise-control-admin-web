import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {load} from './helpers/payment-history-harness.mjs';
const c=load('src/server/payment-history/device-composed-contract.ts');
const id=n=>`${n}0000000-0000-4000-8000-000000000019`;
const scope={shopId:id(1),deviceId:id(2),staffId:id(3),sessionId:id(4),credentialVersion:7};
test('legacy read operations keep their qualified v1 boundary',()=>{
 for(const op of ['authority','snapshot_start','delta_start','page','replica_ack','freeze_ack'])assert.equal(c.isComposedHistoryV2(op),false);
 assert.equal(c.validateComposedDeviceRequest('authority',{},scope).constructor.name,'Object');
});
test('the complete bound financial and baseline operations select v2',()=>{
 for(const op of ['local_prepare','local_stage','local_review','local_authorize','local_receipt','local_reconcile','local_abort',
  'baseline_context','baseline_upload_create','baseline_upload_ready','baseline_upload_status','baseline_start','baseline_status','baseline_review','baseline_apply','baseline_receipt','baseline_recover'])assert.equal(c.isComposedHistoryV2(op),true,op);
});
test('raw resume, cancellation and witness-free delivery are unavailable',()=>{
 for(const op of ['baseline_resume','baseline_cancel','local_deliver','local_reconcile_v1']){
  assert.equal(c.COMPOSED_DEVICE_OPERATIONS.includes(op),false);
  assert.throws(()=>c.validateComposedDeviceRequest(op,{},scope));
 }
});
test('initial baseline context uses the bounded current lineage contract',()=>{
 const p={local_dataset_id:'synthetic-local',data_revision:'9007199254740993',restore_epoch:'0',restore_lineage_id:id(5)};
 assert.equal(c.validateComposedDeviceRequest('baseline_context',p,scope).data_revision,'9007199254740993');
 assert.throws(()=>c.validateComposedDeviceRequest('baseline_context',{...p,extra:true},scope));
 assert.throws(()=>c.validateComposedDeviceRequest('baseline_context',{...p,data_revision:9007199254740992},scope));
});
test('bound preparation retains the original immutable nonce and content',()=>{
 const item=JSON.parse(readFileSync('tests/fixtures/payment-history/publication-v2/publication-corpus.json','utf8')).cases.find(x=>x.name==='a-new');
 const {name,shop_id,device_id,pages,local_receipt_json,local_receipt_sha256,local_decision,...p}=item;
 const input={...p,writer_epoch:'1',protocol_version:2,local_nonce:id(6)};
 assert.equal(c.validateComposedDeviceRequest('local_prepare',input,scope).local_nonce,id(6));
 const {local_nonce,...without}=input;assert.throws(()=>c.validateComposedDeviceRequest('local_prepare',without,scope));
});
test('reconcile and abort cannot use a bare receipt or outcome flag',()=>{
 for(const op of ['local_reconcile','local_abort']){
  assert.throws(()=>c.validateComposedDeviceRequest(op,{operation_id:id(7),content_digest:'a'.repeat(64)},scope));
  assert.throws(()=>c.projectComposedDeviceResult(op,{state:'committed'},{operation_id:id(7),content_digest:'a'.repeat(64)},scope));
 }
});
test('baseline result projection binds its run and keeps source details private',()=>{
 const r=c.projectComposedDeviceResult('baseline_status',{run_id:id(8),state:'queued',manifest:'private'}, {run_id:id(8)},scope);
 assert.equal(Object.keys(r).sort().join(','),'run_id,state');
 assert.throws(()=>c.projectComposedDeviceResult('baseline_status',{run_id:id(9),state:'queued'},{run_id:id(8)},scope));
});
test('lost PUT target is projected only after SQL-owned object identity',()=>{
 const value={upload_id:id(8),object_key:`history/${scope.shopId}/${id(8)}`};
 assert.equal(c.projectComposedDeviceResult('baseline_upload_create',value,{},scope).upload_id,id(8));
 assert.throws(()=>c.projectComposedDeviceResult('baseline_upload_create',{...value,object_key:`history/${id(9)}/${id(8)}`},{},scope));
});
