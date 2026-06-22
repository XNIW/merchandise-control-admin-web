# Evidence TASK-079C - History Entry UX, Detail Performance, Editable Generated Screen Parity

## Stato

- Task: `TASK-079C`
- Fase: `REVIEW`
- Data apertura: `2026-06-21`
- Verdict operativo: `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`

## Evidence raccolta

- Lista History Entry:
  - card principali rese piu leggibili con chip `Rows`, `Completed`,
    `Missing`, `Sync`;
  - diagnostica tecnica spostata fuori dalla lettura primaria;
  - filtro mese reso visibile con chip `Selected month`.
- Detail History Entry:
  - header/summary/tabs piu vicini al generated/import supplier screen;
  - tabella righe con colonna No. sticky e filtri `All`, `Missing`,
    `Completed`, `Ignored`;
  - `quantity` e `retail/sale price` editabili solo per
    `shared_sheet_sessions` attive;
  - `purchasePrice` resta read-only.
- Performance Detail:
  - prima: resolving prodotto bounded ma con lookup per riga/codice tramite
    `getShopInventoryProductsPage`, fino a 12 risoluzioni seriali;
  - dopo: `getShopInventoryProductsByCodes` risolve in batch bounded con due
    query `.in(...)` (`barcode`, `item_number`) e un solo access/scope resolve.
- Save generated rows:
  - Route Handler `PATCH /shop/history/detail?entry_id=session:<remote_id>`;
  - validazione numerica server-side con `parseLocalizedNumberText`;
  - `expectedUpdatedAt` opzionale per conflict detection;
  - aggiornamento shop-scoped di `shared_sheet_sessions.data`,
    `payload_version`, `session_overlay.editable[row][0/1]` e `updated_at`;
  - audit redatto e `sync_events` con `domain="history"`,
    `event_type="history_changed"`, `entity_ids.session_ids`;
  - no-op idempotente senza audit/sync duplicati.
- Browser Admin Web:
  - smoke locale Playwright crea fixture sintetica local Supabase, login shop
    owner, apre `/shop/history`, apre Detail, modifica Quantity `4 -> 7` e
    Retail `18.75 -> 21.5`, salva e verifica DB `data[1][4]`,
    `data[1][6]`, `session_overlay.editable[1][0]`,
    `session_overlay.editable[1][1]`.
- Android/iOS:
  - harness local-only `scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs`
    legge fonti Admin Web, Android e iOS e verifica contratto payload v2,
    `session_overlay.editable`, `history_changed` e `session_ids`.

## Check

- `node --test tests/foundation/task-079c-history-generated-edit.test.mjs`
  -> `PASS` 4/4.
- `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs`
  -> `PASS` 5/5.
- `node --test tests/foundation/task-079b-supplier-import-canonical-history.test.mjs`
  -> `PASS` 3/3.
- `node --test tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-079-history-entry-read-only-parity.test.mjs tests/foundation/task-078-product-history-detail-modals.test.mjs tests/foundation/task-079b-supplier-import-canonical-history.test.mjs`
  -> `PASS` 15/15.
- `npm run lint` -> `PASS`.
- `npm run typecheck` -> `PASS`.
- `node scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs`
  -> `PASS`.
- `node scripts/testing/run-playwright-target.mjs local tests/e2e/task-079c-history-generated-edit-local.spec.ts --project=chromium-desktop`
  -> `PASS` 1/1.
- `npm run test:foundation` -> `PASS` 424/424.
- `npm run verify` -> `PASS_WITH_WARNINGS` per warning noti Next.js
  `middleware` deprecato e Node `[DEP0205]`.
- `git diff --check` -> `PASS`.

## Rischi residui

- `TASK-079C` e stato bloccato dalla review utente del 2026-06-21 e non deve
  essere promosso a `DONE`.
- Blocker principali: lista troppo tecnica, source quantity confusa con counted
  quantity, sale price non separato come `RetailPrice` generated, status
  complete/missing non allineato al flag mobile `session_overlay.complete[row]`.
- Il fix e tracciato in `TASK-079D`.
- Lo smoke Android/iOS e source-contract local-only, non un lancio su
  emulator/simulator; valida compatibilita del payload e dei parser/apply helper
  reali dei client.
- Il salvataggio modifica solo `quantity` e `retail/sale price`; toggle
  `complete` resta preservato e non editabile in questo task.
- Le route restano vincolate a schema/tabelle esistenti; nessuna migration/RLS
  e stata introdotta.
