# TASK-094 — POS import receipt, retirement and linked correction continuation

Phase: REVIEW. Authorized 2026-10-08, isolated source lane from main
02ea44b95d4a05baddbf46f24251f0d5f0dea294. No DONE or runtime readiness.

A lost response must not trigger a fresh apply. A missing receipt also cannot
fence a delayed request, and replaying full import metadata after an accepted
batch would overwrite newer remote edits. The patch adds three authenticated,
shop/device-scoped endpoints: receipt, explicit private identity retirement and
linked masked correction. Receipt/retirement accept original import or immutable
correction-child requests; retirement blocks late children before economic writes.
Current outer trust, catalog.import permission and inventory mapping are checked
after blocking waits. Receipt performs no DML/audit. Correction checks all row
revisions and exact masked baseSnapshots before DML, appends only changed price
history, adjusts relative stock and retains current metadata. One late constraint
rolls back the entire correction and its durable ACK. Equal included prices get
stored unchangedFields proof, no duplicate price history.

Contract: contracts/pos-catalog-import-receipt-v1/README.md and exact JSON fixtures.
Raw client hashes remain locally verifiable declarations; legacy server canonical
normalization is preserved. Safe out-of-range originals and bounded Int64 text
are unchanged; unsafe JSON integer precision fails explicitly. Accepted ACK does
not prove that an invalid original raw price was applied.

Validation on the original immutable freeze ae8257: foundation1071 PASS/8 SKIP/
0 FAIL (1079 total, including28 targeted service checks); owned network-none
PostgreSQL69 PASS. The final small precision-only delta has one targeted PASS
(large finite correction snapshot lookup/retirement, unsafe original still400)
and typecheck PASS. Exact final-head full remote CI remains NOT_RUN; prior full
gates and delta evidence are attributed separately, with no immutable reruns.
The model runs both actual new migrations against synthetic dependency tables,
a lease/owner stub, legacy-apply economic sentinel and reservation/revision
triggers. It proves scoped races/CAS/rollback/no-economic-lookup behavior in that
model; it does not prove the complete historical apply_v1 implementation, deployed
schema or live authentication. The exact owned container is confirmed absent by a read-only Docker inspect.
The original runner did not record stop/remove return codes, so shutdown mode is
not independently attested. A narrow subsequent runner delta checks both return
codes and exact-container absence before future CLOSED claims; no69-test rerun.

Repository lint/type generation/typecheck/security passed. First build failed only
because cached node_modules was a symlink outside the Turbopack project root; the
own ignored dependencies were APFS-cloned from identical package-lock cache.
Subsequent restricted build could not fetch the unchanged public Google Fonts;
final build with normal public-font access is tracked in validation receipt.
Those failed logs are preserved, not treated as product defects or hidden.

Independent immutable SQL/HTTP review and final build receipt are tracked under
EVIDENCE/TASK-094/import-receipt-20261008. Source-freeze manifest and fixture hashes
identify exact reviewed bytes; prior32/49/62/68-check results and setup failures
remain historical. No new dependency/package lock, mobile input, foreign WIP,
live SQL, cleanup, DB apply, Worker deploy or READY issuance occurred.

Exact source effects for a separately approved apply: migration20261008194809 adds
private retirement table and service-only receipt/retire/fenced import wrappers;
migration20261008200355 adds private correction ledger and service-only atomic
correction plus cross-ledger lookup/apply fences. Both private ledgers have forced
RLS and no API table grants; prior implementations remain private without direct
service execute. No indiscriminate migration/apply or production operation.

Next: frozen-source review and normal PR/CI. Applying the two exact migrations and
deploying exact source require their separate concrete authorization; acceptance
on the real caller/shop and platform remains NOT_RUN.
