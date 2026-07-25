begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_function(
  'app_private',
  'shop_catalog_workbook_preflight_v1',
  array['uuid','text','uuid'],
  'workbook export has an authoritative bounded database preflight'
);
select is(
  (
    select function_row.provolatile::text
    from pg_proc function_row
    where function_row.oid =
      'app_private.shop_catalog_workbook_preflight_v1(uuid,text,uuid)'::regprocedure
  ),
  's',
  'workbook preflight is a stable snapshot read'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.shop_catalog_workbook_preflight_v1(uuid,text,uuid)',
    'EXECUTE'
  ),
  'clients cannot bypass the catalog export boundary through the preflight'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000239',
  'authenticated',
  'authenticated',
  'task139-workbook@example.invalid',
  '{}',
  '{}',
  clock_timestamp(),
  clock_timestamp()
);
insert into public.profiles (profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000000239',
  'TASK-139 workbook owner',
  'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;
insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  (
    '10000000-0000-4000-8000-000000000239',
    'TASK139WB',
    'TASK-139 workbook shop',
    'active'
  ),
  (
    '10000000-0000-4000-8000-000000000339',
    'TASK139WBX',
    'TASK-139 foreign workbook shop',
    'active'
  );
insert into public.shop_members (
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000000239',
  '10000000-0000-4000-8000-000000000239',
  'shop_owner',
  'active'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000239","role":"authenticated"}',
  true
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000239',
    'snapshot_page',
    '{"entity":"manifest","includeSummary":true}'::jsonb
  )#>>'{summary,productsTotal}',
  '0',
  'empty workbook manifest succeeds with zero products'
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000239',
    'snapshot_page',
    '{"entity":"manifest","includeSummary":true}'::jsonb
  )#>>'{summary,workbookTextBytes}',
  '0',
  'empty workbook manifest reports zero source text bytes'
);

set local role postgres;
select set_config('app_private.pos_catalog_import_in_progress', 'on', true);
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name
)
select
  (
    lpad(to_hex(ordinal), 8, '0') ||
    '-0000-7000-8000-' ||
    lpad(to_hex(ordinal), 12, '0')
  )::uuid,
  '00000000-0000-4000-8000-000000000239',
  '10000000-0000-4000-8000-000000000239',
  'TASK139-WB-' || ordinal,
  'Workbook product ' || ordinal
from generate_series(1, 2000) generated(ordinal);
select set_config('app_private.pos_catalog_import_in_progress', 'off', true);

select is(
  app_private.shop_catalog_workbook_preflight_v1(
    '10000000-0000-4000-8000-000000000239',
    'shop_scoped',
    null
  )->>'productsTotal',
  '2000',
  'authoritative preflight reads exactly the product cap'
);
select ok(
  (
    app_private.shop_catalog_workbook_preflight_v1(
      '10000000-0000-4000-8000-000000000239',
      'shop_scoped',
      null
    )->>'workbookTextBytes'
  )::bigint > 0,
  'authoritative preflight measures source text before serialization'
);

select set_config('app_private.pos_catalog_import_in_progress', 'on', true);
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name
) values (
  '00002001-0000-7000-8000-000000002001',
  '00000000-0000-4000-8000-000000000239',
  '10000000-0000-4000-8000-000000000239',
  'TASK139-WB-2001',
  'Workbook cap plus one'
);
insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name
) values (
  '00000001-0000-7000-8000-000000000339',
  '00000000-0000-4000-8000-000000000239',
  '10000000-0000-4000-8000-000000000339',
  'TASK139-WB-FOREIGN',
  'Foreign workbook product'
);
select set_config('app_private.pos_catalog_import_in_progress', 'off', true);

select is(
  app_private.shop_catalog_workbook_preflight_v1(
    '10000000-0000-4000-8000-000000000239',
    'shop_scoped',
    null
  )->>'productsTotal',
  '2001',
  'preflight exposes cap plus one without scanning an unbounded tail'
);
select is(
  app_private.shop_catalog_workbook_preflight_v1(
    '10000000-0000-4000-8000-000000000239',
    'shop_scoped',
    null
  )->>'productsTotal',
  '2001',
  'foreign-shop rows do not enter the workbook resource envelope'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000239","role":"authenticated"}',
  true
);
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000239',
    'snapshot_page',
    '{"entity":"manifest","includeSummary":true}'::jsonb
  )#>>'{summary,productsTotal}',
  '2001',
  'real manifest returns the bounded cap-plus-one signal for early rejection'
);

set local role postgres;
update public.shop_members
set membership_status = 'suspended',
    suspended_at = clock_timestamp()
where profile_id = '00000000-0000-4000-8000-000000000239'
  and shop_id = '10000000-0000-4000-8000-000000000239';
set local role authenticated;
select is(
  public.shop_catalog_admin_read_v1(
    '10000000-0000-4000-8000-000000000239',
    'snapshot_page',
    '{"entity":"manifest","includeSummary":true}'::jsonb
  )->>'code',
  'permission_denied',
  'staff without export permission receives no workbook preflight data'
);

select * from finish();
rollback;
