# TASK-078B Evidence - Product and History Detail Modal UI Polish

## Stato

- Task: `TASK-078B`
- Fase: `DONE_RECONCILED`
- Data: `2026-06-20`
- Esecutore: `Codex`

## Scope implementato

- Product Detail Modal ridotto a `1120-1200px`, fullscreen/sheet su mobile,
  header sticky, summary cards e tabs accessibili.
- Product Edit resta nello stesso modal: `Edit` apre il modal in edit mode,
  `Save` / `Cancel` sono nell'header sticky e usano server action esistenti.
- Archive/Restore separati in `Advanced` / `Danger area`, non nel flusso edit.
- Prices tab mostra prezzi correnti prima della tabella storica bounded.
- Inventory/Sync trasforma token tecnici in label leggibili.
- Diagnostics prodotto spostati in `Advanced`, collassati.
- History Entries list compatta: niente `Open Detail` come valore dati; una
  summary line e un solo bottone `Detail`.
- History Entry Detail Modal con summary reale, tabs principali, row preview
  filtrabile, header row ignorata se verificabile, celle mancanti `-`, product
  shortcut disabilitato quando non risolto e diagnostics redatti collassati.
- Nuove label collegate a `dictionary.exact` per IT/ES/ZH senza shadow dei
  corrective maps.

## Final Review / DONE Reconciliation

- Stato finale: `DONE_RECONCILED`.
- Il precedente limite di screenshot autenticati e superato da Playwright locale
  autenticato con fixture sintetica `TASK078C_*`.
- Problemi trovati e corretti:
  - i18n incompleto per nuove label History list/detail;
  - History list light aveva reintrodotto una summary exact;
  - smoke locale da aggiornare alla copia pagination `at least`;
  - summary card `Source` troppo alta con supplier/category lunghi.
  - guardrail statico TASK-054 da aggiornare al nuovo ultimo task chiuso.
- Nessun commit, stage, push, deploy o Supabase apply eseguito.

## File toccati per TASK-078B

- `src/app/shop/_components/ProductDetailModalController.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/i18n/dictionaries.ts`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-078B-product-history-detail-modal-ui-polish.md`
- `docs/TASKS/EVIDENCE/TASK-078B/README.md`

## Performance guardrail

- `/shop/products` resta su `getShopInventoryProductsPage` con
  `includeExactTotals: false`.
- Product detail continua a caricare via `/shop/products/detail` solo dopo click
  su `data-product-detail-trigger`.
- History detail continua a caricare via `/shop/history/detail` solo dopo click
  su `data-history-detail-trigger`.
- History list resta su `getShopHistoryListReadModel` e non legge
  `rawJsonPreview`, `payloadSummary` o read model full nel page component.
- Row filters del modal History sono client-side sul payload bounded gia
  caricato.

## Check eseguiti

| Comando | Stato | Note |
|---|---|---|
| `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs` | `PASS` | 5/5 dopo aggiornamento assert su `Advanced`, lista light e diagnostics collassati. |
| `node --test tests/foundation/task-history-sync-console.test.mjs` | `PASS` | 6/6. Guardrail History/sync console. |
| `node --test tests/foundation/task-068m-product-list-readability-icons.test.mjs` | `PASS` | 6/6. Product list readability/actions. |
| `node --test tests/foundation/task-062-global-i18n-locale.test.mjs` | `PASS` | 8/8; conferma copertura exact non-English. |
| `node --test tests/foundation/task-068-security-i18n-audit.test.mjs` | `PASS` | 6/6; conferma nessuno shadow corrective/base exact. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run lint` | `PASS` | ESLint senza errori. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | 414/414. Primo run fallito su i18n shadow introdotto dal polish; rimosse chiavi duplicate e rerun verde. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning noti: Next `middleware` deprecato verso `proxy`, Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Ripete lint/typecheck/security/build; stessi warning build. |
| `npm run test:shop:local` | `PASS` | 5/5. Primo run di riconciliazione ha richiesto aggiornamento test pagination; rerun verde. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3050 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-078c-product-history-visual-local.spec.ts --project=chromium-desktop` | `PASS` | 1/1. Visual QA locale autenticata con screenshot evidence TASK-078C. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `curl -I --max-time 5 http://127.0.0.1:3055/shop/products` | `PASS` | Dev server gia attivo, risposta `HTTP/1.1 200 OK`. |

## Rischi residui

- Focus trap completo non aggiunto: implementati `aria-labelledby`,
  `Escape`, tab roles e restore focus al trigger. Un focus trap completo puo
  essere validato in follow-up separato, soprattutto per i
  collegamenti incrociati Product -> History e History -> Product.
- La riga header viene marcata `Ignored header row` solo quando e riga `1` e
  contiene segnali verificabili da header; casi ambigui restano visibili.
- Product shortcut History resta disabilitato quando il payload bounded non
  contiene barcode/item code risolvibili.

## Prossima fase

Nessuna fase repo-controllabile aperta per `TASK-078B`. Eventuali prove con
dati reali/lunghi o focus trap completo vanno aperte come follow-up separato.
