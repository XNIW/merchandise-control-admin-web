-- TASK-139: staff-web lifecycle and device mutations must not use an
-- application-only preflight followed by service-role table DML.  This one
-- execute-only boundary keeps lease, target scope, session revocation,
-- permission replacement, audit and final publication in one transaction.

begin;

-- History mutation is a business capability, not a synonym for recovery-note
-- access. Keep the database constraint aligned with the narrow staff-web
-- permission tree before any role replacement can persist the new key.
alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_permission_key_check,
  add constraint staff_role_permissions_permission_key_check check (
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
      'history.write',
      'pos.dashboard.read',
      'audit.view',
      'audit.read'
    )
  );

-- Mobile metadata is client supplied and later rendered in the Admin Console.
-- Keep new values external/uncompressed and validate the mobile boundary with
-- an exact, non-recursive shape before accepting it in a lifecycle RPC.
create or replace function app_private.device_metadata_is_persistable_v1(
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  v_entry record;
  v_key_count integer := 0;
  v_text text;
  v_value_type text;
begin
  -- Mobile clients emit only a flat, redacted capability description. A
  -- strict shape avoids recursive inspection of attacker-controlled trees and
  -- prevents arbitrary URLs/tokens from becoming visible in device diagnostics.
  if jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 8192 then
    return false;
  end if;

  for v_entry in select key, value from jsonb_each(p_metadata)
  loop
    v_key_count := v_key_count + 1;
    if v_key_count > 6 then
      return false;
    end if;

    if v_entry.key not in (
      'platform', 'model', 'os_version', 'app_version_present', 'simulator', 'reason'
    ) then
      return false;
    end if;

    v_value_type := jsonb_typeof(v_entry.value);
    if v_entry.key in ('app_version_present', 'simulator') then
      if v_value_type <> 'boolean' then
        return false;
      end if;
      continue;
    end if;

    if v_value_type <> 'string' then
      return false;
    end if;
    v_text := v_entry.value #>> '{}';

    if v_entry.key = 'platform' then
      if v_text not in ('android', 'ios') then
        return false;
      end if;
    elsif v_entry.key = 'model' then
      if octet_length(v_text) not between 1 and 80
        or v_text !~ '^[A-Za-z0-9 .,_()-]+$' then
        return false;
      end if;
    elsif v_entry.key = 'os_version' then
      if octet_length(v_text) not between 1 and 80
        or v_text !~ '^[A-Za-z0-9 .,_()-]+$' then
        return false;
      end if;
    elsif v_entry.key = 'reason' then
      if v_text !~ '^[a-z][a-z0-9_.:-]{0,79}$' then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

-- Preserve the legacy helper signature while making it bounded and compatible
-- with the stricter allowlist used by all replacement device entrypoints.
create or replace function app_private.jsonb_has_sensitive_device_metadata_key(
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, app_private, pg_temp
as $$
begin
  return app_private.device_metadata_is_persistable_v1(p_metadata) is not true;
end;
$$;

revoke all on function app_private.device_metadata_is_persistable_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.jsonb_has_sensitive_device_metadata_key(jsonb)
  from public, anon, authenticated, service_role;

-- The persisted column also has a narrow POS first-login shape.  It remains
-- distinct from the mobile entrypoint: the historical POS flow has no device
-- model/OS fields but does persist a bounded source marker.  Do not make this
-- a table CHECK: existing rows with historical metadata must remain eligible
-- for heartbeat/status updates that do not rewrite the metadata column.
create or replace function app_private.device_metadata_is_persisted_v1(
  p_metadata jsonb
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  v_entry record;
  v_key_count integer := 0;
  v_has_app_version boolean := false;
  v_has_source boolean := false;
  v_source text;
begin
  -- Empty metadata is the historical/default form for both POS and mobile
  -- registrations that have no redacted diagnostics to publish. It is bounded
  -- and carries no opaque client data, so preserving it avoids turning the
  -- metadata hardening into a first-login or legacy-update compatibility break.
  if p_metadata = '{}'::jsonb then
    return true;
  end if;

  if app_private.device_metadata_is_persistable_v1(p_metadata) then
    return true;
  end if;

  if jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 8192 then
    return false;
  end if;

  for v_entry in select key, value from jsonb_each(p_metadata)
  loop
    v_key_count := v_key_count + 1;
    if v_key_count > 2 then
      return false;
    end if;

    if v_entry.key = 'app_version_present'
      and jsonb_typeof(v_entry.value) = 'boolean' then
      v_has_app_version := true;
    elsif v_entry.key = 'source'
      and jsonb_typeof(v_entry.value) = 'string' then
      v_source := v_entry.value #>> '{}';
      v_has_source := octet_length(v_source) between 1 and 80
        and v_source ~ '^[A-Za-z0-9_.:-]+$';
    else
      return false;
    end if;
  end loop;

  return v_key_count = 2 and v_has_app_version and v_has_source;
end;
$$;

create or replace function app_private.enforce_shop_device_metadata_redacted_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and new.metadata_redacted is not distinct from old.metadata_redacted then
    return new;
  end if;

  if app_private.device_metadata_is_persisted_v1(new.metadata_redacted)
    is not true then
    raise exception 'shop device metadata is not persistable'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function app_private.device_metadata_is_persisted_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.enforce_shop_device_metadata_redacted_v1()
  from public, anon, authenticated, service_role;

alter table public.shop_devices
  alter column metadata_redacted set storage external;

alter table public.shop_devices
  drop constraint if exists shop_devices_metadata_redacted_storage_bound_v1_check;

drop trigger if exists shop_devices_metadata_redacted_persisted_v1_trigger
  on public.shop_devices;

create trigger shop_devices_metadata_redacted_persisted_v1_trigger
before insert or update of metadata_redacted on public.shop_devices
for each row execute function app_private.enforce_shop_device_metadata_redacted_v1();

create or replace function app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
  p_shop_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if p_shop_id is null
    or p_actor_profile_id is null
    or auth.uid() is distinct from p_actor_profile_id then
    return false;
  end if;

  -- Fixed lock order: shop -> profile -> membership.  A membership/profile
  -- change therefore waits until the protected lifecycle result commits or
  -- fails, rather than racing an application-side preflight.
  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then return false; end if;

  perform 1
  from public.profiles profile
  where profile.profile_id = p_actor_profile_id
    and profile.profile_status = 'active'
  for share;
  if not found then return false; end if;

  perform 1
  from public.shop_members member
  where member.shop_id = p_shop_id
    and member.profile_id = p_actor_profile_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
  for share;
  return found;
end;
$$;

create or replace function app_private.personal_shop_owner_lifecycle_lease_is_valid_v1(
  p_shop_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  -- Reuse the fixed shop -> profile -> membership lock order, then narrow the
  -- already locked member row to the owner-only capability that matches the
  -- Admin device-management permission matrix.
  if not app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
    p_shop_id, p_actor_profile_id
  ) then
    return false;
  end if;

  perform 1
  from public.shop_members member
  where member.shop_id = p_shop_id
    and member.profile_id = p_actor_profile_id
    and member.membership_status = 'active'
    and member.role_key = 'shop_owner'
  for share;
  return found;
end;
$$;

create or replace function public.staff_web_lifecycle_mutate_v1(
  p_shop_id uuid,
  p_operation text,
  p_payload jsonb,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_personal_actor_id uuid := auth.uid();
  v_is_staff boolean := p_staff_id is not null;
  v_required_permission text;
  v_target_staff_id uuid;
  v_target_device_id uuid;
  v_target_id text;
  v_target_type text;
  v_event_base text;
  v_severity text;
  v_reason text;
  v_staff_code text;
  v_display_name text;
  v_role_key text;
  v_credential_kind text;
  v_credential_hash text;
  v_next_status text;
  v_device_identifier text;
  v_device_type text;
  v_app_version text;
  v_permissions text[] := array[]::text[];
  v_audit_id uuid;
  v_metadata jsonb;
  v_personal_requires_owner boolean := false;
begin
  if p_shop_id is null
    or p_operation is null
    or p_operation not in (
      'staff_create', 'staff_credential_reset', 'staff_status_set',
      'staff_credential_rotation_force', 'staff_lockout_clear',
      'staff_web_access_revoke', 'staff_web_sessions_revoke',
      'staff_role_permissions_replace', 'device_register', 'device_rename',
      'device_status_set'
    )
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 16384 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  v_personal_requires_owner := p_operation in (
    'device_register', 'device_rename', 'device_status_set'
  );

  if v_is_staff then
    if coalesce(auth.role(), '') <> 'service_role' then
      return jsonb_build_object(
        'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
      );
    end if;
    v_required_permission := case
      when p_operation in ('device_register', 'device_rename', 'device_status_set')
        then 'devices.write'
      when p_operation = 'staff_role_permissions_replace'
        then 'shop_admin.full_access'
      else 'staff.write'
    end;
    if not app_private.staff_web_runtime_lease_is_valid_v1(
      p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version, v_required_permission
    ) then
      return jsonb_build_object(
        'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
      );
    end if;
  elsif p_staff_web_session_id is not null
    or p_session_token_hash is not null
    or p_expected_credential_version is not null
    or not (
      case when v_personal_requires_owner
        then app_private.personal_shop_owner_lifecycle_lease_is_valid_v1(
          p_shop_id, v_personal_actor_id
        )
        else app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
          p_shop_id, v_personal_actor_id
        )
      end
    ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  begin
    if p_operation = 'staff_create' then
      v_staff_code := upper(btrim(coalesce(p_payload->>'staffCode', '')));
      v_display_name := app_private.normalize_admin_label(p_payload->>'displayName');
      v_role_key := btrim(coalesce(p_payload->>'roleKey', ''));
      v_credential_kind := btrim(coalesce(p_payload->>'credentialKind', ''));
      v_credential_hash := btrim(coalesce(p_payload->>'credentialHash', ''));
      if v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
        or length(v_display_name) not between 1 and 160
        or v_role_key not in ('cashier', 'manager', 'viewer')
        or v_credential_kind not in ('pin', 'password')
        or length(v_credential_hash) not between 1 and 4096 then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;
      insert into public.staff_accounts (
        shop_id, staff_code, display_name, role_key, status,
        credential_kind, credential_hash, credential_updated_at,
        must_change_credential, credential_version, credential_status,
        created_by_profile_id, updated_by_profile_id, updated_at
      ) values (
        p_shop_id, v_staff_code, v_display_name, v_role_key, 'active',
        v_credential_kind, v_credential_hash, now(), true, 1,
        'rotation_required',
        case when v_is_staff then null else v_personal_actor_id end,
        case when v_is_staff then null else v_personal_actor_id end,
        now()
      ) returning staff_id::text into v_target_id;
      v_target_type := 'staff';
      v_event_base := 'shop.staff.create';
      v_severity := 'info';

    elsif p_operation in (
      'staff_credential_reset', 'staff_status_set',
      'staff_credential_rotation_force', 'staff_lockout_clear',
      'staff_web_access_revoke', 'staff_web_sessions_revoke'
    ) then
      begin
        v_target_staff_id := nullif(p_payload->>'staffId', '')::uuid;
      exception when others then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end;
      v_reason := left(app_private.normalize_admin_label(p_payload->>'reason'), 240);
      if v_target_staff_id is null or length(v_reason) = 0 then
        return jsonb_build_object(
          'ok', false,
          'code', case when length(v_reason) = 0 then 'reason_required' else 'validation_failed' end,
          'shop_id', p_shop_id,
          'target_id', v_target_staff_id::text
        );
      end if;
      if v_is_staff
        and v_target_staff_id = p_staff_id
        and p_operation in (
          'staff_credential_reset', 'staff_status_set',
          'staff_credential_rotation_force', 'staff_web_access_revoke',
          'staff_web_sessions_revoke'
        ) then
        -- The final lease recheck must never be weakened to allow an actor to
        -- invalidate its own credential/session midway through this RPC.
        return jsonb_build_object(
          'ok', false, 'code', 'invalid_state', 'shop_id', p_shop_id,
          'target_id', v_target_staff_id::text
        );
      end if;

      if p_operation = 'staff_credential_reset' then
        v_credential_kind := btrim(coalesce(p_payload->>'credentialKind', ''));
        v_credential_hash := btrim(coalesce(p_payload->>'credentialHash', ''));
        if v_credential_kind not in ('pin', 'password')
          or length(v_credential_hash) not between 1 and 4096 then
          return jsonb_build_object(
            'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id,
            'target_id', v_target_staff_id::text
          );
        end if;
        update public.staff_accounts
        set credential_kind = v_credential_kind,
            credential_hash = v_credential_hash,
            credential_status = 'rotation_required',
            credential_updated_at = now(),
            credential_version = credential_version + 1,
            failed_attempts = 0,
            locked_until = null,
            must_change_credential = true,
            session_invalidated_at = now(),
            status = 'active',
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where staff_id = v_target_staff_id
          and shop_id = p_shop_id
          and status <> 'archived';
        if not found then
          return jsonb_build_object('ok', false, 'code', 'not_found',
            'shop_id', p_shop_id, 'target_id', v_target_staff_id::text);
        end if;
        update public.staff_web_sessions
        set revoked_at = now(), revoked_reason = 'credential_reset',
            status = 'revoked', updated_at = now()
        where shop_id = p_shop_id and staff_id = v_target_staff_id
          and status = 'active';
        v_event_base := 'shop.staff.credential.reset';
        v_severity := 'warning';

      elsif p_operation = 'staff_status_set' then
        v_next_status := btrim(coalesce(p_payload->>'nextStatus', ''));
        if v_next_status not in ('active', 'suspended', 'archived') then
          return jsonb_build_object('ok', false, 'code', 'validation_failed',
            'shop_id', p_shop_id, 'target_id', v_target_staff_id::text);
        end if;
        update public.staff_accounts
        set status = v_next_status,
            session_invalidated_at = case when v_next_status = 'active'
              then session_invalidated_at else now() end,
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where staff_id = v_target_staff_id and shop_id = p_shop_id
          and status <> 'archived'
          and (v_next_status <> 'active' or status = 'suspended');
        if not found then
          return jsonb_build_object('ok', false,
            'code', 'invalid_state_or_not_found', 'shop_id', p_shop_id,
            'target_id', v_target_staff_id::text);
        end if;
        if v_next_status <> 'active' then
          update public.staff_web_sessions
          set revoked_at = now(), revoked_reason = v_next_status,
              status = 'revoked', updated_at = now()
          where shop_id = p_shop_id and staff_id = v_target_staff_id
            and status = 'active';
        end if;
        v_event_base := 'shop.staff.' || case v_next_status
          when 'active' then 'reactivate' else v_next_status end;
        v_severity := case when v_next_status = 'active' then 'info' else 'warning' end;

      elsif p_operation = 'staff_credential_rotation_force' then
        update public.staff_accounts
        set credential_status = 'rotation_required', must_change_credential = true,
            session_invalidated_at = now(),
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where staff_id = v_target_staff_id and shop_id = p_shop_id
          and status <> 'archived';
        if not found then
          return jsonb_build_object('ok', false,
            'code', 'invalid_state_or_not_found', 'shop_id', p_shop_id,
            'target_id', v_target_staff_id::text);
        end if;
        update public.staff_web_sessions
        set revoked_at = now(), revoked_reason = 'credential_rotation_required',
            status = 'revoked', updated_at = now()
        where shop_id = p_shop_id and staff_id = v_target_staff_id
          and status = 'active';
        v_event_base := 'shop.staff.credential.rotation.force';
        v_severity := 'warning';

      elsif p_operation = 'staff_lockout_clear' then
        update public.staff_accounts
        set credential_status = case
              when credential_hash is null then 'pending_setup'
              when must_change_credential then 'rotation_required'
              else 'active'
            end,
            failed_attempts = 0, locked_until = null,
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where staff_id = v_target_staff_id and shop_id = p_shop_id
          and status <> 'archived';
        if not found then
          return jsonb_build_object('ok', false,
            'code', 'invalid_state_or_not_found', 'shop_id', p_shop_id,
            'target_id', v_target_staff_id::text);
        end if;
        v_event_base := 'shop.staff.lockout.clear';
        v_severity := 'info';

      elsif p_operation = 'staff_web_access_revoke' then
        update public.staff_accounts
        set session_invalidated_at = now(), web_access_revoked_at = now(),
            web_access_revoked_by_staff_id = case when v_is_staff then p_staff_id else null end,
            web_access_revoked_reason = v_reason,
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where staff_id = v_target_staff_id and shop_id = p_shop_id
          and status <> 'archived';
        if not found then
          return jsonb_build_object('ok', false,
            'code', 'invalid_state_or_not_found', 'shop_id', p_shop_id,
            'target_id', v_target_staff_id::text);
        end if;
        update public.staff_web_sessions
        set revoked_at = now(), revoked_reason = 'web_access_revoked',
            status = 'revoked', updated_at = now()
        where shop_id = p_shop_id and staff_id = v_target_staff_id
          and status = 'active';
        v_event_base := 'shop.staff.web_access.revoke';
        v_severity := 'warning';

      else
        update public.staff_accounts
        set session_invalidated_at = now(),
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where staff_id = v_target_staff_id and shop_id = p_shop_id
          and status <> 'archived';
        if not found then
          return jsonb_build_object('ok', false,
            'code', 'invalid_state_or_not_found', 'shop_id', p_shop_id,
            'target_id', v_target_staff_id::text);
        end if;
        update public.staff_web_sessions
        set revoked_at = now(), revoked_reason = coalesce(nullif(v_reason, ''), 'operator_revoked_sessions'),
            status = 'revoked', updated_at = now()
        where shop_id = p_shop_id and staff_id = v_target_staff_id
          and status = 'active';
        v_event_base := 'shop.staff.web_sessions.revoke';
        v_severity := 'warning';
      end if;
      v_target_id := v_target_staff_id::text;
      v_target_type := 'staff';

    elsif p_operation = 'staff_role_permissions_replace' then
      v_role_key := btrim(coalesce(p_payload->>'roleKey', ''));
      if v_role_key not in ('cashier', 'manager', 'viewer')
        or jsonb_typeof(p_payload->'permissions') <> 'array'
        or jsonb_array_length(p_payload->'permissions') > 15 then
        return jsonb_build_object('ok', false, 'code', 'validation_failed',
          'shop_id', p_shop_id);
      end if;
      select coalesce(array_agg(distinct permission.value order by permission.value), array[]::text[])
        into v_permissions
      from jsonb_array_elements_text(p_payload->'permissions') permission(value);
      if exists (
        select 1 from unnest(v_permissions) permission
        where permission not in (
          'shop_admin.full_access', 'catalog.read', 'catalog.write',
          'catalog.import', 'catalog.export', 'staff.read', 'staff.write',
          'devices.read', 'devices.write', 'audit.read', 'settings.read',
          'settings.write', 'pos.dashboard.read', 'sync.read', 'sync.write',
          'history.write'
        )
      ) then
        return jsonb_build_object('ok', false, 'code', 'validation_failed',
          'shop_id', p_shop_id, 'target_id', v_role_key);
      end if;
      if v_is_staff and v_role_key = 'manager'
        and not ('shop_admin.full_access' = any(v_permissions)) then
        -- Avoid self-deauthorization within the operation that must retain a
        -- valid manager lease through audit publication.
        return jsonb_build_object('ok', false, 'code', 'invalid_state',
          'shop_id', p_shop_id, 'target_id', v_role_key);
      end if;
      perform pg_advisory_xact_lock(
        hashtextextended(
          'staff-role-permissions:' || p_shop_id::text || ':' || v_role_key,
          0
        )
      );
      delete from public.staff_role_permissions permission
      where permission.shop_id = p_shop_id
        and permission.role_key = v_role_key
        and not (permission.permission_key = any(v_permissions));
      insert into public.staff_role_permissions (
        shop_id, role_key, permission_key, enabled,
        updated_by_profile_id, updated_at
      )
      select p_shop_id, v_role_key, permission, true,
        case when v_is_staff then null else v_personal_actor_id end, now()
      from unnest(v_permissions) permission
      on conflict (shop_id, role_key, permission_key)
      do update set enabled = true,
        updated_by_profile_id = excluded.updated_by_profile_id,
        updated_at = excluded.updated_at;
      v_target_id := v_role_key;
      v_target_type := 'staff_role';
      v_event_base := 'shop.staff.permissions.update';
      v_severity := 'warning';

    elsif p_operation = 'device_register' then
      v_device_identifier := btrim(coalesce(p_payload->>'deviceIdentifier', ''));
      v_display_name := app_private.normalize_admin_label(
        coalesce(nullif(p_payload->>'displayName', ''), v_device_identifier)
      );
      v_device_type := btrim(coalesce(p_payload->>'deviceType', 'unknown'));
      v_app_version := nullif(left(app_private.normalize_admin_label(p_payload->>'appVersion'), 80), '');
      v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);
      if length(v_device_identifier) not between 1 and 160
        or length(v_display_name) not between 1 and 160
        or v_device_type not in ('mobile', 'pos', 'web', 'unknown')
        or jsonb_typeof(v_metadata) <> 'object'
        or app_private.sync_jsonb_storage_is_bounded_v1(
          v_metadata, 8192, 0
        ) is not true
        or app_private.device_metadata_is_persistable_v1(v_metadata) is not true then
        return jsonb_build_object('ok', false, 'code', 'validation_failed',
          'shop_id', p_shop_id);
      end if;
      perform pg_advisory_xact_lock(
        hashtextextended(
          'staff-web-device:' || p_shop_id::text || ':' || v_device_identifier,
          0
        )
      );
      insert into public.shop_devices (
        shop_id, device_identifier, device_type, display_name, app_version,
        status, last_seen_at, last_seen_profile_id, last_seen_staff_id,
        last_seen_principal_kind, metadata_redacted, created_by_profile_id,
        updated_by_profile_id, updated_at
      ) values (
        p_shop_id, v_device_identifier, v_device_type, v_display_name,
        v_app_version, 'active', now(),
        case when v_is_staff then null else v_personal_actor_id end,
        case when v_is_staff then p_staff_id else null end,
        case when v_is_staff then 'pos_staff' else 'personal_account' end,
        v_metadata,
        case when v_is_staff then null else v_personal_actor_id end,
        case when v_is_staff then null else v_personal_actor_id end,
        now()
      )
      on conflict (shop_id, device_identifier)
      do update set
        device_type = excluded.device_type,
        display_name = excluded.display_name,
        app_version = excluded.app_version,
        last_seen_at = now(),
        last_seen_profile_id = excluded.last_seen_profile_id,
        last_seen_staff_id = excluded.last_seen_staff_id,
        last_seen_principal_kind = excluded.last_seen_principal_kind,
        metadata_redacted = excluded.metadata_redacted,
        status = case
          when public.shop_devices.status in ('revoked', 'suspicious')
            then public.shop_devices.status
          else 'active'
        end,
        updated_by_profile_id = excluded.updated_by_profile_id,
        updated_at = now()
      returning shop_device_id::text into v_target_id;
      v_target_type := 'device';
      v_event_base := 'shop.device.register';
      v_severity := 'info';

    elsif p_operation in ('device_rename', 'device_status_set') then
      begin
        v_target_device_id := nullif(p_payload->>'deviceId', '')::uuid;
      exception when others then
        return jsonb_build_object('ok', false, 'code', 'validation_failed',
          'shop_id', p_shop_id);
      end;
      if v_target_device_id is null then
        return jsonb_build_object('ok', false, 'code', 'validation_failed',
          'shop_id', p_shop_id);
      end if;
      if p_operation = 'device_rename' then
        v_display_name := app_private.normalize_admin_label(p_payload->>'displayName');
        if length(v_display_name) not between 1 and 160 then
          return jsonb_build_object('ok', false, 'code', 'validation_failed',
            'shop_id', p_shop_id, 'target_id', v_target_device_id::text);
        end if;
        update public.shop_devices
        set display_name = v_display_name,
            updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
            updated_at = now()
        where shop_device_id = v_target_device_id and shop_id = p_shop_id;
        if not found then
          return jsonb_build_object('ok', false, 'code', 'not_found',
            'shop_id', p_shop_id, 'target_id', v_target_device_id::text);
        end if;
        v_event_base := 'shop.device.rename';
        v_severity := 'info';
      else
        v_reason := left(app_private.normalize_admin_label(p_payload->>'reason'), 240);
        v_next_status := btrim(coalesce(p_payload->>'nextStatus', ''));
        if length(v_reason) = 0 then
          return jsonb_build_object('ok', false, 'code', 'reason_required',
            'shop_id', p_shop_id, 'target_id', v_target_device_id::text);
        end if;
        if v_next_status = 'revoked' then
          update public.shop_devices
          set status = 'revoked', revoked_at = now(),
              revoked_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
              updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
              updated_at = now()
          where shop_device_id = v_target_device_id and shop_id = p_shop_id
            and status <> 'revoked';
          v_event_base := 'shop.device.revoke';
          v_severity := 'warning';
        elsif v_next_status = 'active' then
          update public.shop_devices
          set status = 'active', revoked_at = null, revoked_by_profile_id = null,
              reactivated_at = now(),
              reactivated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
              updated_by_profile_id = case when v_is_staff then null else v_personal_actor_id end,
              updated_at = now()
          where shop_device_id = v_target_device_id and shop_id = p_shop_id
            and status = 'revoked';
          v_event_base := 'shop.device.reactivate';
          v_severity := 'warning';
        else
          return jsonb_build_object('ok', false, 'code', 'validation_failed',
            'shop_id', p_shop_id, 'target_id', v_target_device_id::text);
        end if;
        if not found then
          return jsonb_build_object('ok', false,
            'code', 'invalid_state_or_not_found', 'shop_id', p_shop_id,
            'target_id', v_target_device_id::text);
        end if;
      end if;
      v_target_id := v_target_device_id::text;
      v_target_type := 'device';
    end if;

    -- Reacquire the exact actor lease immediately before the audit/result
    -- boundary.  Raising inside this subtransaction rolls back all protected
    -- writes if the actor was revoked, expired or deauthorized in-flight.
    if v_is_staff then
      if not app_private.staff_web_runtime_lease_is_valid_v1(
        p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
        p_expected_credential_version, v_required_permission
      ) then
        raise exception 'staff web lifecycle lease expired before publication'
          using errcode = '42501';
      end if;
      v_audit_id := app_private.write_staff_shop_admin_audit(
        p_staff_id, p_shop_id, v_event_base || '.success', v_severity,
        'success', v_target_type, v_target_id, 'success',
        jsonb_build_object('source', 'TASK-139')
      );
      if not app_private.staff_web_runtime_lease_publishable_v1() then
        raise exception 'staff web lifecycle lease expired during publication'
          using errcode = '42501';
      end if;
    else
      if not (
        case when v_personal_requires_owner
          then app_private.personal_shop_owner_lifecycle_lease_is_valid_v1(
            p_shop_id, v_personal_actor_id
          )
          else app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
            p_shop_id, v_personal_actor_id
          )
        end
      ) then
        raise exception 'personal lifecycle lease expired before publication'
          using errcode = '42501';
      end if;
      v_audit_id := app_private.write_shop_admin_audit(
        p_shop_id, v_event_base || '.success', v_severity, 'success',
        v_target_type, v_target_id, 'success',
        jsonb_build_object('source', 'TASK-139')
      );
    end if;

    return app_private.shop_admin_action_result(
      true, 'success', p_shop_id, v_target_id, v_audit_id
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'code', case when p_operation = 'staff_create'
          then 'duplicate_staff_code' else 'conflict' end,
        'shop_id', p_shop_id,
        'target_id', v_target_id
      );
    when insufficient_privilege then
      return jsonb_build_object(
        'ok', false,
        'code', case when v_is_staff then 'session_expired' else 'permission_denied' end,
        'shop_id', p_shop_id,
        'target_id', v_target_id
      );
    when invalid_text_representation or numeric_value_out_of_range or check_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id,
        'target_id', v_target_id
      );
    when others then
      return jsonb_build_object(
        'ok', false, 'code', 'db_failure', 'shop_id', p_shop_id,
        'target_id', v_target_id
      );
  end;
end;
$$;

-- Audit rows emitted after a Staff Web request must carry the same final
-- session/permission fence as the mutation that caused them.  The server is
-- the only caller because it holds the staff-session binding; authenticated
-- browser clients never receive this execute grant.
create or replace function public.staff_web_audit_event_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_required_permission text,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_code text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_audit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  if coalesce(p_required_permission, '') not in ('catalog.import', 'catalog.export')
    or coalesce(p_event_key, '') !~ '^[a-z][a-z0-9_.]{1,159}$'
    or coalesce(p_severity, '') not in ('info', 'warning', 'critical')
    or coalesce(p_result, '') not in ('success', 'blocked', 'failure')
    or coalesce(p_target_type, '') !~ '^[a-z][a-z0-9_.]{1,79}$'
    or (p_target_id is not null and length(p_target_id) > 200)
    or coalesce(p_code, '') !~ '^[a-z][a-z0-9_]{1,63}$'
    or p_metadata is null
    or jsonb_typeof(p_metadata) <> 'object'
    or pg_column_size(p_metadata) > 8192 then
    return jsonb_build_object(
      'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
    );
  end if;

  if not app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id, p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version, p_required_permission
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
  end if;

  begin
    v_audit_id := app_private.write_staff_shop_admin_audit(
      p_staff_id, p_shop_id, p_event_key, p_severity, p_result,
      p_target_type, p_target_id, p_code, p_metadata
    );
    if not app_private.staff_web_runtime_lease_publishable_v1() then
      raise exception 'staff web audit lease expired before publication'
        using errcode = '42501';
    end if;
    return app_private.shop_admin_action_result(
      true, 'success', p_shop_id, p_target_id, v_audit_id
    );
  exception
    when insufficient_privilege then
      return jsonb_build_object(
        'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id,
        'target_id', p_target_id
      );
    when others then
      return jsonb_build_object(
        'ok', false, 'code', 'db_failure', 'shop_id', p_shop_id,
        'target_id', p_target_id
      );
  end;
end;
$$;

-- Mobile clients need a narrow self-enrolment capability while their selected
-- shop is a manager membership.  It is intentionally separate from the
-- owner-only Admin device-management RPCs and accepts mobile registrations
-- only; it cannot rename, revoke, reactivate or enrol a POS/web device.
create or replace function app_private.shop_device_mobile_enroll_v1(
  p_shop_id uuid,
  p_device_identifier text,
  p_device_type text default 'mobile',
  p_display_name text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_require_current_owner_mapping boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_identifier text;
  v_device_type text;
  v_display_name text;
  v_app_version text;
  v_metadata jsonb;
  v_device_id uuid;
  v_audit_id uuid;
begin
  -- Check raw values before trim/normalization/JSON traversal so an
  -- authenticated caller cannot make the narrow mobile path allocate or walk
  -- an oversized value that will ultimately be rejected.
  if octet_length(coalesce(p_device_identifier, '')) not between 1 and 160
    or octet_length(coalesce(p_device_type, 'mobile')) > 16
    or octet_length(coalesce(p_display_name, p_device_identifier, '')) not between 1 and 160
    or octet_length(coalesce(p_app_version, '')) > 80
    or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192 then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id
    );
  end if;

  v_identifier := btrim(coalesce(p_device_identifier, ''));
  v_device_type := btrim(coalesce(p_device_type, 'mobile'));
  v_display_name := app_private.normalize_admin_label(
    coalesce(p_display_name, p_device_identifier)
  );
  v_app_version := nullif(
    left(app_private.normalize_admin_label(p_app_version), 80), ''
  );
  v_metadata := coalesce(p_metadata, '{}'::jsonb);

  if v_actor_id is null
    or not app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
      p_shop_id, v_actor_id
    ) then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  if p_require_current_owner_mapping and not exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.owner_user_id = v_actor_id
      and source.mapping_state = 'mapped'
      and source.disabled_at is null
    for share
  ) then
    return app_private.shop_admin_action_result(
      false, 'shop_mapping_not_found', p_shop_id
    );
  end if;

  if v_device_type <> 'mobile'
    or length(v_identifier) not between 1 and 160
    or length(v_display_name) not between 1 and 160
    or jsonb_typeof(v_metadata) <> 'object'
    or app_private.sync_jsonb_storage_is_bounded_v1(
      v_metadata, 8192, 0
    ) is not true
    or app_private.device_metadata_is_persistable_v1(v_metadata) is not true then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id
    );
  end if;

  begin
    insert into public.shop_devices (
      shop_id, device_identifier, device_type, display_name, app_version,
      status, last_seen_at, last_seen_profile_id, last_seen_staff_id,
      last_seen_principal_kind, metadata_redacted, created_by_profile_id,
      updated_by_profile_id, updated_at
    ) values (
      p_shop_id, v_identifier, 'mobile', v_display_name, v_app_version,
      'active', now(), v_actor_id, null, 'personal_account', v_metadata,
      v_actor_id, v_actor_id, now()
    )
    on conflict (shop_id, device_identifier)
    do update set
      device_type = excluded.device_type,
      display_name = excluded.display_name,
      app_version = excluded.app_version,
      last_seen_at = now(),
      last_seen_profile_id = v_actor_id,
      last_seen_staff_id = null,
      last_seen_principal_kind = 'personal_account',
      metadata_redacted = excluded.metadata_redacted,
      status = case
        when public.shop_devices.status in ('revoked', 'suspicious')
          then public.shop_devices.status
        else 'active'
      end,
      updated_by_profile_id = v_actor_id,
      updated_at = now()
    where public.shop_devices.device_type = 'mobile'
    returning shop_device_id into v_device_id;

    if v_device_id is null then
      return app_private.shop_admin_action_result(
        false, 'device_identifier_conflict', p_shop_id
      );
    end if;

    if not app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
      p_shop_id, v_actor_id
    ) or (p_require_current_owner_mapping and not exists (
      select 1
      from public.shop_inventory_sources source
      where source.shop_id = p_shop_id
        and source.owner_user_id = v_actor_id
        and source.mapping_state = 'mapped'
        and source.disabled_at is null
      for share
    )) then
      raise exception 'mobile device enrolment lease expired before publication'
        using errcode = '42501';
    end if;

    v_audit_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.device.register.success', 'info', 'success',
      'device', v_device_id::text, 'success',
      jsonb_build_object('device_type', 'mobile', 'source', 'TASK-139')
    );
    return app_private.shop_admin_action_result(
      true, 'success', p_shop_id, v_device_id::text, v_audit_id
    );
  exception
    when insufficient_privilege then
      return app_private.shop_admin_action_result(
        false, 'unauthorized', p_shop_id
      );
    when others then
      return app_private.shop_admin_action_result(
        false, 'db_failure', p_shop_id
      );
  end;
end;
$$;

-- Preserve the legacy Admin signatures while routing their writes through the
-- owner-only lifecycle transaction.  These endpoints remain available for
-- compatibility but no longer let a shop_manager bypass devices.manage.
create or replace function public.shop_device_register(
  p_shop_id uuid,
  p_device_identifier text,
  p_device_type text default 'unknown',
  p_display_name text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if octet_length(coalesce(p_device_identifier, '')) > 160
    or octet_length(coalesce(p_device_type, '')) > 16
    or octet_length(coalesce(p_display_name, '')) > 160
    or octet_length(coalesce(p_app_version, '')) > 80
    or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192 then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id
    );
  end if;

  v_result := public.staff_web_lifecycle_mutate_v1(
    p_shop_id,
    'device_register',
    jsonb_build_object(
      'appVersion', p_app_version,
      'deviceIdentifier', p_device_identifier,
      'deviceType', p_device_type,
      'displayName', p_display_name,
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
  );
  if v_result->>'code' = 'permission_denied' then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;
  return v_result;
end;
$$;

create or replace function public.shop_device_rename(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if octet_length(coalesce(p_display_name, '')) > 160 then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id, p_shop_device_id::text
    );
  end if;

  v_result := public.staff_web_lifecycle_mutate_v1(
    p_shop_id,
    'device_rename',
    jsonb_build_object(
      'deviceId', p_shop_device_id,
      'displayName', p_display_name
    )
  );
  if v_result->>'code' = 'permission_denied' then
    return app_private.shop_admin_action_result(
      false, 'unauthorized', p_shop_id, p_shop_device_id::text
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.shop_device_revoke(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if octet_length(coalesce(p_reason, '')) > 240 then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id, p_shop_device_id::text
    );
  end if;

  v_result := public.staff_web_lifecycle_mutate_v1(
    p_shop_id,
    'device_status_set',
    jsonb_build_object(
      'deviceId', p_shop_device_id,
      'nextStatus', 'revoked',
      'reason', coalesce(
        nullif(app_private.normalize_admin_label(p_reason), ''),
        'legacy_device_status_change'
      )
    )
  );
  if v_result->>'code' = 'permission_denied' then
    return app_private.shop_admin_action_result(
      false, 'unauthorized', p_shop_id, p_shop_device_id::text
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.shop_device_reactivate(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if octet_length(coalesce(p_reason, '')) > 240 then
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id, p_shop_device_id::text
    );
  end if;

  v_result := public.staff_web_lifecycle_mutate_v1(
    p_shop_id,
    'device_status_set',
    jsonb_build_object(
      'deviceId', p_shop_device_id,
      'nextStatus', 'active',
      'reason', coalesce(
        nullif(app_private.normalize_admin_label(p_reason), ''),
        'legacy_device_status_change'
      )
    )
  );
  if v_result->>'code' = 'permission_denied' then
    return app_private.shop_admin_action_result(
      false, 'unauthorized', p_shop_id, p_shop_device_id::text
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.shop_device_register_current_owner(
  p_device_identifier text,
  p_device_type text default 'mobile',
  p_display_name text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shop_id uuid;
begin
  if v_actor_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized');
  end if;

  select source.shop_id into v_shop_id
  from public.shop_inventory_sources source
  join public.shops shop on shop.shop_id = source.shop_id
  where source.owner_user_id = v_actor_id
    and source.mapping_state = 'mapped'
    and source.disabled_at is null
    and source.shop_id is not null
    and shop.shop_status = 'active'
  order by source.verified_at desc nulls last, source.created_at desc
  limit 1;

  if v_shop_id is null then
    return app_private.shop_admin_action_result(false, 'shop_mapping_not_found');
  end if;

  return app_private.shop_device_mobile_enroll_v1(
    v_shop_id, p_device_identifier, p_device_type, p_display_name,
    p_app_version, p_metadata, true
  );
end;
$$;

create or replace function public.shop_device_register_for_shop(
  p_shop_id uuid,
  p_device_identifier text,
  p_device_type text default 'mobile',
  p_display_name text default null,
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shop_status text;
  v_role_key text;
  v_membership_status text;
begin
  if v_actor_id is null then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;

  select shop.shop_status, member.role_key, member.membership_status
    into v_shop_status, v_role_key, v_membership_status
  from public.shops shop
  left join public.shop_members member
    on member.shop_id = shop.shop_id
   and member.profile_id = v_actor_id
  where shop.shop_id = p_shop_id;

  if v_shop_status is null then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;
  if v_membership_status is null then
    return app_private.shop_admin_action_result(false, 'unauthorized', p_shop_id);
  end if;
  if v_membership_status is distinct from 'active' then
    return app_private.shop_admin_action_result(
      false, 'membership_not_active', p_shop_id
    );
  end if;
  if v_role_key not in ('shop_owner', 'shop_manager') then
    return app_private.shop_admin_action_result(false, 'write_not_allowed', p_shop_id);
  end if;
  if v_shop_status <> 'active' then
    return app_private.shop_admin_action_result(false, 'shop_not_active', p_shop_id);
  end if;

  return app_private.shop_device_mobile_enroll_v1(
    p_shop_id, p_device_identifier, p_device_type, p_display_name,
    p_app_version, p_metadata, false
  );
end;
$$;

revoke all on function app_private.personal_shop_admin_lifecycle_lease_is_valid_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.personal_shop_owner_lifecycle_lease_is_valid_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.shop_device_mobile_enroll_v1(
  uuid, text, text, text, text, jsonb, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.staff_web_lifecycle_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from public, anon;
grant execute on function public.staff_web_lifecycle_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;
revoke all on function public.staff_web_audit_event_v1(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_audit_event_v1(
  uuid, uuid, uuid, text, integer, text, text, text, text, text, text, text,
  jsonb
) to service_role;
revoke all on function public.shop_device_register(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.shop_device_rename(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.shop_device_revoke(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.shop_device_reactivate(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.shop_device_register(
  uuid, text, text, text, text, jsonb
) to authenticated;
grant execute on function public.shop_device_rename(uuid, uuid, text)
  to authenticated;
grant execute on function public.shop_device_revoke(uuid, uuid, text)
  to authenticated;
grant execute on function public.shop_device_reactivate(uuid, uuid, text)
  to authenticated;
revoke all on function public.shop_device_register_current_owner(
  text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.shop_device_register_for_shop(
  uuid, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.shop_device_register_current_owner(
  text, text, text, text, jsonb
) to authenticated;
grant execute on function public.shop_device_register_for_shop(
  uuid, text, text, text, text, jsonb
) to authenticated;

notify pgrst, 'reload schema';

commit;
