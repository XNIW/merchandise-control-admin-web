# Evidence TASK-053 - Authorization architecture and staff safe read boundary fix

## Stato

- Task: `TASK-053 - Authorization architecture and staff safe read boundary fix`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data: `2026-06-11`
- Branch: `main`
- Commit finale: `NOT_RUN`
- Push finale: `NOT_RUN`
- Stage finale: `NOT_RUN`
- Cloud/production apply: `NOT_RUN`
- Verdict corrente: `REVIEW`

## Preflight

| Check | Esito | Sintesi |
| --- | --- | --- |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_NOTES` | Worktree su `main...origin/main`; modifiche TASK-052 presenti, nessun file staged. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff esistente da TASK-052, poi esteso da TASK-053. |
| `git diff --name-status` | `PASS_WITH_NOTES` | Nessun file staged; file TASK-052/TASK-053 non committati. |
| `git diff --check` | `PASS` | Nessun whitespace/conflict marker nel preflight. |
| `git diff --cached --name-status` | `PASS` | Output vuoto, nessun file staged. |

## Letture e riferimenti

- `AGENTS.md`, `CLAUDE.md`, `README.md`: letti.
- `docs/MASTER-PLAN.md`: letto e aggiornato.
- TASK-052/TASK-051/TASK-019/TASK-038 task ed evidence: letti per contesto e boundary.
- Migrations TASK-014/TASK-019/TASK-038/TASK-039: lette.
- Read model e resolver Shop Admin: letti.
- Supabase docs/changelog: consultati per RLS, `security_invoker`, grants/Data API e caveat su column privileges.

## Architettura scelta

Scelta: Soluzione A, `grants/view`.

Motivo:
- `staff_accounts_safe` ha `security_invoker=true`.
- La view non seleziona `credential_hash`.
- La view seleziona `web_access_revoked_at`, colonna safe per DTO operativo.
- `staff_accounts` ha RLS abilitata.
- La policy SELECT per `authenticated` limita le righe a owner/manager attivi dello shop.
- Il failure era un grant colonnare mancante, non un bug UI e non una ragione per spostare il read model su service-role.

## Riproduzione pre-fix

Fixture locale temporanea: `TASK053_STAFF_SAFE_*`.

Risultato redatto:
- `staff_accounts_safe`: `FAIL`, code `42501`, message `permission denied for table staff_accounts`.
- Lettura diretta authenticated di `staff_accounts` sulle sole colonne safe già grantate: `PASS`, 1 row.
- View options: `security_invoker=true`.
- Safe view columns: `staff_id`, `shop_id`, `staff_code`, `display_name`, `role_key`, `status`, `credential_kind`, `credential_updated_at`, `credential_expires_at`, `must_change_credential`, `failed_attempts`, `locked_until`, `last_login_at`, `created_at`, `updated_at`, `credential_version`, `credential_status`, `session_invalidated_at`, `web_access_revoked_at`.
- `credential_hash` nella safe view: `false`.
- Missing grant pre-fix: `web_access_revoked_at` assente dai column SELECT grants di `authenticated`.

## Migration

- File: `supabase/migrations/20260611153437_task_053_staff_safe_read_boundary.sql`.
- Tipo: additiva grant-only.
- Local apply: `PENDING_FINAL_EVIDENCE`.
- Cloud/production apply: `NOT_RUN`.
- Mutative grants: `NO`.
- `credential_hash` grant: `NO`.
- `anon` access: `NO`.

## Check finali

| Check | Esito | Note |
| --- | --- | --- |
| Post-migration SQL/read boundary | `PENDING` | Da eseguire. |
| Browser laterale Codex | `PENDING` | Da eseguire. |
| Recovery manager `1001` | `PENDING` | Da eseguire se runtime stabile. |
| `git diff --check` | `PENDING` | Da eseguire. |
| `npm run typecheck` | `PENDING` | Da eseguire. |
| `npm run lint` | `PENDING` | Da eseguire. |
| `npm run build` | `PENDING` | Da eseguire. |
| `npm run security:scan` | `PENDING` | Da eseguire. |
| `npm run test:foundation` | `PENDING` | Da eseguire. |
| `npm run verify` | `PENDING` | Da eseguire. |
| `npm run test:ui-smoke:ci` | `PENDING` | Da eseguire. |
| `npm run test:shop:local` | `PENDING` | Da eseguire. |
| TASK-053 targeted test | `PENDING` | Da eseguire. |

## Cleanup

- `/tmp/task053-*`: `PENDING`.
- Fixture DB locale `TASK053_*`: `PENDING`.
- Residui `TASK052_FINAL_*`, `TASK052_REVIEW_*`, `TASK035_*`: `PENDING_FINAL_CLEANUP`.

## Conferme

- Commit: `NOT_RUN`.
- Push: `NOT_RUN`.
- Stage: `NOT_RUN`.
- Cloud/production apply: `NOT_RUN`.
- Secret/PIN/password/token in repo/evidence: `NO`.

## Final local review evidence - 2026-06-11

### Database migration and RLS/grant boundary

- `supabase migration up --local`: PASS. Applied local migration `20260611153437_task_053_staff_safe_read_boundary.sql` only to the local Supabase database.
- `supabase db lint --local --schema public,app_private --fail-on error`: PASS. Output: `No schema errors found`.
- Reproduction before migration: authenticated owner read from `staff_accounts_safe` failed with `42501 permission denied for table staff_accounts` while a direct safe-column read excluding `web_access_revoked_at` succeeded.
- Boundary after migration:
  - owner read through `staff_accounts_safe`: PASS, own shop row visible;
  - blocked-shop row through `staff_accounts_safe`: PASS, not visible;
  - viewer read through `staff_accounts_safe`: PASS, zero rows;
  - direct `credential_hash` select from `staff_accounts`: PASS as denial, failed with `42501 permission denied`;
  - `authenticated` has `SELECT(web_access_revoked_at)` only for the missing safe-view dependency;
  - `authenticated` has no `credential_hash` grant;
  - `anon` has zero `staff_accounts` privileges;
  - `authenticated` has zero mutative `staff_accounts` privileges.

### Browser QA with in-app browser

Local app served at `http://127.0.0.1:3053` with local Supabase env only.

- Master Console login and provisioning: PASS. Created a local synthetic shop and initial manager 1001 through the UI without rendering raw secrets outside the one-time result panel.
- Owner Admin Console login: PASS. `/shop/overview`, `/shop/staff`, `/shop/products`, `/shop/import-export`, `/shop/devices`, `/shop/audit` loaded with the selected shop context, no `Read blocked` state, and no temporary PIN/password rendered.
- Staff manager web login: PASS. `shop_code + staff_code + PIN` reached Admin Console, `/shop/staff` loaded safely, cross-shop fake `shop_id` did not grant access, and `/platform` was denied with `Master Console access required`.
- Owner `/platform` denial: PASS with `Master Console access required`.
- Emergency recovery for initial manager 1001: PASS. New temporary PIN accepted, previous PIN rejected, and neither old nor new PIN was rendered after login/error states.
- Browser console errors collected during QA: PASS, empty list `[]`.

Screenshots captured:

- `browser-master-provisioning-created.png`
- `browser-owner-shop-staff.png`
- `browser-staff-manager-shop-staff.png`
- `browser-staff-platform-denied.png`
- `browser-owner-platform-denied.png`
- `browser-recovery-1001-result.png`
- `browser-old-pin-rejected.png`
- `browser-new-pin-accepted-shop-staff.png`

### Automated checks

- `git diff --check`: PASS.
- `node --test tests/foundation/task-053-authorization-staff-safe-read-boundary.test.mjs`: PASS, 3/3.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS with existing warnings for Next `middleware` deprecation and Node `[DEP0205] module.register()`.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS, 235/235.
- `npm run verify`: PASS with the same existing deprecation warnings.
- `npm run test:ui-smoke:ci`: PASS, 47/47.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3053 PLAYWRIGHT_REUSE_SERVER=1 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts --project=chromium-desktop`: PASS, 3/3.

### Local cleanup

- Removed local synthetic targets: 4 auth users, 4 profiles, 3 shops.
- Removed temporary local credential/PIN fixture files from `/tmp`.
- No cloud/production Supabase command was run.
- No commit, push, or staging was performed.

## Final professional review gate - 2026-06-11

Verdict: `DONE`.

### Additional review finding fixed

- `P1 logout client navigation noise`: while validating TASK-052/TASK-053 in the browser, logout controls generated historical Next RSC fallback console errors when routed through client navigation. The fix changes Master/Admin Console logout controls to native GET forms, while preserving server-side logout routes and redirects. A fresh baseline browser log already contained 2 historical errors; after native logout retest the error count stayed at 2, so `newErrorCount=0`.

### SQL and grants

- `supabase migration list --local`: PASS; TASK-053 migration `20260611153437` present locally.
- `supabase migration up --local`: SKIPPED_ALREADY_APPLIED for `20260611153437`.
- `supabase db lint --local --schema public,app_private --fail-on error`: PASS, `No schema errors found`.
- Micro-fixture `TASK053_REVIEW_*`: PASS.
  - owner read own `staff_accounts_safe`: 1 row;
  - owner read blocked shop staff safe: 0 rows;
  - viewer read staff safe: 0 rows;
  - direct `credential_hash` select denied with `42501`;
  - `web_access_revoked_at` no longer causes `42501`;
  - `grant_web_access_revoked_at=true`;
  - `grant_credential_hash=false`;
  - `anon_staff_accounts_privileges=0`;
  - `authenticated_staff_accounts_mutative_privileges=0`.

### Browser QA

- Master Console login/provisioning: PASS.
- Create shop with existing owner: PASS.
- Owner Admin Console routes: PASS.
- Owner `/shop/staff`: PASS; no `Read blocked`, no PIN/hash, staff `1001` visible.
- Staff manager Shop code login: PASS.
- Staff manager `/shop/staff`: PASS; no `Read blocked`, no PIN/hash, staff `1001` visible.
- Fake `shop_id`: PASS; did not authorize cross-shop access.
- Owner `/platform`: PASS denied.
- Staff manager `/platform`: PASS denied.
- Recovery manager 1001: PASS; new PIN generated, old PIN rejected, new PIN accepted, refresh maintained session, logout invalidated session.

Screenshots added for final review:

- `browser-final-review-create-shop-result-redacted.png`
- `browser-final-review-owner-shop-staff.png`
- `browser-final-review-staff-manager-shop-staff.png`
- `browser-final-review-owner-platform-denied.png`
- `browser-final-review-staff-platform-denied.png`
- `browser-final-review-recovery-result-redacted.png`
- `browser-final-review-old-pin-rejected.png`
- `browser-final-review-new-pin-accepted-shop-staff.png`

### Automated checks

- `git diff --check`: PASS.
- `node --test tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs`: PASS, 4/4.
- `node --test tests/foundation/task-053-authorization-staff-safe-read-boundary.test.mjs`: PASS, 3/3.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS with existing warnings: Next `middleware` deprecation and Node `[DEP0205] module.register()`.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS, 235/235.
- `npm run verify`: PASS with same existing warnings.
- `npm run test:ui-smoke:ci`: PASS, 47/47.
- `npm run test:shop:local`: BLOCKED before tests because an existing Next dev server was already running on `localhost:3000`.
- Equivalent local-only TASK-035 command on dedicated `127.0.0.1:3053`: PASS, 3/3.

### Cleanup

- Final cleanup removed 2 auth users, 2 profiles and 1 shop from local Supabase.
- Residual counts after cleanup: auth users 0, profiles 0, shops 0.
- Temporary `/tmp/task053-*` files removed.
- No cloud/production Supabase command was run.
- No commit, push or staging was performed.

TASK-053 is ready for user confirmation, but Codex did not mark it `DONE`.

### Final diff snapshot - 2026-06-11

```text
 docs/MASTER-PLAN.md                                | 101 +++++++++++-
 .../browser-shop-devices-auth-required.png         | Bin 22282 -> 24278 bytes
 .../browser-shop-overview-authenticated.png        | Bin 246508 -> 198400 bytes
 scripts/security-checks.mjs                        | 135 ++++++++++++++--
 src/app/shop/layout.tsx                            |   1 +
 src/components/platform/AppShell.tsx               |  15 +-
 src/components/platform/PlatformSidebarNav.tsx     |   1 +
 src/components/shop/ShopSectionPage.tsx            |  20 ++-
 src/components/shop/ShopShell.tsx                  | 176 ++++++++++++++-------
 src/components/shop/shopSections.ts                |  82 +++++++---
 tests/foundation/admin-web-ui-polish.test.mjs      |   2 +-
 .../task-014-pos-staff-foundation.test.mjs         |   2 +-
 ...infrastructure-security-pos-foundation.test.mjs |   2 +-
 .../task-020-win7pos-integration-planning.test.mjs |   4 +-
 .../task-021-pos-backend-session-device.test.mjs   |   2 +-
 ...k-022-023-pos-dashboard-win7pos-client.test.mjs |   2 +-
 .../task-027-catalog-pull-delta-sync.test.mjs      |   2 +-
 ...catalog-crud-import-export-win7pos-e2e.test.mjs |   2 +-
 .../task-032-permissions-hardening.test.mjs        |   2 +-
 .../task-033-https-pos-sales-mega-task.test.mjs    |   2 +-
 .../task-034-unified-project-progression.test.mjs  |   4 +-
 ...-admin-web-qa-shop-admin-smoke-harness.test.mjs |   2 +-
 .../task-038-pos-manager-web-login.test.mjs        |   2 +-
 ...-039-staff-aware-shop-admin-completion.test.mjs |   2 +-
 .../foundation/task-040-runtime-readiness.test.mjs |   4 +-
 .../task-041-runtime-completion.test.mjs           |   2 +-
 .../task-042-review-ci-win7pos-bridge.test.mjs     |   2 +-
 .../task-043-platform-admin-runtime-fixes.test.mjs |   4 +-
 .../task-047-master-admin-access-model.test.mjs    |   2 +-
 ...r-console-secondary-sections-ux-polish.test.mjs |   2 +-
 ...sk-049-master-console-admins-ui-polish.test.mjs |   2 +-
 ...eview-done-reconciliation-task-040-049.test.mjs |   2 +-
 ...platform-provisioning-fiscal-pos-first.test.mjs |   2 +-
 33 files changed, 452 insertions(+), 133 deletions(-)

M	docs/MASTER-PLAN.md
M	docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png
M	docs/TASKS/EVIDENCE/TASK-035/browser-shop-overview-authenticated.png
M	scripts/security-checks.mjs
M	src/app/shop/layout.tsx
M	src/components/platform/AppShell.tsx
M	src/components/platform/PlatformSidebarNav.tsx
M	src/components/shop/ShopSectionPage.tsx
M	src/components/shop/ShopShell.tsx
M	src/components/shop/shopSections.ts
M	tests/foundation/admin-web-ui-polish.test.mjs
M	tests/foundation/task-014-pos-staff-foundation.test.mjs
M	tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs
M	tests/foundation/task-020-win7pos-integration-planning.test.mjs
M	tests/foundation/task-021-pos-backend-session-device.test.mjs
M	tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs
M	tests/foundation/task-027-catalog-pull-delta-sync.test.mjs
M	tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs
M	tests/foundation/task-032-permissions-hardening.test.mjs
M	tests/foundation/task-033-https-pos-sales-mega-task.test.mjs
M	tests/foundation/task-034-unified-project-progression.test.mjs
M	tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs
M	tests/foundation/task-038-pos-manager-web-login.test.mjs
M	tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs
M	tests/foundation/task-040-runtime-readiness.test.mjs
M	tests/foundation/task-041-runtime-completion.test.mjs
M	tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs
M	tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs
M	tests/foundation/task-047-master-admin-access-model.test.mjs
M	tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs
M	tests/foundation/task-049-master-console-admins-ui-polish.test.mjs
M	tests/foundation/task-050-review-done-reconciliation-task-040-049.test.mjs
M	tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs
```

### Corrected final diff snapshot after TASK-035 artifact restore - 2026-06-11

```text
 docs/MASTER-PLAN.md                                | 101 +++++++++++-
 scripts/security-checks.mjs                        | 135 ++++++++++++++--
 src/app/shop/layout.tsx                            |   1 +
 src/components/platform/AppShell.tsx               |  15 +-
 src/components/platform/PlatformSidebarNav.tsx     |   1 +
 src/components/shop/ShopSectionPage.tsx            |  20 ++-
 src/components/shop/ShopShell.tsx                  | 176 ++++++++++++++-------
 src/components/shop/shopSections.ts                |  82 +++++++---
 tests/foundation/admin-web-ui-polish.test.mjs      |   2 +-
 .../task-014-pos-staff-foundation.test.mjs         |   2 +-
 ...infrastructure-security-pos-foundation.test.mjs |   2 +-
 .../task-020-win7pos-integration-planning.test.mjs |   4 +-
 .../task-021-pos-backend-session-device.test.mjs   |   2 +-
 ...k-022-023-pos-dashboard-win7pos-client.test.mjs |   2 +-
 .../task-027-catalog-pull-delta-sync.test.mjs      |   2 +-
 ...catalog-crud-import-export-win7pos-e2e.test.mjs |   2 +-
 .../task-032-permissions-hardening.test.mjs        |   2 +-
 .../task-033-https-pos-sales-mega-task.test.mjs    |   2 +-
 .../task-034-unified-project-progression.test.mjs  |   4 +-
 ...-admin-web-qa-shop-admin-smoke-harness.test.mjs |   2 +-
 .../task-038-pos-manager-web-login.test.mjs        |   2 +-
 ...-039-staff-aware-shop-admin-completion.test.mjs |   2 +-
 .../foundation/task-040-runtime-readiness.test.mjs |   4 +-
 .../task-041-runtime-completion.test.mjs           |   2 +-
 .../task-042-review-ci-win7pos-bridge.test.mjs     |   2 +-
 .../task-043-platform-admin-runtime-fixes.test.mjs |   4 +-
 .../task-047-master-admin-access-model.test.mjs    |   2 +-
 ...r-console-secondary-sections-ux-polish.test.mjs |   2 +-
 ...sk-049-master-console-admins-ui-polish.test.mjs |   2 +-
 ...eview-done-reconciliation-task-040-049.test.mjs |   2 +-
 ...platform-provisioning-fiscal-pos-first.test.mjs |   2 +-
 31 files changed, 452 insertions(+), 133 deletions(-)

M	docs/MASTER-PLAN.md
M	scripts/security-checks.mjs
M	src/app/shop/layout.tsx
M	src/components/platform/AppShell.tsx
M	src/components/platform/PlatformSidebarNav.tsx
M	src/components/shop/ShopSectionPage.tsx
M	src/components/shop/ShopShell.tsx
M	src/components/shop/shopSections.ts
M	tests/foundation/admin-web-ui-polish.test.mjs
M	tests/foundation/task-014-pos-staff-foundation.test.mjs
M	tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs
M	tests/foundation/task-020-win7pos-integration-planning.test.mjs
M	tests/foundation/task-021-pos-backend-session-device.test.mjs
M	tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs
M	tests/foundation/task-027-catalog-pull-delta-sync.test.mjs
M	tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs
M	tests/foundation/task-032-permissions-hardening.test.mjs
M	tests/foundation/task-033-https-pos-sales-mega-task.test.mjs
M	tests/foundation/task-034-unified-project-progression.test.mjs
M	tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs
M	tests/foundation/task-038-pos-manager-web-login.test.mjs
M	tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs
M	tests/foundation/task-040-runtime-readiness.test.mjs
M	tests/foundation/task-041-runtime-completion.test.mjs
M	tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs
M	tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs
M	tests/foundation/task-047-master-admin-access-model.test.mjs
M	tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs
M	tests/foundation/task-049-master-console-admins-ui-polish.test.mjs
M	tests/foundation/task-050-review-done-reconciliation-task-040-049.test.mjs
M	tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs
```
