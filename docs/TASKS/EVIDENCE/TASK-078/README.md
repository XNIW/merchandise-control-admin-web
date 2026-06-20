# TASK-078 Evidence - Product and History Entry detail modals

## Stato

- Task: `TASK-078`
- Fase: `REVIEW`
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
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run lint` | `PASS` | ESLint senza errori. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | 414/414. |
| `npm run build` | `PASS_WITH_WARNINGS` | Primo tentativo bloccato da lock di un `next build` concorrente; atteso exit PID e rerun verde. Warning noti: `middleware` deprecato verso `proxy`, Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Ripete lint/typecheck/security/build; stessi warning build. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `curl -I --max-time 5 http://127.0.0.1:3055/shop/products` | `PASS` | Dev server gia attivo, risposta `HTTP/1.1 200 OK`. |

## Rischi residui

- Il matching prodotto per righe History usa un lookup bounded per barcode/item
  code sui primi codici visibili del payload preview; se il payload mobile non
  espone codici risolvibili, il link prodotto resta `Not resolved`.
- La History list non carica conteggi pesanti nel primo render; dopo
  `TASK-078B` i valori mancanti sono descritti con una nota deferred invece di
  usare `Open Detail` come dato.
- Serve smoke browser autenticato su dataset reale/staging per validare
  layout, focus e dimensioni con dati lunghi.
- Smoke browser autenticato e Playwright visuale non eseguiti: richiedono una
  sessione/dataset autenticato reale; i gate automatici e il probe HTTP locale
  sono verdi.

## Prossima fase

`REVIEW`: validare UX e behavior su Products e History. Il task non e marcato
`DONE`; richiede conferma esplicita dell'utente.
