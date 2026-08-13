\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\set QUIET on

begin;
set local role postgres;
set local search_path = public, extensions;
set local request.jwt.claim.role = 'service_role';

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '04000000-0000-4000-8000-000000000401',
  'authenticated', 'authenticated', 'wechat004-local-e2e@example.invalid',
  '{}', '{}', clock_timestamp(), clock_timestamp()
);

update public.profiles
set display_name = 'WECHAT-004 local E2E', profile_status = 'active', disabled_at = null
where profile_id = '04000000-0000-4000-8000-000000000401';

insert into public.shops (
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values (
  '14000000-0000-4000-8000-000000000401', 'W004E2E',
  'WECHAT-004 Local E2E', 'active',
  '04000000-0000-4000-8000-000000000401'
);

insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values (
  '04000000-0000-4000-8000-000000000401',
  '14000000-0000-4000-8000-000000000401', 'shop_owner', 'active'
);

create temporary table wechat004_e2e_state (
  key text primary key,
  value jsonb not null
) on commit drop;

insert into wechat004_e2e_state values (
  'baseline', jsonb_build_object(
    'event_id', coalesce((select max(id) from public.sync_events), 0)
  )
);

insert into wechat004_e2e_state values (
  'category', public.wechat_catalog_mutate_v1(
    '04000000-0000-4000-8000-000000000401',
    '14000000-0000-4000-8000-000000000401', 'category_create',
    '44000000-0000-4000-8000-000000000401',
    '45000000-0000-4000-8000-000000000401', null,
    '24000000-0000-4000-8000-000000000401',
    '{"name":"WECHAT-004 Local Category"}'::jsonb
  )
);

insert into wechat004_e2e_state values (
  'supplier', public.wechat_catalog_mutate_v1(
    '04000000-0000-4000-8000-000000000401',
    '14000000-0000-4000-8000-000000000401', 'supplier_create',
    '44000000-0000-4000-8000-000000000402',
    '45000000-0000-4000-8000-000000000402', null,
    '34000000-0000-4000-8000-000000000401',
    '{"name":"WECHAT-004 Local Supplier"}'::jsonb
  )
);

insert into wechat004_e2e_state values (
  'product', public.wechat_catalog_mutate_v1(
    '04000000-0000-4000-8000-000000000401',
    '14000000-0000-4000-8000-000000000401', 'product_create',
    '44000000-0000-4000-8000-000000000403',
    '45000000-0000-4000-8000-000000000403', null,
    '64000000-0000-4000-8000-000000000401',
    jsonb_build_object(
      'barcode', 'WeChat-Local-E2E-AbC',
      'productName', 'Created through real local Supabase',
      'categoryId', '24000000-0000-4000-8000-000000000401',
      'supplierId', '34000000-0000-4000-8000-000000000401',
      'purchasePrice', 12.345,
      'retailPrice', 23.456,
      'stockQuantity', 7
    )
  )
);

select jsonb_build_object(
  'schemaVersion', 1,
  'provenance', jsonb_build_object(
    'database', current_database(),
    'kind', 'supabase_local_real',
    'mutationRpc', 'wechat_catalog_mutate_v1',
    'rolledBack', true
  ),
  'actorUserId', '04000000-0000-4000-8000-000000000401',
  'shopId', '14000000-0000-4000-8000-000000000401',
  'mutation', (select value from wechat004_e2e_state where key = 'product'),
  'adminReadProduct', public.wechat_mini_read_v1(
    '04000000-0000-4000-8000-000000000401',
    'wechat_product_detail_v1',
    jsonb_build_object(
      'p_shop_id', '14000000-0000-4000-8000-000000000401',
      'p_product_id', '64000000-0000-4000-8000-000000000401'
    )
  )->0,
  'supplier', (
    select jsonb_build_object(
      'id', supplier.id,
      'owner_user_id', supplier.owner_user_id,
      'shop_id', supplier.shop_id,
      'name', supplier.name,
      'updated_at', supplier.updated_at,
      'deleted_at', supplier.deleted_at
    )
    from public.inventory_suppliers supplier
    where supplier.id = '34000000-0000-4000-8000-000000000401'
  ),
  'category', (
    select jsonb_build_object(
      'id', category.id,
      'owner_user_id', category.owner_user_id,
      'shop_id', category.shop_id,
      'name', category.name,
      'updated_at', category.updated_at,
      'deleted_at', category.deleted_at
    )
    from public.inventory_categories category
    where category.id = '24000000-0000-4000-8000-000000000401'
  ),
  'product', (
    select jsonb_build_object(
      'id', product.id,
      'owner_user_id', product.owner_user_id,
      'shop_id', product.shop_id,
      'barcode', product.barcode,
      'item_number', product.item_number,
      'product_name', product.product_name,
      'second_product_name', product.second_product_name,
      'purchase_price', product.purchase_price,
      'retail_price', product.retail_price,
      'stock_quantity', product.stock_quantity,
      'supplier_id', product.supplier_id,
      'category_id', product.category_id,
      'primary_image_version_id', product.primary_image_version_id,
      'primary_image_updated_at', product.primary_image_updated_at,
      'updated_at', product.updated_at,
      'deleted_at', product.deleted_at
    )
    from public.inventory_products product
    where product.id = '64000000-0000-4000-8000-000000000401'
  ),
  'prices', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', price.id,
      'owner_user_id', price.owner_user_id,
      'shop_id', price.shop_id,
      'product_id', price.product_id,
      'type', price.type,
      'price', price.price,
      'price_canonical', to_char(price.price, 'FM999999999999990.000'),
      'effective_at', price.effective_at,
      'source', price.source,
      'created_at', price.created_at,
      'updated_at', price.updated_at
    ) order by price.type), '[]'::jsonb)
    from public.inventory_product_prices price
    where price.product_id = '64000000-0000-4000-8000-000000000401'
  ),
  'events', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'owner_user_id', event.owner_user_id,
      'shop_id', event.shop_id,
      'domain', event.domain,
      'event_type', event.event_type,
      'source', event.source,
      'changed_count', event.changed_count,
      'entity_ids', event.entity_ids,
      'created_at', event.created_at
    ) order by event.id), '[]'::jsonb)
    from public.sync_events event
    where event.id > (select (value->>'event_id')::bigint
      from wechat004_e2e_state where key = 'baseline')
      and event.shop_id = '14000000-0000-4000-8000-000000000401'
  )
)::text;

rollback;
