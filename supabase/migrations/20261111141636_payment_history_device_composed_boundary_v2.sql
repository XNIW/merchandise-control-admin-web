-- One authenticated device boundary over the qualified private engines.
-- No raw resume/cancel, unbound grant or witness-free economic delivery.
create function public.payment_history_device_v2(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,
 p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;response jsonb;kind text;capability text;keys text[];begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='payment_history_device_denied';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4194304 then
  raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 if p_operation in('baseline_context','baseline_upload_create','baseline_upload_ready','baseline_upload_status','baseline_start',
  'baseline_status','baseline_review','baseline_apply','baseline_receipt','baseline_recover') then
  if p_operation='baseline_recover' then
   response:=app_private.payment_history_local_baseline_recovery_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
    p_device_token_hash,p_session_token_hash,p_credential_version,p_payload);
  else
   response:=app_private.payment_history_local_baseline_transfer_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
    p_device_token_hash,p_session_token_hash,p_credential_version,substr(p_operation,10),p_payload);
  end if;
  if response->>'ok' is distinct from 'true' or response->>'shop_id' is distinct from p_shop_id::text or not response ? 'result' then
   raise exception using errcode='40001',message='payment_history_response_invalid';end if;
  result:=response->'result';
 elsif p_operation in('local_prepare','local_stage','local_review','local_authorize','local_receipt','local_reconcile','local_abort') then
  if p_operation='local_prepare' then
   capability:=case when p_payload->>'kind'='Undo' then 'cancel' else 'import' end;
  elsif p_operation in('local_stage','local_review') then
   -- Lookup is private and never returned. Authenticate even an unknown ID.
   select operation_kind into kind from public.payment_history_local_publications where shop_id=p_shop_id
    and shop_device_id=p_shop_device_id and operation_id=(p_payload->>'operation_id')::uuid;
   capability:=case when kind='Undo' then 'cancel' else 'import' end;
  else capability:=null;end if;
  if capability is not null then
   perform app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
    p_device_token_hash,p_session_token_hash,p_credential_version,capability);
  end if;
  if p_operation='local_prepare' then
   result:=app_private.payment_history_local_prepare_intent_v2(p_shop_id,p_shop_device_id,p_payload);
  elsif p_operation='local_stage' then
   result:=app_private.payment_history_local_stage_v2(p_shop_id,p_shop_device_id,p_payload);
  elsif p_operation='local_review' then
   keys:=array['operation_id','content_digest','ordinal'];if p_payload ? 'review_token' then keys:=keys||'review_token'::text;end if;
   if not app_private.payment_history_local_keys_v2(p_payload,keys) then raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
   if kind='Undo' then
    result:=app_private.payment_history_local_review_undo_page_v2(p_shop_id,p_shop_device_id,(p_payload->>'operation_id')::uuid,p_payload->>'content_digest',
     (p_payload->>'ordinal')::integer,(p_payload->>'review_token')::uuid);
   else
    result:=app_private.payment_history_local_review_apply_page_v2(p_shop_id,p_shop_device_id,(p_payload->>'operation_id')::uuid,p_payload->>'content_digest',
     (p_payload->>'ordinal')::integer,(p_payload->>'review_token')::uuid);
   end if;
  elsif p_operation='local_authorize' then
   if not app_private.payment_history_local_keys_v2(p_payload,array['operation_id','content_digest','review_token']) then
    raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
   result:=app_private.payment_history_local_authorize_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,
    p_credential_version,(p_payload->>'operation_id')::uuid,p_payload->>'content_digest',(p_payload->>'review_token')::uuid);
  elsif p_operation='local_receipt' then
   if not app_private.payment_history_local_keys_v2(p_payload,array['operation_id','content_digest']) then
    raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
   result:=app_private.payment_history_local_receipt_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,
    p_credential_version,(p_payload->>'operation_id')::uuid,p_payload->>'content_digest');
  elsif p_operation='local_reconcile' then
   result:=app_private.payment_history_local_deliver_witness_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,p_payload);
  else
   keys:=array['operation_id','content_digest','witness_json'];if p_payload ? 'local_proof_json' then keys:=keys||'local_proof_json'::text;end if;
   if not app_private.payment_history_local_keys_v2(p_payload,keys) or jsonb_typeof(p_payload->'witness_json') is distinct from 'string'
    or (p_payload->'witness_json')::text is null then raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
   response:=app_private.payment_history_local_validate_outcome_witness_v2(p_payload->>'witness_json');
   if row(response->>'operation_id',response->>'content_digest') is distinct from row(p_payload->>'operation_id',p_payload->>'content_digest') then
    raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
   result:=app_private.payment_history_local_abort_witness_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,
    p_payload->>'witness_json',p_payload->>'local_proof_json');
  end if;
 else raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 if not app_private.payment_history_publishable_v1() or not app_private.pos_runtime_lease_is_valid_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id) then
  raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 response:=jsonb_build_object('ok',true,'shop_id',p_shop_id,'device_id',p_shop_device_id,'session_id',p_pos_session_id,'result',result);
 if octet_length(response::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return response;
end;$$;
revoke all on function public.payment_history_device_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_device_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) to service_role;
