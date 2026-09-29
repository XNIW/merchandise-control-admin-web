# WECHAT-010 catalog pagination and Cloudflare query compatibility

Status: reviewed selective TEST Worker release and catalog migration applied on
2026-09-29UTC. Actual Mini v9 seven-page/350-row pagination matches an independent
SQL oracle in identifier order and exact microsecond revisions, with no duplicate
or omission within that window. Six load-more observations PASS (min323ms,
median328ms, max2321ms, n=6); p95 remains null and performance acceptance is open.
History normalization is a separate maintenance contract and execution.

Service version20260929013437 reconciles source20260929004159 with identical SQL
SHA256 `7354683ba073d9e0423189dce6084d9218bf8db9b5ce38d15095dc62162c289e`.
Worker bdd42368 preserves exact TEST bindings/runtime/flags/settings except deployment
annotations. See [TASK-159](../TASKS/TASK-159-wechat-010-staging-readiness.md) for the
private receipt references; this does not establish every search/sort scenario,
whole-catalog completion, native convergence or phone acceptance.

## Demonstrated failures

The catalog database reader ordered by `updated_at DESC, id ASC`, while its cursor
predicate compared both columns with `<`. Rows sharing a timestamp could repeat
instead of advancing. The additive migration preserves the ordering and changes
only that predicate to `updated_at < cursor_at OR
(updated_at = cursor_at AND id > cursor_id)`. Existing projections, filters,
authorization, page bounds and name/barcode ordering remain unchanged.

Separately, the installed OpenNext edge converter obtains decoded query values
from `URLSearchParams`. In AWS adapter 4.1.0, `processRequest` reconstructs `req.url`
with `convertToQueryString`, whose documented precondition is already-encoded
values. An encoded `+00:00` timestamp becomes a literal plus and is then parsed as
a space. A search containing `+`, `&` or `=` can also change value or split into
additional parameters. Changing timestamps to `Z`, client double-encoding, or
loosening the timestamp validator would leave the general transport defect.

The catalog route also rejected text cursors longer than 200 units even though
the [canonical text policy](../contracts/catalog-text-policy-v1.md) permits product
names up to 240 UTF-16 units. It now uses `CATALOG_TEXT_LIMITS.productName`; JS
`.length` matches the SQL `catalog_text_utf16_length_v1` contract. Cursor text is
forwarded unchanged, including an empty string. No business-write limit changes.

## Build compatibility boundary

`scripts/cloudflare-query-compat.mjs` is invoked only by the existing Cloudflare
build wrapper. It pins installed AWS adapter 4.1.0, Cloudflare adapter 1.20.2 and
the complete original `core/requestHandler.js` SHA256
`d9d67f62e82d9f51c9afc22cbe74750a5933e06dfb02a748c1d4db0522bf04a7`.
Exactly one known URL assignment is replaced for the build. `URLSearchParams`
encodes each decoded key/value, appending each repeated value separately.

Only `req.url` reconstruction changes. `invokeQuery`, middleware/routing metadata,
authorization headers and the converter remain unchanged. There is no dependency
upgrade, client workaround, custom converter or authentication-policy change.

The wrapper creates an exclusive backup beside the installed handler and restores
the original bytes in `finally`, including child build failure. Existing backups,
version drift, source drift and an already-patched source stop the build. After an
abrupt process termination, inspect the backup and installed file before retrying;
only restore a backup whose SHA256 equals the pinned original above, with no build
using the package. Never remove the guard or automatically accept a new package
version. A dependency update requires a fresh upstream review and the regressions
below; remove this compatibility patch when the upstream reconstruction is fixed.

## Validation and limits

The isolated PostgreSQL template is empty, postgres-owned and local-only.
Eight of 18 new pgTAP assertions fail against the original function. With the
migration all 18 pass, including three full pages of 50 equal-timestamp rows,
mixed microsecond timestamps, repeated names, case-folded barcode ties, deleted
rows and shop isolation. The previous 49-case read-parity suite also passes.
Restoring the original function/ACL and reapplying the migration reproduces the
same 18 PASS; owner and ACL remain unchanged. Fixture transactions roll back.

Node regressions execute declarations extracted from the installed adapter. They
reproduce the original corruption, then verify exact Unicode/`+&%=` values,
encoded keys, repeats, empty values, rewritten queries and unchanged metadata.
Temporary-package fixtures cover successful/failing build restoration, drift and
concurrent/interrupted-build refusal. Actual production catalog route, user-RPC
and session code also run under the pinned workerd engine, with readiness and
framework response construction isolated: unauthenticated offset/Z requests
return 401; unknown parameters retain that result; invalid input remains 400;
no outbound request occurs. This is isolated route validation, not an authenticated
deployed Worker test.

Cursor regressions accept 201/240 ASCII units, 240 CJK units and 120 astral
characters, preserving their exact value. 241 units and 121 astral characters are
rejected before RPC. The original 200-unit route fails the acceptance regression.
No credentials, real shop identifiers or business payloads belong in these tests.

Observed repository validation: seven targeted Node regressions PASS; Node22.23.3
verify and Cloudflare build PASS. The generated `processRequest` contains the
encoded reconstruction and the installed adapter/proxy bytes were restored.
Foundation: 1030 PASS, 8 skip, 2 ENOENT failures for external Win7POS files; this is
not a full-suite PASS. Security scan and diff check PASS. No live SQL or Worker
deployment was performed by this implementation step.

Before a subsequent release, run Node22 verify and Cloudflare build, confirm package source
restoration and inspect the generated URL assignment. Apply the reviewed SQL
through the normal migration workflow separately from any Worker release. Then
repeat authentic catalog pagination/search on the exact authorized TEST target;
local tests do not establish that acceptance.
