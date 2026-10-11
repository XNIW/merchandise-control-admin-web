import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {Script,createContext} from 'node:vm';
import ts from 'typescript';
const realRequire=createRequire(import.meta.url);
const request=JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/lookup.request.json'));
const cache=new Map();
function module(path) {
 if(cache.has(path))return cache.get(path);
 const m={exports:{}};cache.set(path,m.exports);
 const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Script(output,{filename:path}).runInContext(createContext({exports:m.exports,module:m,require:(id)=>id==='server-only'?{}:id.startsWith('@/')?module(resolve('src',id.slice(2)+'.ts')):id.startsWith('.')?module(resolve(dirname(path),id+'.ts')):realRequire(id),Date,Map,Set,Buffer,process,console}));
 return m.exports;
}
const contract=module(resolve('src/server/pos-auth/catalog-import-multipart-contract.ts'));
const ordinary=module(resolve('src/server/pos-auth/catalog-import-sync.ts'));
const recovery=module(resolve('src/server/pos-auth/catalog-import-recovery-contract.ts'));
const currentEnvelope={...request,schemaVersion:contract.MULTIPART_SCHEMA};
const trust=contract.parseRecoveryTrust(currentEnvelope);
const originalId='01000000-0000-4000-8000-000000000094';
const planId='02000000-0000-4000-8000-000000000094';
function rawOriginal(count=1) {
 const value=structuredClone(request.originalRequest);delete value.batch.attemptCount;
 value.summary={newProducts:count,updatedProducts:0,noChangeRows:0,skippedRows:0,warningCount:0};
 value.items=Array.from({length:count},(_,index)=>({...value.items[0],clientItemId:`row-${index}`,barcode:`MULTI-${index}`,rowNumber:index+1}));
 return value;
}
function uploaded(value,mode='original',size=262144) {
 const raw=Buffer.from(typeof value==='string'?value:JSON.stringify(value));const parts=[];
 for(let at=0;at<raw.length;at+=size){const bytes=raw.subarray(at,at+size);parts.push({index:parts.length,byteLength:bytes.length,sha256:contract.sha256(bytes),contentBase64:bytes.toString('base64')});}
 return {manifest:{mode,...(mode==='original'?{originalKind:'ordinary',declaredPayloadHash:request.payloadHash}:{}),totalByteLength:raw.length,rawSha256:contract.sha256(raw),parts:parts.map(({index,byteLength,sha256})=>({index,byteLength,sha256}))},parts};
}
test('forensic omitted/zero attempts recover while ordinary remains positive-only and canonical hash unchanged',()=>{
 const raw=rawOriginal();const parsed=[];
 for(const count of [undefined,0,1,3]) {const value=structuredClone(raw);if(count!==undefined)value.batch.attemptCount=count;
 const result=contract.parseLargeOriginal(value,trust);assert.ok(result);parsed.push(result.payloadHash);
 assert.equal(Boolean(ordinary.parseCatalogImportInput({...value,...trust,schemaVersion:'pos-catalog-import-v1'})),count>0);}
 assert.equal(new Set(parsed).size,1);
 for(const count of [-1,0.5,null,'bad']){const value=rawOriginal();value.batch.attemptCount=count;assert.equal(contract.parseLargeOriginal(value,trust),null);}
});
test('current trust keeps 256 byte-token fence and canonical identity text policy',()=>{
 assert.ok(contract.parseRecoveryTrust(currentEnvelope));
 for(const field of ['deviceToken','sessionToken'])assert.equal(contract.parseRecoveryTrust({...currentEnvelope,[field]:'x'.repeat(257)}),null);
 for(const shopCode of ['SHOP\u200b','SHOP\u202e','SHOP\ud800'])assert.equal(contract.parseRecoveryTrust({...currentEnvelope,shopCode}),null);
});
test('original 5000 and 60000 rows normalize completely, ordinary still rejects 1001',()=>{
 for(const count of [5000,60000]) {const value=rawOriginal(count);const result=contract.parseLargeOriginal(value,trust);assert.equal(result?.items.length,count);}
 const value=rawOriginal(1001);value.batch.attemptCount=1;assert.equal(ordinary.parseCatalogImportInput({...value,...trust,schemaVersion:'pos-catalog-import-v1'}),null);
 assert.equal(contract.parseLargeOriginal(rawOriginal(60001),trust),null);
});
test('immutable exact bytes hash independently of declaration; missing/reordered/tampered chunks fail',()=>{
 const packet=uploaded(rawOriginal(5000));const result=contract.rebuildUpload(packet);assert.ok(result);assert.equal(result.raw.toString(),JSON.stringify(rawOriginal(5000)));
 for(const mutate of [value=>value.parts.pop(),value=>value.parts.reverse(),value=>value.parts[0].contentBase64=Buffer.from('changed').toString('base64'),value=>value.manifest.rawSha256=contract.sha256('changed')]){
 const value=structuredClone(packet);mutate(value);assert.equal(contract.rebuildUpload(value),null);}
});
test('upload canonical base64, full manifest sum, 128 parts, 256 KiB raw bound are enforced',()=>{
 const packet=uploaded(rawOriginal());const body={...currentEnvelope,uploadId:originalId,...packet.manifest,partIndex:0,contentBase64:packet.parts[0].contentBase64};assert.ok(contract.parseUpload(body));
 for(const patch of [{partIndex:1},{totalByteLength:packet.manifest.totalByteLength+1},{contentBase64:body.contentBase64+'\n'},{parts:Array.from({length:129},(_,i)=>({index:i,byteLength:1,sha256:contract.sha256('x')})),totalByteLength:129}])assert.equal(contract.parseUpload({...body,...patch}),null);
});
test('invalid UTF-8 and numeric Int64 are explicit failure; exact Int64 text bytes preserved',()=>{
 const invalid=uploaded('{}');const bytes=Buffer.from([0x7b,0xff,0x7d]);invalid.parts[0].contentBase64=bytes.toString('base64');invalid.manifest.parts[0].byteLength=3;invalid.manifest.parts[0].sha256=contract.sha256(bytes);invalid.manifest.totalByteLength=3;invalid.manifest.rawSha256=contract.sha256(bytes);assert.equal(contract.rebuildUpload(invalid),null);
 assert.equal(contract.rebuildUpload(uploaded('{"schemaVersion":"pos-catalog-import-v1","value":9223372036854775807}')),null);
 const value=rawOriginal();value.items[0].retailPrice='9223372036854775807';const packet=uploaded(value);assert.ok(contract.rebuildUpload(packet));assert.equal(JSON.stringify(contract.rebuildUpload(packet).value),JSON.stringify(value));
});
function replacement(raw,count=1000) {
 const parts=[];const coverage=[];
 for(let index=0;index<raw.items.length;index+=count){const items=raw.items.slice(index,index+count);const partIndex=parts.length;
 parts.push({index:partIndex,request:{...raw,batch:{...raw.batch,clientImportId:`multi-${partIndex}`,idempotencyKey:`multi-key-${partIndex}`,attemptCount:1},summary:{newProducts:items.length},items}});
 coverage.push(...items.map(item=>({clientItemId:item.clientItemId,kind:'child',partIndex,childClientItemId:item.clientItemId})));}
 return {schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',parts,coverage};
}
test('complete 5000-row plan binds all five child identities and coverage before apply',()=>{
 const raw=rawOriginal(5000);const original=contract.parseLargeOriginal(raw,trust);const plan=replacement(raw);const result=contract.parseRecoveryPlan(plan,original,originalId,trust);
 assert.equal(result?.itemCount,5000);assert.equal(result.parts.length,5);assert.match(result.planCanonicalHash,/^sha256:[a-f0-9]{64}$/);
 for(const mutate of [value=>value.coverage.pop(),value=>value.coverage[1]=value.coverage[0],value=>value.parts[1].request.batch.clientImportId=value.parts[0].request.batch.clientImportId,value=>value.parts[1].request.items[0].barcode=value.parts[0].request.items[0].barcode]){
 const value=structuredClone(plan);mutate(value);assert.equal(contract.parseRecoveryPlan(value,original,originalId,trust),null);}
});
test('contributor proof preserves omitted/null intent and refuses rejected legacy prices as applied evidence',()=>{
 const raw=rawOriginal();const original=contract.parseLargeOriginal(raw,trust);const id='04000000-0000-4000-8000-000000000094';
 const contributor={business:original,rawItems:raw.items,receiptSha256:contract.sha256('ack'),productByClientId:new Map([['row-0','80000000-0000-4000-8000-000000000094']])};
 const contributors=new Map([[id,contributor]]);const plan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',parts:[],coverage:[{clientItemId:'row-0',kind:'accepted_contributor',verifiedContributorId:id,contributorClientItemId:'row-0',desiredItem:raw.items[0]}]};
 assert.ok(contract.parseRecoveryPlan(plan,original,originalId,trust,contributors));
 const missing=structuredClone(plan);missing.coverage[0].desiredItem.quantity=null;delete raw.items[0].quantity;assert.equal(contract.parseRecoveryPlan(missing,original,originalId,trust,contributors),null);
 raw.items[0].retailPrice=2147483648;plan.coverage[0].desiredItem=raw.items[0];assert.equal(contract.parseRecoveryPlan(plan,original,originalId,trust,contributors),null);
});
test('correction child uses verified original reference and global product duplicate/CAS input is bound',()=>{
 const raw=rawOriginal(2);const original=contract.parseLargeOriginal(raw,trust);const correction=JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/correction.request.json'));
 const item={...correction.correction.items[0],clientItemId:'row-0'};
 const plan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'correction',parts:[{index:0,request:{schemaVersion:'pos-catalog-import-correction-v1',recoveryOf:{verifiedOriginalId:originalId},correction:{...correction.correction,items:[item]}}}],coverage:[{clientItemId:'row-0',kind:'child',partIndex:0,childClientItemId:'row-0'},{clientItemId:'row-1',kind:'original_accepted'}]};
 const result=contract.parseRecoveryPlan(plan,original,originalId,trust);assert.ok(result);const next=structuredClone(plan);next.parts[0].request.correction.items[0].baseSnapshot.retailPrice++;
 assert.notEqual(contract.parseRecoveryPlan(next,original,originalId,trust).planCanonicalHash,result.planCanonicalHash);
 const wrong=structuredClone(plan);wrong.parts[0].request.recoveryOf.verifiedOriginalId=planId;assert.equal(contract.parseRecoveryPlan(wrong,original,originalId,trust),null);
 assert.ok(recovery.parsePosCatalogImportCorrection({...plan.parts[0].request,...trust},original));
});

test('correction plan carries finite DB snapshot precision without repeated original amplification',()=>{
 const raw=rawOriginal(5000);const original=contract.parseLargeOriginal(raw,trust);const template=JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/correction.request.json')).correction;
 const parts=[];const coverage=[];
 for(let at=0;at<5000;at+=1000){const index=parts.length;const items=raw.items.slice(at,at+1000).map((item,n)=>({...template.items[0],clientItemId:item.clientItemId,
 remoteProductId:`${(at+n+1).toString(16).padStart(8,'0')}-0000-4000-8000-000000000094`,fieldMask:["retailPrice","purchasePrice"],baseSnapshot:{retailPrice:1e19,purchasePrice:900},changes:{retailPrice:1201,purchasePrice:901}}));
 parts.push({index,request:{schemaVersion:'pos-catalog-import-correction-v1',recoveryOf:{verifiedOriginalId:originalId},correction:{...template,clientImportId:`child-${index}`,idempotencyKey:`child-key-${index}`,items}}});
 coverage.push(...items.map(item=>({clientItemId:item.clientItemId,kind:'child',partIndex:index,childClientItemId:item.clientItemId})));}
 const rawPlan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'correction',parts,coverage};const packet=uploaded(rawPlan,'plan');assert.ok(contract.rebuildUpload(packet));
 const parsed=contract.parseRecoveryPlan(rawPlan,original,originalId,trust);assert.ok(parsed);assert.ok(Buffer.byteLength(JSON.stringify(parsed))<Buffer.byteLength(JSON.stringify(rawPlan))*1.3);
 assert.ok(parsed.parts.every(child=>!('original' in child.normalized)));assert.ok(parsed.parts.every(child=>child.normalized.originalCanonicalPayloadHash===original.payloadHash));
});
test('contributor invalid stockQuantity alias cannot prove an applied quantity',()=>{
 const raw=rawOriginal();delete raw.items[0].quantity;raw.items[0].stockQuantity=-1;const original=contract.parseLargeOriginal(raw,trust);const id='04000000-0000-4000-8000-000000000094';
 const contributor={business:original,rawItems:raw.items,receiptSha256:contract.sha256('ack'),productByClientId:new Map([['row-0','80000000-0000-4000-8000-000000000094']])};
 const plan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',parts:[],coverage:[{clientItemId:'row-0',kind:'accepted_contributor',verifiedContributorId:id,contributorClientItemId:'row-0',desiredItem:raw.items[0]}]};
 assert.equal(contract.parseRecoveryPlan(plan,original,originalId,trust,new Map([[id,contributor]])),null);
});
test('supersedes binds predecessor retirement hashes and accepted immutable part proof',()=>{
 const raw=rawOriginal();const original=contract.parseLargeOriginal(raw,trust);const predecessor='05000000-0000-4000-8000-000000000094';
 const supersedes={planId:predecessor,retiredChildren:[]};const plan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',supersedes,parts:[],coverage:[{clientItemId:'row-0',kind:'accepted_plan_part',contributorPartIndex:0,contributorClientItemId:'row-0'}]};
 const proof={receiptSha256:contract.sha256('ack'),canonicalPayloadHash:contract.sha256('child'),productByClientId:new Map([['row-0',{remoteProductId:'80000000-0000-4000-8000-000000000094',barcode:'MULTI-0',originalClientItemId:'row-0',itemStatus:'accepted'}]])};
 const proofs=new Map([[`${predecessor}:0`,proof]]);const result=contract.parseRecoveryPlan(plan,original,originalId,trust,new Map(),proofs);assert.ok(result);
 assert.equal(contract.parseRecoveryPlan(plan,original,originalId,trust),null);const missing=structuredClone(plan);delete missing.supersedes;assert.equal(contract.parseRecoveryPlan(missing,original,originalId,trust,new Map(),proofs),null);
 const duplicate=structuredClone(plan);duplicate.supersedes.retiredChildren=[{partIndex:1,canonicalPayloadHash:contract.sha256('retire')},{partIndex:1,canonicalPayloadHash:contract.sha256('retire')}];assert.equal(contract.parseRecoveryPlan(duplicate,original,originalId,trust,new Map(),proofs),null);
});

test('a NoChange contributor cannot prove economic intent even with historical product mapping',()=>{
 const raw=rawOriginal();raw.items[0].changeKind='no_change';const original=contract.parseLargeOriginal(raw,trust);const id='04000000-0000-4000-8000-000000000094';
 const contributor={rawItems:raw.items,receiptSha256:contract.sha256('ack'),productByClientId:new Map([['row-0','80000000-0000-4000-8000-000000000094']])};
 const plan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',parts:[],coverage:[{clientItemId:'row-0',kind:'accepted_contributor',verifiedContributorId:id,contributorClientItemId:'row-0',desiredItem:raw.items[0]}]};
 assert.equal(contract.parseRecoveryPlan(plan,original,originalId,trust,new Map([[id,contributor]])),null);
});

test('sixty-thousand correction rows normalize linearly across sixty bounded children',()=>{
 const raw=rawOriginal(60000);const original=contract.parseLargeOriginal(raw,trust);const template=JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/correction.request.json')).correction;
 const parts=[];const coverage=[];
 for(let at=0;at<60000;at+=1000){const index=parts.length;const items=raw.items.slice(at,at+1000).map((item,n)=>({clientItemId:item.clientItemId,
 remoteProductId:`${(at+n+1).toString(16).padStart(8,'0')}-0000-4000-8000-000000000094`,baseRevision:template.items[0].baseRevision,
 fieldMask:['retailPrice'],baseSnapshot:{retailPrice:1200},changes:{retailPrice:1201}}));
 parts.push({index,request:{schemaVersion:'pos-catalog-import-correction-v1',recoveryOf:{verifiedOriginalId:originalId},correction:{...template,clientImportId:`sixty-child-${index}`,idempotencyKey:`sixty-key-${index}`,items}}});
 coverage.push(...items.map(item=>({clientItemId:item.clientItemId,kind:'child',partIndex:index,childClientItemId:item.clientItemId})));}
 const input={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'correction',parts,coverage};const result=contract.parseRecoveryPlan(input,original,originalId,trust);
 assert.equal(result?.itemCount,60000);assert.equal(result.parts.length,60);assert.ok(result.parts.every(part=>!('original' in part.normalized)));
 assert.ok(Buffer.byteLength(JSON.stringify(result))<Buffer.byteLength(JSON.stringify(input))*1.3);
});

// Own immutable skipped membership is distinct from an unrelated NoChange proof.
test('mixed ancestor ACK carries skipped membership without product or economic evidence',()=>{
 const raw=rawOriginal(2);const original=contract.parseLargeOriginal(raw,trust);const predecessor='05000000-0000-4000-8000-000000000094';
 const plan={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',supersedes:{planId:predecessor,retiredChildren:[]},parts:[],coverage:raw.items.map(item=>({clientItemId:item.clientItemId,kind:'accepted_plan_part',contributorPartIndex:0,contributorClientItemId:item.clientItemId}))};
 const proof={receiptSha256:contract.sha256('mixed-ack'),canonicalPayloadHash:contract.sha256('child'),productByClientId:new Map([['row-0',{remoteProductId:'80000000-0000-4000-8000-000000000094',barcode:'MULTI-0',originalClientItemId:'row-0',itemStatus:'accepted'}],['row-1',{remoteProductId:null,barcode:'MULTI-0',originalClientItemId:'row-1',itemStatus:'skipped'}]])};
 const proofs=new Map([[`${predecessor}:0`,proof]]);const parsed=contract.parseRecoveryPlan(plan,original,originalId,trust,new Map(),proofs);
 assert.ok(parsed);assert.equal(parsed.coverage[1].contributorItemStatus,'skipped');assert.equal(parsed.coverage[1].contributorRemoteProductId,null);
 proof.productByClientId.delete('row-1');assert.equal(contract.parseRecoveryPlan(plan,original,originalId,trust,new Map(),proofs),null);
});

test('explicit original-to-new-child bijection survives accepted ancestor lineage',()=>{
 const raw=rawOriginal(2);const original=contract.parseLargeOriginal(raw,trust);const plan=replacement(structuredClone(raw));
 plan.parts[0].request.items.forEach((item,i)=>item.clientItemId=`new-child-${i}`);plan.coverage.forEach((entry,i)=>entry.childClientItemId=`new-child-${i}`);
 const parsed=contract.parseRecoveryPlan(plan,original,originalId,trust);assert.ok(parsed);assert.equal(parsed.coverage[0].clientItemId,'row-0');assert.equal(parsed.parts[0].items[0].clientItemId,'new-child-0');
 const mismatch=structuredClone(plan);mismatch.coverage[1].childClientItemId='new-child-0';assert.equal(contract.parseRecoveryPlan(mismatch,original,originalId,trust),null);
 const swapped=structuredClone(plan);swapped.coverage[0].childClientItemId='new-child-1';swapped.coverage[1].childClientItemId='new-child-0';assert.ok(contract.parseRecoveryPlan(swapped,original,originalId,trust));
 const edited=structuredClone(plan);edited.parts[0].request.items[0].barcode='CORRECTED-CODE';assert.ok(contract.parseRecoveryPlan(edited,original,originalId,trust));
 const predecessor='05000000-0000-4000-8000-000000000094';const successor={schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',supersedes:{planId:predecessor,retiredChildren:[]},parts:[],coverage:raw.items.map((item,i)=>({clientItemId:item.clientItemId,kind:'accepted_plan_part',contributorPartIndex:0,contributorClientItemId:`new-child-${i}`}))};
 const proof={receiptSha256:contract.sha256('ack'),canonicalPayloadHash:contract.sha256('child'),productByClientId:new Map(raw.items.map((item,i)=>[`new-child-${i}`,{originalClientItemId:item.clientItemId,remoteProductId:`${(i+1).toString().padStart(8,'0')}-0000-4000-8000-000000000094`,barcode:item.barcode,itemStatus:'accepted'}]))};
 assert.ok(contract.parseRecoveryPlan(successor,original,originalId,trust,new Map(),new Map([[`${predecessor}:0`,proof]])));
 proof.productByClientId.get('new-child-0').originalClientItemId='row-1';assert.equal(contract.parseRecoveryPlan(successor,original,originalId,trust,new Map(),new Map([[`${predecessor}:0`,proof]])),null);
});
