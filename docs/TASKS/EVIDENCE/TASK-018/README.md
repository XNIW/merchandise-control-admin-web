# TASK-018 Evidence

## Stato finale

- Stato task: `DONE_RECONCILED`
- Verdict Codex: `PASS_WITH_NOTES`
- Verdict finale: `DONE`
- Data: `2026-05-31`
- Commit/push/stage: non eseguiti.

## File toccati

- `.github/workflows/ci.yml`
- `package.json`
- `scripts/security-checks.mjs`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`
- `supabase/migrations/20260531234500_task_018_backup_table_lockdown.sql`
- `supabase/migrations/20260531235000_task_018_trigger_search_path_hardening.sql`
- `supabase/migrations/20260531235500_task_018_member_invite_lint_cleanup.sql`
- `docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md`
- `docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md`
- `docs/TASKS/TASK-018-infrastructure-security-hardening-pos-foundation.md`
- `docs/TASKS/EVIDENCE/TASK-018/README.md`
- `docs/MASTER-PLAN.md`
- `README.md`

## Letture obbligatorie eseguite

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-015-complete-shop-admin-console.md`
- `docs/TASKS/TASK-016-complete-platform-admin-console.md`
- `docs/TASKS/TASK-017-shop-business-completion.md`
- migration Supabase attuali
- `scripts/security-checks.mjs`
- `tests/foundation/*`
- `tests/e2e/*`
- guide locali Next.js in `node_modules/next/dist/docs/` per Playwright, CI build caching, env vars, TypeScript e CLI.

## Riferimenti esterni letti come functional reference

- Android: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/docs/SUPABASE.md`
- Android: `/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView/docs/MASTER-PLAN.md`
- iOS: `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/MASTER-PLAN.md`
- Win7 POS: `DbInitializer.cs`, `PinHelper.cs`, `UserRepository.cs`, `UserAccount.cs`, `CurrentSession.cs`, `PermissionCodes.cs`, `SecurityRepository.cs`

Nessun file Android, iOS o Win7 POS e stato modificato.

## CI

Workflow creato: `.github/workflows/ci.yml`.

La pipeline esegue:

- `npm ci`
- install Chromium Playwright
- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:ui-smoke:ci`
- `git diff --check`

Non configura deploy automatico e non richiede secret. Le variabili Supabase pubbliche restano opzionali per i check locali standard.

## Supabase security hardening

Problema trovato:

- `20260514213110_task108_backup_20260514173049.sql` aveva creato backup table legacy in schema `public` con `owner_user_id` hardcoded.

Fix:

- `20260531234500_task_018_backup_table_lockdown.sql` abilita/forza RLS e revoca `public`, `anon`, `authenticated` sulle backup table TASK-108 se esistono.
- `20260531235000_task_018_trigger_search_path_hardening.sql` imposta `set search_path = public, pg_temp` su `public.set_shared_sheet_sessions_updated_at`.
- `20260531235500_task_018_member_invite_lint_cleanup.sql` sostituisce la variabile non letta `v_profile` con `perform 1` in `shop_member_invite_profile`, mantenendo owner-only helper, audit, grants e search_path.

RPC/helper/trigger coinvolti:

- `public.shop_member_invite_profile` e stata corretta solo per lint cleanup.
- `public.set_shared_sheet_sessions_updated_at` e stato corretto per `search_path`.
- Backup table TASK-108 sono state chiuse con RLS/revoke.
- Nessun nuovo endpoint pubblico e stato creato.

## Documentazione prodotta

- Enforcement mobile/POS: `docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md`
- POS auth foundation: `docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md`

## Check eseguiti

- `npm run security:scan`: `PASS` (`Security scan passed.`)
- `npm run test:foundation`: `PASS` (`96/96`)
- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS`
- `npm run build`: `PASS` con warning Node `DEP0205`
- `npm run verify`: `PASS` con warning Node `DEP0205`
- `npm run test:ui-smoke`: `PASS` (`86 passed`) con warning Playwright/Node non bloccanti su `NO_COLOR`/`FORCE_COLOR` e `DEP0205`
- `npm run test:ui-smoke:ci`: `PASS` (`43 passed`) con warning Playwright/Node non bloccanti su `NO_COLOR`/`FORCE_COLOR` e `DEP0205`
- `supabase --version`: `PASS` (`2.102.0`)
- `supabase db push --linked --dry-run`: `PASS` prima delle migration TASK-018; `PASS` finale con `Remote database is up to date.`
- `supabase db push --linked`: `PASS`; applicate `20260531234500_task_018_backup_table_lockdown.sql` e `20260531235000_task_018_trigger_search_path_hardening.sql`
- `supabase db push --linked`: `PASS`; applicata anche `20260531235500_task_018_member_invite_lint_cleanup.sql`
- `supabase migration list --linked`: `PASS`; local e remote allineati fino a `20260531235500`
- `supabase db lint --linked`: `PASS`; `No schema errors found`
- `supabase db advisors --linked --type security`: `PASS_WITH_NOTES`; risolto `function_search_path_mutable`, restano warning noti su RPC `SECURITY DEFINER` eseguibili da `authenticated` e Auth leaked password protection disabilitata
- `git diff --check`: `PASS`
- `git status`: `PASS_WITH_NOTES`; working tree modificato e non staged come richiesto, branch `main...origin/main`

## Rischi residui

- Auth POS resta design-only.
- Enforcement mobile/POS non e ancora implementato nei client.
- Offline grace, session TTL e invalidazione immediata richiedono task futuri.
- CI non esegue deploy e non deve essere interpretata come prontezza per produzione.
- Gli RPC `SECURITY DEFINER` esposti a `authenticated` sono intenzionali per Admin Web e restano protetti da self-authorization DB-side; spostarli fuori schema pubblico richiede task architetturale dedicato.
- Supabase Auth leaked-password protection resta una configurazione provider/Auth fuori repo.
