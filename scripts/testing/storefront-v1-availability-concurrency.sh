#!/usr/bin/env bash
set -euo pipefail

availability_db_url="${STOREFRONT_AVAILABILITY_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
availability_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-availability.XXXXXX")"
availability_cleanup_required=0

availability_cleanup() {
  if [[ "${availability_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${availability_db_url}" <<'SQL' >/dev/null
delete from public.storefront_product_publications
where shop_id = '10000000-0000-4000-8000-000000024101';
delete from public.storefront_categories
where shop_id = '10000000-0000-4000-8000-000000024101';
delete from public.storefront_settings
where shop_id = '10000000-0000-4000-8000-000000024101';
delete from public.inventory_products
where shop_id = '10000000-0000-4000-8000-000000024101';
delete from public.inventory_categories
where shop_id = '10000000-0000-4000-8000-000000024101';
delete from public.shops
where shop_id = '10000000-0000-4000-8000-000000024101';
delete from auth.users
where id = '00000000-0000-4000-8000-000000024101';
SQL
  fi
  rm -r -- "${availability_tmp_dir}"
}
trap availability_cleanup EXIT

availability_database_authority="${availability_db_url#*@}"
availability_database_host="${availability_database_authority%%[:/?]*}"
if [[ "${availability_database_host}" != "127.0.0.1" && \
  "${availability_database_host}" != "localhost" && \
  "${availability_database_host}" != "[::1]" ]]; then
  availability_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_AVAILABILITY_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_AVAILABILITY" || \
    ! "${availability_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${availability_db_url}" != *"postgres.${availability_staging_ref}:"* ]]; then
    printf 'Availability concurrency harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

psql -X -q -v ON_ERROR_STOP=1 --dbname="${availability_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000024101',
  'authenticated', 'authenticated',
  'storefront-availability-concurrency@example.invalid',
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000024101',
  'SF241', 'Availability concurrency fixture', 'active'
);

insert into public.inventory_categories (
  id, owner_user_id, shop_id, name, updated_at
) values (
  '30000000-0000-4000-8000-000000024101',
  '00000000-0000-4000-8000-000000024101',
  '10000000-0000-4000-8000-000000024101',
  'Availability concurrency', now()
);

insert into public.inventory_products (
  id, owner_user_id, shop_id, barcode, product_name, category_id,
  retail_price, stock_quantity, updated_at
) values (
  '20000000-0000-4000-8000-000000024101',
  '00000000-0000-4000-8000-000000024101',
  '10000000-0000-4000-8000-000000024101',
  'SF24-4101', 'Availability concurrency product',
  '30000000-0000-4000-8000-000000024101', 1000, 10, now()
);

insert into public.storefront_settings (
  shop_id, public_slug, storefront_enabled, pickup_enabled,
  delivery_enabled, require_product_image
) values (
  '10000000-0000-4000-8000-000000024101',
  'availability-concurrency', true, true, true, false
);

insert into public.storefront_categories (
  id, shop_id, source_category_id, slug, public_name, publication_status
) values (
  '40000000-0000-4000-8000-000000024101',
  '10000000-0000-4000-8000-000000024101',
  '30000000-0000-4000-8000-000000024101',
  'availability-concurrency', 'Availability concurrency', 'published'
);

insert into public.storefront_product_publications (
  id, shop_id, source_product_id, publication_status, public_name,
  public_category_id, retail_price_clp, pickup_enabled, delivery_enabled,
  published_at
) values (
  '50000000-0000-4000-8000-000000024101',
  '10000000-0000-4000-8000-000000024101',
  '20000000-0000-4000-8000-000000024101',
  'published', 'Availability concurrency',
  '40000000-0000-4000-8000-000000024101',
  1000, true, true, now()
);
SQL
availability_cleanup_required=1

availability_observed_at="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${availability_db_url}" \
    -c 'select clock_timestamp()'
)"

(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${availability_db_url}" \
    -v availability_observed_at="${availability_observed_at}" <<'SQL'
begin;
select public.storefront_availability_ingest_v1(
  '10000000-0000-4000-8000-000000024101',
  '20000000-0000-4000-8000-000000024101',
  2, 'unavailable', :'availability_observed_at'::timestamptz,
  :'availability_observed_at'::timestamptz + interval '1 hour',
  'task024-concurrency-idempotent-v2'
)->>'status';
select pg_catalog.pg_sleep(1);
commit;
SQL
) >"${availability_tmp_dir}/session-a.log" 2>&1 &
availability_pid_a=$!

(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${availability_db_url}" \
    -v availability_observed_at="${availability_observed_at}" <<'SQL'
begin;
select public.storefront_availability_ingest_v1(
  '10000000-0000-4000-8000-000000024101',
  '20000000-0000-4000-8000-000000024101',
  2, 'unavailable', :'availability_observed_at'::timestamptz,
  :'availability_observed_at'::timestamptz + interval '1 hour',
  'task024-concurrency-idempotent-v2'
)->>'status';
commit;
SQL
) >"${availability_tmp_dir}/session-b.log" 2>&1 &
availability_pid_b=$!

availability_status=0
wait "${availability_pid_a}" || availability_status=1
wait "${availability_pid_b}" || availability_status=1
if [[ "${availability_status}" -ne 0 ]]; then
  sed -n '1,80p' "${availability_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${availability_tmp_dir}/session-b.log" >&2
  exit 1
fi

availability_result_a="$(sed -n '1p' "${availability_tmp_dir}/session-a.log")"
availability_result_b="$(sed -n '1p' "${availability_tmp_dir}/session-b.log")"
if [[ ! ( "${availability_result_a}" = "applied" && \
          "${availability_result_b}" = "duplicate" ) && \
      ! ( "${availability_result_a}" = "duplicate" && \
          "${availability_result_b}" = "applied" ) ]]; then
  printf 'Availability writers produced an unexpected result: A=%s B=%s.\n' \
    "${availability_result_a}" "${availability_result_b}" >&2
  exit 1
fi

availability_assertion="$(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${availability_db_url}" <<'SQL'
select case when
  (
    select source_version = 2 and signal_state = 'unavailable'
    from app_private.storefront_product_availability_signals
    where shop_id = '10000000-0000-4000-8000-000000024101'
      and source_product_id = '20000000-0000-4000-8000-000000024101'
  )
  and (
    select availability_mode = 'unavailable'
    from public.storefront_product_publications
    where id = '50000000-0000-4000-8000-000000024101'
  )
  and public.storefront_product_detail_v1(
    'availability-concurrency',
    '50000000-0000-4000-8000-000000024101'
  )->'item'->>'availability' = 'unavailable'
then 'PASS' else 'FAIL' end;
SQL
)"

if [[ "${availability_assertion}" != "PASS" ]]; then
  printf 'Availability concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Storefront availability concurrency: 2 writers, one apply, one duplicate, final version 2, PASS.\n'
