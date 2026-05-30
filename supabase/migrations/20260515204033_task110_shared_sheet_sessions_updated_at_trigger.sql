-- TASK-110: keep shared_sheet_sessions tombstones visible to incremental sync.
--
-- The table had an updated_at DEFAULT for inserts but no UPDATE trigger. History
-- tombstones written by app upserts could therefore change deleted_at without
-- advancing updated_at, so clients that pull incrementally by updated_at missed
-- the delete and left the session active locally.

create or replace function public.set_shared_sheet_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    new.deleted_at = old.deleted_at;
  end if;

  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at = statement_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shared_sheet_sessions_set_updated_at on public.shared_sheet_sessions;

create trigger trg_shared_sheet_sessions_set_updated_at
before update on public.shared_sheet_sessions
for each row
execute function public.set_shared_sheet_sessions_updated_at();

update public.shared_sheet_sessions
set updated_at = statement_timestamp()
where deleted_at is not null
  and updated_at < deleted_at;
