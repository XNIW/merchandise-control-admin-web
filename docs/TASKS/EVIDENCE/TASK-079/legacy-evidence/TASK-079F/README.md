# Evidence TASK-079F - History Entry Row State Colors, Vertical Scroll, Product Price Context

## Stato

- Stato operativo: `REVIEW_READY_FOR_USER_VISUAL_CHECK`
- Data: `2026-06-21`
- Task file: `docs/TASKS/TASK-079F-history-entry-row-state-colors-vertical-scroll-product-price-context.md`

## Contratto mobile verificato

| Caso | Regola trovata | Fonte |
|---|---|---|
| Complete row | Completata usa `checkmark.circle.fill` verde su iOS; Android usa stato `isComplete` con accento success/complete. | `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl/GeneratedView.swift`; `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/main/java/com/example/merchandisecontrolsplitview/ui/components/ZoomableExcelGrid.kt` |
| Partial/missing row | Quando la quantita contata e inferiore alla source, iOS espone shortage orange; Android calcola `hasIncompleteQuantity` e usa warning/filled state. | `GeneratedView.swift`; `ZoomableExcelGrid.kt` |
| Unresolved product row | Nessuna colorazione prodotto non risolto separata nei source letti: resta neutra salvo errore reale. | `GeneratedView.swift`; `GeneratedScreen.kt`; `ZoomableExcelGrid.kt` |
| Counted qty equals supplier qty | iOS imposta complete quando `counted >= supplier`; Android imposta complete quando `countedQty == originalQty` nel flow dialog. | `GeneratedView.swift`; `GeneratedScreen.kt` |
| Counted qty lower than supplier qty | iOS resta incompleta e chiede conferma per forzare complete; Android mantiene warning/incomplete quantity se non complete. | `GeneratedView.swift`; `ZoomableExcelGrid.kt` |
| Counted qty empty | iOS rende incompleta quando il valore e vuoto/non valido; Android non auto-completa senza valore valido. | `GeneratedView.swift`; `GeneratedScreen.kt` |
| Vecchi prezzi | iOS/Android mostrano vecchi prezzi come supporto e nascondono old purchase quando coincide con current; Android applica lo stesso helper anche a old retail. | `GeneratedView.swift`; `GeneratedScreen.kt` |

## Evidence comandi

| Comando | Esito | Note |
|---|---|---|
| `node --test tests/foundation/task-079f-history-row-state-colors.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs` | `PASS 9/9` | Guardrail 079F aggiornati e test governance 079C non piu legati al task attivo transitorio. |
| `node --test tests/foundation/task-079-history-entry-read-only-parity.test.mjs tests/foundation/task-079b-supplier-import-canonical-history.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-079d-history-mobile-semantics.test.mjs tests/foundation/task-079e-history-compact-sync-analysis.test.mjs tests/foundation/task-079f-history-row-state-colors.test.mjs` | `PASS 23/23` | Catena mirata 079-079F; include fix paginazione/filter server-side lista History. |
| `node scripts/testing/task-079d-mobile-history-generated-contract-smoke.mjs` | `PASS` | Smoke source-contract mobile generated. |
| `node scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs` | `PASS` | Smoke source-contract mobile edit. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3060" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-079c-history-generated-edit-local.spec.ts --project=chromium-desktop` | `PASS 1/1` | Fixture locale 62 righe; screenshots 079F; verifica DB overlay/source. |
| `npx eslint src/app/shop/_components/HistoryDetailModalController.tsx src/app/shop/_components/HistoryEntriesClientList.tsx src/server/shop-admin/detail-modal-read-model.ts src/server/shop-admin/history-read-model.ts src/i18n/dictionaries.ts tests/foundation/task-079f-history-row-state-colors.test.mjs tests/e2e/task-079c-history-generated-edit-local.spec.ts` | `PASS` | ESLint scoped sui file 079F. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning noti: Next `middleware` deprecato, Node `[DEP0205]`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `npm run lint` | `PASS` | ESLint completo dopo i fix 079F/080. |
| `npm run security:scan` | `FAIL_EXTERNAL` | Fuori scope: `src/server/shop-admin/catalog-mutations.ts` direct Supabase mutation / select-star guardrail. |
| `npm run test:foundation` | `FAIL_EXTERNAL 2 failing tests` | Fuori scope: TASK-015 catalog CRUD e Win7POS sibling guardrail, entrambi per `catalog-mutations.ts`. |
| `npm run verify` | `FAIL_EXTERNAL` | `lint` e `typecheck` passano; si ferma a `security:scan` su `catalog-mutations.ts`, fuori scope 079F. |

Nota browser: tentativo iniziale su dev server esistente `127.0.0.1:3055` non usato come evidence perche la login era bloccata da env non allineato al runner locale; la verifica PASS e stata eseguita con `next start` isolato su `127.0.0.1:3060`.

## Fix review 2026-06-21

- `/shop/history` ora accetta `page`, `pageSize`, `q`, `month`, `status` e passa i filtri a `getShopHistoryListReadModel`.
- Il read model History applica search/status/month server-side prima di `.range(...)`, espone `pagination` e mantiene fallback legacy bounded.
- `HistoryEntriesClientList` usa form/link URL-driven, mostra pagination top/bottom e conserva i parametri nel Detail href.
- Post TASK-080: la suite mirata 079-079F resta `PASS 23/23`; `npm run lint`, `npm run typecheck` e `npm run build` sono `PASS`/`PASS_WITH_WARNINGS`; `security:scan`, `verify` e `test:foundation` restano bloccati dal guardrail fuori scope `src/server/shop-admin/catalog-mutations.ts`.

## Evidence visuale

- `browser-history-list-missing-red-desktop.png`
- `browser-history-detail-row-colors-desktop.png`
- `browser-history-detail-scrolled-bottom-desktop.png`
- `browser-history-detail-saved-no-horizontal-scroll-desktop.png`

## Rischi residui

- Review visuale utente ancora richiesta.
- Gate globali bloccati da failure esterni al task, elencati sopra.
