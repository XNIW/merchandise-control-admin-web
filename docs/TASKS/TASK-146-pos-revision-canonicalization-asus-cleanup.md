# TASK-146 - Canonical POS revision timestamps and Asus cleanup

## Informazioni generali

- ID: `TASK-146`
- Stato: `DONE`
- Fase attuale: `DONE / USER_CONFIRMED_CLOSURE`
- Responsabile attuale: `USER / CONFIRMED CLOSURE`
- Risoluzione finale: `USER_CONFIRMED_CLOSURE`
- Data apertura: `2026-07-28`
- Branch: `codex/admin-pos-revision-canonicalization-20260728`
- Baseline Admin: `86713586106dc1e50bc5d846a24a257f521fc109`
- Baseline Win7POS read-only:
  `b6391781c08490fcd99f4d98e3affba2e4aa38a6`
- Evidence: `docs/TASKS/EVIDENCE/TASK-146/README.md`

## Obiettivo

Rendere byte-identiche la revisione prodotto restituita dall'ACK
`pos-article-mutation-v1` e `catalog.products[].updatedAt`, preservando i sei
microsecondi e il suffisso canonico `Z`. Completare cleanup esatto dei run Asus
parziali, delivery GitHub, unico deploy Worker staging e acceptance
server-side.

## Scope

- helper server-side O(n), senza dipendenze e senza ricostruzione tramite
  `Date`;
- canonicalizzazione al solo public response boundary di product/category/
  supplier, inclusi tombstone;
- errore tipizzato e audit bounded per timestamp non canonizzabile;
- fixture e test round-trip ACK/catalog;
- review indipendente, PR non-draft, CI e merge normale;
- cleanup transazionale dei soli residui sintetici Asus run 2/3;
- un solo deploy Worker staging post-merge;
- acceptance staging completa e cleanup nel `finally`;
- handoff finale Asus.

## Fuori scope

- Win7POS, Android e iOS;
- production;
- migration DB salvo necessità dimostrata;
- formato timestamp legacy price history;
- rappresentazione interna dei cursori catalogo;
- dati catalogo reali non sintetici.

## Criteri di accettazione

1. Output pubblico `YYYY-MM-DDTHH:mm:ss.ffffffZ`.
2. Microsecondi preservati senza arrotondamento.
3. Input UTC `Z`, `+00:00`, `+0000` con 0-6 cifre accettati.
4. Precisione >6, offset non-zero e date invalide rifiutati.
5. Product/category/supplier e relativi tombstone canonici.
6. Price history e cursori invariati.
7. Invalid timestamp fail-closed con
   `catalog_revision_timestamp_invalid`, senza raw value nei log.
8. ACK e successivo product pull byte-identici per tutte le mutation kind.
9. Stale revision realmente diversa resta conflitto.
10. Regressioni TASK-139/141/142/143/144/145 e Worker safety verdi.
11. Review finale `P0/P1/P2 = 0`.
12. Cleanup Asus 2/3 e acceptance con residui sintetici zero.
13. Un solo deploy Worker staging post-merge; production non modificata.
14. Handoff finale a `REVIEW_READY`, mai `DONE`.

## Evidence iniziale

- Admin e Win7POS GitHub main coincidono con le baseline richieste.
- PR Win7POS `#52`, `#53`, `#54`: `MERGED`.
- Admin checkout pulito; Win7POS dirty preservato e non modificato.
- Riproduzione staging read-only su entrambi i run:
  ACK `Z`, Data API/catalog `+00:00`, sei cifre, stesso istante, byte diversi.
- Root cause confermata in `catalog-pull.ts`: inoltro diretto di
  `row.updated_at`; RPC TASK-145 già canonica.
- Migration: non necessaria per il fix applicativo.

## Implementazione

- Helper: `src/server/pos-auth/pos-revision-timestamp.ts`.
- Il parser valida calendario e ora senza costruire l'output con `Date`.
- Output canonico a sei microsecondi per active/tombstone product, category e
  supplier.
- Il timestamp raw rimane nella keyset del cursore; price history invariata.
- Il boundary non canonizzabile restituisce
  `catalog_revision_timestamp_invalid`, HTTP 500, root
  `catalog_response_invalid` e audit bounded privo del valore raw.
- Fixture:
  `contracts/pos/catalog-product-canonical-revision.response.json`.

## Check pre-review

- `git diff --check`: `PASS`.
- focused TASK-143/TASK-146: `23/23 PASS`.
- regressioni TASK-139/141/142/143/144/145/146: `54/54 PASS`, zero skip.
- `npm run typecheck`: `PASS`.
- `npm run test:foundation`: `PASS`, con Win7POS detached `b6391781`.
- `npm run security:scan`: `PASS`.
- `npm run verify`: `PASS`.
- `npm run cf:build`: `PASS`.
- `npm run test:cloudflare:local`: `PASS`.
- Bundle server function: `+1.650 byte` su `9.391.899` baseline
  (circa `+0,018%`); nessun import della policy di scrittura.
- Reset Supabase, pgTAP e SQL lint: `NOT_RUN_NOT_APPLICABLE`; nessuna migration,
  RPC o SQL modificata.

## Review indipendente

- Feature SHA congelata:
  `83e71b912a6c27bdc5a2a3e4e6d93d86a776fc12`.
- Baseline:
  `86713586106dc1e50bc5d846a24a257f521fc109`.
- Verdict: `ZERO-GATE PASS`.
- Finding: `P0/P1/P2/P3 = 0/0/0/0`.
- Reviewer read-only; nessun file modificato.

## Delivery e staging

- PR non-draft `#51`, CI Verify, migration audit e Cloudflare build:
  `PASS`; deploy automatici PR correttamente `SKIPPED`.
- Feature SHA:
  `83e71b912a6c27bdc5a2a3e4e6d93d86a776fc12`.
- Head PR:
  `9dafba0ba47355ad5145b4ab6c7a04725acead4a`.
- Merge normale:
  `4bccbb793391829c2867a27f6a8033224cdeca7e`.
- Migration repository/staging:
  `20260728030154`, `20260728064500`; parity `PASS`, nessuna migration TASK-146.
- Unico deploy Worker staging post-merge:
  deployment `25d2dd12-e8bd-458d-a985-c94eff7c564f`, version
  `edd39bb4-3d0c-4f20-b72a-5edec35ec355`, startup `43 ms`.

## Cleanup Asus e acceptance

- Asus run 2/3: 2 prodotti, 4 receipt e 4 sync event rimossi tramite array di
  ID esatti in transazione guardata; categorie e fornitori condivisi non
  eliminati. Price/movement/sales/revenue target: `0`; 4 audit mutation
  immutabili preservati; residui target `0`.
- Acceptance staging: `T146253DB0D4CE`.
- First login/offline authority: `PASS`.
- Catalog iniziale completo: 2 pagine; finale: 4 pagine, 1 categoria,
  1 fornitore, 2 prodotti, 2 prezzi, 0 tombstone.
- ACK/catalog byte equality canonica: `PASS` per tutte le mutazioni applicate.
- Matrice: 9 applied, stale reale `failed_conflict`, replay
  `duplicate_replay`, mismatch `idempotency_payload_mismatch`.
- DB proof: 2 price history, 2 stock movement, sales/revenue `0`.
- Audit: 11 mutation audit prima del cleanup, nessuna chiave vietata, massimo
  `524 byte`.
- Cleanup acceptance: 1 categoria, 1 fornitore, 2 prodotti, 2 prezzi,
  2 movement, 10 receipt, 1 conflict receipt, 13 sync event e 1 revision
  rimossi; residui catalogo/business/runtime attivi `0`; audit preservati.
- Nessun HTTP 503 o `exceededResources`.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Stato operativo storico pre-TASK-148:
  `READY_FOR_ASUS_FINAL_ARTICLE_SYNC_ACCEPTANCE`.

## Closeout finale article-sync 2026-07-30

- Win7POS final acceptance e cleanup consolidato staging: `PASS`.
- Cleanup exact-ID: 18 prodotti, 28 prezzi, 21 movimenti manuali,
  94 receipt, 4 conflict receipt e 118 sync event.
- Residui sintetici target: `0`; audit immutabile: `PRESERVED`.
- Invarianti non-target: `UNCHANGED`.
- Review tecnica piano/transazione e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti dal closeout: `0`.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Conferma esplicita finale dell'utente: `RECEIVED`.
- Stato governance: `DONE / USER_CONFIRMED_CLOSURE`.
