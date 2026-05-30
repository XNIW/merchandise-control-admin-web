-- TASK 013 — Catalogo base user-scoped (DEC-020)
-- Tabelle: inventory_suppliers, inventory_categories, inventory_products
-- RLS: auth.uid() = owner_user_id; anon senza grant.

CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    name text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_suppliers_owner_name_lower ON public.inventory_suppliers (owner_user_id, lower(name));
CREATE TABLE IF NOT EXISTS public.inventory_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    name text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_categories_owner_name_lower
    ON public.inventory_categories (owner_user_id, lower(name));
CREATE TABLE IF NOT EXISTS public.inventory_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    barcode text NOT NULL,
    item_number text,
    product_name text,
    second_product_name text,
    purchase_price double precision,
    retail_price double precision,
    supplier_id uuid REFERENCES public.inventory_suppliers (id) ON DELETE SET NULL,
    category_id uuid REFERENCES public.inventory_categories (id) ON DELETE SET NULL,
    stock_quantity double precision,
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_owner_barcode
    ON public.inventory_products (owner_user_id, barcode);
ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_suppliers FROM anon, authenticated;
REVOKE ALL ON TABLE public.inventory_categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.inventory_products FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_products TO authenticated;
-- inventory_suppliers
CREATE POLICY inventory_suppliers_select_owner
    ON public.inventory_suppliers FOR SELECT TO authenticated
    USING (auth.uid() = owner_user_id);
CREATE POLICY inventory_suppliers_insert_owner
    ON public.inventory_suppliers FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_suppliers_update_owner
    ON public.inventory_suppliers FOR UPDATE TO authenticated
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_suppliers_delete_owner
    ON public.inventory_suppliers FOR DELETE TO authenticated
    USING (auth.uid() = owner_user_id);
-- categories
CREATE POLICY inventory_categories_select_owner
    ON public.inventory_categories FOR SELECT TO authenticated
    USING (auth.uid() = owner_user_id);
CREATE POLICY inventory_categories_insert_owner
    ON public.inventory_categories FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_categories_update_owner
    ON public.inventory_categories FOR UPDATE TO authenticated
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_categories_delete_owner
    ON public.inventory_categories FOR DELETE TO authenticated
    USING (auth.uid() = owner_user_id);
-- products
CREATE POLICY inventory_products_select_owner
    ON public.inventory_products FOR SELECT TO authenticated
    USING (auth.uid() = owner_user_id);
CREATE POLICY inventory_products_insert_owner
    ON public.inventory_products FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_products_update_owner
    ON public.inventory_products FOR UPDATE TO authenticated
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_products_delete_owner
    ON public.inventory_products FOR DELETE TO authenticated
    USING (auth.uid() = owner_user_id);
