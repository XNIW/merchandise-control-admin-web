-- TASK-144: authoritative, replay-bounded POS offline authorization.
-- The public function is service-role-only and delegates the existing token /
-- session creation to V1 inside the same transaction.  No raw credential,
-- token or request payload is persisted as attestation metadata.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

alter table public.pos_device_credentials
  add column if not exists offline_authorization_issued_at timestamptz,
  add column if not exists offline_authorization_expires_at timestamptz,
  add column if not exists offline_authorization_invalidated_at timestamptz,
  add column if not exists offline_authorization_policy_version text;

alter table public.pos_sessions
  add column if not exists offline_authorization_issued_at timestamptz,
  add column if not exists offline_authorization_expires_at timestamptz,
  add column if not exists offline_authorization_invalidated_at timestamptz,
  add column if not exists offline_authorization_policy_version text;

alter table public.pos_device_credentials
  drop constraint if exists pos_device_credentials_offline_authorization_shape,
  add constraint pos_device_credentials_offline_authorization_shape check (
    (
      offline_authorization_issued_at is null
      and offline_authorization_expires_at is null
      and offline_authorization_invalidated_at is null
      and offline_authorization_policy_version is null
    )
    or (
      offline_authorization_issued_at is not null
      and pg_catalog.isfinite(offline_authorization_issued_at)
      and offline_authorization_expires_at is not null
      and pg_catalog.isfinite(offline_authorization_expires_at)
      and offline_authorization_expires_at > offline_authorization_issued_at
      and (
        offline_authorization_invalidated_at is not null
        or offline_authorization_expires_at <= expires_at
      )
      and (
        offline_authorization_invalidated_at is null
        or (
          pg_catalog.isfinite(offline_authorization_invalidated_at)
          and offline_authorization_invalidated_at
            >= offline_authorization_issued_at
        )
      )
      and offline_authorization_policy_version
        ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    )
  ) not valid;

alter table public.pos_device_credentials
  validate constraint pos_device_credentials_offline_authorization_shape;

alter table public.pos_sessions
  drop constraint if exists pos_sessions_offline_authorization_shape,
  add constraint pos_sessions_offline_authorization_shape check (
    (
      offline_authorization_issued_at is null
      and offline_authorization_expires_at is null
      and offline_authorization_invalidated_at is null
      and offline_authorization_policy_version is null
    )
    or (
      offline_authorization_issued_at is not null
      and pg_catalog.isfinite(offline_authorization_issued_at)
      and offline_authorization_expires_at is not null
      and pg_catalog.isfinite(offline_authorization_expires_at)
      and offline_authorization_expires_at > offline_authorization_issued_at
      and (
        offline_authorization_invalidated_at is not null
        or offline_authorization_expires_at <= expires_at
      )
      and (
        offline_authorization_invalidated_at is null
        or (
          pg_catalog.isfinite(offline_authorization_invalidated_at)
          and offline_authorization_invalidated_at
            >= offline_authorization_issued_at
        )
      )
      and offline_authorization_policy_version
        ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    )
  ) not valid;

alter table public.pos_sessions
  validate constraint pos_sessions_offline_authorization_shape;

create index if not exists
  pos_device_credentials_offline_authorization_lookup_idx
  on public.pos_device_credentials (
    shop_device_id,
    staff_id,
    staff_credential_version,
    offline_authorization_expires_at
  )
  where status = 'active'
    and revoked_at is null
    and offline_authorization_invalidated_at is null
    and offline_authorization_expires_at is not null;

create or replace function app_private.invalidate_staff_pos_offline_authorization_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invalidated_at timestamptz;
begin
  if old.credential_version is not distinct from new.credential_version
    and old.status is not distinct from new.status
    and old.credential_status is not distinct from new.credential_status
    and old.must_change_credential is not distinct from new.must_change_credential
    and old.locked_until is not distinct from new.locked_until
    and old.session_invalidated_at is not distinct from new.session_invalidated_at
    and old.credential_expires_at is not distinct from new.credential_expires_at
  then
    return new;
  end if;

  v_invalidated_at := pg_catalog.clock_timestamp();

  update public.pos_device_credentials credential
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where credential.staff_id = new.staff_id
    and credential.offline_authorization_expires_at is not null
    and credential.offline_authorization_invalidated_at is null;

  update public.pos_sessions session_row
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where session_row.staff_id = new.staff_id
    and session_row.offline_authorization_expires_at is not null
    and session_row.offline_authorization_invalidated_at is null;

  return new;
end;
$$;

create or replace function app_private.invalidate_shop_pos_offline_authorization_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invalidated_at timestamptz;
begin
  if old.shop_status is not distinct from new.shop_status then
    return new;
  end if;

  v_invalidated_at := pg_catalog.clock_timestamp();

  update public.pos_device_credentials credential
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where credential.shop_id = new.shop_id
    and credential.offline_authorization_expires_at is not null
    and credential.offline_authorization_invalidated_at is null;

  update public.pos_sessions session_row
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where session_row.shop_id = new.shop_id
    and session_row.offline_authorization_expires_at is not null
    and session_row.offline_authorization_invalidated_at is null;

  return new;
end;
$$;

create or replace function app_private.invalidate_device_pos_offline_authorization_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invalidated_at timestamptz;
begin
  if old.status is not distinct from new.status
    and old.revoked_at is not distinct from new.revoked_at
  then
    return new;
  end if;

  v_invalidated_at := pg_catalog.clock_timestamp();

  update public.pos_device_credentials credential
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where credential.shop_device_id = new.shop_device_id
    and credential.offline_authorization_expires_at is not null
    and credential.offline_authorization_invalidated_at is null;

  update public.pos_sessions session_row
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where session_row.shop_device_id = new.shop_device_id
    and session_row.offline_authorization_expires_at is not null
    and session_row.offline_authorization_invalidated_at is null;

  return new;
end;
$$;

create or replace function app_private.invalidate_credential_pos_offline_authorization_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invalidated_at timestamptz;
begin
  if old.status is not distinct from new.status
    and old.revoked_at is not distinct from new.revoked_at
    and old.expires_at is not distinct from new.expires_at
    and old.staff_credential_version
      is not distinct from new.staff_credential_version
  then
    return new;
  end if;

  v_invalidated_at := pg_catalog.clock_timestamp();
  if new.offline_authorization_expires_at is not null
    and new.offline_authorization_invalidated_at is null
  then
    new.offline_authorization_invalidated_at := v_invalidated_at;
  end if;

  update public.pos_sessions session_row
  set offline_authorization_invalidated_at = v_invalidated_at,
      updated_at = v_invalidated_at
  where session_row.pos_device_credential_id =
      new.pos_device_credential_id
    and session_row.offline_authorization_expires_at is not null
    and session_row.offline_authorization_invalidated_at is null;

  return new;
end;
$$;

create or replace function app_private.invalidate_session_pos_offline_authorization_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.offline_authorization_expires_at is not null
    and new.offline_authorization_invalidated_at is null
    and (
      old.status is distinct from new.status
      or old.revoked_at is distinct from new.revoked_at
      or old.staff_credential_version
        is distinct from new.staff_credential_version
      or new.expires_at < new.offline_authorization_expires_at
    )
  then
    new.offline_authorization_invalidated_at :=
      pg_catalog.clock_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists task144_invalidate_staff_pos_offline_authorization
  on public.staff_accounts;
create trigger task144_invalidate_staff_pos_offline_authorization
after update of
  credential_version,
  status,
  credential_status,
  must_change_credential,
  locked_until,
  session_invalidated_at,
  credential_expires_at
on public.staff_accounts
for each row execute function
  app_private.invalidate_staff_pos_offline_authorization_v1();

drop trigger if exists task144_invalidate_shop_pos_offline_authorization
  on public.shops;
create trigger task144_invalidate_shop_pos_offline_authorization
after update of shop_status
on public.shops
for each row execute function
  app_private.invalidate_shop_pos_offline_authorization_v1();

drop trigger if exists task144_invalidate_device_pos_offline_authorization
  on public.shop_devices;
create trigger task144_invalidate_device_pos_offline_authorization
after update of status, revoked_at
on public.shop_devices
for each row execute function
  app_private.invalidate_device_pos_offline_authorization_v1();

drop trigger if exists task144_invalidate_credential_pos_offline_authorization
  on public.pos_device_credentials;
create trigger task144_invalidate_credential_pos_offline_authorization
before update of status, revoked_at, expires_at, staff_credential_version
on public.pos_device_credentials
for each row execute function
  app_private.invalidate_credential_pos_offline_authorization_v1();

drop trigger if exists task144_invalidate_session_pos_offline_authorization
  on public.pos_sessions;
create trigger task144_invalidate_session_pos_offline_authorization
before update of status, revoked_at, expires_at, staff_credential_version
on public.pos_sessions
for each row execute function
  app_private.invalidate_session_pos_offline_authorization_v1();

create or replace function public.pos_runtime_first_login_commit_v3(
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
  p_offline_authorization_max_age_seconds integer,
  p_offline_authorization_policy_version text,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_shop_device_id uuid;
  v_checked_at timestamptz;
  v_device_expires_at timestamptz;
  v_session_expires_at timestamptz;
  v_offline_expires_at timestamptz;
  v_previous_offline_expires_at timestamptz;
  v_previous_policy_version text;
  v_result jsonb;
  v_credential_id uuid;
  v_session_id uuid;
  v_credential_updated integer;
  v_session_updated integer;
  v_replayed boolean := false;
begin
  if p_device_ttl_seconds is null
    or p_device_ttl_seconds not between 1 and 15552000
    or p_session_ttl_seconds is null
    or p_session_ttl_seconds not between 1 and 43200
    or p_offline_authorization_max_age_seconds is null
    or p_offline_authorization_max_age_seconds not between 1 and 43200
    or p_offline_authorization_policy_version is null
    or p_offline_authorization_policy_version
      !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_policy_invalid'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_shop_id::text || ':' || p_device_identifier,
      0
    )
  );

  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_not_permitted'
    );
  end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id
    and staff.shop_id = p_shop_id
    and staff.credential_version = p_expected_credential_version
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_not_permitted'
    );
  end if;

  select device.shop_device_id
    into v_shop_device_id
  from public.shop_devices device
  where device.shop_id = p_shop_id
    and device.device_identifier = p_device_identifier
  for update;

  v_checked_at := pg_catalog.clock_timestamp();

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
    or (
      v_staff.locked_until is not null
      and v_staff.locked_until > v_checked_at
    )
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_not_permitted'
    );
  end if;

  if v_staff.credential_expires_at is not null
    and v_staff.credential_expires_at <= v_checked_at
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_expired'
    );
  end if;

  if v_shop_device_id is not null and exists (
    select 1
    from public.shop_devices device
    where device.shop_device_id = v_shop_device_id
      and (
        device.status <> 'active'
        or device.revoked_at is not null
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_not_permitted'
    );
  end if;

  if v_shop_device_id is not null then
    select
      credential.offline_authorization_expires_at,
      credential.offline_authorization_policy_version
    into
      v_previous_offline_expires_at,
      v_previous_policy_version
    from public.pos_device_credentials credential
    where credential.shop_device_id = v_shop_device_id
      and credential.shop_id = p_shop_id
      and credential.staff_id = p_staff_id
      and credential.staff_credential_version =
        p_expected_credential_version
      and credential.status = 'active'
      and credential.revoked_at is null
      and credential.offline_authorization_expires_at > v_checked_at
      and credential.offline_authorization_invalidated_at is null
    order by credential.issued_at desc
    limit 1
    for update;

    if v_previous_offline_expires_at is not null
      and v_previous_policy_version
        is distinct from p_offline_authorization_policy_version
    then
      update public.pos_device_credentials credential
      set offline_authorization_invalidated_at = v_checked_at,
          updated_at = v_checked_at
      where credential.shop_device_id = v_shop_device_id
        and credential.staff_id = p_staff_id
        and credential.offline_authorization_expires_at is not null
        and credential.offline_authorization_invalidated_at is null;

      update public.pos_sessions session_row
      set offline_authorization_invalidated_at = v_checked_at,
          updated_at = v_checked_at
      where session_row.shop_device_id = v_shop_device_id
        and session_row.staff_id = p_staff_id
        and session_row.offline_authorization_expires_at is not null
        and session_row.offline_authorization_invalidated_at is null;

      v_previous_offline_expires_at := null;
      v_previous_policy_version := null;
    end if;
  end if;

  v_device_expires_at := v_checked_at
    + pg_catalog.make_interval(secs => p_device_ttl_seconds);
  if v_staff.credential_expires_at is not null then
    v_device_expires_at := least(
      v_device_expires_at,
      v_staff.credential_expires_at
    );
  end if;

  v_session_expires_at := least(
    v_checked_at
      + pg_catalog.make_interval(secs => p_session_ttl_seconds),
    v_device_expires_at
  );
  v_offline_expires_at := least(
    v_checked_at + pg_catalog.make_interval(
      secs => p_offline_authorization_max_age_seconds
    ),
    v_session_expires_at,
    v_device_expires_at
  );

  if v_previous_offline_expires_at is not null then
    v_offline_expires_at := least(
      v_offline_expires_at,
      v_previous_offline_expires_at
    );
    v_replayed := true;
  end if;

  if v_device_expires_at <= v_checked_at
    or v_session_expires_at <= v_checked_at
    or v_offline_expires_at <= v_checked_at
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_expired'
    );
  end if;

  v_result := public.pos_runtime_first_login_commit_v1(
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

  if v_result->>'ok' <> 'true' then
    if v_result->>'code' in ('device_denied', 'stale_identity') then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'code', 'offline_authorization_not_permitted'
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'offline_authorization_persistence_failed'
    );
  end if;

  v_credential_id := (v_result->>'posDeviceCredentialId')::uuid;
  v_session_id := (v_result->>'posSessionId')::uuid;

  update public.pos_device_credentials credential
  set offline_authorization_issued_at = v_checked_at,
      offline_authorization_expires_at = v_offline_expires_at,
      offline_authorization_invalidated_at = null,
      offline_authorization_policy_version =
        p_offline_authorization_policy_version,
      updated_at = v_checked_at
  where credential.pos_device_credential_id = v_credential_id
    and credential.staff_credential_version =
      p_expected_credential_version
    and credential.status = 'active'
    and credential.revoked_at is null;
  get diagnostics v_credential_updated = row_count;

  update public.pos_sessions session_row
  set offline_authorization_issued_at = v_checked_at,
      offline_authorization_expires_at = v_offline_expires_at,
      offline_authorization_invalidated_at = null,
      offline_authorization_policy_version =
        p_offline_authorization_policy_version,
      updated_at = v_checked_at
  where session_row.pos_session_id = v_session_id
    and session_row.pos_device_credential_id = v_credential_id
    and session_row.staff_credential_version =
      p_expected_credential_version
    and session_row.status = 'active'
    and session_row.revoked_at is null;
  get diagnostics v_session_updated = row_count;

  if v_credential_updated <> 1 or v_session_updated <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'offline authorization persistence failed';
  end if;

  return v_result || pg_catalog.jsonb_build_object(
    'serverTime',
      pg_catalog.to_char(
        v_checked_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
    'effectiveOfflineAuthorizationExpiresAt',
      pg_catalog.to_char(
        v_offline_expires_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
    'offlineAuthorizationPolicyVersion',
      p_offline_authorization_policy_version,
    'offlineAuthorizationReplayBounded',
      v_replayed
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'ok', false,
    'code', 'offline_authorization_persistence_failed'
  );
end;
$$;

revoke all on function app_private.invalidate_staff_pos_offline_authorization_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.invalidate_shop_pos_offline_authorization_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.invalidate_device_pos_offline_authorization_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.invalidate_credential_pos_offline_authorization_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.invalidate_session_pos_offline_authorization_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.pos_runtime_first_login_commit_v3(
  uuid, uuid, integer, text, text, text, text, integer, text, integer,
  integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.pos_runtime_first_login_commit_v3(
  uuid, uuid, integer, text, text, text, text, integer, text, integer,
  integer, text, jsonb
) to service_role;

commit;
