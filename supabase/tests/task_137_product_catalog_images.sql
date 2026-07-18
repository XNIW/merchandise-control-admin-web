begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(76);

select has_table(
  'public',
  'inventory_product_image_versions',
  'TASK-137 lifecycle table exists'
);
select has_column(
  'public',
  'inventory_products',
  'primary_image_version_id',
  'TASK-137 product version reference exists'
);
select has_column(
  'public',
  'inventory_products',
  'primary_image_updated_at',
  'TASK-137 product image timestamp exists'
);
select has_function(
  'public',
  'product_image_create_intent',
  array['uuid','text','uuid','uuid','text','integer','integer','integer','text','integer','integer','integer'],
  'TASK-137 intent RPC exists'
);
select has_function(
  'public',
  'product_image_finalize',
  array['uuid','text','uuid','uuid','uuid','text','integer','integer','integer','text','integer','integer','integer'],
  'TASK-137 finalize RPC exists'
);
select has_function(
  'public',
  'product_image_prepare_cleanup',
  array['uuid','uuid','uuid'],
  'TASK-137 lifecycle cleanup preparation RPC exists'
);
select has_function(
  'public',
  'product_image_prepare_orphan_cleanup',
  array['uuid','text'],
  'TASK-137 orphan cleanup preparation RPC exists'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'product-images' and name = 'product-images' and public = false
  ),
  'product-images bucket is private'
);
select is(
  (select file_size_limit::bigint from storage.buckets where id = 'product-images'),
  1048576::bigint,
  'product-images bucket enforces one MiB per object'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'product-images'),
  array['image/jpeg']::text[],
  'product-images bucket allows JPEG only'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_product_image_versions', 'SELECT'),
  'authenticated cannot read lifecycle rows directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.product_image_create_intent(uuid,text,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute server-only intent RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_create_intent(uuid,text,uuid,uuid,text,integer,integer,integer,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'service_role can execute server-only intent RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.product_image_prepare_cleanup(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute cleanup preparation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.product_image_prepare_cleanup(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute cleanup preparation'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000137','authenticated','authenticated','task137-owner@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000237','authenticated','authenticated','task137-manager@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000337','authenticated','authenticated','task137-viewer@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000437','authenticated','authenticated','task137-revoked@example.invalid','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000537','authenticated','authenticated','task137-platform@example.invalid','{}','{}',now(),now());

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000000137','TASK-137 Owner','active'),
  ('00000000-0000-4000-8000-000000000237','TASK-137 Manager','active'),
  ('00000000-0000-4000-8000-000000000337','TASK-137 Viewer','active'),
  ('00000000-0000-4000-8000-000000000437','TASK-137 Revoked','active'),
  ('00000000-0000-4000-8000-000000000537','TASK-137 Platform','active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000000137','TASK137A','TASK-137 Shop A','active'),
  ('10000000-0000-4000-8000-000000000237','TASK137B','TASK-137 Shop B','active');

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status, suspended_at
)
values
  ('00000000-0000-4000-8000-000000000137','10000000-0000-4000-8000-000000000137','shop_owner','active',null),
  ('00000000-0000-4000-8000-000000000237','10000000-0000-4000-8000-000000000137','shop_manager','active',null),
  ('00000000-0000-4000-8000-000000000237','10000000-0000-4000-8000-000000000237','shop_manager','active',null),
  ('00000000-0000-4000-8000-000000000337','10000000-0000-4000-8000-000000000137','viewer','active',null),
  ('00000000-0000-4000-8000-000000000437','10000000-0000-4000-8000-000000000137','shop_manager','suspended',now());

insert into public.platform_admins (profile_id, status)
values ('00000000-0000-4000-8000-000000000537','active');

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name
)
values (
  '20000000-0000-4000-8000-000000000137',
  '00000000-0000-4000-8000-000000000137',
  '10000000-0000-4000-8000-000000000137',
  'TASK137-IMAGE',
  'TASK-137 image product'
);

select ok(
  app_private.product_image_actor_can_write(
    '00000000-0000-4000-8000-000000000137',
    '10000000-0000-4000-8000-000000000137',
    'personal_account'
  ),
  'active owner can write images'
);
select ok(
  app_private.product_image_actor_can_write(
    '00000000-0000-4000-8000-000000000237',
    '10000000-0000-4000-8000-000000000137',
    'personal_account'
  ),
  'active manager can write images'
);
select ok(
  not app_private.product_image_actor_can_write(
    '00000000-0000-4000-8000-000000000337',
    '10000000-0000-4000-8000-000000000137',
    'personal_account'
  ),
  'viewer cannot write images'
);
select ok(
  not app_private.product_image_actor_can_write(
    '00000000-0000-4000-8000-000000000437',
    '10000000-0000-4000-8000-000000000137',
    'personal_account'
  ),
  'suspended manager cannot write images'
);
select ok(
  app_private.product_image_actor_can_write(
    '00000000-0000-4000-8000-000000000537',
    '10000000-0000-4000-8000-000000000137',
    'platform_admin'
  ),
  'active platform admin is authorized only by server-side actor kind'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000137","role":"authenticated"}',
  true
);
select throws_ok(
  $$
    update public.inventory_products
    set primary_image_version_id = '90000000-0000-4000-8000-000000000137',
        primary_image_updated_at = now()
    where id = '20000000-0000-4000-8000-000000000137'
  $$,
  '42501',
  'product_image_reference_is_server_managed',
  'authenticated product writes cannot set image references'
);
select lives_ok(
  $$
    update public.inventory_products
    set product_name = 'TASK-137 image product updated'
    where id = '20000000-0000-4000-8000-000000000137'
  $$,
  'ordinary authorized product updates remain available'
);
select throws_ok(
  $$ select count(*) from public.inventory_product_image_versions $$,
  '42501',
  null,
  'authenticated lifecycle query is denied in practice'
);

set local role postgres;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table task137_state (
  key text primary key,
  value jsonb not null
);

insert into task137_state (key, value)
select 'intent1', public.product_image_create_intent(
  '00000000-0000-4000-8000-000000000137',
  'personal_account',
  '10000000-0000-4000-8000-000000000137',
  '20000000-0000-4000-8000-000000000137',
  repeat('a', 64), 700000, 1600, 1200,
  repeat('b', 64), 90000, 384, 288
);

select is(
  (select value->>'status' from task137_state where key = 'intent1'),
  'upload_required',
  'owner intent creates an upload-required version'
);
select is(
  (select value->>'main_path' from task137_state where key = 'intent1'),
  'shops/10000000-0000-4000-8000-000000000137/products/20000000-0000-4000-8000-000000000137/primary/'
    || (select value->>'version_id' from task137_state where key = 'intent1')
    || '/main.jpg',
  'server chooses the exact opaque main path'
);
select is(
  (
    select status
    from public.inventory_product_image_versions
    where id = (select (value->>'version_id')::uuid from task137_state where key = 'intent1')
  ),
  'pending',
  'intent lifecycle starts pending'
);

select is(
  public.product_image_create_intent(
    '00000000-0000-4000-8000-000000000337','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288
  )->>'code',
  'permission_denied',
  'viewer intent is denied'
);
select is(
  public.product_image_create_intent(
    '00000000-0000-4000-8000-000000000237','personal_account',
    '10000000-0000-4000-8000-000000000237','20000000-0000-4000-8000-000000000137',
    repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288
  )->>'code',
  'not_found',
  'cross-shop intent cannot address the product'
);
select is(
  public.product_image_create_intent(
    '00000000-0000-4000-8000-000000000437','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288
  )->>'code',
  'permission_denied',
  'suspended manager intent is denied'
);

insert into task137_state (key, value)
select 'final1', public.product_image_finalize(
  '00000000-0000-4000-8000-000000000137','personal_account',
  '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
  (select (value->>'version_id')::uuid from task137_state where key = 'intent1'),
  repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288
);

select is(
  (select value->>'status' from task137_state where key = 'final1'),
  'finalized',
  'verified version finalizes atomically'
);
select is(
  (
    select primary_image_version_id
    from public.inventory_products
    where id = '20000000-0000-4000-8000-000000000137'
  ),
  (select (value->>'version_id')::uuid from task137_state where key = 'intent1'),
  'product points at the finalized version'
);
select is(
  (
    select count(*)::integer
    from public.sync_events
    where source = 'product_image_api'
      and entity_ids @> '{"product_ids":["20000000-0000-4000-8000-000000000137"]}'::jsonb
  ),
  1,
  'first finalize emits exactly one catalog event'
);
select is(
  public.product_image_finalize(
    '00000000-0000-4000-8000-000000000137','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent1'),
    repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288
  )->>'status',
  'already_finalized',
  'duplicate finalize is idempotent'
);
select is(
  (select count(*)::integer from public.sync_events where source = 'product_image_api'),
  1,
  'duplicate finalize does not duplicate the event'
);

insert into task137_state (key, value)
select 'noop', public.product_image_create_intent(
  '00000000-0000-4000-8000-000000000137','personal_account',
  '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
  repeat('a',64),700000,1600,1200,repeat('b',64),90000,384,288
);
select is(
  (select value->>'status' from task137_state where key = 'noop'),
  'noop',
  'same checksums produce a no-op intent'
);
select is(
  (select count(*)::integer from public.inventory_product_image_versions),
  1,
  'no-op intent creates no lifecycle row'
);

insert into task137_state (key, value)
select 'read1', public.product_image_resolve_read_paths(
  '00000000-0000-4000-8000-000000000337','personal_account',
  '10000000-0000-4000-8000-000000000137',
  jsonb_build_array(jsonb_build_object(
    'productId','20000000-0000-4000-8000-000000000137',
    'versionId',(select value->>'version_id' from task137_state where key = 'intent1'),
    'variant','thumb'
  ))
);
select is(
  (select value->>'code' from task137_state where key = 'read1'),
  'success',
  'viewer can resolve a current private read path through the server RPC'
);
select is(
  (select value->'items'->0->>'code' from task137_state where key = 'read1'),
  'success',
  'current viewer read item resolves successfully'
);

select set_config(
  'task137.main_path',
  (select value->>'main_path' from task137_state where key = 'intent1'),
  true
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000337","role":"authenticated"}',
  true
);
-- app_private has no direct USAGE for authenticated by design. Evaluate the
-- policy helper as postgres while preserving the viewer JWT claims that the
-- helper reads through auth.uid().
set local role postgres;
select ok(
  app_private.can_read_product_image_object(current_setting('task137.main_path')),
  'active viewer can read only the current exact object path'
);
select ok(
  not app_private.can_read_product_image_object(
    'shops/10000000-0000-4000-8000-000000000237/products/20000000-0000-4000-8000-000000000137/primary/90000000-0000-4000-8000-000000000137/main.jpg'
  ),
  'cross-shop fabricated object path is denied'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into task137_state (key, value)
select 'intent2', public.product_image_create_intent(
  '00000000-0000-4000-8000-000000000237','personal_account',
  '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
  repeat('c',64),710000,1600,1200,repeat('d',64),88000,384,288
);
select is(
  (select value->>'status' from task137_state where key = 'intent2'),
  'upload_required',
  'manager can create a replacement intent'
);

insert into task137_state (key, value)
select 'final2', public.product_image_finalize(
  '00000000-0000-4000-8000-000000000237','personal_account',
  '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
  (select (value->>'version_id')::uuid from task137_state where key = 'intent2'),
  repeat('c',64),710000,1600,1200,repeat('d',64),88000,384,288
);
select is(
  (select value->>'status' from task137_state where key = 'final2'),
  'finalized',
  'replacement finalizes successfully'
);
select is(
  (
    select status || ':' || cleanup_status
    from public.inventory_product_image_versions
    where id = (select (value->>'version_id')::uuid from task137_state where key = 'intent1')
  ),
  'superseded:pending',
  'previous version becomes cleanup-eligible superseded state'
);
select is(
  (
    select primary_image_version_id
    from public.inventory_products
    where id = '20000000-0000-4000-8000-000000000137'
  ),
  (select (value->>'version_id')::uuid from task137_state where key = 'intent2'),
  'product switches to the replacement version'
);
select is(
  (select count(*)::integer from public.sync_events where source = 'product_image_api'),
  2,
  'replacement emits one additional event'
);
select is(
  (
    select count(*)::integer
    from public.inventory_product_image_versions
    where product_id = '20000000-0000-4000-8000-000000000137'
      and status = 'ready'
  ),
  1,
  'only one ready version exists after replacement'
);

select is(
  public.product_image_prepare_cleanup(
    '10000000-0000-4000-8000-000000000137',
    '20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent2')
  )->>'code',
  'invalid_state_or_not_found',
  'cleanup preparation cannot target the current ready version'
);
select is(
  public.product_image_record_cleanup(
    '00000000-0000-4000-8000-000000000137','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent2'),
    true,null,'admin_script'
  )->>'code',
  'invalid_state_or_not_found',
  'cleanup recording cannot mutate the current ready version'
);
select is(
  public.product_image_prepare_cleanup(
    '10000000-0000-4000-8000-000000000237',
    '20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent1')
  )->>'code',
  'invalid_state_or_not_found',
  'cleanup preparation is fail-closed across shops'
);

select is(
  public.product_image_remove(
    '00000000-0000-4000-8000-000000000137','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent1')
  )->>'code',
  'stale_conflict',
  'stale remove cannot clear a replacement'
);
select is(
  (
    select primary_image_version_id
    from public.inventory_products
    where id = '20000000-0000-4000-8000-000000000137'
  ),
  (select (value->>'version_id')::uuid from task137_state where key = 'intent2'),
  'stale remove preserves the current version'
);

insert into task137_state (key, value)
select 'remove2', public.product_image_remove(
  '00000000-0000-4000-8000-000000000137','personal_account',
  '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
  (select (value->>'version_id')::uuid from task137_state where key = 'intent2')
);
select is(
  (select value->>'status' from task137_state where key = 'remove2'),
  'removed',
  'current version removes atomically'
);
select is(
  (
    select primary_image_version_id
    from public.inventory_products
    where id = '20000000-0000-4000-8000-000000000137'
  ),
  null::uuid,
  'remove clears the product current version'
);
select is(
  (select count(*)::integer from public.sync_events where source = 'product_image_api'),
  3,
  'remove emits one additional event'
);
select is(
  public.product_image_remove(
    '00000000-0000-4000-8000-000000000137','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent2')
  )->>'status',
  'already_removed',
  'duplicate remove is idempotent'
);
select is(
  (select count(*)::integer from public.sync_events where source = 'product_image_api'),
  3,
  'duplicate remove does not duplicate the event'
);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000337','personal_account',
    '10000000-0000-4000-8000-000000000137',
    jsonb_build_array(jsonb_build_object(
      'productId','20000000-0000-4000-8000-000000000137',
      'versionId',(select value->>'version_id' from task137_state where key = 'intent2'),
      'variant','main'
    ))
  )->'items'->0->>'code',
  'not_found',
  'removed version no longer resolves a read path'
);
select is(
  public.product_image_resolve_read_paths(
    '00000000-0000-4000-8000-000000000437','personal_account',
    '10000000-0000-4000-8000-000000000137',
    jsonb_build_array(jsonb_build_object(
      'productId','20000000-0000-4000-8000-000000000137',
      'versionId',(select value->>'version_id' from task137_state where key = 'intent2'),
      'variant','main'
    ))
  )->>'code',
  'permission_denied',
  'suspended member cannot resolve read paths'
);

update public.inventory_product_image_versions
set removed_at = now() - interval '25 hours',
    cleanup_updated_at = now() - interval '25 hours'
where id = (select (value->>'version_id')::uuid from task137_state where key = 'intent2');

insert into task137_state (key, value)
select 'prepare_removed2', public.product_image_prepare_cleanup(
  '10000000-0000-4000-8000-000000000137',
  '20000000-0000-4000-8000-000000000137',
  (select (value->>'version_id')::uuid from task137_state where key = 'intent2')
);
select is(
  (select value->>'code' from task137_state where key = 'prepare_removed2'),
  'cleanup_prepared',
  'aged removed version is prepared for cleanup after the grace period'
);
select is(
  (select value->>'main_path' from task137_state where key = 'prepare_removed2'),
  'shops/10000000-0000-4000-8000-000000000137/products/20000000-0000-4000-8000-000000000137/primary/'
    || (select value->>'version_id' from task137_state where key = 'intent2')
    || '/main.jpg',
  'cleanup preparation returns only the canonical scoped main path'
);

select is(
  public.product_image_record_cleanup(
    '00000000-0000-4000-8000-000000000137','personal_account',
    '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent2'),
    true,null,'api_remove'
  )->>'code',
  'cleanup_complete',
  'successful object deletion is recorded idempotently'
);
select is(
  (
    select cleanup_status
    from public.inventory_product_image_versions
    where id = (select (value->>'version_id')::uuid from task137_state where key = 'intent2')
  ),
  'complete',
  'removed lifecycle row records cleanup complete'
);

insert into task137_state (key, value)
select 'intent3', public.product_image_create_intent(
  '00000000-0000-4000-8000-000000000137','personal_account',
  '10000000-0000-4000-8000-000000000137','20000000-0000-4000-8000-000000000137',
  repeat('e',64),720000,1600,1200,repeat('f',64),87000,384,288
);
select is(
  (select value->>'status' from task137_state where key = 'intent3'),
  'upload_required',
  'cleanup fixture creates a pending upload version'
);
update public.inventory_product_image_versions
set created_at = now() - interval '27 hours',
    expires_at = now() - interval '25 hours',
    cleanup_updated_at = now() - interval '25 hours'
where id = (select (value->>'version_id')::uuid from task137_state where key = 'intent3');

insert into task137_state (key, value)
select 'prepare_pending3', public.product_image_prepare_cleanup(
  '10000000-0000-4000-8000-000000000137',
  '20000000-0000-4000-8000-000000000137',
  (select (value->>'version_id')::uuid from task137_state where key = 'intent3')
);
select is(
  (select value->>'code' from task137_state where key = 'prepare_pending3'),
  'cleanup_prepared',
  'expired pending version transitions before cleanup preparation'
);
select is(
  (
    select status || ':' || cleanup_status
    from public.inventory_product_image_versions
    where id = (select (value->>'version_id')::uuid from task137_state where key = 'intent3')
  ),
  'failed:pending',
  'expired pending lifecycle is persisted as failed and cleanup-pending'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000137'
      and event_key = 'shop.product_image.cleanup_expired_pending'
      and result = 'success'
  ),
  'expired pending cleanup transition is audit logged'
);

insert into task137_state (key, value)
select 'prepare_orphan', public.product_image_prepare_orphan_cleanup(
  '10000000-0000-4000-8000-000000000137',
  'shops/10000000-0000-4000-8000-000000000137/products/20000000-0000-4000-8000-000000000137/primary/70000000-0000-4000-8000-000000000137/main.jpg'
);
select is(
  (select value->>'code' from task137_state where key = 'prepare_orphan'),
  'orphan_cleanup_prepared',
  'canonical object without lifecycle row is prepared as an orphan'
);
select is(
  public.product_image_prepare_orphan_cleanup(
    '10000000-0000-4000-8000-000000000137',
    'shops/10000000-0000-4000-8000-000000000137/products/not-a-uuid/primary/70000000-0000-4000-8000-000000000137/main.jpg'
  )->>'code',
  'path_contract_invalid',
  'orphan preparation rejects malformed canonical identifiers'
);
select is(
  public.product_image_prepare_orphan_cleanup(
    '10000000-0000-4000-8000-000000000137',
    'shops/10000000-0000-4000-8000-000000000237/products/20000000-0000-4000-8000-000000000137/primary/70000000-0000-4000-8000-000000000137/main.jpg'
  )->>'code',
  'path_contract_invalid',
  'orphan preparation rejects a cross-shop object path'
);
select is(
  public.product_image_record_orphan_cleanup(
    '10000000-0000-4000-8000-000000000137',
    '20000000-0000-4000-8000-000000000137',
    '70000000-0000-4000-8000-000000000137',
    'main',true,12345,null
  )->>'code',
  'orphan_cleanup_complete',
  'successful orphan deletion is recorded without persisting its path'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000137","role":"authenticated"}',
  true
);
select is(
  public.product_image_prepare_cleanup(
    '10000000-0000-4000-8000-000000000137',
    '20000000-0000-4000-8000-000000000137',
    (select (value->>'version_id')::uuid from task137_state where key = 'intent3')
  )->>'code',
  'permission_denied',
  'cleanup preparation rejects non-service JWT roles at runtime'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  exists (
    select 1 from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000137'
      and event_key = 'shop.product_image.replaced'
      and result = 'success'
  ),
  'replace is audit logged'
);
select ok(
  not exists (
    select 1 from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000137'
      and metadata_redacted ?| array[
        'path','main_path','thumb_path','token','signed_url','upload_url',
        'image_bytes','exif','gps','local_path'
      ]
  ),
  'image audit metadata contains no forbidden sensitive fields'
);
select ok(
  not exists (
    select 1 from public.sync_events
    where source = 'product_image_api'
      and (
        metadata::text ~* '(path|token|signed.?url|shops/)'
        or entity_ids ?| array['main_path','thumb_path','token','signed_url']
      )
  ),
  'image sync events contain only product IDs and redacted metadata'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'task137_product_images_private_read'
      and cmd = 'SELECT'
  ),
  1,
  'Storage has one TASK-137 authenticated read policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'task137_product_images%'
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
  ),
  0,
  'TASK-137 grants no authenticated Storage write policy'
);

select * from finish();
rollback;
