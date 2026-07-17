begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

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
    '00000000-0000-4000-8000-000000000008',
    'authenticated',
    'authenticated',
    'dsc008-viewer@example.invalid',
    '{}'::jsonb,
    '{"display_name":"DSC-008 viewer"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000009',
    'authenticated',
    'authenticated',
    'dsc008-manager@example.invalid',
    '{}'::jsonb,
    '{"display_name":"DSC-008 manager"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000072',
    'authenticated',
    'authenticated',
    'dsc072-suspended@example.invalid',
    '{}'::jsonb,
    '{"display_name":"DSC-072 suspended owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000073',
    'authenticated',
    'authenticated',
    'dsc072-active@example.invalid',
    '{}'::jsonb,
    '{"display_name":"DSC-072 active owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000074',
    'authenticated',
    'authenticated',
    'dsc072-unmapped@example.invalid',
    '{}'::jsonb,
    '{"display_name":"DSC-072 unmapped owner"}'::jsonb,
    now(),
    now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  (
    '10000000-0000-4000-8000-000000000008',
    'DSC008V',
    'DSC-008 viewer shop',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000009',
    'DSC008M',
    'DSC-008 manager shop',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000072',
    'DSC072S',
    'DSC-072 suspended owner shop',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000073',
    'DSC072A',
    'DSC-072 active owner shop',
    'active'
  );

insert into public.shop_members (
  profile_id,
  shop_id,
  role_key,
  membership_status,
  suspended_at
)
values
  (
    '00000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000008',
    'viewer',
    'active',
    null
  ),
  (
    '00000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000009',
    'shop_manager',
    'active',
    null
  ),
  (
    '00000000-0000-4000-8000-000000000072',
    '10000000-0000-4000-8000-000000000072',
    'shop_owner',
    'suspended',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000073',
    '10000000-0000-4000-8000-000000000073',
    'shop_owner',
    'active',
    null
  );

insert into public.shop_inventory_sources (
  shop_inventory_source_id,
  shop_id,
  owner_user_id,
  mapping_state,
  verified_at
)
values
  (
    '40000000-0000-4000-8000-000000000072',
    '10000000-0000-4000-8000-000000000072',
    '00000000-0000-4000-8000-000000000072',
    'mapped',
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000073',
    '10000000-0000-4000-8000-000000000073',
    '00000000-0000-4000-8000-000000000073',
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
values
  (
    '20000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000008',
    'DSC008-UPDATE',
    'Viewer update fixture'
  ),
  (
    '20000000-0000-4000-8000-000000000072',
    '00000000-0000-4000-8000-000000000072',
    null,
    'DSC072-UPDATE',
    'Suspended legacy update fixture'
  ),
  (
    '20000000-0000-4000-8000-000000000073',
    '00000000-0000-4000-8000-000000000073',
    null,
    'DSC072-ACTIVE-PRICE',
    'Active mapped price parent'
  ),
  (
    '20000000-0000-4000-8000-000000000074',
    '00000000-0000-4000-8000-000000000074',
    null,
    'DSC072-UNMAPPED-PRICE',
    'Unmapped price parent'
  );

insert into public.inventory_product_prices (
  id,
  owner_user_id,
  shop_id,
  product_id,
  type,
  price,
  effective_at,
  created_at
)
values
  (
    '30000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000008',
    'RETAIL',
    8,
    '2026-07-15 11:58:00',
    '2026-07-15 11:58:00'
  ),
  (
    '30000000-0000-4000-8000-000000000072',
    '00000000-0000-4000-8000-000000000072',
    null,
    '20000000-0000-4000-8000-000000000072',
    'RETAIL',
    72,
    '2026-07-15 12:00:00',
    '2026-07-15 12:00:00'
  );

-- PostgreSQL requires a data-modifying CTE to be the top-level statement.
-- These SECURITY INVOKER helpers preserve the active SET ROLE/JWT context and
-- return the affected-row count without nesting UPDATE inside a pgTAP SELECT.
create or replace function pg_temp.dsc_update_inventory_product(
  p_product_id uuid,
  p_product_name text
)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row_count bigint;
begin
  update public.inventory_products
  set product_name = p_product_name
  where id = p_product_id;

  get diagnostics v_row_count = row_count;
  return v_row_count;
end;
$$;

create or replace function pg_temp.dsc_update_inventory_product_price(
  p_price_id uuid,
  p_note text
)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row_count bigint;
begin
  update public.inventory_product_prices
  set note = p_note
  where id = p_price_id;

  get diagnostics v_row_count = row_count;
  return v_row_count;
end;
$$;

select is(
  has_function_privilege(
    'anon',
    'app_private.is_legacy_inventory_write_allowed(uuid)',
    'EXECUTE'
  ),
  false,
  'legacy helper is not executable by anon'
);
select is(
  has_function_privilege(
    'authenticated',
    'app_private.is_legacy_inventory_write_allowed(uuid)',
    'EXECUTE'
  ),
  true,
  'legacy helper is executable by authenticated'
);
select is(
  exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where namespace.nspname = 'app_private'
      and procedure.proname = 'is_legacy_inventory_write_allowed'
      and procedure.pronargs = 1
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  false,
  'legacy helper has no PUBLIC execute privilege'
);
select is(
  has_table_privilege('authenticated', 'public.inventory_products', 'DELETE'),
  false,
  'authenticated keeps no product DELETE grant'
);
select is(
  has_table_privilege(
    'authenticated',
    'public.inventory_product_prices',
    'DELETE'
  ),
  false,
  'authenticated keeps no product price DELETE grant'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000008',
  true
);

select throws_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000108',
      '00000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000008',
      'DSC008-VIEWER-INSERT',
      'Viewer insert must fail'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'active viewer cannot insert a shop product'
);
select is(
  pg_temp.dsc_update_inventory_product(
    '20000000-0000-4000-8000-000000000008',
    'Viewer update must fail'
  ),
  0::bigint,
  'active viewer cannot update a shop product'
);
select throws_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000108',
      '00000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000008',
      '20000000-0000-4000-8000-000000000008',
      'RETAIL',
      9,
      '2026-07-15 11:59:00',
      '2026-07-15 11:59:00'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_product_prices"',
  'active viewer cannot insert a shop product price'
);
select is(
  pg_temp.dsc_update_inventory_product_price(
    '30000000-0000-4000-8000-000000000008',
    'Viewer price update must fail'
  ),
  0::bigint,
  'active viewer cannot update a shop product price'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000009',
  true
);

select lives_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000109',
      '00000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000009',
      'DSC008-MANAGER-INSERT',
      'Manager insert succeeds'
    )
  $dml$,
  'active manager can insert an owner-bound shop product'
);
select lives_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000109',
      '00000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000009',
      '20000000-0000-4000-8000-000000000109',
      'RETAIL',
      9,
      '2026-07-15 12:09:00',
      '2026-07-15 12:09:00'
    )
  $dml$,
  'active manager can insert an owner-bound shop product price'
);
select is(
  pg_temp.dsc_update_inventory_product_price(
    '30000000-0000-4000-8000-000000000109',
    'Manager price update succeeds'
  ),
  1::bigint,
  'active manager can update an owner-bound shop product price'
);
select throws_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000209',
      '00000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000008',
      'DSC008-CROSS-SHOP',
      'Cross-shop insert must fail'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'manager cannot insert into another shop'
);
select throws_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000309',
      '00000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000009',
      'DSC008-SPOOFED-OWNER',
      'Spoofed owner insert must fail'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'manager cannot spoof another row owner'
);
select throws_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000209',
      '00000000-0000-4000-8000-000000000009',
      '10000000-0000-4000-8000-000000000008',
      '20000000-0000-4000-8000-000000000109',
      'RETAIL',
      10,
      '2026-07-15 12:10:00',
      '2026-07-15 12:10:00'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_product_prices"',
  'manager cannot insert a product price into another shop'
);
select throws_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000309',
      '00000000-0000-4000-8000-000000000008',
      '10000000-0000-4000-8000-000000000009',
      '20000000-0000-4000-8000-000000000008',
      'RETAIL',
      11,
      '2026-07-15 12:11:00',
      '2026-07-15 12:11:00'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_product_prices"',
  'manager cannot spoof another product price owner'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000072',
  true
);

select throws_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000172',
      '00000000-0000-4000-8000-000000000072',
      null,
      'DSC072-SUSPENDED-INSERT',
      'Suspended mapped insert must fail'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_products"',
  'suspended mapped owner cannot insert a legacy product'
);
select is(
  pg_temp.dsc_update_inventory_product(
    '20000000-0000-4000-8000-000000000072',
    'Suspended mapped update must fail'
  ),
  0::bigint,
  'suspended mapped owner cannot update a legacy product'
);
select throws_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000172',
      '00000000-0000-4000-8000-000000000072',
      null,
      '20000000-0000-4000-8000-000000000072',
      'RETAIL',
      73,
      '2026-07-15 12:01:00',
      '2026-07-15 12:01:00'
    )
  $dml$,
  '42501',
  'new row violates row-level security policy for table "inventory_product_prices"',
  'suspended mapped owner cannot insert a legacy price'
);
select is(
  pg_temp.dsc_update_inventory_product_price(
    '30000000-0000-4000-8000-000000000072',
    'Suspended mapped update must fail'
  ),
  0::bigint,
  'suspended mapped owner cannot update a legacy price'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000073',
  true
);

select lives_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000173',
      '00000000-0000-4000-8000-000000000073',
      null,
      'DSC072-ACTIVE-INSERT',
      'Active mapped legacy insert succeeds'
    )
  $dml$,
  'active mapped owner can insert a legacy product'
);
select lives_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000173',
      '00000000-0000-4000-8000-000000000073',
      null,
      '20000000-0000-4000-8000-000000000073',
      'RETAIL',
      73,
      '2026-07-15 12:02:00',
      '2026-07-15 12:02:00'
    )
  $dml$,
  'active mapped owner can insert a legacy price'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000074","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000074',
  true
);

select lives_ok(
  $dml$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '20000000-0000-4000-8000-000000000174',
      '00000000-0000-4000-8000-000000000074',
      null,
      'DSC072-UNMAPPED-INSERT',
      'Unmapped legacy insert succeeds'
    )
  $dml$,
  'unmapped owner keeps legacy product compatibility'
);
select lives_ok(
  $dml$
    insert into public.inventory_product_prices (
      id, owner_user_id, shop_id, product_id, type, price, effective_at, created_at
    ) values (
      '30000000-0000-4000-8000-000000000174',
      '00000000-0000-4000-8000-000000000074',
      null,
      '20000000-0000-4000-8000-000000000074',
      'RETAIL',
      74,
      '2026-07-15 12:03:00',
      '2026-07-15 12:03:00'
    )
  $dml$,
  'unmapped owner keeps legacy price compatibility'
);

reset role;
select * from finish();

rollback;
