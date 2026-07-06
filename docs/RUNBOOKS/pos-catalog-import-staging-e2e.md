# POS catalog import staging E2E runbook

Status date: 2026-07-06 UTC / 2026-07-05 host locale

Current status: `READY_FOR_STAGING_E2E_AFTER_OWNER_SECRET`

## Verified in this environment

| Area | Status | Evidence |
| --- | --- | --- |
| Workers staging deploy | `PASS` | GitHub Actions workflow `cloudflare.yml`, run `28763455797`, conclusion `success`; deploy job `85283293516`. |
| Workers live version | `PASS` | Current staging Version ID `2daadf35-036c-491e-9ecc-944fbc4def68`. |
| Workers URL | `PASS` | `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev` |
| GET import-sync | `PASS` | `405 method_not_allowed`, `cache-control: no-store`, request id `posreq_fe7908b0-9bb7-4cd6-aa15-2a833d61c41a`. |
| POST empty body | `PASS` | `400 validation_failed`, `cache-control: no-store`, request id `posreq_60fcdfac-a76a-4815-bf2f-c811088ecfbf`. |
| POST invalid auth | `PASS` | `401 auth_denied`, `cache-control: no-store`, request id `posreq_63a1019e-697f-46d8-b4f5-8d2353323c8d`. |
| Supabase CLI | `PASS` | `supabase 2.109.0`; `node scripts/check-supabase-tooling.mjs` passes on Windows. |
| Staging Supabase config | `CONFIGURED_MASKED` | Project ref `jpgoimipbothfgkokyvm`; host `jpgoimipbothfgkokyvm.supabase.co`; repo/env variables and Cloudflare staging secrets present by name. |
| Admin local verify | `PASS` | `npm run security:scan`, `npm run test:foundation`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify`. |

## Remaining owner-gated inputs

| Gate | Current status | Next action |
| --- | --- | --- |
| Supabase CLI login | `SUPABASE_OWNER_PERMISSION_REQUIRED` | Complete `supabase login --no-browser --output-format text`; then run linked migration commands below. |
| TASK-094 migration on staging | `PENDING_SUPABASE_OWNER_AUTH` | Apply `supabase/migrations/20260705120000_task_094_pos_catalog_import_sync.sql` with `supabase db push --linked`. |
| Positive staging E2E dataset/session | `PENDING_SUPABASE_OWNER_AUTH` | Seed/create synthetic staging shop/staff/device and save a local session JSON in `C:\Temp`. |
| Windows 7 physical runtime | `WIN7_PHYSICAL_MACHINE_REQUIRED` | Run the downloaded Win7POS GitHub artifact on a Win7 SP1 machine/VM. |

## Required staging inputs

Use a non-production Supabase project. Do not use production refs or service-role keys.

PowerShell:

```powershell
$env:TEST_TARGET = "staging"
$env:ALLOW_STAGING_E2E = "yes"
$env:CONFIRM_STAGING_E2E = "yes"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://jpgoimipbothfgkokyvm.supabase.co"
$env:SUPABASE_PROJECT_REF = "jpgoimipbothfgkokyvm"
$env:STAGING_SUPABASE_PROJECT_REF = "jpgoimipbothfgkokyvm"
$env:ALLOWED_STAGING_SUPABASE_PROJECT_REFS = "jpgoimipbothfgkokyvm"
$env:SUPABASE_SERVICE_ROLE_KEY = "<server-only-staging-service-role-key>"
$env:TASK032_POS_E2E_BASE_URL = "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev"
$env:TASK032_POS_E2E_STAGING_HOST_ALLOWLIST = "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev"
$env:TASK032_POS_E2E_STAGING_PROJECT_REF = "jpgoimipbothfgkokyvm"
$env:TASK032_POS_E2E_TEST_RUN_ID = "STG0706"
```

`SUPABASE_SERVICE_ROLE_KEY` must be process-only for the local harness. Never commit it, print it, or write it into repo docs.

## Deploy and migration gate

Cloudflare staging deploy is already `PASS`. Re-run only if code changes.

After Supabase owner auth:

```powershell
supabase projects list
supabase link --project-ref jpgoimipbothfgkokyvm
supabase migration list --linked
supabase db push --linked
node scripts/db/staging-status.mjs
node scripts/staging-readiness-check.mjs
```

Expected status before Win7POS E2E:

- `db-staging` reports staging URL/project ref allowlisted.
- `staging-readiness-check` reports public smoke, linked migrations, cleanup active zero and POS staging harness dry-run as `PASS`.
- `public.pos_catalog_import_batches` exists with RLS forced, grants only to server-side role, and no client/browser access.

## Admin Web positive POS harness

This creates a synthetic `TASK032` shop/staff/device/catalog dataset, executes positive POS API flow, and verifies cleanup.

```powershell
$env:TASK032_POS_E2E_ENABLE_POSITIVE = "yes"
$env:TASK032_POS_E2E_ALLOW_DATASET_SETUP = "yes"
$env:TASK032_POS_E2E_ALLOW_CLEANUP = "yes"
$env:TASK032_POS_E2E_ALLOW_STAGING = "yes"
$env:TASK032_POS_E2E_REQUIRE_STAGING_TARGET = "yes"
$env:TASK032_POS_E2E_REQUIRE_TEST_MARKER = "TASK032"
node scripts/pos-local-e2e-harness.mjs
```

Expected final status: `PASS_STAGING_POS_E2E_WITH_CLEANUP`.

If it fails after dataset creation, rerun `node scripts/staging-readiness-check.mjs` and confirm `TASK032 cleanup active zero` before retrying.

## Win7POS catalog import sync against staging

First obtain a POS trusted session from the staging first-login flow. Save only synthetic staging credentials in a local file such as `C:\Temp\win7pos-staging-session.json`.

Session file shape:

```json
{
  "deviceToken": "<redacted-device-token>",
  "posSessionId": "<staging-pos-session-id>",
  "sessionToken": "<redacted-session-token>",
  "shopCode": "TASK032_TEST_SHOP_STG0706",
  "shopDeviceId": "<staging-shop-device-id>"
}
```

Then run from the Win7POS checkout:

```powershell
C:\Dev\dotnet10\dotnet.exe run --project C:\Dev\Win7POS-full-audit\src\Win7POS.Cli\Win7POS.Cli.csproj -c Release -- --catalog-import-sync-http-harness --base-url https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev --session-json C:\Temp\win7pos-staging-session.json --keepdb
```

Expected output:

- `CATALOG IMPORT SYNC HTTP HARNESS PASS`
- The local outbox row is `acked`.
- The staging server records the import batch with schema `pos-catalog-import-v1`.
- No token, PIN, password or service-role key is printed.

## Closure statuses

Use these statuses for the residual staging gate:

- `PASS_STAGING_POS_E2E_WITH_CLEANUP`
- `READY_FOR_STAGING_E2E_AFTER_OWNER_SECRET`
- `SUPABASE_OWNER_PERMISSION_REQUIRED`
- `WIN7_PHYSICAL_MACHINE_REQUIRED`
- `HARDWARE_REQUIRED_WITH_ARTIFACT_AND_CHECKLIST`

Do not use the old unresolved statuses `E2E_STAGING_PENDING`, `STAGING_SUPABASE_URL_MISSING`, `SUPABASE_CLI_MISSING`, `STAGING_DEPLOY_PERMISSION_MISSING`, or `WIN7_HARDWARE_NOT_AVAILABLE` unless documenting historical state.
