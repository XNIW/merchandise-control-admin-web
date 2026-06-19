-- TASK-072 final gate: read-only current-owner device authorization status.
-- Additive only. Mobile clients do not pass shop_id; the shop scope is resolved
-- server-side from the authenticated owner mapping.

begin;

create or replace function public.shop_device_status_current_owner(
  p_device_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_shop_id uuid;
  v_identifier text := btrim(coalesce(p_device_identifier, ''));
  v_device_status text;
  v_last_seen_at timestamptz;
  v_server_time timestamptz := now();
  v_recommended_action text;
begin
  if actor_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'reason_code', 'unauthorized',
      'recommended_action', 'sign_in'
    );
  end if;

  if length(v_identifier) = 0 or length(v_identifier) > 160 then
    return jsonb_build_object(
      'ok', false,
      'code', 'validation_failed',
      'status', 'unauthorized',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'reason_code', 'invalid_device_identifier',
      'recommended_action', 'retry_with_valid_device'
    );
  end if;

  select sis.shop_id into target_shop_id
  from public.shop_inventory_sources sis
  join public.shops s on s.shop_id = sis.shop_id
  where sis.owner_user_id = actor_id
    and sis.mapping_state = 'mapped'
    and sis.disabled_at is null
    and sis.shop_id is not null
    and s.shop_status = 'active'
  order by sis.verified_at desc nulls last, sis.created_at desc
  limit 1;

  if target_shop_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'shop_mapping_not_found',
      'status', 'unmapped',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'reason_code', 'shop_mapping_not_found',
      'recommended_action', 'configure_shop_mapping'
    );
  end if;

  select sd.status, sd.last_seen_at
    into v_device_status, v_last_seen_at
  from public.shop_devices sd
  where sd.shop_id = target_shop_id
    and sd.device_identifier = v_identifier
  limit 1;

  if v_device_status is null then
    return jsonb_build_object(
      'ok', true,
      'code', 'not_found',
      'status', 'not_found',
      'can_write', false,
      'server_time', v_server_time,
      'last_seen_at', null,
      'reason_code', 'device_not_registered',
      'recommended_action', 'register_device'
    );
  end if;

  v_recommended_action := case v_device_status
    when 'active' then 'allow'
    when 'pending' then 'wait_for_authorization'
    when 'revoked' then 'contact_shop_admin'
    when 'suspicious' then 'contact_shop_admin'
    else 'contact_shop_admin'
  end;

  return jsonb_build_object(
    'ok', v_device_status = 'active',
    'code', case when v_device_status = 'active' then 'success' else v_device_status end,
    'status', v_device_status,
    'can_write', v_device_status = 'active',
    'server_time', v_server_time,
    'last_seen_at', v_last_seen_at,
    'reason_code', case when v_device_status = 'active' then 'active' else v_device_status end,
    'recommended_action', v_recommended_action
  );
end;
$$;

revoke all on function public.shop_device_status_current_owner(text)
  from public, anon, authenticated;
grant execute on function public.shop_device_status_current_owner(text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
