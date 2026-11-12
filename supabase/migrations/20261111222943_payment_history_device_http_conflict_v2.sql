-- Preserve deterministic history denials across PostgREST versions that retry
-- SQLSTATE 40001. The SQL engine and its authentication/rollback stay intact.
create function public.payment_history_device_http_v2(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,
 p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 return public.payment_history_device_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
  p_device_token_hash,p_session_token_hash,p_credential_version,p_operation,p_payload);
exception when serialization_failure then
 -- Genuine database serialization failures retain their original semantics.
 -- Only the engine's bounded, deterministic domain denials become HTTP409.
 if sqlerrm ~ '^payment_history_[a-z_]{1,90}$' then
  raise exception using errcode='PT409',message=sqlerrm;
 end if;
 raise;
end;$$;
revoke all on function public.payment_history_device_http_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_device_http_v2(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) to service_role;
