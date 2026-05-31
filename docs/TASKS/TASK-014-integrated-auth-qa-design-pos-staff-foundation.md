# TASK-014 - Integrated Authenticated QA, Design System, POS Staff Foundation

## Informazioni generali

- ID: `TASK-014`
- Titolo: `Integrated Authenticated QA, Design System, POS Staff Foundation`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura: 2026-05-31
- Branch: `codex/task-014-integrated-auth-qa-design-pos-foundation`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-014/README.md`
- Commit: `NOT_CREATED` (richiesto no commit)
- Git push: `NOT_RUN` (richiesto no git push)
- Supabase linked push: `APPLIED` (`20260531050837_task_014_pos_staff_foundation.sql`)
- Verdict Codex: `DONE_RECONCILED`

## Scopo

Mega-task sperimentale con tre fasi interne e gate severi:

1. Authenticated Visual QA Fixture.
2. Small Design System / Shared Admin Components.
3. POS Staff Credentials Schema Foundation.

Il task ha prodotto un incremento end-to-end verificabile. La prima execution ha preparato un handoff a `REVIEW`; la review finale richiesta dall'utente il 2026-05-31 ha applicato la migration linked dev, risolto i blocker critici e riconciliato il task a `DONE_RECONCILED`.

## Scope incluso

- Harness QA autenticata opt-in sicuro, oppure blocco documentato senza bypass.
- Componenti Admin Web condivisi piccoli e applicati in modo scoped.
- Foundation schema/sicurezza per `staff_accounts`, se i gate Supabase lo consentono.
- Read model staff safe che non espone `credential_hash`.
- Boundary hashing server-only testabile.
- Scanner statici per evitare esposizione credential e service role client.
- UI `/shop/staff` read-only o empty state safe.
- Evidence, screenshot, controlli e handoff finale riconciliato.

## Scope escluso

- Nessun login POS reale.
- Nessuna sessione POS.
- Nessuno staff account reale creato.
- Nessun PIN/password reale.
- Nessun form mutativo funzionante di creazione/reset/suspend staff.
- Nessuna esposizione di `credential_hash`.
- Nessun service-role nel client/browser.
- Nessuna modifica Android/iOS/POS/Win7POS.
- Nessun commit.
- Nessun git push.
- Nessuno stage finale.

## Letture completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/admin-dashboard.md`
- `docs/SKILLS/supabase-security.md`
- `docs/TASKS/TASK-012-pos-staff-credential-planning.md`
- `docs/TASKS/EVIDENCE/TASK-012/README.md`
- `docs/TASKS/TASK-013-admin-web-ui-ux-professional-polish.md`
- `docs/TASKS/EVIDENCE/TASK-013/README.md`
- `src/app`
- `src/components`
- `src/server`
- `src/lib/supabase`
- `supabase/migrations`
- `tests`
- `scripts/security-checks.mjs`
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`

Fonti esterne consultate:

- Supabase changelog 2026 per grant espliciti Data API.
- Supabase Row Level Security docs.
- Supabase Securing your API docs.

## Pre-flight

| Check | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` iniziale | `PASS` | Nessun output su `main`. |
| `git diff --stat` iniziale | `PASS` | Nessun output su `main`. |
| `git diff --check` iniziale | `PASS` | Exit code 0, nessun whitespace error. |
| `git log --oneline --decorate -n 12` | `PASS` | HEAD `6b9f765 Merge admin web task reconciliation`; `origin/main` allineato. |
| `git checkout main` | `PASS` | Gia su `main`. |
| `git pull --ff-only origin main` | `PASS` | `Already up to date.` |
| Branch dedicato | `PASS` | Creato `codex/task-014-integrated-auth-qa-design-pos-foundation`. |

## Supabase discovery iniziale

| Check | Esito | Sintesi |
| --- | --- | --- |
| `supabase --version` | `PASS` | `2.102.0`. |
| `supabase migration list --linked` | `PASS` | Local/remoto allineati fino a `20260530120000`. |
| `supabase db push --linked --dry-run` | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | `No issues found`. |
| Discovery tabelle staff | `PASS_WITH_NOTES` | Nessuna `staff_accounts`, `staff_accounts_safe` o `devices` trovata. |
| Discovery colonne credential/staff | `PASS_WITH_NOTES` | Solo false positive `shop_inventory_sources.mapping_state`; nessun `staff_code`, `credential_hash`, PIN o password staff. |

## Strategia fase 1 - Authenticated Visual QA Fixture

- Riutilizzare il live auth harness opt-in esistente, senza persistenza di storage state.
- Estendere il gate per coprire anche Shop Admin con fixture temporanea shop-scoped se l'ambiente Supabase lo permette.
- Non stampare email/password/token/magic link.
- Salvare screenshot solo in `docs/TASKS/EVIDENCE/TASK-014/`, senza secret.
- Se l'ambiente non consente la fixture, classificare `AUTHENTICATED_VISUAL_QA_BLOCKED`.

## Esito fase 1 - Authenticated Visual QA Fixture

- Esito: `PASS`.
- Harness opt-in esteso in `tests/e2e/platform-admin-live-auth.spec.ts`.
- Fixture temporanea Platform Admin + Shop Admin creata lato test con service role solo nel processo Node Playwright, mai nel browser.
- Storage state, trace, video e logging credential restano disabilitati nel file di test.
- Esecuzione autenticata finale: `2 passed`, `1 skipped` per il gate TASK-006 separato.
- Screenshot evidence creati:
  - `docs/TASKS/EVIDENCE/TASK-014/browser-platform-authenticated.png`
  - `docs/TASKS/EVIDENCE/TASK-014/browser-shop-overview-authenticated.png`
  - `docs/TASKS/EVIDENCE/TASK-014/browser-shop-staff-authenticated.png`
- Note diagnostiche:
  - `npm run test:ui-live-auth` non e stato usato come esito finale perche un dev server esistente impediva l'avvio su `127.0.0.1:3001`.
  - Il gate finale e stato rieseguito riusando il dev server gia attivo su `http://localhost:3000`.
  - Durante la review finale e stato corretto un locator Playwright fragile in strict mode su `/shop/staff`.

## Strategia fase 2 - Shared Admin Components

- Consolidare i componenti gia presenti sotto `src/components/platform/components` in una superficie condivisa piccola.
- Applicarli in modo scoped senza cambiare routing, auth o dati mostrati.
- Mantenere componenti Server Component quando possibile.
- Nessuna nuova dipendenza UI.

## Esito fase 2 - Shared Admin Components

- Esito: `PASS`.
- Componenti condivisi aggiunti sotto `src/components/admin/`:
  - `PageHeader`
  - `SectionCard`
  - `EmptyState`
  - `StatusBadge`
  - `AdminDataTable`
  - `GuardrailNotice`
- Applicazione scoped:
  - `src/components/platform/PlatformPage.tsx`
  - `src/components/shop/ShopSectionPage.tsx`
- I componenti condivisi restano server-safe: nessun `"use client"`, nessun import Supabase/server, nessuna nuova dipendenza.

## Strategia fase 3 - POS Staff Foundation

- Creare migration nuova solo dopo discovery schema.
- Introdurre `public.staff_accounts` con RLS, grants severi e read model/view safe.
- Non concedere mutazioni dirette browser.
- Aggiornare tipi `Database` solo se la migration viene verificata localmente/applicata allo schema di generazione.
- Aggiungere boundary `src/server/shop-admin/staff-credentials.ts` con Node `crypto.scrypt`, zero dipendenze nuove.
- UI `/shop/staff` solo read-only/empty state, senza azioni mutative.

## Esito fase 3 - POS Staff Foundation

- Esito: `PASS`.
- Migration aggiunta: `supabase/migrations/20260531050837_task_014_pos_staff_foundation.sql`.
- La migration introduce `public.staff_accounts`, RLS, grants selettivi, view `public.staff_accounts_safe` con `security_invoker = true`, e helper `app_private.is_active_shop_staff_admin_member`.
- `credential_hash` resta sul base table e non viene esposto dalla view safe o dalla UI.
- Nessuna grant di `insert`, `update`, `delete` o `all` a `authenticated` su `public.staff_accounts`.
- Read model server-only aggiunto in `src/server/shop-admin/staff-read-model.ts`, con lettura esplicita da `staff_accounts_safe`.
- Boundary hashing server-only aggiunto in `src/server/shop-admin/staff-credentials.ts` con Node `crypto.scrypt`, salt random, verifica timing-safe e formato versionato.
- UI `/shop/staff` collegata al read model safe, ma resta read-only: nessun form mutativo, nessun login POS, nessuna creazione staff reale.
- Tipi `Database` rigenerati dal linked schema dopo applicazione della migration.
- `supabase db push --linked` eseguito nella review finale dopo dry-run/lint/advisors positivi; post-push `migration list` e `db push --dry-run` confermano local/remoto allineati.
- Fix review: il parser dell'hash credential ora fallisce chiuso su segmenti extra e parametri non numerici; aggiunto test runtime del boundary hashing.

## Review finale / DONE reconciliation

Richiesta dall'utente il 2026-05-31 con obiettivo di portare `TASK-014` a `DONE_RECONCILED` solo se i gate critici fossero realmente superati.

Esito review:

- Governance: `PASS`; Master Plan, task ed evidence sono riallineati a `DONE_RECONCILED`.
- Design system: `PASS`; componenti condivisi piccoli, server-safe, senza nuove dipendenze.
- Authenticated QA: `PASS`; fixture temporanei, nessuno storage state, nessun token/magic link/password salvato, screenshot aggiornati.
- POS Staff schema/RLS: `PASS`; migration additiva applicata al linked dev, RLS/grants/view safe verificati con lint/advisors post-push.
- Credential hashing boundary: `PASS`; bug difensivo corretto e test runtime aggiunti.
- Staff read model/UI: `PASS`; server-only, shop-scoped, read-only, nessun hash/plaintext/token in DTO o UI.
- Performance/stabilita: `PASS`; nessuna query client, nessuna nuova dipendenza, componenti condivisi restano Server Components.
- Figma: `BLOCKED_TOOL_LIMIT`; non bloccante per schema/security e documentato.
- Mobile/POS sibling: `PASS_WITH_NOTES`; nessuna modifica, Win7POS disponibile e pulito, repo Android/iOS/Cash Register non presenti.

Fix applicati durante la review:

- `src/server/shop-admin/staff-credentials.ts`
  - validazione strict del formato hash versionato;
  - rifiuto di segmenti extra;
  - rifiuto di parametri scrypt non interi/positivi.
- `tests/foundation/task-014-staff-credentials-runtime.test.mjs`
  - hash positivo;
  - verify negativo;
  - hash diversi per stesso plaintext;
  - formato invalido;
  - rehash needed;
  - nessun plaintext in output.
- `tests/e2e/platform-admin-live-auth.spec.ts`
  - locator `/shop/staff` reso stabile in strict mode.
- `src/lib/supabase/database.types.ts`
  - rigenerato dal linked schema dopo applicazione migration.
- Documentazione TASK-014/Master Plan/evidence riallineata a `DONE_RECONCILED`.

## Verifiche completate

| Check | Esito | Sintesi |
| --- | --- | --- |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`; route types generate successfully. |
| `npm run lint` | `PASS` | ESLint completato senza errori. |
| `npm run test:foundation` | `PASS` | `56` test passati, `0` falliti. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run build` | `PASS_WITH_WARNINGS` | Build completata; warning Node `DEP0205` non bloccante. |
| `npm run verify` | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `next build` passati; warning Node `DEP0205` non bloccante. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | `44 passed`; warning `DEP0205` e `NO_COLOR`/`FORCE_COLOR` non bloccanti. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth` | `NOT_FINAL_BLOCKED` | Dev server Next gia attivo su `localhost:3000`, PID `38932`; nessun processo terminato. |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test tests/e2e/platform-admin-live-auth.spec.ts --project=chromium-desktop` | `PASS_WITH_NOTES` | `2 passed`, `1 skipped`; skip previsto per gate TASK-006 separato. |
| Browser in-app su `/auth/login`, `/platform`, `/shop`, `/shop/overview`, `/shop/staff` | `PASS` | Heading attesi visibili, nessun Runtime Error. |
| `supabase migration list --linked` post-push | `PASS` | Local/remoto allineati incluso `20260531050837`. |
| `supabase db push --linked --dry-run` post-push | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` post-push | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` post-push | `PASS` | `No issues found`. |
| `supabase gen types typescript --linked --schema public,app_private,graphql_public > src/lib/supabase/database.types.ts` | `PASS` | Tipi rigenerati da schema linked applicato. |
| Metadata grant query linked | `PASS_WITH_NOTES` | Grant colonnari su `staff_accounts` per `authenticated` escludono `credential_hash`; query metadata parallele successive hanno attivato `ECIRCUITBREAKER`, quindi non usate come gate positivo. |
| `supabase status` | `BLOCKED_LOCAL_SUPABASE_NOT_RUNNING` | Container `supabase_db_merchandise-control-admin-web` non trovato. |
| Figma TASK-014 update | `BLOCKED_TOOL_LIMIT` | MCP Figma bloccato dal limite Starter plan; nessuna modifica applicata al file. |
| Android build | `NOT_RUN_NOT_NEEDED` | Nessuna modifica Android; repo Android non presente in `/Users/minxiang/Projects`. |
| iOS build | `NOT_RUN_NOT_NEEDED` | Nessuna modifica iOS; repo iOS non presente in `/Users/minxiang/Projects`. |
| POS/Win7POS build | `NOT_RUN_NOT_NEEDED` | Nessuna modifica POS; Win7POS disponibile e `git status --short` senza output. |
| Cash Register System | `NOT_AVAILABLE` | Repo non presente in `/Users/minxiang/Projects`. |
| `git diff --check` finale | `PASS` | Nessun output, exit code 0. |
| `git diff --cached --name-only` finale | `PASS` | Nessun output; nessun file staged. |
| `git status --short` finale | `PASS_WITH_NOTES` | Solo modifiche/untracked TASK-014 coerenti con scope; nessun commit, nessun git push, nessuno stage finale. |

## Handoff target

- Verdict: `DONE_RECONCILED`.
- Prossima fase: progetto `IDLE`.
- Nessun commit, nessun git push, nessuno stage finale.
