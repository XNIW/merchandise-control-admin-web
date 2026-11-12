-- A session-bound review is never reused under a new lease. Recovery locks the
-- original job: either its original Apply committed, or resume fences the old
-- review before the current same-staff caller can obtain a new one.
create table app_private.payment_history_baseline_recovery_intents (
 shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null,request_key uuid not null,
 staff_id uuid not null,session_id uuid not null,credential_version integer not null,
 run_id uuid not null references public.payment_history_migration_runs(run_id),apply_request_key uuid not null,
 previous_review_digest text null,ack jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(shop_id,shop_device_id,request_key)
);
alter table app_private.payment_history_baseline_recovery_intents enable row level security;
revoke all on table app_private.payment_history_baseline_recovery_intents from public,anon,authenticated,service_role;
create function app_private.payment_history_baseline_recovery_immutable_v2() returns trigger
language plpgsql set search_path='' as $$begin
 raise exception using errcode='55000',message='payment_history_baseline_recovery_immutable';
end;$$;
revoke all on function app_private.payment_history_baseline_recovery_immutable_v2() from public,anon,authenticated,service_role;
create trigger payment_history_baseline_recovery_immutable before update or delete
 on app_private.payment_history_baseline_recovery_intents for each row execute function app_private.payment_history_baseline_recovery_immutable_v2();

create function app_private.payment_history_local_baseline_recovery_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare actor jsonb;j public.payment_history_migration_runs;r public.payment_history_runtime;old record;
 request uuid;apply_key uuid;run uuid;previous text;k text;ack jsonb;receipt text:=null;resumed jsonb;begin
 actor:=app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'migrate');
 if not app_private.payment_history_local_keys_v2(p_payload,array['recovery_request_key','run_id','apply_request_key']||
  case when p_payload?'previous_review_digest' then array['previous_review_digest'] else array[]::text[] end) then
  raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 foreach k in array array['recovery_request_key','run_id','apply_request_key'] loop
  if jsonb_typeof(p_payload->k) is distinct from 'string' or coalesce(p_payload->>k,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or p_payload->>k='00000000-0000-0000-0000-000000000000' then
   raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 end loop;
 if p_payload?'previous_review_digest' and (jsonb_typeof(p_payload->'previous_review_digest') is distinct from 'string'
  or coalesce(p_payload->>'previous_review_digest','') !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 request:=(p_payload->>'recovery_request_key')::uuid;apply_key:=(p_payload->>'apply_request_key')::uuid;
 run:=(p_payload->>'run_id')::uuid;previous:=p_payload->>'previous_review_digest';
 select * into j from public.payment_history_migration_runs where shop_id=p_shop and run_id=run for update;
 if not found or j.source_mode<>'local_baseline_v2' or j.source_context->>'device_id' is distinct from p_device::text
  or j.actor_kind<>'pos_staff_manager' or j.actor_id<>p_staff then
  raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
 if j.receipt is not null then
  if j.state<>'applied' or j.apply_request_key is distinct from apply_key then
   raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  receipt:=j.receipt::text;
  ack:=jsonb_build_object('schema_version',1,'state','committed','shop_id',p_shop,'device_id',p_device,'staff_id',p_staff,
   'session_id',p_session,'credential_version',p_version,'recovery_request_key',request,'run_id',run,'apply_request_key',apply_key,'previous_review_digest',previous);
 else
  if j.state not in('queued','analysing','review_ready') or j.apply_request_key is not null then
   raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
  select * into r from public.payment_history_runtime where shop_id=p_shop for share;
  if r.writer_authority<>'local' or r.writer_epoch::text is distinct from j.source_context->>'writer_epoch' then
   raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
  select * into old from app_private.payment_history_baseline_recovery_intents where shop_id=p_shop and shop_device_id=p_device and request_key=request;
  if found then
   if old.staff_id<>p_staff or old.session_id<>p_session or old.credential_version<>p_version or old.run_id<>run or old.apply_request_key<>apply_key
    or old.previous_review_digest is distinct from previous then
    raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   -- Do not reset worker leases or invalidate a newer review on response replay.
   if j.actor_session_id<>p_session or j.actor_credential_version<>p_version or j.review_digest is not null then
    raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
   ack:=old.ack;
  else
   if j.review_digest is distinct from previous and not (j.review_digest is null and previous is not null and exists(
    select 1 from app_private.payment_history_baseline_recovery_intents prior where prior.shop_id=p_shop and prior.shop_device_id=p_device
     and prior.staff_id=p_staff and prior.run_id=run and prior.apply_request_key=apply_key and prior.previous_review_digest=previous)) then
    raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
   resumed:=app_private.payment_history_local_baseline_flow_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'resume',jsonb_build_object('run_id',run));
   if resumed#>>'{result,run_id}' is distinct from run::text or resumed#>>'{result,state}' not in('queued','analysing','review_ready') then
    raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
   ack:=jsonb_build_object('schema_version',1,'state','uncommitted','shop_id',p_shop,'device_id',p_device,'staff_id',p_staff,
    'session_id',p_session,'credential_version',p_version,'recovery_request_key',request,'run_id',run,'apply_request_key',apply_key,'previous_review_digest',previous);
   insert into app_private.payment_history_baseline_recovery_intents(shop_id,shop_device_id,request_key,staff_id,session_id,credential_version,run_id,apply_request_key,previous_review_digest,ack)
    values(p_shop,p_device,request,p_staff,p_session,p_version,run,apply_key,previous,ack);
  end if;
 end if;
 if not app_private.payment_history_publishable_v1() or not app_private.pos_runtime_lease_is_valid_v1(p_shop,p_device,p_staff,p_session) then
  raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop,'actor',actor,'result',jsonb_build_object('recovery_ack_json',ack::text,'receipt_json',receipt));
end;$$;
revoke all on function app_private.payment_history_local_baseline_recovery_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb)
 from public,anon,authenticated,service_role;
