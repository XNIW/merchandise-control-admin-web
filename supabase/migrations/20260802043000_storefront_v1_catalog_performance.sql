-- TASK-019: resolve active promotions once per shop instead of once per
-- projected catalog row. The public RPC contract, current-price semantics,
-- RLS boundary and fail-closed publication checks remain unchanged.

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

alter function app_private.storefront_public_catalog_rows_scoped_v1(
  uuid, timestamptz, uuid[]
)
  reset search_path;

revoke all on function app_private.storefront_public_catalog_rows_scoped_v1(
  uuid, timestamptz, uuid[]
)
  from public, anon, authenticated, service_role;

comment on function app_private.storefront_public_catalog_rows_scoped_v1(
  uuid, timestamptz, uuid[]
)
  is 'Private set-based current-promotion resolver optionally bounded to an already validated publication page.';

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
security invoker
as $$
  select scoped.*
  from app_private.storefront_public_catalog_rows_scoped_v1(
    p_shop_id,
    p_at,
    null::uuid[]
  ) scoped;
$$;

alter function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  reset search_path;

revoke all on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  from public, anon, authenticated, service_role;

comment on function app_private.storefront_public_catalog_rows_v1(uuid, timestamptz)
  is 'Compatibility resolver over the TASK-019 set-based scoped implementation; direct mobile execution remains revoked.';

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
  snapshot_at timestamptz := statement_timestamp();
  candidate_ids uuid[] := '{}'::uuid[];
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

  if effective_sort = 'catalog' and p_discounted is null then
    select coalesce(
      pg_catalog.array_agg(
        candidate.publication_id
        order by candidate.sort_rank, candidate.name_key, candidate.publication_id
      ),
      '{}'::uuid[]
    ) into candidate_ids
    from (
      select
        item.publication_id,
        item.sort_rank,
        pg_catalog.lower(item.public_name) as name_key
      from public.storefront_catalog_items item
      join public.storefront_product_publications publication
        on publication.shop_id = item.shop_id
       and publication.id = item.publication_id
       and publication.publication_status = 'published'
       and publication.published_at is not null
      join public.storefront_settings setting
        on setting.shop_id = item.shop_id
       and setting.storefront_enabled
      where item.shop_id = resolved.shop_id
        and item.storefront_enabled
        and (p_category_slug is null or item.category_slug = p_category_slug)
        and (p_availability is null or item.availability_mode = p_availability)
        and (p_featured is null or item.featured = p_featured)
        and (
          p_cursor is null
          or (item.sort_rank, pg_catalog.lower(item.public_name), item.publication_id)
            > (decoded.number_key, decoded.text_key, decoded.row_id)
        )
      order by item.sort_rank, pg_catalog.lower(item.public_name), item.publication_id
      limit effective_limit + 1
    ) candidate;

    select coalesce(
      pg_catalog.jsonb_agg(
        row.payload order by row.sort_rank, row.name_key, row.publication_id
      ),
      '[]'::jsonb
    ) into candidates
    from app_private.storefront_public_catalog_rows_scoped_v1(
      resolved.shop_id,
      snapshot_at,
      candidate_ids
    ) row;
  elsif effective_sort = 'name' and p_discounted is null then
    select coalesce(
      pg_catalog.array_agg(
        candidate.publication_id
        order by candidate.name_key, candidate.publication_id
      ),
      '{}'::uuid[]
    ) into candidate_ids
    from (
      select
        item.publication_id,
        pg_catalog.lower(item.public_name) as name_key
      from public.storefront_catalog_items item
      join public.storefront_product_publications publication
        on publication.shop_id = item.shop_id
       and publication.id = item.publication_id
       and publication.publication_status = 'published'
       and publication.published_at is not null
      join public.storefront_settings setting
        on setting.shop_id = item.shop_id
       and setting.storefront_enabled
      where item.shop_id = resolved.shop_id
        and item.storefront_enabled
        and (p_category_slug is null or item.category_slug = p_category_slug)
        and (p_availability is null or item.availability_mode = p_availability)
        and (p_featured is null or item.featured = p_featured)
        and (
          p_cursor is null
          or (pg_catalog.lower(item.public_name), item.publication_id)
            > (decoded.text_key, decoded.row_id)
        )
      order by pg_catalog.lower(item.public_name), item.publication_id
      limit effective_limit + 1
    ) candidate;

    select coalesce(
      pg_catalog.jsonb_agg(
        row.payload order by row.name_key, row.publication_id
      ),
      '[]'::jsonb
    ) into candidates
    from app_private.storefront_public_catalog_rows_scoped_v1(
      resolved.shop_id,
      snapshot_at,
      candidate_ids
    ) row;
  elsif effective_sort = 'catalog' then
    select coalesce(
      pg_catalog.jsonb_agg(candidate.payload order by candidate.sort_rank, candidate.name_key, candidate.publication_id),
      '[]'::jsonb
    ) into candidates
    from (
      select row.*
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id, snapshot_at) row
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
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id, snapshot_at) row
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
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id, snapshot_at) row
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
      from app_private.storefront_public_catalog_rows_v1(resolved.shop_id, snapshot_at) row
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
  snapshot_at timestamptz := statement_timestamp();
  candidate_keys jsonb := '[]'::jsonb;
  candidate_ids uuid[] := '{}'::uuid[];
  candidates jsonb := '[]'::jsonb;
  page_rows jsonb := '[]'::jsonb;
  last_row jsonb;
  has_more boolean := false;
  next_cursor text := null;
begin
  normalized_query := pg_catalog.btrim(pg_catalog.regexp_replace(
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
      pg_catalog.jsonb_build_object(
        'id', candidate.publication_id,
        'relevanceScore', candidate.relevance_score
      )
      order by candidate.relevance_score desc, candidate.sort_rank,
        candidate.name_key, candidate.publication_id
    ),
    '[]'::jsonb
  ) into candidate_keys
  from (
    select ranked.*
    from (
      select
        item.publication_id,
        item.sort_rank,
        pg_catalog.lower(item.public_name) as name_key,
        floor(greatest(
          extensions.similarity(item.search_text, normalized_query)::numeric,
          pg_catalog.ts_rank_cd(item.search_document, query_document)::numeric
        ) * 1000000)::bigint as relevance_score
      from public.storefront_catalog_items item
      join public.storefront_product_publications publication
        on publication.shop_id = item.shop_id
       and publication.id = item.publication_id
       and publication.publication_status = 'published'
       and publication.published_at is not null
      join public.storefront_settings setting
        on setting.shop_id = item.shop_id
       and setting.storefront_enabled
      where item.shop_id = resolved.shop_id
        and item.storefront_enabled
        and (p_category_slug is null or item.category_slug = p_category_slug)
        and (
          item.search_document @@ query_document
          or item.search_text operator(extensions.%) normalized_query
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

  select coalesce(
    pg_catalog.array_agg(
      (element.value ->> 'id')::uuid order by element.ordinality
    ),
    '{}'::uuid[]
  ) into candidate_ids
  from pg_catalog.jsonb_array_elements(candidate_keys)
    with ordinality element(value, ordinality);

  select coalesce(
    pg_catalog.jsonb_agg(
      row.payload || pg_catalog.jsonb_build_object(
        'relevanceScore', (element.value ->> 'relevanceScore')::bigint
      )
      order by element.ordinality
    ),
    '[]'::jsonb
  ) into candidates
  from pg_catalog.jsonb_array_elements(candidate_keys)
    with ordinality element(value, ordinality)
  join app_private.storefront_public_catalog_rows_scoped_v1(
    resolved.shop_id,
    snapshot_at,
    candidate_ids
  ) row
    on row.publication_id = (element.value ->> 'id')::uuid;

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

revoke all on function public.storefront_catalog_v1(
  text, text, integer, text, text, boolean, boolean, text
) from public;
revoke all on function public.storefront_search_v1(
  text, text, text, integer, text
) from public;

grant execute on function public.storefront_catalog_v1(
  text, text, integer, text, text, boolean, boolean, text
) to anon, authenticated, service_role;
grant execute on function public.storefront_search_v1(
  text, text, text, integer, text
) to anon, authenticated, service_role;
