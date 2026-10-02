// Local-only price-digest regression and complete checkpoint benchmark. Synthetic rows only.
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
const database = `wechat010_price_digest_${process.pid}`;
const sql = (input, db = database, role = 'postgres') => execFileSync(docker, [
  '--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-X', '-qAt',
  '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db,
], { input, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim();
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const migration = readFileSync('supabase/migrations/20261002005414_wechat_010_price_digest_performance.sql', 'utf8');
const fixture = `

 insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009201','authenticated','authenticated','{}','{}',now(),now());
 update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000009201';
 insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000009201','PERFLOCAL','Synthetic performance shop','active');
 insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values('00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','shop_owner','active');
 insert into public.shop_devices(shop_id,device_identifier,device_type,display_name,status) values('10000000-0000-4000-8000-000000009201','checkpoint-perf-local','mobile','Synthetic local device','active');
 insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at) values('10000000-0000-4000-8000-000000009201','00000000-0000-4000-8000-000000009201','mapped',now());
 insert into public.inventory_suppliers(id,owner_user_id,shop_id,name) select ('21000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Supplier '||i from generate_series(1,78)i;
 insert into public.inventory_categories(id,owner_user_id,shop_id,name) select ('22000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Category '||i from generate_series(1,50)i;
 insert into public.inventory_products(id,owner_user_id,shop_id,barcode,product_name,second_product_name,item_number,stock_quantity,purchase_price,retail_price) select ('23000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201',case when i<=165 then null::uuid else '10000000-0000-4000-8000-000000009201'::uuid end,'PERF-'||i,repeat('Synthetic product 中文 ',3)||i,'Second name '||i,'Item-'||i,3.5,1000,2000 from generate_series(1,20106)i;
 insert into public.inventory_product_prices(id,owner_user_id,shop_id,product_id,type,price,effective_at,created_at,source,note) select ('24000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000009201',case when i<=165 then null::uuid else '10000000-0000-4000-8000-000000009201'::uuid end,('23000000-0000-4000-8000-'||lpad(((i-1)%20106+1)::text,12,'0'))::uuid,'RETAIL',1000+(i%3000),to_char(timestamp '2026-09-29 01:00:00'+(i%663)*interval '1 second','YYYY-MM-DD HH24:MI:SS'),to_char(timestamp '2026-09-29 02:00:00'+(i%661)*interval '1 second','YYYY-MM-DD HH24:MI:SS'),'local','Bounded price note '||i from generate_series(1,41345)i;
 insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name,updated_at) select '25000000-0000-4000-8000-'||lpad(i::text,12,'0'),2,'2026-09-29 01:00:00','Synthetic','Synthetic',false,'[["bounded history"]]'::jsonb,'00000000-0000-4000-8000-000000009201','10000000-0000-4000-8000-000000009201','Synthetic history','2026-09-29T01:00:00.123456Z' from generate_series(1,16)i;
 analyze;

`;
const checkpointSignature = 'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)';
const amountSignature = 'app_private.sync_price_canonical_amount_v1(double precision)';
const where = `oid in (${literal(checkpointSignature)}::regprocedure,${literal(amountSignature)}::regprocedure)`;
const definitions = () => sql(`select string_agg(pg_get_functiondef(oid)||';', E'\n' order by proname) from pg_proc where ${where};`);
const checkpointDefinition = () => sql(`select pg_get_functiondef(${literal(checkpointSignature)}::regprocedure);`);
// Only scalar implementation language changes; identity, owner, ACL and all
// other attributes remain exact. Checkpoint language stays PL/pgSQL.
const attributes = () => sql(`select jsonb_agg(to_jsonb(f)-'prosrc'-'prolang' order by proname) from pg_proc f where ${where};`);
const unaffected = () => sql(`select md5(string_agg(to_jsonb(f)::text,E'\n' order by oid)) from pg_proc f
 where pronamespace in ('app_private'::regnamespace,'public'::regnamespace) and not (${where});`);
const body = (signature) => sql(`select prosrc from pg_proc where oid=${literal(signature)}::regprocedure;`);
const fingerprint = () => sql(`select jsonb_object_agg(name,hash) from (${[
  'inventory_suppliers','inventory_categories','inventory_products','inventory_product_prices',
  'inventory_product_image_versions','shared_sheet_sessions','sync_events',
].map((table) => `select '${table}' name, md5(string_agg(md5(to_jsonb(row)::text),',' order by md5(to_jsonb(row)::text))) hash from public.${table} row`).join(' union all ')}) v;`);
const account = '00000000-0000-4000-8000-000000009201';
const shop = '10000000-0000-4000-8000-000000009201';
const results = [];
const hash = (value) => createHash('sha256').update(value).digest('hex');
function priceBlock(definition) {
  const anchor = definition.indexOf('from public.inventory_product_prices price_row');
  const start = definition.lastIndexOf('  with scoped as ', anchor);
  const end = definition.indexOf(';', definition.indexOf('  into v_prices\n', start)) + 1;
  assert.ok(start >= 0 && end > start);
  return definition.slice(start, end);
}
function priceQuery(definition) {
  return priceBlock(definition).replace('  into v_prices\n', '')
    .replaceAll('v_scope_kind', "'authorized_shop_plus_legacy'::text")
    .replaceAll('p_shop_id', `${literal(shop)}::uuid`)
    .replaceAll('v_mapped_owner_id', `${literal(account)}::uuid`);
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
function trackedAggregate(definition, fixtureSql = '', table = null) {
  let query = priceQuery(definition);
  if (table) query = query.replace('public.inventory_product_prices price_row', `${table} price_row`);
  // Transaction-local counters avoid statistics flush races. No helper is
  // instrumented/replaced, and only this disposable backend enables tracking.
  const output = sql(`begin; set local track_functions='all'; ${fixtureSql}
    ${query}
    select coalesce(jsonb_object_agg(funcname,calls),'{}'::jsonb) from pg_stat_xact_user_functions
      where funcname in ('sync_price_recovery_row_v1','sync_legacy_timestamp_is_canonical_v1');
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
  for (const file of ['20260929013345_wechat_010_history_physical_normalization.sql','20260929013437_wechat_010_catalog_keyset_order.sql','20261001220355_wechat_010_recovery_checkpoint_performance.sql','20261001235153_wechat_010_history_timestamp_compatibility.sql']) {
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  console.log('PASS local schema-only template owner/activity/empty inventory; prior applied contracts installed.');
  const original = definitions(), originalCheckpoint = checkpointDefinition(), oldAttributes = attributes(), oldOther = unaffected();
  const oldAmount = body(amountSignature);
  const inTransaction = migration.replace('\nbegin;\nset local lock_timeout', '\nset local lock_timeout').replace(/\ncommit;\s*$/, '\n');
  assert.throws(() => sql(migration, database, 'supabase_admin'), /price_digest_performance_baseline_mismatch/);
  for (const [label, setup, accepted] of [
    ['canonical ACL', '', true],
    ['TEST ACL', `grant execute on function ${checkpointSignature} to service_role;`, true],
    ['TEST reordered', `revoke execute on function ${checkpointSignature} from authenticated; grant execute on function ${checkpointSignature} to service_role; grant execute on function ${checkpointSignature} to authenticated;`, true],
    ['extra grantee', `grant execute on function ${checkpointSignature} to anon;`, false],
    ['grant option', `grant execute on function ${checkpointSignature} to authenticated with grant option;`, false],
    ['scalar exposed', `grant execute on function ${amountSignature} to authenticated;`, false],
    ['volatility drift', `alter function ${checkpointSignature} stable;`, false],
    ['scalar source drift', `create or replace function ${amountSignature.replace('(double precision)', '(p_price double precision)')} returns text language sql immutable parallel safe set search_path=pg_catalog,pg_temp as 'select p_price::text';`, false],
    ['signature drift', `alter function ${amountSignature} rename to price_amount_previous;`, false],
  ]) {
    const metadata = `select jsonb_agg(to_jsonb(f)-'prosrc'-'prolang' order by proname) from pg_proc f where ${where};`;
    const query = `begin; ${setup} ${accepted ? metadata : ''} ${inTransaction} ${accepted ? metadata : ''} rollback;`;
    if (accepted) {
      const [before, after] = sql(query).split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(after, before, label);
    } else assert.throws(() => sql(query), /price_digest_performance_baseline_mismatch/, label);
    assert.equal(definitions(), original);
    assert.equal(attributes(), oldAttributes);
    console.log(`PASS baseline ${label}: ${accepted ? 'preserved' : 'rejected atomically'}`);
  }
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  assert.equal(definitions(), original);
  sql(migration);
  const candidate = definitions(), candidateCheckpoint = checkpointDefinition();
  assert.equal(body(amountSignature).trim().replace(/^begin\s+return\s+/, '').replace(/\s+end;$/, ''), oldAmount.trim().replace(/^select\s+/, ''));
  const stripComments = (s) => s.split('\n').filter((line) => line.trim() && !line.trim().startsWith('--')).join('\n').trim();
  assert.equal(stripComments(candidateCheckpoint.replace(priceBlock(candidateCheckpoint), 'PRICE_BLOCK')),
    stripComments(originalCheckpoint.replace(priceBlock(originalCheckpoint), 'PRICE_BLOCK')), 'another checkpoint section changed');
  assert.equal(attributes(), oldAttributes);
  assert.equal(unaffected(), oldOther);
  runTap('supabase/tests/wechat_010_price_digest_performance.sql');
  runTap('supabase/tests/wechat_010_history_timestamp_compatibility.sql');
  runTap('supabase/tests/cross_platform_sync_recovery_contract.sql');
  for (const statement of fixture.split(';').filter((s) => s.trim())) {
    if (statement.includes('generate_series(1,20106)')) {
      for (let i = 1; i <= 20106; i += 500) sql(statement.replace('generate_series(1,20106)', `generate_series(${i},${Math.min(i+499,20106)})`)+';');
    } else if (statement.includes('generate_series(1,41345)')) {
      for (let i = 1; i <= 41345; i += 1000) sql(statement.replace('generate_series(1,41345)', `generate_series(${i},${Math.min(i+999,41345)})`)+';');
    } else sql(statement+';');
  }
  const addEventsUntil = (target) => {
    const current = Number(sql(`select count(*) from public.sync_events where shop_id='${shop}';`));
    assert.ok(current <= target);
    sql(Array.from({length:target-current}, (_,i) => `update public.inventory_products set product_name='Synthetic event ${current+i}' where id='23000000-0000-4000-8000-000000000166';`).join('\n')+'\nanalyze;');
  };
  addEventsUntil(2074);
  const dataBefore = fingerprint();
  sql(original);
  const cold = readCheckpoint('original-first', '0', null, '40s');
  assert.equal(cold.prices.activeCount, 41345);
  assert.equal(cold.scope.kind, 'authorized_shop_plus_legacy');
  for (let i=0;i<2;i++) assert.deepEqual(readCheckpoint(`original-repeat-${i}`, '0', null, '40s'), cold);
  const oldCalls = trackedAggregate(originalCheckpoint);
  assert.equal(oldCalls.calls.sync_price_recovery_row_v1, 82690);
  assert.equal(oldCalls.calls.sync_legacy_timestamp_is_canonical_v1, 82690);
  assert.throws(() => assert.equal(oldCalls.calls.sync_price_recovery_row_v1, 41345));
  console.log('PASS RED: baseline serializes 2N DTOs and validates 2N price timestamps.');
  sql(migration);
  const fixed = readCheckpoint('fixed-first');
  assert.deepEqual(fixed, cold);
  for (let i=0;i<2;i++) assert.deepEqual(readCheckpoint(`fixed-repeat-${i}`), cold);
  const newCalls = trackedAggregate(candidateCheckpoint);
  assert.deepEqual(newCalls.value, oldCalls.value);
  assert.equal(newCalls.calls.sync_price_recovery_row_v1, 41345);
  assert.equal(newCalls.calls.sync_legacy_timestamp_is_canonical_v1, 1324);
  console.log(`PASS GREEN call counts ${JSON.stringify(newCalls.calls)}; aggregate/full JSON exactly equal.`);
  const scope = cold.scope.key, max = cold.syncEvents.maxId;
  const current = readCheckpoint('fixed-current-baseline', max, scope);
  sql(original);
  assert.deepEqual(readCheckpoint('original-current-baseline', max, scope, '40s'), current);
  sql(candidate);
  // Temp projection deliberately removes table constraints, allowing unsupported
  // values through the *aggregate only*. No malformed business rows are stored.
  const vectorSetup = `create temporary table price_vectors on commit drop as
    select p.* from public.inventory_product_prices p where false;
    insert into price_vectors select p.* from public.inventory_product_prices p order by id limit 32;
    with values_by_id as (select id,row_number() over(order by id) n from price_vectors)
    update price_vectors p set effective_at=case n%8 when 0 then null when 1 then ''
      when 2 then '2026-02-30 01:00:00' when 3 then '2026-09-29T01:00:00.123Z'
      when 4 then '2026-09-29 01:00:00 ' when 5 then '0000-01-01 00:00:00'
      when 6 then '2024-02-29 12:30:59' else '2026-09-29 01:00:00' end,
      created_at=case n%3 when 0 then null when 1 then 'invalid 中文' else '2026-09-29 01:00:00' end,
      price=case n%7 when 0 then null when 1 then 'NaN'::float8 when 2 then 'Infinity'::float8
        when 3 then -1 when 4 then 1.2345 when 5 then 0 else 999999999999.999 end,
      source=case when n%2=0 then null else E'中文😀\\x1f' end,
      note=case when n%2=0 then '' else E'line\\n2' end
    from values_by_id v where p.id=v.id;`;
  for (const setup of [vectorSetup, vectorSetup+'delete from price_vectors;']) {
    sql(original);
    const old = trackedAggregate(originalCheckpoint, setup, 'price_vectors');
    sql(candidate);
    assert.deepEqual(trackedAggregate(candidateCheckpoint, setup, 'price_vectors').value, old.value);
  }
  console.log('PASS aggregate NULL/invalid/date/Unicode/nonfinite/rounding/empty cases match exactly.');
  // All-unique timestamps test the opposite of the measured duplicate-heavy
  // distribution and prevent a memo strategy with quadratic join behavior.
  const uniqueSetup = `create temporary table unique_prices on commit drop as select p.* from public.inventory_product_prices p;
    with numbered as(select id,row_number() over(order by id) n from unique_prices)
    update unique_prices p set effective_at=to_char(timestamp '2026-01-01'+n*interval '1 second','YYYY-MM-DD HH24:MI:SS'),
      created_at=to_char(timestamp '2025-01-01'+n*interval '1 second','YYYY-MM-DD HH24:MI:SS') from numbered v where p.id=v.id;`;
  sql(original);
  const uniqueOld = trackedAggregate(originalCheckpoint, uniqueSetup, 'unique_prices');
  sql(candidate);
  const uniqueNew = trackedAggregate(candidateCheckpoint, uniqueSetup, 'unique_prices');
  assert.deepEqual(uniqueNew.value, uniqueOld.value);
  assert.equal(uniqueNew.calls.sync_legacy_timestamp_is_canonical_v1, 82690);
  assert.equal(uniqueNew.calls.sync_price_recovery_row_v1, 41345);
  assert.equal(fingerprint(), dataBefore);
  addEventsUntil(10001);
  const capped = readCheckpoint('fixed-10001-event-boundary');
  assert.equal(capped.syncEvents.inspectedCount, 10000);
  assert.equal(capped.syncEvents.scanComplete, false);
  assert.equal(capped.syncEvents.requiresFullRecovery, true);
  sql(original);
  assert.deepEqual(readCheckpoint('original-10001-event-boundary', '0', null, '40s'), capped);
  const finalData = fingerprint();
  sql(migration);
  assert.equal(definitions(), candidate);
  assert.equal(fingerprint(), finalData);
  assert.equal(attributes(), oldAttributes);
  assert.equal(unaffected(), oldOther);
  console.log('PASS complete output/digest parity, scoped legacy rows, all-unique/duplicate distributions, event cap and exact rollback/reapply without row/event changes.');
  console.log(JSON.stringify({syntheticRows:61595, prices:41345, legacyPrices:165, deadlineMilliseconds:8000, results},null,2));
} finally {
  if (created) sql(`drop database ${database} with (force);`, 'postgres', 'supabase_admin');
}
