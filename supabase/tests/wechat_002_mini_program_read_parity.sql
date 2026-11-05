begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(68);

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


-- TASK146 candidate extension: private draft, SQL/pgTAP NOT_RUN.
-- These transactional synthetic rows test the reader; they do not prove POS-origin delivery.
set local role postgres;
set local timezone='UTC';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000211',true);
update public.profiles set profile_status='active',disabled_at=null where profile_id='00000000-0000-4000-8000-000000000211';
update public.shop_members set membership_status='active',suspended_at=null,role_key='viewer'
where profile_id='00000000-0000-4000-8000-000000000211' and shop_id='10000000-0000-4000-8000-000000000211';
-- Concrete synthetic POS read fixture; no POS write/session RPC is invoked.
insert into public.staff_accounts (staff_id,shop_id,staff_code,display_name,role_key,status,
 credential_kind,credential_hash,credential_updated_at,credential_status,credential_version,must_change_credential)
values ('30000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','T146146211','TASK146 Sales Staff 146211','manager','active',
 'pin','$scrypt-v1$TASK146-fixture-not-a-real-credential',now(),'active',1,false);
insert into public.shop_devices (shop_device_id,shop_id,device_identifier,device_type,display_name,status)
values ('40000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146-DEVICE-146211','pos','TASK146 Sales Device 146211','active');
insert into public.pos_device_credentials (pos_device_credential_id,shop_id,shop_device_id,staff_id,
 token_hash,staff_credential_version,status,issued_at,expires_at)
values ('50000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211',
 'sha256:'||md5('TASK146-credential-146211')||md5('TASK146-credential-146211'),1,'active',now()-interval '1 hour',now()+interval '1 day');
insert into public.pos_sessions (pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,
 session_token_hash,staff_credential_version,status,issued_at,expires_at)
values ('60000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','50000000-0000-4000-8000-000000146211',
 'sha256:'||md5('TASK146-session-146211')||md5('TASK146-session-146211'),1,'active',now()-interval '30 minutes',now()+interval '8 hours');
insert into public.pos_sales_sync_batches (pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,
 staff_id,pos_session_id,client_batch_id,idempotency_key,payload_hash,sale_count,line_count,status)
values ('70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-BATCH-146211','TASK146-BATCH-146211','sha256:'||repeat('a',64),1,1,'accepted');
-- Concrete synthetic POS read fixture; no POS write/session RPC is invoked.
insert into public.staff_accounts (staff_id,shop_id,staff_code,display_name,role_key,status,
 credential_kind,credential_hash,credential_updated_at,credential_status,credential_version,must_change_credential)
values ('30000000-0000-4000-8000-000000146221','10000000-0000-4000-8000-000000000212','T146146221','TASK146 Sales Staff 146221','manager','active',
 'pin','$scrypt-v1$TASK146-fixture-not-a-real-credential',now(),'active',1,false);
insert into public.shop_devices (shop_device_id,shop_id,device_identifier,device_type,display_name,status)
values ('40000000-0000-4000-8000-000000146221','10000000-0000-4000-8000-000000000212','TASK146-DEVICE-146221','pos','TASK146 Sales Device 146221','active');
insert into public.pos_device_credentials (pos_device_credential_id,shop_id,shop_device_id,staff_id,
 token_hash,staff_credential_version,status,issued_at,expires_at)
values ('50000000-0000-4000-8000-000000146221','10000000-0000-4000-8000-000000000212','40000000-0000-4000-8000-000000146221','30000000-0000-4000-8000-000000146221',
 'sha256:'||md5('TASK146-credential-146221')||md5('TASK146-credential-146221'),1,'active',now()-interval '1 hour',now()+interval '1 day');
insert into public.pos_sessions (pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,
 session_token_hash,staff_credential_version,status,issued_at,expires_at)
values ('60000000-0000-4000-8000-000000146221','10000000-0000-4000-8000-000000000212','40000000-0000-4000-8000-000000146221','30000000-0000-4000-8000-000000146221','50000000-0000-4000-8000-000000146221',
 'sha256:'||md5('TASK146-session-146221')||md5('TASK146-session-146221'),1,'active',now()-interval '30 minutes',now()+interval '8 hours');
insert into public.pos_sales_sync_batches (pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,
 staff_id,pos_session_id,client_batch_id,idempotency_key,payload_hash,sale_count,line_count,status)
values ('70000000-0000-4000-8000-000000146221','10000000-0000-4000-8000-000000000212','TASK146','40000000-0000-4000-8000-000000146221','30000000-0000-4000-8000-000000146221','60000000-0000-4000-8000-000000146221',
 'TASK146-BATCH-146221','TASK146-BATCH-146221','sha256:'||repeat('a',64),1,1,'accepted');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146211','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146211','TASK146-SALE-146211','sha256:'||repeat('b',64),'TASK146-TIE-A',
 '2026-08-01T12:00:00.123456Z','2026-08-01','CLP',11.49,1.49,0,9.49,'accepted','sale',9007199254740993,2,9007199254740991,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146212','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146212','TASK146-SALE-146212','sha256:'||repeat('b',64),'TASK146-TIE-B',
 '2026-08-01T12:00:00.123456Z','2026-08-01','CLP',11.49,1.49,0,9.49,'accepted','refund',7,0,-7,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146213','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146213','TASK146-SALE-146213','sha256:'||repeat('b',64),'TASK146-END',
 '2026-08-03T23:59:59.999999Z','2026-08-03','CLP',11.49,1.49,0,9.49,'accepted','sale',20,0,20,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146214','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146214','TASK146-SALE-146214','sha256:'||repeat('b',64),'TASK146-OUTSIDE',
 '2026-08-03T01:00:00Z','2026-08-04','CLP',11.49,1.49,0,9.49,'accepted','sale',30,0,30,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146215','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146215','TASK146-SALE-146215','sha256:'||repeat('b',64),'TASK146-LEGACY-REFUND',
 '2026-08-02T12:00:00Z','2026-08-02','CLP',11.49,1.49,0,9.49,'accepted','refund',null,null,null,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
update public.pos_sales set subtotal=15.49,discount_total=2.89,total=12.60 where pos_sale_id='80000000-0000-4000-8000-000000146215';
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146221','70000000-0000-4000-8000-000000146221','10000000-0000-4000-8000-000000000212','TASK146','40000000-0000-4000-8000-000000146221','30000000-0000-4000-8000-000000146221','60000000-0000-4000-8000-000000146221',
 'TASK146-SALE-146221','TASK146-SALE-146221','sha256:'||repeat('b',64),'TASK146-FOREIGN',
 '2026-08-01T12:00:00.123456Z','2026-08-01','CLP',11.49,1.49,0,9.49,'accepted','sale',100,0,100,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146241','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146241','TASK146-SALE-146241','sha256:'||repeat('b',64),'TASK146-STATUS-duplicate',
 '2026-08-10T12:00:00.654321Z','2026-08-10','CLP',11.49,1.49,0,9.49,'duplicate','sale',1,0,1,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146242','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146242','TASK146-SALE-146242','sha256:'||repeat('b',64),'TASK146-STATUS-conflict',
 '2026-08-10T12:00:00.654321Z','2026-08-10','CLP',11.49,1.49,0,9.49,'conflict','sale',1,0,1,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146243','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146243','TASK146-SALE-146243','sha256:'||repeat('b',64),'TASK146-STATUS-rejected',
 '2026-08-10T12:00:00.654321Z','2026-08-10','CLP',11.49,1.49,0,9.49,'rejected','sale',1,0,1,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146244','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146244','TASK146-SALE-146244','sha256:'||repeat('b',64),'TASK146-STATUS-accepted',
 '2026-08-10T12:00:00.654321Z','2026-08-10','CLP',11.49,1.49,0,9.49,'accepted','void',0,0,0,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
update public.pos_sales_sync_batches set sale_count=9,line_count=2 where pos_sales_sync_batch_id='70000000-0000-4000-8000-000000146211';
insert into public.pos_sale_lines (pos_sale_line_id,pos_sale_id,pos_sales_sync_batch_id,shop_id,client_line_id,line_position,
 product_id,item_number,barcode,product_name,quantity,unit_price,line_total,line_type,unit_amount_clp,amount_clp)
values ('90000000-0000-4000-8000-000014621101','80000000-0000-4000-8000-000000146211','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146-LINE-A',1,
 null,'TASK146-ITEM','TASK146-BARCODE','TASK146 Synthetic Item',1.250,11.49,9.49,'item',9007199254740993,9007199254740991),
 ('90000000-0000-4000-8000-000014621201','80000000-0000-4000-8000-000000146212','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146-LINE-REFUND',1,
 null,'TASK146-REFUND','TASK146-REFUND','TASK146 Synthetic Refund',0.125,7,7,'item',7,-7);
insert into public.pos_revenue_ledger_entries (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_device_id,staff_id,pos_session_id,business_date,occurred_at,currency,entry_type,payment_method,amount_clp,client_entry_id,created_at) values
 ('80000000-0000-4000-8000-000000146211','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-01','2026-08-01T12:00:00.123456Z','CLP','item',null,9007199254740993,'TASK146-LEDGER-0','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146211','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-01','2026-08-01T12:00:00.123456Z','CLP','discount',null,-2,'TASK146-LEDGER-1','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146211','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-01','2026-08-01T12:00:00.123456Z','CLP','payment','cash',9007199254740991,'TASK146-LEDGER-2','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146212','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-01','2026-08-01T12:00:00.123456Z','CLP','refund_item',null,-7,'TASK146-LEDGER-3','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146212','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-01','2026-08-01T12:00:00.123456Z','CLP','refund_payment','cash',-7,'TASK146-LEDGER-4','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146213','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-03','2026-08-03T23:59:59.999999Z','CLP','item',null,20,'TASK146-LEDGER-5','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146213','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-03','2026-08-03T23:59:59.999999Z','CLP','payment','card',20,'TASK146-LEDGER-6','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146215','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-02','2026-08-02T12:00:00Z','CLP','refund_item',null,-13,'TASK146-LEDGER-7','2026-08-04T00:00:00Z'),
 ('80000000-0000-4000-8000-000000146215','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211','2026-08-02','2026-08-02T12:00:00Z','CLP','refund_payment','cash',-13,'TASK146-LEDGER-8','2026-08-04T00:00:00Z');

create temporary table task146_parity_responses(action text primary key,response jsonb) on commit drop;
insert into task146_parity_responses values ('summary',public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03'));
insert into task146_parity_responses values ('page',public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03'));
insert into task146_parity_responses values ('detail',public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid));
insert into task146_parity_responses values ('filter',public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03'));

-- P01
select results_eq(
 $actual$
 select action,
 response ?& array['contract_version','ok','code','server_time','scope','capability','period','currency_code','time_zone','data']
 and array(select jsonb_object_keys(response) order by 1)=array['capability','code','contract_version','currency_code','data','ok','period','scope','server_time','time_zone']
 and response->'contract_version'='1'::jsonb and response->'ok'='true'::jsonb and response->>'code'='ok'
 and jsonb_typeof(response->'server_time')='string' and isfinite((response->>'server_time')::timestamptz)
 and response->'scope'=jsonb_build_object('principal_kind','personal_account','principal_id','00000000-0000-4000-8000-000000000211','shop_id','10000000-0000-4000-8000-000000000211','shop_device_id','40000000-0000-4000-8000-000000146211')
 and response->'capability'='{"sales_read":true,"operational_metadata_read":false,"access_policy":"online_only"}'::jsonb
 and response->>'currency_code'='CLP' and response->>'time_zone'='America/Santiago'
 and response->'period'=case when action='detail' then '{"from_date":null,"to_date":null}'::jsonb else '{"from_date":"2026-08-01","to_date":"2026-08-03"}'::jsonb end
 and case action
 when 'summary' then jsonb_array_length(response#>'{data,summary_days}')=3 and jsonb_array_length(response#>'{data,sales}')=4
 when 'page' then jsonb_array_length(response#>'{data,sales}')=4
 when 'detail' then response#>>'{data,sale,pos_sale_id}'='80000000-0000-4000-8000-000000146211' and jsonb_array_length(response#>'{data,lines}')=1
 when 'filter' then response#>'{data,can_filter_operational_metadata}'='false'::jsonb and response#>'{data,staff}'='[]'::jsonb and response#>'{data,devices}'='[]'::jsonb
 end as frozen_envelope,
 array(select jsonb_object_keys(response->'data') order by 1) as data_keys
from task146_parity_responses order by action
 $actual$,
 $expected$
 select * from (values ('detail',true,array['lines','sale']),('filter',true,array['can_filter_operational_metadata','devices','payment_methods','staff']),('page',true,array['next_cursor','sales']),('summary',true,array['next_cursor','sales','summary_days'])) expected order by 1
 $expected$,
 'mobile sales four actions return the frozen successful envelope'
);

-- P02 mask operational SALE metadata; authorized reader-device scope is a different contract.
select ok(not exists (
 select 1 from task146_parity_responses r cross join lateral jsonb_array_elements(
 case when r.action in ('page','summary') then r.response#>'{data,sales}'
 when r.action='detail' then jsonb_build_array(r.response#>'{data,sale}') else '[]'::jsonb end) sale
 where not (sale ?& array['staff_name','device_name']) or sale->'staff_name'<>'null'::jsonb or sale->'device_name'<>'null'::jsonb
 or sale ?| array['staff_id','shop_device_id','device_id']
),'viewer mobile page and detail omit staff and device metadata');
select is((select jsonb_build_array(r->>'code',r->'data') from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_staff_id=>'30000000-0000-4000-8000-000000146211'::uuid) r) x),'["metadata_filter_not_allowed",null]'::jsonb,'viewer cannot filter mobile sales by staff');
select is((select jsonb_build_array(r->>'code',r->'data') from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_device_id=>'40000000-0000-4000-8000-000000146211'::uuid) r) x),'["metadata_filter_not_allowed",null]'::jsonb,'viewer cannot filter mobile sales by device');

-- P05 shop_owner, separate state transition before real authenticated SQL execution.
update public.shop_members set role_key='shop_owner' where profile_id='00000000-0000-4000-8000-000000000211' and shop_id='10000000-0000-4000-8000-000000000211';
set local role authenticated;
select results_eq(
 $actual$
 select label,qualified from (
 select 'page'::text label, r->>'code'='ok' and r#>'{capability,operational_metadata_read}'='true'::jsonb
 and jsonb_array_length(r#>'{data,sales}')=4 and not exists(select 1 from jsonb_array_elements(r#>'{data,sales}') sale where sale->>'staff_name' is distinct from 'TASK146 Sales Staff 146211' or sale->>'device_name' is distinct from 'TASK146 Sales Device 146211') qualified from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_staff_id=>'30000000-0000-4000-8000-000000146211'::uuid, p_device_id=>'40000000-0000-4000-8000-000000146211'::uuid) r) p
 union all select 'detail',r->>'code'='ok' and r#>>'{data,sale,staff_name}'='TASK146 Sales Staff 146211' and r#>>'{data,sale,device_name}'='TASK146 Sales Device 146211' from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) d
 union all select 'filter',r->>'code'='ok' and r#>'{data,can_filter_operational_metadata}'='true'::jsonb
 and r#>'{data,staff}' @> '[{"id":"30000000-0000-4000-8000-000000146211","name":"TASK146 Sales Staff 146211"}]'::jsonb
 and r#>'{data,devices}' @> '[{"id":"40000000-0000-4000-8000-000000146211","name":"TASK146 Sales Device 146211"}]'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) f
) checked order by label
 $actual$,
 $expected$
 select * from (values ('detail',true),('filter',true),('page',true)) expected order by 1
 $expected$,
 'shop_owner retains mobile sales metadata filtering'
);
set local role postgres;

-- P05 shop_manager, separate state transition before real authenticated SQL execution.
update public.shop_members set role_key='shop_manager' where profile_id='00000000-0000-4000-8000-000000000211' and shop_id='10000000-0000-4000-8000-000000000211';
set local role authenticated;
select results_eq(
 $actual$
 select label,qualified from (
 select 'page'::text label, r->>'code'='ok' and r#>'{capability,operational_metadata_read}'='true'::jsonb
 and jsonb_array_length(r#>'{data,sales}')=4 and not exists(select 1 from jsonb_array_elements(r#>'{data,sales}') sale where sale->>'staff_name' is distinct from 'TASK146 Sales Staff 146211' or sale->>'device_name' is distinct from 'TASK146 Sales Device 146211') qualified from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_staff_id=>'30000000-0000-4000-8000-000000146211'::uuid, p_device_id=>'40000000-0000-4000-8000-000000146211'::uuid) r) p
 union all select 'detail',r->>'code'='ok' and r#>>'{data,sale,staff_name}'='TASK146 Sales Staff 146211' and r#>>'{data,sale,device_name}'='TASK146 Sales Device 146211' from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) d
 union all select 'filter',r->>'code'='ok' and r#>'{data,can_filter_operational_metadata}'='true'::jsonb
 and r#>'{data,staff}' @> '[{"id":"30000000-0000-4000-8000-000000146211","name":"TASK146 Sales Staff 146211"}]'::jsonb
 and r#>'{data,devices}' @> '[{"id":"40000000-0000-4000-8000-000000146211","name":"TASK146 Sales Device 146211"}]'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) f
) checked order by label
 $actual$,
 $expected$
 select * from (values ('detail',true),('filter',true),('page',true)) expected order by 1
 $expected$,
 'shop_manager retains mobile sales metadata filtering'
);
set local role postgres;
update public.shop_members set role_key='viewer' where profile_id='00000000-0000-4000-8000-000000000211' and shop_id='10000000-0000-4000-8000-000000000211';

-- P06 authoritative business_date includes first/last day, excludes outside even if UTC timestamp lies inside.
select is((select jsonb_agg(sale->>'pos_sale_id' order by ordinal) from task146_parity_responses r cross join lateral jsonb_array_elements(r.response#>'{data,sales}') with ordinality items(sale,ordinal) where r.action='page'),'["80000000-0000-4000-8000-000000146213", "80000000-0000-4000-8000-000000146215", "80000000-0000-4000-8000-000000146212", "80000000-0000-4000-8000-000000146211"]'::jsonb,'mobile sales uses inclusive shop business-date boundaries');

-- P07
select results_eq(
 $actual$
 select 'id-only'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_before_sale_id=>'80000000-0000-4000-8000-000000146212'::uuid) r) x union all select 'timestamp-only'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_before_occurred_at=>timestamptz '2026-08-01T12:00:00.123456Z') r) x order by label
 $actual$,
 $expected$
 select * from (values ('id-only','invalid_request',true),('timestamp-only','invalid_request',true)) expected order by 1
 $expected$,
 'mobile sales rejects partial cursor pairs'
);

-- P08 no millisecond cursor round-trip; reuse exact returned timestamp/UUID.
with first as materialized(select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>1, p_sale_number=>'TASK146-TIE-%') r),second as materialized(select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>1, p_sale_number=>'TASK146-TIE-%', p_before_occurred_at=>(first.r#>>'{data,next_cursor,before_occurred_at}')::timestamptz, p_before_sale_id=>(first.r#>>'{data,next_cursor,before_sale_id}')::uuid) r from first),third as materialized(select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>1, p_sale_number=>'TASK146-TIE-%', p_before_occurred_at=>(second.r#>>'{data,next_cursor,before_occurred_at}')::timestamptz, p_before_sale_id=>(second.r#>>'{data,next_cursor,before_sale_id}')::uuid) r from second)
select ok(first.r->>'code'='ok' and second.r->>'code'='ok' and third.r->>'code'='ok'
 and first.r#>>'{data,sales,0,pos_sale_id}'='80000000-0000-4000-8000-000000146212'
 and second.r#>>'{data,sales,0,pos_sale_id}'='80000000-0000-4000-8000-000000146211'
 and first.r#>>'{data,next_cursor,before_sale_id}'='80000000-0000-4000-8000-000000146212'
 and second.r#>>'{data,next_cursor,before_sale_id}'='80000000-0000-4000-8000-000000146211'
 and (first.r#>>'{data,next_cursor,before_occurred_at}')::timestamptz=timestamptz '2026-08-01T12:00:00.123456Z'
 and (first.r#>>'{data,next_cursor,before_occurred_at}') ~ '[.]123456'
 and third.r#>'{data,sales}'='[]'::jsonb and third.r#>'{data,next_cursor}'='null'::jsonb,
 'mobile sales tied-time cursor resumes without duplicates or omissions') from first,second,third;

-- P09
select results_eq(
 $actual$
 select 'hundred'::text label,r->>'code',jsonb_array_length(r#>'{data,sales}')=4 and jsonb_array_length(r#>'{data,sales}')<=100 from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>100) r) x union all select 'null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>null) r) x union all select 'one'::text label,r->>'code',jsonb_array_length(r#>'{data,sales}')=1 and jsonb_array_length(r#>'{data,sales}')<=1 from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>1) r) x union all select 'too-large'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>101) r) x union all select 'zero'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_limit=>0) r) x order by label
 $actual$,
 $expected$
 select * from (values ('hundred','ok',true),('null','invalid_request',true),('one','ok',true),('too-large','invalid_request',true),('zero','invalid_request',true)) expected order by 1
 $expected$,
 'mobile sales page limits are bounded and explicit NULL fails closed'
);
create temporary table task146_dst_response(response jsonb,caller_timezone_restored boolean) on commit drop;
set local timezone='America/Santiago';
insert into task146_dst_response(response) values (public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>'2026-09-05'::date, p_to_date=>'2026-09-07'::date));
update task146_dst_response set caller_timezone_restored=current_setting('TimeZone')='America/Santiago';
set local timezone='UTC';

-- P10 difference365 means366inclusive dates; summary bothNULL means shop today.
select results_eq(
 $actual$
 select 'filter:both-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>null, p_to_date=>null) r) x union all select 'filter:difference365'::text label,r->>'code',r->'data'<>'null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-01-01', p_to_date=>date '2027-01-01') r) x union all select 'filter:difference366'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-01-01', p_to_date=>date '2027-01-02') r) x union all select 'filter:infinite'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>'infinity'::date, p_to_date=>'infinity'::date) r) x union all select 'filter:one-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>null, p_to_date=>date '2026-08-03') r) x union all select 'filter:reversed'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-08-03', p_to_date=>date '2026-08-01') r) x union all select 'page:both-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>null, p_to_date=>null) r) x union all select 'page:difference365'::text label,r->>'code',r->'data'<>'null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-01-01', p_to_date=>date '2027-01-01') r) x union all select 'page:difference366'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-01-01', p_to_date=>date '2027-01-02') r) x union all select 'page:infinite'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>'infinity'::date, p_to_date=>'infinity'::date) r) x union all select 'page:one-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>null, p_to_date=>date '2026-08-03') r) x union all select 'page:reversed'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-03', p_to_date=>date '2026-08-01') r) x union all select 'summary:both-null'::text label,r->>'code',r->'data'<>'null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>null, p_to_date=>null) r) x union all select 'summary:difference365'::text label,r->>'code',r->'data'<>'null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-01-01', p_to_date=>date '2027-01-01') r) x union all select 'summary:difference366'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-01-01', p_to_date=>date '2027-01-02') r) x union all select 'summary:infinite'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>'infinity'::date, p_to_date=>'infinity'::date) r) x union all select 'summary:one-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>null, p_to_date=>date '2026-08-03') r) x union all select 'summary:reversed'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-08-03', p_to_date=>date '2026-08-01') r) x union all select 'summary:dst-santiago'::text,response->>'code',caller_timezone_restored and (select jsonb_agg(d->'business_date' order by ordinal) from jsonb_array_elements(response#>'{data,summary_days}') with ordinality days(d,ordinal))='["2026-09-07","2026-09-06","2026-09-05"]'::jsonb from task146_dst_response order by label
 $actual$,
 $expected$
 select * from (values ('filter:both-null','invalid_request',true),('filter:difference365','ok',true),('filter:difference366','invalid_request',true),('filter:infinite','invalid_request',true),('filter:one-null','invalid_request',true),('filter:reversed','invalid_request',true),('page:both-null','invalid_request',true),('page:difference365','ok',true),('page:difference366','invalid_request',true),('page:infinite','invalid_request',true),('page:one-null','invalid_request',true),('page:reversed','invalid_request',true),('summary:both-null','ok',true),('summary:difference365','ok',true),('summary:difference366','invalid_request',true),('summary:infinite','invalid_request',true),('summary:one-null','invalid_request',true),('summary:reversed','invalid_request',true) ,('summary:dst-santiago','ok',true)) expected(label,code,qualified) order by label
 $expected$,
 'mobile sales date ranges are bounded without changing inclusive semantics'
);

-- P11
select results_eq(
 $actual$
 select 'action-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>null) r) x union all select 'action-unknown'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'anything', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) x union all select 'detail-with-status'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid, p_status=>'accepted') r) x union all select 'device-blank'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'   ', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) x union all select 'device-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>null, p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) x union all select 'device-overlong-before-trim'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>repeat(' ',161)||'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) x union all select 'device-utf8-octets'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>repeat('é',81), p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) x union all select 'filter-with-metadata-filter'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_staff_id=>'30000000-0000-4000-8000-000000146211'::uuid) r) x union all select 'infinite-cursor'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_before_occurred_at=>'infinity'::timestamptz, p_before_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) x union all select 'kind'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_business_kind=>'chargeback') r) x union all select 'number-empty'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_sale_number=>'') r) x union all select 'number-long'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_sale_number=>repeat('n',81)) r) x union all select 'page-with-detail-id'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) x union all select 'payment-empty'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_payment_method=>'') r) x union all select 'payment-long'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_payment_method=>repeat('p',41)) r) x union all select 'shop-null'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>null, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03') r) x union all select 'status'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_status=>'unknown') r) x union all select 'summary-with-cursor'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_before_occurred_at=>timestamptz '2026-08-01T12:00:00Z', p_before_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) x order by label
 $actual$,
 $expected$
 select * from (values ('action-null','invalid_request',true),('action-unknown','invalid_request',true),('detail-with-status','invalid_request',true),('device-blank','invalid_request',true),('device-null','invalid_request',true),('device-overlong-before-trim','invalid_request',true),('device-utf8-octets','invalid_request',true),('filter-with-metadata-filter','invalid_request',true),('infinite-cursor','invalid_request',true),('kind','invalid_request',true),('number-empty','invalid_request',true),('number-long','invalid_request',true),('page-with-detail-id','invalid_request',true),('payment-empty','invalid_request',true),('payment-long','invalid_request',true),('shop-null','invalid_request',true),('status','invalid_request',true),('summary-with-cursor','invalid_request',true)) expected order by 1
 $expected$,
 'mobile sales rejects unsupported actions incompatible fields and invalid filters'
);
select results_eq(
 $actual$
 select 'status:accepted'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-10', p_to_date=>date '2026-08-10', p_status=>'accepted') r) x union all select 'status:conflict'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-10', p_to_date=>date '2026-08-10', p_status=>'conflict') r) x union all select 'status:duplicate'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-10', p_to_date=>date '2026-08-10', p_status=>'duplicate') r) x union all select 'status:rejected'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-10', p_to_date=>date '2026-08-10', p_status=>'rejected') r) x union all select 'kind:void'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-10', p_to_date=>date '2026-08-10', p_business_kind=>'void') r) x union all select 'kind:sale'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-10', p_to_date=>date '2026-08-10', p_business_kind=>'sale') r) x union all select 'kind:refund'::text label,jsonb_build_array(r->'code',coalesce((select jsonb_agg(s->'pos_sale_id' order by ordinal) from jsonb_array_elements(r#>'{data,sales}') with ordinality sales(s,ordinal)),'[]'::jsonb)) value from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_business_kind=>'refund') r) x union all select 'zero-authorized'::text,jsonb_build_array(r->'code',r#>'{data,summary_days,0,gross_sales_clp}',r#>'{data,summary_days,0,discounts_clp}',r#>'{data,summary_days,0,refunds_clp}',r#>'{data,summary_days,0,net_revenue_clp}',r#>'{data,summary_days,0,transaction_count}',r#>'{data,sales}',r#>'{data,next_cursor}') from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-08-20', p_to_date=>date '2026-08-20') r) x order by label
 $actual$,
 $expected$
 select * from (values ('kind:refund','["ok", ["80000000-0000-4000-8000-000000146215", "80000000-0000-4000-8000-000000146212"]]'::jsonb),('kind:sale','["ok", ["80000000-0000-4000-8000-000000146243", "80000000-0000-4000-8000-000000146242", "80000000-0000-4000-8000-000000146241"]]'::jsonb),('kind:void','["ok", ["80000000-0000-4000-8000-000000146244"]]'::jsonb),('status:accepted','["ok", ["80000000-0000-4000-8000-000000146244"]]'::jsonb),('status:conflict','["ok", ["80000000-0000-4000-8000-000000146242"]]'::jsonb),('status:duplicate','["ok", ["80000000-0000-4000-8000-000000146241"]]'::jsonb),('status:rejected','["ok", ["80000000-0000-4000-8000-000000146243"]]'::jsonb),('zero-authorized','["ok", "0", "0", "0", "0", 0, [], null]'::jsonb)) expected order by 1
 $expected$,
 'mobile valid status kind and empty-period results remain distinct from denial'
);

-- P12
select results_eq(
 $actual$
 select 'foreign'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146221'::uuid) r) x union all select 'missing'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146299'::uuid) r) x order by label
 $actual$,
 $expected$
 select * from (values ('foreign','not_found',true),('missing','not_found',true)) expected order by 1
 $expected$,
 'missing or foreign sale identifiers expose no mobile detail'
);

-- P13 no constraint is disabled; only a legacy sale currency changes transactionally.
update public.pos_sales set currency='USD' where pos_sale_id='80000000-0000-4000-8000-000000146213';
select results_eq(
 $actual$
 select 'detail'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146213'::uuid) r) x union all select 'page'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_sale_number=>'TASK146-END') r) x union all select 'summary'::text label,r->>'code',r->'data'='null'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-08-03', p_to_date=>date '2026-08-03') r) x order by label
 $actual$,
 $expected$
 select * from (values ('detail','currency_unsupported',true),('page','currency_unsupported',true),('summary','currency_unsupported',true)) expected order by 1
 $expected$,
 'mobile sales rejects unsupported currency without partial financial data'
);
update public.pos_sales set currency='CLP' where pos_sale_id='80000000-0000-4000-8000-000000146213';

-- P14 exact JSON scalar type and value oracles, including independent legacy fallback.
create temporary table task146_scalar_vectors(label text primary key,actual jsonb,expected jsonb) on commit drop;
insert into task146_scalar_vectors select 'canonical-page-money',jsonb_build_array(s->'gross_amount_clp',s->'discount_amount_clp',s->'net_amount_clp'),'["9007199254740993", "2", "9007199254740991"]'::jsonb from task146_parity_responses r cross join lateral jsonb_array_elements(r.response#>'{data,sales}') s where r.action='page' and s->>'pos_sale_id'='80000000-0000-4000-8000-000000146211';
insert into task146_scalar_vectors select 'refund-page-money',jsonb_build_array(s->'gross_amount_clp',s->'discount_amount_clp',s->'net_amount_clp'),'["7", "0", "-7"]'::jsonb from task146_parity_responses r cross join lateral jsonb_array_elements(r.response#>'{data,sales}') s where r.action='page' and s->>'pos_sale_id'='80000000-0000-4000-8000-000000146212';
insert into task146_scalar_vectors select 'legacy-rounded-refund',jsonb_build_array(s->'gross_amount_clp',s->'discount_amount_clp',s->'net_amount_clp'),'["15", "3", "-13"]'::jsonb from task146_parity_responses r cross join lateral jsonb_array_elements(r.response#>'{data,sales}') s where r.action='page' and s->>'pos_sale_id'='80000000-0000-4000-8000-000000146215';
insert into task146_scalar_vectors select 'detail-line-scalars',jsonb_build_array(response#>'{data,lines,0,unit_amount_clp}',response#>'{data,lines,0,line_amount_clp}',response#>'{data,lines,0,quantity}'),'["9007199254740993","9007199254740991","1.250"]'::jsonb from task146_parity_responses where action='detail';
insert into task146_scalar_vectors select 'detail-canonical-money',jsonb_build_array(response#>'{data,sale,gross_amount_clp}',response#>'{data,sale,discount_amount_clp}',response#>'{data,sale,net_amount_clp}'),'["9007199254740993","2","9007199254740991"]'::jsonb from task146_parity_responses where action='detail';
insert into task146_scalar_vectors select 'summary-canonical-money',jsonb_agg(jsonb_build_array(d->'business_date',d->'gross_sales_clp',d->'discounts_clp',d->'refunds_clp',d->'net_revenue_clp',d->'sale_count',d->'refund_count',d->'transaction_count') order by ordinal),
 '[ ["2026-08-03","20","0","0","20",1,0,1], ["2026-08-02","0","0","-13","-13",0,1,1], ["2026-08-01","9007199254740993","-2","-7","9007199254740984",1,1,2] ]'::jsonb
 from task146_parity_responses r cross join lateral jsonb_array_elements(r.response#>'{data,summary_days}') with ordinality days(d,ordinal) where r.action='summary';
update public.pos_sales set gross_amount_clp=9223372036854775807,discount_amount_clp=0,net_amount_clp=9223372036854775807,business_kind='sale' where pos_sale_id='80000000-0000-4000-8000-000000146211';
insert into task146_scalar_vectors select 'int64-max-detail',jsonb_build_array(r#>'{data,sale,gross_amount_clp}',r#>'{data,sale,net_amount_clp}'),'["9223372036854775807", "9223372036854775807"]'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) x;
insert into task146_scalar_vectors select 'int64-max-page',jsonb_build_array(r#>'{data,sales,0,gross_amount_clp}',r#>'{data,sales,0,net_amount_clp}'),'["9223372036854775807", "9223372036854775807"]'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_sale_number=>'TASK146-TIE-A') r) x;
update public.pos_sales set gross_amount_clp=9223372036854775807,discount_amount_clp=0,net_amount_clp=-9223372036854775808,business_kind='refund' where pos_sale_id='80000000-0000-4000-8000-000000146211';
insert into task146_scalar_vectors select 'int64-min-detail',jsonb_build_array(r#>'{data,sale,gross_amount_clp}',r#>'{data,sale,net_amount_clp}'),'["9223372036854775807", "-9223372036854775808"]'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid) r) x;
insert into task146_scalar_vectors select 'int64-min-page',jsonb_build_array(r#>'{data,sales,0,gross_amount_clp}',r#>'{data,sales,0,net_amount_clp}'),'["9223372036854775807", "-9223372036854775808"]'::jsonb from (select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03', p_sale_number=>'TASK146-TIE-A') r) x;
update public.pos_sales set gross_amount_clp=9007199254740993,discount_amount_clp=2,net_amount_clp=9007199254740991,business_kind='sale' where pos_sale_id='80000000-0000-4000-8000-000000146211';
select results_eq(
 $actual$
 select label,actual from task146_scalar_vectors order by label
 $actual$,
 $expected$
 select * from (values ('canonical-page-money','["9007199254740993", "2", "9007199254740991"]'::jsonb),('detail-canonical-money','["9007199254740993", "2", "9007199254740991"]'::jsonb),('detail-line-scalars','["9007199254740993", "9007199254740991", "1.250"]'::jsonb),('int64-max-detail','["9223372036854775807", "9223372036854775807"]'::jsonb),('int64-max-page','["9223372036854775807", "9223372036854775807"]'::jsonb),('int64-min-detail','["9223372036854775807", "-9223372036854775808"]'::jsonb),('int64-min-page','["9223372036854775807", "-9223372036854775808"]'::jsonb),('legacy-rounded-refund','["15", "3", "-13"]'::jsonb),('refund-page-money','["7", "0", "-7"]'::jsonb),('summary-canonical-money','[["2026-08-03", "20", "0", "0", "20", 1, 0, 1], ["2026-08-02", "0", "0", "-13", "-13", 0, 1, 1], ["2026-08-01", "9007199254740993", "-2", "-7", "9007199254740984", 1, 1, 2]]'::jsonb)) expected order by 1
 $expected$,
 'mobile financial amounts and line quantity match canonical scalar oracles'
);

-- P15 compare complete synthetic business rows around fresh calls to all four actions.
create temporary table task146_before_actions on commit drop as select jsonb_build_object('sales',(select jsonb_agg(to_jsonb(s) order by pos_sale_id) from public.pos_sales s where s.shop_id='10000000-0000-4000-8000-000000000211'),'lines',(select jsonb_agg(to_jsonb(l) order by pos_sale_line_id) from public.pos_sale_lines l where l.shop_id='10000000-0000-4000-8000-000000000211'),'ledger',(select jsonb_agg(to_jsonb(e) order by pos_revenue_ledger_entry_id) from public.pos_revenue_ledger_entries e where e.shop_id='10000000-0000-4000-8000-000000000211')) as value;
do $task146_read_only$ begin perform public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03'); end $task146_read_only$;
do $task146_read_only$ begin perform public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'page', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03'); end $task146_read_only$;
do $task146_read_only$ begin perform public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid); end $task146_read_only$;
do $task146_read_only$ begin perform public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'filter', p_from_date=>date '2026-08-01', p_to_date=>date '2026-08-03'); end $task146_read_only$;
select is((jsonb_build_object('sales',(select jsonb_agg(to_jsonb(s) order by pos_sale_id) from public.pos_sales s where s.shop_id='10000000-0000-4000-8000-000000000211'),'lines',(select jsonb_agg(to_jsonb(l) order by pos_sale_line_id) from public.pos_sale_lines l where l.shop_id='10000000-0000-4000-8000-000000000211'),'ledger',(select jsonb_agg(to_jsonb(e) order by pos_revenue_ledger_entry_id) from public.pos_revenue_ledger_entries e where e.shop_id='10000000-0000-4000-8000-000000000211'))),(select value from task146_before_actions),'mobile sales actions leave fixture business rows unchanged');

-- P14 additional: numeric NaN must not escape as a quantity string.
update public.pos_sale_lines set quantity='NaN'::numeric where pos_sale_line_id='90000000-0000-4000-8000-000014621101';
select throws_ok($sql$select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'detail', p_pos_sale_id=>'80000000-0000-4000-8000-000000146211'::uuid)$sql$,'22023','mobile_sales_quantity_invalid','nonfinite mobile line quantity fails closed');
update public.pos_sale_lines set quantity=1.250 where pos_sale_line_id='90000000-0000-4000-8000-000014621101';

-- P14 additional LAST business check: an isolated ledger sum beyond Int64 raises22003.
insert into public.pos_sales (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_code,shop_device_id,staff_id,pos_session_id,
 client_sale_id,idempotency_key,payload_hash,sale_number,occurred_at,business_date,currency,
 subtotal,discount_total,tax_total,total,status,business_kind,gross_amount_clp,discount_amount_clp,net_amount_clp,fiscal_status,created_at,updated_at)
values ('80000000-0000-4000-8000-000000146230','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','TASK146','40000000-0000-4000-8000-000000146211','30000000-0000-4000-8000-000000146211','60000000-0000-4000-8000-000000146211',
 'TASK146-SALE-146230','TASK146-SALE-146230','sha256:'||repeat('b',64),'TASK146-OVERFLOW',
 '2026-09-01T12:00:00Z','2026-09-01','CLP',11.49,1.49,0,9.49,'accepted','sale',9223372036854775807,0,9223372036854775807,'not_required','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
insert into public.pos_revenue_ledger_entries (pos_sale_id,pos_sales_sync_batch_id,shop_id,shop_device_id,business_date,occurred_at,currency,entry_type,amount_clp,client_entry_id) values ('80000000-0000-4000-8000-000000146230','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','2026-09-01','2026-09-01T12:00:00Z','CLP','item',9223372036854775807,'TASK146-OVERFLOW-MAX'),('80000000-0000-4000-8000-000000146230','70000000-0000-4000-8000-000000146211','10000000-0000-4000-8000-000000000211','40000000-0000-4000-8000-000000146211','2026-09-01','2026-09-01T12:00:00Z','CLP','item',1,'TASK146-OVERFLOW-ONE');
select throws_ok($sql$select public.mobile_sales_read_v1(p_shop_id=>'10000000-0000-4000-8000-000000000211'::uuid, p_device_identifier=>'TASK146-DEVICE-146211', p_action=>'summary', p_from_date=>'2026-09-01'::date, p_to_date=>'2026-09-01'::date)$sql$,'22003',null,'mobile financial aggregate overflow propagates without saturation');

select * from finish();
rollback;
