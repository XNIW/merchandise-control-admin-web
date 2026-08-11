-- Storefront v1 / TASK-021
--
-- Customer-owned profile, address and privacy-request contracts. Customer identity is
-- always auth.users.id; email and OAuth credentials are intentionally absent.

begin;

create table public.customer_profiles (
  user_id uuid primary key default auth.uid()
    references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'es-CL',
  privacy_consent_version text,
  privacy_consented_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_profiles_display_name_check check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and length(display_name) between 1 and 120
      and display_name !~ '[[:cntrl:]]'
    )
  ),
  constraint customer_profiles_locale_check check (
    locale in ('es-CL', 'it', 'en', 'zh-Hans')
  ),
  constraint customer_profiles_privacy_consent_check check (
    (
      privacy_consent_version is null
      and privacy_consented_at is null
    )
    or (
      privacy_consent_version = btrim(privacy_consent_version)
      and length(privacy_consent_version) between 1 and 64
      and privacy_consent_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
      and privacy_consented_at is not null
    )
  )
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  address_line_1 text not null,
  address_line_2 text,
  commune text not null,
  region text not null,
  postal_code text,
  country_code text not null default 'CL',
  delivery_instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_addresses_user_id_id_unique unique (user_id, id),
  constraint customer_addresses_label_check check (
    label = btrim(label)
    and length(label) between 1 and 40
    and label !~ '[[:cntrl:]]'
  ),
  constraint customer_addresses_recipient_check check (
    recipient_name = btrim(recipient_name)
    and length(recipient_name) between 1 and 120
    and recipient_name !~ '[[:cntrl:]]'
  ),
  constraint customer_addresses_line_1_check check (
    address_line_1 = btrim(address_line_1)
    and length(address_line_1) between 1 and 200
    and address_line_1 !~ '[[:cntrl:]]'
  ),
  constraint customer_addresses_line_2_check check (
    address_line_2 is null
    or (
      address_line_2 = btrim(address_line_2)
      and length(address_line_2) between 1 and 200
      and address_line_2 !~ '[[:cntrl:]]'
    )
  ),
  constraint customer_addresses_commune_check check (
    commune = btrim(commune)
    and length(commune) between 1 and 100
    and commune !~ '[[:cntrl:]]'
  ),
  constraint customer_addresses_region_check check (
    region = btrim(region)
    and length(region) between 1 and 100
    and region !~ '[[:cntrl:]]'
  ),
  constraint customer_addresses_postal_code_check check (
    postal_code is null
    or (
      postal_code = btrim(postal_code)
      and length(postal_code) between 1 and 16
      and postal_code ~ '^[A-Za-z0-9 -]+$'
    )
  ),
  constraint customer_addresses_country_code_check check (
    country_code ~ '^[A-Z]{2}$'
  ),
  constraint customer_addresses_instructions_check check (
    delivery_instructions is null
    or (
      delivery_instructions = btrim(delivery_instructions)
      and length(delivery_instructions) between 1 and 500
      and delivery_instructions !~ '[[:cntrl:]]'
    )
  )
);

create unique index customer_addresses_one_default_per_user_idx
  on public.customer_addresses(user_id)
  where is_default;
create index customer_addresses_user_updated_idx
  on public.customer_addresses(user_id, updated_at desc, id);

create table public.customer_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null default 'requested',
  requested_at timestamptz not null default statement_timestamp(),
  cancelled_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_account_deletion_idempotency_unique unique (
    user_id,
    idempotency_key
  ),
  constraint customer_account_deletion_status_check check (
    status in ('requested', 'cancelled', 'processing', 'completed', 'rejected')
  ),
  constraint customer_account_deletion_lifecycle_check check (
    (
      status = 'requested'
      and cancelled_at is null
      and processed_at is null
    )
    or (
      status = 'cancelled'
      and cancelled_at is not null
      and processed_at is null
    )
    or (
      status = 'processing'
      and cancelled_at is null
      and processed_at is null
    )
    or (
      status in ('completed', 'rejected')
      and cancelled_at is null
      and processed_at is not null
    )
  )
);

create unique index customer_account_deletion_one_active_idx
  on public.customer_account_deletion_requests(user_id)
  where status in ('requested', 'processing');
create index customer_account_deletion_user_updated_idx
  on public.customer_account_deletion_requests(user_id, updated_at desc, id);

create trigger customer_profiles_touch_updated_at
  before update on public.customer_profiles
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_addresses_touch_updated_at
  before update on public.customer_addresses
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_deletion_touch_updated_at
  before update on public.customer_account_deletion_requests
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_profiles enable row level security;
alter table public.customer_profiles force row level security;
alter table public.customer_addresses enable row level security;
alter table public.customer_addresses force row level security;
alter table public.customer_account_deletion_requests enable row level security;
alter table public.customer_account_deletion_requests force row level security;

create policy customer_profiles_select_owner
  on public.customer_profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_profiles_insert_owner
  on public.customer_profiles
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_profiles_update_owner
  on public.customer_profiles
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
create policy customer_profiles_delete_owner
  on public.customer_profiles
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

create policy customer_addresses_select_owner
  on public.customer_addresses
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_addresses_insert_owner
  on public.customer_addresses
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_addresses_update_owner
  on public.customer_addresses
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
create policy customer_addresses_delete_owner
  on public.customer_addresses
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

create policy customer_account_deletion_select_owner
  on public.customer_account_deletion_requests
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

revoke all on table public.customer_profiles
  from public, anon, authenticated;
revoke all on table public.customer_addresses
  from public, anon, authenticated;
revoke all on table public.customer_account_deletion_requests
  from public, anon, authenticated;

grant select, delete on table public.customer_profiles to authenticated;
grant insert (
  display_name,
  locale
) on table public.customer_profiles to authenticated;
grant update (
  display_name,
  locale
) on table public.customer_profiles to authenticated;

grant select, delete on table public.customer_addresses to authenticated;
grant insert (
  label,
  recipient_name,
  address_line_1,
  address_line_2,
  commune,
  region,
  postal_code,
  country_code,
  delivery_instructions
) on table public.customer_addresses to authenticated;
grant update (
  label,
  recipient_name,
  address_line_1,
  address_line_2,
  commune,
  region,
  postal_code,
  country_code,
  delivery_instructions
) on table public.customer_addresses to authenticated;

grant select on table public.customer_account_deletion_requests to authenticated;

grant select, insert, update, delete on table public.customer_profiles
  to service_role;
grant select, insert, update, delete on table public.customer_addresses
  to service_role;
grant select, insert, update, delete
  on table public.customer_account_deletion_requests to service_role;

create or replace function public.customer_record_privacy_consent_v1(
  p_version text,
  p_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.customer_profiles%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_accepted is null
    or (
      p_accepted
      and (
        p_version is null
        or p_version <> btrim(p_version)
        or length(p_version) not between 1 and 64
        or p_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
      )
    ) then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'invalid');
  end if;

  insert into public.customer_profiles (
    user_id,
    privacy_consent_version,
    privacy_consented_at
  )
  values (
    v_user_id,
    case when p_accepted then p_version else null end,
    case when p_accepted then statement_timestamp() else null end
  )
  on conflict (user_id) do update
  set
    privacy_consent_version = excluded.privacy_consent_version,
    privacy_consented_at = excluded.privacy_consented_at
  returning * into v_profile;

  return jsonb_build_object(
    'apiVersion', 'customer.v1',
    'status', 'ok',
    'accepted', v_profile.privacy_consented_at is not null,
    'version', v_profile.privacy_consent_version,
    'recordedAt', v_profile.privacy_consented_at
  );
end;
$$;

create or replace function public.customer_set_default_address_v1(
  p_address_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_address_id uuid;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_address_id is null then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 21001)
  );

  select address.id
  into v_address_id
  from public.customer_addresses address
  where address.user_id = v_user_id
    and address.id = p_address_id
  for update;

  if not found then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'not_found');
  end if;

  update public.customer_addresses address
  set is_default = (address.id = p_address_id)
  where address.user_id = v_user_id
    and address.is_default is distinct from (address.id = p_address_id);

  return jsonb_build_object(
    'apiVersion', 'customer.v1',
    'status', 'ok',
    'addressId', v_address_id
  );
end;
$$;

create or replace function public.customer_request_account_deletion_v1(
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.customer_account_deletion_requests%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_idempotency_key is null then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 21002)
  );

  select request.*
  into v_request
  from public.customer_account_deletion_requests request
  where request.user_id = v_user_id
    and request.idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'apiVersion', 'customer.v1',
      'status', v_request.status,
      'requestId', v_request.id,
      'requestedAt', v_request.requested_at
    );
  end if;

  select request.*
  into v_request
  from public.customer_account_deletion_requests request
  where request.user_id = v_user_id
    and request.status in ('requested', 'processing')
  order by request.requested_at desc, request.id desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'apiVersion', 'customer.v1',
      'status', v_request.status,
      'requestId', v_request.id,
      'requestedAt', v_request.requested_at
    );
  end if;

  insert into public.customer_account_deletion_requests (
    user_id,
    idempotency_key
  )
  values (
    v_user_id,
    p_idempotency_key
  )
  returning * into v_request;

  return jsonb_build_object(
    'apiVersion', 'customer.v1',
    'status', v_request.status,
    'requestId', v_request.id,
    'requestedAt', v_request.requested_at
  );
end;
$$;

create or replace function public.customer_cancel_account_deletion_v1(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.customer_account_deletion_requests%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_request_id is null then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 21002)
  );

  select request.*
  into v_request
  from public.customer_account_deletion_requests request
  where request.user_id = v_user_id
    and request.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('apiVersion', 'customer.v1', 'status', 'not_found');
  end if;

  if v_request.status = 'requested' then
    update public.customer_account_deletion_requests request
    set
      status = 'cancelled',
      cancelled_at = statement_timestamp()
    where request.id = v_request.id
    returning * into v_request;
  elsif v_request.status <> 'cancelled' then
    return jsonb_build_object(
      'apiVersion', 'customer.v1',
      'status', 'not_cancellable',
      'requestId', v_request.id
    );
  end if;

  return jsonb_build_object(
    'apiVersion', 'customer.v1',
    'status', v_request.status,
    'requestId', v_request.id,
    'cancelledAt', v_request.cancelled_at
  );
end;
$$;

create or replace function public.customer_data_export_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_addresses jsonb;
  v_deletion_requests jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  select jsonb_build_object(
    'userId', profile.user_id,
    'displayName', profile.display_name,
    'locale', profile.locale,
    'privacyConsentVersion', profile.privacy_consent_version,
    'privacyConsentedAt', profile.privacy_consented_at,
    'createdAt', profile.created_at,
    'updatedAt', profile.updated_at
  )
  into v_profile
  from public.customer_profiles profile
  where profile.user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', address.id,
        'label', address.label,
        'recipientName', address.recipient_name,
        'addressLine1', address.address_line_1,
        'addressLine2', address.address_line_2,
        'commune', address.commune,
        'region', address.region,
        'postalCode', address.postal_code,
        'countryCode', address.country_code,
        'deliveryInstructions', address.delivery_instructions,
        'isDefault', address.is_default,
        'createdAt', address.created_at,
        'updatedAt', address.updated_at
      )
      order by address.is_default desc, address.updated_at desc, address.id
    ),
    '[]'::jsonb
  )
  into v_addresses
  from public.customer_addresses address
  where address.user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', request.id,
        'status', request.status,
        'requestedAt', request.requested_at,
        'cancelledAt', request.cancelled_at,
        'processedAt', request.processed_at,
        'updatedAt', request.updated_at
      )
      order by request.requested_at desc, request.id
    ),
    '[]'::jsonb
  )
  into v_deletion_requests
  from public.customer_account_deletion_requests request
  where request.user_id = v_user_id;

  return jsonb_build_object(
    'apiVersion', 'customer.v1',
    'generatedAt', statement_timestamp(),
    'profile', v_profile,
    'addresses', v_addresses,
    'accountDeletionRequests', v_deletion_requests
  );
end;
$$;

do $grants$
begin
  revoke all on function public.customer_record_privacy_consent_v1(text, boolean)
    from public, anon, authenticated, service_role;
  revoke all on function public.customer_set_default_address_v1(uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.customer_request_account_deletion_v1(uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.customer_cancel_account_deletion_v1(uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.customer_data_export_v1()
    from public, anon, authenticated, service_role;

  grant execute on function public.customer_record_privacy_consent_v1(text, boolean)
    to authenticated;
  grant execute on function public.customer_set_default_address_v1(uuid)
    to authenticated;
  grant execute on function public.customer_request_account_deletion_v1(uuid)
    to authenticated;
  grant execute on function public.customer_cancel_account_deletion_v1(uuid)
    to authenticated;
  grant execute on function public.customer_data_export_v1()
    to authenticated;
end;
$grants$;

comment on table public.customer_profiles is
  'Storefront customer-owned public preferences. OAuth credentials and email are intentionally absent.';
comment on table public.customer_addresses is
  'Storefront customer-owned postal addresses; fulfillment eligibility is validated separately.';
comment on table public.customer_account_deletion_requests is
  'Auditable customer account-deletion request state; no client-side destructive Auth operation.';
comment on function public.customer_data_export_v1() is
  'Allow-listed owner-only Storefront customer export contract; excludes Auth credentials and internal commerce data.';

notify pgrst, 'reload schema';

commit;
