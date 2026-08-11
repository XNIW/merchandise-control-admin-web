begin;

alter table public.storefront_image_publication_variants
  add column if not exists cleanup_claim_token uuid;

update public.storefront_image_publication_variants
set cleanup_claim_token = gen_random_uuid(),
    cleanup_claimed_at = coalesce(
      cleanup_claimed_at,
      statement_timestamp() - interval '16 minutes'
    )
where publication_status = 'cleanup_pending'
  and cleanup_claim_token is null;

alter table public.storefront_image_publication_variants
  drop constraint if exists storefront_image_variants_cleanup_claim_check;
alter table public.storefront_image_publication_variants
  add constraint storefront_image_variants_cleanup_claim_check check (
    (publication_status = 'cleanup_pending'
      and cleanup_claim_token is not null
      and cleanup_claimed_at is not null)
    or
    (publication_status <> 'cleanup_pending'
      and cleanup_claim_token is null)
  );

create or replace function app_private.storefront_image_server_authorized_v1(
  p_shop_id uuid,
  p_actor_profile_id uuid,
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
  if auth.role() <> 'service_role' or p_shop_id is null then
    return false;
  end if;

  if p_actor_profile_id is not null then
    if p_staff_id is not null
      or p_staff_web_session_id is not null
      or p_session_token_hash is not null
      or p_expected_credential_version is not null then
      return false;
    end if;
    return exists (
      select 1
      from public.shop_members member
      join public.shops shop on shop.shop_id = member.shop_id
      where member.shop_id = p_shop_id
        and member.profile_id = p_actor_profile_id
        and member.membership_status = 'active'
        and member.role_key in ('shop_owner', 'shop_manager')
        and shop.shop_status = 'active'
    );
  end if;

  return app_private.staff_web_runtime_lease_is_valid_v1(
    p_shop_id,
    p_staff_id,
    p_staff_web_session_id,
    p_session_token_hash,
    p_expected_credential_version,
    'storefront.images.manage'
  );
end;
$$;

revoke all on function app_private.storefront_image_server_authorized_v1(
  uuid, uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;

create or replace function public.admin_storefront_image_finalize_server_v2(
  p_shop_id uuid,
  p_image_publication_id uuid,
  p_verified_variants jsonb,
  p_actor_profile_id uuid default null,
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
  v_audit_id uuid;
  v_before jsonb;
  v_current_id uuid;
  v_image record;
  v_matches boolean;
  v_public_asset_origin text;
  v_urls jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Storefront image finalize is server-only'
      using errcode = '42501';
  end if;
  if p_shop_id is null or p_image_publication_id is null
    or jsonb_typeof(p_verified_variants) <> 'array'
    or jsonb_array_length(p_verified_variants) <> 3 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;
  if not app_private.storefront_image_server_authorized_v1(
    p_shop_id, p_actor_profile_id, p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select config_value into v_public_asset_origin
  from app_private.storefront_runtime_config
  where config_key = 'public_asset_origin';
  if v_public_asset_origin is null then
    return jsonb_build_object('ok', false, 'code', 'not_configured');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || ':storefront-images', 0)
  );
  select * into v_image
  from public.storefront_image_publications image_publication
  where image_publication.shop_id = p_shop_id
    and image_publication.id = p_image_publication_id
  for update;
  if v_image.id is null or v_image.publication_status = 'removed' then
    return jsonb_build_object(
      'ok', false, 'code', 'invalid_state_or_not_found'
    );
  end if;
  if v_image.publication_status <> 'published' and not exists (
    select 1
    from public.inventory_product_image_versions source_image
    where source_image.id = v_image.source_image_version_id
      and source_image.shop_id = p_shop_id
      and source_image.product_id = v_image.source_product_id
      and source_image.status = 'ready'
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;

  perform 1
  from public.storefront_image_publication_variants stored
  where stored.shop_id = p_shop_id
    and stored.image_publication_id = p_image_publication_id
  order by stored.id
  for update;
  if (select count(*)
      from public.storefront_image_publication_variants stored
      where stored.shop_id = p_shop_id
        and stored.image_publication_id = p_image_publication_id) <> 3
    or exists (
      select 1
      from public.storefront_image_publication_variants stored
      where stored.shop_id = p_shop_id
        and stored.image_publication_id = p_image_publication_id
        and (
          stored.publication_status not in ('pending', 'ready')
          or stored.cleanup_claim_token is not null
        )
    ) then
    return jsonb_build_object('ok', false, 'code', 'cleanup_fence_active');
  end if;

  with verified as (
    select
      item->>'variant' as variant,
      case when item->>'bytes' ~ '^[0-9]+$'
        then (item->>'bytes')::integer end as bytes,
      case when item->>'width' ~ '^[0-9]+$'
        then (item->>'width')::integer end as width,
      case when item->>'height' ~ '^[0-9]+$'
        then (item->>'height')::integer end as height,
      item->>'sha256' as sha256
    from jsonb_array_elements(p_verified_variants) item
  )
  select count(*) = 3
      and count(distinct verified.variant) = 3
      and bool_and(
        stored.expected_bytes = verified.bytes
        and stored.expected_width = verified.width
        and stored.expected_height = verified.height
        and stored.expected_sha256 = verified.sha256
      )
  into v_matches
  from verified
  join public.storefront_image_publication_variants stored
    on stored.shop_id = p_shop_id
    and stored.image_publication_id = p_image_publication_id
    and stored.variant = verified.variant;
  if not coalesce(v_matches, false) then
    return jsonb_build_object(
      'ok', false, 'code', 'verified_metadata_mismatch'
    );
  end if;

  select to_jsonb(image_publication) into v_before
  from public.storefront_image_publications image_publication
  where image_publication.id = p_image_publication_id;

  with verified as (
    select
      item->>'variant' as variant,
      (item->>'bytes')::integer as bytes,
      (item->>'width')::integer as width,
      (item->>'height')::integer as height,
      item->>'sha256' as sha256
    from jsonb_array_elements(p_verified_variants) item
  )
  update public.storefront_image_publication_variants stored
  set publication_status = 'ready',
      verified_bytes = verified.bytes,
      verified_width = verified.width,
      verified_height = verified.height,
      verified_sha256 = verified.sha256,
      public_url = v_public_asset_origin ||
        '/storage/v1/object/public/storefront-product-images/' ||
        stored.object_path,
      ready_at = coalesce(stored.ready_at, statement_timestamp()),
      cleanup_after = null,
      cleanup_claimed_at = null,
      cleanup_claim_token = null,
      cleanup_last_error = null
  from verified
  where stored.shop_id = p_shop_id
    and stored.image_publication_id = p_image_publication_id
    and stored.variant = verified.variant;

  select jsonb_object_agg(variant, public_url) into v_urls
  from public.storefront_image_publication_variants
  where shop_id = p_shop_id
    and image_publication_id = p_image_publication_id;

  update public.storefront_image_publications
  set publication_status = 'published',
      thumb_url = v_urls->>'thumb',
      card_url = v_urls->>'card',
      detail_url = v_urls->>'detail',
      width = (
        select verified_width
        from public.storefront_image_publication_variants
        where image_publication_id = p_image_publication_id
          and variant = 'detail'
      ),
      height = (
        select verified_height
        from public.storefront_image_publication_variants
        where image_publication_id = p_image_publication_id
          and variant = 'detail'
      ),
      content_type = 'image/webp',
      content_sha256 = (
        select verified_sha256
        from public.storefront_image_publication_variants
        where image_publication_id = p_image_publication_id
          and variant = 'detail'
      ),
      published_at = coalesce(published_at, statement_timestamp()),
      updated_by_profile_id = p_actor_profile_id
  where shop_id = p_shop_id and id = p_image_publication_id;

  select publication.published_image_version_id into v_current_id
  from public.storefront_product_publications publication
  where publication.shop_id = p_shop_id
    and publication.source_product_id = v_image.source_product_id
  for update;

  update public.storefront_product_publications publication
  set published_image_version_id = p_image_publication_id,
      updated_by_profile_id = p_actor_profile_id
  where publication.shop_id = p_shop_id
    and publication.source_product_id = v_image.source_product_id;

  if v_current_id is not null and v_current_id <> p_image_publication_id then
    update public.storefront_image_publications
    set publication_status = 'superseded'
    where id = v_current_id and shop_id = p_shop_id;
    update public.storefront_image_publication_variants
    set publication_status = 'superseded',
        cleanup_after = statement_timestamp() + interval '30 days',
        cleanup_claimed_at = null,
        cleanup_claim_token = null
    where image_publication_id = v_current_id;
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    p_actor_profile_id, p_staff_id, 'shop', p_shop_id,
    'shop.storefront.image.publish.success', 'info', 'success',
    'storefront_image_publication', p_image_publication_id::text,
    jsonb_build_object(
      'code', 'success',
      'source', 'storefront_image_pipeline',
      'before', v_before,
      'after', jsonb_build_object(
        'status', 'published', 'previousImageId', v_current_id
      )
    )
  ) returning audit_log_id into v_audit_id;

  if not app_private.storefront_image_server_authorized_v1(
    p_shop_id, p_actor_profile_id, p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before image publication'
      using errcode = '42501';
  end if;
  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shopId', p_shop_id,
    'targetId', p_image_publication_id,
    'auditEventId', v_audit_id,
    'status', case
      when v_image.publication_status = 'published'
        and v_current_id = p_image_publication_id then 'noop'
      else 'published'
    end
  );
exception
  when check_violation or foreign_key_violation
    or invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
end;
$$;

create or replace function public.storefront_image_cleanup_claim_v2(
  p_limit integer default 50
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_rows jsonb;
begin
  if auth.role() <> 'service_role'
    or coalesce(p_limit, 0) not between 1 and 100 then
    raise exception 'Storefront image cleanup is service-only'
      using errcode = '42501';
  end if;
  with candidates as (
    select variant.id
    from public.storefront_image_publication_variants variant
    join public.storefront_image_publications image_publication
      on image_publication.id = variant.image_publication_id
    where (
      (variant.publication_status = 'pending'
        and variant.created_at < statement_timestamp() - interval '1 hour')
      or (variant.publication_status = 'failed'
        and variant.created_at < statement_timestamp() - interval '1 hour')
      or (variant.publication_status = 'superseded'
        and variant.cleanup_after < statement_timestamp())
      or (variant.publication_status = 'cleanup_pending'
        and variant.cleanup_claimed_at <
          statement_timestamp() - interval '15 minutes')
    )
    and not exists (
      select 1
      from public.storefront_product_publications publication
      where publication.published_image_version_id =
        variant.image_publication_id
    )
    and variant.cleanup_attempts < 100
    order by coalesce(variant.cleanup_after, variant.created_at), variant.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.storefront_image_publication_variants variant
    set publication_status = 'cleanup_pending',
        cleanup_claimed_at = statement_timestamp(),
        cleanup_claim_token = gen_random_uuid(),
        cleanup_attempts = cleanup_attempts + 1,
        cleanup_last_error = null
    from candidates
    where variant.id = candidates.id
    returning
      variant.id,
      variant.shop_id,
      variant.image_publication_id,
      variant.variant,
      variant.object_path,
      variant.cleanup_claim_token
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
  into v_rows
  from claimed;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'items', v_rows
  );
end;
$$;

create or replace function public.storefront_image_cleanup_complete_v2(
  p_variant_id uuid,
  p_claim_token uuid,
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
declare
  v_image_id uuid;
begin
  if auth.role() <> 'service_role'
    or p_variant_id is null
    or p_claim_token is null
    or p_removed is null
    or (not p_removed and (
      p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,80}$'
    )) then
    raise exception 'Invalid Storefront image cleanup completion'
      using errcode = '42501';
  end if;
  update public.storefront_image_publication_variants
  set publication_status = case
        when p_removed then 'removed' else 'cleanup_pending'
      end,
      cleanup_claimed_at = case
        when p_removed then null else statement_timestamp()
      end,
      cleanup_claim_token = case
        when p_removed then null else cleanup_claim_token
      end,
      cleanup_last_error = case
        when p_removed then null else p_error_code
      end
  where id = p_variant_id
    and publication_status = 'cleanup_pending'
    and cleanup_claim_token = p_claim_token
  returning image_publication_id into v_image_id;
  if v_image_id is null then
    return jsonb_build_object('ok', false, 'code', 'cleanup_fence_lost');
  end if;
  if not exists (
    select 1
    from public.storefront_image_publication_variants
    where image_publication_id = v_image_id
      and publication_status <> 'removed'
  ) then
    update public.storefront_image_publications
    set publication_status = 'removed'
    where id = v_image_id and publication_status <> 'published';
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'success', 'targetId', p_variant_id
  );
end;
$$;

revoke all on function public.admin_storefront_image_finalize_v1(
  uuid, uuid, jsonb, uuid, uuid, text, integer
) from authenticated, service_role;
revoke all on function public.storefront_image_cleanup_claim_v1(integer)
  from service_role;
revoke all on function public.storefront_image_cleanup_complete_v1(
  uuid, boolean, text
) from service_role;

revoke all on function public.admin_storefront_image_finalize_server_v2(
  uuid, uuid, jsonb, uuid, uuid, uuid, text, integer
) from public, anon, authenticated;
revoke all on function public.storefront_image_cleanup_claim_v2(integer)
  from public, anon, authenticated;
revoke all on function public.storefront_image_cleanup_complete_v2(
  uuid, uuid, boolean, text
) from public, anon, authenticated;

grant execute on function public.admin_storefront_image_finalize_server_v2(
  uuid, uuid, jsonb, uuid, uuid, uuid, text, integer
) to service_role;
grant execute on function public.storefront_image_cleanup_claim_v2(integer)
  to service_role;
grant execute on function public.storefront_image_cleanup_complete_v2(
  uuid, uuid, boolean, text
) to service_role;

comment on function public.admin_storefront_image_finalize_server_v2(
  uuid, uuid, jsonb, uuid, uuid, uuid, text, integer
) is 'Service-only finalize after server-side WebP verification; revalidates the actor and rejects cleanup-claimed variants.';
comment on function public.storefront_image_cleanup_claim_v2(integer) is
  'Service-only bounded cleanup claim with a per-attempt fencing token.';
comment on function public.storefront_image_cleanup_complete_v2(
  uuid, uuid, boolean, text
) is 'Service-only cleanup completion requiring the exact active claim token.';

notify pgrst, 'reload schema';

commit;
