begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table sync_recovery_sequence_state as
select last_value, is_called
from public.sync_events_id_seq;

select setval(
  'public.sync_events_id_seq',
  greatest(
    coalesce((select max(id) from public.sync_events), 0),
    1000
  ),
  true
);

select no_plan();

select has_function(
  'app_private',
  'sync_event_entity_ids_are_complete',
  array['text', 'integer', 'jsonb'],
  'sync-event completeness helper exists'
);
select is(
  (
    select function_row.provolatile::text
    from pg_proc function_row
    where function_row.oid =
      'app_private.sync_event_entity_ids_belong_to_scope(text,jsonb,uuid,uuid)'::regprocedure
  ),
  's',
  'entity scope validation is STABLE so statement-trigger events see same-statement rows'
);
select has_function(
  'public',
  'shop_sync_recovery_checkpoint_v1',
  array['uuid', 'text', 'text', 'text'],
  'shop recovery checkpoint RPC exists'
);
select has_function(
  'public',
  'shop_sync_convergence_marker_v1',
  array['uuid', 'text', 'text', 'text'],
  'shop convergence marker RPC exists'
);
select has_function(
  'public',
  'shop_sync_recovery_page_v1',
  array['uuid', 'text', 'text', 'text', 'integer', 'text', 'text', 'text'],
  'shop recovery snapshot-page RPC exists'
);
select has_function(
  'public',
  'shop_sync_event_page_v1',
  array['uuid', 'text', 'text', 'integer', 'text', 'text'],
  'shop-scoped incremental event-page RPC exists'
);
select has_function(
  'public',
  'shop_sync_rows_by_ids_v1',
  array['uuid', 'text', 'text', 'text[]', 'text', 'text', 'text'],
  'shop-scoped targeted row RPC exists'
);
select has_function(
  'public',
  'staff_web_lifecycle_mutate_v1',
  array['uuid', 'text', 'jsonb', 'uuid', 'uuid', 'text', 'integer'],
  'staff lifecycle RPC exists as one execute-only mutation boundary'
);
select has_function(
  'public',
  'staff_web_audit_event_v1',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'integer', 'text', 'text', 'text',
    'text', 'text', 'text', 'text', 'jsonb'
  ],
  'staff audit RPC exists as one lease-bound execute boundary'
);
select hasnt_function(
  'public',
  'record_shop_sync_event_service_v1',
  array['uuid', 'uuid', 'text', 'text', 'integer', 'jsonb', 'text', 'text', 'uuid', 'text', 'jsonb'],
  'obsolete service-role post-write event RPC is absent'
);
select has_trigger(
  'public',
  'sync_events',
  'split_pos_catalog_import_sync_event',
  'trusted POS bulk sync-event splitter exists'
);
select has_index(
  'public',
  'inventory_products',
  'inventory_products_shop_recovery_id_idx',
  'shop snapshot keyset index exists'
);
select has_index(
  'public',
  'shared_sheet_sessions',
  'shared_sheet_sessions_legacy_recovery_uuid_v2_idx',
  'legacy history snapshot keyset index exists'
);
select has_index(
  'public',
  'sync_events',
  'sync_events_shop_recovery_id_idx',
  'shop event-tail keyset index exists'
);
select has_index(
  'public',
  'sync_events',
  'sync_events_legacy_recovery_id_idx',
  'legacy event-tail keyset index exists'
);
select ok(
  not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.sync_events'::regclass
      and constraint_row.conname = 'sync_events_entity_ids_complete'
  ),
  'expand phase preserves legacy direct writes without a new entity-id constraint'
);
select has_trigger(
  'public',
  'shop_devices',
  'shop_devices_metadata_redacted_persisted_v1_trigger',
  'device metadata trigger validates new and rewritten values only'
);
select ok(
  app_private.device_metadata_is_persisted_v1('{}'::jsonb)
  and app_private.device_metadata_is_persisted_v1(
    jsonb_build_object('app_version_present', true, 'source', 'TASK-021')
  )
  and not app_private.device_metadata_is_persisted_v1(
    jsonb_build_object('source', 'TASK-021')
  ),
  'persisted metadata accepts bounded defaults and the exact POS form, not new source-only values'
);
select ok(
  has_function_privilege(
    'authenticated',
    'app_private.sync_event_entity_ids_are_complete(text,integer,jsonb)',
    'EXECUTE'
  ),
  'authenticated constraint evaluation can execute the pure helper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.sync_checkpoint_chain_digest_v1(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.set_inventory_catalog_updated_at()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.set_shared_sheet_sessions_updated_at()',
    'EXECUTE'
  ),
  'aggregate transition and trigger entrypoints are not client-callable'
);
select ok(
  has_function_privilege(
    'authenticated',
    'app_private.sync_history_recovery_row_fits_v1(text,integer,text,text,text,boolean,timestamptz,uuid,text,timestamptz,uuid,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated History DML can evaluate the private recovery-row CHECK wrapper'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated can execute only the public checkpoint boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.shop_sync_recovery_checkpoint_v1(uuid,text,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the checkpoint RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_sync_convergence_marker_v1(uuid,text,text,text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.shop_sync_convergence_marker_v1(uuid,text,text,text)',
    'EXECUTE'
  ),
  'only authenticated callers can execute the convergence marker RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.staff_web_lifecycle_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'service_role',
    'public.staff_web_lifecycle_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.staff_web_lifecycle_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'staff lifecycle RPC is callable only by authenticated or server staff boundaries'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.staff_web_audit_event_v1(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.staff_web_audit_event_v1(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.staff_web_audit_event_v1(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'staff audit RPC is restricted to the server-side lease holder'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_device_register(uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.shop_device_register(uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.shop_device_register(uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.shop_device_register_for_shop(uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.shop_device_register_for_shop(uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'legacy Admin and mobile registration RPCs expose no service-role bypass'
);
select ok(
  app_private.sync_event_entity_ids_are_complete(
    'catalog',
    3,
    '{
      "supplier_ids":["21000000-0000-4000-8000-000000000901"],
      "category_ids":["22000000-0000-4000-8000-000000000901"],
      "product_ids":["23000000-0000-4000-8000-000000000901"]
    }'::jsonb
  ),
  'catalog changed_count equals the sum of all primary entity arrays'
);
select ok(
  app_private.sync_event_entity_ids_are_complete(
    'prices',
    1,
    '{
      "price_ids":["24000000-0000-4000-8000-000000000901"],
      "product_ids":["23000000-0000-4000-8000-000000000901"]
    }'::jsonb
  ),
  'price changed_count counts price_ids while product_ids remain references'
);
select ok(
  app_private.sync_event_entity_ids_are_complete(
    'history',
    1,
    '{"session_ids":["25000000-0000-4000-8000-000000000901"]}'::jsonb
  ),
  'history changed_count equals session_ids length'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete('catalog', 1, null),
  'changed rows without entity_ids are rejected'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete('catalog', 1, '{}'::jsonb),
  'changed rows with an empty entity-id object are rejected'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete(
    'catalog',
    2,
    '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb
  ),
  'insufficient primary IDs are rejected'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete(
    'catalog',
    2,
    '{
      "product_ids":[
        "23000000-0000-4000-8000-000000000901",
        "23000000-0000-4000-8000-000000000901"
      ]
    }'::jsonb
  ),
  'duplicate primary IDs are rejected'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete(
    'history',
    1,
    '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb
  ),
  'cross-domain entity keys are rejected'
);
select ok(
  app_private.sync_event_entity_ids_are_complete(
    'catalog',
    250,
    (
      select jsonb_build_object('product_ids', jsonb_agg(gen_random_uuid()::text))
      from generate_series(1, 250)
    )
  ),
  'exactly 250 primary IDs are accepted'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete(
    'catalog',
    251,
    (
      select jsonb_build_object('product_ids', jsonb_agg(gen_random_uuid()::text))
      from generate_series(1, 251)
    )
  ),
  'more than 250 primary IDs require producer chunking'
);
select ok(
  app_private.sync_event_entity_ids_are_complete('catalog', 0, null),
  'zero-change compatibility events may omit entity IDs'
);
select ok(
  not app_private.sync_event_entity_ids_are_complete(
    'history',
    26,
    (
      select jsonb_build_object('session_ids', jsonb_agg(gen_random_uuid()::text))
      from generate_series(1, 26)
    )
  ),
  'history events above the targeted 25-ID boundary require producer chunking'
);
select is(
  public.mobile_sync_auto_event_capabilities()->>'schemaVersion',
  '6',
  'automatic event capability schema is version 6'
);
select is(
  public.mobile_sync_auto_event_capabilities()->>'recoverySnapshotStrategy',
  'live-keyset-plus-frozen-event-tail-v1',
  'recovery pages converge through a frozen catch-up tail without quiescence'
);
select is(
  public.mobile_sync_auto_event_capabilities()->>'noWorkProof',
  'scope-baseline-events-counts-and-strong-digests-v1',
  'capabilities require the strong shop-scoped noWork proof'
);
select is(
  public.mobile_sync_auto_event_capabilities()#>>'{maxEntityIdsByDomain,history}',
  '25',
  'capabilities publish the history event chunk limit'
);
select is(
  public.mobile_sync_auto_event_capabilities()#>>'{maxTargetedIdsByDomain,history}',
  '3',
  'capabilities publish the bounded history targeted-row chunk'
);
select is(
  public.mobile_sync_auto_event_capabilities()#>>'{maxTargetedIdsByRecoveryDomain,products}',
  '60',
  'capabilities publish the exact product targeted-row chunk'
);
select is(
  public.mobile_sync_auto_event_capabilities()#>>'{maxTargetedIdsByRecoveryDomain,prices}',
  '120',
  'capabilities publish the exact price targeted-row chunk'
);
select is(
  public.mobile_sync_auto_event_capabilities()->>'producerEpoch',
  'database-atomic-complete-entity-ids-v1',
  'capabilities freeze the trigger-authoritative producer epoch'
);
select is(
  public.mobile_sync_auto_event_capabilities()->>'eventCursorOrdering',
  'scope-serialized-id-v1',
  'capabilities require commit-ordered event ID publication'
);
select is(
  public.mobile_sync_auto_event_capabilities()->>'legacyOutboxCutoverPolicy',
  'full-recovery-then-terminalize-v1',
  'capabilities freeze the lossless pre-v2 outbox cutover policy'
);

select is(
  app_private.sync_checkpoint_sha256(''),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'empty digest matches the cross-platform SHA-256 vector'
);
select is(
  app_private.sync_checkpoint_chain_digest_v1(value order by ordinal),
  'd35cc83a5331da3caac79921218db4c55d400a32b0a03846002fff8dfadaa08e',
  'chain-v1 digest matches the ordered ASCII and UTF-8 golden vector'
)
from (values (1, 'abc'), (2, 'é'), (3, 'xyz')) vector(ordinal, value);
select is(
  app_private.sync_checkpoint_chain_digest_v1(value order by ordinal),
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'chain-v1 empty input returns the SHA-256 empty seed'
)
from (select null::text as value, 1 as ordinal where false) vector;
select is(
  app_private.sync_checkpoint_chain_step_v1(
    app_private.sync_checkpoint_chain_step_v1(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'abc'
    ),
    'é'
  ),
  'f78359ac705f7a5d38c01325096b77a570fb8a3fda3ba96cb8b105bf0a860a24',
  'chain-v1 state is paging-invariant across a UTF-8 boundary'
);
select is(
  app_private.sync_checkpoint_timestamp('2026-07-21 12:34:56.123456+00'::timestamptz),
  '2026-07-21T12:34:56.123456Z',
  'checkpoint timestamps are UTC with exactly six fractional digits'
);
select is(
  app_private.sync_checkpoint_json_timestamp(
    '2026-07-21 08:34:56.123456-04'::timestamptz
  ),
  '2026-07-21T12:34:56.123456Z',
  'snapshot JSON timestamps use the same canonical UTC6 representation'
);
select ok(
  app_private.sync_checkpoint_json_timestamp(null) is null,
  'snapshot JSON timestamps preserve SQL null instead of the digest sentinel'
);
select is(
  app_private.sync_checkpoint_timestamp('infinity'::timestamptz),
  '!nonfinite',
  'positive infinity is represented only by the fail-closed digest sentinel'
);
select is(
  app_private.sync_checkpoint_json_timestamp('-infinity'::timestamptz),
  '!nonfinite',
  'negative infinity is represented only by the fail-closed row sentinel'
);
select is(
  app_private.sync_checkpoint_sha256(
    '20000000-0000-4000-8000-000000000001' || E'\x1f' ||
    '2026-07-21T12:34:56.123456Z' || E'\x1f-'
  ),
  '920425d6c0dfbf5e957ca1c0a6d352b287c869755b958f86ffdd8abd0c17fad0',
  'version digest matches the shared UTF-8 separator test vector'
);
select is(
  app_private.sync_price_canonical_amount_v1(0.1::double precision),
  '0.1',
  'price canonicalization does not expose binary floating-point artifacts'
);
select is(
  app_private.sync_price_canonical_amount_v1(
    999999999999.999::double precision
  ),
  '999999999999.999',
  'maximum accepted price has a cross-language canonical decimal vector'
);
select ok(
  app_private.sync_price_value_is_canonical_v1(1.234::double precision)
  and not app_private.sync_price_value_is_canonical_v1(
    1.2345::double precision
  ),
  'price validation accepts only values already exact at the three-decimal contract'
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
    '00000000-0000-4000-8000-000000000901',
    'authenticated',
    'authenticated',
    'sync-recovery-owner-a@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000902',
    'authenticated',
    'authenticated',
    'sync-recovery-owner-b@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000903',
    'authenticated',
    'authenticated',
    'sync-recovery-viewer@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000904',
    'authenticated',
    'authenticated',
    'sync-recovery-manager@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000905',
    'authenticated',
    'authenticated',
    'sync-recovery-legacy-owner@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000906',
    'authenticated',
    'authenticated',
    'sync-recovery-unresolved-owner@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000000901', 'Sync recovery owner A', 'active'),
  ('00000000-0000-4000-8000-000000000902', 'Sync recovery owner B', 'active'),
  ('00000000-0000-4000-8000-000000000903', 'Sync recovery viewer', 'active'),
  ('00000000-0000-4000-8000-000000000904', 'Sync recovery manager', 'active'),
  ('00000000-0000-4000-8000-000000000905', 'Sync recovery legacy owner', 'active'),
  ('00000000-0000-4000-8000-000000000906', 'Sync recovery unresolved owner', 'active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000000901', 'SYNC901A', 'Sync recovery shop A', 'active'),
  ('10000000-0000-4000-8000-000000000902', 'SYNC901B', 'Sync recovery shop B', 'active'),
  ('10000000-0000-4000-8000-000000000903', 'SYNC901C', 'Sync recovery legacy shop', 'active'),
  ('10000000-0000-4000-8000-000000000904', 'SYNC901D', 'Sync recovery unresolved shop', 'active');

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status
)
values
  ('00000000-0000-4000-8000-000000000901', '10000000-0000-4000-8000-000000000901', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000902', '10000000-0000-4000-8000-000000000902', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000903', '10000000-0000-4000-8000-000000000901', 'viewer', 'active'),
  ('00000000-0000-4000-8000-000000000904', '10000000-0000-4000-8000-000000000901', 'shop_manager', 'active'),
  ('00000000-0000-4000-8000-000000000905', '10000000-0000-4000-8000-000000000903', 'shop_owner', 'active'),
  ('00000000-0000-4000-8000-000000000906', '10000000-0000-4000-8000-000000000904', 'shop_owner', 'active');

insert into public.shop_devices (
  shop_device_id,
  shop_id,
  device_identifier,
  device_type,
  display_name,
  status
)
values
  (
    '30000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'mobile',
    'Sync recovery device A',
    'active'
  ),
  (
    '30000000-0000-4000-8000-000000000902',
    '10000000-0000-4000-8000-000000000902',
    'sync-recovery-device-b',
    'mobile',
    'Sync recovery device B',
    'active'
  ),
  (
    '30000000-0000-4000-8000-000000000903',
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c',
    'mobile',
    'Sync recovery device C',
    'active'
  ),
  (
    '30000000-0000-4000-8000-000000000904',
    '10000000-0000-4000-8000-000000000904',
    'sync-recovery-device-d',
    'mobile',
    'Sync recovery device D',
    'active'
  );

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_status, credential_version, must_change_credential
)
values (
  '31000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'SYNC901',
  'Sync recovery POS staff',
  'manager',
  'active',
  'pin',
  'test-only-non-secret-hash',
  now(),
  'active',
  1,
  false
);

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
)
select
  '10000000-0000-4000-8000-000000000901',
  'manager',
  permission_key,
  true
from (
  values
    ('catalog.read'),
    ('catalog.write'),
    ('catalog.import'),
    ('catalog.export'),
    ('staff.read'),
    ('staff.write'),
    ('audit.read'),
    ('sync.read'),
    ('sync.write'),
    ('history.write')
) permissions(permission_key);

insert into public.staff_web_sessions (
  staff_web_session_id, shop_id, staff_id, session_token_hash,
  staff_credential_version, status, issued_at, expires_at
)
values (
  '34000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  '31000000-0000-4000-8000-000000000901',
  'sha256:' || repeat('e', 64),
  1,
  'active',
  now(),
  now() + interval '1 day'
);

insert into public.pos_device_credentials (
  pos_device_credential_id, shop_id, shop_device_id, staff_id,
  token_hash, staff_credential_version, status, expires_at
)
values (
  '32000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  '30000000-0000-4000-8000-000000000901',
  '31000000-0000-4000-8000-000000000901',
  'sha256:' || repeat('c', 64),
  1,
  'active',
  now() + interval '1 day'
);

insert into public.pos_sessions (
  pos_session_id, shop_id, shop_device_id, staff_id,
  pos_device_credential_id, session_token_hash,
  staff_credential_version, status, expires_at
)
values (
  '33000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  '30000000-0000-4000-8000-000000000901',
  '31000000-0000-4000-8000-000000000901',
  '32000000-0000-4000-8000-000000000901',
  'sha256:' || repeat('d', 64),
  1,
  'active',
  now() + interval '1 day'
);

select ok(
  (public.pos_runtime_first_login_lookup_v1(
    'SYNC901A', 'SYNC901', 'sync-recovery-device-a'
  )->'device') ? 'revoked_at',
  'first-login lookup includes revoked_at for an existing device'
);

-- The real first-login boundary must accept the bounded POS metadata emitted
-- by Win7POS and persist it without weakening the mobile-only entrypoints.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.pos_runtime_first_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'task139-pos-first-login-metadata',
    'TASK-139 POS metadata',
    '1.0.0',
    'sha256:' || repeat('1', 64),
    clock_timestamp() + interval '2 days',
    'sha256:' || repeat('2', 64),
    clock_timestamp() + interval '1 day',
    jsonb_build_object('app_version_present', true, 'source', 'TASK-021')
  )->>'code',
  'success',
  'POS first-login accepts its exact bounded metadata form'
);
set local role postgres;
select is(
  (
    select device.metadata_redacted
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-pos-first-login-metadata'
  ),
  jsonb_build_object('app_version_present', true, 'source', 'TASK-021'),
  'POS first-login persists only the approved metadata form'
);

select throws_ok(
  $$ update public.shop_devices
     set metadata_redacted = jsonb_build_object('source', 'TASK-021')
     where shop_id = '10000000-0000-4000-8000-000000000901'
       and device_identifier = 'task139-pos-first-login-metadata' $$,
  '22023',
  'shop device metadata is not persistable',
  'metadata-changing writes cannot introduce a source-only legacy shape'
);

-- Simulate a row created before this migration, then exercise both the real
-- POS re-login and heartbeat paths. Neither rewrites metadata, so historical
-- rows remain usable while any explicit metadata rewrite stays fail-closed.
alter table public.shop_devices
  disable trigger shop_devices_metadata_redacted_persisted_v1_trigger;
insert into public.shop_devices (
  shop_device_id,
  shop_id,
  device_identifier,
  device_type,
  display_name,
  status,
  metadata_redacted
)
values (
  '30000000-0000-4000-8000-000000000905',
  '10000000-0000-4000-8000-000000000901',
  'task139-legacy-source-device',
  'pos',
  'TASK-139 legacy source device',
  'active',
  jsonb_build_object('source', 'TASK-021')
);
alter table public.shop_devices
  enable trigger shop_devices_metadata_redacted_persisted_v1_trigger;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.pos_runtime_first_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'task139-legacy-source-device',
    'TASK-139 legacy source device',
    '1.0.1',
    'sha256:' || repeat('3', 64),
    clock_timestamp() + interval '2 days',
    'sha256:' || repeat('4', 64),
    clock_timestamp() + interval '1 day',
    jsonb_build_object('app_version_present', true, 'source', 'TASK-021')
  )->>'code',
  'success',
  'POS re-login does not strand a pre-migration source-only device'
);
set local role postgres;
select set_config(
  'task139.legacy_pos_session_id',
  (
    select session_row.pos_session_id::text
    from public.pos_sessions session_row
    where session_row.shop_device_id =
        '30000000-0000-4000-8000-000000000905'
      and session_row.session_token_hash = 'sha256:' || repeat('4', 64)
      and session_row.status = 'active'
  ),
  true
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.pos_runtime_heartbeat_touch_v1(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000905',
    '31000000-0000-4000-8000-000000000901',
    current_setting('task139.legacy_pos_session_id')::uuid,
    clock_timestamp() + interval '30 minutes',
    '1.0.1'
  )->>'ok',
  'true',
  'POS heartbeat remains available for a pre-migration source-only device'
);
set local role postgres;
select is(
  (
    select device.metadata_redacted
    from public.shop_devices device
    where device.shop_device_id = '30000000-0000-4000-8000-000000000905'
  ),
  jsonb_build_object('source', 'TASK-021'),
  'POS re-login and heartbeat leave legacy metadata unchanged'
);

-- POS data is assembled outside the page/revision RPC, so its success audit
-- and response release require one final lease-bound publication transaction.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.pos_runtime_lease_publish_success_v1(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '33000000-0000-4000-8000-000000000901',
    'catalog_pull'
  )->>'status',
  'ok',
  'final POS catalog publication reacquires the runtime lease'
);
set local role postgres;
select ok(
  exists (
    select 1 from public.audit_logs audit
    where audit.event_key = 'pos.catalog.pull.success'
      and audit.actor_staff_id = '31000000-0000-4000-8000-000000000901'
      and audit.target_id = '30000000-0000-4000-8000-000000000901'
  ),
  'final POS catalog publication writes its success audit in the same boundary'
);
update public.pos_sessions
set revoked_at = now()
where pos_session_id = '33000000-0000-4000-8000-000000000901';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.pos_runtime_lease_publish_success_v1(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '33000000-0000-4000-8000-000000000901',
    'heartbeat'
  )->>'status',
  'denied',
  'revoked POS session cannot publish a heartbeat response'
);
set local role postgres;
select is(
  (
    select count(*)::integer from public.audit_logs audit
    where audit.event_key = 'pos.session.heartbeat.success'
      and audit.target_id = '33000000-0000-4000-8000-000000000901'
  ),
  0,
  'denied final publication writes no heartbeat success audit'
);
update public.pos_sessions
set revoked_at = null
where pos_session_id = '33000000-0000-4000-8000-000000000901';

-- This test transaction began before the temporary expiry.  A lease helper
-- using transaction-start `now()` would still accept it after the sleep;
-- the final publication boundary must instead reject it using wall-clock time.
update public.pos_sessions
set expires_at = clock_timestamp() + interval '25 milliseconds'
where pos_session_id = '33000000-0000-4000-8000-000000000901';
select pg_sleep(0.05);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.pos_runtime_lease_publish_success_v1(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '33000000-0000-4000-8000-000000000901',
    'catalog_pull'
  )->>'status',
  'denied',
  'final POS publication rejects a lease expired after transaction start'
);
set local role postgres;
update public.pos_sessions
set expires_at = clock_timestamp() + interval '1 day'
where pos_session_id = '33000000-0000-4000-8000-000000000901';

insert into public.shop_inventory_sources (
  shop_inventory_source_id,
  shop_id,
  owner_user_id,
  mapping_state,
  verified_at
)
values
  (
    '40000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901',
    'mapped',
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000903',
    '10000000-0000-4000-8000-000000000903',
    '00000000-0000-4000-8000-000000000905',
    'mapped',
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000904',
    '10000000-0000-4000-8000-000000000904',
    null,
    'not_configured',
    null
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_device_register_current_owner(
    'task139-current-owner-mobile-device',
    'mobile',
    'Current owner mobile enrolment',
    'TASK-139',
    jsonb_build_object(
      'platform', 'android',
      'model', 'TASK-139 emulator',
      'os_version', '16',
      'app_version_present', true,
      'simulator', true,
      'reason', 'task139_pgtap'
    )
  )->>'code',
  'success',
  'mapped current owner retains the narrow mobile self-enrolment path'
);
select ok(
  exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-current-owner-mobile-device'
      and device.device_type = 'mobile'
  ),
  'current-owner helper writes only the mapped shop mobile device'
);
set local role postgres;

insert into public.inventory_suppliers (
  id, owner_user_id, shop_id, name, deleted_at, updated_at
)
values
  (
    '21000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'Shop A supplier',
    null,
    '2026-07-21 12:34:56.123456+00'
  ),
  (
    '21000000-0000-4000-8000-000000000911',
    '00000000-0000-4000-8000-000000000901',
    null,
    'Mapped legacy supplier',
    null,
    '2026-07-21 12:34:56.123456+00'
  ),
  (
    '21000000-0000-4000-8000-000000000912',
    '00000000-0000-4000-8000-000000000901',
    null,
    'Mapped legacy tombstone',
    now(),
    '2026-07-21 12:34:56.123456+00'
  ),
  (
    '21000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000902',
    '10000000-0000-4000-8000-000000000902',
    'Shop B supplier',
    null,
    '2026-07-21 12:34:56.123456+00'
  ),
  (
    '21000000-0000-4000-8000-000000000913',
    '00000000-0000-4000-8000-000000000905',
    null,
    'Legacy-only shop C supplier',
    null,
    '2026-07-21 12:34:56.123456+00'
  );

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name
)
values
  (
    '22000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'Shop A category'
  ),
  (
    '22000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000902',
    '10000000-0000-4000-8000-000000000902',
    'Shop B category'
  );

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name,
  supplier_id,
  category_id
)
values
  (
    '23000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'SYNC-A-001',
    'Shop A product',
    '21000000-0000-4000-8000-000000000901',
    '22000000-0000-4000-8000-000000000901'
  ),
  (
    '23000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000902',
    '10000000-0000-4000-8000-000000000902',
    'SYNC-B-001',
    'Shop B product',
    '21000000-0000-4000-8000-000000000902',
    '22000000-0000-4000-8000-000000000902'
  );

insert into public.inventory_product_prices (
  id,
  owner_user_id,
  shop_id,
  product_id,
  type,
  price,
  effective_at,
  created_at
)
values
  (
    '24000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    '23000000-0000-4000-8000-000000000901',
    'RETAIL',
    901,
    '2026-07-21 10:00:00',
    '2026-07-21 10:00:00'
  ),
  (
    '24000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000902',
    '10000000-0000-4000-8000-000000000902',
    '23000000-0000-4000-8000-000000000902',
    'RETAIL',
    902,
    '2026-07-21 10:00:00',
    '2026-07-21 10:00:00'
  );

insert into public.shared_sheet_sessions (
  remote_id,
  payload_version,
  "timestamp",
  supplier,
  category,
  is_manual_entry,
  data,
  owner_user_id,
  shop_id,
  display_name
)
values
  (
    '25000000-0000-4000-8000-000000000901',
    2,
    '2026-07-21 10:00:00',
    'Supplier A',
    'Category A',
    false,
    '[]'::jsonb,
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'History A'
  ),
  (
    '25000000-0000-4000-8000-000000000902',
    2,
    '2026-07-21 10:00:00',
    'Supplier B',
    'Category B',
    false,
    '[]'::jsonb,
    '00000000-0000-4000-8000-000000000902',
    '10000000-0000-4000-8000-000000000902',
    'History B'
  ),
  (
    '25000000-0000-4000-8000-000000000911',
    2,
    '2026-07-21 10:00:00',
    'Mapped legacy supplier',
    'Mapped legacy category',
    false,
    '[]'::jsonb,
    '00000000-0000-4000-8000-000000000901',
    null,
    'Mapped legacy history A'
  );

insert into public.inventory_product_image_versions (
  id,
  shop_id,
  product_id,
  status,
  main_path,
  thumb_path,
  expected_main_sha256,
  expected_main_bytes,
  expected_main_width,
  expected_main_height,
  expected_thumb_sha256,
  expected_thumb_bytes,
  expected_thumb_width,
  expected_thumb_height,
  verified_main_sha256,
  verified_main_bytes,
  verified_main_width,
  verified_main_height,
  verified_main_mime_type,
  verified_thumb_sha256,
  verified_thumb_bytes,
  verified_thumb_width,
  verified_thumb_height,
  verified_thumb_mime_type,
  requested_by_profile_id,
  finalized_by_profile_id,
  actor_kind,
  finalized_at
)
values (
  '26000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  '23000000-0000-4000-8000-000000000901',
  'ready',
  'shops/10000000-0000-4000-8000-000000000901/products/23000000-0000-4000-8000-000000000901/primary/26000000-0000-4000-8000-000000000901/main.jpg',
  'shops/10000000-0000-4000-8000-000000000901/products/23000000-0000-4000-8000-000000000901/primary/26000000-0000-4000-8000-000000000901/thumb.jpg',
  repeat('a', 64),
  1000,
  100,
  100,
  repeat('b', 64),
  500,
  50,
  50,
  repeat('a', 64),
  1000,
  100,
  100,
  'image/jpeg',
  repeat('b', 64),
  500,
  50,
  50,
  'image/jpeg',
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000901',
  'personal_account',
  '2026-07-21 10:02:03.123456+00'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  public.staff_web_audit_event_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'catalog.import',
    'shop.catalog.import.preview',
    'info',
    'success',
    'shop',
    '10000000-0000-4000-8000-000000000901',
    'success',
    jsonb_build_object('source', 'TASK-139-pgtap')
  )->>'code',
  'success',
  'staff audit publication validates the exact active staff lease'
);
set local role postgres;
select ok(
  exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000000901'
      and audit.actor_staff_id = '31000000-0000-4000-8000-000000000901'
      and audit.event_key = 'shop.catalog.import.preview'
      and audit.target_id = '10000000-0000-4000-8000-000000000901'
  ),
  'lease-bound staff audit writes one scoped audit row'
);
set local role service_role;
select is(
  public.staff_web_audit_event_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    2,
    'catalog.import',
    'shop.catalog.import.stale',
    'warning',
    'blocked',
    'shop',
    '10000000-0000-4000-8000-000000000901',
    'session_expired',
    jsonb_build_object('source', 'TASK-139-pgtap')
  )->>'code',
  'session_expired',
  'stale staff audit lease is denied before an audit row is written'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.audit_logs audit
    where audit.event_key = 'shop.catalog.import.stale'
  ),
  0,
  'denied staff audit lease leaves no stale audit row'
);

set local role service_role;
select is(
  public.staff_web_lifecycle_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    'device_register',
    jsonb_build_object(
      'deviceIdentifier', 'task139-staff-lifecycle-device',
      'deviceType', 'pos',
      'displayName', 'TASK-139 staff lifecycle device'
    ),
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1
  )->>'code',
  'session_expired',
  'missing owner-only devices.write invalidates the exact staff lease before device DML'
);
set local role postgres;
select ok(
  not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-staff-lifecycle-device'
  ),
  'denied staff lifecycle device registration creates no row'
);
set local role service_role;
select is(
  public.staff_web_lifecycle_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    'device_register',
    jsonb_build_object(
      'deviceIdentifier', 'task139-staff-lifecycle-denied',
      'deviceType', 'pos',
      'displayName', 'Denied device'
    ),
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    2
  )->>'code',
  'session_expired',
  'stale staff credential version is denied before lifecycle DML'
);
set local role postgres;
select ok(
  not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-staff-lifecycle-denied'
  ),
  'denied lifecycle call creates no device row'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.staff_web_lifecycle_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    'device_register',
    jsonb_build_object(
      'deviceIdentifier', 'task139-personal-lifecycle-device',
      'deviceType', 'web',
      'displayName', 'TASK-139 personal lifecycle device'
    ),
    null, null, null, null
  )->>'code',
  'success',
  'active shop owner can use the personal lifecycle lease'
);
select is(
  public.staff_web_lifecycle_mutate_v1(
    '10000000-0000-4000-8000-000000000902',
    'device_register',
    jsonb_build_object(
      'deviceIdentifier', 'task139-cross-shop-lifecycle-device',
      'deviceType', 'web',
      'displayName', 'Cross shop denied device'
    ),
    null, null, null, null
  )->>'code',
  'permission_denied',
  'personal lifecycle lease rejects a cross-shop device mutation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000904","role":"authenticated"}',
  true
);
select is(
  public.staff_web_lifecycle_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    'device_register',
    jsonb_build_object(
      'deviceIdentifier', 'task139-manager-lifecycle-device',
      'deviceType', 'web',
      'displayName', 'Manager lifecycle denial'
    ),
    null, null, null, null
  )->>'code',
  'permission_denied',
  'shop manager cannot use the owner-only Admin lifecycle device boundary'
);
select is(
  public.shop_device_register(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-direct-device',
    'pos',
    'Manager direct denial',
    null,
    '{}'::jsonb
  )->>'code',
  'unauthorized',
  'shop manager cannot bypass the owner boundary through legacy device register'
);
select is(
  public.shop_device_rename(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000901',
    'Manager direct rename denial'
  )->>'code',
  'unauthorized',
  'shop manager cannot bypass the owner boundary through legacy device rename'
);
select is(
  public.shop_device_revoke(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000901',
    'Manager direct revoke denial'
  )->>'code',
  'unauthorized',
  'shop manager cannot bypass the owner boundary through legacy device revoke'
);
select is(
  public.shop_device_reactivate(
    '10000000-0000-4000-8000-000000000901',
    '30000000-0000-4000-8000-000000000901',
    'Manager direct reactivate denial'
  )->>'code',
  'unauthorized',
  'shop manager cannot bypass the owner boundary through legacy device reactivate'
);
select ok(
  not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier in (
        'task139-manager-lifecycle-device',
        'task139-manager-direct-device'
      )
  ) and (
    select display_name
    from public.shop_devices device
    where device.shop_device_id = '30000000-0000-4000-8000-000000000901'
  ) = 'Sync recovery device A' and (
    select status
    from public.shop_devices device
    where device.shop_device_id = '30000000-0000-4000-8000-000000000901'
  ) = 'active',
  'denied manager device calls leave device rows unchanged'
);
select is(
  public.shop_device_register_for_shop(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-mobile-device',
    'mobile',
    'Manager mobile enrolment',
    'TASK-139',
    jsonb_build_object(
      'platform', 'android',
      'model', 'TASK-139 emulator',
      'os_version', '16',
      'app_version_present', true,
      'simulator', true,
      'reason', 'task139_pgtap'
    )
  )->>'code',
  'success',
  'active shop manager can retain the narrow selected-shop mobile enrolment path'
);
select is(
  public.shop_device_register_for_shop(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-pos-device',
    'pos',
    'Manager POS enrolment denial',
    'TASK-139',
    '{}'::jsonb
  )->>'code',
  'validation_failed',
  'selected-shop mobile enrolment rejects POS registrations'
);
select is(
  public.shop_device_register_for_shop(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-oversized-metadata-device',
    'mobile',
    'Manager oversized metadata denial',
    'TASK-139',
    jsonb_build_object('metadata', repeat('x', 8192))
  )->>'code',
  'validation_failed',
  'selected-shop mobile enrolment rejects oversized metadata before device DML'
);
select is(
  (
    with recursive nested(depth, value) as (
      select 0, '0'::jsonb
      union all
      select depth + 1, jsonb_build_array(value)
      from nested
      where depth < 400
    )
    select public.shop_device_register_for_shop(
      '10000000-0000-4000-8000-000000000901',
      'task139-manager-deep-metadata-device',
      'mobile',
      'Manager deep metadata denial',
      'TASK-139',
      jsonb_build_object('safe', value)
    )->>'code'
    from nested
    where depth = 400
  ),
  'validation_failed',
  'selected-shop mobile enrolment rejects deep metadata without recursive traversal'
);
select is(
  public.shop_device_register_for_shop(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-signed-url-metadata-device',
    'mobile',
    'Manager signed URL metadata denial',
    'TASK-139',
    jsonb_build_object('reason', 'https://example.invalid/storage/v1/object/sign')
  )->>'code',
  'validation_failed',
  'selected-shop mobile enrolment rejects signed URL-shaped diagnostic metadata'
);
select ok(
  exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-manager-mobile-device'
      and device.device_type = 'mobile'
  ) and not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-manager-pos-device'
  ) and not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-manager-oversized-metadata-device'
  ) and not exists (
    select 1
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier in (
        'task139-manager-deep-metadata-device',
        'task139-manager-signed-url-metadata-device'
      )
  ),
  'mobile helper persists only the permitted bounded and flat manager mobile device'
);

set local role postgres;
insert into public.shop_devices (
  shop_device_id,
  shop_id,
  device_identifier,
  device_type,
  display_name,
  status,
  metadata_redacted
)
values
  (
    '30000000-0000-4000-8000-000000000996',
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-pos-identifier-collision',
    'pos',
    'Original POS collision device',
    'active',
    '{}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000997',
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-web-identifier-collision',
    'web',
    'Original web collision device',
    'pending',
    '{}'::jsonb
  );
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000904","role":"authenticated"}',
  true
);
select is(
  public.shop_device_register_for_shop(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-pos-identifier-collision',
    'mobile',
    'Attempted mobile rewrite of POS',
    'TASK-139',
    jsonb_build_object('platform', 'android', 'model', 'TASK-139 emulator')
  )->>'code',
  'device_identifier_conflict',
  'mobile enrolment refuses an existing POS identifier'
);
select is(
  public.shop_device_register_for_shop(
    '10000000-0000-4000-8000-000000000901',
    'task139-manager-web-identifier-collision',
    'mobile',
    'Attempted mobile rewrite of web',
    'TASK-139',
    jsonb_build_object('platform', 'android', 'model', 'TASK-139 emulator')
  )->>'code',
  'device_identifier_conflict',
  'mobile enrolment refuses an existing web identifier'
);
set local role postgres;
select ok(
  (
    select device_type = 'pos'
      and display_name = 'Original POS collision device'
      and status = 'active'
      and metadata_redacted = '{}'::jsonb
    from public.shop_devices
    where shop_device_id = '30000000-0000-4000-8000-000000000996'
  )
  and (
    select device_type = 'web'
      and display_name = 'Original web collision device'
      and status = 'pending'
      and metadata_redacted = '{}'::jsonb
    from public.shop_devices
    where shop_device_id = '30000000-0000-4000-8000-000000000997'
  )
  and not exists (
    select 1
    from public.audit_logs audit
    where audit.event_key = 'shop.device.register.success'
      and audit.target_id in (
        '30000000-0000-4000-8000-000000000996',
        '30000000-0000-4000-8000-000000000997'
      )
  ),
  'identifier conflicts leave POS/web device state and audit unchanged'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_device_register(
    '10000000-0000-4000-8000-000000000901',
    'task139-owner-legacy-device',
    'web',
    'Owner legacy device',
    'TASK-139',
    '{}'::jsonb
  )->>'code',
  'success',
  'shop owner retains legacy Admin device registration'
);
select is(
  public.shop_device_rename(
    '10000000-0000-4000-8000-000000000901',
    (
      select device.shop_device_id
      from public.shop_devices device
      where device.shop_id = '10000000-0000-4000-8000-000000000901'
        and device.device_identifier = 'task139-owner-legacy-device'
    ),
    'Owner legacy device renamed'
  )->>'code',
  'success',
  'shop owner retains legacy Admin device rename'
);
select is(
  public.shop_device_revoke(
    '10000000-0000-4000-8000-000000000901',
    (
      select device.shop_device_id
      from public.shop_devices device
      where device.shop_id = '10000000-0000-4000-8000-000000000901'
        and device.device_identifier = 'task139-owner-legacy-device'
    ),
    'Owner legacy revoke'
  )->>'code',
  'success',
  'shop owner retains legacy Admin device revoke'
);
select is(
  public.shop_device_reactivate(
    '10000000-0000-4000-8000-000000000901',
    (
      select device.shop_device_id
      from public.shop_devices device
      where device.shop_id = '10000000-0000-4000-8000-000000000901'
        and device.device_identifier = 'task139-owner-legacy-device'
    ),
    'Owner legacy reactivate'
  )->>'code',
  'success',
  'shop owner retains legacy Admin device reactivate'
);
select is(
  (
    select device.status
    from public.shop_devices device
    where device.shop_id = '10000000-0000-4000-8000-000000000901'
      and device.device_identifier = 'task139-owner-legacy-device'
  ),
  'active',
  'owner legacy device is active after the revoke/reactivate cycle'
);
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.inventory_products
set primary_image_version_id = '26000000-0000-4000-8000-000000000901',
    primary_image_updated_at = '2026-07-21 10:01:00+00'
where id = '23000000-0000-4000-8000-000000000901';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'product_archive',
    '{"id":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )->>'code',
  'success',
  'staff archive applies through the lease-bound catalog transaction'
);
set local role postgres;
select ok(
  (select deleted_at is not null from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000901'),
  'staff archive publishes a real product tombstone'
);
set local role service_role;
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'product_restore',
    '{"id":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )->>'code',
  'success',
  'staff restore applies instead of reporting success for a trigger no-op'
);
set local role postgres;
select ok(
  (select deleted_at is null from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000901'),
  'staff restore leaves the product physically active'
);
select ok(
  exists (
    select 1 from public.sync_events event
    where event.shop_id = '10000000-0000-4000-8000-000000000901'
      and event.domain = 'catalog'
      and event.event_type = 'catalog_changed'
      and event.entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb
      and app_private.sync_event_is_incrementally_safe_v1(
        event.owner_user_id, event.shop_id, event.domain, event.event_type,
        event.source, event.source_device_id, event.client_event_id,
        event.changed_count, event.entity_ids, event.created_at,
        event.expires_at, event.metadata
      )
  ),
  'staff restore atomically emits a complete catalog event'
);
select ok(
  coalesce(current_setting('app.catalog_restore_allowed', true), '') <> 'true',
  'staff restore does not leak the tombstone override beyond its update'
);
set local role service_role;
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64), 1, 'product_restore',
    '{"id":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )->>'code',
  'invalid_state_or_not_found',
  'staff restore cannot report success for an already-active product'
);
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64), 1, 'product_restore',
    '{"id":"23000000-0000-4000-8000-000000000999"}'::jsonb
  )->>'code',
  'invalid_state_or_not_found',
  'staff restore cannot report success for a missing product'
);
set local role postgres;
update public.staff_web_sessions
set expires_at = now() - interval '1 second'
where staff_web_session_id = '34000000-0000-4000-8000-000000000901';
set local role service_role;
select is(
  public.staff_web_session_resolve_v1(
    'sha256:' || repeat('e', 64)
  )->>'status',
  'expired',
  'an expired staff web session resolves to an explicit redacted expired state'
);
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64), 1, 'product_archive',
    '{"id":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )->>'code',
  'session_expired',
  'expired staff lease blocks archive in the mutation transaction'
);
set local role postgres;
select ok(
  (select deleted_at is null from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000901'),
  'expired staff lease leaves the product active'
);
update public.staff_web_sessions
set expires_at = now() + interval '1 day'
where staff_web_session_id = '34000000-0000-4000-8000-000000000901';

create temporary table sync_recovery_test_state (
  key text primary key,
  value jsonb not null
);
create function pg_temp.sync_recovery_scope_key(
  p_shop_id uuid,
  p_device_identifier text
)
returns text
language sql
volatile
as $$
  select public.shop_sync_recovery_checkpoint_v1(
    p_shop_id,
    p_device_identifier,
    '0'
  )#>>'{scope,key}';
$$;
create function pg_temp.sync_recovery_event_max_id(
  p_shop_id uuid,
  p_device_identifier text
)
returns text
language sql
volatile
as $$
  select public.shop_sync_recovery_checkpoint_v1(
    p_shop_id,
    p_device_identifier,
    '0'
  )#>>'{syncEvents,maxId}';
$$;
create function pg_temp.sync_recovery_domain_event_max_id(
  p_shop_id uuid,
  p_device_identifier text,
  p_recovery_domain text
)
returns text
language sql
volatile
as $$
  select public.shop_sync_recovery_checkpoint_v1(
    p_shop_id,
    p_device_identifier,
    '0'
  )#>>array[
    'syncEvents',
    'domainMaxIds',
    case
      when p_recovery_domain in ('suppliers','categories','products','images')
        then 'catalog'
      else p_recovery_domain
    end
  ];
$$;
grant select, insert, update on sync_recovery_test_state
  to authenticated, service_role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  $$ insert into public.inventory_suppliers(
       id,owner_user_id,shop_id,name
     ) values (
       '21000000-0000-4000-8000-000000000979',
       '00000000-0000-4000-8000-000000000901',
       '10000000-0000-4000-8000-000000000901',repeat('s',17000)
     ) $$,
  '23514', 'catalog_text_policy_v1 rejected over-limit display text',
  'catalog text policy rejects oversized direct supplier DML'
);
select throws_ok(
  $$ insert into public.inventory_categories(
       id,owner_user_id,shop_id,name
     ) values (
       '22000000-0000-4000-8000-000000000979',
       '00000000-0000-4000-8000-000000000901',
       '10000000-0000-4000-8000-000000000901',repeat('c',17000)
     ) $$,
  '23514', 'catalog_text_policy_v1 rejected over-limit display text',
  'catalog text policy rejects oversized direct category DML'
);
select throws_ok(
  $$ insert into public.inventory_products(
       id,owner_user_id,shop_id,barcode,product_name
     ) values (
       '23000000-0000-4000-8000-000000000979',
       '00000000-0000-4000-8000-000000000901',
       '10000000-0000-4000-8000-000000000901','SYNC-OVERSIZE-979',
       repeat('p',66000)
     ) $$,
  '23514', 'catalog_text_policy_v1 rejected over-limit display text',
  'catalog text policy rejects oversized direct product DML'
);
select throws_ok(
  $$ update public.inventory_suppliers
     set name=repeat('u',17000)
     where id='21000000-0000-4000-8000-000000000901' $$,
  '23514', 'catalog_text_policy_v1 rejected over-limit display text',
  'catalog text policy rejects oversized direct supplier updates'
);
select is(
  (select name from public.inventory_suppliers
    where id='21000000-0000-4000-8000-000000000901'),
  'Shop A supplier',
  'rejected oversized update preserves the canonical supplier row'
);
select lives_ok(
  $$ update public.inventory_products
     set deleted_at='infinity'::timestamptz
     where id='23000000-0000-4000-8000-000000000901' $$,
  'legacy non-finite catalog writes remain readable during expand'
);

set local role postgres;
delete from public.inventory_suppliers
where id='21000000-0000-4000-8000-000000000979';
delete from public.inventory_categories
where id='22000000-0000-4000-8000-000000000979';
delete from public.inventory_products
where id='23000000-0000-4000-8000-000000000979';
alter table public.inventory_suppliers
  disable trigger trg_inventory_suppliers_set_updated_at;
update public.inventory_suppliers
set name='Shop A supplier',
    updated_at='2026-07-21 12:34:56.123456+00'::timestamptz
where id='21000000-0000-4000-8000-000000000901';
alter table public.inventory_suppliers
  enable trigger trg_inventory_suppliers_set_updated_at;
alter table public.inventory_products
  drop constraint if exists inventory_products_sync_finite_timestamps_v1;
update public.inventory_products
set deleted_at='-infinity'::timestamptz
where id='23000000-0000-4000-8000-000000000901';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )->>'status',
  'integrity_blocked',
  'a historical non-finite catalog timestamp blocks checkpoint completion'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{integrity,catalogTimestampViolationCount}',
  '1',
  'checkpoint diagnoses the exact non-finite catalog timestamp count'
);
set local role postgres;
select ok(
  exists (
    select 1
    from public.sync_events event
    where event.entity_ids->'product_ids'
      @> '["23000000-0000-4000-8000-000000000901"]'::jsonb
      and pg_catalog.isfinite(event.created_at)
      and app_private.sync_event_is_incrementally_safe_v1(
        event.owner_user_id, event.shop_id, event.domain, event.event_type,
        event.source, event.source_device_id, event.client_event_id,
        event.changed_count, event.entity_ids, event.created_at,
        event.expires_at, event.metadata
      ) is not true
  ),
  'a finite event targeting a non-finite entity row is not incrementally safe'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  format(
    'select public.shop_sync_rows_by_ids_v1(%L,%L,%L,%L::text[],%L,%L)',
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'products',
    array['23000000-0000-4000-8000-000000000901'],
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    )
  ),
  '55000', 'shop_sync_recovery_row_invalid',
  'targeted recovery forces recovery instead of reporting a non-finite row missing'
);
set local role postgres;
select set_config('app.catalog_restore_allowed', 'true', true);
update public.inventory_products
set deleted_at=null
where id='23000000-0000-4000-8000-000000000901';
select set_config('app.catalog_restore_allowed', '', true);

alter table public.shop_inventory_sources
  drop constraint if exists shop_inventory_sources_sync_finite_timestamps_v1;
update public.shop_inventory_sources
set verified_at='infinity'::timestamptz
where shop_inventory_source_id='40000000-0000-4000-8000-000000000901';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  ) $$,
  '55000', 'shop_sync_recovery_scope_unresolved',
  'non-finite mapping verification time disables destructive recovery'
);
set local role postgres;
update public.shop_inventory_sources
set verified_at=now()
where shop_inventory_source_id='40000000-0000-4000-8000-000000000901';

create temporary table sync_recovery_nonfinite_event as
select id, created_at
from public.sync_events
where shop_id='10000000-0000-4000-8000-000000000901'
order by id
limit 1;
alter table public.sync_events
  drop constraint if exists sync_events_sync_finite_timestamps_v1;
update public.sync_events
set created_at='-infinity'::timestamptz
where id=(select id from sync_recovery_nonfinite_event);
select ok(
  (
    select app_private.sync_event_is_incrementally_safe_v1(
      event.owner_user_id, event.shop_id, event.domain, event.event_type,
      event.source, event.source_device_id, event.client_event_id,
      event.changed_count, event.entity_ids, event.created_at,
      event.expires_at, event.metadata
    ) is not true
    from public.sync_events event
    where event.id=(select id from sync_recovery_nonfinite_event)
  ),
  'a historical event with a non-finite timestamp forces full recovery'
);
select is(
  (
    select app_private.sync_event_safe_row_v1(
      event.id, event.owner_user_id, event.store_id, event.domain,
      event.event_type, event.source, event.source_device_id, event.batch_id,
      event.client_event_id, event.changed_count, event.entity_ids,
      event.created_at, event.expires_at, event.metadata, event.shop_id,
      '10000000-0000-4000-8000-000000000901'
    ) - 'metadata' - 'entity_ids'
    from public.sync_events event
    where event.id=(select id from sync_recovery_nonfinite_event)
  ) @> '{
    "requires_full_recovery":true,
    "timestamp_valid":false,
    "created_at":"1970-01-01T00:00:00.000000Z"
  }'::jsonb,
  true,
  'legacy non-finite event timestamps remain decodeable and force recovery'
);
select ok(
  (
    select app_private.sync_event_safe_row_v1(
      event.id, event.owner_user_id, event.store_id, event.domain,
      event.event_type, event.source, event.source_device_id, event.batch_id,
      event.client_event_id, event.changed_count, event.entity_ids,
      event.created_at, event.expires_at, event.metadata, event.shop_id,
      '10000000-0000-4000-8000-000000000901'
    )::text !~* 'infinity|!nonfinite'
    from public.sync_events event
    where event.id=(select id from sync_recovery_nonfinite_event)
  ),
  'event envelopes never publish a non-ISO infinity sentinel'
);
update public.sync_events event
set created_at=fixture.created_at
from sync_recovery_nonfinite_event fixture
where event.id=fixture.id;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into sync_recovery_test_state (key, value)
values (
  'pos_mixed_manifest',
  public.pos_catalog_pull_page_for_lease_v3(
    '10000000-0000-4000-8000-000000000901',
    'full_refresh',
    null,
    null,
    null,
    null,
    null,
    1,
    null,
    null,
    null,
    true,
    '30000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '33000000-0000-4000-8000-000000000901'
  )
);
select is(
  (select value->>'status' from sync_recovery_test_state where key = 'pos_mixed_manifest'),
  'ok',
  'POS manifest accepts a verified mixed shop + mapped-legacy union'
);
select is(
  (select value->>'scopeKind' from sync_recovery_test_state where key = 'pos_mixed_manifest'),
  'authorized_shop_plus_legacy',
  'POS publishes the exact mixed scope kind shared by mobile recovery'
);
select ok(
  (select value->>'scopeKey' from sync_recovery_test_state where key = 'pos_mixed_manifest')
    ~ '^[a-f0-9]{32}$',
  'POS mixed scope key is a bounded opaque digest'
);
select is(
  (
    select value#>>'{manifest,catalogSummary}'
    from sync_recovery_test_state
    where key = 'pos_mixed_manifest'
  )::jsonb,
  '{"activeProducts":1,"categories":1,"prices":1,"products":1,"suppliers":2}'::jsonb,
  'POS manifest counts both authorized halves and only prices with active parents'
);

insert into sync_recovery_test_state (key, value)
select
  'pos_mixed_continuation',
  public.pos_catalog_pull_page_for_lease_v3(
    '10000000-0000-4000-8000-000000000901',
    'full_refresh',
    null,
    (value->>'snapshotAt')::timestamptz,
    'categories',
    null,
    null,
    1,
    value->>'revision',
    value->>'scopeKind',
    value->>'scopeKey',
    false,
    '30000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '33000000-0000-4000-8000-000000000901'
  )
from sync_recovery_test_state
where key = 'pos_mixed_manifest';
select is(
  (select value->>'status' from sync_recovery_test_state where key = 'pos_mixed_continuation'),
  'ok',
  'POS mixed continuation accepts the frozen revision and scope lease'
);
select is(
  (select value->>'scopeKind' from sync_recovery_test_state where key = 'pos_mixed_continuation'),
  'authorized_shop_plus_legacy',
  'POS continuation preserves mixed scope semantics'
);

set local role postgres;
update public.shop_inventory_sources
set disabled_at = now()
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000901';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (
    select public.pos_catalog_pull_page_for_lease_v3(
      '10000000-0000-4000-8000-000000000901',
      'full_refresh',
      null,
      (value->>'snapshotAt')::timestamptz,
      'categories',
      null,
      null,
      1,
      value->>'revision',
      value->>'scopeKind',
      value->>'scopeKey',
      false,
      '30000000-0000-4000-8000-000000000901',
      '31000000-0000-4000-8000-000000000901',
      '33000000-0000-4000-8000-000000000901'
    )->>'status'
    from sync_recovery_test_state
    where key = 'pos_mixed_manifest'
  ),
  'snapshot_changed',
  'POS continuation fails closed when the mapped half disappears'
);
set local role postgres;
update public.shop_inventory_sources
set disabled_at = null
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000901';
select is(
  app_private.pos_catalog_integrity_violation_count_v2(
    '10000000-0000-4000-8000-000000000901',
    'authorized_shop_plus_legacy',
    '00000000-0000-4000-8000-000000000901'
  )::integer,
  0,
  'POS mixed fixture passes the shared relational integrity gate'
);

create temporary table sync_recovery_large_event (
  entity_ids jsonb not null
);
create temporary table sync_recovery_large_products (
  id uuid primary key
);

select set_config('app_private.pos_catalog_import_in_progress', 'on', true);
with inserted as (
  insert into public.inventory_products (
    id,
    owner_user_id,
    shop_id,
    barcode,
    product_name
  )
  select
    gen_random_uuid(),
    '00000000-0000-4000-8000-000000000901'::uuid,
    '10000000-0000-4000-8000-000000000901'::uuid,
    'SYNC-LARGE-' || ordinal::text,
    'Sync large product ' || ordinal::text
  from generate_series(1, 1000) generated(ordinal)
  returning id
)
insert into sync_recovery_large_products (id)
select id from inserted;
select set_config('app_private.pos_catalog_import_in_progress', 'off', true);

select set_config('app_private.sync_event_scope_fence', '', true);
select throws_ok(
  $$
    insert into public.sync_events (
      owner_user_id,
      shop_id,
      domain,
      event_type,
      source,
      changed_count,
      entity_ids,
      metadata
    ) values (
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'catalog',
      'catalog_changed',
      'database_atomic',
      1,
      jsonb_build_object(
        'product_ids',
        jsonb_build_array((select min(id::text) from sync_recovery_large_products))
      ),
      '{"status":"success"}'::jsonb
    )
  $$,
  '55000',
  'sync_event_scope_fence_required',
  'trusted direct event inserts fail closed before unsafe ID allocation'
);
select app_private.acquire_sync_event_scope_fence_v1(
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901'
);

insert into sync_recovery_large_event (entity_ids)
select jsonb_build_object(
  'product_ids',
  jsonb_agg(id::text order by id)
)
from sync_recovery_large_products;

insert into public.sync_events (
  owner_user_id,
  shop_id,
  domain,
  event_type,
  source,
  client_event_id,
  changed_count,
  entity_ids,
  metadata
)
select
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog',
  'catalog_changed',
  'pos_catalog_import_sync',
  'sync-recovery-max-pos-product-event',
  1000,
  entity_ids,
  '{"status":"success"}'::jsonb
from sync_recovery_large_event;

select is(
  (
    select count(*)::integer
    from public.sync_events
    where metadata->>'chunked_from_count' = '1000'
  ),
  4,
  'trusted POS exact-maximum product event is split into four stored chunks'
);
select is(
  (
    select sum(changed_count)::integer
    from public.sync_events
    where metadata->>'chunked_from_count' = '1000'
  ),
  1000,
  'POS exact-maximum product chunks preserve every primary ID'
);
select ok(
  (
    select bool_and(
      app_private.sync_event_entity_ids_are_complete(domain, changed_count, entity_ids)
    )
    from public.sync_events
    where metadata->>'chunked_from_count' = '1000'
  ),
  'every exact-maximum POS product chunk satisfies the stored event contract'
);
select is(
  (
    select count(distinct ids.value)::integer
    from public.sync_events event
    cross join lateral jsonb_array_elements_text(event.entity_ids->'product_ids') ids(value)
    where event.metadata->>'chunked_from_count' = '1000'
  ),
  1000,
  'POS exact-maximum product splitting loses or duplicates no primary ID'
);

insert into public.sync_events (
  owner_user_id,
  shop_id,
  domain,
  event_type,
  source,
  client_event_id,
  changed_count,
  entity_ids,
  metadata
)
select
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog',
  'catalog_changed',
  'pos_catalog_import_sync',
  'sync-recovery-max-pos-product-event',
  1000,
  entity_ids,
  '{"status":"success"}'::jsonb
from sync_recovery_large_event;

select is(
  (
    select count(*)::integer
    from public.sync_events
    where metadata->>'chunked_from_count' = '1000'
  ),
  4,
  'POS exact-maximum product replay is idempotent'
);
select throws_ok(
  $$
    insert into public.sync_events (
      owner_user_id,
      shop_id,
      domain,
      event_type,
      source,
      client_event_id,
      changed_count,
      entity_ids,
      metadata
    )
    select
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'catalog',
      'catalog_changed',
      'pos_catalog_import_sync',
      'sync-recovery-max-pos-product-event',
      1000,
      entity_ids,
      '{"status":"success","operation":"update"}'::jsonb
    from sync_recovery_large_event
  $$,
  '23505',
  'sync_event_client_event_id_conflict',
  'POS replay with changed semantics fails instead of silently succeeding'
);

select throws_ok(
  $$
    insert into public.sync_events (
      owner_user_id, shop_id, domain, event_type, source,
      client_event_id, changed_count, entity_ids, metadata
    )
    select
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'catalog', 'catalog_changed', 'pos_catalog_import_sync',
      'sync-recovery-over-max-pos-product-event', 1001,
      jsonb_build_object(
        'product_ids', jsonb_agg(gen_random_uuid()::text order by ordinal)
      ),
      '{"status":"success"}'::jsonb
    from generate_series(1, 1001) generated(ordinal)
  $$,
  '22023',
  'POS product event envelope is invalid',
  'POS product envelope rejects one row above the 1000-row maximum'
);

delete from public.sync_events
where metadata->>'chunked_from_count' = '1000';
delete from public.inventory_products product
where product.id in (select id from sync_recovery_large_products);

select lives_ok(
  $$
    insert into public.sync_events (
      owner_user_id,
      shop_id,
      domain,
      event_type,
      source,
      client_event_id,
      changed_count,
      entity_ids
    ) values (
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'catalog',
      'catalog_changed',
      'admin_web',
      'sync-recovery-invalid-direct',
      1,
      null
    )
  $$,
  'legacy direct event inserts remain backward compatible during expand'
);

alter table public.sync_events
  drop constraint if exists sync_events_entity_ids_complete;
alter table public.sync_events
  drop constraint if exists sync_events_supported_operation;
alter table public.sync_events
  drop constraint if exists sync_events_metadata_redacted;
insert into public.sync_events (
  owner_user_id,
  shop_id,
  domain,
  event_type,
  source,
  source_device_id,
  client_event_id,
  changed_count,
  entity_ids,
  metadata
) values (
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'prices',
  'prices_tombstone',
  'legacy-untrusted-source',
  'legacy-device-redacted-fixture',
  'legacy-client-redacted-fixture',
  1,
  null,
  '{"operation":"Bearer redacted-fixture","accessToken":"redacted-fixture"}'::jsonb
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  ) $$,
  '42501',
  null,
  'anonymous callers cannot reach the checkpoint RPC'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select lives_ok(
  $$
    select public.record_sync_event(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'legacy-client-redacted-fixture',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  'legacy record_sync_event preserves idempotent replay compatibility'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901',
    'personal_account',
    '10000000-0000-4000-8000-000000000901',
    null
  )->>'code',
  'validation_failed',
  'image read rejects a NULL reference batch without touching Storage metadata'
);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901',
    'personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[{"productId":"23000000-0000-4000-8000-000000000901","versionId":1e100000,"variant":"main"}]'::jsonb
  )->>'code',
  'validation_failed',
  'image read rejects a compact huge numeric reference before UUID casts'
);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901',
    'personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[{"productId":"23000000-0000-4000-8000-000000000901","versionId":"26000000-0000-4000-8000-000000000901","variant":"main"}]'::jsonb
  )#>>'{items,0,code}',
  'success',
  'image read resolves the current primary version in the active product scope'
);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901',
    'personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[{"productId":"23000000-0000-4000-8000-000000000901","versionId":"26000000-0000-4000-8000-000000000901","variant":"thumb"}]'::jsonb
  )#>'{items,0}',
  jsonb_build_object(
    'product_id','23000000-0000-4000-8000-000000000901',
    'version_id','26000000-0000-4000-8000-000000000901',
    'variant','thumb','code','success',
    'object_path','shops/10000000-0000-4000-8000-000000000901/products/23000000-0000-4000-8000-000000000901/primary/26000000-0000-4000-8000-000000000901/thumb.jpg',
    'verified_sha256',repeat('b',64),'verified_bytes',500,
    'verified_width',50,'verified_height',50,
    'verified_mime_type','image/jpeg'
  ),
  'image read binds the exact five-field verified metadata tuple'
);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901',
    'personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[
      {"productId":"23000000-0000-4000-8000-000000000901","versionId":"26000000-0000-4000-8000-000000000901","variant":"main"},
      {"productId":"23000000-0000-4000-8000-000000000902","versionId":"26000000-0000-4000-8000-000000000902","variant":"thumb"}
    ]'::jsonb
  )#>'{items}',
  '[
    {"product_id":"23000000-0000-4000-8000-000000000901","version_id":"26000000-0000-4000-8000-000000000901","variant":"main","code":"success","object_path":"shops/10000000-0000-4000-8000-000000000901/products/23000000-0000-4000-8000-000000000901/primary/26000000-0000-4000-8000-000000000901/main.jpg","verified_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","verified_bytes":1000,"verified_width":100,"verified_height":100,"verified_mime_type":"image/jpeg"},
    {"product_id":"23000000-0000-4000-8000-000000000902","version_id":"26000000-0000-4000-8000-000000000902","variant":"thumb","code":"not_found"}
  ]'::jsonb,
  'mixed image batch preserves 1:1 cardinality, order, ready and not-found semantics'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name
)
values (
  '23000000-0000-4000-8000-000000000919',
  '00000000-0000-4000-8000-000000000901',
  null,
  'SYNC-A-LEGACY-IMAGE-019',
  'Mapped legacy image product'
);
insert into public.inventory_product_image_versions (
  id, shop_id, product_id, status, main_path, thumb_path,
  expected_main_sha256, expected_main_bytes,
  expected_main_width, expected_main_height,
  expected_thumb_sha256, expected_thumb_bytes,
  expected_thumb_width, expected_thumb_height,
  verified_main_sha256, verified_main_bytes,
  verified_main_width, verified_main_height, verified_main_mime_type,
  verified_thumb_sha256, verified_thumb_bytes,
  verified_thumb_width, verified_thumb_height, verified_thumb_mime_type,
  requested_by_profile_id, finalized_by_profile_id, actor_kind, finalized_at
)
values (
  '26000000-0000-4000-8000-000000000919',
  '10000000-0000-4000-8000-000000000901',
  '23000000-0000-4000-8000-000000000919',
  'ready',
  'shops/10000000-0000-4000-8000-000000000901/products/23000000-0000-4000-8000-000000000919/primary/26000000-0000-4000-8000-000000000919/main.jpg',
  'shops/10000000-0000-4000-8000-000000000901/products/23000000-0000-4000-8000-000000000919/primary/26000000-0000-4000-8000-000000000919/thumb.jpg',
  repeat('c', 64), 1019, 119, 119,
  repeat('d', 64), 519, 59, 59,
  repeat('c', 64), 1019, 119, 119, 'image/jpeg',
  repeat('d', 64), 519, 59, 59, 'image/jpeg',
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000901',
  'personal_account',
  '2026-07-21 10:02:19.123456+00'
);
update public.inventory_products
set primary_image_version_id = '26000000-0000-4000-8000-000000000919',
    primary_image_updated_at = '2026-07-21 10:01:19+00'
where id = '23000000-0000-4000-8000-000000000919';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901','personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[{"productId":"23000000-0000-4000-8000-000000000919","versionId":"26000000-0000-4000-8000-000000000919","variant":"main"}]'::jsonb
  )#>>'{items,0,code}',
  'success',
  'verified mapped-owner product image remains readable through the authorized bridge'
);
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$ update public.shop_inventory_sources
     set disabled_at = now()
     where shop_inventory_source_id =
       '40000000-0000-4000-8000-000000000901' $$,
  '23503',
  'catalog mapping cannot be removed while cross-scope relations exist',
  'mapping removal is blocked while a legacy product owns a shop image'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901','personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[{"productId":"23000000-0000-4000-8000-000000000919","versionId":"26000000-0000-4000-8000-000000000919","variant":"main"}]'::jsonb
  )#>>'{items,0,code}',
  'success',
  'failed mapping transition leaves the authorized image readable'
);
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.inventory_products
set deleted_at = now()
where id = '23000000-0000-4000-8000-000000000919';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_remove(
    '00000000-0000-4000-8000-000000000901','personal_account',
    '10000000-0000-4000-8000-000000000901',
    '23000000-0000-4000-8000-000000000919',
    '26000000-0000-4000-8000-000000000919'
  )->>'code',
  'removed',
  'owner-safe image RPC removes a tombstoned legacy image before unmapping'
);
set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (select product.primary_image_version_id is null
    from public.inventory_products product
    where product.id='23000000-0000-4000-8000-000000000919')
  and (select version.status='removed' and version.cleanup_status='pending'
    from public.inventory_product_image_versions version
    where version.id='26000000-0000-4000-8000-000000000919'),
  'tombstoned image cleanup publishes the physical reference and cleanup journal'
);
set local role postgres;
update public.shop_inventory_sources
set disabled_at = now()
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000901';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000901','personal_account',
    '10000000-0000-4000-8000-000000000901',
    '[{"productId":"23000000-0000-4000-8000-000000000919","versionId":"26000000-0000-4000-8000-000000000919","variant":"main"}]'::jsonb
  )#>>'{items,0,code}',
  'not_found',
  'bounded image cleanup makes the later mapping transition safe'
);
set local role postgres;
update public.shop_inventory_sources
set disabled_at = null
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000901';
delete from public.inventory_products
where id = '23000000-0000-4000-8000-000000000919';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);

insert into sync_recovery_test_state(key,value)
values (
  'catalog_manifest',
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','snapshot_page',
    '{"entity":"manifest","includeSummary":true}'::jsonb
  )
);
select is(
  (select value->>'code' from sync_recovery_test_state where key='catalog_manifest'),
  'success',
  'catalog read manifest succeeds through the atomic authorization boundary'
);
select ok(
  (select value->>'revision' ~ '^(0|[1-9][0-9]*)$'
      and value#>>'{scope,key}' ~ '^[a-f0-9]{64}$'
      and value#>>'{scope,mapping,ownerUserId}' =
        '00000000-0000-4000-8000-000000000901'
    from sync_recovery_test_state where key='catalog_manifest'),
  'catalog manifest publishes revision, stable scope and mapped-owner identity'
);
insert into sync_recovery_test_state(key,value)
select 'catalog_snapshot_products', public.shop_catalog_admin_read_v1(
  '10000000-0000-4000-8000-000000000901','snapshot_page',
  jsonb_build_object(
    'entity','products','limit',100,'state','all',
    'expectedScopeKey',value#>>'{scope,key}',
    'expectedRevision',value->>'revision'
  )
)
from sync_recovery_test_state where key='catalog_manifest';
select is(
  (select value->>'code' from sync_recovery_test_state where key='catalog_snapshot_products'),
  'success',
  'catalog snapshot page accepts the frozen scope and revision'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','products_page',
    '{"limit":20,"offset":0,"state":"all","includeExactTotal":true,"includeSummary":true}'::jsonb
  )->>'code',
  'success',
  'catalog products-page operation executes'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','entity_page',
    '{"entity":"supplier","limit":20,"offset":0,"state":"all","includeExactTotal":true}'::jsonb
  )->>'code',
  'success',
  'catalog entity-page operation executes'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','options','{}'::jsonb
  )->>'code',
  'success',
  'catalog options operation executes without silent truncation'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','product_detail',
    '{"productId":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )#>>'{rows,0,supplier,id}',
  '21000000-0000-4000-8000-000000000901',
  'catalog product detail includes its scoped supplier relation'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','products_by_codes',
    '{"codes":["sync-a-001"]}'::jsonb
  )#>>'{rows,0,id}',
  '23000000-0000-4000-8000-000000000901',
  'catalog code lookup operation executes in the authorized union'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','products_by_codes',
    '{"codes":{}}'::jsonb
  )->>'code',
  'validation_failed',
  'catalog code lookup rejects a non-array instead of throwing'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','products_by_codes',
    '{"codes":[1e100000]}'::jsonb
  )->>'code',
  'validation_failed',
  'catalog code lookup rejects compact huge numerics before text extraction'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','products_by_codes',
    jsonb_build_object(
      'codes',
      (select jsonb_agg(format('SYNC-CODE-%s', ordinal))
       from generate_series(1, 41) ordinal)
    )
  )->>'code',
  'validation_failed',
  'catalog code lookup rejects more than forty requested identities'
);

set local role postgres;
update public.inventory_products
set product_name = product_name || ' revision-probe'
where id='23000000-0000-4000-8000-000000000901';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  (
    select public.shop_catalog_admin_read_v1(
      '10000000-0000-4000-8000-000000000901','snapshot_page',
      jsonb_build_object(
        'entity','products','limit',100,
        'expectedScopeKey',value#>>'{scope,key}',
        'expectedRevision',value->>'revision'
      )
    )->>'code'
    from sync_recovery_test_state where key='catalog_manifest'
  ),
  'snapshot_changed',
  'catalog continuation fails closed after a revision change'
);

select lives_ok(
  $$
    insert into public.shared_sheet_sessions(
      remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,
      data,owner_user_id,shop_id,display_name,session_overlay
    ) values (
      '25000000-0000-4000-8000-000000000971',2,'2026-07-21 10:00:00',
      'Constraint actor','Constraint actor',true,'[]'::jsonb,
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901','Authenticated constraint row',
      '{"overlay_schema":1,"editable":[],"complete":[]}'::jsonb
    )
  $$,
  'authenticated direct History DML can evaluate the recovery-row CHECK'
);
select lives_ok(
  $$
    update public.shared_sheet_sessions
    set display_name = 'Authenticated constraint row updated'
    where remote_id = '25000000-0000-4000-8000-000000000971'
  $$,
  'authenticated History UPDATE can execute the bounded JSONB trigger chain'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$
    insert into public.shared_sheet_sessions(
      remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,
      data,owner_user_id,shop_id,display_name,session_overlay
    ) values (
      '25000000-0000-4000-8000-000000000972',2,'2026-07-21 10:00:00',
      'Constraint service','Constraint service',true,'[]'::jsonb,
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901','Service constraint row',
      '{"overlay_schema":1,"editable":[],"complete":[]}'::jsonb
    )
  $$,
  'service-role History DML can evaluate the recovery-row CHECK'
);
set local role postgres;
select ok(
  (
    select count(*) >= 2
    from public.sync_events event
    where event.domain = 'history'
      and event.event_type = 'history_changed'
      and event.entity_ids->'session_ids'
        @> '["25000000-0000-4000-8000-000000000971"]'::jsonb
  ),
  'authenticated History insert and update both publish atomic events'
);
delete from public.shared_sheet_sessions
where remote_id in (
  '25000000-0000-4000-8000-000000000971',
  '25000000-0000-4000-8000-000000000972'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-valid-rpc',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  'authenticated RPC accepts a complete supported event'
);
select is(
  jsonb_typeof(
    public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-valid-rpc',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )->'id'
  ),
  'string',
  'V6 manual sync-event RPC returns bigint id as canonical decimal text'
);

-- The manual authenticated-event boundary must fail closed for a disabled
-- profile, including legacy scope and an otherwise valid idempotent replay.
-- The fixture is restored immediately so later checks retain their identity.
set local role postgres;
update public.profiles
  set profile_status = 'disabled', disabled_at = now()
where profile_id = '00000000-0000-4000-8000-000000000901';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.record_sync_event_v6(
    p_domain => 'catalog', p_event_type => 'catalog_changed',
    p_changed_count => 1,
    p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
    p_source => 'android', p_client_event_id => 'disabled-profile-shop-event',
    p_shop_id => '10000000-0000-4000-8000-000000000901'
  ) $$,
  '42501',
  'record_sync_event requires an active profile and, for shop scope, active owner/manager membership',
  'disabled profile cannot publish a shop-scoped sync event'
);
select throws_ok(
  $$ select public.record_sync_event_v6(
    p_domain => 'catalog', p_event_type => 'catalog_changed',
    p_changed_count => 0, p_entity_ids => null,
    p_source => 'android', p_client_event_id => 'disabled-profile-legacy-event'
  ) $$,
  '42501',
  'record_sync_event requires an active profile and, for shop scope, active owner/manager membership',
  'disabled profile cannot publish a legacy sync event'
);
select throws_ok(
  $$ select public.record_sync_event_v6(
    p_domain => 'catalog', p_event_type => 'catalog_changed',
    p_changed_count => 1,
    p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
    p_source => 'android', p_client_event_id => 'sync-recovery-valid-rpc',
    p_shop_id => '10000000-0000-4000-8000-000000000901'
  ) $$,
  '42501',
  'record_sync_event requires an active profile and, for shop scope, active owner/manager membership',
  'disabled profile cannot replay an otherwise valid idempotent event'
);
set local role postgres;
update public.profiles
  set profile_status = 'active', disabled_at = null
where profile_id = '00000000-0000-4000-8000-000000000901';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000902"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-cross-shop-rpc',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'sync_event_entity_ids_out_of_scope',
  'record_sync_event rejects complete IDs from another shop'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'ios',
      p_client_event_id => 'sync-recovery-valid-rpc',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '23505',
  'sync_event_client_event_id_conflict',
  'idempotency replay with a different semantic payload fails closed'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-invalid-rpc',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'sync_event_entity_ids_incomplete',
  'record_sync_event fails explicitly for missing primary IDs'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-oversized-metadata',
      p_metadata => jsonb_build_object('padding', repeat('a', 5000)),
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'metadata contains fields outside the sync-event metadata budget',
  'logical metadata size is bounded even when PostgreSQL could compress it'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-camel-secret-metadata',
      p_metadata => '{"accessToken":"redacted-fixture"}'::jsonb,
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'metadata contains fields outside the sync-event metadata budget',
  'camelCase credential metadata is rejected before persistence'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-secret-enum-value',
      p_metadata => '{"operation":"Bearer redacted-fixture"}'::jsonb,
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'metadata contains fields outside the sync-event metadata budget',
  'secret text inside an otherwise allowed metadata key is rejected'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => repeat('a', 81),
      p_client_event_id => 'sync-recovery-source-too-long',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'sync event source identifier is too large',
  'new event source identifiers are bounded'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => repeat('界', 80),
      p_client_event_id => 'sync-recovery-multibyte-source',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '54000',
  'sync event storage envelope is invalid',
  'multibyte source is bounded by UTF-8 bytes, not character count'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_source_device_id => repeat('界', 160),
      p_client_event_id => 'sync-recovery-multibyte-device',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '54000',
  'sync event storage envelope is invalid',
  'multibyte source device is bounded by UTF-8 bytes'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => repeat('界', 160),
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '54000',
  'sync event storage envelope is invalid',
  'multibyte client event identity is bounded by UTF-8 bytes'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.sync_events event
    where event.client_event_id in (
      'sync-recovery-multibyte-source',
      'sync-recovery-multibyte-device'
    )
      or event.client_event_id = repeat('界', 160)
  ),
  0,
  'rejected multibyte envelopes persist no partial sync event'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-shop-store-conflict',
      p_store_id => '90000000-0000-4000-8000-000000000901',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'shop-scoped sync event cannot include a legacy store id',
  'shop events never fall back to a legacy store identifier'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_tombstone',
      p_changed_count => 1,
      p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-active-as-tombstone',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'sync_event_operation_state_mismatch',
  'an active catalog row cannot be published as a tombstone'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'catalog',
      p_event_type => 'catalog_changed',
      p_changed_count => 1,
      p_entity_ids => '{"supplier_ids":["21000000-0000-4000-8000-000000000912"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-tombstone-as-active'
    )
  $$,
  '22023',
  'sync_event_operation_state_mismatch',
  'a tombstoned catalog row cannot be published as active'
);
select throws_ok(
  $$
    select public.record_sync_event_v6(
      p_domain => 'prices',
      p_event_type => 'prices_tombstone',
      p_changed_count => 1,
      p_entity_ids => '{"price_ids":["24000000-0000-4000-8000-000000000901"]}'::jsonb,
      p_source => 'android',
      p_client_event_id => 'sync-recovery-price-tombstone-unsupported',
      p_shop_id => '10000000-0000-4000-8000-000000000901'
    )
  $$,
  '22023',
  'unsupported sync event domain/type',
  'append-only price history has no tombstone event type'
);
select throws_ok(
  $$ select public.admin_sync_event_read_v1(
    '10000000-0000-4000-8000-000000000901',null,
    array['catalog','prices','history','catalog'],null,100
  ) $$,
  '22023',
  'invalid admin sync-event read request',
  'Admin event read rejects more domains than the finite contract permits'
);
select throws_ok(
  $$ select public.admin_sync_event_read_v1(
    '10000000-0000-4000-8000-000000000901',null,
    array['catalog','catalog'],null,100
  ) $$,
  '22023',
  'invalid admin sync-event read request',
  'Admin event read rejects duplicate domain filters'
);
select throws_ok(
  $$ select public.admin_sync_event_read_v1(
    '10000000-0000-4000-8000-000000000901',null,
    null,repeat('9',20),100
  ) $$,
  '22023',
  'invalid admin sync-event read request',
  'Admin event read bounds the cursor before numeric conversion'
);
select throws_ok(
  $$
    insert into public.sync_events (
      owner_user_id,
      shop_id,
      domain,
      event_type,
      changed_count,
      entity_ids
    ) values (
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'catalog',
      'catalog_changed',
      1,
      '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb
    )
  $$,
  '42501',
  null,
  'authenticated clients still cannot insert sync_events directly'
);
select lives_ok(
  $$ select id, metadata, source_device_id, client_event_id
     from public.sync_events
     limit 1 $$,
  'expand phase preserves authenticated legacy sync-event reads'
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000902',
    'sync-recovery-device-b'
  ) $$,
  '42501',
  'shop sync recovery requires an active owner/manager shop binding',
  'checkpoint cannot cross into another shop'
);
select throws_ok(
  $$ select public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a', 'products', null, 250, null, null
  ) $$,
  '55000',
  'shop_sync_recovery_scope_changed',
  'snapshot page requires an explicit checkpoint scope key'
);
select throws_ok(
  $$ select public.shop_sync_rows_by_ids_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a', 'products',
    array['23000000-0000-4000-8000-000000000901'], null
  ) $$,
  '55000',
  'shop_sync_recovery_scope_changed',
  'targeted row fetch requires an explicit stable scope key'
);
select throws_ok(
  $$ select public.shop_sync_event_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a', '0', 150, null
  ) $$,
  '55000',
  'shop_sync_recovery_scope_changed',
  'event page requires an explicit stable scope key'
);

select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )->>'schemaVersion',
  'shop-sync-recovery-checkpoint-v1',
  'checkpoint publishes its frozen schema version'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{digestContract,rowSetAlgorithm}',
  'sha256-chain-v1',
  'checkpoint declares the interoperable ordered digest algorithm'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{payloadBudgets,maxPageRowsByDomain,history}',
  '3',
  'checkpoint publishes the response-safe History page cap'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )->>'status',
  'ready',
  'integrity-clean recovery remains ready even when a legacy event requires snapshot recovery'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{syncEvents,requiresFullRecovery}',
  'true',
  'legacy blocking event is never collapsed into noWork'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,kind}',
  'authorized_shop_plus_legacy',
  'mixed catalog publishes the explicit authorized union scope'
);
select ok(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,legacyOwnerKey}' ~ '^[a-f0-9]{64}$',
  'union scope exposes only the mapped owner digest'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,historyKind}',
  'authorized_shop_plus_legacy',
  'history uses the same explicit authorized union semantics'
);
select ok(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,accountKey}' ~ '^[a-f0-9]{64}$',
  'account identity is exposed only as a redacted digest'
);
select ok(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,deviceKey}' ~ '^[a-f0-9]{64}$',
  'device identity is exposed only as a redacted digest'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{catalog,suppliers,activeCount}'
  )::integer,
  2,
  'checkpoint includes direct and authorized mapped-legacy suppliers'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{catalog,suppliers,tombstoneCount}'
  )::integer,
  1,
  'checkpoint includes authorized mapped-legacy tombstones'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{catalog,products,activeCount}'
  )::integer,
  1,
  'checkpoint product count is isolated to shop A'
);
select ok(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{catalog,products,identityDigest}' ~ '^[a-f0-9]{64}$',
  'checkpoint includes the canonical product/barcode identity digest'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{prices,activeCount}'
  )::integer,
  1,
  'checkpoint price count is isolated to shop A'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{history,activeCount}'
  )::integer,
  2,
  'checkpoint history includes direct and authorized mapped-legacy rows'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{images,activeCount}'
  )::integer,
  1,
  'checkpoint covers current primary image metadata only'
);
select is(
  (
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )#>>'{integrity,totalViolationCount}'
  )::integer,
  0,
  'checkpoint relational integrity gate is zero'
);

insert into sync_recovery_test_state (key, value)
values
  (
    'checkpoint_a',
    public.shop_sync_recovery_checkpoint_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )
  ),
  (
    'supplier_page_a',
    public.shop_sync_recovery_page_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'suppliers',
      null,
      250,
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  ),
  (
    'product_page_a',
    public.shop_sync_recovery_page_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'products',
      null,
      250,
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  ),
  (
    'price_page_a',
    public.shop_sync_recovery_page_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'prices',
      null,
      250,
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  ),
  (
    'image_page_a',
    public.shop_sync_recovery_page_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'images',
      null,
      250,
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  ),
  (
    'history_page_a',
    public.shop_sync_recovery_page_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'history',
      null,
      250,
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  ),
  (
    'targeted_products_a',
    public.shop_sync_rows_by_ids_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'products',
      array[
        '23000000-0000-4000-8000-000000000901',
        '23000000-0000-4000-8000-000000000902'
      ],
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  ),
  (
    'event_page_a',
    public.shop_sync_event_page_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      '0',
      150,
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )
  );

select is(
  (
    select jsonb_array_length(value->'rows')
    from sync_recovery_test_state
    where key = 'supplier_page_a'
  ),
  3,
  'snapshot page includes the authorized union and excludes cross-shop suppliers'
);
select is(
  (
    select value#>>'{rows,0,id}'
    from sync_recovery_test_state
    where key = 'supplier_page_a'
  ),
  '21000000-0000-4000-8000-000000000901',
  'snapshot union remains deterministically ordered by UUID'
);
select is(
  (
    select value#>>'{rows,0,updated_at}'
    from sync_recovery_test_state
    where key = 'supplier_page_a'
  ),
  '2026-07-21T12:34:56.123456Z',
  'snapshot row timestamp round-trips in canonical UTC6 form'
);
select is(
  (
    select value#>>'{scope,key}'
    from sync_recovery_test_state
    where key = 'supplier_page_a'
  ),
  (
    select value#>>'{scope,key}'
    from sync_recovery_test_state
    where key = 'checkpoint_a'
  ),
  'snapshot and checkpoint resolve the identical scope key'
);
select is(
  (
    select value#>>'{domainScope}'
    from sync_recovery_test_state
    where key = 'supplier_page_a'
  ),
  'authorized_shop_plus_legacy',
  'catalog snapshot declares its explicit domain scope'
);
select is(
  (
    select jsonb_array_length(value->'rows')
    from sync_recovery_test_state
    where key = 'history_page_a'
  ),
  2,
  'history snapshot includes direct and authorized mapped-legacy rows'
);
select is(
  (
    select value#>>'{domainScope}'
    from sync_recovery_test_state
    where key = 'history_page_a'
  ),
  'authorized_shop_plus_legacy',
  'history snapshot declares its explicit domain scope'
);
select is(
  (
    select value#>>'{rows,0,primary_image_updated_at}'
    from sync_recovery_test_state
    where key = 'product_page_a'
  ),
  '2026-07-21T10:01:00.000000Z',
  'product image version timestamp is canonicalized before client digesting'
);
select is(
  (
    select value#>>'{rows,0,price_canonical}'
    from sync_recovery_test_state
    where key = 'price_page_a'
  ),
  '901',
  'price recovery rows publish the exact canonical amount used by versionDigest'
);
set local role postgres;
select is(
  (
    select app_private.sync_price_canonical_amount_v1(
      (value#>>'{rows,0,price}')::double precision
    )
    from sync_recovery_test_state
    where key = 'price_page_a'
  ),
  (
    select value#>>'{rows,0,price_canonical}'
    from sync_recovery_test_state
    where key = 'price_page_a'
  ),
  'price numeric compatibility field agrees with the server canonical decimal'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select ok(
  (
    select value#>>'{rows,0,updated_at}'
      ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
    from sync_recovery_test_state
    where key = 'product_page_a'
  ),
  'product updated_at is serialized with exactly six UTC fractional digits'
);
select is(
  (
    select value#>>'{rows,0,finalized_at}'
    from sync_recovery_test_state
    where key = 'image_page_a'
  ),
  '2026-07-21T10:02:03.123456Z',
  'image finalized_at is canonicalized before client digesting'
);
select ok(
  (
    select not ((value#>'{rows,0}') ?| array[
      'main_path',
      'thumb_path',
      'signed_url',
      'url',
      'token'
    ]) and position('shops/' in value::text) = 0
    from sync_recovery_test_state
    where key = 'image_page_a'
  ),
  'image recovery rows expose verification metadata but no storage path or token'
);
select is(
  (
    select jsonb_array_length(value->'rows')
    from sync_recovery_test_state
    where key = 'targeted_products_a'
  ),
  1,
  'targeted row lookup returns only the requested ID in the resolved scope'
);
select is(
  (
    select value#>>'{missingIds,0}'
    from sync_recovery_test_state
    where key = 'targeted_products_a'
  ),
  '23000000-0000-4000-8000-000000000902',
  'targeted row lookup reports a cross-shop ID as missing'
);
select is(
  (
    select value#>>'{scope,key}'
    from sync_recovery_test_state
    where key = 'targeted_products_a'
  ),
  (
    select value#>>'{scope,key}'
    from sync_recovery_test_state
    where key = 'checkpoint_a'
  ),
  'targeted lookup and checkpoint resolve the identical scope key'
);
select ok(
  not exists (
    select 1
    from sync_recovery_test_state state
    cross join lateral jsonb_array_elements(state.value->'rows') row_data
    where state.key = 'event_page_a'
      and not (
        row_data->>'shop_id' = '10000000-0000-4000-8000-000000000901'
        or (
          row_data->>'shop_id' is null
          and row_data->>'owner_user_id' = '00000000-0000-4000-8000-000000000901'
        )
      )
  ),
  'incremental event page includes only direct or authorized mapped-legacy events'
);
select ok(
  (
    select value#>>'{rows,0,created_at}'
      ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
    from sync_recovery_test_state
    where key = 'event_page_a'
  ),
  'incremental event timestamps are canonical UTC6 values'
);
select is(
  (
    select value#>>'{scope,key}'
    from sync_recovery_test_state
    where key = 'event_page_a'
  ),
  (
    select value#>>'{scope,key}'
    from sync_recovery_test_state
    where key = 'checkpoint_a'
  ),
  'incremental event page and checkpoint resolve the identical scope key'
);
select is(
  public.shop_sync_event_page_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000901',
    p_device_identifier => 'sync-recovery-device-a',
    p_expected_scope_key => pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )
  )->>'pageLimit',
  '150',
  'event page omitted limit uses its valid bounded default'
);
select is(
  (
    select count(*)::integer
    from sync_recovery_test_state state
    cross join lateral jsonb_array_elements(state.value->'rows') row_data
    where state.key = 'event_page_a'
      and row_data->>'event_type' = 'unsupported'
      and row_data->>'source' = 'other'
      and row_data->>'requires_full_recovery' = 'true'
      and row_data->'entity_ids' = 'null'::jsonb
      and row_data->'metadata' = '{}'::jsonb
      and row_data->>'source_device_key' ~ '^[a-f0-9]{64}$'
      and row_data->>'client_event_key' ~ '^[a-f0-9]{64}$'
  ),
  1,
  'historical unsafe events are redacted and force durable full recovery'
);
select ok(
  (
    select position('redacted-fixture' in value::text) = 0
      and position('https://' in value::text) = 0
      and position('Bearer ' in value::text) = 0
    from sync_recovery_test_state
    where key = 'event_page_a'
  ),
  'event recovery envelope exposes no raw legacy token, URL or caller identifier'
);
select ok(
  (
    select (value#>>'{syncEvents,blockingCount}')::integer >= 1
      and value#>>'{syncEvents,oldestBlockingId}' is not null
    from sync_recovery_test_state
    where key = 'checkpoint_a'
  ),
  'checkpoint makes incomplete legacy events a durable recovery blocker'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.inventory_products(
  id,owner_user_id,shop_id,barcode,product_name,supplier_id,category_id
) values (
  '23000000-0000-4000-8000-000000000918',
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'SYNC-TOMBSTONE-REF-918','Tombstone relation fixture',
  '21000000-0000-4000-8000-000000000911',
  '22000000-0000-4000-8000-000000000901'
);
update public.inventory_products
set deleted_at=now()
where id='23000000-0000-4000-8000-000000000918';
update public.shop_inventory_sources
set disabled_at=now()
where shop_inventory_source_id='40000000-0000-4000-8000-000000000901';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
insert into sync_recovery_test_state(key,value)
values (
  'tombstone_refs_after_mapping_disable',
  public.shop_sync_rows_by_ids_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a',
    'products',array['23000000-0000-4000-8000-000000000918'],
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    )
  )
);
select ok(
  (select value#>>'{rows,0,supplier_id}' is null
      and value#>>'{rows,0,category_id}' is null
    from sync_recovery_test_state
    where key='tombstone_refs_after_mapping_disable'),
  'tombstoned product recovery strips live catalog parent references'
);
select ok(
  (select position(
      '21000000-0000-4000-8000-000000000911' in value::text
    ) = 0
    from sync_recovery_test_state
    where key='tombstone_refs_after_mapping_disable'),
  'mapping disable cannot leak a legacy supplier UUID through a tombstone'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  )->>'status',
  'ready',
  'canonical tombstone relations keep the post-mapping checkpoint recoverable'
);
set local role postgres;
update public.shop_inventory_sources
set disabled_at=null
where shop_inventory_source_id='40000000-0000-4000-8000-000000000901';
delete from public.inventory_products
where id='23000000-0000-4000-8000-000000000918';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);

set local role postgres;
select setval('public.sync_events_id_seq', 9007199254740992, true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select public.record_sync_event(
  p_domain => 'catalog', p_event_type => 'catalog_changed',
  p_changed_count => 1,
  p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
  p_source => 'android', p_client_event_id => 'bigint-cursor-1',
  p_shop_id => '10000000-0000-4000-8000-000000000901'
);
select public.record_sync_event(
  p_domain => 'catalog', p_event_type => 'catalog_changed',
  p_changed_count => 1,
  p_entity_ids => '{"product_ids":["23000000-0000-4000-8000-000000000901"]}'::jsonb,
  p_source => 'android', p_client_event_id => 'bigint-cursor-2',
  p_shop_id => '10000000-0000-4000-8000-000000000901'
);
insert into sync_recovery_test_state(key,value)
values (
  'bigint_event_page_1',
  public.shop_sync_event_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a','9007199254740992',1,
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    )
  )
);
select is(
  (select value#>>'{rows,0,id}' from sync_recovery_test_state
    where key='bigint_event_page_1'),
  '9007199254740993',
  'event page preserves an ID above the JavaScript safe-integer boundary'
);
select is(
  (select value->>'nextAfterId' from sync_recovery_test_state
    where key='bigint_event_page_1'),
  '9007199254740993',
  'event cursor above 2^53 is returned as exact decimal text'
);
insert into sync_recovery_test_state(key,value)
select 'bigint_event_page_2', public.shop_sync_event_page_v1(
  '10000000-0000-4000-8000-000000000901','sync-recovery-device-a',
  value->>'nextAfterId',1,
  pg_temp.sync_recovery_scope_key(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  )
)
from sync_recovery_test_state where key='bigint_event_page_1';
select is(
  (select value#>>'{rows,0,id}' from sync_recovery_test_state
    where key='bigint_event_page_2'),
  '9007199254740994',
  'exact decimal cursor resumes without duplicate or skipped events'
);
select is(
  (select value->>'scopeEventMaxId' from sync_recovery_test_state
    where key='bigint_event_page_2'),
  '9007199254740994',
  'event page publishes the exact scoped max as decimal text'
);
select throws_ok(
  format(
    'select public.shop_sync_event_page_v1(%L,%L,%L,1,%L)',
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a',
    '9007199254740995',
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    )
  ),
  '55000','shop_sync_event_cursor_ahead',
  'event cursor ahead of scoped max cannot collapse into false noWork'
);

select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'missing-device'
  ) $$,
  '42501',
  'shop sync recovery requires an active device lease',
  'recovery stays fail-closed without a verified active device lease'
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    repeat(' ', 161)
  ) $$,
  '22023',
  'shop sync recovery requires a valid device identity',
  'raw device identity is byte-bounded before trimming'
);
select throws_ok(
  $$ select public.shop_sync_rows_by_ids_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'products',
    array[repeat('a', 65)],
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )
  ) $$,
  '22023',
  'shop sync targeted IDs must be unique UUIDs',
  'targeted row IDs are byte-bounded before lower and aggregation'
);

insert into sync_recovery_test_state (key, value)
values (
  'before_mutation',
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )->>'checkpointDigest',
  (select value->>'checkpointDigest' from sync_recovery_test_state where key = 'before_mutation'),
  'unchanged checkpoint reads are stable'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'product_archive',
    '{"id":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )->>'code',
  'success',
  'image digest fixture archives its scoped product through the lease-bound boundary'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
insert into sync_recovery_test_state (key, value)
values (
  'image_tombstone_checkpoint',
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )
);
insert into sync_recovery_test_state (key, value)
select
  'image_tombstone_page',
  public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'images',
    null,
    240,
    value#>>'{scope,key}',
    value#>>'{syncEvents,maxId}'
  )
from sync_recovery_test_state
where key = 'image_tombstone_checkpoint';
select ok(
  (
    select value#>>'{images,activeCount}'
    from sync_recovery_test_state
    where key = 'before_mutation'
  ) = '1'
  and (
    select value#>>'{images,tombstoneCount}'
    from sync_recovery_test_state
    where key = 'before_mutation'
  ) = '0'
  and (
    select value#>>'{images,activeCount}'
    from sync_recovery_test_state
    where key = 'image_tombstone_checkpoint'
  ) = '0'
  and (
    select value#>>'{images,tombstoneCount}'
    from sync_recovery_test_state
    where key = 'image_tombstone_checkpoint'
  ) = '1',
  'an archived primary-image product changes the image active/tombstone distribution'
);
select is(
  (
    select value#>>'{images,idSetDigest}'
    from sync_recovery_test_state
    where key = 'image_tombstone_checkpoint'
  ),
  (
    select value#>>'{images,idSetDigest}'
    from sync_recovery_test_state
    where key = 'before_mutation'
  ),
  'an image tombstone preserves its scoped product identity set'
);
select isnt(
  (
    select value#>>'{images,versionDigest}'
    from sync_recovery_test_state
    where key = 'image_tombstone_checkpoint'
  ),
  (
    select value#>>'{images,versionDigest}'
    from sync_recovery_test_state
    where key = 'before_mutation'
  ),
  'an image tombstone changes the canonical image version digest even when identity is unchanged'
);
select isnt(
  (
    select value->>'checkpointDigest'
    from sync_recovery_test_state
    where key = 'image_tombstone_checkpoint'
  ),
  (
    select value->>'checkpointDigest'
    from sync_recovery_test_state
    where key = 'before_mutation'
  ),
  'an image tombstone changes the activation-boundary checkpoint digest'
);
select ok(
  exists (
    select 1
    from sync_recovery_test_state state,
      jsonb_array_elements(state.value->'rows') row
    where state.key = 'image_tombstone_page'
      and row->>'product_id' = '23000000-0000-4000-8000-000000000901'
      and row->>'product_deleted_at' ~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
  ),
  'image tombstone recovery rows expose a canonical product_deleted_at marker'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'product_restore',
    '{"id":"23000000-0000-4000-8000-000000000901"}'::jsonb
  )->>'code',
  'success',
  'image digest fixture restores the product before later recovery assertions'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);

update public.inventory_products
set product_name = 'Shop A product mutated'
where id = '23000000-0000-4000-8000-000000000901';

insert into sync_recovery_test_state (key, value)
select
  'live_product_page_after_a',
  public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'products',
    null,
    250,
    value#>>'{scope,key}',
    value#>>'{syncEvents,maxId}',
    value#>>'{syncEvents,domainMaxIds,catalog}'
  )
from sync_recovery_test_state
where key = 'before_mutation';
select ok(
  (
    select (value->>'pageDomainEventMaxId')::bigint
      > (value->>'baselineDomainEventMaxId')::bigint
    from sync_recovery_test_state
    where key = 'live_product_page_after_a'
  ),
  'same-domain writes do not abort live recovery pages and are exposed to the tail'
);
select lives_ok(
  format(
    'select public.shop_sync_rows_by_ids_v1(%L,%L,%L,%L::text[],%L,%L,%L)',
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'products',
    array['23000000-0000-4000-8000-000000000901'],
    (select value#>>'{scope,key}' from sync_recovery_test_state
      where key = 'before_mutation'),
    (select value#>>'{syncEvents,maxId}' from sync_recovery_test_state
      where key = 'before_mutation'),
    (select value#>>'{syncEvents,domainMaxIds,catalog}'
      from sync_recovery_test_state where key = 'before_mutation')
  ),
  'targeted materialization can chase a moving same-domain event tail'
);

select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,key}',
  (select value#>>'{scope,key}' from sync_recovery_test_state where key = 'before_mutation'),
  'ordinary catalog data mutation does not invalidate the stable identity scope key'
);
select lives_ok(
  format(
    'select public.shop_sync_event_page_v1(%L,%L,%L,150,%L)',
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    (select value#>>'{syncEvents,maxId}' from sync_recovery_test_state where key = 'before_mutation'),
    (select value#>>'{scope,key}' from sync_recovery_test_state where key = 'before_mutation')
  ),
  'event tail remains consumable with the pre-mutation stable scope key'
);
select throws_ok(
  format(
    'select public.shop_sync_recovery_page_v1(%L,%L,%L,null,250,%L,%L)',
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'products',
    (select value#>>'{scope,key}' from sync_recovery_test_state where key = 'before_mutation'),
    (select value#>>'{syncEvents,maxId}' from sync_recovery_test_state where key = 'before_mutation')
  ),
  '55000',
  'shop_sync_recovery_snapshot_changed',
  'snapshot page fails closed when the event generation changes after checkpoint'
);

select isnt(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )->>'checkpointDigest',
  (select value->>'checkpointDigest' from sync_recovery_test_state where key = 'before_mutation'),
  'a catalog mutation changes the recovery checkpoint'
);
insert into sync_recovery_test_state (key, value)
values (
  'owner_convergence_marker_current',
  public.shop_sync_convergence_marker_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000904","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'products',
    null,
    250,
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )
  )#>>'{rows,0,id}',
  '23000000-0000-4000-8000-000000000901',
  'active shop manager can recover shop rows owned by the canonical shop owner'
);
insert into sync_recovery_test_state (key, value)
values (
  'manager_convergence_marker_initial',
  public.shop_sync_convergence_marker_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )
);
select is(
  (
    select value->>'serverNoWorkEligible'
    from sync_recovery_test_state
    where key = 'manager_convergence_marker_initial'
  ),
  'false',
  'noWork remains fail-closed while the supplied baseline trails scoped events'
);
select is(
  jsonb_build_object(
    'catalog', (
      select value#>>'{catalog,digest}'
      from sync_recovery_test_state
      where key = 'manager_convergence_marker_initial'
    ),
    'prices', (
      select value#>>'{prices,versionDigest}'
      from sync_recovery_test_state
      where key = 'manager_convergence_marker_initial'
    ),
    'history', (
      select value#>>'{history,versionDigest}'
      from sync_recovery_test_state
      where key = 'manager_convergence_marker_initial'
    ),
    'images', jsonb_build_object(
      'activeCount', (
        select value#>>'{images,activeCount}'
        from sync_recovery_test_state
        where key = 'manager_convergence_marker_initial'
      ),
      'tombstoneCount', (
        select value#>>'{images,tombstoneCount}'
        from sync_recovery_test_state
        where key = 'manager_convergence_marker_initial'
      ),
      'idSetDigest', (
        select value#>>'{images,idSetDigest}'
        from sync_recovery_test_state
        where key = 'manager_convergence_marker_initial'
      ),
      'versionDigest', (
        select value#>>'{images,versionDigest}'
        from sync_recovery_test_state
        where key = 'manager_convergence_marker_initial'
      )
    )
  ),
  jsonb_build_object(
    'catalog', (
      select value#>>'{catalog,digest}'
      from sync_recovery_test_state
      where key = 'owner_convergence_marker_current'
    ),
    'prices', (
      select value#>>'{prices,versionDigest}'
      from sync_recovery_test_state
      where key = 'owner_convergence_marker_current'
    ),
    'history', (
      select value#>>'{history,versionDigest}'
      from sync_recovery_test_state
      where key = 'owner_convergence_marker_current'
    ),
    'images', jsonb_build_object(
      'activeCount', (
        select value#>>'{images,activeCount}'
        from sync_recovery_test_state
        where key = 'owner_convergence_marker_current'
      ),
      'tombstoneCount', (
        select value#>>'{images,tombstoneCount}'
        from sync_recovery_test_state
        where key = 'owner_convergence_marker_current'
      ),
      'idSetDigest', (
        select value#>>'{images,idSetDigest}'
        from sync_recovery_test_state
        where key = 'owner_convergence_marker_current'
      ),
      'versionDigest', (
        select value#>>'{images,versionDigest}'
        from sync_recovery_test_state
        where key = 'owner_convergence_marker_current'
      )
    )
  ),
  'shop manager receives the same strong row-set digests as the different row owner'
);
select isnt(
  (
    select value->>'checkpointDigest'
    from sync_recovery_test_state
    where key = 'manager_convergence_marker_initial'
  ),
  (
    select value->>'checkpointDigest'
    from sync_recovery_test_state
    where key = 'owner_convergence_marker_current'
  ),
  'the activation checkpoint remains bound to each authenticated account identity'
);
insert into sync_recovery_test_state (key, value)
select
  'manager_convergence_marker_settled',
  public.shop_sync_convergence_marker_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    value#>>'{syncEvents,maxId}',
    value#>>'{scope,key}'
  )
from sync_recovery_test_state
where key = 'manager_convergence_marker_initial';
select is(
  (
    select value->>'serverNoWorkEligible'
    from sync_recovery_test_state
    where key = 'manager_convergence_marker_settled'
  ),
  'true',
  'noWork becomes eligible only after the manager baseline reaches the scoped event max'
);
select isnt(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,accountKey}',
  (select value#>>'{scope,accountKey}' from sync_recovery_test_state where key = 'checkpoint_a'),
  'account key distinguishes owner and manager recovery identities'
);
select isnt(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{scope,key}',
  (select value#>>'{scope,key}' from sync_recovery_test_state where key = 'checkpoint_a'),
  'scope key changes across authenticated account identity'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000905","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c'
  )#>>'{scope,kind}',
  'legacy_owner_bridge',
  'legacy-only catalog resolves to the exclusive verified owner bridge'
);
select ok(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c'
  )#>>'{scope,legacyOwnerKey}' ~ '^[a-f0-9]{64}$',
  'legacy bridge exposes only a redacted owner identity key'
);
select is(
  public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c',
    'suppliers',
    null,
    250,
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000903',
      'sync-recovery-device-c'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000903',
      'sync-recovery-device-c'
    )
  )#>>'{rows,0,id}',
  '21000000-0000-4000-8000-000000000913',
  'legacy bridge page returns only the verified mapped-owner row'
);

set local role postgres;
alter table public.shop_inventory_sources
  disable trigger cross_platform_catalog_source_boundary_guard;
update public.shop_inventory_sources
set verified_at = null
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000903';
alter table public.shop_inventory_sources
  enable trigger cross_platform_catalog_source_boundary_guard;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000905","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c'
  ) $$,
  '55000',
  'shop_sync_recovery_scope_unresolved',
  'unverified mapped discovery cannot authorize destructive recovery'
);

set local role postgres;
alter table public.shop_inventory_sources
  disable trigger cross_platform_catalog_source_boundary_guard;
update public.shop_inventory_sources
set verified_at = now()
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000903';
insert into public.shop_inventory_sources (
  shop_inventory_source_id,
  shop_id,
  owner_user_id,
  mapping_state
) values (
  '40000000-0000-4000-8000-000000000905',
  '10000000-0000-4000-8000-000000000903',
  '00000000-0000-4000-8000-000000000905',
  'ambiguous'
);
alter table public.shop_inventory_sources
  enable trigger cross_platform_catalog_source_boundary_guard;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000905","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c'
  ) $$,
  '55000',
  'shop_sync_recovery_scope_unresolved',
  'mapped plus unresolved active discovery remains fail-closed'
);

set local role postgres;
delete from public.shop_inventory_sources
where shop_inventory_source_id = '40000000-0000-4000-8000-000000000905';
update public.shop_devices
set status = 'active', revoked_at = now()
where shop_device_id = '30000000-0000-4000-8000-000000000903';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000905","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000903',
    'sync-recovery-device-c'
  ) $$,
  '42501',
  'shop sync recovery requires an active device lease',
  'active-but-revoked device corruption cannot authorize recovery'
);
set local role postgres;
update public.shop_devices
set revoked_at = null
where shop_device_id = '30000000-0000-4000-8000-000000000903';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000906","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000904',
    'sync-recovery-device-d'
  ) $$,
  '55000',
  'shop_sync_recovery_scope_unresolved',
  'configured but unresolved shop discovery keeps destructive recovery disabled'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000903","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  ) $$,
  '42501',
  'shop sync recovery requires an active owner/manager shop binding',
  'viewer membership cannot obtain a destructive recovery checkpoint'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

alter table public.shared_sheet_sessions
  drop constraint if exists shared_sheet_sessions_sync_active_payload_v1;
alter table public.shared_sheet_sessions
  drop constraint if exists shared_sheet_sessions_sync_recovery_row_v1;
alter table public.shared_sheet_sessions
  alter column data set storage extended;
insert into public.shared_sheet_sessions (
  remote_id,
  payload_version,
  "timestamp",
  supplier,
  category,
  is_manual_entry,
  data,
  owner_user_id,
  shop_id,
  display_name
) values (
  '25000000-0000-4000-8000-000000000990',
  2,
  '2026-07-21 10:00:00',
  'Oversize fixture',
  'Oversize fixture',
  false,
  jsonb_build_array(jsonb_build_array(repeat('x', 100000))),
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'Oversize recovery fixture'
);
alter table public.shared_sheet_sessions
  alter column data set storage external;
select ok(
  (
    select pg_catalog.pg_column_compression(history.data) is not null
    from public.shared_sheet_sessions history
    where history.remote_id='25000000-0000-4000-8000-000000000990'
  ),
  'fixture proves a physically compressed active legacy History payload'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )->>'status',
  'resource_exceeded',
  'compressed active legacy History fails closed before logical detoast'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{resourcePreflight,storageScanStatus}',
  'compressed_legacy_history_requires_remediation',
  'checkpoint publishes the explicit compressed-History remediation reason'
);
select throws_ok(
  $$ select public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a', 'history', null, 250,
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )
  ) $$,
  '55000', 'shop_sync_recovery_row_invalid',
  'compressed active History aborts the page before partial publication'
);
set local role postgres;
alter table public.shared_sheet_sessions
  disable trigger trg_shared_sheet_sessions_set_updated_at;
alter table public.shared_sheet_sessions
  drop constraint if exists shared_sheet_sessions_sync_active_payload_v1;
alter table public.shared_sheet_sessions
  drop constraint if exists shared_sheet_sessions_sync_recovery_row_v1;
update public.shared_sheet_sessions
set data=(data::text)::jsonb,updated_at=clock_timestamp()
where remote_id='25000000-0000-4000-8000-000000000990';
alter table public.shared_sheet_sessions
  enable trigger trg_shared_sheet_sessions_set_updated_at;
select ok(
  (
    select pg_catalog.pg_column_compression(history.data) is null
    from public.shared_sheet_sessions history
    where history.remote_id='25000000-0000-4000-8000-000000000990'
  ),
  'controlled isolated rewrite materializes active History under EXTERNAL storage'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  )#>>'{resourcePreflight,storageScanStatus}',
  'complete',
  'controlled rewrite clears the compressed-History resource blocker'
);
set local role postgres;
alter table public.shared_sheet_sessions
  alter column data set storage extended;
update public.shared_sheet_sessions
set data=jsonb_build_array(data#>>'{0}'),deleted_at=clock_timestamp()
where remote_id='25000000-0000-4000-8000-000000000990';
alter table public.shared_sheet_sessions
  alter column data set storage external;
select ok(
  (
    select pg_catalog.pg_column_compression(history.data) is not null
    from public.shared_sheet_sessions history
    where history.remote_id='25000000-0000-4000-8000-000000000990'
  ),
  'tombstone fixture retains physically compressed legacy bytes'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  )#>>'{resourcePreflight,storageScanStatus}',
  'complete',
  'compressed tombstone payload is excluded safely from active History scans'
);
set local role postgres;
delete from public.shared_sheet_sessions
where remote_id = '25000000-0000-4000-8000-000000000990';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

alter table public.inventory_suppliers
  drop constraint if exists inventory_suppliers_sync_recovery_row_v1;
alter table public.inventory_suppliers
  disable trigger catalog_text_00_policy_v1;
insert into public.inventory_suppliers(
  id,owner_user_id,shop_id,name
) values (
  '21000000-0000-4000-8000-000000000990',
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',repeat('h',17000)
);
alter table public.inventory_suppliers
  enable trigger catalog_text_00_policy_v1;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  )->>'status',
  'resource_exceeded',
  'historical oversized catalog row requires explicit bounded recovery handling'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
  )#>>'{resourcePreflight,storageViolations,suppliers}',
  'true',
  'checkpoint identifies the historical supplier before DTO materialization'
);
select throws_ok(
  $$ select public.shop_sync_recovery_page_v1(
    '10000000-0000-4000-8000-000000000901','sync-recovery-device-a',
    'suppliers',null,250,
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901','sync-recovery-device-a'
    )
  ) $$,
  '55000','shop_sync_recovery_row_invalid',
  'historical oversized catalog row cannot produce a partial page'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','options','{}'::jsonb
  )->>'code',
  'resource_exceeded',
  'Admin catalog read rejects a legacy oversized row before sorting or JSON aggregation'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','snapshot_page',
    '{"entity":"manifest","includeSummary":true}'::jsonb
  )->>'code',
  'resource_exceeded',
  'Admin snapshot manifest preflights every domain before its full summary aggregate'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000901','products_page',
    '{"limit":20,"offset":0,"state":"all","includeSummary":true}'::jsonb
  )->>'code',
  'resource_exceeded',
  'Admin includeSummary read preflights every domain before summary materialization'
);
set local role postgres;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(
  public.pos_catalog_revision_v2(
    '10000000-0000-4000-8000-000000000901'
  )->>'status',
  'integrity_blocked',
  'POS revision polling cannot report no change while catalog integrity is blocked'
);
select is(
  public.pos_catalog_pull_page_v2(
    p_shop_id=>'10000000-0000-4000-8000-000000000901',
    p_mode=>'full_refresh',p_lower_bound=>null,p_snapshot_at=>null,
    p_entity=>null,p_after_updated_at=>null,p_after_id=>null,p_limit=>1000,
    p_expected_revision=>null,p_expected_scope_kind=>null,
    p_expected_scope_key=>null,p_include_manifest=>true
  )->>'status',
  'integrity_blocked',
  'POS manifest performs the full integrity preflight exactly at snapshot start'
);
set local role postgres;
delete from public.inventory_suppliers
where id='21000000-0000-4000-8000-000000000990';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
insert into sync_recovery_test_state (key, value)
values (
  'before_archived_parent_price',
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name,
  supplier_id,
  category_id
) values (
  '23000000-0000-4000-8000-000000000989',
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'SYNC-ARCHIVED-PARENT',
  'Archived parent fixture',
  '21000000-0000-4000-8000-000000000901',
  '22000000-0000-4000-8000-000000000901'
);
insert into public.inventory_product_prices (
  id,
  owner_user_id,
  shop_id,
  product_id,
  type,
  price,
  effective_at,
  created_at
) values (
  '24000000-0000-4000-8000-000000000989',
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  '23000000-0000-4000-8000-000000000989',
  'RETAIL',
  989,
  '2026-07-21 11:00:00',
  '2026-07-21 11:00:00'
);
update public.inventory_products
set deleted_at = now()
where id = '23000000-0000-4000-8000-000000000989';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  (public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{prices,activeCount}')::integer,
  (
    select value#>>'{prices,activeCount}'
    from sync_recovery_test_state
    where key = 'before_archived_parent_price'
  )::integer + 1,
  'checkpoint preserves append-only prices whose scoped product is tombstoned'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(
      public.shop_sync_recovery_page_v1(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a',
        'prices',
        null,
        250,
        pg_temp.sync_recovery_scope_key(
          '10000000-0000-4000-8000-000000000901',
          'sync-recovery-device-a'
        ),
        pg_temp.sync_recovery_event_max_id(
          '10000000-0000-4000-8000-000000000901',
          'sync-recovery-device-a'
        )
      )->'rows'
    ) row_data
    where row_data->>'id' = '24000000-0000-4000-8000-000000000989'
  ),
  1,
  'full recovery preserves price history for a scoped tombstoned product'
);
select is(
  jsonb_array_length(
    public.shop_sync_rows_by_ids_v1(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a',
      'prices',
      array['24000000-0000-4000-8000-000000000989'],
      pg_temp.sync_recovery_scope_key(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      ),
      pg_temp.sync_recovery_event_max_id(
        '10000000-0000-4000-8000-000000000901',
        'sync-recovery-device-a'
      )
    )->'rows'
  ),
  1,
  'targeted recovery preserves a price whose scoped product is tombstoned'
);
select is(
  public.shop_sync_rows_by_ids_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a',
    'prices',
    array['24000000-0000-4000-8000-000000000989'],
    pg_temp.sync_recovery_scope_key(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    ),
    pg_temp.sync_recovery_event_max_id(
      '10000000-0000-4000-8000-000000000901',
      'sync-recovery-device-a'
    )
  )#>>'{missingIds,0}',
  null,
  'targeted recovery does not mark an archived-parent price missing'
);
select is(
  public.shop_sync_recovery_checkpoint_v1(
    '10000000-0000-4000-8000-000000000901',
    'sync-recovery-device-a'
  )#>>'{integrity,priceProductViolationCount}',
  '0',
  'an archived-parent price remains relationally valid history'
);

set local role postgres;
select throws_ok(
  $$
    insert into public.inventory_product_prices (
      id,
      owner_user_id,
      shop_id,
      product_id,
      type,
      price,
      effective_at,
      created_at
    ) values (
      '24000000-0000-4000-8000-000000000988',
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      '23000000-0000-4000-8000-000000000989',
      'RETAIL',
      988,
      '2026-07-21 11:00:00',
      '2026-07-21 11:00:00'
    )
  $$,
  '23503',
  'price product is outside the authorized catalog scope',
  'new prices cannot attach to a tombstoned product'
);

select ok(
  exists (
    select 1
    from public.sync_events event
    where event.source = 'database_atomic'
      and event.metadata->>'atomic_trigger' = 'true'
      and event.metadata->>'entity_type' = 'product'
      and event.entity_ids->'product_ids'
        @> '["23000000-0000-4000-8000-000000000901"]'::jsonb
  ),
  'ordinary table mutations publish complete sync events in the same transaction'
);

create temporary table sync_recovery_atomic_event_floor (
  key text primary key,
  event_id bigint not null
);
create temporary table sync_recovery_atomic_supplier_ids (
  id uuid primary key
);
insert into sync_recovery_atomic_event_floor(key,event_id)
values ('suppliers',coalesce((select max(id) from public.sync_events),0));
with inserted as (
  insert into public.inventory_suppliers(id,owner_user_id,shop_id,name)
  select
    gen_random_uuid(),
    '00000000-0000-4000-8000-000000000901'::uuid,
    '10000000-0000-4000-8000-000000000901'::uuid,
    format('Atomic supplier %s',ordinal)
  from generate_series(1,251) generated(ordinal)
  returning id
)
insert into sync_recovery_atomic_supplier_ids(id)
select id from inserted;
select is(
  (
    select count(*)::integer
    from public.sync_events event
    where event.id>(select event_id from sync_recovery_atomic_event_floor
                    where key='suppliers')
      and event.source='database_atomic'
      and event.metadata->>'entity_type'='supplier'
      and event.metadata->>'operation'='insert'
  ),
  2,
  'one 251-row supplier statement publishes two bounded atomic events'
);
select is(
  (
    select sum(event.changed_count)::integer
    from public.sync_events event
    where event.id>(select event_id from sync_recovery_atomic_event_floor
                    where key='suppliers')
      and event.source='database_atomic'
      and event.metadata->>'entity_type'='supplier'
      and event.metadata->>'operation'='insert'
  ),
  251,
  'atomic statement chunking preserves every supplier ID'
);
select ok(
  (
    select bool_and(
      jsonb_array_length(event.entity_ids->'supplier_ids')<=250
      and app_private.sync_event_entity_ids_are_complete(
        event.domain,event.changed_count,event.entity_ids
      )
      and app_private.sync_event_entity_ids_belong_to_scope(
        event.domain,event.entity_ids,event.owner_user_id,event.shop_id
      )
    )
    from public.sync_events event
    where event.id>(select event_id from sync_recovery_atomic_event_floor
                    where key='suppliers')
      and event.source='database_atomic'
      and event.metadata->>'entity_type'='supplier'
      and event.metadata->>'operation'='insert'
  ),
  'same-statement supplier IDs are visible to the STABLE scope validator'
);
delete from public.inventory_suppliers supplier
where supplier.id in (select id from sync_recovery_atomic_supplier_ids);

create temporary table sync_recovery_atomic_history_ids (
  remote_id text primary key
);
with inserted as (
  insert into public.shared_sheet_sessions(
    remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,
    data,owner_user_id,shop_id,display_name,session_overlay
  )
  select
    '25000000-0000-4000-8000-'||lpad(ordinal::text,12,'0'),
    2,'2026-07-21 12:00:00','Atomic supplier','Atomic category',false,
    '[]'::jsonb,'00000000-0000-4000-8000-000000000901'::uuid,
    '10000000-0000-4000-8000-000000000901'::uuid,
    format('Atomic history %s',ordinal),
    '{"overlay_schema":1,"editable":[],"complete":[]}'::jsonb
  from generate_series(1,26) generated(ordinal)
  returning remote_id
)
insert into sync_recovery_atomic_history_ids(remote_id)
select remote_id from inserted;
insert into sync_recovery_atomic_event_floor(key,event_id)
values ('history_delete',coalesce((select max(id) from public.sync_events),0));
delete from public.shared_sheet_sessions history
where history.remote_id in (
  select fixture.remote_id from sync_recovery_atomic_history_ids fixture
);
select is(
  (
    select count(*)::integer
    from public.sync_events event
    where event.id>(select event_id from sync_recovery_atomic_event_floor
                    where key='history_delete')
      and event.domain='history'
      and event.event_type='history_tombstone'
      and event.metadata->>'operation'='hard_delete'
  ),
  2,
  'hard delete of 26 History rows publishes two bounded tombstone events'
);
select is(
  (
    select sum(event.changed_count)::integer
    from public.sync_events event
    where event.id>(select event_id from sync_recovery_atomic_event_floor
                    where key='history_delete')
      and event.domain='history'
      and event.event_type='history_tombstone'
      and event.metadata->>'operation'='hard_delete'
  ),
  26,
  'hard-delete History events preserve every deleted session ID'
);

alter table public.shared_sheet_sessions
  drop constraint if exists shared_sheet_sessions_sync_recovery_row_v1;
insert into sync_recovery_atomic_event_floor(key,event_id)
values ('invalid_history',coalesce((select max(id) from public.sync_events),0));
select throws_ok(
  $$
    insert into public.shared_sheet_sessions(
      remote_id,payload_version,"timestamp",supplier,category,is_manual_entry,
      data,owner_user_id,shop_id,display_name,session_overlay
    ) values
    (
      '25000000-0000-4000-8000-000000000998',2,'2026-07-21 12:00:00',
      'Atomic supplier','Atomic category',false,'[]'::jsonb,
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901','Valid peer',
      '{"overlay_schema":1,"editable":[],"complete":[]}'::jsonb
    ),
    (
      repeat('a',65),2,'2026-07-21 12:00:00',
      'Atomic supplier','Atomic category',false,'[]'::jsonb,
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901','Invalid peer',
      '{"overlay_schema":1,"editable":[],"complete":[]}'::jsonb
    )
  $$,
  '22023',
  'atomic history entity id is not a canonical UUID',
  'one invalid History ID aborts the complete source statement before events'
);
select ok(
  not exists (
    select 1 from public.shared_sheet_sessions history
    where history.remote_id='25000000-0000-4000-8000-000000000998'
       or history.remote_id=repeat('a',65)
  )
  and not exists (
    select 1 from public.sync_events event
    where event.id>(select event_id from sync_recovery_atomic_event_floor
                    where key='invalid_history')
  ),
  'invalid multi-row History statement leaves neither rows nor partial events'
);
create function pg_temp.sync_recovery_reject_atomic_event()
returns trigger
language plpgsql
as $$
begin
  if new.metadata->>'atomic_trigger' = 'true' then
    raise exception 'forced_atomic_event_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger sync_recovery_reject_atomic_event
before insert on public.sync_events
for each row execute function pg_temp.sync_recovery_reject_atomic_event();

select throws_ok(
  $$
    insert into public.inventory_products (
      id,
      owner_user_id,
      shop_id,
      barcode,
      product_name,
      supplier_id,
      category_id
    ) values (
      '23000000-0000-4000-8000-000000000990',
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'SYNC-ATOMIC-ROLLBACK',
      'Must roll back with its event',
      '21000000-0000-4000-8000-000000000901',
      '22000000-0000-4000-8000-000000000901'
    )
  $$,
  'P0001',
  'forced_atomic_event_failure',
  'a sync-event write failure aborts the originating catalog mutation'
);
select is(
  (
    select count(*)::integer
    from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000990'
  ),
  0,
  'failed atomic publication leaves no partially committed catalog row'
);
drop trigger sync_recovery_reject_atomic_event on public.sync_events;

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, supplier_id, category_id
) values
  (
    '23000000-0000-4000-8000-000000000970',
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'SYNC-BULK-970', 'Bulk semantic row 970',
    '21000000-0000-4000-8000-000000000901',
    '22000000-0000-4000-8000-000000000901'
  ),
  (
    '23000000-0000-4000-8000-000000000971',
    '00000000-0000-4000-8000-000000000901',
    '10000000-0000-4000-8000-000000000901',
    'SYNC-BULK-971', 'Bulk semantic row 971',
    '21000000-0000-4000-8000-000000000901',
    '22000000-0000-4000-8000-000000000901'
  );
create temporary table sync_recovery_bulk_event_count (value bigint not null);
grant select, insert, delete on sync_recovery_bulk_event_count
  to authenticated, service_role;
create function pg_temp.sync_recovery_event_count()
returns bigint language sql stable security definer
set search_path=public,pg_temp
as $$ select count(*) from public.sync_events $$;
create function pg_temp.sync_recovery_latest_admin_catalog_ids()
returns jsonb language sql stable security definer
set search_path=public,pg_temp
as $$
  select event.entity_ids->'product_ids'
  from public.sync_events event
  where event.source='admin_web' and event.domain='catalog'
  order by event.id desc limit 1
$$;
grant execute on function pg_temp.sync_recovery_event_count()
  to authenticated, service_role;
grant execute on function pg_temp.sync_recovery_latest_admin_catalog_ids()
  to authenticated, service_role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
insert into sync_recovery_bulk_event_count
select pg_temp.sync_recovery_event_count();
select is(
  public.shop_catalog_import_products(
    '10000000-0000-4000-8000-000000000901',
    '[{"product_id":"23000000-0000-4000-8000-000000000970","barcode":"SYNC-BULK-970","product_name":"Exponent guard","purchase_price":1e100000}]'::jsonb
  )->>'code',
  'row_limit_exceeded',
  'catalog import rejects a compact huge numeric before legacy numeric casts'
);
select is(
  public.staff_web_history_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    null, null, null, null,
    'load',
    '{"remoteId":"25000000-0000-4000-8000-000000000901","payloadVersion":1e100000}'::jsonb
  )->>'code',
  'validation_failed',
  'history mutation rejects a compact huge numeric before legacy casts'
);
select is(
  public.shop_catalog_import_products(
    '10000000-0000-4000-8000-000000000901',
    jsonb_build_array(jsonb_build_object(
      'product_id','23000000-0000-4000-8000-000000000970',
      'barcode','SYNC-BULK-970',
      'product_name','Bulk semantic row 970',
      'supplier_id','21000000-0000-4000-8000-000000000901',
      'category_id','22000000-0000-4000-8000-000000000901'
    ))
  )->>'code',
  'success',
  'personal bulk exact replay succeeds'
);
select is(
  pg_temp.sync_recovery_event_count(),
  (select value from sync_recovery_bulk_event_count),
  'personal bulk exact replay emits zero semantic events'
);
delete from sync_recovery_bulk_event_count;
insert into sync_recovery_bulk_event_count
select pg_temp.sync_recovery_event_count();
insert into sync_recovery_test_state(key,value)
values (
  'personal_bulk_mixed_result',
  public.shop_catalog_import_products(
    '10000000-0000-4000-8000-000000000901',
    jsonb_build_array(
      jsonb_build_object(
        'product_id','23000000-0000-4000-8000-000000000970',
        'barcode','SYNC-BULK-970','product_name','Bulk changed row 970',
        'supplier_id','21000000-0000-4000-8000-000000000901',
        'category_id','22000000-0000-4000-8000-000000000901'
      ),
      jsonb_build_object(
        'product_id','23000000-0000-4000-8000-000000000971',
        'barcode','SYNC-BULK-971','product_name','Bulk semantic row 971',
        'supplier_id','21000000-0000-4000-8000-000000000901',
        'category_id','22000000-0000-4000-8000-000000000901'
      ),
      jsonb_build_object(
        'product_id','23000000-0000-4000-8000-000000000972',
        'barcode','SYNC-BULK-972','product_name','Invalid supplier row',
        'supplier_id','21000000-0000-4000-8000-000000000999'
      )
    )
  )
);
select is(
  (select value->>'code' from sync_recovery_test_state
    where key='personal_bulk_mixed_result'),
  'partial_failure',
  'personal bulk reports a proven mixed result'
);
select is(
  pg_temp.sync_recovery_event_count(),
  (select value + 1 from sync_recovery_bulk_event_count),
  'personal mixed bulk emits one aggregated semantic event'
);
select is(
  pg_temp.sync_recovery_latest_admin_catalog_ids(),
  '["23000000-0000-4000-8000-000000000970"]'::jsonb,
  'personal mixed bulk event contains only the actually changed product ID'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
delete from sync_recovery_bulk_event_count;
insert into sync_recovery_bulk_event_count
select pg_temp.sync_recovery_event_count();
select is(
  public.staff_web_catalog_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e',64), 1, 'bulk_products',
    jsonb_build_object('rows',jsonb_build_array(jsonb_build_object(
      'product_id','23000000-0000-4000-8000-000000000970',
      'barcode','SYNC-BULK-970','product_name','Bulk changed row 970',
      'supplier_id','21000000-0000-4000-8000-000000000901',
      'category_id','22000000-0000-4000-8000-000000000901'
    )))
  )->>'code',
  'success',
  'staff bulk exact replay succeeds through the lease boundary'
);
select is(
  pg_temp.sync_recovery_event_count(),
  (select value from sync_recovery_bulk_event_count),
  'staff bulk exact replay emits zero semantic events'
);

set local role postgres;
create function pg_temp.sync_recovery_reject_admin_bulk_event()
returns trigger language plpgsql as $$
begin
  if new.source='admin_web' then
    raise exception 'forced_admin_bulk_event_failure' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger sync_recovery_reject_admin_bulk_event
before insert on public.sync_events
for each row execute function pg_temp.sync_recovery_reject_admin_bulk_event();
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select throws_ok(
  $$ select public.shop_catalog_import_products(
    '10000000-0000-4000-8000-000000000901',
    '[{
      "product_id":"23000000-0000-4000-8000-000000000970",
      "barcode":"SYNC-BULK-970",
      "product_name":"Must roll back with aggregated event",
      "supplier_id":"21000000-0000-4000-8000-000000000901",
      "category_id":"22000000-0000-4000-8000-000000000901"
    }]'::jsonb
  ) $$,
  'P0001','forced_admin_bulk_event_failure',
  'bulk publication failure aborts the entire product RPC'
);
select is(
  (select product_name from public.inventory_products
    where id='23000000-0000-4000-8000-000000000970'),
  'Bulk changed row 970',
  'failed bulk publication leaves no partially committed product mutation'
);
set local role postgres;
drop trigger sync_recovery_reject_admin_bulk_event on public.sync_events;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table sync_recovery_price_products (
  ordinal integer primary key,
  product_id uuid not null unique
);
create temporary table sync_recovery_price_fixture (
  ordinal integer primary key,
  product_ordinal integer not null,
  product_id uuid not null,
  price_id uuid not null unique
);
insert into sync_recovery_price_products (ordinal, product_id)
select ordinal, gen_random_uuid()
from generate_series(1, 1000) generated(ordinal);
insert into sync_recovery_price_fixture (
  ordinal, product_ordinal, product_id, price_id
)
select
  generated.ordinal,
  ((generated.ordinal - 1) / 2) + 1,
  product.product_id,
  gen_random_uuid()
from generate_series(1, 2000) generated(ordinal)
join sync_recovery_price_products product
  on product.ordinal = ((generated.ordinal - 1) / 2) + 1;

select set_config('app_private.pos_catalog_import_in_progress', 'on', true);
insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name,
  supplier_id,
  category_id
)
select
  product.product_id,
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'SYNC-PRICE-' || product.ordinal,
  'Sync recovery price product ' || product.ordinal,
  '21000000-0000-4000-8000-000000000901',
  '22000000-0000-4000-8000-000000000901'
from sync_recovery_price_products product;

insert into public.inventory_product_prices (
  id,
  owner_user_id,
  shop_id,
  product_id,
  type,
  price,
  effective_at,
  created_at
)
select
  fixture.price_id,
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  fixture.product_id,
  case when fixture.ordinal % 2 = 1 then 'RETAIL' else 'PURCHASE' end,
  fixture.ordinal,
  '2026-07-21 11:00:00',
  '2026-07-21 11:00:00'
from sync_recovery_price_fixture fixture;
select set_config('app_private.pos_catalog_import_in_progress', 'off', true);

insert into public.sync_events (
  owner_user_id,
  shop_id,
  domain,
  event_type,
  source,
  client_event_id,
  changed_count,
  entity_ids,
  metadata
)
select
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'prices',
  'prices_changed',
  'pos_catalog_import_sync',
  'sync-recovery-max-price-event',
  2000,
  jsonb_build_object(
    'price_ids', jsonb_agg(lower(fixture.price_id::text) order by fixture.ordinal),
    'product_ids', (
      select jsonb_agg(lower(product.product_id::text) order by product.ordinal)
      from sync_recovery_price_products product
    )
  ),
  '{"status":"success"}'::jsonb
from sync_recovery_price_fixture fixture;

select is(
  (
    select count(*)::integer
    from public.sync_events event
    where event.domain = 'prices'
      and event.metadata->>'chunked_from_count' = '2000'
  ),
  20,
  'trusted POS exact-maximum price event is split into twenty bounded chunks'
);
select is(
  (
    select sum(event.changed_count)::integer
    from public.sync_events event
    where event.domain = 'prices'
      and event.metadata->>'chunked_from_count' = '2000'
  ),
  2000,
  'POS exact-maximum price splitting preserves every primary price ID'
);
select ok(
  (
    select bool_and(
      octet_length(event.entity_ids::text) <= 16384
      and jsonb_array_length(event.entity_ids->'price_ids') <= 100
      and jsonb_array_length(event.entity_ids->'product_ids') <= 100
      and app_private.sync_event_entity_ids_are_complete(
        event.domain,
        event.changed_count,
        event.entity_ids
      )
      and app_private.sync_event_entity_ids_belong_to_scope(
        event.domain,
        event.entity_ids,
        event.owner_user_id,
        event.shop_id
      )
    )
    from public.sync_events event
    where event.domain = 'prices'
      and event.metadata->>'chunked_from_count' = '2000'
  ),
  'every exact-maximum price chunk stays bounded with exact scoped references'
);
select ok(
  not exists (
    select 1
    from public.sync_events event
    cross join lateral jsonb_array_elements_text(
      event.entity_ids->'product_ids'
    ) product_id(value)
    where event.domain = 'prices'
      and event.metadata->>'chunked_from_count' = '2000'
      and product_id.value = '23000000-0000-4000-8000-000000000902'
  ),
  'price splitter recomputes references and cannot leak a cross-shop product ID'
);

insert into public.sync_events (
  owner_user_id,
  shop_id,
  domain,
  event_type,
  source,
  client_event_id,
  changed_count,
  entity_ids,
  metadata
)
select
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'prices',
  'prices_changed',
  'pos_catalog_import_sync',
  'sync-recovery-max-price-event',
  2000,
  jsonb_build_object(
    'price_ids', jsonb_agg(lower(fixture.price_id::text) order by fixture.ordinal),
    'product_ids', (
      select jsonb_agg(lower(product.product_id::text) order by product.ordinal)
      from sync_recovery_price_products product
    )
  ),
  '{"status":"success"}'::jsonb
from sync_recovery_price_fixture fixture;

select is(
  (
    select count(*)::integer
    from public.sync_events event
    where event.domain = 'prices'
      and event.metadata->>'chunked_from_count' = '2000'
  ),
  20,
  'POS exact-maximum price event replay is idempotent'
);

select throws_ok(
  $$
    insert into public.sync_events (
      owner_user_id, shop_id, domain, event_type, source,
      client_event_id, changed_count, entity_ids, metadata
    )
    select
      '00000000-0000-4000-8000-000000000901',
      '10000000-0000-4000-8000-000000000901',
      'prices', 'prices_changed', 'pos_catalog_import_sync',
      'sync-recovery-over-max-pos-price-event', 2001,
      jsonb_build_object(
        'price_ids', jsonb_agg(gen_random_uuid()::text order by ordinal)
      ),
      '{"status":"success"}'::jsonb
    from generate_series(1, 2001) generated(ordinal)
  $$,
  '22023',
  'POS price event envelope is invalid',
  'POS price envelope rejects one row above the 2000-row maximum'
);

select app_private.acquire_sync_event_scope_fence_v1(
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901'
);
create temporary table sync_recovery_retention_state(
  key text primary key,
  value bigint not null
);
select hasnt_trigger(
  'public',
  'sync_events',
  'cross_platform_sync_event_retention_v1',
  'expand phase defers the table-wide retention trigger for legacy writers'
);
create trigger cross_platform_sync_event_retention_v1
  after insert on public.sync_events
  for each row
  execute function app_private.maintain_sync_event_retention_v1();
alter table public.sync_events
  disable trigger cross_platform_sync_event_retention_v1;
insert into public.sync_events(
  owner_user_id,shop_id,domain,event_type,source,client_event_id,
  changed_count,entity_ids,metadata
)
select
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog','catalog_changed','android',
  format('retention-backlog:%s',ordinal),0,null,'{}'::jsonb
from generate_series(1,1500) generated(ordinal);
update public.sync_events event
set created_at=clock_timestamp()-interval '100 days',
    expires_at=clock_timestamp()-interval '10 days'
where event.client_event_id like 'retention-backlog:%';
insert into sync_recovery_retention_state(key,value)
select 'backlog_max',max(event.id)
from public.sync_events event
where event.client_event_id like 'retention-backlog:%';
alter table public.sync_events
  enable trigger cross_platform_sync_event_retention_v1;

select set_config('app_private.sync_event_retention_checked_v1','',true);
insert into public.sync_events(
  owner_user_id,shop_id,domain,event_type,source,client_event_id,
  changed_count,entity_ids,metadata
) values (
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog','catalog_changed','android','retention-cleanup-pass-1',
  0,null,'{}'::jsonb
);
select is(
  (
    select count(*)::integer from public.sync_events event
    where event.client_event_id like 'retention-backlog:%'
  ),
  500,
  'first retention pass removes exactly the bounded 1000-row batch'
);
select set_config('app_private.sync_event_retention_checked_v1','',true);
insert into public.sync_events(
  owner_user_id,shop_id,domain,event_type,source,client_event_id,
  changed_count,entity_ids,metadata
) values (
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog','catalog_changed','android','retention-cleanup-pass-2',
  0,null,'{}'::jsonb
);
select is(
  (
    select count(*)::integer from public.sync_events event
    where event.client_event_id like 'retention-backlog:%'
  ),
  0,
  'second bounded retention pass drains the remaining 500 expired rows'
);
select is(
  (
    select count(*)::integer
    from public.sync_events event
    where event.shop_id='10000000-0000-4000-8000-000000000901'
      and event.domain='catalog'
      and app_private.sync_event_is_retention_floor_v1(
        event.domain,event.event_type,event.source,event.source_device_id,
        event.client_event_id,event.entity_ids,event.metadata
      )
  ),
  1,
  'expired backlog is represented by one durable retention floor'
);
select ok(
  (
    select (marker.metadata->>'retained_through_id')::bigint>=state.value
      and marker.expires_at>clock_timestamp()+interval '179 days'
      and marker.expires_at<clock_timestamp()+interval '181 days'
      and pg_catalog.isfinite(marker.expires_at)
    from public.sync_events marker
    cross join sync_recovery_retention_state state
    where state.key='backlog_max'
      and marker.shop_id='10000000-0000-4000-8000-000000000901'
      and marker.domain='catalog'
      and app_private.sync_event_is_retention_floor_v1(
        marker.domain,marker.event_type,marker.source,
        marker.source_device_id,marker.client_event_id,
        marker.entity_ids,marker.metadata
      )
  ),
  'retention floor covers the deleted backlog and has a finite 180-day lease'
);
select ok(
  (
    select
      app_private.sync_event_is_safe_after_v1(
        marker.id,marker.owner_user_id,marker.store_id,marker.shop_id,
        marker.domain,marker.event_type,marker.source,
        marker.source_device_id,marker.batch_id,marker.client_event_id,
        marker.changed_count,marker.entity_ids,marker.created_at,
        marker.expires_at,marker.metadata,
        (marker.metadata->>'retained_through_id')::bigint
      )
      and not app_private.sync_event_is_safe_after_v1(
        marker.id,marker.owner_user_id,marker.store_id,marker.shop_id,
        marker.domain,marker.event_type,marker.source,
        marker.source_device_id,marker.batch_id,marker.client_event_id,
        marker.changed_count,marker.entity_ids,marker.created_at,
        marker.expires_at,marker.metadata,
        greatest((marker.metadata->>'retained_through_id')::bigint-1,0)
      )
    from public.sync_events marker
    where marker.shop_id='10000000-0000-4000-8000-000000000901'
      and marker.domain='catalog'
      and app_private.sync_event_is_retention_floor_v1(
        marker.domain,marker.event_type,marker.source,
        marker.source_device_id,marker.client_event_id,
        marker.entity_ids,marker.metadata
      )
  ),
  'retention floor becomes safe only after a verified baseline covers its floor'
);

alter table public.sync_events
  disable trigger cross_platform_sync_event_retention_v1;
with marker_ids as materialized (
  select ordinal,nextval('public.sync_events_id_seq') as id
  from generate_series(1,1001) generated(ordinal)
)
insert into public.sync_events(
  id,owner_user_id,shop_id,domain,event_type,source,client_event_id,
  changed_count,entity_ids,metadata
)
overriding system value
select
  marker.id,
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog','catalog_changed','database_atomic',
  'retention-floor:'||gen_random_uuid()::text,0,null,
  jsonb_build_object(
    'retention_floor',true,
    'retained_through_id',(marker.id-1)::text,
    'status','noop'
  )
from marker_ids marker;
alter table public.sync_events
  enable trigger cross_platform_sync_event_retention_v1;
select set_config('app_private.sync_event_retention_checked_v1','',true);
insert into public.sync_events(
  owner_user_id,shop_id,domain,event_type,source,client_event_id,
  changed_count,entity_ids,metadata
) values (
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog','catalog_changed','android','retention-marker-fold-pass-1',
  0,null,'{}'::jsonb
);
select set_config('app_private.sync_event_retention_checked_v1','',true);
insert into public.sync_events(
  owner_user_id,shop_id,domain,event_type,source,client_event_id,
  changed_count,entity_ids,metadata
) values (
  '00000000-0000-4000-8000-000000000901',
  '10000000-0000-4000-8000-000000000901',
  'catalog','catalog_changed','android','retention-marker-fold-pass-2',
  0,null,'{}'::jsonb
);
select is(
  (
    select count(*)::integer
    from public.sync_events marker
    where marker.shop_id='10000000-0000-4000-8000-000000000901'
      and marker.domain='catalog'
      and app_private.sync_event_is_retention_floor_v1(
        marker.domain,marker.event_type,marker.source,
        marker.source_device_id,marker.client_event_id,
        marker.entity_ids,marker.metadata
      )
  ),
  1,
  'more than 1000 legacy retention markers fold idempotently to one survivor'
);
select ok(
  not app_private.sync_event_retention_envelope_is_valid_v1(
    10,null,'catalog','catalog_changed','database_atomic',null,null,
    'retention-floor:00000000-0000-4000-8000-000000000001',
    0,null,
    '{"retention_floor":true,"retained_through_id":"9","status":"noop"}'::jsonb,
    clock_timestamp(),'infinity'::timestamptz
  ),
  'a non-finite retention expiry is never a valid durable recovery marker'
);

-- A recovery-note capability may not become a transitive History CRUD grant.
-- Run this after other staff fixtures so the role-wide permission replacement
-- cannot alter their intended coverage; the enclosing pgTAP transaction rolls
-- the fixture back.
set local role postgres;
update public.staff_web_sessions
set status = 'active', revoked_at = null, expires_at = now() + interval '1 day'
where staff_web_session_id = '34000000-0000-4000-8000-000000000901';
delete from public.staff_role_permissions
where shop_id = '10000000-0000-4000-8000-000000000901'
  and role_key = 'manager';
insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000901', 'manager', 'sync.write', true
);
select ok(
  app_private.staff_web_runtime_lease_is_valid_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'sync.write'
  )
  and not app_private.staff_web_runtime_lease_is_valid_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'history.write'
  ),
  'sync.write remains distinct from the History mutation lease'
);
set local role service_role;
select is(
  public.staff_web_history_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'create',
    jsonb_build_object(
      'remoteId', '25000000-0000-4000-8000-000000000996',
      'payloadVersion', 2,
      'timestamp', '2026-07-23 10:00:00',
      'supplier', 'History permission supplier',
      'category', 'History permission category',
      'isManualEntry', true,
      'data', '[]'::jsonb,
      'overlay', '{"overlay_schema":1,"complete":[],"editable":[]}'::jsonb,
      'displayName', 'Denied sync-write-only History entry'
    )
  )->>'code',
  'session_expired',
  'sync.write-only staff cannot create a History entry'
);
set local role postgres;
select ok(
  not exists (
    select 1
    from public.shared_sheet_sessions history
    where history.remote_id = '25000000-0000-4000-8000-000000000996'
  ) and not exists (
    select 1
    from public.audit_logs audit
    where audit.target_id = '25000000-0000-4000-8000-000000000996'
  ),
  'denied sync.write-only History mutation leaves no row or audit'
);
delete from public.staff_role_permissions
where shop_id = '10000000-0000-4000-8000-000000000901'
  and role_key = 'manager';
insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000901', 'manager', 'history.write', true
);
set local role service_role;
select is(
  public.staff_web_history_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    '34000000-0000-4000-8000-000000000901',
    'sha256:' || repeat('e', 64),
    1,
    'create',
    jsonb_build_object(
      'remoteId', '25000000-0000-4000-8000-000000000996',
      'payloadVersion', 2,
      'timestamp', '2026-07-23 10:00:00',
      'supplier', 'History permission supplier',
      'category', 'History permission category',
      'isManualEntry', true,
      'data', '[]'::jsonb,
      'overlay', '{"overlay_schema":1,"complete":[],"editable":[]}'::jsonb,
      'displayName', 'Allowed dedicated History entry'
    )
  )->>'code',
  'success',
  'dedicated history.write staff can create a History entry'
);
set local role postgres;
select ok(
  exists (
    select 1
    from public.shared_sheet_sessions history
    where history.remote_id = '25000000-0000-4000-8000-000000000996'
      and history.shop_id = '10000000-0000-4000-8000-000000000901'
  ),
  'dedicated history.write mutation publishes its in-scope History row'
);

-- Staff web lockout recovery: the staff record is authoritative after an
-- audited clear/reset; the attempt record remains bounded telemetry until the
-- next successful login clears it under the existing advisory-lock order.
set local role postgres;
update public.staff_accounts
set status = 'active',
    credential_status = 'active',
    failed_attempts = 0,
    locked_until = null,
    must_change_credential = false,
    web_access_revoked_at = null,
    credential_version = 1,
    updated_at = now()
where staff_id = '31000000-0000-4000-8000-000000000901';
delete from public.staff_web_login_attempts
where attempt_key_hash in (
  'sha256:' || repeat('a', 64),
  'sha256:' || repeat('b', 64),
  'sha256:' || repeat('c', 64)
);
delete from public.staff_web_sessions
where session_token_hash in (
  'sha256:' || repeat('a', 64),
  'sha256:' || repeat('b', 64),
  'sha256:' || repeat('c', 64)
);
insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000901', 'manager', 'staff.write', true
) on conflict (shop_id, role_key, permission_key) do update set enabled = true;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (
    select count(*)::integer
    from generate_series(1, 5)
    where public.staff_web_login_failure_v1(
      'sha256:' || repeat('a', 64),
      'credential_invalid',
      '{}'::jsonb,
      '10000000-0000-4000-8000-000000000901',
      '31000000-0000-4000-8000-000000000901',
      1,
      true
    )->>'ok' = 'true'
  ),
  5,
  'five credential failures lock the staff and attempt representations together'
);
set local role postgres;
select ok(
  (
    select credential_status = 'locked'
      and failed_attempts = 5
      and locked_until > now()
    from public.staff_accounts
    where staff_id = '31000000-0000-4000-8000-000000000901'
  )
  and (
    select failed_attempts = 5 and locked_until > now()
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:' || repeat('a', 64)
  ),
  'a future credential lock remains fail-closed in both representations'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'sha256:' || repeat('a', 64),
    'sha256:' || repeat('a', 64),
    now() + interval '1 hour',
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'a future staff credential lock denies a direct login commit'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.shop_staff_clear_lockout(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    'TASK-139 lockout recovery fixture'
  )->>'code',
  'success',
  'the personal-account lockout clear records an authoritative active staff state'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (
    public.staff_web_login_lookup_v1(
      'SYNC901A',
      'SYNC901',
      'sha256:' || repeat('a', 64)
    )->'staff'->>'credential_status'
  ) = 'active'
  and (
    public.staff_web_login_lookup_v1(
      'SYNC901A',
      'SYNC901',
      'sha256:' || repeat('a', 64)
    )->'attempt'->>'locked_until'
  )::timestamptz > now(),
  'a clear preserves the attempt telemetry but exposes the authoritative active staff state'
);
select is(
  public.staff_web_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'sha256:' || repeat('a', 64),
    'sha256:' || repeat('b', 64),
    now() + interval '1 hour',
    '{}'::jsonb
  )->>'code',
  'success',
  'a successful post-clear commit atomically drains the residual attempt lock'
);
set local role postgres;
select ok(
  (
    select credential_status = 'active'
      and failed_attempts = 0
      and locked_until is null
    from public.staff_accounts
    where staff_id = '31000000-0000-4000-8000-000000000901'
  )
  and (
    select failed_attempts = 0 and locked_until is null
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:' || repeat('a', 64)
  ),
  'post-clear login leaves no partial lock state'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (
    select count(*)::integer
    from generate_series(1, 5)
    where public.staff_web_login_failure_v1(
      'sha256:' || repeat('d', 64),
      'credential_invalid',
      '{}'::jsonb,
      '10000000-0000-4000-8000-000000000901',
      '31000000-0000-4000-8000-000000000901',
      1,
      true
    )->>'ok' = 'true'
  ),
  5,
  'the lifecycle-clear fixture reaches the same paired temporary lock'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}',
  true
);
select is(
  public.staff_web_lifecycle_mutate_v1(
    '10000000-0000-4000-8000-000000000901',
    'staff_lockout_clear',
    jsonb_build_object(
      'staffId', '31000000-0000-4000-8000-000000000901',
      'reason', 'TASK-139 lifecycle lockout recovery fixture'
    ),
    null, null, null, null
  )->>'code',
  'success',
  'the personal lifecycle lockout clear records an authoritative active staff state'
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'sha256:' || repeat('d', 64),
    'sha256:' || repeat('f', 64),
    now() + interval '1 hour',
    '{}'::jsonb
  )->>'code',
  'success',
  'a successful lifecycle-clear commit drains its residual attempt lock'
);
set local role postgres;
select ok(
  (
    select credential_status = 'active'
      and failed_attempts = 0
      and locked_until is null
    from public.staff_accounts
    where staff_id = '31000000-0000-4000-8000-000000000901'
  )
  and (
    select failed_attempts = 0 and locked_until is null
    from public.staff_web_login_attempts
    where attempt_key_hash = 'sha256:' || repeat('d', 64)
  ),
  'lifecycle-clear login also leaves no partial lock state'
);
update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = now() - interval '1 minute',
    must_change_credential = true,
    updated_at = now()
where staff_id = '31000000-0000-4000-8000-000000000901';
insert into sync_recovery_test_state (key, value)
select
  'lockout_expired_denied_audit_before',
  jsonb_build_object('count', count(*))
from public.audit_logs
where event_key = 'staff.web.login.success'
  and target_id = '31000000-0000-4000-8000-000000000901';
insert into public.staff_web_login_attempts (
  attempt_key_hash, failed_attempts, locked_until, last_failed_at,
  metadata_redacted, updated_at
) values (
  'sha256:' || repeat('b', 64), 5, now() - interval '1 minute', now(),
  '{}'::jsonb, now()
);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'sha256:' || repeat('b', 64),
    'sha256:' || repeat('c', 64),
    now() + interval '1 hour',
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'an expired lock stays locked when another final eligibility gate denies the commit'
);
set local role postgres;
select ok(
  (
    select credential_status = 'locked'
      and failed_attempts = 5
      and locked_until <= now()
      and must_change_credential
    from public.staff_accounts
    where staff_id = '31000000-0000-4000-8000-000000000901'
  )
  and not exists (
    select 1
    from public.staff_web_sessions
    where session_token_hash = 'sha256:' || repeat('c', 64)
  )
  and (
    select count(*)
    from public.audit_logs
    where event_key = 'staff.web.login.success'
      and target_id = '31000000-0000-4000-8000-000000000901'
  ) = (
    select (value->>'count')::bigint
    from sync_recovery_test_state
    where key = 'lockout_expired_denied_audit_before'
  ),
  'a denied expired-lock commit leaves no normalized staff row, session or success audit'
);
update public.staff_accounts
set must_change_credential = false,
    updated_at = now()
where staff_id = '31000000-0000-4000-8000-000000000901';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_login_lookup_v1(
    'SYNC901A',
    'SYNC901',
    'sha256:' || repeat('b', 64)
  )->'staff'->>'credential_status',
  'active',
  'an expired temporary lock is projected as eligible only for a new verified login'
);
select is(
  public.staff_web_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'sha256:' || repeat('b', 64),
    'sha256:' || repeat('c', 64),
    now() + interval '1 hour',
    '{}'::jsonb
  )->>'code',
  'success',
  'an expired temporary lock is normalized only inside the successful commit transaction'
);
set local role postgres;
update public.staff_accounts
set credential_status = 'locked',
    failed_attempts = 5,
    locked_until = null,
    must_change_credential = false,
    updated_at = now()
where staff_id = '31000000-0000-4000-8000-000000000901';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.staff_web_login_commit_v1(
    '10000000-0000-4000-8000-000000000901',
    '31000000-0000-4000-8000-000000000901',
    1,
    'sha256:' || repeat('c', 64),
    'sha256:' || repeat('a', 64),
    now() + interval '1 hour',
    '{}'::jsonb
  )->>'code',
  'stale_identity',
  'a lock without an expiry remains fail-closed'
);

set local role postgres;
select setval(
  'public.sync_events_id_seq',
  (select last_value from sync_recovery_sequence_state),
  (select is_called from sync_recovery_sequence_state)
);
select * from finish();
rollback;
