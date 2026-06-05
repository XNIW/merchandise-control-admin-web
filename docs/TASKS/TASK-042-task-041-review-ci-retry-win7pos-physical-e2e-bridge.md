# TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge

## Informazioni generali

- ID: `TASK-042`
- Titolo: `TASK-041 Review, CI retry and Win7POS physical E2E bridge`
- Stato: `READY_FOR_WIN7_MANUAL_TEST`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-04`
- Ultimo aggiornamento: `2026-06-04`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-042/README.md`
- Branch Admin Web: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `READY_FOR_WIN7_MANUAL_TEST`
- Verdict corrente: `READY_FOR_WIN7_MANUAL_TEST`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Obiettivo

Eseguire la review/fix finale di `TASK-041`, confermare il retry CI GitHub Actions, verificare il comportamento `WIN7POS_REPO_PATH` e preparare un bridge pratico per il test fisico Win7POS su Windows 7.

Il task non dichiara `DONE`: manca ancora il run reale su Windows 7 fisico o VM equivalente, e manca una vendita sintetica Win7POS verificata end-to-end in Admin Web/Supabase.

## Decisioni di tracking

- `TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS`
- `TASK-040_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS_SUPERSEDED_BY_TASK-041`
- `TASK-042_IS_ACTIVE_REVIEW_BRIDGE`
- `CI_GITHUB_ACTIONS_GREEN`
- `WIN7POS_PHYSICAL_PACKAGE_READY`
- `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`
- `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## Riconciliazione limitata 2026-06-05

- Platform Master Console/Admin Web smoke: `PASS_AUTOMATED_PLATFORM_MASTER_CONSOLE` tramite `TASK-045`.
- `TASK-043`: `DONE_RECONCILED`.
- `TASK-044`: `DONE_RECONCILED`.
- `TASK-042`: resta `READY_FOR_WIN7_MANUAL_TEST`.
- Win7POS fisico/live retest: `NOT_RUN`, blocker esterno parcheggiato.
- POS online connection/catalog pull: `NOT_RUN`, blocker esterno parcheggiato.
- Sales Sync live: `NOT_RUN`, blocker esterno parcheggiato.
- Nessun `PASS` live Win7POS/Sales Sync dichiarato senza evidence reale.

## Scope

- Verifica reale dello stato `TASK-041`.
- Verifica CI GitHub Actions e vecchi failure su Win7POS repo assente.
- Simulazioni locali per `WIN7POS_REPO_PATH` e `REQUIRE_WIN7POS_REPO`.
- Discovery locale Win7POS solo tramite variabile/contesto runtime, senza scrivere path assoluti in script CI.
- Scanner Win7POS.
- Build Win7POS WPF Release x86.
- Copia dell'intera cartella output in `Win7POSBridge/outbox`.
- Manifest, checksum, zip e runbook manuale Windows 7.
- Template risultato per il test remoto.
- Aggiornamento Master Plan, `TASK-041` e evidence.

## Out of scope

- No commit e no push.
- No stage finale.
- No Supabase production.
- No Cloudflare/Vercel production deploy.
- No salvataggio di secret, service-role key, token, JWT, PIN, password o connection string.
- No dati reali negozio/clienti.
- No dichiarazione `DONE`.
- No dichiarazione Win7POS live E2E PASS senza run Windows 7.
- No dichiarazione Sales Sync live PASS senza vendita Win7POS verificata lato Admin Web/Supabase.

## Letture obbligatorie completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md`
- `docs/TASKS/EVIDENCE/TASK-041/README.md`
- `docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md`
- `.github/workflows/ci.yml`
- `scripts/security-checks.mjs`
- Test foundation collegati a Win7POS/TASK-041:
  - `tests/foundation/task-022-023-pos-dashboard-win7pos-client.test.mjs`
  - `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`
  - `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
  - `tests/foundation/task-029-production-path-staging-win7pos-bootstrap.test.mjs`
  - `tests/foundation/task-032-local-pos-e2e-harness.test.mjs`
  - `tests/foundation/task-040-runtime-readiness.test.mjs`
  - `tests/foundation/task-041-runtime-completion.test.mjs`

## Baseline Admin Web

Eseguita prima delle modifiche repo TASK-042.

| Comando | Esito |
| --- | --- |
| `git status --short --branch` | `## main...origin/main` |
| `git diff --check` | `PASS`, output vuoto |
| `git diff --cached --name-status` | `PASS`, output vuoto |
| `git log --oneline -n 5` | `6d958c6 Merge TASK-041 runtime completion`; `52b4ecf Implement TASK-041 runtime completion`; `ef310a0 Document safe Supabase env placeholders`; `d740d15 Make Win7POS foundation tests optional in CI`; `8ff15fb Make Win7POS security checks optional in CI` |

Branch di lavoro creato dopo baseline:

- `codex/task-042-review-ci-win7pos-bridge`

## Stato TASK-041 prima e dopo

Prima di `TASK-042`:

- `TASK-041`: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Milestone: `PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS`
- Verdict finale review/fix: `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION_ADMIN_WEB_RUNTIME_ONLY`
- Win7POS physical bridge: non completato
- Sales Sync live da Win7POS: non eseguito
- CI GitHub Actions post-fix: da confermare

Dopo `TASK-042`:

- `TASK-041`: resta `REVIEW_WITH_EXTERNAL_BLOCKERS`
- `TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS`
- CI GitHub Actions: confermata verde su `main`
- Win7POS package bridge: pronto in `Win7POSBridge/outbox`
- Windows 7 local smoke sul package `TASK-042B`: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`
- Admin Web manual test: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- POS online connection/catalog pull: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- Sales Sync live: `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## GitHub Actions / CI

Ultimo run:

- Run id: `26983953492`
- Workflow: `CI`
- Job: `Verify`
- Branch: `main`
- Commit: `6d958c64ef016c634740eab66a496af75d95746c`
- URL: `https://github.com/XNIW/merchandise-control-admin-web/actions/runs/26983953492`
- Stato: `completed`
- Conclusion: `success`

Step Verify passati:

- Checkout
- Setup Node
- Restore Next.js cache
- Install dependencies
- Install Playwright Chromium
- Security scan
- Foundation tests
- Typecheck
- Lint
- Build
- UI smoke
- Diff whitespace check

Vecchio errore confermato e superato:

- Run storico `26974280617`: `npm run security:scan` falliva con `Win7POS repo is missing at /Users/minxiang/Projects/Win7POS`.
- Run intermedio `26975644156`: `security:scan` passava con `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE`, ma `test:foundation` falliva con 4 test Win7POS diretti.
- Run `26976116947`: `success`, foundation tests passavano dopo skip controllati.
- Run finale `26983953492`: `success`, foundation `tests 182`, `pass 178`, `skipped 4`, `fail 0`.

## Fix WIN7POS_REPO_PATH

Comportamento verificato:

- In CI GitHub, se Win7POS non e disponibile e `REQUIRE_WIN7POS_REPO` non e `1`, i controlli esterni Win7POS diventano `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE`, non `FAIL`.
- Se `REQUIRE_WIN7POS_REPO=1`, il repo mancante fallisce come atteso.
- Se `WIN7POS_REPO_PATH` punta a un repo valido, i controlli Win7POS vengono eseguiti.

Simulazioni locali:

| Comando | Esito |
| --- | --- |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan` | `PASS_WITH_SKIP`, output include `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE` |
| `REQUIRE_WIN7POS_REPO=1 WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run security:scan` | `FAIL_EXPECTED`, output include `Win7POS repo is missing at /tmp/missing-win7pos-ci-fixture` |
| `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run test:foundation` | `PASS_WITH_SKIPS`, `tests 182`, `pass 178`, `skipped 4`, `fail 0` |

## Win7POS discovery e baseline

`WIN7POS_REPO_PATH` non era impostato nella shell iniziale.

Discovery locale:

- Repo rilevato: `/Users/minxiang/Projects/Win7POS`
- Uso previsto: equivalente a `export WIN7POS_REPO_PATH="/Users/minxiang/Projects/Win7POS"` per questa sessione.
- Il path non e stato salvato come requisito in script CI.

Baseline Win7POS:

| Comando | Esito |
| --- | --- |
| `git status --short --branch` | `## main...origin/main`; dirty preesistente: `.gitignore`, `docs/dev/`, `scripts/win7pos/` |
| `git diff --check` | `PASS`, output vuoto |
| `git log --oneline -n 5` | `5e35a37 TASK-029 harden Win7POS bootstrap validation`; `d2c3d4b TASK-029 reconcile Win7POS online bootstrap`; `a7f4843 TASK-028 Win7POS catalog pull tombstones`; `6efc672 Complete TASK-027 catalog cursor client`; `60f10de TASK-026 catalog pull client lato POS` |

Toolchain:

- `dotnet --version`: `10.0.300`
- `pwsh --version`: `PowerShell 7.6.2`

Scanner Win7POS:

| Comando | Esito |
| --- | --- |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |

Build Win7POS:

```bash
dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86
```

Esito:

- `PASS`
- Output: `src/Win7POS.Wpf/bin/x86/Release/net48/Win7POS.Wpf.exe`
- `Avvisi: 0`
- `Errori: 0`

## Win7POSBridge package

`WIN7POS_BRIDGE_ROOT` non era impostato nella shell iniziale.

Discovery locale:

- Bridge rilevata: `/Users/minxiang/Projects/Win7POSBridge`
- Sottocartelle create/verificate: `outbox`, `inbox`, `logs`, `screenshots`, `done`, `failed`, `drop`.

Pacchetto creato:

- Cartella: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038`
- Path sintetico richiesto: `Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038`
- App: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/app`
- Zip: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038.zip`
- Manifest: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/manifest.json`
- Checksums: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/checksums/SHA256SUMS.txt`
- Zip checksum: `4175ca9e18a422bb696b323812d64a55b78a2a58f8e47545d6a55a4a1600944b`

Contenuto:

- `app/`: intera cartella output Release/x86/net48, non solo l'exe.
- `docs/RUNBOOK-WIN7POS-PHYSICAL-SMOKE.md`
- `docs/EXPECTED-RESULTS.md`
- `docs/MANUAL-RESULT-TEMPLATE.md`
- `docs/TROUBLESHOOTING-WIN7.md`
- `checksums/SHA256SUMS.txt`
- `checksums/APP-FILES.txt`
- `checksums/ZIP-SHA256SUM.txt`
- `logs/BUILD-SUMMARY.md`
- `manifest.json`

Verifiche pacchetto:

- File in `app/`: `38`
- `Win7POS.Wpf.exe`: presente
- `Win7POS.Wpf.exe.config`: presente
- DLL runtime: presenti
- Asset: presenti
- `zip -T`: `OK`
- `containsSecrets`: `false` nel manifest

## Runbook manuale Windows 7

Il runbook indica all'utente di:

1. Aprire Windows 7 remoto.
2. Aprire `Win7POSBridge/outbox`.
3. Trovare `TASK-042-win7pos-physical-e2e-20260604-190038`.
4. Copiare tutta la cartella in locale, per esempio `C:\Win7POS-E2E\TASK-042-win7pos-physical-e2e-20260604-190038\`.
5. Non eseguire l'app dalla cartella condivisa.
6. Aprire `app`.
7. Avviare `Win7POS.Wpf.exe`.
8. Fare screenshot della schermata iniziale.
9. Provare login, heartbeat, catalog pull, operazione POS, vendita sintetica e sync solo se backend non-production e credenziali test sono disponibili.
10. Salvare risultati in `Win7POSBridge/inbox`, log in `Win7POSBridge/logs` e screenshot in `Win7POSBridge/screenshots`.

## Stato manual results

Controllati:

- `/Users/minxiang/Projects/Win7POSBridge/inbox`
- `/Users/minxiang/Projects/Win7POSBridge/logs`
- `/Users/minxiang/Projects/Win7POSBridge/screenshots`
- `/Users/minxiang/Projects/Win7POSBridge/done`
- `/Users/minxiang/Projects/Win7POSBridge/failed`

Esito:

- Nessun file risultato `TASK-042` era presente nella bridge prima del feedback TASK-042C.
- Feedback manuale utente TASK-042C: package `TASK-042B` avvia UI su Windows 7, login locale e smoke POS locale passano.
- Windows 7 local smoke: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`
- Admin Web manual test: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- POS online connection/catalog pull: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- Sales Sync live: `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## Supabase, Cloudflare/OpenNext e Sales Sync

Stato ereditato da `TASK-041`:

- Supabase dev/non-production: `PASS_SUPABASE_DEV_APPLIED`
- Cloudflare/OpenNext preview locale: `PASS_CLOUDFLARE_OPENNEXT_PREVIEW`
- Sales Sync foundation: `PASS_SALES_SYNC_FOUNDATION`

Stato non completato in `TASK-042`:

- Supabase verifica post vendita Win7POS online: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- Cloudflare deploy production: `NOT_RUN_PRODUCTION_FORBIDDEN`
- Sales Sync live Win7POS -> Admin Web -> Supabase: `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## TASK-042B - Build parity diagnosis

Contesto nuovo:

- Pacchetto Codex locale copiato nella bridge: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/app`.
- Esito reale Windows 7: doppio click su `Win7POS.Wpf.exe` non apre UI visibile.
- Pacchetto GitHub manuale funzionante: `/Users/minxiang/Downloads/Win7POS_20260602_0242`.
- Esito reale Windows 7: UI visibile e login operatore aperto.

Inventario comparativo generato:

- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-summary.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/build-compare-files.csv`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/missing-from-codex.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/extra-in-codex.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/different-hashes.md`
- `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-parity-diagnosis.md`

Risultato comparativo:

- Bad/Codex: `38` file, `13,831,941` byte.
- Good/GitHub: `96` file, `95,369,218` byte.
- Missing from Codex: `58`.
- Extra in Codex: `0`.
- Same relative path, different SHA-256: `7`.
- `e_sqlite3.dll`: assente nel Bad/Codex, presente nel Good/GitHub.
- `cli/`: assente nel Bad/Codex, presente nel Good/GitHub.
- Metadata release `VERSION.txt`, `README_RUN.txt`, `RELEASE_CHECKLIST.txt`: assenti nel Bad/Codex, presenti nel Good/GitHub.

Diagnosi:

- TASK-042 ha copiato raw build output invece del Release Pack GitHub.
- Bad/Codex e Good/GitHub usano lo stesso commit Win7POS `5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`; non e un problema di commit diverso.
- Toolchain diversa: local build su macOS con `dotnet 10.0.300`; Release Pack GitHub su `windows-latest` con `dotnet 8.0.x`.
- Il `.config` ha hash diverso ma il diff testuale osservato e limitato a line endings/fine file.
- La causa file/package piu forte e l'assenza del native SQLite x86 `e_sqlite3.dll` nel Bad/Codex.
- Event Viewer Windows 7 reale resta da raccogliere; non viene dichiarato crash root-cause runtime senza log.

Workflow GitHub Release Pack:

- File: `/Users/minxiang/Projects/Win7POS/.github/workflows/release-pack.yml`.
- Run id usato: `26795001032`.
- Workflow: `Release Pack`.
- Artifact: `Win7POS-ReleasePack-x86`.
- Commit: `5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`.
- Steps rilevanti: build CLI, selftest CLI, build WPF x86, prepare dist, scrittura metadata release, zip `Win7POS_*.zip`, build installer separato, upload artifact.

Fix flusso:

- Aggiunto `scripts/win7pos/compare-build-folders.sh`.
- Aggiunto `scripts/win7pos/fetch-github-release-pack-to-bridge.sh`.
- Decisione: non usare il raw output locale macOS come sorgente del test fisico; usare il Release Pack GitHub ufficiale.
- Comando eseguito: `scripts/win7pos/fetch-github-release-pack-to-bridge.sh --run-id 26795001032`.

Diagnostica Windows 7 creata:

- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/run-bad-build-diagnostic.bat`
- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/run-good-build-diagnostic.bat`
- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/collect-win7-eventlog.bat`
- `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/README-WIN7-DIAGNOSTIC.md`

Nuovo pacchetto bridge corretto:

- Cartella: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656`
- App: `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/app`
- Artifact originale: `artifact-download/Win7POS_20260602_0242.zip`
- Manifest: `manifest.json`
- Checksums: `checksums/SHA256SUMS.txt`
- Source info: `docs/SOURCE-INFO.md`
- Runbook: `docs/RUNBOOK-WIN7POS-GITHUB-RELEASE-PACK.md`
- Differenze: `docs/DIFFERENCES-FROM-BROKEN-CODEX-PACK.md`
- Diagnostics: `diagnostics/`

Verifiche nuovo pacchetto:

- `app/`: `96` file, `95,369,218` byte.
- `e_sqlite3.dll`: presente.
- `VERSION.txt`: presente.
- `containsSecrets`: `false` nel manifest.
- Confronto nuovo package vs Good manuale: `0` missing, `0` extra, `0` hash differenti.

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

Stato manuale residuo dopo TASK-042C:

- Windows 7 local smoke del package `TASK-042B`: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`.
- Event Viewer reale Windows 7: `NOT_RUN_NOT_REQUIRED_AFTER_SUCCESSFUL_LOCAL_SMOKE`.
- Admin Web manual test: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`.
- POS online connection/catalog pull: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`.
- Sales Sync live: `NOT_RUN_SALES_SYNC_LIVE_PENDING`.

## Criteri di accettazione

- CI/harness verificati: `PASS`
- Fix `WIN7POS_REPO_PATH` verificato: `PASS`
- Win7POS Release x86 build: `PASS`
- Pacchetto completo copiato in bridge: `PASS`
- Build parity diagnosis: `PASS`
- Nuovo GitHub Release Pack bridge package: `PASS`
- Zip e checksum creati: `PASS`
- Runbook manuale creato: `PASS`
- Batch diagnostici Windows 7 creati: `PASS`
- Template risultato creato: `PASS`
- Windows 7 local smoke package `TASK-042B`: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`
- Admin Web manual test: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- POS online connection/catalog pull: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- Sales Sync live: `NOT_RUN_SALES_SYNC_LIVE_PENDING`

## Check finali

Admin Web:

| Comando | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `npm run security:scan` | `PASS` |
| `npm run test:foundation` | `PASS`, `tests 184`, `pass 184`, `fail 0` |
| `npm run typecheck` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS`, warning noti `middleware` deprecato e Node `[DEP0205]` |
| `npm run verify` | `PASS_WITH_WARNINGS`, stessi warning build |
| `npm run cf:build` | `PASS_WITH_WARNINGS`, warning OpenNext copy pacchetti zip noti; worker generato |
| `npm run test:ui-smoke:ci` | `PASS`, `43 passed` |
| `npm run test:shop-admin-auth-smoke` | `PASS_WITH_SKIPS`, `1 passed`, `2 skipped` |
| `node --test tests/foundation/task-041-runtime-completion.test.mjs` | `PASS`, `tests 2`, `pass 2`, `fail 0` |

Win7POS:

| Comando | Esito |
| --- | --- |
| `git diff --check` | `PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-dialog-standards.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS`, `RESULT: ALL PASS` |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS`, `RESULT: ALL PASS` |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86` | `PASS`, `Avvisi: 0`, `Errori: 0` |

## Stati ammessi

- `READY_FOR_WIN7_MANUAL_TEST`
- `PASS_WITH_MANUAL_WIN7_PENDING`
- `READY_FOR_CI_RETRY`
- `PASS_WITH_NOTES`
- `REVIEW_WITH_EXTERNAL_BLOCKERS`
- `CHANGES_REQUIRED`
- `DONE`, solo con CI, Win7POS live E2E e Sales Sync live realmente verificati e conferma esplicita utente.

## Rischi residui

- Windows 7 fisico/VM equivalente non e stato ancora eseguito.
- Login POS reale non verificato.
- Heartbeat reale non verificato.
- Catalog pull reale da Win7POS non verificato.
- Vendita sintetica reale da Win7POS non inviata.
- Idempotenza Sales Sync live non verificata da POS.
- Supabase/Admin Web post-sync non verificati per assenza vendita live.
- Win7POS repo aveva dirty preesistente; `TASK-042` non lo ha modificato manualmente.

## Handoff

Verdict finale per questo handoff: `READY_FOR_WIN7_MANUAL_TEST`.

Prossima azione concreta:

1. L'utente deve aprire Windows 7 remoto.
2. Copiare il nuovo pacchetto GitHub Release Pack da `Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656`.
3. Eseguire `app\Win7POS.Wpf.exe` da disco locale.
4. Se la UI non appare, eseguire `diagnostics\run-good-build-diagnostic.bat`.
5. Compilare `MANUAL-RESULT-TEMPLATE.md` o un risultato equivalente in `Win7POSBridge/inbox`.
6. Salvare risultato/log/screenshot nella bridge.
6. Dopo il ritorno dei risultati, Codex/reviewer potra aggiornare evidence e distinguere `APP_SMOKE_PASS_SALES_SYNC_PENDING` da `WIN7POS_SALES_SYNC_E2E_PASS`.

No commit eseguito.
No push eseguito.
No stage finale.

## TASK-042C - Manual Win7 sync, Product dialog UX fix e Admin Web manual runbook

Input manuale ricevuto:

- Package provato su Windows 7: `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`.
- App launch/UI/login/menu/carrello/prodotto manuale/sconto/quantita/registro/pagamento: passati in smoke locale.
- Online POS, Admin Web manual test e Sales Sync live: non eseguiti.

Risultati registrati:

- `PASS_LAUNCHES_ON_WIN7`
- `PASS_LOCAL_OPERATOR_LOGIN`
- `PASS_MENU_UI`
- `PASS_LOCAL_CART_BASIC`
- `PASS_LOCAL_PRODUCT_CREATE`
- `PASS_LOCAL_DISCOUNT`
- `PASS_LOCAL_QTY_EDIT`
- `PASS_LOCAL_PAYMENT_SCREEN_OPEN`
- `PASS_LOCAL_REGISTER_OPEN`
- `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- `NOT_RUN_SALES_SYNC_LIVE_PENDING`

Fix Win7POS:

- `ProductEditDialog` ora permette input libero su `Fornitore` e `Categoria` tramite ComboBox editabili.
- `ProductEditViewModel` mantiene selezione esistente e testo libero con normalizzazione trim/case-insensitive.
- `ProductRepository` risolve o crea supplier/category nella stessa transazione del prodotto, evitando duplicati case-insensitive.
- Scanner dedicato: `scripts/check-product-dialog-free-text.ps1`.

Runbook Admin Web:

- Creato `docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md`.
- Copre local dev, Cloudflare non-production, account test `platform_admin`, Platform Admin, shop test, Shop Admin, staff POS, `shop_code`, `staff_code`, credential one-time runtime, URL Admin Web per Win7POS, preparazione test online e cleanup `TASK042_*`.

Package:

- Il package `TASK-042B-github-release-pack-20260604-223656` e confermato come package corretto per lo smoke locale gia passato.
- Il fix UX Win7POS richiede un nuovo GitHub Release Pack dopo commit/push autorizzati per retest fisico affidabile.
- Stato: `PHYSICAL_TEST_REQUIRES_GITHUB_RELEASE_ARTIFACT_AFTER_COMMIT`.

Verdict TASK-042C:

- `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES`
- `WIN7POS_PRODUCT_DIALOG_FIX_READY_FOR_PHYSICAL_RETEST`
- `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`
- `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`
- `NOT_RUN_SALES_SYNC_LIVE_PENDING`

Check finali TASK-042C:

- Admin Web `node --test tests/foundation/task-042-review-ci-win7pos-bridge.test.mjs`: `PASS`, `tests 2`, `pass 2`, `fail 0`.
- Admin Web `npm run security:scan`: `PASS`, `Security scan passed.`.
- Admin Web `npm run test:foundation`: `PASS`, `tests 184`, `pass 184`, `fail 0`.
- Admin Web `git diff --check`: `PASS`, output vuoto.
- Win7POS `scripts/check-product-dialog-free-text.ps1`: `PASS`, `RESULT: ALL PASS`.
- Win7POS scanner dialog/bootstrap/client/catalog pull: `PASS`, `RESULT: ALL PASS`.
- Win7POS build WPF Release x86: `PASS`, `Avvisi: 0`, `Errori: 0`.
- Win7POS `git diff --check`: `PASS`, output vuoto.
- Package `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`: `Win7POS.Wpf.exe`, `e_sqlite3.dll`, `README_RUN.txt`, `VERSION.txt` presenti; `96` file; `91M`; manifest `containsESqlite3Dll=true`, `containsSecrets=false`.

Il task resta in `REVIEW` / `READY_FOR_WIN7_MANUAL_TEST`; non viene dichiarato `DONE`.

## TASK-042C - Admin Web runtime prep credenziali manuali

Preparazione runtime eseguita dopo la richiesta di accesso alla master Platform Console:

- Target confermato locale/non-production.
- Account test `platform_admin` sintetico creato/ruotato in Supabase Auth locale.
- Credential temporanea condivisa solo in chat runtime; nessuna password, chiave, token o URL effimera salvata in repository.
- `.env.local` non modificato; `npm run dev:db:check` resta `FAIL_CLOSED_EXPECTED` perche `.env.local` punta a `supabase_cloud`, mentre il runtime manuale usa env process-only.
- Admin Web servito su `127.0.0.1:3000`.
- Accesso remoto temporaneo preparato con doppio tunnel Cloudflare non-production: Admin Web e Supabase locale.
- `AuthForm` hardenizzato con `method="post"` per evitare fallback GET con credenziali nella query string.
- Regression foundation aggiornata per il form login.

Verifiche runtime:

- Admin Web local login page: `HTTP 200`.
- Admin Web tunnel login page: `HTTP 200`.
- Supabase tunnel health: `HTTP 200`.
- Playwright login locale con account `platform_admin`: `PASS`, redirect `/platform`.
- Playwright login tunnel con account `platform_admin`: `PASS`, redirect `/platform`.
- Build locale con env process-only/tunnel: `PASS`.

Stato manuale residuo invariato:

- Admin Web manual smoke utente: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`.
- POS online connection/catalog pull: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`.
- Sales Sync live: `NOT_RUN_SALES_SYNC_LIVE_PENDING`.
- Nessun `DONE` dichiarato.
