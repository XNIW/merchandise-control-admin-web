begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regprocedure(
    'public.admin_customer_orders_read_v1(uuid,text,jsonb,uuid,uuid,text,integer)'
  ) is not null
  and to_regprocedure(
    'public.admin_customer_order_transition_v1(uuid,uuid,text,bigint,uuid,uuid,text,uuid,uuid,text,integer)'
  ) is not null,
  'TASK-029 installs strict queue/detail and transition RPCs'
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
        'admin_customer_orders_read_v1',
        'admin_customer_order_transition_v1'
      )
  ),
  'Admin order RPCs are hardened definers with empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_customer_orders_read_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.admin_customer_order_transition_v1(uuid,uuid,text,bigint,uuid,uuid,text,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_customer_orders_read_v1(uuid,text,jsonb,uuid,uuid,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.admin_customer_order_transition_v1(uuid,uuid,text,bigint,uuid,uuid,text,uuid,uuid,text,integer)',
    'EXECUTE'
  ),
  'anonymous sessions cannot execute Admin order boundaries'
);

select diag(format(
  'Admin ledger grants: anon=%s authenticated=%s service_select=%s service_insert=%s service_delete=%s service_update=%s',
  has_table_privilege(
    'anon', 'public.customer_order_admin_mutations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  has_table_privilege(
    'authenticated', 'public.customer_order_admin_mutations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  has_table_privilege(
    'service_role', 'public.customer_order_admin_mutations', 'SELECT'
  ),
  has_table_privilege(
    'service_role', 'public.customer_order_admin_mutations', 'INSERT'
  ),
  has_table_privilege(
    'service_role', 'public.customer_order_admin_mutations', 'DELETE'
  ),
  has_table_privilege(
    'service_role', 'public.customer_order_admin_mutations', 'UPDATE'
  )
));

select ok(
  (
    select relrowsecurity and relforcerowsecurity
      and not has_table_privilege(
        'anon', 'public.customer_order_admin_mutations',
        'SELECT,INSERT,UPDATE,DELETE'
      )
      and not has_table_privilege(
        'authenticated', 'public.customer_order_admin_mutations',
        'SELECT,INSERT,UPDATE,DELETE'
      )
      and has_table_privilege(
        'service_role', 'public.customer_order_admin_mutations', 'SELECT'
      )
      and has_table_privilege(
        'service_role', 'public.customer_order_admin_mutations', 'INSERT'
      )
      and has_table_privilege(
        'service_role', 'public.customer_order_admin_mutations', 'DELETE'
      )
    from pg_catalog.pg_class
    where oid = 'public.customer_order_admin_mutations'::regclass
  ),
  'Admin mutation ledger denies untrusted roles and keeps bounded service maintenance access behind forced RLS'
);

select has_trigger(
  'public',
  'customer_order_admin_mutations',
  'customer_order_admin_mutations_guard_immutable',
  'Admin mutation receipts are immutable after insertion'
);

select ok(
  exists (
    select 1
    from app_private.mac_admin_w7pos_009_pos_admin_permissions()
    where permission_key = 'orders.view'
  )
  and exists (
    select 1
    from app_private.mac_admin_w7pos_009_pos_admin_permissions()
    where permission_key = 'orders.manage'
  ),
  'POS Admin role contract contains granular order view/manage permissions'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000029000',
    'authenticated', 'authenticated', 'task029-owner@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000029001',
    'authenticated', 'authenticated', 'task029-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000029002',
    'authenticated', 'authenticated', 'task029-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values
  (
    '19000000-0000-4000-8000-000000029001',
    'SF29A', 'Admin order fixture A', 'active'
  ),
  (
    '19000000-0000-4000-8000-000000029002',
    'SF29B', 'Admin order fixture B', 'active'
  );

insert into public.shop_members (
  shop_id, profile_id, role_key, membership_status
)
values
  (
    '19000000-0000-4000-8000-000000029001',
    '00000000-0000-4000-8000-000000029000',
    'shop_owner', 'active'
  ),
  (
    '19000000-0000-4000-8000-000000029002',
    '00000000-0000-4000-8000-000000029000',
    'shop_owner', 'active'
  );

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '39000000-0000-4000-8000-000000029001',
  '00000000-0000-4000-8000-000000029000',
  '19000000-0000-4000-8000-000000029001',
  'Admin order fixture', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values (
  '29000000-0000-4000-8000-000000029001',
  '00000000-0000-4000-8000-000000029000',
  '19000000-0000-4000-8000-000000029001',
  'SF29-0001', 'Internal admin order product',
  '39000000-0000-4000-8000-000000029001',
  800, 1700, 20, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
)
values
  (
    '19000000-0000-4000-8000-000000029001',
    'admin-order-fixture-a', true, true, true, true, false
  ),
  (
    '19000000-0000-4000-8000-000000029002',
    'admin-order-fixture-b', true, true, false, false, false
  );

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values (
  '49000000-0000-4000-8000-000000029001',
  '19000000-0000-4000-8000-000000029001',
  '39000000-0000-4000-8000-000000029001',
  'admin-order-fixture', 'Admin order fixture', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values (
  '59000000-0000-4000-8000-000000029001',
  '19000000-0000-4000-8000-000000029001',
  '29000000-0000-4000-8000-000000029001',
  'published', 'Café de operación',
  '49000000-0000-4000-8000-000000029001',
  1700, 2000, true, true, true, 'available', now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region,
  public_instructions, enabled
)
values (
  '69000000-0000-4000-8000-000000029001',
  '19000000-0000-4000-8000-000000029001',
  'Retiro operación', 'Av. Central 290', 'Ñuñoa', 'Metropolitana',
  'Presenta el código público.', true
);

insert into public.storefront_delivery_zones (
  id, shop_id, public_name, region, fee_clp, enabled
)
values (
  '79000000-0000-4000-8000-000000029001',
  '19000000-0000-4000-8000-000000029001',
  'Zona operación', 'Metropolitana', 1500, true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, delivery_zone_id,
  public_label, starts_at, ends_at, capacity, enabled
)
values
  (
    '89000000-0000-4000-8000-000000029001',
    '19000000-0000-4000-8000-000000029001',
    'pickup', '69000000-0000-4000-8000-000000029001', null,
    'Retiro próximo', now() + interval '2 hours', now() + interval '4 hours',
    20, true
  ),
  (
    '89000000-0000-4000-8000-000000029002',
    '19000000-0000-4000-8000-000000029001',
    'delivery', null, '79000000-0000-4000-8000-000000029001',
    'Entrega próxima', now() + interval '2 hours', now() + interval '4 hours',
    20, true
  );

insert into public.customer_orders (
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
)
values
  (
    '99000000-0000-4000-8000-000000029001',
    'MC-00000000000000002901',
    '00000000-0000-4000-8000-000000029001',
    '19000000-0000-4000-8000-000000029001',
    1, 'confirmed', 1, 'pickup',
    '89000000-0000-4000-8000-000000029001', 'CLP',
    1700, 0, 1700,
    '{"mode":"pickup","pickupPoint":{"id":"private-point","name":"Retiro operación","addressLine1":"Av. Central 290","commune":"Ñuñoa","region":"Metropolitana"},"slot":{"id":"private-slot","label":"Retiro próximo","startsAt":"2026-08-03T12:00:00Z","endsAt":"2026-08-03T14:00:00Z"}}'::jsonb,
    now() - interval '1 minute', now() - interval '1 minute'
  ),
  (
    '99000000-0000-4000-8000-000000029002',
    'MC-00000000000000002902',
    '00000000-0000-4000-8000-000000029001',
    '19000000-0000-4000-8000-000000029001',
    1, 'ready', 4, 'delivery',
    '89000000-0000-4000-8000-000000029002', 'CLP',
    1700, 1500, 3200,
    '{"mode":"delivery","address":{"addressId":"private-address","recipientName":"Cliente QA","addressLine1":"Calle QA 29","commune":"Ñuñoa","region":"Metropolitana","countryCode":"CL"},"deliveryZone":{"id":"private-zone","name":"Zona operación","region":"Metropolitana"},"slot":{"id":"private-slot","label":"Entrega próxima","startsAt":"2026-08-03T12:00:00Z","endsAt":"2026-08-03T14:00:00Z"}}'::jsonb,
    now() - interval '2 minutes', now() - interval '30 seconds'
  ),
  (
    '99000000-0000-4000-8000-000000029003',
    'MC-00000000000000002903',
    '00000000-0000-4000-8000-000000029001',
    '19000000-0000-4000-8000-000000029001',
    1, 'confirmed', 1, 'pickup',
    '89000000-0000-4000-8000-000000029001', 'CLP',
    1700, 0, 1700, '{"mode":"pickup","slot":{"label":"Retiro próximo"}}',
    now() - interval '3 minutes', now() - interval '3 minutes'
  ),
  (
    '99000000-0000-4000-8000-000000029004',
    'MC-00000000000000002904',
    '00000000-0000-4000-8000-000000029001',
    '19000000-0000-4000-8000-000000029001',
    1, 'confirmed', 1, 'pickup',
    '89000000-0000-4000-8000-000000029001', 'CLP',
    1700, 0, 1700, '{"mode":"pickup","slot":{"label":"Retiro próximo"}}',
    now() - interval '4 minutes', now() - interval '4 minutes'
  ),
  (
    '99000000-0000-4000-8000-000000029005',
    'MC-00000000000000002905',
    '00000000-0000-4000-8000-000000029001',
    '19000000-0000-4000-8000-000000029001',
    1, 'confirmed', 1, 'pickup',
    '89000000-0000-4000-8000-000000029001', 'CLP',
    1700, 0, 1700, '{"mode":"pickup","slot":{"label":"Retiro próximo"}}',
    now() - interval '5 minutes', now() - interval '5 minutes'
  );

insert into public.customer_order_items (
  order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, compare_at_price_clp,
  line_total_clp, created_at
)
select
  customer_order.id, customer_order.shop_id, 1,
  '59000000-0000-4000-8000-000000029001',
  '29000000-0000-4000-8000-000000029001',
  'Café de operación', 1, 1700, 2000, 1700,
  customer_order.placed_at
from public.customer_orders customer_order
where customer_order.shop_id = '19000000-0000-4000-8000-000000029001';

insert into public.customer_order_status_events (
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
select
  customer_order.id, customer_order.shop_id, 1, 'confirmed', 'system',
  '{"source":"customer_checkout_quote"}', customer_order.placed_at
from public.customer_orders customer_order
where customer_order.shop_id = '19000000-0000-4000-8000-000000029001';

insert into public.customer_order_status_events (
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values
  (
    '99000000-0000-4000-8000-000000029002',
    '19000000-0000-4000-8000-000000029001',
    2, 'accepted', 'admin', '{}', now() - interval '90 seconds'
  ),
  (
    '99000000-0000-4000-8000-000000029002',
    '19000000-0000-4000-8000-000000029001',
    3, 'preparing', 'admin', '{}', now() - interval '60 seconds'
  ),
  (
    '99000000-0000-4000-8000-000000029002',
    '19000000-0000-4000-8000-000000029001',
    4, 'ready', 'admin', '{}', now() - interval '30 seconds'
  );

insert into public.customer_order_outbox (
  order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
)
select
  customer_order.id, customer_order.shop_id,
  'customer_order.confirmed.v1', gen_random_uuid(),
  jsonb_build_object(
    'documentKind', 'customer_order', 'fiscalStatus', 'not_created',
    'orderId', customer_order.id
  ),
  'pending', now(), now(), now()
from public.customer_orders customer_order
where customer_order.shop_id = '19000000-0000-4000-8000-000000029001';

create temp table task029_fiscal_baseline as
select count(*)::bigint as sale_count from public.pos_sales;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000029002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000029002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.admin_customer_orders_read_v1(
    '19000000-0000-4000-8000-000000029001', 'queue', '{}'
  ) ->> 'code',
  'permission_denied',
  'an authenticated account without shop membership cannot read the queue'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'accept', 1,
    'a9000000-0000-4000-8000-000000029001',
    'b9000000-0000-4000-8000-000000029001'
  ) ->> 'code',
  'permission_denied',
  'an authenticated account without shop membership cannot mutate an order'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000029000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000029000',
  true
);

create temp table task029_queue_page1 as
select public.admin_customer_orders_read_v1(
  '19000000-0000-4000-8000-000000029001',
  'queue',
  '{"limit":2}'::jsonb
) as payload;

select ok(
  (select (payload ->> 'ok')::boolean from task029_queue_page1)
  and (select payload #>> '{pagination,totalMatching}' from task029_queue_page1) = '5'
  and (select (payload #>> '{pagination,hasMore}')::boolean from task029_queue_page1)
  and jsonb_array_length((select payload -> 'rows' from task029_queue_page1)) = 2
  and (select payload #>> '{rows,0,orderId}' from task029_queue_page1)
    = '99000000-0000-4000-8000-000000029001',
  'queue is newest-first, bounded and reports a deterministic continuation'
);

select ok(
  (select payload::text from task029_queue_page1)
    !~* '(user_id|userId|source_product|publication_id|address|email|token|purchase_price|stock_quantity|owner_user)',
  'queue payload omits customer identity, address and operational inventory fields'
);

create temp table task029_queue_page2 as
select public.admin_customer_orders_read_v1(
  '19000000-0000-4000-8000-000000029001',
  'queue',
  jsonb_build_object(
    'limit', 2,
    'afterPlacedAt', (
      select payload #>> '{pagination,nextPlacedAt}' from task029_queue_page1
    ),
    'afterId', (
      select payload #>> '{pagination,nextId}' from task029_queue_page1
    )
  )
) as payload;

select ok(
  jsonb_array_length((select payload -> 'rows' from task029_queue_page2)) = 2
  and not exists (
    select 1
    from jsonb_array_elements(
      (select payload -> 'rows' from task029_queue_page1)
    ) first_page(row_data)
    join jsonb_array_elements(
      (select payload -> 'rows' from task029_queue_page2)
    ) second_page(row_data)
      on first_page.row_data ->> 'orderId'
       = second_page.row_data ->> 'orderId'
  ),
  'keyset pagination returns no duplicate orders'
);

select ok(
  jsonb_array_length(
    public.admin_customer_orders_read_v1(
      '19000000-0000-4000-8000-000000029001',
      'queue',
      '{"query":"02903","status":"confirmed","fulfillmentMode":"pickup","limit":25}'
    ) -> 'rows'
  ) = 1,
  'combined search, status and fulfillment filters are server-authoritative'
);

create temp table task029_detail as
select public.admin_customer_orders_read_v1(
  '19000000-0000-4000-8000-000000029001',
  'detail',
  '{"orderId":"99000000-0000-4000-8000-000000029002"}'
) as payload;

select ok(
  (select payload #>> '{order,orderStatus}' from task029_detail) = 'ready'
  and (select payload #>> '{order,orderVersion}' from task029_detail) = '4'
  and jsonb_array_length((select payload -> 'items' from task029_detail)) = 1
  and jsonb_array_length((select payload -> 'timeline' from task029_detail)) = 4
  and (select payload #>> '{delivery,pos,status}' from task029_detail) = 'pending'
  and (select payload #>> '{delivery,push,status}' from task029_detail)
    = 'not_configured',
  'detail exposes immutable snapshots, ordered timeline and only real delivery state'
);

select ok(
  (select payload::text from task029_detail)
    !~* '(user_id|userId|source_product|publication_id|addressId|private-address|private-slot|private-zone|token|email|purchase_price|stock_quantity|metadata_redacted)',
  'detail allow-list strips internal identifiers, tokens and raw metadata'
);

select is(
  public.admin_customer_orders_read_v1(
    '19000000-0000-4000-8000-000000029002',
    'detail',
    '{"orderId":"99000000-0000-4000-8000-000000029001"}'
  ) ->> 'code',
  'not_found',
  'cross-shop detail fails closed without order disclosure'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029002',
    '99000000-0000-4000-8000-000000029001',
    'accept', 1,
    'a9000000-0000-4000-8000-000000029002',
    'b9000000-0000-4000-8000-000000029002'
  ) ->> 'code',
  'not_found',
  'cross-shop mutation fails closed without order disclosure'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'ready', 1,
    'a9000000-0000-4000-8000-000000029003',
    'b9000000-0000-4000-8000-000000029003'
  ) ->> 'code',
  'invalid_state',
  'state machine rejects forward skips'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'cancel', 1,
    'a9000000-0000-4000-8000-000000029004',
    'b9000000-0000-4000-8000-000000029004'
  ) ->> 'code',
  'validation_failed',
  'reject and cancel require a bounded reason code'
);

create temp table task029_accept as
select public.admin_customer_order_transition_v1(
  '19000000-0000-4000-8000-000000029001',
  '99000000-0000-4000-8000-000000029001',
  'accept', 1,
  'a9000000-0000-4000-8000-000000029005',
  'b9000000-0000-4000-8000-000000029005'
) as payload;

select ok(
  (select (payload ->> 'ok')::boolean from task029_accept)
  and not (select (payload ->> 'idempotent')::boolean from task029_accept)
  and (select payload ->> 'order_status' from task029_accept) = 'accepted'
  and (select payload ->> 'order_status_version' from task029_accept) = '2',
  'valid accept commits exactly the requested next state'
);

select ok(
  (
    public.admin_customer_order_transition_v1(
      '19000000-0000-4000-8000-000000029001',
      '99000000-0000-4000-8000-000000029001',
      'accept', 1,
      'a9000000-0000-4000-8000-000000029005',
      'b9000000-0000-4000-8000-000000029005'
    ) ->> 'idempotent'
  )::boolean,
  'identical retry replays the committed transition'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'accept', 2,
    'a9000000-0000-4000-8000-000000029005',
    'b9000000-0000-4000-8000-000000029005'
  ) ->> 'code',
  'idempotency_conflict',
  'changed request cannot reuse an idempotency key'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'preparing', 1,
    'a9000000-0000-4000-8000-000000029006',
    'b9000000-0000-4000-8000-000000029006'
  ) ->> 'code',
  'version_conflict',
  'stale status version is rejected without a lost update'
);

select ok(
  (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'preparing', 2,
    'a9000000-0000-4000-8000-000000029007',
    'b9000000-0000-4000-8000-000000029007'
  ) ->> 'ok')::boolean
  and (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'ready', 3,
    'a9000000-0000-4000-8000-000000029008',
    'b9000000-0000-4000-8000-000000029008'
  ) ->> 'ok')::boolean
  and (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029001',
    'complete', 4,
    'a9000000-0000-4000-8000-000000029009',
    'b9000000-0000-4000-8000-000000029009'
  ) ->> 'ok')::boolean,
  'pickup order follows accepted, preparing, ready and completed arcs'
);

select ok(
  (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029002',
    'out_for_delivery', 4,
    'a9000000-0000-4000-8000-000000029010',
    'b9000000-0000-4000-8000-000000029010'
  ) ->> 'ok')::boolean
  and (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029002',
    'complete', 5,
    'a9000000-0000-4000-8000-000000029011',
    'b9000000-0000-4000-8000-000000029011'
  ) ->> 'ok')::boolean,
  'delivery order requires out-for-delivery before completion'
);

set local role postgres;
select throws_ok(
  $$
    update public.customer_order_admin_mutations
    set response_payload = response_payload || '{"tampered":true}'::jsonb
    where id = (
      select id from public.customer_order_admin_mutations order by created_at limit 1
    )
  $$,
  '23514',
  'customer_order_admin_mutation_immutable',
  'Admin mutation receipts reject post-commit tampering'
);

insert into public.customer_order_outbox (
  order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
)
values (
  '99000000-0000-4000-8000-000000029003',
  '19000000-0000-4000-8000-000000029001',
  'customer_order.rejected.v1',
  'a9000000-0000-4000-8000-000000029012',
  '{"documentKind":"customer_order","fiscalStatus":"not_created"}',
  'pending', now(), now(), now()
);

set local role authenticated;
select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029003',
    'reject', 1,
    'a9000000-0000-4000-8000-000000029013',
    'b9000000-0000-4000-8000-000000029013',
    'item_unavailable'
  ) ->> 'code',
  'conflict',
  'outbox conflict fails the transition instead of committing a partial aggregate'
);

set local role postgres;
select ok(
  (
    select status = 'confirmed' and status_version = 1
    from public.customer_orders
    where id = '99000000-0000-4000-8000-000000029003'
  )
  and not exists (
    select 1 from public.customer_order_status_events
    where order_id = '99000000-0000-4000-8000-000000029003'
      and event_version = 2
  )
  and not exists (
    select 1 from public.customer_order_admin_mutations
    where order_id = '99000000-0000-4000-8000-000000029003'
  )
  and not exists (
    select 1 from public.audit_logs
    where target_id = '99000000-0000-4000-8000-000000029003'
      and event_key like 'shop.storefront.order.transition.%'
  ),
  'failed transition rolls order, event, audit and idempotency receipt back atomically'
);

delete from public.customer_order_outbox
where order_id = '99000000-0000-4000-8000-000000029003'
  and event_type = 'customer_order.rejected.v1';

set local role authenticated;
select ok(
  (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029003',
    'reject', 1,
    'a9000000-0000-4000-8000-000000029014',
    'b9000000-0000-4000-8000-000000029014',
    'item_unavailable'
  ) ->> 'ok')::boolean,
  'rejection succeeds after the atomic conflict is removed'
);

select ok(
  (public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029004',
    'cancel', 1,
    'a9000000-0000-4000-8000-000000029015',
    'b9000000-0000-4000-8000-000000029015',
    'customer_request'
  ) ->> 'ok')::boolean,
  'authorized Admin cancellation uses a sanitized reason code'
);

select is(
  public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029001',
    '99000000-0000-4000-8000-000000029004',
    'accept', 2,
    'a9000000-0000-4000-8000-000000029016',
    'b9000000-0000-4000-8000-000000029016'
  ) ->> 'code',
  'invalid_state',
  'terminal states reject every later transition'
);

set local role postgres;
select ok(
  exists (
    select 1
    from public.customer_order_status_events event
    join public.audit_logs audit
      on audit.shop_id = event.shop_id
      and audit.target_id = event.order_id::text
      and audit.metadata_redacted->>'committedStatusVersion'
        = event.event_version::text
    join public.customer_order_outbox outbox
      on outbox.shop_id = event.shop_id
      and outbox.order_id = event.order_id
      and outbox.payload->>'statusVersion' = event.event_version::text
    join public.customer_order_admin_mutations mutation
      on mutation.shop_id = event.shop_id
      and mutation.order_id = event.order_id
      and mutation.response_payload->>'order_status_version'
        = event.event_version::text
    where event.order_id = '99000000-0000-4000-8000-000000029004'
      and event.status = 'cancelled'
  ),
  'order, event, audit, outbox and mutation receipt share one committed version'
);

select ok(
  not exists (
    select 1
    from public.audit_logs audit
    where audit.event_key like 'shop.storefront.order.transition.%'
      and audit.metadata_redacted::text
        ~* '(token|email|address|recipient|customer_request_text|oauth|refresh)'
  )
  and exists (
    select 1
    from public.audit_logs audit
    where audit.target_id = '99000000-0000-4000-8000-000000029004'
      and audit.metadata_redacted->>'reasonCode' = 'customer_request'
      and audit.metadata_redacted ? 'requestId'
      and audit.metadata_redacted ? 'correlationId'
  ),
  'audit keeps actor/request/correlation metadata sanitized and PII-free'
);

select ok(
  not exists (
    select 1
    from public.customer_order_outbox outbox
    where outbox.shop_id = '19000000-0000-4000-8000-000000029001'
      and (
        outbox.payload->>'documentKind' <> 'customer_order'
        or outbox.payload->>'fiscalStatus' <> 'not_created'
      )
  )
  and (select count(*) from public.pos_sales)
    = (select sale_count from task029_fiscal_baseline),
  'all transition outbox envelopes remain POS-neutral and create no fiscal sale'
);

select ok(
  (
    select count(*) = 8
    from public.customer_order_admin_mutations
    where shop_id = '19000000-0000-4000-8000-000000029001'
  )
  and (
    select count(*) = 8
    from public.audit_logs
    where shop_id = '19000000-0000-4000-8000-000000029001'
      and event_key like 'shop.storefront.order.transition.%'
  ),
  'replays, stale requests and invalid transitions create no duplicate receipts or audit rows'
);

select * from finish();
rollback;
