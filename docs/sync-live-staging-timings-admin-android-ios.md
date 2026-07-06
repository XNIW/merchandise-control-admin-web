# QA live staging sync - Admin Web / Android / iOS

Data: 2026-07-06

Stato finale corrente: `FAIL_WITH_EXACT_REMAINING_BOTTLENECKS`

Account test nel report: `x***@gmail.com`

Staging Admin Web: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`

Evidence finale: `/tmp/sync-performance-overhaul-evidence-20260706-1100-final`

## Stato live finale

Il precedente report storico `SYNC_TEST_20260705_2007_FULL_` resta utile come evidence aggregata, ma non soddisfa la richiesta finale `SYNC_PERF_YYYYMMDD_HHMM_FINAL_` con label T0-T9, matrice A-F e soglia normale <5s.

Nel run finale 2026-07-06:

- Deploy staging Admin Web: `PASS`, Worker version `787f30c3-91b4-4814-9bd5-c50bdff0eaab`.
- Smoke workers.dev: `PASS` prima e dopo deploy.
- Browser laterale Codex: `/shop/products` aperto con sessione autenticata.
- Route QA staging pubblicata: `curl` senza cookie ritorna `400 validation_failed`.
- Browser laterale Codex verso `/shop/qa-sync-fixture`: `FAIL_BLOCKED_BROWSER_CLIENT`, `net::ERR_BLOCKED_BY_CLIENT`.
- Android local full debug/unit/assemble: `PASS`, `BUILD SUCCESSFUL in 28s`.
- Android install debug/androidTest: `PASS`, app e androidTest APK installati su `Medium_Phone_API_35`.

## T0-T9 finale

| Label | Stato | Motivo |
| --- | --- | --- |
| `T0_ui_submit` | `FAIL_BLOCKED_BROWSER_CLIENT` | Il Browser laterale blocca la route QA staging. |
| `T1_server_mutation_start` | `FAIL_BLOCKED_T0` | Nessun submit finale ufficiale ha raggiunto il server. |
| `T2_server_mutation_done` | `FAIL_BLOCKED_T0` | Nessun submit finale ufficiale ha completato mutation. |
| `T3_sync_event_created` | `FAIL_BLOCKED_T0_AND_ATOMICITY` | Nessun evento finale creato; atomicita DB non implementata. |
| `T4_realtime_received` | `FAIL_BLOCKED_NO_LIVE_EVENT` | Nessun evento finale per misurare receive. |
| `T5_targeted_fetch_start` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun run live finale Android/iOS. |
| `T6_targeted_fetch_done` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun run live finale Android/iOS. |
| `T7_local_apply_done` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun run live finale Android/iOS. |
| `T8_local_store_or_ui_visible` | `FAIL_BLOCKED_NO_MOBILE_LIVE_HARNESS` | Nessun run live finale Android/iOS. |
| `T9_other_platform_visible_or_admin_refresh_done` | `FAIL_BLOCKED_NO_CROSS_PLATFORM_LIVE_MATRIX` | Matrice A-F finale non completata. |

## Matrice A-F finale

| Flusso | Stato | Evidenza |
| --- | --- | --- |
| A. Admin Web staging -> Android / iOS | `FAIL_BLOCKED_NO_FINAL_T0_T9` | T0 finale bloccato dal Browser laterale sulla route QA. |
| B. Android -> Admin Web staging / iOS | `FAIL_BLOCKED_NO_LIVE_DEVICE_RUN` | Nessun nuovo run live Android finale timestampato. |
| C. iOS -> Admin Web staging / Android | `FAIL_BLOCKED_NO_LIVE_DEVICE_RUN` | Nessun nuovo run live iOS finale timestampato. |
| D. Android foreground/resume | `FAIL_BLOCKED_NO_FINAL_LIVE_RESUME_RUN` | Test locali passano, live finale assente. |
| E. iOS foreground/resume | `FAIL_BLOCKED_NO_FINAL_LIVE_RESUME_RUN` | Test simulator passano, live finale assente. |
| F. Admin Web browser visibility/focus | `FAIL_BLOCKED_NO_LIVE_EVENT` | Pagina autenticata aperta, ma nessun evento finale per misurare refresh. |

## Evidence storica non finale

Il run storico `SYNC_TEST_20260705_2007_FULL_` aveva evidenze aggregate:

- Admin Web staging -> Android/iOS: pass storico.
- Android -> Admin/iOS: pass storico.
- iOS -> Admin/Android: pass storico.
- Android/iOS foreground/resume: pass storico.
- Admin browser visibility/focus: pass storico.

Non viene usato per dichiarare `PASS_SYNC_PERFORMANCE_OVERHAUL`, perche non contiene la matrice finale T0-T9 richiesta.
