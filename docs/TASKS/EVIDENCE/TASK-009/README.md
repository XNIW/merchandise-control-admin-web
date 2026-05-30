# Evidence - TASK-009 Shop Switcher

## Stato

- Task: `TASK-009 - Shop Switcher`
- Fase: `LONG_GOAL_MILESTONE_3`
- Stato corrente: `READY_FOR_REVIEW`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Letture obbligatorie

- `AGENTS.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `src/server/auth/admin-routing.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/database.types.ts`
- `src/app/shop/layout.tsx`
- `src/components/shop/ShopShell.tsx`
- Next.js locali:
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`

## Pre-flight

- `TASK-006`, `TASK-007` e `TASK-008` restano `READY_FOR_REVIEW`, non `DONE`.
- `TASK-009` e l'unico task nuovo in `EXECUTION`.

## Evidence runtime

- `node --test tests/foundation/shop-switcher.test.mjs` RED:
  - 0 pass / 3 fail;
  - fallimenti attesi per resolver `src/server/shop-admin/shop-access.ts`, switcher shell e gate security mancanti.
- `node --test tests/foundation/shop-switcher.test.mjs` GREEN:
  - 3 pass / 0 fail.

## Implementazione

- `src/server/shop-admin/shop-access.ts`: resolver server-only per Shop Admin shell access.
- `src/app/shop/layout.tsx`: usa `resolveCurrentShopAdminShellAccess`, passa solo shop autorizzati alla shell.
- `src/components/shop/ShopShell.tsx`: switcher `Switch shop`, `shop_id` in query string, fallback a `selectedShopId` server-side se query non autorizzata.
- `scripts/security-checks.mjs`: aggiunto `src/server/shop-admin` ai contratti read-only e gate `checkTask009ShopSwitcherArtifacts`.

## Check completi

| Comando | Risultato | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/shop-switcher.test.mjs` | `PASS` | 3 test passati, 0 falliti. |
| `node --test tests/foundation/auth-routing.test.mjs tests/foundation/shop-admin-shell.test.mjs tests/foundation/shop-switcher.test.mjs` | `PASS` | 10 test passati, 0 falliti. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; exit code 0. |
| `npm run security:scan` | `PASS` | Output `Security scan passed.` |
| `npm run lint` | `PASS` | `eslint` exit code 0. |
| `npm run test:foundation` | `PASS` | 31 test passati, 0 falliti. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next completata; warning non bloccante: Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint, typecheck, security scan e build completati; warning non bloccante `DEP0205`. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3004" PLAYWRIGHT_REUSE_SERVER=0 npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 44 test passati su desktop/tablet; warning non bloccanti `DEP0205` e `NO_COLOR`/`FORCE_COLOR`. |

## Browser in-app

- Target: `http://localhost:3002/shop/products?shop_id=unauthorized_test`.
- Titolo: `Products | MerchandiseControl Admin Web`.
- Heading access state `Shop Admin access required`: count 1.
- Switcher `Switch shop`: count 0 per sessione non autorizzata.
- Navigazione `Shop sections`: count 0 per sessione non autorizzata.

## File toccati

- `src/server/shop-admin/shop-access.ts`
- `src/app/shop/layout.tsx`
- `src/components/shop/ShopShell.tsx`
- `scripts/security-checks.mjs`
- `tests/foundation/auth-routing.test.mjs`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/shop-switcher.test.mjs`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `docs/TASKS/EVIDENCE/TASK-009/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`

## Rischi residui

- Switcher autorizzato non verificato in browser con utente multi-shop reale.
- `shop_id` in query string non persiste oltre la navigazione corrente.
- Il read model business shop-scoped resta alla milestone successiva.

## Handoff

- Stato consigliato: `READY_FOR_REVIEW`.
- Non marcare `DONE` senza review e conferma esplicita dell'utente.
