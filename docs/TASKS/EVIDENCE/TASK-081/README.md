# TASK-081 Evidence - Win7POS Sales Sync, Revenue, Stock Sync and Dashboard

## Stato

- Stato task: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Fase handoff: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Data apertura locale: `2026-06-22`
- Ultima verifica: `2026-06-23` final review / DONE reconciliation
- Nessun commit, push, stage o deploy eseguito.
- Supabase apply eseguito solo su database locale con `supabase migration up --local`; nessun apply remoto/production.

## Evidenza corrente final review / DONE reconciliation - 2026-06-23

Questa e la sezione corrente per il prompt `TASK-081 FINAL REVIEW / DONE RECONCILIATION`.
Il risultato finale e `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`.

### Review finale

- Difetti repo-controllabili trovati e corretti: rimosso da `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/PaymentView.xaml.cs` un commento legacy `SII Web`/area fiscale disattivata; aggiunto `PendingSalesText` al tooltip sync della shell WPF; rimossa dall'UI operatore la stampa del path assoluto del PDF boleta.
- Nessun commit, push, stage, deploy production o Supabase production apply.
- Nessun pass fisico Windows 7 e nessun runtime fisico completo dichiarati.
- Win7 physical/VM runtime: `EXTERNAL_TEST_PENDING`.
- Residuo fisico gia documentato: UTM/VM restano `stopped` nei tentativi precedenti, start in timeout, bridge runner non attivo e nessun app launch reale.

### Gate finali rieseguiti

```text
npm run lint
exit 0
```

```text
npm run typecheck
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
tests 462
pass 462
fail 0
exit 0
```

```text
npm run build
✓ Compiled successfully
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run verify
lint/typecheck/security:scan/build: PASS
exit 0
```

```text
npm run test:task081:e2e
1 passed
exit 0
```

```text
npm run test:task081:win7-http
1 passed
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --local
Local/Remote allineati fino a 20260622213000
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local
Local database is up to date.
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public,app_private --fail-on error
No schema errors found
exit 0
```

```text
dotnet build src/Win7POS.Cli/Win7POS.Cli.csproj -c Release
Avvisi: 4
Errori: 0
Warnings: NU1903 System.IO.Packaging 6.0.0 preesistenti.
exit 0
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-harness
TASK-081 sales sync harness: PASS
sales=3 stock=10 outbox=acked/retry/failed_blocked
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-shop-cache-harness
CACHE CHECK: official shop snapshot persisted, refreshed, and read offline.
TEST PASS
exit 0
```

Scanner Win7POS:

- `pwsh -NoProfile -File scripts/check-pos-online-client.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-dialog-standards.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-shop-data-readonly.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-sync-status-ux.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-revenue-copy.ps1`: `=== RESULT: ALL PASS ===`

### Release pack/drop verificati

- Pack: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-FINAL-20260623-161612`
- Zip: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-FINAL-20260623-161612.zip`
- Zip SHA256: `0af5246d456a1a8190eaf6a84c72eb4d949601d4a7760fd1176ae1836c7385b4`
- App file count: `36`
- `Win7POS.Wpf.exe`, `Win7POS.Wpf.exe.config`, `Win7POS.Core.dll`, `Win7POS.Data.dll`, `Microsoft.Data.Sqlite.dll`, `SQLitePCLRaw.*` ed `e_sqlite3.dll`: presenti.
- Architettura: `Win7POS.Wpf.exe` e `e_sqlite3.dll` sono `PE32 Intel 80386`.
- `scripts/win7pos/validate-drop.sh --source dist/TASK-081Z/Win7POS-TASK081Z-FINAL-20260623-161612/app --expect-config`: exit `0`.
- Drop validati: `.win7pos-vm/drop/Win7POS`, `.win7pos-vm/shared-win7/Win7POS`, `.win7pos-physical/bridge/drop/Win7POS`.
- PDB/MDB: nessuno.
- Redaction scan mirata su pack/drop: nessun match per path assoluti locali, `.pdb`, `.mdb`, token POS literal, JWT o service-role; `strings` su `Win7POS.Wpf.exe` non trova copy legacy `SII Web` o path PDF assoluto in UI.

### Subagenti final review

- Governance Reviewer: primo pass `FAIL` prima della riconciliazione per stato ancora `REVIEW`/`ACTIVE`; findings usati per questa patch documentale finale.
- Final Reconciliation Reviewer: `PASS`; raccomandato `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`, nessun issue repo-controllabile.
- Gli altri reviewer read-only sono stati avviati su Admin Web, Win7POS, Contract/Performance e Security; eventuali finding bloccanti sarebbero stati trattati prima della chiusura.

## Evidenza UX/product alignment final patch - 2026-06-23

Questa sezione resta cronologia del prompt `TASK-081 UX / PRODUCT ALIGNMENT FINAL PATCH`.
Il risultato di quel passaggio era `READY_FOR_DONE_CONFIRMATION_WITH_WIN7_LAUNCH_ISSUE_DOCUMENTED`; la riconciliazione finale corrente e documentata nella sezione precedente.

### Modifiche prodotto chiuse

- Admin Web POS auth/catalog/sales responses ora restituiscono un payload shop ufficiale condiviso con `shop_id`, `shop_code`, `company_rut`, `business_giro`, `business_address`, `business_city`, `legal_representative_rut`, `shop_status`, source e `updated_at`.
- Win7POS salva lo snapshot shop ufficiale in SQLite locale sotto chiavi dedicate `pos.official_shop.*`; il flusso bootstrap, catalog pull e sales sync ack aggiornano lo snapshot solo da Admin Web.
- Win7POS legge lo snapshot ufficiale anche offline per ricevute/boleta e per la schermata `Dati negozio ufficiali`; la vecchia write path pubblica `SaveShopInfoAsync` non esiste piu.
- Shop settings Win7POS e copy permessi sono read-only: dati ufficiali gestiti da Master Console, visibili offline dall'ultimo sync.
- Main shell Win7POS espone stato sync operatore con online/offline, ultimo catalogo, ultima vendita inviata, pending/retry/blocked e ultimo errore redatto.
- Revenue UX Win7POS distingue incasso completo, documento boleta/PDF, cash senza stampa e policy carta; rimosse copy fuorvianti `SII Web`, hidden/fake/complete-view e fiscal literals hardcoded.
- Catalog/prezzi/stock resta Admin Web -> Win7POS con snapshot locale/offline; gli scanner esistenti TASK-081Z restano verdi.

### Gate locali UX rieseguiti

```text
npm run verify
lint/typecheck/security:scan/build: PASS
build: 0 errori; warning noti Next middleware deprecato e Node DEP0205
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
npm run test:task081:e2e
1 passed
exit 0
```

```text
npm run test:task081:win7-http
1 passed
exit 0
```

```text
supabase migration list --local
local/remote allineati fino a 20260622213000
exit 0
```

```text
supabase migration up --local
Local database is up to date.
exit 0
```

```text
supabase db lint --local --schema public,app_private --fail-on error
No schema errors found
exit 0
```

```text
dotnet build src/Win7POS.Cli/Win7POS.Cli.csproj -c Release
Avvisi: 4
Errori: 0
Warnings: NU1903 System.IO.Packaging 6.0.0 preesistenti.
exit 0
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-harness
TASK-081 sales sync harness: PASS
sales=3 stock=10 outbox=acked/retry/failed_blocked
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-shop-cache-harness
CACHE CHECK: official shop snapshot persisted, refreshed, and read offline.
TEST PASS
exit 0
```

Scanner Win7POS:

- `pwsh -NoProfile -File scripts/check-pos-online-client.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-dialog-standards.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-shop-data-readonly.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-sync-status-ux.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-revenue-copy.ps1`: `=== RESULT: ALL PASS ===`

### Release pack UX alignment

```text
dotnet publish src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86 -r win-x86 --self-contained false -p:DebugType=none -p:DebugSymbols=false -p:IncludeSymbols=false -p:PathMap=/Users/minxiang/Projects/Win7POS=/_/Win7POS -o dist/TASK-081Z/Win7POS-TASK081Z-UX-20260623-152414/app
exit 0
```

- Pack: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-UX-20260623-152414`
- Zip: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-UX-20260623-152414.zip`
- Zip SHA256: `9d5bb67aae198a15fb593f47868a643888d23be73ccfe3ac741f85ed1d2c23a2`
- App file count: `36`
- `e_sqlite3.dll`: presente.
- Architettura: `Win7POS.Wpf.exe` e `e_sqlite3.dll` sono `PE32 Intel 80386`.
- `scripts/win7pos/validate-drop.sh --source dist/TASK-081Z/Win7POS-TASK081Z-UX-20260623-152414/app --expect-config`: exit `0`.
- `shasum -a 256 -c SHA256SUMS.txt`: tutti `OK`.
- PDB/MDB: nessuno.
- Redaction scan mirata su pack e drop: nessun match per path assoluti locali, `.pdb`, `.mdb`, token POS literal, JWT o service-role.

Drop aggiornati da questo pack e validati:

- `/Users/minxiang/Projects/Win7POS/.win7pos-vm/drop/Win7POS`
- `/Users/minxiang/Projects/Win7POS/.win7pos-vm/shared-win7/Win7POS`
- `/Users/minxiang/Projects/Win7POS/.win7pos-physical/bridge/drop/Win7POS`

### Review mirata subagenti

- Win7POS UX Reviewer: rilevati e chiusi dati shop editabili/copy legacy; schermata rinominata `Dati negozio ufficiali`.
- Offline Cache Reviewer: rilevato payload shop Admin incompleto e fiscal literals hardcoded; chiuso con payload ufficiale condiviso e snapshot `pos.official_shop.*`.
- Sync Status UX Reviewer: rilevata assenza di status visibile; chiuso con status strip e pannello dettagli.
- Revenue UX Reviewer: rilevate copy fuorvianti su fiscal/SII/resto/carta; chiuse con copy completo/documento/non stampata e validazione carta su saldo residuo.
- Admin Web Boundary Reviewer: Shop Admin confermato read-only; nessuna mutation ufficiale shop lato Shop Admin/POS introdotta.
- QA Harness Reviewer: chiusi scanner e harness mirati per shop read-only/offline cache, sync status e revenue copy.
- Final Evidence Auditor: `PASS`; sync tecnico, UX alignment, release pack UX e Win7 fisico esterno sono separati. In quel passaggio TASK-081 restava `REVIEW`; la riconciliazione finale corrente e registrata nella sezione finale sopra.
- Security Reviewer follow-up: richiesto a subagenti esistenti; nessun finding restituito entro timeout. Copertura oggettiva locale rieseguita con `npm run security:scan`, scanner Win7POS read-only/sync/revenue e redaction scan pack/drop, tutti `PASS`.

### Rischio residuo

Il blocco fisico Windows 7 resta esterno e invariato rispetto al physical runtime gate: VM UTM non parte e il runner bridge fisico non ha processato job. Non e stato dichiarato PASS fisico, non e stato fatto deploy production; in quel passaggio il task restava in `REVIEW`, mentre la riconciliazione finale corrente e registrata nella sezione finale sopra.

## Evidenza finale physical runtime gate - 2026-06-23

Questa sezione resta cronologia del prompt `TASK-081 FINAL PHYSICAL RUNTIME GATE + FINAL QUALITY REVIEW`.
Il risultato di quel passaggio era `READY_FOR_DONE_CONFIRMATION_WITH_WIN7_LAUNCH_ISSUE_DOCUMENTED`; la riconciliazione finale corrente e registrata nella sezione finale sopra.

### Preflight

- Admin Web base commit: `59abaa5edd2d418518154dfc34e7ed6470b8f76f`.
- Win7POS base commit: `7e2a711b9f4fec69a5a96e618e2bb1e8434b5e31`.
- Nessun file staged in entrambi i repository.
- `git diff --check`: Admin Web exit `0`; Win7POS exit `0`.
- Artefatti non tracciati da preservare: Admin Web `SSD_HEALTH_REPORT.md`; Win7POS `dist/` release pack.

### Gate locali rieseguiti

```text
npm run lint
exit 0
```

```text
npm run typecheck
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
tests 461
pass 461
fail 0
exit 0
```

```text
npm run build
✓ Compiled successfully
exit 0
Warnings: Next.js middleware convention deprecated; Node DEP0205 module.register deprecation.
```

```text
npm run test:task081:e2e
1 passed
exit 0
```

```text
WIN7POS_REPO_PATH=/Users/minxiang/Projects/Win7POS npm run test:task081:win7-http
1 passed
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --local
Local/Remote allineati fino a 20260622213000_task_081_pos_revenue_stock_sync.sql
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local
Local database is up to date.
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public,app_private --fail-on error
No schema errors found
exit 0
```

```text
dotnet build src/Win7POS.Cli/Win7POS.Cli.csproj -c Release
Avvisi: 4
Errori: 0
Warnings: NU1903 System.IO.Packaging 6.0.0 preesistenti.
exit 0
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-harness
TASK-081 sales sync harness: PASS
sales=3 stock=10 outbox=acked/retry/failed_blocked
exit 0
```

Scanner Win7POS:

- `pwsh -NoProfile -File scripts/check-pos-online-client.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1`: `=== RESULT: ALL PASS ===`
- `pwsh -NoProfile -File scripts/check-dialog-standards.ps1`: `=== RESULT: ALL PASS ===`

### Admin Web runtime locale

- Server locale non-production avviato con `npm run start -- --hostname 0.0.0.0 --port 3062`.
- Host LAN rilevato: `http://192.168.0.215:3062`.
- `/api/pos/auth/first-login`, `/api/pos/catalog/pull`, `/api/pos/sales/sync`: `GET 405`.
- Gli stessi endpoint con `POST {}`: `400 Bad Request`, `cache-control: no-store`, JSON controllato.
- `/shop/pos`: `GET 200`.
- Nota policy Win7POS: HTTP non-loopback non e valido come base URL fisico; per un Win7 reale serve HTTPS non-production temporaneo, ad esempio quick tunnel, prima di configurare `WIN7POS_ADMIN_WEB_BASE_URL`.

### Release pack physical

```text
dotnet publish src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86 -r win-x86 --self-contained false -p:DebugType=none -p:DebugSymbols=false -p:IncludeSymbols=false -p:PathMap=/Users/minxiang/Projects/Win7POS=/_/Win7POS -o dist/TASK-081Z/Win7POS-TASK081Z-PHYSICAL-20260623-180100/app
exit 0
```

- Pack: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-PHYSICAL-20260623-180100`
- Zip: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-PHYSICAL-20260623-180100.zip`
- Zip SHA256: `65b6ac7ea05ccd77f92d9a451c61fe6fc0728928a50393c3da5f5df39bed91e4`
- App file count: `36`
- `e_sqlite3.dll`: presente.
- Runtime files richiesti presenti: `Win7POS.Wpf.exe`, `Win7POS.Wpf.exe.config`, `Win7POS.Core.dll`, `Win7POS.Data.dll`, `Microsoft.Data.Sqlite.dll`, `SQLitePCLRaw.*`, `e_sqlite3.dll`.
- Architettura: `Win7POS.Wpf.exe` e `e_sqlite3.dll` sono `PE32 Intel 80386`.
- `shasum -a 256 -c SHA256SUMS.txt`: tutti `OK`.
- `scripts/win7pos/validate-drop.sh --source dist/TASK-081Z/Win7POS-TASK081Z-PHYSICAL-20260623-180100/app --expect-config`: exit `0`.
- PDB/MDB: nessuno.
- Redaction scan mirata su pack: nessun match per path assoluti locali, `.pdb`, token POS literal, JWT, service-role.

Drop aggiornati da questo pack e validati:

- `/Users/minxiang/Projects/Win7POS/.win7pos-vm/drop/Win7POS`
- `/Users/minxiang/Projects/Win7POS/.win7pos-vm/shared-win7/Win7POS`
- `/Users/minxiang/Projects/Win7POS/.win7pos-physical/bridge/drop/Win7POS`

La copia bridge di `start-physical-win7-bridge.bat` e stata riallineata allo script sorgente per evitare un falso verde su `collect-logs`.

### VM Windows 7

```text
utmctl list
F97C3436-7311-43A1-B3C4-EF9CCA11670B stopped  Windows 7
B63440F6-8BFD-4E99-AB79-5465AC323398 stopped  Windows 7
exit 0
```

```text
open -a UTM "/Users/minxiang/Downloads/Windows 7.utm"
exit 0
```

```text
utmctl start B63440F6-8BFD-4E99-AB79-5465AC323398
START_TIMEOUT_B634 dopo 60s controllati
status B634: stopped
```

```text
utmctl start F97C3436-7311-43A1-B3C4-EF9CCA11670B
START_TIMEOUT_F97 dopo 20s controllati
status F97: stopped
status B634: stopped
```

- UTM GUI attiva, ma nessun processo QEMU Win7; unico QEMU rilevato apparteneva a emulator Android.
- Bundle reale identificato: `/Users/minxiang/Downloads/Windows 7.utm`, screenshot interno `/Users/minxiang/Downloads/Windows 7.utm/screenshot.png` dimensioni `1216x912`.
- Issue tecnica: registry UTM duplicata/incoerente e start bloccato prima di generare QEMU Win7; nessun `Win7POS.Wpf.exe` lanciato in guest.

### Bridge fisico

```text
scripts/win7pos/physical-win7/send-physical-win7-job.sh --bridge-root .win7pos-physical/bridge --job env-report --execute
Job created: .win7pos-physical/bridge/inbox/env-report.job
exit 0
```

```text
scripts/win7pos/physical-win7/send-physical-win7-job.sh --bridge-root .win7pos-physical/bridge --job smoke-pos --execute
Job created: .win7pos-physical/bridge/inbox/smoke-pos.job
exit 0
```

- Attesa runner: circa 60s; entrambi i job sono rimasti in `inbox`.
- Cleanup anti-esecuzione tardiva: job spostati in `failed` come `20260623-180755-manual-stale-env-report.job` e `20260623-180755-manual-stale-smoke-pos.job`.

```text
scripts/win7pos/physical-win7/collect-physical-win7-output.sh --bridge-root .win7pos-physical/bridge --execute
Report: /Users/minxiang/Projects/Win7POS/.win7pos-physical/reports/physical-win7-20260623-180800/report.md
Outbox files: 0
Log files: 0
Screenshot files: 0
exit 0
```

Verdetto fisico: `PHYSICAL_BRIDGE_RUNNER_NOT_ACTIVE`. Non c'e app launch reale, screenshot runtime, first-login, catalog pull o sales sync fisico.

### Revenue UI finale

- `npm run test:task081:e2e` verifica API revenue autenticata e UI `/shop/pos` desktop/mobile con dataset sintetico `TASK081_E2E_*`.
- `npm run test:task081:win7-http` verifica `/shop/pos` desktop/mobile su dati arrivati dal CLI Win7POS HTTP, catalog full/delta/tombstone e offline reconnect con dataset `TASK081Z_WIN7HTTP_*`.
- Screenshot fuori repo verificati:
  - `/tmp/task081-win7pos-http/task081z-win7http-CE94B263-desktop.png` (`1440x900`)
  - `/tmp/task081-win7pos-http/task081z-win7http-CE94B263-mobile.png` (`390x844`)
- Cleanup sessioni: `find /tmp/task081-win7pos-http -name '*session.json' -print` non produce output.

### Subagenti final physical gate

- Runtime Gate Coordinator: `CHANGES_REQUIRED` solo per incoerenze evidence storiche; corrette in questa sezione e nel fondo del file.
- Win7 VM Operator: `NON PASS`; nessun app launch reale, VM restano `stopped`, registry/path UTM incoerente.
- Physical Bridge Operator: runner non attivo; rilevata copia bridge stale; copia riallineata.
- Release Pack Reviewer: `WARN` sul pack FULLSYNC per zip assente/path PDB embedded; chiuso con pack `PHYSICAL-*`, zip e `PathMap`.
- Admin Web Runtime Reviewer: runtime locale `next start` OK; Win7 fisico richiede HTTPS non-production.
- POS Flow Reviewer: `WARN` solo per delta WPF fisico; harness locale copre contratto HTTP/DB/UI.

## Evidenza corrente TASK-081Z - 2026-06-23

Questa sezione e la fonte corrente per il prompt TASK-081Z. Le sezioni piu sotto restano cronologia TASK-081/TASK-081 HTTP precedente.

### Modifiche/fix chiusi in TASK-081Z

- Admin Web catalog pull: il payload include le categorie/fornitori referenziati dai prodotti della pagina anche quando la tassonomia legacy non cade nella finestra `updated_at` corrente; il fix resta bounded e shop/owner-scoped.
- Win7POS catalog pull/apply: drain `hasMore`, persistenza di price history remota, stock locale preservato anche con outbox `failed_blocked`, sync pending prima del catalog pull in bootstrap/heartbeat.
- Win7POS fiscal sync: vendita normale sincronizzata dopo il ramo stampa/PDF; fiscal status mappa `printed_local_pdf`, `not_printed_card_policy`, `not_reported`.
- Win7POS CLI TASK-081Z: aggiunti `--task081-catalog-price-sync-harness` e `--task081-offline-reconnect-harness`.
- E2E Win7POS HTTP: il test ora copre catalog full pull, delta price/stock/name, sales sync HTTP, revenue UI/API desktop/mobile, offline unreachable -> retry -> reconnect accepted -> duplicate safe, product tombstone.
- Security cleanup: session JSON temporanei in `/tmp/task081-win7pos-http` vengono rimossi pre-run e in cleanup; scanner bootstrap Win7POS aggiornato al path reale Core.
- Release pack TASK-081Z: nuovo pack physical senza PDB/MDB, senza path assoluti locali/debug embedded, con zip, checksum, runbook, `e_sqlite3.dll` in root app e copie fresche in VM/physical drop.

### Gate eseguiti

```text
npm run lint
exit 0
```

```text
npm run typecheck
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
SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --local
Local/Remote allineati fino a 20260622213000_task_081_pos_revenue_stock_sync.sql
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local
Local database is up to date.
exit 0
```

```text
SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public,app_private --fail-on error
Linting schema: public
Linting schema: app_private
No schema errors found
exit 0
```

```text
WIN7POS_REPO_PATH=/Users/minxiang/Projects/Win7POS npm run test:task081:win7-http
[test-target] PASS TEST_TARGET=local
[test-target] PASS Supabase target guardrails passed
1 passed
exit 0
```

Copertura E2E TASK-081Z Win7POS HTTP:

- Dataset sintetico: `TASK081Z_WIN7HTTP_*`.
- Catalog full pull runtime: `PASS_CATALOG_PRICE_SYNC_RUNTIME`, prodotto/categoria/fornitore/prezzi/stock/cursor/catalog version.
- Catalog delta runtime: prodotto aggiornato, item number aggiornato, purchase/retail price aggiornati, stock server `14`.
- Sales sync runtime: Admin Web first-login reale, CLI Win7POS HTTP harness con outbox SQLite reale, 6 sales accepted, duplicate/conflict/auth denied retry, product stock server dopo sales `11`.
- Revenue runtime: API/UI `/shop/pos` desktop/mobile su dati arrivati via CLI Win7POS HTTP.
- Offline reconnect runtime: `PASS_OFFLINE_RECONNECT_RUNTIME pending=1 retry=1 accepted=1 pending_final=0 duplicate=ok local_stock=9`, product stock server finale `10`, sale offline visibile in UI/API.
- Tombstone runtime: product tombstone remoto applicato localmente (`is_active=0`, `remote_deleted_at`).
- Cleanup: nessun `*-session.json` residuo in `/tmp/task081-win7pos-http`.

```text
npm run test:task081:e2e
[test-target] PASS TEST_TARGET=local
[test-target] PASS Supabase target guardrails passed
1 passed
exit 0
```

```text
dotnet build src/Win7POS.Cli/Win7POS.Cli.csproj -c Release
Avvisi: 4
Errori: 0
Warnings: NU1903 System.IO.Packaging 6.0.0 preesistenti.
exit 0
```

```text
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
Avvisi: 0
Errori: 0
exit 0
```

```text
dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-harness
TASK-081 sales sync harness: PASS
sales=3 stock=10 outbox=acked/retry/failed_blocked
exit 0
Warnings: NU1903 System.IO.Packaging 6.0.0 preesistenti.
```

```text
pwsh -NoProfile -File scripts/check-pos-online-client.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-online-bootstrap.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-pos-catalog-pull.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
pwsh -NoProfile -File scripts/check-dialog-standards.ps1
=== RESULT: ALL PASS ===
exit 0
```

```text
git diff --check
Admin Web exit 0
Win7POS exit 0
```

### Release pack TASK-081Z precedente

```text
dotnet publish src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86 -p:DebugType=None -p:DebugSymbols=false -o dist/TASK-081Z/Win7POS-TASK081Z-FULLSYNC-20260623-133315/app
exit 0
```

- Pack: `/Users/minxiang/Projects/Win7POS/dist/TASK-081Z/Win7POS-TASK081Z-FULLSYNC-20260623-133315`
- Manifest: `MANIFEST-TASK081Z.txt`
- Checksums: `SHA256SUMS.txt`
- File list: `FILES.txt`
- Size: `14M`
- PDB/MDB: nessuno.
- Nota superata dal final physical gate: il pack `PHYSICAL-*` sopra e il pack corrente per drop/bridge, perche include zip e path mapping debug piu stretto.

```text
scripts/win7pos/validate-drop.sh --source dist/TASK-081Z/Win7POS-TASK081Z-FULLSYNC-20260623-133315/app
OK: found Win7POS.Wpf.exe
OK: found Win7POS.Wpf.exe.config
Native SQLite candidates: e_sqlite3.dll
Asset check: OK Assets/sii_qrcode.png
exit 0
```

Drop aggiornati e validati:

- `/Users/minxiang/Projects/Win7POS/.win7pos-vm/drop/Win7POS`
- `/Users/minxiang/Projects/Win7POS/.win7pos-vm/shared-win7/Win7POS`
- `/Users/minxiang/Projects/Win7POS/.win7pos-physical/bridge/drop/Win7POS`

### VM / fisico Windows 7

```text
utmctl list
F97C3436-7311-43A1-B3C4-EF9CCA11670B stopped  Windows 7
B63440F6-8BFD-4E99-AB79-5465AC323398 stopped  Windows 7
exit 0
```

```text
utmctl status B63440F6-8BFD-4E99-AB79-5465AC323398
stopped
exit 0
```

```text
utmctl start B63440F6-8BFD-4E99-AB79-5465AC323398
timeout/hang dopo 60s; processo interrotto con Ctrl-C
stato separato: stopped
```

```text
utmctl start F97C3436-7311-43A1-B3C4-EF9CCA11670B
START_TIMEOUT_F97C dopo 20s
status F97C: stopped
status B634: stopped
```

Bridge fisico precedente:

```text
scripts/win7pos/physical-win7/send-physical-win7-job.sh --bridge-root .win7pos-physical/bridge --job smoke-pos --execute
Job created: .win7pos-physical/bridge/inbox/smoke-pos.job
```

Il job non e stato processato da un runner Win7 fisico attivo; e stato rimosso dall'inbox dopo la raccolta per evitare esecuzione tardiva fuori contesto.

```text
scripts/win7pos/physical-win7/collect-physical-win7-output.sh --bridge-root .win7pos-physical/bridge --execute
Report: /Users/minxiang/Projects/Win7POS/.win7pos-physical/reports/physical-win7-20260623-173704/report.md
```

Verdetto runtime Win7: `LAUNCH_ISSUE_DOCUMENTED`. WPF/guest/fisico Windows 7, stampante, cassetto e rete reale restano non verificati perche `utmctl start` non avvia le VM e nessun runner bridge fisico ha processato il job.

### Subagent review TASK-081Z

- Evidence Auditor: `P0/P1 gap` su VM/fisico, catalog-price, offline reconnect, Supabase gate, release pack; chiusi tutti tranne runtime Win7 guest/fisico, ora documentato come launch issue.
- Offline Queue Reviewer: `WARN`; core pending/retry/accepted/duplicate/conflict coperto, residuo su conflict via `PosSalesSyncService` fisico e 500/503 dedicati.
- Performance Reviewer: `WARN`; loop/retry bounded, raccomandato benchmark Win7 lento prima di produzione.
- Security/Redaction Reviewer: `WARN`; session JSON cleanup e scanner bootstrap corretti, release pack TASK-081Z senza PDB/path assoluti.

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
- Final alignment closure: client HTTP/DTO/sessione Admin Web Win7POS condivisi in Core; payload builder sales sync condiviso in Data e riusato dal servizio WPF e dal CLI; aggiunto `--task081-sales-sync-http-harness` che crea vendite locali SQLite, passa da outbox reale, chiama davvero `/api/pos/sales/sync`, marca ack, verifica duplicate/conflict e prova 401/403 retry senza perdita vendita. Aggiunto E2E Admin Web `TASK081Z_WIN7HTTP_*` che lancia il CLI Win7POS e verifica DB/API/UI `/shop/pos`. Creato release pack x86 win-x86 con manifest/checksum/runbook e `e_sqlite3.dll`.

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

- Dataset sintetico: `TASK081Z_WIN7HTTP_*`.
- Flusso: Admin Web first-login reale -> session JSON temporaneo fuori repo -> `dotnet run --project /Users/minxiang/Projects/Win7POS/src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-http-harness --base-url http://127.0.0.1:3062 --session-json <tmp>`.
- Vendite accettate da Win7POS HTTP harness: cash documentata, cash non documentata, card documentata, refund, void, other mese precedente.
- Verifiche: 6 sales accepted, 6 batch accepted, ledger cash/card/other/refund/void, stock movements applied, product stock finale `7`, duplicate `duplicate_batch`, conflict `conflict_batch`, auth denied locale in retry, API revenue oggi/mese/anno e UI desktop/mobile.
- Screenshot locali fuori repo:
  - `/tmp/task081-win7pos-http/task081z-win7http-E8AD0A60-desktop.png`
  - `/tmp/task081-win7pos-http/task081z-win7http-E8AD0A60-mobile.png`

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
- `WIN7_VM_LAUNCH_ISSUE_DOCUMENTED`: il trasporto HTTP reale Win7POS -> Admin Web e verificato da CLI locale contro Admin Web non-prod; il guest/fisico Windows 7 non e stato avviato perche `utmctl start` su entrambi gli UUID resta appeso/in timeout e status resta `stopped`.
- `PHYSICAL_BRIDGE_RUNNER_NOT_ACTIVE`: i job fisici `env-report` e `smoke-pos` sono stati inviati con `--execute`, ma non processati da runner attivo; sono stati spostati in `failed` come `manual-stale` per evitare esecuzione tardiva.
- `RISK_LOW`: Win7POS CLI build segnala NU1903 su `System.IO.Packaging 6.0.0`; non introdotto dal fix TASK-081.

## Riconciliazione finale

- Stato finale riconciliato: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`.
- Task attivo dopo riconciliazione: `NESSUNO`.
- Criteri accettazione tecnici locali: passati; runtime Win7 guest/fisico non dichiarato PASS e documentato sopra come nota esterna.
- Prossima review consigliata: prova fisica Win7POS su Windows 7 con vendita sale/refund/full void, reconnect, stampante e rete intermittente.
