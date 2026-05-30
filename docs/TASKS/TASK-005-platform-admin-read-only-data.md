# TASK-005 - Platform Admin Read-only Data

## Informazioni generali

- ID: `TASK-005`
- Titolo: Platform Admin Read-only Data
- Stato iniziale: `PLANNED_BLOCKED`
- Stato attuale: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / GLOBAL_REVIEW_001`
- Dipendenza completata: `TASK-004 - Supabase Schema Discovery / Planning` e `DONE` su conferma esplicita utente. I prerequisiti Supabase/live sono stati completati fino a `TASK-005K`; `TASK-005L` ha rieseguito la review globale e chiuso `TASK-005` a `DONE` con approvazione esplicita utente nel prompt `GLOBAL-REVIEW-001`.
- File Master Plan: `docs/MASTER-PLAN.md`

## Scopo

Collegare la `Platform Admin Console` a letture dati reali read-only, solo dopo prerequisiti reali su schema Supabase, auth, RLS, client/server boundary, env template e tipi `Database`.

Questo piano originario non autorizzava execution runtime. Gli addendum fino a `TASK-005K` documentano l'execution autorizzata e verificata; non autorizzano CRUD, safe operation o `TASK-006`.

## Stato iniziale repo-grounded

### Stato task

- `TASK-001`: `DONE`.
- `TASK-002`: `DONE`.
- `TASK-003`: `DONE`.
- `TASK-004`: `DONE` su conferma esplicita utente.
- `TASK-005`: `PLANNED_BLOCKED` nel Master Plan; planning review consentita, execution bloccata dai prerequisiti Supabase mancanti.

### Stato Supabase reale

Non esiste integrazione Supabase reale nel repository.

Assenze confermate:

- nessuna cartella `supabase/`;
- nessuna migration SQL;
- nessun client Supabase;
- nessun tipo generato `Database`;
- nessuna dipendenza `@supabase/*`;
- nessun env template Supabase;
- nessuna policy RLS reale;
- nessuna funzione SQL/RPC/trigger reale;
- nessuna auth SSR configurata;
- nessun audit log backend reale.

### Stato UI Platform Admin

- Route App Router presenti:
  - `src/app/platform/page.tsx`
  - `src/app/platform/users/page.tsx`
  - `src/app/platform/shops/page.tsx`
  - `src/app/platform/audit/page.tsx`
  - `src/app/platform/system/page.tsx`
  - `src/app/platform/operations/page.tsx`
- Shell e componenti sotto `src/components/platform`.
- `src/components/platform/PlatformPage.tsx` mostra pattern statici per metriche, tabella, empty/loading/error visuale e operazioni disabilitate.
- `src/components/platform/platformData.ts` consuma mock sintetici da `src/domain/platform-admin`.

### Stato mock data

- Tipi dominio presenti in `src/domain/platform-admin/types.ts`.
- Mock sintetici privacy-safe presenti in `src/domain/platform-admin/mock.ts`.
- Export presenti in `src/domain/platform-admin/index.ts`.
- I mock non sono schema Supabase e non devono essere trattati come dati live.

### Stato script/harness

Script disponibili in `package.json`:

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

## Dipendenze bloccanti

`TASK-005` non puo entrare in execution finche mancano:

- schema Supabase reale o migration reviewate;
- auth SSR;
- RLS;
- client/server boundary;
- tipi generati `Database`;
- env template senza valori reali;
- policy di accesso per `platform_admin`;
- decisione su come identificare `platform_admin` lato server;
- audit log leggibile, oppure decisione esplicita che l'audit resti non disponibile con UI state dedicato.

Stato corrente: `BLOCKED_BY_SUPABASE_PREREQUISITES_MISSING`.

## Dati read-only previsti

Questa sezione e proposta futura, non query definitiva e non schema reale.

Da leggere solo se disponibili nello schema reale:

- profili personali;
- shops;
- membership e owner/manager per shop;
- ruoli globali e shop-scoped;
- audit log;
- system status, solo se disponibile nello schema reale o derivabile da stato applicativo verificabile senza inventare dati live.

Regole:

- non inventare colonne;
- non inventare query definitive;
- non inventare policy;
- non leggere dati reali finche schema/auth/RLS/boundary non sono verificati;
- non usare mock come fallback implicito a dati live;
- se si usa mock in futura UI, deve essere etichettato chiaramente come `Mock`.

## Boundary architetturale

### Client

- Render UI e stati `loading`, `error`, `empty`, `unauthorized`.
- Mai service-role key.
- Mai decisioni finali di autorizzazione basate solo su input client.
- Nessun accesso cross-shop non autorizzato.

### Server

- Inizializzazione futura client Supabase server-side, solo dopo decisione approvata.
- Verifica `platform_admin` lato server.
- Validazione finale di ruoli/permessi.
- Letture read-only con scope esplicito e paginazione.

### Database

- RLS obbligatoria.
- Ownership e filtri su `shop_id` / `shop_code` quando dati shop-scoped sono coinvolti.
- Policy globali limitate a platform admin verificati.

## Strategia data access futura

File candidati per futura execution, non da creare ora:

- `src/lib/supabase/server.ts`: solo se Supabase SSR viene autorizzato.
- `src/server/platform-admin/read-model.ts`: read model server-side per query read-only platform.
- `src/server/platform-admin/mappers.ts`: mapper da schema reale a tipi dominio/UI.
- `src/components/platform/platformData.ts`: da mantenere come adapter UI o da ridurre gradualmente, evitando coupling diretto UI-database.

Principi:

- layer piccoli e verificabili;
- mapping esplicito da schema reale a view model;
- nessun fetch diretto dai componenti client se richiede autorizzazione sensibile;
- fallback mock solo dichiarato e visibile;
- separare summary dashboard da liste dettagliate.

## UI/UX plan

La futura execution deve gestire:

- loading state per ogni sezione dati;
- error state con messaggio chiaro e non tecnico;
- empty state per lista shops vuota, profili assenti e audit log non configurato;
- unauthorized state quando l'utente non e platform admin;
- dati non disponibili senza inventare righe live;
- badge chiaro `Mock` vs `Live`;
- nessuna dashboard finta spacciata per dati reali;
- distinzione visiva tra dati globali e shop-scoped;
- messaggi chiari per platform admin;
- responsive desktop/tablet;
- focus visibile, label, keyboard navigation e contrasti ragionevoli;
- safe operations sempre disabilitate o fuori scope in `TASK-005`.

## Sicurezza

- Nessun secret nel repository.
- Nessun valore reale `.env` letto o stampato nei report.
- Nessuna service-role key lato client.
- Nessuna lettura cross-shop non autorizzata.
- RLS obbligatoria prima di dati live.
- `platform_admin` verificato lato server.
- Dati sensibili redatti nei report.
- Audit log read-only.
- Nessun PIN, password, token o secret nei log.
- Nessuna query basata solo su input client-controllable.
- Nessuna scrittura, mutation, CRUD o safe operation.

## Performance

- Query read-only limitate e paginate.
- Evitare fetch globali enormi.
- Evitare N+1.
- Separare summary dashboard da liste dettagliate.
- Loading progressivo.
- Cache solo se coerente con auth e permessi.
- Nessun prefetch di dati sensibili non necessari.
- Nessuna lettura globale non filtrata per dati shop-scoped.

## Testabilita

Check futuri:

- unit test mapper, solo se runner coerente disponibile o aggiunto in task separato approvato;
- `npm run lint`;
- `npm run typecheck`;
- `npm run verify`;
- `npm run build`, se non gia incluso in `verify`;
- `npm run test:ui-smoke`, se UI/runtime cambia;
- test stati loading/error/empty/unauthorized;
- test nessuna service-role key client;
- test nessun secret in report;
- test read-only: nessuna action mutation;
- test Supabase/RLS solo quando schema e ambiente sono disponibili.

## Automazione e harness

Usare in futura execution gli script esistenti prima di creare tool nuovi:

- `git diff --check`;
- `git status --short`;
- `npm run lint`;
- `npm run typecheck`;
- `npm run verify`;
- `npm run test:ui-smoke`, se UI/runtime cambia.

Follow-up separati, non da implementare in planning:

- secret/redaction scan;
- Supabase schema/client/env scan;
- evidence report standardizzato;
- check read-only/no mutations;
- check no service-role client;
- check coerenza Master Plan/task.

## Evidence plan

La futura execution deve documentare:

- file letti;
- discovery Supabase;
- prerequisiti mancanti o soddisfatti;
- comandi eseguiti con risultati reali;
- comandi `NOT_RUN` e motivazione;
- screenshot/smoke UI se cambia UI/runtime;
- risultati check;
- rischi residui;
- cleanup dati test, se creati in ambiente autorizzato;
- conferma redazione secret.

## Criteri PASS/FAIL/BLOCKED/NOT_RUN/PASS_WITH_NOTES

- `PASS`: controllo completato con risultato verificabile.
- `PASS_WITH_NOTES`: controllo completato con warning non bloccante.
- `FAIL`: controllo eseguito e fallito, da correggere.
- `BLOCKED`: controllo impossibile per mancanza prerequisito reale.
- `NOT_RUN`: controllo non eseguito perche fuori scope, vietato o non applicabile.

Ogni `BLOCKED` e `NOT_RUN` deve indicare motivo, impatto e prossimo passo.

## Criteri per REVIEW

`TASK-005` plan puo andare in `REVIEW` se:

- completamento di `TASK-004` e blocchi residui Supabase sono chiari;
- prerequisiti mancanti sono documentati;
- read-only scope e chiaro;
- non sono state inventate tabelle/colonne;
- non e stata eseguita execution;
- safety gate sono definiti;
- evidence plan e completo;
- check documentali passano.

## Criteri per futura Execution

La futura execution puo partire solo se:

- `TASK-005` plan e approvato;
- schema/auth/RLS/boundary/env/tipi sono disponibili, oppure il task viene ridotto esplicitamente a foundation readiness;
- non ci sono blocker;
- scope read-only e confermato.

## Criteri per DONE

`TASK-005` non puo essere `DONE` solo perche questo piano esiste.

`DONE` richiedera:

- implementazione read-only completata;
- dati reali letti solo con schema verificato;
- RLS/auth/boundary verificati;
- UI states implementati;
- check passati;
- evidence completa;
- review positiva;
- conferma esplicita utente.

## Fuori scope

- scritture;
- CRUD;
- safe operations;
- creazione shop;
- sospensione/riattivazione shop;
- cancellazione logica;
- gestione PIN/password staff;
- gestione POS;
- creazione schema definitiva;
- migration definitive;
- service-role key client;
- dati finti spacciati per live;
- login/auth completo se non gia pronto;
- `TASK-006` actions.

## Rischi

- Schema Supabase assente.
- Auth SSR assente.
- RLS assente.
- Env template assente.
- Tipi `Database` assenti.
- Rischio coupling UI-database se non viene introdotto boundary server-side.
- Rischio letture globali non autorizzate.
- Rischio confusione mock/live.
- Rischio dashboard ingannevole.
- Rischio audit log non disponibile.

## Handoff / stato bloccato

- Stato finale piano: `PLANNED_BLOCKED`.
- Stato review/fix documentale: `READY_FOR_REVIEW`.
- Stato execution: `BLOCKED`.
- Motivo blocco execution: mancano schema/auth/RLS/boundary/env/tipi Supabase reali.
- Nota governance: `TASK-005` non e il task attivo nel tracking corrente del Master Plan; il progetto resta `IDLE` finche il piano non viene approvato per review/execution futura.
- File toccati:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- Comandi eseguiti:
  - `git status --short`
  - `git diff --stat`
  - discovery documentale con `find` e `rg`
- Comandi non eseguiti:
  - `npm run build`: `NOT_RUN`, vietato in planning.
  - `npm run verify`: `NOT_RUN`, vietato in planning.
  - `npm run lint`: `NOT_RUN`, vietato in planning.
  - `npm run typecheck`: `NOT_RUN`, vietato in planning.
  - Playwright runtime: `NOT_RUN`, vietato e UI/runtime non modificati.
  - Supabase live/migration/seed: `NOT_RUN`, prerequisiti assenti e vietato in planning.
- Evidence:
  - Supabase reale assente.
  - UI Platform Admin statica e mock-based.
  - Script harness esistenti documentati.
  - `TASK-005` execution bloccata dai prerequisiti Supabase mancanti.
- Rischi residui:
  - prerequisiti Supabase/auth/RLS/boundary mancanti;
  - task non eseguibile finche schema/auth/RLS/boundary/env/tipi non sono verificati o approvati.
- Prossimo passo:
  - revieware questo piano `TASK-005` e mantenerne bloccata la execution finche i prerequisiti Supabase non sono verificati o approvati.
- Nessun commit eseguito.

### Review/fix addendum

- Review/fix repo-grounded eseguita su piano `TASK-005` in modalita documentale.
- Nessuna UI/runtime, domain type, mock data, script, dependency, client Supabase, migration o env template modificati.
- `TASK-005` resta read-only e non anticipa `TASK-006`.
- `TASK-005` resta bloccato dai prerequisiti Supabase mancanti.
- Verdict massimo attuale del piano: `READY_FOR_REVIEW`.
- Verdict massimo attuale dell'execution: `BLOCKED`.
- Check review/fix eseguiti dopo il planning iniziale:
  - `git diff --check`: `PASS`.
  - `npm run verify`: `PASS_WITH_NOTES`; include `lint`, `typecheck` e `next build`; build completata con warning Node `[DEP0205] module.register() is deprecated`.
  - `npm run test:ui-smoke`: `NOT_RUN`, UI/runtime non modificati.
  - Supabase live/migration/seed: `NOT_RUN`, prerequisiti reali assenti.

### Planning review addendum

- Planning review eseguita dopo chiusura `TASK-004` a `DONE`.
- Corretto lo stato repo-grounded: `TASK-004` e completato; `TASK-005` resta `PLANNED_BLOCKED` solo per prerequisiti Supabase mancanti.
- Nessuna execution runtime, build, lint, typecheck, Playwright, Supabase live, migration, seed, install dipendenze o commit eseguiti durante questa planning review.
- I check runtime registrati nella sezione precedente sono evidence storica della review/fix precedente, non comandi rieseguiti in questa planning review.
- Verdict del piano: `READY_FOR_REVIEW`.
- Verdict execution: `BLOCKED`.

### Execution gate review addendum

- Execution gate review eseguita dopo conferma `TASK-004` a `DONE`.
- Gate decisionale: `BLOCKED_BY_SUPABASE_PREREQUISITES_MISSING`.
- Prerequisiti mancanti: schema Supabase reale o migration reviewate, auth SSR, RLS, client/server boundary, tipi `Database`, env template sicuro, decisione `platform_admin` server-side e audit log leggibile o UI state dedicato.
- Nessun codice runtime implementato perche il gate read-only live non e superato.
- Nessun client Supabase creato.
- Nessuna migration creata.
- Nessuna dipendenza `@supabase/*` aggiunta.
- Nessuna UI collegata a dati reali.
- Nessuna scrittura, CRUD, safe operation o azione `TASK-006` introdotta.
- Supabase live/migration/seed: `NOT_RUN`, prerequisiti reali e autorizzazione assenti.
- Prossimo passo operativo: aprire o approvare un task ridotto `TASK-005A - Supabase Foundation Readiness`, oppure fornire schema/auth/RLS/boundary/env/tipi approvati per sbloccare `TASK-005`.

### TASK-005I live gate review addendum

- TASK-005I aperto dopo `TASK-005H` per valutare se il read-only data scope puo diventare reviewabile.
- Esito ingresso da `TASK-005H`: `PASS_WITH_NOTES`, ma con gate critici ancora aperti.
- Gate gia superati da `TASK-005H`: migration registry, `supabase db push --linked --dry-run`, RLS/grants, session lifecycle SSR via Next.js 16 Proxy, read-only/static harness.
- Gate ancora bloccanti:
  - bootstrap reale del primo `platform_admin`: `BLOCKED_INPUT_REQUIRED`;
  - sessione browser reale Platform Admin: `BLOCKED_MANUAL_BROWSER_SESSION`;
  - audit persistente post-bootstrap: `BLOCKED_INPUT_REQUIRED`.
- Decisione: `TASK-005` resta `PLANNED_BLOCKED`.
- Verdict massimo attuale: `PASS_SERVER_ONLY_WITH_BLOCKERS`, non `PASS_LIVE_UI`.
- `TASK-005I` non ha eseguito completion UI/live, non ha scelto utenti reali, non ha creato dati o seed e non ha eseguito `TASK-006`.

### TASK-005J auth live gate addendum

- TASK-005J aperto per la pipeline sequenziale approvata: bootstrap reale `platform_admin`, sessione browser live, Figma/UI polish e solo dopo eventuale `TASK-006A`.
- Pre-flight git eseguito senza leggere `.env` reali.
- Verifica env runtime eseguita stampando solo `SET`/`MISSING`: assenti `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID`, `PLATFORM_ADMIN_BOOTSTRAP_EMAIL`, `PLATFORM_ADMIN_BOOTSTRAP_REASON`, `CONFIRM_PLATFORM_ADMIN_BOOTSTRAP`, credenziali browser e valori runtime Supabase.
- `npm run supabase:bootstrap-platform-admin` eseguito senza env ha restituito `BLOCKED_INPUT_REQUIRED` con exit code `2`.
- Decisione: Gate 1A resta `BLOCKED_INPUT_REQUIRED`; non e stato scelto alcun utente reale e non e stata eseguita alcuna mutazione remota.
- Gate 1B browser session: `NOT_RUN`, perche Gate 1A non passa e mancano credenziali browser env.
- Figma/UI polish: `NOT_RUN`, vietato senza Gate 1A/1B `PASS`.
- `TASK-006A`: `NOT_RUN` e non aperto, vietato senza read-only live verificato.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`; verdict massimo attuale: `BLOCKED`, non `PASS_LIVE_UI`.

### TASK-005J retry addendum

- Retry autorizzato con uso sicuro del Supabase remoto dev collegato e lettura interna di `.env*` senza stampare valori.
- Pre-flight: `git status --short`, `git diff --stat`, `git diff --check` eseguiti.
- Env runtime dopo processo + `.env*`: mancanti `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PLATFORM_ADMIN_TEST_EMAIL`, `PLATFORM_ADMIN_TEST_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` e input bootstrap espliciti.
- Query remota sequenziale su `auth.users`: esattamente 1 utente; identity redatta con fingerprint, nessuna email/UUID completo stampato.
- Bootstrap script aggiornato per fallback deterministico sull'unico `auth.users`, default reason redatta e output senza identita completa.
- Dry-run bootstrap con rollback: `PASS`.
- Apply bootstrap reale: `APPLIED`.
- Post-bootstrap SQL catalog verification: profilo/admin/auth user presenti, audit bootstrap presente, RLS su 6 tabelle, 6 policy SELECT, audit triggers 2, anon grants 0, grants mutativi `authenticated` 0, helper `is_platform_admin` filtra `revoked_at is null`.
- Read model aggiornato per evitare `Promise.all` e rispettare il divieto di query Supabase parallele.
- Auth UI/callback/logout implementati:
  - `src/lib/supabase/client.ts`
  - `src/components/auth/AuthForm.tsx`
  - `src/app/auth/login/page.tsx`
  - `src/app/auth/callback/route.ts`
  - `src/app/auth/logout/route.ts`
- Gate 1B resta `BLOCKED_MANUAL_BROWSER_SESSION`: mancano credenziali browser test, service-role env e runtime Supabase app; nessuna sessione browser live e stata verificata.
- Figma/UI polish: `NOT_RUN`, vietato senza `PASS_LIVE_UI`.
- `TASK-006A`: `NOT_RUN`, vietato senza read-only live verificato.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`; verdict massimo attuale: `PASS_SERVER_ONLY_WITH_MANUAL_UI_BLOCKER`, non `PASS_LIVE_UI`.

### TASK-005K live browser completion addendum

- TASK-005K ha completato il gate browser/sessione live rimasto aperto.
- Env runtime Supabase locale: `PRESENT`, con valori pubblici scritti solo in `.env.local` ignorato e service-role usato solo process/test runtime.
- Bootstrap platform_admin esistente: `ALREADY_ACTIVE`.
- Sessione browser live: `PASS_LIVE_UI`.
- Metodo browser: utente dev/test temporaneo creato via Auth Admin, bootstrap platform_admin redatto, login reale su `/auth/login`, verifica route Platform e cleanup utente a fine test.
- Route verificate: `/auth/login`, `/platform`, `/platform/users`, `/platform/shops`, `/platform/audit`, `/platform/operations`, `/auth/logout`, `/platform` post-logout.
- Read model: ancora read-only, nessuna mutazione Admin Web.
- Safe operations: restano disabilitate.
- Supabase remote checks: migration list, db push dry-run, db lint, security advisors e SQL catalog verification passati.
- Decisione: `TASK-005` passa da `PLANNED_BLOCKED` a `READY_FOR_REVIEW`.
- Nota governance: `DONE` richiede review positiva e conferma esplicita dell'utente.

### TASK-005L global review reconciliation addendum

- Data review: 2026-05-30.
- Review globale: `TASK-005L - Global Review / DONE Reconciliation`.
- Esito: `PASS_WITH_NOTES`.
- Fix applicato: hardening redirect auth `next` per bloccare path protocol-relative `//...`.
- Check rieseguiti in `TASK-005L`: `git diff --check`, `npm run test:foundation`, `npm run security:scan`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run verify`, `npm run test:ui-smoke`, `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth`, `npm audit`, Supabase migration list, db push dry-run, db lint, security advisors e SQL catalog verification read-only.
- Gate read-only live: `PASS`.
- Read model: ancora read-only; solo `.select()` con limiti server-side.
- Auth/RLS: platform admin verificato server-side; RLS/grants Admin Web verificati da catalogo remoto.
- Sicurezza: nessun secret salvato, nessun service-role client/browser, nessun mock dichiarato live.
- Scope: nessun CRUD, nessuna safe operation, nessuna execution `TASK-006`.
- Stato finale: `DONE`.
