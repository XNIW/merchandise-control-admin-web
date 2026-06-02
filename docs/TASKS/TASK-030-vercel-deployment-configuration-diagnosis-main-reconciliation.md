# TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation

## Informazioni generali

- ID: `TASK-030`
- Titolo: `Vercel deployment configuration diagnosis and safe main reconciliation`
- Stato: `DONE_WITH_NOTES`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `COMPLETE`
- Data apertura: `2026-06-02`
- Execution: `COMPLETED_BY_CODEX`
- Review finale: `COMPLETED_BY_CODEX_REVIEW`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Branch iniziale: `codex/task-029c-vercel-preview-e2e`
- Commit iniziale: `274deff TASK-029 prepare vercel preview path`
- Branch finale: `main`
- Commit main pre-review verificato: `71316e7 docs: record TASK-030 main push result`

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

## Review finale 2026-06-02

TASK-030 e stato verificato dopo il push su `main`:

- `main` allineato a `origin/main` su `71316e7` prima del commit documentale di review finale;
- working tree Admin Web pulito, nessun file staged e nessun diff inatteso;
- Vercel Git Integration ancora scollegata: `link=null`, `gitRepository=null`;
- Vercel senza deployment attivi e senza alias;
- `vercel.json` valido con `git.deploymentEnabled=false`;
- env Vercel osservate solo per nome/target/tipo, senza valori e senza rimozioni;
- check Admin Web passati: `security:scan`, `test:foundation`, `verify`, `git diff --check`;
- check Win7POS non invasivi passati: `git diff --check`, scanner bootstrap/catalog e build x86;
- scanner legacy `check-pos-online-client.ps1` ancora da riconciliare con il flusso TASK-029 basato su `PosOnlineBootstrapService`.

TASK-030 puo quindi essere chiuso con note. Questo non sblocca TASK-029: non esiste ancora una URL Preview/non-production e smoke staging / Win7POS E2E HTTPS restano non eseguiti.

## Handoff

- Prossima fase: `COMPLETE`.
- Classificazione finale: `DONE_RECONCILED_WITH_NOTES`.
- Note residue: Git Integration Vercel resta scollegata intenzionalmente; TASK-029 resta bloccato, TASK-022_023 resta parcheggiato, TASK-024 resta differito.
