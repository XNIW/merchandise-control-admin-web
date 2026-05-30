-- TASK 019 — Tombstone catalogo (`deleted_at`) + anti-resurrezione + partial UNIQUE
-- Non applicare live in questo task: file solo per repo/staging.

ALTER TABLE public.inventory_suppliers
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.inventory_categories
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE public.inventory_products
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
-- Sostituisce UNIQUE «sempre attivo» con partial UNIQUE solo righe non tombstonate
DROP INDEX IF EXISTS inventory_suppliers_owner_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_suppliers_owner_name_lower_active
    ON public.inventory_suppliers (owner_user_id, lower(name))
    WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS inventory_categories_owner_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_categories_owner_name_lower_active
    ON public.inventory_categories (owner_user_id, lower(name))
    WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS inventory_products_owner_barcode;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_owner_barcode_active
    ON public.inventory_products (owner_user_id, barcode)
    WHERE deleted_at IS NULL;
-- Anti-resurrezione: nessun UPDATE su riga già tombstonata (upsert concorrente non può ripulire deleted_at)
CREATE OR REPLACE FUNCTION public.inventory_catalog_block_update_when_tombstoned()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.deleted_at IS NOT NULL THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS inventory_suppliers_block_post_tombstone_update ON public.inventory_suppliers;
CREATE TRIGGER inventory_suppliers_block_post_tombstone_update
    BEFORE UPDATE ON public.inventory_suppliers
    FOR EACH ROW
    EXECUTE PROCEDURE public.inventory_catalog_block_update_when_tombstoned();
DROP TRIGGER IF EXISTS inventory_categories_block_post_tombstone_update ON public.inventory_categories;
CREATE TRIGGER inventory_categories_block_post_tombstone_update
    BEFORE UPDATE ON public.inventory_categories
    FOR EACH ROW
    EXECUTE PROCEDURE public.inventory_catalog_block_update_when_tombstoned();
DROP TRIGGER IF EXISTS inventory_products_block_post_tombstone_update ON public.inventory_products;
CREATE TRIGGER inventory_products_block_post_tombstone_update
    BEFORE UPDATE ON public.inventory_products
    FOR EACH ROW
    EXECUTE PROCEDURE public.inventory_catalog_block_update_when_tombstoned();
