# Evidence - TASK-014 Integrated Authenticated QA, Design System, POS Staff Foundation

## Stato

- Task: `TASK-014 - Integrated Authenticated QA, Design System, POS Staff Foundation`
- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Data apertura: 2026-05-31
- Branch: `codex/task-014-integrated-auth-qa-design-pos-foundation`
- Commit: `NOT_CREATED`
- Git push: `NOT_RUN`
- Supabase linked push: `APPLIED`
- Stage finale: `NOT_RUN`
- Verdict Codex: `DONE_RECONCILED`

## Sintesi corrente

TASK-014 e un mega-task sperimentale con tre fasi interne:

1. Authenticated Visual QA Fixture.
2. Small Design System / Shared Admin Components.
3. POS Staff Credentials Schema Foundation.

La review finale richiesta dall'utente il 2026-05-31 ha risolto il residuo critico della migration: `20260531050837_task_014_pos_staff_foundation.sql` e stata applicata al linked dev, i gate post-push sono passati e il task e riconciliato a `DONE_RECONCILED`.

## Pre-flight

| Check | Esito | Output sintetico |
| --- | --- | --- |
| `git status --short` | `PASS` | Nessun output su `main`. |
| `git diff --stat` | `PASS` | Nessun output su `main`. |
| `git diff --check` | `PASS` | Nessun output, exit code 0. |
| `git log --oneline --decorate -n 12` | `PASS` | HEAD `6b9f765 Merge admin web task reconciliation`. |
| `git checkout main` | `PASS` | Gia su `main`. |
| `git pull --ff-only origin main` | `PASS` | `Already up to date.` |
| `git status --short` dopo pull | `PASS` | Nessun output. |
| Branch TASK-014 | `PASS` | `codex/task-014-integrated-auth-qa-design-pos-foundation`. |

## Letture obbligatorie

| Area | Esito |
| --- | --- |
| Governance: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md` | `PASS` |
| Dominio/decisioni: Domain Model, ADR-001, skill locali Admin/Supabase | `PASS` |
| Task precedenti: `TASK-012`, evidence TASK-012, `TASK-013`, evidence TASK-013 | `PASS` |
| Next.js docs locali per App Router, Server Components, auth, data security, Playwright, use server | `PASS` |
| Codice scope: `src/app`, `src/components`, `src/server`, `src/lib/supabase`, `supabase/migrations`, `tests`, `scripts/security-checks.mjs` | `PASS` |
| Fonti Supabase ufficiali/changelog su RLS e grant espliciti | `PASS` |

## Supabase discovery iniziale

| Check | Esito | Output sintetico |
| --- | --- | --- |
| `supabase --version` | `PASS` | `2.102.0`. |
| `supabase migration list --linked` | `PASS` | Local/remoto allineati fino a `20260530120000`. |
| `supabase db push --linked --dry-run` | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | `No issues found`. |
| `information_schema.tables` mirato staff | `PASS_WITH_NOTES` | Nessuna tabella `staff_accounts`, `staff_accounts_safe`, `shop_staff_safe` o `devices`. |
| `information_schema.columns` mirato staff/credential | `PASS_WITH_NOTES` | Solo `shop_inventory_sources.mapping_state`; nessun campo staff credential reale. |

## Evidence fase 1 - Authenticated Visual QA Fixture

| Check | Esito | Output sintetico |
| --- | --- | --- |
| Harness opt-in statico | `PASS` | `tests/e2e/platform-admin-live-auth.spec.ts` usa `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes`; `screenshot`, `trace`, `video` sono disabilitati di default nel file. |
| Fixture temporanea Platform Admin | `PASS` | `createTemporaryPlatformAdminCredentials()` crea utente Auth temporaneo, profilo, platform admin e audit row; cleanup usa `deleteUser`. |
| Fixture temporanea Shop Admin | `PASS` | `createTemporaryShopAdminFixture()` crea shop sintetico + `shop_owner` temporaneo e cleanup esplicito membership/shop/user. |
| No storage state/token | `PASS` | Nessun `storageState`, nessun magic link, nessun `access_token`/`refresh_token`, nessun `console.*` nel test live auth. |
| Primo lancio script `npm run test:ui-live-auth` | `NOT_FINAL_BLOCKED` | Fallito per dev server Next gia attivo: `Another next dev server is already running` su `localhost:3000`; nessun processo utente terminato. |
| Rilancio su `127.0.0.1:3000` | `NOT_FINAL_BLOCKED` | Sign-in browser bloccato da origine dev mismatch; log Next: cross-origin request da `127.0.0.1` a dev resource. |
| Verifica fixture auth fuori browser | `PASS` | Script diagnostico Node con Supabase publishable key: `PUBLIC_SIGNIN_OK`; nessun secret stampato. |
| Esecuzione finale live auth su `http://localhost:3000` | `PASS_WITH_NOTES` | `2 passed`, `1 skipped`; skip previsto per gate TASK-006 separato (`CONFIRM_PLATFORM_ADMIN_TASK006_LIVE_TEST`). |
| Fix strict-mode Playwright | `PASS` | Locator `/shop/staff` aggiornato da testo ambiguo `credential-safe` al heading `Staff credential-safe read model`. |
| Screenshot autenticati | `PASS` | Creati `browser-platform-authenticated.png`, `browser-shop-overview-authenticated.png`, `browser-shop-staff-authenticated.png`. |
| Browser in-app `/shop/staff` | `PASS` | `BROWSER_IAB_OK /shop/staff protected access state visible`. |

Screenshot prodotti:

- `docs/TASKS/EVIDENCE/TASK-014/browser-platform-authenticated.png`
- `docs/TASKS/EVIDENCE/TASK-014/browser-shop-overview-authenticated.png`
- `docs/TASKS/EVIDENCE/TASK-014/browser-shop-staff-authenticated.png`

## Evidence fase 2 - Shared Admin Components

| Check | Esito | Output sintetico |
| --- | --- | --- |
| Componenti condivisi creati | `PASS` | Aggiunti `PageHeader`, `SectionCard`, `EmptyState`, `StatusBadge`, `AdminDataTable`, `GuardrailNotice` in `src/components/admin/`. |
| Applicazione Platform Admin | `PASS` | `src/components/platform/PlatformPage.tsx` usa i componenti condivisi per header, card, empty state e tabelle. |
| Applicazione Shop Admin | `PASS` | `src/components/shop/ShopSectionPage.tsx` usa i componenti condivisi per header shop, card, guardrail e tabelle. |
| Boundary server-safe | `PASS` | Componenti condivisi senza `"use client"`, senza import Supabase e senza import `src/server`. |
| Test mirati | `PASS` | `TASK-014 shared Admin components exist`, `applies shared components`, `keeps shared components server-safe`. |

## Evidence fase 3 - POS Staff Foundation

| Check | Esito | Output sintetico |
| --- | --- | --- |
| Migration TASK-014 | `PASS` | Aggiunta e applicata al linked dev: `20260531050837_task_014_pos_staff_foundation.sql`. |
| Base table | `PASS` | `public.staff_accounts` con `staff_id`, `shop_id`, `staff_code`, `role_key`, `status`, credential metadata, lockout e audit references. |
| RLS/grants | `PASS` | RLS abilitata; helper `app_private.is_active_shop_staff_admin_member`; nessuna grant mutativa a `authenticated`; nessuna grant ad `anon`. |
| Safe view | `PASS` | `public.staff_accounts_safe with (security_invoker = true)` non seleziona `credential_hash`. |
| Read model server-only | `PASS` | `src/server/shop-admin/staff-read-model.ts` legge solo `.from("staff_accounts_safe")` con `.eq("shop_id", selectedShop.shopId)`. |
| UI staff read-only | `PASS` | `src/app/shop/staff/page.tsx` usa `getShopSectionForRequest("staff", requestedShopId)`; nessun form mutativo o POS login. |
| Hash boundary | `PASS` | `src/server/shop-admin/staff-credentials.ts` usa Node `crypto.scrypt`, salt random e `timingSafeEqual`, con formato versionato; review finale rafforza parser hash invalido. |
| Hash runtime tests | `PASS` | Aggiunto `tests/foundation/task-014-staff-credentials-runtime.test.mjs`: hash positivo, verify negativo, salt diversi, invalid format, rehash, no plaintext. |
| Database types | `PASS` | `src/lib/supabase/database.types.ts` rigenerato dal linked schema con `public`, `app_private` e `graphql_public`. |
| Supabase local status | `BLOCKED_LOCAL_SUPABASE_NOT_RUNNING` | `supabase status` fallisce: `No such container: supabase_db_merchandise-control-admin-web`. |
| Supabase linked dry-run pre-push | `PASS` | `Would push these migrations: 20260531050837_task_014_pos_staff_foundation.sql`. |
| Supabase linked push | `PASS` | Migration TASK-014 applicata; output include notice innocui per policy/view non esistenti prima della creazione. |
| Supabase linked post-push | `PASS` | `migration list` allineata, `db push --dry-run` dice `Remote database is up to date`, lint/advisors passano. |
| Metadata grant query linked | `PASS_WITH_NOTES` | Grant colonnari `authenticated SELECT` su `staff_accounts` escludono `credential_hash`; query metadata parallele successive hanno attivato `ECIRCUITBREAKER`, quindi non usate come evidence positiva. |

## Check finali

| Check | Esito | Output sintetico |
| --- | --- | --- |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generate successfully. |
| `npm run lint` | `PASS` | ESLint completato senza errori. |
| `npm run test:foundation` | `PASS` | `tests 56`, `pass 56`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS` | Build completata; warning Node `DEP0205` non bloccante. |
| `npm run verify` | `PASS_WITH_WARNINGS` | `eslint`, `next typegen && tsc --noEmit`, `security:scan`, `next build` passati; warning Node `DEP0205` non bloccante. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | `44 passed` su `chromium-desktop` e `chromium-tablet`; warning `DEP0205` e `NO_COLOR`/`FORCE_COLOR` non bloccanti. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth` | `NOT_FINAL_BLOCKED` | Web server Playwright non avviato: esisteva gia un dev server Next su `localhost:3000`, PID `38932`; nessun processo terminato. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/platform-admin-live-auth.spec.ts --project=chromium-desktop` | `PASS_WITH_NOTES` | `2 passed`, `1 skipped`; skip previsto per TASK-006 live actions. |
| Browser in-app `/auth/login`, `/platform`, `/shop`, `/shop/overview`, `/shop/staff` | `PASS` | Heading attesi visibili, nessun Runtime Error. |
| `supabase migration list --linked` post-push | `PASS` | Local/remoto allineati incluso `20260531050837`. |
| `supabase db push --linked --dry-run` post-push | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` post-push | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` post-push | `PASS` | `No issues found`. |
| `supabase gen types typescript --linked --schema public,app_private,graphql_public > src/lib/supabase/database.types.ts` | `PASS` | Tipi rigenerati dal linked schema applicato. |
| Figma MCP TASK-014 | `BLOCKED_TOOL_LIMIT` | Tool `_use_figma` bloccato dal limite Starter plan: nessuna modifica applicata al file Figma. |
| `git diff --check` finale | `PASS` | Nessun output, exit code 0. |
| `git diff --cached --name-only` finale | `PASS` | Nessun output; nessun file staged. |
| `git status --short` finale | `PASS_WITH_NOTES` | Solo modifiche/untracked TASK-014 coerenti con scope; nessun commit, nessun git push, nessuno stage finale. |

## Mobile / POS sibling repos

| Area | Esito | Motivo |
| --- | --- | --- |
| Win7POS repo | `PASS` | `/Users/minxiang/Projects/Win7POS` disponibile; `git status --short` senza output. |
| POS/Win7POS build | `NOT_RUN_NOT_NEEDED` | TASK-014 non modifica POS/Win7POS e non introduce login staff reale. |
| Android build | `NOT_RUN_NOT_NEEDED` | Nessuna modifica Android; repo Android non presente in `/Users/minxiang/Projects`. |
| iOS build | `NOT_RUN_NOT_NEEDED` | Nessuna modifica iOS; repo iOS non presente in `/Users/minxiang/Projects`. |
| Cash Register System | `NOT_AVAILABLE` | Repo non presente in `/Users/minxiang/Projects`. |

## Rischi residui

- Supabase locale resta non avviato; la validation autorevole e stata linked dev post-push.
- Figma non aggiornato per limite MCP Starter plan (`BLOCKED_TOOL_LIMIT`), non blocker per schema/security.
- Il gate live autenticato richiede `localhost` quando si riusa il dev server gia attivo; `127.0.0.1` puo incorrere nel blocco cross-origin dev di Next.
- Warning noti non bloccanti: Node `DEP0205`, Playwright `NO_COLOR` ignorato con `FORCE_COLOR`.

## Handoff

- Fase proposta: `IDLE`.
- Verdict Codex: `DONE_RECONCILED`.
- File toccati principali:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md`
  - `docs/TASKS/EVIDENCE/TASK-014/README.md`
  - `src/components/admin/*`
  - `src/components/platform/PlatformPage.tsx`
  - `src/components/shop/ShopSectionPage.tsx`
  - `src/app/shop/staff/page.tsx`
  - `src/server/shop-admin/staff-read-model.ts`
  - `src/server/shop-admin/staff-credentials.ts`
  - `src/server/shop-admin/shop-section-data.ts`
  - `src/lib/supabase/database.types.ts`
  - `supabase/migrations/20260531050837_task_014_pos_staff_foundation.sql`
  - `tests/e2e/platform-admin-live-auth.spec.ts`
  - `tests/foundation/task-014-*.test.mjs`
  - `scripts/security-checks.mjs`
- Criteri di accettazione coperti:
  - QA autenticata opt-in con fixture temporanei e screenshot.
  - Componenti admin condivisi piccoli, server-safe e applicati a Platform/Shop.
  - Foundation staff credential read-only con RLS/view safe, migration applicata linked dev e hash boundary server-only.
  - Nessun login POS, nessun account staff reale, nessun credential secret hardcoded, nessun service-role client/browser.
- Prossima fase: progetto `IDLE`.
- Conferma finale: nessun commit, nessun git push, nessuno stage finale.
