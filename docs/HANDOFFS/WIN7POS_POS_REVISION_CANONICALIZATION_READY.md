# Win7POS POS revision canonicalization handoff

## Stato

- Task Admin: `TASK-146`
- Stato: `REVIEW_READY`, non `DONE`
- Handoff:
  `READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`
- TASK-144 e TASK-145: restano `REVIEW_READY`
- Win7POS, Android, iOS e production: `NOT_MODIFIED`

## Delivery Admin

- Initial Admin main:
  `86713586106dc1e50bc5d846a24a257f521fc109`
- Feature SHA:
  `83e71b912a6c27bdc5a2a3e4e6d93d86a776fc12`
- PR:
  [#51](https://github.com/XNIW/merchandise-control-admin-web/pull/51)
- PR head:
  `9dafba0ba47355ad5145b4ab6c7a04725acead4a`
- Runtime/deployed main e merge normale:
  `4bccbb793391829c2867a27f6a8033224cdeca7e`
- Review indipendente: `ZERO-GATE PASS`,
  `P0/P1/P2/P3 = 0/0/0/0`
- CI Verify, migration audit e Cloudflare build: `PASS`

## Contratto timestamp canonico

Il public boundary del catalog pull emette:

`YYYY-MM-DDTHH:mm:ss.ffffffZ`

Input server interni accettati:

- `Z`, `+00:00`, `+0000`;
- frazione da 0 a 6 cifre, padded a destra.

Sono rifiutati offset non-zero, più di sei cifre, date/ore invalide e testo
non canonizzabile. I microsecondi non vengono convertiti con `Date` e non sono
arrotondati. Il valore è applicato a:

- product/category/supplier `updatedAt`;
- product/category/supplier tombstone `deletedAt` e `updatedAt`.

Price history legacy e timestamp raw dei cursori restano invariati. Un valore
non canonizzabile fallisce closed con
`catalog_revision_timestamp_invalid`, HTTP 500 e audit bounded senza raw.

Vettori principali:

| Input class | Risultato |
| --- | --- |
| `...123456Z` | invariato |
| `...123456+00:00` | `...123456Z` |
| `...123456+0000` | `...123456Z` |
| nessuna frazione | `.000000Z` |
| 1-5 cifre | padding a sei |
| 7 cifre / offset non-zero / data invalida | rifiuto |

Fixture machine-readable:
`contracts/pos/catalog-product-canonical-revision.response.json`.

## Root cause

La RPC mutation produceva già `Z` con sei microsecondi. Data API e catalog pull
serializzavano lo stesso `timestamptz` con `+00:00`; istante e microsecondi
erano uguali, ma i byte no. Il proprietario esatto del difetto era il mapping
pubblico in `src/server/pos-auth/catalog-pull.ts`, non Win7POS e non la RPC.

Dopo il fix:

`ACK.authoritativeRevision == catalog product.updatedAt`

come uguaglianza byte per create, update, retail, purchase, stock, duplicate,
deactivate e reactivate.

## Cleanup Asus parziale

- Run 2 product hash: `1d59445b6355a359`
- Run 3 product hash: `5ed995f27096a32b`
- Shop hash: `67545716fda89c02`
- Identificati: 2 prodotti, 4 receipt, 4 sync event, 4 audit immutabili.
- Price, movement, sale line e revenue target: `0`.
- Rimossi tramite array ID esatti in transazione guardata:
  prodotti `2`, receipt `4`, sync event `4`.
- Categorie e fornitori condivisi: preservati.
- Audit mutation: preservati `4`; audit cleanup bounded aggiunto.
- Residui target e impatto non-sintetico: `0`.
- Asus run 1: non coinvolto.

## Staging

- Migration repository/staging:
  `20260728030154`, `20260728064500`
- Migration TASK-146: nessuna
- Migration parity: `PASS`
- Unico Worker deploy post-merge:
  `25d2dd12-e8bd-458d-a985-c94eff7c564f`
- Worker version:
  `edd39bb4-3d0c-4f20-b72a-5edec35ec355`
- Worker startup: `43 ms`
- Production deploy: `NO`

## Acceptance server-side

- Run: `T146253DB0D4CE`
- First login/offline authority: `PASS`
- Catalog iniziale: 2 pagine, 1 categoria, 1 fornitore
- Catalog finale: 4 pagine, 1 categoria, 1 fornitore, 2 prodotti, 2 prezzi
- Create/update/retail/purchase/stock `+5`/stock `-2`/duplicate/deactivate/
  reactivate: `applied`
- ACK/catalog exact revision: `PASS` dopo ogni mutazione applicata
- Stale revision reale: `failed_conflict`
- Replay: `duplicate_replay`, ACK originario invariato
- Payload collision: `idempotency_payload_mismatch`
- Price history: `2`
- Stock movement: `2`
- Sales/revenue: `0/0`
- 503/exceededResources: `0/0`
- Audit: 11 mutation row prima del cleanup, chiavi vietate `0`, massimo
  metadata `524 byte`

Cleanup acceptance:

- rimossi: categorie `1`, fornitori `1`, prodotti `2`, price `2`, movement
  `2`, receipt `10`, conflict receipt `1`, sync event `13`, revision `1`;
- residui catalogo/business/runtime attivi: `0`;
- audit immutabili preservati.

## Check

- Focused TASK-143/TASK-146: `23/23 PASS`
- Regressioni TASK-139/141/142/143/144/145/146: `54/54 PASS`
- Foundation completa: `PASS`, incluso drain fixture 676 pagine
- Typecheck, verify, security, Cloudflare build e local smoke: `PASS`
- Bundle delta: `+1.650 byte`, circa `+0,018%`
- Reset, pgTAP e SQL lint: `NOT_RUN_NOT_APPLICABLE`, nessun SQL modificato

Stato finale:
`READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`.
