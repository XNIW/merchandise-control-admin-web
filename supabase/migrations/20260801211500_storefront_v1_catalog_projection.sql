-- Storefront v1 / TASK-006
--
-- Rebuildable, versioned customer-safe catalog projection. Direct mobile-table
-- access remains denied; TASK-010 installs the versioned public read contract.

begin;

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table public.storefront_catalog_versions (
  shop_id uuid primary key references public.shops(shop_id) on delete cascade,
  catalog_version bigint not null default 0,
  item_count bigint not null default 0,
  content_sha256 text not null,
  rebuilt_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint storefront_catalog_versions_version_check check (
    catalog_version >= 0
  ),
  constraint storefront_catalog_versions_item_count_check check (item_count >= 0),
  constraint storefront_catalog_versions_sha_check check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table public.storefront_catalog_items (
  publication_id uuid primary key,
  shop_id uuid not null,
  shop_slug text not null,
  storefront_enabled boolean not null,
  shop_pickup_enabled boolean not null,
  shop_delivery_enabled boolean not null,
  shop_reservation_enabled boolean not null,
  category_id uuid not null,
  category_slug text not null,
  category_name text not null,
  category_sort_rank bigint not null,
  public_name text not null,
  public_description text,
  public_brand text,
  price_clp bigint not null,
  compare_at_price_clp bigint,
  discount_bps integer,
  promotion_id uuid,
  promotion_name text,
  promotion_starts_at timestamptz,
  promotion_ends_at timestamptz,
  featured boolean not null,
  sort_rank bigint not null,
  pickup_enabled boolean not null,
  delivery_enabled boolean not null,
  reservation_enabled boolean not null,
  availability_mode text not null,
  image_version_key text,
  image_thumb_url text,
  image_card_url text,
  image_detail_url text,
  image_content_sha256 text,
  search_text text not null,
  search_document tsvector not null,
  catalog_version bigint not null,
  published_at timestamptz not null,
  public_updated_at timestamptz not null,
  content_sha256 text not null,
  projected_at timestamptz not null default statement_timestamp(),
  constraint storefront_catalog_items_publication_fkey foreign key (
    shop_id,
    publication_id
  ) references public.storefront_product_publications(shop_id, id)
    on delete cascade,
  constraint storefront_catalog_items_category_fkey foreign key (
    shop_id,
    category_id
  ) references public.storefront_categories(shop_id, id),
  constraint storefront_catalog_items_price_check check (
    price_clp between 0 and 999999999999
    and (
      compare_at_price_clp is null
      or compare_at_price_clp between price_clp and 999999999999
    )
  ),
  constraint storefront_catalog_items_discount_check check (
    discount_bps is null or discount_bps between 1 and 10000
  ),
  constraint storefront_catalog_items_promotion_shape_check check (
    (
      promotion_id is null
      and promotion_name is null
      and promotion_starts_at is null
      and promotion_ends_at is null
    )
    or (
      promotion_id is not null
      and promotion_name is not null
      and promotion_starts_at is not null
      and promotion_ends_at is not null
      and promotion_starts_at < promotion_ends_at
    )
  ),
  constraint storefront_catalog_items_fulfillment_check check (
    pickup_enabled or delivery_enabled or reservation_enabled
  ),
  constraint storefront_catalog_items_availability_check check (
    availability_mode in (
      'available',
      'low_stock',
      'unavailable',
      'reservation_only',
      'pickup_only',
      'delivery_only'
    )
  ),
  constraint storefront_catalog_items_image_urls_check check (
    (image_thumb_url is null or image_thumb_url ~ '^https://[^[:space:]]+$')
    and (image_card_url is null or image_card_url ~ '^https://[^[:space:]]+$')
    and (image_detail_url is null or image_detail_url ~ '^https://[^[:space:]]+$')
    and coalesce(image_thumb_url, '') !~* '/object/sign/'
    and coalesce(image_card_url, '') !~* '/object/sign/'
    and coalesce(image_detail_url, '') !~* '/object/sign/'
    and coalesce(image_thumb_url, '') !~* '/object/public/product-images/'
    and coalesce(image_card_url, '') !~* '/object/public/product-images/'
    and coalesce(image_detail_url, '') !~* '/object/public/product-images/'
    and coalesce(image_thumb_url, '') !~* '[?&](token|signature)='
    and coalesce(image_card_url, '') !~* '[?&](token|signature)='
    and coalesce(image_detail_url, '') !~* '[?&](token|signature)='
  ),
  constraint storefront_catalog_items_image_shape_check check (
    (
      image_version_key is null
      and image_thumb_url is null
      and image_card_url is null
      and image_detail_url is null
      and image_content_sha256 is null
    )
    or (
      image_version_key is not null
      and image_thumb_url is not null
      and image_card_url is not null
      and image_detail_url is not null
      and image_content_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint storefront_catalog_items_version_check check (catalog_version > 0),
  constraint storefront_catalog_items_sha_check check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create index storefront_catalog_items_shop_featured_keyset_idx
  on public.storefront_catalog_items(
    shop_id,
    featured desc,
    sort_rank,
    public_name,
    publication_id
  );
create index storefront_catalog_items_shop_category_keyset_idx
  on public.storefront_catalog_items(
    shop_id,
    category_id,
    sort_rank,
    public_name,
    publication_id
  );
create index storefront_catalog_items_shop_availability_idx
  on public.storefront_catalog_items(
    shop_id,
    availability_mode,
    sort_rank,
    publication_id
  );
create index storefront_catalog_items_shop_discount_idx
  on public.storefront_catalog_items(
    shop_id,
    discount_bps desc,
    sort_rank,
    publication_id
  )
  where discount_bps is not null;
create index storefront_catalog_items_search_document_idx
  on public.storefront_catalog_items using gin(search_document);
create index storefront_catalog_items_search_trgm_idx
  on public.storefront_catalog_items
  using gin(search_text extensions.gin_trgm_ops);

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
      publication.availability_mode,
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
        coalesce(promotion.updated_at, '-infinity'::timestamptz)
      ) as public_updated_at
    from public.storefront_product_publications publication
    join public.storefront_settings setting
      on setting.shop_id = publication.shop_id
    join public.storefront_categories category
      on category.shop_id = publication.shop_id
      and category.id = publication.public_category_id
      and category.publication_status = 'published'
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

create or replace function app_private.storefront_catalog_empty_sha256_v1()
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(pg_catalog.convert_to('', 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function app_private.storefront_catalog_lock_shop_v1(
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_shop_id is null then
    raise exception using
      errcode = '22004',
      message = 'storefront catalog shop_id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storefront-catalog:' || p_shop_id::text, 0)
  );
end;
$$;

create or replace function app_private.storefront_catalog_refresh_publication_v1(
  p_publication_id uuid,
  p_shop_id uuid default null,
  p_at timestamptz default statement_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_current_version bigint;
  v_next_version bigint;
  v_existing_sha256 text;
  v_desired_sha256 text;
  v_item_count bigint;
  v_catalog_sha256 text;
begin
  if p_publication_id is null then
    raise exception using
      errcode = '22004',
      message = 'storefront publication_id is required';
  end if;

  select coalesce(publication.shop_id, item.shop_id)
  into v_shop_id
  from (select 1) anchor
  left join public.storefront_product_publications publication
    on publication.id = p_publication_id
  left join public.storefront_catalog_items item
    on item.publication_id = p_publication_id;

  if v_shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'storefront publication was not found';
  end if;

  if p_shop_id is not null and p_shop_id <> v_shop_id then
    raise exception using
      errcode = '42501',
      message = 'storefront publication is outside the requested shop';
  end if;

  perform app_private.storefront_catalog_lock_shop_v1(v_shop_id);

  insert into public.storefront_catalog_versions (
    shop_id,
    content_sha256
  ) values (
    v_shop_id,
    app_private.storefront_catalog_empty_sha256_v1()
  )
  on conflict (shop_id) do nothing;

  select version.catalog_version
  into strict v_current_version
  from public.storefront_catalog_versions version
  where version.shop_id = v_shop_id
  for update;

  select item.content_sha256
  into v_existing_sha256
  from public.storefront_catalog_items item
  where item.publication_id = p_publication_id;

  select source.content_sha256
  into v_desired_sha256
  from app_private.storefront_catalog_source_v1(
    p_publication_id,
    v_shop_id,
    p_at
  ) source;

  if v_existing_sha256 is not distinct from v_desired_sha256 then
    return v_current_version;
  end if;

  update public.storefront_catalog_versions version
  set catalog_version = version.catalog_version + 1,
      updated_at = statement_timestamp()
  where version.shop_id = v_shop_id
  returning version.catalog_version into v_next_version;

  if v_desired_sha256 is null then
    delete from public.storefront_catalog_items item
    where item.publication_id = p_publication_id;
  else
    insert into public.storefront_catalog_items (
      publication_id,
      shop_id,
      shop_slug,
      storefront_enabled,
      shop_pickup_enabled,
      shop_delivery_enabled,
      shop_reservation_enabled,
      category_id,
      category_slug,
      category_name,
      category_sort_rank,
      public_name,
      public_description,
      public_brand,
      price_clp,
      compare_at_price_clp,
      discount_bps,
      promotion_id,
      promotion_name,
      promotion_starts_at,
      promotion_ends_at,
      featured,
      sort_rank,
      pickup_enabled,
      delivery_enabled,
      reservation_enabled,
      availability_mode,
      image_version_key,
      image_thumb_url,
      image_card_url,
      image_detail_url,
      image_content_sha256,
      search_text,
      search_document,
      catalog_version,
      published_at,
      public_updated_at,
      content_sha256,
      projected_at
    )
    select
      source.publication_id,
      source.shop_id,
      source.shop_slug,
      source.storefront_enabled,
      source.shop_pickup_enabled,
      source.shop_delivery_enabled,
      source.shop_reservation_enabled,
      source.category_id,
      source.category_slug,
      source.category_name,
      source.category_sort_rank,
      source.public_name,
      source.public_description,
      source.public_brand,
      source.price_clp,
      source.compare_at_price_clp,
      source.discount_bps,
      source.promotion_id,
      source.promotion_name,
      source.promotion_starts_at,
      source.promotion_ends_at,
      source.featured,
      source.sort_rank,
      source.pickup_enabled,
      source.delivery_enabled,
      source.reservation_enabled,
      source.availability_mode,
      source.image_version_key,
      source.image_thumb_url,
      source.image_card_url,
      source.image_detail_url,
      source.image_content_sha256,
      source.search_text,
      source.search_document,
      v_next_version,
      source.published_at,
      source.public_updated_at,
      source.content_sha256,
      statement_timestamp()
    from app_private.storefront_catalog_source_v1(
      p_publication_id,
      v_shop_id,
      p_at
    ) source
    on conflict (publication_id) do update
    set shop_id = excluded.shop_id,
        shop_slug = excluded.shop_slug,
        storefront_enabled = excluded.storefront_enabled,
        shop_pickup_enabled = excluded.shop_pickup_enabled,
        shop_delivery_enabled = excluded.shop_delivery_enabled,
        shop_reservation_enabled = excluded.shop_reservation_enabled,
        category_id = excluded.category_id,
        category_slug = excluded.category_slug,
        category_name = excluded.category_name,
        category_sort_rank = excluded.category_sort_rank,
        public_name = excluded.public_name,
        public_description = excluded.public_description,
        public_brand = excluded.public_brand,
        price_clp = excluded.price_clp,
        compare_at_price_clp = excluded.compare_at_price_clp,
        discount_bps = excluded.discount_bps,
        promotion_id = excluded.promotion_id,
        promotion_name = excluded.promotion_name,
        promotion_starts_at = excluded.promotion_starts_at,
        promotion_ends_at = excluded.promotion_ends_at,
        featured = excluded.featured,
        sort_rank = excluded.sort_rank,
        pickup_enabled = excluded.pickup_enabled,
        delivery_enabled = excluded.delivery_enabled,
        reservation_enabled = excluded.reservation_enabled,
        availability_mode = excluded.availability_mode,
        image_version_key = excluded.image_version_key,
        image_thumb_url = excluded.image_thumb_url,
        image_card_url = excluded.image_card_url,
        image_detail_url = excluded.image_detail_url,
        image_content_sha256 = excluded.image_content_sha256,
        search_text = excluded.search_text,
        search_document = excluded.search_document,
        catalog_version = excluded.catalog_version,
        published_at = excluded.published_at,
        public_updated_at = excluded.public_updated_at,
        content_sha256 = excluded.content_sha256,
        projected_at = excluded.projected_at;
  end if;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              item.publication_id::text || ':' || item.content_sha256,
              ',' order by item.publication_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into v_item_count, v_catalog_sha256
  from public.storefront_catalog_items item
  where item.shop_id = v_shop_id;

  update public.storefront_catalog_versions version
  set item_count = v_item_count,
      content_sha256 = v_catalog_sha256,
      updated_at = statement_timestamp()
  where version.shop_id = v_shop_id;

  return v_next_version;
end;
$$;

create or replace function app_private.storefront_catalog_rebuild_shop_v1(
  p_shop_id uuid,
  p_at timestamptz default statement_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version bigint;
  v_next_version bigint;
  v_candidate_count bigint;
  v_candidate_sha256 text;
  v_empty_sha256 text;
begin
  if not exists (
    select 1
    from public.shops shop
    where shop.shop_id = p_shop_id
      and shop.shop_status <> 'archived'
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront catalog rebuild requires a non-archived shop';
  end if;

  perform app_private.storefront_catalog_lock_shop_v1(p_shop_id);
  v_empty_sha256 := app_private.storefront_catalog_empty_sha256_v1();

  insert into public.storefront_catalog_versions (
    shop_id,
    content_sha256
  ) values (
    p_shop_id,
    v_empty_sha256
  )
  on conflict (shop_id) do nothing;

  select version.catalog_version
  into strict v_current_version
  from public.storefront_catalog_versions version
  where version.shop_id = p_shop_id
  for update;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              source.publication_id::text || ':' || source.content_sha256,
              ',' order by source.publication_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into v_candidate_count, v_candidate_sha256
  from app_private.storefront_catalog_source_v1(
    null,
    p_shop_id,
    p_at
  ) source;

  if exists (
    select 1
    from public.storefront_catalog_versions version
    where version.shop_id = p_shop_id
      and version.item_count = v_candidate_count
      and version.content_sha256 = v_candidate_sha256
  ) then
    return v_current_version;
  end if;

  update public.storefront_catalog_versions version
  set catalog_version = version.catalog_version + 1,
      item_count = v_candidate_count,
      content_sha256 = v_candidate_sha256,
      rebuilt_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where version.shop_id = p_shop_id
  returning version.catalog_version into v_next_version;

  delete from public.storefront_catalog_items item
  where item.shop_id = p_shop_id;

  insert into public.storefront_catalog_items (
    publication_id,
    shop_id,
    shop_slug,
    storefront_enabled,
    shop_pickup_enabled,
    shop_delivery_enabled,
    shop_reservation_enabled,
    category_id,
    category_slug,
    category_name,
    category_sort_rank,
    public_name,
    public_description,
    public_brand,
    price_clp,
    compare_at_price_clp,
    discount_bps,
    promotion_id,
    promotion_name,
    promotion_starts_at,
    promotion_ends_at,
    featured,
    sort_rank,
    pickup_enabled,
    delivery_enabled,
    reservation_enabled,
    availability_mode,
    image_version_key,
    image_thumb_url,
    image_card_url,
    image_detail_url,
    image_content_sha256,
    search_text,
    search_document,
    catalog_version,
    published_at,
    public_updated_at,
    content_sha256,
    projected_at
  )
  select
    source.publication_id,
    source.shop_id,
    source.shop_slug,
    source.storefront_enabled,
    source.shop_pickup_enabled,
    source.shop_delivery_enabled,
    source.shop_reservation_enabled,
    source.category_id,
    source.category_slug,
    source.category_name,
    source.category_sort_rank,
    source.public_name,
    source.public_description,
    source.public_brand,
    source.price_clp,
    source.compare_at_price_clp,
    source.discount_bps,
    source.promotion_id,
    source.promotion_name,
    source.promotion_starts_at,
    source.promotion_ends_at,
    source.featured,
    source.sort_rank,
    source.pickup_enabled,
    source.delivery_enabled,
    source.reservation_enabled,
    source.availability_mode,
    source.image_version_key,
    source.image_thumb_url,
    source.image_card_url,
    source.image_detail_url,
    source.image_content_sha256,
    source.search_text,
    source.search_document,
    v_next_version,
    source.published_at,
    source.public_updated_at,
    source.content_sha256,
    statement_timestamp()
  from app_private.storefront_catalog_source_v1(
    null,
    p_shop_id,
    p_at
  ) source;

  return v_next_version;
end;
$$;

create or replace function app_private.storefront_catalog_rebuild_statement_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_shop_id in
      select distinct inserted.shop_id
      from storefront_catalog_inserted_rows inserted
    loop
      if exists (
        select 1 from public.shops shop where shop.shop_id = v_shop_id
      ) then
        perform app_private.storefront_catalog_rebuild_shop_v1(
          v_shop_id,
          statement_timestamp()
        );
      end if;
    end loop;
  elsif tg_op = 'DELETE' then
    for v_shop_id in
      select distinct deleted.shop_id
      from storefront_catalog_deleted_rows deleted
    loop
      if exists (
        select 1 from public.shops shop where shop.shop_id = v_shop_id
      ) then
        perform app_private.storefront_catalog_rebuild_shop_v1(
          v_shop_id,
          statement_timestamp()
        );
      end if;
    end loop;
  elsif tg_table_name = 'storefront_product_publications' then
    for v_shop_id in
      select distinct coalesce(inserted.shop_id, deleted.shop_id)
      from storefront_catalog_inserted_rows inserted
      full join storefront_catalog_deleted_rows deleted using (id)
      where (pg_catalog.to_jsonb(inserted) - 'catalog_version')
        is distinct from
        (pg_catalog.to_jsonb(deleted) - 'catalog_version')
    loop
      perform app_private.storefront_catalog_rebuild_shop_v1(
        v_shop_id,
        statement_timestamp()
      );
    end loop;
  else
    for v_shop_id in
      select distinct changed.shop_id
      from (
        select inserted.shop_id
        from storefront_catalog_inserted_rows inserted
        union
        select deleted.shop_id
        from storefront_catalog_deleted_rows deleted
      ) changed
    loop
      if exists (
        select 1 from public.shops shop where shop.shop_id = v_shop_id
      ) then
        perform app_private.storefront_catalog_rebuild_shop_v1(
          v_shop_id,
          statement_timestamp()
        );
      end if;
    end loop;
  end if;

  return null;
end;
$$;

create trigger storefront_publications_catalog_insert
  after insert on public.storefront_product_publications
  referencing new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_publications_catalog_delete
  after delete on public.storefront_product_publications
  referencing old table as storefront_catalog_deleted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_publications_catalog_update
  after update on public.storefront_product_publications
  referencing old table as storefront_catalog_deleted_rows
    new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();

create trigger storefront_settings_catalog_insert
  after insert on public.storefront_settings
  referencing new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_settings_catalog_update
  after update on public.storefront_settings
  referencing old table as storefront_catalog_deleted_rows
    new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_settings_catalog_delete
  after delete on public.storefront_settings
  referencing old table as storefront_catalog_deleted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();

create trigger storefront_categories_catalog_insert
  after insert on public.storefront_categories
  referencing new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_categories_catalog_update
  after update on public.storefront_categories
  referencing old table as storefront_catalog_deleted_rows
    new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_categories_catalog_delete
  after delete on public.storefront_categories
  referencing old table as storefront_catalog_deleted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();

create trigger storefront_images_catalog_insert
  after insert on public.storefront_image_publications
  referencing new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_images_catalog_update
  after update on public.storefront_image_publications
  referencing old table as storefront_catalog_deleted_rows
    new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_images_catalog_delete
  after delete on public.storefront_image_publications
  referencing old table as storefront_catalog_deleted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();

create trigger storefront_promotions_catalog_insert
  after insert on public.storefront_promotions
  referencing new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_promotions_catalog_update
  after update on public.storefront_promotions
  referencing old table as storefront_catalog_deleted_rows
    new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_promotions_catalog_delete
  after delete on public.storefront_promotions
  referencing old table as storefront_catalog_deleted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();

create trigger storefront_promotion_products_catalog_insert
  after insert on public.storefront_promotion_products
  referencing new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_promotion_products_catalog_update
  after update on public.storefront_promotion_products
  referencing old table as storefront_catalog_deleted_rows
    new table as storefront_catalog_inserted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();
create trigger storefront_promotion_products_catalog_delete
  after delete on public.storefront_promotion_products
  referencing old table as storefront_catalog_deleted_rows
  for each statement execute function
    app_private.storefront_catalog_rebuild_statement_trigger_v1();

alter table public.storefront_catalog_versions enable row level security;
alter table public.storefront_catalog_versions force row level security;
alter table public.storefront_catalog_items enable row level security;
alter table public.storefront_catalog_items force row level security;

revoke all on table public.storefront_catalog_versions
  from public, anon, authenticated;
revoke all on table public.storefront_catalog_items
  from public, anon, authenticated;
grant select on table public.storefront_catalog_versions to service_role;
grant select on table public.storefront_catalog_items to service_role;

revoke all on function app_private.storefront_catalog_source_v1(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function app_private.storefront_catalog_empty_sha256_v1()
  from public, anon, authenticated;
revoke all on function app_private.storefront_catalog_lock_shop_v1(uuid)
  from public, anon, authenticated;
revoke all on function app_private.storefront_catalog_refresh_publication_v1(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function app_private.storefront_catalog_rebuild_shop_v1(
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function app_private.storefront_catalog_rebuild_statement_trigger_v1()
  from public, anon, authenticated;

grant execute on function app_private.storefront_catalog_source_v1(
  uuid,
  uuid,
  timestamptz
) to service_role;
grant execute on function app_private.storefront_catalog_refresh_publication_v1(
  uuid,
  uuid,
  timestamptz
) to service_role;
grant execute on function app_private.storefront_catalog_rebuild_shop_v1(
  uuid,
  timestamptz
) to service_role;

comment on table public.storefront_catalog_items is
  'Customer-safe Storefront projection. No source inventory IDs, costs, suppliers, exact stock, POS metadata or private Storage paths.';
comment on table public.storefront_catalog_versions is
  'Monotone per-shop catalog version and deterministic projection fingerprint.';
comment on function app_private.storefront_catalog_rebuild_shop_v1(
  uuid,
  timestamptz
) is
  'Idempotent serialized rebuild of the customer-safe projection for one shop.';

commit;
