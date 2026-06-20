# TASK-075 Evidence - Admin Web performance audit e Products latency

## Stato

- Data apertura: `2026-06-19`
- Stato operativo: `DONE_RECONCILED_WITH_NOTES`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Commit / push / stage: `NOT_RUN`
- Production deploy / production migration apply: `NOT_RUN_FORBIDDEN`

## Preflight

| Check | Esito |
|---|---|
| `git status --short --branch --untracked-files=all` | `PASS`, `## main...origin/main` |
| `git diff --check` | `PASS`, nessun output |
| `git branch --show-current` | `PASS`, `main` |

## Audit iniziale repo-grounded

| Area/route | Dynamic/static | Loading segment | Data loading primo render | Note |
|---|---|---|---|---|
| `/shop/products` | `force-dynamic` | `MISSING` prima di TASK-075 | `getShopInventoryProductsPage`, `getShopInventoryReadModel`, 3 `resolveShopActionContext` | Root cause principale: nessun loading visibile + read model completo non necessario. |
| `/shop/import-export` | `force-dynamic` | `MISSING` prima di TASK-075 | `getShopSectionForRequest`, import/export permission checks | Compat page; actions restano in Products. |
| `/shop/devices` | `force-dynamic` | `MISSING` prima di TASK-075 | `getShopDeviceReadModel`, devices permission check | Non toccare enforcement TASK-072/TASK-074. |
| `/shop/history` | `force-dynamic` | `MISSING` prima di TASK-075 | `getShopHistoryReadModel`, history write permission | Non rompere History Entry v2/sync events. |
| `/shop/staff` | `force-dynamic` | `MISSING` prima di TASK-075 | `getShopSectionForRequest`, staff permission check | Staff POS resta modulo shop-scoped. |
| `/platform/users` | `force-dynamic` | `src/app/platform/loading.tsx` presente | `getPlatformSectionForRequest("users")`, auth identities solo quando serve/search | Master Console ha gia feedback globale. |
| `/platform/shops` | `force-dynamic` | `src/app/platform/loading.tsx` presente | `getPlatformSectionForRequest("shops")` | Nessun fix grande richiesto. |

## Root cause iniziale

- `ShopShell` usava `Link prefetch={false}` su tutta la sidebar Admin Console.
- Mancavano `src/app/shop/loading.tsx` e `src/app/shop/products/loading.tsx`.
- `/shop/products` caricava il read model inventario completo anche quando la
  lista pagina gia contiene i prodotti visibili; quel read model include
  prodotti attivi, archiviati, categorie, fornitori e `inventory_product_prices`
  con `rowLimit=100`.
- La pagina Products eseguiva tre resolver permessi separati per manage/import/export.
- Gli indici shop-scoped esistenti coprono barcode e item number, ma non tutte
  le combinazioni richieste dal filtro/sort Products; nessuna migration viene
  aggiunta senza evidence DB runtime.

## Evidence incrementale

## Modifiche implementate

| Area | Evidence |
|---|---|
| Loading immediato Admin Console | Aggiunti `src/app/shop/loading.tsx` e `src/app/shop/products/loading.tsx` con skeleton non tecnici, coerenti con il frame Shop. |
| Navigazione sidebar Shop | `src/components/shop/ShopShell.tsx` ora prefetcha link GET di navigazione su intento utente (`onMouseEnter`, `onFocus`, `onTouchStart`) via `router.prefetch(href)`, mantenendo `prefetch={false}` per evitare prefetch viewport indiscriminato su area protetta. Logout resta form GET separato. |
| Products primo render | `src/app/shop/products/page.tsx` non chiama piu `getShopInventoryReadModel`; usa `getShopInventoryProductsPage` per page/count e `getShopCatalogOptionsReadModel` per sole opzioni categoria/fornitore. |
| Read model leggero | `src/server/shop-admin/inventory-read-model.ts` espone `getShopCatalogOptionsReadModel`: carica mapping, presenza shop-scoped e sole righe attive di categorie/fornitori. Non legge `inventory_product_prices`, prodotti archiviati o full catalog. |
| Permessi Products | Aggiunto `src/server/shop-admin/page-access.ts` per consolidare `products.write`, `catalog.import`, `catalog.export` in un solo resolver server-side per pagina. |
| Instrumentation | Aggiunto `src/server/admin-web-perf.ts`, opt-in con `ADMIN_WEB_PERF_DEBUG=1`, con timings/query labels e metadata troncati/redatti. Default: no log. |
| Scanner/test statici | Aggiornati security scanner e foundation tests per il nuovo read path Products senza indebolire auth/RLS/shop-scope/client-boundary. |

## Prima / dopo Products

| Aspetto | Prima | Dopo |
|---|---|---|
| Feedback durante navigation | Nessun loading segment Shop/Products. | `loading.tsx` generico Shop e specifico Products. |
| Sidebar | `Link prefetch={false}` su tutti i link Shop. | Prefetch manuale al primo intento utente; niente prefetch automatico viewport. |
| Products read model | Paged products + full inventory read model + 3 resolver permessi. | Paged products + catalog options leggero + 1 resolver bundle permessi. |
| Price history nel primo render | Incluso indirettamente dal full read model (`inventory_product_prices`). | Escluso dal path options/toolbar. Rimane disponibile nelle viste di dettaglio/import/export dove serve. |
| Permission checks | `products.write`, `catalog.import`, `catalog.export` risolti separatamente. | Bundle unico `resolveShopPageAccessBundle`. |
| Observability | Nessun trace route-specific. | Trace opt-in `[admin-web-perf]` con query labels e timing spans. |

## Check eseguiti

| Check | Esito |
|---|---|
| `node --test tests/foundation/task-075-admin-web-performance-products-latency.test.mjs` | `PASS`, 4/4 |
| `node --test tests/foundation/task-068m-product-list-readability-icons.test.mjs` | `PASS`, 6/6 |
| `npm run typecheck` | `PASS`, `next typegen && tsc --noEmit` |
| `npm run lint` | `PASS` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, 396/396 |
| `npm run build` | `PASS`, Next.js 16.2.6 compiled successfully; warning preesistente `middleware` deprecato verso `proxy` e Node `module.register()` deprecato. |
| `npm run verify` | `PASS`, lint + typecheck + security scan + build. |
| `curl -I --max-time 10 http://127.0.0.1:3055/shop/products` | `PASS`, `HTTP/1.1 200 OK`, security headers presenti. |
| `curl -I --max-time 10 http://127.0.0.1:3055/auth/login` | `PASS`, `HTTP/1.1 200 OK`, security headers presenti. |
| Browser in-app non autenticato su `/shop/products` | `PASS_WITH_NOTES`: titolo `Products | MerchandiseControl Admin Web`, nav attiva `Products`, form filtri presente, `productRows=100`, paginazione top/bottom presente, `data-products-loading=false`, console errors `[]`. |
| `npm run test:shop:local` iniziale | `BLOCKED_ENV`: esecuzione parallela ha trovato `EADDRINUSE 127.0.0.1:3050` / dev server gia attivo. |
| `npm run test:shop-admin-auth-smoke` iniziale | `BLOCKED_ENV`: altro Next dev server gia attivo su `localhost:3055`, PID `59003`. |
| `PLAYWRIGHT_DISABLE_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3055 npm run test:shop:local` | `BLOCKED_ENV`: 5/5 timeout su navigazione/sign-in dell'harness autenticato; durante setup/cleanup Supabase CLI ha fermato servizi locali `imgproxy`, `edge_runtime`, `pooler`. |
| `npm run db:local:status` | `FAIL_EXPECTED_ENV_GUARD`: `.env.local:NEXT_PUBLIC_SUPABASE_URL_TARGET=supabase_cloud`; local/dev checks fail closed, pur con status Supabase redatto disponibile. |

## Smoke autenticati locali - motivo blocker

Gli smoke autenticati non vengono dichiarati PASS. Il blocker e ambientale:

- `.env.local` punta a `supabase_cloud`, quindi `db:local:status` fallisce fail-closed per check local/dev.
- Esiste un dev server preesistente nella repo su `localhost:3055` (`PID 59003`), non avviato da questo task.
- Il retry non invasivo con `PLAYWRIGHT_DISABLE_WEB_SERVER=1` raggiunge il server ma i 5 test Playwright vanno in timeout su `page.goto` o `page.waitForURL("/shop")`.
- Durante il retry l'harness Supabase ha emesso cleanup/stop servizi locali (`supabase_imgproxy_MerchandiseControlSupabase`, `supabase_edge_runtime_MerchandiseControlSupabase`, `supabase_pooler_MerchandiseControlSupabase`), confermando che lo stato runtime locale non era stabile per un PASS autenticato.

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-075-admin-web-performance-audit-products-latency.md`
- `docs/TASKS/EVIDENCE/TASK-075/README.md`
- `scripts/security-checks.mjs`
- `src/app/shop/loading.tsx`
- `src/app/shop/products/loading.tsx`
- `src/app/shop/products/page.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/server/admin-web-perf.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/page-access.ts`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/task-015-shop-inventory.test.mjs`
- `tests/foundation/task-026-shop-admin-catalog-foundation.test.mjs`
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
- `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
- `tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs`
- `tests/foundation/task-068-security-i18n-audit.test.mjs`
- `tests/foundation/task-068m-product-list-readability-icons.test.mjs`
- `tests/foundation/task-075-admin-web-performance-products-latency.test.mjs`

## Rischi residui

- Nessuna migration indice e stata aggiunta: gli indici mancanti per combinazioni filtro/sort Products restano candidati per un task separato con evidence DB runtime.
- Lo smoke autenticato locale va ripetuto dopo allineamento `.env.local` a target local o dopo preparazione esplicita dell'ambiente cloud/local, evitando server paralleli.
- Il trace `ADMIN_WEB_PERF_DEBUG=1` e opt-in: le misure reali di latenza vanno raccolte in una sessione autenticata stabile.

## Handoff

- Stato richiesto: `REVIEW`.
- Verdict operativo Codex: `DONE_READY`.
- `DONE` non marcato da Codex; serve review/conferma esplicita utente.
- Nessun commit, push, stage, deploy production o Supabase cloud apply eseguito.

## Nota post-handoff 2026-06-20

Su richiesta esplicita utente `commit push`, sono stati rieseguiti gate locali
prima dello stage/commit:

- `git diff --check`: `PASS`.
- `npm run security:scan`: `PASS`.
- Test mirati TASK-075/TASK-076/shell: `PASS`, 11/11 iniziale.
- Test legacy aggiornati per il nuovo pattern TASK-076 di navigazione pending
  e sidebar `Import / Export`; targeted legacy: `PASS`, 41/41.
- `npm run test:foundation`: `PASS`, 400/400.
- `npm run verify`: `PASS`, con warning noti `middleware` deprecato e Node
  `DEP0205`.

Nessun deploy production o Supabase cloud apply eseguito in questa fase.

## Final DONE reconciliation - 2026-06-20

Riconciliazione richiesta esplicitamente dall'utente dopo `TASK-077B`.
TASK-075 viene chiuso con note perche il lavoro iniziale e stato superato dalle
misure cloud/read-only e dai fix architetturali successivi.

Benchmark freschi redatti:

| Target | Report | Esito |
|---|---|---|
| Products real-shop/local-cloud | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-task-077-final-reconciliation-products.json` | `PASS`, `finalMs=94ms`, `documentMs=885ms`, `visualReplacementMs=35ms`, `queryCount=5`. |
| Admin Console real-shop/local-cloud | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-real-shop-task-077-final-reconciliation-shop.json` | `PASS`, nessuna route sopra 2s finali; History fuori timeout. |
| Fixture cloud/local-cloud | `docs/TASKS/EVIDENCE/TASK-077/task-077-cloud-performance-fixture-task-077-final-reconciliation-fixture.json` | `PASS`, Products `51ms` final marker. |

Gate freschi:

| Check | Esito |
|---|---|
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `414/414` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti Next `middleware` deprecato e Node `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning build. |
| `git diff --check` | `PASS` |

Commit, stage, push, deploy staging/production e Supabase apply: `NOT_RUN`.
