# TASK-046 - Test target separation: local vs staging

## Informazioni generali

- ID: `TASK-046`
- Titolo: `Test target separation: local vs staging`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-05`
- Ultimo aggiornamento: `2026-06-05`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-046/README.md`
- Branch Admin Web: `codex/task-042-review-ci-win7pos-bridge`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_STAGED`
- No commit eseguito.
- No push eseguito.
- No stage finale.

## Obiettivo

Separare in modo esplicito test sempre sicuri, test automatici locali e test cloud staging/dev, evitando che `.env.local` decida implicitamente il target del test.

## Regole implementate

- I test sempre sicuri restano target-independent:
  - `npm run security:scan`
  - `npm run test:foundation`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `npm run verify`
- I test locali passano da `TEST_TARGET=local` e richiedono Supabase locale `http://127.0.0.1:54321` o `localhost:54321`.
- I test staging passano da `TEST_TARGET=staging`, URL Supabase `https://*.supabase.co`, project ref allowlistato e conferma esplicita.
- Nessun test staging puo usare production project ref.
- Nessun test staging crea o cancella dati reali.
- Cleanup locale puo essere aggressivo sui dati mutabili sintetici; audit append-only restano preservati.
- Nessuna nuova dipendenza `cross-env`.

## Script aggiunti

- `db:local:status`
- `db:staging:status`
- `test:e2e:local`
- `test:e2e:staging`
- `test:platform:local`
- `test:platform:staging`
- `test:shop:local`
- `smoke:staging`
- `platform:local:seed`
- `platform:local:cleanup`
- `platform:local:status`
- `platform:local:dev`
- `test:platform:local-login`

## Estensione operativa - Platform Master Console local login

Su richiesta successiva e mantenendo `TASK-046` come task attivo, e stato aggiunto un setup locale ripetibile per entrare manualmente nella Platform Master Console senza usare production e senza far decidere il target a `.env.local`.

- Account locale previsto: `platform.local@example.test`.
- Password: solo da env runtime `DEV_PLATFORM_ADMIN_PASSWORD`, mai committata o stampata.
- Seed: `npm run platform:local:seed`.
- Dev server locale con env Supabase locale process-only: `npm run platform:local:dev`.
- Login manuale: `http://127.0.0.1:3000/auth/login?next=/platform`.
- Route Platform Master Console: `http://127.0.0.1:3000/platform`.
- Runbook: `docs/RUNBOOKS/platform-master-console-local-login.md`.
- Smoke automatico gated: `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes npm run test:platform:local-login`.

## File toccati

- `package.json`
- `playwright.config.ts`
- `scripts/db/local-status.mjs`
- `scripts/db/staging-status.mjs`
- `scripts/platform/local-login-setup.mjs`
- `scripts/platform/local-dev-server.mjs`
- `scripts/testing/target-guardrails.mjs`
- `scripts/testing/run-playwright-target.mjs`
- `tests/e2e/staging/platform-staging-smoke.spec.ts`
- `tests/e2e/task-046-platform-local-login.spec.ts`
- `tests/foundation/task-046-test-target-separation.test.mjs`
- `tests/foundation/task-046-platform-local-login-environment.test.mjs`
- `tests/foundation/*` governance whitelist per `TASK-046`
- `scripts/security-checks.mjs`
- `docs/MASTER-PLAN.md`
- `docs/RUNBOOKS/platform-master-console-local-login.md`
- `docs/TASKS/TASK-046-test-target-separation-local-vs-staging.md`
- `docs/TASKS/EVIDENCE/TASK-046/README.md`

## Evidence

- Foundation TASK-046 red iniziale: `FAIL_EXPECTED`, script e wrapper mancanti.
- Foundation TASK-046 green: `PASS`, `tests 2`, `pass 2`.
- `npm run security:scan`: `PASS`.
- `npm run test:foundation`: `PASS`, `tests 198`, `pass 198`, `fail 0`.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run build`: `PASS`, warning noti Next `middleware`/`proxy` e Node `DEP0205`.
- `npm run verify`: `PASS`.
- `npm run test:platform:local`: `PASS`, `1 passed`, target locale verificato.
- `npm run db:local:status`: `FAIL_EXPECTED_FAIL_CLOSED_ENV_LOCAL_POINTS_CLOUD`, con output redatto e container locale PASS.
- `npm run db:staging:status`: `FAIL_EXPECTED_BLOCKED_STAGING_SUPABASE_URL_REQUIRED` senza env staging esplicita.
- `NEXT_PUBLIC_SUPABASE_URL=https://jpgoimipbothfgkokyvm.supabase.co SUPABASE_PROJECT_REF=jpgoimipbothfgkokyvm ALLOWED_STAGING_SUPABASE_PROJECT_REFS=jpgoimipbothfgkokyvm ALLOW_STAGING_E2E=yes npm run db:staging:status`: `PASS`, URL cloud e project ref allowlistato.
- Foundation Platform local login red iniziale: `FAIL_EXPECTED`, mancavano runbook e script.
- Foundation Platform local login green: `PASS`, `tests 2`, `pass 2`.
- `npm run platform:local:status`: `PASS`, guardrail locale passato, account `platform.local@example.test` inizialmente assente.
- `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes DEV_PLATFORM_ADMIN_PASSWORD=<runtime-generated> npm run test:platform:local-login`: `PASS`, `1 passed`.
- `npm run platform:local:cleanup`: `PASS`, auth user locale cancellato, audit append-only trattenuti.
- `npm run platform:local:status` post-cleanup: `PASS`, auth user assente.

## Stato

- Handoff a `REVIEW`.
- Nessun commit, push o stage.
- Nessun deploy production.
- Nessun dato reale usato.
