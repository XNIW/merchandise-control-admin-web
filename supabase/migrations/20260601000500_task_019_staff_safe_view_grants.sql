-- TASK-019 reconciliation: keep staff_accounts_safe readable with security_invoker.
-- The safe view exposes credential/session metadata, so authenticated users also
-- need column-level SELECT on the underlying safe columns. No mutative grants.

grant select (
  credential_version,
  credential_status,
  session_invalidated_at
) on table public.staff_accounts to authenticated;

create or replace function public.shop_staff_reactivate(
  p_shop_id uuid,
  p_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_reason text := app_private.normalize_admin_label(p_reason);
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  if length(v_reason) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.reactivate.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'reason_required', app_private.shop_admin_reason_metadata(p_reason)
    );
    return app_private.shop_admin_action_result(false, 'reason_required', p_shop_id, p_staff_id::text, audit_event_id);
  end if;

  update public.staff_accounts
  set status = case
        when credential_hash is null then 'pending_credential'
        else 'active'
      end,
      credential_status = case
        when credential_hash is null then 'pending_setup'
        when locked_until is not null and locked_until > now() then 'locked'
        when must_change_credential then 'rotation_required'
        else 'active'
      end,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status = 'suspended';

  if not found then
    return app_private.shop_admin_action_result(false, 'invalid_state_or_not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.reactivate.success', 'info', 'success',
    'staff', p_staff_id::text, 'success', app_private.shop_admin_reason_metadata(p_reason)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_staff_force_credential_rotation(
  p_shop_id uuid,
  p_staff_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_reason text := app_private.normalize_admin_label(p_reason);
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  if length(v_reason) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.credential.rotation.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'reason_required', app_private.shop_admin_reason_metadata(p_reason)
    );
    return app_private.shop_admin_action_result(false, 'reason_required', p_shop_id, p_staff_id::text, audit_event_id);
  end if;

  update public.staff_accounts
  set must_change_credential = true,
      credential_status = case
        when credential_hash is null then 'pending_setup'
        when locked_until is not null and locked_until > now() then 'locked'
        else 'rotation_required'
      end,
      session_invalidated_at = now(),
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived';

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.credential.rotation.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    app_private.shop_admin_reason_metadata(p_reason) || jsonb_build_object('session_invalidated', true)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

revoke all on function public.shop_staff_reactivate(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_force_credential_rotation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.shop_staff_reactivate(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_force_credential_rotation(uuid, uuid, text) to authenticated;
