-- TASK-089 - POS catalog pull delta indexes
-- Additive indexes for /api/pos/catalog/pull timestamp windows.

begin;

create index if not exists inventory_products_shop_updated_id_idx
  on public.inventory_products (shop_id, updated_at, id)
  where shop_id is not null;

create index if not exists inventory_categories_shop_updated_id_idx
  on public.inventory_categories (shop_id, updated_at, id)
  where shop_id is not null;

create index if not exists inventory_suppliers_shop_updated_id_idx
  on public.inventory_suppliers (shop_id, updated_at, id)
  where shop_id is not null;

create index if not exists inventory_product_prices_shop_created_id_idx
  on public.inventory_product_prices (shop_id, created_at, id)
  where shop_id is not null;

create index if not exists inventory_products_legacy_owner_updated_id_idx
  on public.inventory_products (owner_user_id, updated_at, id)
  where shop_id is null;

create index if not exists inventory_categories_legacy_owner_updated_id_idx
  on public.inventory_categories (owner_user_id, updated_at, id)
  where shop_id is null;

create index if not exists inventory_suppliers_legacy_owner_updated_id_idx
  on public.inventory_suppliers (owner_user_id, updated_at, id)
  where shop_id is null;

create index if not exists inventory_product_prices_legacy_owner_created_id_idx
  on public.inventory_product_prices (owner_user_id, created_at, id)
  where shop_id is null;

commit;
