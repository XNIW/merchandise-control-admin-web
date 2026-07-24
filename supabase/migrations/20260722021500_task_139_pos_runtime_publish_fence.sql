-- TASK-139: a catalog page or heartbeat hint is not publishable merely
-- because an earlier read held a POS lease.  This final execute-only boundary
-- reacquires the canonical lease and records the success audit in one
-- transaction immediately before the HTTP response is released.

begin;

create or replace function public.pos_runtime_lease_publish_success_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid,
  p_publication_kind text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_audit_id uuid;
  v_event_key text;
  v_target_id text;
  v_target_type text;
begin
  if p_shop_id is null
    or p_shop_device_id is null
    or p_staff_id is null
    or p_pos_session_id is null
    or p_publication_kind is null
    or p_publication_kind not in ('catalog_pull', 'heartbeat') then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not app_private.pos_runtime_lease_is_valid_v1(
    p_shop_id, p_shop_device_id, p_staff_id, p_pos_session_id
  ) then
    return jsonb_build_object('status', 'denied');
  end if;

  v_event_key := case p_publication_kind
    when 'catalog_pull' then 'pos.catalog.pull.success'
    when 'heartbeat' then 'pos.session.heartbeat.success'
  end;
  v_target_id := case p_publication_kind
    when 'catalog_pull' then p_shop_device_id::text
    when 'heartbeat' then p_pos_session_id::text
  end;
  v_target_type := case p_publication_kind
    when 'catalog_pull' then 'device'
    when 'heartbeat' then 'pos_session'
  end;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, 'shop', p_shop_id, v_event_key,
    'info', 'success', v_target_type, v_target_id,
    jsonb_build_object(
      'publication_kind', p_publication_kind,
      'source', 'TASK-139'
    )
  ) returning audit_log_id into v_audit_id;

  return jsonb_build_object(
    'status', 'ok',
    'auditId', v_audit_id
  );
end;
$$;

revoke all on function public.pos_runtime_lease_publish_success_v1(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.pos_runtime_lease_publish_success_v1(
  uuid, uuid, uuid, uuid, text
) to service_role;

commit;
