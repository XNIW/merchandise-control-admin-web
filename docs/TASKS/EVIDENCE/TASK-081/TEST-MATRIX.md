# TASK-081 Final Test Matrix

Legenda stato: `PASS_STATIC`, `PASS_BUILD`, `PASS_HARNESS`, `PASS_E2E`, `PASS_RUNTIME`, `PASS_DROP`, `PASS_WITH_WARNING`, `NOT_RUN`, `BLOCKED_EXTERNAL`.

| # | Scenario | Repo | Verifica eseguita | Risultato | Stato |
|---:|---|---|---|---|---|
| 1 | Governance task attivo e handoff | Admin Web | Master Plan/task/evidence aggiornati | TASK-081 `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`; Master Plan torna `IDLE`; task attivo `NESSUNO`; nessun file staged | `PASS_STATIC` |
| 2 | Admin Web quality gates | Admin Web | `npm run verify`, `npm run test:foundation` | lint/typecheck/security/build pass; foundation `462/462` | `PASS_BUILD` |
| 3 | Supabase locale | Admin Web/Supabase | `supabase migration list --local`, `supabase migration up --local`, `supabase db lint --local --schema public,app_private --fail-on error` | migrations local/remote allineate; local DB up to date; no schema errors | `PASS_RUNTIME` |
| 4 | Sales sync v2 strict/idempotente | Admin Web/Supabase | foundation TASK-081 + Playwright TASK-081 | parser strict, duplicate/conflict/negative auth/payload coperti | `PASS_E2E` |
| 5 | Ledger/revenue dashboard | Admin Web/Supabase | `npm run test:task081:e2e` | dataset `TASK081_E2E_*`, first-login, sales sync, API revenue, UI `/shop/pos` desktop/mobile, cleanup | `PASS_E2E` |
| 6 | Catalog pull full/delta/tombstone | Admin Web/Win7POS | `npm run test:task081:win7-http` + CLI `--task081-catalog-price-sync-harness` | `PASS_CATALOG_PRICE_SYNC_RUNTIME`; prodotto/categoria/fornitore/prezzi/stock/cursor/version, delta e tombstone verificati | `PASS_RUNTIME` |
| 7 | Win7POS HTTP sales sync | Admin Web/Win7POS | `npm run test:task081:win7-http` + CLI `--task081-sales-sync-http-harness` | 6 sales accepted da outbox SQLite reale, duplicate ok, conflict ok, auth denied retry, stock server verificato | `PASS_E2E` |
| 8 | Offline-first reconnect | Admin Web/Win7POS | `npm run test:task081:win7-http` + CLI `--task081-offline-reconnect-harness` | endpoint non raggiungibile -> retry -> reconnect accepted -> duplicate safe; `pending_final=0`; UI/API include sale offline | `PASS_RUNTIME` |
| 9 | Win7POS local outbox/refund/void | Win7POS | `dotnet run --project src/Win7POS.Cli/Win7POS.Cli.csproj -c Release -- --task081-sales-sync-harness` | `TASK-081 sales sync harness: PASS`, `sales=3 stock=10 outbox=acked/retry/failed_blocked` | `PASS_HARNESS` |
| 10 | Win7POS build x86 | Win7POS | CLI build, WPF build x86 | CLI build exit 0 con NU1903 preesistente; WPF x86 build `0 warning/0 error` | `PASS_BUILD` |
| 11 | Win7POS baseline scanners | Win7POS | `check-pos-online-client.ps1`, `check-pos-online-bootstrap.ps1`, `check-pos-catalog-pull.ps1`, `check-dialog-standards.ps1` | tutti `=== RESULT: ALL PASS ===` | `PASS_STATIC` |
| 12 | Shop official data read-only/offline cache | Win7POS/Admin Web | `check-pos-shop-data-readonly.ps1`, `--task081-shop-cache-harness`, foundation TASK-081 UX test | payload shop ufficiale completo; snapshot `pos.official_shop.*`; no `SaveShopInfoAsync`; no mutation shop POS; cache persisted/refreshed/read offline | `PASS_HARNESS` |
| 13 | Sync status UX | Win7POS | `check-pos-sync-status-ux.ps1` | status strip/pannello con online/offline, ultimo catalogo, ultima vendita inviata, pending/retry/blocked, errori redatti; no token/session exposure | `PASS_STATIC` |
| 14 | Revenue UX alignment | Win7POS/Admin Web | `check-pos-revenue-copy.ps1`, TASK-081 E2E, TASK-081 Win7 HTTP E2E | incasso completo resta visibile; boleta/PDF e non stampata sono status documento; no hidden/fake/SII Web copy; carta non supera saldo residuo | `PASS_E2E` |
| 15 | Session/redaction cleanup | Entrambi | `find /tmp/task081-win7pos-http -name '*session.json'`, `rg` secret patterns su pack/drop | nessun session JSON residuo; nessun secret/token/JWT/service-role/path assoluto locale nel pack/drop TASK-081Z FINAL | `PASS_RUNTIME` |
| 16 | Release pack TASK-081Z FINAL | Win7POS | `dotnet publish ... -r win-x86 --self-contained false -p:DebugType=none -p:DebugSymbols=false -p:PathMap=...`, `validate-drop.sh`, checksum/redaction scan | pack `dist/TASK-081Z/Win7POS-TASK081Z-FINAL-20260623-161612`, zip SHA256 `0af5246...c7385b4`, 36 app files, `e_sqlite3.dll`, no PDB/MDB, no local path/debug token match | `PASS_DROP` |
| 17 | VM/physical drops | Win7POS | publish finale, physical bridge copy, `validate-drop.sh --expect-config`, redaction scan | `.win7pos-vm/drop/Win7POS`, `.win7pos-vm/shared-win7/Win7POS`, `.win7pos-physical/bridge/drop/Win7POS` aggiornati dal pack FINAL e validati | `PASS_DROP` |
| 18 | UTM Windows 7 launch | Win7POS | `utmctl list/status`, `open -a UTM ~/Downloads/Windows 7.utm`, `utmctl start` with controlled timeout on both UUIDs, process check | both VMs `stopped`; `B634...` timeout 60s, `F97...` timeout 20s; no Win7 QEMU process; UTM registry/path issue documented | `BLOCKED_EXTERNAL` |
| 19 | Physical Win7 bridge smoke | Win7POS | `send-physical-win7-job.sh --job env-report --execute`, `--job smoke-pos --execute`, 60s wait, cleanup, collector | jobs created but no runner processed them; moved to `failed/*manual-stale*`; report `physical-win7-20260623-180800` has 0 outbox/log/screenshot | `BLOCKED_EXTERNAL` |
| 20 | Production/staging apply/deploy | Admin Web/Supabase | vietato dallo scope | nessun Supabase remote/staging/production apply, nessun deploy, nessun commit/stage/push | `NOT_RUN` |
| 21 | Final review fixes | Win7POS | review diff + scanner revenue/read-only/sync + WPF build | rimosso commento legacy `SII Web`; tooltip sync include pending/retry/blocked; UI boleta non mostra path assoluto PDF; scanner UX/read-only/sync/revenue restano `ALL PASS` | `PASS_STATIC` |

## Gate Log

### Gate A - Local Code And Schema

- Admin Web: `lint`, `typecheck`, `security:scan`, `test:foundation`, `build` pass.
- Supabase local: migration list/up/lint pass con schema `public,app_private`.
- Win7POS: CLI/WPF x86 build pass; scanner Win7POS baseline e UX pass.

### Gate B - Full Sync Runtime Local

- `npm run test:task081:win7-http` pass.
- Copertura: first-login, catalog full/delta/tombstone, sales sync HTTP reale, revenue API/UI, offline reconnect, duplicate safe e cleanup.

### Gate C - Release/Bridge

- Release pack TASK-081Z FINAL creato, zippato e validato.
- VM/physical/shared drops aggiornati dal pack FINAL e validati.
- UTM launch issue documentato con due UUID Windows 7 che restano `stopped`.
- Physical bridge env/smoke non processati da runner; job ripuliti come manual-stale, quindi non dichiarato PASS.

### Gate D - Final Reconciliation

- Stato finale: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`.
- Runtime WPF su guest/fisico Windows 7 e hardware reale restano `EXTERNAL_TEST_PENDING`; non e stato dichiarato superato il test fisico Windows 7 e non e stato dichiarato completato il runtime fisico.
