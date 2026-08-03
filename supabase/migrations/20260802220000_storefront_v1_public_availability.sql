-- TASK-024: privacy-safe public availability derived from the operational
-- inventory boundary. Exact stock remains private; public consumers receive
-- only one of the six bounded commercial states.

begin;

alter table public.storefront_settings
  add column if not exists availability_low_stock_threshold numeric(12,3)
    not null default 5;

alter table public.storefront_settings
  drop constraint if exists storefront_settings_availability_threshold_check;
alter table public.storefront_settings
  add constraint storefront_settings_availability_threshold_check check (
    availability_low_stock_threshold between 0 and 1000000
  );

create table app_private.storefront_product_availability_signals (
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  source_product_id uuid not null references public.inventory_products(id)
    on delete cascade,
  source_version bigint not null,
  signal_state text not null,
  source_kind text not null,
  source_observed_at timestamptz not null,
  expires_at timestamptz not null,
  last_idempotency_key text not null,
  last_payload_sha256 text not null,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (shop_id, source_product_id),
  constraint storefront_availability_version_check check (source_version >= 1),
  constraint storefront_availability_state_check check (
    signal_state in ('available', 'low_stock', 'unavailable')
  ),
  constraint storefront_availability_source_kind_check check (
    source_kind in ('inventory_database', 'operational_event')
  ),
  constraint storefront_availability_observed_finite_check check (
    pg_catalog.isfinite(source_observed_at)
  ),
  constraint storefront_availability_expiry_check check (
    expires_at > source_observed_at
  ),
  constraint storefront_availability_idempotency_check check (
    octet_length(last_idempotency_key) between 16 and 160
  ),
  constraint storefront_availability_digest_check check (
    last_payload_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create index storefront_availability_signal_expiry_idx
  on app_private.storefront_product_availability_signals(
    shop_id,
    expires_at,
    source_product_id
  );

revoke all on table app_private.storefront_product_availability_signals
  from public, anon, authenticated, service_role;
grant select on table app_private.storefront_product_availability_signals
  to service_role;

create or replace function app_private.storefront_inventory_signal_state_v1(
  p_stock_quantity double precision,
  p_low_stock_threshold numeric,
  p_deleted_at timestamptz
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_deleted_at is not null
      or p_stock_quantity is null
      or p_stock_quantity in (
        'Infinity'::double precision,
        '-Infinity'::double precision,
        'NaN'::double precision
      )
      or p_stock_quantity <= 0 then 'unavailable'
    when p_stock_quantity <= p_low_stock_threshold::double precision
      then 'low_stock'
    else 'available'
  end;
$$;

create or replace function app_private.storefront_effective_availability_v1(
  p_signal_state text,
  p_source_observed_at timestamptz,
  p_expires_at timestamptz,
  p_pickup_enabled boolean,
  p_delivery_enabled boolean,
  p_reservation_enabled boolean,
  p_at timestamptz
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_signal_state not in ('available', 'low_stock', 'unavailable')
      or p_source_observed_at is null
      or not pg_catalog.isfinite(p_source_observed_at)
      or p_source_observed_at > p_at + interval '5 minutes'
      or p_expires_at is null
      or p_expires_at <= p_at
      or not (
        coalesce(p_pickup_enabled, false)
        or coalesce(p_delivery_enabled, false)
        or coalesce(p_reservation_enabled, false)
      ) then 'unavailable'
    when p_signal_state = 'unavailable' then 'unavailable'
    when coalesce(p_reservation_enabled, false)
      and not coalesce(p_pickup_enabled, false)
      and not coalesce(p_delivery_enabled, false) then 'reservation_only'
    when coalesce(p_pickup_enabled, false)
      and not coalesce(p_delivery_enabled, false)
      and not coalesce(p_reservation_enabled, false) then 'pickup_only'
    when coalesce(p_delivery_enabled, false)
      and not coalesce(p_pickup_enabled, false)
      and not coalesce(p_reservation_enabled, false) then 'delivery_only'
    when p_signal_state = 'low_stock' then 'low_stock'
    else 'available'
  end;
$$;

create or replace function app_private.storefront_availability_apply_signal_v1(
  p_shop_id uuid,
  p_source_product_id uuid,
  p_source_version bigint,
  p_signal_state text,
  p_source_observed_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_source_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing app_private.storefront_product_availability_signals%rowtype;
  v_effective_version bigint;
  v_payload_sha256 text;
  v_effective_state text := 'unavailable';
  v_now timestamptz := statement_timestamp();
begin
  if p_shop_id is null
    or p_source_product_id is null
    or p_signal_state not in ('available', 'low_stock', 'unavailable')
    or p_source_kind not in ('inventory_database', 'operational_event')
    or p_source_observed_at is null
    or not pg_catalog.isfinite(p_source_observed_at)
    or p_source_observed_at > v_now + interval '5 minutes'
    or p_expires_at is null
    or p_expires_at <= p_source_observed_at
    or octet_length(coalesce(p_idempotency_key, '')) not between 16 and 160
    or (p_source_version is not null and p_source_version < 1) then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-availability.v1',
      'status', 'validation_failed'
    );
  end if;

  -- Serialize external observations with the operational inventory row. An
  -- inventory UPDATE already owns this lock before its statement trigger
  -- refreshes the private signal, so neither writer can overtake the other.
  perform 1
  from public.inventory_products product
  where product.id = p_source_product_id
    and app_private.storefront_product_matches_shop_v1(product.id, p_shop_id)
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-availability.v1',
      'status', 'scope_denied'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'storefront-availability:' || p_shop_id::text || ':' || p_source_product_id::text,
    0
  ));

  select signal.*
  into v_existing
  from app_private.storefront_product_availability_signals signal
  where signal.shop_id = p_shop_id
    and signal.source_product_id = p_source_product_id
  for update;

  v_effective_version := coalesce(
    p_source_version,
    coalesce(v_existing.source_version, 0) + 1
  );
  v_payload_sha256 := encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        p_shop_id,
        p_source_product_id,
        v_effective_version,
        p_signal_state,
        p_source_observed_at,
        p_expires_at,
        p_source_kind
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_existing.shop_id is not null then
    if v_effective_version < v_existing.source_version
      or (
        v_effective_version > v_existing.source_version
        and p_source_observed_at < v_existing.source_observed_at
      ) then
      return pg_catalog.jsonb_build_object(
        'apiVersion', 'storefront-availability.v1',
        'status', 'stale_ignored',
        'sourceVersion', v_existing.source_version
      );
    end if;

    if v_effective_version = v_existing.source_version then
      if v_payload_sha256 = v_existing.last_payload_sha256 then
        return pg_catalog.jsonb_build_object(
          'apiVersion', 'storefront-availability.v1',
          'status', 'duplicate',
          'sourceVersion', v_existing.source_version,
          'availability', app_private.storefront_effective_availability_v1(
            v_existing.signal_state,
            v_existing.source_observed_at,
            v_existing.expires_at,
            true,
            true,
            false,
            v_now
          )
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'apiVersion', 'storefront-availability.v1',
        'status', 'version_conflict',
        'sourceVersion', v_existing.source_version
      );
    end if;

    if p_idempotency_key = v_existing.last_idempotency_key then
      return pg_catalog.jsonb_build_object(
        'apiVersion', 'storefront-availability.v1',
        'status', 'idempotency_conflict',
        'sourceVersion', v_existing.source_version
      );
    end if;
  end if;

  insert into app_private.storefront_product_availability_signals (
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
  ) values (
    p_shop_id,
    p_source_product_id,
    v_effective_version,
    p_signal_state,
    p_source_kind,
    p_source_observed_at,
    p_expires_at,
    p_idempotency_key,
    v_payload_sha256,
    v_now
  )
  on conflict (shop_id, source_product_id) do update set
    source_version = excluded.source_version,
    signal_state = excluded.signal_state,
    source_kind = excluded.source_kind,
    source_observed_at = excluded.source_observed_at,
    expires_at = excluded.expires_at,
    last_idempotency_key = excluded.last_idempotency_key,
    last_payload_sha256 = excluded.last_payload_sha256,
    updated_at = excluded.updated_at;

  update public.storefront_product_publications publication
  set availability_mode = app_private.storefront_effective_availability_v1(
    p_signal_state,
    p_source_observed_at,
    p_expires_at,
    publication.pickup_enabled,
    publication.delivery_enabled,
    publication.reservation_enabled,
    v_now
  )
  where publication.shop_id = p_shop_id
    and publication.source_product_id = p_source_product_id
    and publication.availability_mode is distinct from
      app_private.storefront_effective_availability_v1(
        p_signal_state,
        p_source_observed_at,
        p_expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        v_now
      );

  select coalesce(
    (
      select app_private.storefront_effective_availability_v1(
        p_signal_state,
        p_source_observed_at,
        p_expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        v_now
      )
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.source_product_id = p_source_product_id
    ),
    'unavailable'
  ) into v_effective_state;

  return pg_catalog.jsonb_build_object(
    'apiVersion', 'storefront-availability.v1',
    'status', case when p_expires_at <= v_now
      then 'applied_stale' else 'applied' end,
    'sourceVersion', v_effective_version,
    'availability', v_effective_state
  );
end;
$$;

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
begin
  if p_expires_at is null
    or not pg_catalog.isfinite(p_expires_at)
    or p_expires_at > p_source_observed_at + interval '24 hours' then
    return pg_catalog.jsonb_build_object(
      'apiVersion', 'storefront-availability.v1',
      'status', 'validation_failed'
    );
  end if;

  return app_private.storefront_availability_apply_signal_v1(
    p_shop_id,
    p_source_product_id,
    p_source_version,
    p_signal_state,
    p_source_observed_at,
    p_expires_at,
    p_idempotency_key,
    'operational_event'
  );
end;
$$;

revoke all on function app_private.storefront_inventory_signal_state_v1(
  double precision, numeric, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_effective_availability_v1(
  text, timestamptz, timestamptz, boolean, boolean, boolean, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_availability_apply_signal_v1(
  uuid, uuid, bigint, text, timestamptz, timestamptz, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.storefront_availability_ingest_v1(
  uuid, uuid, bigint, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.storefront_availability_ingest_v1(
  uuid, uuid, bigint, text, timestamptz, timestamptz, text
) to service_role;

create or replace function app_private.storefront_publication_availability_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signal app_private.storefront_product_availability_signals%rowtype;
begin
  select signal.*
  into v_signal
  from app_private.storefront_product_availability_signals signal
  where signal.shop_id = new.shop_id
    and signal.source_product_id = new.source_product_id;

  new.availability_mode := app_private.storefront_effective_availability_v1(
    v_signal.signal_state,
    v_signal.source_observed_at,
    v_signal.expires_at,
    new.pickup_enabled,
    new.delivery_enabled,
    new.reservation_enabled,
    statement_timestamp()
  );
  return new;
end;
$$;

drop trigger if exists storefront_publication_availability_guard
  on public.storefront_product_publications;
create trigger storefront_publication_availability_guard
  before insert or update on public.storefront_product_publications
  for each row execute function
    app_private.storefront_publication_availability_guard_v1();

create or replace function app_private.storefront_inventory_availability_sync_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  with changed_products as materialized (
    select current.*
    from storefront_availability_inventory_new_rows current
    join storefront_availability_inventory_old_rows previous
      on previous.id = current.id
    where current.stock_quantity is distinct from previous.stock_quantity
      or current.deleted_at is distinct from previous.deleted_at
      or current.shop_id is distinct from previous.shop_id
      or current.owner_user_id is distinct from previous.owner_user_id
  ), candidates as materialized (
    select distinct on (publication.shop_id, product.id)
      publication.shop_id,
      product.id as source_product_id,
      app_private.storefront_inventory_signal_state_v1(
        product.stock_quantity,
        setting.availability_low_stock_threshold,
        product.deleted_at
      ) as signal_state,
      coalesce(product.updated_at, v_now) as source_observed_at
    from changed_products product
    join public.storefront_product_publications publication
      on publication.source_product_id = product.id
    join public.storefront_settings setting
      on setting.shop_id = publication.shop_id
    order by publication.shop_id, product.id
  ), canonical as (
    select
      candidate.*,
      'inventory:' || encode(extensions.digest(
        pg_catalog.convert_to(pg_catalog.jsonb_build_array(
          candidate.source_product_id,
          candidate.source_observed_at,
          candidate.signal_state,
          txid_current()
        )::text, 'UTF8'),
        'sha256'
      ), 'hex') as idempotency_key
    from candidates candidate
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
    canonical.shop_id,
    canonical.source_product_id,
    1,
    canonical.signal_state,
    'inventory_database',
    canonical.source_observed_at,
    'infinity'::timestamptz,
    canonical.idempotency_key,
    encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        canonical.shop_id,
        canonical.source_product_id,
        1,
        canonical.signal_state,
        canonical.source_observed_at,
        'infinity'::timestamptz,
        'inventory_database'
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    v_now
  from canonical
  on conflict (shop_id, source_product_id) do update set
    source_version = signal.source_version + 1,
    signal_state = excluded.signal_state,
    source_kind = excluded.source_kind,
    source_observed_at = greatest(
      signal.source_observed_at,
      excluded.source_observed_at
    ),
    expires_at = excluded.expires_at,
    last_idempotency_key = excluded.last_idempotency_key,
    last_payload_sha256 = encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        excluded.shop_id,
        excluded.source_product_id,
        signal.source_version + 1,
        excluded.signal_state,
        greatest(signal.source_observed_at, excluded.source_observed_at),
        excluded.expires_at,
        excluded.source_kind
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    updated_at = excluded.updated_at
  where excluded.source_observed_at >= signal.source_observed_at;

  update public.storefront_product_publications publication
  set availability_mode = app_private.storefront_effective_availability_v1(
    signal.signal_state,
    signal.source_observed_at,
    signal.expires_at,
    publication.pickup_enabled,
    publication.delivery_enabled,
    publication.reservation_enabled,
    v_now
  )
  from app_private.storefront_product_availability_signals signal
  where signal.shop_id = publication.shop_id
    and signal.source_product_id = publication.source_product_id
    and exists (
      select 1
      from storefront_availability_inventory_new_rows changed
      join storefront_availability_inventory_old_rows previous
        on previous.id = changed.id
      where changed.id = publication.source_product_id
        and (
          changed.stock_quantity is distinct from previous.stock_quantity
          or changed.deleted_at is distinct from previous.deleted_at
          or changed.shop_id is distinct from previous.shop_id
          or changed.owner_user_id is distinct from previous.owner_user_id
        )
    )
    and publication.availability_mode is distinct from
      app_private.storefront_effective_availability_v1(
        signal.signal_state,
        signal.source_observed_at,
        signal.expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        v_now
      );

  return null;
end;
$$;

drop trigger if exists storefront_inventory_availability_insert
  on public.inventory_products;
drop trigger if exists storefront_inventory_availability_update
  on public.inventory_products;
create trigger storefront_inventory_availability_update
  after update on public.inventory_products
  referencing old table as storefront_availability_inventory_old_rows
    new table as storefront_availability_inventory_new_rows
  for each statement execute function
    app_private.storefront_inventory_availability_sync_v1();

create or replace function app_private.storefront_publication_availability_seed_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
begin
  with candidates as materialized (
    select distinct on (publication.shop_id, publication.source_product_id)
      publication.shop_id,
      publication.source_product_id,
      app_private.storefront_inventory_signal_state_v1(
        product.stock_quantity,
        setting.availability_low_stock_threshold,
        product.deleted_at
      ) as signal_state,
      coalesce(product.updated_at, v_now) as source_observed_at
    from storefront_availability_publication_inserted_rows inserted
    join public.storefront_product_publications publication
      on publication.id = inserted.id
    join public.inventory_products product
      on product.id = publication.source_product_id
    join public.storefront_settings setting
      on setting.shop_id = publication.shop_id
    order by publication.shop_id, publication.source_product_id
  ), canonical as (
    select
      candidate.*,
      'inventory:' || encode(extensions.digest(
        pg_catalog.convert_to(pg_catalog.jsonb_build_array(
          candidate.source_product_id,
          candidate.source_observed_at,
          candidate.signal_state,
          'publication-seed'
        )::text, 'UTF8'),
        'sha256'
      ), 'hex') as idempotency_key
    from candidates candidate
  )
  insert into app_private.storefront_product_availability_signals (
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
    canonical.shop_id,
    canonical.source_product_id,
    1,
    canonical.signal_state,
    'inventory_database',
    canonical.source_observed_at,
    'infinity'::timestamptz,
    canonical.idempotency_key,
    encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        canonical.shop_id,
        canonical.source_product_id,
        1,
        canonical.signal_state,
        canonical.source_observed_at,
        'infinity'::timestamptz,
        'inventory_database'
      )::text, 'UTF8'),
      'sha256'
    ), 'hex'),
    v_now
  from canonical
  on conflict (shop_id, source_product_id) do nothing;

  update public.storefront_product_publications publication
  set availability_mode = app_private.storefront_effective_availability_v1(
    signal.signal_state,
    signal.source_observed_at,
    signal.expires_at,
    publication.pickup_enabled,
    publication.delivery_enabled,
    publication.reservation_enabled,
    v_now
  )
  from app_private.storefront_product_availability_signals signal
  where signal.shop_id = publication.shop_id
    and signal.source_product_id = publication.source_product_id
    and exists (
      select 1
      from storefront_availability_publication_inserted_rows inserted
      where inserted.id = publication.id
    )
    and publication.availability_mode is distinct from
      app_private.storefront_effective_availability_v1(
        signal.signal_state,
        signal.source_observed_at,
        signal.expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        v_now
      );
  return null;
end;
$$;

drop trigger if exists storefront_publication_availability_seed
  on public.storefront_product_publications;
create trigger storefront_publication_availability_seed
  after insert on public.storefront_product_publications
  referencing new table as storefront_availability_publication_inserted_rows
  for each statement execute function
    app_private.storefront_publication_availability_seed_v1();

revoke all on function app_private.storefront_publication_availability_guard_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_inventory_availability_sync_v1()
  from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_publication_availability_seed_v1()
  from public, anon, authenticated, service_role;

-- Re-resolve availability from the private signal at request time. This makes
-- missing, expired and future-dated observations fail closed for cart and
-- checkout consumers even before a projection maintenance pass runs.
create or replace function app_private.storefront_catalog_source_v1(
  p_publication_id uuid default null,
  p_shop_id uuid default null,
  p_at timestamptz default statement_timestamp()
)
returns table (
  publication_id uuid,
  shop_id uuid,
  shop_slug text,
  storefront_enabled boolean,
  shop_pickup_enabled boolean,
  shop_delivery_enabled boolean,
  shop_reservation_enabled boolean,
  category_id uuid,
  category_slug text,
  category_name text,
  category_sort_rank bigint,
  public_name text,
  public_description text,
  public_brand text,
  price_clp bigint,
  compare_at_price_clp bigint,
  discount_bps integer,
  promotion_id uuid,
  promotion_name text,
  promotion_starts_at timestamptz,
  promotion_ends_at timestamptz,
  featured boolean,
  sort_rank bigint,
  pickup_enabled boolean,
  delivery_enabled boolean,
  reservation_enabled boolean,
  availability_mode text,
  image_version_key text,
  image_thumb_url text,
  image_card_url text,
  image_detail_url text,
  image_content_sha256 text,
  search_text text,
  search_document tsvector,
  published_at timestamptz,
  public_updated_at timestamptz,
  content_sha256 text
)
language sql
stable
security definer
set search_path = ''
as $$
  with source_rows as (
    select
      publication.id as publication_id,
      publication.shop_id,
      setting.public_slug as shop_slug,
      setting.storefront_enabled,
      setting.pickup_enabled as shop_pickup_enabled,
      setting.delivery_enabled as shop_delivery_enabled,
      setting.reservation_enabled as shop_reservation_enabled,
      category.id as category_id,
      category.slug as category_slug,
      category.public_name as category_name,
      category.sort_rank as category_sort_rank,
      btrim(publication.public_name) as public_name,
      nullif(btrim(publication.public_description), '') as public_description,
      nullif(btrim(publication.public_brand), '') as public_brand,
      publication.retail_price_clp,
      publication.compare_at_price_clp as publication_compare_at_price_clp,
      promotion.id as promotion_id,
      promotion.public_name as promotion_name,
      promotion.starts_at as promotion_starts_at,
      promotion.ends_at as promotion_ends_at,
      promotion.effective_price_clp,
      publication.featured,
      publication.sort_rank,
      publication.pickup_enabled,
      publication.delivery_enabled,
      publication.reservation_enabled,
      app_private.storefront_effective_availability_v1(
        availability.signal_state,
        availability.source_observed_at,
        availability.expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        p_at
      ) as availability_mode,
      image_publication.version_key as image_version_key,
      image_publication.thumb_url as image_thumb_url,
      image_publication.card_url as image_card_url,
      image_publication.detail_url as image_detail_url,
      image_publication.content_sha256 as image_content_sha256,
      publication.published_at,
      greatest(
        publication.updated_at,
        category.updated_at,
        setting.updated_at,
        coalesce(image_publication.updated_at, '-infinity'::timestamptz),
        coalesce(promotion.updated_at, '-infinity'::timestamptz),
        coalesce(availability.updated_at, '-infinity'::timestamptz)
      ) as public_updated_at
    from public.storefront_product_publications publication
    join public.storefront_settings setting
      on setting.shop_id = publication.shop_id
    join public.storefront_categories category
      on category.shop_id = publication.shop_id
      and category.id = publication.public_category_id
      and category.publication_status = 'published'
    left join app_private.storefront_product_availability_signals availability
      on availability.shop_id = publication.shop_id
      and availability.source_product_id = publication.source_product_id
    left join public.storefront_image_publications image_publication
      on image_publication.shop_id = publication.shop_id
      and image_publication.id = publication.published_image_version_id
      and image_publication.publication_status = 'published'
    left join lateral (
      select candidate.*
      from (
        select
          promotion_row.id,
          btrim(promotion_row.public_name) as public_name,
          promotion_row.starts_at,
          promotion_row.ends_at,
          promotion_row.updated_at,
          promotion_row.priority,
          case promotion_row.discount_type
            when 'fixed_price_clp' then least(
              publication.retail_price_clp,
              promotion_row.discount_value
            )
            else greatest(
              0::bigint,
              floor(
                publication.retail_price_clp::numeric
                * (10000 - promotion_row.discount_value)::numeric
                / 10000
              )::bigint
            )
          end as effective_price_clp
        from public.storefront_promotion_products promotion_link
        join public.storefront_promotions promotion_row
          on promotion_row.shop_id = promotion_link.shop_id
          and promotion_row.id = promotion_link.promotion_id
        where promotion_link.shop_id = publication.shop_id
          and promotion_link.publication_id = publication.id
          and not promotion_link.excluded
          and promotion_row.publication_status = 'active'
          and promotion_row.starts_at <= p_at
          and promotion_row.ends_at > p_at
      ) candidate
      where candidate.effective_price_clp < publication.retail_price_clp
      order by
        candidate.effective_price_clp,
        candidate.priority desc,
        candidate.id
      limit 1
    ) promotion on true
    where publication.publication_status = 'published'
      and publication.published_at is not null
      and (p_publication_id is null or publication.id = p_publication_id)
      and (p_shop_id is null or publication.shop_id = p_shop_id)
  ),
  priced_rows as (
    select
      source.*,
      coalesce(source.effective_price_clp, source.retail_price_clp) as price_clp,
      case
        when source.effective_price_clp is not null then greatest(
          source.retail_price_clp,
          coalesce(
            source.publication_compare_at_price_clp,
            source.retail_price_clp
          )
        )
        else source.publication_compare_at_price_clp
      end as compare_at_price_clp
    from source_rows source
  ),
  searchable_rows as (
    select
      priced.*,
      btrim(regexp_replace(
        lower(extensions.unaccent(concat_ws(
          ' ',
          priced.public_name,
          priced.public_description,
          priced.public_brand,
          priced.category_name,
          priced.category_slug,
          priced.promotion_name
        ))),
        '[[:space:]]+',
        ' ',
        'g'
      )) as search_text
    from priced_rows priced
  ),
  projected_rows as (
    select
      searchable.*,
      case
        when searchable.compare_at_price_clp is not null
          and searchable.compare_at_price_clp > searchable.price_clp
        then least(
          10000,
          floor(
            (
              searchable.compare_at_price_clp - searchable.price_clp
            )::numeric
            * 10000
            / searchable.compare_at_price_clp
          )::integer
        )
        else null
      end as discount_bps,
      pg_catalog.to_tsvector('simple'::regconfig, searchable.search_text)
        as search_document
    from searchable_rows searchable
  )
  select
    projected.publication_id,
    projected.shop_id,
    projected.shop_slug,
    projected.storefront_enabled,
    projected.shop_pickup_enabled,
    projected.shop_delivery_enabled,
    projected.shop_reservation_enabled,
    projected.category_id,
    projected.category_slug,
    projected.category_name,
    projected.category_sort_rank,
    projected.public_name,
    projected.public_description,
    projected.public_brand,
    projected.price_clp,
    projected.compare_at_price_clp,
    projected.discount_bps,
    projected.promotion_id,
    projected.promotion_name,
    projected.promotion_starts_at,
    projected.promotion_ends_at,
    projected.featured,
    projected.sort_rank,
    projected.pickup_enabled,
    projected.delivery_enabled,
    projected.reservation_enabled,
    projected.availability_mode,
    projected.image_version_key,
    projected.image_thumb_url,
    projected.image_card_url,
    projected.image_detail_url,
    projected.image_content_sha256,
    projected.search_text,
    projected.search_document,
    projected.published_at,
    projected.public_updated_at,
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          jsonb_build_array(
            projected.publication_id,
            projected.shop_id,
            projected.shop_slug,
            projected.storefront_enabled,
            projected.shop_pickup_enabled,
            projected.shop_delivery_enabled,
            projected.shop_reservation_enabled,
            projected.category_id,
            projected.category_slug,
            projected.category_name,
            projected.category_sort_rank,
            projected.public_name,
            projected.public_description,
            projected.public_brand,
            projected.price_clp,
            projected.compare_at_price_clp,
            projected.discount_bps,
            projected.promotion_id,
            projected.promotion_name,
            projected.promotion_starts_at,
            projected.promotion_ends_at,
            projected.featured,
            projected.sort_rank,
            projected.pickup_enabled,
            projected.delivery_enabled,
            projected.reservation_enabled,
            projected.availability_mode,
            projected.image_version_key,
            projected.image_thumb_url,
            projected.image_card_url,
            projected.image_detail_url,
            projected.image_content_sha256,
            projected.search_text,
            projected.published_at,
            projected.public_updated_at
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as content_sha256
  from projected_rows projected;
$$;

-- Public catalog/search/detail/home reads share this set-based resolver, so
-- one availability calculation covers every public response and filter.
create or replace function app_private.storefront_public_catalog_rows_scoped_v1(
  p_shop_id uuid,
  p_at timestamptz,
  p_publication_ids uuid[]
)
returns table (
  payload jsonb,
  publication_id uuid,
  category_id uuid,
  category_slug text,
  category_name text,
  category_sort_rank bigint,
  price_clp bigint,
  discount_bps integer,
  featured boolean,
  availability_mode text,
  sort_rank bigint,
  name_key text,
  search_text text,
  search_document tsvector
)
language sql
stable
security invoker
as $$
  with promotion_candidates as (
    select
      publication.id as publication_id,
      publication.retail_price_clp as base_price_clp,
      promotion_row.id as promotion_id,
      pg_catalog.btrim(promotion_row.public_name) as public_name,
      promotion_row.starts_at,
      promotion_row.ends_at,
      promotion_row.priority,
      case promotion_row.discount_type
        when 'fixed_price_clp' then least(
          publication.retail_price_clp,
          promotion_row.discount_value
        )
        else greatest(
          0::bigint,
          floor(
            publication.retail_price_clp::numeric
            * (10000 - promotion_row.discount_value)::numeric
            / 10000
          )::bigint
        )
      end as effective_price_clp
    from public.storefront_product_publications publication
    join public.storefront_promotion_products promotion_link
      on promotion_link.shop_id = publication.shop_id
     and promotion_link.publication_id = publication.id
     and not promotion_link.excluded
    join public.storefront_promotions promotion_row
      on promotion_row.shop_id = promotion_link.shop_id
     and promotion_row.id = promotion_link.promotion_id
     and promotion_row.publication_status in ('scheduled', 'active')
     and promotion_row.starts_at <= p_at
     and promotion_row.ends_at > p_at
    where publication.shop_id = p_shop_id
      and publication.publication_status = 'published'
      and publication.published_at is not null
  ),
  current_promotions as (
    select distinct on (candidate.publication_id)
      candidate.publication_id,
      candidate.promotion_id,
      candidate.public_name,
      candidate.starts_at,
      candidate.ends_at,
      candidate.effective_price_clp
    from promotion_candidates candidate
    where candidate.effective_price_clp < candidate.base_price_clp
    order by
      candidate.publication_id,
      candidate.effective_price_clp,
      candidate.priority desc,
      candidate.promotion_id
  ),
  current_rows as (
    select
      item.*,
      publication.retail_price_clp as base_price_clp,
      publication.compare_at_price_clp as base_compare_at_price_clp,
      setting.pickup_enabled as current_shop_pickup_enabled,
      setting.delivery_enabled as current_shop_delivery_enabled,
      setting.reservation_enabled as current_shop_reservation_enabled,
      app_private.storefront_effective_availability_v1(
        availability.signal_state,
        availability.source_observed_at,
        availability.expires_at,
        publication.pickup_enabled,
        publication.delivery_enabled,
        publication.reservation_enabled,
        p_at
      ) as current_availability_mode,
      greatest(
        item.public_updated_at,
        coalesce(availability.updated_at, '-infinity'::timestamptz)
      ) as current_public_updated_at,
      promotion.promotion_id as current_promotion_id,
      promotion.public_name as current_promotion_name,
      promotion.starts_at as current_promotion_starts_at,
      promotion.ends_at as current_promotion_ends_at,
      promotion.effective_price_clp
    from public.storefront_catalog_items item
    join public.storefront_product_publications publication
      on publication.shop_id = item.shop_id
     and publication.id = item.publication_id
     and publication.publication_status = 'published'
     and publication.published_at is not null
    join public.storefront_settings setting
      on setting.shop_id = item.shop_id
     and setting.storefront_enabled
    left join app_private.storefront_product_availability_signals availability
      on availability.shop_id = publication.shop_id
     and availability.source_product_id = publication.source_product_id
    left join current_promotions promotion
      on promotion.publication_id = publication.id
    where item.shop_id = p_shop_id
      and item.storefront_enabled
      and (
        p_publication_ids is null
        or item.publication_id = any(p_publication_ids)
      )
  ),
  priced_rows as (
    select
      current.*,
      coalesce(current.effective_price_clp, current.base_price_clp) as current_price_clp,
      case
        when current.effective_price_clp is not null then greatest(
          current.base_price_clp,
          coalesce(current.base_compare_at_price_clp, current.base_price_clp)
        )
        else current.base_compare_at_price_clp
      end as current_compare_at_price_clp
    from current_rows current
  ),
  discounted_rows as (
    select
      priced.*,
      case
        when priced.current_compare_at_price_clp is not null
          and priced.current_compare_at_price_clp > priced.current_price_clp
        then least(
          10000,
          floor(
            (
              priced.current_compare_at_price_clp - priced.current_price_clp
            )::numeric * 10000
            / priced.current_compare_at_price_clp
          )::integer
        )
        else null::integer
      end as current_discount_bps
    from priced_rows priced
  )
  select
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id', row.publication_id,
      'category', pg_catalog.jsonb_build_object(
        'id', row.category_id,
        'slug', row.category_slug,
        'name', row.category_name
      ),
      'name', row.public_name,
      'description', row.public_description,
      'brand', row.public_brand,
      'barcode', row.public_barcode,
      'priceClp', row.current_price_clp,
      'compareAtPriceClp', row.current_compare_at_price_clp,
      'discountBps', row.current_discount_bps,
      'promotion', case
        when row.current_promotion_id is null then null
        else pg_catalog.jsonb_build_object(
          'id', row.current_promotion_id,
          'name', row.current_promotion_name,
          'startsAt', row.current_promotion_starts_at,
          'endsAt', row.current_promotion_ends_at
        )
      end,
      'featured', row.featured,
      'sortRank', row.sort_rank,
      'availability', row.current_availability_mode,
      'fulfillment', pg_catalog.jsonb_build_object(
        'pickup', row.pickup_enabled and row.current_shop_pickup_enabled,
        'delivery', row.delivery_enabled and row.current_shop_delivery_enabled,
        'reservation', row.reservation_enabled and row.current_shop_reservation_enabled
      ),
      'images', case
        when row.image_version_key is null then null
        else pg_catalog.jsonb_build_object(
          'version', row.image_version_key,
          'thumb', row.image_thumb_url,
          'card', row.image_card_url,
          'detail', row.image_detail_url,
          'sha256', row.image_content_sha256
        )
      end,
      'catalogVersion', row.catalog_version,
      'publishedAt', row.published_at,
      'updatedAt', row.current_public_updated_at
    )),
    row.publication_id,
    row.category_id,
    row.category_slug,
    row.category_name,
    row.category_sort_rank,
    row.current_price_clp,
    row.current_discount_bps,
    row.featured,
    row.current_availability_mode,
    row.sort_rank,
    pg_catalog.lower(row.public_name),
    row.search_text,
    row.search_document
  from discounted_rows row;
$$;

alter function app_private.storefront_public_catalog_rows_scoped_v1(
  uuid, timestamptz, uuid[]
) reset search_path;

revoke all on function app_private.storefront_public_catalog_rows_scoped_v1(
  uuid, timestamptz, uuid[]
) from public, anon, authenticated, service_role;

-- Existing publications receive one transactionally derived snapshot. No
-- exact quantity is copied into the signal table or any public projection.
with candidates as (
  select distinct on (publication.shop_id, publication.source_product_id)
    publication.shop_id,
    publication.source_product_id,
    app_private.storefront_inventory_signal_state_v1(
      product.stock_quantity,
      setting.availability_low_stock_threshold,
      product.deleted_at
    ) as signal_state,
    product.updated_at as source_observed_at
  from public.storefront_product_publications publication
  join public.inventory_products product
    on product.id = publication.source_product_id
  join public.storefront_settings setting
    on setting.shop_id = publication.shop_id
  order by publication.shop_id, publication.source_product_id
), canonical as (
  select
    candidate.*,
    'inventory:' || encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        candidate.source_product_id,
        candidate.source_observed_at,
        candidate.signal_state,
        'migration-backfill'
      )::text, 'UTF8'),
      'sha256'
    ), 'hex') as idempotency_key
  from candidates candidate
)
insert into app_private.storefront_product_availability_signals (
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
  canonical.shop_id,
  canonical.source_product_id,
  1,
  canonical.signal_state,
  'inventory_database',
  canonical.source_observed_at,
  'infinity'::timestamptz,
  canonical.idempotency_key,
  encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      canonical.shop_id,
      canonical.source_product_id,
      1,
      canonical.signal_state,
      canonical.source_observed_at,
      'infinity'::timestamptz,
      'inventory_database'
    )::text, 'UTF8'),
    'sha256'
  ), 'hex'),
  statement_timestamp()
from canonical
on conflict (shop_id, source_product_id) do nothing;

update public.storefront_product_publications publication
set availability_mode = app_private.storefront_effective_availability_v1(
  availability.signal_state,
  availability.source_observed_at,
  availability.expires_at,
  publication.pickup_enabled,
  publication.delivery_enabled,
  publication.reservation_enabled,
  statement_timestamp()
)
from app_private.storefront_product_availability_signals availability
where availability.shop_id = publication.shop_id
  and availability.source_product_id = publication.source_product_id
  and publication.availability_mode is distinct from
    app_private.storefront_effective_availability_v1(
      availability.signal_state,
      availability.source_observed_at,
      availability.expires_at,
      publication.pickup_enabled,
      publication.delivery_enabled,
      publication.reservation_enabled,
      statement_timestamp()
    );

select app_private.storefront_catalog_rebuild_shop_v1(
  setting.shop_id,
  statement_timestamp()
)
from public.storefront_settings setting;

commit;
