begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table('app_private'::name, 'wechat_mini_sessions'::name);
select has_table('app_private'::name, 'wechat_mini_session_generations'::name);
select has_table('app_private'::name, 'wechat_link_attempts'::name);
select has_function('public', 'wechat_mini_session_issue_v1', array[
  'uuid', 'text', 'text', 'text', 'uuid', 'integer'
]);
select has_function('public', 'wechat_mini_session_resolve_v1', array['text', 'text']);
select has_function('public', 'wechat_mini_session_revoke_v1', array['text', 'text']);
select has_function('public', 'wechat_mini_read_v1', array['uuid', 'text', 'jsonb']);
select has_function('public', 'wechat_mini_sync_checkpoint_v1', array[
  'uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'
]);
select has_function('public', 'wechat_mini_sync_delta_v1', array[
  'uuid', 'uuid', 'text', 'text', 'integer', 'text', 'text'
]);
select has_function('public', 'wechat_link_attempt_begin_v1', array[
  'uuid', 'text', 'text', 'text', 'uuid', 'integer'
]);
select has_function('public', 'wechat_link_attempt_finalize_v1', array[
  'uuid', 'uuid', 'text'
]);
select has_function('public', 'wechat_link_attempt_reconcile_v1', array['uuid', 'integer']);

select function_privs_are(
  'public', 'wechat_mini_read_v1', array['uuid', 'text', 'jsonb'],
  'service_role', array['EXECUTE']
);
select function_privs_are(
  'public', 'wechat_mini_read_v1', array['uuid', 'text', 'jsonb'],
  'authenticated', array[]::text[]
);
select function_privs_are(
  'public', 'wechat_mini_sync_delta_v1',
  array['uuid', 'uuid', 'text', 'text', 'integer', 'text', 'text'],
  'anon', array[]::text[]
);
select function_privs_are(
  'public', 'wechat_link_attempt_finalize_v1', array['uuid', 'uuid', 'text'],
  'authenticated', array[]::text[]
);
select ok(
  not has_table_privilege('authenticated', 'app_private.wechat_mini_sessions', 'SELECT')
  and not has_table_privilege('service_role', 'app_private.wechat_mini_sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'app_private.wechat_link_attempts', 'SELECT'),
  'opaque session and saga ledgers are private'
);
select ok(
  not exists (
    select 1 from information_schema.columns column_row
    where column_row.table_schema = 'app_private'
      and column_row.table_name = 'wechat_mini_sessions'
      and column_row.column_name in (
        'token', 'access_token', 'refresh_token', 'session_key', 'device_identifier'
      )
  ),
  'session ledger stores hashes and fingerprints, never raw client credentials'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000401',
    'authenticated', 'authenticated', 'wechat004-owner@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000402',
    'authenticated', 'authenticated', 'wechat004-viewer@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000403',
    'authenticated', 'authenticated', 'wechat004-other@example.invalid',
    '{}', '{}', clock_timestamp(), clock_timestamp());

update public.profiles
set display_name = case profile_id
      when '00000000-0000-4000-8000-000000000401' then 'WECHAT-004 owner'
      when '00000000-0000-4000-8000-000000000402' then 'WECHAT-004 viewer'
      else 'WECHAT-004 other'
    end,
    profile_status = 'active',
    disabled_at = null
where profile_id in (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000403'
);

insert into public.shops (
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values
  ('10000000-0000-4000-8000-000000000401', 'WECHAT004A',
    'WECHAT-004 Shop A', 'active',
    '00000000-0000-4000-8000-000000000401'),
  ('10000000-0000-4000-8000-000000000402', 'WECHAT004B',
    'WECHAT-004 Shop B', 'active',
    '00000000-0000-4000-8000-000000000403');

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values
  ('00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401', 'viewer', 'active'),
  ('00000000-0000-4000-8000-000000000403',
    '10000000-0000-4000-8000-000000000402', 'shop_owner', 'active');

insert into public.shop_devices (
  shop_device_id, shop_id, device_identifier, device_type, display_name, status
) values
  ('30000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000401',
    '90000000-0000-4000-8000-000000000401', 'mobile',
    'WECHAT-004 Mini A', 'active'),
  ('30000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000402',
    '90000000-0000-4000-8000-000000000402', 'mobile',
    'WECHAT-004 Mini B', 'active');

set local request.jwt.claim.role = 'service_role';

select throws_ok(
  $$select public.wechat_mini_session_issue_v1(
    '00000000-0000-4000-8000-000000000402', repeat('a', 64), repeat('b', 64),
    repeat('c', 64), '40000000-0000-4000-8000-000000000401', null
  )$$,
  '22023', 'wechat_mini_session_invalid',
  'explicit NULL session lifetime is rejected'
);

create temporary table wechat004_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into wechat004_state values (
  'session',
  public.wechat_mini_session_issue_v1(
    '00000000-0000-4000-8000-000000000402', repeat('a', 64), repeat('b', 64),
    repeat('c', 64), '40000000-0000-4000-8000-000000000401', 900
  )
);
select is((select value->>'ok' from wechat004_state where key = 'session'), 'true',
  'viewer receives one server-side opaque session receipt');
select is(
  public.wechat_mini_session_resolve_v1(repeat('a', 64), repeat('b', 64))->>'actor_profile_id',
  '00000000-0000-4000-8000-000000000402',
  'matching token/device hashes resolve the canonical actor'
);
select is(
  public.wechat_mini_session_resolve_v1(repeat('a', 64), repeat('d', 64))->>'code',
  'session_expired',
  'device substitution fails closed'
);
select is(
  jsonb_array_length(public.wechat_mini_read_v1(
    '00000000-0000-4000-8000-000000000402',
    'wechat_authorized_shops_v2', '{}'::jsonb
  )),
  1,
  'opaque BFF read dispatch returns only the viewer authorized shop'
);
select is(
  public.wechat_mini_read_v1(
    '00000000-0000-4000-8000-000000000402',
    'wechat_authorized_shops_v2', '{}'::jsonb
  )->0->>'shop_id',
  '10000000-0000-4000-8000-000000000401',
  'shop A viewer cannot receive shop B through the dispatcher'
);
select throws_ok(
  $$select public.wechat_mini_read_v1(
    '00000000-0000-4000-8000-000000000402',
    'shop_catalog_create_category_with_sync', '{}'::jsonb
  )$$,
  '42501', 'wechat_mini_read_not_allowed',
  'BFF read dispatcher cannot name a legacy mutation sink'
);

select is(
  public.wechat_catalog_mutate_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401', 'category_create',
    '41000000-0000-4000-8000-000000000401',
    '42000000-0000-4000-8000-000000000401', null, null,
    '{"name":"Viewer denied"}'::jsonb
  )->>'code',
  'permission_denied',
  'viewer remains denied at the controlled mutation boundary'
);
select is(
  public.wechat_catalog_mutate_v1(
    '00000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000402', 'category_create',
    '41000000-0000-4000-8000-000000000402',
    '42000000-0000-4000-8000-000000000402', null, null,
    '{"name":"Cross shop denied"}'::jsonb
  )->>'code',
  'membership_missing',
  'shop A actor cannot mutate shop B'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name
) values (
  '21000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000401', 'Sync baseline'
);
insert into wechat004_state values (
  'checkpoint',
  public.wechat_mini_sync_checkpoint_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401',
    '90000000-0000-4000-8000-000000000401', '0', null, null
  )
);
select is((select value->>'requiresReconcile' from wechat004_state where key = 'checkpoint'),
  'true', 'initial Mini watermark requests a bounded reconcile');
select is((select value->>'shopId' from wechat004_state where key = 'checkpoint'),
  '10000000-0000-4000-8000-000000000401',
  'viewer checkpoint remains shop scoped through the canonical sync lane');

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name
) values (
  '21000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000401', 'Sync delta'
);
insert into wechat004_state values (
  'checkpoint2',
  public.wechat_mini_sync_checkpoint_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401',
    '90000000-0000-4000-8000-000000000401',
    (select value->>'eventMaxId' from wechat004_state where key = 'checkpoint'),
    (select value->>'scopeKey' from wechat004_state where key = 'checkpoint'),
    statement_timestamp()
  )
);
select is((select value->>'requiresReconcile' from wechat004_state where key = 'checkpoint2'),
  'false', 'stable scope and recent reconcile permit incremental pull');
insert into wechat004_state values (
  'delta',
  public.wechat_mini_sync_delta_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401',
    '90000000-0000-4000-8000-000000000401',
    (select value->>'eventMaxId' from wechat004_state where key = 'checkpoint'),
    50,
    (select value->>'scopeKey' from wechat004_state where key = 'checkpoint2'),
    (select value->>'eventMaxId' from wechat004_state where key = 'checkpoint2')
  )
);
select is(jsonb_array_length((select value->'rows' from wechat004_state where key = 'delta')),
  1, 'incremental delta returns only the event after the watermark');
select ok(
  not ((select value->'rows'->0 from wechat004_state where key = 'delta')
    ?| array['owner_user_id', 'store_id', 'source_device_id', 'batch_id', 'metadata']),
  'Mini delta redacts actor, device, batch and metadata fields'
);
select is(
  (select value->'rows'->0->'entity_ids'->'category_ids'->>0
    from wechat004_state where key = 'delta'),
  '21000000-0000-4000-8000-000000000402',
  'delta identifies the exact changed entity without a full catalog payload'
);
select throws_ok(
  $$select public.wechat_mini_sync_checkpoint_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000402',
    '90000000-0000-4000-8000-000000000402', '0', null, null
  )$$,
  '42501', 'wechat_mini_membership_missing',
  'viewer cannot pull a different shop'
);

update public.shop_members
set membership_status = 'suspended', suspended_at = statement_timestamp()
where profile_id = '00000000-0000-4000-8000-000000000402'
  and shop_id = '10000000-0000-4000-8000-000000000401';
select throws_ok(
  $$select public.wechat_mini_sync_checkpoint_v1(
    '00000000-0000-4000-8000-000000000402',
    '10000000-0000-4000-8000-000000000401',
    '90000000-0000-4000-8000-000000000401', '0', null, null
  )$$,
  '42501', 'wechat_mini_membership_missing',
  'membership revocation immediately blocks pull'
);
update public.shop_members
set membership_status = 'active', suspended_at = null
where profile_id = '00000000-0000-4000-8000-000000000402'
  and shop_id = '10000000-0000-4000-8000-000000000401';

select ok(public.wechat_mini_session_revoke_v1(repeat('a', 64), repeat('b', 64)),
  'logout revokes the exact opaque session');
select is(
  public.wechat_mini_session_resolve_v1(repeat('a', 64), repeat('b', 64))->>'code',
  'session_expired', 'revoked session cannot be replayed'
);

insert into wechat004_state values (
  'session2',
  public.wechat_mini_session_issue_v1(
    '00000000-0000-4000-8000-000000000402', repeat('e', 64), repeat('b', 64),
    repeat('c', 64), '40000000-0000-4000-8000-000000000402', 900
  )
);
update app_private.wechat_mini_session_generations
set generation = generation + 1, updated_at = statement_timestamp()
where actor_profile_id = '00000000-0000-4000-8000-000000000402';
select is(
  public.wechat_mini_session_resolve_v1(repeat('e', 64), repeat('b', 64))->>'code',
  'session_expired', 'server auth generation rotation invalidates prior sessions'
);

insert into wechat004_state values (
  'link1',
  public.wechat_link_attempt_begin_v1(
    '00000000-0000-4000-8000-000000000401', 'custom:wechat', 'web',
    repeat('f', 64), '50000000-0000-4000-8000-000000000401', 600
  )
);
select is(
  public.wechat_link_attempt_finalize_v1(
    '00000000-0000-4000-8000-000000000401',
    (select (value->>'attempt_id')::uuid from wechat004_state where key = 'link1'),
    repeat('f', 64)
  )->>'code',
  'provider_not_linked', 'audit cannot finalize before provider success'
);
insert into auth.identities (provider_id, user_id, identity_data, provider)
values (
  'wechat004-union-fixture', '00000000-0000-4000-8000-000000000401',
  jsonb_build_object('sub', 'wechat004-union-fixture'), 'custom:wechat'
);
insert into wechat004_state values (
  'link1final',
  public.wechat_link_attempt_finalize_v1(
    '00000000-0000-4000-8000-000000000401',
    (select (value->>'attempt_id')::uuid from wechat004_state where key = 'link1'),
    repeat('f', 64)
  )
);
select is((select value->>'status' from wechat004_state where key = 'link1final'),
  'audit_finalized', 'provider success and audit finalize in one idempotent transaction');
select is(
  public.wechat_link_attempt_finalize_v1(
    '00000000-0000-4000-8000-000000000401',
    (select (value->>'attempt_id')::uuid from wechat004_state where key = 'link1'),
    repeat('f', 64)
  )->>'replayed',
  'true', 'duplicate callback returns the durable finalized receipt'
);
select is(
  (select count(*)::integer from public.audit_logs audit
   where audit.event_key = 'auth.wechat.link.saga_finalized'
     and audit.metadata_redacted->>'attemptId' =
       (select value->>'attempt_id' from wechat004_state where key = 'link1')),
  1, 'callback replay cannot duplicate link audit'
);

insert into wechat004_state values (
  'link2',
  public.wechat_link_attempt_begin_v1(
    '00000000-0000-4000-8000-000000000401', 'custom:wechat', 'android',
    repeat('1', 64), '50000000-0000-4000-8000-000000000402', 600
  )
);
select is(
  public.wechat_link_attempt_reconcile_v1(
    '00000000-0000-4000-8000-000000000401', 10
  )->>'completed',
  '1', 'reconcile closes provider-completed crash residue exactly once'
);
select is(
  (select status from app_private.wechat_link_attempts
   where attempt_id = (select (value->>'attempt_id')::uuid
     from wechat004_state where key = 'link2')),
  'audit_finalized', 'reconcile records the durable terminal state'
);

insert into wechat004_state values (
  'link3',
  public.wechat_link_attempt_begin_v1(
    '00000000-0000-4000-8000-000000000401', 'custom:wechat', 'ios',
    repeat('2', 64), '50000000-0000-4000-8000-000000000403', 600
  )
);
select is(
  public.wechat_link_attempt_finalize_v1(
    '00000000-0000-4000-8000-000000000403',
    (select (value->>'attempt_id')::uuid from wechat004_state where key = 'link3'),
    repeat('2', 64)
  )->>'code',
  'link_attempt_invalid', 'another account cannot take over a link attempt'
);
select ok(
  public.wechat_link_attempt_fail_v1(
    '00000000-0000-4000-8000-000000000401',
    (select (value->>'attempt_id')::uuid from wechat004_state where key = 'link3'),
    'identity_already_linked', true
  ),
  'provider identity conflict is durably failed closed'
);
select is(
  (select status from app_private.wechat_link_attempts
   where attempt_id = (select (value->>'attempt_id')::uuid
     from wechat004_state where key = 'link3')),
  'conflict', 'identity conflict never auto-merges profiles'
);

insert into wechat004_state values (
  'link4',
  public.wechat_link_attempt_begin_v1(
    '00000000-0000-4000-8000-000000000403', 'custom:wechat', 'android',
    repeat('3', 64), '50000000-0000-4000-8000-000000000404', 600
  )
);
insert into wechat004_state values (
  'link5',
  public.wechat_link_attempt_begin_v1(
    '00000000-0000-4000-8000-000000000403', 'custom:wechat', 'ios',
    repeat('4', 64), '50000000-0000-4000-8000-000000000405', 600
  )
);
select is(
  (select status || ':' || failure_code
   from app_private.wechat_link_attempts
   where attempt_id = (select (value->>'attempt_id')::uuid
     from wechat004_state where key = 'link4')),
  'failed:superseded', 'a newer provider attempt supersedes older live state'
);
select is(
  (select status from app_private.wechat_link_attempts
   where attempt_id = (select (value->>'attempt_id')::uuid
     from wechat004_state where key = 'link5')),
  'pending', 'only the newest provider attempt remains reconcilable'
);
update app_private.wechat_link_attempts
set created_at = statement_timestamp() - interval '11 minutes',
    expires_at = statement_timestamp() - interval '1 minute',
    updated_at = statement_timestamp()
where attempt_id = (select (value->>'attempt_id')::uuid
  from wechat004_state where key = 'link5');
insert into auth.identities (provider_id, user_id, identity_data, provider)
values (
  'wechat004-expired-reconcile',
  '00000000-0000-4000-8000-000000000403',
  jsonb_build_object('sub', 'wechat004-expired-reconcile'),
  'custom:wechat'
);
select is(
  public.wechat_link_attempt_reconcile_v1(
    '00000000-0000-4000-8000-000000000403', 10
  )->>'completed',
  '1', 'linked provider state is reconciled even after callback-attempt expiry'
);
select is(
  (select status from app_private.wechat_link_attempts
   where attempt_id = (select (value->>'attempt_id')::uuid
     from wechat004_state where key = 'link5')),
  'audit_finalized', 'post-provider crash residue cannot expire without audit'
);
select ok(
  not exists (
    select 1 from public.audit_logs audit
    where audit.event_key like 'auth.wechat.link.saga_%'
      and audit.metadata_redacted::text ~* '(access.?token|refresh.?token|session.?key|oauth.?code)'
  ),
  'link saga audit contains no token, session key or OAuth code'
);

select * from finish();
rollback;
