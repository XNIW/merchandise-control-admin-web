# TASK-159 — WECHAT-010 controlled Mini staging readiness

## TASK-159 REVIEW — TEST155 identity case fix applied, 2026-10-02 18:08 UTC

Both independent reviews approved the exact identity patch. Stacked PR130 head
ed099f1c passed Database migrations/pgTAP, Verify and Cloudflare build checks
(CI37044429416 and CF37044429434); deployment jobs were skipped. The coordinator
applied the reviewed SQL once to TEST at18:07:54–18:07:57UTC. Supabase assigned
service version20261002180757, advancing the registry from154 to155.

The18:08:53 private admin-identity-case-postcheck.json records PASS: only the two
expected function bodies changed, with CREATE MD5
3c60b9f2115fe672c4ce77c7f5f1033d and UPDATE MD5
b0f15a596d384da887174b3ed054357f. All existing registry entries, target OIDs/full
metadata/ACL, other functions/triggers and scoped data, History and image
versions remain unchanged. No existing product codes were backfilled.

The source filename is aligned from20261002171237 to20261002180757, with SQL
SHA2569d52258cb07899c59bc35eddf596fef8f37d936a03bc2dedb60c086cc9ef3545
unchanged (11547bytes; joined-SQL MD59e4741b64d7b0999b3000f06990e922f).
The local runner changes only its migration-path literal. This metadata receipt
adds no SQL behavior and does not repeat the177passing local SQL checks or the
passing Node22 verification. Final delta review and exact-head CI remain pending.
PR130 remains open on PR128; source integration and authentic post-fix behavior
are not yet accepted. No new Worker deployment or native recovery success is
claimed. Registry154's recovery failures remain preserved and unresolved.

## Historical pre-apply validation — Admin product identity case, 2026-10-02 UTC

An authentic Admin name-only save preserved stock1.25 but uppercased the
unchanged barcode and item number. Canonical catalog_text_policy_v1 requires
case-sensitive identity text without case folding. A separate branch from the
unchanged PR128 head contains the bounded fix: remove only four upper() wrappers
from the two personal product functions. Existing btrim/nullif, strict text-policy
triggers, revision/sync wrappers, OIDs and complete permissions remain unchanged;
there is no backfill or alteration of already stored codes.

The exact-body source check passes. The migration guard explicitly resolves
both public functions; the regression reproduces the old guard accepting
conforming shadow functions while the public target drifted, then proves atomic
refusal by the qualified guard. An isolated local clone reproduced eight failed
baseline assertions. The corrected actual RPC tests passed27/27; canonical text
policy20/20, revision44/44 and Mini mutation86/86 also passed (177checks total).
These cover mixed-case create with an uppercase peer, name-only identity and
quantity preservation, explicit identity edit, trim collision, stale revision,
invalid controls and cross-shop refusal. Both exact ACL sets, unknown grants,
grant options, metadata/signature drift and wrong deploy role were checked.
Rollback/reapply preserved OIDs, full metadata/ACL, other functions/triggers and
data. The clone and runner were absent at17:46:43UTC. Pinned Node22 repository
verification subsequently passed lint, route types, typecheck, secret/security
scan and production build. Final immutable review is pending. No remote
application, authentic post-fix success, commit or integration is claimed.

Registry154's recovery timeout remains unresolved. A separate read-only literal
ABBA integrity diagnostic returned identical20counters but no performance benefit
from the four-counter fusion. The subsequent six-call prepared generic-plan
experiment also returned identical20zero counters, with3generic/0custom plans
per variant. Repeated baseline494.717/495.735ms versus candidate488.298/488.765ms
shows only a small standalone difference; first calls were511.309/489.112ms.
These same-snapshot, forced-generic SELECT measurements exclude authentication,
fences and other checkpoint phases, and establish no full-RPC8s acceptance.
The candidate stays archived privately and excluded from this identity source
change; no checkpoint or runtime deadline change is included here.

## TASK-159 REVIEW — TEST154 applied; authenticated recovery pending, 2026-10-02 15:09 UTC

PR128 candidate head `2e7237f4` passed exact-head database/pgTAP, Verify and
Cloudflare build checks after the independent immutable-artifact reviews.
The coordinator applied the reviewed SQL once to TEST at15:09:09 UTC, advancing
registry153 to154 with service version `20261002150909`. The15:09:43 private
`bounded-product-bytes-postcheck.json` records POSTCHECK_PASS: all153 previous
registry entries are unchanged; only the two expected routine bodies changed.
The existing private helper, existing OIDs/full metadata/ACL, all other functions,
triggers, scoped data/events, image versions and physical History remain unchanged.

The source filename `20261002054522` is aligned to `20261002150909` in this same
open PR, with SQL SHA256
`9a09b8106aa8dbb3f86365ef964cc0e6a204fc8e38440b660716ebb179f04e27`
unchanged. The local runner changes only its migration path. This receipt delta
adds no SQL behavior, data mutation or deployment; no local PG/build/global
verification is repeated for the filename and documentation changes. Final-head
CI and metadata review precede any merge; the PR is not yet integrated.

Registry153's authentic iOS first-checkpoint HTTP200 followed by HTTP500/57014,
and the local8s failures, remain preserved evidence. The120s functional oracle
and copied read-only diagnostic establish their stated equivalence only.
Authenticated recovery on154 is pending; no terminal recovery,8s runtime PASS or
DONE is claimed. Earlier06/07UTC preparation and validation entries below are
historical and do not describe the15:09 applied state.

## Historical pre-apply review — bounded scan and product byte candidate, 2026-10-02 06:49 UTC

PR127 is integrated at `e0089365`, with exact-head and postmerge CI/Cloudflare
checks passing. TEST registry153 is applied and metadata/data postchecks pass.
The subsequent authentic iOS attempt completed one checkpoint HTTP200 but its
next checkpoint timed out HTTP500/57014 before activation. Prepared recovery
state is preserved; no terminal recovery or DONE acceptance is claimed.

The coordinator's read-only two-round diagnostics return identical preflight
JSON but expose substantial first-execution cost in product/price counts and
metadata-bound scans. JIT counters are zero; serial planning alone does not
remove that cost. These diagnostics do not impersonate authentication and do
not reproduce the complete authenticated RPC deadline.

The sole Admin writer now prepares a bounded candidate: combine each product/
price capped count with metadata-only upper bounds, with the original count
branch on contract drift; calculate exact product scalar JSON bytes separately
inside preflight and the product aggregate. Preserve all six capped counts,
first-violation/prefix-byte ordering, compression and TOAST guards, original
fallback loops, DTO/hash/order, scope, ACL, fences and the8s runtime deadline.
No values or byte totals are shared across checkpoint statements. Existing
private dependency/type guards remain the trust boundary; no new framework,
index, grant, data rewrite or remote application is authorized to this writer.

Local12+184+365 SQL checks, migration guards and the complete functional
continuation passed: full JSON/per-row bytes, vectors, all-unique values, cap/
precedence, dependency drift, metadata/ACL and rollback. The original153 and
candidate8s failures in the unchanged event phase remain preserved. The later
120s local oracle establishes equivalence only, not budget acceptance.

A coordinator-run read-only copied-body diagnostic on TEST returned identical
preflight/product/full-round values at5716.469 and3711.593ms. It excludes auth,
fences and final RPC assembly and uses different planning context; it is not an
authenticated8s PASS or a controlled AB comparison with earlier diagnostics.
Node22 source verification (lint, types, security and build) passed. Two
immutable-artifact reviews remain pending. TEST153
and its authentic failure remain current; this candidate has not been applied.

## TASK-159 REVIEW — TEST153 applied; authentic recovery pending, 2026-10-02 UTC

PR127 source head `a8a693ab` passed database/pgTAP, Verify and Cloudflare checks
on the exact reviewed SQL. After both independent reviews, the coordinator applied
those bytes once to TEST at04:40 UTC. Supabase assigned service version
`20261002044017`, advancing the registry from152 to153. The04:40:41 postcheck confirms
all152 prior entries unchanged, the two existing routines changed only in their
expected bodies, and the new private SECURITY INVOKER helper. Existing OIDs/ACL and
all other functions, triggers, scoped data/events, image versions and physical
History state remain unchanged.

The original filename `20261002040159` is aligned to `20261002044017` with SQL SHA256
`e6e3a2631c82e506461c400e16a910f87c8e007ff8ad29a643ce10b3f19af826` unchanged; the runner
changes only its migration path. This receipt stays in PR127 for final metadata
review and exact-head CI before merge; no auto-merge is enabled. The writer performed
no remote application or deployment. Registry152's authentic FAIL remains preserved;
registry153 authentic recovery is NOT_RUN and awaits final main CI and the separate
coordinator/native gate. No terminal recovery, percentile or DONE acceptance.

## TASK-159 pre-application REVIEW — bounded preflight and exact price bytes, 2026-10-02 UTC

PR126 merged at `74f1d3cc` with exact-head and postmerge CI/Cloudflare PASS. The
coordinator released only the reviewed Admin poller change to TEST; no new live
poller acceptance is claimed here. Registry152 still has the preserved authentic
native checkpoint timeout. Complete single-execution read-only profiling, without
impersonating authentication or changing the8s runtime deadline, identifies repeated
preflight DTO serialization and price scalar work as the remaining measured costs.

The sole Admin writer is preparing one additive migration: preserve preflight
first-violation/prefix-byte semantics with original-loop fallback; use metadata-only
bounds before exact set-based byte calculation; retain one capped count over disjoint
shop/legacy branches; calculate exact flat price JSON bytes and memoized typed scalars
only within each SELECT. Existing DTOs, scope/parent filters, digest strings/order,
TOAST guards, authorization, fences, data and ACL remain unchanged. A new private
SECURITY INVOKER contract predicate pins dependency metadata/types plus PostgreSQL17
and UTF8; drift falls back to the original paths. No cross-statement byte reuse.

Preliminary local full JSON/vector/fallback equivalence passes. The coordinator's
single v6 nine-phase READ ONLY diagnostic is6736.758ms with exact original preflight
and price JSON equality. This excludes authentication/fence/final assembly and is
not authenticated RPC, terminal recovery, p95 or DONE acceptance. Earlier slower
and failed candidates remain private evidence. Final guarded-source regressions,
full checks and two immutable-artifact reviews precede source integration; only the
coordinator may apply remotely. No remote action is delegated to this writer.


Final source validation PASS:12 guard scenarios plus wrong-role rejection;
12 new+184 History+365 native pgTAP assertions; exact complete JSON on61,595
synthetic rows/2,074 events (baseline2717/2723ms, candidate1994/1963ms); two sets
of six same-backend forced-generic calls under8s;41,345 all-unique price values;
90 scope/NULL/outer-cap cases;15 original-loop fallback cases; scalar/vector
comparisons across four extra_float_digits settings. Existing metadata/OID/ACL,
unrelated routines and row/event fingerprints remain exact. Shape drift in both
DTO builders preserves preflight JSON; price-builder drift also directly compares
original/candidate price aggregates. Product-builder drift's price branch is
established by the false global guard and whole-original-SELECT fallback. Node22
full verify (lint/typecheck/security/build) and diff checks PASS. The two initial
fixture-only syntax failures remain preserved; neither changed runtime SQL.
No remote application, authenticated native success, percentile or DONE claim.

## TASK-159 REVIEW — deferred Admin marker refresh, 2026-10-02 UTC

PR125 is integrated at7bd490ba with exact-head and postmerge CI/Cloudflare PASS.
The coordinator applied the exact SQL once at02:53:17 UTC as service20261002025317,
registry152. The independent02:53:40 postcheck preserves OIDs/full ACL, all unrelated
metadata/functions/triggers and scoped data/events, with only the three expected
bodies and two helper languages changed. The source filename and runner reference
are aligned byte-for-byte. The single authentic iOS Retry02:55:18–02:55:27 still
failed HTTP500/57014, now in the price SELECT (line418). No manifest, finalization
or verified recovery appeared; Android152 remains NOT_RUN. No identical retry or
new speculative SQL optimization is authorized by this receipt. The sole writer addresses
a separate deterministic Admin-shell defect, reproduced against its exact source:
a marker observed while a form is focused or the refresh throttle is active is
consumed even though no refresh occurs; later identical markers never retry.
This does not establish the cause of the earlier interrupted live Admin tab.

Bounded scope: acknowledge the marker only after router.refresh() is invoked,
retain it across deferral/cancel, recheck focus/visibility/current scope at the
200ms timer, and cover focus/throttle/same-marker/race/unmount behavior with local
regressions. Preserve authorization, shop-scoped marker API, polling/backoff and
form protection. No DDL, Worker deployment or live business mutation by the writer.
The eleven isolated callback regressions now pass (nine fail against saved original
source), including offline within the timer, reconnect, backoff and native focus. After host release, Node22 full verify (lint, typecheck, security, build) and the
existing Admin marker contract pass. A broader local source-test batch has31PASS
and one unrelated missing Win7POS file; it is not a full-suite PASS. No live poller
acceptance is claimed. Frozen review, exact-head CI and selective staging review
precede release.

## TASK-159 REVIEW — complete checkpoint pipeline, 2026-10-02 UTC

PR124 merged at 2e236586 with head/postmerge CI and Cloudflare PASS. The coordinator
applied the exact integrity SQL once as service version20261002013745 (registry151).
Its independent postcheck preserves prior registry entries, function metadata/ACL,
scoped data and events. The subsequent authentic iOS Retry at01:39:43–01:39:52 UTC
still fails HTTP500/SQLSTATE57014 in final integrity. No terminal native recovery,
convergence or performance acceptance follows from the earlier phase improvement.

The sole Admin writer now addresses measured cumulative checkpoint work. The
bounded candidate materializes each product bytecount once within its SELECT and
adds equivalent non-NULL shop fast paths to the two existing scope predicates.
Legacy predicate expressions remain exact. No preflight byte reuse across snapshots,
scalar/DTO changes, new privileges, fence change or runtime8s extension is allowed.
Final source checks compare exact complete JSON at3956–3979ms versus2706–2789ms
with TEST work_mem/parallel/JIT settings. The10001-event case is6224ms versus3349ms;
both versions also pass six same-backend forced-generic calls under8s each. All
32 targeted +184 History +365 native assertions, 15 guard cases plus wrong-role
denial, metadata/data parity and rollback/reapply pass. The coordinator's readonly
product-only comparison is identical at1620.620–1653.153ms versus1170.984–1202.087ms.
These bounded samples are not authenticated RPC or p95 acceptance. Independent
frozen-artifact reviews precede integration; only the coordinator may apply
remotely. The prior integrity filename is aligned with identical SQL bytes. Node22
full verify (lint, type generation/typecheck, security scan and build) and diffcheck
PASS; local logs and source fingerprints accompany the frozen review artifact.

## TASK-159 REVIEW — final integrity checkpoint timeout, 2026-10-02 UTC

PR123 is merged at e4377f83 with exact-head and postmerge CI/Cloudflare PASS.
The coordinator applied its SQL once at 00:54:14 UTC as service version
20261002005414; registry150. Independent postcheck at 00:54:42 UTC reports no
metadata/data differences beyond the two expected body changes and the intended
scalar language. Existing OIDs/ACL, other functions, scoped rows and events remain
unchanged. The sole Admin writer is reconciling the source filename and runner
reference with identical SQL bytes. The subsequent authentic failure and the separate measured correction are
consolidated below; no remote replay by the writer or live recovery acceptance.

The next authentic iOS Retry (00:55:08–00:55:17 UTC) still fails HTTP500/57014,
now in the final integrity SELECT after completing price/history/image digests.
The demonstrated improvement is not terminal recovery acceptance. Profile the
entire integrity phase locally, including repeated scalar validation, projections
and parent relationships; implement only measured equivalent work reduction.
Keep the applied SQL intact, add a separate migration for any correction, and
consolidate its review with the byte-identical service-version rename. No timeout,
authorization, integrity, data or scope relaxation; no remote action by the writer.

The candidate changes only the checkpoint's final integrity SELECT. All predicates
and all other checkpoint statements stay unchanged; there are no new helpers,
grants, index changes or data rewrites. Per-SELECT distinct-value validation retains
row multiplicity and exact NULL/NaN/signed-zero behavior. Local checks already
confirm full metadata/OID/ACL parity, unchanged helper definitions, exact complete
JSON and red-to-green validation-call counts. The coordinator's two read-only TEST
comparisons produce identical 20 counters and reduce that SELECT from 3536.944/
3183.693ms to 1785.830/1827.670ms. These are not authenticated RPC or terminal
recovery acceptance. The native deadline remains 8s, and the observed failure
receipts remain preserved. [Runbook](../RUNBOOKS/wechat-recovery-checkpoint-performance.md).

Final local validation PASS: nine guard cases plus wrong deploy role, nine focused
assertions, 184 History and 365 native contract assertions; full JSON/data/metadata
rollback parity; invalid and all-unique values; six pooled generic-plan calls for
each version. Complete synthetic checkpoint 4153–4225ms → 3943–3972ms, current
baseline 2383 → 2130ms, 10,001-event boundary 6613 → 6190ms with the existing
10,000 inspection cap. All calls retain the 8s deadline. Node22 verify and final
diff/security checks PASS. Independent artifact reviews precede integration;
authentic recovery remains unaccepted.

## REVIEW — price-digest checkpoint timeout after History v2, 2026-10-02 UTC

The authentic iOS RI06 single Retry at 00:11:49 UTC terminated with HTTP500 at
00:11:58 UTC. Correlated Postgres SQLSTATE57014 at 00:11:58.614 identifies
`sync_legacy_timestamp_is_canonical_v1(text)` inside the checkpoint's prices
version-digest SELECT. The exact RPC origin latency was 8227ms, upstream8099ms.
Registry149, prior performance SQL and History v2 were already applied; the fresh
resource preflight had zero violations. Preserve this FAIL evidence separately
from the earlier preflight timeout and the corrected History compatibility issue.

The sole Admin writer will inspect plans and measure representative local synthetic
data with about 41,345 prices, including the complete checkpoint and exact output
parity. Optimize only demonstrated repeated work; retain all validators, scope and
parent relationships, canonical strings/digests, ACL/metadata and the 8-second
runtime deadline. Add meaningful regression/benchmark evidence, then freeze for
root/recovery review. No remote apply, deployment, live-data mutation or further
native Retry is authorized to this writer. Private failure receipt:
`ios-ri06-history-v2-failure-logs.json`.

A second authentic Android failure at00:24:27.912UTC reaches the same price
aggregate (chain-step context), origin8181ms. Preserve both failures. Candidate
SQL changes only the price CTE/digest evaluation strategy and a scalar helper's
language with identical expression; no validator grammar or 8s budget change.
The materialized narrow row projection serializes the DTO once; per-SELECT
bytewise timestamp de-duplication retains the exact validator and NULL/invalid
fallback. All scope/parent predicates and ordered raw digest inputs remain exact.

Local proof:9 baseline/ACL/source/signature cases,14 new+184 History+365 native
assertions PASS. Actual function counters are RED→GREEN: DTO82690→41345 and
legacy timestamp82690→1324 on41345 prices. Full JSON is identical on61595 rows in
mixed shop/legacy scope,2074/10001 events and the current baseline. Separate price
aggregate comparisons cover invalid/NULL/empty/all-unique timestamp cases. Complete2074 checkpoint4405–4467ms→3831–3956ms;
10001 events5896→5430ms with the10000 cap unchanged. Baseline Mac did not hit8s;
no live resolution or percentile is claimed. Metadata/ACL/OID, unrelated functions,
row/event fingerprints and rollback/reapply are exact. See the performance runbook.
Full Admin Node22.23.3 verify PASS (lint/type generation/typecheck/security/build),
plus diff checks. Independent immutable-patch reviews precede integration and
coordinator release.

## REVIEW — applied History receipt and version reconciliation, 2026-10-01

PR121 head0875e944 merged d1287cab at 23:44:48 UTC after required CI PASS.
Head CI36942045201/CF36942044782 and postmerge CI36942419923/CF36942419889
SUCCESS; deploy jobs SKIPPED. The coordinator applied the corrected SQL once at
23:51:53 UTC. Source20261001215458 maps to service20261001235153, with identical
SQL SHA256 `765a891c7c89f4aff0824384754c5aa8a9dfda4766a6fd77fd4a7a0efd7080d1`.

Postcheck23:52:26 UTC PASS: registry149 preserves all148 prior entries; the two
existing functions retain exact OID/full metadata/ACL and have only their expected
History predicate substitutions. The new helper is postgres-only. Other functions,
triggers, scoped business data, three original History rows, image versions and
2074 events remain unchanged. Private receipts: `history-timestamp-v2-apply-intent.json`,
`history-timestamp-v2-apply-result.json`, `history-timestamp-v2-after.json` and
`history-timestamp-v2-postcheck.json`. The earlier rejected attempt remains recorded.

This delta only renames the migration file to its assigned service version, changes
the local runner's path literal, and aligns receipts. No SQL byte or runtime logic
changes, registry repair or remote action by the writer. Validation uses byte/hash
parity, path resolution, runner syntax, security scan and diff checks; the unchanged
11 ACL +184 History +365 native assertions and full verify are not repeated for this
filename/documentation-only delta. Authentic recovery, latency and native convergence
remain unverified. The following sections preserve their historical review state.

## Historical REVIEW — exact History ACL baseline, 2026-10-01

PR120 merged b162f23d after all head/postmerge checks passed. The first TEST
application failed with `history_timestamp_compatibility_baseline_mismatch`:
the checkpoint also has an existing service_role EXECUTE grant absent from the
local template. The independent post-rejection snapshot confirms registry148,
new helper absent, and unchanged function/data/event fingerprints. No History
version was registered or partially applied.

Scope: amend only this unapplied migration's ACL precondition to accept the two
exact verified checkpoint ACL sets, with order-independent comparison. Preserve
grantors and grant-option distinctions; never grant or revoke existing function
permissions. Add local proofs for both baselines, reordered ACLs, unexpected
grantee and grant-option rejection, atomicity and exact metadata/ACL preservation.
No runtime body, format, fixture contract or business-data change. Freeze for two
reviews before integration; the Admin writer has no remote apply authority.

Local result: the original guard reproduces the observed TEST rejection. The
corrected guard passes 11 ACL scenarios: both verified sets, reordered entries,
unexpected anon/PUBLIC grants, grant options, and missing required grants. Each
accepted case preserves exact OID/owner/ACL/metadata; rejected cases and fixture
changes roll back atomically. The 184 History and 365 native assertions, complete
checkpoint/page/targeted-row/digest tests, and full Admin Node 22.23.3 verify PASS.
Runtime SQL after the guard is byte-identical; no existing function permission
changes are introduced. Private logs: `history-timestamp-acl-red.log`,
`history-timestamp-acl-green.log`, `history-timestamp-acl-verify.log`.

The same source migration is amended because its TEST attempt rolled back and no
registry version was recorded. Applied migrations remain untouched; no registry
repair, version rewrite or remote action is performed by this delta.

## Historical REVIEW — bounded History timestamp compatibility, 2026-10-01

Fresh scoped read-only evidence identifies three active History rows with valid
storage/data/overlay and uncompressed JSONB, rejected solely for their existing
ISO timestamp spelling. The historical TASK-079B contract explicitly allows ISO
variants in Android/iOS. The designated cross-repository contract now permits the
existing legacy format OR exactly `YYYY-MM-DDTHH:mm:ss.SSSZ`, three fractional digits,
uppercase T/Z, valid Gregorian date, year0001–9999 and ordinary hour/minute/second
ranges. No offsets, trim, rounding, normalization or general parser relaxation.

Implement a separate History validator and redirect only History validation/digest
sites. Keep the shared legacy/price validator and price writers unchanged. Preserve
the original strings in snapshot DTOs and digest inputs; no backfill or data writes.
The public/native checkpoint guard, owner/ACL, scope, storage/resource limits and
all other DTO fields stay exact. Use common positive/negative fixture vectors and
local complete checkpoint/page/rows-by-ID evidence, rollback and the365 contract
suite. Performance PR119 is separately merged at4532831b with all required CI PASS.
Performance SQL applied once by the coordinator as service20261001220355,
registry148;22:04:29UTC postcheck confirms unchanged prior147 entries, OID/ACL,
other functions/triggers, scoped data hashes and2074 events. Source→service rename
is byte-identical (SHA54a49cbf529e1019468c9e2708c36f83eea783edca31b0df3c22af43e8fc80d7).
No authentic Retry or History SQL apply yet. Freeze the next patch for independent
root/recovery review.

Local History validation PASS:184 new pgTAP assertions from45 shared vectors,
365 unchanged native assertions, identical metadata and other functions, exactly
three History predicate substitutions in two existing bodies. The original full
checkpoint fails resource_exceeded on the same synthetic ISO rows; the candidate
is ready. Full legacy+ISO-tombstone JSON remains identical. Paginated snapshots,
bounded rows-by-ID and independently calculated raw-string History digest pass in
mixed shop/legacy scope, with cross-shop exclusion. Row/event fingerprints remain
identical through reader replacement, migration and compensating rollback/reapply.
Existing tombstone DTO fallback remains byte-identical. Source/service performance
rename has100% SQL byte parity. See the [History contract](../contracts/HISTORY_TIMESTAMP_COMPATIBILITY_V1.md).
Private evidence: history-timestamp-compatibility-test-final.log; checkpoint SHA256
3fbae5971a8ea7d97f0b95d11c5f6bb5596448bd059fc7d8933995634be47ee9.
No cross-language45-vector PASS is asserted before each native repository reports
its own run. No History remote apply or authentic recovery has occurred in this delta.
Full Admin `verify` on Node 22.23.3 PASS (lint, route type generation, TypeScript,
security scan and production build); private log `history-timestamp-verify.log`.

## REVIEW — recovery checkpoint performance, 2026-10-01

The authentic post-normalization iOS checkpoint failed with HTTP500/SQLSTATE57014
inside the canonical recovery preflight. One delegated Admin writer is assigned
the demonstrated backend defect. Scope is an additive, independently reviewed SQL
optimization with local synthetic reproduction of the complete checkpoint, exact
DTO/hash/order parity, unchanged 8-second request deadline, scope/authorization,
resource limits and fail-closed storage guards. No live migration or deployment
is authorized in this execution step.

Completed local reproduction on a dedicated empty clone with61,595 synthetic rows.
The original complete checkpoint times out at8s; the candidate completes2,074
events in4.584–4.695s and10,001 candidates in5.959s, preserving the10,000 inspection
limit and full-recovery decision. Full original/candidate JSON and digests match;
365 native contract assertions, scalar vectors, metadata/ACL parity, real query
plans, unchanged data/event fingerprints and rollback/reapply all pass.

The additive migration contains only two exact-expression indexes and six pure
helper language changes; no RPC, resolver, event guard, storage/shape validator,
writer, timeout or business row changes. DDL-only limits are5s lock/60s statement.
The [runbook](../RUNBOOKS/wechat-recovery-checkpoint-performance.md) records the
reproducible command, measurements, tradeoffs and reviewed release prerequisites.
The exact performance artifact received both independent approvals; PR119 and its
separate TEST application are now complete as recorded above. Local performance
results still do not attest live recovery latency. Android's newer HTTP200/resource_exceeded maps to three valid-storage
History rows with ISO timestamps rejected by the existing legacy validator; keep
that distinct compatibility fix outside this performance patch.

Validation: full Admin `verify` on Node22.23.3 PASS (lint, route type generation,
TypeScript, security scan, production build); `git diff --check` PASS.

## REVIEW — applied TEST receipt and source reconciliation, 2026-09-29 UTC

PR115 merged46466364 and PR116 merged53e58013 after required CI PASS. The selective
Worker bdd42368 was verified at01:31:13UTC with exact existing bindings, runtime,
settings except deployment annotations, singleton TEST scope and tracing OFF.
Mini auth/catalog mutations remain ON; enrollment and the other auth surfaces stay
OFF. The release contained only the three reviewed catalog build/route files.

Supabase assigned versions20260929013345 (History normalization, source
20260928193505) and20260929013437 (catalog keyset, source20260929004159). This receipt
renames the files and updates the local runner path; SQL bytes are unchanged:
normalization SHA256 `5317369f8a5145f87732ead2879a795ab25c63c6853989f5f5a5f36b16f3a1b9`,
keyset SHA256 `7354683ba073d9e0423189dce6084d9218bf8db9b5ce38d15095dc62162c289e`.
Registry147 preserves all145 previous version/name/statement hashes. The only
changed existing function bodies are the reviewed History trigger and catalog
reader; their owner/ACL and all four trigger registrations/storage settings remain
unchanged. No migration repair, registry rewrite or trigger disable occurred.

Root and recovery reviewers approved exact plan SHA256
`ace817b560b3b6bf7dc6c4dc3be1be5fef791880bd84bc14bf51ac88fa1398b5`.
One apply at01:38UTC; independent SQL postcheck01:39:14UTC confirms16 rows with
identical full-row hashes/revisions, compression NULL, zero markers and unchanged
2074 shop events. Private receipts: `history-normalization-live-plan.json`,
`history-normalization-live-postcheck.json`, and before-v4/after-DDL snapshots.

Actual Mini v9 catalog: seven pages/350 identifiers in exact canonical order and
microsecond revisions match the independent SQL oracle. Six load-more cases PASS;
323ms minimum,328ms median,2321ms maximum, n=6 and p95=null. Evidence is scoped to
that350-row window, not all catalog/search cases or a performance acceptance.
Private `catalog-measure-1790645825389/oracle-reconciliation.json` records the
initial oracle-runner failures and corrected comparison; earlier runtime FAILs
remain preserved. Native recovery/convergence and phone/full acceptance remain
open. A subsequent authentic iOS Retry01:41:42–01:41:51UTC returned checkpoint
HTTP500/SQLSTATE57014 in the price recovery preflight,8645ms origin latency. This
new performance blocker is separate from the verified physical normalization;
no retry was repeated. This receipt changes no application behavior; earlier
sections are historical.

## REVIEW — bounded physical History normalization, 2026-09-28

The actual TEST native recovery preflight reports
`compressed_legacy_history_requires_remediation`. Sixteen active, shop-scoped
History rows retain physical PGLZ compression. Existing ordinary UPDATE also
rejects compressed OLD values, so there is no supported normalization route.
The user-authorized demonstrated Admin fix is assigned to one delegated writer;
root does not concurrently edit this repository.

Scope: additive private SECURITY INVOKER postgres-only plan/apply contract,
transaction-bound private authorization markers, bounded PGLZ expansion before any
JSONB operation, typed canonical validation before serialization, and a narrow
trigger branch permitting only complete OLD/NEW equality. Preserve all metadata,
timestamps and events; force only uncompressed EXTERNAL storage. No client ACL,
request guard weakening, GUC bypass, trigger disable, native or commerce change.

Acceptance: isolated clone only; positive PGLZ and negative method/budget/type,
manifest/scope/caller/marker tests, a real second-writer lock, atomic rollback,
unchanged business hashes/revisions and zero events. Add a maintenance runbook with
official pinned PostgreSQL sources. Freeze the patch for independent root/recovery
review. No live SQL, commit, push or deployment in this execution step; no DONE or
authentic recovery PASS is inferred from local tests.

Execution completed locally: 63 new pgTAP and 365 existing native recovery cases
PASS; protected original trigger restore/reapply followed by the same 63 PASS;
real second-writer NOWAIT, rollback after the first row, unchanged full-row hashes
and zero events PASS. Node22.23.3 verify PASS (lint, typecheck, secret/security scan,
build); Node26 verify also PASS. Foundation: 1023 PASS, 8 skip, 2 ENOENT failures
for external Win7POS source files. No foundation-wide PASS is claimed. The
[maintenance runbook](../RUNBOOKS/wechat-history-physical-normalization.md) records
the proof and local runner. Independent review is pending; live application and
authentic native recovery remain NOT_RUN for this delta.

## REVIEW — Mini session sync correction applied to TEST, 2026-09-26

The authentic Mini checkpoint failed with HTTP503 because its session-bound device
has no native POS device lease. Additive migration `20260926164349` gives the two
Mini sync wrappers private readers authorized by the real personal profile,
membership and Mini session. Native recovery/event functions remain byte-identical
on TEST; no device, session, mapping or business row was fabricated.

Independent review APPROVED migration SHA256
`1800620a45edbc5e84c4ac8286d124cbbd664161b37effb26a68c7d514a14ad9`.
Isolated pgTAP: 84 direct pairing, 52 BFF, 22 reads, 365 native contract PASS.
Node22 verify PASS; foundation1031 PASS/2skip. Saved wrapper restore reproduces the
old lease rejection; reapplying only the reviewed wrapper bodies restores84PASS.
The two new private helpers stay inaccessible to PUBLIC/anon/authenticated/service_role.

Applied once at16:43UTC. Registry145 preserves all previous144 version/name/hash
entries; zero commerce. Four Mini function fingerprints/owners/ACL match the tested
database; native fingerprints/ACL unchanged. Security/performance advisors unchanged
after excluding observation timestamps. Source filename reconciled to the service
timestamp; SQL bytes unchanged. Worker beb94e1e and selective runtime a805d640 unchanged.

Recovery: use the protected pre-apply wrapper definitions in one compensating
migration, leave the inaccessible helpers unreferenced, and verify native fingerprints,
ACL and registry again. Never delete migration history or manufacture device leases.
Backup and rollback/reapply evidence are in the private audit packet.

Actual checkpoint/delta retry after this migration is still NOT_RUN. Mini session
expired before the image picker; image intent reconciled NO_WRITE. Android and iPhone
personal Google login and exact TEST scope verified. iPhone real Retry failed decoding
the native checkpoint envelope (`catalog` missing); native convergence remains unproven.
No native source edits. Full A–G acceptance remains open; no DONE.

## FIX — autenticazione Mini e scope sync, 2026-09-26

Il collaudo autentico ha completato 16 casi di lettura e 9 casi catalogo
con readback indipendente. Cinque fixture della run restano tracciate nel packet.
Mini auth e catalog mutations ON sul solo target TEST autorizzato; enrollment OFF.
Checkpoint HTTP503 riprodotto: il nuovo device Mini non ha una registrazione
shop_devices, che il resolver di recovery nativo richiede. FIX circoscritto ai
reader Mini checkpoint/delta; nessuna registrazione artificiale o modifica POS.
La sessione personale è scaduta prima del picker immagini, upload non iniziato.
Stato FIX, prove live successive e accettazione A–G ancora aperte; nessun DONE.
Le ricevute precedenti sotto sono storiche.


## Pairing TEST verificato, readonly server attivo — 2026-09-26

Il nuovo pairing personale è completato. Readback canonico15:01UTC: un mapping
attivo, un audit linked e due prove Tencent verificate/consumate, pair_claim e
pair_confirm successiva all'approvazione Admin; completamento entro scadenza.
UI Mini Linked osservata, nessun mapping artificiale o sessione iniettata.

Enrollment chiuso; solo WECHAT_AUTH_MINI_PROGRAM_ENABLED ON sul Worker
15ad37e9-6176-4410-baab-28a67615211f al100%. Codice selettivo a805d640, runtime,
altri binding, allowlist singleton e tracing OFF preservati; altri6flag OFF.
Status pubblico ready confermato dopo propagazione, senza ripetere PATCH.
Registry144 invariato per versione/nome/hash, zero commerce. Profilo canonico,
shop_owner e shop designati attivi. Nessun DDL, sorgente o deploy main intera.
Review helper indipendente APPROVED; rotazione NOT_PERFORMED/ACCEPTED_FOR_TEST_ONLY.

Mini readonly verify149/149 PASS, ma runtime ancora sulla precedente build:
Mac bloccato prima della ricompilazione, sblocco personale richiesto.
BLOCKED_EXTERNAL owner utente: sblocco, poi caricamento readonly e login Home
personale distinto. Login/business/telefono NOT_RUN, nessuna fixture o DONE.
Fonte canonica: [report Mini](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
Le sezioni successive sono storiche e non descrivono lo stato corrente.

## Enrollment TEST attivo — 2026-09-25T20:01:41.857Z

Input AppSecret completato personalmente; binding verificato sul Worker cb474c33.
PATCH revisionata del solo enrollment: Worker f1e2e3ce-557b-42f4-9159-e796dc635c32,
traffico100%, release selettiva c55f88a3 e runtime/altri binding invariati.
WECHAT_MINI_ENROLLMENT_ENABLED=true; altri6flag OFF, tracing disabilitato,
allowlist singleton e target preservati. Nessun DDL, sorgente o deploy main intera.
Mini verify149PASS, UI pairing DevTools pronta senza sessione/shop o nuove eccezioni;
readback limitato profilo/AppID0mapping. Accesso Admin completato personalmente; avvio pairing osservato nel browser e nel DB.
Due tentativi personali Mini falliti al challenge HTTP400 backend_temporary prima di Tencent.
Causa riprodotta in workerd1.20260811.1: redirect:error genera TypeError prima della rete.
FIX nei due trasporti Mini RPC/catalogo: redirect manual, response.ok invariato,
nessun redirect seguito. Regressione sul motore Cloudflare isolato; nessuna credenziale,
autenticazione simulata live o diagnostica pubblica. Pairing finale e business NOT_RUN.
Non chiedere di nuovo AppSecret. Rotazione NOT_PERFORMED, rischio ACCEPTED_FOR_TEST_ONLY.
Fonte unica: [report Mini](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
FIX sul challenge; nessun DONE/live/telefono attestato.
Le note successive su binding assente/tutti flag OFF sono storiche.

## Aggiornamento DevTools — 2026-09-25T19:03:05.409Z

Mac tornato accessibile dopo la ricevuta precedente: build Mini f956680/app08cb400
ricompilata e verificata nel DevTools ufficiale,5tab OFF PASS via UI e SDK,
0nuove eccezioni, nessuna sessione/shop. Primo tentativo SDK rawPath null;
secondo dopo pagina disponibile PASS, nessuna modifica applicativa/mock.
Il precedente blocco Mac sotto è storico e risolto. Rimane l'input protetto
AppSecret, non una nuova richiesta di autorizzazione. Business/telefono NOT_RUN.
Fonte unica dello stato corrente: [report Mini](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
Nessun codice, DDL o deployment ulteriore; CI postmerge7753c0ca
36176894582/36176894608 PASS. Solo ricevuta: [PR111](https://github.com/XNIW/merchandise-control-admin-web/pull/111).


## 2026-09-25 — Image recovery integrated and selective staging verified

PR109 head de9b3924669c4df7d4785108e2b121ca190c8ce3 merged as
beed0a575a1d65ff0d267b7c1ec6ce6ecd9e754f after CI36175280179 and
Cloudflare36175280178 PASS; postmerge CI36175776026/Cloudflare36175776098 PASS.
Automatic staging/production deploy SKIPPED. Selective release
c55f88a36ac89684f25fd503ca7a3bc085c08660 derives from b8a859c2 and changes only
service.ts plus the new image migration. Actual Worker
6343d39c-d50a-4c88-89df-676f709697a2 verified100%; binding/runtime hashes unchanged,
all7flags OFF, AppSecret absent. HTTP OFF12/12 PASS, no authentic business claim.

Applied migration20260925184847_wechat_010_image_recovery once; registry144,
previous143version/name/hash entries identical, zero commerce. Function MD5
588c797e1d304291e34b0628f58b6c4e matches isolated tested DB; owner/ACL unchanged,
anon/authenticated EXECUTE false. Backup0600 and local restore/reapply PASS;
advisors security/performance0new. Rename source184000 to service-assigned184847
and remove only one empty EOF line; SQL instructions unchanged. Final file SHA256
45e84b6070d35daeb4d1a15b32be3e558303cd67f0286e805719f36ea0559f60 (applied input
4a863559f6cda50fe7c177ed176d6c5fe3d3837a5c28037b2413039dc2e40d4d).

Two independent readonly reviews APPROVED; original recovery7file manifest
73c0ebefc32910b302e58986d18769f852bbffa1a9fa10dda537ea83e7a14457 before metadata-only
rename/EOF normalization. No unreviewed application logic. Node22 verify,
1030foundationPASS/2skip,25targeted,41pgTAP and isolated concurrent SQL recovery
PASS. No live fixtures. Mini PR20 integrated with149tests; imported project build
updated, but new DevTools UI smoke NOT_RUN because the Mac locked during execution.
Protected AppSecret input and Mac unlock requested once each, no reply acquired.

Full A–G acceptance state: [canonical Mini report](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
TASK159 REVIEW/BLOCKED_EXTERNAL; no live, phone, public readiness or DONE.
Final metadata receipt [PR110](https://github.com/XNIW/merchandise-control-admin-web/pull/110)
contains no second migration application or deployment.


## 2026-09-25 — Image recovery delta in REVIEW

Single writer, two readonly reviewers under the continuation mandate. Only the
WeChat service branch changes: reconcile immutable existing JPEG bytes before
signing missing variants, exact null URLs for verified variants, and retryable503
for uncertain access revalidation. Explicit false remains403. The additive RPC
replacement locks product then version and returns noop only for the current
ready version of an active product; native RPC signatures/ACLs remain unchanged.

Node22 verify PASS; foundation1030PASS/2skip; targeted service25/25; image pgTAP41/41.
Old replay FAIL then new replay PASS, including a two-session concurrent finalize
state on a disposable local database clone (not a live Mini interaction). The local
harness pins a validated Unix Docker socket and drops only its generated database.
Backup of the remote function/ACL and exact143registry saved0600 before any DDL;
restore/reapply of the single function tested locally. Deployment/PR receipts follow
execution. No commerce, ordinary shop data, native or production mutations.

Worker beef7b20 and exact target checked again, secret absent/all7flags OFF at18:40UTC.
Authentic pilot remains BLOCKED_EXTERNAL: owner user for protected AppSecret input,
then personal pairing. Canonical full mandate matrix/evidence: [Mini report](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md).
No LIVE_VALIDATED, PHONE_VALIDATED, PUBLIC_RELEASE_READY or self-approved DONE.


## 2026-09-25 — Verified integration and staging OFF receipt

Current acceptance report: [Mini WECHAT-010](https://github.com/XNIW/MerchandiseControlWeChatMiniProgram/blob/main/docs/testing/WECHAT-010-REPORT.md). TASK-159 remains REVIEW; authentic TEST acceptance is BLOCKED_EXTERNAL, owner user for the existing protected installer input and subsequent personal pairing. No DONE or public release. The14September TEST-only credential exception remains valid; rotation NOT_PERFORMED / ACCEPTED_FOR_TEST_ONLY.

PR107 merged419d53bb5a70ff95f491f174fbb45f2b0d3617fe after exact-head CI36165504804 and Cloudflare build36165504722 PASS; main CI36166021776/build36166021736 PASS, automatic staging/production deploys SKIPPED. Selective release b8a859c236385d39b2b9b52e5dc56310ee386980 derives from b0e306f1 and changes only six runtime files plus one WeChat migration, all independently approved. Worker beef7b20-2448-4f45-8ff7-67e014004702 verified active; all bindings preserved, seven flags OFF, no tracing. Wrangler only made the default asset base_path / explicit; compatibility settings unchanged. HTTP OFF smoke12/12 PASS. No whole-main deploy.

Registry143, newest20260925172134_wechat_010_functional_reads, zero commerce. Rename from the initial source timestamp20260925161038 reconciles the service-assigned registry version; SQL bytes remain SHA25617049a7ed3fde844d80877065c3ac2853312aa4e1bf6aadbea1c6f1f3a9f0d27. Function definitions match isolated tested DB, owners/grants unchanged and anon/authenticated EXECUTE denied. Backup two definitions+ACL+142registry saved0600 before apply; restore/reapply tested locally with22pgTAP PASS. Advisors security/performance0new findings versus before. No business fixtures or financial/native/production mutations.

Local evidence: Node22 verify, foundation1015PASS/2skip,337pgTAP,48UI smoke+2pairing component. Mini independent33/33 runner guard tests and actual DevTools5tab OFF smoke are separate from authenticated business. Binding still absent, designated active profile/shop has0active Mini mappings; credential validity/pairing/login/phone NOT_RUN. Protected input is already requested once; all reported source/release work is complete independently of it.

## Historical pre-integration notes — superseded by receipt above

## 2026-09-25 — TASK-159 functional read delta / WECHAT-010

Current source of product acceptance is Mini `docs/testing/WECHAT-010-REPORT.md` and its unified parity matrix. Historical activation notes below do not supersede the14September TEST-only exposed-credential mandate. No production or DONE; source integration is distinct from staging deployment and authentic validation.

Implemented six route/server changes plus migration20260925161038: optional exact shop-scoped category/supplier ID lookup; strict calendar History filters converted at shop timezone; explicit membership/shop/read denials; own valid Mini session account suspension. No table/data migration, grants widened, native/OIDC/commerce change, or client credential. Unknown read RPC still fails42501 before membership lookup.

Evidence: Admin verify Node22 PASS; foundation1015PASS/2skip with existing read-only Win7POS reference; initial2ENOENT due incomplete default external checkout are not source failures. All337pgTAP across8WeChat suites PASS on isolated local PostgreSQL17.6 database (schema only copied, no real data). New22assertions cover250+250relations, lookup/search/archive/scope/permissions, month boundary and23/25-hour DST dates including microseconds. Direct pairing55assertions includes suspended valid session vs invalid device. Local UI smoke/Worker checks recorded separately; none are Tencent/business-live evidence.

Independent read-only contracts review APPROVED, Admin10-file application/test/migration manifest SHA2560fafba0256f1caebf0950dbf41bd90311e00a306707c9e46103ec7d3054c8b39 (sorted path+NUL+SHA256(bytes)+LF). Migration SHA25617049a7ed3fde844d80877065c3ac2853312aa4e1bf6aadbea1c6f1f3a9f0d27. Source baseline13389c5e, branch codex/wechat-010-functional-completion. PR/CI/merge and isolated release receipts follow actual execution.

Selective staging release must derive from b0e306f1 and include only the six runtime files and this migration, never whole Admin main. Before mutation revalidate142registry entries/zero commerce, active Worker3185ab67, exact target/flags, and preserve both function definitions+ACL for recovery; restore flags OFF/previous Worker if needed. Existing142migration statements remain unchanged. The7WeChat flags remain OFF until authentic activation. Protected input request already sent; AppSecret validity, pairing, login, business/phone/native readback NOT_RUN. Rotation NOT_PERFORMED/ACCEPTED_FOR_TEST_ONLY.

## 2026-09-25 — WECHAT-010 functional completion / EXECUTION

Current user mandate continues TASK-159 with root as sole writer and two independent read-only reviewers. Scope includes bounded exact relation lookup, shop-calendar History dates and typed read denials, with additive Admin-only migration, isolated database tests and selective staging release. TEST credential exception of September 14 remains valid only for the designated pilot; OneID is paused. Historical entries below are superseded where this mandate applies. No DONE or live acceptance is inferred.

- Stato: `REVIEW / EXTERNAL_ACTIVATION_REQUIRED`
- Fase: `REVIEW`
- Writer: Codex root, unico writer, worktree codex/wechat-010-native-direct.
- Authority: explicit WECHAT-010 user request, including normal PR/CI/merge and isolated staging deploy.

## Scope

Prepare the existing Admin-owned gateway for tester/shop-only staging admission,
correct the bridge nonce encoding required by Supabase, validate session lifetimes,
and advertise mutation capabilities only while the mutation flag is enabled.
No new IdP, provider endpoint, migration, credential or production change.
All surface, linking and mutation flags remain OFF. Actual vendor qualification,
rotated Mini Test AppSecret and first real login remain external prerequisites.

## Acceptance

Focused fail-closed tests, repository verify/foundation/paging/UI checks, independent
security diff review, normal PR with green CI, and documented source-isolated
staging candidate. No live Auth or business E2E PASS from mocked tests.

## Deployment baseline

Pre-deployment staging Worker `38272504-ca78-4bcb-8553-ae7463ae1e64` mapped exactly to
`a787331a6e673b2daf93929b507aa18c6dc24e24` through GitHub Cloudflare run
`32530174055`. Current main contains two unapplied commerce migrations; they are
not WeChat dependencies and will not be applied or included in the isolated
staging release. All seven WeChat migration statement hashes match remote.

## Verification / handoff

Local checks: focused WeChat59/59, foundation1002PASS/2skip (existing clean
Win7POS reference used read-only), verify including lint/typecheck/security/build,
POS paging, UI48/48, OpenNext build and local Worker smoke29/29 PASS.
An initial local symlink build failure was resolved by isolated npm ci; the dirty
historical Win7POS checkout was preserved. No new dependency or lockfile change.

Independent security scan `6aeeb9bd-93e4-4ef9-b791-10bfc4ec39d2`: complete,
all7 source files plus7 supplemental files, zero findings/deferred items; P0/P1=0.
Reviewer noted a nonsecurity flag-parser mismatch; capability projection now
uses the existing exact `true` mutation-gate semantics, with a regression test.
Normal PR/CI/merge remains authorized; this handoff does not self-approve DONE.
External live Auth/catalog/functions remain NOT_RUN and flags OFF.

## Staging execution evidence — 2026-09-11

Source PR [102](https://github.com/XNIW/merchandise-control-admin-web/pull/102)
merged normally as `67e360fcbc5812b2bf8e5471ef17b2323d0f0fd2`, after exact-head
CI and Cloudflare checks passed. Isolated staging release
`def934021481d3a309a543b0d4ea186b3fa91733` starts at the proven deployed
`a787331a` baseline and selects only reviewed WeChat files from PR101/102.
Its 14 selected files match merged source byte-for-byte; the only other two
files are release/governance evidence. No commerce, dependency or migration delta.

Exact release [CI34650038825](https://github.com/XNIW/merchandise-control-admin-web/actions/runs/34650038825)
and [Cloudflare build-only34650041304](https://github.com/XNIW/merchandise-control-admin-web/actions/runs/34650041304)
passed, including pgTAP and local Worker smoke. Local release verify, foundation
994PASS/2existing skips, focused59/59, UI48/48, Worker29/29, paging and dry-run
passed. The required CI workflow also ran its existing TASK094 staging
catalog-import fixture E2E; that success is not evidence of live WeChat Auth or
business E2E. No remote migration was applied.

After designated root review, Wrangler deployed staging with `--keep-vars`,
`--minify` and `--autoconfig=false`, preserving existing variables/secrets.
The OpenNext automatic-deploy wrapper initially rejected a multiword metadata
argument before upload; disabling automatic framework delegation resolved it
without source changes. Version `c39ebe92-0fdf-4596-94a0-16bcd018ebab` is at100%,
created `2026-09-11T21:40:59Z`, tagged `wechat-010-def93402` with exact source SHA
in its version message. Production was untouched.

Postdeploy real HTTP smoke9/9PASS: `/privacy`, `/account-deletion` and
`/api/auth/wechat/status` returned200 over verified TLS without redirects;
challenge, exchange, shops, catalog, sync delta and mutation gates returned503
`provider_not_configured`. The POST probes used synthetic OFF-state inputs,
never a real WeChat code or secret. All six WeChat feature/linking/mutation flags
remain absent with defaultOFF, public status has every surface disabled, and
binding names/types match the previous deployment. No secret was supplied or
rotated. Remote migration registry is unchanged at141 with identical complete
registry checksum `1b712fb5e807d9e90cc0668cd81df43a`; both pending commerce
migrations remain excluded.

Rollback target: Worker `38272504-ca78-4bcb-8553-ae7463ae1e64`.
Canonical task remains REVIEW. Live Auth, catalog/functions and essential-function
E2E remain NOT_RUN pending a qualified provider, rotated Test AppSecret and
operator-designated canonical tester/shop admission. No fixture is advertised
as a live tester and no feature flag was enabled.

## Emendamento WECHAT-011 — 2026-09-11

Il nuovo mandato continua TASK-159: un writer root nel worktree isolato
`codex/wechat-010-auth-closure`, due reviewer read-only complessivi.
Autorizzati review/fix/CI/merge normale e deploy staging senza nuovo prompt di fase.
Delta: ADR mirato ai requisiti e alla release GoTrue effettiva; cleanup sessioni,
revoca e readiness verificabili; nessun adapter senza qualifica favorevole.
Accettazione globale e stato DONE restano subordinati a prove reali e governance.
Release selezionata dal baseline def93402, senza commerce/migration/dependency delta.

## Execution della continuazione

Review read-only separata ha riprodotto cleanup incompleto, revoca boolean errata
e readiness pubblica incoerente. Fix: signOut canonico prima della RPC issue,
rollback opaco su risposta incerta; revoke solo con SQL true; readiness per superficie
senza esporre allowlist. Test Auth29/29, foundation1006+2skip, UI48/48 e verify PASS.
ADR aggiornato come proposta condizionata; provider/credenziale live NON_VERIFICATO.
Review dei commit finali e integrazione registrate nel closeout successivo.


## Closeout tecnico approvato e integrato

Reviewer read-only distinti `review_protocol` e `review_security`: APPROVED per
Admin `0190f52682de86714bb2e5fc0dd6410948355152`, Mini
`364b44cb63e553e47a398acc7d71378260c83647`, packet privato e release
`91f3d8e57f3c47740852974b73a5d66efc4189db`. S1 P1 e S2–S5 P2 chiusi con
regressioni; nessun finding aperto nel delta. L'ADR è una decisione condizionata,
non una qualifica provider o un'autorizzazione a omettere nonce.

[PR104](https://github.com/XNIW/merchandise-control-admin-web/pull/104) integrata
normalmente come `57e6049714252f6a6c1af37ec3f69127f16de902`; main locale/origin
allineate pulite prima del closeout documentale. CI PR34655768668 e Cloudflare
34655768662 PASS; main CI34656044040 e Cloudflare34656044041 PASS. Job/step/
annotation letti: solo warning preesistente runtime Node20 Actions. pgTAP48file/
2627test PASS; foundationCI995pass+13skip, locale1006pass+2skip; UI48/48 PASS.
TASK094 staging import E2E non rieseguito, skipped in CI corrente.

La release isolata deriva da def93402 e include solo quattro file identici al
source approvato/integrato più manifest `docs/AUDITS/WECHAT-010-AUTH-RELEASE.md`.
Branch `codex/wechat-010-auth-staging` preservato e pushato; non va merged a main.
Nessun commerce/migration/dependency delta. Release Cloudflare build-only
34655880432 PASS; verify/Auth29/OpenNext/local Worker29/dry-run PASS.
Wrangler deploy staging `--keep-vars --minify --autoconfig=false` exit0, metadata
source91f3d8e e tag wechat-010-auth-91f3d8e. Versione effettiva
`29d0c715-e3e7-4a23-b9e7-40ade3149414`, rollout100%. Rollback alla precedente
`c39ebe92-0fdf-4596-94a0-16bcd018ebab` disponibile, non eseguito.

Postdeploy HTTP reale OFF9/9 PASS, nessun redirect; nuovo status activation
disabled, enabled/readySurfaces tuttefalse, linking/mutationsfalse. Primo probe
challenge{}:400 e harnessFAIL; body corretto, rerun9/9 exit0, nessun difetto runtime.
Binding names/types invariati, nessun binding WECHAT/allowlist. Registry141
identica per versione/nome/statement count/hash, nessuna migration applicata;
commerce escluso, Google/email e produzione invariati. Nessuna fixture creata.

Execution dei fix conclusa e integrata; review codice APPROVED. Accettazione
live BLOCKED / EXTERNAL_ACTIVATION_REQUIRED, non DONE. Servono procedura TEST
supportata e nuova credenziale, qualifica OneID sul Mini TEST e tester/shop canonici
precisi già usati sulle altre piattaforme. Nessun account arbitrario/iniettato.
Mini distOFF/verify88 e cinque tab DevTools OFF verificati; privacy web-view
BLOCKED dal controllo IDE; Auth/telefono/E2E reale NOT_RUN. Report unico Mini
`docs/testing/WECHAT-010-REPORT.md`; packet privato OPERATOR-ACTIONS aggiornato
con prove attese e comando di ripresa, senza segreti o messaggi vendor inviati.

## 2026-09-12 - Explicit native privacy and direct Mini mandate

WECHAT-010/TASK-159 continues in EXECUTION. The operator designates the existing
private profile and TASK068E_260618231325 as pilot target; current canonical
identity, active membership/shop and shop_owner role were rechecked read-only.
This does not prove native clients use the same shop. No impersonation.
Authorized: shared/versioned native privacy available without Auth; explicit
Mini-only code2Session architecture revision, secure initial pairing to the
existing profile, opaque sessions and restricted authorization, additive reviewed
migrations if required. OneID remains paused. OIDC guarantees for other surfaces
remain unchanged. Root sole writer in both existing isolated worktrees; at most
two independent read-only reviewers. No production or activation before proof.
Prior narrower scope is superseded only by this explicit amendment.

## 2026-09-12 — Native privacy and Mini direct implementation

User mandate supersedes OneID-only and H5-only dependencies for Mini. Existing designated pilot verified; no further shop choice. Shared native policy, explicit code2Session protocol, two-consent pairing, opaque sessions and session-derived business/Storage RPCs implemented. Root only writer, two reviewers approved the initial design; implementation findings corrected and exact final review pending. Mini 98+3 tests, Admin foundation1013 PASS/2 expected skips, component browser2 PASS, direct SQL53 PASS; isolated staging141 plus additive migration validated, no commerce migration. Worker-local HTTPS uses intercepted upstream, live credential/login NOT_RUN. OneID paused. REVIEW, no DONE. Canonical report lives in Mini docs/testing/WECHAT-010-REPORT.md.
