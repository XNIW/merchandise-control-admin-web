begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regclass('public.storefront_payment_settings') is not null
  and to_regclass('public.customer_order_payments') is not null
  and to_regclass('public.customer_payment_attempts') is not null
  and to_regclass('public.customer_payment_events') is not null
  and to_regclass('public.customer_payment_mutations') is not null
  and to_regclass('public.customer_payment_webhook_receipts') is not null,
  'TASK-032 installs shop settings and private payment lifecycle ledgers'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.storefront_payment_settings'::regclass,
      'public.customer_order_payments'::regclass,
      'public.customer_payment_attempts'::regclass,
      'public.customer_payment_events'::regclass,
      'public.customer_payment_mutations'::regclass,
      'public.customer_payment_webhook_receipts'::regclass
    )
  ),
  'all payment tables enable and force RLS'
);

select ok(
  not has_table_privilege(
    'anon', 'public.storefront_payment_settings',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.customer_order_payments',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.customer_payment_events',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'service_role', 'public.customer_order_payments',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'mobile roles cannot bypass payment RPCs and service access is explicit'
);

select ok(
  to_regprocedure(
    'public.customer_order_create_v2(uuid,bigint,text,uuid)'
  ) is not null
  and to_regprocedure('public.customer_order_read_v2(uuid)') is not null
  and to_regprocedure('public.storefront_payment_options_v1(text)') is not null
  and to_regprocedure(
    'public.service_customer_payment_transition_v1(uuid,text,uuid,text,text,text)'
  ) is not null
  and to_regprocedure(
    'public.service_customer_payment_webhook_receive_v1(text,text,text,boolean,timestamp with time zone)'
  ) is not null,
  'customer, service transition and dormant webhook RPC signatures are installed'
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
        'customer_order_create_v2',
        'customer_order_read_v2',
        'storefront_payment_options_v1',
        'service_customer_payment_transition_v1',
        'service_customer_payment_webhook_receive_v1'
      )
  ),
  'payment RPCs are hardened definers with an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.customer_order_create_v2(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.customer_order_create_v2(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.service_customer_payment_transition_v1(uuid,text,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.service_customer_payment_transition_v1(uuid,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  'customer and service payment authority are separated by grants'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    cross join lateral unnest(
      coalesce(procedure.proargnames, '{}'::text[])
    ) argument(name)
    where namespace.nspname = 'public'
      and procedure.proname = 'customer_order_create_v2'
      and argument.name ~* '(price|total|discount|fee|stock|status|user_id|shop_id)'
  ),
  'order v2 accepts no authoritative amount, discount, stock, state, owner or shop input'
);

select ok(
  not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name in (
        'storefront_payment_settings',
        'customer_order_payments',
        'customer_payment_attempts',
        'customer_payment_events',
        'customer_payment_mutations',
        'customer_payment_webhook_receipts'
      )
      and column_row.column_name ~* '(pan|cvc|card_number|merchant_secret|raw_body)'
  ),
  'payment persistence has no PAN, CVC, merchant secret or raw webhook body columns'
);

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000032000',
    'authenticated', 'authenticated', 'task032-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000032001',
    'authenticated', 'authenticated', 'task032-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000032002',
    'authenticated', 'authenticated', 'task032-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000032003',
    'authenticated', 'authenticated', 'task032-anon@example.invalid',
    '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '17000000-0000-4000-8000-000000032001',
  'SF32A',
  'Customer payment fixture',
  'active'
);

insert into public.profiles(profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000032000',
  'TASK-032 owner',
  'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shop_members(
  profile_id, shop_id, role_key, membership_status
) values (
  '00000000-0000-4000-8000-000000032000',
  '17000000-0000-4000-8000-000000032001',
  'shop_owner',
  'active'
);

insert into public.inventory_categories(
  id, owner_user_id, shop_id, name, updated_at
)
values (
  '37000000-0000-4000-8000-000000032001',
  '00000000-0000-4000-8000-000000032000',
  '17000000-0000-4000-8000-000000032001',
  'Payment fixture',
  now()
);

insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values (
  '27000000-0000-4000-8000-000000032001',
  '00000000-0000-4000-8000-000000032000',
  '17000000-0000-4000-8000-000000032001',
  'SF32-0001',
  'Internal payment product',
  '37000000-0000-4000-8000-000000032001',
  500,
  1200,
  3,
  now()
);

insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
)
values (
  '17000000-0000-4000-8000-000000032001',
  'customer-payment-fixture',
  true, true, false, false, false
);

insert into public.storefront_payment_settings(
  shop_id, pay_at_pickup_enabled, cash_on_delivery_enabled,
  online_payment_enabled, online_provider
)
values (
  '17000000-0000-4000-8000-000000032001',
  true, false, false, 'none'
);

insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values (
  '47000000-0000-4000-8000-000000032001',
  '17000000-0000-4000-8000-000000032001',
  '37000000-0000-4000-8000-000000032001',
  'payment-fixture', 'Payment fixture', 'published'
);

insert into public.storefront_product_publications(
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values (
  '57000000-0000-4000-8000-000000032001',
  '17000000-0000-4000-8000-000000032001',
  '27000000-0000-4000-8000-000000032001',
  'published', 'Café para retirar',
  '47000000-0000-4000-8000-000000032001',
  1200, 1500, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region,
  public_instructions, enabled
)
values (
  '67000000-0000-4000-8000-000000032001',
  '17000000-0000-4000-8000-000000032001',
  'Retiro central', 'Av. Central 320', 'Ñuñoa', 'Metropolitana',
  'Presenta tu código de pedido.', true
);

insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
)
values (
  '77000000-0000-4000-8000-000000032001',
  '17000000-0000-4000-8000-000000032001',
  'pickup',
  '67000000-0000-4000-8000-000000032001',
  'Retiro hoy', now() + interval '1 hour', now() + interval '3 hours',
  2, true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032000',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  public.admin_storefront_payment_read_v1(
    '17000000-0000-4000-8000-000000032001'
  ) ->> 'code' = 'success'
  and public.admin_storefront_payment_read_v1(
    '17000000-0000-4000-8000-000000032001'
  ) #>> '{settings,revision}' = '1',
  'authorized Storefront owner reads the fail-closed payment settings revision'
);

select is(
  public.admin_storefront_payment_mutate_v1(
    '17000000-0000-4000-8000-000000032001',
    '{"payAtPickupEnabled":true,"cashOnDeliveryEnabled":false,"onlinePaymentEnabled":true,"expectedRevision":1}'::jsonb
  ) ->> 'code',
  'online_payment_not_configured',
  'Admin cannot turn on online payment without an approved provider'
);

select is(
  public.admin_storefront_payment_mutate_v1(
    '17000000-0000-4000-8000-000000032001',
    '{"payAtPickupEnabled":true,"cashOnDeliveryEnabled":false,"onlinePaymentEnabled":false,"expectedRevision":1}'::jsonb
  ) ->> 'code',
  'success',
  'Admin persists offline settings through revision-bound audited mutation'
);

select ok(
  public.admin_storefront_payment_mutate_v1(
    '17000000-0000-4000-8000-000000032001',
    '{"payAtPickupEnabled":false,"cashOnDeliveryEnabled":false,"onlinePaymentEnabled":false,"expectedRevision":1}'::jsonb
  ) ->> 'code' = 'revision_conflict'
  and exists (
    select 1
    from public.audit_logs audit
    where audit.shop_id = '17000000-0000-4000-8000-000000032001'
      and audit.event_key = 'shop.storefront.payment.settings.success'
      and audit.metadata_redacted ? 'before'
      and audit.metadata_redacted ? 'after'
  ),
  'stale Admin write fails closed and successful change records redacted audit'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032003","role":"authenticated","is_anonymous":true}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$select public.storefront_payment_options_v1('customer-payment-fixture')$$,
  '28000', null,
  'anonymous Auth identities cannot resolve checkout payment methods'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032001',
  true
);

select ok(
  public.storefront_payment_options_v1('customer-payment-fixture')
    #>> '{methods,0,method}' = 'pay_at_pickup'
  and (
    public.storefront_payment_options_v1('customer-payment-fixture')
      #>> '{methods,0,enabled}'
  )::boolean
  and not (
    public.storefront_payment_options_v1('customer-payment-fixture')
      #>> '{methods,1,enabled}'
  )::boolean
  and not (
    public.storefront_payment_options_v1('customer-payment-fixture')
      #>> '{methods,2,enabled}'
  )::boolean,
  'pay-at-pickup is available while COD and online payment remain fail-closed'
);

create temp table task032_cart as
select public.customer_cart_mutate_v1(
  'customer-payment-fixture',
  'set',
  '57000000-0000-4000-8000-000000032001',
  2,
  0,
  '97000000-0000-4000-8000-000000032001'
) as payload;

create temp table task032_quote as
select public.customer_checkout_quote_create_v1(
  'customer-payment-fixture',
  (select (payload ->> 'cartVersion')::bigint from task032_cart),
  'pickup',
  null,
  '67000000-0000-4000-8000-000000032001',
  '77000000-0000-4000-8000-000000032001',
  '97000000-0000-4000-8000-000000032002'
) as payload;

create temp table task032_confirm as
select public.customer_checkout_quote_confirm_v1(
  (select (payload ->> 'quoteId')::uuid from task032_quote),
  1,
  '97000000-0000-4000-8000-000000032003'
) as payload;

select is(
  public.customer_order_create_v2(
    (select (payload ->> 'quoteId')::uuid from task032_quote),
    2,
    'online_payment',
    '97000000-0000-4000-8000-000000032004'
  ) ->> 'status',
  'online_payment_unavailable',
  'online payment cannot be requested while provider and feature flag are absent'
);

select is(
  public.customer_order_create_v2(
    (select (payload ->> 'quoteId')::uuid from task032_quote),
    2,
    'cash_on_delivery',
    '97000000-0000-4000-8000-000000032005'
  ) ->> 'status',
  'payment_method_unavailable',
  'COD is rejected for a pickup quote even when supplied by a malicious client'
);

create temp table task032_order as
select public.customer_order_create_v2(
  (select (payload ->> 'quoteId')::uuid from task032_quote),
  2,
  'pay_at_pickup',
  '97000000-0000-4000-8000-000000032006'
) as payload;

select ok(
  (select payload ->> 'apiVersion' from task032_order) = 'customer-order.v2'
  and (select payload ->> 'status' from task032_order) = 'ok'
  and (select payload #>> '{payment,method}' from task032_order)
    = 'pay_at_pickup'
  and (select payload #>> '{payment,status}' from task032_order)
    = 'due_at_fulfillment'
  and (select payload #>> '{payment,amountClp}' from task032_order) = '2400'
  and (select payload #>> '{payment,currencyCode}' from task032_order) = 'CLP',
  'order v2 creates one server-priced offline payment snapshot'
);

select ok(
  (select payload::text from task032_order)
    !~* '(source_product|hold_id|quote_id|cart_id|shop_id|user_id|purchase_price|stock_quantity|provider_reference|token|email)',
  'customer payment response excludes internal, provider, inventory and identity fields'
);

create temp table task032_replay as
select public.customer_order_create_v2(
  (select (payload ->> 'quoteId')::uuid from task032_quote),
  2,
  'pay_at_pickup',
  '97000000-0000-4000-8000-000000032006'
) as payload;

select ok(
  (select (payload ->> 'idempotent')::boolean from task032_replay)
  and (select payload ->> 'orderId' from task032_replay)
    = (select payload ->> 'orderId' from task032_order),
  'ambiguous create retry returns the same order and payment'
);

select is(
  public.customer_order_create_v2(
    (select (payload ->> 'quoteId')::uuid from task032_quote),
    2,
    'cash_on_delivery',
    '97000000-0000-4000-8000-000000032006'
  ) ->> 'status',
  'idempotency_conflict',
  'same create key cannot change the payment method'
);

set local role postgres;

select ok(
  (
    select count(*) = 1
    from public.customer_order_payments payment
    where payment.order_id = (
      select (payload ->> 'orderId')::uuid from task032_order
    )
      and payment.amount_clp = 2400
      and payment.method = 'pay_at_pickup'
      and payment.provider_key = 'none'
  )
  and (
    select count(*) = 1
    from public.customer_payment_attempts attempt
    join public.customer_order_payments payment
      on payment.id = attempt.payment_id
    where payment.order_id = (
      select (payload ->> 'orderId')::uuid from task032_order
    )
  )
  and (
    select count(*) = 1
    from public.customer_payment_events event
    join public.customer_order_payments payment
      on payment.id = event.payment_id
    where payment.order_id = (
      select (payload ->> 'orderId')::uuid from task032_order
    )
      and event.event_type = 'payment_due'
  ),
  'one payment, initial attempt and append-only event commit with the order'
);

select is(
  (
    select count(*)::integer
    from public.pos_sales sale
    where sale.shop_id = '17000000-0000-4000-8000-000000032001'
  ),
  0,
  'customer order payment never creates a fiscal POS sale'
);

select throws_ok(
  $$
    update public.customer_order_payments
    set amount_clp = amount_clp + 1
    where order_id = (
      select (payload ->> 'orderId')::uuid from task032_order
    )
  $$,
  '55000',
  'customer_payment_snapshot_immutable',
  'server-derived amount and method snapshots reject mutation'
);

grant select on table task032_order to service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

create temp table task032_collect as
select public.service_customer_payment_transition_v1(
  (
    select payment.id
    from public.customer_order_payments payment
    where payment.order_id = (
      select (payload ->> 'orderId')::uuid from task032_order
    )
  ),
  'collected',
  '97000000-0000-4000-8000-000000032007',
  null,
  null,
  'pos'
) as payload;

select ok(
  (select payload ->> 'status' from task032_collect) = 'ok'
  and not (select (payload ->> 'idempotent')::boolean from task032_collect)
  and (select payload #>> '{payment,status}' from task032_collect) = 'collected',
  'authorized service can record offline collection without fiscal side effects'
);

select ok(
  (
    public.service_customer_payment_transition_v1(
      (
        select payment.id
        from public.customer_order_payments payment
        where payment.order_id = (
          select (payload ->> 'orderId')::uuid from task032_order
        )
      ),
      'collected',
      '97000000-0000-4000-8000-000000032007',
      null,
      null,
      'pos'
    ) ->> 'idempotent'
  )::boolean,
  'service transition retry is idempotent'
);

select is(
  public.service_customer_payment_transition_v1(
    (
      select payment.id
      from public.customer_order_payments payment
      where payment.order_id = (
        select (payload ->> 'orderId')::uuid from task032_order
      )
    ),
    'pending_provider',
    '97000000-0000-4000-8000-000000032008',
    null,
    null,
    'provider'
  ) ->> 'status',
  'provider_disabled',
  'offline payment rejects provider-originated transitions'
);

select is(
  public.service_customer_payment_transition_v1(
    (
      select payment.id
      from public.customer_order_payments payment
      where payment.order_id = (
        select (payload ->> 'orderId')::uuid from task032_order
      )
    ),
    'refund_pending',
    '97000000-0000-4000-8000-000000032009',
    null,
    null,
    'admin'
  ) #>> '{payment,status}',
  'refund_pending',
  'collected payment enters an explicit refund workflow'
);

select is(
  public.service_customer_payment_transition_v1(
    (
      select payment.id
      from public.customer_order_payments payment
      where payment.order_id = (
        select (payload ->> 'orderId')::uuid from task032_order
      )
    ),
    'refunded',
    '97000000-0000-4000-8000-000000032010',
    null,
    null,
    'admin'
  ) #>> '{payment,status}',
  'refunded',
  'refund completion is explicit and server-authoritative'
);

select is(
  public.service_customer_payment_transition_v1(
    (
      select payment.id
      from public.customer_order_payments payment
      where payment.order_id = (
        select (payload ->> 'orderId')::uuid from task032_order
      )
    ),
    'collected',
    '97000000-0000-4000-8000-000000032011',
    null,
    null,
    'admin'
  ) ->> 'status',
  'transition_conflict',
  'terminal refund rejects out-of-order collection replay'
);

select is(
  public.service_customer_payment_webhook_receive_v1(
    'recording',
    repeat('a', 64),
    repeat('b', 64),
    true,
    statement_timestamp()
  ) ->> 'status',
  'provider_disabled',
  'valid-looking webhook remains dormant without approved provider config'
);

select is(
  public.service_customer_payment_webhook_receive_v1(
    'recording',
    repeat('c', 64),
    repeat('d', 64),
    false,
    statement_timestamp()
  ) ->> 'status',
  'invalid_signature',
  'unsigned webhook fails before persistence'
);

select is(
  (
    select count(*)::integer
    from public.customer_payment_webhook_receipts
  ),
  0,
  'disabled and invalid provider events leave no webhook receipt'
);

set local role postgres;
update public.storefront_product_publications
set delivery_enabled = true
where id = '57000000-0000-4000-8000-000000032001';
update public.storefront_settings
set delivery_enabled = true
where shop_id = '17000000-0000-4000-8000-000000032001';
update public.storefront_payment_settings
set cash_on_delivery_enabled = true,
    revision = revision + 1
where shop_id = '17000000-0000-4000-8000-000000032001';

insert into public.customer_addresses(
  id, user_id, label, recipient_name, address_line_1,
  commune, region, postal_code, country_code, is_default
) values (
  '86000000-0000-4000-8000-000000032001',
  '00000000-0000-4000-8000-000000032001',
  'Casa', 'Cliente TASK-032', 'Av. Grecia 320',
  'Ñuñoa', 'Metropolitana', '7750000', 'CL', true
);

insert into public.storefront_delivery_zones(
  id, shop_id, public_name, region, fee_clp, enabled
) values (
  '68000000-0000-4000-8000-000000032001',
  '17000000-0000-4000-8000-000000032001',
  'Zona Oriente', 'Metropolitana', 500, true
);
insert into public.storefront_delivery_zone_communes(
  shop_id, zone_id, commune
) values (
  '17000000-0000-4000-8000-000000032001',
  '68000000-0000-4000-8000-000000032001',
  'Ñuñoa'
);
insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, delivery_zone_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '78000000-0000-4000-8000-000000032001',
  '17000000-0000-4000-8000-000000032001',
  'delivery',
  '68000000-0000-4000-8000-000000032001',
  'Entrega hoy', now() + interval '1 hour', now() + interval '3 hours',
  2, true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  (
    public.storefront_payment_options_v1('customer-payment-fixture')
      #>> '{methods,1,enabled}'
  )::boolean
  and (
    public.storefront_payment_options_v1('customer-payment-fixture')
      #>> '{methods,1,fulfillmentModes,0}'
  ) = 'delivery',
  'COD appears only after shop payment, delivery zone and slot are configured'
);

create temp table task032_delivery_cart as
select public.customer_cart_mutate_v1(
  'customer-payment-fixture',
  'set',
  '57000000-0000-4000-8000-000000032001',
  1,
  (
    public.customer_cart_read_v1('customer-payment-fixture')
      ->> 'cartVersion'
  )::bigint,
  '97000000-0000-4000-8000-000000032012'
) as payload;

create temp table task032_delivery_quote as
select public.customer_checkout_quote_create_v1(
  'customer-payment-fixture',
  (select (payload ->> 'cartVersion')::bigint from task032_delivery_cart),
  'delivery',
  '86000000-0000-4000-8000-000000032001',
  null,
  '78000000-0000-4000-8000-000000032001',
  '97000000-0000-4000-8000-000000032013'
) as payload;

create temp table task032_delivery_confirm as
select public.customer_checkout_quote_confirm_v1(
  (select (payload ->> 'quoteId')::uuid from task032_delivery_quote),
  1,
  '97000000-0000-4000-8000-000000032014'
) as payload;

create temp table task032_delivery_order as
select public.customer_order_create_v2(
  (select (payload ->> 'quoteId')::uuid from task032_delivery_quote),
  2,
  'cash_on_delivery',
  '97000000-0000-4000-8000-000000032015'
) as payload;

select ok(
  (select payload ->> 'status' from task032_delivery_order) = 'ok'
  and (select payload #>> '{payment,method}' from task032_delivery_order)
    = 'cash_on_delivery'
  and (select payload #>> '{payment,status}' from task032_delivery_order)
    = 'due_at_fulfillment'
  and (select payload #>> '{payment,amountClp}' from task032_delivery_order)
    = '1700'
  and (select payload ->> 'deliveryFeeClp' from task032_delivery_order) = '500',
  'configured COD order snapshots the server-derived product and delivery total'
);

set local role postgres;
select ok(
  (
    select count(*) = 2
    from public.customer_order_payments payment
    where payment.shop_id = '17000000-0000-4000-8000-000000032001'
  )
  and (
    select count(*) = 0
    from public.pos_sales sale
    where sale.shop_id = '17000000-0000-4000-8000-000000032001'
  ),
  'pickup and COD payments remain distinct from the fiscal POS ledger'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.customer_order_read_v2(
    (select (payload ->> 'orderId')::uuid from task032_order)
  ) ->> 'status',
  'not_found',
  'cross-user payment receipt reads fail closed without existence disclosure'
);

set local role postgres;
select * from finish();
rollback;
