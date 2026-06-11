-- TASK-053: staff safe read boundary grant reconciliation.
-- The safe view already exposes web_access_revoked_at and does not expose
-- credential_hash. Because the view is security_invoker, authenticated users
-- also need column-level SELECT on every safe base-table column selected by the
-- view. This migration grants only the missing safe column; it does not grant
-- credential_hash, mutative privileges, or anon access.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'staff_accounts'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'TASK053: public.staff_accounts must have RLS enabled before exposing the safe view';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'staff_accounts_safe'
      AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'TASK053: public.staff_accounts_safe must remain security_invoker=true';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.view_column_usage
    WHERE view_schema = 'public'
      AND view_name = 'staff_accounts_safe'
      AND table_schema = 'public'
      AND table_name = 'staff_accounts'
      AND column_name = 'credential_hash'
  ) THEN
    RAISE EXCEPTION 'TASK053: credential_hash must not be exposed by public.staff_accounts_safe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_accounts'
      AND column_name = 'web_access_revoked_at'
  ) THEN
    RAISE EXCEPTION 'TASK053: web_access_revoked_at is required before reconciling staff_accounts_safe grants';
  END IF;
END $$;

grant select (web_access_revoked_at)
  on table public.staff_accounts
  to authenticated;

revoke all on table public.staff_accounts_safe from anon;
revoke all on table public.staff_accounts_safe from authenticated;
grant select on table public.staff_accounts_safe to authenticated;

notify pgrst, 'reload schema';
