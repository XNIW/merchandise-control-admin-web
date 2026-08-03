#!/usr/bin/env bash
set -euo pipefail

history_db_url="${STOREFRONT_ORDER_HISTORY_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
history_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-order-cancel.XXXXXX")"
history_cleanup_required=0

history_cleanup() {
  if [[ "${history_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${history_db_url}" <<'SQL' >/dev/null 2>&1 || true
delete from public.customer_order_mutations
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.customer_order_outbox
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.customer_order_status_events
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.customer_order_items
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.customer_orders
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.storefront_fulfillment_slots
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.storefront_pickup_points
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.storefront_product_publications
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.storefront_categories
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.storefront_settings
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.inventory_products
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.inventory_categories
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from public.shops
where shop_id = '18000000-0000-4000-8000-000000028201';
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000028200',
  '00000000-0000-4000-8000-000000028201'
);
SQL
  fi
  rm -rf -- "${history_tmp_dir}"
}
trap history_cleanup EXIT

history_database_authority="${history_db_url#*://}"
history_database_authority="${history_database_authority##*@}"
history_database_host_port="${history_database_authority%%[/?]*}"
if [[ "${history_database_host_port}" == \[* ]]; then
  history_database_host="${history_database_host_port%%]:*}]"
else
  history_database_host="${history_database_host_port%%:*}"
fi
if [[ "${history_database_host}" != "127.0.0.1" && \
  "${history_database_host}" != "localhost" && \
  "${history_database_host}" != "[::1]" ]]; then
  history_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_ORDER_HISTORY_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_ORDER_HISTORY" || \
    ! "${history_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${history_db_url}" != *"postgres.${history_staging_ref}:"* ]]; then
    printf 'Order-history concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

history_cleanup_required=1
psql -X -q -v ON_ERROR_STOP=1 --dbname="${history_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000028200',
    'authenticated', 'authenticated', 'task028-race-merchant@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000028201',
    'authenticated', 'authenticated', 'task028-race-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '18000000-0000-4000-8000-000000028201',
  'SF28C', 'Order cancel race fixture', 'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '38000000-0000-4000-8000-000000028201',
  '00000000-0000-4000-8000-000000028200',
  '18000000-0000-4000-8000-000000028201',
  'Order cancel race', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '28000000-0000-4000-8000-000000028201',
  '00000000-0000-4000-8000-000000028200',
  '18000000-0000-4000-8000-000000028201',
  'SF28-8201', 'Order cancel race product',
  '38000000-0000-4000-8000-000000028201', 1800, 1, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image,
  customer_order_cancellation_enabled,
  customer_order_cancellation_window_minutes
) values (
  '18000000-0000-4000-8000-000000028201',
  'customer-order-cancel-race', true, true, false, false, false,
  true, 15
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '48000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  '38000000-0000-4000-8000-000000028201',
  'cancel-race', 'Cancel race', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '58000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  '28000000-0000-4000-8000-000000028201',
  'published', 'Producto cancelación concurrente',
  '48000000-0000-4000-8000-000000028201',
  1800, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '68000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  'Retiro carrera', 'Av. Prueba 282', 'Ñuñoa', 'Metropolitana', true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '78000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  'pickup', '68000000-0000-4000-8000-000000028201',
  'Retiro carrera', now() + interval '2 hours', now() + interval '4 hours',
  1, true
);

insert into public.customer_orders (
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
) values (
  '88000000-0000-4000-8000-000000028201',
  'MC-00000000000000002821',
  '00000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  1, 'confirmed', 1, 'pickup',
  '78000000-0000-4000-8000-000000028201', 'CLP',
  1800, 0, 1800,
  '{"mode":"pickup","slot":{"label":"Retiro carrera"}}'::jsonb,
  now() - interval '1 minute', now() - interval '1 minute'
);

insert into public.customer_order_items (
  order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, line_total_clp, created_at
) values (
  '88000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201', 1,
  '58000000-0000-4000-8000-000000028201',
  '28000000-0000-4000-8000-000000028201',
  'Producto cancelación concurrente', 1, 1800, 1800,
  now() - interval '1 minute'
);

insert into public.customer_order_status_events (
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values (
  '88000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  1, 'confirmed', 'system', '{}', now() - interval '1 minute'
);

insert into public.customer_order_outbox (
  order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
) values (
  '88000000-0000-4000-8000-000000028201',
  '18000000-0000-4000-8000-000000028201',
  'customer_order.confirmed.v1',
  '98000000-0000-4000-8000-000000028201',
  '{"documentKind":"customer_order","fiscalStatus":"not_created"}',
  'pending', now(), now(), now()
);

select app_private.storefront_reservation_refresh_availability_v1(
  '28000000-0000-4000-8000-000000028201', now()
);
SQL

history_run_cancel() {
  local delay_seconds="$1"
  local idempotency_key="$2"
  local output_path="$3"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${history_db_url}" \
    --set=delay_seconds="${delay_seconds}" \
    --set=idempotency_key="${idempotency_key}" >"${output_path}" 2>&1 <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000028201","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000028201',
  true
);
select concat_ws(
  '|',
  result.payload ->> 'status',
  coalesce(result.payload ->> 'orderStatus', 'none'),
  coalesce(result.payload ->> 'orderVersion', 'none'),
  result.payload ->> 'idempotent'
)
from (
  select public.customer_order_cancel_v1(
    'customer-order-cancel-race',
    '88000000-0000-4000-8000-000000028201',
    1,
    :'idempotency_key'::uuid
  ) as payload
) result;
select pg_catalog.pg_sleep(:delay_seconds);
commit;
SQL
}

history_run_cancel \
  1 \
  '98000000-0000-4000-8000-000000028202' \
  "${history_tmp_dir}/session-a.log" &
history_pid_a=$!
sleep 0.2
history_run_cancel \
  0 \
  '98000000-0000-4000-8000-000000028203' \
  "${history_tmp_dir}/session-b.log" &
history_pid_b=$!

history_status=0
wait "${history_pid_a}" || history_status=1
wait "${history_pid_b}" || history_status=1
if [[ "${history_status}" -ne 0 ]]; then
  sed -n '1,80p' "${history_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${history_tmp_dir}/session-b.log" >&2
  exit 1
fi

history_fresh_count="$(
  awk '/^ok\|cancelled\|2\|false$/ { count += 1 } END { print count + 0 }' \
    "${history_tmp_dir}"/session-*.log
)"
history_loser_count="$(
  awk '/^not_cancellable\|none\|none\|false$/ { count += 1 } END { print count + 0 }' \
    "${history_tmp_dir}"/session-*.log
)"
if [[ "${history_fresh_count}" -ne 1 || "${history_loser_count}" -ne 1 ]]; then
  sed -n '1,80p' "${history_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${history_tmp_dir}/session-b.log" >&2
  exit 1
fi

history_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${history_db_url}" <<'SQL'
select case when
  (
    select customer_order.status = 'cancelled'
      and customer_order.status_version = 2
    from public.customer_orders customer_order
    where customer_order.id = '88000000-0000-4000-8000-000000028201'
  )
  and (
    select count(*) = 2
    from public.customer_order_status_events event
    where event.order_id = '88000000-0000-4000-8000-000000028201'
  )
  and (
    select count(*) = 1
    from public.customer_order_status_events event
    where event.order_id = '88000000-0000-4000-8000-000000028201'
      and event.status = 'cancelled'
  )
  and (
    select count(*) = 2
    from public.customer_order_outbox outbox
    where outbox.order_id = '88000000-0000-4000-8000-000000028201'
      and outbox.payload ->> 'fiscalStatus' = 'not_created'
  )
  and (
    select count(*) = 1
    from public.customer_order_mutations mutation
    where mutation.order_id = '88000000-0000-4000-8000-000000028201'
      and mutation.operation = 'cancel'
  )
  and (
    select stock_quantity = 1
    from public.inventory_products product
    where product.id = '28000000-0000-4000-8000-000000028201'
  )
  and app_private.storefront_reservation_active_quantity_v1(
    '28000000-0000-4000-8000-000000028201', statement_timestamp()
  ) = 0
  and jsonb_array_length(
    public.storefront_fulfillment_options_v1(
      'customer-order-cancel-race'
    ) -> 'slots'
  ) = 1
then 'PASS' else 'FAIL' end;
SQL
)"

if [[ "${history_assertion}" != "PASS" ]]; then
  printf 'Order-history cancellation concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Order-history cancellation concurrency: one transition/event/outbox/mutation, loser fail-closed, ATP and slot released once, stock unchanged, fiscal sale not created, PASS.\n'
