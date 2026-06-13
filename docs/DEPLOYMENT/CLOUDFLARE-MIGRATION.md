# Cloudflare hosting migration

## Stato

- Stato corrente: `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Vercel: parcheggiato; `vercel.json` mantiene `git.deploymentEnabled=false`.
- OpenNext locale: `PASS_WITH_WARNINGS`, worker generato.
- Smoke Cloudflare/OpenNext locale: `PASS` con
  `npm run smoke:cloudflare:local`.
- Cloudflare Wrangler OAuth/account: `PASS`.
- Cloudflare staging workers.dev: `PASS`.
- Cloudflare staging deploy remoto: `PASS` via Wrangler locale.
- Cloudflare staging smoke remoto: `PASS`.
- GitHub Actions staging deploy: `PASS_GITHUB_ACTIONS_STAGING_DEPLOY_AND_SMOKE`.
- Cloudflare production: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Custom domain/DNS: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.
- Supabase Auth URL alignment: `BLOCKED_SUPABASE_AUTH_URLS_MANUAL_STEP`.
- WAF/rate limit/Access rules: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.
- GitHub environments: `PASS`, `cloudflare-staging` e
  `cloudflare-production` creati; production ha `required_reviewers`.
- Supabase staging: `PASS_GUARDRAIL_PARTIAL_TIMEOUT`; guardrail staging passa,
  ma `npx supabase projects list --output-format json` non ha concluso entro
  timeout controllato.

## Storico blocker 2026-06-12

Questi blocker erano veri nel preflight iniziale TASK-058 e restano nel runbook
per tracciabilita e scanner, ma sono stati riclassificati dopo l'unblock:

| Blocker storico | Stato aggiornato |
| --- | --- |
| `BLOCKED_CLOUDFLARE_API_TOKEN_MISSING` | `RESOLVED_GITHUB_ENV_SECRET_CONFIGURED`, secret `CLOUDFLARE_API_TOKEN` presente per nome in `cloudflare-staging` e `cloudflare-production`. |
| `BLOCKED_CLOUDFLARE_ACCOUNT_ID_MISSING` | `RESOLVED_GITHUB_ENV_SECRET_CONFIGURED`, secret `CLOUDFLARE_ACCOUNT_ID` presente per nome in `cloudflare-staging` e `cloudflare-production`. |
| `BLOCKED_SUPABASE_STAGING_UNKNOWN` | `PARTIAL`, guardrail staging passa con env process-only; verifica remota Supabase project-list non conclusa per hang. |

## Post-merge TASK-059

- TASK-058 e stato mergeato su `main` con commit `b93a6e4`.
- La run staging GitHub Actions post-rotazione `27450388578` ha passato build,
  deploy staging, verifica token e smoke staging; production e rimasta skipped.
- TASK-059 non rilancia deploy staging o production: aggiorna solo evidence e
  readiness con verifiche read-only.
- Supabase remote verification resta `PARTIAL_TIMEOUT`, non pienamente
  verificata.
- Custom domain/WAF/rate-limit restano `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.

## Decisioni operative vincolanti

- Prima fase obbligatoria: completare e verificare solo Cloudflare staging
  remoto su workers.dev.
- Production deploy e DNS cutover sono consentiti solo dopo tutti i gate
  staging `PASS`, WAF/rate-limit applicabili su zona reale, rollback safe
  definito e nuova conferma esplicita dell'utente.
- Se permessi Cloudflare, GitHub o Supabase mancano, non tentare workaround:
  fermarsi e aggiornare la checklist `BLOCKED`.
- Dominio staging custom desiderato: `UNKNOWN`.
- Dominio production desiderato: `UNKNOWN`.
- Cloudflare account: verificato via Wrangler OAuth e API. Zone/custom domain:
  non presenti nell'account corrente.
- Supabase staging/dev: usato solo con env process-only e guardrail; non
  salvare valori in repo/evidence.
- Supabase production project: non usare ne modificare senza conferma
  esplicita.
- CI/CD production: workflow preparato con `workflow_dispatch`, environment
  `cloudflare-production`, conferme manuali e required reviewer remoto.

## Checklist corrente

| Gate | Stato | Evidence |
| --- | --- | --- |
| Cloudflare token CI | `PASS_CONFIGURED_GITHUB_ENV_SECRET` | `gh secret list --env cloudflare-staging` e `--env cloudflare-production` mostrano `CLOUDFLARE_API_TOKEN`; valore mai letto. |
| Cloudflare account id | `PASS_CONFIGURED_GITHUB_ENV_SECRET` | `CLOUDFLARE_ACCOUNT_ID` presente per nome nei due GitHub environments; valore non hardcoded in repo. |
| Cloudflare zone/domain | `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED` | Cloudflare account con `zones count 0` e `workers/domains count 0`; nessuna route/custom domain in `wrangler.jsonc`. |
| GitHub staging environment | `PASS` | `cloudflare-staging` creato e popolato con secret/vars per nome. |
| GitHub production approval | `PASS` | `cloudflare-production` creato con `required_reviewers`; production deploy non eseguito. |
| Supabase staging target | `PASS_GUARDRAIL_PARTIAL_TIMEOUT` | `npm run db:staging:status` passa con env process-only; `npx supabase projects list --output-format json` resta senza output prima del timeout controllato. |
| Supabase staging secret Worker | `PASS_CONFIGURED_BY_NAME` | Worker staging contiene secret/env richiesti per nome; valori non letti. |
| Staging deploy remoto | `PASS_WRANGLER_LOCAL` | `npx wrangler deploy --env staging --keep-vars` completato localmente. |
| Staging deploy via GitHub Actions | `PASS_GITHUB_ACTIONS_STAGING_DEPLOY_AND_SMOKE` | Run staging reale `27449125119` PASS; run post-rotazione `27450388578` PASS con production skipped. |
| Staging smoke remoto | `PASS` | `npm run smoke:staging` passa `1/1` su workers.dev staging. |
| Rollback read-only | `ROLLBACK_READ_ONLY_VERIFIED` | `wrangler deployments list/status --env staging` passano. |
| Rollback staging reale | `ROLLBACK_STAGING_NOT_RUN_NO_PREVIOUS_SAFE_DEPLOYMENT` | Manca un precedente deployment safe noto. |
| WAF/rate-limit remoto | `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED` | Nessuna zona/custom domain disponibile. |

## Config repo

- `wrangler.jsonc` contiene:
  - worker production: `merchandise-control-admin-web`;
  - worker staging: `merchandise-control-admin-web-staging`;
  - `main = .open-next/worker.js`;
  - assets da `.open-next/assets`;
  - `nodejs_compat` e `global_fetch_strictly_public`;
  - `observability.enabled = true`;
  - ambienti `staging` e `production`.
- `.github/workflows/cloudflare.yml` contiene:
  - build Cloudflare su PR, `main`, `staging` e `workflow_dispatch`;
  - deploy staging solo da branch `staging` o `workflow_dispatch target=staging`;
  - deploy production solo da `workflow_dispatch target=production`, conferme
    `confirm_staging_gates_passed=true` e
    `confirm_user_approved_production=true`, con environment
    `cloudflare-production`.

## Variabili e secret

Non salvare valori reali in repository, log, evidence o screenshot.

| Nome | Classificazione | Dove configurare | Stato |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public safe, environment-specific | Cloudflare Worker staging secret/env; GitHub `cloudflare-staging` var | `PASS_BY_NAME`, valore redatto. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public safe, environment-specific | Cloudflare Worker staging secret/env; GitHub `cloudflare-staging` var | `PASS_BY_NAME`, valore redatto. |
| `SUPABASE_PROJECT_REF` | server config, non secret | Cloudflare Worker staging secret/env | `PASS_BY_NAME`, valore redatto. |
| `SUPABASE_SERVICE_ROLE_KEY` | server secret | Cloudflare Worker staging secret | `PASS_BY_NAME`, valore mai stampato. |
| `CLOUDFLARE_ACCOUNT_ID` | deploy config/secret per policy repo | GitHub Secret `cloudflare-staging` e `cloudflare-production` | `PASS_BY_NAME`, valore redatto. |
| `CLOUDFLARE_API_TOKEN` | deploy secret | GitHub Secret `cloudflare-staging` e `cloudflare-production` | `PASS_BY_NAME`, valore mai stampato. |
| `CLOUDFLARE_STAGING_URL` | public staging URL | GitHub `cloudflare-staging` var | `PASS_BY_NAME`. |

Comandi manuali ammessi per impostare secret Cloudflare staging, da eseguire
senza stampare i valori:

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --env staging
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --env staging
npx wrangler secret put SUPABASE_PROJECT_REF --env staging
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

Comandi production futuri, vietati nella prima fase e ammessi solo dopo gate
staging `PASS` piu conferma esplicita dell'utente:

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL --env production
npx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --env production
npx wrangler secret put SUPABASE_PROJECT_REF --env production
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
```

## Staging deploy

Prerequisiti attuali per ripetere deploy staging:

1. `CLOUDFLARE_API_TOKEN` disponibile nel GitHub environment o login Wrangler
   interattivo.
2. `CLOUDFLARE_ACCOUNT_ID` configurato nel GitHub environment.
3. Zone/domain staging identificato solo se si vuole custom domain; per ora
   workers.dev e sufficiente.
4. Secret staging configurati sul Worker
   `merchandise-control-admin-web-staging`.
5. Supabase staging/dev non-production guardrailato e confermato per il run.
6. GitHub environment `cloudflare-staging` configurato.

Comandi:

```bash
npm run security:scan
npm run test:foundation
npm run typecheck
npm run lint
npm run build
npm run cf:build
npm run smoke:cloudflare:local
npm run cf:deploy:staging
npx wrangler deploy --env staging --keep-vars
```

`npm run cf:deploy:staging` esegue `npm run cf:build` e poi
`npx wrangler deploy --env staging --keep-vars`, in modo da non cancellare le
variabili configurate in dashboard/GitHub environment.

Smoke remoto staging:

```bash
PLAYWRIGHT_BASE_URL="https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev" \
ALLOW_STAGING_E2E=yes \
CONFIRM_STAGING_E2E=yes \
npm run smoke:staging
```

Smoke curl read-only:

```bash
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/"
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/auth/login?next=/shop"
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/auth/login?next=/platform"
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/shop"
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/platform"
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/api/pos/sales/sync"
```

Aspettative:

- nessun `500`;
- nessuno stack trace;
- nessun secret nel body/header;
- auth guard visibile dove manca sessione;
- endpoint POS/API con metodo/status controllato.

## Production deploy

Non eseguire production finche non sono veri tutti questi gate:

- staging deploy remoto: `PASS`;
- staging smoke remoto: `PASS`;
- secrets production configurati per il target corretto;
- Supabase production target chiarito e confermato;
- dominio production confermato;
- GitHub environment `cloudflare-production` con required reviewers verificato;
- rollback plan pronto e punto rollback safe definito;
- WAF/rate-limit valutati su zona reale;
- conferma esplicita utente per production deploy e DNS cutover.

Nota CI/CD: production deployment da GitHub Actions richiede comunque
environment approval su `cloudflare-production`; TASK-058 non ha eseguito
deploy production.

Comandi solo dopo conferma e fuori dalla prima fase staging:

```bash
npm run cf:build
npx wrangler deploy --env production --keep-vars
```

DNS cutover production resta separato dal deploy Worker e richiede conferma
esplicita.

## Custom domain e DNS

Dominio richiesto ma non confermato:

- staging: `UNKNOWN`;
- production: `UNKNOWN`.

Stato account: nessuna Cloudflare zone/custom domain disponibile. Se il dominio
viene aggiunto a Cloudflare, configurare custom domain con `routes` e
`custom_domain: true` o dashboard Workers > Settings > Domains & Routes.

Non aggiungere route/domain in `wrangler.jsonc` finche il dominio reale non e
confermato.

## Supabase Auth URL alignment

Aggiornare manualmente Supabase Auth URL Configuration:

- Site URL staging: URL staging Cloudflare confermata.
- Redirect URLs staging:
  - `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/auth/callback`;
  - `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/**` solo se serve durante staging controllata.
- Site URL production: dominio production confermato.
- Redirect URLs production:
  - `https://<production-host>/auth/callback`;
  - preferire URL esatti in produzione.

Non usare production Supabase per staging senza conferma esplicita.

## WAF, rate limit e Access

Regole minime da applicare dopo dominio/zona:

- rate limit su `/auth/*`;
- rate limit su `/shop/staff-login`;
- rate limit su `/api/pos/*`;
- protezione/log dedicato per `/platform/operations`;
- log-first per nuove soglie, poi challenge/block dopo validazione;
- non proteggere tutto `/auth/login` con Cloudflare Access se impedisce ai
  clienti Shop Admin di entrare;
- valutare Cloudflare Access solo per Master Console su path/domain dedicato;
- procedure false-positive documentate in
  `docs/DEPLOYMENT/CLOUDFLARE-WAF-RATE-LIMIT.md`.

Stato corrente: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.

## Evidence da registrare

Per ogni deploy remoto salvare solo:

- worker name;
- URL workers.dev o custom domain;
- deployment/version id, se disponibile;
- timestamp;
- output redatto;
- smoke result;
- blocker residui.

Non salvare secret, token, key, password, PIN, JWT o valori `.env`.
