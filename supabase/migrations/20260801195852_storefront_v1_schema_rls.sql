-- Storefront v1 / TASK-005
--
-- Authoritative publication model only. Public projection and versioned read
-- functions are installed by the TASK-006 and TASK-010 migrations. All flags
-- default OFF and all authoring tables remain inaccessible to mobile roles.

begin;

create table public.storefront_settings (
  shop_id uuid primary key references public.shops(shop_id) on delete cascade,
  public_slug text not null,
  storefront_enabled boolean not null default false,
  pickup_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  reservation_enabled boolean not null default false,
  require_product_image boolean not null default true,
  currency_code text not null default 'CLP',
  default_page_size integer not null default 24,
  maximum_page_size integer not null default 100,
  catalog_locale text not null default 'es-CL',
  catalog_time_zone text not null default 'America/Santiago',
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_settings_public_slug_format check (
    public_slug = lower(public_slug)
    and public_slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'
  ),
  constraint storefront_settings_currency_clp check (currency_code = 'CLP'),
  constraint storefront_settings_page_size_check check (
    default_page_size between 1 and 100
    and maximum_page_size between 1 and 100
    and default_page_size <= maximum_page_size
  ),
  constraint storefront_settings_locale_check check (
    catalog_locale in ('es-CL', 'it', 'en', 'zh-Hans')
  ),
  constraint storefront_settings_time_zone_check check (
    length(btrim(catalog_time_zone)) between 1 and 64
  )
);

create unique index storefront_settings_public_slug_unique_idx
  on public.storefront_settings(public_slug);
create index storefront_settings_enabled_shop_idx
  on public.storefront_settings(shop_id)
  where storefront_enabled;

create table public.storefront_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  source_category_id uuid references public.inventory_categories(id)
    on delete set null,
  slug text not null,
  public_name text not null,
  public_description text,
  publication_status text not null default 'draft',
  sort_rank bigint not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_categories_shop_id_id_unique unique (shop_id, id),
  constraint storefront_categories_shop_slug_unique unique (shop_id, slug),
  constraint storefront_categories_slug_format check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'
  ),
  constraint storefront_categories_name_check check (
    length(btrim(public_name)) between 1 and 160
  ),
  constraint storefront_categories_description_check check (
    public_description is null
    or length(public_description) <= 2000
  ),
  constraint storefront_categories_status_check check (
    publication_status in ('draft', 'published', 'paused')
  )
);

create index storefront_categories_shop_status_sort_idx
  on public.storefront_categories(
    shop_id,
    publication_status,
    sort_rank,
    public_name,
    id
  );
create index storefront_categories_source_idx
  on public.storefront_categories(source_category_id)
  where source_category_id is not null;

create table public.storefront_image_publications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  source_product_id uuid not null references public.inventory_products(id)
    on delete cascade,
  source_image_version_id uuid references public.inventory_product_image_versions(id)
    on delete set null,
  publication_status text not null default 'draft',
  version_key text not null,
  thumb_url text,
  card_url text,
  detail_url text,
  width integer,
  height integer,
  content_type text,
  content_sha256 text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_image_publications_shop_id_id_unique unique (shop_id, id),
  constraint storefront_image_publications_shop_version_unique unique (
    shop_id,
    version_key
  ),
  constraint storefront_image_publications_status_check check (
    publication_status in ('draft', 'ready', 'published', 'superseded', 'removed')
  ),
  constraint storefront_image_publications_version_key_check check (
    version_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$'
  ),
  constraint storefront_image_publications_https_urls_check check (
    (thumb_url is null or thumb_url ~ '^https://[^[:space:]]+$')
    and (card_url is null or card_url ~ '^https://[^[:space:]]+$')
    and (detail_url is null or detail_url ~ '^https://[^[:space:]]+$')
  ),
  constraint storefront_image_publications_public_urls_check check (
    coalesce(thumb_url, '') !~* '/object/sign/'
    and coalesce(card_url, '') !~* '/object/sign/'
    and coalesce(detail_url, '') !~* '/object/sign/'
    and coalesce(thumb_url, '') !~* '/object/public/product-images/'
    and coalesce(card_url, '') !~* '/object/public/product-images/'
    and coalesce(detail_url, '') !~* '/object/public/product-images/'
    and coalesce(thumb_url, '') !~* '[?&](token|signature)='
    and coalesce(card_url, '') !~* '[?&](token|signature)='
    and coalesce(detail_url, '') !~* '[?&](token|signature)='
  ),
  constraint storefront_image_publications_shape_check check (
    (width is null or width between 1 and 4096)
    and (height is null or height between 1 and 4096)
    and (
      content_type is null
      or content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
    )
    and (
      content_sha256 is null
      or content_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint storefront_image_publications_ready_shape_check check (
    publication_status not in ('ready', 'published')
    or (
      source_image_version_id is not null
      and thumb_url is not null
      and card_url is not null
      and detail_url is not null
      and width is not null
      and height is not null
      and content_type is not null
      and content_sha256 is not null
    )
  ),
  constraint storefront_image_publications_published_at_check check (
    publication_status <> 'published'
    or published_at is not null
  )
);

create unique index storefront_image_publications_source_version_unique_idx
  on public.storefront_image_publications(shop_id, source_image_version_id)
  where source_image_version_id is not null;
create index storefront_image_publications_product_status_idx
  on public.storefront_image_publications(
    shop_id,
    source_product_id,
    publication_status,
    updated_at desc
  );

create table public.storefront_product_publications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  source_product_id uuid not null references public.inventory_products(id)
    on delete cascade,
  publication_status text not null default 'draft',
  public_name text not null,
  public_description text,
  public_category_id uuid,
  public_brand text,
  retail_price_clp bigint not null,
  compare_at_price_clp bigint,
  price_source_mode text not null default 'override',
  promotion_starts_at timestamptz,
  promotion_ends_at timestamptz,
  featured boolean not null default false,
  sort_rank bigint not null default 0,
  pickup_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  reservation_enabled boolean not null default false,
  availability_mode text not null default 'available',
  published_image_version_id uuid,
  published_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  catalog_version bigint not null default 0,
  constraint storefront_product_publications_shop_id_id_unique unique (shop_id, id),
  constraint storefront_product_publications_shop_source_unique unique (
    shop_id,
    source_product_id
  ),
  constraint storefront_product_publications_category_fkey foreign key (
    shop_id,
    public_category_id
  ) references public.storefront_categories(shop_id, id),
  constraint storefront_product_publications_image_fkey foreign key (
    shop_id,
    published_image_version_id
  ) references public.storefront_image_publications(shop_id, id),
  constraint storefront_product_publications_status_check check (
    publication_status in ('draft', 'scheduled', 'published', 'paused', 'ended')
  ),
  constraint storefront_product_publications_name_check check (
    length(btrim(public_name)) between 1 and 200
  ),
  constraint storefront_product_publications_description_check check (
    public_description is null
    or length(public_description) <= 5000
  ),
  constraint storefront_product_publications_brand_check check (
    public_brand is null
    or length(btrim(public_brand)) between 1 and 120
  ),
  constraint storefront_product_publications_retail_clp_check check (
    retail_price_clp between 0 and 999999999999
  ),
  constraint storefront_product_publications_compare_clp_check check (
    compare_at_price_clp is null
    or (
      compare_at_price_clp between 0 and 999999999999
      and compare_at_price_clp >= retail_price_clp
    )
  ),
  constraint storefront_product_publications_price_source_check check (
    price_source_mode in ('operational', 'override', 'promotion')
  ),
  constraint storefront_product_publications_promotion_window_check check (
    (promotion_starts_at is null and promotion_ends_at is null)
    or (
      promotion_starts_at is not null
      and promotion_ends_at is not null
      and promotion_starts_at < promotion_ends_at
    )
  ),
  constraint storefront_product_publications_fulfillment_check check (
    publication_status not in ('scheduled', 'published')
    or pickup_enabled
    or delivery_enabled
    or reservation_enabled
  ),
  constraint storefront_product_publications_availability_check check (
    availability_mode in (
      'available',
      'low_stock',
      'unavailable',
      'reservation_only',
      'pickup_only',
      'delivery_only'
    )
  ),
  constraint storefront_product_publications_published_at_check check (
    publication_status <> 'published'
    or published_at is not null
  ),
  constraint storefront_product_publications_catalog_version_check check (
    catalog_version >= 0
  )
);

create index storefront_product_publications_shop_status_sort_idx
  on public.storefront_product_publications(
    shop_id,
    publication_status,
    featured desc,
    sort_rank,
    public_name,
    id
  );
create index storefront_product_publications_category_idx
  on public.storefront_product_publications(
    shop_id,
    public_category_id,
    publication_status,
    sort_rank,
    id
  );
create index storefront_product_publications_source_idx
  on public.storefront_product_publications(source_product_id);
create index storefront_product_publications_image_idx
  on public.storefront_product_publications(published_image_version_id)
  where published_image_version_id is not null;

create table public.storefront_promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  public_name text not null,
  public_description text,
  publication_status text not null default 'draft',
  discount_type text not null,
  discount_value bigint not null,
  priority integer not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_profile_id uuid references public.profiles(profile_id),
  constraint storefront_promotions_shop_id_id_unique unique (shop_id, id),
  constraint storefront_promotions_name_check check (
    length(btrim(public_name)) between 1 and 160
  ),
  constraint storefront_promotions_description_check check (
    public_description is null
    or length(public_description) <= 2000
  ),
  constraint storefront_promotions_status_check check (
    publication_status in ('draft', 'scheduled', 'active', 'paused', 'ended')
  ),
  constraint storefront_promotions_discount_type_check check (
    discount_type in ('fixed_price_clp', 'percentage_bps')
  ),
  constraint storefront_promotions_discount_value_check check (
    (
      discount_type = 'fixed_price_clp'
      and discount_value between 0 and 999999999999
    )
    or (
      discount_type = 'percentage_bps'
      and discount_value between 1 and 10000
    )
  ),
  constraint storefront_promotions_window_check check (starts_at < ends_at)
);

create index storefront_promotions_shop_status_window_idx
  on public.storefront_promotions(
    shop_id,
    publication_status,
    starts_at,
    ends_at,
    priority desc,
    id
  );

create table public.storefront_promotion_products (
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  promotion_id uuid not null,
  publication_id uuid not null,
  excluded boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  created_by_profile_id uuid references public.profiles(profile_id),
  primary key (promotion_id, publication_id),
  constraint storefront_promotion_products_promotion_fkey foreign key (
    shop_id,
    promotion_id
  ) references public.storefront_promotions(shop_id, id) on delete cascade,
  constraint storefront_promotion_products_publication_fkey foreign key (
    shop_id,
    publication_id
  ) references public.storefront_product_publications(shop_id, id)
    on delete cascade
);

create index storefront_promotion_products_shop_publication_idx
  on public.storefront_promotion_products(shop_id, publication_id, promotion_id)
  where not excluded;

create or replace function app_private.storefront_touch_updated_at_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create or replace function app_private.storefront_product_matches_shop_v1(
  p_product_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.inventory_products product
      where product.id = p_product_id
        and product.deleted_at is null
        and (
          product.shop_id = p_shop_id
          or (
            product.shop_id is null
            and exists (
              select 1
              from public.shop_inventory_sources source
              where source.shop_id = p_shop_id
                and source.owner_user_id = product.owner_user_id
                and source.mapping_state = 'mapped'
                and source.disabled_at is null
            )
          )
        )
    ),
    false
  );
$$;

create or replace function app_private.storefront_category_matches_shop_v1(
  p_source_category_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_source_category_id is null
    or exists (
      select 1
      from public.inventory_categories category
      where category.id = p_source_category_id
        and category.deleted_at is null
        and (
          category.shop_id = p_shop_id
          or (
            category.shop_id is null
            and exists (
              select 1
              from public.shop_inventory_sources source
              where source.shop_id = p_shop_id
                and source.owner_user_id = category.owner_user_id
                and source.mapping_state = 'mapped'
                and source.disabled_at is null
            )
          )
        )
    );
$$;

create or replace function app_private.storefront_validate_category_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.shops shop
    where shop.shop_id = new.shop_id
      and shop.shop_status <> 'archived'
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront category requires a non-archived shop';
  end if;

  if not app_private.storefront_category_matches_shop_v1(
    new.source_category_id,
    new.shop_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront category source is outside the shop scope';
  end if;

  return new;
end;
$$;

create or replace function app_private.storefront_validate_image_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.storefront_product_matches_shop_v1(
    new.source_product_id,
    new.shop_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront image source product is outside the shop scope';
  end if;

  if new.source_image_version_id is not null and not exists (
    select 1
    from public.inventory_product_image_versions image_version
    where image_version.id = new.source_image_version_id
      and image_version.shop_id = new.shop_id
      and image_version.product_id = new.source_product_id
      and (
        new.publication_status not in ('ready', 'published')
        or image_version.status = 'ready'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront image source version is invalid for the product';
  end if;

  return new;
end;
$$;

create or replace function app_private.storefront_validate_product_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_require_image boolean;
begin
  if not app_private.storefront_product_matches_shop_v1(
    new.source_product_id,
    new.shop_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront publication source product is outside the shop scope';
  end if;

  if new.public_category_id is not null and not exists (
    select 1
    from public.storefront_categories category
    where category.shop_id = new.shop_id
      and category.id = new.public_category_id
      and (
        new.publication_status not in ('scheduled', 'published')
        or category.publication_status = 'published'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront publication category is invalid for the shop';
  end if;

  if new.published_image_version_id is not null and not exists (
    select 1
    from public.storefront_image_publications image_publication
    where image_publication.shop_id = new.shop_id
      and image_publication.id = new.published_image_version_id
      and image_publication.source_product_id = new.source_product_id
      and (
        new.publication_status not in ('scheduled', 'published')
        or image_publication.publication_status = 'published'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront publication image is invalid for the product';
  end if;

  select setting.require_product_image
  into v_require_image
  from public.storefront_settings setting
  where setting.shop_id = new.shop_id;

  if new.publication_status in ('scheduled', 'published') then
    if new.public_category_id is null then
      raise exception using
        errcode = '23514',
        message = 'published storefront products require a public category';
    end if;

    if coalesce(v_require_image, true)
      and new.published_image_version_id is null then
      raise exception using
        errcode = '23514',
        message = 'published storefront products require a published image';
    end if;
  end if;

  return new;
end;
$$;

create trigger storefront_settings_touch_updated_at
  before update on public.storefront_settings
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger storefront_categories_touch_updated_at
  before update on public.storefront_categories
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger storefront_images_touch_updated_at
  before update on public.storefront_image_publications
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger storefront_publications_touch_updated_at
  before update on public.storefront_product_publications
  for each row execute function app_private.storefront_touch_updated_at_v1();
create trigger storefront_promotions_touch_updated_at
  before update on public.storefront_promotions
  for each row execute function app_private.storefront_touch_updated_at_v1();

create trigger storefront_categories_validate
  before insert or update on public.storefront_categories
  for each row execute function app_private.storefront_validate_category_v1();
create trigger storefront_images_validate
  before insert or update on public.storefront_image_publications
  for each row execute function app_private.storefront_validate_image_publication_v1();
create trigger storefront_publications_validate
  before insert or update on public.storefront_product_publications
  for each row execute function app_private.storefront_validate_product_publication_v1();

alter table public.storefront_settings enable row level security;
alter table public.storefront_settings force row level security;
alter table public.storefront_categories enable row level security;
alter table public.storefront_categories force row level security;
alter table public.storefront_image_publications enable row level security;
alter table public.storefront_image_publications force row level security;
alter table public.storefront_product_publications enable row level security;
alter table public.storefront_product_publications force row level security;
alter table public.storefront_promotions enable row level security;
alter table public.storefront_promotions force row level security;
alter table public.storefront_promotion_products enable row level security;
alter table public.storefront_promotion_products force row level security;

revoke all on table public.storefront_settings
  from public, anon, authenticated;
revoke all on table public.storefront_categories
  from public, anon, authenticated;
revoke all on table public.storefront_image_publications
  from public, anon, authenticated;
revoke all on table public.storefront_product_publications
  from public, anon, authenticated;
revoke all on table public.storefront_promotions
  from public, anon, authenticated;
revoke all on table public.storefront_promotion_products
  from public, anon, authenticated;

grant select, insert, update, delete on table public.storefront_settings
  to service_role;
grant select, insert, update, delete on table public.storefront_categories
  to service_role;
grant select, insert, update, delete on table public.storefront_image_publications
  to service_role;
grant select, insert, update, delete on table public.storefront_product_publications
  to service_role;
grant select, insert, update, delete on table public.storefront_promotions
  to service_role;
grant select, insert, update, delete on table public.storefront_promotion_products
  to service_role;

revoke all on function app_private.storefront_touch_updated_at_v1()
  from public, anon, authenticated;
revoke all on function app_private.storefront_product_matches_shop_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.storefront_category_matches_shop_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function app_private.storefront_validate_category_v1()
  from public, anon, authenticated;
revoke all on function app_private.storefront_validate_image_publication_v1()
  from public, anon, authenticated;
revoke all on function app_private.storefront_validate_product_publication_v1()
  from public, anon, authenticated;

comment on table public.storefront_product_publications is
  'Authoritative Storefront authoring rows. Public clients consume only the versioned projection contract.';
comment on column public.storefront_product_publications.source_product_id is
  'Stable internal inventory reference; never emitted by the public Storefront contract.';
comment on table public.storefront_image_publications is
  'Approved public image metadata only; private product-images Storage paths are never copied here.';

commit;
