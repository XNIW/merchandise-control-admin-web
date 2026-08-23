begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select ok(
  to_regclass('public.customer_delivery_contexts') is not null
  and to_regclass('public.customer_service_cases') is not null
  and to_regclass('public.customer_service_case_lines') is not null
  and to_regclass('public.customer_service_case_events') is not null
  and to_regclass('public.customer_service_case_evidence') is not null
  and to_regclass('public.customer_product_reviews') is not null
  and to_regclass('public.storefront_review_aggregates') is not null,
  'commerce journey installs one delivery context, after-sales and verified-review domain'
);

select ok(
  (
    select bool_and(class.relrowsecurity and class.relforcerowsecurity)
    from pg_catalog.pg_class class
    where class.oid in (
      'public.customer_delivery_contexts'::regclass,
      'public.customer_service_cases'::regclass,
      'public.customer_service_case_lines'::regclass,
      'public.customer_service_case_events'::regclass,
      'public.customer_service_case_evidence'::regclass,
      'public.customer_service_case_evidence_upload_tickets'::regclass,
      'public.customer_product_reviews'::regclass,
      'public.storefront_review_aggregates'::regclass
    )
  ),
  'new private tables enable and force RLS'
);

select ok(
  not has_table_privilege('anon', 'public.customer_service_cases', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.customer_service_cases', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.customer_product_reviews', 'INSERT,UPDATE,DELETE')
  and has_table_privilege('service_role', 'public.customer_service_cases', 'SELECT,INSERT,UPDATE,DELETE'),
  'customer mutations remain RPC-only and service access is explicit'
);

select ok(
  to_regprocedure('public.customer_addresses_read_v2()') is not null
  and to_regprocedure('public.storefront_delivery_context_preview_v1(text,text,uuid,uuid,text)') is not null
  and to_regprocedure('public.customer_checkout_quote_create_v2(text,bigint,text,uuid,uuid,uuid,bigint,uuid)') is not null
  and to_regprocedure('public.customer_notifications_list_v1(text,text,timestamp with time zone,uuid,integer)') is not null
  and to_regprocedure('public.customer_order_reorder_apply_v1(uuid,uuid)') is not null
  and to_regprocedure('public.customer_after_sales_create_v1(uuid,text,text,text,jsonb,uuid)') is not null
  and to_regprocedure('public.customer_after_sales_evidence_upload_ticket_v1(uuid,text)') is not null
  and to_regprocedure('public.service_after_sales_evidence_cleanup_claim_v1(timestamp with time zone,timestamp with time zone,integer)') is not null
  and to_regprocedure('public.service_after_sales_evidence_cleanup_ack_v1(uuid,boolean)') is not null
  and to_regprocedure('public.customer_review_submit_v1(uuid,integer,text)') is not null
  and to_regprocedure('public.storefront_search_suggestions_v1(text,text,integer)') is not null,
  'bounded v1/v2 RPC signatures are installed'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.service_customer_after_sales_refund_ack_v1(uuid,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.service_customer_after_sales_refund_ack_v1(uuid,text,uuid)',
    'EXECUTE'
  ),
  'refund acknowledgement is service-authority only'
);

select ok(
  not exists (
    select 1 from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name in (
        'customer_notification_events', 'customer_service_cases',
        'customer_service_case_events', 'customer_product_reviews'
      )
      and column_row.column_name ~* '(pan|cvc|raw_url|merchant_secret)'
  ),
  'new persistence contains no payment credential, raw URL or notification token field'
);

insert into auth.users(
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000050000',
    'authenticated', 'authenticated', 'task050-owner@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000050001',
    'authenticated', 'authenticated', 'task050-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000050002',
    'authenticated', 'authenticated', 'task050-outsider@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops(shop_id, shop_code, shop_name, shop_status)
values (
  '15000000-0000-4000-8000-000000050001',
  'SF50A', 'Commerce journey fixture', 'active'
);
insert into public.profiles(profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000050000', 'TASK-050 owner', 'active'
)
on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;
insert into public.shop_members(profile_id, shop_id, role_key, membership_status)
values (
  '00000000-0000-4000-8000-000000050000',
  '15000000-0000-4000-8000-000000050001', 'shop_owner', 'active'
);
insert into public.inventory_categories(id, owner_user_id, shop_id, name, updated_at)
values (
  '35000000-0000-4000-8000-000000050001',
  '00000000-0000-4000-8000-000000050000',
  '15000000-0000-4000-8000-000000050001', 'Bebidas', now()
);
insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  purchase_price, retail_price, stock_quantity, updated_at
)
values
  (
    '25000000-0000-4000-8000-000000050001',
    '00000000-0000-4000-8000-000000050000',
    '15000000-0000-4000-8000-000000050001', 'SF50-0001',
    'Café Andes', '35000000-0000-4000-8000-000000050001',
    900, 1990, 50, now()
  ),
  (
    '25000000-0000-4000-8000-000000050002',
    '00000000-0000-4000-8000-000000050000',
    '15000000-0000-4000-8000-000000050001', 'SF50-0002',
    'Té oculto', '35000000-0000-4000-8000-000000050001',
    500, 1290, 20, now()
  );
insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
)
values (
  '15000000-0000-4000-8000-000000050001',
  'commerce-journey-fixture', true, true, true, false, false
);
insert into public.storefront_payment_settings(
  shop_id, pay_at_pickup_enabled, cash_on_delivery_enabled,
  online_payment_enabled, online_provider
)
values (
  '15000000-0000-4000-8000-000000050001', true, true, false, 'none'
);
insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name, publication_status
)
values (
  '45000000-0000-4000-8000-000000050001',
  '15000000-0000-4000-8000-000000050001',
  '35000000-0000-4000-8000-000000050001',
  'bebidas', 'Bebidas', 'published'
);
insert into public.storefront_product_publications(
  id, shop_id, source_product_id, publication_status, public_name,
  public_brand, public_category_id, retail_price_clp, compare_at_price_clp,
  pickup_enabled, delivery_enabled, reservation_enabled,
  availability_mode, published_at
)
values
  (
    '55000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001',
    '25000000-0000-4000-8000-000000050001', 'published',
    'Café Andes', 'Merchandise Control',
    '45000000-0000-4000-8000-000000050001', 1990, 2290,
    true, true, false, 'available', now()
  ),
  (
    '55000000-0000-4000-8000-000000050002',
    '15000000-0000-4000-8000-000000050001',
    '25000000-0000-4000-8000-000000050002', 'draft',
    'Té oculto', null,
    '45000000-0000-4000-8000-000000050001', 1290, null,
    true, true, false, 'available', null
  );
insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region, enabled
)
values (
  '65000000-0000-4000-8000-000000050001',
  '15000000-0000-4000-8000-000000050001',
  'Negozio principale', 'Av. Central 50', 'Providencia', 'Metropolitana', true
);
insert into public.storefront_delivery_zones(
  id, shop_id, public_name, region, fee_clp, sort_rank, enabled
)
values (
  '75000000-0000-4000-8000-000000050001',
  '15000000-0000-4000-8000-000000050001',
  'Providencia', 'Metropolitana', 2990, 1, true
);
insert into public.storefront_delivery_zone_communes(shop_id, zone_id, commune)
values (
  '15000000-0000-4000-8000-000000050001',
  '75000000-0000-4000-8000-000000050001', 'Providencia'
);
insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, delivery_zone_id,
  public_label, starts_at, ends_at, capacity, enabled
)
values
  (
    '85000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001', 'delivery', null,
    '75000000-0000-4000-8000-000000050001', 'Mañana 14–16',
    now() + interval '1 hour', now() + interval '3 hours', 20, true
  ),
  (
    '85000000-0000-4000-8000-000000050002',
    '15000000-0000-4000-8000-000000050001', 'pickup',
    '65000000-0000-4000-8000-000000050001', null, 'Retiro mañana',
    now() + interval '2 hours', now() + interval '4 hours', 20, true
  );

insert into public.customer_orders(
  id, public_order_code, user_id, shop_id, quote_version, status,
  fulfillment_mode, slot_id, subtotal_clp, delivery_fee_clp, total_clp,
  fulfillment_snapshot
)
values
  (
    '95000000-0000-4000-8000-000000050001', 'MC-00000000000000500001',
    '00000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001', 1, 'completed',
    'delivery', '85000000-0000-4000-8000-000000050001',
    5270, 2990, 8260, '{"mode":"delivery","address":{"recipientPhoneE164":"+56912345678"}}'::jsonb
  ),
  (
    '95000000-0000-4000-8000-000000050002', 'MC-00000000000000500002',
    '00000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001', 1, 'cancelled',
    'pickup', '85000000-0000-4000-8000-000000050002',
    1990, 0, 1990, '{"mode":"pickup"}'::jsonb
  ),
  (
    '95000000-0000-4000-8000-000000050003', 'MC-00000000000000500003',
    '00000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001', 1, 'confirmed',
    'pickup', '85000000-0000-4000-8000-000000050002',
    1990, 0, 1990, '{"mode":"pickup"}'::jsonb
  );
insert into public.customer_order_items(
  id, order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, line_total_clp
)
values
  (
    '96000000-0000-4000-8000-000000050001',
    '95000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001', 1,
    '55000000-0000-4000-8000-000000050001',
    '25000000-0000-4000-8000-000000050001', 'Café Andes', 2, 1990, 3980
  ),
  (
    '96000000-0000-4000-8000-000000050002',
    '95000000-0000-4000-8000-000000050001',
    '15000000-0000-4000-8000-000000050001', 2,
    '55000000-0000-4000-8000-000000050002',
    '25000000-0000-4000-8000-000000050002', 'Té oculto', 1, 1290, 1290
  ),
  (
    '96000000-0000-4000-8000-000000050003',
    '95000000-0000-4000-8000-000000050003',
    '15000000-0000-4000-8000-000000050001', 1,
    '55000000-0000-4000-8000-000000050001',
    '25000000-0000-4000-8000-000000050001', 'Café Andes', 1, 1990, 1990
  );
insert into public.customer_order_payments(
  id, order_id, user_id, shop_id, method, status, amount_clp, provider_key
)
values (
  '97000000-0000-4000-8000-000000050001',
  '95000000-0000-4000-8000-000000050001',
  '00000000-0000-4000-8000-000000050001',
  '15000000-0000-4000-8000-000000050001',
  'cash_on_delivery', 'due_at_fulfillment', 8260, 'none'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table task050_address as
select public.customer_address_upsert_v2(
  null, null,
  '{
    "recipientName":"Ana Cliente",
    "recipientPhoneE164":"+56912345678",
    "label":"Casa",
    "addressLine1":"Av. Sintética 500",
    "commune":"Providencia",
    "region":"Metropolitana",
    "countryCode":"CL",
    "deliveryInstructions":"Portería",
    "latitude":-33.431,
    "longitude":-70.609,
    "locationSource":"map_pin",
    "isDefault":true
  }'::jsonb
) as payload;

select ok(
  (select payload ->> 'status' from task050_address) = 'ok'
  and (select payload #>> '{address,recipientPhoneMasked}' from task050_address) !~ '12345678$'
  and (select payload #>> '{address,version}' from task050_address) = '1',
  'address v2 normalizes bounded owner data and supplies a masked phone display'
);

select is(
  public.customer_address_upsert_v2(
    null, null,
    '{"recipientName":"Bad","recipientPhoneE164":"9123","label":"Casa","addressLine1":"X","commune":"Providencia","region":"Metropolitana"}'::jsonb
  ) ->> 'status',
  'invalid',
  'invalid E.164 phone is rejected server-side'
);

select is(
  public.customer_address_upsert_v2(
    null, null,
    '{"recipientName":"Bad","label":"Casa","addressLine1":"X","commune":"Providencia","region":"Metropolitana","latitude":91,"longitude":0}'::jsonb
  ) ->> 'status',
  'invalid',
  'out-of-range coordinates are rejected server-side'
);

select is(
  public.customer_address_upsert_v2(
    null, null,
    '{"recipientName":"Bad","label":"Casa","addressLine1":"X","commune":"Providencia","region":"Metropolitana","longitude":-70}'::jsonb
  ) ->> 'status',
  'invalid',
  'a partial coordinate pair is rejected instead of passing CHECK UNKNOWN'
);

select is(
  public.customer_address_upsert_v2(
    null, null,
    '{"recipientName":"Bad","label":"Casa","addressLine1":"X","commune":"Providencia","region":"Metropolitana","validatedAt":"2026-08-22T00:00:00Z"}'::jsonb
  ) ->> 'status',
  'invalid',
  'customer cannot self-attest address validation'
);

select is(
  public.customer_address_upsert_v2(
    (select (payload #>> '{address,id}')::uuid from task050_address),
    99,
    '{
      "recipientName":"Ana Cliente",
      "recipientPhoneE164":"+56912345678",
      "label":"Casa",
      "addressLine1":"Av. Sintética 500",
      "commune":"Providencia",
      "region":"Metropolitana",
      "countryCode":"CL",
      "latitude":-33.431,
      "longitude":-70.609,
      "locationSource":"map_pin",
      "isDefault":true
    }'::jsonb
  ) ->> 'status',
  'version_conflict',
  'stale address update is rejected'
);

select is(
  (select count(*)::integer from public.customer_addresses address
    where address.user_id = '00000000-0000-4000-8000-000000050001'
      and address.is_default),
  1,
  'stale set-default preserves the previously selected default address'
);

select ok(
  public.storefront_delivery_context_preview_v1(
    'commerce-journey-fixture', 'delivery',
    (select (payload #>> '{address,id}')::uuid from task050_address), null, null
  ) #>> '{serviceabilityStatus}' = 'serviceable'
  and public.storefront_delivery_context_preview_v1(
    'commerce-journey-fixture', 'delivery', null, null, 'Fuera de zona'
  ) #>> '{serviceabilityStatus}' = 'unsupported',
  'delivery preview resolves supported fee/slot and rejects an unsupported commune'
);

create temp table task050_context as
select public.customer_delivery_context_select_v1(
  'commerce-journey-fixture', 'delivery',
  (select (payload #>> '{address,id}')::uuid from task050_address), null, 0
) as payload;

select ok(
  (select payload #>> '{serviceabilityStatus}' from task050_context) = 'serviceable'
  and (select payload #>> '{estimatedFeeClp}' from task050_context) = '2990'
  and (select payload #>> '{contextVersion}' from task050_context) = '1',
  'authenticated context persists owner/shop-scoped authoritative fee and slot'
);

select is(
  public.customer_checkout_quote_create_v2(
    'commerce-journey-fixture', 0, 'delivery',
    (select (payload #>> '{address,id}')::uuid from task050_address), null,
    '85000000-0000-4000-8000-000000050001', 99,
    '98000000-0000-4000-8000-000000050001'
  ) ->> 'status',
  'stale_context',
  'checkout v2 rejects a stale delivery context before quoting'
);

set local role postgres;
insert into public.customer_addresses(
  id, user_id, label, recipient_name, address_line_1, commune, region,
  country_code, is_default
)
values (
  'a5000000-0000-4000-8000-000000050001',
  '00000000-0000-4000-8000-000000050001', 'Legacy', 'Legacy Customer',
  'Legacy 1', 'Providencia', 'Metropolitana', 'CL', false
);

select ok(
  exists (
    select 1 from public.customer_addresses address
    where address.id = 'a5000000-0000-4000-8000-000000050001'
      and address.recipient_phone_e164 is null
      and address.latitude is null and address.longitude is null
      and address.version = 1
  ),
  'legacy address remains valid without phone or coordinates'
);

select ok(
  not has_column_privilege('authenticated', 'public.customer_addresses', 'provider_place_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.customer_addresses', 'validated_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.customer_addresses', 'validated_at', 'UPDATE'),
  'provider place id and validation attestation remain server-private'
);

insert into public.customer_order_status_events(
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
)
values (
  'a6000000-0000-4000-8000-000000050001',
  '95000000-0000-4000-8000-000000050001',
  '15000000-0000-4000-8000-000000050001', 1,
  'completed', 'system', '{}'::jsonb, now()
);

select throws_ok(
  $$insert into public.customer_notification_events(
      user_id, shop_id, shop_slug, source_kind, event_key, event_version,
      occurred_at, destination_type, destination_id, safe_arguments
    ) values (
      '00000000-0000-4000-8000-000000050001',
      '15000000-0000-4000-8000-000000050001', 'commerce-journey-fixture',
      'system', 'unsafe', 1, now(), 'url',
      '15000000-0000-4000-8000-000000050001', '{"url":"https://evil.invalid"}'::jsonb
    )$$,
  '23514', null,
  'arbitrary notification URL/destination fails closed'
);

insert into public.customer_notification_events(
  id, user_id, shop_id, shop_slug, source_kind, event_key, event_version,
  occurred_at, created_at, safe_arguments
)
select gen_random_uuid(), '00000000-0000-4000-8000-000000050001',
  '15000000-0000-4000-8000-000000050001', 'commerce-journey-fixture',
  'system', 'fixture_' || value, 1,
  statement_timestamp(), statement_timestamp(), '{}'::jsonb
from unnest(array['one', 'two', 'three']) value;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050001', true);

create temp table task050_inbox as
select public.customer_notifications_list_v1(
  'commerce-journey-fixture', 'order', null, null, 25
) as payload;
select ok(
  (select (payload ->> 'unreadCount')::integer from task050_inbox) >= 1
  and (select payload #>> '{items,0,destinationType}' from task050_inbox) = 'order',
  'order event appears once in the owner inbox with a safe destination'
);

create temp table task050_inbox_page_1 as
select public.customer_notifications_list_v1(
  'commerce-journey-fixture', null, null, null, 2
) as payload;
create temp table task050_inbox_page_2 as
select public.customer_notifications_list_v1(
  'commerce-journey-fixture', null,
  (select (payload #>> '{items,1,createdAt}')::timestamptz from task050_inbox_page_1),
  (select (payload #>> '{items,1,id}')::uuid from task050_inbox_page_1),
  2
) as payload;
select ok(
  jsonb_array_length((select payload->'items' from task050_inbox_page_1)) = 2
  and jsonb_array_length((select payload->'items' from task050_inbox_page_2)) >= 1
  and (select payload #>> '{items,1,id}' from task050_inbox_page_1)
    <> (select payload #>> '{items,0,id}' from task050_inbox_page_2),
  'notification composite cursor preserves rows sharing the same timestamp'
);
select is(
  public.customer_notification_mark_read_v1(
    (select (payload #>> '{items,0,id}')::uuid from task050_inbox)
  ) ->> 'status',
  'ok',
  'owner marks one notification read'
);
select is(
  public.customer_notifications_mark_all_read_v1('commerce-journey-fixture') ->> 'status',
  'ok',
  'owner marks all shop notifications read'
);

create temp table task050_reorder_preview as
select public.customer_order_reorder_preview_v1(
  '95000000-0000-4000-8000-000000050001'
) as payload;
select ok(
  (select payload #>> '{items,0,currentPriceClp}' from task050_reorder_preview) = '1990'
  and (select payload #>> '{items,1,availability}' from task050_reorder_preview) = 'unavailable',
  'reorder preview uses current published price and reports hidden item unavailable'
);
create temp table task050_reorder as
select public.customer_order_reorder_apply_v1(
  '95000000-0000-4000-8000-000000050001',
  '98000000-0000-4000-8000-000000050002'
) as payload;
select ok(
  (select payload ->> 'status' from task050_reorder) = 'ok'
  and jsonb_array_length((select payload->'added' from task050_reorder)) = 1
  and jsonb_array_length((select payload->'skipped' from task050_reorder)) = 1,
  'reorder partially applies available items and reports skipped items'
);
select ok(
  (public.customer_order_reorder_apply_v1(
    '95000000-0000-4000-8000-000000050001',
    '98000000-0000-4000-8000-000000050002'
  ) ->> 'idempotent')::boolean,
  'reorder replay is idempotent'
);

set local role postgres;
update public.customer_cart_items cart_item
set quantity = 98
where cart_item.user_id = '00000000-0000-4000-8000-000000050001'
  and cart_item.publication_id = '55000000-0000-4000-8000-000000050001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050001', true);
create temp table task050_reorder_capped as
select public.customer_order_reorder_apply_v1(
  '95000000-0000-4000-8000-000000050001',
  '98000000-0000-4000-8000-000000050012'
) as payload;
select ok(
  (select payload #>> '{added,0,quantity}' from task050_reorder_capped) = '1'
  and exists (
    select 1
    from task050_reorder_capped capped,
      jsonb_array_elements(capped.payload->'skipped') skipped
    where skipped->>'reason' = 'quantity_capped'
      and skipped->>'quantity' = '1'
  ),
  'reorder reports the effective quantity added and the capped remainder'
);

select is(
  public.customer_after_sales_create_v1(
    '95000000-0000-4000-8000-000000050001', 'orderProblem', 'damaged',
    'Confezione sintetica danneggiata',
    '[{"orderItemId":"96000000-0000-4000-8000-000000050001","quantity":3}]'::jsonb,
    '98000000-0000-4000-8000-000000050003'
  ) ->> 'status',
  'invalid',
  'after-sales rejects quantity above the immutable order line'
);
create temp table task050_case as
select public.customer_after_sales_create_v1(
  '95000000-0000-4000-8000-000000050001', 'refundRequest', 'damaged',
  'Confezione sintetica danneggiata',
  '[{"orderItemId":"96000000-0000-4000-8000-000000050001","quantity":1}]'::jsonb,
  '98000000-0000-4000-8000-000000050004'
) as payload;
select ok(
  (select payload ->> 'status' from task050_case) = 'ok'
  and (select payload #>> '{case,status}' from task050_case) = 'submitted',
  'owner creates a bounded refund request with timeline'
);

select ok(
  (public.customer_after_sales_evidence_upload_ticket_v1(
    (select (payload #>> '{case,id}')::uuid from task050_case), 'jpg'
  ) ->> 'status') = 'ok'
  and (public.customer_after_sales_evidence_upload_ticket_v1(
    (select (payload #>> '{case,id}')::uuid from task050_case), 'png'
  ) ->> 'status') = 'ok'
  and (public.customer_after_sales_evidence_upload_ticket_v1(
    (select (payload #>> '{case,id}')::uuid from task050_case), 'webp'
  ) ->> 'status') = 'ok'
  and (public.customer_after_sales_evidence_upload_ticket_v1(
    (select (payload #>> '{case,id}')::uuid from task050_case), 'jpg'
  ) ->> 'status') = 'evidence_limit_reached',
  'evidence upload tickets enforce the maximum before storage upload'
);

set local role postgres;
update public.customer_service_case_evidence_upload_tickets ticket
set created_at = ticket.created_at - interval '1 hour',
    expires_at = ticket.expires_at - interval '1 hour'
where ticket.id = (
  select candidate.id
  from public.customer_service_case_evidence_upload_tickets candidate
  order by candidate.id
  limit 1
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
create temp table task050_cleanup_claim as
select public.service_after_sales_evidence_cleanup_claim_v1(
  statement_timestamp(), statement_timestamp() - interval '24 hours', 10
) as payload;
select ok(
  (select payload ->> 'status' from task050_cleanup_claim) = 'ok'
  and jsonb_array_length((select payload -> 'items' from task050_cleanup_claim)) = 1
  and (select payload #>> '{items,0,kind}' from task050_cleanup_claim) = 'orphan_ticket',
  'evidence cleanup claims bounded metadata without deleting storage rows in SQL'
);
create temp table task050_cleanup_release as
select public.service_after_sales_evidence_cleanup_ack_v1(
    (select (payload ->> 'claimId')::uuid from task050_cleanup_claim), false
  ) as payload;
set local role postgres;
select ok(
  (select payload ->> 'status' from task050_cleanup_release) = 'ok'
  and (select payload ->> 'storageDeleted' from task050_cleanup_release) = 'false'
  and not exists (
    select 1 from public.customer_service_case_evidence_upload_tickets ticket
    where ticket.cleanup_claim_id is not null
  ),
  'failed Storage API cleanup releases the claim for a bounded retry'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050002","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050002', true);
select is(
  jsonb_array_length(public.customer_after_sales_list_v1(
    'commerce-journey-fixture', 25
  )->'items'),
  0,
  'cross-owner after-sales read returns no cases'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050000', true);
select is(
  public.admin_customer_after_sales_transition_v1(
    '15000000-0000-4000-8000-000000050001',
    (select (payload #>> '{case,id}')::uuid from task050_case), 1,
    'reviewing'
  ) ->> 'code',
  'success',
  'authorized staff moves a submitted case into review'
);
select is(
  public.admin_customer_after_sales_transition_v1(
    '15000000-0000-4000-8000-000000050001',
    (select (payload #>> '{case,id}')::uuid from task050_case), 2,
    'approved'
  ) ->> 'code',
  'success',
  'authorized staff approves a reviewed case without claiming a refund'
);
select is(
  public.admin_customer_after_sales_transition_v1(
    '15000000-0000-4000-8000-000000050001',
    (select (payload #>> '{case,id}')::uuid from task050_case), 3,
    'refundPending'
  ) ->> 'code',
  'no_money_collected',
  'COD not collected cannot simulate a monetary refund'
);

set local role postgres;
delete from public.customer_order_payments payment
where payment.order_id = '95000000-0000-4000-8000-000000050001';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050000', true);
select is(
  public.admin_customer_after_sales_transition_v1(
    '15000000-0000-4000-8000-000000050001',
    (select (payload #>> '{case,id}')::uuid from task050_case), 3,
    'refundPending'
  ) ->> 'code',
  'no_money_collected',
  'missing payment aggregate fails closed before refundPending'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050001","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050001', true);
create temp table task050_review as
select public.customer_review_submit_v1(
  '96000000-0000-4000-8000-000000050001', 5, 'Ottimo prodotto sintetico'
) as payload;
select ok(
  (select payload ->> 'status' from task050_review) = 'ok'
  and (select payload ->> 'moderationStatus' from task050_review) = 'pending',
  'completed order owner creates one pending verified review'
);
select is(
  public.customer_review_submit_v1(
    '96000000-0000-4000-8000-000000050003', 4, 'Non ancora completato'
  ) ->> 'status',
  'not_eligible',
  'non-completed order review is denied'
);
select is(
  public.customer_review_submit_v1(
    '96000000-0000-4000-8000-000000050001', 4, 'Duplicata'
  ) ->> 'status',
  'duplicate',
  'duplicate customer/order-line review is denied'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000050000","role":"authenticated","is_anonymous":false}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000050000', true);
select is(
  public.admin_customer_review_moderate_v1(
    '15000000-0000-4000-8000-000000050001',
    (select (payload ->> 'reviewId')::uuid from task050_review), 1,
    'published', null
  ) ->> 'code',
  'success',
  'authorized Admin publishes a verified review with audit'
);

create temp table task050_review_same_state as
select public.admin_customer_review_moderate_v1(
    '15000000-0000-4000-8000-000000050001',
    (select (payload ->> 'reviewId')::uuid from task050_review), 2,
    'published', null
  ) as payload;
set local role postgres;
select ok(
  (select payload #>> '{idempotent}' from task050_review_same_state) = 'true'
  and (select count(*) from public.customer_product_review_events event
    where event.review_id = (select (payload ->> 'reviewId')::uuid from task050_review)) = 2,
  'same-state moderation is idempotent and creates no duplicate event or audit'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select ok(
  public.storefront_product_reviews_v1(
    'commerce-journey-fixture',
    '55000000-0000-4000-8000-000000050001', null, null, 20
  ) #>> '{publishedCount}' = '1'
  and public.storefront_product_reviews_v1(
    'commerce-journey-fixture',
    '55000000-0000-4000-8000-000000050001', null, null, 20
  ) #>> '{averageRating}' = '5.00',
  'public product review aggregate is server-maintained from published reviews only'
);
select ok(
  public.storefront_search_suggestions_v1(
    'commerce-journey-fixture', 'café', 10
  ) #>> '{items,0,value}' = 'Café Andes'
  and public.storefront_search_suggestions_v1(
    'commerce-journey-fixture', 'inventado', 10
  ) -> 'items' = '[]'::jsonb,
  'search assist returns only real published product/category/brand suggestions'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select is(
  public.service_customer_after_sales_refund_ack_v1(
    (select customer_case.id from public.customer_service_cases customer_case
      where customer_case.user_id = '00000000-0000-4000-8000-000000050001'
      order by customer_case.submitted_at desc limit 1),
    repeat('a', 64), null
  ) ->> 'status',
  'transition_denied',
  'refund ACK cannot bypass the case lifecycle or payment aggregate'
);

set local role postgres;
select ok(
  not exists (
    select 1 from public.customer_notification_events notification_event
    where notification_event.safe_arguments::text ~* '(\\+56912345678|Av\\. Sintética|-33\\.431|-70\\.609)'
  ),
  'notification ledger contains no phone, address line or coordinates'
);

select * from finish();
rollback;
