# TASK-005J - Platform Admin Auth Live Gates / UI Polish Gate

## Informazioni generali

- ID: `TASK-005J`
- Titolo: Platform Admin Auth Live Gates / UI Polish Gate
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / GLOBAL_REVIEW_001`
- Data apertura: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005J/README.md`
- Commit: `NOT_CREATED`, come richiesto.

## Obiettivo

Eseguire la pipeline sequenziale approvata:

1. risolvere bootstrap reale `platform_admin`;
2. validare sessione browser live Platform Admin;
3. solo dopo, eseguire Figma/UI polish;
4. solo dopo i gate live read-only, aprire `TASK-006A` per CRUD controllato.

## Documentazione letta

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/TASKS/TASK-005G-supabase-end-to-end-execution.md`
- `docs/TASKS/TASK-005H-supabase-final-readiness-task-005-unblock.md`
- `docs/TASKS/TASK-005I-platform-admin-read-only-data-completion.md`
- `docs/TASKS/EVIDENCE/TASK-005G/README.md`
- `docs/TASKS/EVIDENCE/TASK-005H/README.md`
- `docs/TASKS/EVIDENCE/TASK-005I/README.md`
- `supabase/config.toml`
- `supabase/migrations/`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/proxy.ts`
- `src/proxy.ts`
- `src/lib/supabase/database.types.ts`
- `src/server/platform-admin/authz.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/server/platform-admin/mappers.ts`
- `src/server/platform-admin/inventory-sources.ts`
- route Platform sotto `src/app/`
- componenti Platform sotto `src/components/platform/`
- `scripts/security-checks.mjs`
- `tests/foundation/supabase-schema.test.mjs`
- `tests/foundation/supabase-foundation.test.mjs`
- `tests/e2e/platform-admin.spec.ts`

Note:

- `src/lib/supabase/middleware.ts` e `middleware.ts` non esistono.
- Il progetto usa la convenzione Next.js 16 `src/proxy.ts` introdotta in `TASK-005H`.
- I file `.env*` sono stati letti solo internamente per caricare variabili; nessun valore e stato stampato.

## Pre-flight

| Check | Esito | Note |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree gia modificata da task precedenti; nessun revert eseguito. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff esistente su documenti, harness, script e file non tracciati. |
| `git diff --check` | `PASS` | Nessun whitespace error. |

## Gate 1A - Bootstrap platform_admin reale

Esito: `APPLIED`.

Verifica env runtime eseguita senza stampare valori:

- input bootstrap espliciti: `MISSING`;
- `NEXT_PUBLIC_SUPABASE_URL`: `MISSING`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `MISSING`;
- `SUPABASE_SERVICE_ROLE_KEY`: `MISSING`;
- credenziali browser test: `MISSING`.

Fallback deterministico:

- query remota sequenziale su `auth.users`: `AUTH_USERS_COUNT=1`;
- usato l'unico utente remoto dev autorizzato dal prompt;
- identita stampata solo come fingerprint `PROFILE_ID_SHA256_12`.

Comandi eseguiti:

- `npm run supabase:bootstrap-platform-admin`: dry-run con rollback `PASS`;
- `CONFIRM_PLATFORM_ADMIN_BOOTSTRAP=yes npm run supabase:bootstrap-platform-admin`: apply reale `APPLIED`.

Risultati verificati:

- `profile_exists=true`;
- `active_platform_admin_exists=true`;
- `bootstrap_audit_events=1`;
- `identity_source="exactly one auth user"`;
- nessuna email, UUID completo, token o secret stampato.

Post-bootstrap SQL catalog verification:

- active admin/auth user/profile: `1`;
- bootstrap audit events: `1`;
- RLS enabled admin tables: `6`;
- SELECT policies: `6`;
- audit append-only triggers: `2`;
- anon grants: `0`;
- authenticated mutative grants: `0`;
- helper `app_private.is_platform_admin()` filtra `status='active'` e `revoked_at is null`.

## Gate 1B - Browser live Platform Admin

Esito storico TASK-005J: `BLOCKED_MANUAL_BROWSER_SESSION`.

Esito post-TASK-005K: `PASS_LIVE_UI`.

Motivo:

- Gate 1A passa, ma non ci sono credenziali browser test;
- `SUPABASE_SERVICE_ROLE_KEY` non e presente in env, quindi non e stato usato Auth Admin generateLink;
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` non sono presenti nel runtime app;
- auth UI, callback e logout sono stati implementati, ma non equivalgono a sessione live.
- Il blocker e stato superato in `TASK-005K` con env runtime redatti, utente dev/test temporaneo e browser live Playwright.

File auth creati:

- `src/lib/supabase/client.ts`
- `src/components/auth/AuthForm.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/auth/logout/route.ts`

## Figma / UI polish

Esito: `NOT_RUN`.

Motivo:

- vietato proseguire a Fase 2 se Gate 1B non passa.

## CRUD TASK-006A

Esito: `NOT_RUN`.

Motivo:

- vietato aprire o implementare `TASK-006A` senza bootstrap reale, sessione browser live e read-only live verificato.

## Supabase remote checks

| Check | Esito | Note |
| --- | --- | --- |
| `supabase migration list --linked` | `PASS` | Local/remote allineati fino a `20260530041048`. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | `No issues found`. |
| `supabase db push --linked --dry-run` | `NOT_RUN` | Nessuna migration nuova creata o registrata. |
| SQL catalog verification read-only/bootstrap | `PASS` | RLS/grants/policy/helper/audit/platform_admin verificati. |
| SQL/test rollback CRUD | `NOT_RUN` | `TASK-006A` non aperto. |

## Check locali

| Check | Esito | Note |
| --- | --- | --- |
| `git status --short` finale | `PASS_WITH_NOTES` | Worktree modificata e non committata, come richiesto. |
| `git diff --stat` finale | `PASS_WITH_NOTES` | `git diff --stat` non include i file non tracciati `TASK-005J`; diff tracciato coerente con handoff. |
| `git diff --check` finale | `PASS` | Nessun whitespace error. |
| `npm run test:foundation` | `PASS` | 14 test passati. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run lint` | `PASS` | ESLint exit code 0. |
| `npm run typecheck` | `PASS` | `tsc --noEmit` exit code 0. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build riuscita; warning Node `DEP0205` da runtime Next/Turbopack. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Include lint, typecheck, security scan e build; warning Node `DEP0205`. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 22 test passati; warning Node `DEP0205`, `NO_COLOR`/`FORCE_COLOR` e blocked dev HMR origin non bloccante. |

## Stato finale raccomandato

- `TASK-005G`: `DONE`.
- `TASK-005H`: `READY_FOR_REVIEW` / `PASS_WITH_NOTES`.
- `TASK-005I`: `CLOSED_AS_BLOCKER_HANDOFF`.
- `TASK-005J`: `READY_FOR_REVIEW` / `PASS_WITH_NOTES`.
- `TASK-005K`: `READY_FOR_REVIEW` / `PASS_LIVE_UI_WITH_NOTES`.
- `TASK-005`: `READY_FOR_REVIEW`.
- `TASK-006A`: `NOT_RUN` / non aperto.
- `TASK-006`: `PLANNED`.

## Rischi residui

- Il rischio di sessione browser reale Platform Admin non disponibile e storico e risolto da `TASK-005K`.
- `TASK-005` passa a `READY_FOR_REVIEW` tramite `TASK-005K`; qualunque stato oltre review richiede conferma utente esplicita.
- `TASK-006A` non puo essere aperto in execution senza planning/review dedicati e autorizzazione separata.

## Prossimo passo

Review di `TASK-005J` insieme a `TASK-005K`, che ha completato il gate browser live.

## Sicurezza

- Nessun secret letto o salvato.
- Nessun `.env` reale letto o stampato.
- Nessun service-role nel client/browser.
- Nessun mock dichiarato come live.
- Nessun hard delete.
- Nessun commit.

## TASK-005K completion addendum

- `TASK-005K` ha completato Gate 1B con esito `PASS_LIVE_UI`.
- Runtime Supabase locale caricato tramite `.env.local` ignorato e CLI api-keys.
- Service-role usato solo in processo/test setup, mai browser/client.
- Utente dev/test temporaneo creato per login browser e ripulito a fine test.
- Post-cleanup: `auth.users=1`, `active_platform_admins=1`, profili dev/test residui `0`.
- Audit live browser event append-only mantenuti.
- Figma/UI polish resta `NOT_RUN`.
- CRUD `TASK-006A` resta `NOT_RUN`.

## TASK-005L global review reconciliation

- Data review: 2026-05-30.
- Review globale: `TASK-005L - Global Review / DONE Reconciliation`.
- Esito: `PASS_WITH_NOTES`.
- Decisione: `TASK-005J` ha completato Gate 1A e `TASK-005K` ha completato Gate 1B; Figma/UI polish e CRUD sono rimasti correttamente fuori scope.
- Evidence corrente: `docs/TASKS/TASK-005L-global-review-done-reconciliation.md` e `docs/TASKS/EVIDENCE/TASK-005L/README.md`.
- Stato finale: `DONE`.
