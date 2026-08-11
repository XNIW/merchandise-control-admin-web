#!/usr/bin/env bash
set -euo pipefail

hold_db_url="${STOREFRONT_RESERVATION_HOLD_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
hold_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-reservation-hold.XXXXXX")"
hold_cleanup_required=0

hold_cleanup() {
  if [[ "${hold_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${hold_db_url}" <<'SQL' >/dev/null 2>&1 || true
delete from public.customer_reservation_hold_mutations
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.customer_reservation_holds
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.storefront_product_publications
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.storefront_categories
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.storefront_settings
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.inventory_products
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.inventory_categories
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from public.shops
where shop_id = '15000000-0000-4000-8000-000000025101';
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000025101',
  '00000000-0000-4000-8000-000000025102'
);
SQL
  fi
  rm -rf -- "${hold_tmp_dir}"
}
trap hold_cleanup EXIT

hold_database_authority="${hold_db_url#*://}"
hold_database_authority="${hold_database_authority##*@}"
hold_database_host_port="${hold_database_authority%%[/?]*}"
if [[ "${hold_database_host_port}" == \[* ]]; then
  hold_database_host="${hold_database_host_port%%]:*}]"
else
  hold_database_host="${hold_database_host_port%%:*}"
fi
if [[ "${hold_database_host}" != "127.0.0.1" && \
  "${hold_database_host}" != "localhost" && \
  "${hold_database_host}" != "[::1]" ]]; then
  hold_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_RESERVATION_HOLD_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_RESERVATION_HOLD" || \
    ! "${hold_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${hold_db_url}" != *"postgres.${hold_staging_ref}:"* ]]; then
    printf 'Reservation-hold concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

psql -X -q -v ON_ERROR_STOP=1 --dbname="${hold_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000025101',
    'authenticated', 'authenticated', 'task025-concurrency-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000025102',
    'authenticated', 'authenticated', 'task025-concurrency-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
    now(), now()
  );

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '15000000-0000-4000-8000-000000025101',
  'SF25C', 'Reservation hold concurrency fixture', 'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '35000000-0000-4000-8000-000000025101',
  '00000000-0000-4000-8000-000000025101',
  '15000000-0000-4000-8000-000000025101',
  'Reservation hold concurrency', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '25000000-0000-4000-8000-000000025101',
  '00000000-0000-4000-8000-000000025101',
  '15000000-0000-4000-8000-000000025101',
  'SF25-5101', 'Reservation hold last piece',
  '35000000-0000-4000-8000-000000025101', 1000, 1, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, reservation_enabled, require_product_image,
  availability_low_stock_threshold
) values (
  '15000000-0000-4000-8000-000000025101',
  'reservation-hold-concurrency', true, true, true, true, false, 1
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '45000000-0000-4000-8000-000000025101',
  '15000000-0000-4000-8000-000000025101',
  '35000000-0000-4000-8000-000000025101',
  'reservation-hold-concurrency', 'Reservation hold concurrency', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  reservation_enabled, availability_mode, published_at
) values (
  '55000000-0000-4000-8000-000000025101',
  '15000000-0000-4000-8000-000000025101',
  '25000000-0000-4000-8000-000000025101',
  'published', 'Reservation hold public last piece',
  '45000000-0000-4000-8000-000000025101',
  1000, true, true, true, 'available', now()
);
SQL
hold_cleanup_required=1

hold_run_create() {
  local user_id="$1"
  local idempotency_key="$2"
  local delay_seconds="$3"
  local output_path="$4"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${hold_db_url}" \
    --set=user_id="${user_id}" \
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
select public.customer_reservation_hold_create_v1(
  'reservation-hold-concurrency',
  '55000000-0000-4000-8000-000000025101',
  1,
  :'idempotency_key'::uuid
)->>'status';
select pg_catalog.pg_sleep(:delay_seconds);
commit;
SQL
}

hold_run_create \
  '00000000-0000-4000-8000-000000025101' \
  '75000000-0000-4000-8000-000000025101' \
  1 \
  "${hold_tmp_dir}/session-a.log" &
hold_pid_a=$!
hold_run_create \
  '00000000-0000-4000-8000-000000025102' \
  '75000000-0000-4000-8000-000000025102' \
  0 \
  "${hold_tmp_dir}/session-b.log" &
hold_pid_b=$!

hold_status=0
wait "${hold_pid_a}" || hold_status=1
wait "${hold_pid_b}" || hold_status=1
if [[ "${hold_status}" -ne 0 ]]; then
  sed -n '1,80p' "${hold_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${hold_tmp_dir}/session-b.log" >&2
  exit 1
fi

hold_ok_count="$(
  grep -h -x -c 'ok' "${hold_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
hold_unavailable_count="$(
  grep -h -x -c 'unavailable' "${hold_tmp_dir}"/session-*.log |
    awk '{total += $1} END {print total + 0}'
)"
if [[ "${hold_ok_count}" -ne 1 || "${hold_unavailable_count}" -ne 1 ]]; then
  sed -n '1,80p' "${hold_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${hold_tmp_dir}/session-b.log" >&2
  exit 1
fi

hold_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${hold_db_url}" <<'SQL'
select case when
  (
    select count(*) = 1
    from public.customer_reservation_holds hold
    where hold.shop_id = '15000000-0000-4000-8000-000000025101'
      and hold.source_product_id = '25000000-0000-4000-8000-000000025101'
      and hold.status = 'active'
      and hold.expires_at > statement_timestamp()
  )
  and (
    select stock_quantity = 1
    from public.inventory_products
    where id = '25000000-0000-4000-8000-000000025101'
  )
  and (
    select availability_mode = 'unavailable'
    from public.storefront_product_publications
    where id = '55000000-0000-4000-8000-000000025101'
  )
  and (
    select count(*) = 2
    from public.customer_reservation_hold_mutations
    where shop_id = '15000000-0000-4000-8000-000000025101'
      and operation = 'create'
  )
then 'PASS' else 'FAIL' end;
SQL
)"

if [[ "${hold_assertion}" != "PASS" ]]; then
  printf 'Reservation-hold concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Reservation-hold concurrency: 2 customers, one ok, one unavailable, one active hold, on-hand stock unchanged, PASS.\n'
