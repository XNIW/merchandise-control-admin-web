#!/usr/bin/env bash
set -euo pipefail

admin_order_db_url="${STOREFRONT_ADMIN_ORDER_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
admin_order_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-admin-order.XXXXXX")"
admin_order_cleanup_required=0

admin_order_cleanup() {
  if [[ "${admin_order_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${admin_order_db_url}" <<'SQL' >/dev/null 2>&1 || true
begin;
alter table public.audit_logs disable trigger user;
delete from public.audit_logs
where shop_id = '19000000-0000-4000-8000-000000029201';
alter table public.audit_logs enable trigger user;
delete from public.customer_order_admin_mutations
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.customer_order_outbox
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.customer_order_status_events
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.customer_order_items
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.customer_orders
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.storefront_fulfillment_slots
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.storefront_pickup_points
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.storefront_product_publications
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.storefront_categories
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.storefront_settings
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.inventory_products
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.inventory_categories
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.staff_role_permissions
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.shop_members
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from public.shops
where shop_id = '19000000-0000-4000-8000-000000029201';
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000029200',
  '00000000-0000-4000-8000-000000029201'
);
commit;
SQL
  fi
  rm -rf -- "${admin_order_tmp_dir}"
}
trap admin_order_cleanup EXIT

admin_order_database_authority="${admin_order_db_url#*://}"
admin_order_database_authority="${admin_order_database_authority##*@}"
admin_order_database_host_port="${admin_order_database_authority%%[/?]*}"
if [[ "${admin_order_database_host_port}" == \[* ]]; then
  admin_order_database_host="${admin_order_database_host_port%%]:*}]"
else
  admin_order_database_host="${admin_order_database_host_port%%:*}"
fi
if [[ "${admin_order_database_host}" != "127.0.0.1" && \
  "${admin_order_database_host}" != "localhost" && \
  "${admin_order_database_host}" != "[::1]" ]]; then
  admin_order_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_ADMIN_ORDER_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_ADMIN_ORDER" || \
    ! "${admin_order_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${admin_order_db_url}" != *"postgres.${admin_order_staging_ref}:"* ]]; then
    printf 'Admin-order concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

admin_order_cleanup_required=1
admin_order_cleanup
admin_order_cleanup_required=1
mkdir -p "${admin_order_tmp_dir}"

psql -X -q -v ON_ERROR_STOP=1 --dbname="${admin_order_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000029200',
    'authenticated', 'authenticated', 'task029-race-owner@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000029201',
    'authenticated', 'authenticated', 'task029-race-customer@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '19000000-0000-4000-8000-000000029201',
  'TASK029RACE', 'Admin order race fixture', 'active'
);

insert into public.shop_members (
  shop_id, profile_id, role_key, membership_status
) values (
  '19000000-0000-4000-8000-000000029201',
  '00000000-0000-4000-8000-000000029200',
  'shop_owner', 'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '39000000-0000-4000-8000-000000029201',
  '00000000-0000-4000-8000-000000029200',
  '19000000-0000-4000-8000-000000029201',
  'Admin order race', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '29000000-0000-4000-8000-000000029201',
  '00000000-0000-4000-8000-000000029200',
  '19000000-0000-4000-8000-000000029201',
  'SF29-9201', 'Admin order race product',
  '39000000-0000-4000-8000-000000029201', 1900, 2, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
) values (
  '19000000-0000-4000-8000-000000029201',
  'admin-order-race', true, true, false, false, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '49000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  '39000000-0000-4000-8000-000000029201',
  'admin-order-race', 'Admin order race', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '59000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  '29000000-0000-4000-8000-000000029201',
  'published', 'Producto carrera Admin',
  '49000000-0000-4000-8000-000000029201',
  1900, true, false, false, 'available', now()
);

insert into public.storefront_pickup_points (
  id, shop_id, public_name, address_line_1, commune, region, enabled
) values (
  '69000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  'Retiro carrera Admin', 'Av. Prueba 292', 'Ñuñoa', 'Metropolitana', true
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, pickup_point_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '89000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  'pickup', '69000000-0000-4000-8000-000000029201',
  'Retiro carrera Admin', now() + interval '1 hour', now() + interval '3 hours',
  2, true
);

insert into public.customer_orders (
  id, public_order_code, user_id, shop_id, quote_version, status,
  status_version, fulfillment_mode, slot_id, currency_code,
  subtotal_clp, delivery_fee_clp, total_clp, fulfillment_snapshot,
  placed_at, updated_at
) values (
  '99000000-0000-4000-8000-000000029201',
  'MC-00000000000000002921',
  '00000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  1, 'confirmed', 1, 'pickup',
  '89000000-0000-4000-8000-000000029201', 'CLP',
  1900, 0, 1900,
  '{"mode":"pickup","slot":{"label":"Retiro carrera Admin"}}',
  now() - interval '1 minute', now() - interval '1 minute'
);

insert into public.customer_order_items (
  order_id, shop_id, line_position, publication_id, source_product_id,
  public_name, quantity, unit_price_clp, line_total_clp, created_at
) values (
  '99000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201', 1,
  '59000000-0000-4000-8000-000000029201',
  '29000000-0000-4000-8000-000000029201',
  'Producto carrera Admin', 1, 1900, 1900, now() - interval '1 minute'
);

insert into public.customer_order_status_events (
  order_id, shop_id, event_version, status, actor_kind,
  metadata_redacted, created_at
) values (
  '99000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  1, 'confirmed', 'system', '{}', now() - interval '1 minute'
);

insert into public.customer_order_outbox (
  order_id, shop_id, event_type, idempotency_key, payload,
  status, available_at, created_at, updated_at
) values (
  '99000000-0000-4000-8000-000000029201',
  '19000000-0000-4000-8000-000000029201',
  'customer_order.confirmed.v1',
  'a9000000-0000-4000-8000-000000029201',
  '{"documentKind":"customer_order","fiscalStatus":"not_created"}',
  'pending', now(), now(), now()
);
SQL

admin_order_run_accept() {
  local idempotency_key="$1"
  local correlation_id="$2"
  local hold_seconds="$3"
  local output_path="$4"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${admin_order_db_url}" \
    --set=idempotency_key="${idempotency_key}" \
    --set=correlation_id="${correlation_id}" \
    --set=hold_seconds="${hold_seconds}" >"${output_path}" 2>&1 <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000029200","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000029200',
  true
);
select concat_ws(
  '|',
  result.payload ->> 'code',
  coalesce(result.payload ->> 'order_status', 'none'),
  coalesce(result.payload ->> 'order_status_version', 'none'),
  coalesce(result.payload ->> 'idempotent', 'none')
)
from (
  select public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029201',
    '99000000-0000-4000-8000-000000029201',
    'accept', 1,
    :'idempotency_key'::uuid,
    :'correlation_id'::uuid
  ) as payload
) result;
select pg_catalog.pg_sleep(:hold_seconds);
commit;
SQL
}

admin_order_run_accept \
  'a9000000-0000-4000-8000-000000029202' \
  'b9000000-0000-4000-8000-000000029202' \
  1 \
  "${admin_order_tmp_dir}/session-a.log" &
admin_order_pid_a=$!
sleep 0.2
admin_order_run_accept \
  'a9000000-0000-4000-8000-000000029203' \
  'b9000000-0000-4000-8000-000000029203' \
  0 \
  "${admin_order_tmp_dir}/session-b.log" &
admin_order_pid_b=$!

admin_order_status=0
wait "${admin_order_pid_a}" || admin_order_status=1
wait "${admin_order_pid_b}" || admin_order_status=1
if [[ "${admin_order_status}" -ne 0 ]]; then
  sed -n '1,80p' "${admin_order_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${admin_order_tmp_dir}/session-b.log" >&2
  exit 1
fi

admin_order_winner_count="$(
  awk '/^success\|accepted\|2\|false$/ { count += 1 } END { print count + 0 }' \
    "${admin_order_tmp_dir}"/session-*.log
)"
admin_order_loser_count="$(
  awk '/^version_conflict\|none\|none\|none$/ { count += 1 } END { print count + 0 }' \
    "${admin_order_tmp_dir}"/session-*.log
)"
if [[ "${admin_order_winner_count}" -ne 1 || "${admin_order_loser_count}" -ne 1 ]]; then
  sed -n '1,80p' "${admin_order_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${admin_order_tmp_dir}/session-b.log" >&2
  exit 1
fi

if grep -qx 'success|accepted|2|false' "${admin_order_tmp_dir}/session-a.log"; then
  admin_order_winner_key='a9000000-0000-4000-8000-000000029202'
  admin_order_winner_correlation='b9000000-0000-4000-8000-000000029202'
else
  admin_order_winner_key='a9000000-0000-4000-8000-000000029203'
  admin_order_winner_correlation='b9000000-0000-4000-8000-000000029203'
fi

admin_order_replay_output="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${admin_order_db_url}" \
    --set=idempotency_key="${admin_order_winner_key}" \
    --set=correlation_id="${admin_order_winner_correlation}" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000029200","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000029200',
  true
);
select concat_ws(
  '|', payload ->> 'code', payload ->> 'order_status',
  payload ->> 'order_status_version', payload ->> 'idempotent'
)
from (
  select public.admin_customer_order_transition_v1(
    '19000000-0000-4000-8000-000000029201',
    '99000000-0000-4000-8000-000000029201',
    'accept', 1,
    :'idempotency_key'::uuid,
    :'correlation_id'::uuid
  ) as payload
) replay;
commit;
SQL
)"
admin_order_replay="$(printf '%s\n' "${admin_order_replay_output}" | tail -n 1)"
if [[ "${admin_order_replay}" != "success|accepted|2|true" ]]; then
  printf 'Unexpected replay: %s\n' "${admin_order_replay}" >&2
  exit 1
fi

admin_order_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${admin_order_db_url}" <<'SQL'
select case when
  (
    select status = 'accepted' and status_version = 2
    from public.customer_orders
    where id = '99000000-0000-4000-8000-000000029201'
  )
  and (
    select count(*) = 2
    from public.customer_order_status_events
    where order_id = '99000000-0000-4000-8000-000000029201'
  )
  and (
    select count(*) = 1
    from public.customer_order_admin_mutations
    where order_id = '99000000-0000-4000-8000-000000029201'
  )
  and (
    select count(*) = 1
    from public.audit_logs
    where target_id = '99000000-0000-4000-8000-000000029201'
      and event_key = 'shop.storefront.order.transition.accept.success'
  )
  and (
    select count(*) = 1
    from public.customer_order_outbox
    where order_id = '99000000-0000-4000-8000-000000029201'
      and event_type = 'customer_order.accepted.v1'
      and payload->>'documentKind' = 'customer_order'
      and payload->>'fiscalStatus' = 'not_created'
  )
  and not exists (
    select 1 from public.pos_sales
    where shop_id = '19000000-0000-4000-8000-000000029201'
  )
then 'ok' else 'failed' end;
SQL
)"

if [[ "${admin_order_assertion}" != "ok" ]]; then
  printf 'Admin-order concurrency postcondition failed.\n' >&2
  exit 1
fi

printf 'TASK-029 two operators, one versioned commit, one stale loser, one exact replay, one event/audit/outbox/receipt, zero fiscal sale: PASS\n'
