// Imported only by the existing owned volume runner. This is not a benchmark,
// product migration or release qualification path. Never export query text.
import {setTimeout as delay} from 'node:timers/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const gateway='public.payment_history_worker_gateway_v1(uuid,text,text,jsonb)';
const tables=['payment_history_migration_runs','payment_history_migration_objects','payment_history_migration_movements'];
const tableList=tables.map(name=>`'${name}'`).join(',');
const metrics=['calls','total_exec_time','rows','shared_blks_hit','shared_blks_read','shared_blks_dirtied','shared_blks_written','temp_blks_read','temp_blks_written','wal_records','wal_fpi','wal_bytes'];
const labels=['object_movement_lookup','object_binding_lookup','object_file_lookup','movement_insert','parent_fk_check','run_counter_update','actor_guard','other_scoped','apply_review','apply_review_rows','apply_decisions','apply_bulk_new_facts','canonical_movement_insert','local_movement_map_insert','canonical_fk_check','source_snapshot_insert','source_objects_insert','revision_write','revision_seal','replica_event_insert','change_set_digest','change_set_insert','replica_payload_read','replica_field_hash','run_state_or_receipt_update','replica_snapshot_write','replica_entities_read'];
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const sqlStates=new Set(['42501','25001','25006','55P03','57014','42704','42883','0A000','08006','28P01','28000','22023','22P02']);
export function closedDiagnosticFailure({stderr='',timedOut=false,status=null,sqlState,kind}={}){
 const candidate=sqlState??String(stderr).match(/\b(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1],found=/^[0-9A-Z]{5}$/.test(candidate??'')?candidate:undefined;
 return {sqlState:sqlStates.has(found)?found:found?'OTHER_SQLSTATE':null,kind:['process_timeout','sql_rejected','process_failed','observation_failed'].includes(kind)?kind:timedOut?'process_timeout':found?'sql_rejected':Number.isInteger(status)&&status!==0?'process_failed':'observation_failed'};
}

// GET arguments are URL strings in the pinned PostgREST client. Serialize the
// jsonb argument explicitly; passing an object would send [object Object].
export async function readOnlyCachedGatewayGet(db,parameters,options){
 if(options?.get!==true)throw Error('history_volume_diagnostic_readonly_required');
 const reply=await db.rpc('payment_history_worker_gateway_v1',{...parameters,p_payload:JSON.stringify(parameters.p_payload)},{get:true}).abortSignal(AbortSignal.timeout(3000));
 return {data:reply.data,errorCode:reply.error?.code??(reply.error?'UNAVAILABLE':null)};
}

// EXPLAIN can contain fixture values in conditions, aliases, expressions and
// output lists. Reconstruct a closed tree; do not remove a few known bad keys.
export function closeExplainPlan(value){
 const allowedNodes=new Set(['Result','Seq Scan','Index Scan','Index Only Scan','Bitmap Heap Scan','Bitmap Index Scan','BitmapAnd','BitmapOr','Limit','LockRows','Nested Loop','Hash Join','Merge Join','Hash','Aggregate','Sort','Incremental Sort','Materialize','Memoize','Subquery Scan','Append','Merge Append','WindowAgg','Gather','Gather Merge']);
 const planTables=[...tables,'payment_history_batches','payment_history_movement_versions','payment_history_revisions'];
 const indexes=new Map(planTables.map(t=>[t+'_pkey','primary_key']));
 for(const [name,label] of [['payment_history_migration_runs_shop_id_run_id_key','run_shop_unique'],['payment_history_movement_versions_shop_id_movement_version_id_key','movement_shop_unique'],['payment_history_batches_shop_id_batch_id_key','batch_shop_unique'],['payment_history_movement_identity_versions_idx','movement_identity_versions'],['payment_history_movement_owner_idx','movement_owner'],['payment_history_movement_report_idx','movement_report'],['payment_history_movement_active_identity_idx','movement_active_identity']])indexes.set(name,label);
 const numeric=['Plan Rows','Plan Width','Startup Cost','Total Cost','Actual Rows','Actual Loops','Rows Removed by Filter','Rows Removed by Index Recheck','Rows Removed by Join Filter','Shared Hit Blocks','Shared Read Blocks','Shared Dirtied Blocks','Shared Written Blocks','Local Hit Blocks','Local Read Blocks','Local Dirtied Blocks','Local Written Blocks','Temp Read Blocks','Temp Written Blocks','Sort Space Used','Workers Planned','Workers Launched','Hash Buckets','Original Hash Buckets','Hash Batches','Original Hash Batches','Peak Memory Usage'];
 function properties(input){
  const out={};for(const key of numeric)if(finite(input[key]))out[key]=input[key];
  if(['Inner','Left','Right','Full','Semi','Anti'].includes(input['Join Type']))out.joinType=input['Join Type'];
  if(['quicksort','top-N heapsort','external sort','external merge'].includes(input['Sort Method']))out.sortMethod=input['Sort Method'];
  if(['Memory','Disk'].includes(input['Sort Space Type']))out.sortSpaceType=input['Sort Space Type'];
  return out;
 }
 let count=0;
 function node(input,depth=0){
  if(!input||typeof input!=='object'||depth>12||++count>64)throw Error('history_volume_diagnostic_plan_shape');
   const out={nodeType:allowedNodes.has(input['Node Type'])?input['Node Type']:'other',...properties(input)};
   if(input['Relation Name'])out.relation=planTables.includes(input['Relation Name'])?input['Relation Name']:'other';
   if(input['Index Name'])out.index=indexes.get(input['Index Name'])??'other';
   if(input.Workers){if(!Array.isArray(input.Workers)||input.Workers.length>16)throw Error('history_volume_diagnostic_plan_shape');out.workers=input.Workers.map(p=>properties(p));}
  if(input.Plans) {if(!Array.isArray(input.Plans)||input.Plans.length>16)throw Error('history_volume_diagnostic_plan_shape');out.plans=input.Plans.map(p=>node(p,depth+1));}
  return out;
 }
 if(!Array.isArray(value)||value.length!==1||!value[0]?.Plan)throw Error('history_volume_diagnostic_plan_shape');
 const result={plan:node(value[0].Plan),planOrigin:'fresh_observer_query_not_cached_plpgsql',cachedPlanObserved:false};
 for(const key of ['Planning Time','Execution Time'])if(finite(value[0][key]))result[key]=value[0][key];
 if(value[0].JIT){const j=value[0].JIT;result.jit={};if(finite(j.Functions))result.jit.functions=j.Functions;
  for(const [source,keys,target,type] of [['Options',['Inlining','Optimization','Expressions','Deforming'],'options','boolean'],['Timing',['Generation','Inlining','Optimization','Emission','Total'],'timing','number']])if(j[source]){result.jit[target]={};for(const k of keys)if(type==='boolean'?typeof j[source][k]==='boolean':finite(j[source][k]))result.jit[target][k]=j[source][k];}}
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
 WHEN normalized LIKE 'with new_rows as materialized %' THEN 'apply_bulk_new_facts'
 WHEN normalized LIKE 'insert into public.payment_history_migration_decisions%' THEN 'apply_decisions'
 WHEN normalized LIKE 'insert into public.payment_history_movement_versions%' THEN 'canonical_movement_insert'
 WHEN normalized LIKE 'insert into public.payment_history_local_movement_map%' THEN 'local_movement_map_insert'
 WHEN normalized LIKE '%for key share%' AND (normalized LIKE '%payment_history_movement_versions%' OR normalized LIKE '%payment_history_batches%') THEN 'canonical_fk_check'
 WHEN normalized LIKE 'insert into public.payment_history_source_snapshots%' THEN 'source_snapshot_insert'
 WHEN normalized LIKE 'insert into public.payment_history_source_objects%' THEN 'source_objects_insert'
 WHEN normalized LIKE 'insert into public.payment_history_replica_events%' THEN 'replica_event_insert'
 WHEN normalized LIKE 'insert into public.payment_history_change_sets%' THEN 'change_set_insert'
 WHEN normalized LIKE 'select count(%' AND normalized LIKE '%string_agg(%' AND normalized LIKE '%from public.payment_history_replica_events %' THEN 'change_set_digest'
 WHEN normalized LIKE '%payment_history_seal_revision_v1%' THEN 'revision_seal'
 WHEN normalized LIKE 'insert into public.payment_history_revisions%' OR normalized LIKE 'update public.payment_history_runtime set revision=%' THEN 'revision_write'
 WHEN normalized LIKE 'update public.payment_history_migration_runs set state=%' OR normalized LIKE 'update public.payment_history_migration_runs set receipt=%' THEN 'run_state_or_receipt_update'
 WHEN normalized LIKE 'insert into public.payment_history_replica_snapshot%' OR normalized LIKE 'insert into public.payment_history_replica_cursors%' OR normalized LIKE 'insert into public.payment_history_replica_acks%' THEN 'replica_snapshot_write'
 WHEN normalized LIKE '%payment_history_replica_entities_v1%' OR normalized LIKE '%payment_history_replica_checksum_v1%' THEN 'replica_entities_read'
 WHEN normalized LIKE 'select case when %' AND normalized LIKE '%from public.payment_history_batches b %' AND normalized LIKE '%from public.payment_history_movement_versions v %' THEN 'replica_payload_read'
 WHEN normalized LIKE 'select encode(%' AND normalized LIKE '%from generate_series(%' AND normalized LIKE '%from unnest(%' AND normalized LIKE '%with ordinality x(f,ord)%' THEN 'replica_field_hash'
 WHEN normalized LIKE '%payment_history_migration_review_v1%' OR normalized LIKE '%payment_history_migration_review_rows_v1%' THEN 'apply_review'
 WHEN normalized LIKE 'with run as materialized%' AND normalized LIKE '%payment_history_migration_movements%' AND normalized LIKE '%payment_history_migration_objects%' AND normalized LIKE '%classified as%' THEN 'apply_review_rows'
 WHEN normalized LIKE '%payment_history_migration_actor_current_v1%' THEN 'actor_guard'
 WHEN normalized LIKE '%payment_history_migration_%' THEN 'other_scoped' ELSE NULL END label FROM scoped),
 epochs AS (SELECT label,to_jsonb(classified)->>'stats_since' AS since,count(*) AS members FROM classified WHERE label IS NOT NULL GROUP BY label,to_jsonb(classified)->>'stats_since'),
 totals AS (SELECT label,count(*) AS "statementEntries",bool_and(to_jsonb(classified)->>'stats_since' IS NOT NULL) AS "epochsAvailable",${metrics.map(k=>`sum((to_jsonb(classified)->>${quote(k)})::numeric) AS ${k}`).join(',')},(SELECT jsonb_agg(jsonb_build_object('since',e.since,'members',e.members) ORDER BY e.since NULLS FIRST) FROM epochs e WHERE e.label=classified.label) AS epochs FROM classified WHERE label IS NOT NULL GROUP BY label)
 SELECT jsonb_build_object('statements',coalesce((SELECT jsonb_agg(to_jsonb(totals)) FROM totals),'[]'::jsonb),'statsReset',(SELECT stats_reset FROM ${schema}.pg_stat_statements_info),'dealloc',(SELECT dealloc FROM ${schema}.pg_stat_statements_info));`;
}

const profileFunctions=[['gateway_canary',gateway],['crypto_canary','extensions.digest(bytea,text)'],['replica_payload','app_private.payment_history_replica_payload_v1(uuid,text,uuid)'],['replica_entity_digest','app_private.payment_history_replica_entity_digest_v1(text,jsonb)'],['replica_field_hash','app_private.payment_history_field_hash_v1(text[])'],['revision_seal','app_private.payment_history_seal_revision_v1(uuid,bigint)']];
export function functionSnapshotSQL(){
 return `WITH wanted(label,signature) AS (VALUES ${profileFunctions.map(([label,signature])=>`(${quote(label)},${quote(signature)})`).join(',')}), resolved AS (SELECT w.label,p.oid,p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prolang FROM wanted w LEFT JOIN pg_proc p ON p.oid=to_regprocedure(w.signature)) SELECT jsonb_build_object('statsReset',(SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()),'functions',(SELECT jsonb_agg(jsonb_build_object('label',r.label,'definitionMD5',md5(jsonb_build_array(r.oid,r.prosrc,r.proowner,r.proacl,r.proconfig,r.prosecdef,r.prolang)::text),'exists',r.oid IS NOT NULL,'present',s.funcid IS NOT NULL,'calls',s.calls,'total_time',s.total_time,'self_time',s.self_time) ORDER BY r.label) FROM resolved r LEFT JOIN pg_stat_user_functions s ON s.funcid=r.oid));`;
}
export function functionDelta(before,after){
 const validReset=s=>s&&Object.hasOwn(s,'statsReset')&&(s.statsReset===null||typeof s.statsReset==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(s.statsReset)&&Number.isFinite(Date.parse(s.statsReset)));
 const rows=profileFunctions.map(([label])=>{
  const a=before?.functions?.find(f=>f.label===label),b=after?.functions?.find(f=>f.label===label),reasons=[];
  if(!a?.exists||!b?.exists||!/^[0-9a-f]{32}$/.test(a?.definitionMD5??'')||a.definitionMD5!==b?.definitionMD5)reasons.push('function_definition_changed_or_unavailable');
  if(!validReset(before)||!validReset(after)||before.statsReset!==after.statsReset)reasons.push('database_statistics_reset_or_unavailable');
  if(!Array.isArray(before?.functions)||before.functions.length!==6||!Array.isArray(after?.functions)||after.functions.length!==6)reasons.push('function_set_unavailable');
  const row={label};
  for(const key of ['calls','total_time','self_time']){const av=a?.present?a[key]:a?.present===false?0:null,bv=b?.present?b[key]:b?.present===false?0:null;if(!finite(av)||!finite(bv)||bv<av||key==='calls'&&(!Number.isSafeInteger(av)||!Number.isSafeInteger(bv))){reasons.push('counter_unavailable_or_decreased');row[key]=null;}else row[key]=bv-av;}
  return {...row,valid:reasons.length===0,reasons:[...new Set(reasons)]};
 });
 return {valid:rows.every(r=>r.valid),functions:rows,overlappingNestedTotals:true,securityWrapperOverheadExcluded:true,interruptedCallsMayBeAbsent:true,selectiveFunctionResetNotIndependentlyDetectable:true};
}

// This synthetic positive fixture runs only AFTER the failed single Apply and
// frozen canonical readback. One connection, six 8s statements, then ROLLBACK.
const positivePayloadSQL=`SET application_name='asus019-payload-positive-512';
select jsonb_build_object('phase','before','metadata',jsonb_build_object(
 'evidence',(select count(*) from public.payment_history_evidence where shop_id='10000000-0000-4000-8000-000000693019'),
 'merchants',(select count(*) from public.payment_history_merchants where shop_id='10000000-0000-4000-8000-000000693019'),
 'batches',(select count(*) from public.payment_history_batches where shop_id='10000000-0000-4000-8000-000000693019'),
 'movements',(select count(*) from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000693019'),
 'revisions',(select count(*) from public.payment_history_revisions where shop_id='10000000-0000-4000-8000-000000693019'),
 'replicaEvents',(select count(*) from public.payment_history_replica_events where shop_id='10000000-0000-4000-8000-000000693019'),
 'changeSets',(select count(*) from public.payment_history_change_sets where shop_id='10000000-0000-4000-8000-000000693019'),
 'sourceSnapshots',(select count(*) from public.payment_history_source_snapshots where shop_id='10000000-0000-4000-8000-000000693019'),
 'runtime',(select jsonb_build_object('revision',revision::text,'epoch',writer_epoch::text,'authority',writer_authority) from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000693019'),
 'run',(select jsonb_build_object('state',state,'receiptPresent',receipt is not null,'applyKeyPresent',apply_request_key is not null,'stagedMovements',processed_movements,'stagedObjects',processed_objects) from public.payment_history_migration_runs where shop_id='10000000-0000-4000-8000-000000693019' and run_id='__OWNED_SYNTHETIC_RUN_UUID__'::uuid)));
begin;
set local statement_timeout='8s';
set local lock_timeout='6s';
create temp table payload512_context as select
 '10000000-0000-4000-8000-000000693019'::uuid shop,
 '__OWNED_SYNTHETIC_RUN_UUID__'::uuid run_id,
 '30000000-0000-4000-8000-000000693019'::uuid staff,
 gen_random_uuid() evidence,gen_random_uuid() merchant,gen_random_uuid() batch,gen_random_uuid() operation;
do $guard$
begin
 if current_user<>'postgres' then raise exception 'payload_probe_role';end if;
 if (select count(*) from public.shops s join pg_temp.payload512_context c on c.shop=s.shop_id where s.shop_code='VOLUME019' and s.shop_name='Synthetic full-volume baseline')<>1 then raise exception 'payload_probe_shop';end if;
 if (select count(*) from public.payment_history_migration_runs r join pg_temp.payload512_context c on c.shop=r.shop_id and c.run_id=r.run_id where r.state='review_ready' and r.receipt is null and r.apply_request_key is null and r.processed_movements=25947)<>1 then raise exception 'payload_probe_failed_apply_readback';end if;
 if exists(select 1 from public.payment_history_batches b join pg_temp.payload512_context c on c.shop=b.shop_id)
  or exists(select 1 from public.payment_history_movement_versions v join pg_temp.payload512_context c on c.shop=v.shop_id) then raise exception 'payload_probe_canonical_not_empty';end if;
end $guard$;
create temp table payload512_keys as
 select m.local_id,row_number() over(order by m.local_id::bigint) ordinal,gen_random_uuid() movement_id,m.transaction,m.economics,m.economic_digest,m.active
 from public.payment_history_migration_movements m join pg_temp.payload512_context c on c.run_id=m.run_id and c.shop=m.shop_id
 order by m.local_id::bigint limit 512;
alter table pg_temp.payload512_keys add primary key(movement_id);
do $guard$ begin if (select count(*) from pg_temp.payload512_keys)<>512 then raise exception 'payload_probe_source_count';end if;end $guard$;
do $collision$ begin
 if exists(select 1 from pg_temp.payload512_keys k join public.payment_history_movement_versions v on v.movement_version_id=k.movement_id)
 or exists(select 1 from pg_temp.payload512_context c join public.payment_history_evidence e on e.evidence_id=c.evidence)
 or exists(select 1 from pg_temp.payload512_context c join public.payment_history_merchants m on m.merchant_id=c.merchant)
 or exists(select 1 from pg_temp.payload512_context c join public.payment_history_batches b on b.batch_id=c.batch or b.apply_operation_id=c.operation)
 then raise exception 'payload_probe_uuid_collision';end if;
end $collision$;
insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,scope,actor_kind,actor_id)
 select evidence,shop,'migration_reconcile','unverified','draft','synthetic-payload-probe-v1','Synthetic rollback-only payload comparison','{}'::jsonb,'pos_staff_manager',staff from pg_temp.payload512_context;
insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id)
 select merchant,shop,'Synthetic rollback-only payload merchant',evidence from pg_temp.payload512_context;
insert into public.payment_history_batches(batch_id,shop_id,origin,apply_operation_id,created_revision)
 select batch,shop,'local_migration',operation,1 from pg_temp.payload512_context;
insert into public.payment_history_movement_versions(movement_version_id,shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,
 gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_upload_id,source_row,source_sheet,active,supersedes_version_id,created_revision)
 select k.movement_id,c.shop,c.merchant,k.transaction->>'externalNamespace',k.transaction->>'externalId',
 encode(extensions.digest(convert_to(c.shop::text||chr(31)||'getnet'||chr(31)||c.merchant::text||chr(31)||(k.transaction->>'externalNamespace')||chr(31)||(k.transaction->>'externalId'),'UTF8'),'sha256'),'hex'),
 k.economic_digest,(k.economics->>'businessTicks')::bigint,(k.transaction#>>'{timestamp,businessDateTime}')::date,
 (k.economics->>'grossClp')::bigint,(k.economics->>'commissionClp')::bigint,(k.economics->>'commissionVatClp')::bigint,(k.economics->>'netClp')::bigint,
 k.economics->>'movementKind',k.economics->>'transactionState',k.transaction,c.batch,null,
 (k.transaction#>>'{source,rowNumber}')::integer,k.transaction#>>'{source,sheetName}',k.active,null,1
 from pg_temp.payload512_keys k cross join pg_temp.payload512_context c;
do $guard$ begin if (select count(*) from public.payment_history_movement_versions v join pg_temp.payload512_keys k on k.movement_id=v.movement_version_id join pg_temp.payload512_context c on c.shop=v.shop_id)<>512 then raise exception 'payload_probe_positive_seed';end if;end $guard$;
create temp table payload512_results(sequence integer primary key,variant text,elapsed_ms double precision,observed bigint,positive bigint,bytes_total bigint,root text);
create function pg_temp.measure_payload512(p_sequence integer,p_variant text) returns jsonb language plpgsql as $measure$
declare started timestamptz;elapsed double precision;observed bigint;positive bigint;bytes_total bigint;root text;
begin
 if p_sequence not between 1 and 6 or p_variant not in('helper','inline') then raise exception 'payload_probe_sample';end if;
 started:=clock_timestamp();
 if p_variant='helper' then
  with payloads as materialized (select k.movement_id id,app_private.payment_history_replica_payload_v1(c.shop,'movement',k.movement_id) payload
 from pg_temp.payload512_keys k cross join pg_temp.payload512_context c)
  select count(*),count(payload),coalesce(sum(octet_length(payload::text)),0),
 encode(extensions.digest(convert_to(coalesce(string_agg(id::text||'|'||payload::text||chr(10),'' order by id),''),'UTF8'),'sha256'),'hex')
 into observed,positive,bytes_total,root from payloads;
 else
  with payloads as materialized (select k.movement_id id,(select jsonb_build_object('id',v.movement_version_id,'merchant_id',v.merchant_id,'batch_id',v.owner_batch_id,'identity_key',v.identity_key,'economic_digest',v.economic_digest,'active',v.active,
   'business_ticks',v.business_ticks::text,'gross_clp',v.gross_clp::text,'fee_clp',v.commission_clp::text,'fee_vat_clp',v.commission_vat_clp::text,'net_clp',v.net_clp::text,
   'movement_kind',v.movement_kind,'transaction_state',v.transaction_state,'external_namespace',v.external_namespace,'external_id',v.external_id,'source_sheet',v.source_sheet,'source_row',v.source_row::text,
   'timestamp_raw',v.transaction#>>'{timestamp,rawTimestamp}','offset_minutes',v.transaction#>>'{timestamp,offsetMinutes}','occurred_at_utc',v.transaction#>>'{timestamp,occurredAtUtc}',
   'time_interpretation',v.transaction#>>'{timestamp,interpretation}','time_policy_version',v.transaction#>>'{timestamp,policyVersion}','time_evidence_reference',v.transaction#>>'{timestamp,evidenceReference}',
   'card_subtype',v.transaction->>'cardSubtype','created_revision',v.created_revision::text)
 from public.payment_history_movement_versions v where v.shop_id=c.shop and v.movement_version_id=k.movement_id) payload
 from pg_temp.payload512_keys k cross join pg_temp.payload512_context c)
  select count(*),count(payload),coalesce(sum(octet_length(payload::text)),0),
 encode(extensions.digest(convert_to(coalesce(string_agg(id::text||'|'||payload::text||chr(10),'' order by id),''),'UTF8'),'sha256'),'hex')
 into observed,positive,bytes_total,root from payloads;
 end if;
 elapsed:=extract(epoch from clock_timestamp()-started)*1000;
 if observed<>512 or positive<>512 or bytes_total<=0 then raise exception 'payload_probe_not_positive';end if;
 insert into pg_temp.payload512_results values(p_sequence,p_variant,elapsed,observed,positive,bytes_total,root);
 return jsonb_build_object('phase','positive_payload_sample','sequence',p_sequence,'variant',p_variant,'elapsedMs',elapsed,'rows',observed,'positive',positive,'bytes',bytes_total,'root',root);
end $measure$;
select pg_temp.measure_payload512(1,'helper');
select pg_temp.measure_payload512(2,'inline');
select pg_temp.measure_payload512(3,'inline');
select pg_temp.measure_payload512(4,'helper');
select pg_temp.measure_payload512(5,'helper');
select pg_temp.measure_payload512(6,'inline');
create temp table payload512_parity as
 with helper_values as materialized (select k.movement_id id,app_private.payment_history_replica_payload_v1(c.shop,'movement',k.movement_id) payload
 from pg_temp.payload512_keys k cross join pg_temp.payload512_context c), inline_values as materialized (select k.movement_id id,(select jsonb_build_object('id',v.movement_version_id,'merchant_id',v.merchant_id,'batch_id',v.owner_batch_id,'identity_key',v.identity_key,'economic_digest',v.economic_digest,'active',v.active,
   'business_ticks',v.business_ticks::text,'gross_clp',v.gross_clp::text,'fee_clp',v.commission_clp::text,'fee_vat_clp',v.commission_vat_clp::text,'net_clp',v.net_clp::text,
   'movement_kind',v.movement_kind,'transaction_state',v.transaction_state,'external_namespace',v.external_namespace,'external_id',v.external_id,'source_sheet',v.source_sheet,'source_row',v.source_row::text,
   'timestamp_raw',v.transaction#>>'{timestamp,rawTimestamp}','offset_minutes',v.transaction#>>'{timestamp,offsetMinutes}','occurred_at_utc',v.transaction#>>'{timestamp,occurredAtUtc}',
   'time_interpretation',v.transaction#>>'{timestamp,interpretation}','time_policy_version',v.transaction#>>'{timestamp,policyVersion}','time_evidence_reference',v.transaction#>>'{timestamp,evidenceReference}',
   'card_subtype',v.transaction->>'cardSubtype','created_revision',v.created_revision::text)
 from public.payment_history_movement_versions v where v.shop_id=c.shop and v.movement_version_id=k.movement_id) payload
 from pg_temp.payload512_keys k cross join pg_temp.payload512_context c)
 select count(*) n,bool_and(h.payload is not null and i.payload is not null and h.payload is not distinct from i.payload) jsonb_equal,
 bool_and(app_private.payment_history_replica_entity_digest_v1('movement',h.payload)=app_private.payment_history_replica_entity_digest_v1('movement',i.payload)) protocol_digest_equal
 from helper_values h full join inline_values i using(id);
create temp table payload512_batch_parity as
 with values_once as materialized (
 select app_private.payment_history_replica_payload_v1(c.shop,'batch',c.batch) helper,
 (select jsonb_build_object('id',b.batch_id,'origin',b.origin,'state',b.state,'apply_operation_id',b.apply_operation_id,
   'created_revision',b.created_revision::text,'cancelled_revision',b.cancelled_revision::text,'created_utc_ms',floor(extract(epoch from b.created_at)*1000)::bigint::text) from public.payment_history_batches b where b.shop_id=c.shop and b.batch_id=c.batch) inline
 from pg_temp.payload512_context c)
 select helper is not null and inline is not null and helper is not distinct from inline as jsonb_equal,
 app_private.payment_history_replica_entity_digest_v1('batch',helper)=app_private.payment_history_replica_entity_digest_v1('batch',inline) as protocol_digest_equal from values_once;
do $parity$ begin
 if (select count(*) from pg_temp.payload512_results)<>6 or (select count(distinct root) from pg_temp.payload512_results)<>1
  or (select count(distinct bytes_total) from pg_temp.payload512_results)<>1 then raise exception 'payload_probe_samples_not_equal';end if;
 if (select n<>512 or jsonb_equal is distinct from true or protocol_digest_equal is distinct from true from pg_temp.payload512_parity)
  or (select jsonb_equal is distinct from true or protocol_digest_equal is distinct from true from pg_temp.payload512_batch_parity) then raise exception 'payload_probe_parity';end if;
end $parity$;
select jsonb_build_object('phase','positive_payload_parity','rows',p.n,'jsonbEqual',p.jsonb_equal,'protocolDigestEqual',p.protocol_digest_equal,
 'batchJsonbEqual',b.jsonb_equal,'batchProtocolDigestEqual',b.protocol_digest_equal) from pg_temp.payload512_parity p cross join pg_temp.payload512_batch_parity b;
rollback;
select jsonb_build_object('phase','after_rollback','metadata',jsonb_build_object(
 'evidence',(select count(*) from public.payment_history_evidence where shop_id='10000000-0000-4000-8000-000000693019'),
 'merchants',(select count(*) from public.payment_history_merchants where shop_id='10000000-0000-4000-8000-000000693019'),
 'batches',(select count(*) from public.payment_history_batches where shop_id='10000000-0000-4000-8000-000000693019'),
 'movements',(select count(*) from public.payment_history_movement_versions where shop_id='10000000-0000-4000-8000-000000693019'),
 'revisions',(select count(*) from public.payment_history_revisions where shop_id='10000000-0000-4000-8000-000000693019'),
 'replicaEvents',(select count(*) from public.payment_history_replica_events where shop_id='10000000-0000-4000-8000-000000693019'),
 'changeSets',(select count(*) from public.payment_history_change_sets where shop_id='10000000-0000-4000-8000-000000693019'),
 'sourceSnapshots',(select count(*) from public.payment_history_source_snapshots where shop_id='10000000-0000-4000-8000-000000693019'),
 'runtime',(select jsonb_build_object('revision',revision::text,'epoch',writer_epoch::text,'authority',writer_authority) from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000693019'),
 'run',(select jsonb_build_object('state',state,'receiptPresent',receipt is not null,'applyKeyPresent',apply_request_key is not null,'stagedMovements',processed_movements,'stagedObjects',processed_objects) from public.payment_history_migration_runs where shop_id='10000000-0000-4000-8000-000000693019' and run_id='__OWNED_SYNTHETIC_RUN_UUID__'::uuid)));
`;
export function positivePayloadProbeSQL(runId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId??''))throw Error('history_volume_diagnostic_probe_scope');
 return positivePayloadSQL.replaceAll('__OWNED_SYNTHETIC_RUN_UUID__',runId).replace('asus019-payload-positive-512',`a19-payload512-${runId}`);
}
export function positivePayloadReadbackSQL(runId){
 const script=positivePayloadProbeSQL(runId),start=script.lastIndexOf("select jsonb_build_object('phase','after_rollback'");
 return script.slice(start)+`\nSELECT jsonb_build_object('phase','connection_cleanup','activeConnections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='a19-payload512-${runId}'));`;
}

export function closePositivePayloadOutput(text){
 const records=[];let invalidLines=0;const integer=v=>Number.isSafeInteger(v)&&v>=0;
 for(const line of String(text??'').split('\n').filter(s=>s.trim())){
  try{
   const v=JSON.parse(line);let out;
   if(['before','after_rollback'].includes(v.phase)){
    const m=v.metadata,counts=['evidence','merchants','batches','movements','revisions','replicaEvents','changeSets','sourceSnapshots'];
    if(!m||!counts.every(k=>integer(m[k]))||!['local','frozen','web'].includes(m.runtime?.authority)||!/^\d+$/.test(m.runtime?.revision??'')||!/^\d+$/.test(m.runtime?.epoch??'')||m.run?.state!=='review_ready'||typeof m.run.receiptPresent!=='boolean'||typeof m.run.applyKeyPresent!=='boolean'||!integer(m.run.stagedMovements)||!integer(m.run.stagedObjects))throw Error();
    out={phase:v.phase,metadata:{...Object.fromEntries(counts.map(k=>[k,m[k]])),runtime:{revision:m.runtime.revision,epoch:m.runtime.epoch,authority:m.runtime.authority},run:{state:m.run.state,receiptPresent:m.run.receiptPresent,applyKeyPresent:m.run.applyKeyPresent,stagedMovements:m.run.stagedMovements,stagedObjects:m.run.stagedObjects}}};
   }else if(v.phase==='positive_payload_sample'){
    if(!Number.isInteger(v.sequence)||v.sequence<1||v.sequence>6||!['helper','inline'].includes(v.variant)||!finite(v.elapsedMs)||v.rows!==512||v.positive!==512||!integer(v.bytes)||v.bytes===0||!/^[0-9a-f]{64}$/.test(v.root))throw Error();
    out=Object.fromEntries(['phase','sequence','variant','elapsedMs','rows','positive','bytes','root'].map(k=>[k,v[k]]));
   }else if(v.phase==='positive_payload_parity'){
    if(v.rows!==512||!['jsonbEqual','protocolDigestEqual','batchJsonbEqual','batchProtocolDigestEqual'].every(k=>typeof v[k]==='boolean'))throw Error();
    out=Object.fromEntries(['phase','rows','jsonbEqual','protocolDigestEqual','batchJsonbEqual','batchProtocolDigestEqual'].map(k=>[k,v[k]]));
   }else if(v.phase==='connection_cleanup'&&integer(v.activeConnections))out={phase:v.phase,activeConnections:v.activeConnections};
   else throw Error();
   records.push(out);
  }catch{invalidLines++;}
 }
 return {records,invalidLines};
}

// The measured SELECT is derived from the frozen product source, not a
// hand-rewritten COUNT/projection. Only the two typed parameters differ.
const sealSourceUrl=new URL('../../supabase/migrations/20261119072331_payment_history_seal_revision_direct_ids_v1.sql',import.meta.url);
const sealSourceSha256='3924e568ffc0bb8ea35156493b7712eb6a3851cd902e4506c61ddeda3f5cb1b5';
const sealParametersSha256='346405f183024831cdb94c4c6bee1084d1906c2a5fc143a8f052e7783bf36e29';
export function fullSealSelect(source=readFileSync(sealSourceUrl,'utf8')){
 const normalized=source.replaceAll('\r\n','\n'),start=normalized.indexOf('create or replace function app_private.payment_history_seal_revision_v1('),end=normalized.indexOf('end;$$;$definition$;',start);
 const body=normalized.slice(start,end),match=body.match(/\n (select p_shop,p_revision,[\s\S]*?\n \)x;)/);
 const select=match?.[1]+'\n',hash=v=>createHash('sha256').update(v).digest('hex');
 if(start<0||end<start||hash(select)!==sealSourceSha256)throw Error('history_volume_diagnostic_seal_source');
 const parameters=select.replaceAll('p_shop','$1').replaceAll('p_revision','$2');
 if(hash(parameters)!==sealParametersSha256)throw Error('history_volume_diagnostic_seal_parameters');
 return parameters;
}
const sealFunctionLabels=['replica_payload','replica_entity_digest','replica_field_hash','revision_seal'];
const sealFunctionsSQL=`SELECT jsonb_build_object('phase','function_definitions','definitions',jsonb_agg(jsonb_build_object('label',w.label,'sha256',CASE WHEN p.oid IS NOT NULL THEN encode(extensions.digest(convert_to(jsonb_build_array(p.prosrc,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.prorettype,p.proargtypes::text)::text,'UTF8'),'sha256'),'hex') END) ORDER BY w.ordinal)) FROM (VALUES
 (1,'replica_payload','app_private.payment_history_replica_payload_v1(uuid,text,uuid)'),
 (2,'replica_entity_digest','app_private.payment_history_replica_entity_digest_v1(text,jsonb)'),
 (3,'replica_field_hash','app_private.payment_history_field_hash_v1(text[])'),
 (4,'revision_seal','app_private.payment_history_seal_revision_v1(uuid,bigint)')) w(ordinal,label,signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(w.signature);`;
// Reuse the already reviewed seed's exact transaction/economic field mapping.
// Full-cardinality additions (receipt/revisions) below are diagnostic data only.
const fullSealMetadata=positivePayloadSQL.slice(positivePayloadSQL.lastIndexOf("select jsonb_build_object('phase','after_rollback'"))
 .replace("'runtime',", "'receipts',(select count(*) from public.payment_history_receipts where shop_id='10000000-0000-4000-8000-000000693019'),'acks',(select count(*) from public.payment_history_replica_acks where shop_id='10000000-0000-4000-8000-000000693019'),'runtime',");
function fullSealScope(runId){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(runId??''))throw Error('history_volume_diagnostic_probe_scope');return `a19-seal-full-${runId}`;}
const seedFrameAnchors=[
 ['transaction','begin;\n'],['statement_limit',"set local statement_timeout='8s';"],['lock_limit',"set local lock_timeout='6s';"],
 ['context','create temp table seal_full_context as select'],['scope_guard','do $guard$\nbegin'],['keys','create temp table seal_full_keys as'],
 ['key_primary','alter table pg_temp.seal_full_keys add primary key'],['source_count','do $guard$ begin if (select count(*) from pg_temp.seal_full_keys)'],
 ['uuid_collision','do $collision$ begin'],['full_prerequisites','do $full_guard$ begin'],['evidence_insert','insert into public.payment_history_evidence('],
 ['merchant_insert','insert into public.payment_history_merchants('],['batch_insert','insert into public.payment_history_batches('],
 ['movement_insert','insert into public.payment_history_movement_versions('],['positive_seed_guard','do $guard$ begin if (select count(*) from public.payment_history_movement_versions'],
 ['receipt_insert','insert into public.payment_history_receipts('],['revisions_insert','insert into public.payment_history_revisions('],
 ['cardinality_guard','do $cardinality$ begin'],['seed_guard_result',"select jsonb_build_object('phase','seed_guard'"],['prepare_select','prepare a19_seal_full(uuid,bigint) as '],
];
const seedFrameLabels=seedFrameAnchors.map(([label])=>label);
function frameFullSealSeed(script){
 // Fixed source anchors, not a general SQL splitter. Preserve every SQL byte,
 // including whitespace and DO blocks; psql emits only the allowlisted labels.
 const starts=seedFrameAnchors.map(([,anchor])=>{const at=script.indexOf(anchor);if(at<0||script.indexOf(anchor,at+1)!==-1)throw Error('history_volume_diagnostic_seed_anchor');return at;});
 const end=script.indexOf('\\echo A19_SEAL_PLAIN_BEGIN');
 if(starts.some((at,i)=>i>0&&at<=starts[i-1])||end<=starts.at(-1))throw Error('history_volume_diagnostic_seed_anchor');
 const framed=starts.map((at,i)=>{const fragment=script.slice(at,starts[i+1]??end);if(!fragment.endsWith('\n'))throw Error('history_volume_diagnostic_seed_anchor');const label=seedFrameLabels[i].toUpperCase();return `\\echo A19_SEED_${label}_BEGIN\n${fragment}\\echo A19_SEED_${label}_END\n`;});
 return script.slice(0,starts[0])+framed.join('')+script.slice(end);
}
export function fullSealReadbackSQL(runId){
 const application=fullSealScope(runId);
 return fullSealMetadata.replaceAll('__OWNED_SYNTHETIC_RUN_UUID__',runId)+'\n'+sealFunctionsSQL+`\nSELECT jsonb_build_object('phase','connection_cleanup','activeConnections',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='${application}'));`;
}
export function fullSealProbeSQL(runId){
 const application=fullSealScope(runId),select=fullSealSelect();
 const seed=positivePayloadSQL.slice(positivePayloadSQL.indexOf('begin;'),positivePayloadSQL.indexOf('create temp table payload512_results'))
 .replaceAll('payload512','seal_full').replaceAll('payload_probe_','seal_probe_').replaceAll('__OWNED_SYNTHETIC_RUN_UUID__',runId)
 .replace('order by m.local_id::bigint limit 512;','order by m.local_id::bigint;').replaceAll('<>512','<>25947')
 .replace('k.transaction,c.batch,null,','k.transaction,c.batch,(select r.source_upload_id from public.payment_history_migration_runs r where r.run_id=c.run_id and r.shop_id=c.shop),')
 .replace("insert into public.payment_history_evidence",`do $full_guard$ begin
 if (select count(*) from public.payment_history_migration_objects o join pg_temp.seal_full_context c on c.run_id=o.run_id)<>25955
 or (select count(*) from public.payment_history_migration_objects o join pg_temp.seal_full_context c on c.run_id=o.run_id where o.table_name='batches')<>1
 or (select count(*) from public.payment_history_migration_objects o join pg_temp.seal_full_context c on c.run_id=o.run_id where o.table_name='batches' and o.object->>'state'='Active')<>1
 or (select count(*) from public.payment_history_migration_movements m join pg_temp.seal_full_context c on c.run_id=m.run_id and c.shop=m.shop_id join public.payment_history_migration_objects b on b.run_id=m.run_id and b.table_name='batches' and b.local_id=m.local_batch_id)<>25947
 or (select count(*) from public.payment_history_migration_runs r join pg_temp.seal_full_context c on c.run_id=r.run_id and c.shop=r.shop_id join public.payment_history_uploads u on u.shop_id=r.shop_id and u.upload_id=r.source_upload_id)<>1
 or exists(select 1 from public.payment_history_receipts r join pg_temp.seal_full_context c on c.shop=r.shop_id)
 or exists(select 1 from public.payment_history_revisions r join pg_temp.seal_full_context c on c.shop=r.shop_id)
 or exists(select 1 from public.payment_history_source_snapshots r join pg_temp.seal_full_context c on c.shop=r.shop_id)
 or exists(select 1 from public.payment_history_replica_events r join pg_temp.seal_full_context c on c.shop=r.shop_id)
 or exists(select 1 from public.payment_history_change_sets r join pg_temp.seal_full_context c on c.shop=r.shop_id)
 or exists(select 1 from public.payment_history_runtime r join pg_temp.seal_full_context c on c.shop=r.shop_id where r.revision<>0)
 then raise exception 'seal_probe_full_prerequisites';end if;
 if exists(select 1 from public.payment_history_receipts r join pg_temp.seal_full_context c on r.operation_id=c.operation or (r.shop_id=c.shop and r.request_key=c.operation)) then raise exception 'seal_probe_uuid_collision';end if;
end $full_guard$;
insert into public.payment_history_evidence`);
 const metadata=fullSealMetadata.replaceAll('__OWNED_SYNTHETIC_RUN_UUID__',runId);
 const script=`SET application_name='${application}';
${metadata.replace("'after_rollback'","'before'")}
${sealFunctionsSQL}
${seed}
insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt)
 select operation,shop,batch,'migrate','pos_staff_manager',staff,operation,repeat('0',64),jsonb_build_object('syntheticRollbackOnly',true) from pg_temp.seal_full_context;
insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
 select c.shop,1,row_number() over(order by k.movement_id)::integer,k.movement_id,c.operation,'upsert' from pg_temp.seal_full_keys k cross join pg_temp.seal_full_context c;
do $cardinality$ begin
 if (select count(*) from public.payment_history_batches b join pg_temp.seal_full_context c on c.shop=b.shop_id)<>1
 or (select count(*) from public.payment_history_batches b join pg_temp.seal_full_context c on c.shop=b.shop_id where b.created_revision=1 or b.cancelled_revision=1)<>1
 or (select count(*) from public.payment_history_movement_versions v join pg_temp.seal_full_context c on c.shop=v.shop_id)<>25947
 or (select count(*) from public.payment_history_revisions r join pg_temp.seal_full_context c on c.shop=r.shop_id where r.revision=1)<>25947
 or (select count(*) from public.payment_history_revisions r join public.payment_history_movement_versions v on v.shop_id=r.shop_id and v.movement_version_id=r.movement_version_id join pg_temp.seal_full_context c on c.shop=r.shop_id where r.revision=1)<>25947
 or (select count(*) from public.payment_history_receipts r join pg_temp.seal_full_context c on c.shop=r.shop_id and c.operation=r.operation_id)<>1
 or exists(select 1 from public.payment_history_revisions r join pg_temp.seal_full_context c on c.shop=r.shop_id left join public.payment_history_receipts q on q.shop_id=r.shop_id and q.operation_id=r.operation_id where q.operation_id is null)
 or exists(select 1 from public.payment_history_revisions r join pg_temp.seal_full_context c on c.shop=r.shop_id left join public.payment_history_movement_versions v on v.shop_id=r.shop_id and v.movement_version_id=r.movement_version_id where v.movement_version_id is null)
 then raise exception 'seal_probe_cardinality';end if;
end $cardinality$;
select jsonb_build_object('phase','seed_guard','batches',1,'movements',25947,'revisions',25947,'joinedMovements',25947,'unionEntities',25948,'receipt',1,'fkReferencesCoherent',true,'constraintModeUnchanged',true,'statementTimeoutMs',extract(epoch from current_setting('statement_timeout')::interval)*1000,'lockTimeoutMs',extract(epoch from current_setting('lock_timeout')::interval)*1000);
prepare a19_seal_full(uuid,bigint) as ${select}
\u005cecho A19_SEAL_PLAIN_BEGIN
explain (format json) execute a19_seal_full('10000000-0000-4000-8000-000000693019'::uuid,1::bigint);
\u005cecho A19_SEAL_PLAIN_END
\u005cecho A19_SEAL_ANALYZE_BEGIN
explain (analyze,buffers,timing off,format json) execute a19_seal_full('10000000-0000-4000-8000-000000693019'::uuid,1::bigint);
\u005cecho A19_SEAL_ANALYZE_END
rollback;
select jsonb_build_object('phase','rollback_complete','completed',true);
${metadata}
${sealFunctionsSQL}
`;
 return frameFullSealSeed(script);
}
export function closeFullSealOutput(text){
 const records=[],plans={};let invalidLines=0,open=null,buffer=[],next=0;
 const seedStatements={state:'NOT_OBSERVED',expected:seedFrameLabels.length,completed:[],active:null,lastCompleted:null,invalidMarkers:0};
 const markers=['A19_SEAL_PLAIN_BEGIN','A19_SEAL_PLAIN_END','A19_SEAL_ANALYZE_BEGIN','A19_SEAL_ANALYZE_END'];
 for(const line of String(text??'').split('\n').filter(s=>s.trim())){
  const trimmed=line.trim();
  if(trimmed.startsWith('A19_SEED_')){
   const expected=seedFrameLabels[seedStatements.completed.length],begin=expected?`A19_SEED_${expected.toUpperCase()}_BEGIN`:null,end=expected?`A19_SEED_${expected.toUpperCase()}_END`:null;
   if(open||next!==0||seedStatements.invalidMarkers>0){seedStatements.invalidMarkers++;invalidLines++;}
   else if(trimmed===begin&&seedStatements.active===null){seedStatements.active=expected;seedStatements.state='OPEN_STATEMENT';}
   else if(trimmed===end&&seedStatements.active===expected){seedStatements.completed.push(expected);seedStatements.lastCompleted=expected;seedStatements.active=null;seedStatements.state=seedStatements.completed.length===seedFrameLabels.length?'COMPLETE':'BETWEEN_STATEMENTS';}
   else{seedStatements.invalidMarkers++;invalidLines++;}
   if(seedStatements.invalidMarkers)seedStatements.state='INVALID_MARKERS';
  }else if(markers.includes(trimmed)){
   if(trimmed===markers[0]&&seedStatements.state!=='COMPLETE'){seedStatements.invalidMarkers++;seedStatements.state='INVALID_MARKERS';invalidLines++;}
   if(trimmed!==markers[next]){invalidLines++;continue;}next++;
   if(trimmed.endsWith('_BEGIN')){open=trimmed.includes('PLAIN')?'estimated':'analyzed';buffer=[];}
   else{try{plans[open]=closeExplainPlan(JSON.parse(buffer.join('\n')));}catch{invalidLines++;}open=null;buffer=[];}
  }else if(open)buffer.push(line);
  else try{
   const v=JSON.parse(line);let out;
   if(['before','after_rollback'].includes(v.phase)){
    const original=closePositivePayloadOutput(line);if(original.invalidLines||original.records.length!==1||!['receipts','acks'].every(k=>Number.isSafeInteger(v.metadata?.[k])&&v.metadata[k]>=0))throw Error();
    out=original.records[0];out.metadata.receipts=v.metadata.receipts;out.metadata.acks=v.metadata.acks;
   }else if(v.phase==='function_definitions'){
    if(!Array.isArray(v.definitions)||v.definitions.length!==4||!v.definitions.every((d,i)=>d.label===sealFunctionLabels[i]&&/^[0-9a-f]{64}$/.test(d.sha256)))throw Error();
    out={phase:v.phase,definitions:v.definitions.map(d=>({label:d.label,sha256:d.sha256}))};
   }else if(v.phase==='seed_guard'){
    const expected={batches:1,movements:25947,revisions:25947,joinedMovements:25947,unionEntities:25948,receipt:1,fkReferencesCoherent:true,constraintModeUnchanged:true,statementTimeoutMs:8000,lockTimeoutMs:6000};
    if(!Object.entries(expected).every(([k,value])=>v[k]===value))throw Error();out={phase:v.phase,...expected};
   }else if(v.phase==='rollback_complete'&&v.completed===true)out={phase:v.phase,completed:true};
   else if(v.phase==='connection_cleanup'&&Number.isSafeInteger(v.activeConnections)&&v.activeConnections>=0)out={phase:v.phase,activeConnections:v.activeConnections};
   else throw Error();records.push(out);
  }catch{invalidLines++;}
 }
 return {records,plans,invalidLines,partialPlan:open,completedPlanFrames:next,seedStatements};
}

export function createOwnedVolumeSqlDiagnostics({runtime,query:runQuery,rpcGet,save,serverSha,workerSha256,pause=delay,monotonicNow=()=>performance.now()}){
 if(runtime.url!=='http://127.0.0.1:54321'||!/^[0-9a-f]{64}$/.test(runtime.containerID)||!/^r4-ci-preflight-[0-9a-f]{12}$/.test(runtime.project)||runtime.head!==serverSha)throw Error('history_volume_diagnostic_ownership');
 const result={schema:'asus019-owned-volume-sql-diagnostic-v2',diagnosticOnly:true,timingQualification:false,ownershipVerified:true,serverSha,workerSha256,limits:{analysisBudgetMs:120000,requestBudgetMs:15000,canonicalRowLimit:200,vectorChunkLimit:4},snapshots:[],freshPlans:[],errors:[],configurationRestored:false,cachedPlanObserved:false,observerTimeScope:'synchronous_sql_calls_only_no_nested_double_count',preflight:{passed:false,stage:'not_started'},configurationScope:'single_owned_disposable_instance'};
 let schema,priorConfig,priorInstance,priorFunctionInstance,writeAttempted=false,functionWriteAttempted=false,instancePrepared=false,finished=false,warmNonce,warmInvalid=false,measurementStarted=false;const attemptedCaptures=new Set();
 const persist=()=>save('sql-diagnostics.json',result);
 const query=(text,admin=false,positiveProbe=false)=>{const started=performance.now();try{return runQuery(text,{admin,positiveProbe});}finally{result.observerElapsedMs=(result.observerElapsedMs??0)+(performance.now()-started);result.observerQueryCount=(result.observerQueryCount??0)+1;}};
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
 const instance=(setting='pg_stat_statements.track')=>JSON.parse(query(`SELECT jsonb_build_object('effective',current_setting('${setting}'),'autoEntries',(SELECT count(*) FROM pg_file_settings WHERE name='${setting}' AND sourcefile LIKE '%/postgresql.auto.conf'),'autoValue',(SELECT setting FROM pg_file_settings WHERE name='${setting}' AND sourcefile LIKE '%/postgresql.auto.conf' ORDER BY seqno DESC LIMIT 1),'autoValid',coalesce((SELECT bool_and(error IS NULL) FROM pg_file_settings WHERE name='${setting}' AND sourcefile LIKE '%/postgresql.auto.conf'),true),'pendingRestart',(SELECT pending_restart FROM pg_settings WHERE name='${setting}'),'otherSettingsSha256',(SELECT encode(extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_array(sourcefile,name,setting,applied,error) ORDER BY seqno),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') FROM pg_file_settings WHERE name NOT IN('pg_stat_statements.track','track_functions')));`,true));
 const validInstance=(v,setting='pg_stat_statements.track')=>{const values=setting==='track_functions'?['all','pl','none']:['all','top','none'];return v&&values.includes(v.effective)&&[0,1].includes(v.autoEntries)&&(v.autoEntries===0?v.autoValue===null:values.includes(v.autoValue))&&v.autoValid===true&&v.pendingRestart===false&&/^[0-9a-f]{64}$/.test(v.otherSettingsSha256);};
 async function readback(expected,setting='pg_stat_statements.track'){
  // Reload is asynchronous; bounded readback is not a canonical job retry.
  for(let i=0;i<5;i++){await pause(100);const value=instance(setting);if(validInstance(value,setting)&&value.effective===expected)return value;}
  throw Error('history_volume_diagnostic_readback_failed');
 }
 const cacheState=()=>JSON.parse(query(`SELECT jsonb_build_object('cacheMatches',coalesce((SELECT request_digest=encode(extensions.digest(convert_to(jsonb_build_object('lane','migration','operation','claim','payload','{}'::jsonb)::text,'UTF8'),'sha256'),'hex') AND response='{"ok":true,"run":null}'::jsonb AND created_at>clock_timestamp()-interval '1 hour' FROM public.payment_history_worker_requests WHERE request_id=${quote(warmNonce)}::uuid),false),'cacheRowSha256',(SELECT encode(extensions.digest(convert_to(to_jsonb(r)::text,'UTF8'),'sha256'),'hex') FROM public.payment_history_worker_requests r WHERE request_id=${quote(warmNonce)}::uuid),'requestCount',(SELECT count(*) FROM public.payment_history_worker_requests),'importActive',(SELECT count(*) FROM public.payment_history_jobs WHERE state IN('queued','analysing')),'migrationActive',(SELECT count(*) FROM public.payment_history_migration_runs WHERE state IN('queued','analysing')),'uploadActive',(SELECT count(*) FROM public.payment_history_uploads WHERE state IN('uploaded','verifying')));`));
 const cacheCounters=()=>JSON.parse(query(`WITH cache_rows AS (SELECT calls,to_jsonb(s)->>'stats_since' AS since FROM ${schema}.pg_stat_statements s WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND NOT toplevel AND trim(lower(regexp_replace(replace(query,'"',''),'[[:space:]]+',' ','g'))) LIKE 'select *%from public.payment_history_worker_requests where request_id%' AND query NOT ILIKE '%pg_stat_statements%'),epochs AS (SELECT since,count(*) AS members FROM cache_rows GROUP BY since) SELECT jsonb_build_object('calls',coalesce((SELECT sum(calls) FROM cache_rows),0),'statementEntries',(SELECT count(*) FROM cache_rows),'epochsAvailable',coalesce((SELECT bool_and(since IS NOT NULL) FROM cache_rows),true),'epochs',coalesce((SELECT jsonb_agg(jsonb_build_object('since',since,'members',members) ORDER BY since NULLS FIRST) FROM epochs),'[]'::jsonb),'statsReset',(SELECT stats_reset FROM ${schema}.pg_stat_statements_info),'dealloc',(SELECT dealloc FROM ${schema}.pg_stat_statements_info));`,true));
 const validCacheCohort=c=>Number.isSafeInteger(c.statementEntries)&&c.statementEntries>=0&&c.epochsAvailable===true&&Array.isArray(c.epochs)&&c.epochs.every(e=>typeof e.since==='string'&&Number.isSafeInteger(e.members)&&e.members>0)&&c.epochs.reduce((n,e)=>n+e.members,0)===c.statementEntries&&(c.statementEntries!==0||c.calls===0);
 async function settledFunctions(){
  const started=monotonicNow(),observation={minimumIdleWaitMs:11000,maximumIdleWaitAttempts:4,idleWaitAttempts:0,maximumSamples:3,sampleIntervalMs:1100,samples:0,status:'FAIL',timingQualification:false};let previous;
  (result.functionSettlementWindows??=[]).push(observation);
  try{
   // PG17.6 can defer idle-backend statistics for 10s, even though the
   // minimum reporting interval is 1s. Earlier equal samples can be stale.
   // This wait is observer time outside every measured RPC/Worker deadline.
   const deadline=started+11000;let observed=started;
   demand(finite(started)&&finite(deadline)&&deadline>started);
   for(let attempt=0;attempt<4&&observed<deadline;attempt++){
    observation.idleWaitAttempts++;
    await pause(Math.max(1,Math.ceil(deadline-observed)));
    const current=monotonicNow();observation.idleWaitMs=current-started;
    demand(finite(current)&&current>observed);observed=current;
   }
   demand(observed>=deadline&&observation.idleWaitMs>=11000);
   for(let i=0;i<3;i++){
    if(i>0)await pause(1100);const current=JSON.parse(query(functionSnapshotSQL()));observation.samples++;
    demand(functionDelta(current,current).valid);
    if(previous&&JSON.stringify(previous)===JSON.stringify(current)){observation.status='STABLE_AFTER_IDLE_FLUSH_WINDOW';return current;}
    previous=current;
   }
   throw Error('history_volume_diagnostic_function_statistics_unsettled');
  }finally{observation.elapsedMs=monotonicNow()-started;result.functionObserverElapsedMs=(result.functionObserverElapsedMs??0)+observation.elapsedMs;}
 }
 async function canary(label,expectedDelta,functionMode){
  demand(warmNonce&&!warmInvalid&&typeof rpcGet==='function');
  const before=cacheState();demand(before.cacheMatches);if(label==='trackingCanary')demand(before.importActive===0&&before.migrationActive===0&&before.uploadActive===0);
  const functionBefore=await settledFunctions(),counts=cacheCounters(),started=performance.now();
  const response=await rpcGet({p_request_id:warmNonce,p_lane:'migration',p_operation:'claim',p_payload:{}},{get:true});
  result.canaryRpcElapsedMs=(result.canaryRpcElapsedMs??0)+(performance.now()-started);
  if(response.errorCode){const error=Error('history_volume_diagnostic_canary_failed');error.diagnosticFailure={sqlState:response.errorCode};throw error;}
  demand(response.data?.ok===true&&response.data.run===null&&Object.keys(response.data).sort().join(',')==='ok,run');
  const afterCounts=cacheCounters(),functionAfter=await settledFunctions(),functions=functionDelta(functionBefore,functionAfter),after=cacheState(),delta=afterCounts.calls-counts.calls;
  result[label]={status:'FAIL',mode:'POSTGREST_GET_CACHED_GATEWAY_READ_ONLY',originalWarmRequestBound:true,cacheAndQueuesUnchanged:JSON.stringify(before)===JSON.stringify(after),expectedNestedDelta:expectedDelta,observedNestedDelta:finite(delta)?delta:null,counterCohortBefore:counts,counterCohortAfter:afterCounts,functionBefore,functionAfter,functions,expectedFunctionMode:functionMode,notWorkerHmacReplay:true};persist();
  demand(JSON.stringify(before)===JSON.stringify(after)&&typeof counts.statsReset==='string'&&counts.statsReset===afterCounts.statsReset&&finite(counts.dealloc)&&counts.dealloc===afterCounts.dealloc&&finite(counts.calls)&&finite(afterCounts.calls)&&finite(delta)&&delta===expectedDelta&&validCacheCohort(counts)&&validCacheCohort(afterCounts)&&(counts.statementEntries===0||counts.statementEntries===afterCounts.statementEntries&&JSON.stringify(counts.epochs)===JSON.stringify(afterCounts.epochs)));
  demand(['none','pl','all'].includes(functionMode)&&functions.valid&&functions.functions.find(f=>f.label==='gateway_canary').calls===(functionMode==='none'?0:1)&&functions.functions.find(f=>f.label==='crypto_canary').calls===(functionMode==='all'?1:0));
  result[label].status='PASS';persist();
 }
 async function prepareInstance(){
  if(instancePrepared)return;
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
   result.preflight.stage='preexisting_local_admin';
   result.adminCapabilities=JSON.parse(query("SELECT jsonb_build_object('expectedPreexistingRole',current_user='supabase_admin','superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'canSet',has_parameter_privilege(current_user,'pg_stat_statements.track','SET'),'canAlterSystem',has_parameter_privilege(current_user,'pg_stat_statements.track','ALTER SYSTEM'),'canSetFunctions',has_parameter_privilege(current_user,'track_functions','SET'),'canAlterSystemFunctions',has_parameter_privilege(current_user,'track_functions','ALTER SYSTEM'));",true));
   demand(Object.values(result.adminCapabilities).every(v=>v===true));
   result.preflight.stage='read_prior_instance';const observedInstance=instance();result.priorInstance=observedInstance;demand(validInstance(observedInstance));priorInstance=observedInstance;
   result.priorFunctionInstance=instance('track_functions');demand(validInstance(result.priorFunctionInstance,'track_functions'));priorFunctionInstance=result.priorFunctionInstance;
   result.functionDefinitions=JSON.parse(query(functionSnapshotSQL()));demand(result.functionDefinitions.functions?.length===6&&functionDelta(result.functionDefinitions,result.functionDefinitions).valid);
   result.rpcRoleOverrides=JSON.parse(query("SELECT coalesce(jsonb_agg(jsonb_build_object('roleClass',CASE WHEN d.setrole=0 THEN 'database_default' WHEN r.rolname='authenticator' THEN 'connection_role' WHEN r.rolname='service_role' THEN 'rpc_role' ELSE 'function_owner' END,'databaseScoped',d.setdatabase<>0,'value',CASE WHEN split_part(v,'=',2) IN('all','top','none','pl') THEN split_part(v,'=',2) ELSE 'other' END)),'[]'::jsonb) FROM pg_db_role_setting d LEFT JOIN pg_roles r ON r.oid=d.setrole CROSS JOIN LATERAL unnest(d.setconfig) v WHERE d.setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())) AND (d.setrole=0 OR r.rolname IN('authenticator','service_role','postgres')) AND (v LIKE 'pg_stat_statements.track=%' OR v LIKE 'track_functions=%');",true));
   demand(result.rpcRoleOverrides.length===0);
   result.preflight.stage='enable_instance_tracking';
   if(priorInstance.autoEntries!==1||priorInstance.autoValue!=='all'){writeAttempted=true;query("ALTER SYSTEM SET pg_stat_statements.track='all';",true);}
   if(priorFunctionInstance.autoEntries!==1||priorFunctionInstance.autoValue!=='all'){functionWriteAttempted=true;query("ALTER SYSTEM SET track_functions='all';",true);}
   demand(query('SELECT pg_reload_conf();',true)==='t');
   result.diagnosticFunctionInstance=await readback('all','track_functions');demand(result.diagnosticFunctionInstance.otherSettingsSha256===priorFunctionInstance.otherSettingsSha256);
   result.preflight.stage='tracking_readback';result.diagnosticInstance=await readback('all');
   demand(result.diagnosticInstance.otherSettingsSha256===priorInstance.otherSettingsSha256);
   result.diagnosticGatewayConfig=config();
   result.diagnosticGatewayInvariants=invariants();
   demand(JSON.stringify(result.priorGatewayInvariants)===JSON.stringify(result.diagnosticGatewayInvariants)&&JSON.stringify(priorConfig)===JSON.stringify(result.diagnosticGatewayConfig));
   instancePrepared=true;persist();
  }catch(error){record(result.preflight.stage,error);throw Error('history_volume_diagnostic_preflight_failed');}
 }
 async function prepare(){
  try{
   await prepareInstance();demand(warmNonce&&!warmInvalid);
   result.preflight.stage='real_rpc_read_only_canary';await canary('trackingCanary',1,'all');
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
 // Separate bounded phase observations after the original seven analysis
 // captures. These wrap only the real RPCs; no replay or EXPLAIN model query.
 const finalizationPhases=['baseline_receipt_preflight','baseline_review','baseline_apply','baseline_receipt','snapshot_start','page','replica_ack'];
 const phaseRecords=new Map();
 async function observeFinalization(label,action){
  if(!result.preflight.passed||!finished||!finalizationPhases.includes(label))throw Error('history_volume_diagnostic_finalization_scope');
  result.finalization??={diagnosticOnly:true,timingQualification:false,overlappingNestedTotals:true,
   limitation:'Interrupted statements may be absent from pg_stat_statements; completed nested statements are not an exclusive allocation of endpoint time. Missing categories do not imply zero cost; aggregates do not record statement chronology.',phases:[]};
  let item=phaseRecords.get(label);
  if(!item){
   item={phase:label,state:'RUNNING',rpcCalls:0,rpcElapsedMs:0};phaseRecords.set(label,item);result.finalization.phases.push(item);
   try{
    if(label==='baseline_apply')item.functionBefore=await settledFunctions();
    item.before=bounded('before_'+label,()=>JSON.parse(query(statementSnapshotSQL(schema))));
    if(!item.before||!Array.isArray(item.before.statements)||typeof item.before.statsReset!=='string'||!finite(item.before.dealloc))throw Error('history_volume_diagnostic_snapshot_unavailable');
   }catch(error){
    item.state='OBSERVER_FAILED';item.observationState='UNAVAILABLE';
    result.errors.push({operation:'before_'+label,code:'diagnostic_observation_unavailable',...closedDiagnosticFailure(error?.diagnosticFailure??{})});
    try{persist();}catch{/* The RPC has not been invoked, including on storage failure. */}
    throw Error('history_volume_diagnostic_finalization_observation_failed');
   }
  }else if(label!=='page'||item.state!=='RUNNING')throw Error('history_volume_diagnostic_finalization_repeated');
  const started=performance.now();let response,failed=true;
  try{response=await action();failed=false;return response;}
  finally{
   item.rpcCalls++;item.rpcElapsedMs+=performance.now()-started;
   // All130 actual page requests form one interval, not260 observer queries.
   const terminal=label!=='page'||failed||response?.done===true;
   if(terminal)item.state=failed?'RPC_FAILED':'RPC_COMPLETED';
   try{
    if(terminal){
     item.after=bounded('after_'+label,()=>JSON.parse(query(statementSnapshotSQL(schema))));
     if(!item.after)throw Error('history_volume_diagnostic_snapshot_unavailable');
     item.delta=statementDelta(item.before,item.after);
     if(label==='baseline_apply'){item.functionAfter=await settledFunctions();item.functionDelta=functionDelta(item.functionBefore,item.functionAfter);if(!item.functionDelta.valid)throw Error('history_volume_diagnostic_function_statistics_unavailable');}
     item.classificationCoverage=labels.slice(8).map(label=>{
      const row=item.delta.statements.find(s=>s.label===label);
      return {label,status:row&&!row.valid?'not_comparable':row?.calls>0?'observed':'not_observed_or_unclassified'};
     });
    }
    persist();
   }catch(error){
    // bounded also persists; persistence or malformed observation can throw.
    // A secondary observer failure must never replace the original RPC error.
    item.observationState='UNAVAILABLE';
    result.errors.push({operation:'after_'+label,code:'diagnostic_observation_unavailable',...closedDiagnosticFailure(error?.diagnosticFailure??{})});
    try{persist();}catch{/* No fabricated durable observation when storage fails. */}
    if(!failed)throw Error('history_volume_diagnostic_finalization_observation_failed');
   }
  }
 }
 async function fullSealProbe(runId,finalization,workerAnalysis){
  if(result.fullSealProbe)throw Error('history_volume_diagnostic_probe_repeated');
  const failed=finalization?.steps?.filter(s=>s.phase==='baseline_apply'),c=finalization?.canonical;
  const item=result.fullSealProbe={status:'NOT_RUN',diagnosticOnly:true,timingQualification:false,sourceSelectSha256:sealSourceSha256,parameterizedSelectSha256:sealParametersSha256,rows:25947,unionEntities:25948,statementTimeoutMs:8000,lockTimeoutMs:6000,transportTimeoutMs:90000,maximumAnalyzeAttempts:1,analyzeAttempts:0,cleanupVerified:false,
   planOrigin:'fresh_prepared_select_not_cached_apply_plan',eventInsertMeasured:false,nodeTimingAvailable:false,bufferScope:'inclusive_nodes_not_additive',seedContext:'rollback_only_after_failed_apply_not_original_mvcc_or_cache',constraintMode:'unchanged_original_deferred_fk_with_coherent_references'};
  if(!result.preflight.passed||workerAnalysis?.status!=='PASS_WORKER_ANALYSIS'||finalization?.applyAttempts!==1||failed?.length!==1||failed[0].sqlState!=='57014'||failed[0].httpStatus!==500||c?.state!=='review_ready'||c.runtimeRevision!=='0'||c.receiptPresent!==false||c.applyKeyPresent!==false||!['batches','movements','changeSets','replicaEvents','sourceSnapshots','acks','ackCount'].every(k=>c[k]===0)){item.reason='original_worker_apply_or_canonical_prerequisite_unavailable';persist();return;}
  item.status='FAIL';item.afterOriginalFailedApply=true;let before,definitions,probeStarted=false;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const closeReadback=text=>{const closed=closeFullSealOutput(text);demand(closed.invalidLines===0&&closed.seedStatements.state==='NOT_OBSERVED'&&closed.completedPlanFrames===0&&closed.records.length===3&&closed.records[0].phase==='after_rollback'&&closed.records[1].phase==='function_definitions'&&closed.records[2].phase==='connection_cleanup');return closed;};
  const remember=closed=>{item.observation=closed;item.estimatedPlanCaptured=!!closed.plans.estimated;item.analyzedPlanCaptured=!!closed.plans.analyzed;item.analyzeAttempts=closed.completedPlanFrames>=3?1:null;};
  try{
   // Validate source binding before any seed or EXPLAIN can be emitted.
   const script=fullSealProbeSQL(runId),baseline=closeReadback(query(fullSealReadbackSQL(runId)));
   demand(baseline.records[2].activeConnections===0);before=baseline.records[0].metadata;definitions=baseline.records[1].definitions;item.before=before;item.functionDefinitionsBefore=definitions;
   demand(before.run.stagedMovements===25947&&before.run.stagedObjects===25955&&before.runtime.revision==='0'&&before.run.receiptPresent===false&&before.run.applyKeyPresent===false&&['batches','movements','revisions','receipts','sourceSnapshots','replicaEvents','changeSets','acks'].every(k=>before[k]===0));
   let output;probeStarted=true;
   try{output=query(script,false,true);}catch(error){remember(closeFullSealOutput(error?.diagnosticPartialOutput));item.failure=closedDiagnosticFailure(error?.diagnosticFailure??{});throw error;}
   const closed=closeFullSealOutput(output);remember(closed);
   demand(closed.invalidLines===0&&closed.seedStatements.state==='COMPLETE'&&closed.partialPlan===null&&closed.completedPlanFrames===4&&closed.plans.estimated&&closed.plans.analyzed&&closed.records.length===6);
   demand(same(closed.records.map(r=>r.phase),['before','function_definitions','seed_guard','rollback_complete','after_rollback','function_definitions']));
   demand(same(closed.records[0].metadata,before)&&same(closed.records[4].metadata,before)&&same(closed.records[1].definitions,definitions)&&same(closed.records[5].definitions,definitions));
   demand(closed.plans.analyzed.plan['Actual Rows']===25948&&closed.plans.analyzed.plan['Actual Loops']===1&&finite(closed.plans.analyzed['Execution Time']));
   item.completedObservationVerified=true;
  }catch(error){item.failure??=closedDiagnosticFailure(error?.diagnosticFailure??{});try{record('full_seal_probe',error);}catch{/* Original Apply error remains primary. */}}
  finally{
   item.probeStarted=probeStarted;
   if(before&&definitions)try{
    for(let i=0;i<8;i++){
     const cleanup=closeReadback(query(fullSealReadbackSQL(runId)));item.cleanup=cleanup;
     if(cleanup.records[2].activeConnections===0){item.metadataRestored=same(cleanup.records[0].metadata,before);item.functionDefinitionsUnchanged=same(cleanup.records[1].definitions,definitions);item.cleanupVerified=item.metadataRestored&&item.functionDefinitionsUnchanged;break;}
     await pause(1100);
    }
    demand(item.cleanupVerified);
   }catch(error){try{record('full_seal_probe_cleanup',error);}catch{/* Restore both GUCs even if cleanup evidence fails. */}}
   if(item.completedObservationVerified&&item.cleanupVerified)item.status='DIAGNOSTIC_SELECT_OBSERVATION_COMPLETE';
   try{persist();}catch{/* Never replace the primary request error. */}
  }
 }
 async function positivePayloadProbe(runId,finalization){
  const failed=finalization?.steps?.find(s=>s.phase==='baseline_apply'),c=finalization?.canonical;
  if(!result.preflight.passed||finalization?.applyAttempts!==1||failed?.sqlState!=='57014'||failed?.httpStatus!==500||c?.state!=='review_ready'||c.runtimeRevision!=='0'||c.receiptPresent!==false||c.applyKeyPresent!==false||!['batches','movements','changeSets','replicaEvents','sourceSnapshots','acks','ackCount'].every(k=>c[k]===0))return;
  if(result.positivePayloadProbe)throw Error('history_volume_diagnostic_probe_repeated');
  const item=result.positivePayloadProbe={status:'FAIL',diagnosticOnly:true,timingQualification:false,rows:512,statementTimeoutMs:8000,transportTimeoutMs:90000,afterOriginalFailedApply:true,records:[],cleanupVerified:false};
  let before;
  try{
   const baseline=closePositivePayloadOutput(query(positivePayloadReadbackSQL(runId)));
   demand(baseline.invalidLines===0&&baseline.records.length===2&&baseline.records[1].activeConnections===0);before=baseline.records[0].metadata;item.before=before;
   let output;
   try{output=query(positivePayloadProbeSQL(runId),false,true);}
   catch(error){item.partial=closePositivePayloadOutput(error?.diagnosticPartialOutput);item.failure=closedDiagnosticFailure(error?.diagnosticFailure??{});throw error;}
   const closed=closePositivePayloadOutput(output);item.records=closed.records;demand(closed.invalidLines===0&&closed.records.length===9);
   const samples=closed.records.filter(r=>r.phase==='positive_payload_sample'),parity=closed.records.find(r=>r.phase==='positive_payload_parity');
   demand(samples.length===6&&samples.every((s,i)=>s.sequence===i+1&&s.variant===['helper','inline','inline','helper','helper','inline'][i])&&new Set(samples.map(s=>s.root)).size===1&&new Set(samples.map(s=>s.bytes)).size===1);
   demand(parity&&['jsonbEqual','protocolDigestEqual','batchJsonbEqual','batchProtocolDigestEqual'].every(k=>parity[k]===true));
   demand(JSON.stringify(closed.records[0].metadata)===JSON.stringify(before)&&JSON.stringify(closed.records.at(-1).metadata)===JSON.stringify(before));
   item.samplesAndParityVerified=true;
  }catch(error){try{record('positive_payload_probe',error);}catch{/* Preserve the original Apply error. */}}
  finally{
   // A killed docker client is not proof that its psql session has ended.
   // Observe the dedicated application_name and exact state independently.
   try{
    for(let i=0;i<8;i++){
     const cleanup=closePositivePayloadOutput(query(positivePayloadReadbackSQL(runId)));item.cleanup=cleanup;
     if(cleanup.invalidLines===0&&cleanup.records.length===2&&cleanup.records[1].activeConnections===0){item.cleanupVerified=!!before&&JSON.stringify(cleanup.records[0].metadata)===JSON.stringify(before);break;}
     await pause(1100);
    }
    demand(item.cleanupVerified);
   }catch(error){try{record('positive_payload_probe_cleanup',error);}catch{/* Both GUC restores must still run. */}}
   if(item.samplesAndParityVerified&&item.cleanupVerified)item.status='PASS_SYNTHETIC_ROLLBACK_ONLY_COMPARISON';
   try{persist();}catch{/* Never replace primary57014 with a secondary write error. */}
  }
 }
 async function restore(){
  let restoreErrors=0;
  // Each setting is restored even if restoring the other setting or saving
  // its evidence fails. No RESET ALL and no function/role changes.
  for(const [setting,prior,written,key] of [['pg_stat_statements.track',priorInstance,writeAttempted,'restoredInstance'],['track_functions',priorFunctionInstance,functionWriteAttempted,'restoredFunctionInstance']]){
   try{
    if(prior){
     if(written)query(prior.autoEntries===0?`ALTER SYSTEM RESET ${setting};`:`ALTER SYSTEM SET ${setting}=${quote(prior.autoValue)};`,true);
     demand(query('SELECT pg_reload_conf();',true)==='t');
     result[key]=await readback(prior.effective,setting);demand(JSON.stringify(result[key])===JSON.stringify(prior));
    }else demand(!written);
   }catch(error){restoreErrors++;try{record('restore_'+setting.replaceAll('.','_'),error);}catch{/* Continue restoring the other setting. */}}
  }
  let stage='restore_function_invariants';
  try{
   demand(restoreErrors===0);
   if(priorConfig){
    result.restoredGatewayConfig=config();result.restoredGatewayInvariants=invariants();
    demand(JSON.stringify(result.restoredGatewayConfig)===JSON.stringify(priorConfig)&&JSON.stringify(result.restoredGatewayInvariants)===JSON.stringify(result.priorGatewayInvariants));
   }
   if(result.functionDefinitions){result.restoredFunctionDefinitions=JSON.parse(query(functionSnapshotSQL()));demand(functionDelta(result.functionDefinitions,result.restoredFunctionDefinitions).valid);}
   if(warmNonce&&schema&&priorInstance&&priorFunctionInstance){stage='restored_real_rpc_canary';await canary('restoredCanary',priorInstance.effective==='all'?1:0,priorFunctionInstance.effective);}
   else result.restorationAction='settings_restored_no_warm_canary_available';
   result.configurationRestored=true;
  }catch(error){record(stage,error);}finally{
   if(result.finalization){
    // Only attempted phases need observations. Later phases remain NOT_RUN
    // after a real failure. An open page interval cannot be called complete.
    result.finalization.notRun=finalizationPhases.filter(label=>!phaseRecords.has(label));
    result.finalization.status=result.finalization.phases.every(p=>p.state!=='RUNNING'&&p.delta?.valid&&p.delta.allCategoriesComparable)?'DIAGNOSTIC_PHASES_COLLECTED':'DIAGNOSTIC_PHASES_PARTIAL';
   }
   const completeCoverage=measurementStarted&&result.classificationCoverage?.length===6&&result.classificationCoverage.every(c=>c.status==='observed')&&(!result.finalization||result.finalization.status==='DIAGNOSTIC_PHASES_COLLECTED');
   result.status=!result.preflight.passed||!result.configurationRestored||result.errors.length>0?'DIAGNOSTIC_OBSERVATION_FAILED':completeCoverage?'DIAGNOSTIC_OBSERVATION_COLLECTED':'DIAGNOSTIC_OBSERVATION_PARTIAL';persist();
  }
  return result.status;
 }
 return {observeWarmResponse,prepareInstance,prepare,capture,onVector,finish,observeFinalization,positivePayloadProbe,fullSealProbe,restore};
}
