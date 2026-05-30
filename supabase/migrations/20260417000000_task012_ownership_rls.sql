-- TASK 012: Ownership e hardening RLS su shared_sheet_sessions

-- 1. Svuotiamo i vecchi payload senza ownership (essendo payload dev, nessuna perdita domain data)
TRUNCATE public.shared_sheet_sessions;

-- 2. Aggiungiamo la colonna owner_user_id
ALTER TABLE public.shared_sheet_sessions
ADD COLUMN owner_user_id uuid NOT NULL
REFERENCES auth.users(id) ON DELETE CASCADE;

-- Default e retro-compatibilità rimossi, in quanto su TRUNCATE non servono,
-- ma garantiamo che ogni record futuro debba avere l'owner_user_id (gestito lato Edge o Push API)

-- 3. Drop delle policy vecchie permissive ("pubbliche" in lettura)
DROP POLICY IF EXISTS "shared_sheet_sessions_select_public" ON public.shared_sheet_sessions;

-- 4. Creazione policy RLS restrittiva user-scoped
CREATE POLICY "shared_sheet_sessions_select_owner"
ON public.shared_sheet_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = owner_user_id);

-- E se servisse l'insert, l'owner dovrebbe inserire la propria riga
CREATE POLICY "shared_sheet_sessions_insert_owner"
ON public.shared_sheet_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_user_id);

-- Opzionali update e delete (anche se non usati dal subscriber)
CREATE POLICY "shared_sheet_sessions_update_owner"
ON public.shared_sheet_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "shared_sheet_sessions_delete_owner"
ON public.shared_sheet_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = owner_user_id);

-- 5. Revoca grant dall'anon
REVOKE ALL ON TABLE public.shared_sheet_sessions FROM anon;

-- 6. Privilegi scoped per `authenticated`: SOLO le operazioni coperte dalle policy RLS.
--    NOTA sicurezza: `GRANT ALL` includerebbe TRUNCATE e REFERENCES, che NON rispettano RLS;
--    un utente authenticated potrebbe TRUNCATE l'intera tabella bypassando la policy user-scoped.
--    Qui concediamo esplicitamente solo DML coperto dalle policy definite sopra.
REVOKE ALL ON TABLE public.shared_sheet_sessions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shared_sheet_sessions TO authenticated;
