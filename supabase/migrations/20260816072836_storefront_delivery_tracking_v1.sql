-- Storefront delivery tracking v1 / CLIENT TASK-044
--
-- Server-authoritative delivery state with a customer-safe owner-scoped feed.
-- Precise courier coordinates are latest-only and are removed at terminal order
-- states, reassignment and retention expiry. Customer orders remain independent
-- from fiscal/POS events.

begin;

alter table public.storefront_settings
  add column delivery_tracking_enabled boolean not null default false,
  add column delivery_tracking_min_interval_seconds integer not null default 10,
  add column delivery_tracking_min_distance_meters integer not null default 25,
  add column delivery_tracking_freshness_seconds integer not null default 120;

alter table public.storefront_settings
  add constraint storefront_settings_tracking_interval_check check (
    delivery_tracking_min_interval_seconds between 5 and 300
  ),
  add constraint storefront_settings_tracking_distance_check check (
    delivery_tracking_min_distance_meters between 0 and 1000
  ),
  add constraint storefront_settings_tracking_freshness_check check (
    delivery_tracking_freshness_seconds between 30 and 900
  );

alter table public.staff_accounts
  drop constraint if exists staff_accounts_role_key_check,
  add constraint staff_accounts_role_key_check check (
    role_key in ('cashier', 'manager', 'viewer', 'pos_admin', 'courier')
  );

alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_role_key_check,
  add constraint staff_role_permissions_role_key_check check (
    role_key in ('cashier', 'manager', 'viewer', 'pos_admin', 'courier')
  );

alter table public.staff_role_permissions
  drop constraint if exists staff_role_permissions_permission_key_check,
  add constraint staff_role_permissions_permission_key_check check (
    permission_key in (
      'shop_admin.full_access',
      'pos.sell', 'pos.pay', 'pos.refund', 'pos.void', 'pos.discount',
      'pos.discount_over_limit', 'catalog.view', 'catalog.manage',
      'catalog.price_edit', 'catalog.import', 'catalog.export', 'catalog.read',
      'catalog.write', 'register.view', 'register.manage', 'users.view',
      'users.manage', 'staff.read', 'staff.write', 'devices.read',
      'devices.write', 'db.maintenance', 'settings.view', 'settings.write',
      'settings.manage', 'settings.read', 'printer.manage', 'sync.manage',
      'sync.read', 'sync.write', 'history.write', 'pos.dashboard.read',
      'audit.view', 'audit.read', 'storefront.view', 'storefront.edit',
      'storefront.publish', 'storefront.bulk_publish',
      'storefront.promotions.manage', 'storefront.images.manage',
      'storefront.settings.manage', 'storefront.audit.view',
      'orders.view', 'orders.manage', 'orders.delivery.view',
      'orders.delivery.manage', 'orders.delivery.track'
    )
  );

create or replace function app_private.mac_admin_w7pos_009_pos_admin_permissions()
returns table(permission_key text)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select permissions.permission_key
  from (
    values
      ('shop_admin.full_access'), ('pos.sell'), ('pos.pay'), ('pos.refund'),
      ('pos.void'), ('pos.discount'), ('catalog.view'), ('catalog.manage'),
      ('catalog.price_edit'), ('catalog.import'), ('catalog.export'),
      ('catalog.read'), ('catalog.write'), ('register.view'),
      ('register.manage'), ('users.view'), ('users.manage'), ('staff.read'),
      ('staff.write'), ('devices.read'), ('devices.write'),
      ('db.maintenance'), ('settings.view'), ('settings.write'),
      ('settings.manage'), ('settings.read'), ('printer.manage'),
      ('sync.manage'), ('sync.read'), ('sync.write'),
      ('pos.dashboard.read'), ('audit.view'), ('audit.read'),
      ('storefront.view'), ('storefront.edit'), ('storefront.publish'),
      ('storefront.bulk_publish'), ('storefront.promotions.manage'),
      ('storefront.images.manage'), ('storefront.settings.manage'),
      ('storefront.audit.view'), ('orders.view'), ('orders.manage'),
      ('orders.delivery.view'), ('orders.delivery.manage')
  ) as permissions(permission_key);
$$;

create or replace function app_private.task140_safe_staff_web_permissions()
returns table(permission_key text)
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  values
    ('catalog.read'), ('catalog.write'), ('catalog.import'),
    ('catalog.export'), ('staff.read'), ('staff.write'), ('devices.read'),
    ('audit.read'), ('settings.read'), ('pos.dashboard.read'), ('sync.read'),
    ('sync.write'), ('storefront.view'), ('storefront.edit'),
    ('storefront.publish'), ('storefront.bulk_publish'),
    ('storefront.promotions.manage'), ('storefront.images.manage'),
    ('storefront.settings.manage'), ('storefront.audit.view'),
    ('orders.view'), ('orders.manage'), ('orders.delivery.view'),
    ('orders.delivery.manage'), ('orders.delivery.track');
$$;

revoke all on function app_private.mac_admin_w7pos_009_pos_admin_permissions()
  from public, anon, authenticated, service_role;
revoke all on function app_private.task140_safe_staff_web_permissions()
  from public, anon, authenticated, service_role;

insert into public.staff_role_permissions (
  shop_id, role_key, permission_key, enabled, updated_by_profile_id, updated_at
)
select shop.shop_id, 'pos_admin', permission.permission_key, true, null, now()
from public.shops shop
cross join (
  values
    ('orders.delivery.view'),
    ('orders.delivery.manage')
) permission(permission_key)
on conflict (shop_id, role_key, permission_key)
do update set enabled = true, updated_at = now();

create table public.delivery_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  public_tracking_session_id uuid not null default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  order_id uuid not null,
  tracking_mode text not null default 'status_only',
  tracking_state text not null default 'awaiting_assignment',
  courier_public_label text,
  vehicle_kind text,
  eta_starts_at timestamptz,
  eta_ends_at timestamptz,
  store_latitude double precision,
  store_longitude double precision,
  destination_latitude double precision,
  destination_longitude double precision,
  external_carrier text,
  external_tracking_code_masked text,
  external_tracking_url text,
  contact_capability text not null default 'none',
  version bigint not null default 1,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint delivery_tracking_sessions_order_fkey foreign key (shop_id, order_id)
    references public.customer_orders(shop_id, id) on delete cascade,
  constraint delivery_tracking_sessions_public_id_unique unique (
    public_tracking_session_id
  ),
  constraint delivery_tracking_sessions_mode_check check (
    tracking_mode in ('status_only', 'external_carrier', 'live_courier')
  ),
  constraint delivery_tracking_sessions_state_check check (
    tracking_state in (
      'awaiting_assignment', 'assigned', 'active', 'paused',
      'completed', 'cancelled'
    )
  ),
  constraint delivery_tracking_sessions_label_check check (
    courier_public_label is null or (
      courier_public_label = btrim(courier_public_label)
      and length(courier_public_label) between 1 and 80
      and courier_public_label !~ '[[:cntrl:]]'
    )
  ),
  constraint delivery_tracking_sessions_vehicle_check check (
    vehicle_kind is null or vehicle_kind in (
      'walking', 'bicycle', 'motorcycle', 'car', 'van', 'other'
    )
  ),
  constraint delivery_tracking_sessions_eta_check check (
    (eta_starts_at is null and eta_ends_at is null)
    or (eta_starts_at is not null and eta_ends_at is not null
      and eta_starts_at < eta_ends_at
      and eta_ends_at <= eta_starts_at + interval '24 hours')
  ),
  constraint delivery_tracking_sessions_store_coordinates_check check (
    (store_latitude is null and store_longitude is null)
    or (store_latitude between -90 and 90
      and store_longitude between -180 and 180
      and store_latitude not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      and store_longitude not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8))
  ),
  constraint delivery_tracking_sessions_destination_coordinates_check check (
    (destination_latitude is null and destination_longitude is null)
    or (destination_latitude between -90 and 90
      and destination_longitude between -180 and 180
      and destination_latitude not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      and destination_longitude not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8))
  ),
  constraint delivery_tracking_sessions_external_shape_check check (
    (tracking_mode = 'external_carrier'
      and external_carrier is not null
      and external_tracking_url is not null)
    or (tracking_mode <> 'external_carrier'
      and external_carrier is null
      and external_tracking_code_masked is null
      and external_tracking_url is null)
  ),
  constraint delivery_tracking_sessions_carrier_check check (
    external_carrier is null or (
      external_carrier = btrim(external_carrier)
      and length(external_carrier) between 1 and 80
      and external_carrier !~ '[[:cntrl:]]'
    )
  ),
  constraint delivery_tracking_sessions_masked_code_check check (
    external_tracking_code_masked is null or (
      external_tracking_code_masked = btrim(external_tracking_code_masked)
      and length(external_tracking_code_masked) between 3 and 40
      and external_tracking_code_masked ~ '^[A-Za-z0-9*._-]+$'
    )
  ),
  constraint delivery_tracking_sessions_external_url_check check (
    external_tracking_url is null or (
      length(external_tracking_url) <= 2048
      and external_tracking_url ~ '^https://[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:[/?:#][^[:space:]]*)?$'
      and external_tracking_url !~ '@'
      and external_tracking_url !~ '#'
      and lower(external_tracking_url) !~ '^https://(localhost|[^/]*\.local(?::|/|$)|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    )
  ),
  constraint delivery_tracking_sessions_contact_check check (
    contact_capability in ('none', 'store_phone', 'store_support_url')
  ),
  constraint delivery_tracking_sessions_version_check check (version >= 1),
  constraint delivery_tracking_sessions_lifecycle_check check (
    (ended_at is null and tracking_state not in ('completed', 'cancelled'))
    or (ended_at is not null and tracking_state in ('completed', 'cancelled'))
  ),
  constraint delivery_tracking_sessions_time_check check (
    updated_at >= created_at
    and (started_at is null or started_at >= created_at)
    and (ended_at is null or ended_at >= created_at)
  )
);

create unique index delivery_tracking_sessions_active_order_idx
  on public.delivery_tracking_sessions(order_id)
  where ended_at is null;
alter table public.delivery_tracking_sessions
  add constraint delivery_tracking_sessions_shop_id_id_unique unique (shop_id, id);
create index delivery_tracking_sessions_shop_state_idx
  on public.delivery_tracking_sessions(shop_id, tracking_state, updated_at desc, id);
create index delivery_tracking_sessions_retention_idx
  on public.delivery_tracking_sessions(ended_at, id)
  where ended_at is not null;

create table public.delivery_courier_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.delivery_tracking_sessions(id)
    on delete cascade,
  shop_id uuid not null,
  order_id uuid not null,
  courier_staff_id uuid not null references public.staff_accounts(staff_id)
    on delete restrict,
  assignment_version bigint not null,
  assigned_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  created_by_profile_id uuid references public.profiles(profile_id),
  created_by_staff_id uuid references public.staff_accounts(staff_id),
  constraint delivery_courier_assignments_session_shop_fkey foreign key (
    shop_id, session_id
  ) references public.delivery_tracking_sessions(shop_id, id) on delete cascade,
  constraint delivery_courier_assignments_order_shop_fkey foreign key (
    shop_id, order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint delivery_courier_assignments_actor_check check (
    (created_by_profile_id is not null and created_by_staff_id is null)
    or (created_by_profile_id is null and created_by_staff_id is not null)
  ),
  constraint delivery_courier_assignments_version_check check (
    assignment_version >= 1
  ),
  constraint delivery_courier_assignments_time_check check (
    revoked_at is null or revoked_at >= assigned_at
  ),
  constraint delivery_courier_assignments_shop_id_id_unique unique (shop_id, id),
  constraint delivery_courier_assignments_session_version_unique unique (
    session_id, assignment_version
  )
);

create unique index delivery_courier_assignments_active_session_idx
  on public.delivery_courier_assignments(session_id)
  where revoked_at is null;
create index delivery_courier_assignments_staff_active_idx
  on public.delivery_courier_assignments(
    courier_staff_id, assigned_at desc, session_id
  ) where revoked_at is null;

create table public.delivery_courier_latest_locations (
  session_id uuid primary key references public.delivery_tracking_sessions(id)
    on delete cascade,
  shop_id uuid not null,
  order_id uuid not null,
  assignment_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  horizontal_accuracy_meters double precision not null,
  bearing_degrees double precision,
  speed_meters_per_second double precision,
  observed_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  location_version bigint not null default 1,
  expires_at timestamptz not null default (
    statement_timestamp() + interval '24 hours'
  ),
  constraint delivery_courier_latest_locations_session_shop_fkey foreign key (
    shop_id, session_id
  ) references public.delivery_tracking_sessions(shop_id, id) on delete cascade,
  constraint delivery_courier_latest_locations_assignment_shop_fkey foreign key (
    shop_id, assignment_id
  ) references public.delivery_courier_assignments(shop_id, id) on delete cascade,
  constraint delivery_courier_latest_locations_order_shop_fkey foreign key (
    shop_id, order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint delivery_courier_latest_locations_latitude_check check (
    latitude between -90 and 90
    and latitude not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  constraint delivery_courier_latest_locations_longitude_check check (
    longitude between -180 and 180
    and longitude not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
  ),
  constraint delivery_courier_latest_locations_accuracy_check check (
    horizontal_accuracy_meters between 0 and 5000
    and horizontal_accuracy_meters not in (
      'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8
    )
  ),
  constraint delivery_courier_latest_locations_bearing_check check (
    bearing_degrees is null or (
      bearing_degrees >= 0 and bearing_degrees < 360
      and bearing_degrees not in (
        'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8
      )
    )
  ),
  constraint delivery_courier_latest_locations_speed_check check (
    speed_meters_per_second is null or (
      speed_meters_per_second between 0 and 100
      and speed_meters_per_second not in (
        'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8
      )
    )
  ),
  constraint delivery_courier_latest_locations_version_check check (
    location_version >= 1
  ),
  constraint delivery_courier_latest_locations_time_check check (
    observed_at <= received_at + interval '30 seconds'
    and observed_at >= received_at - interval '10 minutes'
    and expires_at > received_at
  )
);

create index delivery_courier_latest_locations_retention_idx
  on public.delivery_courier_latest_locations(expires_at, session_id);

create table public.delivery_tracking_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.delivery_tracking_sessions(id)
    on delete cascade,
  shop_id uuid not null,
  order_id uuid not null,
  event_version bigint not null,
  event_type text not null,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles(profile_id),
  actor_staff_id uuid references public.staff_accounts(staff_id),
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint delivery_tracking_events_session_shop_fkey foreign key (
    shop_id, session_id
  ) references public.delivery_tracking_sessions(shop_id, id) on delete cascade,
  constraint delivery_tracking_events_order_shop_fkey foreign key (
    shop_id, order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint delivery_tracking_events_version_unique unique (
    session_id, event_version
  ),
  constraint delivery_tracking_events_type_check check (
    event_type in (
      'configured', 'assigned', 'reassigned', 'started', 'paused',
      'stopped', 'terminated', 'completed', 'cancelled', 'location_accepted',
      'location_throttled'
    )
  ),
  constraint delivery_tracking_events_actor_check check (
    actor_kind in ('system', 'personal_account', 'courier_staff', 'admin_staff')
    and (
      (actor_kind = 'system' and actor_profile_id is null and actor_staff_id is null)
      or (actor_kind = 'personal_account'
        and actor_profile_id is not null and actor_staff_id is null)
      or (actor_kind in ('courier_staff', 'admin_staff')
        and actor_profile_id is null and actor_staff_id is not null)
    )
  ),
  constraint delivery_tracking_events_metadata_check check (
    jsonb_typeof(metadata_redacted) = 'object'
    and pg_column_size(metadata_redacted) <= 8192
    and not (metadata_redacted ?| array[
      'latitude', 'longitude', 'coordinates', 'email', 'phone', 'subjectId'
    ])
  )
);

create index delivery_tracking_events_order_created_idx
  on public.delivery_tracking_lifecycle_events(
    order_id, event_version, created_at
  );

create table public.delivery_tracking_mutations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  session_id uuid references public.delivery_tracking_sessions(id)
    on delete cascade,
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  idempotency_key uuid not null,
  operation text not null,
  request_sha256 text not null,
  actor_profile_id uuid references public.profiles(profile_id),
  actor_staff_id uuid references public.staff_accounts(staff_id),
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null default (
    statement_timestamp() + interval '24 hours'
  ),
  constraint delivery_tracking_mutations_key_unique unique (
    shop_id, idempotency_key
  ),
  constraint delivery_tracking_mutations_actor_check check (
    (actor_profile_id is not null and actor_staff_id is null)
    or (actor_profile_id is null and actor_staff_id is not null)
  ),
  constraint delivery_tracking_mutations_operation_check check (
    operation in (
      'configure_status', 'configure_external', 'configure_live', 'assign',
      'start', 'pause', 'stop', 'terminate', 'location_upsert'
    )
  ),
  constraint delivery_tracking_mutations_hash_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint delivery_tracking_mutations_response_check check (
    jsonb_typeof(response_payload) = 'object'
    and pg_column_size(response_payload) <= 16384
    and not (response_payload ?| array['latitude', 'longitude', 'coordinates'])
  ),
  constraint delivery_tracking_mutations_retention_check check (
    retained_until > created_at
  )
);

create index delivery_tracking_mutations_retention_idx
  on public.delivery_tracking_mutations(retained_until, id);

create or replace function app_private.delivery_tracking_mutation_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'delivery_tracking_mutation_immutable';
end;
$$;

create trigger delivery_tracking_mutations_guard_immutable
  before update on public.delivery_tracking_mutations
  for each row execute function app_private.delivery_tracking_mutation_guard_v1();

create table public.storefront_delivery_tracking_feed (
  order_id uuid primary key references public.customer_orders(id) on delete cascade,
  shop_id uuid not null,
  order_status text not null,
  order_status_version bigint not null,
  fulfillment_mode text not null,
  tracking_mode text not null,
  tracking_session_id uuid,
  tracking_state text not null,
  courier_public_label text,
  vehicle_kind text,
  latitude double precision,
  longitude double precision,
  horizontal_accuracy_meters double precision,
  bearing_degrees double precision,
  speed_meters_per_second double precision,
  observed_at timestamptz,
  received_at timestamptz,
  freshness text not null,
  eta_starts_at timestamptz,
  eta_ends_at timestamptz,
  destination_latitude double precision,
  destination_longitude double precision,
  store_latitude double precision,
  store_longitude double precision,
  external_carrier text,
  external_tracking_code_masked text,
  external_tracking_url text,
  contact_capability text not null default 'none',
  server_time timestamptz not null default statement_timestamp(),
  version bigint not null default 1,
  constraint storefront_delivery_tracking_feed_order_shop_fkey foreign key (
    shop_id, order_id
  ) references public.customer_orders(shop_id, id) on delete cascade,
  constraint storefront_delivery_tracking_feed_mode_check check (
    tracking_mode in ('status_only', 'external_carrier', 'live_courier')
  ),
  constraint storefront_delivery_tracking_feed_state_check check (
    tracking_state in (
      'unavailable', 'awaiting_assignment', 'assigned', 'active', 'paused',
      'completed', 'cancelled'
    )
  ),
  constraint storefront_delivery_tracking_feed_freshness_check check (
    freshness in ('unavailable', 'fresh', 'stale', 'ended')
  ),
  constraint storefront_delivery_tracking_feed_live_shape_check check (
    (latitude is null and longitude is null and observed_at is null
      and received_at is null)
    or (tracking_mode = 'live_courier'
      and latitude between -90 and 90 and longitude between -180 and 180
      and observed_at is not null and received_at is not null)
  ),
  constraint storefront_delivery_tracking_feed_version_check check (
    order_status_version >= 1 and version >= 1
  )
);

create index storefront_delivery_tracking_feed_shop_state_idx
  on public.storefront_delivery_tracking_feed(
    shop_id, tracking_state, server_time desc, order_id
  );

alter table public.delivery_tracking_sessions enable row level security;
alter table public.delivery_tracking_sessions force row level security;
alter table public.delivery_courier_assignments enable row level security;
alter table public.delivery_courier_assignments force row level security;
alter table public.delivery_courier_latest_locations enable row level security;
alter table public.delivery_courier_latest_locations force row level security;
alter table public.delivery_tracking_lifecycle_events enable row level security;
alter table public.delivery_tracking_lifecycle_events force row level security;
alter table public.delivery_tracking_mutations enable row level security;
alter table public.delivery_tracking_mutations force row level security;
alter table public.storefront_delivery_tracking_feed enable row level security;
alter table public.storefront_delivery_tracking_feed force row level security;

revoke all on table public.delivery_tracking_sessions
  from public, anon, authenticated;
revoke all on table public.delivery_courier_assignments
  from public, anon, authenticated;
revoke all on table public.delivery_courier_latest_locations
  from public, anon, authenticated;
revoke all on table public.delivery_tracking_lifecycle_events
  from public, anon, authenticated;
revoke all on table public.delivery_tracking_mutations
  from public, anon, authenticated;
revoke all on table public.storefront_delivery_tracking_feed
  from public, anon, authenticated;

grant select, insert, update, delete on table public.delivery_tracking_sessions
  to service_role;
grant select, insert, update, delete on table public.delivery_courier_assignments
  to service_role;
grant select, insert, update, delete on table public.delivery_courier_latest_locations
  to service_role;
grant select, insert, update, delete on table public.delivery_tracking_lifecycle_events
  to service_role;
grant select, insert, delete on table public.delivery_tracking_mutations
  to service_role;
grant select, insert, update, delete on table public.storefront_delivery_tracking_feed
  to service_role;
grant select on table public.storefront_delivery_tracking_feed to authenticated;

create or replace function app_private.delivery_tracking_order_owned_v1(
  p_order_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.role() = 'authenticated'
    and auth.uid() is not null
    and exists (
      select 1
      from public.customer_orders customer_order
      where customer_order.id = p_order_id
        and customer_order.shop_id = p_shop_id
        and customer_order.user_id = auth.uid()
    );
$$;

revoke all on function app_private.delivery_tracking_order_owned_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.delivery_tracking_order_owned_v1(uuid, uuid)
  to authenticated;

create policy storefront_delivery_tracking_feed_owner_select
on public.storefront_delivery_tracking_feed
for select
to authenticated
using (
  app_private.delivery_tracking_order_owned_v1(order_id, shop_id)
);

do $publication$
begin
  if exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'storefront_delivery_tracking_feed'
  ) then
    alter publication supabase_realtime
      add table public.storefront_delivery_tracking_feed;
  end if;
end;
$publication$;

create or replace function app_private.delivery_tracking_distance_meters_v1(
  p_latitude_a double precision,
  p_longitude_a double precision,
  p_latitude_b double precision,
  p_longitude_b double precision
)
returns double precision
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(p_latitude_b - p_latitude_a) / 2), 2)
    + cos(radians(p_latitude_a)) * cos(radians(p_latitude_b))
      * power(sin(radians(p_longitude_b - p_longitude_a) / 2), 2)
  ));
$$;

create or replace function app_private.delivery_tracking_admin_personal_allowed_v1(
  p_shop_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission in (
      'orders.delivery.view', 'orders.delivery.manage'
    )
    and exists (
      select 1
      from public.shop_members member
      join public.shops shop on shop.shop_id = member.shop_id
      where member.shop_id = p_shop_id
        and member.profile_id = auth.uid()
        and member.membership_status = 'active'
        and member.role_key in ('shop_owner', 'shop_manager')
        and shop.shop_status = 'active'
    );
$$;

create or replace function app_private.delivery_tracking_courier_lease_is_valid_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_session public.staff_web_sessions%rowtype;
  v_publish_deadline timestamptz;
begin
  if auth.role() <> 'service_role'
    or p_shop_id is null
    or p_staff_id is null
    or p_staff_web_session_id is null
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1 then
    return false;
  end if;

  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return false; end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id and staff.shop_id = p_shop_id
  for share;
  if not found
    or v_staff.status <> 'active'
    or v_staff.role_key <> 'courier'
    or v_staff.credential_status <> 'active'
    or v_staff.credential_version <> p_expected_credential_version
    or v_staff.must_change_credential
    or v_staff.web_access_revoked_at is not null
    or (v_staff.locked_until is not null
      and v_staff.locked_until > clock_timestamp())
    or (v_staff.credential_expires_at is not null
      and v_staff.credential_expires_at <= clock_timestamp()) then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff-web-session:' || p_staff_web_session_id::text, 0)
  );
  select session.* into v_session
  from public.staff_web_sessions session
  where session.staff_web_session_id = p_staff_web_session_id
    and session.shop_id = p_shop_id
    and session.staff_id = p_staff_id
  for update;
  if not found
    or v_session.session_token_hash <> p_session_token_hash
    or v_session.staff_credential_version <> p_expected_credential_version
    or v_session.status <> 'active'
    or v_session.expires_at <= clock_timestamp()
    or (v_staff.session_invalidated_at is not null
      and v_staff.session_invalidated_at > v_session.issued_at) then
    return false;
  end if;

  perform 1
  from public.staff_role_permissions permission
  where permission.shop_id = p_shop_id
    and permission.role_key = 'courier'
    and permission.permission_key = 'orders.delivery.track'
    and permission.enabled
  for share;
  if not found then return false; end if;

  v_publish_deadline := least(
    v_session.expires_at,
    coalesce(v_staff.credential_expires_at, 'infinity'::timestamptz)
  );
  perform set_config(
    'app.staff_web_publish_deadline', v_publish_deadline::text, true
  );
  update public.staff_web_sessions
  set last_seen_at = now(), updated_at = now()
  where staff_web_session_id = p_staff_web_session_id;
  return true;
end;
$$;

-- Extend the existing staff-web session lease to resolve courier-only and POS
-- Admin sessions. Courier writes still use the narrower dedicated helper above.
create or replace function app_private.staff_web_runtime_lease_is_valid_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer,
  p_required_permission text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_session public.staff_web_sessions%rowtype;
  v_publish_deadline timestamptz;
begin
  if p_shop_id is null
    or p_staff_id is null
    or p_staff_web_session_id is null
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1
    or (p_required_permission is not null
      and p_required_permission !~ '^[a-z][a-z0-9_.]{1,63}$') then
    return false;
  end if;

  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then return false; end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id and staff.shop_id = p_shop_id
  for share;
  if not found
    or v_staff.status <> 'active'
    or v_staff.role_key not in ('manager', 'pos_admin', 'courier')
    or v_staff.credential_status <> 'active'
    or v_staff.credential_version <> p_expected_credential_version
    or v_staff.must_change_credential
    or v_staff.web_access_revoked_at is not null
    or (v_staff.locked_until is not null
      and v_staff.locked_until > clock_timestamp())
    or (v_staff.credential_expires_at is not null
      and v_staff.credential_expires_at <= clock_timestamp()) then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff-web-session:' || p_staff_web_session_id::text, 0)
  );
  select session.* into v_session
  from public.staff_web_sessions session
  where session.staff_web_session_id = p_staff_web_session_id
    and session.shop_id = p_shop_id and session.staff_id = p_staff_id
  for update;
  if not found
    or v_session.session_token_hash <> p_session_token_hash
    or v_session.staff_credential_version <> p_expected_credential_version
    or v_session.status <> 'active'
    or v_session.expires_at <= clock_timestamp()
    or (v_staff.session_invalidated_at is not null
      and v_staff.session_invalidated_at > v_session.issued_at) then
    return false;
  end if;

  v_publish_deadline := least(
    v_session.expires_at,
    coalesce(v_staff.credential_expires_at, 'infinity'::timestamptz)
  );
  perform set_config(
    'app.staff_web_publish_deadline', v_publish_deadline::text, true
  );

  if p_required_permission is null then
    perform 1
    from public.staff_role_permissions permission
    where permission.shop_id = p_shop_id
      and permission.role_key = v_staff.role_key
      and permission.enabled
      and permission.permission_key in (
        'shop_admin.full_access', 'catalog.read', 'catalog.write',
        'catalog.import', 'catalog.export', 'staff.read', 'staff.write',
        'devices.read', 'devices.write', 'audit.read', 'settings.read',
        'settings.write', 'pos.dashboard.read', 'sync.read', 'sync.write',
        'history.write', 'storefront.view', 'storefront.edit',
        'storefront.publish', 'storefront.bulk_publish',
        'storefront.promotions.manage', 'storefront.images.manage',
        'storefront.settings.manage', 'storefront.audit.view',
        'orders.view', 'orders.manage', 'orders.delivery.view',
        'orders.delivery.manage', 'orders.delivery.track'
      )
    limit 1
    for share;
  else
    perform 1
    from public.staff_role_permissions permission
    where permission.shop_id = p_shop_id
      and permission.role_key = v_staff.role_key
      and permission.enabled
      and permission.permission_key in (
        'shop_admin.full_access', p_required_permission
      )
    limit 1
    for share;
  end if;
  if not found then return false; end if;

  update public.staff_web_sessions
  set last_seen_at = now(), updated_at = now()
  where staff_web_session_id = p_staff_web_session_id;
  return true;
end;
$$;

revoke all on function app_private.staff_web_runtime_lease_is_valid_v1(
  uuid, uuid, uuid, text, integer, text
) from public, anon, authenticated, service_role;

create or replace function public.staff_web_login_commit_v1(
  p_shop_id uuid,
  p_staff_id uuid,
  p_expected_credential_version integer,
  p_attempt_key_hash text,
  p_session_token_hash text,
  p_expires_at timestamptz,
  p_metadata_redacted jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_accounts%rowtype;
  v_attempt public.staff_web_login_attempts%rowtype;
  v_session_id uuid;
begin
  if p_attempt_key_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    or coalesce(p_expected_credential_version, 0) < 1
    or p_expires_at <= now()
    or p_expires_at > now() + interval '12 hours 5 minutes'
    or jsonb_typeof(coalesce(p_metadata_redacted, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata_redacted, '{}'::jsonb)) > 4096 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('staff-web-attempt:' || p_attempt_key_hash, 0)
  );
  perform 1 from public.shops shop
  where shop.shop_id = p_shop_id and shop.shop_status = 'active'
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select staff.* into v_staff
  from public.staff_accounts staff
  where staff.staff_id = p_staff_id and staff.shop_id = p_shop_id
  for update;
  if not found
    or v_staff.status <> 'active'
    or v_staff.role_key not in ('manager', 'pos_admin', 'courier')
    or v_staff.credential_status <> 'active'
    or v_staff.credential_version <> p_expected_credential_version
    or v_staff.must_change_credential
    or v_staff.web_access_revoked_at is not null
    or (v_staff.locked_until is not null and v_staff.locked_until > now())
    or (v_staff.credential_expires_at is not null
      and v_staff.credential_expires_at <= now())
    or not exists (
      select 1
      from public.staff_role_permissions permission
      where permission.shop_id = p_shop_id
        and permission.role_key = v_staff.role_key
        and permission.enabled
        and permission.permission_key in (
          'shop_admin.full_access', 'catalog.read', 'catalog.write',
          'catalog.import', 'catalog.export', 'staff.read', 'staff.write',
          'devices.read', 'devices.write', 'audit.read', 'settings.read',
          'settings.write', 'pos.dashboard.read', 'sync.read', 'sync.write',
          'history.write', 'storefront.view', 'storefront.edit',
          'storefront.publish', 'storefront.bulk_publish',
          'storefront.promotions.manage', 'storefront.images.manage',
          'storefront.settings.manage', 'storefront.audit.view',
          'orders.view', 'orders.manage', 'orders.delivery.view',
          'orders.delivery.manage', 'orders.delivery.track'
        )
    ) then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
  end if;

  select attempt.* into v_attempt
  from public.staff_web_login_attempts attempt
  where attempt.attempt_key_hash = p_attempt_key_hash
  for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object('ok', false, 'code', 'locked');
  end if;

  insert into public.staff_web_login_attempts (
    attempt_key_hash, failed_attempts, locked_until, last_success_at,
    metadata_redacted, updated_at
  ) values (
    p_attempt_key_hash, 0, null, now(),
    coalesce(p_metadata_redacted, '{}'::jsonb), now()
  )
  on conflict (attempt_key_hash) do update
  set failed_attempts = 0,
      locked_until = null,
      last_success_at = now(),
      metadata_redacted = excluded.metadata_redacted,
      updated_at = now();

  update public.staff_accounts
  set credential_status = 'active', failed_attempts = 0,
      locked_until = null, last_login_at = now(), updated_at = now()
  where staff_id = p_staff_id and shop_id = p_shop_id;

  insert into public.staff_web_sessions (
    shop_id, staff_id, session_token_hash, staff_credential_version,
    status, expires_at, last_seen_at, metadata_redacted
  ) values (
    p_shop_id, p_staff_id, p_session_token_hash,
    p_expected_credential_version, 'active', p_expires_at, now(),
    coalesce(p_metadata_redacted, '{}'::jsonb)
  ) returning staff_web_session_id into v_session_id;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    null, p_staff_id, 'shop', p_shop_id, 'staff.web.login.success',
    'info', 'success', 'staff', p_staff_id::text,
    coalesce(p_metadata_redacted, '{}'::jsonb)
      || jsonb_build_object('code', 'success', 'source', 'TASK-044')
  );

  return jsonb_build_object(
    'ok', true, 'code', 'success',
    'attemptKeyHash', p_attempt_key_hash,
    'shopId', p_shop_id,
    'staffId', p_staff_id,
    'credentialVersion', p_expected_credential_version,
    'staffWebSessionId', v_session_id,
    'expiresAt', p_expires_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'stale_identity');
end;
$$;

revoke all on function public.staff_web_login_commit_v1(
  uuid, uuid, integer, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_web_login_commit_v1(
  uuid, uuid, integer, text, text, timestamptz, jsonb
) to service_role;

create or replace function public.shop_staff_create(
  p_shop_id uuid,
  p_staff_code text,
  p_display_name text,
  p_role_key text,
  p_credential_kind text,
  p_credential_hash text,
  p_credential_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_staff_code text := upper(btrim(coalesce(p_staff_code, '')));
  v_display_name text := app_private.normalize_admin_label(p_display_name);
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_credential_kind text := btrim(coalesce(p_credential_kind, ''));
  v_credential_hash text := btrim(coalesce(p_credential_hash, ''));
  v_staff_id uuid;
  v_audit_event_id uuid;
begin
  if v_actor_id is null or (
    not app_private.is_active_shop_staff_admin_member(p_shop_id)
    and not app_private.is_platform_admin()
  ) then
    return app_private.shop_admin_action_result(
      false, 'unauthorized', p_shop_id
    );
  end if;

  if v_role_key in ('pos_admin', 'courier')
    and not app_private.is_active_shop_owner_member(p_shop_id)
    and not app_private.is_platform_admin() then
    v_audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'unauthorized', jsonb_build_object('role_key', v_role_key)
    );
    return app_private.shop_admin_action_result(
      false, 'unauthorized', p_shop_id, null, v_audit_event_id
    );
  end if;

  if v_staff_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
    or length(v_display_name) = 0
    or v_role_key not in ('cashier', 'manager', 'viewer', 'pos_admin', 'courier')
    or v_credential_kind not in ('pin', 'password')
    or length(v_credential_hash) = 0 then
    v_audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'validation_failed',
      jsonb_build_object('staff_code_length', length(v_staff_code))
    );
    return app_private.shop_admin_action_result(
      false, 'validation_failed', p_shop_id, null, v_audit_event_id
    );
  end if;

  insert into public.staff_accounts (
    shop_id, staff_code, display_name, role_key, status,
    credential_kind, credential_hash, credential_updated_at,
    credential_expires_at, must_change_credential, failed_attempts,
    locked_until, credential_version, credential_status,
    created_by_profile_id, updated_by_profile_id, updated_at
  ) values (
    p_shop_id, v_staff_code, v_display_name, v_role_key, 'active',
    v_credential_kind, v_credential_hash, now(), p_credential_expires_at,
    false, 0, null, 1, 'active', v_actor_id, v_actor_id, now()
  ) returning staff_id into v_staff_id;

  perform app_private.clear_staff_web_login_attempt_lockout(
    p_shop_id, v_staff_code
  );
  if v_role_key = 'courier' then
    insert into public.staff_role_permissions (
      shop_id, role_key, permission_key, enabled,
      updated_by_profile_id, updated_at
    ) values (
      p_shop_id, 'courier', 'orders.delivery.track', true,
      v_actor_id, now()
    )
    on conflict (shop_id, role_key, permission_key)
    do update set
      enabled = true,
      updated_by_profile_id = excluded.updated_by_profile_id,
      updated_at = excluded.updated_at;
  end if;
  v_audit_event_id := app_private.write_shop_admin_audit(
    p_shop_id, 'shop.staff.create.success', 'info', 'success',
    'staff', v_staff_id::text, 'success',
    jsonb_build_object(
      'role_key', v_role_key,
      'credential_kind', v_credential_kind,
      'credential_version', 1
    )
  );
  return app_private.shop_admin_action_result(
    true, 'success', p_shop_id, v_staff_id::text, v_audit_event_id
  );
exception
  when unique_violation then
    v_audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'warning', 'blocked',
      'staff', null, 'duplicate_staff_code', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(
      false, 'duplicate_staff_code', p_shop_id, null, v_audit_event_id
    );
  when others then
    v_audit_event_id := app_private.write_shop_admin_audit(
      p_shop_id, 'shop.staff.create.failure', 'critical', 'failure',
      'staff', null, 'db_failure', '{}'::jsonb
    );
    return app_private.shop_admin_action_result(
      false, 'db_failure', p_shop_id, null, v_audit_event_id
    );
end;
$$;

revoke all on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) from public, anon;
grant execute on function public.shop_staff_create(
  uuid, text, text, text, text, text, timestamptz
) to authenticated;

create or replace function app_private.delivery_tracking_admin_authorized_v1(
  p_shop_id uuid,
  p_permission text,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_permission not in (
    'orders.delivery.view', 'orders.delivery.manage', 'orders.delivery.track'
  ) then
    return false;
  end if;

  if auth.role() = 'authenticated' then
    if p_staff_id is not null
      or p_staff_web_session_id is not null
      or p_session_token_hash is not null
      or p_expected_credential_version is not null then
      return false;
    end if;
    return app_private.delivery_tracking_admin_personal_allowed_v1(
      p_shop_id, p_permission
    );
  end if;

  if auth.role() = 'service_role' then
    if p_permission = 'orders.delivery.track' then
      return app_private.delivery_tracking_courier_lease_is_valid_v1(
        p_shop_id, p_staff_id, p_staff_web_session_id,
        p_session_token_hash, p_expected_credential_version
      );
    end if;
    return app_private.staff_web_runtime_lease_is_valid_v1(
      p_shop_id,
      p_staff_id,
      p_staff_web_session_id,
      p_session_token_hash,
      p_expected_credential_version,
      p_permission
    );
  end if;

  return false;
end;
$$;

create or replace function app_private.delivery_tracking_event_v1(
  p_session_id uuid,
  p_event_type text,
  p_actor_kind text,
  p_actor_profile_id uuid default null,
  p_actor_staff_id uuid default null,
  p_metadata_redacted jsonb default '{}'::jsonb,
  p_at timestamptz default statement_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.delivery_tracking_sessions%rowtype;
  v_event_version bigint;
begin
  select session.* into strict v_session
  from public.delivery_tracking_sessions session
  where session.id = p_session_id;

  select coalesce(max(event.event_version), 0) + 1
  into v_event_version
  from public.delivery_tracking_lifecycle_events event
  where event.session_id = p_session_id;

  insert into public.delivery_tracking_lifecycle_events (
    session_id, shop_id, order_id, event_version, event_type, actor_kind,
    actor_profile_id, actor_staff_id, metadata_redacted, created_at
  ) values (
    v_session.id, v_session.shop_id, v_session.order_id, v_event_version,
    p_event_type, p_actor_kind, p_actor_profile_id, p_actor_staff_id,
    coalesce(p_metadata_redacted, '{}'::jsonb), p_at
  );
end;
$$;

create or replace function app_private.delivery_tracking_refresh_feed_v1(
  p_order_id uuid,
  p_at timestamptz default statement_timestamp()
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.customer_orders%rowtype;
  v_session public.delivery_tracking_sessions%rowtype;
  v_location public.delivery_courier_latest_locations%rowtype;
  v_freshness_seconds integer := 120;
  v_freshness text := 'unavailable';
  v_terminal boolean := false;
begin
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.id = p_order_id;
  if not found then
    delete from public.storefront_delivery_tracking_feed feed
    where feed.order_id = p_order_id;
    return;
  end if;

  select session.* into v_session
  from public.delivery_tracking_sessions session
  where session.order_id = p_order_id and session.ended_at is null
  order by session.created_at desc, session.id desc
  limit 1;

  if not found then
    select session.* into v_session
    from public.delivery_tracking_sessions session
    where session.order_id = p_order_id
    order by session.created_at desc, session.id desc
    limit 1;
  end if;

  if v_session.id is null then
    delete from public.storefront_delivery_tracking_feed feed
    where feed.order_id = p_order_id;
    return;
  end if;

  select settings.delivery_tracking_freshness_seconds
  into v_freshness_seconds
  from public.storefront_settings settings
  where settings.shop_id = v_order.shop_id;
  v_freshness_seconds := coalesce(v_freshness_seconds, 120);
  v_terminal := v_order.status in ('completed', 'cancelled', 'rejected')
    or v_session.ended_at is not null;

  if not v_terminal and v_session.tracking_mode = 'live_courier' then
    select location.* into v_location
    from public.delivery_courier_latest_locations location
    where location.session_id = v_session.id
      and location.expires_at > p_at;
  end if;

  v_freshness := case
    when v_terminal then 'ended'
    when v_location.session_id is null then 'unavailable'
    when v_location.received_at >= p_at
      - make_interval(secs => v_freshness_seconds) then 'fresh'
    else 'stale'
  end;

  insert into public.storefront_delivery_tracking_feed (
    order_id, shop_id, order_status, order_status_version,
    fulfillment_mode, tracking_mode, tracking_session_id, tracking_state,
    courier_public_label, vehicle_kind, latitude, longitude,
    horizontal_accuracy_meters, bearing_degrees, speed_meters_per_second,
    observed_at, received_at, freshness, eta_starts_at, eta_ends_at,
    destination_latitude, destination_longitude, store_latitude,
    store_longitude, external_carrier, external_tracking_code_masked,
    external_tracking_url, contact_capability, server_time, version
  ) values (
    v_order.id, v_order.shop_id, v_order.status, v_order.status_version,
    v_order.fulfillment_mode, v_session.tracking_mode,
    v_session.public_tracking_session_id,
    case when v_terminal then
      case when v_order.status = 'completed' then 'completed' else 'cancelled' end
    else v_session.tracking_state end,
    case when v_terminal then null else v_session.courier_public_label end,
    case when v_terminal then null else v_session.vehicle_kind end,
    case when v_terminal then null else v_location.latitude end,
    case when v_terminal then null else v_location.longitude end,
    case when v_terminal then null else v_location.horizontal_accuracy_meters end,
    case when v_terminal then null else v_location.bearing_degrees end,
    case when v_terminal then null else v_location.speed_meters_per_second end,
    case when v_terminal then null else v_location.observed_at end,
    case when v_terminal then null else v_location.received_at end,
    v_freshness, v_session.eta_starts_at, v_session.eta_ends_at,
    case when v_terminal then null else v_session.destination_latitude end,
    case when v_terminal then null else v_session.destination_longitude end,
    case when v_terminal then null else v_session.store_latitude end,
    case when v_terminal then null else v_session.store_longitude end,
    case when v_terminal then null else v_session.external_carrier end,
    case when v_terminal then null else v_session.external_tracking_code_masked end,
    case when v_terminal then null else v_session.external_tracking_url end,
    case when v_terminal then 'none' else v_session.contact_capability end,
    p_at, 1
  )
  on conflict (order_id) do update set
    shop_id = excluded.shop_id,
    order_status = excluded.order_status,
    order_status_version = excluded.order_status_version,
    fulfillment_mode = excluded.fulfillment_mode,
    tracking_mode = excluded.tracking_mode,
    tracking_session_id = excluded.tracking_session_id,
    tracking_state = excluded.tracking_state,
    courier_public_label = excluded.courier_public_label,
    vehicle_kind = excluded.vehicle_kind,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    horizontal_accuracy_meters = excluded.horizontal_accuracy_meters,
    bearing_degrees = excluded.bearing_degrees,
    speed_meters_per_second = excluded.speed_meters_per_second,
    observed_at = excluded.observed_at,
    received_at = excluded.received_at,
    freshness = excluded.freshness,
    eta_starts_at = excluded.eta_starts_at,
    eta_ends_at = excluded.eta_ends_at,
    destination_latitude = excluded.destination_latitude,
    destination_longitude = excluded.destination_longitude,
    store_latitude = excluded.store_latitude,
    store_longitude = excluded.store_longitude,
    external_carrier = excluded.external_carrier,
    external_tracking_code_masked = excluded.external_tracking_code_masked,
    external_tracking_url = excluded.external_tracking_url,
    contact_capability = excluded.contact_capability,
    server_time = excluded.server_time,
    version = public.storefront_delivery_tracking_feed.version + 1;
end;
$$;

create or replace function app_private.delivery_tracking_order_terminal_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if new.status in ('completed', 'cancelled', 'rejected')
    and (old.status is distinct from new.status) then
    for v_session_id in
      update public.delivery_tracking_sessions session
      set tracking_state = case when new.status = 'completed'
            then 'completed' else 'cancelled' end,
          ended_at = coalesce(session.ended_at, statement_timestamp()),
          courier_public_label = null,
          vehicle_kind = null,
          store_latitude = null,
          store_longitude = null,
          destination_latitude = null,
          destination_longitude = null,
          version = session.version + 1,
          updated_at = statement_timestamp()
      where session.order_id = new.id and session.ended_at is null
      returning session.id
    loop
      delete from public.delivery_courier_latest_locations location
      where location.session_id = v_session_id;
      update public.delivery_courier_assignments assignment
      set revoked_at = coalesce(assignment.revoked_at, statement_timestamp())
      where assignment.session_id = v_session_id
        and assignment.revoked_at is null;
      perform app_private.delivery_tracking_event_v1(
        v_session_id,
        case when new.status = 'completed' then 'completed' else 'cancelled' end,
        'system', null, null,
        jsonb_build_object('orderStatusVersion', new.status_version),
        statement_timestamp()
      );
    end loop;
  end if;

  perform app_private.delivery_tracking_refresh_feed_v1(
    new.id, statement_timestamp()
  );
  return new;
end;
$$;

create trigger delivery_tracking_customer_order_status_refresh
after update of status, status_version on public.customer_orders
for each row execute function app_private.delivery_tracking_order_terminal_v1();

create or replace function public.storefront_order_tracking_v1(
  p_shop_slug text,
  p_order_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_order public.customer_orders%rowtype;
  v_feed public.storefront_delivery_tracking_feed%rowtype;
begin
  if auth.role() <> 'authenticated'
    or auth.uid() is null
    or p_order_id is null
    or p_shop_slug is null
    or p_shop_slug <> lower(btrim(p_shop_slug))
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select customer_order.* into v_order
  from public.customer_orders customer_order
  join public.storefront_settings settings
    on settings.shop_id = customer_order.shop_id
  where customer_order.id = p_order_id
    and customer_order.user_id = auth.uid()
    and settings.public_slug = p_shop_slug
    and settings.storefront_enabled;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform app_private.delivery_tracking_refresh_feed_v1(p_order_id, v_now);
  select feed.* into v_feed
  from public.storefront_delivery_tracking_feed feed
  where feed.order_id = p_order_id;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'snapshot', jsonb_build_object(
        'apiVersion', 'delivery-tracking-snapshot.v1',
        'orderId', v_order.id,
        'orderStatus', v_order.status,
        'orderStatusVersion', v_order.status_version,
        'fulfillmentMode', v_order.fulfillment_mode,
        'trackingMode', 'statusOnly',
        'trackingState', 'unavailable',
        'freshness', 'unavailable',
        'contactCapability', 'none',
        'serverTime', v_now,
        'version', 1
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'snapshot', jsonb_strip_nulls(jsonb_build_object(
      'apiVersion', 'delivery-tracking-snapshot.v1',
      'orderId', v_feed.order_id,
      'orderStatus', v_feed.order_status,
      'orderStatusVersion', v_feed.order_status_version,
      'fulfillmentMode', v_feed.fulfillment_mode,
      'trackingMode', case v_feed.tracking_mode
        when 'status_only' then 'statusOnly'
        when 'external_carrier' then 'externalCarrier'
        else 'liveCourier' end,
      'trackingSessionId', v_feed.tracking_session_id,
      'trackingState', v_feed.tracking_state,
      'courierPublicLabel', v_feed.courier_public_label,
      'vehicleKind', v_feed.vehicle_kind,
      'latitude', v_feed.latitude,
      'longitude', v_feed.longitude,
      'horizontalAccuracyMeters', v_feed.horizontal_accuracy_meters,
      'bearingDegrees', v_feed.bearing_degrees,
      'speedMetersPerSecond', v_feed.speed_meters_per_second,
      'observedAt', v_feed.observed_at,
      'receivedAt', v_feed.received_at,
      'freshness', v_feed.freshness,
      'etaStartsAt', v_feed.eta_starts_at,
      'etaEndsAt', v_feed.eta_ends_at,
      'destinationLatitude', v_feed.destination_latitude,
      'destinationLongitude', v_feed.destination_longitude,
      'storeLatitude', v_feed.store_latitude,
      'storeLongitude', v_feed.store_longitude,
      'externalCarrier', v_feed.external_carrier,
      'externalTrackingCodeMasked', v_feed.external_tracking_code_masked,
      'externalTrackingUrl', v_feed.external_tracking_url,
      'contactCapability', v_feed.contact_capability,
      'serverTime', v_now,
      'version', v_feed.version
    ))
  );
end;
$$;

create or replace function public.admin_delivery_tracking_read_v1(
  p_shop_id uuid,
  p_operation text default 'queue',
  p_request jsonb default '{}'::jsonb,
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
  v_can_view boolean := false;
  v_can_track boolean := false;
  v_order_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_couriers jsonb := '[]'::jsonb;
begin
  if p_shop_id is null
    or p_operation not in ('queue', 'detail')
    or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_request) > 8192 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  v_can_view := app_private.delivery_tracking_admin_authorized_v1(
    p_shop_id, 'orders.delivery.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  );
  v_can_track := app_private.delivery_tracking_admin_authorized_v1(
    p_shop_id, 'orders.delivery.track', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  );
  if not v_can_view and not v_can_track then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  v_order_id := nullif(p_request->>'orderId', '')::uuid;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'orderId', customer_order.id,
    'orderCode', customer_order.public_order_code,
    'orderStatus', customer_order.status,
    'orderStatusVersion', customer_order.status_version,
    'fulfillmentMode', customer_order.fulfillment_mode,
    'placedAt', customer_order.placed_at,
    'trackingSessionId', session.public_tracking_session_id,
    'trackingMode', case session.tracking_mode
      when 'status_only' then 'statusOnly'
      when 'external_carrier' then 'externalCarrier'
      when 'live_courier' then 'liveCourier' end,
    'trackingState', session.tracking_state,
    'courierPublicLabel', session.courier_public_label,
    'etaStartsAt', session.eta_starts_at,
    'etaEndsAt', session.eta_ends_at,
    'assignedCourierStaffId', assignment.courier_staff_id,
    'assignedCourierCode', courier.staff_code,
    'lastObservedAt', location.observed_at,
    'locationFreshness', case
      when location.session_id is null then 'unavailable'
      when location.received_at >= statement_timestamp()
        - make_interval(secs => settings.delivery_tracking_freshness_seconds)
        then 'fresh' else 'stale' end,
    'destinationSummary', case when
      v_can_view or assignment.courier_staff_id = p_staff_id
      then jsonb_strip_nulls(jsonb_build_object(
        'addressLine1', customer_order.fulfillment_snapshot#>>'{address,addressLine1}',
        'addressLine2', customer_order.fulfillment_snapshot#>>'{address,addressLine2}',
        'commune', customer_order.fulfillment_snapshot#>>'{address,commune}',
        'region', customer_order.fulfillment_snapshot#>>'{address,region}'
      )) end
  )) order by customer_order.placed_at desc, customer_order.id desc), '[]'::jsonb)
  into v_rows
  from public.customer_orders customer_order
  join public.storefront_settings settings on settings.shop_id = customer_order.shop_id
  left join public.delivery_tracking_sessions session
    on session.order_id = customer_order.id and session.ended_at is null
  left join public.delivery_courier_assignments assignment
    on assignment.session_id = session.id and assignment.revoked_at is null
  left join public.staff_accounts courier
    on courier.staff_id = assignment.courier_staff_id
  left join public.delivery_courier_latest_locations location
    on location.session_id = session.id
  where customer_order.shop_id = p_shop_id
    and customer_order.fulfillment_mode = 'delivery'
    and (v_order_id is null or customer_order.id = v_order_id)
    and (
      v_can_view
      or (v_can_track and assignment.courier_staff_id = p_staff_id)
    )
    and (
      p_operation = 'detail'
      or customer_order.status in (
        'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery'
      )
    );

  if v_can_view then
    select coalesce(jsonb_agg(jsonb_build_object(
      'staffId', staff.staff_id,
      'staffCode', staff.staff_code,
      'displayLabel', left(staff.staff_code, 40)
    ) order by staff.staff_code), '[]'::jsonb)
    into v_couriers
    from public.staff_accounts staff
    where staff.shop_id = p_shop_id
      and staff.status = 'active'
      and staff.role_key = 'courier'
      and exists (
        select 1
        from public.staff_role_permissions permission
        where permission.shop_id = p_shop_id
          and permission.role_key = staff.role_key
          and permission.permission_key = 'orders.delivery.track'
          and permission.enabled
      );
  end if;

  if not app_private.delivery_tracking_admin_authorized_v1(
    p_shop_id,
    case when v_can_view then 'orders.delivery.view' else 'orders.delivery.track' end,
    p_staff_id, p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version
  ) then
    raise exception 'delivery tracking authorization expired'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shopId', p_shop_id,
    'trackingEnabled', coalesce((
      select settings.delivery_tracking_enabled
      from public.storefront_settings settings
      where settings.shop_id = p_shop_id
    ), false),
    'rows', v_rows,
    'couriers', v_couriers,
    'serverTime', statement_timestamp()
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  when insufficient_privilege then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
end;
$$;

create or replace function public.admin_delivery_tracking_manage_v1(
  p_shop_id uuid,
  p_order_id uuid,
  p_operation text,
  p_request jsonb,
  p_idempotency_key uuid,
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
  v_now timestamptz := statement_timestamp();
  v_order public.customer_orders%rowtype;
  v_session public.delivery_tracking_sessions%rowtype;
  v_previous public.delivery_tracking_mutations%rowtype;
  v_assignment public.delivery_courier_assignments%rowtype;
  v_mode text;
  v_state text;
  v_request_hash text;
  v_result jsonb;
  v_actor_profile_id uuid;
  v_actor_staff_id uuid;
  v_courier_staff_id uuid;
  v_assignment_version bigint;
  v_eta_starts_at timestamptz;
  v_eta_ends_at timestamptz;
  v_store_lat double precision;
  v_store_lng double precision;
  v_destination_lat double precision;
  v_destination_lng double precision;
begin
  if p_shop_id is null or p_order_id is null or p_idempotency_key is null
    or p_operation not in (
      'configure_status', 'configure_external', 'configure_live', 'assign',
      'start', 'terminate'
    )
    or jsonb_typeof(coalesce(p_request, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_request) > 16384 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.delivery_tracking_admin_authorized_v1(
    p_shop_id, 'orders.delivery.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if auth.role() = 'authenticated' then
    v_actor_profile_id := auth.uid();
  else
    v_actor_staff_id := p_staff_id;
  end if;

  v_request_hash := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'admin_delivery_tracking_manage_v1', p_shop_id, p_order_id,
      p_operation, p_request, v_actor_profile_id, v_actor_staff_id
    )::text, 'UTF8'), 'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'delivery-tracking-mutation:' || p_shop_id::text || ':'
      || p_idempotency_key::text, 0
  ));
  select mutation.* into v_previous
  from public.delivery_tracking_mutations mutation
  where mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_previous.request_sha256 <> v_request_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'delivery-tracking-order:' || p_shop_id::text || ':' || p_order_id::text, 0
  ));
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.shop_id = p_shop_id
    and customer_order.id = p_order_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_order.fulfillment_mode <> 'delivery'
    or v_order.status in ('completed', 'cancelled', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;

  select session.* into v_session
  from public.delivery_tracking_sessions session
  where session.order_id = p_order_id and session.ended_at is null
  for update;

  if p_operation in ('start', 'terminate') then
    if v_session.id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_state');
    end if;

    if p_operation = 'start' then
      if v_session.tracking_mode <> 'live_courier'
        or v_session.tracking_state not in ('assigned', 'paused')
        or v_order.status <> 'out_for_delivery'
        or not exists (
          select 1
          from public.delivery_courier_assignments assignment
          where assignment.session_id = v_session.id
            and assignment.revoked_at is null
        ) then
        return jsonb_build_object('ok', false, 'code', 'invalid_state');
      end if;
      update public.delivery_tracking_sessions session
      set tracking_state = 'active',
          started_at = coalesce(session.started_at, v_now),
          version = session.version + 1,
          updated_at = v_now
      where session.id = v_session.id
      returning * into v_session;
      perform app_private.delivery_tracking_event_v1(
        v_session.id, 'started',
        case when v_actor_profile_id is not null
          then 'personal_account' else 'admin_staff' end,
        v_actor_profile_id, v_actor_staff_id,
        jsonb_build_object('source', 'admin'), v_now
      );
    else
      update public.delivery_courier_assignments assignment
      set revoked_at = coalesce(assignment.revoked_at, v_now)
      where assignment.session_id = v_session.id
        and assignment.revoked_at is null;
      delete from public.delivery_courier_latest_locations location
      where location.session_id = v_session.id;
      update public.delivery_tracking_sessions session
      set tracking_state = 'cancelled', ended_at = v_now,
          version = session.version + 1, updated_at = v_now
      where session.id = v_session.id
      returning * into v_session;
      perform app_private.delivery_tracking_event_v1(
        v_session.id, 'terminated',
        case when v_actor_profile_id is not null
          then 'personal_account' else 'admin_staff' end,
        v_actor_profile_id, v_actor_staff_id,
        jsonb_build_object('source', 'admin'), v_now
      );
    end if;
  elsif p_operation = 'assign' then
    v_courier_staff_id := nullif(p_request->>'courierStaffId', '')::uuid;
    if v_session.id is null
      or v_session.tracking_mode <> 'live_courier'
      or v_courier_staff_id is null
      or not exists (
        select 1
        from public.staff_accounts staff
        join public.staff_role_permissions permission
          on permission.shop_id = staff.shop_id
          and permission.role_key = staff.role_key
          and permission.permission_key = 'orders.delivery.track'
          and permission.enabled
        where staff.staff_id = v_courier_staff_id
          and staff.shop_id = p_shop_id
          and staff.status = 'active'
          and staff.role_key = 'courier'
      ) then
      return jsonb_build_object('ok', false, 'code', 'validation_failed');
    end if;

    select assignment.* into v_assignment
    from public.delivery_courier_assignments assignment
    where assignment.session_id = v_session.id
      and assignment.revoked_at is null
    for update;
    if v_assignment.courier_staff_id is not null
      and v_assignment.courier_staff_id <> v_courier_staff_id then
      update public.delivery_courier_assignments assignment
      set revoked_at = v_now
      where assignment.id = v_assignment.id;
      delete from public.delivery_courier_latest_locations location
      where location.session_id = v_session.id;
    elsif v_assignment.courier_staff_id = v_courier_staff_id then
      v_result := jsonb_build_object(
        'ok', true, 'code', 'success', 'operation', 'assign',
        'orderId', p_order_id, 'trackingSessionId',
        v_session.public_tracking_session_id, 'trackingState',
        v_session.tracking_state, 'idempotent', false
      );
      insert into public.delivery_tracking_mutations (
        shop_id, session_id, order_id, idempotency_key, operation,
        request_sha256, actor_profile_id, actor_staff_id, response_payload
      ) values (
        p_shop_id, v_session.id, p_order_id, p_idempotency_key, p_operation,
        v_request_hash, v_actor_profile_id, v_actor_staff_id, v_result
      );
      return v_result;
    end if;

    select coalesce(max(assignment.assignment_version), 0) + 1
    into v_assignment_version
    from public.delivery_courier_assignments assignment
    where assignment.session_id = v_session.id;
    insert into public.delivery_courier_assignments (
      session_id, shop_id, order_id, courier_staff_id, assignment_version,
      assigned_at, created_by_profile_id, created_by_staff_id
    ) values (
      v_session.id, p_shop_id, p_order_id, v_courier_staff_id,
      v_assignment_version, v_now, v_actor_profile_id, v_actor_staff_id
    );
    update public.delivery_tracking_sessions session
    set tracking_state = 'assigned', version = session.version + 1,
        updated_at = v_now
    where session.id = v_session.id;
    perform app_private.delivery_tracking_event_v1(
      v_session.id,
      case when v_assignment.id is null then 'assigned' else 'reassigned' end,
      case when v_actor_profile_id is not null
        then 'personal_account' else 'admin_staff' end,
      v_actor_profile_id, v_actor_staff_id,
      jsonb_build_object('assignmentVersion', v_assignment_version), v_now
    );
  else
    v_mode := case p_operation
      when 'configure_status' then 'status_only'
      when 'configure_external' then 'external_carrier'
      else 'live_courier' end;
    v_state := case v_mode
      when 'live_courier' then 'awaiting_assignment'
      else 'active' end;
    v_eta_starts_at := nullif(p_request->>'etaStartsAt', '')::timestamptz;
    v_eta_ends_at := nullif(p_request->>'etaEndsAt', '')::timestamptz;
    v_store_lat := nullif(p_request->>'storeLatitude', '')::double precision;
    v_store_lng := nullif(p_request->>'storeLongitude', '')::double precision;
    v_destination_lat := nullif(
      p_request->>'destinationLatitude', ''
    )::double precision;
    v_destination_lng := nullif(
      p_request->>'destinationLongitude', ''
    )::double precision;

    if ((v_eta_starts_at is null) <> (v_eta_ends_at is null))
      or ((v_store_lat is null) <> (v_store_lng is null))
      or ((v_destination_lat is null) <> (v_destination_lng is null))
      or (v_mode = 'live_courier' and not coalesce((
        select settings.delivery_tracking_enabled
        from public.storefront_settings settings
        where settings.shop_id = p_shop_id
      ), false)) then
      return jsonb_build_object('ok', false, 'code',
        case when v_mode = 'live_courier' then 'feature_disabled'
          else 'validation_failed' end);
    end if;

    if v_session.id is not null and v_session.tracking_mode <> v_mode then
      update public.delivery_courier_assignments assignment
      set revoked_at = coalesce(assignment.revoked_at, v_now)
      where assignment.session_id = v_session.id
        and assignment.revoked_at is null;
      delete from public.delivery_courier_latest_locations location
      where location.session_id = v_session.id;
    end if;

    if v_session.id is null then
      insert into public.delivery_tracking_sessions (
        shop_id, order_id, tracking_mode, tracking_state,
        courier_public_label, vehicle_kind, eta_starts_at, eta_ends_at,
        store_latitude, store_longitude, destination_latitude,
        destination_longitude, external_carrier,
        external_tracking_code_masked, external_tracking_url,
        contact_capability, created_at, updated_at
      ) values (
        p_shop_id, p_order_id, v_mode, v_state,
        nullif(btrim(p_request->>'courierPublicLabel'), ''),
        nullif(p_request->>'vehicleKind', ''), v_eta_starts_at, v_eta_ends_at,
        v_store_lat, v_store_lng, v_destination_lat, v_destination_lng,
        case when v_mode = 'external_carrier'
          then nullif(btrim(p_request->>'externalCarrier'), '') end,
        case when v_mode = 'external_carrier'
          then nullif(btrim(p_request->>'externalTrackingCodeMasked'), '') end,
        case when v_mode = 'external_carrier'
          then nullif(btrim(p_request->>'externalTrackingUrl'), '') end,
        coalesce(nullif(p_request->>'contactCapability', ''), 'none'),
        v_now, v_now
      ) returning * into v_session;
    else
      update public.delivery_tracking_sessions session
      set tracking_mode = v_mode,
          tracking_state = case
            when session.tracking_mode = v_mode
              and session.tracking_state in ('assigned', 'active', 'paused')
              then session.tracking_state else v_state end,
          courier_public_label = case when v_mode = 'live_courier'
            then nullif(btrim(p_request->>'courierPublicLabel'), '') end,
          vehicle_kind = case when v_mode = 'live_courier'
            then nullif(p_request->>'vehicleKind', '') end,
          eta_starts_at = v_eta_starts_at,
          eta_ends_at = v_eta_ends_at,
          store_latitude = v_store_lat,
          store_longitude = v_store_lng,
          destination_latitude = v_destination_lat,
          destination_longitude = v_destination_lng,
          external_carrier = case when v_mode = 'external_carrier'
            then nullif(btrim(p_request->>'externalCarrier'), '') end,
          external_tracking_code_masked = case when v_mode = 'external_carrier'
            then nullif(btrim(p_request->>'externalTrackingCodeMasked'), '') end,
          external_tracking_url = case when v_mode = 'external_carrier'
            then nullif(btrim(p_request->>'externalTrackingUrl'), '') end,
          contact_capability = coalesce(
            nullif(p_request->>'contactCapability', ''), 'none'
          ),
          version = session.version + 1,
          updated_at = v_now
      where session.id = v_session.id
      returning * into v_session;
    end if;
    perform app_private.delivery_tracking_event_v1(
      v_session.id, 'configured',
      case when v_actor_profile_id is not null
        then 'personal_account' else 'admin_staff' end,
      v_actor_profile_id, v_actor_staff_id,
      jsonb_build_object('trackingMode', v_mode), v_now
    );
  end if;

  perform app_private.delivery_tracking_refresh_feed_v1(p_order_id, v_now);
  select session.* into v_session
  from public.delivery_tracking_sessions session
  where session.order_id = p_order_id and session.ended_at is null;
  v_result := jsonb_build_object(
    'ok', true, 'code', 'success', 'operation', p_operation,
    'orderId', p_order_id,
    'trackingSessionId', v_session.public_tracking_session_id,
    'trackingMode', case v_session.tracking_mode
      when 'status_only' then 'statusOnly'
      when 'external_carrier' then 'externalCarrier'
      else 'liveCourier' end,
    'trackingState', v_session.tracking_state,
    'version', v_session.version,
    'idempotent', false
  );
  insert into public.delivery_tracking_mutations (
    shop_id, session_id, order_id, idempotency_key, operation,
    request_sha256, actor_profile_id, actor_staff_id, response_payload
  ) values (
    p_shop_id, v_session.id, p_order_id, p_idempotency_key, p_operation,
    v_request_hash, v_actor_profile_id, v_actor_staff_id, v_result
  );
  return v_result;
exception
  when invalid_text_representation or invalid_datetime_format
    or numeric_value_out_of_range or check_violation
    or foreign_key_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  when insufficient_privilege then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
end;
$$;

create or replace function public.storefront_courier_tracking_control_v1(
  p_shop_id uuid,
  p_order_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_staff_id uuid,
  p_staff_web_session_id uuid,
  p_session_token_hash text,
  p_expected_credential_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_order public.customer_orders%rowtype;
  v_session public.delivery_tracking_sessions%rowtype;
  v_assignment public.delivery_courier_assignments%rowtype;
  v_previous public.delivery_tracking_mutations%rowtype;
  v_request_hash text;
  v_result jsonb;
  v_next_state text;
  v_event_type text;
begin
  if p_shop_id is null or p_order_id is null or p_idempotency_key is null
    or p_staff_id is null or p_operation not in ('start', 'pause', 'stop') then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.delivery_tracking_admin_authorized_v1(
    p_shop_id, 'orders.delivery.track', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  v_request_hash := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'storefront_courier_tracking_control_v1', p_shop_id, p_order_id,
      p_operation, p_staff_id
    )::text, 'UTF8'), 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'delivery-tracking-mutation:' || p_shop_id::text || ':'
      || p_idempotency_key::text, 0
  ));
  select mutation.* into v_previous
  from public.delivery_tracking_mutations mutation
  where mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_previous.request_sha256 <> v_request_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'delivery-tracking-order:' || p_shop_id::text || ':' || p_order_id::text, 0
  ));
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.shop_id = p_shop_id and customer_order.id = p_order_id
  for update;
  select session.* into v_session
  from public.delivery_tracking_sessions session
  where session.order_id = p_order_id
    and session.shop_id = p_shop_id
    and session.ended_at is null
    and session.tracking_mode = 'live_courier'
  for update;
  if v_order.id is null or v_session.id is null
    or v_order.status <> 'out_for_delivery' then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;
  select assignment.* into v_assignment
  from public.delivery_courier_assignments assignment
  where assignment.session_id = v_session.id
    and assignment.courier_staff_id = p_staff_id
    and assignment.revoked_at is null
  for update;
  if v_assignment.id is null then
    return jsonb_build_object('ok', false, 'code', 'assignment_denied');
  end if;

  if p_operation = 'start'
    and v_session.tracking_state not in ('assigned', 'paused', 'active') then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  elsif p_operation in ('pause', 'stop')
    and v_session.tracking_state <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;
  v_next_state := case when p_operation = 'start' then 'active' else 'paused' end;
  v_event_type := case p_operation
    when 'start' then 'started' when 'pause' then 'paused' else 'stopped' end;

  update public.delivery_tracking_sessions session
  set tracking_state = v_next_state,
      started_at = case when p_operation = 'start'
        then coalesce(session.started_at, v_now) else session.started_at end,
      version = session.version + 1,
      updated_at = v_now
  where session.id = v_session.id
  returning * into v_session;
  perform app_private.delivery_tracking_event_v1(
    v_session.id, v_event_type, 'courier_staff', null, p_staff_id,
    jsonb_build_object('assignmentVersion', v_assignment.assignment_version),
    v_now
  );
  perform app_private.delivery_tracking_refresh_feed_v1(p_order_id, v_now);

  v_result := jsonb_build_object(
    'ok', true, 'code', 'success', 'operation', p_operation,
    'orderId', p_order_id,
    'trackingSessionId', v_session.public_tracking_session_id,
    'trackingState', v_session.tracking_state,
    'version', v_session.version,
    'idempotent', false
  );
  insert into public.delivery_tracking_mutations (
    shop_id, session_id, order_id, idempotency_key, operation,
    request_sha256, actor_staff_id, response_payload
  ) values (
    p_shop_id, v_session.id, p_order_id, p_idempotency_key, p_operation,
    v_request_hash, p_staff_id, v_result
  );
  return v_result;
exception
  when insufficient_privilege then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
end;
$$;

create or replace function public.storefront_courier_location_upsert_v1(
  p_shop_id uuid,
  p_order_id uuid,
  p_idempotency_key uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_horizontal_accuracy_meters double precision,
  p_observed_at timestamptz,
  p_bearing_degrees double precision default null,
  p_speed_meters_per_second double precision default null,
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
  v_now timestamptz := statement_timestamp();
  v_order public.customer_orders%rowtype;
  v_session public.delivery_tracking_sessions%rowtype;
  v_assignment public.delivery_courier_assignments%rowtype;
  v_previous public.delivery_tracking_mutations%rowtype;
  v_location public.delivery_courier_latest_locations%rowtype;
  v_request_hash text;
  v_result jsonb;
  v_min_interval integer;
  v_min_distance integer;
  v_elapsed_seconds double precision;
  v_distance_meters double precision;
  v_next_location_version bigint := 1;
begin
  if p_shop_id is null or p_order_id is null or p_idempotency_key is null
    or p_staff_id is null or p_observed_at is null
    or p_latitude is null or p_longitude is null
    or p_horizontal_accuracy_meters is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
    or p_horizontal_accuracy_meters not between 0 and 5000
    or p_latitude in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
    or p_longitude in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
    or p_horizontal_accuracy_meters in (
      'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8
    )
    or (p_bearing_degrees is not null and (
      p_bearing_degrees < 0 or p_bearing_degrees >= 360
      or p_bearing_degrees in (
        'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8
      )
    ))
    or (p_speed_meters_per_second is not null and (
      p_speed_meters_per_second < 0 or p_speed_meters_per_second > 100
      or p_speed_meters_per_second in (
        'NaN'::float8, 'Infinity'::float8, '-Infinity'::float8
      )
    ))
    or p_observed_at > v_now + interval '30 seconds'
    or p_observed_at < v_now - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.delivery_tracking_admin_authorized_v1(
    p_shop_id, 'orders.delivery.track', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  v_request_hash := encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_array(
      'storefront_courier_location_upsert_v1', p_shop_id, p_order_id,
      p_latitude, p_longitude, p_horizontal_accuracy_meters, p_observed_at,
      p_bearing_degrees, p_speed_meters_per_second, p_staff_id
    )::text, 'UTF8'), 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'delivery-tracking-mutation:' || p_shop_id::text || ':'
      || p_idempotency_key::text, 0
  ));
  select mutation.* into v_previous
  from public.delivery_tracking_mutations mutation
  where mutation.shop_id = p_shop_id
    and mutation.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_previous.request_sha256 <> v_request_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_set(v_previous.response_payload, '{idempotent}', 'true'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'delivery-tracking-order:' || p_shop_id::text || ':' || p_order_id::text, 0
  ));
  select customer_order.* into v_order
  from public.customer_orders customer_order
  where customer_order.shop_id = p_shop_id and customer_order.id = p_order_id
  for update;
  select session.* into v_session
  from public.delivery_tracking_sessions session
  where session.shop_id = p_shop_id and session.order_id = p_order_id
    and session.tracking_mode = 'live_courier'
    and session.tracking_state = 'active' and session.ended_at is null
  for update;
  if v_order.id is null or v_order.status <> 'out_for_delivery'
    or v_session.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;
  select assignment.* into v_assignment
  from public.delivery_courier_assignments assignment
  where assignment.session_id = v_session.id
    and assignment.courier_staff_id = p_staff_id
    and assignment.revoked_at is null
  for update;
  if v_assignment.id is null then
    return jsonb_build_object('ok', false, 'code', 'assignment_denied');
  end if;

  select settings.delivery_tracking_min_interval_seconds,
         settings.delivery_tracking_min_distance_meters
  into v_min_interval, v_min_distance
  from public.storefront_settings settings
  where settings.shop_id = p_shop_id
    and settings.delivery_tracking_enabled;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'feature_disabled');
  end if;

  select location.* into v_location
  from public.delivery_courier_latest_locations location
  where location.session_id = v_session.id
  for update;
  if v_location.session_id is not null then
    if p_observed_at <= v_location.observed_at then
      return jsonb_build_object('ok', false, 'code', 'out_of_order');
    end if;
    v_elapsed_seconds := extract(epoch from (v_now - v_location.received_at));
    v_distance_meters := app_private.delivery_tracking_distance_meters_v1(
      v_location.latitude, v_location.longitude, p_latitude, p_longitude
    );
    if v_elapsed_seconds < 1
      or (v_elapsed_seconds < v_min_interval
        and v_distance_meters < v_min_distance) then
      v_result := jsonb_build_object(
        'ok', false, 'code', 'rate_limited', 'orderId', p_order_id,
        'retryAfterSeconds', greatest(
          1, ceil(v_min_interval - v_elapsed_seconds)::integer
        ),
        'idempotent', false
      );
      insert into public.delivery_tracking_mutations (
        shop_id, session_id, order_id, idempotency_key, operation,
        request_sha256, actor_staff_id, response_payload
      ) values (
        p_shop_id, v_session.id, p_order_id, p_idempotency_key,
        'location_upsert', v_request_hash, p_staff_id, v_result
      );
      return v_result;
    end if;
    v_next_location_version := v_location.location_version + 1;
  end if;

  insert into public.delivery_courier_latest_locations (
    session_id, shop_id, order_id, assignment_id, latitude, longitude,
    horizontal_accuracy_meters, bearing_degrees, speed_meters_per_second,
    observed_at, received_at, location_version, expires_at
  ) values (
    v_session.id, p_shop_id, p_order_id, v_assignment.id, p_latitude,
    p_longitude, p_horizontal_accuracy_meters, p_bearing_degrees,
    p_speed_meters_per_second, p_observed_at, v_now,
    v_next_location_version, v_now + interval '24 hours'
  )
  on conflict (session_id) do update set
    assignment_id = excluded.assignment_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    horizontal_accuracy_meters = excluded.horizontal_accuracy_meters,
    bearing_degrees = excluded.bearing_degrees,
    speed_meters_per_second = excluded.speed_meters_per_second,
    observed_at = excluded.observed_at,
    received_at = excluded.received_at,
    location_version = excluded.location_version,
    expires_at = excluded.expires_at;

  perform app_private.delivery_tracking_refresh_feed_v1(p_order_id, v_now);
  v_result := jsonb_build_object(
    'ok', true, 'code', 'success', 'orderId', p_order_id,
    'trackingSessionId', v_session.public_tracking_session_id,
    'locationVersion', v_next_location_version,
    'receivedAt', v_now,
    'idempotent', false
  );
  insert into public.delivery_tracking_mutations (
    shop_id, session_id, order_id, idempotency_key, operation,
    request_sha256, actor_staff_id, response_payload
  ) values (
    p_shop_id, v_session.id, p_order_id, p_idempotency_key,
    'location_upsert', v_request_hash, p_staff_id, v_result
  );
  return v_result;
exception
  when numeric_value_out_of_range or check_violation
    or foreign_key_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  when insufficient_privilege then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'conflict');
end;
$$;

create or replace function app_private.delivery_tracking_cleanup_v1(
  p_at timestamptz default statement_timestamp(),
  p_limit integer default 1000
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_locations integer := 0;
  v_mutations integer := 0;
  v_sessions integer := 0;
begin
  if p_at is null or p_limit not between 1 and 5000 then
    raise exception 'invalid delivery tracking cleanup request'
      using errcode = '22023';
  end if;

  delete from public.delivery_courier_latest_locations location
  where location.session_id in (
    select candidate.session_id
    from public.delivery_courier_latest_locations candidate
    where candidate.expires_at <= p_at
    order by candidate.expires_at, candidate.session_id
    limit p_limit
  );
  get diagnostics v_locations = row_count;

  delete from public.delivery_tracking_mutations mutation
  where mutation.id in (
    select candidate.id
    from public.delivery_tracking_mutations candidate
    where candidate.retained_until <= p_at
    order by candidate.retained_until, candidate.id
    limit p_limit
  );
  get diagnostics v_mutations = row_count;

  delete from public.delivery_tracking_sessions session
  where session.id in (
    select candidate.id
    from public.delivery_tracking_sessions candidate
    where candidate.ended_at <= p_at - interval '30 days'
    order by candidate.ended_at, candidate.id
    limit p_limit
  );
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'locationsDeleted', v_locations,
    'mutationsDeleted', v_mutations,
    'sessionsDeleted', v_sessions,
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
      where jobname = 'storefront-delivery-tracking-cleanup-v1'
    loop
      perform cron.unschedule(v_job_id);
    end loop;
    perform cron.schedule(
      'storefront-delivery-tracking-cleanup-v1',
      '*/15 * * * *',
      $command$select app_private.delivery_tracking_cleanup_v1(statement_timestamp(), 1000);$command$
    );
  end if;
end;
$cron$;

revoke all on function app_private.delivery_tracking_distance_meters_v1(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_mutation_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_admin_personal_allowed_v1(
  uuid, text
) from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_courier_lease_is_valid_v1(
  uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_admin_authorized_v1(
  uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_event_v1(
  uuid, text, text, uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_refresh_feed_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_order_terminal_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.delivery_tracking_cleanup_v1(
  timestamptz, integer
) from public, anon, authenticated, service_role;

revoke all on function public.storefront_order_tracking_v1(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_delivery_tracking_read_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.admin_delivery_tracking_manage_v1(
  uuid, uuid, text, jsonb, uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.storefront_courier_tracking_control_v1(
  uuid, uuid, text, uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.storefront_courier_location_upsert_v1(
  uuid, uuid, uuid, double precision, double precision, double precision,
  timestamptz, double precision, double precision, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;

grant execute on function public.storefront_order_tracking_v1(text, uuid)
  to authenticated;
grant execute on function public.admin_delivery_tracking_read_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_delivery_tracking_manage_v1(
  uuid, uuid, text, jsonb, uuid, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.storefront_courier_tracking_control_v1(
  uuid, uuid, text, uuid, uuid, uuid, text, integer
) to service_role;
grant execute on function public.storefront_courier_location_upsert_v1(
  uuid, uuid, uuid, double precision, double precision, double precision,
  timestamptz, double precision, double precision, uuid, uuid, text, integer
) to service_role;

comment on table public.delivery_tracking_sessions is
  'Private delivery session authority. Public clients receive only the owner-scoped feed projection.';
comment on table public.delivery_courier_latest_locations is
  'Latest-only precise courier position. No route history; terminal states and retention delete the row.';
comment on table public.storefront_delivery_tracking_feed is
  'Customer-safe owner-scoped Realtime projection with no courier subject identifiers or personal contact data.';
comment on function public.storefront_order_tracking_v1(text, uuid) is
  'Owner-scoped delivery-tracking-snapshot.v1 read boundary.';
comment on function public.storefront_courier_location_upsert_v1(
  uuid, uuid, uuid, double precision, double precision, double precision,
  timestamptz, double precision, double precision, uuid, uuid, text, integer
) is
  'Assigned courier-only latest-location writer with version, timestamp, idempotency and server-enforced throttling.';

notify pgrst, 'reload schema';

commit;
