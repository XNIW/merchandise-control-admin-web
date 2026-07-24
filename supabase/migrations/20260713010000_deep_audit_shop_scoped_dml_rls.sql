-- Deep audit 2026-07-13: bind owner-scoped browser DML to the selected shop.
-- Legacy rows with shop_id IS NULL remain owner-scoped for Android/iOS
-- compatibility. Shop-scoped rows additionally require active membership.

begin;

drop policy if exists inventory_suppliers_insert_owner on public.inventory_suppliers;
drop policy if exists inventory_suppliers_update_owner on public.inventory_suppliers;
drop policy if exists inventory_suppliers_delete_owner on public.inventory_suppliers;

create policy inventory_suppliers_insert_owner
  on public.inventory_suppliers for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_suppliers_update_owner
  on public.inventory_suppliers for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  )
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_suppliers_delete_owner
  on public.inventory_suppliers for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );

drop policy if exists inventory_categories_insert_owner on public.inventory_categories;
drop policy if exists inventory_categories_update_owner on public.inventory_categories;
drop policy if exists inventory_categories_delete_owner on public.inventory_categories;

create policy inventory_categories_insert_owner
  on public.inventory_categories for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_categories_update_owner
  on public.inventory_categories for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  )
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_categories_delete_owner
  on public.inventory_categories for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );

drop policy if exists inventory_products_insert_owner on public.inventory_products;
drop policy if exists inventory_products_update_owner on public.inventory_products;
drop policy if exists inventory_products_delete_owner on public.inventory_products;

create policy inventory_products_insert_owner
  on public.inventory_products for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_products_update_owner
  on public.inventory_products for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  )
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_products_delete_owner
  on public.inventory_products for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );

drop policy if exists inventory_product_prices_insert_owner on public.inventory_product_prices;
drop policy if exists inventory_product_prices_update_owner on public.inventory_product_prices;
drop policy if exists inventory_product_prices_delete_owner on public.inventory_product_prices;

create policy inventory_product_prices_insert_owner
  on public.inventory_product_prices for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_product_prices_update_owner
  on public.inventory_product_prices for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  )
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy inventory_product_prices_delete_owner
  on public.inventory_product_prices for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );

drop policy if exists "shared_sheet_sessions_insert_owner" on public.shared_sheet_sessions;
drop policy if exists "shared_sheet_sessions_update_owner" on public.shared_sheet_sessions;
drop policy if exists "shared_sheet_sessions_delete_owner" on public.shared_sheet_sessions;

create policy "shared_sheet_sessions_insert_owner"
  on public.shared_sheet_sessions for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy "shared_sheet_sessions_update_owner"
  on public.shared_sheet_sessions for update to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  )
  with check (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );
create policy "shared_sheet_sessions_delete_owner"
  on public.shared_sheet_sessions for delete to authenticated
  using (
    auth.uid() = owner_user_id
    and (shop_id is null or app_private.is_active_shop_member(shop_id))
  );

notify pgrst, 'reload schema';

commit;;
