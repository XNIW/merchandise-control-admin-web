# Evidence - TASK-008 Shop Admin Console Shell

## Stato

- Task: `TASK-008 - Shop Admin Console Shell`
- Fase: `LONG_GOAL_MILESTONE_2`
- Stato corrente: `READY_FOR_REVIEW`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Letture obbligatorie

- `AGENTS.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- `src/app`
- `src/components`
- `src/server/auth/admin-routing.ts`
- `scripts/security-checks.mjs`
- `tests/e2e/platform-admin.spec.ts`
- Next.js locali:
  - `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`

## Pre-flight

- `TASK-006` resta `READY_FOR_REVIEW`, non `DONE`.
- `TASK-007` e stato portato a `READY_FOR_REVIEW`, non `DONE`.
- `TASK-008` e l'unico task nuovo in `EXECUTION`.

## Evidence runtime

- `node --test tests/foundation/shop-admin-shell.test.mjs` RED:
  - 0 pass / 3 fail;
  - fallimenti attesi per `src/app/shop/layout.tsx`, componenti Shop Admin e gate `checkTask008ShopShellArtifacts` mancanti.
- `node --test tests/foundation/shop-admin-shell.test.mjs` GREEN:
  - 3 pass / 0 fail.

## Implementazione

- `src/app/shop/layout.tsx`: layout dedicato, dynamic, autorizzazione server-side tramite `resolveCurrentAdminRouteAccess`, blocco non-shop con `AccessState`.
- `src/components/shop/ShopShell.tsx`: shell client minima per active nav via `usePathname`; nessun import server/Supabase.
- `src/components/shop/shopSections.ts`: configurazione route e placeholder dichiarati.
- `src/components/shop/ShopSectionPage.tsx`: rendering sezione comune, con messaggio esplicito `No live shop rows are rendered in TASK-008`.
- Route aggiunte:
  - `/shop/overview`
  - `/shop/products`
  - `/shop/categories`
  - `/shop/suppliers`
  - `/shop/import-export`
  - `/shop/members`
  - `/shop/roles`
  - `/shop/staff`
  - `/shop/devices`
  - `/shop/settings`
  - `/shop/audit`

## Check completi

| Comando | Risultato | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/auth-routing.test.mjs tests/foundation/shop-admin-shell.test.mjs tests/foundation/supabase-schema.test.mjs` | `PASS` | 12 test passati, 0 falliti. |
| `npm run security:scan` | `PASS` | Output `Security scan passed.` |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; exit code 0. |
| `npm run lint` | `PASS` | `eslint` exit code 0. |
| `npm run test:foundation` | `PASS` | 28 test passati, 0 falliti. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next completata; tutte le route `/shop/*` dynamic. Warning non bloccante: Node `DEP0205`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint, typecheck, security scan e build completati; warning non bloccante `DEP0205`. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3004 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3004" PLAYWRIGHT_REUSE_SERVER=0 npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | 44 test passati su desktop/tablet; warning non bloccanti `DEP0205` e `NO_COLOR`/`FORCE_COLOR`. |

## Browser in-app

- Target: `http://localhost:3002/shop/products`.
- Titolo: `Products | MerchandiseControl Admin Web`.
- Heading access state `Shop Admin access required`: count 1.
- Navigazione `Shop sections`: count 0 per sessione non autorizzata.

## File toccati

- `scripts/security-checks.mjs`
- `src/app/shop/layout.tsx`
- `src/app/shop/page.tsx`
- `src/app/shop/overview/page.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/app/shop/import-export/page.tsx`
- `src/app/shop/members/page.tsx`
- `src/app/shop/roles/page.tsx`
- `src/app/shop/staff/page.tsx`
- `src/app/shop/devices/page.tsx`
- `src/app/shop/settings/page.tsx`
- `src/app/shop/audit/page.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/shop/shopSections.ts`
- `tests/foundation/auth-routing.test.mjs`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/supabase-schema.test.mjs`
- `tests/e2e/platform-admin.spec.ts`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- `docs/TASKS/EVIDENCE/TASK-008/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`

## Rischi residui

- Shell autorizzata non verificata in browser con utente `shop_owner` / `shop_manager`: richiede fixture Supabase sicura, fuori scope TASK-008.
- Nessuna lettura dati shop-scoped reale.
- Nessuna migration Supabase.
- Placeholder intenzionali, dichiarati come non live.

## Handoff

- Stato consigliato: `READY_FOR_REVIEW`.
- Non marcare `DONE` senza review e conferma esplicita dell'utente.
