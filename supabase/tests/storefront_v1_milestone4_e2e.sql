begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

-- Milestone 4 integrated transaction. All fixture data is rolled back.
insert into auth.users(
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000040001',
    'authenticated', 'authenticated', 'm4-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"source":"STOREFRONT_V1_MILESTONE4_E2E"}'::jsonb,
    statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000040002',
    'authenticated', 'authenticated', 'm4-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"source":"STOREFRONT_V1_MILESTONE4_E2E"}'::jsonb,
    statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000040003',
    'authenticated', 'authenticated', 'm4-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"source":"STOREFRONT_V1_MILESTONE4_E2E"}'::jsonb,
    statement_timestamp(), statement_timestamp()
  );

insert into public.profiles(profile_id, display_name, profile_status)
values
  ('00000000-0000-4000-8000-000000040001', 'M4 merchant', 'active'),
  ('00000000-0000-4000-8000-000000040002', 'M4 customer', 'active'),
  ('00000000-0000-4000-8000-000000040003', 'M4 outsider', 'active')
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops(
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values
  (
    '14000000-0000-4000-8000-000000040001',
    'M4E2E', 'Milestone 4 E2E', 'active',
    '00000000-0000-4000-8000-000000040001'
  ),
  (
    '14000000-0000-4000-8000-000000040002',
    'M4OTHER', 'Milestone 4 other tenant', 'active',
    '00000000-0000-4000-8000-000000040003'
  );

insert into public.shop_members(profile_id, shop_id, role_key, membership_status)
values
  (
    '00000000-0000-4000-8000-000000040001',
    '14000000-0000-4000-8000-000000040001',
    'shop_owner', 'active'
  ),
  (
    '00000000-0000-4000-8000-000000040003',
    '14000000-0000-4000-8000-000000040002',
    'shop_owner', 'active'
  );

insert into public.staff_accounts(
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status
) values (
  '84000000-0000-4000-8000-000000040001',
  '14000000-0000-4000-8000-000000040001',
  'M4POS', 'M4 POS', 'pos_admin', 'active', 'password',
  'argon2id:m4:redacted-fixture', statement_timestamp(),
  statement_timestamp() + interval '4 hours', false, 7, 'active'
);

insert into public.inventory_categories(
  id, owner_user_id, shop_id, name, updated_at
) values (
  '34000000-0000-4000-8000-000000040001',
  '00000000-0000-4000-8000-000000040001',
  '14000000-0000-4000-8000-000000040001',
  'M4 internal category', statement_timestamp()
);

insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
) values (
  '24000000-0000-4000-8000-000000040001',
  '00000000-0000-4000-8000-000000040001',
  '14000000-0000-4000-8000-000000040001',
  'M4-E2E-0001', 'M4 internal product',
  '34000000-0000-4000-8000-000000040001',
  700, 1900, 2, statement_timestamp()
);

insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image,
  customer_order_push_enabled
) values (
  '14000000-0000-4000-8000-000000040001',
  'milestone4-e2e', true, true, false, true, false, true
);

insert into public.storefront_payment_settings(
  shop_id, pay_at_pickup_enabled, cash_on_delivery_enabled,
  online_payment_enabled, online_provider
) values (
  '14000000-0000-4000-8000-000000040001',
  true, false, false, 'none'
);

insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name,
  publication_status, sort_rank
) values (
  '44000000-0000-4000-8000-000000040001',
  '14000000-0000-4000-8000-000000040001',
  '34000000-0000-4000-8000-000000040001',
  'ofertas-m4', 'Ofertas M4', 'published', 1
);

insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '64000000-0000-4000-8000-000000040001',
  '14000000-0000-4000-8000-000000040001',
  'Retiro M4', 'Private fixture address', 'Ñuñoa', 'Metropolitana', true
);

insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '74000000-0000-4000-8000-000000040001',
  '14000000-0000-4000-8000-000000040001',
  'reservation', '64000000-0000-4000-8000-000000040001',
  'Reserva M4', statement_timestamp() + interval '1 hour',
  statement_timestamp() + interval '3 hours', 2, true
);

create temporary table m4_runtime(
  publication_id uuid,
  hold_id uuid,
  quote_id uuid,
  order_id uuid,
  payment_id uuid,
  shop_device_id uuid,
  pos_session_id uuid,
  handoff_id uuid,
  lease_token uuid,
  notification_delivery_id uuid,
  notification_lease_token uuid,
  notification_generation bigint,
  notification_route_token uuid
) on commit drop;
insert into m4_runtime default values;

create temporary table m4_results(
  label text primary key,
  payload jsonb not null
) on commit drop;

grant select, insert, update on m4_runtime, m4_results
  to anon, authenticated, service_role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000040001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000040001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into m4_results(label, payload)
select 'admin-publish', public.storefront_publication_authoring_mutate_v1(
  '14000000-0000-4000-8000-000000040001',
  'publish',
  jsonb_build_object(
    'sourceProductId', '24000000-0000-4000-8000-000000040001',
    'publicName', 'Producto público Milestone 4',
    'publicDescription', 'Producto de collaudo Storefront v1',
    'storefrontCategoryId', '44000000-0000-4000-8000-000000040001',
    'publicBrand', 'Merchandise Control',
    'publicPrice', 1900,
    'compareAtPrice', 2200,
    'priceSourceMode', 'override',
    'featured', true,
    'homeOrder', 1,
    'pickupEnabled', true,
    'deliveryEnabled', false,
    'reservationEnabled', true,
    'availability', 'available'
  ),
  '94000000-0000-4000-8000-000000040001',
  0
);
reset role;

update m4_runtime runtime
set publication_id = publication.id
from public.storefront_product_publications publication
where publication.shop_id = '14000000-0000-4000-8000-000000040001'
  and publication.source_product_id = '24000000-0000-4000-8000-000000040001';

select is(
  (select payload ->> 'code' from m4_results where label = 'admin-publish'),
  'success',
  'M4-01 Admin publishes the customer-safe product through the audited RPC'
);
select ok(
  (select publication_id is not null from m4_runtime)
  and exists (
    select 1 from public.audit_logs audit
    where audit.shop_id = '14000000-0000-4000-8000-000000040001'
      and audit.event_key = 'shop.storefront.authoring.publish.success'
  ),
  'M4-02 publication rebuild and audit commit atomically'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into m4_results(label, payload)
select 'public-detail', public.storefront_product_detail_v1(
  'milestone4-e2e', (select publication_id from m4_runtime)
);
reset role;

select ok(
  (select payload ->> 'status' from m4_results where label = 'public-detail') = 'ok'
  and (select payload #>> '{item,name}' from m4_results where label = 'public-detail')
    = 'Producto público Milestone 4'
  and (select payload #>> '{item,priceClp}' from m4_results where label = 'public-detail')
    = '1900',
  'M4-03 guest catalog detail exposes the published product and public price'
);
select ok(
  (select payload::text from m4_results where label = 'public-detail')
    !~* '(purchase_price|owner_user|source_product|stock_quantity|supplier|token)',
  'M4-04 guest payload omits internal inventory, owner, cost and token fields'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000040002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000040002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into m4_results(label, payload)
select 'device', public.customer_register_device_v1(
  '54000000-0000-4000-8000-000000040001',
  'android',
  'es-CL',
  'granted',
  'authorized',
  'm4-test-token-' || repeat('a', 48),
  '94000000-0000-4000-8000-000000040001'
);

select is(
  (select payload ->> 'status' from m4_results where label = 'device'),
  'ok',
  'M4-05 authenticated customer registers one consented notification device'
);

insert into m4_results(label, payload)
select 'hold', public.customer_reservation_hold_create_v1(
  'milestone4-e2e',
  (select publication_id from m4_runtime),
  1,
  '94000000-0000-4000-8000-000000040002'
);
update m4_runtime
set hold_id = (
  select (payload ->> 'holdId')::uuid from m4_results where label = 'hold'
);

select ok(
  (select payload ->> 'status' from m4_results where label = 'hold') = 'ok'
  and (select payload ->> 'holdStatus' from m4_results where label = 'hold') = 'active',
  'M4-06 reservation hold is active and server-expiring'
);
select ok(
  (
    public.customer_reservation_hold_create_v1(
      'milestone4-e2e', (select publication_id from m4_runtime), 1,
      '94000000-0000-4000-8000-000000040002'
    ) ->> 'idempotent'
  )::boolean,
  'M4-07 duplicate hold request replays the same aggregate'
);

insert into m4_results(label, payload)
select 'cart', public.customer_cart_mutate_v1(
  'milestone4-e2e', 'set', (select publication_id from m4_runtime), 1, 0,
  '94000000-0000-4000-8000-000000040003'
);

select ok(
  (select payload ->> 'status' from m4_results where label = 'cart') = 'ok'
  and (select payload ->> 'cartVersion' from m4_results where label = 'cart') = '1'
  and (select payload ->> 'subtotalClp' from m4_results where label = 'cart') = '1900',
  'M4-08 persistent customer cart uses the server price and one versioned line'
);
select ok(
  (select payload::text from m4_results where label = 'cart')
    !~* '(purchase_price|owner_user|source_product|stock_quantity|shop_id|cart_id)',
  'M4-09 cart response preserves the customer-safe boundary'
);

insert into m4_results(label, payload)
select 'payment-options', public.storefront_payment_options_v1('milestone4-e2e');
select ok(
  (select (payload #>> '{methods,0,enabled}')::boolean
   from m4_results where label = 'payment-options')
  and not (select (payload #>> '{methods,2,enabled}')::boolean
           from m4_results where label = 'payment-options'),
  'M4-10 pay-at-pickup is available and online payment remains OFF'
);

insert into m4_results(label, payload)
select 'quote', public.customer_checkout_quote_create_v1(
  'milestone4-e2e',
  (select (payload ->> 'cartVersion')::bigint from m4_results where label = 'cart'),
  'reservation', null,
  '64000000-0000-4000-8000-000000040001',
  '74000000-0000-4000-8000-000000040001',
  '94000000-0000-4000-8000-000000040004'
);
update m4_runtime
set quote_id = (
  select (payload ->> 'quoteId')::uuid from m4_results where label = 'quote'
);

select ok(
  (select payload ->> 'status' from m4_results where label = 'quote') = 'quoted'
  and (select payload ->> 'totalClp' from m4_results where label = 'quote') = '1900',
  'M4-11 checkout quote revalidates price, fulfillment and hold server-side'
);

insert into m4_results(label, payload)
select 'quote-confirm', public.customer_checkout_quote_confirm_v1(
  (select quote_id from m4_runtime), 1,
  '94000000-0000-4000-8000-000000040005'
);
select ok(
  (select payload ->> 'status' from m4_results where label = 'quote-confirm') = 'confirmed'
  and (select payload ->> 'quoteVersion' from m4_results where label = 'quote-confirm') = '2',
  'M4-12 customer confirms the current server quote version'
);

select is(
  public.customer_order_create_v2(
    (select quote_id from m4_runtime), 2, 'online_payment',
    '94000000-0000-4000-8000-000000040006'
  ) ->> 'status',
  'online_payment_unavailable',
  'M4-13 malicious online-payment request fails closed'
);

insert into m4_results(label, payload)
select 'order', public.customer_order_create_v2(
  (select quote_id from m4_runtime), 2, 'pay_at_pickup',
  '94000000-0000-4000-8000-000000040007'
);
update m4_runtime
set order_id = (
  select (payload ->> 'orderId')::uuid from m4_results where label = 'order'
);
reset role;
update m4_runtime runtime
set payment_id = payment.id
from public.customer_order_payments payment
where payment.order_id = runtime.order_id;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000040002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000040002',
  true
);

select ok(
  (select payload ->> 'status' from m4_results where label = 'order') = 'ok'
  and (select payload #>> '{payment,method}' from m4_results where label = 'order')
    = 'pay_at_pickup'
  and (select payload #>> '{payment,amountClp}' from m4_results where label = 'order')
    = '1900',
  'M4-14 order and offline payment snapshot commit with server-derived total'
);
select ok(
  (
    public.customer_order_create_v2(
      (select quote_id from m4_runtime), 2, 'pay_at_pickup',
      '94000000-0000-4000-8000-000000040007'
    ) ->> 'idempotent'
  )::boolean,
  'M4-15 ambiguous order retry resolves idempotently to the same order'
);
reset role;
select is(
  (
    select hold.status from public.customer_reservation_holds hold
    where hold.id = (select hold_id from m4_runtime)
  ),
  'consumed',
  'M4-16 order atomically consumes the active reservation hold'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    cross join lateral unnest(coalesce(procedure.proargnames, '{}'::text[])) argument(name)
    where namespace.nspname = 'public'
      and procedure.proname = 'customer_order_create_v2'
      and argument.name ~* '(total|price|discount|stock|shop|owner|state)'
  ),
  'M4-17 order RPC accepts no malicious total, price, discount, stock or tenant input'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000040003","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000040003',
  true
);
select is(
  public.customer_order_read_v2((select order_id from m4_runtime)) ->> 'status',
  'not_found',
  'M4-18 cross-user order read fails without existence disclosure'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000040001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000040001',
  true
);

select is(
  public.admin_customer_order_transition_v1(
    '14000000-0000-4000-8000-000000040001',
    (select order_id from m4_runtime), 'ready', 1,
    '94000000-0000-4000-8000-000000040008',
    '94000000-0000-4000-8000-000000040009'
  ) ->> 'code',
  'invalid_state',
  'M4-19 Admin state machine rejects a forward skip'
);

insert into m4_results(label, payload)
select 'admin-accept', public.admin_customer_order_transition_v1(
  '14000000-0000-4000-8000-000000040001',
  (select order_id from m4_runtime), 'accept', 1,
  '94000000-0000-4000-8000-000000040010',
  '94000000-0000-4000-8000-000000040011'
);

select ok(
  (select (payload ->> 'ok')::boolean from m4_results where label = 'admin-accept')
  and (select payload ->> 'order_status' from m4_results where label = 'admin-accept')
    = 'accepted',
  'M4-20 authorized Admin accepts the confirmed customer order'
);
select ok(
  (
    public.admin_customer_order_transition_v1(
      '14000000-0000-4000-8000-000000040001',
      (select order_id from m4_runtime), 'accept', 1,
      '94000000-0000-4000-8000-000000040010',
      '94000000-0000-4000-8000-000000040011'
    ) ->> 'idempotent'
  )::boolean,
  'M4-21 Admin accept retry replays the committed transition'
);
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
insert into m4_results(label, payload)
select 'pos-login', public.pos_runtime_first_login_commit_v2(
  '14000000-0000-4000-8000-000000040001',
  '84000000-0000-4000-8000-000000040001',
  7,
  'm4-e2e-device',
  'M4 E2E POS',
  'storefront-v1-m4-e2e',
  'sha256:' || repeat('1', 64),
  15552000,
  'sha256:' || repeat('2', 64),
  43200,
  '{"source":"STOREFRONT_V1_MILESTONE4_E2E","app_version_present":true}'::jsonb
);
update m4_runtime
set shop_device_id = (
      select (payload ->> 'shopDeviceId')::uuid
      from m4_results where label = 'pos-login'
    ),
    pos_session_id = (
      select (payload ->> 'posSessionId')::uuid
      from m4_results where label = 'pos-login'
    );

select ok(
  (select (payload ->> 'ok')::boolean from m4_results where label = 'pos-login')
  and (select shop_device_id is not null and pos_session_id is not null from m4_runtime),
  'M4-22 POS establishes a bounded runtime lease'
);

select is(
  public.pos_customer_order_claim_v1(
    '14000000-0000-4000-8000-000000040002',
    (select shop_device_id from m4_runtime),
    '84000000-0000-4000-8000-000000040001',
    (select pos_session_id from m4_runtime), 10
  ) ->> 'code',
  'denied',
  'M4-23 cross-shop POS claim is denied'
);

insert into m4_results(label, payload)
select 'pos-claim', public.pos_customer_order_claim_v1(
  '14000000-0000-4000-8000-000000040001',
  (select shop_device_id from m4_runtime),
  '84000000-0000-4000-8000-000000040001',
  (select pos_session_id from m4_runtime), 10
);
update m4_runtime
set handoff_id = (
      select (payload #>> '{handoffs,0,handoffId}')::uuid
      from m4_results where label = 'pos-claim'
    ),
    lease_token = (
      select (payload #>> '{handoffs,0,leaseToken}')::uuid
      from m4_results where label = 'pos-claim'
    );

select ok(
  (select jsonb_array_length(payload -> 'handoffs')
   from m4_results where label = 'pos-claim') = 1
  and (select payload #>> '{handoffs,0,order,orderId}'
       from m4_results where label = 'pos-claim')
    = (select order_id::text from m4_runtime)
  and (select payload #>> '{handoffs,0,order,fiscalStatus}'
       from m4_results where label = 'pos-claim') = 'not_created',
  'M4-24 POS receives exactly the accepted customer order, not a fiscal sale'
);
select ok(
  (select payload #> '{handoffs,0,order}' from m4_results where label = 'pos-claim')::text
    !~* '(ownerUserId|customerEmail|sourceProductId|purchasePrice|stockQuantity|token)',
  'M4-25 POS handoff is privacy-safe and operationally bounded'
);

insert into m4_results(label, payload)
select 'pos-accepted', public.pos_customer_order_ack_v1(
  '14000000-0000-4000-8000-000000040001',
  (select shop_device_id from m4_runtime),
  '84000000-0000-4000-8000-000000040001',
  (select pos_session_id from m4_runtime),
  (select handoff_id from m4_runtime),
  (select lease_token from m4_runtime),
  'accepted', 2,
  '94000000-0000-4000-8000-000000040012', null
);
select ok(
  (select (payload ->> 'ok')::boolean from m4_results where label = 'pos-accepted')
  and (select payload ->> 'orderStatus' from m4_results where label = 'pos-accepted')
    = 'accepted',
  'M4-26 POS accepted acknowledgement consumes the leased handoff'
);
select ok(
  (
    public.pos_customer_order_ack_v1(
      '14000000-0000-4000-8000-000000040001',
      (select shop_device_id from m4_runtime),
      '84000000-0000-4000-8000-000000040001',
      (select pos_session_id from m4_runtime),
      (select handoff_id from m4_runtime),
      (select lease_token from m4_runtime),
      'accepted', 2,
      '94000000-0000-4000-8000-000000040012', null
    ) ->> 'idempotent'
  )::boolean,
  'M4-27 duplicate POS acknowledgement is idempotent'
);

insert into m4_results(label, payload)
select 'pos-prepared', public.pos_customer_order_ack_v1(
  '14000000-0000-4000-8000-000000040001',
  (select shop_device_id from m4_runtime),
  '84000000-0000-4000-8000-000000040001',
  (select pos_session_id from m4_runtime),
  (select handoff_id from m4_runtime),
  (select lease_token from m4_runtime),
  'prepared', 2,
  '94000000-0000-4000-8000-000000040013', null
);
select is(
  (select payload ->> 'orderStatus' from m4_results where label = 'pos-prepared'),
  'ready',
  'M4-28 POS prepared acknowledgement advances the order to ready'
);

insert into m4_results(label, payload)
select 'pos-completed', public.pos_customer_order_ack_v1(
  '14000000-0000-4000-8000-000000040001',
  (select shop_device_id from m4_runtime),
  '84000000-0000-4000-8000-000000040001',
  (select pos_session_id from m4_runtime),
  (select handoff_id from m4_runtime),
  (select lease_token from m4_runtime),
  'completed', 4,
  '94000000-0000-4000-8000-000000040014', null
);
select ok(
  (select payload ->> 'orderStatus' from m4_results where label = 'pos-completed')
    = 'completed'
  and (select payload ->> 'fiscalStatus' from m4_results where label = 'pos-completed')
    = 'not_created',
  'M4-29 POS completes the customer order without inventing a fiscal sale'
);

insert into m4_results(label, payload)
select 'payment-collected', public.service_customer_payment_transition_v1(
  (select payment_id from m4_runtime), 'collected',
  '94000000-0000-4000-8000-000000040015',
  null, null, 'pos'
);
select ok(
  (select payload ->> 'status' from m4_results where label = 'payment-collected') = 'ok'
  and (select payload #>> '{payment,status}'
       from m4_results where label = 'payment-collected') = 'collected'
  and not exists (
    select 1 from public.pos_sales sale
    where sale.shop_id = '14000000-0000-4000-8000-000000040001'
  ),
  'M4-30 offline collection remains distinct from the fiscal POS ledger'
);

insert into m4_results(label, payload)
select 'notification-claim', public.customer_notification_claim_v1(
  20, 60, '94000000-0000-4000-8000-000000040016'
);
update m4_runtime
set notification_delivery_id = (
      select (payload #>> '{deliveries,0,deliveryId}')::uuid
      from m4_results where label = 'notification-claim'
    ),
    notification_lease_token = (
      select (payload #>> '{deliveries,0,leaseToken}')::uuid
      from m4_results where label = 'notification-claim'
    ),
    notification_generation = (
      select (payload #>> '{deliveries,0,destinationGeneration}')::bigint
      from m4_results where label = 'notification-claim'
    );
update m4_runtime runtime
set notification_route_token = notification_event.route_token
from public.customer_notification_deliveries delivery
join public.customer_notification_events notification_event
  on notification_event.id = delivery.event_id
where delivery.id = runtime.notification_delivery_id;

select ok(
  (select jsonb_array_length(payload -> 'deliveries')
   from m4_results where label = 'notification-claim') = 1
  and (select payload #>> '{deliveries,0,payload,event}'
       from m4_results where label = 'notification-claim') = 'completed',
  'M4-31 notification dispatcher selects only the latest completed event'
);
select ok(
  (select payload #> '{deliveries,0,payload}'
   from m4_results where label = 'notification-claim')::text
    !~* '(email|address|item|total|owner|orderId|pushToken|refreshToken)',
  'M4-32 lock-screen payload is localized, opaque and privacy-safe'
);

insert into m4_results(label, payload)
select 'notification-ack', public.customer_notification_ack_v1(
  (select notification_delivery_id from m4_runtime),
  (select notification_lease_token from m4_runtime),
  (select notification_generation from m4_runtime),
  'delivered',
  '94000000-0000-4000-8000-000000040017',
  'recording-provider-m4', null
);
select ok(
  (select payload ->> 'status' from m4_results where label = 'notification-ack') = 'success'
  and exists (
    select 1 from public.customer_notification_receipts receipt
    where receipt.delivery_id = (select notification_delivery_id from m4_runtime)
      and receipt.response_payload ->> 'deliveryStatus' = 'delivered'
  ),
  'M4-33 notification delivery records one idempotent hashed receipt'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000040002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000040002',
  true
);

insert into m4_results(label, payload)
select 'notification-route', public.customer_notification_route_v1(
  'milestone4-e2e', (select notification_route_token from m4_runtime)
);
select ok(
  (select payload ->> 'status' from m4_results where label = 'notification-route') = 'ok'
  and (select payload ->> 'orderId' from m4_results where label = 'notification-route')
    = (select order_id::text from m4_runtime),
  'M4-34 notification deep link resolves owner-scoped to the authoritative order'
);

insert into m4_results(label, payload)
select 'order-detail', public.customer_order_detail_v1(
  'milestone4-e2e', (select order_id from m4_runtime)
);
select ok(
  (select payload ->> 'status' from m4_results where label = 'order-detail') = 'ok'
  and (select payload ->> 'orderStatus' from m4_results where label = 'order-detail')
    = 'completed'
  and (select jsonb_array_length(payload -> 'timeline')
       from m4_results where label = 'order-detail') = 5,
  'M4-35 customer timeline reads the completed five-state order history'
);
select ok(
  jsonb_array_length(
    public.customer_order_list_v1('milestone4-e2e', 20, null, null) -> 'orders'
  ) = 1,
  'M4-36 authenticated customer order history contains the completed order once'
);
select ok(
  (public.customer_order_read_v2((select order_id from m4_runtime))
     #>> '{payment,status}') = 'collected',
  'M4-37 customer receipt exposes the final public payment state'
);
reset role;

select ok(
  (
    select count(*) = 5
    from public.customer_order_status_events event
    where event.order_id = (select order_id from m4_runtime)
  )
  and (
    select count(*) = 3
    from public.customer_order_pos_receipts receipt
    where receipt.order_id = (select order_id from m4_runtime)
  )
  and not exists (
    select 1 from public.pos_sales sale
    where sale.shop_id = '14000000-0000-4000-8000-000000040001'
  ),
  'M4-38 final aggregate has one monotone timeline, three POS receipts and zero sale'
);
select ok(
  not exists (
    select 1
    from public.customer_notification_events notification_event
    join public.customer_notification_deliveries delivery
      on delivery.event_id = notification_event.id
    where notification_event.order_id = (select order_id from m4_runtime)
      and notification_event.event_version < 5
      and delivery.status not in ('suppressed', 'delivered')
  ),
  'M4-39 duplicate and superseded notifications leave no pending older delivery'
);
select ok(
  not exists (
    select 1
    from public.storefront_payment_settings payment
    where payment.shop_id = '14000000-0000-4000-8000-000000040001'
      and (payment.online_payment_enabled or payment.online_provider <> 'none')
  ),
  'M4-40 online payment remains fail-closed throughout the integrated flow'
);

select * from finish();
rollback;
