begin;

set local role postgres;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

select has_function(
  'app_private',
  'is_shop_catalog_row_write_allowed',
  array['uuid', 'uuid'],
  'TASK-137 release row-write authorization helper exists'
);
select is(
  has_function_privilege(
    'authenticated',
    'app_private.is_shop_catalog_row_write_allowed(uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated can use the row-write helper through RLS'
);
select is(
  has_function_privilege(
    'anon',
    'app_private.is_shop_catalog_row_write_allowed(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the row-write helper'
);

create or replace function pg_temp.task137_row_write_allowed(
  target_owner_user_id uuid,
  target_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select app_private.is_shop_catalog_row_write_allowed(
    target_owner_user_id,
    target_shop_id
  );
$$;

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
    '00000000-0000-4000-8000-000000001371',
    'authenticated',
    'authenticated',
    'task137-release-attacker@example.invalid',
    '{}'::jsonb,
    '{"display_name":"TASK-137 release actor"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000001372',
    'authenticated',
    'authenticated',
    'task137-release-victim@example.invalid',
    '{}'::jsonb,
    '{"display_name":"TASK-137 release victim"}'::jsonb,
    now(),
    now()
  );

insert into public.shops (
  shop_id,
  shop_code,
  shop_name,
  shop_status,
  suspended_at,
  suspended_by_profile_id
)
values
  (
    '10000000-0000-4000-8000-000000001371',
    'T137R1',
    'TASK-137 release actor shop',
    'active',
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000001372',
    'T137R2',
    'TASK-137 release victim shop',
    'active',
    null,
    null
  ),
  (
    '10000000-0000-4000-8000-000000001373',
    'T137R3',
    'TASK-137 release lifecycle shop',
    'suspended',
    now(),
    '00000000-0000-4000-8000-000000001371'
  );

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status
)
values
  (
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001371',
    'shop_owner',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000001372',
    '10000000-0000-4000-8000-000000001372',
    'shop_owner',
    'active'
  ),
  (
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001373',
    'shop_owner',
    'active'
  );

insert into public.shop_inventory_sources (
  shop_inventory_source_id,
  shop_id,
  owner_user_id,
  mapping_state,
  verified_at
)
values (
  '40000000-0000-4000-8000-000000001373',
  '10000000-0000-4000-8000-000000001373',
  '00000000-0000-4000-8000-000000001371',
  'mapped',
  now()
);

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name
)
values (
  '23000000-0000-4000-8000-000000001373',
  '00000000-0000-4000-8000-000000001371',
  '10000000-0000-4000-8000-000000001373',
  'TASK137-LIFECYCLE-FIXTURE',
  'TASK-137 lifecycle fixture'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000001371","role":"authenticated"}',
  true
);
select set_config(
  'request.headers',
  '{"x-client-info":"supabase-kt/3.6.0","x-merchandise-control-sync":"atomic-v1"}',
  true
);

select is(
  pg_temp.task137_row_write_allowed(
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001371'
  ),
  true,
  'active owner can mutate rows in their active shop'
);
select is(
  pg_temp.task137_row_write_allowed(
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001372'
  ),
  false,
  'active owner cannot mutate rows in another active shop'
);

select lives_ok(
  $$
    insert into public.inventory_suppliers (
      id, owner_user_id, shop_id, name
    ) values (
      '21000000-0000-4000-8000-000000001371',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001371',
      'TASK-137 release supplier'
    )
  $$,
  'same-shop supplier insert remains available'
);
select lives_ok(
  $$
    insert into public.inventory_categories (
      id, owner_user_id, shop_id, name
    ) values (
      '22000000-0000-4000-8000-000000001371',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001371',
      'TASK-137 release category'
    )
  $$,
  'same-shop category insert remains available'
);
select lives_ok(
  $$
    insert into public.shared_sheet_sessions (
      remote_id,
      owner_user_id,
      shop_id,
      payload_version,
      "timestamp",
      display_name,
      data
    ) values (
      '25000000-0000-4000-8000-000000001371',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001371',
      2,
      '2026-07-17T23:00:00Z',
      'TASK-137 release history',
      '[]'::jsonb
    )
  $$,
  'same-shop history insert remains available'
);
select is(
  (
    select count(*)::integer
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000001371'
      and source = 'android'
  ),
  3,
  'same-shop supplier, category and history writes emit one event each'
);

select throws_ok(
  $$
    insert into public.inventory_suppliers (
      id, owner_user_id, shop_id, name
    ) values (
      '21000000-0000-4000-8000-000000001372',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001372',
      'TASK-137 cross-shop supplier'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_suppliers"',
  'cross-shop supplier insert is denied'
);
select throws_ok(
  $$
    insert into public.inventory_categories (
      id, owner_user_id, shop_id, name
    ) values (
      '22000000-0000-4000-8000-000000001372',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001372',
      'TASK-137 cross-shop category'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_categories"',
  'cross-shop category insert is denied'
);
select throws_ok(
  $$
    insert into public.shared_sheet_sessions (
      remote_id,
      owner_user_id,
      shop_id,
      payload_version,
      "timestamp",
      display_name,
      data
    ) values (
      '25000000-0000-4000-8000-000000001372',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001372',
      2,
      '2026-07-17T23:01:00Z',
      'TASK-137 cross-shop history',
      '[]'::jsonb
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "shared_sheet_sessions"',
  'cross-shop history insert is denied'
);
select is(
  (
    select
      (select count(*) from public.inventory_suppliers
        where id = '21000000-0000-4000-8000-000000001372')
      + (select count(*) from public.inventory_categories
        where id = '22000000-0000-4000-8000-000000001372')
      + (select count(*) from public.shared_sheet_sessions
        where remote_id = '25000000-0000-4000-8000-000000001372')
  ),
  0::bigint,
  'cross-shop denials leave no business rows'
);
select is(
  (
    select count(*)
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000001372'
      and owner_user_id = '00000000-0000-4000-8000-000000001371'
  ),
  0::bigint,
  'cross-shop denials leave no victim-shop sync events'
);

select throws_ok(
  $$
    update public.inventory_suppliers
    set shop_id = '10000000-0000-4000-8000-000000001372'
    where id = '21000000-0000-4000-8000-000000001371'
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_suppliers"',
  'supplier cannot be rebound to another shop'
);
select throws_ok(
  $$
    update public.inventory_categories
    set shop_id = '10000000-0000-4000-8000-000000001372'
    where id = '22000000-0000-4000-8000-000000001371'
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_categories"',
  'category cannot be rebound to another shop'
);
select throws_ok(
  $$
    update public.shared_sheet_sessions
    set shop_id = '10000000-0000-4000-8000-000000001372'
    where remote_id = '25000000-0000-4000-8000-000000001371'
  $$,
  '42501',
  'new row violates row-level security policy for table "shared_sheet_sessions"',
  'history cannot be rebound to another shop'
);
select ok(
  (
    select count(*) = 3
    from (
      select shop_id from public.inventory_suppliers
      where id = '21000000-0000-4000-8000-000000001371'
      union all
      select shop_id from public.inventory_categories
      where id = '22000000-0000-4000-8000-000000001371'
      union all
      select shop_id from public.shared_sheet_sessions
      where remote_id = '25000000-0000-4000-8000-000000001371'
    ) row_scope
    where row_scope.shop_id = '10000000-0000-4000-8000-000000001371'
  )
  and not exists (
    select 1
    from public.sync_events
    where shop_id = '10000000-0000-4000-8000-000000001372'
      and owner_user_id = '00000000-0000-4000-8000-000000001371'
  ),
  'failed rebinds preserve all source rows and create no victim event'
);

set local role postgres;
select throws_ok(
  $$
    insert into public.inventory_suppliers (
      id, owner_user_id, shop_id, name
    ) values (
      '21000000-0000-4000-8000-000000001373',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001372',
      'TASK-137 trigger defense'
    )
  $$,
  '42501',
  'mobile atomic sync row scope is not authorized',
  'privileged event trigger independently rejects a cross-shop row'
);
select is(
  (
    select
      (select count(*) from public.inventory_suppliers
        where id = '21000000-0000-4000-8000-000000001373')
      + (select count(*) from public.sync_events
        where shop_id = '10000000-0000-4000-8000-000000001372'
          and owner_user_id = '00000000-0000-4000-8000-000000001371')
  ),
  0::bigint,
  'trigger defense failure rolls back both row and event'
);

set local role authenticated;
select set_config('request.headers', '{"x-client-info":"supabase-js/2.0"}', true);
select lives_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000001371',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001371',
      'TASK137-PRICE-PRODUCT',
      'TASK-137 price product'
    );
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price,
      effective_at, source, note, created_at
    ) values (
      '24000000-0000-4000-8000-000000001371',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001371',
      '23000000-0000-4000-8000-000000001371',
      'RETAIL',
      100,
      '2026-07-17 23:10:00',
      'TASK-137 release',
      'initial immutable price',
      '2026-07-17 23:10:00'
    );
  $$,
  'same-shop product and price fixtures remain writable'
);
select set_config('request.headers', '{}', true);
select throws_ok(
  $$
    update public.inventory_product_prices
    set price = 101
    where id = '24000000-0000-4000-8000-000000001371'
  $$,
  '23505',
  'price_idempotency_conflict',
  'omitted headers cannot bypass append-only price history'
);
select set_config(
  'request.headers',
  '{"x-client-info":"supabase-js/2.0","x-merchandise-control-sync":"atomic-v1"}',
  true
);
select throws_ok(
  $$
    update public.inventory_product_prices
    set price = 102
    where id = '24000000-0000-4000-8000-000000001371'
  $$,
  '23505',
  'price_idempotency_conflict',
  'supabase-js headers cannot bypass append-only price history'
);
select ok(
  (
    select price = 100
      and note = 'initial immutable price'
    from public.inventory_product_prices
    where id = '24000000-0000-4000-8000-000000001371'
  )
  and not exists (
    select 1
    from public.sync_events
    where entity_ids @> '{"price_ids":["24000000-0000-4000-8000-000000001371"]}'::jsonb
  ),
  'rejected price rewrites preserve the row and emit no event'
);
select lives_ok(
  $$
    update public.inventory_product_prices
    set price = 100,
        note = 'initial immutable price'
    where id = '24000000-0000-4000-8000-000000001371'
  $$,
  'identical direct price retry remains idempotent'
);
select is(
  (
    public.shop_catalog_import_price_history(
      '10000000-0000-4000-8000-000000001371',
      jsonb_build_array(jsonb_build_object(
        'price_id', '24000000-0000-4000-8000-000000001371',
        'product_id', '23000000-0000-4000-8000-000000001371',
        'type', 'RETAIL',
        'price', 100,
        'effective_at', '2026-07-17 23:10:00',
        'source', 'TASK-137 release',
        'note', 'initial immutable price',
        'created_at', '2026-07-17 23:10:00'
      ))
    ) ->> 'code'
  ),
  'success',
  'Admin price import accepts an exact idempotent replay'
);
select is(
  (
    public.shop_catalog_import_price_history(
      '10000000-0000-4000-8000-000000001371',
      jsonb_build_array(jsonb_build_object(
        'price_id', '24000000-0000-4000-8000-000000001371',
        'product_id', '23000000-0000-4000-8000-000000001371',
        'type', 'RETAIL',
        'price', 103,
        'effective_at', '2026-07-17 23:10:00',
        'source', 'TASK-137 release',
        'note', 'divergent rewrite',
        'created_at', '2026-07-17 23:10:00'
      ))
    ) ->> 'code'
  ),
  'db_failure',
  'Admin price import fails closed on a divergent historical replay'
);
select is(
  (
    select price
    from public.inventory_product_prices
    where id = '24000000-0000-4000-8000-000000001371'
  ),
  100::double precision,
  'failed Admin replay cannot rewrite the existing price'
);

select is(
  pg_temp.task137_row_write_allowed(
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001373'
  ),
  false,
  'suspended shop denies catalog writes despite active membership'
);
select throws_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000001374',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001373',
      'TASK137-SUSPENDED-PRODUCT',
      'TASK-137 suspended product'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'suspended shop rejects direct product insert'
);
select throws_ok(
  $$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price,
      effective_at, created_at
    ) values (
      '24000000-0000-4000-8000-000000001373',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001373',
      '23000000-0000-4000-8000-000000001373',
      'RETAIL',
      50,
      '2026-07-17 23:20:00',
      '2026-07-17 23:20:00'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_product_prices"',
  'suspended shop rejects direct price insert'
);
select throws_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000001375',
      '00000000-0000-4000-8000-000000001371',
      null,
      'TASK137-SUSPENDED-LEGACY',
      'TASK-137 suspended legacy product'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'legacy bridge rejects a mapped suspended shop'
);
select is(
  (
    public.shop_catalog_create_product(
      p_shop_id => '10000000-0000-4000-8000-000000001373',
      p_barcode => 'TASK137-SUSPENDED-RPC',
      p_product_name => 'TASK-137 suspended RPC product'
    ) ->> 'code'
  ),
  'unauthorized_or_unmapped',
  'catalog product RPC rejects a suspended shop'
);
select is(
  (
    public.shop_catalog_import_price_history(
      '10000000-0000-4000-8000-000000001373',
      jsonb_build_array(jsonb_build_object(
        'price_id', '24000000-0000-4000-8000-000000001374',
        'product_id', '23000000-0000-4000-8000-000000001373',
        'type', 'RETAIL',
        'price', 50,
        'effective_at', '2026-07-17 23:21:00'
      ))
    ) ->> 'code'
  ),
  'unauthorized_or_unmapped',
  'price import RPC rejects a suspended shop'
);

set local role postgres;
update public.shops
set shop_status = 'active',
    suspended_at = null,
    suspended_by_profile_id = null
where shop_id = '10000000-0000-4000-8000-000000001373';
set local role authenticated;
select is(
  pg_temp.task137_row_write_allowed(
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001373'
  ),
  true,
  'reactivating the shop restores the intended owner write authority'
);
select lives_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000001374',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001373',
      'TASK137-ACTIVE-PRODUCT',
      'TASK-137 active product'
    )
  $$,
  'reactivated shop accepts the intended shop-scoped product insert'
);
select lives_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000001375',
      '00000000-0000-4000-8000-000000001371',
      null,
      'TASK137-ACTIVE-LEGACY',
      'TASK-137 active legacy product'
    )
  $$,
  'reactivated mapped-owner bridge preserves legacy writes'
);

set local role postgres;
update public.profiles
set profile_status = 'disabled',
    disabled_at = now()
where profile_id = '00000000-0000-4000-8000-000000001371';
set local role authenticated;
select is(
  pg_temp.task137_row_write_allowed(
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001373'
  ),
  false,
  'disabled profile loses catalog write authority immediately'
);

set local role postgres;
update public.profiles
set profile_status = 'active',
    disabled_at = null
where profile_id = '00000000-0000-4000-8000-000000001371';
update public.shops
set shop_status = 'archived',
    archived_at = now(),
    archived_by_profile_id = '00000000-0000-4000-8000-000000001371'
where shop_id = '10000000-0000-4000-8000-000000001373';
set local role authenticated;
select is(
  pg_temp.task137_row_write_allowed(
    '00000000-0000-4000-8000-000000001371',
    '10000000-0000-4000-8000-000000001373'
  ),
  false,
  'archived shop cannot regain catalog write authority'
);
select throws_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '23000000-0000-4000-8000-000000001376',
      '00000000-0000-4000-8000-000000001371',
      '10000000-0000-4000-8000-000000001373',
      'TASK137-ARCHIVED-PRODUCT',
      'TASK-137 archived product'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'archived shop rejects direct product insert'
);
select is(
  (
    public.shop_catalog_create_product(
      p_shop_id => '10000000-0000-4000-8000-000000001373',
      p_barcode => 'TASK137-ARCHIVED-RPC',
      p_product_name => 'TASK-137 archived RPC product'
    ) ->> 'code'
  ),
  'unauthorized_or_unmapped',
  'catalog RPC remains fail-closed for an archived shop'
);

select * from finish();
rollback;
