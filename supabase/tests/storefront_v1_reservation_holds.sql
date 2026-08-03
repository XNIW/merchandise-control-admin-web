begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(54);

select ok(
  to_regclass('public.customer_reservation_holds') is not null
  and to_regclass('public.customer_reservation_hold_mutations') is not null,
  'TASK-025 installs hold and idempotency-ledger tables'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.customer_reservation_holds'::regclass,
      'public.customer_reservation_hold_mutations'::regclass
    )
  ),
  'all reservation tables enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.customer_reservation_holds'::regclass,
      'public.customer_reservation_hold_mutations'::regclass
    )
  ),
  8,
  'owner-only RLS policies cover every table operation'
);

select ok(
  not has_table_privilege(
    'anon', 'public.customer_reservation_holds', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.customer_reservation_holds',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.customer_reservation_hold_mutations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles cannot bypass bounded hold RPCs with direct table access'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.customer_reservation_holds',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role',
    'public.customer_reservation_hold_mutations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service-side maintenance has explicit table privileges'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_reservation_hold_create_v1',
        'customer_reservation_hold_read_v1',
        'customer_reservation_hold_release_v1'
      )
  ),
  3,
  'TASK-025 exposes exactly three customer hold RPCs'
);

select ok(
  (
    select bool_and(
      procedure.prosecdef and 'search_path=""' = any(procedure.proconfig)
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_reservation_hold_create_v1',
        'customer_reservation_hold_read_v1',
        'customer_reservation_hold_release_v1'
      )
  ),
  'all public hold RPCs are hardened definers with empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.customer_reservation_hold_create_v1(text,uuid,integer,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_reservation_hold_read_v1(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_reservation_hold_release_v1(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated customers receive the bounded hold RPC surface'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.customer_reservation_hold_create_v1(text,uuid,integer,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_reservation_hold_read_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_reservation_hold_release_v1(uuid,uuid)', 'EXECUTE'
  ),
  'anon cannot invoke customer hold RPCs'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.storefront_reservation_active_quantity_v1(uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.storefront_reservation_holds_expire_v1(integer,timestamptz)',
    'EXECUTE'
  ),
  'exact capacity and cleanup helpers remain private'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral unnest(coalesce(procedure.proargnames, '{}'::text[])) argument(name)
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_reservation_hold_create_v1',
        'customer_reservation_hold_read_v1',
        'customer_reservation_hold_release_v1'
      )
      and argument.name ~* '(stock|price|total|discount|user_id|shop_id|expires_at)'
  ),
  'client hold inputs contain no stock, price, total, owner, internal shop or expiry authority'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_reservation_holds'::regclass
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id%auth.users%on delete cascade%'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_reservation_holds'::regclass
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%shop_id, publication_id%storefront_product_publications%'
  ),
  'hold owner and public publication scope are enforced by foreign keys'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.customer_reservation_hold_mutations'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id, shop_id, idempotency_key%'
  ),
  'idempotency keys are unique per customer and shop'
);

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'storefront-reservation-hold-expire-v1'
      and schedule = '* * * * *'
  ),
  'bounded expiry cleanup is scheduled every minute'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000025001',
    'authenticated', 'authenticated', 'task025-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000025002',
    'authenticated', 'authenticated', 'task025-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000025003',
    'authenticated', 'authenticated', 'task025-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('15000000-0000-4000-8000-000000025001', 'SF25A', 'Hold fixture A', 'active'),
  ('15000000-0000-4000-8000-000000025002', 'SF25B', 'Hold fixture B', 'active');

insert into public.inventory_categories (id, owner_user_id, shop_id, name, updated_at)
values
  (
    '35000000-0000-4000-8000-000000025001',
    '00000000-0000-4000-8000-000000025001',
    '15000000-0000-4000-8000-000000025001',
    'Hold A', now()
  ),
  (
    '35000000-0000-4000-8000-000000025002',
    '00000000-0000-4000-8000-000000025002',
    '15000000-0000-4000-8000-000000025002',
    'Hold B', now()
  );

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
)
values
  (
    '25000000-0000-4000-8000-000000025001',
    '00000000-0000-4000-8000-000000025001',
    '15000000-0000-4000-8000-000000025001',
    'SF25-0001', 'Internal last piece',
    '35000000-0000-4000-8000-000000025001', 1000, 1, now()
  ),
  (
    '25000000-0000-4000-8000-000000025002',
    '00000000-0000-4000-8000-000000025002',
    '15000000-0000-4000-8000-000000025002',
    'SF25-0002', 'Internal other shop',
    '35000000-0000-4000-8000-000000025002', 2000, 5, now()
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled, delivery_enabled,
  reservation_enabled, require_product_image, availability_low_stock_threshold
)
values
  (
    '15000000-0000-4000-8000-000000025001', 'hold-fixture-a', true,
    true, true, true, false, 1
  ),
  (
    '15000000-0000-4000-8000-000000025002', 'hold-fixture-b', true,
    true, false, true, false, 1
  );

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values
  (
    '45000000-0000-4000-8000-000000025001',
    '15000000-0000-4000-8000-000000025001',
    '35000000-0000-4000-8000-000000025001',
    'hold-a', 'Hold A', 'published'
  ),
  (
    '45000000-0000-4000-8000-000000025002',
    '15000000-0000-4000-8000-000000025002',
    '35000000-0000-4000-8000-000000025002',
    'hold-b', 'Hold B', 'published'
  );

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
)
values
  (
    '55000000-0000-4000-8000-000000025001',
    '15000000-0000-4000-8000-000000025001',
    '25000000-0000-4000-8000-000000025001',
    'published', 'Última unidad pública',
    '45000000-0000-4000-8000-000000025001',
    1000, true, true, true, 'available', now()
  ),
  (
    '55000000-0000-4000-8000-000000025002',
    '15000000-0000-4000-8000-000000025002',
    '25000000-0000-4000-8000-000000025002',
    'published', 'Altro negozio',
    '45000000-0000-4000-8000-000000025002',
    2000, true, false, true, 'available', now()
  );

set local role anon;

select throws_ok(
  $$select count(*) from public.customer_reservation_holds$$,
  '42501', null,
  'anon cannot read hold rows'
);

select throws_ok(
  $$select public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025001'
  )$$,
  '42501', null,
  'anon cannot invoke hold create'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025003',
  true
);

select throws_ok(
  $$select public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025002'
  )$$,
  '28000', null,
  'anonymous Auth identities cannot create holds'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.customer_reservation_hold_create_v1(
    'hold-fixture-a', null, 1,
    '75000000-0000-4000-8000-000000025003'
  ) ->> 'status',
  'invalid',
  'invalid create input fails closed'
);

set local role postgres;
update public.storefront_product_publications
set reservation_enabled = false
where id = '55000000-0000-4000-8000-000000025001';

set local role authenticated;
select is(
  public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025013'
  ) ->> 'status',
  'unavailable',
  'a publication without reservation fulfillment cannot create a hold'
);

set local role postgres;
update public.storefront_product_publications
set reservation_enabled = true
where id = '55000000-0000-4000-8000-000000025001';
update public.storefront_settings
set reservation_enabled = false
where shop_id = '15000000-0000-4000-8000-000000025001';

set local role authenticated;
select is(
  public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025014'
  ) ->> 'status',
  'unavailable',
  'a shop without reservation fulfillment cannot create a hold'
);

set local role postgres;
update public.storefront_settings
set reservation_enabled = true
where shop_id = '15000000-0000-4000-8000-000000025001';

set local role authenticated;

create temp table task025_first as
select public.customer_reservation_hold_create_v1(
  'hold-fixture-a',
  '55000000-0000-4000-8000-000000025001',
  1,
  '75000000-0000-4000-8000-000000025004'
) as payload;

select is(
  (select payload ->> 'status' from task025_first),
  'ok',
  'first customer reserves the last piece'
);

select is(
  (select payload ->> 'holdStatus' from task025_first),
  'active',
  'new hold is active'
);

select ok(
  (select (payload ->> 'remainingSeconds')::integer from task025_first)
    between 899 and 900
  and (select payload ? 'expiresAt' from task025_first),
  'expiry and remaining time are server-derived and bounded'
);

select ok(
  (select payload::text from task025_first)
    !~* '(source_product|stock_quantity|owner_user|shop_id|purchase_price|supplier|token)',
  'hold response exposes no internal inventory, owner, cost, supplier or token field'
);

set local role postgres;
select is(
  (
    select product.stock_quantity::numeric
    from public.inventory_products product
    where product.id = '25000000-0000-4000-8000-000000025001'
  ),
  1::numeric,
  'hold leaves operational on-hand stock unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025001',
  true
);

select is(
  public.storefront_product_detail_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001'
  ) -> 'item' ->> 'availability',
  'unavailable',
  'active last-piece hold immediately makes public availability unavailable'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025002',
  true
);

create temp table task025_second_unavailable as
select public.customer_reservation_hold_create_v1(
  'hold-fixture-a',
  '55000000-0000-4000-8000-000000025001',
  1,
  '75000000-0000-4000-8000-000000025005'
) as payload;

select is(
  (select payload ->> 'status' from task025_second_unavailable),
  'unavailable',
  'second customer cannot reserve the last piece'
);

select ok(
  (select payload::text from task025_second_unavailable)
    !~* '(stock|reserved|remaining_quantity|source_product|shop_id)',
  'unavailable response does not reveal exact capacity or internal identifiers'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025001',
  true
);

select ok(
  (public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025004'
  ) ->> 'idempotent')::boolean
  and public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025004'
  ) ->> 'holdId' = (select payload ->> 'holdId' from task025_first),
  'same create key and payload returns the identical hold'
);

select is(
  public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    2,
    '75000000-0000-4000-8000-000000025004'
  ) ->> 'status',
  'idempotency_conflict',
  'same create key with a different payload is rejected'
);

select is(
  public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025006'
  ) ->> 'status',
  'active_hold_exists',
  'a second intent cannot duplicate an active owner/publication hold'
);

select throws_ok(
  $$select count(*) from public.customer_reservation_holds$$,
  '42501', null,
  'even the owner cannot bypass hold RPCs with direct reads'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025002',
  true
);

select is(
  public.customer_reservation_hold_read_v1(
    (select (payload ->> 'holdId')::uuid from task025_first)
  ) ->> 'status',
  'not_found',
  'cross-user hold read fails closed without enumeration'
);

select is(
  public.customer_reservation_hold_release_v1(
    (select (payload ->> 'holdId')::uuid from task025_first),
    '75000000-0000-4000-8000-000000025007'
  ) ->> 'status',
  'not_found',
  'cross-user hold release fails closed without mutation'
);

set local role postgres;
select throws_ok(
  $$update public.inventory_products
    set stock_quantity = 0
    where id = '25000000-0000-4000-8000-000000025001'$$,
  '23514', null,
  'operational stock cannot be reduced below active reserved capacity'
);

select lives_ok(
  $$update public.inventory_products
    set stock_quantity = 2
    where id = '25000000-0000-4000-8000-000000025001'$$,
  'operational restock remains allowed while a hold is active'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025001',
  true
);

create temp table task025_release as
select public.customer_reservation_hold_release_v1(
  (select (payload ->> 'holdId')::uuid from task025_first),
  '75000000-0000-4000-8000-000000025008'
) as payload;

select is(
  (select payload ->> 'status' from task025_release),
  'ok',
  'owner can release an active hold'
);

select is(
  (select payload ->> 'holdStatus' from task025_release),
  'released',
  'release is a terminal state transition'
);

select ok(
  (public.customer_reservation_hold_release_v1(
    (select (payload ->> 'holdId')::uuid from task025_first),
    '75000000-0000-4000-8000-000000025008'
  ) ->> 'idempotent')::boolean,
  'same release key replays the stored terminal result'
);

select ok(
  (select payload::text from task025_release)
    !~* '(source_product|stock_quantity|owner_user|shop_id|purchase_price|supplier)',
  'release response preserves the public allow-list'
);

select isnt(
  public.storefront_product_detail_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001'
  ) -> 'item' ->> 'availability',
  'unavailable',
  'release returns public reservable capacity once'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025002',
  true
);

select ok(
  (public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025005'
  ) ->> 'idempotent')::boolean
  and public.customer_reservation_hold_create_v1(
    'hold-fixture-a',
    '55000000-0000-4000-8000-000000025001',
    1,
    '75000000-0000-4000-8000-000000025005'
  ) ->> 'status' = 'unavailable',
  'ambiguous unavailable retry remains stable after capacity changes'
);

create temp table task025_second_active as
select public.customer_reservation_hold_create_v1(
  'hold-fixture-a',
  '55000000-0000-4000-8000-000000025001',
  2,
  '75000000-0000-4000-8000-000000025009'
) as payload;

select is(
  (select payload ->> 'status' from task025_second_active),
  'ok',
  'a new key can reserve capacity returned by release'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.customer_reservation_holds hold
    where hold.source_product_id = '25000000-0000-4000-8000-000000025001'
      and hold.status = 'active'
      and hold.expires_at > now()
  ),
  1,
  'exactly one active hold consumes the restored capacity'
);

select lives_ok(
  $$update public.customer_reservation_holds
    set created_at = now() - interval '30 minutes',
        expires_at = now() - interval '1 minute',
        updated_at = now()
    where id = (
      select (payload ->> 'holdId')::uuid from task025_second_active
    )$$,
  'test fixture advances one hold past its server expiry'
);

select is(
  app_private.storefront_reservation_holds_expire_v1(1, now()) ->> 'expired',
  '1',
  'bounded cleanup expires one eligible hold'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025002',
  true
);

select is(
  public.customer_reservation_hold_read_v1(
    (select (payload ->> 'holdId')::uuid from task025_second_active)
  ) ->> 'holdStatus',
  'expired',
  'read observes the terminal expired state'
);

set local role postgres;
select is(
  app_private.storefront_reservation_holds_expire_v1(1, now()) ->> 'expired',
  '0',
  'second cleanup does not expire the same hold twice'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025002',
  true
);

select is(
  public.customer_reservation_hold_release_v1(
    (select (payload ->> 'holdId')::uuid from task025_second_active),
    '75000000-0000-4000-8000-000000025010'
  ) ->> 'holdStatus',
  'expired',
  'release cannot resurrect or rewrite an expired hold'
);

create temp table task025_after_expiry as
select public.customer_reservation_hold_create_v1(
  'hold-fixture-a',
  '55000000-0000-4000-8000-000000025001',
  1,
  '75000000-0000-4000-8000-000000025011'
) as payload;

select is(
  (select payload ->> 'status' from task025_after_expiry),
  'ok',
  'a fresh intent can use capacity returned by expiry'
);

set local role postgres;
update public.customer_reservation_holds
set status = 'consumed',
    terminal_at = clock_timestamp(),
    updated_at = clock_timestamp()
where id = (select (payload ->> 'holdId')::uuid from task025_after_expiry);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000025002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000025002',
  true
);

select is(
  public.customer_reservation_hold_release_v1(
    (select (payload ->> 'holdId')::uuid from task025_after_expiry),
    '75000000-0000-4000-8000-000000025012'
  ) ->> 'holdStatus',
  'consumed',
  'release cannot rewrite a future order-consumed terminal hold'
);

set local role postgres;
select is(
  app_private.storefront_reservation_holds_expire_v1(0, now()) ->> 'status',
  'validation_failed',
  'cleanup batch size is bounded and fails closed'
);

select is(
  (
    select count(*)::integer
    from public.customer_reservation_holds hold
    where hold.user_id = '00000000-0000-4000-8000-000000025001'
      and hold.status = 'active'
  ),
  0,
  'released customer retains no active hold'
);

select is(
  (
    select count(*)::integer
    from public.customer_reservation_holds hold
    where hold.user_id = '00000000-0000-4000-8000-000000025002'
      and hold.status = 'active'
  ),
  0,
  'expired and consumed customer retains no active hold'
);

select * from finish();
rollback;
