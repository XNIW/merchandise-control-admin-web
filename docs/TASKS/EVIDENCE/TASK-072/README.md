# TASK-072 Evidence

## Stato

- Data apertura: `2026-06-19`
- Stato operativo: `DONE_RECONCILED`
- Verdict finale: `DONE_RECONCILED`
- Commit / push / stage: `NOT_RUN`
- Production deploy / production migration apply: `NOT_RUN_FORBIDDEN`

## Preflight iniziale

| Repo | Path | Stato osservato |
|---|---|---|
| Admin Web | `/Users/minxiang/Projects/merchandise-control-admin-web` | `main...origin/main`, working tree pulito prima dell'apertura TASK-072 |
| Android | `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView` | `main...origin/main`, working tree pulito |
| iOS | `/Users/minxiang/Desktop/iOSMerchandiseControl` | `main...origin/main`, molti artefatti untracked preesistenti sotto evidence/screenshots |

## Note governance

- Il Master Plan Admin Web indicava `Task attivo: NESSUNO`.
- TASK-072 e aperto per override esplicito dell'utente dal brief allegato.
- Le istruzioni mobile chiedono un task attivo locale prima del codice; il brief
  corrente e trattato come override cross-platform e ogni modifica mobile dovra
  essere documentata qui.

## Evidence incrementale

## TASK-072B real cross-platform E2E - 2026-06-19

- Obiettivo: completare evidenza reale Admin Web -> Supabase cloud dev ->
  Android/iOS per catalogo e History Entry prima della review finale.
- Target runtime:
  - Admin Web in-app browser su `http://localhost:3055`, shop
    `bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d`;
  - Supabase cloud dev non-production, stesso owner mobile hash
    `ad3d747e936c`;
  - Android emulator `emulator-5554`, package
    `com.example.merchandisecontrolsplitview`;
  - iOS Simulator `iPhone 17 Pro`, bundle
    `com.niwcyber.iOSMerchandiseControl`.
- Dati sintetici usati solo con prefisso `TASK072_RT_*`.
- Nessun commit, push o stage.

### Fix trovati durante E2E reale

- Admin Web History Entry v2 emetteva `session_overlay.editable` come griglia
  booleana; Android/iOS si aspettano `[[String]]`.
  - Fix: `history-mutations.ts` ora costruisce `editable: data.map(() => ["", ""])`.
  - Test statico TASK-072 aggiornato per bloccare regressioni.
- Cloud dev ha schema misto/legacy:
  - `sync_events` e alcune query possono essere senza `shop_id`;
  - `shared_sheet_sessions` puo includere `shop_id`.
  - Fix Admin Web: fallback legacy su history read/write e sync writer.
  - Fix Android: `SharedSheetSessionRecord` tollera `shop_id` nelle SELECT
    PostgREST senza usarlo nel runtime owner-scoped.

### UI History Entry Admin Console

- `/shop/history?shop_id=...` verificata nel browser:
  - bottone `Create History Entry` visibile;
  - sezione rinominata `History Entries`;
  - title `Mobile History Entries`;
  - pagina distingue History Entry business/mobile, `sync_events` tecnici e
    audit log amministrativo.
- `/shop/history/[entryId]` verificata su sessione reale:
  - `Update History Entry` visibile;
  - `Tombstone History Entry` visibile;
  - tombstone richiede conferma `TOMBSTONE`.
- Product Detail verifica:
  - link `History detail` aggiunti alle righe History Entries correlate;
  - detail prodotto resta read-only, con azioni catalogo nella Products list.

### Catalogo reale Admin Web -> Android/iOS

| Scenario | t0 Admin Web | t1 sync_event | Android evidence | iOS evidence |
|---|---:|---:|---|---|
| Create supplier/category/product | `2026-06-19T15:46:27.141Z` submit, `15:46:27.420Z` response | `3139` supplier `15:46:31.707645Z`; `3140` category `15:46:35.480872Z`; `3141` product `15:46:37.026748Z` | DB locale Android conteneva product/supplier/category, watermark `3141` | Store iOS conteneva product/supplier/category, watermark `3141` |
| Update product | `2026-06-19T15:50:25.887Z` submit, `15:50:26.175Z` response | `3142 catalog_changed` `2026-06-19T15:50:33.869297Z` | product aggiornato con nome `..._UPDATED`, prezzi `1333/2666`, stock `11`; `lastRemoteAppliedAt=2026-06-19T15:50:35.165Z`, watermark `3142` | product aggiornato; `ZREMOTEUPDATEDAT=2026-06-19T15:50:33.544Z`, watermark `3142` |
| Tombstone product | `2026-06-19T15:52:02.239Z` submit, `15:52:02.532Z` response | `3143 catalog_tombstone` `2026-06-19T15:52:03.632967Z` | riga prodotto non piu presente nelle active products; watermark `3143` | product con `ZREMOTEDELETEDAT=2026-06-19T15:52:02.977Z`, watermark `3143` |
| Restore product | `2026-06-19T15:53:41.433Z` submit, `15:53:41.734Z` response | `3144 catalog_changed` restore `2026-06-19T15:53:42.789772Z` | riga prodotto ripristinata; `lastRemoteAppliedAt=2026-06-19T15:53:44.442Z`, watermark `3144` | product ripristinato con `ZREMOTEDELETEDAT` vuoto, watermark `3144` |

Synthetic catalog ids:

- product `78bab0e6-060c-419a-9a10-217acb9d1871`, barcode
  `7207283986763`;
- supplier `99be2bdc-3080-4d43-a801-14973c92ba4e`;
- category `c6735386-2952-4863-b1f5-befd6ee43f66`.

### History Entry reale Admin Web -> Android/iOS

| Scenario | t0 Admin Web | t1 sync_event | Android evidence | iOS evidence |
|---|---:|---:|---|---|
| Create History Entry | `2026-06-19T15:55:26.211Z` submit, `15:55:26.505Z` response | `3145 history_changed` `2026-06-19T15:55:28.389132Z` | inizialmente fallito con `PayloadValidation` per shape/schema; corretto e riapplicato dal successivo update | inizialmente fallito con decode `editable[0][0]`; corretto e riapplicato dal successivo update |
| Update History Entry | `2026-06-19T16:03:15.167Z` submit, `16:03:17.275Z` response | `3146 history_changed` `2026-06-19T16:03:18.315460Z` | riga `TASK072_RT_HISTORY_..._UPDATED`, `data=[["Barcode","Item","Qty"],["7207283986763","TASK072_RT_HISTORY_ITEM_UPDATED","3"]]`, `editable=[["",""],["",""]]`, `complete=[true,false]`; `lastRemoteAppliedAt=2026-06-19T16:03:19.319Z`, watermark `3146`, remote ref count `1`, outbox `0` | riga `ZID=aeae2f00...`, `ZTITLE=..._UPDATED`, `ZREMOTEUPDATEDAT=2026-06-19T16:03:18.078Z`, `editable=[["",""],["",""]]`, watermark `3146`, row count `1` |
| Tombstone History Entry | `2026-06-19T16:08:33.533Z` submit, `16:08:35.779Z` response | `3147 history_tombstone` `2026-06-19T16:08:36.872654Z` | `deletedAt=2026-06-19T16:08:36.356+00:00`; watermark `3147`; outbox `0`; remote ref count `1` | `ZREMOTEDELETEDAT=2026-06-19T16:08:36.356Z`; watermark `3147`; row count `1` |

History remote id:

- `aeae2f00-59ad-4584-ae10-1a2a572eb4bc`.

Contract verificato su record reale:

- `remote_id` UUID lowercase;
- `payload_version = 2`;
- `session_overlay.overlay_schema = 1`;
- `data`, `editable`, `complete` allineati per righe;
- `deleted_at` usato per tombstone;
- `history_changed` / `history_tombstone` con
  `entity_ids.session_ids=[remote_id]`;
- metadata redatti, nessun JSON raw sensibile in UI.

### Idempotenza, loop e cleanup

- Android:
  - dopo convergenza finale, `sync_event_watermarks.lastSyncEventId=3150`;
  - `sync_event_outbox` count `0`;
  - logcat finale: `cycle=sync_events_drain outcome=ok`,
    `eventsFetched=0`, `eventsProcessed=0`, `outboxPending=0`,
    nessun `PayloadValidation`;
  - remote ref History count `1`.
- iOS:
  - `sync.events.watermark...store.anonymous=3150`;
  - `sync.runtime.orchestrator.lastRunStatus=success`;
  - History remote row count `1`.
- Cleanup remoto:
  - product `deleted_at=2026-06-19T16:12:30.526686Z`,
    event `3148`;
  - supplier `deleted_at=2026-06-19T16:15:14.234316Z`,
    event `3149`;
  - category `deleted_at=2026-06-19T16:15:19.849376Z`,
    event `3150`;
  - History Entry `deleted_at=2026-06-19T16:08:36.356Z`,
    event `3147`.
- Cleanup client:
  - Android active synthetic product/supplier/category count `0`;
  - iOS active synthetic product/supplier/category rows `0`;
  - History tombstone resta come row remota tombstonata su entrambi per evitare
    duplicati e preservare sync/audit append-only.

### Check TASK-072B

| Comando / tool | Esito | Note |
|---|---|---|
| Admin `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin `npm run lint` | `PASS_WITH_WARNINGS` | 0 errori, 4 warning `_shopId` nei fallback legacy. |
| Admin `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| Admin `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs` | `PASS` | `3/3`. |
| Admin `npm run test:foundation` | `PASS` | `385/385`. |
| Admin `npm run build` | `PASS_WITH_WARNINGS` | warning noti Next `middleware` deprecato e Node `DEP0205`. |
| Admin `npm run verify` | `PASS_WITH_WARNINGS` | lint/typecheck/security/build passano; stessi warning. |
| Admin `npm run test:shop:local` | `FAIL_ENV` | primo tentativo bloccato da dev server gia attivo su `3055`; rerun con `next start` porta `3060` avvia i test ma fallisce nel setup locale `BLOCKED_TASK035_DEVICE_CREATE`. `.env.local` e cloud-dev oriented mentre lo smoke locale forza Supabase locale; non e stato fatto reset/apply distruttivo del DB locale. |
| Android `./gradlew assembleDebug` | `PASS` | usato per reinstallare APK corretto. |
| Android `./gradlew assembleDebug lintDebug testDebugUnitTest` | `PASS` | `BUILD SUCCESSFUL`, 58 task. |
| Android simulator/local DB TASK072_RT | `PASS` | DB Room + WAL copiati da emulator, watermark finale `3150`, outbox `0`. |
| iOS XcodeBuildMCP `session_show_defaults` | `PASS` | profilo `task-072-ios`, scheme `iOSMerchandiseControl`. |
| iOS XcodeBuildMCP `build_sim` | `PASS` | build simulator riuscito, 0 warning/errori. |
| iOS XcodeBuildMCP targeted `test_sim` | `PASS` | `HistorySessionSyncServiceTests`, `SyncEventRecordingTests`, `SyncEventOutboxStateTests`: `73/73`. |
| iOS simulator/local store TASK072_RT | `PASS` | SwiftData/CoreData store + WAL copiati, watermark finale `3150`, status `success`. |
| Admin `git diff --check` | `PASS` | nessun whitespace error. |
| Android `git diff --check` | `PASS` | nessun whitespace error. |
| iOS `git diff --check` | `PASS` | nessun whitespace error. |

### Stato working tree TASK-072B

- Admin Web contiene modifiche TASK-072 core, override device
  auto-registration e una parte di drift/evidence precedente gia presente;
  nessun file e stato staged/committed/pushed.
- Android:
  - TASK-072B ha modificato
    `app/src/main/java/com/example/merchandisecontrolsplitview/data/SharedSheetSessionRecord.kt`;
  - restano modifiche device auto-registration gia presenti:
    `MerchandiseControlApplication.kt` e
    `ShopDeviceRegistrationRemoteDataSource.kt`.
- iOS:
  - nessun nuovo file iOS modificato da TASK-072B;
  - restano modifiche device auto-registration e molte evidence/screenshot
    TASK-135 preesistenti nel working tree.

### Rischi residui TASK-072B

- `test:shop:local` resta `FAIL_ENV` per fixture locale
  `BLOCKED_TASK035_DEVICE_CREATE`; la prova cross-platform richiesta e stata
  eseguita sul cloud dev non-production usato dai simulatori reali.
- Le mutazioni business Admin Web e `sync_events`/audit non sono atomiche in
  una singola transazione RPC; se l'evento fallisce dopo la mutazione, l'azione
  ritorna errore ma il dato business puo essere gia committato.
- iOS conserva in alcune preferenze diagnostiche l'ultimo errore storico di
  decode, ma dopo il fix il watermark finale e `3150` e
  `lastRunStatus=success`.

### Verdict TASK-072B

- `EXECUTION_COMPLETED_READY_FOR_REVIEW`.
- Non marcato `DONE`; serve review/approvazione esplicita dell'utente.

## Final review reconciliation - 2026-06-19

- Verdict reviewer: `SUPERSEDED_BY_FINAL_GAP_CLOSURE`, non `DONE_RECONCILED`.
- Admin Web -> Android/iOS:
  - catalogo create/update/tombstone/restore provato su cloud dev con eventi
    `3139`-`3144`;
  - History Entry update/tombstone provate con eventi `3146`-`3147`;
  - History Entry create `3145` ha emesso l'evento, ma l'apply mobile iniziale
    aveva fallito sul payload overlay; manca una fresh create post-fix provata
    su Android e iOS.
- Mobile -> Admin Web:
  - non verificato runtime in TASK-072;
  - harness esistenti coprono mobile -> Supabase/read-back con prefissi
    TASK-114/TASK-135, non una prova TASK-072 mobile-origin visibile da Admin
    Web.
- Snapshot locali ricontrollati:
  - Android `/tmp/task072b_android_app_database.sqlite`: watermark `3150`,
    `sync_event_outbox=0`, prodotto/supplier/category synthetic active `0`,
    History tombstone `aeae2f00-59ad-4584-ae10-1a2a572eb4bc` con remote ref
    count `1`;
  - iOS `/tmp/task072b_ios_default.store`: prodotto/supplier/category synthetic
    active `0`, History tombstone presente; outbox contiene `2` righe
    `localOnly` del `2026-06-18` non TASK-072 (`task072_outbox_matches=0`), quindi
    non va dichiarato outbox iOS pulito.
- `test:shop:local`: risultato canonico piu recente `FAIL_ENV`, non il vecchio
  `PASS` storico; failure `BLOCKED_TASK035_DEVICE_CREATE` nel setup locale.
- Rischi residui reviewer:
  - mutazioni business Admin Web non atomiche con audit/sync_events;
  - writer `sync_events` server-side si fida dei caller attuali per metadata
    safe invece di imporre allowlist runtime completa;
  - fallback legacy owner-scoped utile per schema misto ma non sufficiente per
    dichiarare prova no cross-shop leak piena;
  - idempotenza/no-loop supportata da watermark/outbox Android e client_event_id
    deterministici, ma senza replay runtime dello stesso event/seed.
- Drift:
  - device auto-registration Admin/Android/iOS e TASK-035/TASK-135 evidence sono
    separabili dal core catalog/history solo con staging esplicito dei path;
  - non usare `git add .` per un eventuale commit TASK-072.

## Runtime fix Devices RLS/Auth gate - 2026-06-19

- Target runtime verificato:
  - browser aperto su
    `http://localhost:3055/shop/devices?shop_id=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d`;
  - processo `next-server (v16.2.6)` in ascolto su `127.0.0.1:3055`;
  - `.env.local` e `supabase/.temp/linked-project.json` puntano al cloud dev
    `merchandisecontrol-dev` (`jpgo...yvm`);
  - `npm run dev:db:check -- --mode=cloud` passato, target non production.
- Causa esatta:
  - la pagina non era bloccata da membership/RLS owner;
  - il DB attivo non aveva migration locali recenti applicate;
  - query PostgREST redatta prima del fix:
    - `shop_devices`: `42703 column shop_devices.last_seen_profile_id does not exist`;
    - `sync_events`: `42703 column sync_events.shop_id does not exist`.
- Membership verificata per shop `bc01ea8e...5b8d`:
  - `shop_inventory_sources`: mapping attivo `mapped` verso owner
    `6425adb0...257e`;
  - `shop_members`: `6425adb0...257e`, `shop_owner`, `active`.
- Migration runtime applicate al solo cloud dev linkato:
  - `supabase db push --linked --include-all --dry-run` ha elencato migration
    mancanti da `20260611153437` a
    `20260619123000_task_072_device_auto_registration.sql`;
  - `supabase db push --linked --include-all --yes` completato con successo;
  - nessun apply production, nessun commit/stage/push.
- Prova DB dopo push:
  - `shop_devices` select con colonne `last_seen_*`: `ok=true`, `count=0`
    prima della registrazione manuale;
  - `sync_events` con `shop_id` e `source_device_id`: `ok=true`, `count=5`
    per lo shop target.
- Prova browser dopo reload:
  - `Read blocked=false`;
  - `Device registry rows could not be loaded through RLS=false`;
  - `Revocation unavailable=false`;
  - sezione `Detected sync clients` visibile con `2` activity hints;
  - registry autorizzato mostra empty state `No registered devices yet`.
- Registrazione manuale autenticata:
  - form `Manual device fallback` usato con
    `codex-task072-web-fallback-20260619`;
  - riga visibile con display name `Codex Task 072 Browser Fallback`, type
    `Web`, account visto `Platform Admin`, app version
    `admin-web-smoke-2026.06.19`;
  - screenshot:
    `docs/TASKS/EVIDENCE/TASK-072/devices-runtime-fixed-registry-visible.png`.
- Test negativo runtime revoked/register:
  - device `8beecc93...b992` revocato via form Shop Admin;
  - re-register dello stesso identifier via form Shop Admin;
  - riga rimasta `Revoked` e app version aggiornata a
    `admin-web-smoke-2026.06.19-reregister`, quindi register/heartbeat non
    riattiva automaticamente un device revocato.
- Hardening read model:
  - `shop_devices` resta l'unica lettura bloccante per registry;
  - failure accessorie su mapping/sync activity degradano a hints vuoti senza
    nascondere righe registry autorizzate.
- Test aggiornati:
  - `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts` ora verifica
    riga Devices reale, ultimo account visto, no cross-shop leak e negativo
    revoked/register con RPC autenticata;
  - `tests/foundation/task-072-device-auto-registration.test.mjs` protegge
    empty state `No registered devices yet` e degradazione soft degli hint.

### Runtime fix check parziali

| Comando / tool | Esito | Note |
|---|---|---|
| `git status --short --branch --untracked-files=all` | `PASS_WITH_DIRTY_TREE` | Branch `main`; working tree gia modificato da TASK-072/preesistenti, nessun commit/stage. |
| `git diff --check` preflight | `PASS` | Nessun whitespace error. |
| `npm run dev:db:check -- --mode=cloud` | `PASS` | `.env.local` cloud dev, non production. |
| `supabase migration list` | `FOUND_PENDING` | `20260619123000` e prerequisiti non applicati al cloud dev. |
| `supabase db push --linked --include-all --dry-run` | `PASS` | Elenco migration mancanti verificato. |
| `supabase db push --linked --include-all --yes` | `PASS` | Migration applicate al cloud dev linkato. |
| Browser plugin `/shop/devices` reload | `PASS` | `Read blocked` sparito; registry e detected sync clients visibili. |
| Browser plugin manual register + revoked/register negativo | `PASS` | Riga visibile; re-register non riattiva device revocato. |
| `node --test tests/foundation/task-072-device-auto-registration.test.mjs` | `PASS` | `4/4` pass. |
| `npm run test:foundation` | `PASS` | `385/385` pass dopo allineamento guardrail History. |
| `npm run lint` | `PASS_WITH_WARNINGS` | 4 warning preesistenti `_shopId` non usato in history/sync writer. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run security:scan` | `PASS` | Scanner aggiornato per History explicit builder. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning noti Next `middleware` deprecato e Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Lint/typecheck/security/build passano; stessi warning. |
| `git diff --check` finale | `PASS` | Nessun whitespace error. |
| `git status --short --branch --untracked-files=all` finale | `PASS_WITH_DIRTY_TREE` | Branch `main`; modifiche TASK-072 e file preesistenti, nessun commit/stage. |

## Implementazione Admin Web core

- `src/server/shop-admin/sync-event-writer.ts`
  - writer server-only per `sync_events`;
  - `client_event_id` deterministico `admin_web:<sha256>`;
  - metadata redatti, `source = "admin_web"`, `source_device_id = null`;
  - duplicate key `23505` trattata come idempotent success.
- `src/server/shop-admin/catalog-mutations.ts`
  - mutazioni prodotto/categoria/fornitore collegate a `catalog_changed` o
    `catalog_tombstone`;
  - `entity_ids` mobile-compatible: `supplier_ids`, `category_ids`,
    `product_ids`.
- `src/server/shop-admin/history-mutations.ts`
  - create/update/tombstone History Entry v2 server-side;
  - `payload_version = 2`, `session_overlay.overlay_schema = 1`,
    `remote_id` UUID lowercase;
  - tombstone logico via `deleted_at`, nessun hard delete;
  - audit amministrativo su `audit_logs`, segnale tecnico su `sync_events`;
  - `session_ids` per delta apply Android/iOS.
- `src/app/shop/actions.ts`, `src/app/shop/history/page.tsx`,
  `src/app/shop/history/[entryId]/page.tsx`
  - server actions e UI create/update/tombstone History Entry;
  - form visibili solo con `history.write`.
- `src/server/shop-admin/permissions.ts`
  - aggiunto `history.write` per owner/manager.
- `src/server/shop-admin/shop-section-data.ts`
  - Sync Center espone eventi Admin Web e cursor/client event;
  - mantiene separati `sync_events`, History Entry e `audit_logs`.
- `scripts/security-checks.mjs`
  - guardrail TASK-072 per server-only, redaction, tombstone e builder route.
- `tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`
  - coverage statica su Admin Web writer/history/UI e compatibilita mobile.

Nota device auto-registration: la richiesta successiva dell'utente ha esteso
lo scope TASK-072. Le modifiche device sono ora documentate come override
esplicito in questa evidence e restano in handoff `REVIEW`, non `DONE`.

## Verifica mobile e UI live

- Android static discovery:
  - `SyncEventModels.kt` contiene `supplier_ids`, `category_ids`,
    `product_ids`, `session_ids`;
  - remote data source legge `sync_events` owner-scoped;
  - repository applica catalog/history per entity ids e tombstone.
- iOS static discovery:
  - sync remote adapter legge `sync_events` owner-scoped;
  - history adapter legge/scrive `shared_sheet_sessions` v2 con tombstone;
  - helper incremental estrae `supplier_ids`, `category_ids`, `product_ids`,
    `session_ids`.
- Computer Use read-only sui simulatori aperti:
  - iOS Simulator `iPhone 17 Pro iOS 26.5`: account cloud collegato,
    database locale aggiornato, prodotti `19704`, fornitori `66`, categorie
    `35`, storico prezzi `41131`, sessioni cronologia `35`;
  - Android Studio Running Devices `Medium Phone API 35`: account cloud
    collegato, database locale pronto, prodotti `19704`, fornitori `66`,
    categorie `35`, storico prezzi `41131`, sessioni cronologia `35`;
  - nessun click/mutazione UI eseguito con Computer Use.

## Check eseguiti

| Comando / tool | Esito | Note |
|---|---|---|
| `pnpm exec tsc --noEmit --pretty false` | `NOT_RUN_TOOL_MISSING` | `pnpm: command not found`; fallback `npm run typecheck` passato. |
| `npm run lint` | `PASS` | ESLint senza output di errori. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generati. |
| `npm run security:scan` | `PASS` | Scanner TASK-072 aggiornato e verde. |
| `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs` | `PASS` | `3/3` pass. |
| `npm run test:foundation` | `PASS` | `385/385` pass. |
| `node --test tests/foundation/task-072-device-auto-registration.test.mjs` | `PASS` | `4/4` pass; include negativo statico revoked/register/heartbeat. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning noti: Next `middleware` deprecato; Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Esegue lint/typecheck/security/build; stessi warning build. |
| Playwright smoke `/shop/devices` anonimo | `PASS` | `protects /shop/devices without exposing live controls anonymously`, `1/1` pass su `next start` porta `3062`. |
| `npm run test:shop:local` su server esistente `3055` | `FAIL_ENV` | Dev server non avviato dal wrapper: login smoke timeout verso `/shop`. |
| `npm run test:shop:local` con `next start` porta `3060` pre-rebuild | `FAIL_STALE_BUILD` | `4/5` pass; failure copy storico Sync Center non nel bundle vecchio. |
| `npm run test:shop:local` con `next start` porta `3060` dopo rebuild | `PASS` | `5/5` pass. |
| `git diff --check` Admin Web | `PASS` | Nessun whitespace error. |
| Android `./gradlew assembleDebug lintDebug testDebugUnitTest` | `PASS` | Rerun finale sullo stato corrente: BUILD SUCCESSFUL, `58` task. |
| XcodeBuildMCP `session_show_defaults` | `PASS_WITH_SETUP` | Defaults vuoti; discovery eseguita. |
| XcodeBuildMCP `build_sim` | `PASS` | `iOSMerchandiseControl`, iPhone 17 Pro iOS 26.5, build finale 0 warning/errori. |
| XcodeBuildMCP targeted `test_sim` sync/outbox | `PASS_WITH_PREEXISTING_TEST_WARNINGS` | `SyncEventRecordingTests` + `SyncEventOutboxStateTests`: `58/58`; warning solo in test storici non toccati. |
| XcodeBuildMCP full `test_sim` | `FAIL_WITH_PREEXISTING_SUITE_DRIFT` | `858` passed, `23` failed, `29` skipped; failure su test storici non correlati. |
| XcodeBuildMCP targeted `test_sim` | `PASS` | `HistorySessionSyncServiceTests`, `SyncEventRecordingTests`, `SyncEventOutboxStateTests`: `73/73`. |
| Supabase production/cloud apply | `NOT_RUN_FORBIDDEN` | Nessuna autorizzazione production/cloud. |
| Supabase local migration/lint core | `NOT_RUN_NOT_NEEDED` | Nessuna migration catalog/history/sync_events applicata per il core TASK-072. |

## Stato git finale osservato

Admin Web working tree contiene il core storico TASK-072 e l'override device
auto-registration richiesto in questa handoff:

- Core TASK-072 Codex:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-072-cross-platform-catalog-sync-history-entry-write-path.md`
  - `docs/TASKS/EVIDENCE/TASK-072/README.md`
  - `scripts/security-checks.mjs`
  - `src/app/shop/actions.ts`
  - `src/app/shop/history/page.tsx`
  - `src/app/shop/history/[entryId]/page.tsx`
  - `src/server/shop-admin/catalog-mutations.ts`
  - `src/server/shop-admin/history-mutations.ts`
  - `src/server/shop-admin/permissions.ts`
  - `src/server/shop-admin/shop-section-data.ts`
  - `src/server/shop-admin/sync-event-writer.ts`
  - `tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`
- Override device auto-registration:
  - `src/app/shop/_components/DeviceActionPanel.tsx`
  - `src/app/shop/devices/page.tsx`
  - `src/lib/supabase/database.types.ts`
  - `src/server/pos-auth/service.ts`
  - `src/server/shop-admin/device-read-model.ts`
  - `src/server/shop-admin/staff-aware-mutations.ts`
  - `supabase/migrations/20260619123000_task_072_device_auto_registration.sql`
  - `tests/foundation/task-072-device-auto-registration.test.mjs`
- Artefatti non di codice osservati e non revertiti:
  - `docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png`
    rigenerato dallo smoke.
- Android final status: contiene modifica a `MerchandiseControlApplication.kt`
  e nuovo
  `app/src/main/java/com/example/merchandisecontrolsplitview/data/ShopDeviceRegistrationRemoteDataSource.kt`;
  build/lint/unit test correnti passano.
- iOS final status: contiene modifiche device auto-registration a
  `ContentView.swift`, `SupabaseAuthViewModel.swift`,
  `AutomaticSyncEventOutboxWriter.swift`,
  `SupabaseManualSyncReleaseFactory.swift`,
  `iOSMerchandiseControlApp.swift`, oltre a
  `ShopDeviceRegistrationService.swift` untracked e molti artefatti evidence /
  screenshots preesistenti; build simulator passa senza warning e targeted
  sync/outbox tests passano.

## Rischi residui

- Le mutazioni business Admin Web e la scrittura `sync_events`/`audit_logs` non
  sono transazionali in un'unica RPC: in caso di failure post-mutazione,
  l'azione torna errore ma la mutazione business puo essere gia committata.
- iOS full suite resta non verde per drift storico non correlato; il subset
  pertinente history/sync-event e verde.
- Android/iOS registrano device e hint, ma enforcement completo del registry
  mobile resta follow-up client.
- Nessun apply production/cloud e nessun test live che crea dati reali e stato
  eseguito in questa handoff.

## Override device auto-registration 2026-06-19

### Schema/RPC verificati

- Migration additiva:
  `supabase/migrations/20260619123000_task_072_device_auto_registration.sql`.
- `shop_devices` viene arricchita con:
  - `last_seen_profile_id`;
  - `last_seen_staff_id`;
  - `last_seen_principal_kind`.
- `shop_device_register`:
  - upsert shop-scoped su `(shop_id, device_identifier)`;
  - aggiorna `last_seen_at`, ultimo account visto e metadata redatti;
  - preserva `revoked` e `suspicious`, quindi un heartbeat/register non torna
    `active` se il device e stato revocato o marcato suspicious;
  - blocca ricorsivamente chiavi metadata sensibili:
    `token`, `secret`, `password`, `pin`, `hash`, `credential`.
- `shop_device_register_current_owner`:
  - non accetta `shop_id` dal client;
  - risolve lo shop server-side da `shop_inventory_sources.owner_user_id =
    auth.uid()`, `mapping_state='mapped'`, `disabled_at is null`, shop active;
  - delega a `shop_device_register`, mantenendo RLS/RPC shop-scoped.
- Nessun apply Supabase production/cloud eseguito.

### Admin Web Devices

- `src/server/shop-admin/device-read-model.ts`
  - legge registry `shop_devices` per selected shop;
  - risolve ultimo account visto da `profiles`;
  - risolve ultimo staff visto da `staff_accounts_safe`;
  - collega history/sync activity tramite `sync_events.source_device_id`;
  - costruisce `detectedSyncClients` solo per source device id non registrati.
- `src/server/shop-admin/shop-section-data.ts`
  - sostituisce semantica generica owner con `Last account seen` /
    `Last staff seen`;
  - aggiunge `Detected sync clients` come tabella read-only;
  - copy esplicito: activity hints, non autorizzazione e non revocabili da li.
- `src/app/shop/devices/page.tsx`
  - link a detail device e history sync;
  - mantiene `shop_id` solo come contesto UI, non come autorizzazione.
- `src/app/shop/_components/DeviceActionPanel.tsx`
  - manual register rinominato come fallback avanzato, non flusso principale.

### Android

- Repo: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`.
- `device_install_id`:
  - generato come UUID random;
  - persistito in Room tramite `SyncEventDeviceStateDao`;
  - riusato dal sync/event state esistente.
- Registrazione:
  - nuovo `ShopDeviceRegistrationRemoteDataSource`;
  - RPC `shop_device_register_current_owner`;
  - trigger best-effort dopo auth, foreground e ritorno rete in
    `MerchandiseControlApplication`.
- Metadata inviati:
  - `platform`, `model`, `os_version`, `app_version_present`, `simulator`,
    `reason`;
  - niente IMEI, seriale, MAC, posizione, token, secret, password, PIN, hash o
    credential.

### iOS

- Repo: `/Users/minxiang/Desktop/iOSMerchandiseControl`.
- `device_install_id`:
  - generato come UUID random lowercase;
  - persistito in `UserDefaults` con chiave `shop.device.install.id`;
  - non usa `identifierForVendor`, seriale, MAC o fingerprint invasivi.
- Registrazione:
  - nuovo `ShopDeviceRegistrationService`;
  - RPC `shop_device_register_current_owner`;
  - trigger best-effort dopo auth, foreground e trigger sync automatico.
- Sync hints:
  - `AutomaticSyncEventOutboxWriter` e history sync event usano lo stesso id
    come `sourceDeviceID`.
- Metadata inviati:
  - `platform`, `model`, `os_version`, `app_version_present`, `simulator`,
    `reason`;
  - niente token, secret, password, PIN, hash o credential.

### POS/server enforcement

- `src/server/pos-auth/service.ts`
  - first login blocca device esistenti `revoked` o `suspicious`;
  - heartbeat blocca sessioni/device revocati e richiede `device.status =
    'active'`;
  - aggiorna ultimo staff visto e principal kind POS.
- `src/server/pos-auth/catalog-pull.ts` e `src/server/pos-auth/sales-sync.ts`
  richiedono `device?.status === 'active'`.
- `src/server/shop-admin/staff-aware-mutations.ts`
  non usa piu upsert cieco su `shop_devices` nel path staff e preserva
  `revoked`/`suspicious`.

### Limiti residui device

- Android/iOS registrano il device e scrivono hint di sync, ma non consumano
  ancora `shop_devices.status` per bloccare localmente tutte le write/sync:
  l'enforcement completo mobile resta follow-up client.
- La RPC mobile owner-scoped richiede una mapping `shop_inventory_sources`
  attiva per l'account personale; senza mapping il risultato corretto e
  `shop_mapping_not_found`.
- La migration e stata applicata al cloud dev linkato
  `merchandisecontrol-dev`; non e stata applicata a production.

## Handoff

- Prossima fase: `REVIEW`.
- Codex non marca `DONE`.
- Per passare a `DONE` serve review positiva e conferma esplicita dell'utente.

## iOS Device Runtime Registration Live Gate - 2026-06-19

### Scope

- Richiesta: rendere visibile almeno un vero iOS Simulator in
  `shop_devices`/`/shop/devices` oppure identificare e correggere la causa.
- Target cloud dev confermato: Admin Web e iOS puntano entrambi a
  `jpgoimipbothfgkokyvm.supabase.co` (`merchandisecontrol-dev`); iOS usa
  `SUPABASE_PUBLISHABLE_KEY`, non service-role.
- Shop target: `bc01ea8e...5b8d`.
- Owner/session usata: account personale mappato `6425adb0...257e`, email
  redatta `x***@gmail.com`, mapping attiva in `shop_inventory_sources`.

### Cause

- Il simulatore `iPhone 17 Pro`
  (`AC6FBFC3-A97F-412C-BEC0-F88B9956107B`) era signed out: la UI iOS mostrava
  `Accedi per usare il cloud`.
- `AppSyncRootHost` chiamava il service di registrazione device anche su
  bootstrap/foreground senza verificare `authViewModel.isSignedIn`.
- Quella chiamata anonima colpiva la RPC grantata solo ad `authenticated` e
  produceva `PostgREST 42501`, prima che un vero auth event potesse registrare
  il device.
- La RPC server-side e risultata corretta quando chiamata con sessione owner
  valida: `shop_device_register_current_owner` ha risposto `ok=true`,
  `code=success`.

### Fix iOS

- `ShopDeviceRegistrationService.swift`
  - aggiunto guard su sessione Supabase attiva/non scaduta prima della RPC;
  - aggiunto logging OSLog redatto `started/succeeded/failed`;
  - decode dell'action result JSONB: il metodo ritorna successo solo con
    `ok=true`;
  - nessun token/secret/password/PIN/hash/credential in metadata.
- `ContentView.swift`
  - bootstrap, foreground e trigger sync chiamano la registrazione solo se
    `authViewModel.isSignedIn`;
  - `automatic_sync` resta `force: true` ma sempre dietro auth gate.
- Nessun debug token-in-URL hook resta nel codice finale: e stato usato solo
  temporaneamente per creare la sessione live del simulatore, poi rimosso e
  verificato con build finale.

### Evidence live

- Build/install/launch iOS finale:
  - XcodeBuildMCP `build_run_sim`: `SUCCEEDED`, simulatore `iPhone 17 Pro`,
    bundle `com.niwcyber.iOSMerchandiseControl`, zero warning/errori.
  - Stop/launch successivo: `SUCCEEDED`.
- Log redatto catturato durante la sessione live:
  - `shop_device_register_current_owner started reason=auth_signed_in
    device=5a77c1d7...ca5e app_version_present=true`
  - `shop_device_register_current_owner succeeded app_code=success
    shop=bc01ea8e...5b8d target=bc5f5a60...ba90`
- DB finale redatto:
  - `shop_devices`: `iOS arm64`, identifier `5a77c1d7...ca5e`,
    `device_type=mobile`, `status=active`, `app_version=1.0 (1)`,
    `last_seen_at=2026-06-19T16:42:44.171538+00:00`,
    `last_seen_profile_id=6425adb0...257e`,
    `last_seen_principal_kind=personal_account`,
    metadata `platform=ios`, `model=arm64`, `simulator=true`.
  - `sync_events`: nessun hint iOS generato in questa prova; i detected sync
    hints restano Android-only, quindi la UI mostra iOS tramite registry
    autorizzativo, non tramite activity hint.
- UI `/shop/devices`:
  - screenshot: `ios-device-runtime-registry-visible.png`;
  - DOM verified: `iOS arm64`, `Mobile`, `Active`, `1.0 (1)`,
    `Detected sync clients` presente.
- Test negativo revoked/register:
  - row diagnostica `codex-ios-diagnostic-redacted-20260619` revocata via RPC;
  - re-register owner-scoped sullo stesso identifier ritorna `ok=true`, ma
    `status` resta `revoked`;
  - `last_seen_at` avanza, senza riattivazione automatica.

### Residuals

- Enforcement completo mobile resta follow-up: iOS registra il device e usa
  lo stesso install id per sync hints, ma non blocca ancora localmente tutte le
  write/sync quando `shop_devices.status='revoked'`.
- La row diagnostica revocata resta nel registry perche non si fanno hard
  delete; e marcata `Revoked` e serve come evidence del test negativo.
- La cattura OSLog del build finale non ha flushato le righe del service, ma
  il build finale senza hook debug ha aggiornato il DB live a
  `2026-06-19T16:42:44.171538+00:00`.

### Checks finali

- Admin Web:
  - `npm run security:scan`: `PASS` (`Security scan passed.`)
  - `npm run test:foundation`: `PASS` (`385` pass, `0` fail)
  - `npm run typecheck`: `PASS`
  - `npm run lint`: `PASS_WITH_WARNINGS` (`0` errors, `4` warning su
    `_shopId` non usato in file TASK-072 history/sync preesistenti)
  - `npm run build`: `PASS_WITH_WARNINGS` (Next `middleware` deprecato,
    Node `DEP0205`)
  - `npm run verify`: `PASS_WITH_WARNINGS` (stessi warning lint/build)
  - Browser smoke `/shop/devices`: `PASS`, DOM contiene `iOS arm64`,
    `Active`, `1.0 (1)`, `Detected sync clients`.
  - `git diff --check`: `PASS`.
  - `git status --short --branch --untracked-files=all`: branch
    `main...origin/main`, no stage/commit; worktree contiene drift TASK-072
    gia presenti piu `ios-device-runtime-registry-visible.png`.
- iOS:
  - XcodeBuildMCP `build_run_sim`: `PASS`, build/install/launch su
    `iPhone 17 Pro`.
  - XcodeBuildMCP `stop_app_sim` + `launch_app_sim`: `PASS`.
  - Live session/RPC/DB: `PASS`, `iOS arm64` active in `shop_devices`.
  - `git diff --check`: `PASS`.
  - `git status --short --branch --untracked-files=all`: branch
    `main...origin/main`, no stage/commit; molte evidence TASK-114/TASK-135
    untracked preesistenti e `ShopDeviceRegistrationService.swift` untracked.

## TASK-072C Subagent A - Admin Web runtime/UI/harness - 2026-06-19

### Scope

- Richiesta: verificare se Admin Web ha gia un modo sicuro per creare/verificare
  dati sintetici `TASK072C_*` Admin-origin e leggere dati mobile-origin da
  `/shop/products` e `/shop/history`.
- Perimetro eseguito: Admin Web scripts/tests/docs TASK-072.
- Non eseguito: commit, push, stage, deploy, migration cloud/production,
  modifiche Android/iOS, API production.

### Finding

- Admin Web ha gia path runtime sicuri:
  - `/shop/products` legge catalogo server-side tramite
    `getShopInventoryProductsPage` / `getShopInventoryReadModel`;
  - `/shop/products/[productId]` collega History entries correlate;
  - `/shop/history` e `/shop/history/[entryId]` leggono
    `shared_sheet_sessions` e `sync_events`, distinguendo History Entry,
    evento tecnico e audit;
  - create/update/tombstone History Entry passano da server action protette da
    `history.write`;
  - catalog mutations emettono `sync_events` redatti tramite writer server-only.
- Gap confermato: mancava un harness Admin Web runtime read-only che producesse
  un report redatto per prefisso `TASK072C_*`, overlay history,
  `sync_events`, origin summary e cleanup counts.

### Harness creato

- File: `scripts/platform/task-072c-admin-runtime-harness.mjs`.
- Comandi supportati:
  - `verify`;
  - `status`;
  - `cleanup-counts`.
- Comandi intenzionalmente non supportati:
  - create/update/delete/cleanup mutativi;
  - deploy/migration;
  - API route/browser client.
- Boundary:
  - usa `SUPABASE_SERVICE_ROLE_KEY` solo in processo Node CLI;
  - richiede `TEST_TARGET=local` oppure `TEST_TARGET=staging`;
  - staging/cloud-dev richiede `ALLOW_STAGING_E2E=yes`,
    `CONFIRM_STAGING_E2E=yes` e project ref allowlistato;
  - blocca production-like project ref tramite guardrail esistenti;
  - output redatto: niente secret, token, email, shop name/code reali o raw
    payload non redatti.

### Uso previsto

Esempio cloud-dev/staging non-production:

```bash
TEST_TARGET=staging \
ALLOW_STAGING_E2E=yes \
CONFIRM_STAGING_E2E=yes \
ALLOWED_STAGING_SUPABASE_PROJECT_REFS=<dev-or-staging-ref> \
node scripts/platform/task-072c-admin-runtime-harness.mjs verify \
  --shop-id=<shop_id> \
  --prefix=TASK072C_ \
  --require-data
```

Esempio cleanup-counts post test:

```bash
TEST_TARGET=staging \
ALLOW_STAGING_E2E=yes \
CONFIRM_STAGING_E2E=yes \
ALLOWED_STAGING_SUPABASE_PROJECT_REFS=<dev-or-staging-ref> \
node scripts/platform/task-072c-admin-runtime-harness.mjs cleanup-counts \
  --shop-id=<shop_id> \
  --prefix=TASK072C_
```

Il report include:

- counts prodotti/categorie/fornitori `TASK072C_*`;
- counts History Entry `TASK072C_*`;
- overlay status (`ok`, `invalid_shape`, `missing`, `legacy_v1`,
  `schema_unsupported`, `too_large`);
- `sync_events` correlati per prefisso o entity id;
- origin summary `admin_web`, `mobile_like`, `unknown`;
- cleanup counts read-only.

### Limiti e rischi

- `createAdminOrigin` resta `not_implemented`: il path sicuro per creare
  Admin-origin resta la UI/server actions autenticate, cosi permission context e
  audit non vengono bypassati da CLI.
- Il harness e una prova server-side read-only con service role process-only; non
  sostituisce una prova browser/RLS autenticata.
- Nessun dato `TASK072C_*` reale e stato creato o letto in cloud da questo
  subagent; lo script e pronto per il mini-proof Android/iOS/Admin Web.

### Checks Admin Web

- `node --check scripts/platform/task-072c-admin-runtime-harness.mjs`: `PASS`.
- `node scripts/platform/task-072c-admin-runtime-harness.mjs --help`: `PASS`,
  usage stampato senza secret.
- `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`:
  `PASS` (`4/4`).
- `npm run security:scan`: `PASS` (`Security scan passed.`).
- `npm run test:foundation`: `PASS` (`386` pass, `0` fail).
- `git diff --check`: `PASS`.

### Verdict subagent

- `DONE_WITH_CONCERNS`.
- Motivo: harness Admin Web read-only implementato e verificato; resta da usare
  durante il mini-proof reale `TASK072C_*` bidirezionale con Android/iOS.

## TASK-072C Runtime evidence reconciliation - 2026-06-19

### Verdict

- Verdict finale tecnico: `SUPERSEDED_BY_FINAL_GAP_CLOSURE`.
- Motivo: i nuovi harness provano Android-origin e iOS-origin fino ad Admin Web
  con UI/runtime evidence, ma non chiudono ancora tutti i lati richiesti dal
  brief TASK-072C:
  - Admin Web -> Android/iOS non e stato rieseguito fresh con prefisso
    `TASK072C_ADMIN_*`;
  - Android -> iOS e iOS -> Android non sono stati verificati runtime dopo la
    creazione mobile-origin;
  - Android e stato reinstallato dal runner strumentale e il visual post-run
    mostra `Cloud account and sync / Not signed in`;
  - cleanup completo non eseguito: restano righe sintetiche `TASK072C_*`
    attive;
  - idempotenza forte/replay watermark e negative RLS cross-shop non sono stati
    provati runtime.
- Nessun commit, push, stage, deploy o migration cloud/production eseguiti in
  questa reconciliation.

### Harness e runtime mobile-origin

- Android harness live:
  - file nuovo:
    `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task072CAndroidBidirectionalHarnessTest.kt`;
  - prefix: `TASK072C_ANDROID_R20260619_1345_`;
  - risultato subagent B: `PASS` su `Medium_Phone_API_35`;
  - log finale redatto: catalog create/update/tombstone `pass`, History
    create/update/tombstone `pass`, `syncType=EVENT_INCREMENTAL`,
    `fullPull=false`, `syncEventOutboxPending=0`;
  - checks dichiarati dal subagent: `compileDebugAndroidTestKotlin`,
    `assembleDebug`, `lintDebug -x :app:lintAnalyzeDebugUnitTest` e
    `git diff --check` `PASS`.
- iOS harness live:
  - file modificato:
    `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControlTests/Task103CrossPlatformAcceptanceTests.swift`;
  - prefix riuscito: `TASK072C_IOS_20260619T175420Z_`;
  - XcodeBuildMCP `test_sim` selected test
    `test072CIOSCreateUpdateTombstoneHistoryHarness`: `SUCCEEDED`,
    `1` passed, `0` failed;
  - build log:
    `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/logs/test_sim_2026-06-19T17-52-32-142Z_pid20641_8a8733c3.log`;
  - xcresult:
    `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/result-bundles/test_sim_2026-06-19T17-52-32-142Z_pid20641_d2872b3a.xcresult`;
  - log redatto: product create/update/tombstone `pass`,
    supplier/category create/update `pass`,
    supplier/category tombstone `not_supported_harness_gap`, History
    create/update/tombstone `pass`, run outbox `pending=0`, `sent=3`,
    `localOnly=0`.

### Admin Web read-only verification

Harness:
`scripts/platform/task-072c-admin-runtime-harness.mjs`.

Comandi eseguiti su cloud-dev/staging allowlistato `jpgo...yvm`, shop
`bc01ea8e...5b8d`, output redatto:

- `verify --prefix=TASK072C_ANDROID_R20260619_1345_ --require-data --json`:
  `PASS`, verdict harness `DONE_READONLY_HARNESS`.
  - products: `3` (`2` active, `1` tombstone);
  - categories: `2` (`1` active, `1` tombstone);
  - suppliers: `2` (`1` active, `1` tombstone);
  - history sessions visibili dal read model harness: `1` active,
    payload v2, overlay schema `1`, overlay `ok`;
  - sync events: `4` mobile-like, event ids `3151`, `3153`, `3155`, `3156`;
  - mapping owner bridge: `mapped=true`, `blocking=false`,
    owner redatto `6425adb0...257e`, `sourceScope=legacy_owner_bridge`.
- `verify --prefix=TASK072C_IOS_20260619T175420Z_ --require-data --json`:
  `PASS`, verdict harness `DONE_READONLY_HARNESS`.
  - products: `3` (`2` active, `1` tombstone);
  - categories: `1` active;
  - suppliers: `1` active;
  - history sessions visibili dal read model harness: `1` active,
    payload v2, overlay schema `1`, overlay `ok`;
  - sync events: `4` mobile-like, event ids `3165`, `3166`, `3167`, `3168`;
  - metadata redatti con source `ios_catalog_manual_push` e
    `ios_history_session_push`.
- `cleanup-counts --prefix=TASK072C_ --json`: `PASS_READONLY_WITH_RESIDUE`.
  - products: `9` total, `6` active, `3` tombstone;
  - categories: `5` total, `4` active, `1` tombstone;
  - suppliers: `5` total, `4` active, `1` tombstone;
  - history sessions visibili dal harness: `1` active;
  - sync events: `10` append-only mobile-like.

Nota: il read-only harness cerca righe prefissate direttamente nelle tabelle e
correla `sync_events`; la UI History mostra anche le tre entry History per
Android e le tre per iOS nella tabella accessibile, incluse update e tombstone.
Il delta tra harness e UI e quindi un limite del report read-only, non una
prova sufficiente di cleanup.

### Computer Use visual QA

- Safari/Admin Web autenticato su `localhost:3055`:
  - `/shop/products?shop_id=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d` caricato;
  - albero accessibile e pagina hanno mostrato prodotti
    `TASK072C_IOS_20260619T175420Z_*`,
    `TASK072C_IOS_20260619T174023Z_*` e
    `TASK072C_ANDROID_R20260619_1345_*`;
  - metriche visibili: `Total products 19,718`, `Filtered rows 19,710`,
    `Archived products 8`, `Legacy mobile bridge`.
- Safari/Admin Web History:
  - `/shop/history?shop_id=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d` caricato;
  - pagina visualmente `Mobile History Entries`, `Payload v2 59`,
    `Overlay OK 59`, `Overlay issues 0`;
  - albero accessibile include
    `TASK072C_IOS_20260619T175420Z_HISTORY_CREATE`,
    `TASK072C_IOS_20260619T175420Z_HISTORY_UPDATE_FINAL`,
    `TASK072C_IOS_20260619T175420Z_HISTORY_TOMBSTONE`,
    `TASK072C_ANDROID_R20260619_1345_HISTORY_CREATE`,
    `TASK072C_ANDROID_R20260619_1345_HISTORY_UPDATE_FINAL`,
    `TASK072C_ANDROID_R20260619_1345_HISTORY_TOMBSTONE`, tutti `Payload v2`
    e `Overlay OK`.
- Android Studio / emulator:
  - visual post-run su `Options`;
  - stato visibile `Cloud account and sync` -> `Not signed in`;
  - questo blocca una nuova verifica Android receiver senza riloggare.
- iOS Simulator:
  - app aperta da Computer Use;
  - visual `Inventario` con banner `Controllo aggiornamenti...`;
  - conferma solo UI alive/auto-check, non una prova receiver dei dati
    Android-origin.

### Matrix TASK-072C

| Direzione | Catalogo | History Entry | UI/store receiver | Esito |
|---|---|---|---|---|
| Admin Web -> Android | `NOT_RUN_TASK072C` | `NOT_RUN_TASK072C` | Android signed out dopo runner | `GAP` |
| Admin Web -> iOS | `NOT_RUN_TASK072C` | `NOT_RUN_TASK072C` | iOS alive, ma non receiver Admin-origin fresh | `GAP` |
| Android -> Admin Web | `PASS_WITH_RESIDUE` create/update/tombstone via sync_events `3151/3153/3155` | `PASS_WITH_READ_MODEL_LIMIT` event `3156`, UI History mostra create/update/tombstone | Products/History UI e harness Admin | `PARTIAL_PASS` |
| Android -> iOS | `NOT_VERIFIED_AFTER_ANDROID_RUN` | `NOT_VERIFIED_AFTER_ANDROID_RUN` | Android reinstall/sign-out ha impedito polling receiver | `GAP` |
| iOS -> Admin Web | `PASS_WITH_RESIDUE` create/update/product tombstone via sync_events `3165/3166/3167`; supplier/category tombstone non supportato dal harness riuscito | `PASS_WITH_READ_MODEL_LIMIT` event `3168`, UI History mostra create/update/tombstone | Products/History UI e harness Admin | `PARTIAL_PASS` |
| iOS -> Android | `NOT_VERIFIED_AFTER_IOS_RUN` | `NOT_VERIFIED_AFTER_IOS_RUN` | Android signed out/local DB non affidabile post-run | `GAP` |

### Security, idempotenza e cleanup

- Security/redaction:
  - harness Admin redige project ref, owner id, device id e metadata sensibili;
  - non sono stati stampati service-role key, token, PIN, password o raw auth
    metadata;
  - `sync_events.metadata` osservati non contengono secret evidenti.
- RLS/cross-shop:
  - verificato solo mapping positivo owner bridge per shop target;
  - negative query cross-shop/non autorizzata non eseguita in questa
    reconciliation.
- Idempotenza/no-loop:
  - Android e iOS harness hanno outbox nuova vuota/pending `0` dopo push;
  - replay dello stesso `client_event_id` e reset watermark non eseguiti.
- Cleanup:
  - non completato;
  - dati catalogo `TASK072C_*` restano attivi nel cloud-dev;
  - `sync_events` restano append-only intenzionalmente, ma non bastano come
    cleanup.

### Checks reconciliation

- Admin Web:
  - `node --check scripts/platform/task-072c-admin-runtime-harness.mjs`:
    `PASS`;
  - `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`:
    `PASS` (`4/4`);
  - `npm run security:scan`: `PASS`;
  - `npm run test:foundation`: `SUPERSEDED_FOUNDATION_PASS` nel run finale
    della reconciliation; falliscono due assert del guardrail
    `task-049-master-console-admins-ui-polish` su Platform Admin
    (`title={admin.profile_id}` e `title={rawValue}` in
    `AdminDataTable`). Non riguarda il flusso catalog/history TASK-072C e non
    viene contato come pass.
  - `git diff --check`: `PASS`;
  - `verify` Android prefix, `verify` iOS prefix e `cleanup-counts`
    `TASK072C_`: `PASS` read-only redatto;
  - checks completi di subagent A gia registrati sopra:
    targeted TASK-072 `4/4`, `security:scan`, `test:foundation 386/386`
    prima del run finale con drift TASK-049.
- Android:
  - subagent B: `assembleDebug`, `compileDebugAndroidTestKotlin`,
    targeted `connectedDebugAndroidTest` harness `PASS`;
  - run legacy successivo tentato da main: `FAIL` per sessione
    signed-out state, non conteggiato come pass;
  - `git diff --check`: `PASS`.
- iOS:
  - XcodeBuildMCP selected `test_sim`: `PASS` (`1/1`);
  - `git diff --check`: `PASS`.

### Drift separation

- Admin Web TASK-072C nuovo:
  - `scripts/platform/task-072c-admin-runtime-harness.mjs`;
  - `tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`;
  - questa evidence e il task file TASK-072.
- Android TASK-072C nuovo:
  - `Task072CAndroidBidirectionalHarnessTest.kt`;
  - modifiche correlate a `Task103CrossPlatformAcceptanceTest.kt` e compile fix
    `DEVICE_STATUS`.
- iOS TASK-072C:
  - `Task103CrossPlatformAcceptanceTests.swift`;
  - `ContentView.swift` compile fix `deviceBlocked`.
- Drift non stage-safe:
  - Admin Web contiene anche TASK-073/account identity, device auto-registration
    e screenshot TASK-035;
  - Android contiene `.idea/deploymentTargetSelector.xml` deleted e drift
    device/authorization;
  - iOS contiene molti untracked storici TASK-114/TASK-135 e screenshot.
  - Non usare `git add .`.

## Final gap closure / DONE reconciliation - 2026-06-19

### Verdict

- Stato finale TASK-072: `DONE_RECONCILED`.
- Chiusura richiesta esplicitamente dall'utente nel brief
  `TASK-072 Final Gap Closure / Android Live Auth / Foundation Green / DONE`.
- Nessun commit, push o stage.

### Schema e RPC verificati

- Migration cloud dev non-production verificate:
  - `20260619123000_task_072_device_auto_registration.sql`;
  - `20260619173000_task_072_device_authorization_status.sql`.
- `shop_device_register` e `shop_device_register_current_owner`:
  - upsert shop-scoped;
  - aggiornano `last_seen_at`, account/staff visto, app version e device type;
  - preservano `revoked` e `suspicious`, quindi heartbeat/register non
    riattivano automaticamente un device revocato;
  - rifiutano metadata con chiavi sensibili.
- `shop_device_status_current_owner(p_device_identifier text)`:
  - read-only;
  - non accetta `shop_id` dal client;
  - risolve lo shop da mapping owner server-side;
  - ritorna solo `status`, `can_write` e campi diagnostici redatti.
- Harness Supabase deterministico:
  - comando:
    `npm run verify:task072:devices -- --shop-id=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d --lint-timeout-ms=10000`;
  - esito: `PASS`;
  - il timeout controllato del lint CLI viene sostituito da controlli SQL
    deterministici su schema, grant, funzione read-only, metadata redaction,
    active/write e revoked/write.

### Registry live /shop/devices

- Smoke browser autenticato su `next start` locale:
  - route:
    `/shop/devices?shop_id=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d`;
  - fixture temporanea shop-manager creata e rimossa a fine test;
  - heading `Devices` visibile;
  - nessun `Read blocked`;
  - registry Android/iOS visibile;
  - label account presente come `Account usato` / ultimo account visto;
  - sezione `Detected sync clients` visibile come hint read-only, non
    autorizzazione;
  - screenshot:
    `docs/TASKS/EVIDENCE/TASK-072/task072-devices-authenticated-smoke.png`.

### Android live auth gate

- Test aggiunto: `Task072DeviceAuthorizationLiveGateTest.kt`.
- Il test e opt-in e importa una sessione owner temporanea solo da file
  strumentale locale; il file viene rimosso dopo l'import e non contiene
  service-role nel client Android.
- Device finale: `Android Google sdk_gphone64_arm64`, id redatto
  `606c1669...ba92`.
- Sequenza live sullo stesso `device_install_id`:
  - active: status `active`, `can_write=true`, manual/automatic sync non
    bloccate;
  - revoked: status `revoked`, `can_write=false`, heartbeat non riattiva,
    manual sync, automatic sync e write cloud risultano bloccati;
  - active finale: status `active`, `can_write=true`.
- Generazione `device_install_id`: UUID stabile per installazione persistito in
  Room tramite `SyncEventDeviceStateDao` e riusato per registry e
  `sync_events.source_device_id`.

### iOS live gate

- Build/test freschi:
  - XcodeBuildMCP `build_sim`: `PASS`, 0 warning/errori;
  - XcodeBuildMCP selected `test_sim`: `PASS` 1/1 per
    `testTask072DeviceAuthorizationGateCoversAutomaticManualAndBackgroundSync`;
  - `launch_app_sim`: `PASS`.
- Evidence live gia raccolta nella reconciliation precedente:
  - device `iOS arm64`, id redatto `5a77c1d7...ca5e`;
  - revoked -> `can_write=false`;
  - heartbeat/register aggiorna `last_seen_at` senza tornare active;
  - active finale -> `can_write=true`.
- Generazione `device_install_id`: UUID stabile per installazione persistito in
  `UserDefaults` tramite `DeviceInstallIDStore` e riusato nei sync event.

### POS/server-side

- POS resta modulo Shop Admin, non console separata.
- First login, heartbeat, catalog pull e sales sync richiedono device `active`.
- Heartbeat aggiorna `last_seen_staff_id` / `last_seen_principal_kind` senza
  salvare token, PIN, password, hash o credential in metadata.

### Checks finali

| Check | Esito | Note |
|---|---|---|
| Admin `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin `npm run test:foundation` | `PASS` | `390/390` sul run dopo fix guardrail TASK-054. |
| Admin TASK-049/TASK-073 targeted | `PASS` | `8/8`. |
| Admin `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| Admin `npm run lint` | `PASS_WITH_WARNINGS` | 0 errori, 8 warning noti in harness TASK-072C/history writer. |
| Admin `npm run build` | `PASS_WITH_WARNINGS` | Next `middleware` deprecato e Node `DEP0205`. |
| Admin `npm run verify` | `PASS_WITH_WARNINGS` | lint/typecheck/security/build passano; stessi warning. |
| Admin `npm run verify:task072:devices` | `PASS` | Harness deterministico Supabase cloud dev. |
| Browser `/shop/devices` authenticated smoke | `PASS` | Fixture temporanea e screenshot evidence. |
| Android `./gradlew assembleDebug lintDebug testDebugUnitTest` | `PASS` | `BUILD SUCCESSFUL`, 58 task. |
| Android `./gradlew :app:compileDebugAndroidTestKotlin` | `PASS` | Nuovo live gate compila. |
| Android live auth gate active -> revoked -> active | `PASS` | Stesso install id redatto. |
| iOS XcodeBuildMCP `build_sim` | `PASS` | 0 warning/errori. |
| iOS XcodeBuildMCP selected `test_sim` | `PASS` | `1/1`. |
| iOS XcodeBuildMCP `launch_app_sim` | `PASS` | Runtime simulator avviato. |
| Admin/Android/iOS `git diff --check` | `PASS` | Nessun whitespace error. |
| Admin/Android/iOS `git diff --cached --name-only` | `PASS` | Output vuoto: nessuno stage. |
| Admin/Android/iOS `git status --short --branch --untracked-files=all` | `PASS_WITH_DIRTY_TREE` | Worktree sporchi documentati, nessun commit/push/stage. |

### Rischi residui

- Restano righe diagnostiche revoked nel registry cloud dev; sono audit/history
  e non vengono hard-delete.
- Android e iOS bloccano i path coperti dai gate implementati; eventuali futuri
  write path mobile non ancora inventariati dovranno chiamare lo stesso gate
  prima della scrittura cloud.
- Il comportamento e quasi-realtime tramite foreground, before-write e polling
  leggero; non e stata introdotta una subscription Supabase realtime diretta su
  `shop_devices`.

## TASK-072D Final bidirectional runtime E2E - 2026-06-19

### Verdict

- Verdict operativo: `READY_FOR_DONE_CONFIRMATION`, non `DONE`.
- Scope completato: Admin Web -> Android/iOS, Android -> iOS/Admin Web,
  iOS -> Android/Admin Web, cleanup sintetico, idempotenza e negative RLS
  Admin harness.
- Nessun commit, push, stage, deploy o production migration apply.
- Prefissi sintetici: solo `TASK072D_*`.

### Admin Web seed, RLS e idempotenza

- Target cloud dev non-production: project ref redatto `jpgo...yvm`, shop
  `bc01ea8e...5b8d`, owner redatto `6425adb0...257e`.
- Prefix Admin: `TASK072D_ADMIN_20260619T185924Z_`.
- Comandi eseguiti con allowlist staging e gate mutativi
  `ALLOW_TASK072D_MUTATIONS=yes` / `CONFIRM_TASK072D_MUTATIONS=yes`.
- `seed`: `PASS`, verdict harness `DONE_SYNTHETIC_SEED`.
  - inserite righe catalog/history sintetiche;
  - `sync_events` emessi: `3180 catalog_changed`, `3181 history_changed`;
  - History Entry payload v2 con `session_overlay.overlay_schema=1`,
    `editableRows=2`, `completeRows=2`.
- `verify --require-data`: `PASS`, verdict `DONE_READONLY_HARNESS`.
  - active product/category/supplier/history: `1` ciascuno;
  - sync events correlati: `2`.
- `idempotency`: `PASS`.
  - stesso `client_event_id` inserito una sola volta;
  - primo insert `inserted=true`, secondo duplicate `inserted=false`.
- `negative-rls`: `PASS`.
  - anon reads bloccate/empty su catalog/history/sync tables;
  - cross-shop counts `0`.

### Android runtime E2E

- Repo: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`.
- Target: emulator `emulator-5554`, package
  `com.example.merchandisecontrolsplitview`.
- Nuovo harness:
  `app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task072DAndroidReceiverHarnessTest.kt`.
- Fix runtime/harness applicati:
  - status device Android stabilizzato con cache active fresca solo per
    cancellazioni transitorie automatiche, non per manual cloud write;
  - harness Android usa sync catalog incrementale diretta con repository reale
    e `sync_events`, senza full pull;
  - watermark primed a `latest - 100` per non riprocessare migliaia di eventi
    storici;
  - history push usa `HistorySessionPushCoordinator.runPushCycle("local_commit")`
    per evitare debounce di background fragile nel test controllato;
  - receiver finali trattano `ALREADY_CURRENT` come no-op incrementale solo se
    DB/outbox sono gia coerenti; per prefissi esterni la presenza locale e
    obbligatoria.
- Run Android Admin receive:
  `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T192621Z-android-task072d-harness-live-prefix-TASK072D_ANDROID_20260619T192615Z_-admin-prefix-TASK072D_ADMIN_20260619T185924Z_-p98304.md`.
  - Result: `PASS`;
  - summary:
    `product_create=pass product_update=pass product_tombstone=pass
    history_create=pass history_update=pass history_tombstone=pass
    adminReceiver=pass iosReceiver=not_configured syncType=EVENT_INCREMENTAL
    fullPull=false pendingCatalog=0 pendingHistory=0 pendingTombstones=0
    outbox=0`.
- Run Android iOS receive:
  `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T193040Z-android-task072d-harness-live-prefix-TASK072D_ANDROID_20260619T193033Z_-admin-prefix-TASK072D_ADMIN_20260619T185924Z_-ios-prefix-TASK072D_IOS_20260619T192903Z_-p3552.md`.
  - Result: `PASS`;
  - summary:
    `product_create=pass product_update=pass product_tombstone=pass
    history_create=pass history_update=pass history_tombstone=pass
    adminReceiver=pass iosReceiver=pass syncType=EVENT_INCREMENTAL
    fullPull=false pendingCatalog=0 pendingHistory=0 pendingTombstones=0
    outbox=0`.

### iOS runtime E2E

- Repo: `/Users/minxiang/Desktop/iOSMerchandiseControl`.
- XcodeBuildMCP defaults verificati: profile `task-072-ios`,
  project `iOSMerchandiseControl.xcodeproj`, scheme `iOSMerchandiseControl`,
  simulator `iPhone 17 Pro`
  (`AC6FBFC3-A97F-412C-BEC0-F88B9956107B`).
- Prefix iOS: `TASK072D_IOS_20260619T192903Z_`.
- Report:
  `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T192914Z-ios-task072d-harness-live-prefix-TASK072D_IOS_20260619T192903Z_-admin-prefix-TASK072D_ADMIN_20260619T185924Z_-android-prefix-TASK072D_ANDROID_20260619T192615Z_-p862.md`.
- Result: `PASS`.
- Evidence log:
  - `TASK072D_IOS_EXTERNAL_RECEIVE source=admin status=available
    product_applies=0 history_applies=1`;
  - `TASK072D_IOS_EXTERNAL_RECEIVE source=android status=available
    product_applies=3 history_applies=3`;
  - `TASK072D_IOS_WRITE_VERIFY catalog_create=pass catalog_update=pass
    catalog_tombstone=pass history_create=pass history_update=pass
    history_tombstone=pass admin_receive=admin:applied_products_0_history_1
    android_receive=android:applied_products_3_history_3
    task072d_outbox_pending=0 syncType=EVENT_INCREMENTAL fullPull=false`.

### Bidirectional matrix TASK-072D

| Direzione | Catalogo | History Entry | Evidence | Esito |
|---|---|---|---|---|
| Admin Web -> Android | create/update/tombstone `PASS` | create/update/tombstone `PASS` | Android run `20260619T192621Z...p98304` | `PASS` |
| Admin Web -> iOS | Admin catalog row non richiesta come product apply; history applied `1` | history applied `1` | iOS run `20260619T192914Z...p862` | `PASS_WITH_NOTES` |
| Android -> iOS | product applies `3` | history applies `3` | iOS run `20260619T192914Z...p862` | `PASS` |
| iOS -> Android | external local rows applied | external history rows applied | Android run `20260619T193040Z...p3552`, `iosReceiver=pass` | `PASS` |
| Mobile/Admin -> Admin Web read model | prefissi visibili via harness server-side | history/sync events correlati | Admin `verify --prefix=TASK072D_` pre-cleanup | `PASS` |

### Cleanup

- Remote cleanup server-side:
  - comando `cleanup-tombstone --prefix=TASK072D_` su cloud dev non-production;
  - verdict `DONE_SYNTHETIC_TOMBSTONE_CLEANUP`;
  - tombstoned: products `31`, categories `18`, suppliers `18`,
    history sessions `14`;
  - cleanup events append-only: `3223 catalog_changed`,
    `3224 history_changed`;
  - nessun hard delete remoto.
- Remote verify post-cleanup:
  - verdict `DONE_READONLY_HARNESS`;
  - products `active=0 tombstone=37`;
  - categories `active=0 tombstone=22`;
  - suppliers `active=0 tombstone=22`;
  - history `active=0 tombstone=1`;
  - sync events append-only mantenuti.
- Android local cleanup:
  - dry-run:
    `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T193522Z-android-cleanup-scoped-prefix-TASK072D_-dry-run-p7764.md`;
  - execute:
    `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T193540Z-android-cleanup-scoped-prefix-TASK072D_-execute-p9230.md`;
  - execute summary:
    `history_after=0 refs_after=0 products_after=0 product_prices_after=0
    catalog_refs_after=0 price_refs_after=0 lookups_after=0 outbox_after=0`;
  - final dry-run:
    `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T193553Z-android-cleanup-scoped-prefix-TASK072D_-dry-run-p10300.md`,
    all `*_before=0`.
- iOS cleanup:
  - wrapper locale supporta solo dry-run e rimanda al cleanup backend;
  - dry-run report:
    `docs/TASKS/EVIDENCE/TASK-072/agent-runs/20260619T193605Z-ios-cleanup-scoped-prefix-TASK072D_-dry-run-p11503.md`;
  - backend cleanup gia verificato active `0`.

### Computer Use

- Computer Use skill letto e `list_apps` eseguito: Safari, Simulator,
  Android Studio risultano running.
- `get_app_state` su Safari, Simulator e Android Studio ha restituito
  `cgWindowNotFound`; `Codex` e bloccato dal tool per safety.
- Non sono state eseguite azioni UI mutative; evidence primaria resta
  programmatica tramite harness e simulatori.

### Checks TASK-072D

| Check | Esito | Note |
|---|---|---|
| Admin `node --check scripts/platform/task-072d-admin-runtime-harness.mjs` | `PASS` | Syntax check. |
| Admin `node scripts/platform/task-072d-admin-runtime-harness.mjs --help` | `PASS` | Usage e comandi disponibili. |
| Admin `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs` | `PASS` | `5/5`. |
| Admin `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin `npm run test:foundation` | `PASS` | `390/390`. |
| Admin `npm run lint` | `PASS_WITH_WARNINGS` | 8 warning noti, nessun errore. |
| Android `./gradlew :app:compileDebugAndroidTestKotlin` | `PASS` | Dopo patch TASK-072D e cleanup allowlist. |
| Android targeted unit `ShopDeviceAuthorizationRepositoryTest` | `PASS` | Include cache active transitoria automatica e blocco manual write. |
| Android runtime harness | `PASS` | Report `p98304` e `p3552`. |
| iOS runtime harness | `PASS` | Report `p862`, xcresult in `/tmp`. |
| Remote cleanup verify | `PASS` | `TASK072D_` active `0`. |
| Android local cleanup verify | `PASS` | final dry-run `*_before=0`. |
| iOS cleanup scoped dry-run | `PASS_WITH_NOTES` | Solo dry-run locale supportato; backend cleanup completato. |
| Admin `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| Admin `npm run build` | `PASS_WITH_WARNINGS` | Next `middleware` deprecato e Node `DEP0205`. |
| Admin `npm run verify` | `PASS_WITH_WARNINGS` | lint/typecheck/security/build passano; stessi warning. |
| Admin `npm run test:shop:local` | `PASS_WITH_WARNINGS` | Primo tentativo `FAIL_ENV_SERVER_ALREADY_RUNNING` su dev server `3055`; rerun con `next start` su `3060` passa `5/5`. |
| Admin `git diff --check` | `PASS` | Nessun whitespace error. |

### Rischi residui TASK-072D

- `sync_events` restano append-only per design; il cleanup tombstona dati
  business sintetici ma non cancella eventi.
- Android summary riporta `runAsDb=missing` per il listing shell, ma snapshot
  diretto del DB app nel test passa e tutte le code prefissate risultano `0`.
- Computer Use non ha potuto catturare le finestre Mac; non blocca la prova
  E2E perche i harness runtime sono passati su simulatori/emulatore reali.
- Nota storica superata dal gate finale sotto: prima di questo gate nessun task
  era marcato `DONE`; il brief finale ha autorizzato la riconciliazione
  `DONE_RECONCILED` documentale.

## Final DONE gate / commit readiness - 2026-06-19

### Verdict

- Verdict finale: `DONE_RECONCILED`.
- Stato TASK-072: `DONE`.
- Fase: `DONE_RECONCILED`.
- Conferma interna al prompt: brief utente `TASK-072 Final Review / DONE Gate /
  Commit Readiness`.
- Non production-ready globale: questa chiusura riguarda solo TASK-072
  cross-platform sync readiness; Vercel/Win7POS/sales sync restano nei loro task.
- Nessun commit, push, stage, deploy o production migration apply.

### Evidence visuale e query fallback

- Computer Use storico era insufficiente (`cgWindowNotFound`); nel gate finale e
  stato sostituito da `PLAYWRIGHT/ADB/SIMCTL_VISUAL_EVIDENCE`.
- Admin Products filtered:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-products-filtered.png`.
  - URL:
    `/shop/products?shop_id=bc01ea8e-0ae5-4b7a-abbc-4863a1be5b8d&q=TASK072D_&state=all&pageSize=50`;
  - DOM check: righe `TASK072D_` visibili, stato archived/tombstoned coerente.
- Admin History context:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-history-context.png`.
  - DOM check: entry `TASK072D_`, `Payload v2`, `Overlay OK` visibili.
- Android simulator screenshot:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-android-emulator.png`.
- iOS simulator screenshot:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-ios-simulator.png`.
- DOM snapshot:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-visual-dom-check.json`.
- Admin read-only DB check:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-db-readonly-check.json`.
  - verdict `PASS_READONLY_ACTIVE_ZERO_UNIQUE_KEYS`;
  - active direct rows products/suppliers/categories/history `0`;
  - duplicate product barcode keys `0`;
  - duplicate history remote id keys `0`.
- Android DB query:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-android-db-query.json`.
  - products/suppliers/categories/history active `0`;
  - remote refs `0`;
  - pending tombstones `0`;
  - sync outbox `0`.
- iOS store query:
  `docs/TASKS/EVIDENCE/TASK-072/task072d-final-ios-store-query.json`.
  - products/suppliers/categories/history active `0`;
  - local pending open `0`;
  - sync outbox open `0`;
  - `sync_outbox_localOnly_all=2` separato come preesistente non TASK-072D.

### Bidirectional runtime proof

| Direzione | Esito | Evidence |
|---|---|---|
| Admin Web -> Android | `PASS` catalog/history create/update/tombstone, incremental, outbox `0` | Android report `20260619T192621Z...p98304` |
| Admin Web -> iOS | `PASS_WITH_NOTES` history applied `1`; Admin catalog gia verificato via read model/harness | iOS report `20260619T192914Z...p862` |
| Android -> Admin Web | `PASS` mobile-origin rows visibili da Admin read model/harness | Android/Admin harness reports |
| Android -> iOS | `PASS` product applies `3`, history applies `3` | iOS report `20260619T192914Z...p862` |
| iOS -> Admin Web | `PASS` mobile-origin rows visibili da Admin read model/harness | Admin visual + readonly checks |
| iOS -> Android | `PASS` `iosReceiver=pass` | Android report `20260619T193040Z...p3552` |

### Catalogo e History Entry

- Catalogo TASK072D: create/update/tombstone pass su Android e iOS harness;
  remote cleanup tombstone mantiene sync events append-only.
- History Entry TASK072D: create/update/tombstone pass su Android e iOS harness;
  payload v2, overlay schema e tombstone logico verificati.
- Restore catalogo era gia provato nel run TASK-072B con evento `3144` e resta
  parte del contratto chiuso.

### Cleanup

- Remote cleanup `TASK072D_`: `PASS`, active products/categories/suppliers/history
  `0`; tombstone append-only mantenute.
- Android local cleanup: execute + final dry-run `PASS`, contatori scoped `0`.
- iOS local cleanup: dry-run only per design; verifica store diretta finale
  conferma active TASK072D `0` e pending/outbox TASK072D `0`.

### Idempotenza, no-loop e RLS

- Admin `idempotency`: stesso `client_event_id` inserito una sola volta
  (`inserted=true` poi duplicate `inserted=false`).
- Remote ref uniqueness finale: product barcode e history remote id duplicate
  keys `0`.
- Android/iOS runtime: incremental/event-driven (`syncType=EVENT_INCREMENTAL`,
  `fullPull=false`) e pending/outbox `0` nei report E2E.
- Negative RLS: anon reads bloccate/empty; cross-shop counts `0`.
- Fallback legacy owner bridge resta shop/owner-scoped e non espone dati
  cross-shop nei gate eseguiti.

### Android device authorization review

- File review: `ShopDeviceRegistrationRemoteDataSource.kt`,
  `DeviceAuthorizationRemoteGuards.kt`,
  `CatalogAutoSyncCoordinator.kt`,
  `ShopDeviceAuthorizationRepositoryTest.kt`,
  `Task072DAndroidReceiverHarnessTest.kt`.
- `ensureActiveForCloudWrite` richiede status `active` e `canWrite=true`.
- Device `revoked`/`suspicious` non vengono riattivati da register/heartbeat.
- Errori network non vengono convertiti in autorizzazione active.
- Cache active ammessa solo per `CancellationException` transitoria, reason
  automatica non manuale, snapshot fresca e gia active/canWrite.
- Manual cloud write non usa la cache per aggirare lo status device.
- Metadata registry redatti: nessun IMEI, seriale, MAC, posizione, token, PIN,
  password, hash o secret.

### Check finali freschi

| Repo | Check | Esito |
|---|---|---|
| Admin | `npm run security:scan` | `PASS` |
| Admin | `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs` | `PASS` `5/5` |
| Admin | `npm run test:foundation` | `PASS` `390/390` |
| Admin | `npm run typecheck` | `PASS` |
| Admin | `npm run lint` | `PASS` senza warning dopo cleanup unused fallback |
| Admin | `npm run build` | `PASS_WITH_TOOLCHAIN_WARNINGS` Next `middleware` deprecato, Node `DEP0205` |
| Admin | `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNINGS` stessi warning build |
| Admin | `npm run test:shop:local` su porta `3060` | `PASS_WITH_TOOLCHAIN_WARNINGS` `5/5`, warning Playwright/Supabase colori |
| Android | `./gradlew assembleDebug` | `PASS` |
| Android | `./gradlew lintDebug testDebugUnitTest` | `PASS` |
| Android | `./gradlew :app:testDebugUnitTest --tests ...ShopDeviceAuthorizationRepositoryTest` | `PASS` |
| Android | `./gradlew :app:compileDebugAndroidTestKotlin` | `PASS` |
| iOS | XcodeBuildMCP `session_show_defaults` | `PASS`, profile `task-072-ios` |
| iOS | XcodeBuildMCP `build_sim -quiet` | `PASS`, 0 warning/errori |
| iOS | XcodeBuildMCP selected `test_sim` | `PASS`, `121/121`, 0 warning/errori |
| Admin/Android/iOS | `git diff --check` | `PASS` finale dopo update docs |
| Admin/Android/iOS | `git diff --cached --name-status` | `PASS` output vuoto |

### Preflight e drift classification

- Admin Web: `64` entries classificate, `unknown=0`.
  - TASK-072 core catalog/history/sync: `17`;
  - TASK-072C bridge harness: `1`;
  - TASK-072D runtime/evidence: `5` piu evidence finali;
  - device auto-registration/authorization: `9`;
  - TASK-073 account identity: `14`;
  - TASK-073 platform/UI support: `6`;
  - TASK-035/shop smoke drift/support: `8`;
  - shared shop navigation/i18n support: `3`;
  - task planning docs: `1`.
- Android: `21` entries classificate, `unknown=0`.
  - device auto-registration/authorization: `15`;
  - TASK-072D auth/preflight harness support: `2`;
  - TASK-072B shared history compatibility: `1`;
  - TASK-072C bridge harness: `1`;
  - TASK-072D runtime harness: `1`;
  - IDE drift: `1`.
- iOS: `497` entries classificate, `unknown=0`.
  - device auto-registration/sync runtime: `18`;
  - TASK-072C/D bridge tooling: `5`;
  - TASK-072D runtime harness/evidence: `87`;
  - TASK-114/TASK-135 historical evidence drift: `387`.
- Nessun file staged nei tre repo.

### Commit readiness plan

- Commit/push/stage: `NOT_RUN`; il prompt non autorizza esplicitamente
  stage/commit/push finale.
- Regola: non usare `git add .`; usare solo path espliciti e ricontrollare
  `git diff --cached --name-status` prima di ogni commit.

Commit 1 - Admin Web TASK-072 sync/history/evidence:

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-072-cross-platform-catalog-sync-history-entry-write-path.md`
- `docs/TASKS/EVIDENCE/TASK-072/README.md`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-db-readonly-check.json`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-history-context.png`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-products-filtered.png`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-visual-dom-check.json`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-android-db-query.json`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-android-emulator.png`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-ios-simulator.png`
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-ios-store-query.json`
- `scripts/platform/task-072c-admin-runtime-harness.mjs`
- `scripts/platform/task-072d-admin-runtime-harness.mjs`
- `scripts/security-checks.mjs`
- `src/server/shop-admin/catalog-mutations.ts`
- `src/server/shop-admin/history-mutations.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/sync-event-writer.ts`
- `tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`

Commit 2 - Android TASK-072D harness/device sync fix:

- `app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task072DAndroidReceiverHarnessTest.kt`
- `app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task072DeviceAuthorizationLiveGateTest.kt`
- `app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task103AuthPreflightTest.kt`
- `app/src/androidTest/java/com/example/merchandisecontrolsplitview/Task103CrossPlatformAcceptanceTest.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/sync/CatalogAutoSyncCoordinator.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/data/DeviceAuthorizationRemoteGuards.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/data/ShopDeviceRegistrationRemoteDataSource.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/data/ShopDeviceAuthorizationRepositoryTest.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/sync/CatalogAutoSyncCoordinatorTest.kt`

Commit 3 - iOS TASK-072D harness/tooling/test alignment:

- `iOSMerchandiseControlTests/Task072DLiveAcceptanceHarnessTests.swift`
- `iOSMerchandiseControlTests/Task103CrossPlatformAcceptanceTests.swift`
- `iOSMerchandiseControlTests/SupabaseManualPushServiceTests.swift`
- `iOSMerchandiseControlTests/SyncEventOutboxDrainDebugViewModelTests.swift`
- `tools/agent/lib/android.sh`
- `tools/agent/lib/common.sh`
- `tools/agent/lib/ios.sh`
- `tools/agent/lib/supabase.sh`

Commit 4 opzionale - device auto-registration/account/drift da separare:

- Admin Web device registry, migrations, `/shop/devices`, TASK-073 account
  identity, TASK-035 screenshots/smoke e historical evidence drift non vanno
  mescolati nel commit core TASK-072 se non dopo review path-explicit separata.

### Rischi residui non bloccanti

- `sync_events` restano append-only; cleanup business e tombstone, non hard
  delete degli eventi.
- Screenshot Android/iOS finali provano superficie simulatore/emulatore e sono
  accompagnati da query DB/store redatte; la prova funzionale resta nei harness.
- iOS mantiene due outbox `localOnly` preesistenti non TASK-072D; TASK072D
  pending/outbox e `0`.
- Worktree grandi e sporchi richiedono commit path-explicit separati.
