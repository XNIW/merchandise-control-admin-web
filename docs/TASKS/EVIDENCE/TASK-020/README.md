# TASK-020 Evidence

## Stato corrente

- Task: `TASK-020 - Win7POS Integration Planning`
- Stato task: `DONE`
- Fase: `DONE_RECONCILED`
- Data apertura: `2026-06-01`
- Data review finale: `2026-06-01`
- Commit TASK-019 precedente: `73042d6`
- Commit TASK-020: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push TASK-020: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Verdict finale: `DONE`

## File creati/modificati

- `docs/TASKS/TASK-020-win7pos-integration-planning.md`
- `docs/TASKS/EVIDENCE/TASK-020/README.md`
- `docs/MASTER-PLAN.md`
- `scripts/security-checks.mjs`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-018-infrastructure-security-pos-foundation.test.mjs`
- `tests/foundation/task-020-win7pos-integration-planning.test.mjs`

## Letture obbligatorie

| Fonte | Esito | Note |
| --- | --- | --- |
| `AGENTS.md` | `PASS` | Protocollo italiano, lettura Master Plan/task/codice prima delle modifiche, no scope creep. |
| `CLAUDE.md` | `PASS` | Stati `IDLE/PLANNING/REVIEW`, Codex non marca `DONE`. |
| `README.md` | `PASS` | Limiti attuali: nessuna auth POS reale, nessuna integrazione POS reale. |
| `docs/MASTER-PLAN.md` | `PASS` | TASK-020 tracciato e poi riconciliato a `DONE_RECONCILED`; task attivo finale `NONE`. |
| `docs/TASKS/TASK-015*` | `PASS` | Shop Admin operativo, devices, staff, Sync Center read-only. |
| `docs/TASKS/TASK-016*` | `PASS` | Platform Admin, shop suspension/lifecycle e global device overview. |
| `docs/TASKS/TASK-017*` | `PASS` | Shop business completion, POS Staff e Sync Center senza POS runtime. |
| `docs/TASKS/TASK-018*` | `PASS` | Design-only mobile/POS enforcement e POS auth foundation. |
| `docs/TASKS/TASK-019*` | `PASS` | Credential foundation implementata senza login POS reale. |
| `docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md` | `PASS` | Foundation e flusso login futuro. |
| `docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md` | `PASS` | Enforcement shop/staff/device e offline edge cases. |
| `supabase/migrations/*` | `PASS` | Scan completo e lettura mirata schema Admin Web/staff/devices/sync. |
| `src/server/shop-admin/` | `PASS` | Lettura mirata staff/devices/history/action context. |
| `src/app/shop/` | `PASS` | Route Shop Admin staff/devices/sync/history/audit ispezionate via scan. |
| `src/components/shop/` | `PASS` | Navigazione/sezioni Shop Admin ispezionate via scan. |

## Win7POS repo e stato

| Comando/fonte | Esito | Evidence sintetica |
| --- | --- | --- |
| `find /Users/minxiang -maxdepth 5 ...` | `PASS` | Copia locale principale trovata in `/Users/minxiang/Projects/Win7POS`; trovate anche cache/tool worktree e dati app non usati come fonte primaria. |
| `git status --short --branch` in `/Users/minxiang/Projects/Win7POS` | `PASS` | `## main...origin/main`, nessuna modifica locale. |
| `git remote -v` in `/Users/minxiang/Projects/Win7POS` | `PASS` | `origin` punta a `https://github.com/XNIW/Win7POS.git`. |
| `git log --oneline -5` in `/Users/minxiang/Projects/Win7POS` | `PASS` | Commit ispezionato: `aa545fc Sconto`. |
| `git clone --depth 1 https://github.com/XNIW/Win7POS.git /tmp/win7pos-task-020-73042d6` | `PASS` | Clone completato in `/tmp`. |
| `git status --short --branch` in `/tmp/win7pos-task-020-73042d6` | `PASS` | `## main...origin/main`, nessuna modifica. |
| `rg --files` | `PASS` | Repo contiene WPF/Core/Data/Cli/installer/docs/scripts. |
| Scan networking | `PASS_WITH_NOTES` | `HttpClient`, `WebClient`, `HttpWebRequest`, `Supabase`, `Authorization`, `Bearer`: nessun client API applicativo trovato; match solo nomi dialog/override non networking. |
| Test project scan | `PASS_WITH_NOTES` | Nessun progetto test trovato; solo `scripts/reset-test-db.ps1` e CLI self-test. |

## Findings Win7POS

| Area | Stato | Evidence |
| --- | --- | --- |
| Stack | `FOUND` | WPF `net48`, x86, Windows 7 first; Core/Data `netstandard2.0`. |
| Entry point | `FOUND` | `App.xaml.cs` e `MainWindow.xaml.cs`. |
| First-run locale | `FOUND` | `FirstRunSetupDialog` crea primo admin se mancano utenti attivi. |
| Login locale | `FOUND` | `OperatorLoginDialog` + `OperatorSession.LoginAsync`. |
| PIN hash | `FOUND` | `PinHelper` PBKDF2/Rfc2898 + salt. |
| Lockout | `FOUND` | 5 tentativi, 900 secondi. |
| User status | `FOUND` | `users.is_active`. |
| Storage locale | `FOUND` | SQLite `C:\ProgramData\Win7POS\pos.db`, override `WIN7POS_DATA_DIR`. |
| Sales model | `FOUND` | `sales`, `sale_lines`, `Sale`, `SaleLine`, `SaleKind`. |
| Payment cash/card | `FOUND` | `paidCash`, `paidCard`, `PaymentViewModel`, `PosPaymentInfo`. |
| Refund/void | `FOUND` | `SaleKind.Refund`, `related_sale_id`, `voided_by_sale_id`, `voided_at`, `reason`. |
| Audit/security events | `FOUND` | `audit_log`, `security_events`, `SecurityEventCodes`. |
| Remote shop_code | `NOT_FOUND` | Nessun tenant remoto in Win7POS. |
| Remote staff_code | `NOT_FOUND` | Login usa username locale. |
| Trusted device/token | `NOT_FOUND` | Nessun device token o fingerprint remoto. |
| Sales sync | `NOT_FOUND` | Nessuna coda o client sync remoto. |
| API/networking | `NOT_FOUND` | Nessun client HTTP/API applicativo. |

## Findings Admin Web

| Area | Stato | Evidence |
| --- | --- | --- |
| Shop enforcement | `FOUND` | `shops.shop_status`: `active`, `pending_setup`, `suspended`, `archived`. |
| Staff enforcement | `FOUND` | `staff_accounts.status`, `credential_status`, `locked_until`, `session_invalidated_at`. |
| Device enforcement | `FOUND` | `shop_devices.status`, `last_seen_at`, revoke/reactivate RPC. |
| Audit | `FOUND` | `audit_logs` append-only, metadata redatti. |
| Sync Center | `FOUND_READ_ONLY` | `sync_events` owner-scoped; non e sales sync POS. |
| POS sessions | `NOT_FOUND` | Nessuna tabella/sessione runtime POS. |
| Device token | `NOT_FOUND` | Nessun token trusted device hash/revoca runtime. |
| POS sales schema | `NOT_FOUND` | Nessuna tabella/RPC per vendite POS. |
| Public POS login endpoint | `NOT_FOUND_BY_DESIGN` | Nessuna route creata in TASK-020. |

## Decisioni planning

- First login deve essere online-only.
- Trusted device deve usare token device revocabile, mai token raw nel backend.
- Uso quotidiano deve usare heartbeat/session refresh, non login completo ripetuto.
- Online enforcement deve verificare shop, staff, device e credential/session version.
- Offline mode deve essere limitato da grace policy, con coda vendite locale e quarantine.
- Sales sync deve essere idempotente per vendita locale e batch.
- Dashboard Shop Admin deve aggregare server-side per device e totale shop.
- TASK-020 non applica migration e non modifica runtime.

## Review finale

| Area | Verdict | Evidence sintetica |
| --- | --- | --- |
| Scope planning-only | `PASS` | Scan repo: nessuna migration `task_020`, nessuna route `src/app/api/pos`, nessuna route `src/app/pos`, nessuna cartella Win7POS vendorizzata. |
| Finding Win7POS | `PASS` | README, csproj, entry point, DB initializer, login, PIN, repository vendite e payment view model confermano i finding documentati. |
| NOT_FOUND Win7POS | `PASS` | Scan `HttpClient`, `WebClient`, `HttpWebRequest`, `Supabase`, `Authorization`, `Bearer`, `shop_code`, `staff_code`, trusted device/token e sync queue trova solo override auth locale, non networking/API. |
| Piano prodotto | `PASS` | First login online, trusted device, accesso quotidiano, PIN veloce opzionale, revoca, sospensione, rotation, lockout e offline grace coperti. |
| Backend futuro | `PASS` | Distinzione chiara tra `shops`, `staff_accounts`, `shop_devices`, `audit_logs`, `sync_events` gia esistenti e gap `pos_sessions`, token device, heartbeat, vendite/sync. |
| Sync vendite | `PASS` | Batch idempotente, local sale id/code, timestamp, total/cash/card/other, refund/void, queue, retry/backoff, quarantine, audit e performance coperti. |
| Dashboard futura | `PASS` | Device live, online/offline, last seen, vendite per device, cash/card per device, totale shop, ultimi sync, errori e audit POS coperti. |
| Harness | `PASS` | Foundation test TASK-020 e security scanner TASK-020 bloccano planning-only, no migration, no endpoint POS e no Win7POS vendorizzato. |

## Check TASK-020

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 104`, `pass 104`, `fail 0`. |
| `node --test tests/foundation/task-020-win7pos-integration-planning.test.mjs` | `PASS` | `tests 4`, `pass 4`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen` + `tsc --noEmit`, route types generated successfully. |
| `npm run lint` | `PASS` | `eslint` exit 0. |
| `npm run build` | `PASS_WITH_WARNING` | Build completed. Warning: Node `[DEP0205] module.register()` deprecation from toolchain. |
| `npm run verify` | `PASS_WITH_WARNING` | lint, typecheck, security scan and build passed. Same Node `[DEP0205]` warning during build. |
| `git diff --check` | `PASS` | Nessun whitespace/error diff rilevato. |
| `git diff --cached --name-only` | `PASS` | Output vuoto; nessun file staged. |
| `git status --short` | `PASS_WITH_EXPECTED_CHANGES` | Solo modifiche TASK-020 planning/evidence/foundation governance nel worktree; TASK-020 non committato per review. |
| `git -C /Users/minxiang/Projects/Win7POS status --short --branch` | `PASS` | `## main...origin/main`; nessuna modifica Win7POS. |

## Supabase TASK-020

- Migration TASK-020 create: `NOT_RUN_PLANNING_ONLY`.
- Migration push/apply TASK-020: `NOT_RUN_PLANNING_ONLY`.
- Supabase linked write: `NOT_RUN_PLANNING_ONLY`.
- Stato schema usato per planning: derivato da migration repo e dai check FASE 1 appena eseguiti.

## Conferme fuori scope

- Nessun login POS reale: `CONFIRMED`.
- Nessun endpoint pubblico POS: `CONFIRMED`.
- Nessuna modifica Win7POS: `CONFIRMED`.
- Nessuna modifica Android/iOS: `CONFIRMED`.
- Nessuna migration TASK-020 applicata: `CONFIRMED`.
- Nessun service-role client/browser: `CONFIRMED`.
- Nessun secret/token/password/PIN raw salvato: `CONFIRMED`.

## Rischi residui

- Windows 7 richiede verifica concreta TLS 1.2/certificati in TASK-023.
- Policy offline grace va approvata come decisione prodotto prima di execution.
- La scelta route Next.js vs RPC Supabase per POS auth deve essere chiusa in TASK-021.
- Win7POS non ha test project dedicato; TASK-023/TASK-024 dovranno introdurre harness o CLI self-test mirati.
- Sales sync richiede schema nuovo, quindi TASK-024 avra rischio migration/RLS significativo.

## Prossimo passo

Aprire `TASK-021 - POS backend session/device endpoints` come task separato. Commit/push di TASK-020 restano non eseguiti in questa review per richiesta esplicita dell'utente.
