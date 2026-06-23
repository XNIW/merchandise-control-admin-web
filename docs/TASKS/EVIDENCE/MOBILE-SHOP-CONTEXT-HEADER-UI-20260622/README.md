# Mobile Shop Context Header UI - 2026-06-22

Status: READY_FOR_REVIEW

## Scope

- Android: moved the selected shop presentation from the Inventory card body to the page header area, directly under `Inventory`.
- iOS: moved the selected shop presentation from `headerSection` to the page header area, directly under the navigation title.
- Follow-up: iOS now matches the Android runtime reference screenshot with the shop context row at the top-left and `Inventory` / `Inventario` directly below it.
- Follow-up: iOS root sync banner was made compact and the recurring 30s safety-loop banner cause was fixed.
- Admin Web: no application code change; this folder only records evidence.
- No migration, DAO, repository, commit, push, stage, reset, or checkout was performed for this request.

## Files changed for this request

Android repo `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`:

- `app/src/main/java/com/example/merchandisecontrolsplitview/ui/screens/FilePickerScreen.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/ui/screens/FilePickerScreenTest.kt`

iOS repo `/Users/minxiang/Desktop/iOSMerchandiseControl`:

- `iOSMerchandiseControl/ContentView.swift`
- `iOSMerchandiseControl/InventoryHomeView.swift`
- `iOSMerchandiseControl/Sync/Automatic/Decision/SyncAutomaticTriggerSource.swift`
- `iOSMerchandiseControl/Sync/Automatic/Decision/SyncDecisionInputProvider.swift`
- `iOSMerchandiseControl/Sync/SyncOrchestrator.swift`
- `iOSMerchandiseControlTests/SyncDecisionEngineTests.swift`
- `iOSMerchandiseControlTests/Task118AutomaticDomainTests.swift`

Admin repo `/Users/minxiang/Projects/merchandise-control-admin-web`:

- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/README.md`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/android-1shop-header.png`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/android-shop-first-header.png`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/ios-1shop-header.jpg`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/ios-compact-banner-initial.jpg`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/ios-compact-banner-after-safety-loop.jpg`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/ios-shop-first-header.jpg`
- `docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-HEADER-UI-20260622/ios-shop-top-left-final.jpg`

Note: Android and iOS worktrees already contained broader uncommitted mobile shop context/runtime changes before this header-only pass. Those pre-existing changes were not reverted or restaged.

## UX verification matrix

| Case | Android | iOS |
| --- | --- | --- |
| 0 shop | PASS by unit presentation test: `inventoryShopHeaderPresentation(...) == null`; no header/switcher expected. Visual NOT_RUN because current emulator account is linked to one shop. | PASS by `ShopContextTests/testZeroLinkedShopsKeepsLegacyCleanPresentation`. Visual NOT_RUN because current simulator account is linked to one shop. |
| 1 shop | PASS visually: shop name appears top-left under page title and above the file card; no chevron. Screenshot: `android-1shop-header.png`. | PASS visually: shop name appears top-left under page title and above the file block; no chevron. Screenshot: `ios-1shop-header.jpg`. |
| 2+ shops | PASS by unit presentation test: selected shop name with switcher flag. Visual NOT_RUN because no multi-shop account was available in the current emulator session. | PASS by `ShopContextTests/testMultipleLinkedShopsSwitchesSelectedShopAndSyncStoreScopeTogether`. Visual NOT_RUN because no multi-shop account was available in the current simulator session. |
| Account switch | PASS by Android presentation test for no linked shops after account change plus existing scoped store test. | PASS by `ShopContextTests/testSelectedShopPersistenceIsAccountScoped`. |
| Revoked/suspended shop | PASS by Android presentation tests for fallback valid shop and clean legacy when no valid shop remains. | PASS by `ShopContextTests/testRevokedPersistedShopFallsBackToOnlyRemainingValidShop` and `testRevokedOnlyShopClearsSelectionAndReturnsLegacyPresentation`. |

## Visual QA

Real one-shop account shown on both platforms:

- Shop name: `TASK068E REHEARSAL 260618231325`
- Android screenshot: `android-1shop-header.png`
- iOS screenshot: `ios-1shop-header.jpg`
- Result: the shop name is no longer inside the Inventory/file card body on either platform.
- Result: no chevron/switcher appears for the one-shop account on either platform.

iOS shop top-left follow-up:

- User follow-up requested iOS to match the Android runtime screenshot.
- Result: `InventoryHomeView` now renders a custom page header with the shop row first and `Inventario`/`Inventory` below it; the navigation bar title was removed from this screen so it no longer forces the title above the shop row.
- Screenshot: `ios-shop-top-left-final.jpg`.
- Android local vector storefront icon from the earlier full shop-first experiment remains removed.

## iOS compact banner follow-up

- Root cause found: `startSyncEventSafetyLoopIfNeeded()` submitted `.remoteSyncEvent` every 30s even when no realtime event was received. `SyncDecisionInputProvider` treats `.remoteSyncEvent` as `hasRemoteSyncEvent`, so the decision engine scheduled real drain/reconcile work and the root banner kept reappearing.
- Fix: added `.foregroundPoll` for the 30s safety loop. It maps to `.appForeground`, does not request light reconcile, and no-op polls stay hidden when there is no real work.
- Fix: `rootPresentationState` no longer promotes a decision-only foreground task to `.checking`; it shows checking only for auth transition, real automatic runtime work, or active sync phases.
- UI: `SyncRootForegroundBanner` is now a compact top-right pill, one line for checking, with narrower padding/max width.
- Screenshot initial compact checking pill: `ios-compact-banner-initial.jpg`.
- Screenshot after the 30s safety-loop tick: `ios-compact-banner-after-safety-loop.jpg` (banner absent).
- Runtime diagnostics after tick: `sync.runtime.foreground.source = "foregroundPoll"`, `sync.runtime.foreground.outcome = "decision_noop"`, `sync.runtime.orchestrator.phase = "idle"`.

## Checks run

Android:

- `./gradlew :app:testDebugUnitTest --tests com.example.merchandisecontrolsplitview.data.ShopContextTest`
  - PASS, `BUILD SUCCESSFUL in 8s`
- `./gradlew :app:testDebugUnitTest --tests com.example.merchandisecontrolsplitview.ui.screens.FilePickerScreenTest`
  - PASS, `BUILD SUCCESSFUL in 1s`; follow-up reruns PASS, `BUILD SUCCESSFUL in 11s` and `BUILD SUCCESSFUL in 6s`
- `./gradlew :app:assembleDebug`
  - PASS, `BUILD SUCCESSFUL in 2s`; follow-up rerun PASS, `BUILD SUCCESSFUL in 4s`
- `git diff --check`
  - PASS, no output
- Runtime install/launch:
  - `~/Library/Android/sdk/platform-tools/adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk`
  - `~/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell monkey -p com.example.merchandisecontrolsplitview -c android.intent.category.LAUNCHER 1`
  - PASS

iOS:

- XcodeBuildMCP `session_show_defaults`
  - PASS, project `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl.xcodeproj`, scheme `iOSMerchandiseControl`, simulator `iPhone 17 Pro`
- XcodeBuildMCP `build_sim`
  - PASS, `SUCCEEDED`, no warnings/errors; follow-up rerun after page-header adjustment PASS
- XcodeBuildMCP `test_sim` with `-only-testing:iOSMerchandiseControlTests/Task118AutomaticDomainTests -only-testing:iOSMerchandiseControlTests/SyncDecisionEngineTests`
  - PASS, `SUCCEEDED`, 37 passed, 0 failed, 0 skipped
- XcodeBuildMCP `test_sim` with `-only-testing:iOSMerchandiseControlTests/ShopContextTests`
  - PASS, `SUCCEEDED`, 8 passed, 0 failed, 0 skipped; follow-up rerun PASS, 8 passed
- XcodeBuildMCP `build_run_sim`
  - PASS, app installed/launched on `iPhone 17 Pro`; compact banner follow-up rerun PASS; iOS shop top-left follow-up rerun PASS
- XcodeBuildMCP `screenshot`
  - PASS, copied to `ios-1shop-header.jpg`, `ios-compact-banner-initial.jpg`, `ios-compact-banner-after-safety-loop.jpg`, `ios-shop-top-left-final.jpg`
- `git diff --check`
  - PASS, no output

## Residual risk

- 0-shop and 2+-shop visual states were not exercised live because the available real emulator/simulator session was the one-shop linked account. The behavior is covered by Android/iOS presentation and resolver tests.
- Existing mobile worktrees remain dirty from the broader runtime shop context implementation; this pass aligns the iOS Inventory header to the Android runtime screenshot and keeps the iOS compact root banner fix.
