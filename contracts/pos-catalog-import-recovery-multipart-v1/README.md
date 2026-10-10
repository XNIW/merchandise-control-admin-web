# POS import recovery multipart v1 — proposed wire, 9 October 2026 UTC

All seven paths are POST `/api/pos/catalog/import-recovery/{upload,finalize,receipt,retire,plan,apply,receipt-page}`.
Every request has `schemaVersion: "pos-catalog-import-recovery-multipart-v1"`
and current standard `shopCode`, `shopDeviceId`, `posSessionId`, `deviceToken`,
`sessionToken`. UUID handles are scoped references, never authorization capabilities.
The current lease, shop/device, owner mapping and `catalog.import` permission are
required again for every transaction and after blocking locks. No trust fields
appear in URL parameters or response payloads.

## Exact upload envelope

```json
{
  "schemaVersion":"pos-catalog-import-recovery-multipart-v1",
  "shopCode":"FIXTURE","shopDeviceId":"30000000-0000-4000-8000-000000000094",
  "posSessionId":"40000000-0000-4000-8000-000000000094",
  "deviceToken":"fixture-device","sessionToken":"fixture-session",
  "uploadId":"01000000-0000-4000-8000-000000000094","mode":"original",
  "originalKind":"ordinary","declaredPayloadHash":"client-declared-hash",
  "totalByteLength":1234,"rawSha256":"sha256:<64 lowercase hex>",
  "parts":[{"index":0,"byteLength":1234,"sha256":"sha256:<64 lowercase hex>"}],
  "partIndex":0,"contentBase64":"<exact original UTF-8 bytes encoded as standard base64>"
}
```

`uploadId` is generated once and reused after a lost response. Every upload call
repeats the same full immutable manifest. Indexes are contiguous from zero; 1–128
parts, each 1–262144 raw bytes, sum at most 33554432 bytes. The entire HTTP request
remains at most 524288 bytes. A part's decoded bytes and SHA256 must match its
manifest entry. Different bytes, manifest, mode or full hash under an existing
uploadId conflict. Accepted upload writes only private recovery provenance.

For mode original, `originalKind:"ordinary"|"correction"` and
`declaredPayloadHash` are required immutable manifest metadata. Raw upload is
the exact saved ordinary PayloadJson, which can omit payloadHash, or the exact
correction request / `{originalReceipt,request}` saved wrapper. Only `request`
is parsed from that wrapper; originalReceipt is never remote authority. A
transient parser view supplies missing declared hashes from outbox metadata,
including nested recoveryOf.originalRequest from recoveryOf.payloadHash. Any
declared hash already present must match its proper identity. Raw bytes never
change, and child declaration is never substituted for the root declaration.
For mode plan, originalKind/declaredPayloadHash are omitted.

Finalize body adds only `uploadId`. The server rebuilds every part in index order,
verifies all bytes and the full raw SHA256, decodes strict UTF-8, rejects unsupported
numeric precision, parses the complete original (1–60000 rows), and independently
recomputes the existing legacy business canonical SHA256. It does not accept a
subset or use the client payload hash as proof. Original saved attemptCount may
be omitted, zero or positive; ordinary import still requires positive attempts.
The exact original bytes remain unchanged. Response: `status:"verified"`,
`verifiedOriginalId`, `originalSchemaVersion`, `clientImportId`, `idempotencyKey`,
`payloadHash` (client declaration), `canonicalPayloadHash` (server), `rawSha256`,
`itemCount`. Verification performs no apply or retirement.

Receipt and explicit retire bodies add `verifiedOriginalId`. They use the same
two advisory identity locks as ordinary apply and correction. Receipt reports
`accepted|not_found|conflict`; `not_found` is snapshot-only and never permits
replacement. Retire reports `accepted|retired|conflict`: apply winning the lock
returns its persisted ACK; retirement winning creates the durable identity fence.
The exact same protocol can verify and retire a failed correction-child request.

## Complete recovery plan

Upload `mode:"plan"` carries the exact UTF-8 JSON plan instead of an original.
Its complete shape is:

```json
{
  "schemaVersion":"pos-catalog-import-recovery-plan-v1",
  "planId":"02000000-0000-4000-8000-000000000094",
  "verifiedOriginalId":"01000000-0000-4000-8000-000000000094",
  "mode":"replacement",
  "parts":[{"index":0,"request":{"schemaVersion":"pos-catalog-import-v1","source":"supplier_excel","batch":{"clientImportId":"new-part-0","idempotencyKey":"new-part-0-idem","createdAt":"2026-10-09T00:00:00Z","attemptCount":1},"payloadHash":"fixture-client-declared-hash","summary":{"newProducts":1},"items":["<ordinary full-intent row objects>"]}}],
  "coverage":[{"clientItemId":"row-1","kind":"child","partIndex":0,"childClientItemId":"row-1"}]
}
```

After uploading all bytes, POST `plan` with `uploadId`. The server validates the
complete plan and every child before any catalog DML. Every child has new stable
clientImportId/idempotencyKey, at most 1000 items and at most 512KiB encoded child
business request. Maximum 128 children, 60000 total rows. Replacement requires
the original durable `retired` fence. Every original clientItemId occurs exactly
once in the complete immutable `coverage`: either a child row, or
`{clientItemId,kind:"accepted_contributor",verifiedContributorId,contributorClientItemId,desiredItem}`.
Contributor proof requires the same shop/device, a complete durable accepted ACK,
exact historical item correlation and exact desired business intent including
omitted versus explicit null fields. Price/ACK mapping ambiguity fails closed;
current prices and NoChange do not constitute contributor proof. Every child row
must be covered exactly once. Raw omitted/null fields retain their original
semantics; preview values do not replace omitted intent. Global duplicate client
item, barcode, child identities and correction product targets are rejected.

For `mode:"correction"`, child request uses
`schemaVersion:"pos-catalog-import-correction-v1"`,
`recoveryOf:{verifiedOriginalId:"<same UUID>"}` and the existing immutable
`correction:{clientImportId,idempotencyKey,payloadHash,createdAt,items}`. Only
changed rows are included. The server binds each row to the original persisted
ACK map; current revision/baseSnapshot CAS, fieldMask, omitted/null, unchanged
price proof and quantityDelta behavior are unchanged. A complete accepted
original ACK is required. Unchanged original rows use
`{clientItemId,kind:"original_accepted"}` coverage; changed rows use child coverage.
Accepted contributor rows use the same exact proof shape above. New child canonical hashes retain the existing
correction canonical format; the reference expands server-side only.

Response `status:"planned"` identifies `planId`, `verifiedOriginalId`,
`planCanonicalHash`, `partCount`, `itemCount` and each part's index, child identity,
declared/canonical hash and item count. No catalog mutation is performed.

POST `apply` with `planId` and `partIndex` applies only the immutable verified
child through the existing fenced apply/correction RPC and atomically persists
its ACK. Repeating the same child returns its durable ACK. Parent state is
`partial` until every child has a complete durable accepted ACK; only then it is
`complete`. A failed child does not roll back earlier acknowledged children or
claim global atomicity. A revision-conflict child remains immutable and can be
verified/retired explicitly under the same identity locks before a new child/plan
is created; delayed original/child requests cannot bypass retirement.

## Durable receipt paging

Accepted original/child and plan responses include a `receiptSha256` over the
persisted receipt, total item count and `complete:false` when paged. POST
`receipt-page` with the scoped `verifiedOriginalId` (or `planId` and `partIndex`),
`receiptSha256`, `offset` and `limit` (1–1000). Offset/hash/scope bind every page.
The page includes the unchanged selected durable items/maps and separate live
`currentProductSnapshots`. No page or successful HTTP status alone proves the
complete receipt or parent completion. The full ACK is reconstructed only after
all page ranges and hashes are verified. Live snapshots never change the
durable ACK hash.

Source preparation only: no shared TEST DDL, Worker deployment, cleanup, READY,
runId or performance acceptance is authorized by this contract document.

Every accepted page's receipt.summary is the original full immutable ACK
summary, never counts for that page. The client checks the same server-provided
receiptSha256 on every page and verifies complete offset/item/map coverage; it
does not try to reproduce PostgreSQL jsonb text serialization. The server
validates the complete ACK inside the database before exposing any page.

New never-sent/offline imports continue to split locally into ordinary requests
under the existing 1000-row/512KiB limits, without recovery network calls or
retirement. A server replacement plan and its existing retirement prerequisite
apply only to an uncertain previously identified original.

## Explicit successor after a failed child

Receipt and retire additionally accept `planId` + `partIndex` instead of
`verifiedOriginalId` (exclusive selectors). The server loads the bounded frozen
child and root, applies the same identity locks, and returns the plan/part,
clientImportId, idempotencyKey, declared payloadHash and server canonicalPayloadHash.
No saved request must be expanded or rewritten to retire a revision-conflict child.

A successor plan adds `supersedes:{planId,retiredChildren:[{partIndex,
canonicalPayloadHash}]}`. Every predecessor child without a durable ACK must
already have its exact authoritative retirement fence. If apply won, its ACK
must be carried instead. Every accepted predecessor part is covered with
`{clientItemId,kind:"accepted_plan_part",contributorPartIndex,
contributorClientItemId}`. Optional `contributorPlanId` defaults to the immediate
predecessor and may reference only its verified linear same-root ancestor chain.
This permits further retries to retain earlier ACKs without repeating price or
quantity effects. Stored exact row/mask/relative quantity and complete durable
ACK/receipt hash are the proof; a changed desired intent cannot borrow it.
Previously carried contributor coverage must remain identical. Every root row
still occurs exactly once. The server rejects competing initial plans across
duplicate verified handles of one root identity/canonical hash, and rejects two
successors of a predecessor. Maximum 128 generations. Root serialization precedes
plan and identity locks. The old partial plan stays immutable; only the successor
can become complete after all of its new child ACKs and carried proofs exist.

Every accepted page includes offset/limit/complete. `complete` means the returned
range reaches the final item (`offset+limit>=totalItemCount`), not that a single
page proves all preceding items. Summary and receipt SHA remain the entire durable
ACK's values; full reconstruction requires every contiguous page and unique maps.

An `accepted_plan_part` can carry a skipped row only as membership of the exact
immutable ancestor child and its fully validated durable ACK. The server binds
`contributorItemStatus` and `contributorRemoteProductId:null` for that row; this
does not prove applied prices, quantity or product mapping. New/updated ordinary
rows and correction rows require the actual durable product mapping. An unrelated
NoChange contributor cannot prove economic intent.

## Bounded source candidate — qualification pending

The implemented phased candidate keeps ordinary import at 1000 rows and 512KiB.
It separates raw uploads (512MiB/2048 chunks), logical children (0–1024) and
ancestry (128 generations). Manifest descriptor pages contain at most256 entries;
private item/proof projections are at most256KiB, whole normalization frames2MiB
and scalar headers16KiB. The Worker parses server-selected pages with the official
parser, global row ordinals and complete server canonical hashes; it never loads
an entire upper-size original or plan. Proposed phased wire/goldens remain linked
from wire-contract.json until the exact source and resource gates are qualified.

Per device, retained declared raw bytes/slots include completed and failed audit
artifacts (8GiB/512); active artifacts and reserved capacity are additionally
bounded at2GiB/32. This is a raw admission budget, not a physical-storage estimate:
normalized rows/canonical fragments have separate bounded derivation overhead.
Before an initial identity fence, reserve two future valid-plan credits plus one
separate512MiB staging allowance and slot. Only that staging allowance can be
claimed at manifest registration. Complete whole-plan proof converts one future
credit and restores staging atomically; raw is counted once. A failed artifact
retains its raw debit and may restore staging only after an atomic quota check.
This finite budget does not promise unlimited invalid retries. A retired original
stays unresolved/open until authoritative full leaf closure; only that closure
releases unused promises, while all raw audit bytes/rows remain. A fully verified
successor may close the predecessor artifact's active admission without rewriting
its immutable partial logical status. Current scoped trust is required throughout.
The existing public retirement alias shares this capacity check for known verified
or planned multipart identities; unknown ordinary identities keep their behavior.

The2MiB normalization frame and256KiB projections above apply to the new phased
path. Compatibility exceptions are finite and explicit: an old read-upload
may return up to4MiB raw bytes encoded as base64 (approximately5.34MiB plus
metadata), and read-original permits at most16MiB of normalized JSONB text.
They are not upper-size Worker qualification; larger documents require phases.
The SQL preliminary physical child guard is2MiB, independently of the unchanged
official exact512KiB complete HTTP-body check and1000-row limit.

The compatibility full-manifest path is limited to4MiB per raw document. An old
unbound mode-plan upload that cannot fit beside protected root capacity returns
HTTP409 `phased_upload_required` before admission. Reuse the immutable raw bytes
and upload identity through phased registration with `verifiedOriginalId`;
recompute only the manifest envelope/hash that now binds that root. No saved JSON,
raw SHA, child identity or business canonical hash is rewritten. A refused ordinary
original remains `quota_exceeded`. Existing small packets retain their old format
when capacity is available. A zero-new-child successor still has at least one raw
upload chunk and full original coverage; its planned response is `parts:[]`,
`partCount:0`, `itemCount:0`, `parentStatus:"complete"`, after authoritative proof.
It does not synthesize ACKs or complete/rewrite an immutable predecessor.

Lost child retirement responses use the exact retry rule and captured synthetic
frames in [child-retirement-lost-response](child-retirement-lost-response/README.md).
A read-only `conflict/identity_retired` response grants no replacement permission.
