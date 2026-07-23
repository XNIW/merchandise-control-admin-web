-- MAC-ADMIN-W7POS-009: POS Admin built-in staff role for Win7POS.
-- Additive/idempotent. No raw PIN/password values are stored or returned.

alter table public.staff_accounts
  drop constraint if exists staff_accounts_role_key_check,
  add constraint staff_accounts_role_key_check
  check (role_key in ('cashier', 'manager', 'viewer', 'pos_admin'));
alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_role_key_check,
  add constraint staff_role_permissions_role_key_check
  check (role_key in ('cashier', 'manager', 'viewer', 'pos_admin'));
alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_permission_key_check,
  add constraint staff_role_permissions_permission_key_check
  check (
    permission_key in (
      'shop_admin.full_access',
      'pos.sell',
      'pos.pay',
      'pos.refund',
      'pos.void',
      'pos.discount',
      'catalog.view',
      'catalog.manage',
      'catalog.price_edit',
      'catalog.import',
      'catalog.export',
      'catalog.read',
      'catalog.write',
      'register.view',
      'register.manage',
      'users.view',
      'users.manage',
      'staff.read',
      'staff.write',
      'devices.read',
      'devices.write',
      'db.maintenance',
      'settings.view',
      'settings.write',
      'settings.manage',
      'settings.read',
      'printer.manage',
      'sync.manage',
      'sync.read',
      'sync.write',
      'pos.dashboard.read',
      'audit.view',
      'audit.read'
    )
  );
create or replace function app_private.mac_admin_w7pos_009_pos_admin_permissions()
returns table(permission_key text)
language sql
stable
set search_path = public, pg_temp
as $$
  select permissions.permission_key
  from (
    values
      ('shop_admin.full_access'),
      ('pos.sell'),
      ('pos.pay'),
      ('pos.refund'),
      ('pos.void'),
      ('pos.discount'),
      ('catalog.view'),
      ('catalog.manage'),
      ('catalog.price_edit'),
      ('catalog.import'),
      ('catalog.export'),
      ('catalog.read'),
      ('catalog.write'),
      ('register.view'),
      ('register.manage'),
      ('users.view'),
      ('users.manage'),
      ('staff.read'),
      ('staff.write'),
      ('devices.read'),
      ('devices.write'),
      ('db.maintenance'),
      ('settings.view'),
      ('settings.write'),
      ('settings.manage'),
      ('settings.read'),
      ('printer.manage'),
      ('sync.manage'),
      ('sync.read'),
      ('sync.write'),
      ('pos.dashboard.read'),
      ('audit.view'),
      ('audit.read')
  ) as permissions(permission_key);
$$;
revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from public;
revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from anon;
revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from authenticated;
insert into public.staff_role_permissions (
  shop_id,
  role_key,
  permission_key,
  enabled,
  updated_by_profile_id,
  updated_at
)
select
  shops.shop_id,
  'pos_admin',
  permissions.permission_key,
  true,
  null,
  now()
from public.shops
cross join app_private.mac_admin_w7pos_009_pos_admin_permissions() permissions
on conflict (shop_id, role_key, permission_key)
do update set
  enabled = true,
  updated_at = now();
create or replace function public.shop_staff_create(
  p_shop_id uuid,
  p_staff_code text,
  p_display_name text,
  p_role_key text,
  p_credential_kind text,
  p_credential_hash text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_staff_code text := upper(btrim(coalesce(p_staff_code, '')));
  v_display_name text := app_private.normalize_admin_label(p_display_name);
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  v_staff_id uuid;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or length(v_display_name) = 0
    or v_role_key not in ('cashier', 'manager', 'viewer', 'pos_admin')
    or v_credential_kind not in ('pin', 'password')
    or length(v_credential_hash) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'validation_failed', jsonb_build_object('staff_code_length', length(v_staff_code))
    );
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, null, audit_event_id);
  end if;

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
    credential_version,
    credential_status,
    created_by_profile_id,
    updated_by_profile_id,
    updated_at
  )
  values (
    p_shop_id,
    v_staff_code,
    v_display_name,
    v_role_key,
    'active',
    v_credential_kind,
    v_credential_hash,
    now(),
    p_credential_expires_at,
    true,
    1,
    'rotation_required',
    actor_id,
    actor_id,
    now()
  )
  returning staff_id into v_staff_id;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.create.success', 'info', 'success',
    'staff', v_staff_id::text, 'success',
    jsonb_build_object(
      'role_key', v_role_key,
      'credential_kind', v_credential_kind,
      'credential_version', 1
    )
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, v_staff_id::text, audit_event_id);
exception
  when unique_violation then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'duplicate_staff_code', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'duplicate_staff_code', p_shop_id, null, audit_event_id);
  when others then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'critical', 'failure',
      'staff', null, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(false, 'db_failure', p_shop_id, null, audit_event_id);
end;
$$;
revoke all on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) from public;
revoke all on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) from anon;
revoke all on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) from authenticated;
grant execute on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) to authenticated;
create or replace function app_private.task051_insert_initial_manager(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_display_name text,
  p_staff_credential_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  created_staff_id uuid;
begin
  insert into public.staff_role_permissions (
    shop_id,
    role_key,
    permission_key,
    enabled,
    updated_by_profile_id,
    updated_at
  )
  select
    p_shop_id,
    'pos_admin',
    permissions.permission_key,
    true,
    p_actor_profile_id,
    now()
  from app_private.mac_admin_w7pos_009_pos_admin_permissions() permissions
  on conflict (shop_id, role_key, permission_key)
  do update set
    enabled = true,
    updated_by_profile_id = excluded.updated_by_profile_id,
    updated_at = now();

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
    updated_at
  )
  values (
    p_shop_id,
    '1001',
    btrim(p_display_name),
    'pos_admin',
    'active',
    'password',
    btrim(p_staff_credential_hash),
    now(),
    now() + interval '14 days',
    false,
    0,
    1,
    'active',
    p_actor_profile_id,
    p_actor_profile_id,
    now()
  )
  returning staff_id into created_staff_id;

  return created_staff_id;
end;
$$;
revoke all on function app_private.task051_insert_initial_manager(
  uuid, uuid, text, text
) from public;
revoke all on function app_private.task051_insert_initial_manager(
  uuid, uuid, text, text
) from anon;
revoke all on function app_private.task051_insert_initial_manager(
  uuid, uuid, text, text
) from authenticated;
do $$
declare
  target_staff record;
begin
  for target_staff in
    select
      staff.staff_id,
      staff.shop_id,
      staff.role_key as previous_role_key,
      staff.status as previous_status
    from public.staff_accounts staff
    where staff.staff_code = '1001'
      and staff.role_key <> 'pos_admin'
      and not exists (
        select 1
        from public.staff_accounts existing_admin
        where existing_admin.shop_id = staff.shop_id
          and existing_admin.role_key in ('pos_admin', 'admin', 'shop_owner_staff')
          and existing_admin.status <> 'archived'
      )
  loop
    update public.staff_accounts
    set role_key = 'pos_admin',
        updated_at = now()
    where staff_id = target_staff.staff_id;

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
      null,
      'shop',
      target_staff.shop_id,
      'staff.role.backfill.promote_first_staff_pos_admin',
      'info',
      'success',
      'staff_account',
      target_staff.staff_id::text,
      jsonb_strip_nulls(
        jsonb_build_object(
          'category', 'staff.role.backfill',
          'action', 'promote_first_staff_pos_admin',
          'staffCode', '1001',
          'staff_code', '1001',
          'from_role_key', target_staff.previous_role_key,
          'previous_status', target_staff.previous_status,
          'role_key', 'pos_admin',
          'source', 'MAC-ADMIN-W7POS-009'
        )
      )
    );
  end loop;
end $$;
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
  select
    target_shop_id,
    'pos_admin',
    permissions.permission_key,
    true,
    actor_id,
    now()
  from app_private.mac_admin_w7pos_009_pos_admin_permissions() permissions
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
        role_key = 'pos_admin',
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
      'pos_admin',
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
      'role_key', 'pos_admin',
      'staff_code', '1001',
      'staff_id', recovered_staff_id,
      'session_invalidated', true
    )
  );

  return app_private.platform_action_result(true, 'success', target_shop_id, audit_event_id)
    || jsonb_build_object(
      'operation_result', operation_result,
      'role_key', 'pos_admin',
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
