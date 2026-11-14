-- Explicit v2 transport vector, not a larger canonical staging batch.
-- Each sub-batch still passes through the existing v1 actor, ordinal and fence
-- engine. All sub-batches share one SQL transaction and one gateway replay key.
create function app_private.payment_history_migration_stage_vector_v2(p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare chunk jsonb;reply jsonb;j public.payment_history_migration_runs;started timestamptz:=clock_timestamp();accepted integer:=0;last_ordinal integer;phase text;begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='payment_history_worker_denied';end if;
 if not app_private.payment_history_local_keys_v2(p_payload,array['run_id','lease_token','lease_fence','phase','chunks'])
  or octet_length(p_payload::text)>6291456 or coalesce(p_payload->>'phase','') not in('stage_objects','stage_movements')
  or jsonb_typeof(p_payload->'run_id') is distinct from 'string' or jsonb_typeof(p_payload->'lease_token') is distinct from 'string'
  or jsonb_typeof(p_payload->'lease_fence') is distinct from 'string' or coalesce(p_payload->>'lease_fence','') !~ '^[1-9][0-9]{0,18}$'
  or jsonb_typeof(p_payload->'chunks') is distinct from 'array' then raise exception using errcode='22023',message='payment_history_stage_vector_invalid';end if;
 if jsonb_array_length(p_payload->'chunks') not between 1 and 4 then raise exception using errcode='22023',message='payment_history_stage_vector_invalid';end if;
 -- Validate the entire vector shape before any row can be staged.
 for chunk in select value from jsonb_array_elements(p_payload->'chunks') loop
  if not app_private.payment_history_local_keys_v2(chunk,array['rows']) or jsonb_typeof(chunk->'rows') is distinct from 'array' then raise exception using errcode='22023',message='payment_history_stage_vector_invalid';end if;
  if jsonb_array_length(chunk->'rows') not between 1 and 200 then raise exception using errcode='22023',message='payment_history_chunk_limit';end if;
 end loop;
 phase:=p_payload->>'phase';
 select * into j from public.payment_history_migration_runs where run_id=(p_payload->>'run_id')::uuid for update;
 if not found or j.state<>'analysing' or j.lease_token is distinct from (p_payload->>'lease_token')::uuid or j.lease_fence is distinct from (p_payload->>'lease_fence')::bigint
  or j.lease_expires_at<=clock_timestamp() then raise exception using errcode='40001',message='payment_history_worker_fence_stale';end if;
 if j.attempt_started_at is null or j.attempt_started_at+interval '120 seconds'<=clock_timestamp() then raise exception using errcode='40001',message='payment_history_worker_deadline_exceeded';end if;
 for chunk in select value from jsonb_array_elements(p_payload->'chunks') loop
  reply:=public.payment_history_migration_worker_v1(phase,(p_payload-array['phase','chunks'])||jsonb_build_object('rows',chunk->'rows'));
  if reply->>'ok' is distinct from 'true' then raise exception using errcode='40001',message='payment_history_worker_response_invalid';end if;
  if j.attempt_started_at+interval '120 seconds'<=clock_timestamp() then raise exception using errcode='40001',message='payment_history_worker_deadline_exceeded';end if;
  accepted:=accepted+1;last_ordinal:=(chunk->'rows'->-1->>'ordinal')::integer;
 end loop;
 return jsonb_build_object('ok',true,'phase',phase,'accepted_chunks',accepted,'last_ordinal',last_ordinal,
  'sql_elapsed_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,3));
end;$$;
revoke all on function app_private.payment_history_migration_stage_vector_v2(jsonb) from public,anon,authenticated,service_role;

-- Gateway nonce/digest/replay/retention are unchanged.
create or replace function public.payment_history_worker_gateway_v1(p_request_id uuid,p_lane text,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare v_digest text;v_response jsonb;prior public.payment_history_worker_requests;begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='payment_history_worker_denied';end if;
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8388608
  or p_lane is null or p_lane not in ('import','migration') or p_operation is null
  or (p_lane='import' and p_operation not in ('claim_upload','verify_upload','reject_upload','claim','heartbeat','stage','finish','fail'))
  or (p_lane='migration' and p_operation not in ('claim','heartbeat','stage_objects','stage_movements','stage_vector_v2','finish','fail')) then raise exception using errcode='22023',message='payment_history_worker_operation_invalid';end if;
 v_digest:=encode(extensions.digest(convert_to(jsonb_build_object('lane',p_lane,'operation',p_operation,'payload',p_payload)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('history-worker-request:'||p_request_id::text,0));
 select * into prior from public.payment_history_worker_requests where request_id=p_request_id;
 if found then
  if prior.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
  if prior.created_at<clock_timestamp()-interval '1 hour' then raise exception using errcode='40001',message='payment_history_worker_request_expired';end if;
  return prior.response;
 end if;
 if p_operation in ('claim','claim_upload') then perform app_private.payment_history_replica_cleanup_v1();end if;
 if p_lane='import' then v_response:=public.payment_history_worker_v1(p_operation,p_payload);
 elsif p_operation='stage_vector_v2' then v_response:=app_private.payment_history_migration_stage_vector_v2(p_payload);
 else v_response:=public.payment_history_migration_worker_v1(p_operation,p_payload);end if;
 insert into public.payment_history_worker_requests(request_id,request_digest,response) values(p_request_id,v_digest,v_response);
 -- This is an ephemeral replay cache, never a financial or provenance table.
 delete from public.payment_history_worker_requests where request_id in(select request_id from public.payment_history_worker_requests where created_at<clock_timestamp()-interval '2 hours' order by created_at limit 100);
 return v_response;
end;$$;
