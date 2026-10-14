// Local-only checkpoint-pipeline regression and complete checkpoint benchmark. Synthetic rows only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
const docker = process.env.DOCKER_BIN ?? '/usr/local/bin/docker';
const container = process.env.WECHAT_TEST_DB_CONTAINER ?? 'supabase_db_MerchandiseControlSupabase';
const template = process.env.WECHAT_TEST_DB_TEMPLATE ?? 'wechat010_sync_final_20260926';
assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
assert.match(template, /^wechat010_[a-z0-9_]+$/);
assert.ok(statSync('/var/run/docker.sock').isSocket(), 'local Docker socket required');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DOCKER_')));
const database = `wechat010_pipeline_${process.pid}`;
const sql = (input, db = database, role = 'postgres') => execFileSync(docker, [
  '--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-X', '-qAt',
  '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db,
], { input: `set work_mem='2184kB';set max_parallel_workers_per_gather=1;set jit=off;\n${input}`, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim();
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const migration = readFileSync('supabase/migrations/20261002025317_wechat_010_checkpoint_pipeline_performance.sql', 'utf8');
const fixture = `

 insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009201','authenticated','authenticated','{}','{}',now(),now());
 update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000009201';
 insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000009201','PERFLOCAL','Synthetic performance shop','active');
 insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values('00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','shop_owner','active');
 insert into public.shop_devices(shop_id,device_identifier,device_type,display_name,status) values('10000000-0000-4000-8000-000000009201','checkpoint-perf-local','mobile','Synthetic local device','active');
 insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at) values('10000000-0000-4000-8000-000000009201','00000000-0000-4000-8000-000000009201','mapped',now());
 insert into public.inventory_suppliers(id,owner_user_id,shop_id,name) select ('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201',case when i=1 then null::uuid else '10000000-0000-4000-8000-000000009201'::uuid end,'Supplier '||i from generate_series(1,135)i;
 insert into public.inventory_categories(id,owner_user_id,shop_id,name) select ('22000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201',case when i=1 then null::uuid else '10000000-0000-4000-8000-000000009201'::uuid end,'Category '||i from generate_series(1,104)i;
 insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,second_product_name,item_number,stock_quantity,purchase_price,retail_price,supplier_id,category_id) select ('23000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201',case when i<=165 then null::uuid else '10000000-0000-4000-8000-000000009201'::uuid end,'PERF-'||i,repeat('Synthetic product 中文 ',3)||i,'Second name '||i,'Item-'||i,(i%53),1000+(i%992),2000+(i%300),case when i between 145 and 165 then null::uuid when i<145 then '21000000-0000-4000-8000-000000000001'::uuid else ('21000000-0000-4000-8000-'||lpad(((i-1)%104+2)::text,12,'0'))::uuid end,case when i between 145 and 165 then null::uuid when i<145 then '22000000-0000-4000-8000-000000000001'::uuid else ('22000000-0000-4000-8000-'||lpad(((i-1)%73+2)::text,12,'0'))::uuid end from generate_series(1,19832)i;
 insert into public.inventory_product_prices(id,owner_user_id,shop_id,product_id,type,price,effective_at,created_at,source,note) select ('24000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201',case when i<=165 then null::uuid else '10000000-0000-4000-8000-000000009201'::uuid end,('23000000-0000-4000-8000-'||lpad(((i-1)%19832+1)::text,12,'0'))::uuid,'RETAIL',1000+(i%1142),to_char(timestamp '2026-09-29 01:00:00'+(i%663)*interval '1 second','YYYY-MM-DD HH24:MI:SS'),to_char(timestamp '2026-09-29 02:00:00'+(i%661)*interval '1 second','YYYY-MM-DD HH24:MI:SS'),'local','Bounded price note '||i from generate_series(1,41345)i;
 insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name,updated_at,deleted_at,session_overlay) select '25000000-0000-4000-8000-'||lpad(i::text,12,'0'),2,'2026-09-29 01:00:00','Synthetic','Synthetic',false,(select jsonb_agg(jsonb_build_array('Synthetic column','Synthetic column','Synthetic column','Synthetic column','Synthetic column','Synthetic column','Synthetic column','Synthetic column')) from generate_series(1,case when i=1 then 154 when i<=45 then 8 else 7 end) j),'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Synthetic history','2026-09-29T01:00:00.123456Z',case when i>83 then timestamptz '2026-09-30 01:00:00Z' else null end,jsonb_build_object('overlay_schema',1,'editable',jsonb_build_array(jsonb_build_array(repeat('Synthetic',8))),'complete',jsonb_build_array(false)) from generate_series(1,178)i;
 update public.inventory_suppliers set deleted_at='2026-09-30 01:00:00Z' where id > '21000000-0000-4000-8000-000000000105';
 update public.inventory_categories set deleted_at='2026-09-30 01:00:00Z' where id > '22000000-0000-4000-8000-000000000074';
 update public.inventory_products set deleted_at='2026-09-30 01:00:00Z' where id > '23000000-0000-4000-8000-000000019773' or id='23000000-0000-4000-8000-000000000146';
 insert into public.inventory_product_image_versions (
 id,shop_id,product_id,status,main_path,thumb_path,
 expected_main_sha256,expected_main_bytes,expected_main_width,expected_main_height,
 expected_thumb_sha256,expected_thumb_bytes,expected_thumb_width,expected_thumb_height,
 verified_main_sha256,verified_main_bytes,verified_main_width,verified_main_height,verified_main_mime_type,
 verified_thumb_sha256,verified_thumb_bytes,verified_thumb_width,verified_thumb_height,verified_thumb_mime_type,
 requested_by_profile_id,finalized_by_profile_id,actor_kind,finalized_at)
 values('26000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','23000000-0000-4000-8000-000000000166','ready',
 'shops/10000000-0000-4000-8000-000000009201/products/23000000-0000-4000-8000-000000000166/primary/26000000-0000-4000-8000-000000009201/main.jpg',
 'shops/10000000-0000-4000-8000-000000009201/products/23000000-0000-4000-8000-000000000166/primary/26000000-0000-4000-8000-000000009201/thumb.jpg',
 repeat('a',64),1000,100,100,repeat('b',64),500,50,50,
 repeat('a',64),1000,100,100,'image/jpeg',repeat('b',64),500,50,50,'image/jpeg',
 '00000000-0000-4000-8000-000000009201','00000000-0000-4000-8000-000000009201','personal_account','2026-09-29 01:00:00Z');
 update public.inventory_products set primary_image_version_id='26000000-0000-4000-8000-000000009201',primary_image_updated_at='2026-09-29 01:00:00Z' where id='23000000-0000-4000-8000-000000000166';
 analyze;

`;
const checkpointSignature = 'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)';
const scopeSignatures = ['app_private.sync_event_row_matches_scope_v1(uuid,uuid,uuid,uuid)','app_private.sync_relation_row_matches_event_scope_v1(uuid,uuid,uuid,uuid)'];
const signatures = [checkpointSignature, ...scopeSignatures];
const where = `oid in (${signatures.map(s => `${literal(s)}::regprocedure`).join(',')})`;
const definitions = () => sql(`select string_agg(pg_get_functiondef(oid)||';', E'\n' order by proname) from pg_proc where ${where};`);
const checkpointDefinition = () => sql(`select pg_get_functiondef(${literal(checkpointSignature)}::regprocedure);`);
// Every target attribute except prosrc and the two intentional languages stays exact.
const attributes = () => sql(`select jsonb_agg(to_jsonb(f)-'prosrc'-'prolang' order by proname) from pg_proc f where ${where};`);
const unaffected = () => sql(`select md5(string_agg(to_jsonb(f)::text,E'\n' order by oid)) from pg_proc f
 where pronamespace in ('app_private'::regnamespace,'public'::regnamespace) and not (${where});`);
const fingerprint = () => sql(`select jsonb_object_agg(name,hash) from (${[
  'inventory_suppliers','inventory_categories','inventory_products','inventory_product_prices',
  'inventory_product_image_versions','shared_sheet_sessions','sync_events',
].map((table) => `select '${table}' name, md5(string_agg(md5(to_jsonb(row)::text),',' order by md5(to_jsonb(row)::text))) hash from public.${table} row`).join(' union all ')}) v;`);
const account = '00000000-0000-4000-8000-000000009201';
const shop = '10000000-0000-4000-8000-000000009201';
const results = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');

function productBlock(definition) {
  const endAnchor = definition.indexOf('  into v_products\n');
  const start = Math.max(definition.lastIndexOf('  with scoped as (', endAnchor), definition.lastIndexOf('  with scoped as materialized (', endAnchor));
  const end = definition.indexOf(';', endAnchor) + 1;
  assert.ok(start >= 0 && end > start);
  return definition.slice(start, end);
}
function productQuery(definition) {
  return productBlock(definition).replace('  into v_products\n', '\n')
    .replaceAll('v_scope_kind', "'authorized_shop_plus_legacy'::text")
    .replaceAll('p_shop_id', `${literal(shop)}::uuid`)
    .replaceAll('v_mapped_owner_id', `${literal(account)}::uuid`);
}
function readCheckpoint(label, baseline='0', scope=null) {
  const start=performance.now();
  const value=JSON.parse(sql(`set statement_timeout='8s';select set_config('request.jwt.claim.sub',${literal(account)},false);set role authenticated;select public.shop_sync_recovery_checkpoint_v1(${literal(shop)},'checkpoint-perf-local',${literal(baseline)},${scope===null?'null':literal(scope)});`).split('\n').at(-1));
  const elapsedMs=Math.round(performance.now()-start);assert.equal(value.status,'ready');
  results.push({label,elapsedMs});console.log(`PASS ${label}: ${elapsedMs}ms fullJSON ${hash(JSON.stringify(value))}`);return value;
}
function runTap(path) {
  const output=sql(readFileSync(path,'utf8'));assert.doesNotMatch(output,/^not ok/m,output);assert.match(output,/^1\.\.[1-9][0-9]*$/m);console.log(output);
}
function trackedProducts(definition, setup='', temporary=false) {
  const query=productQuery(definition).replaceAll('public.inventory_products product',temporary?'pg_temp.product_vectors product':'public.inventory_products product');
  const output=sql(`begin;set local statement_timeout='8s';set local track_functions='all';${setup}${query}select coalesce(calls,0) from pg_stat_xact_user_functions where funcname='sync_product_recovery_row_v1';rollback;`).split('\n');
  return {value:JSON.parse(output[0]),calls:Number(output[1]??0)};
}
let created=false;
try {
  assert.equal(sql(`select pg_get_userbyid(datdba) from pg_database where datname=${literal(template)};`,'postgres','supabase_admin'),'postgres');
  assert.equal(sql(`select count(*) from pg_stat_activity where datname=${literal(template)};`,'postgres','supabase_admin'),'0');
  assert.equal(sql('select (select count(*) from public.shops)+(select count(*) from public.inventory_products)+(select count(*) from public.inventory_product_prices)+(select count(*) from public.shared_sheet_sessions)+(select count(*) from public.sync_events);',template),'0');
  sql(`create database ${database} template ${template} owner postgres;`,'postgres','supabase_admin');created=true;
  for(const file of ['20260929013345_wechat_010_history_physical_normalization.sql','20260929013437_wechat_010_catalog_keyset_order.sql','20261001220355_wechat_010_recovery_checkpoint_performance.sql','20261001235153_wechat_010_history_timestamp_compatibility.sql','20261002005414_wechat_010_price_digest_performance.sql','20261002013745_wechat_010_checkpoint_integrity_performance.sql'])sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
  console.log('PASS isolated empty schema151 clone with exact prior migrations; TEST work_mem2184kB/parallel1/jitoff.');
  const original=definitions(),originalCheckpoint=checkpointDefinition(),oldAttributes=attributes(),oldOther=unaffected();
  const originals=scopeSignatures.map(s=>({signature:s,body:sql(`select prosrc from pg_proc where oid=${literal(s)}::regprocedure`)}));
  const inTransaction=migration.replace('\nbegin;\nset local lock_timeout','\nset local lock_timeout').replace(/\ncommit;\s*$/,'\n');
  assert.throws(()=>sql(migration,database,'supabase_admin'),/checkpoint_pipeline_performance_baseline_mismatch/);
  const helper=scopeSignatures[0];
  for(const [label,setup,accepted] of [
    ['canonical ACL','',true],
    ['TEST ACL',`grant execute on function ${checkpointSignature} to service_role;`,true],
    ['TEST reordered',`revoke execute on function ${checkpointSignature} from authenticated;grant execute on function ${checkpointSignature} to service_role;grant execute on function ${checkpointSignature} to authenticated;`,true],
    ['checkpoint extra grantee',`grant execute on function ${checkpointSignature} to anon;`,false],
    ['checkpoint grant option',`grant execute on function ${checkpointSignature} to authenticated with grant option;`,false],
    ['checkpoint volatility',`alter function ${checkpointSignature} stable;`,false],
    ['checkpoint signature',`alter function ${checkpointSignature} rename to previous_checkpoint;`,false],
    ['scope extra grantee',`grant execute on function ${helper} to service_role;`,false],
    ['scope grant option',`grant execute on function ${helper} to authenticated with grant option;`,false],
    ['scope volatility',`alter function ${helper} volatile;`,false],
    ['scope invoker',`alter function ${helper} security invoker;`,false],
    ['scope strict',`alter function ${helper} strict;`,false],
    ['scope path',`alter function ${helper} set search_path=public;`,false],
    ['scope signature',`alter function ${helper} rename to previous_scope;`,false],
    ['scope source',`create or replace function app_private.sync_event_row_matches_scope_v1(p_row_owner_user_id uuid,p_row_shop_id uuid,p_event_owner_user_id uuid,p_event_shop_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as 'select true';`,false],
  ]) {
    const metadata=`select jsonb_agg(to_jsonb(f)-'prosrc'-'prolang' order by proname) from pg_proc f where ${where};`;
    const query=`begin;${setup}${accepted?metadata:''}${inTransaction}${accepted?metadata:''}rollback;`;
    if(accepted){const [before,after]=sql(query).split('\n').map(JSON.parse);assert.deepEqual(after,before,label);}else assert.throws(()=>sql(query),/checkpoint_pipeline_performance_(baseline|scope_helper)_mismatch/,label);
    assert.equal(definitions(),original);assert.equal(attributes(),oldAttributes);assert.equal(unaffected(),oldOther);console.log(`PASS guard ${label}: ${accepted?'preserved':'atomic rejection'}`);
  }
  sql(migration.replace(/commit;\s*$/,'rollback;'));assert.equal(definitions(),original);
  sql(migration);const candidate=definitions(),candidateCheckpoint=checkpointDefinition();
  const strip=s=>s.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('--')).join('\n').trim();
  assert.equal(strip(candidateCheckpoint.replace(productBlock(candidateCheckpoint),'PRODUCT_BLOCK')),strip(originalCheckpoint.replace(productBlock(originalCheckpoint),'PRODUCT_BLOCK')));
  for(const h of originals){const next=sql(`select prosrc from pg_proc where oid=${literal(h.signature)}::regprocedure`);const originalExpression=h.body.trim().replace(/^select\s+/,'');const marker='  -- Preserve the complete legacy expression, including SQL NULL behavior.\n  return ';assert.ok(next.includes(marker));assert.equal(next.slice(next.indexOf(marker)+marker.length).trim(),originalExpression+'\nend;');}
  assert.equal(attributes(),oldAttributes);assert.equal(unaffected(),oldOther);
  assert.equal(sql(`select count(*) from pg_proc f join pg_language l on l.oid=f.prolang where ${where.replace('oid in', 'f.oid in')} and l.lanname='plpgsql'`),'3');
  runTap('supabase/tests/wechat_010_checkpoint_pipeline_performance.sql');
  runTap('supabase/tests/wechat_010_history_timestamp_compatibility.sql');
  runTap('supabase/tests/cross_platform_sync_recovery_contract.sql');
  for(const statement of fixture.split(';').filter(s=>s.trim())) {
    if(statement.includes('generate_series(1,19832)'))for(let i=1;i<=19832;i+=500)sql(statement.replace('generate_series(1,19832)',`generate_series(${i},${Math.min(i+499,19832)})`)+';');
    else if(statement.includes('generate_series(1,41345)'))for(let i=1;i<=41345;i+=1000)sql(statement.replace('generate_series(1,41345)',`generate_series(${i},${Math.min(i+999,41345)})`)+';');
    else if(statement.includes('update public.inventory_products set primary_image_version_id='))sql(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);${statement};commit;`);
    else sql(statement+';');
  }
  const addEventsUntil=target=>{const count=Number(sql(`select count(*) from public.sync_events where shop_id='${shop}'`));assert.ok(count<=target);sql(Array.from({length:target-count},(_,i)=>`update public.inventory_products set product_name='Synthetic event ${count+i}' where id='23000000-0000-4000-8000-000000000166';`).join('\n')+'\nanalyze;');};
  addEventsUntil(2074);const dataBefore=fingerprint();
  sql(original);const reference=readCheckpoint('baseline-first');for(let i=0;i<2;i++)assert.deepEqual(readCheckpoint(`baseline-repeat-${i}`),reference);
  sql(candidate);for(let i=0;i<3;i++)assert.deepEqual(readCheckpoint(`candidate-${i}`),reference);
  const before=trackedProducts(originalCheckpoint),after=trackedProducts(candidateCheckpoint);assert.deepEqual(after.value,before.value);assert.equal(before.calls,19832*2);assert.equal(after.calls,19832);console.log('PASS red-to-green product DTO evaluations39664→19832, identical aggregate.');
  const vectors=`create temp table product_vectors as select * from public.inventory_products order by id limit 10;update product_vectors set barcode='Unicode 中文😀\\"',item_number=null,product_name=repeat('界',30000),purchase_price='NaN',retail_price='Infinity',stock_quantity='-0';update product_vectors set deleted_at='infinity',primary_image_updated_at='-infinity' where id>(select id from product_vectors order by id limit 1);`;
  const vectorBefore=trackedProducts(originalCheckpoint,vectors,true),vectorAfter=trackedProducts(candidateCheckpoint,vectors,true);assert.deepEqual(vectorAfter.value,vectorBefore.value);assert.ok(vectorAfter.value.oversizeRowCount>0);console.log('PASS NULL/Unicode/oversize/nonfinite/tombstone product aggregate parity.');
  const current=readCheckpoint('candidate-current-baseline',reference.syncEvents.maxId,reference.scope.key);sql(original);assert.deepEqual(readCheckpoint('baseline-current-baseline',reference.syncEvents.maxId,reference.scope.key),current);
  for(const [label,definition] of [['baseline',original],['candidate',candidate]]) {
    sql(definition);const output=sql(`begin;set local statement_timeout='8s';set local plan_cache_mode='force_generic_plan';select set_config('request.jwt.claim.sub','${account}',true);set local role authenticated;${Array.from({length:6},()=>`select public.shop_sync_recovery_checkpoint_v1('${shop}','checkpoint-perf-local','0',null);`).join('\n')}rollback;`).split('\n').slice(1).map(JSON.parse);assert.equal(output.length,6);for(const value of output)assert.deepEqual(value,reference);console.log(`PASS ${label} six same-backend generic calls, fullJSON identical and8s each.`);
  }
  assert.equal(fingerprint(),dataBefore);addEventsUntil(10001);const capped=readCheckpoint('candidate-10001-event-boundary');assert.equal(capped.syncEvents.inspectedCount,10000);assert.equal(capped.syncEvents.scanComplete,false);assert.equal(capped.syncEvents.requiresFullRecovery,true);
  sql(original);assert.deepEqual(readCheckpoint('baseline-10001-event-boundary'),capped);const finalData=fingerprint();sql(migration);assert.equal(definitions(),candidate);assert.equal(attributes(),oldAttributes);assert.equal(unaffected(),oldOther);assert.equal(fingerprint(),finalData);
  console.log('PASS exact fullJSON/digests/scope/cap/metadata/OID/ACL/unaffected functions/data, rollback and reapply.');console.log(JSON.stringify({syntheticRows:61595,deadlineMilliseconds:8000,results},null,2));
}finally{if(created)sql(`drop database ${database} with(force);`,'postgres','supabase_admin');console.log('clone removed');}
