# TASK-022_023 - POS live dashboard + Win7POS first login trusted device

## Stato

- Stato: `REVIEW`
- Fase: `REVIEW`
- Responsabile corrente: `REVIEWER`
- Execution: `COMPLETED`
- Review: `CODEX_RECONCILIATION_COMPLETED_AWAITING_USER_CONFIRMATION`
- Verdict corrente: `PASS_WITH_NOTES_READY_FOR_REVIEW`
- Data apertura: `2026-06-01`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-022-023/README.md`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Git push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_RUN_USER_REQUESTED_NO_STAGE`

TASK-022_023 unisce due task pianificati ma resta phase-gated:

1. TASK-023: validare e integrare il client Win7POS minimo contro gli endpoint TASK-021.
2. TASK-022: aggiungere una dashboard POS live minimale e read-only nello Shop Admin.

Il task prepara handoff a `REVIEW`. Non dichiara stati chiusi senza review e conferma esplicita utente.

## Obiettivo

Implementare la prima integrazione POS reale tra Admin Web e Win7POS:

- Win7POS first login online con `shop_code`, `staff_code` e PIN/password;
- registrazione trusted device;
- salvataggio locale sicuro di device/session token;
- heartbeat/session refresh;
- dashboard POS live Shop Admin basata solo su dati reali Supabase gia disponibili;
- documentazione, evidence e harness aggiornati.

## Scope incluso

- Client HTTP Win7POS compatibile .NET Framework 4.8 / Windows 7.
- Configurazione base URL Admin Web senza URL produzione hardcoded.
- Device identifier stabile non invasivo.
- Storage token con DPAPI `ProtectedData`.
- First login online verso `POST /api/pos/auth/first-login`.
- Heartbeat verso `POST /api/pos/session/heartbeat`.
- UI Win7POS minima per collegare il dispositivo senza ridisegnare il POS.
- Dashboard Shop Admin read-only sotto `/shop/pos`.
- Read model server-only per `shop_devices`, `pos_device_credentials`, `pos_sessions`, `staff_accounts_safe` e audit POS redatto.
- Test/harness statici per Admin Web e Win7POS.
- Evidence con check reali o motivazioni `NOT_RUN`/`PASS_WITH_NOTES`.

## Fuori scope

- TASK-024 sales sync.
- No sales sync.
- Import/export vendite.
- Tabelle vendite POS.
- CRUD vendite.
- Dashboard con metriche inventate.
- Dati finti, seed o placeholder presentati come live.
- no dati finti.
- Refactor grande Win7POS.
- Modifiche iOS/Android/Cash Register System.
- Nuove dipendenze senza motivo esplicito.
- Service-role key lato client/browser.
- Token device/session, PIN o password in chiaro.
- Commit, push o stage.

## Letture eseguite prima delle modifiche

### Admin Web

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `.env.example`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-020-win7pos-integration-planning.md`
- `docs/TASKS/EVIDENCE/TASK-020/README.md`
- `docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md`
- `docs/TASKS/EVIDENCE/TASK-021/README.md`
- `src/app/api/pos/auth/first-login/route.ts`
- `src/app/api/pos/session/heartbeat/route.ts`
- `src/server/pos-auth/service.ts`
- `src/server/pos-auth/tokens.ts`
- `src/lib/supabase/admin.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260601120000_task_021_pos_sessions_devices.sql`
- `src/app/shop/*`, `src/components/shop/*`, `src/server/shop-admin/*`
- test foundation TASK-014, TASK-018, TASK-020, TASK-021
- `scripts/security-checks.mjs`
- guide locali Next.js in `node_modules/next/dist/docs/01-app/`

### Win7POS

- `AGENTS.md`
- `README.md`
- `Win7POS.slnx`
- `src/Win7POS.Wpf/Win7POS.Wpf.csproj`
- `src/Win7POS.Core/Win7POS.Core.csproj`
- `src/Win7POS.Data/Win7POS.Data.csproj`
- `src/Win7POS.Wpf/App.xaml.cs`
- `src/Win7POS.Wpf/MainWindow.xaml.cs`
- `src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml[.cs]`
- `src/Win7POS.Wpf/Pos/Dialogs/FirstRunSetupDialog.xaml.cs`
- `src/Win7POS.Core/AppPaths.cs`
- `src/Win7POS.Core/PosPaths.cs`
- `src/Win7POS.Data/DbInitializer.cs`
- `src/Win7POS.Data/Repositories/SettingsRepository.cs`
- `src/Win7POS.Wpf/Infrastructure/FileLogger.cs`
- `src/Win7POS.Wpf/Infrastructure/AppSettingKeys.cs`
- `docs/DIALOG_STANDARD.md`
- `scripts/check-dialog-standards.ps1`

## Pre-flight

### Admin Web

- Branch iniziale: `main`.
- `git status --short`: modifiche locali preesistenti su `.env.example`, `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`, e file TASK-020 non tracciati.
- `git diff --check`: `PASS`, nessun output.
- `git diff --stat`: `.env.example` e test TASK-018 con 2 insertions / 1 deletion.
- `git diff --cached --name-status`: `PASS`, nessun output.

### Win7POS

- Branch iniziale: `main`.
- Commit iniziale: `aa545fc148d395cbfc56e3fd96e04a0c119e9bc0`.
- `git status --short --branch`: `## main...origin/main`.
- `git diff --check`: `PASS`, nessun output.
- `git diff --stat`: `PASS`, nessun output.
- `git diff --cached --name-status`: `PASS`, nessun output.

## Piano di implementazione

1. Scrivere test/harness statici TASK-022_023 e verificare RED.
2. Aggiornare Master Plan, task doc ed evidence iniziale.
3. Implementare Win7POS:
   - configurazione Admin Web base URL;
   - DTO e client HTTP;
   - TLS 1.2;
   - device identifier stabile;
   - storage DPAPI;
   - dialog first login;
   - heartbeat all'avvio/trusted session refresh;
   - messaggi sicuri e no token/PIN/password in log.
4. Implementare Admin Web:
   - read model POS live server-only;
   - route `/shop/pos`;
   - navigation Shop Admin;
   - dashboard read-only con empty/error states;
   - nessuna metrica vendite.
5. Aggiornare security scanner e foundation tests.
6. Eseguire check richiesti e aggiornare evidence finale.

## Criteri di accettazione

- Win7POS chiama first-login con `shop_code`, `staff_code`, credential e metadata device minimali.
- Win7POS salva device/session token protetti con DPAPI, non in chiaro.
- Win7POS forza/supporta TLS 1.2 e timeout espliciti.
- Win7POS heartbeat gestisce success/deny/errori senza bypass silenzioso.
- Login locale, first-run admin locale, SQLite, vendite/refund/void/cash/card restano preservati.
- Admin Web mostra dashboard POS live nello Shop Admin, filtrata per shop corrente.
- Dashboard usa solo dati reali da tabelle esistenti TASK-021/staff/device/audit.
- Dashboard non mostra token, PIN, password, hash o secret.
- Nessun sales sync, tabella vendite o metrica vendite introdotta.
- Check Admin Web e Win7POS eseguiti o motivati.
- Nessun commit, push o stage.

## Rischi residui previsti

- La validazione end-to-end live con Supabase richiede credenziali runtime, staff di test e device test reali; non e stata eseguita in questa execution.
- TASK-024 sales sync resta separato e non viene sbloccato automaticamente.

## Review/reconciliation Codex 2026-06-01

- Verdict: `PASS_WITH_NOTES_READY_FOR_REVIEW`.
- Correzioni applicate durante la review:
  - hardening heartbeat backend: la credential trusted device ora deve combaciare esplicitamente con sessione, shop, device e staff prima di accettare heartbeat;
  - scanner Admin Web aggiornato per bloccare regressioni su quel binding;
  - scanner Win7POS aggiornato per bloccare log di token device/sessione, PIN/password e campi credential sensibili.
- Gate rieseguiti: Admin Web `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify`, test TASK-021/TASK-022_023 e `git diff --check`; Win7POS dialog scanner, POS online scanner, build Release x86 e `git diff --check`.
- Supabase verificato con CLI linked: migration remota allineata, `db push --linked --dry-run` senza pending migration, typegen remoto allineato quando generato con schemi `public,app_private,graphql_public`.
- E2E live Supabase + Win7POS: `NOT_RUN_ENV_NOT_CONFIGURED`. `.env.local` contiene URL/key pubblica ma non `SUPABASE_SERVICE_ROLE_KEY`; non sono stati creati dati test persistenti senza harness/cleanup dedicati.
- Stato mantenuto a `REVIEW`: Codex non marca `DONE`; serve review/decisione utente esplicita.

## Execution summary

- Win7POS implementa client HTTP opzionale verso Admin Web con TLS 1.2, timeout esplicito, first login online, trusted device store DPAPI e heartbeat di refresh sessione all'avvio.
- Admin Web aggiunge `/shop/pos`, voce Shop Admin `POS Live` e read model server-only/read-only filtrato per shop corrente.
- Dashboard usa solo tabelle reali esistenti: `shop_devices`, `pos_device_credentials`, `pos_sessions`, `staff_accounts_safe`, `audit_logs`.
- Nessun sales sync, nessuna tabella vendite POS, nessun dato finto e nessun token/hash/secret esposto in UI.
- Security scanner e foundation tests sono stati aggiornati per coprire TASK-022_023.
- Nessun commit, push o stage eseguito.

## Handoff a REVIEW

- Stato execution: `COMPLETED`
- Stato review: `CODEX_RECONCILIATION_COMPLETED_AWAITING_USER_CONFIRMATION`
- Verdict execution: `PASS_WITH_NOTES_READY_FOR_REVIEW`
- Evidence completa: `docs/TASKS/EVIDENCE/TASK-022-023/README.md`
- Condizione di chiusura: review positiva e conferma esplicita utente.
