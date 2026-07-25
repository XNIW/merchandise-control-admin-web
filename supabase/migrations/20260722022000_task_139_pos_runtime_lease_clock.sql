-- TASK-139: a final POS publication must check expiry against wall clock time
-- after it has acquired every runtime lock.  `now()` is transaction-start
-- time, so it can otherwise accept a lease that expired while waiting on the
-- device advisory lock or a protected row.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

create or replace function app_private.pos_runtime_lease_is_valid_v1(
  p_shop_id uuid,
  p_shop_device_id uuid,
  p_staff_id uuid,
  p_pos_session_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_session_hint public.pos_sessions%rowtype;
  v_device_identifier text;
  v_checked_at timestamptz;
begin
  select session_row.* into v_session_hint
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id;

  if not found
    or v_session_hint.shop_id <> p_shop_id
    or v_session_hint.shop_device_id <> p_shop_device_id
    or v_session_hint.staff_id <> p_staff_id then
    return false;
  end if;

  select device.device_identifier into v_device_identifier
  from public.shop_devices device
  where device.shop_device_id = p_shop_device_id
    and device.shop_id = p_shop_id;

  if v_device_identifier is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || v_device_identifier, 0)
  );

  -- Lock every mutable lease component first.  Do not put temporal predicates
  -- in these locking reads: expiry may pass while any one of them waits.
  -- The complete lease is checked using one wall-clock value after all locks
  -- are held, so publication cannot escape with a stale transaction timestamp.
  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
  for share;
  if not found then return false; end if;

  perform 1
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
  for share;
  if not found then return false; end if;

  perform 1
  from public.shop_devices device
  where device.shop_device_id = p_shop_device_id
    and device.shop_id = p_shop_id
    and device.device_identifier = v_device_identifier
  for share;
  if not found then return false; end if;

  perform 1
  from public.pos_device_credentials credential
  where credential.pos_device_credential_id = v_session_hint.pos_device_credential_id
    and credential.shop_id = p_shop_id
    and credential.shop_device_id = p_shop_device_id
    and credential.staff_id = p_staff_id
  for share;
  if not found then return false; end if;

  perform 1
  from public.pos_sessions session_row
  where session_row.pos_session_id = p_pos_session_id
    and session_row.shop_id = p_shop_id
    and session_row.shop_device_id = p_shop_device_id
    and session_row.staff_id = p_staff_id
    and session_row.pos_device_credential_id = v_session_hint.pos_device_credential_id
    and session_row.staff_credential_version = v_session_hint.staff_credential_version
    and session_row.issued_at = v_session_hint.issued_at
  for share;
  if not found then return false; end if;

  v_checked_at := clock_timestamp();

  return exists (
    select 1
    from public.shops shop
    join public.staff_accounts staff
      on staff.staff_id = p_staff_id
     and staff.shop_id = shop.shop_id
    join public.shop_devices device
      on device.shop_device_id = p_shop_device_id
     and device.shop_id = shop.shop_id
    join public.pos_device_credentials credential
      on credential.pos_device_credential_id = v_session_hint.pos_device_credential_id
     and credential.shop_id = shop.shop_id
     and credential.shop_device_id = device.shop_device_id
     and credential.staff_id = staff.staff_id
    join public.pos_sessions session_row
      on session_row.pos_session_id = p_pos_session_id
     and session_row.shop_id = shop.shop_id
     and session_row.shop_device_id = device.shop_device_id
     and session_row.staff_id = staff.staff_id
     and session_row.pos_device_credential_id = credential.pos_device_credential_id
    where shop.shop_id = p_shop_id
      and shop.shop_status = 'active'
      and staff.status = 'active'
      and staff.credential_status = 'active'
      and staff.credential_version = session_row.staff_credential_version
      and staff.must_change_credential = false
      and staff.credential_hash is not null
      and (staff.credential_expires_at is null
        or staff.credential_expires_at > v_checked_at)
      and (staff.locked_until is null or staff.locked_until <= v_checked_at)
      and (staff.session_invalidated_at is null
        or staff.session_invalidated_at <= session_row.issued_at)
      and device.device_identifier = v_device_identifier
      and device.status = 'active'
      and device.revoked_at is null
      and credential.status = 'active'
      and credential.revoked_at is null
      and credential.expires_at > v_checked_at
      and credential.staff_credential_version = session_row.staff_credential_version
      and session_row.status = 'active'
      and session_row.revoked_at is null
      and session_row.expires_at > v_checked_at
      and session_row.issued_at = v_session_hint.issued_at
  );
end;
$$;

revoke all on function app_private.pos_runtime_lease_is_valid_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

-- Additive first-login V2: TTLs are converted to absolute expiries only after
-- the device/staff lease locks are held. The database wall clock is
-- authoritative and both leases are clamped to the current staff credential.
create or replace function public.pos_runtime_first_login_commit_v2(
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_device_identifier text,
  p_device_display_name text,
  p_app_version text,
  p_device_token_hash text,
  p_device_ttl_seconds integer,
  p_session_token_hash text,
  p_session_ttl_seconds integer,
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
  v_checked_at timestamptz;
  v_device_expires_at timestamptz;
  v_session_expires_at timestamptz;
begin
  if p_device_ttl_seconds is null
    or p_device_ttl_seconds not between 1 and 15552000
    or p_session_ttl_seconds is null
    or p_session_ttl_seconds not between 1 and 43200 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':' || p_device_identifier, 0)
  );

  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.credential_version = p_expected_credential_version
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  v_checked_at := clock_timestamp();
  if not exists (
      select 1
      from public.shops shop
      where shop.shop_id = p_shop_id
        and shop.shop_status = 'active'
    )
    or v_staff.status <> 'active'
    or v_staff.credential_status not in ('active', 'locked')
    or v_staff.must_change_credential
    or v_staff.credential_hash is null
    or (v_staff.locked_until is not null
      and v_staff.locked_until > v_checked_at)
    or (v_staff.credential_expires_at is not null
      and v_staff.credential_expires_at <= v_checked_at) then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  v_device_expires_at := v_checked_at
    + make_interval(secs => p_device_ttl_seconds);
  if v_staff.credential_expires_at is not null then
    v_device_expires_at := least(
      v_device_expires_at,
      v_staff.credential_expires_at
    );
  end if;
  v_session_expires_at := least(
    v_checked_at + make_interval(secs => p_session_ttl_seconds),
    v_device_expires_at
  );
  if v_device_expires_at <= v_checked_at
    or v_session_expires_at <= v_checked_at then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  return public.pos_runtime_first_login_commit_v1(
    p_shop_id,
    p_staff_id,
    p_expected_credential_version,
    p_device_identifier,
    p_device_display_name,
    p_app_version,
    p_device_token_hash,
    v_device_expires_at,
    p_session_token_hash,
    v_session_expires_at,
    p_metadata_redacted
  );
end;
$$;

revoke all on function public.pos_runtime_first_login_commit_v2(
  uuid, uuid, integer, text, text, text, text, integer,
  text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_runtime_first_login_commit_v2(
  uuid, uuid, integer, text, text, text, text, integer,
  text, integer, jsonb
) to service_role;

commit;
