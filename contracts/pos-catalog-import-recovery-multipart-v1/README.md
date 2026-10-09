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
