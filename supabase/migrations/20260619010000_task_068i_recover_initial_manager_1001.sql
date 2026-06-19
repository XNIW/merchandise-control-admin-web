-- TASK-068I: restore the emergency recovery RPC for initial manager 1001.
-- Additive/idempotent only. No raw credential is stored; the caller passes only
-- a server-side credential hash and receives the one-time value outside SQL.

create or replace function app_private.task068i_platform_recovery_audit(
  p_actor_profile_id uuid,
  p_scope text,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
begin
  insert into public.audit_logs (
    actor_profile_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    p_actor_profile_id,
    p_scope,
    p_shop_id,
    p_event_key,
    p_severity,
    p_result,
    p_target_type,
    p_target_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'reason_redacted', nullif(left(btrim(coalesce(p_reason, '')), 240), ''),
        'code', p_code,
        'source', 'TASK-068I'
      ) || coalesce(p_metadata, '{}'::jsonb)
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
exception
  when others then
    return null;
end;
$$;

revoke all on function app_private.task068i_platform_recovery_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from public;
revoke all on function app_private.task068i_platform_recovery_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from anon;
revoke all on function app_private.task068i_platform_recovery_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from authenticated;

create or replace function public.platform_recover_initial_manager_1001(
  p_shop_id uuid,
  p_shop_code text,
  p_staff_display_name text,
  p_staff_credential_hash text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  normalized_shop_code text := upper(btrim(coalesce(p_shop_code, '')));
  normalized_staff_display_name text := btrim(coalesce(p_staff_display_name, ''));
  normalized_credential_hash text := btrim(coalesce(p_staff_credential_hash, ''));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_staff_credential_status text;
  target_staff_credential_version integer;
  target_staff_id uuid;
  target_staff_must_change_credential boolean;
  target_staff_status text;
  target_staff_web_access_revoked_at timestamptz;
  target_shop_archived_at timestamptz;
  target_shop_code text;
  target_shop_id uuid;
  target_shop_name text;
  target_shop_status text;
  staff_count integer := 0;
  next_credential_version integer := 1;
  operation_result text := 'recreated';
  recovered_staff_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  if length(redacted_reason) < 8
    or length(normalized_staff_display_name) = 0
    or normalized_credential_hash !~ '^\$scrypt-v1\$' then
    audit_event_id := app_private.task068i_platform_recovery_audit(
      actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'blocked', 'staff_account', null, redacted_reason, 'validation_failed',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'validation_failed', null, audit_event_id);
  end if;

  if p_shop_id is not null then
    select shop_id, shop_code, shop_name, shop_status, archived_at
    into target_shop_id, target_shop_code, target_shop_name, target_shop_status, target_shop_archived_at
    from public.shops
    where shop_id = p_shop_id;
  end if;

  if target_shop_id is null
    and normalized_shop_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    select shop_id, shop_code, shop_name, shop_status, archived_at
    into target_shop_id, target_shop_code, target_shop_name, target_shop_status, target_shop_archived_at
    from public.shops
    where shop_code = normalized_shop_code;
  end if;

  if target_shop_id is null then
    audit_event_id := app_private.task068i_platform_recovery_audit(
      actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'blocked', 'shop', null, redacted_reason, 'shop_not_found',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'shop_not_found', null, audit_event_id);
  end if;

  if target_shop_status <> 'active' or target_shop_archived_at is not null then
    audit_event_id := app_private.task068i_platform_recovery_audit(
      actor_id, 'shop', target_shop_id, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'failure', 'staff_account', null, redacted_reason, 'shop_inactive',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'shop_inactive', target_shop_id, audit_event_id);
  end if;

  select count(*)::integer
  into staff_count
  from public.staff_accounts
  where shop_id = target_shop_id
    and staff_code = '1001';

  if staff_count > 1 then
    audit_event_id := app_private.task068i_platform_recovery_audit(
      actor_id, 'shop', target_shop_id, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'failure', 'staff_account', null, redacted_reason, 'duplicate_initial_manager',
      jsonb_build_object(
        'credential_generated', false,
        'operation_result', 'duplicate_initial_manager',
        'staff_code', '1001'
      )
    );
    return app_private.platform_action_result(false, 'duplicate_initial_manager', target_shop_id, audit_event_id);
  end if;

  select staff_id, credential_version, status, credential_status,
         must_change_credential, web_access_revoked_at
  into target_staff_id, target_staff_credential_version, target_staff_status,
       target_staff_credential_status, target_staff_must_change_credential,
       target_staff_web_access_revoked_at
  from public.staff_accounts
  where shop_id = target_shop_id
    and staff_code = '1001';

  insert into public.staff_role_permissions (
    shop_id,
    role_key,
    permission_key,
    enabled,
    updated_by_profile_id,
    updated_at
  )
  values (
    target_shop_id,
    'manager',
    'shop_admin.full_access',
    true,
    actor_id,
    now()
  )
  on conflict (shop_id, role_key, permission_key)
  do update set
    enabled = true,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now();

  if target_staff_id is not null then
    if target_staff_status = 'active'
      and target_staff_credential_status = 'active'
      and target_staff_must_change_credential is not true
      and target_staff_web_access_revoked_at is null then
      operation_result := 'credential_reset';
    else
      operation_result := 'reactivated_reset';
    end if;

    next_credential_version := greatest(coalesce(target_staff_credential_version, 0) + 1, 1);

    update public.staff_accounts
    set credential_expires_at = now() + interval '14 days',
        credential_hash = normalized_credential_hash,
        credential_kind = 'password',
        credential_status = 'active',
        credential_updated_at = now(),
        credential_version = next_credential_version,
        failed_attempts = 0,
        locked_until = null,
        must_change_credential = false,
        session_invalidated_at = now(),
        status = 'active',
        updated_by_profile_id = actor_id,
        updated_at = now(),
        web_access_revoked_at = null,
        web_access_revoked_by_staff_id = null,
        web_access_revoked_reason = null
    where staff_id = target_staff_id
    returning staff_id into recovered_staff_id;
  else
    operation_result := 'recreated';

    insert into public.staff_accounts (
      shop_id,
      staff_code,
      display_name,
      role_key,
      status,
      credential_kind,
      credential_hash,
      credential_updated_at,
      credential_expires_at,
      must_change_credential,
      failed_attempts,
      credential_version,
      credential_status,
      created_by_profile_id,
      updated_by_profile_id,
      updated_at,
      session_invalidated_at
    )
    values (
      target_shop_id,
      '1001',
      normalized_staff_display_name,
      'manager',
      'active',
      'password',
      normalized_credential_hash,
      now(),
      now() + interval '14 days',
      false,
      0,
      1,
      'active',
      actor_id,
      actor_id,
      now(),
      now()
    )
    returning staff_id into recovered_staff_id;
  end if;

  audit_event_id := app_private.task068i_platform_recovery_audit(
    actor_id, 'shop', target_shop_id, 'platform.staff_manager.initial_recovery.success',
    'info', 'success', 'staff_account', recovered_staff_id::text, redacted_reason, 'success',
    jsonb_build_object(
      'credential_generated', true,
      'credential_temporary_days', 14,
      'operation_result', operation_result,
      'permission_key', 'shop_admin.full_access',
      'role_key', 'manager',
      'staff_code', '1001',
      'staff_id', recovered_staff_id,
      'session_invalidated', true
    )
  );

  return app_private.platform_action_result(true, 'success', target_shop_id, audit_event_id)
    || jsonb_build_object(
      'operation_result', operation_result,
      'shop_code', target_shop_code,
      'shop_name', target_shop_name,
      'staff_code', '1001',
      'staff_id', recovered_staff_id
    );
exception
  when unique_violation then
    audit_event_id := app_private.task068i_platform_recovery_audit(
      actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
      'warning', 'blocked', 'staff_account', null, redacted_reason, 'conflict',
      jsonb_build_object('credential_generated', false, 'staff_code', '1001')
    );
    return app_private.platform_action_result(false, 'conflict', null, audit_event_id);
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task068i_platform_recovery_audit(
        actor_id, 'global', null, 'platform.staff_manager.initial_recovery.failure',
        'critical', 'failure', 'staff_account', null, redacted_reason, 'credential_update_database_error',
        jsonb_build_object('credential_generated', false, 'staff_code', '1001')
      );
    end if;
    return app_private.platform_action_result(false, 'credential_update_database_error', null, audit_event_id);
end;
$$;

revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from public;
revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from anon;
revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from authenticated;
grant execute on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
