# TASK-081 Test Matrix

Legenda stato: `PENDING`, `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED_EXTERNAL`.

| # | Scenario | Repo | Verifica eseguita | Risultato | Stato |
|---:|---|---|---|---|---|
| 1 | Governance task attivo e handoff | Admin Web | Master Plan/task/evidence aggiornati, foundation mirato TASK-081 | TASK-081 attivo `REVIEW`, fase `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`, non `DONE`; TASK-081 foundation mirato `2/2` | `PASS` |
| 2 | POS bootstrap/sessione trusted | Admin Web, Win7POS | `npm run security:scan`, `check-pos-online-bootstrap.ps1`, `check-pos-online-client.ps1` | security scan passed; scanner Win7POS `ALL PASS` | `PASS` |
| 3 | Catalog pull resta bounded e compatibile | Admin Web, Win7POS | `check-pos-catalog-pull.ps1`, `npm run test:foundation` | scanner `ALL PASS`; foundation `461/461` | `PASS` |
| 4 | Shop data read-only Win7POS | Win7POS | WPF x86 build, `check-dialog-standards.ps1`, review ShopSettings | build `0 errori`; dialog standards `ALL PASS` | `PASS` |
| 5 | Shop data read-only Shop Admin | Admin Web | existing settings boundary, `npm run test:foundation` | Master Console resta owner delle mutazioni shop; foundation `461/461` | `PASS` |
| 6 | Sales sync v2 payload/handler strict | Admin Web | `npm run typecheck`, `npm run security:scan`, `task-081-pos-sales-revenue-stock-sync.test.mjs` | parser v2 strict, enum invalidi rifiutati, scanner passed | `PASS` |
| 7 | Duplicate retry/idempotency response | Admin Web | foundation TASK-081 test, static review handler | duplicate batch risponde `code: "success"`, sale `duplicate`, `posSaleId` esistente | `PASS` |
| 8 | Stock movement idempotente e retry repair | Admin Web/Supabase | foundation TASK-081 test, `supabase migration up --local`, pg queries locali | advisory lock presente, duplicate repair presente, trigger append-only presenti | `PASS` |
| 9 | Win7POS offline sale + outbox | Win7POS | Core/Data/CLI/WPF Release builds + `--task081-sales-sync-harness` + HTTP harness | WPF `0 errori`; CLI harness `PASS`, sales=3, stock=10, outbox acked/retry/failed_blocked; HTTP harness accepted=6 pending_after_accept=0; CLI build warning NU1903 preesistente | `PASS` |
| 10 | Win7POS reconnect/retry/quarantine | Win7POS | WPF build + foundation TASK-081 test + CLI harness + HTTP harness | retry/backoff, `failed_blocked`, max attempt, payload redatto e status DB runtime verificati; HTTP 401/403 resta retry senza perdita vendita | `PASS` |
| 11 | Refund/full void stock reversal | Win7POS/Admin Web | WPF build + foundation TASK-081 test + sales-sync handler + CLI harness | `SaleKind.Void`, `ProductId` preservato, `stockQuantityDelta` reversal, server e locale `void_reverse` | `PASS` |
| 12 | Ledger signed revenue | Admin Web/Supabase | typecheck, foundation TASK-081 test, local migration lint | ledger CLP signed, tax refund/void negative, detail API ledger-backed | `PASS` |
| 13 | Dashboard incasso oggi/mese/anno | Admin Web | build/lint mirati + TASK-081 Playwright E2E locale + TASK-081 Win7POS HTTP E2E | `/shop/pos` desktop/mobile e API revenue autenticata verificati su dati sintetici reali Admin Web e su vendite arrivate dal CLI Win7POS HTTP | `PASS` |
| 14 | No secret/service-role leak | Entrambi | `npm run security:scan`, Win7POS PowerShell scanners | Admin Web security passed; Win7POS scanners `ALL PASS` | `PASS` |
| 15 | Supabase locale TASK-081 | Admin Web/Supabase | `supabase migration up --local`, `supabase db lint --local --schema public --fail-on warning`, pg queries | migration locale applicata; lint no schema errors; oggetti TASK-081 presenti | `PASS` |
| 16 | POS local negative harness | Admin Web | TASK-081 Playwright E2E locale | schema/date/enum invalidi, malformed JSON, body oversize, device/staff/shop/session/cross-shop negati | `PASS` |
| 17 | POS local positive harness | Admin Web/Supabase | TASK-081 Playwright E2E locale | dataset sintetico `TASK081_E2E_*`, first-login, sales sync, duplicate, conflict, stock warnings, browser UI, cleanup zero-attivi | `PASS` |
| 18 | Win7POS real HTTP positive harness | Admin Web/Supabase/Win7POS | `npm run test:task081:win7-http` | dataset `TASK081_WIN7HTTP_*`, first-login, CLI Win7POS HTTP harness, 6 sales accepted, duplicate/conflict/auth-denied retry, stock final 7, API/UI desktop/mobile, cleanup zero-attivi | `PASS` |
| 19 | Win7POS release pack x86 | Win7POS | `dotnet publish ... -r win-x86`, `validate-drop.sh`, `prepare-test-drop.sh` | pack `dist/TASK-081/Win7POS-TASK081-HTTP-20260623-113808`, zip/checksum/runbook, `e_sqlite3.dll` presente, VM/physical drop count 42 | `PASS` |
| 20 | POS fisico/guest Windows 7, stampante, rete offline reale | Win7POS | discovery/dry-run only | UTM trovato ma `utmctl list` mostra VM Windows 7 `stopped`; bridge fisico solo dry-run; smoke guest/fisico non avviato | `NOT_RUN` |
| 21 | Supabase remote/staging/production apply e deploy | Admin Web | vietato dallo scope | nessun apply remoto/deploy eseguito | `NOT_RUN` |

## Gate Log

### Gate 1 - Contract Freeze

- File: `INTEGRATION-CONTRACT.md`, `TEST-MATRIX.md`.
- Esito: contratto payload/response/idempotenza/source of truth definito prima delle patch finali.

### Gate 2 - Fix-All Review

- Fix applicati: parser strict, duplicate ack con `posSaleId`, stock duplicate repair, append-only ledger/stock, tax sign, sale detail ledger-backed, Win7POS void/refund product preservation, outbox redaction, retry `failed_blocked`.
- Esito: Admin Web lint/typecheck/security/foundation/build pass; Win7POS Release WPF x86 pass; Supabase local apply/lint pass.

### Gate 3 - E2E Alignment Closure

- Fix applicati: Playwright E2E TASK-081, package script `test:task081:e2e`, stock warning DB-side, Win7POS `void_reverse`, catalog stock preservation con pending outbox, CLI runtime harness.
- Esito: TASK-081 E2E `1 passed`; TASK-081 foundation `2/2` pass; Admin Web build pass; Win7POS CLI harness pass; WPF x86 build pass.

### Gate 4 - Final HTTP/Release Closure

- Fix applicati: client/DTO/sessione Win7POS condivisi in Core, builder payload sales sync condiviso in Data, WPF e CLI allineati sullo stesso builder, CLI `--task081-sales-sync-http-harness`, Playwright `test:task081:win7-http`, release pack x86 win-x86 con manifest/checksum/runbook.
- Esito: Win7POS HTTP E2E `1 passed`; CLI HTTP harness `accepted=6 pending_after_accept=0 duplicate=ok conflict=ok auth_denied_retry=1`; publish/drop validate pass; UTM/physical bridge non avviati per runner esterno non attivo.

### Gate 5 - Handoff

- Stato proposto: `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`.
- Non `DONE`: serve conferma esplicita utente; prova fisica Win7POS/hardware resta nota esterna non eseguibile su questo host.
