# Evidence TASK-057

Verdict corrente: `READY_FOR_DONE_CONFIRMATION`.

TASK-057 resta in `REVIEW`, non `DONE`: la governance locale richiede conferma
utente esplicita per chiudere. Nessun commit, push, stage finale, deploy
production/cloud apply, dato reale hardcoded o dichiarazione production-ready
globale.

## Scope completato

- `/shop/products` e il Catalog Workspace principale con toolbar sopra tabella,
  dialog accessibili, search, filtri categoria/fornitore/state e tabella
  catalogo estesa.
- Categorie e fornitori usano lista + toolbar + dialog; update/archive restano
  azioni di riga.
- Import/export e integrato in Products; `/shop/import-export` resta deep link
  compatibile senza duplicare la logica.
- Parser Excel server-side rafforzato per workbook fornitore Dingli e database
  completo, incluso fallback OOXML quando `read-excel-file` fallisce su ZIP
  comunque valido.
- Catalogo riallineato a `shop_id`; `owner_user_id` resta solo bridge legacy
  Android/iOS tramite `shop_inventory_sources`.
- Product detail mostra `Price history` e `History entries` mobile, separati
  dagli audit log, anche per righe prodotto archiviate.
- Import/export database include Products, Suppliers, Categories e PriceHistory
  completo.

## File toccati nella review finale

- `src/server/shop-admin/import-export-route-guard.ts`
- `src/app/shop/import-export/preview/route.ts`
- `src/app/shop/import-export/apply/route.ts`
- `src/app/shop/import-export/export/route.ts`
- `src/server/shop-admin/import-export-workbook.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `scripts/security-checks.mjs`
- `package.json`
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`
- `tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- `docs/TASKS/EVIDENCE/TASK-057/README.md`
- `docs/MASTER-PLAN.md`

## Finding corretti durante review

| Finding | Fix | Evidence |
|---|---|---|
| Route import mutative parsavano multipart prima di un guard condiviso origin/body/file. | Aggiunto guard server-only same-origin/content-type/content-length/file-size e applicato prima di `formData()`/`arrayBuffer()`. | Foundation TASK-057 copre ordine guard e scanner TASK-057 passa. |
| Product detail non copriva righe archiviate aperte dalla tabella. | Detail cerca anche `archivedProducts` e mostra stato/archived at. | Test TASK-057 dedicato. |
| Export copy lasciava intendere prezzi recenti, non PriceHistory completo. | Copy aggiornato a `full price history`. | Test TASK-057 e browser QA. |
| Export workbook mancava no-store esplicito. | `Cache-Control: no-store` sulla route export. | Test TASK-057. |
| Export PriceHistory usava il read model UI limitato, non tutte le righe importate. | Export paginato server-side da `inventory_product_prices`, merge con read model e audit count completo. | QA database: audit/XML PriceHistory `44295`. |
| Scanner/harness legacy non riconoscevano il guard condiviso. | Security scanner TASK-057 e test TASK-028 aggiornati. | `npm run security:scan` e foundation passano. |
| `npm run test:shop-admin-auth-smoke` poteva partire con env cloud/non locale o build env non coerente. | Script ufficiale riallineato a `scripts/testing/run-playwright-target.mjs local`, che carica Supabase locale process-only e avvia Playwright con web server locale. | `npm run test:shop-admin-auth-smoke` passa `4/4` senza env manuale. |

## Matrice dati mobile/Admin

| Area | Evidenza | Stato |
|---|---|---|
| Android | Git status letto in `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`; repo non modificato da TASK-057, con modifica preesistente `.idea/deploymentTargetSelector.xml`. Letti file remote/source PriceHistory, sync/history e import/apply/export. | `ALIGNED_SOURCE_READ_NOT_MODIFIED` |
| iOS | Git status letto in `/Users/minxiang/Desktop/iOSMerchandiseControl`; repo pulito. Letti exporter/import core, ProductPrice history, remote adapters history/sync/catalog baseline. | `ALIGNED_SOURCE_READ_NOT_MODIFIED` |
| Supabase | Migration TASK-057 additive per `shop_id` catalogo, `inventory_product_prices`, `shared_sheet_sessions`, `sync_events`; RLS/select shop-member e RPC import server-side. | `PASS_LOCAL` |
| Admin Web | Read model shop_id-first, legacy fallback solo quando mappato; Products/detail/history/import/export verificati via Playwright locale autenticato. | `PASS_LOCAL` |
| POS/Win7POS | Admin Web POS catalog pull letto: usa `shop_id` prima del bridge legacy. Win7POS non modificato; repo dirty preesistente fuori scope. | `SOURCE_READ_NOT_MODIFIED` |

## QA browser/Playwright locale

Server usato: `http://127.0.0.1:3057`.

Fixture sintetica: prefisso `TASK057_*`, Supabase locale process-only derivato da
CLI. `.env.local` non e stato usato per i test autenticati perche punta al
target cloud e il check fail-closed lo rileva.

Verifiche coperte:

- `/shop/products`: toolbar sopra tabella con `New product`, `Import supplier
  Excel`, `Export catalog`, `Advanced database import/export`.
- Row actions Products/Categories/Suppliers.
- Product detail con overview, Price History e History entries.
- History page con mobile history entries, sync events e audit log separati.
- Import supplier Excel, database transfer avanzato, export catalog.
- Legacy mapped leggibile e legacy unmapped con `Mapping required`.
- POS catalog pull shop-scoped verificato da codice Admin Web.

Screenshot evidence:

- `browser-shop-scoped-ready.png`
- `browser-products-toolbar-row-actions.png`
- `browser-import-dialog.png`
- `browser-database-transfer-dialog.png`
- `browser-product-detail-price-history.png`
- `browser-legacy-bridge-ready.png`
- `browser-unmapped-bridge-blocked.png`

Console browser error count: `0`.

## QA Excel reale locale

### Dingli supplier workbook

File: `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx`

- Preview: `status 200`, `code success`, `ok true`, digest presente.
- Foglio rilevato: `产品`; header row: `10`.
- Summary: `products 101`, `newProducts 101`, `updatedProducts 0`,
  `validRows 101`, `droppedRows 1`, `rowErrors 0`, `rowWarnings 0`,
  `priceHistory 0`.
- Apply: `status 200`, `code success`, `ok true`, `failedRows 0`,
  `productsApplied 101`, `categoriesApplied 0`, `suppliersApplied 0`,
  `priceHistoryApplied 0`.
- Conteggio prodotti shop-scoped post apply: `101`.

### Database workbook completo

File: `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx`

- `unzip -t` passa; parser primario fallisce con firma ZIP non compatibile,
  fallback OOXML applicato.
- Preview: `status 200`, `code success`, `ok true`, digest presente, foglio
  `Products`, header row `1`.
- Summary preview: `categories 24`, `suppliers 59`, `products 21181`,
  `newProducts 20904`, `updatedProducts 99`, `droppedRows 0`,
  `priceHistory 44295`, `validRows 21181`, `rowErrors 0`, `rowWarnings 188`.
- Warnings: formula escape e SKU duplicati opzionali; i barcode restano unici.
- Apply database: `status 200`, `code success`, `ok true`, `failedRows 0`,
  `categoriesApplied 24`, `suppliersApplied 59`, `productsApplied 21181`,
  `priceHistoryApplied 44295`.
- Conteggi DB post apply: `products 21181`, `suppliers 59`, `categories 24`,
  `priceHistory 44295`.
- Export post-import database: `status 200`, `Cache-Control no-store`,
  `sizeBytes 4737379`, audit `priceHistory 44295`, XML sheet rows
  `PriceHistory 44295`.
- Nota parser QA: `read-excel-file` ha letto solo `3` righe dal foglio grande
  `PriceHistory`; la verifica autorevole per export e audit + XML workbook.

### Corpus fornitori

- `Vs20251129-287(Dingli).xlsx`: preview `success`, `products 62`,
  `updatedProducts 62`, `droppedRows 1`, `rowErrors 0`, `rowWarnings 0`.
- `Vs20251020-23(Motarro).xlsx`: preview `success`, `products 63`,
  `newProducts 2`, `updatedProducts 61`, `droppedRows 1`.
- `27:11.xlsx`: `validation_failed`, `rowErrors 1`, safe failure.
- `10:11.xlsx`: `validation_failed`, `rowErrors 1`, safe failure.
- `23:11.xlsx`: `validation_failed`, `rowErrors 1`, safe failure.

## Supabase locale

| Check | Esito |
|---|---|
| `supabase status` | `PASS`, stack locale raggiungibile; valori secret non riportati in evidence. |
| `npm run db:local:status` | `PASS_FAIL_CLOSED_ENV_LOCAL_POINTS_CLOUD`; `.env.local` punta cloud, ma i test locali hanno usato env process-only da CLI. |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --local` | `PASS`, migration TASK-057 presenti fino a `20260612021252`. |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local` | `PASS`, local database up to date. |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public,app_private --fail-on error` | `PASS`, no schema errors. |

## Check finali

| Check | Esito |
|---|---|
| `node --test tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS 19/19` |
| `node --test tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs` | `PASS 25/25` |
| `npm run test:foundation` | `PASS 276/276` |
| `npm run security:scan` | `PASS` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS` |
| `npm run verify` | `PASS_WITH_WARNINGS` |
| `npm run test:shop-admin-auth-smoke` | `PASS 4/4`, script ufficiale con wrapper local-only e Supabase locale process-only |
| `npm run test:platform:local` | `PASS 1/1`, Supabase locale process-only |
| `npm run test:platform:local-login` | `PASS 1/1`, gated con conferma env e Supabase locale process-only |
| `npm run platform:local:cleanup` | `PASS_WITH_NOTES`, cleanup TASK046 esterno a TASK057 con audit append-only/utente disabilitato documentati dal runner |
| `git diff --check` | `PASS` |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_UNCOMMITTED_CHANGES`, nessun stage/commit/push eseguito |

Warning noti non bloccanti:

- Next segnala convenzione `middleware` deprecata verso `proxy`.
- Node segnala `[DEP0205] module.register()` durante Next/Playwright.
- Playwright/Next mostrano warning `NO_COLOR` ignorato quando `FORCE_COLOR` e
  settato.
- Supabase CLI segnala update disponibile `2.106.0` da installata `2.105.0`.

## Cleanup locale

- Cleanup QA per fixture TASK057 corrente eseguito in `finally`.
- File temporanei TASK057 rimossi da `/tmp`: script QA, export/log temporanei,
  `/tmp/task057-live-qa.mjs`, `/tmp/task057-shop-scope-qa.mjs`,
  `/tmp/task057-local-supabase.env` e `/tmp/task057-import-evidence`.
- Query residui finale per pattern TASK057: `shops 0`, `profiles 0`, `auth 0`,
  `products 0`, `sessions 0`, `audit 0`.
- Durante run precedenti e stato necessario rimuovere residui sintetici locali;
  il trigger append-only audit e stato disabilitato e riabilitato solo sul DB
  locale quando necessario. La verifica finale TASK057 e a zero residui.

## Performance, security, UX

- Performance: import database usa bulk RPC e chunking per prodotti/PriceHistory;
  export PriceHistory usa paginazione server-side invece del read model UI
  limitato; route upload richiedono `Content-Length` e file limit.
- Security: no service-role client/browser, no secret in repo/evidence, no raw
  PIN/password/token, no grant anon business nelle migration TASK-057, guard
  same-origin sulle route POST import, formula injection protetta.
- UX/accessibilita: toolbar globale sopra tabella, row actions per operazioni
  per-riga, dialog con `role="dialog"` e `aria-modal`, copy cliente non tecnico,
  empty/blocked state espliciti.

## Rischi residui

- Production/cloud apply: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Commit/push/stage: `NOT_RUN_USER_FORBIDDEN`.
- Android/iOS build runtime: `NOT_RUN_NOT_MODIFIED`; solo discovery sorgenti
  richiesta e completata.
- Win7POS build/live E2E: `NOT_RUN_NOT_MODIFIED`; repo non toccato e dirty
  preesistente, non dichiarato PASS runtime.
- `read-excel-file` non e affidabile come lettore QA del foglio `PriceHistory`
  molto grande; export verificato con audit route e XML workbook.

## Prossimo passo

Review utente e conferma esplicita per chiudere TASK-057 a `DONE` secondo la
governance locale. Senza tale conferma, il massimo stato corretto resta
`READY_FOR_DONE_CONFIRMATION` in fase `REVIEW`.
