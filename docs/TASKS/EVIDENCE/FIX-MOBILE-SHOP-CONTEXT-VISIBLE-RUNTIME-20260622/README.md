# Fix Mobile Shop Context Visible Runtime - 2026-06-22

Stato handoff: REVIEW. Codex non marca DONE.

## Scope

- Admin Web / Supabase: applicata la migration runtime shop context mancante sul cloud dev collegato.
- Android: shop context visibile e cache business locale riallineata quando cambia `ownerUserId + shopId/legacy`.
- iOS: decoding RPC `mobile_linked_shops` allineato al contratto JSONB; pending changes e device guard usano lo shop selezionato.
- Nessun commit, push o stage eseguito.

## Root Cause

Il cloud Supabase collegato non aveva ancora applicato `20260622160000_mobile_shop_context_switcher.sql`.
Prima dell'applicazione, le app mobili ricevevano `PGRST202` su `mobile_linked_shops`; quindi il resolver vedeva 0 shop e Inventory Home restava in UX legacy pulita.

## Backend Evidence

Comandi eseguiti da `/Users/minxiang/Projects/merchandise-control-admin-web`:

- `SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase migration list --linked --log-level error`
  - prima: `20260622160000 |                | 2026-06-22 16:00:00`
  - dopo: `20260622160000 | 20260622160000 | 2026-06-22 16:00:00`
- `SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase db push --linked --dry-run --log-level error`
  - prima dell'apply: `Would push these migrations: 20260622160000_mobile_shop_context_switcher.sql`
- `SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase db push --linked --log-level error`
  - applicata `20260622160000_mobile_shop_context_switcher.sql`
- Query SQL impersonando l'utente target:
  - `target_user_present=true`
  - `ok=true`
  - `shop_count=1`
  - `first_shop_name_present=true`
  - `first_can_select=true`
  - `first_can_write=true`
- Check PostgREST con publishable key:
  - `mobile_linked_shops`: `status=401`, `code=42501`, `missing=false`
  - `shop_device_status_for_shop`: `status=401`, `code=42501`, `missing=false`
  - `shop_device_register_for_shop`: `status=401`, `code=42501`, `missing=false`

Nota: un dry-run post-apply e' stato ritentato piu' volte ma bloccato da flake pooler `ECIRCUITBREAKER`/password; non e' stato usato come gate finale.

## Mobile Fix Summary

Android:

- `MerchandiseControlApplication.kt`: aggiunta guardia persistente `ownerUserId:shopId/legacy`; al cambio scope chiama reset cache prima di realtime/autosync.
- `InventoryRepository.kt`: aggiunto `resetBusinessDataForShopContextChange()` transazionale.
- DAO Android: aggiunti `deleteAll()` mirati per prodotti, prezzi, storico, supplier/category, bridge remoti e tombstone.
- Test: aggiunto reset cache business con bridge remoti in `DefaultInventoryRepositoryTest`.

iOS:

- `Sync/ShopContext/ShopContext.swift`: decoder per risposta JSONB `{ ok, shops }` e compatibilita' array legacy.
- `LocalPendingChange.swift`: se esiste selected shop, default store identity del pending-change segue `ShopContextSelection`.
- `ShopDeviceRegistrationService.swift`: device status/register usa `shop_device_*_for_shop` quando c'e' selected shop, fallback `current_owner` solo in legacy.
- Test: aggiunti decoder JSONB/legacy e pending-change store identity.

## Acceptance Policy Evidence

- 0 shop: Android `ShopContextTest`; iOS `ShopContextTests/testZeroLinkedShopsKeepsLegacyCleanPresentation`.
- 1 shop: Android `ShopContextTest`; iOS `testOneLinkedShopAutoSelectsAndShowsNameWithoutSwitcher`; runtime reale mostra `TASK068E REHEARSAL 260618231325` senza switcher.
- 2+ shop: Android `ShopContextTest`; iOS `testMultipleLinkedShopsSwitchesSelectedShopAndSyncStoreScopeTogether`.
- Cambio account: Android `ShopContextTest` account-scoped store + nuova guardia cache `ownerUserId:shopId/legacy`; iOS `testSelectedShopPersistenceIsAccountScoped`.
- Shop revocato: Android `ShopContextTest`; iOS `testRevokedOnlyShopClearsSelectionAndReturnsLegacyPresentation` e `testRevokedPersistedShopFallsBackToOnlyRemainingValidShop`.

## Runtime Visual Evidence

- Android screenshot: `screenshots/android-inventory-shop-context-after.png`
- Android accessibility dump: `android-window-after.xml`
  - contiene `TASK068E REHEARSAL 260618231325`
- iOS screenshot: `screenshots/ios-inventory-shop-context-after.jpg`
  - mostra `TASK068E REHEARSAL 260618231325`

Runtime logs:

- Android logcat:
  - `Shop context: cache business riallineata previous=...:legacy next=...:bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d`
  - `Shop device status reason=auth status=active code=success canWrite=true`
- iOS oslog:
  - `shop_device_status_for_shop result reason=app_sync_bootstrap scope=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d status=active code=success can_write=true`

## Verification Commands

- Android:
  - `./gradlew testDebugUnitTest --tests 'com.example.merchandisecontrolsplitview.data.ShopContextTest' --tests 'com.example.merchandisecontrolsplitview.data.DefaultInventoryRepositoryTest.shop context reset clears business cache and remote bridges'`
  - Result: `BUILD SUCCESSFUL`
  - `./gradlew installDebug`
  - Result: `BUILD SUCCESSFUL`, installed on `Medium_Phone_API_35`
- iOS:
  - XcodeBuildMCP `test_sim` with `ShopContextTests` and `LocalPendingChangeAccumulatorTests/testDefaultStoreIdentityFollowsSelectedShopForOwner`
  - Result: `SUCCEEDED`, 9 passed, 0 failed
  - XcodeBuildMCP `build_run_sim`
  - Result: `SUCCEEDED`, warnings 0, errors 0
- Diff hygiene:
  - Admin Web `git diff --check`: PASS
  - Android `git diff --check`: PASS
  - iOS `git diff --check`: PASS

## Residual Notes

- Repository working trees were already dirty before this pass; unrelated pre-existing changes were left untouched.
- iOS selected test run still reports legacy Swift 6 actor-isolation warnings in unrelated test files during `test_sim`; final `build_run_sim` reports warnings 0.
