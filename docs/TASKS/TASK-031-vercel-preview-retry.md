# TASK-031 - Vercel Preview retry after environment docs

## Informazioni generali

- ID: `TASK-031`
- Titolo: `Vercel Preview retry after environment docs`
- Stato: `REVIEW_BLOCKED`
- Fase attuale: `REVIEW`
- Responsabile attuale: `USER_REVIEW`
- Data apertura: `2026-06-02`
- Execution: `COMPLETED_BY_CODEX`
- Review: `PENDING_USER_REVIEW`
- Verdict corrente: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`
- Branch execution: `codex/task-031-vercel-preview-diagnosis`
- Branch remoto diagnostico: `origin/codex/task-031-vercel-preview-diagnosis`

## Scope

Ritentare la risoluzione del blocker Vercel Preview usando la documentazione ufficiale indicata dall'utente:

- Preview Environment: deploy CLI senza `-prod` dovrebbe creare Preview;
- Create Deployment REST API: `target` omesso dovrebbe risultare Preview, con `target=null` nella risposta;
- Custom Environments: verificare se staging/custom environment e disponibile.

Non include:

- uso di Production come staging;
- mantenere deployment Production attivi;
- rimozione env Production Vercel;
- lettura valori env/secret;
- ricollegare Git Integration senza guardrail;
- modifiche runtime Admin Web, POS, Supabase o Win7POS.

## Risultato

La Preview Vercel non e stata ottenuta.

La documentazione ufficiale conferma che il comportamento atteso sarebbe Preview per `vercel` senza `-prod` e per REST create-deployment con `target` omesso. Il progetto Vercel invece ha creato sempre deployment `target:"production"` e OIDC `environment:"production"`, anche quando:

- il comando CLI era `vercel deploy` senza `--prod` e senza `--target`;
- il progetto veniva risolto da `.vercel/project.json`, senza `--project`;
- il `vercel.json` repo-level veniva escluso usando una config temporanea vuota;
- la richiesta REST ometteva `target`;
- la richiesta REST puntava a un branch remoto non-main;
- la richiesta REST usava `target:"staging"`.

Ogni deployment Production inatteso e stato cancellato subito. Stato finale Vercel: nessun deployment attivo e nessun alias.

## Diagnosi corrente

Evidenza nuova rispetto a TASK-029/TASK-030:

- `previewDeploymentsDisabled=null`, quindi non risulta un flag esplicito di Preview disabilitata.
- Custom environments non disponibili sul piano corrente: endpoint custom environments con `accountLimit.total=0`, mentre la documentazione Vercel indica Custom Environments disponibili su Pro/Enterprise.
- Branch remoto non-main `origin/codex/task-031-vercel-preview-diagnosis` creato per test API; la Git Integration resta scollegata e `vercel.json` mantiene `git.deploymentEnabled=false`, quindi il push non ha attivato auto-deploy.
- REST API `target` omesso con branch non-main remoto ha comunque restituito `target:"production"`.
- REST API `target:"staging"` ha comunque restituito `target:"production"` e `customEnvironment=null`.

Ipotesi piu probabile:

- questo progetto Vercel, avendo `hasDeployments=false` / nessun deployment baseline, forza il primo deployment del progetto a `Production`, anche se la richiesta e non-production. Questa ipotesi non puo essere verificata fino in fondo senza lasciare temporaneamente un deployment Production baseline, cosa fuori scope e non autorizzata.

## Check

I risultati sono registrati in `docs/TASKS/EVIDENCE/TASK-031/README.md`.

## Rischi residui

- Nessuna URL Preview/non-production disponibile: TASK-029 resta bloccato.
- La sola ipotesi operativa rimasta richiede decisione esplicita dell'utente: autorizzare un deployment Production baseline temporaneo e verificare se il secondo deployment diventa Preview, oppure scegliere hosting HTTPS non-production alternativo.
- Branch remoto diagnostico presente: `origin/codex/task-031-vercel-preview-diagnosis`; non ha generato deployment Vercel perche Git Integration e scollegata.

## Handoff

- Prossima fase: `REVIEW`.
- Classificazione: `BLOCKED_NEEDS_USER_DECISION`.
- Opzioni consigliate:
  - chiedere supporto Vercel allegando l'evidence TASK-031;
  - autorizzare esplicitamente un test controllato con baseline Production temporanea, senza usarla come staging;
  - usare un provider/ambiente HTTPS non-production alternativo per sbloccare TASK-029;
  - passare a un piano Vercel con Custom Environment se si vuole una staging dedicata su Vercel.
