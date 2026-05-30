-- TASK-110: make existing tombstones visible after adding the update trigger.
--
-- Some pre-trigger tombstones were already written with a stale updated_at value.
-- Bump them once so full/incremental clients re-read the deletion and converge.

update public.shared_sheet_sessions
set updated_at = statement_timestamp()
where deleted_at is not null;
