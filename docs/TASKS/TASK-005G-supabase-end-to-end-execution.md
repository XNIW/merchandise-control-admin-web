# TASK-005G - Supabase End-to-End Execution

## Stato

- Stato task: `DONE`
- Verdict tecnico: `PASS_WITH_NOTES`
- Tipo: execution Supabase controllata, read-only Admin Web
- Deriva da:
  - `TASK-005D - Supabase Schema / Auth Boundary Decision`
  - `TASK-005E - Supabase Foundation Execution`
  - `TASK-005F - Supabase Schema / RLS / Auth SSR Planning`
- Stato `TASK-005`: resta `PLANNED_BLOCKED`
- Commit: `PENDING_USER_APPROVED_MAIN_MERGE`

## Obiettivo

Implementare la foundation reale necessaria per future letture Platform Admin senza aprire ancora `TASK-005`:

- migration Supabase per schema Admin Web;
- RLS e grants minimi per read-only;
- auth boundary SSR server-side;
- tipi `Database` generati dallo schema reale;
- read model server-side read-only;
- UI collegata solo al read model server-side con fallback `not_configured`/`unauthorized`;
- harness tecnici e documentali.

## Scope applicato

### Schema Supabase

Migration creata:

- `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`

Oggetti introdotti:

- schema privato `app_private`;
- `public.profiles`;
- `public.shops`;
- `public.shop_members`;
- `public.platform_admins`;
- `public.shop_inventory_sources`;
- `public.audit_logs`;
- helper `app_private.is_platform_admin()`;
- helper `app_private.is_active_shop_member(uuid)`;
- trigger append-only per `audit_logs`;
- policy RLS read-only per `authenticated`;
- grants `SELECT` a `authenticated` sulle nuove tabelle;
- nessun grant tabella a `anon`.

Note:

- `platform_admin` e una tabella dedicata server-managed.
- `profiles.profile_id` referenzia `auth.users(id)`.
- `owner_user_id -> shop_id` resta prudente 1:1 iniziale per mapping `mapped` attivi.
- `shop_inventory_sources.mapping_state` include `mapped`, `unmapped`, `not_configured`, `mobile_only`, `ambiguous`.
- `sync_events` resta separato da `audit_logs`.

### Applicazione migration

`supabase db push --linked --dry-run` e stato bloccato da migration history remota gia esistente e non presente in questa repo Admin Web.

Decisione operativa:

- non riparare o riscrivere la storia remota;
- non toccare migration mobile/iOS/Android preesistenti;
- validare la migration in transazione con rollback;
- applicare lo stesso SQL tramite `supabase db query --linked --file ...`.

Esito:

- validazione transazionale con `begin; ... rollback;`: `PASS`;
- applicazione SQL remota: `PASS`;
- `supabase db lint --linked --schema public,app_private --level error --fail-on error`: `PASS`, nessun schema error.

Nota governance:

- la migration SQL e presente in repo;
- l'applicazione remota e avvenuta via query diretta per evitare interventi distruttivi sulla migration history remota;
- resta da riconciliare formalmente la migration history prima di usare `supabase db push` come gate standard.

### RLS / grants verificati

Verifiche remote:

- RLS abilitata su `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, `audit_logs`: `PASS`;
- policy SELECT create sulle sei tabelle: `PASS`;
- grants solo `authenticated SELECT` sulle nuove tabelle: `PASS`;
- nessun grant tabella a `anon`: `PASS`;
- helper privilegiati in `app_private`: `PASS`;
- no `user_metadata` / `raw_user_meta_data` in authz: `PASS`.

Test sintetici in transazione con rollback:

- platform admin legge globalmente profili/shop/audit/mapping: `PASS`;
- shop owner legge solo il proprio shop/read model: `PASS`;
- utente non autorizzato non legge cross-shop: `PASS`;
- platform admin revocato bloccato: `PASS`;
- insert da ruolo `authenticated` bloccato dai grants: `PASS`;
- update/delete audit bloccati dal trigger append-only: `PASS`;
- duplicate active owner/shop mapping bloccati dagli indici: `PASS`.

Nessun dato sintetico dei test e stato lasciato persistente.

### Auth SSR / read model

File principali:

- `src/lib/supabase/server.ts`
- `src/server/platform-admin/authz.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/platform-section-data.ts`

Decisione applicata:

- `@supabase/ssr` usa cookie server-side Next.js;
- il client Supabase resta in `server-only`;
- `getUser()` valida la sessione server-side;
- `platform_admins` attiva e non revocata autorizza la console;
- il read model esegue solo `.select()`;
- nessun `insert`, `update`, `delete`, `upsert`, `rpc` nel boundary Admin Web;
- nessuna service-role key lato client/browser.

### Tipi `Database`

Generati da schema reale:

- `src/lib/supabase/database.types.ts`

Include le nuove tabelle Admin Web e lo schema pubblico esistente del progetto Supabase.

### UI read-only

Le pagine Platform Admin ora leggono dati tramite server boundary:

- `/`
- `/platform`
- `/platform/users`
- `/platform/shops`
- `/platform/audit`
- `/platform/system`
- `/platform/operations`

Comportamento:

- senza env runtime o senza sessione Platform Admin valida: stato vuoto `not_configured`/`unauthorized`, nessun mock mostrato come live;
- con sessione Platform Admin valida: rows read-only da Supabase RLS;
- operazioni mutative sempre disabilitate;
- nessun client Supabase nel browser.

## File creati

- `.env.example`
- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`
- `src/lib/supabase/database.types.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `tests/foundation/supabase-schema.test.mjs`
- `docs/TASKS/TASK-005G-supabase-end-to-end-execution.md`
- `docs/TASKS/EVIDENCE/TASK-005G/README.md`

## File modificati

- `.gitignore`
- `package.json`
- `package-lock.json`
- `docs/MASTER-PLAN.md`
- `src/lib/supabase/server.ts`
- `src/server/platform-admin/authz.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/mappers.ts`
- `src/server/platform-admin/inventory-sources.ts`
- `src/app/page.tsx`
- `src/app/platform/page.tsx`
- `src/app/platform/users/page.tsx`
- `src/app/platform/shops/page.tsx`
- `src/app/platform/audit/page.tsx`
- `src/app/platform/system/page.tsx`
- `src/app/platform/operations/page.tsx`
- `src/components/platform/AppShell.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/components/platform/components/DataTable.tsx`
- `scripts/security-checks.mjs`
- `tests/e2e/platform-admin.spec.ts`
- `tests/foundation/supabase-foundation.test.mjs`

## Check eseguiti

| Check | Esito | Note |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree non committato, come richiesto. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff ampio coerente con TASK-005E/F/G. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git diff` | `PASS_WITH_NOTES` | Diff ispezionato. |
| `find docs -maxdepth 4 -type f \| sort` | `PASS` | Task/evidence presenti. |
| `find src -maxdepth 5 -type f \| sort` | `PASS` | Boundary e pagine presenti. |
| `cat package.json` | `PASS` | Script e dipendenze coerenti. |
| `cat .env.example` | `PASS` | Solo nomi variabile, valori vuoti. |
| `supabase --version` | `PASS` | CLI `2.101.0`. |
| `supabase projects list --output-format json` | `PASS` | Un solo progetto attivo identificato. |
| `supabase init` | `PASS` | Config locale creata. |
| `supabase link` | `PASS` | Project link creato senza stampare secret. |
| `supabase migration new task_005g_admin_web_schema_rls` | `PASS` | Migration file creato. |
| `supabase db push --linked --dry-run` | `BLOCKED_EXPECTED` | History remota contiene migration preesistenti fuori repo. |
| Query remota in transazione rollback | `PASS` | Migration valida senza persistere test data. |
| Query remota di applicazione migration | `PASS` | SQL applicato. |
| Verifica RLS/grants/policy | `PASS` | Nuove tabelle protette. |
| Test RLS sintetici in rollback | `PASS` | Cross-shop e revoked admin bloccati. |
| `supabase gen types --linked --lang=typescript --schema public` | `PASS` | Tipi generati. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | Nessun schema error. |
| `npm install @supabase/ssr` | `PASS` | 0 vulnerabilita. |
| `npm run test:foundation` | `PASS` | 8 test passati. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run lint` | `PASS` | Nessun output. |
| `npm run typecheck` | `PASS` | Nessun output. |
| `npm run build` | `PASS_WITH_WARNINGS` | Warning Node `DEP0205` da runtime Next/Turbopack. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Include lint, typecheck, security scan, build. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 20 test passati; warning Next dev origin/HMR non bloccante. |

## NOT_RUN / BLOCKED

- `supabase start` locale: `ABORTED`, avviava download Docker non necessario; nessuna migration locale applicata.
- `supabase db advisors --linked`: `BLOCKED`, pooler temporaneo ha risposto con circuit breaker dopo comandi remoti paralleli; non e stato insistito.
- `supabase migration list --linked` finale: `BLOCKED`, stesso circuit breaker temporaneo; una lettura precedente aveva gia evidenziato migration remote-only.
- Seed permanente: `NOT_RUN`, vietato nello scope.
- CRUD/mutazioni UI: `NOT_RUN`, vietato nello scope.
- iOS/Android/POS build: `NOT_RUN`, fuori perimetro.

## Safety gate aggiornati

- `TASK-005` resta `PLANNED_BLOCKED`.
- Nessuna service-role key nel client/browser.
- Nessun secret inserito nel repository.
- `.env.example` resta senza valori.
- `platform_admin` richiede tabella server-managed e sessione SSR valida.
- Read model e UI restano read-only.
- `audit_logs` e append-only; CRUD futuro richiede audit writes esplicite.
- `sync_events` resta separato da audit amministrativo.
- `owner_user_id -> shop_id` resta 1:1 iniziale per mapping attivi.
- `supabase db push` resta gate da riconciliare prima di workflow migration standard.

## Rischi residui

- La migration history remota non e allineata con questa repo Admin Web; serve riconciliazione prima di usare `db push`.
- Non esiste ancora un bootstrap permanente approvato per il primo `platform_admin` reale.
- Auth middleware per refresh cookie non e stato introdotto; il client SSR e pronto ma la gestione completa session lifecycle resta task separato.
- Le pagine live richiedono env runtime e sessione Platform Admin valida.

## Stato finale

- `TASK-005G`: `DONE`
- `TASK-005`: `PLANNED_BLOCKED`
- Commit: `PENDING_USER_APPROVED_MAIN_MERGE`

## Review addendum

Review sicurezza-first post-handoff:

- Fix applicato: le pagine Platform Admin e la root `/` esportano `dynamic = "force-dynamic"` per evitare prerender/static cache su dati auth/session scoped.
- Fix applicato: harness `security:scan` e `test:foundation` verificano che le route Platform restino request-time.
- Fix applicato: messaggi stale legati a `TASK-005E` sostituiti con wording coerente con `TASK-005G`.
- Check review: `supabase db advisors --linked --type security --level error --fail-on error` rieseguito con esito `PASS`.
- User approval: conferma esplicita ricevuta il 2026-05-30 con review tecnica `PASS_WITH_NOTES`; `TASK-005H` autorizzato.
- Stato finale: `TASK-005G` chiuso come `DONE` per conferma utente; `TASK-005` resta `PLANNED_BLOCKED`.

## Prossimo passo consigliato

Eseguire `TASK-005H` per riconciliare migration history/registry e definire bootstrap controllato del primo `platform_admin` reale prima di rivalutare `TASK-005`.
