# Staging deployment

## Stato

- Task origine: `TASK-029`
- Data: `2026-06-01`
- Stato deploy pubblico HTTPS: `BLOCKED_VERCEL_PREVIEW_DEPLOY_REQUIRES_NON_PRODUCTION_PATH`
- No production: nessun deploy production deve essere eseguito da questo task.

## Blocker corrente

TASK-029B update 2026-06-01:

- CLI `vercel`: disponibile (`54.7.1`) e autenticata come `xniw97-9857`;
- progetto Vercel linkato: `xniw97-9857s-projects/merchandise-control-admin-web`;
- GitHub collegato al progetto Vercel: `XNIW/merchandise-control-admin-web`, production branch `main`;
- variabili Vercel `preview` configurate: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
- Supabase dev/staging usato: `merchandisecontrol-dev`;
- nessun valore env o secret salvato nel repository o in evidence.

Resta bloccato il deploy staging HTTPS perche i deploy manuali Vercel CLI da worktree locale sono stati creati come `target: production` e aliasati al dominio production anche con `--target=preview`. I deployment sono stati cancellati subito:

- `dpl_EBv8HEroVsKQk5YaQrapyWZxqbGf`: `DELETED`;
- `dpl_FVvS6QYv6FEiXutJrgLMJMM8qtz4`: `DELETED`;
- `dpl_6bGHetzA2uduq4hy8zMdiYrV2XYJ`: `DELETED`;
- `dpl_99aoNgtAJnCw3zTzKCcqQwBMP2ss`: `DELETED`.

Stato deployment attivi Vercel dopo cleanup: nessun deployment elencato dal progetto.

Per ottenere uno staging/preview reale senza production serve uno di questi percorsi:

- push autorizzato di un branch non-`main`, cosi GitHub/Vercel creano una Preview Deployment reale;
- altro provider/ambiente HTTPS non-production;
- piano/feature Vercel che consenta custom environment staging sul progetto.

Discovery iniziale storica:

- `.vercel/`: inizialmente assente, poi creato da `vercel link` ed escluso da git;
- `vercel.json`: assente;
- `netlify.toml`: assente;
- CLI `vercel`: inizialmente non disponibile nel PATH (`command not found`), poi installata globalmente.

Senza un percorso Preview/non-production verificabile non e possibile produrre una URL HTTPS staging accettabile senza violare il vincolo no production.

Review/fix 2026-06-01:

- `test -d .vercel`: exit `1`;
- `test -f vercel.json`: exit `1`;
- `test -f netlify.toml`: exit `1`;
- `command -v vercel`: exit `1`;
- URL HTTPS staging: `NOT_AVAILABLE`;
- smoke staging e Win7POS staging E2E: `NOT_RUN / BLOCKED_STAGING_CREDENTIALS`.

TASK-029B update 2026-06-01:

- `vercel --version`: `54.7.1`;
- `vercel whoami`: `xniw97-9857`;
- `vercel git connect https://github.com/XNIW/merchandise-control-admin-web.git`: `Connected`;
- `vercel api /v10/projects/merchandise-control-admin-web/env`: 3 env `preview` presenti, senza branch scope;
- `vercel api /v7/deployments?projectId=merchandise-control-admin-web`: nessun deployment attivo dopo cleanup;
- URL HTTPS staging: `NOT_AVAILABLE`;
- smoke staging e Win7POS staging E2E: `NOT_RUN / BLOCKED_VERCEL_PREVIEW_DEPLOY_REQUIRES_NON_PRODUCTION_PATH`.

## Variabili richieste

Configurare solo nell'ambiente staging/hosting, mai nel repository:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` deve restare server-side. Non deve essere esposta in client component, browser bundle, log, evidence o file di configurazione committati.

## Comandi previsti

Quando il progetto staging non-production sara collegato:

```bash
npm ci
npm run test:foundation
npm run typecheck
npm run lint
npm run security:scan
npm run build
vercel deploy
```

Usare solo preview/staging. Non usare `vercel --prod` in questo task. Su questo progetto, i deploy CLI manuali da worktree locale sono stati osservati come `target: production`; non ripetere quel percorso senza un guardrail non-production verificato.

## Checklist sicurezza

- No production.
- No dati clienti reali.
- No secret nel repository.
- No service-role nel browser.
- API POS esposte solo come Route Handler server-side/nodejs.
- API POS con `Cache-Control: no-store`.
- Smoke invalid payload su:
  - `POST /api/pos/auth/first-login`;
  - `POST /api/pos/session/heartbeat`;
  - `POST /api/pos/catalog/pull`.
- Errori senza token, secret, stack trace o dettagli DB.

## Smoke test staging

Solo dopo URL HTTPS reale:

```bash
curl -i "$STAGING_URL/"
curl -i -X POST "$STAGING_URL/api/pos/auth/first-login" -H "content-type: application/json" --data '{}'
curl -i -X POST "$STAGING_URL/api/pos/session/heartbeat" -H "content-type: application/json" --data '{}'
curl -i -X POST "$STAGING_URL/api/pos/catalog/pull" -H "content-type: application/json" --data '{}'
```

Verificare status controllato, `Cache-Control: no-store`, nessun leak di secret e nessun crash.

## Rollback manuale

- Se staging e Vercel preview: promuovere o riaprire il deployment preview precedente noto buono.
- Se staging usa altro hosting: ripubblicare l'ultimo artefatto build verificato o ripristinare il deployment precedente dal pannello provider.
- In caso di errore env: ruotare eventuali secret esposti e rimuovere il deployment affetto.
