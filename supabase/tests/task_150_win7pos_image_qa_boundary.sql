begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

select has_table(
  'app_private',
  'task_150_win7pos_image_qa_runs',
  'TASK150_CASE_01 keeps the exact QA manifest private'
);

select ok(
  not has_table_privilege('anon', 'app_private.task_150_win7pos_image_qa_runs', 'SELECT')
  and not has_table_privilege('authenticated', 'app_private.task_150_win7pos_image_qa_runs', 'SELECT')
  and has_table_privilege('service_role', 'app_private.task_150_win7pos_image_qa_runs', 'SELECT'),
  'TASK150_CASE_02 only service_role can read the private manifest'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'app_private'
      and class.relname = 'task_150_win7pos_image_qa_runs'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname in (
        'provision_capability', 'cleanup_capability', 'result_capability',
        'credential', 'session_token', 'device_token', 'signed_url'
      )
  ),
  'TASK150_CASE_03 durable state stores no raw capability credential token or URL'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.task_150_win7pos_image_qa_begin_v1(text,text,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.task_150_win7pos_image_qa_begin_v1(text,text,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.task_150_win7pos_image_qa_begin_v1(text,text,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'TASK150_CASE_04 begin RPC is service-role-only'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.task_150_win7pos_image_qa_cleanup_commit_v1(text,text,text,text,text,bigint)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.task_150_win7pos_image_qa_cleanup_commit_v1(text,text,text,text,text,bigint)',
    'EXECUTE'
  ),
  'TASK150_CASE_05 cleanup commit RPC is service-role-only'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.task_150_win7pos_image_qa_rotation_prepare_v1(text,text,text,text,text,text,uuid,uuid,uuid,uuid,integer,timestamptz)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.task_150_win7pos_image_qa_rotation_ack_v1(text,text,text,text,text,text,uuid,uuid,uuid,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.task_150_win7pos_image_qa_rotation_ack_v1(text,text,text,text,text,text,uuid,uuid,uuid,uuid,integer)',
    'EXECUTE'
  ),
  'TASK150_CASE_05A rotation RPCs are service-role-only'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'app_private'
      and class.relname = 'task_150_win7pos_image_qa_runs'
      and attribute.attname = 'pending_cleanup_capability_digest'
      and not attribute.attisdropped
  )
  and exists (
    select 1 from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'app_private'
      and class.relname = 'task_150_win7pos_image_qa_runs'
      and attribute.attname = 'bootstrap_snapshot_digest'
      and not attribute.attisdropped
  ),
  'TASK150_CASE_05B manifest stores rotation and snapshot digests only'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000150',
  'authenticated', 'authenticated', 'task150-owner@example.invalid',
  '{}', '{}', clock_timestamp(), clock_timestamp()
);

insert into public.profiles (profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000000150',
  'TASK-150 synthetic bootstrap owner',
  'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values (
  '10000000-0000-4000-8000-000000000150',
  'TASK150_BOOTSTRAP',
  'TASK-150 synthetic bootstrap shop',
  'active',
  '00000000-0000-4000-8000-000000000150'
);

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000000150',
  '10000000-0000-4000-8000-000000000150',
  'shop_owner',
  'active'
);

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status, created_by_profile_id, updated_by_profile_id
) values (
  '20000000-0000-4000-8000-000000000150',
  '10000000-0000-4000-8000-000000000150',
  'T150BOOT',
  'TASK-150 synthetic bootstrap staff',
  'pos_admin',
  'active',
  'password',
  'argon2id:task150qa:bootstrap:redacted-fixture',
  clock_timestamp(),
  clock_timestamp() + interval '4 hours',
  false,
  1,
  'active',
  '00000000-0000-4000-8000-000000000150',
  '00000000-0000-4000-8000-000000000150'
);

-- A production-like bootstrap owner already has its own active catalog
-- mapping. TASK-150 must never attempt to reuse this owner for the run shop.
insert into public.shop_inventory_sources (
  shop_inventory_source_id, shop_id, source_kind, owner_user_id, mapping_state,
  verified_at, verified_by_profile_id, created_by_profile_id
) values (
  '30000000-0000-4000-8000-000000000150',
  '10000000-0000-4000-8000-000000000150',
  'mobile_owner',
  '00000000-0000-4000-8000-000000000150',
  'mapped',
  clock_timestamp(),
  '00000000-0000-4000-8000-000000000150',
  '00000000-0000-4000-8000-000000000150'
);

create temporary table task150_results (
  result_label text primary key,
  result jsonb not null
) on commit drop;
grant select, insert on table task150_results to service_role;

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

insert into task150_results values (
  'begin',
  public.task_150_win7pos_image_qa_begin_v1(
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    repeat('d', 64),
    repeat('e', 64),
    repeat('f', 64),
    repeat('1', 64),
    '10000000-0000-4000-8000-000000000150',
    '20000000-0000-4000-8000-000000000150',
    'asus-product-image-phase-b-fixture-v1'
  )
);

insert into task150_results values (
  'begin_replay',
  public.task_150_win7pos_image_qa_begin_v1(
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
    repeat('e', 64), repeat('f', 64), repeat('1', 64),
    '10000000-0000-4000-8000-000000000150',
    '20000000-0000-4000-8000-000000000150',
    'asus-product-image-phase-b-fixture-v1'
  )
);

set local role postgres;

select is(
  (select result->>'code' from task150_results where result_label = 'begin'),
  'armed',
  'TASK150_CASE_06 begin durably arms an exact manifest before fixture DML'
);

select is(
  (select result->>'code' from task150_results where result_label = 'begin_replay'),
  'begin_replayed',
  'TASK150_CASE_07 exact begin replay is receipt-only and performs no second DML'
);

select is(
  (select count(*)::integer from app_private.task_150_win7pos_image_qa_runs),
  1,
  'TASK150_CASE_08 exact begin replay leaves one durable run row'
);

select ok(
  (select run_shop_id is not null
          and run_staff_id is not null
          and run_mapping_id is not null
          and run_product_id is not null
   from app_private.task_150_win7pos_image_qa_runs
   where run_hmac = repeat('a', 64)),
  'TASK150_CASE_08A exact fixture IDs are durable before provisioning DML'
);

select ok(
  (select bootstrap_snapshot_digest ~ '^[0-9a-f]{64}$'
   from app_private.task_150_win7pos_image_qa_runs
   where run_hmac = repeat('a', 64)),
  'TASK150_CASE_08B bootstrap shared snapshot is a durable digest'
);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

insert into task150_results values (
  'wrong_capability',
  public.task_150_win7pos_image_qa_provision_admit_v1(
    repeat('a', 64), repeat('b', 64), repeat('9', 64), repeat('2', 64),
    repeat('8', 64)
  )
);

insert into task150_results values (
  'provision_admit',
  public.task_150_win7pos_image_qa_provision_admit_v1(
    repeat('a', 64), repeat('b', 64), repeat('e', 64), repeat('2', 64),
    repeat('8', 64)
  )
);

insert into task150_results values (
  'provision',
  public.task_150_win7pos_image_qa_provision_v1(
    repeat('a', 64), repeat('b', 64), repeat('e', 64), repeat('2', 64),
    repeat('8', 64),
    'argon2id:task150qa:run:redacted-fixture'
  )
);

insert into task150_results values (
  'provision_replay',
  public.task_150_win7pos_image_qa_provision_v1(
    repeat('a', 64), repeat('b', 64), repeat('e', 64), repeat('2', 64),
    repeat('8', 64),
    'argon2id:task150qa:different-but-never-used'
  )
);

insert into task150_results values (
  'cleanup_before_fence',
  public.task_150_win7pos_image_qa_cleanup_acquire_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('4', 64)
  )
);

set local role postgres;

select is(
  (select result->>'code' from task150_results where result_label = 'wrong_capability'),
  'capability_denied',
  'TASK150_CASE_09 guessed provision capability fails before DML'
);

select is(
  (select result->>'code' from task150_results where result_label = 'provision_admit'),
  'provision_admitted',
  'TASK150_CASE_09A valid provision capability admits the expensive KDF once'
);

select is(
  (select result->>'code' from task150_results where result_label = 'provision'),
  'provisioned',
  'TASK150_CASE_10 exact template provisions one isolated shop staff and product'
);

select ok(
  (select result->>'code' = 'provision_replayed'
          and result->>'credentialsReissued' = 'false'
   from task150_results where result_label = 'provision_replay'),
  'TASK150_CASE_11 response-loss provision replay creates no actor and reissues no credential'
);

select is(
  (select count(*)::integer
   from public.shops shop
   join app_private.task_150_win7pos_image_qa_runs run on run.run_shop_id = shop.shop_id
   where run.run_hmac = repeat('a', 64)),
  1,
  'TASK150_CASE_12 provision replay preserves one exact shop manifest'
);

select is(
  (select result->>'code' from task150_results where result_label = 'cleanup_before_fence'),
  'cleanup_fence_active',
  'TASK150_CASE_13 cleanup fails closed while the authoritative 2h20 fence is active'
);

update app_private.task_150_win7pos_image_qa_runs
set created_at = clock_timestamp() - interval '3 hours',
    safety_fence_until = clock_timestamp() - interval '1 second',
    cleanup_capability_expires_at = clock_timestamp() + interval '20 minutes'
where run_hmac = repeat('a', 64);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

insert into task150_results values (
  'cleanup_insufficient_coverage',
  public.task_150_win7pos_image_qa_cleanup_acquire_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('4', 64)
  )
);

set local role postgres;

select is(
  (select result->>'code'
   from task150_results where result_label = 'cleanup_insufficient_coverage'),
  'cleanup_capability_coverage_insufficient',
  'TASK150_CASE_13A cleanup rejects a capability that cannot outlive its lease'
);

update app_private.task_150_win7pos_image_qa_runs
set cleanup_capability_expires_at = cleanup_capability_issued_at + interval '3 hours'
where run_hmac = repeat('a', 64);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

insert into task150_results values (
  'cleanup_acquire',
  public.task_150_win7pos_image_qa_cleanup_acquire_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('4', 64)
  )
);

set local role postgres;
update app_private.task_150_win7pos_image_qa_runs
set cleanup_lease_expires_at = clock_timestamp() - interval '1 second'
where run_hmac = repeat('a', 64);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

insert into task150_results values (
  'cleanup_reacquire',
  public.task_150_win7pos_image_qa_cleanup_acquire_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('7', 64)
  )
);

insert into task150_results
select
  'stale_cleanup_commit',
  public.task_150_win7pos_image_qa_cleanup_commit_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('4', 64), (result->>'generation')::bigint
  )
from task150_results
where result_label = 'cleanup_acquire';

insert into task150_results
select
  'cleanup_commit',
  public.task_150_win7pos_image_qa_cleanup_commit_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('7', 64), (result->>'generation')::bigint
  )
from task150_results
where result_label = 'cleanup_reacquire';

insert into task150_results values (
  'result',
  public.task_150_win7pos_image_qa_result_v1(
    repeat('a', 64), repeat('b', 64), repeat('1', 64)
  )
);

insert into task150_results values (
  'old_cleanup_replay',
  public.task_150_win7pos_image_qa_cleanup_acquire_v1(
    repeat('a', 64), repeat('b', 64), repeat('f', 64), repeat('3', 64),
    repeat('6', 64)
  )
);

set local role postgres;

select ok(
  (select result->>'code' = 'cleanup_acquired'
          and (result->>'generation')::integer = 1
   from task150_results where result_label = 'cleanup_acquire'),
  'TASK150_CASE_14 cleanup acquire issues generation one under a bounded lease'
);

select ok(
  (select result->>'code' = 'cleanup_acquired'
          and (result->>'generation')::integer = 2
   from task150_results where result_label = 'cleanup_reacquire'),
  'TASK150_CASE_14A expired no-I/O lease is recovered under a new generation'
);

select is(
  (select result->>'code' from task150_results where result_label = 'stale_cleanup_commit'),
  'cleanup_fence_lost',
  'TASK150_CASE_14B suspended stale worker cannot commit after takeover'
);

select is(
  (select result->>'code' from task150_results where result_label = 'cleanup_commit'),
  'cleanup_complete',
  'TASK150_CASE_15 fenced cleanup commits one terminal receipt'
);

select ok(
  (select result->>'state' = 'terminal'
          and result->'receipt'->>'receiptHmac' ~ '^[0-9a-f]{64}$'
          and result->'receipt'->>'receiptBindingVersion'
            = 'cleanup-capability-digest-hmac-sha256-v1'
   from task150_results where result_label = 'result'),
  'TASK150_CASE_16 lost cleanup response recovers the same durable receipt read-only'
);

select is(
  (select result->>'code' from task150_results where result_label = 'old_cleanup_replay'),
  'capability_denied',
  'TASK150_CASE_17 consumed cleanup capability cannot mutate again'
);

select ok(
  not exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    join public.inventory_products product on product.id = run.run_product_id
    where run.run_hmac = repeat('a', 64)
  )
  and not exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    join public.staff_accounts staff on staff.staff_id = run.run_staff_id
    where run.run_hmac = repeat('a', 64)
      and staff.status <> 'archived'
  )
  and exists (
    select 1
    from app_private.task_150_win7pos_image_qa_runs run
    join public.shops shop on shop.shop_id = run.run_shop_id
    where run.run_hmac = repeat('a', 64)
      and shop.shop_status = 'archived'
      and shop.archived_by_profile_id = run.bootstrap_profile_id
      and shop.created_by_profile_id is null
      and shop.status_changed_by_profile_id is null
  ),
  'TASK150_CASE_18 exact product is gone, run-owned staff is inactive, and archive actor is auditable'
);

select ok(
  (select cleanup_receipt->'counts'->>'products' = '1'
          and cleanup_receipt->>'sharedSnapshotUnchanged' = 'true'
          and cleanup_receipt->>'immutableAuditPreserved' = 'true'
          and cleanup_receipt->>'cleanupCapabilityRevoked' = 'true'
   from app_private.task_150_win7pos_image_qa_runs
   where run_hmac = repeat('a', 64)),
  'TASK150_CASE_19 terminal receipt is count-only and proves capability revocation'
);

select is(
  (select count(*)::integer
   from public.audit_logs
   where target_type = 'qa_run'
     and target_id = repeat('a', 64)
     and event_key = 'pos.catalog.product_image.task150_fixture_cleanup'),
  1,
  'TASK150_CASE_20 immutable cleanup audit is preserved exactly once'
);

select throws_ok(
  $$update app_private.task_150_win7pos_image_qa_runs
    set cleanup_receipt = cleanup_receipt || '{"tampered":true}'::jsonb
    where run_hmac = repeat('a', 64)$$,
  '55000',
  'TASK-150 terminal receipt is immutable',
  'TASK150_CASE_21 terminal receipt rejects post-commit tampering'
);

select * from finish();
rollback;
