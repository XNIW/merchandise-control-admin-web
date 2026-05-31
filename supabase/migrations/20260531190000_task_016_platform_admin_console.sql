-- TASK-016: Platform Admin Console global read policies and emergency device action.
-- Additive only: no hard delete, no broad mutation grants, no browser secret dependency.

drop policy if exists shop_devices_select_platform_admin
  on public.shop_devices;
create policy shop_devices_select_platform_admin
  on public.shop_devices
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
  );

drop policy if exists sync_events_select_platform_admin
  on public.sync_events;
create policy sync_events_select_platform_admin
  on public.sync_events
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
  );

create or replace function public.platform_emergency_revoke_device(
  p_shop_device_id uuid,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_device public.shop_devices%rowtype;
  target_shop public.shops%rowtype;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select *
  into target_device
  from public.shop_devices
  where shop_device_id = p_shop_device_id
  for update;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.device.emergency_revoke.failure',
      'warning', 'blocked', 'device', p_shop_device_id::text, redacted_reason, 'device_not_found'
    );
    return app_private.platform_action_result(false, 'device_not_found', null, audit_event_id);
  end if;

  select *
  into target_shop
  from public.shops
  where shop_id = target_device.shop_id
  for update;

  if not found then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'global', null, 'platform.device.emergency_revoke.failure',
      'warning', 'blocked', 'device', p_shop_device_id::text, redacted_reason, 'shop_not_found'
    );
    return app_private.platform_action_result(false, 'shop_not_found', null, audit_event_id);
  end if;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', target_device.shop_id, 'platform.device.emergency_revoke.attempt',
    'warning', 'success', 'device', target_device.shop_device_id::text, redacted_reason, 'attempt'
  );

  if length(redacted_reason) = 0
    or upper(btrim(coalesce(p_confirmation, ''))) <> target_shop.shop_code then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', target_device.shop_id, 'platform.device.emergency_revoke.failure',
      'warning', 'blocked', 'device', target_device.shop_device_id::text, redacted_reason, 'validation_failed'
    );
    return app_private.platform_action_result(false, 'validation_failed', target_device.shop_id, audit_event_id);
  end if;

  if target_device.status = 'revoked' then
    audit_event_id := app_private.write_platform_shop_audit(
      actor_id, 'shop', target_device.shop_id, 'platform.device.emergency_revoke.failure',
      'warning', 'blocked', 'device', target_device.shop_device_id::text, redacted_reason, 'invalid_state'
    );
    return app_private.platform_action_result(false, 'invalid_state', target_device.shop_id, audit_event_id);
  end if;

  update public.shop_devices
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = actor_id,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where shop_device_id = target_device.shop_device_id;

  audit_event_id := app_private.write_platform_shop_audit(
    actor_id, 'shop', target_device.shop_id, 'platform.device.emergency_revoke.success',
    'critical', 'success', 'device', target_device.shop_device_id::text, redacted_reason, 'success'
  );

  return app_private.platform_action_result(true, 'success', target_device.shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.write_platform_shop_audit(
        actor_id, 'shop', target_device.shop_id, 'platform.device.emergency_revoke.failure',
        'critical', 'failure', 'device', p_shop_device_id::text, redacted_reason, 'db_failure'
      );
    end if;
    return app_private.platform_action_result(false, 'db_failure', target_device.shop_id, audit_event_id);
end;
$$;

revoke all on function public.platform_emergency_revoke_device(uuid, text, text) from public;
revoke all on function public.platform_emergency_revoke_device(uuid, text, text) from anon;
revoke all on function public.platform_emergency_revoke_device(uuid, text, text) from authenticated;
grant execute on function public.platform_emergency_revoke_device(uuid, text, text) to authenticated;
