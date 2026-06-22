# Evidence TASK-079D - History Entry Review Fix

## Stato

- Task: `TASK-079D`
- Fase: `REVIEW`
- Data apertura: `2026-06-21`
- Verdict operativo: `REVIEW_WITH_USER_VISUAL_CHECK_REQUIRED`

## Contratto Android/iOS verificato prima del codice

- Android `ExcelViewModel.kt` costruisce il grid generated aggiungendo
  `oldPurchasePrice`, `oldRetailPrice`, `realQuantity`, `RetailPrice`,
  `complete`; crea `editable[row] = ["", ""]` e `complete[row] = false`.
- Android `GeneratedScreen.kt` modifica `editable[row][0]` per
  `realQuantity`, `editable[row][1]` per `retailPrice`/sale price, e salva
  `completeStates[row]`.
- Android `InventoryRepository.kt` calcola `orderTotal` da `quantity *
  purchasePrice`; `missingItems` deriva dai flag `complete`; `paymentTotal` usa
  solo righe complete e quantita contata quando presente.
- Android `OrderQuantitySummary.kt` calcola `totalQuantity` sommando la colonna
  source `quantity`, non la quantita contata.
- iOS `GeneratedView.swift` documenta e implementa `realQuantity ->
  editable[row][0]`, `RetailPrice -> editable[row][1]`, `complete ->
  complete[row]`; `saveChanges()` mergea questi valori in `data` senza
  sovrascrivere la source quantity o purchase.
- iOS `HistoryEntryRuntimeSummary.swift` calcola `orderTotal`/`totalQuantity`
  da source qty e `purchasePrice`, e `missingItems` dai flag complete.
- iOS `HistoryView.swift` mostra card con supplier/category e metriche business
  `Items`, `Total Quantity`, `Order`, `Paid`, `Missing`.

## Evidence raccolta

- Source review Android/iOS completata su:
  - Android `ExcelViewModel.kt`, `GeneratedScreen.kt`,
    `InventoryRepository.kt`, `OrderQuantitySummary.kt`.
  - iOS `GeneratedView.swift`, `HistoryEntryRuntimeSummary.swift`,
    `HistoryView.swift`, `HistoryImportedGridSupport.swift`.
- Contratto supplier import Admin Web aggiornato:
  `SUPPLIER_IMPORT_HISTORY_HEADERS` include `realQuantity`, `RetailPrice`,
  `complete`; `sessionOverlay.complete` parte tutto `false`.
- Contratto save generated Admin Web aggiornato:
  `applyGeneratedRowPatches` garantisce colonne `realQuantity`, `RetailPrice`,
  `complete`, scrive `editable[row][0]`, `editable[row][1]`,
  `complete[row]`, e non sovrascrive `quantity`/`purchasePrice`.
- UI list aggiornata a card business mobile-like con supplier title,
  category/source context, `Summary`, `Total quantity`, `Order`, `Paid`,
  `Missing products`.
- UI detail aggiornata a tabella grouped in stile supplier preview:
  `Recognized from file` per `Supplier Qty`/`Purchase`, `Import values` per
  `Counted Qty`/`Sale Price`/`Status`.
- Screenshot browser locale:
  - `docs/TASKS/EVIDENCE/TASK-079D/browser-history-list-desktop.png`
  - `docs/TASKS/EVIDENCE/TASK-079D/browser-history-detail-saved-desktop.png`

## Check

- `node --test tests/foundation/task-079d-history-mobile-semantics.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-079b-supplier-import-canonical-history.test.mjs tests/foundation/task-079-history-entry-read-only-parity.test.mjs`
  - `PASS` 14/14.
- `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs`
  - `PASS` 5/5.
- `node scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs`
  - `PASS`.
- `node scripts/testing/task-079d-mobile-history-generated-contract-smoke.mjs`
  - `PASS`.
- `npm run typecheck`
  - `PASS` (`next typegen && tsc --noEmit`).
- `npm run lint`
  - `FAIL_EXTERNAL_SCOPE`: lint si ferma su
    `src/app/shop/products/_components/ProductSearchCombobox.tsx:65`
    (`react-hooks/set-state-in-effect`) e mostra warning in
    `src/server/shop-admin/catalog-mutations.ts`. Questi file sono fuori scope
    TASK-079D e non sono stati corretti per evitare scope creep.
- `npm run security:scan`
  - `PASS` (`Security scan passed.`).
- `npm run build`
  - `PASS_WITH_WARNINGS`: warning noti Next `middleware` deprecato e Node
    `[DEP0205] module.register`.
- `git diff --check`
  - `PASS`.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3056 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3056" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-079c-history-generated-edit-local.spec.ts --project=chromium-desktop`
  - `PASS` 1/1, con verifica DB locale: source `quantity` e `purchasePrice`
    preservati, generated `realQuantity`, `RetailPrice`, `complete`,
    `editable[0]`, `editable[1]` e `overlay.complete` aggiornati.
- `npm run test:foundation`
  - `PARTIAL_FAIL_EXTERNAL_SCOPE`: `tests 428`, `pass 426`, `fail 2`.
    Failure residui fuori scope:
    `TASK-032 category and supplier lists expose ids required by action forms`
    e `TASK-068M products page renders catalog rows instead of a wide technical table`.
- `npm run verify`
  - `FAIL_EXTERNAL_SCOPE`: si ferma a `npm run lint` sul blocker Products
    `ProductSearchCombobox.tsx:65`.

## Rischi residui

- Serve review visuale utente: lo stato resta
  `REVIEW_WITH_USER_VISUAL_CHECK_REQUIRED`, non `DONE`.
- Gate globali residui fuori scope:
  - `npm run lint` / `npm run verify` bloccati da
    `src/app/shop/products/_components/ProductSearchCombobox.tsx`.
  - `npm run test:foundation` resta 426/428 per due guardrail Products/Catalog
    preesistenti rispetto allo scope 079D.
- Warning non bloccanti noti:
  - Next.js segnala deprecazione convenzione `middleware` verso `proxy`.
  - Node segnala `[DEP0205] module.register`.
- Nessun commit, stage, push, deploy, migration, production apply o Supabase
  apply eseguito.
