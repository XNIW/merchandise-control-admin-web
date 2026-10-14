begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regclass('public.storefront_pickup_points') is not null
  and to_regclass('public.storefront_delivery_zones') is not null
  and to_regclass('public.storefront_delivery_zone_communes') is not null
  and to_regclass('public.storefront_fulfillment_slots') is not null
  and to_regclass('public.customer_checkout_quotes') is not null
  and to_regclass('public.customer_checkout_mutations') is not null,
  'TASK-026 installs fulfillment configuration, checkout quote and idempotency tables'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.storefront_pickup_points'::regclass,
      'public.storefront_delivery_zones'::regclass,
      'public.storefront_delivery_zone_communes'::regclass,
      'public.storefront_fulfillment_slots'::regclass,
      'public.customer_checkout_quotes'::regclass,
      'public.customer_checkout_mutations'::regclass
    )
  ),
  'all TASK-026 tables enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.customer_checkout_quotes'::regclass,
      'public.customer_checkout_mutations'::regclass
    )
  ),
  8,
  'owner-only checkout policies cover every customer table operation'
);

select ok(
  not has_table_privilege(
    'anon', 'public.customer_checkout_quotes', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.customer_checkout_quotes',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.storefront_fulfillment_slots',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles cannot bypass fulfillment and checkout RPC boundaries'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.customer_checkout_quotes',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role',
    'public.storefront_fulfillment_slots',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service-side maintenance receives explicit table privileges'
);

select ok(
  to_regprocedure('public.storefront_fulfillment_options_v1(text)') is not null
  and to_regprocedure(
    'public.customer_checkout_quote_create_v1(text,bigint,text,uuid,uuid,uuid,uuid)'
  ) is not null
  and to_regprocedure(
    'public.customer_checkout_quote_confirm_v1(uuid,bigint,uuid)'
  ) is not null
  and to_regprocedure('public.customer_checkout_quote_read_v1(uuid)') is not null,
  'customer fulfillment and quote RPC signatures are installed'
);

select ok(
  to_regprocedure(
    'public.admin_storefront_fulfillment_read_v1(uuid,uuid,uuid,text,integer)'
  ) is not null
  and to_regprocedure(
    'public.admin_storefront_fulfillment_mutate_v1(uuid,text,jsonb,uuid,uuid,text,integer)'
  ) is not null,
  'Admin fulfillment read and mutation RPC signatures are installed'
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
        'storefront_fulfillment_options_v1',
        'customer_checkout_quote_create_v1',
        'customer_checkout_quote_confirm_v1',
        'customer_checkout_quote_read_v1',
        'admin_storefront_fulfillment_read_v1',
        'admin_storefront_fulfillment_mutate_v1'
      )
  ),
  'all public TASK-026 RPCs are hardened definers with an empty search_path'
);

select ok(
  has_function_privilege(
    'anon', 'public.storefront_fulfillment_options_v1(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_checkout_quote_create_v1(text,bigint,text,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_checkout_quote_confirm_v1(uuid,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_checkout_quote_create_v1(text,bigint,text,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'public discovery and authenticated checkout privileges are least-authority'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.customer_checkout_validate_v1(uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.customer_checkout_quotes_expire_v1(integer,timestamptz)',
    'EXECUTE'
  ),
  'validation, capacity and cleanup engines remain private'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral unnest(
      coalesce(procedure.proargnames, '{}'::text[])
    ) argument(name)
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_checkout_quote_create_v1',
        'customer_checkout_quote_confirm_v1'
      )
      and argument.name ~* '(price|total|discount|fee|stock|user_id|shop_id)'
  ),
  'customer checkout accepts no authoritative price, total, fee, stock, owner or shop input'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_checkout_quotes'::regclass
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id, shop_id, cart_id%customer_carts%'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_checkout_quotes'::regclass
      and constraint_row.contype = 'f'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id, address_id%customer_addresses%'
  ),
  'quote ownership is constrained to the authenticated cart and address owner'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_checkout_mutations'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id, shop_id, idempotency_key%'
  ),
  'checkout idempotency keys are unique per customer and shop'
);

select is(
  (
    select count(*)::integer
    from cron.job
    where jobname = 'storefront-checkout-quote-expire-v1'
      and schedule = '* * * * *'
  ),
  1,
  'bounded quote expiry is scheduled exactly once per minute'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026000',
    'authenticated', 'authenticated', 'task026-owner@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026001',
    'authenticated', 'authenticated', 'task026-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026002',
    'authenticated', 'authenticated', 'task026-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026003',
    'authenticated', 'authenticated', 'task026-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026004',
    'authenticated', 'authenticated', 'task026-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.profiles (profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000026000', 'TASK-026 owner', 'active'),
  ('00000000-0000-4000-8000-000000026004', 'TASK-026 outsider', 'active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  ('16000000-0000-4000-8000-000000026001', 'SF26A', 'Checkout fixture A', 'active'),
  ('16000000-0000-4000-8000-000000026002', 'SF26B', 'Checkout fixture B', 'active');

insert into public.shop_members (profile_id, shop_id, role_key, membership_status)
values (
  '00000000-0000-4000-8000-000000026000',
  '16000000-0000-4000-8000-000000026001',
  'shop_owner',
  'active'
);

insert into public.inventory_categories (id, owner_user_id, shop_id, name, updated_at)
values
  (
    '36000000-0000-4000-8000-000000026001',
    '00000000-0000-4000-8000-000000026000',
    '16000000-0000-4000-8000-000000026001',
    'Checkout A', now()
  ),
  (
    '36000000-0000-4000-8000-000000026002',
    '00000000-0000-4000-8000-000000026004',
    '16000000-0000-4000-8000-000000026002',
    'Checkout B', now()
  );

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values
  (
    '26000000-0000-4000-8000-000000026001',
    '00000000-0000-4000-8000-000000026000',
    '16000000-0000-4000-8000-000000026001',
    'SF26-0001', 'Internal checkout coffee',
    '36000000-0000-4000-8000-000000026001', 400, 1000, 10, now()
  ),
  (
    '26000000-0000-4000-8000-000000026002',
    '00000000-0000-4000-8000-000000026004',
    '16000000-0000-4000-8000-000000026002',
    'SF26-0002', 'Internal other shop',
    '36000000-0000-4000-8000-000000026002', 500, 1500, 10, now()
  );

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled, delivery_enabled,
  reservation_enabled, require_product_image
)
values
  (
    '16000000-0000-4000-8000-000000026001', 'checkout-fixture-a', true,
    false, false, false, false
  ),
  (
    '16000000-0000-4000-8000-000000026002', 'checkout-fixture-b', true,
    true, false, false, false
  );

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values
  (
    '46000000-0000-4000-8000-000000026001',
    '16000000-0000-4000-8000-000000026001',
    '36000000-0000-4000-8000-000000026001',
    'checkout-a', 'Checkout A', 'published'
  ),
  (
    '46000000-0000-4000-8000-000000026002',
    '16000000-0000-4000-8000-000000026002',
    '36000000-0000-4000-8000-000000026002',
    'checkout-b', 'Checkout B', 'published'
  );

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values
  (
    '56000000-0000-4000-8000-000000026001',
    '16000000-0000-4000-8000-000000026001',
    '26000000-0000-4000-8000-000000026001',
    'published', 'Café para checkout',
    '46000000-0000-4000-8000-000000026001', 1000, 1200,
    true, true, true, 'available', now()
  ),
  (
    '56000000-0000-4000-8000-000000026002',
    '16000000-0000-4000-8000-000000026002',
    '26000000-0000-4000-8000-000000026002',
    'published', 'Altro negozio',
    '46000000-0000-4000-8000-000000026002', 1500, null,
    true, false, false, 'available', now()
  );

insert into public.storefront_promotions (
  id, shop_id, public_name, publication_status, discount_type,
  discount_value, priority, starts_at, ends_at
)
values (
  '66000000-0000-4000-8000-000000026001',
  '16000000-0000-4000-8000-000000026001',
  'Precio checkout', 'active', 'fixed_price_clp', 800, 10,
  now() - interval '1 hour', now() + interval '1 hour'
);

insert into public.storefront_promotion_products (
  shop_id, promotion_id, publication_id, excluded
)
values (
  '16000000-0000-4000-8000-000000026001',
  '66000000-0000-4000-8000-000000026001',
  '56000000-0000-4000-8000-000000026001',
  false
);

set local role anon;

select throws_ok(
  $$select count(*) from public.storefront_fulfillment_slots$$,
  '42501', null,
  'anon cannot enumerate fulfillment capacity rows directly'
);

select is(
  public.storefront_fulfillment_options_v1('INVALID') ->> 'status',
  'invalid',
  'public fulfillment discovery rejects an invalid Storefront slug'
);

select is(
  public.storefront_fulfillment_options_v1('checkout-fixture-a') ->> 'status',
  'ok',
  'public fulfillment discovery remains available before configuration'
);

select is(
  public.storefront_fulfillment_options_v1('checkout-fixture-a')
    ->> 'timeZone',
  'America/Santiago',
  'fulfillment snapshot carries the canonical shop timezone atomically'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026000',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_storefront_fulfillment_mutate_v1(
    '16000000-0000-4000-8000-000000026001',
    'settings_upsert',
    '{"pickupEnabled":true,"reservationEnabled":false,"deliveryEnabled":false}'::jsonb
  ) ->> 'code',
  'pickup_configuration_required',
  'Admin cannot enable pickup before a usable public configuration exists'
);

create temp table task026_admin_pickup as
select public.admin_storefront_fulfillment_mutate_v1(
  '16000000-0000-4000-8000-000000026001',
  'pickup_upsert',
  jsonb_build_object(
    'publicName', 'Retiro Ñuñoa',
    'addressLine1', 'Av. Irarrázaval 1234',
    'commune', 'Ñuñoa',
    'region', 'Metropolitana',
    'publicInstructions', 'Presenta tu número de reserva.',
    'enabled', true,
    'sortRank', 10
  )
) as payload;

select is(
  (select payload ->> 'code' from task026_admin_pickup),
  'success',
  'authorized Admin creates an enabled pickup point'
);

create temp table task026_admin_zone as
select public.admin_storefront_fulfillment_mutate_v1(
  '16000000-0000-4000-8000-000000026001',
  'zone_upsert',
  jsonb_build_object(
    'publicName', 'Zona Oriente',
    'region', 'Metropolitana',
    'communes', jsonb_build_array('Ñuñoa', 'Providencia'),
    'feeClp', 500,
    'enabled', true,
    'sortRank', 20
  )
) as payload;

select is(
  (select payload ->> 'code' from task026_admin_zone),
  'success',
  'authorized Admin creates a delivery zone with a server fee'
);

create temp table task026_admin_pickup_slot as
select public.admin_storefront_fulfillment_mutate_v1(
  '16000000-0000-4000-8000-000000026001',
  'slot_upsert',
  jsonb_build_object(
    'mode', 'pickup',
    'pickupPointId', (select payload ->> 'target_id' from task026_admin_pickup),
    'publicLabel', 'Retiro mañana',
    'startsAt', now() + interval '1 hour',
    'endsAt', now() + interval '3 hours',
    'capacity', 2,
    'enabled', true
  )
) as payload;

create temp table task026_admin_reservation_slot as
select public.admin_storefront_fulfillment_mutate_v1(
  '16000000-0000-4000-8000-000000026001',
  'slot_upsert',
  jsonb_build_object(
    'mode', 'reservation',
    'pickupPointId', (select payload ->> 'target_id' from task026_admin_pickup),
    'publicLabel', 'Reserva mañana',
    'startsAt', now() + interval '1 hour',
    'endsAt', now() + interval '3 hours',
    'capacity', 2,
    'enabled', true
  )
) as payload;

create temp table task026_admin_delivery_slot as
select public.admin_storefront_fulfillment_mutate_v1(
  '16000000-0000-4000-8000-000000026001',
  'slot_upsert',
  jsonb_build_object(
    'mode', 'delivery',
    'deliveryZoneId', (select payload ->> 'target_id' from task026_admin_zone),
    'publicLabel', 'Entrega mañana',
    'startsAt', now() + interval '1 hour',
    'endsAt', now() + interval '3 hours',
    'capacity', 1,
    'enabled', true
  )
) as payload;

select ok(
  (select payload ->> 'code' from task026_admin_pickup_slot) = 'success'
  and (select payload ->> 'code' from task026_admin_reservation_slot) = 'success'
  and (select payload ->> 'code' from task026_admin_delivery_slot) = 'success',
  'Admin creates pickup, reservation and delivery windows'
);

select is(
  public.admin_storefront_fulfillment_mutate_v1(
    '16000000-0000-4000-8000-000000026001',
    'settings_upsert',
    '{"pickupEnabled":true,"reservationEnabled":true,"deliveryEnabled":true}'::jsonb
  ) ->> 'code',
  'success',
  'Admin enables only fully configured fulfillment modes'
);

select ok(
  exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '16000000-0000-4000-8000-000000026001'
      and audit.event_key = 'shop.storefront.fulfillment.settings_upsert.success'
      and audit.metadata_redacted ? 'before'
      and audit.metadata_redacted ? 'after'
      and audit.metadata_redacted ->> 'source' = 'storefront_admin'
  ),
  'fulfillment configuration records redacted before/after audit evidence'
);

set local role anon;

create temp table task026_public_options as
select public.storefront_fulfillment_options_v1(
  'checkout-fixture-a'
) as payload;

select is(
  (select jsonb_array_length(payload -> 'slots') from task026_public_options),
  3,
  'public discovery returns each available configured window'
);

select ok(
  (select payload::text from task026_public_options)
    !~* '(capacity|activeQuoteCount|shopId|updatedBy|source_product|stock_quantity)',
  'public discovery reveals no capacity, tenant, actor or inventory internals'
);

select is(
  (select payload ->> 'currencyCode' from task026_public_options),
  'CLP',
  'fulfillment discovery fixes customer money to CLP'
);

set local role postgres;

insert into public.customer_addresses (
  id, user_id, label, recipient_name, address_line_1,
  commune, region, postal_code, country_code, is_default
)
values
  (
    '86000000-0000-4000-8000-000000026001',
    '00000000-0000-4000-8000-000000026001',
    'Casa', 'Cliente A', 'Av. Grecia 100',
    'Ñuñoa', 'Metropolitana', '7750000', 'CL', true
  ),
  (
    '86000000-0000-4000-8000-000000026002',
    '00000000-0000-4000-8000-000000026002',
    'Fuera de zona', 'Cliente B', 'Av. Concha y Toro 200',
    'Puente Alto', 'Metropolitana', '8150000', 'CL', true
  ),
  (
    '86000000-0000-4000-8000-000000026003',
    '00000000-0000-4000-8000-000000026002',
    'Casa válida', 'Cliente B', 'Av. Providencia 300',
    'Providencia', 'Metropolitana', '7500000', 'CL', false
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026003',
  true
);

select throws_ok(
  $$select public.customer_checkout_quote_create_v1(
    'checkout-fixture-a', 0, 'pickup', null,
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '76000000-0000-4000-8000-000000026001'
  )$$,
  '28000', null,
  'anonymous Auth identities cannot create checkout quotes'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table task026_cart_a as
select public.customer_cart_mutate_v1(
  'checkout-fixture-a',
  'set',
  '56000000-0000-4000-8000-000000026001',
  1,
  0,
  '76000000-0000-4000-8000-000000026002'
) as payload;

select is(
  (select payload ->> 'subtotalClp' from task026_cart_a),
  '800',
  'cart captures the active server promotion before checkout'
);

create temp table task026_pickup_quote as
select public.customer_checkout_quote_create_v1(
  'checkout-fixture-a',
  (select (payload ->> 'cartVersion')::bigint from task026_cart_a),
  'pickup',
  null,
  (select (payload ->> 'target_id')::uuid from task026_admin_pickup),
  (select (payload ->> 'target_id')::uuid from task026_admin_pickup_slot),
  '76000000-0000-4000-8000-000000026003'
) as payload;

select is(
  (select payload ->> 'status' from task026_pickup_quote),
  'quoted',
  'customer creates a pickup checkout quote'
);

select is(
  (select payload ->> 'totalClp' from task026_pickup_quote),
  '800',
  'pickup total is derived from the current server promotion with no fee'
);

select ok(
  (select payload::text from task026_pickup_quote)
    !~* '(source_product|owner_user|stock_quantity|purchase_price|supplier|token|email)',
  'checkout response exposes no internal product, owner, stock, cost, supplier, token or email'
);

select ok(
  (select (payload ->> 'remainingSeconds')::integer from task026_pickup_quote)
    between 299 and 300,
  'quote expiry is server-derived and bounded to five minutes'
);

create temp table task026_pickup_replay as
select public.customer_checkout_quote_create_v1(
  'checkout-fixture-a',
  (select (payload ->> 'cartVersion')::bigint from task026_cart_a),
  'pickup',
  null,
  (select (payload ->> 'target_id')::uuid from task026_admin_pickup),
  (select (payload ->> 'target_id')::uuid from task026_admin_pickup_slot),
  '76000000-0000-4000-8000-000000026003'
) as payload;

select ok(
  (select (payload ->> 'idempotent')::boolean from task026_pickup_replay)
  and (select payload ->> 'quoteId' from task026_pickup_replay)
    = (select payload ->> 'quoteId' from task026_pickup_quote),
  'identical quote retry returns the original result idempotently'
);

select is(
  public.customer_checkout_quote_create_v1(
    'checkout-fixture-a',
    (select (payload ->> 'cartVersion')::bigint from task026_cart_a),
    'reservation',
    null,
    (select (payload ->> 'target_id')::uuid from task026_admin_pickup),
    (select (payload ->> 'target_id')::uuid from task026_admin_reservation_slot),
    '76000000-0000-4000-8000-000000026003'
  ) ->> 'status',
  'idempotency_conflict',
  'reusing a quote idempotency key for a different request fails closed'
);

create temp table task026_pickup_confirm as
select public.customer_checkout_quote_confirm_v1(
  (select (payload ->> 'quoteId')::uuid from task026_pickup_quote),
  1,
  '76000000-0000-4000-8000-000000026004'
) as payload;

select ok(
  (select payload ->> 'status' from task026_pickup_confirm) = 'confirmed'
  and (select payload ->> 'quoteStatus' from task026_pickup_confirm) = 'confirmed'
  and (select payload ->> 'quoteVersion' from task026_pickup_confirm) = '2',
  'customer confirms an unchanged quote with an incremented server version'
);

select ok(
  (public.customer_checkout_quote_confirm_v1(
    (select (payload ->> 'quoteId')::uuid from task026_pickup_quote),
    1,
    '76000000-0000-4000-8000-000000026004'
  ) ->> 'idempotent')::boolean,
  'confirm retry returns the original result idempotently'
);

select is(
  public.customer_checkout_quote_confirm_v1(
    (select (payload ->> 'quoteId')::uuid from task026_pickup_quote),
    2,
    '76000000-0000-4000-8000-000000026004'
  ) ->> 'status',
  'idempotency_conflict',
  'confirm idempotency rejects a changed expected version'
);

create temp table task026_delivery_quote as
select public.customer_checkout_quote_create_v1(
  'checkout-fixture-a',
  (select (payload ->> 'cartVersion')::bigint from task026_cart_a),
  'delivery',
  '86000000-0000-4000-8000-000000026001',
  null,
  (select (payload ->> 'target_id')::uuid from task026_admin_delivery_slot),
  '76000000-0000-4000-8000-000000026005'
) as payload;

select ok(
  (select payload ->> 'status' from task026_delivery_quote) = 'quoted'
  and (select payload ->> 'subtotalClp' from task026_delivery_quote) = '800'
  and (select payload ->> 'deliveryFeeClp' from task026_delivery_quote) = '500'
  and (select payload ->> 'totalClp' from task026_delivery_quote) = '1300',
  'delivery quote derives promotion price, configured fee and total server-side'
);

set local role postgres;

select ok(
  (
    select address_snapshot = jsonb_build_object(
      'addressId', '86000000-0000-4000-8000-000000026001'::uuid,
      'recipientName', 'Cliente A',
      'addressLine1', 'Av. Grecia 100',
      'addressLine2', null,
      'commune', 'Ñuñoa',
      'region', 'Metropolitana',
      'postalCode', '7750000',
      'countryCode', 'CL',
      'deliveryInstructions', null
    )
    from public.customer_checkout_quotes quote
    where quote.id = (
      select (payload ->> 'quoteId')::uuid from task026_delivery_quote
    )
  ),
  'delivery address is snapshotted from the owner record on the server'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table task026_cart_b as
select public.customer_cart_mutate_v1(
  'checkout-fixture-a',
  'set',
  '56000000-0000-4000-8000-000000026001',
  1,
  0,
  '76000000-0000-4000-8000-000000026006'
) as payload;

select is(
  public.customer_checkout_quote_read_v1(
    (select (payload ->> 'quoteId')::uuid from task026_delivery_quote)
  ) ->> 'status',
  'not_found',
  'cross-user quote reads fail closed without existence disclosure'
);

select is(
  public.customer_checkout_quote_create_v1(
    'checkout-fixture-a',
    (select (payload ->> 'cartVersion')::bigint from task026_cart_b),
    'delivery',
    '86000000-0000-4000-8000-000000026001',
    null,
    (select (payload ->> 'target_id')::uuid from task026_admin_delivery_slot),
    '76000000-0000-4000-8000-000000026007'
  ) ->> 'status',
  'invalid_address',
  'customer cannot use another owner address'
);

select is(
  public.customer_checkout_quote_create_v1(
    'checkout-fixture-a',
    (select (payload ->> 'cartVersion')::bigint from task026_cart_b),
    'delivery',
    '86000000-0000-4000-8000-000000026002',
    null,
    (select (payload ->> 'target_id')::uuid from task026_admin_delivery_slot),
    '76000000-0000-4000-8000-000000026008'
  ) ->> 'status',
  'unsupported_zone',
  'delivery rejects an otherwise valid owner address outside the configured zone'
);

select is(
  public.customer_checkout_quote_create_v1(
    'checkout-fixture-a',
    (select (payload ->> 'cartVersion')::bigint from task026_cart_b),
    'delivery',
    '86000000-0000-4000-8000-000000026003',
    null,
    (select (payload ->> 'target_id')::uuid from task026_admin_delivery_slot),
    '76000000-0000-4000-8000-000000026009'
  ) ->> 'status',
  'slot_unavailable',
  'second customer cannot exceed the final delivery slot capacity'
);

select is(
  public.customer_checkout_quote_create_v1(
    'checkout-fixture-a',
    (select (payload ->> 'cartVersion')::bigint from task026_cart_b),
    'reservation',
    null,
    (select (payload ->> 'target_id')::uuid from task026_admin_pickup),
    (select (payload ->> 'target_id')::uuid from task026_admin_reservation_slot),
    '76000000-0000-4000-8000-000000026010'
  ) ->> 'status',
  'cart_unavailable',
  'reservation checkout requires a live owner hold'
);

create temp table task026_hold_b as
select public.customer_reservation_hold_create_v1(
  'checkout-fixture-a',
  '56000000-0000-4000-8000-000000026001',
  1,
  '76000000-0000-4000-8000-000000026011'
) as payload;

select is(
  (select payload ->> 'status' from task026_hold_b),
  'ok',
  'customer creates the required reservation hold'
);

create temp table task026_reservation_quote as
select public.customer_checkout_quote_create_v1(
  'checkout-fixture-a',
  (select (payload ->> 'cartVersion')::bigint from task026_cart_b),
  'reservation',
  null,
  (select (payload ->> 'target_id')::uuid from task026_admin_pickup),
  (select (payload ->> 'target_id')::uuid from task026_admin_reservation_slot),
  '76000000-0000-4000-8000-000000026012'
) as payload;

select ok(
  (select payload ->> 'status' from task026_reservation_quote) = 'quoted'
  and (select payload -> 'items' -> 0 ->> 'holdId' from task026_reservation_quote)
    = (select payload ->> 'holdId' from task026_hold_b),
  'reservation quote binds the cart line to the customer hold'
);

set local role postgres;

update public.storefront_promotions promotion
set publication_status = 'paused'
where promotion.id = '66000000-0000-4000-8000-000000026001';

update public.storefront_delivery_zones zone
set fee_clp = 700
where zone.id = (
  select (payload ->> 'target_id')::uuid from task026_admin_zone
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table task026_delivery_reprice as
select public.customer_checkout_quote_confirm_v1(
  (select (payload ->> 'quoteId')::uuid from task026_delivery_quote),
  1,
  '76000000-0000-4000-8000-000000026013'
) as payload;

select ok(
  (select payload ->> 'status' from task026_delivery_reprice) = 'requires_review'
  and (select payload ->> 'quoteStatus' from task026_delivery_reprice) = 'requires_review'
  and (select payload ->> 'quoteVersion' from task026_delivery_reprice) = '2'
  and (select payload ->> 'subtotalClp' from task026_delivery_reprice) = '1000'
  and (select payload ->> 'deliveryFeeClp' from task026_delivery_reprice) = '700'
  and (select payload ->> 'totalClp' from task026_delivery_reprice) = '1700',
  'server revalidation surfaces expired promotion and fee changes for customer review'
);

select is(
  (select payload -> 'changes' -> 0 ->> 'type' from task026_delivery_reprice),
  'price_changed',
  'repricing response classifies the changed customer price'
);

create temp table task026_delivery_confirmed as
select public.customer_checkout_quote_confirm_v1(
  (select (payload ->> 'quoteId')::uuid from task026_delivery_quote),
  2,
  '76000000-0000-4000-8000-000000026014'
) as payload;

select ok(
  (select payload ->> 'status' from task026_delivery_confirmed) = 'confirmed'
  and (select payload ->> 'quoteVersion' from task026_delivery_confirmed) = '3'
  and (select (payload ->> 'requiresCustomerReview')::boolean from task026_delivery_confirmed) is false,
  'customer explicitly accepts the refreshed server quote before order creation'
);

set local role postgres;

update public.customer_checkout_quotes quote
set status = 'quoted',
    confirmed_at = null,
    quoted_at = statement_timestamp() - interval '6 minutes',
    expires_at = statement_timestamp() - interval '1 minute'
where quote.id = (
  select (payload ->> 'quoteId')::uuid from task026_reservation_quote
);

select is(
  (app_private.customer_checkout_quotes_expire_v1(
    1, statement_timestamp()
  ) ->> 'processed')::integer,
  1,
  'bounded cleanup processes at most the requested expired quote batch'
);

select is(
  (
    select quote.status
    from public.customer_checkout_quotes quote
    where quote.id = (
      select (payload ->> 'quoteId')::uuid from task026_reservation_quote
    )
  ),
  'expired',
  'cleanup transitions an expired active quote without deleting evidence'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026000',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table task026_admin_read as
select public.admin_storefront_fulfillment_read_v1(
  '16000000-0000-4000-8000-000000026001'
) as payload;

select ok(
  (select payload ->> 'code' from task026_admin_read) = 'success'
  and (select jsonb_array_length(payload -> 'pickupPoints') from task026_admin_read) = 1
  and (select jsonb_array_length(payload -> 'deliveryZones') from task026_admin_read) = 1
  and (select jsonb_array_length(payload -> 'slots') from task026_admin_read) = 3
  and (select jsonb_array_length(payload -> 'audit') from task026_admin_read) >= 6,
  'Admin read model returns configured fulfillment, capacity and audit state'
);

select is(
  public.admin_storefront_fulfillment_mutate_v1(
    '16000000-0000-4000-8000-000000026001',
    'zone_upsert',
    jsonb_build_object(
      'id', (select payload ->> 'target_id' from task026_admin_zone),
      'publicName', 'Zona Oriente',
      'region', 'Metropolitana',
      'communes', jsonb_build_array('Ñuñoa', 'Providencia'),
      'feeClp', 700,
      'enabled', false,
      'sortRank', 20
    )
  ) ->> 'code',
  'active_checkout_conflict',
  'Admin cannot disable delivery configuration used by an active confirmed quote'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000026004","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000026004',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_storefront_fulfillment_read_v1(
    '16000000-0000-4000-8000-000000026001'
  ) ->> 'code',
  'permission_denied',
  'cross-shop authenticated account cannot read fulfillment configuration'
);

select is(
  public.admin_storefront_fulfillment_mutate_v1(
    '16000000-0000-4000-8000-000000026001',
    'settings_upsert',
    '{}'::jsonb
  ) ->> 'code',
  'permission_denied',
  'cross-shop authenticated account cannot mutate fulfillment configuration'
);

set local role service_role;

select is(
  public.admin_storefront_fulfillment_mutate_v1(
    '16000000-0000-4000-8000-000000026001',
    'settings_upsert',
    '{}'::jsonb
  ) ->> 'code',
  'permission_denied',
  'service role without a valid staff lease cannot author fulfillment settings'
);

set local role postgres;
select * from finish();
rollback;
