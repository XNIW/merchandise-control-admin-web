// Imported only by the existing owned volume runner. This is not a benchmark,
// product migration or release qualification path. Never export query text.
import {setTimeout as delay} from 'node:timers/promises';
const gateway='public.payment_history_worker_gateway_v1(uuid,text,text,jsonb)';
const tables=['payment_history_migration_runs','payment_history_migration_objects','payment_history_migration_movements'];
const tableList=tables.map(name=>`'${name}'`).join(',');
const metrics=['calls','total_exec_time','rows','shared_blks_hit','shared_blks_read','shared_blks_dirtied','shared_blks_written','temp_blks_read','temp_blks_written','wal_records','wal_fpi','wal_bytes'];
const labels=['object_movement_lookup','object_binding_lookup','object_file_lookup','movement_insert','parent_fk_check','run_counter_update','actor_guard','other_scoped'];
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const sqlStates=new Set(['42501','25001','25006','55P03','57014','42704','42883','0A000','08006','28P01','28000','22023']);
export function closedDiagnosticFailure({stderr='',timedOut=false,status=null,sqlState,kind}={}){
 const candidate=sqlState??String(stderr).match(/\b(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1],found=/^[0-9A-Z]{5}$/.test(candidate??'')?candidate:undefined;
 return {sqlState:sqlStates.has(found)?found:found?'OTHER_SQLSTATE':null,kind:['process_timeout','sql_rejected','process_failed','observation_failed'].includes(kind)?kind:timedOut?'process_timeout':found?'sql_rejected':Number.isInteger(status)&&status!==0?'process_failed':'observation_failed'};
}

// EXPLAIN can contain fixture values in conditions, aliases, expressions and
// output lists. Reconstruct a closed tree; do not remove a few known bad keys.
export function closeExplainPlan(value){
 const allowedNodes=new Set(['Result','Seq Scan','Index Scan','Index Only Scan','Bitmap Heap Scan','Bitmap Index Scan','BitmapAnd','BitmapOr','Limit','LockRows','Nested Loop','Hash Join','Merge Join','Hash','Aggregate','Sort','Materialize','Memoize','Subquery Scan']);
 let count=0;
 function node(input,depth=0){
  if(!input||typeof input!=='object'||depth>12||++count>64)throw Error('history_volume_diagnostic_plan_shape');
  const out={nodeType:allowedNodes.has(input['Node Type'])?input['Node Type']:'other'};
  if(input['Relation Name'])out.relation=tables.includes(input['Relation Name'])?input['Relation Name']:'other';
  if(input['Index Name'])out.index=tables.some(t=>input['Index Name']===t+'_pkey')?'primary_key':input['Index Name']==='payment_history_migration_runs_shop_id_run_id_key'?'run_shop_unique':'other';
  for(const key of ['Plan Rows','Plan Width','Actual Rows','Actual Loops','Rows Removed by Filter','Rows Removed by Index Recheck','Shared Hit Blocks','Shared Read Blocks','Shared Dirtied Blocks','Shared Written Blocks','Temp Read Blocks','Temp Written Blocks'])if(finite(input[key]))out[key]=input[key];
  if(input.Plans) {if(!Array.isArray(input.Plans)||input.Plans.length>16)throw Error('history_volume_diagnostic_plan_shape');out.plans=input.Plans.map(p=>node(p,depth+1));}
  return out;
 }
 if(!Array.isArray(value)||value.length!==1||!value[0]?.Plan)throw Error('history_volume_diagnostic_plan_shape');
 const result={plan:node(value[0].Plan),planOrigin:'fresh_observer_query_not_cached_plpgsql',cachedPlanObserved:false};
 for(const key of ['Planning Time','Execution Time'])if(finite(value[0][key]))result[key]=value[0][key];
 return result;
}

// Label totals overlap enclosing statements and must never be summed as an
// exclusive SQL profile. A reset, eviction, or decreasing counter invalidates
// the interval rather than manufacturing a positive delta.
export function statementDelta(before,after){
 const reasons=[];
 if(typeof before.statsReset!=='string'||typeof after.statsReset!=='string'||before.statsReset!==after.statsReset)reasons.push('statistics_reset_or_unavailable');
 if(!finite(before.dealloc)||!finite(after.dealloc)||before.dealloc!==after.dealloc)reasons.push('statement_eviction_or_unavailable');
 const rows=[];
 for(const label of labels){
  const a=before.statements?.find(x=>x.label===label),b=after.statements?.find(x=>x.label===label);
  if(!a&&!b)continue;
  const row={label},rowReasons=[...reasons];
  if(a&&b&&(a.statementEntries!==b.statementEntries||JSON.stringify(a.epochs)!==JSON.stringify(b.epochs)))rowReasons.push('statement_cohort_changed');
  const cohortAvailable=r=>!r||(r.epochsAvailable===true&&Number.isSafeInteger(r.statementEntries)&&r.statementEntries>0&&Array.isArray(r.epochs)&&r.epochs.length>0&&r.epochs.every(e=>typeof e.since==='string'&&Number.isSafeInteger(e.members)&&e.members>0)&&r.epochs.reduce((n,e)=>n+e.members,0)===r.statementEntries);
  if(!cohortAvailable(a)||!cohortAvailable(b))rowReasons.push('entry_epochs_unavailable');
  for(const key of metrics){const av=a?a[key]:0,bv=b?b[key]:0;if(!finite(av)||!finite(bv)||bv<av){rowReasons.push('counter_unavailable_or_decreased');row[key]=null;}else row[key]=bv-av;}
  row.reasons=[...new Set(rowReasons)];row.valid=row.reasons.length===0;
  rows.push(row);
 }
 return {valid:reasons.length===0,reasons:[...new Set(reasons)],allCategoriesComparable:rows.every(r=>r.valid),overlappingNestedTotals:true,statements:rows};
}

const catalogSQL=`SELECT jsonb_build_object(
 'serverVersionNum',current_setting('server_version_num')::integer,
 'settings',jsonb_build_object('plan_cache_mode',current_setting('plan_cache_mode',true),'jit',current_setting('jit',true),'track_functions',current_setting('track_functions',true),'pg_stat_statements.track',current_setting('pg_stat_statements.track',true),'track_io_timing',current_setting('track_io_timing',true),'compute_query_id',current_setting('compute_query_id',true),'statementsPreloaded',position('pg_stat_statements' IN current_setting('shared_preload_libraries',true))>0),
 'tables',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'ownerSuperuser',r.rolsuper,'ownerBypassRls',r.rolbypassrls,
 'indexes',(SELECT jsonb_agg(jsonb_build_object('primary',i.indisprimary,'unique',i.indisunique,'valid',i.indisvalid,'keyColumns',i.indnkeyatts,'hasExpression',i.indexprs IS NOT NULL,'hasPredicate',i.indpred IS NOT NULL)) FROM pg_index i WHERE i.indrelid=c.oid),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('type',k.contype,'validated',k.convalidated,'deferred',k.condeferred,'deferrable',k.condeferrable,'columns',cardinality(k.conkey),'referencesScopedRun',k.confrelid='public.payment_history_migration_runs'::regclass)) FROM pg_constraint k WHERE k.conrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('internal',t.tgisinternal,'enabled',t.tgenabled,'type',t.tgtype,'functionKind',CASE WHEN p.proname LIKE 'RI_FKey%' THEN 'foreign_key' WHEN p.proname='payment_history_migration_source_immutable_v2' THEN 'source_immutable' ELSE 'other' END)) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=c.oid))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relname IN(${tableList})),
 'functions',(SELECT jsonb_agg(jsonb_build_object('function',p.proname,'securityDefiner',p.prosecdef,'ownerSuperuser',r.rolsuper,'ownerBypassRls',r.rolbypassrls,'emptySearchPath',coalesce('search_path=""'=ANY(p.proconfig),false))) FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid IN('${gateway}'::regprocedure,'public.payment_history_migration_worker_v1(text,jsonb)'::regprocedure,'app_private.payment_history_migration_stage_vector_v2(jsonb)'::regprocedure))
);`;

const tableStatsSQL=`SELECT jsonb_build_object('tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',relname,'seqScan',seq_scan,'seqTuples',seq_tup_read,'indexScan',idx_scan,'indexTuples',idx_tup_fetch,'inserted',n_tup_ins,'updated',n_tup_upd,'hotUpdated',n_tup_hot_upd,'liveEstimated',n_live_tup,'deadEstimated',n_dead_tup,'modSinceAnalyze',n_mod_since_analyze,'lastAnalyze',last_analyze,'lastAutoanalyze',last_autoanalyze,'lastAutovacuum',last_autovacuum)), '[]'::jsonb) FROM pg_stat_all_tables WHERE schemaname='public' AND relname IN(${tableList})),
 'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',s.relname,'primary',i.indisprimary,'unique',i.indisunique,'scans',s.idx_scan,'tuplesRead',s.idx_tup_read,'tuplesFetched',s.idx_tup_fetch)),'[]'::jsonb) FROM pg_stat_all_indexes s JOIN pg_index i ON i.indexrelid=s.indexrelid WHERE s.schemaname='public' AND s.relname IN(${tableList})),
 'columnStatistics',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',tablename,'column',attname,'nullFraction',null_frac,'averageWidth',avg_width,'distinctEstimate',n_distinct,'correlation',correlation)),'[]'::jsonb) FROM pg_stats WHERE schemaname='public' AND tablename IN(${tableList})),
 'statisticsVisibility','estimated_and_asynchronously_updated_no_reset_or_analyze');`;

export function statementSnapshotSQL(schema){
 if(!['extensions','public'].includes(schema))throw Error('history_volume_diagnostic_extension_schema');
 // Constants are normalized by pg_stat_statements. Alias/column structure
 // identifies the three distinct object lookups without relying on literals.
 return `WITH scoped AS (SELECT s.*,trim(lower(regexp_replace(replace(s.query,'"',''),'[[:space:]]+',' ','g'))) normalized FROM ${schema}.pg_stat_statements s WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND NOT toplevel AND s.query NOT ILIKE '%pg_stat_statements%'),
 classified AS (SELECT *,CASE
 WHEN normalized LIKE '%payment_history_migration_objects x %' AND normalized LIKE '%x.object%' THEN 'object_binding_lookup'
 WHEN normalized LIKE '%payment_history_migration_objects f %' AND normalized LIKE '%f.object%' THEN 'object_file_lookup'
 WHEN normalized LIKE 'select object %' AND normalized LIKE '%from public.payment_history_migration_objects %' THEN 'object_movement_lookup'
 WHEN normalized LIKE 'insert into public.payment_history_migration_movements%' THEN 'movement_insert'
 WHEN normalized LIKE '%payment_history_migration_runs%' AND normalized LIKE '%for key share%' THEN 'parent_fk_check'
 WHEN normalized LIKE 'update public.payment_history_migration_runs set processed_%' THEN 'run_counter_update'
 WHEN normalized LIKE '%payment_history_migration_actor_current_v1%' THEN 'actor_guard'
 WHEN normalized LIKE '%payment_history_migration_%' THEN 'other_scoped' ELSE NULL END label FROM scoped),
 epochs AS (SELECT label,to_jsonb(classified)->>'stats_since' AS since,count(*) AS members FROM classified WHERE label IS NOT NULL GROUP BY label,to_jsonb(classified)->>'stats_since'),
 totals AS (SELECT label,count(*) AS "statementEntries",bool_and(to_jsonb(classified)->>'stats_since' IS NOT NULL) AS "epochsAvailable",${metrics.map(k=>`sum((to_jsonb(classified)->>${quote(k)})::numeric) AS ${k}`).join(',')},(SELECT jsonb_agg(jsonb_build_object('since',e.since,'members',e.members) ORDER BY e.since NULLS FIRST) FROM epochs e WHERE e.label=classified.label) AS epochs FROM classified WHERE label IS NOT NULL GROUP BY label)
 SELECT jsonb_build_object('statements',coalesce((SELECT jsonb_agg(to_jsonb(totals)) FROM totals),'[]'::jsonb),'statsReset',(SELECT stats_reset FROM ${schema}.pg_stat_statements_info),'dealloc',(SELECT dealloc FROM ${schema}.pg_stat_statements_info));`;
}

export function createOwnedVolumeSqlDiagnostics({runtime,query:runQuery,rpcGet,save,serverSha,workerSha256}){
 if(runtime.url!=='http://127.0.0.1:54321'||!/^[0-9a-f]{64}$/.test(runtime.containerID)||!/^r4-ci-preflight-[0-9a-f]{12}$/.test(runtime.project)||runtime.head!==serverSha)throw Error('history_volume_diagnostic_ownership');
 const result={schema:'asus019-owned-volume-sql-diagnostic-v2',diagnosticOnly:true,timingQualification:false,ownershipVerified:true,serverSha,workerSha256,limits:{analysisBudgetMs:120000,requestBudgetMs:15000,canonicalRowLimit:200,vectorChunkLimit:4},snapshots:[],freshPlans:[],errors:[],configurationRestored:false,cachedPlanObserved:false,observerTimeScope:'synchronous_sql_calls_only_no_nested_double_count',preflight:{passed:false,stage:'not_started'},configurationScope:'single_owned_disposable_instance'};
 let schema,priorConfig,priorInstance,writeAttempted=false,finished=false,warmNonce,warmInvalid=false,measurementStarted=false;const attemptedCaptures=new Set();
 const persist=()=>save('sql-diagnostics.json',result);
 const query=(text,admin=false)=>{const started=performance.now();try{return runQuery(text,{admin});}finally{result.observerElapsedMs=(result.observerElapsedMs??0)+(performance.now()-started);result.observerQueryCount=(result.observerQueryCount??0)+1;}};
 const record=(operation,error)=>{result.errors.push({operation,code:'diagnostic_observation_unavailable',...closedDiagnosticFailure(error?.diagnosticFailure??{})});persist();};
 const bounded=(operation,action)=>{try{return action();}catch(error){record(operation,error);return undefined;}finally{persist();}};
 const demand=ok=>{if(!ok)throw Error('history_volume_diagnostic_preflight_failed');};
 const config=()=>JSON.parse(query(`SELECT coalesce(to_jsonb(proconfig),'[]'::jsonb) FROM pg_proc WHERE oid='${gateway}'::regprocedure;`));
 const invariants=()=>JSON.parse(query(`SELECT jsonb_build_object('definitionSha256',encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex'),'accessSha256',encode(extensions.digest(convert_to(jsonb_build_array(proowner,proacl,prosecdef)::text,'UTF8'),'sha256'),'hex'),'otherConfigSha256',encode(extensions.digest(convert_to(coalesce((SELECT jsonb_agg(v ORDER BY v) FROM unnest(proconfig) v WHERE v NOT LIKE 'pg_stat_statements.track=%'),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')) FROM pg_proc WHERE oid='${gateway}'::regprocedure;`));
 function capture(label){
  if(!result.preflight.passed)return;if(label==='before_analysis')measurementStarted=true;
  if(attemptedCaptures.has(label)||attemptedCaptures.size>=7)return;attemptedCaptures.add(label);result.snapshotAttempts=[...attemptedCaptures];
  bounded(label,()=>{const snapshot={label,tableStats:JSON.parse(query(tableStatsSQL))};if(schema)snapshot.statements=JSON.parse(query(statementSnapshotSQL(schema)));result.snapshots.push(snapshot);});
 }
 function observeWarmResponse(nonce,data){
  if(data?.ok!==true||data.run!==null||Object.keys(data).sort().join(',')!=='ok,run')return;
  if(typeof nonce!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(nonce)||warmNonce&&warmNonce!==nonce){warmInvalid=true;return;}
  warmNonce=nonce;
 }
 const instance=()=>JSON.parse(query(`SELECT jsonb_build_object('effective',current_setting('pg_stat_statements.track'),'autoEntries',(SELECT count(*) FROM pg_file_settings WHERE name='pg_stat_statements.track' AND sourcefile LIKE '%/postgresql.auto.conf'),'autoValue',(SELECT setting FROM pg_file_settings WHERE name='pg_stat_statements.track' AND sourcefile LIKE '%/postgresql.auto.conf' ORDER BY seqno DESC LIMIT 1),'autoValid',coalesce((SELECT bool_and(error IS NULL) FROM pg_file_settings WHERE name='pg_stat_statements.track' AND sourcefile LIKE '%/postgresql.auto.conf'),true),'pendingRestart',(SELECT pending_restart FROM pg_settings WHERE name='pg_stat_statements.track'),'otherSettingsSha256',(SELECT encode(extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(sourcefile,name,setting,applied,error) ORDER BY seqno),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') FROM pg_file_settings WHERE name<>'pg_stat_statements.track'));`,true));
 const validInstance=v=>v&&['all','top','none'].includes(v.effective)&&[0,1].includes(v.autoEntries)&&(v.autoEntries===0?v.autoValue===null:['all','top','none'].includes(v.autoValue))&&v.autoValid===true&&v.pendingRestart===false&&/^[0-9a-f]{64}$/.test(v.otherSettingsSha256);
 async function readback(expected){
  // Reload is asynchronous; bounded readback is not a canonical job retry.
  for(let i=0;i<5;i++){await delay(100);const value=instance();if(validInstance(value)&&value.effective===expected)return value;}
  throw Error('history_volume_diagnostic_readback_failed');
 }
 const cacheState=()=>JSON.parse(query(`SELECT jsonb_build_object('cacheMatches',coalesce((SELECT request_digest=encode(extensions.digest(convert_to(jsonb_build_object('lane','migration','operation','claim','payload','{}'::jsonb)::text,'UTF8'),'sha256'),'hex') AND response='{"ok":true,"run":null}'::jsonb AND created_at>clock_timestamp()-interval '1 hour' FROM public.payment_history_worker_requests WHERE request_id=${quote(warmNonce)}::uuid),false),'cacheRowSha256',(SELECT encode(extensions.digest(convert_to(to_jsonb(r)::text,'UTF8'),'sha256'),'hex') FROM public.payment_history_worker_requests r WHERE request_id=${quote(warmNonce)}::uuid),'requestCount',(SELECT count(*) FROM public.payment_history_worker_requests),'importActive',(SELECT count(*) FROM public.payment_history_jobs WHERE state IN('queued','analysing')),'migrationActive',(SELECT count(*) FROM public.payment_history_migration_runs WHERE state IN('queued','analysing')),'uploadActive',(SELECT count(*) FROM public.payment_history_uploads WHERE state IN('uploaded','verifying')));`));
 const cacheCounters=()=>JSON.parse(query(`WITH cache_rows AS (SELECT calls,to_jsonb(s)->>'stats_since' AS since FROM ${schema}.pg_stat_statements s WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND NOT toplevel AND trim(lower(regexp_replace(replace(query,'"',''),'[[:space:]]+',' ','g'))) LIKE 'select *%from public.payment_history_worker_requests where request_id%' AND query NOT ILIKE '%pg_stat_statements%'),epochs AS (SELECT since,count(*) AS members FROM cache_rows GROUP BY since) SELECT jsonb_build_object('calls',coalesce((SELECT sum(calls) FROM cache_rows),0),'statementEntries',(SELECT count(*) FROM cache_rows),'epochsAvailable',coalesce((SELECT bool_and(since IS NOT NULL) FROM cache_rows),true),'epochs',coalesce((SELECT jsonb_agg(jsonb_build_object('since',since,'members',members) ORDER BY since NULLS FIRST) FROM epochs),'[]'::jsonb),'statsReset',(SELECT stats_reset FROM ${schema}.pg_stat_statements_info),'dealloc',(SELECT dealloc FROM ${schema}.pg_stat_statements_info));`,true));
 const validCacheCohort=c=>Number.isSafeInteger(c.statementEntries)&&c.statementEntries>=0&&c.epochsAvailable===true&&Array.isArray(c.epochs)&&c.epochs.every(e=>typeof e.since==='string'&&Number.isSafeInteger(e.members)&&e.members>0)&&c.epochs.reduce((n,e)=>n+e.members,0)===c.statementEntries&&(c.statementEntries!==0||c.calls===0);
 async function canary(label,expectedDelta){
  demand(warmNonce&&!warmInvalid&&typeof rpcGet==='function');
  const before=cacheState();demand(before.cacheMatches);if(label==='trackingCanary')demand(before.importActive===0&&before.migrationActive===0&&before.uploadActive===0);
  const counts=cacheCounters(),started=performance.now();
  const response=await rpcGet({p_request_id:warmNonce,p_lane:'migration',p_operation:'claim',p_payload:{}},{get:true});
  result.canaryRpcElapsedMs=(result.canaryRpcElapsedMs??0)+(performance.now()-started);
  if(response.errorCode){const error=Error('history_volume_diagnostic_canary_failed');error.diagnosticFailure={sqlState:response.errorCode};throw error;}
  demand(response.data?.ok===true&&response.data.run===null&&Object.keys(response.data).sort().join(',')==='ok,run');
  const afterCounts=cacheCounters(),after=cacheState(),delta=afterCounts.calls-counts.calls;
  result[label]={status:'FAIL',mode:'POSTGREST_GET_CACHED_GATEWAY_READ_ONLY',originalWarmRequestBound:true,cacheAndQueuesUnchanged:JSON.stringify(before)===JSON.stringify(after),expectedNestedDelta:expectedDelta,observedNestedDelta:finite(delta)?delta:null,counterCohortBefore:counts,counterCohortAfter:afterCounts,notWorkerHmacReplay:true};persist();
  demand(JSON.stringify(before)===JSON.stringify(after)&&typeof counts.statsReset==='string'&&counts.statsReset===afterCounts.statsReset&&finite(counts.dealloc)&&counts.dealloc===afterCounts.dealloc&&finite(counts.calls)&&finite(afterCounts.calls)&&finite(delta)&&delta===expectedDelta&&validCacheCohort(counts)&&validCacheCohort(afterCounts)&&(counts.statementEntries===0||counts.statementEntries===afterCounts.statementEntries&&JSON.stringify(counts.epochs)===JSON.stringify(afterCounts.epochs)));
  result[label].status='PASS';persist();
 }
 async function prepare(){
  persist();
  try{
   result.preflight.stage='owned_catalog';
   result.catalog=JSON.parse(query(catalogSQL));
   const extension=JSON.parse(query("SELECT coalesce((SELECT jsonb_build_object('schema',n.nspname,'installed',true) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_stat_statements'),'{\"installed\":false}'::jsonb);"));
   result.extensionInstalled=extension.installed;
   demand(extension.installed&&['extensions','public'].includes(extension.schema));schema=extension.schema;
   // Test the actual view before changing metadata. Do not install/restart/reset.
   query(`SELECT count(*) FROM ${extension.schema}.pg_stat_statements;`);
   priorConfig=config();
   if(!Array.isArray(priorConfig)||priorConfig.some(v=>typeof v!=='string'||!/^search_path=""$|^pg_stat_statements\.track=(all|top|none)$/.test(v)))throw Error('history_volume_diagnostic_function_config');
   result.priorGatewayConfig=priorConfig;
   result.priorGatewayInvariants=invariants();
   demand(warmNonce&&!warmInvalid);
   result.preflight.stage='preexisting_local_admin';
   result.adminCapabilities=JSON.parse(query("SELECT jsonb_build_object('expectedPreexistingRole',current_user='supabase_admin','superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'canSet',has_parameter_privilege(current_user,'pg_stat_statements.track','SET'),'canAlterSystem',has_parameter_privilege(current_user,'pg_stat_statements.track','ALTER SYSTEM'));",true));
   demand(Object.values(result.adminCapabilities).every(v=>v===true));
   result.preflight.stage='read_prior_instance';const observedInstance=instance();result.priorInstance=observedInstance;demand(validInstance(observedInstance));priorInstance=observedInstance;
   result.rpcRoleOverrides=JSON.parse(query("SELECT coalesce(jsonb_agg(jsonb_build_object('roleClass',CASE WHEN d.setrole=0 THEN 'database_default' WHEN r.rolname='authenticator' THEN 'connection_role' WHEN r.rolname='service_role' THEN 'rpc_role' ELSE 'function_owner' END,'databaseScoped',d.setdatabase<>0,'value',CASE WHEN split_part(v,'=',2) IN('all','top','none') THEN split_part(v,'=',2) ELSE 'other' END)),'[]'::jsonb) FROM pg_db_role_setting d LEFT JOIN pg_roles r ON r.oid=d.setrole CROSS JOIN LATERAL unnest(d.setconfig) v WHERE d.setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())) AND (d.setrole=0 OR r.rolname IN('authenticator','service_role','postgres')) AND v LIKE 'pg_stat_statements.track=%';",true));
   result.preflight.stage='enable_instance_tracking';
   if(priorInstance.autoEntries!==1||priorInstance.autoValue!=='all'){writeAttempted=true;query("ALTER SYSTEM SET pg_stat_statements.track='all';",true);}
   demand(query('SELECT pg_reload_conf();',true)==='t');
   result.preflight.stage='tracking_readback';result.diagnosticInstance=await readback('all');
   demand(result.diagnosticInstance.otherSettingsSha256===priorInstance.otherSettingsSha256);
   result.diagnosticGatewayConfig=config();
   result.diagnosticGatewayInvariants=invariants();
   demand(JSON.stringify(result.priorGatewayInvariants)===JSON.stringify(result.diagnosticGatewayInvariants)&&JSON.stringify(priorConfig)===JSON.stringify(result.diagnosticGatewayConfig));
   result.preflight.stage='real_rpc_read_only_canary';await canary('trackingCanary',1);
   result.preflight={passed:true,stage:'complete'};result.nestedTracking='observed_read_only_rpc_canary';persist();
  }catch(error){record(result.preflight.stage,error);throw Error('history_volume_diagnostic_preflight_failed');}
 }
 function onVector(data){
  if(data.phase==='stage_objects'&&data.last_ordinal===25955)capture('objects_complete');
  if(data.phase==='stage_movements'&&[6400,12800,19200,25600].includes(data.last_ordinal))capture('movements_'+data.last_ordinal);
 }
 function finish(runId,shopId){
  if(finished||!measurementStarted)return;finished=true;
  capture('after_measurement');
  result.intervals=[];
  for(let i=1;i<result.snapshots.length;i++){const a=result.snapshots[i-1],b=result.snapshots[i];if(a.statements&&b.statements)result.intervals.push({from:a.label,to:b.label,...statementDelta(a.statements,b.statements)});}
  result.classificationCoverage=labels.slice(0,6).map(label=>({label,status:result.intervals.some(i=>i.valid&&i.statements.some(s=>s.label===label&&s.valid&&s.calls>0))?'observed':'not_observed_or_unclassified'}));
  result.nestedTracking=result.classificationCoverage.find(s=>s.label==='movement_insert')?.status==='observed'?'observed_canonical_nested_statements':result.nestedTracking==='unavailable'?'unavailable':'not_attested';
  if(/^[0-9a-f-]{36}$/.test(runId??'')&&/^[0-9a-f-]{36}$/.test(shopId??''))bounded('fresh_lookup_plans',()=>{
   const params=JSON.parse(query(`SELECT jsonb_build_object('movementId',m.local_id,'bindingId',m.local_binding_id,'fileId',m.local_file_id,'scopeId',m.local_scope_id,'batchId',m.local_batch_id,'aliasKey',m.alias_key,'profile',m.transaction->>'profile','sourceSha',m.transaction#>>'{source,fileSha256}','transactionState',m.economics->>'transactionState') FROM public.payment_history_migration_movements m WHERE m.run_id=${quote(runId)}::uuid AND m.local_id='1';`));
   const lookups=[['object_movement_lookup',`SELECT object FROM public.payment_history_migration_objects WHERE run_id=${quote(runId)}::uuid AND table_name='movements' AND local_id=${quote(params.movementId)}`],['object_binding_lookup',`SELECT EXISTS(SELECT 1 FROM public.payment_history_migration_objects x WHERE x.run_id=${quote(runId)}::uuid AND x.table_name='bindings' AND x.local_id=${quote(params.bindingId)} AND x.object->>'scope_id'=${quote(params.scopeId)} AND x.object->>'alias_key'=${quote(params.aliasKey)})`],['object_file_lookup',`SELECT EXISTS(SELECT 1 FROM public.payment_history_migration_objects f WHERE f.run_id=${quote(runId)}::uuid AND f.table_name='files' AND f.local_id=${quote(params.fileId)} AND f.object->>'batch_id'=${quote(params.batchId)} AND f.object->>'profile'=${quote(params.profile)} AND f.object->>'source_sha256'=${quote(params.sourceSha)} AND ${quote(params.transactionState)}=CASE WHEN f.object->>'profile'='GetnetLegacy' THEN 'ABONADO' ELSE 'CONFIRMADA' END)`],['parent_fk_lookup',`SELECT 1 FROM ONLY public.payment_history_migration_runs x WHERE x.shop_id=${quote(shopId)}::uuid AND x.run_id=${quote(runId)}::uuid`]];
   for(const [label,statement] of lookups)bounded(label,()=>{const plan=JSON.parse(query(`BEGIN READ ONLY;EXPLAIN (ANALYZE,BUFFERS,TIMING OFF,FORMAT JSON) ${statement};ROLLBACK;`));result.freshPlans.push({label,parentLockingMeasured:false,...closeExplainPlan(plan)});});
  });
  persist();
 }
 async function restore(){
  let stage='restore_instance_setting';
  try{
   if(priorInstance){
    if(writeAttempted)query(priorInstance.autoEntries===0?'ALTER SYSTEM RESET pg_stat_statements.track;':`ALTER SYSTEM SET pg_stat_statements.track=${quote(priorInstance.autoValue)};`,true);
    demand(query('SELECT pg_reload_conf();',true)==='t');stage='restore_readback';
    result.restoredInstance=await readback(priorInstance.effective);demand(JSON.stringify(result.restoredInstance)===JSON.stringify(priorInstance));
    result.restoredGatewayConfig=config();result.restoredGatewayInvariants=invariants();
    demand(JSON.stringify(result.restoredGatewayConfig)===JSON.stringify(priorConfig)&&JSON.stringify(result.restoredGatewayInvariants)===JSON.stringify(result.priorGatewayInvariants));
    stage='restored_real_rpc_canary';await canary('restoredCanary',priorInstance.effective==='all'?1:0);result.configurationRestored=true;
   }else{result.configurationRestored=!writeAttempted;result.restorationAction='no_configuration_write_attempted';}
  }catch(error){record(stage,error);}finally{
   const completeCoverage=measurementStarted&&result.classificationCoverage?.length===6&&result.classificationCoverage.every(c=>c.status==='observed');
   result.status=!result.preflight.passed||!result.configurationRestored||result.errors.length>0?'DIAGNOSTIC_OBSERVATION_FAILED':completeCoverage?'DIAGNOSTIC_OBSERVATION_COLLECTED':'DIAGNOSTIC_OBSERVATION_PARTIAL';persist();
  }
  return result.status;
 }
 return {observeWarmResponse,prepare,capture,onVector,finish,restore};
}
