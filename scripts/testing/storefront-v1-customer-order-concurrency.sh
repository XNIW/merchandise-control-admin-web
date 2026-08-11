#!/usr/bin/env bash
set -euo pipefail

order_db_url="${STOREFRONT_ORDER_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
order_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-customer-order.XXXXXX")"
order_cleanup_required=0

order_cleanup() {
  if [[ "${order_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${order_db_url}" <<'SQL' >/dev/null 2>&1 || true
delete from public.customer_order_mutations
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_order_outbox
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_order_status_events
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_order_items
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_orders
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_checkout_mutations
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_checkout_quotes
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_reservation_hold_mutations
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_reservation_holds
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_cart_mutations
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_cart_items
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.customer_carts
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.storefront_fulfillment_slots
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.storefront_pickup_points
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.storefront_product_publications
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.storefront_categories
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.storefront_settings
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.inventory_products
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.inventory_categories
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from public.shops
where shop_id = '17000000-0000-4000-8000-000000027101';
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000027100',
  '00000000-0000-4000-8000-000000027101'
);
SQL
  fi
  rm -rf -- "${order_tmp_dir}"
}
trap order_cleanup EXIT

order_database_authority="${order_db_url#*://}"
order_database_authority="${order_database_authority##*@}"
order_database_host_port="${order_database_authority%%[/?]*}"
if [[ "${order_database_host_port}" == \[* ]]; then
  order_database_host="${order_database_host_port%%]:*}]"
else
  order_database_host="${order_database_host_port%%:*}"
fi
if [[ "${order_database_host}" != "127.0.0.1" && \
  "${order_database_host}" != "localhost" && \
  "${order_database_host}" != "[::1]" ]]; then
  order_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_ORDER_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_ORDER" || \
    ! "${order_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${order_db_url}" != *"postgres.${order_staging_ref}:"* ]]; then
    printf 'Customer-order concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

order_cleanup_required=1
psql -X -q -v ON_ERROR_STOP=1 --dbname="${order_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000027100',
    'authenticated', 'authenticated', 'task027-concurrency-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000027101',
    'authenticated', 'authenticated', 'task027-concurrency-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '17000000-0000-4000-8000-000000027101',
  'SF27C', 'Customer order concurrency fixture', 'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '37000000-0000-4000-8000-000000027101',
  '00000000-0000-4000-8000-000000027100',
  '17000000-0000-4000-8000-000000027101',
  'Order concurrency', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '27000000-0000-4000-8000-000000027101',
  '00000000-0000-4000-8000-000000027100',
  '17000000-0000-4000-8000-000000027101',
  'SF27-7101', 'Order concurrency product',
  '37000000-0000-4000-8000-000000027101', 1100, 5, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
) values (
  '17000000-0000-4000-8000-000000027101',
  'customer-order-concurrency', true, true, false, false, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '47000000-0000-4000-8000-000000027101',
  '17000000-0000-4000-8000-000000027101',
  '37000000-0000-4000-8000-000000027101',
  'order-concurrency', 'Order concurrency', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '57000000-0000-4000-8000-000000027101',
  '17000000-0000-4000-8000-000000027101',
  '27000000-0000-4000-8000-000000027101',
  'published', 'Producto pedido concurrente',
  '47000000-0000-4000-8000-000000027101',
  1100, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '67000000-0000-4000-8000-000000027101',
  '17000000-0000-4000-8000-000000027101',
  'Retiro concurrente', 'Av. Prueba 271', 'Ñuñoa', 'Metropolitana', true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '77000000-0000-4000-8000-000000027101',
  '17000000-0000-4000-8000-000000027101',
  'pickup', '67000000-0000-4000-8000-000000027101',
  'Retiro concurrente', now() + interval '1 hour', now() + interval '3 hours',
  1, true
);

begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000027101","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000027101',
  true
);
select public.customer_cart_mutate_v1(
  'customer-order-concurrency',
  'set',
  '57000000-0000-4000-8000-000000027101',
  1,
  0,
  '97000000-0000-4000-8000-000000027101'
);
select public.customer_checkout_quote_create_v1(
  'customer-order-concurrency',
  1,
  'pickup',
  null,
  '67000000-0000-4000-8000-000000027101',
  '77000000-0000-4000-8000-000000027101',
  '97000000-0000-4000-8000-000000027102'
);
set local role postgres;
select public.customer_checkout_quote_confirm_v1(
  (
    select id
    from public.customer_checkout_quotes
    where user_id = '00000000-0000-4000-8000-000000027101'
      and shop_id = '17000000-0000-4000-8000-000000027101'
  ),
  1,
  '97000000-0000-4000-8000-000000027103'
);
commit;
SQL

order_quote_id="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${order_db_url}" <<'SQL'
select id
from public.customer_checkout_quotes
where user_id = '00000000-0000-4000-8000-000000027101'
  and shop_id = '17000000-0000-4000-8000-000000027101';
SQL
)"
if [[ ! "${order_quote_id}" =~ ^[0-9a-f-]{36}$ ]]; then
  printf 'Customer-order concurrency fixture did not produce one quote.\n' >&2
  exit 1
fi

order_run_create() {
  local delay_seconds="$1"
  local output_path="$2"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${order_db_url}" \
    --set=delay_seconds="${delay_seconds}" \
    --set=quote_id="${order_quote_id}" >"${output_path}" 2>&1 <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000027101","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000027101',
  true
);
select concat_ws(
  '|',
  result.payload ->> 'status',
  result.payload ->> 'orderId',
  result.payload ->> 'idempotent'
)
from (
  select public.customer_order_create_v1(
    :'quote_id'::uuid,
    2,
    '97000000-0000-4000-8000-000000027104'
  ) as payload
) result;
select pg_catalog.pg_sleep(:delay_seconds);
commit;
SQL
}

order_run_create 1 "${order_tmp_dir}/session-a.log" &
order_pid_a=$!
sleep 0.2
order_run_create 0 "${order_tmp_dir}/session-b.log" &
order_pid_b=$!

order_status=0
wait "${order_pid_a}" || order_status=1
wait "${order_pid_b}" || order_status=1
if [[ "${order_status}" -ne 0 ]]; then
  sed -n '1,80p' "${order_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${order_tmp_dir}/session-b.log" >&2
  exit 1
fi

order_ok_count="$(
  grep -h -E -c '^ok\|[0-9a-f-]{36}\|(true|false)$' \
    "${order_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
order_unique_ids="$(
  grep -h -E '^ok\|[0-9a-f-]{36}\|(true|false)$' \
    "${order_tmp_dir}"/session-*.log |
    cut -d '|' -f 2 | sort -u | wc -l | tr -d ' '
)"
order_fresh_count="$(
  grep -h -E -c '^ok\|[0-9a-f-]{36}\|false$' \
    "${order_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
order_replay_count="$(
  grep -h -E -c '^ok\|[0-9a-f-]{36}\|true$' \
    "${order_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
if [[ "${order_ok_count}" -ne 2 || "${order_unique_ids}" -ne 1 || \
  "${order_fresh_count}" -ne 1 || "${order_replay_count}" -ne 1 ]]; then
  sed -n '1,80p' "${order_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${order_tmp_dir}/session-b.log" >&2
  exit 1
fi

order_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${order_db_url}" <<'SQL'
select case when
  (
    select count(*) = 1
    from public.customer_orders customer_order
    where customer_order.shop_id = '17000000-0000-4000-8000-000000027101'
      and customer_order.status = 'confirmed'
  )
  and (
    select count(*) = 1
    from public.customer_order_items item
    where item.shop_id = '17000000-0000-4000-8000-000000027101'
  )
  and (
    select count(*) = 1
    from public.customer_order_status_events event
    where event.shop_id = '17000000-0000-4000-8000-000000027101'
  )
  and (
    select count(*) = 1
    from public.customer_order_outbox outbox
    where outbox.shop_id = '17000000-0000-4000-8000-000000027101'
      and outbox.payload ->> 'fiscalStatus' = 'not_created'
  )
  and (
    select count(*) = 1
    from public.customer_order_mutations mutation
    where mutation.shop_id = '17000000-0000-4000-8000-000000027101'
  )
  and (
    select quote.status = 'consumed'
    from public.customer_checkout_quotes quote
    where quote.shop_id = '17000000-0000-4000-8000-000000027101'
  )
  and (
    select stock_quantity = 5
    from public.inventory_products product
    where product.id = '27000000-0000-4000-8000-000000027101'
  )
  and app_private.storefront_reservation_active_quantity_v1(
    '27000000-0000-4000-8000-000000027101', statement_timestamp()
  ) = 1
then 'PASS' else 'FAIL' end;
SQL
)"

if [[ "${order_assertion}" != "PASS" ]]; then
  printf 'Customer-order concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Customer-order concurrency: two simultaneous retries, one order/item/event/outbox/mutation, one idempotent replay, stock unchanged, fiscal sale not created, PASS.\n'
