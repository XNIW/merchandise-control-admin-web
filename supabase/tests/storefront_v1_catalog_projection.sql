begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(48);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'storefront_catalog_items',
        'storefront_catalog_versions'
      )
      and class.relkind = 'r'
  ),
  2,
  'TASK-006 installs both projection tables'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_catalog_items'
      and column_name in (
        'source_product_id',
        'owner_user_id',
        'supplier_id',
        'purchase_price',
        'stock_quantity',
        'source_image_version_id',
        'main_path',
        'thumb_path'
      )
  ),
  'projection excludes internal product, supplier, cost, exact-stock and path fields'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'storefront_catalog_items',
        'storefront_catalog_versions'
      )
  ),
  'projection tables enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class class on class.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'storefront_catalog_items',
        'storefront_catalog_versions'
      )
  ),
  0,
  'projection tables remain default-deny until TASK-010 RPCs'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.storefront_catalog_items',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_catalog_items',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon',
    'public.storefront_catalog_versions',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_catalog_versions',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles have no direct projection privileges'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.storefront_catalog_items',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.storefront_catalog_items',
    'INSERT,UPDATE,DELETE'
  ),
  'service role can inspect but cannot bypass projection mutation functions'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname in (
        'storefront_catalog_source_v1',
        'storefront_catalog_empty_sha256_v1',
        'storefront_catalog_lock_shop_v1',
        'storefront_catalog_refresh_publication_v1',
        'storefront_catalog_rebuild_shop_v1',
        'storefront_catalog_rebuild_statement_trigger_v1'
      )
  ),
  6,
  'TASK-006 installs the complete private projection helper set'
);

select ok(
  (
    select bool_and(
      procedure.prosecdef
      and procedure.proconfig = array['search_path=""']
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname like 'storefront_catalog_%_v1'
  ),
  'all projection helpers are SECURITY DEFINER with empty search_path'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.storefront_catalog_rebuild_shop_v1(uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_catalog_rebuild_shop_v1(uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.storefront_catalog_refresh_publication_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_catalog_refresh_publication_v1(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  'mobile roles cannot execute projection mutation helpers'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'storefront_catalog_items_shop_featured_keyset_idx',
        'storefront_catalog_items_shop_category_keyset_idx',
        'storefront_catalog_items_shop_availability_idx',
        'storefront_catalog_items_shop_discount_idx',
        'storefront_catalog_items_search_document_idx',
        'storefront_catalog_items_search_trgm_idx'
      )
  ),
  6,
  'projection installs deterministic keyset, filter, FTS and trigram indexes'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_extension extension
    where extension.extname = 'unaccent'
  )
  and exists (
    select 1
    from pg_catalog.pg_extension extension
    where extension.extname = 'pg_trgm'
  ),
  'supported Postgres search extensions are installed locally'
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
    '00000000-0000-4000-8000-000000006001',
    'authenticated',
    'authenticated',
    'storefront-projection-owner-a@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000006002',
    'authenticated',
    'authenticated',
    'storefront-projection-owner-b@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000006003',
    'authenticated',
    'authenticated',
    'storefront-projection-customer@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.shops (
  shop_id,
  shop_code,
  shop_name,
  shop_status
)
values
  (
    '10000000-0000-4000-8000-000000006001',
    'SFV6A',
    'Storefront projection A',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000006002',
    'SFV6B',
    'Storefront projection B',
    'active'
  );

insert into public.inventory_categories (
  id,
  owner_user_id,
  shop_id,
  name,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000006001',
    '00000000-0000-4000-8000-000000006001',
    '10000000-0000-4000-8000-000000006001',
    'Bebidas fixture',
    now()
  ),
  (
    '30000000-0000-4000-8000-000000006002',
    '00000000-0000-4000-8000-000000006002',
    '10000000-0000-4000-8000-000000006002',
    'Other fixture',
    now()
  );

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name,
  category_id,
  retail_price,
  stock_quantity,
  updated_at
)
values
  (
    '20000000-0000-4000-8000-000000006001',
    '00000000-0000-4000-8000-000000006001',
    '10000000-0000-4000-8000-000000006001',
    'SFV1-6001',
    'Internal fixture A',
    '30000000-0000-4000-8000-000000006001',
    12990,
    10,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000006002',
    '00000000-0000-4000-8000-000000006002',
    '10000000-0000-4000-8000-000000006002',
    'SFV1-6002',
    'Internal fixture B',
    '30000000-0000-4000-8000-000000006002',
    9990,
    5,
    now()
  );

select lives_ok(
  $$
    insert into public.storefront_settings (
      shop_id,
      public_slug,
      storefront_enabled,
      pickup_enabled,
      delivery_enabled,
      require_product_image
    ) values
      (
        '10000000-0000-4000-8000-000000006001',
        'projection-fixture-a',
        true,
        true,
        false,
        false
      ),
      (
        '10000000-0000-4000-8000-000000006002',
        'projection-fixture-b',
        true,
        true,
        false,
        false
      )
  $$,
  'projection settings can be initialized before publications exist'
);

insert into public.storefront_categories (
  id,
  shop_id,
  source_category_id,
  slug,
  public_name,
  publication_status,
  sort_rank
)
values
  (
    '40000000-0000-4000-8000-000000006001',
    '10000000-0000-4000-8000-000000006001',
    '30000000-0000-4000-8000-000000006001',
    'bebidas-calientes',
    'Bebidas calientes',
    'published',
    10
  ),
  (
    '40000000-0000-4000-8000-000000006002',
    '10000000-0000-4000-8000-000000006002',
    '30000000-0000-4000-8000-000000006002',
    'otros',
    'Otros',
    'published',
    20
  );

select lives_ok(
  $$
    insert into public.storefront_product_publications (
      id,
      shop_id,
      source_product_id,
      publication_status,
      public_name,
      public_description,
      public_category_id,
      public_brand,
      retail_price_clp,
      compare_at_price_clp,
      featured,
      sort_rank,
      pickup_enabled,
      availability_mode,
      published_at
    ) values (
      '50000000-0000-4000-8000-000000006001',
      '10000000-0000-4000-8000-000000006001',
      '20000000-0000-4000-8000-000000006001',
      'published',
      'Café 龙茶',
      'Tostado suave',
      '40000000-0000-4000-8000-000000006001',
      'Marca Ñ',
      10990,
      12990,
      true,
      5,
      true,
      'available',
      now()
    )
  $$,
  'publishing creates the projection in the same transaction'
);

select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  1,
  'published product has exactly one projected row'
);

select is(
  (
    select price_clp
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  10990::bigint,
  'projection carries the approved integer CLP customer price'
);

select ok(
  (
    select
      storefront_enabled
      and shop_pickup_enabled
      and not shop_delivery_enabled
      and pickup_enabled
      and not delivery_enabled
      and not reservation_enabled
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'shop feature flags remain distinct from product fulfillment capabilities'
);

select ok(
  (
    select search_text like '%cafe 龙茶%'
      and search_text like '%marca n%'
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'search text normalizes accents and preserves zh-Hans content'
);

select ok(
  (
    select search_document @@ pg_catalog.plainto_tsquery('simple', 'cafe')
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'search document is populated for FTS'
);

select ok(
  (
    select catalog_version = 1
      and item_count = 1
      and content_sha256 ~ '^[0-9a-f]{64}$'
    from public.storefront_catalog_versions
    where shop_id = '10000000-0000-4000-8000-000000006001'
  ),
  'first publish creates version one and a deterministic shop fingerprint'
);

select is(
  (
    select catalog_version
    from public.storefront_product_publications
    where id = '50000000-0000-4000-8000-000000006001'
  ),
  0::bigint,
  'projection versioning never rewrites or locks the authoring publication row'
);

select is(
  app_private.storefront_catalog_refresh_publication_v1(
    '50000000-0000-4000-8000-000000006001',
    '10000000-0000-4000-8000-000000006001',
    now()
  ),
  1::bigint,
  'identical publication refresh is idempotent'
);

select is(
  app_private.storefront_catalog_rebuild_shop_v1(
    '10000000-0000-4000-8000-000000006001',
    now()
  ),
  1::bigint,
  'identical shop rebuild is idempotent'
);

select lives_ok(
  $$
    update public.storefront_product_publications
    set public_name = 'Café premium 龙茶'
    where id = '50000000-0000-4000-8000-000000006001'
  $$,
  'public field update refreshes projection transactionally'
);

select ok(
  (
    select public_name = 'Café premium 龙茶' and catalog_version = 2
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'changed content advances version and replaces projected payload'
);

select lives_ok(
  $$
    update public.storefront_categories
    set public_name = 'Cafés y bebidas'
    where id = '40000000-0000-4000-8000-000000006001'
  $$,
  'category update rebuilds dependent projected items'
);

select ok(
  (
    select category_name = 'Cafés y bebidas' and catalog_version = 3
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'category rebuild advances version only for changed public content'
);

select lives_ok(
  $$
    insert into public.storefront_promotions (
      id,
      shop_id,
      public_name,
      publication_status,
      discount_type,
      discount_value,
      priority,
      starts_at,
      ends_at
    ) values (
      '60000000-0000-4000-8000-000000006001',
      '10000000-0000-4000-8000-000000006001',
      'Veinte por ciento',
      'active',
      'percentage_bps',
      2000,
      10,
      now() - interval '1 hour',
      now() + interval '1 hour'
    )
  $$,
  'active promotion without products does not corrupt projection'
);

select is(
  (
    select catalog_version
    from public.storefront_catalog_versions
    where shop_id = '10000000-0000-4000-8000-000000006001'
  ),
  3::bigint,
  'unlinked promotion does not cause a false version bump'
);

select lives_ok(
  $$
    insert into public.storefront_promotion_products (
      shop_id,
      promotion_id,
      publication_id
    ) values (
      '10000000-0000-4000-8000-000000006001',
      '60000000-0000-4000-8000-000000006001',
      '50000000-0000-4000-8000-000000006001'
    )
  $$,
  'linking an active promotion rebuilds the affected shop'
);

select ok(
  (
    select price_clp = 8792
      and compare_at_price_clp = 12990
      and promotion_id = '60000000-0000-4000-8000-000000006001'
      and discount_bps between 1 and 10000
      and catalog_version = 4
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'active percentage promotion produces deterministic integer CLP pricing'
);

select is(
  app_private.storefront_catalog_rebuild_shop_v1(
    '10000000-0000-4000-8000-000000006001',
    now() + interval '2 hours'
  ),
  5::bigint,
  'rebuild after promotion expiry removes stale discount and advances version'
);

select ok(
  (
    select price_clp = 10990
      and promotion_id is null
      and catalog_version = 5
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  'expired promotion is absent from rebuilt projection'
);

select is(
  app_private.storefront_catalog_rebuild_shop_v1(
    '10000000-0000-4000-8000-000000006001',
    now() + interval '2 hours'
  ),
  5::bigint,
  'repeated expiry rebuild is idempotent'
);

select is(
  app_private.storefront_catalog_rebuild_shop_v1(
    '10000000-0000-4000-8000-000000006001',
    now()
  ),
  6::bigint,
  'rebuild at an active instant restores promotion deterministically'
);

select throws_ok(
  $$
    select app_private.storefront_catalog_refresh_publication_v1(
      '50000000-0000-4000-8000-000000006001',
      '10000000-0000-4000-8000-000000006002',
      now()
    )
  $$,
  '42501',
  null,
  'projection refresh rejects cross-shop scope'
);

select throws_ok(
  $$
    select app_private.storefront_catalog_refresh_publication_v1(
      '50000000-0000-4000-8000-000000006999',
      null,
      now()
    )
  $$,
  'P0002',
  null,
  'projection refresh rejects unknown publications'
);

select lives_ok(
  $$
    update public.storefront_product_publications
    set publication_status = 'paused'
    where id = '50000000-0000-4000-8000-000000006001'
  $$,
  'pausing a product removes it transactionally from projection'
);

select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  0,
  'paused product is not projected'
);

select ok(
  (
    select item_count = 0 and catalog_version = 7
    from public.storefront_catalog_versions
    where shop_id = '10000000-0000-4000-8000-000000006001'
  ),
  'pause advances version and records an empty projection'
);

select lives_ok(
  $$
    update public.storefront_product_publications
    set publication_status = 'published'
    where id = '50000000-0000-4000-8000-000000006001'
  $$,
  'republishing restores projection without duplicates'
);

select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items
    where publication_id = '50000000-0000-4000-8000-000000006001'
  ),
  1,
  'republished product has one projected row'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.storefront_catalog_items $$,
  '42501',
  null,
  'anon cannot read projection tables directly'
);

select throws_ok(
  $$
    select app_private.storefront_catalog_rebuild_shop_v1(
      '10000000-0000-4000-8000-000000006001',
      now()
    )
  $$,
  '42501',
  null,
  'anon cannot execute private rebuild helper'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000006003","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select count(*) from public.storefront_catalog_versions $$,
  '42501',
  null,
  'authenticated customer cannot read projection versions directly'
);

select throws_ok(
  $$
    update public.storefront_catalog_items
    set price_clp = 1
    where publication_id = '50000000-0000-4000-8000-000000006001'
  $$,
  '42501',
  null,
  'authenticated customer cannot tamper with projected price'
);

select throws_ok(
  $$
    select app_private.storefront_catalog_refresh_publication_v1(
      '50000000-0000-4000-8000-000000006001',
      '10000000-0000-4000-8000-000000006001',
      now()
    )
  $$,
  '42501',
  null,
  'authenticated customer cannot execute private refresh helper'
);

set local role postgres;

select lives_ok(
  $$
    delete from public.storefront_product_publications
    where id = '50000000-0000-4000-8000-000000006001'
  $$,
  'publication delete rebuilds projection safely after foreign-key cascade'
);

select ok(
  (
    select count(*) = 0
    from public.storefront_catalog_items
    where shop_id = '10000000-0000-4000-8000-000000006001'
  )
  and (
    select item_count = 0 and catalog_version = 9
    from public.storefront_catalog_versions
    where shop_id = '10000000-0000-4000-8000-000000006001'
  ),
  'delete leaves no projected row and advances the catalog version once'
);

select * from finish();
rollback;
