# TASK-084 - Admin Web workers.dev staging, auth/logout fixes, and Win7POS public connection

## Informazioni generali

- ID: `TASK-084`
- Titolo: Admin Web workers.dev staging, auth/logout fixes, and Win7POS public connection
- Stato: `REVIEW_READY`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-24`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-084/README.md`
- Runbook: `docs/RUNBOOKS/win7pos-workers-dev-staging-connection.md`

## Scope

Portare Admin Web e Win7POS a un collegamento staging pubblico verificabile su Cloudflare workers.dev, correggendo i punti di auth/logout che bloccano il flusso reale:

- Google OAuth deve usare l'origin pubblico corrente dietro Cloudflare/Workers e un redirect full-page.
- Logout personale e staff devono tornare al tab/login corretto con response non cacheabile.
- Shop code/staff code login deve restare shop-scoped e non perdere il cookie su local HTTP.
- Win7POS deve collegarsi allo staging workers.dev con UI semplificata: operatore inserisce solo shop code, staff code e PIN/password; URL Admin Web vive in env/config o pannello avanzato; nome device automatico.
- Smoke Cloudflare locale/staging deve coprire il contratto POS first-login.

## Addendum TASK-084B

L'addendum TASK-084B estende lo scope Win7POS:

- nessun campo URL nella UI normale di collegamento POS;
- nessun campo nome device editabile nella UI normale;
- device display name generato localmente da hostname sanitizzato, senza username, MAC, seriale o path locali;
- URL Admin Web solo da `WIN7POS_ADMIN_WEB_BASE_URL`, `C:\ProgramData\Win7POS\pos-admin-web.config` o sezione avanzata;
- rifiuto di URL con path/query/fragment come `/auth/login` o `/shop`;
- HTTPS obbligatorio salvo HTTP loopback e override LAN solo development con `WIN7POS_ALLOW_INSECURE_LAN_ADMIN_WEB=1`;
- scanner/release docs aggiornati.

## Non incluso

- Nessun deploy production.
- Nessun Supabase production apply.
- Nessun secret, token, PIN, password o service-role nel repository o in evidence.
- Nessuna chiusura a `DONE` da parte di Codex.
- Nessun commit/push fuori dallo scope TASK-084; Win7POS e Admin Web sono gestiti solo con gate finali reali.
- Nessuna modifica Android/iOS.
- Nessun refactor fuori scope auth/logout/POS connection.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Admin Web e Win7POS allineati a `origin/main`; commit TASK-081/TASK-083 verificati. | `PASS` |
| CA-02 | Google OAuth usa origin da request/forwarded/Cloudflare header e route GET full-page `/auth/oauth/google`. | `PASS` |
| CA-03 | Redirect `next` resta safe: interno per account login, shop-only per shop-code/staff login. | `PASS` |
| CA-04 | Logout personale e staff usano route server-side con redirect al login corretto e `no-store`. | `PASS` |
| CA-05 | Cookie staff web secure non dipende da URL Supabase; HTTP locale funziona e staging resta secure. | `PASS` |
| CA-06 | Win7POS TASK-084B UI semplificata, URL in env/config/advanced, device automatico e scanner dedicato. | `PASS` |
| CA-07 | Runbook workers.dev include URL staging, config Win7POS e divieto di path `/auth/login`/`/shop`. | `PASS` |
| CA-08 | Gate Admin Web: `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify`, `cf:build`, smoke Cloudflare locale. | `PASS_WITH_WARNINGS` |
| CA-09 | Gate Win7POS: scanner PowerShell e build WPF Release x86. | `PASS` |
| CA-10 | Staging workers.dev deploy autorizzato eseguito con `wrangler deploy --env staging --keep-vars --minify` e smoke remoto. | `PASS_WITH_MINIFY_NOTE` |
| CA-11 | ReleasePack Win7POS GitHub generato, scaricato e validato con artifact-mode. | `PASS` |
| CA-12 | Handoff contiene file toccati, evidence, rischi residui e prossima fase review. | `PASS` |

## File coinvolti

Admin Web:

- `src/lib/auth/oauth-redirect.ts`
- `src/app/auth/oauth/google/route.ts`
- `src/app/auth/callback/route.ts`
- `src/app/auth/login/page.tsx`
- `src/components/auth/AuthForm.tsx`
- `src/app/auth/logout/route.ts`
- `src/app/shop/staff-logout/route.ts`
- `src/app/api/pos/_shared/pos-route-security.ts`
- `src/app/api/pos/auth/first-login/route.ts`
- `src/app/api/pos/session/heartbeat/route.ts`
- `src/app/api/pos/catalog/pull/route.ts`
- `src/app/api/pos/sales/sync/route.ts`
- `src/app/(staff-auth)/shop/staff-login/actions.ts`
- `src/app/(staff-auth)/shop/staff-login/page.tsx`
- `src/server/shop-admin/staff-web-auth.ts`
- `src/components/platform/AppShell.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/app/shop/layout.tsx`
- `src/i18n/dictionaries.ts`
- `scripts/security-checks.mjs`
- `scripts/testing/cloudflare-local-smoke.mjs`
- `next.config.ts`
- `tests/foundation/*.test.mjs`
- `docs/RUNBOOKS/win7pos-workers-dev-staging-connection.md`

Win7POS:

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Core/Online/PosAdminWebOptions.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosDeviceIdentity.cs`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-online-linking-task084b.ps1`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-online-bootstrap.ps1`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-online-client.ps1`
- `/Users/minxiang/Projects/Win7POS/scripts/check-release-pack-completeness.ps1`
- `/Users/minxiang/Projects/Win7POS/scripts/set-admin-web-staging-url.bat`
- `/Users/minxiang/Projects/Win7POS/.github/workflows/release-pack.yml`
- `/Users/minxiang/Projects/Win7POS/README.md`

## Rischi residui attesi

- Google OAuth secret/provider configuration puo richiedere verifica o rotazione esterna in Google/Supabase console; Codex non legge ne stampa segreti.
- Browser login reale su account Google puo richiedere sessione/2FA utente. Il click remoto raggiunge Google Accounts con redirect Supabase/Workers; il completamento interattivo Google resta `USER_2FA_REQUIRED`.
- Windows 7 fisico/VM resta dipendente da runner o macchina reale disponibile; ReleasePack e pronto per retest online.
- Staging workers.dev e non production; custom domain/DNS production resta fuori scope.
- `npm run smoke:oauth:local` resta `BLOCKED_LOCAL_SUPABASE_REQUIRED` per Docker/Supabase locale non disponibile su questo host.
