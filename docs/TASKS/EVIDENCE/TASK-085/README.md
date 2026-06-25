# TASK-085 Evidence - workers.dev mobile OAuth and product totals readiness

## Summary

TASK-085 chiude i due blocker runtime post TASK-084:

- mobile Google OAuth workers.dev non deve piu cadere in Cloudflare Error 1102;
- `/shop/products` deve mostrare un totale esatto filtrato, non `Total unavailable`.

Esito operativo: `REVIEW_READY`, non `DONE`.

## Repo sync

Admin Web:

```text
git fetch origin main
git pull --ff-only
git merge-base --is-ancestor 94a745ce HEAD
git merge-base --is-ancestor 94a745ce origin/main
PASS: local/origin main allineati prima delle modifiche.
```

Win7POS:

```text
git fetch origin main
git pull --ff-only
git merge-base --is-ancestor a70ed4f HEAD
git merge-base --is-ancestor a70ed4f origin/main
git merge-base --is-ancestor 2be295f HEAD
git merge-base --is-ancestor 2be295f origin/main
PASS: TASK-084 Win7POS e TASK-083 presenti su local/origin main.
```

Nota: in Win7POS restano artifact non tracciati `dist/TASK-081*`, non modificati o staged.

## Implementation evidence

### OAuth mobile 1102

Fix applicato:

- rimossa probe server-side OAuth provider da `src/app/auth/oauth/google/route.ts`;
- rimossa probe equivalente dalla server action legacy in `src/app/auth/login/actions.ts`;
- redirect browser resta full-page verso Supabase Auth/Google;
- response OAuth route mantiene `Cache-Control: no-store, max-age=0`.

Foundation:

```text
tests/foundation/task-065-google-oauth-redirect.test.mjs
PASS: route/action non contengono piu probeOAuthAuthorizeUrl, fetch(oauthUrl) o timeout probe.
```

### Products exact total

Fix applicato:

- `GetShopInventoryProductsPageOptions.includeExactTotals` supporta `boolean | "count-only"`;
- nuovo `countProductsPage(...)` usa `select("id", { count: "exact", head: true })`;
- il count riusa gli stessi scope e filtri della pagina prodotti;
- `/shop/products` usa `includeExactTotals: "count-only"`;
- UI `Total products` legge `pagination.totalCount` quando exact;
- copy `Total unavailable` / `Server-side count unavailable` rimosso dalla pagina prodotti.

Foundation:

```text
tests/foundation/shop-read-model.test.mjs
PASS: TASK-085 products page shows exact totals through count-only path.
```

## Local Admin Web gates

```text
node --check scripts/testing/task-085-workers-dev-runtime-smoke.mjs
PASS

npm run typecheck
PASS

npm run security:scan
PASS

npm run test:foundation
PASS: 463/463

git diff --check
PASS

npm run lint
PASS

npm run build
PASS_WITH_WARNINGS
Warnings: Next.js middleware convention deprecated; Node module.register deprecation.

npm run verify
PASS_WITH_WARNINGS
Warnings: same known deprecations.
```

Cloudflare build/local:

```text
npm run cf:build
PASS on isolated rerun.
Note: one earlier parallel run raced with another Next build and missed .next/required-server-files.json; rerun alone passed.

npm run smoke:cloudflare:local
PASS
home/login/platform/shop/products guards PASS
POS POST {} guards PASS
POS GET method guards PASS
catalog upload/export/template guards PASS
```

## Cloudflare staging deploy

Dry-run:

```text
npx wrangler deploy --dry-run --env staging --minify
PASS
Total Upload: 9833.78 KiB / gzip: 2687.03 KiB
Warnings: direct eval and duplicate euro from bundled dependencies.
```

Deploy:

```text
npx wrangler deploy --env staging --keep-vars --minify
PASS
Worker: merchandise-control-admin-web-staging
URL: https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
Version ID: 81195e59-fdda-430c-8c33-911ee444d367
Worker Startup Time: 33 ms
```

Deployment status:

```text
npx wrangler deployments status --env staging
Created: 2026-06-25T01:15:26.437Z
Version(s): 100% 81195e59-fdda-430c-8c33-911ee444d367
```

## Remote workers.dev smoke

OAuth mobile repeated smoke:

```text
PLAYWRIGHT_BASE_URL=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev npm run smoke:task085:staging

PASS oauth mobile 1: final=https://accounts.google.com/v3/signin/identifier provider=true
PASS oauth mobile 2: final=https://accounts.google.com/v3/signin/identifier provider=true
PASS oauth mobile 3: final=https://accounts.google.com/v3/signin/identifier provider=true
PASS oauth mobile 4: final=https://accounts.google.com/v3/signin/identifier provider=true
PASS oauth mobile 5: final=https://accounts.google.com/v3/signin/identifier provider=true
SKIP products authenticated smoke: TASK085_SHOP_CODE/STAFF_CODE/STAFF_PIN not set.
```

Authenticated products + POS API smoke:

```text
Inline staging smoke with temporary in-memory manager PIN, restored in finally.

PASS dataset prepared: exactProductCount=19705 target=synthetic-staging
PASS products mobile: exact total visible and unavailable copy absent
PASS pos API: first-login=200 heartbeat=200 catalog-pull=200 credentialEcho=false
PASS cleanup: credentialRestored=true newStaffSessionsRevoked=1 activeSyntheticDevices=0 activeSyntheticPosSessions=0 activeSyntheticDeviceCredentials=0
```

Notes:

- PIN, shop code, staff credential hash, tokens, cookies and service-role were not printed or stored in evidence.
- The smoke initially exposed two harness issues and both were fixed before final PASS:
  - `credential_kind` must be `pin`, not `temporary_pin`;
  - mobile products range assertion now reads visible body text to avoid hidden duplicate matches.

General staging smoke:

```text
PLAYWRIGHT_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_PROJECT_REF=... ALLOWED_STAGING_SUPABASE_PROJECT_REFS=... ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes npm run smoke:staging

PASS TEST_TARGET=staging
PASS Supabase target guardrails passed
1 passed: staging Platform auth boundary responds without mutating data
```

## Win7POS non-physical gates

```text
git diff --check
PASS

pwsh -NoProfile -File scripts/check-dialog-standards.ps1
PASS: RESULT ALL PASS

pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1
PASS: RESULT ALL PASS

pwsh -NoProfile -File scripts/check-pos-online-client.ps1
PASS: RESULT ALL PASS

pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1
PASS: RESULT ALL PASS

pwsh -NoProfile -File scripts/check-pos-startup-win7-safe.ps1
PASS: RESULT ALL PASS

pwsh -NoProfile -File scripts/check-pos-online-linking-task084b.ps1
PASS: RESULT ALL PASS

dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
PASS: Avvisi 0, Errori 0
```

Physical Windows 7/VM retest: `NOT_RUN_PHYSICAL_RUNTIME_REQUIRED`.

## Subagent review summary

- OAuth/Cloudflare reviewers identified server-side OAuth probe and auth RSC CPU/resource sensitivity as the likely 1102 path. Probe removal implemented and deployed.
- Products reviewer identified deferred exact count as the reason for `Total unavailable`; count-only exact path implemented.
- POS/Win7POS reviewer confirmed contract compatibility and scanner PASS.
- Security reviewer found no service-role/browser exposure or evidence secret leak; CSP wildcard remains future hardening.
- Mobile reviewer noted old pre-fix workers.dev mobile 1102; final post-deploy smoke now passes OAuth and products.

## Residual risk

- Google account completion may require user session/2FA and was not performed.
- No physical/VM Windows 7 execution was available.
- Staging workers.dev only; production/custom domain remains out of scope.
- The exact total count adds one bounded `head: true` count query for `/shop/products`; summary catalog counts stay off on the products page.

## Handoff

Verdict: `READY_FOR_USER_REVIEW_AND_WIN7_RETEST`.

Next phase: reviewer validates TASK-085 and user decides whether to confirm `DONE`.
