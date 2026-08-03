begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(58);

select ok(
  to_regclass('public.customer_devices') is not null,
  'TASK-022 installs the customer device table'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_devices'
      and column_name = 'installation_id'
      and data_type = 'uuid'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_devices'
      and column_name ~* '(imei|idfa|advertising|mac_address|email|password|oauth)'
  ),
  'installation identity is UUID and no hardware or account identifier is stored'
);

select ok(
  (
    select class.relrowsecurity and class.relforcerowsecurity
    from pg_catalog.pg_class class
    where class.oid = 'public.customer_devices'::regclass
  ),
  'customer devices enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.customer_devices'::regclass
  ),
  4,
  'owner-only policy set covers all table operations'
);

select ok(
  not has_table_privilege('anon', 'public.customer_devices', 'SELECT')
  and not has_table_privilege('anon', 'public.customer_devices', 'INSERT'),
  'anon has no customer device table privilege'
);

select ok(
  not has_table_privilege('authenticated', 'public.customer_devices', 'SELECT')
  and not has_table_privilege('authenticated', 'public.customer_devices', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_devices', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.customer_devices', 'DELETE'),
  'authenticated customers use only the bounded RPC surface'
);

select ok(
  has_table_privilege('service_role', 'public.customer_devices', 'SELECT')
  and has_table_privilege('service_role', 'public.customer_devices', 'INSERT')
  and has_table_privilege('service_role', 'public.customer_devices', 'UPDATE')
  and has_table_privilege('service_role', 'public.customer_devices', 'DELETE'),
  'service-side notification work receives explicit table privileges'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_register_device_v1',
        'customer_revoke_device_v1',
        'customer_device_status_v1'
      )
  ),
  3,
  'TASK-022 installs register, revoke and status RPCs'
);

select ok(
  (
    select bool_and(
      procedure.prosecdef
      and 'search_path=""' = any(procedure.proconfig)
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_register_device_v1',
        'customer_revoke_device_v1',
        'customer_device_status_v1'
      )
  ),
  'all public device RPCs are hardened definers with empty search_path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.customer_register_device_v1(uuid,text,text,text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_revoke_device_v1(uuid,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_device_status_v1(uuid)', 'EXECUTE'
  ),
  'anon cannot invoke device RPCs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.customer_register_device_v1(uuid,text,text,text,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.customer_revoke_device_v1(uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.customer_device_status_v1(uuid)', 'EXECUTE'
  ),
  'authenticated owners receive only the three bounded RPCs'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.customer_device_public_payload_v1(public.customer_devices,text,boolean)',
    'EXECUTE'
  ),
  'private response helper is not directly executable by clients'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.indexname = 'customer_devices_active_token_hash_idx'
      and index_row.indexdef ilike '%unique%'
      and index_row.indexdef ilike '%push_token_hash is not null%'
  ),
  'active push token hash is globally unique'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.indexname = 'customer_devices_active_delivery_idx'
      and index_row.indexdef ilike '%consent_status%granted%'
  ),
  'future push delivery has a consent-filtered server index'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_devices'::regclass
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id%auth.users%on delete cascade%'
  ),
  'device owner is an Auth UUID with cascade cleanup'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000022001',
    'authenticated',
    'authenticated',
    'task022-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000022002',
    'authenticated',
    'authenticated',
    'task022-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000022003',
    'authenticated',
    'authenticated',
    'task022-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role anon;

select throws_ok(
  $$select count(*) from public.customer_devices$$,
  '42501',
  null,
  'anon cannot read the device registry'
);

select throws_ok(
  $$select public.customer_device_status_v1(
    '22000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'anon cannot invoke device status'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022003',
  true
);

select throws_ok(
  $$select public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000003',
    'ios',
    'es-CL',
    'granted',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000099'
  )$$,
  '28000',
  null,
  'anonymous Auth identities cannot register devices'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.customer_register_device_v1(
    null,
    'ios',
    'es-CL',
    'granted',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000101'
  ) ->> 'status',
  'invalid',
  'null installation fails closed'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'web',
    'es-CL',
    'granted',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000102'
  ) ->> 'status',
  'invalid',
  'unsupported platform fails closed'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'fr',
    'granted',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000103'
  ) ->> 'status',
  'invalid',
  'unsupported locale fails closed'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'es-CL',
    'implicit',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000104'
  ) ->> 'status',
  'invalid',
  'implicit consent state is rejected'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'es-CL',
    'granted',
    'unknown',
    null,
    '22000000-0000-4000-8000-000000000105'
  ) ->> 'status',
  'invalid',
  'unknown OS permission state is rejected'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'es-CL',
    'denied',
    'denied',
    'task022-token-owner-a-0000000000000001',
    '22000000-0000-4000-8000-000000000106'
  ) ->> 'status',
  'invalid',
  'a denied consent cannot retain a routing token'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'es-CL',
    'granted',
    'authorized',
    'short',
    '22000000-0000-4000-8000-000000000107'
  ) ->> 'status',
  'invalid',
  'short routing tokens fail closed'
);

create temp table task022_grant_without_token as
select public.customer_register_device_v1(
  '22000000-0000-4000-8000-000000000001',
  'ios',
  'es-CL',
  'granted',
  'authorized',
  null,
  '22000000-0000-4000-8000-000000000108'
) as payload;

select is(
  (select payload ->> 'status' from task022_grant_without_token),
  'ok',
  'explicit app consent can be recorded before a provider token exists'
);

select ok(
  not ((select payload from task022_grant_without_token) ? 'pushToken')
  and not ((select payload from task022_grant_without_token) ? 'push_token')
  and (select payload ->> 'hasToken' from task022_grant_without_token) = 'false',
  'register response exposes only hasToken and never token material'
);

select throws_ok(
  $$select count(*) from public.customer_devices$$,
  '42501',
  null,
  'even an owner cannot bypass the bounded RPC with direct reads'
);

set local role postgres;

select is(
  (
    select user_id::text || ':' || installation_id::text || ':' || platform
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  '00000000-0000-4000-8000-000000022001:22000000-0000-4000-8000-000000000001:ios',
  'owner and random installation are derived and stored independently'
);

select ok(
  (
    select consent_status = 'granted'
      and permission_status = 'authorized'
      and consented_at is not null
      and push_token is null
      and push_token_hash is null
      and expires_at is null
      and last_seen_at <= statement_timestamp()
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  'consent and OS permission remain distinct when no provider token exists'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022001',
  true
);

select ok(
  (public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'es-CL',
    'granted',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000108'
  ) ->> 'idempotent')::boolean,
  'same register idempotency key returns the prior result'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'it',
    'granted',
    'authorized',
    null,
    '22000000-0000-4000-8000-000000000108'
  ) ->> 'status',
  'idempotency_conflict',
  'same key with a different payload fails closed'
);

create temp table task022_token_register as
select public.customer_register_device_v1(
  '22000000-0000-4000-8000-000000000001',
  'ios',
  'it',
  'granted',
  'authorized',
  'task022-token-owner-a-0000000000000001',
  '22000000-0000-4000-8000-000000000109'
) as payload;

select is(
  (select payload ->> 'status' from task022_token_register),
  'ok',
  'a new idempotency key can attach a provider token'
);

select ok(
  (select payload ->> 'hasToken' from task022_token_register)::boolean
  and position(
    'task022-token-owner-a-0000000000000001'
    in (select payload::text from task022_token_register)
  ) = 0,
  'token registration returns only a boolean and never echoes the secret'
);

set local role postgres;

select ok(
  (
    select push_token = 'task022-token-owner-a-0000000000000001'
      and push_token_hash = extensions.digest(
        'task022-token-owner-a-0000000000000001',
        'sha256'
      )
      and token_updated_at is not null
      and expires_at > statement_timestamp()
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  'server stores a dedupe hash and bounded active expiry for the routing token'
);

select is(
  (
    select registration_version
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'retry/conflict do not increment registration version while token rotation does'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022001',
  true
);

create temp table task022_status_a as
select public.customer_device_status_v1(
  '22000000-0000-4000-8000-000000000001'
) as payload;

select is(
  (select payload ->> 'status' from task022_status_a),
  'ok',
  'owner can read bounded status through the RPC'
);

select ok(
  (select payload ->> 'hasToken' from task022_status_a)::boolean
  and not ((select payload from task022_status_a) ? 'pushToken')
  and position(
    'task022-token-owner-a-0000000000000001'
    in (select payload::text from task022_status_a)
  ) = 0,
  'status response never exposes token or token hash'
);

select is(
  public.customer_device_status_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ) ->> 'status',
  'not_found',
  'unknown installation does not disclose any foreign row'
);

select is(
  public.customer_device_status_v1(null) ->> 'status',
  'invalid',
  'null status input fails closed'
);

create temp table task022_revoke_a as
select public.customer_revoke_device_v1(
  '22000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000110'
) as payload;

select is(
  (select payload ->> 'status' from task022_revoke_a),
  'revoked',
  'owner can revoke the installation routing state'
);

set local role postgres;

select ok(
  (
    select consent_status = 'revoked'
      and push_token is null
      and push_token_hash is null
      and revoked_at is not null
      and expires_at is null
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  'revoke clears routing material and expiry atomically'
);

select is(
  (
    select registration_version
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'first revoke increments registration version once'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022001',
  true
);

select ok(
  (public.customer_revoke_device_v1(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000110'
  ) ->> 'idempotent')::boolean,
  'same revoke key is idempotent'
);

select is(
  public.customer_revoke_device_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    '22000000-0000-4000-8000-000000000111'
  ) ->> 'status',
  'not_found',
  'revoke of an unknown or foreign installation is non-disclosing'
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'zh-Hans',
    'denied',
    'denied',
    null,
    '22000000-0000-4000-8000-000000000112'
  ) ->> 'status',
  'ok',
  'explicit deny is persisted without a provider token'
);

set local role postgres;

select ok(
  (
    select consent_status = 'denied'
      and permission_status = 'denied'
      and locale = 'zh-Hans'
      and consented_at is null
      and revoked_at is null
      and push_token is null
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  'deny keeps consent, OS permission, locale and token state distinct'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022001',
  true
);

select is(
  public.customer_register_device_v1(
    '22000000-0000-4000-8000-000000000001',
    'ios',
    'en',
    'granted',
    'authorized',
    'task022-token-owner-a-0000000000000001',
    '22000000-0000-4000-8000-000000000113'
  ) ->> 'status',
  'ok',
  'owner can explicitly grant again after deny'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022002',
  true
);

select is(
  public.customer_device_status_v1(
    '22000000-0000-4000-8000-000000000001'
  ) ->> 'status',
  'not_found',
  'a second owner cannot read the first installation status'
);

create temp table task022_register_b as
select public.customer_register_device_v1(
  '22000000-0000-4000-8000-000000000002',
  'android',
  'en',
  'granted',
  'authorized',
  'task022-token-owner-a-0000000000000001',
  '22000000-0000-4000-8000-000000000201'
) as payload;

select is(
  (select payload ->> 'status' from task022_register_b),
  'ok',
  'explicit second-owner consent can transfer possession of the same secret token'
);

select ok(
  (select payload ->> 'hasToken' from task022_register_b)::boolean
  and position(
    'task022-token-owner-a-0000000000000001'
    in (select payload::text from task022_register_b)
  ) = 0,
  'second-owner registration also keeps the token out of responses'
);

select is(
  public.customer_revoke_device_v1(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000202'
  ) ->> 'status',
  'not_found',
  'second owner cannot revoke the first owner installation by ID'
);

set local role postgres;

select is(
  (
    select count(*)::integer
    from public.customer_devices
    where push_token_hash = extensions.digest(
      'task022-token-owner-a-0000000000000001',
      'sha256'
    )
  ),
  1,
  'exactly one active row owns a routing token after account switch'
);

select ok(
  (
    select consent_status = 'revoked'
      and push_token is null
      and push_token_hash is null
      and revoked_at is not null
    from public.customer_devices
    where user_id = '00000000-0000-4000-8000-000000022001'
      and installation_id = '22000000-0000-4000-8000-000000000001'
  ),
  'token transfer revokes and clears the previous owner routing state'
);

select ok(
  (
    select user_id = '00000000-0000-4000-8000-000000022002'
      and platform = 'android'
      and locale = 'en'
      and consent_status = 'granted'
      and permission_status = 'authorized'
      and last_seen_at <= statement_timestamp()
      and expires_at > statement_timestamp()
    from public.customer_devices
    where installation_id = '22000000-0000-4000-8000-000000000002'
  ),
  'new owner row stores only validated server-bounded lifecycle state'
);

select throws_ok(
  $$
    insert into public.customer_devices (
      user_id,
      installation_id,
      platform,
      locale,
      consent_status,
      permission_status,
      push_token,
      push_token_hash,
      last_idempotency_key,
      last_request_hash
    ) values (
      '00000000-0000-4000-8000-000000022002',
      '22000000-0000-4000-8000-000000000009',
      'android',
      'en',
      'denied',
      'denied',
      'task022-token-invalid-0000000000000001',
      extensions.digest('task022-token-invalid-0000000000000001', 'sha256'),
      '22000000-0000-4000-8000-000000000209',
      extensions.digest('invalid', 'sha256')
    )
  $$,
  '23514',
  null,
  'database constraint forbids a token when app consent is denied'
);

select is(
  (
    select count(*)::integer
    from public.customer_devices
    where user_id in (
      '00000000-0000-4000-8000-000000022001',
      '00000000-0000-4000-8000-000000022002'
    )
  ),
  2,
  'owner/install upsert keeps one row per explicit account association'
);

delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000022001',
  '00000000-0000-4000-8000-000000022002',
  '00000000-0000-4000-8000-000000022003'
);

select is(
  (
    select count(*)::integer
    from public.customer_devices
    where user_id in (
      '00000000-0000-4000-8000-000000022001',
      '00000000-0000-4000-8000-000000022002'
    )
  ),
  0,
  'Auth account deletion cascades customer device cleanup'
);

select * from finish();

rollback;
