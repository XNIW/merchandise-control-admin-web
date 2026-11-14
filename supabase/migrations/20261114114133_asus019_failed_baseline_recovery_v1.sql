-- Explicit recovery of one timed-out local baseline. The existing immutable
-- journal retains the failure before the current job is queued again. Worker
-- protocol, source upload, run identity, attempt limit and ordinary resume stay
-- unchanged. No authenticated role receives direct table/function privileges.
alter table app_private.payment_history_baseline_recovery_intents
 add column retry_failure jsonb,
 add column retry_parent_request_key uuid,
 add column retry_resumed_fence bigint,
 add column retry_resumed_attempts integer,
 add column retry_resumed_state text,
 add constraint payment_history_baseline_retry_shape check (
  (retry_failure is null and retry_parent_request_key is null and retry_resumed_fence is null
   and retry_resumed_attempts is null and retry_resumed_state is null)
  or coalesce((retry_failure is not null and jsonb_typeof(retry_failure)='object'
   and app_private.payment_history_local_keys_v2(retry_failure,array['schema_version','error_code','attempts','lease_fence','attempt_started_at','failed_at',
    'source_upload_id','source_sha256','source_byte_length','processed_objects','processed_movements'])
   and retry_failure->'schema_version'='1'::jsonb
   and retry_failure->>'error_code' is not distinct from 'history_worker_timeout'
   and jsonb_typeof(retry_failure->'attempts')='number' and retry_failure->>'attempts' in('1','2')
   and jsonb_typeof(retry_failure->'lease_fence')='string' and retry_failure->>'lease_fence' ~ '^[1-9][0-9]{0,18}$'
   and jsonb_typeof(retry_failure->'attempt_started_at')='string' and jsonb_typeof(retry_failure->'failed_at')='string'
   and jsonb_typeof(retry_failure->'source_upload_id')='string' and retry_failure->>'source_upload_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and jsonb_typeof(retry_failure->'source_sha256')='string' and retry_failure->>'source_sha256' ~ '^[0-9a-f]{64}$'
   and jsonb_typeof(retry_failure->'source_byte_length')='string' and retry_failure->>'source_byte_length' ~ '^[1-9][0-9]{0,7}$'
   and jsonb_typeof(retry_failure->'processed_objects')='number' and retry_failure->>'processed_objects' ~ '^(0|[1-9][0-9]{0,5})$'
   and jsonb_typeof(retry_failure->'processed_movements')='number' and retry_failure->>'processed_movements' ~ '^(0|[1-9][0-9]{0,5})$'
   and retry_resumed_fence is not null and retry_resumed_fence>0
   and retry_resumed_attempts is not null and retry_resumed_attempts between 1 and 3
   and retry_resumed_state is not null and retry_resumed_state in('queued','review_ready')),false)),
 add constraint payment_history_baseline_retry_parent foreign key(shop_id,shop_device_id,retry_parent_request_key)
  references app_private.payment_history_baseline_recovery_intents(shop_id,shop_device_id,request_key);
create index payment_history_baseline_retry_lineage on app_private.payment_history_baseline_recovery_intents
 (shop_id,shop_device_id,retry_parent_request_key) where retry_parent_request_key is not null;

create or replace function app_private.payment_history_local_baseline_recovery_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare actor jsonb;j public.payment_history_migration_runs;r public.payment_history_runtime;
 u public.payment_history_uploads;old app_private.payment_history_baseline_recovery_intents;
 prior app_private.payment_history_baseline_recovery_intents;has_old boolean;
 request uuid;apply_key uuid;run uuid;previous text;k text;ack jsonb;receipt text:=null;resumed jsonb;
 retry_failed boolean:=false;parent_key uuid;failure jsonb;resume_fence bigint;resume_attempts integer;resume_state text;
begin
 actor:=app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'migrate');
 if not app_private.payment_history_local_keys_v2(p_payload,array['recovery_request_key','run_id','apply_request_key']||
  case when p_payload?'previous_review_digest' then array['previous_review_digest'] else array[]::text[] end||
  case when p_payload?'retry_failed' then array['retry_failed'] else array[]::text[] end||
  case when p_payload?'previous_recovery_request_key' then array['previous_recovery_request_key'] else array[]::text[] end) then
  raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 foreach k in array array['recovery_request_key','run_id','apply_request_key']||
  case when p_payload?'previous_recovery_request_key' then array['previous_recovery_request_key'] else array[]::text[] end loop
  if jsonb_typeof(p_payload->k) is distinct from 'string' or coalesce(p_payload->>k,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or p_payload->>k='00000000-0000-0000-0000-000000000000' then
   raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 end loop;
 if p_payload?'previous_review_digest' and (jsonb_typeof(p_payload->'previous_review_digest') is distinct from 'string'
  or coalesce(p_payload->>'previous_review_digest','') !~ '^[0-9a-f]{64}$') then
  raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 if p_payload?'retry_failed' and p_payload->'retry_failed' is distinct from 'true'::jsonb then
  raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 retry_failed:=p_payload?'retry_failed';
 if p_payload?'previous_recovery_request_key' and not retry_failed then
  raise exception using errcode='22023',message='payment_history_baseline_recovery_invalid';end if;
 request:=(p_payload->>'recovery_request_key')::uuid;apply_key:=(p_payload->>'apply_request_key')::uuid;
 run:=(p_payload->>'run_id')::uuid;previous:=p_payload->>'previous_review_digest';parent_key:=(p_payload->>'previous_recovery_request_key')::uuid;
 select * into j from public.payment_history_migration_runs where shop_id=p_shop and run_id=run for update;
 if not found or j.source_mode<>'local_baseline_v2' or j.source_context->>'device_id' is distinct from p_device::text
  or j.actor_kind<>'pos_staff_manager' or j.actor_id<>p_staff then
  raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
 select * into old from app_private.payment_history_baseline_recovery_intents where shop_id=p_shop and shop_device_id=p_device and request_key=request;
 has_old:=found;
 if has_old and ((old.retry_failure is not null) is distinct from retry_failed or old.retry_parent_request_key is distinct from parent_key) then
  raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
 if has_old and retry_failed and (old.staff_id<>p_staff or old.run_id<>run or old.apply_request_key<>apply_key
  or old.previous_review_digest is distinct from previous) then
  raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
 if j.receipt is not null then
  if j.state<>'applied' or j.apply_request_key is distinct from apply_key then
   raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  receipt:=j.receipt::text;
  ack:=jsonb_build_object('schema_version',1,'state','committed','shop_id',p_shop,'device_id',p_device,'staff_id',p_staff,
   'session_id',p_session,'credential_version',p_version,'recovery_request_key',request,'run_id',run,'apply_request_key',apply_key,'previous_review_digest',previous);
 else
  if (not retry_failed and j.state not in('queued','analysing','review_ready')) or j.apply_request_key is not null then
   raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
  select * into r from public.payment_history_runtime where shop_id=p_shop for share;
  if r.writer_authority<>'local' or r.writer_epoch::text is distinct from j.source_context->>'writer_epoch' then
   raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
  if has_old then
   if old.staff_id<>p_staff or old.session_id<>p_session or old.credential_version<>p_version or old.run_id<>run or old.apply_request_key<>apply_key
    or old.previous_review_digest is distinct from previous then
    raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   -- Replaying an ACK never queues work, changes a deadline or clears a review.
   if j.actor_session_id<>p_session or j.actor_credential_version<>p_version or j.review_digest is not null
    or (retry_failed and (j.state not in('queued','analysing','review_ready','failed')
     or not ((j.lease_fence=old.retry_resumed_fence and j.attempts=old.retry_resumed_attempts)
      or (j.lease_fence=old.retry_resumed_fence+1 and j.attempts=old.retry_resumed_attempts+1)))) then
    raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
   ack:=old.ack;
  else
   if j.review_digest is distinct from previous and not (j.review_digest is null and previous is not null and exists(
    select 1 from app_private.payment_history_baseline_recovery_intents earlier where earlier.shop_id=p_shop and earlier.shop_device_id=p_device
     and earlier.staff_id=p_staff and earlier.run_id=run and earlier.apply_request_key=apply_key and earlier.previous_review_digest=previous)) then
    raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
   if retry_failed then
    -- The source comes from the original run and its immutable device upload
    -- intent, never from a recovery request or a replacement ZIP.
    select * into u from public.payment_history_uploads where shop_id=p_shop and upload_id=j.source_upload_id for share;
    if not found or u.state<>'verified' or u.verified_at is null or u.actor_kind<>'pos_staff_manager' or u.actor_id<>p_staff
     or u.object_key is distinct from 'history/'||p_shop::text||'/'||u.upload_id::text
     or coalesce(u.file_sha256,'') !~ '^[0-9a-f]{64}$' or u.byte_length not between 1 and 20971520
     or not exists(select 1 from app_private.payment_history_baseline_upload_intents i where i.shop_id=p_shop and i.shop_device_id=p_device and i.staff_id=p_staff and i.upload_id=u.upload_id) then
     raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
    if exists(select 1 from app_private.payment_history_baseline_recovery_intents i where i.shop_id=p_shop and i.shop_device_id=p_device
     and i.staff_id=p_staff and i.run_id=run and i.apply_request_key<>apply_key) then
     raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
    if parent_key is null then
     if j.state<>'failed' or j.error_code is distinct from 'history_worker_timeout' or j.attempts not between 1 and 2
      or j.lease_token is not null or j.lease_expires_at is not null then
      raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
     failure:=jsonb_build_object('schema_version',1,'error_code',j.error_code,'attempts',j.attempts,'lease_fence',j.lease_fence::text,
      'attempt_started_at',j.attempt_started_at,'failed_at',j.updated_at,'source_upload_id',j.source_upload_id,'source_sha256',u.file_sha256,
      'source_byte_length',u.byte_length::text,'processed_objects',j.processed_objects,'processed_movements',j.processed_movements);
     update public.payment_history_migration_runs set state='queued',actor_session_id=p_session,actor_credential_version=p_version,
      lease_token=null,lease_expires_at=null,lease_fence=lease_fence+1,review_digest=null,error_code=null,updated_at=clock_timestamp()
      where run_id=run returning * into j;
    else
     -- A caller can lose an accepted successor ACK or a deferred response. Its
     -- durable root cannot distinguish them. Resolve only immutable descendants
     -- of that exact root which prove the current attempt/fence, never another
     -- explicit retry root or a later failure.
     with recursive lineage as (
      select i.* from app_private.payment_history_baseline_recovery_intents i
       where i.shop_id=p_shop and i.shop_device_id=p_device and i.request_key=parent_key and i.retry_failure is not null
      union all
      select i.* from app_private.payment_history_baseline_recovery_intents i join lineage a
       on i.shop_id=a.shop_id and i.shop_device_id=a.shop_device_id and i.retry_parent_request_key=a.request_key
       and i.retry_failure=a.retry_failure and i.run_id=a.run_id and i.apply_request_key=a.apply_request_key and i.staff_id=a.staff_id)
     select * into prior from lineage a where
      (j.state=a.retry_resumed_state and j.lease_fence=a.retry_resumed_fence and j.attempts=a.retry_resumed_attempts)
      or (a.retry_resumed_state='queued' and j.state in('analysing','review_ready') and j.lease_fence=a.retry_resumed_fence+1 and j.attempts=a.retry_resumed_attempts+1)
      order by a.retry_resumed_fence desc,a.created_at desc,a.request_key limit 1;
     if not found or prior.retry_failure is null or prior.staff_id<>p_staff or prior.run_id<>run or prior.apply_request_key<>apply_key
      or prior.previous_review_digest is distinct from previous or prior.retry_failure->>'source_upload_id' is distinct from u.upload_id::text
      or prior.retry_failure->>'source_sha256' is distinct from u.file_sha256 or prior.retry_failure->>'source_byte_length' is distinct from u.byte_length::text
      or not ((j.state=prior.retry_resumed_state and j.lease_fence=prior.retry_resumed_fence and j.attempts=prior.retry_resumed_attempts)
       or (prior.retry_resumed_state='queued' and j.state in('analysing','review_ready') and j.lease_fence=prior.retry_resumed_fence+1 and j.attempts=prior.retry_resumed_attempts+1)) then
      raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
     -- Leave an active or expired Worker lease to its existing bounded policy.
     -- A successor cannot queue another attempt or extend its 30 minute budget.
     if j.state='analysing' then raise exception using errcode='40001',message='payment_history_baseline_retry_pending';end if;
     failure:=prior.retry_failure;
     resumed:=app_private.payment_history_local_baseline_flow_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'resume',jsonb_build_object('run_id',run));
     select * into j from public.payment_history_migration_runs where run_id=run;
    end if;
    resume_fence:=j.lease_fence;resume_attempts:=j.attempts;resume_state:=j.state;
   else
    resumed:=app_private.payment_history_local_baseline_flow_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'resume',jsonb_build_object('run_id',run));
    if resumed#>>'{result,run_id}' is distinct from run::text or resumed#>>'{result,state}' not in('queued','analysing','review_ready') then
     raise exception using errcode='40001',message='payment_history_baseline_recovery_conflict';end if;
   end if;
   ack:=jsonb_build_object('schema_version',1,'state','uncommitted','shop_id',p_shop,'device_id',p_device,'staff_id',p_staff,
    'session_id',p_session,'credential_version',p_version,'recovery_request_key',request,'run_id',run,'apply_request_key',apply_key,'previous_review_digest',previous);
   insert into app_private.payment_history_baseline_recovery_intents(shop_id,shop_device_id,request_key,staff_id,session_id,credential_version,run_id,apply_request_key,previous_review_digest,ack,
    retry_failure,retry_parent_request_key,retry_resumed_fence,retry_resumed_attempts,retry_resumed_state)
    values(p_shop,p_device,request,p_staff,p_session,p_version,run,apply_key,previous,ack,failure,parent_key,resume_fence,resume_attempts,resume_state);
  end if;
 end if;
 if not app_private.payment_history_publishable_v1() or not app_private.pos_runtime_lease_is_valid_v1(p_shop,p_device,p_staff,p_session) then
  raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop,'actor',actor,'result',jsonb_build_object('recovery_ack_json',ack::text,'receipt_json',receipt));
end;$$;
revoke all on function app_private.payment_history_local_baseline_recovery_v2(uuid,uuid,uuid,uuid,text,text,integer,jsonb)
 from public,anon,authenticated,service_role;
