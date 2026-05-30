# TASK-005D - Supabase Schema / Auth Boundary Decision

## 1. Informazioni generali

- ID: `TASK-005D`
- Titolo: Supabase Schema / Auth Boundary Decision
- Stato: `DONE_AS_SUPERSEDED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / GLOBAL_REVIEW_001`
- Dipende da:
  - `TASK-005C` reviewato con verdict `READY_FOR_REVIEW`;
  - `TASK-005B` DONE;
  - `TASK-005A` DONE;
  - `TASK-005` PLANNED_BLOCKED.
- File Master Plan: `docs/MASTER-PLAN.md`

## 2. Scopo

`TASK-005D` chiude una proposta decisionale documentale per schema candidato, auth boundary, `platform_admin`, mapping `owner_user_id -> shop_id`, env template futuro e harness necessari prima di qualunque execution Supabase.

Questo task non implementa runtime. Non crea migration, client Supabase, dipendenze, env reali, tipi `Database`, login/auth, CRUD, query live, server action operative o UI collegata a dati reali.

## 3. Pre-flight documentale

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree gia documentale: `M docs/MASTER-PLAN.md`; task docs `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B`, `TASK-005C` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked solo su `docs/MASTER-PLAN.md`; i task docs untracked non compaiono nello stat Git standard. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff` | `PASS_WITH_NOTES` | Diff tracked coerente con tracking Master Plan da `TASK-004` a `TASK-005C`; nessun codice runtime nel diff tracked. |
| `find docs -maxdepth 4 -type f \| sort` | `PASS` | Documenti governance, task, ADR, skills ed evidence presenti. |
| `find src -maxdepth 5 -type f \| sort` | `PASS` | Sorgenti runtime/platform/domain esistenti; nessun file Supabase runtime. |
| `cat package.json` | `PASS` | Nessuna dipendenza `@supabase/*`; script disponibili: `dev`, `build`, `lint`, `typecheck`, `verify`, Playwright smoke. |

## 4. File letti

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
- `src/domain/platform-admin/types.ts`
- `src/domain/platform-admin/mock.ts`

Nota sicurezza: non sono stati letti o stampati file `.env`, token, password, PIN, JWT, refresh token, connection string, anon key reale, publishable key reale o service-role key.

## 5. Riferimenti Supabase consultati

Sono stati consultati solo documenti pubblici, non Supabase live:

- Supabase Row Level Security docs: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase Securing your API docs: `https://supabase.com/docs/guides/api/securing-your-api`
- Supabase Auth docs/search result per utenti e metadata: `https://supabase.com/docs/guides/auth/users`
- Supabase changelog search per breaking change su grants/Data API default privileges.

Punti usati nel piano:

- RLS obbligatoria sulle tabelle in schema esposto.
- Grants Data API e RLS sono due livelli diversi.
- `raw_user_meta_data` / `user_metadata` non deve guidare autorizzazione.
- `raw_app_meta_data` / app metadata puo supportare autorizzazione solo se gestito server-side e con rischio token stale documentato.
- Le view possono bypassare RLS se non progettate con `security_invoker` o schema non esposto.
- Funzioni `security definer` non devono stare in schema esposto e devono avere search path controllato.

## 6. Stato reale repo-grounded

Admin Web resta `SUPABASE_RUNTIME_ABSENT`:

- nessuna cartella `supabase/`;
- nessuna migration SQL Admin Web;
- nessun client Supabase;
- nessuna dipendenza `@supabase/*`;
- nessun env template Supabase reale;
- nessun tipo generato `Database`;
- nessuna auth SSR;
- nessuna RLS reale in questa repo;
- nessuna query live;
- nessun dato reale collegato alla UI.

Implicazione: `TASK-005` resta `PLANNED_BLOCKED`.

## 7. Decision summary

| Area | Scelta raccomandata | Stato execution |
| --- | --- | --- |
| `profiles` | Tabella applicativa separata `profiles`, mappata 1:1 a `auth.users.id` tramite `profile_id` o `auth_user_id` approvato in migration review | `BLOCKED` finche schema/migration non esistono |
| `platform_admin` | Tabella dedicata `platform_admins` come fonte autorevole server-side; app metadata solo cache/ottimizzazione opzionale, non fonte primaria | `BLOCKED` finche auth SSR, revoca e audit non sono verificabili |
| `shop_inventory_sources` | Tabella ponte Admin Web nativa, letta solo server-side/read model, per collegare `shop_id` a fonte mobile owner-scoped | `BLOCKED` finche mapping e RLS non sono approvati |
| Cardinalita shop -> owner source | Iniziale: massimo 1 fonte mobile owner-scoped attiva per shop | `BLOCKED` finche constraint/test non esistono |
| Cardinalita owner source -> shop | Iniziale: massimo 1 shop attivo per `owner_user_id` mobile | `BLOCKED` finche constraint/test non esistono |
| Stati mapping | `mapped`, `unmapped`, `not_configured`, `mobile_only` | `PLANNED` |
| `audit_logs` | Non blocca read-only se assente, ma UI deve mostrare `Audit not configured`; obbligatorio prima di `TASK-006` e azioni sensibili | `BLOCKED` per azioni, `PLANNED` per read-only |
| `sync_events` | Separato da `audit_logs`; osservabilita tecnica mobile, non audit amministrativo | `PLANNED` |
| Boundary | Client solo UI; Server authz/data access/mapping/redazione; Database RLS/grants/constraint/view | `BLOCKED` finche non implementato |

## 8. DEC-005D-01 - `profiles`

### Opzioni valutate

| Opzione | Pro | Rischi |
| --- | --- | --- |
| Usare solo `auth.users` | Meno tabelle | Accoppia dominio Admin Web ad auth schema; poco spazio per stato profilo, audit e membership |
| Tabella `profiles` separata con mapping 1:1 a `auth.users` | Mantiene dominio applicativo chiaro; supporta stato profilo, membership, revoca/audit | Richiede migration, RLS e gestione bootstrap |
| Tabella `profiles` con ID indipendente e `auth_user_id` unique | Massima flessibilita | Piu complessa, rischio duplicazione identita |

### Scelta raccomandata

Creare in futuro una tabella applicativa `profiles` separata, mappata 1:1 a `auth.users.id`. La migration review dovra decidere se usare:

- `profile_id uuid primary key references auth.users(id)`; oppure
- `profile_id uuid primary key` + `auth_user_id uuid unique not null references auth.users(id)`.

Raccomandazione iniziale: usare `profile_id` come ID applicativo equivalente a `auth.users.id`, per ridurre mapping superfluo finche non esiste un bisogno reale di ID separato.

### Perche

- Mantiene `profiles` come entita Admin Web, coerente con Master Plan e domain type.
- Evita query dirette al dominio `auth.users` come sorgente prodotto.
- Supporta membership multi-shop senza fondere account personale e staff POS.

### Alternative scartate

- Solo `auth.users`: scartata per coupling e mancanza di campi/stati applicativi.
- ID completamente indipendente: scartata per complessita iniziale non necessaria.

### Condizioni minime per execution

- Migration proposta e reviewata.
- RLS/grants definiti per `profiles`.
- Mapper `Database` -> view model Admin Web.
- Test authorized/unauthorized.
- Scan no secret.

### Safety gate collegati

- Schema Admin Web: `BLOCKED`.
- Tipi `Database`: `BLOCKED`.
- Boundary server/client: `BLOCKED`.

## 9. DEC-005D-02 - `platform_admin`

### Opzioni valutate

| Opzione | Pro | Rischi |
| --- | --- | --- |
| Tabella dedicata `platform_admins` | Revoca chiara; auditabile; fonte autorevole queryable server-side | Richiede bootstrap sicuro e RLS/grants |
| Role/membership globale | Riusa RBAC | Rischio confusione con `shop_members`; scope globale/shop meno netto |
| App metadata server-managed | Rapido in auth context | JWT stale; non ideale come fonte primaria di revoca immediata |
| Allowlist server-only temporanea | Utile per bootstrap iniziale | Fragile se diventa permanente; rischio drift |

### Scelta raccomandata

Usare una tabella dedicata `platform_admins` come fonte autorevole server-side.

App metadata server-managed puo essere valutata solo come cache/ottimizzazione e mai come unica fonte per azioni sensibili. Allowlist server-only e ammessa solo come bootstrap temporaneo con scadenza, owner, audit e task di rimozione.

### Perche

- Revoca e audit sono piu chiari.
- Evita autorizzazione basata su URL, local state, mock, email client o `user_metadata`.
- Mantiene separati privilegi globali platform e membership shop-scoped.

### Alternative scartate

- Role/membership globale come unica fonte: scartata per rischio di confusione con shop scope.
- App metadata come fonte primaria: scartata per rischio token stale.
- Allowlist permanente: scartata come rischio operativo.

### Condizioni minime per execution

- Auth SSR definita.
- `platform_admins` schema/migration reviewati.
- Revoca verificabile.
- Test `authorized`, `unauthorized`, `revoked`, `stale token`.
- Error redaction e no data leak.
- Audit o access log minimo definito.

### Safety gate collegati

- `platform_admin`: `BLOCKED`.
- RLS/global read: `BLOCKED`.
- Audit/security: `BLOCKED` per azioni sensibili.

## 10. DEC-005D-03 - `shop_inventory_sources`

### Opzioni valutate

| Opzione | Pro | Rischi |
| --- | --- | --- |
| Tabella ponte nativa Admin Web | Mapping esplicito e auditabile | Richiede migration e policy |
| Vista/read model sopra schema mobile | Meno duplicazione | Rischio bypass RLS o ambiguita owner/shop |
| Boundary server-only senza tabella | Semplice all'inizio | Mapping non persistente o poco auditabile |

### Scelta raccomandata

Creare in futuro una tabella ponte nativa Admin Web, chiamata provvisoriamente `shop_inventory_sources`, e consumarla tramite server read model. La UI non deve interrogare direttamente inventory mobile o questa tabella.

Campi candidati, non definitivi:

- `shop_inventory_source_id`
- `shop_id`
- `source_kind` con valore iniziale candidato `mobile_owner`
- `owner_user_id`
- `mapping_state`
- `created_at`
- `created_by_profile_id`
- `verified_at`
- `verified_by_profile_id`
- `disabled_at`

### Perche

- Rende esplicito che `owner_user_id` mobile non e `shop_id`.
- Permette stati non mappati senza inventare dati live.
- Riduce rischio di data leak cross-shop.

### Alternative scartate

- Leggere direttamente `inventory_*` da UI/client: vietato.
- Vista mobile come unica fonte iniziale: rimandata finche schema/RLS live non sono verificati.
- Mapping solo in codice server: scartato per bassa auditabilita.

### Condizioni minime per execution

- Migration e RLS della tabella ponte reviewate.
- Constraint di cardinalita definiti.
- Test mapping ambiguous/unmapped/mobile_only.
- Mapper server-side verso view model.
- No mutation in percorso read-only.

### Safety gate collegati

- Mapping owner/shop: `BLOCKED`.
- Read model inventory: `BLOCKED`.
- RLS shop/global: `BLOCKED`.

## 11. DEC-005D-04 - Cardinalita mapping

### Scelta raccomandata

Per la prima execution read-only:

- `shop_id -> owner_user_id`: massimo 1 fonte mobile owner-scoped attiva per shop.
- `owner_user_id -> shop_id`: massimo 1 shop attivo per owner source mobile.

Mapping molti-a-molti e fuori scope finche il modello mobile resta owner-scoped.

### Perche

Il modello mobile e owner-scoped. Collegare lo stesso `owner_user_id` a piu shop rischia di mostrare lo stesso inventario mobile come se appartenesse a piu root business. Collegare piu owner source allo stesso shop rischia conflitti di ownership e duplicazione dati.

### Alternative scartate

- Molti shop per owner source: scartato per rischio data leak.
- Molti owner source per shop: scartato per conflitti non risolti.

### Condizioni minime per execution

- Constraint o indice unico parziale su mapping attivi.
- Test mapping duplicato.
- Stato `unmapped` o `not_configured` per casi non risolti.

## 12. DEC-005D-05 - Stati mapping

### Stati raccomandati

| Stato | Significato | UI futura |
| --- | --- | --- |
| `mapped` | Mapping approvato e verificabile tra shop e fonte mobile | Mostrare dato live/read model solo se authz e RLS passano |
| `unmapped` | Fonte mobile nota ma non collegata a shop approvato | `Mapping required` |
| `not_configured` | Shop senza fonte inventory configurata | `Not configured` |
| `mobile_only` | Fonte mobile esiste ma non deve essere esposta ad Admin Web | `Mobile only` |

### Safety gate collegati

- UI states: `PLANNED`.
- Mapping owner/shop: `BLOCKED`.
- Mapper schema -> view model: `BLOCKED`.

## 13. DEC-005D-06 - Audit e `sync_events`

### Scelta raccomandata

- `audit_logs` resta entita Admin Web separata.
- `sync_events` resta osservabilita tecnica mobile/catalog/prezzi, non audit amministrativo.
- Per `TASK-005` read-only, l'assenza di `audit_logs` puo essere accettata solo se la UI mostra chiaramente `Audit not configured` e non inventa righe.
- Per `TASK-006` e per azioni sensibili, `audit_logs` o equivalente append-only e obbligatorio prima di execution.

### Perche

- Evita di usare eventi tecnici mobile come prova amministrativa.
- Permette di non bloccare ogni lettura read-only se l'audit backend non e ancora disponibile.
- Mantiene il gate forte sulle future azioni controllate.

### Alternative scartate

- Trattare `sync_events` come audit Admin Web: scartato.
- Bloccare ogni lettura read-only se audit non esiste: scartato perche `Audit not configured` e stato gia accettato come stato UI futuro.

### Condizioni minime per execution

- Stato UI `Audit not configured` verificato se audit manca.
- Nessun mock audit presentato come live.
- Se audit esiste, RLS/read-only e mapper verificati.

## 14. DEC-005D-07 - Boundary Client / Server / Database

| Livello | Responsabilita | Vietato |
| --- | --- | --- |
| Client/browser | Rendering UI, stati, badge `Mock`/`Live`/`Not configured`, interazioni non autorevoli | Query sensibili, verifica `platform_admin`, service-role key, fallback mock come live |
| Server Admin Web | Auth SSR, verifica `platform_admin`, data access read-only, mapping `Database` -> view model, redazione errori | Autorizzazione basata solo su input client, URL, local state, email hardcoded |
| Database/Supabase | RLS, grants minimi, constraint, ownership, eventuali viste/read model | Tabelle esposte senza RLS, view RLS-bypass non reviewate, funzioni `security definer` in schema esposto |

### Scelta raccomandata

Tutte le letture Platform Admin sensibili devono passare da boundary server-side. Il client riceve view model gia autorizzato e redatto.

### Condizioni minime per execution

- File server candidati approvati prima della creazione:
  - `src/lib/supabase/server.ts`
  - `src/server/platform-admin/authz.ts`
  - `src/server/platform-admin/read-model.ts`
  - `src/server/platform-admin/mappers.ts`
  - `src/server/platform-admin/inventory-sources.ts`
- Test server authorized/unauthorized.
- Error redaction test.
- No direct DB import nei client component.

## 15. Env template futuro

Non creare env template in `TASK-005D`.

Nomi variabile candidati, senza valori:

### Client-safe

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Server-only

- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Regole:

- Nessun valore reale nel repository.
- Nessun secret con prefisso `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY` e ammessa solo server-side e solo dopo review specifica; non e prerequisito automatico per `TASK-005` read-only.
- Env template futuro deve includere commenti su client-safe vs server-only.
- Secret/redaction scan obbligatorio prima di execution.

## 16. Harness futuri concreti

| Harness | Scopo | Quando richiesto |
| --- | --- | --- |
| Static scan no service-role client | Fallire se `SERVICE_ROLE`, `service_role` o variabili server-only appaiono in client/bundle-facing files | Prima di qualunque client Supabase |
| Static scan no secret/redaction | Fallire su valori sospetti `.env`, JWT, token, connection string, chiavi reali | Prima di commit/execution |
| No mutation read-only path | Verificare assenza di `insert`, `update`, `delete`, `upsert`, RPC mutative nei read model `TASK-005` | Prima di `TASK-005` |
| Mapper tests | Coprire `Database` -> view model per profiles, shops, members, audit, inventory source states | Quando esistono tipi `Database` |
| Authz tests `platform_admin` | `authorized`, `unauthorized`, `revoked`, `stale token`, no data leak | Quando auth SSR esiste |
| RLS tests | owner mobile, member shop, non-member, platform admin global read, no cross-shop | Quando migration/RLS esistono |
| Mapping tests | `mapped`, `unmapped`, `not_configured`, `mobile_only`, duplicate mapping blocked | Quando `shop_inventory_sources` esiste |
| UI state smoke | `Mock`, `Live`, `Read model`, `Not configured`, `Unauthorized`, `Empty`, `Error`, `Audit not configured`, `Mapping required`, `Mobile only` | Quando UI cambia |
| Schema mismatch | Fallire se query/mapper non corrispondono a tipi generati | Quando tipi `Database` esistono |

Nessun harness viene implementato in `TASK-005D`.

## 17. Criteri per aprire vera execution Supabase

Una execution Supabase puo essere aperta solo se:

1. `TASK-005D` e approvato in review documentale.
2. Esiste un task successivo esplicito per schema/migration o foundation execution.
3. Lo schema candidato e tradotto in migration reviewata.
4. Auth SSR e boundary server sono definiti.
5. Env template futuro e definito senza valori reali.
6. Tipi `Database` sono generabili da schema reale.
7. RLS/grants sono progettati e testabili.
8. `platform_admin` ha fonte autorevole server-side e revoca verificabile.
9. Mapping `owner_user_id -> shop_id` ha constraint e stati.
10. Harness no secret/no service-role/no mutation sono disponibili o pianificati nel task execution.
11. `TASK-005` resta bloccato finche i gate sopra non hanno evidence reale.

## 18. Safety gate aggiornati

| Gate | Stato dopo TASK-005D | Cosa serve |
| --- | --- | --- |
| Schema Admin Web | `BLOCKED` | Migration reviewata per `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, eventuale `audit_logs` |
| Auth SSR | `BLOCKED` | Client/server boundary approvato e implementato in task futuro |
| `platform_admin` | `BLOCKED` | Tabella dedicata, revoca, test, audit/access log |
| Mapping owner/shop | `BLOCKED` | Constraint 1:1 iniziali, stati mapping, test |
| RLS/grants | `BLOCKED` | Policy per exposed schema e grants minimi |
| Env template | `BLOCKED` | File futuro senza valori reali, con distinzione public/server-only |
| Tipi `Database` | `BLOCKED` | Generazione da schema reale verificato |
| Read-only/no mutation | `BLOCKED` | Scan/test sui read model |
| UI states | `PLANNED` | Smoke solo quando UI cambia |
| Supabase live | `NOT_RUN` | Vietato in questo task |

## 19. Check non eseguiti

- `npm run build`: `NOT_RUN`, planning-only.
- `npm run verify`: `NOT_RUN`, planning-only.
- `npm run lint`: `NOT_RUN`, planning-only.
- `npm run typecheck`: `NOT_RUN`, planning-only.
- Playwright/smoke UI: `NOT_RUN`, nessuna UI/runtime modificata.
- Supabase live/migration/seed/query: `NOT_RUN`, vietato.
- iOS build: `NOT_RUN`, fuori perimetro.
- Android build: `NOT_RUN`, fuori perimetro.
- Commit: `NOT_RUN`, vietato.

## 20. Fuori scope

- Nessuna migration SQL.
- Nessun Supabase live.
- Nessun client Supabase.
- Nessuna installazione dipendenze.
- Nessun tipo `Database` generato.
- Nessun env reale o template creato.
- Nessun CRUD.
- Nessun login/auth runtime.
- Nessuna UI runtime.
- Nessuna query live.
- Nessuna modifica Android/iOS/POS.
- Nessuna execution `TASK-005`.
- Nessuna anticipazione `TASK-006`.

## 21. Stato finale raccomandato

- Piano `TASK-005D`: `READY_FOR_REVIEW`.
- Stato task: `PLANNED_BLOCKED`.
- Execution runtime: `BLOCKED`.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`.

## 22. Prossimo passo consigliato

Review documentale di `TASK-005D`. Se approvato, aprire un task successivo separato per schema/migration planning o foundation execution, senza sbloccare `TASK-005` finche non esistono evidence reali su schema, auth SSR, RLS, env, tipi `Database`, mapping e `platform_admin`.

## 23. Conferme finali

- Nessun commit eseguito.
- Nessuna migration creata.
- Nessun client Supabase creato.
- Nessuna dipendenza installata.
- Nessun tipo `Database` generato.
- Nessun env creato o letto.
- Nessun Supabase live usato.
- Nessun dato reale collegato alla UI.
- Nessun secret inserito.
- Nessuna service-role key esposta.
- Nessuna modifica runtime/UI.
- Nessuna modifica Android/iOS/POS.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`.

## 24. Addendum review Codex planning-only

Review eseguita in modalita `PLANNING_REVIEW_ONLY` sul piano `TASK-005D`, sul Master Plan, sui task predecessori e sullo stato locale della repo Admin Web.

### Verdict review

- Verdict: `READY_FOR_REVIEW`.
- Motivo: il piano resta planning-only, non introduce runtime e copre le decisioni bloccanti richieste. I gap trovati erano documentali e sono stati integrati in questo addendum: evidence `rg`, rischi espliciti, harness addizionali, UX futura, performance/manutenzione e note Supabase security correnti.
- Stato task: `PLANNED_BLOCKED`.
- Execution runtime: `BLOCKED`.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`.

### File riletti per review

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005D-supabase-schema-auth-boundary-decision.md`
- `docs/TASKS/TASK-005C-admin-web-supabase-schema-boundary-planning.md`
- `docs/TASKS/TASK-005B-admin-web-supabase-domain-mapping-boundary-decision.md`
- `docs/TASKS/TASK-005A-supabase-source-alignment-foundation-readiness.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/supabase-security.md`
- `package.json`
- `src/domain/platform-admin/types.ts`
- `src/domain/platform-admin/mock.ts`

Nota sicurezza: non sono stati letti o stampati file `.env` o valori secret. Gli scan sono stati limitati a file/documenti consentiti e a pattern senza esporre valori reali.

### Comandi review eseguiti

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree documentale: `M docs/MASTER-PLAN.md`; task docs `TASK-004`, `TASK-005`, `TASK-005A`, `TASK-005B`, `TASK-005C`, `TASK-005D` non tracciati. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked solo su `docs/MASTER-PLAN.md`; i task docs untracked non compaiono nello stat Git standard. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff` | `PASS_WITH_NOTES` | Diff tracked solo documentale su `docs/MASTER-PLAN.md`; i nuovi task docs restano untracked. |
| `find docs -maxdepth 4 -type f \| sort` | `PASS` | Conferma presenza di governance, ADR, skills, evidence e task fino a `TASK-005D`. |
| `find src -maxdepth 5 -type f \| sort` | `PASS` | Conferma sorgenti UI/domain esistenti; nessun file Supabase runtime. |
| `cat package.json` | `PASS` | Script presenti: `dev`, `build`, `lint`, `typecheck`, `verify`, Playwright/e2e; nessuna dipendenza `@supabase/*`. |
| `rg -n "TASK-005|TASK-005A|TASK-005B|TASK-005C|TASK-005D|Supabase|RLS|platform_admin|platform_admins|profiles|shop_inventory_sources|owner_user_id|shop_id|shop_code|audit_logs|sync_events|service-role|SERVICE_ROLE|NEXT_PUBLIC|Database|verify|typecheck|lint|build|harness|evidence|PASS_WITH_NOTES|BLOCKED|NOT_RUN|DONE|REVIEW|READY_FOR_REVIEW|PLANNED_BLOCKED" . -g '!node_modules/**' -g '!.git/**' -g '!.env*'` | `PASS_WITH_NOTES` | Output molto ampio e coerente con documentazione, `package-lock`, mock e task. Nessuna evidenza di runtime Supabase Admin Web. Eseguito con esclusione di `node_modules`, `.git` e file env per evitare rumore/secret. |
| Scan mirato `supabase/`, `*.sql`, `@supabase`, `createClient`, `Database`, `SUPABASE_` in `src`, `package.json` e docs consentiti | `PASS` | Nessuna cartella `supabase/`, nessuna migration SQL, nessun client Supabase, nessun tipo `Database`, nessuna env runtime Supabase trovata nel perimetro Admin Web. |

### Stato Supabase repo-grounded

Admin Web resta `SUPABASE_RUNTIME_ABSENT`:

- nessuna cartella `supabase/`;
- nessuna migration SQL Admin Web;
- nessun client Supabase;
- nessuna dipendenza `@supabase/*`;
- nessun env template Supabase reale;
- nessun tipo generato `Database`;
- nessuna auth SSR;
- nessuna RLS reale in questa repo;
- nessuna query live;
- nessun dato reale collegato alla UI.

### Coerenza Master Plan e task

| Area | Verdict | Nota |
| --- | --- | --- |
| `TASK-005D` nel Master Plan | `PASS` | Task attivo in `REVIEW`, `PLANNING_HANDOFF`, `PLANNED_BLOCKED`. |
| `TASK-005C` | `PASS` | Review documentale ricevuta con verdict `READY_FOR_REVIEW`; resta planning-only / `PLANNED_BLOCKED`. |
| `TASK-005` | `PASS` | Resta `PLANNED_BLOCKED`; nessuna execution Supabase sbloccata. |
| `TASK-006` | `PASS` | Non anticipato; audit resta obbligatorio per azioni sensibili future. |
| Stati finali | `PASS` | Nessun `DONE`, production-ready o execution-ready dichiarato per `TASK-005D` o `TASK-005`. |

### Decisioni confermate

| Decisione | Verdict | Nota review |
| --- | --- | --- |
| `profiles` separata 1:1 con `auth.users` | `PASS` | Coerente con dominio Admin Web, membership multi-shop e separazione account personale/staff POS. La scelta `profile_id = auth.users.id` vs `profile_id + auth_user_id unique` resta correttamente rimandata a migration review. |
| `platform_admins` tabella autorevole server-side | `PASS_WITH_NOTES` | Scelta prudente. Restano obbligatori bootstrap sicuro, revoca verificabile, access log/audit e test token stale/no data leak. |
| `shop_inventory_sources` tabella ponte | `PASS_WITH_NOTES` | Scelta piu prudente rispetto a lettura diretta mobile; richiede constraint, policy, mapper e test anti cross-shop leak. |
| Cardinalita 1 fonte mobile attiva per shop | `PASS_WITH_NOTES` | Riduce rischio data leak. Richiede indice unico parziale o constraint sui mapping attivi. |
| Cardinalita 1 shop attivo per `owner_user_id` | `PASS_WITH_NOTES` | Coerente con modello mobile owner-scoped iniziale. Multi-shop/mobile-owner resta fuori scope finche non c'e nuova decisione. |
| Stati `mapped`, `unmapped`, `not_configured`, `mobile_only` | `PASS_WITH_NOTES` | Stati corretti. Serve copy UI non tecnico e mapper che non mostri dati non autorizzati. |
| `audit_logs` separato da `sync_events` | `PASS` | `sync_events` resta osservabilita tecnica mobile. `Audit not configured` e accettabile solo read-only. |
| Boundary Client / Server / Database | `PASS_WITH_NOTES` | Matrice corretta. Aggiunti harness contro direct DB import, mock-as-live, `user_metadata` authz e error leak. |
| Env futuro solo nomi | `PASS` | Nessun valore reale; distinzione public/server-only corretta. Service-role non e prerequisito automatico per read-only. |

### Rischi espliciti integrati

| Area | Rischio | Mitigazione richiesta prima di execution |
| --- | --- | --- |
| `profiles` | Coupling eccessivo a `auth.users` se la PK applicativa viene scelta senza review | Migration review deve scegliere consapevolmente tra ID equivalente e `auth_user_id` unique. |
| `platform_admins` | Bootstrap fragile o admin non revocabile rapidamente | Processo bootstrap server-only, revoca testata, access log/audit e test `revoked`/`stale token`. |
| `shop_inventory_sources` | Mapping errato produce data leak cross-shop | Constraint sui mapping attivi, mapper server-side, RLS test e test `duplicate/ambiguous`. |
| Stati mapping | Stato ambiguo puo far sembrare live un dato non autorizzato | Copy UI esplicito, badge stato, nessun fallback mock come live, test UI state. |
| Audit | `sync_events` usato impropriamente come audit amministrativo | Label tecnica separata e `Audit not configured` quando `audit_logs` non esiste. |
| Boundary | Import DB/client Supabase in componenti client | Static scan no direct DB import nei client component. |
| Env | Secret server-only esposto con prefisso `NEXT_PUBLIC_` | Secret/redaction scan e scan server-only-in-client. |
| Performance | Query globali non paginate o mapper N+1 | Limit/paginazione server-side, summary separata da liste, query budget nel task execution. |
| Manutenzione | Schema troppo ampio blocca execution piccole | Task futuri piccoli: schema/migration, auth boundary, harness, poi read-only. |

### Harness futuri aggiunti alla review

Questi harness restano solo requisiti futuri; non sono implementati in `TASK-005D`.

| Harness futuro | Scopo | Quando richiesto |
| --- | --- | --- |
| No direct DB import nei client component | Fallire se componenti client o UI importano client DB/Supabase/server-only modules | Prima di collegare dati live alla UI |
| No mock-as-live | Fallire se dati mock/sintetici sono etichettati o fusi come `Live` | Prima di `TASK-005` UI/data integration |
| No `user_metadata` authz | Fallire se authorization/RLS usa `user_metadata` o `raw_user_meta_data` | Prima di auth/RLS execution |
| No cross-shop leakage nei mapper | Testare che mapper e read model non restituiscano shop non autorizzati o mapping duplicati | Quando esistono mapper/schema reali |
| Error redaction tests | Verificare che errori UI/report non espongano SQL, token, email sensibili o dettagli interni inutili | Prima di UI live/read-only |
| Pagination/limit budget | Verificare limiti server-side e assenza di fetch globali non necessari | Prima di query read-only globali |
| Data API grants review | Verificare grants espliciti insieme a RLS per tabelle/vista/funzioni esposte | Prima di migration/apply |

### UX futura confermata

La futura UI read-only deve distinguere almeno:

- `Mock`;
- `Live`;
- `Read model`;
- `Not configured`;
- `Mapping required`;
- `Unauthorized`;
- `Empty`;
- `Error`;
- `Audit not configured`;
- `Unmapped`;
- `Mobile only`.

Requisiti UX/accessibilita futuri:

- nessun dato finto spacciato per live;
- copy operativo non tecnico per admin/operatori;
- errori redatti;
- azioni non disponibili assenti o disabilitate;
- separazione chiara tra `Platform Admin Console` e `Shop Admin Console`;
- nessuna gestione POS/staff ordinaria fuori dalla `Shop Admin Console`;
- focus/keyboard/contrasti da verificare solo quando la UI runtime cambia.

### Performance e manutenzione

- Il piano evita coupling diretto UI-database tramite server read model e mapper.
- Le viste/materializzazioni non devono essere create prima di review RLS/grants.
- Le future query Platform Admin devono avere paginazione/limit lato server e separare summary dashboard da liste dettagliate.
- Il mapping `owner_user_id -> shop_id` deve essere testabile in isolamento prima di qualunque dashboard globale.
- La futura execution deve rimanere piccola e verificabile; non accorpare schema, auth SSR, UI live e azioni controllate nello stesso task.

### Allineamento Supabase security docs

Verifica documentale pubblica, senza Supabase live:

- Le docs RLS Supabase confermano che RLS deve essere abilitata sulle tabelle in schema esposto e che le view possono bypassare RLS se non protette con `security_invoker` o schema non esposto.
- Le docs Data API confermano che grants e RLS sono livelli distinti; i grants espliciti vanno reviewati insieme alle policy.
- Le docs Auth confermano che l'utente Supabase Auth vive nello schema auth e riceve access token usabili con RLS.
- Il changelog Supabase indica il cambio verso tabelle non esposte automaticamente a Data/GraphQL API; quindi il piano deve prevedere review grants esplicita e non assumere default storici.

Implicazioni per `TASK-005D`:

- `user_metadata` / `raw_user_meta_data` resta vietato per authz.
- `app_metadata` puo essere solo server-managed/cache con rischio token stale.
- `security definer`, se mai necessario, deve restare fuori dallo schema esposto e con search path sicuro.
- `service_role` e chiavi secret restano vietate nel browser.

### Decisioni ancora aperte

- Nome finale e shape migration di `profiles`, incluso `profile_id = auth.users.id` vs `auth_user_id unique`.
- Processo bootstrap/revoca di `platform_admins`.
- Constraint esatto per mapping attivi in `shop_inventory_sources`.
- Quale ambiente Supabase diventera fonte autorevole per generare tipi `Database`.
- Se `audit_logs` sara disponibile gia in `TASK-005` o se la UI usera `Audit not configured`.
- Eventuali viste/read model inventory e loro schema esposto/non esposto.
- Dettaglio grants Data API per tabelle, view e funzioni future.

### Check `NOT_RUN` confermati

- `npm run build`: `NOT_RUN`, vietato in planning-only.
- `npm run verify`: `NOT_RUN`, vietato in planning-only.
- `npm run lint`: `NOT_RUN`, vietato in planning-only.
- `npm run typecheck`: `NOT_RUN`, vietato in planning-only.
- Playwright/smoke UI: `NOT_RUN`, nessuna UI/runtime modificata.
- Supabase live/migration/seed/query: `NOT_RUN`, vietato.
- iOS build: `NOT_RUN`, fuori perimetro.
- Android build: `NOT_RUN`, fuori perimetro.
- Commit: `NOT_RUN`, vietato.

### Rischi residui

- Nessuna evidence live Supabase e disponibile in questo task.
- Schema/migration/RLS/grants/env/tipi/auth SSR non esistono ancora.
- `platform_admin` e raccomandato ma non implementato ne verificato.
- Mapping owner/shop e solo decisione proposta; data leak cross-shop resta il rischio principale della futura execution.
- `TASK-005D` non autorizza produzione, runtime o `TASK-005`.

### Conferme review

- Nessun commit eseguito.
- Nessuna migration creata.
- Nessun client Supabase creato.
- Nessuna dipendenza installata.
- Nessun tipo `Database` generato.
- Nessun env creato o letto.
- Nessun Supabase live usato.
- Nessun dato reale collegato alla UI.
- Nessun secret inserito.
- Nessuna service-role key esposta.
- Nessuna modifica runtime/UI.
- Nessuna modifica Android/iOS/POS.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`.

## 25. Final review/fix gate

Review/fix finale eseguita in modalita `PLANNING_REVIEW_ONLY`.

### Verdict finale

- Verdict: `READY_FOR_REVIEW`.
- `DONE`: non applicabile in questo task, perche `TASK-005D` resta decision/planning-only, lo stato task resta `PLANNED_BLOCKED`, l'execution runtime resta `BLOCKED` e `TASK-005` resta `PLANNED_BLOCKED`.
- Motivo: nessun blocker documentale residuo trovato dopo i fix di evidence/harness/rischi; nessun gate runtime Supabase e stato superato o dichiarato superato.

### Fix documentali finali

- Allineata la riga `rg` dell'evidence al comando realmente consentito con esclusione di `node_modules`, `.git` e file env.
- Allineata la descrizione dello scan mirato includendo `src`, `package.json` e docs consentiti.
- Esplicitato che non esiste evidence directory dedicata a `TASK-005D`; l'evidence corrente vive nel file task e nel Master Plan.
- Esplicitato che `DONE` non e uno stato legittimo per `TASK-005D` in assenza di review utente e gate runtime reali.

### Evidence collegata

- Evidence dedicata `docs/TASKS/EVIDENCE/TASK-005D/`: assente e non creata, perche il task e documentale e non produce artifact runtime.
- Evidence documentale corrente:
  - questo file task;
  - `docs/MASTER-PLAN.md`;
  - output sintetizzati dei comandi ammessi;
  - riferimenti ufficiali Supabase pubblici consultati.

### Stato build e runtime

| Area | Stato | Motivo |
| --- | --- | --- |
| Admin Web build | `NOT_RUN` | Vietato dal task planning-only; nessuna modifica runtime. |
| Admin Web lint/typecheck/verify | `NOT_RUN` | Vietato dal task planning-only; nessuna modifica runtime. |
| Playwright/smoke UI | `NOT_RUN` | Nessuna UI/runtime modificata. |
| iOS build | `NOT_RUN` | Fuori perimetro. |
| Android build | `NOT_RUN` | Fuori perimetro. |
| Supabase live/migration/seed/query | `NOT_RUN` | Vietato dal task. |

### Cleanup scoped

- Cleanup automatico: `NOT_RUN`, vietato.
- Cleanup runtime: non applicabile, nessun runtime modificato.
- Cleanup dati: non applicabile, nessun dato reale o test data creato.
- Cleanup documentale: non sono stati rimossi warning o limiti utili.

### Regressioni ed edge case

Nessuna regressione runtime verificabile perche nessun codice e stato modificato. Gli edge case restano gate futuri e sono documentati:

- revoca `platform_admin`;
- token/app metadata stale;
- mapping duplicato o ambiguo `owner_user_id -> shop_id`;
- cross-shop leakage nei mapper;
- `Audit not configured` senza mock audit presentato come live;
- view/read model che bypassano RLS;
- grants Data API non allineati alle policy;
- fetch globali non paginati.

### Stato finale confermato

- `TASK-005D`: `READY_FOR_REVIEW`.
- Stato task: `PLANNED_BLOCKED`.
- Execution runtime: `BLOCKED`.
- `TASK-005`: `PLANNED_BLOCKED`.
- Commit: `NOT_RUN`.

## 26. TASK-005L global review reconciliation

- Data review: 2026-05-30.
- Review globale: `TASK-005L - Global Review / DONE Reconciliation`.
- Esito: `PASS_WITH_NOTES`.
- Decisione: `TASK-005D` era decision/planning-only e le decisioni sono state attuate e verificate da `TASK-005E`, `TASK-005F`, `TASK-005G`, `TASK-005H`, `TASK-005J` e `TASK-005K`.
- Evidence corrente: `docs/TASKS/TASK-005L-global-review-done-reconciliation.md` e `docs/TASKS/EVIDENCE/TASK-005L/README.md`.
- Stato finale: `DONE_AS_SUPERSEDED`.
