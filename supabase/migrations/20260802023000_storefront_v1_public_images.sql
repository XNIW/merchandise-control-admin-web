begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'storefront-product-images',
  'storefront-product-images',
  true,
  921600,
  array['image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table app_private.storefront_runtime_config (
  config_key text primary key,
  config_value text not null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint storefront_runtime_config_key_check check (
    config_key = 'public_asset_origin'
  ),
  constraint storefront_runtime_config_value_check check (
    config_value ~ '^https://([a-z0-9]{20}\.supabase\.co|local\.supabase\.invalid)$'
  )
);
revoke all on table app_private.storefront_runtime_config
  from public, anon, authenticated, service_role;

create or replace function public.storefront_image_configure_origin_v1(
  p_origin text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
begin
  if auth.role() <> 'service_role'
    or p_origin !~ '^https://([a-z0-9]{20}\.supabase\.co|local\.supabase\.invalid)$' then
    raise exception 'Storefront image origin configuration is service-only'
      using errcode = '42501';
  end if;
  insert into app_private.storefront_runtime_config(config_key, config_value)
  values ('public_asset_origin', p_origin)
  on conflict (config_key) do update
  set config_value = excluded.config_value,
      updated_at = statement_timestamp();
  return jsonb_build_object('ok', true, 'code', 'success');
end;
$$;

create table public.storefront_image_publication_variants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  image_publication_id uuid not null,
  variant text not null,
  object_path text not null,
  public_url text,
  publication_status text not null default 'pending',
  expected_bytes integer not null,
  expected_width integer not null,
  expected_height integer not null,
  expected_sha256 text not null,
  verified_bytes integer,
  verified_width integer,
  verified_height integer,
  verified_sha256 text,
  content_type text not null default 'image/webp',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  ready_at timestamptz,
  cleanup_after timestamptz,
  cleanup_claimed_at timestamptz,
  cleanup_attempts integer not null default 0,
  cleanup_last_error text,
  constraint storefront_image_variants_image_fkey foreign key (
    shop_id, image_publication_id
  ) references public.storefront_image_publications(shop_id, id) on delete cascade,
  constraint storefront_image_variants_image_variant_unique unique (
    image_publication_id, variant
  ),
  constraint storefront_image_variants_object_path_unique unique (object_path),
  constraint storefront_image_variants_variant_check check (
    variant in ('thumb', 'card', 'detail')
  ),
  constraint storefront_image_variants_status_check check (
    publication_status in (
      'pending', 'ready', 'superseded', 'cleanup_pending', 'removed', 'failed'
    )
  ),
  constraint storefront_image_variants_path_check check (
    object_path ~ '^shops/[0-9a-f-]{36}/products/[0-9a-f-]{36}/public/[0-9a-f-]{36}/(thumb|card|detail)-[0-9a-f]{16}\.webp$'
    and object_path !~ '(^|/)\.\.?(/|$)'
  ),
  constraint storefront_image_variants_url_check check (
    public_url is null or (
      public_url ~ '^https://[^[:space:]]+/storage/v1/object/public/storefront-product-images/'
      and public_url !~* '/object/sign/'
      and public_url !~* '[?&](token|signature)='
    )
  ),
  constraint storefront_image_variants_expected_check check (
    expected_bytes between 1 and case variant
      when 'thumb' then 122880 when 'card' then 368640 else 921600 end
    and expected_width between 1 and case variant
      when 'thumb' then 384 when 'card' then 960 else 1600 end
    and expected_height between 1 and case variant
      when 'thumb' then 384 when 'card' then 960 else 1600 end
    and expected_sha256 ~ '^[0-9a-f]{64}$'
    and content_type = 'image/webp'
  ),
  constraint storefront_image_variants_verified_check check (
    (publication_status in ('pending', 'failed')
      and verified_bytes is null and verified_width is null
      and verified_height is null and verified_sha256 is null
      and ready_at is null)
    or
    (publication_status in ('ready', 'superseded', 'cleanup_pending', 'removed')
      and verified_bytes = expected_bytes
      and verified_width = expected_width
      and verified_height = expected_height
      and verified_sha256 = expected_sha256
      and public_url is not null and ready_at is not null)
  ),
  constraint storefront_image_variants_cleanup_check check (
    cleanup_attempts between 0 and 100
    and (cleanup_last_error is null or length(cleanup_last_error) <= 80)
  )
);

create index storefront_image_variants_cleanup_idx
  on public.storefront_image_publication_variants(
    publication_status, cleanup_after, cleanup_claimed_at, id
  ) where publication_status in ('cleanup_pending', 'removed', 'failed');
create index storefront_image_variants_shop_image_idx
  on public.storefront_image_publication_variants(shop_id, image_publication_id);

create trigger storefront_image_variants_touch_updated_at
  before update on public.storefront_image_publication_variants
  for each row execute function app_private.storefront_touch_updated_at_v1();

alter table public.storefront_image_publication_variants enable row level security;
alter table public.storefront_image_publication_variants force row level security;
revoke all on table public.storefront_image_publication_variants
  from public, anon, authenticated;
grant select, insert, update, delete on table public.storefront_image_publication_variants
  to service_role;

-- A rollback may republish a public artifact derived from an operational image that
-- has since become superseded. Superseded operational versions were previously ready
-- and approved; removed/failed/pending sources remain ineligible.
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
        or image_version.status in ('ready', 'superseded')
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'storefront image source version is invalid for the product';
  end if;

  return new;
end;
$$;

-- Public object reads are provided by the public bucket. No policy grants writes for
-- this bucket; only short-lived signed upload URLs minted by the server-side Admin
-- boundary can create an object. Existing policies for the private operational bucket
-- remain untouched.

create or replace function app_private.storefront_image_actor_v1(
  p_staff_id uuid
)
returns table(actor_profile_id uuid, actor_staff_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.role() = 'authenticated' then auth.uid() end,
         case when auth.role() = 'service_role' then p_staff_id end
$$;

revoke all on function app_private.storefront_image_actor_v1(uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_image_variants_valid_v1(
  p_variants jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  with variants as (
    select value as item
    from jsonb_array_elements(
      case when jsonb_typeof(p_variants) = 'array' then p_variants else '[]'::jsonb end
    )
  ), parsed as (
    select
      item->>'variant' as variant,
      case when item->>'bytes' ~ '^[0-9]+$' then (item->>'bytes')::integer end as bytes,
      case when item->>'width' ~ '^[0-9]+$' then (item->>'width')::integer end as width,
      case when item->>'height' ~ '^[0-9]+$' then (item->>'height')::integer end as height,
      item->>'sha256' as sha256,
      item->>'mimeType' as mime_type
    from variants
  )
  select count(*) = 3
    and count(distinct variant) = 3
    and bool_and(variant in ('thumb', 'card', 'detail'))
    and bool_and(mime_type = 'image/webp')
    and bool_and(sha256 ~ '^[0-9a-f]{64}$')
    and bool_and(bytes between 1 and case variant
      when 'thumb' then 122880 when 'card' then 368640 else 921600 end)
    and bool_and(width between 1 and case variant
      when 'thumb' then 384 when 'card' then 960 else 1600 end)
    and bool_and(height between 1 and case variant
      when 'thumb' then 384 when 'card' then 960 else 1600 end)
    and max(width::numeric / height) - min(width::numeric / height) <= 0.02
  from parsed
$$;

revoke all on function app_private.storefront_image_variants_valid_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.admin_storefront_images_read_v1(
  p_shop_id uuid,
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
  v_candidates jsonb := '[]'::jsonb;
  v_images jsonb := '[]'::jsonb;
begin
  if p_shop_id is null or not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'publicationId', publication.id,
    'sourceProductId', publication.source_product_id,
    'sourceImageVersionId', source_image.id,
    'name', publication.public_name,
    'sourceReady', source_image.status = 'ready',
    'currentPublicImageId', publication.published_image_version_id
  ) order by publication.public_name, publication.id), '[]'::jsonb)
  into v_candidates
  from public.storefront_product_publications publication
  join public.inventory_products product
    on product.id = publication.source_product_id
    and product.primary_image_version_id is not null
  join public.inventory_product_image_versions source_image
    on source_image.id = product.primary_image_version_id
    and source_image.shop_id = p_shop_id
    and source_image.product_id = product.id
  where publication.shop_id = p_shop_id
    and product.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', image_publication.id,
    'sourceProductId', image_publication.source_product_id,
    'sourceImageVersionId', image_publication.source_image_version_id,
    'status', image_publication.publication_status,
    'thumbUrl', image_publication.thumb_url,
    'cardUrl', image_publication.card_url,
    'detailUrl', image_publication.detail_url,
    'publishedAt', image_publication.published_at,
    'updatedAt', image_publication.updated_at,
    'current', publication.published_image_version_id = image_publication.id
  ) order by image_publication.updated_at desc, image_publication.id), '[]'::jsonb)
  into v_images
  from public.storefront_image_publications image_publication
  join public.storefront_product_publications publication
    on publication.shop_id = image_publication.shop_id
    and publication.source_product_id = image_publication.source_product_id
  where image_publication.shop_id = p_shop_id
    and image_publication.publication_status in ('ready', 'published', 'superseded');

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before image publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shopId', p_shop_id,
    'candidates', v_candidates, 'images', v_images
  );
end;
$$;

create or replace function public.admin_storefront_image_source_read_v1(
  p_shop_id uuid,
  p_publication_id uuid,
  p_source_image_version_id uuid,
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
  v_source record;
begin
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select source_image.* into v_source
  from public.storefront_product_publications publication
  join public.inventory_products product
    on product.id = publication.source_product_id
    and product.primary_image_version_id = p_source_image_version_id
  join public.inventory_product_image_versions source_image
    on source_image.id = p_source_image_version_id
    and source_image.product_id = publication.source_product_id
    and source_image.shop_id = publication.shop_id
  where publication.id = p_publication_id
    and publication.shop_id = p_shop_id
    and source_image.status = 'ready'
  for share of publication, product, source_image;

  if v_source.id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before source read'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shopId', p_shop_id,
    'productId', v_source.product_id, 'sourceImageVersionId', v_source.id,
    'path', v_source.main_path,
    'bytes', v_source.verified_main_bytes,
    'width', v_source.verified_main_width,
    'height', v_source.verified_main_height,
    'sha256', v_source.verified_main_sha256,
    'mimeType', v_source.verified_main_mime_type
  );
end;
$$;

create or replace function public.admin_storefront_image_intent_v1(
  p_shop_id uuid,
  p_publication_id uuid,
  p_source_image_version_id uuid,
  p_variants jsonb,
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
  v_actor record;
  v_existing record;
  v_image_id uuid;
  v_product_id uuid;
  v_version_key text;
  v_paths jsonb;
  v_input jsonb;
  v_matches boolean;
  v_audit_id uuid;
begin
  if p_shop_id is null or p_publication_id is null
    or p_source_image_version_id is null
    or not app_private.storefront_image_variants_valid_v1(p_variants) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':storefront-images', 0));

  select publication.source_product_id into v_product_id
  from public.storefront_product_publications publication
  join public.inventory_products product
    on product.id = publication.source_product_id
    and product.primary_image_version_id = p_source_image_version_id
  join public.inventory_product_image_versions source_image
    on source_image.id = p_source_image_version_id
    and source_image.shop_id = p_shop_id
    and source_image.product_id = publication.source_product_id
    and source_image.status = 'ready'
  where publication.id = p_publication_id
    and publication.shop_id = p_shop_id
  for update of publication, product, source_image;

  if v_product_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  select * into v_existing
  from public.storefront_image_publications image_publication
  where image_publication.shop_id = p_shop_id
    and image_publication.source_image_version_id = p_source_image_version_id
  for update;

  if v_existing.id is not null then
    with requested as (
      select item->>'variant' as variant,
        (item->>'bytes')::integer as bytes,
        (item->>'width')::integer as width,
        (item->>'height')::integer as height,
        item->>'sha256' as sha256
      from jsonb_array_elements(p_variants) item
    )
    select count(*) = 3 and bool_and(
      stored.expected_bytes = requested.bytes
      and stored.expected_width = requested.width
      and stored.expected_height = requested.height
      and stored.expected_sha256 = requested.sha256
    ) into v_matches
    from requested
    join public.storefront_image_publication_variants stored
      on stored.image_publication_id = v_existing.id
      and stored.variant = requested.variant;

    if not coalesce(v_matches, false) then
      return jsonb_build_object('ok', false, 'code', 'stale_conflict');
    end if;
    v_image_id := v_existing.id;
  else
    v_image_id := gen_random_uuid();
    v_version_key := 'webp-' || replace(p_source_image_version_id::text, '-', '');
    insert into public.storefront_image_publications (
      id, shop_id, source_product_id, source_image_version_id,
      publication_status, version_key
    ) values (
      v_image_id, p_shop_id, v_product_id, p_source_image_version_id,
      'draft', v_version_key
    );

    for v_input in select value from jsonb_array_elements(p_variants)
    loop
      insert into public.storefront_image_publication_variants (
        shop_id, image_publication_id, variant, object_path,
        expected_bytes, expected_width, expected_height, expected_sha256
      ) values (
        p_shop_id,
        v_image_id,
        v_input->>'variant',
        'shops/' || p_shop_id || '/products/' || v_product_id || '/public/' ||
          v_image_id || '/' || (v_input->>'variant') || '-' ||
          left(v_input->>'sha256', 16) || '.webp',
        (v_input->>'bytes')::integer,
        (v_input->>'width')::integer,
        (v_input->>'height')::integer,
        v_input->>'sha256'
      );
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'variant', variant.variant,
    'path', variant.object_path,
    'status', variant.publication_status
  ) order by array_position(array['thumb','card','detail'], variant.variant)), '[]'::jsonb)
  into v_paths
  from public.storefront_image_publication_variants variant
  where variant.image_publication_id = v_image_id;

  select * into v_actor from app_private.storefront_image_actor_v1(p_staff_id);
  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor.actor_profile_id, v_actor.actor_staff_id, 'shop', p_shop_id,
    'shop.storefront.image.intent.success', 'info', 'success',
    'storefront_image_publication', v_image_id::text,
    jsonb_build_object(
      'code', 'success', 'source', 'storefront_image_pipeline',
      'publicationId', p_publication_id, 'sourceImageVersionId', p_source_image_version_id
    )
  ) returning audit_log_id into v_audit_id;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before image intent'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shopId', p_shop_id,
    'targetId', v_image_id, 'productId', v_product_id,
    'status', case when v_existing.publication_status in ('ready','published','superseded')
      then 'noop' else 'upload_required' end,
    'variants', v_paths, 'auditEventId', v_audit_id
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'stale_conflict');
  when check_violation or foreign_key_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
end;
$$;

create or replace function public.admin_storefront_image_finalize_v1(
  p_shop_id uuid,
  p_image_publication_id uuid,
  p_verified_variants jsonb,
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
set statement_timeout = '8s'
as $$
declare
  v_actor record;
  v_before jsonb;
  v_current_id uuid;
  v_image record;
  v_matches boolean;
  v_urls jsonb;
  v_public_asset_origin text;
  v_audit_id uuid;
begin
  if p_shop_id is null or p_image_publication_id is null
    or jsonb_typeof(p_verified_variants) <> 'array'
    or jsonb_array_length(p_verified_variants) <> 3 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  select config_value into v_public_asset_origin
  from app_private.storefront_runtime_config
  where config_key = 'public_asset_origin';
  if v_public_asset_origin is null then
    return jsonb_build_object('ok', false, 'code', 'not_configured');
  end if;
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':storefront-images', 0));
  select * into v_image
  from public.storefront_image_publications image_publication
  where image_publication.shop_id = p_shop_id
    and image_publication.id = p_image_publication_id
  for update;
  if v_image.id is null or v_image.publication_status in ('removed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;
  if v_image.publication_status <> 'published' and not exists (
    select 1 from public.inventory_product_image_versions source_image
    where source_image.id = v_image.source_image_version_id
      and source_image.shop_id = p_shop_id
      and source_image.product_id = v_image.source_product_id
      and source_image.status = 'ready'
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;

  with verified as (
    select item->>'variant' as variant,
      case when item->>'bytes' ~ '^[0-9]+$' then (item->>'bytes')::integer end as bytes,
      case when item->>'width' ~ '^[0-9]+$' then (item->>'width')::integer end as width,
      case when item->>'height' ~ '^[0-9]+$' then (item->>'height')::integer end as height,
      item->>'sha256' as sha256,
      item->>'publicUrl' as ignored_public_url
    from jsonb_array_elements(p_verified_variants) item
  )
  select count(*) = 3 and count(distinct verified.variant) = 3 and bool_and(
    stored.expected_bytes = verified.bytes
    and stored.expected_width = verified.width
    and stored.expected_height = verified.height
    and stored.expected_sha256 = verified.sha256
  ) into v_matches
  from verified
  join public.storefront_image_publication_variants stored
    on stored.image_publication_id = p_image_publication_id
    and stored.variant = verified.variant;
  if not coalesce(v_matches, false) then
    return jsonb_build_object('ok', false, 'code', 'verified_metadata_mismatch');
  end if;

  select to_jsonb(image_publication) into v_before
  from public.storefront_image_publications image_publication
  where image_publication.id = p_image_publication_id;

  with verified as (
    select item->>'variant' as variant,
      (item->>'bytes')::integer as bytes,
      (item->>'width')::integer as width,
      (item->>'height')::integer as height,
      item->>'sha256' as sha256,
      item->>'publicUrl' as ignored_public_url
    from jsonb_array_elements(p_verified_variants) item
  )
  update public.storefront_image_publication_variants stored
  set publication_status = 'ready',
      verified_bytes = verified.bytes,
      verified_width = verified.width,
      verified_height = verified.height,
      verified_sha256 = verified.sha256,
      public_url = v_public_asset_origin ||
        '/storage/v1/object/public/storefront-product-images/' || stored.object_path,
      ready_at = coalesce(stored.ready_at, statement_timestamp()),
      cleanup_after = null,
      cleanup_claimed_at = null,
      cleanup_last_error = null
  from verified
  where stored.image_publication_id = p_image_publication_id
    and stored.variant = verified.variant;

  select jsonb_object_agg(variant, public_url) into v_urls
  from public.storefront_image_publication_variants
  where image_publication_id = p_image_publication_id;

  update public.storefront_image_publications
  set publication_status = 'published',
      thumb_url = v_urls->>'thumb', card_url = v_urls->>'card',
      detail_url = v_urls->>'detail',
      width = (select verified_width from public.storefront_image_publication_variants
        where image_publication_id = p_image_publication_id and variant = 'detail'),
      height = (select verified_height from public.storefront_image_publication_variants
        where image_publication_id = p_image_publication_id and variant = 'detail'),
      content_type = 'image/webp',
      content_sha256 = (select verified_sha256 from public.storefront_image_publication_variants
        where image_publication_id = p_image_publication_id and variant = 'detail'),
      published_at = coalesce(published_at, statement_timestamp()),
      updated_by_profile_id = case when auth.role() = 'authenticated' then auth.uid() end
  where id = p_image_publication_id;

  select publication.published_image_version_id into v_current_id
  from public.storefront_product_publications publication
  where publication.shop_id = p_shop_id
    and publication.source_product_id = v_image.source_product_id
  for update;

  update public.storefront_product_publications publication
  set published_image_version_id = p_image_publication_id,
      updated_by_profile_id = case when auth.role() = 'authenticated' then auth.uid() end
  where publication.shop_id = p_shop_id
    and publication.source_product_id = v_image.source_product_id;

  if v_current_id is not null and v_current_id <> p_image_publication_id then
    update public.storefront_image_publications
    set publication_status = 'superseded'
    where id = v_current_id and shop_id = p_shop_id;
    update public.storefront_image_publication_variants
    set publication_status = 'superseded',
        cleanup_after = statement_timestamp() + interval '30 days'
    where image_publication_id = v_current_id;
  end if;

  select * into v_actor from app_private.storefront_image_actor_v1(p_staff_id);
  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor.actor_profile_id, v_actor.actor_staff_id, 'shop', p_shop_id,
    'shop.storefront.image.publish.success', 'info', 'success',
    'storefront_image_publication', p_image_publication_id::text,
    jsonb_build_object(
      'code', 'success', 'source', 'storefront_image_pipeline',
      'before', v_before,
      'after', jsonb_build_object('status', 'published', 'previousImageId', v_current_id)
    )
  ) returning audit_log_id into v_audit_id;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before image publication'
      using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'shopId', p_shop_id,
    'targetId', p_image_publication_id, 'auditEventId', v_audit_id,
    'status', case when v_image.publication_status = 'published'
      and v_current_id = p_image_publication_id then 'noop' else 'published' end
  );
exception
  when check_violation or foreign_key_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
end;
$$;

create or replace function public.admin_storefront_image_rollback_v1(
  p_shop_id uuid,
  p_target_image_publication_id uuid,
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
set statement_timeout = '8s'
as $$
declare
  v_actor record;
  v_current_id uuid;
  v_product_id uuid;
  v_audit_id uuid;
begin
  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then return jsonb_build_object('ok', false, 'code', 'permission_denied'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':storefront-images', 0));

  select image_publication.source_product_id into v_product_id
  from public.storefront_image_publications image_publication
  where image_publication.shop_id = p_shop_id
    and image_publication.id = p_target_image_publication_id
    and image_publication.publication_status in ('published', 'superseded')
    and not exists (
      select 1 from public.storefront_image_publication_variants variant
      where variant.image_publication_id = image_publication.id
        and variant.publication_status not in ('ready', 'superseded')
    )
  for update;
  if v_product_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  select published_image_version_id into v_current_id
  from public.storefront_product_publications
  where shop_id = p_shop_id and source_product_id = v_product_id
  for update;
  if v_current_id = p_target_image_publication_id then
    return jsonb_build_object('ok', true, 'code', 'success', 'status', 'noop',
      'shopId', p_shop_id, 'targetId', p_target_image_publication_id);
  end if;

  update public.storefront_image_publications
  set publication_status = 'published'
  where id = p_target_image_publication_id;
  update public.storefront_image_publication_variants
  set publication_status = 'ready', cleanup_after = null, cleanup_claimed_at = null
  where image_publication_id = p_target_image_publication_id;
  update public.storefront_product_publications
  set published_image_version_id = p_target_image_publication_id,
      updated_by_profile_id = case when auth.role() = 'authenticated' then auth.uid() end
  where shop_id = p_shop_id and source_product_id = v_product_id;
  if v_current_id is not null then
    update public.storefront_image_publications set publication_status = 'superseded'
    where id = v_current_id;
    update public.storefront_image_publication_variants
    set publication_status = 'superseded',
        cleanup_after = statement_timestamp() + interval '30 days'
    where image_publication_id = v_current_id;
  end if;

  select * into v_actor from app_private.storefront_image_actor_v1(p_staff_id);
  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    v_actor.actor_profile_id, v_actor.actor_staff_id, 'shop', p_shop_id,
    'shop.storefront.image.rollback.success', 'warning', 'success',
    'storefront_image_publication', p_target_image_publication_id::text,
    jsonb_build_object('code', 'success', 'source', 'storefront_image_pipeline',
      'before', jsonb_build_object('imageId', v_current_id),
      'after', jsonb_build_object('imageId', p_target_image_publication_id))
  ) returning audit_log_id into v_audit_id;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.images.manage', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then raise exception 'Storefront Admin authorization expired before image rollback'
    using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'code', 'success', 'status', 'rolled_back',
    'shopId', p_shop_id, 'targetId', p_target_image_publication_id,
    'auditEventId', v_audit_id);
end;
$$;

create or replace function public.storefront_image_cleanup_claim_v1(
  p_limit integer default 50
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare v_rows jsonb;
begin
  if auth.role() <> 'service_role' or coalesce(p_limit, 0) not between 1 and 100 then
    raise exception 'Storefront image cleanup is service-only' using errcode = '42501';
  end if;
  with candidates as (
    select variant.id
    from public.storefront_image_publication_variants variant
    join public.storefront_image_publications image_publication
      on image_publication.id = variant.image_publication_id
    where (
      (variant.publication_status = 'pending' and variant.created_at < statement_timestamp() - interval '1 hour')
      or (variant.publication_status = 'failed' and variant.created_at < statement_timestamp() - interval '1 hour')
      or (variant.publication_status = 'superseded' and variant.cleanup_after < statement_timestamp())
      or (variant.publication_status = 'cleanup_pending'
        and variant.cleanup_claimed_at < statement_timestamp() - interval '15 minutes')
    )
    and not exists (
      select 1 from public.storefront_product_publications publication
      where publication.published_image_version_id = variant.image_publication_id
    )
    order by coalesce(variant.cleanup_after, variant.created_at), variant.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.storefront_image_publication_variants variant
    set publication_status = 'cleanup_pending',
        cleanup_claimed_at = statement_timestamp(),
        cleanup_attempts = cleanup_attempts + 1,
        cleanup_last_error = null
    from candidates where variant.id = candidates.id
    returning variant.id, variant.shop_id, variant.image_publication_id,
      variant.variant, variant.object_path
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into v_rows from claimed;
  return jsonb_build_object('ok', true, 'code', 'success', 'items', v_rows);
end;
$$;

create or replace function public.storefront_image_cleanup_complete_v1(
  p_variant_id uuid,
  p_removed boolean,
  p_error_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare v_image_id uuid;
begin
  if auth.role() <> 'service_role' or p_variant_id is null
    or (not p_removed and (p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,80}$')) then
    raise exception 'Invalid Storefront image cleanup completion' using errcode = '42501';
  end if;
  update public.storefront_image_publication_variants
  set publication_status = case when p_removed then 'removed' else 'cleanup_pending' end,
      cleanup_claimed_at = case when p_removed then null else statement_timestamp() end,
      cleanup_last_error = case when p_removed then null else p_error_code end
  where id = p_variant_id and publication_status = 'cleanup_pending'
  returning image_publication_id into v_image_id;
  if v_image_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;
  if not exists (
    select 1 from public.storefront_image_publication_variants
    where image_publication_id = v_image_id and publication_status <> 'removed'
  ) then
    update public.storefront_image_publications
    set publication_status = 'removed'
    where id = v_image_id and publication_status <> 'published';
  end if;
  return jsonb_build_object('ok', true, 'code', 'success', 'targetId', p_variant_id);
end;
$$;

revoke all on function public.admin_storefront_images_read_v1(uuid,uuid,uuid,text,integer)
  from public, anon;
revoke all on function public.admin_storefront_image_source_read_v1(uuid,uuid,uuid,uuid,uuid,text,integer)
  from public, anon;
revoke all on function public.admin_storefront_image_intent_v1(uuid,uuid,uuid,jsonb,uuid,uuid,text,integer)
  from public, anon;
revoke all on function public.admin_storefront_image_finalize_v1(uuid,uuid,jsonb,uuid,uuid,text,integer)
  from public, anon;
revoke all on function public.admin_storefront_image_rollback_v1(uuid,uuid,uuid,uuid,text,integer)
  from public, anon;
revoke all on function public.storefront_image_cleanup_claim_v1(integer)
  from public, anon, authenticated;
revoke all on function public.storefront_image_cleanup_complete_v1(uuid,boolean,text)
  from public, anon, authenticated;
revoke all on function public.storefront_image_configure_origin_v1(text)
  from public, anon, authenticated;

grant execute on function public.admin_storefront_images_read_v1(uuid,uuid,uuid,text,integer)
  to authenticated, service_role;
grant execute on function public.admin_storefront_image_source_read_v1(uuid,uuid,uuid,uuid,uuid,text,integer)
  to authenticated, service_role;
grant execute on function public.admin_storefront_image_intent_v1(uuid,uuid,uuid,jsonb,uuid,uuid,text,integer)
  to authenticated, service_role;
grant execute on function public.admin_storefront_image_finalize_v1(uuid,uuid,jsonb,uuid,uuid,text,integer)
  to authenticated, service_role;
grant execute on function public.admin_storefront_image_rollback_v1(uuid,uuid,uuid,uuid,text,integer)
  to authenticated, service_role;
grant execute on function public.storefront_image_cleanup_claim_v1(integer)
  to service_role;
grant execute on function public.storefront_image_cleanup_complete_v1(uuid,boolean,text)
  to service_role;
grant execute on function public.storefront_image_configure_origin_v1(text)
  to service_role;

comment on table public.storefront_image_publication_variants is
  'Immutable public WebP derivatives. Public reads use the separate Storefront bucket; writes are server-minted only.';
comment on function public.admin_storefront_image_finalize_v1(uuid,uuid,jsonb,uuid,uuid,text,integer) is
  'Revalidates the Admin lease and atomically publishes verified derivatives, swaps the catalog image, supersedes the prior version, and audits.';

notify pgrst, 'reload schema';
commit;
