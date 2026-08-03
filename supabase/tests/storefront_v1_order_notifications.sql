begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regclass('public.customer_notification_events') is not null
  and to_regclass('public.customer_notification_deliveries') is not null
  and to_regclass('public.customer_notification_receipts') is not null,
  'TASK-031 installs event, per-generation delivery and ack receipt ledgers'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.customer_notification_events'::regclass,
      'public.customer_notification_deliveries'::regclass,
      'public.customer_notification_receipts'::regclass
    )
  ),
  'all notification ledgers enable and force RLS'
);

select ok(
  not has_table_privilege(
    'anon', 'public.customer_notification_events',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.customer_notification_deliveries',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.customer_notification_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles cannot read notification routing or delivery ledgers'
);

select ok(
  has_table_privilege(
    'service_role', 'public.customer_notification_events',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role', 'public.customer_notification_deliveries',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role', 'public.customer_notification_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service-side dispatcher receives explicit ledger privileges'
);

select ok(
  to_regprocedure(
    'public.customer_notification_claim_v1(integer,integer,uuid)'
  ) is not null
  and to_regprocedure(
    'public.customer_notification_ack_v1(uuid,uuid,bigint,text,uuid,text,text)'
  ) is not null
  and to_regprocedure(
    'public.customer_notification_route_v1(text,uuid)'
  ) is not null,
  'claim, ack and owner route RPC signatures are installed'
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
        'customer_notification_claim_v1',
        'customer_notification_ack_v1',
        'customer_notification_route_v1'
      )
  ),
  'public notification RPCs are hardened definers with empty search_path'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.customer_notification_claim_v1(integer,integer,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.customer_notification_ack_v1(uuid,uuid,bigint,text,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.customer_notification_claim_v1(integer,integer,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.customer_notification_route_v1(text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_notification_route_v1(text,uuid)',
    'EXECUTE'
  ),
  'dispatcher RPCs are service-only and the opaque resolver is authenticated-only'
);

select ok(
  exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'storefront_settings'
      and column_row.column_name = 'customer_order_push_enabled'
      and column_row.is_nullable = 'NO'
      and column_row.column_default = 'false'
  ),
  'per-shop order push feature flag is fail-closed by default'
);

select ok(
  not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name in (
        'customer_notification_events',
        'customer_notification_deliveries',
        'customer_notification_receipts'
      )
      and column_row.column_name ~* '(push_token|email|address|note|total|item)'
  ),
  'persistent notification ledgers contain no raw token or customer-detail columns'
);

select ok(
  exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'customer_notification_deliveries'
      and column_row.column_name = 'provider_message_id_hash'
      and column_row.data_type = 'bytea'
  )
  and not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'customer_notification_deliveries'
      and column_row.column_name = 'provider_message_id'
  ),
  'provider receipt identifiers are persisted only as hashes'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.customer_order_status_events'::regclass
      and trigger_row.tgname = 'customer_order_status_events_notify'
      and not trigger_row.tgisinternal
  ),
  'order status append commits a derived notification event in the same transaction'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.customer_notification_events'::regclass,
      'public.customer_notification_deliveries'::regclass,
      'public.customer_notification_receipts'::regclass
    )
  ),
  'notification ledgers expose no row policy to client roles'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000031001',
    'authenticated', 'authenticated', 'task031-owner@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000031002',
    'authenticated', 'authenticated', 'task031-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000031003',
    'authenticated', 'authenticated', 'task031-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000031004',
    'authenticated', 'authenticated', 'task031-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '17000000-0000-4000-8000-000000031001',
  'SF31A',
  'Notification fixture',
  'active'
);

insert into public.storefront_settings (
  shop_id,
  public_slug,
  storefront_enabled,
  pickup_enabled,
  delivery_enabled,
  reservation_enabled,
  require_product_image
)
values (
  '17000000-0000-4000-8000-000000031001',
  'notification-fixture',
  true,
  true,
  false,
  true,
  false
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '37000000-0000-4000-8000-000000031001',
  '00000000-0000-4000-8000-000000031004',
  '17000000-0000-4000-8000-000000031001',
  'Notification fixture',
  now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values (
  '27000000-0000-4000-8000-000000031001',
  '00000000-0000-4000-8000-000000031004',
  '17000000-0000-4000-8000-000000031001',
  'SF31-0001',
  'Internal notification product',
  '37000000-0000-4000-8000-000000031001',
  500,
  1200,
  10,
  now()
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values (
  '47000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  '37000000-0000-4000-8000-000000031001',
  'notification-fixture',
  'Notification fixture',
  'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values (
  '57000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  '27000000-0000-4000-8000-000000031001',
  'published',
  'Café de notificación',
  '47000000-0000-4000-8000-000000031001',
  1200,
  1500,
  true,
  false,
  true,
  'available',
  now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region,
  public_instructions, enabled
)
values (
  '67000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  'Retiro central',
  'Av. Prueba 31',
  'Ñuñoa',
  'Metropolitana',
  'Presenta tu código.',
  true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
)
values (
  '77000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  'pickup',
  '67000000-0000-4000-8000-000000031001',
  'Retiro hoy',
  now() + interval '1 hour',
  now() + interval '3 hours',
  20,
  true
);

insert into public.customer_orders (
  id,
  public_order_code,
  user_id,
  shop_id,
  quote_version,
  status,
  status_version,
  fulfillment_mode,
  slot_id,
  currency_code,
  subtotal_clp,
  delivery_fee_clp,
  total_clp,
  fulfillment_snapshot,
  placed_at,
  updated_at
)
values (
  '88000000-0000-4000-8000-000000031001',
  'MC-ABCDEF0123456789ABCD',
  '00000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  1,
  'confirmed',
  1,
  'pickup',
  '77000000-0000-4000-8000-000000031001',
  'CLP',
  1200,
  0,
  1200,
  '{"mode":"pickup","publicLabel":"Retiro hoy"}'::jsonb,
  now(),
  now()
);

insert into public.customer_devices (
  id, user_id, installation_id, platform, locale,
  consent_status, permission_status, push_token, push_token_hash,
  consented_at, revoked_at, token_updated_at, last_seen_at, expires_at,
  registration_version, last_operation, last_idempotency_key,
  last_request_hash
)
values
  (
    '81000000-0000-4000-8000-000000031101',
    '00000000-0000-4000-8000-000000031001',
    '91000000-0000-4000-8000-000000031101',
    'android', 'es-CL', 'granted', 'authorized',
    'task031-token-owner-es-000000000001',
    extensions.digest('task031-token-owner-es-000000000001', 'sha256'),
    now(), null, now(), now(), now() + interval '30 days',
    1, 'register', 'a1000000-0000-4000-8000-000000031101',
    extensions.digest('task031-request-es', 'sha256')
  ),
  (
    '81000000-0000-4000-8000-000000031102',
    '00000000-0000-4000-8000-000000031001',
    '91000000-0000-4000-8000-000000031102',
    'ios', 'it', 'granted', 'provisional',
    'task031-token-owner-it-000000000002',
    extensions.digest('task031-token-owner-it-000000000002', 'sha256'),
    now(), null, now(), now(), now() + interval '30 days',
    1, 'register', 'a1000000-0000-4000-8000-000000031102',
    extensions.digest('task031-request-it', 'sha256')
  ),
  (
    '81000000-0000-4000-8000-000000031103',
    '00000000-0000-4000-8000-000000031001',
    '91000000-0000-4000-8000-000000031103',
    'android', 'en', 'revoked', 'denied',
    null, null, null, now(), null, now(), null,
    2, 'revoke', 'a1000000-0000-4000-8000-000000031103',
    extensions.digest('task031-request-revoked', 'sha256')
  ),
  (
    '81000000-0000-4000-8000-000000031104',
    '00000000-0000-4000-8000-000000031002',
    '91000000-0000-4000-8000-000000031104',
    'ios', 'zh-Hans', 'granted', 'authorized',
    'task031-token-outsider-000000000004',
    extensions.digest('task031-token-outsider-000000000004', 'sha256'),
    now(), null, now(), now(), now() + interval '30 days',
    1, 'register', 'a1000000-0000-4000-8000-000000031104',
    extensions.digest('task031-request-outsider', 'sha256')
  ),
  (
    '81000000-0000-4000-8000-000000031105',
    '00000000-0000-4000-8000-000000031001',
    '91000000-0000-4000-8000-000000031105',
    'android', 'en', 'granted', 'authorized',
    'task031-token-expired-000000000000005',
    extensions.digest('task031-token-expired-000000000000005', 'sha256'),
    now() - interval '90 days', null, now() - interval '90 days',
    now() - interval '2 days', now() - interval '1 day',
    1, 'register', 'a1000000-0000-4000-8000-000000031105',
    extensions.digest('task031-request-expired', 'sha256')
  );

insert into public.customer_order_status_events (
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values (
  '89000000-0000-4000-8000-000000031001',
  '88000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  1,
  'confirmed',
  'system',
  '{"source":"task031_fixture"}'::jsonb,
  clock_timestamp()
);

select is(
  (
    select count(*)::integer
    from public.customer_notification_events notification_event
    where notification_event.source_event_id =
      '89000000-0000-4000-8000-000000031001'
  ),
  1,
  'one logical confirmed notification is derived from one status event'
);

select is(
  (
    select count(*)::integer
    from public.customer_notification_deliveries delivery
    join public.customer_notification_events notification_event
      on notification_event.id = delivery.event_id
    where notification_event.source_event_id =
      '89000000-0000-4000-8000-000000031001'
  ),
  2,
  'only the two eligible owner devices receive per-generation deliveries'
);

select ok(
  not exists (
    select 1
    from public.customer_notification_deliveries delivery
    where delivery.device_id in (
      '81000000-0000-4000-8000-000000031103',
      '81000000-0000-4000-8000-000000031104',
      '81000000-0000-4000-8000-000000031105'
    )
  ),
  'revoked, cross-owner and expired destinations are excluded at materialization'
);

insert into public.customer_order_status_events (
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values (
  '89000000-0000-4000-8000-000000031002',
  '88000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  2,
  'accepted',
  'admin',
  '{}',
  now()
);

select is(
  (
    select count(*)::integer
    from public.customer_notification_events
  ),
  1,
  'accepted is intentionally not a customer-notifiable event'
);

update public.storefront_settings
set customer_order_push_enabled = true
where shop_id = '17000000-0000-4000-8000-000000031001';

create temporary table task031_results (
  label text primary key,
  payload jsonb not null
);
grant select, insert on table pg_temp.task031_results
  to service_role, authenticated;
create temporary table task031_routes (
  label text primary key,
  route_token uuid not null
);
grant select on table pg_temp.task031_routes to authenticated;

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'claim-1', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031001'
);
insert into pg_temp.task031_results(label, payload)
select 'claim-busy', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031002'
);
reset role;

select is(
  (
    select jsonb_array_length(payload->'deliveries')
    from pg_temp.task031_results where label = 'claim-1'
  ),
  2,
  'bounded claim leases both eligible deliveries'
);

select is(
  (
    select jsonb_array_length(payload->'deliveries')
    from pg_temp.task031_results where label = 'claim-busy'
  ),
  0,
  'a second dispatcher cannot claim an active lease'
);

select ok(
  (
    select bool_and(
      delivery ? 'pushToken'
      and length(delivery->>'pushToken') >= 16
      and delivery->'payload' ?& array[
        'apiVersion', 'event', 'title', 'body', 'orderCode', 'deepLink'
      ]
      and not delivery->'payload' ?| array[
        'pushToken', 'deviceId', 'userId', 'shopId', 'orderId',
        'reservationHoldId', 'email', 'address', 'items', 'total', 'notes'
      ]
    )
    from jsonb_array_elements((
      select payload->'deliveries'
      from pg_temp.task031_results where label = 'claim-1'
    )) delivery
  ),
  'raw token is ephemeral in the server claim while lock-screen payload is allow-listed'
);

select ok(
  (
    select bool_and(
      delivery->'payload'->>'deepLink' ~
        '^com[.]xniw[.]clientmerchandisecontrol://storefront/notification-fixture/notification/[0-9a-f-]{36}$'
      and delivery->'payload'->>'deepLink' not like
        '%88000000-0000-4000-8000-000000031001%'
      and delivery->'payload'->>'deepLink' not like
        '%00000000-0000-4000-8000-000000031001%'
    )
    from jsonb_array_elements((
      select payload->'deliveries'
      from pg_temp.task031_results where label = 'claim-1'
    )) delivery
  ),
  'deep links contain only a shop slug and opaque route token, never owner/order IDs'
);

select ok(
  exists (
    select 1
    from jsonb_array_elements((
      select payload->'deliveries'
      from pg_temp.task031_results where label = 'claim-1'
    )) delivery
    where delivery->>'platform' = 'android'
      and delivery->'payload'->>'body' = 'Tu pedido fue confirmado.'
  )
  and exists (
    select 1
    from jsonb_array_elements((
      select payload->'deliveries'
      from pg_temp.task031_results where label = 'claim-1'
    )) delivery
    where delivery->>'platform' = 'ios'
      and delivery->'payload'->>'body' = 'Il tuo ordine è stato confermato.'
  ),
  'claim localizes es-CL and Italian payloads from each destination locale'
);

select ok(
  (
    select bool_and(
      delivery->'payload'->>'orderCode' = '…89ABCD'
      and pg_column_size(delivery->'payload') < 2048
      and (delivery->'payload')::text !~* '(source_product|owner_user|supplier|cost|token|storage|secret|sync_metadata)'
    )
    from jsonb_array_elements((
      select payload->'deliveries'
      from pg_temp.task031_results where label = 'claim-1'
    )) delivery
  ),
  'payload is bounded, uses a shortened public code and excludes internal metadata'
);

select is(
  (
    select app_private.customer_notification_payload_v1(
      notification_event,
      'en'
    )->>'body'
    from public.customer_notification_events notification_event
    where notification_event.source_event_id =
      '89000000-0000-4000-8000-000000031001'
  ),
  'Your order has been confirmed.',
  'English notification text is explicit'
);

select is(
  (
    select app_private.customer_notification_payload_v1(
      notification_event,
      'zh-Hans'
    )->>'body'
    from public.customer_notification_events notification_event
    where notification_event.source_event_id =
      '89000000-0000-4000-8000-000000031001'
  ),
  '您的订单已确认。',
  'Simplified Chinese notification text is explicit'
);

select is(
  (
    select app_private.customer_notification_payload_v1(
      notification_event,
      'unknown'
    )->>'body'
    from public.customer_notification_events notification_event
    where notification_event.source_event_id =
      '89000000-0000-4000-8000-000000031001'
  ),
  'Tu pedido fue confirmado.',
  'unknown locale fails safely to primary es-CL copy'
);

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'ack-delivered', public.customer_notification_ack_v1(
  (delivery->>'deliveryId')::uuid,
  (delivery->>'leaseToken')::uuid,
  (delivery->>'destinationGeneration')::bigint,
  'delivered',
  'a2000000-0000-4000-8000-000000031101',
  'provider-message-task031-es',
  null
)
from jsonb_array_elements((
  select payload->'deliveries'
  from pg_temp.task031_results where label = 'claim-1'
)) delivery
where delivery->>'platform' = 'android';

insert into pg_temp.task031_results(label, payload)
select 'ack-retry', public.customer_notification_ack_v1(
  (delivery->>'deliveryId')::uuid,
  (delivery->>'leaseToken')::uuid,
  (delivery->>'destinationGeneration')::bigint,
  'retryable',
  'a2000000-0000-4000-8000-000000031102',
  null,
  'provider_timeout'
)
from jsonb_array_elements((
  select payload->'deliveries'
  from pg_temp.task031_results where label = 'claim-1'
)) delivery
where delivery->>'platform' = 'ios';

insert into pg_temp.task031_results(label, payload)
select 'ack-replay', public.customer_notification_ack_v1(
  (delivery->>'deliveryId')::uuid,
  (delivery->>'leaseToken')::uuid,
  (delivery->>'destinationGeneration')::bigint,
  'delivered',
  'a2000000-0000-4000-8000-000000031101',
  'provider-message-task031-es',
  null
)
from jsonb_array_elements((
  select payload->'deliveries'
  from pg_temp.task031_results where label = 'claim-1'
)) delivery
where delivery->>'platform' = 'android';

insert into pg_temp.task031_results(label, payload)
select 'ack-conflict', public.customer_notification_ack_v1(
  (delivery->>'deliveryId')::uuid,
  (delivery->>'leaseToken')::uuid,
  (delivery->>'destinationGeneration')::bigint,
  'retryable',
  'a2000000-0000-4000-8000-000000031101',
  null,
  'provider_timeout'
)
from jsonb_array_elements((
  select payload->'deliveries'
  from pg_temp.task031_results where label = 'claim-1'
)) delivery
where delivery->>'platform' = 'android';
reset role;

select ok(
  (
    select payload->>'status' = 'success'
      and payload->>'deliveryStatus' = 'delivered'
    from pg_temp.task031_results where label = 'ack-delivered'
  ),
  'successful provider ack marks delivery terminally delivered'
);

select ok(
  exists (
    select 1
    from public.customer_notification_deliveries delivery
    where delivery.status = 'delivered'
      and pg_catalog.octet_length(delivery.provider_message_id_hash) = 32
  )
  and not exists (
    select 1
    from public.customer_notification_receipts receipt
    where receipt.response_payload::text like '%provider-message-task031-es%'
  ),
  'provider receipt is hashed and raw provider ID is absent from durable rows'
);

select ok(
  (
    select (payload->>'idempotent')::boolean
    from pg_temp.task031_results where label = 'ack-replay'
  )
  and (
    select payload->>'status' = 'idempotency_conflict'
    from pg_temp.task031_results where label = 'ack-conflict'
  ),
  'identical ack replay succeeds while key reuse with another request fails closed'
);

select ok(
  (
    select payload->>'status' = 'retry_scheduled'
      and payload->>'deliveryStatus' = 'pending'
    from pg_temp.task031_results where label = 'ack-retry'
  )
  and exists (
    select 1
    from public.customer_notification_deliveries delivery
    where delivery.device_id = '81000000-0000-4000-8000-000000031102'
      and delivery.status = 'pending'
      and delivery.last_error_code = 'provider_timeout'
      and delivery.available_at > delivery.updated_at
  ),
  'retryable failure returns to pending with bounded backoff and sanitized code'
);

update public.customer_notification_deliveries delivery
set available_at = statement_timestamp() - interval '1 second'
where delivery.device_id = '81000000-0000-4000-8000-000000031102'
  and delivery.status = 'pending';

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'claim-retry', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031003'
);
insert into pg_temp.task031_results(label, payload)
select 'ack-invalid-token', public.customer_notification_ack_v1(
  (delivery->>'deliveryId')::uuid,
  (delivery->>'leaseToken')::uuid,
  (delivery->>'destinationGeneration')::bigint,
  'invalid_token',
  'a2000000-0000-4000-8000-000000031103',
  null,
  'provider_invalid_token'
)
from jsonb_array_elements((
  select payload->'deliveries'
  from pg_temp.task031_results where label = 'claim-retry'
)) delivery;
reset role;

select ok(
  (
    select (payload->'deliveries'->0->>'attempt')::integer = 2
    from pg_temp.task031_results where label = 'claim-retry'
  )
  and (
    select payload->>'status' = 'destination_revoked'
      and payload->>'deliveryStatus' = 'suppressed'
    from pg_temp.task031_results where label = 'ack-invalid-token'
  ),
  'retry claim increments attempt and invalid token suppresses the destination'
);

select ok(
  exists (
    select 1
    from public.customer_devices device
    where device.id = '81000000-0000-4000-8000-000000031102'
      and device.consent_status = 'revoked'
      and device.push_token is null
      and device.push_token_hash is null
      and device.expires_at is null
      and device.registration_version = 2
  ),
  'invalid provider token monotonically revokes only the matching generation'
);

insert into public.customer_devices (
  id, user_id, installation_id, platform, locale,
  consent_status, permission_status, push_token, push_token_hash,
  consented_at, token_updated_at, last_seen_at, expires_at,
  registration_version, last_operation, last_idempotency_key,
  last_request_hash
)
values (
  '81000000-0000-4000-8000-000000031106',
  '00000000-0000-4000-8000-000000031001',
  '91000000-0000-4000-8000-000000031106',
  'ios', 'zh-Hans', 'granted', 'authorized',
  'task031-token-owner-zh-000000000006',
  extensions.digest('task031-token-owner-zh-000000000006', 'sha256'),
  now(), now(), now(), now() + interval '30 days',
  1, 'register', 'a1000000-0000-4000-8000-000000031106',
  extensions.digest('task031-request-zh', 'sha256')
);

update public.customer_orders
set status = 'preparing', status_version = 3, updated_at = now()
where id = '88000000-0000-4000-8000-000000031001';
insert into public.customer_order_status_events (
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values (
  '89000000-0000-4000-8000-000000031003',
  '88000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  3,
  'preparing',
  'admin',
  '{}',
  now()
);

update public.customer_devices device
set push_token = 'task031-token-owner-zh-rotated-000006',
    push_token_hash = extensions.digest(
      'task031-token-owner-zh-rotated-000006',
      'sha256'
    ),
    token_updated_at = now(),
    registration_version = 2
where device.id = '81000000-0000-4000-8000-000000031106';

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'claim-generation-fence', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031004'
);
reset role;

select ok(
  (
    select jsonb_array_length(payload->'deliveries') = 1
      and payload->'deliveries'->0->>'platform' = 'android'
    from pg_temp.task031_results where label = 'claim-generation-fence'
  )
  and exists (
    select 1
    from public.customer_notification_deliveries delivery
    where delivery.device_id = '81000000-0000-4000-8000-000000031106'
      and delivery.destination_generation = 1
      and delivery.status = 'suppressed'
      and delivery.last_error_code = 'destination_ineligible'
  ),
  'token rotation fences the stale generation before provider dispatch'
);

update public.storefront_settings
set customer_order_push_enabled = false
where shop_id = '17000000-0000-4000-8000-000000031001';
update public.customer_orders
set status = 'ready', status_version = 4, updated_at = now()
where id = '88000000-0000-4000-8000-000000031001';
insert into public.customer_order_status_events (
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values (
  '89000000-0000-4000-8000-000000031004',
  '88000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  4,
  'ready',
  'admin',
  '{}',
  now()
);

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'claim-flag-off', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031005'
);
reset role;

select ok(
  (
    select jsonb_array_length(payload->'deliveries') = 0
    from pg_temp.task031_results where label = 'claim-flag-off'
  )
  and exists (
    select 1
    from public.customer_notification_deliveries delivery
    join public.customer_notification_events notification_event
      on notification_event.id = delivery.event_id
    where notification_event.source_event_id =
      '89000000-0000-4000-8000-000000031004'
      and delivery.status = 'pending'
  ),
  'flag OFF prevents dispatch without destroying pending evidence'
);

update public.storefront_settings
set customer_order_push_enabled = true
where shop_id = '17000000-0000-4000-8000-000000031001';
update public.customer_orders
set status = 'completed', status_version = 6, updated_at = now()
where id = '88000000-0000-4000-8000-000000031001';
insert into public.customer_order_status_events (
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values
  (
    '89000000-0000-4000-8000-000000031006',
    '88000000-0000-4000-8000-000000031001',
    '17000000-0000-4000-8000-000000031001',
    6, 'completed', 'admin', '{}', clock_timestamp()
  ),
  (
    '89000000-0000-4000-8000-000000031005',
    '88000000-0000-4000-8000-000000031001',
    '17000000-0000-4000-8000-000000031001',
    5, 'out_for_delivery', 'admin', '{}', clock_timestamp()
  );

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'claim-out-of-order', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031008'
);
reset role;

select ok(
  (
    select jsonb_array_length(payload->'deliveries') > 0
      and (
        select bool_and(delivery->'payload'->>'event' = 'completed')
        from jsonb_array_elements(payload->'deliveries') delivery
      )
    from pg_temp.task031_results where label = 'claim-out-of-order'
  )
  and exists (
    select 1
    from public.customer_notification_deliveries delivery
    join public.customer_notification_events notification_event
      on notification_event.id = delivery.event_id
    where notification_event.order_id =
      '88000000-0000-4000-8000-000000031001'
      and notification_event.event_version in (4, 5)
      and delivery.status = 'suppressed'
      and delivery.last_error_code = 'superseded_event'
  ),
  'delayed older status hints are suppressed when a newer order version exists'
);

update public.customer_notification_deliveries delivery
set status = 'suppressed',
    lease_token = null,
    lease_expires_at = null,
    last_error_code = 'test_fixture_cleanup'
where delivery.status = 'leased';

insert into public.customer_reservation_holds (
  id, user_id, shop_id, publication_id, source_product_id, quantity,
  status, expires_at, create_idempotency_key, create_request_sha256,
  created_at, updated_at
)
values (
  '85000000-0000-4000-8000-000000031001',
  '00000000-0000-4000-8000-000000031001',
  '17000000-0000-4000-8000-000000031001',
  '57000000-0000-4000-8000-000000031001',
  '27000000-0000-4000-8000-000000031001',
  1,
  'active',
  now() + interval '10 minutes',
  'a5000000-0000-4000-8000-000000031001',
  repeat('a', 64),
  now(),
  now()
);

set local role service_role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'claim-reservation', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031006'
);
insert into pg_temp.task031_results(label, payload)
select 'claim-reservation-duplicate', public.customer_notification_claim_v1(
  10,
  60,
  'd1000000-0000-4000-8000-000000031007'
);
reset role;

select ok(
  (
    select count(*) = 1
    from public.customer_notification_events notification_event
    where notification_event.reservation_hold_id =
      '85000000-0000-4000-8000-000000031001'
      and notification_event.event_key = 'reservation_expiring'
  )
  and (
    select jsonb_array_length(payload->'deliveries') = 2
    from pg_temp.task031_results where label = 'claim-reservation'
  )
  and (
    select jsonb_array_length(payload->'deliveries') = 0
    from pg_temp.task031_results where label = 'claim-reservation-duplicate'
  ),
  'reservation expiry is enqueued once and leases each currently eligible device once'
);

select ok(
  (
    select bool_and(
      delivery->'payload'->>'event' = 'reservation_expiring'
      and not delivery->'payload' ? 'orderCode'
      and delivery->'payload'->>'deepLink' not like
        '%85000000-0000-4000-8000-000000031001%'
    )
    from jsonb_array_elements((
      select payload->'deliveries'
      from pg_temp.task031_results where label = 'claim-reservation'
    )) delivery
  ),
  'reservation lock-screen payload remains minimal and hides the hold identifier'
);

insert into pg_temp.task031_routes(label, route_token)
select 'order', notification_event.route_token
from public.customer_notification_events notification_event
where notification_event.source_event_id =
  '89000000-0000-4000-8000-000000031001';
insert into pg_temp.task031_routes(label, route_token)
select 'reservation', notification_event.route_token
from public.customer_notification_events notification_event
where notification_event.reservation_hold_id =
  '85000000-0000-4000-8000-000000031001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000031001","role":"authenticated","is_anonymous":false}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'route-order', public.customer_notification_route_v1(
  'notification-fixture',
  (
    select route_token from pg_temp.task031_routes where label = 'order'
  )
);
insert into pg_temp.task031_results(label, payload)
select 'route-reservation', public.customer_notification_route_v1(
  'notification-fixture',
  (
    select route_token from pg_temp.task031_routes where label = 'reservation'
  )
);
reset role;

select ok(
  (
    select payload->>'status' = 'ok'
      and payload->>'target' = 'order'
      and payload->>'orderId' = '88000000-0000-4000-8000-000000031001'
    from pg_temp.task031_results where label = 'route-order'
  )
  and (
    select payload->>'status' = 'ok'
      and payload->>'target' = 'cart'
      and not payload ? 'orderId'
    from pg_temp.task031_results where label = 'route-reservation'
  ),
  'owner resolver maps opaque routes to order refresh or cart without trusting push state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000031002","role":"authenticated","is_anonymous":false}',
  true
);
insert into pg_temp.task031_results(label, payload)
select 'route-outsider', public.customer_notification_route_v1(
  'notification-fixture',
  (
    select route_token from pg_temp.task031_routes where label = 'order'
  )
);
reset role;

select is(
  (
    select payload->>'status'
    from pg_temp.task031_results where label = 'route-outsider'
  ),
  'not_found',
  'cross-owner opaque route is denied without existence disclosure'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000031003","role":"authenticated","is_anonymous":true}',
  true
);
select throws_ok(
  $$select public.customer_notification_route_v1(
    'notification-fixture',
    'f1000000-0000-4000-8000-000000031001'
  )$$,
  '28000',
  'authenticated customer session required',
  'anonymous customer cannot resolve notification routes'
);
reset role;

select ok(
  not exists (
    select 1
    from public.customer_notification_events notification_event
    where notification_event::text ~* '(task031-token|example[.]invalid|Av[.] Prueba|Internal notification product)'
  )
  and not exists (
    select 1
    from public.customer_notification_receipts receipt
    where receipt::text ~* '(task031-token|provider-message|example[.]invalid)'
  ),
  'durable event and receipt rows contain no token, email, address, item or raw provider ID'
);

select * from finish();
rollback;
