# TASK-078 - Admin Console Product and History Entry detail modals

## Informazioni generali

- ID: `TASK-078`
- Titolo: `Admin Console Product and History Entry detail modals`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Data apertura: `2026-06-20`
- Origine: brief utente allegato `Titolo: TASK-078 - Admin Console Product and History Entry Detail Modals Contes...`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-078/README.md`

## Contesto

Il brief chiede di portare in primo piano due workflow quotidiani della Shop
Admin Console:

- dettaglio prodotto con view/edit nello stesso modal;
- dettaglio History Entry con riepilogo import/mobile, righe, missing/errori,
  prodotti collegati, sync events e diagnostica redatta.

Vincolo chiave: la pagina `Products` deve restare leggera. I dettagli prodotto,
lo storico prezzi, le righe history e la diagnostica non devono entrare nel
primo render, per non riaprire il problema prestazionale emerso in `TASK-077B`.

## Scope

- Product Detail Dialog wide/admin-panel con header sticky, summary cards,
  tabs, history/sync diagnostics e modal edit inline.
- Product Edit dentro lo stesso modal, usando server action/RPC esistenti.
- History Entry Detail Dialog wide/admin-panel con header sticky, summary
  cards, tabs, row table, missing/errors, prodotti collegati, sync events e raw
  diagnostics collapsed.
- History Entries list piu leggibile in forma card/table ibrida.
- Route handler lazy/no-store per i dettagli.
- Test foundation mirati per proteggere read model leggeri e progressive
  enhancement dei link.

## Non incluso

- Nessun refactor generale di catalog/history.
- Nessuna nuova dipendenza.
- Nessun dato reale, token o secret in repository.
- Nessun service-role key client/browser.
- Nessun deploy, commit, push o stage.
- Nessun cambio Android/iOS/POS.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | `/shop/products` mantiene primo render leggero e non carica detail/history rows/diagnostics. | `PASS` |
| CA-02 | Product Detail Modal carica on-demand, mostra summary, tabs e azioni principali. | `PASS` |
| CA-03 | Product Edit e nello stesso modal con Save/Cancel e server actions esistenti. | `PASS` |
| CA-04 | History Entry Detail Modal carica on-demand righe, missing/errors, prodotti collegati, sync events e diagnostica redatta/collapsed. | `PASS` |
| CA-05 | History Entries list e piu leggibile senza usare il read model pieno nel primo render. | `PASS_WITH_NOTES` |
| CA-06 | Check reali eseguiti o motivati `NOT_RUN`/`BLOCKED`. | `PASS_WITH_WARNINGS` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-077B-products-platform-lightweight-read-models.md`
- `docs/TASKS/TASK-072-cross-platform-catalog-sync-history-entry-write-path.md`
- `docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/03-building-your-application/01-routing/13-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-building-your-application/02-data-fetching/04-data-security.md`
- `node_modules/next/dist/docs/01-app/03-building-your-application/06-optimizing/07-lazy-loading.md`
- `src/app/shop/products/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/app/shop/products/[productId]/page.tsx`
- `src/app/shop/history/[entryId]/page.tsx`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/actions.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`

## Implementazione

- Aggiunto read model server-only dedicato ai modal:
  `src/server/shop-admin/detail-modal-read-model.ts`.
- Aggiunti route handler lazy/no-store:
  `src/app/shop/products/detail/route.ts` e
  `src/app/shop/history/detail/route.ts`.
- Aggiunto Product Detail Modal client con view/edit/archive/restore:
  `src/app/shop/_components/ProductDetailModalController.tsx`.
- Aggiunto History Entry Detail Modal client:
  `src/app/shop/_components/HistoryDetailModalController.tsx`.
- Aggiunte server action inline per update/archive/restore prodotto in
  `src/app/shop/actions.ts`.
- Montati i controller su Products e History con link fallback navigabili e
  trigger `data-*`.
- Aggiornata la History Entries list con layout card/table ibrido; i conteggi
  pesanti restano differiti al Detail.

## Handoff REVIEW

Verdict: `REVIEW`.

I modali sono pronti per revisione funzionale e visiva. La scelta
prestazionale principale e conservativa: Product detail, History rows e raw
diagnostics passano da route handler on-demand e non vengono aggiunti al read
model di primo render della pagina Products.

Check finali: targeted TASK-078 `PASS` 5/5, `typecheck` PASS, `lint` PASS,
`security:scan` PASS, `test:foundation` PASS 414/414, `build` e `verify`
`PASS_WITH_WARNINGS` per warning noti Next `middleware` deprecato e Node
`DEP0205`, `git diff --check` PASS, probe HTTP locale `/shop/products` PASS
su dev server esistente `127.0.0.1:3055`.

## Check

I risultati aggiornati sono in `docs/TASKS/EVIDENCE/TASK-078/README.md`.
