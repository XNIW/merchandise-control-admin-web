begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'storefront_settings',
        'storefront_categories',
        'storefront_image_publications',
        'storefront_product_publications',
        'storefront_promotions',
        'storefront_promotion_products'
      )
      and class.relkind = 'r'
  ),
  6,
  'TASK-005 installs the six authoritative Storefront tables'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_product_publications'
      and column_name = 'retail_price_clp'
      and data_type = 'bigint'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_product_publications'
      and column_name = 'compare_at_price_clp'
      and data_type = 'bigint'
  ),
  'customer CLP values are integer bigint columns'
);

select ok(
  (
    select column_default = 'false'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_settings'
      and column_name = 'storefront_enabled'
  )
  and (
    select column_default = 'false'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_settings'
      and column_name = 'delivery_enabled'
  )
  and (
    select column_default = 'false'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_settings'
      and column_name = 'reservation_enabled'
  ),
  'release-sensitive Storefront flags default OFF'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname in (
        'storefront_settings',
        'storefront_categories',
        'storefront_image_publications',
        'storefront_product_publications',
        'storefront_promotions',
        'storefront_promotion_products'
      )
  ),
  'all Storefront authoring tables enable and force RLS'
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
        'storefront_settings',
        'storefront_categories',
        'storefront_image_publications',
        'storefront_product_publications',
        'storefront_promotions',
        'storefront_promotion_products'
      )
  ),
  0,
  'authoring tables remain default-deny until server-side Admin RPCs exist'
);

select ok(
  not has_table_privilege('anon', 'public.storefront_settings', 'SELECT')
  and not has_table_privilege('anon', 'public.storefront_categories', 'SELECT')
  and not has_table_privilege(
    'anon',
    'public.storefront_image_publications',
    'SELECT'
  )
  and not has_table_privilege(
    'anon',
    'public.storefront_product_publications',
    'SELECT'
  )
  and not has_table_privilege('anon', 'public.storefront_promotions', 'SELECT')
  and not has_table_privilege(
    'anon',
    'public.storefront_promotion_products',
    'SELECT'
  ),
  'anon has no direct authoring-table privileges'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.storefront_settings',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_categories',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_image_publications',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_product_publications',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_promotions',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_promotion_products',
    'SELECT'
  ),
  'authenticated customers have no direct authoring-table privileges'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.storefront_product_publications',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.storefront_promotions',
    'SELECT'
  )
  and has_table_privilege(
    'service_role',
    'public.storefront_product_publications',
    'INSERT'
  )
  and has_table_privilege(
    'service_role',
    'public.storefront_product_publications',
    'UPDATE'
  )
  and has_table_privilege(
    'service_role',
    'public.storefront_product_publications',
    'DELETE'
  ),
  'service_role has explicit authoring privileges for server-only workflows'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname in (
        'storefront_touch_updated_at_v1',
        'storefront_product_matches_shop_v1',
        'storefront_category_matches_shop_v1',
        'storefront_validate_category_v1',
        'storefront_validate_image_publication_v1',
        'storefront_validate_product_publication_v1'
      )
  ),
  6,
  'TASK-005 installs the complete private validation helper set'
);

select ok(
  (
    select bool_and(
      not procedure.prosecdef
      or procedure.proconfig = array['search_path=""']
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname like 'storefront_%_v1'
  ),
  'all Storefront SECURITY DEFINER helpers use an empty search_path'
);

select ok(
  (
    select not procedure.prosecdef and procedure.proconfig is null
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'app_private'
      and procedure.proname = 'storefront_public_catalog_rows_v1'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
        = 'p_shop_id uuid, p_at timestamp with time zone'
  ),
  'the fully-qualified read resolver is SECURITY INVOKER for predicate pushdown'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.storefront_product_matches_shop_v1(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_product_matches_shop_v1(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.storefront_validate_product_publication_v1()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_validate_product_publication_v1()',
    'EXECUTE'
  ),
  'mobile roles cannot execute private Storefront helpers'
);

select is(
  col_description(
    'public.storefront_product_publications'::regclass,
    (
      select ordinal_position
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'storefront_product_publications'
        and column_name = 'source_product_id'
    )
  ),
  'Stable internal inventory reference; never emitted by the public Storefront contract.',
  'the internal product reference is explicitly excluded from the public contract'
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
    '00000000-0000-4000-8000-000000005001',
    'authenticated',
    'authenticated',
    'storefront-owner-a@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000005002',
    'authenticated',
    'authenticated',
    'storefront-owner-b@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000005003',
    'authenticated',
    'authenticated',
    'storefront-customer@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.shops (
  shop_id,
  shop_code,
  shop_name,
  shop_status,
  archived_at,
  archived_by_profile_id
)
values
  (
    '10000000-0000-4000-8000-000000005001',
    'SFV1A',
    'Storefront fixture A',
    'active',
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000005002',
    'SFV1B',
    'Storefront fixture B',
    'active',
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000005003',
    'SFV1Z',
    'Storefront archived fixture',
    'archived',
    now(),
    '00000000-0000-4000-8000-000000005001'
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
    '30000000-0000-4000-8000-000000005001',
    '00000000-0000-4000-8000-000000005001',
    '10000000-0000-4000-8000-000000005001',
    'Fixture A',
    now()
  ),
  (
    '30000000-0000-4000-8000-000000005002',
    '00000000-0000-4000-8000-000000005002',
    '10000000-0000-4000-8000-000000005002',
    'Fixture B',
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
    '20000000-0000-4000-8000-000000005001',
    '00000000-0000-4000-8000-000000005001',
    '10000000-0000-4000-8000-000000005001',
    'SFV1-5001',
    'Fixture product A',
    '30000000-0000-4000-8000-000000005001',
    12990,
    10,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000005002',
    '00000000-0000-4000-8000-000000005002',
    '10000000-0000-4000-8000-000000005002',
    'SFV1-5002',
    'Fixture product B',
    '30000000-0000-4000-8000-000000005002',
    9990,
    5,
    now()
  );

select lives_ok(
  $$
    insert into public.storefront_settings (
      shop_id,
      public_slug,
      require_product_image
    ) values
      (
        '10000000-0000-4000-8000-000000005001',
        'storefront-fixture-a',
        false
      ),
      (
        '10000000-0000-4000-8000-000000005002',
        'storefront-fixture-b',
        true
      )
  $$,
  'valid Storefront settings are accepted with flags default OFF'
);

select lives_ok(
  $$
    insert into public.storefront_categories (
      id,
      shop_id,
      source_category_id,
      slug,
      public_name,
      publication_status
    ) values
      (
        '40000000-0000-4000-8000-000000005001',
        '10000000-0000-4000-8000-000000005001',
        '30000000-0000-4000-8000-000000005001',
        'fixture-a',
        'Fixture A',
        'published'
      ),
      (
        '40000000-0000-4000-8000-000000005002',
        '10000000-0000-4000-8000-000000005002',
        '30000000-0000-4000-8000-000000005002',
        'fixture-b',
        'Fixture B',
        'published'
      )
  $$,
  'valid public categories retain shop-scoped provenance'
);

select throws_ok(
  $$
    insert into public.storefront_categories (
      shop_id, slug, public_name
    ) values (
      '10000000-0000-4000-8000-000000005003',
      'archived-shop',
      'Archived shop'
    )
  $$,
  '23514',
  null,
  'an archived shop cannot receive Storefront category writes'
);

select throws_ok(
  $$
    insert into public.storefront_categories (
      shop_id, source_category_id, slug, public_name
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '30000000-0000-4000-8000-000000005002',
      'cross-shop',
      'Cross shop'
    )
  $$,
  '23514',
  null,
  'a category cannot reference another shop inventory source'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id, source_product_id, public_name, retail_price_clp
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'Negative price',
      -1
    )
  $$,
  '23514',
  null,
  'negative CLP prices are rejected server-side'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id,
      source_product_id,
      public_name,
      retail_price_clp,
      compare_at_price_clp
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'Invalid comparison',
      1000,
      999
    )
  $$,
  '23514',
  null,
  'compare-at CLP cannot be lower than the customer price'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id,
      source_product_id,
      public_name,
      retail_price_clp,
      promotion_starts_at,
      promotion_ends_at
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'Invalid window',
      1000,
      now(),
      now() - interval '1 minute'
    )
  $$,
  '23514',
  null,
  'product promotion start must precede end'
);

select throws_ok(
  $$
    insert into public.storefront_promotions (
      shop_id,
      public_name,
      discount_type,
      discount_value,
      starts_at,
      ends_at
    ) values (
      '10000000-0000-4000-8000-000000005001',
      'Negative fixed price',
      'fixed_price_clp',
      -1,
      now(),
      now() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'negative fixed-price promotions are rejected'
);

select throws_ok(
  $$
    insert into public.storefront_promotions (
      shop_id,
      public_name,
      discount_type,
      discount_value,
      starts_at,
      ends_at
    ) values (
      '10000000-0000-4000-8000-000000005001',
      'Invalid percentage',
      'percentage_bps',
      10001,
      now(),
      now() + interval '1 hour'
    )
  $$,
  '23514',
  null,
  'percentage promotions cannot exceed one hundred percent'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id, source_product_id, public_name, retail_price_clp
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005002',
      'Cross-shop product',
      1000
    )
  $$,
  '23514',
  null,
  'a publication cannot reference another shop inventory product'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id,
      source_product_id,
      publication_status,
      public_name,
      retail_price_clp,
      pickup_enabled,
      published_at
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'published',
      'Missing category',
      1000,
      true,
      now()
    )
  $$,
  '23514',
  null,
  'published products require a public category'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id,
      source_product_id,
      publication_status,
      public_name,
      public_category_id,
      retail_price_clp,
      published_at
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'published',
      'Missing fulfillment',
      '40000000-0000-4000-8000-000000005001',
      1000,
      now()
    )
  $$,
  '23514',
  null,
  'published products require at least one fulfillment mode'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id,
      source_product_id,
      publication_status,
      public_name,
      public_category_id,
      retail_price_clp,
      pickup_enabled,
      published_at
    ) values (
      '10000000-0000-4000-8000-000000005002',
      '20000000-0000-4000-8000-000000005002',
      'published',
      'Image required',
      '40000000-0000-4000-8000-000000005002',
      1000,
      true,
      now()
    )
  $$,
  '23514',
  null,
  'shop policy can require a published public image'
);

select lives_ok(
  $$
    insert into public.storefront_product_publications (
      id,
      shop_id,
      source_product_id,
      publication_status,
      public_name,
      public_category_id,
      retail_price_clp,
      compare_at_price_clp,
      pickup_enabled,
      published_at
    ) values (
      '50000000-0000-4000-8000-000000005001',
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'published',
      'Published fixture',
      '40000000-0000-4000-8000-000000005001',
      10990,
      12990,
      true,
      now()
    )
  $$,
  'a complete published product is accepted'
);

select lives_ok(
  $$
    update public.storefront_product_publications
    set publication_status = 'paused'
    where id = '50000000-0000-4000-8000-000000005001'
  $$,
  'published products can be paused without erasing history'
);

select ok(
  (
    select published_at is not null
    from public.storefront_product_publications
    where id = '50000000-0000-4000-8000-000000005001'
  ),
  'pausing retains the original published_at timestamp'
);

select lives_ok(
  $$
    update public.storefront_product_publications
    set publication_status = 'ended'
    where id = '50000000-0000-4000-8000-000000005001'
  $$,
  'paused products can reach the terminal ended state'
);

select ok(
  (
    select published_at is not null
    from public.storefront_product_publications
    where id = '50000000-0000-4000-8000-000000005001'
  ),
  'ending a publication retains the original publication timestamp'
);

select throws_ok(
  $$
    insert into public.storefront_image_publications (
      shop_id,
      source_product_id,
      version_key,
      thumb_url
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'signed-url-v1',
      'https://example.invalid/object/sign/storefront/file.webp?token=secret'
    )
  $$,
  '23514',
  null,
  'signed Storage URLs are rejected from public image metadata'
);

select throws_ok(
  $$
    insert into public.storefront_image_publications (
      shop_id,
      source_product_id,
      version_key,
      detail_url
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'private-bucket-v1',
      'https://example.invalid/object/public/product-images/private.webp'
    )
  $$,
  '23514',
  null,
  'the internal product-images bucket cannot be exposed as public metadata'
);

select throws_ok(
  $$
    insert into public.storefront_image_publications (
      shop_id,
      source_product_id,
      publication_status,
      version_key,
      thumb_url,
      card_url,
      detail_url,
      width,
      height,
      content_type,
      content_sha256
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'ready',
      'missing-source-v1',
      'https://cdn.example.invalid/thumb.webp',
      'https://cdn.example.invalid/card.webp',
      'https://cdn.example.invalid/detail.webp',
      1200,
      1200,
      'image/webp',
      repeat('a', 64)
    )
  $$,
  '23514',
  null,
  'ready public images require immutable internal-pipeline provenance'
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
      starts_at,
      ends_at
    ) values (
      '60000000-0000-4000-8000-000000005001',
      '10000000-0000-4000-8000-000000005001',
      'Fixture promotion',
      'scheduled',
      'percentage_bps',
      1000,
      now(),
      now() + interval '1 day'
    )
  $$,
  'a valid CLP promotion is accepted'
);

select throws_ok(
  $$
    insert into public.storefront_promotion_products (
      shop_id, promotion_id, publication_id
    ) values (
      '10000000-0000-4000-8000-000000005002',
      '60000000-0000-4000-8000-000000005001',
      '50000000-0000-4000-8000-000000005001'
    )
  $$,
  '23503',
  null,
  'promotion-product links cannot cross shop boundaries'
);

set local role anon;

select throws_ok(
  $$ select count(*) from public.storefront_product_publications $$,
  '42501',
  null,
  'anon cannot read Storefront authoring rows directly'
);

select throws_ok(
  $$
    insert into public.storefront_settings (shop_id, public_slug)
    values (
      '10000000-0000-4000-8000-000000005001',
      'anon-write'
    )
  $$,
  '42501',
  null,
  'anon cannot write Storefront authoring rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000005003","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select count(*) from public.storefront_product_publications $$,
  '42501',
  null,
  'authenticated customers cannot read Storefront authoring rows directly'
);

select throws_ok(
  $$
    insert into public.storefront_product_publications (
      shop_id, source_product_id, public_name, retail_price_clp
    ) values (
      '10000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005001',
      'Customer write',
      1
    )
  $$,
  '42501',
  null,
  'authenticated customers cannot write Storefront authoring rows'
);

select is(
  (
    select count(*)::integer
    from public.inventory_products
    where id in (
      '20000000-0000-4000-8000-000000005001',
      '20000000-0000-4000-8000-000000005002'
    )
  ),
  0,
  'a customer cannot read internal inventory products'
);

select is(
  (
    select count(*)::integer
    from public.inventory_product_prices
    where shop_id in (
      '10000000-0000-4000-8000-000000005001',
      '10000000-0000-4000-8000-000000005002'
    )
  ),
  0,
  'a customer cannot read internal inventory prices'
);

select is(
  (
    select count(*)::integer
    from public.inventory_suppliers
    where shop_id in (
      '10000000-0000-4000-8000-000000005001',
      '10000000-0000-4000-8000-000000005002'
    )
  ),
  0,
  'a customer cannot read internal suppliers'
);

select throws_ok(
  $$ select count(*) from public.inventory_product_image_versions $$,
  '42501',
  null,
  'a customer cannot read internal image version metadata'
);

set local role postgres;

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_product_publications'
      and column_name in (
        'purchase_price',
        'supplier_id',
        'stock_quantity',
        'owner_user_id',
        'primary_image_version_id'
      )
  ),
  'authoring publications exclude purchase, supplier, exact-stock and private-image fields'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'storefront_image_publications'
      and column_name in ('main_path', 'thumb_path', 'signed_url')
  ),
  'public image metadata excludes internal Storage paths and signed URLs'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in (
        'storefront_categories_shop_status_sort_idx',
        'storefront_product_publications_shop_status_sort_idx',
        'storefront_product_publications_category_idx',
        'storefront_promotions_shop_status_window_idx'
      )
  ),
  4,
  'Storefront authoring access paths use deterministic composite indexes'
);

select ok(
  exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'storefront_product_publications'
      and constraint_name = 'storefront_product_publications_category_fkey'
      and constraint_type = 'FOREIGN KEY'
  )
  and exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'storefront_product_publications'
      and constraint_name = 'storefront_product_publications_image_fkey'
      and constraint_type = 'FOREIGN KEY'
  ),
  'publication category and image references use composite shop-scoped foreign keys'
);

select is(
  (
    select count(*)::integer
    from public.storefront_settings
    where storefront_enabled
       or pickup_enabled
       or delivery_enabled
       or reservation_enabled
  ),
  0,
  'fixture settings confirm all release flags remain OFF'
);

select * from finish();
rollback;
