// Local-only complete checkpoint regression and benchmark; no database URL or remote target.
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
const database = `wechat010_checkpoint_performance_${process.pid}`;
const sql = (input, db = database, role = 'postgres') => execFileSync(docker, [
  '--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-X', '-qAt',
  '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db,
], { input, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim();
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const migration = readFileSync('supabase/migrations/20261001220355_wechat_010_recovery_checkpoint_performance.sql', 'utf8');
const names = ['sync_checkpoint_json_timestamp', 'sync_price_recovery_row_v1', 'sync_checkpoint_timestamp',
  'sync_checkpoint_chain_step_v1', 'sync_checkpoint_sha256', 'sync_product_recovery_row_v1'];
const where = `pronamespace='app_private'::regnamespace and proname in (${names.map(literal).join(',')})`;
const definitions = () => sql(`select string_agg(pg_get_functiondef(oid)||';', E'\n' order by proname) from pg_proc where ${where};`);
// Exclude only implementation language/body: identity, owner, ACL, configuration,
// strictness, volatility, parallel safety, cost, result type and argument names stay exact.
const attributes = () => sql(`select jsonb_agg(to_jsonb(f)-'prolang'-'prosrc' order by proname) from pg_proc f where ${where};`);
const unaffected = () => sql(`select encode(extensions.digest(string_agg(to_jsonb(f)::text, E'\\n' order by oid),'sha256'),'hex') from pg_proc f
  where pronamespace in ('app_private'::regnamespace,'public'::regnamespace) and not (${where});`);
const bodies = () => JSON.parse(sql(`select jsonb_object_agg(proname,prosrc) from pg_proc where ${where};`));
const dataFingerprint = () => sql(`select encode(extensions.digest(string_agg(fingerprint, ',' order by name),'sha256'),'hex') from (${['inventory_suppliers','inventory_categories','inventory_products','inventory_product_prices','shared_sheet_sessions','sync_events'].map((table) => `select '${table}' name, md5(string_agg(md5(to_jsonb(row)::text),',' order by md5(to_jsonb(row)::text))) fingerprint from public.${table} row`).join(' union all ')}) fingerprints;`);
const indexes = ['inventory_products_sync_event_id_text_idx', 'inventory_product_prices_sync_event_id_text_idx'];
const account = '00000000-0000-4000-8000-000000009201';
const shop = '10000000-0000-4000-8000-000000009201';
const checkpoint = (baseline = '0', scope = null) => `select set_config('request.jwt.claim.sub','${account}',false);
 select public.shop_sync_recovery_checkpoint_v1('${shop}','checkpoint-perf-local',${literal(baseline)},${scope === null ? 'null' : literal(scope)});`;
const results = [];
function readCheckpoint(label, baseline = '0', scope = null, timeout = '8s') {
  const start = performance.now();
  const result = JSON.parse(sql(`set statement_timeout=${literal(timeout)}; ${checkpoint(baseline, scope)}`).split('\n').at(-1));
  const milliseconds = Math.round(performance.now() - start);
  results.push({ label, milliseconds, status: result.status, inspected: result.syncEvents.inspectedCount });
  console.log(`PASS ${label}: ${milliseconds}ms, status=${result.status}, inspected=${result.syncEvents.inspectedCount}`);
  return result;
}
const vectors = `
select jsonb_build_object(
 'timestamps', (select jsonb_agg(jsonb_build_array(
   app_private.sync_checkpoint_timestamp(t), app_private.sync_checkpoint_json_timestamp(t)) order by n)
  from (values (1,null::timestamptz),(2,'infinity'::timestamptz),(3,'-infinity'::timestamptz),
    (4,'2026-07-27T08:42:28.893668+04:30'::timestamptz),(5,'0001-01-01T00:00:00Z'::timestamptz)) v(n,t)),
 'hashes', (select jsonb_agg(jsonb_build_array(app_private.sync_checkpoint_sha256(t),
   app_private.sync_checkpoint_chain_step_v1(null,t),app_private.sync_checkpoint_chain_step_v1('',t),
   app_private.sync_checkpoint_chain_step_v1(repeat('a',64),t)) order by n)
   from (values(1,null::text),(2,''),(3,E'中文😀é\\n\\x1f:'))v(n,t)),
 'prices', (select jsonb_agg(app_private.sync_price_recovery_row_v1(
  '${account}','${account}','${account}','RETAIL',v,'2026-09-29 01:00:00','中文',E'line\\n2',
  '2026-09-29 01:00:00','${shop}','2026-09-29T01:00:00.123456Z') order by n)
  from(values(1,null::float8),(2,0::float8),(3,-0.0::float8),(4,1.2345::float8),
   (5,'NaN'::float8),(6,'Infinity'::float8),(7,'-Infinity'::float8),(8,999999999.9999::float8))v(n,v)),
 'products', (select jsonb_agg(app_private.sync_product_recovery_row_v1(
  '${account}','${account}','中文𠀀','item','Name',null,1.23,4.56,'${account}','${account}',0,
  '2026-09-29T01:00:00.123456Z',d,'${shop}','${account}','2026-09-29T01:00:00.123456Z') order by n)
  from(values(1,null::timestamptz),(2,'2026-09-29T02:00:00Z'::timestamptz))v(n,d))
);`;
const fixture = `

 insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009201','authenticated','authenticated','{}','{}',now(),now());
 update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000009201';
 insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000009201','PERFLOCAL','Synthetic performance shop','active');
 insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values('00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','shop_owner','active');
 insert into public.shop_devices(shop_id,device_identifier,device_type,display_name,status) values('10000000-0000-4000-8000-000000009201','checkpoint-perf-local','mobile','Synthetic local device','active');
 insert into public.inventory_suppliers(id,owner_user_id,shop_id,name) select ('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Supplier '||i from generate_series(1,78)i;
 insert into public.inventory_categories(id,owner_user_id,shop_id,name) select ('22000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Category '||i from generate_series(1,50)i;
 insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,second_product_name,item_number,stock_quantity,purchase_price,retail_price) select ('23000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','PERF-'||i,repeat('Synthetic product 中文 ',3)||i,'Second name '||i,'Item-'||i,3.5,1000,2000 from generate_series(1,20106)i;
 insert into public.inventory_product_prices(id,owner_user_id,shop_id,product_id,type,price,effective_at,created_at,source,note) select ('24000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201',('23000000-0000-4000-8000-'||lpad(((i-1)%20106+1)::text,12,'0'))::uuid,'RETAIL',1000+(i%3000),to_char(timestamp '2026-09-29 01:00:00'+i*interval '1 second','YYYY-MM-DD HH24:MI:SS'),'2026-09-29 01:00:00','local-synthetic','Bounded price note '||i from generate_series(1,41345)i;
 insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name,updated_at) select '25000000-0000-4000-8000-'||lpad(i::text,12,'0'),2,'2026-09-29 01:00:00','Synthetic','Synthetic',false,'[["bounded history"]]'::jsonb,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Synthetic history','2026-09-29T01:00:00.123456Z' from generate_series(1,16)i;
 analyze;

`;
let created = false;
try {
  assert.equal(sql(`select pg_get_userbyid(datdba) from pg_database where datname=${literal(template)};`, 'postgres', 'supabase_admin'), 'postgres');
  assert.equal(sql(`select count(*) from pg_stat_activity where datname=${literal(template)};`, 'postgres', 'supabase_admin'), '0');
  assert.equal(sql('select (select count(*) from public.shops)+(select count(*) from public.inventory_products)+(select count(*) from public.inventory_product_prices)+(select count(*) from public.shared_sheet_sessions)+(select count(*) from public.sync_events);', template), '0');
  sql(`create database ${database} template ${template} owner postgres;`, 'postgres', 'supabase_admin'); created = true;
  for (const file of ['20260929013345_wechat_010_history_physical_normalization.sql', '20260929013437_wechat_010_catalog_keyset_order.sql']) {
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  console.log('PASS: local schema-only template has no business data; disposable clone owned by postgres.');
  const oldDefinitions = definitions(), oldAttributes = attributes(), oldUnaffected = unaffected(), oldBodies = bodies();
  const oldVectors = sql(`set timezone='Pacific/Chatham'; ${vectors}`);
  assert.throws(() => sql(migration, database, 'supabase_admin'), /recovery_checkpoint_performance_baseline_mismatch/);
  assert.equal(definitions(), oldDefinitions);
  assert.throws(() => sql(`begin; grant execute on function app_private.sync_checkpoint_sha256(text) to authenticated; ${migration}`), /recovery_checkpoint_performance_baseline_mismatch/);
  assert.equal(attributes(), oldAttributes, 'rejected ACL drift escaped transaction rollback');
  const shaDefinition = sql("select pg_get_functiondef('app_private.sync_checkpoint_sha256(text)'::regprocedure);");
  const wrongSignature = shaDefinition.replace('(p_value text)', '(p_value character varying)');
  assert.notEqual(wrongSignature, shaDefinition);
  assert.throws(() => sql(`begin;
    alter function app_private.sync_checkpoint_sha256(text) rename to checkpoint_performance_old_sha;
    ${wrongSignature}; revoke all on function app_private.sync_checkpoint_sha256(character varying) from public, anon, authenticated, service_role;
    ${migration}`), /recovery_checkpoint_performance_baseline_mismatch/);
  assert.equal(definitions(), oldDefinitions, 'signature-drift rejection must restore original identity');
  assert.equal(attributes(), oldAttributes);
  for (const name of indexes) assert.equal(sql(`select to_regclass('public.${name}') is null;`), 't');
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  assert.equal(definitions(), oldDefinitions);
  for (const name of indexes) assert.equal(sql(`select to_regclass('public.${name}') is null;`), 't');
  console.log('PASS: wrong deploy role/ACL/signature rejected atomically; transactional DDL rollback restores helper bodies and removes indexes.');
  sql(migration);
  const tap = sql(readFileSync('supabase/tests/cross_platform_sync_recovery_contract.sql', 'utf8'));
  assert.doesNotMatch(tap, /^not ok/m, tap);
  assert.match(tap, /^1\.\.[1-9][0-9]*$/m, 'pgTAP did not finish');
  console.log(tap);
  sql(oldDefinitions);
  for (const name of indexes) sql(`drop index public.${name};`);
  assert.equal(unaffected(), oldUnaffected);
  // Batch writes keep all canonical triggers/fences active without exhausting
  // transaction advisory-lock memory. Fixtures are synthetic, never a live copy.
  for (const statement of fixture.split(';').filter((part) => part.trim())) {
    if (statement.includes('generate_series(1,20106)')) {
      for (let i = 1; i <= 20106; i += 500) sql(statement.replace('generate_series(1,20106)', `generate_series(${i},${Math.min(i + 499, 20106)})`) + ';');
    } else if (statement.includes('generate_series(1,41345)')) {
      for (let i = 1; i <= 41345; i += 1000) sql(statement.replace('generate_series(1,41345)', `generate_series(${i},${Math.min(i + 999, 41345)})`) + ';');
    } else sql(statement + ';');
  }
  const addEventsUntil = (target) => {
    const current = Number(sql(`select count(*) from public.sync_events where shop_id='${shop}';`));
    assert.ok(current <= target);
    // Separate autocommit statements preserve the real publisher's transaction
    // coalescing rule; one DO loop would correctly emit only one event.
    sql(Array.from({ length: target - current }, (_, i) => `
      update public.inventory_products set product_name='Synthetic event ${current + i}'
      where id='23000000-0000-4000-8000-000000000001';`).join('\n') + '\nanalyze public.sync_events;');
    assert.equal(Number(sql(`select count(*) from public.sync_events where shop_id='${shop}';`)), target);
  };
  addEventsUntil(2074);
  assert.throws(() => sql(`set statement_timeout='8s'; ${checkpoint()}`), /statement timeout/);
  console.log('PASS RED: original full checkpoint reaches the unchanged 8s deadline on 61,595 rows / 2,074 events.');
  const originalRows = dataFingerprint();
  sql(migration);
  assert.equal(dataFingerprint(), originalRows, 'migration changed rows or events');
  const newBodies = bodies();
  for (const name of names) assert.equal(newBodies[name].trim().replace(/^begin\s+return\s+/, '').replace(/\s+end;$/, ''), oldBodies[name].trim().replace(/^select\s+/, ''), `scalar expression changed: ${name}`);
  assert.equal(attributes(), oldAttributes, 'helper attributes/owner/ACL/OIDs changed');
  assert.equal(unaffected(), oldUnaffected, 'another function, RPC or guard changed');
  const newDefinitions = definitions();
  assert.equal(sql(`set timezone='Pacific/Chatham'; ${vectors}`), oldVectors, 'scalar vectors differ');
  for (const [name, table] of [[indexes[0], 'inventory_products'], [indexes[1], 'inventory_product_prices']]) {
    const id = table === 'inventory_products' ? '23000000-0000-4000-8000-000000000001' : '24000000-0000-4000-8000-000000000001';
    const plan = sql(`explain (analyze,buffers,format json) select * from public.${table} where lower(id::text)=any(array['${id}']);`);
    assert.ok(plan.includes(name), 'natural event lookup plan does not use the new index');
  }
  console.log('PASS: exact scalar/null/UTC/Unicode/nonfinite/tombstone vectors, metadata/ACL and natural expression-index plans.');
  const migrated = readCheckpoint('fixed-2074-cold');
  assert.equal(migrated.status, 'ready');
  assert.equal(migrated.syncEvents.inspectedCount, 2074);
  assert.equal(migrated.syncEvents.requiresFullRecovery, false);
  for (let i = 0; i < 2; i++) assert.deepEqual(readCheckpoint(`fixed-2074-repeat-${i}`), migrated);
  // Diagnostic reference has a local-only longer budget. Production/client
  // budgets remain 8s. Keep the indexes while comparing original helper bodies
  // so this oracle finishes; indexes cannot change any result semantics.
  sql(oldDefinitions);
  assert.deepEqual(readCheckpoint('old-bodies-indexed-reference', '0', null, '40s'), migrated);
  const max = migrated.syncEvents.maxId, scope = migrated.scope.key;
  const referenceMax = readCheckpoint('old-from-max-reference', max, scope, '40s');
  sql(newDefinitions);
  assert.deepEqual(readCheckpoint('fixed-from-max', max, scope), referenceMax);
  console.log(`CHECKSUM complete checkpoint: ${createHash('sha256').update(JSON.stringify(migrated)).digest('hex')}`);
  console.log('PASS: complete old/new checkpoint JSON equality, including DTO byte counts, every digest, scope and event decisions, from zero and verified max baseline.');
  addEventsUntil(10001);
  const capped = readCheckpoint('fixed-10001-event-cap');
  assert.equal(capped.status, 'ready');
  assert.equal(capped.syncEvents.inspectedCount, 10000);
  assert.equal(capped.syncEvents.scanComplete, false);
  assert.equal(capped.syncEvents.requiresFullRecovery, true);
  const cappedRows = dataFingerprint();
  sql(oldDefinitions);
  assert.deepEqual(readCheckpoint('old-10001-event-cap-reference', '0', null, '40s'), capped);
  // Actual compensating rollback and reapply, never touching row data.
  for (const name of indexes) sql(`drop index public.${name};`);
  assert.equal(definitions(), oldDefinitions);
  sql(migration);
  assert.equal(definitions(), newDefinitions);
  assert.equal(dataFingerprint(), cappedRows, 'rollback/reapply changed rows or events');
  console.log(`INDEX BYTES ${sql(`select jsonb_object_agg(indexrelid::regclass::text,pg_relation_size(indexrelid)) from pg_index where indexrelid in (${indexes.map((name) => `'public.${name}'::regclass`).join(',')});`)}`);
  assert.equal(attributes(), oldAttributes);
  assert.equal(unaffected(), oldUnaffected);
  console.log('PASS: compensating helper/index rollback and exact reapply preserve all row data and untouched functions.');
  console.log(JSON.stringify({ syntheticRows: 61595, deadlineMilliseconds: 8000, results }, null, 2));
} finally {
  if (created) sql(`drop database ${database} with (force);`, 'postgres', 'supabase_admin');
}
