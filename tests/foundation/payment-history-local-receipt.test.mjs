import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {load} from './helpers/payment-history-harness.mjs';
const receipt=load('src/server/payment-history/local-receipt-contract.ts');
const lossless=load('src/server/payment-history/lossless-receipt-json.ts');
const commit=load('src/server/payment-history/local-commit-contract.ts');
const corpus=JSON.parse(readFileSync('tests/fixtures/payment-history/publication-v2/publication-corpus.json','utf8'));
const sample=name=>corpus.cases.find(x=>x.name===name);
const canonical=id=>id.length===32?`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`:id;
const bad=raw=>assert.throws(()=>receipt.validateLocalReceipt(raw),/receipt_invalid|receipt_limit/);
test('all nine original CLR receipts retain exact integer tokens and operation identity',()=>{
 for(const x of corpus.cases){const r=receipt.validateLocalReceipt(x.local_receipt_json,canonical(x.operation_id));assert.equal(r.OperationKind,x.kind);assert.equal(r.SignedAmountClp.raw,x.local_decision.signed_gross_clp);assert.equal(r.CorrectionCount.raw,String(x.local_decision.corrections));}
});
test('monetary Int64 literals never pass through JavaScript Number',()=>{
 const raw=sample('a-new').local_receipt_json;
 for(const value of ['9007199254740993','9223372036854775807','-9223372036854775808']){
  const changed=raw.replace(/"SignedAmountClp":-?\d+/,`"SignedAmountClp":${value}`);assert.equal(receipt.validateLocalReceipt(changed).SignedAmountClp.raw,value);
 }
 for(const value of ['9223372036854775808','-9223372036854775809','1.0','1e3','"2200"'])bad(raw.replace(/"SignedAmountClp":-?\d+/,`"SignedAmountClp":${value}`));
});
test('duplicate keys and extra observation fields cannot replace an immutable receipt',()=>{
 const raw=sample('a-new').local_receipt_json;
 bad('{"InsertedCount":1,'+raw.slice(1));bad('{"CurrentBatchState":"Active",'+raw.slice(1));
 bad(raw.replace(/"InsertedCount":\d+/,'"InsertedCount":"1"'));bad(raw+' trailing');
});
test('correction receipts require typed original economics and unique source coordinates',()=>{
 const raw=sample('a-corrected-reimport').local_receipt_json;const r=JSON.parse(raw);
 assert.equal(receipt.validateLocalReceipt(raw).CorrectionApprovals.length,1);
 r.CorrectionApprovals[0].Previous.BusinessTicks=String(r.CorrectionApprovals[0].Previous.BusinessTicks);bad(JSON.stringify(r));
 const repeated=JSON.parse(raw);repeated.CorrectionApprovals.push(repeated.CorrectionApprovals[0]);repeated.CorrectionCount=2;repeated.InsertedCount=2;bad(JSON.stringify(repeated));
});
test('ticks beyond 2^53 and nullable fee knowledge remain lossless',()=>{
 const raw=sample('a-corrected-reimport').local_receipt_json;const r=receipt.validateLocalReceipt(raw);
 const p=r.CorrectionApprovals[0].Previous;assert.ok(BigInt(p.BusinessTicks.raw)>BigInt(Number.MAX_SAFE_INTEGER));
 assert.ok(p.FeeVatClp===null||p.FeeVatClp instanceof lossless.ReceiptNumber);
});
test('a receipt is bound to the canonical request operation without rewriting its N-format provenance',()=>{
 const x=sample('a-new');const r=receipt.validateLocalReceipt(x.local_receipt_json,canonical(x.operation_id));
 assert.equal(r.OperationId,x.operation_id.replaceAll('-',''));
 assert.throws(()=>receipt.validateLocalReceipt(x.local_receipt_json,'90000000-0000-4000-8000-000000003019'),/receipt_invalid/);
});
test('the delivery validator forwards the original receipt text byte for byte',()=>{
 const x=sample('a-new');const p={operation_id:canonical(x.operation_id),grant_id:'90000000-0000-4000-8000-000000003019',content_digest:x.content_digest,local_revision:'2',local_sequence:'11',local_receipt_json:x.local_receipt_json};
 assert.equal(commit.validateLocalCommitRequest('local_deliver',p).local_receipt_json,x.local_receipt_json);
 assert.throws(()=>commit.validateLocalCommitRequest('local_deliver',{...p,local_receipt_json:'{}'}),/receipt_invalid/);
});
test('the byte bound is enforced before parsing or forwarding',()=>{
 assert.throws(()=>receipt.validateLocalReceipt(' '.repeat(receipt.LOCAL_RECEIPT_MAX_BYTES+1)),/receipt_limit/);
});
test('evidence text follows the existing page contract and keeps an admitted line break',()=>{
 const raw=sample('a-corrected-reimport').local_receipt_json;
 const changed=raw.replace(/("EvidenceReference":)"(?:\\.|[^"\\])*"/,'$1"synthetic\\nreference"');
 assert.equal(receipt.validateLocalReceipt(changed).CorrectionApprovals[0].EvidenceReference,'synthetic\nreference');
 bad(changed.replace('synthetic\\nreference','synthetic\\u0000reference'));
});
