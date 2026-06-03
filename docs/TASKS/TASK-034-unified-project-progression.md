# TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning

## Informazioni generali

- ID: `TASK-034`
- Titolo: `Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning`
- Stato: `DONE_RECONCILED_WITH_NOTES`
- Fase attuale: `DONE_RECONCILED`
- Milestone interna: `FINAL_RECONCILED_WITH_NOTES`
- Responsabile attuale: `USER_CONFIRMED_RECONCILIATION`
- Data apertura: `2026-06-02`
- Data reconciliation finale: `2026-06-02`
- Branch Admin Web: `main`
- Branch Win7POS: `main`, se usato
- Evidence: `docs/TASKS/EVIDENCE/TASK-034/README.md`
- Stage: `NOT_STAGED`
- Commit: `NOT_COMMITTED`
- Push: `NOT_PUSHED`
- Verdict corrente: `DONE_WITH_NOTES`
- Verdict finale: `DONE_WITH_NOTES`

## Contesto

TASK-034 e un task unico grande richiesto esplicitamente dall'utente per avanzare senza dipendere da VM/UTM/Win7 live testing.

Regole prodotto confermate:

- Platform Admin Console controlla ecosistema globale, utenti, shop, audit, stato sistema e safe operations.
- Shop Admin Console controlla il singolo shop: prodotti, categorie, fornitori, membri, ruoli, staff POS, dispositivi, import/export Excel, settings e audit.
- POS/Staff resta modulo interno dello Shop Admin, non una terza console separata.
- `shops` resta la root business/negozio.
- Non introdurre `merchant -> stores`.
- Account personale e staff POS restano separati.

## Stato iniziale

- TASK-029 resta in `REVIEW` e bloccato dal gate staging/Win7 live.
- TASK-031 resta in `REVIEW_BLOCKED` per comportamento Vercel Preview/Production.
- TASK-032 resta in `REVIEW` con fase HTTPS/non-production bloccata storicamente.
- TASK-033 resta in `REVIEW_WITH_BLOCKERS` per Win7POS live E2E non eseguibile su questa macchina macOS arm64 senza runtime Windows/WPF compatibile.
- VM/UTM/Win7 live testing passa a `PAUSED_VM_SETUP_REQUIRED`.

## Scope

Fasi interne autorizzate:

1. Reconcile blocked tasks e pause VM/Win7 live testing.
2. Admin Web UX/Product polish pass.
3. Shop Admin operational hardening.
4. Win7POS non-VM hardening.
5. Sales sync planning only.
6. Resume Win7 live E2E when VM is ready.
7. Final review, checks e handoff.

Scope Admin Web:

- Platform Admin UI.
- Shop Admin UI.
- POS dashboard read-only esistente, solo UX/copy/stati.
- Navigazione, empty/loading/error states, copy operativo, accessibilita base, responsive desktop/tablet.
- Server actions/read models gia esistenti solo per fix piccoli e testabili.

Scope Win7POS:

- Scanner PowerShell.
- Bootstrap online.
- Configurazione base URL Admin Web.
- POS first-login client.
- Trusted-device/session handling.
- Catalog pull.
- Retry/backoff.
- Logging redatto.
- Messaggi errore.
- Docs VM pause.
- Build/scanner solo se disponibili sull'ambiente corrente.

Scope sales sync:

- Planning only in `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`.
- Candidate schema, endpoint, DTO, idempotency, sicurezza, privacy, offline behavior, test matrix, roll-out plan e stop condition.

## Fuori scope

- Non fare commit, push o stage finale.
- Non marcare `DONE`.
- Non riaprire UTM/VM setup.
- Non scaricare ISO Windows.
- Non installare Visual Studio/Build Tools.
- Non usare Production come staging.
- Non ricollegare Vercel Git Integration.
- Non leggere o stampare secret.
- Non modificare dati reali.
- Non implementare sales sync runtime.
- Non creare dashboard vendite fake.
- Non implementare sync bidirezionale catalogo.
- Non spostare POS/Staff fuori da Shop Admin.
- Non introdurre `merchant -> stores`.
- Non modificare Android/iOS.
- Non fare grandi refactor.
- Non aggiungere dipendenze senza motivo forte e documentato.

## Stop condition

- Se una fase trova un blocker ambiente/secret/sessione/VM, documentare `BLOCKED` o `NOT_RUN` e passare solo alle fasi sicure successive.
- Se una modifica richiede refactor ampio o nuovo protocollo server/POS, documentarla come follow-up e non implementarla nel task.
- Se i check diventano troppo lunghi, eseguire almeno `security:scan`, `test:foundation`, `verify`, `git diff --check` e `git status --short --untracked-files=all`.
- Handoff finale massimo a `REVIEW`, `REVIEW_WITH_NOTES`, `REVIEW_WITH_BLOCKERS`, `PASS_WITH_NOTES_READY_FOR_REVIEW` o `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`; `DONE` resta vietato senza conferma utente.

## Stato fasi

| Fase | Stato corrente | Note |
| --- | --- | --- |
| 0 - Pre-flight e apertura | `PASS` | Repo Admin Web pulita; Win7POS disponibile con modifiche VM preesistenti; task/evidence aperti. |
| 1 - Reconciliation/VM pause | `PHASE_1_RECONCILIATION_COMPLETE` | TASK-029/031/032/033 non chiusi; VM/UTM/Win7 live testing in pausa. |
| 2 - Admin Web UX polish | `PHASE_2_UX_POLISH_COMPLETE_WITH_NOTES` | Import/export copy reso preview-first; route autenticate non verificabili senza sessione reale. |
| 3 - Shop Admin hardening | `PHASE_3_SHOP_HARDENING_COMPLETE_WITH_NOTES` | Device revoke/reactivate richiedono reason in UI e server boundary; Excel preview/apply copy rafforzato. |
| 4 - Win7POS non-VM hardening | `PHASE_4_WIN7POS_NON_VM_HARDENING_COMPLETE_WITH_NOTES` | Scanner bootstrap/client/catalog PASS; docs VM pause aggiornate; nessun smoke Win7 reale. |
| 5 - Sales sync planning | `PHASE_5_SALES_SYNC_PLANNING_COMPLETE` | Planning file creato; sales sync resta `PLANNING_ONLY`. |
| 6 - Resume Win7 live E2E | `PHASE_6_RESUME_PLAN_READY` | Checklist resume pronta; non eseguita UTM/VM. |
| 7 - Final review/checks | `DONE_RECONCILED_WITH_NOTES` | Reconciliation finale eseguita su conferma utente; check finali registrati in evidence; note residue mantenute. |

## Reconciliation tasks bloccati

- TASK-029: resta bloccato da staging/Win7 live gate. Non viene chiuso a `DONE`.
- TASK-031: resta bloccato da comportamento Vercel Preview/Production. Non viene chiuso a `DONE`.
- TASK-032: resta `REVIEW`; fase HTTPS non-production storica bloccata. Non viene chiuso a `DONE`.
- TASK-033: resta `REVIEW_WITH_BLOCKERS`; Win7POS live E2E non eseguibile su macOS arm64 senza Windows/WPF. Non viene chiuso a `DONE`.
- VM/UTM/Win7 live testing: `PAUSED_VM_SETUP_REQUIRED`.

Mini-verdict fase 1: `PHASE_1_RECONCILIATION_COMPLETE`.

## Admin Web UX/Product polish

Route controllate da codice:

- Platform Admin: overview, users, shops, audit, system, operations, support, history, devices, sync/data/provisioning.
- Shop Admin: overview, products, categories, suppliers, import-export, members, roles, staff, devices, audit, settings, POS, sync, history.

Fix applicato:

- `ImportExportActionPanel` rende esplicito il flusso preview-first: la preview non cambia righe catalogo e l'apply richiede digest della preview dopo revisione di errori, warning e conteggi.

Limite rimasto:

- Browser/UI autenticata completa `BLOCKED_NO_AUTH_SESSION`; smoke locale ha verificato solo la guardia auth su route Shop Admin.

Mini-verdict fase 2: `PHASE_2_UX_POLISH_COMPLETE_WITH_NOTES`.

## Shop Admin operational hardening

Gap trovato:

- `DeviceActionPanel` mostrava `Reason` opzionale per revoke/reactivate device e `device-mutations.ts` accettava reason assente per azioni sensibili di stato.

Fix applicato:

- Reason obbligatoria in UI per revoke/reactivate device.
- Boundary server-side device ora ritorna `reason_required` con `fieldErrors.reason` se la reason manca.
- Confermati guardrail Excel preview-first, digest e apply confirmation.

Mini-verdict fase 3: `PHASE_3_SHOP_HARDENING_COMPLETE_WITH_NOTES`.

## Win7POS non-VM hardening

Fix/documentazione applicata:

- Aggiornati i documenti VM Win7POS con stato `PAUSED_VM_SETUP_REQUIRED` e ripresa solo quando VM/toolchain/drop saranno pronti.
- Scanner PowerShell compatibili eseguiti: bootstrap, online client, catalog pull.

Non eseguito:

- Build WPF x86 non eseguita perche TASK-034 non modifica codice WPF e non deve installare toolchain o usare VM.
- Smoke Win7 reale non eseguito per stop condition VM.

Mini-verdict fase 4: `PHASE_4_WIN7POS_NON_VM_HARDENING_COMPLETE_WITH_NOTES`.

## Sales sync planning

- File planning: `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`.
- Decisione: Sales sync resta `PLANNING_ONLY`.
- Runtime non implementato: nessuna migration, nessun endpoint, nessuna dashboard vendite live.
- Gate futuro: implementazione richiede Win7POS live E2E o ambiente equivalente, schema approvato, idempotency verificata e matrice test completata.

Mini-verdict fase 5: `PHASE_5_SALES_SYNC_PLANNING_COMPLETE`.

## Resume Win7 live E2E gate

La ripresa e consentita solo quando VM/ambiente sono pronti. Checklist minima:

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

Comandi gia preparati da usare solo quando il gate ambiente e pronto:

- Discovery VM: `scripts/win7pos/vm/discover-vm-host.sh`.
- Bridge: `scripts/win7pos/windows/bridge/start-builder-bridge.ps1`.
- Send job: `scripts/win7pos/vm/send-builder-job.sh`.
- Validate drop: `scripts/win7pos/validate-drop.sh`.
- Prepare drop: `scripts/win7pos/prepare-test-drop.sh`.
- Collect output: `scripts/win7pos/collect-test-output.sh`.

Mini-verdict fase 6: `PHASE_6_RESUME_PLAN_READY`.

## Review DONE-readiness 2026-06-02

Verdict review: `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`.

Problemi trovati e corretti:

- La documentazione non registrava ancora la review DONE-readiness corrente; aggiornata in task, evidence e Master Plan.
- Il planning sales sync ripeteva la decisione `PLANNING_ONLY`; copy normalizzato senza cambiare scope.

Verifiche prodotto/architettura:

- Platform Admin resta globale; Shop Admin resta shop-scoped.
- POS/Staff resta modulo interno della Shop Admin Console.
- `shops` resta la root dominio; nessun `merchant -> stores`.
- Sales sync resta `PLANNING_ONLY`; nessuna migration, endpoint, dashboard vendite live o runtime creati.
- VM/UTM/Win7 live E2E resta `PAUSED_VM_SETUP_REQUIRED`.

Verifiche ambiente:

- Admin Web: `security:scan` PASS, `test:foundation` PASS (`157/157`), `typecheck` PASS, `lint` PASS, `build` PASS_WITH_WARNING `[DEP0205]`, `verify` PASS_WITH_WARNING `[DEP0205]`.
- Supabase: `SUPABASE_CHECK_PASS_WITH_NOTES`; CLI disponibile, migration list locale eseguita e linked list eseguita con divergenza remota nota su `20260601160000` gia documentata dai task precedenti. Nessuna migration o tipo Supabase modificato in TASK-034.
- Vercel: resta parcheggiato; `vercel.json` mantiene `git.deploymentEnabled=false`; nessun uso Production come staging.
- UI autenticata: resta `BLOCKED_NO_AUTH_SESSION`; smoke non-auth su `http://127.0.0.1:3035/shop/devices` e `/shop/import-export` conferma guardia `Shop Admin access required` / `No active session`. Screenshot review: `docs/TASKS/EVIDENCE/TASK-034/review-shop-devices-auth-required.png`.
- iOS/Android: `NOT_RUN_NOT_IN_SCOPE`; nessun file mobile modificato.
- Win7POS WPF build/live: build `NOT_RUN_MACOS_ARM64_VM_PAUSED`; scanner non-VM restano il gate compatibile.

## Reconciliation finale TASK-034 2026-06-02

Decisione utente: procedere con reconciliation finale `TASK-034` a `DONE_RECONCILED_WITH_NOTES`, senza chiudere `TASK-029`, `TASK-031`, `TASK-032` o `TASK-033` e senza riprendere UTM/VM/Win7 live testing.

Verdict finale: `DONE_WITH_NOTES`.

Conferme mantenute:

- `security:scan` PASS.
- `test:foundation` PASS.
- `typecheck` PASS.
- `lint` PASS.
- `build` PASS con solo warning noto `[DEP0205]`.
- `verify` PASS con solo warning noto `[DEP0205]`.
- `git diff --check` PASS.
- Win7POS scanner PASS come documentato in evidence; build/live Win7 resta `NOT_RUN_MACOS_ARM64_VM_PAUSED`.
- Nessun secret, service-role client/browser, PIN/password/token/hash in UI/log, dato reale, migration Supabase o runtime sales sync introdotto da TASK-034.
- Sales sync resta `PLANNING_ONLY`.
- iOS/Android restano `NOT_RUN_NOT_IN_SCOPE`.

Task bloccati preservati:

- TASK-029 resta `REVIEW` / `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.
- TASK-031 resta `REVIEW_BLOCKED` / `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`.
- TASK-032 resta `REVIEW` / `PASS_WITH_NOTES_PHASE_5_COMPLETE_PHASE_6_BLOCKED`.
- TASK-033 resta `REVIEW_WITH_BLOCKERS`.
- TASK-022_023 resta parked/E2E pending.

## Rischi residui dopo review

- QA visivo autenticato Shop Admin non eseguito per assenza sessione.
- Win7POS live E2E resta sospeso finche VM/drop/toolchain non sono pronti.
- Vercel Preview/non-production resta bloccato dai task precedenti.
- Supabase linked history conserva la divergenza remota nota su `20260601160000`; non peggiorata da TASK-034.
- Build/verify Admin Web mantengono warning toolchain noto `[DEP0205]`.

## Chiusura documentale

TASK-034 e chiuso documentamente a `DONE_RECONCILED_WITH_NOTES` su conferma esplicita dell'utente, con note residue mantenute. Nessun commit, push o stage finale viene eseguito in questa reconciliation.

## Verdict finale

- Stato TASK-034: `DONE_RECONCILED_WITH_NOTES`.
- Fase TASK-034: `DONE_RECONCILED`.
- Verdict TASK-034: `DONE_WITH_NOTES`.
- Prossima fase: `TASK-035` planning/execution separata.

## Addendum Win7 live E2E resume 2026-06-02

Trigger utente: Windows 7 installato e desktop raggiunto dentro UTM. Il gate VM/UTM/Win7 live viene ripreso come addendum collegato a TASK-034, senza creare nuova task e senza collegarlo a TASK-035.

Stato addendum: `WIN7_LIVE_RESUME_SMOKE_LAUNCHER_EXECUTED_APP_EVIDENCE_PENDING`.

Risultati reali documentati:

- `utmctl list` vede la VM `Windows 7`, UUID `B63440F6-8BFD-4E99-AB79-5465AC323398`, stato `started`.
- ISO Windows non risulta montata; UTM Guest Tools ISO `/Users/minxiang/Downloads/utm-guest-tools-0.1.271.iso` risulta montata.
- Share host preparata in `/Users/minxiang/Projects/Win7POS/.win7pos-vm/shared-win7` con `host-share-check-task034.txt`, installer offline `.NET Framework 4.8`, drop `Win7POS` e `run-pos-smoke.bat`.
- Screenshot guest mostrano `Spice client (Z:)` in Explorer e `map-drive.bat` riuscito con `Y:` mappato a `http://localhost:9843/`.
- Screenshot guest conferma che `Z:` contiene `host-share-check-task034.txt`, `Win7POS`, `run-pos-smoke.bat` e `NDP48-x86-x64-AllOS-ENU.exe`.
- `\\spice-webdavd\DavWWWRoot` non risolve nel guest; usare `Z:` o `Y:` per verificare la share.
- Screenshot UTM mostra la VM arrestata con memoria configurata a `4096 MiB` / `4 GB`; non serve reinstallare Windows per cambiare RAM.
- La copia dell'installer `.NET Framework 4.8` da `Z:` a `C:\Win7POSTest\installers\` e bloccata dal limite file del client WebDAV Windows (`Le dimensioni del file superano il limite consentito`), non da RAM insufficiente.
- Screenshot guest mostra `C:` quasi pieno (`1,30 GB disponibile su 19,7 GB`) e `qemu-img info` conferma disco virtuale `qcow2` da `20 GiB`; serve resize del qcow2 e extend della partizione Windows, senza reinstallazione.
- Screenshot utente in chat mostra installer Microsoft `.NET Framework 4.8` con `Installazione completata`, `reg query` con `Release REG_DWORD 0x80eb1`, drop copiato in `C:\Win7POSTest\drop\Win7POS` con `38 File copiati` e `run-pos-smoke.bat` copiato localmente.
- Screenshot guest mostra `C:\Win7POSTest\run-pos-smoke.bat` eseguito con output `Starting Win7POS...` e ritorno al prompt senza errore batch; serve ancora evidenza app/processo/log per smoke live PASS.
- QEMU guest agent non risponde ancora da Mac; `utmctl ip-address`/`exec` restano bloccati da guest agent non installato o non avviato, quindi il controllo cmd remoto da Mac non e disponibile.

Stop condition corrente:

- Verificare manualmente app/processo/log dopo il launcher.
- `run-pos-smoke.bat` resta `PASS_LAUNCHER_EXECUTED_APP_EVIDENCE_PENDING`.
- Nessun secret letto o stampato, nessuna Production usata come staging, nessun download ISO Windows, nessun commit/push/stage.
