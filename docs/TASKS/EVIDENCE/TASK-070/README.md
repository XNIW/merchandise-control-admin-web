# TASK-070 Evidence - Win7POS audit and Admin Web alignment

## Stato

- Data: 2026-06-19
- Stato operativo: `DONE`
- Commit / push / stage / merge: `NOT_RUN_BY_REQUEST`
- Deploy / `db push` / migration apply: `NOT_RUN_BY_REQUEST`
- Secret exposure: `NONE_INTENDED`; nessun token, PIN, password, hash o valore
  secret riportato.

## Repository

| Repo | Path | Branch/upstream | Note |
|---|---|---|---|
| Win7POS | `${WIN7POS_REPO_PATH}` | `main...origin/main` | Repo trovato. Worktree gia' sporco al preflight con modifiche locali preesistenti su `.gitignore`, product dialog e tooling Win7; preservate e non revertite. |
| Admin Web | `${ADMIN_WEB_REPO_PATH}` | `main...origin/main` | Repo principale per task/evidence. |
| Android reference | `${ANDROID_REPO_PATH}` | `main...origin/main` | Usato come riferimento data model/catalog export. |
| iOS reference | `${IOS_REPO_PATH}` | `main...origin/main` | Usato come riferimento data model/catalog sync. |

Preflight Win7POS eseguito:

- `git status --short --branch --untracked-files=all`
- `git diff --check`
- `git diff --stat`
- `git diff --name-only`
- lettura `README.md`, `AGENTS.md`, docs, project files, schema/init DB,
  entrypoint e codice runtime.

## CodeRabbit

CodeRabbit Win7POS: `RUN_LOCAL_UNCOMMITTED`.

- PR aperte: `[]`, nessuna PR disponibile da cui recuperare commenti.
- CLI: `coderabbit 0.6.1`, autenticata.
- Comando: `coderabbit review --agent -t uncommitted -c AGENTS.md`.
- Esito: 7 issues, tutti verificati contro codice reale; nessun commento remoto
  inventato.

| Severity | File | Finding | Esito |
|---|---|---|---|
| critical | `scripts/win7pos/windows/bridge/start-builder-bridge.ps1` | Selezionava il job piu vecchio per `Sort-Object LastWriteTime` ascendente. | Fixed: `-Descending`. |
| major | `src/Win7POS.Data/Repositories/ProductRepository.cs` | Supplier creation usava `MAX(id)+1`. | Fixed: insert senza `id`, poi `last_insert_rowid()`. |
| major | `src/Win7POS.Data/Repositories/ProductRepository.cs` | Category creation usava `MAX(id)+1`. | Fixed: insert senza `id`, poi `last_insert_rowid()`. |
| major | `scripts/win7pos/windows/build-release-x86.ps1` | `dist` poteva conservare file stale. | Fixed: rimozione `DistDir` prima della copia. |
| major | `scripts/win7pos/physical-win7/send-physical-win7-job.sh` | Path relativo falliva con errore criptico se parent mancante. | Fixed: fallback a `$(pwd)/relative`. |
| major | `scripts/win7pos/physical-win7/collect-physical-win7-output.sh` | Stesso problema path relativo. | Fixed: fallback a `$(pwd)/relative`. |
| minor | `scripts/win7pos/guest/README.md` | Typo/accenti Italiani. | Fixed: `è`, `già`. |

## Stack tecnico

- App principale: C# WPF, `.NET Framework 4.8`, x86, `WinExe`.
- Target prodotto: Windows 7 first.
- Entry point: `src/Win7POS.Wpf/App.xaml` -> `MainWindow.xaml`.
- Progetti:
  - `src/Win7POS.Wpf/Win7POS.Wpf.csproj`: WPF/WinForms, `net48`, x86.
  - `src/Win7POS.Core/Win7POS.Core.csproj`: `netstandard2.0`.
  - `src/Win7POS.Data/Win7POS.Data.csproj`: `netstandard2.0`.
  - `src/Win7POS.Cli/Win7POS.Cli.csproj`: `net10.0`, tooling/dev, non
    runtime Win7.
- Dipendenze principali: Dapper, Microsoft.Data.Sqlite, SQLitePCLRaw,
  PDFsharp-gdi, ZXing, ClosedXML, ExcelDataReader.
- `Win7POS.slnx` esiste ma e' vuoto; build reale documentata via `.csproj`.
- Dati runtime: `%ProgramData%\Win7POS`, override test con `WIN7POS_DATA_DIR`.

## Database locale

Database reale: SQLite locale, default `%ProgramData%\Win7POS\pos.db`.

Tabelle principali:

- `products`: `id`, `barcode`, `name`, `unitPrice`, `remote_product_id`,
  `remote_deleted_at`, `is_active`.
- `product_meta`: `barcode`, `article_code`, `name2`, `purchase_price`,
  `purchase_old`, `retail_old`, supplier/category id+name snapshot, `stock_qty`.
- `suppliers`, `categories`.
- `product_price_history`: `barcode`, `timestamp`, `type`, `old_price`,
  `new_price`, `source`.
- `sales`, `sale_lines`: vendite locali e snapshot riga; pagamenti su header
  `paidCash`, `paidCard`, `change`.
- `users`, `roles`, `role_permissions`, `security_events`.
- `app_settings`, `audit_log`, `held_carts`, `held_cart_lines`.

## Matrice compatibilita

| Area | Win7POS | Admin Web / Supabase | Android | iOS | Status |
|---|---|---|---|---|---|
| Products | `products` + `product_meta`, int local id, barcode unique | `inventory_products` UUID/shop-scoped | Product + remote refs | Product + `remoteID` | `COMPATIBLE_WITH_MAPPING` |
| Categories | local int id/name, no tombstone | UUID + `deleted_at` | local id + remote ref | relation + `remoteID` | `PARTIAL` |
| Suppliers | local int id/name, no tombstone | UUID + `deleted_at` | local id + remote ref | relation + `remoteID` | `PARTIAL` |
| Prices | int CLP + `product_price_history` old/new | numeric/double price history | `ProductPrice` | `ProductPrice` | `COMPATIBLE_WITH_ROUNDING_POLICY` |
| Stock | `INTEGER stock_qty` | numeric/double future | Double? | Double? | `PARTIAL_INT_ONLY` |
| Sales | local `sales`/`sale_lines`, paidCash/paidCard/change | `pos_sales`/`pos_sale_lines`; payments gap | n/a | n/a | `NOT_READY` |
| Staff | local users + remote staff mirror | `staff_accounts`, credential version | n/a POS staff | n/a POS staff | `COMPATIBLE_WITH_NOTES` |
| Devices | DPAPI trusted-device file + stable device identifier | `shop_devices`, `pos_device_credentials`, `pos_sessions` | n/a | n/a | `COMPATIBLE` |
| Settings | `app_settings`, config file/env | future POS config/runbook | n/a | n/a | `PARTIAL` |
| Sync events | local audit/security logs only | Admin audit/sync endpoints | sync events | sync events | `PARTIAL` |

Key mismatch:

- Barcode canonicalization non e' ancora un contratto unico cross-platform.
- Prezzi Win7POS sono interi CLP; Admin/mobile usano numeric/double.
- Stock frazionario non rappresentabile in Win7POS.
- Supplier/category Win7POS non hanno remote UUID/tombstone locali.
- Refund/void Win7POS puo' usare importi o righe negative; Admin sales sync
  attuale accetta importi/quantita' positive.
- Win7POS ha `paidCash`, `paidCard`, `change`; schema Admin reale non ha ancora
  tabella pagamenti separata.

## Staff, login e sicurezza

Status:

- Primo admin non seedato: creato dal wizard first-run.
- Online first-login: `shopCode + staffCode + credential` verso Admin Web.
- Offline mirror: utente locale `pos_{shop}_{staff}`, hash/salt locale.
- PIN locale: PBKDF2 con salt random; in TASK-070 il confronto e' stato reso
  constant-time compatibile netstandard2.0.
- Lockout locale: 5 tentativi, 15 minuti.
- Token device/session: protetti con DPAPI `CurrentUser`, non in chiaro.
- Nessun secret hardcoded reale trovato.

Fix TASK-070:

- Menu Prodotti richiede `CatalogView`.
- Creazione rapida prodotto da POS richiede `CatalogEdit` o override.
- Change PIN pulisce `PasswordBox` dopo successo.
- Admin Web POS HTTP ammesso solo per loopback; host remoti devono usare HTTPS.
- CSV export neutralizza celle formula-like.

Residui:

- `ProductsViewModel` richiede guardie interne complete per create/edit/delete,
  import/export e price edit.
- `OpenCashDrawer` richiede policy permesso dedicata o mapping approvato.
- Audit login/override e rotation log restano hardening successivo.

## Sales e offline

Flusso vendita:

1. Login operatore locale.
2. Barcode/scanner o prezzo manuale.
3. Carrello in memoria, supporto quantita', sconti riga/carrello, righe manuali.
4. Pagamento cash/card, receipt, stampa/copia file.
5. Insert transazionale `sales` + `sale_lines`.
6. Registro vendite, ristampa, refund/storno, report giornaliero.

Offline:

- Vendita locale funziona senza rete.
- Catalog pull online e heartbeat sono best-effort.
- Non esiste sales queue locale.
- Non esistono retry sales, idempotency key/server ack, payload hash o
  `remote_sale_id`.
- `shop/device/session` non sono snapshot immutabili sulla vendita.

## Fix applicati

Win7POS:

- `src/Win7POS.Data/Repositories/ProductRepository.cs`
- `src/Win7POS.Core/Security/PinHelper.cs`
- `src/Win7POS.Wpf/MainWindow.xaml.cs`
- `src/Win7POS.Wpf/Pos/Dialogs/ChangePinDialog.xaml.cs`
- `src/Win7POS.Wpf/Pos/Online/PosAdminWebOptions.cs`
- `src/Win7POS.Wpf/Pos/PosView.xaml`
- `src/Win7POS.Wpf/Pos/PosViewModel.cs`
- `src/Win7POS.Wpf/Products/ProductsWorkflowService.cs`
- `scripts/win7pos/windows/bridge/start-builder-bridge.ps1`
- `scripts/win7pos/windows/build-release-x86.ps1`
- `scripts/win7pos/physical-win7/send-physical-win7-job.sh`
- `scripts/win7pos/physical-win7/collect-physical-win7-output.sh`
- `scripts/win7pos/guest/README.md`

Admin Web docs:

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-070-win7pos-audit-admin-web-alignment.md`
- `docs/TASKS/EVIDENCE/TASK-070/README.md`

Nota: altre modifiche Win7POS gia' presenti al preflight (`.gitignore`,
`ProductEditDialog.xaml`, `ProductEditViewModel.cs`, vari docs/scripts Win7) sono
state preservate e non revertite.

## Check finali Win7POS

| Comando | Esito |
|---|---|
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, 0 warnings, 0 errors. |
| `pwsh -File scripts/check-dialog-standards.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-pos-online-client.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `ALL PASS`. |
| `pwsh -File scripts/check-product-dialog-free-text.ps1` | `PASS`, `ALL PASS`. |
| `bash -n` su script shell Win7POS bridge/drop | `PASS`. |
| PowerShell parser su build/bridge scripts | `PASS`. |
| `git diff --check` | `PASS`. |

Note:

- Nessun progetto test C# dedicato trovato.
- Runtime fisico Windows 7 non avviato in TASK-070.
- Security preflight plugin non eseguito per Python 3.9.6 senza `tomllib`; fatta
  scansione manuale `rg` + script POS online.

## Check finali Admin Web

Eseguiti perche' TASK-070 ha modificato task/evidence/Master Plan nel repo
principale.

| Comando | Esito |
|---|---|
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, 378/378. |
| `npm run typecheck` | `PASS`, route types generati e `tsc --noEmit` ok. |
| `npm run lint` | `PASS`. |
| `npm run build` | `PASS`; warning noti Next `middleware` deprecation e Node `DEP0205`. |
| `npm run verify` | `PASS`; riesegue lint, typecheck, security scan e build. |
| `git diff --check` | `PASS`. |

## Roadmap proposta

- `TASK-072 - Win7POS config shop_code/device_id hardening`
  - Health screen locale con base URL, shop code, device id, ultimo heartbeat,
    ultimo catalog pull, stato revoked/denied.
  - Policy HTTPS: confermare eccezione localhost e runbook certificati Win7.

- `TASK-073 - Win7POS catalog import/export bridge`
  - Contratto barcode canonical unico.
  - Export Admin Web in formato Win7POS/Android DB o reader Win7POS compatibile
    con export Admin Web.
  - Remote UUID/tombstone per supplier/category.

- `TASK-074 - Win7POS staff credential alignment`
  - Guardie interne complete ProductsViewModel.
  - Policy `OpenCashDrawer`.
  - Audit login/override awaitable e hardening Change PIN/rotation.

- `TASK-075 - Win7POS sales local queue audit`
  - Schema locale append-only per outbox sales.
  - `client_sale_id`, idempotency key, payload hash, attempts, next retry,
    last error, server ack.
  - Snapshot immutabile shop/device/session/staff sulla vendita.

- `TASK-076 - Admin Web POS sales read model`
  - Modellare cash/card/change e pagamenti separati.
  - Read model shop-scoped, diagnostics batch e UI read-only.
  - Policy refund/void senza cancellazioni fisiche.

- `TASK-077 - Controlled Supabase sales sync prototype`
  - Client Win7POS per `/api/pos/sales/sync`.
  - Batch bounded, retry/backoff, duplicate/conflict handling.
  - E2E non-production con dati sintetici, cleanup e audit redatto.

## Rischi residui

- Win7POS live Windows 7 fisico/VM non verificato in questo task.
- Native SQLite x86 nel drop e TLS/root certificates Win7 restano da provare.
- Sales sync end-to-end resta `NOT_READY`.
- Admin Web sales sync schema attuale non copre pagamenti separati e refund/void
  Win7POS.
- `Win7POS.Cli` e' `net10.0` tooling/dev: non considerarlo runtime Win7.

## Addendum TASK-071 closure

Stato finale dopo TASK-071: `DONE`.

Fix/verifiche aggiuntive:

- Win7POS Products: `New/Edit/Copy/Delete` richiedono `CatalogEdit`,
  `Import` richiede `CatalogImport`, storico prezzi applica `CatalogPriceEdit`.
- `ProductRepository`: supplier/category free-text serializzati con gate locale,
  `INSERT OR IGNORE` e re-read dentro transazione.
- `ProductsWorkflowService`: CSV formula sanitization normalizza CR/LF prima del
  controllo e controlla il primo carattere non-whitespace.
- `ChangePinDialog`: `NewPinBox` e `ConfirmPinBox` vengono puliti in `finally`
  anche su errore update/audit.
- CodeRabbit Win7POS finale ha trovato 2 finding batch fisici:
  `start-physical-win7-bridge.bat` senza timeout e `collect-logs` sempre
  successo. Corretti con warning operativo/documentazione timeout e exit code
  non-zero se non viene raccolto alcun file.
- Check freschi TASK-071: build Release x86 PASS 0 warnings/0 errors,
  `check-dialog-standards`, `check-pos-online-bootstrap`, `check-pos-online-client`,
  `check-pos-catalog-pull`, `check-product-dialog-free-text` tutti PASS,
  `bash -n` su 8 script PASS, `git diff --check` PASS.
- File Win7POS nuovi/toccati da closure includono anche
  `ProductPriceHistory*`, `ProductsViewModel`, `ProductsWorkflowService` e
  `scripts/win7pos/physical-win7/start-physical-win7-bridge.bat`.

## Prossima fase

Closure completata da TASK-071 come `DONE`. Residui: Win7 fisico,
TLS/root certs/native SQLite e sales sync completo.
