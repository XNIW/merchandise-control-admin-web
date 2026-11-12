-- Private composition only. A lost upload response must recover the same
-- bounded source, without creating another pending object or adopting a peer's.
create table app_private.payment_history_baseline_upload_intents (
 shop_id uuid not null references public.shops(shop_id),shop_device_id uuid not null,
 request_key uuid not null check(request_key<>'00000000-0000-0000-0000-000000000000'::uuid),
 staff_id uuid not null,upload_id uuid not null unique references public.payment_history_uploads(upload_id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(shop_id,shop_device_id,request_key)
);
alter table app_private.payment_history_baseline_upload_intents enable row level security;
revoke all on table app_private.payment_history_baseline_upload_intents from public,anon,authenticated,service_role;

create function app_private.payment_history_baseline_upload_immutable_v2() returns trigger
language plpgsql set search_path='' as $$begin
 raise exception using errcode='55000',message='payment_history_baseline_upload_immutable';
end;$$;
revoke all on function app_private.payment_history_baseline_upload_immutable_v2() from public,anon,authenticated,service_role;
create trigger payment_history_baseline_upload_immutable before update or delete
 on app_private.payment_history_baseline_upload_intents for each row
 execute function app_private.payment_history_baseline_upload_immutable_v2();

create function app_private.payment_history_local_baseline_transfer_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare actor jsonb;intent record;upload public.payment_history_uploads;
 request uuid;response jsonb;begin
 if p_operation='context' then
  return app_private.payment_history_local_baseline_flow_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,p_operation,p_payload);
 end if;
 actor:=app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,'migrate');
 if p_operation='upload_create' then
  if not app_private.payment_history_local_keys_v2(p_payload,array['request_key','file_name','sha256','byte_length'])
   or jsonb_typeof(p_payload->'request_key') is distinct from 'string'
   or coalesce(p_payload->>'request_key','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or p_payload->>'request_key'='00000000-0000-0000-0000-000000000000'
   or jsonb_typeof(p_payload->'file_name') is distinct from 'string'
   or length(coalesce(p_payload->>'file_name','')) not between 15 and 256
   or p_payload->>'file_name' !~ '^[^/\\]+\.w7history\.zip$'
   or jsonb_typeof(p_payload->'sha256') is distinct from 'string' or coalesce(p_payload->>'sha256','') !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_payload->'byte_length') is distinct from 'string'
   or coalesce(p_payload->>'byte_length','') !~ '^[1-9][0-9]{0,7}$'
   or (p_payload->>'byte_length')::bigint>20971520 then
   raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
  request:=(p_payload->>'request_key')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('payment-history-baseline-upload:'||p_shop::text||':'||p_device::text||':'||request::text,0));
  select * into intent from app_private.payment_history_baseline_upload_intents
   where shop_id=p_shop and shop_device_id=p_device and request_key=request;
  if found then
   if intent.staff_id<>p_staff then raise exception using errcode='42501',message='payment_history_upload_actor_mismatch';end if;
   select * into strict upload from public.payment_history_uploads where upload_id=intent.upload_id and shop_id=p_shop;
   if upload.file_name is distinct from p_payload->>'file_name' or upload.file_sha256 is distinct from p_payload->>'sha256'
    or upload.byte_length is distinct from (p_payload->>'byte_length')::bigint then
    raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   response:=jsonb_build_object('ok',true,'shop_id',p_shop,'actor',actor,'result',
    jsonb_build_object('upload_id',upload.upload_id,'object_key',upload.object_key));
  else
   response:=app_private.payment_history_local_baseline_flow_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,
    p_operation,p_payload-'request_key');
   insert into app_private.payment_history_baseline_upload_intents(shop_id,shop_device_id,request_key,staff_id,upload_id)
    values(p_shop,p_device,request,p_staff,(response#>>'{result,upload_id}')::uuid);
  end if;
 else
  if p_operation in('upload_ready','upload_status','start') then
   if jsonb_typeof(p_payload->'upload_id') is distinct from 'string'
    or coalesce(p_payload->>'upload_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
   perform 1 from app_private.payment_history_baseline_upload_intents where shop_id=p_shop and shop_device_id=p_device
    and staff_id=p_staff and upload_id=(p_payload->>'upload_id')::uuid;
   if not found then raise exception using errcode='42501',message='payment_history_upload_actor_mismatch';end if;
  end if;
  response:=app_private.payment_history_local_baseline_flow_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,p_operation,p_payload);
 end if;
 if not app_private.payment_history_publishable_v1() or not app_private.pos_runtime_lease_is_valid_v1(p_shop,p_device,p_staff,p_session) then
  raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return response;
end;$$;
revoke all on function app_private.payment_history_local_baseline_transfer_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)
 from public,anon,authenticated,service_role;
