# TASK-079 Evidence - History Entry and Catalog Pagination Unified Completion

## Stato

- Task canonico: `TASK-079`
- Stato operativo: `REVIEW_READY_FOR_USER_VISUAL_CHECK`
- Fase: `REVIEW`
- File task canonico: `docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md`
- Legacy task files: `docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/`
- Legacy evidence: `docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/`
- Browser evidence finale: `docs/TASKS/EVIDENCE/TASK-079/browser/`
- Nota governance: gli ex `TASK-079B`, `TASK-079C`, `TASK-079D`,
  `TASK-079E`, `TASK-079F` e `TASK-080` sono sottosezioni storiche del solo
  `TASK-079`; non esistono piu come task root correnti.

## 079.1 History Entry read-only mobile parity

- Source title/date/summary resi user-facing e coerenti con mobile.
- Detail read-only iniziale preservato: source quantity, purchase e sale price
  non vengono sovrascritti da diagnostica quando gia presenti.
- Diagnostica tecnica resta secondaria.
- Legacy file: `legacy-task-files/TASK-079-history-entry-read-only-mobile-parity.md`.

## 079.2 Supplier Import to canonical History Entry

- Supplier Apply crea/aggiorna una History Entry canonica in
  `shared_sheet_sessions`.
- Preview supplier resta side-effect free.
- Payload mobile-compatible: `payload_version = 2`, `overlay_schema = 1`,
  `remote_id` deterministico e lowercase UUID.
- Legacy file:
  `legacy-task-files/TASK-079B-supplier-import-canonical-history-mobile-sync.md`.
- Legacy evidence: `legacy-evidence/TASK-079B/README.md`.

## 079.3 Editable generated Detail

- Detail generated consente modifica solo di `realQuantity`, `RetailPrice` e
  complete overlay.
- Source `quantity`, `purchasePrice` e colonne prodotto restano read-only.
- Save server-side aggiorna `shared_sheet_sessions.data`, overlay, audit e
  `sync_events.history_changed`.
- Legacy file:
  `legacy-task-files/TASK-079C-history-entry-ux-detail-performance-editable-generated-screen.md`.
- Legacy evidence: `legacy-evidence/TASK-079C/README.md`.

## 079.4 Mobile semantics

- Separata la quantita supplier/source dalla quantita contata utente.
- Separato il prezzo acquisto source dal prezzo vendita generated.
- Status/complete segue semantica mobile verificata.
- Legacy file:
  `legacy-task-files/TASK-079D-history-entry-review-fix-mobile-semantics-counted-quantity-sale-price-ios-ui.md`.
- Legacy evidence: `legacy-evidence/TASK-079D/README.md`.

## 079.5 Compact layout, no horizontal scroll, shared sync analysis

- Lista History compatta in stile mobile.
- Detail rows table senza scroll orizzontale in desktop normale.
- Scroll verticale interno per dataset lunghi.
- `SyncAnalysisPanel` condiviso tra History Detail e Products Import Apply.
- Legacy file:
  `legacy-task-files/TASK-079E-history-entry-compact-layout-no-horizontal-scroll-shared-sync-analysis.md`.
- Legacy evidence: `legacy-evidence/TASK-079E/README.md`.

## 079.6 Row colors, vertical scroll, product price context

- Complete: counted qty >= supplier qty, riga verde.
- Partial: counted qty > 0 e inferiore alla supplier qty, riga amber.
- Counted qty vuota o `0`: riga neutra/bianca.
- Prodotto non risolto: riga neutra/bianca.
- Vecchi prezzi acquisto/vendita mostrati solo quando disponibili e diversi.
- Legacy file:
  `legacy-task-files/TASK-079F-history-entry-row-state-colors-vertical-scroll-product-price-context.md`.
- Legacy evidence: `legacy-evidence/TASK-079F/README.md`.

## 079.7 History Entry pagination

- `/shop/history` usa `page`, `pageSize`, `q/query`, `month`, `status` e
  `shop_id`.
- Filtri e search sono applicati server-side prima di `.range(...)`.
- `page=2` e pagine out-of-range mostrano risultati o empty state coerente:
  non mostrano `Read blocked` quando la sorgente e leggibile.
- Il fallback `Read blocked` resta limitato a pagina 1 senza filtri attivi e
  senza righe diagnostiche leggibili.

## 079.8 Categories pagination

- `/shop/categories` usa default 10 righe, search `q/query`, filtro `state`,
  `page`, `pageSize` e `shop_id`.
- Search/state sono applicati server-side prima di `.range(...)`.
- UI compatta con linked products bounded sulla pagina corrente.

## 079.9 Suppliers pagination

- `/shop/suppliers` usa default 10 righe, search `q/query`, filtro `state`,
  `page`, `pageSize` e `shop_id`.
- Search/state sono applicati server-side prima di `.range(...)`.
- Products e Import Supplier Wizard continuano a usare options complete
  separate dal read model paginato.
- Legacy file:
  `legacy-task-files/TASK-080-categories-suppliers-pagination-search-ui-polish.md`.
- Legacy evidence: `legacy-evidence/TASK-080/README.md`.

## Final checks

- `node --test tests/foundation/task-079-history-entry-read-only-parity.test.mjs tests/foundation/task-079b-supplier-import-canonical-history.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-079d-history-mobile-semantics.test.mjs tests/foundation/task-079e-history-compact-sync-analysis.test.mjs tests/foundation/task-079f-history-row-state-colors.test.mjs tests/foundation/task-080-categories-suppliers-pagination.test.mjs tests/foundation/task-079-catalog-pagination-unified.test.mjs`:
  `PASS` 32/32.
- `node --test ... task-028 ... + TASK-079 mirati`: `PASS` 38/38.
- `npm run lint`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run build`: `PASS_WITH_WARNINGS` per warning noti Next.js
  `middleware` deprecato e Node `[DEP0205]`.
- `node scripts/testing/task-079d-mobile-history-generated-contract-smoke.mjs`:
  `PASS`.
- `node scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs`:
  `PASS`.
- Playwright local Catalog:
  `PASS` 1/1 con `--grep "TASK-079 catalog"`.
- Playwright local History:
  `PASS` 1/1 con verifica `Counted Qty = 0` neutro/unresolved.
- `git diff --check`: `PASS`.
- `npm run security:scan`: `FAIL_EXTERNAL` su
  `src/server/shop-admin/catalog-mutations.ts` per guardrail direct Supabase
  mutation/select-star.
- `npm run verify`: `FAIL_EXTERNAL` per lo stesso `security:scan`.
- `npm run test:foundation`: `FAIL_EXTERNAL` 2 fail residui, entrambi derivati
  dal guardrail storico `catalog-mutations.ts`/`security:scan`.

## Browser evidence

- `browser/browser-categories-pagination-search.png`
- `browser/browser-suppliers-pagination-search.png`
- `browser/browser-products-import-supplier-dialog-smoke.png`
- `browser/browser-history-list-desktop.png`
- `browser/browser-history-list-compact-desktop.png`
- `browser/browser-history-list-missing-red-desktop.png`
- `browser/browser-history-detail-scrolled-bottom-desktop.png`
- `browser/browser-history-detail-row-colors-desktop.png`
- `browser/browser-history-detail-saved-desktop.png`
- `browser/browser-history-detail-no-horizontal-scroll-desktop.png`
- `browser/browser-history-detail-saved-no-horizontal-scroll-desktop.png`
- `browser/browser-history-detail-sync-analysis-desktop.png`

## Rischi residui

- Serve review visuale utente sugli screenshot finali.
- `security:scan`, `verify` e `test:foundation` restano bloccati dal guardrail
  storico su `src/server/shop-admin/catalog-mutations.ts`.
- Category/Supplier restore resta follow-up: non esiste ancora una boundary
  restore audited dedicata per queste entita.
