begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(98);

select ok(
  to_regclass('public.customer_carts') is not null
  and to_regclass('public.customer_cart_items') is not null
  and to_regclass('public.customer_cart_mutations') is not null,
  'TASK-023 installs cart, item and idempotency-ledger tables'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.customer_carts'::regclass,
      'public.customer_cart_items'::regclass,
      'public.customer_cart_mutations'::regclass
    )
  ),
  'all customer cart tables enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.customer_carts'::regclass,
      'public.customer_cart_items'::regclass,
      'public.customer_cart_mutations'::regclass
    )
  ),
  12,
  'owner-only policies cover every table operation'
);

select ok(
  not has_table_privilege('anon', 'public.customer_carts', 'SELECT')
  and not has_table_privilege('anon', 'public.customer_cart_items', 'SELECT')
  and not has_table_privilege('authenticated', 'public.customer_carts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.customer_cart_items', 'INSERT')
  and not has_table_privilege('authenticated', 'public.customer_cart_mutations', 'SELECT'),
  'mobile roles cannot bypass bounded cart RPCs with direct table access'
);

select ok(
  has_table_privilege('service_role', 'public.customer_carts', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.customer_cart_items', 'SELECT,INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.customer_cart_mutations', 'SELECT,INSERT,UPDATE,DELETE'),
  'service-side maintenance receives explicit cart table privileges'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_cart_read_v1',
        'customer_cart_mutate_v1',
        'customer_cart_merge_guest_v1',
        'customer_cart_revalidate_v1'
      )
  ),
  4,
  'TASK-023 exposes exactly four customer cart RPCs'
);

select ok(
  (
    select bool_and(procedure.prosecdef and 'search_path=""' = any(procedure.proconfig))
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_cart_read_v1',
        'customer_cart_mutate_v1',
        'customer_cart_merge_guest_v1',
        'customer_cart_revalidate_v1'
      )
  ),
  'all customer cart RPCs are hardened definers with empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.customer_cart_read_v1(text)', 'EXECUTE')
  and has_function_privilege(
    'authenticated',
    'public.customer_cart_mutate_v1(text,text,uuid,integer,bigint,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_cart_merge_guest_v1(text,jsonb,bigint,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_cart_revalidate_v1(text,bigint,uuid)',
    'EXECUTE'
  ),
  'authenticated customers receive only the bounded cart RPC surface'
);

select ok(
  not has_function_privilege('anon', 'public.customer_cart_read_v1(text)', 'EXECUTE')
  and not has_function_privilege(
    'anon',
    'public.customer_cart_mutate_v1(text,text,uuid,integer,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_cart_merge_guest_v1(text,jsonb,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_cart_revalidate_v1(text,bigint,uuid)',
    'EXECUTE'
  ),
  'anon cannot invoke owner cart RPCs'
);

select ok(
  to_regprocedure('public.customer_cart_read_v1(uuid)') is null
  and to_regprocedure(
    'public.customer_cart_mutate_v1(uuid,text,uuid,integer,bigint,uuid)'
  ) is null
  and to_regprocedure('public.customer_cart_merge_guest_v1(uuid,jsonb,bigint,uuid)') is null
  and to_regprocedure('public.customer_cart_revalidate_v1(uuid,bigint,uuid)') is null,
  'public cart boundary accepts a Storefront slug rather than an internal shop UUID'
);

select ok(
  to_regprocedure('app_private.customer_cart_read_v1(uuid)') is not null
  and to_regprocedure(
    'app_private.customer_cart_mutate_v1(uuid,text,uuid,integer,bigint,uuid)'
  ) is not null
  and to_regprocedure(
    'app_private.customer_cart_merge_guest_v1(uuid,jsonb,bigint,uuid)'
  ) is not null
  and to_regprocedure(
    'app_private.customer_cart_revalidate_v1(uuid,bigint,uuid)'
  ) is not null
  and not has_function_privilege(
    'authenticated', 'app_private.customer_cart_read_v1(uuid)', 'EXECUTE'
  ),
  'UUID cart engine remains private and non-executable by mobile roles'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.customer_cart_payload_v1(uuid,text,boolean,text,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'private payload resolver is not client-executable'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('customer_carts', 'customer_cart_items')
      and column_name ~* '(source_product|inventory|cost|supplier|token|email)'
  ),
  'cart persistence contains no inventory ID, cost, supplier, token or email field'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral unnest(coalesce(procedure.proargnames, '{}'::text[])) argument(name)
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_cart_mutate_v1',
        'customer_cart_merge_guest_v1',
        'customer_cart_revalidate_v1'
      )
      and argument.name ~* '(price|total|discount|stock)'
  ),
  'mutation and revalidation contracts accept no client price, total, discount or stock input'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_carts'::regclass
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id%auth.users%on delete cascade%'
  ),
  'cart owner is an Auth UUID with cascade cleanup'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_cart_mutations'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id, shop_id, idempotency_key%'
  ),
  'idempotency keys are unique per owner and shop'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000023001',
    'authenticated', 'authenticated', 'task023-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000023002',
    'authenticated', 'authenticated', 'task023-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000023003',
    'authenticated', 'authenticated', 'task023-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000023004',
    'authenticated', 'authenticated', 'task023-cap@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('13000000-0000-4000-8000-000000023001', 'SF23A', 'Cart fixture A', 'active'),
  ('13000000-0000-4000-8000-000000023002', 'SF23B', 'Cart fixture B', 'active');

insert into public.inventory_categories (id, owner_user_id, shop_id, name, updated_at)
values
  (
    '33000000-0000-4000-8000-000000023001',
    '00000000-0000-4000-8000-000000023001',
    '13000000-0000-4000-8000-000000023001',
    'Cart A', now()
  ),
  (
    '33000000-0000-4000-8000-000000023002',
    '00000000-0000-4000-8000-000000023002',
    '13000000-0000-4000-8000-000000023002',
    'Cart B', now()
  );

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
)
values
  (
    '23000000-0000-4000-8000-000000023001',
    '00000000-0000-4000-8000-000000023001',
    '13000000-0000-4000-8000-000000023001',
    'SF23-0001', 'Internal cart coffee',
    '33000000-0000-4000-8000-000000023001', 1000, 10, now()
  ),
  (
    '23000000-0000-4000-8000-000000023002',
    '00000000-0000-4000-8000-000000023001',
    '13000000-0000-4000-8000-000000023001',
    'SF23-0002', 'Internal cart tea',
    '33000000-0000-4000-8000-000000023001', 2000, 10, now()
  ),
  (
    '23000000-0000-4000-8000-000000023003',
    '00000000-0000-4000-8000-000000023002',
    '13000000-0000-4000-8000-000000023002',
    'SF23-0003', 'Internal other shop',
    '33000000-0000-4000-8000-000000023002', 9000, 10, now()
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled, delivery_enabled,
  reservation_enabled, require_product_image
)
values
  (
    '13000000-0000-4000-8000-000000023001', 'cart-fixture-a', true,
    true, true, false, false
  ),
  (
    '13000000-0000-4000-8000-000000023002', 'cart-fixture-b', true,
    true, false, false, false
  );

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values
  (
    '43000000-0000-4000-8000-000000023001',
    '13000000-0000-4000-8000-000000023001',
    '33000000-0000-4000-8000-000000023001',
    'cart-a', 'Cart A', 'published'
  ),
  (
    '43000000-0000-4000-8000-000000023002',
    '13000000-0000-4000-8000-000000023002',
    '33000000-0000-4000-8000-000000023002',
    'cart-b', 'Cart B', 'published'
  );

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, availability_mode, published_at
)
values
  (
    '53000000-0000-4000-8000-000000023001',
    '13000000-0000-4000-8000-000000023001',
    '23000000-0000-4000-8000-000000023001',
    'published', 'Café público',
    '43000000-0000-4000-8000-000000023001', 1000, 1200,
    true, true, 'available', now()
  ),
  (
    '53000000-0000-4000-8000-000000023002',
    '13000000-0000-4000-8000-000000023001',
    '23000000-0000-4000-8000-000000023002',
    'published', 'Té público',
    '43000000-0000-4000-8000-000000023001', 2000, null,
    true, false, 'low_stock', now()
  ),
  (
    '53000000-0000-4000-8000-000000023003',
    '13000000-0000-4000-8000-000000023002',
    '23000000-0000-4000-8000-000000023003',
    'published', 'Altro negozio',
    '43000000-0000-4000-8000-000000023002', 9000, null,
    true, false, 'available', now()
  );

set local role anon;

select throws_ok(
  $$select count(*) from public.customer_carts$$,
  '42501', null,
  'anon cannot read carts'
);

select throws_ok(
  $$select public.customer_cart_read_v1('cart-fixture-a')$$,
  '42501', null,
  'anon cannot invoke cart read'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023003', true);

select throws_ok(
  $$select public.customer_cart_read_v1('cart-fixture-a')$$,
  '28000', null,
  'anonymous Auth identities cannot read carts'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.customer_cart_read_v1(null) ->> 'status',
  'invalid',
  'null shop fails closed'
);

create temp table task023_empty as
select public.customer_cart_read_v1(
  'cart-fixture-a'
) as payload;

select is((select payload ->> 'status' from task023_empty), 'ok', 'empty cart read succeeds');
select is((select payload ->> 'cartVersion' from task023_empty), '0', 'empty cart starts at version zero');
select is((select payload ->> 'itemCount' from task023_empty), '0', 'empty cart has no items');
select is((select payload ->> 'currencyCode' from task023_empty), 'CLP', 'cart currency is server-fixed CLP');
select is((select payload ->> 'shopSlug' from task023_empty), 'cart-fixture-a', 'cart response echoes only the public Storefront slug');
select ok(
  not ((select payload from task023_empty) ?| array['shopId', 'cartId']),
  'cart response omits internal shop and cart UUIDs'
);

create temp table task023_set_first as
select public.customer_cart_mutate_v1(
  'cart-fixture-a',
  'set',
  '53000000-0000-4000-8000-000000023001',
  2,
  0,
  '73000000-0000-4000-8000-000000023001'
) as payload;

select is((select payload ->> 'status' from task023_set_first), 'ok', 'owner can add a published item');
select is((select payload ->> 'cartVersion' from task023_set_first), '1', 'first mutation increments version once');
select is((select payload ->> 'itemCount' from task023_set_first), '1', 'first mutation creates one line');
select is((select payload ->> 'totalQuantity' from task023_set_first), '2', 'requested quantity is preserved');
select is((select payload ->> 'subtotalClp' from task023_set_first), '2000', 'subtotal is derived from server price');

select ok(
  position('source_product' in (select payload::text from task023_set_first)) = 0
  and position('owner_user' in (select payload::text from task023_set_first)) = 0
  and position('Internal cart coffee' in (select payload::text from task023_set_first)) = 0,
  'cart response exposes no source ID, owner ID or internal product name'
);

select throws_ok(
  $$select count(*) from public.customer_cart_items$$,
  '42501', null,
  'even an owner cannot bypass cart RPCs with direct item reads'
);

set local role postgres;

select is(
  (
    select cart.user_id::text || ':' || item.publication_id::text || ':' || item.quantity::text
    from public.customer_carts cart
    join public.customer_cart_items item on item.cart_id = cart.id
    where cart.shop_id = '13000000-0000-4000-8000-000000023001'
  ),
  '00000000-0000-4000-8000-000000023001:53000000-0000-4000-8000-000000023001:2',
  'owner is derived from auth and only public publication ID is persisted'
);

select is(
  (
    select item.snapshot_public_name || ':' || item.snapshot_price_clp::text
    from public.customer_cart_items item
    where item.publication_id = '53000000-0000-4000-8000-000000023001'
  ),
  'Café público:1000',
  'server stores only the current public snapshot'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);

select ok(
  (public.customer_cart_mutate_v1(
    'cart-fixture-a', 'set',
    '53000000-0000-4000-8000-000000023001', 2, 0,
    '73000000-0000-4000-8000-000000023001'
  ) ->> 'idempotent')::boolean,
  'same mutation key returns the stored result'
);

select is(
  public.customer_cart_mutate_v1(
    'cart-fixture-a', 'set',
    '53000000-0000-4000-8000-000000023001', 3, 1,
    '73000000-0000-4000-8000-000000023001'
  ) ->> 'status',
  'idempotency_conflict',
  'same key with different payload fails closed'
);

create temp table task023_second as
select public.customer_cart_mutate_v1(
  'cart-fixture-a', 'set',
  '53000000-0000-4000-8000-000000023002', 1, 1,
  '73000000-0000-4000-8000-000000023002'
) as payload;

select is((select payload ->> 'cartVersion' from task023_second), '2', 'second item increments version');
select is((select payload ->> 'itemCount' from task023_second), '2', 'second item creates a second line');
select is((select payload ->> 'subtotalClp' from task023_second), '4000', 'two server-priced lines sum correctly');

create temp table task023_update as
select public.customer_cart_mutate_v1(
  'cart-fixture-a', 'set',
  '53000000-0000-4000-8000-000000023001', 3, 2,
  '73000000-0000-4000-8000-000000023003'
) as payload;

select is((select payload ->> 'cartVersion' from task023_update), '3', 'updating quantity increments version once');
select is((select payload ->> 'itemCount' from task023_update), '2', 'updating quantity does not duplicate a line');
select is((select payload ->> 'totalQuantity' from task023_update), '4', 'updated total quantity is deterministic');

create temp table task023_conflict as
select public.customer_cart_mutate_v1(
  'cart-fixture-a', 'remove',
  '53000000-0000-4000-8000-000000023002', null, 1,
  '73000000-0000-4000-8000-000000023004'
) as payload;

select is((select payload ->> 'status' from task023_conflict), 'version_conflict', 'stale writer receives explicit version conflict');
select is((select payload ->> 'cartVersion' from task023_conflict), '3', 'version conflict returns current version');
select ok(
  (public.customer_cart_mutate_v1(
    'cart-fixture-a', 'remove',
    '53000000-0000-4000-8000-000000023002', null, 1,
    '73000000-0000-4000-8000-000000023004'
  ) ->> 'idempotent')::boolean,
  'retry of a version conflict is idempotent'
);

create temp table task023_remove as
select public.customer_cart_mutate_v1(
  'cart-fixture-a', 'remove',
  '53000000-0000-4000-8000-000000023002', null, 3,
  '73000000-0000-4000-8000-000000023005'
) as payload;

select is((select payload ->> 'cartVersion' from task023_remove), '4', 'remove increments version');
select is((select payload ->> 'itemCount' from task023_remove), '1', 'remove deletes only the selected line');

select is(
  public.customer_cart_mutate_v1(
    'cart-fixture-a', 'clear',
    null, 1, 4, '73000000-0000-4000-8000-000000023006'
  ) ->> 'status',
  'invalid',
  'clear rejects a forged quantity'
);

create temp table task023_clear as
select public.customer_cart_mutate_v1(
  'cart-fixture-a', 'clear',
  null, null, 4, '73000000-0000-4000-8000-000000023007'
) as payload;

select is((select payload ->> 'cartVersion' from task023_clear), '5', 'clear increments version once');
select is((select payload ->> 'itemCount' from task023_clear), '0', 'clear produces an empty cart');

select is(
  public.customer_cart_mutate_v1(
    'cart-fixture-a', 'set',
    '53000000-0000-4000-8000-000000023001', 2, 5,
    '73000000-0000-4000-8000-000000023008'
  ) ->> 'cartVersion',
  '6',
  'cart can be restored after clear'
);

create temp table task023_merge as
select public.customer_cart_merge_guest_v1(
  'cart-fixture-a',
  '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":5},{"publicationId":"53000000-0000-4000-8000-000000023002","quantity":3}]'::jsonb,
  6,
  '73000000-0000-4000-8000-000000023009'
) as payload;

select is((select payload ->> 'status' from task023_merge), 'merged', 'guest/account merge completes');
select is((select payload ->> 'mergeStatus' from task023_merge), 'complete', 'merge reports complete ack');
select is((select payload ->> 'acceptedCount' from task023_merge), '2', 'merge acknowledges both public lines');
select is((select payload ->> 'cartVersion' from task023_merge), '7', 'merge increments cart version once');
select is((select payload ->> 'totalQuantity' from task023_merge), '8', 'merge uses max overlap quantity rather than sum');
select is((select payload ->> 'subtotalClp' from task023_merge), '11000', 'merged subtotal is server-derived');

select ok(
  (public.customer_cart_merge_guest_v1(
    'cart-fixture-a',
    '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":5},{"publicationId":"53000000-0000-4000-8000-000000023002","quantity":3}]'::jsonb,
    6,
    '73000000-0000-4000-8000-000000023009'
  ) ->> 'idempotent')::boolean,
  'ambiguous merge retry returns the prior ack without duplicating quantities'
);

select is(
  public.customer_cart_merge_guest_v1(
    'cart-fixture-a',
    '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":6}]'::jsonb,
    7,
    '73000000-0000-4000-8000-000000023009'
  ) ->> 'status',
  'idempotency_conflict',
  'same merge key with another guest payload conflicts'
);

select is(
  public.customer_cart_merge_guest_v1(
    'cart-fixture-a',
    '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":6,"totalClp":1}]'::jsonb,
    7,
    '73000000-0000-4000-8000-000000023010'
  ) ->> 'status',
  'invalid',
  'guest merge rejects forged total fields'
);

select is(
  public.customer_cart_merge_guest_v1(
    'cart-fixture-a',
    '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":100}]'::jsonb,
    7,
    '73000000-0000-4000-8000-000000023011'
  ) ->> 'status',
  'invalid',
  'guest quantity above the bounded cap is rejected'
);

create temp table task023_cross_shop as
select public.customer_cart_merge_guest_v1(
  'cart-fixture-a',
  '[{"publicationId":"53000000-0000-4000-8000-000000023003","quantity":1}]'::jsonb,
  7,
  '73000000-0000-4000-8000-000000023012'
) as payload;

select is((select payload ->> 'status' from task023_cross_shop), 'partial', 'cross-shop publication is not merged');
select is((select payload ->> 'mergeStatus' from task023_cross_shop), 'no_eligible_items', 'cross-shop rejection is explicit');
select is((select payload ->> 'cartVersion' from task023_cross_shop), '7', 'rejected-only merge does not change cart version');
select ok(
  (select payload -> 'rejectedPublicationIds' from task023_cross_shop)
    @> '["53000000-0000-4000-8000-000000023003"]'::jsonb,
  'rejected public publication ID is returned for bounded local retention'
);

create temp table task023_duplicate_guest as
select public.customer_cart_merge_guest_v1(
  'cart-fixture-a',
  '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":2},{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":7}]'::jsonb,
  7,
  '73000000-0000-4000-8000-000000023013'
) as payload;

select is((select payload ->> 'cartVersion' from task023_duplicate_guest), '8', 'duplicate guest lines merge in one version');
select is((select payload ->> 'totalQuantity' from task023_duplicate_guest), '10', 'duplicate guest lines collapse using maximum quantity');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023002', true);

select is(
  public.customer_cart_read_v1('cart-fixture-a') ->> 'itemCount',
  '0',
  'another owner sees an empty independent cart rather than owner A data'
);

select throws_ok(
  $$select count(*) from public.customer_carts$$,
  '42501', null,
  'another owner cannot directly enumerate carts'
);

select is(
  public.customer_cart_merge_guest_v1(
    'cart-fixture-a',
    '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":1}]'::jsonb,
    0,
    '73000000-0000-4000-8000-000000023014'
  ) ->> 'cartVersion',
  '1',
  'account switch creates a separate owner cart without adopting owner A row'
);

set local role postgres;

select is(
  (
    select count(distinct cart.user_id)::integer
    from public.customer_carts cart
    where cart.shop_id = '13000000-0000-4000-8000-000000023001'
  ),
  2,
  'two accounts retain isolated cart ownership'
);

insert into public.customer_carts(id, user_id, shop_id)
values (
  '83000000-0000-4000-8000-000000023001',
  '00000000-0000-4000-8000-000000023004',
  '13000000-0000-4000-8000-000000023001'
);
insert into public.customer_cart_items(
  cart_id, user_id, shop_id, publication_id, quantity,
  snapshot_public_name, snapshot_price_clp
)
select
  '83000000-0000-4000-8000-000000023001',
  '00000000-0000-4000-8000-000000023004',
  '13000000-0000-4000-8000-000000023001',
  md5('task023-cap-' || fixture.number::text)::uuid,
  1,
  'Bounded cart fixture ' || fixture.number::text,
  1
from generate_series(1, 99) fixture(number);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023004","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023004', true);

create temp table task023_bounded_merge as
select public.customer_cart_merge_guest_v1(
  'cart-fixture-a',
  '[{"publicationId":"53000000-0000-4000-8000-000000023001","quantity":2},{"publicationId":"53000000-0000-4000-8000-000000023002","quantity":3}]'::jsonb,
  0,
  '73000000-0000-4000-8000-000000023022'
) as payload;

select is((select payload ->> 'status' from task023_bounded_merge), 'partial', 'merge reports a bounded partial result at cart capacity');
select is((select payload ->> 'acceptedCount' from task023_bounded_merge), '1', 'merge accepts only the remaining deterministic cart slot');
select is((select payload ->> 'itemCount' from task023_bounded_merge), '100', 'guest/account merge never exceeds the 100-line cart bound');
select ok(
  (select payload -> 'rejectedPublicationIds' from task023_bounded_merge)
    @> '["53000000-0000-4000-8000-000000023002"]'::jsonb,
  'capacity rejection returns the unmerged public publication ID'
);

set local role postgres;

update public.storefront_product_publications publication
set retail_price_clp = 1200,
    compare_at_price_clp = 1400
where publication.id = '53000000-0000-4000-8000-000000023001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);

create temp table task023_changed_read as
select public.customer_cart_read_v1(
  'cart-fixture-a'
) as payload;

select ok(
  (select (payload ->> 'requiresCustomerReview')::boolean from task023_changed_read),
  'read detects price drift before checkout'
);
select is((select payload ->> 'subtotalClp' from task023_changed_read), '14400', 'read recalculates subtotal from current server price');
select ok(
  (select payload -> 'items' from task023_changed_read)
    @> '[{"publicationId":"53000000-0000-4000-8000-000000023001","changeType":"price_changed","snapshotPriceClp":1000,"priceClp":1200}]'::jsonb,
  'price change reports old public snapshot and current server price'
);

create temp table task023_revalidated as
select public.customer_cart_revalidate_v1(
  'cart-fixture-a',
  8,
  '73000000-0000-4000-8000-000000023015'
) as payload;

select is((select payload ->> 'status' from task023_revalidated), 'revalidated', 'server revalidation succeeds');
select is((select payload ->> 'quoteStatus' from task023_revalidated), 'confirmed', 'revalidation marks a bounded server quote');
select is((select payload ->> 'cartVersion' from task023_revalidated), '9', 'revalidation advances cart version once');
select ok(
  (select (payload ->> 'requiresCustomerReview')::boolean from task023_revalidated),
  'revalidation preserves price-change disclosure in the response'
);
select ok(
  (select (payload ->> 'quoteExpiresAt')::timestamptz from task023_revalidated)
    > (select (payload ->> 'quotedAt')::timestamptz from task023_revalidated),
  'server quote has an explicit bounded expiry'
);

set local role postgres;

select is(
  (
    select snapshot_price_clp
    from public.customer_cart_items item
    join public.customer_carts cart on cart.id = item.cart_id
    where cart.user_id = '00000000-0000-4000-8000-000000023001'
      and item.publication_id = '53000000-0000-4000-8000-000000023001'
  ),
  1200::bigint,
  'successful revalidation replaces the stored public snapshot after response creation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);

select ok(
  (public.customer_cart_revalidate_v1(
    'cart-fixture-a', 8,
    '73000000-0000-4000-8000-000000023015'
  ) ->> 'idempotent')::boolean,
  'ambiguous revalidation retry returns the exact stored quote'
);

select is(
  public.customer_cart_revalidate_v1(
    'cart-fixture-a', 8,
    '73000000-0000-4000-8000-000000023016'
  ) ->> 'status',
  'version_conflict',
  'stale revalidation key receives explicit conflict'
);

set local role postgres;

insert into public.storefront_promotions (
  id, shop_id, public_name, publication_status, discount_type,
  discount_value, priority, starts_at, ends_at
)
values (
  '63000000-0000-4000-8000-000000023001',
  '13000000-0000-4000-8000-000000023001',
  'Promo cart', 'active', 'fixed_price_clp', 900, 10,
  now() - interval '1 minute', now() + interval '1 hour'
);
insert into public.storefront_promotion_products(shop_id, promotion_id, publication_id)
values (
  '13000000-0000-4000-8000-000000023001',
  '63000000-0000-4000-8000-000000023001',
  '53000000-0000-4000-8000-000000023001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);

create temp table task023_promo as
select public.customer_cart_revalidate_v1(
  'cart-fixture-a', 9,
  '73000000-0000-4000-8000-000000023017'
) as payload;

select is((select payload ->> 'subtotalClp' from task023_promo), '12300', 'active promotion is resolved server-side');
select ok(
  (select payload -> 'items' from task023_promo)
    @> '[{"publicationId":"53000000-0000-4000-8000-000000023001","priceClp":900,"changeType":"price_changed"}]'::jsonb,
  'promotion price change is disclosed'
);

set local role postgres;
update public.storefront_promotions promotion
set publication_status = 'ended'
where promotion.id = '63000000-0000-4000-8000-000000023001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);

select ok(
  public.customer_cart_revalidate_v1(
    'cart-fixture-a', 10,
    '73000000-0000-4000-8000-000000023018'
  ) -> 'items'
    @> '[{"publicationId":"53000000-0000-4000-8000-000000023001","priceClp":1200,"changeType":"price_changed"}]'::jsonb,
  'expired promotion restores current public price and requires disclosure'
);

set local role postgres;
update public.storefront_product_publications publication
set publication_status = 'paused', published_at = null
where publication.id = '53000000-0000-4000-8000-000000023002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000023001', true);

create temp table task023_unpublished as
select public.customer_cart_revalidate_v1(
  'cart-fixture-a', 11,
  '73000000-0000-4000-8000-000000023019'
) as payload;

select is((select payload ->> 'unavailableItemCount' from task023_unpublished), '1', 'unpublished item remains visible as unavailable');
select is((select payload ->> 'subtotalClp' from task023_unpublished), '8400', 'unavailable line is excluded from server subtotal');
select ok(
  (select payload -> 'items' from task023_unpublished)
    @> '[{"publicationId":"53000000-0000-4000-8000-000000023002","status":"unavailable","changeType":"unavailable"}]'::jsonb,
  'unpublished line is explicitly marked unavailable'
);

select is(
  public.customer_cart_mutate_v1(
    'cart-fixture-a', 'set',
    '53000000-0000-4000-8000-000000023002', 4, 12,
    '73000000-0000-4000-8000-000000023020'
  ) ->> 'status',
  'unavailable',
  'unpublished product cannot be newly set or increased'
);

select is(
  public.customer_cart_mutate_v1(
    'cart-fixture-a', 'remove',
    '53000000-0000-4000-8000-000000023002', null, 12,
    '73000000-0000-4000-8000-000000023021'
  ) ->> 'cartVersion',
  '13',
  'unavailable line remains removable by the owner'
);

set local role postgres;

update public.storefront_product_publications publication
set publication_status = 'ended', published_at = null
where publication.source_product_id in (
  select product.id
  from public.inventory_products product
  where product.owner_user_id = '00000000-0000-4000-8000-000000023002'
);

delete from auth.users where id = '00000000-0000-4000-8000-000000023002';
delete from auth.users where id = '00000000-0000-4000-8000-000000023004';

select is(
  (
    select count(*)::integer from public.customer_carts cart
    where cart.user_id = '00000000-0000-4000-8000-000000023002'
  ),
  0,
  'Auth account deletion cascades cart cleanup'
);
select is(
  (
    select count(*)::integer from public.customer_cart_items item
    where item.user_id = '00000000-0000-4000-8000-000000023002'
  ),
  0,
  'Auth account deletion cascades item cleanup'
);
select is(
  (
    select count(*)::integer from public.customer_cart_mutations mutation
    where mutation.user_id = '00000000-0000-4000-8000-000000023002'
  ),
  0,
  'Auth account deletion cascades idempotency-ledger cleanup'
);

select * from finish();
rollback;
