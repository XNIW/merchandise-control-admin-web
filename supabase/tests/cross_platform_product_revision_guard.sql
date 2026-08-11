begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

select has_function(
  'public',
  'shop_catalog_update_product_if_revision_with_sync',
  array[
    'uuid', 'uuid', 'timestamp with time zone', 'text', 'text', 'text',
    'text', 'double precision', 'double precision', 'double precision',
    'uuid', 'uuid', 'text'
  ],
  'personal-account revision RPC is additive'
);

select has_function(
  'public',
  'staff_web_catalog_update_product_if_revision_v1',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'integer',
    'timestamp with time zone', 'jsonb'
  ],
  'staff revision RPC is additive'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_catalog_update_product_if_revision_with_sync(uuid,uuid,timestamptz,text,text,text,text,double precision,double precision,double precision,uuid,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.shop_catalog_update_product_if_revision_with_sync(uuid,uuid,timestamptz,text,text,text,text,double precision,double precision,double precision,uuid,uuid,text)',
    'EXECUTE'
  ),
  'personal revision RPC is authenticated-only'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.staff_web_catalog_update_product_if_revision_v1(uuid,uuid,uuid,text,integer,timestamptz,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.staff_web_catalog_update_product_if_revision_v1(uuid,uuid,uuid,text,integer,timestamptz,jsonb)',
    'EXECUTE'
  ),
  'staff revision RPC remains service-role-only'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000151',
  'authenticated',
  'authenticated',
  'cross-platform-revision@example.invalid',
  '{}'::jsonb,
  '{"display_name":"Cross-platform revision fixture"}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
);

insert into public.shops (
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values (
  '10000000-0000-4000-8000-000000000151',
  'XPLATREV151',
  'Cross-platform revision fixture',
  'active',
  '00000000-0000-4000-8000-000000000151'
);

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000151',
  'shop_owner',
  'active'
);

insert into public.shop_inventory_sources (
  shop_inventory_source_id, shop_id, owner_user_id, source_kind,
  mapping_state, verified_at
) values (
  '40000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000151',
  '00000000-0000-4000-8000-000000000151',
  'mobile_owner',
  'mapped',
  clock_timestamp()
);

insert into public.staff_accounts (
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_status, credential_version, must_change_credential
) values (
  '31000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000151',
  'XPLAT151',
  'Cross-platform revision staff fixture',
  'manager',
  'active',
  'pin',
  'test-only-non-secret-hash',
  clock_timestamp(),
  'active',
  1,
  false
);

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled
) values (
  '10000000-0000-4000-8000-000000000151',
  'manager',
  'catalog.write',
  true
);

insert into public.staff_web_sessions (
  staff_web_session_id, shop_id, staff_id, session_token_hash,
  staff_credential_version, status, issued_at, expires_at
) values (
  '34000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000151',
  '31000000-0000-4000-8000-000000000151',
  'sha256:' || repeat('e', 64),
  1,
  'active',
  clock_timestamp(),
  clock_timestamp() + interval '1 day'
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, stock_quantity,
  updated_at
) values (
  '23000000-0000-4000-8000-000000000151',
  '00000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000151',
  'XPLAT-REV-151',
  'Revision X',
  1.5,
  '2026-08-09 12:00:00+00'
), (
  '23000000-0000-4000-8000-000000000152',
  '00000000-0000-4000-8000-000000000151',
  '10000000-0000-4000-8000-000000000151',
  'XPLAT-REV-152',
  'Staff revision X',
  2.5,
  '2026-08-09 13:00:00+00'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000151","role":"authenticated"}',
  true
);

select is(
  public.shop_catalog_update_product_if_revision_with_sync(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_product_id => '23000000-0000-4000-8000-000000000151',
    p_expected_updated_at => '2026-08-09 12:00:00+00',
    p_barcode => 'XPLAT-REV-151',
    p_product_name => 'Editor B revision Y',
    p_stock_quantity => 1.5,
    p_actor_kind => 'personal_account'
  )->>'code',
  'success',
  'editor B saves revision X as revision Y'
);

set local role postgres;
create temporary table revision_guard_event_count_after_b as
select count(*)::integer as event_count
from public.sync_events
where shop_id = '10000000-0000-4000-8000-000000000151'
  and domain = 'catalog'
  and event_type = 'catalog_changed'
  and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000151"]}'::jsonb;
set local role authenticated;

select is(
  public.shop_catalog_update_product_if_revision_with_sync(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_product_id => '23000000-0000-4000-8000-000000000151',
    p_expected_updated_at => '2026-08-09 12:00:00+00',
    p_barcode => 'XPLAT-REV-151',
    p_product_name => 'Editor A stale overwrite',
    p_stock_quantity => 1.5,
    p_actor_kind => 'personal_account'
  )->>'code',
  'stale_revision',
  'editor A stale revision is rejected'
);

set local role postgres;

select is(
  (
    select product_name
    from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000151'
  ),
  'Editor B revision Y',
  'stale editor A cannot overwrite editor B'
);

select ok(
  (
    select updated_at > '2026-08-09 12:00:00+00'::timestamptz
    from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000151'
  ),
  'successful save publishes a newer updated_at revision'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where shop_id = '10000000-0000-4000-8000-000000000151'
      and event_key = 'shop.catalog.product.update.stale_revision'
      and severity = 'warning'
      and result = 'blocked'
  ),
  1,
  'stale rejection is recorded once as a blocked warning'
);

set local role authenticated;

select is(
  public.shop_catalog_update_product_if_revision_with_sync(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_product_id => '23000000-0000-4000-8000-000000000151',
    p_expected_updated_at => null,
    p_barcode => 'XPLAT-REV-151',
    p_product_name => 'Missing revision overwrite',
    p_stock_quantity => 1.5,
    p_actor_kind => 'personal_account'
  )->>'code',
  'validation_failed',
  'missing expected revision fails closed'
);

set local role postgres;

select is(
  (
    select product_name
    from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000151'
  ),
  'Editor B revision Y',
  'failed validation leaves the server version unchanged'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000151'
      and domain = 'catalog'
      and event_type = 'catalog_changed'
      and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000151"]}'::jsonb
  ),
  (select event_count from revision_guard_event_count_after_b),
  'stale and missing-revision attempts emit no additional catalog event'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.staff_web_catalog_update_product_if_revision_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_staff_id => '31000000-0000-4000-8000-000000000151',
    p_staff_web_session_id => '34000000-0000-4000-8000-000000000151',
    p_session_token_hash => 'sha256:' || repeat('e', 64),
    p_expected_credential_version => 1,
    p_expected_updated_at => '2026-08-09 13:00:00+00',
    p_payload => jsonb_build_object(
      'productId', '23000000-0000-4000-8000-000000000152',
      'barcode', 'XPLAT-REV-152',
      'productName', 'Staff editor B revision Y',
      'stockQuantity', 2.5
    )
  )->>'code',
  'success',
  'staff editor B saves revision X as revision Y'
);

set local role postgres;

select ok(
  (
    select updated_at > '2026-08-09 13:00:00+00'::timestamptz
    from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000152'
  ),
  'staff successful save publishes a newer updated_at revision'
);

create temporary table staff_revision_guard_event_count_after_b as
select count(*)::integer as event_count
from public.sync_events
where shop_id = '10000000-0000-4000-8000-000000000151'
  and domain = 'catalog'
  and event_type = 'catalog_changed'
  and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000152"]}'::jsonb;

set local role service_role;

select is(
  public.staff_web_catalog_update_product_if_revision_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_staff_id => '31000000-0000-4000-8000-000000000151',
    p_staff_web_session_id => '34000000-0000-4000-8000-000000000151',
    p_session_token_hash => 'sha256:' || repeat('e', 64),
    p_expected_credential_version => 1,
    p_expected_updated_at => '2026-08-09 13:00:00+00',
    p_payload => jsonb_build_object(
      'productId', '23000000-0000-4000-8000-000000000152',
      'barcode', 'XPLAT-REV-152',
      'productName', 'Staff editor A stale overwrite',
      'stockQuantity', 2.5
    )
  )->>'code',
  'stale_revision',
  'staff editor A stale revision is rejected'
);

set local role postgres;

select is(
  (
    select product_name
    from public.inventory_products
    where id = '23000000-0000-4000-8000-000000000152'
  ),
  'Staff editor B revision Y',
  'stale staff editor A cannot overwrite staff editor B'
);

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000151'
      and domain = 'catalog'
      and event_type = 'catalog_changed'
      and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000152"]}'::jsonb
  ),
  (select event_count from staff_revision_guard_event_count_after_b),
  'stale staff attempt emits no additional catalog event'
);

select * from finish();
rollback;
