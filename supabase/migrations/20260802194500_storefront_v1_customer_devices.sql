-- Storefront v1 / TASK-022
--
-- Privacy-safe customer installation and push-routing lifecycle. Installation IDs are
-- app-generated random UUIDs; push tokens are server-only routing secrets and never
-- customer identity.

begin;

create table public.customer_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  platform text not null,
  locale text not null default 'es-CL',
  consent_status text not null default 'not_requested',
  permission_status text not null default 'not_determined',
  push_token text,
  push_token_hash bytea,
  consented_at timestamptz,
  revoked_at timestamptz,
  token_updated_at timestamptz,
  last_seen_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  registration_version bigint not null default 1,
  last_operation text not null default 'register',
  last_idempotency_key uuid not null,
  last_request_hash bytea not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_devices_owner_installation_unique unique (
    user_id,
    installation_id
  ),
  constraint customer_devices_platform_check check (
    platform in ('android', 'ios')
  ),
  constraint customer_devices_locale_check check (
    locale in ('es-CL', 'it', 'en', 'zh-Hans')
  ),
  constraint customer_devices_consent_check check (
    consent_status in ('not_requested', 'granted', 'denied', 'revoked')
  ),
  constraint customer_devices_permission_check check (
    permission_status in (
      'not_determined',
      'authorized',
      'denied',
      'provisional'
    )
  ),
  constraint customer_devices_token_length_check check (
    push_token is null
    or (
      push_token = btrim(push_token)
      and length(push_token) between 16 and 4096
      and push_token !~ '[[:cntrl:][:space:]]'
    )
  ),
  constraint customer_devices_token_hash_pair_check check (
    (push_token is null) = (push_token_hash is null)
  ),
  constraint customer_devices_token_consent_check check (
    push_token is null or consent_status = 'granted'
  ),
  constraint customer_devices_consent_lifecycle_check check (
    (
      consent_status = 'granted'
      and consented_at is not null
      and revoked_at is null
    )
    or (
      consent_status = 'revoked'
      and revoked_at is not null
    )
    or (
      consent_status in ('not_requested', 'denied')
      and consented_at is null
      and revoked_at is null
    )
  ),
  constraint customer_devices_expiry_check check (
    (push_token is null and expires_at is null)
    or (push_token is not null and expires_at is not null)
  ),
  constraint customer_devices_registration_version_check check (
    registration_version > 0
  ),
  constraint customer_devices_last_operation_check check (
    last_operation in ('register', 'revoke')
  )
);

create unique index customer_devices_active_token_hash_idx
  on public.customer_devices(push_token_hash)
  where push_token_hash is not null;
create index customer_devices_owner_updated_idx
  on public.customer_devices(user_id, updated_at desc, id);
create index customer_devices_active_delivery_idx
  on public.customer_devices(user_id, expires_at, id)
  where consent_status = 'granted'
    and permission_status in ('authorized', 'provisional')
    and push_token_hash is not null;

create trigger customer_devices_touch_updated_at
  before update on public.customer_devices
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_devices enable row level security;
alter table public.customer_devices force row level security;

create policy customer_devices_select_owner
  on public.customer_devices
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_devices_insert_owner
  on public.customer_devices
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_devices_update_owner
  on public.customer_devices
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_devices_delete_owner
  on public.customer_devices
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

revoke all on table public.customer_devices
  from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_devices
  to service_role;

create or replace function app_private.customer_device_public_payload_v1(
  p_device public.customer_devices,
  p_status text,
  p_idempotent boolean
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'apiVersion', 'customer-device.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'deviceId', p_device.id,
    'installationId', p_device.installation_id,
    'platform', p_device.platform,
    'locale', p_device.locale,
    'consentStatus', p_device.consent_status,
    'permissionStatus', p_device.permission_status,
    'hasToken', p_device.push_token is not null,
    'consentedAt', p_device.consented_at,
    'revokedAt', p_device.revoked_at,
    'lastSeenAt', p_device.last_seen_at,
    'expiresAt', p_device.expires_at,
    'registrationVersion', p_device.registration_version
  )
$$;

revoke all on function app_private.customer_device_public_payload_v1(
  public.customer_devices,
  text,
  boolean
) from public, anon, authenticated;

create or replace function public.customer_register_device_v1(
  p_installation_id uuid,
  p_platform text,
  p_locale text,
  p_consent_status text,
  p_permission_status text,
  p_push_token text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := nullif(btrim(p_push_token), '');
  v_token_hash bytea;
  v_request_hash bytea;
  v_device public.customer_devices%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_installation_id is null
    or p_idempotency_key is null
    or p_platform is null
    or p_platform not in ('android', 'ios')
    or p_locale is null
    or p_locale not in ('es-CL', 'it', 'en', 'zh-Hans')
    or p_consent_status is null
    or p_consent_status not in ('not_requested', 'granted', 'denied', 'revoked')
    or p_permission_status is null
    or p_permission_status not in (
      'not_determined',
      'authorized',
      'denied',
      'provisional'
    )
    or (v_token is not null and p_consent_status <> 'granted')
    or (
      v_token is not null
      and (
        length(v_token) not between 16 and 4096
        or v_token ~ '[[:cntrl:][:space:]]'
      )
    ) then
    return jsonb_build_object(
      'apiVersion', 'customer-device.v1',
      'status', 'invalid'
    );
  end if;

  if v_token is not null then
    v_token_hash := extensions.digest(v_token, 'sha256');
  end if;
  v_request_hash := extensions.digest(
    pg_catalog.concat_ws(
      E'\x1f',
      p_installation_id::text,
      p_platform,
      p_locale,
      p_consent_status,
      p_permission_status,
      coalesce(v_token, '')
    ),
    'sha256'
  );

  -- Registrations are low-volume and globally serialized to make transfer/dedup of
  -- routing secrets deterministic without a lock-order deadlock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-devices-v1', 22001)
  );

  select device.*
  into v_device
  from public.customer_devices device
  where device.user_id = v_user_id
    and device.installation_id = p_installation_id
  for update;

  if found and v_device.last_idempotency_key = p_idempotency_key then
    if v_device.last_operation <> 'register'
      or v_device.last_request_hash <> v_request_hash then
      return jsonb_build_object(
        'apiVersion', 'customer-device.v1',
        'status', 'idempotency_conflict'
      );
    end if;
    return app_private.customer_device_public_payload_v1(
      v_device,
      'ok',
      true
    );
  end if;

  if v_token_hash is not null then
    update public.customer_devices device
    set
      consent_status = 'revoked',
      push_token = null,
      push_token_hash = null,
      revoked_at = v_now,
      expires_at = null,
      registration_version = device.registration_version + 1
    where device.push_token_hash = v_token_hash
      and (
        device.user_id <> v_user_id
        or device.installation_id <> p_installation_id
      );
  end if;

  insert into public.customer_devices (
    user_id,
    installation_id,
    platform,
    locale,
    consent_status,
    permission_status,
    push_token,
    push_token_hash,
    consented_at,
    revoked_at,
    token_updated_at,
    last_seen_at,
    expires_at,
    registration_version,
    last_operation,
    last_idempotency_key,
    last_request_hash
  )
  values (
    v_user_id,
    p_installation_id,
    p_platform,
    p_locale,
    p_consent_status,
    p_permission_status,
    case when p_consent_status = 'granted' then v_token else null end,
    case when p_consent_status = 'granted' then v_token_hash else null end,
    case when p_consent_status = 'granted' then v_now else null end,
    case when p_consent_status = 'revoked' then v_now else null end,
    case when p_consent_status = 'granted' and v_token is not null
      then v_now else null end,
    v_now,
    case when p_consent_status = 'granted' and v_token is not null
      then v_now + interval '90 days' else null end,
    1,
    'register',
    p_idempotency_key,
    v_request_hash
  )
  on conflict (user_id, installation_id) do update
  set
    platform = excluded.platform,
    locale = excluded.locale,
    consent_status = excluded.consent_status,
    permission_status = excluded.permission_status,
    push_token = excluded.push_token,
    push_token_hash = excluded.push_token_hash,
    consented_at = case
      when excluded.consent_status = 'granted'
        and customer_devices.consent_status = 'granted'
        then customer_devices.consented_at
      when excluded.consent_status = 'revoked'
        then customer_devices.consented_at
      else excluded.consented_at
    end,
    revoked_at = excluded.revoked_at,
    token_updated_at = case
      when customer_devices.push_token is distinct from excluded.push_token
        then excluded.token_updated_at
      else customer_devices.token_updated_at
    end,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at,
    registration_version = customer_devices.registration_version + 1,
    last_operation = excluded.last_operation,
    last_idempotency_key = excluded.last_idempotency_key,
    last_request_hash = excluded.last_request_hash
  returning * into v_device;

  return app_private.customer_device_public_payload_v1(v_device, 'ok', false);
end;
$$;

create or replace function public.customer_revoke_device_v1(
  p_installation_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_hash bytea;
  v_device public.customer_devices%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_installation_id is null or p_idempotency_key is null then
    return jsonb_build_object(
      'apiVersion', 'customer-device.v1',
      'status', 'invalid'
    );
  end if;

  v_request_hash := extensions.digest(
    'revoke:' || p_installation_id::text,
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-devices-v1', 22001)
  );

  select device.*
  into v_device
  from public.customer_devices device
  where device.user_id = v_user_id
    and device.installation_id = p_installation_id
  for update;

  if not found then
    return jsonb_build_object(
      'apiVersion', 'customer-device.v1',
      'status', 'not_found'
    );
  end if;
  if v_device.last_idempotency_key = p_idempotency_key then
    if v_device.last_operation <> 'revoke'
      or v_device.last_request_hash <> v_request_hash then
      return jsonb_build_object(
        'apiVersion', 'customer-device.v1',
        'status', 'idempotency_conflict'
      );
    end if;
    return app_private.customer_device_public_payload_v1(
      v_device,
      'revoked',
      true
    );
  end if;

  update public.customer_devices device
  set
    consent_status = 'revoked',
    push_token = null,
    push_token_hash = null,
    revoked_at = v_now,
    last_seen_at = v_now,
    expires_at = null,
    registration_version = device.registration_version + 1,
    last_operation = 'revoke',
    last_idempotency_key = p_idempotency_key,
    last_request_hash = v_request_hash
  where device.id = v_device.id
  returning * into v_device;

  return app_private.customer_device_public_payload_v1(
    v_device,
    'revoked',
    false
  );
end;
$$;

create or replace function public.customer_device_status_v1(
  p_installation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_device public.customer_devices%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_installation_id is null then
    return jsonb_build_object(
      'apiVersion', 'customer-device.v1',
      'status', 'invalid'
    );
  end if;

  select device.*
  into v_device
  from public.customer_devices device
  where device.user_id = v_user_id
    and device.installation_id = p_installation_id;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'customer-device.v1',
      'status', 'not_found'
    );
  end if;
  return app_private.customer_device_public_payload_v1(v_device, 'ok', true);
end;
$$;

do $grants$
begin
  revoke all on function public.customer_register_device_v1(
    uuid,
    text,
    text,
    text,
    text,
    text,
    uuid
  ) from public, anon, authenticated, service_role;
  revoke all on function public.customer_revoke_device_v1(uuid, uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.customer_device_status_v1(uuid)
    from public, anon, authenticated, service_role;

  grant execute on function public.customer_register_device_v1(
    uuid,
    text,
    text,
    text,
    text,
    text,
    uuid
  ) to authenticated;
  grant execute on function public.customer_revoke_device_v1(uuid, uuid)
    to authenticated;
  grant execute on function public.customer_device_status_v1(uuid)
    to authenticated;
end;
$grants$;

comment on table public.customer_devices is
  'Owner-scoped Storefront installations. Push tokens are server-only routing secrets, never customer identity.';
comment on column public.customer_devices.installation_id is
  'Random app installation UUID; never derived from hardware, advertising IDs, email, or account metadata.';
comment on column public.customer_devices.push_token is
  'Server-only APNs/FCM routing secret. Authenticated clients receive only the hasToken boolean.';
comment on function public.customer_register_device_v1(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid
) is
  'Idempotent owner-bound device/consent/token registration and rotation contract.';

notify pgrst, 'reload schema';

commit;
