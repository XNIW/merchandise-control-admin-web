#!/usr/bin/env bash
set -euo pipefail

pos_order_db_url="${STOREFRONT_POS_ORDER_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
if [[ "${pos_order_db_url}" != "postgresql://postgres:postgres@127.0.0.1:54322/postgres" ]]; then
  printf 'TASK-030 concurrency harness is intentionally local-only.\n' >&2
  exit 1
fi

pos_order_shop_id="10000000-0000-4000-8000-000000030201"
pos_order_owner_id="00000000-0000-4000-8000-000000030201"
pos_order_staff_id="20000000-0000-4000-8000-000000030201"

pos_order_cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${pos_order_db_url}" <<'SQL' >/dev/null 2>&1 || true
begin;
alter table public.customer_order_pos_receipts disable trigger user;
delete from public.customer_order_pos_receipts
where shop_id = '10000000-0000-4000-8000-000000030201';
alter table public.customer_order_pos_receipts enable trigger user;
delete from public.customer_orders
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.storefront_fulfillment_slots
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.storefront_pickup_points
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.storefront_product_publications
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.storefront_categories
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.storefront_settings
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.pos_sessions
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.pos_device_credentials
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.shop_devices
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.staff_role_permissions
where shop_id = '10000000-0000-4000-8000-000000030201';
select set_config('app.platform_allow_test_audit_delete', 'on', true);
delete from public.audit_logs
where shop_id = '10000000-0000-4000-8000-000000030201';
select set_config('app.platform_allow_test_audit_delete', 'off', true);
delete from public.staff_accounts
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.inventory_products
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.inventory_categories
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.shop_members
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from public.shops
where shop_id = '10000000-0000-4000-8000-000000030201';
delete from auth.users
where id = '00000000-0000-4000-8000-000000030201';
commit;
SQL
}
trap pos_order_cleanup EXIT
pos_order_cleanup

psql -X -q -v ON_ERROR_STOP=1 --dbname="${pos_order_db_url}" <<'SQL' >/dev/null
begin;
insert into auth.users(
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000030201',
  'authenticated', 'authenticated', 'task030-race@example.invalid',
  '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
  clock_timestamp(), clock_timestamp()
);
insert into public.profiles(profile_id, display_name, profile_status)
values (
  '00000000-0000-4000-8000-000000030201',
  'TASK-030 race owner', 'active'
) on conflict (profile_id) do update
set display_name = excluded.display_name,
    profile_status = excluded.profile_status;
insert into public.shops(
  shop_id, shop_code, shop_name, shop_status, created_by_profile_id
) values (
  '10000000-0000-4000-8000-000000030201',
  'TASK030RACE', 'TASK-030 race shop', 'active',
  '00000000-0000-4000-8000-000000030201'
);
insert into public.shop_members(profile_id, shop_id, role_key, membership_status)
values (
  '00000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'shop_owner', 'active'
);
insert into public.staff_accounts(
  staff_id, shop_id, staff_code, display_name, role_key, status,
  credential_kind, credential_hash, credential_updated_at,
  credential_expires_at, must_change_credential, credential_version,
  credential_status
) values (
  '20000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'POS030RACE', 'TASK-030 race operator', 'pos_admin', 'active',
  'password', 'argon2id:task030race:redacted-fixture', clock_timestamp(),
  clock_timestamp() + interval '4 hours', false, 7, 'active'
);
insert into public.inventory_categories(id, owner_user_id, shop_id, name, updated_at)
values (
  '30000000-0000-4000-8000-000000030201',
  '00000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'TASK-030 race category', statement_timestamp()
);
insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '40000000-0000-4000-8000-000000030201',
  '00000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'TASK030-RACE', 'Producto carrera TASK-030',
  '30000000-0000-4000-8000-000000030201', 1900, 2,
  statement_timestamp()
);
insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
) values (
  '10000000-0000-4000-8000-000000030201',
  'task030-race', true, true, false, false, false
);
insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '50000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  '30000000-0000-4000-8000-000000030201',
  'task030-race', 'TASK-030 race category', 'published'
);
insert into public.storefront_product_publications(
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '60000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  '40000000-0000-4000-8000-000000030201',
  'published', 'Producto carrera TASK-030',
  '50000000-0000-4000-8000-000000030201',
  1900, true, false, false, 'available', statement_timestamp()
);
insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '70000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'Retiro carrera TASK-030', 'Av. Test 302', 'Ñuñoa',
  'Metropolitana', true
);
insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '80000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'pickup', '70000000-0000-4000-8000-000000030201',
  'Retiro carrera TASK-030', statement_timestamp() + interval '1 hour',
  statement_timestamp() + interval '3 hours', 2, true
);
insert into public.customer_orders(
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
) values (
  '90000000-0000-4000-8000-000000030201',
  'MC-00000000000000003201',
  '00000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  1, 'accepted', 2, 'pickup',
  '80000000-0000-4000-8000-000000030201', 'CLP',
  1900, 0, 1900,
  '{"mode":"pickup","pickupPoint":{"publicName":"Retiro carrera TASK-030","commune":"Ñuñoa","region":"Metropolitana"},"slot":{"label":"Retiro carrera TASK-030"}}'::jsonb,
  statement_timestamp() - interval '2 minutes',
  statement_timestamp() - interval '1 minute'
);
insert into public.customer_order_items(
  order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, line_total_clp, created_at
) values (
  '90000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201', 1,
  '60000000-0000-4000-8000-000000030201',
  '40000000-0000-4000-8000-000000030201',
  'Producto carrera TASK-030', 1, 1900, 1900,
  statement_timestamp() - interval '2 minutes'
);
insert into public.customer_order_status_events(
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values
  (
    '90000000-0000-4000-8000-000000030201',
    '10000000-0000-4000-8000-000000030201',
    1, 'confirmed', 'system', '{}', statement_timestamp() - interval '2 minutes'
  ),
  (
    '90000000-0000-4000-8000-000000030201',
    '10000000-0000-4000-8000-000000030201',
    2, 'accepted', 'admin', '{}', statement_timestamp() - interval '1 minute'
  );
insert into public.customer_order_outbox(
  id, order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
) values (
  'a0000000-0000-4000-8000-000000030201',
  '90000000-0000-4000-8000-000000030201',
  '10000000-0000-4000-8000-000000030201',
  'customer_order.accepted.v1',
  'b0000000-0000-4000-8000-000000030201',
  '{"apiVersion":"customer-order-outbox.v1","eventType":"customer_order.accepted.v1","statusVersion":2}'::jsonb,
  'pending', statement_timestamp() - interval '1 minute',
  statement_timestamp() - interval '1 minute',
  statement_timestamp() - interval '1 minute'
);
commit;
SQL

pos_order_runtime_a="$({
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${pos_order_db_url}" <<SQL
set role service_role;
select (result->>'shopDeviceId') || '|' || (result->>'posSessionId')
from (
  select public.pos_runtime_first_login_commit_v2(
    '${pos_order_shop_id}', '${pos_order_staff_id}', 7,
    'task030race:device:a', 'TASK-030 race device A', '1.0-fixture',
    'sha256:' || repeat('1', 64), 15552000,
    'sha256:' || repeat('2', 64), 43200,
    '{"source":"TASK-030","app_version_present":true}'::jsonb
  ) result
) login;
SQL
} | tail -n 1)"
pos_order_runtime_b="$({
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${pos_order_db_url}" <<SQL
set role service_role;
select (result->>'shopDeviceId') || '|' || (result->>'posSessionId')
from (
  select public.pos_runtime_first_login_commit_v2(
    '${pos_order_shop_id}', '${pos_order_staff_id}', 7,
    'task030race:device:b', 'TASK-030 race device B', '1.0-fixture',
    'sha256:' || repeat('3', 64), 15552000,
    'sha256:' || repeat('4', 64), 43200,
    '{"source":"TASK-030","app_version_present":true}'::jsonb
  ) result
) login;
SQL
} | tail -n 1)"

pos_order_device_a="${pos_order_runtime_a%%|*}"
pos_order_session_a="${pos_order_runtime_a##*|}"
pos_order_device_b="${pos_order_runtime_b%%|*}"
pos_order_session_b="${pos_order_runtime_b##*|}"

psql -X -q -v ON_ERROR_STOP=1 --dbname="${pos_order_db_url}" \
  -v device_a="${pos_order_device_a}" \
  -v session_a="${pos_order_session_a}" \
  -v device_b="${pos_order_device_b}" \
  -v session_b="${pos_order_session_b}" <<'SQL'
create extension if not exists dblink with schema extensions;

create temporary table task030_race_runtime(
  label text primary key,
  shop_device_id uuid not null,
  pos_session_id uuid not null
);
insert into task030_race_runtime values
  ('a', :'device_a'::uuid, :'session_a'::uuid),
  ('b', :'device_b'::uuid, :'session_b'::uuid);

select extensions.dblink_connect(
  'task030_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'task030_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_send_query(
  'task030_a',
  format(
    'select public.pos_customer_order_claim_v1(%L::uuid,%L::uuid,%L::uuid,%L::uuid,1)::text',
    '10000000-0000-4000-8000-000000030201', :'device_a',
    '20000000-0000-4000-8000-000000030201', :'session_a'
  )
);
select extensions.dblink_send_query(
  'task030_b',
  format(
    'select public.pos_customer_order_claim_v1(%L::uuid,%L::uuid,%L::uuid,%L::uuid,1)::text',
    '10000000-0000-4000-8000-000000030201', :'device_b',
    '20000000-0000-4000-8000-000000030201', :'session_b'
  )
);

create temporary table task030_race_results(
  label text primary key,
  result jsonb not null
);
insert into task030_race_results
select 'a', result::jsonb
from extensions.dblink_get_result('task030_a') as response(result text);
insert into task030_race_results
select 'b', result::jsonb
from extensions.dblink_get_result('task030_b') as response(result text);

do $$
declare
  v_claimed integer;
  v_empty integer;
begin
  select count(*) filter (where jsonb_array_length(result->'handoffs') = 1),
         count(*) filter (where jsonb_array_length(result->'handoffs') = 0)
  into v_claimed, v_empty
  from task030_race_results;
  if v_claimed <> 1 or v_empty <> 1 then
    raise exception 'TASK030_RACE_EXPECTED_ONE_WINNER: claimed %, empty %',
      v_claimed, v_empty;
  end if;
end;
$$;

create temporary table task030_winner as
select
  result.label,
  runtime.shop_device_id,
  runtime.pos_session_id,
  (result.result#>>'{handoffs,0,handoffId}')::uuid as handoff_id,
  (result.result#>>'{handoffs,0,leaseToken}')::uuid as lease_token
from task030_race_results result
join task030_race_runtime runtime using (label)
where jsonb_array_length(result.result->'handoffs') = 1;

update public.customer_order_outbox
set lease_expires_at = clock_timestamp() - interval '1 second'
where id = (select handoff_id from task030_winner);

insert into task030_race_results(label, result)
select
  'reclaim',
  public.pos_customer_order_claim_v1(
    '10000000-0000-4000-8000-000000030201',
    loser.shop_device_id,
    '20000000-0000-4000-8000-000000030201',
    loser.pos_session_id,
    1
  )
from task030_race_runtime loser
where loser.label <> (select label from task030_winner);

do $$
begin
  if (select jsonb_array_length(result->'handoffs')
      from task030_race_results where label = 'reclaim') <> 1 then
    raise exception 'TASK030_RECLAIM_EXPECTED_ONE_HANDOFF';
  end if;
  if (select (result#>>'{handoffs,0,attemptCount}')::integer
      from task030_race_results where label = 'reclaim') <> 2 then
    raise exception 'TASK030_RECLAIM_EXPECTED_SECOND_ATTEMPT';
  end if;
  if (select result#>>'{handoffs,0,leaseToken}'
      from task030_race_results where label = 'reclaim') =
     (select lease_token::text from task030_winner) then
    raise exception 'TASK030_RECLAIM_EXPECTED_NEW_TOKEN';
  end if;
end;
$$;

insert into task030_race_results(label, result)
select
  'stale_ack',
  public.pos_customer_order_ack_v1(
    '10000000-0000-4000-8000-000000030201',
    winner.shop_device_id,
    '20000000-0000-4000-8000-000000030201',
    winner.pos_session_id,
    winner.handoff_id,
    winner.lease_token,
    'accepted',
    2,
    'e0000000-0000-4000-8000-000000030201',
    null
  )
from task030_winner winner;

insert into task030_race_results(label, result)
select
  'accepted',
  public.pos_customer_order_ack_v1(
    '10000000-0000-4000-8000-000000030201',
    loser.shop_device_id,
    '20000000-0000-4000-8000-000000030201',
    loser.pos_session_id,
    (reclaim.result#>>'{handoffs,0,handoffId}')::uuid,
    (reclaim.result#>>'{handoffs,0,leaseToken}')::uuid,
    'accepted',
    2,
    'e0000000-0000-4000-8000-000000030202',
    null
  )
from task030_race_runtime loser
cross join task030_race_results reclaim
where loser.label <> (select label from task030_winner)
  and reclaim.label = 'reclaim';

insert into task030_race_results(label, result)
select
  'accepted_replay',
  public.pos_customer_order_ack_v1(
    '10000000-0000-4000-8000-000000030201',
    loser.shop_device_id,
    '20000000-0000-4000-8000-000000030201',
    loser.pos_session_id,
    (reclaim.result#>>'{handoffs,0,handoffId}')::uuid,
    (reclaim.result#>>'{handoffs,0,leaseToken}')::uuid,
    'accepted',
    2,
    'e0000000-0000-4000-8000-000000030202',
    null
  )
from task030_race_runtime loser
cross join task030_race_results reclaim
where loser.label <> (select label from task030_winner)
  and reclaim.label = 'reclaim';

do $$
begin
  if (select result->>'code' from task030_race_results where label = 'stale_ack')
      <> 'lease_conflict' then
    raise exception 'TASK030_STALE_ACK_MUST_FAIL';
  end if;
  if (select result->>'code' from task030_race_results where label = 'accepted')
      <> 'success' then
    raise exception 'TASK030_RECLAIMED_ACK_MUST_SUCCEED';
  end if;
  if (select result->>'idempotent'
      from task030_race_results where label = 'accepted_replay') <> 'true' then
    raise exception 'TASK030_ACK_REPLAY_MUST_BE_IDEMPOTENT';
  end if;
  if (select count(*) from public.customer_order_pos_receipts
      where shop_id = '10000000-0000-4000-8000-000000030201') <> 1 then
    raise exception 'TASK030_ACK_REPLAY_CREATED_DUPLICATE_RECEIPT';
  end if;
  if (select count(*) from public.pos_sales
      where shop_id = '10000000-0000-4000-8000-000000030201') <> 0 then
    raise exception 'TASK030_HANDOFF_CREATED_FISCAL_SALE';
  end if;
end;
$$;

select jsonb_build_object(
  'status', 'PASS',
  'winner', (select label from task030_winner),
  'initialClaims', 2,
  'claimed', 1,
  'empty', 1,
  'reclaimedAttempt', (
    select (result#>>'{handoffs,0,attemptCount}')::integer
    from task030_race_results where label = 'reclaim'
  ),
  'staleAck', (
    select result->>'code' from task030_race_results where label = 'stale_ack'
  ),
  'ackReplayIdempotent', (
    select (result->>'idempotent')::boolean
    from task030_race_results where label = 'accepted_replay'
  ),
  'receiptCount', (
    select count(*) from public.customer_order_pos_receipts
    where shop_id = '10000000-0000-4000-8000-000000030201'
  ),
  'fiscalSaleCount', (
    select count(*) from public.pos_sales
    where shop_id = '10000000-0000-4000-8000-000000030201'
  )
) as task030_concurrency_result;

select extensions.dblink_disconnect('task030_a');
select extensions.dblink_disconnect('task030_b');
SQL
