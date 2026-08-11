-- Storefront v1 / TASK-025
--
-- Short-lived customer reservation holds. Operational inventory remains the
-- on-hand authority; active, unexpired holds consume only private
-- available-to-promise capacity. Every capacity mutation serializes on the
-- operational product row before touching a hold row.

begin;

create table public.customer_reservation_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  publication_id uuid not null,
  source_product_id uuid not null references public.inventory_products(id)
    on delete restrict,
  quantity integer not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  terminal_at timestamptz,
  create_idempotency_key uuid not null,
  create_request_sha256 text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint customer_reservation_holds_publication_fkey foreign key (
    shop_id,
    publication_id
  ) references public.storefront_product_publications(shop_id, id)
    on delete restrict,
  constraint customer_reservation_holds_quantity_check check (
    quantity between 1 and 99
  ),
  constraint customer_reservation_holds_status_check check (
    status in ('active', 'released', 'expired', 'consumed')
  ),
  constraint customer_reservation_holds_expiry_check check (
    pg_catalog.isfinite(expires_at)
    and expires_at > created_at
  ),
  constraint customer_reservation_holds_terminal_check check (
    (status = 'active' and terminal_at is null)
    or (status <> 'active' and terminal_at is not null)
  ),
  constraint customer_reservation_holds_request_digest_check check (
    create_request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_reservation_holds_updated_check check (
    updated_at >= created_at
  ),
  constraint customer_reservation_holds_create_key_unique unique (
    user_id,
    shop_id,
    create_idempotency_key
  )
);

create unique index customer_reservation_holds_active_publication_owner_idx
  on public.customer_reservation_holds(user_id, shop_id, publication_id)
  where status = 'active';
create index customer_reservation_holds_active_product_expiry_idx
  on public.customer_reservation_holds(
    source_product_id,
    expires_at,
    id
  ) where status = 'active';
create index customer_reservation_holds_owner_status_idx
  on public.customer_reservation_holds(
    user_id,
    shop_id,
    status,
    expires_at desc,
    id
  );
create index customer_reservation_holds_cleanup_idx
  on public.customer_reservation_holds(expires_at, source_product_id, id)
  where status = 'active';

create table public.customer_reservation_hold_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  hold_id uuid references public.customer_reservation_holds(id)
    on delete cascade,
  idempotency_key uuid not null,
  operation text not null,
  request_sha256 text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  retained_until timestamptz not null
    default (statement_timestamp() + interval '30 days'),
  constraint customer_reservation_hold_mutations_operation_check check (
    operation in ('create', 'release')
  ),
  constraint customer_reservation_hold_mutations_digest_check check (
    request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint customer_reservation_hold_mutations_payload_check check (
    jsonb_typeof(response_payload) = 'object'
  ),
  constraint customer_reservation_hold_mutations_retention_check check (
    retained_until > created_at
  ),
  constraint customer_reservation_hold_mutations_key_unique unique (
    user_id,
    shop_id,
    idempotency_key
  )
);

create index customer_reservation_hold_mutations_retention_idx
  on public.customer_reservation_hold_mutations(retained_until, id);

alter table public.customer_reservation_holds enable row level security;
alter table public.customer_reservation_holds force row level security;
alter table public.customer_reservation_hold_mutations enable row level security;
alter table public.customer_reservation_hold_mutations force row level security;

create policy customer_reservation_holds_select_owner
  on public.customer_reservation_holds for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );
create policy customer_reservation_holds_insert_owner
  on public.customer_reservation_holds for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );
create policy customer_reservation_holds_update_owner
  on public.customer_reservation_holds for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );
create policy customer_reservation_holds_delete_owner
  on public.customer_reservation_holds for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );

create policy customer_reservation_hold_mutations_select_owner
  on public.customer_reservation_hold_mutations for select to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );
create policy customer_reservation_hold_mutations_insert_owner
  on public.customer_reservation_hold_mutations for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );
create policy customer_reservation_hold_mutations_update_owner
  on public.customer_reservation_hold_mutations for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );
create policy customer_reservation_hold_mutations_delete_owner
  on public.customer_reservation_hold_mutations for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce(
      (select (auth.jwt() ->> 'is_anonymous')::boolean),
      false
    )
  );

revoke all on table public.customer_reservation_holds
  from public, anon, authenticated;
revoke all on table public.customer_reservation_hold_mutations
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.customer_reservation_holds to service_role;
grant select, insert, update, delete
  on table public.customer_reservation_hold_mutations to service_role;

create or replace function app_private.storefront_reservation_capacity_state_v1(
  p_stock_quantity double precision,
  p_reserved_quantity numeric,
  p_low_stock_threshold numeric,
  p_deleted_at timestamptz
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select app_private.storefront_inventory_signal_state_v1(
    case
      when p_stock_quantity is null then null
      else p_stock_quantity - coalesce(p_reserved_quantity, 0)::double precision
    end,
    p_low_stock_threshold,
    p_deleted_at
  );
$$;

create or replace function app_private.storefront_reservation_active_quantity_v1(
  p_source_product_id uuid,
  p_at timestamptz
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(hold.quantity), 0)::numeric
  from public.customer_reservation_holds hold
  where hold.source_product_id = p_source_product_id
    and hold.status = 'active'
    and hold.expires_at > p_at;
$$;

create or replace function app_private.customer_reservation_hold_payload_v1(
  p_hold_id uuid,
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
    'apiVersion', 'customer-reservation-hold.v1',
    'status', p_status,
    'idempotent', p_idempotent,
    'holdId', hold.id,
    'shopSlug', setting.public_slug,
    'publicationId', hold.publication_id,
    'quantity', hold.quantity,
    'holdStatus', case
      when hold.status = 'active' and hold.expires_at <= p_at then 'expired'
      else hold.status
    end,
    'expiresAt', hold.expires_at,
    'terminalAt', hold.terminal_at,
    'serverTime', p_at,
    'remainingSeconds', case
      when hold.status = 'active' and hold.expires_at > p_at
      then greatest(
        0,
        floor(extract(epoch from hold.expires_at - p_at))::integer
      )
      else 0
    end
  ))
  from public.customer_reservation_holds hold
  join public.storefront_settings setting on setting.shop_id = hold.shop_id
  where hold.id = p_hold_id;
$$;

create or replace function app_private.storefront_reservation_refresh_availability_v1(
  p_source_product_id uuid,
  p_at timestamptz default statement_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_source_product_id is null or p_at is null then
    return 0;
  end if;

  with reserved as materialized (
    select app_private.storefront_reservation_active_quantity_v1(
      p_source_product_id,
      p_at
    ) as quantity
  ), capacity_candidates as materialized (
    select
      publication.shop_id,
      product.id as source_product_id,
      app_private.storefront_reservation_capacity_state_v1(
        product.stock_quantity,
        reserved.quantity,
        setting.availability_low_stock_threshold,
        product.deleted_at
      ) as signal_state,
      existing.signal_state as existing_signal_state,
      existing.source_kind as existing_source_kind,
      existing.source_observed_at as existing_source_observed_at
    from public.inventory_products product
    join public.storefront_product_publications publication
      on publication.source_product_id = product.id
    join public.storefront_settings setting
      on setting.shop_id = publication.shop_id
    left join app_private.storefront_product_availability_signals existing
      on existing.shop_id = publication.shop_id
      and existing.source_product_id = product.id
    cross join reserved
    where product.id = p_source_product_id
  ), candidates as materialized (
    select
      candidate.shop_id,
      candidate.source_product_id,
      candidate.signal_state
    from capacity_candidates candidate
    where not (
      candidate.existing_source_kind = 'operational_event'
      and candidate.existing_source_observed_at > p_at
      and case candidate.existing_signal_state
        when 'unavailable' then 3
        when 'low_stock' then 2
        else 1
      end >= case candidate.signal_state
        when 'unavailable' then 3
        when 'low_stock' then 2
        else 1
      end
    )
  )
  insert into app_private.storefront_product_availability_signals as signal (
    shop_id,
    source_product_id,
    source_version,
    signal_state,
    source_kind,
    source_observed_at,
    expires_at,
    last_idempotency_key,
    last_payload_sha256,
    updated_at
  )
  select
    candidate.shop_id,
    candidate.source_product_id,
    1,
    candidate.signal_state,
    'inventory_database',
    p_at,
    'infinity'::timestamptz,
    'reservation:' || encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        candidate.shop_id,
        candidate.source_product_id,
        candidate.signal_state,
        p_at,
        pg_catalog.txid_current()
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        candidate.shop_id,
        candidate.source_product_id,
        1,
        candidate.signal_state,
        p_at,
        'infinity'::timestamptz,
        'inventory_database'
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    p_at
  from candidates candidate
  on conflict (shop_id, source_product_id) do update set
    source_version = signal.source_version + 1,
    signal_state = excluded.signal_state,
    source_kind = excluded.source_kind,
    source_observed_at = excluded.source_observed_at,
    expires_at = excluded.expires_at,
    last_idempotency_key = excluded.last_idempotency_key,
    last_payload_sha256 = encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        excluded.shop_id,
        excluded.source_product_id,
        signal.source_version + 1,
        excluded.signal_state,
        excluded.source_observed_at,
        excluded.expires_at,
        excluded.source_kind
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    updated_at = excluded.updated_at;

  update public.storefront_product_publications publication
  set availability_mode = app_private.storefront_effective_availability_v1(
    signal.signal_state,
    signal.source_observed_at,
    signal.expires_at,
    publication.pickup_enabled,
    publication.delivery_enabled,
    publication.reservation_enabled,
    p_at
  )
  from app_private.storefront_product_availability_signals signal
  where publication.source_product_id = p_source_product_id
    and signal.shop_id = publication.shop_id
    and signal.source_product_id = publication.source_product_id
    and publication.availability_mode is distinct from
      app_private.storefront_effective_availability_v1(
        signal.signal_state,
        signal.source_observed_at,
        signal.expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        p_at
      );
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function app_private.storefront_reservation_inventory_floor_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved numeric;
begin
  if new.stock_quantity is not distinct from old.stock_quantity
    and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  v_reserved := app_private.storefront_reservation_active_quantity_v1(
    old.id,
    statement_timestamp()
  );

  if v_reserved > 0 and (
    new.deleted_at is not null
    or new.stock_quantity is null
    or new.stock_quantity in (
      'Infinity'::double precision,
      '-Infinity'::double precision,
      'NaN'::double precision
    )
    or new.stock_quantity < v_reserved::double precision
  ) then
    raise exception using
      errcode = '23514',
      message = 'active storefront reservation prevents stock reduction';
  end if;

  return new;
end;
$$;

drop trigger if exists storefront_reservation_inventory_floor_guard
  on public.inventory_products;
create trigger storefront_reservation_inventory_floor_guard
  before update of stock_quantity, deleted_at on public.inventory_products
  for each row execute function
    app_private.storefront_reservation_inventory_floor_guard_v1();

create or replace function app_private.storefront_reservation_inventory_refresh_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
begin
  for v_product in
    select current.id
    from storefront_reservation_inventory_new_rows current
    join storefront_reservation_inventory_old_rows previous
      on previous.id = current.id
    where current.stock_quantity is distinct from previous.stock_quantity
      or current.deleted_at is distinct from previous.deleted_at
      or current.shop_id is distinct from previous.shop_id
      or current.owner_user_id is distinct from previous.owner_user_id
    order by current.id
  loop
    perform app_private.storefront_reservation_refresh_availability_v1(
      v_product.id,
      statement_timestamp()
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists zz_storefront_reservation_inventory_refresh
  on public.inventory_products;
create trigger zz_storefront_reservation_inventory_refresh
  after update on public.inventory_products
  referencing old table as storefront_reservation_inventory_old_rows
    new table as storefront_reservation_inventory_new_rows
  for each statement execute function
    app_private.storefront_reservation_inventory_refresh_v1();

-- Clamp operational observations to the private available-to-promise state.
-- The same product-row lock used by hold writers closes the race between the
-- observation and the active-hold sum.
create or replace function public.storefront_availability_ingest_v1(
  p_shop_id uuid,
  p_source_product_id uuid,
  p_source_version bigint,
  p_signal_state text,
  p_source_observed_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_stock_quantity double precision;
  v_deleted_at timestamptz;
  v_threshold numeric;
  v_capacity_state text;
  v_clamped_state text;
begin
  if p_expires_at is null
    or not pg_catalog.isfinite(p_expires_at)
    or p_source_observed_at is null
    or p_expires_at > p_source_observed_at + interval '24 hours' then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-availability.v1',
      'status', 'validation_failed'
    );
  end if;

  select
    product.stock_quantity,
    product.deleted_at,
    setting.availability_low_stock_threshold
  into v_stock_quantity, v_deleted_at, v_threshold
  from public.inventory_products product
  join public.storefront_settings setting on setting.shop_id = p_shop_id
  where product.id = p_source_product_id
    and app_private.storefront_product_matches_shop_v1(product.id, p_shop_id)
  for update of product;

  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-availability.v1',
      'status', 'scope_denied'
    );
  end if;

  v_capacity_state := app_private.storefront_reservation_capacity_state_v1(
    v_stock_quantity,
    app_private.storefront_reservation_active_quantity_v1(
      p_source_product_id,
      statement_timestamp()
    ),
    v_threshold,
    v_deleted_at
  );
  v_clamped_state := case
    when p_signal_state = 'unavailable' or v_capacity_state = 'unavailable'
      then 'unavailable'
    when p_signal_state = 'low_stock' or v_capacity_state = 'low_stock'
      then 'low_stock'
    else p_signal_state
  end;

  return app_private.storefront_availability_apply_signal_v1(
    p_shop_id,
    p_source_product_id,
    p_source_version,
    v_clamped_state,
    p_source_observed_at,
    p_expires_at,
    p_idempotency_key,
    'operational_event'
  );
end;
$$;

create or replace function public.customer_reservation_hold_create_v1(
  p_shop_slug text,
  p_publication_id uuid,
  p_quantity integer,
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
  v_now timestamptz := statement_timestamp();
  v_request_sha256 text;
  v_previous public.customer_reservation_hold_mutations%rowtype;
  v_product public.inventory_products%rowtype;
  v_existing public.customer_reservation_holds%rowtype;
  v_hold_id uuid;
  v_reserved numeric;
  v_active_count integer;
  v_result jsonb;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;

  if p_publication_id is null
    or p_quantity is null
    or p_quantity not between 1 and 99
    or p_idempotency_key is null then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'invalid',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  v_shop_id := app_private.customer_cart_shop_id_v1(p_shop_slug);
  if v_shop_id is null then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'unavailable',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      'create',
      p_shop_slug,
      p_publication_id,
      p_quantity
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'storefront-hold-owner:' || v_user_id::text || ':' || v_shop_id::text,
    25025
  ));

  select mutation.* into v_previous
  from public.customer_reservation_hold_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'create'
      or v_previous.request_sha256 <> v_request_sha256 then
      return pg_catalog.jsonb_build_object(
        'apiVersion', 'customer-reservation-hold.v1',
        'status', 'idempotency_conflict',
        'idempotent', false,
        'serverTime', v_now
      );
    end if;
    return pg_catalog.jsonb_set(
      v_previous.response_payload,
      '{idempotent}',
      'true'::jsonb,
      true
    );
  end if;

  select product.* into v_product
  from public.storefront_product_publications publication
  join public.storefront_settings setting
    on setting.shop_id = publication.shop_id
  join public.inventory_products product
    on product.id = publication.source_product_id
  where publication.shop_id = v_shop_id
    and publication.id = p_publication_id
    and publication.publication_status = 'published'
    and publication.published_at is not null
    and setting.storefront_enabled
    and product.deleted_at is null
    and app_private.storefront_product_matches_shop_v1(product.id, v_shop_id)
  for update of product;

  if not found then
    v_result := pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'unavailable',
      'idempotent', false,
      'serverTime', v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  update public.customer_reservation_holds hold
  set status = 'expired',
      terminal_at = v_now,
      updated_at = v_now
  where hold.user_id = v_user_id
    and hold.shop_id = v_shop_id
    and hold.publication_id = p_publication_id
    and hold.status = 'active'
    and hold.expires_at <= v_now;

  select hold.* into v_existing
  from public.customer_reservation_holds hold
  where hold.user_id = v_user_id
    and hold.shop_id = v_shop_id
    and hold.publication_id = p_publication_id
    and hold.status = 'active'
    and hold.expires_at > v_now
  for update;
  if found then
    v_result := app_private.customer_reservation_hold_payload_v1(
      v_existing.id,
      'active_hold_exists',
      false,
      v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, hold_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, v_existing.id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  select count(*)::integer into v_active_count
  from public.customer_reservation_holds hold
  where hold.user_id = v_user_id
    and hold.shop_id = v_shop_id
    and hold.status = 'active'
    and hold.expires_at > v_now;
  if v_active_count >= 25 then
    v_result := pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'hold_limit_reached',
      'idempotent', false,
      'serverTime', v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  v_reserved := app_private.storefront_reservation_active_quantity_v1(
    v_product.id,
    v_now
  );
  if v_product.stock_quantity is null
    or v_product.stock_quantity in (
      'Infinity'::double precision,
      '-Infinity'::double precision,
      'NaN'::double precision
    )
    or v_product.stock_quantity - v_reserved::double precision < p_quantity then
    v_result := pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'unavailable',
      'idempotent', false,
      'serverTime', v_now
    );
    insert into public.customer_reservation_hold_mutations(
      user_id, shop_id, idempotency_key, operation,
      request_sha256, response_payload
    ) values (
      v_user_id, v_shop_id, p_idempotency_key, 'create',
      v_request_sha256, v_result
    );
    return v_result;
  end if;

  insert into public.customer_reservation_holds(
    user_id,
    shop_id,
    publication_id,
    source_product_id,
    quantity,
    status,
    expires_at,
    create_idempotency_key,
    create_request_sha256,
    created_at,
    updated_at
  ) values (
    v_user_id,
    v_shop_id,
    p_publication_id,
    v_product.id,
    p_quantity,
    'active',
    v_now + interval '15 minutes',
    p_idempotency_key,
    v_request_sha256,
    v_now,
    v_now
  ) returning id into v_hold_id;

  v_result := app_private.customer_reservation_hold_payload_v1(
    v_hold_id,
    'ok',
    false,
    v_now
  );
  insert into public.customer_reservation_hold_mutations(
    user_id, shop_id, hold_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_shop_id, v_hold_id, p_idempotency_key, 'create',
    v_request_sha256, v_result
  );

  perform app_private.storefront_reservation_refresh_availability_v1(
    v_product.id,
    v_now
  );
  return v_result;
end;
$$;

create or replace function public.customer_reservation_hold_read_v1(
  p_hold_id uuid
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
  v_hold public.customer_reservation_holds%rowtype;
  v_changed boolean := false;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_hold_id is null then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'invalid',
      'idempotent', true,
      'serverTime', v_now
    );
  end if;

  select hold.* into v_hold
  from public.customer_reservation_holds hold
  where hold.id = p_hold_id and hold.user_id = v_user_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'not_found',
      'idempotent', true,
      'serverTime', v_now
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'storefront-hold-owner:' || v_user_id::text || ':' || v_hold.shop_id::text,
    25025
  ));
  perform 1 from public.inventory_products product
  where product.id = v_hold.source_product_id
  for update;

  select hold.* into v_hold
  from public.customer_reservation_holds hold
  where hold.id = p_hold_id and hold.user_id = v_user_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'not_found',
      'idempotent', true,
      'serverTime', v_now
    );
  end if;

  if v_hold.status = 'active' and v_hold.expires_at <= v_now then
    update public.customer_reservation_holds
    set status = 'expired', terminal_at = v_now, updated_at = v_now
    where id = v_hold.id and status = 'active';
    v_changed := found;
  end if;

  if v_changed then
    perform app_private.storefront_reservation_refresh_availability_v1(
      v_hold.source_product_id,
      v_now
    );
  end if;
  return app_private.customer_reservation_hold_payload_v1(
    v_hold.id,
    'ok',
    true,
    v_now
  );
end;
$$;

create or replace function public.customer_reservation_hold_release_v1(
  p_hold_id uuid,
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
  v_hold public.customer_reservation_holds%rowtype;
  v_previous public.customer_reservation_hold_mutations%rowtype;
  v_request_sha256 text;
  v_result jsonb;
  v_changed boolean := false;
begin
  if v_user_id is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using
      errcode = '28000',
      message = 'authenticated customer session required';
  end if;
  if p_hold_id is null or p_idempotency_key is null then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'invalid',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  select hold.* into v_hold
  from public.customer_reservation_holds hold
  where hold.id = p_hold_id and hold.user_id = v_user_id;
  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'customer-reservation-hold.v1',
      'status', 'not_found',
      'idempotent', false,
      'serverTime', v_now
    );
  end if;

  v_request_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      'release',
      p_hold_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'storefront-hold-owner:' || v_user_id::text || ':' || v_hold.shop_id::text,
    25025
  ));

  select mutation.* into v_previous
  from public.customer_reservation_hold_mutations mutation
  where mutation.user_id = v_user_id
    and mutation.shop_id = v_hold.shop_id
    and mutation.idempotency_key = p_idempotency_key;
  if found then
    if v_previous.operation <> 'release'
      or v_previous.request_sha256 <> v_request_sha256 then
      return pg_catalog.jsonb_build_object(
        'apiVersion', 'customer-reservation-hold.v1',
        'status', 'idempotency_conflict',
        'idempotent', false,
        'serverTime', v_now
      );
    end if;
    return pg_catalog.jsonb_set(
      v_previous.response_payload,
      '{idempotent}',
      'true'::jsonb,
      true
    );
  end if;

  perform 1 from public.inventory_products product
  where product.id = v_hold.source_product_id
  for update;
  select hold.* into v_hold
  from public.customer_reservation_holds hold
  where hold.id = p_hold_id and hold.user_id = v_user_id
  for update;

  if v_hold.status = 'active' and v_hold.expires_at <= v_now then
    update public.customer_reservation_holds
    set status = 'expired', terminal_at = v_now, updated_at = v_now
    where id = v_hold.id and status = 'active';
    v_changed := found;
  elsif v_hold.status = 'active' then
    update public.customer_reservation_holds
    set status = 'released', terminal_at = v_now, updated_at = v_now
    where id = v_hold.id and status = 'active';
    v_changed := found;
  end if;

  v_result := app_private.customer_reservation_hold_payload_v1(
    v_hold.id,
    case when v_hold.status = 'consumed' then 'terminal' else 'ok' end,
    false,
    v_now
  );
  insert into public.customer_reservation_hold_mutations(
    user_id, shop_id, hold_id, idempotency_key, operation,
    request_sha256, response_payload
  ) values (
    v_user_id, v_hold.shop_id, v_hold.id, p_idempotency_key, 'release',
    v_request_sha256, v_result
  );

  if v_changed then
    perform app_private.storefront_reservation_refresh_availability_v1(
      v_hold.source_product_id,
      v_now
    );
  end if;
  return v_result;
end;
$$;

create or replace function app_private.storefront_reservation_holds_expire_v1(
  p_batch_size integer default 200,
  p_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '25s'
as $$
declare
  v_candidate record;
  v_hold public.customer_reservation_holds%rowtype;
  v_processed integer := 0;
  v_expired integer := 0;
  v_skipped integer := 0;
  v_remaining integer := 0;
begin
  if p_batch_size is null
    or p_batch_size not between 1 and 1000
    or p_at is null
    or not pg_catalog.isfinite(p_at) then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-reservation-cleanup.v1',
      'status', 'validation_failed'
    );
  end if;

  for v_candidate in
    select hold.id, hold.source_product_id
    from public.customer_reservation_holds hold
    where hold.status = 'active' and hold.expires_at <= p_at
    order by hold.source_product_id, hold.expires_at, hold.id
    limit p_batch_size
  loop
    v_processed := v_processed + 1;
    perform 1 from public.inventory_products product
    where product.id = v_candidate.source_product_id
    for update;

    select hold.* into v_hold
    from public.customer_reservation_holds hold
    where hold.id = v_candidate.id
    for update;

    if v_hold.status = 'active' and v_hold.expires_at <= p_at then
      update public.customer_reservation_holds
      set status = 'expired', terminal_at = p_at, updated_at = p_at
      where id = v_hold.id and status = 'active';
      if found then
        v_expired := v_expired + 1;
        perform app_private.storefront_reservation_refresh_availability_v1(
          v_hold.source_product_id,
          p_at
        );
      else
        v_skipped := v_skipped + 1;
      end if;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  select count(*)::integer into v_remaining
  from public.customer_reservation_holds hold
  where hold.status = 'active' and hold.expires_at <= p_at;

  return pg_catalog.jsonb_build_object(
    'apiVersion', 'storefront-reservation-cleanup.v1',
    'status', 'ok',
    'processed', v_processed,
    'expired', v_expired,
    'skipped', v_skipped,
    'remainingExpired', v_remaining,
    'serverTime', p_at
  );
end;
$$;

revoke all on function app_private.storefront_reservation_capacity_state_v1(
  double precision, numeric, numeric, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_reservation_active_quantity_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.customer_reservation_hold_payload_v1(
  uuid, text, boolean, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_reservation_refresh_availability_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_reservation_inventory_floor_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_reservation_inventory_refresh_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_reservation_holds_expire_v1(
  integer, timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.customer_reservation_hold_create_v1(
  text, uuid, integer, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.customer_reservation_hold_read_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_reservation_hold_release_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_reservation_hold_create_v1(
  text, uuid, integer, uuid
) to authenticated;
grant execute on function public.customer_reservation_hold_read_v1(uuid)
  to authenticated;
grant execute on function public.customer_reservation_hold_release_v1(uuid, uuid)
  to authenticated;

-- Keep the operational ingest service-only after replacing its body.
revoke all on function public.storefront_availability_ingest_v1(
  uuid, uuid, bigint, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.storefront_availability_ingest_v1(
  uuid, uuid, bigint, text, timestamptz, timestamptz, text
) to service_role;

select cron.schedule(
  'storefront-reservation-hold-expire-v1',
  '* * * * *',
  'select app_private.storefront_reservation_holds_expire_v1(200, statement_timestamp());'
);

comment on table public.customer_reservation_holds is
  'Owner-scoped short reservation intents; source inventory references remain private behind RPCs.';
comment on table public.customer_reservation_hold_mutations is
  'Owner/shop idempotency ledger for reservation create and release operations.';
comment on function public.customer_reservation_hold_create_v1(
  text, uuid, integer, uuid
) is
  'Atomically reserves private available-to-promise capacity without exposing exact inventory.';
comment on function public.customer_reservation_hold_read_v1(uuid) is
  'Owner-only reservation status read with lazy server-time expiry.';
comment on function public.customer_reservation_hold_release_v1(uuid, uuid) is
  'Idempotent monotone owner release of an active reservation hold.';

notify pgrst, 'reload schema';

commit;
