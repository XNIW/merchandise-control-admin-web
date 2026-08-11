#!/usr/bin/env bash
set -euo pipefail

notification_db_url="${STOREFRONT_ORDER_NOTIFICATION_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
notification_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-order-notification.XXXXXX")"

notification_database_host="$({
  STOREFRONT_ORDER_NOTIFICATION_DB_URL="${notification_db_url}" node -e '
    const url = new URL(process.env.STOREFRONT_ORDER_NOTIFICATION_DB_URL);
    process.stdout.write(url.hostname);
  '
})"
if [[ "${notification_database_host}" != "127.0.0.1" && \
  "${notification_database_host}" != "localhost" && \
  "${notification_database_host}" != "[::1]" ]]; then
  printf 'Order-notification concurrency harness refuses a non-local database.\n' >&2
  exit 1
fi

notification_cleanup_db() {
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${notification_db_url}" <<'SQL' >/dev/null 2>&1 || true
begin;
delete from public.customer_orders
where shop_id = '17000000-0000-4000-8000-000000031201';
delete from public.customer_devices
where user_id = '00000000-0000-4000-8000-000000031201';
delete from public.storefront_fulfillment_slots
where shop_id = '17000000-0000-4000-8000-000000031201';
delete from public.storefront_pickup_points
where shop_id = '17000000-0000-4000-8000-000000031201';
delete from public.storefront_settings
where shop_id = '17000000-0000-4000-8000-000000031201';
delete from public.shops
where shop_id = '17000000-0000-4000-8000-000000031201';
delete from auth.users
where id = '00000000-0000-4000-8000-000000031201';
commit;
SQL
}

notification_cleanup() {
  notification_cleanup_db
  rm -rf -- "${notification_tmp_dir}"
}
trap notification_cleanup EXIT
notification_cleanup_db

psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${notification_db_url}" <<'SQL' >"${notification_tmp_dir}/result.json"
begin;

insert into auth.users(
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000031201',
  'authenticated', 'authenticated', 'task031-race@example.invalid',
  '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
  clock_timestamp(), clock_timestamp()
);

insert into public.shops(shop_id, shop_code, shop_name, shop_status)
values (
  '17000000-0000-4000-8000-000000031201',
  'SF31RACE', 'TASK-031 race fixture', 'active'
);

insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image,
  customer_order_push_enabled
) values (
  '17000000-0000-4000-8000-000000031201',
  'notification-race', true, true, false, false, false, true
);

insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '67000000-0000-4000-8000-000000031201',
  '17000000-0000-4000-8000-000000031201',
  'Retiro TASK-031', 'Av. Prueba 312', 'Ñuñoa', 'Metropolitana', true
);

insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '77000000-0000-4000-8000-000000031201',
  '17000000-0000-4000-8000-000000031201',
  'pickup', '67000000-0000-4000-8000-000000031201',
  'Retiro TASK-031', clock_timestamp() + interval '1 hour',
  clock_timestamp() + interval '3 hours', 10, true
);

insert into public.customer_orders(
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
) values (
  '88000000-0000-4000-8000-000000031201',
  'MC-ABCDEF01234567893120',
  '00000000-0000-4000-8000-000000031201',
  '17000000-0000-4000-8000-000000031201',
  1, 'confirmed', 1, 'pickup',
  '77000000-0000-4000-8000-000000031201', 'CLP',
  1200, 0, 1200, '{"mode":"pickup","publicLabel":"Retiro TASK-031"}'::jsonb,
  clock_timestamp(), clock_timestamp()
);

insert into public.customer_devices(
  id, user_id, installation_id, platform, locale,
  consent_status, permission_status, push_token, push_token_hash,
  consented_at, token_updated_at, last_seen_at, expires_at,
  registration_version, last_operation, last_idempotency_key,
  last_request_hash
) values (
  '81000000-0000-4000-8000-000000031201',
  '00000000-0000-4000-8000-000000031201',
  '91000000-0000-4000-8000-000000031201',
  'android', 'es-CL', 'granted', 'authorized',
  'task031-race-routing-token-000000000001',
  extensions.digest('task031-race-routing-token-000000000001', 'sha256'),
  clock_timestamp(), clock_timestamp(), clock_timestamp(),
  clock_timestamp() + interval '30 days', 1, 'register',
  'a1000000-0000-4000-8000-000000031201',
  extensions.digest('task031-race-request-1', 'sha256')
);

insert into public.customer_order_status_events(
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values (
  '89000000-0000-4000-8000-000000031201',
  '88000000-0000-4000-8000-000000031201',
  '17000000-0000-4000-8000-000000031201',
  1, 'confirmed', 'system', '{}', clock_timestamp()
);

commit;
begin;

create extension if not exists dblink with schema extensions;
select extensions.dblink_connect(
  'task031_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'task031_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_send_query(
  'task031_a',
  $query$
    with configured as materialized (
      select set_config('request.jwt.claims', '{"role":"service_role"}', false)
    )
    select public.customer_notification_claim_v1(
      1, 30, 'd1000000-0000-4000-8000-000000031201'
    )::text from configured
  $query$
);
select extensions.dblink_send_query(
  'task031_b',
  $query$
    with configured as materialized (
      select set_config('request.jwt.claims', '{"role":"service_role"}', false)
    )
    select public.customer_notification_claim_v1(
      1, 30, 'd1000000-0000-4000-8000-000000031202'
    )::text from configured
  $query$
);

create temporary table task031_race_results(
  label text primary key,
  result jsonb not null
);
insert into task031_race_results
select 'a', result::jsonb
from extensions.dblink_get_result('task031_a') as response(result text);
insert into task031_race_results
select 'b', result::jsonb
from extensions.dblink_get_result('task031_b') as response(result text);

do $$
declare
  v_claimed integer;
  v_empty integer;
begin
  select count(*) filter (where jsonb_array_length(result->'deliveries') = 1),
         count(*) filter (where jsonb_array_length(result->'deliveries') = 0)
  into v_claimed, v_empty
  from task031_race_results;
  if v_claimed <> 1 or v_empty <> 1 then
    raise exception 'TASK031_RACE_EXPECTED_ONE_WINNER: claimed %, empty %',
      v_claimed, v_empty;
  end if;
end;
$$;

create temporary table task031_winner as
select
  label,
  (result#>>'{deliveries,0,deliveryId}')::uuid as delivery_id,
  (result#>>'{deliveries,0,leaseToken}')::uuid as lease_token,
  (result#>>'{deliveries,0,destinationGeneration}')::bigint
    as destination_generation
from task031_race_results
where jsonb_array_length(result->'deliveries') = 1;

update public.customer_notification_deliveries
set lease_expires_at = clock_timestamp() - interval '1 second'
where id = (select delivery_id from task031_winner);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into task031_race_results(label, result)
values (
  'reclaim',
  public.customer_notification_claim_v1(
    1, 30, 'd1000000-0000-4000-8000-000000031203'
  )
);

do $$
begin
  if (select jsonb_array_length(result->'deliveries')
      from task031_race_results where label = 'reclaim') <> 1 then
    raise exception 'TASK031_RECLAIM_EXPECTED_ONE_DELIVERY';
  end if;
  if (select (result#>>'{deliveries,0,attempt}')::integer
      from task031_race_results where label = 'reclaim') <> 2 then
    raise exception 'TASK031_RECLAIM_EXPECTED_SECOND_ATTEMPT';
  end if;
  if (select result#>>'{deliveries,0,leaseToken}'
      from task031_race_results where label = 'reclaim') =
     (select lease_token::text from task031_winner) then
    raise exception 'TASK031_RECLAIM_EXPECTED_NEW_LEASE_TOKEN';
  end if;
end;
$$;

insert into task031_race_results(label, result)
select 'stale-ack', public.customer_notification_ack_v1(
  winner.delivery_id,
  winner.lease_token,
  winner.destination_generation,
  'delivered',
  'a2000000-0000-4000-8000-000000031201',
  'provider-stale-task031',
  null
)
from task031_winner winner;

insert into task031_race_results(label, result)
select 'delivered', public.customer_notification_ack_v1(
  (reclaim.result#>>'{deliveries,0,deliveryId}')::uuid,
  (reclaim.result#>>'{deliveries,0,leaseToken}')::uuid,
  (reclaim.result#>>'{deliveries,0,destinationGeneration}')::bigint,
  'delivered',
  'a2000000-0000-4000-8000-000000031202',
  'provider-success-task031',
  null
)
from task031_race_results reclaim
where reclaim.label = 'reclaim';

insert into task031_race_results(label, result)
select 'delivered-replay', public.customer_notification_ack_v1(
  (reclaim.result#>>'{deliveries,0,deliveryId}')::uuid,
  (reclaim.result#>>'{deliveries,0,leaseToken}')::uuid,
  (reclaim.result#>>'{deliveries,0,destinationGeneration}')::bigint,
  'delivered',
  'a2000000-0000-4000-8000-000000031202',
  'provider-success-task031',
  null
)
from task031_race_results reclaim
where reclaim.label = 'reclaim';

insert into public.customer_order_status_events(
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values (
  '89000000-0000-4000-8000-000000031202',
  '88000000-0000-4000-8000-000000031201',
  '17000000-0000-4000-8000-000000031201',
  2, 'preparing', 'admin', '{}', clock_timestamp()
);
update public.customer_devices
set push_token = 'task031-race-routing-token-000000000002',
    push_token_hash = extensions.digest(
      'task031-race-routing-token-000000000002', 'sha256'
    ),
    token_updated_at = clock_timestamp(),
    registration_version = 2,
    last_idempotency_key = 'a1000000-0000-4000-8000-000000031202',
    last_request_hash = extensions.digest('task031-race-request-2', 'sha256')
where id = '81000000-0000-4000-8000-000000031201';

insert into task031_race_results(label, result)
values (
  'generation-fence',
  public.customer_notification_claim_v1(
    10, 30, 'd1000000-0000-4000-8000-000000031204'
  )
);

update public.storefront_settings
set customer_order_push_enabled = false
where shop_id = '17000000-0000-4000-8000-000000031201';
insert into public.customer_order_status_events(
  id, order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values (
  '89000000-0000-4000-8000-000000031203',
  '88000000-0000-4000-8000-000000031201',
  '17000000-0000-4000-8000-000000031201',
  3, 'ready', 'admin', '{}', clock_timestamp()
);
insert into task031_race_results(label, result)
values (
  'flag-off',
  public.customer_notification_claim_v1(
    10, 30, 'd1000000-0000-4000-8000-000000031205'
  )
);

do $$
begin
  if (select result->>'status' from task031_race_results
      where label = 'stale-ack') <> 'lease_conflict' then
    raise exception 'TASK031_STALE_ACK_MUST_FAIL';
  end if;
  if (select result->>'status' from task031_race_results
      where label = 'delivered') <> 'success' then
    raise exception 'TASK031_CURRENT_ACK_MUST_SUCCEED';
  end if;
  if (select (result->>'idempotent')::boolean from task031_race_results
      where label = 'delivered-replay') is not true then
    raise exception 'TASK031_ACK_REPLAY_MUST_BE_IDEMPOTENT';
  end if;
  if (select jsonb_array_length(result->'deliveries')
      from task031_race_results where label = 'generation-fence') <> 0 then
    raise exception 'TASK031_STALE_GENERATION_MUST_NOT_BE_CLAIMED';
  end if;
  if not exists (
    select 1
    from public.customer_notification_deliveries delivery
    join public.customer_notification_events event on event.id = delivery.event_id
    where event.source_event_id = '89000000-0000-4000-8000-000000031202'
      and delivery.status = 'suppressed'
      and delivery.last_error_code = 'destination_ineligible'
  ) then
    raise exception 'TASK031_STALE_GENERATION_MUST_BE_SUPPRESSED';
  end if;
  if (select jsonb_array_length(result->'deliveries')
      from task031_race_results where label = 'flag-off') <> 0 then
    raise exception 'TASK031_FLAG_OFF_MUST_NOT_DISPATCH';
  end if;
  if (select count(*) from public.customer_notification_receipts) <> 1 then
    raise exception 'TASK031_ACK_REPLAY_CREATED_DUPLICATE_RECEIPT';
  end if;
  if exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name in (
        'customer_notification_events',
        'customer_notification_deliveries',
        'customer_notification_receipts'
      )
      and column_row.column_name = 'push_token'
  ) then
    raise exception 'TASK031_LEDGER_MUST_NOT_PERSIST_RAW_TOKEN';
  end if;
end;
$$;

select jsonb_build_object(
  'status', 'PASS',
  'concurrentDispatchers', 2,
  'initialClaims', 1,
  'initialEmpty', 1,
  'reclaimedAttempt', (
    select (result#>>'{deliveries,0,attempt}')::integer
    from task031_race_results where label = 'reclaim'
  ),
  'staleAck', (
    select result->>'status' from task031_race_results where label = 'stale-ack'
  ),
  'ackReplayIdempotent', (
    select (result->>'idempotent')::boolean
    from task031_race_results where label = 'delivered-replay'
  ),
  'generationFence', 'suppressed',
  'featureFlagOff', 'no_dispatch',
  'receiptCount', (select count(*) from public.customer_notification_receipts)
);

select extensions.dblink_disconnect('task031_a');
select extensions.dblink_disconnect('task031_b');
rollback;
SQL

if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"PASS"' "${notification_tmp_dir}/result.json"; then
  sed -n '1,120p' "${notification_tmp_dir}/result.json" >&2
  exit 1
fi

grep -E '"status"[[:space:]]*:[[:space:]]*"PASS"' "${notification_tmp_dir}/result.json"
