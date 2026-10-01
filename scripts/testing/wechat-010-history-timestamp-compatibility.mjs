// Local-only schema clone and synthetic History fixtures. No URL/remote target.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
const docker = process.env.DOCKER_BIN ?? '/usr/local/bin/docker';
const container = process.env.WECHAT_TEST_DB_CONTAINER ?? 'supabase_db_MerchandiseControlSupabase';
const template = process.env.WECHAT_TEST_DB_TEMPLATE ?? 'wechat010_sync_final_20260926';
assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
assert.match(template, /^wechat010_[a-z0-9_]+$/);
assert.ok(statSync('/var/run/docker.sock').isSocket(), 'local Docker socket required');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DOCKER_')));
const database = `wechat010_history_timestamp_${process.pid}`;
const sql = (input, db = database, role = 'postgres') => execFileSync(docker, [
  '--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-X', '-qAt',
  '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db,
], { input, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 }).trim();
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const migration = readFileSync('supabase/migrations/20261001235153_wechat_010_history_timestamp_compatibility.sql', 'utf8');
const tap = readFileSync('supabase/tests/wechat_010_history_timestamp_compatibility.sql', 'utf8');
const fixture = JSON.parse(readFileSync('tests/fixtures/history-timestamp-compatibility-v1.json', 'utf8'));
assert.deepEqual(JSON.parse(tap.split('$vectors$')[1]), fixture, 'pgTAP must use exact shared vectors');
const names = ['sync_history_active_payload_is_valid_v1', 'shop_sync_recovery_checkpoint_v1'];
const where = `pronamespace in ('app_private'::regnamespace,'public'::regnamespace) and proname in (${names.map(literal).join(',')})`;
const definitions = () => sql(`select string_agg(pg_get_functiondef(oid)||';', E'\n' order by proname) from pg_proc where ${where};`);
const bodies = () => JSON.parse(sql(`select jsonb_object_agg(proname,prosrc) from pg_proc where ${where};`));
const attributes = () => sql(`select jsonb_agg(to_jsonb(f)-'prosrc' order by proname) from pg_proc f where ${where};`);
const unaffected = () => sql(`select encode(extensions.digest(string_agg(to_jsonb(f)::text, E'\n' order by oid),'sha256'),'hex') from pg_proc f
  where pronamespace in ('app_private'::regnamespace,'public'::regnamespace) and not (${where})
    and proname <> 'sync_history_timestamp_is_canonical_v1';`);
const dataFingerprint = () => sql(`select jsonb_build_array(
  (select md5(string_agg(md5(to_jsonb(row)::text),',' order by remote_id)) from public.shared_sheet_sessions row),
  (select md5(string_agg(md5(to_jsonb(row)::text),',' order by id)) from public.sync_events row));`);
const account = '00000000-0000-4000-8000-000000018001';
const shop = '10000000-0000-4000-8000-000000018001';
const otherShop = '10000000-0000-4000-8000-000000018002';
const device = 'history-timestamp-local';
const id = (n) => `65000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamps = ['2024-02-29T15:40:11.305Z', '2024-02-29T02:40:50.191Z', '2024-02-29T02:40:50.686Z',
  '2024-02-29 02:40:50', '2024-02-29T02:40:50.999Z', '0001-01-01T00:00:00.000Z'];
const rpc = (query) => JSON.parse(sql(`set statement_timeout='8s';
  select set_config('request.jwt.claim.sub','${account}',false); set role authenticated; ${query}`).split('\n').at(-1));
const checkpoint = () => rpc(`select public.shop_sync_recovery_checkpoint_v1('${shop}','${device}','0',null);`);
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const chain = (values) => values.reduce((state, value) => sha256(`${state}\x1f${Buffer.byteLength(value, 'utf8')}:${value}`), sha256(''));
function runTap(source) {
  const output = sql(source);
  assert.doesNotMatch(output, /^not ok/m, output);
  assert.match(output, /^1\.\.[1-9][0-9]*$/m, 'pgTAP did not finish');
  console.log(output);
}
let created = false;
try {
  assert.equal(sql(`select pg_get_userbyid(datdba) from pg_database where datname=${literal(template)};`, 'postgres', 'supabase_admin'), 'postgres');
  assert.equal(sql(`select count(*) from pg_stat_activity where datname=${literal(template)};`, 'postgres', 'supabase_admin'), '0');
  assert.equal(sql('select (select count(*) from public.shops)+(select count(*) from public.inventory_products)+(select count(*) from public.shared_sheet_sessions)+(select count(*) from public.sync_events);', template), '0');
  sql(`create database ${database} template ${template} owner postgres;`, 'postgres', 'supabase_admin'); created = true;
  for (const file of ['20260929013345_wechat_010_history_physical_normalization.sql', '20260929013437_wechat_010_catalog_keyset_order.sql', '20261001220355_wechat_010_recovery_checkpoint_performance.sql']) {
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  console.log('PASS local-only empty template/owner/activity; reviewed prior migrations applied in disposable clone.');
  // ACLs are preserved by CREATE OR REPLACE. Recognize only the two observed
  // checkpoint sets; order is irrelevant, grantor and grant option are not.
  const checkpointFunction = 'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)';
  const payloadFunction = 'app_private.sync_history_active_payload_is_valid_v1(text,timestamptz,jsonb,jsonb)';
  const migrationInTransaction = migration.replace('\nbegin;\nset local lock_timeout', '\nset local lock_timeout')
    .replace(/\ncommit;\s*$/, '\n');
  const metadataQuery = `select jsonb_agg(to_jsonb(f)-'prosrc' order by proname) from pg_proc f where ${where};`;
  const baselineDefinitions = definitions(), baselineAttributes = attributes(), baselineOther = unaffected();
  const aclCases = [
    ['local canonical', '', true],
    ['observed TEST order', `revoke execute on function ${checkpointFunction} from authenticated;
      grant execute on function ${checkpointFunction} to service_role;
      grant execute on function ${checkpointFunction} to authenticated;`, true],
    ['local reordered', `revoke execute on function ${checkpointFunction} from postgres;
      grant execute on function ${checkpointFunction} to postgres;`, true],
    ['TEST alternate order', `grant execute on function ${checkpointFunction} to service_role;`, true],
    ['active payload reordered', `revoke execute on function ${payloadFunction} from postgres;
      grant execute on function ${payloadFunction} to postgres;`, true],
    ['unexpected grantee', `grant execute on function ${checkpointFunction} to anon;`, false],
    ['PUBLIC grant', `grant execute on function ${checkpointFunction} to public;`, false],
    ['authenticated grant option', `grant execute on function ${checkpointFunction} to authenticated with grant option;`, false],
    ['service grant option', `grant execute on function ${checkpointFunction} to service_role with grant option;`, false],
    ['missing authenticated', `revoke execute on function ${checkpointFunction} from authenticated;`, false],
    ['missing payload service', `revoke execute on function ${payloadFunction} from service_role;`, false],
  ];
  for (const [label, setup, accepted] of aclCases) {
    const query = `begin; ${setup} ${metadataQuery} ${migrationInTransaction}
      ${metadataQuery} rollback;`;
    if (accepted) {
      const [before, after] = sql(query).split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(after, before, `migration changed metadata/ACL: ${label}`);
    } else assert.throws(() => sql(query), /history_timestamp_compatibility_baseline_mismatch/, label);
    assert.equal(attributes(), baselineAttributes, `ACL fixture escaped rollback: ${label}`);
    assert.equal(definitions(), baselineDefinitions, `function change escaped rollback: ${label}`);
    assert.equal(unaffected(), baselineOther, `unrelated function changed: ${label}`);
    assert.equal(sql("select to_regprocedure('app_private.sync_history_timestamp_is_canonical_v1(text)') is null;"), 't');
    console.log(`PASS ACL ${accepted ? 'preserved' : 'rejected atomically'}: ${label}.`);
  }
  const oldDefinitions = definitions(), oldBodies = bodies(), oldAttributes = attributes(), oldUnaffected = unaffected();
  assert.equal(sql(`select app_private.sync_history_active_payload_is_valid_v1('${stamps[0]}',null,'[["typed"]]'::jsonb,null);`), 'f');
  console.log('PASS RED: current active-History validator rejects a documented valid ISO timestamp.');
  assert.throws(() => sql(migration, database, 'supabase_admin'), /history_timestamp_compatibility_baseline_mismatch/);
  assert.equal(definitions(), oldDefinitions);
  assert.throws(() => sql(`begin;
    alter function public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text) stable;
    ${migration}`), /history_timestamp_compatibility_baseline_mismatch/);
  assert.equal(attributes(), oldAttributes, 'rejected volatility drift escaped rollback');
  sql(migration.replace(/commit;\s*$/, 'rollback;'));
  assert.equal(definitions(), oldDefinitions);
  assert.equal(sql("select to_regprocedure('app_private.sync_history_timestamp_is_canonical_v1(text)') is null;"), 't');
  sql(migration);
  assert.equal(attributes(), oldAttributes, 'OID/owner/ACL/config/function attributes changed');
  assert.equal(unaffected(), oldUnaffected, 'shared legacy/price or another function changed');
  const newBodies = bodies(), newDefinitions = definitions();
  for (const name of names) {
    assert.equal(newBodies[name].replaceAll('sync_history_timestamp_is_canonical_v1', 'sync_legacy_timestamp_is_canonical_v1'), oldBodies[name], `unrelated source changed: ${name}`);
    assert.equal(newBodies[name].split('sync_history_timestamp_is_canonical_v1').length - 1, name === 'shop_sync_recovery_checkpoint_v1' ? 2 : 1);
  }
  runTap(tap);
  runTap(readFileSync('supabase/tests/cross_platform_sync_recovery_contract.sql', 'utf8'));
  console.log('PASS exact three History predicate substitutions, unchanged attributes/other functions, shared vectors and native contract.');
  // Build supported synthetic rows with the canonical triggers enabled. Restoring
  // only the old reader functions below reproduces how existing ISO rows failed;
  // no disabled trigger, data backfill or bypass fixture insert is necessary.
  sql(`insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000000','${account}','authenticated','authenticated','{}','{}',now(),now());
    update public.profiles set profile_status='active',disabled_at=null where profile_id='${account}';
    insert into public.shops(shop_id,shop_code,shop_name,shop_status) values
      ('${shop}','HISTISOLOCAL','Synthetic History shop','active'),
      ('${otherShop}','HISTISOOTHER','Synthetic other shop','active');
    insert into public.shop_members(profile_id,shop_id,role_key,membership_status) values('${account}','${shop}','shop_owner','active');
    insert into public.shop_devices(shop_id,device_identifier,device_type,display_name,status) values('${shop}','${device}','mobile','Synthetic local device','active');
    insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at) values('${shop}','${account}','mapped',now());
    insert into public.inventory_suppliers(id,owner_user_id,shop_id,name) values
      ('61000000-0000-4000-8000-000000018001','${account}','${shop}','Scoped'),
      ('61000000-0000-4000-8000-000000018002','${account}',null,'Legacy');`);
  sql(`insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name)
    values('${id(4)}',2,${literal(stamps[3])},'Supplier 中文','Category',false,'[["typed"]]'::jsonb,'${account}','${shop}','Synthetic');
    insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name,deleted_at)
    values('${id(5)}',2,${literal(stamps[4])},'Supplier 中文','Category',false,'[["typed"]]'::jsonb,'${account}','${shop}','Synthetic','2026-09-29T01:00:00.123456Z');`);
  const legacyOnly = checkpoint();
  assert.equal(legacyOnly.status, 'ready');
  sql(oldDefinitions);
  assert.deepEqual(checkpoint(), legacyOnly, 'legacy plus ISO-tombstone complete JSON/digest changed');
  sql(newDefinitions);
  console.log('PASS full legacy plus ISO-tombstone checkpoint JSON/digest remains identical.');
  for (let n = 1; n <= stamps.length; n++) if (n !== 4 && n !== 5) sql(`insert into public.shared_sheet_sessions(
    remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name,deleted_at)
    values('${id(n)}',2,${literal(stamps[n-1])},'Supplier 中文','Category',false,'[["typed"]]'::jsonb,
      '${account}',${n === 6 ? 'null' : literal(shop)},'Synthetic',${n === 5 ? "'2026-09-29T01:00:00.123456Z'" : 'null'});`);
  sql(`insert into public.shared_sheet_sessions(remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,data,owner_user_id,shop_id,display_name)
    values('${id(7)}',2,'2024-02-29T00:00:00.000Z','Other','Other',false,'[["other"]]'::jsonb,'${account}','${otherShop}','Other');`);
  const fingerprint = dataFingerprint();
  sql(oldDefinitions);
  sql('drop function app_private.sync_history_timestamp_is_canonical_v1(text);');
  const oldCheckpoint = checkpoint();
  assert.equal(oldCheckpoint.status, 'resource_exceeded');
  assert.equal(oldCheckpoint.resourcePreflight.violationDomain, 'history');
  assert.equal(oldCheckpoint.resourcePreflight.storageScanStatus, 'row_storage_or_shape_invalid');
  assert.equal(dataFingerprint(), fingerprint);
  console.log('PASS RED complete checkpoint: old readers reject unchanged supported ISO rows without any fixture/trigger bypass.');
  sql(migration);
  const result = checkpoint();
  assert.equal(result.status, 'ready');
  assert.equal(result.scope.kind, 'authorized_shop_plus_legacy');
  assert.equal(result.scope.historyKind, 'authorized_shop_plus_legacy');
  assert.equal(result.integrity.totalViolationCount, 0);
  assert.equal(result.syncEvents.blockingCount, 0);
  const scope = literal(result.scope.key), max = literal(result.syncEvents.maxId);
  const page = { rows: [] };
  let after = null, pageLimit;
  for (let request = 0; request < 6; request++) {
    const response = rpc(`select public.shop_sync_recovery_page_v1('${shop}','${device}','history',${after === null ? 'null' : literal(after)},250,${scope},${max});`);
    page.rows.push(...response.rows); pageLimit = response.pageLimit;
    if (!response.hasMore) break;
    assert.ok(response.nextAfterId && response.nextAfterId !== after);
    after = response.nextAfterId;
  }
  assert.ok(pageLimit > 0 && pageLimit <= 250);
  const targeted = { rows: [] };
  for (let offset = 0; offset < stamps.length; offset += pageLimit) {
    const ids = stamps.slice(offset, offset + pageLimit).map((_,i) => literal(id(offset+i+1))).join(',');
    targeted.rows.push(...rpc(`select public.shop_sync_rows_by_ids_v1('${shop}','${device}','history',array[${ids}],${scope},${max});`).rows);
  }
  assert.equal(page.rows.length, 6);
  assert.deepEqual(targeted.rows, page.rows);
  for (let n = 1; n <= stamps.length; n++) assert.equal(page.rows.find((row) => row.remote_id === id(n)).timestamp, n === 5 ? '1970-01-01 00:00:00' : stamps[n-1]);
  assert.ok(!page.rows.some((row) => row.remote_id === id(7)), 'cross-shop History leaked');
  const ledger = page.rows.map((row) => [row.remote_id, row.updated_at, row.deleted_at ?? '-', String(row.payload_version),
    row.deleted_at !== null ? '-' : [row.timestamp, sha256(row.supplier), sha256(row.category), String(row.is_manual_entry),
      sha256(row.display_name ?? ''), row.data_checkpoint_digest, row.overlay_checkpoint_digest].join('\x1f')].join('\x1f'));
  assert.equal(result.history.idSetDigest, chain(page.rows.map((row) => row.remote_id)));
  assert.equal(result.history.versionDigest, chain(ledger), 'server digest must use exact raw ISO string, no truncation/normalization');
  assert.equal(dataFingerprint(), fingerprint, 'readers/migration changed rows or emitted events');
  sql(oldDefinitions);
  sql('drop function app_private.sync_history_timestamp_is_canonical_v1(text);');
  assert.equal(definitions(), oldDefinitions);
  assert.equal(attributes(), oldAttributes);
  assert.equal(dataFingerprint(), fingerprint);
  sql(migration);
  assert.deepEqual(checkpoint(), result);
  assert.equal(dataFingerprint(), fingerprint);
  assert.equal(unaffected(), oldUnaffected);
  console.log('PASS full checkpoint/page/targeted rows and raw millisecond ledger; mixed shop+legacy scope; cross-shop exclusion; tombstone; unchanged data/events; exact rollback/reapply.');
  console.log(`CHECKSUM compatible checkpoint: ${sha256(JSON.stringify(result))}`);
} finally {
  if (created) sql(`drop database ${database} with (force);`, 'postgres', 'supabase_admin');
}
