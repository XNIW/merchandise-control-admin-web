begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regclass('public.customer_orders') is not null
  and to_regclass('public.customer_order_items') is not null
  and to_regclass('public.customer_order_status_events') is not null
  and to_regclass('public.customer_order_outbox') is not null
  and to_regclass('public.customer_order_mutations') is not null,
  'TASK-027 installs order, immutable item/event, outbox and idempotency tables'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.customer_orders'::regclass,
      'public.customer_order_items'::regclass,
      'public.customer_order_status_events'::regclass,
      'public.customer_order_outbox'::regclass,
      'public.customer_order_mutations'::regclass
    )
  ),
  'all TASK-027 customer-order tables enable and force RLS'
);

select ok(
  not has_table_privilege(
    'anon', 'public.customer_orders', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.customer_orders', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.customer_order_outbox',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles cannot bypass the customer-order RPC boundary or read the POS outbox'
);

select ok(
  has_table_privilege(
    'service_role', 'public.customer_orders', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role', 'public.customer_order_outbox',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service-side processing has explicit least-purpose table privileges'
);

select ok(
  to_regprocedure(
    'public.customer_order_create_v1(uuid,bigint,uuid)'
  ) is not null
  and to_regprocedure('public.customer_order_read_v1(uuid)') is not null,
  'order create and owner-read RPC signatures are installed'
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
        'customer_order_create_v1',
        'customer_order_read_v1'
      )
  ),
  'public TASK-027 RPCs are hardened definers with an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.customer_order_create_v1(uuid,bigint,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.customer_order_read_v1(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_order_create_v1(uuid,bigint,uuid)', 'EXECUTE'
  ),
  'only authenticated customers can create and read orders'
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
      and procedure.proname = 'customer_order_create_v1'
      and argument.name ~* '(price|total|discount|fee|stock|user_id|shop_id)'
  ),
  'order creation accepts no authoritative price, total, discount, stock, owner or shop input'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_orders'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%quote_id%'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_order_mutations'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%user_id, shop_id, idempotency_key%'
  ),
  'one-order-per-quote and owner/shop idempotency invariants are database enforced'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000027000',
    'authenticated', 'authenticated', 'task027-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000027001',
    'authenticated', 'authenticated', 'task027-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000027002',
    'authenticated', 'authenticated', 'task027-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000027003',
    'authenticated', 'authenticated', 'task027-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '17000000-0000-4000-8000-000000027001',
  'SF27A',
  'Customer order fixture',
  'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '37000000-0000-4000-8000-000000027001',
  '00000000-0000-4000-8000-000000027000',
  '17000000-0000-4000-8000-000000027001',
  'Order fixture',
  now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values (
  '27000000-0000-4000-8000-000000027001',
  '00000000-0000-4000-8000-000000027000',
  '17000000-0000-4000-8000-000000027001',
  'SF27-0001',
  'Internal order product',
  '37000000-0000-4000-8000-000000027001',
  500, 1200, 3, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
)
values (
  '17000000-0000-4000-8000-000000027001',
  'customer-order-fixture',
  true, true, false, false, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values (
  '47000000-0000-4000-8000-000000027001',
  '17000000-0000-4000-8000-000000027001',
  '37000000-0000-4000-8000-000000027001',
  'order-fixture', 'Order fixture', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values (
  '57000000-0000-4000-8000-000000027001',
  '17000000-0000-4000-8000-000000027001',
  '27000000-0000-4000-8000-000000027001',
  'published', 'Café de pedido',
  '47000000-0000-4000-8000-000000027001',
  1200, 1500, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region,
  public_instructions, enabled
)
values (
  '67000000-0000-4000-8000-000000027001',
  '17000000-0000-4000-8000-000000027001',
  'Retiro central', 'Av. Central 270', 'Ñuñoa', 'Metropolitana',
  'Presenta tu código de pedido.', true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
)
values (
  '77000000-0000-4000-8000-000000027001',
  '17000000-0000-4000-8000-000000027001',
  'pickup',
  '67000000-0000-4000-8000-000000027001',
  'Retiro hoy', now() + interval '1 hour', now() + interval '3 hours', 1, true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000027003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000027003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.customer_order_create_v1(
    '87000000-0000-4000-8000-000000027001', 1,
    '97000000-0000-4000-8000-000000027001'
  )$$,
  '28000', null,
  'anonymous Auth identities cannot create customer orders'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000027001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000027001',
  true
);

create temp table task027_cart as
select public.customer_cart_mutate_v1(
  'customer-order-fixture',
  'set',
  '57000000-0000-4000-8000-000000027001',
  2,
  0,
  '97000000-0000-4000-8000-000000027002'
) as payload;

select is(
  (select payload ->> 'subtotalClp' from task027_cart),
  '2400',
  'cart economic state is derived from the public server price'
);

create temp table task027_quote as
select public.customer_checkout_quote_create_v1(
  'customer-order-fixture',
  (select (payload ->> 'cartVersion')::bigint from task027_cart),
  'pickup',
  null,
  '67000000-0000-4000-8000-000000027001',
  '77000000-0000-4000-8000-000000027001',
  '97000000-0000-4000-8000-000000027003'
) as payload;

select is(
  (select payload ->> 'status' from task027_quote),
  'quoted',
  'customer obtains a bounded server-side quote before order creation'
);

create temp table task027_confirm as
select public.customer_checkout_quote_confirm_v1(
  (select (payload ->> 'quoteId')::uuid from task027_quote),
  1,
  '97000000-0000-4000-8000-000000027004'
) as payload;

select ok(
  (select payload ->> 'status' from task027_confirm) = 'confirmed'
  and (select payload ->> 'quoteVersion' from task027_confirm) = '2',
  'unchanged quote is explicitly confirmed at version 2'
);

create temp table task027_order as
select public.customer_order_create_v1(
  (select (payload ->> 'quoteId')::uuid from task027_quote),
  2,
  '97000000-0000-4000-8000-000000027005'
) as payload;

select ok(
  (select payload ->> 'status' from task027_order) = 'ok'
  and (select payload ->> 'orderStatus' from task027_order) = 'confirmed'
  and (select payload ->> 'currencyCode' from task027_order) = 'CLP'
  and (select payload ->> 'subtotalClp' from task027_order) = '2400'
  and (select payload ->> 'deliveryFeeClp' from task027_order) = '0'
  and (select payload ->> 'totalClp' from task027_order) = '2400',
  'atomic order response returns the server-owned confirmed economic snapshot'
);

select ok(
  (select payload ->> 'orderCode' from task027_order) ~ '^MC-[0-9A-F]{20}$'
  and jsonb_array_length(
    (select payload -> 'items' from task027_order)
  ) = 1
  and (select payload #>> '{items,0,quantity}' from task027_order) = '2',
  'order exposes a stable public code and exact immutable item quantity'
);

select ok(
  (select payload::text from task027_order)
    !~* '(source_product|hold_id|quote_id|cart_id|shop_id|user_id|owner_user|purchase_price|stock_quantity|token|email)',
  'customer response exposes no product, hold, quote, cart, tenant, owner, cost, stock, token or email internals'
);

set local role postgres;

select is(
  (
    select count(*)::integer
    from public.customer_orders customer_order
    where customer_order.user_id = '00000000-0000-4000-8000-000000027001'
  ),
  1,
  'exactly one customer order is persisted'
);

select ok(
  (
    select count(*) = 1
    from public.customer_order_items item
    where item.order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  )
  and (
    select count(*) = 1
    from public.customer_order_status_events event
    where event.order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
      and event.event_version = 1
      and event.status = 'confirmed'
  )
  and (
    select count(*) = 1
    from public.customer_order_outbox outbox
    where outbox.order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
      and outbox.status = 'pending'
  ),
  'item snapshot, first status event and outbox record commit with the order'
);

select ok(
  (
    select payload ->> 'documentKind' = 'customer_order'
      and payload ->> 'fiscalStatus' = 'not_created'
      and payload ->> 'eventType' = 'customer_order.confirmed.v1'
    from public.customer_order_outbox outbox
    where outbox.order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  ),
  'outbox contract keeps customer order explicitly separate from fiscal sale'
);

select ok(
  (
    select quote.status = 'consumed' and quote.consumed_at is not null
    from public.customer_checkout_quotes quote
    where quote.id = (
      select (payload ->> 'quoteId')::uuid from task027_quote
    )
  )
  and not exists (
    select 1
    from public.customer_cart_items item
    where item.cart_id = (
      select cart.id
      from public.customer_carts cart
      where cart.user_id = '00000000-0000-4000-8000-000000027001'
        and cart.shop_id = '17000000-0000-4000-8000-000000027001'
    )
  ),
  'quote consumption and cart clearing are atomic with order creation'
);

select ok(
  (
    select hold.status = 'consumed' and hold.terminal_at is not null
    from public.customer_reservation_holds hold
    where hold.id = (
      select item.hold_id
      from public.customer_order_items item
      where item.order_id = (
        select (payload ->> 'orderId')::uuid from task027_order
      )
    )
  )
  and app_private.storefront_reservation_active_quantity_v1(
    '27000000-0000-4000-8000-000000027001', now()
  ) = 2,
  'consumed hold is replaced transactionally by active-order ATP capacity'
);

select is(
  (
    select stock_quantity::integer
    from public.inventory_products
    where id = '27000000-0000-4000-8000-000000027001'
  ),
  3,
  'customer order does not mutate operational on-hand inventory'
);

select is(
  jsonb_array_length(
    public.storefront_fulfillment_options_v1('customer-order-fixture') -> 'slots'
  ),
  0,
  'active order continues consuming slot capacity after quote consumption'
);

set local role authenticated;

create temp table task027_replay as
select public.customer_order_create_v1(
  (select (payload ->> 'quoteId')::uuid from task027_quote),
  2,
  '97000000-0000-4000-8000-000000027005'
) as payload;

select ok(
  (select (payload ->> 'idempotent')::boolean from task027_replay)
  and (select payload ->> 'orderId' from task027_replay)
    = (select payload ->> 'orderId' from task027_order),
  'identical retry returns the same order without duplicate writes'
);

select is(
  public.customer_order_create_v1(
    (select (payload ->> 'quoteId')::uuid from task027_quote),
    99,
    '97000000-0000-4000-8000-000000027005'
  ) ->> 'status',
  'idempotency_conflict',
  'same idempotency key with a changed request fails closed'
);

create temp table task027_existing as
select public.customer_order_create_v1(
  (select (payload ->> 'quoteId')::uuid from task027_quote),
  2,
  '97000000-0000-4000-8000-000000027006'
) as payload;

select ok(
  (select (payload ->> 'idempotent')::boolean from task027_existing)
  and (select payload ->> 'orderId' from task027_existing)
    = (select payload ->> 'orderId' from task027_order),
  'a new retry key for an already consumed quote still resolves to one order/outbox'
);

select ok(
  (public.customer_order_read_v1(
    (select (payload ->> 'orderId')::uuid from task027_order)
  ) ->> 'orderId') = (select payload ->> 'orderId' from task027_order),
  'order owner can recover the immutable receipt'
);

set local role postgres;
update public.storefront_product_publications
set public_name = 'Nombre cambiado',
    retail_price_clp = 1900,
    compare_at_price_clp = 2200
where id = '57000000-0000-4000-8000-000000027001';

select ok(
  (
    select item.public_name = 'Café de pedido'
      and item.unit_price_clp = 1200
      and item.line_total_clp = 2400
    from public.customer_order_items item
    where item.order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  )
  and (select count(*) from public.customer_orders) = 1
  and (select count(*) from public.customer_order_outbox) = 1,
  'later catalog changes cannot rewrite the customer order item snapshot'
);

select throws_ok(
  $$
    update public.customer_orders
    set total_clp = total_clp + 1,
        subtotal_clp = subtotal_clp + 1
    where id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  $$,
  '55000',
  'customer_order_snapshot_immutable',
  'economic and fulfillment order snapshots reject post-confirmation mutation'
);

select throws_ok(
  $$
    update public.customer_order_items
    set public_name = 'Snapshot alterado'
    where order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  $$,
  '55000',
  'customer_order_item_snapshot_immutable',
  'order item snapshots reject post-confirmation mutation'
);

select throws_ok(
  $$
    update public.customer_order_status_events
    set status = 'accepted'
    where order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  $$,
  '55000',
  'customer_order_status_event_append_only',
  'status events are append-only'
);

select throws_ok(
  $$
    update public.customer_order_outbox
    set payload = payload || '{"fiscalStatus":"created"}'::jsonb
    where order_id = (
      select (payload ->> 'orderId')::uuid from task027_order
    )
  $$,
  '55000',
  'customer_order_outbox_envelope_immutable',
  'outbox identity and payload envelope reject post-confirmation mutation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000027002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000027002',
  true
);

select is(
  public.customer_order_read_v1(
    (select (payload ->> 'orderId')::uuid from task027_order)
  ) ->> 'status',
  'not_found',
  'cross-user order reads fail closed without existence disclosure'
);

select is(
  public.customer_order_create_v1(
    '87000000-0000-4000-8000-000000027099',
    1,
    '97000000-0000-4000-8000-000000027099'
  ) ->> 'status',
  'not_found',
  'invalid order source creates neither an order nor a mutation'
);

set local role postgres;
select ok(
  (select count(*) from public.customer_orders) = 1
  and (select count(*) from public.customer_order_items) = 1
  and (select count(*) from public.customer_order_status_events) = 1
  and (select count(*) from public.customer_order_outbox) = 1,
  'negative requests leave the atomic order aggregate unchanged'
);

select * from finish();
rollback;
