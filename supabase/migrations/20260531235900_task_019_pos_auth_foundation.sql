-- TASK-019: POS auth foundation implementation.
-- Scope: additive credential/session metadata, reasoned staff credential RPCs,
-- and redacted audit metadata. No POS login endpoint, no client session runtime,
-- no plaintext PIN/password storage.

alter table public.staff_accounts
  add column if not exists credential_version integer not null default 1,
  add column if not exists credential_status text not null default 'pending_setup',
  add column if not exists session_invalidated_at timestamptz;

update public.staff_accounts
set credential_version = greatest(coalesce(credential_version, 1), 1),
    credential_status = case
      when credential_hash is null then 'pending_setup'
      when locked_until is not null and locked_until > now() then 'locked'
      when must_change_credential then 'rotation_required'
      else 'active'
    end
where credential_version is null
   or credential_version < 1
   or credential_status is null
   or credential_status not in ('pending_setup', 'active', 'rotation_required', 'locked');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_accounts_credential_version_positive'
      and conrelid = 'public.staff_accounts'::regclass
  ) then
    alter table public.staff_accounts
      add constraint staff_accounts_credential_version_positive
      check (credential_version >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_accounts_credential_status_check'
      and conrelid = 'public.staff_accounts'::regclass
  ) then
    alter table public.staff_accounts
      add constraint staff_accounts_credential_status_check
      check (credential_status in ('pending_setup', 'active', 'rotation_required', 'locked'));
  end if;
end $$;

create or replace view public.staff_accounts_safe
with (security_invoker = true)
as
select
  staff_id,
  shop_id,
  staff_code,
  display_name,
  role_key,
  status,
  credential_kind,
  credential_updated_at,
  credential_expires_at,
  must_change_credential,
  failed_attempts,
  locked_until,
  last_login_at,
  created_at,
  updated_at,
  credential_version,
  credential_status,
  session_invalidated_at
from public.staff_accounts;

revoke all on table public.staff_accounts_safe from anon;
revoke all on table public.staff_accounts_safe from authenticated;
grant select on table public.staff_accounts_safe to authenticated;

create or replace function app_private.shop_admin_reason_metadata(p_reason text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'reason_provided', length(app_private.normalize_admin_label(p_reason)) > 0,
    'reason_length', length(app_private.normalize_admin_label(p_reason))
  );
$$;

revoke all on function app_private.shop_admin_reason_metadata(text) from public;
revoke all on function app_private.shop_admin_reason_metadata(text) from anon;
revoke all on function app_private.shop_admin_reason_metadata(text) from authenticated;

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
    or v_role_key not in ('cashier', 'manager', 'viewer')
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

drop function if exists public.shop_staff_reset_credential(uuid, uuid, text, text, timestamptz);

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
  audit_event_id uuid;
begin
  if actor_id is null or not app_private.is_active_shop_staff_admin_member(p_shop_id) then
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

  update public.staff_accounts
  set credential_kind = v_credential_kind,
      credential_hash = v_credential_hash,
      credential_updated_at = now(),
      credential_expires_at = p_credential_expires_at,
      credential_version = credential_version + 1,
      credential_status = 'rotation_required',
      must_change_credential = true,
      failed_attempts = 0,
      locked_until = null,
      session_invalidated_at = now(),
      status = case when status = 'archived' then status else 'active' end,
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status <> 'archived';

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.credential.reset.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    app_private.shop_admin_reason_metadata(p_reason)
    || jsonb_build_object('credential_kind', v_credential_kind, 'session_invalidated', true)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

create or replace function public.shop_staff_suspend(
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
      p_shop_id, 'shop.staff.suspend.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'reason_required', app_private.shop_admin_reason_metadata(p_reason)
    );
    return app_private.shop_admin_action_result(false, 'reason_required', p_shop_id, p_staff_id::text, audit_event_id);
  end if;

  update public.staff_accounts
  set status = 'suspended',
      session_invalidated_at = now(),
      updated_by_profile_id = actor_id,
      updated_at = now()
  where staff_id = p_staff_id
    and shop_id = p_shop_id
    and status in ('pending_credential', 'active');

  if not found then
    return app_private.shop_admin_action_result(false, 'invalid_state_or_not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.suspend.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    app_private.shop_admin_reason_metadata(p_reason) || jsonb_build_object('session_invalidated', true)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

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

create or replace function public.shop_staff_archive(
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
      p_shop_id, 'shop.staff.archive.failure', 'warning', 'blocked',
      'staff', p_staff_id::text, 'reason_required', app_private.shop_admin_reason_metadata(p_reason)
    );
    return app_private.shop_admin_action_result(false, 'reason_required', p_shop_id, p_staff_id::text, audit_event_id);
  end if;

  update public.staff_accounts
  set status = 'archived',
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
    p_shop_id, 'shop.staff.archive.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success',
    app_private.shop_admin_reason_metadata(p_reason) || jsonb_build_object('session_invalidated', true)
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
    and status <> 'archived';

  if not found then
    return app_private.shop_admin_action_result(false, 'not_found', p_shop_id, p_staff_id::text);
  end if;

  audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.lockout.clear.success', 'warning', 'success',
    'staff', p_staff_id::text, 'success', app_private.shop_admin_reason_metadata(p_reason)
  );

  return app_private.shop_admin_action_result(true, 'success', p_shop_id, p_staff_id::text, audit_event_id);
end;
$$;

revoke all on function public.shop_staff_create(uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.shop_staff_reset_credential(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.shop_staff_suspend(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_reactivate(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_archive(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_force_credential_rotation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.shop_staff_clear_lockout(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.shop_staff_create(uuid, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.shop_staff_reset_credential(uuid, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.shop_staff_suspend(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_reactivate(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_archive(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_force_credential_rotation(uuid, uuid, text) to authenticated;
grant execute on function public.shop_staff_clear_lockout(uuid, uuid, text) to authenticated;
