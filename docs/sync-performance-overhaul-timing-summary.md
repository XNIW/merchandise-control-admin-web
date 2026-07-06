# Sync Performance Overhaul Timing Summary

Status: `FAIL_WITH_EXACT_REMAINING_BOTTLENECKS`

Data: 2026-07-06 11:00 America/Santiago

Account test: `x***@gmail.com`

Staging Admin Web: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`

Deploy staging: `PASS`, Cloudflare Worker version `787f30c3-91b4-4814-9bd5-c50bdff0eaab`. Nessun deploy production, nessun commit, nessun push.

## Risultato

Il recuperabile locale e stato consolidato: Admin Web ora rifiuta il successo silenzioso quando la scrittura `sync_events` fallisce e ritenta errori transitori; Android e iOS registrano apply-status/dead-letter locali per evento nei percorsi incrementali testati. Non dichiaro `PASS_SYNC_PERFORMANCE_OVERHAUL`: la matrice live finale T0-T9 non ha prodotto timestamp ufficiali end-to-end su staging pubblico.

## Bottleneck esatti rimanenti

| Area | Stato | Bottleneck esatto |
| --- | --- | --- |
| Admin T0/T1/T2/T3 | `FAIL_BLOCKED_BROWSER_CLIENT` | Il Browser laterale Codex e autenticato su `/shop/products`, ma la navigazione alla route staging `/shop/qa-sync-fixture` e stata bloccata dal client con `net::ERR_BLOCKED_BY_CLIENT`. La route e pubblicata: `curl` senza cookie ritorna `400 validation_failed`. |
| Admin atomicita evento | `FAIL_COMPENSATION_ONLY` | `writeAdminWebSyncEvent` ora ritenta e non maschera il fallimento, ma business mutation e insert `sync_events` restano operazioni separate, non una singola transazione/RPC DB. |
| Admin Realtime T4/T9 | `FAIL_BLOCKED_NO_LIVE_EVENT` | `ShopShell` e deployato con listener Realtime browser shop-scoped, ma dopo deploy non e arrivato un nuovo evento finale su cui misurare receive e refresh. |
| Android live T5-T8 | `FAIL_BLOCKED_NO_FINAL_LIVE_HARNESS` | Apply-status/dead-letter e coperto dai test Room/repository; nessun run live Android con prefisso finale ha prodotto timestamp targeted fetch/apply/UI. |
| iOS live T5-T8 | `FAIL_BLOCKED_NO_FINAL_LIVE_HARNESS` | Apply-status/dead-letter e coperto dai test simulator; nessun run live iOS con prefisso finale ha prodotto timestamp targeted fetch/apply/UI. |
| A-F cross-platform | `FAIL_BLOCKED_NO_CROSS_PLATFORM_LIVE_MATRIX` | Non esiste una matrice finale nuova Admin/Android/iOS con T0-T9, min/media/max e soglia <5s per product/history/category/supplier/foreground/focus. |

## Check eseguiti

| Area | Check | Stato |
| --- | --- | --- |
| Admin Web | `npm run security:scan` | `PASS` |
| Admin Web | `WIN7POS_REPO_PATH=/tmp/merchandise-control-admin-web-win7pos-not-in-scope node --test tests/foundation/task-089-sync-architecture-excellence.test.mjs` | `PASS`, 8 pass, 1 skip fuori scope |
| Admin Web | `npm run lint` | `PASS` |
| Admin Web | `npm run typecheck` | `PASS` |
| Admin Web | `npm run build` | `PASS` |
| Admin Web | `npm run cf:check:staging` prima e dopo deploy | `PASS` |
| Admin Web | `npm run cf:deploy:staging` | `PASS`, version `787f30c3-91b4-4814-9bd5-c50bdff0eaab` |
| Android | `./gradlew testDebugUnitTest --tests ...DefaultInventoryRepositoryTest --tests ...AppDatabaseMigrationTest --console=plain` | `PASS`, `BUILD SUCCESSFUL in 23s` |
| Android | `./gradlew testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --console=plain` | `PASS`, `BUILD SUCCESSFUL in 28s` |
| Android | `./gradlew :app:installDebug :app:installDebugAndroidTest --console=plain` | `PASS`, installed app and androidTest APK on `Medium_Phone_API_35` |
| iOS | XcodeBuildMCP `test_sim` su `SyncEventIncrementalDomainApplyServiceTests` e `Task119AutomaticArchitectureTests` | `PASS`, 23 passed, 0 failed |
| Hygiene | `git diff --check` su Admin Web / Android / iOS | `PASS` |

## T0-T9 finale

| Label | Stato | Evidenza |
| --- | --- | --- |
| `T0_ui_submit` | `FAIL_BLOCKED_BROWSER_CLIENT` | Browser laterale blocca la route QA staging. |
| `T1_server_mutation_start` | `FAIL_BLOCKED_T0` | Nessun submit ufficiale finale ha raggiunto il server. |
| `T2_server_mutation_done` | `FAIL_BLOCKED_T0` | Nessun submit ufficiale finale ha completato mutation server. |
| `T3_sync_event_created` | `FAIL_BLOCKED_T0_AND_ATOMICITY` | Nessun evento finale creato; atomicita DB ancora non implementata. |
| `T4_realtime_received` | `FAIL_BLOCKED_NO_LIVE_EVENT` | Nessun evento finale su cui misurare receive. |
| `T5_targeted_fetch_start` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun harness live mobile finale. |
| `T6_targeted_fetch_done` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun harness live mobile finale. |
| `T7_local_apply_done` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun harness live mobile finale. |
| `T8_local_store_or_ui_visible` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun harness live mobile finale. |
| `T9_other_platform_visible_or_admin_refresh_done` | `FAIL_BLOCKED_NO_CROSS_PLATFORM_LIVE_MATRIX` | Matrice A-F finale non completata. |
