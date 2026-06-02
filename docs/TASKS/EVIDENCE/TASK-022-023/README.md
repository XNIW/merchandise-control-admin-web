# TASK-022_023 Evidence

## Stato corrente

- Task: `TASK-022_023 - POS live dashboard + Win7POS first login trusted device`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data apertura: `2026-06-01`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_RUN_USER_REQUESTED_NO_STAGE`
- Verdict corrente: `PASS_WITH_NOTES_READY_FOR_REVIEW`

## Pre-flight

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short` | `PASS_WITH_EXISTING_CHANGES` | `.env.example`, test TASK-018 e file TASK-020 non tracciati erano gia presenti prima di TASK-022_023. |
| Admin Web | `git branch --show-current` | `PASS` | `main`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Admin Web | `git diff --stat` | `PASS_WITH_EXISTING_CHANGES` | 2 file tracciati gia modificati, 2 insertions / 1 deletion. |
| Admin Web | `git diff --cached --name-status` | `PASS` | Nessun output; nessun file staged. |
| Win7POS | `git status --short --branch` | `PASS` | `## main...origin/main`. |
| Win7POS | `git branch --show-current` | `PASS` | `main`. |
| Win7POS | `git rev-parse HEAD` | `PASS` | `aa545fc148d395cbfc56e3fd96e04a0c119e9bc0`. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git diff --stat` | `PASS` | Nessun output. |
| Win7POS | `git diff --cached --name-status` | `PASS` | Nessun output; nessun file staged. |

## TDD evidence

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs` | `FAIL_EXPECTED_RED` | `tests 4`, `pass 0`, `fail 4`; fallimenti attesi per task doc, dashboard POS, client Win7POS e scanner mancanti. |

## Letture obbligatorie

| Fonte | Esito | Note |
| --- | --- | --- |
| Admin Web governance e TASK-020/TASK-021 | `PASS` | Confermato TASK-021 `DONE_RECONCILED`; nessuna dashboard/client/sales sync gia presente. |
| Next.js docs locali | `PASS` | Lette guide App Router, Server/Client Components, data fetching, route handlers, data security, environment variables. |
| Shop Admin read models | `PASS` | Pattern server-only/read-only con `resolveCurrentShopAdminShellAccess` e DTO minimali. |
| Win7POS governance/dialog standard | `PASS` | Nuovi dialog devono usare `DialogShellWindow`, `CenterOwner`, shared footer styles, no positioning custom. |
| Win7POS login/storage | `PASS` | First-run admin e login locale vanno preservati; dati in `AppPaths.DataDirectory`. |

## Modifiche TASK-022_023

### Admin Web

- Aggiunta route server-rendered `/shop/pos`.
- Aggiunto read model `server-only` per POS live, filtrato da shop corrente e basato solo su dati Supabase reali.
- Aggiunta voce Shop Admin `POS Live` e sezione read-only con summary/table/error-empty states.
- Aggiornati scanner e foundation tests per route dinamica, navigazione Shop Admin e vincoli TASK-022_023.
- Aggiornati task doc, evidence e Master Plan per handoff a `REVIEW`.

File principali:

- `src/app/shop/pos/page.tsx`
- `src/server/shop-admin/pos-live-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/components/shop/shopSections.ts`
- `scripts/security-checks.mjs`
- `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/supabase-schema.test.mjs`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`

### Win7POS

- Aggiunto client Admin Web opzionale con `HttpClient`, TLS 1.2, timeout e DTO JSON.
- Aggiunto device identifier stabile e trusted device/session store con DPAPI `ProtectedData`.
- Aggiunto dialog `Collega POS online` dal login operatore.
- Aggiunto heartbeat all'avvio solo quando il base URL e configurato e lo stato trusted esiste.
- Aggiornata documentazione README e aggiunto scanner PowerShell dedicato.

File principali:

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosAdminWebClient.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Online/PosDeviceIdentity.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/PosOnlineFirstLoginDialog.xaml.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/MainWindow.xaml.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Win7POS.Wpf.csproj`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-online-client.ps1`
- `/Users/minxiang/Projects/Win7POS/README.md`

## Check finali

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `node --test tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 113`, `pass 113`, `fail 0`. |
| Admin Web | `npm run typecheck` | `PASS` | `next typegen` completato; `tsc --noEmit` exit 0. |
| Admin Web | `npm run lint` | `PASS` | Exit 0, nessun warning dopo cleanup. |
| Admin Web | `npm run build` | `PASS_WITH_UPSTREAM_WARNING` | Build Next completato; route `/shop/pos` presente. Warning Node `DEP0205` da toolchain. |
| Admin Web | `npm run verify` | `PASS_WITH_UPSTREAM_WARNING` | Lint, typecheck, security scan e build completati; stesso warning Node `DEP0205`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `pwsh -File scripts/check-dialog-standards.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `pwsh -File scripts/check-pos-online-client.ps1` | `PASS` | HTTP client, TLS 1.2, DPAPI, config, dialog e heartbeat presenti; `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS_WITH_SDK_NOTICE` | `Compilazione completata`, `Avvisi: 0`, `Errori: 0`; SDK segnala workload verification notice non bloccante. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Cross-repo | Live Supabase/Win7POS E2E contro dati reali | `NOT_RUN_ENV_NOT_CONFIGURED` | Richiede shop/staff/device test reali e credenziali runtime; non necessario per dichiarare handoff code review. |

## Review/reconciliation Codex 2026-06-01

Verdict: `PASS_WITH_NOTES_READY_FOR_REVIEW`.

### Problemi trovati e correzioni applicate

| Area | Problema | Correzione | Evidence |
| --- | --- | --- | --- |
| Admin Web heartbeat | Il controllo heartbeat validava token sessione e trusted token, ma non falliva esplicitamente se la credential collegata alla sessione non combaciava con shop/device/staff della sessione. | Aggiunto `credentialMatchesSession` in `src/server/pos-auth/service.ts`; scanner e test TASK-021 aggiornati. | TDD red/green su `node --test tests/foundation/task-021-pos-backend-session-device.test.mjs`; finale `tests 5`, `pass 5`. |
| Win7POS scanner | `scripts/check-pos-online-client.ps1` non bloccava esplicitamente log di token/PIN/password. | Aggiunto pattern `sensitiveLogPattern` per `LogInfo/LogWarning/LogError` con token, credential, PIN e password. | TDD red/green su `node --test tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`; scanner Win7POS finale `ALL PASS`. |

### File modificati durante questa review

- `src/server/pos-auth/service.ts`
- `scripts/security-checks.mjs`
- `tests/foundation/task-021-pos-backend-session-device.test.mjs`
- `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`
- `/Users/minxiang/Projects/Win7POS/scripts/check-pos-online-client.ps1`
- `docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md`
- `docs/TASKS/EVIDENCE/TASK-022-023/README.md`
- `docs/MASTER-PLAN.md`

### Admin Web evidence review

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| Dashboard `/shop/pos` | `PASS` | Server Component, `force-dynamic`, integrata in Shop Admin via `getShopSectionForRequest("pos", ...)`; nessun `"use client"`. |
| Read model | `PASS` | `server-only`; auth con `resolveCurrentShopAdminShellAccess`; service-role solo server-side dopo auth; query filtrate con `.eq("shop_id", selectedShop.shopId)`. |
| Dati sensibili | `PASS` | Search mirata su dashboard/read model senza match per `token_hash`, `session_token_hash`, token runtime o service-role. |
| Dati mostrati | `PASS` | Solo `shop_devices`, `pos_device_credentials`, `pos_sessions`, `staff_accounts_safe`, `audit_logs` POS; no metriche vendite o dati finti. |
| Performance | `PASS` | Query aggregate in parallelo con limit sicuri: devices 100, credential/session/staff 200, audit 100; indici TASK-021 presenti per session/device/status/shop. |

### Win7POS evidence review

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| First login | `PASS` | Dialog `Collega POS online`; invia `shopCode`, `staffCode`, credential e metadata device verso `/api/pos/auth/first-login`. |
| Trusted device | `PASS` | Device id GUID random persistito; token salvati con `ProtectedData.Protect/Unprotect`; nessun fingerprint hardware sensibile. |
| Heartbeat | `PASS` | Startup heartbeat solo se base URL configurato e trusted state presente; deny/revoca cancella solo trusted state online, senza toccare dati locali. |
| Compatibilita | `PASS` | Build `net48` Release x86 completata con `Avvisi: 0`, `Errori: 0`; TLS 1.2 e timeout esplicito presenti. |
| Scope locale | `PASS` | Diff nullo su payment/refund/sales target controllati; login locale e first-run non sostituiti. |

### Supabase evidence review

| Comando/check | Esito | Evidence sintetica |
| --- | --- | --- |
| `supabase migration list --linked` | `PASS` | Migration locale/remota allineate, inclusa `20260601120000`. |
| `supabase db push --linked --dry-run` | `PASS` | `Remote database is up to date.` |
| `supabase gen types typescript --linked --schema public,app_private,graphql_public` + `diff -q` | `PASS` | Nessuna differenza con `src/lib/supabase/database.types.ts`. |
| `.env.local` redatto | `PASS_WITH_NOTES` | URL e publishable key presenti; `SUPABASE_SERVICE_ROLE_KEY` mancante, quindi E2E route handler locale non eseguibile in questa shell. |
| Dati test/cleanup | `NOT_RUN` | Nessun dato test creato; nessun cleanup dati necessario. |
| E2E live Win7POS + Admin Web | `NOT_RUN_ENV_NOT_CONFIGURED` | Mancano service-role locale e harness/dataset test con cleanup; non forzato per non creare dati persistenti fragili. |

### Gate finali rieseguiti nella review

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 113`, `pass 113`, `fail 0`. |
| Admin Web | `npm run typecheck` | `PASS` | `next typegen` completato; `tsc --noEmit` exit 0. |
| Admin Web | `npm run lint` | `PASS` | Exit 0, nessun output. |
| Admin Web | `npm run build` | `PASS_WITH_UPSTREAM_WARNING` | Build completata; route `/shop/pos` presente; warning Node `DEP0205` da toolchain. |
| Admin Web | `npm run verify` | `PASS_WITH_UPSTREAM_WARNING` | Lint/typecheck/security/build completati; stesso warning Node `DEP0205`. |
| Admin Web | `node --test tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`. |
| Admin Web | `node --test tests/foundation/task-021-pos-backend-session-device.test.mjs` | `PASS` | `tests 5`, `pass 5`, `fail 0`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `pwsh -File scripts/check-dialog-standards.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `pwsh -File scripts/check-pos-online-client.ps1` | `PASS` | Include `PASS: no sensitive POS online logs`; `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS` | `Compilazione completata`, `Avvisi: 0`, `Errori: 0`. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

### Stato git finale della review

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short` | `PASS_WITH_CHANGES` | Modifiche TASK-020/TASK-022_023 e correzioni review presenti; nessun file staged. |
| Admin Web | `git diff --stat` | `PASS_WITH_CHANGES` | Stat tracked aggiornata; file untracked TASK-020/TASK-022_023 non inclusi da git nella stat. |
| Admin Web | `git diff --cached --name-status` | `PASS` | Nessun output. |
| Win7POS | `git status --short` | `PASS_WITH_CHANGES` | File TASK-022_023 e scanner POS online presenti; nessun file staged. |
| Win7POS | `git diff --stat` | `PASS_WITH_CHANGES` | 5 file tracked modificati; file nuovi non tracciati elencati da status. |
| Win7POS | `git diff --cached --name-status` | `PASS` | Nessun output. |

### Classificazione finale

- `DONE_RECONCILED`: `NOT_DECLARED`.
- `PASS_WITH_NOTES`: implementazione e gate locali solidi; Supabase schema/typegen remoto verificato; manca E2E live locale per assenza di `SUPABASE_SERVICE_ROLE_KEY` e dataset/harness test con cleanup.
- Prossimo passo concreto per chiudere a `DONE`: configurare `SUPABASE_SERVICE_ROLE_KEY` solo lato server locale, predisporre shop/staff/device test dedicati con cleanup, avviare Admin Web locale e lanciare un harness E2E first-login + heartbeat + revoca/deny senza loggare token.

## Conferme correnti

- Nessun commit: `CONFIRMED_NOT_RUN`
- Nessun push: `CONFIRMED_NOT_RUN`
- Nessuno stage: `CONFIRMED_NOT_RUN`
- Nessuna modifica iOS/Android: `CONFIRMED`
- Nessun sales sync introdotto: `CONFIRMED`
- No sales sync: `CONFIRMED`
- no dati finti: `CONFIRMED`
- Nessun token/PIN/password hardcoded o loggato: `CONFIRMED_BY_STATIC_CHECKS`
- Nessun service-role client/browser: `CONFIRMED_BY_SECURITY_SCAN`
- Task pronto per review, non chiuso a `DONE`: `CONFIRMED_PASS_WITH_NOTES`

## Project checkpoint 2026-06-01 - parking E2E live

Verdict checkpoint: `PARKED_E2E_PENDING`.

TASK-022_023 resta `PASS_WITH_NOTES_READY_FOR_REVIEW`. Il residuo bloccato e il gate E2E live Supabase + Admin Web locale + Win7POS + dataset test + cleanup. Questo checkpoint non identifica un bug codice noto e non riprende il gate live.

### Check checkpoint

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short` | `PASS_WITH_EXISTING_CHANGE` | Solo `.env.example` modificato prima del checkpoint. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git status --short` | `PASS` | Nessun output; repo pulito nel checkpoint. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

### Decisione checkpoint

- E2E live TASK-022_023: `PARKED`, da riprendere solo con nuovo handoff esplicito.
- TASK-024 sales sync: `DEFERRED`, non implementato e non avviato.
- Prossimo sviluppo consigliato: `TASK-026 - Shop Admin product catalog foundation`.
- Dati test live: `NOT_CREATED`.
- Cleanup dati test live: `NOT_REQUIRED`.
- Commit/push/stage: `NOT_RUN`.

## DONE readiness check 2026-06-02

Verdict: `NOT_READY_FOR_DONE`.

TASK-022_023 non ha un bug codice noto e i gate locali/restanti scanner sono solidi, ma il criterio live parcheggiato non e stato sbloccato: E2E live Supabase + Admin Web + Win7POS + dataset test + cleanup resta `PARKED_E2E_PENDING`. TASK-029C non ha fornito una URL HTTPS Preview/non-production, quindi non ha prodotto nuova evidence E2E utilizzabile per chiudere TASK-022_023.

Check corrente aggiuntivo:

- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1`: `FAIL_CURRENT_SCANNER_NEEDS_RECONCILIATION` prima del follow-up; falliva su `first-login dialog does not call client` perche il flusso TASK-029 passa dal `PosOnlineBootstrapService` invece che dal dialog diretto TASK-022_023.

## Win7POS scanner reconciliation 2026-06-02

Verdict: `SCANNER_RECONCILED_E2E_STILL_PARKED`.

Il vecchio scanner `scripts/check-pos-online-client.ps1` e stato riallineato al flusso TASK-029:

- il dialog deve usare `PosOnlineBootstrapService`;
- `PosOnlineBootstrapService` deve chiamare `PosAdminWebClient.FirstLoginAsync`;
- PIN/password devono essere puliti in `finally`;
- trusted device token e session token devono passare dal DPAPI/trusted-device store;
- il mirror staff locale deve hashare la credential con `PinHelper`;
- token/PIN/password non devono essere loggati;
- la Base URL Admin Web non deve essere hardcoded a produzione.

Evidence Win7POS:

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS` | Scanner legacy riconciliato: dialog -> bootstrap service -> online client, DPAPI, hashing locale, no log sensibili, no Base URL production hardcoded. |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0, Errori: 0`. |
| `git diff --check` | `PASS` | Nessun output. |

Commit Win7POS: `d2c3d4b TASK-029 reconcile Win7POS online bootstrap`, push `main -> main`.

Decisione consigliata: mantenere `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW`. Lo scanner legacy non e piu un blocker locale, ma il gate E2E live Supabase + Admin Web + Win7POS + dataset test + cleanup resta `PARKED_E2E_PENDING` finche non viene eseguito o declassato esplicitamente dall'utente.
