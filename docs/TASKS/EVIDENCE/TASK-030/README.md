# TASK-030 Evidence

## Stato corrente

- Task: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`
- Stato task: `DONE_WITH_NOTES`
- Fase: `DONE_RECONCILED`
- Data execution: `2026-06-02`
- Execution: `COMPLETED_BY_CODEX`
- Review finale: `COMPLETED_BY_CODEX_REVIEW`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Branch iniziale Admin Web: `codex/task-029c-vercel-preview-e2e`
- Commit iniziale Admin Web: `274deff TASK-029 prepare vercel preview path`
- Branch finale Admin Web: `main`
- Push main: `PASS`
- Commit main verificato: `71316e7 docs: record TASK-030 main push result`

## Pre-flight

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `git status --short --branch` | `PASS_WITH_NOTES` | Branch `codex/task-029c-vercel-preview-e2e`; modifiche documentali non staged in `docs/DEPLOYMENT/STAGING.md`, `docs/MASTER-PLAN.md`, evidence TASK-022_023/TASK-029 e task TASK-029. |
| Admin Web | `git log --oneline --decorate --graph --all -30` | `PASS` | HEAD `274deff`; `main`/`origin/main` a `6e6aeaa`; branch remoto temporaneo TASK-029C assente. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Admin Web | `git diff --stat` | `PASS_WITH_NOTES` | 5 file documentali, 133 insertions / 31 deletions. |
| Admin Web | `git diff --cached --stat` | `PASS` | Nessun output; nessun file staged. |
| Win7POS | `git status --short --branch` | `PASS_WITH_NOTES` | Branch `main...origin/main`; modifiche TASK-029 gia note su bootstrap online e scanner; nessun file staged. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |

## Vercel read-only prima della neutralizzazione

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `.vercel/project.json` | `PASS` | Project `prj_4nMxezsLWdo9EVEdTLVJFM8edrnj`, team `team_38dhbiIM6z7VuxfyKi3kbTzd`, name `merchandise-control-admin-web`. |
| `vercel --version` | `PASS` | `54.7.1`. |
| `vercel whoami` | `PASS` | `xniw97-9857`. |
| Vercel MCP project | `PASS` | `framework=nextjs`, `nodeVersion=24.x`, `live=false`, `latestDeployment=null`, `domains=[]`. |
| Vercel MCP deployments | `PASS` | `deployments=[]`, `count=0`. |
| `vercel ls --scope xniw97-9857s-projects` | `PASS` | `No deployments found under xniw97-9857s-projects.` |
| `vercel alias ls --scope xniw97-9857s-projects` | `PASS` | Nessun alias elencato. |
| Project API filtered | `PASS_WITH_NOTES` | `link.type=github`, repo `XNIW/merchandise-control-admin-web`, `link.productionBranch=main`; project top-level `productionBranch=null`; `live=false`; `targets={}`. |
| Env API filtered | `PASS_WITH_NOTES` | Env lette solo come `key`, `target`, `type`, `gitBranch`, `configurationId`; nessun valore letto o salvato. Preview presenti: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Production env osservate per nome/target e non rimosse. |

## Neutralizzazione Vercel

| Comando/Azione | Esito | Evidence sintetica |
| --- | --- | --- |
| `vercel git disconnect --scope xniw97-9857s-projects` | `PASS` | Prompt CLI: il progetto non creera piu deployment quando si pusha al repository; confermato `yes`; output finale `Disconnected XNIW/merchandise-control-admin-web.` |
| Vercel MCP project post-disconnect | `PASS` | `live=false`, `latestDeployment=null`, `domains=[]`. |
| Vercel MCP deployments post-disconnect | `PASS` | `deployments=[]`, `count=0`. |
| Project API post-disconnect | `PASS` | `link=null`, `gitRepository=null`, `productionBranch=null`, `live=false`, `hasDeployments=false`, `latestDeployments=[]`. |
| `vercel ls --scope xniw97-9857s-projects` post-disconnect | `PASS` | Nessun deployment attivo. |
| `vercel alias ls --scope xniw97-9857s-projects` post-disconnect | `PASS` | Nessun alias elencato. |
| Env API filtered post-disconnect | `PASS_WITH_NOTES` | Env ancora viste solo per nome/target/tipo; nessun valore letto o salvato; nessuna env rimossa. |
| `vercel.json` | `PASS` | Guardrail repo-level aggiunto con `git.deploymentEnabled=false`; `jq . vercel.json` valido. |

## Gate main

Gate provvisorio:

- deployment attivi indesiderati: `PASS`, nessuno.
- alias attivi indesiderati: `PASS`, nessuno.
- auto-deploy da Git push: `PASS_WITH_NOTES`, Git Integration disconnessa e guardrail `vercel.json` aggiunto.
- Preview/non-production ottenuta: `NOT_RUN`, non necessaria per il push main sicuro e ancora non disponibile come staging TASK-029.
- env secret: `PASS_WITH_NOTES`, nessun valore letto o salvato; env Production non rimosse.

## Check pre-merge

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 134`, `pass 134`, `fail 0`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan` e `build` passati; build con warning toolchain `[DEP0205] module.register()`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0, Errori: 0`. |

## Main reconciliation

Stato corrente: `PASS_WITH_NOTES_MAIN_PUSHED`.

| Area | Comando | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Git | `git switch main` | `PASS` | Branch finale `main`. |
| Git | `git pull --ff-only origin main` | `PASS` | `Already up to date.` |
| Git | `git merge --no-ff codex/task-029c-vercel-preview-e2e` | `PASS` | Merge commit creato senza conflitti: `Merge TASK-030 Vercel deployment safeguards`. |
| Admin Web | `git status --short --branch` pre-push | `PASS_WITH_NOTES` | `main...origin/main [ahead 3]`. |
| Admin Web | `git diff --check` pre-push | `PASS` | Nessun output. |
| Admin Web | `git diff --stat HEAD` pre-push | `PASS` | Nessun output. |
| Vercel | Pre-push project check | `PASS` | `link=null`, `gitRepository=null`, `live=false`, `hasDeployments=false`, `latestDeployments=[]`. |
| Vercel | Pre-push deployments/aliases | `PASS` | Nessun deployment e nessun alias. |
| Admin Web | `npm run security:scan` su `main` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run test:foundation` su `main` | `PASS` | `tests 134`, `pass 134`, `fail 0`. |
| Admin Web | `npm run verify` su `main` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; warning toolchain `[DEP0205] module.register()`. |
| Git | Secret/file-name pre-push scan | `PASS` | Nessun match su `.env`, `.vercel`, `secret`, `token`, `password`, `service-role`, `service_role` nei file del merge commit. |
| Git | `git push origin main` | `PASS` | Push completato: `main -> main`. |
| Git | `git status --short --branch` post-push | `PASS` | `main...origin/main`. |
| Vercel | Post-push project check | `PASS` | `link=null`, `gitRepository=null`, `productionBranch=null`, `live=false`, `hasDeployments=false`, `latestDeployments=[]`. |
| Vercel | Post-push deployments/aliases | `PASS` | Nessun deployment e nessun alias; MCP deployments `count=0`. |

## Review finale 2026-06-02

Verdict: `DONE_RECONCILED_WITH_NOTES`.

| Area | Comando/check | Esito | Evidence sintetica |
| --- | --- | --- | --- |
| Git | `git fetch origin main --prune` | `PASS` | Fetch read-only completato; `origin/main` aggiornato. |
| Git | `git branch --show-current && git rev-parse --short HEAD && git rev-parse --short origin/main && git status --short --branch` | `PASS` | Branch `main`; `HEAD=71316e7`; `origin/main=71316e7`; status `## main...origin/main`. |
| Git | `git diff --cached --name-status && git diff --stat && git diff --name-only` | `PASS` | Nessun output: nessun staged file, nessun diff locale. |
| Git | `git show --stat --oneline --decorate --no-renames HEAD` | `PASS` | Ultimo commit pushato `71316e7 docs: record TASK-030 main push result`; solo documentazione TASK-030/Master Plan. |
| Vercel | `vercel ls --scope xniw97-9857s-projects` | `PASS` | `No deployments found under xniw97-9857s-projects.` |
| Vercel | `vercel alias ls --scope xniw97-9857s-projects` | `PASS` | Nessun alias elencato. |
| Vercel | Project API filtered | `PASS` | `link=null`, `gitRepository=null`, `productionBranch=null`, `live=false`, `hasDeployments=false`, `latestDeployments=0`, `targets={}`. |
| Vercel | Deployments API filtered | `PASS` | `count=0`, `deployments=[]`. |
| Vercel | Env API filtered | `PASS_WITH_NOTES` | `19` env osservate solo come `key`, `target`, `type`, `gitBranch`, `configurationId`, `createdAt`; nessun valore letto o salvato; nessuna env rimossa. |
| Config | `node -e ... vercel.json` | `PASS` | `git.deploymentEnabled=false`, schema `https://openapi.vercel.sh/vercel.json`. |
| Admin Web | `npm run security:scan` | `PASS` | `Security scan passed.` |
| Admin Web | `npm run test:foundation` | `PASS` | `tests 134`, `pass 134`, `fail 0`. |
| Admin Web | `npm run verify` | `PASS_WITH_WARNING` | `lint`, `typecheck`, `security:scan`, `build` passati; warning toolchain `[DEP0205] module.register()`. |
| Admin Web | `git diff --check` | `PASS` | Nessun output. |
| Win7POS | `git status --short --branch && git diff --check` | `PASS_WITH_NOTES` | Branch `main...origin/main`; modifiche TASK-029 locali note, nessun staged file, `git diff --check` senza output. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-bootstrap.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-catalog-pull.ps1` | `PASS` | `=== RESULT: ALL PASS ===`. |
| Win7POS | `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Debug -p:Platform=x86` | `PASS` | `Compilazione completata. Avvisi: 0, Errori: 0`. |
| Win7POS legacy | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-pos-online-client.ps1` | `FAIL_EXPECTED_NEEDS_RECONCILIATION` | Fallisce su `first-login dialog does not call client`; residuo TASK-022_023 gia documentato per il passaggio al flusso TASK-029 `PosOnlineBootstrapService`. |

Stati correlati confermati:

- `TASK-029`: resta `REVIEW` / `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`; nessuna URL Preview/non-production, nessuno smoke staging, nessun Win7POS E2E HTTPS.
- `TASK-022_023`: resta `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW` con `PARKED_E2E_PENDING`; non viene marcato `DONE`.
- `TASK-024`: resta `DEFERRED`; nessun sales sync implementato.

## Classificazione finale

`DONE_RECONCILED_WITH_NOTES`

## Rischi residui

- Nessuna Preview/non-production Vercel ottenuta: TASK-029 resta bloccato per smoke staging e Win7POS E2E staging.
- Git Integration Vercel e scollegata intenzionalmente; va ricollegata solo con task dedicato e policy non-production chiara.
- Env Production osservate per nome/target restano presenti e non sono state rimosse senza conferma esplicita.
- `TASK-022_023` resta `PARKED_E2E_PENDING`; `TASK-024` resta `DEFERRED`.
