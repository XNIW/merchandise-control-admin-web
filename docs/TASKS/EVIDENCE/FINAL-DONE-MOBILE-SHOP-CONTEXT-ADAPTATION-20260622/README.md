# Final DONE Review - Mobile Shop Context

Date: 2026-06-22

Final status: DONE_RECONCILED

## Scope finale

Review/fix finale cross-platform per Mobile Shop Context su:

- Admin Web / Supabase contract.
- Android runtime, UI Inventory, sync, cache, outbox, watermark, device gate.
- iOS runtime, UI Inventory, banner sync compatto, sync, cache, outbox, watermark, device gate.

Fuori scope e non modificati: Win7POS, Cash Register System.

## Stato iniziale

- Worktree gia sporche nei tre repo, con modifiche ed evidence precedenti.
- Nessun reset, checkout, stage, commit o push eseguito.
- Admin Web conteneva una directory `app/` Android-shaped vuota al root, che faceva scegliere a Next.js l'App Router sbagliato rispetto a `src/app`.
- iOS full `test_sim` esponeva failure storiche/stale non legate al Mobile Shop Context, ma i test mirati core erano riproducibili e correggibili.

## Repo analizzati

- Admin Web: `/Users/minxiang/Projects/merchandise-control-admin-web`
- Android: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`
- iOS: `/Users/minxiang/Desktop/iOSMerchandiseControl`

## File principali letti

- Admin Web: `AGENTS.md`, `docs/MASTER-PLAN.md`, evidence recenti richieste, `package.json`, `tsconfig.json`, `supabase/migrations/20260622160000_mobile_shop_context_switcher.sql`, `src/lib/supabase/database.types.ts`, `tests/foundation/mobile-shop-context-switcher.test.mjs`, codice Supabase/server POS/shop admin rilevante.
- Android: `AGENTS.md`, `CLAUDE.md`, `docs/MASTER-PLAN.md`, `MerchandiseControlApplication.kt`, `ShopContext.kt`, `InventoryRepository.kt`, sync/realtime/device/cache DAO, `FilePickerScreen.kt`, test ShopContext/device/repository/UI.
- iOS: `AGENTS.md`, `CLAUDE.md`, `docs/MASTER-PLAN.md`, `ContentView.swift`, `InventoryHomeView.swift`, `Sync/ShopContext/ShopContext.swift`, `LocalPendingChange.swift`, outbox, history, watermark, device registration, Task118/ShopContext/SyncEvent/LocalPending tests.

## Diff analizzato

- `git status --short`, `git diff --stat` e `git diff --check` eseguiti nei tre repo.
- `git diff --check` finale: PASS in Admin Web, Android e iOS.
- Diff iOS molto ampio per evidenze storiche non tracciate gia presenti; la review ha separato il materiale storico dalla nuova evidence finale.

## Fix applicati durante la review

### Admin Web

- `package.json`: `typecheck` ora esegue `next typegen`, rimuove `.next/types` stale e poi `tsc --noEmit`, per evitare validatori obsoleti dopo Next 16.
- `tsconfig.json`: include aggiornato con `.next/dev/types/**/*.ts` e `.next/types/**/*.ts`.
- Rimossa directory vuota root `app/` creata per errore nel repo Admin Web; Next tornava a produrre solo `/404` perche shadowava `src/app`.

### Android

- `ShopContext.kt`: `mobile_linked_shops ok=false` e fetch error diventano blocco sync, non falsa UX legacy pulita.
- `LinkedShop`: aggiunti status membership/shop e filtro `canBeSelected`.
- `ShopContext.kt`: loading state reso fail-closed (`syncAllowed=false`); se cambia account durante refresh, selected shop/linked shops precedenti vengono puliti subito.
- `MerchandiseControlApplication.kt`: register/realtime/polling/sync saltano quando `syncAllowed=false` o `isLoading=true`.
- `InventoryRepository.kt` + `CatalogSyncViewModel.kt`: snapshot local DB/outbox conta solo lo scope selected shop.
- `FilePickerScreen.kt`: header shop sopra il titolo, storefront icon, no switcher/chevron con un solo shop.
- Test aggiunti/aggiornati per fetch error, revoked membership, loading fail-closed, cambio account in loading e outbox shop-scoped.

### iOS

- `ShopContext.swift`: `ok=false` RPC e fetch error bloccano sync senza salvare fallback anonimo.
- `ContentView.swift`: bootstrap/register/refresh rispettano `syncAllowed`; cambio shop registra heartbeat shop-aware; banner root compatto con padding riservato per non coprire header e titolo.
- `InventoryHomeView.swift`: shop row sopra `Inventario`, rimosso titolo duplicato interno.
- `WatermarkStore.swift`: watermark shop-scoped non eredita watermark legacy owner/account.
- `HistoryEntry.swift`, manual/automatic history sync e incremental apply: history shop-scoped, niente upload/prune/apply cross-shop.
- `LocalPendingChange.swift`: dirty history count usa scope shop quando presente.
- `LocalOutboxStore.swift`, `SyncEventOutboxDrainService.swift`, `SyncActivityRegistrationService.swift`, `SyncDecisionInputProvider.swift`: lane legacy usa `storeId=nil`, lane shop usa store id selezionato.
- Test aggiunti/aggiornati per ShopContext, Watermark, History, pending/outbox e banner no-op.

## Android/iOS Parity Matrix

| Area | Stato | Nota |
| --- | --- | --- |
| 1. LinkedShop model | PARI | Entrambe filtrano membership/shop invalidi; Android corretto con status membership/shop. |
| 2. SelectedShop / ShopContext | PARI | Account-scoped, selected shop reale guida runtime. |
| 3. Fetch mobile_linked_shops | PARI | `ok=false`/fetch error bloccano sync, non degradano a 0-shop pulito. |
| 4. Persistence account-scoped | PARI | Nessun leak tra account; cambio account resetta selected shop. |
| 5. Auto-select 1 shop | PARI | Nome visibile, nessun switcher. |
| 6. Multi-shop selector | PARI | Selector/sheet test-backed; visual runtime corrente e 1-shop. |
| 7. Revoked/suspended reset | PARI | Shop non selezionabili scartati; fallback a 1 valido o legacy pulita. |
| 8. Fetch error blocking | PARI | Android loading race corretto fail-closed; iOS gia riprende solo se `syncAllowed`. |
| 9. Inventory UI | PARI CON DIFFERENZA DI PIATTAFORMA GIUSTIFICATA | Stessa gerarchia: shop row, titolo, card; styling nativo diverso. |
| 10. Sync event p_shop_id | PARI | RPC/mapper usano `p_shop_id`/shop id selected. |
| 11. Fetch/realtime shop_id | PARI | Query/realtime shop-aware; Android non avvia componenti remoti durante loading. |
| 12. Pending/outbox | PARI | Android snapshot scoped; iOS legacy optional store fix. |
| 13. Watermark/cache | PARI | iOS non eredita legacy; Android reset/cache scoped coperto. |
| 14. History scope | PARI | iOS history shop-scoped; Android history push/coordinator shop-aware. |
| 15. Device auth | PARI | Guard shop-specific; iOS heartbeat su cambio shop; Android skip durante loading. |
| 16. Legacy 0-shop lane | PARI | 0-shop resta pulito; errori reali bloccano sync e non fingono legacy. |
| 17. Banner/status | PARI CON DIFFERENZA DI PIATTAFORMA GIUSTIFICATA | iOS compatto/no loop no-op; Android banner temporaneo sparisce e non resta persistente. |
| 18. Visual QA | PARI CON DIFFERENZA DI PIATTAFORMA GIUSTIFICATA | 1-shop verificato su emulator/simulator; 0/N coperti da test. |
| 19. Tests | PARI CON DIFFERENZA DI PIATTAFORMA GIUSTIFICATA | Core targeted verdi su entrambe; iOS full stale e classificato come follow-up non core. |

Nessuna riga resta `NON PARI` sui requisiti core.

## Admin Web contract review

- Migration/RPC: `mobile_linked_shops`, `record_sync_event(p_shop_id)`, `shop_device_status_for_shop`, `shop_device_register_for_shop` presenti nella migration 20260622160000.
- RLS/security: contract test copre non-member, inactive membership, legacy senza `p_shop_id`, `p_shop_id` valido e shop authorization server-side.
- Types: `database.types.ts` include `p_shop_id` e RPC aggiornate.
- Cloud dev: evidence recenti indicano migration applicata e rimozione PGRST202; nessun secret stampato in questa review.
- Next.js: letti docs in `node_modules/next/dist/docs/01-app/...`; fix root `app/` ha ripristinato route reali in build e smoke.

## Android runtime review

- UI Inventory: 0 shop pulita test-backed; 1 shop mostra nome sopra `Inventory` senza switcher; 2+ selector test-backed.
- Sync/catalog/history/prices/realtime: selected shop propagato a query, payload, event, subscription e cache reset.
- Cache/watermark/outbox: business cache isolata per owner/shop/legacy; outbox snapshot selected-shop scoped.
- Device gate: usa funzioni shop-specific e cache non autorizza shop B con stato di shop A.
- Loading/race: durante `refresh(ownerUserId)` lo stato Android e fail-closed; `syncAllowed=false`, e su cambio account non espone lo shop precedente.

## iOS runtime review

- UI Inventory: shop row in alto a sinistra sopra `Inventario`, no titolo duplicato, no switcher con un solo shop.
- Banner iOS: compatto, floating, con top padding quando visibile; screenshot dopo 42s conferma sparizione su no-op.
- Root cause banner: safety loop ogni 30s usava trigger equivalente a remote work; il fix mantiene remoteSyncEvent per eventi reali e usa foreground/no-op path per polling senza riaccendere checking.
- Sync/cache/watermark/outbox/history: selected shop guida payload, query, pending, outbox, watermark e history; legacy lane usa `storeId=nil`.
- Device gate: register/status shop-aware e heartbeat su shop change solo quando `syncAllowed`.

## Security review

- Nessun secret o service-role introdotto lato client/mobile.
- Selected shop client non e autorita sufficiente: RPC server valida membership e `p_shop_id`.
- `mobile_linked_shops` restituisce solo shop autorizzati e attivi; inactive/revoked non selezionabili.
- Device gate e outbox/pending sono shop-scoped; niente mixing shop A/B nei path corretti.
- Legacy fallback controllato: 0-shop resta UX pulita; errori reali bloccano sync senza inventare contesto legacy.

## Performance / Cleanup review

- Rimosso elemento superfluo reale: directory root `app/` vuota dentro Admin Web, creata nel repo sbagliato.
- Nessun polling loop inutile residuo per banner iOS no-op: test Task118 targeted passa.
- Nessuna nuova dipendenza introdotta.
- Non cancellate migration, test o evidence utili.

## Visual QA

- Android screenshot: `screenshots/android-inventory-final.png`
- Android UI dump: `screenshots/android-window-final.xml`
  - Evidenza XML: shop `TASK068E REHEARSAL 260618231325`, poi `Inventory`, poi card file.
  - Nessun testo selector/choose shop nella configurazione 1-shop.
  - Screenshot finale post-attesa: nessun banner persistente copre lo shop header.
- iOS initial screenshot: `screenshots/ios-inventory-initial.jpg`
  - Banner compatto visibile, shop row e titolo non coperti.
- iOS after 42s: `screenshots/ios-inventory-after-42s.jpg`
  - Banner assente, layout stabile.
- 0-shop e 2+ shop: non verificati con account runtime reale in questa review; coperti da test automatici equivalenti.

## Test/check eseguiti

### Admin Web

- `npm run security:scan`: PASS, "Security scan passed."
- `npm run test:foundation`: PASS, 459/459.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS (`next typegen && rm -rf .next/types && tsc --noEmit`).
- `npm run build`: PASS dopo rimozione root `app/`; route App reali presenti. Warning residui noti: deprecazione Next `middleware` -> `proxy`, Node `[DEP0205] module.register()`.
- `npm run test:ui-smoke:ci`: PASS, 48/48.
- `npm run verify`: PASS.
- `git diff --check`: PASS.

### Android

- `./gradlew :app:testDebugUnitTest`: PASS, BUILD SUCCESSFUL.
- Primo rerun closure di `:app:testDebugUnitTest`: FAIL strumentale Gradle `NoSuchFileException ... in-progress-results-generic.bin`; risolto eliminando solo artifact generati `app/build/test-results/testDebugUnitTest`, `app/build/reports/tests/testDebugUnitTest`, `app/build/tmp/testDebugUnitTest` e rilanciando.
- `./gradlew :app:testDebugUnitTest --rerun-tasks`: PASS, BUILD SUCCESSFUL.
- `./gradlew :app:assembleDebug`: PASS, BUILD SUCCESSFUL.
- `./gradlew lint`: PASS, BUILD SUCCESSFUL.
- Targeted ShopContext/device/repository/RealtimeRefresh/FilePicker: PASS, BUILD SUCCESSFUL.
- `./gradlew :app:installDebug`: PASS su `Medium_Phone_API_35(AVD) - 15`.
- `git diff --check`: PASS.

### iOS

- `XcodeBuildMCP session_show_defaults`: PASS, progetto/scheme/simulator corretti.
- `XcodeBuildMCP build_sim -quiet`: PASS, `SUCCEEDED`, warnings `[]`, build log `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/logs/build_sim_2026-06-23T00-02-26-222Z_pid21071_bae87a24.log`.
- Targeted ShopContext/LocalPending/SyncEvent/History/Watermark/Task118: PASS, 103/103, xcresult `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/result-bundles/test_sim_2026-06-23T00-02-42-431Z_pid21071_58dfa689.xcresult`.
- Full `test_sim`: NOT_GREEN, 891 passed, 18 failed, 32 skipped, log `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/logs/test_sim_2026-06-22T23-52-35-481Z_pid21071_de4672e5.log`, xcresult `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/result-bundles/test_sim_2026-06-22T23-52-35-481Z_pid21071_01d183c2.xcresult`.
- `git diff --check`: PASS.

## iOS full test failure classification

Le 18 failure full-suite sono state rilanciate e classificate una per una. Nessuna e correlata a Mobile Shop Context, selected shop, banner no-op, outbox, watermark, history scope o device gate.

| # | Test | File | Messaggio/marker | Area | Causa | Azione |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `testTask067DebugOutboxCardRemainsDebugOnlyAndSeparateFromReleaseCard` | `SupabaseManualSyncReleaseUITests.swift:678` | manca `private struct SupabaseManualSyncReleaseCard` | Release/source-scanner | Test stale su struct rimossa/rinominata in `OptionsView.swift` | Follow-up non core |
| 2 | `testTask067ManualSyncReleaseSourcesAvoidForbiddenScope` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Helper `extractReleaseCardSource` obsoleto | Follow-up non core |
| 3 | `testTask067ReleaseCardSourceAvoidsDeveloperJargon` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Test cerca confine sorgente storico | Follow-up non core |
| 4 | `testTask069ReadOnlyReleaseSourcesAvoidForbiddenLiveCalls` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 5 | `testTask072ReleaseCardDeclaresProminentActionStylesForCardAndSheet` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 6 | `testTask072ReleaseCardRendersPresentationStateOnly` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 7 | `testTask074ReleaseCardRendersPreparedSummaryOnly` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 8 | `testTask074SummaryIsNotPersistedByReleaseSurface` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 9 | `testTask077ReleaseCardRendersReviewSheetFromPreparedPresentationOnly` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 10 | `testTask081ActivityRegistrationDrainIsAdapterOwned` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 11 | `testTask092RootForegroundHostUsesPresenterSharedViewModelAndBusyGating` | `SupabaseManualSyncReleaseUITests.swift:685` | manca `private struct SupabaseManualSyncForegroundRootHost` | Release/source-scanner | Root host oggi e `AppSyncRootHost`, test punta al nome storico | Follow-up non core |
| 12 | `testTask092RootForegroundSourcesAvoidForbiddenAutomationScope` | `SupabaseManualSyncReleaseUITests.swift:685` | manca foreground host marker | Release/source-scanner | Helper `extractRootForegroundHostSource` obsoleto | Follow-up non core |
| 13 | `testTask092WorkflowBusyGatingIsDeclaredOnInteractiveSurfaces` | `SupabaseManualSyncReleaseUITests.swift:582` | manca marker `.foregroundCloudWorkflowActivity(.manualSyncSheet` | Release/source-scanner | Marker test storico non allineato alle superfici correnti | Follow-up non core |
| 14 | `testTask109ReleaseCardUsesConfirmationDialogsOnlyForMutations` | `SupabaseManualSyncReleaseUITests.swift:678` | manca release card marker | Release/source-scanner | Harness source-scan non aggiornato | Follow-up non core |
| 15 | `testTask110OptionsCheckCloudRunsHistorySyncPath` | `SupabaseManualSyncReleaseUITests.swift:632-640` | assert su stringhe Options storiche | Release/source-scanner | Test fragile su implementazione Options precedente | Follow-up non core |
| 16 | `testSourceContainsNoUpsertRetryOrScopeExtras` | `SupabaseProductPriceManualPushServiceTests.swift:710` | cerca file root `SupabaseProductPriceManualPushService.swift` inesistente | ProductPrice/source-scanner | File spostato sotto `Sync/Manual/` | Follow-up non core |
| 17 | `testPreviewSourceHasNoSyncEventOrProductPriceWritePath` | `SupabaseProductPricePreviewServiceTests.swift:319` | cerca ordine funzioni in `SupabaseTransportClient.swift` | ProductPrice/source-scanner | Funzioni preview/push sono in adapter separati, test non aggiornato | Follow-up non core |
| 18 | `testLG1PreviewMediumSyntheticReadMostlyBenchmark` | `Task089LargeDatasetBenchmarkTests.swift:29,31,39` | atteso 5000/11, reale 1000/2 | Benchmark | Spec benchmark storico non allineato al cap preview corrente | Follow-up non core |

## Elementi superflui eliminati

- Admin Web: directory vuota top-level `app/` eliminata perche shadowava `src/app` in Next 16.
- Android: rimossi solo artifact generati Gradle corrotti sotto `app/build/test-results/testDebugUnitTest`, `app/build/reports/tests/testDebugUnitTest`, `app/build/tmp/testDebugUnitTest`; nessun sorgente cancellato.
- Nessuno screenshot/evidence utile eliminato.

## Rischi residui concreti

- iOS full suite non e completamente verde: restano 18 failure storiche classificate nella tabella sopra e nel follow-up `IOS-FULL-TEST-STALE-FOLLOW-UP.md`; non bloccano il DONE core Mobile Shop Context.
- Multi-shop A/B live switch non eseguito con account reale nella visual QA finale; copertura automatica e contract review presenti.
- 0-shop visual live non eseguita con account reale; copertura automatica presente.
- Admin Web mantiene warning build Next `middleware` deprecato verso `proxy`, non introdotto da questo scope.
- Worktree contengono modifiche/evidence precedenti non tracciate; non sono state revertite per policy.

## Stato finale

DONE_RECONCILED

Motivo: i requisiti core sono pari tra Android e iOS, il selected shop guida sync/device/pending/outbox/cache/watermark/history, Android non e piu fail-open durante loading del contesto shop, il banner iOS non si riaccende per no-op, la UX 0/1/N shop e coperta, Admin Web build/smoke/typecheck sono verdi, Android e iOS core targeted sono verdi, visual QA runtime 1-shop e stata aggiornata e le 18 failure iOS full-suite sono classificate come follow-up non core.
