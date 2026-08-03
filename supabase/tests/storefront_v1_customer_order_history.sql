begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regprocedure(
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)'
  ) is not null
  and to_regprocedure('public.customer_order_detail_v1(text,uuid)') is not null
  and to_regprocedure(
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)'
  ) is not null,
  'TASK-028 installs list, detail/timeline and idempotent cancel RPCs'
);

select ok(
  (
    select bool_and(
      procedure.prosecdef and 'search_path=""' = any(procedure.proconfig)
    )
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'customer_order_list_v1',
        'customer_order_detail_v1',
        'customer_order_cancel_v1'
      )
  ),
  'TASK-028 public RPCs are hardened definers with an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.customer_order_detail_v1(text,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_order_list_v1(text,integer,timestamptz,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.customer_order_detail_v1(text,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_order_cancel_v1(text,uuid,bigint,uuid)',
    'EXECUTE'
  ),
  'only authenticated non-anonymous sessions can use order history RPCs'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_order_mutations'::regclass
      and constraint_row.conname = 'customer_order_mutations_operation_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%cancel%'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customer_order_outbox'::regclass
      and constraint_row.conname = 'customer_order_outbox_event_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        ilike '%customer_order.cancelled.v1%'
  ),
  'mutation and outbox constraints explicitly support cancellation'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000028000',
    'authenticated', 'authenticated', 'task028-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000028001',
    'authenticated', 'authenticated', 'task028-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000028002',
    'authenticated', 'authenticated', 'task028-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000028003',
    'authenticated', 'authenticated', 'task028-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '18000000-0000-4000-8000-000000028101',
  'SF28A',
  'Customer order history fixture',
  'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '38000000-0000-4000-8000-000000028101',
  '00000000-0000-4000-8000-000000028000',
  '18000000-0000-4000-8000-000000028101',
  'History fixture', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values (
  '28000000-0000-4000-8000-000000028101',
  '00000000-0000-4000-8000-000000028000',
  '18000000-0000-4000-8000-000000028101',
  'SF28-0001', 'Internal history product',
  '38000000-0000-4000-8000-000000028101',
  800, 1700, 1, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
)
values (
  '18000000-0000-4000-8000-000000028101',
  'customer-history-fixture',
  true, true, false, false, false
);

select ok(
  not (
    select setting.customer_order_cancellation_enabled
    from public.storefront_settings setting
    where setting.shop_id = '18000000-0000-4000-8000-000000028101'
  ),
  'customer cancellation is fail-closed by default'
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values (
  '48000000-0000-4000-8000-000000028101',
  '18000000-0000-4000-8000-000000028101',
  '38000000-0000-4000-8000-000000028101',
  'history-fixture', 'History fixture', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values (
  '58000000-0000-4000-8000-000000028101',
  '18000000-0000-4000-8000-000000028101',
  '28000000-0000-4000-8000-000000028101',
  'published', 'Café de historial',
  '48000000-0000-4000-8000-000000028101',
  1700, 2000, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region,
  public_instructions, enabled
)
values (
  '68000000-0000-4000-8000-000000028101',
  '18000000-0000-4000-8000-000000028101',
  'Retiro historial', 'Av. Central 280', 'Ñuñoa', 'Metropolitana',
  'Presenta el código público.', true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
)
values (
  '78000000-0000-4000-8000-000000028101',
  '18000000-0000-4000-8000-000000028101',
  'pickup',
  '68000000-0000-4000-8000-000000028101',
  'Retiro próximo', now() + interval '2 hours', now() + interval '4 hours',
  1, true
);

insert into public.customer_orders (
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
)
values
  (
    '88000000-0000-4000-8000-000000028101',
    'MC-00000000000000002801',
    '00000000-0000-4000-8000-000000028001',
    '18000000-0000-4000-8000-000000028101',
    1, 'confirmed', 1, 'pickup',
    '78000000-0000-4000-8000-000000028101', 'CLP',
    1700, 0, 1700,
    '{"mode":"pickup","slot":{"label":"Retiro próximo"}}'::jsonb,
    now() - interval '1 minute', now() - interval '1 minute'
  ),
  (
    '88000000-0000-4000-8000-000000028102',
    'MC-00000000000000002802',
    '00000000-0000-4000-8000-000000028001',
    '18000000-0000-4000-8000-000000028101',
    1, 'completed', 2, 'pickup',
    '78000000-0000-4000-8000-000000028101', 'CLP',
    1700, 0, 1700,
    '{"mode":"pickup","slot":{"label":"Retiro próximo"}}'::jsonb,
    now() - interval '1 day', now() - interval '23 hours'
  ),
  (
    '88000000-0000-4000-8000-000000028103',
    'MC-00000000000000002803',
    '00000000-0000-4000-8000-000000028001',
    '18000000-0000-4000-8000-000000028101',
    1, 'cancelled', 2, 'pickup',
    '78000000-0000-4000-8000-000000028101', 'CLP',
    1700, 0, 1700,
    '{"mode":"pickup","slot":{"label":"Retiro próximo"}}'::jsonb,
    now() - interval '2 days', now() - interval '47 hours'
  );

insert into public.customer_order_items (
  order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, compare_at_price_clp,
  line_total_clp, created_at
)
select
  customer_order.id,
  customer_order.shop_id,
  1,
  '58000000-0000-4000-8000-000000028101',
  '28000000-0000-4000-8000-000000028101',
  'Café de historial',
  1, 1700, 2000, 1700,
  customer_order.placed_at
from public.customer_orders customer_order
where customer_order.id in (
  '88000000-0000-4000-8000-000000028101',
  '88000000-0000-4000-8000-000000028102',
  '88000000-0000-4000-8000-000000028103'
);

insert into public.customer_order_status_events (
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values
  (
    '88000000-0000-4000-8000-000000028101',
    '18000000-0000-4000-8000-000000028101',
    1, 'confirmed', 'system', '{}', now() - interval '1 minute'
  ),
  (
    '88000000-0000-4000-8000-000000028102',
    '18000000-0000-4000-8000-000000028101',
    1, 'confirmed', 'system', '{}', now() - interval '1 day'
  ),
  (
    '88000000-0000-4000-8000-000000028102',
    '18000000-0000-4000-8000-000000028101',
    2, 'completed', 'admin', '{}', now() - interval '23 hours'
  ),
  (
    '88000000-0000-4000-8000-000000028103',
    '18000000-0000-4000-8000-000000028101',
    1, 'confirmed', 'system', '{}', now() - interval '2 days'
  ),
  (
    '88000000-0000-4000-8000-000000028103',
    '18000000-0000-4000-8000-000000028101',
    2, 'cancelled', 'customer', '{}', now() - interval '47 hours'
  );

insert into public.customer_order_outbox (
  order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
)
values (
  '88000000-0000-4000-8000-000000028101',
  '18000000-0000-4000-8000-000000028101',
  'customer_order.confirmed.v1',
  '98000000-0000-4000-8000-000000028101',
  '{"documentKind":"customer_order","fiscalStatus":"not_created"}',
  'pending', now(), now(), now()
);

select app_private.storefront_reservation_refresh_availability_v1(
  '28000000-0000-4000-8000-000000028101', now()
);

create temp table task028_fiscal_baseline as
select count(*)::bigint as sale_count
from public.pos_sales
where shop_id = '18000000-0000-4000-8000-000000028101';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000028003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000028003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.customer_order_list_v1(
    'customer-history-fixture', 20, null, null
  )$$,
  '28000', null,
  'anonymous Auth identities cannot read customer order history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000028001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000028001',
  true
);

select is(
  public.customer_order_list_v1(
    'Customer-History-Fixture', 20, null, null
  ) ->> 'status',
  'invalid',
  'non-canonical shop slugs fail closed'
);

select is(
  public.customer_order_list_v1(
    'customer-history-fixture', 51, null, null
  ) ->> 'status',
  'invalid',
  'list size is bounded server-side'
);

create temp table task028_page1 as
select public.customer_order_list_v1(
  'customer-history-fixture', 2, null, null
) as payload;

select ok(
  (select payload ->> 'apiVersion' from task028_page1)
    = 'customer-order-list.v1'
  and (select payload ->> 'status' from task028_page1) = 'ok'
  and (select (payload ->> 'hasMore')::boolean from task028_page1)
  and jsonb_array_length(
    (select payload -> 'orders' from task028_page1)
  ) = 2
  and (select payload #>> '{orders,0,orderId}' from task028_page1)
    = '88000000-0000-4000-8000-000000028101',
  'first history page is newest-first, bounded and advertises continuation'
);

select ok(
  (select payload::text from task028_page1)
    !~* '(source_product|hold_id|quote_id|cart_id|shop_id|user_id|owner_user|purchase_price|stock_quantity|token|email|metadata_redacted)',
  'history cards expose no tenant, owner, operational stock, cost, token or event metadata internals'
);

create temp table task028_page2 as
select public.customer_order_list_v1(
  'customer-history-fixture',
  2,
  (select (payload #>> '{nextCursor,beforePlacedAt}')::timestamptz
   from task028_page1),
  (select (payload #>> '{nextCursor,beforeOrderId}')::uuid
   from task028_page1)
) as payload;

select ok(
  jsonb_array_length((select payload -> 'orders' from task028_page2)) = 1
  and not (select (payload ->> 'hasMore')::boolean from task028_page2)
  and (select payload #>> '{orders,0,orderId}' from task028_page2)
    = '88000000-0000-4000-8000-000000028103'
  and not exists (
    select 1
    from jsonb_array_elements(
      (select payload -> 'orders' from task028_page1)
    ) first_page(order_row)
    join jsonb_array_elements(
      (select payload -> 'orders' from task028_page2)
    ) second_page(order_row)
      on first_page.order_row ->> 'orderId'
       = second_page.order_row ->> 'orderId'
  ),
  'keyset continuation is deterministic and produces no duplicate order'
);

create temp table task028_detail as
select public.customer_order_detail_v1(
  'customer-history-fixture',
  '88000000-0000-4000-8000-000000028101'
) as payload;

select ok(
  (select payload ->> 'apiVersion' from task028_detail)
    = 'customer-order-detail.v1'
  and (select payload ->> 'orderStatus' from task028_detail) = 'confirmed'
  and (select payload ->> 'orderVersion' from task028_detail) = '1'
  and jsonb_array_length(
    (select payload -> 'timeline' from task028_detail)
  ) = 1
  and (select payload #>> '{timeline,0,status}' from task028_detail)
    = 'confirmed',
  'owner detail returns the immutable snapshot and ordered public timeline'
);

select ok(
  not (select (payload #>> '{cancellation,enabled}')::boolean
       from task028_detail)
  and not (select (payload #>> '{cancellation,allowed}')::boolean
           from task028_detail),
  'detail makes the default fail-closed cancellation policy explicit'
);

select ok(
  public.customer_order_detail_v1(
    'different-shop-fixture',
    '88000000-0000-4000-8000-000000028101'
  ) ->> 'status' = 'not_found'
  and public.customer_order_cancel_v1(
    'different-shop-fixture',
    '88000000-0000-4000-8000-000000028101', 1,
    '98000000-0000-4000-8000-000000028107'
  ) ->> 'status' = 'not_found',
  'cross-shop detail and cancel fail closed without order disclosure'
);

select ok(
  (select payload::text from task028_detail)
    !~* '(source_product|hold_id|quote_id|cart_id|shop_id|user_id|owner_user|purchase_price|stock_quantity|token|email|metadata_redacted)',
  'order detail and timeline expose no private server identifiers or event metadata'
);

select is(
  public.customer_order_cancel_v1(
    'customer-history-fixture',
    '88000000-0000-4000-8000-000000028101', 1,
    '98000000-0000-4000-8000-000000028102'
  ) ->> 'status',
  'not_cancellable',
  'cancellation is rejected while the server policy is disabled'
);

set local role postgres;
select is(
  (select count(*)::integer
   from public.customer_order_status_events event
   where event.order_id = '88000000-0000-4000-8000-000000028101'),
  1,
  'disabled cancellation writes no status event'
);

select is(
  jsonb_array_length(
    public.storefront_fulfillment_options_v1(
      'customer-history-fixture'
    ) -> 'slots'
  ),
  0,
  'confirmed order consumes the single fulfillment slot before cancellation'
);

select is(
  app_private.storefront_reservation_active_quantity_v1(
    '28000000-0000-4000-8000-000000028101', now()
  )::integer,
  1,
  'confirmed order consumes ATP without exposing the precise stock to the client'
);

update public.storefront_settings
set customer_order_cancellation_enabled = true,
    customer_order_cancellation_window_minutes = 15
where shop_id = '18000000-0000-4000-8000-000000028101';

set local role authenticated;

select is(
  public.customer_order_cancel_v1(
    'customer-history-fixture',
    '88000000-0000-4000-8000-000000028101', 99,
    '98000000-0000-4000-8000-000000028103'
  ) ->> 'status',
  'version_conflict',
  'stale expected status versions fail closed before mutation'
);

create temp table task028_cancel as
select public.customer_order_cancel_v1(
  'customer-history-fixture',
  '88000000-0000-4000-8000-000000028101', 1,
  '98000000-0000-4000-8000-000000028104'
) as payload;

select ok(
  (select payload ->> 'status' from task028_cancel) = 'ok'
  and not (select (payload ->> 'idempotent')::boolean from task028_cancel)
  and (select payload ->> 'orderStatus' from task028_cancel) = 'cancelled'
  and (select payload ->> 'orderVersion' from task028_cancel) = '2'
  and jsonb_array_length(
    (select payload -> 'timeline' from task028_cancel)
  ) = 2
  and (select payload #>> '{timeline,1,status}' from task028_cancel)
    = 'cancelled',
  'authorized cancellation atomically returns the new version and timeline'
);

create temp table task028_cancel_replay as
select public.customer_order_cancel_v1(
  'customer-history-fixture',
  '88000000-0000-4000-8000-000000028101', 1,
  '98000000-0000-4000-8000-000000028104'
) as payload;

select ok(
  (select (payload ->> 'idempotent')::boolean from task028_cancel_replay)
  and (select payload ->> 'orderVersion' from task028_cancel_replay) = '2',
  'identical cancellation retry replays the same authoritative result'
);

select is(
  public.customer_order_cancel_v1(
    'customer-history-fixture',
    '88000000-0000-4000-8000-000000028101', 2,
    '98000000-0000-4000-8000-000000028104'
  ) ->> 'status',
  'idempotency_conflict',
  'changed cancellation request cannot reuse a committed idempotency key'
);

select is(
  public.customer_order_cancel_v1(
    'customer-history-fixture',
    '88000000-0000-4000-8000-000000028101', 2,
    '98000000-0000-4000-8000-000000028105'
  ) ->> 'status',
  'not_cancellable',
  'a terminal order cannot be cancelled a second time with a new key'
);

set local role postgres;

select ok(
  (
    select customer_order.status = 'cancelled'
      and customer_order.status_version = 2
    from public.customer_orders customer_order
    where customer_order.id = '88000000-0000-4000-8000-000000028101'
  )
  and (
    select count(*) = 2
    from public.customer_order_status_events event
    where event.order_id = '88000000-0000-4000-8000-000000028101'
  )
  and (
    select count(*) = 1
    from public.customer_order_mutations mutation
    where mutation.order_id = '88000000-0000-4000-8000-000000028101'
      and mutation.operation = 'cancel'
  ),
  'cancellation persists one status transition and one mutation receipt'
);

select ok(
  (
    select count(*) = 1
    from public.customer_order_outbox outbox
    where outbox.order_id = '88000000-0000-4000-8000-000000028101'
      and outbox.event_type = 'customer_order.cancelled.v1'
      and outbox.payload ->> 'documentKind' = 'customer_order'
      and outbox.payload ->> 'fiscalStatus' = 'not_created'
  )
  and (
    select count(*)
    from public.pos_sales
    where shop_id = '18000000-0000-4000-8000-000000028101'
  )
      = (select sale_count from task028_fiscal_baseline),
  'cancel outbox remains POS-neutral and creates no fiscal sale'
);

select is(
  app_private.storefront_reservation_active_quantity_v1(
    '28000000-0000-4000-8000-000000028101', now()
  )::integer,
  0,
  'cancellation releases order ATP exactly once'
);

select is(
  jsonb_array_length(
    public.storefront_fulfillment_options_v1(
      'customer-history-fixture'
    ) -> 'slots'
  ),
  1,
  'cancellation releases fulfillment capacity for a new checkout'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000028002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000028002',
  true
);

select ok(
  jsonb_array_length(
    public.customer_order_list_v1(
      'customer-history-fixture', 20, null, null
    ) -> 'orders'
  ) = 0
  and public.customer_order_detail_v1(
    'customer-history-fixture',
    '88000000-0000-4000-8000-000000028101'
  ) ->> 'status' = 'not_found'
  and public.customer_order_cancel_v1(
    'customer-history-fixture',
    '88000000-0000-4000-8000-000000028101', 2,
    '98000000-0000-4000-8000-000000028106'
  ) ->> 'status' = 'not_found',
  'cross-user list, detail and cancel reveal no order existence'
);

set local role postgres;
select ok(
  (
    select count(*) = 3
    from public.customer_orders customer_order
    where customer_order.shop_id = '18000000-0000-4000-8000-000000028101'
  )
  and (
    select count(*) = 3
    from public.customer_order_items item
    where item.order_id in (
      select customer_order.id
      from public.customer_orders customer_order
      where customer_order.shop_id = '18000000-0000-4000-8000-000000028101'
    )
  )
  and (
    select count(*) = 6
    from public.customer_order_status_events event
    where event.shop_id = '18000000-0000-4000-8000-000000028101'
  )
  and (
    select count(*) = 2
    from public.customer_order_outbox outbox
    where outbox.shop_id = '18000000-0000-4000-8000-000000028101'
  ),
  'negative and replay requests leave the expected aggregate cardinality'
);

select * from finish();
rollback;
