-- TASK 086 - Inventory catalog updated_at trigger policy
--
-- Additive migration: make catalog row updated_at advance on normal UPDATE.
-- Scope is limited to:
--   - public.inventory_suppliers
--   - public.inventory_categories
--   - public.inventory_products
--
-- Out of scope: product prices, sync_events, history_entries, shared_sheet_sessions,
-- backfills, RLS, grants, unique constraints, and data cleanup.

begin;

create or replace function public.set_inventory_catalog_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    -- Keep the tombstone invariant local to this trigger too. The existing
    -- inventory_catalog_block_update_when_tombstoned trigger remains the
    -- primary guard, but this prevents an updated_at bump on already deleted rows.
    if old.deleted_at is not null then
        return old;
    end if;

    new.updated_at = statement_timestamp();
    return new;
end;
$$;

drop trigger if exists trg_inventory_suppliers_set_updated_at on public.inventory_suppliers;
create trigger trg_inventory_suppliers_set_updated_at
    before update on public.inventory_suppliers
    for each row
    execute function public.set_inventory_catalog_updated_at();

drop trigger if exists trg_inventory_categories_set_updated_at on public.inventory_categories;
create trigger trg_inventory_categories_set_updated_at
    before update on public.inventory_categories
    for each row
    execute function public.set_inventory_catalog_updated_at();

drop trigger if exists trg_inventory_products_set_updated_at on public.inventory_products;
create trigger trg_inventory_products_set_updated_at
    before update on public.inventory_products
    for each row
    execute function public.set_inventory_catalog_updated_at();

commit;

-- Rollback, if needed:
--
-- begin;
-- drop trigger if exists trg_inventory_suppliers_set_updated_at on public.inventory_suppliers;
-- drop trigger if exists trg_inventory_categories_set_updated_at on public.inventory_categories;
-- drop trigger if exists trg_inventory_products_set_updated_at on public.inventory_products;
-- drop function if exists public.set_inventory_catalog_updated_at();
-- commit;
