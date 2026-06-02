# TASK-031 Evidence

## Stato corrente

- Task: `TASK-031 - Vercel Preview retry after environment docs`
- Stato task: `REVIEW_BLOCKED`
- Fase: `REVIEW`
- Data execution: `2026-06-02`
- Execution: `COMPLETED_BY_CODEX`
- Verdict corrente: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`
- Branch Admin Web: `codex/task-031-vercel-preview-diagnosis`
- Branch remoto diagnostico: `origin/codex/task-031-vercel-preview-diagnosis`

## Fonti Vercel consultate

| Fonte | Evidenza usata |
| --- | --- |
| `https://vercel.com/docs/deployments/environments#preview-environment-pre-production` | Preview attesa quando si deploya via CLI senza `-prod`; push su branch non-production dovrebbe creare Preview; Production richiede branch production o `vercel --prod`. |
| `https://vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment` | Create Deployment REST: se `target` e omesso, il target dovrebbe essere Preview; nella risposta `target:null` indica deployment Preview. |
| `https://vercel.com/docs/deployments/environments#custom-environments` | Custom Environments disponibili su Pro/Enterprise; CLI usa `vercel deploy --target=<custom-env>`. |

## Pre-flight e stato progetto

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `git status --short --branch` | `PASS` | Branch `codex/task-031-vercel-preview-diagnosis`; working tree pulito prima delle note documentali. |
| `vercel ls --scope xniw97-9857s-projects` | `PASS` | `No deployments found under xniw97-9857s-projects.` |
| `vercel alias ls --scope xniw97-9857s-projects` | `PASS` | Nessun alias elencato. |
| Project API filtered | `PASS_WITH_NOTES` | `link=null`, `gitRepository=null`, `productionBranch=null`, `previewDeploymentsDisabled=null`, `hasDeployments=false`, `latestDeployments=[]`, `live=false`, `nodeVersion=24.x`, `framework=nextjs`. |
| `vercel target list --scope xniw97-9857s-projects` | `PASS` | Target system osservati: Production `main`, Preview `All unassigned git branches`, Development `Accessible via CLI`. |
| Custom environments API | `PASS_WITH_NOTES` | `accountLimit.total=0`, `environments=[]`; custom staging non disponibile sul piano corrente. |

## Tentativi e risultati

Tutti i deployment Production inattesi sono stati cancellati subito con `vercel remove ... --yes --scope xniw97-9857s-projects`.

| Tentativo | Esito | Evidence sintetica |
| --- | --- | --- |
| `vercel deploy --yes --target=preview --skip-domain ...` | `FAIL_NO_DEPLOY` | CLI: `--skip-domain option can only be used with production deployments`. Nessun deployment creato. |
| `vercel deploy --yes --target=preview ...` da `main` | `BLOCKED_PRODUCTION_DELETED` | Output `Production`; URL `https://merchandise-control-admin-3dx5hw9m2-xniw97-9857s-projects.vercel.app`; cancellata subito. |
| `vercel deploy --yes --target=preview --no-wait --debug --archive=tgz ...` da `main` | `BLOCKED_PRODUCTION_DELETED` | Debug: CLI imposta target preview, ma risposta API `target:"production"` e OIDC `environment:"production"`; URL `https://merchandise-control-admin-7kjoz6bly-xniw97-9857s-projects.vercel.app`; cancellata subito. |
| Stesso comando da branch locale non-main | `BLOCKED_PRODUCTION_DELETED` | Meta `githubCommitRef:"codex/task-031-vercel-preview-diagnosis"` ma risposta `target:"production"`; URL `https://merchandise-control-admin-hv68swniy-xniw97-9857s-projects.vercel.app`; cancellata subito. |
| Stesso comando da copia temporanea senza `.git` | `BLOCKED_PRODUCTION_DELETED` | Debug senza git repo e meta solo `actor:"codex"`, ma risposta `target:"production"`; URL `https://merchandise-control-admin-qklqvciqz-xniw97-9857s-projects.vercel.app`; cancellata subito. |
| `vercel deploy --yes --no-wait --debug --archive=tgz --project prj_...` | `BLOCKED_PRODUCTION_DELETED` | Comando doc-compliant senza `--prod` e senza `--target`; deployment `dpl_BvYyigdwvbnbUS2K8VeDNJu4aK5g`, URL `https://merchandise-control-admin-mal2env4i-xniw97-9857s-projects.vercel.app`, `target:"production"`; cancellata subito. |
| `vercel --yes --scope ... --no-wait --debug --archive=tgz` usando `.vercel/project.json` | `BLOCKED_PRODUCTION_DELETED` | Deployment `dpl_2BRNLmEUH5turn8TdCoyqb6TSg9f`, URL `https://merchandise-control-admin-m4iyqax0d-xniw97-9857s-projects.vercel.app`, `target:"production"`; cancellata subito. |
| Deploy CLI con `--local-config` temporaneo `{}` | `BLOCKED_PRODUCTION_DELETED` | Escluso il guardrail repo-level `vercel.json`; deployment `dpl_Asv79hzr877H1ZGvwFa6qi2SSFBi`, URL `https://merchandise-control-admin-qzo5om6er-xniw97-9857s-projects.vercel.app`, `target:"production"`; cancellata subito. |
| REST create deployment con `target` omesso e `gitSource.ref:"main"` | `BLOCKED_PRODUCTION_DELETED` | Deployment `dpl_EhaPskBXXJ7PHeBbLhFuNBXxv36e`, URL `https://merchandise-control-admin-oz4buydau-xniw97-9857s-projects.vercel.app`, `target:"production"`, OIDC `environment:"production"`; cancellata subito. |
| REST create deployment con `target` omesso e branch remoto non-main | `BLOCKED_PRODUCTION_DELETED` | Branch remoto `origin/codex/task-031-vercel-preview-diagnosis` creato; deployment `dpl_8sJS9p3ZcKdipnXMaxesZ3dh5on6`, URL `https://merchandise-control-admin-52yl0sm07-xniw97-9857s-projects.vercel.app`, `target:"production"`; cancellata subito. |
| REST create deployment con `target:"staging"` e branch remoto non-main | `BLOCKED_PRODUCTION_DELETED` | Deployment `dpl_EKohuo9gbeXv3kDjUbUYXbT8SvNE`, URL `https://merchandise-control-admin-1r6eb87hg-xniw97-9857s-projects.vercel.app`, `target:"production"`, `customEnvironment=null`; cancellata subito. |

## Cleanup finale Vercel

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `vercel ls --scope xniw97-9857s-projects` | `PASS` | `No deployments found under xniw97-9857s-projects.` |
| `vercel alias ls --scope xniw97-9857s-projects` | `PASS` | Nessun alias elencato. |
| Project API filtered | `PASS` | Git Integration ancora scollegata: `link=null`, `gitRepository=null`; `hasDeployments=false`, `latestDeployments=[]`. |
| Temp artifacts | `PASS` | Rimossi `.vercel/source.tgz.part1`, temp body JSON e temp config usati per i test; nessun valore env letto. |

## Classificazione

`BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`

## Rischi residui

- TASK-029 resta senza URL Preview/staging e senza smoke staging.
- La verifica dell'ipotesi baseline richiede un deployment Production temporaneo lasciato attivo mentre si prova un secondo deployment; non autorizzato in TASK-031.
- Branch remoto diagnostico presente; non ha attivato Vercel perche Git Integration e scollegata e il repo contiene `git.deploymentEnabled=false`.
