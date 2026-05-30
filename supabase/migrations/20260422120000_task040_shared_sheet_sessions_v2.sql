-- TASK 040: payload v2 full-fidelity per shared_sheet_sessions.
-- Additiva e compatibile con record/client v1: nessun backfill massivo.

alter table public.shared_sheet_sessions
add column if not exists display_name text not null default '';
alter table public.shared_sheet_sessions
add column if not exists session_overlay jsonb;
alter table public.shared_sheet_sessions
drop constraint if exists shared_sheet_sessions_session_overlay_shape_chk;
alter table public.shared_sheet_sessions
add constraint shared_sheet_sessions_session_overlay_shape_chk
check (
    session_overlay is null
    or (
        jsonb_typeof(session_overlay) = 'object'
        and session_overlay ? 'overlay_schema'
        and jsonb_typeof(session_overlay -> 'overlay_schema') = 'number'
        and session_overlay ? 'editable'
        and jsonb_typeof(session_overlay -> 'editable') = 'array'
        and session_overlay ? 'complete'
        and jsonb_typeof(session_overlay -> 'complete') = 'array'
        and pg_column_size(session_overlay) <= 524288
    )
);
