import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {load} from './helpers/payment-history-harness.mjs';
const c=load('src/server/payment-history/local-outcome-contract.ts');
const id=n=>`${n}0000000-0000-4000-8000-000000000019`;
// Synthetic outcome envelope: this is not distributed POS/HTTP qualification.
const positive=()=>({schema_version:1,outcome:'committed',operation_kind:'Apply',local_nonce:id(1),grant_id:id(2),operation_id:id(3),
 shop_id:id(4),device_id:id(5),local_dataset_id:'synthetic-dataset',server_dataset_id:id(6),restore_epoch:'0',restore_lineage_id:id(7),writer_epoch:'1',
 content_digest:'a'.repeat(64),request_fingerprint:'b'.repeat(64),base_revision:'9007199254740993',local_revision:'9007199254740994',local_sequence:'11',
 local_receipt_sha256:'c'.repeat(64),proof_sha256:'d'.repeat(64),admission_id:id(8),remaining_milliseconds:50000,request_elapsed_milliseconds:10,
 elapsed_milliseconds:50,minimum_remaining_milliseconds:10000});
const negative=()=>({...positive(),outcome:'aborted',grant_id:null,proof_sha256:null,local_revision:'9007199254740993',
 local_receipt_sha256:null,admission_id:null,remaining_milliseconds:null,request_elapsed_milliseconds:null,elapsed_milliseconds:null,minimum_remaining_milliseconds:null});
const bad=value=>assert.throws(()=>c.validateLocalOutcomeWitness(typeof value==='string'?value:JSON.stringify(value)));

test('closed outcomes preserve Int64 strings and original byte hashes',()=>{
 const w=positive(),raw=JSON.stringify(w);assert.equal(Object.keys(c.validateLocalOutcomeWitness(raw)).length,25);
 assert.equal(c.validateLocalOutcomeWitness(raw).base_revision,'9007199254740993');
 assert.equal(c.localOutcomeSha256(raw),createHash('sha256').update(raw).digest('hex'));
 assert.notEqual(c.localOutcomeSha256(raw+' '),c.localOutcomeSha256(raw));
 assert.equal(c.validateLocalOutcomeWitness(raw,{operation_id:w.operation_id,device_id:w.device_id,local_nonce:w.local_nonce}).outcome,'committed');
 assert.throws(()=>c.validateLocalOutcomeWitness(raw,{device_id:id(9)}));
});
test('positive evidence requires an original proof, receipt and final monotonic reserve',()=>{
 const w=positive();c.validateLocalOutcomeWitness(JSON.stringify({...w,elapsed_milliseconds:29990}));
 for(const delta of [{elapsed_milliseconds:29991},{remaining_milliseconds:60001},{remaining_milliseconds:19999},{minimum_remaining_milliseconds:9999},
  {request_elapsed_milliseconds:-1},{admission_id:null},{grant_id:null},{local_sequence:'0'},{local_receipt_sha256:null},{proof_sha256:null}])bad({...w,...delta});
});
test('negative evidence has no receipt or clock claim, and retires exactly the unchanged local revision',()=>{
 const w=negative();assert.equal(c.validateLocalOutcomeWitness(JSON.stringify(w)).outcome,'aborted');
 c.validateLocalOutcomeWitness(JSON.stringify({...w,grant_id:id(2),proof_sha256:'d'.repeat(64)}));
 for(const delta of [{local_revision:'9007199254740994'},{remaining_milliseconds:0},{admission_id:id(8)},{local_receipt_sha256:'c'.repeat(64)},
  {grant_id:id(2)},{proof_sha256:'d'.repeat(64)}])bad({...w,...delta});
});
test('duplicate and unknown fields cannot overwrite outcome evidence before normalization',()=>{
 const raw=JSON.stringify(positive());bad('{"schema_version":1,'+raw.slice(1));bad('{"outcome":"aborted",'+raw.slice(1));
 bad({...positive(),observed_at:'client UTC'});bad({...positive(),operation_id:undefined});bad(raw+' trailing');
 bad(raw.replace('"schema_version"','"schema_\\u0076ersion"').replace('{','{"schema_version":1,'));
});
test('integer token spelling is strict before any JavaScript numeric conversion',()=>{
 const raw=JSON.stringify(positive());
 for(const token of ['1.0','1e0','"1"','true','null','-0'])bad(raw.replace('"schema_version":1','"schema_version":'+token));
 for(const token of ['50000.0','5e4','"50000"'])bad(raw.replace('"remaining_milliseconds":50000','"remaining_milliseconds":'+token));
 for(const value of ['01','-1','9223372036854775808',9007199254740992])bad({...positive(),base_revision:value});
});
test('zero identities, substituted kinds, invalid digests and UTF8 byte excess reject',()=>{
 const w=positive();for(const key of ['local_nonce','grant_id','operation_id','shop_id','device_id','server_dataset_id','restore_lineage_id','admission_id'])bad({...w,[key]:'00000000-0000-0000-0000-000000000000'});
 for(const delta of [{operation_kind:'NativeSale'},{outcome:'pending'},{content_digest:'A'.repeat(64)},{local_dataset_id:''},{writer_epoch:'0'}])bad({...w,...delta});
 const raw=JSON.stringify(w);bad(raw+' '.repeat(c.LOCAL_OUTCOME_MAX_BYTES));bad(raw+'é'.repeat(c.LOCAL_OUTCOME_MAX_BYTES/2));
});
