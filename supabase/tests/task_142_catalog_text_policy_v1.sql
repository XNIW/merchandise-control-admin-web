begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

select has_function(
  'app_private',
  'catalog_display_text_v1',
  array['text', 'integer', 'boolean'],
  'TASK-142 installs the private canonical display-text function'
);

select has_function(
  'app_private',
  'catalog_identity_text_v1',
  array['text', 'integer', 'boolean'],
  'TASK-142 installs the private strict identity-text function'
);

select is(
  app_private.catalog_text_utf16_length_v1('A' || chr(128512)),
  3,
  'TASK-142 length limits use UTF-16 code units'
);

select is(
  app_private.catalog_display_text_v1(
    '  Cafe' || chr(769) || chr(13) || chr(10) ||
    chr(9) || chr(160) || '中文  ',
    240,
    true
  ),
  'Café 中文',
  'display text applies NFC and canonical whitespace'
);

select is(
  app_private.catalog_display_text_v1(
    app_private.catalog_display_text_v1(
      '  Cafe' || chr(769) || chr(10) || '  test ',
      240,
      true
    ),
    240,
    true
  ),
  'Café test',
  'display canonicalization is idempotent'
);

select is(
  app_private.catalog_display_text_v1(
    '商品 ' || chr(128105) || chr(8205) || chr(128187),
    240,
    true
  ),
  '商品 ' || chr(128105) || chr(8205) || chr(128187),
  'display text preserves valid Chinese and emoji ZWJ sequences'
);

select is(
  app_private.catalog_identity_text_v1('  SKU-001  ', 120, true),
  'SKU-001',
  'identity text performs trim only'
);

select throws_ok(
  $$ select app_private.catalog_identity_text_v1(
    'SKU' || chr(10) || '001', 120, true
  ) $$,
  '23514',
  'catalog_text_policy_v1 rejected identity text',
  'identity text rejects newline instead of replacing it'
);

select throws_ok(
  $$ select app_private.catalog_display_text_v1(
    'hidden' || chr(8203) || 'value', 240, true
  ) $$,
  '23514',
  'catalog_text_policy_v1 rejected display text',
  'display text rejects zero-width space'
);

select throws_ok(
  $$ select app_private.catalog_display_text_v1(repeat('a', 241), 240, true) $$,
  '23514',
  'catalog_text_policy_v1 rejected over-limit display text',
  'display text rejects values over the post-normalization limit'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.catalog_display_text_v1(text,integer,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.catalog_display_text_v1(text,integer,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'app_private.catalog_identity_text_v1(text,integer,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.catalog_identity_text_v1(text,integer,boolean)',
    'EXECUTE'
  ),
  'clients cannot bypass the catalog write boundary through private helpers'
);

select ok(
  (
    select proc.prosecdef
      and proc.proconfig = array['search_path=""']
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'app_private'
      and proc.proname = 'enforce_catalog_text_policy_v1'
  ),
  'trigger privilege elevation is limited by an empty search_path'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000142',
  'authenticated',
  'authenticated',
  'task142-catalog@example.invalid',
  '{}',
  '{}',
  now(),
  now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000000142',
  'TASK142',
  'TASK-142 catalog text shop',
  'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name
) values (
  '14210000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000142',
  '10000000-0000-4000-8000-000000000142',
  '  Bevande' || chr(13) || chr(10) || chr(9) || 'calde  '
);

select is(
  (
    select name
    from public.inventory_categories
    where id = '14210000-0000-4000-8000-000000000001'
  ),
  'Bevande calde',
  'category direct writes persist canonical display text'
);

insert into public.inventory_suppliers (
  id, owner_user_id, shop_id, name
) values (
  '14220000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000142',
  '10000000-0000-4000-8000-000000000142',
  '  Fornitore' || chr(160) || 'QA  '
);

select is(
  (
    select name
    from public.inventory_suppliers
    where id = '14220000-0000-4000-8000-000000000001'
  ),
  'Fornitore QA',
  'supplier direct writes persist canonical display text'
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, item_number, product_name,
  second_product_name
) values (
  '14230000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000142',
  '10000000-0000-4000-8000-000000000142',
  '  780000000001  ',
  '  ITEM-142  ',
  chr(9),
  '  Café' || chr(160) || 'QA  '
);

select results_eq(
  $$
    select barcode, item_number, product_name, second_product_name
    from public.inventory_products
    where id = '14230000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '780000000001'::text,
      'ITEM-142'::text,
      'Café QA'::text,
      'Café QA'::text
    )
  $$,
  'product direct writes trim identities and use only the approved display fallback'
);

select ok(
  (
    select pg_get_triggerdef(oid) ilike '%deleted_at%'
      and pg_get_triggerdef(oid) ilike '%shop_id%'
    from pg_trigger
    where tgrelid = 'public.inventory_products'::regclass
      and tgname = 'catalog_text_00_policy_v1'
      and not tgisinternal
  ),
  'product policy trigger also covers restore boundary columns'
);

alter table public.inventory_products
  disable trigger catalog_text_00_policy_v1;

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, deleted_at
) values (
  '14230000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000142',
  '10000000-0000-4000-8000-000000000142',
  '780000000003',
  '  Legacy' || chr(9) || 'name  ',
  now()
);

alter table public.inventory_products
  enable trigger catalog_text_00_policy_v1;

update public.inventory_products
set shop_id = shop_id
where id = '14230000-0000-4000-8000-000000000003';

select is(
  (
    select product_name
    from public.inventory_products
    where id = '14230000-0000-4000-8000-000000000003'
  ),
  'Legacy name',
  'a non-text restore boundary update canonicalizes legacy display text'
);

select throws_ok(
  $$
    insert into public.inventory_products (
      id, owner_user_id, shop_id, barcode, product_name
    ) values (
      '14230000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000142',
      '10000000-0000-4000-8000-000000000142',
      '7800' || chr(10) || '00000002',
      'Blocked product'
    )
  $$,
  '23514',
  'catalog_text_policy_v1 rejected identity text',
  'direct product writes reject a barcode containing newline'
);

select throws_ok(
  $$
    update public.inventory_categories
    set name = 'Blocked' || chr(8238) || 'name'
    where id = '14210000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'catalog_text_policy_v1 rejected display text',
  'direct category updates reject bidi overrides'
);

select is(
  (
    select count(*)::integer
    from public.inventory_products
    where id = '14230000-0000-4000-8000-000000000002'
  ),
  0,
  'a rejected catalog write leaves no partial product row'
);

select * from finish();
rollback;
