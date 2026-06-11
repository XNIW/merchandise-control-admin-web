# Evidence TASK-052 - Admin Console UX polish, shell parity and operational clarity

## Stato

- Task: `TASK-052 - Admin Console UX polish, shell parity and operational clarity`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data: `2026-06-11`
- Branch: `main`
- Commit finale: `NOT_RUN`
- Push finale: `NOT_RUN`
- Stage finale: `NOT_RUN`
- Verdict corrente: `REVIEW`

## Recovery pre-flight

Comandi iniziali eseguiti prima del ripristino:

| Comando | Esito | Sintesi |
|---|---|---|
| `git status --short --branch --untracked-files=all` | `PASS_WITH_NOTES` | Worktree su `main...origin/main`; 17 file modificati, nessun file staged riportato. |
| `git diff --stat` | `PASS_WITH_NOTES` | 17 file modificati, circa `1006 insertions / 532 deletions`. |
| `git diff --name-status` | `PASS_WITH_NOTES` | File modificati in Shop pages/shell/sections, scanner, foundation allowlist e tracking. `AdminDataTable` resta fuori diff. |
| `git diff --check` | `FAIL_INITIAL` | Conflict marker in `src/app/shop/_components/ImportExportActionPanel.tsx`. |
| `npm run typecheck` | `FAIL_INITIAL` | `tsc` falliva su conflict marker e JSX rotto in `ImportExportActionPanel.tsx`. |
| `npm run build` | `FAIL_INITIAL` | Turbopack falliva su conflict marker in `ImportExportActionPanel.tsx`. |

## Damage audit

| File | Classificazione | Decisione |
|---|---|---|
| `src/app/shop/_components/CatalogActionPanel.tsx` | `REWORK_REQUIRED` | Refactor ampio dei form operativi, fuori scope recovery. Ripristinato da `HEAD`. |
| `src/app/shop/_components/ImportExportActionPanel.tsx` | `RESTORE_REQUIRED` | Conflict marker e build rotta. Ripristinato da `HEAD`. |
| `src/app/shop/_components/MemberActionPanel.tsx` | `REWORK_REQUIRED` | Refactor ampio dei form operativi, fuori scope recovery. Ripristinato da `HEAD`. |
| `src/app/shop/_components/StaffActionPanel.tsx` | `REWORK_REQUIRED` | Refactor ampio dei form operativi, fuori scope recovery. Ripristinato da `HEAD`. |
| `src/app/shop/products/page.tsx` e pagine azionabili Shop | `OUT_OF_SCOPE` | `actionsEnabled` non necessario al redo sicuro. Ripristinate da `HEAD`. |
| `src/components/shop/ShopShell.tsx` | `OK_KEEP_WITH_FIX` | Logout/sticky/single-shop in scope; nav scroll ritoccata. |
| `src/components/shop/ShopSectionPage.tsx` | `OK_KEEP_REDUCED` | Mantenuto solo Diagnostics collassabile; rimosso status action extra. |
| `src/components/shop/shopSections.ts` | `OK_KEEP_WITH_FIX` | Navigazione raggruppata in scope; corretto `Staff` nel gruppo `POS / Staff`. |
| `src/app/shop/layout.tsx` | `OK_KEEP` | Passaggio `principalKind` a `ShopShell` in scope. |
| `src/components/admin/AdminDataTable.tsx` | `NO_DIFF_KEEP` | Nessuna modifica: resta `min-w-[64rem]`, preservando la Master Console fuori scope. |

## File ripristinati da HEAD

- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/MemberActionPanel.tsx`
- `src/app/shop/_components/StaffActionPanel.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/categories/page.tsx`
- `src/app/shop/suppliers/page.tsx`
- `src/app/shop/import-export/page.tsx`
- `src/app/shop/members/page.tsx`
- `src/app/shop/staff/page.tsx`
- `src/app/shop/devices/page.tsx`
- `src/app/shop/settings/page.tsx`
- `src/components/shop/ShopSectionPage.tsx`

## Modifiche safe redo

- Shop shell:
  - `principalKind` passato da `src/app/shop/layout.tsx`;
  - logout verso `/auth/logout` per account personale;
  - logout verso `/shop/staff-logout` per staff manager;
  - sidebar sticky desktop con `top-0`, `h-screen` e scroll;
  - select shop mostrato solo quando ci sono piu shop;
  - chip globale `Read-only` rimosso.
- Navigazione:
  - gruppi `Workspace`, `Catalog`, `Access`, `POS / Staff`, `Data`, `Settings`;
  - `Staff`, `POS Live` e `Devices` restano nello stesso modulo Shop Admin.
- Shop section page:
  - guardrail mantenuti;
  - `Safety rules` spostato in `Diagnostics` collassabile.
- Admin table:
  - nessuna modifica applicata; il file resta a `min-w-[64rem]` e fuori scope TASK-052.
- Test:
  - aggiunto foundation test mirato `task-052-admin-console-ux-polish-shell-parity.test.mjs`.

## Cleanup dati locali e credential

- Nessuna nuova credenziale, password, PIN o token e stata scritta in
  documentazione/evidence.
- Nessuna migration o operazione cloud/production eseguita.
- Cleanup DB locale: `PASS`.

## Check

| Comando | Esito | Note |
|---|---|---|
| `git diff --check` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run typecheck` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run lint` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run build` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run security:scan` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run test:foundation` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run verify` | `PENDING` | Da rieseguire dopo patch finali. |
| `npm run test:ui-smoke:ci` | `PENDING` | Da rieseguire se compatibile. |
| `git status --short --branch --untracked-files=all` | `PENDING` | Da rieseguire finale. |
| `git diff --cached --name-status` | `PENDING` | Da rieseguire finale. |

## Conferme

- Commit: `NOT_RUN`.
- Push: `NOT_RUN`.
- Stage finale: `NOT_RUN`.
- Supabase migration: `NOT_RUN`.
- Cloud/production apply: `NOT_RUN`.
- Credential/PIN/token salvati in repo/evidence: `NO`.

## Final recovery evidence - 2026-06-11

| Check | Result | Evidence |
| --- | --- | --- |
| Initial `git diff --check` | FAIL, recovered | Previous attempt left conflict markers in `src/app/shop/_components/ImportExportActionPanel.tsx`; file restored from `HEAD`. |
| Initial `npm run typecheck` | FAIL, recovered | Failed on the same conflict markers/JSX parse errors; resolved by scoped restore. |
| Initial `npm run build` | FAIL, recovered | Failed on the same conflict markers; resolved by scoped restore. |
| Local cleanup | PASS | Removed the preview-only local membership row for profile `9abd6961-fa12-4cd2-9d95-075f7f5eb3fe` and shop `bd12f063-077e-4a0b-81aa-6fdbfb146279`; local `psql` reported `DELETE 1`. |
| Conflict marker scan | PASS | The conflict-marker scan returned no matches before final verification. |
| Preview artifact scan | PASS | No matches for old preview-sensitive terms and screenshot artifact names in `docs`, `tests`, `scripts`, or `src`. |
| `git diff --check` | PASS | No whitespace or conflict-marker errors after recovery. |
| `npm run typecheck` | PASS | `next typegen` and `tsc --noEmit` completed successfully. |
| `npm run lint` | PASS | ESLint completed successfully. |
| `npm run build` | PASS_WITH_WARNINGS | Build completed successfully; warnings only for deprecated Next `middleware` convention and Node `[DEP0205] module.register()`. |
| `npm run security:scan` | PASS | Static security scan passed. |
| `npm run test:foundation` | PASS | 231 tests passed, including TASK-052 shell/navigation/diagnostics coverage. |
| `npm run verify` | PASS_WITH_WARNINGS | `lint`, `typecheck`, `security:scan`, and `build` passed; same deprecation warnings as build. |
| `npm run test:ui-smoke:ci` | PASS_WITH_WARNINGS | 47 Chromium desktop smoke tests passed; only Node/NO_COLOR warnings. |
| `npm run test:shop:local` | BLOCKED_NOT_CODE | Local target guardrails passed, but the wrapper failed before tests because another `next dev` is already running on `localhost:3000` for this repo (PID 35447). The server was not killed. |

## Final handoff verdict

`DONE`: recovered from the broken TASK-052 attempt, restored unsafe/out-of-scope action panel edits, kept only scoped shell/navigation/diagnostics polish, and preserved secret-safe boundaries. The only remaining non-pass item is the local authenticated shop wrapper blocked by an already-running dev server, not by an application assertion.

## Final review 2026-06-11 - authenticated browser QA and regression

### Code audit delta

- `src/components/shop/ShopShell.tsx`: added `prefetch={false}` to protected Admin Console navigation links and to the logout link. Rationale: authenticated local QA showed Next `Link` prefetch could hit protected routes and the state-changing logout route in the background, clearing SSR/staff cookies before user navigation.
- `src/components/admin/AdminDataTable.tsx`: confirmed `NO_DIFF`; Master Console table behavior remains unchanged.
- Shop action panels: `CatalogActionPanel`, `ImportExportActionPanel`, `MemberActionPanel`, and `StaffActionPanel` remain restored, non-truncated, and outside new edits.

### Automated checks rerun after the fix

| Check | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | `PASS` | no output |
| `npm run typecheck` | `PASS` | `next typegen` succeeded, `tsc --noEmit` succeeded |
| `npm run lint` | `PASS` | no ESLint errors |
| `npm run build` | `PASS_WITH_WARNINGS` | build succeeded; warnings: Next `middleware` convention deprecated, Node `[DEP0205] module.register()` deprecated |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 231`, `pass 231`, `fail 0` |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint/typecheck/security/build succeeded with same build warnings |
| `npm run test:ui-smoke:ci` | `PASS_WITH_WARNINGS` | `47 passed (6.4s)` with Node/NO_COLOR warnings |

### Authenticated E2E evidence

Command used:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3044 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run build && npm run start -- --hostname 127.0.0.1 --port 3044" PLAYWRIGHT_REUSE_SERVER=0 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts --project=chromium-desktop
```

Observed sequence:

- Before the `ShopShell` prefetch fix: authenticated routes regressed to `No active session` because background prefetches touched protected routes.
- After disabling protected navigation prefetch: first protected route stayed authenticated, then session was still cleared by the `Logout` `Link` prefetch.
- After disabling logout prefetch: authentication remained stable across routes. Result: `2 passed`, `1 failed`.
- Remaining failure is content/data-access, not session loss: the shop-owner `/shop/staff` page renders `Read blocked` and does not expose the expected `TASK035_STAFF_*` row to the legacy smoke assertion. The staff-manager web-session path passes.

Residual finding for follow-up:

- `TASK-035` authenticated smoke still has one failing shop-owner staff safe-view assertion: `getByText('TASK035_STAFF_*')` is not visible because `/shop/staff` reports `Shop Staff rows could not be loaded through the safe view.` This is recorded as a separate staff safe-read/runtime issue, not hidden as a PASS.

### In-app browser QA, authenticated local account

Environment:

- Browser target: `http://127.0.0.1:3049`, built with `supabase status --output env` local Supabase variables.
- Temporary data prefix: `TASK052_REVIEW_*`.
- `.env.local` points to Supabase cloud, so browser QA intentionally avoided `localhost:3000` and used `127.0.0.1:3049` local-only.

Authenticated route checks:

| Route | Result | Notes |
| --- | --- | --- |
| `/shop` | `PASS` | `Shop Overview` visible, shop code visible, no access-required fallback |
| `/shop/products` | `PASS` | Product row `TASK052_REVIEW_Product_*` visible |
| `/shop/categories` | `PASS` | Category row `TASK052_REVIEW_Category_*` visible |
| `/shop/suppliers` | `PASS` | Supplier row `TASK052_REVIEW_Supplier_*` visible |
| `/shop/import-export` | `PASS` | section visible, authenticated |
| `/shop/members` | `PASS` | section visible, authenticated |
| `/shop/roles` | `PASS` | section visible, authenticated |
| `/shop/staff` | `PASS_WITH_NOTE` | section visible/authenticated; safe view reports `Read blocked` |
| `/shop/pos` | `PASS` | section visible, authenticated |
| `/shop/devices` | `PASS` | section visible, authenticated |
| `/shop/settings` | `PASS` | section visible, authenticated |
| `/shop/history` | `PASS` | section visible, authenticated |
| `/shop/sync` | `PASS` | section visible, authenticated |
| `/shop/audit` | `PASS` | section visible, authenticated |

Screenshots saved:

- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-overview.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-products.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-products-mobile.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-import-export.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-staff.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-devices.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-review-shop-audit.png`

### Cleanup

- Removed `/tmp/task052-review-fixture.json`.
- Deleted local-only `TASK035_*` and `TASK052_REVIEW_*` rows using `127.0.0.1:54322` with temporary `session_replication_role = replica` because `audit_logs` is append-only.
- Final residue counts: `shops=0`, `profiles=0`, `auth_users=0`, `audit_logs=0`, `products=0`, `categories=0`, `suppliers=0`.

### Final review verdict

- TASK-052 UI polish and shell parity are ready for human review / DONE confirmation.
- Do not mark `DONE` automatically: user confirmation is still required by project protocol.
- Carry forward one explicit residual risk: shop-owner staff safe-view read is blocked in the legacy authenticated smoke; staff-manager web-session smoke passes.

## Final Gate Review - 2026-06-11

Verdict: `BLOCKED_SCHEMA_OR_RLS_FIX_REQUIRED`.

Scope reviewed:
- Local Supabase only, non-production.
- In-app browser authenticated QA against local Next server on `127.0.0.1:3052`.
- Master Console provisioning flow, Admin Console personal account flow, Shop code / staff `1001` flow, and manager `1001` recovery flow.
- No staging, production, git stage, commit, push, or migration was executed.

Code issue found and fixed during final gate:
- P0 fixed: Master Console session was lost after login because protected Platform links/logout could be prefetched by Next.js. This matched the previous ShopShell issue.
- Fix applied in `src/components/platform/AppShell.tsx`: logout `Link` now uses `prefetch={false}`.
- Fix applied in `src/components/platform/PlatformSidebarNav.tsx`: protected nav `Link` now uses `prefetch={false}`.
- Foundation coverage added in `tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs` for Shop and Platform protected shell prefetch guardrails.

Browser QA evidence:
- Master Console login and provisioning page after prefetch fix: PASS.
- Master Console create shop via UI with existing owner: PASS.
- Admin account login to `/shop` and Admin Console sections: PASS, except `/shop/staff` read model remains blocked.
- Shop code login with staff code `1001` and temporary PIN: PASS.
- Staff manager `1001` route access and logout boundary: PASS.
- Recovery for staff manager `1001`: PASS.
- Old temporary PIN after recovery: rejected as expected.
- New temporary PIN after recovery: accepted as expected.
- Cross-access checks: staff manager denied from `/platform`; owner denied from `/platform`; fake `shop_id` did not grant cross-shop access.
- Browser console errors captured during final browser QA: none.

Screenshots captured:
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-master-provisioning-before.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-create-shop-owner-result.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-admin-account-overview.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-admin-account-staff.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-shop-code-login.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-staff-manager-overview.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-staff-manager-staff.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-recovery-1001-result.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-old-pin-rejected.png`
- `docs/TASKS/EVIDENCE/TASK-052/browser-final-new-pin-accepted.png`

Remaining blocker:
- `/shop/staff` for authenticated personal Admin account still shows `Read blocked`.
- Local diagnostic with an authenticated Supabase client reproduced `42501 permission denied for table staff_accounts` when selecting from `public.staff_accounts_safe`.
- `public.staff_accounts_safe` is configured with `security_invoker=true` and selects `web_access_revoked_at` from `public.staff_accounts`.
- The authenticated role has column SELECT grants on safe staff columns, but not on `staff_accounts.web_access_revoked_at`.
- Direct authenticated read from `public.staff_accounts` using already-granted safe columns succeeded, which isolates the issue to the safe view schema/grant path rather than TASK-052 shell/UI code.
- Required follow-up: apply a reviewed schema/grant/RLS migration, likely granting or removing the missing safe-view column. This review did not apply that fix because the final gate explicitly disallowed automatic migrations/grants.

Automated checks run on final code state:
- `git diff --check`: PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS with existing warnings for deprecated Next `middleware` convention and Node `[DEP0205] module.register()`.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS, 232 tests.
- `npm run verify`: PASS with the same existing build warnings.
- `npm run test:ui-smoke:ci`: PASS, 47 tests.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3052 PLAYWRIGHT_REUSE_SERVER=1 node scripts/testing/run-playwright-target.mjs local tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts --project=chromium-desktop`: FAIL expected/current blocker, 2 passed and 1 failed. The failing assertion expects the synthetic staff row text on owner `/shop/staff`; the page shows the safe read model blocked instead.

Cleanup:
- Local final-gate synthetic fixture data was removed from local Supabase after browser QA.
- Cleanup committed no schema changes and deleted 17 public rows plus 6 auth rows from the local-only test fixture set.
- Temporary file `/tmp/task052-final-fixture.json` and matching temp fixture files were deleted.

Acceptance criteria status:
- AC1 Shell terminology/parity: PASS.
- AC2 Shop shell no global read-only chip, sticky desktop navigation, safe logout: PASS.
- AC3 Admin Console routes visible through browser for personal account: PASS except `/shop/staff` read model is blocked.
- AC4 Shop code / staff `1001` access and recovery: PASS.
- AC5 No secret/PIN rendering after one-time provisioning/recovery: PASS by browser checks.
- AC6 No production/cloud/staging mutation: PASS.
- Final gate: NOT READY FOR DONE CONFIRMATION until `BLOCKED_SCHEMA_OR_RLS_FIX_REQUIRED` is resolved and `/shop/staff` owner read passes.

## Final professional review gate - 2026-06-11

Verdict: `DONE`.

Scope reviewed together with TASK-053 because TASK-053 fixes the real blocker found in the final TASK-052 gate: `/shop/staff` returning `Read blocked` through `staff_accounts_safe`.

### Findings and fixes

- `P0 staff safe read blocker`: fixed by TASK-053 local migration. `/shop/staff` now loads staff `1001` for owner and staff manager sessions without `Read blocked`.
- `P1 logout client navigation noise`: fixed during final review by changing Master/Admin Console logout controls from client-routed internal navigation to native GET forms targeting `/auth/logout` or `/shop/staff-logout`. Browser retest showed `newErrorCount=0` after native logout; two earlier RSC logout errors remained as historical baseline logs in the browser collector.

### Browser QA

- Master Console provisioning: PASS.
- Owner Admin Console route sweep: PASS for overview, products, categories, suppliers, import/export, members, roles, staff, devices, settings, audit, POS, sync, history.
- Owner `/shop/staff`: PASS; staff `1001` visible, no `Read blocked`, no PIN/hash visible, logout visible, sticky sidebar present, Diagnostics collapsed.
- Staff manager Shop code login: PASS with recovered PIN; `/shop/staff` visible, fake `shop_id` did not authorize another shop, `/platform` denied.
- Recovery manager 1001: PASS; old PIN rejected, new PIN accepted, refresh maintained staff session, logout invalidated staff session.

### Automated checks

- `git diff --check`: PASS.
- `node --test tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs`: PASS, 4/4.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS with existing warnings: Next `middleware` deprecation and Node `[DEP0205] module.register()`.
- `npm run security:scan`: PASS.
- `npm run test:foundation`: PASS, 235/235.
- `npm run verify`: PASS with the same existing warnings.
- `npm run test:ui-smoke:ci`: PASS, 47/47.
- `npm run test:shop:local`: BLOCKED by an already-running local Next dev server on `localhost:3000`; no app test failure was reached.
- Local-only equivalent on dedicated target `127.0.0.1:3053`: PASS, TASK-035 authenticated smoke 3/3.

### Cleanup

- Local synthetic cleanup removed 2 auth users, 2 profiles and 1 shop from the final browser fixture.
- Residual counts after cleanup: auth users 0, profiles 0, shops 0.
- Temporary `/tmp/task053-*` credential/PIN files removed.

TASK-052 is ready for user confirmation, but Codex did not mark it `DONE`.
