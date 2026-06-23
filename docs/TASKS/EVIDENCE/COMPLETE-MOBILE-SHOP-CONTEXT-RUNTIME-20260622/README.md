# Complete Mobile Shop Context Runtime - Evidence 2026-06-22

## Status

READY_FOR_REVIEW_WITH_KNOWN_TYPECHECK_FAILURE.

Non marcato DONE. La policy UX/runtime Mobile Shop Context e stata implementata su Android e iOS con contratto Admin/Supabase aggiornato. Resta un gate Admin `npm run typecheck` in failure dentro il validator generato da `next typegen` (`.next/dev/types/validator.ts`), da rivalutare in REVIEW o in fix dedicato Next/typegen.

## Scope implementato

- Admin Web / Supabase contract:
  - `mobile_linked_shops()` espone solo membership attive su shop attivi.
  - `shop_device_register_for_shop(...)` e `shop_device_status_for_shop(...)` sono membership-first e non espongono metadata a caller non autorizzati.
  - `record_sync_event(...)` resta legacy-compatible e aggiunge `p_shop_id` trailing/defaulted.
  - Idempotency `sync_events` separata per legacy owner-only e shop-scoped.
- Android:
  - Runtime `ShopContext` con linked shops, selected shop, account-scoped persistence e revoca/reset.
  - Inventory Home mostra nome shop solo quando esiste un selected shop valido; selector solo con 2+ shop.
  - Sync catalog/history/prices/realtime/outbox/watermark usa `selectedShop`.
  - Legacy 0-shop resta owner-only e usa firme/metodi storici.
  - Device gate usa `shop_device_*_for_shop` quando c'e selected shop, con cache status separata per shop.
- iOS:
  - Runtime Shop Context e UI Inventory Home equivalenti.
  - Sync/catalog/history/prices/outbox/realtime/RPC request mapper propagano `shopID`.
  - Store scope e selected shop restano account-scoped e reset-safe.

## Policy UX verificata

| Caso | Android | iOS |
| --- | --- | --- |
| 0 shop | `selectedShop == null`, `activeShopId == null`, no selector, `shopScopedStoreScope == ""` | `testZeroLinkedShopsKeepsLegacyCleanPresentation` |
| 1 shop | auto-select, mostra nome, no selector, store `shop:<id>` | `testOneLinkedShopAutoSelectsAndShowsNameWithoutSwitcher` |
| 2+ shop | selected shop ripristinato, nome attivo, selector true | `testMultipleLinkedShopsSwitchesSelectedShopAndSyncStoreScopeTogether` |
| cambio account | selected shop store account-scoped | `testSelectedShopPersistenceIsAccountScoped` |
| shop revocato | selected invalido resettato; se nessun valido torna legacy | `testRevokedPersistedShopFallsBackToOnlyRemainingValidShop`, `testRevokedOnlyShopClearsSelectionAndReturnsLegacyPresentation` |

## File principali

- Admin:
  - `supabase/migrations/20260622160000_mobile_shop_context_switcher.sql`
  - `tests/foundation/mobile-shop-context-switcher.test.mjs`
- Android:
  - `app/src/main/java/com/example/merchandisecontrolsplitview/data/ShopContext.kt`
  - `app/src/main/java/com/example/merchandisecontrolsplitview/MerchandiseControlApplication.kt`
  - `app/src/main/java/com/example/merchandisecontrolsplitview/ui/screens/FilePickerScreen.kt`
  - `app/src/main/java/com/example/merchandisecontrolsplitview/ui/navigation/NavGraph.kt`
  - `app/src/main/java/com/example/merchandisecontrolsplitview/data/InventoryRepository.kt`
  - `app/src/main/java/com/example/merchandisecontrolsplitview/data/ShopDeviceRegistrationRemoteDataSource.kt`
  - `app/src/test/java/com/example/merchandisecontrolsplitview/data/ShopContextTest.kt`
  - `app/src/test/java/com/example/merchandisecontrolsplitview/data/ShopDeviceAuthorizationRepositoryTest.kt`
- iOS:
  - `iOSMerchandiseControl/Sync/ShopContext/ShopContext.swift`
  - `iOSMerchandiseControl/InventoryHomeView.swift`
  - `iOSMerchandiseControl/ContentView.swift`
  - `iOSMerchandiseControl/Sync/**`
  - `iOSMerchandiseControlTests/ShopContextTests.swift`

## Checks eseguiti

Admin Web:

- PASS `node --test tests/foundation/mobile-shop-context-switcher.test.mjs` - 5 pass.
- PASS `npm run test:foundation` - 459 pass.
- PASS `npm run lint`.
- PASS `npm run security:scan`.
- PASS `git diff --check`.
- FAIL `npm run typecheck`:
  - `next typegen && tsc --noEmit`
  - Next reintroduce automaticamente `.next/dev/types/**/*.ts` in `tsconfig.json`.
  - Failure generata: `.next/dev/types/validator.ts(25,44)` e `(25,75)` con `Type 'Route' does not satisfy the constraint 'never'`.

Android:

- PASS `./gradlew :app:compileDebugKotlin`.
- PASS `./gradlew :app:testDebugUnitTest --tests com.example.merchandisecontrolsplitview.data.ShopContextTest --tests com.example.merchandisecontrolsplitview.data.ShopDeviceAuthorizationRepositoryTest`.
- PASS targeted recovery run including previously failing sync/viewmodel suites:
  - `DefaultInventoryRepositoryTest`
  - `HistorySessionPushCoordinatorTest`
  - `CatalogSyncViewModelTest`
  - `ShopContextTest`
  - `ShopDeviceAuthorizationRepositoryTest`
- PASS `./gradlew :app:testDebugUnitTest` - 552 tests, 0 failed, 5 skipped.
- PASS `./gradlew :app:assembleDebug`.
- PASS `git diff --check`.

iOS:

- PASS XcodeBuildMCP `session_show_defaults`:
  - project `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl.xcodeproj`
  - scheme `iOSMerchandiseControl`
  - simulator `iPhone 17 Pro`
- PASS XcodeBuildMCP `build_sim -quiet`.
- PASS XcodeBuildMCP `test_sim -quiet -only-testing:iOSMerchandiseControlTests/ShopContextTests` - 6 pass.
- PASS XcodeBuildMCP sync-event targeted tests - 2 pass:
  - `SyncEventLiveRecorderTests/testShopScopedRequestMapsShopIDToRPCParamsAndResponse`
  - `SyncEventRecordingTests/testIncrementalSyncEventFetchSelectsShopIDColumn`
- PASS `git diff --check`.

## Errori incontrati e fix

- Android full unit iniziale: 49 failure su 552.
  - Root cause: il codice legacy 0-shop chiamava overload nuovi con `selectedShop = null`, rompendo MockK/fake legacy e saltando alcuni override reali (`syncCatalogQuickWithEvents` default interface).
  - Fix: branch espliciti legacy quando `selectedShop == null`, overload legacy espliciti in `DefaultInventoryRepository`, e gate device shop-scoped solo quando esiste selected shop.
  - Esito dopo fix: full `:app:testDebugUnitTest` PASS.
- Admin `typecheck`: workaround tsconfig non mantenibile perche `next typegen` reintroduce `.next/dev/types/**/*.ts`. Non forzato.

## Residui e rischi

- `npm run typecheck` Admin resta rosso su output generato Next `.next/dev/types/validator.ts`.
- Non eseguiti smoke live con Supabase reale per switch shop A/B su account multi-shop.
- Non eseguiti Android instrumentation/UI screenshot test; copertura Android e JVM/unit + full unit suite.
- Non eseguito iOS full test suite, solo build sim + ShopContextTests + sync-event tests mirati.
- Worktree gia dirty prima di questo pass in tutti e tre i repo; nessun reset, checkout, stage o commit eseguito.

## Prossima fase

REVIEW. Validare il known failure Next typegen/typecheck e, se richiesto, aprire fix dedicato. Poi eseguire smoke live multi-shop Admin+Android+iOS su Supabase staging per provare switch A/B con dati reali.
