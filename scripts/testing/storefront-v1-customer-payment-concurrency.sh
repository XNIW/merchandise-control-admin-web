#!/usr/bin/env bash
set -euo pipefail

payment_db_url="${STOREFRONT_PAYMENT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
payment_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-customer-payment.XXXXXX")"
payment_cleanup_required=0

payment_cleanup_fixture() {
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${payment_db_url}" <<'SQL'
begin;
set local session_replication_role = replica;
delete from public.customer_payment_mutations
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_payment_events
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_payment_attempts
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_order_payments
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_order_mutations
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_order_outbox
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_order_status_events
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_order_items
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_orders
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_checkout_mutations
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_checkout_quotes
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_reservation_hold_mutations
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_reservation_holds
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_cart_mutations
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_cart_items
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.customer_carts
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.storefront_payment_settings
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.storefront_fulfillment_slots
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.storefront_pickup_points
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.storefront_product_publications
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.storefront_categories
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.storefront_settings
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.inventory_products
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.inventory_categories
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from public.shops
where shop_id = '17000000-0000-4000-8000-000000032101';
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000032100',
  '00000000-0000-4000-8000-000000032101'
);
commit;
SQL
}

payment_cleanup() {
  if [[ "${payment_cleanup_required}" -eq 1 ]]; then
    payment_cleanup_fixture >/dev/null 2>&1 || true
  fi
  rm -rf -- "${payment_tmp_dir}"
}
trap payment_cleanup EXIT

payment_database_authority="${payment_db_url#*://}"
payment_database_authority="${payment_database_authority##*@}"
payment_database_host_port="${payment_database_authority%%[/?]*}"
if [[ "${payment_database_host_port}" == \[* ]]; then
  payment_database_host="${payment_database_host_port%%]:*}]"
else
  payment_database_host="${payment_database_host_port%%:*}"
fi
if [[ "${payment_database_host}" != "127.0.0.1" && \
  "${payment_database_host}" != "localhost" && \
  "${payment_database_host}" != "[::1]" ]]; then
  payment_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_PAYMENT_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_PAYMENT" || \
    ! "${payment_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${payment_db_url}" != *"postgres.${payment_staging_ref}:"* ]]; then
    printf 'Customer-payment concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

payment_cleanup_required=1
payment_cleanup_fixture >/dev/null
psql -X -q -v ON_ERROR_STOP=1 --dbname="${payment_db_url}" <<'SQL' >/dev/null
insert into auth.users(
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000032100',
    'authenticated', 'authenticated', 'task032-concurrency-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000032101',
    'authenticated', 'authenticated', 'task032-concurrency-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops(shop_id, shop_code, shop_name, shop_status)
values (
  '17000000-0000-4000-8000-000000032101',
  'SF32C', 'Customer payment concurrency fixture', 'active'
);

insert into public.inventory_categories(
  id, owner_user_id, shop_id, name, updated_at
) values (
  '37000000-0000-4000-8000-000000032101',
  '00000000-0000-4000-8000-000000032100',
  '17000000-0000-4000-8000-000000032101',
  'Payment concurrency', now()
);

insert into public.inventory_products(
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '27000000-0000-4000-8000-000000032101',
  '00000000-0000-4000-8000-000000032100',
  '17000000-0000-4000-8000-000000032101',
  'SF32-7101', 'Payment concurrency product',
  '37000000-0000-4000-8000-000000032101', 1100, 5, now()
);

insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
) values (
  '17000000-0000-4000-8000-000000032101',
  'customer-payment-concurrency', true, true, false, false, false
);

insert into public.storefront_payment_settings(
  shop_id, pay_at_pickup_enabled, cash_on_delivery_enabled,
  online_payment_enabled, online_provider
) values (
  '17000000-0000-4000-8000-000000032101', true, false, false, 'none'
);

insert into public.storefront_categories(
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '47000000-0000-4000-8000-000000032101',
  '17000000-0000-4000-8000-000000032101',
  '37000000-0000-4000-8000-000000032101',
  'payment-concurrency', 'Payment concurrency', 'published'
);

insert into public.storefront_product_publications(
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '57000000-0000-4000-8000-000000032101',
  '17000000-0000-4000-8000-000000032101',
  '27000000-0000-4000-8000-000000032101',
  'published', 'Producto pago concurrente',
  '47000000-0000-4000-8000-000000032101',
  1100, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points(
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '67000000-0000-4000-8000-000000032101',
  '17000000-0000-4000-8000-000000032101',
  'Retiro concurrente', 'Av. Prueba 321', 'Ñuñoa', 'Metropolitana', true
);

insert into public.storefront_fulfillment_slots(
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '77000000-0000-4000-8000-000000032101',
  '17000000-0000-4000-8000-000000032101',
  'pickup', '67000000-0000-4000-8000-000000032101',
  'Retiro concurrente', now() + interval '1 hour', now() + interval '3 hours',
  1, true
);

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032101","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032101',
  true
);
select public.customer_cart_mutate_v1(
  'customer-payment-concurrency', 'set',
  '57000000-0000-4000-8000-000000032101', 1, 0,
  '97000000-0000-4000-8000-000000032101'
);
select public.customer_checkout_quote_create_v1(
  'customer-payment-concurrency', 1, 'pickup', null,
  '67000000-0000-4000-8000-000000032101',
  '77000000-0000-4000-8000-000000032101',
  '97000000-0000-4000-8000-000000032102'
);
set local role postgres;
select public.customer_checkout_quote_confirm_v1(
  (
    select id
    from public.customer_checkout_quotes
    where user_id = '00000000-0000-4000-8000-000000032101'
      and shop_id = '17000000-0000-4000-8000-000000032101'
  ),
  1,
  '97000000-0000-4000-8000-000000032103'
);
commit;
SQL

payment_quote_id="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${payment_db_url}" <<'SQL'
select id
from public.customer_checkout_quotes
where user_id = '00000000-0000-4000-8000-000000032101'
  and shop_id = '17000000-0000-4000-8000-000000032101';
SQL
)"
if [[ ! "${payment_quote_id}" =~ ^[0-9a-f-]{36}$ ]]; then
  printf 'Customer-payment concurrency fixture did not produce one quote.\n' >&2
  exit 1
fi

payment_run_create() {
  local delay_seconds="$1"
  local output_path="$2"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${payment_db_url}" \
    --set=delay_seconds="${delay_seconds}" \
    --set=quote_id="${payment_quote_id}" >"${output_path}" 2>&1 <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000032101","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000032101',
  true
);
select concat_ws(
  '|',
  result.payload ->> 'status',
  result.payload ->> 'orderId',
  result.payload #>> '{payment,method}',
  result.payload ->> 'idempotent'
)
from (
  select public.customer_order_create_v2(
    :'quote_id'::uuid,
    2,
    'pay_at_pickup',
    '97000000-0000-4000-8000-000000032104'
  ) as payload
) result;
select pg_catalog.pg_sleep(:delay_seconds);
commit;
SQL
}

payment_run_create 1 "${payment_tmp_dir}/session-a.log" &
payment_pid_a=$!
sleep 0.2
payment_run_create 0 "${payment_tmp_dir}/session-b.log" &
payment_pid_b=$!

payment_status=0
wait "${payment_pid_a}" || payment_status=1
wait "${payment_pid_b}" || payment_status=1
if [[ "${payment_status}" -ne 0 ]]; then
  sed -n '1,80p' "${payment_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${payment_tmp_dir}/session-b.log" >&2
  exit 1
fi

payment_ok_count="$(
  grep -h -E -c '^ok\|[0-9a-f-]{36}\|pay_at_pickup\|(true|false)$' \
    "${payment_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
payment_unique_ids="$(
  grep -h -E '^ok\|[0-9a-f-]{36}\|pay_at_pickup\|(true|false)$' \
    "${payment_tmp_dir}"/session-*.log |
    cut -d '|' -f 2 | sort -u | wc -l | tr -d ' '
)"
payment_fresh_count="$(
  grep -h -E -c '^ok\|[0-9a-f-]{36}\|pay_at_pickup\|false$' \
    "${payment_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
payment_replay_count="$(
  grep -h -E -c '^ok\|[0-9a-f-]{36}\|pay_at_pickup\|true$' \
    "${payment_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
if [[ "${payment_ok_count}" -ne 2 || "${payment_unique_ids}" -ne 1 || \
  "${payment_fresh_count}" -ne 1 || "${payment_replay_count}" -ne 1 ]]; then
  sed -n '1,80p' "${payment_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${payment_tmp_dir}/session-b.log" >&2
  exit 1
fi

payment_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${payment_db_url}" <<'SQL'
select case when
  (
    select count(*) = 1
    from public.customer_orders customer_order
    where customer_order.shop_id = '17000000-0000-4000-8000-000000032101'
  )
  and (
    select count(*) = 1
    from public.customer_order_payments payment
    where payment.shop_id = '17000000-0000-4000-8000-000000032101'
      and payment.method = 'pay_at_pickup'
      and payment.amount_clp = 1100
      and payment.provider_key = 'none'
  )
  and (
    select count(*) = 1
    from public.customer_payment_attempts attempt
    where attempt.shop_id = '17000000-0000-4000-8000-000000032101'
  )
  and (
    select count(*) = 1
    from public.customer_payment_events event
    where event.shop_id = '17000000-0000-4000-8000-000000032101'
      and event.event_type = 'payment_due'
  )
  and (
    select count(*) = 1
    from public.customer_payment_mutations mutation
    where mutation.shop_id = '17000000-0000-4000-8000-000000032101'
  )
  and (
    select count(*) = 0
    from public.pos_sales sale
    where sale.shop_id = '17000000-0000-4000-8000-000000032101'
  )
then 'PASS' else 'FAIL' end;
SQL
)"

if [[ "${payment_assertion}" != "PASS" ]]; then
  printf 'Customer-payment concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Customer-payment concurrency: two simultaneous retries, one order/payment/attempt/event/mutation, one idempotent replay, no fiscal sale, PASS.\n'
