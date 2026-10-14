# POS import recovery contracts v1

Three authenticated, shop/device-scoped endpoints resolve a lost response without
reapplying the immutable original request:

- `POST /api/pos/catalog/import-receipt`: read-only lookup, with no audit or DML.
- `POST /api/pos/catalog/import-retire`: intentional mutation of a private,
  permanent identity fence, only when no accepted receipt exists.
- `POST /api/pos/catalog/import-correction`: atomic, linked correction of an
  accepted import, with new operation IDs and narrowly masked business fields.

These synthetic examples are wire fixtures, not live acceptance or READY.
Neither lookup nor retirement writes products, prices, stock, History, sales or
sync events. Correction writes only requested prices/stock, their normal price
history and stock movements, catalog revisions/events from existing triggers,
and its private durable ACK. It never writes sale/return/void records or metadata.
No migration or deployment is authorized by this document.

## Immutable original and current trust

`lookup.request.json` and `retire.request.json` contain `originalRequest`, the
saved `pos-catalog-import-v1` business request, including batch, items and summary.
The sole current trust is the OUTER deviceToken, sessionToken, posSessionId,
shopDeviceId and optional shopCode. Old nested tokens/session may differ. Nested
shopDeviceId/shopCode, when present, must match the outer binding. Outer operation
IDs and declared payloadHash must equal the original request's values exactly.

The same endpoints can resolve a correction child: the immutable originalRequest
is then the complete `pos-catalog-import-correction-v1` request, and outer IDs/hash
are that child's correction IDs/hash. See `correction-target.*.json`. The response
`originalSchemaVersion` is derived from the supplied, validated original schema:
`pos-catalog-import-v1|pos-catalog-import-correction-v1`. It is not caller-supplied
routing authority. There is no additional endpoint or nested correction chain.

## Raw hash versus historical canonical hash

Legacy Win7 hashes raw JSON bytes. The historical Admin ledger stores the hash of
the normalized business payload. `canonicalPayloadHash` is recalculated using the
unchanged import parser and checked against that ledger. `payloadHash` echoes the
client declaration after outer/nested equality; the legacy raw hash was never
persisted. The client must verify it locally against saved original bytes. Admin
does not claim raw-hash cryptographic verification against a DB column.

The original input remains unchanged. Safe numeric 2147483648 and bounded decimal
Int64 text retain their original content, while the historical business parser
normalizes invalid/out-of-range prices to null. An accepted ACK attests ONLY the
normalized business operation; its status does not prove that an invalid original
price was applied. `lookup.legacy-int64.request.json` preserves all three rows.
An unsafe JSON integer beyond JavaScript's safe integer range cannot retain its
literal precision after JSON.parse: it fails closed with HTTP400 and code
`original_numeric_precision_unsupported`. Decimal integer text up to 64 digits
can be retained exactly; no clamping, raw rewriting or fabricated price applies.

Correction canonical hashing additionally binds original canonical identity,
new IDs, normalized createdAt, every selected row, revision, fieldMask, exact
baseSnapshot and changes. The raw correction hash is also a declaration for local
byte verification, separate from the server's canonical hash.

## Durable ACK and selective current snapshots

Accepted `receipt` is the complete persisted RPC ACK: ok, batchId, status, items,
remoteProductIds, remotePriceIds and summary. It is NOT the original HTTP
PosCatalogImportResponse; dynamic shop/serverTime/serverRequestId/attemptCount
were never persisted. Use this distinct recovery DTO. A replay returns this ACK
unchanged. The correction's outer replay status is duplicate while its stored ACK
status remains accepted.

Accepted lookup/retirement also returns `currentProductSnapshots`, ONLY for ACK
product-map tuples. These are fresh reads separate from the durable ACK, with
clientItemId, remoteProductId, snapshotStatus, baseRevision, retailPrice,
purchasePrice and stockQuantity. Available revision has six UTC fractional digits;
each numeric value can be finite number OR null, matching nullable catalog fields.
Missing/deleted/out-of-scope products are unavailable and all four values are null.
No full catalog pull, unrelated IDs or product metadata are exported.

A later edit can invalidate a snapshot; it is not authority to write without CAS.
The current snapshot supplies the correction's exact baseRevision/baseSnapshot.
Remote metadata, including a barcode renamed after the original ACK, is preserved.
Correction response maps use the CURRENT barcode (`REMOTE-CODE` in the example),
while product identity must match the original ACK map exactly.

## Lookup and explicit retirement outcomes

Every successful lookup/retirement envelope contains ok=true, code=success,
schemaVersion, status, originalSchemaVersion, shopId, shopDeviceId, clientImportId,
idempotencyKey, payloadHash and canonicalPayloadHash.

- accepted: durable receipt plus selective currentProductSnapshots.
- not_found: snapshotOnly=true, replacementAllowed=false. This observation cannot
  authorize replacement; a delayed original or correction child can still arrive.
- conflict: identity_conflict, identity_retired or receipt_unavailable. Failed,
  processing or incomplete legacy ACKs cannot be retired as if absent.
- retired: retiredAt and oldIdentityBlocked=true attest the permanent fence.

Lookup has accepted|not_found|conflict; retirement has retired|accepted|conflict.
After explicit retirement a replacement uses NEW clientImportId AND idempotencyKey.
Old apply/correction IDs remain blocked even after the replacement succeeds.
For a revision-conflicted correction with no ACK, resolve that CHILD's receipt and
retire its identity explicitly before a fresh-revision replacement. Do not infer
retirement from the conflict response or from a missing lookup.

The DB rechecks current lease, catalog.import permission and inventory mapping
with the advancing wall clock after permission/owner/identity/product lock waits.
The exact v2 identity locks are acquired in order:
hash(shopId:shopDeviceId)/hash(clientImportId), then hash(...)/hash(idempotencyKey).
If apply/correction wins, retirement returns accepted ACK. If retirement wins,
late apply/correction conflicts before economic writes. Normal import and correction
cannot reuse each other's identity keys. Direct legacy apply_v1/private predecessor
have no service_role EXECUTE grant; only the fenced public wrapper is callable.

## Narrow linked correction

`correction.request.json` has current outer trust, recoveryOf containing the
original import identity/hash/originalRequest, and correction containing NEW
clientImportId/idempotencyKey, payloadHash, createdAt and selected items.
Each item contains exactly:

- original clientItemId and remoteProductId from the accepted ACK map;
- baseRevision from the scoped current snapshot;
- nonempty fieldMask subset retailPrice, purchasePrice, quantityDelta;
- changes containing EXACT masked fields, no null-as-keep or metadata;
- baseSnapshot containing EXACT corresponding source fields: retailPrice,
  purchasePrice, and stockQuantity when quantityDelta is masked. Each value is
  null OR a finite JSON number; there is no sign, magnitude or three-decimal
  restriction on this snapshot. The DB requires exact agreement with the current
  masked columns under row lock. These numeric values use JavaScript/DB floating
  point transport, not lossless Int64-literal storage. Unsafe Int64 numerics in
  the forensic original import remain explicitly unsupported as described above;
  exact bounded decimal text stays immutable. Unmasked fields are absent.

Prices are absolute, 0..999999999, maximum three decimals. quantityDelta is relative,
nonzero, signed, at most 1000000000 in magnitude and three decimals. It is computed
by the client from corrected intent minus originally accepted contribution, NOT
from an absolute overwrite of remote stock. Server resulting stock must be 0..
999999999 and existing reservation guards must pass. Price-only correction does
not narrow unrelated large legacy stock through a quantity conversion.

All selected products are row-locked in ID order. Every baseRevision AND masked
baseSnapshot value must match current storage before ANY economic DML. One stale
or mismapped row refuses the whole correction with no successful receipt. All
writes/price history/stock movements/private ACK share a subtransaction; a late
constraint or lease failure rolls back the whole batch. Replay returns stored ACK
before stale revision or new-write timestamp validation. Only NEW writes apply
the existing article timestamp window [now-180days, now+5minutes]; forensic lookup,
retirement and replay do not retroactively reject old original timestamps.

Each correction ACK item contains clientItemId, remoteProductId, status=accepted,
unchangedFields and authoritativeRevision. Each requested price has EITHER a new
remotePriceId map OR a durable unchangedFields entry proving changes==baseSnapshot;
never both. Equal included prices append no duplicate price history. Omitted fields
are not inferred to have changed. Quantity delta creates one idempotent stock
movement. See correction.no-effect.*.json. New price maps and product maps preserve
the full persisted response; replay does not allocate new price IDs.

## Bounds, errors and deployment effects

Routes keep the existing JSON/method/body boundaries (512 KiB request limit).
Legacy original parsing remains bounded by the existing import limits. Correction
has at most min(1000, original-item count), unique product/item IDs, IDs<=200 chars,
field-mask<=3 and RPC item JSON<=512 KiB. No new dependency is introduced.
Typed outcomes use HTTP200. Auth/permission failure is401; invalid input400;
changed inventory mapping409; missing configuration503; malformed backend500.
Incomplete accepted original ACK validation is409/receipt_unavailable.

Source migrations 20261008194809 and 20261008200355 add private retirement/correction
ledgers and service-only fenced RPCs; replace only the public import wrapper while
retaining its prior implementation privately. The live TEST schema remains
unchanged until a separately approved exact migration application. Deployment must
follow exact source/CI review and approval; no repair, cleanup, sale or production
operation is part of this change.
