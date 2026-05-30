# TASK-004 - Supabase Schema Discovery / Planning

## Informazioni generali

- ID: `TASK-004`
- Titolo: Supabase Schema Discovery / Planning
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER / DONE CONFIRMED`
- Data apertura: `2026-05-30`
- File Master Plan: `docs/MASTER-PLAN.md`

## Scopo

Verificare lo stato reale dell'integrazione Supabase nel repository e preparare un piano sicuro per schema, RLS, client/server boundary, audit log, ruoli globali e ruoli shop-scoped.

Questo task e documentale/planning: non implementa Supabase, auth, CRUD, login, migration definitive o collegamenti a dati reali.

## Stato iniziale

- `TASK-001`: `DONE`.
- `TASK-002`: `DONE`.
- `TASK-003`: `DONE` nel Master Plan e nel file task, con responsabilita `USER / DONE CONFIRMED`.
- `TASK-004`: `PLANNED` nel Master Plan prima di questa inizializzazione.
- Worktree pre-flight iniziale:
  - `git status --short`: nessun output.
  - `git diff --stat`: nessun output.
  - Nessun file untracked rilevante rilevato dal pre-flight iniziale.

## Fonti e file verificati

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/supabase-security.md`
- `docs/TASKS/TASK-003-platform-admin-domain-types-mock.md`
- `package.json`
- `src/domain/platform-admin/types.ts`
- `src/domain/platform-admin/mock.ts`
- `src/domain/platform-admin/index.ts`
- Lista repo da `rg --files`
- Scan mirati:
  - `rg -n "supabase|createClient|Database|NEXT_PUBLIC_SUPABASE|SUPABASE|service[_-]?role|anon[_-]?key|RLS|row level|policy|migration" -S .`
  - `find . -path './node_modules' -prune -o \( -iname '*.sql' -o -iname '*supabase*' -o -path './supabase/*' -o -iname '*.env*' \) -print`
  - `find docs -maxdepth 3 -type f | sort`

## Risultato discovery Supabase

### Stato reale trovato

Non esiste integrazione Supabase reale nel repository allo stato attuale.

### Schema reale trovato

Nessuno schema Supabase reale trovato.

Non sono stati trovati:

- cartella `supabase/`;
- migration SQL;
- file `.sql`;
- client Supabase in `src/lib`, `src/utils`, `src/app` o percorsi equivalenti;
- tipi generati `Database`;
- dipendenze `@supabase/*` in `package.json`;
- template `.env.example`, `.env.local.example` o varianti `.env.*example`;
- variabili `NEXT_PUBLIC_SUPABASE_*` o `SUPABASE_*` documentate in env template;
- policy RLS reali;
- funzioni SQL, trigger o RPC Supabase.

### Match documentali trovati

Lo scan trova riferimenti a Supabase, RLS, policy, migration e service-role key solo in documentazione/policy e in placeholder statici gia coerenti con task precedenti.

Esempi rilevanti:

- `docs/MASTER-PLAN.md`: pianifica `TASK-004`, RLS e divieto service-role key client.
- `docs/SKILLS/supabase-security.md`: definisce regole future.
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`: vincoli futuri Supabase.
- `docs/TASKS/TASK-003-platform-admin-domain-types-mock.md`: esplicita che Supabase reale era fuori scope.
- `src/domain/platform-admin/mock.ts`: messaggio sintetico "Database schema discovery belongs to TASK-004."

Questi match non costituiscono schema, client, secret o integrazione runtime.

## Assenze confermate

- Nessun database schema verificabile dal repo.
- Nessuna fonte locale per colonne, constraint, enum DB o policy RLS reali.
- Nessun boundary client/server Supabase implementato.
- Nessun audit log backend implementato.
- Nessuna configurazione auth reale.
- Nessun seed reale o sintetico Supabase.
- Nessuna service-role key, anon key o credenziale Supabase nel repository.

## Vincoli di sicurezza

- RLS obbligatoria per ogni tabella con dati business, dati utente o membership.
- Nessuna service-role key nel client/browser.
- Nessun secret, token, password o credenziale hardcoded.
- Platform admin e azioni globali devono essere verificati lato server.
- Le operazioni shop-scoped devono essere autorizzate rispetto a `shop_id`.
- I dati business devono appartenere a `shop_id` / `shop_code`, non direttamente all'account personale.
- Account personale e staff POS restano separati.
- Staff POS, dispositivi e permessi operativi restano modulo interno della `Shop Admin Console`.
- Non introdurre `merchant -> stores`.

## Proposed Schema Planning

Questa sezione e proposta futura, non schema reale e non migration definitiva.

Entita da valutare in un task successivo di schema design:

- `profiles`: account personali web.
- `shops`: root business/negozio con `shop_id` e `shop_code`.
- `shop_members`: associazione profilo personale, shop e ruolo shop-scoped.
- `staff_accounts`: identita operative POS separate dai profili personali.
- `roles`: ruoli globali o shop-scoped.
- `permissions`: permessi granulari distinguibili per scope.
- `devices`: dispositivi autorizzati per shop.
- `audit_logs`: eventi sensibili globali e shop-scoped.

Le colonne, constraint, enum, indici, trigger, funzioni e policy non vanno inventati in questo task. Dovranno essere definiti solo dopo una proposta schema dedicata e review.

## Piano RLS ad alto livello

- Abilitare RLS su tutte le tabelle applicative.
- Separare policy globali da policy shop-scoped.
- Consentire letture/scritture shop-scoped solo quando esiste membership attiva sullo `shop_id` richiesto e permesso coerente.
- Limitare le policy globali ai platform admin verificati.
- Evitare policy che concedono accesso usando solo dati client-controllable.
- Valutare funzioni SQL helper solo se servono a centralizzare controlli di ruolo/permesso, con ownership e search path sicuri.
- Tracciare azioni sensibili in `audit_logs` tramite server-side flow o meccanismo DB progettato esplicitamente.

## Client/server boundary

- Client browser:
  - UI, stati di caricamento, errori e chiamate consentite con sessione utente.
  - Solo chiavi pubbliche consentite e mai service-role key.
- Server:
  - validazioni finali di ruolo e permesso;
  - azioni platform admin;
  - operazioni controllate su shop;
  - scrittura audit log obbligatoria per azioni sensibili.
- Database:
  - RLS, constraint, ownership dei dati su `shop_id`, membership e integrita referenziale.

## Piano audit log

- Audit log come superficie separata, append-only per gli eventi sensibili.
- Eventi globali: azioni platform admin, modifiche stato shop, operazioni di emergenza o safe operations.
- Eventi shop-scoped: azioni su staff POS, dispositivi, ruoli, permessi e dati business quando verranno introdotti.
- Ogni evento dovrebbe distinguere actor personale, scope, shop opzionale, azione, risultato e timestamp.
- Nessun dato sensibile o secret negli audit log.

## Piano ruoli globali e shop-scoped

- Ruoli globali:
  - `platform_admin`: privilegi globali limitati, server-side, audit obbligatorio.
  - `viewer`: eventuale lettura globale limitata, da confermare.
- Ruoli shop-scoped:
  - `shop_owner`
  - `shop_manager`
  - `cashier`
- I ruoli shop-scoped devono essere valutati tramite membership sullo `shop_id`.
- `cashier` e staff POS non implicano account personale web.
- Permessi granulari devono distinguere scope `global` e `shop`.

## Separazione account personale vs staff POS

- `profiles`: identita personali per login web futuro.
- `staff_accounts`: identita operative POS future.
- Login web futuro e login POS futuro non devono condividere credenziali o identita senza ADR dedicata.
- Login POS futuro previsto: `shop_code + staff_code + PIN/password`.
- Gestione ordinaria staff/POS dentro `Shop Admin Console`, non come console autonoma e non come responsabilita ordinaria platform admin.

## Fuori scope

- Creare migration SQL definitive.
- Creare o configurare client Supabase.
- Aggiungere dipendenze `@supabase/*`.
- Introdurre login/auth reale.
- Collegare UI a dati reali.
- Implementare CRUD.
- Implementare server actions o route handler operative.
- Creare seed data Supabase.
- Usare Supabase CLI live.
- Inserire secret, anon key, service-role key o credenziali.
- Modificare UI o domain mock fuori dalla documentazione di planning.
- Introdurre `merchant -> stores`.
- Fondere account personali e staff POS.
- Creare una console POS separata.

## Rischi

- Assenza di schema reale: ogni dettaglio di tabella/colonna/policy sarebbe speculativo.
- RLS e ruoli richiedono design dedicato prima di qualsiasi lettura dati reale.
- Boundary client/server non ancora implementato: `TASK-005` non deve partire prima di una decisione schema/auth verificata.
- Audit log deve essere progettato prima delle azioni controllate di `TASK-006`.
- Manca env template: quando Supabase verra introdotto, servira documentare variabili pubbliche/server senza valori reali.

## Safety gate prima dei task successivi

### Prima di `TASK-005 - Platform Admin Read-only Data`

Devono esistere o essere approvati in modo esplicito:

- schema Supabase reale o migration reviewate con tabelle/colonne/policy definite;
- strategia auth SSR e boundary client/server;
- tipi `Database` generati o piano verificabile per generarli;
- env template senza valori reali, con distinzione tra variabili pubbliche e server-only;
- RLS attiva e testata per letture globali e shop-scoped;
- piano loading/error/empty state per la UI read-only;
- regole per errori autorizzazione e futuro shop switch;
- evidence che nessuna service-role key sia accessibile dal client.

Senza questi prerequisiti `TASK-005` deve restare `BLOCKED` o tornare a planning.

### Prima di `TASK-006 - Platform Admin Controlled Actions`

Devono esistere o essere approvati in modo esplicito:

- azioni server-side con autorizzazione finale lato server;
- audit log obbligatorio per ogni safe operation e modifica sensibile;
- strategia rollback o forward-only per migration e azioni controllate;
- gestione errori e messaggi operatore chiari per successo, blocco autorizzazione, conflitto e failure;
- policy RLS e controlli applicativi coerenti per operazioni globali e shop-scoped;
- piano per non esporre dati sensibili nei log, report o UI.

Senza questi prerequisiti `TASK-006` non deve entrare in execution.

## Strategia futura migration, tipi, env e seed

Questa sezione resta proposta futura, non implementazione.

- Migration strategy: preferire migration piccole, reviewabili, forward-only quando possibile; rollback solo se definito e testabile senza perdita dati non pianificata.
- Policy strategy: ogni migration che introduce tabella o colonna sensibile deve includere o aggiornare RLS/policy in modo esplicito.
- Tipi generati: quando Supabase verra introdotto, i tipi `Database` dovranno derivare dallo schema reale, non da mock o supposizioni.
- Env template: aggiungere solo nomi variabile necessari, mai valori reali; separare chiavi pubbliche client-safe da secret server-only.
- Seed/test data: usare solo dati sintetici privacy-safe; nessun cliente, account, email, telefono, token o credenziale reale.
- Redazione report: non stampare contenuti di `.env`, secret, token, connection string o valori sensibili; riportare solo presenza/assenza e nomi variabile quando sicuri.

## UX futura da preservare

- `TASK-005` dovra gestire stati loading, error, empty e unauthorized senza inventare dati reali.
- Gli errori di autorizzazione devono essere chiari per operatori/admin, senza rivelare dettagli interni o policy sensibili.
- Il futuro shop switch deve rendere evidente lo scope dello shop corrente e non confondere dati globali e shop-scoped.
- Safe operations devono restare esplicite, conservative e auditabili.
- Audit visibility deve distinguere eventi globali e shop-scoped.
- La UI non deve mostrare dashboard finte come se fossero dati live.

## Check richiesti

| Check | Stato atteso per handoff | Note |
|---|---|---|
| `git status --short` | `PASS` o `PASS_WITH_NOTES` | Deve mostrare solo modifiche documentali attese. |
| `git diff --check` | `PASS` | Obbligatorio prima handoff. |
| `npm run lint` | `PASS` / `NOT_RUN` motivato | Task documentale, ma disponibile. |
| `npm run typecheck` | `PASS` / `NOT_RUN` motivato | Task documentale, ma disponibile. |
| `npm run verify` | `PASS` / `NOT_RUN` motivato | Disponibile in `package.json`; puo essere eseguito come check finale. |
| `npm run build` | incluso in `npm run verify` | Non serve eseguirlo separatamente se `verify` passa. |
| `npm run test:ui-smoke` | `NOT_RUN` motivato | Non necessario per planning puro; utile solo se future modifiche UI/runtime lo richiedono. |
| Supabase live / migration | `NOT_RUN` | Vietato in questo task finche non esiste execution approvata. |

## Criteri esito check

- `PASS`: controllo completato con risultato coerente e verificabile.
- `PASS_WITH_NOTES`: controllo completato ma con warning, limite documentato o risultato non bloccante.
- `FAIL`: controllo eseguito e fallito, con impatto concreto da correggere prima dell'handoff.
- `BLOCKED`: controllo non completabile per assenza di prerequisito reale, accesso, file, schema, decisione o informazione necessaria.
- `NOT_RUN`: controllo volutamente non eseguito perche fuori scope planning, non necessario o vietato dalla fase corrente.

Ogni `BLOCKED` o `NOT_RUN` deve indicare motivazione concreta e prossimo passo.

## Evidence matrix per review

| Area | Evidence richiesta | Esito ammesso |
|---|---|---|
| Stato task | Coerenza tra Master Plan, file task e tracking corrente. | `PASS` / `PASS_WITH_NOTES` / `FAIL` |
| Discovery Supabase | Scan file/cartelle/dipendenze/client/tipi/env template senza leggere secret reali. | `PASS` / `PASS_WITH_NOTES` / `BLOCKED` |
| Stato reale vs proposta | Sezioni separate e senza colonne/policy inventate. | `PASS` / `FAIL` |
| Sicurezza | Divieti secret, service-role client, dati reali e logging sensibile. | `PASS` / `FAIL` |
| Boundary | Client, server e database distinti a livello planning. | `PASS` / `PASS_WITH_NOTES` / `FAIL` |
| RLS/ruoli | Piano globale/shop-scoped e membership su `shop_id`. | `PASS` / `PASS_WITH_NOTES` / `FAIL` |
| Audit log | Eventi sensibili globali/shop-scoped e redazione dati. | `PASS` / `PASS_WITH_NOTES` / `FAIL` |
| Runtime/test | Build/test/runtime non eseguiti in planning review salvo motivazione. | `NOT_RUN` / `PASS_WITH_NOTES` |

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Pre-flight git eseguito e documentato. | `PASS` |
| CA-02 | Fonti richieste lette o assenze documentate. | `PASS` |
| CA-03 | Discovery Supabase reale completata. | `PASS` |
| CA-04 | Schema reale trovato documentato oppure assenza confermata. | `PASS` |
| CA-05 | Proposta futura separata chiaramente dallo stato reale. | `PASS` |
| CA-06 | RLS, boundary, audit log e ruoli pianificati ad alto livello. | `PASS` |
| CA-07 | Nessuna implementazione Supabase/auth/CRUD/login introdotta. | `PASS` |
| CA-08 | Handoff preparato verso `REVIEW`, senza marcare `DONE`. | `PASS` |
| CA-09 | Criteri `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED`, `NOT_RUN` definiti. | `PASS` |
| CA-10 | Safety gate per `TASK-005` e `TASK-006` documentati. | `PASS` |
| CA-11 | Strategia futura per migration, tipi generati, env template e seed/test data documentata come proposta. | `PASS` |

## Handoff a REVIEW

`TASK-004` e pronto per review documentale.

### Planning review addendum

- Review planning eseguita il `2026-05-30`.
- Modalita: solo review/documentazione, nessuna execution.
- Verifica repo-grounded: `TASK-003` risulta `DONE`; `TASK-004` risulta `REVIEW` in file task, tracking corrente e Roadmap Master Plan dopo correzione.
- Non sono stati eseguiti build, test runtime, Supabase live, migration o cleanup operativo durante questa planning review.
- Miglioramenti integrati: criteri esito check, evidence matrix, safety gate per `TASK-005`/`TASK-006`, strategia futura migration/tipi/env/seed e requisiti UX futuri.

### Second-level planning review addendum

- Second-level planning review eseguita il `2026-05-30`.
- Modalita: `PLANNING REVIEW ONLY`; nessuna execution autorizzata o svolta.
- Verifica stato: `TASK-003` resta `DONE`; `TASK-004` resta `REVIEW`, non `DONE`.
- Correzione tracking: lo stato globale corrente del Master Plan e stato allineato a `REVIEW`.
- Chiarimento evidence: i check runtime precedenti restano registrati come evidence storica dell'handoff iniziale, ma non sono stati rieseguiti durante questa second-level planning review.
- Nessun build, test runtime, `npm run verify`, Supabase live, migration, seed, cleanup operativo, install dipendenze o commit eseguito in questa review.
- Nessun secret, valore `.env`, token, connection string o credenziale letto, stampato o inserito.

### Final planning gate review addendum

- Final planning gate review eseguita il `2026-05-30`.
- Esito massimo consentito: `READY_FOR_DONE_CONFIRMATION`.
- `TASK-004` resta `REVIEW`; non viene marcato `DONE`.
- Master Plan, file task, tracking corrente e handoff sono coerenti su `TASK-004` in `REVIEW`.
- Nessuna execution nascosta rilevata: nessun codice runtime, client Supabase, migration SQL, auth, CRUD, seed, dipendenza o UI runtime introdotti.
- Evidence storica e review corrente sono separate: i check runtime precedenti restano validi come evidence storica, ma non sono stati rieseguiti in questa final planning gate review.
- `TASK-005` resta non autorizzato per execution finche schema reale o migration reviewate, auth SSR, boundary client/server, RLS, tipi `Database` ed env template non saranno decisi e verificati.
- `TASK-006` resta non autorizzato per execution finche server-side actions, autorizzazioni, audit log e safe operation policy non saranno progettati e reviewati.
- Nessun secret, valore `.env`, token, connection string, PIN, password o credenziale e stato letto, stampato o inserito.

### Follow-up tooling futuri

Questi follow-up sono candidati separati e non vanno implementati dentro `TASK-004` planning review:

- check scriptato per redazione secret/report, senza stampare valori sensibili;
- scan ripetibile per presenza di `supabase/`, migration SQL, client Supabase, tipi `Database` ed env template;
- check coerenza tra Roadmap Master Plan, tracking corrente e file task attivo;
- report evidence standardizzato per distinguere `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED` e `NOT_RUN`;
- smoke UI solo quando una futura execution modifica UI/runtime;
- guardrail contro letture globali non filtrate e coupling diretto UI-database.

### File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-004-supabase-schema-discovery-planning.md`

### Evidence check finali precedenti

Questa tabella registra check eseguiti durante l'handoff iniziale di `TASK-004`. Non rappresenta comandi rieseguiti durante la planning review successiva.

| Comando | Risultato | Sintesi |
|---|---|---|
| `git diff --check` | `PASS` | Nessun output. |
| `npm run verify` | `PASS_WITH_NOTES` | `lint`, `typecheck` e `next build` passano; build con warning Node `[DEP0205] module.register() is deprecated`. |
| `git status --short` | `PASS_WITH_NOTES` | Mostra solo `M docs/MASTER-PLAN.md` e `?? docs/TASKS/TASK-004-supabase-schema-discovery-planning.md`. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `docs/MASTER-PLAN.md`; il nuovo file task e untracked finche non verra aggiunto a git. |

### Evidence planning review corrente

| Comando/controllo | Risultato | Motivazione | Prossimo passo |
|---|---|---|---|
| Lettura governance e task file | `PASS` | Documenti richiesti letti in modalita planning. | Review utente. |
| `git status --short` | `PASS_WITH_NOTES` | Mostra solo modifiche documentali attese. | Stagiare solo dopo approvazione utente, se richiesto. |
| Scan env template/Supabase file | `PASS_WITH_NOTES` | Trovati solo documenti/task, nessun env template o schema reale; nessun valore secret letto. | Creare env template solo in task futuro approvato. |
| `git diff --check` | `PASS` | Nessun whitespace error. | Nessuno. |
| `npm run verify` | `NOT_RUN` | Vietato dalla second-level planning review corrente. | Eseguire solo in futura execution/review runtime autorizzata. |
| Build/test runtime/Playwright | `NOT_RUN` | Vietati dalla fase corrente e non necessari per documentazione. | Eseguire solo se una futura execution modifica runtime/UI. |
| Supabase live/migration/seed | `NOT_RUN` | Vietati e non esiste schema reale approvato. | Pianificare prima schema/auth/RLS/boundary. |

### Evidence final planning gate review corrente

| Comando/controllo | Risultato | Motivazione | Prossimo passo |
|---|---|---|---|
| Coerenza Master Plan/task/tracking | `PASS` | Roadmap e tracking indicano `TASK-004` in `REVIEW`; `TASK-003` resta `DONE`. | Attendere conferma utente per eventuale `DONE`. |
| Discovery documentale Supabase/env | `PASS_WITH_NOTES` | Trovati solo riferimenti documentali/policy; nessun schema, client, migration o env template reale. | Pianificare schema/auth/RLS prima di `TASK-005`. |
| Stato reale vs proposta futura | `PASS` | Le sezioni sono separate e non definiscono colonne/policy definitive. | Mantenere separazione nella futura execution. |
| Safety gate `TASK-005`/`TASK-006` | `PASS` | Gate espliciti presenti e bloccanti per execution prematura. | Usarli come prerequisiti del prossimo task. |
| `git diff --check` | `PASS` | Nessun whitespace error nella review finale. | Nessuno. |
| `npm run verify` / `lint` / `typecheck` / `build` | `NOT_RUN` | Vietati dalla final planning gate review corrente. | Eseguire solo in futura execution/review runtime autorizzata. |
| Test runtime / Playwright | `NOT_RUN` | Vietati e non necessari per planning documentale. | Eseguire solo se cambia UI/runtime. |
| Supabase live / migration / seed | `NOT_RUN` | Vietati; nessuno schema reale approvato. | Prima definire schema/auth/RLS/boundary. |

### Stato handoff

- Prossima fase: `DONE`.
- `TASK-004` marcato `DONE` su conferma esplicita utente.
- Verdict review finale: `READY_FOR_DONE_CONFIRMATION`.
- Nessun commit eseguito.
- Nessuna implementazione Supabase/auth/CRUD/login introdotta.

### Chiusura DONE

- Chiusura confermata esplicitamente dall'utente.
- Stato finale: `DONE`.
- Scope chiuso: discovery/planning Supabase.
- Nessuna integrazione Supabase reale implementata.
- Nessun client Supabase creato.
- Nessuna migration creata.
- Nessun login/auth/CRUD introdotto.
- Nessun dato reale collegato alla UI.
- `TASK-005` resta bloccato per execution finche schema/auth/RLS/boundary/env/tipi non saranno verificati o approvati.
- Prossimo passo: pianificare/revieware `TASK-005`, non eseguirlo subito sui dati reali.
