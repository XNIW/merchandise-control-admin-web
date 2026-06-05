# Evidence TASK-046 - Test target separation: local vs staging

## Stato

- Task: `TASK-046 - Test target separation: local vs staging`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data: `2026-06-05`
- Branch Admin Web: `codex/task-042-review-ci-win7pos-bridge`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_STAGED`
- No commit eseguito.
- No push eseguito.
- No stage finale.

## Separazione implementata

Test sempre sicuri, senza DB reale:

- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`

Test automatici locali:

- `npm run test:e2e:local`
- `npm run test:platform:local`
- `npm run test:shop:local`
- target Supabase: `http://127.0.0.1:54321` o `localhost:54321`
- `TEST_TARGET=local`

Test cloud staging/dev:

- `npm run test:e2e:staging`
- `npm run test:platform:staging`
- `npm run smoke:staging`
- `TEST_TARGET=staging`
- URL Supabase: `https://*.supabase.co`
- allowlist: `ALLOWED_STAGING_SUPABASE_PROJECT_REFS` o `STAGING_SUPABASE_PROJECT_REF`
- conferme: `ALLOW_STAGING_E2E=yes` e `CONFIRM_STAGING_E2E=yes` per E2E
- production project ref vietato via `SUPABASE_PRODUCTION_PROJECT_REF` o `PRODUCTION_SUPABASE_PROJECT_REFS`

Setup login locale Platform Master Console:

- `npm run platform:local:seed`
- `npm run platform:local:dev`
- `npm run platform:local:status`
- `npm run platform:local:cleanup`
- `npm run test:platform:local-login`
- account: `platform.local@example.test`
- password: solo env runtime `DEV_PLATFORM_ADMIN_PASSWORD`
- runbook: `docs/RUNBOOKS/platform-master-console-local-login.md`

## Guardrail

- `BLOCKED_TEST_TARGET_REQUIRED`
- `BLOCKED_LOCAL_SUPABASE_URL_REQUIRED`
- `BLOCKED_STAGING_CONFIRMATION_REQUIRED`
- `BLOCKED_STAGING_PROJECT_REF_NOT_ALLOWLISTED`
- `BLOCKED_PRODUCTION_PROJECT_REF_FORBIDDEN`
- `BLOCKED_STAGING_SUPABASE_URL_REQUIRED`

## Check eseguiti

| Comando | Esito |
| --- | --- |
| `node --test tests/foundation/task-046-test-target-separation.test.mjs` prima dell'implementazione | `FAIL_EXPECTED`, mancavano script/wrapper |
| `node --test tests/foundation/task-046-test-target-separation.test.mjs` dopo implementazione | `PASS`, `tests 2`, `pass 2`, `fail 0` |
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `tests 198`, `pass 198`, `fail 0` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS`, warning noti Next `middleware`/`proxy` e Node `DEP0205` |
| `npm run verify` | `PASS` |
| `npm run test:platform:local` | `PASS`, `1 passed`, Supabase locale da `supabase status --output env` |
| `npm run db:local:status` | `FAIL_EXPECTED_FAIL_CLOSED_ENV_LOCAL_POINTS_CLOUD`; output redatto, container locale PASS |
| `npm run db:staging:status` senza env staging | `FAIL_EXPECTED_BLOCKED_STAGING_SUPABASE_URL_REQUIRED` |
| `NEXT_PUBLIC_SUPABASE_URL=https://jpgoimipbothfgkokyvm.supabase.co SUPABASE_PROJECT_REF=jpgoimipbothfgkokyvm ALLOWED_STAGING_SUPABASE_PROJECT_REFS=jpgoimipbothfgkokyvm ALLOW_STAGING_E2E=yes npm run db:staging:status` | `PASS`, URL cloud e project ref allowlistato |
| `node --test tests/foundation/task-046-platform-local-login-environment.test.mjs` prima dell'implementazione | `FAIL_EXPECTED`, mancavano runbook e script |
| `node --test tests/foundation/task-046-platform-local-login-environment.test.mjs` dopo implementazione | `PASS`, `tests 2`, `pass 2`, `fail 0` |
| `npm run platform:local:status` | `PASS`, Supabase locale validato, auth user `platform.local@example.test` assente |
| `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes DEV_PLATFORM_ADMIN_PASSWORD=<runtime-generated> npm run test:platform:local-login` | `PASS`, `1 passed`, login UI verso `Platform Overview` |
| `npm run platform:local:cleanup` | `PASS`, auth user locale cancellato, audit append-only trattenuti |
| `npm run platform:local:status` post-cleanup | `PASS`, auth user assente |

## Note di sicurezza

- Nessun secret stampato o salvato.
- Nessuna nuova dipendenza.
- `.env.local` non decide il target dei test.
- Le whitelist governance dei foundation test storici accettano `TASK-046` come task attivo.
- Il setup Platform local login rifiuta Supabase non locale e non legge `.env.local`.
- Il dev server locale passa solo URL/key pubblica Supabase al browser, non la service-role key.
- Staging non avvia dev server locale in Playwright.
- Staging smoke e read-only e non contiene delete, reset o accesso privilegiato.
- No commit, no push, no stage.
