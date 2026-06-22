# TASK-079D - History Entry Review Fix: Mobile Semantics, Counted Quantity, Sale Price, iOS-like UI

## Informazioni generali

- ID: `TASK-079D`
- Titolo: `History Entry Review Fix: Mobile Semantics, Counted Quantity, Sale Price, iOS-like UI`
- Stato: `REVIEW_WITH_USER_VISUAL_CHECK_REQUIRED`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-079D - History Entry Review Fix: Mobile Semantics, Counted Quantity, Sale Price, iOS-like UI`
- Task base: `TASK-079`, `TASK-079B`, `TASK-079C`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-079D/README.md`

## Blocco review TASK-079C

`TASK-079C` non puo passare a `DONE`: la review utente ha trovato blocker
semantici reali. In particolare la UI e il salvataggio Admin Web non
separavano in modo affidabile la quantita sorgente del supplier file dalla
quantita contata/generata dall'utente, e non trattavano il sale/retail price
come valore generato modificabile equivalente ad Android/iOS.

## Contratto mobile da rispettare

- Source Excel quantity: colonna `quantity` nel `data` grid. E read-only in
  Admin Web. Android/iOS la usano per `totalQuantity` e per `orderTotal` con
  `purchasePrice`.
- Counted/user quantity: `session_overlay.editable[row][0]`, riflessa nella
  colonna generata `realQuantity` quando presente. Admin Web deve salvarla li e
  non deve sovrascrivere `quantity`.
- Source purchase price: colonna `purchasePrice` nel `data` grid. E read-only.
  Admin Web non deve modificarla quando salva una riga generated.
- User sale/retail price: `session_overlay.editable[row][1]`, riflessa nella
  colonna generata `RetailPrice` quando presente. Admin Web deve salvarla li e
  non deve confonderla con il prezzo sorgente/catalogo `retailPrice`.
- Complete row rule: il flag autoritativo e `session_overlay.complete[row]`.
  Quando esiste la colonna `complete`, iOS la riallinea a `"1"` per complete e
  `""` per missing. Admin Web deve seguire lo stesso modello.
- Missing rule: righe item meno flag `complete === true`, escludendo la header
  row. Product match non rende una riga completa.
- Data update rule: il salvataggio generated aggiorna `realQuantity`,
  `RetailPrice`, `complete`, `session_overlay.editable`, `session_overlay.complete`,
  `updated_at`, audit e `sync_events.history_changed`; preserva `quantity`,
  `purchasePrice`, barcode, product/item e valori sorgente.
- Source files letti: Android `ExcelViewModel.kt`, `GeneratedScreen.kt`,
  `InventoryRepository.kt`, `OrderQuantitySummary.kt`; iOS `GeneratedView.swift`,
  `HistoryEntryRuntimeSummary.swift`, `HistoryView.swift`,
  `HistoryImportedGridSupport.swift`.

## Scopo

- Rendere lista History Entry meno tecnica e piu simile alle card mobile:
  supplier come titolo, category sotto con icona, righe business `Items`,
  `Total quantity`, `Order`, `Paid`, `Missing`, e missing evidenziato.
- Rendere Detail generated semantico: `Supplier Qty`/`Qty from file`,
  `Purchase`, `Counted Qty`/`Import Qty`, `Sale Price`/`Retail Price`, `Status`;
  product/barcode/item restano contesto secondario. La tabella usa gruppi
  stile supplier preview: `Recognized from file` e `Import values`.
- Correggere payload supplier import verso schema generated mobile con
  `realQuantity`, `RetailPrice`, `complete`.
- Correggere save Admin Web per non sovrascrivere source quantity/purchase/source
  retail e per aggiornare overlay editable/complete come mobile.
- Aggiornare test statici, smoke contratto mobile e browser locale in modo che
  falliscano se il vecchio bug torna.

## Non incluso

- Nessun commit, stage, push, deploy, production apply o Supabase apply.
- Nessuna nuova dependency.
- Nessuna tabella, colonna, migration, RLS/RPC nuova.
- Nessun service-role key lato client/browser.
- Nessun secret o dato reale hardcoded.
- Nessuna duplicazione web-only della History Entry.
- Nessuna chiusura `DONE`: Codex prepara solo handoff verso `REVIEW`.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | TASK-079C declassato/bloccato e TASK-079D tracciato in Master Plan/evidence. | Docs | `PASS` |
| CA-02 | Contratto Android/iOS documentato con source qty, counted qty, purchase, sale price, complete, missing e update rule. | Docs/source review | `PASS` |
| CA-03 | Supplier import produce grid generated mobile con `realQuantity`, `RetailPrice`, `complete` e overlay iniziale missing. | Test/unit | `PASS` |
| CA-04 | Detail distingue quantita sorgente, quantita contata, purchase read-only, sale price editable e status. | Test/browser | `PASS` |
| CA-05 | Save aggiorna `realQuantity`, `RetailPrice`, `complete`, overlay editable/complete, audit/sync, senza toccare `quantity` o `purchasePrice`. | Test/unit/browser | `PASS` |
| CA-06 | Lista usa supplier/category e metriche business mobile, senza mini-table tecnica primaria `Rows/Completed/Sync/Overlay OK`. | Test/static/browser | `PASS` |
| CA-07 | Mobile source-contract smoke verifica indici `editable[0]`, `editable[1]`, `complete`, `realQuantity`, `RetailPrice`. | Script | `PASS` |
| CA-08 | Browser locale Playwright copre lista History + Detail edit/save. | E2E local | `PASS` |
| CA-09 | Gate progetto eseguiti con risultati reali o `NOT_RUN`/`BLOCKED` motivati. | Comandi reali | `PARTIAL_PASS_WITH_EXTERNAL_BLOCKERS` |

## Handoff REVIEW

Stato operativo finale: `REVIEW_WITH_USER_VISUAL_CHECK_REQUIRED`, non `DONE`.

Implementato:

- `TASK-079C` declassato a `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`.
- Supplier import canonico allineato al generated mobile:
  `oldPurchasePrice`, `oldRetailPrice`, `realQuantity`, `RetailPrice`,
  `complete`, overlay `editable[row][0/1]` e `complete[row] = false`.
- Save generated Admin Web allineato a mobile: scrive solo valori generati
  `realQuantity`, `RetailPrice`, `complete`, overlay editable/complete,
  `updated_at`, audit e `sync_events.history_changed`; preserva source
  `quantity`, `purchasePrice`, barcode, item/product e dati sorgente.
- Read model/list/detail allineati a metriche mobile: `Items`,
  `Total quantity`, `Order`, `Paid`, `Missing`.
- Detail table ispirata alla supplier preview: gruppi `Recognized from file`
  (`Supplier Qty`, `Purchase`) e `Import values` (`Counted Qty`, `Sale Price`,
  `Status`).
- Browser local Playwright salva evidence visuale desktop per lista e detail.

Rischi residui:

- Richiesta review visuale utente per confermare il match percepito con le UI
  mobile fornite negli screenshot.
- Gate globali non tutti verdi per diff Products/Catalog fuori scope:
  `npm run lint` fallisce su `src/app/shop/products/_components/ProductSearchCombobox.tsx`
  (`react-hooks/set-state-in-effect`) e mostra warning in
  `src/server/shop-admin/catalog-mutations.ts`; `npm run test:foundation`
  resta 426/428 per guardrail TASK-032/TASK-068M su Products/Catalog.
- Warning non bloccanti di build: convenzione Next `middleware` deprecata e
  Node `[DEP0205] module.register`.

## Handoff atteso

Lo stato finale atteso e `REVIEW_WITH_USER_VISUAL_CHECK_REQUIRED`, non `DONE`.
L'handoff deve includere file toccati, criteri, evidence, rischi residui,
check reali e prossima fase.
