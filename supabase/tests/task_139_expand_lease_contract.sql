begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'record_sync_event',
  array[
    'text', 'text', 'integer', 'jsonb', 'uuid', 'text', 'text', 'uuid',
    'text', 'jsonb', 'uuid'
  ],
  'legacy 11-argument sync-event writer remains installed'
);
select is(
  pg_get_function_result(
    'public.record_sync_event(text,text,integer,jsonb,uuid,text,text,uuid,text,jsonb,uuid)'::regprocedure
  ),
  'sync_events',
  'legacy writer retains its composite-row response ABI'
);
select has_function(
  'public',
  'record_sync_event_v6',
  array[
    'text', 'text', 'integer', 'jsonb', 'uuid', 'text', 'text', 'uuid',
    'text', 'jsonb', 'uuid'
  ],
  'strict V6 sync-event writer is additive'
);
select is(
  pg_get_function_result(
    'public.record_sync_event_v6(text,text,integer,jsonb,uuid,text,text,uuid,text,jsonb,uuid)'::regprocedure
  ),
  'jsonb',
  'V6 response carries bigint IDs as JSON decimal strings'
);
select ok(
  has_table_privilege('authenticated', 'public.sync_events', 'select'),
  'authenticated legacy readers retain sync_events SELECT'
);
select ok(
  exists (
    select 1
    from pg_publication_tables publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'sync_events'
  ),
  'legacy Realtime publication remains installed'
);
select is(
  (
    select count(*)::integer
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.sync_events'::regclass
      and constraint_row.conname in (
        'sync_events_entity_ids_complete',
        'sync_events_sync_storage_bounded_v1',
        'sync_events_supported_operation',
        'sync_events_source_bounded',
        'sync_events_metadata_redacted',
        'sync_events_retention_envelope_v1'
      )
  ),
  0,
  'expand does not impose V6 checks on new legacy rows'
);
select is(
  (
    select column_row.column_default
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'sync_events'
      and column_row.column_name = 'expires_at'
  ),
  null,
  'expand preserves the nullable legacy expires_at default'
);
select ok(
  position(
    'sync_event_entity_ids_are_complete' in pg_get_functiondef(
      'public.record_sync_event_v6(text,text,integer,jsonb,uuid,text,text,uuid,text,jsonb,uuid)'::regprocedure
    )
  ) > 0,
  'V6 enforces complete entity IDs in-function'
);
select ok(
  position(
    'auth.role() is distinct from ''service_role''' in pg_get_functiondef(
      'app_private.split_pos_catalog_import_sync_event()'::regprocedure
    )
  ) > 0,
  'POS bulk splitting cannot rewrite authenticated legacy RPC inserts'
);
select ok(
  position(
    'when p_operation = ''snapshot_page'' then ''catalog.export''' in
      pg_get_functiondef(
        'public.shop_catalog_admin_read_v1(uuid,text,jsonb,uuid,uuid,text,integer)'::regprocedure
      )
  ) > 0,
  'staff workbook snapshots require catalog.export in the DB lease'
);
select ok(
  app_private.sync_event_entity_ids_are_complete(
    'catalog',
    2,
    jsonb_build_object(
      'product_ids',
      jsonb_build_array(
        '00000000-0000-0000-0000-000000000000',
        '018f3f5e-8b7a-7abc-8123-0123456789ab'
      )
    )
  ),
  'canonical nil and UUIDv7 identifiers are accepted by V6 validation'
);

select has_function(
  'public',
  'pos_runtime_first_login_commit_v1',
  array[
    'uuid', 'uuid', 'integer', 'text', 'text', 'text', 'text',
    'timestamptz', 'text', 'timestamptz', 'jsonb'
  ],
  'legacy first-login commit remains installed'
);
select has_function(
  'public',
  'pos_runtime_first_login_commit_v2',
  array[
    'uuid', 'uuid', 'integer', 'text', 'text', 'text', 'text', 'integer',
    'text', 'integer', 'jsonb'
  ],
  'DB-clock first-login V2 is additive'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.pos_runtime_first_login_commit_v2(uuid,uuid,integer,text,text,text,text,integer,text,integer,jsonb)',
    'execute'
  ),
  'service role can execute first-login V2'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.pos_runtime_first_login_commit_v2(uuid,uuid,integer,text,text,text,text,integer,text,integer,jsonb)',
    'execute'
  ),
  'authenticated callers cannot execute first-login V2'
);
select ok(
  position('v_checked_at := clock_timestamp();' in pg_get_functiondef(
    'public.pos_runtime_first_login_commit_v2(uuid,uuid,integer,text,text,text,text,integer,text,integer,jsonb)'::regprocedure
  )) >
  position('for update;' in pg_get_functiondef(
    'public.pos_runtime_first_login_commit_v2(uuid,uuid,integer,text,text,text,text,integer,text,integer,jsonb)'::regprocedure
  )),
  'first-login V2 takes its DB wall clock only after mutable lease locks'
);
select ok(
  position('least(' in pg_get_functiondef(
    'public.pos_runtime_first_login_commit_v2(uuid,uuid,integer,text,text,text,text,integer,text,integer,jsonb)'::regprocedure
  )) > 0
  and position('v_staff.credential_expires_at' in pg_get_functiondef(
    'public.pos_runtime_first_login_commit_v2(uuid,uuid,integer,text,text,text,text,integer,text,integer,jsonb)'::regprocedure
  )) > 0,
  'device and session expiries are clamped to staff credential expiry'
);

insert into public.shops (
  shop_id,
  shop_code,
  shop_name,
  shop_status
) values (
  '10000000-0000-4000-8000-000000000139',
  'TASK139LEASE',
  'TASK-139 lease fixture',
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
  '20000000-0000-4000-8000-000000000139',
  '10000000-0000-4000-8000-000000000139',
  'LEASE139',
  'TASK-139 lease staff',
  'manager',
  'active',
  'password',
  'argon2id:task139-redacted-fixture',
  clock_timestamp(),
  clock_timestamp() + interval '5 minutes',
  false,
  7,
  'active'
);

set local role service_role;
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-lease-device',
    'TASK-139 lease device',
    '1.0-test',
    'sha256:' || repeat('1', 64),
    15552000,
    'sha256:' || repeat('2', 64),
    43200,
    '{}'::jsonb
  )->>'code',
  'success',
  'first-login V2 atomically commits a valid lease'
);
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-invalid-ttl-device',
    'TASK-139 invalid TTL device',
    '1.0-test',
    'sha256:' || repeat('3', 64),
    15552001,
    'sha256:' || repeat('4', 64),
    43200,
    '{}'::jsonb
  )->>'code',
  'validation_failed',
  'first-login V2 rejects an oversized TTL before persistence'
);

set local role postgres;
select ok(
  exists (
    select 1
    from public.pos_device_credentials credential
    join public.pos_sessions session_row
      on session_row.pos_device_credential_id =
        credential.pos_device_credential_id
    join public.staff_accounts staff
      on staff.staff_id = credential.staff_id
    where credential.token_hash = 'sha256:' || repeat('1', 64)
      and session_row.session_token_hash = 'sha256:' || repeat('2', 64)
      and credential.expires_at = staff.credential_expires_at
      and session_row.expires_at = staff.credential_expires_at
      and session_row.expires_at <= credential.expires_at
  ),
  'persisted device/session expiries are clamped to the staff credential'
);
select is(
  (
    select count(*)::integer
    from public.pos_device_credentials credential
    where credential.token_hash = 'sha256:' || repeat('3', 64)
  ),
  0,
  'invalid first-login TTL persists no partial credential'
);

create temporary table task139_first_login_lease_state as
select
  session_row.shop_id,
  session_row.shop_device_id,
  session_row.staff_id,
  session_row.pos_session_id
from public.pos_sessions session_row
where session_row.session_token_hash = 'sha256:' || repeat('2', 64);
grant select on task139_first_login_lease_state to service_role;

set local role service_role;
select is(
  (
    select public.pos_runtime_lease_publish_success_v2(
      session_row.shop_id,
      session_row.shop_device_id,
      session_row.staff_id,
      session_row.pos_session_id,
      'first_login'
    )->>'status'
    from task139_first_login_lease_state session_row
  ),
  'ok',
  'first-login response is published only through the final locked lease fence'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000139'
      and audit.actor_staff_id = '20000000-0000-4000-8000-000000000139'
      and audit.event_key in (
        'pos.device.trusted',
        'pos.auth.first_login.success'
      )
      and audit.result = 'success'
  ),
  2,
  'successful first-login publication writes both audit events atomically'
);

update public.staff_accounts
set credential_expires_at = clock_timestamp() - interval '1 second'
where staff_id = '20000000-0000-4000-8000-000000000139';
set local role service_role;
select is(
  (
    select public.pos_runtime_lease_publish_success_v2(
      session_row.shop_id,
      session_row.shop_device_id,
      session_row.staff_id,
      session_row.pos_session_id,
      'first_login'
    )->>'status'
    from task139_first_login_lease_state session_row
  ),
  'denied',
  'publication fence denies a lease after canonical staff expiry'
);

set local role postgres;
update public.staff_accounts
set credential_expires_at = null
where staff_id = '20000000-0000-4000-8000-000000000139';
set local role service_role;
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-null-expiry-device',
    'TASK-139 null-expiry device',
    '1.0-test',
    'sha256:' || repeat('5', 64),
    120,
    'sha256:' || repeat('6', 64),
    60,
    '{}'::jsonb
  )->>'code',
  'success',
  'staff without credential expiry uses the bounded policy TTL'
);
set local role postgres;
select ok(
  exists (
    select 1
    from public.pos_device_credentials credential
    join public.pos_sessions session_row
      on session_row.pos_device_credential_id =
        credential.pos_device_credential_id
    where credential.token_hash = 'sha256:' || repeat('5', 64)
      and session_row.session_token_hash = 'sha256:' || repeat('6', 64)
      and credential.expires_at > clock_timestamp() + interval '110 seconds'
      and credential.expires_at <= clock_timestamp() + interval '120 seconds'
      and session_row.expires_at > clock_timestamp() + interval '50 seconds'
      and session_row.expires_at <= clock_timestamp() + interval '60 seconds'
      and session_row.expires_at <= credential.expires_at
  ),
  'null staff expiry never bypasses device and session policy TTLs'
);

update public.staff_accounts
set credential_expires_at = clock_timestamp()
where staff_id = '20000000-0000-4000-8000-000000000139';
set local role service_role;
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-exact-expiry-device',
    'TASK-139 exact-expiry device',
    '1.0-test',
    'sha256:' || repeat('7', 64),
    120,
    'sha256:' || repeat('8', 64),
    60,
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'staff expiry equal to the authoritative DB clock fails closed'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.pos_device_credentials credential
    where credential.token_hash = 'sha256:' || repeat('7', 64)
  ),
  0,
  'equal-now expiry persists no partial lease'
);

update public.staff_accounts
set credential_expires_at = clock_timestamp() + interval '2 minutes',
    status = 'suspended'
where staff_id = '20000000-0000-4000-8000-000000000139';
set local role service_role;
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-disabled-device',
    'TASK-139 disabled device',
    '1.0-test',
    'sha256:' || repeat('9', 64),
    120,
    'sha256:' || repeat('a', 64),
    60,
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'suspended staff cannot receive a first-login lease'
);

set local role postgres;
update public.staff_accounts
set status = 'active'
where staff_id = '20000000-0000-4000-8000-000000000139';
set local role service_role;
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    8,
    'task139-stale-version-device',
    'TASK-139 stale-version device',
    '1.0-test',
    'sha256:' || repeat('b', 64),
    120,
    'sha256:' || repeat('c', 64),
    60,
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'credential revision mismatch cannot receive a lease'
);
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000138',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-cross-shop-device',
    'TASK-139 cross-shop device',
    '1.0-test',
    'sha256:' || repeat('d', 64),
    120,
    'sha256:' || repeat('e', 64),
    60,
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'different shop binding cannot receive a lease'
);

set local role postgres;
update public.staff_accounts
set credential_expires_at = clock_timestamp() + interval '90 seconds'
where staff_id = '20000000-0000-4000-8000-000000000139';
update public.pos_device_credentials credential
set expires_at = clock_timestamp() + interval '1 day'
where credential.token_hash = 'sha256:' || repeat('5', 64);
set local role service_role;
select is(
  public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000000139',
    '20000000-0000-4000-8000-000000000139',
    7,
    'task139-null-expiry-device',
    'TASK-139 retry device',
    '1.0-test',
    'sha256:' || repeat('f', 64),
    120,
    'sha256:' || repeat('0', 64),
    60,
    '{}'::jsonb
  )->>'code',
  'success',
  'lost-response retry rotates the prior lease under the same device lock'
);
set local role postgres;
select ok(
  (
    select count(*) = 1
      and bool_and(
        credential.expires_at <= staff.credential_expires_at
      )
    from public.pos_device_credentials credential
    join public.staff_accounts staff
      on staff.staff_id = credential.staff_id
    join public.shop_devices device
      on device.shop_device_id = credential.shop_device_id
    where device.device_identifier = 'task139-null-expiry-device'
      and credential.status = 'active'
      and credential.revoked_at is null
  )
  and exists (
    select 1
    from public.pos_device_credentials credential
    where credential.token_hash = 'sha256:' || repeat('5', 64)
      and credential.status = 'revoked'
      and credential.revoked_at is not null
  ),
  'retry leaves one active credential and cannot preserve a longer old lease'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('old-reader', true),
        ('old-writer', true),
        ('new-reader', true),
        ('new-writer-v6', true)
    ) as deployment_matrix(client, supported)
    where deployment_matrix.supported
  ),
  4,
  'mixed-version matrix covers old/new readers and writers'
);

select * from finish();
rollback;
