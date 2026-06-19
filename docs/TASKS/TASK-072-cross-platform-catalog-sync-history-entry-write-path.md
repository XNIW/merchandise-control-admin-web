# TASK-072 - Cross-platform catalog sync and History Entry write path

## Informazioni generali

- ID: `TASK-072`
- Titolo: `TASK-072 - Cross-platform catalog sync and History Entry write path for Admin Web, Android and iOS`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `REVIEWER_CONFIRMED_BY_TASK_072_FINAL_GATE_PROMPT`
- Data apertura: `2026-06-19`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-072/README.md`

## Decisione di apertura

TASK-071 e chiuso a `DONE` e il Master Plan indicava `Task attivo: NESSUNO`.
Questo task e stato aperto per override esplicito dell'utente dal brief
allegato `TASK-072 da dare a Codex`. La chiusura finale del 2026-06-19 e stata
richiesta esplicitamente dall'utente nel brief `Final Gap Closure / Android
Live Auth / Foundation Green / DONE` e riconciliata a `DONE_RECONCILED`.

## Dipendenze

- Admin Web: `docs/MASTER-PLAN.md`, evidence `TASK-069`, evidence `TASK-071`,
  contratto `history-sync-cross-platform-contract.md`, codice Shop Admin catalogo
  e History Sync Console.
- Android: repo `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`.
- iOS: repo `/Users/minxiang/Desktop/iOSMerchandiseControl`.
- Supabase: migration e tipi locali Admin Web, senza production apply.

## Scopo

Implementare e verificare il flusso Admin Web -> Supabase -> Android/iOS per
create/update/tombstone/restore catalogo e per scrittura History Entry v2 da
Admin Web, mantenendo separati `sync_events` tecnici e `audit_logs`
amministrativi.

### Override device auto-registration 2026-06-19

Su richiesta esplicita successiva, lo scope TASK-072 include anche la
registrazione automatica device da Android/iOS/POS login e sync:

- `shop_devices` resta registry shop-scoped, revocabile e auditabile;
- Android/iOS registrano un `device_install_id` stabile per installazione dopo
  login/foreground/sync trigger, senza IMEI, seriale, MAC, posizione, token,
  password, PIN, hash o credenziali;
- POS resta modulo della Shop Admin Console e continua a usare gli endpoint
  server-side esistenti;
- `sync_events.source_device_id` puo produrre solo hint read-only, mai
  autorizzazione.

## Contesto

TASK-069 e TASK-071 hanno chiuso audit e fix di allineamento cross-platform, ma
restano gap reali su contratto canonico catalog/history, propagazione completa
delle mutazioni Admin Web ai client mobile e History Entry write path Admin Web.
La History Sync Console esiste oggi come read-only/diagnostica.

## Non incluso

- Commit, push, stage o deploy.
- Apply migration su production/cloud senza autorizzazione esplicita.
- Dati reali, workbook reali, token, PIN, password o secret nel repository.
- Service-role key lato client/browser/mobile.
- Win7POS/POS runtime, salvo lettura documentale.
- Hard delete per simulare delete/tombstone.
- Dashboard vendite o funzioni POS fuori scope.

## File potenzialmente coinvolti

- Documentazione: `docs/MASTER-PLAN.md`, questo task, evidence `TASK-072`,
  contratto sync v1.
- Admin Web: `src/server/shop-admin/**`, `src/app/shop/products/**`,
  `src/app/shop/history/**`, `src/app/shop/sync/page.tsx`,
  `supabase/migrations/**`, `src/lib/supabase/database.types.ts`.
- Android: sync/catalog/history repository, Room entities, test mirati.
- iOS: catalog/history sync, SwiftData/CoreData model, targeted sync tests.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Preflight git e governance Admin Web, Android, iOS documentati senza commit/push/stage. | STATIC | `PASS_WITH_NOTES` |
| CA-02 | Schema reale catalog/history/sync_events verificato; eventuali migration solo additive e motivate. | STATIC/DB_LOCAL | `PASS_WITH_NOTES` |
| CA-03 | Contratto sync catalog/history v1 documentato, idempotente e separato da audit amministrativo. | STATIC | `PASS` |
| CA-04 | Admin Web emette eventi sync redatti dopo mutazioni prodotto/categoria/fornitore/prezzo supportate. | STATIC/TEST | `PASS` |
| CA-05 | Admin Web implementa write path History Entry v2 con create/update/tombstone server-side auditato. | STATIC/TEST/UI | `PASS` |
| CA-06 | Android riceve/applica delta catalog/history con idempotenza e cursor/retry verificati da test mirati. | BUILD/TEST | `PASS` |
| CA-07 | iOS riceve/applica delta catalog/history con idempotenza e cursor/retry verificati da test mirati. | BUILD/TEST | `PASS_WITH_NOTES` |
| CA-08 | Sync Center mostra cursor/stati/errori redatti senza confondere `sync_events` e `audit_logs`. | STATIC/UI/TEST | `PASS` |
| CA-09 | Check richiesti eseguiti o marcati `NOT_RUN`/`BLOCKED` con motivo reale. | TEST | `PASS_WITH_NOTES` |
| CA-10 | Handoff finale include file toccati, evidence, rischi residui e prossima fase. | MANUAL | `PASS_DONE_RECONCILED` |
| CA-11 | `shop_devices` espone ultimo account/staff visto con migration additiva e RPC owner-scoped senza `shop_id` client. | STATIC/TEST | `PASS` |
| CA-12 | `/shop/devices` mostra registry autorizzato e sezione read-only `Detected sync clients` senza confondere hint e autorizzazione. | STATIC/UI/TEST | `PASS_RUNTIME_FIXED` |
| CA-13 | Android genera install id stabile, registra best-effort dopo auth/foreground/network e invia solo metadata redatti. | BUILD/TEST | `PASS` |
| CA-14 | iOS genera install id stabile, registra best-effort dopo auth/foreground/sync trigger e usa lo stesso id nei sync event. | BUILD/TEST | `PASS_WITH_NOTES` |
| CA-15 | Device revocati/suspicious non tornano active con register/heartbeat; POS sync/write continua a bloccare status non active. | STATIC/RUNTIME_TEST | `PASS_RUNTIME` |

## Matrice test/check

| Test | Tipo | Stato atteso |
|---|---|---|
| Admin Web `npm run security:scan` | STATIC | `PASS` |
| Admin Web `npm run test:foundation` | TEST | `PASS` 390/390 |
| Admin Web `npm run typecheck` | STATIC | `PASS` |
| Admin Web `npm run lint` | STATIC | `PASS` |
| Admin Web `npm run build` | BUILD | `PASS_WITH_WARNINGS` Next middleware deprecato, Node `DEP0205` |
| Admin Web `npm run verify` | TEST | `PASS_WITH_WARNINGS` stessi warning build |
| Admin Web `node --test tests/foundation/task-072-device-auto-registration.test.mjs` | TEST | `PASS` 4/4 |
| Supabase cloud dev migration apply | DB_DEV | `PASS` `supabase db push --linked --include-all --yes` su `merchandisecontrol-dev`, non production |
| Admin Web browser `/shop/devices` authenticated runtime | UI/DB_DEV | `PASS` `Read blocked` risolto, registry leggibile, detected sync clients visibili |
| Admin Web browser manual register + revoked/register negativo | UI/DB_DEV | `PASS` riga registry visibile; re-register non riattiva device revocato |
| Admin Web smoke `/shop/devices` anonimo | UI | `PASS` Playwright `protects /shop/devices` 1/1 |
| Admin Web `npm run test:shop:local` | RUNTIME_LOCAL | `FAIL_ENV_LATEST`; run storico `PASS` 5/5, ma il run TASK-072B piu recente fallisce nel setup locale `BLOCKED_TASK035_DEVICE_CREATE` |
| Android `./gradlew assembleDebug` | BUILD | `PASS` |
| Android `./gradlew lintDebug testDebugUnitTest` | TEST | `PASS` |
| Android live auth device gate | RUNTIME_DEV | `PASS` active -> revoked blocked -> active |
| iOS build simulator | BUILD | `PASS` con XcodeBuildMCP, 0 warning/errori sul build finale |
| iOS targeted sync/catalog/history tests | TEST | `PASS` 73/73 targeted history/sync-event |
| iOS targeted sync/outbox tests dopo device source id | TEST | `PASS_WITH_PREEXISTING_TEST_WARNINGS` 58/58; warning solo in test storici non toccati |
| Supabase TASK-072 deterministic device harness | DB_DEV | `PASS`; lint timeout sostituito da harness SQL deterministico |
| Supabase local migration/lint/typegen se schema cambia | DB_LOCAL/DEV | `PASS_WITH_NOTES`; migration device applicata al cloud dev linkato, non production |
| `git diff --check` e `git status` nei repo toccati | STATIC | `PASS_WITH_NOTES`; status finale contiene modifiche TASK-072 e artefatti preesistenti/non codice documentati |

## Decisioni

- `sync_events` resta evento tecnico; `audit_logs` resta audit amministrativo.
- Nuove History Entry Admin Web devono usare `payload_version = 2`.
- `shared_sheet_sessions.remote_id` deve essere UUID lowercase stabile.
- `session_overlay` deve usare `overlay_schema = 1` e griglie allineate.
- Android/iOS mobile non devono ricevere service-role key.
- Near real-time deve essere realtime/event-driven dove disponibile, con fallback
  delta pull e backoff, non polling aggressivo.

## Planning

- Fase 0: preflight, status git e discovery repo/schema/codice.
- Fase 1: contratto sync v1 e schema/migration additive se indispensabili.
- Fase 2: Admin Web event emission e History Entry write path.
- Fase 3: Android/iOS apply delta, cursor/idempotenza e test mirati.
- Fase 4: Sync Center, evidence e check finali.

## Execution

### 2026-06-19 - Avvio

- Letti `docs/MASTER-PLAN.md`, brief allegato, evidence `TASK-069`,
  evidence `TASK-071`, contratto history e istruzioni locali Admin Web/Android/iOS.
- Preflight iniziale:
  - Admin Web: `main...origin/main`, working tree pulito prima dell'apertura
    task.
  - Android `MerchandiseControlSplitView`: `main...origin/main`, working tree
    pulito.
  - iOS `iOSMerchandiseControl`: `main...origin/main`, molti artefatti
    untracked preesistenti in `docs/TASKS/EVIDENCE/**` e `screenshots/**`, non
    toccati in apertura.
- Vincolo governance mobile: Android dichiara nessun task attivo; iOS contiene
  storia recente con task bloccati/chiusi e artefatti untracked. Le eventuali
  modifiche mobile sono trattate come override esplicito cross-platform del
  brief utente e documentate in questa evidence Admin Web.

### 2026-06-19 - Execution completata

- Admin Web:
  - aggiunto writer server-only `sync_events` con `client_event_id`
    deterministico `admin_web:*`, metadata redatti e duplicate-idempotency su
    `23505`;
  - collegate le mutazioni catalogo prodotto/categoria/fornitore a
    `catalog_changed` / `catalog_tombstone`;
  - aggiunta write path History Entry v2 server-side per create/update/tombstone
    su `shared_sheet_sessions`, con `payload_version=2`,
    `session_overlay.overlay_schema=1`, `remote_id` UUID lowercase, tombstone
    logico `deleted_at`, audit in `audit_logs` e segnale tecnico
    `history_changed` / `history_tombstone`;
  - UI Shop History espone form create/update/tombstone solo con
    `history.write`;
  - Sync Center mostra eventi Admin Web, cursor/client event e conserva il copy
    smoke `without triggering synchronization`;
  - `security:scan` aggiornato con guardrail TASK-072 server-only/redaction.
- Android/iOS:
  - nella fase core originaria, prima dell'override device, nessun codice
    mobile era stato modificato;
  - verifica statica conferma che Android/iOS consumano `supplier_ids`,
    `category_ids`, `product_ids`, `session_ids`, owner-scoped `sync_events`,
    tombstone history e History Entry payload v2;
  - Android build/lint/unit test passano sullo stato corrente;
  - iOS build simulator passa e i targeted history/sync-event tests passano.
- Computer Use read-only:
  - iOS Simulator e Android Studio/Running Devices osservati senza click o
    mutazioni UI;
  - entrambi mostrano account cloud collegato e database locale pronto con
    prodotti `19704`, fornitori `66`, categorie `35`, sessioni cronologia `35`.
- Stato git finale include il core TASK-072, l'override device
  auto-registration e uno screenshot TASK-035 rigenerato dal smoke. Nulla viene
  promosso a `DONE` da questo handoff.

### 2026-06-19 - Override device auto-registration completato

- Admin Web:
  - aggiunta migration additiva
    `20260619123000_task_072_device_auto_registration.sql` con
    `last_seen_profile_id`, `last_seen_staff_id`,
    `last_seen_principal_kind`, helper ricorsivo per bloccare metadata con
    chiavi sensibili e RPC `shop_device_register_current_owner`;
  - `shop_device_register` aggiorna `last_seen_at` e ultimo account visto,
    preservando `revoked` e `suspicious`;
  - read model Devices mostra registry autorizzato, ultimo account/staff visto,
    app version, tipo, status, ultimo accesso/sync e link history;
  - aggiunta sezione read-only `Detected sync clients` da
    `sync_events.source_device_id`, esplicitamente come hint non revocabile;
  - manual register resta fallback avanzato.
- POS/Admin Web server:
  - path staff/POS scrivono `last_seen_staff_id` e
    `last_seen_principal_kind='pos_staff'`;
  - first login e heartbeat POS preservano/bloccano device `revoked` o
    `suspicious`; catalog pull e sales sync richiedono `device.status='active'`.
- Android:
  - aggiunto `ShopDeviceRegistrationRemoteDataSource`;
  - `device_install_id` usa lo stesso UUID persistito in Room da
    `SyncEventDeviceStateDao`;
  - registrazione best-effort dopo auth, foreground e ritorno rete.
- iOS:
  - aggiunto `ShopDeviceRegistrationService` e `DeviceInstallIDStore`;
  - `device_install_id` usa UUID random persistito in `UserDefaults`;
  - registrazione best-effort dopo auth, foreground e trigger sync;
  - sync event automatici/history usano lo stesso id come `sourceDeviceID`.

### 2026-06-19 - Runtime fix Devices RLS/Auth gate

- Riprodotto nel browser in-app su `localhost:3055`: `Read blocked`,
  `Device registry rows could not be loaded through RLS`, revocation
  unavailable e `0` righe.
- Causa verificata: cloud dev attivo `merchandisecontrol-dev`
  (`jpgo...yvm`) non aveva le migration recenti applicate; PostgREST falliva
  con `42703` su `shop_devices.last_seen_profile_id` e `sync_events.shop_id`.
- Membership target verificata: shop `bc01ea8e...5b8d` ha owner attivo
  `6425adb0...257e`; quindi non era un blocco owner/RLS reale.
- Applicate le migration mancanti con
  `supabase db push --linked --include-all --yes` al solo cloud dev linkato.
- Dopo reload browser: registry leggibile, `Detected sync clients` visibile,
  `Read blocked` sparito.
- Registrazione manuale autenticata e test negativo revoked/register passati:
  re-register aggiorna last seen/app version ma lascia `status=revoked`.
- Read model hardenato: errori accessori mapping/sync activity degradano a
  hints vuoti senza bloccare la tabella `shop_devices`.
- Questa sezione include l'override device richiesto; resta comunque in
  `REVIEW`, non `DONE`.

## Review

- Decisione: `DONE_RECONCILED`
- Evidence verificata: `docs/TASKS/EVIDENCE/TASK-072/README.md`
- Problemi: `PASS_WITH_NOTES`
  - iOS full `test_sim` resta fallito per drift suite storico non correlato
    (`858` passed, `23` failed, `29` skipped); targeted TASK-072 passa `73/73`.
  - Le scritture Admin Web su catalogo/history e l'evento sync non sono in una
    singola transazione DB: se `sync_events`/audit falliscono dopo la mutazione,
    l'azione torna errore trasparente ma la mutazione business puo essere gia
    avvenuta.
  - Stato git finale include anche l'override device auto-registration e uno
    screenshot smoke rigenerato.
- Condizioni per passare a `DONE`: soddisfatte dalla final gap closure
  esplicita del 2026-06-19; restano solo residui non bloccanti documentati.

## TASK-072B - Real cross-platform E2E completion

- Decisione operativa: `EXECUTION_COMPLETED_READY_FOR_REVIEW`, non `DONE`.
- Evidence aggiornata:
  `docs/TASKS/EVIDENCE/TASK-072/README.md#task-072b-real-cross-platform-e2e---2026-06-19`.
- Runtime reale completato su Admin Web cloud dev non-production, Android
  emulator e iOS Simulator:
  - catalogo create/update/tombstone/restore verificato con eventi
    `3139`-`3144`;
  - History Entry update/tombstone verificata con eventi `3146`-`3147`;
    la create `3145` ha emesso il sync_event ma l'apply mobile iniziale e
    stato sbloccato dal fix overlay e dal successivo update; manca una fresh
    create post-fix provata su entrambi i client;
  - cleanup finale catalogo con tombstone product/supplier/category eventi
    `3148`-`3150`;
  - Android/iOS watermark finali `3150`, outbox Android `0`, nessun loop
    osservato.
- Fix aggiuntivi TASK-072B:
  - Admin Web History Entry `editable` emesso come griglia di stringhe;
  - Admin Web fallback legacy history/sync_events su schema misto cloud dev;
  - Android DTO `SharedSheetSessionRecord` tollera `shop_id` sulle SELECT
    PostgREST miste.
- Check principali:
  - Admin `security:scan`, `lint`, `typecheck`, TASK-072 targeted,
    `test:foundation`, `build`, `verify`: passano con warning noti;
  - Android `assembleDebug lintDebug testDebugUnitTest`: passa;
  - iOS `build_sim` e targeted sync/history tests `73/73`: passano;
  - `test:shop:local`: `FAIL_ENV` per fixture locale
    `BLOCKED_TASK035_DEVICE_CREATE`, documentato senza inventare PASS.

## Fix

- Non avviato.

## Chiusura

- Chiusura finale riconciliata a `DONE` / `DONE_RECONCILED` il 2026-06-19 su
  richiesta esplicita dell'utente nel brief `TASK-072 Final Review / DONE Gate /
  Commit Readiness`.
- Scope chiuso: readiness cross-platform TASK-072 per catalog sync, History
  Entry write path, sync events tecnici, cleanup sintetico e device gate usato
  dai runtime E2E.
- Nota esplicita: questa chiusura non dichiara produzione globale pronta e non
  sblocca Vercel/Win7POS/sales sync.
- Nessun commit, push, stage, deploy o production migration apply eseguito.

## Final review reconciliation - 2026-06-19

- Verdict: `SUPERSEDED_BY_FINAL_GAP_CLOSURE`.
- Admin Web -> Android/iOS e provato per catalogo create/update/tombstone/restore
  e per History Entry update/tombstone; fresh History Entry create post-fix non
  e stata rieseguita.
- Android/iOS -> Admin Web non e provato in TASK-072: esistono harness mobile
  che provano mobile -> Supabase/read-back con prefissi TASK-114/TASK-135, ma
  non una prova TASK-072 che mostri le righe mobile-origin lette da Admin Web.
- `test:shop:local` resta `FAIL_ENV_LATEST` per fixture locale
  `BLOCKED_TASK035_DEVICE_CREATE`; non blocca la prova cloud-dev cross-platform,
  ma blocca un verdetto pienamente verde.
- Device auto-registration e drift TASK-035/TASK-135 sono separabili dal core
  catalog/history solo con staging esplicito dei path; nessun `git add .`.
- Prossimo step richiesto per proporre DONE: mini-proof mobile-origin ->
  Supabase -> Admin Web, fresh History Entry create post-fix su Android/iOS, e
  riconciliazione/staging separato dei drift device.

## iOS Device Runtime Registration Live Gate - 2026-06-19

- Verdict: `PASS_WITH_NOTES`, task resta `REVIEW`, non `DONE`.
- Evidence: `docs/TASKS/EVIDENCE/TASK-072/README.md#ios-device-runtime-registration-live-gate---2026-06-19`.
- Causa corretta: il simulatore iOS era signed out e il root host chiamava
  `ShopDeviceRegistrationService` anche senza sessione, producendo RPC anonima
  `42501`.
- Fix finale iOS:
  - `ShopDeviceRegistrationService` verifica sessione attiva prima della RPC,
    logga in modo redatto e decodifica `ok/code` della response JSONB;
  - `ContentView` chiama bootstrap/foreground/automatic sync registration solo
    quando `authViewModel.isSignedIn`.
- Live DB/UI:
  - iOS Simulator `iPhone 17 Pro` registra `iOS arm64`,
    `device_identifier=5a77c1d7...ca5e`, `device_type=mobile`,
    `status=active`, `app_version=1.0 (1)`,
    `last_seen_profile_id=6425adb0...257e`;
  - `/shop/devices` mostra la row iOS active e `Detected sync clients`;
  - nessun iOS `sync_events.source_device_id` e stato generato in questa prova.
- Test negativo: re-register su row diagnostica revocata lascia
  `status=revoked` e aggiorna solo `last_seen_at`.
- Residuo: iOS registra e appare nel registry, ma non consuma ancora
  `shop_devices.status` per bloccare localmente ogni write/sync; enforcement
  mobile completo resta follow-up.

## TASK-072C Subagent A - Admin Web runtime/UI/harness

- Verdict operativo: `DONE_WITH_CONCERNS`, task complessivo resta `REVIEW`,
  non `DONE`.
- Scope eseguito: solo Admin Web scripts/tests/docs TASK-072; nessun commit,
  push, stage, deploy, migration cloud/production o modifica Android/iOS.
- Finding:
  - Admin Web ha gia lettura server-side per `/shop/products`,
    `/shop/products/[productId]`, `/shop/history` e
    `/shop/history/[entryId]`;
  - Admin-origin create/update/tombstone History Entry e catalog mutations
    esistono tramite server actions/RPC protette e writer `sync_events`
    server-only;
  - mancava un harness Admin Web read-only per prefisso `TASK072C_*`, overlay,
    `sync_events` e cleanup counts.
- Implementato:
  - `scripts/platform/task-072c-admin-runtime-harness.mjs`;
  - guardrail foundation in
    `tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`;
  - evidence aggiornata in `docs/TASKS/EVIDENCE/TASK-072/README.md`.
- Uso previsto:
  `TEST_TARGET=staging ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes ALLOWED_STAGING_SUPABASE_PROJECT_REFS=<ref> node scripts/platform/task-072c-admin-runtime-harness.mjs verify --shop-id=<shop_id> --prefix=TASK072C_ --require-data`.
- Limite: il harness non crea dati Admin-origin; il path sicuro resta UI/server
  actions autenticate per non bypassare permission context e audit.
- Checks:
  - `node --check scripts/platform/task-072c-admin-runtime-harness.mjs`:
    `PASS`;
  - `node scripts/platform/task-072c-admin-runtime-harness.mjs --help`:
    `PASS`;
  - `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`:
    `PASS` (`4/4`);
  - `npm run security:scan`: `PASS`;
  - `npm run test:foundation`: `PASS` (`386/386`);
  - `git diff --check`: `PASS`.

## TASK-072C - Runtime evidence reconciliation

- Verdict operativo finale: `SUPERSEDED_BY_FINAL_GAP_CLOSURE`, non `DONE`.
- Evidence aggiornata:
  `docs/TASKS/EVIDENCE/TASK-072/README.md#task-072c-runtime-evidence-reconciliation---2026-06-19`.
- Prove nuove riuscite:
  - Android harness live con prefix `TASK072C_ANDROID_R20260619_1345_`:
    catalog create/update/tombstone `pass`, History create/update/tombstone
    `pass`, outbox pending `0`;
  - iOS harness live con prefix `TASK072C_IOS_20260619T175420Z_`:
    product create/update/tombstone `pass`, supplier/category create/update
    `pass`, History create/update/tombstone `pass`, run outbox `pending=0`;
  - Admin Web read-only harness verifica entrambi i prefix su cloud-dev
    allowlistato `jpgo...yvm`, mapping owner bridge positivo e `sync_events`
    mobile-like redatti;
  - Computer Use visual QA:
    `/shop/products` mostra righe `TASK072C_ANDROID_*` e
    `TASK072C_IOS_*`; `/shop/history` mostra entry
    `TASK072C_*_HISTORY_CREATE`, `_UPDATE_FINAL`, `_TOMBSTONE`, `Payload v2`
    e `Overlay OK`.
- Gap residui bloccanti per `DONE_RECONCILED`:
  - Admin Web -> Android/iOS fresh `TASK072C_ADMIN_*` non rieseguito;
  - Android -> iOS e iOS -> Android non verificati dopo i nuovi run;
  - Android post-run e signed out per reinstall del runner strumentale;
  - cleanup incompleto: `cleanup-counts --prefix=TASK072C_` trova ancora
    prodotti, fornitori e categorie attivi;
  - idempotenza forte/replay watermark e negative RLS cross-shop non eseguiti.
- Check reconciliation:
  - Admin Web `node --check scripts/platform/task-072c-admin-runtime-harness.mjs`:
    `PASS`;
  - Admin Web targeted TASK-072:
    `node --test tests/foundation/task-072-cross-platform-catalog-history-sync.test.mjs`
    `PASS` (`4/4`);
  - Admin Web `npm run security:scan`: `PASS`;
  - Admin Web `npm run test:foundation`: `SUPERSEDED_FOUNDATION_PASS` nel run
    finale; due assert TASK-049 Platform Admin falliscono su
    `title={admin.profile_id}` e `title={rawValue}`. Non viene trattato come
    PASS e resta fuori scope TASK-072C;
  - Admin Web harness `verify` Android prefix, `verify` iOS prefix e
    `cleanup-counts`: `PASS` read-only redatto;
  - Admin/Android/iOS `git diff --check`: `PASS`;
  - iOS XcodeBuildMCP selected `test_sim`: `PASS` (`1/1`);
  - Android targeted harness: `PASS`; run legacy successivo non conteggiato
    perche fallito con sessione signed-out state.
- Handoff: resta in `REVIEW`; servono un run Admin-origin fresh, receiver
  mobile-to-mobile, cleanup sintetico e idempotenza/RLS runtime prima di
  proporre `DONE_RECONCILED`.

## Final gap closure / DONE reconciliation - 2026-06-19

- Verdict finale: `DONE_RECONCILED`.
- Scope chiuso:
  - Android live auth gate provato con sessione owner temporanea e stesso
    `device_install_id` persistito: active -> revoked blocca heartbeat/write
    manuale, automatica e cloud -> active ripristina `can_write=true`;
  - iOS build/test/launch confermati e live gate gia provato con revoked ->
    `can_write=false` e active -> `can_write=true`;
  - `/shop/devices` autenticata passa con fixture temporanea shop-manager,
    registry Android/iOS visibile, label account presente e `Detected sync
    clients` marcato come hint read-only;
  - Supabase harness deterministico `verify:task072:devices` passa su cloud dev
    non-production, sostituendo il lint CLI appeso con controlli SQL mirati;
  - `npm run test:foundation` torna verde (`390/390`) dopo riallineamento
    minimo del guardrail TASK-054 a TASK-072/TASK-073;
  - TASK-049/TASK-073 targeted regression passa (`8/8`).
- Schema/RPC:
  - `shop_device_register`/`shop_device_register_current_owner` preservano
    `revoked` e `suspicious`, aggiornano `last_seen_at`, account/staff visto e
    rifiutano metadata con chiavi sensibili;
  - `shop_device_status_current_owner(p_device_identifier text)` e read-only,
    non accetta `shop_id`, risolve lo shop owner-side e ritorna
    `status/can_write` redatti.
- Mobile/POS:
  - Android usa UUID installazione persistito in Room/`SyncEventDeviceStateDao`;
  - iOS usa UUID installazione persistito in `UserDefaults`;
  - POS server-side continua a bloccare first login/heartbeat/catalog/sales sync
    se il device non e `active`;
  - nessun IMEI, seriale, MAC, posizione, token, PIN, password, hash o secret e
    salvato nel registry device.
- Stato dati live:
  - device Android e iOS reali finali sono `active`;
  - restano righe diagnostiche revoked nel registry come audit storico e non
    vengono hard-delete.
- Check finali richiesti: da eseguire e registrare nell'evidence di chiusura
  dopo questo aggiornamento documentale.
- Nessun commit, push o stage.

## TASK-072D - Final bidirectional runtime E2E

- Verdict operativo: `READY_FOR_DONE_CONFIRMATION`, non `DONE`.
- Evidence aggiornata:
  `docs/TASKS/EVIDENCE/TASK-072/README.md#task-072d-final-bidirectional-runtime-e2e---2026-06-19`.
- Admin Web:
  - `TASK072D_ADMIN_20260619T185924Z_` seeded su cloud dev non-production;
  - `verify`, idempotency e negative RLS passano;
  - `sync_events` Admin emessi: `3180 catalog_changed`,
    `3181 history_changed`.
- Android:
  - runtime harness live `TASK072D_ANDROID_20260619T192615Z_` passa con
    `adminReceiver=pass`;
  - runtime harness live `TASK072D_ANDROID_20260619T193033Z_` passa con
    `iosReceiver=pass`;
  - catalog/history create/update/tombstone passano, `syncType=EVENT_INCREMENTAL`,
    `fullPull=false`, pending/outbox `0`.
- iOS:
  - runtime harness live `TASK072D_IOS_20260619T192903Z_` passa con
    `android_receive=android:applied_products_3_history_3`;
  - `admin_receive=admin:applied_products_0_history_1`;
  - run outbox `pending=0`, `syncType=EVENT_INCREMENTAL`, `fullPull=false`.
- Cleanup:
  - remote `cleanup-tombstone --prefix=TASK072D_` passa con verdict
    `DONE_SYNTHETIC_TOMBSTONE_CLEANUP`;
  - post-cleanup remote verify: products/categories/suppliers/history
    `active=0`;
  - Android local cleanup execute e final dry-run passano con tutti i contatori
    prefissati a `0`;
  - iOS cleanup locale e solo dry-run per design, backend cleanup gia verificato.
- Computer Use:
  - `list_apps` vede Safari, Simulator e Android Studio running;
  - evidence visuale finale e stata completata con fallback
    `PLAYWRIGHT/ADB/SIMCTL_VISUAL_EVIDENCE`, salvato in evidence TASK-072.
- Check finali freschi:
  - Admin targeted TASK-072 `5/5`, `security:scan`, `test:foundation 390/390`,
    `typecheck`, `build`, `verify`, `test:shop:local 5/5` e
    `git diff --check` passano; lint e pulito, build/verify hanno solo warning
    toolchain noti (`middleware` deprecato, Node `DEP0205`);
  - Android `assembleDebug`, `lintDebug testDebugUnitTest`,
    `compileDebugAndroidTestKotlin`, targeted authorization unit e harness
    runtime passano;
  - iOS XcodeBuildMCP `build_sim` passa e selected sync/history/catalog/outbox
    tests passano `121/121`.
- Stato finale: `DONE_RECONCILED`.
- Conferma per passare a `DONE`: brief utente `TASK-072 Final Review / DONE Gate /
  Commit Readiness`.
- Nessun commit, push, stage, deploy o production migration apply.

## Final DONE gate / commit readiness - 2026-06-19

- Verdict finale: `DONE_RECONCILED`.
- Evidence primaria: `docs/TASKS/EVIDENCE/TASK-072/README.md#final-done-gate--commit-readiness---2026-06-19`.
- Visual evidence fallback completata: Admin Web screenshot filtrati/contestuali
  via browser/Playwright, Android via `adb exec-out screencap`, iOS via
  `xcrun simctl io ... screenshot`.
- DB/store verification:
  - Admin read-only TASK072D direct rows: active products/suppliers/categories/history `0`, duplicate keys `0`;
  - Android DB copied via `adb run-as`: TASK072D active/local refs/outbox `0`;
  - iOS store diretto: TASK072D products/suppliers/categories/history active
    `0`, pending/outbox TASK072D `0`, `sync_outbox_localOnly_all=2` separato
    come preesistente non TASK-072D.
- Idempotenza e negative RLS confermate da Admin harness:
  `client_event_id` replay insert once/no duplicate; anon/cross-shop bloccati o
  `0`.
- Android device authorization review: `revoked` non scrive, errori network non
  vengono mascherati come active, cache active ammessa solo per cancellazioni
  transitorie automatiche fresche e mai per manual write; unit test mirato passa.
- Check finali freschi:
  - Admin: `security:scan`, TASK-072 targeted `5/5`, `test:foundation 390/390`,
    `typecheck`, `lint` senza warning, `build`, `verify`, `test:shop:local 5/5`
    e `git diff --check` passano;
  - Android: `assembleDebug`, `lintDebug testDebugUnitTest`,
    `ShopDeviceAuthorizationRepositoryTest`, `compileDebugAndroidTestKotlin` e
    `git diff --check` passano;
  - iOS: XcodeBuildMCP `build_sim` passa senza warning/errori; selected
    sync/history/catalog/outbox tests `121/121`; `git diff --check` passa.
- Worktree: dirty nei tre repo, nessun file staged; drift classificato in
  evidence e commit plan path-explicit preparato. Non usare `git add .`.
- Commit/push: `NOT_RUN` per assenza di autorizzazione esplicita finale a
  stage/commit/push.
