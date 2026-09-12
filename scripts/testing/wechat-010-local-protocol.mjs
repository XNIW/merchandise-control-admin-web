// Deterministic/local-only protocol concurrency and latency, never shared staging.
import { readFileSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const container = "wechat010-staging141-ephemeral";
const base = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const run = sql => execFileSync("docker", base, { input:sql, encoding:"utf8", stdio:["pipe","pipe","pipe"] });
const service = `set role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',false);`;
const admin = `select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000001001","session_id":"10000000-0000-4000-8000-000000001001"}',false);`;
const profiles = `array['00000000-0000-4000-8000-000000001001']::uuid[]`;
const shops = `array['20000000-0000-4000-8000-000000001001']::uuid[]`;
const business = `public.wechat_mini_business_v1(repeat('7',64),repeat('d',64),${profiles},${shops},'read','{"p_rpc":"wechat_account_profile_v1","p_params":{}}')`;
const setup = readFileSync("supabase/tests/wechat_010_direct_pairing.sql","utf8").replace("select * from finish();", "").replace("rollback;", `
select pg_temp.service_context();
select public.wechat_mini_direct_issue_v1(pg_temp.proof('login'),repeat('7',64),${profiles},repeat('s',32));
select pg_temp.admin_context();
create table public.wechat010_test_context as select public.wechat_mini_pair_start_v1('wx0000000000000001',repeat('c',64),repeat('d',64),'12344321') as pairing;
select pg_temp.service_context();
select public.wechat_mini_pair_claim_v1(pg_temp.proof('pair_claim','a',null,'d','c'),repeat('c',64),repeat('0',64),${profiles});
select pg_temp.admin_context();
select public.wechat_mini_pair_admin_v1((select (pairing->>'pairing_id')::uuid from public.wechat010_test_context),repeat('d',64),'approve');
select pg_temp.service_context();
alter table public.wechat010_test_context add column proof uuid;
update public.wechat010_test_context set proof=pg_temp.proof('pair_confirm','a',(pairing->>'pairing_id')::uuid);
grant select on public.wechat010_test_context to service_role;
commit;`);
assert.doesNotMatch(run(setup), /not ok/);
// 100 DB-local samples, a real verified-session RPC, no network/provider time.
const times=run(`${service} create temporary table timings(ms double precision,payload integer); do $body$ declare started timestamptz; value jsonb; begin for i in 1..110 loop started=clock_timestamp();value:=${business}; if i>10 then insert into timings values(extract(epoch from clock_timestamp()-started)*1000,octet_length(value::text));end if;end loop;end $body$; select jsonb_build_object('samples',count(*),'warmup',10,'p50Ms',percentile_cont(0.5) within group(order by ms),'p95Ms',percentile_cont(0.95) within group(order by ms),'payloadBytes',max(payload)) from timings;`).trim().split('\n').at(-1);
function asyncSql(sql){
  const child=spawn('docker',base,{stdio:['pipe','pipe','pipe']});let output='';let error='';let readyResolve;
  const ready=new Promise(resolve=>{readyResolve=resolve;});
  child.stdout.on('data',chunk=>{output+=chunk; if(output.includes('LOCK_HELD'))readyResolve();});child.stderr.on('data',chunk=>{error+=chunk;});child.stdin.end(sql);
  const done=new Promise(resolve=>child.on('close',code=>resolve({code,output,error})));
  return {ready,done};
}
// The unlink transaction owns the same lock used by session-derived business
// RPCs. Both actual concurrent waiters must observe the committed revocation.
const holder=asyncSql(`begin;${admin} select public.wechat_mini_mapping_unlink_v1((select mapping_id from app_private.wechat_mini_mappings where revoked_at is null));select 'LOCK_HELD';select pg_sleep(0.5);commit;`);
await holder.ready;
const reader=asyncSql(`${service} select ${business};`);
const confirmer=asyncSql(`${service} select public.wechat_mini_pair_confirm_v1((select proof from public.wechat010_test_context),(select (pairing->>'pairing_id')::uuid from public.wechat010_test_context),repeat('0',64),${profiles})->>'ok';`);
const [unlinked,read,confirm]=await Promise.all([holder.done,reader.done,confirmer.done]);
assert.equal(unlinked.code,0);assert.notEqual(read.code,0);assert.match(read.error,/wechat_mini_session_expired/);assert.equal(confirm.code,0);assert.equal(confirm.output.trim().split('\n').at(-1),'false');
const result={environment:'isolated Docker PostgreSQL 17.6; selected 141 migrations plus direct delta; 1 canonical fixture profile, 1 shop, no real WeChat or network',sessionProfileLatency:JSON.parse(times),concurrency:{waiters:2,unlinkBeforeBusiness:'PASS',unlinkBeforePendingConfirmation:'PASS'},limitations:'DB-local profile latency only; business/provider/phone p50 p95 remain NOT_RUN'};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
