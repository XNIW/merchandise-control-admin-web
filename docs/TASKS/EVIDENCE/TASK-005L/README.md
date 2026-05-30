# Evidence - TASK-005L

## Sintesi

- Stato task: `DONE`
- Verdict globale: `PASS_WITH_NOTES`
- Data review: 2026-05-30
- Commit: `NOT_CREATED`
- Push: `NOT_RUN`
- `TASK-006`: `PLANNED`, non eseguito.

## Check gia eseguiti in review

| Check | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree sporca per task correnti e file storici non tracciati; nessun revert. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff coerente con audit/fix/documentazione. |
| `git diff --check` | `PASS` | Nessun output. |
| `npm run test:foundation` | `PASS` | 16 test passati dopo fix redirect auth. |
| `npm run security:scan` | `PASS` | Security scan passed. |
| `npm run lint` | `PASS` | `eslint` exit code 0. |
| `npm run typecheck` | `FIXED_THEN_PASS` | Primo run dopo fix redirect: `FAIL` per narrowing `string | null`; corretto con type predicate e rerun `PASS`. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build riuscita; route Platform/auth dinamiche; warning Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | Include lint, typecheck, security scan e build; warning Node `DEP0205`. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 22 test passati; warning Node `DEP0205`, `NO_COLOR`/`FORCE_COLOR` e HMR origin dev non bloccante. |
| `npm audit` | `PASS` | `found 0 vulnerabilities`. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth` | `PASS_WITH_WARNINGS` | Rerun finale: 1 test passato; route live, logout e cleanup verificati; warning Node/NO_COLOR non bloccanti. |
| `supabase migration list --linked` | `PASS` | Local/remote allineati fino a `20260530041048`. |
| `supabase db push --linked --dry-run` | `PASS` | Remote database up to date. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | No schema errors found. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | No issues found. |
| SQL catalog verification read-only | `PASS` | 6 RLS table, 0 anon grants, 0 mutative authenticated grants, 6 SELECT grants/policies, helper/trigger presenti. |
| SQL catalog verification post-live | `PASS` | 1 active platform admin, 0 profili dev/test residui, migration `005G` registrata, audit eventi append-only conservati. |

## Fix applicati

- Hardening auth redirect `next` in `src/components/auth/AuthForm.tsx` e `src/app/auth/callback/route.ts` per rifiutare path protocol-relative `//...`.
- Aggiunto guard statico in `tests/foundation/supabase-foundation.test.mjs`.
- Aggiunto controllo in `scripts/security-checks.mjs`.

## Conferme sicurezza

- Nessun secret salvato.
- Nessun service-role in client/browser.
- `.env.local` presente ma ignorato; contenuto non stampato.
- Read model ancora read-only.
- Nessun mock dichiarato live.
- Nessun CRUD o safe operation implementata.
