#!/usr/bin/env bash
set -euo pipefail

storefront_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
storefront_repo_root="$(cd "${storefront_script_dir}/../.." && pwd)"
storefront_local_database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
storefront_database_url="${STOREFRONT_DATABASE_URL:-${storefront_local_database_url}}"
storefront_sql="${storefront_repo_root}/scripts/testing/storefront-v1-contract-load.sql"
storefront_hold_seconds="${STOREFRONT_LOAD_HOLD_SECONDS:-0}"
storefront_hold_enabled="false"
storefront_cleanup_sql="begin;
delete from public.storefront_promotion_products where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_promotions where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_product_publications where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.storefront_image_publications where shop_id = '10000000-0000-4000-8000-000000010900';
delete from public.inventory_product_image_versions where shop_id = '10000000-0000-4000-8000-000000010900';
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

if [[ ! "${storefront_hold_seconds}" =~ ^[0-9]+$ ]] \
  || (( storefront_hold_seconds > 900 )); then
  printf 'TASK-019 hold non valido: usare un intero tra 0 e 900 secondi.\n' >&2
  exit 1
fi
if (( storefront_hold_seconds > 0 )); then
  storefront_hold_enabled="true"
fi

if [[ "${storefront_database_url}" != "${storefront_local_database_url}" ]]; then
  if [[ "${STOREFRONT_LOAD_ALLOW_REMOTE:-}" != "APPLY_STOREFRONT_V1_STAGING_LOAD" ]]; then
    printf 'TASK-010 load remoto negato: manca il guard esplicito.\n' >&2
    exit 1
  fi
  if [[ ! "${STAGING_SUPABASE_PROJECT_REF:-}" =~ ^[a-z0-9]{20}$ ]]; then
    printf 'TASK-010 load remoto negato: staging project ref non valido.\n' >&2
    exit 1
  fi
  if [[ "${storefront_database_url}" != postgresql://postgres."${STAGING_SUPABASE_PROJECT_REF}":*@*.pooler.supabase.com:5432/postgres\?sslmode=require ]]; then
    printf 'TASK-010 load remoto negato: il database non coincide con staging.\n' >&2
    exit 1
  fi
fi

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
    --set storefront_hold_enabled="${storefront_hold_enabled}" \
    --set storefront_hold_seconds="${storefront_hold_seconds}" \
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
