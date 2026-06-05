# Evidence TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge

## Stato

- Task: `TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge`
- Stato task: `READY_FOR_WIN7_MANUAL_TEST`
- Fase: `REVIEW`
- Milestone interna: `READY_FOR_WIN7_MANUAL_TEST`
- Verdict corrente: `READY_FOR_WIN7_MANUAL_TEST`
- Data: `2026-06-04`
- Branch Admin Web: `codex/task-042-review-ci-win7pos-bridge`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Decisioni

- `TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS`
- `TASK-040_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS_SUPERSEDED_BY_TASK-041`
- `TASK-042_IS_ACTIVE_REVIEW_BRIDGE`
- `CI_GITHUB_ACTIONS_GREEN`
- `WIN7POS_PHYSICAL_PACKAGE_READY`
- `WIN7POS_GITHUB_RELEASE_PACK_READY`
- `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`
- `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## Riconciliazione limitata TASK-045

- Data: `2026-06-05`.
- Platform Master Console/Admin Web smoke: `PASS_AUTOMATED_PLATFORM_MASTER_CONSOLE`.
- Evidence: `docs/TASKS/EVIDENCE/TASK-045/README.md`.
- `TASK-043`: `DONE_RECONCILED`.
- `TASK-044`: `DONE_RECONCILED`.
- Stato `TASK-042`: resta `READY_FOR_WIN7_MANUAL_TEST`.
- Win7POS fisico/live retest: `NOT_RUN`.
- POS online connection/catalog pull: `NOT_RUN`.
- Sales Sync live: `NOT_RUN`.
- Nessun `PASS` live Win7POS/Sales Sync dichiarato senza evidence reale.

## Baseline Admin Web

| Comando | Esito |
| --- | --- |
| `git status --short --branch` | `## main...origin/main` |
| `git diff --check` | `PASS`, output vuoto |
| `git diff --cached --name-status` | `PASS`, output vuoto |
| `git log --oneline -n 5` | `6d958c6`, `52b4ecf`, `ef310a0`, `d740d15`, `8ff15fb` |

Branch locale creato per il lavoro:

- `codex/task-042-review-ci-win7pos-bridge`

## GitHub Actions evidence

`gh auth status`:

- `PASS`, account autenticato.
- Token redatto dal CLI.

`gh run list --limit 10`:

- Ultimo run: `26983953492`
- Stato: `completed`
- Conclusion: `success`
- Workflow: `CI`
- Branch: `main`
- Commit: `6d958c64ef016c634740eab66a496af75d95746c`
- URL: `https://github.com/XNIW/merchandise-control-admin-web/actions/runs/26983953492`

`gh run view 26983953492 --json ...`:

- Job `Verify`: `success`
- Step `Security scan`: `success`
- Step `Foundation tests`: `success`
- Step `Typecheck`: `success`
- Step `Lint`: `success`
- Step `Build`: `success`
- Step `UI smoke`: `success`
- Step `Diff whitespace check`: `success`

`gh run view 26983953492 --log-failed`:

- Output vuoto perche nessuno step e fallito.

Vecchi run ispezionati:

- `26974280617`: failure originale in `security:scan`: `Win7POS repo is missing at /Users/minxiang/Projects/Win7POS`.
- `26975644156`: `security:scan` gia convertito a skip, ma `Foundation tests` falliva su 4 test Win7POS diretti.
- `26976116947`: `success`, primo run verde dopo skip foundation.
- `26983953492`: `success`, run finale post merge TASK-041.

Log finale run verde:

- `security:scan`: output include `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE` e `Security scan passed.`
- `test:foundation`: `tests 182`, `pass 178`, `skipped 4`, `fail 0`.

## Simulazioni CI locali

| Comando | Esito | Sintesi output |
| --- | --- | --- |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan` | `PASS_WITH_SKIP` | `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE`; `Security scan passed.` |
| `REQUIRE_WIN7POS_REPO=1 WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan` | `FAIL_EXPECTED` | `Security scan failed`; `Win7POS repo is missing at /tmp/missing-win7pos-ci-fixture` |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run test:foundation` | `PASS_WITH_SKIPS` | `tests 182`, `pass 178`, `skipped 4`, `fail 0` |

Conclusione:

- Il fix `WIN7POS_REPO_PATH` e corretto per CI opzionale.
- `REQUIRE_WIN7POS_REPO=1` mantiene il fail-closed atteso.
- Il vecchio errore assoluto non blocca piu la CI GitHub.

## Baseline Win7POS

`WIN7POS_REPO_PATH` non era impostato.

Discovery locale:

- `/Users/minxiang/Projects/Win7POS`

Comandi:

| Comando | Esito |
| --- | --- |
| `git status --short --branch` | `## main...origin/main`; dirty preesistente: `.gitignore`, `docs/dev/`, `scripts/win7pos/` |
| `git diff --check` | `PASS`, output vuoto |
| `git log --oneline -n 5` | `5e35a37`, `d2c3d4b`, `a7f4843`, `6efc672`, `60f10de` |
| `dotnet --version` | `10.0.300` |
| `pwsh --version` | `PowerShell 7.6.2` |

Dirty Win7POS:

- Trattato come preesistente.
- Nessuna modifica manuale Win7POS eseguita da `TASK-042`.
- Build output prodotto nelle cartelle `bin/obj` usuali.

## Scanner Win7POS

| Comando | Esito |
| --- | --- |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |

## Build Win7POS WPF Release x86

Comando:

```bash
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
```

Output:

- `Win7POS.Core -> /Users/minxiang/Projects/Win7POS/src/Win7POS.Core/bin/x86/Release/netstandard2.0/Win7POS.Core.dll`
- `Win7POS.Data -> /Users/minxiang/Projects/Win7POS/src/Win7POS.Data/bin/x86/Release/netstandard2.0/Win7POS.Data.dll`
- `Win7POS.Wpf -> /Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/bin/x86/Release/net48/Win7POS.Wpf.exe`
- `Compilazione completata.`
- `Avvisi: 0`
- `Errori: 0`

Find exe:

- `src/Win7POS.Wpf/bin/x86/Release/net48/Win7POS.Wpf.exe`
- `src/Win7POS.Wpf/bin/x86/Debug/net48/Win7POS.Wpf.exe`

Release output selezionato:

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/bin/x86/Release/net48`

## Bridge e pacchetto

`WIN7POS_BRIDGE_ROOT` non era impostato.

Discovery locale:

- `/Users/minxiang/Projects/Win7POSBridge`

Sottocartelle presenti/create:

- `done`
- `drop`
- `failed`
- `inbox`
- `logs`
- `outbox`
- `screenshots`

Pacchetto:

- Cartella: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038`
- Sintesi richiesta: `Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038`
- App: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/app`
- Zip: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038.zip`
- Manifest: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/manifest.json`
- Checksum app: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/checksums/SHA256SUMS.txt`
- Checksum zip: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/checksums/ZIP-SHA256SUM.txt`
- Zip SHA-256: `4175ca9e18a422bb696b323812d64a55b78a2a58f8e47545d6a55a4a1600944b`

Contenuto copiato:

- Intera cartella Release/x86/net48 copiata in `app/`.
- File in `app/`: `38`
- Checksum app: `38` righe.
- Totale file pacchetto folder: `47`
- Zip size: `4.6M`
- `zip -T`: `OK`

File principali:

- `app/Win7POS.Wpf.exe`
- `app/Win7POS.Wpf.exe.config`
- `app/Win7POS.Core.dll`
- `app/Win7POS.Data.dll`
- DLL runtime e dipendenze
- `app/Assets/sii_qrcode.png`

Documenti package:

- `docs/RUNBOOK-WIN7POS-PHYSICAL-SMOKE.md`
- `docs/EXPECTED-RESULTS.md`
- `docs/MANUAL-RESULT-TEMPLATE.md`
- `docs/TROUBLESHOOTING-WIN7.md`
- `logs/BUILD-SUMMARY.md`

## Risultati manuali precedenti e sync TASK-042C

Controllati:

- `/Users/minxiang/Projects/Win7POSBridge/inbox`
- `/Users/minxiang/Projects/Win7POSBridge/logs`
- `/Users/minxiang/Projects/Win7POSBridge/screenshots`
- `/Users/minxiang/Projects/Win7POSBridge/done`
- `/Users/minxiang/Projects/Win7POSBridge/failed`

Esito bridge prima del feedback TASK-042C:

- Nessun risultato `TASK-042` trovato.
- Nessun file risultato era ancora presente in `Win7POSBridge/inbox`.

Sync manuale TASK-042C ricevuto in chat:

- Windows 7 app smoke locale sul package `TASK-042B`: `PASS_LAUNCHES_ON_WIN7`.
- Login operatore locale: `PASS_LOCAL_OPERATOR_LOGIN`.
- Menu/carrello/prodotto/sconto/quantita/registro/pagamento: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`.
- POS online/Admin Web/Sales Sync: restano `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`, `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`, `NOT_RUN_SALES_SYNC_LIVE_PENDING`.

## Istruzioni manuali essenziali

1. Aprire Windows 7 remoto.
2. Aprire `Win7POSBridge/outbox`.
3. Copiare `TASK-042-win7pos-physical-e2e-20260604-190038` su disco locale, per esempio `C:\Win7POS-E2E\TASK-042-win7pos-physical-e2e-20260604-190038\`.
4. Non eseguire dalla cartella condivisa.
5. Aprire `app`.
6. Avviare `Win7POS.Wpf.exe`.
7. Fare screenshot iniziale.
8. Provare endpoint non-production.
9. Provare login corretto e login errato se credenziali test sono disponibili.
10. Attendere heartbeat 30-60 secondi se login passa.
11. Provare catalog pull se disponibile.
12. Provare carrello/pagamento locale.
13. Provare vendita sintetica e sync solo se backend non-production e config sono pronti.
14. Salvare risultato in `Win7POSBridge/inbox/TASK-042-result-YYYYMMDD-HHMMSS.md`.
15. Salvare log in `Win7POSBridge/logs/TASK-042-YYYYMMDD-HHMMSS/`.
16. Salvare screenshot in `Win7POSBridge/screenshots/TASK-042-YYYYMMDD-HHMMSS/`.

## Stato Supabase / Cloudflare / Sales Sync

Da `TASK-041`:

- Supabase dev/non-production foundation: `PASS_SUPABASE_DEV_APPLIED`
- Cloudflare/OpenNext preview locale: `PASS_CLOUDFLARE_OPENNEXT_PREVIEW`
- Sales Sync foundation: `PASS_SALES_SYNC_FOUNDATION`

Da `TASK-042`:

- Supabase verifica post sync Win7POS online: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- Cloudflare/OpenNext nuovo check: `NOT_RUN_NOT_REQUIRED_FOR_PACKAGE_BRIDGE`
- Sales Sync live: `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## TASK-042B - Build parity diagnosis e package corretto

Trigger:

- Windows 7 fisico ha confermato che il pacchetto Codex locale `TASK-042-win7pos-physical-e2e-20260604-190038/app` non apre UI al doppio click.
- Il package GitHub manuale `/Users/minxiang/Downloads/Win7POS_20260602_0242` apre correttamente la schermata login operatore.

Report creati:

- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-parity-diagnosis.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-summary.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-files.csv`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/missing-from-codex.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/extra-in-codex.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/different-hashes.md`

Risultato comparativo Bad/Codex vs Good/GitHub:

- Bad/Codex: `38` file, `13,831,941` byte.
- Good/GitHub: `96` file, `95,369,218` byte.
- Missing from Codex: `58`.
- Extra in Codex: `0`.
- Same relative path, different SHA-256: `7`.
- `e_sqlite3.dll`: assente nel Bad/Codex, presente nel Good/GitHub.
- `cli/`: assente nel Bad/Codex, presente nel Good/GitHub.
- `VERSION.txt`, `README_RUN.txt`, `RELEASE_CHECKLIST.txt`: assenti nel Bad/Codex, presenti nel Good/GitHub.

Root cause:

- TASK-042 ha copiato output raw da `dotnet build` locale macOS invece del Release Pack GitHub.
- Bad e Good usano lo stesso commit Win7POS `5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`, quindi il problema non e un commit diverso.
- Toolchain diversa: locale `dotnet 10.0.300` su macOS; GitHub `dotnet 8.0.x` su `windows-latest`.
- Il crash/silent exit Windows 7 del package raw e coerente con package incompleto, in particolare native SQLite x86 mancante; l'Event Viewer reale sul package raw resta `NOT_RUN_MANUAL_WIN7_PENDING`.

GitHub Release Pack verificato:

- Workflow: `Release Pack`
- Run id: `26795001032`
- Commit: `5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`
- Artifact: `Win7POS-ReleasePack-x86`
- Status/conclusion: `completed` / `success`
- Artifact non scaduti: `Win7POS-ReleasePack-x86`, `Win7POS-dist`, `Win7POS-Setup`

Script aggiunti:

- `scripts/win7pos/compare-build-folders.sh`
- `scripts/win7pos/fetch-github-release-pack-to-bridge.sh`

Diagnostica Windows 7 creata nella bridge:

- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/run-bad-build-diagnostic.bat`
- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/run-good-build-diagnostic.bat`
- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/collect-win7-eventlog.bat`
- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/README-WIN7-DIAGNOSTIC.md`

Nuovo package corretto creato:

- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656`
- `app/`: `96` file, `95,369,218` byte.
- `manifest.json`: `containsESqlite3Dll=true`, `containsSecrets=false`.
- `checksums/SHA256SUMS.txt`: `96` righe.
- `diagnostics/`: batch Windows 7 copiati nel package.
- `artifact-download/Win7POS_20260602_0242.zip`: artifact Release Pack scaricato da GitHub.

Verifica nuovo package vs Good manuale:

- Compare output: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/compare-against-manual-good/`
- File: `96` vs `96`.
- Byte totali: `95,369,218` vs `95,369,218`.
- Missing: `0`.
- Extra: `0`.
- Different SHA-256: `0`.

Check finali TASK-042B:

| Comando | Esito |
| --- | --- |
| `npm run security:scan` | `PASS`, output include `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 184`, `pass 184`, `fail 0` |
| `git diff --check` | `PASS`, output vuoto |
| `test -f .../app/Win7POS.Wpf.exe` | `PASS`, file presente |
| `test -f .../app/e_sqlite3.dll` | `PASS`, file presente |
| `test -f .../app/README_RUN.txt` | `PASS`, file presente |
| `test -f .../app/VERSION.txt` | `PASS`, file presente |

Verifica package puntuale:

```text
PRESENT /Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/app/Win7POS.Wpf.exe
PRESENT /Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/app/e_sqlite3.dll
PRESENT /Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/app/README_RUN.txt
PRESENT /Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/app/VERSION.txt
96 files
91M app folder
```

Decisione flusso:

- Non usare piu il raw output locale macOS come sorgente del test fisico Windows 7.
- Usare `scripts/win7pos/fetch-github-release-pack-to-bridge.sh` per scaricare il Release Pack GitHub ufficiale e copiarlo nella bridge.
- Il package consigliato per il prossimo test fisico e `Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656`.

## Check finali Admin Web

| Comando | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 184`, `pass 184`, `fail 0` |
| `npm run typecheck` | `PASS`, `next typegen` e `tsc --noEmit` completati |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti `middleware` deprecato e Node `[DEP0205]`; exit `0` |
| `npm run verify` | `PASS_WITH_WARNINGS`, lint/typecheck/security/build exit `0`; stessi warning build |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, OpenNext build complete; warning copy pacchetti zip noti; worker salvato in `.open-next/worker.js` |
| `npm run test:ui-smoke:ci` | `PASS`, `43 passed` |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_SKIPS`, `1 passed`, `2 skipped` per dataset/sessione non configurati |
| `node --test tests/foundation/task-041-runtime-completion.test.mjs` | `PASS`, `tests 2`, `pass 2`, `fail 0` |

## Check finali Win7POS

| Comando | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, `Avvisi: 0`, `Errori: 0` |

## File modificati nel repo Admin Web

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md`
- `docs/TASKS/EVIDENCE/TASK-041/README.md`
- `docs/TASKS/TASK-042-task-041-review-ci-retry-win7pos-physical-e2e-bridge.md`
- `docs/TASKS/EVIDENCE/TASK-042/README.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-parity-diagnosis.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/*`
- `scripts/win7pos/compare-build-folders.sh`
- `scripts/win7pos/fetch-github-release-pack-to-bridge.sh`
- `docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md`
- `scripts/security-checks.mjs`
- `tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs`
- Test foundation storici aggiornati per accettare `TASK-042` come follow-up attivo di `TASK-041`.

## File modificati nel repo Win7POS

- `src/Win7POS.Wpf/Products/ProductEditDialog.xaml`
- `src/Win7POS.Wpf/Products/ProductEditViewModel.cs`
- `src/Win7POS.Data/Repositories/ProductRepository.cs`
- `scripts/check-product-dialog-free-text.ps1`

## Rischi residui

- Test fisico Windows 7 locale sul nuovo package GitHub Release Pack passato, ma senza POS online.
- Fix UX `Fornitore`/`Categoria` non ancora presente in un nuovo GitHub Release Pack fisico.
- Admin Web manual test non ancora eseguito.
- Login POS online non confermato.
- Heartbeat online non confermato.
- Catalog pull online non confermato.
- Sales Sync live non confermato.
- Supabase/Admin Web post-sync non verificati per mancanza vendita Win7POS live.
- Dirty Win7POS preesistente non riconciliato da questo task.
- CI e verde su `main`; le modifiche TASK-042 locali richiederanno nuova CI dopo eventuale push autorizzato.

## Prossimo passo concreto

Per lo smoke Windows 7 locale gia passato, aprire il package GitHub Release Pack:

- `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`

Per avanzare oltre lo smoke locale:

1. Eseguire `docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md`.
2. Creare un nuovo GitHub Release Pack post-commit per retest fisico del fix UX `Fornitore`/`Categoria`.
3. Eseguire POS online connection/catalog pull.
4. Eseguire Sales Sync live solo dopo Admin Web manual smoke e POS online passati.

No commit eseguito.
No push eseguito.
No stage finale.

## TASK-042C - Manual Win7 sync, Product dialog UX fix e Admin Web runbook

Trigger:

- Il nuovo package GitHub Release Pack scaricato in `TASK-042B` e stato provato su Windows 7.
- Package testato: `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`.
- Il test locale Windows 7 ha trovato un gap UX in Win7POS: nel dialog `Nuovo prodotto`, `Fornitore` e `Categoria` erano solo tendine con valori gia esistenti.

Risultati manuali Windows 7 ricevuti dall'utente:

| Area | Esito |
| --- | --- |
| App launch | `PASS_LAUNCHES_ON_WIN7` |
| UI visibile | `PASS_LAUNCHES_ON_WIN7` |
| Login operatore locale | `PASS_LOCAL_OPERATOR_LOGIN`, operatore `amministratore (Admin)` visibile in alto a destra |
| Menu hamburger | `PASS_MENU_UI` |
| Carrello locale | `PASS_LOCAL_CART_BASIC` |
| Barcode sconosciuto / aggiunta manuale | `PASS_LOCAL_PRODUCT_CREATE` |
| Nuovo prodotto sintetico `TASK042B001` | `PASS_LOCAL_PRODUCT_CREATE` |
| Quantita `+/-` e modifica quantita | `PASS_LOCAL_QTY_EDIT` |
| Sconto percentuale prodotto selezionato | `PASS_LOCAL_DISCOUNT` |
| Totale carrello aggiornato | `PASS_LOCAL_CART_BASIC` |
| Registro vendite apre | `PASS_LOCAL_REGISTER_OPEN` |
| Pagamento screen apre con totale e contanti | `PASS_LOCAL_PAYMENT_SCREEN_OPEN` |
| Crash durante smoke locale | `PASS_NO_CRASH_OBSERVED` |
| Admin Web manual test | `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING` |
| POS online connection/login | `NOT_RUN_POS_ONLINE_CONNECTION_PENDING` |
| Catalog pull online | `NOT_RUN_POS_ONLINE_CONNECTION_PENDING` |
| Sales Sync live Win7POS -> Admin Web -> Supabase | `NOT_RUN_SALES_SYNC_LIVE_PENDING` |

Fix Win7POS implementato nel repo sibling `/Users/minxiang/Projects/Win7POS`:

- `src/Win7POS.Wpf/Products/ProductEditDialog.xaml`: `ComboBox` `Fornitore` e `Categoria` resi editabili con binding `SupplierText` e `CategoryText`.
- `src/Win7POS.Wpf/Products/ProductEditViewModel.cs`: aggiunti `SupplierText`, `CategoryText` e normalizzazione trim/case-insensitive per selezione esistente o testo libero.
- `src/Win7POS.Data/Repositories/ProductRepository.cs`: salvataggio prodotto risolve o crea supplier/category dentro la stessa transazione del prodotto e di `product_meta`.
- `scripts/check-product-dialog-free-text.ps1`: scanner dedicato al nuovo comportamento `Nuovo prodotto`.

Comportamento coperto dal fix:

- selezione fornitore/categoria esistente;
- digitazione nuovo fornitore/categoria direttamente nel dialog;
- creazione supplier/category solo se non esistono gia dopo trim e confronto case-insensitive;
- valore vuoto preserva il comportamento senza supplier/category;
- create/edit prodotto usano lo stesso dialog;
- prodotto e metadati vengono salvati atomicamente insieme al nuovo supplier/category.

Runbook Admin Web creato:

- `docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md`.

Il runbook copre:

- URL local dev `http://127.0.0.1:3000`;
- Cloudflare Quick Tunnel non-production;
- divieto produzione;
- bootstrap/verifica account test `platform_admin`;
- Platform Admin manual smoke;
- creazione/verifica shop test `TASK042_*`;
- Shop Admin manual smoke;
- creazione/verifica staff POS manager/cashier;
- dove leggere `shop_code`, `staff_code`, credential one-time runtime e URL Admin Web per Win7POS;
- preparazione test Win7POS online;
- cleanup dati sintetici `TASK042_*`;
- stop condition e redazione secret.

Package fisico dopo fix UX:

- Il package `TASK-042B-github-release-pack-20260604-223656` resta il package corretto per lo smoke Windows 7 gia passato.
- Il fix UX Win7POS non viene dichiarato presente in quel package storico.
- Per retest fisico del fix UX serve un nuovo GitHub Release Pack prodotto dopo commit/push autorizzati.
- Stato package fix UX: `PHYSICAL_TEST_REQUIRES_GITHUB_RELEASE_ARTIFACT_AFTER_COMMIT`.

Stato TASK-042C:

- `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`.
- `WIN7POS_PRODUCT_DIALOG_FIX_READY_FOR_PHYSICAL_RETEST`.
- `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`.
- `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`.
- `NOT_RUN_SALES_SYNC_LIVE_PENDING`.
- Nessun `DONE` dichiarato.

Check finali TASK-042C eseguiti:

Admin Web:

| Comando | Esito |
| --- | --- |
| `node --test tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs` | `PASS`, `tests 2`, `pass 2`, `fail 0` |
| `npm run security:scan` | `PASS`, `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 184`, `pass 184`, `fail 0` |
| `git diff --check` | `PASS`, output vuoto |

Win7POS:

| Comando | Esito |
| --- | --- |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-product-dialog-free-text.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, `Avvisi: 0`, `Errori: 0` |
| `git diff --check` | `PASS`, output vuoto |

Verifica package `TASK-042B` richiesta:

| File | Esito |
| --- | --- |
| `Win7POS.Wpf.exe` | `PRESENT` |
| `e_sqlite3.dll` | `PRESENT` |
| `README_RUN.txt` | `PRESENT` |
| `VERSION.txt` | `PRESENT` |

Dettagli package:

- Cartella: `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`.
- File in `app`: `96`.
- Size `app`: `91M`.
- Manifest: `containsESqlite3Dll=true`, `containsSecrets=false`.

## TASK-042C - Admin Web runtime prep per test manuale

Preparazione ambiente manuale eseguita solo su target locale/non-production:

- Supabase locale verificato da CLI; `.env.local` resta fail-closed perche punta a `supabase_cloud` e non e stato modificato.
- Account test `platform_admin` sintetico creato/ruotato in Supabase Auth locale; la credential temporanea viene condivisa solo in chat runtime e non viene salvata in repository/evidence.
- Admin Web avviato in locale su `127.0.0.1:3000` con env process-only.
- Per accesso remoto temporaneo e stato preparato un doppio tunnel Cloudflare non-production: Admin Web e Supabase locale. Gli URL `trycloudflare.com` del run corrente non vengono salvati in repository/evidence.
- Hardening login applicato: `src/components/auth/AuthForm.tsx` dichiara `method="post"` per evitare fallback GET con credenziali nella query string se il client JS non intercetta il submit.
- Regression foundation aggiornata in `tests/foundation/supabase-foundation.test.mjs`.

Verifiche runtime eseguite:

| Check | Esito |
| --- | --- |
| `npm run dev:db:check` | `FAIL_CLOSED_EXPECTED`, `.env.local` punta a `supabase_cloud`; local DB container `PASS` |
| Admin Web local `/auth/login?next=/platform` | `HTTP 200` |
| Supabase tunnel `/auth/v1/health` | `HTTP 200` |
| Admin Web tunnel `/auth/login?next=/platform` | `HTTP 200` |
| Playwright login locale `platform_admin` | `PASS`, redirect `/platform` |
| Playwright login tunnel `platform_admin` | `PASS`, redirect `/platform` |
| `npm run build` con env process-only locale/tunnel | `PASS` |

Stato residuo invariato:

- Admin Web manual smoke utente: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`.
- POS online connection/login: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`.
- Catalog pull online: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`.
- Sales Sync live Win7POS -> Admin Web -> Supabase: `NOT_RUN_SALES_SYNC_LIVE_PENDING`.
- Nessun `DONE` dichiarato.
