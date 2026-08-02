begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(64);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'customer_profiles',
        'customer_addresses',
        'customer_account_deletion_requests'
      )
      and class.relkind = 'r'
  ),
  3,
  'TASK-021 installs the three customer-owned tables'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'customer_profiles',
        'customer_addresses',
        'customer_account_deletion_requests'
      )
      and column_name ~* '(email|password|token|oauth|credential|secret)'
  ),
  'customer tables contain no email identity or OAuth credential material'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_profiles'
      and column_name = 'user_id'
      and data_type = 'uuid'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_profiles'::regclass
      and constraint_row.contype = 'p'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) = 'PRIMARY KEY (user_id)'
  ),
  'customer profile identity is the Auth user UUID primary key'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'customer_profiles',
        'customer_addresses',
        'customer_account_deletion_requests'
      )
  ),
  'all customer tables enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class class on class.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'customer_profiles',
        'customer_addresses',
        'customer_account_deletion_requests'
      )
  ),
  9,
  'owner-only policy set covers profile/address CRUD and deletion-request read'
);

select ok(
  not has_table_privilege('anon', 'public.customer_profiles', 'SELECT')
  and not has_table_privilege('anon', 'public.customer_addresses', 'SELECT')
  and not has_table_privilege(
    'anon',
    'public.customer_account_deletion_requests',
    'SELECT'
  ),
  'anon has no customer table privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.customer_profiles', 'SELECT')
  and has_table_privilege('authenticated', 'public.customer_profiles', 'DELETE')
  and has_table_privilege('authenticated', 'public.customer_addresses', 'SELECT')
  and has_table_privilege('authenticated', 'public.customer_addresses', 'DELETE')
  and has_table_privilege(
    'authenticated',
    'public.customer_account_deletion_requests',
    'SELECT'
  ),
  'authenticated customers receive only the required table-level capabilities'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.customer_profiles', 'user_id', 'INSERT'
  )
  and not has_column_privilege(
    'authenticated', 'public.customer_profiles', 'privacy_consented_at', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.customer_addresses', 'user_id', 'INSERT'
  )
  and not has_column_privilege(
    'authenticated', 'public.customer_addresses', 'is_default', 'UPDATE'
  ),
  'owner, consent timestamp and default-address fields are server-owned'
);

select ok(
  has_table_privilege('service_role', 'public.customer_profiles', 'INSERT')
  and has_table_privilege('service_role', 'public.customer_addresses', 'UPDATE')
  and has_table_privilege(
    'service_role',
    'public.customer_account_deletion_requests',
    'DELETE'
  ),
  'service role has explicit server workflow privileges'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_record_privacy_consent_v1',
        'customer_set_default_address_v1',
        'customer_request_account_deletion_v1',
        'customer_cancel_account_deletion_v1',
        'customer_data_export_v1'
      )
  ),
  5,
  'TASK-021 installs the complete customer RPC set'
);

select ok(
  (
    select bool_and(
      case
        when procedure.proname = 'customer_data_export_v1'
          then not procedure.prosecdef
        else procedure.prosecdef
      end
      and 'search_path=""' = any(procedure.proconfig)
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'customer_%_v1'
  ),
  'mutations are hardened definers and export remains an RLS-bound invoker'
);

select ok(
  not has_function_privilege(
    'anon', 'public.customer_record_privacy_consent_v1(text,boolean)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_set_default_address_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_request_account_deletion_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_cancel_account_deletion_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_data_export_v1()', 'EXECUTE'
  ),
  'anon cannot invoke customer RPCs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.customer_record_privacy_consent_v1(text,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_set_default_address_v1(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_request_account_deletion_v1(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_cancel_account_deletion_v1(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.customer_data_export_v1()', 'EXECUTE'
  ),
  'authenticated customers can invoke the allow-listed customer RPCs'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.indexname = 'customer_addresses_one_default_per_user_idx'
      and index_row.indexdef ilike '%where is_default%'
  ),
  'a partial unique index prevents multiple default addresses per customer'
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
    '00000000-0000-4000-8000-000000021001',
    'authenticated',
    'authenticated',
    'customer-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000021002',
    'authenticated',
    'authenticated',
    'customer-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000021003',
    'authenticated',
    'authenticated',
    'anonymous-customer@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role anon;

select throws_ok(
  $$select count(*) from public.customer_profiles$$,
  '42501',
  null,
  'anon cannot read customer profiles'
);

select throws_ok(
  $$insert into public.customer_profiles (display_name) values ('Anon')$$,
  '42501',
  null,
  'anon cannot create customer profiles'
);

select throws_ok(
  $$select public.customer_data_export_v1()$$,
  '42501',
  null,
  'anon cannot execute the customer export RPC'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000021001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000021001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.customer_profiles (display_name, locale)
    values ('Cliente Uno', 'es-CL')
  $$,
  'owner can create a customer profile without supplying identity'
);

select is(
  (select count(*)::integer from public.customer_profiles),
  1,
  'owner reads exactly the own profile'
);

select is(
  (
    select user_id::text || ':' || display_name || ':' || locale
    from public.customer_profiles
  ),
  '00000000-0000-4000-8000-000000021001:Cliente Uno:es-CL',
  'profile defaults identity from auth.uid and preserves public fields'
);

select lives_ok(
  $$update public.customer_profiles set display_name = 'Cliente A', locale = 'it'$$,
  'owner can update the own profile'
);

select throws_ok(
  $$update public.customer_profiles set locale = 'fr'$$,
  '23514',
  null,
  'unsupported profile locale fails closed'
);

select throws_ok(
  $$update public.customer_profiles set display_name = E'Cliente\nA'$$,
  '23514',
  null,
  'control characters are rejected from profile display name'
);

select is(
  public.customer_record_privacy_consent_v1('privacy-2026.08', true) ->> 'status',
  'ok',
  'owner can record privacy consent through the server clock contract'
);

select ok(
  (
    select privacy_consent_version = 'privacy-2026.08'
      and privacy_consented_at is not null
    from public.customer_profiles
  ),
  'privacy consent stores the version and authoritative timestamp together'
);

select is(
  public.customer_record_privacy_consent_v1('bad version', true) ->> 'status',
  'invalid',
  'malformed privacy version is rejected without mutation'
);

select lives_ok(
  $$
    insert into public.customer_addresses (
      label,
      recipient_name,
      address_line_1,
      commune,
      region,
      postal_code,
      country_code
    ) values (
      'Casa',
      'Cliente A',
      'Avenida Uno 123',
      'Santiago',
      'Metropolitana',
      '8320000',
      'CL'
    )
  $$,
  'owner can create a valid address'
);

select lives_ok(
  $$
    insert into public.customer_addresses (
      label,
      recipient_name,
      address_line_1,
      commune,
      region
    ) values (
      'Trabajo',
      'Cliente A',
      'Calle Dos 456',
      'Providencia',
      'Metropolitana'
    )
  $$,
  'owner can create a second valid address'
);

select throws_ok(
  $$
    insert into public.customer_addresses (
      label, recipient_name, address_line_1, commune, region
    ) values (' ', 'Cliente A', 'Calle', 'Santiago', 'Metropolitana')
  $$,
  '23514',
  null,
  'blank address label fails closed'
);

select throws_ok(
  $$
    insert into public.customer_addresses (
      user_id, label, recipient_name, address_line_1, commune, region
    ) values (
      '00000000-0000-4000-8000-000000021002',
      'Ataque', 'Ataque', 'Ataque 1', 'Santiago', 'Metropolitana'
    )
  $$,
  '42501',
  null,
  'authenticated client cannot supply a different owner column'
);

select is(
  public.customer_set_default_address_v1(
    (
      select id
      from public.customer_addresses
      where label = 'Casa'
    )
  ) ->> 'status',
  'ok',
  'owner can set the first address as default atomically'
);

select is(
  (
    select count(*)::integer
    from public.customer_addresses
    where is_default
  ),
  1,
  'exactly one default address exists after the first transition'
);

select is(
  public.customer_set_default_address_v1(
    (
      select id
      from public.customer_addresses
      where label = 'Trabajo'
    )
  ) ->> 'status',
  'ok',
  'owner can move the default address atomically'
);

select is(
  (
    select string_agg(label, ',' order by label)
    from public.customer_addresses
    where is_default
  ),
  'Trabajo',
  'the previous default is cleared in the same transaction'
);

select is(
  public.customer_set_default_address_v1(null) ->> 'status',
  'invalid',
  'null default-address input fails closed'
);

select is(
  public.customer_set_default_address_v1(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ) ->> 'status',
  'not_found',
  'unknown address does not disclose any foreign row'
);

select is(
  public.customer_data_export_v1() ->> 'apiVersion',
  'customer.v1',
  'customer export is explicitly versioned'
);

select ok(
  public.customer_data_export_v1()::text
    !~* '(customer-a@example|password|token|oauth|credential|secret)',
  'customer export excludes email and credential material'
);

select is(
  jsonb_array_length(public.customer_data_export_v1() -> 'addresses'),
  2,
  'customer export includes both owner addresses'
);

create temp table task021_request_a as
select public.customer_request_account_deletion_v1(
  '21000000-0000-4000-8000-000000000001'
) as payload;

select is(
  (select payload ->> 'status' from task021_request_a),
  'requested',
  'owner can create an account deletion request'
);

select is(
  public.customer_request_account_deletion_v1(
    '21000000-0000-4000-8000-000000000001'
  ) ->> 'requestId',
  (select payload ->> 'requestId' from task021_request_a),
  'same idempotency key returns the same deletion request'
);

select is(
  public.customer_request_account_deletion_v1(
    '21000000-0000-4000-8000-000000000002'
  ) ->> 'requestId',
  (select payload ->> 'requestId' from task021_request_a),
  'a second key cannot create a duplicate active deletion request'
);

select is(
  public.customer_cancel_account_deletion_v1(
    (select (payload ->> 'requestId')::uuid from task021_request_a)
  ) ->> 'status',
  'cancelled',
  'owner can revoke a pending deletion request'
);

select is(
  public.customer_cancel_account_deletion_v1(
    (select (payload ->> 'requestId')::uuid from task021_request_a)
  ) ->> 'status',
  'cancelled',
  'deletion-request cancellation is idempotent'
);

select isnt(
  public.customer_request_account_deletion_v1(
    '21000000-0000-4000-8000-000000000003'
  ) ->> 'requestId',
  (select payload ->> 'requestId' from task021_request_a),
  'a new request can be created after cancellation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000021002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000021002',
  true
);

select lives_ok(
  $$
    insert into public.customer_profiles (display_name, locale)
    values ('Cliente B', 'en')
  $$,
  'a second owner can create an independent profile'
);

select is(
  (
    select count(*)::integer
    from public.customer_profiles
    where user_id = '00000000-0000-4000-8000-000000021001'
  ),
  0,
  'second owner cannot read the first profile'
);

select lives_ok(
  $$
    update public.customer_profiles
    set display_name = 'Cross user'
    where user_id = '00000000-0000-4000-8000-000000021001'
  $$,
  'cross-user profile update is filtered without leaking row existence'
);

select lives_ok(
  $$
    delete from public.customer_addresses
    where user_id = '00000000-0000-4000-8000-000000021001'
  $$,
  'cross-user address delete is filtered without leaking row existence'
);

select lives_ok(
  $$
    insert into public.customer_addresses (
      label, recipient_name, address_line_1, commune, region
    ) values ('Casa B', 'Cliente B', 'Calle B 1', 'Ñuñoa', 'Metropolitana')
  $$,
  'second owner can create an independent address'
);

set local role postgres;
select is(
  (
    select display_name
    from public.customer_profiles
    where user_id = '00000000-0000-4000-8000-000000021001'
  ),
  'Cliente A',
  'cross-user update left the first profile unchanged'
);

select is(
  (
    select count(*)::integer
    from public.customer_addresses
    where user_id = '00000000-0000-4000-8000-000000021001'
  ),
  2,
  'cross-user delete left both first-owner addresses intact'
);

create temp table task021_address_a as
select id
from public.customer_addresses
where user_id = '00000000-0000-4000-8000-000000021001'
order by id
limit 1;
grant select on task021_address_a to authenticated;
create temp table task021_request_a_id as
select id
from public.customer_account_deletion_requests
where user_id = '00000000-0000-4000-8000-000000021001'
order by requested_at
limit 1;
grant select on task021_request_a_id to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000021002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000021002',
  true
);

select is(
  public.customer_set_default_address_v1(
    (select id from task021_address_a)
  ) ->> 'status',
  'not_found',
  'second owner cannot set a foreign default address'
);

select is(
  public.customer_cancel_account_deletion_v1(
    (select id from task021_request_a_id)
  ) ->> 'status',
  'not_found',
  'second owner cannot cancel a foreign deletion request'
);

select is(
  (
    select count(*)::integer
    from public.customer_account_deletion_requests
    where user_id = '00000000-0000-4000-8000-000000021001'
  ),
  0,
  'second owner cannot read first owner deletion requests'
);

select ok(
  public.customer_data_export_v1()::text !~ '00000000-0000-4000-8000-000000021001'
  and public.customer_data_export_v1()::text !~ 'Cliente A',
  'second owner export contains no first-owner identifiers or data'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000021003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000021003',
  true
);

select throws_ok(
  $$insert into public.customer_profiles (display_name) values ('Anon Auth')$$,
  '42501',
  null,
  'anonymous Auth identity is denied by owner RLS'
);

select throws_ok(
  $$select public.customer_record_privacy_consent_v1('privacy-2026.08', true)$$,
  '28000',
  null,
  'anonymous Auth identity cannot record privacy consent'
);

select throws_ok(
  $$select public.customer_request_account_deletion_v1(
    '21000000-0000-4000-8000-000000000099'
  )$$,
  '28000',
  null,
  'anonymous Auth identity cannot create a deletion request'
);

select throws_ok(
  $$select public.customer_data_export_v1()$$,
  '28000',
  null,
  'anonymous Auth identity cannot export customer data'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000021001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000021001',
  true
);

select lives_ok(
  $$delete from public.customer_addresses where label = 'Casa'$$,
  'owner can delete an own address'
);

select is(
  jsonb_array_length(public.customer_data_export_v1() -> 'addresses'),
  1,
  'owner export reflects address deletion without stale data'
);

select is(
  public.customer_record_privacy_consent_v1(null, false) ->> 'accepted',
  'false',
  'owner can revoke privacy consent explicitly'
);

select ok(
  (
    select privacy_consent_version is null
      and privacy_consented_at is null
    from public.customer_profiles
  ),
  'consent revocation clears version and timestamp atomically'
);

select * from finish();

rollback;
