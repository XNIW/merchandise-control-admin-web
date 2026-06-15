-- Allow Admin Web shop members to read legacy mobile history rows after a
-- shop_inventory_sources mapping connects that owner_user_id to their shop.

begin;

drop policy if exists shared_sheet_sessions_select_mapped_shop_member_legacy
  on public.shared_sheet_sessions;

create policy shared_sheet_sessions_select_mapped_shop_member_legacy
  on public.shared_sheet_sessions
  for select
  to authenticated
  using (
    shop_id is null
    and exists (
      select 1
      from public.shop_inventory_sources source
      where source.owner_user_id = shared_sheet_sessions.owner_user_id
        and source.shop_id is not null
        and source.mapping_state = 'mapped'
        and source.disabled_at is null
        and app_private.is_active_shop_member(source.shop_id)
    )
  );

drop policy if exists sync_events_select_mapped_shop_member_legacy
  on public.sync_events;

create policy sync_events_select_mapped_shop_member_legacy
  on public.sync_events
  for select
  to authenticated
  using (
    shop_id is null
    and exists (
      select 1
      from public.shop_inventory_sources source
      where source.owner_user_id = sync_events.owner_user_id
        and source.shop_id is not null
        and source.mapping_state = 'mapped'
        and source.disabled_at is null
        and app_private.is_active_shop_member(source.shop_id)
    )
  );

notify pgrst, 'reload schema';

commit;
