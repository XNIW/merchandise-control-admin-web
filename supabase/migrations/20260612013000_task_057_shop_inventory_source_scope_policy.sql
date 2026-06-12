-- TASK-057: allow shop members to read their shop inventory-source state.
-- The Admin Web read model must distinguish "no legacy bridge" from
-- "legacy bridge configured but not mapped" without bypassing RLS.

begin;

drop policy if exists shop_inventory_sources_select_member_or_platform_admin
  on public.shop_inventory_sources;

create policy shop_inventory_sources_select_member_or_platform_admin
  on public.shop_inventory_sources
  for select
  to authenticated
  using (
    app_private.is_platform_admin()
    or (
      shop_id is not null
      and app_private.is_active_shop_member(shop_id)
    )
  );

notify pgrst, 'reload schema';

commit;
