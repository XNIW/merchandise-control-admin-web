// Local-only schema clone and synthetic fixtures. Never accepts a database URL.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
const docker = process.env.DOCKER_BIN ?? '/usr/local/bin/docker';
const container = process.env.WECHAT_TEST_DB_CONTAINER ?? 'supabase_db_MerchandiseControlSupabase';
const template = process.env.WECHAT_TEST_DB_TEMPLATE ?? 'wechat010_sync_final_20260926';
assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
assert.match(template, /^wechat010_[a-z0-9_]+$/);
assert.ok(statSync('/var/run/docker.sock').isSocket(), 'local Docker socket required');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DOCKER_')));
const database = `wechat010_history_normalization_${process.pid}`;
const command = (db = database, role = 'postgres') => ['--host', 'unix:///var/run/docker.sock', 'exec', '-i', container,
  'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', role, '-d', db];
const sql = (input, db = database, role = 'postgres') => execFileSync(docker, command(db, role), {
  input, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000,
}).trim();
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const migration = readFileSync('supabase/migrations/20260928193505_wechat_010_history_physical_normalization.sql', 'utf8');
const tests = readFileSync('supabase/tests/wechat_010_history_physical_normalization.sql', 'utf8');
const fixtureStart = tests.indexOf('-- FIXTURE_BEGIN');
const fixtureEnd = tests.indexOf('-- FIXTURE_END');
assert.ok(fixtureStart > 0 && fixtureEnd > fixtureStart);
const fixture = tests.slice(fixtureStart, fixtureEnd);
const shop = '10000000-0000-4000-8000-000000008101';
const ids = "array['25000000-0000-4000-8000-000000008111','25000000-0000-4000-8000-000000008112']";
const baselineGuard = 'be22f5508e3a2c31668e59e64fee70b8';
const currentGuard = () => sql("select md5(pg_get_functiondef('public.set_shared_sheet_sessions_updated_at()'::regprocedure));");
const unaffected = () => sql("select string_agg(md5(pg_get_functiondef(oid)),',' order by oid) from pg_proc where oid in ('app_private.sync_jsonb_storage_is_bounded_v1(jsonb,integer,integer)'::regprocedure,'app_private.emit_atomic_sync_events_statement_v1()'::regprocedure,'app_private.sync_history_active_payload_is_valid_v1(text,timestamptz,jsonb,jsonb)'::regprocedure);");
function runTap(source = tests) {
  const output = sql(source);
  assert.doesNotMatch(output, /^not ok/m, output);
  assert.match(output, /^1\.\.[1-9][0-9]*$/m, 'pgTAP did not finish');
  console.log(output);
}
let created = false;
let writer;
let writerClosed;
try {
  assert.equal(sql(`select pg_get_userbyid(datdba) from pg_database where datname=${literal(template)};`, 'postgres', 'supabase_admin'), 'postgres');
  assert.equal(sql(`select count(*) from pg_stat_activity where datname=${literal(template)};`, 'postgres', 'supabase_admin'), '0', 'template is in use');
  assert.equal(sql('select (select count(*) from public.shared_sheet_sessions)+(select count(*) from public.shops)+(select count(*) from public.sync_events);', template), '0', 'template must contain no business data');
  console.log('PASS: local PostgreSQL template owner/activity/empty inventory verified; schema-only template has no live registry attestation.');
  sql(`create database ${database} template ${template} owner postgres;`, 'postgres', 'supabase_admin'); created = true;
  assert.equal(currentGuard(), baselineGuard, 'unexpected baseline trigger definition');
  const originalGuard = sql("select pg_get_functiondef('public.set_shared_sheet_sessions_updated_at()'::regprocedure);");
  const unchanged = unaffected();
  sql(`begin; ${fixture}
do $$ begin
 begin
  update public.shared_sheet_sessions set data=data||'[]'::jsonb where remote_id='25000000-0000-4000-8000-000000008111';
  raise exception 'baseline unexpectedly allowed compressed OLD';
 exception when check_violation then
  if sqlerrm <> 'history row JSONB requires bounded external storage' then raise; end if;
 end;
end $$; rollback;`);
  console.log('PASS baseline: ordinary preserving rewrite of physically compressed OLD is rejected.');
  assert.throws(() => sql(migration, database, 'supabase_admin'), /history_normalization_migration_owner_or_version_mismatch/);
  assert.equal(sql("select to_regclass('app_private.wechat_history_normalization_marks') is null;"), 't');
  assert.equal(currentGuard(), baselineGuard);
  console.log('PASS: wrong deployment role rejected atomically.');
  sql(migration);
  assert.throws(() => sql(`select app_private.wechat_history_normalization_plan_v1('${shop}',${ids});`, database, 'supabase_admin'), /history_normalization_postgres_only/);
  assert.equal(unaffected(), unchanged, 'runtime guard/canonical validator/publisher changed');
  runTap();
  runTap(readFileSync('supabase/tests/cross_platform_sync_recovery_contract.sql', 'utf8'));
  console.log('PASS: unchanged native recovery contract on the migrated isolated clone.');
  // Compensating DDL on this empty disposable clone, never recompress business rows.
  sql(`begin; ${originalGuard};
drop function app_private.wechat_history_normalization_apply_v1(uuid,jsonb);
drop function app_private.wechat_history_normalization_plan_v1(uuid,text[]);
drop function app_private.wechat_history_normalization_hash_v1(public.shared_sheet_sessions);
drop function app_private.wechat_history_normalization_clone_v1(jsonb,text);
drop table app_private.wechat_history_normalization_marks;
commit;`);
  assert.equal(currentGuard(), baselineGuard);
  assert.equal(unaffected(), unchanged);
  sql(migration);
  runTap();
  console.log('PASS: compensating DDL restore/reapply with identical original trigger and unchanged canonical functions.');
  sql(`begin; ${fixture} commit;`);
  const manifest = sql(`select app_private.wechat_history_normalization_plan_v1('${shop}',${ids});`);
  const apply = `select app_private.wechat_history_normalization_apply_v1('${shop}',${literal(manifest)}::jsonb);`;
  const eventCount = sql(`select count(*) from public.sync_events where shop_id='${shop}';`);
  writer = spawn(docker, command(), { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  writer.stdout.on('data', (bytes) => { output += bytes; });
  writer.stderr.on('data', (bytes) => { errors += bytes; });
  writerClosed = new Promise((resolve) => writer.once('close', resolve));
  writer.stdin.write("begin; do $$ begin perform 1 from public.shared_sheet_sessions where remote_id='25000000-0000-4000-8000-000000008112' for update; end $$; select 'row_locked';\n");
  for (let attempt = 0; !output.includes('row_locked') && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(output.includes('row_locked'), errors || 'second writer did not lock row');
  let lockDenied = false;
  try { sql(`\\set VERBOSITY verbose\n${apply}`); } catch (error) { lockDenied = String(error.stderr).includes('55P03'); }
  assert.ok(lockDenied, 'apply must fail NOWAIT under the real second-writer lock');
  assert.equal(sql("select count(*) from app_private.wechat_history_normalization_marks;"), '0');
  assert.equal(sql(`select count(*) from public.shared_sheet_sessions where remote_id=any(${ids}) and pg_column_compression(data)='pglz';`), '2');
  writer.stdin.end('rollback;\n');
  assert.equal(await writerClosed, 0, errors); writer = undefined;
  const result = JSON.parse(sql(apply));
  assert.deepEqual(result, { rows: 2, status: 'normalized', sync_events_added: 0 });
  assert.equal(sql(`select count(*) from public.sync_events where shop_id='${shop}';`), eventCount);
  assert.equal(unaffected(), unchanged);
  console.log('PASS: real second-writer lock denies NOWAIT with no partial work; reviewed manifest applies after lock release, zero events.');
} finally {
  if (writer) { writer.stdin.end('rollback;\n'); await writerClosed; }
  if (created) sql(`drop database ${database} with (force);`, 'postgres', 'supabase_admin');
}
