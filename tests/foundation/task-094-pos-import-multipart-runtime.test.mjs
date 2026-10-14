import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { Script, createContext } from 'node:vm';
const requireReal = createRequire(import.meta.url);
const request = JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/lookup.request.json'));
const ids = {shop:'10000000-0000-4000-8000-000000000094',device:request.shopDeviceId,staff:'20000000-0000-4000-8000-000000000094',session:request.posSessionId,owner:'50000000-0000-4000-8000-000000000094',credential:'60000000-0000-4000-8000-000000000094',batch:'70000000-0000-4000-8000-000000000094',product:'80000000-0000-4000-8000-000000000094',purchase:'90000000-0000-4000-8000-000000000094',retail:'a0000000-0000-4000-8000-000000000094'};
function load(scenario={}) {
 const calls=[]; const future='2099-01-01T00:00:00Z'; const cache=new Map();
 const lease={status:'ok',session:{pos_session_id:ids.session,shop_id:ids.shop,shop_device_id:ids.device,staff_id:ids.staff,status:'active',expires_at:future,issued_at:'2026-01-01T00:00:00Z',session_token_hash:'session',pos_device_credential_id:ids.credential,staff_credential_version:1}, credential:{pos_device_credential_id:ids.credential,shop_id:ids.shop,shop_device_id:ids.device,staff_id:ids.staff,status:'active',expires_at:future,token_hash:'device',staff_credential_version:1},device:{status:'active'},staff:{staff_id:ids.staff,shop_id:ids.shop,status:'active',credential_status:'active',credential_version:1,must_change_credential:false,locked_until:null,session_invalidated_at:null},shop:{shop_id:ids.shop,shop_status:'active',shop_code:'FIXTURE'}};
 const supabase={rpc:async(name,args)=>{calls.push({name,args}); if(name==='pos_catalog_import_scope_v1')return {data:{status:'ok',ownerUserId:ids.owner},error:null}; return {data:scenario.result?.(name,args)??{ok:true,status:'not_found',shopId:ids.shop,shopDeviceId:ids.device,clientImportId:args.p_client_import_id,idempotencyKey:args.p_idempotency_key,payloadHash:args.p_payload_hash},error:scenario.error??null};}};
 const mocks={'server-only':{}, '@/lib/supabase/admin':{resolveSupabaseAdminConfig:()=>({status:'configured'}),createSupabaseAdminClient:()=>supabase}, './runtime-boundary':{loadPosRuntimeLease:async(_,args)=>{calls.push({name:'lease',args});return scenario.denied?{status:'denied'}:lease;},writePosRuntimeAudit:async()=>{calls.push({name:'AUDIT_WRITE'});return true;}}, './tokens':{verifyPosSecret:(value,hash)=>value===(hash==='session'?request.sessionToken:request.deviceToken)}};
 function module(path) {if(cache.has(path))return cache.get(path);const file=readFileSync(path,'utf8');const output=ts.transpileModule(file,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const m={exports:{}};cache.set(path,m.exports);new Script(output,{filename:path}).runInContext(createContext({exports:m.exports,module:m,require:(id)=>{if(id in mocks)return mocks[id];if(id.startsWith('@/'))return module(resolve('src',id.slice(2)+'.ts'));if(id.startsWith('.'))return module(resolve(dirname(path),id+'.ts'));return requireReal(id);},Date,Map,Set,Buffer,Request,Response,TextDecoder,Uint8Array,URL,process,console}));return m.exports;}
 return {service:module(resolve('src/server/pos-auth/catalog-import-multipart.ts')),contract:module(resolve('src/server/pos-auth/catalog-import-multipart-contract.ts')),loadModule:module,calls};
}
const MULTI='pos-catalog-import-recovery-multipart-v1';
const originalId='01000000-0000-4000-8000-000000000094';const planId='02000000-0000-4000-8000-000000000094';
const outer={schemaVersion:MULTI,shopCode:request.shopCode,shopDeviceId:request.shopDeviceId,posSessionId:request.posSessionId,deviceToken:request.deviceToken,sessionToken:request.sessionToken};
const binding={ok:true,shopId:ids.shop,shopDeviceId:ids.device};
test('accepted multipart original/retire returns SQL validated page with no whole-ACK prefetch',async()=>{
 for(const action of ['receipt','retire']) {const page={...binding,status:'accepted',verifiedOriginalId:originalId,receiptSha256:'sha256:'+'a'.repeat(64),totalItemCount:5000,offset:0,limit:1000,complete:false,receipt:{summary:{acceptedItemCount:5000,duplicateItemCount:0,productCount:5000},items:[{clientItemId:'row-0'}],remoteProductIds:[],remotePriceIds:[]}};
 const {service,calls}=load({result:(name)=>name==='pos_catalog_import_recovery_v1'?page:undefined});const result=await service.handlePosCatalogImportMultipart(action,{...outer,verifiedOriginalId:originalId});
 assert.equal(result.status,200);assert.deepEqual(result.body.receipt,page.receipt);assert.equal(result.body.complete,false);
 const recover=calls.filter(call=>call.name==='pos_catalog_import_recovery_v1');assert.equal(recover.length,1);assert.equal(recover[0].args.p_action,action);
 assert.ok(!recover.some(call=>['read-original','read-receipt'].includes(call.args.p_action)));}
});
test('child retirement selector is exclusive and resolves only the frozen plan part',async()=>{
 const {service,calls}=load({result:()=>({...binding,status:'retired',planId,partIndex:2,oldIdentityBlocked:true,retiredAt:'2026-10-09T02:00:00.000001Z'})});
 const result=await service.handlePosCatalogImportMultipart('retire',{...outer,planId,partIndex:2});assert.equal(result.status,200);assert.equal(result.body.oldIdentityBlocked,true);
 const rpc=calls.find(call=>call.name==='pos_catalog_import_recovery_v1');assert.equal(JSON.stringify(rpc.args.p_payload),JSON.stringify({planId,partIndex:2}));
 const invalid=await service.handlePosCatalogImportMultipart('retire',{...outer,planId,partIndex:2,verifiedOriginalId:originalId});assert.equal(invalid.status,400);
});
test('paging binds same hash and exact requested range while keeping the whole ACK summary',async()=>{
 const hash='sha256:'+'a'.repeat(64);const summary={acceptedItemCount:5000,duplicateItemCount:0,productCount:5000};const {service,calls}=load({result:(name,args)=>({...binding,status:'accepted',receiptSha256:hash,totalItemCount:5000,offset:args.p_payload.offset,limit:args.p_payload.limit,complete:true,receipt:{summary,items:[]}})});
 const result=await service.handlePosCatalogImportMultipart('receipt-page',{...outer,verifiedOriginalId:originalId,receiptSha256:hash,offset:4000,limit:1000});assert.equal(result.status,200);assert.equal(result.body.offset,4000);assert.equal(result.body.complete,true);assert.deepEqual(result.body.receipt.summary,summary);
 assert.equal(calls.find(call=>call.name==='pos_catalog_import_recovery_v1').args.p_payload.offset,4000);
 for(const input of [{limit:1001},{offset:-1},{receiptSha256:'changed'},{planId,partIndex:0}])assert.equal((await service.handlePosCatalogImportMultipart('receipt-page',{...outer,verifiedOriginalId:originalId,receiptSha256:hash,offset:0,limit:1000,...input})).status,400);
});
test('current lease denial prevents private multipart reads and retired fences remain distinct',async()=>{
 const {service,calls}=load({denied:true});assert.equal((await service.handlePosCatalogImportMultipart('receipt',{...outer,verifiedOriginalId:originalId})).status,401);
 assert.ok(!calls.some(call=>call.name==='pos_catalog_import_recovery_v1'));
 const failed=load({result:()=>({ok:false,code:'auth_denied'})});assert.equal((await failed.service.handlePosCatalogImportMultipart('apply',{...outer,planId,partIndex:0})).status,401);
});

test('plan handler accepts exact skipped ancestor membership with no product mapping and rejects missing coverage',async()=>{
 const predecessor='05000000-0000-4000-8000-000000000094';const raw=structuredClone(request.originalRequest);raw.items=[{...raw.items[0],clientItemId:'row-0'},{...raw.items[0],clientItemId:'row-1',barcode:'SKIPPED-CODE',changeKind:'no_change'}];
 const rawPlan={schemaVersion:'pos-catalog-import-recovery-plan-v1',planId,verifiedOriginalId:originalId,mode:'replacement',supersedes:{planId:predecessor,retiredChildren:[]},parts:[],coverage:raw.items.map(item=>({clientItemId:item.clientItemId,kind:'accepted_plan_part',contributorPartIndex:0,contributorClientItemId:item.clientItemId}))};
 const bytes=Buffer.from(JSON.stringify(rawPlan));const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
 const packet={...binding,manifestSha256:hash('manifest'),manifest:{mode:'plan',totalByteLength:bytes.length,rawSha256:hash(bytes),parts:[{index:0,byteLength:bytes.length,sha256:hash(bytes)}]},parts:[{index:0,contentBase64:bytes.toString('base64')}]};
 let missing=false;let split=false;let changedHash=false;let contract;const mock=load({result:(name,args)=>{if(name!=='pos_catalog_import_recovery_v1')return undefined;switch(args.p_action){
 case 'read-upload':return packet;case 'read-original':return {...binding,status:'verified',verifiedOriginalId:originalId,originalSchemaVersion:'pos-catalog-import-v1',normalizedRequest:contract.businessOriginal(contract.parseLargeOriginal(raw,contract.parseRecoveryTrust(outer)))};
 case 'read-plan-part':if(split && args.p_payload.clientItemIds.length>1)return {ok:false,code:'projection_too_large'};return {...binding,status:'accepted',receiptValidated:true,receiptSha256:hash(changedHash && args.p_payload.clientItemIds[0]==='row-1'?'changed-ack':'ack'),canonicalPayloadHash:hash('child'),items:[{clientItemId:'row-0',originalClientItemId:'row-0',barcode:raw.items[0].barcode,itemStatus:'accepted',economic:true,remoteProductId:ids.product},...(!missing?[{clientItemId:'row-1',originalClientItemId:'row-1',barcode:'SKIPPED-CODE',itemStatus:'skipped',economic:false,remoteProductId:null}]:[])].filter(item=>args.p_payload.clientItemIds.includes(item.clientItemId))};
 case 'plan':return {...binding,status:'complete'};default:return undefined;}}});contract=mock.contract;
 const result=await mock.service.handlePosCatalogImportMultipart('plan',{...outer,uploadId:'03000000-0000-4000-8000-000000000094'});assert.equal(result.status,200);
 const prepared=mock.calls.find(call=>call.args?.p_action==='plan').args.p_payload.plan;assert.equal(prepared.coverage[1].contributorItemStatus,'skipped');assert.equal(prepared.coverage[1].contributorRemoteProductId,null);
 split=true;const before=mock.calls.length;const bounded=await mock.service.handlePosCatalogImportMultipart('plan',{...outer,uploadId:'03000000-0000-4000-8000-000000000094'});assert.equal(bounded.status,200);
 assert.deepEqual(mock.calls.slice(before).filter(call=>call.args?.p_action==='read-plan-part').map(call=>call.args.p_payload.clientItemIds.length),[2,1,1]);
 changedHash=true;const altered=await mock.service.handlePosCatalogImportMultipart('plan',{...outer,uploadId:'03000000-0000-4000-8000-000000000094'});assert.equal(altered.status,409);changedHash=false;
 missing=true;const absent=await mock.service.handlePosCatalogImportMultipart('plan',{...outer,uploadId:'03000000-0000-4000-8000-000000000094'});assert.equal(absent.status,409);assert.equal(absent.body.code,'contributor_receipt_unavailable');
});
test('lost child retirement response resumes the exact explicit operation without treating conflict as permission',async()=>{
 const timestamp='2026-10-09T02:00:00.000001Z';const trace=[];
 const {service,calls}=load({result:(name,args)=>{if(name!=='pos_catalog_import_recovery_v1')return undefined;trace.push(args.p_action);return args.p_action==='receipt'?{...binding,status:'conflict',reason:'identity_retired',planId,partIndex:2}: {...binding,status:'retired',planId,partIndex:2,oldIdentityBlocked:true,retiredAt:timestamp};}});
 const observed=await service.handlePosCatalogImportMultipart('receipt',{...outer,planId,partIndex:2});assert.equal(observed.status,200);assert.equal(observed.body.status,'conflict');assert.equal(observed.body.oldIdentityBlocked,undefined);
 for(let repeat=0;repeat<2;repeat++){const proof=await service.handlePosCatalogImportMultipart('retire',{...outer,planId,partIndex:2});assert.equal(proof.body.status,'retired');assert.equal(proof.body.retiredAt,timestamp);assert.equal(proof.body.oldIdentityBlocked,true);}
 assert.deepEqual(trace,['receipt','retire','retire']);assert.ok(calls.filter(call=>call.name==='pos_catalog_import_recovery_v1').every(call=>JSON.stringify(call.args.p_payload)===JSON.stringify({planId,partIndex:2})));
});
test('phased normalization uses only DB-derived bounded rows, serializes server fragments and reuses exact page acknowledgment',async()=>{
 const raw=structuredClone(request.originalRequest);delete raw.batch.attemptCount;const {items,...header}=raw;const rawHash='sha256:'+'c'.repeat(64);let completed=false;
 const ack={...binding,status:'normalizing',phase:'complete',uploadId:originalId,nextCursor:null,rawSha256:rawHash};
 const mock=load({result:(name,args)=>{if(name!=='pos_catalog_import_recovery_v1')return undefined;
  if(args.p_action==='read-normalize-page')return completed?{...binding,pageComplete:true,response:ack}:{...binding,stage:'items',offset:0,header,items,declaredPayloadHash:request.payloadHash,rawSha256:rawHash};
  if(args.p_action==='store-normalize-page'){completed=true;return ack;}return undefined;}});
 const first=await mock.service.handlePosCatalogImportMultipart('finalize',{...outer,phase:'normalize',uploadId:originalId,cursor:0,rawSha256:rawHash,items:[{tampered:true}]});assert.equal(first.status,200);
 const normalized=mock.calls.find(call=>call.args?.p_action==='store-normalize-page').args.p_payload;assert.equal(normalized.items[0].barcode,items[0].barcode);assert.equal(normalized.canonicalRows[0],JSON.stringify(normalized.items[0]));assert.equal(normalized.items[0].tampered,undefined);
 const repeat=await mock.service.handlePosCatalogImportMultipart('finalize',{...outer,phase:'normalize',uploadId:originalId,cursor:0,rawSha256:rawHash});assert.equal(JSON.stringify(first.body),JSON.stringify(repeat.body));assert.equal(mock.calls.filter(call=>call.args?.p_action==='store-normalize-page').length,1);
});

test('root-capacity fallback changes only the plan manifest envelope and preserves raw bytes and original refusal',async()=>{
 const bytes=Buffer.from('{}');const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');const descriptor={index:0,byteLength:bytes.length,sha256:hash(bytes)};
 const {service,calls}=load({result:(name,args)=>{if(name!=='pos_catalog_import_recovery_v1')return undefined;if(args.p_action==='upload')return {ok:false,code:args.p_payload.manifest.mode==='plan'?'phased_upload_required':'quota_exceeded'};if(args.p_action==='manifest')return {...binding,status:'registering',uploadId:planId,manifestSha256:args.p_payload.manifestSha256,nextOffset:1};return undefined;}});
 const old={...outer,uploadId:planId,mode:'plan',totalByteLength:bytes.length,rawSha256:hash(bytes),parts:[descriptor],partIndex:0,contentBase64:bytes.toString('base64')};
 const blocked=await service.handlePosCatalogImportMultipart('upload',old);assert.equal(blocked.status,409);assert.equal(blocked.body.code,'phased_upload_required');
 const header={mode:'plan',verifiedOriginalId:originalId,totalByteLength:bytes.length,rawSha256:hash(bytes)};const phased=await service.handlePosCatalogImportMultipart('upload',{...outer,...header,phase:'manifest',uploadId:planId,partCount:1,offset:0,parts:[descriptor],manifestSha256:hash(JSON.stringify({...header,parts:[descriptor]}))});assert.equal(phased.status,200);
 const original=await service.handlePosCatalogImportMultipart('upload',{...old,mode:'original',originalKind:'ordinary',declaredPayloadHash:'fixture-original-hash'});assert.equal(original.status,409);assert.equal(original.body.code,'quota_exceeded');
 const operations=calls.filter(call=>call.name==='pos_catalog_import_recovery_v1');assert.deepEqual(operations.map(call=>call.args.p_action),['upload','manifest','upload']);assert.equal(operations[0].args.p_payload.manifest.rawSha256,operations[1].args.p_payload.header.rawSha256);assert.equal(operations[0].args.p_payload.uploadId,operations[1].args.p_payload.uploadId);assert.equal(operations[0].args.p_payload.contentBase64,bytes.toString('base64'));
});


test('only seven literal recovery actions dispatch; unknown paths and oversized bodies cannot reach authorized RPC',async()=>{
 const denied=load({denied:true});const deniedRoute=denied.loadModule(resolve('src/app/api/pos/catalog/import-recovery/[action]/route.ts'));
 const post=(body,action)=>deniedRoute.POST(new Request('https://example.invalid/api/pos/catalog/import-recovery/'+action,{method:'POST',headers:{'content-type':'application/json'},body}),{params:Promise.resolve({action})});
 for(const action of ['cleanup','retire-all','manifest','constructor','apply/../retire']){
   const result=await post(JSON.stringify({...outer,verifiedOriginalId:originalId}),action);assert.equal(result.status,404);assert.equal((await result.json()).code,'not_found');
 }
 assert.equal(denied.calls.length,0);
 for(const action of denied.service.RECOVERY_ACTIONS){const result=await post(JSON.stringify({...outer,verifiedOriginalId:originalId}),action);assert.equal(result.status,401);}
 assert.ok(!denied.calls.some(call=>call.name==='pos_catalog_import_recovery_v1'));
 const allowed=load();const route=allowed.loadModule(resolve('src/app/api/pos/catalog/import-recovery/[action]/route.ts'));
 const base=JSON.stringify({...outer,verifiedOriginalId:originalId,padding:''});const body=JSON.stringify({...outer,verifiedOriginalId:originalId,padding:'x'.repeat(524288-Buffer.byteLength(base))});assert.equal(Buffer.byteLength(body),524288);
 const requestFor=body=>new Request('https://example.invalid/api/pos/catalog/import-recovery/receipt',{method:'POST',headers:{'content-type':'application/json'},body});
 const limit=await route.POST(requestFor(body),{params:Promise.resolve({action:'receipt'})});assert.equal(limit.status,200);assert.equal(limit.headers.get('cache-control'),'no-store');
 const before=allowed.calls.length;const over=await route.POST(requestFor(body+' '),{params:Promise.resolve({action:'receipt'})});assert.equal(over.status,400);assert.equal(allowed.calls.length,before);
 for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS']){const result=await route[method](new Request('https://example.invalid'));assert.equal(result.status,405);assert.equal(result.headers.get('allow'),'POST');}
});


test('multipart service returns typed identity and quota refusals without a retirement proof',async()=>{
 for(const code of ['quota_exceeded','identity_conflict']){
  const {service,calls}=load({result:()=>({ok:false,code})});const result=await service.handlePosCatalogImportMultipart('retire',{...outer,planId,partIndex:2});assert.equal(result.status,409);assert.equal(result.body.code,code);assert.equal(result.body.oldIdentityBlocked,undefined);
  const operation=calls.filter(call=>call.name==='pos_catalog_import_recovery_v1');assert.equal(operation.length,1);assert.equal(operation[0].args.p_action,'retire');
 }
});
