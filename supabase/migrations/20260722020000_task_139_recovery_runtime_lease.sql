-- TASK-139: hold the authenticated account/shop/device/mapping lease through
-- every recovery-reader publication.  The expected scope and event fences are
-- still required across separate RPCs; these locks close only the in-RPC
-- revocation/mapping race.

begin;

create or replace function app_private.resolve_shop_sync_recovery_scope(
  p_shop_id uuid,
  p_device_identifier text
)
returns table (
  mapped_owner_id uuid,
  authorized_legacy_owner_id uuid,
  scope_kind text,
  history_scope_kind text,
  scope_key text,
  legacy_owner_key text,
  account_key text,
  device_key text
)
language plpgsql
volatile
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_actor_profile_id uuid := auth.uid();
  v_mapped_owner_id uuid;
  v_initial_mapped_owner_id uuid;
  v_has_blocking_mapping boolean := false;
  v_has_shop_catalog_rows boolean := false;
  v_has_legacy_catalog_rows boolean := false;
  v_device_identifier text;
  v_account_key text;
  v_device_key text;
begin
  if v_actor_profile_id is null then
    raise exception 'shop sync recovery requires authentication'
      using errcode = '28000';
  end if;

  if p_shop_id is null then
    raise exception 'shop sync recovery requires a shop id'
      using errcode = '22023';
  end if;

  -- Bound the raw value before trimming it so whitespace cannot cause an
  -- unbounded intermediate allocation before the device lease check.
  if p_device_identifier is null
    or octet_length(p_device_identifier) > 160 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;
  v_device_identifier := btrim(p_device_identifier);
  if octet_length(v_device_identifier) = 0 then
    raise exception 'shop sync recovery requires a valid device identity'
      using errcode = '22023';
  end if;

  -- Fixed lock order: shop -> profile -> membership -> device -> catalog
  -- scope.  Any concurrent deactivate/revoke/mapping transition must wait
  -- until the enclosing recovery RPC either returns a self-consistent payload
  -- or fails closed.
  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.profiles profile
  where profile.profile_id = v_actor_profile_id
    and profile.profile_status = 'active'
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.shop_members member
  where member.shop_id = p_shop_id
    and member.profile_id = v_actor_profile_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active owner/manager shop binding'
      using errcode = '42501';
  end if;

  perform 1
  from public.shop_devices device
  where device.shop_id = p_shop_id
    and device.device_identifier = v_device_identifier
    and device.status = 'active'
    and device.revoked_at is null
  for share;
  if not found then
    raise exception 'shop sync recovery requires an active device lease'
      using errcode = '42501';
  end if;

  -- Mapping transitions take the same advisory pair lock before changing a
  -- source row.  Select an initial owner only to derive the lock key, then
  -- lock and re-read all source rows before computing the visible union.
  select source.owner_user_id
  into v_initial_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  perform app_private.lock_catalog_scope_pair_v1(
    p_shop_id,
    v_initial_mapped_owner_id
  );

  perform 1
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
  for share;

  select source.owner_user_id
  into v_mapped_owner_id
  from public.shop_inventory_sources source
  where source.shop_id = p_shop_id
    and source.mapping_state = 'mapped'
    and source.owner_user_id is not null
    and source.verified_at is not null
    and pg_catalog.isfinite(source.created_at)
    and pg_catalog.isfinite(source.verified_at)
    and source.disabled_at is null
  order by source.created_at desc
  limit 1;

  select exists (
    select 1
    from public.shop_inventory_sources source
    where source.shop_id = p_shop_id
      and source.disabled_at is null
      and (
        source.mapping_state <> 'mapped'
        or source.owner_user_id is null
        or source.verified_at is null
        or not pg_catalog.isfinite(source.created_at)
        or (
          source.verified_at is not null
          and not pg_catalog.isfinite(source.verified_at)
        )
      )
  ) into v_has_blocking_mapping;

  if v_has_blocking_mapping then
    raise exception 'shop_sync_recovery_scope_unresolved'
      using errcode = '55000';
  end if;

  select
    exists (select 1 from public.inventory_suppliers row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_categories row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_products row where row.shop_id = p_shop_id)
    or exists (select 1 from public.inventory_product_prices row where row.shop_id = p_shop_id)
  into v_has_shop_catalog_rows;

  if v_mapped_owner_id is not null then
    select
      exists (select 1 from public.inventory_suppliers row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_categories row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_products row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
      or exists (select 1 from public.inventory_product_prices row where row.shop_id is null and row.owner_user_id = v_mapped_owner_id)
    into v_has_legacy_catalog_rows;
  end if;

  scope_kind := case
    when v_has_shop_catalog_rows and v_has_legacy_catalog_rows
      then 'authorized_shop_plus_legacy'
    when v_has_shop_catalog_rows or v_mapped_owner_id is null
      then 'shop_scoped'
    else 'legacy_owner_bridge'
  end;
  mapped_owner_id := case
    when scope_kind in ('legacy_owner_bridge', 'authorized_shop_plus_legacy')
      then v_mapped_owner_id
    else null
  end;
  authorized_legacy_owner_id := v_mapped_owner_id;
  history_scope_kind := case
    when v_mapped_owner_id is null then 'shop_scoped'
    else 'authorized_shop_plus_legacy'
  end;
  legacy_owner_key := case
    when v_mapped_owner_id is null then null
    else app_private.sync_checkpoint_sha256(lower(v_mapped_owner_id::text))
  end;
  v_account_key := app_private.sync_checkpoint_sha256(
    lower(v_actor_profile_id::text)
  );
  account_key := v_account_key;
  v_device_key := app_private.sync_checkpoint_sha256(v_device_identifier);
  device_key := v_device_key;

  scope_key := app_private.sync_checkpoint_sha256(
    v_account_key || ':' || lower(p_shop_id::text) || ':' || scope_kind || ':' ||
    coalesce(lower(mapped_owner_id::text), '-') || ':' || history_scope_kind || ':' ||
    coalesce(lower(v_mapped_owner_id::text), '-') || ':' || v_device_key
  );
  return next;
end;
$$;

revoke all on function app_private.resolve_shop_sync_recovery_scope(uuid, text)
  from public, anon, authenticated;

-- These public readers call the volatile runtime lease above.  Mark the full
-- publication functions volatile as well so PostgreSQL cannot treat a locked
-- scope decision as a reusable stable expression.
alter function public.shop_sync_recovery_checkpoint_v1(uuid, text, text, text)
  volatile;
alter function public.shop_sync_convergence_marker_v1(uuid, text, text, text)
  volatile;
alter function public.shop_sync_recovery_page_v1(
  uuid, text, text, text, integer, text, text, text
) volatile;
alter function public.shop_sync_rows_by_ids_v1(
  uuid, text, text, text[], text, text, text
) volatile;
alter function public.shop_sync_event_page_v1(uuid, text, text, integer, text, text)
  volatile;

commit;
