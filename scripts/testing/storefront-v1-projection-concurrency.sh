#!/usr/bin/env bash
set -euo pipefail

storefront_db_url="${STOREFRONT_PROJECTION_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
storefront_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-projection.XXXXXX")"
storefront_cleanup_required=0

storefront_cleanup() {
  if [[ "${storefront_cleanup_required}" -eq 1 ]]; then
    psql -X -q -v ON_ERROR_STOP=1 --dbname="${storefront_db_url}" <<'SQL' >/dev/null
delete from public.storefront_promotion_products
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.storefront_promotions
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.storefront_product_publications
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.storefront_image_publications
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.storefront_categories
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.storefront_settings
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.inventory_products
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.inventory_categories
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from public.shops
where shop_id = '10000000-0000-4000-8000-000000006101';
delete from auth.users
where id = '00000000-0000-4000-8000-000000006101';
SQL
  fi
  rm -rf -- "${storefront_tmp_dir}"
}
trap storefront_cleanup EXIT

storefront_database_host="$(
  STOREFRONT_PROJECTION_DB_URL="${storefront_db_url}" node -e '
    const url = new URL(process.env.STOREFRONT_PROJECTION_DB_URL);
    process.stdout.write(url.hostname);
  '
)"
if [[ "${storefront_database_host}" != "127.0.0.1" && \
  "${storefront_database_host}" != "localhost" && \
  "${storefront_database_host}" != "[::1]" ]]; then
  printf 'Projection concurrency harness refuses a non-local database.\n' >&2
  exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 --dbname="${storefront_db_url}" <<'SQL' >/dev/null
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000006101',
  'authenticated',
  'authenticated',
  'storefront-projection-concurrency@example.invalid',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.shops (shop_id, shop_code, shop_name, shop_status)
values (
  '10000000-0000-4000-8000-000000006101',
  'SFV61',
  'Storefront concurrency fixture',
  'active'
);

insert into public.inventory_categories (
  id,
  owner_user_id,
  shop_id,
  name,
  updated_at
) values (
  '30000000-0000-4000-8000-000000006101',
  '00000000-0000-4000-8000-000000006101',
  '10000000-0000-4000-8000-000000006101',
  'Concurrency category',
  now()
);

insert into public.inventory_products (
  id,
  owner_user_id,
  shop_id,
  barcode,
  product_name,
  category_id,
  retail_price,
  stock_quantity,
  updated_at
) values
  (
    '20000000-0000-4000-8000-000000006101',
    '00000000-0000-4000-8000-000000006101',
    '10000000-0000-4000-8000-000000006101',
    'SFV1-6101',
    'Concurrency product A',
    '30000000-0000-4000-8000-000000006101',
    1000,
    10,
    now()
  ),
  (
    '20000000-0000-4000-8000-000000006102',
    '00000000-0000-4000-8000-000000006101',
    '10000000-0000-4000-8000-000000006101',
    'SFV1-6102',
    'Concurrency product B',
    '30000000-0000-4000-8000-000000006101',
    2000,
    10,
    now()
  );

insert into public.storefront_settings (
  shop_id,
  public_slug,
  storefront_enabled,
  pickup_enabled,
  require_product_image
) values (
  '10000000-0000-4000-8000-000000006101',
  'projection-concurrency',
  true,
  true,
  false
);

insert into public.storefront_categories (
  id,
  shop_id,
  source_category_id,
  slug,
  public_name,
  publication_status
) values (
  '40000000-0000-4000-8000-000000006101',
  '10000000-0000-4000-8000-000000006101',
  '30000000-0000-4000-8000-000000006101',
  'concurrency',
  'Concurrency',
  'published'
);

insert into public.storefront_product_publications (
  id,
  shop_id,
  source_product_id,
  publication_status,
  public_name,
  public_category_id,
  retail_price_clp,
  pickup_enabled,
  published_at
) values
  (
    '50000000-0000-4000-8000-000000006101',
    '10000000-0000-4000-8000-000000006101',
    '20000000-0000-4000-8000-000000006101',
    'published',
    'Concurrent A initial',
    '40000000-0000-4000-8000-000000006101',
    1000,
    true,
    now()
  ),
  (
    '50000000-0000-4000-8000-000000006102',
    '10000000-0000-4000-8000-000000006101',
    '20000000-0000-4000-8000-000000006102',
    'published',
    'Concurrent B initial',
    '40000000-0000-4000-8000-000000006101',
    2000,
    true,
    now()
  );
SQL
storefront_cleanup_required=1

(
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${storefront_db_url}" <<'SQL'
begin;
update public.storefront_product_publications
set public_name = 'Concurrent A committed'
where id = '50000000-0000-4000-8000-000000006101';
select pg_catalog.pg_sleep(1);
commit;
SQL
) >"${storefront_tmp_dir}/session-a.log" 2>&1 &
storefront_pid_a=$!

(
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${storefront_db_url}" <<'SQL'
begin;
update public.storefront_product_publications
set public_name = 'Concurrent B committed'
where id = '50000000-0000-4000-8000-000000006102';
commit;
SQL
) >"${storefront_tmp_dir}/session-b.log" 2>&1 &
storefront_pid_b=$!

storefront_status=0
wait "${storefront_pid_a}" || storefront_status=1
wait "${storefront_pid_b}" || storefront_status=1
if [[ "${storefront_status}" -ne 0 ]]; then
  sed -n '1,80p' "${storefront_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${storefront_tmp_dir}/session-b.log" >&2
  exit 1
fi

psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${storefront_db_url}" <<'SQL' \
  >"${storefront_tmp_dir}/assertion.txt"
with expected_fingerprint as (
  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        string_agg(
          item.publication_id::text || ':' || item.content_sha256,
          ',' order by item.publication_id
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as value
  from public.storefront_catalog_items item
  where item.shop_id = '10000000-0000-4000-8000-000000006101'
)
select case when
  (
    select count(*) = 2
    from public.storefront_catalog_items item
    join public.storefront_product_publications publication
      on publication.id = item.publication_id
    where item.shop_id = '10000000-0000-4000-8000-000000006101'
      and item.public_name = publication.public_name
  )
  and (
    select version.catalog_version = 3
      and version.item_count = 2
      and version.content_sha256 = expected_fingerprint.value
    from public.storefront_catalog_versions version
    cross join expected_fingerprint
    where version.shop_id = '10000000-0000-4000-8000-000000006101'
  )
then 'PASS' else 'FAIL' end;
SQL

if [[ "$(tr -d '[:space:]' <"${storefront_tmp_dir}/assertion.txt")" != "PASS" ]]; then
  printf 'Projection concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Storefront projection concurrency: 2 writers, 2 rows, version 3, PASS.\n'
