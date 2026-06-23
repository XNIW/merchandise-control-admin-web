# TASK-081 Evidence - Win7POS Sales Sync, Revenue, Stock Sync and Dashboard

## Stato

- Stato task: `REVIEW`
- Fase handoff: `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Data apertura locale: `2026-06-22`
- Ultima verifica: `2026-06-23`
- Nessun commit, push, stage o deploy eseguito.
- Supabase apply eseguito solo su database locale con `supabase migration up --local`; nessun apply remoto/production.

## Scope validato

- Admin Web estende `POST /api/pos/sales/sync` con payload `pos-sales-ledger-v2`, pagamenti, fiscal status, refund/void, ledger signed CLP e stock movement.
- Win7POS mantiene vendite offline in outbox, invia batch idempotenti, non salva token raw nel payload outbox e conserva `ProductId` in refund/void per reversal stock.
- Shop Admin `/shop/pos` usa dati reali da Supabase: revenue giornaliera/mensile, recent sales, sync status e stock issues.
- Incassi non documentati/non fiscali restano nel ledger gestionale; la vista documentata e solo un filtro secondario.
- E2E locale TASK-081 crea dataset sintetico `TASK081_E2E_*`, esegue first-login POS reale, sync sales v2, duplicate/conflict, negative auth/payload, read model API autenticato, UI `/shop/pos` desktop/mobile, screenshot fuori repo e cleanup zero-attivi.
- Win7POS runtime harness CLI usa SQLite reale e `SaleRepository` per sale/refund/void, stock locale, outbox `acked/retry/failed_blocked` e protezione stock catalog con outbox pending; il trasporto HTTP WPF `PosSalesSyncService.TrySyncPendingAsync -> PosAdminWebClient.SalesSyncAsync` resta coperto da build/scanner statici e dall'E2E Admin Web, non da una prova fisica Win7 su questo host.

## Fix final-review applicati

- Parser Admin Web v2 reso stretto: schema ignoto o enum invalidi non cadono piu su fallback v1/`sale`/`other`.
- Retry duplicate batch ora risponde con `code: "success"` e `status: "duplicate"` includendo `posSaleId` esistenti.
- Duplicate retry riapplica/riconcilia idempotentemente gli stock movement prima dell'ack se un tentativo precedente era parziale.
- Ledger tax signed corretto per refund/void.
- Dettaglio vendita `/api/shop/pos/revenue/sale-detail` legge `pos_revenue_ledger_entries.amount_clp`, non righe positive `pos_sale_lines`.
- Migration TASK-081 locale: ledger e stock movement append-only, FK `restrict`, trigger anti update/delete, advisory lock su `movement_key`, check DB-side su `shop_inventory_sources`.
- Win7POS: `SaleKind.Void`, refund/void con `ProductId`, outbox payload redatto, retry `failed_blocked`, soglia max attempt, registri locali non filtrano piu `pdf_printed`.
- Addendum finale: read model stock warnings filtrato DB-side; Win7POS local void movement ora usa `void_reverse`; catalog pull preserva stock locale se esistono movimenti sales sync pending/retry; aggiunto harness E2E Playwright TASK-081 e CLI runtime Win7POS.
- Final alignment closure: client HTTP/DTO/sessione Admin Web Win7POS condivisi in Core; payload builder sales sync condiviso in Data e riusato dal servizio WPF e dal CLI; aggiunto `--task081-sales-sync-http-harness` che crea vendite locali SQLite, passa da outbox reale, chiama davvero `/api/pos/sales/sync`, marca ack, verifica duplicate/conflict e prova 401/403 retry senza perdita vendita. Aggiunto E2E Admin Web `TASK081_WIN7HTTP_*` che lancia il CLI Win7POS e verifica DB/API/UI `/shop/pos`. Creato release pack x86 win-x86 con manifest/checksum/runbook e `e_sqlite3.dll`.

## Subagenti / review findings

- Governance: trovato Master Plan incoerente (`IDLE`/`NESSUNO`); corretto a TASK-081 `REVIEW`.
- Integration contract: trovati void non inviati, refund stock reversal mancante, token raw in outbox, duplicate ack nullo, retry non bloccante, parser permissivo; corretti.
- Admin Web API: trovato duplicate retry senza `posSaleId` e rischio stock partial retry; corretto con lookup e repair idempotente.
- Supabase/RLS: trovati type/schema drift, RPC non serializzata, FK cascade, legacy product DB-side troppo permissivo; corretti nella migration/handler dove in scope.
- Revenue/ledger: trovato dettaglio vendita non ledger-backed e tax sign; corretti.
- Stock integrity: trovato refund/void reversal mancante e stock RPC error ack risk; corretti con `ProductId`, `void`, e repair duplicate.
- E2E alignment closure: subagenti hanno identificato dataset/harness mancanti, stock warning non DB-side, `void_reverse` locale mancante, rischio catalog pull vs outbox pending; corretti o coperti da harness.
- Security/redaction closure: audit read-only mirato sui file TASK-081 non ha trovato token reali, service-role hardcoded, password, production URL o device/session token non redatti.

## Evidence comandi

### Admin Web

```text
npm run lint
exit 0
```

```text
npm run typecheck
next typegen && rm -rf .next/types && tsc --noEmit
Generating route types...
✓ Types generated successfully
exit 0
```

```text
npm run security:scan
Security scan passed.
exit 0
```

```text
npm run test:foundation
rieseguito dopo aggiornamento Master Plan/TASK-081 governance
tests 461
pass 461
fail 0
exit 0
```

```text
npm run build
✓ Compiled successfully
Finished TypeScript
✓ Generating static pages
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npx eslint src/server/shop-admin/pos-revenue-read-model.ts tests/e2e/task-081-pos-revenue-e2e.spec.ts tests/foundation/task-081-pos-sales-revenue-stock-sync.test.mjs
exit 0
```

```text
node --test tests/foundation/task-081-pos-sales-revenue-stock-sync.test.mjs
✔ TASK-081 Admin Web sales sync stays strict, idempotent and ledger-backed
✔ TASK-081 Win7POS refund and void sync preserve product, redacted payload and failed_blocked retries
tests 2
pass 2
fail 0
exit 0
```

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3061 \
PLAYWRIGHT_WEB_SERVER_COMMAND='npm run start -- --hostname 127.0.0.1 --port 3061' \
PLAYWRIGHT_REUSE_SERVER=0 \
npm run test:task081:e2e
[test-target] PASS TEST_TARGET=local
[test-target] PASS Supabase target guardrails passed
1 passed
exit 0
```

E2E screenshot locali fuori repo:

- `/tmp/task081-e2e/task081-D688758D-desktop.png`
- `/tmp/task081-e2e/task081-D688758D-mobile.png`
- Run precedenti conservati: `/tmp/task081-e2e/task081-DC4E23FA-desktop.png`, `/tmp/task081-e2e/task081-DC4E23FA-mobile.png`

```text
TASK032_POS_E2E_BASE_URL=http://localhost:3055 npm run test:pos-local-harness
status PASS_NEGATIVE_HARNESS_ONLY
negative cases 5/5 ok
positive not applicable to TASK-081; superseded by dedicated TASK-081 Playwright E2E
exit 0
```

Nota: il blocco TASK-032 sopra resta storico. Il positivo TASK-081 e stato coperto dal Playwright E2E dedicato indicato nel blocco precedente.

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3062 \
PLAYWRIGHT_WEB_SERVER_COMMAND='npm run start -- --hostname 127.0.0.1 --port 3062' \
PLAYWRIGHT_REUSE_SERVER=0 \
npm run test:task081:win7-http
[test-target] PASS TEST_TARGET=local
[test-target] PASS Supabase target guardrails passed
chromium-desktop TASK-081 Win7POS real HTTP sales sync, revenue UI, stock and cleanup E2E
1 passed
exit 0
```

E2E Win7POS HTTP locale:

- Dataset sintetico: `TASK081_WIN7HTTP_*`.
- Flusso: Admin Web first-login reale -> session JSON temporaneo fuori repo -> `dotnet run --project /Users/minxiang/Projects/Win7POS/src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-http-harness --base-url http://127.0.0.1:3062 --session-json <tmp>`.
- Vendite accettate da Win7POS HTTP harness: cash documentata, cash non documentata, card documentata, refund, void, other mese precedente.
- Verifiche: 6 sales accepted, 6 batch accepted, ledger cash/card/other/refund/void, stock movements applied, product stock finale `7`, duplicate `duplicate_batch`, conflict `conflict_batch`, auth denied locale in retry, API revenue oggi/mese/anno e UI desktop/mobile.
- Screenshot locali fuori repo:
  - `/tmp/task081-win7pos-http/task081-win7http-E8AD0A60-desktop.png`
  - `/tmp/task081-win7pos-http/task081-win7http-E8AD0A60-mobile.png`

### Supabase locale

```text
supabase --version
2.107.0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local
Applying migration 20260622160000_mobile_shop_context_switcher.sql...
Applying migration 20260622213000_task_081_pos_revenue_stock_sync.sql...
Local database is up to date.
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public --fail-on warning
No schema errors found
exit 0
```

```text
Query locale pg_constraint/pg_trigger/pg_get_functiondef/pg_indexes
ledger FK delete rule: restrict/no-action only for sale, batch, shop, shop_device; set-null only for optional product/session/staff
append-only triggers: pos_revenue_ledger_entries_no_update_delete, pos_sale_stock_movements_no_update_delete
RPC contains pg_advisory_xact_lock: true
RPC contains shop_inventory_sources owner mapping: true
TASK-081 indexes present: true
exit 0
```

`supabase db diff --local --schema public --use-migra` e stato eseguito e ha completato lo shadow apply senza errori; non e usato come no-drift gate perche il DB locale contiene migration locali non presenti in remote e produce diff non vuoto.

### Win7POS

```text
dotnet build src/Win7POS.Core/Win7POS.Core.csproj -c Release
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet build src/Win7POS.Data/Win7POS.Data.csproj -c Release
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet build src/Win7POS.Cli/Win7POS.Cli.csproj -c Release
Avvisi: 4
Errori: 0
Warning NU1903 su System.IO.Packaging 6.0.0 preesistente.
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-harness
TASK-081 sales sync harness: PASS
sales=3 stock=10 outbox=acked/retry/failed_blocked
exit 0
Warnings: NU1903 su System.IO.Packaging 6.0.0 preesistente.
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- \
  --task081-sales-sync-http-harness \
  --base-url http://127.0.0.1:3060 \
  --session-json <temporaneo-generato-da-Playwright>
TASK-081 Win7POS HTTP sales sync harness: PASS
accepted=6 pending_after_accept=0 duplicate=ok conflict=ok auth_denied_retry=1 local_stock_after_accept=7
exit 0
Warnings: NU1903 su System.IO.Packaging 6.0.0 preesistente.
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86
Win7POS.Wpf -> .../bin/x86/Release/net48/Win7POS.Wpf.exe
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet publish src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -r win-x86 --self-contained false
Win7POS.Wpf -> .../bin/x86/Release/net48/win-x86/publish/
exit 0
```

```text
scripts/win7pos/validate-drop.sh --source /Users/minxiang/Projects/Win7POS/dist/TASK-081/Win7POS-TASK081-HTTP-20260623-113808 --expect-config
OK: found Win7POS.Wpf.exe
OK: found Win7POS.Wpf.exe.config
OK: Win7POS.Core.dll
OK: Win7POS.Data.dll
Native SQLite candidates: e_sqlite3.dll
Asset check: OK Assets/sii_qrcode.png
exit 0
```

```text
scripts/win7pos/prepare-test-drop.sh --execute --source /Users/minxiang/Projects/Win7POS/dist/TASK-081/Win7POS-TASK081-HTTP-20260623-113808 --target .win7pos-vm/drop/Win7POS
Drop ready: /Users/minxiang/Projects/Win7POS/.win7pos-vm/drop/Win7POS
VM_DROP_COUNT=42
PHYSICAL_DROP_COUNT=42
exit 0
```

Release pack TASK-081 Win7POS HTTP:

- Cartella: `/Users/minxiang/Projects/Win7POS/dist/TASK-081/Win7POS-TASK081-HTTP-20260623-113808`
- Zip: `/Users/minxiang/Projects/Win7POS/dist/TASK-081/Win7POS-TASK081-HTTP-20260623-113808.zip`
- Outbox bridge: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-081-win7pos-http-release-20260623-113808`
- Manifest: `MANIFEST-TASK081.txt`
- Checksum: `SHA256SUMS.txt`
- Runbook: `RUNBOOK-TASK081-WIN7POS-HTTP.md`
- File pack binari: 39 prima di manifest/runbook/checksum; 42 nel drop operativo.
- `Win7POS.Wpf.exe` sha256: `1bdcdfb4a07e3a246f03f653a5b03a3c0a42ee961045be7be58092b61218f6ae`
- `e_sqlite3.dll` sha256: `5ea34b0e209d5115b19ff56bc456ec9f9fa8b05ee373387b1f620d30c11bf1b2`
- Zip sha256: `de393e1f4b5be18cf18aca0c42027feac71bc8d47a33309baa459045336702c1`

```text
scripts/win7pos/vm/discover-vm-host.sh
VM_HOST_FOUND
VM_CLI_FOUND
VM_FILES_FOUND
utmctl list:
Windows 7 stopped
Windows 7 stopped
exit 0
```

```text
scripts/win7pos/physical-win7/collect-physical-win7-output.sh --bridge-root /Users/minxiang/Projects/Win7POSBridge
Mode: dry-run
Run with --execute to collect.
exit 0
```

```text
scripts/win7pos/physical-win7/send-physical-win7-job.sh --bridge-root /Users/minxiang/Projects/Win7POSBridge --job env-report
Mode: dry-run
Run with --execute to send the job.
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-client.ps1
=== RESULT: ALL PASS ===
```

```text
pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1
=== RESULT: ALL PASS ===
```

```text
pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1
=== RESULT: ALL PASS ===
```

```text
pwsh -NoProfile -File scripts/check-dialog-standards.ps1
=== RESULT: ALL PASS ===
```

## File toccati

Admin Web:

- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-038-pos-manager-web-login-platform-provisioning-permissions-revenue-gate.md`
- `docs/TASKS/TASK-081-win7pos-sales-revenue-stock-sync.md`
- `docs/TASKS/EVIDENCE/TASK-081/INTEGRATION-CONTRACT.md`
- `docs/TASKS/EVIDENCE/TASK-081/README.md`
- `docs/TASKS/EVIDENCE/TASK-081/TEST-MATRIX.md`
- `package.json`
- `scripts/security-checks.mjs`
- `src/app/api/shop/pos/revenue/route.ts`
- `src/app/api/shop/pos/revenue/sale-detail/route.ts`
- `src/app/shop/pos/page.tsx`
- `src/app/shop/pos/PosRevenueDashboard.tsx`
- `src/components/shop/shopSections.ts`
- `src/i18n/dictionaries.ts`
- `src/server/pos-auth/sales-sync.ts`
- `src/server/shop-admin/pos-revenue-read-model.ts`
- `supabase/migrations/20260604035308_task_038_pos_manager_web_login.sql`
- `supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql`
- `supabase/migrations/20260604214112_task_041_pos_sales_sync_foundation.sql`
- `supabase/migrations/20260622213000_task_081_pos_revenue_stock_sync.sql`
- `tests/e2e/task-081-win7pos-http-e2e.spec.ts`
- `tests/e2e/task-081-pos-revenue-e2e.spec.ts`
- `tests/foundation/shop-admin-shell.test.mjs`
- `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`
- `tests/foundation/task-038-pos-manager-web-login.test.mjs`
- `tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs`
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`
- `tests/foundation/task-081-pos-sales-revenue-stock-sync.test.mjs`

Win7POS:

- `scripts/check-pos-catalog-pull.ps1`
- `scripts/check-pos-online-client.ps1`
- `src/Win7POS.Core/Models/RefundModels.cs`
- `src/Win7POS.Core/Models/Sale.cs`
- `src/Win7POS.Core/Models/SaleKind.cs`
- `src/Win7POS.Core/Online/PosAdminWebClient.cs`
- `src/Win7POS.Core/Online/PosAdminWebOptions.cs`
- `src/Win7POS.Core/Online/PosTrustedDeviceSession.cs`
- `src/Win7POS.Data/DbInitializer.cs`
- `src/Win7POS.Data/Online/PosSalesSyncRequestBuilder.cs`
- `src/Win7POS.Data/Repositories/ProductRepository.cs`
- `src/Win7POS.Data/Repositories/SaleRepository.cs`
- `src/Win7POS.Cli/Program.cs`
- `src/Win7POS.Wpf/Pos/DailyReportView.xaml`
- `src/Win7POS.Wpf/Pos/Dialogs/DailyReportDialog.xaml`
- `src/Win7POS.Wpf/Pos/Dialogs/DailyReportViewModel.cs`
- `src/Win7POS.Wpf/Pos/Dialogs/RefundViewModel.cs`
- `src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterDialog.xaml`
- `src/Win7POS.Wpf/Pos/Dialogs/SalesRegisterViewModel.cs`
- `src/Win7POS.Wpf/Pos/Dialogs/ShopSettingsDialog.xaml`
- `src/Win7POS.Wpf/Pos/Dialogs/ShopSettingsDialog.xaml.cs`
- `src/Win7POS.Wpf/Pos/Dialogs/ShopSettingsViewModel.cs`
- `src/Win7POS.Wpf/Pos/Online/PosSalesSyncService.cs`
- `src/Win7POS.Wpf/Pos/Online/PosTrustedDeviceStore.cs`
- `src/Win7POS.Wpf/Pos/PosWorkflowService.cs`
- `src/Win7POS.Wpf/Printing/WindowsSpoolerReceiptPrinter.cs`

## Non eseguiti / rischi residui

- `NOT_RUN_HARDWARE_NOT_AVAILABLE`: POS fisico Windows 7, stampante reale, cassetto/driver e rete offline reale non disponibili su questo host.
- `NOT_RUN_FORBIDDEN_BY_TASK`: Supabase remote/staging/production apply, deploy staging/production, commit, push e stage non eseguiti.
- `NOT_RUN_EXTERNAL_WIN7_GUEST_RUNTIME`: il trasporto HTTP reale Win7POS -> Admin Web e verificato da CLI locale contro Admin Web non-prod; non e stato avviato un guest/fisico Windows 7 per smoke runtime perche `utmctl list` mostra le VM Windows 7 `stopped` e il bridge fisico e stato lasciato in dry-run.
- `RISK_LOW`: Win7POS CLI build segnala NU1903 su `System.IO.Packaging 6.0.0`; non introdotto dal fix TASK-081.

## Handoff

- Fase proposta: `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`.
- Non marcare `DONE` senza conferma esplicita utente.
- Criteri accettazione tecnici: passati con note `NOT_RUN` sopra.
- Prossima review consigliata: prova fisica Win7POS su Windows 7 con vendita sale/refund/full void, reconnect, stampante e rete intermittente.
