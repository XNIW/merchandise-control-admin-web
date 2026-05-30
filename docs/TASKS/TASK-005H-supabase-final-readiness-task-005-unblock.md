# TASK-005H - Supabase Final Readiness: Migration Registry, Platform Admin Bootstrap, SSR Session Lifecycle e TASK-005 Unblock

## Informazioni generali

- ID: `TASK-005H`
- Titolo: Supabase Final Readiness: Migration Registry, Platform Admin Bootstrap, SSR Session Lifecycle e TASK-005 Unblock
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / GLOBAL_REVIEW_001`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005H/README.md`
- Commit: `NOT_CREATED`, come richiesto dal prompt TASK-005H.

## Dipendenze

- `TASK-005G - Supabase End-to-End Execution`: gia `DONE` da approvazione utente precedente registrata in repo.
- `TASK-005 - Platform Admin Read-only Data`: resta `PLANNED_BLOCKED`.
- Documentazione letta:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `docs/MASTER-PLAN.md`
  - task `TASK-005`, `TASK-005A`, `TASK-005B`, `TASK-005C`, `TASK-005D`, `TASK-005E`, `TASK-005F`, `TASK-005G`
  - `docs/TASKS/EVIDENCE/TASK-005G/README.md`
  - `supabase/config.toml`
  - `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`
  - `.env.example`
  - `package.json`
  - `scripts/security-checks.mjs`
  - Supabase/Platform Admin server boundary e route Platform.
- Documentazione framework consultata:
  - Next.js locale `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
  - Next.js locale `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
  - Next.js locale `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/next-response.md`
  - Next.js locale `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
  - Supabase changelog e docs ufficiali SSR/migrations consultati nel task.

## Obiettivo

Ridurre i blocker residui dopo `TASK-005G`:

- riconciliare migration history/registry remoto;
- preparare bootstrap sicuro del primo `platform_admin` reale;
- completare session lifecycle Supabase SSR tramite Next.js 16 Proxy;
- rivalutare se `TASK-005` puo essere sbloccato.

## Non incluso

- Commit.
- CRUD Admin Web.
- Safe operations.
- Creazione/sospensione/riattivazione/cancellazione shop.
- Login UI completa.
- Staff POS, PIN o password.
- Service-role key nel client/browser.
- Seed permanente.
- Hardcode di email, UUID, token o secret.
- Reset remoto, drop oggetti remoti o repair distruttivo.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Pre-flight git e secret safety eseguiti senza stampare `.env` reali. | `PASS_WITH_NOTES` |
| CA-02 | Migration history remota e locale riconciliata senza riscrivere storia remota. | `PASS` |
| CA-03 | Migration `20260530041048` registrata come applied solo dopo verifica oggetti reali. | `PASS` |
| CA-04 | `supabase db push --linked --dry-run` non mostra pending migration pericolose. | `PASS` |
| CA-05 | Bootstrap CLI sicuro per primo `platform_admin` preparato e testato staticamente. | `PASS_WITH_NOTES` |
| CA-06 | Bootstrap reale applicato solo con input esplicito. | `BLOCKED_INPUT_REQUIRED` |
| CA-07 | Session lifecycle Supabase SSR aggiunto senza login UI e senza authz in Proxy. | `PASS` |
| CA-08 | Harness aggiornati per bootstrap, proxy, read-only e safety. | `PASS` |
| CA-09 | Gate live/read-only `TASK-005` rivalutato. | `BLOCKED_WITH_EVIDENCE` |

## Matrice CA -> evidence

| CA | Evidence | Esito |
|---|---|---|
| CA-01 | `git status --short`, `git diff --stat`, `git diff --check`; nessun `.env` reale letto o stampato. | `PASS_WITH_NOTES` |
| CA-02 | Importati nella repo Admin Web i 17 file migration canonici presenti nel workspace Supabase locale e gia applicati da remoto; SHA-256 sorgente/destinazione combaciano. | `PASS` |
| CA-03 | Query remota read-only su tabelle, RLS, policy, grants, helper e trigger TASK-005G: tutti presenti; registry inizialmente `false`; poi `supabase migration repair --linked --status applied 20260530041048`. | `PASS` |
| CA-04 | `supabase db push --linked --dry-run`: `Remote database is up to date.` | `PASS` |
| CA-05 | `scripts/supabase/bootstrap-platform-admin.mjs`; `npm run test:foundation`; `npm run security:scan`. | `PASS_WITH_NOTES` |
| CA-06 | `npm run supabase:bootstrap-platform-admin` senza env: `BLOCKED_INPUT_REQUIRED` su `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID`. | `BLOCKED_INPUT_REQUIRED` |
| CA-07 | `src/proxy.ts`; `src/lib/supabase/proxy.ts`; Next.js 16 Proxy usata al posto di `middleware.ts`. | `PASS` |
| CA-08 | `tests/foundation/supabase-foundation.test.mjs` e `scripts/security-checks.mjs` aggiornati. | `PASS` |
| CA-09 | Nessun `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID` reale e nessuna sessione browser Platform Admin valida disponibili nel prompt. | `BLOCKED_WITH_EVIDENCE` |

## Migration history / registry

Stato iniziale:

- 17 migration storiche erano applicate da remoto ma assenti dalla repo Admin Web.
- `20260530041048_task_005g_admin_web_schema_rls.sql` era presente localmente ma non registrata da remoto perche applicata in `TASK-005G` via query diretta.

Azioni:

- Importati i file canonici esatti da `/Users/minxiang/Desktop/MerchandiseControlSupabase/supabase/migrations/`.
- Non importata `20260424190000_harden_rls_and_sync_indexes.sql` dal workspace Android perche non risultava nel registry remoto e avrebbe creato pending migration non autorizzata.
- Verificata corrispondenza SHA-256 fra sorgente canonica e copie in `supabase/migrations/`.
- Verificati oggetti `TASK-005G` gia applicati: sei tabelle Admin Web, RLS, policy SELECT, grants `authenticated SELECT`, nessun grant `anon`, helper `app_private`, due trigger audit append-only.
- Eseguito `supabase migration repair --linked --status applied 20260530041048`.
- Verificato `supabase migration list --linked`: local e remote allineati per tutte le versioni.
- Verificato `supabase db push --linked --dry-run`: database remoto up to date.

## Bootstrap platform_admin

Implementato:

- `scripts/supabase/bootstrap-platform-admin.mjs`
- script npm `supabase:bootstrap-platform-admin`

Lo script:

- gira solo da CLI;
- richiede `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID`;
- richiede `PLATFORM_ADMIN_BOOTSTRAP_REASON`;
- richiede `CONFIRM_PLATFORM_ADMIN_BOOTSTRAP`;
- valida UUID;
- usa `supabase db query --linked` e SQL temporaneo locale con permessi `0600`;
- verifica esistenza in `auth.users`;
- crea profilo applicativo minimo se assente;
- inserisce `platform_admins` active se non gia presente;
- non cancella righe revoked;
- scrive audit redatto `platform_admin.bootstrap.granted`;
- usa rollback quando `CONFIRM_PLATFORM_ADMIN_BOOTSTRAP` non e `yes`;
- applica davvero solo con `CONFIRM_PLATFORM_ADMIN_BOOTSTRAP=yes`.

Stato reale:

- Bootstrap execution: `BLOCKED_INPUT_REQUIRED`.
- Motivo: il prompt non fornisce `auth.users.id` reale dell'account personale da promuovere.
- Impatto: non esiste ancora una sessione Platform Admin reale verificabile via UI.
- Prossimo passo: fornire `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID` dell'account reale da promuovere e rieseguire prima in dry-run, poi con `CONFIRM_PLATFORM_ADMIN_BOOTSTRAP=yes`.

## Session lifecycle Supabase SSR

Implementato:

- `src/lib/supabase/proxy.ts`
- `src/proxy.ts`

Decisione framework:

- Next.js 16 documenta che `middleware.ts` e deprecato e rinominato `proxy.ts`.
- Per questo task e stata usata la convenzione Next.js 16 `src/proxy.ts` invece di creare nuovo `middleware.ts`.

Comportamento:

- usa `@supabase/ssr` server-side;
- chiama `supabase.auth.getClaims()` per refresh sessione/cookie;
- sincronizza cookie su request e response;
- non decide `platform_admin`;
- non legge dati business;
- non usa service-role key;
- matcher esclude `_next/static`, `_next/image`, `favicon.ico` e asset statici comuni.

## Read-only live gate TASK-005

Risultato: `TASK-005` resta `PLANNED_BLOCKED`.

Gate passati:

- schema Admin Web presente;
- RLS/grants verificati;
- migration registry allineato;
- `db push --dry-run` pulito;
- SSR Proxy presente;
- read model resta read-only;
- nessun client Supabase nel browser;
- nessun service-role key client/browser;
- route Platform restano `dynamic = "force-dynamic"`.

Gate bloccanti residui:

- manca bootstrap reale del primo `platform_admin`;
- manca sessione browser/manuale valida come Platform Admin;
- manca verifica UI live con account `platform_admin` reale;
- manca verifica post-bootstrap di audit event persistente.

## Check eseguiti

| Check | Esito | Note |
|---|---|---|
| `git status --short` | `PASS_WITH_NOTES` | Branch locale `codex/task-005h-final-readiness`, worktree modificata, nessun commit. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff include migration import, proxy, bootstrap, harness e docs. |
| `git diff --check` | `PASS` | Nessun whitespace error nel pre-flight. |
| `supabase migration list --linked` iniziale | `PASS_WITH_NOTES` | 17 migration remote-only; `20260530041048` local-only. |
| Import migration canoniche | `PASS` | 17 file importati dal workspace Supabase locale. |
| SHA-256 migration importate | `PASS` | Hash sorgente/destinazione combacianti. |
| Query remota oggetti TASK-005G | `PASS` | Oggetti reali presenti; registry TASK-005G inizialmente assente. |
| `supabase migration repair --linked --status applied 20260530041048` | `PASS` | Tracking table aggiornata senza rieseguire SQL. |
| `supabase migration list --linked` finale | `PASS` | Local/remote allineati. |
| `supabase db push --linked --dry-run` | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | Nessun schema error. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | No issues found. |
| `npm run test:foundation` RED | `PASS_WITH_NOTES` | 2 test 005H falliti prima dell'implementazione, come atteso. |
| `npm run test:foundation` GREEN | `PASS` | 11 test passati. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run supabase:bootstrap-platform-admin` senza env | `BLOCKED_INPUT_REQUIRED` | Input reale mancante; nessuna mutazione remota eseguita. |
| `npm run typecheck` | `PASS` | TypeScript passa dopo Proxy/script. |
| `npm run verify:full` | `PASS_WITH_WARNINGS` | Include lint, typecheck, security scan, build e 20 smoke test Playwright passati. Warning non bloccanti: Node `DEP0205` e `NO_COLOR`/`FORCE_COLOR`. |

## NOT_RUN / BLOCKED

- Bootstrap reale `platform_admin`: `BLOCKED_INPUT_REQUIRED`, manca `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID`.
- UI live con sessione Platform Admin: `BLOCKED_MANUAL_BROWSER_SESSION`, manca account/sessione reale validata.
- Post-bootstrap SQL verify audit persistente: `BLOCKED_INPUT_REQUIRED`, dipende dal bootstrap reale.
- `TASK-005` a `READY_FOR_REVIEW` o `READY_FOR_DONE_CONFIRMATION`: `BLOCKED`, gate live non tutti superati.
- Commit: `NOT_RUN`, vietato dal prompt.

## File creati

- `docs/TASKS/TASK-005H-supabase-final-readiness-task-005-unblock.md`
- `docs/TASKS/EVIDENCE/TASK-005H/README.md`
- `scripts/supabase/bootstrap-platform-admin.mjs`
- `src/lib/supabase/proxy.ts`
- `src/proxy.ts`
- 17 migration storiche importate in `supabase/migrations/`

## File modificati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005H-supabase-migration-registry-platform-admin-bootstrap-readiness.md`
- `package.json`
- `scripts/security-checks.mjs`
- `tests/foundation/supabase-foundation.test.mjs`

## Rischi residui

- Il primo `platform_admin` reale non e ancora bootstrapato.
- Senza sessione browser reale non si puo dichiarare il gate UI live completo.
- La CLI Supabase segnala versione disponibile `2.102.0`; non aggiornata in questo task.
- La migration Android `20260424190000_harden_rls_and_sync_indexes.sql` resta non importata perche non applicata nel registry remoto.

## Handoff

- Verdict tecnico `TASK-005H`: `READY_FOR_REVIEW` con blocker documentati.
- `TASK-005G`: resta `DONE`.
- Nota storica: `TASK-005` restava `PLANNED_BLOCKED`.
- Prossimo agente: `USER / REVIEW`.
- Azione consigliata: fornire `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID` reale dell'account da promuovere, eseguire dry-run/apply controllato, poi validare sessione browser Platform Admin prima di rivalutare `TASK-005`.

## TASK-005L global review reconciliation

- Data review: 2026-05-30.
- Review globale: `TASK-005L - Global Review / DONE Reconciliation`.
- Esito: `PASS_WITH_NOTES`.
- Decisione: i blocker residui `TASK-005H` sono stati risolti da `TASK-005J` e `TASK-005K`; migration registry, Proxy/session lifecycle e harness restano validi.
- Evidence corrente: `docs/TASKS/TASK-005L-global-review-done-reconciliation.md` e `docs/TASKS/EVIDENCE/TASK-005L/README.md`.
- Stato finale: `DONE`.
