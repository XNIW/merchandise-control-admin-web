# Evidence TASK-079E - History Entry Compact Layout

## Stato

- Task: `TASK-079E`
- Fase: `REVIEW`
- Data apertura: `2026-06-21`
- Verdict operativo: `REVIEW_READY_FOR_USER_VISUAL_CHECK`

## Evidence raccolta

- UI list History compatta:
  - `docs/TASKS/EVIDENCE/TASK-079E/browser-history-list-compact-desktop.png`
- Detail History senza scroll orizzontale:
  - `docs/TASKS/EVIDENCE/TASK-079E/browser-history-detail-no-horizontal-scroll-desktop.png`
- Detail History tab `Sync analysis`:
  - `docs/TASKS/EVIDENCE/TASK-079E/browser-history-detail-sync-analysis-desktop.png`
- Products -> Import Supplier Apply con `Sync / Import analysis` e link History:
  - `docs/TASKS/EVIDENCE/TASK-079E/browser-products-import-apply-sync-analysis.png`
- `SyncAnalysisPanel` condiviso:
  - mapper History Detail da `shared_sheet_sessions` / related `sync_events`
  - mapper Supplier Apply da apply response e `historyEntry`
  - nessun `fetch`, client Supabase o query server-side nel componente.

## Check

- `node --test tests/foundation/task-079e-history-compact-sync-analysis.test.mjs tests/foundation/task-079d-history-mobile-semantics.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs tests/foundation/task-079b-supplier-import-canonical-history.test.mjs tests/foundation/task-079-history-entry-read-only-parity.test.mjs`
  - `PASS` 18/18.
- `node scripts/testing/task-079c-mobile-history-edit-contract-smoke.mjs`
  - `PASS`.
- `node scripts/testing/task-079d-mobile-history-generated-contract-smoke.mjs`
  - `PASS`.
- `npm run typecheck`
  - `PASS` (`next typegen && tsc --noEmit`).
- `npm run build`
  - `PASS_WITH_WARNINGS`: Next.js `middleware` deprecation e Node
    `[DEP0205] module.register`.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3056 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3056" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-079c-history-generated-edit-local.spec.ts --project=chromium-desktop`
  - `PASS` 1/1.
  - Copre login locale, History list, `documentElement.scrollWidth <= clientWidth`,
    Detail rows `scrollWidth <= clientWidth`, edit/save generated fields,
    `Sync analysis`, `history_changed` e DB overlay.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3057 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3057" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-060-supplier-excel-preview.spec.ts --project=chromium-desktop`
  - `PASS` 7/7.
  - Copre Products -> Import Supplier Apply, pannello `Sync / Import analysis`
    e link `Open History Entry`.
- `npm run lint`
  - `PASS`.
- `node --test tests/foundation/task-068-security-i18n-audit.test.mjs`
  - `PASS` 6/6 dopo rimozione duplicati dizionario.
- `npm run test:foundation`
  - `PARTIAL_FAIL_EXTERNAL_SCOPE`: `tests 437`, `pass 434`, `fail 3`.
  - Failure residui fuori scope 079E:
    `TASK-015 catalog CRUD is implemented through audited shop-scoped RPCs`,
    `security scanner skips missing Win7POS sibling unless explicitly required`,
    `TASK-032 category and supplier lists expose ids required by action forms`.
- `npm run security:scan`
  - `FAIL_EXTERNAL_SCOPE`: `src/server/shop-admin/catalog-mutations.ts`
    contiene una direct Supabase mutation e viola il guardrail direct
    table mutation/select-star. File fuori scope 079E e gia presente in diff
    Products/Catalog.
- `npm run verify`
  - `FAIL_EXTERNAL_SCOPE`: `lint` PASS, `typecheck` PASS, poi stop su
    `security:scan` per `src/server/shop-admin/catalog-mutations.ts`.
- `git diff --check`
  - `PASS`.

## Rischi residui

- Review visuale utente richiesta: stato `REVIEW_READY_FOR_USER_VISUAL_CHECK`,
  non `DONE`.
- Gate globali residui fuori scope:
  - `security:scan` / `verify` bloccati da
    `src/server/shop-admin/catalog-mutations.ts`.
  - `test:foundation` 434/437 per guardrail TASK-015, Win7POS sibling e
    TASK-032 Category/Supplier.
- Warning non bloccanti:
  - Next.js depreca convenzione `middleware` verso `proxy`.
  - Node segnala `[DEP0205] module.register`.
- Nessun commit, stage, push, deploy, migration, production apply o Supabase
  apply eseguito.
