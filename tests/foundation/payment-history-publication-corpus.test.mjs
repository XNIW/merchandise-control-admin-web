import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {load} from './helpers/payment-history-harness.mjs';
const reader=load('src/server/payment-history/local-export-reader.ts');
const contract=load('src/server/payment-history/local-commit-contract.ts');
const lossless=load('src/server/payment-history/lossless-receipt-json.ts');
const root='tests/fixtures/payment-history/publication-v2/';
const corpus=JSON.parse(readFileSync(root+'publication-corpus.json','utf8'));
const provenance=JSON.parse(readFileSync(root+'provenance.json','utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const baselines=Promise.all(corpus.baselines.map(async source=>{
 const bytes=readFileSync(root+source.file);assert.equal(sha(bytes),source.archive_sha256);
 const result=await reader.readLocalHistoryExport(bytes,corpus.cases[0].shop_id,undefined,undefined,reader.LOCAL_BASELINE_VERSION);
 assert.equal(result.manifestSha256,source.manifest_sha256);return result;
}));

test('real CLR existing and empty baselines preserve their original ledger and source tuples',async()=>{
 assert.equal(provenance.syntheticOnly,true);assert.equal(corpus.syntheticOnly,true);assert.equal(corpus.nativeEffects,0);
 const [a,b]=await baselines;
 assert.equal(a.movements.length,1);assert.equal(b.movements.length,0);
 assert.equal(a.summary.activeGrossClp,'1200');assert.equal(a.summary.knownActiveNetClp,'1180');
 assert.equal(b.summary.activeGrossClp,'0');assert.equal(b.summary.originalOperations,0);
 assert.notEqual(a.manifest.deviceId,b.manifest.deviceId);assert.notEqual(a.manifest.localDatasetId,b.manifest.localDatasetId);
 assert.notEqual(a.manifest.restoreLineageId,b.manifest.restoreLineageId);
 assert.equal(a.movements[0].transaction.externalId,'SYN-PUB-001');assert.equal(a.movements[0].transaction.externalNamespace,'getnet.legacy.transaction');
 assert.equal(a.movements[0].economics.businessTicks,'638423827330000000');
});

test('nine real CLR drafts reconcile closed content roots, local receipts, Undo and correction ownership',async()=>{
 const sources=await baselines,ids=new Set(),recordsByName=new Map();let correctionCount=0;
 assert.equal(corpus.cases.length,9);
 for(const item of corpus.cases){
  assert(!ids.has(item.operation_id));ids.add(item.operation_id);
  const baseline=sources.find(b=>b.manifest.deviceId===item.device_id);assert(baseline);
  assert.equal(item.local_dataset_id,baseline.manifest.localDatasetId);assert.equal(item.restore_lineage_id,baseline.manifest.restoreLineageId);
  contract.validateLocalCommitRequest('local_prepare',{operation_id:item.operation_id,kind:item.kind,local_dataset_id:item.local_dataset_id,
   restore_epoch:item.restore_epoch,restore_lineage_id:item.restore_lineage_id,base_revision:item.base_revision,writer_epoch:'1',request_fingerprint:item.request_fingerprint,
   content_digest:item.content_digest,page_count:item.page_count,protocol_version:2});
  const digests=[],records=[];
  for(const page of item.pages){assert.equal(page.ordinal,digests.length+1);records.push(...contract.validateLocalCommitPage(page.page_json,page.page_sha256));digests.push(page.page_sha256);}
  assert.equal(digests.length,item.page_count);assert.equal(contract.localCommitContentDigest(digests),item.content_digest);
  recordsByName.set(item.name,records);correctionCount+=records.filter(r=>r.kind==='correction').length;
  assert.equal(sha(item.local_receipt_json),item.local_receipt_sha256);
  const receipt=lossless.parseReceiptJson(item.local_receipt_json),decision=item.local_decision;
  assert.equal(receipt.OperationKind,item.kind);assert.equal(receipt.OperationId.replaceAll('-',''),item.operation_id.replaceAll('-',''));
  assert.equal(receipt.InsertedCount.raw,String(item.kind==='Apply'?decision.inserted:decision.deactivated));
  assert.equal(receipt.DuplicateCount.raw,String(decision.duplicates));assert.equal(receipt.RejectedCount.raw,String(decision.rejected));
  assert.equal(receipt.CorrectionCount.raw,String(decision.corrections));assert.equal(receipt.SignedAmountClp.raw,decision.signed_gross_clp);
  assert.equal(decision.revision_delta,String(decision.inserted+decision.deactivated));
 }
 assert.equal(correctionCount,1);
 const byName=name=>corpus.cases.find(c=>c.name===name);
 assert.equal(byName('a-duplicate').local_decision.inserted,0);assert.equal(byName('a-duplicate').local_decision.duplicates,1);
 const prior=byName('a-identical-reimport'),correction=recordsByName.get('a-corrected-reimport').find(r=>r.kind==='correction').fields;
 assert.equal(correction.previous_apply_operation_id,prior.operation_id);
 assert.equal(correction.previous_local_batch_id,lossless.parseReceiptJson(prior.local_receipt_json).BatchId);
 assert.equal(correction.previous_transaction_id,'3');assert.equal(byName('a-corrected-reimport').local_decision.corrections,1);
 assert.equal(byName('b-locally-new-canonical-existing').local_decision.inserted,1);
 assert.equal(byName('b-undo-local-canonical-duplicate').local_decision.deactivated,1);
 const binding=name=>recordsByName.get(name).find(r=>r.kind==='binding').fields;
 assert.equal(binding('a-corrected-reimport').alias_key,binding('b-locally-new-canonical-existing').alias_key);
 assert.notEqual(binding('a-corrected-reimport').local_scope_id,binding('b-locally-new-canonical-existing').local_scope_id);
});
