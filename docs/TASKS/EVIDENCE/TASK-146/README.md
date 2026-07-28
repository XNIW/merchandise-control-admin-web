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

## Cleanup, delivery e staging

- In corso.
