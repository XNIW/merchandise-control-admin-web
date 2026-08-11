-- Storefront v1 / TASK-007
--
-- Transactional Admin Console publication boundary. Personal accounts use
-- their authenticated shop membership; POS staff use the existing lease-bound
-- service-role bridge. Mobile roles retain no authoring-table access.

begin;

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
      'audit.view', 'audit.read',
      'storefront.view', 'storefront.edit', 'storefront.publish',
      'storefront.bulk_publish', 'storefront.promotions.manage',
      'storefront.images.manage', 'storefront.settings.manage',
      'storefront.audit.view'
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
      ('storefront.audit.view')
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
    ('storefront.settings.manage'), ('storefront.audit.view');
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
cross join app_private.mac_admin_w7pos_009_pos_admin_permissions() permission
on conflict (shop_id, role_key, permission_key)
do update set enabled = true, updated_at = now();

create or replace function app_private.storefront_admin_personal_allowed_v1(
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
      'storefront.view', 'storefront.edit', 'storefront.publish',
      'storefront.bulk_publish', 'storefront.promotions.manage',
      'storefront.images.manage', 'storefront.settings.manage',
      'storefront.audit.view'
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

create or replace function app_private.storefront_admin_authorized_v1(
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
  if auth.role() = 'authenticated' then
    if p_staff_id is not null
      or p_staff_web_session_id is not null
      or p_session_token_hash is not null
      or p_expected_credential_version is not null then
      return false;
    end if;
    return app_private.storefront_admin_personal_allowed_v1(
      p_shop_id,
      p_permission
    );
  end if;

  if auth.role() = 'service_role' then
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

revoke all on function app_private.storefront_admin_personal_allowed_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_admin_authorized_v1(
  uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;

create or replace function public.admin_storefront_publications_read_v1(
  p_shop_id uuid,
  p_query text default null,
  p_status text default null,
  p_category_id uuid default null,
  p_availability text default null,
  p_discounted boolean default null,
  p_missing_image boolean default null,
  p_sort text default 'updated_desc',
  p_page integer default 1,
  p_page_size integer default 25,
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
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_scope record;
  v_rows jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_images jsonb := '[]'::jsonb;
  v_preview jsonb := jsonb_build_object('status', 'unavailable');
  v_audit jsonb := '[]'::jsonb;
  v_public_slug text;
  v_total integer := 0;
begin
  if p_shop_id is null
    or octet_length(coalesce(v_query, '')) > 160
    or coalesce(p_page, 0) not between 1 and 10000
    or coalesce(p_page_size, 0) not between 1 and 100
    or coalesce(p_sort, '') not in (
      'updated_desc', 'name_asc', 'status_asc', 'price_asc', 'sort_rank_asc'
    )
    or (p_status is not null and p_status not in (
      'unpublished', 'draft', 'scheduled', 'published', 'paused', 'ended'
    ))
    or (p_availability is not null and p_availability not in (
      'available', 'low_stock', 'unavailable', 'reservation_only',
      'pickup_only', 'delivery_only'
    )) then
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

  select * into v_scope
  from app_private.resolve_shop_catalog_scope_service_v1(p_shop_id);
  if v_scope.owner_user_id is null then
    return jsonb_build_object(
      'ok', false, 'code', 'unauthorized_or_unmapped', 'shop_id', p_shop_id
    );
  end if;

  with scoped_products as materialized (
    select product.*
    from public.inventory_products product
    where product.deleted_at is null
      and (
        (v_scope.catalog_scope in ('shop_scoped', 'authorized_shop_plus_legacy')
          and product.shop_id = p_shop_id)
        or
        (v_scope.catalog_scope in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
          and product.shop_id is null
          and product.owner_user_id = v_scope.owner_user_id)
      )
  ), filtered as materialized (
    select
      product.id as source_product_id,
      product.barcode,
      product.product_name as operational_name,
      product.retail_price as operational_price,
      publication.id as publication_id,
      publication.publication_status,
      publication.public_name,
      publication.public_description,
      publication.public_category_id,
      category.public_name as public_category_name,
      publication.public_brand,
      publication.retail_price_clp,
      publication.compare_at_price_clp,
      publication.price_source_mode,
      publication.promotion_starts_at,
      publication.promotion_ends_at,
      publication.featured,
      publication.sort_rank,
      publication.pickup_enabled,
      publication.delivery_enabled,
      publication.reservation_enabled,
      publication.availability_mode,
      publication.published_image_version_id,
      image_publication.card_url as published_image_url,
      publication.published_at,
      publication.updated_at
    from scoped_products product
    left join public.storefront_product_publications publication
      on publication.shop_id = p_shop_id
      and publication.source_product_id = product.id
    left join public.storefront_categories category
      on category.shop_id = p_shop_id
      and category.id = publication.public_category_id
    left join public.storefront_image_publications image_publication
      on image_publication.shop_id = p_shop_id
      and image_publication.id = publication.published_image_version_id
    where (p_status is null
        or (p_status = 'unpublished' and publication.id is null)
        or publication.publication_status = p_status)
      and (p_category_id is null or publication.public_category_id = p_category_id)
      and (p_availability is null or publication.availability_mode = p_availability)
      and (p_discounted is null or p_discounted = (
        publication.compare_at_price_clp is not null
        and publication.compare_at_price_clp > publication.retail_price_clp
      ))
      and (p_missing_image is null or p_missing_image = (
        publication.published_image_version_id is null
      ))
      and (v_query is null or concat_ws(
        ' ', product.barcode, product.product_name, publication.public_name,
        publication.public_brand, category.public_name
      ) ilike '%' || replace(replace(v_query, '%', '\\%'), '_', '\\_') || '%')
  ), counted as (
    select count(*)::integer as total from filtered
  ), paged as (
    select * from filtered
    order by
      case when p_sort = 'name_asc' then lower(coalesce(public_name, operational_name, '')) end asc,
      case when p_sort = 'status_asc' then coalesce(publication_status, 'unpublished') end asc,
      case when p_sort = 'price_asc' then coalesce(retail_price_clp, operational_price::bigint) end asc,
      case when p_sort = 'sort_rank_asc' then coalesce(sort_rank, 0) end asc,
      case when p_sort = 'updated_desc' then updated_at end desc nulls last,
      source_product_id
    offset (p_page - 1) * p_page_size
    limit p_page_size
  )
  select
    coalesce((select total from counted), 0),
    coalesce(
      (select jsonb_agg(to_jsonb(paged) order by
        case when p_sort = 'name_asc' then lower(coalesce(public_name, operational_name, '')) end asc,
        case when p_sort = 'status_asc' then coalesce(publication_status, 'unpublished') end asc,
        case when p_sort = 'price_asc' then coalesce(retail_price_clp, operational_price::bigint) end asc,
        case when p_sort = 'sort_rank_asc' then coalesce(sort_rank, 0) end asc,
        case when p_sort = 'updated_desc' then updated_at end desc nulls last,
        source_product_id
      ) from paged),
      '[]'::jsonb
    )
  into v_total, v_rows;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.id,
    'name', category.public_name,
    'status', category.publication_status
  ) order by category.sort_rank, category.public_name, category.id), '[]'::jsonb)
  into v_categories
  from public.storefront_categories category
  where category.shop_id = p_shop_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', image_publication.id,
    'sourceProductId', image_publication.source_product_id,
    'url', image_publication.card_url,
    'status', image_publication.publication_status
  ) order by image_publication.updated_at desc, image_publication.id), '[]'::jsonb)
  into v_images
  from public.storefront_image_publications image_publication
  where image_publication.shop_id = p_shop_id
    and image_publication.publication_status in ('ready', 'published');

  select setting.public_slug into v_public_slug
  from public.storefront_settings setting
  where setting.shop_id = p_shop_id;
  if v_public_slug is not null then
    v_preview := public.storefront_home_v1(v_public_slug);
  end if;

  if app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.audit.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', audit.audit_log_id,
      'eventKey', audit.event_key,
      'result', audit.result,
      'targetId', audit.target_id,
      'actorKind', case when audit.actor_staff_id is not null
        then 'pos_staff_manager' when audit.actor_profile_id is not null
        then 'personal_account' else 'system' end,
      'createdAt', audit.created_at,
      'before', audit.metadata_redacted->'before',
      'after', audit.metadata_redacted->'after',
      'updatedCount', audit.metadata_redacted->'updatedCount'
    ) order by audit.created_at desc, audit.audit_log_id desc), '[]'::jsonb)
    into v_audit
    from (
      select audit.*
      from public.audit_logs audit
      where audit.shop_id = p_shop_id
        and audit.event_key like 'shop.storefront.%'
      order by audit.created_at desc, audit.audit_log_id desc
      limit 100
    ) audit;
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before publication'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'rows', v_rows,
    'categories', v_categories,
    'images', v_images,
    'preview', v_preview,
    'audit', v_audit,
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

create or replace function public.admin_storefront_publication_mutate_v1(
  p_shop_id uuid,
  p_operation text,
  p_payload jsonb,
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
  v_required_permission text;
  v_status text;
  v_source_product_id uuid;
  v_publication_id uuid;
  v_public_name text;
  v_public_description text;
  v_public_brand text;
  v_public_category_id uuid;
  v_image_id uuid;
  v_price_source_mode text;
  v_retail_price bigint;
  v_compare_at_price bigint;
  v_promotion_starts_at timestamptz;
  v_promotion_ends_at timestamptz;
  v_sort_rank bigint;
  v_product public.inventory_products%rowtype;
  v_before jsonb := 'null'::jsonb;
  v_after jsonb := 'null'::jsonb;
  v_ids uuid[];
  v_updated_count integer := 0;
  v_audit_id uuid;
  v_actor_staff_id uuid;
  v_actor_profile_id uuid;
begin
  if p_shop_id is null
    or p_operation not in ('upsert', 'bulk_publish', 'bulk_pause')
    or jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_payload) > 65536 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  v_status := nullif(p_payload->>'publicationStatus', '');
  v_required_permission := case
    when p_operation in ('bulk_publish', 'bulk_pause') then 'storefront.bulk_publish'
    when v_status in ('scheduled', 'published', 'paused', 'ended') then 'storefront.publish'
    else 'storefront.edit'
  end;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, v_required_permission, p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  v_actor_staff_id := case when auth.role() = 'service_role' then p_staff_id end;
  v_actor_profile_id := case when auth.role() = 'authenticated' then auth.uid() end;

  begin
    if p_operation = 'upsert' then
      v_source_product_id := (p_payload->>'sourceProductId')::uuid;
      v_public_name := regexp_replace(btrim(coalesce(p_payload->>'publicName', '')), '\\s+', ' ', 'g');
      v_public_description := nullif(btrim(coalesce(p_payload->>'publicDescription', '')), '');
      v_public_brand := nullif(regexp_replace(btrim(coalesce(p_payload->>'publicBrand', '')), '\\s+', ' ', 'g'), '');
      v_public_category_id := nullif(p_payload->>'publicCategoryId', '')::uuid;
      v_image_id := nullif(p_payload->>'publishedImageVersionId', '')::uuid;
      v_price_source_mode := coalesce(nullif(p_payload->>'priceSourceMode', ''), 'override');
      v_retail_price := (p_payload->>'retailPriceClp')::bigint;
      v_compare_at_price := nullif(p_payload->>'compareAtPriceClp', '')::bigint;
      v_promotion_starts_at := nullif(p_payload->>'promotionStartsAt', '')::timestamptz;
      v_promotion_ends_at := nullif(p_payload->>'promotionEndsAt', '')::timestamptz;
      v_sort_rank := coalesce(nullif(p_payload->>'sortRank', '')::bigint, 0);

      if v_status not in ('draft', 'scheduled', 'published', 'paused', 'ended')
        or length(v_public_name) not between 1 and 200
        or coalesce(length(v_public_description), 0) > 5000
        or coalesce(length(v_public_brand), 0) > 120
        or v_price_source_mode not in ('operational', 'override', 'promotion')
        or v_retail_price not between 0 and 999999999999
        or (v_compare_at_price is not null and v_compare_at_price < v_retail_price)
        or (v_promotion_starts_at is null) <> (v_promotion_ends_at is null)
        or (v_promotion_starts_at is not null and v_promotion_starts_at >= v_promotion_ends_at)
        or (v_status in ('scheduled', 'published') and not (
          coalesce((p_payload->>'pickupEnabled')::boolean, false)
          or coalesce((p_payload->>'deliveryEnabled')::boolean, false)
          or coalesce((p_payload->>'reservationEnabled')::boolean, false)
        )) then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;

      select product.* into v_product
      from public.inventory_products product
      where product.id = v_source_product_id
        and product.deleted_at is null
        and app_private.storefront_product_matches_shop_v1(product.id, p_shop_id)
      for share;
      if not found then
        return jsonb_build_object(
          'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
        );
      end if;

      if v_price_source_mode = 'operational' then
        if v_product.retail_price is null
          or v_product.retail_price < 0
          or trunc(v_product.retail_price) <> v_product.retail_price then
          return jsonb_build_object(
            'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
          );
        end if;
        v_retail_price := v_product.retail_price::bigint;
      end if;

      select jsonb_build_object(
        'id', publication.id,
        'status', publication.publication_status,
        'publicName', publication.public_name,
        'retailPriceClp', publication.retail_price_clp,
        'categoryId', publication.public_category_id,
        'imageId', publication.published_image_version_id
      ) into v_before
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.source_product_id = v_source_product_id
      for update;

      insert into public.storefront_product_publications (
        shop_id, source_product_id, publication_status, public_name,
        public_description, public_category_id, public_brand, retail_price_clp,
        compare_at_price_clp, price_source_mode, promotion_starts_at,
        promotion_ends_at, featured, sort_rank, pickup_enabled,
        delivery_enabled, reservation_enabled, availability_mode,
        published_image_version_id, published_at, updated_by_profile_id
      ) values (
        p_shop_id, v_source_product_id, v_status, v_public_name,
        v_public_description, v_public_category_id, v_public_brand,
        v_retail_price, v_compare_at_price, v_price_source_mode,
        v_promotion_starts_at, v_promotion_ends_at,
        coalesce((p_payload->>'featured')::boolean, false), v_sort_rank,
        coalesce((p_payload->>'pickupEnabled')::boolean, false),
        coalesce((p_payload->>'deliveryEnabled')::boolean, false),
        coalesce((p_payload->>'reservationEnabled')::boolean, false),
        coalesce(nullif(p_payload->>'availabilityMode', ''), 'available'),
        v_image_id,
        case when v_status = 'published' then statement_timestamp() end,
        v_actor_profile_id
      )
      on conflict (shop_id, source_product_id) do update set
        publication_status = excluded.publication_status,
        public_name = excluded.public_name,
        public_description = excluded.public_description,
        public_category_id = excluded.public_category_id,
        public_brand = excluded.public_brand,
        retail_price_clp = excluded.retail_price_clp,
        compare_at_price_clp = excluded.compare_at_price_clp,
        price_source_mode = excluded.price_source_mode,
        promotion_starts_at = excluded.promotion_starts_at,
        promotion_ends_at = excluded.promotion_ends_at,
        featured = excluded.featured,
        sort_rank = excluded.sort_rank,
        pickup_enabled = excluded.pickup_enabled,
        delivery_enabled = excluded.delivery_enabled,
        reservation_enabled = excluded.reservation_enabled,
        availability_mode = excluded.availability_mode,
        published_image_version_id = excluded.published_image_version_id,
        published_at = case
          when excluded.publication_status = 'published'
            then coalesce(storefront_product_publications.published_at, statement_timestamp())
          else storefront_product_publications.published_at
        end,
        updated_by_profile_id = excluded.updated_by_profile_id
      returning id into v_publication_id;

      select jsonb_build_object(
        'id', publication.id,
        'status', publication.publication_status,
        'publicName', publication.public_name,
        'retailPriceClp', publication.retail_price_clp,
        'categoryId', publication.public_category_id,
        'imageId', publication.published_image_version_id
      ) into v_after
      from public.storefront_product_publications publication
      where publication.id = v_publication_id;
      v_updated_count := 1;
    else
      select array_agg(value::uuid order by ordinality)
      into v_ids
      from jsonb_array_elements_text(p_payload->'publicationIds')
        with ordinality ids(value, ordinality);
      if coalesce(cardinality(v_ids), 0) not between 1 and 100
        or cardinality(v_ids) <> (
          select count(distinct id)::integer from unnest(v_ids) id
        ) then
        return jsonb_build_object(
          'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
        );
      end if;

      perform 1
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.id = any(v_ids)
      for update;

      select coalesce(jsonb_agg(jsonb_build_object(
        'id', publication.id,
        'status', publication.publication_status
      ) order by publication.id), '[]'::jsonb)
      into v_before
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.id = any(v_ids);
      if jsonb_array_length(v_before) <> cardinality(v_ids) then
        return jsonb_build_object(
          'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
        );
      end if;

      update public.storefront_product_publications publication
      set publication_status = case
            when p_operation = 'bulk_publish' then 'published' else 'paused'
          end,
          published_at = case
            when p_operation = 'bulk_publish'
              then coalesce(publication.published_at, statement_timestamp())
            else publication.published_at
          end,
          updated_by_profile_id = v_actor_profile_id
      where publication.shop_id = p_shop_id
        and publication.id = any(v_ids);
      get diagnostics v_updated_count = row_count;
      v_publication_id := v_ids[1];

      select coalesce(jsonb_agg(jsonb_build_object(
        'id', publication.id,
        'status', publication.publication_status
      ) order by publication.id), '[]'::jsonb)
      into v_after
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.id = any(v_ids);
    end if;

    if not app_private.storefront_admin_authorized_v1(
      p_shop_id, v_required_permission, p_staff_id, p_staff_web_session_id,
      p_session_token_hash, p_expected_credential_version
    ) then
      raise exception 'Storefront Admin authorization expired before publication'
        using errcode = '42501';
    end if;

    insert into public.audit_logs (
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      v_actor_profile_id,
      v_actor_staff_id,
      'shop',
      p_shop_id,
      'shop.storefront.publication.' || p_operation || '.success',
      'info',
      'success',
      case when p_operation = 'upsert' then 'storefront_publication'
        else 'storefront_publication_bulk' end,
      case when p_operation = 'upsert' then v_publication_id::text end,
      jsonb_build_object(
        'code', 'success',
        'source', 'storefront_admin',
        'operation', p_operation,
        'before', coalesce(v_before, 'null'::jsonb),
        'after', coalesce(v_after, 'null'::jsonb),
        'updatedCount', v_updated_count
      )
    ) returning audit_log_id into v_audit_id;

    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'shop_id', p_shop_id,
      'target_id', v_publication_id,
      'audit_event_id', v_audit_id,
      'payload', jsonb_build_object('updatedCount', v_updated_count)
    );
  exception
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or foreign_key_violation or not_null_violation
      or invalid_datetime_format then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    when unique_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'conflict', 'shop_id', p_shop_id
      );
    when insufficient_privilege then
      return jsonb_build_object(
        'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
      );
  end;
end;
$$;

revoke all on function public.admin_storefront_publications_read_v1(
  uuid, text, text, uuid, text, boolean, boolean, text, integer, integer,
  uuid, uuid, text, integer
) from public, anon;
revoke all on function public.admin_storefront_publication_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from public, anon;
grant execute on function public.admin_storefront_publications_read_v1(
  uuid, text, text, uuid, text, boolean, boolean, text, integer, integer,
  uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_storefront_publication_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
