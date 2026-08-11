#!/usr/bin/env bash
set -euo pipefail

checkout_db_url="${STOREFRONT_CHECKOUT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
checkout_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-checkout-slot.XXXXXX")"
checkout_cleanup_required=0

checkout_cleanup() {
  if [[ "${checkout_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${checkout_db_url}" <<'SQL' >/dev/null 2>&1 || true
delete from public.customer_checkout_mutations
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.customer_checkout_quotes
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.customer_cart_mutations
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.customer_cart_items
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.customer_carts
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.customer_addresses
where user_id in (
  '00000000-0000-4000-8000-000000026101',
  '00000000-0000-4000-8000-000000026102'
);
delete from public.storefront_fulfillment_slots
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.storefront_delivery_zone_communes
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.storefront_delivery_zones
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.storefront_pickup_points
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.storefront_product_publications
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.storefront_categories
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.storefront_settings
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.inventory_products
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.inventory_categories
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from public.shops
where shop_id = '16000000-0000-4000-8000-000000026101';
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000026101',
  '00000000-0000-4000-8000-000000026102'
);
SQL
  fi
  rm -rf -- "${checkout_tmp_dir}"
}
trap checkout_cleanup EXIT

checkout_database_authority="${checkout_db_url#*://}"
checkout_database_authority="${checkout_database_authority##*@}"
checkout_database_host_port="${checkout_database_authority%%[/?]*}"
if [[ "${checkout_database_host_port}" == \[* ]]; then
  checkout_database_host="${checkout_database_host_port%%]:*}]"
else
  checkout_database_host="${checkout_database_host_port%%:*}"
fi
if [[ "${checkout_database_host}" != "127.0.0.1" && \
  "${checkout_database_host}" != "localhost" && \
  "${checkout_database_host}" != "[::1]" ]]; then
  checkout_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_CHECKOUT_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_CHECKOUT" || \
    ! "${checkout_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${checkout_db_url}" != *"postgres.${checkout_staging_ref}:"* ]]; then
    printf 'Checkout concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

psql -X -q -v ON_ERROR_STOP=1 --dbname="${checkout_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026101',
    'authenticated', 'authenticated', 'task026-concurrency-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000026102',
    'authenticated', 'authenticated', 'task026-concurrency-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '16000000-0000-4000-8000-000000026101',
  'SF26C', 'Checkout concurrency fixture', 'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '36000000-0000-4000-8000-000000026101',
  '00000000-0000-4000-8000-000000026101',
  '16000000-0000-4000-8000-000000026101',
  'Checkout concurrency', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '26000000-0000-4000-8000-000000026101',
  '00000000-0000-4000-8000-000000026101',
  '16000000-0000-4000-8000-000000026101',
  'SF26-6101', 'Checkout concurrency product',
  '36000000-0000-4000-8000-000000026101', 1000, 10, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image
) values (
  '16000000-0000-4000-8000-000000026101',
  'checkout-slot-concurrency', true, false, true, false, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '46000000-0000-4000-8000-000000026101',
  '16000000-0000-4000-8000-000000026101',
  '36000000-0000-4000-8000-000000026101',
  'checkout-concurrency', 'Checkout concurrency', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '56000000-0000-4000-8000-000000026101',
  '16000000-0000-4000-8000-000000026101',
  '26000000-0000-4000-8000-000000026101',
  'published', 'Producto checkout concurrente',
  '46000000-0000-4000-8000-000000026101',
  1000, false, true, false, 'available', now()
);

insert into public.storefront_delivery_zones (
  id, shop_id, public_name, region, fee_clp, enabled
) values (
  '66000000-0000-4000-8000-000000026101',
  '16000000-0000-4000-8000-000000026101',
  'Zona única', 'Metropolitana', 500, true
);

insert into public.storefront_delivery_zone_communes (shop_id, zone_id, commune)
values (
  '16000000-0000-4000-8000-000000026101',
  '66000000-0000-4000-8000-000000026101',
  'Ñuñoa'
);

insert into public.storefront_fulfillment_slots (
  id, shop_id, fulfillment_mode, delivery_zone_id, public_label,
  starts_at, ends_at, capacity, enabled
) values (
  '76000000-0000-4000-8000-000000026101',
  '16000000-0000-4000-8000-000000026101',
  'delivery',
  '66000000-0000-4000-8000-000000026101',
  'Último cupo', now() + interval '1 hour', now() + interval '3 hours',
  1, true
);

insert into public.customer_addresses (
  id, user_id, label, recipient_name, address_line_1,
  commune, region, country_code, is_default
) values
  (
    '86000000-0000-4000-8000-000000026101',
    '00000000-0000-4000-8000-000000026101',
    'Casa', 'Cliente A', 'Av. Grecia 101',
    'Ñuñoa', 'Metropolitana', 'CL', true
  ),
  (
    '86000000-0000-4000-8000-000000026102',
    '00000000-0000-4000-8000-000000026102',
    'Casa', 'Cliente B', 'Av. Grecia 102',
    'Ñuñoa', 'Metropolitana', 'CL', true
  );
SQL
checkout_cleanup_required=1

checkout_prepare_cart() {
  local user_id="$1"
  local idempotency_key="$2"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${checkout_db_url}" \
    --set=user_id="${user_id}" \
    --set=idempotency_key="${idempotency_key}" <<'SQL' >/dev/null
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', :'user_id',
    'role', 'authenticated',
    'is_anonymous', false
  )::text,
  true
);
select set_config('request.jwt.claim.sub', :'user_id', true);
select public.customer_cart_mutate_v1(
  'checkout-slot-concurrency',
  'set',
  '56000000-0000-4000-8000-000000026101',
  1,
  0,
  :'idempotency_key'::uuid
)->>'status';
commit;
SQL
}

checkout_prepare_cart \
  '00000000-0000-4000-8000-000000026101' \
  '96000000-0000-4000-8000-000000026101'
checkout_prepare_cart \
  '00000000-0000-4000-8000-000000026102' \
  '96000000-0000-4000-8000-000000026102'

checkout_run_quote() {
  local user_id="$1"
  local address_id="$2"
  local idempotency_key="$3"
  local delay_seconds="$4"
  local output_path="$5"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${checkout_db_url}" \
    --set=user_id="${user_id}" \
    --set=address_id="${address_id}" \
    --set=idempotency_key="${idempotency_key}" \
    --set=delay_seconds="${delay_seconds}" >"${output_path}" 2>&1 <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', :'user_id',
    'role', 'authenticated',
    'is_anonymous', false
  )::text,
  true
);
select set_config('request.jwt.claim.sub', :'user_id', true);
select public.customer_checkout_quote_create_v1(
  'checkout-slot-concurrency',
  1,
  'delivery',
  :'address_id'::uuid,
  null,
  '76000000-0000-4000-8000-000000026101',
  :'idempotency_key'::uuid
)->>'status';
select pg_catalog.pg_sleep(:delay_seconds);
commit;
SQL
}

checkout_run_quote \
  '00000000-0000-4000-8000-000000026101' \
  '86000000-0000-4000-8000-000000026101' \
  '96000000-0000-4000-8000-000000026103' \
  1 \
  "${checkout_tmp_dir}/session-a.log" &
checkout_pid_a=$!
checkout_run_quote \
  '00000000-0000-4000-8000-000000026102' \
  '86000000-0000-4000-8000-000000026102' \
  '96000000-0000-4000-8000-000000026104' \
  0 \
  "${checkout_tmp_dir}/session-b.log" &
checkout_pid_b=$!

checkout_status=0
wait "${checkout_pid_a}" || checkout_status=1
wait "${checkout_pid_b}" || checkout_status=1
if [[ "${checkout_status}" -ne 0 ]]; then
  sed -n '1,80p' "${checkout_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${checkout_tmp_dir}/session-b.log" >&2
  exit 1
fi

checkout_quoted_count="$(
  grep -h -x -c 'quoted' "${checkout_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
checkout_unavailable_count="$(
  grep -h -x -c 'slot_unavailable' "${checkout_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
if [[ "${checkout_quoted_count}" -ne 1 || \
  "${checkout_unavailable_count}" -ne 1 ]]; then
  sed -n '1,80p' "${checkout_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${checkout_tmp_dir}/session-b.log" >&2
  exit 1
fi

checkout_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${checkout_db_url}" <<'SQL'
select case when
  (
    select count(*) = 1
    from public.customer_checkout_quotes quote
    where quote.shop_id = '16000000-0000-4000-8000-000000026101'
      and quote.slot_id = '76000000-0000-4000-8000-000000026101'
      and quote.status = 'quoted'
      and quote.expires_at > statement_timestamp()
  )
  and (
    select count(*) = 2
    from public.customer_checkout_mutations mutation
    where mutation.shop_id = '16000000-0000-4000-8000-000000026101'
      and mutation.operation = 'create'
  )
  and (
    select stock_quantity = 10
    from public.inventory_products product
    where product.id = '26000000-0000-4000-8000-000000026101'
  )
  and (
    select not exists (
      select 1
      from jsonb_array_elements(
        public.storefront_fulfillment_options_v1(
          'checkout-slot-concurrency'
        )->'slots'
      ) slot
      where slot->>'id' = '76000000-0000-4000-8000-000000026101'
    )
  )
then 'PASS' else 'FAIL' end;
SQL
)"

if [[ "${checkout_assertion}" != "PASS" ]]; then
  printf 'Checkout slot concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Checkout slot concurrency: 2 customers, one quoted, one slot_unavailable, one active quote, stock unchanged, public slot closed, PASS.\n'
