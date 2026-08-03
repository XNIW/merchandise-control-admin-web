-- Storefront v1 / TASK-006 staging ACL parity repair.
--
-- Supabase cloud default privileges may grant service_role DML on newly-created
-- public tables. Projection mutation must remain confined to SECURITY DEFINER
-- rebuild functions, so revoke explicitly after the projection migration.

begin;

revoke all on table public.storefront_catalog_items from service_role;
revoke all on table public.storefront_catalog_versions from service_role;

grant select on table public.storefront_catalog_items to service_role;
grant select on table public.storefront_catalog_versions to service_role;

commit;
