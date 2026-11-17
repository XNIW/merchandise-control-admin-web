import test from 'node:test';
import assert from 'node:assert/strict';
import {closedDiagnosticFailure,closeExplainPlan,statementDelta,createOwnedVolumeSqlDiagnostics,statementSnapshotSQL} from '../../scripts/testing/asus019-history-volume-sql-diagnostics.mjs';

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
