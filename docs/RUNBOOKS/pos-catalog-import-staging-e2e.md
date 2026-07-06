# POS catalog import staging E2E runbook

Status date: 2026-07-05

Current status: `E2E_STAGING_PENDING`

Verified in this environment:
- Workers staging public smoke: `PASS`
- URL: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`

Missing in this environment:
- Staging Supabase URL/project ref: `STAGING_SUPABASE_URL_MISSING`
- Supabase CLI: `SUPABASE_CLI_MISSING`
- Deploy credentials/approval for Cloudflare staging: `STAGING_DEPLOY_PERMISSION_MISSING`
- Windows 7 physical runtime evidence: `WIN7_HARDWARE_NOT_AVAILABLE`

## Required staging inputs

Use a non-production Supabase project. Do not use production refs or service-role keys.

PowerShell:

```powershell
$env:TEST_TARGET = "staging"
$env:ALLOW_STAGING_E2E = "yes"
$env:CONFIRM_STAGING_E2E = "yes"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://<staging-project-ref>.supabase.co"
$env:SUPABASE_PROJECT_REF = "<staging-project-ref>"
$env:STAGING_SUPABASE_PROJECT_REF = "<staging-project-ref>"
$env:ALLOWED_STAGING_SUPABASE_PROJECT_REFS = "<staging-project-ref>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<server-only-staging-service-role-key>"
$env:TASK032_POS_E2E_BASE_URL = "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev"
$env:TASK032_POS_E2E_STAGING_HOST_ALLOWLIST = "merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev"
$env:TASK032_POS_E2E_STAGING_PROJECT_REF = "<staging-project-ref>"
$env:TASK032_POS_E2E_TEST_RUN_ID = "STG0705"
```

## Deploy and migration gate

Run after Cloudflare and Supabase credentials are available:

```powershell
npm run cf:deploy:staging
node scripts/db/staging-status.mjs
supabase migration list --linked
supabase db push --linked
node scripts/staging-readiness-check.mjs
```

Expected status before Win7POS E2E:
- `db-staging` reports staging URL/project ref allowlisted.
- `staging-readiness-check` reports public smoke, linked migrations, cleanup active zero and POS staging harness dry-run as `PASS`.

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
  "shopCode": "TASK032_TEST_SHOP_STG0705",
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

Use only these statuses for this gate:
- `PASS_STAGING_POS_E2E_WITH_CLEANUP`
- `E2E_STAGING_PENDING`
- `STAGING_SUPABASE_URL_MISSING`
- `SUPABASE_CLI_MISSING`
- `STAGING_DEPLOY_PERMISSION_MISSING`
- `WIN7_HARDWARE_NOT_AVAILABLE`
