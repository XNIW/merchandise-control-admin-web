# Evidence TASK-039 - Staff-aware Shop Admin completion

## Stato

- Task: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`
- Stato task: `DONE`
- Fase: `DONE_RECONCILED`
- Milestone interna: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Data: `2026-06-04`
- Branch: `main`
- Migration Supabase create: `supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql`
- Tipi Supabase aggiornati: `src/lib/supabase/database.types.ts`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Pre-flight

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --branch` iniziale | `PASS_CLEAN_INITIAL` | Output iniziale Admin Web: `## main...origin/main`. |
| Allegato utente TASK-039 letto | `PASS` | Brief letto da `/Users/minxiang/.codex/attachments/6aaffb74-cb80-49c5-ab04-e45b7382ba83/pasted-text.txt`. |
| `AGENTS.md` | `PASS` | Lingua italiana, un task attivo, no secret, no PASS inventati, Codex handoff a REVIEW. |
| `docs/MASTER-PLAN.md` | `PASS` | TASK-039 unico task attivo. |
| Guide Next locali | `PASS` | Letti i riferimenti pertinenti in `node_modules/next/dist/docs/` prima delle modifiche App Router/Server Actions. |
| Allegato review TASK-039 letto | `PASS` | Brief review letto da `/Users/minxiang/.codex/attachments/0fc56ff8-b348-4950-848e-926f1afcc9a6/pasted-text.txt`. |
| Allegato closure finale TASK-039 letto | `PASS` | Brief closure letto da `/Users/minxiang/.codex/attachments/750417a2-255e-4b85-a163-70008d5ec161/pasted-text.txt`, `380` righe. |

## Test-first guardrail

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` | `RED_CONFIRMED` | Prima run runtime: fallivano migration TASK-039, `staff-aware-mutations.ts` e `/account/profile` mancanti. |

## Execution completata

### staff-aware mutation foundation

- Migration `20260604120000_task_039_staff_aware_shop_admin.sql` aggiunta.
- `audit_logs` espone `actor_profile_id` e `actor_staff_id`.
- Helper DB `app_private.write_staff_shop_admin_audit` aggiunto per audit staff-aware.
- `src/server/shop-admin/action-context.ts` risolve `personal_account` e `pos_staff_manager` anche per mutazioni.
- `personal_account` conserva le RPC storiche basate su `auth.uid()` e `shop_members` dove esistono.
- `pos_staff_manager` usa path server-only, shop-scoped dalla sessione staff, con audit `actor_staff_id`.
- Nuovi controlli web staff non coperti da RPC storiche usano admin client solo server-side dopo auth/permission boundary, con audit `actor_profile_id` o `actor_staff_id`.
- no bypass client-side.
- service-role solo server-side; nessun service-role nel client/browser.

### Permessi e lifecycle

- `SHOP_STAFF_WEB_PERMISSION_TREE` mantenuta.
- `SHOP_STAFF_WEB_ROLE_TEMPLATES` aggiunto per template `shop_manager_full`, `catalog_manager`, `staff_manager`, `viewer`.
- `canStaffWebPerformShopAdminAction` applica permessi granulari a catalogo, staff, devices, settings, import/export e compat `shop_admin.full_access`.
- `src/server/shop-admin/staff-aware-mutations.ts` implementa catalogo, staff POS, devices, session revoke e role permissions per staff web.
- `src/server/shop-admin/staff-mutations.ts` espone revoke web access, revoke sessions e role permission editing anche per account personale autorizzato.
- `staff_accounts.web_access_revoked_at` blocca login e session resolution staff web.

### UX e settings

- `/shop/staff` espone `Staff web access`, `Session status` e template permessi.
- `/shop/settings` espone update shop name auditato con reason e conferma `SETTINGS`.
- `/account/profile` espone session status e password reset email tramite Supabase Auth `resetPasswordForEmail`.
- Nessun flusso fake per social login o cambio password manuale.

### Review/fix pass 2026-06-04

- Bug sicurezza corretto: staff actor con solo `staff.write` non puo piu applicare template/permessi ruolo; `updateStaffRolePermissionsAsStaff` richiede `shop_admin.full_access` e audita il blocco.
- Fragilita dati corretta: aggiornamento `staff_role_permissions` non fa piu delete-all prima dell'insert; usa delete mirato dei permessi stale e `upsert` su `shop_id,role_key,permission_key`.
- Eligibility staff web corretta: `access-principal` whitelista permessi riconosciuti con `isShopStaffWebPermission`.
- UI/UX corretta: i pannelli operativi di catalogo, staff, role permissions, devices, members, import/export e settings sono mostrati solo quando un preflight server-side `resolveShopActionContext` passa con il permesso mutativo corretto.
- Import/export corretto: `catalog.import` e `catalog.export` sono separati anche nel rendering del pannello.
- Profilo account corretto: il reset password non usa piu una `redirectTo` relativa; Supabase Auth usa il redirect configurato nel progetto.
- Scanner/test aggiornati: `task-039` e `security:scan` verificano role permission replace, gate `full_access`, permission whitelist e preflight UI.

### Review/fix finale TASK-040 2026-06-04

- Problema trovato: `settings-mutations.ts` non aveva un guard esplicito su `adminConfig.status !== "configured"` nel path personal account.
- Problema trovato: l'update settings usava admin client per scrivere `shops`, ma l'audit passava dal client SSR/RLS del context; il rischio era update riuscito con audit mancante per account personale.
- Fix applicato: `updateShopSettings` ora fallisce `not_configured` prima di creare il client quando la admin env non e configurata.
- Fix applicato: `writeSettingsAudit` riceve e usa lo stesso admin client server-side passato a `updateShopSettingsWithAdminClient`.
- Guardrail applicati: test TASK-039 e `scripts/security-checks.mjs` verificano fail-closed admin config e audit settings via admin client.

### Gate non sbloccati e separati

- Staging stabile resta `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION` ed e separato in `TASK-043`.
- Win7POS live E2E resta `PARKED_E2E_PENDING`, nessuna modifica Win7POS eseguita, ed e separato in `TASK-044`.
- Sales Sync foundation resta `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` ed e separato in `TASK-045`.
- Supabase local/apply validation resta `BLOCKED_LOCAL_SUPABASE_ENV` nel runtime corrente ed e separato in `TASK-046`.
- `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA` resta il gate; nessuna route `src/app/api/pos/sales`, nessuna tabella `pos_sales`, nessuna dashboard vendite fake.

### Decisione scope closure 2026-06-04

- TASK-039 code scope: `READY_FOR_DONE_CONFIRMATION`.
- Stato task/fase storico: restava `REVIEW`; Codex non marcava `DONE` senza conferma utente.
- `TASK-043`, `TASK-044`, `TASK-045` e `TASK-046` sono task futuri non attivi e non dichiarati risolti.
- I blocker esterni non bloccano il DONE del code scope TASK-039 perche nessuno di essi e stato implementato o richiesto come runtime code path dentro questa closure: non c'e deploy, non c'e apply cloud/live, non c'e modifica Win7POS, non c'e Sales Sync runtime.

### Chiusura formale TASK-040 2026-06-04

Conferma esplicita utente ricevuta nell'allegato TASK-040: se i check freschi confermano lo stato gia documentato, TASK-039 puo essere marcato `DONE` per il suo code scope.

Stato prima:

- `REVIEW`
- `READY_FOR_DONE_CONFIRMATION`

Stato dopo:

- `DONE`
- `DONE_RECONCILED`

Check freschi:

| Comando | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` | `PASS`, `4/4` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `179/179` |
| `npm run typecheck` | `PASS`, `Types generated successfully` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]` |
| `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNING`, warning noto `[DEP0205]` |

I follow-up runtime ex `TASK-043`, ex `TASK-044`, ex `TASK-045` ed ex `TASK-046` sono `FOLDED_INTO_TASK-040`. Nessuno di questi blocker viene dichiarato `PASS`.

Commit/push/stage: `NOT_RUN` / `NOT_RUN` / `NOT_STAGED`; no commit eseguito, no push eseguito, no stage finale.

## File modificati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md`
- `docs/TASKS/EVIDENCE/TASK-039/README.md`
- `scripts/security-checks.mjs`
- `src/app/account/profile/PasswordResetPanel.tsx`
- `src/app/account/profile/actions.ts`
- `src/app/account/profile/page.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/StaffActionPanel.tsx`
- `src/app/shop/actions.ts`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/devices/page.tsx`
- `src/app/shop/import-export/page.tsx`
- `src/app/shop/members/page.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/settings/page.tsx`
- `src/app/shop/staff/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/lib/supabase/database.types.ts`
- `src/server/shop-admin/access-principal.ts`
- `src/server/shop-admin/action-context.ts`
- `src/server/shop-admin/catalog-mutations.ts`
- `src/server/shop-admin/data-access.ts`
- `src/server/shop-admin/device-mutations.ts`
- `src/server/shop-admin/settings-mutations.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/server/shop-admin/staff-aware-mutations.ts`
- `src/server/shop-admin/staff-mutations.ts`
- `src/server/shop-admin/staff-read-model.ts`
- `src/server/shop-admin/staff-web-auth.ts`
- `src/server/shop-admin/staff-web-permissions.ts`
- `supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql`
- `tests/foundation/task-032-permissions-hardening.test.mjs`
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`
- test foundation governance esistenti aggiornati per riconoscere TASK-039 come task attivo.

## Check richiesti

| Check | Esito corrente | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` | `PASS` | Closure run: `tests 4`, `pass 4`, `fail 0`. |
| `npm run security:scan` | `PASS` | Closure run: `Security scan passed.` |
| `npm run test:foundation` | `PASS` | Closure run: `tests 179`, `pass 179`, `fail 0`. |
| `npm run lint` | `PASS` | Closure run: `eslint` completato con exit code 0. |
| `npm run typecheck` | `PASS` | Closure run: `next typegen` -> `Types generated successfully`; `tsc --noEmit` completato. |
| `npm run build` | `PASS_WITH_TOOLCHAIN_WARNING` | Closure run: Next `16.2.6` compiled successfully; warning noto Node `[DEP0205]` su `module.register()`. |
| `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNING` | Closure run: `lint`, `typecheck`, `security:scan`, `build` completati; stesso warning `[DEP0205]`. |
| Browser in-app locale | `PASS_NON_AUTH_GUARD` | Server `http://127.0.0.1:3040`; `/account/profile`, `/shop/staff-login` e `/shop/settings` render/gate corretti; console error `0`; screenshot `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/artifacts/browser/staff-login.png`. |
| Codex Security diff scan | `PASS_NO_OPEN_FINDINGS_AFTER_FIXES` | Report validato: `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/report.md` e `.html`; 0 finding reportable aperti dopo fix. |
| `git diff --check` | `PASS` | Exit code 0, nessun whitespace error. |
| `git diff --cached --name-status` | `PASS_NOT_STAGED` | Output vuoto; nessun file staged. |
| `git status --short --branch --untracked-files=all` | `PASS_DIRTY_EXPECTED` | Branch `main...origin/main`; modifiche TASK-039/Admin Web non staged. |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_SKIPS` | Closure run: `1 passed`, `2 skipped`; guard senza sessione verificata, dataset synthetic authenticated/staff non eseguiti. |
| `npm run test` | `NOT_AVAILABLE` | `package.json` non definisce script `test`; script disponibili verificati con lettura reale di `package.json`. |
| `npm run dev:db:status` | `BLOCKED_LOCAL_SUPABASE_ENV` | Closure run exit code `2`: Supabase CLI `2.104.0` e project id PASS, ma `.env.local` punta a `supabase_cloud`, `SUPABASE_SERVICE_ROLE_KEY` manca, container locale atteso `supabase_db_merchandise-control-admin-web` mismatch con `supabase_db_MerchandiseControlSupabase`, e `supabase status` non completa. |
| Supabase apply/typegen live | `NOT_RUN_LOCAL_MIGRATION_ONLY` | Migration e tipi aggiornati localmente; nessun deploy/apply live richiesto o dichiarato. |

## Rischi residui

- History accessi staff manager e leggibile da audit/session rows, ma non ha ancora una pagina dedicata separata.
- `TASK-043`: staging stabile richiede decisione Vercel/non-production e resta bloccato da comportamento Vercel gia documentato.
- `TASK-044`: Win7POS live E2E richiede ambiente Windows/WPF o gate equivalente.
- `TASK-045`: Sales Sync richiede schema/API/idempotency e gate live prima di qualsiasi dashboard incassi reale.
- `TASK-046`: Supabase apply/local validation richiede ambiente locale coerente o autorizzazione esplicita a un apply non-production.

## Conferma negativa

- No commit eseguito.
- No push eseguito.
- No stage intenzionale eseguito.
- Nessun deploy reale.
- Nessuna modifica Win7POS.
- Nessun Sales Sync runtime.
- Nessuna dashboard vendite fake.
- Nessun secret hardcoded.
