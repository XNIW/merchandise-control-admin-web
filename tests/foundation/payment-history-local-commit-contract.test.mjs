import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {load} from "./helpers/payment-history-harness.mjs";
const c=load("src/server/payment-history/local-commit-contract.ts");
const {windowsFieldHash}=load("src/server/payment-history/ledger-contract.ts");
const sha=value=>createHash("sha256").update(value,"utf8").digest("hex");
const id="10000000-0000-4000-8000-000000000019",device="20000000-0000-4000-8000-000000000019",operation="30000000-0000-4000-8000-000000000019";
const records=[{kind:"operation",fields:{protocol_version:"2",operation_id:operation.replaceAll("-",""),operation_kind:"Undo",shop_id:id,device_id:device,local_dataset_id:"synthetic-dataset",restore_epoch:"0",restore_lineage_id:id,base_revision:"12",request_fingerprint:"a".repeat(64)}},
 {kind:"undo",fields:{batch_id:"retained-local-batch",batch_revision:"1",apply_operation_id:"retained-apply"}}];
const raw=JSON.stringify(records),digest=sha(raw),content=c.localCommitContentDigest([digest]);
test("bounded incremental records retain local provenance without a ZIP or privileged key",()=>{
 const parsed=c.validateLocalCommitPage(raw,digest);assert.equal(parsed.length,2);assert.equal(parsed[1].fields.batch_id,"retained-local-batch");
 assert.equal(content,sha(digest+"\n"));assert.equal(c.LOCAL_COMMIT_PROTOCOL_VERSION,2);
});
for(const mutate of [
 r=>r.push({kind:"credentials",fields:{deviceToken:"synthetic-secret"}}),
 r=>r[0].fields.deviceToken="synthetic-secret",
 r=>r[0].fields.restore_epoch="-1",
 r=>r[0].fields.base_revision=12,
 r=>r[0].fields.request_fingerprint="invalid",
 r=>r[0].fields.shop_id="not-a-tenant",
 r=>r[0].fields.protocol_version="1",
 r=>r[0].fields.operation_kind="NativeSale",
 r=>r[1].fields.batch_id="x".repeat(2049)
])test("closed local content rejects unsupported or unbound fields "+String(mutate),()=>{
 const changed=structuredClone(records);mutate(changed);const json=JSON.stringify(changed);assert.throws(()=>c.validateLocalCommitPage(json,sha(json)));
});
test("modified bytes, oversized pages and empty pages never share an authorization digest",()=>{
 assert.throws(()=>c.validateLocalCommitPage(raw+" ",digest));assert.throws(()=>c.validateLocalCommitPage("[]",sha("[]")));
 const many=JSON.stringify(Array.from({length:201},()=>records[1]));assert.throws(()=>c.validateLocalCommitPage(many,sha(many)));
 assert.throws(()=>c.localCommitContentDigest([]));assert.notEqual(c.localCommitContentDigest([digest,digest]),content);
});
test("prepare binds operation kind, digest, dataset, restore and writer epoch before any local mutation",()=>{
 const p={operation_id:operation,kind:"Undo",local_dataset_id:"synthetic-dataset",restore_epoch:"0",restore_lineage_id:id,base_revision:"12",writer_epoch:"3",request_fingerprint:"a".repeat(64),content_digest:content,page_count:1,protocol_version:2};
 assert.equal(c.validateLocalCommitRequest("local_prepare",p).content_digest,content);
 for(const changed of [{...p,writer_epoch:"0"},{...p,restore_epoch:"01"},{...p,page_count:20001},{...p,protocol_version:1},{...p,shop_id:id}])
  assert.throws(()=>c.validateLocalCommitRequest("local_prepare",changed));
});
test("delivery and receipt lookup do not mint another mutation grant",()=>{
 const p={operation_id:operation,grant_id:id,content_digest:content,local_revision:"13",local_sequence:"1",local_receipt_json:'{"SignedAmountClp":9223372036854775807}'};
 assert.equal(c.validateLocalCommitRequest("local_deliver",p).local_receipt_json,p.local_receipt_json);
 assert.equal(c.validateLocalCommitRequest("local_receipt",{operation_id:operation,content_digest:content}).operation_id,operation);
 assert.throws(()=>c.validateLocalCommitRequest("local_receipt",{operation_id:operation,content_digest:content,grant_id:id}));
});
const scope={shopId:id,deviceId:device,operationId:operation,contentDigest:content};
const proof={grant_id:device,operation_id:operation,shop_id:id,device_id:device,local_dataset_id:"synthetic-dataset",restore_epoch:"9223372036854775807",writer_epoch:"3",content_digest:content,request_fingerprint:"a".repeat(64),decision:"content_authorized_v2",server_dataset_id:id,restore_lineage_id:id,
 local_decision:{inserted:1,duplicates:0,rejected:0,corrections:0,deactivated:0,signed_gross_clp:"9223372036854775807",revision_delta:"1"},
 canonical_decision:{batch_id:operation,revision:"9223372036854775807",inserted:0,duplicates:1,deactivated:0,signed_gross_clp:"0"}};
const authorized={state:"authorized",operation_id:operation,content_digest:content,grant_id:device,writer_epoch:"3",remaining_milliseconds:60000,proof};
test("authorization response is a closed content-bound decision and keeps Int64 epochs exact",()=>{
 assert.equal(c.validateLocalCommitResult("local_authorize",authorized,scope).proof.restore_epoch,"9223372036854775807");
 for(const change of [{...proof,device_id:id},{...proof,shop_id:device},{...proof,operation_id:id},{...proof,content_digest:"f".repeat(64)},{...proof,decision:"offline_allowed"},{...proof,restore_epoch:9007199254740992},{...proof,grant_id:id},{...proof,writer_epoch:"4"},{...proof,deviceToken:"synthetic-secret"}])
  assert.throws(()=>c.validateLocalCommitResult("local_authorize",{...authorized,proof:change},scope));
});
test("local and canonical economic decisions are independently bound without Number coercion",()=>{
 const checked=c.validateLocalCommitResult("local_authorize",authorized,scope).proof;
 assert.equal(checked.local_decision.inserted,1);assert.equal(checked.canonical_decision.inserted,0);
 assert.equal(checked.canonical_decision.duplicates,1);assert.equal(checked.canonical_decision.signed_gross_clp,"0");
 assert.equal(checked.local_decision.signed_gross_clp,"9223372036854775807");
 for(const section of ["local_decision","canonical_decision"]){
  const missing=structuredClone(proof);delete missing[section];assert.throws(()=>c.validateLocalCommitResult("local_authorize",{...authorized,proof:missing},scope));
  for(const key of Object.keys(proof[section])){const changed=structuredClone(proof);delete changed[section][key];assert.throws(()=>c.validateLocalCommitResult("local_authorize",{...authorized,proof:changed},scope));}
  const expanded=structuredClone(proof);expanded[section].unbound=true;assert.throws(()=>c.validateLocalCommitResult("local_authorize",{...authorized,proof:expanded},scope));
 }
});
test("malformed decision money, counts, revision and operation effects fail closed",()=>{
 const local=proof.local_decision,canonical=proof.canonical_decision;
 for(const changed of [{...local,signed_gross_clp:9223372036854775807},{...local,inserted:1.5},{...local,inserted:null},{...local,duplicates:100000},
  {...local,rejected:2147483648},{...local,corrections:2},{...local,deactivated:1,revision_delta:"2"},{...local,revision_delta:"0"}])
  assert.throws(()=>c.validateLocalCommitResult("local_authorize",{...authorized,proof:{...proof,local_decision:changed}},scope));
 for(const changed of [{...canonical,batch_id:"invalid"},{...canonical,batch_id:[operation]},{...canonical,revision:"0"},{...canonical,revision:9007199254740992},
  {...canonical,deactivated:1},{...canonical,signed_gross_clp:"-9223372036854775809"},{...canonical,duplicates:100001}])
  assert.throws(()=>c.validateLocalCommitResult("local_authorize",{...authorized,proof:{...proof,canonical_decision:changed}},scope));
});
const receipt={operation_id:operation,grant_id:device,shop_id:id,device_id:device,dataset_id:id,local_dataset_id:"synthetic-dataset",restore_epoch:"0",restore_lineage_id:id,writer_epoch:"3",revision:"9223372036854775807",content_digest:content,local_receipt_sha256:"a".repeat(64),batch_id:operation,kind:"Apply",inserted:1,duplicates:0,deactivated:0,signed_gross_clp:"9223372036854775807"};
test("a recovered receipt preserves signed exact economics and tenant/device attribution",()=>{
 const result={state:"committed",operation_id:operation,content_digest:content,receipt};
 assert.equal(c.validateLocalCommitResult("local_receipt",result,scope).receipt.signed_gross_clp,"9223372036854775807");
 for(const change of [{...receipt,shop_id:device},{...receipt,device_id:id},{...receipt,operation_id:id},{...receipt,content_digest:"f".repeat(64)},{...receipt,revision:9007199254740992},{...receipt,inserted:100001},{...receipt,signed_gross_clp:"-9223372036854775809"},{...receipt,bankAccount:"synthetic-secret"}])
  assert.throws(()=>c.validateLocalCommitResult("local_receipt",{...result,receipt:change},scope));
});
test("first late content without admission needs explicit reconciliation; a receipt lookup cannot authorize a write",()=>{
 const result={state:"reconcile_required",operation_id:operation,content_digest:content,receipt:null};
 assert.equal(c.validateLocalCommitResult("local_receipt",result,scope).state,"reconcile_required");
 assert.throws(()=>c.validateLocalCommitResult("local_deliver",result,scope));
 assert.throws(()=>c.validateLocalCommitResult("local_receipt",{...result,receipt},scope));
});
test("correction authorization binds both economic versions, exact local ID, source, context and evidence",()=>{
 const fields={source_file_id:"f1",source_sheet:"synthetic",source_row:"2",previous_transaction_id:"9007199254740993",previous_local_batch_id:"synthetic-local-batch",previous_apply_operation_id:device,previous_economic_digest:"a".repeat(64),proposed_economic_digest:"b".repeat(64),context_fingerprint:"c".repeat(64),evidence_reference:"synthetic-reviewed-correction",approval_fingerprint:""};
 fields.approval_fingerprint=windowsFieldHash([fields.previous_transaction_id,fields.previous_economic_digest,fields.proposed_economic_digest,fields.source_file_id,fields.source_sheet,fields.source_row,fields.context_fingerprint,fields.evidence_reference]);
 const page=JSON.stringify([{kind:"correction",fields}]);
 assert.equal(c.validateLocalCommitPage(page,sha(page))[0].fields.previous_transaction_id,"9007199254740993");
 assert.equal(c.validateLocalCommitPage(page,sha(page))[0].fields.previous_apply_operation_id,device);
 const changedOwner=JSON.stringify([{kind:"correction",fields:{...fields,previous_apply_operation_id:operation}}]);
 assert.notEqual(c.localCommitContentDigest([sha(page)]),c.localCommitContentDigest([sha(changedOwner)]));
 for(const value of ["",null,"not-a-uuid","00000000-0000-0000-0000-000000000000"]){const invalid=JSON.stringify([{kind:"correction",fields:{...fields,previous_apply_operation_id:value}}]);assert.throws(()=>c.validateLocalCommitPage(invalid,sha(invalid)));}
 const missing={...fields};delete missing.previous_local_batch_id;const unbound=JSON.stringify([{kind:"correction",fields:missing}]);assert.throws(()=>c.validateLocalCommitPage(unbound,sha(unbound)));
 for(const key of ["previous_transaction_id","previous_economic_digest","proposed_economic_digest","context_fingerprint","evidence_reference"]){
  const changed=JSON.stringify([{kind:"correction",fields:{...fields,[key]:key.endsWith("digest")||key.endsWith("fingerprint")?"d".repeat(64):key==="previous_transaction_id"?"9007199254740994":"changed"}}]);
  assert.throws(()=>c.validateLocalCommitPage(changed,sha(changed)));
 }
});
