-- TASK-110: canonicalize shared_sheet_sessions remote_id casing.
-- Android uses lowercase UUID strings, while Swift UUID encoding can emit uppercase.
-- Keep the lowercase variant when a case-insensitive duplicate exists, then enforce lowercase.

with ranked as (
  select
    ctid,
    remote_id,
    row_number() over (
      partition by lower(remote_id)
      order by
        case when remote_id = lower(remote_id) then 0 else 1 end,
        updated_at desc nulls last
    ) as rn
  from public.shared_sheet_sessions
)
delete from public.shared_sheet_sessions s
using ranked r
where s.ctid = r.ctid
  and r.rn > 1;

update public.shared_sheet_sessions
set remote_id = lower(remote_id)
where remote_id <> lower(remote_id);

alter table public.shared_sheet_sessions
drop constraint if exists shared_sheet_sessions_remote_id_lowercase_chk;

alter table public.shared_sheet_sessions
add constraint shared_sheet_sessions_remote_id_lowercase_chk
check (remote_id = lower(remote_id));
