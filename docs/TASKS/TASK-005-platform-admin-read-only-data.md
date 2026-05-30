# TASK-005 - Platform Admin Read-only Data

## Informazioni generali

- ID: `TASK-005`
- Titolo: Platform Admin Read-only Data
- Stato iniziale: `PLANNED_BLOCKED`
- Fase attuale: `PLANNING`
- Responsabile attuale: `CODEX / PLANNING HANDOFF`
- Dipendenza completata: `TASK-004 - Supabase Schema Discovery / Planning` e `DONE` su conferma esplicita utente. Execution resta bloccata dai prerequisiti Supabase reali mancanti.
- File Master Plan: `docs/MASTER-PLAN.md`

## Scopo

Collegare in futuro la `Platform Admin Console` a letture dati reali read-only, solo dopo prerequisiti reali su schema Supabase, auth, RLS, client/server boundary, env template e tipi `Database`.

Questo piano non autorizza execution runtime. Non crea client Supabase, migration, CRUD, login, server actions operative o collegamenti a dati reali.

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
