# TASK-078 Evidence - Product and History Entry detail modals

## Stato

- Task: `TASK-078`
- Fase: `DONE_RECONCILED`
- Data: `2026-06-20`
- Esecutore: `Codex`

## Scope implementato

- Product Detail Modal wide/admin-panel con fetch lazy da
  `/shop/products/detail`.
- Product Edit nello stesso modal con `Save` / `Cancel` e server action inline.
- Archive/Restore prodotto nello stesso modal, con revalidate e refresh UI.
- History Entry Detail Modal wide/admin-panel con fetch lazy da
  `/shop/history/detail`.
- History tabs: rows, missing/errors, linked products, sync events, raw
  diagnostics collapsed. Il follow-up `TASK-078B` ha poi spostato la
  diagnostica redatta fuori dai tab principali in un pannello collapsed.
- Product shortcut dentro History rows via `data-product-detail-trigger`.
- History Entries list resa piu leggibile con layout card/table ibrido. Il
  follow-up `TASK-078B` ha rimosso il fallback `Open Detail` dai valori dati.
- Products first render resta su `getShopInventoryProductsPage` con
  `includeExactTotals: false`; detail/history rows/diagnostics sono on-demand.

## Final Review / DONE Reconciliation

- Stato finale: `DONE_RECONCILED`.
- Riconciliato con `TASK-078B` e `TASK-078C` dopo review statica, performance,
  i18n, security, visual QA locale e smoke shop locale.
- Problemi trovati e corretti:
  - i18n incompleto per alcune label History list/detail;
  - regressione `loadHistorySummary` nel read model light di History list;
  - smoke locale ancora legato alla vecchia copia paginazione `11+`;
  - summary card History `Source` troppo alta con valori lunghi.
  - guardrail statico TASK-054 non aggiornato al nuovo ultimo task chiuso.
- Nessun commit, stage, push, deploy o Supabase apply eseguito.

## File toccati

- `src/server/shop-admin/detail-modal-read-model.ts`
- `src/app/shop/products/detail/route.ts`
- `src/app/shop/history/detail/route.ts`
- `src/app/shop/_components/ProductDetailModalController.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/app/shop/actions.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `docs/TASKS/TASK-078-admin-console-product-history-detail-modals.md`
- `docs/TASKS/EVIDENCE/TASK-078/README.md`

## Performance guardrail

- Product detail route chiama `getShopInventoryProductDetailReadModel` solo
  dopo click su `data-product-detail-trigger`.
- History detail route chiama `getShopHistoryDetailReadModel` solo dopo click
  su `data-history-detail-trigger`.
- La lista History non usa `getShopHistoryReadModel` ne
  `shared_sheet_session_diagnostics` nel file pagina.
- I link restano `href` normali verso le pagine detail esistenti se il client
  controller non intercetta il click.

## Check eseguiti

| Comando | Stato | Note |
|---|---|---|
| `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs` | `PASS` | 5/5. Primo run aveva una asserzione statica troppo letterale su `setMode`, corretta e rerun verde. |
| `node --test tests/foundation/task-history-sync-console.test.mjs` | `PASS` | 6/6. Guardrail History/sync console. |
| `node --test tests/foundation/task-068m-product-list-readability-icons.test.mjs` | `PASS` | 6/6. Product list readability/actions. |
| `node --test tests/foundation/task-062-global-i18n-locale.test.mjs` | `PASS` | 8/8. Locale exact e rendering timestamp. |
| `node --test tests/foundation/task-068-security-i18n-audit.test.mjs` | `PASS` | 6/6. Nessuno shadow corrective/base exact. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run lint` | `PASS` | ESLint senza errori. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | 414/414. Primo run di riconciliazione ha intercettato `loadHistorySummary` nella History list light; corretto e rerun verde. |
| `npm run build` | `PASS_WITH_WARNINGS` | Primo tentativo bloccato da lock di un `next build` concorrente; atteso exit PID e rerun verde. Warning noti: `middleware` deprecato verso `proxy`, Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Ripete lint/typecheck/security/build; stessi warning build. |
| `npm run test:shop:local` | `PASS` | 5/5. Primo run di riconciliazione ha richiesto l'aggiornamento della copia pagination `at least`; rerun verde. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3050 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-078c-product-history-visual-local.spec.ts --project=chromium-desktop` | `PASS` | 1/1. Fixture sintetica TASK078C e screenshot evidence aggiornata. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `curl -I --max-time 5 http://127.0.0.1:3055/shop/products` | `PASS` | Dev server gia attivo, risposta `HTTP/1.1 200 OK`. |

## Rischi residui

- Il matching prodotto per righe History usa un lookup bounded per barcode/item
  code sui primi codici visibili del payload preview; se il payload mobile non
  espone codici risolvibili, il link prodotto resta `Not resolved`.
- La History list non carica conteggi pesanti nel primo render; dopo
  `TASK-078B` i valori mancanti sono descritti con una nota deferred invece di
  usare `Open Detail` come dato.
- Visual QA locale autenticata eseguita con fixture sintetica. Dati reali o
  staging possono ancora esporre casi estremi di lunghezza supplier/category,
  ma non sono prerequisito per il `DONE_RECONCILED` repo-controllabile.

## Prossima fase

Nessuna fase repo-controllabile aperta per `TASK-078`. Eventuali validazioni
con dati reali/staging lunghi vanno aperte come follow-up separato.
