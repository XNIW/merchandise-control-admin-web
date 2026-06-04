# Evidence TASK-038 - POS manager web login, provisioning, permissions and revenue gate

## Stato task

- Task: `TASK-038`
- Stato task: `DONE`
- Fase: `DONE`
- Verdict corrente: `DONE`
- Data: `2026-06-04`
- Branch: `main`
- Migration create/apply: `CREATED_AND_APPLIED_LOCAL_NON_PRODUCTION`
- Commit: `REQUESTED_IN_FINALIZATION`
- Push: `REQUESTED_IN_FINALIZATION`

## Pre-flight

| Check | Esito | Note |
| --- | --- | --- |
| `git status --short --branch --untracked-files=all` | `PASS_CLEAN` | `## main...origin/main` prima dell'apertura TASK-038. |
| `git log --oneline -5` | `PASS` | Ultimo commit `0b54d09 chore: finalize TASK-037 shop admin dual access model`. |
| `git diff --check` | `PASS` | Nessun whitespace error iniziale. |
| TASK-037 state | `PASS` | Master Plan, task ed evidence registrano TASK-037 `DONE`; commit/push documentati. |
| `npm run dev:db:check` | `PASS_FAIL_CLOSED` | `.env.local` punta a `supabase_cloud`; container locale mismatch `MerchandiseControlSupabase`; nessun uso production. |

## Discovery statica iniziale

### Schema presente

- `profiles`
- `shops`
- `shop_members`
- `staff_accounts`
- `staff_accounts_safe`
- `shop_devices`
- `pos_device_credentials`
- `pos_sessions`
- `audit_logs`
- `sync_events`

### Schema mancante o insufficiente

- `staff_web_sessions`: migration additiva creata e applicata su Supabase locale non-production.
- `staff_web_login_attempts`: migration additiva creata per rate limit/lockout server-side.
- `staff_role_permissions`: migration additiva creata per permission tree role/shop-scoped.
- Storage esplicito per `shop_admin.full_access`: migration additiva creata/applicata in `staff_role_permissions`.
- `admin` staff role: `NOT_PRESENT_IN_SCHEMA`.
- Tabelle vendite/incassi reali: `NOT_FOUND_STATICALLY`.

### Boundary esistenti

- Personal account login: Supabase Auth browser/SSR cookies.
- Shop Admin personal-account guard: `resolveCurrentShopAdminShellAccess`.
- Staff credential hashing: `scrypt-v1`, server-only.
- POS first-login/heartbeat: server-side con service role solo server, token raw solo in response POS e hash DB.
- POS lockout: `failed_attempts`, `locked_until`, `credential_status`.
- POS sessions: device-bound, non browser session.
- Staff mutations Shop Admin: RPC auditabili via personal account membership.

## Decisioni provvisorie

- Non riusare `pos_sessions` per staff web browser: e legata a POS device credentials.
- Non creare dashboard incassi senza tabelle vendite reali.
- Gate dashboard incassi: `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`.
- Revenue dashboard requires real sales sync data; no fake revenue values are rendered in TASK-038.
- Non aprire Sales Sync.
- Non usare Supabase production.

## Check in corso

| Check | Esito | Note |
| --- | --- | --- |
| Supabase changelog/docs | `CHECKED` | `https://supabase.com/changelog.md` consultato; rilevante il breaking change `Tables not exposed to Data and GraphQL API automatically`. TASK-038 mantiene le nuove tabelle server-only e revocate da `anon`/`authenticated`. |
| Next.js App docs | `CHECKED` | Letti docs locali su Server Actions, Route Handlers e Authentication prima di pianificare route/action. |

## Implementazione TASK-038

- Migration additiva: `supabase/migrations/20260604035308_task_038_pos_manager_web_login.sql`.
- Tabelle migration: `staff_web_sessions`, `staff_web_login_attempts`, `staff_role_permissions`.
- Apply migration: `PASS_LOCAL_NON_PRODUCTION`, via `supabase migration up --local` sullo stack locale `MerchandiseControlSupabase` dopo verifica diretta container/DB; nessun uso production.
- Typegen Supabase: `PASS_REAL_LOCAL`, rigenerato da DB locale con schema `public,app_private`; `database.types.ts` ora include `staff_web_sessions`, `staff_web_login_attempts` e `staff_role_permissions` da typegen reale.
- Runtime staff web: `src/server/shop-admin/staff-web-auth.ts`, server-only, cookie HTTP-only, token hash, lockout, credential verify e audit login/logout.
- Permission tree: `src/server/shop-admin/staff-web-permissions.ts`, con `shop_admin.full_access` e helper server-only.
- Login route: `src/app/(staff-auth)/shop/staff-login/page.tsx` + `actions.ts`, senza client storage e senza service role lato browser.
- Logout route: `src/app/shop/staff-logout/route.ts`.
- Shop shell: `src/app/shop/layout.tsx` risolve `personal_account` prima e `pos_staff_manager` da staff web cookie come fallback.
- Data access dual principal: `src/server/shop-admin/data-access.ts` risolve account personale con SSR/RLS e staff manager con admin client server-only, sempre filtrando per `selectedShop.shopId`.
- Read model Shop Admin aggiornati per staff web: overview, inventory, history/detail, staff, devices, audit e POS live passano da `resolveShopAdminDataAccess`.
- Action context Shop Admin: `pos_staff_manager` e bloccato esplicitamente sui mutator esistenti; le azioni personali continuano a usare RPC basati su `auth.uid()`.
- Platform provisioning staff manager: `src/server/platform-admin/staff-manager-provisioning.ts`, `src/app/platform/provisioning/actions.ts` e `StaffManagerProvisioningPanel.tsx` creano staff manager server-side, abilitano `shop_admin.full_access` role/shop-scoped e mostrano il valore one-time solo nella risposta action.
- Revenue gate: `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`; Revenue dashboard requires real sales sync data.

## Check finali

| Check | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-038-pos-manager-web-login.test.mjs` | `PASS` | `6/6` pass. |
| `npm run security:scan` | `PASS` | Scanner TASK-038 aggiunto. |
| `npm run test:foundation` | `PASS` | `173/173` pass. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run lint` | `PASS` | `eslint`. |
| `npm run build` | `PASS_WITH_WARNING` | Build passa; warning noto `[DEP0205]`. |
| `npm run verify` | `PASS_WITH_WARNING` | Lint/typecheck/security/build passano; warning noto `[DEP0205]`. |
| `npm run test:shop-admin-auth-smoke` | `PASS_LOCAL_NON_PRODUCTION` | `3 passed`; include personal account smoke, staff manager web session smoke, cashier denial e cleanup zero residui `TASK035_*`. |
| Staff web form manual smoke | `PASS_LOCAL_NON_PRODUCTION` | Form reale `/shop/staff-login`: manager success, logout revocato, cashier denied, viewer denied, wrong credential generic, no sensitive values rendered, cleanup zero. |
| `npm run dev:db:check` | `PASS_FAIL_CLOSED` | Eseguito in pre-flight; `.env.local` cloud + container locale mismatch, nessun uso production. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git diff --cached --name-status` | `PASS_EMPTY` | Nessun file staged. |

## Rischi aperti

- Final review 2026-06-04: corretti audit failure staff web troppo informativi, pending/copy one-time nel provisioning panel e wording evidence sul manual smoke reale.
- `npm run dev:db:check` resta fail-closed per `.env.local` cloud/container mismatch, anche se TASK-038 ha qualificato e usato lo stack locale direttamente senza production.
- Server Actions Shop Admin esistenti usano RPC con `auth.uid()` personale; TASK-038 blocca `pos_staff_manager` sui mutator invece di adattare RPC non staff-aware.
- Platform provisioning abilita `shop_admin.full_access` a livello ruolo `manager` per shop, coerente con la migration role/shop-scoped: eventuale permissioning per singolo staff richiede follow-up schema.
- Revenue dashboard resta bloccata finche non esistono dati vendite reali.
- `npm run test:shop-admin-auth-smoke` usa una sessione staff sintetica per evitare audit append-only nel dataset `TASK035_*`; il submit reale `/shop/staff-login` e `/shop/staff-logout` e stato verificato separatamente con manual smoke locale `TASK038_*` e cleanup zero.

## Verdict corrente

`DONE`
