# TASK-042B - Win7POS Build Parity Diagnosis

## Sintesi

Il pacchetto Codex locale non era equivalente al Release Pack GitHub.

Root cause piu probabile e verificata lato file/package:

- TASK-042 ha copiato output raw da `dotnet build` locale macOS (`dotnet 10.0.300`) invece del Release Pack ufficiale GitHub.
- Il pacchetto raw manca il native `e_sqlite3.dll`, presente nel Release Pack GitHub funzionante.
- Il pacchetto raw manca anche metadata release (`README_RUN.txt`, `RELEASE_CHECKLIST.txt`, `VERSION.txt`) e payload `cli/`/runtime prodotto dalla workflow ufficiale.
- I due pacchetti derivano dallo stesso commit Win7POS (`5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`), quindi non e una divergenza di commit.

La causa runtime Windows 7 resta da confermare con Event Viewer, ma la differenza package e sufficiente per correggere il flusso: usare il Release Pack GitHub come sorgente ufficiale per il bridge fisico.

## Input confrontati

Bad/Codex package:

`/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038/app`

Good/GitHub package:

`/Users/minxiang/Downloads/Win7POS_20260602_0242`

Good executable trovato ricorsivamente:

`/Users/minxiang/Downloads/Win7POS_20260602_0242/Win7POS.Wpf.exe`

## Report comparativi generati

Directory:

`docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/`

File:

- `build-compare-summary.md`
- `build-compare-files.csv`
- `missing-from-codex.md`
- `extra-in-codex.md`
- `different-hashes.md`

Risultati principali:

| Metrica | Bad/Codex | Good/GitHub |
| --- | ---: | ---: |
| File | 38 | 96 |
| Byte totali | 13,831,941 | 95,369,218 |
| `e_sqlite3.dll` | assente | presente |
| `cli/` | assente | presente |
| `VERSION.txt` | assente | presente |

Diff totals:

- Missing from Codex: `58`
- Extra in Codex: `0`
- Same relative path, different SHA-256: `7`

Differenze hash sui path comuni:

- `Win7POS.Core.dll`
- `Win7POS.Core.pdb`
- `Win7POS.Data.dll`
- `Win7POS.Data.pdb`
- `Win7POS.Wpf.exe`
- `Win7POS.Wpf.exe.config`
- `Win7POS.Wpf.pdb`

Nota config:

- `Win7POS.Wpf.exe.config` differisce solo per line endings/fine file nel diff testuale osservato.
- La differenza bloccante non e la config: il gap critico e il native `e_sqlite3.dll` mancante nel pacchetto Codex.

## Workflow GitHub Release Pack

Workflow:

`/Users/minxiang/Projects/Win7POS/.github/workflows/release-pack.yml`

Run funzionante:

- Run id: `26795001032`
- URL: `https://github.com/XNIW/Win7POS/actions/runs/26795001032`
- Workflow: `Release Pack`
- Branch: `main`
- Commit: `5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`
- Status: `completed`
- Conclusion: `success`
- Artifact usato: `Win7POS-ReleasePack-x86`
- Artifact disponibili e non scaduti:
  - `Win7POS-ReleasePack-x86`
  - `Win7POS-dist`
  - `Win7POS-Setup`

Passaggi workflow rilevanti:

1. setup `dotnet-version: "8.0.x"` su `windows-latest`;
2. build CLI Release;
3. selftest CLI `--selftest --keepdb`;
4. build WPF Release x86;
5. prepare dist:
   - copia output WPF in `dist/Win7POS`;
   - copia output CLI in `dist/Win7POS/cli`;
   - scrive `README_RUN.txt`;
   - scrive `RELEASE_CHECKLIST.txt`;
   - scrive `VERSION.txt`;
   - crea `dist/Win7POS_yyyyMMdd_HHmm.zip`;
6. build installer Inno Setup;
7. upload artifact `Win7POS-Setup`, `Win7POS-dist`, `Win7POS-ReleasePack-x86`.

## Risposte alle domande TASK-042B

1. Codex ha copiato raw build output invece del Release Pack?

Si. Il manifest del pacchetto Bad dichiara:

`buildCommand=dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86`

e:

`outputPath=/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/bin/x86/Release/net48`

2. Il pacchetto Codex manca native DLL?

Si. `e_sqlite3.dll` e assente nel Bad e presente nel Good.

3. Il pacchetto Codex manca cartelle `runtimes/win-x86/native` o equivalenti?

Nel livello WPF root manca `e_sqlite3.dll`. Il Good contiene anche payload runtime sotto `cli/runtimes/win-x86/native/e_sqlite3.dll`; il Bad non contiene `cli/` ne cartelle `runtimes`.

4. Il pacchetto Codex ha `.config` diverso?

Si, hash e dimensione differiscono (`1835` vs `1872` byte), ma il diff testuale mostra line endings/fine file. Non e stata osservata una differenza semantica nei binding redirect.

5. Il pacchetto Codex e stato creato da commit diverso?

No. Bad manifest e Good `VERSION.txt` puntano entrambi a:

`5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`

6. Il pacchetto Codex e stato creato con SDK/toolchain diversa?

Si. TASK-042 locale ha registrato `dotnet --version: 10.0.300` su macOS; GitHub Release Pack usa `actions/setup-dotnet@v5` con `8.0.x` su `windows-latest`.

7. Il GitHub Release Pack contiene installer/bootstrap/script che fanno operazioni necessarie?

Il Good usato dall'utente e il Release Pack estratto, non l'installer. L'installer e un artifact separato (`Win7POS-Setup`). Il Release Pack include pero passaggi necessari di packaging: metadata release, CLI opzionale, e native SQLite x86 (`e_sqlite3.dll`) che il raw output Codex non include.

8. Il pacchetto Codex non parte per file mancanti o crash startup?

Evidence file/package: mancano file critici, in particolare `e_sqlite3.dll`. Evidence Windows 7 runtime: non ancora raccolta. Sono stati preparati batch diagnostici per Event Viewer e process check per confermare il crash/silent exit lato macchina Windows 7.

## Diagnostica Windows 7 preparata

Directory bridge:

`/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/`

File:

- `run-bad-build-diagnostic.bat`
- `run-good-build-diagnostic.bat`
- `collect-win7-eventlog.bat`
- `README-WIN7-DIAGNOSTIC.md`

Output previsto su Windows 7:

`Win7POSBridge/logs/TASK-042-build-compare/`

I batch usano comandi Windows 7 compatibili (`tasklist`, `wevtutil`, `wmic` se disponibile, `dir`, `echo %ERRORLEVEL%`) e non richiedono admin.

## Fix del flusso

Decisione: non rendere il Mac raw build path sorgente ufficiale del test fisico.

Motivo:

- la workflow ufficiale GitHub e gia presente;
- il Release Pack GitHub e quello verificato funzionante su Windows 7;
- il Mac local raw output non include il native packaging Windows x86 equivalente.

Script aggiunti:

- `scripts/win7pos/compare-build-folders.sh`
- `scripts/win7pos/fetch-github-release-pack-to-bridge.sh`

Comando eseguito per creare il nuovo package corretto:

```bash
scripts/win7pos/fetch-github-release-pack-to-bridge.sh --run-id 26795001032
```

Nuovo package bridge:

`/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/`

Contenuto:

- `app/` con Release Pack ufficiale estratto;
- `manifest.json`;
- `checksums/SHA256SUMS.txt`;
- `checksums/APP-FILES.txt`;
- `docs/SOURCE-INFO.md`;
- `docs/RUNBOOK-WIN7POS-GITHUB-RELEASE-PACK.md`;
- `docs/DIFFERENCES-FROM-BROKEN-CODEX-PACK.md`;
- `diagnostics/` con batch Windows 7;
- `artifact-download/Win7POS_20260602_0242.zip`.

Verifica package nuovo:

- File in `app/`: `96`
- Byte in `app/`: `95,369,218`
- `e_sqlite3.dll`: presente
- `VERSION.txt`: presente
- `Win7POS.Wpf.exe`: presente
- `Win7POS.Wpf.exe.config`: presente
- `containsSecrets`: `false` nel manifest

Confronto nuovo package vs Good manuale:

`/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/compare-against-manual-good/`

Risultato:

- Missing: `0`
- Extra: `0`
- Different SHA-256: `0`
- File: `96` vs `96`
- Byte totali: `95,369,218` vs `95,369,218`

## Check finali eseguiti

| Comando | Esito |
| --- | --- |
| `npm run security:scan` | `PASS`, output include `Security scan passed.` |
| `npm run test:foundation` | `PASS`, `tests 184`, `pass 184`, `fail 0` |
| `git diff --check` | `PASS`, output vuoto |
| Verifica package `Win7POS.Wpf.exe`, `e_sqlite3.dll`, `README_RUN.txt`, `VERSION.txt` | `PASS`, tutti presenti |

## Stato residuo

- Windows 7 run del nuovo package: `NOT_RUN_MANUAL_WIN7_PENDING`
- Event Viewer reale Windows 7: `NOT_RUN_MANUAL_WIN7_PENDING`
- Sales Sync live: `NOT_RUN_WIN7_MANUAL_PENDING`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage finale: `NOT_STAGED`
