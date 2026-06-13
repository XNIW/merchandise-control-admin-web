# Staging deployment

## Stato

- Task origine: `TASK-029`
- Data: `2026-06-02`
- Stato deploy pubblico HTTPS: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`
- Stato Cloudflare/OpenNext: staging workers.dev `PASS` dopo TASK-058; custom
  domain/WAF/rate-limit restano `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.
- No production: nessun deploy production deve essere eseguito da questo task.
- Guardrail corrente: Git Integration Vercel disconnessa e `vercel.json` con `git.deploymentEnabled=false`.

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

TASK-029C update 2026-06-02:

- branch non-main Admin Web creato: `codex/task-029c-vercel-preview-e2e`;
- commit/push non-main per Vercel Git Integration: `274deff TASK-029 prepare vercel preview path`;
- `vercel ls --scope xniw97-9857s-projects` ha creato/osservato `https://merchandise-control-admin-gmip02vp7-xniw97-9857s-projects.vercel.app` come `Environment Production`;
- deployment cancellata subito con `vercel remove ... --yes --scope xniw97-9857s-projects`;
- verifica finale `vercel ls --scope xniw97-9857s-projects`: nessun deployment attivo;
- branch remoto `origin/codex/task-029c-vercel-preview-e2e` cancellato in review con `git push origin --delete codex/task-029c-vercel-preview-e2e`;
- progetto ancora collegato a GitHub `XNIW/merchandise-control-admin-web` con `productionBranch=main`, ma il percorso branch non-main non ha prodotto Preview;
- env Preview richieste presenti per nome; valori non riportati;
- env Production create automaticamente da Vercel/Supabase durante il tentativo osservate per nome/target e non rimosse senza decisione esplicita.

Per ottenere uno staging/preview reale senza production serve ora uno di questi percorsi:

- correggere configurazione Vercel/Git Integration che fa generare `Production` anche da branch non-`main`;
- Cloudflare/OpenNext staging remoto con `CLOUDFLARE_API_TOKEN`, worker `merchandise-control-admin-web-staging`, secret staging e smoke remoto;
- piano/feature Vercel che consenta custom environment staging sul progetto.

## Percorso Cloudflare/OpenNext staging

`wrangler.jsonc` contiene ambienti `staging` e `production`.

Staging Cloudflare corrente:

- worker: `merchandise-control-admin-web-staging`;
- URL workers.dev:
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`;
- dominio staging desiderato: `UNKNOWN`;
- Cloudflare account: `PASS_READ_ONLY`;
- Cloudflare zone/custom domain: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`;
- Supabase staging project: `PASS_GUARDRAIL_PARTIAL_TIMEOUT`, guardrail staging
  passa con env process-only ma `projects list` non conclude entro timeout;
- comando previsto per ripetere staging dopo autenticazione e secret:

```bash
npm run cf:build
npx wrangler deploy --env staging --keep-vars
```

Blocker corrente:

- `CLOUDFLARE_API_TOKEN`: `PASS_BY_NAME` negli environment GitHub, valore non
  letto;
- `CLOUDFLARE_ACCOUNT_ID`: `PASS_BY_NAME` negli environment GitHub, valore non
  letto;
- `npx wrangler whoami`: `PASS`, account utente verificato;
- `npx wrangler deployments list --env staging`: `ROLLBACK_READ_ONLY_VERIFIED`;
- `wrangler.jsonc`: nessun `account_id`, `routes` o custom domain configurato;
- `gh api .../environments/cloudflare-staging`: `PASS`;
- `gh api .../environments/cloudflare-production`: `PASS`, approval richiesto;
- custom domain: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`;
- DNS: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`;
- Supabase staging project:
  `PASS_GUARDRAIL_PARTIAL_TIMEOUT`;
- Supabase Auth URLs: `BLOCKED_SUPABASE_AUTH_URLS_MANUAL_STEP`;
- staging remote smoke: `PASS` nella run TASK-058 post-rotazione `27450388578`.

Decisione operativa aggiunta 2026-06-07: la prima fase obbligatoria e solo
Cloudflare staging remoto. Production deploy e DNS cutover sono fuori fase e
richiedono tutti i gate staging `PASS` piu conferma esplicita dell'utente.
Se permessi Cloudflare, GitHub o Supabase mancano, non tentare workaround:
produrre checklist `BLOCKED`.

Dettagli operativi: `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md`.
Rollback: `docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md`.

Discovery iniziale storica:

- `.vercel/`: inizialmente assente, poi creato da `vercel link` ed escluso da git;
- `vercel.json`: assente;
- `netlify.toml`: assente;
- CLI `vercel`: inizialmente non disponibile nel PATH (`command not found`), poi installata globalmente.

Senza un percorso Preview/non-production verificabile non e possibile produrre una URL HTTPS staging accettabile senza violare il vincolo no production. Il push di branch non-`main`, che era il percorso raccomandato dopo TASK-029B, e ora anch'esso bloccato perche genera `Production`.

TASK-030 neutralizzazione 2026-06-02:

- diagnosi read-only: project `live=false`, `hasDeployments=false`, deployment list vuota, alias list vuota;
- prima della neutralizzazione il project API mostrava `link.type=github`, repo `XNIW/merchandise-control-admin-web`, `link.productionBranch=main`, ma `productionBranch` top-level `null`;
- `vercel git disconnect --scope xniw97-9857s-projects` eseguito per impedire deployment automatici da push Git;
- verifica post-disconnect: `link=null`, `gitRepository=null`, `live=false`, `hasDeployments=false`, `latestDeployments=[]`;
- aggiunto `vercel.json` con `git.deploymentEnabled=false` come guardrail versionato se la Git Integration verra ricollegata;
- nessuna env e stata rimossa; valori env non letti e non salvati.

TASK-031 retry 2026-06-02:

- la documentazione Vercel Preview Environment indicata dall'utente conferma che `vercel` / `vercel deploy` senza `-prod` dovrebbe creare Preview;
- la documentazione REST create-deployment conferma che `target` omesso dovrebbe creare Preview, indicata in risposta come `target=null`;
- il progetto Vercel corrente continua invece a restituire `target="production"` e OIDC `environment="production"` per CLI senza `--prod`, CLI con `--target=preview`, REST `target` omesso su `main`, REST `target` omesso su branch remoto non-main e REST `target="staging"`;
- tutti i deployment Production inattesi del retry sono stati rimossi subito;
- custom environments non disponibili sul piano corrente (`accountLimit.total=0`, nessun ambiente custom);
- stato finale Vercel: nessun deployment attivo e nessun alias;
- classificazione aggiornata: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`;
- ipotesi residua non verificata per vincolo no-production: Vercel potrebbe richiedere un primo deployment Production baseline prima di generare Preview successive. Serve autorizzazione esplicita dell'utente o hosting HTTPS non-production alternativo.

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
- smoke staging e Win7POS staging E2E: `NOT_RUN / BLOCKED_VERCEL_PREVIEW_DEPLOY_REQUIRES_NON_PRODUCTION_PATH` storico, poi superseded da `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.

TASK-029C update 2026-06-02:

- `git push -u origin codex/task-029c-vercel-preview-e2e`: branch remoto creato;
- Vercel deployment da branch non-main: `BLOCKED_PRODUCTION_TARGET_DELETED`;
- URL prodotta e cancellata: `https://merchandise-control-admin-gmip02vp7-xniw97-9857s-projects.vercel.app`;
- branch remoto temporaneo: `DELETED`;
- `vercel ls --scope xniw97-9857s-projects`: nessun deployment attivo dopo cleanup;
- URL HTTPS Preview staging: `NOT_AVAILABLE`;
- smoke staging e Win7POS staging E2E: `NOT_RUN / BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.

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

Usare solo preview/staging. Non usare `vercel --prod` in questo task. Su questo progetto, i deploy CLI manuali da worktree locale e il push di branch Git non-main sono stati osservati come `Production`; non ripetere questi percorsi senza un guardrail non-production verificato. Attualmente i deploy automatici da Git sono neutralizzati perche la Git Integration e disconnessa e il repo contiene `git.deploymentEnabled=false`.

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
- Se staging usa Cloudflare: usare `docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md`.
- Se staging usa altro hosting: ripubblicare l'ultimo artefatto build verificato o ripristinare il deployment precedente dal pannello provider.
- In caso di errore env: ruotare eventuali secret esposti e rimuovere il deployment affetto.
