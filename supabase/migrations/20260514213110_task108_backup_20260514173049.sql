create table if not exists public.backup_task108_inventory_suppliers_20260514173049 as
select *
from public.inventory_suppliers
where owner_user_id = '6425adb0-33e3-4b6c-a9a7-ed3761e8257e';

create table if not exists public.backup_task108_inventory_categories_20260514173049 as
select *
from public.inventory_categories
where owner_user_id = '6425adb0-33e3-4b6c-a9a7-ed3761e8257e';

create table if not exists public.backup_task108_inventory_products_20260514173049 as
select *
from public.inventory_products
where owner_user_id = '6425adb0-33e3-4b6c-a9a7-ed3761e8257e';

create table if not exists public.backup_task108_inventory_product_prices_20260514173049 as
select *
from public.inventory_product_prices
where owner_user_id = '6425adb0-33e3-4b6c-a9a7-ed3761e8257e';

create table if not exists public.backup_task108_shared_sheet_sessions_20260514173049 as
select *
from public.shared_sheet_sessions
where owner_user_id = '6425adb0-33e3-4b6c-a9a7-ed3761e8257e';

create table if not exists public.backup_task108_sync_events_20260514173049 as
select *
from public.sync_events
where owner_user_id = '6425adb0-33e3-4b6c-a9a7-ed3761e8257e';;
