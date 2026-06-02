# TASK-030 Evidence

## Stato corrente

- Task: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`
- Stato task: `EXECUTION`
- Fase: `EXECUTION`
- Data execution: `2026-06-02`
- Verdict corrente: `PENDING_MAIN_RECONCILIATION`
- Branch iniziale Admin Web: `codex/task-029c-vercel-preview-e2e`
- Commit iniziale Admin Web: `274deff TASK-029 prepare vercel preview path`
- Push main: `PENDING`

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

Stato corrente: `PENDING`.

Procedura prevista:

- commit locale del branch `codex/task-029c-vercel-preview-e2e`;
- `git switch main`;
- `git pull --ff-only origin main`;
- `git merge --no-ff codex/task-029c-vercel-preview-e2e`;
- riesecuzione check critici su `main`;
- `git push origin main`;
- verifica Vercel deployment/alias post-push.

## Rischi residui

- Nessuna Preview/non-production Vercel ottenuta: TASK-029 resta bloccato per smoke staging e Win7POS E2E staging.
- Git Integration Vercel e scollegata intenzionalmente; va ricollegata solo con task dedicato e policy non-production chiara.
- Env Production osservate per nome/target restano presenti e non sono state rimosse senza conferma esplicita.
- `TASK-022_023` resta `PARKED_E2E_PENDING`; `TASK-024` resta `DEFERRED`.
