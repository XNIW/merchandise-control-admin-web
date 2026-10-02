// Local-only preflight/price regression and complete checkpoint benchmark. Synthetic rows only.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
const migration=readFileSync('supabase/migrations/20261002040159_wechat_010_preflight_price_bytes.sql','utf8');
const helper='app_private.sync_recovery_scalar_bytes_contract_v1()';
const extract=(source,anchor,delimiter)=>{const start=source.indexOf(anchor);assert.ok(start>=0,anchor);const end=source.indexOf(delimiter+';',source.toLowerCase().indexOf('as '+delimiter,start)+delimiter.length+3);assert.ok(end>=0);return source.slice(start,end+delimiter.length+1);};
const container='supabase_db_MerchandiseControlSupabase',template='wechat010_sync_final_20260926';
const db=`wechat010_preflight_bytes_${process.pid}`;
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('DOCKER_')));
const sql=(input,database=db,user='postgres')=>execFileSync('/usr/local/bin/docker',['--host','unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',database],{input,encoding:'utf8',env,timeout:120000,stdio:['pipe','pipe','pipe']}).trim();
assert.ok(statSync('/var/run/docker.sock').isSocket());
const originalCheckpointSource=readFileSync('supabase/migrations/20261002025317_wechat_010_checkpoint_pipeline_performance.sql','utf8');
const original=extract(readFileSync('supabase/migrations/20260722013109_cross_platform_sync_event_completeness.sql','utf8'),'create or replace function app_private.sync_recovery_preflight_counts_v1(','$$');
const candidate=extract(migration,'create or replace function app_private.sync_recovery_preflight_counts_v1(','$$');
const candidateCheckpoint=extract(migration,'CREATE OR REPLACE FUNCTION public.shop_sync_recovery_checkpoint_v1(','$function$');
const fixture=readFileSync('scripts/testing/wechat-010-checkpoint-pipeline-performance.mjs','utf8').match(/const fixture = `([\s\S]*?)`;/)[1];
const shop='10000000-0000-4000-8000-000000009201',owner='00000000-0000-4000-8000-000000009201';
const call=`app_private.sync_recovery_preflight_counts_v1('${shop}','authorized_shop_plus_legacy','${owner}','${owner}')`;
const settings="set statement_timeout='8s';set work_mem='2184kB';set max_parallel_workers_per_gather=1;set jit=off;";
const sha=s=>createHash('sha256').update(s).digest('hex');
const timed=(label,query)=>{const start=performance.now();const out=sql(settings+query).split('\n').at(-1);const value=JSON.parse(out);console.log(JSON.stringify({label,elapsedMs:Math.round(performance.now()-start),sha256:sha(out),resourceExceeded:value.resourceExceeded,status:value.status}));return value;};
const checkpoint=()=>`select set_config('request.jwt.claim.sub','${owner}',false);set role authenticated;select public.shop_sync_recovery_checkpoint_v1('${shop}','checkpoint-perf-local');`;
let created=false;
try{
 assert.equal(sql(`select pg_get_userbyid(datdba) from pg_database where datname='${template}';`,'postgres','supabase_admin'),'postgres');
 assert.equal(sql(`select count(*) from pg_stat_activity where datname='${template}';`,'postgres','supabase_admin'),'0');
 assert.equal(sql('select (select count(*) from public.shops)+(select count(*) from public.inventory_products)+(select count(*) from public.inventory_product_prices)+(select count(*) from public.shared_sheet_sessions)+(select count(*) from public.sync_events);',template),'0');
 sql(`create database ${db} template ${template} owner postgres;`,'postgres','supabase_admin');created=true;
 for(const name of ['20260929013345_wechat_010_history_physical_normalization.sql','20260929013437_wechat_010_catalog_keyset_order.sql','20261001220355_wechat_010_recovery_checkpoint_performance.sql','20261001235153_wechat_010_history_timestamp_compatibility.sql','20261002005414_wechat_010_price_digest_performance.sql','20261002013745_wechat_010_checkpoint_integrity_performance.sql','20261002025317_wechat_010_checkpoint_pipeline_performance.sql'])sql(readFileSync(`supabase/migrations/${name}`,'utf8'));

 console.log('PASS isolated schema152 clone; PG17/UTF8; before synthetic setup');
 const checkpointSignature='public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)';
 const preflightSignature='app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)';
 const definitions=()=>sql(`select string_agg(pg_get_functiondef(oid)||';',E'\n'order by oid)from pg_proc where oid in('${checkpointSignature}'::regprocedure,'${preflightSignature}'::regprocedure);`);
 const attrs=()=>sql(`select jsonb_agg(to_jsonb(f)-'prosrc' order by oid) from pg_proc f where oid in('${checkpointSignature}'::regprocedure,'${preflightSignature}'::regprocedure);`);
 const other=()=>sql(`select md5(string_agg(to_jsonb(f)::text,E'\n' order by oid))from pg_proc f where pronamespace in('app_private'::regnamespace,'public'::regnamespace)and oid not in('${checkpointSignature}'::regprocedure,'${preflightSignature}'::regprocedure)and proname<>'sync_recovery_scalar_bytes_contract_v1';`);
 const oldDefinitions=definitions(),oldAttrs=attrs(),oldOther=other();
 const fingerprint=()=>sql("select md5(string_agg(value,E'\\n'order by value))from ("+['inventory_products','inventory_product_prices','inventory_suppliers','inventory_categories','shared_sheet_sessions','inventory_product_image_versions','sync_events'].map(t=>`select md5(to_jsonb(r)::text) value from public.${t} r`).join(' union all ')+")v;");
 const jsonTimestampDefinition=sql("select pg_get_functiondef('app_private.sync_checkpoint_json_timestamp(timestamptz)'::regprocedure);");
 const inTransaction=migration.replace('\nbegin;\nset local lock_timeout','\nset local lock_timeout').replace(/\ncommit;\s*$/,'\n');
 assert.throws(()=>sql(migration,db,'supabase_admin'),/preflight_price_bytes_baseline_mismatch/);
 for(const[label,setup,accepted]of[
 ['canonical ACL','',true],['TEST ACL',`grant execute on function ${checkpointSignature} to service_role;`,true],
 ['default PUBLIC ACL',`drop function app_private.sync_checkpoint_json_timestamp(timestamptz);${jsonTimestampDefinition};`,false],
 ['extra grant',`grant execute on function ${checkpointSignature} to anon;`,false],
 ['grant option',`grant execute on function ${checkpointSignature} to authenticated with grant option;`,false],
 ['checkpoint stable',`alter function ${checkpointSignature} stable;`,false],
 ['preflight signature',`alter function ${preflightSignature} rename to previous_preflight;`,false],
 ['dependency volatility','alter function app_private.sync_price_value_is_canonical_v1(double precision) volatile;',false],
 ['dependency strict','alter function app_private.sync_price_recovery_row_v1(uuid,uuid,uuid,text,double precision,text,text,text,text,uuid,timestamptz) strict;',false],
 ['dependency grant','grant execute on function app_private.sync_checkpoint_json_timestamp(timestamptz) to authenticated;',false],
 ['missing column','alter table public.inventory_product_prices rename column note to previous_note;',false],
 ['column type','alter table public.inventory_product_prices alter column price type numeric using price::numeric;',false],
 ]){
  const query=`begin;${setup}${inTransaction}rollback;`;
  if(accepted)sql(query);else assert.throws(()=>sql(query),/preflight_price_bytes_(baseline|dependency)_mismatch/,label);
  assert.equal(definitions(),oldDefinitions);assert.equal(attrs(),oldAttrs);assert.equal(other(),oldOther);
  assert.equal(sql(`select to_regprocedure('${helper}')is null;`),'t');console.log(`PASS guard ${label}: ${accepted?'accepted unchanged metadata':'atomic rejection'}`);
 }
 sql(migration.replace(/commit;\s*$/,'rollback;'));assert.equal(definitions(),oldDefinitions);assert.equal(other(),oldOther);

 sql(migration);
 for(const file of ['supabase/tests/wechat_010_preflight_price_bytes.sql','supabase/tests/wechat_010_history_timestamp_compatibility.sql','supabase/tests/cross_platform_sync_recovery_contract.sql']){
  const output=sql(readFileSync(file,'utf8'));assert.doesNotMatch(output,/^not ok/m,output);assert.match(output,/^1\.\.[1-9][0-9]*$/m);console.log(output);
 }
 sql(oldDefinitions);sql(`drop function ${helper};`);assert.equal(attrs(),oldAttrs);assert.equal(other(),oldOther);
 for(const stmt of fixture.split(';').filter(s=>s.trim())){
  const m=stmt.match(/generate_series\(1,(19832|41345)\)/);
  if(m){const n=Number(m[1]);for(let i=1;i<=n;i+=500)sql(stmt.replace(m[0],`generate_series(${i},${Math.min(i+499,n)})`)+';');}
  else if(stmt.includes('update public.inventory_products set primary_image_version_id=')) sql(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);${stmt};commit;`);
  else sql(stmt+';');
 }
 const eventCount=Number(sql(`select count(*)from public.sync_events where shop_id='${shop}';`));assert.ok(eventCount<=2074);
 sql(Array.from({length:2074-eventCount},(_,i)=>`update public.inventory_products set product_name='Synthetic event ${eventCount+i}'where id='23000000-0000-4000-8000-000000000166';`).join('\n')+'\nanalyze;');
 console.log('PASS synthetic61595 fixture created with retained parents/History shapes; no real data');
 const metadata=()=>sql("select to_jsonb(f)-'prosrc' from pg_proc f where oid='app_private.sync_recovery_preflight_counts_v1(uuid,text,uuid,uuid)'::regprocedure;");
 const before=metadata();const dataBefore=fingerprint();
 const baseline=timed('baseline preflight1',`select ${call};`);assert.equal(baseline.resourceExceeded,false);
 assert.deepEqual(timed('baseline preflight2',`select ${call};`),baseline);
 const full=timed('baseline complete checkpoint1',checkpoint());assert.equal(full.status,'ready');
 assert.deepEqual(timed('baseline complete checkpoint2',checkpoint()),full);
 sql(migration);assert.equal(metadata(),before);assert.equal(attrs(),oldAttrs);assert.equal(other(),oldOther);assert.equal(sql(`select ${helper};`),'t');
 const newDefinitions=definitions();
 assert.deepEqual(timed('candidate preflight1',`select ${call};`),baseline);
 assert.deepEqual(timed('candidate preflight2',`select ${call};`),baseline);
 assert.deepEqual(timed('candidate complete checkpoint1',checkpoint()),full);
 assert.deepEqual(timed('candidate complete checkpoint2',checkpoint()),full);
 for(const digits of [-15,0,1,3]){
 const vectors=sql(`set extra_float_digits=${digits};with vals(n) as(values(null::float8),('NaN'::float8),('Infinity'::float8),('-Infinity'::float8),('-0'::float8),(0::float8),(1.7976931348623157e308::float8),(-1.7976931348623157e308::float8),(4.9406564584124654e-324::float8),(-4.9406564584124654e-324::float8),(2.2250738585072014e-308::float8),(999999999999.999::float8)),dates(t)as(values(null::timestamptz),('infinity'::timestamptz),('-infinity'::timestamptz),('4713-01-01 BC'::timestamptz),('294276-12-31 23:59:59.999999+00'::timestamptz),('2026-10-02T01:02:03.123456Z'::timestamptz)),texts(t)as(values(null::text),(''),(repeat(chr(1),100)),(repeat(E'\\n"\\\\中文😀',100))) select jsonb_build_object('vectors',count(*),'maxScalar',max(coalesce(octet_length(to_jsonb(n)::text),4)),'maxTimestamp',max(coalesce(octet_length(to_jsonb(app_private.sync_checkpoint_json_timestamp(d.t))::text),4)),'productBound',bool_and(octet_length(app_private.sync_product_recovery_row_v1(null,null,x.t,x.t,x.t,x.t,n,n,null,null,n,d.t,d.t,null,null,d.t)::text)<=1714+24*coalesce(octet_length(x.t)::bigint,0)),'priceBound',bool_and(octet_length(app_private.sync_price_recovery_row_v1(null,null,null,x.t,n,x.t,x.t,x.t,x.t,null,d.t)::text)<=752+30*coalesce(octet_length(x.t)::bigint,0))) from vals cross join dates d cross join texts x;`);
 const v=JSON.parse(vectors);assert.equal(v.productBound,true);assert.equal(v.priceBound,true);assert.ok(v.maxScalar<=360);assert.ok(v.maxTimestamp<=31);console.log(`PASS bound vectors extra_float_digits=${digits}: ${vectors}`);
 }

 // Exact price aggregate equality on synthetic temporary rows, including unsafe
 // rows that must execute the original DTO fallback inside this statement.
 const queryOf=(definition)=>{
   const start=definition.indexOf('  with scoped as materialized (',definition.indexOf('-- One bounded price DTO'));
   const flat=definition.indexOf('  with raw_prices as materialized (',definition.indexOf('-- One bounded price DTO'));
   const contract=definition.indexOf('  with scalar_contract as materialized (',definition.indexOf('-- One bounded price DTO'));
   const begin=contract>=0?contract:flat>=0?flat:start;assert.ok(begin>=0);
   const finish=definition.indexOf('\n  with scoped as (',begin);
   return definition.slice(begin,finish).replace('  into v_prices\n','\n').replace(' end into v_prices;',' end;')
     .replaceAll('v_scope_kind',"'authorized_shop_plus_legacy'::text")
     .replaceAll('p_shop_id',`'${shop}'::uuid`).replaceAll('v_mapped_owner_id',`'${owner}'::uuid`)
     .replaceAll('public.inventory_product_prices','pg_temp.price_vectors')
     .replaceAll('public.inventory_products','pg_temp.product_vectors');
 };
 const oldPrice=queryOf(originalCheckpointSource);
 const newPrice=queryOf(candidateCheckpoint);
 const priceSetup=`create temp table product_vectors as select * from public.inventory_products where id='23000000-0000-4000-8000-000000000166';
 create temp table price_vectors as select * from public.inventory_product_prices with no data;
 insert into price_vectors(id,owner_user_id,shop_id,product_id,type,price,effective_at,created_at,source,note,updated_at)
 select ('29000000-0000-4000-8000-'||lpad(row_number()over()::text,12,'0'))::uuid,'${owner}','${shop}',
 '23000000-0000-4000-8000-000000000166',x.kind,n.value,x.effective,x.created,x.source,x.note,d.value
 from (values(null::float8),('NaN'::float8),('Infinity'::float8),('-Infinity'::float8),('-0'::float8),(0::float8),(0.001::float8),(4.9406564584124654e-324::float8),(1.7976931348623157e308::float8),(999999999999.999::float8))n(value)
 cross join (values(null::timestamptz),('infinity'::timestamptz),('-infinity'::timestamptz),('4713-01-01 BC'::timestamptz),('294276-12-31 23:59:59.999999Z'::timestamptz),('2026-10-02T01:02:03.123456Z'::timestamptz))d(value)
 cross join (values ('RETAIL','2026-10-02 01:02:03','2026-10-02 01:02:03',null::text,''),
 ('RETAIL','2026-10-02 01:02:03','2026-10-02 01:02:03','',null::text),
 ('RETAIL','2026-10-02 01:02:03','2026-10-02 01:02:03','é','é'),
 ('RETAIL','2026-10-02 01:02:03','2026-10-02 01:02:03',repeat(chr(1),10),repeat('中文😀',10)),
 (null::text,null::text,null::text,null::text,null::text),
 ('retail','bad','2026-02-30 01:02:03',repeat('界',12000),repeat(chr(1),8000)))x(kind,effective,created,source,note);`;
 for(const digits of [-15,0,1,3]){
   const out=sql(`begin;set local extra_float_digits=${digits};${priceSetup}${oldPrice}${newPrice}rollback;`).split('\n').map(JSON.parse);
   assert.equal(out.length,2);assert.deepEqual(out[1],out[0]);assert.ok(out[0].oversizeRowCount>0);
   console.log(`PASS price full aggregate exact with ${out[0].activeCount} NULL/Unicode/unsafe/nonfinite rows extra_float_digits=${digits}`);
 }
 // Test-only function copies replace only table references with unconstrained
 // temporary synthetic tables, allowing invalid-row contract vectors without
 // disabling any real trigger or relaxing a schema constraint.
 const tables=['inventory_suppliers','inventory_categories','inventory_products','inventory_product_prices','shared_sheet_sessions','inventory_product_image_versions'];
 const tempTables=tables.map(t=>`create temp table ${t} as select * from public.${t} with no data;`).join('\n');
 const copy=(source,name)=>{let result=source.replace('app_private.sync_recovery_preflight_counts_v1(',`pg_temp.${name}(`);for(const t of tables)result=result.replaceAll(`public.${t}`,`pg_temp.${t}`);return result;};
 const copies=copy(original,'before_preflight')+copy(candidate,'after_preflight');
 const prod=`insert into pg_temp.inventory_products(id,owner_user_id,shop_id,barcode,product_name,purchase_price,retail_price,stock_quantity,updated_at)values('23000000-0000-4000-8000-000000000001','${owner}','${shop}','B','N',1,2,3,'2026-10-02T01:02:03.123456Z');`;
 const price=`insert into pg_temp.inventory_product_prices(id,owner_user_id,shop_id,product_id,type,price,effective_at,created_at,source,note,updated_at)values('24000000-0000-4000-8000-000000000001','${owner}','${shop}','23000000-0000-4000-8000-000000000001','RETAIL',1,'2026-10-02 01:02:03','2026-10-02 01:02:03','source','note','2026-10-02T01:02:03.123456Z');`;
 const cases=[
 ['empty','',false],['bounded',prod+price,false],
 ['product upper unproven but valid',prod+"update pg_temp.inventory_products set product_name=repeat('a',11000);",false],
 ['price upper unproven but valid',price+"update pg_temp.inventory_product_prices set note=repeat('a',5400);",false],
 ['product null barcode',prod+"update pg_temp.inventory_products set barcode=null;",true],
 ['price null type',price+"update pg_temp.inventory_product_prices set type=null;",true],
 ['price null effective',price+"update pg_temp.inventory_product_prices set effective_at=null;",true],
 ['price null created',price+"update pg_temp.inventory_product_prices set created_at=null;",true],
 ['product oversize escape',prod+"update pg_temp.inventory_products set product_name=repeat(chr(1),16000);",true],
 ['price oversize escape',price+"update pg_temp.inventory_product_prices set note=repeat(chr(1),8000);",true],
 ['product storage violation before price',prod+price+"update pg_temp.inventory_products set product_name=repeat('界',23000);update pg_temp.inventory_product_prices set type=null;",true],
 ['price storage violation prefix',prod+price+"update pg_temp.inventory_product_prices set note=repeat('界',12000);",true],
 ['product invalid second prefix',prod+"insert into pg_temp.inventory_products select * from pg_temp.inventory_products;update pg_temp.inventory_products set id='23000000-0000-4000-8000-000000000002',product_name=repeat(chr(1),16000)where ctid=(select max(ctid)from pg_temp.inventory_products);",true],
 ['orphans included',price,false],
 ['legacy both',prod+price+"update pg_temp.inventory_products set shop_id=null;update pg_temp.inventory_product_prices set shop_id=null;",false],
 ];
 for(const [label,setup,exceeded]of cases){
  const out=sql(`begin;${tempTables}${setup}${copies}select pg_temp.before_preflight('${shop}','authorized_shop_plus_legacy','${owner}','${owner}');select pg_temp.after_preflight('${shop}','authorized_shop_plus_legacy','${owner}','${owner}');rollback;`).split('\n').map(JSON.parse);
  assert.equal(out.length,2);assert.deepEqual(out[1],out[0],label);assert.equal(out[0].resourceExceeded,exceeded,label);console.log(`PASS original/candidate full preflight fallback ${label}`);
 }
 sql(original);assert.equal(metadata(),before);assert.deepEqual(timed('rollback original preflight',`select ${call};`),baseline);

 sql(candidate);assert.equal(metadata(),before);assert.equal(attrs(),oldAttrs);assert.equal(other(),oldOther);
 for(const[label,definition]of[['original',oldDefinitions],['candidate',newDefinitions]]){
  sql(definition);
  const output=sql(`begin;set local statement_timeout='8s';set local plan_cache_mode='force_generic_plan';select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;${Array.from({length:6},()=>`select public.shop_sync_recovery_checkpoint_v1('${shop}','checkpoint-perf-local');`).join('\n')}rollback;`).split('\n').slice(1).map(JSON.parse);
  assert.equal(output.length,6);for(const v of output)assert.deepEqual(v,full);console.log(`PASS ${label} six pooled generic complete checkpoints under8s`);
 }
 // Dependency drift must switch off the optimized path, without changing any
 // grant or persistent row. The original price SELECT remains authoritative.

 for(const[name,sig]of[
 ['price','app_private.sync_price_recovery_row_v1(uuid,uuid,uuid,text,double precision,text,text,text,text,uuid,timestamptz)'],
 ['product','app_private.sync_product_recovery_row_v1(uuid,uuid,text,text,text,text,double precision,double precision,uuid,uuid,double precision,timestamptz,timestamptz,uuid,uuid,timestamptz)'],
 ]){
  const dto=sql(`select pg_get_functiondef('${sig}'::regprocedure);`);
  const altered=dto.replace(/\$function\$[\s\S]*\$function\$/,`$function$begin return jsonb_build_object('fixture_new_contract',1);end;$function$`)+';';
  assert.equal(sql(`begin;${altered}select ${helper};rollback;`),'f');
  const values=sql(`begin;${altered}${tempTables}${prod}${price}${copies}select pg_temp.before_preflight('${shop}','authorized_shop_plus_legacy','${owner}','${owner}');select pg_temp.after_preflight('${shop}','authorized_shop_plus_legacy','${owner}','${owner}');rollback;`).split('\n').map(JSON.parse);
  assert.deepEqual(values[1],values[0]);
  if(name==='price'){
   const out=sql(`begin;${altered}${priceSetup}${oldPrice}${newPrice}rollback;`).split('\n').map(JSON.parse);assert.deepEqual(out[1],out[0]);
  }
  assert.equal(sql(`select ${helper};`),'t');console.log(`PASS runtime ${name} DTO shape drift: exact preflight and original price fallback`);
 }
 for(const[label,setup]of[
 ['missing column','alter table public.inventory_product_prices rename column note to previous_note;'],
 ['dependency volatility','alter function app_private.sync_price_value_is_canonical_v1(double precision) volatile;'],
 ]){
  assert.equal(sql(`begin;${setup}select ${helper};rollback;`),'f',label);
  assert.equal(sql(`select ${helper};`),'t');console.log(`PASS runtime contract drift ${label}: original fallback`);
 }
 const uniqueSetup=`create temp table product_vectors as select * from public.inventory_products;create temp table price_vectors as select * from public.inventory_product_prices;
 with numbered as(select id,row_number()over(order by id)n from price_vectors)update price_vectors p set price=numbered.n::float8/1000,updated_at=timestamptz '2026-10-02T01:00:00Z'+numbered.n*interval '1 microsecond',source='Unique source '||numbered.n,note='Unique note '||numbered.n from numbered where numbered.id=p.id;analyze product_vectors;analyze price_vectors;`;
 const unique=sql(`begin;set local statement_timeout='8s';${uniqueSetup}${oldPrice}${newPrice}rollback;`).split('\n').map(JSON.parse);assert.deepEqual(unique[1],unique[0]);console.log(`PASS ${unique[0].activeCount} all-unique numeric/update/text prices: original/candidate aggregate identical under8s each`);
 const scopes=`(values('shop_scoped'::text),('legacy_owner_bridge'),('authorized_shop_plus_legacy'),('unknown'),(null))s(value)`;
 const shops=`(values('${shop}'::uuid),('10000000-0000-4000-8000-000000009999'::uuid),(null))h(value)`;
 const owners=`(values('${owner}'::uuid),('00000000-0000-4000-8000-000000009999'::uuid),(null))o(value)`;
 const mixed=prod+price+`insert into pg_temp.inventory_products select *from pg_temp.inventory_products;insert into pg_temp.inventory_product_prices select *from pg_temp.inventory_product_prices;insert into pg_temp.inventory_products select *from pg_temp.inventory_products;insert into pg_temp.inventory_product_prices select *from pg_temp.inventory_product_prices;update pg_temp.inventory_products set shop_id=null where ctid in(select ctid from pg_temp.inventory_products limit 2);update pg_temp.inventory_product_prices set shop_id=null where ctid in(select ctid from pg_temp.inventory_product_prices limit 2);`;
 for(const cap of[false,true]){
  const sourceCopies=cap?copies.replaceAll('app_private.sync_recovery_row_count_limit_v1(', 'pg_temp.fixture_count_limit('):copies;
  const limitHelper=cap?"create function pg_temp.fixture_count_limit(text)returns integer language sql immutable as 'select 2';":'';
  const values=JSON.parse(sql(`begin;${tempTables}${mixed}${limitHelper}${sourceCopies}select jsonb_agg(jsonb_build_object('before',pg_temp.before_preflight(h.value,s.value,o.value,o.value),'after',pg_temp.after_preflight(h.value,s.value,o.value,o.value)))from ${scopes}cross join ${shops}cross join ${owners};rollback;`));
  assert.equal(values.length,45);for(const row of values)assert.deepEqual(row.after,row.before);if(cap)assert.ok(values.some(v=>v.before.resourceExceeded));console.log(`PASS 45 scope/NULL/unknown count cases ${cap?'at one outer cap+1':'canonical budgets'}`);
 }
 const acl=JSON.parse(sql(`select jsonb_build_object('invoker',not prosecdef,'owner',pg_get_userbyid(proowner),'acl',(select jsonb_agg(a::text order by a::text collate "C")from unnest(proacl)a))from pg_proc where oid='${helper}'::regprocedure;`));
 assert.deepEqual(acl,{invoker:true,owner:'postgres',acl:['postgres=X/postgres']});
 for(const role of ['anon','authenticated','service_role'])assert.throws(()=>sql(`begin;set local role ${role};select ${helper};rollback;`),/permission denied/);
 assert.equal(attrs(),oldAttrs);assert.equal(other(),oldOther);assert.equal(fingerprint(),dataBefore);
 console.log('PASS fullJSON/bounds/metadata/ACL/fallback/generic/rollback; local synthetic only');

}finally{if(created)sql(`drop database ${db};`,'postgres','supabase_admin');}
