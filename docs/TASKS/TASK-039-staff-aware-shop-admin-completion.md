# TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation

## Informazioni generali

- ID: `TASK-039`
- Titolo: `Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED`
- Data apertura: `2026-06-04`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-039/README.md`
- Branch Admin Web: `main`
- Milestone interna corrente: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Obiettivo

Completare in modo repo-grounded, phased e verificabile il follow-up di TASK-038:

1. mutazioni Shop Admin staff-aware;
2. permission tree granulare completo;
3. lifecycle operativo staff manager;
4. UX account/profile Admin Web;
5. strategia staging stabile;
6. ripresa gate Win7POS live E2E;
7. Sales Sync foundation solo con schema/evidence reale;
8. UI/UX cleanup;
9. test, harness e security.

Questo file registra audit, execution, review/fix e closure del code scope TASK-039. Dal pass TASK-040 del 2026-06-04, TASK-039 e formalmente `DONE` / `DONE_RECONCILED` per il solo code scope dopo conferma esplicita utente e check freschi. Non dichiara prontezza production, staging stabile, Supabase apply, Win7POS live E2E o Sales Sync pronta.

## Letture obbligatorie completate nella Fase 0

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-038-pos-manager-web-login-platform-provisioning-permissions-revenue-gate.md`
- `docs/TASKS/EVIDENCE/TASK-038/README.md`
- `docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md`
- `docs/TASKS/TASK-029-production-path-staging-win7pos-bootstrap.md`
- `docs/TASKS/TASK-031-vercel-preview-retry.md`
- `docs/TASKS/EVIDENCE/TASK-033/sales-sync-planning.md`
- `docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md`
- `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`
- `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`
- `docs/DEPLOYMENT/STAGING.md`
- `docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md`
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`
- route e Server Actions Shop Admin sotto `src/app/shop`
- read model/mutazioni Shop Admin sotto `src/server/shop-admin`
- migration Supabase esistenti in `supabase/migrations`
- `src/lib/supabase/database.types.ts`
- script/check in `package.json`
- repo Win7POS locale disponibile in `/Users/minxiang/Projects/Win7POS` come riferimento read-only

## Audit repo-grounded Fase 0

### Stato git e routing

- Admin Web pre-flight: `git status --short --branch` -> `## main...origin/main` prima delle modifiche TASK-039.
- Router: Next.js App Router con `src/app`, Next `16.2.6`.
- Route Shop Admin principali: `/shop`, `/shop/products`, `/shop/categories`, `/shop/suppliers`, `/shop/import-export`, `/shop/members`, `/shop/staff`, `/shop/devices`, `/shop/settings`, `/shop/audit`, `/shop/history`, `/shop/pos`, `/shop/sync`.
- Login personale: `/auth/login`, logout personale: `/auth/logout`.
- Login staff manager web: `/shop/staff-login` in route group `(staff-auth)`, logout staff web: `/shop/staff-logout`.

### Modello auth attuale

- `personal_account` usa Supabase Auth SSR e `shop_members`.
- `resolveCurrentShopAdminShellAccess` legge `supabase.auth.getUser()` e membership attive con `role_key` `shop_owner` o `shop_manager`.
- `viewer` personale resta `viewer_only` e non apre Shop Admin.
- `pos_staff_manager` usa cookie HTTP-only `mc_staff_web_session`, tabella `staff_web_sessions`, `staff_accounts` e `staff_role_permissions`.
- `resolveShopAdminDataAccess` prova prima account personale e poi staff web come fallback.
- Per staff web il read model usa admin client server-only filtrato sullo shop del principal; non usa service-role lato browser.

### Permission tree e permessi reali

- `src/server/shop-admin/staff-web-permissions.ts` contiene `SHOP_STAFF_WEB_PERMISSION_TREE`.
- Permessi granulari gia censiti nella tree TASK-038:
  - `catalog.read`
  - `catalog.write`
  - `catalog.import`
  - `catalog.export`
  - `staff.read`
  - `staff.write`
  - `devices.read`
  - `devices.write`
  - `audit.read`
  - `settings.read`
  - `settings.write`
  - `pos.dashboard.read`
  - `sync.read`
- Compatibilita MVP: `shop_admin.full_access`.
- Enforcement runtime TASK-039: `resolveShopActionContext` usa `canStaffWebPerformShopAdminAction` per autorizzare `pos_staff_manager` con `catalog.write`, `catalog.import`, `catalog.export`, `staff.write`, `devices.write`, `settings.write` e compat `shop_admin.full_access`.
- `staff_role_permissions` e role/shop-scoped; `SHOP_STAFF_WEB_ROLE_TEMPLATES` espone template `shop manager full`, `catalog manager`, `staff manager`, `viewer`.

### Mutazioni Shop Admin

Baseline iniziale: mutazioni staff web non implementate.

Stato execution: mutazioni staff web implementate con boundary server-only.

- `src/server/shop-admin/action-context.ts` risolve `personal_account` e `pos_staff_manager`.
- `src/server/shop-admin/staff-aware-mutations.ts` contiene `runStaffAwareShopAdminMutation` e `write_staff_shop_admin_audit`.
- `personal_account` continua a usare le RPC esistenti basate su `auth.uid()` e `shop_members`.
- `pos_staff_manager` usa admin client server-side, shop scoped dalla sessione staff, con audit `actor_staff_id`; nessun service-role lato client/browser.
- Catalogo:
  - `src/server/shop-admin/catalog-mutations.ts`
  - RPC `shop_catalog_create_supplier`, `shop_catalog_update_supplier`, `shop_catalog_archive_supplier`
  - RPC `shop_catalog_create_category`, `shop_catalog_update_category`, `shop_catalog_archive_category`
  - RPC `shop_catalog_create_product`, `shop_catalog_update_product`, `shop_catalog_archive_product`, `shop_catalog_restore_product`
- Import/export Excel:
  - `src/server/shop-admin/import-export-workbook.ts`
  - usa `resolveShopActionContext` per `catalog.import` / `catalog.export`
  - audit via `shop_admin_audit_event`
- Staff POS:
  - `src/server/shop-admin/staff-mutations.ts`
  - RPC `shop_staff_create`, `shop_staff_reset_credential`, `shop_staff_suspend`, `shop_staff_reactivate`, `shop_staff_archive`, `shop_staff_force_credential_rotation`, `shop_staff_clear_lockout`
- Devices:
  - `src/server/shop-admin/device-mutations.ts`
  - RPC `shop_device_register`, `shop_device_rename`, `shop_device_revoke`, `shop_device_reactivate`
- Membri personali shop:
  - `src/server/shop-admin/member-mutations.ts`
  - RPC `shop_member_invite_profile`, `shop_member_update_role`, `shop_member_remove`
- Settings:
  - `src/server/shop-admin/settings-mutations.ts` aggiorna il nome shop con `settings.write`;
  - `/shop/settings` espone form reasoned e auditato;
  - `personal_account` owner e `pos_staff_manager` autorizzato registrano audit con actor coerente.

### RPC e vincoli DB

- Le RPC Shop Admin correnti dipendono da `auth.uid()` e da helper/membership `shop_members`.
- Migration rilevanti:
  - `20260531171726_task_015_shop_admin_completion.sql`
  - `20260531230000_task_017_shop_business_completion.sql`
  - `20260531233000_task_017_member_owner_enforcement.sql`
  - `20260531235900_task_019_pos_auth_foundation.sql`
  - `20260601120000_task_021_pos_sessions_devices.sql`
  - `20260604035308_task_038_pos_manager_web_login.sql`
- `audit_logs` ora espone `actor_profile_id` e `actor_staff_id`.
- `app_private.write_shop_admin_audit` scrive `actor_profile_id = auth.uid()`.
- TASK-039 aggiunge `supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql` con `actor_staff_id`, `write_staff_shop_admin_audit` e campi `web_access_revoked_*`.
- Non basta chiamare le RPC esistenti con service role: TASK-039 separa il path staff-aware e registra actor staff in modo queryable.

### Lifecycle staff manager

Gia presente:

- create staff;
- reset credential;
- suspend;
- reactivate;
- archive;
- force credential rotation;
- clear lockout;
- `credential_expires_at`, `credential_status`, `must_change_credential`, `session_invalidated_at`;
- login/logout staff web con revoca sessione corrente.

Execution TASK-039:

- `revoke web access` dedicato aggiunto con `web_access_revoked_at`;
- revoca tutte le sessioni staff web aggiunta;
- editing permessi staff role/shop aggiunto con template granulari;
- history accessi staff manager resta leggibile tramite audit/session rows, senza pagina dedicata separata;
- credenziale temporanea resta gestita dai flussi create/reset esistenti senza esporre hash o token.

### Account/profile UX

- Login personale esiste in `/auth/login`.
- Logout personale esiste in `/auth/logout`.
- Session status leggibile in `/account/profile`.
- Cambio password personale gestito con reset email Supabase Auth (`resetPasswordForEmail`), non con flusso finto.
- Nessun Google/Apple/WeChat attuale.

### Staging e deploy

- `docs/DEPLOYMENT/STAGING.md` documenta blocker Vercel.
- `docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md` documenta Cloudflared come HTTPS effimero/non-production.
- `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md` mantiene gate mancanti.
- Vercel resta parcheggiato con `git.deploymentEnabled=false`.
- Stato reale: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION` / `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.
- Nessuna staging stabile HTTPS e disponibile.

### Win7POS live gate

- Repo locale trovato: `/Users/minxiang/Projects/Win7POS`.
- Stato Win7POS osservato: `## main...origin/main`, con modifiche preesistenti `.gitignore`, `docs/dev/`, `scripts/win7pos/`; nessuna modifica TASK-039 eseguita in quel repo.
- TASK-022_023 resta `PARKED_E2E_PENDING`.
- TASK-033 conferma Win7POS live WPF non eseguibile su questa macchina macOS senza Windows/Wine/Mono.
- Scanner/harness Win7POS esistono per bootstrap/client/catalog, ma non sostituiscono live E2E reale.

### Sales Sync

- Admin Web non ha route `src/app/api/pos/sales` e non ha migration `pos_sales`.
- Documenti esistenti restano planning-only: `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md` e `docs/TASKS/EVIDENCE/TASK-033/sales-sync-planning.md`.
- Win7POS locale ha modello vendite reale:
  - SQLite `sales`
  - SQLite `sale_lines`
  - `Sale`, `SaleLine`, `SaleKind`
  - `SaleRepository` con insert, summary, refund/void support.
- Questo supporta un futuro contratto, ma non basta per implementare dashboard incassi Admin Web: manca schema server, endpoint sync, idempotency verificata, E2E Win7POS live e cleanup dataset.
- Stato TASK-039: `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`.

## Checklist phased

| Fase | Stato iniziale reale | Note |
| --- | --- | --- |
| 0 - Audit repo-grounded | `AUDIT_COMPLETE` | Task/evidence creati, Master Plan aggiornato, nessun runtime mutato. |
| 1 - Staff-aware mutation foundation | `PASS_READY_FOR_DONE_CONFIRMATION` | Boundary staff-aware, `actor_staff_id`, audit e direct server-only mutators implementati. |
| 2 - Permission tree granulare | `PASS_READY_FOR_DONE_CONFIRMATION` | Tree, template e enforcement server-side mutativo aggiunti; `shop_admin.full_access` resta compat. |
| 3 - Staff manager lifecycle | `PASS_READY_FOR_DONE_CONFIRMATION_WITH_NOTE` | Revoke web access, revoke sessions e permission editing aggiunti; pagina history dedicata resta follow-up non bloccante. |
| 4 - Account/profile UX | `PASS_READY_FOR_DONE_CONFIRMATION` | `/account/profile` aggiunto con session status e reset email sicuro. |
| 5 - Staging stabile | `SPLIT_TO_TASK-043_NOT_BLOCKING_TASK_039_CODE_SCOPE` | Vercel Preview forza Production; Cloudflared e effimero. Blocker storico: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`. |
| 6 - Win7POS live E2E resume | `SPLIT_TO_TASK-044_NOT_BLOCKING_TASK_039_CODE_SCOPE` | Win7POS repo presente; runtime Windows/WPF non disponibile qui. Blocker storico: `PARKED_E2E_PENDING`. |
| 7 - Sales Sync foundation | `SPLIT_TO_TASK-045_NOT_BLOCKING_TASK_039_CODE_SCOPE` | Win7POS sales locale esiste; Admin Web schema/API/gate live assenti. Blocker storico: `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA`. |
| 8 - UI/UX cleanup | `PASS_READY_FOR_DONE_CONFIRMATION` | Pannelli staff/settings/account aggiunti senza secret o token. |
| 9 - Test, harness, security | `PASS_READY_FOR_DONE_CONFIRMATION` | Test/scanner/check finali eseguiti e registrati in evidence. |

## Decisione scope closure 2026-06-04

Perimetro code scope TASK-039 pronto per conferma `DONE`: mutazioni Shop Admin staff-aware, permission tree granulare, lifecycle web staff, account/profile UX, UI preflight, audit `actor_staff_id`, test/scanner e handoff documentale.

Gate esterni separati formalmente e non dichiarati risolti:

- `TASK-043 - Staging stabile non-production`: prende in carico `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION` e la strategia HTTPS stabile. Non blocca il `DONE` code scope di TASK-039 perche TASK-039 non ha eseguito deploy e non modifica la configurazione Vercel.
- `TASK-044 - Win7POS live E2E`: prende in carico `PARKED_E2E_PENDING`, ambiente Windows/WPF, dataset live e cleanup. Non blocca il `DONE` code scope di TASK-039 perche TASK-039 non modifica Win7POS e non introduce contratti runtime POS nuovi.
- `TASK-045 - Sales Sync foundation`: prende in carico schema/API/idempotency/dashboard incassi reale. Non blocca il `DONE` code scope di TASK-039 perche TASK-039 mantiene `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA` e non introduce Sales Sync runtime o dati fake.
- `TASK-046 - Supabase environment/apply validation`: prende in carico ambiente Supabase locale/allineato, eventuale apply non-production e typegen da DB. Non blocca il `DONE` code scope di TASK-039 finche migration e tipi restano additivi/locali, i check statici passano e non viene dichiarato alcun apply cloud/live.

Questa decisione storica non marcava `DONE`: il task restava in `REVIEW` e richiedeva conferma esplicita utente secondo `AGENTS.md` e `CLAUDE.md`.

## Chiusura formale TASK-040 2026-06-04

Conferma esplicita utente ricevuta nell'allegato TASK-040: se i check freschi confermano lo stato gia documentato, TASK-039 puo essere marcato `DONE` per il suo code scope.

Check freschi eseguiti:

- `git diff --check`: `PASS`;
- `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`: `PASS`, `4/4`;
- `npm run security:scan`: `PASS`;
- `npm run test:foundation`: `PASS`, `179/179`;
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run build`: `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]`;
- `npm run verify`: `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]`.

Stato prima: `REVIEW` / `READY_FOR_DONE_CONFIRMATION`.

Stato dopo: `DONE` / `DONE_RECONCILED`.

I follow-up runtime ex `TASK-043`, ex `TASK-044`, ex `TASK-045` ed ex `TASK-046` sono `FOLDED_INTO_TASK-040`, non chiusi come `PASS`.

Commit/push/stage: `NOT_RUN` / `NOT_RUN` / `NOT_STAGED`; no commit eseguito, no push, no stage finale.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | Aprire TASK-039 come unico task attivo nel Master Plan | `PASS` |
| CA-02 | Creare task/evidence TASK-039 | `PASS` |
| CA-03 | Audit repo-grounded di auth, staff web, permessi, mutazioni e RPC | `PASS` |
| CA-04 | Documentare i blocker reali senza inventare schema o dati | `PASS` |
| CA-05 | Rendere mutazioni Shop Admin staff-aware | `PASS_READY_FOR_DONE_CONFIRMATION` |
| CA-06 | Enforce permission tree granulare lato server | `PASS_READY_FOR_DONE_CONFIRMATION` |
| CA-07 | Completare lifecycle staff manager web/POS | `PASS_READY_FOR_DONE_CONFIRMATION_WITH_NOTE` |
| CA-08 | Migliorare Account/Profile UX senza flussi finti | `PASS_READY_FOR_DONE_CONFIRMATION` |
| CA-09 | Preparare staging stabile senza Production come staging | `SPLIT_TO_TASK-043_NOT_BLOCKING_TASK_039_CODE_SCOPE` |
| CA-10 | Riprendere Win7POS live E2E con evidence reale | `SPLIT_TO_TASK-044_NOT_BLOCKING_TASK_039_CODE_SCOPE` |
| CA-11 | Sales Sync foundation solo se schema/gate reali | `SPLIT_TO_TASK-045_NOT_BLOCKING_TASK_039_CODE_SCOPE` |
| CA-12 | Check disponibili eseguiti e registrati | `PASS_READY_FOR_DONE_CONFIRMATION` |

## Execution summary

- Test RED TASK-039 confermato prima del runtime.
- Migration `20260604120000_task_039_staff_aware_shop_admin.sql` aggiunta.
- `src/server/shop-admin/action-context.ts` autorizza staff web con permessi granulari.
- `src/server/shop-admin/staff-aware-mutations.ts` implementa catalogo, staff, device, session revoke e role permissions con audit staff.
- `src/server/shop-admin/settings-mutations.ts` implementa settings update auditato.
- `src/app/shop/_components/StaffActionPanel.tsx` espone lifecycle e permission template.
- `src/app/account/profile` espone session status e reset password email.
- Browser in-app locale su `http://127.0.0.1:3040` verificato per `/account/profile`, `/shop/staff`, `/shop/settings`, `/shop/products`, `/shop/categories`, `/shop/suppliers`, `/shop/devices`, `/shop/import-export`, `/shop/members`: HTTP `200`, nessun error boundary, console error `0`, guardia auth visibile e pannelli mutativi nascosti senza sessione.
- Sales Sync runtime non aperto; `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA` resta il gate.

## Review/fix pass 2026-06-04

La review repo-grounded partita da `READY_FOR_REVIEW` ha trovato e corretto problemi reali senza marcare il task `DONE`.

- Permission escalation evitata: un `pos_staff_manager` con solo `staff.write` non puo piu applicare template/permessi ruolo; il path staff richiede `shop_admin.full_access` e registra un audit `shop.staff.permissions.update.failure` con code `unauthorized`.
- Aggiornamento `staff_role_permissions` reso meno fragile: il path personal/staff usa replace mirato con delete dei permessi stale e `upsert` su `shop_id,role_key,permission_key`, evitando il vecchio delete-all prima dell'insert.
- Eligibility staff web irrigidita: `access-principal` considera solo permessi presenti nella registry centrale `SHOP_STAFF_WEB_PERMISSION_TREE`, non qualunque stringa non vuota.
- UI Shop Admin allineata ai permessi server-side: pannelli catalogo, staff, role permissions, devices, members, import/export e settings sono renderizzati solo dopo preflight `resolveShopActionContext` con il permesso mutativo corretto.
- Import/export separa `catalog.import` e `catalog.export` anche a livello UI.
- Password reset profilo reso piu robusto: rimossa una `redirectTo` relativa, lasciando a Supabase Auth il redirect configurato invece di derivare host/origin dalla request.
- Review/fix finale da TASK-040 ha corretto `settings-mutations.ts`: personal account fail-closed esplicito quando la admin env non e configurata e audit settings scritto con admin client server-side invece del client SSR/RLS.
- Scanner e test TASK-039 rinforzati per intercettare regressioni su whitelist permessi, role permission replace, gate `full_access` e preflight UI.
- `buildSettingsSection` non descrive piu settings come write bloccato: resta `Guarded` e coerente con `settings.write`.

## Closure pass 2026-06-04

La verifica finale richiesta per DONE closure conferma che i blocker residui sono esterni al code scope TASK-039 e sono separati nei task futuri `TASK-043`, `TASK-044`, `TASK-045` e `TASK-046`.

Il code scope TASK-039 arriva storicamente a `READY_FOR_DONE_CONFIRMATION`. Nel pass TASK-040 del 2026-06-04, con conferma esplicita utente e check freschi, passa a `DONE_RECONCILED`. Staging stabile, Win7POS live E2E, Sales Sync reale e Supabase apply/local env restano non sbloccati e non sono dichiarati `PASS`.

Check closure freschi:

- `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`: `PASS`, `4/4`;
- `npm run security:scan`: `PASS`;
- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `npm run test:foundation`: `PASS`, `179/179`;
- `npm run build`: `PASS_WITH_TOOLCHAIN_WARNING` con `[DEP0205]`;
- `npm run verify`: `PASS_WITH_TOOLCHAIN_WARNING` con `[DEP0205]`;
- `npm run test:shop-admin-auth-smoke`: `PASS_WITH_SKIPS`, `1 passed`, `2 skipped`;
- `npm run dev:db:status`: `BLOCKED_LOCAL_SUPABASE_ENV`, `.env.local` cloud, service-role assente, container mismatch e `supabase status` non completato;
- Browser QA in-app: `PASS_NON_AUTH_GUARD`, `/account/profile`, `/shop/staff-login` e `/shop/settings` render/gate corretti, console error `0`, screenshot `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/artifacts/browser/staff-login.png`;
- `git diff --check`: `PASS`;
- `git diff --cached --name-status`: `PASS_NOT_STAGED`.

## Conferme negative

- No commit eseguito.
- No push eseguito.
- No stage intenzionale eseguito.
- Migration Supabase TASK-039 creata localmente.
- Tipi Supabase aggiornati localmente in `src/lib/supabase/database.types.ts`.
- Nessun deploy reale.
- Nessun uso Supabase production.
- Nessuna modifica Win7POS.
- Nessun Sales Sync runtime.
- Nessuna dashboard vendite fake.
- Nessun dato reale, token, credential o secret hardcoded.
- Nessun bypass client-side.
- Service-role solo server-side dopo auth/permission boundary.

## Handoff corrente

- Fase massima raggiunta: `DONE_RECONCILED`.
- Check disponibili: eseguiti e registrati in evidence TASK-039.
- Handoff: `DONE_RECONCILED`.
- Verdict corrente: `DONE_RECONCILED`; i blocker runtime sono tracciati in `TASK-040`.
