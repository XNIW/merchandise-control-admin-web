import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {load} from './helpers/payment-history-harness.mjs';
const c=load('src/server/payment-history/local-outcome-delivery-contract.ts');
const {localOutcomeSha256:sha}=load('src/server/payment-history/local-outcome-contract.ts');
const item=JSON.parse(readFileSync('tests/fixtures/payment-history/publication-v2/publication-corpus.json','utf8')).cases.find(x=>x.name==='a-new');
const id='90000000-0000-4000-8000-000000000019';
const scope={shopId:item.shop_id,deviceId:item.device_id,operationId:item.operation_id,contentDigest:item.content_digest};
function fixture(){
 const proof={grant_id:id,operation_id:item.operation_id,shop_id:item.shop_id,device_id:item.device_id,local_dataset_id:item.local_dataset_id,
  restore_epoch:item.restore_epoch,writer_epoch:'1',content_digest:item.content_digest,request_fingerprint:item.request_fingerprint,decision:'content_authorized_v2',
  server_dataset_id:id,restore_lineage_id:item.restore_lineage_id,local_decision:item.local_decision,
  canonical_decision:{batch_id:id,revision:'8',inserted:1,duplicates:0,deactivated:0,signed_gross_clp:'2200'}};
 const rawProof=JSON.stringify(proof),revision=String(BigInt(item.base_revision)+BigInt(item.local_decision.revision_delta));
 const witness={schema_version:1,outcome:'committed',operation_kind:item.kind,local_nonce:id,grant_id:id,operation_id:item.operation_id,
  shop_id:item.shop_id,device_id:item.device_id,local_dataset_id:item.local_dataset_id,server_dataset_id:id,restore_epoch:item.restore_epoch,restore_lineage_id:item.restore_lineage_id,
  writer_epoch:'1',content_digest:item.content_digest,request_fingerprint:item.request_fingerprint,base_revision:item.base_revision,local_revision:revision,local_sequence:'11',
  local_receipt_sha256:sha(item.local_receipt_json),proof_sha256:sha(rawProof),admission_id:id,remaining_milliseconds:50000,request_elapsed_milliseconds:10,elapsed_milliseconds:50,minimum_remaining_milliseconds:10000};
 const delivery={operation_id:item.operation_id,grant_id:id,content_digest:item.content_digest,local_revision:revision,local_sequence:'11',local_receipt_json:item.local_receipt_json,
  witness_json:JSON.stringify(witness),local_proof_json:rawProof};
 return {proof,witness,delivery};
}
// Original CLR draft/receipt bytes; synthetic grant/outcome, not HTTP E2E.
test('late delivery binds original proof, CLR receipt, root, scope and monotonic evidence without rewriting bytes',()=>{
 const {delivery}=fixture();const parsed=c.validateLocalOutcomeDelivery(delivery,scope);
 assert.equal(parsed.local_proof_json,delivery.local_proof_json);assert.equal(parsed.local_receipt_json,item.local_receipt_json);assert.equal(parsed.witness_json,delivery.witness_json);
 for(const change of [{local_proof_json:delivery.local_proof_json+' '},{local_receipt_json:item.local_receipt_json+' '},{local_revision:'9'},{local_sequence:'12'},{operation_id:id},{grant_id:item.device_id}])assert.throws(()=>c.validateLocalOutcomeDelivery({...delivery,...change},scope));
 assert.throws(()=>c.validateLocalOutcomeDelivery(delivery,{...scope,deviceId:id}));
});
test('recomputed proof hashes cannot conceal another authorizing context, decision or lexical numeric token',()=>{
 for(const key of ['grant_id','local_dataset_id','restore_epoch','writer_epoch','server_dataset_id','restore_lineage_id','request_fingerprint']){
  const {proof,witness,delivery}=fixture();proof[key]=key==='restore_epoch'||key==='writer_epoch'?'2':key==='request_fingerprint'?'e'.repeat(64):id===proof[key]?item.device_id:id;
  delivery.local_proof_json=JSON.stringify(proof);witness.proof_sha256=sha(delivery.local_proof_json);delivery.witness_json=JSON.stringify(witness);
  assert.throws(()=>c.validateLocalOutcomeDelivery(delivery,scope));
 }
 for(const token of ['1.0','1e0','9007199254740993']){
  const {witness,delivery}=fixture();delivery.local_proof_json=delivery.local_proof_json.replace('"inserted":1','"inserted":'+token);
  witness.proof_sha256=sha(delivery.local_proof_json);delivery.witness_json=JSON.stringify(witness);assert.throws(()=>c.validateLocalOutcomeDelivery(delivery,scope));
 }
});
test('negative ACK is bound to the original durable tombstone bytes, with optional original grant only',()=>{
 const {witness,delivery}=fixture();witness.outcome='aborted';witness.local_revision=witness.base_revision;
 for(const key of ['local_receipt_sha256','admission_id','remaining_milliseconds','request_elapsed_milliseconds','elapsed_milliseconds','minimum_remaining_milliseconds'])witness[key]=null;
 const p={operation_id:item.operation_id,content_digest:item.content_digest,witness_json:JSON.stringify(witness),local_proof_json:delivery.local_proof_json};
 c.validateLocalOutcomeAbort(p,scope);witness.grant_id=null;witness.proof_sha256=null;p.witness_json=JSON.stringify(witness);delete p.local_proof_json;
 c.validateLocalOutcomeAbort(p,scope);assert.throws(()=>c.validateLocalOutcomeAbort({...p,local_proof_json:'{}'},scope));
 const ack={state:'aborted',operation_id:item.operation_id,content_digest:item.content_digest,witness_sha256:sha(p.witness_json)};
 c.validateLocalOutcomeAbortResult(ack,scope,p.witness_json);
 for(const change of [{state:'committed'},{witness_sha256:'f'.repeat(64)},{content_digest:'f'.repeat(64)},{operation_id:id}])assert.throws(()=>c.validateLocalOutcomeAbortResult({...ack,...change},scope,p.witness_json));
});
