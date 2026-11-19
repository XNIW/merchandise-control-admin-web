import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readOnlyCachedGatewayGet,closedDiagnosticFailure,closeExplainPlan,statementDelta,createOwnedVolumeSqlDiagnostics,statementSnapshotSQL,functionSnapshotSQL,functionDelta,positivePayloadProbeSQL,positivePayloadReadbackSQL,closePositivePayloadOutput,fullSealSelect,fullSealProbeSQL,fullSealReadbackSQL,closeFullSealOutput} from '../../scripts/testing/asus019-history-volume-sql-diagnostics.mjs';
import {measuredDeviceRequest} from '../../scripts/testing/asus019-history-volume-finalization.mjs';

test('EXPLAIN export rebuilds a closed numerical tree and drops fixture values and query text',()=>{
 const secret='synthetic-marker-must-not-escape';
 const closed=closeExplainPlan([{Plan:{'Node Type':'Index Scan','Relation Name':'payment_history_migration_objects','Index Name':'payment_history_migration_objects_pkey','Actual Rows':1,'Actual Loops':1,'Shared Hit Blocks':3,'Index Cond':secret,Filter:secret,Output:[secret],Alias:secret,Plans:[{'Node Type':'Result',Output:[secret],'Actual Rows':1}]},'Planning Time':0.1,'Execution Time':0.2,Query:secret,Triggers:[{name:secret}]}]);
 assert.equal(JSON.stringify(closed).includes(secret),false);
 assert.equal(closed.plan.index,'primary_key');assert.equal(closed.plan['Actual Rows'],1);assert.equal(closed.cachedPlanObserved,false);
 const unknown=closeExplainPlan([{Plan:{'Node Type':secret,'Relation Name':secret,'Index Name':secret}}]);
 assert.equal(JSON.stringify(unknown).includes(secret),false);
 assert.throws(()=>closeExplainPlan([{Plan:{'Node Type':'Result',Plans:Array(17).fill({})}}]),/plan_shape/);
});

test('statement intervals preserve nested overlap and invalidate reset, eviction or decreasing counters',()=>{
 const fields={shared_blks_hit:0,shared_blks_read:0,shared_blks_dirtied:0,shared_blks_written:0,temp_blks_read:0,temp_blks_written:0,wal_records:0,wal_fpi:0,wal_bytes:0,statementEntries:1,epochsAvailable:true,epochs:[{since:'same',members:1}]};
 const before={statsReset:'same',dealloc:0,statements:[{...fields,label:'movement_insert',calls:10,total_exec_time:5,rows:10}]};
 const after={statsReset:'same',dealloc:0,statements:[{...fields,label:'movement_insert',calls:20,total_exec_time:11,rows:20}]};
 const ok=statementDelta(before,after);assert.equal(ok.valid,true);assert.equal(ok.overlappingNestedTotals,true);assert.equal(ok.statements[0].calls,10);assert.equal(ok.statements[0].total_exec_time,6);
 assert.deepEqual(statementDelta(before,{...after,statsReset:'reset'}).reasons,['statistics_reset_or_unavailable']);
 assert.deepEqual(statementDelta(before,{...after,dealloc:1}).reasons,['statement_eviction_or_unavailable']);
 const decreased=statementDelta(after,before);assert.equal(decreased.statements[0].valid,false);assert.equal(decreased.statements[0].calls,null);
 const missing=structuredClone(after);missing.statements[0].wal_bytes=null;assert.equal(statementDelta(before,missing).statements[0].valid,false);
 const resetEntry=structuredClone(after);resetEntry.statements[0].epochs=[{since:'changed',members:1}];assert.equal(statementDelta(before,resetEntry).statements[0].valid,false);
 const newCohort=structuredClone(after);newCohort.statements[0].statementEntries=2;assert.equal(statementDelta(before,newCohort).statements[0].valid,false);
 const missingEpoch=structuredClone(after);delete missingEpoch.statements[0].epochsAvailable;assert.equal(statementDelta(before,missingEpoch).statements[0].valid,false);
});

function fixture({previousFunction=null,functionCanaryMissing=false,previous=null,failSnapshot=false,adminDenied=false,nestedMissing=false,cacheMiss=false,missingCounters=false,completeCategories=false,resetCanaryEntry=false}={}){
 const calls=[],saved=[],rpcCalls=[],nonce='12345678-1234-4234-8234-123456789012';let auto=previous,functionAuto=previousFunction,gatewayCalls=0,cryptoCalls=0,counter=0,snapshotCount=0,counterReads=0,clock=0;
 const config=['search_path=""'];
 const invariants={definitionSha256:'a'.repeat(64),accessSha256:'b'.repeat(64),otherConfigSha256:'c'.repeat(64)};
 const effective=()=>auto??'top',functionEffective=()=>functionAuto??'none';
 const query=(sql,{admin=false}={})=>{calls.push(sql);
  if(sql.startsWith('ALTER SYSTEM')){assert.equal(admin,true);const value=sql.includes('RESET')?null:sql.match(/='(all|top|none|pl)'/)[1];if(sql.includes('track_functions'))functionAuto=value;else auto=value;return '';}
  if(sql==='SELECT pg_reload_conf();'){assert.equal(admin,true);return 't';}
  if(sql.includes("'autoEntries'")){assert.equal(admin,true);const value=sql.includes("current_setting('track_functions')")?functionAuto:auto;return JSON.stringify({effective:value??(sql.includes("current_setting('track_functions')")?'none':'top'),autoEntries:value===null?0:1,autoValue:value,autoValid:true,pendingRestart:false,otherSettingsSha256:'9'.repeat(64)});}
  if(sql.includes("'expectedPreexistingRole'")){assert.equal(admin,true);return JSON.stringify({expectedPreexistingRole:true,superuser:!adminDenied,canSet:!adminDenied,canAlterSystem:!adminDenied,canSetFunctions:!adminDenied,canAlterSystemFunctions:!adminDenied});}
  if(sql.includes('FROM pg_db_role_setting'))return '[]';
  if(sql.includes("'cacheMatches'"))return JSON.stringify({cacheMatches:!cacheMiss,cacheRowSha256:'8'.repeat(64),requestCount:3,importActive:0,migrationActive:0,uploadActive:0});
  if(sql.includes("'calls',coalesce((SELECT sum(calls)")){counterReads++;return JSON.stringify({calls:counter,statsReset:missingCounters?null:'same',dealloc:0,statementEntries:counter===0?0:1,epochsAvailable:true,epochs:counter===0?[]:[{since:resetCanaryEntry&&counterReads>=4?'changed':'same',members:1}]});}
  if(sql.includes("'definitionSha256'"))return JSON.stringify(invariants);
  if(sql.includes('coalesce(to_jsonb(proconfig)'))return JSON.stringify(config);
  if(sql.includes("e.extname='pg_stat_statements'"))return JSON.stringify({installed:true,schema:'extensions'});
  if(sql.startsWith('SELECT count(*)'))return '0';
  if(sql.includes("'serverVersionNum'"))return JSON.stringify({serverVersionNum:170006});
  if(sql.includes('FROM pg_stat_all_tables'))return '[]';
  if(sql.startsWith('WITH wanted(label,signature)'))return JSON.stringify({statsReset:'2026-11-19T00:00:00Z',functions:['gateway_canary','crypto_canary','replica_payload','replica_entity_digest','replica_field_hash','revision_seal'].map(label=>{const calls=label==='gateway_canary'?gatewayCalls:label==='crypto_canary'?cryptoCalls:0;return {label,exists:true,definitionMD5:'a'.repeat(32),present:calls>0,calls:calls||null,total_time:calls||null,self_time:calls||null};})});
  if(sql.startsWith('WITH scoped')){if(failSnapshot)throw Error('private error query/parameter must not escape');const count=snapshotCount++*10;return JSON.stringify({statsReset:'same',dealloc:0,statements:completeCategories?['object_movement_lookup','object_binding_lookup','object_file_lookup','movement_insert','parent_fk_check','run_counter_update'].map(label=>({label,calls:count,total_exec_time:count,rows:count,shared_blks_hit:0,shared_blks_read:0,shared_blks_dirtied:0,shared_blks_written:0,temp_blks_read:0,temp_blks_written:0,wal_records:0,wal_fpi:0,wal_bytes:0,statementEntries:1,epochsAvailable:true,epochs:[{since:'same',members:1}]})):[]});}
  throw Error('unhandled fixture SQL');
 };
 const rpcGet=async(parameters,options)=>{rpcCalls.push({parameters,options});assert.deepEqual(options,{get:true});assert.deepEqual(parameters,{p_request_id:nonce,p_lane:'migration',p_operation:'claim',p_payload:{}});if(effective()==='all'&&!nestedMissing)counter++;if(functionEffective()!=='none')gatewayCalls++;if(functionEffective()==='all'&&!functionCanaryMissing)cryptoCalls++;return {data:{ok:true,run:null},errorCode:null};};
 const options={runtime:{url:'http://127.0.0.1:54321',containerID:'d'.repeat(64),project:'r4-ci-preflight-'+'e'.repeat(12),head:'f'.repeat(40)},serverSha:'f'.repeat(40),workerSha256:'0'.repeat(64),query,rpcGet,pause:async ms=>{clock+=ms;},monotonicNow:()=>clock,save:(name,value)=>saved.push({name,value:structuredClone(value)})};
 return {calls,saved,options,rpcCalls,nonce,getConfig:()=>config,getAuto:()=>auto,getFunctionAuto:()=>functionAuto};
}

test('ownership is rejected before any database operation or evidence export',()=>{
 const f=fixture();f.options.runtime.url='https://live.example.invalid';assert.throws(()=>createOwnedVolumeSqlDiagnostics(f.options),/ownership/);assert.equal(f.calls.length,0);assert.equal(f.saved.length,0);
});

test('instance tracking restores only the prior setting and keeps observation failure diagnostic-only',async()=>{
 for(const previous of ['top','none','all',null]){
  const f=fixture({previous,failSnapshot:true}),d=createOwnedVolumeSqlDiagnostics(f.options);
  d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();d.capture('before_analysis');d.capture('before_analysis');d.finish();assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');
  assert.deepEqual(f.getConfig(),['search_path=""']);assert.equal(f.getAuto(),previous);
  const out=f.saved.at(-1).value;
  assert.equal(out.configurationRestored,true);assert.equal(out.diagnosticOnly,true);assert.equal(out.timingQualification,false);assert.equal(out.nestedTracking,'not_attested');
  assert.equal(out.errors.some(x=>x.operation==='before_analysis'),true);assert.equal(JSON.stringify(out).includes('private error'),false);
  assert.equal(out.errors.filter(x=>x.operation==='before_analysis').length,1);
  assert.equal(f.calls.some(x=>/ALTER FUNCTION|ALTER ROLE|CREATE ROLE|GRANT |REVOKE |RESET ALL|pg_stat_statements_reset|VACUUM|ANALYZE public/.test(x)),false);
  assert.equal(JSON.stringify(out).includes(f.nonce),false);assert.equal(f.rpcCalls.length,2);assert.equal(out.status,'DIAGNOSTIC_OBSERVATION_FAILED');
 }
});

test('privilege, missing cache or absent nested canary stops before source upload or measurement',async()=>{
 for(const failure of [{adminDenied:true},{nestedMissing:true},{cacheMiss:true},{missingCounters:true}]){
  const f=fixture(failure),d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});let uploads=0;
  await assert.rejects(async()=>{await d.prepare();uploads++;d.capture('before_analysis');},/preflight_failed/);
  assert.equal(uploads,0);assert.equal(f.saved.at(-1).value.snapshots.length,0);await d.restore();assert.equal(f.getAuto(),null);
  if(failure.adminDenied)assert.equal(f.calls.some(s=>s.startsWith('ALTER SYSTEM')),false);
  if(failure.cacheMiss)assert.equal(f.rpcCalls.length,0);
  if(failure.nestedMissing){const out=f.saved.at(-1).value;assert.equal(out.trackingCanary.status,'FAIL');assert.equal(out.trackingCanary.observedNestedDelta,0);}
 }
});

test('successful readonly canary is distinct from later categories; snapshots remain bounded',async()=>{
 const f=fixture(),d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();d.capture('before_analysis');
 for(let i=0;i<20;i++)d.onVector({phase:'stage_objects',last_ordinal:25955});
 for(const n of [6400,12800,19200,25600])d.onVector({phase:'stage_movements',last_ordinal:n});
 d.finish();d.finish();assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_PARTIAL');
 const out=f.saved.at(-1).value;assert.equal(out.snapshots.length,7);assert.equal(out.nestedTracking,'not_attested');assert.equal(out.configurationScope,'single_owned_disposable_instance');assert.equal(out.cachedPlanObserved,false);
 assert.equal(out.trackingCanary.observedNestedDelta,1);assert.equal(out.restoredCanary.observedNestedDelta,0);assert.equal(out.preflight.passed,true);
});

test('collected observation requires comparable real category deltas as well as canary and restore',async()=>{
 const f=fixture({completeCategories:true}),d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();d.capture('before_analysis');d.onVector({phase:'stage_objects',last_ordinal:25955});d.finish();
 assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_COLLECTED');const out=f.saved.at(-1).value;
 assert.equal(out.classificationCoverage.length,6);assert.equal(out.classificationCoverage.every(c=>c.status==='observed'),true);assert.equal(out.nestedTracking,'observed_canonical_nested_statements');assert.equal(out.timingQualification,false);
});

test('selective cache-entry reset cannot masquerade as a successful zero-delta restore',async()=>{
 const f=fixture({resetCanaryEntry:true}),d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();
 assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');const out=f.saved.at(-1).value;assert.equal(out.errors.at(-1).operation,'restored_real_rpc_canary');assert.equal(out.configurationRestored,false);assert.equal(f.getAuto(),null);
});

test('diagnostic failure preserves only allowlisted SQLSTATE and closed process categories',()=>{
 const secret='raw private query identifier';assert.deepEqual(closedDiagnosticFailure({stderr:'ERROR: 42501: '+secret}),{sqlState:'42501',kind:'sql_rejected'});
 assert.deepEqual(closedDiagnosticFailure({stderr:'ERROR: XX999: '+secret}),{sqlState:'OTHER_SQLSTATE',kind:'sql_rejected'});
 assert.deepEqual(closedDiagnosticFailure({stderr:secret,timedOut:true}),{sqlState:null,kind:'process_timeout'});
 assert.deepEqual(closedDiagnosticFailure({sqlState:'PGRST202'}),{sqlState:null,kind:'observation_failed'});
 assert.equal(JSON.stringify(closedDiagnosticFailure({stderr:secret})).includes(secret),false);
});

test('statement query is closed and accepts only expected extension schemas',()=>{
 assert.throws(()=>statementSnapshotSQL('extensions;drop schema public'),/extension_schema/);
 const query=statementSnapshotSQL('extensions');assert.match(query,/NOT toplevel/);assert.match(query,/for key share/);
 assert.doesNotMatch(query,/SELECT jsonb_build_object\([^;]*queryid/s);
});

test('real pinned SDK sends the cached gateway GET with exact JSON payload and no POST fallback',async()=>{
 const calls=[],parameters={p_request_id:'10000000-0000-4000-8000-000000000001',p_lane:'migration',p_operation:'claim',p_payload:{}};
 const db=createClient('http://127.0.0.1:54321','synthetic-key-not-a-credential',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
  calls.push({url:new URL(url),options});return new Response('{"ok":true,"run":null}',{status:200,headers:{'content-type':'application/json'}});
 }}});
 const reply=await readOnlyCachedGatewayGet(db,parameters,{get:true});assert.deepEqual(reply,{data:{ok:true,run:null},errorCode:null});assert.equal(calls.length,1);
 const {url,options}=calls[0];assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(url.pathname,'/rest/v1/rpc/payment_history_worker_gateway_v1');
 assert.deepEqual(Object.fromEntries(url.searchParams),{p_request_id:parameters.p_request_id,p_lane:'migration',p_operation:'claim',p_payload:'{}'});assert.deepEqual(JSON.parse(url.searchParams.get('p_payload')),parameters.p_payload);assert.equal(options.signal.aborted,false);
 assert.deepEqual(parameters.p_payload,{});await assert.rejects(()=>readOnlyCachedGatewayGet(db,parameters,{get:false}),/readonly_required/);assert.equal(calls.length,1);
 assert.deepEqual(closedDiagnosticFailure({sqlState:'22P02'}),{sqlState:'22P02',kind:'sql_rejected'});
});

async function finalizationFixture(){
 const f=fixture({completeCategories:true}),query=f.options.query,save=f.options.save;
 let fault=null,armed=false,snapshots=0;
 f.options.query=(sql,options)=>{
  if(armed&&sql.startsWith('WITH scoped')){
   snapshots++;
   if(fault==='query'){const error=Error('private-observer-query');error.diagnosticFailure={sqlState:'42501'};throw error;}
   if(fault==='json')return 'private-invalid-json';
   if(fault==='null')return 'null';
   if(fault==='delta')return JSON.stringify({statsReset:'same',dealloc:0,statements:{invalid:true}});
   const value=JSON.parse(query(sql,options));
   if(fault==='cohort')value.statements[0].epochs=[{since:'new',members:1}];
   if(fault==='reset')value.statsReset='new';
   return JSON.stringify(value);
  }
  return query(sql,options);
 };
 f.options.save=(name,value)=>{if(armed&&fault==='save')throw Error('private-disk-error');save(name,value);};
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();
 d.capture('before_analysis');d.onVector({phase:'stage_objects',last_ordinal:25955});
 for(const last_ordinal of [6400,12800,19200,25600])d.onVector({phase:'stage_movements',last_ordinal});
 d.finish();armed=true;
 return {...f,d,setFault:value=>{fault=value;},snapshotCount:()=>snapshots};
}

test('seven finalization phases keep130 real pages in one two-snapshot interval and restore tracking',async()=>{
 const f=await finalizationFixture(),phases=['baseline_receipt_preflight','baseline_review','baseline_apply','baseline_receipt','snapshot_start','page','replica_ack'];
 let applied=0;
 for(const phase of phases){
  if(phase==='page'){for(let i=0;i<130;i++)await f.d.observeFinalization(phase,async()=>({done:i===129}));}
  else await f.d.observeFinalization(phase,async()=>{if(phase==='baseline_apply')applied++;return {};});
 }
 assert.equal(applied,1);assert.equal(f.snapshotCount(),14);
 await assert.rejects(()=>f.d.observeFinalization('baseline_apply',async()=>{applied++;}),/repeated/);assert.equal(applied,1);
 assert.equal(await f.d.restore(),'DIAGNOSTIC_OBSERVATION_COLLECTED');const out=f.saved.at(-1).value;
 assert.equal(out.snapshots.length,7);assert.deepEqual(out.finalization.phases.map(p=>p.phase),phases);
 assert.equal(out.finalization.phases.find(p=>p.phase==='page').rpcCalls,130);assert.equal(out.finalization.notRun.length,0);
 assert.equal(out.configurationRestored,true);assert.equal(f.getAuto(),null);assert.equal(out.timingQualification,false);
 assert.equal(out.finalization.timingQualification,false);assert.equal(out.finalization.overlappingNestedTotals,true);
 assert.match(out.finalization.limitation,/Interrupted statements may be absent/);
 assert.equal(out.finalization.phases.every(p=>p.classificationCoverage.some(c=>c.label==='replica_event_insert'&&c.status==='not_observed_or_unclassified')),true);
 assert.deepEqual(out.limits,{analysisBudgetMs:120000,requestBudgetMs:15000,canonicalRowLimit:200,vectorChunkLimit:4});
});

test('primary Apply57014 survives successful collection or query, JSON, delta and persistence failures without a second Apply',async()=>{
 for(const fault of [null,'query','json','delta','save']){
  const f=await finalizationFixture(),steps=[];let requests=0,primary;
  const db=createClient('http://127.0.0.1:54321','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{
   requests++;return new Response(JSON.stringify({code:'57014',message:'private-primary-error'}),{status:500,headers:{'content-type':'application/json'}});
  }}});
  await assert.rejects(()=>f.d.observeFinalization('baseline_apply',async()=>{
   try{return await measuredDeviceRequest({db,scope:{},operation:'baseline_apply',payload:{},steps});}
   catch(error){primary=error;f.setFault(fault);throw error;}
  }),error=>error===primary);
  assert.equal(requests,1);assert.equal(steps.length,1);assert.equal(steps[0].sqlState,'57014');assert.equal(steps[0].httpStatus,500);
  f.setFault(null);await assert.rejects(()=>f.d.observeFinalization('baseline_apply',async()=>{requests++;}),/repeated/);
  assert.equal(await f.d.restore(),fault===null?'DIAGNOSTIC_OBSERVATION_COLLECTED':'DIAGNOSTIC_OBSERVATION_FAILED');const out=f.saved.at(-1).value;
  assert.equal(out.finalization.phases[0].state,'RPC_FAILED');assert.equal(out.finalization.phases[0].rpcCalls,1);assert.equal(requests,1);
  assert.equal(out.finalization.notRun.includes('baseline_receipt'),true);assert.equal(out.configurationRestored,true);
  assert.equal(JSON.stringify({out,steps}).includes('private-'),false);
 }
});

test('failed preliminary observation never invokes Apply or sets its financial flag',async()=>{
 for(const fault of ['query','json','null','delta','save']){
  const f=await finalizationFixture();let financialApply=false,requests=0;f.setFault(fault);
  await assert.rejects(()=>f.d.observeFinalization('baseline_apply',async()=>{financialApply=true;requests++;return {};}));
  assert.equal(financialApply,false);assert.equal(requests,0);f.setFault(null);
  assert.equal(await f.d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');const out=f.saved.at(-1).value;
  assert.equal(out.finalization.phases[0].rpcCalls,0);assert.equal(out.configurationRestored,true);
 }
});

test('successful RPC with unavailable observer remains diagnostic failure, never an inferred Apply failure',async()=>{
 const f=await finalizationFixture();let requests=0;
 await assert.rejects(()=>f.d.observeFinalization('baseline_apply',async()=>{requests++;f.setFault('json');return {ok:true};}),/observation_failed/);
 f.setFault(null);assert.equal(await f.d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');const out=f.saved.at(-1).value;
 assert.equal(requests,1);assert.equal(out.finalization.phases[0].state,'RPC_COMPLETED');assert.equal(out.configurationRestored,true);
});

test('finalization reset, changed cohort or an interrupted page sequence stays partial with restore',async()=>{
 for(const fault of ['reset','cohort','partial_page']){
  const f=await finalizationFixture();
  if(fault==='partial_page')await f.d.observeFinalization('page',async()=>({done:false}));
  else await f.d.observeFinalization('baseline_apply',async()=>{f.setFault(fault);return {};});
  f.setFault(null);assert.equal(await f.d.restore(),'DIAGNOSTIC_OBSERVATION_PARTIAL');const out=f.saved.at(-1).value;
  assert.equal(out.finalization.status,'DIAGNOSTIC_PHASES_PARTIAL');assert.equal(out.configurationRestored,true);
  if(fault==='partial_page'){assert.equal(f.snapshotCount(),1);assert.equal(out.finalization.phases[0].state,'RUNNING');assert.equal(out.finalization.notRun.includes('replica_ack'),true);}
  else assert.equal(out.finalization.phases[0].delta.allCategoriesComparable,false);
 }
});

// Evaluate only the closed LIKE/AND/OR grammar emitted by the SQL classifier.
// This is a static source regression, not a PostgreSQL execution or cached plan.
function classifyFromGeneratedSql(text){
 const normalized=text.replaceAll('"','').replace(/\s+/g,' ').trim().toLowerCase();
 const source=statementSnapshotSQL('extensions'),branches=[...source.matchAll(/WHEN (.*?) THEN '([a-z_]+)'/g)];
 for(const [,condition,label] of branches){
  const tokens=[...condition.matchAll(/normalized LIKE '([^']*)'|\bAND\b|\bOR\b|[()]/g)];let index=0;
  const atom=()=>{const t=tokens[index++];assert.ok(t);if(t[0]==='('){const value=or();assert.equal(tokens[index++][0],')');return value;}
   assert.ok(t[1]!==undefined);const pattern=t[1].split('').map(c=>c==='%'?'.*':c==='_'?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');return new RegExp('^'+pattern+'$','s').test(normalized);};
  const and=()=>{let value=atom();while(tokens[index]?.[0]==='AND'){index++;const next=atom();value=value&&next;}return value;};
  const or=()=>{let value=and();while(tokens[index]?.[0]==='OR'){index++;const next=and();value=value||next;}return value;};
  const matched=or();assert.equal(index,tokens.length);if(matched)return label;
 }
 return null;
}

test('closed classifier covers actual bulk, provenance, seal and review SQL with outer-statement precedence',()=>{
 const bulk=readFileSync('supabase/migrations/20261119012919_payment_history_baseline_apply_bulk_v1.sql','utf8');
 const replica=readFileSync('supabase/migrations/20261110044957_payment_history_migration_and_replica_v1.sql','utf8');
 const pipeline=readFileSync('supabase/migrations/20261111014055_payment_history_device_baseline_pipeline_v2.sql','utf8');
 const inactive=readFileSync('supabase/migrations/20261112013056_payment_history_frozen_inactive_reconciliation_v1.sql','utf8');
 const ledger=readFileSync('supabase/migrations/20261110032142_payment_history_cloud_ledger_v1.sql','utf8');
 const body=(source,name)=>{const start=source.indexOf('function app_private.'+name+'(');assert.ok(start>=0);return source.slice(source.indexOf('$$',start)+2,source.indexOf('$$;',start));};
 const statement=(source,start)=>{const offset=source.indexOf(start);assert.ok(offset>=0,start);return source.slice(offset,source.indexOf(';',offset)+1);};
 for(const [source,start,label] of [
  [bulk,'with new_rows as materialized','apply_bulk_new_facts'],
  [bulk,'insert into public.payment_history_migration_decisions','apply_decisions'],
  [bulk,'insert into public.payment_history_source_snapshots','source_snapshot_insert'],
  [bulk,'insert into public.payment_history_source_objects','source_objects_insert'],
  [bulk,'insert into public.payment_history_revisions','revision_write'],
  [bulk,'perform app_private.payment_history_seal_revision_v1','revision_seal'],
  [body(replica,'payment_history_seal_revision_v1'),'insert into public.payment_history_replica_events','replica_event_insert'],
  [body(replica,'payment_history_seal_revision_v1'),'select count(*)','change_set_digest'],
  [body(replica,'payment_history_seal_revision_v1'),'insert into public.payment_history_change_sets','change_set_insert']
 ])assert.equal(classifyFromGeneratedSql(statement(source,start)),label,start);
 assert.equal(classifyFromGeneratedSql(body(pipeline,'payment_history_migration_review_v1')),'apply_review');
 assert.equal(classifyFromGeneratedSql(body(inactive,'payment_history_migration_review_rows_v1')),'apply_review_rows');
 assert.equal(classifyFromGeneratedSql(body(replica,'payment_history_replica_payload_v1')),'replica_payload_read');
 assert.equal(classifyFromGeneratedSql(body(ledger,'payment_history_field_hash_v1')),'replica_field_hash');
 const projection=statementSnapshotSQL('extensions').split('totals AS')[1];assert.doesNotMatch(projection,/\bquery\b|\bqueryid\b/);
});

test('diagnostic finalization uses the same single invocation and cannot publish or continue authenticated qualification',()=>{
 const runner=readFileSync('scripts/testing/asus019-history-volume.mjs','utf8'),workflow=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(runner,/const invoke=\(\)=>\{if\(operation==='baseline_apply'\)report.financialApply=true;return measuredDeviceRequest/);
 assert.match(runner,/sqlDiagnostics\?sqlDiagnostics.observeFinalization\(report.finalization.phase,invoke\):invoke\(\)/);
 assert.equal((runner.match(/await finalizeVolumeBaseline\(/g)??[]).length,1);
 assert.match(runner,/if\(diagnosticOnly\)report.finalization.status='DIAGNOSTIC_ONLY_FINALIZATION_COMPLETED'/);
 assert.match(runner,/if\(diagnosticOnly\)\{report.status='DIAGNOSTIC_ONLY_MEASURED_PASS'[\s\S]*?\}\s*else \{\s*report.status='PASS_REAL_GATEWAY_SQL_FULL_VOLUME'/);
 assert.match(workflow,/name: Authenticated service and browser roundtrip\s+if: \$\{\{ inputs.history_volume_diagnostics != true \}\}/);
 assert.match(workflow,/name: Preserve the exact qualified dedicated Worker artifact\s+if: \$\{\{ inputs.history_volume_diagnostics != true \}\}/);
 assert.match(runner,/measured.elapsedMs<120000/);
});


test('function tracking is enabled before warm and restores each original enum/presence with real RPC category canary',async()=>{
 for(const previousFunction of [null,'none','pl','all']){
  const f=fixture({previousFunction}),d=createOwnedVolumeSqlDiagnostics(f.options);
  await d.prepareInstance();assert.equal(f.rpcCalls.length,0);assert.equal(f.getFunctionAuto(),'all');assert.equal(f.getAuto(),'all');
  d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();await d.restore();
  const out=f.saved.at(-1).value;assert.equal(f.getFunctionAuto(),previousFunction);assert.equal(f.getAuto(),null);assert.equal(out.configurationRestored,true);
  assert.equal(out.trackingCanary.functions.functions.find(x=>x.label==='crypto_canary').calls,1);
  assert.equal(out.restoredCanary.functions.functions.find(x=>x.label==='crypto_canary').calls,previousFunction==='all'?1:0);
  assert.equal(out.restoredCanary.functions.functions.find(x=>x.label==='gateway_canary').calls,['pl','all'].includes(previousFunction)?1:0);
  assert.equal(f.calls.some(s=>s.includes("WHERE name NOT IN('pg_stat_statements.track','track_functions')")),true);
 }
 const runner=readFileSync(new URL('../../scripts/testing/asus019-history-volume.mjs',import.meta.url),'utf8');
 assert.ok(runner.indexOf('await sqlDiagnostics.prepareInstance()')<runner.indexOf("await worker('warm',30000)"));
});

test('procedural-only tracking cannot pass the all-functions RPC preflight',async()=>{
 const f=fixture({functionCanaryMissing:true}),d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});
 await assert.rejects(()=>d.prepare(),/preflight_failed/);assert.equal(f.saved.at(-1).value.preflight.passed,false);
 await d.restore();assert.equal(f.getFunctionAuto(),null);assert.equal(f.getAuto(),null);
});

test('idle flush window separates ten-second pending warm and GET counters without extra RPCs',async()=>{
 const f=fixture(),query=f.options.query,rpc=f.options.rpcGet,visible={gateway:0,crypto:0},pending=[],samples=[];let clock=0;
 const flush=()=>{for(let i=pending.length-1;i>=0;i--)if(pending[i].due<=clock){visible.gateway+=pending[i].gateway;visible.crypto+=pending[i].crypto;pending.splice(i,1);}};
 f.options.monotonicNow=()=>clock;f.options.pause=async ms=>{clock+=ms;flush();};
 f.options.query=(sql,options)=>{const raw=query(sql,options);if(sql!==functionSnapshotSQL())return raw;const value=JSON.parse(raw);samples.push({clock,...visible});for(const row of value.functions){const calls=row.label==='gateway_canary'?visible.gateway:row.label==='crypto_canary'?visible.crypto:0;Object.assign(row,{present:calls>0,calls:calls||null,total_time:calls||null,self_time:calls||null});}return JSON.stringify(value);};
 f.options.rpcGet=async(args,options)=>{const answer=await rpc(args,options),mode=f.getFunctionAuto()??'none';pending.push({due:clock+10000,gateway:mode==='none'?0:1,crypto:mode==='all'?1:0});return answer;};
 const d=createOwnedVolumeSqlDiagnostics(f.options);await d.prepareInstance();const warmAt=clock;pending.push({due:warmAt+10000,gateway:3,crypto:3});
 // The old two equal readings at 1.1s and 2.2s would still contain zero.
 assert.equal(pending.filter(p=>p.due<=warmAt+2200).length,0);
 d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();await d.restore();const out=f.saved.at(-1).value;
 assert.equal(out.trackingCanary.functionBefore.functions.find(r=>r.label==='gateway_canary').calls,3);
 for(const label of ['gateway_canary','crypto_canary']){assert.equal(out.trackingCanary.functions.functions.find(r=>r.label===label).calls,1);assert.equal(out.restoredCanary.functions.functions.find(r=>r.label===label).calls,0);}
 assert.equal(out.configurationRestored,true);assert.equal(f.rpcCalls.length,2);assert.equal(out.functionSettlementWindows.length,4);
 assert.ok(out.functionSettlementWindows.every(w=>w.idleWaitMs===11000&&w.samples===2&&w.elapsedMs===12100&&w.status==='STABLE_AFTER_IDLE_FLUSH_WINDOW'&&!w.timingQualification));
 assert.equal(out.functionObserverElapsedMs,48400);assert.ok(samples.filter(s=>s.clock>warmAt).every(s=>s.clock>=warmAt+11000));
 assert.equal(f.calls.some(s=>/pg_stat_(?:reset\w*|force_next_flush)\s*\(/.test(s)),false);
});

test('a nonadvancing monotonic idle wait prevents Apply before its first function snapshot',async()=>{
 const f=fixture(),pause=f.options.pause;let armed=false,invoked=0;
 f.options.pause=async ms=>pause(armed?0:ms);
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();d.capture('before_analysis');d.finish();armed=true;
 await assert.rejects(()=>d.observeFinalization('baseline_apply',async()=>{invoked++;return {};}));assert.equal(invoked,0);
 const window=f.saved.at(-1).value.functionSettlementWindows.at(-1);assert.equal(window.idleWaitMs,0);assert.equal(window.samples,0);assert.equal(window.status,'FAIL');
 armed=false;await d.restore();assert.equal(f.saved.at(-1).value.configurationRestored,true);
});

test('restoring either GUC is attempted even when the other restore fails',async()=>{
 for(const failedSetting of ['pg_stat_statements.track','track_functions']){
  const f=fixture(),base=f.options.query;let armed=false;
  f.options.query=(sql,options)=>{if(armed&&sql===`ALTER SYSTEM RESET ${failedSetting};`)throw Error('private-restore-detail');return base(sql,options);};
  const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();armed=true;
  assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');const out=f.saved.at(-1).value;assert.equal(out.configurationRestored,false);
  assert.equal(f.calls.includes(`ALTER SYSTEM RESET ${failedSetting==='track_functions'?'pg_stat_statements.track':'track_functions'};`),true);
  assert.equal(JSON.stringify(out).includes('private-restore-detail'),false);
 }
});

test('function delta rejects drift, missing metrics and resets while preserving completed-call limitations',()=>{
 const functions=['gateway_canary','crypto_canary','replica_payload','replica_entity_digest','replica_field_hash','revision_seal'].map(label=>({label,exists:true,present:true,definitionMD5:'a'.repeat(32),calls:10,total_time:5,self_time:3}));
 const a={statsReset:null,functions},b=structuredClone(a);b.functions[2].calls=20;b.functions[2].total_time=8;b.functions[2].self_time=5;
 const delta=functionDelta(a,b);assert.equal(delta.valid,true);assert.equal(delta.functions[2].calls,10);assert.equal(delta.securityWrapperOverheadExcluded,true);assert.equal(delta.selectiveFunctionResetNotIndependentlyDetectable,true);assert.equal(delta.interruptedCallsMayBeAbsent,true);
 for(const change of [v=>v.functions[2].total_time=null,v=>v.functions[2].calls=1,v=>v.functions[2].definitionMD5='b'.repeat(32),v=>v.statsReset='new']){const changed=structuredClone(b);change(changed);assert.equal(functionDelta(a,changed).valid,false);}
 for(const invalid of [undefined,42,'same']){const bad=structuredClone(a);if(invalid===undefined)delete bad.statsReset;else bad.statsReset=invalid;assert.equal(functionDelta(bad,bad).valid,false);}
 assert.doesNotMatch(functionSnapshotSQL(),/pg_stat_reset|queryid|GRANT|ALTER/);
});

const positiveRun='10000000-0000-4000-8000-000000000002';
function positiveRecords(){
 const metadata={evidence:0,merchants:0,batches:0,movements:0,revisions:0,replicaEvents:0,changeSets:0,sourceSnapshots:0,runtime:{revision:'0',epoch:'1',authority:'frozen'},run:{state:'review_ready',receiptPresent:false,applyKeyPresent:false,stagedMovements:25947,stagedObjects:25955}};
 const samples=['helper','inline','inline','helper','helper','inline'].map((variant,i)=>({phase:'positive_payload_sample',sequence:i+1,variant,elapsedMs:10+i,rows:512,positive:512,bytes:10000,root:'a'.repeat(64)}));
 return [{phase:'before',metadata},...samples,{phase:'positive_payload_parity',rows:512,jsonbEqual:true,protocolDigestEqual:true,batchJsonbEqual:true,batchProtocolDigestEqual:true},{phase:'after_rollback',metadata}];
}
function failedFinalization(){return {applyAttempts:1,steps:[{phase:'baseline_apply',httpStatus:500,sqlState:'57014'}],canonical:{state:'review_ready',runtimeRevision:'0',receiptPresent:false,applyKeyPresent:false,batches:0,movements:0,changeSets:0,replicaEvents:0,sourceSnapshots:0,acks:0,ackCount:0}};}

const seedLabels=['transaction','statement_limit','lock_limit','context','scope_guard','keys','key_primary','source_count','uuid_collision','full_prerequisites','evidence_insert','merchant_insert','batch_insert','movement_insert','positive_seed_guard','receipt_insert','revisions_insert','cardinality_guard','seed_guard_result','prepare_select'];
const seedMarker=(label,end)=>`A19_SEED_${label.toUpperCase()}_${end}`;
function sealFixtureOutput(){
 const metadata={...positiveRecords()[0].metadata,receipts:0,acks:0};
 const definitions=['replica_payload','replica_entity_digest','replica_field_hash','revision_seal'].map((label,i)=>({label,sha256:String(i).repeat(64)}));
 const before={phase:'before',metadata},after={phase:'after_rollback',metadata},functions={phase:'function_definitions',definitions};
 const guard={phase:'seed_guard',batches:1,movements:25947,revisions:25947,joinedMovements:25947,unionEntities:25948,receipt:1,fkReferencesCoherent:true,constraintModeUnchanged:true,statementTimeoutMs:8000,lockTimeoutMs:6000};
 const estimated=[{Plan:{'Node Type':'WindowAgg','Plan Rows':25948,'Plan Width':128,Plans:[{'Node Type':'Sort','Sort Key':['private fixture expression'],'Startup Cost':1,'Total Cost':2,Plans:[{'Node Type':'Append','Plan Rows':25948}]}]}}];
 const analyzed=structuredClone(estimated);Object.assign(analyzed[0].Plan,{'Actual Rows':25948,'Actual Loops':1});analyzed[0]['Execution Time']=1700;
 const seedFrames=seedLabels.map(label=>seedMarker(label,'BEGIN')+'\n'+(label==='seed_guard_result'?JSON.stringify(guard)+'\n':'')+seedMarker(label,'END')+'\n').join('');
 const prefix=[before,functions].map(JSON.stringify).join('\n')+'\n'+seedFrames+'A19_SEAL_PLAIN_BEGIN\n'+JSON.stringify(estimated,null,2)+'\nA19_SEAL_PLAIN_END\nA19_SEAL_ANALYZE_BEGIN\n';
 const output=prefix+JSON.stringify(analyzed,null,2)+'\nA19_SEAL_ANALYZE_END\n'+[{phase:'rollback_complete',completed:true},after,functions].map(JSON.stringify).join('\n');
 const readback=[after,functions,{phase:'connection_cleanup',activeConnections:0}].map(JSON.stringify).join('\n');
 return {metadata,definitions,prefix,output,readback,guard,estimated,analyzed,seedFrames};
}

test('full seal probe binds the exact seven-column SELECT and preserves original constraint mode and limits',()=>{
 const source=readFileSync(new URL('../../supabase/migrations/20261110044957_payment_history_migration_and_replica_v1.sql',import.meta.url),'utf8');
 const select=fullSealSelect(source),script=fullSealProbeSQL(positiveRun);
 assert.equal((select.match(/\$1/g)||[]).length,5);assert.equal((select.match(/\$2/g)||[]).length,4);
 assert.match(select,/row_number\(\) over\(order by x.kind collate "C",x.id\)::integer/);
 assert.match(script,new RegExp('prepare a19_seal_full\\(uuid,bigint\\) as '));assert.ok(script.includes(select));
 assert.throws(()=>fullSealSelect(source.replace('row_number() over(order by x.kind','row_number() over(order by x.id')),/seal_source/);
 assert.throws(()=>fullSealProbeSQL("bad';COMMIT;"),/scope/);
 assert.equal((script.match(/explain \(analyze,buffers,timing off,format json\)/gi)||[]).length,1);assert.equal((script.match(/explain \(format json\)/gi)||[]).length,1);
 assert.equal((script.match(/\bbegin;/g)||[]).length,1);assert.equal((script.match(/\brollback;/g)||[]).length,1);
 assert.doesNotMatch(script,/\bcommit\b|set constraints|create function|alter function|\blimit 512\b|measure_payload512|\bvacuum\b|plan_cache_mode|__OWNED/i);
 assert.match(script,/set local statement_timeout='8s'/);assert.match(script,/set local lock_timeout='6s'/);
 assert.match(script,/seal_probe_uuid_collision/);assert.match(script,/b.local_id=m.local_batch_id/);
 assert.ok(script.indexOf('insert into public.payment_history_receipts')<script.indexOf('insert into public.payment_history_revisions'));
 assert.match(script,/q.shop_id=r.shop_id and q.operation_id=r.operation_id where q.operation_id is null/);
 assert.ok(fullSealReadbackSQL(positiveRun).includes(`application_name='a19-seal-full-${positiveRun}'`));
 const unframed=script.replace(/^\\echo A19_SEED_[A-Z_]+_(?:BEGIN|END)\n/gm,'');
 assert.equal(createHash('sha256').update(unframed).digest('hex'),'11cd32e358b79bcb9b0395295053dd9d8a26975b0dd685fd34f57ce31c2d35f6');
 assert.equal((script.match(/^\\echo A19_SEED_/gm)||[]).length,40);
});

test('seed frames require all twenty ordered pairs and preserve the active statement boundary on partial output',()=>{
 const o=sealFixtureOutput(),closed=closeFullSealOutput(o.output);assert.equal(closed.seedStatements.state,'COMPLETE');assert.deepEqual(closed.seedStatements.completed,seedLabels);assert.equal(closed.seedStatements.lastCompleted,'prepare_select');assert.equal(closed.seedStatements.active,null);
 const prefix=o.prefix.slice(0,o.prefix.indexOf(seedMarker('movement_insert','END'))),partial=closeFullSealOutput(prefix);
 assert.equal(partial.invalidLines,0);assert.equal(partial.seedStatements.state,'OPEN_STATEMENT');assert.equal(partial.seedStatements.active,'movement_insert');assert.equal(partial.seedStatements.lastCompleted,'batch_insert');assert.equal(partial.plans.estimated,undefined);
 const empty=closeFullSealOutput('');assert.equal(empty.seedStatements.state,'NOT_OBSERVED');assert.equal(empty.seedStatements.active,null);assert.equal(empty.seedStatements.lastCompleted,null);
});
test('missing, truncated, duplicate, reordered and unknown seed markers fail closed without exporting raw text',()=>{
 const original=sealFixtureOutput().output,begin=seedMarker('movement_insert','BEGIN'),end=seedMarker('movement_insert','END');
 const cases=[original.replace(begin+'\n',''),original.replace(end+'\n',''),original.replace(seedMarker('prepare_select','END')+'\n',''),original.replace(begin,begin+'\n'+begin),original.replace(begin,seedMarker('revisions_insert','BEGIN')),original.replace(begin,begin.slice(0,-3)),original.replace(begin,'A19_SEED_PRIVATE_SECRET_BEGIN')];
 for(const value of cases){const closed=closeFullSealOutput(value);assert.ok(closed.invalidLines>0);assert.notEqual(closed.seedStatements.state,'COMPLETE');assert.equal(JSON.stringify(closed).includes('PRIVATE_SECRET'),false);}
 const none=closeFullSealOutput(original.replace(/^A19_SEED_[A-Z_]+_(?:BEGIN|END)\n/gm,''));assert.equal(none.seedStatements.state,'INVALID_MARKERS');assert.ok(none.invalidLines>0);
 const raw=closeFullSealOutput('PRIVATE SQL actor values');assert.equal(raw.invalidLines,1);assert.equal(JSON.stringify(raw).includes('PRIVATE'),false);
});

test('full seal plan projection retains structural costs but no expressions, literals or fabricated node timing',()=>{
 const secret='PRIVATE-DATA-DO-NOT-EXPORT',plan=[{Plan:{'Node Type':'WindowAgg','Plan Rows':25948,'Actual Rows':25948,'Actual Loops':1,'Actual Total Time':99,Output:[secret],Plans:[{'Node Type':'Hash Join','Join Type':'Inner','Hash Cond':secret,'Relation Name':'payment_history_revisions','Index Name':'payment_history_revisions_pkey','Shared Hit Blocks':40,'Temp Written Blocks':0,Plans:[{'Node Type':'Sort','Sort Method':'external merge','Sort Space Type':'Disk','Sort Space Used':24,'Sort Key':[secret],Workers:[{'Worker Number':0,'Actual Rows':1,Output:[secret]}]}]}]},'Execution Time':100,JIT:{Functions:2,Options:{Inlining:false,Optimization:true,Expressions:true,Deforming:true,secret},Timing:{Generation:0.1,Emission:0.5,Total:0.6,secret}}}];
 const closed=closeExplainPlan(plan),json=JSON.stringify(closed);assert.equal(json.includes(secret),false);assert.equal(json.includes('Actual Total Time'),false);assert.equal(closed.plan.plans[0].relation,'payment_history_revisions');assert.equal(closed.plan.plans[0].joinType,'Inner');assert.equal(closed.plan.plans[0].plans[0].sortSpaceType,'Disk');assert.equal(closed.jit.timing.Total,0.6);
 const out=sealFixtureOutput(),partial=closeFullSealOutput(out.prefix);assert.equal(partial.plans.estimated.plan.nodeType,'WindowAgg');assert.equal(partial.plans.analyzed,undefined);assert.equal(partial.partialPlan,'analyzed');assert.equal(partial.invalidLines,0);
 const invalid=closeFullSealOutput(out.prefix+'raw sensitive SQL');assert.equal(JSON.stringify(invalid).includes('sensitive'),false);
 assert.equal(closeFullSealOutput('raw sensitive SQL').invalidLines,1);
});

async function fullProbeFixture({failure,emptyPartial=false,seedPartial=false,cleanupSession=false,metadataDrift=false,definitionDrift=false,beforeDrift=false}={}){
 const f=fixture(),original=f.options.query,o=sealFixtureOutput();let calls=0,reads=0;
 f.options.query=(sql,options)=>{
  if(options?.positiveProbe){calls++;assert.equal(sql,fullSealProbeSQL(positiveRun));if(failure){const e=Error('PRIVATE PROBE ERROR');e.diagnosticFailure=failure;e.diagnosticPartialOutput=emptyPartial?'':seedPartial?o.prefix.slice(0,o.prefix.indexOf(seedMarker('movement_insert','END'))):o.prefix;throw e;}return o.output;}
  if(sql===fullSealReadbackSQL(positiveRun)){reads++;const parsed=o.readback.split('\n').map(JSON.parse);if(beforeDrift)parsed[0].metadata.run.stagedMovements=25946;if(reads>1){if(cleanupSession)parsed[2].activeConnections=1;if(metadataDrift)parsed[0].metadata.receipts=1;if(definitionDrift)parsed[1].definitions[0].sha256='f'.repeat(64);}return parsed.map(JSON.stringify).join('\n');}
  return original(sql,options);
 };
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();
 return {f,d,o,counts:()=>({calls,reads})};
}
const completedWorker={status:'PASS_WORKER_ANALYSIS'};
test('full seal observation is one diagnostic-only transaction with complete plans, function invariants and independently closed rollback',async()=>{
 const {f,d,counts}=await fullProbeFixture();await d.fullSealProbe(positiveRun,failedFinalization(),completedWorker);await d.restore();
 const out=f.saved.at(-1).value,item=out.fullSealProbe;assert.equal(counts().calls,1);assert.equal(item.status,'DIAGNOSTIC_SELECT_OBSERVATION_COMPLETE');assert.equal(item.analyzeAttempts,1);assert.equal(item.cleanupVerified,true);assert.equal(item.functionDefinitionsUnchanged,true);assert.equal(item.timingQualification,false);assert.equal(item.nodeTimingAvailable,false);assert.equal(out.configurationRestored,true);assert.notEqual(out.status,'PASS');
 await assert.rejects(d.fullSealProbe(positiveRun,failedFinalization(),completedWorker),/probe_repeated/);assert.equal(counts().calls,1);
});
test('full seal timeout preserves estimated plan, original57014 and independent cleanup without retry',async()=>{
 for(const failure of [{sqlState:'57014',kind:'sql_rejected'},{kind:'process_timeout'}]){
  const {f,d,counts}=await fullProbeFixture({failure});const primary=failedFinalization(),original=structuredClone(primary);
  await d.fullSealProbe(positiveRun,primary,completedWorker);assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');
  const item=f.saved.at(-1).value.fullSealProbe;assert.deepEqual(primary,original);assert.equal(counts().calls,1);assert.equal(item.status,'FAIL');assert.equal(item.estimatedPlanCaptured,true);assert.equal(item.analyzedPlanCaptured,false);assert.equal(item.analyzeAttempts,1);assert.equal(item.cleanupVerified,true);assert.equal(item.failure.kind,failure.kind);assert.equal(JSON.stringify(item).includes('PRIVATE'),false);
 }
});
test('full seal observation cannot promote an open backend, state drift or changed function definitions',async()=>{
 for(const option of ['cleanupSession','metadataDrift','definitionDrift']){
  const {f,d,counts}=await fullProbeFixture({[option]:true});await d.fullSealProbe(positiveRun,failedFinalization(),completedWorker);await d.restore();
  const out=f.saved.at(-1).value;assert.equal(out.fullSealProbe.status,'FAIL');assert.equal(out.fullSealProbe.cleanupVerified,false);assert.equal(out.status,'DIAGNOSTIC_OBSERVATION_FAILED');assert.equal(out.configurationRestored,true);assert.equal(counts().calls,1);if(option==='cleanupSession')assert.equal(counts().reads,9);
 }
});
test('transport timeout without stdout leaves ANALYZE count unknown while proving cleanup separately',async()=>{
 const {f,d,counts}=await fullProbeFixture({failure:{kind:'process_timeout'},emptyPartial:true});
 await d.fullSealProbe(positiveRun,failedFinalization(),completedWorker);await d.restore();
 const item=f.saved.at(-1).value.fullSealProbe;assert.equal(item.probeStarted,true);assert.equal(item.analyzeAttempts,null);assert.equal(item.maximumAnalyzeAttempts,1);assert.equal(item.estimatedPlanCaptured,false);assert.equal(item.cleanupVerified,true);assert.equal(item.status,'FAIL');assert.deepEqual(counts(),{calls:1,reads:2});
});
test('SQL timeout after seed BEGIN preserves that boundary, unknown ANALYZE and primary Apply while cleanup still runs',async()=>{
 const {f,d,counts}=await fullProbeFixture({failure:{kind:'sql_rejected',sqlState:'57014'},seedPartial:true}),primary=failedFinalization(),before=structuredClone(primary);
 await d.fullSealProbe(positiveRun,primary,completedWorker);await d.restore();const out=f.saved.at(-1).value,item=out.fullSealProbe;
 assert.deepEqual(primary,before);assert.equal(item.status,'FAIL');assert.equal(item.observation.seedStatements.active,'movement_insert');assert.equal(item.observation.seedStatements.lastCompleted,'batch_insert');assert.equal(item.analyzeAttempts,null);assert.equal(item.cleanupVerified,true);assert.equal(out.configurationRestored,true);assert.deepEqual(counts(),{calls:1,reads:2});
});
test('full seal prerequisites reject incomplete Worker, repeated Apply, wrong failure, publication or changed staging before seed',async()=>{
 for(const change of [v=>v.applyAttempts=2,v=>v.steps.push({...v.steps[0]}),v=>v.steps[0].sqlState='42501',v=>v.canonical.receiptPresent=true,v=>v.canonical.runtimeRevision='1']){
  const {f,d,counts}=await fullProbeFixture(),finalization=failedFinalization();change(finalization);await d.fullSealProbe(positiveRun,finalization,completedWorker);assert.equal(counts().calls,0);assert.equal(counts().reads,0);assert.equal(f.saved.at(-1).value.fullSealProbe.status,'NOT_RUN');
 }
 const noWorker=await fullProbeFixture();await noWorker.d.fullSealProbe(positiveRun,failedFinalization(),{status:'FAIL'});assert.equal(noWorker.counts().calls,0);
 const drift=await fullProbeFixture({beforeDrift:true});await drift.d.fullSealProbe(positiveRun,failedFinalization(),completedWorker);assert.equal(drift.counts().calls,0);assert.equal(drift.f.saved.at(-1).value.fullSealProbe.probeStarted,false);
 const runner=readFileSync(new URL('../../scripts/testing/asus019-history-volume.mjs',import.meta.url),'utf8');assert.doesNotMatch(runner,/\.positivePayloadProbe\(/);assert.match(runner,/fullSealProbe\(run.run_id,report.finalization,report.workerAnalysis\)/);assert.match(runner,/catch\{\/\* Primary RPC\/readback failure remains authoritative\. \*\/}}throw error;/);
});

test('positive fixture uses one rollback-only connection, exact512 and all six alternating positive samples',async()=>{
 let probes=0;const records=positiveRecords();
 const g=fixture(),original=g.options.query;
 g.options.query=(sql,options)=>{if(options?.positiveProbe){probes++;assert.equal(sql,positivePayloadProbeSQL(positiveRun));return records.map(JSON.stringify).join('\n');}if(sql===positivePayloadReadbackSQL(positiveRun))return [records.at(-1),{phase:'connection_cleanup',activeConnections:0}].map(JSON.stringify).join('\n');return original(sql,options);};
 const d=createOwnedVolumeSqlDiagnostics(g.options);d.observeWarmResponse(g.nonce,{ok:true,run:null});await d.prepare();await d.positivePayloadProbe(positiveRun,failedFinalization());await d.restore();
 const out=g.saved.at(-1).value;assert.equal(probes,1);assert.equal(out.positivePayloadProbe.status,'PASS_SYNTHETIC_ROLLBACK_ONLY_COMPARISON');assert.equal(out.positivePayloadProbe.cleanupVerified,true);assert.equal(out.positivePayloadProbe.records.length,9);assert.equal(out.configurationRestored,true);
 const sql=positivePayloadProbeSQL(positiveRun);assert.equal((sql.match(/select pg_temp.measure_payload512/g)||[]).length,6);assert.equal((sql.match(/\bbegin;/g)||[]).length,1);assert.equal((sql.match(/\brollback;/g)||[]).length,1);assert.doesNotMatch(sql,/\bcommit\b|baseline_apply|__OWNED/);assert.match(sql,/payload_probe_uuid_collision/);assert.match(sql,/set local statement_timeout='8s'/);
 assert.throws(()=>positivePayloadProbeSQL("invalid';COMMIT;"),/scope/);
 assert.ok(sql.startsWith(`SET application_name='a19-payload512-${positiveRun}';`));assert.ok(positivePayloadReadbackSQL(positiveRun).includes(`application_name='a19-payload512-${positiveRun}'`));assert.ok(`a19-payload512-${positiveRun}`.length<64);
});

test('partial positive-probe failure preserves completed samples and separately attests session exit and rollback',async()=>{
 const g=fixture(),original=g.options.query,records=positiveRecords();let probes=0;
 g.options.query=(sql,options)=>{if(options?.positiveProbe){probes++;const e=Error('private-primary-probe');e.diagnosticFailure={sqlState:'57014'};e.diagnosticPartialOutput=records.slice(0,4).map(JSON.stringify).join('\n');throw e;}if(sql===positivePayloadReadbackSQL(positiveRun))return [records.at(-1),{phase:'connection_cleanup',activeConnections:0}].map(JSON.stringify).join('\n');return original(sql,options);};
 const d=createOwnedVolumeSqlDiagnostics(g.options);d.observeWarmResponse(g.nonce,{ok:true,run:null});await d.prepare();await d.positivePayloadProbe(positiveRun,failedFinalization());assert.equal(await d.restore(),'DIAGNOSTIC_OBSERVATION_FAILED');
 const out=g.saved.at(-1).value;assert.equal(probes,1);assert.equal(out.positivePayloadProbe.partial.records.length,4);assert.equal(out.positivePayloadProbe.failure.sqlState,'57014');assert.equal(out.positivePayloadProbe.cleanupVerified,true);assert.equal(out.positivePayloadProbe.status,'FAIL');assert.equal(out.configurationRestored,true);assert.equal(JSON.stringify(out).includes('private-primary-probe'),false);
});

test('closed positive output never exports raw error text or accepts null payloads as equality',()=>{
 const records=positiveRecords();records[1].positive=0;records[2].secret='private-secret';const parsed=closePositivePayloadOutput(records.map(JSON.stringify).join('\n')+'\nraw secret error');
 assert.equal(parsed.invalidLines,2);assert.equal(JSON.stringify(parsed).includes('secret'),false);
 const runner=readFileSync(new URL('../../scripts/testing/asus019-history-volume.mjs',import.meta.url),'utf8');assert.match(runner,/timeout:positiveProbe\?90000:3000/);assert.match(runner,/fullSealProbe\(run.run_id,report.finalization,report.workerAnalysis\)/);assert.match(runner,/throw error;}/);
});


test('positive probe never follows a successful or repeated Apply and refuses failed parity or unclosed session',async()=>{
 for(const mode of ['applied','attempts','parity','session']){
  const f=fixture(),original=f.options.query,records=positiveRecords();let probes=0,reads=0;
  if(mode==='parity')records[7].protocolDigestEqual=false;
  f.options.query=(sql,options)=>{if(options?.positiveProbe){probes++;return records.map(JSON.stringify).join('\n');}if(sql===positivePayloadReadbackSQL(positiveRun)){reads++;return [records.at(-1),{phase:'connection_cleanup',activeConnections:mode==='session'&&reads>1?1:0}].map(JSON.stringify).join('\n');}return original(sql,options);};
  const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();const failure=failedFinalization();if(mode==='applied')failure.canonical.state='applied';if(mode==='attempts')failure.applyAttempts=2;
  await d.positivePayloadProbe(positiveRun,failure);await d.restore();const out=f.saved.at(-1).value;
  if(['applied','attempts'].includes(mode)){assert.equal(probes,0);assert.equal(reads,0);assert.equal(out.positivePayloadProbe,undefined);}
  else{assert.equal(probes,1);assert.equal(out.positivePayloadProbe.status,'FAIL');assert.equal(out.status,'DIAGNOSTIC_OBSERVATION_FAILED');if(mode==='session'){assert.equal(reads,9);assert.equal(out.positivePayloadProbe.cleanupVerified,false);}}
  assert.equal(out.configurationRestored,true);
 }
});

test('unavailable function snapshot prevents the financial invocation before Apply',async()=>{
 const f=fixture(),original=f.options.query;let armed=false,requests=0;
 f.options.query=(sql,options)=>armed&&sql===functionSnapshotSQL()?'null':original(sql,options);
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();d.capture('before_analysis');d.finish();armed=true;
 await assert.rejects(()=>d.observeFinalization('baseline_apply',async()=>{requests++;return {};}));assert.equal(requests,0);armed=false;await d.restore();assert.equal(f.saved.at(-1).value.configurationRestored,true);
});

test('fractional early timer wake waits the monotonic remainder before all function snapshots',async()=>{
 const f=fixture(),waits=[],query=f.options.query;let clock=0,windowStarted=null;
 f.options.monotonicNow=()=>clock;
 f.options.pause=async ms=>{waits.push(ms);if(ms===11000)windowStarted=clock;clock+=ms===11000?10999.736:ms;};
 f.options.query=(sql,options)=>{if(sql===functionSnapshotSQL()&&windowStarted!==null)assert.ok(clock-windowStarted>=11000,'no function sample before the unchanged monotonic deadline');return query(sql,options);};
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});
 await d.prepare();await d.restore();const out=f.saved.at(-1).value;
 assert.equal(out.configurationRestored,true);assert.equal(f.rpcCalls.length,2);assert.equal(out.functionSettlementWindows.length,4);
 assert.ok(out.functionSettlementWindows.every(w=>w.minimumIdleWaitMs===11000&&w.maximumIdleWaitAttempts===4&&w.idleWaitAttempts===2&&w.idleWaitMs>=11000&&w.samples===2&&w.status==='STABLE_AFTER_IDLE_FLUSH_WINDOW'));
 assert.equal(waits.filter(ms=>ms===1).length,4);
 assert.equal(f.calls.some(sql=>/pg_stat_(?:reset\w*|force_next_flush)\s*\(/.test(sql)),false);
});

test('an exact or overshooting idle wait needs no residual pause',async()=>{
 for(const extra of [0,0.25]){
  const f=fixture(),waits=[];let clock=0;
  f.options.monotonicNow=()=>clock;f.options.pause=async ms=>{waits.push(ms);clock+=ms+(ms===11000?extra:0);};
  const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();await d.restore();
  const out=f.saved.at(-1).value;assert.equal(out.configurationRestored,true);
  assert.ok(out.functionSettlementWindows.every(w=>w.idleWaitMs===11000+extra&&w.idleWaitAttempts===1&&w.samples===2));
  assert.equal(waits.filter(ms=>ms===11000).length,4);assert.equal(waits.some(ms=>ms===1),false);assert.equal(f.rpcCalls.length,2);
 }
});

test('an all-zero fake clock fails before any settlement function snapshot',async()=>{
 const f=fixture(),waits=[];f.options.monotonicNow=()=>0;f.options.pause=async ms=>{waits.push(ms);};
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepareInstance();
 const beforeSnapshots=f.calls.filter(sql=>sql===functionSnapshotSQL()).length;await assert.rejects(()=>d.prepare(),/preflight_failed/);
 const out=f.saved.at(-1).value,window=out.functionSettlementWindows.at(-1);
 assert.equal(window.idleWaitMs,0);assert.equal(window.idleWaitAttempts,1);assert.equal(window.samples,0);assert.equal(window.status,'FAIL');
 assert.equal(f.calls.filter(sql=>sql===functionSnapshotSQL()).length,beforeSnapshots);assert.equal(f.rpcCalls.length,0);assert.equal(waits.filter(ms=>ms===11000).length,1);
});

for(const [name,step,expectedAttempts] of [
 ['stalled',now=>now,1],['backward',now=>now-1,1],['nonfinite',()=>NaN,1],['infinite',()=>Infinity,1],
 ['insufficient progress bounded by four waits',now=>now+1,4],
])test(`monotonic ${name} prevents Apply and its first function snapshot`,async()=>{
 const f=fixture();let clock=0,armed=false,attempts=0,invoked=0;
 f.options.monotonicNow=()=>clock;f.options.pause=async ms=>{if(armed){attempts++;clock=step(clock);}else clock+=ms;};
 const d=createOwnedVolumeSqlDiagnostics(f.options);d.observeWarmResponse(f.nonce,{ok:true,run:null});await d.prepare();d.capture('before_analysis');d.finish();
 const safeClock=clock,beforeSnapshots=f.calls.filter(sql=>sql===functionSnapshotSQL()).length;armed=true;
 await assert.rejects(()=>d.observeFinalization('baseline_apply',async()=>{invoked++;return {};}),/^Error: history_volume_diagnostic_finalization_observation_failed$/);
 const window=f.saved.at(-1).value.functionSettlementWindows.at(-1);
 assert.equal(invoked,0);assert.equal(attempts,expectedAttempts);assert.equal(window.idleWaitAttempts,expectedAttempts);assert.equal(window.samples,0);assert.equal(window.status,'FAIL');
 assert.equal(f.calls.filter(sql=>sql===functionSnapshotSQL()).length,beforeSnapshots);
 armed=false;clock=safeClock+11000;await d.restore();assert.equal(f.saved.at(-1).value.configurationRestored,true);
});
