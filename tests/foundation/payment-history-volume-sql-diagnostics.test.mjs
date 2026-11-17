import test from 'node:test';
import assert from 'node:assert/strict';
import {closeExplainPlan,statementDelta,createOwnedVolumeSqlDiagnostics,statementSnapshotSQL} from '../../scripts/testing/asus019-history-volume-sql-diagnostics.mjs';

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

function fixture({previous='top',failSnapshot=false}={}){
 const calls=[],saved=[];let config=['search_path=""',...(previous===null?[]:[`pg_stat_statements.track=${previous}`])];
 const invariants={definitionSha256:'a'.repeat(64),accessSha256:'b'.repeat(64),otherConfigSha256:'c'.repeat(64)};
 const query=sql=>{calls.push(sql);
  if(sql.startsWith('ALTER FUNCTION')){config=['search_path=""',...(sql.includes('RESET pg_stat_statements.track')?[]:[`pg_stat_statements.track=${sql.includes("='all'")?'all':previous}`])];return '';}
  if(sql.includes("'definitionSha256'"))return JSON.stringify(invariants);
  if(sql.includes('coalesce(to_jsonb(proconfig)'))return JSON.stringify(config);
  if(sql.includes("e.extname='pg_stat_statements'"))return JSON.stringify({installed:true,schema:'extensions'});
  if(sql.startsWith('SELECT count(*)'))return '0';
  if(sql.includes("'serverVersionNum'"))return JSON.stringify({serverVersionNum:170006});
  if(sql.includes('FROM pg_stat_all_tables'))return '[]';
  if(sql.startsWith('WITH scoped')){if(failSnapshot)throw Error('private error query/parameter must not escape');return JSON.stringify({statsReset:'same',dealloc:0,statements:[]});}
  throw Error('unhandled fixture SQL');
 };
 const options={runtime:{url:'http://127.0.0.1:54321',containerID:'d'.repeat(64),project:'r4-ci-preflight-'+'e'.repeat(12),head:'f'.repeat(40)},serverSha:'f'.repeat(40),workerSha256:'0'.repeat(64),query,save:(name,value)=>saved.push({name,value:structuredClone(value)})};
 return {calls,saved,options,getConfig:()=>config};
}

test('ownership is rejected before any database operation or evidence export',()=>{
 const f=fixture();f.options.runtime.url='https://live.example.invalid';assert.throws(()=>createOwnedVolumeSqlDiagnostics(f.options),/ownership/);assert.equal(f.calls.length,0);assert.equal(f.saved.length,0);
});

test('function-local tracking restores its prior option and preserves failure as diagnostic-only',()=>{
 for(const previous of ['top',null]){
  const f=fixture({previous,failSnapshot:true}),d=createOwnedVolumeSqlDiagnostics(f.options);
  d.prepare();d.capture('before_analysis');d.capture('before_analysis');d.finish();d.restore();
  assert.deepEqual(f.getConfig(),['search_path=""',...(previous===null?[]:[`pg_stat_statements.track=${previous}`])]);
  const out=f.saved.at(-1).value;
  assert.equal(out.configurationRestored,true);assert.equal(out.diagnosticOnly,true);assert.equal(out.timingQualification,false);assert.equal(out.nestedTracking,'not_attested');
  assert.equal(out.errors.some(x=>x.operation==='before_analysis'),true);assert.equal(JSON.stringify(out).includes('private error'),false);
  assert.equal(out.errors.filter(x=>x.operation==='before_analysis').length,1);
  assert.equal(f.calls.some(x=>/ALTER SYSTEM|RESET ALL|pg_stat_statements_reset|VACUUM|ANALYZE public/.test(x)),false);
 }
});

test('successful configuration alone never attests nested observation; snapshots remain bounded',()=>{
 const f=fixture(),d=createOwnedVolumeSqlDiagnostics(f.options);d.prepare();d.capture('before_analysis');
 for(let i=0;i<20;i++)d.onVector({phase:'stage_objects',last_ordinal:25955});
 for(const n of [6400,12800,19200,25600])d.onVector({phase:'stage_movements',last_ordinal:n});
 d.finish();d.finish();d.restore();
 const out=f.saved.at(-1).value;assert.equal(out.snapshots.length,7);assert.equal(out.nestedTracking,'not_attested');assert.equal(out.configurationScope,'gateway_function_entry_exit');assert.equal(out.cachedPlanObserved,false);
});

test('statement query is closed and accepts only expected extension schemas',()=>{
 assert.throws(()=>statementSnapshotSQL('extensions;drop schema public'),/extension_schema/);
 const query=statementSnapshotSQL('extensions');assert.match(query,/NOT toplevel/);assert.match(query,/for key share/);
 assert.doesNotMatch(query,/SELECT jsonb_build_object\([^;]*queryid/s);
});
