-- Storefront v1 / TASK-026
--
-- Shop-scoped fulfillment configuration and customer-owned checkout quotes. Prices,
-- promotions, stock, hold eligibility, addresses, zones, slots, fees and totals are
-- resolved server-side. This migration intentionally does not create an order.

begin;

create table public.storefront_pickup_points (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  public_name text not null,
  address_line_1 text not null,
  address_line_2 text,
  commune text not null,
  region text not null,
  public_instructions text,
  enabled boolean not null default false,
  sort_rank bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_pickup_points_shop_id_id_unique unique (shop_id, id),
  constraint storefront_pickup_points_name_check check (
    public_name = btrim(public_name)
    and length(public_name) between 1 and 120
    and public_name !~ '[[:cntrl:]]'
  ),
  constraint storefront_pickup_points_address_1_check check (
    address_line_1 = btrim(address_line_1)
    and length(address_line_1) between 1 and 200
    and address_line_1 !~ '[[:cntrl:]]'
  ),
  constraint storefront_pickup_points_address_2_check check (
    address_line_2 is null
    or (
      address_line_2 = btrim(address_line_2)
      and length(address_line_2) between 1 and 200
      and address_line_2 !~ '[[:cntrl:]]'
    )
  ),
  constraint storefront_pickup_points_commune_check check (
    commune = btrim(commune)
    and length(commune) between 1 and 100
    and commune !~ '[[:cntrl:]]'
  ),
  constraint storefront_pickup_points_region_check check (
    region = btrim(region)
    and length(region) between 1 and 100
    and region !~ '[[:cntrl:]]'
  ),
  constraint storefront_pickup_points_instructions_check check (
    public_instructions is null
    or (
      public_instructions = btrim(public_instructions)
      and length(public_instructions) between 1 and 500
      and public_instructions !~ '[[:cntrl:]]'
    )
  )
);

create index storefront_pickup_points_shop_enabled_sort_idx
  on public.storefront_pickup_points(shop_id, enabled desc, sort_rank, id);

create table public.storefront_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  public_name text not null,
  region text not null,
  fee_clp bigint not null default 0,
  enabled boolean not null default false,
  sort_rank bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_delivery_zones_shop_id_id_unique unique (shop_id, id),
  constraint storefront_delivery_zones_name_check check (
    public_name = btrim(public_name)
    and length(public_name) between 1 and 120
    and public_name !~ '[[:cntrl:]]'
  ),
  constraint storefront_delivery_zones_region_check check (
    region = btrim(region)
    and length(region) between 1 and 100
    and region !~ '[[:cntrl:]]'
  ),
  constraint storefront_delivery_zones_fee_check check (
    fee_clp between 0 and 999999999999
  )
);

create index storefront_delivery_zones_shop_enabled_sort_idx
  on public.storefront_delivery_zones(shop_id, enabled desc, sort_rank, id);

create table public.storefront_delivery_zone_communes (
  shop_id uuid not null,
  zone_id uuid not null,
  commune text not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (zone_id, commune),
  constraint storefront_delivery_zone_communes_zone_fkey foreign key (
    shop_id,
    zone_id
  ) references public.storefront_delivery_zones(shop_id, id) on delete cascade,
  constraint storefront_delivery_zone_communes_value_check check (
    commune = btrim(commune)
    and length(commune) between 1 and 100
    and commune !~ '[[:cntrl:]]'
  )
);

create unique index storefront_delivery_zone_communes_normalized_idx
  on public.storefront_delivery_zone_communes(
    shop_id,
    zone_id,
    lower(regexp_replace(commune, '\s+', ' ', 'g'))
  );
create index storefront_delivery_zone_communes_lookup_idx
  on public.storefront_delivery_zone_communes(
    shop_id,
    lower(regexp_replace(commune, '\s+', ' ', 'g')),
    zone_id
  );

create table public.storefront_fulfillment_slots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  fulfillment_mode text not null,
  pickup_point_id uuid,
  delivery_zone_id uuid,
  public_label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null,
  enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_fulfillment_slots_shop_id_id_unique unique (shop_id, id),
  constraint storefront_fulfillment_slots_pickup_fkey foreign key (
    shop_id,
    pickup_point_id
  ) references public.storefront_pickup_points(shop_id, id),
  constraint storefront_fulfillment_slots_zone_fkey foreign key (
    shop_id,
    delivery_zone_id
  ) references public.storefront_delivery_zones(shop_id, id),
  constraint storefront_fulfillment_slots_mode_check check (
    fulfillment_mode in ('pickup', 'reservation', 'delivery')
  ),
  constraint storefront_fulfillment_slots_shape_check check (
    (
      fulfillment_mode in ('pickup', 'reservation')
      and pickup_point_id is not null
      and delivery_zone_id is null
    )
    or (
      fulfillment_mode = 'delivery'
      and pickup_point_id is null
      and delivery_zone_id is not null
    )
  ),
  constraint storefront_fulfillment_slots_label_check check (
    public_label = btrim(public_label)
    and length(public_label) between 1 and 120
    and public_label !~ '[[:cntrl:]]'
  ),
  constraint storefront_fulfillment_slots_window_check check (
    starts_at < ends_at
    and ends_at <= starts_at + interval '24 hours'
  ),
  constraint storefront_fulfillment_slots_capacity_check check (
    capacity between 1 and 1000
  )
);

create index storefront_fulfillment_slots_shop_window_idx
  on public.storefront_fulfillment_slots(
    shop_id,
    fulfillment_mode,
    enabled,
    starts_at,
    id
  );

create table public.customer_checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  cart_id uuid not null,
  cart_version bigint not null,
  quote_version bigint not null default 1,
  fulfillment_mode text not null,
  address_id uuid,
  pickup_point_id uuid,
  delivery_zone_id uuid,
  slot_id uuid not null,
  status text not null,
  currency_code text not null default 'CLP',
  subtotal_clp bigint not null,
  delivery_fee_clp bigint not null default 0,
  total_clp bigint not null,
  items_snapshot jsonb not null,
  changes jsonb not null default '[]'::jsonb,
  address_snapshot jsonb,
  quoted_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  consumed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_checkout_quotes_cart_owner_fkey foreign key (
    user_id,
    shop_id,
    cart_id
  ) references public.customer_carts(user_id, shop_id, id) on delete cascade,
  constraint customer_checkout_quotes_address_owner_fkey foreign key (
    user_id,
    address_id
  ) references public.customer_addresses(user_id, id),
  constraint customer_checkout_quotes_pickup_fkey foreign key (
    shop_id,
    pickup_point_id
  ) references public.storefront_pickup_points(shop_id, id),
  constraint customer_checkout_quotes_zone_fkey foreign key (
    shop_id,
    delivery_zone_id
  ) references public.storefront_delivery_zones(shop_id, id),
  constraint customer_checkout_quotes_slot_fkey foreign key (
    shop_id,
    slot_id
  ) references public.storefront_fulfillment_slots(shop_id, id),
  constraint customer_checkout_quotes_version_check check (
    cart_version >= 0 and quote_version >= 1
  ),
  constraint customer_checkout_quotes_mode_check check (
    fulfillment_mode in ('pickup', 'reservation', 'delivery')
  ),
  constraint customer_checkout_quotes_shape_check check (
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
      and address_id is not null
      and pickup_point_id is null
      and delivery_zone_id is not null
      and jsonb_typeof(address_snapshot) = 'object'
    )
  ),
  constraint customer_checkout_quotes_status_check check (
    status in (
      'quoted', 'requires_review', 'confirmed', 'expired',
      'invalidated', 'consumed'
    )
  ),
  constraint customer_checkout_quotes_money_check check (
    currency_code = 'CLP'
    and subtotal_clp between 0 and 999999999999
    and delivery_fee_clp between 0 and 999999999999
    and total_clp = subtotal_clp + delivery_fee_clp
    and total_clp between 0 and 999999999999
  ),
  constraint customer_checkout_quotes_payload_check check (
    jsonb_typeof(items_snapshot) = 'array'
    and jsonb_array_length(items_snapshot) between 1 and 100
    and pg_column_size(items_snapshot) <= 262144
    and jsonb_typeof(changes) = 'array'
    and pg_column_size(changes) <= 131072
    and (address_snapshot is null or pg_column_size(address_snapshot) <= 8192)
  ),
  constraint customer_checkout_quotes_expiry_check check (
    expires_at > quoted_at
    and expires_at <= quoted_at + interval '10 minutes'
  ),
  constraint customer_checkout_quotes_lifecycle_check check (
    (status in ('quoted', 'requires_review', 'expired', 'invalidated')
      and consumed_at is null)
    or (status = 'confirmed' and confirmed_at is not null and consumed_at is null)
    or (status = 'consumed' and confirmed_at is not null and consumed_at is not null)
  )
);

create unique index customer_checkout_quotes_one_active_cart_idx
  on public.customer_checkout_quotes(user_id, shop_id, cart_id)
  where status in ('quoted', 'requires_review', 'confirmed');
create index customer_checkout_quotes_active_slot_idx
  on public.customer_checkout_quotes(slot_id, expires_at, id)
  where status in ('quoted', 'requires_review', 'confirmed');
create index customer_checkout_quotes_owner_updated_idx
  on public.customer_checkout_quotes(user_id, shop_id, updated_at desc, id);

create table public.customer_checkout_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  quote_id uuid references public.customer_checkout_quotes(id) on delete cascade,
  idempotency_key uuid not null,
  operation text not null,
  request_sha256 text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp() + interval '7 days',
  constraint customer_checkout_mutations_owner_key_unique unique (
    user_id,
    shop_id,
    idempotency_key
  ),
  constraint customer_checkout_mutations_operation_check check (
    operation in ('create', 'confirm')
  ),
  constraint customer_checkout_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_checkout_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 393216
  ),
  constraint customer_checkout_mutations_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '8 days'
  )
);

create index customer_checkout_mutations_expiry_idx
  on public.customer_checkout_mutations(expires_at, id);

create trigger storefront_pickup_points_touch_updated_at
  before update on public.storefront_pickup_points
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger storefront_delivery_zones_touch_updated_at
  before update on public.storefront_delivery_zones
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger storefront_fulfillment_slots_touch_updated_at
  before update on public.storefront_fulfillment_slots
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger customer_checkout_quotes_touch_updated_at
  before update on public.customer_checkout_quotes
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.storefront_pickup_points enable row level security;
alter table public.storefront_pickup_points force row level security;
alter table public.storefront_delivery_zones enable row level security;
alter table public.storefront_delivery_zones force row level security;
alter table public.storefront_delivery_zone_communes enable row level security;
alter table public.storefront_delivery_zone_communes force row level security;
alter table public.storefront_fulfillment_slots enable row level security;
alter table public.storefront_fulfillment_slots force row level security;
alter table public.customer_checkout_quotes enable row level security;
alter table public.customer_checkout_quotes force row level security;
alter table public.customer_checkout_mutations enable row level security;
alter table public.customer_checkout_mutations force row level security;

create policy customer_checkout_quotes_select_owner
  on public.customer_checkout_quotes for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_checkout_quotes_insert_owner
  on public.customer_checkout_quotes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_checkout_quotes_update_owner
  on public.customer_checkout_quotes for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_checkout_quotes_delete_owner
  on public.customer_checkout_quotes for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

create policy customer_checkout_mutations_select_owner
  on public.customer_checkout_mutations for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_checkout_mutations_insert_owner
  on public.customer_checkout_mutations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_checkout_mutations_update_owner
  on public.customer_checkout_mutations for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy customer_checkout_mutations_delete_owner
  on public.customer_checkout_mutations for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

revoke all on table public.storefront_pickup_points
  from public, anon, authenticated;
revoke all on table public.storefront_delivery_zones
  from public, anon, authenticated;
revoke all on table public.storefront_delivery_zone_communes
  from public, anon, authenticated;
revoke all on table public.storefront_fulfillment_slots
  from public, anon, authenticated;
revoke all on table public.customer_checkout_quotes
  from public, anon, authenticated;
revoke all on table public.customer_checkout_mutations
  from public, anon, authenticated;

grant select, insert, update, delete on table public.storefront_pickup_points
  to service_role;
grant select, insert, update, delete on table public.storefront_delivery_zones
  to service_role;
grant select, insert, update, delete on table public.storefront_delivery_zone_communes
  to service_role;
grant select, insert, update, delete on table public.storefront_fulfillment_slots
  to service_role;
grant select, insert, update, delete on table public.customer_checkout_quotes
  to service_role;
grant select, insert, update, delete on table public.customer_checkout_mutations
  to service_role;

create or replace function app_private.customer_checkout_error_v1(
  p_status text,
  p_idempotent boolean,
  p_at timestamptz,
  p_quote_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-checkout.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'quoteId', p_quote_id,
    'serverTime', p_at
  ));
$$;

create or replace function app_private.customer_checkout_quote_payload_v1(
  p_quote_id uuid,
  p_status text,
  p_idempotent boolean,
  p_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'apiVersion', 'customer-checkout.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'quoteId', quote.id,
    'shopSlug', setting.public_slug,
    'cartVersion', quote.cart_version,
    'quoteVersion', quote.quote_version,
    'quoteStatus', case
      when quote.status in ('quoted', 'requires_review', 'confirmed')
        and quote.expires_at <= p_at then 'expired'
      else quote.status
    end,
    'fulfillmentMode', quote.fulfillment_mode,
    'addressId', quote.address_id,
    'pickupPointId', quote.pickup_point_id,
    'deliveryZoneId', quote.delivery_zone_id,
    'slotId', quote.slot_id,
    'currencyCode', quote.currency_code,
    'subtotalClp', quote.subtotal_clp,
    'deliveryFeeClp', quote.delivery_fee_clp,
    'totalClp', quote.total_clp,
    'items', quote.items_snapshot,
    'changes', quote.changes,
    'requiresCustomerReview', quote.status = 'requires_review',
    'quotedAt', quote.quoted_at,
    'expiresAt', quote.expires_at,
    'confirmedAt', quote.confirmed_at,
    'serverTime', p_at,
    'remainingSeconds', case
      when quote.status in ('quoted', 'requires_review', 'confirmed')
        and quote.expires_at > p_at
      then greatest(0, floor(extract(epoch from quote.expires_at - p_at))::integer)
      else 0
    end
  ))
  from public.customer_checkout_quotes quote
  join public.storefront_settings setting on setting.shop_id = quote.shop_id
  where quote.id = p_quote_id;
$$;

create or replace function public.storefront_fulfillment_options_v1(
  p_shop_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_setting public.storefront_settings%rowtype;
  v_now timestamptz := statement_timestamp();
  v_modes jsonb := '[]'::jsonb;
  v_points jsonb := '[]'::jsonb;
  v_zones jsonb := '[]'::jsonb;
  v_slots jsonb := '[]'::jsonb;
begin
  if p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then
    return jsonb_build_object(
      'apiVersion', 'storefront-fulfillment.v1',
      'status', 'invalid',
      'serverTime', v_now
    );
  end if;

  select setting.* into v_setting
  from public.storefront_settings setting
  where setting.public_slug = p_shop_slug
    and setting.storefront_enabled;
  if not found then
    return jsonb_build_object(
      'apiVersion', 'storefront-fulfillment.v1',
      'status', 'unavailable',
      'serverTime', v_now
    );
  end if;

  with mode_rows(mode, enabled) as (
    values
      ('pickup'::text, v_setting.pickup_enabled and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_pickup_points point
          on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'pickup'
          and slot.enabled and point.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      )),
      ('reservation'::text, v_setting.reservation_enabled and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_pickup_points point
          on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'reservation'
          and slot.enabled and point.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      )),
      ('delivery'::text, v_setting.delivery_enabled and exists (
        select 1
        from public.storefront_fulfillment_slots slot
        join public.storefront_delivery_zones zone
          on zone.shop_id = slot.shop_id and zone.id = slot.delivery_zone_id
        where slot.shop_id = v_setting.shop_id
          and slot.fulfillment_mode = 'delivery'
          and slot.enabled and zone.enabled
          and slot.ends_at > v_now
          and slot.starts_at <= v_now + interval '14 days'
      ))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'mode', mode.mode,
    'enabled', mode.enabled
  ) order by case mode.mode when 'pickup' then 1 when 'reservation' then 2 else 3 end), '[]'::jsonb)
  into v_modes
  from mode_rows mode;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', point.id,
    'name', point.public_name,
    'addressLine1', point.address_line_1,
    'addressLine2', point.address_line_2,
    'commune', point.commune,
    'region', point.region,
    'instructions', point.public_instructions
  ) order by point.sort_rank, point.public_name, point.id), '[]'::jsonb)
  into v_points
  from public.storefront_pickup_points point
  where point.shop_id = v_setting.shop_id
    and point.enabled
    and exists (
      select 1 from public.storefront_fulfillment_slots slot
      where slot.shop_id = point.shop_id
        and slot.pickup_point_id = point.id
        and slot.enabled
        and slot.ends_at > v_now
        and slot.starts_at <= v_now + interval '14 days'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', zone.id,
    'name', zone.public_name,
    'region', zone.region,
    'communes', coalesce((
      select jsonb_agg(commune.commune order by commune.commune)
      from public.storefront_delivery_zone_communes commune
      where commune.shop_id = zone.shop_id and commune.zone_id = zone.id
    ), '[]'::jsonb),
    'feeClp', zone.fee_clp
  ) order by zone.sort_rank, zone.public_name, zone.id), '[]'::jsonb)
  into v_zones
  from public.storefront_delivery_zones zone
  where zone.shop_id = v_setting.shop_id
    and zone.enabled
    and exists (
      select 1 from public.storefront_fulfillment_slots slot
      where slot.shop_id = zone.shop_id
        and slot.delivery_zone_id = zone.id
        and slot.enabled
        and slot.ends_at > v_now
        and slot.starts_at <= v_now + interval '14 days'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', slot.id,
    'mode', slot.fulfillment_mode,
    'pickupPointId', slot.pickup_point_id,
    'deliveryZoneId', slot.delivery_zone_id,
    'label', slot.public_label,
    'startsAt', slot.starts_at,
    'endsAt', slot.ends_at,
    'status', 'available'
  ) order by slot.starts_at, slot.id), '[]'::jsonb)
  into v_slots
  from public.storefront_fulfillment_slots slot
  left join public.storefront_pickup_points point
    on point.shop_id = slot.shop_id and point.id = slot.pickup_point_id
  left join public.storefront_delivery_zones zone
    on zone.shop_id = slot.shop_id and zone.id = slot.delivery_zone_id
  where slot.shop_id = v_setting.shop_id
    and slot.enabled
    and slot.ends_at > v_now
    and slot.starts_at <= v_now + interval '14 days'
    and case slot.fulfillment_mode
      when 'pickup' then v_setting.pickup_enabled and point.enabled
      when 'reservation' then v_setting.reservation_enabled and point.enabled
      when 'delivery' then v_setting.delivery_enabled and zone.enabled
      else false
    end
    and slot.capacity > (
      select count(*)
      from public.customer_checkout_quotes quote
      where quote.slot_id = slot.id
        and quote.status in ('quoted', 'requires_review', 'confirmed')
        and quote.expires_at > v_now
    );

  return jsonb_build_object(
    'apiVersion', 'storefront-fulfillment.v1',
    'status', 'ok',
    'shopSlug', p_shop_slug,
    'currencyCode', 'CLP',
    'modes', v_modes,
    'pickupPoints', v_points,
    'deliveryZones', v_zones,
    'slots', v_slots,
    'serverTime', v_now
  );
end;
$$;

create or replace function app_private.customer_checkout_validate_v1(
  p_user_id uuid,
  p_shop_id uuid,
  p_cart_id uuid,
  p_cart_version bigint,
  p_fulfillment_mode text,
  p_address_id uuid,
  p_pickup_point_id uuid,
  p_slot_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_setting public.storefront_settings%rowtype;
  v_slot public.storefront_fulfillment_slots%rowtype;
  v_zone public.storefront_delivery_zones%rowtype;
  v_address public.customer_addresses%rowtype;
  v_slot_uses integer;
  v_item_count integer;
  v_invalid_count integer;
  v_subtotal bigint;
  v_items jsonb;
  v_changes jsonb;
  v_address_snapshot jsonb := null;
begin
  if p_user_id is null
    or p_shop_id is null
    or p_cart_id is null
    or p_cart_version is null
    or p_cart_version < 0
    or p_fulfillment_mode not in ('pickup', 'reservation', 'delivery')
    or p_slot_id is null
    or p_at is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select setting.* into v_setting
  from public.storefront_settings setting
  where setting.shop_id = p_shop_id
    and setting.storefront_enabled
  for share;
  if not found
    or (p_fulfillment_mode = 'pickup' and not v_setting.pickup_enabled)
    or (p_fulfillment_mode = 'reservation' and not v_setting.reservation_enabled)
    or (p_fulfillment_mode = 'delivery' and not v_setting.delivery_enabled) then
    return jsonb_build_object('status', 'mode_unavailable');
  end if;

  select slot.* into v_slot
  from public.storefront_fulfillment_slots slot
  where slot.shop_id = p_shop_id
    and slot.id = p_slot_id
    and slot.fulfillment_mode = p_fulfillment_mode
    and slot.enabled
    and slot.ends_at > p_at
    and slot.starts_at <= p_at + interval '14 days'
  for update;
  if not found then
    return jsonb_build_object('status', 'slot_unavailable');
  end if;

  if p_fulfillment_mode in ('pickup', 'reservation') then
    if p_address_id is not null
      or p_pickup_point_id is null
      or v_slot.pickup_point_id <> p_pickup_point_id then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
    perform 1
    from public.storefront_pickup_points point
    where point.shop_id = p_shop_id
      and point.id = p_pickup_point_id
      and point.enabled
    for share;
    if not found then
      return jsonb_build_object('status', 'pickup_unavailable');
    end if;
  else
    if p_address_id is null
      or p_pickup_point_id is not null
      or v_slot.delivery_zone_id is null then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
    select zone.* into v_zone
    from public.storefront_delivery_zones zone
    where zone.shop_id = p_shop_id
      and zone.id = v_slot.delivery_zone_id
      and zone.enabled
    for share;
    if not found then
      return jsonb_build_object('status', 'delivery_unavailable');
    end if;

    select address.* into v_address
    from public.customer_addresses address
    where address.user_id = p_user_id
      and address.id = p_address_id
      and address.country_code = 'CL'
    for share;
    if not found then
      return jsonb_build_object('status', 'invalid_address');
    end if;
    if lower(regexp_replace(v_address.region, '\s+', ' ', 'g'))
        <> lower(regexp_replace(v_zone.region, '\s+', ' ', 'g'))
      or not exists (
        select 1
        from public.storefront_delivery_zone_communes commune
        where commune.shop_id = p_shop_id
          and commune.zone_id = v_zone.id
          and lower(regexp_replace(commune.commune, '\s+', ' ', 'g'))
            = lower(regexp_replace(v_address.commune, '\s+', ' ', 'g'))
      ) then
      return jsonb_build_object('status', 'unsupported_zone');
    end if;
    v_address_snapshot := jsonb_build_object(
      'addressId', v_address.id,
      'recipientName', v_address.recipient_name,
      'addressLine1', v_address.address_line_1,
      'addressLine2', v_address.address_line_2,
      'commune', v_address.commune,
      'region', v_address.region,
      'postalCode', v_address.postal_code,
      'countryCode', v_address.country_code,
      'deliveryInstructions', v_address.delivery_instructions
    );
  end if;

  select count(*)::integer into v_slot_uses
  from public.customer_checkout_quotes quote
  where quote.slot_id = v_slot.id
    and quote.cart_id <> p_cart_id
    and quote.status in ('quoted', 'requires_review', 'confirmed')
    and quote.expires_at > p_at;
  if v_slot_uses >= v_slot.capacity then
    return jsonb_build_object('status', 'slot_unavailable');
  end if;

  perform product.id
  from public.customer_cart_items item
  join public.storefront_product_publications publication
    on publication.shop_id = item.shop_id
    and publication.id = item.publication_id
  join public.inventory_products product
    on product.id = publication.source_product_id
  where item.cart_id = p_cart_id
    and item.user_id = p_user_id
    and item.shop_id = p_shop_id
  order by product.id
  for update of product;

  with resolved as materialized (
    select
      item.id,
      item.publication_id,
      item.quantity,
      item.snapshot_price_clp,
      item.snapshot_promotion_id,
      source.publication_id as live_publication_id,
      source.public_name,
      source.price_clp,
      source.compare_at_price_clp,
      source.promotion_id,
      source.promotion_name,
      source.promotion_ends_at,
      source.pickup_enabled,
      source.delivery_enabled,
      source.reservation_enabled,
      source.availability_mode,
      product.id as source_product_id,
      product.stock_quantity,
      product.deleted_at,
      own_hold.id as hold_id,
      coalesce(own_hold.quantity, 0) as own_hold_quantity,
      case when product.id is null then 0::numeric else
        app_private.storefront_reservation_active_quantity_v1(product.id, p_at)
      end as active_hold_quantity
    from public.customer_cart_items item
    left join lateral app_private.storefront_catalog_source_v1(
      item.publication_id,
      p_shop_id,
      p_at
    ) source on true
    left join public.storefront_product_publications publication
      on publication.shop_id = item.shop_id
      and publication.id = item.publication_id
    left join public.inventory_products product
      on product.id = publication.source_product_id
    left join lateral (
      select hold.id, hold.quantity
      from public.customer_reservation_holds hold
      where hold.user_id = p_user_id
        and hold.shop_id = p_shop_id
        and hold.publication_id = item.publication_id
        and hold.status = 'active'
        and hold.expires_at > p_at
      order by hold.expires_at desc, hold.id
      limit 1
    ) own_hold on true
    where item.cart_id = p_cart_id
      and item.user_id = p_user_id
      and item.shop_id = p_shop_id
  ), evaluated as materialized (
    select
      resolved.*,
      (
        resolved.live_publication_id is not null
        and resolved.price_clp is not null
        and resolved.source_product_id is not null
        and resolved.deleted_at is null
        and resolved.stock_quantity is not null
        and resolved.stock_quantity not in (
          'Infinity'::double precision,
          '-Infinity'::double precision,
          'NaN'::double precision
        )
        and case p_fulfillment_mode
          when 'pickup' then resolved.pickup_enabled
          when 'reservation' then resolved.reservation_enabled
          when 'delivery' then resolved.delivery_enabled
          else false
        end
        and (
          resolved.own_hold_quantity >= resolved.quantity
          or (
            p_fulfillment_mode <> 'reservation'
            and resolved.availability_mode <> 'unavailable'
            and resolved.stock_quantity
              - resolved.active_hold_quantity::double precision
              >= resolved.quantity
          )
        )
      ) as eligible,
      case
        when resolved.live_publication_id is null then 'unavailable'
        when resolved.own_hold_quantity < resolved.quantity
          and p_fulfillment_mode = 'reservation' then 'hold_required'
        when resolved.availability_mode = 'unavailable'
          and resolved.own_hold_quantity < resolved.quantity then 'unavailable'
        when resolved.snapshot_price_clp <> resolved.price_clp then 'price_changed'
        when resolved.snapshot_promotion_id is distinct from resolved.promotion_id
          then 'promotion_changed'
        else 'none'
      end as change_type
    from resolved
  ), aggregated as (
    select
      count(*)::integer as item_count,
      count(*) filter (where evaluated.eligible is not true)::integer as invalid_count,
      coalesce(sum(
        evaluated.price_clp * evaluated.quantity
      ) filter (where evaluated.eligible), 0)::bigint as subtotal_clp,
      coalesce(jsonb_agg(jsonb_build_object(
        'publicationId', evaluated.publication_id,
        'publicName', evaluated.public_name,
        'quantity', evaluated.quantity,
        'unitPriceClp', evaluated.price_clp,
        'compareAtPriceClp', evaluated.compare_at_price_clp,
        'lineTotalClp', evaluated.price_clp * evaluated.quantity,
        'promotionId', evaluated.promotion_id,
        'promotionName', evaluated.promotion_name,
        'promotionEndsAt', evaluated.promotion_ends_at,
        'holdId', evaluated.hold_id
      ) order by evaluated.id) filter (where evaluated.eligible), '[]'::jsonb) as items,
      coalesce(jsonb_agg(jsonb_build_object(
        'publicationId', evaluated.publication_id,
        'type', evaluated.change_type,
        'previousPriceClp', evaluated.snapshot_price_clp,
        'currentPriceClp', evaluated.price_clp
      ) order by evaluated.id) filter (where evaluated.change_type <> 'none'), '[]'::jsonb) as changes
    from evaluated
  )
  select
    aggregated.item_count,
    aggregated.invalid_count,
    aggregated.subtotal_clp,
    aggregated.items,
    aggregated.changes
  into v_item_count, v_invalid_count, v_subtotal, v_items, v_changes
  from aggregated;

  if coalesce(v_item_count, 0) < 1 then
    return jsonb_build_object('status', 'cart_empty');
  end if;
  if coalesce(v_invalid_count, 0) > 0 then
    return jsonb_build_object(
      'status', 'cart_unavailable',
      'changes', coalesce(v_changes, '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'subtotalClp', v_subtotal,
    'deliveryFeeClp', case
      when p_fulfillment_mode = 'delivery' then v_zone.fee_clp else 0 end,
    'totalClp', v_subtotal + case
      when p_fulfillment_mode = 'delivery' then v_zone.fee_clp else 0 end,
    'items', v_items,
    'changes', v_changes,
    'requiresReview', jsonb_array_length(v_changes) > 0,
    'addressSnapshot', v_address_snapshot,
    'deliveryZoneId', case
      when p_fulfillment_mode = 'delivery' then v_zone.id end
  );
end;
$$;

create or replace function public.customer_checkout_quote_create_v1(
  p_shop_slug text,
  p_cart_version bigint,
  p_fulfillment_mode text,
  p_address_id uuid,
  p_pickup_point_id uuid,
  p_slot_id uuid,
  p_idempotency_key uuid
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
  v_shop_id uuid;
  v_cart public.customer_carts%rowtype;
  v_now timestamptz := statement_timestamp();
  v_request_sha256 text;
  v_previous public.customer_checkout_mutations%rowtype;
  v_validation jsonb;
  v_status text;
  v_quote_id uuid;
  v_result jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_cart_version is null
    or p_cart_version < 0
    or p_fulfillment_mode not in ('pickup', 'reservation', 'delivery')
    or p_slot_id is null
    or p_idempotency_key is null
    or (p_fulfillment_mode = 'delivery' and (
      p_address_id is null or p_pickup_point_id is not null
    ))
    or (p_fulfillment_mode in ('pickup', 'reservation') and (
      p_address_id is not null or p_pickup_point_id is null
    )) then
    return app_private.customer_checkout_error_v1(
      'invalid', false, v_now
    );
  end if;

  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  if v_shop_id is null then
    return app_private.customer_checkout_error_v1(
      'unavailable', false, v_now
    );
  end if;
  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'create', p_shop_slug, p_cart_version, p_fulfillment_mode,
      p_address_id, p_pickup_point_id, p_slot_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-checkout:' || v_user_id::text || ':' || v_shop_id::text,
    26026
  ));

  delete from public.customer_checkout_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_shop_id
    and mutation.expires_at <= v_now;
  update public.customer_checkout_quotes quote
  set status = 'expired'
  where quote.user_id = v_user_id
    and quote.shop_id = v_shop_id
    and quote.status in ('quoted', 'requires_review', 'confirmed')
    and quote.expires_at <= v_now;

  select mutation.* into v_previous
  from public.customer_checkout_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create'
      or v_previous.request_sha256 <> v_request_sha256 then
      return app_private.customer_checkout_error_v1(
        'idempotency_conflict', false, v_now
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  select cart.* into v_cart
  from public.customer_carts cart
  where cart.user_id = v_user_id
    and cart.shop_id = v_shop_id
  for update;
  if not found then
    v_result := app_private.customer_checkout_error_v1(
      'cart_empty', false, v_now
    );
  elsif v_cart.cart_version <> p_cart_version then
    v_result := app_private.customer_checkout_error_v1(
      'cart_version_conflict', false, v_now
    );
  else
    v_validation := app_private.customer_checkout_validate_v1(
      v_user_id,
      v_shop_id,
      v_cart.id,
      v_cart.cart_version,
      p_fulfillment_mode,
      p_address_id,
      p_pickup_point_id,
      p_slot_id,
      v_now
    );
    if v_validation->>'status' <> 'ok' then
      v_result := app_private.customer_checkout_error_v1(
        v_validation->>'status', false, v_now
      ) || jsonb_build_object(
        'changes', coalesce(v_validation->'changes', '[]'::jsonb)
      );
    else
      update public.customer_checkout_quotes quote
      set status = 'invalidated'
      where quote.user_id = v_user_id
        and quote.shop_id = v_shop_id
        and quote.cart_id = v_cart.id
        and quote.status in ('quoted', 'requires_review', 'confirmed');

      v_status := case when (v_validation->>'requiresReview')::boolean
        then 'requires_review' else 'quoted' end;
      insert into public.customer_checkout_quotes (
        user_id, shop_id, cart_id, cart_version, fulfillment_mode,
        address_id, pickup_point_id, delivery_zone_id, slot_id, status,
        subtotal_clp, delivery_fee_clp, total_clp, items_snapshot, changes,
        address_snapshot, quoted_at, expires_at
      ) values (
        v_user_id, v_shop_id, v_cart.id, v_cart.cart_version, p_fulfillment_mode,
        p_address_id, p_pickup_point_id,
        nullif(v_validation->>'deliveryZoneId', '')::uuid,
        p_slot_id, v_status,
        (v_validation->>'subtotalClp')::bigint,
        (v_validation->>'deliveryFeeClp')::bigint,
        (v_validation->>'totalClp')::bigint,
        v_validation->'items', v_validation->'changes',
        case when p_fulfillment_mode = 'delivery'
          then v_validation->'addressSnapshot' end,
        v_now, v_now + interval '5 minutes'
      ) returning id into v_quote_id;
      v_result := app_private.customer_checkout_quote_payload_v1(
        v_quote_id,
        v_status,
        false,
        v_now
      );
    end if;
  end if;

  insert into public.customer_checkout_mutations(
    user_id, shop_id, quote_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_shop_id, v_quote_id, p_idempotency_key, 'create',
    v_request_sha256, v_result
  );
  return v_result;
end;
$$;

create or replace function public.customer_checkout_quote_confirm_v1(
  p_quote_id uuid,
  p_expected_quote_version bigint,
  p_idempotency_key uuid
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
  v_now timestamptz := statement_timestamp();
  v_quote public.customer_checkout_quotes%rowtype;
  v_cart public.customer_carts%rowtype;
  v_previous public.customer_checkout_mutations%rowtype;
  v_request_sha256 text;
  v_validation jsonb;
  v_changed boolean;
  v_result jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_quote_id is null
    or p_expected_quote_version is null
    or p_expected_quote_version < 1
    or p_idempotency_key is null then
    return app_private.customer_checkout_error_v1('invalid', false, v_now);
  end if;

  select quote.* into v_quote
  from public.customer_checkout_quotes quote
  where quote.id = p_quote_id
    and quote.user_id = v_user_id;
  if not found then
    return app_private.customer_checkout_error_v1('not_found', false, v_now);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'customer-checkout:' || v_user_id::text || ':' || v_quote.shop_id::text,
    26026
  ));
  select quote.* into v_quote
  from public.customer_checkout_quotes quote
  where quote.id = p_quote_id
    and quote.user_id = v_user_id
  for update;
  if not found then
    return app_private.customer_checkout_error_v1('not_found', false, v_now);
  end if;
  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'confirm', p_quote_id, p_expected_quote_version
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  select mutation.* into v_previous
  from public.customer_checkout_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_quote.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'confirm'
      or v_previous.request_sha256 <> v_request_sha256 then
      return app_private.customer_checkout_error_v1(
        'idempotency_conflict', false, v_now, p_quote_id
      );
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  if v_quote.status in ('expired', 'invalidated', 'consumed')
    or v_quote.expires_at <= v_now then
    if v_quote.status in ('quoted', 'requires_review', 'confirmed') then
      update public.customer_checkout_quotes quote
      set status = 'expired'
      where quote.id = v_quote.id;
    end if;
    v_result := app_private.customer_checkout_quote_payload_v1(
      v_quote.id,
      'expired',
      false,
      v_now
    );
  elsif v_quote.quote_version <> p_expected_quote_version then
    v_result := app_private.customer_checkout_quote_payload_v1(
      v_quote.id,
      'quote_version_conflict',
      false,
      v_now
    );
  elsif v_quote.status = 'confirmed' then
    v_result := app_private.customer_checkout_quote_payload_v1(
      v_quote.id,
      'confirmed',
      false,
      v_now
    );
  else
    select cart.* into v_cart
    from public.customer_carts cart
    where cart.id = v_quote.cart_id
      and cart.user_id = v_user_id
      and cart.shop_id = v_quote.shop_id
    for update;
    if not found or v_cart.cart_version <> v_quote.cart_version then
      update public.customer_checkout_quotes quote
      set status = 'invalidated'
      where quote.id = v_quote.id;
      v_result := app_private.customer_checkout_quote_payload_v1(
        v_quote.id,
        'cart_version_conflict',
        false,
        v_now
      );
    else
      v_validation := app_private.customer_checkout_validate_v1(
        v_user_id,
        v_quote.shop_id,
        v_quote.cart_id,
        v_quote.cart_version,
        v_quote.fulfillment_mode,
        v_quote.address_id,
        v_quote.pickup_point_id,
        v_quote.slot_id,
        v_now
      );
      if v_validation->>'status' <> 'ok' then
        update public.customer_checkout_quotes quote
        set status = 'invalidated'
        where quote.id = v_quote.id;
        v_result := app_private.customer_checkout_quote_payload_v1(
          v_quote.id,
          v_validation->>'status',
          false,
          v_now
        );
      else
        v_changed :=
          v_quote.subtotal_clp <> (v_validation->>'subtotalClp')::bigint
          or v_quote.delivery_fee_clp
            <> (v_validation->>'deliveryFeeClp')::bigint
          or v_quote.total_clp <> (v_validation->>'totalClp')::bigint
          or v_quote.items_snapshot <> v_validation->'items'
          or v_quote.address_snapshot is distinct from
            case when v_quote.fulfillment_mode = 'delivery'
              then v_validation->'addressSnapshot' end;
        if v_changed then
          update public.customer_checkout_quotes quote
          set quote_version = quote.quote_version + 1,
              status = 'requires_review',
              subtotal_clp = (v_validation->>'subtotalClp')::bigint,
              delivery_fee_clp = (v_validation->>'deliveryFeeClp')::bigint,
              total_clp = (v_validation->>'totalClp')::bigint,
              items_snapshot = v_validation->'items',
              changes = v_validation->'changes',
              address_snapshot = case when quote.fulfillment_mode = 'delivery'
                then v_validation->'addressSnapshot' end,
              expires_at = least(
                v_now + interval '5 minutes',
                quote.quoted_at + interval '10 minutes'
              )
          where quote.id = v_quote.id;
          v_result := app_private.customer_checkout_quote_payload_v1(
            v_quote.id,
            'requires_review',
            false,
            v_now
          );
        else
          update public.customer_checkout_quotes quote
          set quote_version = quote.quote_version + 1,
              status = 'confirmed',
              confirmed_at = v_now,
              expires_at = least(
                v_now + interval '5 minutes',
                quote.quoted_at + interval '10 minutes'
              )
          where quote.id = v_quote.id;
          v_result := app_private.customer_checkout_quote_payload_v1(
            v_quote.id,
            'confirmed',
            false,
            v_now
          );
        end if;
      end if;
    end if;
  end if;

  insert into public.customer_checkout_mutations(
    user_id, shop_id, quote_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_quote.shop_id, v_quote.id, p_idempotency_key, 'confirm',
    v_request_sha256, v_result
  );
  return v_result;
end;
$$;

create or replace function public.customer_checkout_quote_read_v1(
  p_quote_id uuid
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
  v_now timestamptz := statement_timestamp();
  v_quote public.customer_checkout_quotes%rowtype;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_quote_id is null then
    return app_private.customer_checkout_error_v1('invalid', false, v_now);
  end if;
  select quote.* into v_quote
  from public.customer_checkout_quotes quote
  where quote.id = p_quote_id
    and quote.user_id = v_user_id
  for update;
  if not found then
    return app_private.customer_checkout_error_v1('not_found', false, v_now);
  end if;
  if v_quote.status in ('quoted', 'requires_review', 'confirmed')
    and v_quote.expires_at <= v_now then
    update public.customer_checkout_quotes quote
    set status = 'expired'
    where quote.id = v_quote.id;
  end if;
  return app_private.customer_checkout_quote_payload_v1(
    v_quote.id,
    'ok',
    true,
    v_now
  );
end;
$$;

create or replace function app_private.customer_checkout_quotes_expire_v1(
  p_limit integer default 400,
  p_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 0), 1), 400);
  v_expired integer;
begin
  if p_limit is null or p_limit not between 1 and 400 or p_at is null then
    return jsonb_build_object(
      'apiVersion', 'customer-checkout-cleanup.v1',
      'status', 'invalid',
      'processed', 0,
      'serverTime', p_at
    );
  end if;
  with candidates as materialized (
    select quote.id
    from public.customer_checkout_quotes quote
    where quote.status in ('quoted', 'requires_review', 'confirmed')
      and quote.expires_at <= p_at
    order by quote.expires_at, quote.id
    for update skip locked
    limit v_limit
  )
  update public.customer_checkout_quotes quote
  set status = 'expired'
  from candidates
  where quote.id = candidates.id;
  get diagnostics v_expired = row_count;

  delete from public.customer_checkout_mutations mutation
  where mutation.id in (
    select candidate.id
    from public.customer_checkout_mutations candidate
    where candidate.expires_at <= p_at
    order by candidate.expires_at, candidate.id
    limit v_limit
  );

  return jsonb_build_object(
    'apiVersion', 'customer-checkout-cleanup.v1',
    'status', 'ok',
    'processed', v_expired,
    'serverTime', p_at
  );
end;
$$;

do $cron$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    for v_job_id in
      select jobid from cron.job
      where jobname = 'storefront-checkout-quote-expire-v1'
    loop
      perform cron.unschedule(v_job_id);
    end loop;
    perform cron.schedule(
      'storefront-checkout-quote-expire-v1',
      '* * * * *',
      $command$select app_private.customer_checkout_quotes_expire_v1(400);$command$
    );
  end if;
end;
$cron$;

revoke all on function app_private.customer_checkout_error_v1(
  text, boolean, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_checkout_quote_payload_v1(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_checkout_validate_v1(
  uuid, uuid, uuid, bigint, text, uuid, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_checkout_quotes_expire_v1(
  integer, timestamptz
) from public, anon, authenticated;

revoke all on function public.storefront_fulfillment_options_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_checkout_quote_create_v1(
  text, bigint, text, uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_checkout_quote_confirm_v1(
  uuid, bigint, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_checkout_quote_read_v1(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.storefront_fulfillment_options_v1(text)
  to anon, authenticated;
grant execute on function public.customer_checkout_quote_create_v1(
  text, bigint, text, uuid, uuid, uuid, uuid
) to authenticated;
grant execute on function public.customer_checkout_quote_confirm_v1(
  uuid, bigint, uuid
) to authenticated;
grant execute on function public.customer_checkout_quote_read_v1(uuid)
  to authenticated;
grant execute on function app_private.customer_checkout_quotes_expire_v1(
  integer, timestamptz
) to service_role;

comment on table public.customer_checkout_quotes is
  'Private customer-owned checkout quote; TASK-027 consumes a confirmed quote to create an order.';
comment on column public.customer_checkout_quotes.total_clp is
  'Server-derived CLP total. No client total is accepted by checkout RPCs.';
comment on table public.storefront_fulfillment_slots is
  'Authoritative public fulfillment windows; capacity is private and never emitted.';

notify pgrst, 'reload schema';

commit;
