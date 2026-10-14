# Bounded History physical normalization — TASK-159

Status: reviewed TEST migration and one exact-manifest apply completed on
2026-09-29UTC. Independent postcheck confirms16 unchanged full-row hashes/revisions,
compression NULL, zero markers and2074 unchanged events. Native recovery and
convergence require separate authentic verification. The ordinary recovery guard
remains fail closed for compressed JSONB; this is maintenance, not a client API.

Service version20260929013345 reconciles source20260928193505 with identical SQL
SHA256 `5317369f8a5145f87732ead2879a795ab25c63c6853989f5f5a5f36b16f3a1b9`.
The plan and postcheck remain private; the [TASK-159 receipt](../TASKS/TASK-159-wechat-010-staging-readiness.md)
records execution and limits. The completed plan cannot be replayed.

## Why this contract exists

Legacy active `shared_sheet_sessions` rows can retain PGLZ compression despite
`data` and `session_overlay` already using `STORAGE EXTERNAL`. `SET STORAGE` only
controls future representations. The canonical updated-at trigger checks OLD and
NEW, so an ordinary preserving UPDATE correctly fails with SQLSTATE23514.
Neither deleting History, assigning tombstones, changing revisions, disabling
triggers, changing replication role nor setting a caller-controlled GUC is a repair.

The new postgres-only functions are private in `app_private`. They authorize a
bounded physical rewrite through one transaction-bound marker per exact row.
All columns compare equal; no timestamp, identity, JSON content, capability or
sync event is changed. The statement event publisher remains unchanged and
selects only rows with a changed `updated_at`.

## Pinned PostgreSQL proof and boundaries

The local target uses PostgreSQL17.6. Primary source pin: release `REL_17_6`, commit
`7885b94dd81b98bbab9ed878680d156df7bf857f` in the official PostgreSQL repository.

- [PGLZ decoder](https://github.com/postgres/postgres/blob/7885b94dd81b98bbab9ed878680d156df7bf857f/src/common/pg_lzcompress.c#L692): a literal emits one byte; a match emits at most273 bytes and consumes2/3 bytes. Thus273 times the input length is a conservative expansion bound, including overlapping copies.
- [Physical size](https://github.com/postgres/postgres/blob/7885b94dd81b98bbab9ed878680d156df7bf857f/src/backend/utils/adt/varlena.c#L5014) calls `toast_datum_size`, which reads inline size or external metadata without detoasting. The bound used is `4 + 273::bigint * pg_column_size(value) <= 2097152`; it is rejected, never clamped. Only `pglz` qualifies. Uncompressed input instead requires `4 + physical_size <= 2097152`. LZ4/unknown methods are rejected. Each accepted clone must additionally fit the unchanged1048576-byte binary gate.
- [JSONB concat](https://github.com/postgres/postgres/blob/7885b94dd81b98bbab9ed878680d156df7bf857f/src/backend/utils/adt/jsonfuncs.c#L4599) obtains arguments via [PG_DETOAST_DATUM](https://github.com/postgres/postgres/blob/7885b94dd81b98bbab9ed878680d156df7bf857f/src/include/utils/jsonb.h#L374), then returns the nonempty operand for same-kind empty concat. After the procedural physical gate and root-type check, `data || '[]'::jsonb` and `overlay || '{}'::jsonb` produce an uncompressed, unchanged datum without `jsonb_out` or `numeric_out`.
- [TOAST replacement](https://github.com/postgres/postgres/blob/7885b94dd81b98bbab9ed878680d156df7bf857f/src/backend/access/table/toast_helper.c#L73) reuses the old external pointer only when the new value is still that same pointer. The clone is already detoasted; EXTERNAL prevents recompression. Persisted compression is nevertheless checked after UPDATE.
- `toast_raw_datum_size` is an internal C primitive, not an entry in the official SQL catalog. No extension or wrapper around unsupported internal symbols is introduced.

This proof assumes valid PostgreSQL-produced compressed storage. It is not a disk
corruption repair: the native decompressor allocates according to its raw-size
header before checking the compressed stream. Suspected physical corruption is a
separate DBA incident and must not use this procedure.

Do not text-roundtrip, hash, log, `to_jsonb(row)::text`, or serialize JSON before the
scalar storage gates and canonical typed validation. Compact numeric exponents can
have a very large textual representation. The canonical validator rejects numeric
History cells/malformed overlays before serialization and retains the524288-byte
logical payload rules and existing recovery DTO envelope.

## Contract

`wechat_history_normalization_plan_v1(shop_uuid, sorted_unique_ids)` is STABLE and
read-only. It accepts1–32 exact canonical row identifiers, active shop-scoped rows
only, each with at least one compressed payload. It returns only a versioned
manifest: shop, sorted identifiers, revisions, SHA256 of the complete validated
row, compression methods and physical sizes. No business JSON is returned.

`wechat_history_normalization_apply_v1(shop_uuid, manifest)` is VOLATILE. Both entry
points and their helpers are SECURITY INVOKER and check `current_user='postgres'`.
PUBLIC/anon/authenticated/service_role have no EXECUTE or marker-table privileges.
The marker table has RLS enabled and no client policy. The migration also requires
postgres ownership and PostgreSQL major17.

Apply bounds the manifest, takes NOWAIT locks on the active shop and the complete
ordered row set, then recomputes and exactly compares the plan. Unknown fields,
changed physical representation/content/revision, scope mismatch, missing rows,
duplicates and already-normalized rows are rejected. This is not an automatic
retry or replay API.

Each marker binds full transaction ID (`xid8`), backend PID, primary identifier,
shop, expected revision and whole-row hash. Only trusted postgres can write it.
The trigger repeats scalar OLD bounds, requires NEW uncompressed/canonically
valid, equal expected hashes and complete `NEW IS NOT DISTINCT FROM OLD`. It
consumes the marker and returns NEW without changing its timestamp. The ordinary
trigger body is otherwise unchanged. No check of definer `current_user` is used
as caller authorization.

Apply rereads the persisted row, verifies compression and the full hash, checks
marker consumption and exact row count, and verifies no added shop sync events.
Errors propagate and roll back the entire statement. A concurrent unrelated shop
event can conservatively fail the event-count postcheck; acquire a quiet maintenance
window and re-plan deliberately rather than retrying automatically.

## Review and execution packet

Every subsequent maintenance operation requires a fresh scoped mandate, plan and
independent review; the completed TEST receipt does not authorize replay. The
Admin operator must:

1. Pin the code/SQL artifact and target using the current authorized TEST packet.
   Verify the fresh migration registry, source owners/ACL/function fingerprints,
   table storage mode, active exact shop and exact intended row inventory. Do not
   infer current registry state from this schema-only local template or an older
   receipt; coordinate other pending TEST DDL first.
2. Save protected pre-apply schema/ACL definitions and registry hashes, plus the
   minimal metadata manifest. Keep identifiers and content hashes in the private
   packet. Never dump business JSON or credentials to logs/repository/chat.
3. Apply the independently reviewed additive migration through the normal Admin
   migration workflow, with current_user postgres. No Worker or feature flag changes.
4. Obtain a fresh plan with the exact sorted approved identifiers. Store/hash the
   manifest privately and review the count, bounds, scope and revisions. An empty,
   unsupported or invalid result is a refusal, not permission to relax validation.
5. In one postgres transaction with finite lock/statement timeouts, apply the exact
   manifest once. SQLSTATE55P03/40001 or another refusal requires investigation and
   a new plan; no bypass or automatic write retry. No live data or IDs are embedded
   in this runbook.
6. Independently compare persisted metadata/hash/revision, compression NULL, exact
   count, empty markers and unchanged events, then verify the native checkpoint
   and authentic recovery separately. Maintenance success does not establish native
   convergence, business E2E or phone acceptance.

Rollback: on an apply error PostgreSQL restores all rows and markers atomically.
After successful physical normalization there is no reason to recompress data.
If the schema change must be withdrawn, use a reviewed compensating migration:
restore the protected original trigger definition/ACL, ensure markers are empty,
remove the newly introduced private helpers/table, and verify unchanged canonical
functions. Never delete migration history or restore stale business contents.

## Local reproduction and evidence

Run from this repository with the available Node runtime:

```sh
node scripts/testing/wechat-010-history-normalization.mjs
```

The runner accepts only a named local Docker container/template, pins the Unix
socket, strips Docker connection environment overrides, verifies postgres owner,
no template sessions and empty History/shop/event inventories, and creates its own
process-named database. No database URL or remote credentials are accepted. It
removes only that database in `finally`.

The supplied `wechat010_sync_final_20260926` template is schema-only and has no
`supabase_migrations.schema_migrations`; this is explicitly not a live registry
attestation. The runner checks baseline trigger identity and unchanged canonical
storage/typing/event functions. Synthetic legacy compression is created with
EXTENDED storage on INSERT, all triggers active, then EXTERNAL is restored.

Observed locally: 63 new pgTAP and 365 existing native recovery contract cases
PASS, compensating DDL restore/reapply followed by the same 63 PASS; real
second-connection NOWAIT rejection with no partial work, followed by
successful exact-manifest apply after lock release and zero added events. The
baseline ordinary preserving UPDATE fails as expected; wrong deployment role is
atomically rejected. Tests include real PGLZ and LZ4, physical/binary/logical budgets,
1,000 compact numeric exponents, nested invalid cells, scope/manifest/ACL violations,
forged transaction/backend markers, content/revision edits, consumed-marker replay,
and rollback after a test-only failure on the second row. These isolated runs did
not change TEST; the later reviewed TEST execution is recorded above.

Repository validation: Node22.23.3 verify PASS (lint, typecheck, security/secret scan
and build), also PASS under Node26. Foundation has 1023 PASS, 8 skip, and 2 ENOENT
failures for external Win7POS source files; it is not a full-suite PASS. The new
SQL and runner introduce no application dependency or native source change.
