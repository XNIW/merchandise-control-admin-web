-- Task 038 — Restrict DELETE for role `authenticated` on inventory catalog + catalog prices
--
-- Additive migration only. Do not edit historical files 013/016/019.
-- Aligns live posture with DEC-022 (tombstone) / DEC-021 D5 (append-only prices) per task 037 Esito B.
-- Apply remotely only under TASKS/038_remote_delete_restriction_apply_and_postcheck.md (ops gate + post-check).
--
-- NOT applied automatically by this repo commit.

begin;
drop policy if exists inventory_suppliers_delete_owner on public.inventory_suppliers;
drop policy if exists inventory_categories_delete_owner on public.inventory_categories;
drop policy if exists inventory_products_delete_owner on public.inventory_products;
drop policy if exists inventory_product_prices_delete_owner on public.inventory_product_prices;
revoke delete on table public.inventory_suppliers from authenticated;
revoke delete on table public.inventory_categories from authenticated;
revoke delete on table public.inventory_products from authenticated;
revoke delete on table public.inventory_product_prices from authenticated;
commit;
