// Local-only checkpoint-integrity regression and complete checkpoint benchmark. Synthetic rows only.
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
const database = `wechat010_integrity_${process.pid}`;
const sql = (input, db = database, role = 'postgres') => execFileSync(docker, [
  '--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-X', '-qAt',
  '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db,
], { input, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim();
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const migration = readFileSync('supabase/migrations/20261002011223_wechat_010_checkpoint_integrity_performance.sql', 'utf8');
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
const where = `oid = ${literal(checkpointSignature)}::regprocedure`;
const definitions = () => sql(`select string_agg(pg_get_functiondef(oid)||';', E'\n' order by proname) from pg_proc where ${where};`);
const checkpointDefinition = () => sql(`select pg_get_functiondef(${literal(checkpointSignature)}::regprocedure);`);
// Every target attribute except prosrc remains byte-for-byte equal.
const attributes = () => sql(`select jsonb_agg(to_jsonb(f)-'prosrc' order by proname) from pg_proc f where ${where};`);
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
function integrityBlock(definition) {
  const end = definition.indexOf('  into v_integrity;') + '  into v_integrity;'.length;
  const start = definition.lastIndexOf('  with scoped_products as (', end);
  assert.ok(start >= 0 && end > start);
  return definition.slice(start, end);
}
function integrityQuery(definition) {
  return integrityBlock(definition).replace('  into v_integrity;', ';')
    .replaceAll('v_scope_kind', "'authorized_shop_plus_legacy'::text")
    .replaceAll('p_shop_id', `${literal(shop)}::uuid`)
    .replaceAll('v_mapped_owner_id', `${literal(account)}::uuid`)
    .replaceAll('v_authorized_legacy_owner_id', `${literal(account)}::uuid`);
}
function readCheckpoint(label, baseline = '0', scope = null, budget = '8s') {
  const start = performance.now();
  const result = JSON.parse(sql(`set statement_timeout=${literal(budget)};
    select set_config('request.jwt.claim.sub',${literal(account)},false); set role authenticated;
    select public.shop_sync_recovery_checkpoint_v1(${literal(shop)},'checkpoint-perf-local',
      ${literal(baseline)},${scope === null ? 'null' : literal(scope)});`).split('\n').at(-1));
  const elapsedMs = Math.round(performance.now() - start);
  results.push({ label, elapsedMs, status: result.status });
  assert.equal(result.status, 'ready');
  console.log(`PASS ${label}: ${elapsedMs}ms, full JSON SHA256 ${hash(JSON.stringify(result))}`);
  return result;
}
function trackedIntegrity(definition, fixtureSql = '', vectors = false) {
  let query = integrityQuery(definition);
  if (vectors) query = query.replaceAll('public.inventory_product_prices price', 'integrity_prices price')
    .replaceAll('public.inventory_products product', 'integrity_products product');
  // Real transaction-local counters; no validator or business trigger is replaced.
  const output = sql(`begin; set local track_functions='all'; set local statement_timeout='8s'; ${fixtureSql}
    ${query}
    select coalesce(jsonb_object_agg(funcname,calls),'{}'::jsonb) from pg_stat_xact_user_functions
      where funcname in ('sync_product_number_is_materializable_v1','sync_price_value_is_canonical_v1','sync_legacy_timestamp_is_canonical_v1');
    rollback;`).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(output.length, 2);
  return { value: output[0], calls: output[1] };
}
function runTap(path) {
  const output = sql(readFileSync(path, 'utf8'));
  assert.doesNotMatch(output, /^not ok/m, output);
  assert.match(output, /^1\.\.[1-9][0-9]*$/m);
  console.log(output);
}
let created = false;
try {
  assert.equal(sql(`select pg_get_userbyid(datdba) from pg_database where datname=${literal(template)};`, 'postgres', 'supabase_admin'), 'postgres');
  assert.equal(sql(`select count(*) from pg_stat_activity where datname=${literal(template)};`, 'postgres', 'supabase_admin'), '0');
  assert.equal(sql('select (select count(*) from public.shops)+(select count(*) from public.inventory_products)+(select count(*) from public.inventory_product_prices)+(select count(*) from public.shared_sheet_sessions)+(select count(*) from public.sync_events);', template), '0');
  sql(`create database ${database} template ${template} owner postgres;`, 'postgres', 'supabase_admin'); created = true;
  for (const file of ['20260929013345_wechat_010_history_physical_normalization.sql','20260929013437_wechat_010_catalog_keyset_order.sql','20261001220355_wechat_010_recovery_checkpoint_performance.sql','20261001235153_wechat_010_history_timestamp_compatibility.sql','20261002005414_wechat_010_price_digest_performance.sql']) {
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  console.log('PASS local schema-only template owner/activity/empty inventory; five prior applied contracts installed.');
  const original = definitions(), originalCheckpoint = checkpointDefinition(), oldAttributes = attributes(), oldOther = unaffected();
  const inTransaction = migration.replace('\nbegin;\nset local lock_timeout', '\nset local lock_timeout').replace(/\ncommit;\s*$/, '\n');
  assert.throws(() => sql(migration, database, 'supabase_admin'), /checkpoint_integrity_performance_baseline_mismatch/);
  for (const [label, setup, accepted] of [
    ['canonical ACL', '', true],
    ['TEST ACL', `grant execute on function ${checkpointSignature} to service_role;`, true],
    ['TEST reordered', `revoke execute on function ${checkpointSignature} from authenticated; grant execute on function ${checkpointSignature} to service_role; grant execute on function ${checkpointSignature} to authenticated;`, true],
    ['extra grantee', `grant execute on function ${checkpointSignature} to anon;`, false],
    ['grant option', `grant execute on function ${checkpointSignature} to authenticated with grant option;`, false],
    ['volatility drift', `alter function ${checkpointSignature} stable;`, false],
    ['signature drift', `alter function ${checkpointSignature} rename to checkpoint_previous;`, false],
    ['predicate volatility drift', 'alter function app_private.sync_price_value_is_canonical_v1(double precision) stable;', false],
    ['predicate source drift', "create or replace function app_private.sync_price_value_is_canonical_v1(p_price double precision) returns boolean language plpgsql immutable parallel safe set search_path=pg_catalog,pg_temp as 'begin return true; end;';", false],
  ]) {
    const metadata = `select jsonb_agg(to_jsonb(f)-'prosrc' order by proname) from pg_proc f where ${where};`;
    const query = `begin; ${setup} ${accepted ? metadata : ''} ${inTransaction} ${accepted ? metadata : ''} rollback;`;
    if (accepted) {
      const [before, after] = sql(query).split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(after, before, label);
    } else assert.throws(() => sql(query), /checkpoint_integrity_performance_(baseline|predicate)_mismatch/, label);
    assert.equal(definitions(), original);
    assert.equal(attributes(), oldAttributes);
    assert.equal(unaffected(), oldOther);
    console.log(`PASS baseline ${label}: ${accepted ? 'preserved' : 'rejected atomically'}`);
  }
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  assert.equal(definitions(), original);
  sql(migration);
  const candidate = definitions(), candidateCheckpoint = checkpointDefinition();
  const stripComments = (s) => s.split('\n').filter((line) => line.trim() && !line.trim().startsWith('--')).join('\n').trim();
  assert.equal(stripComments(candidateCheckpoint.replace(integrityBlock(candidateCheckpoint), 'INTEGRITY_BLOCK')),
    stripComments(originalCheckpoint.replace(integrityBlock(originalCheckpoint), 'INTEGRITY_BLOCK')), 'another checkpoint section changed');
  assert.equal(attributes(), oldAttributes);
  assert.equal(unaffected(), oldOther);
  runTap('supabase/tests/wechat_010_checkpoint_integrity_performance.sql');
  runTap('supabase/tests/wechat_010_history_timestamp_compatibility.sql');
  runTap('supabase/tests/cross_platform_sync_recovery_contract.sql');
  for (const statement of fixture.split(';').filter((s) => s.trim())) {
    if (statement.includes('generate_series(1,19832)')) {
      for (let i = 1; i <= 19832; i += 500) sql(statement.replace('generate_series(1,19832)', `generate_series(${i},${Math.min(i+499,19832)})`)+';');
    } else if (statement.includes('generate_series(1,41345)')) {
      for (let i = 1; i <= 41345; i += 1000) sql(statement.replace('generate_series(1,41345)', `generate_series(${i},${Math.min(i+999,41345)})`)+';');
    } else if (statement.includes('update public.inventory_products set primary_image_version_id=')) {
      // Local synthetic fixture uses the normal server-managed image guard.
      sql(`begin; select set_config('request.jwt.claims','{"role":"service_role"}',true); ${statement}; commit;`);
    } else sql(statement+';');
  }
  const addEventsUntil = (target) => {
    const current = Number(sql(`select count(*) from public.sync_events where shop_id='${shop}';`));
    assert.ok(current <= target);
    sql(Array.from({length:target-current}, (_,i) => `update public.inventory_products set product_name='Synthetic event ${current+i}' where id='23000000-0000-4000-8000-000000000166';`).join('\n')+'\nanalyze;');
  };
  addEventsUntil(2074);
  const fixtureMetadata = JSON.parse(sql(`select jsonb_build_object(
    'products',(select count(*) from inventory_products),'activeProducts',(select count(*) from inventory_products where deleted_at is null),
    'linkedProducts',(select count(*) from inventory_products where category_id is not null and supplier_id is not null),
    'prices',(select count(*) from inventory_product_prices),'distinctPrices',(select count(distinct price) from inventory_product_prices),
    'history',(select count(*) from shared_sheet_sessions),'activeHistory',(select count(*) from shared_sheet_sessions where deleted_at is null),
    'historyArrayRows',(select sum(jsonb_array_length(data)) from shared_sheet_sessions),
    'historyDataBytes',(select sum(octet_length(data::text)) from shared_sheet_sessions),
    'historyOverlayBytes',(select sum(octet_length(session_overlay::text)) from shared_sheet_sessions),
    'imageVersions',(select count(*) from inventory_product_image_versions));`));
  assert.equal(fixtureMetadata.products,19832); assert.equal(fixtureMetadata.activeProducts,19772);
  assert.equal(fixtureMetadata.linkedProducts,19811); assert.equal(fixtureMetadata.prices,41345);
  assert.equal(fixtureMetadata.distinctPrices,1142); assert.equal(fixtureMetadata.history,178);
  assert.equal(fixtureMetadata.activeHistory,83); assert.equal(fixtureMetadata.historyArrayRows,1437);
  assert.equal(fixtureMetadata.imageVersions,1);
  console.log(`PASS representative synthetic counts ${JSON.stringify(fixtureMetadata)}`);
  const dataBefore = fingerprint();
  sql(original);
  const cold = readCheckpoint('original-first');
  assert.equal(cold.prices.activeCount, 41345);
  assert.equal(cold.scope.kind, 'authorized_shop_plus_legacy');
  for (let i=0;i<2;i++) assert.deepEqual(readCheckpoint(`original-repeat-${i}`), cold);
  const oldCalls = trackedIntegrity(originalCheckpoint);
  assert.equal(oldCalls.calls.sync_price_value_is_canonical_v1,41345);
  assert.equal(oldCalls.calls.sync_product_number_is_materializable_v1,59496);
  assert.equal(oldCalls.calls.sync_legacy_timestamp_is_canonical_v1,82773);
  assert.throws(() => assert.equal(oldCalls.calls.sync_price_value_is_canonical_v1,1142));
  console.log(`PASS RED repeated integrity predicate calls ${JSON.stringify(oldCalls.calls)}`);
  sql(migration);
  const fixed = readCheckpoint('fixed-first');
  assert.deepEqual(fixed, cold);
  for (let i=0;i<2;i++) assert.deepEqual(readCheckpoint(`fixed-repeat-${i}`), cold);
  const newCalls = trackedIntegrity(candidateCheckpoint);
  assert.deepEqual(newCalls.value, oldCalls.value);
  assert.equal(newCalls.calls.sync_price_value_is_canonical_v1,1142);
  assert.equal(newCalls.calls.sync_product_number_is_materializable_v1,1345);
  assert.equal(newCalls.calls.sync_legacy_timestamp_is_canonical_v1,1407);
  console.log(`PASS GREEN statement-local distinct calls ${JSON.stringify(newCalls.calls)}; all integrity counts/full JSON exactly equal.`);
  const scope = cold.scope.key, max = cold.syncEvents.maxId;
  const current = readCheckpoint('fixed-current-baseline', max, scope);
  sql(original);
  assert.deepEqual(readCheckpoint('original-current-baseline', max, scope), current);
  sql(candidate);
  // Constraint-free temporary projections exercise invalid inputs without
  // weakening a business trigger or storing malformed canonical rows.
  const vectorSetup = `create temporary table integrity_prices on commit drop as
    select p.* from public.inventory_product_prices p order by id limit 64;
    create temporary table integrity_products on commit drop as
    select p.* from public.inventory_products p order by id limit 64;
    with values_by_id as (select id,row_number() over(order by id) n from integrity_prices)
    update integrity_prices p set effective_at=case n%8 when 0 then null when 1 then ''
      when 2 then '2026-02-30 01:00:00' when 3 then '2026-09-29T01:00:00.123Z'
      when 4 then '2026-09-29 01:00:00 ' when 5 then '0000-01-01 00:00:00'
      when 6 then '2024-02-29 12:30:59' else '2026-09-29 01:00:00' end,
      created_at=case n%3 when 0 then null when 1 then 'invalid 中文' else '2026-09-29 01:00:00' end,
      price=(array[null,'NaN'::float8,'Infinity'::float8,'-Infinity'::float8,-1,1.2345,0,'-0'::float8,
        999999999999.999,1000000000000,'1e-300'::float8,1.234,1.000000000000001,1.0000000000000002])[1+n%14],
      source=case when n%2=0 then null else repeat('x',257) end,
      note=case when n%2=0 then '' else repeat('x',8193) end,
      product_id=case when n%5=0 then '23000000-0000-4000-8000-999999999999'::uuid else p.product_id end
    from values_by_id v where p.id=v.id;
    with values_by_id as (select id,row_number() over(order by id) n from integrity_products)
    update integrity_products p set purchase_price=(array[null,'NaN'::float8,'Infinity'::float8,'-Infinity'::float8,-1,0,'-0'::float8,'1e-300'::float8,'1e300'::float8,1.2345])[1+n%10],
      retail_price=case when n%2=0 then null else p.retail_price end,
      stock_quantity=case when n%3=0 then -1 else p.stock_quantity end,
      category_id=case when n%5=0 then '22000000-0000-4000-8000-999999999999'::uuid else p.category_id end,
      supplier_id=case when n%7=0 then '21000000-0000-4000-8000-999999999999'::uuid else p.supplier_id end,
      barcode=case when n%4=0 then 'duplicate' else p.barcode end,
      updated_at=case when n%8=0 then 'infinity'::timestamptz else p.updated_at end
    from values_by_id v where p.id=v.id;`;
  for (const setup of [vectorSetup, vectorSetup+'delete from integrity_prices;delete from integrity_products;']) {
    const old = trackedIntegrity(originalCheckpoint, setup, true);
    const result = trackedIntegrity(candidateCheckpoint, setup, true);
    assert.deepEqual(result.value, old.value);
  }
  console.log('PASS exact NULL/NaN/Infinity/-Infinity/-0/0/subnormal/rounding/huge/invalid timestamp/missing parent/duplicate/empty integrity counts.');
  const uniqueSetup = `create temporary table integrity_prices on commit drop as select p.* from public.inventory_product_prices p;
    create temporary table integrity_products on commit drop as select p.* from public.inventory_products p;
    with numbered as(select id,row_number() over(order by id) n from integrity_prices)
    update integrity_prices p set price=n/1000.0,effective_at=to_char(timestamp '2026-01-01'+n*interval '1 second','YYYY-MM-DD HH24:MI:SS'),
      created_at=to_char(timestamp '2025-01-01'+n*interval '1 second','YYYY-MM-DD HH24:MI:SS') from numbered v where p.id=v.id;
    with numbered as(select id,row_number() over(order by id) n from integrity_products)
    update integrity_products p set purchase_price=n,retail_price=20000+n,stock_quantity=40000+n from numbered v where p.id=v.id;`;
  const uniqueOld = trackedIntegrity(originalCheckpoint, uniqueSetup, true);
  const uniqueNew = trackedIntegrity(candidateCheckpoint, uniqueSetup, true);
  assert.deepEqual(uniqueNew.value, uniqueOld.value);
  assert.equal(uniqueNew.calls.sync_price_value_is_canonical_v1,41345);
  assert.equal(uniqueNew.calls.sync_product_number_is_materializable_v1,59496);
  assert.equal(uniqueNew.calls.sync_legacy_timestamp_is_canonical_v1,82773);
  console.log('PASS all-unique distribution within8s with every distinct input still validated.');
  assert.equal(fingerprint(), dataBefore);
  // Same backend and forced generic-plan checks model a pooled RPC session.
  const pooled = (definition,mode) => {
    sql(definition);
    const output=sql(`begin; set local statement_timeout='8s'; set local plan_cache_mode=${literal(mode)};
      select set_config('request.jwt.claim.sub','${account}',true); set local role authenticated;
      ${Array.from({length:6},()=>`select public.shop_sync_recovery_checkpoint_v1('${shop}','checkpoint-perf-local','0',null);`).join('\n')}
      rollback;`).split('\n').slice(1).map((line)=>JSON.parse(line));
    assert.equal(output.length,6); for(const value of output) assert.deepEqual(value,cold);
  };
  pooled(original,'force_generic_plan'); pooled(candidate,'force_generic_plan');
  console.log('PASS six same-backend generic-plan calls per version, exact full JSON and each8s deadline.');
  addEventsUntil(10001);
  const capped = readCheckpoint('fixed-10001-event-boundary');
  assert.equal(capped.syncEvents.inspectedCount, 10000);
  assert.equal(capped.syncEvents.scanComplete, false);
  assert.equal(capped.syncEvents.requiresFullRecovery, true);
  sql(original);
  assert.deepEqual(readCheckpoint('original-10001-event-boundary'), capped);
  const finalData = fingerprint();
  sql(migration);
  assert.equal(definitions(), candidate);
  assert.equal(fingerprint(), finalData);
  assert.equal(attributes(), oldAttributes);
  assert.equal(unaffected(), oldOther);
  console.log('PASS full output/digest/scope/event cap, unchanged metadata/OID/ACL/helpers/data and exact rollback/reapply.');
  console.log(JSON.stringify({syntheticRows:61595,fixtureMetadata,deadlineMilliseconds:8000,results},null,2));
} finally {
  if (created) sql(`drop database ${database} with (force);`, 'postgres', 'supabase_admin');
}
