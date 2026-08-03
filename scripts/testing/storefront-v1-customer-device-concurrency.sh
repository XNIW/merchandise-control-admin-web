#!/usr/bin/env bash
set -euo pipefail

device_db_url="${STOREFRONT_CUSTOMER_DEVICE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
device_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/storefront-customer-device.XXXXXX")"

device_cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 --dbname="${device_db_url}" <<'SQL' >/dev/null 2>&1 || true
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000022101',
  '00000000-0000-4000-8000-000000022102'
);
SQL
  rm -rf -- "${device_tmp_dir}"
}
trap device_cleanup EXIT

device_database_host="$(
  STOREFRONT_CUSTOMER_DEVICE_DB_URL="${device_db_url}" node -e '
    const url = new URL(process.env.STOREFRONT_CUSTOMER_DEVICE_DB_URL);
    process.stdout.write(url.hostname);
  '
)"
if [[ "${device_database_host}" != "127.0.0.1" && \
  "${device_database_host}" != "localhost" && \
  "${device_database_host}" != "[::1]" ]]; then
  printf 'Customer-device concurrency harness refuses a non-local database.\n' >&2
  exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 --dbname="${device_db_url}" <<'SQL' >/dev/null
delete from auth.users
where id in (
  '00000000-0000-4000-8000-000000022101',
  '00000000-0000-4000-8000-000000022102'
);

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
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000022101',
    'authenticated',
    'authenticated',
    'task022-concurrency-a@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000022102',
    'authenticated',
    'authenticated',
    'task022-concurrency-b@example.invalid',
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
SQL

(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${device_db_url}" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022101","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022101',
  true
);
select public.customer_register_device_v1(
  '22000000-0000-4000-8000-000000000101',
  'ios',
  'es-CL',
  'granted',
  'authorized',
  'task022-concurrent-routing-token-0000000001',
  '22000000-0000-4000-8000-000000000111'
);
commit;
SQL
) >"${device_tmp_dir}/session-a.log" 2>&1 &
device_pid_a=$!

(
  psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${device_db_url}" <<'SQL'
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000022102","role":"authenticated","is_anonymous":false}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000022102',
  true
);
select public.customer_register_device_v1(
  '22000000-0000-4000-8000-000000000102',
  'android',
  'it',
  'granted',
  'authorized',
  'task022-concurrent-routing-token-0000000001',
  '22000000-0000-4000-8000-000000000112'
);
commit;
SQL
) >"${device_tmp_dir}/session-b.log" 2>&1 &
device_pid_b=$!

device_status=0
wait "${device_pid_a}" || device_status=1
wait "${device_pid_b}" || device_status=1
if [[ "${device_status}" -ne 0 ]]; then
  sed -n '1,80p' "${device_tmp_dir}/session-a.log" >&2
  sed -n '1,80p' "${device_tmp_dir}/session-b.log" >&2
  exit 1
fi

for device_session in a b; do
  if ! grep -q '"status": "ok"' "${device_tmp_dir}/session-${device_session}.log"; then
    sed -n '1,80p' "${device_tmp_dir}/session-${device_session}.log" >&2
    exit 1
  fi
  if grep -q 'task022-concurrent-routing-token' "${device_tmp_dir}/session-${device_session}.log"; then
    printf 'Customer-device RPC response leaked token material.\n' >&2
    exit 1
  fi
done

psql -X -qAt -v ON_ERROR_STOP=1 --dbname="${device_db_url}" <<'SQL' \
  >"${device_tmp_dir}/assertion.txt"
select case when
  (
    select count(*) = 2
    from public.customer_devices
    where user_id in (
      '00000000-0000-4000-8000-000000022101',
      '00000000-0000-4000-8000-000000022102'
    )
  )
  and (
    select count(*) = 1
    from public.customer_devices
    where push_token_hash = extensions.digest(
      'task022-concurrent-routing-token-0000000001',
      'sha256'
    )
      and consent_status = 'granted'
  )
  and (
    select count(*) = 1
    from public.customer_devices
    where user_id in (
      '00000000-0000-4000-8000-000000022101',
      '00000000-0000-4000-8000-000000022102'
    )
      and consent_status = 'revoked'
      and push_token is null
      and push_token_hash is null
  )
then 'PASS' else 'FAIL' end;
SQL

if [[ "$(tr -d '[:space:]' <"${device_tmp_dir}/assertion.txt")" != "PASS" ]]; then
  printf 'Customer-device concurrency assertion failed.\n' >&2
  exit 1
fi

printf 'Customer-device concurrency: 2 writers, 1 active token, 1 revoked route, PASS.\n'
