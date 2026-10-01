# History timestamp compatibility v1 — WECHAT-010

Status: local implementation under REVIEW, coordinated with Android/iOS.
Source integration, authentic recovery and native convergence for this delta are
not yet accepted. Performance PR119 and its separate TEST migration are already
recorded in the performance runbook.

## Demonstrated incompatibility

Three existing active History rows pass storage, data and overlay validation but
fail the recovery predicate solely because their timestamps use ISO UTC with
three fractional digits. The ordinary mobile compatibility contract already
records ISO support in [TASK-079B](../TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079B/README.md).
The newer recovery predicate accepted only the legacy seconds format. This is
separate from the prior checkpoint timeout and from physical JSONB compression.
No row is deleted, backfilled, rounded or rewritten to correct this mismatch.

## Exact accepted language

For active History, accept the existing `YYYY-MM-DD HH:mm:ss` predicate, or exactly
`YYYY-MM-DDTHH:mm:ss.SSSZ`: ASCII digits, uppercase T/Z, year0001–9999, a valid
Gregorian date, hours00–23 and minutes/seconds00–59, with exactly three fractional
digits. Reject offsets (including +00:00), missing/extra fractional digits,
whitespace, lowercase delimiters, leap seconds, year zero and date normalization.
The new predicate first bounds the text length. It uses a local timestamp value
only to validate an exact round-trip; it returns a boolean, never a normalized
wire value.

The original string remains the active snapshot DTO `timestamp` and the input to
the History version digest. `.305` stays `.305`; it is not truncated to seconds,
expanded to six digits or converted through client dates. The digest schema,
algorithm, ordering and all other fields stay unchanged. An ISO row that previously
blocked recovery can now participate in a valid checkpoint; its formerly blocked
checkpoint hash is not claimed to equal the new ready response.

The existing tombstone projection is **unchanged**, including its legacy epoch
fallback. Tombstone timestamp text is not part of the version-digest payload.
Existing valid checkpoints containing legacy active rows and ISO tombstones retain
complete JSON/digest equality.

## Smallest server change and unchanged boundaries

`sync_history_timestamp_is_canonical_v1(text)` is a new postgres-only predicate.
Only three History-specific calls change: one in the active-payload guard and two
in the checkpoint (History version input and timestamp-violation count). The
History DTO builder, shared legacy predicate, prices, staff create/update input,
updated/deleted UTC microseconds, resource/storage guards, event readers and scope
resolver remain unchanged. The checkpoint retains VOLATILE from the runtime-lease
migration20260722020000. Existing function OID/owner/ACL/defaults and all other
attributes are checked against the baseline.

The additive migration has a postgres-only, exact-signature/source/metadata guard;
DDL limits are transaction-local5s lock/60s statement. A different baseline fails
atomically. There are no table updates, flag changes, new public grants or endpoint
changes. The new predicate has no anon/authenticated/service-role execute grant;
existing authorized definer boundaries call it internally.

## Shared vectors and local verification

The shared [45 vectors](../../tests/fixtures/history-timestamp-compatibility-v1.json)
provide `historyAccepted` for the coordinated History contract. `legacyAccepted`
records the unchanged **Admin** price/legacy predicate; it is not a claim that
pre-existing native price parsers are identical on every invalid legacy input.
Native implementations must report their own actual execution of the45 History
expectations before cross-language parity is accepted.

```sh
node scripts/testing/wechat-010-history-timestamp-compatibility.mjs
```

This runner uses only a disposable local Docker clone and synthetic data. The SQL
suite repeats the45 vectors under a different timezone/DateStyle and through the
active-payload guard, checks the private ACL and keeps numeric-cell, overlay and
payload limits fail closed. The runner also checks the full native recovery suite,
metadata/other-function parity, and exactly three predicate substitutions.

The integrated fixture covers shop plus verified legacy scope, cross-shop
exclusion, pagination at the server's own History limit, targeted-ID chunks and a
JavaScript SHA-256 chain built from the raw timestamp strings returned by the page.
It first proves old/new complete JSON equality for legacy active plus ISO tombstone
rows, then reproduces the old `resource_exceeded` response on unchanged supported
ISO rows and the compatible `ready` response. All canonical write triggers stay
active; no invalid row is inserted by disabling a guard. Row/event fingerprints
remain unchanged across reader replacement, migration, rollback and reapply.

Results and source/service receipts are recorded in TASK-159 and the worklog.
Local readiness does not imply phone testing, full live recovery or convergence.

Local result (1 October2026):184/184 new pgTAP and365/365 native contract PASS.
Complete legacy+ISO-tombstone equality, baseline resource_exceeded→ready,
paginated/targeted DTOs, raw-string digest, scope exclusion, row/event fingerprints
and rollback/reapply PASS. New helper remains postgres-only. Native45-vector parity
is pending each repository's own evidence. No History SQL has been applied remotely.
Full Admin `verify` on Node 22.23.3 also passes: lint, route type generation,
TypeScript, security scan and production build.
