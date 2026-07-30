# Evidence TASK-146

## Baseline

- Admin `origin/main`:
  `86713586106dc1e50bc5d846a24a257f521fc109`.
- Win7POS GitHub `main` read-only:
  `b6391781c08490fcd99f4d98e3affba2e4aa38a6`.
- PR Win7POS `#52/#53/#54`: `MERGED`.
- Branch:
  `codex/admin-pos-revision-canonicalization-20260728`.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.

## Riproduzione read-only

Correlazione: run 2 e run 3 sono stati ricostruiti tramite finestre UTC dei run,
receipt applicative, sequenza locale e audit mutation. Nomi, barcode, UUID e
timestamp integrali non sono riportati.

| RUN | SOURCE | VALUE CLASS | FRACTION DIGITS | UTC SUFFIX | SAME INSTANT | BYTE EQUAL |
| --- | --- | --- | ---: | --- | --- | --- |
| Asus 2 | ACK | `CANONICAL_UTC_Z` | 6 | `Z` | sì | sì |
| Asus 2 | DB/Data API | `UTC_OFFSET_COLON` | 6 | `+00:00` | sì | no |
| Asus 2 | catalog pull shape | `UTC_OFFSET_COLON` | 6 | `+00:00` | sì | no |
| Asus 3 | ACK | `CANONICAL_UTC_Z` | 6 | `Z` | sì | sì |
| Asus 3 | DB/Data API | `UTC_OFFSET_COLON` | 6 | `+00:00` | sì | no |
| Asus 3 | catalog pull shape | `UTC_OFFSET_COLON` | 6 | `+00:00` | sì | no |

Hash SHA-256 troncati dei prodotti remoti:

- Asus 2: `1d59445b6355a359`;
- Asus 3: `5ed995f27096a32b`.

Conclusione: nessuna modifica concorrente; cambia solo la rappresentazione
testuale al boundary Data API/catalogo.

## Implementazione

- Helper server-only:
  `src/server/pos-auth/pos-revision-timestamp.ts`.
- Input: `Z`, `+00:00`, `+0000`, frazione 0-6.
- Output: `YYYY-MM-DDTHH:mm:ss.ffffffZ`.
- Validazione calendario/ora manuale; nessun `Date`, `Date.parse` o
  `toISOString` nel helper.
- Boundary: active product/category/supplier e tutti i relativi tombstone.
- Cursori: raw timestamp preservato.
- Price history legacy: invariata.
- Failure: `catalog_revision_timestamp_invalid`, HTTP 500,
  `catalog_response_invalid`, audit bounded senza timestamp raw.
- Migration/DB/RPC: `NOT_MODIFIED`.

## Check

- `git diff --check`: `PASS`.
- focused TASK-143/TASK-146: `23/23 PASS`.
- regressioni TASK-139/141/142/143/144/145/146: `54/54 PASS`, zero skip.
- `npm run typecheck`: `PASS`.
- foundation completa con Win7POS detached `b6391781`: `PASS`.
- `npm run security:scan`: `PASS`.
- `npm run verify`: `PASS`.
- `npm run cf:build`: `PASS`.
- `npm run test:cloudflare:local`: `PASS`.
- OpenNext server function: `9.393.549 byte` contro baseline `9.391.899`,
  delta `+1.650 byte` (`~0,018%`).
- Reset Supabase, pgTAP e SQL lint: `NOT_RUN_NOT_APPLICABLE`; nessun SQL
  modificato.

## Review indipendente

- SHA revisionato:
  `83e71b912a6c27bdc5a2a3e4e6d93d86a776fc12`.
- Baseline:
  `86713586106dc1e50bc5d846a24a257f521fc109`.
- Verdict: `ZERO-GATE PASS`.
- Finding: `P0/P1/P2/P3 = 0/0/0/0`.
- Check reviewer: regressioni `54/54`, typecheck, security, cf build,
  Cloudflare smoke e diff check tutti `PASS`.
- Nessun file modificato dal reviewer.

## Cleanup, delivery e staging

- PR non-draft:
  [#51](https://github.com/XNIW/merchandise-control-admin-web/pull/51).
- Head PR:
  `9dafba0ba47355ad5145b4ab6c7a04725acead4a`.
- CI: Verify, migration audit e Cloudflare build `PASS`; deploy automatici ed
  E2E non pertinenti alla PR `SKIPPED`.
- Merge normale:
  `4bccbb793391829c2867a27f6a8033224cdeca7e`.
- `main == origin/main` dopo merge: `PASS`.
- Migration parity staging/repository: `PASS`, ultime versioni
  `20260728030154` e `20260728064500`; TASK-146 non aggiunge SQL.

### Cleanup Asus run 2/3

- Target esatti: 2 prodotti con hash `1d59445b6355a359` e
  `5ed995f27096a32b`, 4 receipt applicate e 4 sync event database-atomic.
- Shop hash: `67545716fda89c02`; un solo shop e due sequenze create/update.
- Prima del cleanup: conflict, price, movement, sale line e revenue target
  tutti `0`; 4 audit mutation immutabili.
- Categoria e fornitore sono condivisi rispettivamente da almeno 867 e 113
  altri prodotti: non eliminati.
- Transazione con lock, fingerprint e cardinalità; flag fixture locale alla
  transazione; delete soltanto tramite array ID esatti; rollback su mismatch.
- Rimossi: prodotti `2`, receipt `4`, sync event `4`; categorie, fornitori,
  price, movement, sales e revenue `0`.
- Dopo: tutti i residui target `0`; audit mutation conservati `4`; audit
  cleanup bounded `1`.
- Conteggi non-target invariati: categorie `55`, fornitori `83`, prodotti
  `19.746`, prezzi `41.158`, movement `14`, sales `14`, revenue `30`,
  sync event `2.027`.
- Asus run 1: non coinvolto.

### Worker staging

- Eseguito esattamente un deploy post-merge.
- Deployment:
  `25d2dd12-e8bd-458d-a985-c94eff7c564f`.
- Version:
  `edd39bb4-3d0c-4f20-b72a-5edec35ec355`, 100% attiva.
- Worker startup: `43 ms`.
- Production: `NOT_MODIFIED`.

### Acceptance server-side

- Run: `T146253DB0D4CE`.
- First login, POS unlock/offline authority: `PASS`.
- Catalog iniziale: 2 pagine, 1 categoria, 1 fornitore, 0 prodotti.
- Catalog finale completo: 4 pagine, 1 categoria, 1 fornitore, 2 prodotti,
  2 prezzi, 0 tombstone.
- Create, update, retail, purchase, stock `+5`, stock `-2`, duplicate,
  deactivate e reactivate: `applied`.
- Dopo ogni mutazione applicata:
  `ACK.authoritativeRevision == catalog.updatedAt` byte-per-byte nel formato
  `YYYY-MM-DDTHH:mm:ss.ffffffZ`.
- Deactivate verificata correttamente con pull delta tombstone; il full refresh
  esclude per contratto i tombstone.
- Stale reale: `failed_conflict`.
- Replay: `duplicate_replay` con ACK originario byte-equivalente.
- Collisione payload: `idempotency_payload_mismatch`.
- DB prima del cleanup: applied receipt `9`, failed-conflict receipt `1`,
  conflict receipt `1`, price `2`, movement `2`, products `2`, sales/revenue
  `0`, mutation audit `11`.
- Audit validato per chiavi JSON, non per substring dei valori:
  chiavi vietate `0`, metadata massimo `524 byte`.
- Nessun HTTP 503, `retryable_upstream` o `exceededResources`.
- Cleanup RPC: categorie `1`, fornitori `1`, prodotti `2`, price `2`,
  movement `2`, receipt `10`, conflict receipt `1`, sync event `13`,
  revision `1`; residui catalogo, business e runtime attivi `0`.
- Audit immutabili dopo cleanup: `12`, incluso l'audit cleanup.

Tre esecuzioni evidence-backed:

1. parser `400` per ordine non canonico delle proprietà usate nel payload
   hash client; cleanup `PASS`;
2. matrice fino a deactivate, poi checker client corretto da full-refresh a
   delta tombstone; cleanup `PASS`;
3. matrice, equality, catalog e conteggi DB tutti `PASS`; il checker locale
   audit ha segnalato un falso positivo sulla parola `price` nel valore enum.
   La verifica DB per chiavi JSON ha confermato `0` chiavi vietate e
   `524 byte` massimi. Nessun quarto run.

Stato storico pre-TASK-148:
`READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`.

## Closeout consolidato 2026-07-30

- Win7POS final acceptance: `PASS`.
- Cleanup exact-ID: 18 prodotti, 28 prezzi, 21 movimenti manuali,
  94 receipt, 4 conflict receipt e 118 sync event.
- Residui sintetici target: `0`.
- Audit immutabile: `PRESERVED`; baseline non-target: `UNCHANGED`.
- Review tecnica piano/transazione e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti: `0`.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Stato: `REVIEW_READY_FOR_USER_CONFIRMED_CLOSURE`, non `DONE`.
