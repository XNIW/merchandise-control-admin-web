# Evidence - TASK-006 Platform Admin Controlled Actions

## Stato

- Task: `TASK-006 - Platform Admin Controlled Actions`
- Fase: `EXECUTION_HANDOFF`
- Execution: `COMPLETED`
- Stato finale Codex: `READY_FOR_REVIEW`
- Verdict review/fix: `PASS_WITH_NOTES`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## File creati/modificati

- Creato: `supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql`
- Creato: `src/server/platform-admin/action-types.ts`
- Creato: `src/server/platform-admin/audit-events.ts`
- Creato: `src/server/platform-admin/shop-action-validation.ts`
- Creato: `src/server/platform-admin/shop-actions.ts`
- Creato: `src/app/platform/operations/actions.ts`
- Creato: `tests/foundation/platform-admin-actions.test.mjs`
- Creato: `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`
- Modificato: `src/lib/supabase/database.types.ts`
- Modificato: `src/app/platform/operations/page.tsx`
- Modificato: `src/components/platform/AppShell.tsx`
- Modificato: `src/components/platform/PlatformPage.tsx`
- Modificato: `src/components/platform/platformData.ts`
- Modificato: `src/domain/platform-admin/types.ts`
- Modificato: `src/server/platform-admin/mappers.ts`
- Modificato: `src/server/platform-admin/platform-section-data.ts`
- Modificato: `eslint.config.mjs`
- Modificato: `scripts/security-checks.mjs`
- Modificato: `tests/foundation/supabase-schema.test.mjs`
- Modificato: `tests/e2e/platform-admin.spec.ts`
- Modificato: `tests/e2e/platform-admin-live-auth.spec.ts`
- Modificato: `docs/MASTER-PLAN.md`
- Modificato: `docs/TASKS/TASK-006-platform-admin-controlled-actions.md`
- Modificato: `docs/TASKS/EVIDENCE/TASK-006/README.md`

## Implementazione

- Migration forward-only applicata a Supabase linked.
- RPC atomiche `security definer` per create, suspend, reactivate e soft delete.
- Doppia autorizzazione: `authorizeCurrentPlatformAdmin()` lato server TypeScript e `app_private.is_platform_admin()` lato SQL.
- Audit obbligatorio per attempt/success/blocked/failure con payload redatto.
- Soft delete implementato come `shops.shop_status='archived'`; nessun hard delete.
- Create shop assegna owner iniziale in `shop_members` nella stessa transazione.
- Nessun service-role client/browser e nessun secret stampato.
- Nessuna modifica mobile/POS e nessuna mutazione automatica di `shop_inventory_sources`.

## Review/fix correttiva 2026-05-30

- Rimossa l'etichetta fuorviante `Safe Operations` dalla pagina mutativa; la superficie e ora `Controlled Operations`.
- Aggiunto banner risultato azione redatto via redirect query allowlistata e `aria-live`.
- Aggiunte conferme shop code visibili anche per suspend/reactivate, non solo hidden input.
- Aggiornata la shell: sulle operations il badge e `Controlled actions`, non `Read-only`.
- Esteso `scripts/security-checks.mjs` per controllare RPC approvate, redirect risultato redatto, conferme visibili e assenza di label `Safe Operations`.
- Review/fix integrativa Long Goal: incluso `.sql` nei file testuali attraversati dal secret scan generico, cosi le migration SQL rientrano nel controllo JWT/service-role-like.
- Aggiornato `eslint.config.mjs` per ignorare `playwright-report/**` e `test-results/**`; `npm run verify` non fallisce piu se gli artifact Playwright sono assenti.

## Supabase evidence

| Check | Esito | Sintesi |
| --- | --- | --- |
| `supabase migration list --linked` | `PASS` | Local/remoto allineati; `20260530120000` presente su entrambi. |
| `supabase db push --linked --dry-run` | `PASS` | Output review/fix: `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | Output: `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | Output: `No issues found`. |
| `supabase db push --linked` | `PASS` | Migration applicata con successo. |
| `supabase gen types typescript --linked > src/lib/supabase/database.types.ts` | `PASS` | Tipi rigenerati dopo apply. |
| Remote catalog verification | `PASS` | `shops_columns=5`, `task006_rpcs=4`, mutative grants Admin Web per `authenticated=0`, grant `anon=0`, RLS admin tables `6`. |
| Remote grants/audit verification | `PASS` | `audit_failure_allowed=1`, execute RPC per `authenticated=4`, execute RPC per `anon=0`, trigger audit append-only `2`. |

## Local checks

| Check | Esito | Sintesi |
| --- | --- | --- |
| `npm run typecheck` | `PASS` | `tsc --noEmit` completato senza errori. |
| `npm run test:foundation` | `PASS` | 20 test passati, inclusi harness TASK-006 e controllo `.sql` nello scanner. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run lint` | `PASS` | `eslint` completato senza errori. |
| `npm run build` | `PASS` | Next build completato; `/platform/operations` resta dynamic. Nota solo warning Node `DEP0205`. |
| `npm run verify` | `PASS` | lint, typecheck, security scan e build completati; `/platform/operations` dynamic. Nota solo warning Node `DEP0205`. |
| `npm run test:ui-smoke` | `FAIL_EXPECTED_ENV` | Playwright ha provato ad avviare `npm run dev`, ma Next ha segnalato server gia attivo su `localhost:3002`; nessun processo ucciso. |
| `PLAYWRIGHT_BASE_URL=http://localhost:3002 PLAYWRIGHT_REUSE_SERVER=1 npm run test:ui-smoke` | `PASS` | 22 test passati desktop/tablet. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes ... platform-admin-live-auth.spec.ts` | `PASS_WITH_NOTES` | 1 test live passato, 1 TASK-006 saltato senza flag dedicato. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes CONFIRM_PLATFORM_ADMIN_TASK006_LIVE_TEST=yes ... platform-admin-live-auth.spec.ts` | `PASS` | 2 test live passati; create/suspend/reactivate/archive su dati sintetici. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `node --test tests/foundation/platform-admin-actions.test.mjs` | `PASS` | TDD integrativo: prima RED sul controllo `.sql`, poi 3 test passati dopo il fix scanner. |

## Check iniziali corretti

- `npm run verify` era inizialmente fallito per harness ESLint fragile su `test-results` assente. Fix: ignore esplicito in `eslint.config.mjs`; rerun `PASS`.
- `npm run test:ui-smoke` default ha trovato un dev server Next gia attivo su `localhost:3002`. Come da protocollo, non e stato ucciso alcun processo; rerun con `PLAYWRIGHT_BASE_URL=http://localhost:3002 PLAYWRIGHT_REUSE_SERVER=1` e `PASS`.
- I primi retry Supabase linked hanno colpito circuit breaker per password DB non disponibile; dopo password fornita dall'utente e uso process-only di `SUPABASE_DB_PASSWORD`, dry-run/lint/advisors sono passati. La password non e stata salvata o stampata.

## Dati live sintetici

- Il test live completo usa `TASK006_TEST_<nonce>` come `shop_code`.
- Il profilo Platform Admin sintetico viene rimosso da `auth.users` in cleanup.
- Lo shop sintetico resta archiviato per preservare audit e semantica append-only.
- Nessun dato reale, token, password o secret e stato copiato in evidence.

## Conferme negative

- Nessun `TASK-006A/B/C/D/E` creato.
- Nessun service-role esposto al browser.
- Nessun secret hardcoded.
- Nessun hard delete.
- Nessuna cancellazione audit.
- Nessuna modifica Android/iOS/POS.
- Nessun commit.
- Nessun push.
- Task non marcato `DONE`.

## Rischi residui

- La UI e server-rendered/progressive: i risultati successo/errore sono redatti via banner dopo redirect, ma non introduce ancora un layer client ricco con pending state visuale dedicato.
- I record sintetici TASK-006 restano archiviati nel database remoto per audit trail; eventuale pulizia fisica richiederebbe decisione separata e non sarebbe coerente con questo task.
- `DONE` non e marcato da Codex: richiede review positiva e conferma esplicita utente secondo `AGENTS.md`.
