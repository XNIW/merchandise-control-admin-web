# TASK-079F - History Entry Row State Colors, Vertical Scroll, Product Price Context

## Informazioni generali

- ID: `TASK-079F`
- Titolo: `History Entry Row State Colors, Vertical Scroll, Product Price Context`
- Stato: `REVIEW_READY_FOR_USER_VISUAL_CHECK`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-079F - History Entry Row State Colors, Vertical Scroll, Product Price Context` e screenshot mobile forniti dall'utente
- Task base: `TASK-079E`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-079F/README.md`

## Contratto mobile verificato da preservare

- `quantity` supplier/source resta read-only.
- `purchasePrice` source resta read-only.
- `realQuantity` / `session_overlay.editable[row][0]` resta la quantita contata editabile.
- `RetailPrice` / `session_overlay.editable[row][1]` resta il sale price editabile.
- `session_overlay.complete[row]` resta il flag salvato di completamento.
- Il salvataggio Admin Web non deve sovrascrivere `quantity`, `purchasePrice`, barcode, item/product o valori source.

## Scopo

- Rendere `Missing products` evidente in rosso nella lista History quando il valore e maggiore di zero.
- Ripristinare lo scroll verticale interno del Detail rows table per entry con almeno 50 righe, mantenendo zero scrollbar orizzontale desktop.
- Colorare l'intera riga del Detail secondo la semantica mobile:
  - completa/soddisfatta: verde chiaro;
  - prodotto risolto ma quantita incompleta/mancante: amber/arancione;
  - prodotto non risolto: neutro/bianco, salvo errore reale.
- Aggiornare live lo stato visivo quando `Counted Qty` cambia:
  - `Counted Qty >= Supplier Qty`: completa/verde;
  - `Counted Qty < Supplier Qty`: incompleta/amber se il prodotto e risolto;
  - `Counted Qty` vuota/non valida: incompleta secondo la logica mobile.
- Mantenere override manuale del checkbox come da mobile, senza rendere editabili i campi source.
- Aggiungere contesto prodotto compatto per riga usando lookup batch esistente:
  - stato prodotto `In catalog` / `No match` / `Archived`;
  - vecchio prezzo acquisto catalogo, se disponibile e diverso dal valore import/source visibile;
  - vecchio prezzo vendita catalogo, se disponibile e diverso dal sale price visibile;
  - stock corrente, se disponibile;
  - totale riga `Counted Qty x Sale Price`, se calcolabile;
  - differenza quantita rispetto alla source qty.

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
| CA-01 | TASK-079F tracciato in Master Plan, task file ed evidence. | Docs | `PASS` |
| CA-02 | Regola colori/complete derivata da source iOS/Android e documentata in evidence. | Source review | `PASS` |
| CA-03 | Lista History mostra label e valore Missing in rosso solo quando > 0. | Static/browser | `PASS` |
| CA-04 | Detail rows ha scroll verticale interno fino all'ultima riga e nessuna scrollbar orizzontale desktop. | Browser | `PASS` |
| CA-05 | Righe intere verde/amber/neutro secondo stato prodotto e quantita. | Static/browser | `PASS` |
| CA-06 | Modifica Counted Qty aggiorna live complete/row color e patch overlay coerente. | E2E | `PASS` |
| CA-07 | Source qty/purchase restano read-only; counted qty/sale price restano editabili e salvano solo generated/import values. | Static/e2e | `PASS` |
| CA-08 | Contesto prodotto compatto mostra stato, vecchi prezzi solo se diversi, stock, totale riga e delta quando disponibili. | Static/browser | `PASS` |
| CA-09 | Gate richiesti eseguiti con risultati reali o motivazioni `NOT_RUN`/`BLOCKED`. | Comandi reali | `PARTIAL_PASS_WITH_EXTERNAL_BLOCKERS` |

## Handoff REVIEW

Stato operativo finale: `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.

Implementato:

- Lista History: `Missing products` usa label e valore rose/red quando il valore e maggiore di zero, senza trasformare tutta la card in errore.
- Detail rows: il limite preview e stato portato da 8 righe totali a 200 righe bounded, cosi entry da 50+ righe mostrano tutti i prodotti disponibili e il frame interno scorre verticalmente.
- Detail table: mantiene `table-fixed` e `overflow-x-hidden`; il browser smoke conferma no horizontal scroll desktop.
- Colori riga intera:
  - `complete`: verde chiaro;
  - `partial`: amber quando il prodotto e risolto ma la quantita e incompleta/mancante;
  - `unresolved`: neutro/bianco quando il prodotto non e risolto;
  - `ignored`: grigio per header row ignorata.
- Complete live: modificare `Counted Qty` imposta subito complete quando `Counted Qty >= Supplier Qty`; vuoto/non valido o inferiore torna incompleto, con checkbox manuale ancora disponibile come override mobile-like.
- Contesto prodotto: stato `In catalog` / `No match` / `Archived`, stock, vecchio acquisto e vecchia vendita mostrati solo quando disponibili e diversi dal valore corrente, delta quantita e totale riga `Counted Qty x Sale Price`.
- Save generated: il Playwright locale verifica che `quantity` e `purchasePrice` source restano invariati e che vengono salvati solo `realQuantity`, `RetailPrice` e `session_overlay.complete`.

File principali toccati:

- `src/app/shop/_components/HistoryEntriesClientList.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/detail-modal-read-model.ts`
- `src/i18n/dictionaries.ts`
- `tests/foundation/task-079f-history-row-state-colors.test.mjs`
- `tests/e2e/task-079c-history-generated-edit-local.spec.ts`
- `tests/foundation/task-079c-history-generated-edit.test.mjs`
- `tests/foundation/task-079e-history-compact-sync-analysis.test.mjs`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/EVIDENCE/TASK-079F/README.md`

Evidence visuale:

- `docs/TASKS/EVIDENCE/TASK-079F/browser-history-list-missing-red-desktop.png`
- `docs/TASKS/EVIDENCE/TASK-079F/browser-history-detail-row-colors-desktop.png`
- `docs/TASKS/EVIDENCE/TASK-079F/browser-history-detail-scrolled-bottom-desktop.png`
- `docs/TASKS/EVIDENCE/TASK-079F/browser-history-detail-saved-no-horizontal-scroll-desktop.png`

Rischi residui:

- Serve review visuale utente sugli screenshot e sul feeling del layout compatto.
- Gate globali non tutti verdi per failure fuori scope 079F:
  `npm run lint` / `npm run verify` bloccati da `src/app/shop/_components/ProductDetailModalController.tsx`;
  `security:scan` bloccato da `src/server/shop-admin/catalog-mutations.ts`;
  `test:foundation` resta 437/441 con failure TASK-015 catalog CRUD, Win7POS sibling guardrail, TASK-032 category/supplier ids e TASK-057 creatable supplier/category UI.

## Handoff atteso

Stato finale: `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.

L'handoff deve includere file toccati, regola colori mobile trovata, correzioni lista/detail, evidence screenshot, check reali, rischi residui e prossima fase.

## Fix riaperto 2026-06-21

Il reviewer History Performance ha rilevato che la lista History era bounded ma non ancora paginata server-side con URL params `page`, `pageSize`, `q`, `month`, `status` e preservazione `shop_id`. Il task torna temporaneamente in `FIX_IN_PROGRESS` prima di procedere con `TASK-080`.

Fix applicato: `/shop/history` legge `page`, `pageSize`, `q`, `month`, `status` e li passa a `getShopHistoryListReadModel`; il read model normalizza filtri/paginazione, applica search/status/month prima di `.range(...)`, espone `pagination`, e la lista usa form/link URL-driven con Detail href che preserva i parametri. Suite 079-079F aggiornata e rieseguita: `PASS 23/23`.

Post-fix: TASK-079F resta `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`, ed e stato mantenuto stabile durante l'esecuzione di TASK-080.
