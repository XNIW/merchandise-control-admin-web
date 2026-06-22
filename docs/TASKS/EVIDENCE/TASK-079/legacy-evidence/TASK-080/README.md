# TASK-080 Evidence

Stato: `REVIEW_READY_FOR_USER_VISUAL_CHECK`

Questo file raccoglie evidence e risultati reali per `TASK-080 - Categories/Suppliers Pagination, Search, UI Polish`.

## Evidence visuale

- `browser-categories-pagination-search.png`
- `browser-suppliers-pagination-search.png`
- `browser-products-import-supplier-dialog-smoke.png`

## Risultati

TASK-080 e stato aperto, parcheggiato mentre veniva chiuso il fix TASK-079F, poi ripreso dopo suite History mirata 079-079F `PASS 23/23`.

Stato precedente rilevato:

- Categories/Suppliers avevano read model lightweight, ma la pagina non esponeva ancora pagination/search server-side dedicata con `page`, `pageSize`, `q/query`, `state`.
- Le option per Products e Import Supplier Wizard dipendono da catalog options complete; per questo TASK-080 separa il read model paginato della lista dalle option complete usate nei form/dialog.

## Evidence comandi

| Comando | Esito | Note |
|---|---|---|
| `node --test tests/foundation/task-079-history-entry-read-only-parity.test.mjs tests/foundation/task-079b-supplier-import-canonical-history.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-079d-history-mobile-semantics.test.mjs tests/foundation/task-079e-history-compact-sync-analysis.test.mjs tests/foundation/task-079f-history-row-state-colors.test.mjs` | `PASS 23/23` | Catena History 079-079F dopo fix pagination server-side. |
| `node scripts/testing/task-079d-mobile-history-generated-contract-smoke.mjs` | `PASS` | Smoke contratto mobile generated. |
| `node scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs` | `PASS` | Smoke contratto mobile edit. |
| `node --test tests/foundation/task-080-categories-suppliers-pagination.test.mjs tests/foundation/task-077-admin-console-real-shop-performance-hardening.test.mjs tests/foundation/task-068m-product-list-readability-icons.test.mjs tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs tests/foundation/task-032-shop-admin-polish.test.mjs tests/foundation/task-history-sync-console.test.mjs` | `PASS 31/31` | Guardrail TASK-080 piu regression statiche Catalog/History aggiornate. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3062 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3062" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts --project=chromium-desktop --grep "TASK-080"` | `PASS 1/1` | Browser smoke locale: Categories/Suppliers pagination/search/edit dialog e Products Import Supplier dialog. |
| `npx eslint src/app/shop/categories/page.tsx src/app/shop/suppliers/page.tsx src/app/shop/_components/CatalogEntityList.tsx src/server/shop-admin/inventory-read-model.ts src/server/shop-admin/shop-section-data.ts src/app/shop/history/page.tsx src/app/shop/_components/HistoryEntriesClientList.tsx src/server/shop-admin/history-read-model.ts tests/foundation/task-080-categories-suppliers-pagination.test.mjs tests/foundation/task-079f-history-row-state-colors.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs tests/foundation/task-032-shop-admin-polish.test.mjs tests/foundation/task-history-sync-console.test.mjs tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts` | `PASS` | ESLint scoped sui file TASK-080/History guardrail toccati. |
| `npm run lint` | `PASS` | ESLint completo. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning noti: Next `middleware` deprecato, Node `[DEP0205]`. |
| `npm run security:scan` | `FAIL_EXTERNAL` | Fuori scope: `src/server/shop-admin/catalog-mutations.ts` contiene direct Supabase mutation/select-star guardrail. |
| `npm run verify` | `FAIL_EXTERNAL` | `lint` e `typecheck` passano; si ferma a `security:scan` sul guardrail fuori scope in `catalog-mutations.ts`. |
| `npm run test:foundation` | `FAIL_EXTERNAL 2 failing tests` | Fuori scope: `TASK-015 catalog CRUD...` e `security scanner skips missing Win7POS sibling...`, entrambi per lo stesso guardrail `catalog-mutations.ts`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short` | `PASS_WITH_DIRTY_WORKTREE` | Worktree gia ampio/dirty; nessun commit, stage, push o deploy eseguito. |

Nota Playwright: un primo tentativo con `PLAYWRIGHT_REUSE_SERVER=1` sul dev server gia attivo `127.0.0.1:3055` ha fallito il login per env non allineato al runner locale; la evidence valida e il run PASS sono stati prodotti con `next start` isolato su `127.0.0.1:3062`.

## Rischi residui

- Serve review visuale utente sugli screenshot.
- Category/Supplier restore resta follow-up: non esiste una boundary restore audited per queste entita nel repository corrente.
- I gate globali sopra restano bloccati da `catalog-mutations.ts`, fuori scope di TASK-080.
