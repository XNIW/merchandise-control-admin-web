# TASK-029 Evidence

## Stato corrente

- Task: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data execution: `2026-06-01`
- Execution: `COMPLETED_BY_CODEX`
- Review/fix: `COMPLETED_BY_CODEX`
- Verdict corrente: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`
- Commit: `274deff` su branch non-main per tentativo Vercel Preview
- Push: `origin/codex/task-029c-vercel-preview-e2e` per tentativo Vercel Preview; branch remoto rimosso in review
- Stage: `NOT_STAGED_FINAL`

## Baseline

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git branch --show-current` | `PASS` | `main` |
| Admin Web | `git status --short` | `PASS_WITH_NOTES` | Modifiche preesistenti coerenti con TASK-028 docs: `docs/MASTER-PLAN.md`, `docs/TASKS/EVIDENCE/TASK-028/README.md`, `docs/TASKS/TASK-028-catalog-crud-import-export-win7pos-e2e.md`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git branch --show-current` | `PASS` | `main` |
| Win7POS | `git status --short` | `PASS` | Clean iniziale. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

## Review/fix baseline 2026-06-01

| Repo | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short` | `PASS_WITH_NOTES` | Worktree contiene modifiche TASK-029 e docs TASK-028/TASK-029 attese; nessun file fuori scope rilevato. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git status --short` | `PASS_WITH_NOTES` | Worktree contiene modifiche TASK-029 attese su bootstrap online, scanner e docs. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

## TASK-028 closure

TASK-028 chiuso a `DONE_RECONCILED_WITH_NOTES` su conferma esplicita dell'utente dopo verifica live PASS.

Note residue mantenute:

- drift storico TASK-110 trattato in TASK-029;
- `.xls` legacy resta fuori scope;
- Android/iOS non toccati da TASK-028;
- sales sync deferred;
- nessuna dichiarazione di readiness globale.

## Supabase fresh reset / TASK-110

Problema: fresh reset non patchato si fermava su `20260515161500_task110_history_tombstone_grants.sql` per riferimento diretto a `public.product_prices`, assente negli stack fresh correnti.

Fix repo: il `REVOKE` su `public.product_prices` ora e protetto da `to_regclass('public.product_prices')`. La guard della sequence legacy resta separata. Nessuna migration storica cancellata.

Verifica isolata:

- CLI: `supabase --version` -> `2.102.0`;
- workdir temporaneo: `/tmp/mc-task029-supabase.wPXKpY`;
- `supabase --workdir ... start`: primo tentativo applica le migration fino a TASK-028 ma fallisce su porta analytics occupata; corrette solo le porte nella copia `/tmp`;
- `supabase --workdir ... start`: `PASS`;
- `supabase --workdir ... db reset --local --no-seed`: `PASS`, `Finished supabase db reset on branch main`;
- ultima migration: `20260601160000 task_028_catalog_restore_product`;
- `to_regclass('public.product_prices')`: `NULL`;
- `to_regclass('public.inventory_product_prices')`: presente;
- `to_regprocedure('public.shop_catalog_restore_product(uuid, uuid, text)')`: `true`;
- schema POS endpoint presente: `shops`, `staff_accounts`, `shop_devices`, `pos_device_credentials`, `pos_sessions`, `shop_inventory_sources`, `inventory_products`, `inventory_product_prices`.

Stack temporaneo fermato con `supabase --workdir ... stop --no-backup`: `PASS`.

Review/fix fresh reset 2026-06-01:

- CLI: `supabase --version` -> `2.102.0`;
- Docker: `Docker version 29.5.2`;
- workdir temporaneo: `/tmp/mc-task029-review-supabase.UpZbFZ`, rimosso dopo verifica;
- `supabase --workdir ... start`: `PASS`;
- `supabase --workdir ... db reset --local --no-seed`: `PASS`, `Finished supabase db reset on branch main`;
- ultima migration: `20260601160000 task_028_catalog_restore_product`;
- `to_regclass('public.product_prices')`: `NULL`;
- `to_regclass('public.inventory_product_prices')`: `inventory_product_prices`;
- `to_regprocedure('public.shop_catalog_restore_product(uuid, uuid, text)')`: `true`;
- schema POS endpoint richiesto: `pos_schema_missing=0`;
- stack fermato con `supabase --workdir ... stop --no-backup`: `PASS`.

## Staging

Stato storico iniziale: `BLOCKED_STAGING_CREDENTIALS`.

Evidence:

- `.vercel/`: assente;
- `vercel.json`: assente;
- `netlify.toml`: assente;
- `command -v vercel`: exit `1`;
- `vercel whoami`: exit `127`, `command not found`;
- URL HTTPS staging: `NOT_AVAILABLE`.

Documentazione operativa creata: `docs/DEPLOYMENT/STAGING.md`.

Review/fix discovery 2026-06-01:

- `test -d .vercel`: exit `1`;
- `test -f vercel.json`: exit `1`;
- `test -f netlify.toml`: exit `1`;
- `command -v vercel`: exit `1`;
- URL HTTPS staging: `NOT_AVAILABLE`;
- deploy/smoke staging: `NOT_RUN / BLOCKED_STAGING_CREDENTIALS`.

## TASK-029B Vercel/Supabase staging attempt 2026-06-01

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Vercel | `npm i -g vercel` | `PASS_WITH_WARNING` | CLI installata; warning engine Node `v26.0.0` su dipendenza transitive. |
| Vercel | `vercel whoami` | `PASS` | Account autenticato: `xniw97-9857`. |
| Vercel | `vercel link --yes --project merchandise-control-admin-web --scope xniw97-9857s-projects` | `PASS_WITH_NOTES` | Progetto linkato; primo tentativo GitHub connection fallito per Login Connection mancante. |
| Vercel | `vercel git connect https://github.com/XNIW/merchandise-control-admin-web.git --scope xniw97-9857s-projects` | `PASS` | GitHub repo collegato al progetto Vercel dopo setup utente. |
| Vercel | `vercel api /v9/projects/merchandise-control-admin-web` | `PASS` | Link GitHub presente: org `XNIW`, repo `merchandise-control-admin-web`, production branch `main`. |
| Vercel | `vercel api /v10/projects/merchandise-control-admin-web/env` | `PASS` | Env `preview` presenti: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; valori non letti e non stampati. |
| Supabase | `supabase projects list` | `PASS` | Linked remote: `merchandisecontrol-dev`, ref `jpgoimipbothfgkokyvm`. |
| Supabase | `supabase db query --linked ... to_regprocedure(...)` | `PASS` | Prima della patch remota: `restore_rpc_present=false`; schema POS richiesto presente (`9` tabelle rilevate). |
| Supabase | `supabase db query --linked --file supabase/migrations/20260601160000_task_028_catalog_restore_product.sql` | `PASS_WITH_RETRY_NOTES` | Query completata dopo retry; nessun output rows. |
| Supabase | `supabase db query --linked ... to_regprocedure(...)` | `PASS` | Dopo patch remota: `restore_rpc_present=true`. |
| Supabase | `supabase migration repair --linked --status applied 20260601160000` | `BLOCKED_WITH_NOTES` | Circuit breaker/login pooler: `too many authentication failures`; schema runtime gia applicato, history repair non completato. |
| Vercel | `vercel --yes --scope xniw97-9857s-projects` | `BLOCKED_PRODUCTION_TARGET_DELETED` | Ha creato `dpl_EBv8HEroVsKQk5YaQrapyWZxqbGf` con `target=production`; cancellato subito. |
| Vercel | `vercel deploy --yes --target=preview --scope xniw97-9857s-projects` | `BLOCKED_PRODUCTION_TARGET_DELETED` | Ha creato `dpl_FVvS6QYv6FEiXutJrgLMJMM8qtz4` con `target=production`; cancellato subito. |
| Vercel | retry da branch locale `codex/task-029b-staging-preview` prima del GitHub connect | `BLOCKED_PRODUCTION_TARGET_DELETED` | Ha creato `dpl_6bGHetzA2uduq4hy8zMdiYrV2XYJ` con `target=production`; cancellato subito. |
| Vercel | retry da branch locale `codex/task-029b-staging-preview` dopo GitHub connect | `BLOCKED_PRODUCTION_TARGET_DELETED` | Ha creato `dpl_99aoNgtAJnCw3zTzKCcqQwBMP2ss` con `target=production`; cancellato subito. |
| Vercel | `vercel api /v7/deployments?projectId=merchandise-control-admin-web` | `PASS` | Stato finale: `deployments=[]`; nessun deployment attivo. |
| Admin Web | `git status --short --branch` | `PASS_WITH_NOTES` | Tornato su `main`; nessun branch temporaneo residuo; modifiche TASK-029 non staged preservate. |

Verdict staging storico dopo TASK-029B: `BLOCKED_VERCEL_PREVIEW_DEPLOY_REQUIRES_NON_PRODUCTION_PATH`.

Motivo: le credenziali Vercel/GitHub/env erano configurate, ma i deploy manuali da worktree locale generavano deployment `target=production`. Il task vieta production; TASK-029C ha poi verificato che anche il branch Git non-main pushato genera `Production`, quindi resta necessario correggere Vercel/Git Integration o usare altro hosting HTTPS non-production.

## TASK-029C Vercel branch preview attempt 2026-06-02

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short --branch` | `PASS_WITH_NOTES` | Stato iniziale su `main` con modifiche TASK-028/TASK-029 non committate; nessun file staged. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git status --short --branch` | `PASS_WITH_NOTES` | Repo su `main` con modifiche TASK-029 attese su bootstrap online, scanner e DPAPI store; nessun file staged. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `git switch -c codex/task-029c-vercel-preview-e2e` | `PASS` | Branch non-main creato per tentativo Preview. |
| Admin Web | `git commit -m "TASK-029 prepare vercel preview path"` | `PASS` | Commit `274deff`; creato sul branch non-main, non su `main`. |
| Admin Web | `git push -u origin codex/task-029c-vercel-preview-e2e` | `PASS` | Branch remoto creato per attivare Vercel Git Integration. |
| Vercel | `vercel ls --scope xniw97-9857s-projects` | `BLOCKED_PRODUCTION_TARGET_DELETED` | Deployment da branch non-main creata come `Environment Production`: `https://merchandise-control-admin-gmip02vp7-xniw97-9857s-projects.vercel.app`. |
| Vercel | `vercel remove https://merchandise-control-admin-gmip02vp7-xniw97-9857s-projects.vercel.app --yes --scope xniw97-9857s-projects` | `PASS` | Deployment production inattesa cancellata subito. |
| Vercel | `vercel ls --scope xniw97-9857s-projects` | `PASS` | Stato finale: nessun deployment attivo. |
| Git | `git push origin --delete codex/task-029c-vercel-preview-e2e` | `PASS` | Branch remoto temporaneo eliminato dopo il tentativo fallito, per evitare nuovi deploy Production accidentali su push successivi. |
| Git | `git branch --unset-upstream` | `PASS` | Branch locale mantenuto senza upstream remoto. |
| Vercel | `vercel alias ls --scope xniw97-9857s-projects` | `PASS` | Nessun alias elencato. |
| Vercel | Project config inspection | `PASS_WITH_BLOCKER` | GitHub link presente e `productionBranch=main`, ma il branch non-main ha generato comunque `Production`; nessun alias/URL production usato come staging. |
| Vercel | `vercel env ls --scope xniw97-9857s-projects` | `PASS_WITH_NOTES` | Env `Preview` richieste presenti per nome; osservate anche env `Production` create da Vercel/Supabase intorno al deploy fallito. Valori non registrati in evidence. |
| Staging smoke | API POS staging smoke | `NOT_RUN_BLOCKED` | Nessuna URL Preview/non-production valida. |
| Staging dataset | Dataset sintetico shop/staff/device/catalogo | `NOT_CREATED_BLOCKED` | Non creato per assenza deployment Preview/non-production. |
| Win7POS | E2E staging HTTPS | `NOT_RUN_BLOCKED` | Non eseguito per assenza URL Preview/non-production. |
| Cleanup | Deployment Vercel errato | `PASS` | Deployment production inattesa rimossa; nessun dataset test creato, quindi nessun cleanup dati staging richiesto. |

Verdict staging aggiornato: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.

Motivo: anche il percorso richiesto con branch Git non-`main` pushato produce una deployment Vercel `Production`. Il task vieta production come staging; quindi non esiste ancora una URL Preview/non-production accettabile per smoke API POS o Win7POS E2E.

## Win7POS bootstrap

Implementato:

- bootstrap online fresh install prima del wizard locale;
- configurazione Admin Web URL nel dialog se assente;
- `PosOnlineBootstrapService` con first-login, mirror locale, DPAPI store e catalog pull iniziale;
- `UserRepository.UpsertRemoteStaffMirrorAsync`;
- colonne remote idempotenti in `DbInitializer`;
- `FirstRunSetupDialog` mantenuto come recovery/dev.

Il PIN/password non viene salvato in chiaro. Il mirror locale salva solo hash/salt tramite `PinHelper`.

Review/fix Win7POS:

- dialog bootstrap usa copy operatore (`Indirizzo pannello`, `Codice negozio`, `Codice staff`, `Nome dispositivo`);
- `PosOnlineFirstLoginDialog` pulisce `CredentialBox` in `finally`;
- `FirstRunSetupDialog` recovery/dev non mostra eccezioni grezze e pulisce `PinBox`/`ConfirmPinBox` in `finally`;
- `MainWindow` non mostra `ex.Message` nei popup toccati;
- `PosAdminWebClient` limita lettura response body con `MaxResponseBodyBytes` e `ReadResponseBodyAsync`;
- `scripts/check-pos-online-bootstrap.ps1` copre questi gate.

## API POS hardening

Implementato:

- helper `src/app/api/pos/_shared/pos-route-security.ts`;
- JSON `Content-Type` richiesto;
- limite body `MAX_POS_JSON_BODY_BYTES`;
- stream reader con fail closed su body oltre limite;
- `posJsonResponse` con `Cache-Control: no-store`;
- route POS senza service-role o credential hash.
- test TASK-029 ora esercita il helper JSON reale: content-type valido, content-type non JSON, JSON invalido, body oltre limite e `Cache-Control: no-store`.

## Check eseguiti

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `node --test tests/foundation/task-029-production-path-staging-win7pos-bootstrap.test.mjs` | `RED_CONFIRMED` | Run iniziale fallito sui gap attesi: TASK-110 non patchata, helper route assente, docs TASK-029 assenti, bootstrap service Win7POS assente. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `RED_CONFIRMED` | Run iniziale fallito su `PosOnlineBootstrapService.cs missing`. |
| Admin Web | `node --test tests/foundation/task-029-production-path-staging-win7pos-bootstrap.test.mjs` | `PASS` | Review/fix run finale: `tests 5`, `pass 5`, `fail 0`. |
| Admin Web | `npm run test:foundation` | `PASS` | Review/fix run finale: `tests 133`, `pass 133`, `fail 0`. |
| Admin Web | `npm run typecheck` | `PASS` | Eseguito singolarmente e dentro `verify`; `next typegen` succeeded, `tsc --noEmit` senza errori. |
| Admin Web | `npm run lint` | `PASS` | Eseguito singolarmente e dentro `verify`; exit `0`. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run build` | `PASS_WITH_WARNING` | Build exit `0`; warning toolchain `[DEP0205] module.register()`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; warning `[DEP0205]`. |
| Admin Web | `git diff --check` | `PASS` | Run finale: nessun output. |
| Admin Web | `git status --short` | `PASS_WITH_NOTES` | Run finale: modifiche TASK-028/TASK-029 attese, nessun file staged. |
| Supabase | `supabase --version` | `PASS` | `2.102.0`. |
| Supabase | `supabase --workdir /tmp/mc-task029-review-supabase.UpZbFZ db reset --local --no-seed` | `PASS` | Fresh reset isolato completato fino a TASK-028 senza errore su TASK-110; workdir rimosso dopo verifica. |
| Supabase | Query RPC/schema | `PASS` | RPC `shop_catalog_restore_product` presente; `pos_schema_missing=0`; `public.product_prices` assente e non bloccante. |
| Staging | Provider/CLI discovery | `BLOCKED_STAGING_CREDENTIALS` | `.vercel`/`vercel.json`/`netlify.toml` assenti; CLI `vercel` non disponibile. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `RED_CONFIRMED` | Review/fix scanner rafforzato: falliva su copy tecnico, credential clear non in `finally`, popup con eccezione grezza e response body non limitato. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS` | Review/fix run finale: `=== RESULT: ALL PASS ===`. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0, Errori: 0`. |
| Win7POS | `git diff --check` | `PASS` | Run finale: nessun output. |
| Win7POS | `git status --short` | `PASS_WITH_NOTES` | Run finale: modifiche TASK-029 attese, nessun file staged. |

## TASK-029C check refresh 2026-06-02

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 133`, `pass 133`, `fail 0`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan` e `build` passati; warning build `[DEP0205] module.register()`. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0, Errori: 0`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Vercel | `vercel ls --scope xniw97-9857s-projects` | `PASS` | `No deployments found under xniw97-9857s-projects.` |
| Vercel | `vercel alias ls --scope xniw97-9857s-projects` | `PASS` | Nessun alias elencato. |
| Git | `git ls-remote --heads origin codex/task-029c-vercel-preview-e2e` | `PASS` | Nessun output; branch remoto rimosso. |

## TASK-030 Vercel neutralization follow-up 2026-06-02

| Area | Comando/Azione | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Vercel | Read-only project inspection | `PASS_WITH_NOTES` | Prima della modifica: link GitHub `XNIW/merchandise-control-admin-web`, `link.productionBranch=main`, project top-level `productionBranch=null`, `live=false`, `hasDeployments=false`, nessun deployment e nessun alias. |
| Vercel | `vercel git disconnect --scope xniw97-9857s-projects` | `PASS` | Git Integration scollegata; la CLI ha confermato che il progetto non creera deployment quando si pusha al repository. |
| Vercel | Read-only post-disconnect | `PASS` | `link=null`, `gitRepository=null`, `productionBranch=null`, `live=false`, `hasDeployments=false`, `latestDeployments=[]`; nessun deployment/alias attivo. |
| Admin Web | `vercel.json` | `PENDING_TASK_030_CHECKS` | Guardrail aggiunto con `git.deploymentEnabled=false`; check finali TASK-030 da registrare nella relativa evidence. |
| Env | Env Vercel | `PASS_WITH_NOTES` | Letti solo nome/target/tipo; nessun valore letto o salvato; env Production osservate non rimosse. |

## TASK-031 Vercel Preview retry follow-up 2026-06-02

| Area | Comando/Azione | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Vercel docs | Preview Environment / REST create-deployment | `PASS_WITH_NOTES` | Doc ufficiale conferma Preview attesa per CLI senza `-prod` e REST `target` omesso. |
| Vercel | CLI senza `--prod` / `--target` | `BLOCKED_PRODUCTION_DELETED` | Il progetto ha comunque restituito `target:"production"`; deployment cancellati subito. |
| Vercel | REST `target` omesso su branch remoto non-main | `BLOCKED_PRODUCTION_DELETED` | Branch remoto diagnostico creato; risposta ancora `target:"production"` e OIDC `environment:"production"`; deployment cancellato subito. |
| Vercel | REST `target:"staging"` | `BLOCKED_PRODUCTION_DELETED` | Risposta ancora `target:"production"`, `customEnvironment=null`; deployment cancellato subito. |
| Vercel | Cleanup finale | `PASS` | Nessun deployment attivo e nessun alias finale. |

Classificazione aggiornata da TASK-031: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`. TASK-029 resta senza URL Preview/non-production e senza smoke staging.

## Win7POS scanner/bootstrap reconciliation follow-up 2026-06-02

Verdict: `WIN7POS_SCANNERS_RECONCILED_STAGING_STILL_BLOCKED`.

Root cause del failure legacy:

- `scripts/check-pos-online-client.ps1` pretendeva ancora che `PosOnlineFirstLoginDialog` chiamasse direttamente `PosAdminWebClient.FirstLoginAsync`;
- dopo TASK-029 il flusso corretto e `PosOnlineFirstLoginDialog` -> `PosOnlineBootstrapService` -> `PosAdminWebClient.FirstLoginAsync`;
- il runtime Win7POS risultava coerente con il design bootstrap, quindi non e stato necessario cambiare il runtime per questo follow-up.

Fix scanner:

- `scripts/check-pos-online-client.ps1` ora verifica il chain dialog -> bootstrap service -> online client;
- verifica pulizia PIN/password in `finally`;
- verifica salvataggio token/sessione via DPAPI/trusted-device store senza campi token raw persistiti;
- verifica hashing locale credential mirror staff con `PinHelper`;
- verifica assenza di log sensibili e assenza di Base URL Admin Web production hardcoded.

Check Win7POS follow-up:

| Comando | Esito | Evidence sintetica |
| --- | --- | --- |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `PASS` | Include `first-login dialog uses bootstrap service`, `bootstrap service calls first-login through online client`, `trusted tokens saved through protected store`, `remote staff credential hashed for local mirror`, `no production Admin Web URL hardcoded`, `no sensitive POS online logs`. |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0, Errori: 0`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status --short --branch` post-push | `PASS` | `## main...origin/main`. |

Commit/push Win7POS: `d2c3d4b TASK-029 reconcile Win7POS online bootstrap`, push `main -> main`.

Impatto stato:

- TASK-029 resta `BLOCKED`: nessuna URL Preview/non-production, smoke staging e Win7POS staging E2E ancora `NOT_RUN_BLOCKED`;
- TASK-022_023 resta `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW` con `PARKED_E2E_PENDING`;
- TASK-024 resta `DEFERRED`.

## Rischi residui

- Staging pubblico HTTPS Preview/non-production non disponibile: smoke staging e Win7POS staging E2E non eseguiti.
- TASK-030 ha neutralizzato l'auto-deploy Git ma non ha prodotto una URL Preview/non-production; TASK-031 ha confermato che anche CLI doc-compliant e REST API non ottengono Preview sul progetto corrente.
- Branch Git non-main pushato ha generato deployment `Production` nonostante `productionBranch=main`; deployment rimossa subito.
- Branch remoto temporaneo rimosso; branch locale resta presente per contenere commit e modifiche review non pushate.
- Env `Production` create da Vercel/Supabase durante il tentativo sono state osservate solo per nome/target e non rimosse senza approvazione esplicita.
- Dataset staging test non creato.
- Bootstrap Win7POS verificato localmente/staticamente e con build; test manuale UI richiede ambiente Windows/WPF interattivo.
- Supabase production/remoto non usato.

## Handoff

- Prossima fase: `REVIEW`.
- Verdict corrente: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.
- Commit/push eseguiti solo su branch non-main per tentativo Vercel Preview; branch remoto temporaneo poi rimosso; nessun commit su `main`.
- Nessun deployment production attivo finale e nessun secret registrato in repo/evidence.
