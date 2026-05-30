# Evidence - Long Goal Execution

## Stato

- Goal: `Esegui allegato`
- Data: 2026-05-30
- Fase corrente: `LONG_GOAL_TRANCHE_HANDOFF`
- Stato corrente: `MILESTONE_0_TO_3_READY_FOR_REVIEW`
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Pre-flight iniziale

- `git status --short`: worktree gia modificato con diff TASK-006 e file untracked TASK-006.
- `git diff --stat`: 14 file tracciati modificati, 908 insertions, 74 deletions, piu file TASK-006 untracked.
- `git diff --check`: nessun output, exit code 0.

## Milestone 0 - TASK-006 review/fix

- Task attivo da Master Plan: `TASK-006 - Platform Admin Controlled Actions`.
- Stato letto: `READY_FOR_REVIEW`, fase `EXECUTION_HANDOFF`, execution `COMPLETED`.
- Next.js docs locali letti prima di valutare Server Actions/App Router:
  - `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
  - `node_modules/next/dist/docs/01-app/02-guides/forms.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`
- Security diff scan artifact path: `/tmp/codex-security-scans/merchandise-control-admin-web/fa44350_20260530145816`.

## Fix integrativo

- Identificato gap piccolo nello scanner locale: `scripts/security-checks.mjs` non includeva `.sql` in `textExtensions`, quindi il secret scan generico non attraversava le migration SQL.
- TDD RED: `node --test tests/foundation/platform-admin-actions.test.mjs` fallito sul nuovo test `security scanner treats SQL migrations as text for secret checks`, 2 pass / 1 fail.
- Fix: aggiunta estensione `.sql` allo scanner.
- TDD GREEN: `node --test tests/foundation/platform-admin-actions.test.mjs` passato, 3 pass / 0 fail.

## Check completi

- `npm run typecheck`: `PASS`, `tsc --noEmit` exit code 0.
- `npm run lint`: `PASS`, `eslint` exit code 0.
- `npm run test:foundation`: `PASS`, 20 test passati, 0 falliti.
- `npm run security:scan`: `PASS`, output `Security scan passed.`
- `npm run build`: `PASS`, Next build completato; route `/platform/operations` dynamic. Warning non bloccante: Node `DEP0205`.
- `npm run verify`: `PASS`, lint + typecheck + security scan + build completati; route Platform dynamic. Warning non bloccante: Node `DEP0205`.
- `npm run test:ui-smoke`: primo run `FAIL` per dev server Next gia attivo su `localhost:3002`; nessun processo ucciso.
- `PLAYWRIGHT_BASE_URL=http://localhost:3002 PLAYWRIGHT_REUSE_SERVER=1 npm run test:ui-smoke`: `PASS`, 22 test passati.
- `git diff --check`: `PASS`, nessun output.

## Rischi residui

- Nessun passaggio a `DONE`: resta richiesta review/conferma esplicita utente.
- `TASK-006` resta in handoff verso review secondo governance.

## Milestone 1 - TASK-007 Auth routing e route protection

- Task aperto: `docs/TASKS/TASK-007-auth-routing-route-protection.md`.
- Evidence: `docs/TASKS/EVIDENCE/TASK-007/README.md`.
- Stato finale milestone: `READY_FOR_REVIEW`, non `DONE`.
- Implementato resolver server-only `src/server/auth/admin-routing.ts` basato su `auth.getUser()`, `platform_admins` e `shop_members`.
- Implementata root `/` come entrypoint server-side verso `/platform` o `/shop`.
- Protetto `/platform/*` con `src/app/platform/layout.tsx`.
- Creato `/shop` minimale protetto per Shop Admin, senza dati finti/live non verificati.
- Login/callback allineati al default post-login `/`.
- Harness aggiornati:
  - security scan include `src/server/auth`;
  - gate `checkTask007AuthRoutingArtifacts`;
  - typecheck esegue `next typegen && tsc --noEmit`;
  - smoke UI aggiornato per stati access required.

### Check Milestone 1

- `node --test tests/foundation/auth-routing.test.mjs`: `PASS`, 4 test passati.
- `node --test tests/foundation/supabase-foundation.test.mjs`: `PASS`, 13 test passati dopo RED sul typecheck route typegen.
- `npm run typecheck`: `PASS`, `next typegen && tsc --noEmit`.
- `npm run lint`: `PASS`.
- `npm run test:foundation`: `PASS`, 25 test passati.
- `npm run security:scan`: `PASS`, output `Security scan passed.`
- `npm run build`: `PASS_WITH_WARNINGS`, route `/shop` dynamic; warning non bloccante `DEP0205`.
- `npm run verify`: `PASS_WITH_WARNINGS`, lint + typecheck + security scan + build completati; warning non bloccante `DEP0205`.
- `npm run test:ui-smoke` con secondo `next dev`: `BLOCKED_WITH_NOTE`, Next ha rilevato server gia attivo su `localhost:3002`; nessun processo ucciso.
- `npm run test:ui-smoke` via `next start` su `127.0.0.1:3004`: `PASS_WITH_WARNINGS`, 22 test passati; warning non bloccanti `DEP0205` e `NO_COLOR`/`FORCE_COLOR`.
- Browser in-app su `localhost:3002`: `PASS`, verificati `/`, `/shop`, `/auth/login` con titoli e heading attesi.

### Rischi residui Milestone 1

- Test live shop-owner/shop-manager non eseguito: richiede fixture utente/shop controllata.
- `/shop` resta entrypoint minimale; shell Shop Admin completa prevista nella milestone successiva.

## Milestone 2 - TASK-008 Shop Admin Console Shell

- Task aperto: `docs/TASKS/TASK-008-shop-admin-console-shell.md`.
- Evidence: `docs/TASKS/EVIDENCE/TASK-008/README.md`.
- Stato finale milestone: `READY_FOR_REVIEW`, non `DONE`.
- Implementato layout protetto `src/app/shop/layout.tsx`.
- Implementata shell dedicata `src/components/shop/ShopShell.tsx`.
- Aggiunte sezioni placeholder dichiarate in `src/components/shop/shopSections.ts`.
- Aggiunte route `/shop/overview`, `/shop/products`, `/shop/categories`, `/shop/suppliers`, `/shop/import-export`, `/shop/members`, `/shop/roles`, `/shop/staff`, `/shop/devices`, `/shop/settings`, `/shop/audit`.
- Nessun dato placeholder viene presentato come live; `ShopSectionPage` dichiara esplicitamente che TASK-008 non renderizza live shop rows.

### Check Milestone 2

- `node --test tests/foundation/shop-admin-shell.test.mjs`: RED iniziale 0 pass / 3 fail, poi `PASS` con 3 test passati.
- `node --test tests/foundation/auth-routing.test.mjs tests/foundation/shop-admin-shell.test.mjs tests/foundation/supabase-schema.test.mjs`: `PASS`, 12 test passati.
- `npm run security:scan`: `PASS`, output `Security scan passed.`
- `npm run typecheck`: `PASS`, `next typegen && tsc --noEmit`.
- `npm run lint`: `PASS`.
- `npm run test:foundation`: `PASS`, 28 test passati.
- `npm run build`: `PASS_WITH_WARNINGS`, tutte le route `/shop/*` dynamic; warning non bloccante `DEP0205`.
- `npm run verify`: `PASS_WITH_WARNINGS`, lint + typecheck + security scan + build completati; warning non bloccante `DEP0205`.
- `npm run test:ui-smoke` via `next start` su `127.0.0.1:3004`: `PASS_WITH_WARNINGS`, 44 test passati; warning non bloccanti `DEP0205` e `NO_COLOR`/`FORCE_COLOR`.
- Browser in-app su `localhost:3002/shop/products`: `PASS`, access state non autorizzato presente e shell nav assente senza sessione.

### Rischi residui Milestone 2

- Shell autorizzata non verificata con sessione reale `shop_owner` / `shop_manager`.
- Nessun read model shop-scoped reale e nessuna migration Supabase in TASK-008.

## Milestone 3 - TASK-009 Shop Switcher

- Task aperto: `docs/TASKS/TASK-009-shop-switcher.md`.
- Evidence: `docs/TASKS/EVIDENCE/TASK-009/README.md`.
- Stato finale milestone: `READY_FOR_REVIEW`, non `DONE`.
- Implementato resolver server-only `src/server/shop-admin/shop-access.ts`.
- Il layout `/shop` passa alla shell solo shop autorizzati dal server.
- Lo switcher usa `shop_id` come stato di navigazione, non come fonte autorizzativa.
- Aggiunto gate security `checkTask009ShopSwitcherArtifacts`.

### Check Milestone 3

- `node --test tests/foundation/shop-switcher.test.mjs`: RED iniziale 0 pass / 3 fail, poi `PASS` con 3 test passati.
- `node --test tests/foundation/auth-routing.test.mjs tests/foundation/shop-admin-shell.test.mjs tests/foundation/shop-switcher.test.mjs`: `PASS`, 10 test passati.
- `npm run typecheck`: `PASS`, `next typegen && tsc --noEmit`.
- `npm run security:scan`: `PASS`, output `Security scan passed.`
- `npm run lint`: `PASS`.
- `npm run test:foundation`: `PASS`, 31 test passati.
- `npm run build`: `PASS_WITH_WARNINGS`, warning non bloccante `DEP0205`.
- `npm run verify`: `PASS_WITH_WARNINGS`, lint + typecheck + security scan + build completati; warning non bloccante `DEP0205`.
- `npm run test:ui-smoke` via `next start` su `127.0.0.1:3004`: `PASS_WITH_WARNINGS`, 44 test passati.
- Browser in-app su `localhost:3002/shop/products?shop_id=unauthorized_test`: `PASS`, access state presente, switcher/nav Shop assenti senza sessione.

### Rischi residui Milestone 3

- Switcher autorizzato non verificato con sessione reale multi-shop.
- Nessun read model business shop-scoped ancora renderizzato.

## Stop controllato della tranche

- Motivo: reviewability. La tranche include review/fix TASK-006 piu tre milestone nuove (`TASK-007`, `TASK-008`, `TASK-009`) con check verdi; aprire anche il read model reale (`TASK-010`) aumenterebbe troppo il batch da revisionare nello stesso handoff.
- Stato finale consigliato della tranche: `PASS_WITH_NOTES`.
- Stato task:
  - `TASK-006`: `READY_FOR_REVIEW`, non `DONE`.
  - `TASK-007`: `READY_FOR_REVIEW`, non `DONE`.
  - `TASK-008`: `READY_FOR_REVIEW`, non `DONE`.
  - `TASK-009`: `READY_FOR_REVIEW`, non `DONE`.
  - `TASK-010`: `PLANNED_NEXT`, non aperto in execution.
- Prossimo passo consigliato: review umana dei candidate e apertura mirata di `TASK-010 - Shop Read Model Real Data` nella prossima tranche.
