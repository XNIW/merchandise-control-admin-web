# TASK-005C - Admin Web Supabase Schema / Boundary Planning

## 1. Informazioni generali

- ID: `TASK-005C`
- Titolo: Admin Web Supabase Schema / Boundary Planning
- Stato: `PLANNED_BLOCKED`
- Fase attuale: `PLANNING_HANDOFF`
- Responsabile attuale: `USER / REVIEW`
- Dipende da:
  - `TASK-005B` DONE;
  - Opzione C - Ibrida accettata come direzione prudente;
  - `TASK-005` PLANNED_BLOCKED.
- File Master Plan: `docs/MASTER-PLAN.md`

## 2. Pre-flight

Comandi eseguiti prima della creazione del piano:

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree documentale: `M docs/MASTER-PLAN.md`; task docs `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `docs/MASTER-PLAN.md`; i task docs non tracciati non compaiono nello stat Git standard. |
| `git diff --check` | `PASS` | Nessun output. |

## 3. Scopo

`TASK-005C` trasforma la decisione ibrida di `TASK-005B` in un piano schema/boundary verificabile per Admin Web, prima di qualsiasi execution runtime o lettura dati live.

Questo task non implementa Supabase. Non crea migration, client Supabase, dipendenze, env reali, tipi `Database`, login/auth, CRUD, query live, server action operative o UI collegata a dati reali.

## 4. File letti

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005B-admin-web-supabase-domain-mapping-boundary-decision.md`
- `docs/TASKS/TASK-005A-supabase-source-alignment-foundation-readiness.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/supabase-security.md`
- `package.json`
- `src/domain/platform-admin/types.ts`
- `src/domain/platform-admin/mock.ts`

Nota sicurezza: non sono stati letti o stampati file `.env`, token, password, PIN, JWT, refresh token, connection string, anon key reale, publishable key reale o service-role key.

## 5. Stato repo-grounded

Admin Web resta `SUPABASE_RUNTIME_ABSENT`:

- nessuna cartella `supabase/`;
- nessuna migration SQL Admin Web;
- nessun client Supabase;
- nessuna dipendenza `@supabase/*`;
- nessun env template Supabase;
- nessun tipo generato `Database`;
- nessuna auth SSR;
- nessuna RLS reale in questa repo;
- nessuna query live;
- nessun dato reale collegato alla UI.

`src/domain/platform-admin/types.ts` contiene tipi domain/mock per `profiles`, `shops`, `shop_members`, `roles`, `permissions`, `audit_logs` e system status, ma non sono schema Supabase definitivo.

## 6. Vincoli ereditati da TASK-005B

- `shops` resta root business Admin Web.
- Il modello mobile owner-scoped viene preservato.
- `owner_user_id` non e `shop_id`.
- Serve mapping esplicito tra fonte mobile e dominio Admin Web.
- `platform_admin` deve essere verificato server-side.
- `TASK-005` resta bloccato finche schema/boundary/RLS/env/tipi/`platform_admin` non sono approvati e verificabili.
- `sync_events` non e `audit_logs` Admin Web.
- Staff POS, ruoli operativi e dispositivi restano shop-scoped e sotto `Shop Admin Console`.

## 7. Entita candidate Admin Web

Queste entita sono candidate di planning, non migration definitive e non colonne finali.

### `profiles`

Responsabilita candidate:

- rappresentare account personali web;
- collegarsi a identita auth verificata;
- permettere membership in piu shop;
- non rappresentare staff POS.

Decisioni aperte:

- mapping diretto a `auth.users.id` o tabella profilo applicativa separata;
- gestione profili senza shop;
- stato profilo e audit di revoca/sospensione.

### `shops`

Responsabilita candidate:

- root business Admin Web;
- possedere `shop_id` / `shop_code`;
- guidare ownership di dati business, staff, ruoli, dispositivi e futuri moduli Shop Admin.

Decisioni aperte:

- generazione/validazione `shop_code`;
- stato iniziale shop;
- relazione con inventario mobile esistente.

### `shop_members`

Responsabilita candidate:

- collegare `profiles` e `shops`;
- rappresentare ruoli shop-scoped come `shop_owner`, `shop_manager`, `viewer`;
- non trasformare staff POS/cashier in account web automaticamente.

Decisioni aperte:

- ruoli iniziali ammessi;
- membership multi-shop;
- revoca/sospensione membership e audit.

### `platform_admins` o alternativa server-side

Responsabilita candidate:

- definire `platform_admin` come autorizzazione globale verificata lato server;
- permettere revoca e audit;
- evitare client state, URL, mock o email hardcoded lato client.

Alternative da decidere:

- tabella dedicata `platform_admins`;
- membership globale;
- role table server-side;
- claim in app metadata controllata server-side;
- allowlist server-only temporanea con scadenza e audit.

### `roles`

Responsabilita candidate:

- definire ruoli global e shop-scoped;
- separare `platform_admin` da `shop_owner`, `shop_manager`, `cashier`, `viewer`;
- preparare controlli server-side e RLS coerenti.

Decisioni aperte:

- ruoli DB vs ruoli applicativi;
- ruolo `viewer` globale o shop-scoped;
- relazione con staff POS futuro.

### `permissions`

Responsabilita candidate:

- modellare permessi granulari;
- distinguere scope `global` e `shop`;
- supportare test authorization futuri.

Decisioni aperte:

- lista permessi iniziali;
- gestione permessi ereditati da ruolo;
- eventuale materializzazione per performance.

### `audit_logs`

Responsabilita candidate:

- tracciare azioni sensibili Admin Web;
- distinguere eventi global e shop-scoped;
- restare separati da `sync_events`.

Decisioni aperte:

- eventi minimi read-only vs future safe operations;
- append-only e redazione dati sensibili;
- comportamento UI quando audit non e disponibile: `Audit not configured`.

### `shop_inventory_sources`

Responsabilita candidate:

- collegare `shops` a fonti inventory mobile owner-scoped;
- mantenere esplicito il mapping `owner_user_id` -> shop;
- rappresentare fonti non mappate o non configurate senza inventare dati live.

Decisioni aperte:

- nome finale della tabella/read model;
- cardinalita shop -> owner source;
- stato mapping e proprieta auditabili;
- se resta tabella nativa Admin Web o vista/read model server-only.

## 8. Relazione `owner_user_id` mobile -> profilo/shop

Principio: `owner_user_id` mobile e una identita owner-scoped del modello Android/iOS, non una root business Admin Web.

Mapping proposto:

1. `profiles` rappresenta account personale web/auth.
2. `shops` rappresenta root business Admin Web.
3. `shop_inventory_sources` o equivalente collega uno `shop_id` a una fonte mobile, includendo il riferimento a `owner_user_id` solo dopo decisione approvata.
4. L'inventory mobile resta owner-scoped finche il mapping non e verificato.
5. Le letture Platform Admin su inventory passano da boundary server-side/read model, non da UI client diretta.

Stati mapping richiesti:

- `unmapped`: esiste fonte mobile ma non e collegata a shop approvato;
- `not_configured`: shop non ha fonte inventory configurata;
- `mobile_only`: fonte mobile esiste ma non e esponibile ad Admin Web;
- `mapped`: mapping approvato e verificabile.

Questi stati sono planning labels, non enum DB definitivi.

## 9. Read model / viste future per inventory

Opzioni future:

| Opzione | Uso | Rischio | Condizione minima |
| --- | --- | --- | --- |
| Tabella nativa Admin Web | Dominio shop/platform completo | Richiede migration e RLS nuove | Schema approvato e mapping mobile esplicito |
| Vista/read model sopra mobile schema | Lettura inventory senza duplicare dati | Rischio bypass RLS o owner/shop ambiguo | Server boundary, `security_invoker` o schema non esposto, RLS review |
| `shop_inventory_sources` ibrida | Ponte esplicito tra shop e fonte mobile | Mapping errato produce data leak | Review mapping, audit e test unauthorized |

Raccomandazione planning: usare `shop_inventory_sources` o read model equivalente come ponte esplicito, poi decidere se materializzare viste/tabelle solo dopo schema/RLS review.

## 10. Confronto architetturale richiesto

| Area | Tabelle native Admin Web | Viste/read model sopra mobile | Mapping ibrido `shop_inventory_sources` | Audit separato |
| --- | --- | --- | --- | --- |
| Coerenza con `shops` root | Alta | Parziale | Alta se mapping approvato | Alta |
| Compatibilita Android/iOS | Alta se non tocca mobile | Alta se read-only server-side | Alta se non modifica `inventory_*` | Alta |
| Rischio RLS | Medio, da progettare | Alto se view bypassa RLS | Medio, da testare | Medio |
| Velocita | Media-bassa | Media | Media | Media |
| Sblocco `TASK-005` | Solo dopo migration/env/tipi/RLS | Solo dopo boundary e live/schema review | Miglior candidato per readiness | Audit non blocca se UI mostra `Audit not configured` |

## 11. Boundary server/client

Piano futuro:

- Client/browser: solo UI, stati, rendering, badge `Mock`/`Live`/`Not configured`.
- Server-side Admin Web: data access, verifica `platform_admin`, mapping schema reale -> view model, redazione errori.
- Database: RLS, constraint, ownership, eventuali viste/read model.

Matrice boundary minima richiesta prima di execution:

| Livello | Responsabilita consentite | Deve produrre evidence | Vietato |
| --- | --- | --- | --- |
| Client/browser | Rendering, navigazione, filtri UI non autorevoli, stati `Mock`/`Live`/`Not configured`/`Unauthorized`/`Empty`/`Error` | Snapshot o smoke UI solo se cambia runtime/UI | Query sensibili, decisione finale `platform_admin`, service-role key, fallback mock presentato come live, errori con dettagli sensibili |
| Server Admin Web | Sessione/auth SSR, verifica `platform_admin`, data access read-only, mapping `Database` -> view model, redazione errori, paginazione/limit | Test authorized/unauthorized, no mutation scan, mapper tests, error redaction checks | Autorizzazione basata su URL/local state/input client, email hardcoded client, service-role esposta al browser |
| Database/Supabase | RLS, constraint, ownership, viste/read model, eventuali funzioni con privilegi controllati | Policy tests per owner/shop/global, schema diff review, grants review | Tabelle business esposte senza RLS, view che bypassano RLS senza review, `security definer` in schema esposto o senza search path sicuro |
| Vietato trasversalmente | Nessuna responsabilita applicativa | Scan statici e review documentale | Secret nel repo, valori `.env` reali nei report, dati reali hardcoded, mutation in percorso read-only |

Divieti:

- nessun service-role client;
- nessuna query sensibile da client component;
- nessun accesso basato solo su input client;
- nessun fallback mock spacciato per live;
- nessun coupling diretto UI-database;
- nessuna anon/publishable key reale nei documenti.

File candidati futuri, non da creare qui:

- `src/lib/supabase/server.ts`
- `src/server/platform-admin/authz.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/mappers.ts`
- `src/server/platform-admin/inventory-sources.ts`

## 12. Strategia RLS

Requisiti futuri:

- RLS obbligatoria su tabelle esposte;
- policy shop-scoped basate su membership verificata;
- policy owner-scoped mobile preservate;
- global read per `platform_admin` solo se verificata server-side e auditabile;
- nessun uso di `user_metadata` per autorizzazione;
- nessuna policy basata solo su input client-controllable;
- viste future protette da `security_invoker` quando applicabile o collocate in schema non esposto;
- funzioni `security definer`, se necessarie, non in schema esposto e con search path sicuro.

Test RLS futuri:

- unauthorized user non vede dati;
- non-platform admin non vede global read;
- membro shop vede solo shop autorizzati;
- owner mobile non viene trattato come shop admin senza mapping;
- read-only non consente insert/update/delete;
- view/read model non bypassa owner/shop scope.

## 13. Strategia `platform_admin`

Decisione richiesta prima di execution:

- fonte autorevole server-side;
- revoca verificabile;
- audit di accesso/azioni sensibili;
- comportamento `Unauthorized` senza data leak.

Alternative da valutare:

| Alternativa | Pro | Rischi | Condizioni minime |
| --- | --- | --- | --- |
| Tabella dedicata `platform_admins` | Revoca e audit espliciti; query server-side semplice | Richiede migration, RLS e processo bootstrap | Schema approvato, RLS/policy testate, audit accessi globali |
| Role/membership globale | Riusa concetto ruoli/permessi; coerente con RBAC futuro | Rischio confusione tra scope globale e shop-scoped | Scope `global` esplicito, nessuna ereditarieta implicita da `shop_members` |
| Claim in app metadata controllata server-side | Lettura veloce in auth context; non client-controllable se gestita correttamente | Revoca/cache/token stale; dipendenza dal provider auth | Solo app metadata server-managed, refresh/revoca documentati, test token stale |
| Allowlist server-only temporanea | Utile per bootstrap limitato | Fragile se diventa permanente; rischio drift operativo | Scadenza, owner, audit, nessuna esposizione client, rimozione obbligatoria in task successivo |

Esito review: nessuna alternativa viene scelta in `TASK-005C`. La decisione resta `BLOCKED` finche non esistono schema target, boundary auth SSR e criterio di revoca/audit verificabile.

Divieti:

- no email hardcoded lato client;
- no mock/local state/URL come autorizzazione;
- no `user_metadata`;
- no service-role key browser.

## 14. Env template necessario

Non creare env template in questo task. Il task futuro dovra definire solo nomi variabile senza valori reali.

Variabili candidate da valutare:

- URL progetto Supabase, se client/server autorizzati;
- publishable/anon key solo se necessaria e client-safe;
- eventuali variabili server-only per boundary, mai esposte come `NEXT_PUBLIC_` se segrete;
- flag di ambiente per mock/live/not configured;
- project ref per generazione tipi, senza secret.

Regole:

- mai stampare valori `.env`;
- distinguere chiaramente variabili pubbliche da server-only;
- nessuna service-role key lato client;
- nessun secret nel repository.

## 15. Tipi `Database`

I tipi `Database` futuri devono derivare da schema reale verificato, non da mock o supposizioni.

Prerequisiti:

- schema/migration approvati;
- fonte Supabase target confermata;
- comando di generazione definito in task futuro;
- output generato reviewato per non includere secret;
- mapper da `Database` type a view model Admin Web.

I tipi domain esistenti in `src/domain/platform-admin/types.ts` restano view/domain model, non schema DB.

## 16. Test futuri

Test e check da pianificare in execution futura:

- mapper schema reale -> view model;
- mapping `owner_user_id` -> shop;
- stati `unmapped`, `not_configured`, `mobile_only`, `mapped`;
- `platform_admin` server-side authorized/unauthorized;
- RLS shop-scoped;
- RLS global read;
- no service-role client;
- no mutation in read-only path;
- no secret/redaction scan;
- audit unavailable -> `Audit not configured`;
- schema mismatch;
- empty state;
- build/lint/typecheck;
- smoke UI solo se runtime/UI cambia.

## 16A. Harness futuri richiesti

Questi harness sono requisiti di planning per una execution futura; non sono implementati in `TASK-005C`.

| Harness futuro | Scopo | Stato in `TASK-005C` |
| --- | --- | --- |
| No service-role client | Verificare che service-role/server-only key non entrino in bundle, client component o documenti con valori reali | `NOT_RUN`, planning-only |
| No mutation in read-only path | Verificare assenza di insert/update/delete/RPC mutative nelle letture `TASK-005` | `NOT_RUN`, richiede codice execution |
| Secret/redaction scan | Verificare che report, errori e output generati non contengano token, `.env`, JWT, connection string o dati reali | `NOT_RUN`, da definire prima di execution |
| Schema mismatch | Fallire in modo esplicito se lo schema reale non corrisponde ai mapper attesi | `NOT_RUN`, richiede tipi `Database` reali |
| Mapper schema -> view model | Coprire trasformazione da `Database` type a model Admin Web senza coupling UI-DB | `NOT_RUN`, richiede schema reale |
| `platform_admin` authz | Coprire authorized, unauthorized, revoked/stale session e no data leak | `NOT_RUN`, decisione `platform_admin` bloccante |
| RLS shop/global | Verificare membership shop-scoped, owner-scoped mobile preservato e global read controllato | `NOT_RUN`, richiede policy/migration |
| Mapping `owner_user_id` -> shop | Coprire `mapped`, `unmapped`, `not_configured`, `mobile_only` e mapping ambiguo | `NOT_RUN`, richiede mapping approvato |
| UI states | Coprire `Mock`, `Live`, `Not configured`, `Unauthorized`, `Empty`, `Error`, `Audit not configured`, `Mapping required` | `NOT_RUN`, solo se UI cambia in execution |

Check vietati o non pertinenti in questa review restano `NOT_RUN`: build, lint, typecheck, Playwright, Supabase CLI/live, migration, seed e query live.

## 16B. Requisiti UX futuri

La futura UI read-only deve rendere evidente la provenienza e lo stato del dato:

- badge o label per `Mock`, `Live`, `Read model`, `Not configured` e `Mapping required`;
- nessun dato sintetico o mock mostrato come dato reale;
- messaggi operativi comprensibili per `Unauthorized`, `Empty`, `Error`, `Audit not configured`, `Unmapped`, `Mobile only`;
- errori redatti senza SQL, token, email sensibili, id non necessari o dettagli interni;
- azioni disabilitate o assenti nel percorso read-only;
- copy coerente tra `Platform Admin Console` globale e `Shop Admin Console` shop-scoped;
- evidenza quando `sync_events` e mostrato, se mai lo sara, come osservabilita tecnica e non come `audit_logs` amministrativo.

## 17. Safety gate per sbloccare TASK-005

`TASK-005` resta `PLANNED_BLOCKED` finche tutti questi gate non sono soddisfatti o approvati con evidence:

| Gate | Stato attuale | Necessario per sblocco |
| --- | --- | --- |
| Schema Admin Web | `BLOCKED` | Entita e relazioni approvate o migration reviewate |
| Mapping owner/shop | `BLOCKED` | `shop_inventory_sources` o alternativa approvata |
| Stato dati non mappati | `BLOCKED` | Semantica `unmapped/not_configured/mobile_only` approvata |
| Read model inventory | `BLOCKED` | Vista/read model/server layer approvato |
| `platform_admin` | `BLOCKED` | Fonte server-side verificabile |
| RLS | `BLOCKED` | Policy/test approvati |
| Boundary server/client | `BLOCKED` | Data access server-side definito |
| Env template | `BLOCKED` | Variabili senza valori reali |
| Tipi `Database` | `BLOCKED` | Generabili da schema reale |
| Read-only/no mutation | `BLOCKED` | Test/scan previsti |
| Security/secrets | `PASS_WITH_NOTES` | Divieti documentati; scan futuro richiesto |
| UI states | `PLANNED` | Stati not configured/unauthorized/empty/error definiti |
| Evidence live | `BLOCKED` | Supabase live non usato in questo task |

## 18. Decisioni aperte

1. `profiles`: tabella applicativa separata o mapping diretto a auth user?
2. `platform_admin`: tabella, role table, membership globale, app metadata o allowlist server-only temporanea?
3. `shop_inventory_sources`: tabella nativa, view, read model server-only o nome alternativo?
4. Uno shop puo avere piu fonti mobile owner-scoped?
5. Un `owner_user_id` puo alimentare piu shop?
6. `sync_events` resta solo osservabilita tecnica o viene esposto con label dedicata?
7. `audit_logs` e obbligatorio prima di `TASK-005` o basta `Audit not configured` per read-only?
8. Quali oggetti devono restare in schema non esposto?
9. Quale ambiente Supabase sara fonte autorevole per tipi `Database`?
10. Quale harness verifichera no mutation/no service-role client?

## 19. Fuori scope

- Nessuna migration SQL.
- Nessun Supabase live.
- Nessun client Supabase.
- Nessuna installazione dipendenze.
- Nessun CRUD.
- Nessun login/auth runtime.
- Nessuna UI runtime.
- Nessuna query live.
- Nessun service-role client.
- Nessuna anon/publishable key reale.
- Nessuna modifica Android/iOS.
- Nessuna modifica a dati reali.
- Nessuna execution `TASK-005`.
- Nessuna anticipazione `TASK-006`.

## 20. Check non eseguiti

- `npm run build`: `NOT_RUN`, planning-only.
- `npm run verify`: `NOT_RUN`, planning-only.
- `npm run lint`: `NOT_RUN`, planning-only.
- `npm run typecheck`: `NOT_RUN`, planning-only.
- Playwright/test runtime: `NOT_RUN`, nessuna UI/runtime modificata.
- Supabase live/migration/seed: `NOT_RUN`, vietato dal task.

## 21. Criteri per REVIEW

`TASK-005C` puo andare in review documentale se:

- il piano resta planning-only;
- non crea migration/client/env/tipi/runtime;
- entita candidate e mapping sono espliciti;
- boundary server/client e RLS sono pianificati;
- env/tipi/test/safety gate sono documentati;
- `TASK-005` resta `PLANNED_BLOCKED`;
- check documentali richiesti passano.

Stato del piano dopo creazione:

- Piano documentale: `READY_FOR_REVIEW`.
- Stato task: `PLANNED_BLOCKED`.
- Execution runtime: `BLOCKED`.
- `TASK-005`: resta `PLANNED_BLOCKED`.

## 22. Prossimo passo consigliato

Review del piano `TASK-005C`. Se approvato, aprire un task successivo di decisione/fix documentale o schema design review piu dettagliata prima di qualsiasi migration, client Supabase o lettura live.

## 23. Conferme finali

- Nessun commit eseguito.
- Nessuna migration creata.
- Nessun client Supabase creato.
- Nessuna dipendenza installata.
- Nessun Supabase live usato.
- Nessun dato reale collegato alla UI.
- Nessun `.env` reale letto o stampato.
- Nessun secret inserito.
- Nessuna service-role key esposta.
- Nessuna modifica Android/iOS.
- `TASK-005` resta `PLANNED_BLOCKED`.

## 24. Addendum review Codex planning-only

Review eseguita in modalita `PLANNING_REVIEW_ONLY` sui documenti e sullo stato repo locale.

### File letti

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005C-admin-web-supabase-schema-boundary-planning.md`
- `docs/TASKS/TASK-005B-admin-web-supabase-domain-mapping-boundary-decision.md`
- `docs/TASKS/TASK-005A-supabase-source-alignment-foundation-readiness.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/supabase-security.md`
- `package.json`

### Comandi eseguiti

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree documentale: `M docs/MASTER-PLAN.md`; task `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B`, `TASK-005C` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked solo su `docs/MASTER-PLAN.md`; i task untracked non compaiono nello stat. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff -- docs/MASTER-PLAN.md docs/TASKS docs/ARCHITECTURE docs/DECISIONS docs/SKILLS` | `PASS_WITH_NOTES` | Mostra solo diff tracked del Master Plan; i nuovi task docs sono untracked. |
| `find docs -maxdepth 4 -type f \| sort` | `PASS` | Conferma presenza documenti governance, task, ADR, skills ed evidence esistenti. |
| `find . -maxdepth 4 -type f \( -name "package.json" -o -name "*config*" -o -name "*.md" \) \| sort` | `PASS_WITH_NOTES` | Include molti file sotto `node_modules` e `.next`; nessuna evidenza di cartella `supabase/` Admin Web o env template Supabase nel perimetro letto. |
| `rg -n "TASK-005|...|REVIEW" .` | `PASS_WITH_NOTES` | Match coerenti con documentazione, package scripts e mock domain; nessuna evidenza di client Supabase runtime o migration Admin Web. Output ampio per node_modules/evidence. |

### Risultati review

| Area | Verdict | Nota |
| --- | --- | --- |
| Stato repo Supabase | `PASS` | Admin Web resta `SUPABASE_RUNTIME_ABSENT`: nessun client, migration, dipendenza `@supabase/*`, tipi `Database`, RLS reale o query live trovati nei file letti/scan consentiti. |
| Coerenza Master Plan | `PASS` | `TASK-005C` resta `PLANNED_BLOCKED`; `TASK-005` resta `PLANNED_BLOCKED`; nessuna anticipazione di `TASK-006`. |
| Dominio | `PASS` | `shops` resta root business; nessun `merchant -> stores`; `owner_user_id` non viene trattato come `shop_id`; staff POS resta shop-scoped/futuro. |
| Boundary | `PASS_WITH_NOTES` | Rafforzato con matrice Client/Server/Database/Vietato. |
| RLS/Sicurezza | `PASS_WITH_NOTES` | Requisiti corretti; policy/test restano futuri e bloccanti. |
| `platform_admin` | `PASS_WITH_NOTES` | Aggiunto confronto pro/contro; decisione definitiva resta aperta e bloccante. |
| Env/tipi `Database` | `PASS` | Nessun env template creato; tipi `Database` solo da schema reale verificato. |
| Harness futuri | `PASS_WITH_NOTES` | Aggiunta sezione dedicata agli harness richiesti e ai `NOT_RUN`. |
| UX stati dati | `PASS_WITH_NOTES` | Aggiunti requisiti minimi per provenienza dato, stati operativi e redazione errori. |

### Non eseguito

- `npm run build`: `NOT_RUN`, vietato in planning-only.
- `npm run verify`: `NOT_RUN`, vietato in planning-only.
- `npm run lint`: `NOT_RUN`, vietato in planning-only.
- `npm run typecheck`: `NOT_RUN`, vietato in planning-only.
- Playwright/test runtime: `NOT_RUN`, nessuna UI/runtime modificata e vietato dal prompt.
- Supabase CLI/live/migration/seed/query: `NOT_RUN`, vietato dal prompt.
- Commit: `NOT_RUN`, vietato dal prompt.

### Rischi residui e decisioni aperte

- `platform_admin` non ha ancora fonte autorevole approvata.
- Mapping `owner_user_id` -> `shop_id` resta da decidere e testare.
- RLS, schema, env, tipi `Database`, mapper e harness sono pianificati ma non implementati.
- `audit_logs` puo restare non configurato in read-only solo se la UI mostra esplicitamente `Audit not configured`.
- La review non prova stato Supabase live e non deve essere usata come evidence production-ready.

### Stato finale raccomandato

- Piano `TASK-005C`: `READY_FOR_REVIEW`.
- Stato task: `PLANNED_BLOCKED`.
- Execution runtime: `BLOCKED`.
- `TASK-005`: resta `PLANNED_BLOCKED`.
