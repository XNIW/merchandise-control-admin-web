# Sync Performance Overhaul Audit

Ultimo aggiornamento: 2026-07-06 11:00 America/Santiago.

Stato finale corrente: `FAIL_WITH_EXACT_REMAINING_BOTTLENECKS`

Account test mascherato: `x***@gmail.com`.

Scope coperto: Admin Web, Android, iOS. Fuori scope e non toccati: Windows 7 Plus, Win7 POS, Cash Register System.

## Contratto sync finale

| Campo logico | Mapping corrente |
| --- | --- |
| `shop_id` | `sync_events.shop_id`; filtro canonico per Admin browser, Android e iOS quando lo shop e selezionato. |
| `entity_ids` | JSON `entity_ids`, con chiavi supportate `supplier_ids`, `category_ids`, `product_ids`, `price_ids`, `session_ids`. |
| `source` | `sync_events.source`, valori attesi `admin_web`, `android`, `ios`. |
| `client_event_id` / correlation | `sync_events.client_event_id`; Admin fixture espone correlation via prefisso/part. |
| `domain` / `entity_type` | `domain` e `metadata.entity_type` distinguono catalog, prices, history e lookup. |
| Watermark | Android/iOS avanzano solo fino al checkpoint applicato; evento blocked non viene superato dal checkpoint canonico. |
| Apply-status/dead-letter | Android usa Room `sync_event_apply_status`; iOS usa store locale UserDefaults per account hash. Entrambi registrano `event_id`, shop/scope, status, reason, attempt count e retry. |

## Patch consolidate

Admin Web:

- `src/server/shop-admin/sync-event-writer.ts`: retry breve su errori transitori insert `sync_events`, fallback legacy preservato, nessun successo silenzioso se l'evento fallisce.
- `tests/foundation/task-089-sync-architecture-excellence.test.mjs`: guardrail statico per retry compensation e contratto Realtime Admin.
- Staging deploy completato: Worker version `787f30c3-91b4-4814-9bd5-c50bdff0eaab`.

Android:

- `SyncEventModels.kt`, `AppDatabase.kt`, `InventoryRepository.kt`: apply-status per evento shop-scoped, versione Room 19, migration 18->19, status `applied`, `blocked`, `skipped`, `retrying`.
- `DefaultInventoryRepositoryTest.kt`, `AppDatabaseMigrationTest.kt`: regressioni per dirty local, missing IDs, oversize, missing remote, self-origin, applied success.
- Schema generato: `app/schemas/com.example.merchandisecontrolsplitview.data.AppDatabase/19.json`.

iOS:

- `SyncEventIncrementalApplyHelpers.swift`, `SyncEventIncrementalDomainApplyService.swift`: apply-status locale, blocked/skipped/applied, self-origin skip, dirty/missing/oversize/missing remote blocked.
- `CatalogIncrementalApplyService.swift`, `ProductPriceIncrementalApplyService.swift`, `HistoryIncrementalApplyService.swift`: conteggio missing remote per impedire checkpoint falso.
- `SyncEventIncrementalDomainApplyServiceTests.swift`: regressioni per gap, dirty, self-origin, missing remote, success.

## Limite Admin atomicita

La compensazione Admin e reale ma non e atomicita DB:

1. la mutation business continua a usare RPC/tabelle esistenti;
2. `writeAdminWebSyncEvent` inserisce `sync_events` dopo la mutation;
3. il nuovo codice ritenta errori transitori e torna `db_failure` se l'evento resta fallito;
4. non esiste ancora una migration/RPC unica che faccia mutation + evento nella stessa transazione Postgres.

Quindi l'accettazione "Admin mutation + sync_event atomici nello stesso RPC/transaction" resta fallita.

## Evidenza staging

- `npm run cf:check:staging`: `PASS` prima del deploy.
- `npm run cf:deploy:staging`: `PASS`, version `787f30c3-91b4-4814-9bd5-c50bdff0eaab`.
- `npm run cf:check:staging`: `PASS` dopo deploy.
- Browser laterale Codex: `/shop/products` aperto e autenticato.
- Route QA staging: `curl` senza cookie su `/shop/qa-sync-fixture?...confirm=nope` ritorna `HTTP 400` con `validation_failed`, quindi la route e pubblicata.
- Browser laterale Codex verso `/shop/qa-sync-fixture`: `FAIL_BLOCKED_BROWSER_CLIENT`, `net::ERR_BLOCKED_BY_CLIENT`.

## Matrice A-F finale

| Flusso | Stato | Causa |
| --- | --- | --- |
| A. Admin Web staging -> Android / iOS | `FAIL_BLOCKED_NO_FINAL_T0_T9` | T0 finale non parte dalla route QA nel Browser laterale. |
| B. Android -> Admin Web staging / iOS | `FAIL_BLOCKED_NO_LIVE_DEVICE_RUN` | Nessun nuovo run live Android finale timestampato. |
| C. iOS -> Admin Web staging / Android | `FAIL_BLOCKED_NO_LIVE_DEVICE_RUN` | Nessun nuovo run live iOS finale timestampato. |
| D. Android foreground/resume | `FAIL_BLOCKED_NO_FINAL_LIVE_RESUME_RUN` | Coperto da test locali, non da live finale con T0-T9. |
| E. iOS foreground/resume | `FAIL_BLOCKED_NO_FINAL_LIVE_RESUME_RUN` | Coperto da test simulator, non da live finale con T0-T9. |
| F. Admin Web browser visibility/focus | `FAIL_BLOCKED_NO_LIVE_EVENT` | Listener deployato e pagina aperta, ma nessun evento finale per misurare refresh. |

## Check reali

- Admin Web: security scan, foundation sync architecture, lint, typecheck, build, staging check, staging deploy, staging re-check: `PASS`.
- Android: test mirati repository + migration Room: `PASS`, `BUILD SUCCESSFUL in 23s`.
- Android: `testDebugUnitTest`, `:app:assembleDebug`, `:app:assembleDebugAndroidTest`: `PASS`, `BUILD SUCCESSFUL in 28s`.
- Android install APK: `PASS`, `:app:installDebug` e `:app:installDebugAndroidTest` installati su `Medium_Phone_API_35`.
- iOS: XcodeBuildMCP test mirato: `PASS`, 23 passed, 0 failed.
- Hygiene: `git diff --check` su tutti e tre i repo: `PASS`.

## Rischi residui

1. Un crash o timeout dopo mutation Admin ma prima di `sync_events` puo ancora lasciare business row senza evento; la compensazione riduce il rischio solo nella stessa request.
2. La route QA staging e accessibile lato HTTP, ma il Browser laterale la blocca; serve un percorso UI o fixture non bloccato dal browser per T0 ufficiale.
3. Apply-status mobile e verificato localmente/simulator, ma non ancora confrontato con eventi live finali Admin/Android/iOS.
4. La soglia <5s per product/history/category/supplier/foreground/focus non e dimostrata dal nuovo run finale.
