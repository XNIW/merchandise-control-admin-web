# Evidence TASK-040 - Runtime Readiness

## Stato

- Task: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`
- Stato task: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Milestone interna: `PARTIAL_PASS_WITH_BLOCKERS`
- Verdict corrente: `PARTIAL_PASS_WITH_BLOCKERS`
- Data: `2026-06-04`
- Branch Admin Web: `main`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Scope

TASK-040 assorbe formalmente:

- ex TASK-046: Supabase local/apply validation -> `FOLDED_INTO_TASK-040`;
- ex TASK-043: staging stabile non-production -> `FOLDED_INTO_TASK-040`;
- ex TASK-044: Win7POS live E2E -> `FOLDED_INTO_TASK-040`;
- ex TASK-045: Sales Sync reale POS -> Admin Web -> `FOLDED_INTO_TASK-040`.

Gap storici ricontrollati: `TASK-029`, `TASK-031`, `TASK-032`, `TASK-033`, `TASK-022_023`.

## Non-goals

- No production deploy.
- No Vercel Production usata come staging.
- No Supabase production apply.
- No service role o secret in browser/client/log/evidence.
- No Win7POS runtime changes.
- No Sales Sync runtime senza prerequisiti reali.
- No dashboard vendite fake.
- No dati reali.
- No commit eseguito.
- No push eseguito.
- No stage finale.

## Baseline git iniziale

### Admin Web

`git status --short --branch`

```text
## main...origin/main
 M docs/MASTER-PLAN.md
 M scripts/security-checks.mjs
 M src/app/shop/_components/ImportExportActionPanel.tsx
 M src/app/shop/_components/StaffActionPanel.tsx
 M src/app/shop/actions.ts
 M src/app/shop/categories/page.tsx
 M src/app/shop/devices/page.tsx
 M src/app/shop/import-export/page.tsx
 M src/app/shop/members/page.tsx
 M src/app/shop/products/page.tsx
 M src/app/shop/settings/page.tsx
 M src/app/shop/staff/page.tsx
 M src/app/shop/suppliers/page.tsx
 M src/lib/supabase/database.types.ts
 M src/server/shop-admin/access-principal.ts
 M src/server/shop-admin/action-context.ts
 M src/server/shop-admin/catalog-mutations.ts
 M src/server/shop-admin/data-access.ts
 M src/server/shop-admin/device-mutations.ts
 M src/server/shop-admin/shop-section-data.ts
 M src/server/shop-admin/staff-mutations.ts
 M src/server/shop-admin/staff-read-model.ts
 M src/server/shop-admin/staff-web-auth.ts
 M src/server/shop-admin/staff-web-permissions.ts
 M tests/foundation/admin-web-ui-polish.test.mjs
 M tests/foundation/task-014-pos-staff-foundation.test.mjs
 M tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs
 M tests/foundation/task-020-win7pos-integration-planning.test.mjs
 M tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs
 M tests/foundation/task-027-catalog-pull-delta-sync.test.mjs
 M tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs
 M tests/foundation/task-032-permissions-hardening.test.mjs
 M tests/foundation/task-033-https-pos-sales-mega-task.test.mjs
 M tests/foundation/task-034-unified-project-progression.test.mjs
 M tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs
 M tests/foundation/task-038-pos-manager-web-login.test.mjs
?? docs/TASKS/EVIDENCE/TASK-039/
?? docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md
?? src/app/account/
?? src/server/shop-admin/settings-mutations.ts
?? src/server/shop-admin/staff-aware-mutations.ts
?? supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql
?? tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs
```

`git diff --check`: `PASS`, exit 0.

`git diff --cached --name-status`: output vuoto.

### Win7POS

`git status --short --branch`

```text
## main...origin/main
 M .gitignore
?? docs/dev/
?? scripts/win7pos/
```

`git diff --check`: `PASS`, exit 0.

## TASK-039 closure evidence

Conferma esplicita utente ricevuta nell'allegato TASK-040: se i check freschi confermano lo stato gia documentato, TASK-039 puo essere marcato `DONE` per il suo code scope.

| Comando | Esito sintetico |
| --- | --- |
| `git diff --check` | `PASS` |
| `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` | `PASS`, `tests 4`, `pass 4`, `fail 0` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 179`, `pass 179`, `fail 0` |
| `npm run typecheck` | `PASS`, `Types generated successfully` |
| `npm run lint` | `PASS`, exit 0 |
| `npm run build` | `PASS_WITH_TOOLCHAIN_WARNING`, Next `16.2.6`, warning `[DEP0205]` |
| `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNING`, lint/typecheck/security/build exit 0, warning `[DEP0205]` |

Decisione: TASK-039 `DONE` / `DONE_RECONCILED` per code scope. I blocker runtime passano a TASK-040.

## Review/fix finale allegato 2026-06-04

### Problemi trovati

- `settings-mutations.ts`: il path personal account non controllava esplicitamente `adminConfig.status !== "configured"` prima di costruire l'admin client.
- `settings-mutations.ts`: l'update shop usava admin client, ma l'audit settings era scritto tramite `context.supabase`; per account personale poteva fallire sotto RLS lasciando un update senza audit id.

### Fix applicati

- `updateShopSettings` ora ritorna `not_configured` quando la admin env non e configurata.
- `writeSettingsAudit` riceve `adminClient` e scrive `audit_logs` con lo stesso boundary server-side dell'update.
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` copre fail-closed admin env e audit settings via admin client.
- `scripts/security-checks.mjs` include guardrail TASK-039 su `settings-mutations.ts`.

### Check freschi

| Comando | Esito sintetico |
| --- | --- |
| `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` | `PASS`, `tests 4`, `pass 4`, `fail 0` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 179`, `pass 179`, `fail 0` |
| `npm run typecheck` | `PASS`, `Types generated successfully` |
| `npm run lint` | `PASS`, exit 0 |
| `npm run build` | `PASS_WITH_TOOLCHAIN_WARNING`, Next `16.2.6`, warning `[DEP0205]` |
| `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNING`, lint/typecheck/security/build exit 0, warning `[DEP0205]` |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_SKIPS`, `1 passed`, `2 skipped` |
| Browser in-app locale | `PASS_NON_AUTH_GUARD`, `/account/profile`, `/shop/staff-login`, `/shop/settings`, console error `0` |
| Codex Security diff scan | `PASS_NO_OPEN_FINDINGS_AFTER_FIXES`, report `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/report.md` e `.html` |

Screenshot browser evidence: `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/artifacts/browser/staff-login.png`.

### Mobile status

- iOS: `NOT_PRESENT_IN_CURRENT_WORKSPACE`; discovery read-only non ha trovato `.xcodeproj` o `.xcworkspace`.
- Android: `NOT_PRESENT_IN_CURRENT_WORKSPACE`; discovery read-only non ha trovato `gradlew`, `settings.gradle*` o `build.gradle*`.

### UI/UX/accessibilita/performance

- UI non autenticata/gated verificata con Browser in-app.
- Nessun `Application error` o console error osservato nelle route controllate.
- Accessibilita/performance runtime complete con sessione reale: `NOT_RUN_BLOCKED_NO_AUTH_SESSION`.

### Automazioni/harness

- Nessuna automazione esterna creata.
- Harness migliorati: test TASK-039 e security scanner includono i nuovi guardrail settings.

## CI fix GitHub Actions 2026-06-04

### Problema

GitHub Actions falliva nello step Verify/Security scan con `Win7POS repo is missing at /Users/minxiang/Projects/Win7POS`. Il path e un sibling locale del Mac e non esiste sul runner GitHub.

Dopo il primo fix, GitHub Actions falliva ancora nello step Verify/Foundation tests: `tests 180`, `pass 176`, `fail 4`. I fail erano i test Win7POS diretti di TASK-027, TASK-028, TASK-029 e TASK-032, ancora legati al path assoluto locale.

### Fix

- `scripts/security-checks.mjs` usa `WIN7POS_REPO_PATH` per override del repo Win7POS.
- Se Win7POS manca e `REQUIRE_WIN7POS_REPO` non e `1`, lo scanner stampa `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE` e continua.
- Se `REQUIRE_WIN7POS_REPO=1`, lo scanner fallisce come guardrail obbligatorio.
- I foundation test TASK-022_023 non falliscono piu in CI solo per assenza del repo sibling, ma continuano a controllare il repo quando disponibile o richiesto.
- I foundation test TASK-027, TASK-028, TASK-029 e TASK-032 usano `WIN7POS_REPO_PATH`; se Win7POS manca e `REQUIRE_WIN7POS_REPO` non e `1`, marcano il controllo esterno come skipped con `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE`.
- Se `REQUIRE_WIN7POS_REPO=1`, gli stessi test falliscono ancora con `Win7POS repo is missing`, mantenendo il guardrail per runner preparati o check locali obbligatori.

### Evidence

| Comando | Esito |
| --- | --- |
| `node --test tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs` | `PASS`, `tests 5`, `pass 5` |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan` | `PASS_WITH_SKIP`, output include `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE` |
| `REQUIRE_WIN7POS_REPO=1 WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan` | `FAIL_EXPECTED`, output include `Win7POS repo is missing` |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture node --test tests/foundation/task-027-catalog-pull-delta-sync.test.mjs tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs tests/foundation/task-029-production-path-staging-win7pos-bootstrap.test.mjs tests/foundation/task-032-local-pos-e2e-harness.test.mjs` | `PASS_WITH_SKIPS`, `tests 21`, `pass 17`, `skipped 4`, `fail 0` |
| `REQUIRE_WIN7POS_REPO=1 WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture node --test tests/foundation/task-027-catalog-pull-delta-sync.test.mjs tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs tests/foundation/task-029-production-path-staging-win7pos-bootstrap.test.mjs tests/foundation/task-032-local-pos-e2e-harness.test.mjs` | `FAIL_EXPECTED`, `fail 4`, output include `Win7POS repo is missing` |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run test:foundation` | `PASS_WITH_SKIPS`, `tests 180`, `pass 176`, `skipped 4`, `fail 0` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 180`, `pass 180`, `fail 0` |
| `npm run verify` | `PASS_WITH_TOOLCHAIN_WARNING`, lint/typecheck/security/build exit 0, warning `[DEP0205]` |
| `git diff --check` | `PASS` |

## Supabase status

### Environment redatto

Output redatto da lettura `.env.local`:

```json
{
  "fileExists": true,
  "classification": "supabase_cloud",
  "vars": {
    "NEXT_PUBLIC_SUPABASE_URL": "present_redacted",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "present_redacted",
    "SUPABASE_PROJECT_REF": "missing_or_empty",
    "SUPABASE_SERVICE_ROLE_KEY_status": "missing_or_empty"
  }
}
```

`supabase/config.toml`: `project_id = "merchandise-control-admin-web"`.

Docker discovery:

```text
supabase_db_MerchandiseControlSupabase public.ecr.aws/supabase/postgres:17.6.1.104 Up 25 hours (healthy)
```

Container atteso dal progetto/script: `supabase_db_merchandise-control-admin-web`.

### CLI

- `supabase --help`: PASS, CLI disponibile.
- Prima run parallela `supabase --version`: `FAIL_CLI_TELEMETRY_RACE`, errore `FileSystem.rename` su `telemetry.json.tmp`.
- Rerun con telemetry disabilitata: `SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase --version` -> `2.104.0`.

### dev db check

`npm run dev:db:status`: exit `2`.

Output sintetico redatto:

```text
[dev-db] PASS supabase CLI 2.104.0
[dev-db] PASS supabase project_id=merchandise-control-admin-web
[dev-db] .env.local:NEXT_PUBLIC_SUPABASE_URL=present
[dev-db] .env.local:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=present
[dev-db] .env.local:SUPABASE_PROJECT_REF=missing
[dev-db] .env.local SUPABASE_SERVICE_ROLE_KEY -> missing
[dev-db] .env.local:NEXT_PUBLIC_SUPABASE_URL_TARGET=supabase_cloud
[dev-db] FAIL .env.local points at supabase_cloud; local/dev checks fail closed
[dev-db] FAIL local Supabase DB container mismatch; expected supabase_db_merchandise-control-admin-web, found supabase_db_MerchandiseControlSupabase
[dev-db] FAIL supabase status did not complete
```

### Migration status

`supabase status -o json` redatto:

```text
failed to inspect container health: Error response from daemon: No such container: supabase_db_merchandise-control-admin-web
```

`supabase migration list --local` redatto:

```text
Connecting to local database...
Local          | Remote         | Time (UTC)
...
20260604035308 | 20260604035308 | 2026-06-04 03:53:08
20260604120000 |                | 2026-06-04 12:00:00
```

Status: `MIGRATION_PENDING_NOT_APPLIED`.

`supabase db lint --local --schema public,app_private --fail-on error`:

```text
Connecting to local database...
Linting schema: public
Linting schema: app_private
No schema errors found
```

Migration Supabase: `APPLY_NOT_RUN_BLOCKED_ENV_MISMATCH`.

Types status: local types updated in `src/lib/supabase/database.types.ts`; typegen post-apply `NOT_RUN_BLOCKED_ENV_MISMATCH`.

## Staging status

Verifiche Vercel read-only:

```text
command -v vercel -> /opt/homebrew/bin/vercel
vercel --version -> Vercel CLI 54.7.1
vercel whoami -> xniw97-9857
```

`.vercel/project.json`:

```json
{
  "projectName": "merchandise-control-admin-web",
  "settings": {
    "framework": "nextjs",
    "nodeVersion": "24.x"
  }
}
```

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": false
  }
}
```

`vercel ls --scope xniw97-9857s-projects`:

```text
No deployments found under xniw97-9857s-projects.
```

`vercel alias ls --scope xniw97-9857s-projects`: nessun alias.

Staging: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`.

URL stabile: `NOT_AVAILABLE`.

## Win7POS E2E status

Discovery:

```text
command -v pwsh -> /opt/homebrew/bin/pwsh
dotnet --version -> 10.0.300
uname -a -> Darwin ... RELEASE_ARM64_T6031 arm64
command -v wine -> NOT_FOUND
command -v mono -> NOT_FOUND
command -v qemu-system-x86_64 -> NOT_FOUND
```

Win7POS scanner/build:

| Comando | Esito |
| --- | --- |
| `pwsh -NoProfile -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, `Win7POS.Wpf -> .../net48/Win7POS.Wpf.exe`, `Avvisi: 0`, `Errori: 0` |

Win7POS E2E: `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE`.

## Sales Sync status

Admin Web discovery:

```text
src/app/api/pos/sales -> NOT_FOUND
pos_sales / pos_sale_lines migrations -> NOT_FOUND
```

Win7POS discovery:

- `sales` and `sale_lines`: `FOUND`.
- `Sale`, `SaleLine`, `SaleKind`: `FOUND`.
- `SaleRepository`: `FOUND`.
- refund/void support: `FOUND`.
- offline sales sync queue/idempotency runtime: `NOT_FOUND`.

Sales Sync: `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` / `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`.

## Riconciliazione gap storici

| Gap | Stato | Evidence |
| --- | --- | --- |
| `TASK-029` | `STILL_BLOCKED` | Staging HTTPS non-production e smoke/E2E staging non disponibili. |
| `TASK-031` | `STILL_BLOCKED` | Vercel Preview continua classificato `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`. |
| `TASK-032` | `STILL_BLOCKED` | Fase HTTPS stabile e riconciliazione live non superate. |
| `TASK-033` | `STILL_BLOCKED` | Win7POS live E2E ancora bloccato dal runtime. |
| `TASK-022_023` | `STILL_PARKED` | `PARKED_E2E_PENDING`; scanner/build non sostituiscono live E2E. |
| ex `TASK-043` | `FOLDED_INTO_TASK-040` | Staging stabile. |
| ex `TASK-044` | `FOLDED_INTO_TASK-040` | Win7POS live E2E. |
| ex `TASK-045` | `FOLDED_INTO_TASK-040` | Sales Sync reale. |
| ex `TASK-046` | `FOLDED_INTO_TASK-040` | Supabase apply validation. |

## File modificati da TASK-040

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md`
- `docs/TASKS/EVIDENCE/TASK-039/README.md`
- `docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md`
- `docs/TASKS/EVIDENCE/TASK-040/README.md`
- `scripts/security-checks.mjs`
- `src/server/shop-admin/settings-mutations.ts`
- `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs`
- `tests/foundation/task-040-runtime-readiness.test.mjs`
- test foundation governance aggiornati per riconoscere TASK-040 come task attivo.
- Scanner guardrail aggiunto: `checkTask040RuntimeReadiness`.

## Blocker residui

- `BLOCKED_LOCAL_SUPABASE_ENV`
- `BLOCKED_SUPABASE_CONTAINER_MISMATCH`
- `APPLY_NOT_RUN_BLOCKED_ENV_MISMATCH`
- `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`
- `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE`
- `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA`
- `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`

## Verdict

- Verdict finale TASK-040: `PARTIAL_PASS_WITH_BLOCKERS`.
- Handoff: `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- No commit eseguito.
- No push eseguito.
- No stage finale.
