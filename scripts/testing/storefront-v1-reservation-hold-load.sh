#!/usr/bin/env bash
set -euo pipefail

load_db_url="${STOREFRONT_RESERVATION_HOLD_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
load_sql="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/storefront-v1-reservation-hold-load.sql"

load_database_authority="${load_db_url#*://}"
load_database_authority="${load_database_authority##*@}"
load_database_host_port="${load_database_authority%%[/?]*}"
if [[ "${load_database_host_port}" == \[* ]]; then
  load_database_host="${load_database_host_port%%]:*}]"
else
  load_database_host="${load_database_host_port%%:*}"
fi

if [[ "${load_database_host}" != "127.0.0.1" && \
  "${load_database_host}" != "localhost" && \
  "${load_database_host}" != "[::1]" ]]; then
  load_staging_ref="${STAGING_SUPABASE_PROJECT_REF:-}"
  if [[ "${STOREFRONT_RESERVATION_HOLD_LOAD_ALLOW_REMOTE:-}" != \
      "APPLY_STOREFRONT_V1_STAGING_RESERVATION_HOLD_LOAD" || \
    ! "${load_staging_ref}" =~ ^[a-z0-9]{20}$ || \
    "${load_db_url}" != *"postgres.${load_staging_ref}:"* ]]; then
    printf 'Reservation-hold load harness refuses an unauthorized non-local database.\n' >&2
    exit 1
  fi
fi

load_result="$(
  psql -X -qAt -v ON_ERROR_STOP=1 \
    --dbname="${load_db_url}" \
    --file="${load_sql}"
)"

load_json="$(printf '%s\n' "${load_result}" | sed '/^[[:space:]]*$/d' | tail -n 1)"
if [[ "${load_json}" != *'"apiVersion": "storefront-reservation-hold-load.v1"'* ]]; then
  printf 'Reservation-hold load report missing or invalid.\n' >&2
  exit 1
fi

load_residue="$(
  psql -X -qAt -v ON_ERROR_STOP=1 \
    --dbname="${load_db_url}" \
    --command="select count(*) from public.shops where shop_id = '15250000-0000-4000-8000-000000000001'"
)"
if [[ "${load_residue}" != "0" ]]; then
  printf 'Reservation-hold load rollback incomplete: residue=%s\n' "${load_residue}" >&2
  exit 1
fi

printf '%s\n' "${load_json}"
