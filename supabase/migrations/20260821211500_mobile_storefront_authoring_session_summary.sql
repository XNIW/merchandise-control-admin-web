-- MOBILE_STOREFRONT_PRODUCT_CONTROL — Android/iOS integration hardening.
-- Additive only: session-scoped audit attribution, bounded list projection and
-- public image URLs for the existing authoring snapshot.

create table if not exists app_private.storefront_authoring_client_sessions (
  auth_session_id uuid primary key,
  actor_profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  mutation_source text not null check (mutation_source in ('android', 'ios')),
  bound_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint storefront_authoring_client_session_expiry_check
    check (expires_at > bound_at)
);

create index if not exists storefront_authoring_client_sessions_actor_idx
  on app_private.storefront_authoring_client_sessions(actor_profile_id, expires_at);

revoke all on table app_private.storefront_authoring_client_sessions
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_authoring_bind_client_session_v1(
  p_source text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_session_id uuid;
  v_expires_at timestamptz;
  v_bound app_private.storefront_authoring_client_sessions%rowtype;
begin
  if auth.role() <> 'authenticated'
    or auth.uid() is null
    or p_source not in ('android', 'ios') then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  begin
    v_session_id := (auth.jwt()->>'session_id')::uuid;
    v_expires_at := to_timestamp((auth.jwt()->>'exp')::double precision);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'session_unavailable');
  end;

  if v_session_id is null
    or v_expires_at is null
    or v_expires_at <= statement_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;

  insert into app_private.storefront_authoring_client_sessions (
    auth_session_id, actor_profile_id, mutation_source, expires_at
  ) values (
    v_session_id, auth.uid(), p_source, v_expires_at
  ) on conflict (auth_session_id) do nothing;

  select session.* into v_bound
  from app_private.storefront_authoring_client_sessions session
  where session.auth_session_id = v_session_id
    and session.actor_profile_id = auth.uid()
    and session.expires_at > statement_timestamp();

  if not found then
    return jsonb_build_object('ok', false, 'code', 'session_expired');
  end if;
  if v_bound.mutation_source <> p_source then
    return jsonb_build_object(
      'ok', false,
      'code', 'session_source_conflict',
      'source', v_bound.mutation_source
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'source', v_bound.mutation_source,
    'expiresAt', v_bound.expires_at
  );
end;
$$;

revoke all on function app_private.storefront_authoring_bind_client_session_v1(text)
  from public, anon, authenticated, service_role;

create or replace function public.storefront_authoring_bind_android_session_v1()
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.storefront_authoring_bind_client_session_v1('android');
$$;

create or replace function public.storefront_authoring_bind_ios_session_v1()
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select app_private.storefront_authoring_bind_client_session_v1('ios');
$$;

revoke all on function public.storefront_authoring_bind_android_session_v1()
  from public, anon, service_role;
revoke all on function public.storefront_authoring_bind_ios_session_v1()
  from public, anon, service_role;
grant execute on function public.storefront_authoring_bind_android_session_v1()
  to authenticated;
grant execute on function public.storefront_authoring_bind_ios_session_v1()
  to authenticated;

create or replace function app_private.storefront_authoring_source_v1()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.role() = 'authenticated' then coalesce((
      select session.mutation_source
      from app_private.storefront_authoring_client_sessions session
      where session.auth_session_id = case
          when coalesce(auth.jwt()->>'session_id', '') ~
            '^[0-9a-fA-F-]{36}$'
          then (auth.jwt()->>'session_id')::uuid
        end
        and session.actor_profile_id = auth.uid()
        and session.expires_at > statement_timestamp()
    ), 'admin')
    when auth.role() = 'service_role' then 'admin'
    else 'system'
  end;
$$;

revoke all on function app_private.storefront_authoring_source_v1()
  from public, anon, authenticated, service_role;

create or replace function app_private.storefront_publication_snapshot_v1(
  p_shop_id uuid,
  p_publication_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'publicationId', publication.id,
      'sourceProductId', publication.source_product_id,
      'status', publication.publication_status,
      'publicName', publication.public_name,
      'publicDescription', publication.public_description,
      'storefrontCategoryId', publication.public_category_id,
      'publicBrand', publication.public_brand,
      'publicPrice', publication.retail_price_clp,
      'compareAtPrice', publication.compare_at_price_clp,
      'priceSourceMode', publication.price_source_mode,
      'promotionStartsAt', publication.promotion_starts_at,
      'promotionEndsAt', publication.promotion_ends_at,
      'featured', publication.featured,
      'homeOrder', publication.sort_rank,
      'pickupEnabled', publication.pickup_enabled,
      'deliveryEnabled', publication.delivery_enabled,
      'reservationEnabled', publication.reservation_enabled,
      'availability', publication.availability_mode,
      'publicImageId', publication.published_image_version_id,
      'publicImageThumbnailUrl', image_publication.thumb_url,
      'publicImageDetailUrl', image_publication.detail_url,
      'version', publication.catalog_version,
      'updatedAt', publication.updated_at,
      'mutationSource', publication.last_mutation_source,
      'changedFields', publication.last_changed_fields
    )
    from public.storefront_product_publications publication
    left join public.storefront_image_publications image_publication
      on image_publication.shop_id = publication.shop_id
      and image_publication.id = publication.published_image_version_id
      and image_publication.publication_status in ('ready', 'published')
    where publication.shop_id = p_shop_id
      and publication.id = p_publication_id
  ), 'null'::jsonb);
$$;

revoke all on function app_private.storefront_publication_snapshot_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.storefront_publications_authoring_summary_v1(
  p_shop_id uuid,
  p_filter text default 'all',
  p_query text default null,
  p_source_product_ids uuid[] default null,
  p_page integer default 1,
  p_page_size integer default 100,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if p_shop_id is null
    or p_filter not in (
      'all', 'published', 'unpublished', 'draft', 'scheduled', 'hidden',
      'needs_update'
    )
    or coalesce(length(v_query), 0) > 120
    or coalesce(p_page, 0) not between 1 and 10000
    or coalesce(p_page_size, 0) not between 1 and 100
    or coalesce(cardinality(p_source_product_ids), 0) > 100
    or (
      p_source_product_ids is not null
      and cardinality(p_source_product_ids) <> (
        select count(distinct source_id)::integer
        from unnest(p_source_product_ids) source_id
      )
    ) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  with candidates as materialized (
    select
      product.id as source_product_id,
      publication.publication_status,
      publication.public_name,
      publication.retail_price_clp,
      publication.public_category_id,
      publication.published_image_version_id,
      publication.catalog_version,
      coalesce(publication.updated_at, product.updated_at) as updated_at,
      publication.id is not null and (
        publication.public_name is distinct from coalesce(product.product_name, '')
        or publication.retail_price_clp is distinct from case
          when product.retail_price is null
            or product.retail_price::text in ('NaN', 'Infinity', '-Infinity')
            or product.retail_price < 0
            or trunc(product.retail_price) <> product.retail_price
          then null
          else product.retail_price::bigint
        end
      ) as differs_from_operational
    from public.inventory_products product
    left join public.storefront_product_publications publication
      on publication.shop_id = p_shop_id
      and publication.source_product_id = product.id
    where product.deleted_at is null
      and app_private.storefront_product_matches_shop_v1(product.id, p_shop_id)
      and (p_source_product_ids is null or product.id = any(p_source_product_ids))
      and (
        v_query is null
        or concat_ws(
          ' ', product.barcode, product.item_number, product.product_name,
          publication.public_name
        ) ilike '%' || replace(replace(v_query, '%', '\\%'), '_', '\\_') || '%'
      )
  ), filtered as materialized (
    select candidate.*
    from candidates candidate
    where p_filter = 'all'
      or (p_filter = 'unpublished' and candidate.publication_status is null)
      or (p_filter = 'hidden' and candidate.publication_status = 'paused')
      or (p_filter = 'needs_update' and candidate.differs_from_operational)
      or candidate.publication_status = p_filter
  ), paged as (
    select filtered.*
    from filtered
    order by filtered.updated_at desc, filtered.source_product_id
    offset (p_page - 1) * p_page_size
    limit p_page_size
  )
  select
    (select count(*)::integer from filtered),
    coalesce(jsonb_agg(jsonb_build_object(
      'sourceProductId', paged.source_product_id,
      'status', coalesce(paged.publication_status, 'unpublished'),
      'publicName', paged.public_name,
      'publicPrice', paged.retail_price_clp,
      'storefrontCategoryId', paged.public_category_id,
      'publicImageId', paged.published_image_version_id,
      'version', paged.catalog_version,
      'updatedAt', paged.updated_at,
      'differsFromOperational', paged.differs_from_operational
    ) order by paged.updated_at desc, paged.source_product_id), '[]'::jsonb)
  into v_total, v_rows
  from paged;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront authoring authorization expired'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'rows', v_rows,
    'pagination', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'total', v_total,
      'totalPages', greatest(1, ceil(v_total::numeric / p_page_size)::integer)
    )
  );
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

revoke all on function public.storefront_publications_authoring_summary_v1(
  uuid, text, text, uuid[], integer, integer, uuid, uuid, text, integer
) from public, anon;
grant execute on function public.storefront_publications_authoring_summary_v1(
  uuid, text, text, uuid[], integer, integer, uuid, uuid, text, integer
) to authenticated, service_role;

comment on function public.storefront_authoring_bind_android_session_v1() is
  'Binds Android attribution immutably to the current authenticated auth session.';
comment on function public.storefront_authoring_bind_ios_session_v1() is
  'Binds iOS attribution immutably to the current authenticated auth session.';
comment on function public.storefront_publications_authoring_summary_v1(
  uuid, text, text, uuid[], integer, integer, uuid, uuid, text, integer
) is
  'Bounded Storefront list projection; excludes editor, audit and internal inventory payloads.';
