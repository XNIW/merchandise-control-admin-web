import assert from 'node:assert/strict';
import test from 'node:test';
import {load} from './helpers/payment-history-harness.mjs';
const c=load('src/server/payment-history/local-baseline-contract.ts');
const id=n=>`${n}0000000-0000-4000-8000-000000000019`;
const context=()=>({state:'missing',dataset_id:id(1),writer_epoch:'1',writer_authority:'local',source_snapshot_id:null,baseline_revision:null,canonical_revision:null,can_prepare:true});
const scope=()=>({shopId:id(2),deviceId:id(3),runId:id(4),datasetId:id(1),writerEpoch:'1',localDatasetId:'synthetic-dataset',localRevision:'9007199254740993',restoreEpoch:'0',restoreLineageId:id(5)});
const receipt=()=>({operation_id:id(6),kind:'migrate',source_run_id:id(4),source_snapshot_id:id(7),dataset_id:id(1),revision:'9007199254740994',writer_epoch:'1',
 new_active:5,new_inactive:0,duplicates:0,new_batches:1,original_evidence_level:'legacy_attested',baseline_context:{state:'baseline_verified',source_snapshot_id:id(7),
 local_dataset_id:'synthetic-dataset',local_revision:'9007199254740993',restore_epoch:'0',restore_lineage_id:id(5),writer_epoch:'1'}});
const upload=()=>({request_key:id(8),file_name:'synthetic.w7history.zip',sha256:'a'.repeat(64),byte_length:'1234'});
test('baseline context distinguishes missing, verified and read-only without rounding revisions',()=>{
 assert.equal(c.validateBaselineContext(context()).state,'missing');
 const verified={...context(),state:'verified',source_snapshot_id:id(7),baseline_revision:'9007199254740993',canonical_revision:'9007199254740994',can_prepare:false};
 assert.equal(c.validateBaselineContext(verified).baseline_revision,'9007199254740993');
 for(const delta of [{state:'other'},{baseline_revision:'1'},{writer_authority:'web',can_prepare:true},{can_prepare:1},{writer_epoch:'0'},{extra:true}])
  assert.throws(()=>c.validateBaselineContext({...context(),...delta}));
});
test('source admission is closed, bounded, exact and does not accept a client object path',()=>{
 c.validateBaselineRequest('baseline_upload_create',upload());
 for(const delta of [{request_key:'00000000-0000-0000-0000-000000000000'},{byte_length:1234},{byte_length:'0'},{byte_length:'20971521'},
  {byte_length:'1e3'},{file_name:'../other.w7history.zip'},{file_name:'a\\other.w7history.zip'},{file_name:'a\0.w7history.zip'},{sha256:'B'.repeat(64)},{object_key:'arbitrary'}])
  assert.throws(()=>c.validateBaselineRequest('baseline_upload_create',{...upload(),...delta}));
});
test('baseline start preserves original snapshot and explicit lineage',()=>{
 const p={request_key:id(8),upload_id:id(9),local_dataset_id:'synthetic-dataset',data_revision:'9007199254740993',restore_epoch:'0',restore_lineage_id:id(5),writer_epoch:'1'};
 assert.equal(c.validateBaselineRequest('baseline_start',p).data_revision,p.data_revision);
 for(const delta of [{data_revision:9007199254740993},{data_revision:'9223372036854775808'},{restore_lineage_id:null},{local_dataset_id:'x\0y'},{writer_epoch:'0'}])
  assert.throws(()=>c.validateBaselineRequest('baseline_start',{...p,...delta}));
});
test('baseline receipt retains Int64 strings and binds original run, lineage and source snapshot',()=>{
 const raw=JSON.stringify(receipt());assert.equal(c.validateBaselineReceipt(raw,scope()).revision,'9007199254740994');
 for(const delta of [{runId:id(9)},{datasetId:id(9)},{restoreLineageId:id(9)},{localRevision:'9007199254740992'},{writerEpoch:'2'}])
  assert.throws(()=>c.validateBaselineReceipt(raw,{...scope(),...delta}));
});
test('receipt parser rejects duplicate fields, numeric revisions and substituted snapshot context',()=>{
 const r=receipt(),raw=JSON.stringify(r);
 for(const value of ['{"kind":"migrate",'+raw.slice(1),raw.replace('"9007199254740993"','9007199254740993'),
  JSON.stringify({...r,new_active:-1}),JSON.stringify({...r,new_active:100001}),JSON.stringify({...r,unknown:true}),
  JSON.stringify({...r,baseline_context:{...r.baseline_context,source_snapshot_id:id(9)}}),
  JSON.stringify({...r,baseline_context:{...r.baseline_context,extra:true}}),raw+'x',' '.repeat(65537)])
  assert.throws(()=>c.validateBaselineReceipt(value,scope()));
});
test('source object key comes only from the authenticated shop and owned upload',()=>{
 const v={upload_id:id(9),object_key:`history/${scope().shopId}/${id(9)}`};
 assert.equal(c.projectBaselineSqlResult('baseline_upload_create',v,scope()).upload_id,id(9));
 assert.throws(()=>c.projectBaselineSqlResult('baseline_upload_create',{...v,object_key:`history/${id(8)}/${id(9)}`},scope()));
});
test('compact status omits source rows, manifests and database diagnostics',()=>{
 const result=c.projectBaselineSqlResult('baseline_status',{run_id:id(4),state:'analysing',manifest:{private_sentinel:true},error_text:'private_sentinel'},scope());
 assert.equal(JSON.stringify(result),JSON.stringify({run_id:id(4),state:'analysing'}));
 assert.throws(()=>c.projectBaselineSqlResult('baseline_status',{run_id:id(9),state:'applied'},scope()));
 assert.throws(()=>c.projectBaselineSqlResult('baseline_status',{run_id:id(4),state:'unexpected'},scope()));
});
test('apply and lost-response recovery return the same validated raw receipt without inventing acknowledgement',()=>{
 const r=receipt();assert.equal(c.projectBaselineSqlResult('baseline_apply',r,scope()).receipt_json,JSON.stringify(r));
 assert.equal(c.projectBaselineSqlResult('baseline_receipt',{receipt:r},scope()).receipt_json,JSON.stringify(r));
 assert.equal(c.projectBaselineSqlResult('baseline_receipt',{receipt:null},scope()).receipt_json,null);
 assert.throws(()=>c.projectBaselineSqlResult('baseline_apply',null,scope()));
});
test('review cannot invent permission or accept an unbound result',()=>{
 const review={can_apply:true,review_digest:'a'.repeat(64)};
 assert.equal(c.projectBaselineSqlResult('baseline_review',review,scope()).run_id,id(4));
 assert.throws(()=>c.projectBaselineSqlResult('baseline_review',{...review,can_apply:1},scope()));
 assert.throws(()=>c.projectBaselineSqlResult('baseline_review',{...review,review_digest:'bad'},scope()));
});
