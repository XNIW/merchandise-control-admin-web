# Final Cross-platform Shop Context Audit 2026-06-22

## Stato

Status: `NOT_DONE`.

Motivo: il contratto Admin/Supabase ora e piu sicuro e Android/iOS supportano `shop_id` solo a livello DTO/RPC, ma Android e iOS non implementano ancora un runtime `LinkedShop` / `SelectedShop` / `ShopContext`, persistenza selected shop per account, UI shop switcher, writer/fetch/outbox/watermark shop-scoped o test 0/1/N/switch/no-leakage. La review finale non puo uscire `READY_FOR_FINAL_REVIEW`.

## Repos ispezionati

- Admin Web: `/Users/minxiang/Projects/merchandise-control-admin-web`
- Android: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`
- iOS: `/Users/minxiang/Desktop/iOSMerchandiseControl`
- Win7POS/Cash Register: non toccato.

## Stato worktree

Admin Web:

- Worktree gia dirty da audit precedenti: molte modifiche Admin Web, SVG pubblici rimossi, evidence precedenti non tracciate.
- File toccati da questa passata:
  - `supabase/migrations/20260622160000_mobile_shop_context_switcher.sql`
  - `tests/foundation/mobile-shop-context-switcher.test.mjs`
  - `docs/TASKS/EVIDENCE/FINAL-CROSS-PLATFORM-SHOP-CONTEXT-AUDIT-20260622/README.md`

Android:

- Worktree gia dirty prima della review: `.idea/deploymentTargetSelector.xml` deleted, `SyncEventModels.kt`, `ExcelUtils.kt`, `DefaultInventoryRepositoryTest.kt`, `app/src/test/resources/`.
- Nessun file Android modificato da questa passata.

iOS:

- Worktree gia dirty prima della review con DTO/RPC/tests sync-event.
- File toccati da questa passata:
  - `iOSMerchandiseControl/Sync/Remote/SyncEventRemoteSupabaseAdapter.swift`
  - `iOSMerchandiseControlTests/SyncEventRecordingTests.swift`

## Fix applicati in questa passata

1. Admin Web `record_sync_event` idempotency shop-safe.
   - Rimosso l'indice legacy `sync_events_owner_client_event_id_unique`.
   - Aggiunti indici parziali:
     - legacy no-shop: `(owner_user_id, client_event_id) where shop_id is null`
     - shop-scoped: `(owner_user_id, shop_id, client_event_id) where shop_id is not null`
   - Impatto: lo stesso `client_event_id` puo essere riusato su shop diversi dello stesso account senza collisione cross-shop.

2. Admin Web `shop_device_status_for_shop` metadata-safe.
   - Utenti autenticati non membri ricevono risposta generica `unauthorized` senza `shop_code`, `shop_name`, `shop_status`, `role_key`, `membership_status`.
   - Membri non attivi ricevono `membership_not_active` senza `shop_code`, `shop_name`, `shop_status`, `role_key`.
   - Membri attivi mantengono i metadati necessari allo stato device.

3. iOS incremental sync-event fetch legge `shop_id`.
   - `SyncEventRemoteSupabaseAdapter.fetchSyncEventsAfter` include ora `shop_id` nella select.
   - Aggiunto test sorgente `testIncrementalSyncEventFetchSelectsShopIDColumn`.

## Matrice parita

| Area | Admin Web | Android | iOS | Stato |
|---|---|---|---|---|
| Account identity | Owner/profile server-side | Supabase user id | Supabase session/user id | PASS |
| Linked shops fetch | `mobile_linked_shops()` | Non implementato | Non implementato | FIX |
| Selected shop model | Contratto server disponibile | Assente | Assente | FIX |
| Selected shop persistence | N/A server contract | Assente | Assente | FIX |
| Device register/status per shop | `*_for_shop` RPC presenti | Usa ancora current-owner RPC | Usa ancora current-owner RPC | FIX |
| Sync event DTO/RPC `shop_id` | Presente e autorizzato | Presente nel DTO/test | Presente nel DTO/test | PASS parziale |
| Writer reali con `p_shop_id` | RPC accetta e valida | Non propagato nei writer/outbox | Non propagato nei writer/outbox | FIX |
| Fetch/realtime events shop-scoped | RLS owner, RPC shop-aware | Fetch/realtime owner-only | Fetch/realtime owner-only | FIX |
| Watermark/cache/outbox per shop | N/A server | Owner/storeScope, non shop | Account/store, non shop | FIX |
| Inventory Home shop name/switcher | N/A | Assente | Assente | FIX |
| Tests 0/1/N/switch/no leakage | Foundation contract only | Assenti | Assenti | FIX |
| Legacy compatibility | `p_shop_id` opzionale in coda | Legacy owner/default-store ancora attivo | Legacy owner/default-store ancora attivo | PASS parziale |

## Findings principali

### Fixed in this pass

- Admin P1: idempotenza `client_event_id` incompatibile con shop multipli. Risolto con indici parziali shop-aware.
- Admin P2: `shop_device_status_for_shop` esponeva dettagli shop prima di autorizzare membership attiva. Risolto con risposte generiche per non-member e inactive member.
- iOS P2/P3: DTO `RemoteSyncEventRow.shopID` esisteva ma la select incrementale non includeva `shop_id`. Risolto.

### Still open

- P1 Security: Android/iOS sync ancora owner-scoped. I writer non passano selected `shop_id`, fetch/realtime non filtrano per shop, outbox/watermark/cache non separano shop. Rischio: eventi o watermark possono mescolare shop diversi dello stesso account.
- P1 Product/runtime: `LinkedShop`, `SelectedShop`, `ShopContext` non esistono come runtime condiviso su Android/iOS.
- P1 UX: Inventory Home Android/iOS non mostra shop name e non offre switcher 0/1/N.
- P2 Data hygiene: fixture Excel Android non tracciate in `app/src/test/resources/excel/` sono real-looking e grandi; non stagiarle cosi. Sostituire con workbook sintetici o tenerle fuori repo.
- P2 Admin residuale gia noto: mutation + audit/sync non sempre atomici.
- P2 Admin residuale gia noto: POS sales ha validazione server-side ma manca invariante DB/trigger anti-bypass.
- P2 Admin performance: `getShopInventoryReadModel` puo aggiungere query chunked di validazione prodotto dopo avere gia caricato molti prezzi, soprattutto nei path workbook `rowLimit: "all"`.
- P2 Admin route hygiene: `PATCH /shop/history/detail` continua a classificare missing/malformed `Content-Length` come 413 e resta fragile per proxy/chunked.
- P2 Android performance: Excel header matching ricalcola normalizzazione/fragments per molte alias/colonne; precalcolare per colonna.
- P2 iOS docs cleanup: `docs/MASTER-PLAN.md` contiene stato IDLE e riferimenti TASK-131 ACTIVE/BLOCKED non perfettamente allineati.
- P3 Admin: build Next segnala deprecazione `middleware` -> `proxy`.
- P3 Android fixture cleanup: casing `Modalina` vs `ModaLina` in expected json.

## Casi funzionali verificati

- Admin contract linked shops/RPC selected-shop presente.
- Admin `record_sync_event` mantiene compatibilita legacy con `p_shop_id` opzionale in coda.
- Admin `record_sync_event` autorizza `p_shop_id` tramite membership attiva owner/manager.
- Admin idempotenza `client_event_id` separa eventi no-shop e shop-scoped.
- Admin status device non ritorna metadata shop a non-member/inactive member.
- Android DTO `p_shop_id` targeted test passa.
- iOS `p_shop_id` mapping targeted test passa.
- iOS history automatic contract usa `history_changed` + `session_ids`.
- iOS incremental fetch include `shop_id` nella select.

## Non verificato

- Live Supabase SQL con due shop reali e stesso `client_event_id`: `NOT_RUN`, non c'erano credenziali/runtime live richiesti in questa review.
- Android/iOS runtime 0/1/N shop e switcher UI: `BLOCKED` per implementazione assente.
- Android/iOS no cross-shop leakage end-to-end: `BLOCKED` per implementazione assente.
- iOS full `test_sim`: `NOT_RUN` in questa passata; la evidence precedente indicava fallimenti preesistenti nella suite completa. Eseguiti build sim e test mirati.
- Performance live Cloudflare/Supabase: `NOT_RUN`, fuori dallo scope di fix finale e non necessario dato `NOT_DONE`.

## Checks eseguiti

Admin Web:

- `node --test tests/foundation/mobile-shop-context-switcher.test.mjs`: PASS, 4/4.
- `npm run security:scan`: PASS, `Security scan passed`.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS, route types generati e `tsc --noEmit`.
- `npm run test:foundation`: PASS, 458/458.
- `npm run build`: PASS. Warning noto: `middleware` deprecato in favore di `proxy`.
- `npm run test:ui-smoke:ci`: PASS, 48/48.
- `git diff --check`: PASS.

Android:

- `./gradlew testDebugUnitTest --tests com.example.merchandisecontrolsplitview.data.DefaultInventoryRepositoryTest`: PASS.
- `./gradlew lint testDebugUnitTest assembleDebug`: PASS, build successful.
- `git diff --check`: PASS.

iOS:

- XcodeBuildMCP `session_show_defaults`: PASS, project `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl.xcodeproj`, scheme `iOSMerchandiseControl`, sim `iPhone 17 Pro`.
- XcodeBuildMCP `build_sim`: PASS.
- XcodeBuildMCP `test_sim` targeted:
  - `SyncEventLiveRecorderTests/testShopScopedRequestMapsShopIDToRPCParamsAndResponse`
  - `SyncEventRecordingTests/testAutomaticHistoryPushUsesHistoryChangedContract`
  - `SyncEventRecordingTests/testIncrementalSyncEventFetchSelectsShopIDColumn`
  - PASS, 3/3.
- `git diff --check`: PASS.

## Subagent review summary

- Admin Web reviewer: found unique index idempotency bug and shop metadata exposure. Both fixed in this pass.
- Android reviewer: confirmed DTO-only `shop_id` support, no selected shop runtime, no writer propagation, owner/default-store still active.
- iOS reviewer: confirmed DTO-only `shop_id` support, no selected shop runtime, no writer propagation, no UI switcher. One select-column gap fixed in this pass.
- Android/iOS parity reviewer: confirmed parity only at schema/DTO level, not runtime.
- Security reviewer: confirmed P1 mobile owner-scoped leakage risk and Android real-looking Excel fixture risk. Admin metadata leak fixed in this pass.
- Performance/Cleanup reviewer: confirmed P1 mobile owner-scoped gap, Admin inventory route performance follow-up, `Content-Length` hygiene, Android Excel normalization cost, iOS Master Plan cleanup, and untracked artifact noise. No extra bounded fix applied in this pass.

## Residual risk

- The biggest risk is not in the Admin contract after this pass, but in mobile runtime absence: multi-shop accounts can still operate through owner-scoped local state and sync events.
- Android untracked Excel resources look like production-ish data. Do not stage them without sanitization.
- iOS full suite status remains unresolved in this pass; targeted contracts and build are green.
- Existing Admin residuals from Pass 2 remain: audit/sync atomicity, DB invariant for POS sales, middleware deprecation.

## Prossima fase

Next state: `FIX`.

Open a dedicated cross-platform implementation task for Android+iOS Shop Context runtime parity:

1. Define `LinkedShop`, `SelectedShop`, `ShopContext` identically across Android/iOS.
2. Fetch `mobile_linked_shops()` and persist selected shop per account.
3. Use `shop_device_register_for_shop` and `shop_device_status_for_shop`.
4. Propagate selected `shop_id` into catalog/prices/history writers, outbox, replay, incremental fetch, realtime and watermark/cache scope.
5. Add Inventory Home shop name/switcher with 0/1/N/error/loading states.
6. Add no-leakage tests for 0 shops, 1 shop, N shops, switch A -> B -> A, revoked/inactive membership and legacy no-shop events.
