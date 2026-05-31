begin;

do $$
declare
  backup_table text;
begin
  foreach backup_table in array array[
    'backup_task108_inventory_suppliers_20260514173049',
    'backup_task108_inventory_categories_20260514173049',
    'backup_task108_inventory_products_20260514173049',
    'backup_task108_inventory_product_prices_20260514173049',
    'backup_task108_shared_sheet_sessions_20260514173049',
    'backup_task108_sync_events_20260514173049'
  ]
  loop
    if to_regclass('public.' || backup_table) is not null then
      execute format('alter table public.%I enable row level security', backup_table);
      execute format('alter table public.%I force row level security', backup_table);
      execute format('revoke all on table public.%I from public', backup_table);
      execute format('revoke all on table public.%I from anon', backup_table);
      execute format('revoke all on table public.%I from authenticated', backup_table);
      execute format(
        'comment on table public.%I is %L',
        backup_table,
        'TASK-018 lockdown: legacy TASK-108 backup table; no PostgREST/client access.'
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
