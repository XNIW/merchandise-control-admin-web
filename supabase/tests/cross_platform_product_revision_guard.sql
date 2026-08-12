begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

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

select has_function(
  'public',
  'shop_catalog_set_product_archived_if_revision_with_sync',
  array['uuid', 'uuid', 'timestamp with time zone', 'boolean', 'text', 'text'],
  'personal-account archive revision RPC is additive'
);

select has_function(
  'public',
  'staff_web_catalog_set_product_archived_if_revision_v1',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'integer',
    'timestamp with time zone', 'boolean', 'jsonb'
  ],
  'staff archive revision RPC is additive'
);

select has_function(
  'public',
  'admin_catalog_import_receipt_lookup_v1',
  array['uuid', 'text', 'uuid', 'text', 'text'],
  'catalog import receipt lookup RPC is additive'
);

select has_function(
  'public',
  'admin_catalog_import_receipt_claim_v1',
  array['uuid', 'text', 'uuid', 'text', 'text'],
  'catalog import receipt claim RPC is additive'
);

select has_function(
  'public',
  'admin_catalog_import_receipt_complete_v1',
  array['uuid', 'uuid', 'text', 'jsonb'],
  'catalog import receipt completion RPC is additive'
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

select ok(
  has_function_privilege(
    'authenticated',
    'public.shop_catalog_set_product_archived_if_revision_with_sync(uuid,uuid,timestamptz,boolean,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.shop_catalog_set_product_archived_if_revision_with_sync(uuid,uuid,timestamptz,boolean,text,text)',
    'EXECUTE'
  ),
  'personal archive revision RPC is authenticated-only'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.staff_web_catalog_set_product_archived_if_revision_v1(uuid,uuid,uuid,text,integer,timestamptz,boolean,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.staff_web_catalog_set_product_archived_if_revision_v1(uuid,uuid,uuid,text,integer,timestamptz,boolean,jsonb)',
    'EXECUTE'
  ),
  'staff archive revision RPC remains service-role-only'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_catalog_import_receipt_lookup_v1(uuid,text,uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.admin_catalog_import_receipt_claim_v1(uuid,text,uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.admin_catalog_import_receipt_complete_v1(uuid,uuid,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_catalog_import_receipt_lookup_v1(uuid,text,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_catalog_import_receipt_claim_v1(uuid,text,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.admin_catalog_import_receipt_complete_v1(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'catalog import receipt RPCs are service-role-only'
);

select ok(
  not has_table_privilege(
    'service_role',
    'app_private.catalog_import_receipts',
    'SELECT'
  ),
  'service role cannot read import receipt rows directly'
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

set local role postgres;
create temporary table personal_archive_revision_before as
select
  product.updated_at,
  (
    select count(*)::integer
    from public.sync_events event
    where event.shop_id = product.shop_id
      and event.domain = 'catalog'
      and event.entity_ids @> jsonb_build_object(
        'product_ids', jsonb_build_array(product.id::text)
      )
  ) as event_count
from public.inventory_products product
where product.id = '23000000-0000-4000-8000-000000000151';
grant select on personal_archive_revision_before to authenticated;
set local role authenticated;

select is(
  public.shop_catalog_set_product_archived_if_revision_with_sync(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_product_id => '23000000-0000-4000-8000-000000000151',
    p_expected_updated_at => (
      select updated_at from personal_archive_revision_before
    ),
    p_archived => true,
    p_reason => 'cross-platform revision test',
    p_actor_kind => 'personal_account'
  )->>'code',
  'success',
  'archive succeeds against the rendered revision'
);

set local role postgres;
create temporary table personal_archive_revision_after as
select updated_at
from public.inventory_products
where id = '23000000-0000-4000-8000-000000000151';
grant select on personal_archive_revision_after to authenticated;

select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000151'
      and domain = 'catalog'
      and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000151"]}'::jsonb
  ),
  (select event_count + 1 from personal_archive_revision_before),
  'successful archive emits exactly one additional catalog event'
);

set local role authenticated;
select is(
  public.shop_catalog_set_product_archived_if_revision_with_sync(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_product_id => '23000000-0000-4000-8000-000000000151',
    p_expected_updated_at => (
      select updated_at from personal_archive_revision_before
    ),
    p_archived => false,
    p_reason => 'stale restore test',
    p_actor_kind => 'personal_account'
  )->>'code',
  'stale_revision',
  'restore rejects the pre-archive revision'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000151'
      and domain = 'catalog'
      and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000151"]}'::jsonb
  ),
  (select event_count + 1 from personal_archive_revision_before),
  'stale restore emits no catalog event'
);

set local role authenticated;
select is(
  public.shop_catalog_set_product_archived_if_revision_with_sync(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_product_id => '23000000-0000-4000-8000-000000000151',
    p_expected_updated_at => (
      select updated_at from personal_archive_revision_after
    ),
    p_archived => false,
    p_reason => 'cross-platform revision test',
    p_actor_kind => 'personal_account'
  )->>'code',
  'success',
  'restore succeeds against the rendered archived revision'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000000151'
      and domain = 'catalog'
      and entity_ids @> '{"product_ids":["23000000-0000-4000-8000-000000000151"]}'::jsonb
  ),
  (select event_count + 2 from personal_archive_revision_before),
  'successful restore emits exactly one additional catalog event'
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

set local role service_role;
create temporary table catalog_import_claim as
select public.admin_catalog_import_receipt_claim_v1(
  p_shop_id => '10000000-0000-4000-8000-000000000151',
  p_actor_kind => 'personal_account',
  p_actor_id => '00000000-0000-4000-8000-000000000151',
  p_request_key => repeat('a', 64),
  p_request_fingerprint => repeat('a', 64)
) as payload;

select is(
  (select payload->>'state' from catalog_import_claim),
  'claimed',
  'first catalog import attempt durably claims its request key'
);

select is(
  public.admin_catalog_import_receipt_claim_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000151',
    p_request_key => repeat('a', 64),
    p_request_fingerprint => repeat('a', 64)
  )->>'code',
  'import_in_progress',
  'concurrent retry cannot apply the same import twice'
);

select is(
  public.admin_catalog_import_receipt_claim_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000152',
    p_request_key => repeat('a', 64),
    p_request_fingerprint => repeat('a', 64)
  )->>'state',
  'claimed',
  'different actors independently claim the same payload in one shop'
);

select is(
  public.admin_catalog_import_receipt_lookup_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000151',
    p_request_key => repeat('d', 64),
    p_request_fingerprint => repeat('d', 64)
  )->>'state',
  'miss',
  'receipt lookup reports a miss without claiming invalid work'
);

set local role postgres;
select is(
  (
    select count(*)::text
    from app_private.catalog_import_receipts
  ),
  '2',
  'receipt lookup miss does not create a durable row'
);
set local role service_role;

select is(
  public.admin_catalog_import_receipt_claim_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000151',
    p_request_key => repeat('a', 64),
    p_request_fingerprint => repeat('b', 64)
  )->>'code',
  'idempotency_conflict',
  'request key cannot be rebound to a different import fingerprint'
);

select is(
  public.admin_catalog_import_receipt_complete_v1(
    p_receipt_id => (
      select (payload->>'receiptId')::uuid from catalog_import_claim
    ),
    p_claim_token => gen_random_uuid(),
    p_request_fingerprint => repeat('a', 64),
    p_result => '{"ok":true,"code":"success"}'::jsonb
  )->>'code',
  'idempotency_conflict',
  'completion rejects a non-owner claim token'
);

select is(
  public.admin_catalog_import_receipt_complete_v1(
    p_receipt_id => (
      select (payload->>'receiptId')::uuid from catalog_import_claim
    ),
    p_claim_token => (
      select (payload->>'claimToken')::uuid from catalog_import_claim
    ),
    p_request_fingerprint => repeat('a', 64),
    p_result => '{"ok":true,"code":"success"}'::jsonb
  )->>'state',
  'completed',
  'claim owner durably records the catalog import result'
);

select is(
  public.admin_catalog_import_receipt_claim_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000151',
    p_request_key => repeat('a', 64),
    p_request_fingerprint => repeat('a', 64)
  )->'result'->>'code',
  'success',
  'completed catalog import retry replays the recorded result'
);

select is(
  public.admin_catalog_import_receipt_lookup_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000151',
    p_request_key => repeat('a', 64),
    p_request_fingerprint => repeat('a', 64)
  )->'result'->>'code',
  'success',
  'read-only receipt lookup replays a completed import before revalidation'
);

create temporary table catalog_import_expired_claim as
select public.admin_catalog_import_receipt_claim_v1(
  p_shop_id => '10000000-0000-4000-8000-000000000151',
  p_actor_kind => 'personal_account',
  p_actor_id => '00000000-0000-4000-8000-000000000151',
  p_request_key => repeat('c', 64),
  p_request_fingerprint => repeat('c', 64)
) as payload;

select is(
  (select payload->>'state' from catalog_import_expired_claim),
  'claimed',
  'second catalog import fixture starts in claimed state'
);

set local role postgres;
update app_private.catalog_import_receipts
set lease_expires_at = now() - interval '1 second'
where request_key = repeat('c', 64);
set local role service_role;

select is(
  public.admin_catalog_import_receipt_claim_v1(
    p_shop_id => '10000000-0000-4000-8000-000000000151',
    p_actor_kind => 'personal_account',
    p_actor_id => '00000000-0000-4000-8000-000000000151',
    p_request_key => repeat('c', 64),
    p_request_fingerprint => repeat('c', 64)
  )->>'code',
  'import_indeterminate',
  'expired applying import fails closed instead of replaying mutations'
);

select * from finish();
rollback;
