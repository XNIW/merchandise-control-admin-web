# Evidence - TASK-007 Auth Routing and Route Protection

## Stato

- Task: `TASK-007 - Auth Routing and Route Protection`
- Fase: `DONE_RECONCILED`
- Stato corrente: `DONE`
- Verdict finale reconciliation: `DONE_RECONCILED`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Review finale / DONE reconciliation 2026-05-30

- Verdict: `DONE_RECONCILED`.
- Fix applicati in questa review: nessuno specifico TASK-007.
- Check freschi:
  - `npm run typecheck`: `PASS`.
  - `npm run lint`: `PASS`.
  - `npm run test:foundation`: `PASS`, 32 test passati.
  - `npm run security:scan`: `PASS`, `Security scan passed.`
  - `npm run build`: `PASS_WITH_WARNINGS`, solo warning Node `DEP0205`.
  - `npm run test:ui-smoke`: `PASS_WITH_WARNINGS`, 44 test passati con `next start` production su `127.0.0.1:3106`.
  - `git diff --check`: `PASS`.
- Supabase linked freschi: migration list/dry-run/lint/advisors security `PASS`.
- Rischi residui accettati: nessun test live dedicato a vero `shop_owner` / `shop_manager`; richiede fixture sicura separata.
- Commit/push: `NOT_CREATED` / `NOT_RUN`.

## Letture obbligatorie

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-006-platform-admin-controlled-actions.md`
- `docs/TASKS/EVIDENCE/TASK-006/README.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- Next.js locali:
  - `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Supabase docs/changelog:
  - `https://supabase.com/changelog.md`
  - `https://supabase.com/docs/guides/auth/server-side/nextjs`
  - `https://supabase.com/docs/guides/auth/sessions`

## Pre-flight

- Worktree gia contiene la execution `TASK-006` piu fix integrativo Long Goal.
- Stato storico a inizio milestone: `TASK-006` era `READY_FOR_REVIEW`; reconciliation finale 2026-05-30: `DONE`.
- `TASK-007` e l'unico task nuovo in `EXECUTION`.

## Implementazione

- Resolver server-only: `src/server/auth/admin-routing.ts`.
- Stato di accesso condiviso: `src/components/auth/AccessState.tsx`.
- Root `/`: redirect server-side verso `/platform` o `/shop` quando il ruolo e valido.
- `/platform/*`: protetto da `src/app/platform/layout.tsx`.
- `/shop`: entrypoint minimale protetto per Shop Admin.
- Login/callback: default `next` verso `/`, con redirect safe interno.
- Harness: security scan, foundation, typecheck route typegen e Playwright smoke aggiornati.

## TDD / RED-GREEN

- `node --test tests/foundation/auth-routing.test.mjs` RED iniziale:
  - prima implementazione assente: fallimento atteso su resolver/route mancanti.
  - coverage security `src/server/auth`: 2 pass / 1 fail, falliva su assenza `listFiles("src/server/auth")`.
  - gate artifact TASK-007: 3 pass / 1 fail, falliva su assenza `checkTask007AuthRoutingArtifacts`.
- `node --test tests/foundation/auth-routing.test.mjs` GREEN:
  - 4 pass / 0 fail.
- `node --test tests/foundation/supabase-foundation.test.mjs` RED:
  - 12 pass / 1 fail, `typecheck` era ancora `tsc --noEmit` senza `next typegen`.
- `node --test tests/foundation/supabase-foundation.test.mjs` GREEN:
  - 13 pass / 0 fail.

## Check completi

| Comando | Risultato | Evidence sintetica |
| --- | --- | --- |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; output `Types generated successfully`; exit code 0. |
| `npm run lint` | `PASS` | `eslint` exit code 0. |
| `npm run test:foundation` | `PASS` | 25 test passati, 0 falliti. |
| `npm run security:scan` | `PASS` | Output `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next completata; route `/`, `/platform/*`, `/auth/*`, `/shop` dynamic. Warning non bloccante: Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint, typecheck, security scan e build completati; warning non bloccante `DEP0205`. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3003 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run dev -- --hostname 127.0.0.1 --port 3003" PLAYWRIGHT_REUSE_SERVER=0 npm run test:ui-smoke` | `BLOCKED_WITH_NOTE` | Next ha rifiutato un secondo `next dev`: server gia attivo su `localhost:3002`; nessun processo ucciso. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3004" PLAYWRIGHT_REUSE_SERVER=0 npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 22 test passati su desktop/tablet; warning non bloccanti `DEP0205` e `NO_COLOR`/`FORCE_COLOR`. |

## Browser in-app

- Target: `http://localhost:3002`.
- `/`: titolo `Admin Access | MerchandiseControl Admin Web`, heading `Admin Web access required`, count 1.
- `/shop`: titolo `Shop Admin | MerchandiseControl Admin Web`, heading `Shop Admin access required`, count 1.
- `/auth/login`: titolo `Admin Sign In | MerchandiseControl Admin Web`, heading `Admin sign in`, count 1.

## File toccati

- `package.json`
- `tsconfig.json`
- `scripts/security-checks.mjs`
- `src/app/page.tsx`
- `src/app/platform/layout.tsx`
- `src/app/shop/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/auth/callback/route.ts`
- `src/components/auth/AuthForm.tsx`
- `src/components/auth/AccessState.tsx`
- `src/server/auth/admin-routing.ts`
- `tests/foundation/auth-routing.test.mjs`
- `tests/foundation/supabase-foundation.test.mjs`
- `tests/foundation/supabase-schema.test.mjs`
- `tests/e2e/platform-admin.spec.ts`
- `tests/e2e/platform-admin-live-auth.spec.ts`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/TASKS/EVIDENCE/TASK-007/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`

## Rischi residui

- Live browser auth copre ancora il percorso `platform_admin`; un test live `shop_owner` / `shop_manager` richiede fixture Supabase controllata e non e stato eseguito in questa milestone.
- `/shop` e intenzionalmente minimale; la shell completa Shop Admin parte dalla milestone successiva.
- Nessuna migration Supabase introdotta in `TASK-007`.

## Handoff

- Stato finale: `DONE`.
- Chiuso nella reconciliation finale autorizzata dall'utente; `TASK-010` resta da aprire separatamente.
