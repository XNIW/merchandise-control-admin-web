# TASK-034 Evidence

## Stato corrente

- Task: `TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`
- Stato task: `DONE_RECONCILED_WITH_NOTES`
- Fase: `DONE_RECONCILED`
- Milestone interna: `FINAL_RECONCILED_WITH_NOTES`
- Data apertura: `2026-06-02`
- Data reconciliation finale: `2026-06-02`
- Branch Admin Web: `main`
- Branch Win7POS: `main`, se usato
- Verdict corrente: `DONE_WITH_NOTES`
- Verdict finale: `DONE_WITH_NOTES`
- Stage: `NOT_STAGED`
- Commit: `NOT_COMMITTED`
- Push: `NOT_PUSHED`

## Letture iniziali

| Fonte | Esito | Note |
| --- | --- | --- |
| Allegato utente `TASK-034` | `PASS` | Mega-task unico con phase gate rigidi e divieto di `DONE`. |
| `README.md` | `PASS` | Stack Next.js App Router, TypeScript, Tailwind; secret vietati. |
| `AGENTS.md` | `PASS` | Lingua italiana, task attivo unico, lettura Master Plan/task/codice prima delle modifiche. |
| `CLAUDE.md` | `PASS` | Codex executor/fixer; `DONE` solo dopo conferma esplicita utente. |
| `docs/MASTER-PLAN.md` | `PASS` | TASK-033 era task attivo in `REVIEW_WITH_BLOCKERS`; TASK-029/031/032/033 restano non chiusi. |
| `docs/TASKS/TASK-029-production-path-staging-win7pos-bootstrap.md` | `PASS` | TASK-029 bloccato da staging/Win7 live gate. |
| `docs/TASKS/EVIDENCE/TASK-029/README.md` | `PASS` | Smoke staging e Win7POS E2E staging `NOT_RUN_BLOCKED`. |
| `docs/TASKS/TASK-031-vercel-preview-retry.md` | `PASS` | Vercel Preview retry resta `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`. |
| `docs/TASKS/EVIDENCE/TASK-031/README.md` | `PASS` | Tutti i percorsi Preview/REST/custom env hanno restituito Production e sono stati cancellati. |
| `docs/TASKS/TASK-032-full-project-progression-mega-task.md` | `PASS` | TASK-032 resta `REVIEW`; fase HTTPS/non-production storica bloccata. |
| `docs/TASKS/EVIDENCE/TASK-032/README.md` | `PASS` | Fase 6 HTTPS non-production bloccata, sales sync non avviato. |
| `docs/TASKS/TASK-033-controlled-task-032-review-https-pos-sales.md` | `PASS` | TASK-033 resta `REVIEW_WITH_BLOCKERS`. |
| `docs/TASKS/EVIDENCE/TASK-033/README.md` | `PASS` | HTTPS Cloudflare e POS API smoke passati; live Win7POS bloccato da runtime Windows/WPF assente. |
| `package.json` | `PASS` | Script disponibili: `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify`. |
| `vercel.json` | `PASS` | `git.deploymentEnabled=false`. |
| Next docs `layouts-and-pages`, `route-handlers`, `mutating-data`, `forms`, `data-security`, `accessibility` | `PASS` | Guide locali Next.js 16 lette prima di modifiche App Router/UI/API. |

## Pre-flight Admin Web

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --untracked-files=all` | `PASS` | Nessun output; working tree iniziale pulito. |
| `git branch --show-current` | `PASS` | `main`. |
| `git log --oneline -5` | `PASS` | `7bd0130`, `4d765c1`, `2fa1feb`, `18116bc`, `2026166`. |
| `git diff --check` | `PASS` | Nessun output. |

## Pre-flight Win7POS

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --untracked-files=all` | `PASS_WITH_PREEXISTING_CHANGES` | `.gitignore` modificato e file VM/docs/script non tracciati gia presenti. Non revertiti. |
| `git branch --show-current` | `PASS` | `main`. |
| `git log --oneline -5` | `PASS` | `5e35a37`, `d2c3d4b`, `a7f4843`, `6efc672`, `60f10de`. |
| `git diff --check` | `PASS` | Nessun output. |

## Fase 1 - Reconciliation/VM pause

| Area | Stato | Decisione |
| --- | --- | --- |
| TASK-029 | `REMAINS_BLOCKED` | Staging/Win7 live gate non superato; non chiuso a `DONE`. |
| TASK-031 | `REMAINS_BLOCKED` | Vercel Preview/Production behavior non risolto; non chiuso a `DONE`. |
| TASK-032 | `REMAINS_REVIEW` | Fase HTTPS/non-production storica bloccata; non chiuso a `DONE`. |
| TASK-033 | `REMAINS_REVIEW_WITH_BLOCKERS` | Win7POS live E2E richiede ambiente Windows/WPF compatibile; non chiuso a `DONE`. |
| VM/UTM/Win7 live testing | `PAUSED_VM_SETUP_REQUIRED` | Non riaperto UTM, non scaricata ISO, non creata VM. |

Cosa serve per riprendere:

- UTM avviabile.
- ISO/licenza Windows disponibili fuori repo.
- VM Builder e VM Win7 test create.
- Toolchain Windows Builder presente.
- Drop reale Win7POS prodotto e copiabile.
- Runtime .NET Framework 4.8 sul test guest.
- Bridge/log/screenshot/report pronti.

Prossimo gate futuro: `WIN7POS_LIVE_E2E_READY_WHEN_VM_READY`.

Mini-verdict: `PHASE_1_RECONCILIATION_COMPLETE`.

## Fase 2 - Admin Web UX polish

Stato corrente: `PHASE_2_UX_POLISH_COMPLETE_WITH_NOTES`.

Route controllate da codice:

- Platform Admin: overview, users, shops, audit, system, safe operations, support, history, devices, sync/data/provisioning se presenti.
- Shop Admin: overview, products, categories, suppliers, import-export, members, roles, staff, devices, audit, settings, POS, sync, history.

Fix applicati:

- `src/app/shop/_components/ImportExportActionPanel.tsx`: copy operativo preview-first; la preview non cambia righe catalogo, apply richiede preview digest e conferma dopo revisione di errori/warning/conteggi.

Smoke UI:

- Browser in-app: `BLOCKED_BROWSER_ATTACH_TIMEOUT` dopo due tentativi di aggancio webview.
- Fallback Playwright locale su `http://127.0.0.1:3034`: `/shop/import-export` e `/shop/devices` mostrano `Shop Admin access required` e `No active session`.
- Screenshot evidence: `docs/TASKS/EVIDENCE/TASK-034/browser-shop-devices-auth-required.png`.
- Review DONE-readiness fallback Playwright su `http://127.0.0.1:3035`: `/shop/devices` status `200`, guardia auth visibile; `/shop/import-export` status `200`, guardia auth visibile.
- Screenshot review: `docs/TASKS/EVIDENCE/TASK-034/review-shop-devices-auth-required.png`.

Limite rimasto:

- UI autenticata completa `BLOCKED_NO_AUTH_SESSION`; non dichiarato PASS visivo dei form autenticati.

Mini-verdict: `PHASE_2_UX_POLISH_COMPLETE_WITH_NOTES`.

## Fase 3 - Shop Admin operational hardening

Stato corrente: `PHASE_3_SHOP_HARDENING_COMPLETE_WITH_NOTES`.

Gap trovati:

- Device revoke/reactivate avevano reason opzionale in UI e nel boundary server-side.

Fix applicati:

- `src/app/shop/_components/DeviceActionPanel.tsx`: reason obbligatoria per revoke/reactivate device.
- `src/server/shop-admin/device-mutations.ts`: `reason_required` se manca reason per device status actions, con `fieldErrors.reason` redatto.
- `src/app/shop/_components/ImportExportActionPanel.tsx`: Excel workflow esplicitato come preview-first.

Test aggiornati:

- `tests/foundation/task-034-admin-web-polish-hardening.test.mjs`.

Check mirati:

- `node --test tests/foundation/task-034-unified-project-progression.test.mjs tests/foundation/task-034-admin-web-polish-hardening.test.mjs tests/foundation/task-015-devices.test.mjs tests/foundation/task-015-import-export.test.mjs tests/foundation/task-032-permissions-hardening.test.mjs`: `tests 12`, `pass 12`, `fail 0`.
- `npm run test:foundation`: `tests 157`, `pass 157`, `fail 0`.

Mini-verdict: `PHASE_3_SHOP_HARDENING_COMPLETE_WITH_NOTES`.

## Fase 4 - Win7POS non-VM hardening

Stato corrente: `PHASE_4_WIN7POS_NON_VM_HARDENING_COMPLETE_WITH_NOTES`.

Nota baseline: repo Win7POS disponibile ma dirty per file VM/docs/script preesistenti. Le modifiche nuove di TASK-034 sono note di pausa in:

- `/Users/minxiang/Projects/Win7POS/docs/dev/win7pos-mac-utm-testing.md`
- `/Users/minxiang/Projects/Win7POS/docs/dev/win7pos-vm-control-bridge.md`

Scanner/check eseguiti:

- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1`: `=== RESULT: ALL PASS ===`.
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1`: `=== RESULT: ALL PASS ===`.
- `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1`: `=== RESULT: ALL PASS ===`.
- Win7POS `git diff --check`: `PASS`, nessun output.
- Win7POS `git status --short --untracked-files=all`: `PASS_WITH_PREEXISTING_CHANGES`, file VM/docs/script non tracciati gia presenti.

Build WPF x86: `NOT_RUN_NOT_WINDOWS_TOOLCHAIN_AND_VM_PAUSED`.

Win7 live smoke: `NOT_RUN_PAUSED_VM_SETUP_REQUIRED`.

Mini-verdict: `PHASE_4_WIN7POS_NON_VM_HARDENING_COMPLETE_WITH_NOTES`.

## Fase 5 - Sales sync planning only

- File planning: `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`.
- Decisione: Sales sync resta `PLANNING_ONLY`.
- Nessuna migration sales.
- Nessun endpoint sales.
- Nessuna dashboard vendite live o fake.
- Implementazione futura richiede Win7POS live E2E o ambiente equivalente.

Mini-verdict: `PHASE_5_SALES_SYNC_PLANNING_COMPLETE`.

## Fase 6 - Resume Win7 live E2E gate

Checklist pronta:

- UTM avviabile.
- `WinPOS-Builder` creata.
- Windows Builder toolchain presente.
- Bridge avviato.
- Drop prodotto.
- `Win7POS-Test` creata.
- .NET Framework 4.8 runtime.
- Cartella condivisa.
- Drop copiato.
- `run-pos-smoke.bat`.
- Screenshot/log/report raccolti.

Comandi gia preparati:

- Discovery VM: `scripts/win7pos/vm/discover-vm-host.sh`.
- Bridge: `scripts/win7pos/windows/bridge/start-builder-bridge.ps1`.
- Send job: `scripts/win7pos/vm/send-builder-job.sh`.
- Validate drop: `scripts/win7pos/validate-drop.sh`.
- Prepare drop: `scripts/win7pos/prepare-test-drop.sh`.
- Collect output: `scripts/win7pos/collect-test-output.sh`.

Mini-verdict: `PHASE_6_RESUME_PLAN_READY`.

## Check registrati

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-034-unified-project-progression.test.mjs` | `RED_CONFIRMED` | Prima run fallita per task/evidence TASK-034 e planning sales sync mancanti. |
| `node --test tests/foundation/task-034-unified-project-progression.test.mjs` | `PASS` | Rerun: `tests 2`, `pass 2`, `fail 0`. |
| `node --test tests/foundation/task-034-admin-web-polish-hardening.test.mjs` | `RED_CONFIRMED` | Prima run fallita per copy import/export e reason device mancanti. |
| `node --test tests/foundation/task-034-admin-web-polish-hardening.test.mjs` | `PASS` | Rerun: `tests 2`, `pass 2`, `fail 0`. |
| `node --test tests/foundation/task-034-admin-web-polish-hardening.test.mjs tests/foundation/task-034-unified-project-progression.test.mjs` | `PASS` | Review rerun: `tests 4`, `pass 4`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 157`, `pass 157`, `fail 0`. |
| `npm run typecheck` | `RED_THEN_PASS` | Prima run fallita su `fieldErrors` typing device reason; dopo fix `next typegen` e `tsc --noEmit` passano. |
| `npm run lint` | `PASS` | `eslint` exit `0`. |
| `npm run build` | `PASS_WITH_WARNING` | Build Next.js `16.2.6` passa; warning noto `[DEP0205] module.register()`. |
| `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passano; warning noto `[DEP0205]`. |
| Admin Web `git diff --check` | `PASS` | Nessun output nei run eseguiti prima dell'handoff finale. |
| Browser in-app smoke | `BLOCKED_BROWSER_ATTACH_TIMEOUT` | Due tentativi falliti; fallback Playwright usato. |
| Fallback Playwright smoke | `BLOCKED_NO_AUTH_SESSION_CONFIRMED` | `/shop/import-export` e `/shop/devices`: `Shop Admin access required`, `No active session`. |

## Review DONE-readiness 2026-06-02

Verdict review: `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`.

Problemi trovati:

- La documentazione TASK-034 era ferma al verdict execution `PASS_WITH_NOTES_READY_FOR_REVIEW` e non registrava ancora la review DONE-readiness.
- `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md` e le sezioni TASK-034 ripetevano la decisione `PLANNING_ONLY`.

Fix applicati:

- Aggiornati `docs/TASKS/TASK-034-unified-project-progression.md`, questa evidence e `docs/MASTER-PLAN.md` al verdict di review `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`, mantenendo stato/fase `REVIEW` e `DONE` non dichiarato.
- Normalizzato il copy sales sync planning senza introdurre migration, endpoint, dashboard o runtime sales sync.
- Rafforzato `tests/foundation/task-034-unified-project-progression.test.mjs` per richiedere review DONE-readiness, Supabase/iOS/Android classification e assenza del vecchio verdict finale.

Check Supabase:

- `supabase --version`: `2.102.0`.
- `supabase migration list --local`: `PASS_WITH_NOTES`; lista disponibile, con divergenze local/remote storiche gia note.
- `supabase migration list --linked`: `PASS_WITH_NOTES_REMOTE_HISTORY_DIVERGENCE`; remote raggiunto, `20260601160000` locale non risulta nella history remota, coerente con note TASK-029 su RPC applicata ma repair registry non completato. Nessuna migration o tipo Supabase modificato da TASK-034.
- Classificazione: `SUPABASE_CHECK_PASS_WITH_NOTES`.

UI/UX/accessibilita/performance:

- Route Shop Admin toccate: `/shop/import-export`, `/shop/devices`.
- Smoke disponibile: route non-auth confermate con guardia `Shop Admin access required` / `No active session`; review smoke su `/shop/devices` e `/shop/import-export` status `200`.
- Screenshot review: `docs/TASKS/EVIDENCE/TASK-034/review-shop-devices-auth-required.png`.
- UI autenticata completa: `BLOCKED_NO_AUTH_SESSION`.
- Nessuna metrica finta o dashboard vendite fake introdotta.
- Componenti toccati restano Server Components senza `use client`; nessuna query aggiuntiva o client component non necessario introdotto.

Vercel/VM/mobile:

- Vercel: `git.deploymentEnabled=false` resta in `vercel.json`; nessuna Production usata come staging e Git Integration non ricollegata.
- VM/UTM/Win7 live E2E: `PAUSED_VM_SETUP_REQUIRED`; nessun UTM/ISO/VM avviato o creato.
- iOS/Android: `NOT_RUN_NOT_IN_SCOPE`; nessun file mobile modificato.
- Win7POS WPF build/live: `NOT_RUN_MACOS_ARM64_VM_PAUSED`; scanner non-VM restano il gate eseguibile.

Cleanup:

- Nessun file temporaneo, `.env`, VM, ISO, licenza o report fuori evidence aggiunto al repo.
- Screenshot mantenuti solo in `docs/TASKS/EVIDENCE/TASK-034/browser-shop-devices-auth-required.png` e `docs/TASKS/EVIDENCE/TASK-034/review-shop-devices-auth-required.png`.
- Nessun commit, push o stage finale.

## Security/privacy review corrente

- Nessun secret letto o stampato.
- Nessun service-role client/browser introdotto.
- Nessun PIN/password/token/hash in UI/log introdotto.
- Nessun dato reale introdotto.
- Nessun uso Production come staging.
- Nessuna VM/ISO/licenza nel repo.
- Nessuna cancellazione distruttiva.

## Reconciliation finale TASK-034 2026-06-02

Decisione utente: procedere con reconciliation finale `TASK-034` a `DONE_RECONCILED_WITH_NOTES`, aprendo poi `TASK-035` solo come planning/skeleton.

Verdict finale: `DONE_WITH_NOTES`.

Conferme finali:

- I risultati della review sono coerenti con i gate registrati: `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify` e `git diff --check` passano, con solo warning noto `[DEP0205]` in `build`/`verify`.
- Check finale fresh 2026-06-02: `npm run security:scan` PASS (`Security scan passed.`).
- Check finale fresh 2026-06-02: `npm run test:foundation` PASS (`tests 158`, `pass 158`, `fail 0`) dopo aggiornamento dei guardrail planning `TASK-035`.
- Check finale fresh 2026-06-02: `npm run typecheck` PASS (`next typegen`, `tsc --noEmit`).
- Check finale fresh 2026-06-02: `npm run lint` PASS (`eslint` exit `0`).
- Check finale fresh 2026-06-02: `npm run build` PASS_WITH_WARNING con solo warning noto `[DEP0205] module.register()`.
- Check finale fresh 2026-06-02: `npm run verify` PASS_WITH_WARNING; `lint`, `typecheck`, `security:scan` e `build` passano, con solo warning noto `[DEP0205]`.
- Check finale fresh 2026-06-02: `git diff --check` PASS.
- Win7POS scanner non-VM restano documentati come PASS; build/live Win7 resta `NOT_RUN_MACOS_ARM64_VM_PAUSED` / `PAUSED_VM_SETUP_REQUIRED`.
- Nessun secret letto o stampato.
- Nessun service-role client/browser.
- Nessun PIN/password/token/hash in UI/log.
- Nessun dato reale introdotto.
- Nessuna migration Supabase da TASK-034.
- Nessuna implementazione sales sync runtime.
- Sales sync resta `PLANNING_ONLY`.
- iOS/Android restano `NOT_RUN_NOT_IN_SCOPE`.

Task non chiusi:

- TASK-029 resta bloccato da staging/Win7 live gate.
- TASK-031 resta bloccato da Vercel Preview/Production behavior.
- TASK-032 resta `REVIEW` con HTTPS non-production storico bloccato.
- TASK-033 resta `REVIEW_WITH_BLOCKERS`.
- TASK-022_023 resta parked/E2E pending.

Note residue mantenute:

- `BLOCKED_NO_AUTH_SESSION` per QA UI autenticata completa.
- `PAUSED_VM_SETUP_REQUIRED` per VM/UTM/Win7 live E2E.
- Vercel Preview/non-production ancora bloccato.
- Supabase migration history divergence nota `20260601160000`.
- Warning build/verify `[DEP0205]`.
- iOS/Android `NOT_RUN_NOT_IN_SCOPE`.

## Chiusura corrente

Stato TASK-034: `DONE_RECONCILED_WITH_NOTES`.

Fase TASK-034: `DONE_RECONCILED`.

Verdict TASK-034: `DONE_WITH_NOTES`.

Prossima fase: `TASK-035 - Authenticated Admin Web QA + Shop Admin smoke harness`.

## Addendum Win7 live E2E resume 2026-06-02

Trigger utente: Windows 7 installato e desktop raggiunto dentro UTM. Il gate VM/UTM/Win7 live E2E viene ripreso come addendum collegato a TASK-034, senza creare una nuova task e senza collegarlo a TASK-035.

Stato addendum: `WIN7_LIVE_RESUME_SMOKE_LAUNCHER_EXECUTED_APP_EVIDENCE_PENDING`.

Risultati reali da host:

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `utmctl list` | `PASS` | VM vista come `Windows 7`, UUID `B63440F6-8BFD-4E99-AB79-5465AC323398`, status `started`. Nome documentato: `Windows 7`; rinomina a `Win7POS-Test` non eseguita. |
| CD/DVD UTM pre-mount | `PASS` | Menu UTM `Dischi` mostrava `Immagine (ISO) di CD/DVD (IDE): nessuno`; ISO Windows gia espulsa a livello UI/config osservabile. |
| Guest Tools ISO | `PASS` | Montata via UTM la ISO `/Users/minxiang/Downloads/utm-guest-tools-0.1.271.iso`; menu UTM conferma `utm-guest-tools-0.1.271.iso`. Nessuna ISO scaricata. |
| Guest Tools ISO contents | `PASS_HOST_ONLY` | ISO ispezionata da Mac: contiene `utm-guest-tools-0.1.271.exe`, `Autounattend.xml` e `virtio-win_license.txt`. |
| Guest agent | `BLOCKED_GUEST_AGENT_NOT_RUNNING` | `utmctl ip-address` e `utmctl exec ... --cmd cmd.exe /c ver` restituiscono `The QEMU guest agent is not running or not installed on the guest.` Confermato di nuovo dopo installazione .NET; controllo cmd remoto da Mac non disponibile. |
| Shared folder host | `PASS_GUEST_VISIBLE` | Creata/preparata `/Users/minxiang/Projects/Win7POS/.win7pos-vm/shared-win7`; screenshot guest mostra la share `Spice client (Z:)` con contenuti host visibili. |
| Share sentinel | `PASS_GUEST_VISIBLE` | Screenshot guest mostra `host-share-check-task034.txt` dentro `Z:`. |
| Spice WebDAV drive manual evidence | `PARTIAL_PASS_DRIVE_VISIBLE` | Screenshot manuale mostra `Spice client (Z:)` in Windows Explorer; salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-spice-client-drive-visible.png`. |
| `map-drive.bat` manual evidence | `PARTIAL_PASS_WITH_PATH_NOTE` | Screenshot manuale mostra `map-drive.bat` eseguito: `net use` assegna anche `Y:` a `http://localhost:9843/`, ma `\\spice-webdavd\DavWWWRoot` non risolve. Usare `Z:` o `Y:` per la share; screenshot salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-map-drive-output-spice-webdav-path-fails.png`. |
| Spice client contents manual evidence | `PASS_GUEST_SHARE_CONTENTS_VISIBLE` | Screenshot guest mostra `Z:` con `.spice-clipboard`, `scripts`, `Win7POS`, `host-share-check-task034.txt`, `NDP48-x86-x64-AllOS-ENU.exe` e `run-pos-smoke.bat`; salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-spice-client-share-contents-visible.png`. |
| Spice client drive mounted manual evidence | `PASS_GUEST_DRIVE_MOUNTED` | Screenshot guest mostra `Spice client (Z:)` tra i percorsi di rete, con capacita esposta e file system `FAT`; salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-spice-client-drive-mounted.png`. |
| .NET Framework 4.8 offline installer | `PASS_HOST_ONLY` | Scaricato nella share host `NDP48-x86-x64-AllOS-ENU.exe` da fonte ufficiale Microsoft/dotnet (`https://dotnet.microsoft.com/en-us/download/dotnet-framework/net48`, offline installer via `go.microsoft.com/fwlink/?linkid=2088631`); file host 116 MB. Installazione guest non ancora eseguita/verificata. |
| UTM memory setting | `PASS_CONFIG_UPDATED_NO_REINSTALL_REQUIRED` | Screenshot UTM mostra VM arrestata con memoria configurata a `4096 MiB` / `4 GB`; nessuna reinstallazione Windows richiesta per cambiare RAM. Salvato come `docs/TASKS/EVIDENCE/TASK-034/utm-win7-memory-4096mib-setting.png` e `docs/TASKS/EVIDENCE/TASK-034/utm-win7-stopped-memory-4gb-share-mounted.png`. |
| .NET installer copy from WebDAV | `BLOCKED_WEBDAV_CLIENT_FILE_SIZE_LIMIT` | Screenshot guest mostra `copy Z:\NDP48-x86-x64-AllOS-ENU.exe C:\Win7POSTest\installers\` bloccato da `Le dimensioni del file superano il limite consentito`; radice probabile: limite `WebClient`/WebDAV Windows, non RAM. Salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-dotnet-installer-copy-webdav-size-limit.png`. |
| Windows C drive free space | `BLOCKED_LOW_GUEST_DISK_SPACE` | Screenshot guest mostra `C:` quasi pieno (`1,30 GB disponibile su 19,7 GB`) e WebDAV `Z:` disconnesso dopo restart `WebClient`; salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-webdav-remap-needed-and-c-drive-low-space.png`. |
| UTM qcow2 virtual disk size | `PASS_HOST_INSPECTED` | `qemu-img info` su `/Users/minxiang/Downloads/Windows 7.utm/Data/disk-0.qcow2` mostra formato `qcow2`, virtual size `20 GiB`, disk size `13.2 GiB`. Serve resize del qcow2 e poi extend della partizione guest; nessuna reinstallazione Windows richiesta. |
| Drop discovery | `PASS_WITH_NOTES` | `dist/Win7POS` e `src/Win7POS.Wpf/bin/Release/net48` assenti; drop reale trovato in `src/Win7POS.Wpf/bin/x86/Release/net48`. |
| Drop validation | `PASS_WITH_WARNING` | `validate-drop.sh --source .../bin/x86/Release/net48` trova `Win7POS.Wpf.exe`, config, `Win7POS.Core.dll`, `Win7POS.Data.dll` e dipendenze principali; warning: nessun `e_sqlite3.dll` o `SQLite.Interop.dll` nei primi livelli. |
| Drop copy to share | `PASS_HOST_ONLY` | Copiato drop in `.win7pos-vm/shared-win7/Win7POS` e `run-pos-smoke.bat` in `.win7pos-vm/shared-win7/run-pos-smoke.bat`. |
| .NET Framework 4.8 guest | `PASS_REGISTRY_VERIFIED` | Screenshot guest mostra `reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" /v Release` con `Release REG_DWORD 0x80eb1`, coerente con .NET Framework 4.8 su Windows 7; salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-dotnet-registry-drop-copied.png`. |
| Drop copied in guest | `PASS_GUEST_LOCAL_DROP_COPIED` | Screenshot guest mostra `xcopy Z:\Win7POS C:\Win7POSTest\drop\Win7POS /E /I /Y` completato con `38 File copiati` e `copy Z:\run-pos-smoke.bat C:\Win7POSTest\run-pos-smoke.bat` completato con `1 file copiati`. |
| `run-pos-smoke.bat` guest | `PASS_LAUNCHER_EXECUTED_APP_EVIDENCE_PENDING` | Screenshot guest mostra `C:\Win7POSTest\run-pos-smoke.bat` eseguito, output `Win7POS guest smoke launcher`, `Starting Win7POS...`, `WIN7POS_DATA_DIR=C:\Win7POSTest\data`, e ritorno al prompt senza errore batch; salvato come `docs/TASKS/EVIDENCE/TASK-034/win7-run-pos-smoke-launcher-executed.png`. Serve ancora screenshot app/processo/log per dichiarare smoke live PASS. |

Istruzioni guest richieste all'utente per sbloccare il prossimo step:

1. Verificare in Windows 7 che il CD/DVD mostri i file UTM Guest Tools o la ISO `utm-guest-tools-0.1.271.iso`.
2. Verificare che la cartella condivisa UTM mostri `host-share-check-task034.txt`.
3. Verificare in `services.msc` che `QEMU Guest Agent` / `qemu-ga` esista e sia avviato; se non risponde, riavviare Windows 7 dopo l'installazione Guest Tools.
4. Verificare che `Win7POS.Wpf.exe` sia aperto o presente in `tasklist`.
5. Raccogliere screenshot app, eventuale `C:\Win7POSTest\data\logs\app.log` e report/esito dello smoke.

Stop condition corrente: non dichiarare PASS live E2E finche non arrivano screenshot/log/report o output guest verificabile. Nessun secret letto o stampato, nessun uso Production come staging, nessun download ISO, nessun commit/push/stage.
