# TASK-078C Evidence - Product Detail visual polish and History Entries month-grouped UX

## Stato

- Task: `TASK-078C`
- Fase: `DONE_RECONCILED`
- Data: `2026-06-20`
- Esecutore: `Codex`

## Scope implementato

- Product Detail Modal piu operativo: icone locali, chip copiabili per barcode
  e item code, summary cards, tab Overview/Prices/Inventory/History/Advanced e
  Advanced diagnostics collassato.
- Product Edit resta nello stesso modal con gruppi Identity, Classification e
  Pricing/stock, Save/Cancel in header edit e nessuna nuova action/RPC.
- Product list conserva il first render light e rende visibili supplier,
  category, mini card prezzi/stock e azioni Detail/Edit/Archive.
- History Entries list passa a `HistoryEntriesClientList`: search, periodo,
  month selector, status filter, default `Active + issues`, grouping per mese e
  nota unica su detail lazy.
- History Entry Detail Modal mostra summary iconata, rows, missing/errors,
  linked products, sync events e raw diagnostics collassati.
- Preview righe History header-aware: se il payload ha colonne Excel
  riconoscibili, `No.`, `Item code`, `Barcode`, `Product`, `Quantity`,
  `Purchase`, `Retail` vengono mostrati correttamente.
- Nuove stringhe passano da `dictionary.exact` per IT/ES/ZH.

## File toccati per TASK-078C

- `src/app/shop/_components/ProductDetailModalController.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/_components/HistoryEntriesClientList.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/history/page.tsx`
- `src/i18n/dictionaries.ts`
- `src/server/shop-admin/detail-modal-read-model.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `tests/foundation/task-068m-product-list-readability-icons.test.mjs`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `tests/foundation/task-history-sync-console.test.mjs`
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`
- `tests/e2e/task-078c-product-history-visual-local.spec.ts`
- `docs/TASKS/TASK-078C-product-history-visual-polish-month-grouping.md`
- `docs/TASKS/EVIDENCE/TASK-078C/README.md`

Nota worktree: `src/app/shop/_components/DeviceRegistryView.tsx` era gia
modificato fuori scope e non e stato toccato per TASK-078C.

## Performance e security guardrail

- `/shop/products` resta su `getShopInventoryProductsPage` con
  `includeExactTotals: false`.
- Product detail/storico prezzi carica solo via `/shop/products/detail` dopo
  click su `data-product-detail-trigger`.
- `/shop/history` resta su `getShopHistoryListReadModel`; i filtri del nuovo
  client component sono solo sulle righe visibili. La summary della list page
  deriva dalle righe bounded visibili e non richiama `loadHistorySummary`.
- History rows/missing/linked/sync/diagnostics caricano solo via
  `/shop/history/detail` dopo click su `data-history-detail-trigger`.
- Diagnostics raw sempre collassati e redatti.
- Nessun service-role, secret, schema/RLS/RPC/migration o nuova dipendenza.

## Visual QA

Comando:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3050 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-078c-product-history-visual-local.spec.ts --project=chromium-desktop
```

Risultato finale: `PASS`, 1 test passed. Il run usa fixture sintetica locale
`TASK078C_*` e non dati reali. Run intermedi hanno trovato issue utili:
barcode fixture non numerico per linked product, preview History non
header-aware e summary `Source` troppo alta con valori lunghi; tutti corretti
e screenshot finali rigenerati.

Durante i gate finali post-documentazione, `npm run test:foundation` ha anche
segnalato il guardrail statico TASK-054 non aggiornato al nuovo ultimo task
chiuso `TASK-078C`; il test e stato riallineato e il full foundation e tornato
verde 414/414.

Screenshot salvati:

- `browser-products-list-polish-desktop.png`
- `browser-product-detail-overview-desktop.png`
- `browser-product-detail-prices-desktop.png`
- `browser-product-detail-inventory-desktop.png`
- `browser-product-detail-advanced-collapsed-desktop.png`
- `browser-product-detail-edit-desktop.png`
- `browser-history-entries-grouped-desktop.png`
- `browser-history-entries-filter-deleted-desktop.png`
- `browser-history-entry-detail-rows-desktop.png`
- `browser-history-entry-detail-missing-errors-desktop.png`
- `browser-history-entry-detail-linked-products-desktop.png`
- `browser-history-entry-detail-sync-events-desktop.png`

Review manuale screenshot: nessuna schermata vuota; azioni prodotto visibili;
Product modal/edit senza overlap evidente; History grouping mese presente;
History rows mostra item code, barcode, prodotto, quantity, purchase, retail;
raw diagnostics collassati.

## Check eseguiti

| Comando | Stato | Note |
|---|---|---|
| `node --test tests/foundation/task-078-product-history-detail-modals.test.mjs` | `PASS` | 5/5; guardrail lazy/detail/modal aggiornati. |
| `node --test tests/foundation/task-history-sync-console.test.mjs` | `PASS` | 6/6; guardrail History/sync console. |
| `node --test tests/foundation/task-068m-product-list-readability-icons.test.mjs` | `PASS` | 6/6; Product list readability/actions. |
| `node --test tests/foundation/task-062-global-i18n-locale.test.mjs` | `PASS` | 8/8; locale exact e rendering timestamp. |
| `node --test tests/foundation/task-068-security-i18n-audit.test.mjs` | `PASS` | 6/6; nessuno shadow corrective/base exact. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | 414/414. Primo run di riconciliazione ha intercettato `loadHistorySummary` nella History list light; corretto e rerun verde. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run lint` | `PASS` | ESLint senza errori. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning noti: Next `middleware` deprecato verso `proxy`, Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Ripete lint/typecheck/security/build; stessi warning build. |
| `npm run test:shop:local` | `PASS` | 5/5. Primo run richiedeva aggiornamento test pagination a `at least`; rerun verde. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3050 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-078c-product-history-visual-local.spec.ts --project=chromium-desktop` | `PASS` | 1/1. Screenshot evidence finali rigenerati. |
| `git diff --check` | `PASS` | Nessun whitespace error. |

## Mobile parity note

- Android: History month grouping gia presente come riferimento funzionale.
- Admin Web: grouping per mese implementato sulle righe History visibili.
- iOS: follow-up consigliato per aggiungere grouping per mese se ancora assente.
- Nessun runtime Android/iOS modificato in questo task.

## Cleanup fixture

- Lo spec Playwright chiama `fixture.cleanup()` nel blocco `finally`.
- Dopo il run visuale finale e stato eseguito anche un cleanup locale mirato sui
  residui sintetici `TASK078C_*` da run precedenti: rimossi 2 profili, 2 shop e
  2 auth user sintetici.
- Conteggio redatto post-cleanup: `profiles=0`, `shops=0`,
  `inventory_suppliers=0`, `inventory_categories=0`, `inventory_products=0`,
  `inventory_product_prices=0`, `shared_sheet_sessions=0`, `sync_events=0`,
  `auth.users task078c=0`.
- Nessuna chiave o dato sensibile stampato; le screenshot evidence contengono
  solo la fixture sintetica.

## Rischi residui

- I filtri History sono client-side sulle righe visibili: non promettono count
  globale e lo dichiarano nella UI.
- La mappatura header-aware copre alias comuni; workbook con colonne molto
  diverse possono ricadere sul fallback inferito e vanno validati in follow-up
  separato se emergono casi reali.
- La visual QA e locale sintetica; review con dati reali/lunghi puo evidenziare
  label troppo lunghe o casi supplier/category estremi.
- Non eseguiti commit, stage, push, deploy, production apply o Supabase apply.

## Prossima fase

Nessuna fase repo-controllabile aperta per `TASK-078C`. Eventuali prove con
dati reali/lunghi o payload Excel non standard vanno aperte come follow-up
separato.
