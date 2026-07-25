-- TASK-139: staff web locks are temporary unless an explicit permanent lock remains.
-- The staff row is authoritative after an audited reset/clear. We intentionally do
-- not mutate the attempt row in either admin action: failure and commit acquire its
-- advisory lock before the staff row, and reversing that order can deadlock.

create or replace function public.staff_web_login_lookup_v1(
  p_shop_code text,
  p_staff_code text,
  p_attempt_key_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop public.shops%rowtype;
  v_staff public.staff_accounts%rowtype;
  v_attempt public.staff_web_login_attempts%rowtype;
  v_permissions jsonb := '[]'::jsonb;
  v_expired_temporary_lock boolean := false;
begin
  if p_shop_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
    or p_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_attempt
  from public.staff_web_login_attempts attempt
  where attempt.attempt_key_hash = p_attempt_key_hash;

  select * into v_shop
  from public.shops shop
  where shop.shop_code = p_shop_code;

  if v_shop.shop_id is not null then
    select * into v_staff
    from public.staff_accounts staff
    where staff.shop_id = v_shop.shop_id
      and staff.staff_code = p_staff_code;
  end if;

  v_expired_temporary_lock :=
    v_staff.staff_id is not null
    and v_staff.credential_status = 'locked'
    and v_staff.locked_until is not null
    and v_staff.locked_until <= now();

  if v_staff.staff_id is not null then
    select coalesce(jsonb_agg(permission.permission_key order by permission.permission_key), '[]'::jsonb)
    into v_permissions
    from public.staff_role_permissions permission
    where permission.shop_id = v_shop.shop_id
      and permission.role_key = v_staff.role_key
      and permission.enabled;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'attempt', case when v_attempt.attempt_key_hash is null then null else jsonb_build_object(
      'attempt_key_hash', v_attempt.attempt_key_hash,
      'failed_attempts', v_attempt.failed_attempts,
      'locked_until', v_attempt.locked_until
    ) end,
    'shop', case when v_shop.shop_id is null then null else jsonb_build_object(
      'shop_id', v_shop.shop_id,
      'shop_code', v_shop.shop_code,
      'shop_name', v_shop.shop_name,
      'shop_status', v_shop.shop_status,
      'company_rut', v_shop.company_rut
    ) end,
    'staff', case when v_staff.staff_id is null then null else jsonb_build_object(
      'staff_id', v_staff.staff_id,
      'shop_id', v_staff.shop_id,
      'staff_code', v_staff.staff_code,
      'display_name', v_staff.display_name,
      'role_key', v_staff.role_key,
      'status', v_staff.status,
      'credential_hash', v_staff.credential_hash,
      'credential_version', v_staff.credential_version,
      'credential_status', case when v_expired_temporary_lock then 'active' else v_staff.credential_status end,
      'credential_expires_at', v_staff.credential_expires_at,
      'failed_attempts', case when v_expired_temporary_lock then 0 else v_staff.failed_attempts end,
      'locked_until', case when v_expired_temporary_lock then null else v_staff.locked_until end,
      'must_change_credential', v_staff.must_change_credential,
      'session_invalidated_at', v_staff.session_invalidated_at,
      'web_access_revoked_at', v_staff.web_access_revoked_at
    ) end,
    'permissions', v_permissions
  );
end;
$$;

create or replace function public.staff_web_login_commit_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_attempt_key_hash text,
  p_session_token_hash text,
  p_expires_at timestamptz,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_attempt public.staff_web_login_attempts%rowtype;
  v_session_id uuid;
  v_expired_temporary_lock boolean := false;
begin
  if p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1
    or p_expires_at <= now()
    or p_expires_at > now() + interval '12 hours 5 minutes'
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_redacted, '{}'::jsonb)) > 4096 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-web-attempt:' || p_attempt_key_hash, 0));
  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return jsonb_build_object('ok', false, 'code', 'stale_identity'); end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id and staff.shop_id = p_shop_id
  for update;
  v_expired_temporary_lock := found
    and v_staff.credential_status = 'locked'
    and v_staff.locked_until is not null
    and v_staff.locked_until <= now();

  if not found
    or v_staff.status <> 'active'
    or v_staff.role_key <> 'manager'
    or (
      v_staff.credential_status <> 'active'
      and not v_expired_temporary_lock
    )
    or v_staff.credential_version <> p_expected_credential_version
    or v_staff.must_change_credential
    or v_staff.web_access_revoked_at is not null
    or (v_staff.locked_until is not null and v_staff.locked_until > now())
    or (v_staff.credential_expires_at is not null and v_staff.credential_expires_at <= now())
    or not exists (
      select 1 from public.staff_role_permissions permission
      where permission.shop_id = p_shop_id
        and permission.role_key = v_staff.role_key
        and permission.enabled
        and permission.permission_key in (
          'shop_admin.full_access', 'catalog.read', 'catalog.write',
          'catalog.import', 'catalog.export', 'staff.read', 'staff.write',
          'devices.read', 'devices.write', 'audit.read', 'settings.read',
          'settings.write', 'pos.dashboard.read', 'sync.read', 'sync.write',
          'history.write'
        )
    ) then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select * into v_attempt
  from public.staff_web_login_attempts attempt
  where attempt.attempt_key_hash = p_attempt_key_hash
  for update;
  if v_attempt.locked_until is not null
    and v_attempt.locked_until > now()
    and not (
      v_staff.credential_status = 'active'
      and v_staff.locked_until is null
    ) then
    return jsonb_build_object('ok', false, 'code', 'locked');
  end if;

  -- A temporary lock becomes active only at this final success boundary.
  -- Until the credential was verified by the server caller, every lease,
  -- permission, identity and attempt gate above remains fail-closed and the
  -- durable locked state is left untouched.
  if v_expired_temporary_lock then
    update public.staff_accounts staff
    set credential_status = 'active',
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where staff.staff_id = p_staff_id
      and staff.shop_id = p_shop_id
      and staff.credential_status = 'locked'
      and staff.locked_until is not null
      and staff.locked_until <= now()
    returning staff.* into v_staff;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'stale_identity');
    end if;
  end if;

  insert into public.staff_web_login_attempts (
    attempt_key_hash, failed_attempts, locked_until, last_success_at,
    metadata_redacted, updated_at
  ) values (
    p_attempt_key_hash, 0, null, now(), coalesce(p_metadata_redacted, '{}'::jsonb), now()
  )
  on conflict (attempt_key_hash) do update
  set failed_attempts = 0, locked_until = null, last_success_at = now(),
      metadata_redacted = excluded.metadata_redacted, updated_at = now();

  update public.staff_accounts
  set credential_status = 'active', failed_attempts = 0,
      locked_until = null, last_login_at = now(), updated_at = now()
  where staff_id = p_staff_id and shop_id = p_shop_id;

  insert into public.staff_web_sessions (
    shop_id, staff_id, session_token_hash, staff_credential_version,
    status, expires_at, last_seen_at, metadata_redacted
  ) values (
    p_shop_id, p_staff_id, p_session_token_hash, p_expected_credential_version,
    'active', p_expires_at, now(), coalesce(p_metadata_redacted, '{}'::jsonb)
  ) returning staff_web_session_id into v_session_id;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, 'shop', p_shop_id, 'staff.web.login.success',
    'info', 'success', 'staff', p_staff_id::text,
    coalesce(p_metadata_redacted, '{}'::jsonb)
      || jsonb_build_object('code', 'success', 'source', 'TASK-139')
  );

  return jsonb_build_object(
    'ok', true, 'code', 'success',
    'attemptKeyHash', p_attempt_key_hash,
    'shopId', p_shop_id,
    'staffId', p_staff_id,
    'credentialVersion', p_expected_credential_version,
    'staffWebSessionId', v_session_id,
    'expiresAt', p_expires_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
end;
$$;

revoke all on function public.staff_web_login_lookup_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_web_login_lookup_v1(text, text, text)
  to service_role;
revoke all on function public.staff_web_login_commit_v1(
  uuid, uuid, integer, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_login_commit_v1(
  uuid, uuid, integer, text, text, timestamptz, jsonb
) to service_role;
