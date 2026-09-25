// Local-only isolated database clone. No remote credentials or business traffic.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
const container = process.env.WECHAT_TEST_DB_CONTAINER ?? 'supabase_db_MerchandiseControlSupabase';
const template = process.env.WECHAT_TEST_DB_TEMPLATE ?? 'wechat010_functional_20260925';
assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
assert.match(template, /^wechat010_[a-z0-9_]+$/);
const database = `wechat010_image_race_${process.pid}`;
const docker = process.env.DOCKER_BIN ?? '/usr/local/bin/docker';
assert.ok(statSync('/var/run/docker.sock').isSocket(), 'local Docker socket required');
const dockerEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DOCKER_')));
const command = (db) => ['--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db];
const sql = (text, db = database) => execFileSync(docker, command(db), { input: text, encoding: 'utf8', env: dockerEnv }).trim();
const pause = () => new Promise(resolve => setTimeout(resolve, 40));
let created = false, writer, replay;
try {
  sql(`create database ${database} template ${template};`, 'postgres'); created = true;
  const fixture = readFileSync('supabase/tests/wechat_003_image_intent_replay_rate_lock.sql', 'utf8');
  const start = fixture.indexOf('insert into auth.users');
  const end = fixture.indexOf("select ok(\n  (select result->>'code' = 'upload_required'");
  assert.ok(start > 0 && end > start);
  sql(`begin; set local role postgres; ${fixture.slice(start, end)} commit;`);
  const result = sql("select result from app_private.wechat_product_image_intent_receipts where idempotency_key='50000000-0000-4000-8000-000000000401'");
  const { version_id: version } = JSON.parse(result);
  assert.match(version, /^[0-9a-f-]{36}$/);
  writer = spawn(docker, command(database), { stdio: ['pipe', 'pipe', 'pipe'], env: dockerEnv });
  let writerOutput = '', writerError = '';
  writer.stdout.on('data', b => { writerOutput += b; });
  writer.stderr.on('data', b => { writerError += b; });
  const readyUpdate = fixture.slice(fixture.indexOf('update public.inventory_product_image_versions\nset status'), fixture.indexOf("insert into image_intent_results\nselect 'stale_remove_"))
    .replaceAll("(select (result->>'version_id')::uuid\n  from image_intent_results where result_key = 'first')", `'${version}'::uuid`)
    .replaceAll("(select (result->>'version_id')::uuid\n      from image_intent_results where result_key = 'first')", `'${version}'::uuid`);
  writer.stdin.write(`begin; set local role postgres; set local request.jwt.claim.role='service_role'; select id from public.inventory_products where id='20000000-0000-4000-8000-000000000401' for update; ${readyUpdate} select 'writer_ready';\n`);
  for (let n = 0; !writerOutput.includes('writer_ready') && n < 100; n++) await pause();
  assert.ok(writerOutput.includes('writer_ready'), writerError || 'writer did not acquire locks');
  replay = spawn(docker, command(database), { stdio: ['pipe', 'pipe', 'pipe'], env: dockerEnv });
  let replayOutput = '', replayError = '';
  replay.stdout.on('data', b => { replayOutput += b; });
  replay.stderr.on('data', b => { replayError += b; });
  const finished = new Promise(resolve => replay.once('close', resolve));
  replay.stdin.end(`set application_name='wechat010_image_replay'; set request.jwt.claim.role='service_role'; select public.product_image_create_intent_wechat_v1('00000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401',repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288,'50000000-0000-4000-8000-000000000401','51000000-0000-4000-8000-000000000401');`);
  let blocked = false;
  for (let n = 0; n < 50; n++) {
    if (sql("select count(*) from pg_stat_activity where application_name='wechat010_image_replay' and wait_event_type='Lock'") === '1') { blocked = true; break; }
    await pause();
  }
  assert.ok(blocked, 'replay must wait for concurrent product/version commit');
  writer.stdin.end('commit;\n');
  assert.equal(await finished, 0, replayError);
  const recovered = JSON.parse(replayOutput.trim());
  assert.equal(recovered.status, 'noop', JSON.stringify(recovered));
  assert.equal(recovered.version_id, version);
  assert.equal(recovered.replayed, true);
  console.log('PASS: concurrent committed finalize state reconciles as same-version noop (isolated SQL, not two Mini gateway calls).');
} finally {
  writer?.stdin.destroy(); replay?.stdin.destroy();
  if (created) sql(`drop database ${database} with (force);`, 'postgres');
}
