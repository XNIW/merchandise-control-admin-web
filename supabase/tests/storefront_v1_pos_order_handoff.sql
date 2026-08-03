begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

select has_table(
  'public',
  'customer_order_pos_receipts',
  'TASK030_CASE_01 durable POS order receipts exist'
);

select ok(
  (
    select class.relrowsecurity and class.relforcerowsecurity
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'customer_order_pos_receipts'
  ),
  'TASK030_CASE_02 POS receipts have enabled and forced RLS'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'customer_order_pos_receipts'
  ),
  0::bigint,
  'TASK030_CASE_03 receipt ledger exposes no row policy'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.pos_customer_order_claim_v1(uuid,uuid,uuid,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_customer_order_claim_v1(uuid,uuid,uuid,uuid,integer)',
    'EXECUTE'
  ),
  'TASK030_CASE_04 claim RPC is not executable by customer roles'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.pos_customer_order_ack_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.pos_customer_order_ack_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,uuid,uuid)',
    'EXECUTE'
  ),
  'TASK030_CASE_05 ack RPC is not executable by customer roles'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.pos_customer_order_claim_v1(uuid,uuid,uuid,uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.pos_customer_order_ack_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,uuid,uuid)',
    'EXECUTE'
  ),
  'TASK030_CASE_06 only the service boundary can execute claim and ack'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class class on class.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'customer_order_pos_receipts'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and lower(attribute.attname) = any(array[
        'device_token', 'session_token', 'customer_email', 'customer_address',
        'owner_user_id', 'source_product_id', 'raw_request_body'
      ])
  ),
  'TASK030_CASE_07 receipt schema persists no credential or customer payload'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_class class on class.oid = trigger.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'customer_order_pos_receipts'
      and not trigger.tgisinternal
      and (trigger.tgtype & 8) = 8
      and (trigger.tgtype & 16) = 16
  ),
  'TASK030_CASE_08 receipts are append-only'
);

insert into auth.users(
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000030001',
  'authenticated',
  'authenticated',
  'task030-owner@example.invalid',
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
);

insert into public.profiles(profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000030001',
  'TASK-030 synthetic owner',
  'active'
) on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;

insert into public.shops(
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values (
  '10000000-0000-4000-8000-000000030001',
  'TASK030QA',
  'TASK-030 synthetic shop',
  'active',
  '00000000-0000-4000-8000-000000030001'
);

insert into public.shop_members(profile_id, shop_id, role_key, membership_status)
values (
  '00000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'shop_owner',
  'active'
);

insert into public.staff_accounts(
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status
) values (
  '20000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'POS030',
  'TASK-030 synthetic POS operator',
  'pos_admin',
  'active',
  'password',
  'argon2id:task030qa:redacted-fixture',
  clock_timestamp(),
  clock_timestamp() + interval '4 hours',
  false,
  7,
  'active'
);

insert into public.inventory_categories(id, owner_user_id, shop_id, name, updated_at)
values (
  '30000000-0000-4000-8000-000000030001',
  '00000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'TASK-030 category',
  statement_timestamp()
);

insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '40000000-0000-4000-8000-000000030001',
  '00000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'TASK030-0001',
  'Producto público TASK-030',
  '30000000-0000-4000-8000-000000030001',
  1900,
  4,
  statement_timestamp()
);

insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
) values (
  '10000000-0000-4000-8000-000000030001',
  'task030-shop',
  true,
  true,
  false,
  false,
  false
);

insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '50000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  '30000000-0000-4000-8000-000000030001',
  'task030-category',
  'TASK-030 category',
  'published'
);

insert into public.storefront_product_publications(
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '60000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  '40000000-0000-4000-8000-000000030001',
  'published',
  'Producto público TASK-030',
  '50000000-0000-4000-8000-000000030001',
  1900,
  true,
  false,
  false,
  'available',
  statement_timestamp()
);

insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '70000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'Retiro TASK-030',
  'PRIVATE STREET MUST NOT LEAK',
  'Ñuñoa',
  'Metropolitana',
  true
);

insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '80000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'pickup',
  '70000000-0000-4000-8000-000000030001',
  'Retiro TASK-030',
  statement_timestamp() + interval '1 hour',
  statement_timestamp() + interval '3 hours',
  4,
  true
);

insert into public.customer_orders(
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
) values (
  '90000000-0000-4000-8000-000000030001',
  'MC-00000000000000003001',
  '00000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  1,
  'accepted',
  2,
  'pickup',
  '80000000-0000-4000-8000-000000030001',
  'CLP',
  1900,
  0,
  1900,
  jsonb_build_object(
    'mode', 'pickup',
    'privateAddress', 'PRIVATE STREET MUST NOT LEAK',
    'pickupPoint', jsonb_build_object(
      'publicName', 'Retiro TASK-030',
      'commune', 'Ñuñoa',
      'region', 'Metropolitana',
      'addressLine1', 'PRIVATE STREET MUST NOT LEAK'
    ),
    'slot', jsonb_build_object(
      'label', 'Retiro TASK-030',
      'startsAt', statement_timestamp() + interval '1 hour',
      'endsAt', statement_timestamp() + interval '3 hours'
    )
  ),
  statement_timestamp() - interval '2 minutes',
  statement_timestamp() - interval '1 minute'
);

insert into public.customer_order_items(
  order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, line_total_clp, created_at
) values (
  '90000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  1,
  '60000000-0000-4000-8000-000000030001',
  '40000000-0000-4000-8000-000000030001',
  'Producto público TASK-030',
  1,
  1900,
  1900,
  statement_timestamp() - interval '2 minutes'
);

insert into public.customer_order_status_events(
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values
  (
    '90000000-0000-4000-8000-000000030001',
    '10000000-0000-4000-8000-000000030001',
    1,
    'confirmed',
    'system',
    '{"source":"customer_checkout_quote"}'::jsonb,
    statement_timestamp() - interval '2 minutes'
  ),
  (
    '90000000-0000-4000-8000-000000030001',
    '10000000-0000-4000-8000-000000030001',
    2,
    'accepted',
    'admin',
    '{"source":"storefront_admin"}'::jsonb,
    statement_timestamp() - interval '1 minute'
  );

insert into public.customer_order_outbox(
  id, order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
) values
  (
    'a0000000-0000-4000-8000-000000030001',
    '90000000-0000-4000-8000-000000030001',
    '10000000-0000-4000-8000-000000030001',
    'customer_order.confirmed.v1',
    'b0000000-0000-4000-8000-000000030001',
    '{"apiVersion":"customer-order-outbox.v1","eventType":"customer_order.confirmed.v1","statusVersion":1,"sourceProductId":"40000000-0000-4000-8000-000000030001"}'::jsonb,
    'pending',
    statement_timestamp() - interval '2 minutes',
    statement_timestamp() - interval '2 minutes',
    statement_timestamp() - interval '2 minutes'
  ),
  (
    'a0000000-0000-4000-8000-000000030002',
    '90000000-0000-4000-8000-000000030001',
    '10000000-0000-4000-8000-000000030001',
    'customer_order.accepted.v1',
    'b0000000-0000-4000-8000-000000030002',
    '{"apiVersion":"customer-order-outbox.v1","eventType":"customer_order.accepted.v1","statusVersion":2,"correlationId":"c0000000-0000-4000-8000-000000030001"}'::jsonb,
    'pending',
    statement_timestamp() - interval '1 minute',
    statement_timestamp() - interval '1 minute',
    statement_timestamp() - interval '1 minute'
  );

create temporary table task030_runtime(
  shop_device_id uuid,
  pos_session_id uuid,
  handoff_id uuid,
  lease_token uuid
) on commit drop;
create temporary table task030_results(
  label text primary key,
  result jsonb not null
) on commit drop;
grant select, insert, update on task030_runtime, task030_results to service_role;

set local role service_role;
with login as (
  select public.pos_runtime_first_login_commit_v2(
    '10000000-0000-4000-8000-000000030001',
    '20000000-0000-4000-8000-000000030001',
    7,
    'task030qa:device',
    'TASK-030 synthetic device',
    '1.0-fixture',
    'sha256:' || repeat('1', 64),
    15552000,
    'sha256:' || repeat('2', 64),
    43200,
    jsonb_build_object('source', 'TASK-030', 'app_version_present', true)
  ) result
)
insert into task030_runtime(shop_device_id, pos_session_id)
select (result->>'shopDeviceId')::uuid, (result->>'posSessionId')::uuid
from login;

insert into task030_results(label, result)
select 'wrong_shop', public.pos_customer_order_claim_v1(
  '10000000-0000-4000-8000-000000030099',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  10
)
from task030_runtime runtime;

insert into task030_results(label, result)
select 'claim', public.pos_customer_order_claim_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  10
)
from task030_runtime runtime;

update task030_runtime runtime
set handoff_id = (result.result#>>'{handoffs,0,handoffId}')::uuid,
    lease_token = (result.result#>>'{handoffs,0,leaseToken}')::uuid
from task030_results result
where result.label = 'claim';

insert into task030_results(label, result)
select 'claim_replay', public.pos_customer_order_claim_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  10
)
from task030_runtime runtime;
reset role;

select is(
  (select result->>'code' from task030_results where label = 'wrong_shop'),
  'denied',
  'TASK030_CASE_09 cross-shop claim is denied uniformly'
);

select is(
  (select result->>'code' from task030_results where label = 'claim'),
  'success',
  'TASK030_CASE_10 trusted runtime can claim'
);

select is(
  (select jsonb_array_length(result->'handoffs') from task030_results where label = 'claim'),
  1,
  'TASK030_CASE_11 confirmed is withheld and accepted is handed off once'
);

select is(
  (select result#>>'{handoffs,0,schemaVersion}' from task030_results where label = 'claim'),
  'pos-customer-order-handoff-v1',
  'TASK030_CASE_12 handoff envelope is versioned'
);

select is(
  (select result#>>'{handoffs,0,eventType}' from task030_results where label = 'claim'),
  'customer_order.accepted.v1',
  'TASK030_CASE_13 only the accepted operational event is returned'
);

select is(
  (select result#>>'{handoffs,0,order,items,0,publicName}' from task030_results where label = 'claim'),
  'Producto público TASK-030',
  'TASK030_CASE_14 public item snapshot is returned'
);

select ok(
  (select result#>'{handoffs,0,order,items,0}' from task030_results where label = 'claim')
    ?& array['linePosition', 'publicName', 'quantity', 'unitPriceClp', 'lineTotalClp']
  and not (
    (select result#>'{handoffs,0,order,items,0}' from task030_results where label = 'claim')
      ?| array['publicationId', 'sourceProductId', 'ownerUserId', 'supplier']
  ),
  'TASK030_CASE_15 item envelope is an explicit public allow-list'
);

select ok(
  position(
    'PRIVATE STREET MUST NOT LEAK'
    in (select result::text from task030_results where label = 'claim')
  ) = 0
  and position(
    '40000000-0000-4000-8000-000000030001'
    in (select result::text from task030_results where label = 'claim')
  ) = 0,
  'TASK030_CASE_16 payload excludes private address and internal product ID'
);

select is(
  (
    select jsonb_object_keys(result#>'{handoffs,0,order,fulfillment,pickupPoint}')
    from task030_results
    where label = 'claim'
    order by 1
    limit 1
  ),
  'commune',
  'TASK030_CASE_17 fulfillment snapshot is reconstructed instead of copied'
);

select is(
  (select status from public.customer_order_outbox where id = 'a0000000-0000-4000-8000-000000030002'),
  'leased',
  'TASK030_CASE_18 claim persists a lease'
);

select ok(
  (
    select leased_by_device_id = runtime.shop_device_id
      and lease_session_id = runtime.pos_session_id
      and outbox.lease_token = runtime.lease_token
      and outbox.lease_expires_at > clock_timestamp()
    from public.customer_order_outbox outbox
    cross join task030_runtime runtime
    where outbox.id = 'a0000000-0000-4000-8000-000000030002'
  ),
  'TASK030_CASE_19 lease is bound to device, session and opaque token'
);

select is(
  (select result#>>'{handoffs,0,leaseToken}' from task030_results where label = 'claim_replay'),
  (select lease_token::text from task030_runtime),
  'TASK030_CASE_20 ambiguous claim replay returns the same live lease'
);

select is(
  (select attempt_count from public.customer_order_outbox where id = 'a0000000-0000-4000-8000-000000030002'),
  1,
  'TASK030_CASE_21 live lease replay does not consume another attempt'
);

set local role service_role;
insert into task030_results(label, result)
select 'bad_lease', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  'd0000000-0000-4000-8000-000000030099',
  'accepted',
  2,
  'e0000000-0000-4000-8000-000000030099',
  null
)
from task030_runtime runtime;

insert into task030_results(label, result)
select 'accepted', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  runtime.lease_token,
  'accepted',
  2,
  'e0000000-0000-4000-8000-000000030001',
  null
)
from task030_runtime runtime;

insert into task030_results(label, result)
select 'accepted_replay', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  runtime.lease_token,
  'accepted',
  2,
  'e0000000-0000-4000-8000-000000030001',
  null
)
from task030_runtime runtime;

insert into task030_results(label, result)
select 'accepted_conflict', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  runtime.lease_token,
  'accepted',
  3,
  'e0000000-0000-4000-8000-000000030001',
  null
)
from task030_runtime runtime;
reset role;

select is(
  (select result->>'code' from task030_results where label = 'bad_lease'),
  'lease_conflict',
  'TASK030_CASE_22 wrong lease token cannot acknowledge'
);

select is(
  (select result->>'code' from task030_results where label = 'accepted'),
  'success',
  'TASK030_CASE_23 accepted acknowledgement succeeds'
);

select is(
  (select status from public.customer_order_outbox where id = 'a0000000-0000-4000-8000-000000030002'),
  'delivered',
  'TASK030_CASE_24 accepted outbox is delivered'
);

select is(
  (select status from public.customer_order_outbox where id = 'a0000000-0000-4000-8000-000000030001'),
  'delivered',
  'TASK030_CASE_25 accepted handoff closes the withheld confirmed envelope'
);

select is(
  (select count(*)::integer from public.customer_order_pos_receipts where outcome = 'accepted'),
  1,
  'TASK030_CASE_26 accepted replay creates one durable receipt'
);

select is(
  (select result->>'idempotent' from task030_results where label = 'accepted_replay'),
  'true',
  'TASK030_CASE_27 lost accepted response is replayable'
);

select is(
  (select result->>'code' from task030_results where label = 'accepted_conflict'),
  'idempotency_conflict',
  'TASK030_CASE_28 changed payload under one ack key fails closed'
);

select is(
  (select count(*)::integer from public.pos_sales),
  0,
  'TASK030_CASE_29 receiving an order creates no fiscal sale'
);

set local role service_role;
insert into task030_results(label, result)
select 'prepared', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  runtime.lease_token,
  'prepared',
  2,
  'e0000000-0000-4000-8000-000000030002',
  null
)
from task030_runtime runtime;
reset role;

select is(
  (select result->>'orderStatus' from task030_results where label = 'prepared'),
  'ready',
  'TASK030_CASE_30 prepared maps through preparing to ready'
);

select is(
  (
    select status || ':' || status_version::text
    from public.customer_orders
    where id = '90000000-0000-4000-8000-000000030001'
  ),
  'ready:4',
  'TASK030_CASE_31 prepared commits a monotonic two-stage status version'
);

select is(
  (
    select string_agg(status || ':' || event_version::text, ',' order by event_version)
    from public.customer_order_status_events
    where order_id = '90000000-0000-4000-8000-000000030001'
      and actor_kind = 'pos'
  ),
  'preparing:3,ready:4',
  'TASK030_CASE_32 POS preparation preserves both timeline states'
);

set local role service_role;
insert into task030_results(label, result)
select 'pos_origin_claim', public.pos_customer_order_claim_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  10
)
from task030_runtime runtime;
reset role;

select is(
  (select jsonb_array_length(result->'handoffs') from task030_results where label = 'pos_origin_claim'),
  0,
  'TASK030_CASE_33 POS-origin status outbox does not loop back to the POS'
);

set local role service_role;
insert into task030_results(label, result)
select 'fiscal_mismatch', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  runtime.lease_token,
  'completed',
  4,
  'e0000000-0000-4000-8000-000000030003',
  'f0000000-0000-4000-8000-000000030099'
)
from task030_runtime runtime;
reset role;

select is(
  (select result->>'code' from task030_results where label = 'fiscal_mismatch'),
  'fiscal_sale_mismatch',
  'TASK030_CASE_34 unknown sale cannot be linked to an order'
);

insert into public.pos_sales_sync_batches(
  pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id, staff_id,
  pos_session_id, client_batch_id, idempotency_key, payload_hash,
  sale_count, line_count, status
)
select
  'f0000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'TASK030QA',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  'task030-batch',
  'task030-batch-idempotency',
  'sha256:' || repeat('a', 64),
  1,
  1,
  'accepted'
from task030_runtime runtime;

insert into public.pos_sales(
  pos_sale_id, pos_sales_sync_batch_id, shop_id, shop_code, shop_device_id,
  staff_id, pos_session_id, client_sale_id, idempotency_key, payload_hash,
  occurred_at, currency, subtotal, discount_total, tax_total, total, status,
  source_schema_version, business_kind, gross_amount_clp,
  discount_amount_clp, tax_amount_clp, net_amount_clp, paid_amount_clp,
  change_amount_clp, fiscal_status, stock_sync_status
)
select
  'f0000000-0000-4000-8000-000000030002',
  'f0000000-0000-4000-8000-000000030001',
  '10000000-0000-4000-8000-000000030001',
  'TASK030QA',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  'task030-sale',
  'task030-sale-idempotency',
  'sha256:' || repeat('b', 64),
  statement_timestamp(),
  'CLP',
  1900,
  0,
  0,
  1900,
  'accepted',
  'pos-sales-ledger-v2',
  'sale',
  1900,
  0,
  0,
  1900,
  1900,
  0,
  'printed_local_pdf',
  'applied'
from task030_runtime runtime;

set local role service_role;
insert into task030_results(label, result)
select 'completed', public.pos_customer_order_ack_v1(
  '10000000-0000-4000-8000-000000030001',
  runtime.shop_device_id,
  '20000000-0000-4000-8000-000000030001',
  runtime.pos_session_id,
  runtime.handoff_id,
  runtime.lease_token,
  'completed',
  4,
  'e0000000-0000-4000-8000-000000030004',
  'f0000000-0000-4000-8000-000000030002'
)
from task030_runtime runtime;
reset role;

select is(
  (select result->>'code' from task030_results where label = 'completed'),
  'success',
  'TASK030_CASE_35 completion can link an existing same-device sale'
);

select is(
  (select result->>'fiscalStatus' from task030_results where label = 'completed'),
  'linked',
  'TASK030_CASE_36 response distinguishes a linked fiscal sale'
);

select is(
  (
    select status || ':' || status_version::text
    from public.customer_orders
    where id = '90000000-0000-4000-8000-000000030001'
  ),
  'completed:5',
  'TASK030_CASE_37 completion advances the authoritative order state once'
);

select is(
  (
    select pos_sale_id::text
    from public.customer_order_pos_receipts
    where outcome = 'completed'
  ),
  'f0000000-0000-4000-8000-000000030002',
  'TASK030_CASE_38 fiscal reference is stored only after the sale exists'
);

select is(
  (select count(*)::integer from public.pos_sales),
  1,
  'TASK030_CASE_39 operational outcomes never synthesize an additional sale'
);

select ok(
  not exists (
    select 1
    from public.customer_order_pos_receipts receipt
    where receipt.outcome <> 'completed' and receipt.pos_sale_id is not null
  ),
  'TASK030_CASE_40 only completion can carry a fiscal reference'
);

select * from finish();

rollback;
