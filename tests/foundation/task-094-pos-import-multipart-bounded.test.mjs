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
const paging=module(resolve('src/server/pos-auth/catalog-import-multipart-paging.ts'));
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
test('manifest paging preserves existing JSON.stringify byte order and immutable metadata',()=>{
 const parts=Array.from({length:2048},(_,index)=>({index,byteLength:262144,sha256:contract.sha256(`chunk-${index}`)}));
 for(const mode of ['ordinary','correction','plan']) {const header={mode:mode==='plan'?'plan':'original',...(mode==='plan'?{verifiedOriginalId:originalId}:{originalKind:mode,declaredPayloadHash:'legacy-outbox-declaration'}),totalByteLength:536870912,rawSha256:contract.sha256('whole')};
 const expected=JSON.stringify({...header,parts});const pages=[];let prefix;
 for(let offset=0;offset<parts.length;offset+=256){const page=paging.parseManifestRegistration({...header,uploadId:originalId,partCount:2048,manifestSha256:contract.sha256(expected),offset,parts:parts.slice(offset,offset+256)});assert.ok(page);prefix??=page.canonicalPrefix;assert.equal(page.canonicalPrefix,prefix);pages.push(page.canonicalPartsJson.slice(1,-1));assert.ok(Buffer.byteLength(JSON.stringify(page))<262144);}
 assert.equal(prefix+pages.join(',')+']}',expected);}
 for(const input of [{offset:1},{partCount:2049},{parts:[{index:0,byteLength:262145,sha256:contract.sha256('part')}]},{originalKind:null}]){assert.equal(paging.parseManifestRegistration({mode:'original',originalKind:'ordinary',declaredPayloadHash:'legacy-outbox-declaration',totalByteLength:262144,rawSha256:contract.sha256('raw'),uploadId:originalId,partCount:1,manifestSha256:contract.sha256('manifest'),offset:0,parts:[{index:0,byteLength:262144,sha256:contract.sha256('part')}],...input}),null);}
});
test('bounded official normalization composes exact full canonical hash including global fallback ordinals',()=>{
 const raw=rawOriginal(7);raw.batch.previewFingerprint='  abc\tdef  ';raw.appVersion='fixture-version';
 for(let i=0;i<raw.items.length;i++){delete raw.items[i].clientItemId;delete raw.items[i].rowNumber;raw.items[i].barcode=`UNICODE-${i}`;raw.items[i].productName='中文名稱';raw.items[i].diffSummary='old\u2028new';}
 raw.items[3].clientItemId='invalid ID !';raw.items[4].clientItemId='row-1';raw.items[4].rowNumber='99';
 // Avoid intentional fallback collision with row-1: explicit ID is a distinct token.
 raw.items[4].clientItemId='explicit-row-1';
 const full=contract.parseLargeOriginal(raw,trust);assert.ok(full);const {items,...header}=raw;const normalized=[];const fragments=[];let prefix,suffix;
 for(let offset=0;offset<items.length;offset+=2){const page=paging.normalizeOriginalPage({header,items:items.slice(offset,offset+2),offset,declaredPayloadHash:request.payloadHash},trust);assert.ok(page);prefix??=page.canonicalPrefix;suffix??=page.canonicalSuffix;assert.equal(prefix,page.canonicalPrefix);assert.equal(suffix,page.canonicalSuffix);normalized.push(...page.items);fragments.push(page.canonicalItemsJson.slice(1,-1));}
 assert.equal(JSON.stringify(normalized),JSON.stringify(full.items));assert.equal(contract.sha256(prefix+fragments.join(',')+suffix),full.payloadHash);assert.equal(normalized[3].clientItemId,'row-4');assert.equal(normalized[5].rowNumber,6);
});
test('paged bytes enforce unchanged chunk SHA and normalization rejects precision and byte excess',()=>{
 const bytes=Buffer.from('原始\u2028JSON');const input={uploadId:originalId,manifestSha256:contract.sha256('manifest'),partIndex:2047,sha256:contract.sha256(bytes),contentBase64:bytes.toString('base64')};assert.ok(paging.parsePagedBytes(input));
 for(const delta of [{partIndex:2048},{sha256:contract.sha256('different')},{contentBase64:bytes.toString('base64')+'='}])assert.equal(paging.parsePagedBytes({...input,...delta}),null);
 const raw=rawOriginal();const {items,...header}=raw;assert.equal(paging.normalizeOriginalPage({header,items:[{...items[0],retailPrice:9007199254740992}],offset:0,declaredPayloadHash:request.payloadHash},trust),null);
 assert.equal(paging.normalizeOriginalPage({header,items:[{...items[0],ignored:'x'.repeat(262144)}],offset:0,declaredPayloadHash:request.payloadHash},trust),null);
});
test('ordinary child page canonical templates reconstruct the full official child without mutating immutable input',()=>{
 const raw=rawOriginal(7);raw.batch.attemptCount=1;raw.batch.clientImportId='new-child-full';raw.batch.idempotencyKey='new-child-idem';raw.payloadHash='new-child-declaration';
 const rootRaw=rawOriginal(7);const original=contract.parseLargeOriginal(rootRaw,trust);const root=contract.businessOriginal(original);
 const full=contract.parseRecoveryPlan({schemaVersion:contract.PLAN_SCHEMA,planId,verifiedOriginalId:originalId,mode:'replacement',parts:[{index:0,request:raw}],coverage:root.items.map((item,at)=>({clientItemId:item.clientItemId,kind:'child',partIndex:0,childClientItemId:raw.items[at].clientItemId}))},original,originalId,trust);
 assert.ok(full);const {items,...header}=raw;const fragments=[];let prefix,suffix,template;
 for(let offset=0;offset<items.length;offset+=2){const p=paging.normalizeChildPage({header,root:{...root,items:root.items.slice(0,1)},verifiedOriginalId:originalId,mode:'replacement',partIndex:0,offset,items:items.slice(offset,offset+2)},trust);assert.ok(p);prefix??=p.canonicalPrefix;suffix??=p.canonicalSuffix;template??=p.planTemplate;assert.equal(JSON.stringify(template),JSON.stringify(p.planTemplate));fragments.push(p.canonicalItemsJson.slice(1,-1));}
 const array='['+fragments.join(',')+']';const hash=contract.sha256(prefix+fragments.join(',')+suffix);assert.equal(hash,full.parts[0].payloadHash);
 const json=template.map(piece=>typeof piece==='string'?piece:piece.slot==='items'?array:JSON.stringify(hash)).join('');assert.equal(json,JSON.stringify(full.parts[0]));
});
test('bounded frame rejects whole RPC/header excess and does not interpolate literal slot values',()=>{
 assert.equal(paging.boundedFrame({ignored:'x'.repeat(2097152)}),false);
 const raw=rawOriginal(1);const {items,...header}=raw;assert.equal(paging.normalizeOriginalPage({header:{...header,ignored:'x'.repeat(16384)},items,offset:0,declaredPayloadHash:request.payloadHash},trust),null);
 const hash=contract.sha256('page');const literal={payloadHash:hash,declaredPayloadHash:hash,appVersion:'POS_INTERNAL_ITEMS_SLOT',items:[1],normalized:{payloadHash:hash,items:[1]}};
 const template=paging.canonicalTemplate(literal,[literal.items,literal.normalized.items],hash);const final=template.map(piece=>typeof piece==='string'?piece:piece.slot==='hash'?JSON.stringify('new-hash'):'[1,2]').join('');
 assert.deepEqual(JSON.parse(final),{...literal,payloadHash:'new-hash',items:[1,2],normalized:{payloadHash:'new-hash',items:[1,2]}});
});
