begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function(
  'public',
  'admin_storefront_publications_read_v1',
  array[
    'uuid', 'text', 'text', 'uuid', 'text', 'boolean', 'boolean', 'text',
    'integer', 'integer', 'uuid', 'uuid', 'text', 'integer'
  ],
  'TASK-007 installs the Storefront Admin publication read boundary'
);
select has_function(
  'public',
  'admin_storefront_publication_mutate_v1',
  array['uuid', 'text', 'jsonb', 'uuid', 'uuid', 'text', 'integer'],
  'TASK-007 installs the transactional Storefront Admin mutation boundary'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_storefront_publications_read_v1(uuid,text,text,uuid,text,boolean,boolean,text,integer,integer,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.admin_storefront_publication_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_storefront_publication_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'authenticated accounts and the lease-bound server bridge can execute; anon cannot'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020007',
    'authenticated', 'authenticated', 'storefront-admin-owner@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000020008',
    'authenticated', 'authenticated', 'storefront-admin-outsider@example.invalid',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000020007', 'Storefront owner', 'active'),
  ('00000000-0000-4000-8000-000000020008', 'Storefront outsider', 'active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('10000000-0000-4000-8000-000000020007', 'SFADMIN7', 'Storefront Admin 7', 'active'),
  ('10000000-0000-4000-8000-000000020008', 'SFADMIN8', 'Storefront Admin 8', 'active');

insert into public.shop_members (profile_id, shop_id, role_key, membership_status)
values (
  '00000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  'shop_owner',
  'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '30000000-0000-4000-8000-000000020007',
  '00000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  'Bebidas internas',
  now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
) values
  (
    '20000000-0000-4000-8000-000000020007',
    '00000000-0000-4000-8000-000000020007',
    '10000000-0000-4000-8000-000000020007',
    'SFADMIN-0007', 'Nombre interno confidencial',
    '30000000-0000-4000-8000-000000020007', 450, 1200, 10, now()
  ),
  (
    '20000000-0000-4000-8000-000000020008',
    '00000000-0000-4000-8000-000000020008',
    '10000000-0000-4000-8000-000000020008',
    'SFADMIN-0008', 'Producto otro tenant', null, 800, 1800, 5, now()
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  require_product_image
) values (
  '10000000-0000-4000-8000-000000020007',
  'storefront-admin-fixture', true, true, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name,
  publication_status, sort_rank
) values (
  '40000000-0000-4000-8000-000000020007',
  '10000000-0000-4000-8000-000000020007',
  '30000000-0000-4000-8000-000000020007',
  'bebidas', 'Bebidas', 'published', 1
);

select ok(
  (
    select count(*) = 8
    from public.staff_role_permissions permission
    where permission.shop_id = '10000000-0000-4000-8000-000000020007'
      and permission.role_key = 'pos_admin'
      and permission.permission_key like 'storefront.%'
      and permission.enabled
  ),
  'new shops receive all eight canonical Storefront permissions for POS Admin'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  public.admin_storefront_publications_read_v1(
    '10000000-0000-4000-8000-000000020007'
  )->>'code',
  'success',
  'active personal-account shop owner can load Storefront publications'
);
select is(
  jsonb_array_length(
    public.admin_storefront_publications_read_v1(
      '10000000-0000-4000-8000-000000020007'
    )->'rows'
  ),
  1,
  'read boundary returns only inventory products from the authorized shop'
);
select ok(
  not (
    public.admin_storefront_publications_read_v1(
      '10000000-0000-4000-8000-000000020007'
    )->'rows'->0
  ) ?| array['purchase_price', 'supplier_id', 'owner_user_id'],
  'Admin publication response omits purchase cost, supplier and owner metadata'
);

select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'upsert',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicationStatus', 'draft',
      'publicName', 'Café público',
      'publicDescription', 'Descripción segura',
      'publicCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'retailPriceClp', 999999,
      'priceSourceMode', 'operational',
      'featured', true,
      'sortRank', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availabilityMode', 'available'
    )
  )->>'code',
  'success',
  'draft upsert succeeds through the transactional boundary'
);

set local role postgres;
select is(
  (
    select publication.retail_price_clp
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  1200::bigint,
  'operational price mode ignores the client price and rereads trusted inventory'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'upsert',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicationStatus', 'published',
      'publicName', 'Café público',
      'publicDescription', 'Descripción segura',
      'publicCategoryId', '40000000-0000-4000-8000-000000020007',
      'publicBrand', 'Marca pública',
      'retailPriceClp', 1000,
      'compareAtPriceClp', 1200,
      'priceSourceMode', 'override',
      'featured', true,
      'sortRank', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availabilityMode', 'available'
    )
  )->>'code',
  'success',
  'server validation permits a complete published product'
);
select is(
  public.storefront_product_detail_v1(
    'storefront-admin-fixture',
    '20000000-0000-4000-8000-000000020007'
  )->>'status',
  'unavailable',
  'public detail never accepts an internal source product ID'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items item
    where item.shop_id = '10000000-0000-4000-8000-000000020007'
      and item.public_name = 'Café público'
  ),
  1,
  'publishing rebuilds the customer-safe projection'
);
select ok(
  exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '10000000-0000-4000-8000-000000020007'
      and audit.event_key = 'shop.storefront.publication.upsert.success'
      and audit.metadata_redacted ? 'before'
      and audit.metadata_redacted ? 'after'
  ),
  'publication mutation records actor, before and after snapshots in audit'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020007',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'upsert',
    jsonb_build_object(
      'sourceProductId', '20000000-0000-4000-8000-000000020007',
      'publicationStatus', 'published',
      'publicName', 'Precio inválido',
      'retailPriceClp', 1300,
      'compareAtPriceClp', 1200,
      'priceSourceMode', 'override',
      'sortRank', 1,
      'pickupEnabled', true,
      'deliveryEnabled', false,
      'reservationEnabled', false,
      'availabilityMode', 'available'
    )
  )->>'code',
  'validation_failed',
  'compare-at below customer price fails closed'
);

select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'bulk_pause',
    jsonb_build_object(
      'publicationIds', jsonb_build_array(
        '50000000-0000-4000-8000-000000000000'
      )
    )
  )->>'code',
  'not_found',
  'bulk mutation cannot target an unknown or cross-shop publication'
);

select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'bulk_pause',
    jsonb_build_object(
      'publicationIds', jsonb_build_array(
        public.admin_storefront_publications_read_v1(
          '10000000-0000-4000-8000-000000020007'
        )->'rows'->0->>'publication_id'
      )
    )
  )->>'code',
  'success',
  'bulk pause is atomic for the selected publication set'
);

set local role postgres;
select is(
  (
    select publication.publication_status
    from public.storefront_product_publications publication
    where publication.source_product_id = '20000000-0000-4000-8000-000000020007'
  ),
  'paused',
  'bulk pause changes the authoritative row and removes it from projection'
);
select is(
  (
    select count(*)::integer
    from public.storefront_catalog_items item
    where item.shop_id = '10000000-0000-4000-8000-000000020007'
  ),
  0,
  'paused product disappears from the public projection'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000020008',
    'role', 'authenticated'
  )::text,
  true
);
select is(
  public.admin_storefront_publications_read_v1(
    '10000000-0000-4000-8000-000000020007'
  )->>'code',
  'permission_denied',
  'authenticated customer or cross-shop account cannot read Admin publications'
);
select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'bulk_pause',
    '{"publicationIds": ["50000000-0000-4000-8000-000000000000"]}'::jsonb
  )->>'code',
  'permission_denied',
  'authenticated customer or cross-shop account cannot mutate Storefront'
);

set local role service_role;
select is(
  public.admin_storefront_publication_mutate_v1(
    '10000000-0000-4000-8000-000000020007',
    'bulk_pause',
    '{"publicationIds": ["50000000-0000-4000-8000-000000000000"]}'::jsonb
  )->>'code',
  'permission_denied',
  'service role without a valid POS staff lease cannot use the authoring RPC'
);

set local role postgres;
select * from finish();
rollback;
