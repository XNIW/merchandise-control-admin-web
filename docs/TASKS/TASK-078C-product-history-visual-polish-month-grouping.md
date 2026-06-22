# TASK-078C - Product Detail visual polish and History Entries month-grouped UX

## Informazioni generali

- ID: `TASK-078C`
- Titolo: `Product Detail visual polish and History Entries month-grouped UX`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Data apertura: `2026-06-20`
- Origine: brief utente allegato `TASK-078C - Product Detail visual polish and History Entries month-grouped UX`
- Task base: `TASK-078` / `TASK-078B`
- Evidence: `docs/TASKS/EVIDENCE/TASK-078C/README.md`

## Contesto

`TASK-078` e `TASK-078B` hanno introdotto i modal lazy per Product Detail e
History Entry Detail. Questo follow-up alza la qualita visuale e operativa:
Product Detail deve sembrare una scheda gestionale, History Entries deve
assomigliare di piu alla cronologia mobile con grouping per mese, filtri
client-side sulle righe visibili e Detail on-demand.

Vincolo chiave: non reintrodurre il full read model nel primo render. Products
e History devono restare light; dettagli prodotto, price history, righe import,
missing/errors, linked products e diagnostics si caricano solo quando l'utente
apre il modal.

## Scope

- Product Detail Modal con header iconato, chip barcode/item code copiabili,
  summary cards, sezioni Overview piu gerarchiche, Prices come timeline/card,
  Inventory/Sync con copy owner-friendly e Advanced collassato.
- Product Edit nello stesso modal con gruppi Identity, Classification,
  Pricing/stock e Save/Cancel nel flusso edit.
- Product list con subtitle supplier/category e griglia corretta per mantenere
  visibili `Detail`, `Edit` e `Archive`.
- History Entries list spostata in client component con search, filtro periodo,
  filtro status, default `Active + issues`, grouping mese e nota unica sul
  fatto che righe/diagnostics caricano da Detail.
- History Entry Detail Modal iconato, summary piu leggibile, source separato
  da device, rows table coerente con file Excel e product shortcut.
- Preview History header-aware per colonne `No.`, `Item code`, `Barcode`,
  `Product`, `Quantity`, `Purchase`, `Retail`.
- i18n per nuove label exact IT/ES/ZH senza tradurre valori business.
- Visual QA locale obbligatoria con fixture sintetica.

## Non incluso

- Nessuna nuova dipendenza.
- Nessun cambio schema, migration, RLS, RPC o policy Supabase.
- Nessun cambio Android/iOS/POS/Win7POS o sync runtime.
- Nessun deploy, commit, push o stage.
- Nessun dato reale o secret in screenshot/evidence.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Product Detail ha gerarchia visuale iconata e resta lazy/no-store. | `PASS` |
| CA-02 | Product Edit resta nello stesso modal con gruppi chiari e azioni edit dedicate. | `PASS` |
| CA-03 | Product list mantiene Detail/Edit/Archive visibili senza full detail nel primo render. | `PASS` |
| CA-04 | History list ha filtri client-side, default Active + issues e grouping per mese. | `PASS` |
| CA-05 | History Entry Detail mostra rows/missing/linked/sync con diagnostics collassati. | `PASS` |
| CA-06 | Righe Excel header/metadata non appaiono come prodotti normali nella vista principale. | `PASS` |
| CA-07 | Visual QA autenticata locale con fixture sintetica e screenshot evidence. | `PASS` |
| CA-08 | Check reali eseguiti e documentati. | `PASS` |

## Fonti lette

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-078-admin-console-product-history-detail-modals.md`
- `docs/TASKS/TASK-078B-product-history-detail-modal-ui-polish.md`
- `docs/TASKS/EVIDENCE/TASK-078/README.md`
- `docs/TASKS/EVIDENCE/TASK-078B/README.md`
- `src/app/shop/_components/ProductDetailModalController.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/server/shop-admin/detail-modal-read-model.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/i18n/dictionaries.ts`

## Implementazione

- Product modal: icone locali senza nuove dipendenze, copy chip, sezioni
  `Product identity`, `Classification`, `Pricing / stock`, `Mobile sync`,
  price cards e raw diagnostics in Advanced.
- Product list: subtitle supplier/category nella identity area e griglia
  desktop piu compatta per evitare overflow delle azioni.
- History list: nuovo `HistoryEntriesClientList` client-side senza fetch; usa
  solo le righe gia visibili del read model light.
- History detail: tab e summary iconati, celle mancanti con `—`, header row in
  filtro `Ignored`, linked product shortcut risolto da barcode/item code.
- History read model: preview bounded header-aware per non perdere item code,
  quantity, purchase e retail quando il payload contiene intestazioni Excel.
- Test statici aggiornati al nuovo contratto client list/month grouping e alle
  nuove guardrail visual/performance.

## Final Review / DONE Reconciliation

Verdict operativo: `DONE_RECONCILED`.

Il task e stato rivisto insieme a `TASK-078` e `TASK-078B`. La guardrail
prestazionale resta attiva: `/shop/products` usa
`getShopInventoryProductsPage` con `includeExactTotals: false`;
`/shop/history` usa `getShopHistoryListReadModel` senza summary exact nel
first render; Product/History detail continuano a passare dai route handler
lazy/no-store.

Problemi trovati e corretti durante la review finale:

- mancavano label i18n per alcune stringhe History list/detail: aggiunte in
  `en`, `it`, `es`, `zh-CN`;
- il read model light History list aveva reintrodotto `loadHistorySummary`:
  rimosso e sostituito con summary derivata dalle righe visibili;
- lo smoke locale aspettava ancora la vecchia copia `11+`: aggiornato a
  `at least 11`;
- il summary `Source` della History detail poteva diventare troppo alto con
  supplier/category lunghi: reso compatto e clampato.
- il guardrail statico TASK-054 era fossilizzato sugli ultimi task chiusi
  precedenti: aggiornato per includere `TASK-078C`.

Check finali: visual Playwright locale `PASS`, `test:shop:local` PASS 5/5,
`test:foundation` `PASS` 414/414, targeted TASK-078 `PASS` 5/5, targeted
History sync console `PASS` 6/6, targeted Product list readability `PASS` 6/6,
targeted i18n TASK-062/TASK-068 `PASS`, `security:scan` PASS, `typecheck`
PASS, `lint` PASS, `build` e `verify` `PASS_WITH_WARNINGS` per warning noti
Next `middleware` deprecato e Node `DEP0205`, `git diff --check` PASS.

Fixture visuale sintetica `TASK078C_*`: cleanup verificato dal `finally` dello
spec Playwright e da conteggio locale redatto post-run. Il controllo finale ha
riportato zero residui per profili, shop, supplier/category/product, price
notes, shared sheet sessions, sync events e auth users con prefisso TASK078C.
Nessun dato reale o sensibile salvato in evidence.

Nessun commit, stage, push, deploy, production apply o Supabase apply eseguito.
