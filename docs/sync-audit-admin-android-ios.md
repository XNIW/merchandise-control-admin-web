# Sync Audit Admin Web / Android / iOS

Data audit: 2026-07-04 22:30:30 -04 locale, con artifact iOS MCP in UTC 2026-07-05.

Richiesta: verificare sincronizzazione tra Admin Web, Android e iOS per catalogo, fornitori,
categorie, history/storico reale, shop scope, sicurezza client/server e tempi di propagazione.
Questo report evita Windows 7 Plus, Win7 POS e cash register.

## Perimetro e stato repo

| Repo | Path | Branch / HEAD | Stato |
| --- | --- | --- | --- |
| Admin Web | `/Users/minxiang/Projects/merchandise-control-admin-web` | `main` / `75325dda` | Worktree gia dirty prima dell'audit. Aggiunto solo questo report. |
| Android | `/Users/minxiang/Projects/MerchandiseControlSplitView` | `main` / `4322c92` | Clean. Nessuna modifica. |
| iOS | `/Users/minxiang/Desktop/iOSMerchandiseControl` | `main` / `e58a691b` | Untracked evidence preesistenti. Nessuna modifica. |

Governance letta prima dell'audit:

- Admin: `docs/MASTER-PLAN.md`, task attivo `docs/TASKS/TASK-086-mobile-ui-emulator-polish.md`, fase `REVIEW_READY`.
- Android: `docs/MASTER-PLAN.md`, nessun task attivo da eseguire per questa richiesta.
- iOS: `docs/MASTER-PLAN.md`, stato `IDLE` dopo TASK-136.

Per questo motivo non ho applicato fix di runtime: ho prodotto handoff/audit e check reali. Un fix
runtime va aperto come task `EXECUTION`/`FIX` o autorizzato esplicitamente come override.

## Risultato sintetico

| Area | Esito | Note |
| --- | --- | --- |
| Shop scope dati | OK da codice | Admin, Android e iOS leggono/scrivono con `shop_id` quando esiste una selezione shop. Restano fallback legacy owner-scoped espliciti. |
| Catalogo prodotti/categorie/fornitori | OK da codice | Admin usa read model server-side e mutazioni RPC shop-scoped. Android/iOS hanno bootstrap, push pending e pull incrementale. |
| History / storico reale | OK da codice | Admin usa `shared_sheet_sessions` e `sync_events`; mobile gestisce push/pull sessioni e tombstone. |
| Mobile foreground/resume | OK da codice | Android trigger onStart + loop 15s; iOS scene active + watcher Realtime + safety loop 30s. |
| Admin Web refresh da mobile | Gap | Le pagine shop sono `force-dynamic` e le azioni Admin fanno `revalidatePath`, ma non ho trovato polling/visibility refresh/realtime per modifiche nate da mobile. |
| Realtime / fallback | OK mobile, parziale Admin | Android/iOS ascoltano `sync_events`; Admin legge su richiesta. |
| Sicurezza service role | OK confine server, ma scan fallisce altrove | `createSupabaseAdminClient` e service role sono in moduli `server-only`. `npm run security:scan` segnala issue preesistente in `import-export-workbook.ts`. |
| Tempi reali propagazione | NOT_RUN | Richiede login interattivo e device/simulator autenticati. Non ho usato credenziali ne scritto dati live. |

## Architettura verificata

### Admin Web

- Pagine shop principali sono server component dinamiche (`export const dynamic = "force-dynamic"`).
- `src/server/shop-admin/inventory-read-model.ts` applica scope `selectedShop.shopId` su
  `inventory_products`, `inventory_categories`, `inventory_suppliers`,
  `inventory_product_prices`; fallback legacy solo tramite `owner_user_id` e bridge mapping.
- `src/server/shop-admin/catalog-mutations.ts` usa RPC `shop_catalog_*` con
  `p_shop_id: context.selectedShop.shopId` per create/update/archive di supplier/category/product.
- `src/server/shop-admin/sync-event-writer.ts` scrive `sync_events` server-side con
  `source: "admin_web"`, `shop_id`, `owner_user_id`, `entity_ids`, `changed_count` e
  `client_event_id` deterministico.
- `src/server/shop-admin/history-read-model.ts` legge `shared_sheet_sessions` e `sync_events`
  con scope shop, piu fallback legacy controllato.
- `src/server/shop-admin/history-mutations.ts` crea/aggiorna/tombstone sessioni history e usa
  `writeAdminWebSyncEvent`.
- `src/app/shop/actions.ts` chiama `revalidatePath(...)` dopo mutazioni Admin.

Gap Admin Web:

- `rg` non ha trovato `visibilitychange`, poll periodico o watcher Realtime per `/shop/products`,
  `/shop/categories`, `/shop/suppliers`, `/shop/history`.
- Quindi una tab Admin gia aperta puo restare stale dopo una scrittura Android/iOS finche non avviene
  navigazione, refresh manuale o una server action Admin. Questo e il candidato fix piu piccolo:
  un client component nello shop layout che fa `router.refresh()` su `visibilitychange`/focus con
  throttle, oppure un refresh mirato basato su `sync_events`.

### Android

- `MerchandiseControlApplication` collega `ProcessLifecycleOwner`:
  `onStart` chiama `realtimeRefreshCoordinator.onAppForeground()`,
  `historySessionPushCoordinator.onAppForeground()` e `catalogAutoSyncCoordinator.onAppForeground()`;
  `onStop` sospende i loop.
- `CatalogAutoSyncCoordinator`:
  - debounce locale `500ms`;
  - drain `sync_events` su login/foreground/network/shop change/realtime signal;
  - foreground interval `15_000ms`;
  - bootstrap e push pending con guard auth/device/network/background.
- `SupabaseSyncEventRealtimeSubscriber` apre canale `sync-events-v1-$ownerUserId-$shopId` e filtra
  Insert su `sync_events` per `shop_id` quando presente.
- `SupabaseCatalogRemoteDataSource` filtra fetch catalogo per `eq("shop_id", shopId)`.
- DTO catalogo e prezzi includono `shop_id`.
- `HistorySessionPushCoordinator` gestisce login, foreground, network, shop change e push sessioni.
- `SupabaseRealtimeSessionSubscriber` ascolta `shared_sheet_sessions` senza filtro shop nel canale;
  il flusso usa JWT/RLS e poi applicazione repository. Rischio residuo: publication/RLS live non
  verificati in questo audit.

### iOS

- `ContentView` monta `AppSyncRootHost`, aggiorna `ShopContextStore` prima del bootstrap e richiama
  `SyncOrchestrator` su scene active, auth change, shop change e pending local changes.
- `SyncOrchestrator`:
  - su active avvia watcher Realtime e trigger incrementale;
  - in background ferma watcher e safety loop;
  - safety loop foreground ogni 30 secondi;
  - `remoteSyncEvent` forza drain incrementale.
- `SupabaseSyncEventSignalWatcher` filtra `sync_events` Insert per `shop_id` quando presente.
- `SyncEventRemoteSupabaseAdapter.fetchSyncEventsAfter` filtra `owner_user_id`, `id > watermark` e
  `shop_id` quando disponibile.
- `SupabaseRemoteQueryExecutor` aggiunge `eq("shop_id", selectedShopID)` a fetch paginati,
  fetch by IDs e count.
- `WatermarkStore` usa scope owner + store identity, quindi non eredita watermark legacy shop-scoped.
- `HistorySessionRemoteSupabaseAdapter` filtra sessioni per owner e shop, e valida read-back upsert.

## Criteri richiesta

| Criterio | Stato | Evidence |
| --- | --- | --- |
| Prodotti Admin -> mobile | Da codice OK, live NOT_RUN | Admin scrive `sync_events`; Android/iOS drenano eventi shop-scoped. |
| Prodotti mobile -> Admin | Da codice parziale | Mobile scrive remote + `sync_events`; Admin vede su nuova request. Gap: tab Admin aperta non auto-refresh. |
| Fornitori/categorie | Da codice OK | Stesso percorso catalogo con entity ids supplier/category. |
| History reale | Da codice OK | `shared_sheet_sessions` + `sync_events` shop-scoped, tombstone supportati. |
| Cache locale mobile immediata | Da codice OK | Local pending changes / Room / SwiftData sono sorgente UI locale prima della sync cloud. |
| Refresh dopo login/shop | Da codice OK | Android `ShopContextRepository.refresh/selectShop`; iOS `ShopContextStore.refresh/selectShop`. |
| Foreground resume | Da codice OK | Android 15s interval + realtime; iOS active trigger + 30s safety loop. |
| No service role client | Da codice OK | Service role solo in `server-only`; nessuna evidenza client. |
| Tempi propagazione reali | NOT_RUN_INTERACTIVE_LOGIN_REQUIRED | Non ho usato credenziali ne creato `SYNC_TEST_*` live. |

## Check eseguiti

Admin Web:

- `git diff --check` -> PASS.
- `npm run lint` -> PASS.
- `npm run typecheck` -> PASS (`next typegen` e `tsc --noEmit`).
- `npm run security:scan` -> FAIL:
  `src/server/shop-admin/import-export-workbook.ts must avoid direct table mutations and select-star`.
  Il file non era modificato da questo audit; l'ultimo commit che lo tocca e `75325dda TASK-090 lock import canonical algorithm parity`.

Android:

- `git diff --check` -> PASS.
- Primo `:app:testDebugUnitTest` -> FAIL ambientale: SDK location non trovata per assenza `local.properties`.
- Rerun con `ANDROID_HOME="$HOME/Library/Android/sdk"`:
  `:app:testDebugUnitTest --tests CatalogAutoSyncCoordinatorTest --tests HistorySessionPushCoordinatorTest --tests RealtimeRefreshCoordinatorTest --tests ShopContextTest`
  -> BUILD SUCCESSFUL in 8s, 32 task, 1 executed, 31 up-to-date.

iOS:

- `git diff --check` -> PASS.
- `xcodebuild -list -project iOSMerchandiseControl.xcodeproj` -> scheme `iOSMerchandiseControl`, target app e tests.
- XcodeBuildMCP `build_sim` su iPhone 17 iOS 26.4 -> SUCCEEDED in 5006ms, no warnings/errors.
- XcodeBuildMCP `test_sim` -> FAILED: 898 passed, 20 failed, 32 skipped.
  Fail principali non introdotti da questo audit: `ExcelAnalyzerHTMLParsingTests`,
  `SupabaseManualSyncReleaseUITests`, `SupabaseProductPriceManualPushServiceTests`,
  `Task089LargeDatasetBenchmarkTests`, `Task105RealOpsClosureTests`.
  Gli harness live cross-platform `Task098CrossPlatformSmokeTests` e
  `Task103CrossPlatformAcceptanceTests` sono skipped, quindi non danno tempi reali correnti.

## Tempi propagazione

Non ho misurato tempi live correnti perche richiedono:

1. Admin Web autenticato e shop selezionato.
2. Android autenticato nello stesso shop, foreground.
3. iOS autenticato nello stesso shop, foreground.
4. Autorizzazione a scrivere entita test con prefisso `SYNC_TEST_YYYYMMDD_HHMM_`.

Stima da codice, non misura live:

| Percorso | Trigger previsto | Bound atteso da codice |
| --- | --- | --- |
| Admin -> Android | `sync_events` Realtime + drain; fallback foreground interval | realtime quasi immediato; fallback max circa 15s in foreground. |
| Admin -> iOS | `sync_events` Realtime + drain; fallback safety loop | realtime dopo debounce 0.5s; fallback max circa 30s in foreground. |
| Android/iOS -> Admin | Nuova request Admin o refresh manuale | immediato solo al prossimo render server; tab aperta puo restare stale. |

## Rischi residui

1. Admin Web non ha ancora refresh automatico su tab gia aperta per modifiche mobile-origin.
   Fix suggerito: client component shop-scoped con `router.refresh()` su focus/visibility, throttle
   10-15s, e nessun reload completo.
2. `npm run security:scan` fallisce su `import-export-workbook.ts`; va triagiato in un task separato
   o collegato se si considera bloccante per sync.
3. Android `shared_sheet_sessions` Realtime non filtra `shop_id` nel canale; affidamento a JWT/RLS e
   apply path. Verificare publication/RLS live.
4. iOS suite completa non verde; i test automatic sync principali sono ampiamente passati, ma una
   baseline full green richiede fix dei test falliti o selezione mirata concordata.
5. Nessun dato live `SYNC_TEST_*` creato o pulito in questo audit.

## Prossima fase proposta

Aprire un task cross-repo in `EXECUTION` con due obiettivi stretti:

1. Admin Web: aggiungere refresh automatico leggero per shop pages su `visibilitychange`/focus, con
   throttle e test/lint/typecheck.
2. Live matrix manuale: con utente loggato sui tre client, creare categoria/fornitore/prodotto/history
   con prefisso `SYNC_TEST_...`, misurare Admin -> Android/iOS e Android/iOS -> Admin, poi cleanup.

File toccati da questo audit: `docs/sync-audit-admin-android-ios.md`.
