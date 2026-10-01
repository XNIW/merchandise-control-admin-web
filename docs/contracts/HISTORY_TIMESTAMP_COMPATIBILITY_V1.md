# History timestamp compatibility v1 — WECHAT-010

Status: PR120 and its guard-only correction PR121 are integrated with head/postmerge
CI PASS. The first TEST attempt was rejected atomically; the corrected migration
was applied once at 23:51:53 UTC on 1 October2026 as service20261001235153.
Registry149 and the independent postcheck are verified below. Authentic recovery
and native convergence are not yet accepted. Performance PR119 and its separate
TEST migration are recorded in the performance runbook.

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

The checkpoint ACL precondition accepts exactly the canonical local set
(`postgres`, `authenticated`) or the observed TEST set (the same plus
`service_role`), each with only EXECUTE granted by postgres. Full ACL items are
compared after sorting; additional grantees, grant options, different grantors or
missing grants fail closed. The active-payload helper keeps its one exact existing
set. No existing grant is added, removed or reordered by the migration; CREATE OR
REPLACE preserves the actual ACL. The guard correction amended the then-unregistered
source migration; it did not modify an applied migration or repair the registry.

## TEST application and source-version receipt

Source20261001215458 was assigned service20261001235153. The source file now uses
that assigned version, with SQL SHA256
`765a891c7c89f4aff0824384754c5aa8a9dfda4766a6fd77fd4a7a0efd7080d1` unchanged.
The 23:52:26 UTC postcheck confirms registry149 with all148 prior entries intact,
exact existing OID/metadata/ACL preservation, and expected source bodies:
active-payload MD5 `4f64d7bc1ef9118b0e8586c4cbefced1`, checkpoint MD5
`3327952df5a4051af35948bd1a0bc307`, private helper MD5
`d7f1ff63f529b4557af495eab698ac84`. The helper has only postgres EXECUTE.
Scoped data/History/image versions, 2074 events, other functions and triggers are
unchanged. This is deployment/integrity evidence, not an authentic recovery result.

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
is pending each repository's own evidence. The first TEST attempt changed nothing;
the subsequent corrected application is recorded above.
Full Admin `verify` on Node 22.23.3 also passes: lint, route type generation,
TypeScript, security scan and production build.

Guard follow-up: 11 ACL scenarios PASS with exact metadata preservation and atomic
rollback, followed by the same 184 + 365 assertions and complete integration checks.
The original guard reproduces the observed TEST ACL failure. The runtime SQL after
the guard remains byte-identical; full Node22 verify also passes for the correction.
