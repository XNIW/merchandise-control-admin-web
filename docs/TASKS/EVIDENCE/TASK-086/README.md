# Evidence TASK-086 - Mobile UI Emulator Polish

Data review: `2026-06-25`

Repo:

- `HEAD`: `b9fef62f1c9ea379e60c378cce607712dd2c28da`
- `origin/main`: `b9fef62f1c9ea379e60c378cce607712dd2c28da`
- Branch: `main`
- Branch creato: `NO`
- Commit eseguito: `NO`
- File locale fuori scope preesistente: `SSD_HEALTH_REPORT.md` non toccato.

## Preflight

```text
git fetch origin && git pull --ff-only origin main
Already up to date.

TASK-084: REVIEW_READY / REVIEW
TASK-085: REVIEW_READY / REVIEW
```

## Subagent review

- Mobile UX Inspector: individuati problemi P1/P2 su ShopShell mobile,
  products actions/pagination/filter, nav mobile, shop switcher/logout.
- Auth/OAuth + Products Count Reviewer: TASK-085 code path confermato:
  `/auth/oauth/google` usa `signInWithOAuth` + redirect senza probe provider;
  products usa `includeExactTotals: "count-only"` e count `head: true`.
- Security/Docs Closure Reviewer: nessun secret da evidence; closure a `DONE`
  per TASK-084/TASK-085 solo se staging smoke finale verde.

## Android Emulator / Chrome reale

Ambiente:

```text
adb devices
emulator-5554 device

Android Chrome viewport CSS: 411px wide
adb reverse tcp:3060 tcp:3060
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

Screenshot fuori repo:

- `/tmp/task-086-evidence/android-real-local-login-admin.png`
- `/tmp/task-086-evidence/android-real-local-login-shop-code.png`
- `/tmp/task-086-evidence/android-real-local-products-auth.png`

Metriche redatte:

```text
android-real-local-login-admin:
vw=411 docW=411 overflowX=false heading="Admin Console sign in" smallTargetCount=0

android-real-local-login-shop-code:
vw=411 docW=411 overflowX=false heading="Admin Console sign in" smallTargetCount=0

android-real-google-oauth-entry:
oauthRedactedUrl=https://accounts.google.com/v3/signin/identifier
providerReached=true

android-real-local-products-auth:
vw=411 docW=411 overflowX=false heading="Products"
productActionToolbars=10
exactTotalVisible=true
rangeVisible=true
smallTargetCount=0
```

Nota: la sessione staff web usata per products Android e stata creata con token
random, cookie HTTP-only, metadata redacted `TASK-086`, e revocata in cleanup.
Token/cookie/PIN/password/service-role non sono stati stampati.

## Playwright mobile locale

Viewport:

- Pixel 7 profile
- iPhone 13 profile
- Desktop sanity 1440x960

Screenshot fuori repo:

- `/tmp/task-086-evidence/final-pixel-shop-products.png`
- `/tmp/task-086-evidence/final-pixel-shop-staff.png`
- `/tmp/task-086-evidence/final-pixel-shop-devices.png`
- `/tmp/task-086-evidence/final-iphone-shop-products.png`
- `/tmp/task-086-evidence/final-iphone-shop-staff.png`
- `/tmp/task-086-evidence/final-iphone-shop-devices.png`
- `/tmp/task-086-evidence/postfix-pixel-login-admin.png`
- `/tmp/task-086-evidence/postfix-pixel-login-shop-code.png`
- `/tmp/task-086-evidence/postfix-iphone-login-admin.png`
- `/tmp/task-086-evidence/postfix-iphone-login-shop-code.png`

Final focused metrics:

```text
final-pixel-shop-products:
vw=412 docW=412 overflowX=false heading="Products"
productActionToolbars=10 exactTotalVisible=true rangeVisible=true smallTargetCount=0

final-pixel-shop-staff:
vw=412 docW=412 overflowX=false heading="POS / Staff" smallTargetCount=0

final-pixel-shop-devices:
vw=412 docW=412 overflowX=false heading="Devices" smallTargetCount=0

final-iphone-shop-products:
vw=390 docW=390 overflowX=false heading="Products"
productActionToolbars=10 exactTotalVisible=true rangeVisible=true smallTargetCount=0

final-iphone-shop-staff:
vw=390 docW=390 overflowX=false heading="POS / Staff" smallTargetCount=0

final-iphone-shop-devices:
vw=390 docW=390 overflowX=false heading="Devices" smallTargetCount=0
```

Login/OAuth local Playwright:

```text
postfix-pixel-login-admin: overflowX=false smallTargetCount=0
postfix-pixel-login-shop-code: overflowX=false smallTargetCount=0
postfix-iphone-login-admin: overflowX=false smallTargetCount=0
postfix-iphone-login-shop-code: overflowX=false smallTargetCount=0
postfix-pixel-google-oauth-entry:
  oauthRedactedUrl=https://accounts.google.com/v3/signin/identifier
  providerReached=true
```

## Desktop sanity

```text
postfix-desktop-auth-login:
vw=1440 docW=1440 overflowX=false heading="Admin Console sign in"

postfix-desktop-shop:
vw=1440 docW=1440 overflowX=false heading="Shop Overview"

postfix-desktop-shop-products:
vw=1440 docW=1440 overflowX=false heading="Products"
productActionToolbars=10 exactTotalVisible=true rangeVisible=true
```

Desktop nav remains intentionally compact at 32px, matching the existing
desktop layout. Mobile targets are protected by `sm:`, `md:` or `lg:`
breakpoints.

## Checks

```text
npm run security:scan
Security scan passed.
exit 0
```

```text
npm run test:foundation
tests 463
pass 463
fail 0
exit 0
```

```text
npm run typecheck
next typegen && rm -rf .next/types && tsc --noEmit
Types generated successfully
exit 0
```

```text
npm run lint
eslint
exit 0
```

```text
npm run build
next build
Compiled successfully
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register.
```

```text
npm run verify
lint/typecheck/security:scan/build: PASS
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register.
```

```text
npm run cf:build
OpenNext build complete.
exit 0
Warnings:
- Next.js middleware convention deprecated.
- Node DEP0205 module.register.
- OpenNext printed copy warnings for compress-commons, crc32-stream, zip-stream.
```

Staging TASK-085 smoke:

```text
PLAYWRIGHT_BASE_URL=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev npm run smoke:task085:staging
[task-085-smoke] FAIL oauth login 1 rendered forbidden runtime/error copy.
exit 1

TASK085_OAUTH_REPEAT_COUNT=1 PLAYWRIGHT_BASE_URL=... npm run smoke:task085:staging
[task-085-smoke] FAIL oauth login 1 rendered forbidden runtime/error copy.
exit 1
```

Manual fetch/Playwright diagnostic:

```text
Playwright mobile body text on staging login:
Error 1102
Worker exceeded resource limits
Cloudflare Ray ID present
```

No full OAuth URL, token, cookie, PIN, password, shop code or service-role was
printed.

Reviewer retest 2026-06-28:

```text
PLAYWRIGHT_BASE_URL=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev npm run smoke:task085:staging
[task-085-smoke] PASS oauth mobile 1..5 provider=true accounts.google.com/v3/signin/identifier
[task-085-smoke] SKIP products authenticated smoke: TASK085_SHOP_CODE/STAFF_CODE/STAFF_PIN not set.
exit 0
```

## Conclusion

- Mobile UI polish: `PASS`.
- Desktop regression sanity: `PASS`.
- Local/Android TASK-085 OAuth/products regression: `PASS`.
- Workers.dev TASK-085 OAuth retest 2026-06-28: `PASS`; products authenticated
  staging sub-smoke remained `SKIPPED_ENV_MISSING`.
- Formal closure TASK-084/TASK-085 to `DONE`: `NOT_DONE`; Codex did not mark
  tasks done and user review/external Win7 retest remain required.
- TASK-086 status: `REVIEW_READY`.
