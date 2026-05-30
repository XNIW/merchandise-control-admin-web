-- TASK 016 — Storico prezzi user-scoped (DEC-021)
-- Tabella: inventory_product_prices
-- PK id: uuid generato lato client (upsert come catalogo)
-- effective_at / created_at: text canonica Room "yyyy-MM-dd HH:mm:ss"

CREATE TABLE IF NOT EXISTS public.inventory_product_prices (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.inventory_products (id) ON DELETE CASCADE,
    type text NOT NULL,
    price double precision NOT NULL,
    effective_at text NOT NULL,
    source text,
    note text,
    created_at text NOT NULL,
    CONSTRAINT inventory_product_prices_type_check CHECK (type IN ('PURCHASE', 'RETAIL')),
    CONSTRAINT inventory_product_prices_owner_product_type_effective_uniq
        UNIQUE (owner_user_id, product_id, type, effective_at)
);
CREATE INDEX IF NOT EXISTS inventory_product_prices_owner_product_idx
    ON public.inventory_product_prices (owner_user_id, product_id);
ALTER TABLE public.inventory_product_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_product_prices FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_product_prices TO authenticated;
CREATE POLICY inventory_product_prices_select_owner
    ON public.inventory_product_prices FOR SELECT TO authenticated
    USING (auth.uid() = owner_user_id);
CREATE POLICY inventory_product_prices_insert_owner
    ON public.inventory_product_prices FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_product_prices_update_owner
    ON public.inventory_product_prices FOR UPDATE TO authenticated
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY inventory_product_prices_delete_owner
    ON public.inventory_product_prices FOR DELETE TO authenticated
    USING (auth.uid() = owner_user_id);
