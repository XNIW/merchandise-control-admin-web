begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'pos_runtime_first_login_commit_v3',
  array[
    'uuid', 'uuid', 'integer', 'text', 'text', 'text', 'text', 'integer',
    'text', 'integer', 'integer', 'text', 'jsonb'
  ],
  'TASK-144 exposes the additive first-login V3 authority boundary'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_runtime_first_login_commit_v3(uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)',
    'execute'
  ),
  'service_role can execute first-login V3'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.pos_runtime_first_login_commit_v3(uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)',
    'execute'
  ),
  'authenticated cannot execute first-login V3'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.pos_runtime_first_login_commit_v3(uuid,uuid,integer,text,text,text,text,integer,text,integer,integer,text,jsonb)',
    'execute'
  ),
  'anon cannot execute first-login V3'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.pos_device_credentials',
    'select'
  ),
  'authenticated cannot read device authority receipts'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.pos_sessions',
    'select'
  ),
  'authenticated cannot read session authority receipts'
);
select col_is_null(
  'public',
  'pos_device_credentials',
  'offline_authorization_expires_at',
  'legacy device credentials remain valid without an offline authority'
);
select col_is_null(
  'public',
  'pos_sessions',
  'offline_authorization_expires_at',
  'legacy sessions remain valid without an offline authority'
);
select has_trigger(
  'public',
  'staff_accounts',
  'task144_invalidate_staff_pos_offline_authorization',
  'staff authority changes invalidate offline authorization'
);
select has_trigger(
  'public',
  'shop_devices',
  'task144_invalidate_device_pos_offline_authorization',
  'device authority changes invalidate offline authorization'
);
select has_trigger(
  'public',
  'shops',
  'task144_invalidate_shop_pos_offline_authorization',
  'shop authority changes invalidate offline authorization'
);
select has_trigger(
  'public',
  'pos_device_credentials',
  'task144_invalidate_credential_pos_offline_authorization',
  'device credential changes invalidate bound sessions'
);
select has_trigger(
  'public',
  'pos_sessions',
  'task144_invalidate_session_pos_offline_authorization',
  'session authority changes invalidate its offline authorization'
);

insert into public.shops (
  shop_id,
  shop_code,
  shop_name,
  shop_status
) values (
  '10000000-0000-4000-8000-000000000144',
  'TASK144',
  'TASK-144 synthetic shop',
  'active'
);

insert into public.staff_accounts (
  staff_id,
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
  credential_status
) values (
  '20000000-0000-4000-8000-000000000144',
  '10000000-0000-4000-8000-000000000144',
  'POS144',
  'TASK-144 synthetic staff',
  'pos_admin',
  'active',
  'password',
  'argon2id:task144-redacted-fixture',
  clock_timestamp(),
  clock_timestamp() + interval '4 hours',
  false,
  7,
  'active'
);

create temporary table task144_results (
  label text primary key,
  result jsonb not null
);
grant select, insert, update on task144_results to service_role;

set local role service_role;
insert into task144_results(label, result)
values (
  'initial',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    7,
    'task144-device',
    'TASK-144 synthetic device',
    '1.0-fixture',
    'sha256:' || repeat('1', 64),
    15552000,
    'sha256:' || repeat('2', 64),
    43200,
    43200,
    'pos-policy-v1',
    jsonb_build_object(
      'app_version_present', true,
      'source', 'TASK-144'
    )
  )
);

select is(
  (select result->>'code' from task144_results where label = 'initial'),
  'success',
  'active first-login receives an authoritative offline authorization'
);
select ok(
  (
    select
      (result->>'effectiveOfflineAuthorizationExpiresAt')::timestamptz
        > (result->>'serverTime')::timestamptz
    from task144_results
    where label = 'initial'
  ),
  'offline authority expiry is later than authoritative server time'
);
select ok(
  (
    select
      result->>'effectiveOfflineAuthorizationExpiresAt'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
      and result->>'serverTime'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
    from task144_results
    where label = 'initial'
  ),
  'server time and offline authority use strict UTC fractional timestamps'
);
select ok(
  (
    select
      (result->>'effectiveOfflineAuthorizationExpiresAt')::timestamptz
        <= (result->>'sessionExpiresAt')::timestamptz
    from task144_results
    where label = 'initial'
  ),
  'offline authority never exceeds the POS session expiry'
);
select ok(
  exists (
    select 1
    from task144_results response
    join public.pos_sessions session_row
      on session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
    join public.pos_device_credentials credential
      on credential.pos_device_credential_id =
        session_row.pos_device_credential_id
    join public.staff_accounts staff
      on staff.staff_id = session_row.staff_id
    where response.label = 'initial'
      and session_row.offline_authorization_expires_at
        = credential.offline_authorization_expires_at
      and session_row.offline_authorization_expires_at
        = (response.result->>'effectiveOfflineAuthorizationExpiresAt')::timestamptz
      and session_row.offline_authorization_expires_at
        <= session_row.expires_at
      and session_row.offline_authorization_expires_at
        <= credential.expires_at
      and session_row.offline_authorization_expires_at
        <= staff.credential_expires_at
      and session_row.offline_authorization_expires_at
        <= session_row.offline_authorization_issued_at + interval '12 hours'
      and session_row.offline_authorization_policy_version = 'pos-policy-v1'
      and session_row.offline_authorization_invalidated_at is null
  ),
  'persisted authority is identical and bounded by session/device/staff/policy'
);
select is(
  (
    select metadata_redacted
    from public.pos_sessions session_row
    join task144_results response
      on session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
    where response.label = 'initial'
  ),
  jsonb_build_object(
    'app_version_present', true,
    'source', 'TASK-144'
  ),
  'persisted metadata is bounded and excludes body, token and credential'
);

set local role service_role;
insert into task144_results(label, result)
values (
  'replay',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    7,
    'task144-device',
    'TASK-144 synthetic device',
    '1.0-fixture',
    'sha256:' || repeat('3', 64),
    15552000,
    'sha256:' || repeat('4', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select replay.result->>'effectiveOfflineAuthorizationExpiresAt'
    from task144_results replay
    where replay.label = 'replay'
  ),
  (
    select initial.result->>'effectiveOfflineAuthorizationExpiresAt'
    from task144_results initial
    where initial.label = 'initial'
  ),
  'same device/staff/version replay cannot extend the original authority'
);
select is(
  (
    select result->>'offlineAuthorizationReplayBounded'
    from task144_results
    where label = 'replay'
  ),
  'true',
  'replay result records only the bounded replay fact'
);
select is(
  (
    select count(*)::integer
    from public.pos_device_credentials credential
    where credential.shop_id =
      '10000000-0000-4000-8000-000000000144'
      and credential.status = 'active'
      and credential.revoked_at is null
  ),
  1,
  'replay leaves one active device credential'
);
select ok(
  exists (
    select 1
    from public.pos_sessions session_row
    join task144_results initial
      on session_row.pos_session_id =
        (initial.result->>'posSessionId')::uuid
    where initial.label = 'initial'
      and session_row.offline_authorization_invalidated_at is not null
  ),
  'credential rotation invalidates the prior session authority'
);

set local role postgres;
update public.staff_accounts
set credential_version = 8,
    credential_updated_at = clock_timestamp()
where staff_id = '20000000-0000-4000-8000-000000000144';
select ok(
  exists (
    select 1
    from public.pos_sessions session_row
    join task144_results replay
      on session_row.pos_session_id =
        (replay.result->>'posSessionId')::uuid
    where replay.label = 'replay'
      and session_row.offline_authorization_invalidated_at is not null
  ),
  'staff credential version change invalidates previous authorization'
);

set local role service_role;
insert into task144_results(label, result)
values (
  'stale_version',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    7,
    'task144-stale-version',
    'TASK-144 stale version',
    '1.0-fixture',
    'sha256:' || repeat('5', 64),
    15552000,
    'sha256:' || repeat('6', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select result->>'code'
    from task144_results
    where label = 'stale_version'
  ),
  'offline_authorization_not_permitted',
  'stale staff credential version receives no authorization'
);

set local role service_role;
insert into task144_results(label, result)
values (
  'version8',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-device-v8',
    'TASK-144 version 8 device',
    '1.0-fixture',
    'sha256:' || repeat('7', 64),
    15552000,
    'sha256:' || repeat('8', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (select result->>'code' from task144_results where label = 'version8'),
  'success',
  'fresh credential version can establish a new authority'
);

set local role postgres;
update public.staff_accounts
set session_invalidated_at = clock_timestamp()
where staff_id = '20000000-0000-4000-8000-000000000144';
select ok(
  exists (
    select 1
    from public.pos_sessions session_row
    join task144_results response
      on session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
    where response.label = 'version8'
      and session_row.offline_authorization_invalidated_at is not null
  ),
  'staff session invalidation timestamp invalidates previous authorization'
);

update public.staff_accounts
set session_invalidated_at = null
where staff_id = '20000000-0000-4000-8000-000000000144';
set local role service_role;
insert into task144_results(label, result)
values (
  'shortened_authority',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-shortened-authority',
    'TASK-144 shortened authority',
    '1.0-fixture',
    'sha256:' || repeat('e', 64),
    15552000,
    'sha256:' || repeat('f', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select result->>'code'
    from task144_results
    where label = 'shortened_authority'
  ),
  'success',
  'fresh authority exists before testing expiry shortening'
);

set local role postgres;
select lives_ok(
  $task144$
    update public.pos_sessions session_row
    set expires_at =
      session_row.offline_authorization_issued_at + interval '1 minute'
    from task144_results response
    where response.label = 'shortened_authority'
      and session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
  $task144$,
  'session expiry can be shortened below an invalidated offline lease'
);
select ok(
  exists (
    select 1
    from public.pos_sessions session_row
    join task144_results response
      on session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
    where response.label = 'shortened_authority'
      and session_row.expires_at
        < session_row.offline_authorization_expires_at
      and session_row.offline_authorization_invalidated_at is not null
  ),
  'session shortening persists and invalidates its offline authority'
);
select lives_ok(
  $task144$
    update public.pos_device_credentials credential
    set expires_at =
      credential.offline_authorization_issued_at + interval '2 minutes'
    from task144_results response
    join public.pos_sessions session_row
      on session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
    where response.label = 'shortened_authority'
      and credential.pos_device_credential_id =
        session_row.pos_device_credential_id
  $task144$,
  'device credential expiry can be shortened below an invalidated lease'
);
select ok(
  exists (
    select 1
    from public.pos_device_credentials credential
    join public.pos_sessions session_row
      on session_row.pos_device_credential_id =
        credential.pos_device_credential_id
    join task144_results response
      on session_row.pos_session_id =
        (response.result->>'posSessionId')::uuid
    where response.label = 'shortened_authority'
      and credential.expires_at
        < credential.offline_authorization_expires_at
      and credential.offline_authorization_invalidated_at is not null
  ),
  'credential shortening persists and invalidates its offline authority'
);

update public.staff_accounts
set credential_status = 'locked',
    locked_until = clock_timestamp() + interval '10 minutes'
where staff_id = '20000000-0000-4000-8000-000000000144';
set local role service_role;
insert into task144_results(label, result)
values (
  'locked_staff',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-locked',
    'TASK-144 locked fixture',
    '1.0-fixture',
    'sha256:' || repeat('9', 64),
    15552000,
    'sha256:' || repeat('a', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (select result->>'code' from task144_results where label = 'locked_staff'),
  'offline_authorization_not_permitted',
  'locked staff receives no offline authorization'
);

set local role postgres;
update public.staff_accounts
set credential_status = 'active',
    locked_until = null,
    status = 'archived'
where staff_id = '20000000-0000-4000-8000-000000000144';
set local role service_role;
insert into task144_results(label, result)
values (
  'archived_staff',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-archived',
    'TASK-144 archived fixture',
    '1.0-fixture',
    'sha256:' || repeat('b', 64),
    15552000,
    'sha256:' || repeat('c', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select result->>'code'
    from task144_results
    where label = 'archived_staff'
  ),
  'offline_authorization_not_permitted',
  'archived staff receives no offline authorization'
);

set local role postgres;
update public.staff_accounts
set status = 'active',
    session_invalidated_at = null
where staff_id = '20000000-0000-4000-8000-000000000144';
update public.shop_devices
set status = 'revoked',
    revoked_at = clock_timestamp()
where device_identifier = 'task144-device-v8';
set local role service_role;
insert into task144_results(label, result)
values (
  'revoked_device',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-device-v8',
    'TASK-144 revoked device',
    '1.0-fixture',
    'sha256:' || repeat('d', 64),
    15552000,
    'sha256:' || repeat('e', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select result->>'code'
    from task144_results
    where label = 'revoked_device'
  ),
  'offline_authorization_not_permitted',
  'revoked device receives no offline authorization'
);

set local role postgres;
update public.shop_devices
set status = 'active',
    revoked_at = null
where device_identifier = 'task144-device-v8';
update public.shops
set shop_status = 'pending_setup'
where shop_id = '10000000-0000-4000-8000-000000000144';
set local role service_role;
insert into task144_results(label, result)
values (
  'inactive_shop',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-inactive-shop',
    'TASK-144 inactive shop',
    '1.0-fixture',
    'sha256:' || repeat('f', 64),
    15552000,
    'sha256:' || repeat('0', 64),
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (select result->>'code' from task144_results where label = 'inactive_shop'),
  'offline_authorization_not_permitted',
  'inactive shop receives no offline authorization'
);

set local role postgres;
update public.shops
set shop_status = 'active'
where shop_id = '10000000-0000-4000-8000-000000000144';
update public.staff_accounts
set credential_expires_at = clock_timestamp() - interval '1 second'
where staff_id = '20000000-0000-4000-8000-000000000144';
set local role service_role;
insert into task144_results(label, result)
values (
  'expired_authority',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-expired',
    'TASK-144 expired fixture',
    '1.0-fixture',
    'sha256:' || repeat('1', 63) || '2',
    15552000,
    'sha256:' || repeat('2', 63) || '3',
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select result->>'code'
    from task144_results
    where label = 'expired_authority'
  ),
  'offline_authorization_expired',
  'expired underlying staff authority returns the typed expiry failure'
);

set local role service_role;
insert into task144_results(label, result)
values (
  'invalid_policy',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-invalid-policy',
    'TASK-144 invalid policy',
    '1.0-fixture',
    'sha256:' || repeat('3', 63) || '4',
    15552000,
    'sha256:' || repeat('4', 63) || '5',
    43200,
    43201,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (select result->>'code' from task144_results where label = 'invalid_policy'),
  'offline_authorization_policy_invalid',
  'invalid server policy returns the typed policy failure'
);

set local role postgres;
update public.staff_accounts
set credential_expires_at = clock_timestamp() + interval '4 hours'
where staff_id = '20000000-0000-4000-8000-000000000144';

create or replace function app_private.task144_force_persistence_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'TASK-144 synthetic persistence failure';
end;
$$;
create trigger task144_force_persistence_failure
before update of offline_authorization_expires_at
on public.pos_sessions
for each row execute function
  app_private.task144_force_persistence_failure();

set local role service_role;
insert into task144_results(label, result)
values (
  'persistence_failure',
  public.pos_runtime_first_login_commit_v3(
    '10000000-0000-4000-8000-000000000144',
    '20000000-0000-4000-8000-000000000144',
    8,
    'task144-persistence-failure',
    'TASK-144 persistence fixture',
    '1.0-fixture',
    'sha256:' || repeat('5', 63) || '6',
    15552000,
    'sha256:' || repeat('6', 63) || '7',
    43200,
    43200,
    'pos-policy-v1',
    '{}'::jsonb
  )
);
select is(
  (
    select result->>'code'
    from task144_results
    where label = 'persistence_failure'
  ),
  'offline_authorization_persistence_failed',
  'attestation write failure returns the typed persistence failure'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.pos_device_credentials credential
    where credential.token_hash = 'sha256:' || repeat('5', 63) || '6'
  ),
  0,
  'persistence failure rolls back the credential atomically'
);
select is(
  (
    select count(*)::integer
    from public.pos_sessions session_row
    where session_row.session_token_hash =
      'sha256:' || repeat('6', 63) || '7'
  ),
  0,
  'persistence failure rolls back the session atomically'
);

drop trigger task144_force_persistence_failure on public.pos_sessions;
drop function app_private.task144_force_persistence_failure();

select * from finish();

rollback;
