# Mobile Shop Context / Shop Switcher - Evidence

Data: 2026-06-22

Stato: `NOT_DONE`

## Obiettivo

Implementare Mobile Shop Context / Shop Switcher senza divergenze architetturali tra Android e iOS:

- account personale e shop business restano identita separate;
- il contratto Admin/Supabase per linked shops e sync shop-scoped e unico per entrambe le app;
- Android e iOS non possono avere comportamento diverso su 0/1/N shop, persistenza selected shop, sync, history, catalogo, fallback legacy o UI Inventory Home;
- nessuna piattaforma deve avanzare con una patch temporanea non equivalente.

## Android/iOS Architecture Parity

Questa matrice e un gate obbligatorio prima di qualunque implementazione mobile sostanziale. Ogni riga deve restare equivalente: se viene aggiunto o modificato un componente su Android, deve esistere il componente corrispondente su iOS, e viceversa.

| Area | Android attuale | iOS attuale | Regola di parita richiesta | Stato |
| --- | --- | --- | --- | --- |
| Account identity | `AuthManager` / sessione Supabase espongono account personale `userId`; staff POS resta separato dai flussi mobile. | `SupabaseClientProvider` / sessione Supabase espongono account personale; staff POS separato dai flussi mobile. | Usare sempre account personale per auth, mai come root business. Staff POS non entra nel Mobile Shop Context. | Da preservare |
| Linked shops fetch | Non esiste ancora fetch mobile dedicato; contratto Admin `mobile_linked_shops` disponibile. | Non esiste ancora fetch mobile dedicato; contratto Admin `mobile_linked_shops` disponibile. | Entrambe le app devono chiamare lo stesso RPC/API Admin, ad esempio `mobile_linked_shops`, con gli stessi campi. | Contratto Admin pronto; client mobile non implementati |
| Selected shop state | Non esiste modello `ShopContext` dedicato; il sync usa `ownerUserId` e `storeScope`. | Non esiste modello `ShopContext` dedicato; il sync usa `ownerUserID` e `LocalStoreIdentity`. | Entrambe devono avere `LinkedShop`, `SelectedShop`, `ShopContext` con `shopId`, `shopCode`, `shopName`, `role`, `status`, `canWrite`. | Da implementare in modo comune |
| Selected shop persistence | Esistono preferenze/stores per sync/account, ma non selected shop per account. | Esistono `UserDefaults` e store account-scoped per watermark, ma non selected shop per account. | Persistenza per account, non globale. Cambio account invalida o ricalcola la selezione. | Da implementare in modo comune |
| Sync context | Catalogo, ProductPrice, History e sync_events sono principalmente owner-scoped; `storeScope` e watermark sono ganci esistenti. Il DTO/RPC sync_events supporta `shop_id`. | Catalogo, ProductPrice, History e sync_events sono principalmente owner-scoped; `LocalStoreIdentity` e watermark sono ganci esistenti. Il DTO/RPC sync_events supporta `shop_id`. | Se `selectedShop` esiste, catalog/history/prices/sync_events usano `shop_id`; owner_user_id resta solo fallback legacy equivalente. | Parziale; mobile sync non ancora cablato al selected shop |
| Local database scope | Room non isola ancora i dati per selected shop reale; cambio contesto rischia mixing se non gestito. | SwiftData non isola ancora i dati per selected shop reale; cambio contesto rischia mixing se non gestito. | Cambio shop deve bloccare o svuotare/ricaricare cache/watermark in modo esplicito, con pending changes gestiti fail-closed. | Bloccante prima di READY |
| Legacy compatibility | Fallback owner/mapping legacy presente; non sufficiente per multi-shop. | Fallback owner/mapping legacy presente; non sufficiente per multi-shop. | Stessa regola su entrambe: `shop_id` prima; owner fallback solo per righe legacy `shop_id IS NULL` e account autorizzato. | Rinforzato lato Admin; mobile runtime ancora da allineare |
| UI Inventory Home | Home/Database/Options non mostrano nome shop reale collegato al sync context. | `InventoryHomeView` non mostra nome shop reale collegato al sync context. | 0 shop invariato; 1 shop mostra nome senza selector; N shop mostra selector sottile. UI non contiene logica sync. | Da implementare in modo comune |
| Error/loading states | Device/cloud check puo dipendere da current-owner mapping; no stato linked shops/suspended/revoked. | Device/cloud check puo dipendere da current-owner mapping; no stato linked shops/suspended/revoked. | Loading, suspended/revoked, selected shop invalido e cloud check timeout devono essere equivalenti. | Da implementare in modo comune |
| Tests | Test sync/catalog/device esistenti, ma non 0/1/N shop context o no cross-shop leakage. Test DTO/RPC `shop_id` aggiunto. | Test sync/catalog/device esistenti, ma non 0/1/N shop context o no cross-shop leakage. Test DTO/RPC `shop_id` aggiunto. | Ogni test Android Shop Context deve avere test iOS equivalente: 0/1/N, switching, persistence, sync scoped, no leakage. | Parziale; test completi Shop Context mancanti |

## File-to-file parity checklist

| Concetto | Android target | iOS target | Stato |
| --- | --- | --- | --- |
| Model | `data/LinkedShop.kt`, `data/ShopContext.kt` o equivalente | `ShopContext/LinkedShop.swift`, `ShopContext/ShopContext.swift` o equivalente | Non ancora implementato |
| Repository/service | `ShopContextRepository` che chiama RPC unico | `ShopContextStore/Service` che chiama lo stesso RPC unico | Non ancora implementato |
| Persistence | `SelectedShopStore` account-scoped | `SelectedShopPersistence` account-scoped | Non ancora implementato |
| Sync coordinator | `CatalogSyncViewModel` / repository ricevono `ShopContext` | manual/automatic sync ricevono `ShopContext` | Non ancora implementato |
| Device/cloud guard | status/register per selected shop, non solo current owner | status/register per selected shop, non solo current owner | Non ancora implementato |
| UI header/switcher | Inventory Home/Database header osserva `ShopContext` | `InventoryHomeView` osserva `ShopContext` | Non ancora implementato |
| Tests | JVM unit/static tests equivalenti | XCTest/static tests equivalenti | Solo contract-layer sync event implementato |

## Differenze intenzionali di piattaforma

- Android usera componenti idiomatici Kotlin/Compose/Room/Gradle; iOS usera SwiftUI/SwiftData/UserDefaults/XCTest.
- La UI selector puo essere bottom sheet/dialog Compose su Android e sheet SwiftUI su iOS, pur mantenendo lo stesso comportamento prodotto.
- La persistenza puo usare lo storage gia coerente con la piattaforma, ma la chiave deve essere account-scoped in entrambe.

## Differenze eliminate durante il task

- Admin espone un unico contratto per entrambe le piattaforme: `mobile_linked_shops`, `shop_device_register_for_shop`, `shop_device_status_for_shop` e `record_sync_event(..., p_shop_id)`.
- Android e iOS hanno entrambi supporto DTO/RPC opzionale per `shop_id` nei sync event, senza endpoint o payload divergenti.
- iOS History automatic sync ora usa lo stesso evento logico `history_changed` con payload `session_ids`, allineato al contratto Admin/Android invece del vecchio `upsert`/`history_session_ids`.
- Lato Admin sono stati rinforzati filtri e guardie shop-scoped per prezzi catalogo POS/admin, fallback platform sync, history generated-edit e import PriceHistory da export mobile.

## Implementazione completata

- Migrazione Admin `20260622160000_mobile_shop_context_switcher.sql` con RPC linked shops, device status/register per selected shop e sync event shop-scoped.
- Tipi Supabase Admin aggiornati per i nuovi RPC e per `p_shop_id`.
- Guardie Admin aggiunte per impedire leakage prezzi cross-shop quando ProductPrice referenzia Product con scope diverso.
- Import workbook Admin aggiornato per preservare il mapping Product/PriceHistory quando un export Android legacy viene importato in uno shop reale.
- Android: `SyncEventRemoteRow` e `SyncEventRecordRpcParams` accettano `shop_id`/`p_shop_id` opzionale.
- iOS: request, mapper RPC e DTO sync event accettano `shop_id`/`p_shop_id` opzionale.

## Implementazione mancante

- Android/iOS non hanno ancora `LinkedShop`, `SelectedShop` e `ShopContext` completi a livello runtime.
- Android/iOS non persistono ancora il selected shop in modo account-scoped.
- Android/iOS non mostrano ancora nome shop o selector in Inventory Home.
- Catalogo, ProductPrice, History, watermark, cache locali e pending changes mobile non sono ancora cablati al selected shop.
- Mancano test equivalenti 0 shop, 1 shop, N shop, switching, selected-shop invalidation e no cross-shop leakage su entrambe le piattaforme.

## Checks eseguiti

### Admin Web

- `npm run security:scan` - PASS
- `npm run lint` - PASS
- `npm run typecheck` - PASS
- `node --test tests/foundation/task-016-platform-devices.test.mjs tests/foundation/task-041-runtime-completion.test.mjs tests/foundation/task-061-android-database-export-transfer.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs` - PASS, 17/17
- `node --test tests/foundation/mobile-shop-context-switcher.test.mjs` - PASS, 3/3
- `npm run test:foundation` - PASS, 456/456
- `npm run build` - PASS, con warning framework/deprecazioni gia presenti (`middleware` convention e `DEP0205`)
- `npm run verify` - PASS
- `npm run test:ui-smoke:ci` - PASS, 48/48
- `git diff --check` - PASS

### Android

- `./gradlew testDebugUnitTest --tests '*DefaultInventoryRepositoryTest.114 sync event RPC params serialize confirmed snake case source'` - PASS
- `./gradlew lint testDebugUnitTest assembleDebug` - PASS
- `git diff --check` - PASS

### iOS

- Targeted `xcodebuild test` per `SyncEventRecordingTests/testAutomaticHistoryPushUsesHistoryChangedContract` - PASS
- Targeted `xcodebuild test` per `SyncEventLiveRecorderTests/testShopScopedRequestMapsShopIDToRPCParamsAndResponse` e `SyncEventRecordingTests/testAutomaticHistoryPushUsesHistoryChangedContract` - PASS
- XcodeBuildMCP `build_sim` - PASS, nessun warning di build
- XcodeBuildMCP `test_sim` - FAIL: 871 passed, 21 failed, 32 skipped. Le failure residue sono concentrate su test preesistenti di release activity UI/source-scan, benchmark dataset e path legacy ProductPrice preview/manual push. Artefatti:
  - `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/logs/test_sim_2026-06-22T15-44-30-270Z_pid57885_07a3859e.log`
  - `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/result-bundles/test_sim_2026-06-22T15-44-30-271Z_pid57885_3d79455d.xcresult`
- `git diff --check` - PASS

## Gate di chiusura

Il task puo essere `READY_FOR_FINAL_REVIEW` solo se:

1. contratto Admin linked shops/sync e unico per Android e iOS;
2. Android e iOS hanno modelli, repository/store, persistence, sync context, UI e test equivalenti;
3. catalogo, ProductPrice, History e sync_events usano selected shop quando presente;
4. fallback owner legacy e identico e limitato a dati `shop_id IS NULL`;
5. cambio shop non mescola cache, watermark o pending changes;
6. i check Admin, Android e iOS richiesti sono eseguiti davvero o marcati con motivo `NOT_RUN`/`BLOCKED`.

Se uno di questi punti manca, lo stato finale deve essere `NOT_DONE`.

## Stato finale

`NOT_DONE`.

Il contratto Admin e il contract-layer sync event Android/iOS sono allineati, ma il task completo richiede ancora implementazione runtime/UI equivalente su entrambe le app. In particolare mancano selected shop persistence, wiring sync/local database, Inventory Home shop name/switcher e test 0/1/N/switching/no-leakage.
