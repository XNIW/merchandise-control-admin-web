-- CLIENT_COMMERCE_JOURNEY_COMPLETION / TASK-153..157
--
-- Additive customer-commerce contracts. Storefront clients supply identifiers and
-- expected versions only; delivery economics, payment state, refunds, moderation and
-- staff actions remain server authoritative. No production provider is activated.

begin;

-- -----------------------------------------------------------------------------
-- Customer address v2 and historical snapshot compatibility
-- -----------------------------------------------------------------------------

alter table public.customer_addresses
  add column recipient_phone_e164 text,
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add column location_source text not null default 'manual',
  add column location_accuracy_meters numeric(8, 2),
  add column provider_place_id text,
  add column validated_at timestamptz,
  add column last_selected_at timestamptz,
  add column version bigint not null default 1,
  add constraint customer_addresses_phone_e164_check check (
    recipient_phone_e164 is null
    or recipient_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'
  ),
  add constraint customer_addresses_coordinate_pair_check check (
    num_nonnulls(latitude, longitude) in (0, 2)
    and (
      latitude is null
      or (
      latitude between -90 and 90
      and longitude between -180 and 180
      )
    )
  ),
  add constraint customer_addresses_location_source_check check (
    location_source in ('manual', 'search', 'current_location', 'map_pin')
  ),
  add constraint customer_addresses_location_accuracy_check check (
    location_accuracy_meters is null
    or (
      latitude is not null
      and longitude is not null
      and location_accuracy_meters between 0 and 100000
    )
  ),
  add constraint customer_addresses_provider_place_id_check check (
    provider_place_id is null
    or (
      provider_place_id = btrim(provider_place_id)
      and length(provider_place_id) between 1 and 255
      and provider_place_id ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  add constraint customer_addresses_validated_at_check check (
    validated_at is null or pg_catalog.isfinite(validated_at)
  ),
  add constraint customer_addresses_last_selected_at_check check (
    last_selected_at is null or pg_catalog.isfinite(last_selected_at)
  ),
  add constraint customer_addresses_version_check check (version >= 1);

create or replace function app_private.customer_address_version_guard_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.latitude := case when new.latitude is null then null
    else round(new.latitude, 6) end;
  new.longitude := case when new.longitude is null then null
    else round(new.longitude, 6) end;
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger customer_addresses_version_guard_v2
  before update on public.customer_addresses
  for each row execute function app_private.customer_address_version_guard_v2();

alter table public.customer_checkout_quotes
  drop constraint customer_checkout_quotes_shape_check,
  add constraint customer_checkout_quotes_shape_check check (
    (
      fulfillment_mode in ('pickup', 'reservation')
      and address_id is null
      and pickup_point_id is not null
      and delivery_zone_id is null
      and address_snapshot is null
      and delivery_fee_clp = 0
    )
    or (
      fulfillment_mode = 'delivery'
      and pickup_point_id is null
      and delivery_zone_id is not null
      and jsonb_typeof(address_snapshot) = 'object'
      and (
        address_id is not null
        or status in ('expired', 'invalidated', 'consumed')
      )
    )
  );

create or replace function app_private.customer_address_delete_guard_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.customer_checkout_quotes quote
    where quote.user_id = old.user_id
      and quote.address_id = old.id
      and quote.status in ('quoted', 'requires_review', 'confirmed')
      and quote.expires_at > statement_timestamp()
  ) then
    raise exception using
      errcode = '55000',
      message = 'address_in_active_checkout';
  end if;

  update public.customer_checkout_quotes quote
  set address_id = null
  where quote.user_id = old.user_id
    and quote.address_id = old.id
    and quote.status in ('expired', 'invalidated', 'consumed');
  return old;
end;
$$;

create trigger customer_addresses_delete_guard_v2
  before delete on public.customer_addresses
  for each row execute function app_private.customer_address_delete_guard_v2();

create or replace function app_private.customer_order_address_snapshot_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address public.customer_addresses%rowtype;
begin
  if new.fulfillment_mode = 'delivery' and new.quote_id is not null then
    select address.* into v_address
    from public.customer_checkout_quotes quote
    join public.customer_addresses address
      on address.id = quote.address_id and address.user_id = quote.user_id
    where quote.id = new.quote_id and quote.user_id = new.user_id;
    if found then
      new.fulfillment_snapshot := jsonb_set(
        new.fulfillment_snapshot,
        '{address}',
        coalesce(new.fulfillment_snapshot->'address', '{}'::jsonb)
          || jsonb_build_object(
            'recipientPhoneE164', v_address.recipient_phone_e164,
            'addressVersion', v_address.version
          ),
        true
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger customer_order_address_snapshot_v2
  before insert on public.customer_orders
  for each row execute function app_private.customer_order_address_snapshot_v2();

grant insert (
  recipient_phone_e164, latitude, longitude, location_source,
  location_accuracy_meters, last_selected_at
) on table public.customer_addresses to authenticated;
grant update (
  recipient_phone_e164, latitude, longitude, location_source,
  location_accuracy_meters, last_selected_at
) on table public.customer_addresses to authenticated;
revoke select on table public.customer_addresses from authenticated;
grant select (
  id, user_id, label, recipient_name, recipient_phone_e164,
  address_line_1, address_line_2, commune, region, postal_code,
  country_code, delivery_instructions, latitude, longitude,
  location_source, location_accuracy_meters, validated_at,
  last_selected_at, is_default, version, created_at, updated_at
) on table public.customer_addresses to authenticated;

create or replace function app_private.customer_address_payload_v2(
  p_address public.customer_addresses
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_address.id,
    'recipientName', p_address.recipient_name,
    'recipientPhoneE164', p_address.recipient_phone_e164,
    'recipientPhoneMasked', case
      when p_address.recipient_phone_e164 is null then null
      else left(p_address.recipient_phone_e164, 3)
        || repeat('*', greatest(length(p_address.recipient_phone_e164) - 5, 3))
        || right(p_address.recipient_phone_e164, 2)
    end,
    'label', p_address.label,
    'addressLine1', p_address.address_line_1,
    'addressLine2', p_address.address_line_2,
    'commune', p_address.commune,
    'region', p_address.region,
    'postalCode', p_address.postal_code,
    'countryCode', p_address.country_code,
    'deliveryInstructions', p_address.delivery_instructions,
    'latitude', p_address.latitude,
    'longitude', p_address.longitude,
    'locationSource', p_address.location_source,
    'locationAccuracyMeters', p_address.location_accuracy_meters,
    'validatedAt', p_address.validated_at,
    'isDefault', p_address.is_default,
    'version', p_address.version,
    'updatedAt', p_address.updated_at,
    'lastSelectedAt', p_address.last_selected_at
  ));
$$;

create or replace function public.customer_addresses_read_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select coalesce(jsonb_agg(
    app_private.customer_address_payload_v2(address)
    order by address.is_default desc,
      address.last_selected_at desc nulls last,
      address.updated_at desc,
      address.id
  ), '[]'::jsonb)
  into v_items
  from public.customer_addresses address
  where address.user_id = v_user_id;
  return jsonb_build_object(
    'apiVersion', 'customer-address.v2',
    'status', 'ok',
    'items', v_items,
    'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.customer_address_upsert_v2(
  p_address_id uuid,
  p_expected_version bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_address public.customer_addresses%rowtype;
  v_set_default boolean := coalesce((p_payload->>'isDefault')::boolean, false);
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 16384
    or p_payload ?| array[
      'userId', 'ownerUserId', 'providerPlaceId', 'validatedAt',
      'createdAt', 'updatedAt'
    ]
    or p_payload->>'recipientName' is null
    or p_payload->>'label' is null
    or p_payload->>'addressLine1' is null
    or p_payload->>'commune' is null
    or p_payload->>'region' is null then
    return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-address:' || v_user_id::text, 50050)
  );
  if p_address_id is null then
    if v_set_default then
      update public.customer_addresses address
      set is_default = false
      where address.user_id = v_user_id and address.is_default;
    end if;
    insert into public.customer_addresses (
      user_id, recipient_name, recipient_phone_e164, label,
      address_line_1, address_line_2, commune, region, postal_code,
      country_code, delivery_instructions, latitude, longitude,
      location_source, location_accuracy_meters, is_default
    ) values (
      v_user_id, btrim(p_payload->>'recipientName'),
      nullif(btrim(p_payload->>'recipientPhoneE164'), ''),
      btrim(p_payload->>'label'), btrim(p_payload->>'addressLine1'),
      nullif(btrim(p_payload->>'addressLine2'), ''), btrim(p_payload->>'commune'),
      btrim(p_payload->>'region'), nullif(btrim(p_payload->>'postalCode'), ''),
      coalesce(nullif(btrim(p_payload->>'countryCode'), ''), 'CL'),
      nullif(btrim(p_payload->>'deliveryInstructions'), ''),
      nullif(p_payload->>'latitude', '')::numeric,
      nullif(p_payload->>'longitude', '')::numeric,
      coalesce(nullif(p_payload->>'locationSource', ''), 'manual'),
      nullif(p_payload->>'locationAccuracyMeters', '')::numeric,
      v_set_default
    ) returning * into v_address;
  else
    select address.* into v_address
    from public.customer_addresses address
    where address.user_id = v_user_id and address.id = p_address_id
    for update;
    if not found then
      return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'not_found');
    end if;
    if p_expected_version is null or p_expected_version <> v_address.version then
      return jsonb_build_object(
        'apiVersion', 'customer-address.v2', 'status', 'version_conflict',
        'address', app_private.customer_address_payload_v2(v_address)
      );
    end if;
    if v_set_default then
      update public.customer_addresses address
      set is_default = false
      where address.user_id = v_user_id
        and address.is_default
        and address.id <> v_address.id;
    end if;
    update public.customer_addresses address
    set recipient_name = btrim(p_payload->>'recipientName'),
        recipient_phone_e164 = nullif(btrim(p_payload->>'recipientPhoneE164'), ''),
        label = btrim(p_payload->>'label'),
        address_line_1 = btrim(p_payload->>'addressLine1'),
        address_line_2 = nullif(btrim(p_payload->>'addressLine2'), ''),
        commune = btrim(p_payload->>'commune'),
        region = btrim(p_payload->>'region'),
        postal_code = nullif(btrim(p_payload->>'postalCode'), ''),
        country_code = coalesce(nullif(btrim(p_payload->>'countryCode'), ''), 'CL'),
        delivery_instructions = nullif(btrim(p_payload->>'deliveryInstructions'), ''),
        latitude = nullif(p_payload->>'latitude', '')::numeric,
        longitude = nullif(p_payload->>'longitude', '')::numeric,
        location_source = coalesce(nullif(p_payload->>'locationSource', ''), 'manual'),
        location_accuracy_meters = nullif(p_payload->>'locationAccuracyMeters', '')::numeric,
        is_default = v_set_default
    where address.id = v_address.id
    returning * into v_address;
  end if;
  return jsonb_build_object(
    'apiVersion', 'customer-address.v2', 'status', 'ok',
    'address', app_private.customer_address_payload_v2(v_address),
    'serverTime', statement_timestamp()
  );
exception
  when check_violation or invalid_text_representation or datetime_field_overflow then
    return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'invalid');
end;
$$;

create or replace function public.customer_address_delete_v2(
  p_address_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_address public.customer_addresses%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select address.* into v_address
  from public.customer_addresses address
  where address.user_id = v_user_id and address.id = p_address_id
  for update;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'not_found');
  end if;
  if p_expected_version is null or p_expected_version <> v_address.version then
    return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'version_conflict');
  end if;
  if exists (
    select 1 from public.customer_checkout_quotes quote
    where quote.user_id = v_user_id and quote.address_id = p_address_id
      and quote.status in ('quoted', 'requires_review', 'confirmed')
      and quote.expires_at > statement_timestamp()
  ) then
    return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'in_active_checkout');
  end if;
  delete from public.customer_addresses address where address.id = v_address.id;
  return jsonb_build_object('apiVersion', 'customer-address.v2', 'status', 'ok');
end;
$$;

-- -----------------------------------------------------------------------------
-- Owner/shop-scoped delivery context using existing zones, points and slots
-- -----------------------------------------------------------------------------

create table public.customer_delivery_contexts (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  shop_slug text not null,
  mode text not null,
  address_id uuid,
  pickup_point_id uuid,
  serviceability_status text not null,
  delivery_zone_id uuid,
  estimated_fee_clp bigint,
  earliest_slot_starts_at timestamptz,
  earliest_slot_ends_at timestamptz,
  version bigint not null default 1,
  selected_at timestamptz not null default statement_timestamp(),
  server_time timestamptz not null default statement_timestamp(),
  primary key (owner_user_id, shop_id),
  constraint customer_delivery_context_shop_slug_check check (
    shop_slug = lower(btrim(shop_slug))
    and shop_slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'
  ),
  constraint customer_delivery_context_mode_check check (mode in ('delivery', 'pickup')),
  constraint customer_delivery_context_status_check check (
    serviceability_status in ('serviceable', 'unsupported', 'invalid', 'temporarilyUnavailable')
  ),
  constraint customer_delivery_context_shape_check check (
    (mode = 'delivery' and address_id is not null and pickup_point_id is null)
    or (mode = 'pickup' and address_id is null and pickup_point_id is not null)
  ),
  constraint customer_delivery_context_address_owner_fkey foreign key (
    owner_user_id, address_id
  ) references public.customer_addresses(user_id, id) on delete cascade,
  constraint customer_delivery_context_pickup_fkey foreign key (
    shop_id, pickup_point_id
  ) references public.storefront_pickup_points(shop_id, id) on delete cascade,
  constraint customer_delivery_context_zone_fkey foreign key (
    shop_id, delivery_zone_id
  ) references public.storefront_delivery_zones(shop_id, id) on delete set null,
  constraint customer_delivery_context_fee_check check (
    estimated_fee_clp is null or estimated_fee_clp between 0 and 999999999999
  ),
  constraint customer_delivery_context_slot_check check (
    (earliest_slot_starts_at is null and earliest_slot_ends_at is null)
    or earliest_slot_starts_at < earliest_slot_ends_at
  ),
  constraint customer_delivery_context_version_check check (version >= 1)
);

create index customer_delivery_context_shop_status_idx
  on public.customer_delivery_contexts(shop_id, serviceability_status, selected_at desc);
alter table public.customer_delivery_contexts enable row level security;
alter table public.customer_delivery_contexts force row level security;
create policy customer_delivery_context_select_owner
  on public.customer_delivery_contexts for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
revoke all on table public.customer_delivery_contexts from public, anon, authenticated;
grant select on table public.customer_delivery_contexts to authenticated;
grant select, insert, update, delete on table public.customer_delivery_contexts to service_role;

create or replace function public.storefront_delivery_context_preview_v1(
  p_shop_slug text,
  p_mode text,
  p_address_id uuid default null,
  p_pickup_point_id uuid default null,
  p_commune text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_setting public.storefront_settings%rowtype;
  v_address public.customer_addresses%rowtype;
  v_point public.storefront_pickup_points%rowtype;
  v_zone public.storefront_delivery_zones%rowtype;
  v_slot public.storefront_fulfillment_slots%rowtype;
  v_commune text;
begin
  if p_shop_slug is null or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or p_mode not in ('delivery', 'pickup') then
    return jsonb_build_object(
      'apiVersion', 'storefront-delivery-context.v1', 'status', 'invalid',
      'serviceabilityStatus', 'invalid', 'serverTime', v_now
    );
  end if;
  select setting.* into v_setting
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug and setting.storefront_enabled;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'storefront-delivery-context.v1', 'status', 'unavailable',
      'serviceabilityStatus', 'temporarilyUnavailable', 'serverTime', v_now
    );
  end if;

  if p_mode = 'delivery' then
    if not v_setting.delivery_enabled or p_pickup_point_id is not null then
      return jsonb_build_object(
        'apiVersion', 'storefront-delivery-context.v1', 'status', 'ok',
        'shopSlug', p_shop_slug, 'mode', p_mode,
        'serviceabilityStatus', 'temporarilyUnavailable', 'serverTime', v_now
      );
    end if;
    if p_address_id is not null then
      if v_user_id is null
        or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
        return jsonb_build_object(
          'apiVersion', 'storefront-delivery-context.v1', 'status', 'invalid',
          'serviceabilityStatus', 'invalid', 'serverTime', v_now
        );
      end if;
      select address.* into v_address
      from public.customer_addresses address
      where address.id = p_address_id and address.user_id = v_user_id;
      if not found then
        return jsonb_build_object(
          'apiVersion', 'storefront-delivery-context.v1', 'status', 'invalid',
          'serviceabilityStatus', 'invalid', 'serverTime', v_now
        );
      end if;
      v_commune := v_address.commune;
    else
      v_commune := nullif(btrim(p_commune), '');
    end if;
    if v_commune is null or length(v_commune) > 100 or v_commune ~ '[[:cntrl:]]' then
      return jsonb_build_object(
        'apiVersion', 'storefront-delivery-context.v1', 'status', 'invalid',
        'serviceabilityStatus', 'invalid', 'serverTime', v_now
      );
    end if;
    select zone.* into v_zone
    from public.storefront_delivery_zones zone
    where zone.shop_id = v_setting.shop_id and zone.enabled
      and exists (
        select 1 from public.storefront_delivery_zone_communes commune
        where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
          and lower(regexp_replace(commune.commune, '\s+', ' ', 'g'))
            = lower(regexp_replace(v_commune, '\s+', ' ', 'g'))
      )
    order by zone.sort_rank, zone.id
    limit 1;
    if not found then
      return jsonb_build_object(
        'apiVersion', 'storefront-delivery-context.v1', 'status', 'ok',
        'shopSlug', p_shop_slug, 'mode', p_mode,
        'serviceabilityStatus', 'unsupported', 'serverTime', v_now
      );
    end if;
    select slot.* into v_slot
    from public.storefront_fulfillment_slots slot
    where slot.shop_id = v_setting.shop_id and slot.delivery_zone_id = v_zone.id
      and slot.fulfillment_mode = 'delivery' and slot.enabled
      and slot.ends_at > v_now and slot.starts_at <= v_now + interval '14 days'
      and slot.capacity > app_private.storefront_fulfillment_slot_active_uses_v1(
        slot.id, null, v_now
      )
    order by slot.starts_at, slot.id
    limit 1;
    return jsonb_strip_nulls(jsonb_build_object(
      'apiVersion', 'storefront-delivery-context.v1', 'status', 'ok',
      'shopSlug', p_shop_slug, 'mode', p_mode,
      'addressId', p_address_id,
      'serviceabilityStatus', case when v_slot.id is null
        then 'temporarilyUnavailable' else 'serviceable' end,
      'deliveryZoneId', v_zone.id, 'deliveryZoneName', v_zone.public_name,
      'estimatedFeeClp', v_zone.fee_clp,
      'earliestSlotStartsAt', v_slot.starts_at,
      'earliestSlotEndsAt', v_slot.ends_at,
      'serverTime', v_now
    ));
  end if;

  if not v_setting.pickup_enabled or p_address_id is not null
    or p_pickup_point_id is null then
    return jsonb_build_object(
      'apiVersion', 'storefront-delivery-context.v1', 'status', 'invalid',
      'serviceabilityStatus', 'invalid', 'serverTime', v_now
    );
  end if;
  select point.* into v_point
  from public.storefront_pickup_points point
  where point.shop_id = v_setting.shop_id and point.id = p_pickup_point_id
    and point.enabled;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'storefront-delivery-context.v1', 'status', 'ok',
      'shopSlug', p_shop_slug, 'mode', p_mode,
      'serviceabilityStatus', 'unsupported', 'serverTime', v_now
    );
  end if;
  select slot.* into v_slot
  from public.storefront_fulfillment_slots slot
  where slot.shop_id = v_setting.shop_id and slot.pickup_point_id = v_point.id
    and slot.fulfillment_mode = 'pickup' and slot.enabled
    and slot.ends_at > v_now and slot.starts_at <= v_now + interval '14 days'
    and slot.capacity > app_private.storefront_fulfillment_slot_active_uses_v1(
      slot.id, null, v_now
    )
  order by slot.starts_at, slot.id
  limit 1;
  return jsonb_strip_nulls(jsonb_build_object(
    'apiVersion', 'storefront-delivery-context.v1', 'status', 'ok',
    'shopSlug', p_shop_slug, 'mode', p_mode,
    'pickupPointId', v_point.id, 'pickupPointName', v_point.public_name,
    'serviceabilityStatus', case when v_slot.id is null
      then 'temporarilyUnavailable' else 'serviceable' end,
    'estimatedFeeClp', 0,
    'earliestSlotStartsAt', v_slot.starts_at,
    'earliestSlotEndsAt', v_slot.ends_at,
    'serverTime', v_now
  ));
end;
$$;

create or replace function public.customer_delivery_context_select_v1(
  p_shop_slug text,
  p_mode text,
  p_address_id uuid,
  p_pickup_point_id uuid,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_setting public.storefront_settings%rowtype;
  v_existing public.customer_delivery_contexts%rowtype;
  v_context public.customer_delivery_contexts%rowtype;
  v_preview jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select setting.* into v_setting from public.storefront_settings setting
  where setting.public_slug = p_shop_slug and setting.storefront_enabled;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-delivery-context.v1', 'status', 'unavailable');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-delivery-context:' || v_user_id::text || ':' || v_setting.shop_id::text,
    50050
  ));
  select context.* into v_existing
  from public.customer_delivery_contexts context
  where context.owner_user_id = v_user_id and context.shop_id = v_setting.shop_id
  for update;
  if found and (p_expected_version is null or p_expected_version <> v_existing.version) then
    return jsonb_build_object(
      'apiVersion', 'customer-delivery-context.v1', 'status', 'version_conflict',
      'version', v_existing.version
    );
  end if;
  if not found and p_expected_version is not null and p_expected_version <> 0 then
    return jsonb_build_object('apiVersion', 'customer-delivery-context.v1', 'status', 'version_conflict');
  end if;
  v_preview := public.storefront_delivery_context_preview_v1(
    p_shop_slug, p_mode, p_address_id, p_pickup_point_id, null
  );
  if v_preview->>'status' <> 'ok'
    or v_preview->>'serviceabilityStatus' = 'invalid' then
    return v_preview || jsonb_build_object('apiVersion', 'customer-delivery-context.v1');
  end if;
  insert into public.customer_delivery_contexts (
    owner_user_id, shop_id, shop_slug, mode, address_id, pickup_point_id,
    serviceability_status, delivery_zone_id, estimated_fee_clp,
    earliest_slot_starts_at, earliest_slot_ends_at, version, selected_at, server_time
  ) values (
    v_user_id, v_setting.shop_id, p_shop_slug, p_mode, p_address_id, p_pickup_point_id,
    v_preview->>'serviceabilityStatus',
    nullif(v_preview->>'deliveryZoneId', '')::uuid,
    nullif(v_preview->>'estimatedFeeClp', '')::bigint,
    nullif(v_preview->>'earliestSlotStartsAt', '')::timestamptz,
    nullif(v_preview->>'earliestSlotEndsAt', '')::timestamptz,
    coalesce(v_existing.version + 1, 1), statement_timestamp(), statement_timestamp()
  ) on conflict (owner_user_id, shop_id) do update
  set shop_slug = excluded.shop_slug,
      mode = excluded.mode,
      address_id = excluded.address_id,
      pickup_point_id = excluded.pickup_point_id,
      serviceability_status = excluded.serviceability_status,
      delivery_zone_id = excluded.delivery_zone_id,
      estimated_fee_clp = excluded.estimated_fee_clp,
      earliest_slot_starts_at = excluded.earliest_slot_starts_at,
      earliest_slot_ends_at = excluded.earliest_slot_ends_at,
      version = excluded.version,
      selected_at = excluded.selected_at,
      server_time = excluded.server_time
  returning * into v_context;
  if p_address_id is not null then
    update public.customer_addresses address
    set last_selected_at = statement_timestamp()
    where address.user_id = v_user_id and address.id = p_address_id;
  end if;
  return v_preview || jsonb_build_object(
    'apiVersion', 'customer-delivery-context.v1',
    'contextVersion', v_context.version,
    'selectedAt', v_context.selected_at
  );
end;
$$;

create or replace function public.customer_delivery_context_read_v1(p_shop_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_context public.customer_delivery_contexts%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select context.* into v_context
  from public.customer_delivery_contexts context
  where context.owner_user_id = v_user_id and context.shop_slug = p_shop_slug;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-delivery-context.v1', 'status', 'not_found');
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'apiVersion', 'customer-delivery-context.v1', 'status', 'ok',
    'ownerUserId', v_context.owner_user_id,
    'shopSlug', v_context.shop_slug, 'mode', v_context.mode,
    'addressId', v_context.address_id, 'pickupPointId', v_context.pickup_point_id,
    'serviceabilityStatus', v_context.serviceability_status,
    'deliveryZoneId', v_context.delivery_zone_id,
    'estimatedFeeClp', v_context.estimated_fee_clp,
    'earliestSlotStartsAt', v_context.earliest_slot_starts_at,
    'earliestSlotEndsAt', v_context.earliest_slot_ends_at,
    'version', v_context.version, 'selectedAt', v_context.selected_at,
    'serverTime', statement_timestamp()
  ));
end;
$$;

create or replace function public.customer_checkout_quote_create_v2(
  p_shop_slug text,
  p_cart_version bigint,
  p_fulfillment_mode text,
  p_address_id uuid,
  p_pickup_point_id uuid,
  p_slot_id uuid,
  p_expected_context_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_context public.customer_delivery_contexts%rowtype;
  v_preview jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select context.* into v_context
  from public.customer_delivery_contexts context
  where context.owner_user_id = v_user_id and context.shop_slug = p_shop_slug
  for share;
  if not found or p_expected_context_version is null
    or v_context.version <> p_expected_context_version
    or v_context.mode <> p_fulfillment_mode
    or v_context.address_id is distinct from p_address_id
    or v_context.pickup_point_id is distinct from p_pickup_point_id then
    return jsonb_build_object(
      'apiVersion', 'customer-checkout.v2', 'status', 'stale_context',
      'serverTime', statement_timestamp()
    );
  end if;
  v_preview := public.storefront_delivery_context_preview_v1(
    p_shop_slug, p_fulfillment_mode, p_address_id, p_pickup_point_id, null
  );
  if v_preview->>'serviceabilityStatus' <> 'serviceable'
    or nullif(v_preview->>'earliestSlotStartsAt', '') is null then
    return jsonb_build_object(
      'apiVersion', 'customer-checkout.v2',
      'status', coalesce(v_preview->>'serviceabilityStatus', 'invalid'),
      'serverTime', statement_timestamp()
    );
  end if;
  return public.customer_checkout_quote_create_v1(
    p_shop_slug, p_cart_version, p_fulfillment_mode,
    p_address_id, p_pickup_point_id, p_slot_id, p_idempotency_key
  ) || jsonb_build_object(
    'apiVersion', 'customer-checkout.v2',
    'contextVersion', v_context.version
  );
end;
$$;

-- Payment recovery reads the existing aggregate; no amount, status or provider data
-- is accepted from the client and online remains fail-closed until configured.
create or replace function public.customer_payment_recovery_read_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.customer_order_payments%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select payment.* into v_payment
  from public.customer_order_payments payment
  where payment.order_id = p_order_id and payment.user_id = v_user_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-payment-recovery.v1', 'status', 'not_found');
  end if;
  return jsonb_build_object(
    'apiVersion', 'customer-payment-recovery.v1', 'status', 'ok',
    'orderId', v_payment.order_id, 'paymentId', v_payment.id,
    'method', v_payment.method, 'paymentStatus', v_payment.status,
    'amountClp', v_payment.amount_clp, 'currencyCode', v_payment.currency_code,
    'statusVersion', v_payment.status_version,
    'retryAllowed', v_payment.method = 'online_payment'
      and v_payment.status in ('failed', 'cancelled'),
    'serverTime', statement_timestamp()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Persistent notification inbox: the existing event ledger remains authoritative
-- -----------------------------------------------------------------------------

drop trigger customer_notification_events_guard on public.customer_notification_events;
alter table public.customer_notification_events
  drop constraint customer_notification_events_source_kind_check,
  drop constraint customer_notification_events_event_key_check,
  drop constraint customer_notification_events_source_check,
  add column category text not null default 'order',
  add column title_key text not null default 'notification.order.title',
  add column body_key text not null default 'notification.order.status',
  add column safe_arguments jsonb not null default '{}'::jsonb,
  add column destination_type text not null default 'order',
  add column destination_id uuid,
  add column read_at timestamptz,
  add column expires_at timestamptz;

update public.customer_notification_events notification_event
set destination_type = case when notification_event.order_id is null
      then 'notifications' else 'order' end,
    destination_id = coalesce(
      notification_event.order_id,
      notification_event.shop_id
    ),
    title_key = case when notification_event.order_id is null
      then 'notification.reservation.title' else 'notification.order.title' end,
    body_key = 'notification.' || notification_event.event_key,
    safe_arguments = jsonb_strip_nulls(jsonb_build_object(
      'orderCode', notification_event.public_order_code_short
    ));

create or replace function app_private.customer_notification_arguments_safe_v1(
  p_arguments jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_typeof(p_arguments) = 'object'
    and pg_column_size(p_arguments) <= 4096
    and p_arguments - array['orderCode', 'caseCode']::text[] = '{}'::jsonb
    and (
      not p_arguments ? 'orderCode'
      or (
        jsonb_typeof(p_arguments->'orderCode') = 'string'
        and p_arguments->>'orderCode' ~ '^[0-9A-F]{6}$'
      )
    )
    and (
      not p_arguments ? 'caseCode'
      or (
        jsonb_typeof(p_arguments->'caseCode') = 'string'
        and p_arguments->>'caseCode' ~ '^CS-[0-9A-F]{16}$'
      )
    );
$$;

alter table public.customer_notification_events
  add constraint customer_notification_events_source_kind_check check (
    source_kind in ('order_status', 'reservation_hold', 'payment', 'after_sales', 'system')
  ),
  add constraint customer_notification_events_event_key_check check (
    event_key ~ '^[a-z][a-z0-9_]{1,79}$'
  ),
  add constraint customer_notification_events_source_check check (
    (
      source_kind = 'order_status'
      and source_event_id is not null
      and order_id is not null
      and reservation_hold_id is null
      and event_key <> 'reservation_expiring'
      and event_version >= 1
      and public_order_code_short ~ '^[0-9A-F]{6}$'
    )
    or (
      source_kind = 'reservation_hold'
      and source_event_id is null
      and order_id is null
      and reservation_hold_id is not null
      and event_key = 'reservation_expiring'
      and event_version = 1
      and public_order_code_short is null
    )
    or (
      source_kind in ('payment', 'after_sales', 'system')
      and source_event_id is null
      and reservation_hold_id is null
      and event_version >= 1
    )
  ),
  add constraint customer_notification_events_category_check check (
    category in ('order', 'payment', 'afterSales', 'system')
  ),
  add constraint customer_notification_events_localization_check check (
    title_key ~ '^[a-z][a-zA-Z0-9_.]{1,119}$'
    and body_key ~ '^[a-z][a-zA-Z0-9_.]{1,119}$'
  ),
  add constraint customer_notification_events_arguments_check check (
    app_private.customer_notification_arguments_safe_v1(safe_arguments)
  ),
  add constraint customer_notification_events_destination_check check (
    destination_type in ('order', 'after_sales', 'product', 'notifications')
    and destination_id is not null
  ),
  add constraint customer_notification_events_read_check check (
    read_at is null or read_at >= created_at
  ),
  add constraint customer_notification_events_expiry_check check (
    expires_at is null or expires_at > created_at
  );

create unique index customer_notification_events_safe_dedup_idx
  on public.customer_notification_events(
    user_id, shop_id, source_kind, destination_id, event_key, event_version
  );
create index customer_notification_events_inbox_idx
  on public.customer_notification_events(
    user_id, shop_id, created_at desc, id desc
  );
create index customer_notification_events_unread_idx
  on public.customer_notification_events(user_id, shop_id, created_at desc)
  where read_at is null;

create or replace function app_private.customer_notification_event_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.shop_id is distinct from old.shop_id
    or new.shop_slug is distinct from old.shop_slug
    or new.source_kind is distinct from old.source_kind
    or new.source_event_id is distinct from old.source_event_id
    or new.order_id is distinct from old.order_id
    or new.reservation_hold_id is distinct from old.reservation_hold_id
    or new.event_key is distinct from old.event_key
    or new.event_version is distinct from old.event_version
    or new.route_token is distinct from old.route_token
    or new.public_order_code_short is distinct from old.public_order_code_short
    or new.occurred_at is distinct from old.occurred_at
    or new.created_at is distinct from old.created_at
    or new.category is distinct from old.category
    or new.title_key is distinct from old.title_key
    or new.body_key is distinct from old.body_key
    or new.safe_arguments is distinct from old.safe_arguments
    or new.destination_type is distinct from old.destination_type
    or new.destination_id is distinct from old.destination_id
    or new.expires_at is distinct from old.expires_at
    or old.read_at is not null and new.read_at is distinct from old.read_at then
    raise exception using errcode = '55000',
      message = 'customer_notification_event_append_only';
  end if;
  return new;
end;
$$;

create trigger customer_notification_events_guard
  before update on public.customer_notification_events
  for each row execute function app_private.customer_notification_event_guard_v1();

create or replace function public.customer_notifications_list_v1(
  p_shop_slug text,
  p_category text default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_unread bigint;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_shop_slug is null or p_shop_slug <> lower(btrim(p_shop_slug))
    or (p_category is not null and p_category not in ('order', 'payment', 'afterSales'))
    or (p_before_created_at is null and p_before_id is not null)
    or p_page_size not between 1 and 50 then
    return jsonb_build_object('apiVersion', 'customer-notifications.v1', 'status', 'invalid');
  end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', page.id, 'shopSlug', page.shop_slug, 'category', page.category,
    'event', page.event_key, 'eventVersion', page.event_version,
    'titleKey', page.title_key, 'bodyKey', page.body_key,
    'safeArguments', page.safe_arguments,
    'destinationType', page.destination_type,
    'destinationId', page.destination_id,
    'createdAt', page.created_at, 'readAt', page.read_at,
    'expiresAt', page.expires_at
  )) order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select notification_event.*
    from public.customer_notification_events notification_event
    where notification_event.user_id = v_user_id
      and notification_event.shop_slug = p_shop_slug
      and (p_category is null or notification_event.category = p_category)
      and (notification_event.expires_at is null
        or notification_event.expires_at > statement_timestamp())
      and (
        p_before_created_at is null
        or (
          p_before_id is null
          and notification_event.created_at < p_before_created_at
        )
        or (
          p_before_id is not null
          and (notification_event.created_at, notification_event.id)
            < (p_before_created_at, p_before_id)
        )
      )
    order by notification_event.created_at desc, notification_event.id desc
    limit p_page_size
  ) page;
  select count(*) into v_unread
  from public.customer_notification_events notification_event
  where notification_event.user_id = v_user_id
    and notification_event.shop_slug = p_shop_slug
    and notification_event.read_at is null
    and (notification_event.expires_at is null
      or notification_event.expires_at > statement_timestamp());
  return jsonb_build_object(
    'apiVersion', 'customer-notifications.v1', 'status', 'ok',
    'items', v_items, 'unreadCount', v_unread,
    'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.customer_notification_mark_read_v1(p_notification_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_read_at timestamptz;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  update public.customer_notification_events notification_event
  set read_at = coalesce(notification_event.read_at, statement_timestamp())
  where notification_event.id = p_notification_id
    and notification_event.user_id = v_user_id
  returning read_at into v_read_at;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-notifications.v1', 'status', 'not_found');
  end if;
  return jsonb_build_object(
    'apiVersion', 'customer-notifications.v1', 'status', 'ok', 'readAt', v_read_at
  );
end;
$$;

create or replace function public.customer_notifications_mark_all_read_v1(p_shop_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  update public.customer_notification_events notification_event
  set read_at = statement_timestamp()
  where notification_event.user_id = v_user_id
    and notification_event.shop_slug = p_shop_slug
    and notification_event.read_at is null
    and (notification_event.expires_at is null
      or notification_event.expires_at > statement_timestamp());
  get diagnostics v_count = row_count;
  return jsonb_build_object(
    'apiVersion', 'customer-notifications.v1', 'status', 'ok',
    'updatedCount', v_count, 'serverTime', statement_timestamp()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Owner/shop-scoped reorder preview and batch apply at current catalog truth
-- -----------------------------------------------------------------------------

create table public.customer_reorder_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  idempotency_key uuid not null,
  request_sha256 text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default statement_timestamp() + interval '7 days',
  constraint customer_reorder_mutations_owner_key_unique unique (
    user_id, shop_id, idempotency_key
  ),
  constraint customer_reorder_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_reorder_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 262144
  ),
  constraint customer_reorder_mutations_retention_check check (
    retained_until > created_at
    and retained_until <= created_at + interval '8 days'
  )
);
create index customer_reorder_mutations_retention_idx
  on public.customer_reorder_mutations(retained_until, id);
alter table public.customer_reorder_mutations enable row level security;
alter table public.customer_reorder_mutations force row level security;
revoke all on table public.customer_reorder_mutations from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_reorder_mutations to service_role;

create or replace function app_private.customer_order_reorder_preview_v1(
  p_user_id uuid,
  p_order_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders%rowtype;
  v_items jsonb;
begin
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = p_order_id and customer_order.user_id = p_user_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-reorder.v1', 'status', 'not_found');
  end if;
  if v_order.status not in ('completed', 'cancelled') then
    return jsonb_build_object('apiVersion', 'customer-reorder.v1', 'status', 'not_eligible');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', item.id,
    'publicationId', item.publication_id,
    'name', item.public_name,
    'requestedQuantity', item.quantity,
    'allowedQuantity', case when catalog.publication_id is null then 0 else least(item.quantity, 99) end,
    'availability', case
      when catalog.publication_id is null then 'unavailable'
      when catalog.availability_mode = 'unavailable' then 'unavailable'
      else 'available' end,
    'historicalPriceClp', item.unit_price_clp,
    'currentPriceClp', catalog.price_clp,
    'currentCompareAtPriceClp', catalog.compare_at_price_clp,
    'currentPromotionName', catalog.promotion_name,
    'priceDifferenceClp', case when catalog.publication_id is null then null
      else catalog.price_clp - item.unit_price_clp end
  ) order by item.line_position), '[]'::jsonb)
  into v_items
  from public.customer_order_items item
  left join public.storefront_catalog_items catalog
    on catalog.shop_id = item.shop_id and catalog.publication_id = item.publication_id
    and catalog.storefront_enabled and catalog.availability_mode <> 'unavailable'
  where item.order_id = v_order.id;
  return jsonb_build_object(
    'apiVersion', 'customer-reorder.v1', 'status', 'ok',
    'orderId', v_order.id, 'shopId', v_order.shop_id,
    'items', v_items, 'serverTime', p_at
  );
end;
$$;

create or replace function public.customer_order_reorder_preview_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  return app_private.customer_order_reorder_preview_v1(
    v_user_id, p_order_id, statement_timestamp()
  );
end;
$$;

create or replace function public.customer_order_reorder_apply_v1(
  p_order_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_order public.customer_orders%rowtype;
  v_cart public.customer_carts%rowtype;
  v_previous public.customer_reorder_mutations%rowtype;
  v_hash text;
  v_added jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_result jsonb;
  v_line record;
  v_previous_quantity integer;
  v_effective_quantity integer;
  v_requested_quantity integer;
  v_added_quantity integer;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_order_id is null or p_idempotency_key is null then
    return jsonb_build_object('apiVersion', 'customer-reorder.v1', 'status', 'invalid');
  end if;
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = p_order_id and customer_order.user_id = v_user_id
  for share;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-reorder.v1', 'status', 'not_found');
  end if;
  if v_order.status not in ('completed', 'cancelled') then
    return jsonb_build_object('apiVersion', 'customer-reorder.v1', 'status', 'not_eligible');
  end if;
  v_hash := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array('reorder', p_order_id)::text, 'UTF8'),
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-cart:' || v_user_id::text || ':' || v_order.shop_id::text, 23023
  ));
  delete from public.customer_reorder_mutations mutation
  where mutation.retained_until <= v_now;
  select mutation.* into v_previous
  from public.customer_reorder_mutations mutation
  where mutation.user_id = v_user_id and mutation.shop_id = v_order.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.order_id <> p_order_id or v_previous.request_sha256 <> v_hash then
      return jsonb_build_object('apiVersion', 'customer-reorder.v1', 'status', 'idempotency_conflict');
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;
  insert into public.customer_carts(user_id, shop_id)
  values (v_user_id, v_order.shop_id)
  on conflict (user_id, shop_id) do nothing;
  select cart.* into v_cart from public.customer_carts cart
  where cart.user_id = v_user_id and cart.shop_id = v_order.shop_id
  for update;
  for v_line in
    select item.*, catalog.public_name as current_name,
      catalog.price_clp as current_price_clp,
      catalog.compare_at_price_clp as current_compare_at_price_clp,
      catalog.promotion_id as current_promotion_id,
      catalog.promotion_ends_at as current_promotion_ends_at,
      catalog.image_thumb_url as current_image_url
    from public.customer_order_items item
    left join public.storefront_catalog_items catalog
      on catalog.shop_id = item.shop_id and catalog.publication_id = item.publication_id
      and catalog.storefront_enabled and catalog.availability_mode <> 'unavailable'
    where item.order_id = v_order.id
    order by item.line_position
  loop
    if v_line.current_name is null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'orderItemId', v_line.id, 'publicationId', v_line.publication_id,
        'name', v_line.public_name, 'reason', 'unavailable'
      ));
    else
      select coalesce((
        select cart_item.quantity
        from public.customer_cart_items cart_item
        where cart_item.cart_id = v_cart.id
          and cart_item.publication_id = v_line.publication_id
        for update
      ), 0) into v_previous_quantity;
      v_requested_quantity := least(v_line.quantity, 99);
      insert into public.customer_cart_items(
        cart_id, user_id, shop_id, publication_id, quantity,
        snapshot_public_name, snapshot_price_clp, snapshot_compare_at_price_clp,
        snapshot_promotion_id, snapshot_promotion_ends_at,
        snapshot_image_url, snapshot_at
      ) values (
        v_cart.id, v_user_id, v_order.shop_id, v_line.publication_id,
        v_requested_quantity, v_line.current_name, v_line.current_price_clp,
        v_line.current_compare_at_price_clp, v_line.current_promotion_id,
        v_line.current_promotion_ends_at, v_line.current_image_url, v_now
      ) on conflict (cart_id, publication_id) do update
      set quantity = least(public.customer_cart_items.quantity + excluded.quantity, 99),
          snapshot_public_name = excluded.snapshot_public_name,
          snapshot_price_clp = excluded.snapshot_price_clp,
          snapshot_compare_at_price_clp = excluded.snapshot_compare_at_price_clp,
          snapshot_promotion_id = excluded.snapshot_promotion_id,
          snapshot_promotion_ends_at = excluded.snapshot_promotion_ends_at,
          snapshot_image_url = excluded.snapshot_image_url,
          snapshot_at = excluded.snapshot_at
      returning quantity into v_effective_quantity;
      v_added_quantity := greatest(v_effective_quantity - v_previous_quantity, 0);
      if v_added_quantity > 0 then
        v_added := v_added || jsonb_build_array(jsonb_build_object(
          'orderItemId', v_line.id, 'publicationId', v_line.publication_id,
          'name', v_line.current_name, 'quantity', v_added_quantity,
          'currentPriceClp', v_line.current_price_clp
        ));
      end if;
      if v_requested_quantity > v_added_quantity then
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
          'orderItemId', v_line.id, 'publicationId', v_line.publication_id,
          'name', v_line.current_name, 'reason', 'quantity_capped',
          'quantity', v_requested_quantity - v_added_quantity
        ));
      end if;
    end if;
  end loop;
  if jsonb_array_length(v_added) > 0 then
    update public.customer_carts cart
    set cart_version = cart.cart_version + 1, last_revalidated_at = v_now
    where cart.id = v_cart.id returning * into v_cart;
  end if;
  v_result := jsonb_build_object(
    'apiVersion', 'customer-reorder.v1', 'status', 'ok',
    'idempotent', false, 'orderId', v_order.id, 'cartId', v_cart.id,
    'cartVersion', v_cart.cart_version,
    'added', v_added, 'skipped', v_skipped, 'serverTime', v_now
  );
  insert into public.customer_reorder_mutations(
    user_id, shop_id, order_id, idempotency_key, request_sha256, response_payload
  ) values (
    v_user_id, v_order.shop_id, v_order.id, p_idempotency_key, v_hash, v_result
  );
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Customer after-sales cases, private evidence and refund authority
-- -----------------------------------------------------------------------------

create table public.customer_service_cases (
  id uuid primary key default gen_random_uuid(),
  public_case_code text not null default (
    'CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  ),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  case_type text not null,
  status text not null default 'submitted',
  reason_key text not null,
  customer_note text,
  version bigint not null default 1,
  submitted_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  closed_at timestamptz,
  constraint customer_service_cases_code_unique unique (public_case_code),
  constraint customer_service_cases_owner_shop_id_unique unique (user_id, shop_id, id),
  constraint customer_service_cases_code_check check (
    public_case_code ~ '^CS-[0-9A-F]{16}$'
  ),
  constraint customer_service_cases_type_check check (
    case_type in ('orderProblem', 'returnRequest', 'refundRequest')
  ),
  constraint customer_service_cases_status_check check (
    status in (
      'submitted', 'reviewing', 'approved', 'rejected', 'returnRequired',
      'received', 'refundPending', 'refunded', 'closed'
    )
  ),
  constraint customer_service_cases_reason_check check (
    reason_key in (
      'damaged', 'wrong_item', 'missing_item', 'quality_issue',
      'changed_mind', 'delivery_issue', 'other'
    )
  ),
  constraint customer_service_cases_note_check check (
    customer_note is null
    or (
      customer_note = btrim(customer_note)
      and length(customer_note) between 1 and 1000
      and customer_note !~ '[[:cntrl:]]'
    )
  ),
  constraint customer_service_cases_version_check check (version >= 1),
  constraint customer_service_cases_lifecycle_check check (
    (status in ('rejected', 'refunded', 'closed') and closed_at is not null)
    or (status not in ('rejected', 'refunded', 'closed') and closed_at is null)
  )
);
create index customer_service_cases_owner_created_idx
  on public.customer_service_cases(user_id, submitted_at desc, id desc);
create index customer_service_cases_shop_queue_idx
  on public.customer_service_cases(shop_id, status, updated_at, id);

create table public.customer_service_case_lines (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.customer_service_cases(id) on delete cascade,
  order_item_id uuid not null references public.customer_order_items(id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_service_case_lines_case_item_unique unique (case_id, order_item_id),
  constraint customer_service_case_lines_quantity_check check (quantity between 1 and 99)
);

create table public.customer_service_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.customer_service_cases(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  event_version bigint not null,
  status text not null,
  actor_kind text not null,
  note_key text,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_service_case_events_version_unique unique (case_id, event_version),
  constraint customer_service_case_events_version_check check (event_version >= 1),
  constraint customer_service_case_events_status_check check (
    status in (
      'submitted', 'reviewing', 'approved', 'rejected', 'returnRequired',
      'received', 'refundPending', 'refunded', 'closed'
    )
  ),
  constraint customer_service_case_events_actor_check check (
    actor_kind in ('customer', 'staff', 'provider', 'system')
  ),
  constraint customer_service_case_events_note_key_check check (
    note_key is null or note_key ~ '^[a-z][a-zA-Z0-9_.]{1,119}$'
  ),
  constraint customer_service_case_events_metadata_check check (
    jsonb_typeof(metadata_redacted) = 'object'
    and pg_column_size(metadata_redacted) <= 8192
    and metadata_redacted::text !~* '(phone|address|latitude|longitude|token|secret)'
  )
);
create index customer_service_case_events_case_idx
  on public.customer_service_case_events(case_id, event_version, created_at);

create table public.customer_service_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.customer_service_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  object_path text not null,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  exif_removed boolean not null default false,
  scan_status text not null default 'pending_scan',
  rejection_code text,
  cleanup_claim_id uuid,
  cleanup_claimed_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  scanned_at timestamptz,
  constraint customer_service_case_evidence_path_unique unique (object_path),
  constraint customer_service_case_evidence_path_check check (
    object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|jpeg|png|webp)$'
  ),
  constraint customer_service_case_evidence_mime_check check (
    mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint customer_service_case_evidence_size_check check (
    byte_size is null or byte_size between 1 and 8388608
  ),
  constraint customer_service_case_evidence_dimension_check check (
    (width is null and height is null)
    or (width between 1 and 8192 and height between 1 and 8192)
  ),
  constraint customer_service_case_evidence_scan_check check (
    scan_status in ('pending_scan', 'safe', 'rejected')
  ),
  constraint customer_service_case_evidence_scan_shape_check check (
    (scan_status = 'pending_scan' and scanned_at is null and rejection_code is null)
    or (scan_status = 'safe' and scanned_at is not null and rejection_code is null
      and mime_type is not null and byte_size is not null
      and width is not null and height is not null and exif_removed)
    or (scan_status = 'rejected' and scanned_at is not null
      and rejection_code ~ '^[a-z0-9_]{1,80}$')
  ),
  constraint customer_service_case_evidence_cleanup_claim_check check (
    (cleanup_claim_id is null) = (cleanup_claimed_at is null)
  ),
  constraint customer_service_case_evidence_storage_deleted_check check (
    storage_deleted_at is null
    or (scan_status = 'rejected' and cleanup_claim_id is null)
  )
);
create index customer_service_case_evidence_case_idx
  on public.customer_service_case_evidence(case_id, created_at, id);
create index customer_service_case_evidence_cleanup_idx
  on public.customer_service_case_evidence(scanned_at, id)
  where scan_status = 'rejected' and storage_deleted_at is null;

create table public.customer_service_case_evidence_upload_tickets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.customer_service_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  object_path text not null,
  extension text not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '15 minutes',
  used_at timestamptz,
  cleanup_claim_id uuid,
  cleanup_claimed_at timestamptz,
  constraint customer_service_case_evidence_upload_ticket_path_unique unique (object_path),
  constraint customer_service_case_evidence_upload_ticket_owner_fkey
    foreign key (user_id, shop_id, case_id)
    references public.customer_service_cases(user_id, shop_id, id) on delete cascade,
  constraint customer_service_case_evidence_upload_ticket_extension_check check (
    extension in ('jpg', 'jpeg', 'png', 'webp')
  ),
  constraint customer_service_case_evidence_upload_ticket_path_check check (
    object_path = user_id::text || '/' || case_id::text || '/' || id::text || '.' || extension
  ),
  constraint customer_service_case_evidence_upload_ticket_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '20 minutes'
  ),
  constraint customer_service_case_evidence_upload_ticket_used_check check (
    used_at is null or used_at >= created_at
  ),
  constraint customer_service_case_evidence_upload_ticket_cleanup_claim_check check (
    (cleanup_claim_id is null) = (cleanup_claimed_at is null)
  )
);
create index customer_service_case_evidence_upload_ticket_active_idx
  on public.customer_service_case_evidence_upload_tickets(case_id, expires_at, id)
  where used_at is null;
create index customer_service_case_evidence_upload_ticket_cleanup_idx
  on public.customer_service_case_evidence_upload_tickets(expires_at, id)
  where used_at is null;

create table public.customer_service_case_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  case_id uuid references public.customer_service_cases(id) on delete set null,
  idempotency_key uuid not null,
  operation text not null,
  request_sha256 text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default statement_timestamp() + interval '30 days',
  constraint customer_service_case_mutations_owner_key_unique unique (
    user_id, shop_id, idempotency_key
  ),
  constraint customer_service_case_mutations_operation_check check (
    operation in ('create', 'cancel', 'register_evidence')
  ),
  constraint customer_service_case_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_service_case_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 131072
  )
);

create trigger customer_service_cases_touch_updated_at
  before update on public.customer_service_cases
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_service_cases enable row level security;
alter table public.customer_service_cases force row level security;
alter table public.customer_service_case_lines enable row level security;
alter table public.customer_service_case_lines force row level security;
alter table public.customer_service_case_events enable row level security;
alter table public.customer_service_case_events force row level security;
alter table public.customer_service_case_evidence enable row level security;
alter table public.customer_service_case_evidence force row level security;
alter table public.customer_service_case_evidence_upload_tickets enable row level security;
alter table public.customer_service_case_evidence_upload_tickets force row level security;
alter table public.customer_service_case_mutations enable row level security;
alter table public.customer_service_case_mutations force row level security;

create policy customer_service_cases_select_owner
  on public.customer_service_cases for select to authenticated
  using (user_id = (select auth.uid())
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false));
create policy customer_service_case_lines_select_owner
  on public.customer_service_case_lines for select to authenticated
  using (not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
    and exists (
    select 1 from public.customer_service_cases customer_case
    where customer_case.id = case_id and customer_case.user_id = (select auth.uid())
  ));
create policy customer_service_case_events_select_owner
  on public.customer_service_case_events for select to authenticated
  using (not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
    and exists (
    select 1 from public.customer_service_cases customer_case
    where customer_case.id = case_id and customer_case.user_id = (select auth.uid())
  ));
create policy customer_service_case_evidence_select_owner
  on public.customer_service_case_evidence for select to authenticated
  using (user_id = (select auth.uid())
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false));
create policy customer_service_case_evidence_upload_tickets_select_owner
  on public.customer_service_case_evidence_upload_tickets for select to authenticated
  using (user_id = (select auth.uid())
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false));

revoke all on table public.customer_service_cases,
  public.customer_service_case_lines,
  public.customer_service_case_events,
  public.customer_service_case_evidence,
  public.customer_service_case_evidence_upload_tickets,
  public.customer_service_case_mutations from public, anon, authenticated;
grant select on table public.customer_service_cases,
  public.customer_service_case_lines,
  public.customer_service_case_events,
  public.customer_service_case_evidence,
  public.customer_service_case_evidence_upload_tickets to authenticated;
grant select, insert, update, delete on table public.customer_service_cases,
  public.customer_service_case_lines,
  public.customer_service_case_events,
  public.customer_service_case_evidence,
  public.customer_service_case_evidence_upload_tickets,
  public.customer_service_case_mutations to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-after-sales-evidence',
  'customer-after-sales-evidence',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy customer_after_sales_evidence_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'customer-after-sales-evidence'
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.customer_service_case_evidence_upload_tickets ticket
      join public.customer_service_cases customer_case on customer_case.id = ticket.case_id
      where ticket.user_id = (select auth.uid())
        and ticket.object_path = name
        and ticket.used_at is null
        and ticket.expires_at > statement_timestamp()
        and customer_case.status not in ('rejected', 'refunded', 'closed')
    )
  );
create policy customer_after_sales_evidence_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'customer-after-sales-evidence'
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy customer_after_sales_evidence_delete_own_pending
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'customer-after-sales-evidence'
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.customer_service_case_evidence evidence
      where evidence.object_path = name and evidence.scan_status = 'safe'
    )
  );

create or replace function app_private.customer_service_case_payload_v1(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', customer_case.id,
    'caseCode', customer_case.public_case_code,
    'orderId', customer_case.order_id,
    'type', customer_case.case_type,
    'status', customer_case.status,
    'reason', customer_case.reason_key,
    'note', customer_case.customer_note,
    'version', customer_case.version,
    'submittedAt', customer_case.submitted_at,
    'updatedAt', customer_case.updated_at,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id, 'orderItemId', line.order_item_id,
        'quantity', line.quantity, 'name', item.public_name
      ) order by item.line_position)
      from public.customer_service_case_lines line
      join public.customer_order_items item on item.id = line.order_item_id
      where line.case_id = customer_case.id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', evidence.id, 'status', evidence.scan_status,
        'mimeType', evidence.mime_type, 'createdAt', evidence.created_at
      ) order by evidence.created_at, evidence.id)
      from public.customer_service_case_evidence evidence
      where evidence.case_id = customer_case.id
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', event.id, 'version', event.event_version,
        'status', event.status, 'actorKind', event.actor_kind,
        'noteKey', event.note_key, 'createdAt', event.created_at
      )) order by event.event_version)
      from public.customer_service_case_events event
      where event.case_id = customer_case.id
    ), '[]'::jsonb)
  )
  from public.customer_service_cases customer_case
  where customer_case.id = p_case_id;
$$;

create or replace function public.customer_after_sales_create_v1(
  p_order_id uuid,
  p_type text,
  p_reason text,
  p_note text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_previous public.customer_service_case_mutations%rowtype;
  v_case public.customer_service_cases%rowtype;
  v_hash text;
  v_result jsonb;
  v_line jsonb;
  v_item public.customer_order_items%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_type not in ('orderProblem', 'returnRequest', 'refundRequest')
    or p_reason not in (
      'damaged', 'wrong_item', 'missing_item', 'quality_issue',
      'changed_mind', 'delivery_issue', 'other'
    )
    or (p_note is not null and (p_note <> btrim(p_note)
      or length(p_note) not between 1 and 1000 or p_note ~ '[[:cntrl:]]'))
    or p_lines is null or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) not between 1 and 100
    or p_idempotency_key is null then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid');
  end if;
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = p_order_id and customer_order.user_id = v_user_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'not_found');
  end if;
  v_hash := encode(extensions.digest(pg_catalog.convert_to(jsonb_build_array(
    p_order_id, p_type, p_reason, p_note, p_lines
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-after-sales:' || v_user_id::text || ':' || v_order.shop_id::text,
    50053
  ));
  select mutation.* into v_previous
  from public.customer_service_case_mutations mutation
  where mutation.user_id = v_user_id and mutation.shop_id = v_order.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create' or v_previous.request_sha256 <> v_hash then
      return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'idempotency_conflict');
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;
  insert into public.customer_service_cases(
    user_id, shop_id, order_id, case_type, reason_key, customer_note
  ) values (
    v_user_id, v_order.shop_id, v_order.id, p_type, p_reason, nullif(p_note, '')
  ) returning * into v_case;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or nullif(v_line->>'orderItemId', '') is null
      or nullif(v_line->>'quantity', '') is null then
      raise check_violation using message = 'invalid_case_line';
    end if;
    select item.* into v_item
    from public.customer_order_items item
    where item.id = (v_line->>'orderItemId')::uuid
      and item.order_id = v_order.id;
    if not found or (v_line->>'quantity')::integer not between 1 and v_item.quantity then
      raise check_violation using message = 'invalid_case_line_quantity';
    end if;
    insert into public.customer_service_case_lines(case_id, order_item_id, quantity)
    values (v_case.id, v_item.id, (v_line->>'quantity')::integer);
  end loop;
  insert into public.customer_service_case_events(
    case_id, shop_id, event_version, status, actor_kind, note_key
  ) values (
    v_case.id, v_case.shop_id, 1, 'submitted', 'customer', 'afterSales.submitted'
  );
  v_result := jsonb_build_object(
    'apiVersion', 'customer-after-sales.v1', 'status', 'ok',
    'idempotent', false, 'case', app_private.customer_service_case_payload_v1(v_case.id),
    'serverTime', statement_timestamp()
  );
  insert into public.customer_service_case_mutations(
    user_id, shop_id, case_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_order.shop_id, v_case.id, p_idempotency_key,
    'create', v_hash, v_result
  );
  return v_result;
exception
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid');
end;
$$;

create or replace function public.customer_after_sales_list_v1(
  p_shop_slug text,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_page_size not between 1 and 50 then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid');
  end if;
  select coalesce(jsonb_agg(
    app_private.customer_service_case_payload_v1(page.id)
    order by page.submitted_at desc, page.id desc
  ), '[]'::jsonb) into v_items
  from (
    select customer_case.id, customer_case.submitted_at
    from public.customer_service_cases customer_case
    join public.storefront_settings setting on setting.shop_id = customer_case.shop_id
    where customer_case.user_id = v_user_id and setting.public_slug = p_shop_slug
    order by customer_case.submitted_at desc, customer_case.id desc
    limit p_page_size
  ) page;
  return jsonb_build_object(
    'apiVersion', 'customer-after-sales.v1', 'status', 'ok',
    'items', v_items, 'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.customer_after_sales_cancel_v1(
  p_case_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.customer_service_cases%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select customer_case.* into v_case
  from public.customer_service_cases customer_case
  where customer_case.id = p_case_id and customer_case.user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'not_found');
  end if;
  if v_case.version <> p_expected_version then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'version_conflict');
  end if;
  if v_case.status <> 'submitted' then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'transition_denied');
  end if;
  update public.customer_service_cases customer_case
  set status = 'closed', version = customer_case.version + 1,
      closed_at = statement_timestamp()
  where customer_case.id = v_case.id returning * into v_case;
  insert into public.customer_service_case_events(
    case_id, shop_id, event_version, status, actor_kind, note_key
  ) values (
    v_case.id, v_case.shop_id, v_case.version, 'closed', 'customer',
    'afterSales.cancelledByCustomer'
  );
  return jsonb_build_object(
    'apiVersion', 'customer-after-sales.v1', 'status', 'ok',
    'case', app_private.customer_service_case_payload_v1(v_case.id)
  );
end;
$$;

create or replace function public.customer_after_sales_evidence_upload_ticket_v1(
  p_case_id uuid,
  p_extension text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.customer_service_cases%rowtype;
  v_ticket public.customer_service_case_evidence_upload_tickets%rowtype;
  v_reserved_count integer;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_extension not in ('jpg', 'jpeg', 'png', 'webp') then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid');
  end if;
  select customer_case.* into v_case
  from public.customer_service_cases customer_case
  where customer_case.id = p_case_id
    and customer_case.user_id = v_user_id
    and customer_case.status not in ('rejected', 'refunded', 'closed')
  for update;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'not_found');
  end if;
  select
    (select count(*) from public.customer_service_case_evidence evidence
      where evidence.case_id = v_case.id)
    +
    (select count(*) from public.customer_service_case_evidence_upload_tickets ticket
      where ticket.case_id = v_case.id and ticket.used_at is null
        and ticket.expires_at > statement_timestamp())
  into v_reserved_count;
  if v_reserved_count >= 3 then
    return jsonb_build_object(
      'apiVersion', 'customer-after-sales.v1', 'status', 'evidence_limit_reached'
    );
  end if;
  v_ticket.id := gen_random_uuid();
  v_ticket.object_path := v_user_id::text || '/' || v_case.id::text || '/'
    || v_ticket.id::text || '.' || p_extension;
  insert into public.customer_service_case_evidence_upload_tickets(
    id, case_id, user_id, shop_id, object_path, extension
  ) values (
    v_ticket.id, v_case.id, v_user_id, v_case.shop_id,
    v_ticket.object_path, p_extension
  ) returning * into v_ticket;
  return jsonb_build_object(
    'apiVersion', 'customer-after-sales.v1', 'status', 'ok',
    'ticketId', v_ticket.id, 'objectPath', v_ticket.object_path,
    'expiresAt', v_ticket.expires_at
  );
end;
$$;

create or replace function public.customer_after_sales_evidence_register_v1(
  p_case_id uuid,
  p_object_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_case public.customer_service_cases%rowtype;
  v_evidence_id uuid;
  v_ticket public.customer_service_case_evidence_upload_tickets%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select customer_case.* into v_case
  from public.customer_service_cases customer_case
  where customer_case.id = p_case_id and customer_case.user_id = v_user_id
    and customer_case.status not in ('rejected', 'refunded', 'closed')
  for update;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'not_found');
  end if;
  select ticket.* into v_ticket
  from public.customer_service_case_evidence_upload_tickets ticket
  where ticket.case_id = v_case.id
    and ticket.user_id = v_user_id
    and ticket.object_path = p_object_path
    and ticket.used_at is null
    and ticket.expires_at > statement_timestamp()
  for update;
  if not found or not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'customer-after-sales-evidence'
      and object.name = p_object_path and object.owner_id = v_user_id::text
  ) then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'invalid_evidence');
  end if;
  if (select count(*) from public.customer_service_case_evidence evidence
      where evidence.case_id = v_case.id) >= 3 then
    return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'evidence_limit_reached');
  end if;
  insert into public.customer_service_case_evidence(
    case_id, user_id, shop_id, object_path
  ) values (
    v_case.id, v_user_id, v_case.shop_id, p_object_path
  ) returning id into v_evidence_id;
  update public.customer_service_case_evidence_upload_tickets ticket
  set used_at = statement_timestamp()
  where ticket.id = v_ticket.id;
  return jsonb_build_object(
    'apiVersion', 'customer-after-sales.v1', 'status', 'pending_scan',
    'evidenceId', v_evidence_id
  );
exception when unique_violation then
  return jsonb_build_object('apiVersion', 'customer-after-sales.v1', 'status', 'already_registered');
end;
$$;

create or replace function public.service_after_sales_evidence_cleanup_claim_v1(
  p_orphan_before timestamptz default statement_timestamp(),
  p_rejected_before timestamptz default statement_timestamp() - interval '24 hours',
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_claim_id uuid := gen_random_uuid();
  v_orphan_count integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_orphan_before > statement_timestamp()
    or p_rejected_before > statement_timestamp()
    or p_limit not between 1 and 100 then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- A crashed worker releases its bounded claim on the next pass. Object
  -- deletion itself is intentionally delegated to the supported Storage API.
  update public.customer_service_case_evidence_upload_tickets ticket
  set cleanup_claim_id = null, cleanup_claimed_at = null
  where ticket.cleanup_claimed_at < statement_timestamp() - interval '15 minutes';
  update public.customer_service_case_evidence evidence
  set cleanup_claim_id = null, cleanup_claimed_at = null
  where evidence.cleanup_claimed_at < statement_timestamp() - interval '15 minutes'
    and evidence.storage_deleted_at is null;

  with candidates as (
    select ticket.id
    from public.customer_service_case_evidence_upload_tickets ticket
    where ticket.used_at is null
      and ticket.expires_at <= p_orphan_before
      and ticket.cleanup_claim_id is null
    order by ticket.expires_at, ticket.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.customer_service_case_evidence_upload_tickets ticket
    set cleanup_claim_id = v_claim_id,
        cleanup_claimed_at = statement_timestamp()
    from candidates
    where ticket.id = candidates.id
    returning ticket.id, ticket.object_path
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
    'kind', 'orphan_ticket', 'id', claimed.id, 'objectPath', claimed.object_path
  ) order by claimed.id), '[]'::jsonb)
  into v_orphan_count, v_items
  from claimed;

  if v_orphan_count < p_limit then
    with candidates as (
      select evidence.id
      from public.customer_service_case_evidence evidence
      where evidence.scan_status = 'rejected'
        and evidence.scanned_at <= p_rejected_before
        and evidence.storage_deleted_at is null
        and evidence.cleanup_claim_id is null
      order by evidence.scanned_at, evidence.id
      limit p_limit - v_orphan_count
      for update skip locked
    ), claimed as (
      update public.customer_service_case_evidence evidence
      set cleanup_claim_id = v_claim_id,
          cleanup_claimed_at = statement_timestamp()
      from candidates
      where evidence.id = candidates.id
      returning evidence.id, evidence.object_path
    )
    select v_items || coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'rejected_evidence', 'id', claimed.id,
      'objectPath', claimed.object_path
    ) order by claimed.id), '[]'::jsonb)
    into v_items
    from claimed;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'claimId', v_claim_id, 'items', v_items,
    'expiresAt', statement_timestamp() + interval '15 minutes'
  );
end;
$$;

create or replace function public.service_after_sales_evidence_cleanup_ack_v1(
  p_claim_id uuid,
  p_storage_deleted boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_tickets integer := 0;
  v_evidence integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_claim_id is null or p_storage_deleted is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_storage_deleted then
    with deleted as (
      delete from public.customer_service_case_evidence_upload_tickets ticket
      where ticket.cleanup_claim_id = p_claim_id and ticket.used_at is null
      returning ticket.id
    ) select count(*) into v_tickets from deleted;
    with updated as (
      update public.customer_service_case_evidence evidence
      set storage_deleted_at = statement_timestamp(),
          cleanup_claim_id = null,
          cleanup_claimed_at = null
      where evidence.cleanup_claim_id = p_claim_id
        and evidence.scan_status = 'rejected'
        and evidence.storage_deleted_at is null
      returning evidence.id
    ) select count(*) into v_evidence from updated;
  else
    with updated as (
      update public.customer_service_case_evidence_upload_tickets ticket
      set cleanup_claim_id = null, cleanup_claimed_at = null
      where ticket.cleanup_claim_id = p_claim_id
      returning ticket.id
    ) select count(*) into v_tickets from updated;
    with updated as (
      update public.customer_service_case_evidence evidence
      set cleanup_claim_id = null, cleanup_claimed_at = null
      where evidence.cleanup_claim_id = p_claim_id
      returning evidence.id
    ) select count(*) into v_evidence from updated;
  end if;
  return jsonb_build_object(
    'status', 'ok', 'storageDeleted', p_storage_deleted,
    'ticketsFinalized', v_tickets, 'evidenceFinalized', v_evidence
  );
end;
$$;

create or replace function public.service_after_sales_evidence_scan_ack_v1(
  p_evidence_id uuid,
  p_scan_outcome text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_exif_removed boolean,
  p_rejection_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_evidence public.customer_service_case_evidence%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  select evidence.* into v_evidence
  from public.customer_service_case_evidence evidence
  where evidence.id = p_evidence_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_evidence.scan_status <> 'pending_scan'
    or p_scan_outcome not in ('safe', 'rejected') then
    return jsonb_build_object('status', 'transition_denied');
  end if;
  update public.customer_service_case_evidence evidence
  set scan_status = p_scan_outcome,
      mime_type = case when p_scan_outcome = 'safe' then p_mime_type end,
      byte_size = case when p_scan_outcome = 'safe' then p_byte_size end,
      width = case when p_scan_outcome = 'safe' then p_width end,
      height = case when p_scan_outcome = 'safe' then p_height end,
      exif_removed = p_scan_outcome = 'safe' and coalesce(p_exif_removed, false),
      rejection_code = case when p_scan_outcome = 'rejected'
        then coalesce(p_rejection_code, 'unsafe_file') end,
      scanned_at = statement_timestamp()
  where evidence.id = v_evidence.id;
  return jsonb_build_object('status', 'ok', 'scanStatus', p_scan_outcome);
exception when check_violation then
  return jsonb_build_object('status', 'invalid_scan_result');
end;
$$;

create or replace function public.admin_customer_after_sales_read_v1(
  p_shop_id uuid,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_items jsonb;
  v_total bigint;
begin
  if p_shop_id is null or p_page not between 1 and 100000
    or p_page_size not between 1 and 50
    or (p_status is not null and p_status not in (
      'submitted', 'reviewing', 'approved', 'rejected', 'returnRequired',
      'received', 'refundPending', 'refunded', 'closed'
    )) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
  end if;
  select count(*) into v_total
  from public.customer_service_cases customer_case
  where customer_case.shop_id = p_shop_id
    and (p_status is null or customer_case.status = p_status);
  select coalesce(jsonb_agg(jsonb_build_object(
    'case', app_private.customer_service_case_payload_v1(page.id),
    'orderCode', page.public_order_code,
    'paymentMethod', page.payment_method,
    'paymentStatus', page.payment_status,
    'customer', jsonb_build_object(
      'displayName', page.display_name,
      'reference', right(page.user_id::text, 6)
    )
  ) order by page.updated_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select customer_case.id, customer_case.user_id, customer_case.updated_at,
      customer_order.public_order_code,
      profile.display_name,
      payment.method as payment_method,
      payment.status as payment_status
    from public.customer_service_cases customer_case
    join public.customer_orders customer_order on customer_order.id = customer_case.order_id
    left join public.customer_profiles profile on profile.user_id = customer_case.user_id
    left join public.customer_order_payments payment on payment.order_id = customer_case.order_id
    where customer_case.shop_id = p_shop_id
      and (p_status is null or customer_case.status = p_status)
    order by customer_case.updated_at desc, customer_case.id desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) page;
  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception using errcode = '42501', message = 'session expired';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'items', v_items, 'total', v_total, 'page', p_page, 'pageSize', p_page_size
  );
exception when insufficient_privilege then
  return jsonb_build_object('ok', false, 'code', 'session_expired', 'shop_id', p_shop_id);
end;
$$;

create or replace function public.admin_customer_after_sales_evidence_read_v1(
  p_shop_id uuid,
  p_evidence_id uuid,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_object_path text;
  v_mime_type text;
begin
  if p_shop_id is null or p_evidence_id is null then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
  end if;
  select evidence.object_path, evidence.mime_type
  into v_object_path, v_mime_type
  from public.customer_service_case_evidence evidence
  join public.customer_service_cases customer_case on customer_case.id = evidence.case_id
  where evidence.id = p_evidence_id
    and evidence.shop_id = p_shop_id
    and customer_case.shop_id = p_shop_id
    and evidence.scan_status = 'safe';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'shop_id', p_shop_id);
  end if;
  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception using errcode = '42501', message = 'session expired';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'objectPath', v_object_path, 'mimeType', v_mime_type
  );
exception when insufficient_privilege then
  return jsonb_build_object('ok', false, 'code', 'session_expired', 'shop_id', p_shop_id);
end;
$$;

create or replace function public.admin_customer_after_sales_transition_v1(
  p_shop_id uuid,
  p_case_id uuid,
  p_expected_version bigint,
  p_target_status text,
  p_note_key text default null,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_case public.customer_service_cases%rowtype;
  v_actor_profile_id uuid;
  v_actor_staff_id uuid;
  v_audit_id uuid;
begin
  if p_shop_id is null or p_case_id is null or p_expected_version is null
    or p_target_status not in (
      'reviewing', 'approved', 'rejected', 'returnRequired',
      'received', 'refundPending', 'closed'
    )
    or (p_note_key is not null and p_note_key !~ '^[a-z][a-zA-Z0-9_.]{1,119}$') then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
  end if;
  select customer_case.* into v_case
  from public.customer_service_cases customer_case
  where customer_case.id = p_case_id and customer_case.shop_id = p_shop_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'shop_id', p_shop_id);
  end if;
  if v_case.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'version_conflict',
      'shop_id', p_shop_id, 'current_version', v_case.version);
  end if;
  if not (
    (v_case.status = 'submitted' and p_target_status in ('reviewing', 'rejected', 'closed'))
    or (v_case.status = 'reviewing' and p_target_status in (
      'approved', 'rejected', 'returnRequired', 'refundPending', 'closed'
    ))
    or (v_case.status = 'approved' and p_target_status in (
      'returnRequired', 'refundPending', 'closed'
    ))
    or (v_case.status = 'returnRequired' and p_target_status in ('received', 'closed'))
    or (v_case.status = 'received' and p_target_status in ('refundPending', 'closed'))
  ) then
    return jsonb_build_object('ok', false, 'code', 'transition_denied', 'shop_id', p_shop_id);
  end if;
  if p_target_status = 'refundPending' and not exists (
    select 1 from public.customer_order_payments payment
    where payment.order_id = v_case.order_id
      and payment.status in ('collected', 'refund_pending', 'refund_failed', 'refunded')
  ) then
    return jsonb_build_object('ok', false, 'code', 'no_money_collected', 'shop_id', p_shop_id);
  end if;
  update public.customer_service_cases customer_case
  set status = p_target_status,
      version = customer_case.version + 1,
      closed_at = case when p_target_status in ('rejected', 'closed')
        then statement_timestamp() else null end
  where customer_case.id = v_case.id returning * into v_case;
  insert into public.customer_service_case_events(
    case_id, shop_id, event_version, status, actor_kind, note_key
  ) values (
    v_case.id, v_case.shop_id, v_case.version, v_case.status, 'staff', p_note_key
  );
  v_actor_profile_id := case when auth.role() = 'authenticated' then auth.uid() end;
  v_actor_staff_id := case when auth.role() = 'service_role' then p_staff_id end;
  insert into public.audit_logs(
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor_profile_id, v_actor_staff_id, 'shop', p_shop_id,
    'shop.customer_after_sales.transition.success', 'info', 'success',
    'customer_service_case', v_case.id::text,
    jsonb_build_object('status', v_case.status, 'version', v_case.version)
  ) returning audit_log_id into v_audit_id;
  if not app_private.customer_order_admin_authorized_v1(
    p_shop_id, 'orders.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception using errcode = '42501', message = 'session expired';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'target_id', v_case.id, 'status', v_case.status,
    'version', v_case.version, 'audit_event_id', v_audit_id
  );
exception when insufficient_privilege then
  return jsonb_build_object('ok', false, 'code', 'session_expired', 'shop_id', p_shop_id);
end;
$$;

create or replace function public.service_customer_after_sales_refund_ack_v1(
  p_case_id uuid,
  p_provider_event_sha256 text default null,
  p_manual_attestation_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_case public.customer_service_cases%rowtype;
  v_payment public.customer_order_payments%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if (p_provider_event_sha256 is null) = (p_manual_attestation_id is null)
    or (p_provider_event_sha256 is not null
      and p_provider_event_sha256 !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('status', 'invalid');
  end if;
  select customer_case.* into v_case
  from public.customer_service_cases customer_case
  where customer_case.id = p_case_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_case.status <> 'refundPending' then
    return jsonb_build_object('status', 'transition_denied');
  end if;
  select payment.* into v_payment
  from public.customer_order_payments payment
  where payment.order_id = v_case.order_id for share;
  if not found or v_payment.status = 'due_at_fulfillment' then
    return jsonb_build_object('status', 'no_money_collected');
  end if;
  if (p_provider_event_sha256 is not null and v_payment.status <> 'refunded')
    or (p_manual_attestation_id is not null
      and (v_payment.method = 'online_payment' or v_payment.status <> 'refunded')) then
    return jsonb_build_object('status', 'payment_ack_required');
  end if;
  update public.customer_service_cases customer_case
  set status = 'refunded', version = customer_case.version + 1,
      closed_at = statement_timestamp()
  where customer_case.id = v_case.id returning * into v_case;
  insert into public.customer_service_case_events(
    case_id, shop_id, event_version, status, actor_kind, note_key,
    metadata_redacted
  ) values (
    v_case.id, v_case.shop_id, v_case.version, 'refunded',
    case when p_provider_event_sha256 is null then 'staff' else 'provider' end,
    'afterSales.refundAcknowledged',
    jsonb_build_object(
      'ackKind', case when p_provider_event_sha256 is null
        then 'manual_attestation' else 'provider_event' end
    )
  );
  return jsonb_build_object('status', 'ok', 'caseStatus', 'refunded');
end;
$$;

-- -----------------------------------------------------------------------------
-- Verified reviews and server-maintained published aggregates
-- -----------------------------------------------------------------------------

alter table public.storefront_settings
  add column customer_review_edit_window_days integer not null default 30,
  add constraint storefront_settings_review_window_check check (
    customer_review_edit_window_days between 1 and 90
  );

create table public.customer_product_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  order_id uuid not null references public.customer_orders(id) on delete restrict,
  order_item_id uuid not null references public.customer_order_items(id) on delete restrict,
  publication_id uuid not null references public.storefront_product_publications(id)
    on delete restrict,
  rating integer not null,
  comment text,
  moderation_status text not null default 'pending',
  moderation_reason text,
  version bigint not null default 1,
  submitted_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  moderated_at timestamptz,
  constraint customer_product_reviews_order_line_unique unique (user_id, order_item_id),
  constraint customer_product_reviews_rating_check check (rating between 1 and 5),
  constraint customer_product_reviews_comment_check check (
    comment is null
    or (
      comment = btrim(comment)
      and length(comment) between 1 and 1000
      and comment !~ '[[:cntrl:]]'
    )
  ),
  constraint customer_product_reviews_status_check check (
    moderation_status in ('pending', 'published', 'rejected', 'withdrawn')
  ),
  constraint customer_product_reviews_reason_check check (
    moderation_reason is null
    or (
      moderation_reason = btrim(moderation_reason)
      and length(moderation_reason) between 1 and 240
      and moderation_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint customer_product_reviews_version_check check (version >= 1),
  constraint customer_product_reviews_moderation_shape_check check (
    (moderation_status = 'pending' and moderated_at is null and moderation_reason is null)
    or (moderation_status = 'published' and moderated_at is not null and moderation_reason is null)
    or (moderation_status in ('rejected', 'withdrawn') and moderated_at is not null)
  )
);
create index customer_product_reviews_owner_idx
  on public.customer_product_reviews(user_id, updated_at desc, id);
create index customer_product_reviews_moderation_idx
  on public.customer_product_reviews(shop_id, moderation_status, submitted_at, id);
create index customer_product_reviews_publication_idx
  on public.customer_product_reviews(publication_id, moderation_status, submitted_at desc, id);

create table public.storefront_review_aggregates (
  publication_id uuid primary key references public.storefront_product_publications(id)
    on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  average_rating numeric(3, 2) not null default 0,
  published_count bigint not null default 0,
  distribution jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  updated_at timestamptz not null default statement_timestamp(),
  constraint storefront_review_aggregates_average_check check (
    average_rating between 0 and 5
  ),
  constraint storefront_review_aggregates_count_check check (published_count >= 0),
  constraint storefront_review_aggregates_distribution_check check (
    jsonb_typeof(distribution) = 'object' and pg_column_size(distribution) <= 1024
  )
);

create table public.customer_product_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.customer_product_reviews(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  event_version bigint not null,
  moderation_status text not null,
  actor_kind text not null,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  constraint customer_product_review_events_version_unique unique (review_id, event_version),
  constraint customer_product_review_events_status_check check (
    moderation_status in ('pending', 'published', 'rejected', 'withdrawn')
  ),
  constraint customer_product_review_events_actor_check check (
    actor_kind in ('customer', 'staff', 'system')
  ),
  constraint customer_product_review_events_reason_check check (
    reason is null or (length(reason) between 1 and 240 and reason !~ '[[:cntrl:]]')
  )
);

create trigger customer_product_reviews_touch_updated_at
  before update on public.customer_product_reviews
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.customer_product_reviews enable row level security;
alter table public.customer_product_reviews force row level security;
alter table public.storefront_review_aggregates enable row level security;
alter table public.storefront_review_aggregates force row level security;
alter table public.customer_product_review_events enable row level security;
alter table public.customer_product_review_events force row level security;
create policy customer_product_reviews_select_owner
  on public.customer_product_reviews for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.customer_product_reviews,
  public.storefront_review_aggregates,
  public.customer_product_review_events from public, anon, authenticated;
grant select on table public.customer_product_reviews to authenticated;
grant select, insert, update, delete on table public.customer_product_reviews,
  public.storefront_review_aggregates,
  public.customer_product_review_events to service_role;

create or replace function app_private.storefront_review_aggregate_refresh_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_publication_id uuid := coalesce(new.publication_id, old.publication_id);
  v_shop_id uuid := coalesce(new.shop_id, old.shop_id);
begin
  insert into public.storefront_review_aggregates(
    publication_id, shop_id, average_rating, published_count, distribution, updated_at
  )
  select v_publication_id, v_shop_id,
    coalesce(round(avg(review.rating)::numeric, 2), 0),
    count(*)::bigint,
    jsonb_build_object(
      '1', count(*) filter (where review.rating = 1),
      '2', count(*) filter (where review.rating = 2),
      '3', count(*) filter (where review.rating = 3),
      '4', count(*) filter (where review.rating = 4),
      '5', count(*) filter (where review.rating = 5)
    ), statement_timestamp()
  from public.customer_product_reviews review
  where review.publication_id = v_publication_id
    and review.moderation_status = 'published'
  on conflict (publication_id) do update
  set average_rating = excluded.average_rating,
      published_count = excluded.published_count,
      distribution = excluded.distribution,
      updated_at = excluded.updated_at;
  return coalesce(new, old);
end;
$$;
create trigger customer_product_reviews_refresh_aggregate
  after insert or update or delete on public.customer_product_reviews
  for each row execute function app_private.storefront_review_aggregate_refresh_v1();

create or replace function public.customer_review_submit_v1(
  p_order_item_id uuid,
  p_rating integer,
  p_comment text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.customer_orders%rowtype;
  v_item public.customer_order_items%rowtype;
  v_review public.customer_product_reviews%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_rating not between 1 and 5
    or (p_comment is not null and (p_comment <> btrim(p_comment)
      or length(p_comment) not between 1 and 1000 or p_comment ~ '[[:cntrl:]]')) then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'invalid');
  end if;
  select item.* into v_item
  from public.customer_order_items item
  join public.customer_orders customer_order on customer_order.id = item.order_id
  where item.id = p_order_item_id and customer_order.user_id = v_user_id;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'not_found');
  end if;
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = v_item.order_id and customer_order.user_id = v_user_id;
  if v_order.status <> 'completed' then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'not_eligible');
  end if;
  insert into public.customer_product_reviews(
    user_id, shop_id, order_id, order_item_id, publication_id, rating, comment
  ) values (
    v_user_id, v_order.shop_id, v_order.id, v_item.id,
    v_item.publication_id, p_rating, nullif(p_comment, '')
  ) returning * into v_review;
  insert into public.customer_product_review_events(
    review_id, shop_id, event_version, moderation_status, actor_kind
  ) values (v_review.id, v_review.shop_id, 1, 'pending', 'customer');
  return jsonb_build_object(
    'apiVersion', 'customer-reviews.v1', 'status', 'ok',
    'reviewId', v_review.id, 'moderationStatus', v_review.moderation_status,
    'version', v_review.version
  );
exception when unique_violation then
  return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'duplicate');
end;
$$;

create or replace function public.customer_reviews_list_v1(
  p_shop_slug text,
  p_pending_only boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_eligible jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', review.id, 'orderId', review.order_id,
    'orderItemId', review.order_item_id, 'publicationId', review.publication_id,
    'rating', review.rating, 'comment', review.comment,
    'status', review.moderation_status, 'version', review.version,
    'submittedAt', review.submitted_at, 'updatedAt', review.updated_at
  ) order by review.updated_at desc, review.id desc), '[]'::jsonb)
  into v_items
  from public.customer_product_reviews review
  join public.storefront_settings setting on setting.shop_id = review.shop_id
  where review.user_id = v_user_id and setting.public_slug = p_shop_slug;
  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', customer_order.id, 'orderItemId', item.id,
    'publicationId', item.publication_id, 'name', item.public_name
  ) order by customer_order.placed_at desc, item.line_position), '[]'::jsonb)
  into v_eligible
  from public.customer_order_items item
  join public.customer_orders customer_order on customer_order.id = item.order_id
  join public.storefront_settings setting on setting.shop_id = customer_order.shop_id
  left join public.customer_product_reviews review
    on review.user_id = v_user_id and review.order_item_id = item.id
  where customer_order.user_id = v_user_id and customer_order.status = 'completed'
    and setting.public_slug = p_shop_slug and review.id is null;
  return jsonb_build_object(
    'apiVersion', 'customer-reviews.v1', 'status', 'ok',
    'items', case when p_pending_only then '[]'::jsonb else v_items end,
    'eligible', v_eligible, 'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.customer_review_update_v1(
  p_review_id uuid,
  p_expected_version bigint,
  p_rating integer,
  p_comment text,
  p_withdraw boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_review public.customer_product_reviews%rowtype;
  v_window integer;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  select review.* into v_review
  from public.customer_product_reviews review
  where review.id = p_review_id and review.user_id = v_user_id
  for update;
  if not found then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'not_found');
  end if;
  select setting.customer_review_edit_window_days into v_window
  from public.storefront_settings setting
  where setting.shop_id = v_review.shop_id;
  if v_review.version <> p_expected_version then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'version_conflict');
  end if;
  if v_review.submitted_at + make_interval(days => v_window) < statement_timestamp()
    or v_review.moderation_status = 'withdrawn' then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'edit_window_closed');
  end if;
  if not p_withdraw and (p_rating not between 1 and 5
    or (p_comment is not null and (p_comment <> btrim(p_comment)
      or length(p_comment) not between 1 and 1000 or p_comment ~ '[[:cntrl:]]'))) then
    return jsonb_build_object('apiVersion', 'customer-reviews.v1', 'status', 'invalid');
  end if;
  update public.customer_product_reviews review
  set rating = case when p_withdraw then review.rating else p_rating end,
      comment = case when p_withdraw then review.comment else nullif(p_comment, '') end,
      moderation_status = case when p_withdraw then 'withdrawn' else 'pending' end,
      moderation_reason = case when p_withdraw then 'customer_withdrawn' end,
      moderated_at = case when p_withdraw then statement_timestamp() end,
      version = review.version + 1
  where review.id = v_review.id returning * into v_review;
  insert into public.customer_product_review_events(
    review_id, shop_id, event_version, moderation_status, actor_kind, reason
  ) values (
    v_review.id, v_review.shop_id, v_review.version,
    v_review.moderation_status, 'customer', v_review.moderation_reason
  );
  return jsonb_build_object(
    'apiVersion', 'customer-reviews.v1', 'status', 'ok',
    'reviewId', v_review.id, 'moderationStatus', v_review.moderation_status,
    'version', v_review.version
  );
end;
$$;

create or replace function public.storefront_product_reviews_v1(
  p_shop_slug text,
  p_publication_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_items jsonb;
  v_aggregate public.storefront_review_aggregates%rowtype;
begin
  if p_page_size not between 1 and 50
    or (p_before_created_at is null and p_before_id is not null)
    or not exists (
    select 1 from public.storefront_catalog_items item
    where item.shop_slug = p_shop_slug and item.publication_id = p_publication_id
      and item.storefront_enabled
      and item.availability_mode <> 'unavailable'
  ) then
    return jsonb_build_object('apiVersion', 'storefront-reviews.v1', 'status', 'not_found');
  end if;
  select aggregate.* into v_aggregate
  from public.storefront_review_aggregates aggregate
  join public.storefront_catalog_items item
    on item.publication_id = aggregate.publication_id
  where aggregate.publication_id = p_publication_id and item.shop_slug = p_shop_slug;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'rating', page.rating, 'comment', page.comment,
    'createdAt', page.submitted_at, 'verifiedPurchase', true
  ) order by page.submitted_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select review.id, review.rating, review.comment, review.submitted_at
    from public.customer_product_reviews review
    where review.publication_id = p_publication_id
      and review.moderation_status = 'published'
      and (
        p_before_created_at is null
        or (p_before_id is null and review.submitted_at < p_before_created_at)
        or (
          p_before_id is not null
          and (review.submitted_at, review.id) < (p_before_created_at, p_before_id)
        )
      )
    order by review.submitted_at desc, review.id desc limit p_page_size
  ) page;
  return jsonb_build_object(
    'apiVersion', 'storefront-reviews.v1', 'status', 'ok',
    'averageRating', coalesce(v_aggregate.average_rating, 0),
    'publishedCount', coalesce(v_aggregate.published_count, 0),
    'distribution', coalesce(v_aggregate.distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb),
    'items', v_items, 'serverTime', statement_timestamp()
  );
end;
$$;

create or replace function public.admin_customer_reviews_read_v1(
  p_shop_id uuid,
  p_status text default 'pending',
  p_page integer default 1,
  p_page_size integer default 25,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_items jsonb;
  v_total bigint;
begin
  if p_shop_id is null or p_status not in ('pending', 'published', 'rejected', 'withdrawn')
    or p_page not between 1 and 100000 or p_page_size not between 1 and 50 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
  end if;
  select count(*) into v_total
  from public.customer_product_reviews review
  where review.shop_id = p_shop_id and review.moderation_status = p_status;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'orderId', page.order_id,
    'orderItemId', page.order_item_id, 'publicationId', page.publication_id,
    'productName', page.public_name, 'rating', page.rating,
    'comment', page.comment, 'status', page.moderation_status,
    'reason', page.moderation_reason, 'version', page.version,
    'submittedAt', page.submitted_at
  ) order by page.submitted_at, page.id), '[]'::jsonb) into v_items
  from (
    select review.*, item.public_name
    from public.customer_product_reviews review
    join public.customer_order_items item on item.id = review.order_item_id
    where review.shop_id = p_shop_id and review.moderation_status = p_status
    order by review.submitted_at, review.id
    limit p_page_size offset (p_page - 1) * p_page_size
  ) page;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception using errcode = '42501', message = 'session expired';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'items', v_items, 'total', v_total, 'page', p_page, 'pageSize', p_page_size
  );
exception when insufficient_privilege then
  return jsonb_build_object('ok', false, 'code', 'session_expired', 'shop_id', p_shop_id);
end;
$$;

create or replace function public.admin_customer_review_moderate_v1(
  p_shop_id uuid,
  p_review_id uuid,
  p_expected_version bigint,
  p_target_status text,
  p_reason text default null,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_review public.customer_product_reviews%rowtype;
  v_actor_profile_id uuid;
  v_actor_staff_id uuid;
  v_audit_id uuid;
begin
  if p_shop_id is null or p_review_id is null or p_expected_version is null
    or p_target_status not in ('published', 'rejected')
    or (p_target_status = 'published' and p_reason is not null)
    or (p_target_status = 'rejected' and (
      p_reason is null or p_reason <> btrim(p_reason)
      or length(p_reason) not between 1 and 240 or p_reason ~ '[[:cntrl:]]'
    )) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.publish', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id);
  end if;
  select review.* into v_review
  from public.customer_product_reviews review
  where review.id = p_review_id and review.shop_id = p_shop_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'shop_id', p_shop_id);
  end if;
  if v_review.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'version_conflict',
      'shop_id', p_shop_id, 'current_version', v_review.version);
  end if;
  if v_review.moderation_status not in ('pending', 'rejected', 'published') then
    return jsonb_build_object('ok', false, 'code', 'transition_denied', 'shop_id', p_shop_id);
  end if;
  if v_review.moderation_status = p_target_status then
    return jsonb_build_object(
      'ok', true, 'code', 'success', 'shop_id', p_shop_id,
      'target_id', v_review.id, 'status', v_review.moderation_status,
      'version', v_review.version, 'idempotent', true
    );
  end if;
  update public.customer_product_reviews review
  set moderation_status = p_target_status,
      moderation_reason = case when p_target_status = 'rejected' then p_reason end,
      moderated_at = statement_timestamp(),
      version = review.version + 1
  where review.id = v_review.id returning * into v_review;
  insert into public.customer_product_review_events(
    review_id, shop_id, event_version, moderation_status, actor_kind, reason
  ) values (
    v_review.id, v_review.shop_id, v_review.version,
    v_review.moderation_status, 'staff', v_review.moderation_reason
  );
  v_actor_profile_id := case when auth.role() = 'authenticated' then auth.uid() end;
  v_actor_staff_id := case when auth.role() = 'service_role' then p_staff_id end;
  insert into public.audit_logs(
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor_profile_id, v_actor_staff_id, 'shop', p_shop_id,
    'shop.customer_review.moderation.success', 'info', 'success',
    'customer_product_review', v_review.id::text,
    jsonb_build_object('status', v_review.moderation_status, 'version', v_review.version)
  ) returning audit_log_id into v_audit_id;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.publish', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception using errcode = '42501', message = 'session expired';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shop_id', p_shop_id,
    'target_id', v_review.id, 'status', v_review.moderation_status,
    'version', v_review.version, 'audit_event_id', v_audit_id
  );
end;
$$;

-- Anonymous/authenticated search suggestions use only the published projection and
-- never persist query text or associate it with a customer identity.
create or replace function public.storefront_search_suggestions_v1(
  p_shop_slug text,
  p_query text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  v_query text := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_items jsonb;
begin
  if p_shop_slug is null or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or length(v_query) not between 2 and 80 or v_query ~ '[[:cntrl:]]'
    or p_limit not between 1 and 10 then
    return jsonb_build_object('apiVersion', 'storefront-search-suggestions.v1', 'status', 'invalid');
  end if;
  with candidates as (
    select item.public_name as value, 'product'::text as kind,
      max(extensions.similarity(lower(item.public_name), v_query)) as score
    from public.storefront_catalog_items item
    where item.shop_slug = p_shop_slug and item.storefront_enabled
      and item.availability_mode <> 'unavailable'
      and (lower(item.public_name) like '%' || v_query || '%'
        or extensions.similarity(lower(item.public_name), v_query) >= 0.2)
    group by item.public_name
    union all
    select item.category_name, 'category',
      max(extensions.similarity(lower(item.category_name), v_query))
    from public.storefront_catalog_items item
    where item.shop_slug = p_shop_slug and item.storefront_enabled
      and (lower(item.category_name) like '%' || v_query || '%'
        or extensions.similarity(lower(item.category_name), v_query) >= 0.2)
    group by item.category_name
    union all
    select item.public_brand, 'brand',
      max(extensions.similarity(lower(item.public_brand), v_query))
    from public.storefront_catalog_items item
    where item.shop_slug = p_shop_slug and item.storefront_enabled
      and item.public_brand is not null
      and (lower(item.public_brand) like '%' || v_query || '%'
        or extensions.similarity(lower(item.public_brand), v_query) >= 0.2)
    group by item.public_brand
  ), ranked as (
    select distinct on (lower(value)) value, kind, score
    from candidates order by lower(value), score desc, kind
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'value', result.value, 'kind', result.kind
  ) order by result.prefix_rank, result.score desc, result.value), '[]'::jsonb)
  into v_items
  from (
    select ranked.*,
      case when lower(ranked.value) like v_query || '%' then 0 else 1 end as prefix_rank
    from ranked
    order by prefix_rank, score desc, value limit p_limit
  ) result;
  return jsonb_build_object(
    'apiVersion', 'storefront-search-suggestions.v1', 'status', 'ok',
    'items', v_items, 'serverTime', statement_timestamp()
  );
end;
$$;

-- Enrich legacy and new event producers before constraints are evaluated.
create or replace function app_private.customer_notification_inbox_envelope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.destination_type not in ('order', 'after_sales', 'product', 'notifications')
    or not app_private.customer_notification_arguments_safe_v1(
      coalesce(new.safe_arguments, '{}'::jsonb)
    ) then
    raise check_violation using message = 'unsafe_notification_envelope';
  end if;
  if new.destination_id is not null and (
    (new.source_kind in ('order_status', 'payment')
      and new.destination_id is distinct from new.order_id)
    or (new.source_kind in ('reservation_hold', 'system')
      and new.destination_id is distinct from new.shop_id)
  ) then
    raise check_violation using message = 'unsafe_notification_destination';
  end if;
  new.category := case new.source_kind
    when 'payment' then 'payment'
    when 'after_sales' then 'afterSales'
    when 'system' then 'system'
    else 'order' end;
  new.destination_type := case new.source_kind
    when 'after_sales' then 'after_sales'
    when 'system' then 'notifications'
    when 'reservation_hold' then 'notifications'
    else 'order' end;
  new.destination_id := case new.source_kind
    when 'after_sales' then new.destination_id
    when 'system' then new.shop_id
    when 'reservation_hold' then new.shop_id
    else new.order_id end;
  new.title_key := case new.source_kind
    when 'payment' then 'notification.payment.title'
    when 'after_sales' then 'notification.afterSales.title'
    when 'reservation_hold' then 'notification.reservation.title'
    when 'system' then 'notification.system.title'
    else 'notification.order.title' end;
  new.body_key := 'notification.' || case new.source_kind
    when 'after_sales' then 'afterSales.' || new.event_key
    when 'payment' then 'payment.' || new.event_key
    when 'system' then 'system.' || new.event_key
    else new.event_key end;
  new.safe_arguments := case new.source_kind
    when 'order_status' then jsonb_build_object('orderCode', new.public_order_code_short)
    when 'payment' then jsonb_build_object('orderCode', new.public_order_code_short)
    when 'reservation_hold' then '{}'::jsonb
    when 'system' then '{}'::jsonb
    else coalesce(new.safe_arguments, '{}'::jsonb) end;

  if not app_private.customer_notification_arguments_safe_v1(new.safe_arguments) then
    raise check_violation using message = 'unsafe_notification_arguments';
  end if;
  if new.destination_type = 'order' and not exists (
    select 1 from public.customer_orders customer_order
    where customer_order.id = new.destination_id
      and customer_order.user_id = new.user_id
      and customer_order.shop_id = new.shop_id
  ) then
    raise check_violation using message = 'unsafe_notification_destination';
  elsif new.destination_type = 'after_sales' and not exists (
    select 1 from public.customer_service_cases customer_case
    where customer_case.id = new.destination_id
      and customer_case.user_id = new.user_id
      and customer_case.shop_id = new.shop_id
  ) then
    raise check_violation using message = 'unsafe_notification_destination';
  elsif new.destination_type = 'product' and not exists (
    select 1 from public.storefront_catalog_items item
    where item.publication_id = new.destination_id
      and item.shop_id = new.shop_id
      and item.storefront_enabled
  ) then
    raise check_violation using message = 'unsafe_notification_destination';
  elsif new.destination_type = 'notifications'
    and new.destination_id is distinct from new.shop_id then
    raise check_violation using message = 'unsafe_notification_destination';
  end if;
  return new;
end;
$$;
create trigger customer_notification_inbox_envelope
  before insert on public.customer_notification_events
  for each row execute function app_private.customer_notification_inbox_envelope_v1();

create or replace function app_private.customer_after_sales_notification_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.customer_notification_events(
    user_id, shop_id, shop_slug, source_kind, order_id,
    event_key, event_version, public_order_code_short,
    occurred_at, created_at, category, title_key, body_key,
    safe_arguments, destination_type, destination_id
  )
  select customer_case.user_id, customer_case.shop_id, setting.public_slug,
    'after_sales', customer_case.order_id, lower(new.status), new.event_version,
    right(customer_order.public_order_code, 6), new.created_at,
    greatest(statement_timestamp(), new.created_at), 'afterSales',
    'notification.afterSales.title', 'notification.afterSales.' || lower(new.status),
    jsonb_build_object('caseCode', customer_case.public_case_code),
    'after_sales', customer_case.id
  from public.customer_service_cases customer_case
  join public.customer_orders customer_order on customer_order.id = customer_case.order_id
  join public.storefront_settings setting on setting.shop_id = customer_case.shop_id
  where customer_case.id = new.case_id
  on conflict do nothing;
  -- The persistent inbox is authoritative. New categories remain inbox-only
  -- until their push transport is explicitly activated and policy-scoped.
  return new;
end;
$$;
create trigger customer_service_case_events_notify
  after insert on public.customer_service_case_events
  for each row execute function app_private.customer_after_sales_notification_v1();

create or replace function app_private.customer_payment_notification_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.customer_notification_events(
    user_id, shop_id, shop_slug, source_kind, order_id,
    event_key, event_version, public_order_code_short,
    occurred_at, created_at, category, title_key, body_key,
    safe_arguments, destination_type, destination_id
  )
  select payment.user_id, payment.shop_id, setting.public_slug,
    'payment', payment.order_id, new.event_type, new.event_version,
    right(customer_order.public_order_code, 6), new.occurred_at,
    greatest(statement_timestamp(), new.occurred_at), 'payment',
    'notification.payment.title', 'notification.payment.' || new.event_type,
    jsonb_build_object('orderCode', right(customer_order.public_order_code, 6)),
    'order', payment.order_id
  from public.customer_order_payments payment
  join public.customer_orders customer_order on customer_order.id = payment.order_id
  join public.storefront_settings setting on setting.shop_id = payment.shop_id
  where payment.id = new.payment_id and payment.user_id is not null
  on conflict do nothing;
  -- See the after-sales producer above: no push is synthesized without an
  -- independently configured transport policy.
  return new;
end;
$$;
create trigger customer_payment_events_notify
  after insert on public.customer_payment_events
  for each row execute function app_private.customer_payment_notification_v1();

-- Explicit function privileges. Private helpers remain unavailable to API roles.
revoke all on function app_private.customer_address_version_guard_v2()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_address_delete_guard_v2()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_address_snapshot_v2()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_address_payload_v2(public.customer_addresses)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_order_reorder_preview_v1(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_service_case_payload_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_review_aggregate_refresh_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_notification_arguments_safe_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_notification_inbox_envelope_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_after_sales_notification_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.customer_payment_notification_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.customer_addresses_read_v2()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_address_upsert_v2(uuid, bigint, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_address_delete_v2(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.storefront_delivery_context_preview_v1(text, text, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_delivery_context_select_v1(text, text, uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_delivery_context_read_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_checkout_quote_create_v2(text, bigint, text, uuid, uuid, uuid, bigint, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_payment_recovery_read_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_notifications_list_v1(text, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_notification_mark_read_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_notifications_mark_all_read_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_order_reorder_preview_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_order_reorder_apply_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_after_sales_create_v1(uuid, text, text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_after_sales_list_v1(text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_after_sales_cancel_v1(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_after_sales_evidence_upload_ticket_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_after_sales_evidence_register_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_review_submit_v1(uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_reviews_list_v1(text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_review_update_v1(uuid, bigint, integer, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.storefront_product_reviews_v1(text, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.storefront_search_suggestions_v1(text, text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_addresses_read_v2(),
  public.customer_address_upsert_v2(uuid, bigint, jsonb),
  public.customer_address_delete_v2(uuid, bigint),
  public.customer_delivery_context_select_v1(text, text, uuid, uuid, bigint),
  public.customer_delivery_context_read_v1(text),
  public.customer_checkout_quote_create_v2(text, bigint, text, uuid, uuid, uuid, bigint, uuid),
  public.customer_payment_recovery_read_v1(uuid),
  public.customer_notifications_list_v1(text, text, timestamptz, uuid, integer),
  public.customer_notification_mark_read_v1(uuid),
  public.customer_notifications_mark_all_read_v1(text),
  public.customer_order_reorder_preview_v1(uuid),
  public.customer_order_reorder_apply_v1(uuid, uuid),
  public.customer_after_sales_create_v1(uuid, text, text, text, jsonb, uuid),
  public.customer_after_sales_list_v1(text, integer),
  public.customer_after_sales_cancel_v1(uuid, bigint),
  public.customer_after_sales_evidence_upload_ticket_v1(uuid, text),
  public.customer_after_sales_evidence_register_v1(uuid, text),
  public.customer_review_submit_v1(uuid, integer, text),
  public.customer_reviews_list_v1(text, boolean),
  public.customer_review_update_v1(uuid, bigint, integer, text, boolean)
  to authenticated;
grant execute on function public.storefront_delivery_context_preview_v1(text, text, uuid, uuid, text),
  public.storefront_product_reviews_v1(text, uuid, timestamptz, uuid, integer),
  public.storefront_search_suggestions_v1(text, text, integer)
  to anon, authenticated;

revoke all on function public.admin_customer_after_sales_read_v1(uuid, text, integer, integer, uuid, uuid, text, integer),
  public.admin_customer_after_sales_evidence_read_v1(uuid, uuid, uuid, uuid, text, integer),
  public.admin_customer_after_sales_transition_v1(uuid, uuid, bigint, text, text, uuid, uuid, text, integer),
  public.admin_customer_reviews_read_v1(uuid, text, integer, integer, uuid, uuid, text, integer),
  public.admin_customer_review_moderate_v1(uuid, uuid, bigint, text, text, uuid, uuid, text, integer),
  public.service_after_sales_evidence_scan_ack_v1(uuid, text, text, bigint, integer, integer, boolean, text),
  public.service_after_sales_evidence_cleanup_claim_v1(timestamptz, timestamptz, integer),
  public.service_after_sales_evidence_cleanup_ack_v1(uuid, boolean),
  public.service_customer_after_sales_refund_ack_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_customer_after_sales_read_v1(uuid, text, integer, integer, uuid, uuid, text, integer),
  public.admin_customer_after_sales_evidence_read_v1(uuid, uuid, uuid, uuid, text, integer),
  public.admin_customer_after_sales_transition_v1(uuid, uuid, bigint, text, text, uuid, uuid, text, integer),
  public.admin_customer_reviews_read_v1(uuid, text, integer, integer, uuid, uuid, text, integer),
  public.admin_customer_review_moderate_v1(uuid, uuid, bigint, text, text, uuid, uuid, text, integer),
  public.service_after_sales_evidence_scan_ack_v1(uuid, text, text, bigint, integer, integer, boolean, text),
  public.service_after_sales_evidence_cleanup_claim_v1(timestamptz, timestamptz, integer),
  public.service_after_sales_evidence_cleanup_ack_v1(uuid, boolean),
  public.service_customer_after_sales_refund_ack_v1(uuid, text, uuid)
  to service_role;
grant execute on function public.admin_customer_after_sales_read_v1(uuid, text, integer, integer, uuid, uuid, text, integer),
  public.admin_customer_after_sales_evidence_read_v1(uuid, uuid, uuid, uuid, text, integer),
  public.admin_customer_after_sales_transition_v1(uuid, uuid, bigint, text, text, uuid, uuid, text, integer),
  public.admin_customer_reviews_read_v1(uuid, text, integer, integer, uuid, uuid, text, integer),
  public.admin_customer_review_moderate_v1(uuid, uuid, bigint, text, text, uuid, uuid, text, integer)
  to authenticated;

comment on function public.storefront_delivery_context_preview_v1(text, text, uuid, uuid, text) is
  'Server-authoritative delivery serviceability preview over existing zones, fees, points and slot capacity; guest input is commune-only.';
comment on function public.customer_checkout_quote_create_v2(text, bigint, text, uuid, uuid, uuid, bigint, uuid) is
  'Rejects stale delivery context before invoking the existing server-authoritative quote boundary.';
comment on function public.customer_order_reorder_apply_v1(uuid, uuid) is
  'Idempotently adds currently published and available items to the existing cart without creating an order.';
comment on function public.service_customer_after_sales_refund_ack_v1(uuid, text, uuid) is
  'Closes a refund case only after the existing payment aggregate records a real provider or attested manual refund.';

notify pgrst, 'reload schema';

commit;
