begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'storefront_catalog_version_v1',
        'storefront_settings_v1',
        'storefront_categories_v1',
        'storefront_catalog_v1',
        'storefront_search_v1',
        'storefront_product_detail_v1',
        'storefront_featured_v1',
        'storefront_offers_v1',
        'storefront_home_v1'
      )
  ),
  9,
  'TASK-010 installs the complete public Storefront v1 contract'
);

select ok(
  (
    select bool_and(
      procedure.prosecdef
      and procedure.provolatile = 's'
      and 'search_path=""' = any(procedure.proconfig)
      and 'statement_timeout=3s' = any(procedure.proconfig)
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'storefront_catalog_version_v1',
        'storefront_settings_v1',
        'storefront_categories_v1',
        'storefront_catalog_v1',
        'storefront_search_v1',
        'storefront_product_detail_v1',
        'storefront_featured_v1',
        'storefront_offers_v1',
        'storefront_home_v1'
      )
  ),
  'all public mobile Storefront functions are stable SECURITY DEFINER with closed search path and timeout'
);

select ok(
  has_function_privilege('anon', 'public.storefront_catalog_version_v1(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.storefront_catalog_version_v1(text)', 'EXECUTE')
  and has_function_privilege(
    'anon',
    'public.storefront_catalog_v1(text,text,integer,text,text,boolean,boolean,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.storefront_search_v1(text,text,text,integer,text)',
    'EXECUTE'
  ),
  'anon and authenticated can execute only the public RPC contract'
);

select ok(
  not has_function_privilege('anon', 'app_private.storefront_public_shop_v1(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.storefront_cursor_decode_v1(text)', 'EXECUTE')
  and not has_function_privilege(
    'anon',
    'app_private.storefront_public_catalog_rows_v1(uuid,timestamptz)',
    'EXECUTE'
  ),
  'mobile roles cannot execute private resolver, cursor or projection helpers'
);

select ok(
  not has_table_privilege('anon', 'public.storefront_catalog_items', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.storefront_catalog_items', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.storefront_catalog_versions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.storefront_catalog_versions', 'SELECT,INSERT,UPDATE,DELETE'),
  'RPC access does not grant direct projection table access'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000010001',
    'authenticated', 'authenticated', 'storefront-api-a@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000010002',
    'authenticated', 'authenticated', 'storefront-api-b@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000010003',
    'authenticated', 'authenticated', 'storefront-api-customer@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000010001', 'SF10A', 'Storefront API A', 'active'),
  ('10000000-0000-4000-8000-000000010002', 'SF10B', 'Storefront API B', 'active'),
  ('10000000-0000-4000-8000-000000010003', 'SF10C', 'Storefront disabled', 'active');

insert into public.inventory_categories (id, owner_user_id, shop_id, name, updated_at)
values
  (
    '30000000-0000-4000-8000-000000010001',
    '00000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    'Bebidas', now()
  ),
  (
    '30000000-0000-4000-8000-000000010002',
    '00000000-0000-4000-8000-000000010002',
    '10000000-0000-4000-8000-000000010002',
    'Otros', now()
  );

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
)
values
  (
    '20000000-0000-4000-8000-000000010001',
    '00000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    'SF10-0001', 'Internal coffee',
    '30000000-0000-4000-8000-000000010001', 1000, 10, now()
  ),
  (
    '20000000-0000-4000-8000-000000010002',
    '00000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    'SF10-0002', 'Internal tea',
    '30000000-0000-4000-8000-000000010001', 2000, 5, now()
  ),
  (
    '20000000-0000-4000-8000-000000010003',
    '00000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    'SF10-0003', 'Internal milk',
    '30000000-0000-4000-8000-000000010001', 1500, 10, now()
  ),
  (
    '20000000-0000-4000-8000-000000010004',
    '00000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    'SF10-0004', 'Internal paused',
    '30000000-0000-4000-8000-000000010001', 9000, 10, now()
  ),
  (
    '20000000-0000-4000-8000-000000010005',
    '00000000-0000-4000-8000-000000010002',
    '10000000-0000-4000-8000-000000010002',
    'SF10-0005', 'Internal other shop',
    '30000000-0000-4000-8000-000000010002', 9900, 10, now()
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled, delivery_enabled,
  reservation_enabled, require_product_image, default_page_size, maximum_page_size
)
values
  (
    '10000000-0000-4000-8000-000000010001', 'api-fixture-a', true,
    true, true, false, false, 2, 3
  ),
  (
    '10000000-0000-4000-8000-000000010002', 'api-fixture-b', true,
    true, false, false, false, 2, 3
  ),
  (
    '10000000-0000-4000-8000-000000010003', 'api-disabled', false,
    true, false, false, false, 2, 3
  );

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status, sort_rank
)
values
  (
    '40000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    '30000000-0000-4000-8000-000000010001',
    'bebidas-calientes', 'Bebidas calientes', 'published', 10
  ),
  (
    '40000000-0000-4000-8000-000000010002',
    '10000000-0000-4000-8000-000000010002',
    '30000000-0000-4000-8000-000000010002',
    'otros', 'Otros', 'published', 20
  );

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_description, public_category_id, public_brand, retail_price_clp,
  compare_at_price_clp, featured, sort_rank, pickup_enabled, delivery_enabled,
  availability_mode, published_at
)
values
  (
    '50000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    '20000000-0000-4000-8000-000000010001',
    'published', 'Café 龙茶', 'Tostado suave',
    '40000000-0000-4000-8000-000000010001', 'Marca Ñ',
    1000, 1200, true, 1, true, true, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000010002',
    '10000000-0000-4000-8000-000000010001',
    '20000000-0000-4000-8000-000000010002',
    'published', 'Té verde', 'Infusión',
    '40000000-0000-4000-8000-000000010001', 'Casa',
    2000, null, false, 2, true, true, 'low_stock', now()
  ),
  (
    '50000000-0000-4000-8000-000000010003',
    '10000000-0000-4000-8000-000000010001',
    '20000000-0000-4000-8000-000000010003',
    'published', 'Leche', 'Entera',
    '40000000-0000-4000-8000-000000010001', 'Casa',
    1500, null, false, 2, true, false, 'available', now()
  ),
  (
    '50000000-0000-4000-8000-000000010004',
    '10000000-0000-4000-8000-000000010001',
    '20000000-0000-4000-8000-000000010004',
    'paused', 'Producto privado', null,
    '40000000-0000-4000-8000-000000010001', null,
    9000, null, false, 3, true, false, 'available', null
  ),
  (
    '50000000-0000-4000-8000-000000010005',
    '10000000-0000-4000-8000-000000010002',
    '20000000-0000-4000-8000-000000010005',
    'published', 'Otro tenant', null,
    '40000000-0000-4000-8000-000000010002', null,
    9900, null, false, 1, true, false, 'available', now()
  );

insert into public.storefront_promotions (
  id, shop_id, public_name, publication_status, discount_type,
  discount_value, priority, starts_at, ends_at
)
values
  (
    '60000000-0000-4000-8000-000000010001',
    '10000000-0000-4000-8000-000000010001',
    'Promo programada vigente', 'scheduled', 'fixed_price_clp', 700, 20,
    now() - interval '1 minute', now() + interval '1 hour'
  ),
  (
    '60000000-0000-4000-8000-000000010002',
    '10000000-0000-4000-8000-000000010001',
    'Promo scaduta', 'active', 'fixed_price_clp', 100, 50,
    now() - interval '2 hours', now() - interval '1 hour'
  );

update public.storefront_product_publications
set public_barcode = '7800000001001',
    public_search_aliases = array['cafecito', 'bebida dragon']
where id = '50000000-0000-4000-8000-000000010001';

insert into public.storefront_promotion_products (shop_id, promotion_id, publication_id)
values
  (
    '10000000-0000-4000-8000-000000010001',
    '60000000-0000-4000-8000-000000010001',
    '50000000-0000-4000-8000-000000010001'
  ),
  (
    '10000000-0000-4000-8000-000000010001',
    '60000000-0000-4000-8000-000000010002',
    '50000000-0000-4000-8000-000000010002'
  );

select is(
  public.storefront_catalog_version_v1('api-fixture-a') ->> 'status',
  'ok',
  'catalog version resolves an enabled public shop'
);

select is(
  (public.storefront_catalog_version_v1('api-fixture-a') ->> 'itemCount')::integer,
  3,
  'catalog version reports only projected published items'
);

select is(
  public.storefront_catalog_version_v1('api-disabled') ->> 'status',
  'unavailable',
  'disabled shops fail closed without disclosing a distinct state'
);

select is(
  public.storefront_catalog_version_v1('UPPER/invalid') ->> 'status',
  'invalid',
  'invalid shop slugs are rejected before lookup'
);

select is(
  public.storefront_settings_v1('api-fixture-a') #>> '{fulfillment,delivery}',
  'true',
  'settings expose only current public fulfillment flags'
);

select is(
  public.storefront_settings_v1('api-fixture-a') ->> 'currency',
  'CLP',
  'settings expose CLP currency'
);

select is(
  public.storefront_categories_v1('api-fixture-a') ->> 'status',
  'ok',
  'category contract is available'
);

select is(
  pg_catalog.jsonb_array_length(
    public.storefront_categories_v1('api-fixture-a') -> 'categories'
  ),
  1,
  'category contract returns one public category without duplicates'
);

select is(
  public.storefront_catalog_v1('api-fixture-a') ->> 'status',
  'ok',
  'catalog contract is available to its owner'
);

select is(
  pg_catalog.jsonb_array_length(public.storefront_catalog_v1('api-fixture-a') -> 'items'),
  2,
  'catalog applies the configured default page size'
);

select ok(
  public.storefront_catalog_v1('api-fixture-a') ->> 'nextCursor' is not null,
  'catalog emits a continuation cursor when another item exists'
);

select is(
  (
    public.storefront_catalog_v1(
      'api-fixture-a',
      public.storefront_catalog_v1('api-fixture-a') ->> 'nextCursor'
    ) -> 'items' -> 0 ->> 'id'
  ),
  '50000000-0000-4000-8000-000000010002',
  'keyset continuation is deterministic across a sort-rank tie'
);

select is(
  public.storefront_catalog_v1(
    'api-fixture-a', null, 3, null, null, null, null, 'price_asc'
  ) -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'price ascending sort uses the current scheduled promotion price'
);

select is(
  public.storefront_catalog_v1(
    'api-fixture-a', null, 3, null, null, null, null, 'price_desc'
  ) -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010002',
  'price descending sort is deterministic'
);

select is(
  pg_catalog.jsonb_array_length(
    public.storefront_catalog_v1(
      'api-fixture-a', null, 3, null, 'low_stock'
    ) -> 'items'
  ),
  1,
  'availability filter returns only the requested commercial state'
);

select is(
  pg_catalog.jsonb_array_length(
    public.storefront_catalog_v1(
      'api-fixture-a', null, 3, 'bebidas-calientes', null, true
    ) -> 'items'
  ),
  1,
  'discount/category filters compose without exposing other rows'
);

select is(
  public.storefront_catalog_v1('api-fixture-a', null, 4) ->> 'status',
  'invalid',
  'page size above the shop maximum is rejected'
);

select is(
  public.storefront_catalog_v1('api-fixture-a', 'not_base64') ->> 'status',
  'invalid_cursor',
  'malformed cursors fail closed'
);

select is(
  public.storefront_product_detail_v1(
    'api-fixture-a', '50000000-0000-4000-8000-000000010001'
  ) -> 'item' ->> 'priceClp',
  '700',
  'detail activates a scheduled promotion by its temporal window'
);

select is(
  public.storefront_product_detail_v1(
    'api-fixture-a', '50000000-0000-4000-8000-000000010002'
  ) -> 'item' ->> 'priceClp',
  '2000',
  'detail ignores an expired promotion even if its authoring status is active'
);

select is(
  public.storefront_product_detail_v1(
    'api-fixture-a', '50000000-0000-4000-8000-000000010004'
  ) ->> 'status',
  'unavailable',
  'paused product detail is unavailable'
);

select is(
  public.storefront_product_detail_v1(
    'api-fixture-a', '50000000-0000-4000-8000-000000010005'
  ) ->> 'status',
  'unavailable',
  'cross-shop product detail is unavailable'
);

select is(
  public.storefront_search_v1('api-fixture-a', 'cafe') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'search normalizes Spanish accents'
);

select is(
  public.storefront_search_v1('api-fixture-a', '龙茶') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'search preserves zh-Hans content'
);

select is(
  public.storefront_search_v1('api-fixture-a', 'marca n') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'search includes the approved public brand'
);

create temp table task019_search_cursor as
select public.storefront_search_v1(
  'api-fixture-a', 'casa', null, 1
) as first_page;

select ok(
  (select first_page ->> 'nextCursor' from task019_search_cursor) is not null,
  'search emits a continuation cursor for a bounded first page'
);

select is(
  public.storefront_search_v1(
    'api-fixture-a',
    'casa',
    (select first_page ->> 'nextCursor' from task019_search_cursor),
    1
  ) -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010002',
  'search continuation is deterministic and does not repeat the first item'
);

select is(
  public.storefront_search_v1('api-fixture-a', 'cafecito') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'search includes explicitly approved public aliases'
);

select is(
  public.storefront_search_v1('api-fixture-a', '7800000001001') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'search includes only an explicitly approved public barcode'
);

select is(
  public.storefront_product_detail_v1(
    'api-fixture-a', '50000000-0000-4000-8000-000000010001'
  ) -> 'item' ->> 'barcode',
  '7800000001001',
  'detail exposes the approved public barcode'
);

select throws_ok(
  $$
    update public.storefront_product_publications
    set public_barcode = 'invalid barcode'
    where id = '50000000-0000-4000-8000-000000010001'
  $$,
  '23514',
  null,
  'public barcode validation rejects whitespace and control characters'
);

select throws_ok(
  $$
    update public.storefront_product_publications
    set public_search_aliases = array['']
    where id = '50000000-0000-4000-8000-000000010001'
  $$,
  '23514',
  null,
  'public alias validation rejects empty aliases'
);

select is(
  public.storefront_search_v1('api-fixture-a', 'x') ->> 'status',
  'invalid',
  'one-character search is rejected'
);

select is(
  public.storefront_featured_v1('api-fixture-a') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'featured endpoint returns featured public items only'
);

select is(
  public.storefront_offers_v1('api-fixture-a') -> 'items' -> 0 ->> 'id',
  '50000000-0000-4000-8000-000000010001',
  'offers endpoint returns only currently discounted products'
);

select is(
  public.storefront_home_v1('api-fixture-a') ->> 'status',
  'ok',
  'Home contract composes settings, categories, featured and offers'
);

select is(
  pg_catalog.jsonb_array_length(public.storefront_home_v1('api-fixture-a') -> 'featured'),
  1,
  'Home contains the real featured product'
);

select ok(
  not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.storefront_catalog_v1('api-fixture-a') -> 'items'
    ) item
    where (item ->> 'catalogVersion')::bigint <>
      (public.storefront_catalog_v1('api-fixture-a') ->> 'catalogVersion')::bigint
  ),
  'every public item exposes the current response catalog version'
);

select ok(
  not exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      (public.storefront_home_v1('api-fixture-a') -> 'featured') ||
      (public.storefront_home_v1('api-fixture-a') -> 'offers')
    ) item
    where (item ->> 'catalogVersion')::bigint <>
      (public.storefront_home_v1('api-fixture-a') ->> 'catalogVersion')::bigint
  ),
  'Home items expose the same catalog version as the Home envelope'
);

select is(
  public.storefront_home_v1('api-fixture-a', 21, 8, 8) ->> 'status',
  'invalid',
  'Home component limits are bounded'
);

select ok(
  public.storefront_product_detail_v1(
    'api-fixture-a', '50000000-0000-4000-8000-000000010001'
  )::text !~* '(source_product|owner_user|supplier|purchase|stock_quantity|internal|path)',
  'public detail contains no internal IDs, cost, supplier, exact stock or private path'
);

set local role anon;

select is(
  public.storefront_catalog_v1('api-fixture-a') ->> 'status',
  'ok',
  'anon can read the public catalog through the RPC'
);

select throws_ok(
  $$select count(*) from public.storefront_catalog_items$$,
  '42501',
  null,
  'anon direct projection access remains denied'
);

select throws_ok(
  $$select count(*) from public.inventory_products$$,
  '42501',
  null,
  'anon inventory access remains denied'
);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000010003',
  true
);

select is(
  public.storefront_search_v1('api-fixture-a', 'cafe') ->> 'status',
  'ok',
  'authenticated customer can search through the public RPC'
);

select is(
  (select count(*)::integer from public.inventory_products),
  0,
  'authenticated customer without shop membership reads no inventory rows'
);

select throws_ok(
  $$update public.storefront_catalog_items set featured = false$$,
  '42501',
  null,
  'authenticated customer cannot mutate the projection'
);

set local role postgres;

create temp table task010_cursor_snapshot as
select public.storefront_catalog_v1('api-fixture-a') ->> 'nextCursor' as cursor;

update public.storefront_product_publications
set public_name = 'Té verde premium'
where id = '50000000-0000-4000-8000-000000010002';

select is(
  public.storefront_catalog_v1(
    'api-fixture-a',
    (select cursor from task010_cursor_snapshot)
  ) ->> 'status',
  'catalog_changed',
  'continuation fails explicitly after the catalog version changes'
);

select * from finish();

rollback;
