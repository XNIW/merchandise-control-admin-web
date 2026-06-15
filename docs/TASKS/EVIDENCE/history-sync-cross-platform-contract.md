# Mobile History Cross-Platform Contract Note

Status: read-only Admin Console compatibility note.

The Admin Console currently reads mobile history data from `shared_sheet_sessions`
and related technical activity from `sync_events`. It must keep those surfaces
separate from Admin `audit_logs`.

Future Admin writes must preserve the Android/iOS contract:

- `shared_sheet_sessions.remote_id` must be a lowercase UUID string. Android and
  iOS both treat it as the stable cross-device history entry identity.
- payload v2 rows must use `payload_version = 2` and `session_overlay` with
  `overlay_schema = 1`, `editable` as a grid matching `data`, and `complete` as
  one flag per `data` row.
- legacy payload v1 rows may be read and diagnosed, but new Admin writes must
  not create v1 rows.
- tombstones are represented by `deleted_at`; Admin must not hide them from
  diagnostics or reinterpret them as hard deletes.
- related `sync_events.entity_ids` can reference sessions through
  `history_session_ids`, `session_ids`, `sessionIds`, `session_id`, or
  `sessionId`; Admin read models should normalize all supported variants.
- Admin writes, when added, must go through audited server-side RPC/server-action
  boundaries. They must not perform raw client/browser mutations and must never
  expose service-role credentials to the browser.
