#!/usr/bin/env bash
set -euo pipefail

storefront_repo_root="$(git rev-parse --show-toplevel)"
storefront_database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
storefront_sql="${storefront_repo_root}/scripts/testing/storefront-v1-contract-load.sql"
storefront_cleanup_sql="begin;
delete from public.storefront_promotion_products where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_promotions where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_product_publications where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_categories where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_settings where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.inventory_products where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.inventory_categories where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.shops where shop_id = '10000000-0000-4000-8000-000000010900';
delete from auth.users where id = '00000000-0000-4000-8000-000000010900';
commit;"

storefront_cleanup() {
  psql "${storefront_database_url}" \
    --quiet \
    --set ON_ERROR_STOP=1 \
    --command "${storefront_cleanup_sql}" >/dev/null 2>&1 || true
}

trap storefront_cleanup EXIT

if [[ ! -f "${storefront_sql}" ]]; then
  printf 'TASK-010 load SQL assente: %s\n' "${storefront_sql}" >&2
  exit 1
fi

storefront_result="$(
  psql "${storefront_database_url}" \
    --quiet \
    --tuples-only \
    --no-align \
    --set ON_ERROR_STOP=1 \
    --file "${storefront_sql}"
)"

printf '%s\n' "${storefront_result}" | sed '/^[[:space:]]*$/d'

storefront_residue="$(
  psql "${storefront_database_url}" \
    --quiet \
    --tuples-only \
    --no-align \
    --set ON_ERROR_STOP=1 \
    --command "select count(*) from public.shops where shop_id = '10000000-0000-4000-8000-000000010900'"
)"

if [[ "${storefront_residue}" != "0" ]]; then
  printf 'TASK-010 load rollback incompleto: residue=%s\n' "${storefront_residue}" >&2
  exit 1
fi

printf '{"cleanupVerified":true,"fixtureRowsAfterCleanup":0}\n'
