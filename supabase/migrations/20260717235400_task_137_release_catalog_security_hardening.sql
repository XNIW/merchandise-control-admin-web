-- TASK-137 release hardening: bind catalog/history writes to the authenticated
-- row owner, an active profile, an active owner/manager membership and an
-- active shop. Price history remains append-only independently of caller
-- supplied request headers.

begin;

create or replace function app_private.is_active_shop_catalog_writer(
  target_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles profile
      join public.shop_members member
        on member.profile_id = profile.profile_id
      join public.shops shop
        on shop.shop_id = member.shop_id
      where profile.profile_id = auth.uid()
        and profile.profile_status = 'active'
        and member.shop_id = target_shop_id
        and member.membership_status = 'active'
        and member.role_key in ('shop_owner', 'shop_manager')
        and shop.shop_status = 'active'
    ),
    false
  );
$$;

revoke all on function app_private.is_active_shop_catalog_writer(uuid)
  from public, anon, authenticated;

create or replace function app_private.is_legacy_inventory_write_allowed(
  target_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.uid() = target_owner_user_id
    and exists (
      select 1
      from public.profiles profile
      where profile.profile_id = target_owner_user_id
        and profile.profile_status = 'active'
    )
    and not exists (
      select 1
      from public.shop_inventory_sources source
      where source.owner_user_id = target_owner_user_id
        and source.mapping_state = 'mapped'
        and source.disabled_at is null
        and not exists (
          select 1
          from public.shops shop
          join public.shop_members member
            on member.shop_id = shop.shop_id
          where shop.shop_id = source.shop_id
            and shop.shop_status = 'active'
            and member.profile_id = target_owner_user_id
            and member.membership_status = 'active'
            and member.role_key = 'shop_owner'
        )
    ),
    false
  );
$$;

revoke all on function app_private.is_legacy_inventory_write_allowed(uuid)
  from public, anon, authenticated;
grant execute on function app_private.is_legacy_inventory_write_allowed(uuid)
  to authenticated;

create or replace function app_private.is_shop_catalog_row_write_allowed(
  target_owner_user_id uuid,
  target_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.uid() = target_owner_user_id
    and case
      when target_shop_id is null then
        app_private.is_legacy_inventory_write_allowed(target_owner_user_id)
      else
        app_private.is_active_shop_catalog_writer(target_shop_id)
    end,
    false
  );
$$;

revoke all on function app_private.is_shop_catalog_row_write_allowed(uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.is_shop_catalog_row_write_allowed(uuid, uuid)
  to authenticated;

create or replace function app_private.resolve_shop_catalog_scope(
  target_shop_id uuid
)
returns table (
  catalog_shop_id uuid,
  owner_user_id uuid,
  catalog_scope text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  mapping_row public.shop_inventory_sources%rowtype;
  compatibility_owner_id uuid;
begin
  if target_shop_id is null
    or not app_private.is_active_shop_catalog_writer(target_shop_id) then
    return;
  end if;

  select *
  into mapping_row
  from public.shop_inventory_sources sis
  where sis.shop_id = target_shop_id
    and sis.disabled_at is null
  order by (sis.mapping_state = 'mapped') desc, sis.created_at desc
  limit 1;

  if mapping_row.shop_inventory_source_id is not null
    and mapping_row.mapping_state <> 'mapped' then
    return;
  end if;

  if mapping_row.mapping_state = 'mapped' and mapping_row.owner_user_id is not null then
    compatibility_owner_id := mapping_row.owner_user_id;
  else
    compatibility_owner_id := actor_id;
  end if;

  if compatibility_owner_id is null then
    select shop.created_by_profile_id
    into compatibility_owner_id
    from public.shops shop
    where shop.shop_id = target_shop_id;
  end if;

  if compatibility_owner_id is null then
    select member.profile_id
    into compatibility_owner_id
    from public.shop_members member
    where member.shop_id = target_shop_id
      and member.membership_status = 'active'
      and member.role_key in ('shop_owner', 'shop_manager')
    order by case member.role_key when 'shop_owner' then 0 else 1 end,
      member.created_at
    limit 1;
  end if;

  if compatibility_owner_id is null then
    return;
  end if;

  catalog_shop_id := target_shop_id;
  owner_user_id := compatibility_owner_id;
  catalog_scope := case
    when mapping_row.mapping_state = 'mapped' then 'legacy_owner_bridge'
    else 'shop_scoped'
  end;
  return next;
end;
$$;

revoke all on function app_private.resolve_shop_catalog_scope(uuid)
  from public, anon, authenticated;

drop policy if exists inventory_suppliers_insert_owner
  on public.inventory_suppliers;
drop policy if exists inventory_suppliers_update_owner
  on public.inventory_suppliers;
drop policy if exists inventory_suppliers_delete_owner
  on public.inventory_suppliers;

create policy inventory_suppliers_insert_owner
  on public.inventory_suppliers for insert to authenticated
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );
create policy inventory_suppliers_update_owner
  on public.inventory_suppliers for update to authenticated
  using (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  )
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );

drop policy if exists inventory_categories_insert_owner
  on public.inventory_categories;
drop policy if exists inventory_categories_update_owner
  on public.inventory_categories;
drop policy if exists inventory_categories_delete_owner
  on public.inventory_categories;

create policy inventory_categories_insert_owner
  on public.inventory_categories for insert to authenticated
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );
create policy inventory_categories_update_owner
  on public.inventory_categories for update to authenticated
  using (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  )
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );

drop policy if exists shared_sheet_sessions_insert_owner
  on public.shared_sheet_sessions;
drop policy if exists shared_sheet_sessions_update_owner
  on public.shared_sheet_sessions;
drop policy if exists shared_sheet_sessions_delete_owner
  on public.shared_sheet_sessions;

create policy shared_sheet_sessions_insert_owner
  on public.shared_sheet_sessions for insert to authenticated
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );
create policy shared_sheet_sessions_update_owner
  on public.shared_sheet_sessions for update to authenticated
  using (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  )
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );
create policy shared_sheet_sessions_delete_owner
  on public.shared_sheet_sessions for delete to authenticated
  using (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );

drop policy if exists inventory_products_insert_owner
  on public.inventory_products;
drop policy if exists inventory_products_update_owner
  on public.inventory_products;
drop policy if exists inventory_products_delete_owner
  on public.inventory_products;

create policy inventory_products_insert_owner
  on public.inventory_products for insert to authenticated
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );
create policy inventory_products_update_owner
  on public.inventory_products for update to authenticated
  using (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  )
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );

drop policy if exists inventory_product_prices_insert_owner
  on public.inventory_product_prices;
drop policy if exists inventory_product_prices_update_owner
  on public.inventory_product_prices;
drop policy if exists inventory_product_prices_delete_owner
  on public.inventory_product_prices;

create policy inventory_product_prices_insert_owner
  on public.inventory_product_prices for insert to authenticated
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );
create policy inventory_product_prices_update_owner
  on public.inventory_product_prices for update to authenticated
  using (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  )
  with check (
    app_private.is_shop_catalog_row_write_allowed(owner_user_id, shop_id)
  );

create or replace function app_private.emit_mobile_row_sync_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_source text := app_private.mobile_sync_request_source();
  v_row jsonb := to_jsonb(new);
  v_old_row jsonb;
  v_owner_user_id uuid;
  v_shop_id uuid;
  v_entity_id text;
  v_entity_key text;
  v_entity_type text;
  v_domain text;
  v_event_type text;
  v_operation text;
  v_client_event_id text;
begin
  if v_source is null then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'mobile atomic sync event requires an authenticated user'
      using errcode = '28000';
  end if;

  if tg_op = 'UPDATE' then
    v_old_row := to_jsonb(old);
    if (v_old_row - 'updated_at') = (v_row - 'updated_at') then
      return new;
    end if;
    if nullif(v_old_row->>'deleted_at', '') is not null
      and nullif(v_row->>'deleted_at', '') is not null
      and (v_old_row - 'updated_at' - 'deleted_at') =
          (v_row - 'updated_at' - 'deleted_at') then
      return new;
    end if;
  end if;

  v_owner_user_id := nullif(v_row->>'owner_user_id', '')::uuid;
  v_shop_id := nullif(v_row->>'shop_id', '')::uuid;

  if v_owner_user_id is null then
    raise exception 'mobile atomic sync event row has no owner'
      using errcode = '23502';
  end if;

  if not app_private.is_shop_catalog_row_write_allowed(
    v_owner_user_id,
    v_shop_id
  ) then
    raise exception 'mobile atomic sync row scope is not authorized'
      using errcode = '42501';
  end if;

  case tg_table_name
    when 'inventory_suppliers' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'supplier_ids';
      v_entity_type := 'supplier';
      v_domain := 'catalog';
    when 'inventory_categories' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'category_ids';
      v_entity_type := 'category';
      v_domain := 'catalog';
    when 'inventory_products' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'product_ids';
      v_entity_type := 'product';
      v_domain := 'catalog';
    when 'inventory_product_prices' then
      v_entity_id := v_row->>'id';
      v_entity_key := 'price_ids';
      v_entity_type := 'product_price';
      v_domain := 'prices';
    when 'shared_sheet_sessions' then
      v_entity_id := v_row->>'remote_id';
      v_entity_key := 'session_ids';
      v_entity_type := 'history_session';
      v_domain := 'history';
    else
      raise exception 'unsupported mobile atomic sync table: %', tg_table_name
        using errcode = '22023';
  end case;

  if v_entity_id is null
    or v_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'mobile atomic sync entity id must be a uuid'
      using errcode = '22023';
  end if;

  if v_domain <> 'prices'
    and nullif(v_row->>'deleted_at', '') is not null then
    v_event_type := case
      when v_domain = 'history' then 'history_tombstone'
      else 'catalog_tombstone'
    end;
    v_operation := 'tombstone';
  else
    v_event_type := case v_domain
      when 'prices' then 'prices_changed'
      when 'history' then 'history_changed'
      else 'catalog_changed'
    end;
    v_operation := case when tg_op = 'INSERT' then 'create' else 'update' end;
  end if;

  v_client_event_id := left(
    'mobile_auto:' || v_source || ':' || tg_table_name || ':' ||
      v_entity_id || ':' || md5(v_row::text),
    160
  );

  begin
    insert into public.sync_events (
      changed_count,
      client_event_id,
      domain,
      entity_ids,
      event_type,
      metadata,
      owner_user_id,
      shop_id,
      source,
      source_device_id
    )
    values (
      1,
      v_client_event_id,
      v_domain,
      jsonb_build_object(v_entity_key, jsonb_build_array(v_entity_id)),
      v_event_type,
      jsonb_build_object(
        'atomic_trigger', true,
        'entity_type', v_entity_type,
        'operation', v_operation,
        'payload_version', 1,
        'source', v_source,
        'status', 'success'
      ),
      v_owner_user_id,
      v_shop_id,
      v_source,
      null
    );
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

revoke all on function app_private.emit_mobile_row_sync_event()
  from public, anon, authenticated;

create or replace function app_private.guard_mobile_product_price_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if to_jsonb(old) = to_jsonb(new) then
    return old;
  end if;

  raise exception 'price_idempotency_conflict'
    using errcode = '23505';
end;
$$;

revoke all on function app_private.guard_mobile_product_price_append_only()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
