-- TASK 010
-- Artifact remoto minimo per invalidazione Realtime delle sessioni condivisibili v1.
-- Non e' un mirror 1:1 di public.history_entries: contiene solo il payload logico
-- necessario a produrre RemoteSignal.PayloadAvailable lato Android.

create table if not exists public.shared_sheet_sessions (
    remote_id text primary key,
    payload_version integer not null check (payload_version >= 1),
    "timestamp" text not null,
    supplier text not null default '',
    category text not null default '',
    is_manual_entry boolean not null default false,
    data jsonb not null check (jsonb_typeof(data) = 'array'),
    updated_at timestamptz not null default timezone('utc', now())
);
alter table public.shared_sheet_sessions enable row level security;
revoke all on table public.shared_sheet_sessions from anon, authenticated;
grant select on table public.shared_sheet_sessions to anon, authenticated;
drop policy if exists "shared_sheet_sessions_select_public" on public.shared_sheet_sessions;
create policy "shared_sheet_sessions_select_public"
on public.shared_sheet_sessions
for select
to anon, authenticated
using (true);
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'shared_sheet_sessions'
    ) then
        alter publication supabase_realtime add table public.shared_sheet_sessions;
    end if;
end
$$;
