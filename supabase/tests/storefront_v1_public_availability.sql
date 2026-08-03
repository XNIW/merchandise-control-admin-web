begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

select ok(
  to_regclass('app_private.storefront_product_availability_signals') is not null,
  'TASK-024 installs the private availability signal table'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'app_private'
      and table_name = 'storefront_product_availability_signals'
      and column_name in (
        'stock_quantity', 'purchase_price', 'supplier_id', 'owner_user_id'
      )
  ),
  'availability signals never persist exact stock, cost, supplier or owner data'
);

select ok(
  not has_table_privilege(
    'anon',
    'app_private.storefront_product_availability_signals',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.storefront_product_availability_signals',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'app_private.storefront_product_availability_signals',
    'INSERT,UPDATE,DELETE'
  ),
  'mobile roles have no signal access and service role cannot mutate the table directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.storefront_availability_ingest_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.storefront_availability_ingest_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.storefront_availability_ingest_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,text)',
    'EXECUTE'
  ),
  'only service_role can call the bounded operational ingest function'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000024001',
  'authenticated', 'authenticated', 'task024-owner@example.invalid',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  (
    '10000000-0000-4000-8000-000000024001',
    'SF24A', 'Storefront availability A', 'active'
  ),
  (
    '10000000-0000-4000-8000-000000024002',
    'SF24B', 'Storefront availability B', 'active'
  );

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '30000000-0000-4000-8000-000000024001',
  '00000000-0000-4000-8000-000000024001',
  '10000000-0000-4000-8000-000000024001',
  'TASK-024 category', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
)
select
  ('20000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000024001'::uuid,
  '10000000-0000-4000-8000-000000024001'::uuid,
  'SF24-' || value,
  'TASK-024 product ' || value,
  '30000000-0000-4000-8000-000000024001'::uuid,
  1000 + value,
  case value when 2 then 5 when 3 then 0 else 10 end,
  now()
from generate_series(1, 7) value;

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled, delivery_enabled,
  reservation_enabled, require_product_image, default_page_size,
  maximum_page_size, availability_low_stock_threshold
)
values (
  '10000000-0000-4000-8000-000000024001',
  'task024-availability', true, true, true, true, false, 20, 100, 5
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name,
  publication_status, sort_rank
)
values (
  '40000000-0000-4000-8000-000000024001',
  '10000000-0000-4000-8000-000000024001',
  '30000000-0000-4000-8000-000000024001',
  'task-024', 'TASK-024', 'published', 1
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
)
values
  (
    '50000000-0000-4000-8000-000000024001',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    'published', 'Available', '40000000-0000-4000-8000-000000024001',
    1001, true, true, false, 'unavailable', now()
  ),
  (
    '50000000-0000-4000-8000-000000024002',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000002',
    'published', 'Low stock', '40000000-0000-4000-8000-000000024001',
    1002, true, true, false, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000024003',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000003',
    'published', 'Unavailable', '40000000-0000-4000-8000-000000024001',
    1003, true, true, false, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000024004',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000004',
    'published', 'Reservation only',
    '40000000-0000-4000-8000-000000024001',
    1004, false, false, true, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000024005',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000005',
    'published', 'Pickup only', '40000000-0000-4000-8000-000000024001',
    1005, true, false, false, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000024006',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000006',
    'published', 'Delivery only', '40000000-0000-4000-8000-000000024001',
    1006, false, true, false, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000024007',
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000007',
    'published', 'Missing signal', '40000000-0000-4000-8000-000000024001',
    1007, true, true, false, 'available', now()
  );

select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024001'),
  'available', 'stock above threshold derives available'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024002'),
  'low_stock', 'positive stock at threshold derives low_stock'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024003'),
  'unavailable', 'zero stock derives unavailable'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024004'),
  'reservation_only', 'reservation-only fulfillment derives reservation_only'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024005'),
  'pickup_only', 'pickup-only fulfillment derives pickup_only'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024006'),
  'delivery_only', 'delivery-only fulfillment derives delivery_only'
);

select is(
  (
    select count(distinct item->>'availability')::integer
    from jsonb_array_elements(
      public.storefront_catalog_v1('task024-availability', null, 100)->'items'
    ) item
  ),
  6,
  'public catalog exposes all six and only six commercial availability states'
);

select ok(
  public.storefront_catalog_v1('task024-availability', null, 100)::text
    !~* '(source_product|owner_user|supplier|purchase_price|stock_quantity)',
  'public catalog leaks no internal product, owner, supplier, cost or exact-stock field'
);

select lives_ok(
  $$
    update public.storefront_product_publications
    set availability_mode = 'available'
    where id = '50000000-0000-4000-8000-000000024003'
  $$,
  'legacy/manual availability input is safely ignored instead of failing writes'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024003'),
  'unavailable', 'manual input cannot override the server-derived stock state'
);

select lives_ok(
  $$
    delete from app_private.storefront_product_availability_signals
    where shop_id = '10000000-0000-4000-8000-000000024001'
      and source_product_id = '20000000-0000-4000-8000-000000000007'
  $$,
  'test fixture can remove one private signal'
);
select is(
  public.storefront_product_detail_v1(
    'task024-availability',
    '50000000-0000-4000-8000-000000024007'
  )->'item'->>'availability',
  'unavailable', 'a missing signal fails closed in the public detail contract'
);
select is(
  (select availability_mode
   from app_private.storefront_catalog_source_v1(
     '50000000-0000-4000-8000-000000024007',
     '10000000-0000-4000-8000-000000024001', now()
   )),
  'unavailable', 'a missing signal fails closed in the cart source contract'
);

select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    2, 'low_stock', now(), now() + interval '1 hour',
    'task024-available-version-2'
  )->>'status',
  'applied', 'a newer operational signal is applied'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    2, 'low_stock', now(), now() + interval '1 hour',
    'task024-available-version-2'
  )->>'status',
  'duplicate', 'an identical source-version replay is idempotent'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    1, 'available', now(), now() + interval '1 hour',
    'task024-stale-version-one'
  )->>'status',
  'stale_ignored', 'an older source version cannot overwrite current state'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    2, 'available', now(), now() + interval '1 hour',
    'task024-version-two-conflict'
  )->>'status',
  'version_conflict', 'same version with a different payload fails closed'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    3, 'available', now() - interval '1 minute', now() + interval '1 hour',
    'task024-out-of-order-v3'
  )->>'status',
  'stale_ignored', 'a higher version with an older observation is ignored'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    3, 'available', now(), now() + interval '1 hour',
    'task024-available-version-2'
  )->>'status',
  'idempotency_conflict', 'an idempotency key cannot be reused for a new version'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024002',
    '20000000-0000-4000-8000-000000000001',
    3, 'available', now(), now() + interval '1 hour',
    'task024-cross-shop-denial'
  )->>'status',
  'scope_denied', 'cross-shop availability ingest is denied'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    3, 'available', now() + interval '6 minutes', now() + interval '1 hour',
    'task024-future-observation'
  )->>'status',
  'validation_failed', 'future-dated observations fail validation'
);
select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000001',
    3, 'available', now(), 'infinity'::timestamptz,
    'task024-unbounded-expiry'
  )->>'status',
  'validation_failed', 'external ingest requires a finite bounded expiry'
);

select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000006',
    2, 'unavailable', now() + interval '4 minutes',
    now() + interval '1 hour',
    'task024-future-within-tolerance'
  )->>'status',
  'applied', 'a bounded near-future operational observation is serialized and applied'
);
select lives_ok(
  $$
    update public.inventory_products
    set stock_quantity = 11
    where id = '20000000-0000-4000-8000-000000000006'
  $$,
  'a concurrent-boundary inventory refresh completes after the external observation'
);
select is(
  (
    select concat_ws(':', source_version, signal_state, source_kind)
    from app_private.storefront_product_availability_signals
    where shop_id = '10000000-0000-4000-8000-000000024001'
      and source_product_id = '20000000-0000-4000-8000-000000000006'
  ),
  '2:unavailable:operational_event',
  'an older inventory observation cannot overwrite a newer external signal'
);
select is(
  public.storefront_product_detail_v1(
    'task024-availability',
    '50000000-0000-4000-8000-000000024006'
  )->'item'->>'availability',
  'unavailable', 'public detail retains the newest serialized availability state'
);

select is(
  public.storefront_availability_ingest_v1(
    '10000000-0000-4000-8000-000000024001',
    '20000000-0000-4000-8000-000000000007',
    1, 'available', now() - interval '2 hours', now() - interval '1 hour',
    'task024-expired-observation'
  )->>'status',
  'applied_stale', 'an already-expired observation is retained only as stale evidence'
);
select is(
  public.storefront_product_detail_v1(
    'task024-availability',
    '50000000-0000-4000-8000-000000024007'
  )->'item'->>'availability',
  'unavailable', 'expired availability fails closed in public detail'
);
select is(
  (select availability_mode
   from app_private.storefront_catalog_source_v1(
     '50000000-0000-4000-8000-000000024007',
     '10000000-0000-4000-8000-000000024001', now()
   )),
  'unavailable', 'expired availability fails closed in cart source resolution'
);

select lives_ok(
  $$
    update public.inventory_products
    set stock_quantity = 0
    where id = '20000000-0000-4000-8000-000000000005'
  $$,
  'operational inventory change refreshes the availability signal transactionally'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024005'),
  'unavailable', 'inventory depletion immediately updates the stored commercial state'
);
select is(
  public.storefront_product_detail_v1(
    'task024-availability',
    '50000000-0000-4000-8000-000000024005'
  )->'item'->>'availability',
  'unavailable', 'inventory depletion immediately updates the public contract'
);

select lives_ok(
  $$
    update public.inventory_products
    set stock_quantity = 10
    where id = '20000000-0000-4000-8000-000000000005'
  $$,
  'operational restock refreshes the signal without manual publication input'
);
select is(
  (select availability_mode from public.storefront_product_publications
   where id = '50000000-0000-4000-8000-000000024005'),
  'pickup_only', 'restock restores the fulfillment-derived pickup_only state'
);

select is(
  app_private.storefront_inventory_signal_state_v1(null, 5, null),
  'unavailable', 'unknown exact stock fails closed'
);
select is(
  app_private.storefront_inventory_signal_state_v1('NaN'::double precision, 5, null),
  'unavailable', 'non-finite exact stock fails closed'
);
select is(
  app_private.storefront_effective_availability_v1(
    'available', now(), now() + interval '1 hour', false, false, false, now()
  ),
  'unavailable', 'a product with no enabled fulfillment mode fails closed'
);
select is(
  app_private.storefront_effective_availability_v1(
    'available', now() + interval '6 minutes', now() + interval '1 hour',
    true, true, false, now()
  ),
  'unavailable', 'a future-dated signal fails closed at read time'
);

set local role anon;
select throws_ok(
  $$
    select public.storefront_availability_ingest_v1(
      '10000000-0000-4000-8000-000000024001',
      '20000000-0000-4000-8000-000000000001',
      4, 'available', now(), now() + interval '1 hour',
      'task024-anon-must-not-ingest'
    )
  $$,
  '42501',
  null,
  'anon cannot invoke operational availability ingest'
);

set local role authenticated;
select throws_ok(
  $$
    select public.storefront_availability_ingest_v1(
      '10000000-0000-4000-8000-000000024001',
      '20000000-0000-4000-8000-000000000001',
      4, 'available', now(), now() + interval '1 hour',
      'task024-auth-must-not-ingest'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot invoke operational availability ingest'
);

set local role postgres;
select * from finish();
rollback;
