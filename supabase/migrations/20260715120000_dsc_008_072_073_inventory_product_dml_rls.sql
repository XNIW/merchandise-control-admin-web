-- DSC-008/072/073: fail closed when catalog writes cross a shop role or
-- mapped-owner lifecycle boundary, while preserving unmapped legacy clients.

begin;

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
    and not exists (
      select 1
      from public.shop_inventory_sources as source
      where source.owner_user_id = target_owner_user_id
        and source.mapping_state = 'mapped'
        and source.disabled_at is null
        and not exists (
          select 1
          from public.shop_members as member
          where member.shop_id = source.shop_id
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

drop policy if exists inventory_products_insert_owner
  on public.inventory_products;
drop policy if exists inventory_products_update_owner
  on public.inventory_products;
drop policy if exists inventory_products_delete_owner
  on public.inventory_products;

create policy inventory_products_insert_owner
  on public.inventory_products for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  );
create policy inventory_products_update_owner
  on public.inventory_products for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  )
  with check (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  );
create policy inventory_products_delete_owner
  on public.inventory_products for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
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
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  );
create policy inventory_product_prices_update_owner
  on public.inventory_product_prices for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  )
  with check (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  );
create policy inventory_product_prices_delete_owner
  on public.inventory_product_prices for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (
      (
        shop_id is null
        and app_private.is_legacy_inventory_write_allowed(owner_user_id)
      )
      or (
        shop_id is not null
        and app_private.is_active_shop_staff_admin_member(shop_id)
      )
    )
  );

notify pgrst, 'reload schema';

commit;
