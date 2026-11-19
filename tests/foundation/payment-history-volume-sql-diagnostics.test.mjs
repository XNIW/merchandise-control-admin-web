import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {readOnlyCachedGatewayGet,closedDiagnosticFailure,closeExplainPlan,statementDelta,createOwnedVolumeSqlDiagnostics,statementSnapshotSQL} from '../../scripts/testing/asus019-history-volume-sql-diagnostics.mjs';
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

function fixture({previous=null,failSnapshot=false,adminDenied=false,nestedMissing=false,cacheMiss=false,missingCounters=false,completeCategories=false,resetCanaryEntry=false}={}){
 const calls=[],saved=[],rpcCalls=[],nonce='12345678-1234-4234-8234-123456789012';let auto=previous,counter=0,snapshotCount=0,counterReads=0;
 const config=['search_path=""'];
 const invariants={definitionSha256:'a'.repeat(64),accessSha256:'b'.repeat(64),otherConfigSha256:'c'.repeat(64)};
 const effective=()=>auto??'top';
 const query=(sql,{admin=false}={})=>{calls.push(sql);
  if(sql.startsWith('ALTER SYSTEM')){assert.equal(admin,true);auto=sql.includes('RESET')?null:sql.match(/='(all|top|none)'/)[1];return '';}
  if(sql==='SELECT pg_reload_conf();'){assert.equal(admin,true);return 't';}
  if(sql.includes("'autoEntries'")){assert.equal(admin,true);return JSON.stringify({effective:effective(),autoEntries:auto===null?0:1,autoValue:auto,autoValid:true,pendingRestart:false,otherSettingsSha256:'9'.repeat(64)});}
  if(sql.includes("'expectedPreexistingRole'")){assert.equal(admin,true);return JSON.stringify({expectedPreexistingRole:true,superuser:!adminDenied,canSet:!adminDenied,canAlterSystem:!adminDenied});}
  if(sql.includes('FROM pg_db_role_setting'))return '[]';
  if(sql.includes("'cacheMatches'"))return JSON.stringify({cacheMatches:!cacheMiss,cacheRowSha256:'8'.repeat(64),requestCount:3,importActive:0,migrationActive:0,uploadActive:0});
  if(sql.includes("'calls',coalesce((SELECT sum(calls)")){counterReads++;return JSON.stringify({calls:counter,statsReset:missingCounters?null:'same',dealloc:0,statementEntries:counter===0?0:1,epochsAvailable:true,epochs:counter===0?[]:[{since:resetCanaryEntry&&counterReads>=4?'changed':'same',members:1}]});}
  if(sql.includes("'definitionSha256'"))return JSON.stringify(invariants);
  if(sql.includes('coalesce(to_jsonb(proconfig)'))return JSON.stringify(config);
  if(sql.includes("e.extname='pg_stat_statements'"))return JSON.stringify({installed:true,schema:'extensions'});
  if(sql.startsWith('SELECT count(*)'))return '0';
  if(sql.includes("'serverVersionNum'"))return JSON.stringify({serverVersionNum:170006});
  if(sql.includes('FROM pg_stat_all_tables'))return '[]';
  if(sql.startsWith('WITH scoped')){if(failSnapshot)throw Error('private error query/parameter must not escape');const count=snapshotCount++*10;return JSON.stringify({statsReset:'same',dealloc:0,statements:completeCategories?['object_movement_lookup','object_binding_lookup','object_file_lookup','movement_insert','parent_fk_check','run_counter_update'].map(label=>({label,calls:count,total_exec_time:count,rows:count,shared_blks_hit:0,shared_blks_read:0,shared_blks_dirtied:0,shared_blks_written:0,temp_blks_read:0,temp_blks_written:0,wal_records:0,wal_fpi:0,wal_bytes:0,statementEntries:1,epochsAvailable:true,epochs:[{since:'same',members:1}]})):[]});}
  throw Error('unhandled fixture SQL');
 };
 const rpcGet=async(parameters,options)=>{rpcCalls.push({parameters,options});assert.deepEqual(options,{get:true});assert.deepEqual(parameters,{p_request_id:nonce,p_lane:'migration',p_operation:'claim',p_payload:{}});if(effective()==='all'&&!nestedMissing)counter++;return {data:{ok:true,run:null},errorCode:null};};
 const options={runtime:{url:'http://127.0.0.1:54321',containerID:'d'.repeat(64),project:'r4-ci-preflight-'+'e'.repeat(12),head:'f'.repeat(40)},serverSha:'f'.repeat(40),workerSha256:'0'.repeat(64),query,rpcGet,save:(name,value)=>saved.push({name,value:structuredClone(value)})};
 return {calls,saved,options,rpcCalls,nonce,getConfig:()=>config,getAuto:()=>auto};
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
