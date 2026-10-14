begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

select has_function('public', 'wechat_account_profile_v1', array[]::text[]);
select has_function('public', 'wechat_sales_period_summary_v1', array['uuid', 'date', 'date']);
select has_function('public', 'wechat_sales_page_v2', array[
  'uuid', 'date', 'date', 'integer', 'timestamp with time zone', 'uuid',
  'text', 'text', 'text', 'uuid', 'uuid', 'text'
]);
select has_function('public', 'wechat_sale_detail_v2', array['uuid', 'uuid']);
select has_function('public', 'wechat_sales_filter_options_v1', array['uuid', 'date', 'date']);
select has_function('public', 'wechat_catalog_page_v1', array[
  'uuid', 'integer', 'text', 'uuid', 'uuid', 'boolean', 'text',
  'timestamp with time zone', 'text', 'uuid'
]);
select has_function('public', 'wechat_product_detail_v1', array['uuid', 'uuid']);
select has_function('public', 'wechat_price_history_page_v1', array['uuid', 'uuid', 'integer', 'text', 'uuid']);
select has_function('public', 'wechat_categories_page_v1', array['uuid', 'integer', 'text', 'text', 'uuid']);
select has_function('public', 'wechat_suppliers_page_v1', array['uuid', 'integer', 'text', 'text', 'uuid']);
select has_function('public', 'wechat_sync_history_page_v1', array['uuid', 'integer', 'bigint']);
select has_function('app_private', 'wechat_can_read_sales_metadata', array['uuid']);

select function_privs_are(
  'public', 'wechat_catalog_page_v1',
  array['uuid', 'integer', 'text', 'uuid', 'uuid', 'boolean', 'text',
    'timestamp with time zone', 'text', 'uuid'],
  'authenticated', array['EXECUTE']
);
select function_privs_are(
  'public', 'wechat_catalog_page_v1',
  array['uuid', 'integer', 'text', 'uuid', 'uuid', 'boolean', 'text',
    'timestamp with time zone', 'text', 'uuid'],
  'anon', array[]::text[]
);

insert into auth.users (
  instance_id, id, aud, role, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000211',
    'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000212',
    'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set display_name = case profile_id
    when '00000000-0000-4000-8000-000000000211' then 'Parity member'
    else 'Parity other member'
  end,
  profile_status = 'active'
where profile_id in (
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000212'
);

insert into auth.identities (provider_id, user_id, identity_data, provider)
values (
  'unionid-parity-fixture',
  '00000000-0000-4000-8000-000000000211',
  jsonb_build_object('sub', 'unionid-parity-fixture'),
  'custom:wechat'
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000000211', 'PARITY211', 'Parity Shop A', 'active'),
  ('10000000-0000-4000-8000-000000000212', 'PARITY212', 'Parity Shop B', 'active');

insert into public.storefront_settings (shop_id, public_slug, currency_code, catalog_time_zone)
values
  ('10000000-0000-4000-8000-000000000211', 'parity-a', 'CLP', 'America/Santiago'),
  ('10000000-0000-4000-8000-000000000212', 'parity-b', 'CLP', 'UTC');

insert into public.shop_members (profile_id, shop_id, role_key, membership_status)
values
  ('00000000-0000-4000-8000-000000000211', '10000000-0000-4000-8000-000000000211', 'viewer', 'active'),
  ('00000000-0000-4000-8000-000000000212', '10000000-0000-4000-8000-000000000212', 'shop_owner', 'active');

insert into public.inventory_categories (id, owner_user_id, shop_id, name)
values ('21000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000211',
  '10000000-0000-4000-8000-000000000211', 'Tea');
insert into public.inventory_suppliers (id, owner_user_id, shop_id, name)
values ('22000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000211',
  '10000000-0000-4000-8000-000000000211', 'Tea Supplier');
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, item_number, product_name,
  category_id, supplier_id, retail_price, purchase_price, stock_quantity
) values (
  '23000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000211',
  '10000000-0000-4000-8000-000000000211',
  'PARITY-TEA-001', 'TEA-001', 'Green Tea',
  '21000000-0000-4000-8000-000000000211',
  '22000000-0000-4000-8000-000000000211', 20, 8, 14
);
insert into public.inventory_product_prices (
  id, owner_user_id, shop_id, product_id, type, price, effective_at, source, created_at
) values
  ('24000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000211',
    '10000000-0000-4000-8000-000000000211', '23000000-0000-4000-8000-000000000211',
    'RETAIL', 10, '2026-08-01T00:00:00Z', 'fixture', '2026-08-01T00:00:00Z'),
  ('24000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000211',
    '10000000-0000-4000-8000-000000000211', '23000000-0000-4000-8000-000000000211',
    'RETAIL', 15, '2026-08-02T00:00:00Z', 'fixture', '2026-08-02T00:00:00Z');

insert into public.sync_events (
  owner_user_id, shop_id, domain, event_type, source, changed_count
) values (
  '00000000-0000-4000-8000-000000000211',
  '10000000-0000-4000-8000-000000000211',
  'catalog', 'catalog_changed', 'test_fixture', 1
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000211', true);
select is((select can_filter_operational_metadata from public.wechat_sales_filter_options_v1(
  '10000000-0000-4000-8000-000000000211', '2026-08-01', '2026-08-03'
)), false, 'viewer sales filter options mask operational metadata');
select is((select staff = '[]'::jsonb and devices = '[]'::jsonb
  from public.wechat_sales_filter_options_v1(
    '10000000-0000-4000-8000-000000000211', '2026-08-01', '2026-08-03'
  )), true, 'viewer receives no staff or device filter identifiers');

select is(app_private.wechat_can_read_sales_metadata(
  '10000000-0000-4000-8000-000000000211'
), false, 'viewer cannot read staff or device sales metadata');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000212', true);
select is(app_private.wechat_can_read_sales_metadata(
  '10000000-0000-4000-8000-000000000212'
), true, 'owner can read staff and device sales metadata');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000211', true);

select is((select count(*)::integer from public.wechat_account_profile_v1()), 1, 'account profile is readable');
select is((select providers[1] from public.wechat_account_profile_v1()), 'custom:wechat', 'provider list is schema-backed');
select is((select wechat_linked from public.wechat_account_profile_v1()), true, 'WeChat linking state is explicit');
select is((select count(*)::integer from public.wechat_categories_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null)), 1, 'category page is shop scoped');
select is((select category_name from public.wechat_categories_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, 'tea', null, null)), 'Tea', 'category search works');
select is((select count(*)::integer from public.wechat_suppliers_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null)), 1, 'supplier page is shop scoped');
select is((select count(*)::integer from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, 'green', null, null,
  null, 'updated_desc', null, null, null)), 1, 'catalog search returns the authorized product');
select is((select category_name from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null,
  null, 'updated_desc', null, null, null)), 'Tea', 'catalog projects category without N+1');
select is((select supplier_name from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null,
  null, 'updated_desc', null, null, null)), 'Tea Supplier', 'catalog projects supplier without N+1');
select is((select previous_retail_price from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null,
  null, 'updated_desc', null, null, null)), 15::double precision, 'previous retail price is derived from real history');
select is((select count(*)::integer from public.wechat_product_detail_v1(
  '10000000-0000-4000-8000-000000000211', '23000000-0000-4000-8000-000000000211')), 1, 'product detail exists');
select is((select count(*)::integer from public.wechat_price_history_page_v1(
  '10000000-0000-4000-8000-000000000211', '23000000-0000-4000-8000-000000000211',
  50, null, null)), 2, 'price history is bounded and complete for fixture');
select ok(exists(select 1 from public.wechat_sync_history_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null
) where source = 'test_fixture'), 'sanitized sync history is visible');
select ok(not ((select to_jsonb(history) from public.wechat_sync_history_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null
) history limit 1) ?| array['metadata', 'entity_ids', 'source_device_id']),
  'sync history contract excludes metadata and identifiers');
select is((select count(*)::integer from public.wechat_sales_period_summary_v1(
  '10000000-0000-4000-8000-000000000211', '2026-08-01', '2026-08-03')), 3, 'range emits daily zero-filled rows');
select throws_ok($$select * from public.wechat_sales_period_summary_v1(
  '10000000-0000-4000-8000-000000000211', '2025-01-01', '2026-08-03')$$,
  '22023', 'sales_range_invalid', 'sales range over one year is rejected');
select throws_ok($$select * from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 101, null, null, null,
  null, 'updated_desc', null, null, null)$$,
  '22023', 'catalog_page_invalid', 'unbounded catalog page is rejected');
select throws_ok($$select * from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', null, null, null, null,
  null, 'updated_desc', null, null, null)$$,
  '22023', 'catalog_page_invalid', 'NULL catalog page limit is rejected');
select throws_ok($$select * from public.wechat_price_history_page_v1(
  '10000000-0000-4000-8000-000000000211',
  '23000000-0000-4000-8000-000000000211', null, null, null)$$,
  '22023', 'price_history_page_invalid',
  'NULL price-history page limit is rejected');
select throws_ok($$select * from public.wechat_categories_page_v1(
  '10000000-0000-4000-8000-000000000211', null, null, null, null)$$,
  '22023', 'category_page_invalid', 'NULL category page limit is rejected');
select throws_ok($$select * from public.wechat_suppliers_page_v1(
  '10000000-0000-4000-8000-000000000211', null, null, null, null)$$,
  '22023', 'supplier_page_invalid', 'NULL supplier page limit is rejected');
select throws_ok($$select * from public.wechat_sync_history_page_v1(
  '10000000-0000-4000-8000-000000000211', null, null)$$,
  '22023', 'sync_history_page_invalid',
  'NULL sync-history page limit is rejected');
select throws_ok($$select * from public.wechat_sales_page_v2(
  '10000000-0000-4000-8000-000000000211', '2026-08-01', '2026-08-03',
  null, null, null, null, null, null, null, null, null)$$,
  '22023', 'sales_page_invalid', 'NULL sales page limit is rejected');
select is((select count(*)::integer from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000212', 50, null, null, null,
  null, 'updated_desc', null, null, null)), 0, 'shop A cannot read shop B catalog');
select is((select count(*)::integer from public.wechat_categories_page_v1(
  '10000000-0000-4000-8000-000000000212', 50, null, null, null)), 0, 'shop A cannot read shop B categories');
select is((select count(*)::integer from public.wechat_sync_history_page_v1(
  '10000000-0000-4000-8000-000000000212', 50, null)), 0, 'shop A cannot read shop B history');

update public.shop_members set membership_status = 'suspended', suspended_at = now()
where profile_id = '00000000-0000-4000-8000-000000000211'
  and shop_id = '10000000-0000-4000-8000-000000000211';
select is((select count(*)::integer from public.wechat_authorized_shops_v1()), 0, 'revoked membership disappears immediately');
select is((select count(*)::integer from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null,
  null, 'updated_desc', null, null, null)), 0, 'revoked membership denies catalog immediately');

update public.profiles set profile_status = 'disabled', disabled_at = now()
where profile_id = '00000000-0000-4000-8000-000000000211';
select is((select profile_status from public.wechat_account_profile_v1()), 'disabled', 'disabled state remains visible to account UI');

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*)::integer from public.wechat_account_profile_v1()), 0, 'anonymous account read is empty');
select is((select count(*)::integer from public.wechat_catalog_page_v1(
  '10000000-0000-4000-8000-000000000211', 50, null, null, null,
  null, 'updated_desc', null, null, null)), 0, 'anonymous catalog read is empty');

select * from finish();
rollback;
