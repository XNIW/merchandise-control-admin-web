-- Storefront v1 / TASK-010
--
-- Versioned, customer-safe read contract over the TASK-006 projection. Mobile
-- roles receive EXECUTE only; authoring, projection and inventory tables remain
-- inaccessible. Promotions are resolved again at read time so scheduled starts
-- and expirations cannot leave stale public prices between projection rebuilds.

begin;

create or replace function app_private.storefront_public_search_aliases_valid_v1(
  p_aliases text[]
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_aliases is not null
    and pg_catalog.cardinality(p_aliases) <= 20
    and coalesce(
      (
        select pg_catalog.bool_and(
          alias is not null
          and pg_catalog.length(pg_catalog.btrim(alias)) between 1 and 80
          and alias !~ '[[:cntrl:]]'
        )
        from pg_catalog.unnest(p_aliases) alias
      ),
      true
    );
$$;

revoke all on function app_private.storefront_public_search_aliases_valid_v1(text[])
  from public, anon, authenticated, service_role;
grant execute on function app_private.storefront_public_search_aliases_valid_v1(text[])
  to service_role;

alter table public.storefront_product_publications
  add column public_barcode text,
  add column public_search_aliases text[] not null default '{}'::text[],
  add constraint storefront_product_publications_public_barcode_check check (
    public_barcode is null
    or (
      pg_catalog.length(pg_catalog.btrim(public_barcode)) between 1 and 64
      and public_barcode !~ '[[:cntrl:][:space:]]'
    )
  ),
  add constraint storefront_product_publications_search_aliases_check check (
    app_private.storefront_public_search_aliases_valid_v1(public_search_aliases)
  );

alter table public.storefront_catalog_items
  add column public_barcode text,
  add column public_search_aliases text[] not null default '{}'::text[],
  add constraint storefront_catalog_items_public_barcode_check check (
    public_barcode is null
    or (
      pg_catalog.length(pg_catalog.btrim(public_barcode)) between 1 and 64
      and public_barcode !~ '[[:cntrl:][:space:]]'
    )
  ),
  add constraint storefront_catalog_items_search_aliases_check check (
    app_private.storefront_public_search_aliases_valid_v1(public_search_aliases)
  );

create index storefront_catalog_items_shop_catalog_keyset_v1_idx
  on public.storefront_catalog_items(
    shop_id,
    sort_rank,
    pg_catalog.lower(public_name),
    publication_id
  );
create index storefront_catalog_items_shop_name_keyset_v1_idx
  on public.storefront_catalog_items(
    shop_id,
    pg_catalog.lower(public_name),
    publication_id
  );

create or replace function app_private.storefront_catalog_public_search_fields_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication record;
begin
  select
    source.public_barcode,
    source.public_search_aliases
  into publication
  from public.storefront_product_publications source
  where source.shop_id = new.shop_id
    and source.id = new.publication_id;

  if not found then
    raise exception 'Storefront projection publication scope is invalid'
      using errcode = '23503';
  end if;

  new.public_barcode := nullif(pg_catalog.btrim(publication.public_barcode), '');
  new.public_search_aliases := publication.public_search_aliases;

  if tg_op = 'INSERT' then
    new.search_text := pg_catalog.btrim(pg_catalog.regexp_replace(
      pg_catalog.lower(extensions.unaccent(pg_catalog.concat_ws(
        ' ',
        new.search_text,
        new.public_barcode,
        pg_catalog.array_to_string(new.public_search_aliases, ' ')
      ))),
      '[[:space:]]+',
      ' ',
      'g'
    ));
    new.search_document := pg_catalog.to_tsvector('simple', new.search_text);
  end if;

  return new;
end;
$$;

revoke all on function app_private.storefront_catalog_public_search_fields_v1()
  from public, anon, authenticated, service_role;

create trigger storefront_catalog_items_public_search_fields_v1
  before insert or update on public.storefront_catalog_items
  for each row
  execute function app_private.storefront_catalog_public_search_fields_v1();

do $backfill$
declare
  current_shop record;
begin
  for current_shop in
    select setting.shop_id
    from public.storefront_settings setting
    order by setting.shop_id
  loop
    perform app_private.storefront_catalog_rebuild_shop_v1(
      current_shop.shop_id,
      statement_timestamp()
    );
  end loop;
end;
$backfill$;

create or replace function app_private.storefront_public_shop_v1(
  p_shop_slug text
)
returns table (
  shop_id uuid,
  public_slug text,
  default_page_size integer,
  maximum_page_size integer,
  currency_code text,
  catalog_locale text,
  catalog_time_zone text,
  pickup_enabled boolean,
  delivery_enabled boolean,
  reservation_enabled boolean,
  catalog_version bigint,
  item_count bigint,
  catalog_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    setting.shop_id,
    setting.public_slug,
    setting.default_page_size,
    setting.maximum_page_size,
    setting.currency_code,
    setting.catalog_locale,
    setting.catalog_time_zone,
    setting.pickup_enabled,
    setting.delivery_enabled,
    setting.reservation_enabled,
    coalesce(version.catalog_version, 0::bigint),
    coalesce(version.item_count, 0::bigint),
    coalesce(version.updated_at, setting.updated_at)
  from public.storefront_settings setting
  left join public.storefront_catalog_versions version
    on version.shop_id = setting.shop_id
  where setting.public_slug = p_shop_slug
    and setting.storefront_enabled;
$$;

revoke all on function app_private.storefront_public_shop_v1(text)
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_cursor_encode_v1(
  p_sort_mode text,
  p_catalog_version bigint,
  p_number_key bigint,
  p_secondary_number_key bigint,
  p_text_key text,
  p_row_id uuid
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.rtrim(
    pg_catalog.translate(
      pg_catalog.replace(
        pg_catalog.encode(
          pg_catalog.convert_to(
            pg_catalog.jsonb_build_object(
              'v', 1,
              'sort', p_sort_mode,
              'cv', p_catalog_version::text,
              'k1', p_number_key::text,
              'k2', p_secondary_number_key::text,
              'text', p_text_key,
              'id', p_row_id::text
            )::text,
            'UTF8'
          ),
          'base64'
        ),
        pg_catalog.chr(10),
        ''
      ),
      '+/',
      '-_'
    ),
    '='
  );
$$;

revoke all on function app_private.storefront_cursor_encode_v1(
  text, bigint, bigint, bigint, text, uuid
) from public, anon, authenticated, service_role;

create or replace function app_private.storefront_cursor_decode_v1(
  p_cursor text
)
returns table (
  valid boolean,
  sort_mode text,
  catalog_version bigint,
  number_key bigint,
  secondary_number_key bigint,
  text_key text,
  row_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  padded_cursor text;
begin
  if p_cursor is null then
    valid := true;
    sort_mode := null;
    catalog_version := null;
    number_key := null;
    secondary_number_key := null;
    text_key := null;
    row_id := null;
    return next;
    return;
  end if;

  if pg_catalog.length(p_cursor) not between 24 and 768
    or p_cursor !~ '^[A-Za-z0-9_-]+$'
  then
    valid := false;
    return next;
    return;
  end if;

  begin
    padded_cursor := pg_catalog.translate(p_cursor, '-_', '+/')
      || pg_catalog.repeat('=', (4 - pg_catalog.length(p_cursor) % 4) % 4);
    payload := pg_catalog.convert_from(
      pg_catalog.decode(padded_cursor, 'base64'),
      'UTF8'
    )::jsonb;

    if pg_catalog.jsonb_typeof(payload) <> 'object'
      or payload ->> 'v' <> '1'
      or payload ->> 'sort' not in (
        'category', 'catalog', 'name', 'price_asc', 'price_desc', 'search'
      )
      or payload ->> 'cv' !~ '^[0-9]{1,19}$'
      or payload ->> 'k1' !~ '^-?[0-9]{1,19}$'
      or payload ->> 'k2' !~ '^-?[0-9]{1,19}$'
      or pg_catalog.length(payload ->> 'text') > 240
      or payload ->> 'id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      valid := false;
      return next;
      return;
    end if;

    sort_mode := payload ->> 'sort';
    catalog_version := (payload ->> 'cv')::bigint;
    number_key := (payload ->> 'k1')::bigint;
    secondary_number_key := (payload ->> 'k2')::bigint;
    text_key := payload ->> 'text';
    row_id := (payload ->> 'id')::uuid;
    valid := catalog_version >= 0 and row_id is not null;
    return next;
  exception
    when others then
      valid := false;
      sort_mode := null;
      catalog_version := null;
      number_key := null;
      secondary_number_key := null;
      text_key := null;
      row_id := null;
      return next;
  end;
end;
$$;

revoke all on function app_private.storefront_cursor_decode_v1(text)
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_public_catalog_rows_v1(
  p_shop_id uuid,
  p_at timestamptz default statement_timestamp()
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
security definer
set search_path = ''
as $$
  with current_rows as (
    select
      item.*,
      publication.retail_price_clp as base_price_clp,
      publication.compare_at_price_clp as base_compare_at_price_clp,
      setting.pickup_enabled as current_shop_pickup_enabled,
      setting.delivery_enabled as current_shop_delivery_enabled,
      setting.reservation_enabled as current_shop_reservation_enabled,
      promotion.id as current_promotion_id,
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
    left join lateral (
      select candidate.*
      from (
        select
          promotion_row.id,
          btrim(promotion_row.public_name) as public_name,
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
        from public.storefront_promotion_products promotion_link
        join public.storefront_promotions promotion_row
          on promotion_row.shop_id = promotion_link.shop_id
         and promotion_row.id = promotion_link.promotion_id
        where promotion_link.shop_id = publication.shop_id
          and promotion_link.publication_id = publication.id
          and not promotion_link.excluded
          and promotion_row.publication_status in ('scheduled', 'active')
          and promotion_row.starts_at <= p_at
          and promotion_row.ends_at > p_at
      ) candidate
      where candidate.effective_price_clp < publication.retail_price_clp
      order by candidate.effective_price_clp, candidate.priority desc, candidate.id
      limit 1
    ) promotion on true
    where item.shop_id = p_shop_id
      and item.storefront_enabled
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
      'availability', row.availability_mode,
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
      'updatedAt', row.public_updated_at
    )),
    row.publication_id,
    row.category_id,
    row.category_slug,
    row.category_name,
    row.category_sort_rank,
    row.current_price_clp,
    row.current_discount_bps,
    row.featured,
    row.availability_mode,
    row.sort_rank,
    pg_catalog.lower(row.public_name),
    row.search_text,
    row.search_document
  from discounted_rows row;
$$;

revoke all on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.storefront_catalog_version_v1(
  p_shop_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  resolved record;
begin
  if p_shop_slug is null
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into resolved
  from app_private.storefront_public_shop_v1(p_shop_slug);

  if not found then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'catalogVersion', resolved.catalog_version,
    'itemCount', resolved.item_count,
    'updatedAt', resolved.catalog_updated_at
  );
end;
$$;

create or replace function public.storefront_settings_v1(
  p_shop_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  resolved record;
begin
  if p_shop_slug is null
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into resolved
  from app_private.storefront_public_shop_v1(p_shop_slug);

  if not found then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'shopSlug', resolved.public_slug,
    'currency', resolved.currency_code,
    'locale', resolved.catalog_locale,
    'timeZone', resolved.catalog_time_zone,
    'defaultPageSize', resolved.default_page_size,
    'maximumPageSize', resolved.maximum_page_size,
    'fulfillment', pg_catalog.jsonb_build_object(
      'pickup', resolved.pickup_enabled,
      'delivery', resolved.delivery_enabled,
      'reservation', resolved.reservation_enabled
    ),
    'catalogVersion', resolved.catalog_version
  );
end;
$$;

create or replace function public.storefront_categories_v1(
  p_shop_slug text,
  p_cursor text default null,
  p_limit integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  resolved record;
  decoded record;
  effective_limit integer;
  candidates jsonb := '[]'::jsonb;
  page_rows jsonb := '[]'::jsonb;
  last_row jsonb;
  has_more boolean := false;
  next_cursor text := null;
begin
  if p_shop_slug is null
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into resolved
  from app_private.storefront_public_shop_v1(p_shop_slug);

  if not found then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  effective_limit := coalesce(p_limit, resolved.default_page_size);
  if effective_limit < 1 or effective_limit > resolved.maximum_page_size then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into decoded from app_private.storefront_cursor_decode_v1(p_cursor);
  if not decoded.valid or (p_cursor is not null and decoded.sort_mode <> 'category') then
    return pg_catalog.jsonb_build_object('status', 'invalid_cursor', 'apiVersion', 'storefront.v1');
  end if;
  if p_cursor is not null and decoded.catalog_version <> resolved.catalog_version then
    return pg_catalog.jsonb_build_object('status', 'catalog_changed', 'apiVersion', 'storefront.v1');
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(candidate.payload order by candidate.sort_rank, candidate.name_key, candidate.category_id),
    '[]'::jsonb
  ) into candidates
  from (
    select category_row.*
    from (
      select distinct on (item.category_id)
        item.category_id,
        item.category_sort_rank as sort_rank,
        pg_catalog.lower(item.category_name) as name_key,
        pg_catalog.jsonb_build_object(
          'id', item.category_id,
          'slug', item.category_slug,
          'name', item.category_name,
          'sortRank', item.category_sort_rank
        ) as payload
      from public.storefront_catalog_items item
      join public.storefront_categories category
        on category.shop_id = item.shop_id
       and category.id = item.category_id
       and category.publication_status = 'published'
      where item.shop_id = resolved.shop_id
        and item.storefront_enabled
        and (
          p_cursor is null
          or (item.category_sort_rank, pg_catalog.lower(item.category_name), item.category_id)
            > (decoded.number_key, decoded.text_key, decoded.row_id)
        )
      order by item.category_id, item.category_sort_rank, pg_catalog.lower(item.category_name)
    ) category_row
    order by category_row.sort_rank, category_row.name_key, category_row.category_id
    limit effective_limit + 1
  ) candidate
  ;

  has_more := pg_catalog.jsonb_array_length(candidates) > effective_limit;
  select coalesce(pg_catalog.jsonb_agg(element.value order by element.ordinality), '[]'::jsonb)
    into page_rows
  from pg_catalog.jsonb_array_elements(candidates) with ordinality element(value, ordinality)
  where element.ordinality <= effective_limit;

  if has_more then
    last_row := page_rows -> (pg_catalog.jsonb_array_length(page_rows) - 1);
    next_cursor := app_private.storefront_cursor_encode_v1(
      'category',
      resolved.catalog_version,
      (last_row ->> 'sortRank')::bigint,
      0,
      pg_catalog.lower(last_row ->> 'name'),
      (last_row ->> 'id')::uuid
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'catalogVersion', resolved.catalog_version,
    'categories', page_rows,
    'nextCursor', next_cursor
  );
end;
$$;

create or replace function public.storefront_catalog_v1(
  p_shop_slug text,
  p_cursor text default null,
  p_limit integer default null,
  p_category_slug text default null,
  p_availability text default null,
  p_discounted boolean default null,
  p_featured boolean default null,
  p_sort text default 'catalog'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  resolved record;
  decoded record;
  effective_limit integer;
  effective_sort text := coalesce(p_sort, 'catalog');
  candidates jsonb := '[]'::jsonb;
  page_rows jsonb := '[]'::jsonb;
  last_row jsonb;
  has_more boolean := false;
  next_cursor text := null;
begin
  if p_shop_slug is null
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or effective_sort not in ('catalog', 'name', 'price_asc', 'price_desc')
    or (p_category_slug is not null and p_category_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$')
    or (
      p_availability is not null
      and p_availability not in (
        'available', 'low_stock', 'unavailable', 'reservation_only',
        'pickup_only', 'delivery_only'
      )
    )
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into resolved
  from app_private.storefront_public_shop_v1(p_shop_slug);
  if not found then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  effective_limit := coalesce(p_limit, resolved.default_page_size);
  if effective_limit < 1 or effective_limit > resolved.maximum_page_size then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into decoded from app_private.storefront_cursor_decode_v1(p_cursor);
  if not decoded.valid or (p_cursor is not null and decoded.sort_mode <> effective_sort) then
    return pg_catalog.jsonb_build_object('status', 'invalid_cursor', 'apiVersion', 'storefront.v1');
  end if;
  if p_cursor is not null and decoded.catalog_version <> resolved.catalog_version then
    return pg_catalog.jsonb_build_object('status', 'catalog_changed', 'apiVersion', 'storefront.v1');
  end if;

  if effective_sort = 'catalog' then
    select coalesce(
      pg_catalog.jsonb_agg(candidate.payload order by candidate.sort_rank, candidate.name_key, candidate.publication_id),
      '[]'::jsonb
    ) into candidates
    from (
      select row.*
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id) row
      where (p_category_slug is null or row.category_slug = p_category_slug)
        and (p_availability is null or row.availability_mode = p_availability)
        and (p_discounted is null or (row.discount_bps is not null) = p_discounted)
        and (p_featured is null or row.featured = p_featured)
        and (
          p_cursor is null
          or (row.sort_rank, row.name_key, row.publication_id)
            > (decoded.number_key, decoded.text_key, decoded.row_id)
        )
      order by row.sort_rank, row.name_key, row.publication_id
      limit effective_limit + 1
    ) candidate;
  elsif effective_sort = 'name' then
    select coalesce(
      pg_catalog.jsonb_agg(candidate.payload order by candidate.name_key, candidate.publication_id),
      '[]'::jsonb
    ) into candidates
    from (
      select row.*
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id) row
      where (p_category_slug is null or row.category_slug = p_category_slug)
        and (p_availability is null or row.availability_mode = p_availability)
        and (p_discounted is null or (row.discount_bps is not null) = p_discounted)
        and (p_featured is null or row.featured = p_featured)
        and (
          p_cursor is null
          or (row.name_key, row.publication_id) > (decoded.text_key, decoded.row_id)
        )
      order by row.name_key, row.publication_id
      limit effective_limit + 1
    ) candidate;
  elsif effective_sort = 'price_asc' then
    select coalesce(
      pg_catalog.jsonb_agg(candidate.payload order by candidate.price_clp, candidate.name_key, candidate.publication_id),
      '[]'::jsonb
    ) into candidates
    from (
      select row.*
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id) row
      where (p_category_slug is null or row.category_slug = p_category_slug)
        and (p_availability is null or row.availability_mode = p_availability)
        and (p_discounted is null or (row.discount_bps is not null) = p_discounted)
        and (p_featured is null or row.featured = p_featured)
        and (
          p_cursor is null
          or (row.price_clp, row.name_key, row.publication_id)
            > (decoded.number_key, decoded.text_key, decoded.row_id)
        )
      order by row.price_clp, row.name_key, row.publication_id
      limit effective_limit + 1
    ) candidate;
  else
    select coalesce(
      pg_catalog.jsonb_agg(candidate.payload order by candidate.price_clp desc, candidate.name_key, candidate.publication_id),
      '[]'::jsonb
    ) into candidates
    from (
      select row.*
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id) row
      where (p_category_slug is null or row.category_slug = p_category_slug)
        and (p_availability is null or row.availability_mode = p_availability)
        and (p_discounted is null or (row.discount_bps is not null) = p_discounted)
        and (p_featured is null or row.featured = p_featured)
        and (
          p_cursor is null
          or row.price_clp < decoded.number_key
          or (
            row.price_clp = decoded.number_key
            and (row.name_key, row.publication_id) > (decoded.text_key, decoded.row_id)
          )
        )
      order by row.price_clp desc, row.name_key, row.publication_id
      limit effective_limit + 1
    ) candidate;
  end if;

  has_more := pg_catalog.jsonb_array_length(candidates) > effective_limit;
  select coalesce(pg_catalog.jsonb_agg(element.value order by element.ordinality), '[]'::jsonb)
    into page_rows
  from pg_catalog.jsonb_array_elements(candidates) with ordinality element(value, ordinality)
  where element.ordinality <= effective_limit;

  if has_more then
    last_row := page_rows -> (pg_catalog.jsonb_array_length(page_rows) - 1);
    next_cursor := app_private.storefront_cursor_encode_v1(
      effective_sort,
      resolved.catalog_version,
      case effective_sort
        when 'catalog' then (last_row ->> 'sortRank')::bigint
        when 'name' then 0::bigint
        else (last_row ->> 'priceClp')::bigint
      end,
      0,
      pg_catalog.lower(last_row ->> 'name'),
      (last_row ->> 'id')::uuid
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'catalogVersion', resolved.catalog_version,
    'items', page_rows,
    'nextCursor', next_cursor,
    'sort', effective_sort
  );
end;
$$;

create or replace function public.storefront_search_v1(
  p_shop_slug text,
  p_query text,
  p_cursor text default null,
  p_limit integer default null,
  p_category_slug text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  resolved record;
  decoded record;
  effective_limit integer;
  normalized_query text;
  query_document tsquery;
  candidates jsonb := '[]'::jsonb;
  page_rows jsonb := '[]'::jsonb;
  last_row jsonb;
  has_more boolean := false;
  next_cursor text := null;
begin
  normalized_query := btrim(pg_catalog.regexp_replace(
    pg_catalog.lower(extensions.unaccent(coalesce(p_query, ''))),
    '[[:space:]]+',
    ' ',
    'g'
  ));

  if p_shop_slug is null
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or pg_catalog.length(normalized_query) not between 2 and 120
    or normalized_query ~ '[[:cntrl:]]'
    or (p_category_slug is not null and p_category_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$')
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into resolved
  from app_private.storefront_public_shop_v1(p_shop_slug);
  if not found then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  effective_limit := coalesce(p_limit, resolved.default_page_size);
  if effective_limit < 1 or effective_limit > resolved.maximum_page_size then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into decoded from app_private.storefront_cursor_decode_v1(p_cursor);
  if not decoded.valid or (p_cursor is not null and decoded.sort_mode <> 'search') then
    return pg_catalog.jsonb_build_object('status', 'invalid_cursor', 'apiVersion', 'storefront.v1');
  end if;
  if p_cursor is not null and decoded.catalog_version <> resolved.catalog_version then
    return pg_catalog.jsonb_build_object('status', 'catalog_changed', 'apiVersion', 'storefront.v1');
  end if;

  query_document := pg_catalog.plainto_tsquery('simple', normalized_query);

  select coalesce(
    pg_catalog.jsonb_agg(
      candidate.payload || pg_catalog.jsonb_build_object('relevanceScore', candidate.relevance_score)
      order by candidate.relevance_score desc, candidate.sort_rank,
        candidate.name_key, candidate.publication_id
    ),
    '[]'::jsonb
  ) into candidates
  from (
    select ranked.*
    from (
      select
        row.*,
        floor(greatest(
          extensions.similarity(row.search_text, normalized_query)::numeric,
          pg_catalog.ts_rank_cd(row.search_document, query_document)::numeric
        ) * 1000000)::bigint as relevance_score
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id) row
      where (p_category_slug is null or row.category_slug = p_category_slug)
        and (
          row.search_document @@ query_document
          or row.search_text operator(extensions.%) normalized_query
        )
    ) ranked
    where p_cursor is null
      or ranked.relevance_score < decoded.number_key
      or (
        ranked.relevance_score = decoded.number_key
        and (
          ranked.sort_rank > decoded.secondary_number_key
          or (
            ranked.sort_rank = decoded.secondary_number_key
            and (ranked.name_key, ranked.publication_id)
              > (decoded.text_key, decoded.row_id)
          )
        )
      )
    order by ranked.relevance_score desc, ranked.sort_rank,
      ranked.name_key, ranked.publication_id
    limit effective_limit + 1
  ) candidate;

  has_more := pg_catalog.jsonb_array_length(candidates) > effective_limit;
  select coalesce(pg_catalog.jsonb_agg(element.value order by element.ordinality), '[]'::jsonb)
    into page_rows
  from pg_catalog.jsonb_array_elements(candidates) with ordinality element(value, ordinality)
  where element.ordinality <= effective_limit;

  if has_more then
    last_row := page_rows -> (pg_catalog.jsonb_array_length(page_rows) - 1);
    next_cursor := app_private.storefront_cursor_encode_v1(
      'search',
      resolved.catalog_version,
      (last_row ->> 'relevanceScore')::bigint,
      (last_row ->> 'sortRank')::bigint,
      pg_catalog.lower(last_row ->> 'name'),
      (last_row ->> 'id')::uuid
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'catalogVersion', resolved.catalog_version,
    'query', normalized_query,
    'items', page_rows,
    'nextCursor', next_cursor
  );
end;
$$;

create or replace function public.storefront_product_detail_v1(
  p_shop_slug text,
  p_publication_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  resolved record;
  product_payload jsonb;
begin
  if p_shop_slug is null
    or p_shop_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$'
    or p_publication_id is null
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  select * into resolved
  from app_private.storefront_public_shop_v1(p_shop_slug);
  if not found then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  select row.payload into product_payload
  from app_private.storefront_public_catalog_rows_v1(resolved.shop_id) row
  where row.publication_id = p_publication_id;

  if product_payload is null then
    return pg_catalog.jsonb_build_object('status', 'unavailable', 'apiVersion', 'storefront.v1');
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'catalogVersion', resolved.catalog_version,
    'item', product_payload
  );
end;
$$;

create or replace function public.storefront_featured_v1(
  p_shop_slug text,
  p_cursor text default null,
  p_limit integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
  select public.storefront_catalog_v1(
    p_shop_slug, p_cursor, p_limit, null, null, null, true, 'catalog'
  );
$$;

create or replace function public.storefront_offers_v1(
  p_shop_slug text,
  p_cursor text default null,
  p_limit integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
  select public.storefront_catalog_v1(
    p_shop_slug, p_cursor, p_limit, null, null, true, null, 'catalog'
  );
$$;

create or replace function public.storefront_home_v1(
  p_shop_slug text,
  p_category_limit integer default 12,
  p_featured_limit integer default 8,
  p_offer_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  settings_result jsonb;
  categories_result jsonb;
  featured_result jsonb;
  offers_result jsonb;
begin
  if p_category_limit is null
    or p_featured_limit is null
    or p_offer_limit is null
    or p_category_limit not between 1 and 20
    or p_featured_limit not between 1 and 20
    or p_offer_limit not between 1 and 20
  then
    return pg_catalog.jsonb_build_object('status', 'invalid', 'apiVersion', 'storefront.v1');
  end if;

  settings_result := public.storefront_settings_v1(p_shop_slug);
  if settings_result ->> 'status' <> 'ok' then
    return settings_result;
  end if;

  categories_result := public.storefront_categories_v1(
    p_shop_slug,
    null,
    least(p_category_limit, (settings_result ->> 'maximumPageSize')::integer)
  );
  featured_result := public.storefront_featured_v1(
    p_shop_slug,
    null,
    least(p_featured_limit, (settings_result ->> 'maximumPageSize')::integer)
  );
  offers_result := public.storefront_offers_v1(
    p_shop_slug,
    null,
    least(p_offer_limit, (settings_result ->> 'maximumPageSize')::integer)
  );

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'apiVersion', 'storefront.v1',
    'catalogVersion', settings_result -> 'catalogVersion',
    'settings', settings_result - array['status', 'apiVersion', 'catalogVersion'],
    'categories', categories_result -> 'categories',
    'featured', featured_result -> 'items',
    'offers', offers_result -> 'items'
  );
end;
$$;

do $grants$
begin
  revoke all on function public.storefront_catalog_version_v1(text)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_settings_v1(text)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_categories_v1(text, text, integer)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_catalog_v1(
    text, text, integer, text, text, boolean, boolean, text
  ) from public, anon, authenticated, service_role;
  revoke all on function public.storefront_search_v1(text, text, text, integer, text)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_product_detail_v1(text, uuid)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_featured_v1(text, text, integer)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_offers_v1(text, text, integer)
    from public, anon, authenticated, service_role;
  revoke all on function public.storefront_home_v1(text, integer, integer, integer)
    from public, anon, authenticated, service_role;

  grant execute on function public.storefront_catalog_version_v1(text)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_settings_v1(text)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_categories_v1(text, text, integer)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_catalog_v1(
    text, text, integer, text, text, boolean, boolean, text
  ) to anon, authenticated, service_role;
  grant execute on function public.storefront_search_v1(text, text, text, integer, text)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_product_detail_v1(text, uuid)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_featured_v1(text, text, integer)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_offers_v1(text, text, integer)
    to anon, authenticated, service_role;
  grant execute on function public.storefront_home_v1(text, integer, integer, integer)
    to anon, authenticated, service_role;
end;
$grants$;

comment on function public.storefront_catalog_v1(
  text, text, integer, text, text, boolean, boolean, text
) is 'Storefront v1 public catalog contract with deterministic keyset pagination.';
comment on function public.storefront_search_v1(text, text, text, integer, text)
  is 'Storefront v1 normalized public search contract.';

notify pgrst, 'reload schema';

commit;
