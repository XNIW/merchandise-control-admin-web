# TASK-084 Evidence - workers.dev staging, auth/logout fixes, Win7POS public connection

## Stato

- Stato task: `REVIEW_READY`
- Fase handoff: `REVIEW`
- Data apertura locale: `2026-06-24`
- Staging target: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`
- Worker staging: `merchandise-control-admin-web-staging`
- Admin Web status: `DONE_READY_FOR_USER_REVIEW`
- Win7POS status: `READY_FOR_WIN7POS_ONLINE_RETEST`
- Overall final review status: `READY_FOR_USER_REVIEW_AND_WIN7_RETEST`
- Overall status: `READY_FOR_USER_REVIEW_AND_WIN7_RETEST`
- Nessun deploy production o Supabase production apply eseguito.
- Nessun secret letto, stampato o salvato.
- Staging workers.dev deployato con Version ID finale `118fde99-acde-424a-9c60-87ab429af8df`.
- Win7POS commit/push eseguito su `main`: `a70ed4f` (`TASK-084 simplify Win7POS online linking`).
- Final hardening Admin Web: CI/package deploy staging usa `--minify`; runtime workers.dev verificato, nessun production deploy.

## Addendum TASK-085

TASK-085 ha chiuso i due blocker post-review rimasti su workers.dev mobile:
`Google OAuth 1102` e `/shop/products` exact total. Evidence corrente:
`docs/TASKS/EVIDENCE/TASK-085/README.md`.

## Baseline git e dipendenze

Admin Web:

```text
git fetch origin main
git pull --ff-only
Risultato: up to date.
Commit TASK-081 presenti:
9b7b15b7 TASK-081 reconcile Win7POS sales sync closure
59abaa5e TASK-081 POS revenue sync admin
98b7e019 Mobile shop context admin closure
Working tree iniziale: solo SSD_HEALTH_REPORT.md untracked preesistente.
```

Win7POS:

```text
git fetch origin main
git pull --ff-only
Risultato: up to date.
TASK-083 presente su local/origin/main: 2be295f90bff4f16c4dcdc26180fb67586fc4782.
Working tree iniziale: artefatti dist/TASK-081* untracked preesistenti.
```

Guide lette prima di modifiche framework:

- `AGENTS.md`
- `docs/MASTER-PLAN.md`
- guide Next.js locali in `node_modules/next/dist/docs/` per route handlers, redirect, mutating data, proxy e authentication;
- `/Users/minxiang/Projects/Win7POS/AGENTS.md`
- `/Users/minxiang/Projects/Win7POS/docs/DIALOG_STANDARD.md`

## Evidence corrente

### Admin Web gate finali

```text
git diff --check
exit 0
```

```text
npm run security:scan
Security scan passed.
exit 0
```

```text
npm run test:foundation
tests 462
pass 462
fail 0
exit 0
```

```text
npm run typecheck
Generating route types...
Types generated successfully.
tsc --noEmit exit 0
```

```text
npm run lint
exit 0
```

```text
npm run build
Compiled successfully.
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run verify
lint/typecheck/security:scan/build: PASS
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run cf:build
OpenNext build complete.
Worker saved in .open-next/worker.js.
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205.
OpenNext emitted known copy warnings for compress-commons, crc32-stream and zip-stream while still producing the worker.
```

```text
npm run smoke:cloudflare:local
PASS home/login/platform/shop/products guards.
PASS POS first-login POST {} status=400 cache=no-store.
PASS POS first-login GET status=405.
PASS POS heartbeat/catalog/sales method and payload guards.
PASS catalog upload/export/template guards.
exit 0
```

```text
npm run smoke:oauth:local
BLOCKED_EXTERNAL_CONFIG BLOCKED_LOCAL_SUPABASE_REQUIRED: Local Supabase Auth must be reachable at http://127.0.0.1:54321 or localhost:54321.
exit 3
```

```text
supabase status
failed to inspect container health: Cannot connect to the Docker daemon.
exit 1
```

### Test mirati Admin Web

```text
node --test tests/foundation/task-065-google-oauth-redirect.test.mjs tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs tests/foundation/task-038-pos-manager-web-login.test.mjs tests/foundation/supabase-foundation.test.mjs
tests 37
pass 37
fail 0
exit 0
```

### Scanner Win7POS gia eseguiti

```text
pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-dialog-standards.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-linking-task084b.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-client.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-startup-win7-safe.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
git diff --check
exit 0
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
Compilazione completata.
Avvisi: 0
Errori: 0
exit 0
```

### Cloudflare staging

```text
npx wrangler whoami
PASS: OAuth token authenticated; account details verified locally and not copied into evidence.
exit 0
```

```text
npx wrangler deploy --dry-run --env staging
PASS_WITH_WARNINGS: direct eval warning and duplicate key euro warning.
No upload/deploy performed.
exit 0
```

```text
npx wrangler deploy --env staging --keep-vars
FAIL_EXTERNAL_ACCOUNT_LIMIT: Worker exceeded the 3 MiB size limit before version creation.
Largest file reported: .open-next/server-functions/default/handler.mjs about 14179 KiB.
exit 1
```

```text
npx wrangler deploy --env staging --keep-vars --minify
Uploaded merchandise-control-admin-web-staging.
URL: https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
Current Version ID: bdb8211e-da92-46ef-b960-0d82d32134b2
exit 0
Warnings: direct eval, duplicate key euro, Node DEP0190.
```

```text
npx wrangler deployments list --env staging
Latest deployment version: bdb8211e-da92-46ef-b960-0d82d32134b2
Created: 2026-06-24T23:31:40.040Z
exit 0
```

```text
npx wrangler deployments status --env staging
Active version: bdb8211e-da92-46ef-b960-0d82d32134b2 at 100%
exit 0
```

### Smoke remoto workers.dev

```text
login shop: status=200 cache=private, no-cache, no-store, max-age=0, must-revalidate
login platform: status=200 cache=private, no-cache, no-store, max-age=0, must-revalidate
shop guard: status=200 cache=private, no-cache, no-store, max-age=0, must-revalidate
platform guard: status=200 cache=private, no-cache, no-store, max-age=0, must-revalidate
pos first-login get: status=405
pos first-login post-empty: status=400 cache=no-store
oauth google start: status=307 cache=no-store, max-age=0, location Supabase authorize with redirect_to workers.dev /auth/callback?next=/shop
oauth unsafe next: status=307 cache=no-store, max-age=0, location /auth/login?mode=admin-account&next=%2F&error=unsafe_next
```

```text
PLAYWRIGHT_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_PROJECT_REF=... ALLOWED_STAGING_SUPABASE_PROJECT_REFS=... ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes npm run smoke:staging
1 passed
exit 0
```

### Browser QA pubblico staging

```text
desktop-shop-login: h1="Admin Console sign in" google=true email=true shopCodeTabCount=1
mobile-shop-login: h1="Admin Console sign in" google=true email=true shopCodeTabCount=1
desktop-platform-login: h1="Master Console sign in" google=true email=true shopCodeTabCount=0
mobile-platform-login: h1="Master Console sign in" google=true email=true shopCodeTabCount=0
Screenshots saved outside repo: /tmp/task084-*.png
exit 0
```

## Final Completion Addendum - 2026-06-24 / 2026-06-25 UTC

### Repo sync finale

Admin Web:

```text
git fetch origin main
git pull --ff-only
Risultato: Already up to date.
HEAD prima del commit TASK-084: 9b7b15b7 TASK-081 reconcile Win7POS sales sync closure
```

Win7POS:

```text
git fetch origin main
git pull --ff-only
Risultato: Already up to date.
TASK-083 confermato su local/origin/main:
2be295f90bff4f16c4dcdc26180fb67586fc4782
Commit TASK-084 Win7POS creato e pushato:
a70ed4f TASK-084 simplify Win7POS online linking
```

### Admin Web workers.dev finale

Local/CI-style gates rieseguiti dopo normalizzazione stato governance a `REVIEW_READY`:

```text
npm run test:foundation
tests 462
pass 462
fail 0
exit 0
```

```text
npm run verify
lint/typecheck/security:scan/build: PASS
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run smoke:cloudflare:local
PASS home/login/platform/shop/products guards.
PASS POS first-login/session-heartbeat/catalog-pull/sales-sync POST {} guards.
PASS POS first-login/session-heartbeat/catalog-pull/sales-sync GET 405 no-store guards.
PASS catalog upload/export/template guards.
exit 0
```

```text
PLAYWRIGHT_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_PROJECT_REF=... ALLOWED_STAGING_SUPABASE_PROJECT_REFS=... ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes npm run smoke:staging
1 passed
exit 0
```

```text
npm run cf:build
OpenNext build complete.
Worker saved in .open-next/worker.js.
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205.
OpenNext copy warnings for compress-commons/crc32-stream/zip-stream while producing worker.
```

```text
npx wrangler deploy --env staging --keep-vars --minify
Uploaded merchandise-control-admin-web-staging.
URL: https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
Current Version ID: 118fde99-acde-424a-9c60-87ab429af8df
exit 0
Warnings: direct eval, duplicate key euro, Node DEP0190.
```

Remote clean-context smoke finale:

```text
PASS http root: status=307 cache-control=private, no-cache, no-store, max-age=0, must-revalidate location=/auth/login?next=/shop&mode=admin-account
PASS http login admin->shop: status=200 cache-control=private, no-cache, no-store, max-age=0, must-revalidate
PASS http login shop-code->shop: status=200 cache-control=private, no-cache, no-store, max-age=0, must-revalidate
PASS http platform guard: status=200 cache-control=private, no-cache, no-store, max-age=0, must-revalidate
PASS http shop guard: status=200 cache-control=private, no-cache, no-store, max-age=0, must-revalidate
PASS browser shop-code page: only shopCode/staffCode/credential form is rendered
PASS pos first-login GET: status=405 cache-control=no-store allow=POST
PASS pos first-login POST {}: status=400 cache-control=no-store
PASS browser Google OAuth click: navigated_to=accounts.google.com with redirect_uri Supabase callback and sensitive params redacted
exit 0
```

Shop-code authenticated smoke finale:

```text
PASS staging shop-code auth smoke: login=/shop staff=/shop/staff logout clears staff cookie guard=signed-out
PASS staging shop-code auth cleanup: credential restored and active test sessions revoked
exit 0
```

Notes:

- Lo smoke shop-code ha usato un PIN temporaneo generato solo in memoria per il manager staging `1001`; il valore non e stato stampato, scritto su file o salvato in evidence.
- Dopo lo smoke, l'hash staff precedente e stato ripristinato e le sessioni attive create dal test sono state revocate.
- Il completamento interattivo Google resta `USER_2FA_REQUIRED`: il click browser arriva a Google Accounts; non sono state inserite credenziali utente o fattori 2FA.
- `npm run smoke:oauth:local` resta `NOT_REQUIRED_FOR_REMOTE_STAGING_TARGET` / `BLOCKED_LOCAL_SUPABASE_REQUIRED` per Docker/Supabase locale non disponibile.

### Win7POS ReleasePack finale

Local gates:

```text
pwsh -NoProfile -File scripts/check-pos-online-linking-task084b.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-client.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-dialog-standards.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-startup-win7-safe.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
Compilazione completata.
Avvisi: 0
Errori: 0
exit 0
```

GitHub Actions:

```text
Workflow: Release Pack
Run ID: 28137596679
Commit: a70ed4f TASK-084 simplify Win7POS online linking
Result: success
Job pack: success in 2m28s
Artifact: Win7POS-ReleasePack-x86
Artifact ID: 7865503745
```

Downloaded artifact:

```text
Wrapper: /tmp/task084-win7pos-releasepack/Win7POS-ReleasePack-x86-artifact.zip
Wrapper SHA256: f027e0233bb262a5a23df0291df6b1aef42e1ff17b3999dbf03b885e56d00e56
Internal zip: /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
Internal zip SHA256: 8555f15768b86a63b7dfd7a2aad71500d9736dbf40865fd1def6a32766d8e5f8
```

Artifact validation:

```text
pwsh -NoProfile -File scripts/check-release-pack-completeness.ps1 -ReleasePackSource /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
PASS: ReleasePack contains Win7POS.Wpf.exe
PASS: ReleasePack contains Win7POS.Wpf.exe.config
PASS: ReleasePack contains Win7POS.Core.dll
PASS: ReleasePack contains Win7POS.Data.dll
PASS: ReleasePack contains e_sqlite3.dll
PASS: ReleasePack contains SQLitePCLRaw.provider.e_sqlite3.dll
PASS: ReleasePack contains VERSION.txt
PASS: ReleasePack contains README_RUN.txt
PASS: ReleasePack contains RELEASE_CHECKLIST.txt
PASS: ReleasePack contains set-admin-web-staging-url.bat
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-startup-win7-safe.ps1 -ReleasePackSource /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-linking-task084b.ps1 -ReleasePackSource /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
PASS: ReleasePack staging helper writes expected Admin Web config
PASS: README_RUN.txt documents simplified online linking and staging helper
PASS: RELEASE_CHECKLIST.txt includes staging helper and simplified linking checks
=== RESULT: ALL PASS ===
exit 0
```

## Evidence da completare dopo review utente

- Browser Google OAuth completo con account reale, se l'utente vuole validare 2FA/consenso Google end-to-end.
- Windows 7 fisico/VM runtime, se hardware o runner diventano disponibili.

## Rischi residui

- Google OAuth provider/client secret e callback in console Supabase/Google sono esterni al repository; eventuale rotazione richiede azione utente o console autenticata. Il route start staging e verificato fino al redirect Supabase authorize con callback workers.dev.
- Browser QA Google reale puo richiedere account/sessione/2FA utente.
- Windows 7 fisico/VM non e dichiarato PASS senza runtime reale.
- Production deploy e Supabase production apply sono vietati dallo scope.

## Final Review / Missing Completion Hardening - 2026-06-25

### Mandatory repo sync

Admin Web:

```text
git fetch origin main
git pull --ff-only
Risultato: Already up to date.
Local HEAD: ad1e19da TASK-084 complete workers.dev staging and POS release readiness
origin/main: ad1e19da TASK-084 complete workers.dev staging and POS release readiness
Working tree prima del fix finale: solo file TASK-084 modificati da Codex piu untracked SSD_HEALTH_REPORT.md non stageato.
```

Win7POS:

```text
git fetch origin main
git pull --ff-only
Risultato: Already up to date.
Local/origin HEAD: a70ed4f TASK-084 simplify Win7POS online linking
TASK-083 richiesto: 2be295f e confermato antenato di main.
Untracked legacy dist/TASK-081* non stageati.
```

### Cloudflare workers.dev version and size gate

```text
npx wrangler deployments list --env staging
npx wrangler deployments status --env staging
Active Version ID: 118fde99-acde-424a-9c60-87ab429af8df
Traffic: 100%
Created: 2026-06-24T23:59:59.205Z
exit 0
```

```text
npx wrangler deploy --dry-run --env staging
Total Upload: 3142.22 KiB gzip
exit 0
```

```text
npx wrangler deploy --dry-run --env staging --minify
Total Upload: 2688.10 KiB gzip
exit 0
```

Fix finale applicato in Admin Web:

- `package.json` `cf:deploy:staging` usa `npx wrangler deploy --env staging --keep-vars --minify`.
- `.github/workflows/cloudflare.yml` usa `--minify` per deploy staging e production.
- Nessun deploy production eseguito.
- Nessun redeploy runtime dopo questo fix, perche la modifica e CI/package-only; il runtime workers.dev attivo `118fde99-acde-424a-9c60-87ab429af8df` e stato verificato con smoke esterni.

### External browser QA workers.dev

```text
Target: https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
Supabase project: jpgoimipbothfgkokyvm
Service-role key: loaded only in process memory, never printed.
Temporary staff PIN: generated only in memory, never printed.
```

```text
publicBrowser.desktop:
  adminLogin PASS
  shopCodeLogin PASS
  platformGuard PASS
  shopGuard PASS
publicBrowser.mobile:
  adminLogin PASS
  shopCodeLogin PASS
  platformGuard PASS
  shopGuard PASS
googleOAuth:
  routeRedirect PASS
  browserNavigationHost google
shopCode:
  login PASS
  shopStaff PASS
  platformDenied PASS
  logout PASS
  cookieCleared PASS
personalLogout:
  platform PASS
  shopPersonal PASS
cleanup:
  baselineActiveStaffSessions 5
  newActiveStaffWebSessions 0
  activeSyntheticDevices 0
  activeSyntheticPosSessions 0
  activeSyntheticDeviceCredentials 0
  staffCredentialRestored checked_after_restore
status PASS
exit 0
```

Nota: le 5 staff session attive baseline erano preesistenti per lo shop manager staging `1001`; lo smoke non ne ha lasciate di nuove.

### POS API valid first-login smoke

Lo smoke workers.dev ha usato una credenziale staff temporanea in memoria, una device key sintetica e payload valido per il contratto POS. Non sono stati stampati o salvati PIN, token o secret.

```text
posApi:
  get405 PASS
  firstLogin200 PASS
  heartbeat200 PASS
  catalogPull200 PASS
  pinEcho PASS_NO_ECHO
cleanup:
  activeSyntheticDevices 0
  activeSyntheticPosSessions 0
  activeSyntheticDeviceCredentials 0
status PASS
exit 0
```

### ReleasePack artifact validation

```text
gh run view 28137596679 --json ...
Workflow: Release Pack
Run ID: 28137596679
Conclusion: success
Commit: a70ed4fff8cab5c23d27aae54294c347d9ca760d
Job pack: success
```

```text
Wrapper artifact:
/tmp/task084-win7pos-releasepack/Win7POS-ReleasePack-x86-artifact.zip
SHA256: f027e0233bb262a5a23df0291df6b1aef42e1ff17b3999dbf03b885e56d00e56

Internal ReleasePack:
/tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
SHA256: 8555f15768b86a63b7dfd7a2aad71500d9736dbf40865fd1def6a32766d8e5f8
```

Required files present in the internal zip:

```text
Win7POS.Wpf.exe
Win7POS.Wpf.exe.config
Win7POS.Core.dll
Win7POS.Data.dll
e_sqlite3.dll
VERSION.txt
README_RUN.txt
APP-FILES.txt
SHA256SUMS.txt
set-admin-web-staging-url.bat
```

Validators:

```text
pwsh -NoProfile -File scripts/check-release-pack-completeness.ps1 -ReleasePackSource /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-startup-win7-safe.ps1 -ReleasePackSource /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-linking-task084b.ps1 -ReleasePackSource /tmp/task084-win7pos-releasepack/extracted/Win7POS_20260625_0004.zip
PASS: ReleasePack staging helper writes expected Admin Web config
PASS: README_RUN.txt documents simplified online linking and staging helper
PASS: RELEASE_CHECKLIST.txt includes staging helper and simplified linking checks
=== RESULT: ALL PASS ===
exit 0
```

### Final Admin Web gates after hardening

```text
git diff --check
exit 0
```

```text
npm run security:scan
exit 0
```

```text
npm run test:foundation
tests 462
pass 462
fail 0
exit 0
```

```text
npm run typecheck
exit 0
```

```text
npm run lint
exit 0
```

```text
npm run build
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run verify
lint/typecheck/security:scan/build: PASS
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run cf:build
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205; OpenNext copy warnings for compress-commons/crc32-stream/zip-stream.
```

```text
npm run smoke:cloudflare:local
PASS home/login/platform/shop/products guards.
PASS POS first-login/session-heartbeat/catalog-pull/sales-sync POST {} guards.
PASS POS first-login/session-heartbeat/catalog-pull/sales-sync GET 405 no-store guards.
PASS catalog upload/export/template guards.
exit 0
```

```text
PLAYWRIGHT_BASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_PROJECT_REF=... ALLOWED_STAGING_SUPABASE_PROJECT_REFS=... ALLOW_STAGING_E2E=yes CONFIRM_STAGING_E2E=yes npm run smoke:staging
1 passed
exit 0
```

### Exact Win7POS retest steps

1. Scaricare l'artifact GitHub Actions `Win7POS-ReleasePack-x86` dal run `28137596679`.
2. Estrarre `Win7POS_20260625_0004.zip`.
3. Eseguire `set-admin-web-staging-url.bat` come amministratore, oppure scrivere `%ProgramData%\Win7POS\pos-admin-web.config` con `AdminWebBaseUrl=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.
4. Avviare `Win7POS.Wpf.exe` su Windows 7 fisico/VM.
5. Aprire il flusso `Collega POS online`.
6. Inserire solo shop code, staff code e PIN/password; non inserire URL o nome device nella UI normale.
7. Verificare first-login, heartbeat e catalog pull.
8. Eseguire sales sync solo durante il retest fisico previsto, usando dati sintetici.

### Not run / residuals

- Windows 7 fisico/VM first-login: `NOT_RUN_PHYSICAL_RUNTIME_REQUIRED`.
- Windows 7 fisico/VM catalog pull: `NOT_RUN_PHYSICAL_RUNTIME_REQUIRED`.
- Windows 7 fisico/VM sales sync: `NOT_RUN_PHYSICAL_RUNTIME_REQUIRED`.
- Production deploy: `NOT_RUN_OUT_OF_SCOPE`.
- Supabase production apply: `NOT_RUN_OUT_OF_SCOPE`.
- Local Docker/Supabase OAuth smoke: `LOCAL_DOCKER_NOT_REQUIRED_FOR_REMOTE_STAGING`.

### Final status for review

- Admin Web: `DONE_READY_FOR_USER_REVIEW`.
- Win7POS: `READY_FOR_WIN7POS_ONLINE_RETEST`.
- Overall: `READY_FOR_USER_REVIEW_AND_WIN7_RETEST`.
- Formal task state remains `REVIEW_READY`; Codex did not mark `DONE`.
