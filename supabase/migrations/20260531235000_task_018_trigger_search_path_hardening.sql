begin;

create or replace function public.set_shared_sheet_sessions_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
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

notify pgrst, 'reload schema';

commit;
