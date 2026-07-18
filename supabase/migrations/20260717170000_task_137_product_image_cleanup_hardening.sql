-- TASK-137: make private image cleanup shop-scoped, race-safe and auditable.

create or replace function public.product_image_prepare_cleanup(
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_product public.inventory_products%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
  v_transition_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  select product.* into v_product
  from public.inventory_products product
  where product.id = p_product_id
  for update;

  select version.* into v_version
  from public.inventory_product_image_versions version
  where version.id = p_version_id
    and version.shop_id = p_shop_id
    and version.product_id = p_product_id
  for update;

  if v_version.id is null
    or v_product.id is null
    or v_product.primary_image_version_id = p_version_id
    or v_version.cleanup_status = 'complete' then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  v_transition_at := case v_version.status
    when 'pending' then v_version.expires_at
    when 'superseded' then v_version.superseded_at
    when 'removed' then v_version.removed_at
    when 'failed' then coalesce(v_version.cleanup_updated_at, v_version.created_at)
    else null
  end;

  if v_transition_at is null
    or v_transition_at > now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'code', 'not_due');
  end if;

  if v_version.status = 'pending' then
    update public.inventory_product_image_versions
    set status = 'failed',
        cleanup_status = 'pending',
        cleanup_last_error_code = 'cleanup_expired_pending',
        cleanup_updated_at = now()
    where id = p_version_id
      and status = 'pending';

    perform app_private.write_product_image_audit(
      v_version.requested_by_profile_id,
      p_shop_id,
      'shop.product_image.cleanup_expired_pending',
      'warning',
      'success',
      p_product_id,
      p_version_id,
      'cleanup_expired_pending',
      v_version.actor_kind,
      jsonb_build_object('cleanup_source', 'admin_script')
    );
  elsif v_version.status not in ('failed', 'superseded', 'removed') then
    return jsonb_build_object('ok', false, 'code', 'invalid_state');
  end if;

  if v_version.main_path <> format(
      'shops/%s/products/%s/primary/%s/main.jpg',
      p_shop_id, p_product_id, p_version_id
    )
    or v_version.thumb_path <> format(
      'shops/%s/products/%s/primary/%s/thumb.jpg',
      p_shop_id, p_product_id, p_version_id
    ) then
    return jsonb_build_object('ok', false, 'code', 'path_contract_invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'cleanup_prepared',
    'main_path', v_version.main_path,
    'thumb_path', v_version.thumb_path,
    'byte_count',
      coalesce(v_version.verified_main_bytes, v_version.expected_main_bytes, 0)
      + coalesce(v_version.verified_thumb_bytes, v_version.expected_thumb_bytes, 0)
  );
end;
$$;

create or replace function public.product_image_prepare_orphan_cleanup(
  p_shop_id uuid,
  p_object_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_product_id uuid;
  v_version_id uuid;
  v_variant text;
  v_uuid_pattern constant text :=
    '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if p_object_path !~* format(
    '^shops/%s/products/%s/primary/%s/(main|thumb)[.]jpg$',
    p_shop_id,
    v_uuid_pattern,
    v_uuid_pattern
  ) then
    return jsonb_build_object('ok', false, 'code', 'path_contract_invalid');
  end if;

  begin
    v_product_id := split_part(p_object_path, '/', 4)::uuid;
    v_version_id := split_part(p_object_path, '/', 6)::uuid;
    v_variant := split_part(split_part(p_object_path, '/', 7), '.', 1);
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'path_contract_invalid');
  end;

  if v_variant not in ('main', 'thumb')
    or exists (
      select 1
      from public.inventory_product_image_versions version
      where version.main_path = p_object_path
         or version.thumb_path = p_object_path
    ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'orphan_cleanup_prepared',
    'product_id', v_product_id,
    'version_id', v_version_id,
    'variant', v_variant
  );
end;
$$;

create or replace function public.product_image_record_orphan_cleanup(
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_variant text,
  p_success boolean,
  p_byte_count bigint default 0,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_error_code text := lower(coalesce(p_error_code, 'storage_delete_failed'));
  v_audit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if p_variant not in ('main', 'thumb')
    or p_byte_count < 0
    or v_error_code !~ '^[a-z0-9_]{1,64}$'
    or exists (
      select 1
      from public.inventory_product_image_versions version
      where version.id = p_version_id
         or version.main_path = format(
           'shops/%s/products/%s/primary/%s/%s.jpg',
           p_shop_id, p_product_id, p_version_id, p_variant
         )
         or version.thumb_path = format(
           'shops/%s/products/%s/primary/%s/%s.jpg',
           p_shop_id, p_product_id, p_version_id, p_variant
         )
    ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  v_audit_id := app_private.write_product_image_audit(
    null,
    p_shop_id,
    case when p_success
      then 'shop.product_image.orphan_cleanup_completed'
      else 'shop.product_image.orphan_cleanup_failed'
    end,
    case when p_success then 'info' else 'warning' end,
    case when p_success then 'success' else 'blocked' end,
    p_product_id,
    p_version_id,
    case when p_success then 'orphan_cleanup_complete' else v_error_code end,
    'platform_admin',
    jsonb_build_object(
      'byte_count', least(p_byte_count, 1073741824),
      'cleanup_source', 'admin_script',
      'object_count', 1,
      'variant', p_variant
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', case when p_success
      then 'orphan_cleanup_complete'
      else 'orphan_cleanup_failed'
    end,
    'audit_event_id', v_audit_id
  );
end;
$$;

create or replace function public.product_image_record_cleanup(
  p_actor_profile_id uuid,
  p_actor_kind text,
  p_shop_id uuid,
  p_product_id uuid,
  p_version_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_source text default 'admin_script'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_error_code text := lower(coalesce(p_error_code, 'storage_delete_failed'));
  v_audit_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if v_error_code !~ '^[a-z0-9_]{1,64}$' then
    v_error_code := 'storage_delete_failed';
  end if;

  update public.inventory_product_image_versions version
  set cleanup_status = case when p_success then 'complete' else 'failed' end,
      cleanup_attempts = cleanup_attempts + 1,
      cleanup_last_error_code = case when p_success then null else v_error_code end,
      cleanup_updated_at = now()
  where version.id = p_version_id
    and version.shop_id = p_shop_id
    and version.product_id = p_product_id
    and version.status in ('failed', 'superseded', 'removed')
    and not exists (
      select 1
      from public.inventory_products product
      where product.id = p_product_id
        and product.primary_image_version_id = p_version_id
    );

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_state_or_not_found');
  end if;

  v_audit_id := app_private.write_product_image_audit(
    p_actor_profile_id, p_shop_id,
    case when p_success
      then 'shop.product_image.cleanup_completed'
      else 'shop.product_image.cleanup_failed'
    end,
    case when p_success then 'info' else 'warning' end,
    case when p_success then 'success' else 'blocked' end,
    p_product_id,
    p_version_id,
    case when p_success then 'cleanup_complete' else v_error_code end,
    case when p_actor_kind in ('personal_account', 'platform_admin')
      then p_actor_kind else 'platform_admin' end,
    jsonb_build_object(
      'cleanup_source', case when p_source in ('api_remove', 'admin_script')
        then p_source else 'admin_script' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', case when p_success then 'cleanup_complete' else 'cleanup_failed' end,
    'audit_event_id', v_audit_id
  );
end;
$$;

revoke all on function public.product_image_prepare_cleanup(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.product_image_prepare_orphan_cleanup(uuid, text)
  from public, anon, authenticated;
revoke all on function public.product_image_record_orphan_cleanup(uuid, uuid, uuid, text, boolean, bigint, text)
  from public, anon, authenticated;

grant execute on function public.product_image_prepare_cleanup(uuid, uuid, uuid)
  to service_role;
grant execute on function public.product_image_prepare_orphan_cleanup(uuid, text)
  to service_role;
grant execute on function public.product_image_record_orphan_cleanup(uuid, uuid, uuid, text, boolean, bigint, text)
  to service_role;
