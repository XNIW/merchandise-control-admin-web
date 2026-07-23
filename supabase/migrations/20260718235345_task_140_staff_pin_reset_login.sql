-- TASK-140: canonical staff PIN reset/login database contract.
--
-- The plaintext credential never reaches PostgreSQL. PIN length and generation
-- stay in the server-only TypeScript boundary; this migration only aligns the
-- persisted credential state, lifecycle semantics and both lockout domains.

-- Keep TASK-140 self-contained when origin/main is reset locally without the
-- staging-only MAC-ADMIN-W7POS-009 history. These definitions are idempotent
-- with the POS Admin contract already installed on public staging.
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
      'pos.discount_over_limit',
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
security invoker
set search_path = pg_catalog
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
  from public, anon, authenticated, service_role;
delete from public.staff_role_permissions as existing_permission
where existing_permission.role_key = 'pos_admin'
  and not exists (
    select 1
    from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical_permission
    where canonical_permission.permission_key = existing_permission.permission_key
  );
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
create or replace function app_private.staff_web_login_attempt_key_hash(
  p_shop_code text,
  p_staff_code text
)
returns text
language sql
immutable
strict
security invoker
set search_path = pg_catalog, extensions
as $$
  select 'sha256:' || encode(
    extensions.digest(
      upper(btrim(p_shop_code)) || ':' || upper(btrim(p_staff_code)),
      'sha256'
    ),
    'hex'
  );
$$;
revoke all on function app_private.staff_web_login_attempt_key_hash(text, text)
  from public, anon, authenticated;
create or replace function app_private.clear_staff_web_login_attempt_lockout(
  p_shop_id uuid,
  p_staff_code text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_shop_code text;
begin
  select shop_code
  into target_shop_code
  from public.shops
  where shop_id = p_shop_id;

  if target_shop_code is null or nullif(btrim(p_staff_code), '') is null then
    return;
  end if;

  update public.staff_web_login_attempts
  set failed_attempts = 0,
      locked_until = null,
      updated_at = now()
  where attempt_key_hash = app_private.staff_web_login_attempt_key_hash(
    target_shop_code,
    p_staff_code
  );
end;
$$;
revoke all on function app_private.clear_staff_web_login_attempt_lockout(uuid, text)
  from public, anon, authenticated;
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
set search_path = public, app_private, pg_temp
as $$
declare
  inserted_id uuid;
  normalized_reason text := app_private.normalize_admin_label(p_reason);
  safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if jsonb_typeof(safe_metadata) <> 'object' then
    safe_metadata := '{}'::jsonb;
  end if;

  safe_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'credential_generated', safe_metadata -> 'credential_generated',
      'credential_temporary_days', safe_metadata -> 'credential_temporary_days',
      'operation_result', safe_metadata -> 'operation_result',
      'permission_key', safe_metadata -> 'permission_key',
      'role_key', safe_metadata -> 'role_key',
      'staff_code', safe_metadata -> 'staff_code',
      'staff_id', safe_metadata -> 'staff_id',
      'session_invalidated', safe_metadata -> 'session_invalidated'
    )
  );

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
      safe_metadata
      || jsonb_build_object(
        'reason_provided', length(normalized_reason) > 0,
        'reason_length', length(normalized_reason),
        'code', p_code,
        'source', 'TASK-068I'
      )
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
end;
$$;
revoke all on function app_private.task068i_platform_recovery_audit(
  uuid, text, uuid, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
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
  if actor_id is null
    or (
      not app_private.is_active_shop_staff_admin_member(p_shop_id)
      and not app_private.is_platform_admin()
    ) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if v_role_key = 'pos_admin'
    and not app_private.is_active_shop_owner_member(p_shop_id)
    and not app_private.is_platform_admin() then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'unauthorized', jsonb_build_object('role_key', v_role_key)
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      null,
      audit_event_id
    );
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
    failed_attempts,
    locked_until,
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
    false,
    0,
    null,
    1,
    'active',
    actor_id,
    actor_id,
    now()
  )
  returning staff_id into v_staff_id;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id,
    v_staff_code
  );

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
create or replace function public.shop_staff_reset_credential(
  p_shop_id uuid,
  p_staff_id uuid,
  p_credential_kind text,
  p_credential_hash text,
  p_reason text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  v_reason text := app_private.normalize_admin_label(p_reason);
  v_staff_code text;
  v_staff_role_key text;
  audit_event_id uuid;
begin
  if actor_id is null
    or (
      not app_private.is_active_shop_staff_admin_member(p_shop_id)
      and not app_private.is_platform_admin()
    ) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  if length(v_reason) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.credential.reset.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'reason_required', app_private.shop_admin_reason_metadata(p_reason)
    );
    return app_private.shop_admin_action_result(false, 'reason_required', p_shop_id, p_staff_id::text, audit_event_id);
  end if;

  if v_credential_kind not in ('pin', 'password') or length(v_credential_hash) = 0 then
    return app_private.shop_admin_action_result(false, 'validation_failed', p_shop_id, p_staff_id::text);
  end if;

  select staff_code, role_key
  into v_staff_code, v_staff_role_key
  from public.staff_accounts
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  for update;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  if v_staff_role_key = 'pos_admin'
    and not app_private.is_active_shop_owner_member(p_shop_id)
    and not app_private.is_platform_admin() then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.credential.reset.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'unauthorized',
      app_private.shop_admin_reason_metadata(p_reason)
      || jsonb_build_object('role_key', v_staff_role_key)
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_staff_id::text,
      audit_event_id
    );
  end if;

  update public.staff_accounts
  set credential_kind = v_credential_kind,
      credential_hash = v_credential_hash,
      credential_updated_at = now(),
      credential_expires_at = p_credential_expires_at,
      credential_version = credential_version + 1,
      credential_status = 'active',
      must_change_credential = false,
      failed_attempts = 0,
      locked_until = null,
      session_invalidated_at = now(),
      status = case
        when status = 'suspended' then 'suspended'
        else 'active'
      end,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  returning staff_code into v_staff_code;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id,
    v_staff_code
  );

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.credential.reset.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    app_private.shop_admin_reason_metadata(p_reason)
    || jsonb_build_object('credential_kind', v_credential_kind, 'session_invalidated', true)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;
create or replace function public.shop_staff_clear_lockout(
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
  v_staff_code text;
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id, p_staff_id::text);
  end if;

  if length(v_reason) = 0 then
    audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.lockout.clear.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'reason_required', app_private.shop_admin_reason_metadata(p_reason)
    );
    return app_private.shop_admin_action_result(false, 'reason_required', p_shop_id, p_staff_id::text, audit_event_id);
  end if;

  update public.staff_accounts
  set failed_attempts = 0,
      locked_until = null,
      credential_status = case
        when credential_hash is null then 'pending_setup'
        when must_change_credential then 'rotation_required'
        else 'active'
      end,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  returning staff_code into v_staff_code;

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id,
    v_staff_code
  );

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.lockout.clear.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success', app_private.shop_admin_reason_metadata(p_reason)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;
create or replace function public.shop_staff_mutate_as_staff_web(
  p_actor_staff_id uuid,
  p_shop_id uuid,
  p_action text,
  p_target_staff_id uuid,
  p_staff_code text,
  p_display_name text,
  p_role_key text,
  p_credential_kind text,
  p_credential_hash text,
  p_reason text,
  p_credential_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_staff_code text := upper(btrim(coalesce(p_staff_code, '')));
  v_display_name text := app_private.normalize_admin_label(p_display_name);
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  v_reason text := app_private.normalize_admin_label(p_reason);
  v_reason_metadata jsonb;
  v_payload jsonb;
  v_actor_role_key text;
  v_actor_has_full_access boolean := false;
  v_actor_credential_version integer;
  v_actor_session_invalidated_at timestamptz;
  v_existing_staff_id uuid;
  v_mutated_staff_id uuid;
  v_target_staff_code text;
  v_target_role_key text;
  v_audit_event_id uuid;
  v_now timestamptz := now();
begin
  v_reason_metadata := jsonb_build_object(
    'reason_provided', length(v_reason) > 0,
    'reason_length', length(v_reason)
  );
  v_payload := jsonb_build_object('action', v_action);

  if coalesce(auth.role(), '') <> 'service_role' then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  select actor_row.role_key,
         actor_row.credential_version,
         actor_row.session_invalidated_at
  into v_actor_role_key,
       v_actor_credential_version,
       v_actor_session_invalidated_at
  from public.staff_accounts as actor_row
  join public.shops as shop_row
    on shop_row.shop_id = actor_row.shop_id
  where actor_row.staff_id = p_actor_staff_id
    and actor_row.shop_id = p_shop_id
    and actor_row.role_key in ('manager', 'pos_admin')
    and actor_row.status = 'active'
    and actor_row.credential_kind is not null
    and actor_row.credential_hash is not null
    and actor_row.credential_status = 'active'
    and actor_row.must_change_credential is not true
    and (actor_row.locked_until is null or actor_row.locked_until <= v_now)
    and (
      actor_row.credential_expires_at is null
      or actor_row.credential_expires_at > v_now
    )
    and actor_row.web_access_revoked_at is null
    and shop_row.shop_status = 'active'
    and shop_row.archived_at is null
  for share of actor_row, shop_row;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  perform 1
  from public.staff_web_sessions as actor_session
  where actor_session.shop_id = p_shop_id
    and actor_session.staff_id = p_actor_staff_id
    and actor_session.staff_credential_version = v_actor_credential_version
    and actor_session.status = 'active'
    and actor_session.revoked_at is null
    and actor_session.expires_at > v_now
    and (
      v_actor_session_invalidated_at is null
      or actor_session.issued_at >= v_actor_session_invalidated_at
    )
  limit 1
  for share;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  perform 1
  from public.staff_role_permissions as permission_row
  where permission_row.shop_id = p_shop_id
    and permission_row.role_key = v_actor_role_key
    and permission_row.permission_key in ('staff.write', 'shop_admin.full_access')
    and permission_row.enabled
  for share;

  if not found then
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      null,
      v_payload
    );
  end if;

  perform 1
  from public.staff_role_permissions as full_access_permission
  where full_access_permission.shop_id = p_shop_id
    and full_access_permission.role_key = v_actor_role_key
    and full_access_permission.permission_key = 'shop_admin.full_access'
    and full_access_permission.enabled
  for share;

  v_actor_has_full_access := found;

  if v_action not in ('create', 'reset_credential', 'clear_lockout') then
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      p_target_staff_id::text,
      null,
      '{}'::jsonb
    );
  end if;

  if v_action = 'create' then
    if p_target_staff_id is not null
      or v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      or length(v_display_name) = 0
      or v_role_key not in ('cashier', 'manager', 'viewer', 'pos_admin')
      or v_credential_kind not in ('pin', 'password')
      or v_credential_hash !~ '^\$scrypt-v1\$' then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.create.failure',
        'warning',
        'blocked',
        'staff',
        null,
        'validation_failed',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'validation_failed',
        p_shop_id,
        null,
        v_audit_event_id,
        v_payload
      );
    end if;

    if v_role_key = 'pos_admin' and not v_actor_has_full_access then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.create.failure',
        'warning',
        'blocked',
        'staff',
        null,
        'unauthorized',
        v_reason_metadata || jsonb_build_object('role_key', v_role_key)
      );
      return app_private.shop_admin_action_result(
        false,
        'unauthorized',
        p_shop_id,
        null,
        v_audit_event_id,
        v_payload
      );
    end if;

    select staff_id
    into v_existing_staff_id
    from public.staff_accounts
    where shop_id = p_shop_id
      and staff_code = v_staff_code
    limit 1
    for share;

    if v_existing_staff_id is not null then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.create.failure',
        'warning',
        'blocked',
        'staff',
        v_existing_staff_id::text,
        'duplicate_staff_code',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'duplicate_staff_code',
        p_shop_id,
        v_existing_staff_id::text,
        v_audit_event_id,
        v_payload
      );
    end if;

    begin
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
        locked_until,
        credential_version,
        credential_status,
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
        v_now,
        p_credential_expires_at,
        false,
        0,
        null,
        1,
        'active',
        v_now
      )
      returning staff_id into v_mutated_staff_id;
    exception
      when unique_violation then
        v_audit_event_id := app_private.write_staff_shop_admin_audit(
          p_actor_staff_id,
          p_shop_id,
          'shop.staff.create.failure',
          'warning',
          'blocked',
          'staff',
          null,
          'duplicate_staff_code',
          v_reason_metadata
        );
        return app_private.shop_admin_action_result(
          false,
          'duplicate_staff_code',
          p_shop_id,
          null,
          v_audit_event_id,
          v_payload
        );
    end;

    perform app_private.clear_staff_web_login_attempt_lockout(
      p_shop_id,
      v_staff_code
    );

    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      'shop.staff.create.success',
      'info',
      'success',
      'staff',
      v_mutated_staff_id::text,
      'success',
      v_reason_metadata
    );

    return app_private.shop_admin_action_result(
      true,
      'success',
      p_shop_id,
      v_mutated_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  if p_target_staff_id is null then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      null,
      'validation_failed',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'validation_failed',
      p_shop_id,
      null,
      v_audit_event_id,
      v_payload
    );
  end if;

  if length(v_reason) = 0 then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'reason_required',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'reason_required',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  select role_key
  into v_target_role_key
  from public.staff_accounts
  where staff_id = p_target_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  for update;

  if not found then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'not_found',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  if v_target_role_key = 'pos_admin' and not v_actor_has_full_access then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      case
        when v_action = 'reset_credential' then 'shop.staff.credential.reset.failure'
        else 'shop.staff.lockout.clear.failure'
      end,
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'unauthorized',
      v_reason_metadata || jsonb_build_object('role_key', v_target_role_key)
    );
    return app_private.shop_admin_action_result(
      false,
      'unauthorized',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  if v_action = 'reset_credential' then
    if v_credential_kind not in ('pin', 'password')
      or v_credential_hash !~ '^\$scrypt-v1\$' then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.credential.reset.failure',
        'warning',
        'blocked',
        'staff',
        p_target_staff_id::text,
        'validation_failed',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'validation_failed',
        p_shop_id,
        p_target_staff_id::text,
        v_audit_event_id,
        v_payload
      );
    end if;

    update public.staff_accounts
    set credential_kind = v_credential_kind,
        credential_hash = v_credential_hash,
        credential_updated_at = v_now,
        credential_expires_at = p_credential_expires_at,
        credential_version = greatest(coalesce(credential_version, 0) + 1, 1),
        credential_status = 'active',
        must_change_credential = false,
        failed_attempts = 0,
        locked_until = null,
        session_invalidated_at = v_now,
        status = case
          when status = 'suspended' then 'suspended'
          else 'active'
        end,
        updated_at = v_now
    where staff_id = p_target_staff_id
      and shop_id = p_shop_id
      and status <> 'archived'
    returning staff_id, staff_code
    into v_mutated_staff_id, v_target_staff_code;

    if not found then
      v_audit_event_id := app_private.write_staff_shop_admin_audit(
        p_actor_staff_id,
        p_shop_id,
        'shop.staff.credential.reset.failure',
        'warning',
        'blocked',
        'staff',
        p_target_staff_id::text,
        'not_found',
        v_reason_metadata
      );
      return app_private.shop_admin_action_result(
        false,
        'not_found',
        p_shop_id,
        p_target_staff_id::text,
        v_audit_event_id,
        v_payload
      );
    end if;

    update public.staff_web_sessions
    set status = 'revoked',
        revoked_at = v_now,
        revoked_reason = 'credential_reset',
        updated_at = v_now
    where shop_id = p_shop_id
      and staff_id = p_target_staff_id
      and status = 'active';

    perform app_private.clear_staff_web_login_attempt_lockout(
      p_shop_id,
      v_target_staff_code
    );

    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      'shop.staff.credential.reset.success',
      'warning',
      'success',
      'staff',
      v_mutated_staff_id::text,
      'success',
      v_reason_metadata
    );

    return app_private.shop_admin_action_result(
      true,
      'success',
      p_shop_id,
      v_mutated_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  update public.staff_accounts
  set failed_attempts = 0,
      locked_until = null,
      credential_status = case
        when credential_hash is null then 'pending_setup'
        when must_change_credential then 'rotation_required'
        else 'active'
      end,
      updated_at = v_now
  where staff_id = p_target_staff_id
    and shop_id = p_shop_id
    and status <> 'archived'
  returning staff_id, staff_code
  into v_mutated_staff_id, v_target_staff_code;

  if not found then
    v_audit_event_id := app_private.write_staff_shop_admin_audit(
      p_actor_staff_id,
      p_shop_id,
      'shop.staff.lockout.clear.failure',
      'warning',
      'blocked',
      'staff',
      p_target_staff_id::text,
      'not_found',
      v_reason_metadata
    );
    return app_private.shop_admin_action_result(
      false,
      'not_found',
      p_shop_id,
      p_target_staff_id::text,
      v_audit_event_id,
      v_payload
    );
  end if;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id,
    v_target_staff_code
  );

  v_audit_event_id := app_private.write_staff_shop_admin_audit(
    p_actor_staff_id,
    p_shop_id,
    'shop.staff.lockout.clear.success',
    'info',
    'success',
    'staff',
    v_mutated_staff_id::text,
    'success',
    v_reason_metadata
  );

  return app_private.shop_admin_action_result(
    true,
    'success',
    p_shop_id,
    v_mutated_staff_id::text,
    v_audit_event_id,
    v_payload
  );
end;
$$;
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
  delete from public.staff_role_permissions as existing_permission
  where existing_permission.shop_id = p_shop_id
    and existing_permission.role_key = 'pos_admin'
    and not exists (
      select 1
      from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical_permission
      where canonical_permission.permission_key = existing_permission.permission_key
    );

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
  from app_private.mac_admin_w7pos_009_pos_admin_permissions() as permissions
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
    locked_until,
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
    'pin',
    btrim(p_staff_credential_hash),
    now(),
    now() + interval '14 days',
    false,
    0,
    null,
    1,
    'active',
    p_actor_profile_id,
    p_actor_profile_id,
    now()
  )
  returning staff_id into created_staff_id;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id,
    '1001'
  );

  return created_staff_id;
end;
$$;
revoke all on function app_private.task051_insert_initial_manager(uuid, uuid, text, text)
  from public, anon, authenticated;
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
    where shop_id = p_shop_id
    for share;
  end if;

  if target_shop_id is null
    and normalized_shop_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    select shop_id, shop_code, shop_name, shop_status, archived_at
    into target_shop_id, target_shop_code, target_shop_name, target_shop_status, target_shop_archived_at
    from public.shops
    where shop_code = normalized_shop_code
    for share;
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
    and staff_code = '1001'
  for update;

  delete from public.staff_role_permissions as existing_permission
  where existing_permission.shop_id = target_shop_id
    and existing_permission.role_key = 'pos_admin'
    and not exists (
      select 1
      from app_private.mac_admin_w7pos_009_pos_admin_permissions() as canonical_permission
      where canonical_permission.permission_key = existing_permission.permission_key
    );

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
  from app_private.mac_admin_w7pos_009_pos_admin_permissions() as permissions
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
    set role_key = 'pos_admin',
        credential_expires_at = now() + interval '14 days',
        credential_hash = normalized_credential_hash,
        credential_kind = 'pin',
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
      locked_until,
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
      'pin',
      normalized_credential_hash,
      now(),
      now() + interval '14 days',
      false,
      0,
      null,
      1,
      'active',
      actor_id,
      actor_id,
      now(),
      now()
    )
    returning staff_id into recovered_staff_id;
  end if;

  perform app_private.clear_staff_web_login_attempt_lockout(
    target_shop_id,
    '1001'
  );

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
      'shop_code', target_shop_code,
      'shop_name', target_shop_name,
      'role_key', 'pos_admin',
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
-- Server-only Data API access used by staff/POS authentication and the
-- connected staff-admin read and permission-mutation paths. Reset the role
-- ACL first so broad default table privileges cannot survive this
-- least-privilege reconciliation.
revoke all on table public.audit_logs from service_role;
revoke all on table public.staff_accounts from service_role;
revoke all on table public.staff_accounts_safe from service_role;
revoke all on table public.staff_role_permissions from service_role;
revoke all on table public.staff_web_login_attempts from service_role;
revoke all on table public.staff_web_sessions from service_role;
revoke all on table public.shops from service_role;
revoke all on table public.shop_devices from service_role;
revoke all on table public.pos_device_credentials from service_role;
revoke all on table public.pos_sessions from service_role;
grant select, insert on table public.audit_logs to service_role;
grant select, update on table public.staff_accounts to service_role;
grant select on table public.staff_accounts_safe to service_role;
grant select, insert, update, delete on table public.staff_role_permissions to service_role;
grant select, insert, update on table public.staff_web_login_attempts to service_role;
grant select, insert, update on table public.staff_web_sessions to service_role;
grant select on table public.shops to service_role;
grant select, insert, update on table public.shop_devices to service_role;
grant select, insert, update on table public.pos_device_credentials to service_role;
grant select, insert, update on table public.pos_sessions to service_role;
revoke all on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) to authenticated;
revoke all on function public.shop_staff_reset_credential(
  uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.shop_staff_reset_credential(
  uuid, uuid, text, text, text, timestamptz
) to authenticated;
revoke all on function public.shop_staff_clear_lockout(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.shop_staff_clear_lockout(uuid, uuid, text)
  to authenticated;
revoke all on function public.shop_staff_mutate_as_staff_web(
  uuid, uuid, text, uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.shop_staff_mutate_as_staff_web(
  uuid, uuid, text, uuid, text, text, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.platform_recover_initial_manager_1001(
  uuid, text, text, text, text
) to authenticated;
notify pgrst, 'reload schema';
