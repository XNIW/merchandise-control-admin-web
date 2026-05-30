# TASK-005A - Supabase Source Alignment / Foundation Readiness

## Informazioni generali

- ID: `TASK-005A`
- Titolo: Supabase Source Alignment / Foundation Readiness
- Stato: `DONE`
- Fase attuale: `CLOSED`
- Responsabile attuale: `USER / CONFIRMED DONE`
- Dipende da: `TASK-004` DONE, `TASK-005` PLANNED_BLOCKED, fonti Supabase/Android/iOS fornite dall'utente.
- File Master Plan Admin Web: `docs/MASTER-PLAN.md`
- Fonte Supabase/Android letta: `/Users/minxiang/Desktop/MerchandiseControlSupabase/MASTER_PLAN.md`
- Fonti mobile aggiunte: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`, `/Users/minxiang/Desktop/iOSMerchandiseControl`

## Scopo

Creare un task ponte repo-grounded per riallineare Admin Web alla linea Supabase/Android/iOS reale, senza collegare dati reali alla UI e senza iniziare execution runtime di `TASK-005`.

Questo task non implementa Supabase in Admin Web. Non crea client, migration, tipi `Database`, login/auth, CRUD, server actions operative, env reali o collegamenti a dati live.

## File letti

### Admin Web

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-004-supabase-schema-discovery-planning.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/SKILLS/supabase-security.md`
- scan mirato su `docs`, `src`, `package.json`, `README.md`, `CLAUDE.md`, `AGENTS.md`

### Supabase/Android workspace

- `/Users/minxiang/Desktop/MerchandiseControlSupabase/MASTER_PLAN.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/decisions.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/mapping_room_to_supabase.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/room_current_model.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/supabase_target_model.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/README.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/20260417120000_task013_inventory_catalog_rls.sql`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/20260417200000_task016_inventory_product_prices.sql`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/20260418200000_task019_inventory_catalog_tombstone.sql`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/20260421120000_task038_restrict_authenticated_delete_inventory.sql`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/20260424021936_task045_sync_events.sql`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/TASKS/020_product_prices_live_ops_and_verification.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/TASKS/038_remote_delete_restriction_apply_and_postcheck.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/TASKS/045_sync_events_incremental_catalog_price_pull_option_b.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/TASKS/046_apply_verify_sync_events_staging_live.md`

### Android workspace

- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/docs/SUPABASE.md`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/docs/MASTER-PLAN.md`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/gradle/libs.versions.toml`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/app/build.gradle.kts`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/supabase/migrations/20260424190000_harden_rls_and_sync_indexes.sql`
- `SupabaseAuthManager.kt`, `AuthState.kt`
- `SupabaseCatalogRemoteDataSource.kt`
- `SupabaseProductPriceRemoteDataSource.kt`
- `SupabaseSyncEventRemoteDataSource.kt`
- `SupabaseSyncEventRealtimeSubscriber.kt`

### iOS workspace

- `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/MASTER-PLAN.md`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/SUPABASE/TASK-033-schema-audit.md`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/TASKS/TASK-084-android-ios-cross-platform-parity.md`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/TASKS/TASK-087-android-ios-supabase-small-runtime-smoke.md`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/TASKS/TASK-103-final-real-device-cross-platform-acceptance-ios-supabase-android.md`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl.xcodeproj/project.pbxproj`
- `/Users/minxiang/Desktop/iOSMerchandiseControl/iOSMerchandiseControl.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
- `SupabaseConfig.swift`, `SupabaseConfig.example.plist`
- `SupabaseClientProvider.swift`
- `SupabaseAuthService.swift`, `SupabaseAuthViewModel.swift`
- `Sync/Remote/SupabaseTransportClient.swift`
- `Sync/Remote/SupabaseInventoryDTOs.swift`
- `Sync/Remote/SupabaseSyncEventDTOs.swift`
- `Sync/Remote/SupabaseSyncEventRPCTransport.swift`
- `Sync/Remote/SupabaseSyncEventRealtimeWatcher.swift`

Nota: non sono stati letti o stampati valori `.env`, `local.properties` o `SupabaseConfig.plist` reali. Non sono state eseguite query Supabase live.

## Stato reale Admin Web Supabase

Stato verificato: `SUPABASE_RUNTIME_ABSENT`.

Evidenze:

- `package.json` non contiene dipendenze `@supabase/*`.
- Non esiste cartella `supabase/` nella repo Admin Web.
- Non sono presenti migration SQL Admin Web.
- Non e presente client Supabase.
- Non sono presenti tipi generati `Database`.
- Non e presente env template Supabase.
- Non sono presenti auth SSR, RLS reali o policy applicate in questa repo.
- Gli unici riferimenti Supabase/RLS/policy/migration sono documentali o placeholder statici gia tracciati in task precedenti.

Implicazione: `TASK-005` non puo passare a execution read-only su dati reali da questa repo.

## Stato reale fonte Supabase/Android

Stato verificato: `LOCAL_SUPABASE_PROJECT_WITH_MIGRATIONS_AND_LIVE_EVIDENCE_DOCS`.

La fonte Supabase/Android contiene:

- cartella `supabase/migrations/` con migration reali locali;
- documentazione di mapping Room -> Supabase;
- registro decisionale con modello Room-first/offline-first;
- task operativi che documentano apply live e verifiche per alcuni oggetti;
- schema locale per catalogo inventario, storico prezzi, sessioni condivise e `sync_events`;
- evidenza documentale di apply live per `inventory_product_prices`, tombstone catalogo, restrizione delete e `sync_events`.

Limite: il `MASTER_PLAN.md` Android e le note task non sono schema eseguibile. Restano fonti documentali da verificare contro migration, DB target e decisioni prima di riusare qualsiasi oggetto in Admin Web.

## Stato reale integrazione mobile

Stato verificato: `MOBILE_CLIENTS_SUPABASE_INTEGRATED_OWNER_SCOPED`.

### Android

Android usa Supabase in modo concreto:

- dipendenze `supabase-kt`, `realtime-kt`, `auth-kt`, `postgrest-kt`;
- configurazione via `BuildConfig` da `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GOOGLE_WEB_CLIENT_ID`;
- auth Google via Supabase Auth e `AuthState.SignedIn(userId, email)`;
- PostgREST su `inventory_suppliers`, `inventory_categories`, `inventory_products`, `inventory_product_prices`;
- RPC `record_sync_event`;
- Realtime su `sync_events` filtrato per `owner_user_id`;
- Realtime su `shared_sheet_sessions`;
- runbook `docs/SUPABASE.md` che distingue `CODE`, `MIGRATION`, `LOCAL_SUPABASE_PROJECT`, `LIVE`, `ASSUMPTION`;
- migration hardening Android repo `20260424190000_harden_rls_and_sync_indexes.sql` con RLS owner-scoped initplan-friendly, private `shared_sheet_sessions`, hardening legacy/view/function e indici owner-scoped.

### iOS

iOS usa Supabase in modo concreto:

- dipendenza Swift Package `supabase-swift` con prodotto `Supabase`;
- `SupabaseConfig.example.plist` documenta `SUPABASE_PROJECT_URL` e `SUPABASE_PUBLISHABLE_KEY`;
- `SupabaseConfig.swift` rifiuta placeholder e chiavi server-only/service-role;
- `SupabaseClientProvider.swift` crea `SupabaseClient` con storage auth e redirect OAuth;
- servizi Supabase Swift per auth Google, PostgREST, RPC, Realtime, remote DTO, outbox e sync;
- DTO per `inventory_*`, `inventory_product_prices` e `sync_events`;
- Realtime watcher su `sync_events` filtrato per `owner_user_id`;
- task iOS documentano parita Android/iOS, smoke cross-platform e acceptance real-device su perimetri Supabase prefissati.

Nota: `docs/SUPABASE/TASK-033-schema-audit.md` contiene uno snapshot storico in cui non veniva ancora rilevato un client Supabase iOS. Il codice iOS corrente letto in questo passaggio lo supera: oggi l'integrazione Supabase iOS e presente.

## Evidence trovata

### Migration reali locali

- `20260417120000_task013_inventory_catalog_rls.sql` crea `inventory_suppliers`, `inventory_categories`, `inventory_products` con `owner_user_id`, RLS owner-scoped e policy CRUD iniziali.
- `20260417200000_task016_inventory_product_prices.sql` crea `inventory_product_prices` con `owner_user_id`, FK a `inventory_products`, CHECK `type`, unique business e RLS owner-scoped.
- `20260418200000_task019_inventory_catalog_tombstone.sql` aggiunge `deleted_at`, partial unique e trigger anti-resurrezione su catalogo.
- `20260421120000_task038_restrict_authenticated_delete_inventory.sql` documenta restrizione hard-delete su tabelle inventory.
- `20260424021936_task045_sync_events.sql` crea `sync_events`, RLS SELECT owner-scoped e RPC `record_sync_event` `SECURITY DEFINER` con allowlist, validazione payload e publication Realtime.

### Documentazione e task operativi

- `TASKS/020` documenta apply live di `inventory_product_prices` e tombstone catalogo, con verifiche SQL e smoke Android.
- `TASKS/038` documenta apply live della restrizione delete su inventory.
- `TASKS/045` documenta MVP `sync_events`, migration prepared e implementazione Android.
- `TASKS/046` documenta apply/verify live di `sync_events`; addendum successivo chiarisce che la cartella locale va trattata come `LOCAL_SUPABASE_PROJECT`, non prova live corrente.
- `docs/mapping_room_to_supabase.md` mappa Room su `inventory_*`, `inventory_product_prices` e `shared_sheet_sessions`.
- `docs/decisions.md` conferma Room-first, Supabase incrementale, ownership `owner_user_id`, no mirror 1:1 di `history_entries`, `record_sync_event` single row/object.
- Android `docs/SUPABASE.md` conferma che il client Android consuma oggetti Supabase reali ma distingue codice, migration locali e live non verificato nel documento.
- iOS sorgente corrente conferma integrazione Supabase Swift e servizi cross-platform owner-scoped.
- iOS task `TASK-087` e `TASK-103` documentano smoke/acceptance cross-platform iOS-Supabase-Android, ma restano evidenze mobile/prodotto, non schema Admin Web.

## Differenze Admin Web vs Android/Supabase

La linea Android/Supabase e centrata su account personale e inventario owner-scoped:

- `inventory_suppliers`
- `inventory_categories`
- `inventory_products`
- `inventory_product_prices`
- `shared_sheet_sessions`
- `sync_events`

La linea iOS corrente e allineata allo stesso modello mobile owner-scoped e cross-platform, usando gli stessi oggetti principali e lo stesso concetto `owner_user_id`.

Il modello Admin Web atteso nel Master Plan e centrato su amministrazione piattaforma e negozi:

- `profiles`
- `shops`
- `shop_members`
- `staff_accounts`
- `roles`
- `permissions`
- `devices`
- `audit_logs`
- ruolo globale `platform_admin`

Gap principale: non e stata trovata una corrispondenza verificata tra `owner_user_id` mobile e `shop_id` / `shop_code` Admin Web, ne una policy verificata che consenta a `platform_admin` di leggere globalmente in modo server-side e auditato.

## Matrice fonte / evidenza / riuso

| Fonte | Evidenza | Attendibilita | Utilizzabile per Admin Web | Rischio | Prossimo passo |
| --- | --- | --- | --- | --- | --- |
| Admin Web repo | Scan locale: nessun `supabase/`, client, migration, env template, tipi `Database`, dipendenze `@supabase/*` | Alta per stato repo | Si, come baseline di assenza | Nessuna execution dati reali possibile | Mantenere `TASK-005` bloccato |
| Admin Web Master Plan | Modello previsto `profiles`, `shops`, `shop_members`, `audit_logs`, `platform_admin` | Alta come intent prodotto | Si, come target Admin Web | Non e schema DB reale | Trasformare in prerequisiti verificabili |
| Android `MASTER_PLAN.md` | Linea Supabase avanzata con task DONE e note live | Media | Si, come indice documentale | Puo essere non allineato allo stato live corrente | Verificare contro migration e DB target approvato |
| `supabase/migrations/20260417120000_task013...` | DDL locale `inventory_*`, RLS owner-scoped | Alta per schema locale | Parziale | Modello account-owned, non shop/platform admin | Decidere se leggere inventory direttamente o via read model |
| `supabase/migrations/20260417200000_task016...` | DDL locale `inventory_product_prices` | Alta per schema locale | Parziale | Storico prezzi non e dashboard platform di per se | Confermare bisogno in Admin Web e policy read-only |
| `supabase/migrations/20260418200000_task019...` | Tombstone `deleted_at`, partial unique, trigger anti-resurrezione | Alta per schema locale | Parziale | Semantica delete inventory, non shops/staff | Riusare solo se Admin Web legge inventory |
| `supabase/migrations/20260421120000_task038...` | Restrizione hard-delete inventory documentata/applicata in task | Media-alta | Parziale | Non autorizza letture globali platform | Verificare grants/policy sul DB target |
| `supabase/migrations/20260424021936_task045...` | `sync_events`, RPC `record_sync_event`, RLS owner-scoped | Alta per schema locale | Parziale | Event stream non equivale ad audit log Admin Web | Decidere se `sync_events` e osservabilita tecnica o audit visibile |
| `TASKS/020` | Apply live 016/019 documentato con evidence SQL e smoke Android | Media-alta | Parziale | Evidence storica; live corrente non interrogato qui | Richiedere verifica read-only approvata se serve |
| `TASKS/046` | Apply live `sync_events` documentato; addendum distingue locale vs live | Media-alta | Parziale | Stato live corrente non verificato da Admin Web | Verifica live separata e autorizzata |
| Android repo | Codice Kotlin usa Supabase Auth, PostgREST, Realtime, `record_sync_event`, tabelle `inventory_*` e `shared_sheet_sessions` | Alta per client contract | Parziale | Conferma consumo mobile, non modello platform admin | Usare come fonte comportamento owner-scoped |
| Android `supabase/migrations/20260424190000...` | RLS owner-scoped hardening, private sessions, indici owner, view/function hardening | Alta per artifact repo | Parziale | Migration Android repo non prova live corrente ne copre platform admin | Verificare contro fonte Supabase canonical e live approvato |
| iOS repo | Supabase Swift, auth, DTO, PostgREST, RPC, Realtime e sync services presenti | Alta per client contract | Parziale | Modello mobile owner-scoped; non shop/platform admin | Usare come conferma cross-platform mobile |
| iOS task cross-platform | TASK-087/TASK-103 documentano smoke/acceptance iOS-Supabase-Android | Media-alta | Parziale | Evidence mobile non basta per Admin Web/RLS globale | Estrarre solo contratti dati e limiti |
| `docs/mapping_room_to_supabase.md` | Mapping dettagliato Room -> Supabase | Alta come mapping Android | Parziale | Non include `shops`, `shop_members`, `platform_admin` | Produrre mapping Admin Web -> fonte reale |
| `docs/decisions.md` | Decisioni Room-first, owner_user_id, no mirror history, RPC object | Alta come governance Android | Si, come vincolo di compatibilita | Puo confliggere con bisogni platform-global | Nuova decisione Admin Web su boundary platform |

## Tabelle potenzialmente utili per Admin Web

Potenzialmente riusabili solo dopo verifica di schema/live/RLS e decisione di prodotto:

- `inventory_suppliers`
- `inventory_categories`
- `inventory_products`
- `inventory_product_prices`
- `sync_events`
- `shared_sheet_sessions`, se Admin Web deve osservare sessioni condivise e non solo inventario

Oggetti e concetti mobile confermati da Android/iOS ma non automaticamente riusabili come Admin Web:

- `owner_user_id`: identita utente mobile owner-scoped, non ancora `shop_id`;
- Realtime `sync_events`: segnale tecnico di sync catalog/prezzi, non audit log amministrativo;
- outbox/watermark mobile: stato client/offline-first, non backend platform;
- `shared_sheet_sessions`: payload sessioni inventario, non membership shop;
- auth Google mobile: login utente finale, non decisione `platform_admin` web.

Non risultano disponibili, nella fonte letta, come tabelle verificate equivalenti al modello Admin Web:

- `profiles`
- `shops`
- `shop_members`
- `staff_accounts`
- `roles`
- `permissions`
- `devices`
- `audit_logs` applicativo Admin Web

## Prerequisiti per sbloccare TASK-005

`TASK-005` resta bloccato finche non vengono soddisfatti o approvati questi gate:

1. Schema target Admin Web verificato:
   - confermare se Admin Web usera tabelle Android esistenti, nuove viste/read model o nuove tabelle platform/shop;
   - confermare se `owner_user_id` equivale a profilo personale, owner shop o altro;
   - confermare se serve una tabella `shops` separata e come si collega agli inventory Android.
2. Tabelle e colonne minime:
   - `profiles` o equivalente account personale;
   - `shops` o equivalente root negozio;
   - `shop_members` o equivalente membership/ruoli;
   - `roles` / `permissions` o decisione alternativa;
   - `audit_logs` o decisione esplicita di stato non disponibile;
   - tabelle inventory se devono essere esposte in sola lettura.
3. RLS e authorization:
   - policy owner/shop-scoped per utenti normali;
   - policy o boundary server-side per `platform_admin`;
   - divieto di service-role nel browser;
   - decisione su global read: RLS con custom claim/role table oppure funzione/server boundary auditata.
4. Identificazione `platform_admin`:
   - fonte autorevole server-side;
   - non basata solo su mock, URL, input client o local state;
   - comportamento per utente non autorizzato.
5. Boundary Admin Web:
   - client Supabase server-side o wrapper server-only approvato;
   - niente query sensibili da componenti client;
   - mappers schema reale -> view model.
6. Env e tipi:
   - env template senza valori reali;
   - decisione variabili pubbliche vs server-only;
   - tipi `Database` generati da schema verificato.
7. Evidence e test:
   - verifica read-only schema/RLS su ambiente approvato;
   - check no secret/no service-role client;
   - `npm run verify` solo quando ci sono modifiche runtime verificabili;
   - eventuale smoke UI solo quando cambia UI/runtime.

## Raccomandazione

`TASK-005` deve restare `PLANNED_BLOCKED` per execution read-only su dati reali.

Le fonti Supabase/Android/iOS sono forti come base mobile owner-scoped e cross-platform, ma sbloccano solo un percorso di foundation readiness Admin Web:

- allineare modello Admin Web con schema esistente;
- decidere se `shops` nasce come nuovo boundary o come read model sopra owner/inventory esistenti;
- decidere se introdurre viste/read model platform;
- definire boundary server-side e `platform_admin`;
- preparare env template, generazione tipi e RLS review.

`TASK-005` puo essere ridotto in futuro a foundation readiness solo con scope esplicito approvato. Non puo passare a execution read-only live finche i gate sopra non sono soddisfatti con evidence reale.

## Non fatto

- Nessun client Supabase creato.
- Nessuna dipendenza `@supabase/*` installata.
- Nessuna migration creata o applicata.
- Nessun schema inventato.
- Nessuna query Supabase live eseguita.
- Nessun dato reale letto o stampato.
- Nessun valore `.env` letto o stampato.
- Nessun login/auth/CRUD introdotto.
- Nessuna UI runtime modificata.
- Nessun commit eseguito.

## Check

| Check | Esito | Note |
| --- | --- | --- |
| `git status --short` | PASS_WITH_NOTES | Worktree contiene modifiche documentali e task file non tracciati. |
| `git diff --stat` | PASS_WITH_NOTES | Diff documentale; i file non tracciati non compaiono nello stat Git standard. |
| `git diff --check` | PASS | Nessun whitespace error rilevato. |
| `npm run verify` | NOT_RUN | Task solo planning documentale; nessuna modifica runtime verificabile. |

## Rischi residui

- Lo stato live Supabase corrente non e stato interrogato in questo task.
- La fonte Android documenta oggetti reali, ma non copre ancora il modello Admin Web `shops`/membership/platform admin.
- Un riuso diretto di `inventory_*` rischia di bypassare il boundary shop/platform se non viene introdotto un read model o una policy dedicata.
- `sync_events` non sostituisce automaticamente `audit_logs` per operazioni Admin Web.
- L'identita `platform_admin` resta non definita server-side.

## Review finale

Verdict: `DONE`.

La review finale non ha trovato blocker documentali e l'utente ha confermato `TASK-005A` come `DONE`:

- Admin Web risulta ancora senza runtime Supabase: nessun client, migration, template env, tipo `Database`, dipendenza `@supabase/*`, login/auth/CRUD o UI runtime collegata a dati reali.
- Le fonti Supabase/Android/iOS restano evidence da riallineare, non schema Admin Web gia pronto.
- `TASK-005` resta `PLANNED_BLOCKED`.
- Non sono stati introdotti schema, colonne, policy, query o definizione `platform_admin` inventati per Admin Web.
- La raccomandazione resta aprire un nuovo task di decisione/mapping Admin Web Supabase prima di eseguire `TASK-005`.

## Prossimo passo concreto

Aprire `TASK-005B - Admin Web Supabase Domain Mapping / Boundary Decision` per decidere il modello Admin Web su Supabase:

1. mapping `profiles`/`shops`/`shop_members` verso schema esistente o nuove viste;
2. decisione `platform_admin` server-side;
3. piano RLS/read model per letture globali read-only;
4. env template e generazione tipi;
5. solo dopo, rivalutazione di `TASK-005` per execution read-only.
