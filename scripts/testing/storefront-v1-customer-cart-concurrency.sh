#!/usr/bin/env bash
set -euo pipefail

cart_db_url="${STOREFRONT_CUSTOMER_CART_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
cart_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-customer-cart.XXXXXX")"

cart_cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${cart_db_url}" <<'SQL' >/dev/null 2>&1 || true
delete from auth.users
where id = '00000000-0000-4000-8000-000000023101';
delete from public.shops
where shop_id = '13000000-0000-4000-8000-000000023101';
SQL
  rm -rf -- "${cart_tmp_dir}"
}
trap cart_cleanup EXIT

cart_database_host="$(
  STOREFRONT_CUSTOMER_CART_DB_URL="${cart_db_url}" node -e '
    const url = new URL(process.env.STOREFRONT_CUSTOMER_CART_DB_URL);
    process.stdout.write(url.hostname);
  '
)"
if [[ "${cart_database_host}" != "127.0.0.1" && \
  "${cart_database_host}" != "localhost" && \
  "${cart_database_host}" != "[::1]" ]]; then
  printf 'Customer-cart concurrency harness refuses a non-local database.\n' >&2
  exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 --dbname="${cart_db_url}" <<'SQL' >/dev/null
delete from auth.users
where id = '00000000-0000-4000-8000-000000023101';
delete from public.shops
where shop_id = '13000000-0000-4000-8000-000000023101';

insert into auth.users (
  instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000023101',
  'authenticated', 'authenticated', 'task023-concurrency@example.invalid',
  '{"provider":"google","providers":["google"]}'::jsonb, '{}'::jsonb,
  now(), now()
);
insert into public.shops(shop_id, shop_code, shop_name, shop_status)
values (
  '13000000-0000-4000-8000-000000023101',
  'SF23C',
  'Cart concurrency fixture',
  'active'
);
insert into public.storefront_settings(
  shop_id, public_slug, storefront_enabled, require_product_image
) values (
  '13000000-0000-4000-8000-000000023101',
  'cart-concurrency-fixture',
  true,
  false
);
SQL

cart_run_clear() {
  local expected_version="$1"
  local idempotency_key="$2"
  local output_path="$3"

  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${cart_db_url}" \
    --set=expected_version="${expected_version}" \
    --set=idempotency_key="${idempotency_key}" >"${output_path}" 2>&1 <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000023101","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000023101',
  true
);
select public.customer_cart_mutate_v1(
  'cart-concurrency-fixture',
  'clear',
  null,
  null,
  :expected_version,
  :'idempotency_key'::uuid
);
commit;
SQL
}

cart_run_clear 0 '73000000-0000-4000-8000-000000023101' \
  "${cart_tmp_dir}/duplicate-a.log" &
cart_pid_a=$!
cart_run_clear 0 '73000000-0000-4000-8000-000000023101' \
  "${cart_tmp_dir}/duplicate-b.log" &
cart_pid_b=$!

cart_status=0
wait "${cart_pid_a}" || cart_status=1
wait "${cart_pid_b}" || cart_status=1
if [[ "${cart_status}" -ne 0 ]]; then
  sed -n '1,80p' "${cart_tmp_dir}/duplicate-a.log" >&2
  sed -n '1,80p' "${cart_tmp_dir}/duplicate-b.log" >&2
  exit 1
fi

for cart_session in duplicate-a duplicate-b; do
  if ! grep -q '"status": "ok"' "${cart_tmp_dir}/${cart_session}.log"; then
    sed -n '1,80p' "${cart_tmp_dir}/${cart_session}.log" >&2
    exit 1
  fi
done
if [[ "$(grep -h -c '"idempotent": true' "${cart_tmp_dir}"/duplicate-*.log | awk '{total += $1} END {print total + 0}')" -ne 1 ]]; then
  printf 'Duplicate cart mutation did not yield exactly one idempotent replay.\n' >&2
  exit 1
fi

cart_run_clear 1 '73000000-0000-4000-8000-000000023102' \
  "${cart_tmp_dir}/version-a.log" &
cart_pid_a=$!
cart_run_clear 1 '73000000-0000-4000-8000-000000023103' \
  "${cart_tmp_dir}/version-b.log" &
cart_pid_b=$!

cart_status=0
wait "${cart_pid_a}" || cart_status=1
wait "${cart_pid_b}" || cart_status=1
if [[ "${cart_status}" -ne 0 ]]; then
  sed -n '1,80p' "${cart_tmp_dir}/version-a.log" >&2
  sed -n '1,80p' "${cart_tmp_dir}/version-b.log" >&2
  exit 1
fi

if [[ "$(grep -h -c '"status": "ok"' "${cart_tmp_dir}"/version-*.log | awk '{total += $1} END {print total + 0}')" -ne 1 ]] || \
  [[ "$(grep -h -c '"status": "version_conflict"' "${cart_tmp_dir}"/version-*.log | awk '{total += $1} END {print total + 0}')" -ne 1 ]]; then
  sed -n '1,80p' "${cart_tmp_dir}/version-a.log" >&2
  sed -n '1,80p' "${cart_tmp_dir}/version-b.log" >&2
  exit 1
fi

psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${cart_db_url}" <<'SQL' \
  >"${cart_tmp_dir}/assertion.txt"
select case when
  (
    select cart_version = 2
    from public.customer_carts
    where user_id = '00000000-0000-4000-8000-000000023101'
      and shop_id = '13000000-0000-4000-8000-000000023101'
  )
  and (
    select count(*) = 3
    from public.customer_cart_mutations
    where user_id = '00000000-0000-4000-8000-000000023101'
      and shop_id = '13000000-0000-4000-8000-000000023101'
  )
then 'PASS' else 'FAIL' end;
SQL

if [[ "$(tr -d '[:space:]' <"${cart_tmp_dir}/assertion.txt")" != "PASS" ]]; then
  printf 'Customer-cart concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Customer-cart concurrency: duplicate replay 1x, optimistic winner 1x, conflict 1x, PASS.\n'
