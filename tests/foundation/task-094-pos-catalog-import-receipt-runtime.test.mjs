import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
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
 const supabase={rpc:async(name,args)=>{calls.push({name,args}); if(name==='pos_catalog_import_scope_v1')return {data:{status:'ok',ownerUserId:ids.owner},error:null}; return {data:scenario.result?.(args)??{ok:true,status:'not_found',shopId:ids.shop,shopDeviceId:ids.device,clientImportId:args.p_client_import_id,idempotencyKey:args.p_idempotency_key,payloadHash:args.p_payload_hash},error:scenario.error??null};}};
 const mocks={'server-only':{}, '@/lib/supabase/admin':{resolveSupabaseAdminConfig:()=>({status:'configured'}),createSupabaseAdminClient:()=>supabase}, './runtime-boundary':{loadPosRuntimeLease:async(_,args)=>{calls.push({name:'lease',args});return scenario.denied?{status:'denied'}:lease;},writePosRuntimeAudit:async()=>{calls.push({name:'AUDIT_WRITE'});return true;}}, './tokens':{verifyPosSecret:(value,hash)=>value===(hash==='session'?request.sessionToken:request.deviceToken)}};
 function module(path) {if(cache.has(path))return cache.get(path);const file=readFileSync(path,'utf8');const output=ts.transpileModule(file,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const m={exports:{}};cache.set(path,m.exports);new Script(output,{filename:path}).runInContext(createContext({exports:m.exports,module:m,require:(id)=>{if(id in mocks)return mocks[id];if(id.startsWith('@/'))return module(resolve('src',id.slice(2)+'.ts'));if(id.startsWith('.'))return module(resolve(dirname(path),id+'.ts'));return requireReal(id);},Date,Map,Set,Buffer,process,console}));return m.exports;}
 return {service:module(resolve('src/server/pos-auth/catalog-import-receipt.ts')),correctionService:module(resolve('src/server/pos-auth/catalog-import-correction.ts')),calls};
}
function persistedAck(){return {ok:true,batchId:ids.batch,status:'accepted',items:[{clientItemId:'receipt-fixture-row-1',barcode:'RECEIPT-FIXTURE-1',remoteProductId:ids.product,remotePriceId:ids.retail,priceType:'retail',status:'accepted'}],remoteProductIds:[{clientItemId:'receipt-fixture-row-1',barcode:'RECEIPT-FIXTURE-1',remoteProductId:ids.product}],remotePriceIds:[{clientItemId:'receipt-fixture-row-1',barcode:'RECEIPT-FIXTURE-1',remoteProductId:ids.product,remotePriceId:ids.purchase,priceType:'purchase'},{clientItemId:'receipt-fixture-row-1',barcode:'RECEIPT-FIXTURE-1',remoteProductId:ids.product,remotePriceId:ids.retail,priceType:'retail'}],summary:{acceptedItemCount:1,duplicateItemCount:0,productCount:1}};}
const snapshots=()=>[{clientItemId:'receipt-fixture-row-1',remoteProductId:ids.product,snapshotStatus:'available',baseRevision:'2026-10-08T19:55:00.000001Z',retailPrice:1200,purchasePrice:900,stockQuantity:1.25}];
const binding=args=>({ok:true,shopId:ids.shop,shopDeviceId:ids.device,clientImportId:args.p_client_import_id,idempotencyKey:args.p_idempotency_key,payloadHash:args.p_payload_hash});
test('receipt recalculates legacy canonical hash while preserving the raw Win7 hash',()=>{const {service}=load();const parsed=service.parsePosCatalogImportReceipt(request);assert.ok(parsed);assert.match(parsed.payloadHash,/^sha256:[a-f0-9]{64}$/);assert.equal(parsed.declaredPayloadHash,request.payloadHash);assert.notEqual(parsed.payloadHash,request.payloadHash);});
test('request rejects mismatched outer IDs/hash and altered inner schema',()=>{for(const key of ['clientImportId','idempotencyKey','payloadHash']){const {service}=load();assert.equal(service.parsePosCatalogImportReceipt({...request,[key]:'changed-fixture-value'}),null);}assert.equal(load().service.parsePosCatalogImportReceipt({...request,originalRequest:{...request.originalRequest,schemaVersion:'changed'}}),null);});
test('old nested trust does not authorize or invalidate current outer trust',async()=>{const {service}=load();const changed={...request,originalRequest:{...request.originalRequest,deviceToken:'old',sessionToken:'old',shopDeviceId:request.shopDeviceId,posSessionId:'old'}};const result=await service.handlePosCatalogImportReceipt(changed);assert.equal(result.status,200);const denied=await service.handlePosCatalogImportReceipt({...changed,sessionToken:'wrong-current'});assert.equal(denied.status,401);});
test('not_found is a noncommittable snapshot and lookup never calls apply or audit',async()=>{const {service,calls}=load();const result=await service.handlePosCatalogImportReceipt(request);assert.equal(result.body.status,'not_found');assert.equal(result.body.snapshotOnly,true);assert.equal(result.body.replacementAllowed,false);assert.ok(!calls.some(x=>/apply|AUDIT/.test(x.name)));});
test('accepted receipt returns the complete persisted ACK unchanged on repeated lookups',async()=>{const ack=persistedAck();const {service,calls}=load({result:args=>({...binding(args),status:'accepted',receipt:ack,currentProductSnapshots:snapshots()})});for(let i=0;i<2;i++){const result=await service.handlePosCatalogImportReceipt(request);assert.equal(result.body.status,'accepted');assert.deepEqual(result.body.receipt,ack);}assert.equal(calls.filter(x=>x.name==='pos_catalog_import_receipt_v1').length,2);});
test('malformed or incomplete accepted ACK fails closed without changing catalog',async()=>{for(const ack of [{},{...persistedAck(),remotePriceIds:[]},{...persistedAck(),batchId:'invalid'},{...persistedAck(),summary:{acceptedItemCount:0,duplicateItemCount:0,productCount:1}}]){const {service,calls}=load({result:args=>({...binding(args),status:'accepted',receipt:ack,currentProductSnapshots:snapshots()})});assert.equal((await service.handlePosCatalogImportReceipt(request)).status,409);assert.ok(!calls.some(x=>/apply|AUDIT/.test(x.name)));}});
test('shop/device and requested tuple mismatches from backend are refused',async()=>{for(const key of ['shopId','shopDeviceId','clientImportId','idempotencyKey','payloadHash']){const {service}=load({result:args=>({...binding(args),status:'not_found',[key]:'wrong'})});assert.equal((await service.handlePosCatalogImportReceipt(request)).status,500);}});
test('auth, transactional permission denial, conflict, and database failure stay distinct',async()=>{assert.equal((await load({denied:true}).service.handlePosCatalogImportReceipt(request)).status,401);assert.equal((await load({result:()=>({ok:false,code:'auth_denied'})}).service.handlePosCatalogImportReceipt(request)).status,401);assert.equal((await load({error:{code:'missing_rpc'}}).service.handlePosCatalogImportReceipt(request)).status,500);const result=await load({result:args=>({...binding(args),status:'conflict',reason:'identity_conflict'})}).service.handlePosCatalogImportReceipt(request);assert.equal(result.body.status,'conflict');});
test('retirement is explicit and returns a durable timestamp, never inferred from not_found',async()=>{const {service,calls}=load({result:args=>({...binding(args),status:'retired',oldIdentityBlocked:true,retiredAt:'2026-10-08T20:00:00.000Z'})});const result=await service.handlePosCatalogImportReceipt({...request,schemaVersion:'pos-catalog-import-retirement-v1'},{},true);assert.equal(result.body.status,'retired');assert.equal(result.body.oldIdentityBlocked,true);assert.ok(calls.some(x=>x.name==='pos_catalog_import_retire_v1'));assert.equal(service.parsePosCatalogImportReceipt(request,true),null);});

test('original device/shop binding cannot be silently overwritten by current trust',()=>{
 const {service}=load();
 for(const originalRequest of [{...request.originalRequest,shopDeviceId:'wrong-device'},{...request.originalRequest,shopCode:'WRONG'}])
 assert.equal(service.parsePosCatalogImportReceipt({...request,originalRequest}),null);
});
test('retired response must explicitly prove its durable old-identity fence',async()=>{
 const {service}=load({result:args=>({...binding(args),status:'retired',retiredAt:'2026-10-08T20:00:00Z',oldIdentityBlocked:false})});
 assert.equal((await service.handlePosCatalogImportReceipt({...request,schemaVersion:'pos-catalog-import-retirement-v1'},{},true)).status,500);
});

const correctionRequest=JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/correction.request.json'));
function correctionAck(){const ack=persistedAck();ack.items[0].unchangedFields=[];ack.items[0].authoritativeRevision='2026-10-08T20:00:00.000001Z';ack.remoteProductIds[0].authoritativeRevision=ack.items[0].authoritativeRevision;return ack;}
test('correction accepts only masked prices and relative quantities with new identities',()=>{
 const {correctionService}=load();assert.ok(correctionService.parsePosCatalogImportCorrection(correctionRequest));
 for(const changes of [{primaryName:'metadata'},{quantity:2},{retailPrice:null},{quantityDelta:0.0001}]){
 const input=structuredClone(correctionRequest);input.correction.items[0].fieldMask=Object.keys(changes);input.correction.items[0].changes=changes;
 assert.equal(correctionService.parsePosCatalogImportCorrection(input),null);
 }
 for(const key of ['clientImportId','idempotencyKey']){
 const input=structuredClone(correctionRequest);input.correction[key]=input.recoveryOf[key];assert.equal(correctionService.parsePosCatalogImportCorrection(input),null);
 }
});
test('correction duplicates item/product targets are refused before RPC',()=>{
 const input=structuredClone(correctionRequest);input.correction.items.push(input.correction.items[0]);
 const {correctionService}=load();assert.equal(correctionService.parsePosCatalogImportCorrection(input),null);
});
test('correction canonical hash binds original receipt, new identity, every mask/value/revision',()=>{
 const {correctionService}=load();const hash=correctionService.parsePosCatalogImportCorrection(correctionRequest).canonicalPayloadHash;
 for(const patch of ['value','revision','identity']){const input=structuredClone(correctionRequest);
 if(patch==='value')input.correction.items[0].changes.retailPrice++;
 if(patch==='revision')input.correction.items[0].baseRevision='2026-10-08T19:55:00.000002Z';
 if(patch==='identity')input.correction.clientImportId+='-changed';
 assert.notEqual(correctionService.parsePosCatalogImportCorrection(input).canonicalPayloadHash,hash);
 }
});
test('correction returns persisted revision ACK and separates raw/canonical hashes',async()=>{
 const ack=correctionAck();const {correctionService,calls}=load({result:args=>({...binding(args),status:'accepted',receipt:ack})});
 const result=await correctionService.handlePosCatalogImportCorrection(correctionRequest);
 assert.equal(result.status,200);assert.equal(result.body.status,'accepted');assert.deepEqual(result.body.receipt,ack);
 assert.equal(result.body.payloadHash,correctionRequest.correction.payloadHash);assert.notEqual(result.body.canonicalPayloadHash,result.body.payloadHash);
 assert.equal(calls.filter(x=>x.name==='pos_catalog_import_correct_v1').length,1);assert.ok(!calls.some(x=>/apply|AUDIT/.test(x.name)));
});
test('correction refuses mismapped price or product ACKs',async()=>{
 for(const defect of ['product','price','revision']){const ack=correctionAck();
 if(defect==='product')ack.remoteProductIds[0].remoteProductId=ids.staff;
 if(defect==='price')ack.remotePriceIds[0].remoteProductId=ids.staff;
 if(defect==='revision')ack.remoteProductIds[0].authoritativeRevision='wrong';
 const {correctionService}=load({result:args=>({...binding(args),status:'accepted',receipt:ack})});
 assert.equal((await correctionService.handlePosCatalogImportCorrection(correctionRequest)).status,500);
 }
});
test('current snapshots are scoped to ACK product map and remain separate from durable ACK',async()=>{
 const {service}=load({result:args=>({...binding(args),status:'accepted',receipt:persistedAck(),currentProductSnapshots:[{...snapshots()[0],remoteProductId:ids.staff}]})});
 assert.equal((await service.handlePosCatalogImportReceipt(request)).status,500);
 const {service:unavailable}=load({result:args=>({...binding(args),status:'accepted',receipt:persistedAck(),currentProductSnapshots:[{...snapshots()[0],snapshotStatus:'unavailable',baseRevision:null,retailPrice:null,purchasePrice:null,stockQuantity:null}]})});
 const result=await unavailable.handlePosCatalogImportReceipt(request);assert.equal(result.status,200);assert.deepEqual(result.body.receipt,persistedAck());
});

test('unsafe original JSON integer fails explicitly before authorization or mutation',async()=>{
 const input=structuredClone(request);input.originalRequest.items[0].retailPrice=Number.MAX_SAFE_INTEGER+1;
 const {service,calls}=load();const result=await service.handlePosCatalogImportReceipt(input);
 assert.equal(result.status,400);assert.equal(result.body.code,'original_numeric_precision_unsupported');assert.equal(calls.length,0);
});
test('safe out-of-range and bounded Int64 original text preserve historic normalized hash and raw content',async()=>{
 for(const price of [2147483648,'9223372036854775807']){
 const input=structuredClone(request);input.originalRequest.items[0].retailPrice=price;
 const originalBytes=JSON.stringify(input.originalRequest);const {service}=load();const parsed=service.parsePosCatalogImportReceipt(input);
 assert.ok(parsed);assert.equal(parsed.items[0].retailPrice,null);assert.equal(JSON.stringify(input.originalRequest),originalBytes);
 assert.equal((await service.handlePosCatalogImportReceipt(input)).body.status,'not_found');
 const ack=persistedAck();ack.items[0].priceType='purchase';ack.items[0].remotePriceId=ids.purchase;ack.remotePriceIds=ack.remotePriceIds.filter(x=>x.priceType==='purchase');
 const {service:accepted}=load({result:args=>({...binding(args),status:'accepted',receipt:ack,currentProductSnapshots:snapshots()})});
 assert.equal((await accepted.handlePosCatalogImportReceipt(input)).body.status,'accepted');
 const {service:retire}=load({result:args=>({...binding(args),status:'retired',oldIdentityBlocked:true,retiredAt:'2026-10-08T20:00:00Z'})});
 assert.equal((await retire.handlePosCatalogImportReceipt({...input,schemaVersion:'pos-catalog-import-retirement-v1'},{},true)).body.status,'retired');
 }
});

test('available current snapshots preserve nullable prices and quantities for lookup and retirement',async()=>{
 const nullable=[{...snapshots()[0],purchasePrice:null,retailPrice:null,stockQuantity:null}];
 for(const retirement of [false,true]){
 const {service,calls}=load({result:args=>({...binding(args),status:'accepted',receipt:persistedAck(),currentProductSnapshots:nullable})});
 const result=await service.handlePosCatalogImportReceipt({...request,schemaVersion:retirement?'pos-catalog-import-retirement-v1':request.schemaVersion},{},retirement);
 assert.equal(result.status,200);assert.equal(result.body.status,'accepted');assert.deepEqual(result.body.currentProductSnapshots,nullable);
 assert.ok(!calls.some(x=>/apply|AUDIT/.test(x.name)));
 }
});

test('three-row legacy original retains safe out-of-range numeric and Int64 text through lookup and retirement',async()=>{
 const input=JSON.parse(readFileSync('contracts/pos-catalog-import-receipt-v1/lookup.legacy-int64.request.json'));
 const originalBytes=JSON.stringify(input.originalRequest);const {service}=load();const parsed=service.parsePosCatalogImportReceipt(input);
 assert.ok(parsed);assert.equal(parsed.items.length,3);assert.equal(parsed.items[0].retailPrice,null);assert.equal(parsed.items[1].retailPrice,null);assert.equal(parsed.items[2].retailPrice,1200);
 assert.equal((await service.handlePosCatalogImportReceipt(input)).body.status,'not_found');
 const {service:retire}=load({result:args=>({...binding(args),status:'retired',oldIdentityBlocked:true,retiredAt:'2026-10-08T20:00:00Z'})});
 assert.equal((await retire.handlePosCatalogImportReceipt({...input,schemaVersion:'pos-catalog-import-retirement-v1'},{},true)).body.status,'retired');
 assert.equal(JSON.stringify(input.originalRequest),originalBytes);
});

function correctionLookup(retirement=false) {
 return {...request,schemaVersion:retirement?'pos-catalog-import-retirement-v1':request.schemaVersion,
  clientImportId:correctionRequest.correction.clientImportId,idempotencyKey:correctionRequest.correction.idempotencyKey,
  payloadHash:correctionRequest.correction.payloadHash,originalRequest:structuredClone(correctionRequest)};
}
test('correction child lookup and retirement rederive canonical hash using only current outer trust',async()=>{
 for(const retirement of [false,true]){
 const input=correctionLookup(retirement);input.originalRequest.sessionToken='old-session';input.originalRequest.posSessionId='old-session-id';
 const ack=correctionAck();const {service,calls}=load({result:args=>({...binding(args),status:'accepted',receipt:ack,currentProductSnapshots:snapshots()})});
 const parsed=service.parsePosCatalogImportReceipt(input,retirement);assert.ok(parsed.correctionTarget);
 const result=await service.handlePosCatalogImportReceipt(input,{},retirement);
 assert.equal(result.status,200);assert.equal(result.body.originalSchemaVersion,'pos-catalog-import-correction-v1');
 assert.deepEqual(result.body.receipt,ack);assert.equal(result.body.canonicalPayloadHash,parsed.correctionTarget.canonicalPayloadHash);
 assert.ok(!calls.some(x=>/apply|correct_v1|AUDIT/.test(x.name)));
 }
});
test('missing correction child stays snapshot-only and requires explicit retirement fence',async()=>{
 const input=correctionLookup();const {service}=load();const missing=await service.handlePosCatalogImportReceipt(input);
 assert.equal(missing.body.status,'not_found');assert.equal(missing.body.replacementAllowed,false);
 const {service:retire}=load({result:args=>({...binding(args),status:'retired',oldIdentityBlocked:true,retiredAt:'2026-10-08T20:00:00Z'})});
 const retired=await retire.handlePosCatalogImportReceipt(correctionLookup(true),{},true);
 assert.equal(retired.body.status,'retired');assert.equal(retired.body.originalSchemaVersion,'pos-catalog-import-correction-v1');
 for(const key of ['clientImportId','idempotencyKey','payloadHash']) assert.equal(service.parsePosCatalogImportReceipt({...input,[key]:'mismatched'}),null);
});
test('correction child lookup verifies durable correction ACK mapping instead of original full-import prices',async()=>{
 const ack=correctionAck();const input=correctionLookup();input.originalRequest.correction.items[0].changes.purchasePrice=900;input.originalRequest.correction.items[0].changes.retailPrice=1200;ack.items[0].unchangedFields=['purchasePrice','retailPrice'];ack.remotePriceIds=[];const {service}=load({result:args=>({...binding(args),status:'accepted',receipt:ack,currentProductSnapshots:snapshots()})});
 assert.equal((await service.handlePosCatalogImportReceipt(input)).status,200);
 ack.remoteProductIds[0].remoteProductId=ids.staff;
 assert.equal((await service.handlePosCatalogImportReceipt(input)).status,409);
});


test('baseSnapshot is exact masked durable input and binds the canonical correction hash',()=>{
 const {correctionService}=load();const original=correctionService.parsePosCatalogImportCorrection(correctionRequest);
 const changed=structuredClone(correctionRequest);changed.correction.items[0].baseSnapshot.retailPrice++;
 assert.notEqual(correctionService.parsePosCatalogImportCorrection(changed).canonicalPayloadHash,original.canonicalPayloadHash);
 for(const snapshot of [undefined,{}, {...correctionRequest.correction.items[0].baseSnapshot,metadata:1},{...correctionRequest.correction.items[0].baseSnapshot,retailPrice:'1200'}]){
 const input=structuredClone(correctionRequest);input.correction.items[0].baseSnapshot=snapshot;
 assert.equal(correctionService.parsePosCatalogImportCorrection(input),null);
 }
});
test('price ACK requires new history map or durable unchangedFields proof with matching base snapshot',async()=>{
 const noEffect=structuredClone(correctionRequest);noEffect.correction.items[0].changes.purchasePrice=900;noEffect.correction.items[0].changes.retailPrice=1200;
 const ack=correctionAck();ack.remotePriceIds=[];ack.items[0].unchangedFields=['purchasePrice','retailPrice'];
 const {correctionService}=load({result:args=>({...binding(args),status:'accepted',receipt:ack})});
 assert.equal((await correctionService.handlePosCatalogImportCorrection(noEffect)).status,200);
 for(const defect of ['missing-proof','desired-mismatch','proof-and-map']){
 const broken=structuredClone(ack);const input=structuredClone(noEffect);
 if(defect==='missing-proof')broken.items[0].unchangedFields=[];
 if(defect==='desired-mismatch')input.correction.items[0].changes.retailPrice++;
 if(defect==='proof-and-map')broken.remotePriceIds=persistedAck().remotePriceIds;
 const {correctionService:invalid}=load({result:args=>({...binding(args),status:'accepted',receipt:broken})});
 assert.equal((await invalid.handlePosCatalogImportCorrection(input)).status,500);
 }
});
test('correction ACK tolerates current renamed barcode while preserving exact original product identity',async()=>{
 const ack=correctionAck();ack.items[0]={clientItemId:ack.items[0].clientItemId,remoteProductId:ids.product,status:'accepted',authoritativeRevision:ack.items[0].authoritativeRevision,unchangedFields:[]};
 ack.remoteProductIds[0].barcode='REMOTE-CODE';for(const price of ack.remotePriceIds)price.barcode='REMOTE-CODE';
 const {correctionService}=load({result:args=>({...binding(args),status:'accepted',receipt:ack})});
 assert.equal((await correctionService.handlePosCatalogImportCorrection(correctionRequest)).status,200);
});


test('JSON MaxInt64 numeric literal is rejected while exact decimal text is not rewritten',async()=>{
 const input=structuredClone(request);input.originalRequest.items[0].retailPrice=JSON.parse('9223372036854775807');
 const {service,calls}=load();const result=await service.handlePosCatalogImportReceipt(input);
 assert.equal(result.body.code,'original_numeric_precision_unsupported');assert.equal(result.status,400);assert.equal(calls.length,0);
});

test('huge finite correction snapshot remains resolvable while its unsafe original import is refused',async()=>{
 for(const retirement of [false,true]){
 const input=correctionLookup(retirement);input.originalRequest.correction.items[0].baseSnapshot.retailPrice=1e20;
 const ack=correctionAck();const {service}=load({result:args=>({...binding(args),status:'accepted',receipt:ack,currentProductSnapshots:snapshots()})});
 const result=await service.handlePosCatalogImportReceipt(input,{},retirement);
 assert.equal(result.status,200);assert.equal(result.body.originalSchemaVersion,'pos-catalog-import-correction-v1');
 input.originalRequest.recoveryOf.originalRequest.items[0].retailPrice=Number.MAX_SAFE_INTEGER+1;
 const {service:unsafe,calls}=load();const denied=await unsafe.handlePosCatalogImportReceipt(input,{},retirement);
 assert.equal(denied.status,400);assert.equal(denied.body.code,'original_numeric_precision_unsupported');assert.equal(calls.length,0);
 }
});
