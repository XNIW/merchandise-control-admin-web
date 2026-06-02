# TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation

## Informazioni generali

- ID: `TASK-030`
- Titolo: `Vercel deployment configuration diagnosis and safe main reconciliation`
- Stato: `EXECUTION`
- Fase attuale: `EXECUTION`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-02`
- Verdict corrente: `PENDING_MAIN_RECONCILIATION`
- Branch iniziale: `codex/task-029c-vercel-preview-e2e`
- Commit iniziale: `274deff TASK-029 prepare vercel preview path`

## Scope

Diagnosticare perche Vercel ha generato deployment `Production` da percorsi non-production, neutralizzare in modo reversibile il rischio di auto-deploy da push Git e, solo con gate anti-production soddisfatto, riconciliare Admin Web su `main`.

Non include:

- deploy production;
- uso di production come staging;
- rimozione env Production Vercel;
- lettura valori env decriptati;
- Supabase schema/migration/RLS/tipi;
- runtime POS, catalogo o Win7POS;
- sales sync.

## Diagnosi Vercel

Stato osservato prima della neutralizzazione:

- progetto Vercel: `xniw97-9857s-projects/merchandise-control-admin-web`;
- project id: `prj_4nMxezsLWdo9EVEdTLVJFM8edrnj`;
- team id: `team_38dhbiIM6z7VuxfyKi3kbTzd`;
- Git Integration: GitHub `XNIW/merchandise-control-admin-web`;
- production branch dal link GitHub: `main`;
- campo project top-level `productionBranch`: `null`;
- `live=false`;
- `hasDeployments=false`;
- deployment attivi: nessuno;
- alias attivi: nessuno;
- env ispezionate solo per nome/target/tipo, senza valori.

Il problema storico resta confermato da TASK-029C: il branch non-main `codex/task-029c-vercel-preview-e2e` aveva generato una deployment `Environment Production`, poi cancellata subito.

## Neutralizzazione

Azioni applicate:

- `vercel git disconnect --scope xniw97-9857s-projects`: Git Integration scollegata dal progetto Vercel.
- `vercel.json`: aggiunto guardrail versionato con `git.deploymentEnabled=false`.

Effetto atteso:

- Vercel non crea deployment quando vengono pushati commit al repository collegato in precedenza.
- Se la Git Integration verra ricollegata in futuro, il repository contiene comunque un guardrail esplicito che disabilita gli automatic deployments.

Ripristino manuale:

```bash
vercel git connect https://github.com/XNIW/merchandise-control-admin-web.git --scope xniw97-9857s-projects
```

Prima di ricollegare, rimuovere o modificare consapevolmente `git.deploymentEnabled=false` solo dentro un task dedicato con staging/production policy chiara.

## Stato TASK collegati

- `TASK-029` resta in `REVIEW` con staging HTTPS ancora bloccato: nessuna vera Preview/non-production e stata ottenuta.
- `TASK-022_023` non viene marcato `DONE`: resta `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW` con `PARKED_E2E_PENDING`.
- `TASK-024` resta `DEFERRED`.

## Check

I risultati sono registrati in `docs/TASKS/EVIDENCE/TASK-030/README.md`.

## Handoff

- Prossima fase prevista: `REVIEW`.
- Codex non marca il task `DONE`.
