# TASK-079E - History Entry Compact Layout, No Horizontal Scroll, Shared Sync Analysis

## Informazioni generali

- ID: `TASK-079E`
- Titolo: `History Entry Compact Layout, No Horizontal Scroll, Shared Sync Analysis`
- Stato: `REVIEW_READY_FOR_USER_VISUAL_CHECK`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-079E - History Entry Compact Layout, No Horizontal Scroll, Shared Sync Analysis`
- Task base: `TASK-079D`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-079E/README.md`

## Contratto da preservare

- Non cambiare il contratto mobile di `TASK-079D`.
- `quantity` supplier/source resta read-only.
- `purchasePrice` source resta read-only.
- `realQuantity` / `session_overlay.editable[row][0]` resta la quantita contata
  editabile.
- `RetailPrice` / `session_overlay.editable[row][1]` resta il sale price
  editabile.
- `session_overlay.complete[row]` resta il flag autoritativo di completamento.
- Il salvataggio Admin Web non deve sovrascrivere `quantity`, `purchasePrice`,
  barcode, item/product o valori source.

## Scopo

- Rendere la lista History Entry piu compatta e meno alta, mantenendo metriche
  business mobile-like.
- Rimuovere lo scroll orizzontale dal Detail desktop.
- Rendere la tabella Detail compact con una riga prodotto leggibile senza
  `min-width` forzata: `No.`, `Product`, `Supplier Qty`, `Purchase`,
  `Counted Qty`, `Sale Price`, `Status`, `Product detail`.
- Mantenere header grouped `Recognized from file` e `Import values`.
- Mostrare chiaramente source cells read-only e input generated compatti.
- Aggiungere un pannello riusabile di analisi Sync/Import usato sia da History
  Detail sia da Products -> Import Supplier Excel dopo Apply/Sync.
- Usare solo dati reali gia disponibili; dove un dato non esiste mostrare
  `Not available`.

## Non incluso

- Nessuna nuova dependency.
- Nessuna migration, tabella, colonna, RPC o policy.
- Nessuna nuova query N+1 o full catalog load.
- Nessun service role o secret lato client/browser.
- Nessun commit, stage, push, deploy, production apply o Supabase apply.
- Nessuna chiusura `DONE`: Codex prepara handoff verso review.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | TASK-079E tracciato in Master Plan, task file ed evidence. | Docs | `PASS` |
| CA-02 | Lista History Entry piu compatta, con metriche business e senza ritorno a card tecniche. | Static/browser | `PASS` |
| CA-03 | Detail desktop non genera scroll orizzontale nella tabella rows e mantiene header grouped. | Static/browser | `PASS` |
| CA-04 | Semantica mobile preservata: Supplier Qty/Purchase read-only, Counted Qty/Sale Price/Status editabili via overlay generated. | Static/e2e | `PASS` |
| CA-05 | Sync/Import Analysis condivisa tra History Detail e Supplier Apply, con `Not available` per dati assenti e link History Entry dove disponibile. | Static/browser | `PASS` |
| CA-06 | Nessuna query/performance regression: il pannello usa dati read model/apply result gia bounded. | Code review/static | `PASS` |
| CA-07 | Gate mirati 079-079E e browser locale eseguiti con risultati reali o motivazioni `NOT_RUN`/`BLOCKED`. | Comandi reali | `PARTIAL_PASS_WITH_EXTERNAL_BLOCKERS` |

## Handoff REVIEW

Stato operativo finale: `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.

Implementato:

- Lista History Entry resa piu compatta con card meno alte e metriche business
  in tile piccoli: `Items`, `Total quantity`, `Order`, `Paid`, `Missing`.
- Detail generated senza `min-w-[82rem]`: tabella `table-fixed`, frame
  `overflow-y-auto overflow-x-hidden`, source cells read-only e input generated
  compatti.
- Header grouped preservati: `Recognized from file` per `Supplier Qty` e
  `Purchase`; `Import values` per `Counted Qty`, `Sale Price`, `Status`.
- Aggiunto `SyncAnalysisPanel` condiviso con mapper per History Detail e
  Supplier Apply; usa solo read model/apply result gia disponibili e mostra
  `Not available` quando un campo non esiste.
- History Detail espone tab dedicata `Sync analysis`; Products -> Import
  Supplier mostra lo stesso pannello dopo Apply con link `Open History Entry`.
- Contratto mobile di 079D preservato: source `quantity` e `purchasePrice`
  restano read-only; generated `realQuantity`, `RetailPrice` e
  `session_overlay.complete` restano i soli campi editabili/salvati.

File principali toccati:

- `src/app/shop/_components/HistoryEntriesClientList.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/SyncAnalysisPanel.tsx`
- `src/i18n/dictionaries.ts`
- `tests/foundation/task-079e-history-compact-sync-analysis.test.mjs`
- `tests/e2e/task-079c-history-generated-edit-local.spec.ts`
- `tests/e2e/task-060-supplier-excel-preview.spec.ts`

Rischi residui:

- Serve review visuale utente sugli screenshot/viewport mobile-like.
- Gate globali non tutti verdi per failure fuori scope 079E:
  `security:scan` e `verify` si fermano su direct Supabase mutation in
  `src/server/shop-admin/catalog-mutations.ts`; `test:foundation` resta
  434/437 per `TASK-015 catalog CRUD`, Win7POS sibling guardrail e
  `TASK-032 category and supplier lists`.
- Warning non bloccanti di build/test: Next.js segnala convenzione
  `middleware` deprecata e Node segnala `[DEP0205] module.register`.

## Handoff atteso

Stato finale atteso: `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.

L'handoff deve includere file toccati, criteri, evidence, rischi residui,
check reali e prossima fase.
