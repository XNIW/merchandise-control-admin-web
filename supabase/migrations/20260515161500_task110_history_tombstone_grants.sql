-- TASK-110: History tombstone + grants hardening.
--
-- Stato al 2026-05-15:
-- - file preparato per migration workflow;
-- - non applicare con raw SQL non tracciato se la migration history locale/remota è divergente.

begin;

alter table public.shared_sheet_sessions
  add column if not exists deleted_at timestamptz;

create index if not exists shared_sheet_sessions_owner_updated_idx
  on public.shared_sheet_sessions (owner_user_id, updated_at);

create index if not exists shared_sheet_sessions_owner_deleted_idx
  on public.shared_sheet_sessions (owner_user_id, deleted_at)
  where deleted_at is not null;

revoke all on table public.shared_sheet_sessions from anon;
grant select, insert, update, delete on table public.shared_sheet_sessions to authenticated;
grant select, insert, update, delete on table public.shared_sheet_sessions to service_role;

revoke all on table public.product_prices from anon;

do $$
begin
  if to_regclass('public.product_prices_id_seq') is not null then
    revoke all on sequence public.product_prices_id_seq from anon;
  end if;
end;
$$;

-- Rete di sicurezza per nuovi oggetti: non sostituisce grants/RLS espliciti per tabella.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

notify pgrst, 'reload schema';

commit;
