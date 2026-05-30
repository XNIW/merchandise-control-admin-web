# TASK-005B - Admin Web Supabase Domain Mapping / Boundary Decision

## 1. Informazioni generali

- ID: `TASK-005B`
- Titolo: Admin Web Supabase Domain Mapping / Boundary Decision
- Stato: `DONE`
- Stato precedente: `PLANNED_BLOCKED`
- Fase attuale: `CLOSED`
- Responsabile attuale: `USER / DONE CONFIRMED`
- Dipendenze:
  - `TASK-005A` DONE;
  - `TASK-005` PLANNED_BLOCKED;
  - fonti Supabase/Android/iOS gia riallineate in `TASK-005A`;
  - decisione esplicita futura su dominio Admin Web, boundary server-side, RLS e `platform_admin`.
- File Master Plan: `docs/MASTER-PLAN.md`

## Pre-flight

Comandi eseguiti prima della creazione del piano:

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree con modifiche documentali pendenti: `M docs/MASTER-PLAN.md` e task docs non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `docs/MASTER-PLAN.md`; i task docs untracked non compaiono nello stat standard. |
| `git diff --check` | `PASS` | Nessun output. |

Stato verificato:

- `TASK-005A`: `DONE`.
- `TASK-005`: `PLANNED_BLOCKED`.
- `TASK-005B`: file non esistente prima di questo task.
- Supabase Admin Web runtime: assente.
- Nessun commit eseguito.

## 2. Scopo

`TASK-005B` serve a decidere il modello Supabase futuro di Admin Web prima di qualunque lettura dati live.

Il task non implementa runtime. Non crea client Supabase, migration, auth/login, CRUD, dipendenze, env reali, tipi `Database`, query live o UI collegata a dati reali.

Domande da chiudere:

- Admin Web usera nuove tabelle `profiles`, `shops`, `shop_members`, `roles`, `permissions`, `audit_logs`?
- Admin Web leggera direttamente tabelle mobile `inventory_*` owner-scoped?
- Admin Web usera viste/read model server-side sopra schema mobile?
- `owner_user_id` rappresenta un account personale, un owner negozio o solo l'identita mobile?
- Come nasce `shop_id` / `shop_code` rispetto ai dati mobile esistenti?
- Come viene identificato `platform_admin` lato server?
- Come si evita che il Platform Admin bypassi RLS in modo insicuro?
- Cosa puo leggere `TASK-005` in modalita read-only?

## 3. Stato iniziale repo-grounded

### Admin Web

- `package.json` non contiene dipendenze `@supabase/*`.
- Non esiste cartella `supabase/`.
- Non esistono migration SQL Admin Web.
- Non esistono client Supabase o tipi `Database`.
- Non esiste env template Supabase.
- Non esistono auth SSR, RLS reali, query live o server action operative.
- Le uniche occorrenze Supabase nella repo Admin Web sono documentali.

### Stato governance

- `TASK-004`: `DONE`, scope discovery/planning.
- `TASK-005A`: `DONE`, scope source alignment/foundation readiness.
- `TASK-005`: resta `PLANNED_BLOCKED`; execution read-only live non autorizzata.

### Modello mobile/Supabase esistente

Fonti Supabase/Android/iOS indicano una linea reale owner-scoped:

- `inventory_suppliers`;
- `inventory_categories`;
- `inventory_products`;
- `inventory_product_prices`;
- `shared_sheet_sessions`;
- `sync_events`;
- ownership via `owner_user_id`;
- RLS owner-scoped;
- Android/iOS integrati con Supabase Auth, PostgREST/RPC/Realtime.

Questa evidence non dimostra che il modello sia gia adatto ad Admin Web.

### Modello Admin Web previsto

Il Master Plan Admin Web e i domain type/mock indicano un modello shop/platform-scoped:

- `profiles`;
- `shops`;
- `shop_members`;
- `staff_accounts`;
- `roles`;
- `permissions`;
- `devices`;
- `audit_logs`;
- ruolo globale `platform_admin`.

### Gap principale

Non esiste ancora una decisione verificata che colleghi:

- `owner_user_id` mobile a `profile_id`;
- `owner_user_id` mobile a `shop_id` / `shop_code`;
- `inventory_*` owner-scoped a un modello platform read-only;
- `sync_events` ad `audit_logs`;
- `platform_admin` a una fonte server-side autorevole.

## 4. File letti

### Admin Web

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `package.json`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-004-supabase-schema-discovery-planning.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/TASKS/TASK-005A-supabase-source-alignment-foundation-readiness.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/supabase-security.md`
- `src/domain/platform-admin/types.ts`
- `src/domain/platform-admin/mock.ts`
- `src/domain/platform-admin/index.ts`

### Fonti Supabase/Android/iOS

- `/Users/minxiang/Desktop/MerchandiseControlSupabase/MASTER_PLAN.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/decisions.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/mapping_room_to_supabase.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/room_current_model.md`
- `/Users/minxiang/Desktop/MerchandiseControlSupabase/docs/supabase_target_model.md`
- migration Supabase locali per inventory catalog, product prices, tombstone, delete restriction e `sync_events`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/docs/SUPABASE.md`
- `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/docs/MASTER-PLAN.md`
- riferimenti Android a Supabase dependencies/config/Auth/PostgREST/RPC/Realtime
- `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/MASTER-PLAN.md`
- task iOS cross-platform Supabase citati da `TASK-005A`
- riferimenti iOS a Supabase config/client/sync services

Nota sicurezza: non sono stati letti o stampati valori `.env`, `local.properties`, `SupabaseConfig.plist` reali, token, password, PIN, JWT, refresh token, connection string o service-role key.

## 5. Evidence sintetica

| Fonte | Evidence | Attendibilita | Uso per TASK-005B |
| --- | --- | --- | --- |
| Admin Web repo | Nessun runtime Supabase, nessun client, nessuna migration, nessuna dipendenza | Alta | Baseline: execution live impossibile |
| Master Plan Admin Web | `shops` root business, ruoli global/shop-scoped, `platform_admin` previsto | Alta come intent prodotto | Target dominio Admin Web |
| Domain Model / ADR-001 | `shops` come root; dati business su `shop_id`/`shop_code` | Alta come decisione locale | Vincolo contro mapping implicito su `owner_user_id` |
| TASK-005A | Matrice source alignment e gap owner/shop/platform | Alta come handoff documentale | Fondazione di questo piano |
| Supabase migrations locali | `inventory_*`, `inventory_product_prices`, `sync_events`, RLS owner-scoped | Alta per sorgente locale | Evidence mobile/schema locale, non schema Admin Web |
| Android/iOS | Client reali usano Supabase owner-scoped | Alta per client contract | Compatibilita da preservare |
| iOS cross-platform tasks | Evidenze runtime/mobile su perimetri Supabase | Media-alta | Evidence mobile, non autorizzazione Admin Web |

## 6. Decisioni da prendere

### DEC-005B-01 - Identita account personale

Domande:

- `profiles` deve nascere come nuova tabella Admin Web?
- `profiles` deve mappare direttamente `auth.users.id`?
- `owner_user_id` mobile diventa `profile_id`, resta solo `auth.users.id`, o richiede una tabella ponte?
- Come si gestiscono account personali membri di piu shop?

Vincoli:

- Non usare mock come fonte auth reale.
- Non usare input client come fonte autorevole di ruolo.
- Non cambiare il modello mobile senza task dedicato.

Esito atteso: decisione documentata su identita personale e relazione con `owner_user_id`.

### DEC-005B-02 - Root negozio

Domande:

- Creare `shops` come root business Admin Web?
- Come assegnare e validare `shop_code`?
- Come collegare uno shop ai dati inventory mobile gia owner-scoped?
- Serve una tabella mapping tra shop e inventory source?

Vincoli:

- ADR-001 dice che `shops` e la root business.
- Non introdurre `merchant -> stores` senza nuova ADR.
- Non fingere che `owner_user_id` sia gia `shop_id`.

Esito atteso: decisione su `shops` come root e sul ponte verso inventory.

### DEC-005B-03 - Membership

Domande:

- Creare `shop_members`?
- Quali ruoli iniziali sono shop-scoped: `shop_owner`, `shop_manager`, `viewer`?
- Come si collega una membership a un profilo personale e a uno shop?
- Come si impedisce a staff POS/cashier di diventare automaticamente account web?

Vincoli:

- Account personale e staff POS restano separati.
- Membership shop-scoped deve essere valutata rispetto a `shop_id`.

Esito atteso: decisione su membership e ruoli shop-scoped.

### DEC-005B-04 - Platform admin

Domande:

- `platform_admin` vive in tabella dedicata, membership globale, custom claim, allowlist server-only temporanea o altro?
- Quale fonte e autorevole lato server?
- Come si revoca un platform admin?
- Come si verifica che un utente non autorizzato riceva `unauthorized` senza data leak?

Vincoli:

- No decisione basata solo su URL, local state, mock, email hardcoded nel client o input client.
- No service-role key nel browser.
- Global read solo dietro boundary server-side auditabile.

Esito atteso: decisione esplicita su identificazione e verifica `platform_admin`.

### DEC-005B-05 - Inventory mobile

Domande:

- Admin Web deve leggere direttamente `inventory_*`?
- Serve un read model o vista server-side?
- Come si mappa `owner_user_id` a shop?
- Il modello mobile Room-first resta indipendente?

Vincoli:

- Android/iOS sono gia integrati e non devono rompersi.
- RLS owner-scoped mobile va preservata.
- Letture platform globali non devono bypassare RLS in modo implicito o client-side.

Esito atteso: decisione sul riuso diretto, read model o mapping esplicito.

### DEC-005B-06 - Audit

Domande:

- `sync_events` e un audit log Admin Web?
- Serve `audit_logs` separato?
- Cosa mostra Platform Admin se audit non esiste?
- Eventi tecnici di sync e azioni amministrative devono restare separati?

Vincoli:

- `sync_events` nasce come lane tecnica catalog/prezzi owner-scoped.
- `audit_logs` Admin Web deve tracciare azioni sensibili e privilegi globali.

Esito atteso: decisione su audit log separato o stato `audit not configured`.

### DEC-005B-07 - RLS e server boundary

Domande:

- Quali letture sono shop-scoped?
- Quali letture sono global read per `platform_admin`?
- Le letture platform passano da RLS con role table/custom claim o da server boundary dedicato?
- Come si rendono auditabili le letture/azioni future?

Vincoli:

- RLS obbligatoria su tabelle esposte.
- Nessuna query sensibile da componenti client.
- Nessun accesso basato solo su input client.
- Nessun service-role client.

Esito atteso: decisione su boundary server-side e strategia RLS/read-only.

### DEC-005B-08 - Lifecycle dati legacy/mobile e dati non mappati

Domande:

- I dati mobile esistenti restano fonte operativa primaria per catalogo/prezzi?
- Come vengono trattati record `inventory_*` senza mapping shop approvato?
- Serve uno stato esplicito `unmapped`, `not_configured` o `mobile_only` nel read model Admin Web?
- Quale evidence distingue dati correnti, dati storici e dati solo documentali?

Vincoli:

- Nessun dato mobile deve essere reinterpretato come shop-scoped senza mapping approvato.
- Nessun record non mappato deve comparire nella UI Platform/Shop Admin come dato live affidabile.
- Nessuna cancellazione, backfill o modifica dati mobile in questo task.

Esito atteso: policy documentata per dati legacy/mobile non mappati e per evidence current vs historical.

### DEC-005B-09 - Compatibilita Shop Admin, Staff POS e dispositivi

Domande:

- Il modello scelto abilita in futuro sia `Platform Admin Console` sia `Shop Admin Console`?
- Staff POS, dispositivi e ruoli operativi restano shop-scoped e separati dagli account personali?
- Quale relazione futura collega `shops`, `staff_accounts`, `roles`, `permissions` e `devices`?
- `TASK-005` deve leggere solo dati platform/globali o anche viste shop-scoped aggregate?

Vincoli:

- Non fondere account personali, staff POS e platform admin in un unico concetto implicito.
- Non introdurre decisioni che blocchino la futura console Shop Admin.
- Non modificare UI runtime o POS in questo task.

Esito atteso: decisione che preserva compatibilita con Shop Admin, staff POS e device management futuri.

### DEC-005B-10 - Naming, ownership e migration posture dei read model

Domande:

- I read model Admin Web saranno tabelle native, viste, RPC o layer server-only sopra schema reale?
- Chi possiede naming, contratti e semantica dei read model: Admin Web, Supabase shared workspace o mobile?
- Le migration future saranno forward-only, con rollback documentale/manuale o con script reversibili?
- Quali oggetti devono restare non esposti alla Data API pubblica?

Vincoli:

- Il piano non deve inventare nomi definitivi di colonne, policy o query.
- Ogni read model futuro deve avere owner, boundary e test di autorizzazione.
- Le viste future, se esposte, devono rispettare RLS o usare `security_invoker` quando applicabile.

Esito atteso: naming/read-model ownership e postura migration approvati prima di execution `TASK-005`.

## 7. Opzioni architetturali

### Opzione A - Nuove tabelle Admin Web native

Entita candidate:

- `profiles`
- `shops`
- `shop_members`
- `roles`
- `permissions`
- `audit_logs`
- eventuale legame futuro con inventory/mobile

Vantaggi:

- Allineata al Master Plan Admin Web e ad ADR-001.
- Rende chiara la root `shops`.
- Separa membership web, staff POS e platform admin.
- Facilita audit log Admin Web separato dagli eventi di sync.

Rischi:

- Richiede nuove migration future e review RLS completa.
- Richiede mapping esplicito verso dati mobile esistenti.
- Rischio duplicazione concetti utente/owner se `owner_user_id` non viene mappato bene.

Impatto Android/iOS:

- Basso se le tabelle native non cambiano `inventory_*`.
- Serve evitare nuove FK o vincoli che blocchino sync mobile.

Impatto Admin Web:

- Forte: fornisce fondazione coerente per Platform/Shop Admin.

Impatto Shop Admin futuro:

- Positivo se `shops`, membership, staff POS, ruoli, permessi e dispositivi restano shop-scoped.
- Richiede attenzione a non trasformare Platform Admin in gestore ordinario di staff/POS.

Impatto RLS:

- Richiede policy global/shop-scoped nuove e test dedicate.

Compatibilita con Master Plan:

- Alta.

Prerequisiti:

- Decisione schema dedicata.
- Migration reviewate.
- Env template, tipi `Database`, boundary server-side.

Raccomandazione provvisoria:

- Valida come direzione dominio, ma non sufficiente da sola per leggere inventory mobile.

### Opzione B - Read model sopra schema mobile esistente

Entita/fonti candidate:

- `owner_user_id`;
- `inventory_*`;
- `inventory_product_prices`;
- `shared_sheet_sessions`;
- `sync_events`;
- viste o read model server-side.

Vantaggi:

- Riusa dati Supabase/mobile gia esistenti.
- Minore schema iniziale se l'obiettivo e solo osservazione tecnica.
- Potrebbe sbloccare una dashboard read-only limitata piu rapidamente.

Rischi:

- Non rispetta da sola il modello `shops` come root.
- Rischio di trattare `owner_user_id` come shop senza decisione.
- `platform_admin` global read resta non definito.
- `sync_events` rischia di essere scambiato per `audit_logs`.

Impatto Android/iOS:

- Basso se read model e solo server-side.
- Alto se si cambiano tabelle o policy mobile.

Impatto Admin Web:

- Potrebbe produrre viste parziali non coerenti con Platform Admin.

Impatto Shop Admin futuro:

- Fragile se il read model mobile non introduce esplicitamente `shops`, membership, staff POS, ruoli e dispositivi.
- Rischia di lasciare la futura Shop Admin Console senza boundary coerente.

Impatto RLS:

- Complesso: servono regole global read senza indebolire owner-scoped mobile.

Compatibilita con Master Plan:

- Parziale.

Prerequisiti:

- Verifica schema/live approvata.
- Decisione su lettura globale.
- Read model server-side con redazione e paginazione.

Raccomandazione provvisoria:

- Usabile solo come supporto/ponte, non come dominio Admin Web completo.

### Opzione C - Ibrida

Direzione:

- Introdurre `profiles` / `shops` / `shop_members` come dominio Admin Web.
- Preservare `inventory_*` owner-scoped per Android/iOS.
- Collegare inventory mobile a shop tramite mapping esplicito o read model approvato.
- Mantenere Room/mobile compatibile e offline-first.
- Usare boundary server-side per letture platform read-only.

Vantaggi:

- Allinea Admin Web al Master Plan senza rompere mobile.
- Non finge che `owner_user_id` sia gia `shop_id`.
- Permette una transizione incrementale.
- Rende esplicito il ponte tra account owner mobile e negozio.

Rischi:

- Richiede una decisione mapping accurata.
- Richiede doppia attenzione RLS: mobile owner-scoped e admin platform/shop-scoped.
- Potrebbe richiedere viste/read model per performance e sicurezza.

Impatto Android/iOS:

- Contenuto se le tabelle mobile restano compatibili.

Impatto Admin Web:

- Forte: prepara `TASK-005` con dominio leggibile e UI states onesti.

Impatto Shop Admin futuro:

- Positivo se il mapping preserva `shops` come root e mantiene staff POS/dispositivi sotto Shop Admin.
- Richiede contratto esplicito per evitare ambiguita tra owner mobile, membro shop e staff operativo.

Impatto RLS:

- Richiede review dedicata, ma rende chiari gli scope.

Compatibilita con Master Plan:

- Alta.

Prerequisiti:

- Decisione `owner_user_id` -> `profile`/`shop`.
- Decisione `platform_admin`.
- Schema/read model approvati.
- Env/template/tipi/client server-side in task futuri.

Raccomandazione provvisoria:

- Opzione raccomandata per la prossima decisione, senza implementazione in questo task.

### Mini-matrice decisionale

| Opzione | Sicurezza | Compatibilita mobile | Coerenza prodotto | Velocita | Rischio tecnico | Sblocco TASK-005 |
| --- | --- | --- | --- | --- | --- | --- |
| A - Native Admin Web | Alta se RLS nuova e verificata | Alta se non tocca `inventory_*` | Alta | Media-bassa | Medio | Possibile solo dopo schema/migration Admin Web |
| B - Riuso mobile diretto | Media-bassa finche manca global-read sicuro | Media se non cambia policy mobile | Bassa-parziale | Alta apparente | Alto | Non consigliato senza mapping owner/shop e RLS platform |
| C - Ibrida | Alta se boundary e read model sono approvati | Alta | Alta | Media | Medio | Miglior candidata dopo decisioni 005B approvate |

### Condizioni per rendere approvabile l'opzione ibrida

- Fonte autorevole di `profile`, `shop`, membership e `platform_admin` decisa.
- Mapping `owner_user_id` -> `shop_id` approvato o stato `unmapped/not_configured` definito.
- Read model platform/shop-scoped definito come contratto documentale prima di migration.
- RLS e server boundary approvati con test futuri espliciti.
- Policy per dati mobile legacy/non mappati accettata.
- Compatibilita futura Shop Admin, Staff POS e dispositivi non compromessa.

## 8. Raccomandazione provvisoria

Direzione consigliata: Opzione C - Ibrida.

Regole prudenziali:

- Non rompere il modello mobile owner-scoped.
- Non fingere che `owner_user_id` sia gia `shop_id`.
- Mantenere `shops` come root Admin Web.
- Introdurre mapping esplicito solo dopo decisione.
- `platform_admin` deve essere verificato lato server.
- Global read non deve bypassare RLS in modo insicuro.
- `TASK-005` resta bloccato finche questa decisione non e approvata e tradotta in prerequisiti reali.

## 9. Schema candidate planning

Questa sezione elenca entita candidate, non colonne definitive e non migration.

Entita candidate Admin Web:

- `profiles`
- `shops`
- `shop_members`
- `platform_admins` o equivalente decisione server-side
- `roles`
- `permissions`
- `audit_logs`
- eventuale mapping `shop_inventory_sources` o equivalente

Entita mobile da preservare:

- `inventory_suppliers`
- `inventory_categories`
- `inventory_products`
- `inventory_product_prices`
- `shared_sheet_sessions`
- `sync_events`

Regole:

- Non scrivere migration SQL in `TASK-005B`.
- Non definire colonne definitive.
- Non inventare policy finali.
- Non trattare queste entita come schema reale Admin Web.
- Separare sempre proposta futura da schema gia verificato.

## 10. Boundary server/client

Piano boundary futuro:

- Browser/client: solo UI, stato, comandi non sensibili e rendering.
- Data access Admin Web: server-side.
- Verifica `platform_admin`: lato server.
- Nessun secret nel client.
- Nessuna service-role key nel client.
- Mappers espliciti da schema reale a view model.
- Nessun direct DB access da componenti client sensibili.
- Nessun coupling diretto UI-database.
- Nessun fallback mock spacciato per live.

File candidati futuri, non da creare in questo task:

- `src/lib/supabase/server.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/mappers.ts`
- `src/server/platform-admin/authz.ts`

## 11. RLS e sicurezza

Requisiti futuri:

- RLS obbligatoria su tabelle esposte.
- Policy shop-scoped per dati legati a `shop_id`.
- Policy owner-scoped mobile da preservare.
- Global read per `platform_admin` solo tramite decisione approvata e boundary server-side.
- Nessuna query basata solo su input client.
- Nessun uso di `user_metadata` per autorizzazioni.
- Nessun token/PIN/password/secret nei report.
- Nessuna anon key reale nei documenti o negli esempi.
- Nessun `.env` reale letto o stampato.
- Nessuna service-role key client.
- Audit log futuro per azioni sensibili.
- Redazione evidence e log.

Dati test ed evidence:

- Usare solo dati sintetici o redatti nei report.
- Non riportare email reali, token, JWT, refresh token, password, PIN, connection string o secret.
- Se servono esempi futuri, usare prefissi espliciti come `example_`, `synthetic_` o valori mascherati.
- Classificare ogni evidence come documentale, locale verificata, live verificata o non eseguita.
- Non stampare file `.env`, `local.properties`, plist di configurazione o output contenenti segreti.

Gate sicurezza:

- Se non e chiaro chi e `platform_admin`, `TASK-005` resta bloccato.
- Se RLS non e verificata, `TASK-005` resta bloccato.
- Se il read model richiede privilegi globali non auditati, `TASK-005` resta bloccato.

## 12. UI/UX impact

Pianificazione per `TASK-005`:

- Se dati live non disponibili: mostrare stato `Not configured`, non dati finti.
- Se mapping shop non definito: bloccare la lettura shop/inventory live con messaggio chiaro.
- Se audit log non disponibile: stato `Audit not configured` o equivalente.
- Se utente non e `platform_admin`: stato `Unauthorized` senza leak di dati.
- Se dato e mobile-owner-scoped e non shop-scoped: etichettarlo come non ancora mappato.
- Badge richiesti: `Mock`, `Live`, `Not configured`.
- Nessuna dashboard finta come dati live.
- Messaggi chiari per operator/admin.
- Stati bloccati leggibili anche per reviewer/agent: motivo, impatto e prossimo passo.
- Safe operations e `TASK-006` restano fuori scope.

## 13. Performance

Piano performance futuro:

- Paginazione obbligatoria per liste globali.
- No fetch globali enormi.
- No N+1.
- Summary separati da liste dettagliate.
- Cache solo se coerente con auth e permessi.
- Niente prefetch dati sensibili.
- Letture platform read-only con limiti espliciti.
- Query e viste/read model da verificare su schema reale prima di UI live.

## 14. Testabilita

Test futuri da pianificare:

- mapper schema reale -> view model;
- RLS/read-only;
- no service-role client;
- no mutation;
- unauthorized;
- empty state;
- audit unavailable;
- schema mismatch;
- mock/live distinction;
- build/lint/typecheck;
- smoke UI solo quando runtime/UI cambia.

Check futuri possibili:

- scan dipendenze `@supabase/*`;
- scan service-role/client;
- scan mutation nei file read-only;
- test su boundary server-only;
- test paginazione e stati errore.

## 15. Tooling e harness

Script presenti in `package.json`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run verify`
- `npm run test:e2e`
- `npm run test:e2e:headed`
- `npm run test:e2e:ui`
- `npm run test:ui-smoke`
- `npm run playwright:install`
- `npm run verify:full`

Follow-up tooling pianificabili, non da creare qui:

- scan Supabase schema/client/env;
- check no service-role client;
- check read-only/no mutations;
- evidence report standardizzato;
- check coerenza task/MASTER-PLAN;
- schema-diff documentale tra Admin Web e mobile Supabase;
- redaction scan per evidence/report.

## 16. Evidence plan

Per sbloccare `TASK-005` serviranno:

- migration reali o schema verificato;
- schema target Admin Web approvato;
- env template senza valori reali;
- tipi `Database` generati da schema reale;
- decisione `platform_admin`;
- RLS/policy review;
- mapping `owner_user_id` -> shop o decisione alternativa;
- read model/vista/tabelle native approvate;
- evidence no secret;
- evidence no service-role client;
- evidence no mutation;
- piano di paginazione e stati UI.

Classificazione evidence richiesta:

- `CURRENT_REVIEW`: verificata nel workspace corrente durante il task/review.
- `HISTORICAL`: evidence da task precedenti, utile ma da riconfermare prima di execution.
- `EXTERNAL_LOCAL`: file locali Android/iOS/Supabase letti come fonte, non come schema Admin Web pronto.
- `LIVE_VERIFIED`: schema/policy confermati su Supabase live; non disponibile in questo task.
- `NOT_RUN`: verifica vietata, fuori scope o non applicabile, con motivo, impatto e prossimo passo.
- `BLOCKED`: verifica necessaria ma impossibile senza decisione/accesso/schema, con motivo, impatto e prossimo passo.

## 17. Criteri PASS/FAIL/BLOCKED/NOT_RUN/PASS_WITH_NOTES

- `PASS`: verifica completata con evidence reale.
- `PASS_WITH_NOTES`: verifica completata con warning non bloccante.
- `FAIL`: incoerenza, errore o rischio concreto da correggere.
- `BLOCKED`: manca decisione, schema, accesso, ambiente o evidence necessaria.
- `NOT_RUN`: fuori scope, vietato o non applicabile.

Regole:

- Ogni `BLOCKED` deve indicare motivo, impatto e prossimo passo.
- Ogni `NOT_RUN` deve indicare perche non e stato eseguito, piu impatto e prossimo passo se blocca un gate futuro.
- Nessun `PASS` puo essere inventato.

## 18. Criteri per REVIEW

`TASK-005B` puo essere considerato pronto per review documentale se:

- le opzioni sono chiare;
- le decisioni mancanti sono esplicite;
- non e stato implementato runtime;
- non sono state inventate colonne/policy finali;
- non anticipa execution `TASK-005` o azioni `TASK-006`;
- evidence plan e safety gate matrix sono completi;
- `PLANNED_BLOCKED`, `READY_FOR_REVIEW` e `BLOCKED` restano distinti;
- `TASK-005` resta bloccato correttamente;
- il prossimo passo e chiaro;
- check documentali richiesti passano.

Stato del piano dopo questa creazione:

- Piano: `READY_FOR_REVIEW`.
- Stato task: `PLANNED_BLOCKED`.
- Execution: `BLOCKED`.

## 19. Criteri per DONE

`TASK-005B` puo passare a `DONE` solo dopo:

- review positiva;
- conferma esplicita utente;
- decisione architetturale approvata o raccomandazione accettata;
- Master Plan coerente;
- `TASK-005` ancora bloccato finche i gate runtime non sono soddisfatti.

Stato alla chiusura: criteri soddisfatti su conferma esplicita utente. Codex non ha marcato il task `DONE` autonomamente.

## 20. Criteri per sbloccare TASK-005

`TASK-005` execution potra partire solo se:

- `TASK-005B` e chiuso o approvato con decisione sufficiente;
- decisione schema/boundary approvata;
- schema o migration esistono;
- env template pronto;
- tipi `Database` disponibili o generabili;
- `platform_admin` server-side definito;
- RLS/read-only policy verificate;
- nessun blocker sicurezza;
- nessuna service-role key client;
- read-only scope confermato.

## 21. Safety gate matrix

| Gate | Stato attuale | Motivazione | Prossimo passo |
| --- | --- | --- | --- |
| `TASK-005A` chiuso | `PASS` | Riallineamento source gia confermato `DONE` | Usarlo come evidence, non come runtime |
| `TASK-005B` piano | `DONE` | Piano decisionale chiuso su conferma esplicita utente; execution resta bloccata | Usarlo come decisione, non come runtime |
| `TASK-005` execution | `BLOCKED` | Mancano schema Admin Web, boundary, RLS, env, tipi e `platform_admin` | Non eseguire finche i gate non sono approvati/verificati |
| Schema Admin Web | `BLOCKED` | Nessuna migration/schema reale nella repo Admin Web | Decidere schema/read model in task dedicato |
| Mapping owner/shop | `BLOCKED` | `owner_user_id` mobile non equivale automaticamente a `shop_id` | Approvare mapping o stato `unmapped/not_configured` |
| `platform_admin` | `BLOCKED` | Nessuna fonte server-side autorevole definita | Scegliere tabella/membership/claim server-side verificabile |
| RLS/policy | `BLOCKED` | Policy platform/shop-scoped non esistono in Admin Web | Review RLS su schema reale prima di query live |
| Server boundary | `BLOCKED` | Nessun client/server Supabase creato | Definire boundary prima di installare/creare client |
| Env/types | `BLOCKED` | Nessun env template Supabase e nessun tipo `Database` | Preparare template e generazione tipi in task futuro |
| Security/secrets | `PASS_WITH_NOTES` | Piano vieta lettura/stampa segreti; serve scan futuro quando esistono file runtime | Aggiungere redaction/no-secret check al task execution |
| Read-only/no mutations | `BLOCKED` | Nessuna query runtime esiste; scope read-only da tradurre in test futuri | Definire harness per scan mutation e autorizzazioni |
| UI states | `PLANNED` | Piano richiede not-configured/unauthorized/error/empty, ma UI runtime non cambia qui | Implementare solo quando TASK-005 sara sbloccato |
| Evidence current/live | `BLOCKED` | Live Supabase non interrogato per vincolo di task | Raccogliere evidence live solo in task autorizzato |

## 22. Fuori scope

- Nessuna migration.
- Nessun client Supabase.
- Nessuna installazione dipendenze.
- Nessun login/auth.
- Nessun CRUD.
- Nessuna UI runtime.
- Nessuna query live.
- Nessun Supabase live.
- Nessuna service-role client.
- Nessuna modifica Android/iOS.
- Nessuna modifica al modello mobile senza task dedicato.
- Nessuna execution `TASK-005`.
- Nessuna anticipazione `TASK-006`.

## 23. Handoff

### Stato finale

- `TASK-005B`: `DONE`.
- Piano decisionale: completo e chiuso su conferma esplicita utente.
- Execution runtime: `BLOCKED`.
- `TASK-005`: resta `PLANNED_BLOCKED`.

### File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005B-admin-web-supabase-domain-mapping-boundary-decision.md`

### Check eseguiti

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree documentale: `M docs/MASTER-PLAN.md`; task docs `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `docs/MASTER-PLAN.md`; i task docs non tracciati non compaiono nello stat Git standard. |
| `git diff --check` | `PASS` | Nessun output. |

### Check non eseguiti

- `npm run build`: `NOT_RUN`, vietato dal task planning.
- `npm run verify`: `NOT_RUN`, vietato dal task planning.
- `npm run lint`: `NOT_RUN`, vietato dal task planning.
- `npm run typecheck`: `NOT_RUN`, vietato dal task planning.
- Playwright/test runtime: `NOT_RUN`, vietato e nessuna UI/runtime modificata.
- Supabase live/migration/seed: `NOT_RUN`, vietato.

### Rischi residui

- Stato live Supabase corrente non interrogato.
- Mapping `owner_user_id` -> `shop_id` non deciso.
- `platform_admin` non definito server-side.
- `sync_events` non e audit log Admin Web.
- Schema Admin Web reale non esiste.
- RLS platform/shop-scoped non esiste.
- Env template e tipi `Database` assenti.

### Raccomandazione

Usare la decisione `TASK-005B` come base per un task successivo dedicato a mapping/schema/boundary; non aprire execution `TASK-005` finche i gate runtime non sono soddisfatti.

### Prossimo passo

Aprire un task successivo dedicato a mapping/schema/boundary approvato prima di rivalutare `TASK-005`.

### Conferme

- Nessun commit eseguito.
- Nessuna execution runtime eseguita.
- Nessun Supabase live usato.
- Nessuna migration creata.
- Nessun client Supabase creato.
- Nessun secret letto, stampato o inserito.
- Nessuna UI runtime modificata.
- Nessun build/test runtime eseguito.
- Nessun `npm run verify/lint/typecheck/build` eseguito in questa planning review.
- Nessuna service-role key esposta.
- Nessun dato reale collegato alla UI.
- Nessuna repo Android/iOS modificata.
- Nessuna execution `TASK-005` autorizzata.

## Planning review addendum

Verdict documentale: `READY_FOR_REVIEW`.

Chiarimento stati:

- `TASK-005B` era `PLANNED_BLOCKED` come stato operativo durante la review perche non eseguiva runtime e dipendeva da decisione utente.
- Il piano `TASK-005B` e passato da `READY_FOR_REVIEW` a `DONE` dopo conferma esplicita utente.
- `TASK-005` resta `PLANNED_BLOCKED` e non passa a execution.

Miglioramenti integrati in review:

- aggiunte decisioni su lifecycle dati mobile/legacy, compatibilita Shop Admin/Staff POS/dispositivi e ownership/naming/migration posture dei read model;
- aggiunta mini-matrice Opzione A/B/C con condizioni per rendere approvabile l'opzione ibrida;
- rafforzata policy evidence/redazione dati e separazione current/historical/external/local/live;
- rafforzate regole `BLOCKED`/`NOT_RUN` con motivo, impatto e prossimo passo;
- aggiunta safety gate matrix per TASK-005A, TASK-005B, TASK-005, schema, mapping, `platform_admin`, RLS, boundary, env/tipi, sicurezza, read-only, UI states ed evidence.

## Final planning gate review addendum

Verdict final gate documentale: `READY_FOR_REVIEW`.

Esito:

- Nessun blocker documentale residuo trovato.
- `TASK-005B` era `PLANNED_BLOCKED` come task operativo durante il final gate.
- Il piano e stato poi confermato e chiuso come `DONE`.
- Execution runtime resta `BLOCKED`.
- `TASK-005` resta `PLANNED_BLOCKED`.
- `TASK-005B` non chiude automaticamente le decisioni architetturali: le rende verificabili per approvazione utente/reviewer.

Check final planning gate:

| Comando/controllo | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree documentale: `M docs/MASTER-PLAN.md`; task docs `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `docs/MASTER-PLAN.md`; i task docs non tracciati non compaiono nello stat Git standard. |
| `git diff --check` | `PASS` | Nessun output. |
| Scan runtime Supabase Admin Web | `PASS` | Nessun `@supabase/*`, `createClient`, client Supabase, migration SQL, cartella `supabase/`, env template o tipo `Database` trovato in runtime Admin Web. |
| Script runtime/npm | `NOT_RUN` | Vietati dalla Final Planning Gate Review e non necessari per modifiche solo documentali. |
| Supabase live/migration/seed | `NOT_RUN` | Vietati dal task; nessun uso live autorizzato. |

Rafforzamenti final gate integrati:

- impatto Shop Admin futuro esplicitato per le opzioni A/B/C;
- divieto esplicito di anon key reali nei documenti/esempi;
- divieto esplicito di coupling diretto UI-database;
- requisiti UI/UX estesi a stati bloccati leggibili per reviewer/agent;
- criteri `REVIEW` rafforzati con evidence plan, safety gate, distinzione stati e divieto di anticipare `TASK-005`/`TASK-006`;
- conferme finali estese a no build/test runtime, no npm verify/lint/typecheck/build, no service-role esposta, no dati reali UI e no modifiche Android/iOS.

## Decision approval review addendum

Verdict decisionale: `READY_FOR_DONE_CONFIRMATION`.

Esito review:

- Il piano e completo come decision/planning task.
- La raccomandazione Opzione C - Ibrida e accettabile come direzione prudente, non come autorizzazione a eseguire runtime.
- Le decisioni `DEC-005B-01` -> `DEC-005B-10` sono sufficientemente chiare per review utente/reviewer.
- `TASK-005B` puo passare a `DONE` solo con conferma esplicita utente.
- `TASK-005` resta `PLANNED_BLOCKED` e non passa a execution.
- Nessun task viene marcato `DONE` da Codex.

Motivazione:

- Opzione C mantiene `shops` come root Admin Web e preserva il modello mobile owner-scoped.
- Il piano non tratta `owner_user_id` come `shop_id` senza mapping esplicito.
- `platform_admin` resta server-side e non basato su client state, mock, URL o email hardcoded lato client.
- `sync_events` resta separato da `audit_logs`; se audit Admin Web manca, lo stato futuro deve essere `Audit not configured`.
- I gate per schema, migration, env template, tipi `Database`, RLS, boundary, read-only/no mutation ed evidence sono bloccanti prima di `TASK-005`.

Check decision approval:

| Comando/controllo | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree documentale: `M docs/MASTER-PLAN.md`; task docs `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `docs/MASTER-PLAN.md`; i task docs non tracciati non compaiono nello stat Git standard. |
| `git diff --check` | `PASS` | Nessun output. |
| Governance Master Plan/task | `PASS` | Un solo task attivo: `TASK-005B`; `TASK-004` e `TASK-005A` sono `DONE`; `TASK-005` resta `PLANNED_BLOCKED`. |
| Supabase runtime Admin Web | `PASS` | Nessun client, migration, env template, tipi `Database`, dipendenza `@supabase/*`, query live o UI data binding reale introdotti. |
| Build/test/npm/runtime | `NOT_RUN` | Vietati dalla review decisionale e non necessari per modifiche solo documentali. |
| Supabase live/migration/seed | `NOT_RUN` | Vietati dalla review decisionale; nessun uso live autorizzato. |

Condizione finale:

- E stato proposto a `READY_FOR_DONE_CONFIRMATION` e poi confermato dall'utente.
- Puo passare a `DONE` per conferma esplicita utente.
- Non puo sbloccare `TASK-005` senza decisioni e verifiche runtime reali su schema, auth/RLS, boundary, env/tipi e `platform_admin`.
- Prossimo passo consigliato: aprire un task successivo dedicato a mapping/schema/boundary approvato prima di rivalutare `TASK-005`.

## Chiusura DONE

- Chiusura confermata esplicitamente dall'utente.
- Stato finale: `DONE`.
- Scope chiuso: decision/planning Admin Web Supabase Domain Mapping / Boundary Decision.
- Raccomandazione accettata: Opzione C - Ibrida come direzione prudente.
- Nessuna execution runtime introdotta.
- Nessun client Supabase creato.
- Nessuna migration creata.
- Nessun dato reale collegato alla UI.
- Nessun login/auth/CRUD introdotto.
- Nessuna modifica UI runtime introdotta.
- Nessuna modifica Android/iOS introdotta.
- `TASK-005` resta `PLANNED_BLOCKED`.
- `TASK-005` potra essere rivalutato solo dopo schema/boundary/RLS/env/tipi/`platform_admin` approvati e verificabili.
- Prossimo passo consigliato: aprire un task successivo dedicato a mapping/schema/boundary approvato prima di rivalutare `TASK-005`.
